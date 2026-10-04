import { camera, headSpot } from '../engine/renderer.js';
import { onTod } from '../engine/sky';
import { isTouch, loadStore, store } from '../engine/util.js';

// ================= game state =================
export const G = {
  state: 'loading', cars: [], ais: [], player: null, time: 0, clock: 0, countdown: 0, slowT: 0, timeScale: 1,
  shake: 0, endT: -1, result: null, delayed: [], showcase: null, showIn: null, playerDef: null,
  /** @type {import('../modes/types').GameMode} the current match's rules */ mode: null, /** @type {import('../maps/types').GameMap} where it's played */ map: null, menuT: 0,
  settings: Object.assign({ opponents: 4, difficulty: isTouch ? 0 : 1, // first-time players on a phone start on Easy
    tod: 'sunset', quality: isTouch ? 'low' : 'high', sound: 'on', car: 'sundowner', view: 'normal', cam: 'normal', autofire: 'on', autodrift: 'on', rubber: 'on', mode: 'deathmatch', map: 'ghost-town' }, migrate(loadStore('settings', {}))),
};
/** Settings saved before maps and modes were separate had mode 'arena' or 'route67'. */
function migrate(s) {
  if (s.mode === 'arena') { s.mode = 'deathmatch'; s.map = 'ghost-town'; }
  if (s.mode === 'route67') { s.mode = 'race'; s.map = 'route67'; }
  return s;
}
export function saveSettings() { store('settings', G.settings); }
export function later(t, fn) { G.delayed.push({ t, fn }); }
export function shake(x, z, amt) {
  const p = G.player && G.state === 'playing' ? G.player : null;
  const d = p ? Math.hypot(p.x - x, p.z - z) : Math.hypot(camera.position.x - x, camera.position.z - z);
  G.shake = Math.min(1.4, G.shake + amt / (1 + d / 18));
}
onTod(t => {
  headSpot.intensity = t.night ? 2.4 : 0;
});
