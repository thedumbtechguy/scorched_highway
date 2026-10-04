import { test, expect } from '@playwright/test';

test('results: standings for every car, first-win badge, and the record on the title screen', async ({ page }) => {
  page.on('pageerror', e => { throw e; });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.goto('/');
  await page.waitForFunction(() => window.SH && window.SH.G.state === 'title', null, { timeout: 60_000 });
  await expect(page.locator('#record')).toBeHidden(); // no matches played yet
  const cars = await page.evaluate(() => {
    const { G, goGarage, startMatch, step, damageCar } = window.SH; goGarage(); startMatch(); G.countdown = 0;
    const p = G.player; for (const o of G.cars) if (o !== p) damageCar(o, 999, p);
    for (let i = 0; i < 400 && G.state !== 'over'; i++) step(1 / 60, 1 / 60);
    return G.cars.length;
  });
  await expect(page.locator('#over')).toBeVisible();
  await expect(page.locator('#overTitle')).toHaveText('Last one standing');
  await expect(page.locator('#rPlace')).toHaveText('1st');
  await expect(page.locator('#rStandings li')).toHaveCount(cars);
  await expect(page.locator('#rStandings li.me')).toContainText('still running');
  await expect(page.locator('#rStandings li').nth(1)).toContainText('wrecked by you');
  await expect(page.locator('#rBadges')).toContainText('First win!');
  await page.click('#oTitleBtn');
  await expect(page.locator('#record')).toHaveText(`1 match · 1 win · ${cars - 1} wrecks`);
});
