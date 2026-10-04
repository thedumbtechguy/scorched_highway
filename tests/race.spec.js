import { test, expect } from '@playwright/test';

// Route 67: built on the first race, then laps, finishing, wrecks that respawn, the gorge and wrong-way warnings.
test.beforeEach(async ({ page }) => {
  test.slow(); // the first race builds the canyon
  page.on('pageerror', e => { throw e; });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.addInitScript(() => localStorage.setItem('shwy_settings', JSON.stringify({ mode: 'race', map: 'route67', opponents: 5, quality: 'low' })));
  await page.goto('/');
  await page.waitForFunction(() => window.SH && window.SH.G.state === 'title', null, { timeout: 60_000 });
  await page.evaluate(() => { const { G, goGarage, startMatch } = window.SH; goGarage(); startMatch(); G.countdown = 0; window.__ais = G.ais.slice(); G.ais.length = 0; });
});

test('six cars start on the grid behind the line, on the track', async ({ page }) => {
  const r = await page.evaluate(() => {
    const { G } = window.SH;
    return { n: G.cars.length, offTrack: G.cars.filter(c => G.map.blocked(c.x, c.z, 0)).length, laps: G.cars.map(c => c.race.progress.lap), spread: Math.min(...G.cars.flatMap((a, i) => G.cars.slice(i + 1).map(b => Math.hypot(a.x - b.x, a.z - b.z)))) };
  });
  expect(r.n).toBe(6); expect(r.offTrack).toBe(0); expect(r.laps).toEqual([0, 0, 0, 0, 0, 0]);
  expect(r.spread).toBeGreaterThan(3); // nobody stacked on anyone
});

test('driving three laps finishes the race and shows the results', async ({ page }) => {
  await page.evaluate(() => {
    // carry the player round the main path of every section, sample by sample, three times
    const { G, step } = window.SH, p = G.player, course = G.map.course;
    for (let lap = 0; lap < 3; lap++) for (const sec of course.sections) {
      const path = sec.paths[sec.paths.length - 1]; // the safe branch at each fork
      for (let i = 0; i < path.x.length; i += 2) { p.x = path.x[i]; p.z = path.z[i]; p.yaw = Math.atan2(path.tx[i], path.tz[i]); p.vx = p.vz = 0; p.hp = p.def.hp; step(1 / 60, 1 / 60); }
    }
    for (let i = 0; i < 20; i++) { const s = course.sections[0].paths[0]; p.x = s.x[i]; p.z = s.z[i]; step(1 / 60, 1 / 60); }
    for (let i = 0; i < 400 && G.state !== 'over'; i++) step(1 / 60, 1 / 60);
  });
  expect(await page.evaluate(() => window.SH.G.player.race.lapTimes.length)).toBe(3);
  await expect(page.locator('#over')).toBeVisible();
  await expect(page.locator('#overTitle')).toHaveText('Winner');
  await expect(page.locator('#rTiles')).toContainText('Best lap');
  await expect(page.locator('#againBtn')).toHaveText('Race again');
});

test('a wreck respawns three seconds later at the start of that stretch, with half armour and no heavy weapons', async ({ page }) => {
  const r = await page.evaluate(() => {
    const { G, step, damageCar } = window.SH, p = G.player;
    p.ammo.rockets = 8; p.weapon = 'rockets';
    damageCar(p, 9999, G.cars[1]);
    const dead = !p.alive;
    for (let i = 0; i < 60 * 3.2; i++) step(1 / 60, 1 / 60);
    return { dead, alive: p.alive, hp: p.hp / p.def.hp, rockets: p.ammo.rockets, onTrack: !G.map.blocked(p.x, p.z, 0) };
  });
  expect(r.dead).toBe(true); expect(r.alive).toBe(true); expect(r.hp).toBe(0.5); expect(r.rockets).toBe(0); expect(r.onTrack).toBe(true);
});

