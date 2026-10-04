import { test, expect } from '@playwright/test';

// Race rules from Death Race: plates (sword, shield, skull), the hazards skulls set off, rubber banding and slipstreams.
test.beforeEach(async ({ page }) => {
  test.slow(); // the first race builds the canyon
  page.on('pageerror', e => { throw e; });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.addInitScript(() => localStorage.setItem('shwy_settings', JSON.stringify({ mode: 'race', map: 'route67', opponents: 5, quality: 'low', difficulty: 1 })));
  await page.goto('/');
  await page.waitForFunction(() => window.SH && window.SH.G.state === 'title', null, { timeout: 60_000 });
  await page.evaluate(() => { const { G, goGarage, startMatch } = window.SH; goGarage(); startMatch(); G.countdown = 0; G.ais.length = 0; });
});

// park the player on the first armed plate of a type (keeping its race progress honest) and let it take it
const onPlate = (page, type, where) => page.evaluate(([type, where]) => {
  const { G, step, plates } = window.SH, p = G.player, course = G.map.course;
  const pl = plates.find(q => q.type === type && q.armed && (!where || q.tag.path.name === where));
  const k = course.sections.findIndex(s => s.paths.includes(pl.tag.path));
  const keep = { mgLocked: p.mgLocked };
  p.reset(pl.x, pl.z, pl.yaw); Object.assign(p, keep);
  p.race.progress = { section: k, path: course.sections[k].paths.indexOf(pl.tag.path), i: pl.tag.i, s: 0, lap: 1 };
  step(1 / 60, 1 / 60);
  return { armed: pl.armed };
}, [type, where]);

test('the machine gun is locked until a sword plate, which also hands out a heavy weapon', async ({ page }) => {
  const before = await page.evaluate(() => {
    const { G, step, combat } = window.SH, p = G.player, t = G.cars[1];
    t.reset(p.x + Math.sin(p.yaw) * 20, p.z + Math.cos(p.yaw) * 20, p.yaw); t.mgLocked = true;
    const n = combat.PROJ.length; for (let i = 0; i < 30; i++) { p.mgHeld = true; step(1 / 60, 1 / 60); }
    return { locked: G.cars.every(c => c.mgLocked), shots: combat.PROJ.length - n };
  });
  expect(before.locked).toBe(true); expect(before.shots).toBe(0);
  const r = await onPlate(page, 'sword');
  const after = await page.evaluate(() => { const p = window.SH.G.player; return { locked: p.mgLocked, heavy: Object.values(p.ammo).some(a => a > 0) }; });
  expect(r.armed).toBe(false); // the plate went dark
  expect(after.locked).toBe(false); expect(after.heavy).toBe(true);
});

test('a shield plate takes three quarters off the damage for a while', async ({ page }) => {
  await onPlate(page, 'shield');
  const r = await page.evaluate(() => {
    const { G, damageCar, step } = window.SH, p = G.player, hp = p.hp;
    damageCar(p, 40, null, 'blast'); const shielded = hp - p.hp;
    const g = G.map.course.grid(1)[0], t = p.shieldT; p.reset(g.x, g.z, g.yaw); p.shieldT = t; // off the plate, or it shields you again when it lights up
    for (let i = 0; i < 60 * 9; i++) step(1 / 60, 1 / 60);
    const hp2 = p.hp; damageCar(p, 40, null, 'blast');
    return { shielded, after: hp2 - p.hp };
  });
  expect(r.shielded).toBeCloseTo(10, 0); expect(r.after).toBeCloseTo(40, 0);
});

test('a skull sets off the next hazard ahead', async ({ page }) => {
  await onPlate(page, 'skull', 'Desert flats');
  const r = await page.evaluate(() => { const { hazards } = window.SH; return { rocks: hazards.ROCKS.length, truck: !!hazards.truck }; });
  expect(r.rocks > 0 || r.truck).toBe(true);
});

