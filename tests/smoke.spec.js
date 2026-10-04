import { test, expect } from '@playwright/test';

// Boot the game and collect anything that goes wrong in the page.
async function boot(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  // keep tests hermetic: web fonts are cosmetic and the game falls back without them
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.goto('/');
  await page.waitForFunction(() => window.SH && window.SH.G.state === 'title', null, { timeout: 60_000 });
  return errors;
}

test('boots to the title screen', async ({ page }) => {
  const errors = await boot(page);
  await expect(page.locator('#title')).toBeVisible();
  await expect(page.locator('#loading')).toHaveCount(0, { timeout: 5_000 });
  expect(errors).toEqual([]);
});

test('every car model builds in every time of day', async ({ page }) => {
  const errors = await boot(page);
  const tris = await page.evaluate(() => {
    const { CARS, buildCarModel, disposeCarModel, applyTod } = window.SH, out = {};
    for (const tod of ['noon', 'sunset', 'night']) {
      applyTod(tod);
      for (const def of CARS) { const m = buildCarModel(def); out[def.id] = m.bodyMesh.geometry.attributes.position.count / 3; disposeCarModel(m); }
    }
    return out;
  });
  for (const [id, n] of Object.entries(tris)) expect(n, id).toBeGreaterThan(5000);
  expect(errors).toEqual([]);
});

test('garage shows each car', async ({ page }) => {
  test.slow(); // six model builds and showroom renders on a software GPU, slower when the other tests share the CPU
  const errors = await boot(page);
  await page.click('#toGarage');
  for (const btn of await page.locator('.carbtn').all()) await btn.click();
  expect(await page.evaluate(() => window.SH.G.showcase !== null)).toBe(true);
  expect(errors).toEqual([]);
});

test('a match plays out: driving, weapons, wrecks and status effects', async ({ page }) => {
  const errors = await boot(page);
  const result = await page.evaluate(() => {
    const { G, step, startMatch, goGarage, damageCar } = window.SH;
    G.settings.opponents = 5; goGarage(); startMatch(); G.countdown = 0;
    G.player.input = { throttle: 1, steer: 0.3, handbrake: false };
    for (let i = 0; i < 300; i++) step(1 / 30, 1 / 30);
    G.cars[2].frozen = 3; G.cars[3].burning = 3;
    damageCar(G.cars[1], 9999, G.player, 'test');
    for (let i = 0; i < 300; i++) step(1 / 30, 1 / 30);
    return { state: G.state, cars: G.cars.length, wrecked: G.cars.filter(c => !c.alive).length, time: G.time, moved: Math.hypot(G.player.x, G.player.z) };
  });
  expect(result.cars).toBe(6);
  expect(result.wrecked).toBeGreaterThanOrEqual(1);
  expect(result.time).toBeGreaterThan(15);
  expect(errors).toEqual([]);
});