test('dropping into the gorge wrecks the car; driving backwards warns', async ({ page }) => {
  const r = await page.evaluate(() => {
    const { G, step } = window.SH, p = G.player, course = G.map.course, jump = course.sections.flatMap(s => s.paths).find(q => q.gap);
    const i = jump.s.findIndex(v => v > (jump.gap[0] + jump.gap[1]) / 2);
    const k = course.sections.findIndex(s => s.paths.includes(jump));
    p.race.progress = { section: k, path: course.sections[k].paths.indexOf(jump), i, s: 0, lap: 1 }; p.x = jump.x[i]; p.z = jump.z[i];
    for (let f = 0; f < 120 && p.alive; f++) step(1 / 60, 1 / 60);
    const fell = !p.alive;
    for (let f = 0; f < 60 * 3.2; f++) step(1 / 60, 1 / 60);
    // now reverse at speed against the direction of the track
    const [hx, hz] = course.heading(p.race.progress); p.yaw = Math.atan2(-hx, -hz);
    for (let f = 0; f < 90; f++) { p.vx = -hx * 10; p.vz = -hz * 10; p.yaw = Math.atan2(-hx, -hz); step(1 / 60, 1 / 60); }
    return { fell, back: p.alive, wrong: p.race.wrongT };
  });
  expect(r.fell).toBe(true); expect(r.back).toBe(true); expect(r.wrong).toBeGreaterThan(1);
});

test('the bots race: after a minute every one has got past the first fork', async ({ page }) => {
  const sections = await page.evaluate(() => {
    const { G, step } = window.SH;
    G.ais.push(...window.__ais);
    for (let f = 0; f < 60 * 60; f++) { G.player.input = { throttle: 0, steer: 0, handbrake: true }; step(1 / 60, 1 / 60); }
    return G.cars.filter(c => !c.isPlayer).map(c => c.race.progress.lap * 10 + c.race.progress.section);
  });
  for (const s of sections) expect(s).toBeGreaterThanOrEqual(12); // lap 1, section 2 or later
});

test('off the cliff road: you land on the boulder alley below, still running', async ({ page }) => {
  const r = await page.evaluate(() => {
    const { G, step } = window.SH, p = G.player, course = G.map.course, paths = course.sections.flatMap(s => s.paths);
    const cliff = paths.find(q => q.name === 'Cliff road'), k = course.sections.findIndex(s => s.paths.includes(cliff)), i = Math.round(cliff.x.length * 0.45);
    // face the drop (the open side) and drive off
    const yaw = Math.atan2(cliff.tx[i], cliff.tz[i]) - cliff.open * Math.PI / 2;
    p.reset(cliff.x[i], cliff.z[i], yaw); p.race.progress = { section: k, path: course.sections[k].paths.indexOf(cliff), i, s: 0, lap: 1 };
    const top = p.y;
    // the player's input comes from the controls each frame, so push it over the edge instead
    for (let f = 0; f < 60 * 3; f++) { if (f < 40) { p.vx = Math.sin(yaw) * 12; p.vz = Math.cos(yaw) * 12; } step(1 / 60, 1 / 60); }
    return { top, y: p.y, alive: p.alive, on: course.sections[p.race.progress.section].paths[p.race.progress.path].name };
  });
  expect(r.top).toBeGreaterThan(15); // it really was up on the ledge
  expect(r.alive).toBe(true);
  expect(r.on).toBe('Boulder alley');
  expect(r.y).toBeLessThan(5);
});

test('sinkholes wreck you; boulders on the road stop you', async ({ page }) => {
  const r = await page.evaluate(() => {
    const { G, step } = window.SH, p = G.player, { rocks, holes } = G.map.obstacles;
    const h = holes[0]; p.reset(h.x, h.z, 0);
    let fell = false; for (let f = 0; f < 120 && !fell; f++) { step(1 / 60, 1 / 60); fell = !p.alive; }
    for (let f = 0; f < 60 * 3.2; f++) step(1 / 60, 1 / 60); // respawn
    const rock = rocks[0]; p.reset(rock.x - 20, rock.z, Math.PI / 2);
    let closest = 99; for (let f = 0; f < 90; f++) { if (f < 50) { p.vx = 20; p.vz = 0; } step(1 / 60, 1 / 60); closest = Math.min(closest, Math.hypot(p.x - rock.x, p.z - rock.z)); }
    return { fell, closest, r: rock.r };
  });
  expect(r.fell).toBe(true);
  expect(r.closest).toBeGreaterThan(r.r); // never drove through it
  expect(r.closest).toBeLessThan(r.r + 4); // but did reach it
});

test('races have weapon crates on the course', async ({ page }) => {
  const r = await page.evaluate(() => {
    const { G, step, pickups } = window.SH, p = G.player;
    const here = pickups.filter(k => G.map.x0 <= k.x && k.x < G.map.x1 && k.pool.includes('missile'));
    const crate = here[0]; p.reset(crate.x, crate.z, 0);
    step(1 / 60, 1 / 60);
    return { count: here.length, took: !crate.active, armed: Object.values(p.ammo).some(a => a > 0) };
  });
  expect(r.count).toBeGreaterThan(4); expect(r.took).toBe(true); expect(r.armed).toBe(true);
});
