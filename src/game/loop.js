import * as THREE from 'three';
import { updateAudio } from '../audio/audio.js';
import { updateDebris } from '../engine/debris.js';
import { PSYS, setFxScale } from '../engine/particles.js';
import { camera, headSpot, renderer, scene, sun, sunDir, updateLights } from '../engine/renderer.js';
import { curTod, updateSky } from '../engine/sky';
import { _v1, _v2, isTouch, lerp } from '../engine/util.js';
import { baseFov, playFov, chaseCam, orbitCam } from './camera.js';
import { feed, updateHUD } from './hud.js';
import { pauseGame, step } from './match.js';
import { SHOW_POS } from './screens.js';
import { G } from './state.js';
import { updateScatter, updateTumbleweeds } from '../world/flora';
import { pollGamepad } from '../input/input.js';
import { updatePickups } from '../world/pickups';
import { ground } from '../world/terrain.js';

// ================= render loop =================
const _bs = new THREE.Vector2();
let lastT = performance.now(), fpsAcc = 0, fpsN = 0, autoLowered = false;
function frame(now) {
  requestAnimationFrame(frame);
  tick(now);
}
/** One frame of simulation and rendering at time `now` (ms). Tools call it directly to benchmark. */
export function tick(now) {
  const rdt = Math.min(0.05, Math.max(0.001, (now - lastT) / 1000)); lastT = now;
  pollGamepad();
  let dt = rdt;
  if (G.state === 'playing') {
    G.slowT -= rdt; const ts = G.slowT > 0 ? 0.3 : 1; G.timeScale = lerp(G.timeScale, ts, 1 - Math.exp(-8 * rdt)); dt = rdt * G.timeScale;
    step(dt, rdt);
    const p = G.player;
    if (p.alive || G.endT > 1.5) chaseCam(rdt, p);
    else orbitCam(rdt, p.x, p.y, p.z, 14, 6, 0.4, 1);
    // player headlight
    if (curTod.night) {
      p.worldPoint(0, 1.2, p.def.front, _v1); headSpot.position.copy(_v1); p.worldPoint(0, -1.5, p.def.front + 20, _v2); headSpot.target.position.copy(_v2);
      headSpot.intensity = p.alive ? 2.4 : 0;
    }
    updateHUD(rdt);
    // auto quality drop if very slow
    fpsAcc += rdt; fpsN++;
    if (fpsAcc > 4) { const fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; if (fps < 26 && !autoLowered && G.settings.quality === 'high') { autoLowered = true; G.settings.quality = 'low'; applyQuality(); feed('Switched to fast graphics'); } }
  } else if (G.state === 'title') {
    G.menuT += rdt; orbitCam(rdt, 0, 0, 0, 78, 28, 0.06, 4); updatePickups(rdt, G.menuT);
  } else if (G.state === 'garage') {
    G.menuT += rdt; orbitCam(rdt, SHOW_POS.x, ground(SHOW_POS.x, SHOW_POS.z), SHOW_POS.z, 8, 2.6, 0.25, 0.9); updatePickups(rdt, G.menuT);
    const sc = G.showcase, si = G.showIn;
    if (sc && si && si.t < 1) { // a newly chosen car slides in from the side it came from
      si.t = Math.min(1, si.t + rdt / 0.35); const k = 1 - Math.pow(1 - si.t, 3);
      _v1.set(1, 0, 0).applyQuaternion(camera.quaternion).multiplyScalar((1 - k) * si.dir * 7);
      sc.group.position.copy(sc.group.userData.home).add(_v1); sc.group.scale.setScalar(0.9 + 0.1 * k);
    }
    if (G.showcase) { if (G.showcase.siren) { const on = (now / 180 | 0) % 2 === 0; G.showcase.siren[0].visible = on; G.showcase.siren[1].visible = !on; } }
  } else if (G.state === 'over') {
    const p = G.player; if (p) orbitCam(rdt, p.x, p.y, p.z, 12, 5, 0.25, 1);
    step(rdt * 0.5, rdt); // world keeps moving gently behind the results
  }
  if (G.state !== 'paused') {
    for (const s of PSYS) s.update(G.state === 'playing' ? dt : rdt);
    updateDebris(G.state === 'playing' ? dt : rdt); updateLights(rdt); updateTumbleweeds(G.state === 'playing' ? dt : rdt, now / 1000);
  }
  G.shake = Math.max(0, G.shake - rdt * 2.2);
  updateAudio(rdt);
  // sky & sun follow camera
  updateSky(camera.position, rdt); updateScatter(camera.position);
  for (const c of G.cars) c.model.lod(camera.position);
  // shadow camera follows focus
  const f = G.player && G.state !== 'garage' && G.state !== 'title' ? G.player : (G.state === 'garage' ? { x: SHOW_POS.x, y: 0, z: SHOW_POS.z } : { x: 0, y: 0, z: 0 });
  sun.target.position.set(f.x, f.y || 0, f.z); sun.position.set(f.x + sunDir.x * 200, (f.y || 0) + Math.max(0.25, sunDir.y) * 200, f.z + sunDir.z * 200);
  const bs = renderer.getDrawingBufferSize(_bs);
  const scale = bs.y / (2 * Math.tan(camera.fov * Math.PI / 360));
  for (const s of PSYS) s.setUniforms(scale);
  renderer.render(scene, camera);
}

export function startLoop() { requestAnimationFrame(t => { lastT = t; frame(t); }); }

// ================= quality & resize =================
export function applyQuality() {
  const hi = G.settings.quality === 'high';
  const dpr = window.devicePixelRatio || 1;
  renderer.setPixelRatio(Math.min(dpr, hi ? (isTouch ? 1.75 : 2) : (isTouch ? 1.3 : 1)));
  renderer.shadowMap.enabled = hi; sun.castShadow = hi;
  scene.traverse(o => { const mat = /** @type {THREE.Mesh} */ (o).material; if (mat) (Array.isArray(mat) ? mat : [mat]).forEach(m => m.needsUpdate = true); });
  setFxScale(hi ? 1 : 0.55);
  resize();
}
export function resize() {
  const W = innerWidth, H = innerHeight;
  renderer.setSize(W, H, false); camera.aspect = W / H;
  if (G.state === 'garage') {
    camera.setViewOffset(W, H, 0, -H * 0.04, W, H); // nudge the car up, clear of the bottom cards
  } else camera.clearViewOffset();
  camera.fov = G.state === 'playing' || G.state === 'paused' ? playFov() : baseFov(); camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'playing') pauseGame(); });
