import { test, expect } from '@playwright/test';

// Every map and mode, so a new one is covered as soon as it's registered.
async function boot(page) {
  page.on('pageerror', e => { throw e; });
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.goto('/');
  await page.waitForFunction(() => window.SH && window.SH.G.state === 'title', null, { timeout: 60_000 });
}

test('every map hosts at least one mode, every mode has a map, and maps own separate stretches of the world', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const maps = window.SH.allMaps(), modes = window.SH.allModes().map(m => m.id);
    return {
      unknownModes: maps.flatMap(m => m.modes.filter(id => !modes.includes(id)).map(id => `${m.id}:${id}`)),
      homeless: modes.filter(id => !maps.some(m => m.modes.includes(id))),
      overlaps: maps.slice(1).filter((m, i) => m.x0 < maps[i].x1).map(m => m.id),
    };
  });
  expect(r).toEqual({ unknownModes: [], homeless: [], overlaps: [] });
});

test('every map and mode pairing starts, plays and ends cleanly', async ({ page }) => {
  test.slow(); // builds every map
  await boot(page);
  const played = await page.evaluate(() => {
    const { G, goGarage, startMatch, step, damageCar, allMaps } = window.SH, out = [];
    for (const map of allMaps()) for (const mode of map.modes) {
      G.settings.mode = mode; G.settings.map = map.id; G.settings.opponents = 3;
      goGarage(); startMatch(); G.countdown = 0;
      const ok = G.map === map && G.mode.id === mode && G.cars.every(c => !map.blocked(c.x, c.z, 0));
      for (let i = 0; i < 120; i++) step(1 / 60, 1 / 60);
      for (const c of G.cars) if (!c.isPlayer) damageCar(c, 9999, G.player);
      for (let i = 0; i < 300; i++) step(1 / 60, 1 / 60);
      out.push({ pair: `${map.id}/${mode}`, ok, status: G.mode.status(G.player).join(' ') });
    }
    return out;
  });
  expect(played.length).toBeGreaterThanOrEqual(2);
  for (const p of played) { expect(p.ok, p.pair).toBe(true); expect(p.status, p.pair).not.toBe(''); }
});

test('garage: picking a mode offers only the maps that host it', async ({ page }) => {
  await boot(page);
  await page.click('#toGarage');
  const mode = page.locator('.cyc[data-opt="mode"]'), map = page.locator('.cyc[data-opt="map"]');
  await expect(mode.locator('span')).toHaveText('Deathmatch');
  await expect(map.locator('span')).toHaveText('Ghost Town');
  await expect(page.locator('#startBtn')).toHaveText('Enter the Arena');
  await mode.locator('button').last().click();
  await expect(mode.locator('span')).toHaveText('Race');
  await expect(map.locator('span')).toHaveText('Route 67');
  await expect(page.locator('#startBtn')).toHaveText('Start the race');
});

test('sand is slower than dirt', async ({ page }) => {
  await boot(page);
  const k = await page.evaluate(() => {
    const route = window.SH.getMap('route67'), sec = route.course.sections[5];
    const river = sec.paths.find(p => !p.risky), road = sec.paths.find(p => p.risky), i = 20;
    return [route.speed(river.x[i], river.z[i]), route.speed(road.x[i], road.z[i])];
  });
  expect(k[0]).toBeLessThan(1); expect(k[1]).toBeGreaterThanOrEqual(1);
});
