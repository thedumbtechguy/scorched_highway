// Repeatable performance benchmark: boot timings, then a scripted 6-car match driven frame by frame.
//   npm run perf -- [--quality high|low] [--frames 60] [--out name]
// Reports per-frame CPU time (simulation vs. render submission), GPU-inclusive render time, draw calls,
// triangles, memory, and the hottest functions from a CPU profile. Writes shots/perf-<name>.json.
// Absolute times here come from a software GPU (SwiftShader), which also stalls the first time it sees each new
// render-state combination; trust medians, draw calls and triangles, and compare runs against each other.
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const quality = opt('quality', 'high'), FRAMES = +opt('frames', 60), name = opt('out', quality);

const server = await createServer({ server: { port: 5196, strictPort: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, ignoreHTTPSErrors: true });
  page.on('pageerror', e => console.error('page error:', e.message));
  await page.addInitScript(q => { try { localStorage.setItem('shwy_settings', JSON.stringify({ quality: q, opponents: 5, tod: 'sunset', car: 'sundowner' })); } catch { /* storage blocked */ } }, quality);
  await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' })); // deterministic, offline
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.SH && window.SH.G.state === 'title', null, { timeout: 120_000 });
  const boot = await page.evaluate(() => Object.fromEntries(performance.getEntriesByType('measure').filter(m => m.name.startsWith('boot:')).map(m => [m.name.slice(5), Math.round(m.duration)])));

  // set up the match and warm up shaders and caches
  await page.evaluate(() => {
    const { G, goGarage, startMatch, step } = window.SH;
    goGarage(); startMatch(); G.countdown = 0;
    G.player.input = { throttle: 1, steer: 0.25, handbrake: false };
    for (let i = 0; i < 30; i++) step(1 / 60, 1 / 60);
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  const run = n => page.evaluate(n => {
    const { G, tick, renderer } = window.SH, gl = renderer.getContext();
    // time renderer.render separately, including the GPU (finish) so fill and shader cost show up
    const orig = renderer.render.bind(renderer); let rCpu = 0, rGpu = 0;
    renderer.render = (s, c) => { const a = performance.now(); orig(s, c); const b = performance.now(); gl.finish(); rCpu += b - a; rGpu += performance.now() - b; };
    let t = performance.now(), calls = 0, tris = 0; const times = [], p0 = renderer.info.programs.length;
    for (let i = 0; i < n; i++) {
      G.player.input.steer = Math.sin(i / 40) * 0.6; // weave around so the view changes
      renderer.info.autoReset = false; renderer.info.reset(); // count the shadow pass too
      const a = performance.now(); t += 1000 / 60; tick(t); gl.finish(); times.push(performance.now() - a);
      renderer.info.autoReset = true;
      calls += renderer.info.render.calls; tris += renderer.info.render.triangles;
    }
    renderer.render = orig;
    const m = renderer.info.memory, sorted = times.slice().sort((a, b) => a - b), q = f => sorted[Math.min(n - 1, Math.floor(f * n))];
    return { frames: n, medianMs: q(0.5), p95Ms: q(0.95), worstMs: sorted[n - 1], hitches: times.filter(x => x > 33).length, compiledDuringRun: renderer.info.programs.length - p0,
      renderCpuMs: rCpu / n, gpuMs: rGpu / n, simMs: (times.reduce((a, b) => a + b, 0) - rCpu - rGpu) / n, calls: calls / n, tris: tris / n,
      geometries: m.geometries, textures: m.textures, programs: renderer.info.programs.length, vertexMB: vertexBytes() / 1048576 };
    // exact size of all vertex and index buffers in the scene (unique buffers; shared views counted once)
    function vertexBytes() {
      const seen = new Set(); let b = 0;
      window.SH.scene.traverse(o => { const g = o.geometry; if (!g) return; for (const a of Object.values(g.attributes).concat(g.index ? [g.index] : [])) if (!seen.has(a) && a.array) { seen.add(a); b += a.array.byteLength; } if (o.isInstancedMesh && !seen.has(o.instanceMatrix)) { seen.add(o.instanceMatrix); b += o.instanceMatrix.array.byteLength; } });
      return b;
    }
  }, n);
  await run(30); // warm-up
  await cdp.send('Profiler.start');
  const r = await run(FRAMES);
  const { profile } = await cdp.send('Profiler.stop');
  // self time per function
  const self = new Map(), byId = new Map(profile.nodes.map(n => [n.id, n])), dt = profile.timeDeltas;
  profile.samples.forEach((id, i) => { const n = byId.get(id), f = n.callFrame, key = `${f.functionName || '(anon)'} ${f.url.split('/').slice(-2).join('/')}:${f.lineNumber + 1}`; self.set(key, (self.get(key) || 0) + (dt[i] || 0)); });
  const totalUs = [...self.values()].reduce((a, b) => a + b, 0);
  const hot = [...self.entries()].filter(([k]) => !/^\((idle|program|garbage collector)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => [k, +(v / totalUs * 100).toFixed(1)]);
  // what each layer costs to draw: draw calls and triangles it adds to one still frame (shadow pass included)
  const breakdown = await page.evaluate(() => {
    const { renderer, scene, camera } = window.SH;
    // r128 resets the counters after the shadow pass, so reset by hand to include it
    const count = () => { renderer.info.autoReset = false; renderer.info.reset(); renderer.render(scene, camera); renderer.info.autoReset = true; return [renderer.info.render.calls, renderer.info.render.triangles]; };
    const [c0, t0] = count(), out = { total: [c0, t0] }, layers = new Set();
    scene.traverse(o => o.userData.layer && layers.add(o.userData.layer));
    for (const layer of layers) {
      const hidden = []; scene.traverse(o => { if (o.userData.layer === layer && o.visible) { o.visible = false; hidden.push(o); } });
      const [c, t] = count(); out[layer] = [c0 - c, t0 - t]; for (const o of hidden) o.visible = true;
    }
    renderer.shadowMap.enabled = false; const [c, t] = count(); out.shadowPass = [c0 - c, t0 - t]; renderer.shadowMap.enabled = true;
    return out;
  });
  const out = { quality, boot, breakdown, ...Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'number' ? +v.toFixed(2) : v])), hot };
  mkdirSync('shots', { recursive: true }); writeFileSync(`shots/perf-${name}.json`, JSON.stringify(out, null, 2));
  console.log(`boot (ms): ${JSON.stringify(boot)}`);
  console.log(`frame time: median ${out.medianMs} ms, p95 ${out.p95Ms}, worst ${out.worstMs}; ${out.hitches} hitches over 33 ms; ${out.compiledDuringRun} shaders compiled mid-run`);
  console.log(`  average split: sim ${out.simMs} + render submit ${out.renderCpuMs} + gpu wait ${out.gpuMs}`);
  console.log(`draw calls ${out.calls}, triangles ${Math.round(out.tris)}, geometries ${out.geometries}, textures ${out.textures}, programs ${out.programs}, vertex data ${out.vertexMB.toFixed(1)} MB`);
  console.log('per layer (draw calls / triangles):');
  for (const [k, [c, t]] of Object.entries(breakdown).sort((a, b) => b[1][1] - a[1][1])) console.log(`  ${k.padEnd(12)} ${String(c).padStart(4)} calls ${String(Math.round(t / 1000)).padStart(5)}k tris`);
  console.log('hottest functions (% of profiled time):'); for (const [k, v] of hot) console.log(`  ${String(v).padStart(5)}%  ${k}`);
} finally { await browser.close(); await server.close(); }
