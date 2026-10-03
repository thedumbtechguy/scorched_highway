// Render screenshots for visual checks and write a contact sheet.
//   npm run shots -- cars [--tod noon|sunset|night] [car ids...]   every car (or those named) from three angles
//   npm run shots -- env  [--tod noon|sunset|night] [view names...] fixed viewpoints around the arena
// Output goes to shots/ (git-ignored). Uses Vite's dev server, so no build is needed.
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const mode = args[0] === 'env' || args[0] === 'cars' ? args.shift() : 'cars';
const todAt = args.indexOf('--tod');
const tod = todAt >= 0 ? args.splice(todAt, 2)[1] : 'sunset';
const outDir = resolve('shots'); mkdirSync(outDir, { recursive: true });
// env viewpoints: [name, camera x, y, z, look-at x, y, z]
const VIEWS = [
  ['town', -72, 3.2, 3, 0, 2.5, 0], ['street', 12, 2.2, -6, -40, 3, 14], ['gas', 58, 4, -44, 34, 3, -22], ['mesa', -55, 5, -25, -110, 12, -70],
  ['desert', 110, 4.5, 70, 70, 2, 30], ['edge', 95, 6, -70, 160, 18, -120], ['tower', -5, 3, 55, -24, 9, 38], ['saloon', -42, 2.8, 2, -49, 4.5, 15], ['pickups', -30, 4, 10, -38, 2, 3], ['bank', 6, 2.8, -3, -1, 4.5, -16], ['overview', 0, 130, 175, 0, 0, 0],
];
const ANGLES = [['low', 1.0, 7.5, 0.45], ['front', 0.75, 8.5, 2.6], ['rear', 3.6, 8.5, 2.8], ['side', 1.57, 9, 1.4]];

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
  await page.evaluate(t => { const { G, applyQuality, goGarage, applyTod } = window.SH; G.settings.quality = 'high'; applyQuality(); goGarage(); applyTod(t); }, tod);
  const files = [];
  if (mode === 'env') {
    const views = args.length ? VIEWS.filter(v => args.includes(v[0])) : VIEWS;
    for (const [name, ...v] of views) {
      await page.evaluate(v => {
        const { G, camera } = window.SH; G.state = 'preview';
        for (const s of document.querySelectorAll('.screen')) s.hidden = true;
        camera.clearViewOffset(); camera.fov = 62; camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
        camera.position.set(v[0], v[1], v[2]); camera.lookAt(v[3], v[4], v[5]);
      }, v);
      await page.waitForTimeout(700);
      const file = `${outDir}/env-${name}-${tod}.png`; await page.screenshot({ path: file }); files.push(file);
    }
  }
  const ids = mode === 'cars' ? (args.length ? args : await page.evaluate(() => window.SH.CARS.map(c => c.id))) : [];
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
  const rows = Math.ceil(files.length / 3);
  const sheet = await browser.newPage({ viewport: { width: 1350, height: 280 * rows } });
  await sheet.setContent(`<body style="margin:0;display:grid;grid-template-columns:repeat(3,450px);line-height:0">${files.map(f => `<img src="data:image/png;base64,${readFileSync(f).toString('base64')}" width=450 height=280>`).join('')}</body>`);
  await sheet.waitForLoadState('load');
  await sheet.screenshot({ path: `${outDir}/sheet-${mode}-${tod}.png` });
  console.log(`wrote ${files.length} shots and ${outDir}/sheet-${mode}-${tod}.png`);
} finally { await browser.close(); await server.close(); }
