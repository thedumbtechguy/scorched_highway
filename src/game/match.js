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
import { FX_ADD, PSYS, fxScale } from '../engine/particles.js';
import { camera } from '../engine/renderer.js';
import { applyTod } from '../engine/sky';
import { $, loadStore, rand, store } from '../engine/util.js';
import { CAM } from './camera.js';
import { TAGS, bigText, buildTags, feed, hud } from './hud.js';
import { resize } from './loop.js';
import { clearShowcase, show } from './screens.js';
import { G, later } from './state.js';
import { KEYS, readPlayerInput } from '../input/input.js';
import { AMMO_CAP, PICK, PICKUPS, resetPickups, updatePickups } from '../world/pickups.js';
import { resetProps, updateProps } from '../world/props.js';

// ================= match =================
const SPAWNS = [[0, 118], [102, 59], [102, -59], [0, -118], [-92, -38], [-102, 59]];
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
  const pdef = CAR_BY_ID[G.settings.car] || CARS[0];
  const others = CARS.filter(d => d !== pdef).sort(() => Math.random() - 0.5).slice(0, G.settings.opponents);
  const spots = SPAWNS.slice().sort(() => Math.random() - 0.5);
  const diff = DIFF[G.settings.difficulty];
  [pdef, ...others].forEach((d, i) => {
    const c = new Car(d, i === 0); const [x, z] = spots[i];
    c.reset(x, z, Math.atan2(-x, -z)); c.speedK = i === 0 ? 1 : diff.speed;
    if (i === 0) { c.ammo.missile = 4; c.weapon = 'missile'; }
    else { c.ammo.missile = 2; c.weapon = 'missile'; }
    G.cars.push(c); if (i > 0) G.ais.push(new AI(c)); else G.player = c;
  });
  G.time = 0; G.clock = 0; G.countdown = 3.2; G.endT = -1; G.result = null; G.slowT = 0; G.timeScale = 1; G.shake = 0;
  const p = G.player; CAM.yaw = p.yaw; CAM.x = p.x - Math.sin(p.yaw) * 30; CAM.z = p.z - Math.cos(p.yaw) * 30; CAM.y = p.y + 14;
  hud.cache = {}; hud.hName.textContent = pdef.name; hud.hName.style.color = pdef.tag;
  buildTags(); show(null); $('#hud').hidden = false; G.state = 'playing'; lastCount = 4;
  resize();
}
let lastCount = 4;
export function onCarKilled(c, by) {
  if (by && by.isPlayer) { G.slowT = 0.55; bigText('Wrecked ' + c.def.driver.split(' ')[0] + '!', 1.1, true); }
  if (c.isPlayer) { G.slowT = 0.8; bigText('Wrecked!', 2); G.endT = 3.2; G.result = { win: false, by }; }
  const alive = G.cars.filter(o => o.alive);
  if (G.player.alive && alive.length === 1) { G.slowT = 1.2; G.endT = 3; G.result = { win: true }; later(0.4, () => bigText('Last one standing!', 2.5)); }
}
function endMatch() {
  G.state = 'over'; const p = G.player, r = G.result || { win: p.alive };
  const place = p.alive ? 1 : p.place;
  $('#overTitle').textContent = r.win ? 'Last one standing' : 'Wrecked';
  $('#overSub').textContent = r.win ? `${p.def.driver} rolls out of town with the ${p.def.name} still smoking.` : (r.by ? `${r.by.def.driver} got the better of you this time.` : 'The desert got the better of you this time.');
  $('#rPlace').textContent = place + (['th', 'st', 'nd', 'rd'][place] || 'th');
  $('#rKills').textContent = p.kills; $('#rDmg').textContent = Math.round(p.dealt);
  const s = G.clock | 0; $('#rTime').textContent = (s / 60 | 0) + ':' + String(s % 60).padStart(2, '0');
  show('over'); $('#hud').hidden = true;
  const best = loadStore('best', { wins: 0, kills: 0 }); if (r.win) best.wins++; best.kills += p.kills; store('best', best);
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
  if (p.alive && G.state === 'playing') readPlayerInput(p); else { p.mgHeld = p.wHeld = false; p.input.throttle = 0; p.input.steer = 0; }
  if (G.countdown > 0) { for (const c of G.cars) { c.input.throttle = 0; c.input.steer = 0; c.input.handbrake = true; } if (p.alive) { p.wFire = false; p.sFire = false; } }
  for (const ai of G.ais) ai.update(dt);
  if (G.countdown > 0) for (const c of G.cars) { c.input.throttle = 0; c.input.handbrake = true; c.wFire = false; c.sFire = false; }
  for (const c of G.cars) c.update(dt);
  collideCars(G.cars);
  for (const c of G.cars) tickCarWeapons(c, dt);
  updateProjectiles(dt); updateMines(dt, G.time); updateRings(dt); updateProps(dt);
  updatePickups(dt, G.time);
  // collect
  for (const c of G.cars) {
    if (!c.alive) continue;
    for (const pk of PICKUPS) {
      if (!pk.active) continue; const dx = c.x - pk.x, dz = c.z - pk.z;
      if (dx * dx + dz * dz < 12 && Math.abs(c.y - pk.y) < 3.5) applyPickup(c, pk);
    }
  }
  if (G.endT > 0) { G.endT -= rdt; if (G.endT <= 0) endMatch(); }
}
function applyPickup(c, p) {
  const t = p.type;
  if (t === 'repair') { if (c.hp >= c.def.hp - 0.5) return; c.hp = Math.min(c.def.hp, c.hp + PICK.repair.amt); c.burning = 0; }
  else if (t === 'special') { if (c.special >= 6) return; c.special = Math.min(6, c.special + 2); }
  else { if (c.ammo[t] >= AMMO_CAP[t]) return; c.ammo[t] = Math.min(AMMO_CAP[t], c.ammo[t] + PICK[t].amt); if (!c.weapon || c.ammo[c.weapon] <= 0.01) c.weapon = t; }
  p.active = false; p.group.visible = false; p.respawn = t === 'repair' ? 22 : 14;
  for (let i = 0; i < 16 * fxScale; i++) FX_ADD.spawn(p.x, p.y + 1.4, p.z, rand(-6, 6), rand(2, 9), rand(-6, 6), 0.5, 1, 0.1, PICK[t].color, 0xffffff, 0.9, 1.5, 6);
  if (c.isPlayer) { playSfx(t === 'repair' ? 'repair' : 'pickup'); feed(t === 'repair' ? 'Repaired' : '+' + PICK[t].amt + (t === 'flame' ? 's' : '') + ' ' + PICK[t].label, true); if (t !== 'repair' && t !== 'special' && c.weapon !== t && !c.weapon) c.weapon = t; }
}