test('a rockfall hurts whoever is under it and leaves boulders on the road', async ({ page }) => {
  const r = await page.evaluate(() => {
    const { G, step, hazards } = window.SH, site = G.map.hazards.find(h => h.kind === 'rockfall'), d = site.drops[0], victim = G.cars[2], by = G.cars[3];
    victim.reset(d.tx, d.tz, 0); const hp = victim.hp;
    hazards.triggerHazard(site, by);
    for (let i = 0; i < 60 * 6; i++) { victim.x = d.tx; victim.z = d.tz; victim.vx = victim.vz = 0; step(1 / 60, 1 / 60); }
    const resting = hazards.ROCKS.filter(k => k.phase === 'rest').length;
    return { lost: hp - victim.hp, credit: victim.lastHitBy === by, resting, of: site.drops.length };
  });
  expect(r.lost).toBeGreaterThan(25); expect(r.credit).toBe(true);
  expect(r.resting).toBe(r.of);
});

test('the wrong-way truck flattens what it meets', async ({ page }) => {
  const r = await page.evaluate(() => {
    const { G, step, hazards } = window.SH, site = G.map.hazards.find(h => h.kind === 'truck'), victim = G.cars[2], by = G.cars[3];
    const m = site.route.x.length >> 1; victim.reset(site.route.x[m], site.route.z[m], 0); const hp = victim.hp;
    hazards.triggerHazard(site, by);
    let gone = false; for (let i = 0; i < 60 * 40 && !gone; i++) { step(1 / 60, 1 / 60); gone = !hazards.truck; }
    return { lost: hp - victim.hp, credit: victim.lastHitBy === by || victim.wreckedBy === by, gone };
  });
  expect(r.lost).toBeGreaterThan(20); expect(r.credit).toBe(true); expect(r.gone).toBe(true);
});

test('rubber banding: bots behind you speed up, bots ahead ease off; off in settings, it stops', async ({ page }) => {
  const r = await page.evaluate(() => {
    const { G, step } = window.SH, p = G.player, [behind, ahead] = [G.cars[1], G.cars[2]];
    const set = () => { p.race.progress.lap = 2; behind.race.progress.lap = 1; ahead.race.progress.lap = 3; behind.race.progress.s = ahead.race.progress.s = p.race.progress.s; };
    set(); step(1 / 60, 1 / 60); const on = { behind: behind.speedK, ahead: ahead.speedK };
    G.settings.rubber = 'off'; set(); step(1 / 60, 1 / 60); const off = { behind: behind.speedK, ahead: ahead.speedK };
    return { on, off };
  });
  // Normal: up to 8% either way, in full at a lap's gap
  expect(r.on.behind / r.off.behind).toBeCloseTo(1.08, 3); expect(r.on.ahead / r.off.ahead).toBeCloseTo(0.92, 3);
});

test('tucked in behind another car, you get a slipstream', async ({ page }) => {
  const r = await page.evaluate(() => {
    const { G, step } = window.SH, p = G.player, o = G.cars[1], course = G.map.course, path = course.sections[0].paths[0], i = 40, yaw = Math.atan2(path.tx[i], path.tz[i]);
    p.reset(path.x[i], path.z[i], yaw); o.reset(path.x[i + 4], path.z[i + 4], yaw);
    for (let f = 0; f < 40; f++) { for (const c of [p, o]) { c.vx = Math.sin(yaw) * 30; c.vz = Math.cos(yaw) * 30; } step(1 / 60, 1 / 60); }
    return { k: p.speedK, draft: p.draft };
  });
  expect(r.draft).toBeGreaterThan(0.9); expect(r.k).toBeGreaterThan(1.05);
});

test("race bots are matched to the player's car, not stuck with their own top speed", async ({ page }) => {
  const r = await page.evaluate(() => {
    const { G, step } = window.SH; G.settings.rubber = 'off'; step(1 / 60, 1 / 60);
    const p = G.player; return G.cars.filter(c => !c.isPlayer).map(c => c.def.max * c.speedK / (p.def.max * 0.99));
  });
  for (const k of r) { expect(k).toBeGreaterThan(0.96); expect(k).toBeLessThan(1.04); }
});
