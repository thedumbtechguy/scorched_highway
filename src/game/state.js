import { camera, headSpot } from '../engine/renderer.js';
import { onTod } from '../engine/sky';
import { isTouch, loadStore, store } from '../engine/util.js';
import { SIGN_MESHES } from '../world/scenery.js';

// ================= game state =================
export const G = {
  state: 'loading', cars: [], ais: [], player: null, time: 0, clock: 0, countdown: 0, slowT: 0, timeScale: 1,
  shake: 0, endT: -1, result: null, delayed: [], showcase: null, showIn: null, playerDef: null, mode: 'arena', raceEndT: -1, menuT: 0,
  settings: Object.assign({ opponents: 4, difficulty: 1, tod: 'sunset', quality: isTouch ? 'low' : 'high', sound: 'on', car: 'sundowner', view: 'normal', cam: 'normal', autofire: 'on', autodrift: 'on', mode: 'arena' }, loadStore('settings', {})),
};
export function saveSettings() { store('settings', G.settings); }
export function later(t, fn) { G.delayed.push({ t, fn }); }
export function shake(x, z, amt) {
  const p = G.player && G.state === 'playing' ? G.player : null;
  const d = p ? Math.hypot(p.x - x, p.z - z) : Math.hypot(camera.position.x - x, camera.position.z - z);
  G.shake = Math.min(1.4, G.shake + amt / (1 + d / 18));
}
onTod(t => {
  headSpot.intensity = t.night ? 2.4 : 0;
  for (const s of SIGN_MESHES) if (s.material.emissive) s.material.emissive.setHex(t.night ? 0x3a2a20 : 0);
});
