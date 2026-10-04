import { test, expect } from '@playwright/test';

// Hitting a wall shouldn't throw a car about: its body stays near the ground and roughly level.
async function boot(page, settings) {
  page.on('pageerror', e => { throw e; });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.addInitScript(s => localStorage.setItem('shwy_settings', JSON.stringify(s)), settings);
  await page.goto('/');
  await page.waitForFunction(() => window.SH && window.SH.G.state === 'title', null, { timeout: 60_000 });
  await page.evaluate(() => { const { G, goGarage, startMatch } = window.SH; goGarage(); startMatch(); G.countdown = 0; G.ais.length = 0; });
}
/** Drive the player from (x, z) at `yaw` and `speed` for two seconds; the worst visual lift, tilt and air time. */
const ram = (page, x, z, yaw, speed) => page.evaluate(([x, z, yaw, speed]) => {
  const { G, step } = window.SH, c = G.player;
  for (const o of G.cars) if (o !== c) { o.x = x + 60; o.z = z + 60; }
  c.reset(x, z, yaw); c.vx = Math.sin(yaw) * speed; c.vz = Math.cos(yaw) * speed;
  let lift = 0, tilt = 0, air = 0;
  for (let f = 0; f < 120; f++) {
    c.input = { throttle: 1, steer: 0, handbrake: false }; c.hp = 999; step(1 / 60, 1 / 60);
    lift = Math.max(lift, c.lift); tilt = Math.max(tilt, Math.acos(Math.min(1, c.up.y)) * 57.3); if (!c.grounded) air += 1 / 60;
  }
  return { lift, tilt, air };
}, [x, z, yaw, speed]);

test('Route 67: glancing and head-on wall hits stay planted', async ({ page }) => {
  test.slow();
  await boot(page, { mode: 'race', map: 'route67', quality: 'low' });
  for (const [k, ang, speed] of [[0, 0.6, 40], [4, 0.35, 45], [2, 1.2, 30]]) {
    const at = await page.evaluate(([k]) => { const p = window.SH.G.map.course.sections[k].paths[0], i = 25; return [p.x[i], p.z[i], Math.atan2(p.tx[i], p.tz[i])]; }, [k]);
    const r = await ram(page, at[0], at[1], at[2] + ang, speed);
    expect(r.lift, `section ${k}`).toBeLessThan(1); expect(r.tilt, `section ${k}`).toBeLessThan(25); expect(r.air, `section ${k}`).toBeLessThan(0.2);
  }
});

test('Ghost Town: driving into the canyon wall stays planted', async ({ page }) => {
  await boot(page, { mode: 'deathmatch', map: 'ghost-town', quality: 'low' });
  for (const a of [0.9, 2.4, -1.9]) {
    const r = await ram(page, Math.sin(a) * 150, Math.cos(a) * 150, a + 0.3, 40);
    expect(r.lift, `angle ${a}`).toBeLessThan(1); expect(r.tilt, `angle ${a}`).toBeLessThan(30);
  }
});

test('ramps still launch cars', async ({ page }) => {
  await boot(page, { mode: 'deathmatch', map: 'ghost-town', quality: 'low' });
  // the ramp west of town faces +x: run up it from behind
  const r = await ram(page, -125, 0, Math.PI / 2, 40);
  expect(r.air).toBeGreaterThan(0.4);
});

test('the afterburner raises top speed', async ({ page }) => {
  await boot(page, { mode: 'deathmatch', map: 'ghost-town', quality: 'low', car: 'scorcher' });
  const top = boost => page.evaluate(boost => {
    const { G, step } = window.SH, c = G.player;
    for (const o of G.cars) if (o !== c) { o.x = 150; o.z = 150; }
    c.reset(-170, 0, Math.PI / 2); c.vx = c.def.max; c.vz = 0; // along the highway, already at top speed
    let v = 0;
    for (let f = 0; f < 50; f++) { if (boost) c.boost = 1; c.input = { throttle: 1, steer: 0, handbrake: false }; step(1 / 60, 1 / 60); v = Math.max(v, c.speed); }
    return v / c.def.max;
  }, boost);
  expect(await top(false)).toBeLessThan(1.05);
  expect(await top(true)).toBeGreaterThan(1.2);
});
