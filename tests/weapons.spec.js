import { test, expect } from '@playwright/test';

// Weapon rules, checked in a live match with every opponent's AI switched off.
test.beforeEach(async ({ page }) => {
  page.on('pageerror', e => { throw e; });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.goto('/');
  await page.waitForFunction(() => window.SH && window.SH.G.state === 'title', null, { timeout: 60_000 });
  await page.evaluate(() => {
    const { G, goGarage, startMatch } = window.SH;
    goGarage(); startMatch(); G.countdown = 0; G.ais.length = 0;
    for (const c of G.cars) c.input = { throttle: 0, steer: 0, handbrake: true };
  });
});
const run = (page, s) => page.evaluate(s => { for (let i = 0; i < s * 60; i++) window.SH.step(1 / 60, 1 / 60); }, s);

test('a car carries three weapons; a fourth replaces the one it has least of', async ({ page }) => {
  const r = await page.evaluate(() => {
    const { G, combat } = window.SH, p = G.player;
    p.ammo.missile = 0; p.weapon = null;
    for (const w of ['missile', 'rockets', 'mortar']) combat.giveAmmo(p, w);
    p.ammo.rockets = 1; p.weapon = 'missile';
    const dropped = combat.giveAmmo(p, 'mines');
    return { dropped, held: Object.keys(p.ammo).filter(w => p.ammo[w] > 0).sort() };
  });
  expect(r.dropped).toBe('rockets');
  expect(r.held).toEqual(['mines', 'missile', 'mortar']);
});

test('every weapon and combo fires without errors', async ({ page }) => {
  const fired = await page.evaluate(() => {
    const { G, step } = window.SH, p = G.player, out = [];
    for (const w of ['missile', 'rockets', 'mortar', 'mines', 'flame']) for (const combo of [0, 1, 2]) {
      if (w === 'flame' && combo === 0) continue;
      p.ammo[w] = 10; p.weapon = w; p.cdW = 0; p.wFire = true; p.wCombo = combo;
      const before = p.ammo[w]; step(1 / 60, 1 / 60); out.push([w, combo, before - p.ammo[w]]);
      for (let i = 0; i < 90; i++) step(1 / 60, 1 / 60);
      p.ammo[w] = 0;
    }
    return out;
  });
  for (const [w, combo, spent] of fired) expect(spent, `${w} combo ${combo}`).toBe(combo ? 3 : 1);
});

test('a decoy flare pulls homing missiles off its car', async ({ page }) => {
  const r = await page.evaluate(() => {
    const { G, step, combat } = window.SH, p = G.player, foe = G.cars[1];
    // park the opponent 40 m straight ahead of the player, facing it, and fire a missile at the player
    foe.x = p.x + Math.sin(p.yaw) * 40; foe.z = p.z + Math.cos(p.yaw) * 40; foe.y = p.y; foe.vx = foe.vz = 0; foe.yaw = p.yaw + Math.PI; step(1 / 60, 1 / 60);
    foe.ammo.missile = 5; foe.weapon = 'missile'; foe.cdW = 0; foe.wFire = true; foe.wCombo = 0;
    step(1 / 60, 1 / 60);
    const m = combat.PROJ.find(q => q.type === 'missile'); const aimedAtPlayer = m && m.target === p;
    p.ammo.missile = 3; p.weapon = 'missile'; p.cdW = 0; p.wFire = true; p.wCombo = 2;
    step(1 / 60, 1 / 60);
    return { aimedAtPlayer, chasing: m.target && m.target.type };
  });
  expect(r.aimedAtPlayer).toBe(true);
  expect(r.chasing).toBe('flare');
});

test('mines: at most six live per car, and smoke breaks a missile lock', async ({ page }) => {
  const mines = await page.evaluate(() => {
    const { G, step, combat } = window.SH, p = G.player;
    p.ammo.mines = 8; p.weapon = 'mines';
    for (let i = 0; i < 8; i++) { p.cdW = 0; p.wFire = true; p.wCombo = 0; step(1 / 60, 1 / 60); }
    return combat.MINES.filter(m => m.owner === p).length;
  });
  expect(mines).toBe(6);
  const lost = await page.evaluate(() => {
    const { G, step, combat } = window.SH, p = G.player, foe = G.cars[1];
    foe.x = p.x + Math.sin(p.yaw) * 45; foe.z = p.z + Math.cos(p.yaw) * 45; foe.y = p.y; foe.vx = foe.vz = 0; foe.yaw = p.yaw + Math.PI; step(1 / 60, 1 / 60);
    foe.ammo.missile = 5; foe.weapon = 'missile'; foe.cdW = 0; foe.wFire = true; foe.wCombo = 0;
    step(1 / 60, 1 / 60);
    const m = combat.PROJ.find(q => q.type === 'missile');
    combat.SMOKES.push({ x: (p.x + foe.x) / 2, z: (p.z + foe.z) / 2, r: 11, t: 6 });
    for (let i = 0; i < 40 && m.target; i++) step(1 / 60, 1 / 60);
    return m.target === null;
  });
  expect(lost).toBe(true);
  await run(page, 1);
});
