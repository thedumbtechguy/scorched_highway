import { ensureAudio } from '../audio/audio.js';
import { CONE, RANGE } from '../combat/arsenal';
import { cycleTarget, cycleWeapon, findTarget } from '../combat/weapons.js';
import { BINDINGS, actionForKey } from './bindings';
import { currentScreen, menuBack, menuMove, menuSelect } from './menu';
import { $, clamp, isTouch } from '../engine/util.js';
import { pauseGame, resumeGame } from '../game/match.js';
import { TAGS } from '../game/hud.js';
import { G } from '../game/state.js';
import { blockedAt } from '../world/collision.js';
import { puff } from '../world/props.js';
import { ground } from '../world/terrain.js';

// ================= input =================
export const KEYS = {};
const INP = { wPress: false, combo: 0, sPress: false, cycle: 0, target: false, reset: false };
/** The device the player last used, so hints show the right buttons. */
export const LAST = { device: /** @type {import('./bindings').Device} */ (isTouch ? 'touch' : 'keys') };
const GAME_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab']);
addEventListener('keydown', e => {
  if (GAME_KEYS.has(e.code) && G.state === 'playing') e.preventDefault();
  const first = !KEYS[e.code]; KEYS[e.code] = true;
  if (G.state !== 'playing' && menuKey(e)) return;
  if (!first || e.repeat) return;
  const a = actionForKey(e.code); if (!a) return;
  LAST.device = 'keys';
  if (G.state === 'playing') press(a, e.code === 'KeyQ' ? -1 : 1);
  if (a === 'pause' && G.state === 'playing') pauseGame();
});
/** Keys in menus: arrows move, Enter selects, Esc goes back. Returns true when the key was used. */
const MENU_DIRS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right' };
function menuKey(e) {
  if (!currentScreen()) return false;
  if (MENU_DIRS[e.code]) { e.preventDefault(); return menuMove(MENU_DIRS[e.code]); }
  if (e.code === 'Escape' || (e.code === 'KeyP' && G.state === 'paused')) return menuBack();
  if ((e.code === 'Enter' || e.code === 'NumpadEnter') && !e.repeat) { e.preventDefault(); return menuSelect(); }
  return false;
}
/** One-shot actions (held ones are read each frame in readPlayerInput). */
function press(a, dir = 1) {
  if (a === 'fire') { INP.wPress = true; INP.combo = 0; }
  else if (a === 'attack') { INP.wPress = true; INP.combo = 1; }
  else if (a === 'defend') { INP.wPress = true; INP.combo = 2; }
  else if (a === 'special') INP.sPress = true;
  else if (a === 'swap') INP.cycle = dir;
  else if (a === 'target') INP.target = true;
  else if (a === 'flip') INP.reset = true;
}
const held = a => BINDINGS[a].keys.some(k => KEYS[k]);
addEventListener('keyup', e => { KEYS[e.code] = false; });
addEventListener('keydown', () => ensureAudio(), { once: true });
addEventListener('blur', () => { for (const k in KEYS) KEYS[k] = false; });

