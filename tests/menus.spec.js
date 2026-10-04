import { test, expect } from '@playwright/test';

// Menus without a mouse: keyboard, and a gamepad faked through navigator.getGamepads.
async function boot(page) {
  page.on('pageerror', e => { throw e; });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.addInitScript(() => {
    // a standard-mapping pad whose buttons the test presses by index
    const pad = { connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    window.__pad = pad; navigator.getGamepads = () => [pad];
  });
  await page.goto('/');
  await page.waitForFunction(() => window.SH && window.SH.G.state === 'title', null, { timeout: 60_000 });
}
const car = page => page.locator('#cName').textContent();
const state = page => page.evaluate(() => window.SH.G.state);
/** Press and release a pad button. */
async function padPress(page, i) {
  // hold it until the game has seen it: frames can be slow on the software GPU tests use
  const frame = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.evaluate(i => { window.__pad.buttons[i].pressed = true; }, i); await frame();
  await page.evaluate(i => { window.__pad.buttons[i].pressed = false; }, i); await frame();
}

test('keyboard: Enter picks, arrows switch cars, Esc goes back', async ({ page }) => {
  await boot(page);
  await page.keyboard.press('Enter'); // title's main button: Choose your car
  expect(await state(page)).toBe('garage');
  const first = await car(page);
  await page.keyboard.press('ArrowRight'); const second = await car(page);
  await page.keyboard.press('ArrowLeft');
  expect(second).not.toBe(first); expect(await car(page)).toBe(first);
  await page.keyboard.press('Escape');
  expect(await state(page)).toBe('title');
});

test('keyboard: up and down reach the match pickers, left and right change them', async ({ page }) => {
  await boot(page);
  await page.click('#toGarage');
  const before = await page.evaluate(() => window.SH.G.settings.difficulty);
  await page.keyboard.press('ArrowDown'); // focuses Start
  await page.keyboard.press('ArrowUp'); // the time of day picker
  await page.keyboard.press('ArrowUp'); // difficulty
  await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(() => window.SH.G.settings.difficulty)).toBe((before + 1) % 3);
});

test('gamepad: d-pad switches cars, A starts, Start pauses, B resumes', async ({ page }) => {
  await boot(page);
  await padPress(page, 0); // A on the title: Choose your car
  expect(await state(page)).toBe('garage');
  const first = await car(page);
  await padPress(page, 15); // d-pad right
  expect(await car(page)).not.toBe(first);
  await padPress(page, 0); // A: Start the fight
  expect(await state(page)).toBe('playing');
  await page.evaluate(() => { window.SH.G.countdown = 0; });
  await padPress(page, 9); // Start: pause
  expect(await state(page)).toBe('paused');
  await padPress(page, 1); // B: back, i.e. resume
  expect(await state(page)).toBe('playing');
});
