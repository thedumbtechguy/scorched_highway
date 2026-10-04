// Balance check: bots-only matches, simulated as fast as possible (no rendering). The player's car is parked at the
// edge of the arena and can't be hurt. Reports how long matches last and how much each weapon gets fired.
//   npm run bots -- [--matches 6] [--url http://localhost:4173/]   (default: starts a dev server)
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const N = +opt('matches', 6);
let server = null, url = opt('url');
if (!url) { server = await createServer({ server: { port: 5197, strictPort: false }, logLevel: 'error' }); await server.listen(); url = server.resolvedUrls.local[0]; }
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
await page.goto(url); await page.waitForFunction(() => window.SH && window.SH.G.state === 'title', null, { timeout: 60000 });
const res = [];
for (let k = 0; k < N; k++) res.push(await page.evaluate(() => {
  const { G, goGarage, startMatch, step } = window.SH; goGarage(); startMatch(); G.countdown = 0;
  const p = G.player; const seen = new WeakSet(), use = {};
  let t = 0;
  for (; t < 240 && G.cars.filter(c => c.alive && c !== p).length > 1; t += 1 / 60) {
    p.hp = 1e6; p.x = 170; p.z = 0; p.vx = p.vz = 0; p.input = { throttle: 0, steer: 0, handbrake: true }; p.mgHeld = p.wHeld = p.wFire = p.sFire = false;
    step(1 / 60, 1 / 60);
    for (const q of (window.SH.combat ? window.SH.combat.PROJ : [])) if (!seen.has(q)) { seen.add(q); use[q.type] = (use[q.type] || 0) + 1; }
  }
  const kills = G.cars.reduce((a, c) => a + c.kills, 0);
  return { t: Math.round(t), kills, use };
}));
await browser.close(); if (server) await server.close();
const ts = res.map(r => r.t).sort((a, b) => a - b);
console.log('match lengths (s):', ts.join(' '), '| median', ts[ts.length >> 1]);
const use = {}; for (const r of res) for (const [k, v] of Object.entries(r.use)) use[k] = (use[k] || 0) + v;
console.log('shots per match (machine gun excluded):', Object.fromEntries(Object.entries(use).filter(([k]) => k !== 'bullet').map(([k, v]) => [k, +(v / N).toFixed(1)])));
