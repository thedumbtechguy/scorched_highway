import { AI } from '../ai/ai.js';
import { ensureAudio, playSfx } from '../audio/audio.js';
import { Car, collideCars } from '../cars/car.js';
import { disposeCarModel } from '../cars/model/build.js';
import { CARS, CAR_BY_ID } from '../cars/roster.js';
import { DIFF } from '../combat/damage.js';
import { updateRings } from '../combat/effects.js';
import { clearWeapons } from '../combat/pools.js';
import { tickCarWeapons, updateMines, updateProjectiles } from '../combat/weapons.js';
import { clearDebris } from '../engine/debris.js';
import { PSYS } from '../engine/particles.js';
import { camera, renderer, scene } from '../engine/renderer.js';
import { applyTod } from '../engine/sky';
import { $ } from '../engine/util.js';
import { CAM } from './camera.js';
import { TAGS, bigText, buildTags, hud } from './hud.js';
import { resize } from './loop.js';
import { clearShowcase, show } from './screens.js';
import { showResults } from './results';
import { MENU_MAP, allMaps, getMap } from '../maps/registry';
import { allModes, getMode } from '../modes/registry';
import { G } from './state.js';
import { KEYS, readPlayerInput } from '../input/input.js';
import { resetPickups, updatePickups } from '../world/pickups';
import { resetProps, updateProps } from '../world/props.js';

// ================= match =================
// A match runs cars, weapons and effects the same way on every map and in every mode; the mode (src/modes)
// decides the rules and the map (src/maps) the place.

/** The mode and map chosen in the garage (falling back to a map that hosts the mode). */
export function chosen() {
  const mode = getMode(G.settings.mode) || allModes()[0];
  const map = [getMap(G.settings.map), ...allMaps()].find(m => m && m.modes.includes(mode.id)) || getMap(MENU_MAP);
  return { mode, map };
}
export function clearMatch() {
  for (const c of G.cars) disposeCarModel(c.model);
  G.cars = []; G.ais = []; G.player = null; G.delayed = [];
  clearWeapons(); clearDebris(); for (const s of PSYS) s.clear();
  resetProps(); resetPickups();
  hud.tags.innerHTML = ''; TAGS.length = 0; hud.feed.innerHTML = '';
}
export function startMatch() {
  ensureAudio();
  clearShowcase(); clearMatch(); camera.clearViewOffset();
  applyTod(G.settings.tod);
  const { mode, map } = chosen(); G.mode = mode; G.map = map;
  if (!map.isBuilt()) { const t = performance.now(); map.build(G.settings.quality === 'low'); performance.measure('map:build', { start: t }); }
  const pdef = CAR_BY_ID[G.settings.car] || CARS[0];
  const others = CARS.filter(d => d !== pdef).sort(() => Math.random() - 0.5).slice(0, G.settings.opponents);
  const diff = DIFF[G.settings.difficulty];
  [pdef, ...others].forEach((d, i) => {
    const c = new Car(d, i === 0); c.speedK = i === 0 ? 1 : diff.speed;
    G.cars.push(c); if (i > 0) G.ais.push(new AI(c)); else G.player = c;
  });
  mode.setup(G.cars, map);
  G.time = 0; G.clock = 0; G.countdown = 3.2; G.endT = -1; G.result = null; G.slowT = 0; G.timeScale = 1; G.shake = 0;
  const p = G.player; CAM.yaw = p.yaw; CAM.x = p.x - Math.sin(p.yaw) * 30; CAM.z = p.z - Math.cos(p.yaw) * 30; CAM.y = p.y + 14;
  hud.cache = {}; hud.hName.textContent = pdef.name; hud.hName.style.color = pdef.tag;
  buildTags(); show(null); $('#hud').hidden = false; G.state = 'playing'; lastCount = 4;
  resize();
  renderer.compile(scene, camera); // compile every shader now (pooled effects included) instead of stuttering when they first appear
}
let lastCount = 4;
/** A car has been wrecked: the mode decides what that means. */
export function onCarKilled(c, by) {
  c.wreckedBy = by || null;
  if (by && by.isPlayer) { G.slowT = Math.max(G.slowT, 0.55); bigText('Wrecked ' + c.def.driver.split(' ')[0] + '!', 1.1, true); }
  G.mode.wrecked(c, by || null);
}
function endMatch() {
  G.state = 'over';
  showResults();
  show('over'); $('#hud').hidden = true; resize();
}
export function pauseGame() { if (G.state !== 'playing') return; G.state = 'paused'; show('pause'); for (const k in KEYS) KEYS[k] = false; }
export function resumeGame() { if (G.state !== 'paused') return; G.state = 'playing'; show(null); }

// ================= step =================
export function step(dt, rdt) {
  const p = G.player;
  // delayed events
  for (let i = G.delayed.length - 1; i >= 0; i--) { const d = G.delayed[i]; d.t -= dt; if (d.t <= 0) { G.delayed.splice(i, 1); d.fn(); } }
  if (G.countdown > 0) {
    G.countdown -= rdt;
    const n = Math.ceil(G.countdown - 0.2);
    if (n !== lastCount) { lastCount = n; if (n > 0) { bigText(String(n), 0.8); playSfx('beep'); } else { bigText('Go!', 0.8); playSfx('go'); } }
  } else G.clock += dt;
  G.time += dt;
  if (p.alive && G.state === 'playing') readPlayerInput(p, dt); else { p.mgHeld = p.wHeld = false; p.input.throttle = 0; p.input.steer = 0; }
  if (G.countdown > 0) { for (const c of G.cars) { c.input.throttle = 0; c.input.steer = 0; c.input.handbrake = true; } if (p.alive) { p.wFire = false; p.sFire = false; } }
  for (const ai of G.ais) ai.update(dt);
  if (G.countdown > 0) for (const c of G.cars) { c.input.throttle = 0; c.input.handbrake = true; c.wFire = false; c.sFire = false; }
  for (const c of G.cars) c.update(dt);
  collideCars(G.cars);
  for (const c of G.cars) tickCarWeapons(c, dt);
  updateProjectiles(dt); updateMines(dt, G.time); updateRings(dt); updateProps(dt);
  updatePickups(dt, G.time);
  G.mode.step(dt, rdt);
  if (G.endT > 0) { G.endT -= rdt; if (G.endT <= 0) endMatch(); }
}