// touch controls
const TOUCH = { active: false, jx: 0, jy: 0, w: false, drift: false };
export function setupTouch() {
  if (isTouch) document.body.classList.add('touch');
  const zone = $('#stickZone'), base = $('#stickBase'), knob = $('#stickKnob');
  let sid = null, ox = 0, oy = 0; const R = 56;
  const baseHome = () => { base.style.left = ''; base.style.bottom = ''; base.style.top = ''; };
  zone.addEventListener('pointerdown', e => {
    if (sid !== null) return; sid = e.pointerId; zone.setPointerCapture(sid);
    const zr = zone.getBoundingClientRect();
    ox = e.clientX; oy = e.clientY;
    base.style.left = (ox - zr.left - 64) + 'px'; base.style.top = (oy - zr.top - 64) + 'px'; base.style.bottom = 'auto';
    TOUCH.jx = 0; TOUCH.jy = 0; knob.style.transform = '';
    e.preventDefault();
  });
  zone.addEventListener('pointermove', e => {
    if (e.pointerId !== sid) return;
    let dx = e.clientX - ox, dy = e.clientY - oy; const L = Math.hypot(dx, dy);
    if (L > R) { dx *= R / L; dy *= R / L; }
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    TOUCH.jx = dx / R; TOUCH.jy = dy / R;
  });
  const end = e => { if (e.pointerId !== sid) return; sid = null; TOUCH.jx = 0; TOUCH.jy = 0; knob.style.transform = ''; baseHome(); };
  zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);

  const hold = (el, key) => {
    el.addEventListener('pointerdown', e => { el.setPointerCapture(e.pointerId); TOUCH[key] = true; el.classList.add('on'); e.preventDefault(); ensureAudio(); });
    const up = () => { TOUCH[key] = false; el.classList.remove('on'); };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  };
  hold($('#bDrift'), 'drift');
  const tap = (el, fn) => el.addEventListener('pointerdown', e => { e.preventDefault(); el.classList.add('on'); fn(); setTimeout(() => el.classList.remove('on'), 120); });
  tap($('#bSpec'), () => { INP.sPress = true; });
  $('.wpn').addEventListener('pointerdown', e => { e.preventDefault(); INP.cycle = 1; }); // tap the weapon panel to switch
  $('#tags').addEventListener('pointerdown', e => { // tap a name tag to make that car your target
    const tag = /** @type {HTMLElement} */ (e.target).closest('.tag'); if (!tag || !G.player) return;
    const t = TAGS.find(t => t.el === tag); if (t) { e.preventDefault(); G.player.pref = t.c; }
  });
  addEventListener('pointerdown', e => { if (e.pointerType === 'touch') LAST.device = 'touch'; }, { capture: true });
  $('#bReset').addEventListener('pointerdown', e => { e.preventDefault(); INP.reset = true; });
  // fire: tap = fire, hold = hold (torch), swipe up/down = combo
  const fb = $('#bFire'); let fid = null, fy0 = 0, fstate = '', ftimer = 0;
  fb.addEventListener('pointerdown', e => {
    e.preventDefault(); fb.setPointerCapture(e.pointerId); fid = e.pointerId; fy0 = e.clientY; fstate = 'pending'; fb.classList.add('on'); ensureAudio();
    clearTimeout(ftimer); ftimer = setTimeout(() => { if (fstate === 'pending') { fstate = 'held'; INP.wPress = true; INP.combo = 0; TOUCH.w = true; } }, 150);
  });
  fb.addEventListener('pointermove', e => {
    if (e.pointerId !== fid || fstate !== 'pending') return;
    const dy = e.clientY - fy0;
    if (Math.abs(dy) > 26) { fstate = 'swiped'; INP.wPress = true; INP.combo = dy < 0 ? 1 : 2; }
  });
  const fend = e => { if (e.pointerId !== fid) return; if (fstate === 'pending') { INP.wPress = true; INP.combo = 0; } fstate = ''; fid = null; TOUCH.w = false; fb.classList.remove('on'); clearTimeout(ftimer); };
  fb.addEventListener('pointerup', fend); fb.addEventListener('pointercancel', fend);
}

// gamepad (standard mapping)
const PAD = { prev: [], active: false, steer: 0, thr: 0, mg: false, w: false, hb: false, sx: 0, sy: 0 };
/** @type {Array<[number, import('./bindings').Action, number?]>} button index, action, direction */
const PAD_PRESS = [[0, 'fire'], [5, 'attack'], [4, 'defend'], [3, 'special'], [14, 'swap', -1], [15, 'swap', 1], [11, 'target'], [8, 'flip']];
export function pollGamepad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  let gp = null; for (const p of pads) if (p && p.connected) { gp = p; break; }
  if (!gp) { PAD.active = false; return; }
  const b = i => !!(gp.buttons[i] && gp.buttons[i].pressed), bv = i => gp.buttons[i] ? gp.buttons[i].value : 0;
  const edge = i => b(i) && !PAD.prev[i];
  const ax = gp.axes[0] || 0;
  PAD.steer = Math.abs(ax) > 0.15 ? ax : 0;
  PAD.thr = bv(7) - bv(6);
  PAD.mg = b(2); PAD.w = b(0); PAD.hb = b(1);
  const used = Math.abs(ax) > 0.3 || PAD.thr !== 0 || gp.buttons.some(x => x.pressed);
  if (used) LAST.device = 'pad';
  PAD.active = PAD.active || used;
  if (G.state === 'playing') { for (const [i, a, dir] of PAD_PRESS) if (edge(i)) press(a, dir); }
  else if (currentScreen()) { // menus: d-pad or stick moves, A selects, B goes back
    const ay = gp.axes[1] || 0, sx = Math.abs(ax) > 0.6 ? Math.sign(ax) : 0, sy = Math.abs(ay) > 0.6 ? Math.sign(ay) : 0;
    const stick = sx !== PAD.sx || sy !== PAD.sy; PAD.sx = sx; PAD.sy = sy;
    if (edge(12) || (stick && sy < 0)) menuMove('up');
    if (edge(13) || (stick && sy > 0)) menuMove('down');
    if (edge(14) || (stick && sx < 0)) menuMove('left');
    if (edge(15) || (stick && sx > 0)) menuMove('right');
    if (edge(0)) menuSelect();
    if (edge(1)) menuBack();
  }
  if (edge(9)) { if (G.state === 'playing') pauseGame(); else if (G.state === 'paused') resumeGame(); }
  PAD.prev = gp.buttons.map(x => x.pressed);
}

