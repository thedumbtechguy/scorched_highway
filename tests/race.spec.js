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
    const { G, step } = window.SH, p = G.player, course = G.map.course, jump = course.sections[3].paths[0];
    const i = jump.s.findIndex(v => v > (jump.gap[0] + jump.gap[1]) / 2);
    p.race.progress = { section: 3, path: 0, i, s: 0, lap: 1 }; p.x = jump.x[i]; p.z = jump.z[i];
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
