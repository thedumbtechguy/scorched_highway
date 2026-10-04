import { test, expect } from '@playwright/test';

const fonts = r => r.fulfill({ status: 200, contentType: 'text/css', body: '' });
async function match(page, settings = {}) {
  page.on('pageerror', e => { throw e; });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, fonts);
  await page.addInitScript(s => localStorage.setItem('shwy_settings', JSON.stringify(s)), settings);
  await page.goto('/');
  await page.waitForFunction(() => window.SH && window.SH.G.state === 'title', null, { timeout: 60_000 });
  await page.evaluate(() => { const { G, goGarage, startMatch } = window.SH; goGarage(); startMatch(); G.countdown = 0; G.ais.length = 0; });
}
const step = (page, n = 1) => page.evaluate(n => { for (let i = 0; i < n; i++) window.SH.step(1 / 60, 1 / 60); }, n);
/** Park opponent 1 straight ahead of the player at distance d. */
const parkAhead = (page, d) => page.evaluate(d => window.SH.testPark(d), d);

test('combo keys fire the attack and defensive combos', async ({ page }) => {
  await match(page);
  const ammo = () => page.evaluate(() => window.SH.G.player.ammo.rockets);
  await page.evaluate(() => { const p = window.SH.G.player; p.ammo.rockets = 10; p.weapon = 'rockets'; });
  await page.keyboard.press('KeyI'); await step(page);
  expect(await ammo()).toBe(7);
  await page.evaluate(() => { window.SH.G.player.cdW = 0; });
  await page.keyboard.press('Comma'); await step(page);
  expect(await ammo()).toBe(4);
  await page.evaluate(() => { window.SH.G.player.cdW = 0; });
  await page.keyboard.press('KeyK'); await step(page);
  expect(await ammo()).toBe(3);
});

test('Tab picks the car most ahead first, then cycles', async ({ page }) => {
  await match(page);
  await parkAhead(page, 30);
  await page.keyboard.press('Tab'); await step(page);
  const first = await page.evaluate(() => window.SH.G.player.pref === window.SH.G.cars[1]);
  await page.keyboard.press('Tab'); await step(page);
  const second = await page.evaluate(() => { const { G } = window.SH; return G.player.pref && G.player.pref !== G.cars[1]; });
  expect(first).toBe(true); expect(second).toBe(true);
});

test('the machine gun fires itself at a car in its sights, unless switched off', async ({ page }) => {
  await match(page);
  await parkAhead(page, 30); await step(page, 10); // it looks for targets ten times a second
  expect(await page.evaluate(() => window.SH.G.player.mgHeld)).toBe(true);
  await page.evaluate(() => { window.SH.G.settings.autofire = 'off'; }); await step(page, 10);
  expect(await page.evaluate(() => window.SH.G.player.mgHeld)).toBe(false);
});

test('every screen shape sees the same view width', async ({ page }) => {
  await match(page);
  const hfov = () => page.evaluate(() => { const c = window.SH.camera; return 2 * Math.atan(Math.tan(c.fov * Math.PI / 360) * c.aspect) * 180 / Math.PI; });
  await page.setViewportSize({ width: 1280, height: 720 }); await page.evaluate(() => window.SH.G.player.speed = 0);
  const wide = await hfov();
  await page.setViewportSize({ width: 915, height: 412 });
  const phone = await hfov();
  expect(Math.abs(wide - 100)).toBeLessThan(2);
  expect(Math.abs(phone - 100)).toBeLessThan(2);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 915, height: 412 }, isMobile: true, hasTouch: true });
  test('touch controls: weapon panel switches weapon; held upright, a rotate screen covers the game', async ({ page }) => {
    await match(page);
    await expect(page.locator('#bGun')).toHaveCount(0);
    await expect(page.locator('#rotate')).toBeHidden();
    await page.evaluate(() => { const p = window.SH.G.player; p.ammo.mortar = 4; p.weapon = 'missile'; });
    await page.locator('.wpn').tap(); await step(page);
    expect(await page.evaluate(() => window.SH.G.player.weapon)).toBe('mortar');
    await page.setViewportSize({ width: 412, height: 915 });
    await expect(page.locator('#rotate')).toBeVisible();
    expect(await page.evaluate(() => window.SH.G.state)).toBe('paused');
  });
});

test('help screen lists every control, for each device', async ({ page }) => {
  test.slow(); // the title screen renders on a software GPU, slower still while the other worker builds a map
  page.on('pageerror', e => { throw e; });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, fonts);
  await page.goto('/');
  await page.waitForFunction(() => window.SH && window.SH.G.state === 'title', null, { timeout: 60_000 });
  await page.click('#toHelp');
  for (const d of ['Keyboard', 'Gamepad', 'Touch']) {
    await page.click(`#controlsDevice >> text=${d}`);
    expect(await page.locator('#controlsTable tr').count(), d).toBe(11);
  }
});

test('holding a hard turn at speed drifts, unless switched off', async ({ page }) => {
  await match(page);
  const drive = () => page.evaluate(() => {
    const { G, step } = window.SH, p = G.player;
    for (let i = 0; i < 30; i++) { p.vx = Math.sin(p.yaw) * 30; p.vz = Math.cos(p.yaw) * 30; step(1 / 60, 1 / 60); }
    return p.input.handbrake;
  });
  await page.keyboard.down('KeyW'); await page.keyboard.down('KeyD');
  expect(await drive()).toBe(true);
  await page.evaluate(() => { window.SH.G.settings.autodrift = 'off'; });
  expect(await drive()).toBe(false);
});

test('deathmatch: no more than two bots go after the player at once', async ({ page }) => {
  await match(page, { opponents: 5, difficulty: 2 }); // Hard: the bots like the player most
  const most = await page.evaluate(() => {
    const { G, step, AI } = window.SH; let most = 0;
    G.ais = G.cars.filter(c => !c.isPlayer).map(c => new AI(c)); // match() benches them
    for (let i = 0; i < 60 * 8; i++) { G.player.hp = G.player.def.hp; step(1 / 60, 1 / 60); most = Math.max(most, G.ais.filter(a => a.car.alive && a.target === G.player).length); }
    return most;
  });
  expect(most).toBeLessThanOrEqual(2);
});
