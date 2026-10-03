import { ensureAudio } from '../audio/audio.js';
import { cycleWeapon } from '../combat/weapons.js';
import { $, clamp, isTouch } from '../engine/util.js';
import { pauseGame, resumeGame } from '../game/match.js';
import { G } from '../game/state.js';
import { blockedAt } from '../world/collision.js';
import { puff } from '../world/props.js';
import { ground } from '../world/terrain.js';

// ================= input =================
export const KEYS = {};
const INP = { wPress: false, combo: 0, sPress: false, cycle: 0, reset: false };
const dirTaps = [];
const nowS = () => performance.now() / 1000;
function readCombo() {
  const n = nowS(); const r = dirTaps.filter(t => n - t.t < 0.9); dirTaps.length = 0;
  if (r.length >= 2) {
    const A = r[r.length - 2], B = r[r.length - 1];
    if (n - B.t < 0.6 && B.t - A.t < 0.45) { if (A.d === 'u' && B.d === 'u') return 1; if (A.d === 'd' && B.d === 'd') return 2; }
  }
  return 0;
}
const GAME_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab']);
addEventListener('keydown', e => {
  if (GAME_KEYS.has(e.code) && G.state === 'playing') e.preventDefault();
  const first = !KEYS[e.code]; KEYS[e.code] = true;
  if (!first || e.repeat) return;
  if (G.state === 'playing') {
    if (e.code === 'ArrowUp' || e.code === 'KeyW') dirTaps.push({ d: 'u', t: nowS() });
    if (e.code === 'ArrowDown' || e.code === 'KeyS') dirTaps.push({ d: 'd', t: nowS() });
    if (e.code === 'KeyK' || e.code === 'KeyX') { INP.wPress = true; INP.combo = readCombo(); }
    if (e.code === 'KeyL' || e.code === 'KeyC') INP.sPress = true;
    if (e.code === 'KeyQ') INP.cycle = -1;
    if (e.code === 'KeyE' || e.code === 'Tab') INP.cycle = 1;
    if (e.code === 'KeyR') INP.reset = true;
  }
  if (e.code === 'KeyP' || e.code === 'Escape') { if (G.state === 'playing') pauseGame(); else if (G.state === 'paused') resumeGame(); }
});
addEventListener('keyup', e => { KEYS[e.code] = false; });
addEventListener('keydown', () => ensureAudio(), { once: true });
addEventListener('blur', () => { for (const k in KEYS) KEYS[k] = false; });

// touch controls
const TOUCH = { active: false, jx: 0, jy: 0, gun: false, w: false, drift: false };
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
  hold($('#bGun'), 'gun'); hold($('#bDrift'), 'drift');
  const tap = (el, fn) => el.addEventListener('pointerdown', e => { e.preventDefault(); el.classList.add('on'); fn(); setTimeout(() => el.classList.remove('on'), 120); });
  tap($('#bSpec'), () => { INP.sPress = true; });
  tap($('#bSwap'), () => { INP.cycle = 1; });
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

// gamepad
const PAD = { prev: [], ay: 0, active: false, steer: 0, thr: 0, mg: false, w: false, hb: false };
export function pollGamepad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  let gp = null; for (const p of pads) if (p && p.connected) { gp = p; break; }
  if (!gp) { PAD.active = false; return; }
  const b = i => !!(gp.buttons[i] && gp.buttons[i].pressed), bv = i => gp.buttons[i] ? gp.buttons[i].value : 0;
  const edge = i => b(i) && !PAD.prev[i];
  const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
  PAD.steer = Math.abs(ax) > 0.15 ? ax : 0;
  PAD.thr = bv(7) - bv(6);
  PAD.mg = b(2); PAD.w = b(0); PAD.hb = b(1);
  PAD.active = PAD.active || Math.abs(ax) > 0.3 || PAD.thr !== 0 || gp.buttons.some(x => x.pressed);
  if (G.state === 'playing') {
    if ((ay < -0.7 && PAD.ay >= -0.4) || edge(12)) dirTaps.push({ d: 'u', t: nowS() });
    if ((ay > 0.7 && PAD.ay <= 0.4) || edge(13)) dirTaps.push({ d: 'd', t: nowS() });
    if (edge(0)) { INP.wPress = true; INP.combo = readCombo(); }
    if (edge(3)) INP.sPress = true;
    if (edge(4)) INP.cycle = -1; if (edge(5)) INP.cycle = 1;
    if (edge(8)) INP.reset = true;
  }
  if (edge(9)) { if (G.state === 'playing') pauseGame(); else if (G.state === 'paused') resumeGame(); }
  PAD.ay = ay;
  PAD.prev = gp.buttons.map(x => x.pressed);
}
export function readPlayerInput(c) {
  const k = KEYS;
  let thr = ((k.ArrowUp || k.KeyW) ? 1 : 0) - ((k.ArrowDown || k.KeyS) ? 1 : 0);
  let steer = ((k.ArrowRight || k.KeyD) ? 1 : 0) - ((k.ArrowLeft || k.KeyA) ? 1 : 0);
  let hb = !!k.Space, mg = !!(k.KeyJ || k.KeyZ), w = !!(k.KeyK || k.KeyX);
  if (TOUCH.jx || TOUCH.jy) {
    const jy = -TOUCH.jy, jx = TOUCH.jx;
    thr = Math.abs(jy) < 0.15 ? 0 : clamp(jy * 1.6, -1, 1);
    steer = Math.sign(jx) * Math.pow(Math.min(1, Math.abs(jx) * 1.15), 1.4);
  }
  if (TOUCH.gun) mg = true; if (TOUCH.w) w = true; if (TOUCH.drift) hb = true;
  if (PAD.active) { if (PAD.thr) thr = PAD.thr; if (PAD.steer) steer = PAD.steer; mg = mg || PAD.mg; w = w || PAD.w; hb = hb || PAD.hb; }
  c.input.throttle = thr; c.input.steer = steer; c.input.handbrake = hb;
  c.mgHeld = mg; c.wHeld = w;
  if (INP.wPress) { c.wFire = true; c.wCombo = INP.combo; INP.wPress = false; INP.combo = 0; }
  if (INP.sPress) { c.sFire = true; INP.sPress = false; }
  if (INP.cycle) { cycleWeapon(c, INP.cycle); INP.cycle = 0; }
  if (INP.reset) { INP.reset = false; flipBack(c); }
}
function flipBack(c) {
  if (!c.alive || c.resetCd > 0) return;
  c.resetCd = 2.5; c.vx = c.vz = 0; c.vy = 0; c.y = ground(c.x, c.z) + 1.5; c.tumble = 0; c.tumbleV = 0; c.up.set(0, 1, 0);
  // nudge out of any overlap toward the arena centre
  for (let k = 0; k < 12 && blockedAt(c.x, c.z, 1.2, c); k++) { const L = Math.hypot(c.x, c.z) || 1; c.x -= c.x / L * 3; c.z -= c.z / L * 3; }
  puff(c.x, c.y, c.z, 0xd8a878, 8);
}