const AUTO = { sightT: 0, inSights: false, hardT: 0 };
export function readPlayerInput(c, dt = 1 / 60) {
  const k = KEYS;
  let thr = ((k.ArrowUp || k.KeyW) ? 1 : 0) - ((k.ArrowDown || k.KeyS) ? 1 : 0);
  let steer = ((k.ArrowRight || k.KeyD) ? 1 : 0) - ((k.ArrowLeft || k.KeyA) ? 1 : 0);
  let hb = held('drift'), mg = held('gun'), w = held('fire');
  if (TOUCH.jx || TOUCH.jy) {
    const jy = -TOUCH.jy, jx = TOUCH.jx;
    thr = Math.abs(jy) < 0.15 ? 0 : clamp(jy * 1.6, -1, 1);
    steer = Math.sign(jx) * Math.pow(Math.min(1, Math.abs(jx) * 1.15), 1.4);
  }
  if (TOUCH.w) w = true; if (TOUCH.drift) hb = true;
  if (PAD.active) { if (PAD.thr) thr = PAD.thr; if (PAD.steer) steer = PAD.steer; mg = mg || PAD.mg; w = w || PAD.w; hb = hb || PAD.hb; }
  // automatic machine gun: fires whenever a car is in its sights (checked ten times a second)
  if (G.settings.autofire === 'on') {
    AUTO.sightT -= dt;
    if (AUTO.sightT <= 0) { AUTO.sightT = 0.1; AUTO.inSights = !!findTarget(c, RANGE.mg, CONE.mg, true); }
    mg = mg || AUTO.inSights;
  }
  // automatic drift: holding the steering hard over at speed for a moment slides the back out
  AUTO.hardT = Math.abs(steer) > 0.85 && thr > 0 && c.speed > 22 ? AUTO.hardT + dt : 0;
  if (G.settings.autodrift === 'on' && AUTO.hardT > 0.25) hb = true;
  c.input.throttle = thr; c.input.steer = steer; c.input.handbrake = hb;
  c.mgHeld = mg; c.wHeld = w;
  if (INP.wPress) { c.wFire = true; c.wCombo = INP.combo; INP.wPress = false; INP.combo = 0; }
  if (INP.sPress) { c.sFire = true; INP.sPress = false; }
  if (INP.cycle) { cycleWeapon(c, INP.cycle); INP.cycle = 0; }
  if (INP.target) { INP.target = false; cycleTarget(c); }
  if (INP.reset) { INP.reset = false; flipBack(c); }
}
function flipBack(c) {
  if (!c.alive || c.resetCd > 0) return;
  c.resetCd = 2.5; c.vx = c.vz = 0; c.vy = 0; c.y = ground(c.x, c.z) + 1.5; c.tumble = 0; c.tumbleV = 0; c.up.set(0, 1, 0);
  // nudge out of any overlap toward the arena centre
  for (let k = 0; k < 12 && blockedAt(c.x, c.z, 1.2, c); k++) { const L = Math.hypot(c.x, c.z) || 1; c.x -= c.x / L * 3; c.z -= c.z / L * 3; }
  puff(c.x, c.y, c.z, 0xd8a878, 8);
}
