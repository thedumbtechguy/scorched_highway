// Render every car (or the ones named) from three angles and write a contact sheet.
//   npm run shots -- [--tod noon|sunset|night] [car ids...]
// Output goes to shots/ (git-ignored). Uses Vite's dev server, so no build is needed.
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const todAt = args.indexOf('--tod');
const tod = todAt >= 0 ? args.splice(todAt, 2)[1] : 'sunset';
const outDir = resolve('shots'); mkdirSync(outDir, { recursive: true });
const ANGLES = [['front', 0.75, 8.5, 2.6], ['rear', 3.6, 8.5, 2.8], ['side', 1.57, 9, 1.4]];

const server = await createServer({ server: { port: 5199, strictPort: false }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  // real web fonts matter here: livery lettering is drawn with them (some proxies need the HTTPS leniency)
  const page = await browser.newPage({ viewport: { width: 900, height: 560 }, ignoreHTTPSErrors: true });
  page.on('pageerror', e => console.error('page error:', e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.SH && window.SH.G.state === 'title', null, { timeout: 60_000 });
  const ids = args.length ? args : await page.evaluate(() => window.SH.CARS.map(c => c.id));
  await page.evaluate(t => { const { G, applyQuality, goGarage, applyTod } = window.SH; G.settings.quality = 'high'; applyQuality(); goGarage(); applyTod(t); }, tod);
  const files = [];
  for (const id of ids) for (const [name, ang, dist, h] of ANGLES) {
    await page.evaluate(([id, ang, dist, h]) => {
      const { G, selectCar, camera } = window.SH;
      selectCar(id); G.state = 'preview'; // a state the main loop leaves alone, so we own the camera
      for (const s of document.querySelectorAll('.screen')) s.hidden = true;
      const m = G.showcase.group; m.rotation.y = 0;
      camera.clearViewOffset(); camera.fov = 40; camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
      camera.position.set(m.position.x + Math.sin(ang) * dist, m.position.y + h, m.position.z + Math.cos(ang) * dist);
      camera.lookAt(m.position.x, m.position.y + 1, m.position.z);
    }, [id, ang, dist, h]);
    await page.waitForTimeout(500);
    const file = `${outDir}/${id}-${name}-${tod}.png`; await page.screenshot({ path: file }); files.push(file);
  }
  // contact sheet: one row per car
  const sheet = await browser.newPage({ viewport: { width: 1350, height: 280 * ids.length } });
  await sheet.setContent(`<body style="margin:0;display:grid;grid-template-columns:repeat(3,450px);line-height:0">${files.map(f => `<img src="data:image/png;base64,${readFileSync(f).toString('base64')}" width=450 height=280>`).join('')}</body>`);
  await sheet.waitForLoadState('load');
  await sheet.screenshot({ path: `${outDir}/sheet-${tod}.png` });
  console.log(`wrote ${files.length} shots and ${outDir}/sheet-${tod}.png`);
} finally { await browser.close(); await server.close(); }
