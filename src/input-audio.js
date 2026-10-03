'use strict';
// ================= input =================
const KEYS = {};
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
function setupTouch() {
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
function pollGamepad() {
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
function readPlayerInput(c) {
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

// ================= audio =================
const AU = { ctx: null, master: null, noise: null, engine: null, flame: null, last: {} };
function ensureAudio() {
  if (AU.ctx) { if (AU.ctx.state === 'suspended') AU.ctx.resume(); return; }
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)(); AU.ctx = ctx;
    AU.master = ctx.createGain(); AU.master.gain.value = G.settings.sound === 'off' ? 0 : 0.55; AU.master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6; AU.master.disconnect(); AU.master.connect(comp); comp.connect(ctx.destination);
    const len = ctx.sampleRate; const buf = ctx.createBuffer(1, len, ctx.sampleRate); const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; AU.noise = buf;
    // engine
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o1.type = 'sawtooth'; o2.type = 'square'; o2.detune.value = -1200 + 7; f.type = 'lowpass'; f.frequency.value = 400; f.Q.value = 3; g.gain.value = 0;
    o1.connect(f); o2.connect(f); f.connect(g); g.connect(AU.master); o1.start(); o2.start();
    AU.engine = { o1, o2, f, g };
    // flame loop
    const ns = ctx.createBufferSource(); ns.buffer = buf; ns.loop = true; const bf = ctx.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 600; bf.Q.value = 0.7; const fg = ctx.createGain(); fg.gain.value = 0;
    ns.connect(bf); bf.connect(fg); fg.connect(AU.master); ns.start(); AU.flame = fg;
  } catch (e) { AU.ctx = null; }
}
function setSound(on) { if (AU.master) AU.master.gain.value = on ? 0.55 : 0; }
function noiseBurst(t, dur, type, f0, f1, vol, q) {
  const ctx = AU.ctx, s = ctx.createBufferSource(); s.buffer = AU.noise; s.playbackRate.value = 1;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur); f.Q.value = q || 1;
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(AU.master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}
function tone(t, dur, type, f0, f1, vol) {
  const ctx = AU.ctx, o = ctx.createOscillator(), g = ctx.createGain(); o.type = type;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(AU.master); o.start(t); o.stop(t + dur + 0.05);
}
function playSfx(name, x, z, vol) {
  if (!AU.ctx || G.settings.sound === 'off') return;
  let v = vol == null ? 1 : vol;
  if (x != null) { const d = Math.hypot(camera.position.x - x, camera.position.z - z); v *= 1 / (1 + d / 28); }
  if (v < 0.03) return;
  const now = AU.ctx.currentTime;
  const minGap = { gun: 0.035, ping: 0.05, clank: 0.08, thud: 0.1, boom: 0.04 }[name] || 0;
  if (minGap && AU.last[name] && now - AU.last[name] < minGap) return; AU.last[name] = now;
  const t = now + 0.005;
  switch (name) {
    case 'gun': noiseBurst(t, 0.07, 'bandpass', 2400, 900, 0.5 * v, 1.2); tone(t, 0.05, 'square', 180, 90, 0.08 * v); break;
    case 'ping': tone(t, 0.08, 'triangle', 1600 + Math.random() * 600, 900, 0.12 * v); break;
    case 'boom': noiseBurst(t, 0.9 * Math.min(1.4, v + 0.4), 'lowpass', 1400, 60, 1.0 * v, 0.8); tone(t, 0.5, 'sine', 110, 35, 0.8 * v); break;
    case 'launch': noiseBurst(t, 0.45, 'bandpass', 500, 2600, 0.45 * v, 2); break;
    case 'thump': tone(t, 0.18, 'sine', 150, 55, 0.7 * v); noiseBurst(t, 0.15, 'lowpass', 900, 200, 0.3 * v); break;
    case 'cannon': tone(t, 0.25, 'sine', 120, 40, 0.9 * v); noiseBurst(t, 0.3, 'lowpass', 2500, 200, 0.7 * v); break;
    case 'mine': tone(t, 0.12, 'sine', 1300, 1300, 0.12 * v); break;
    case 'click': tone(t, 0.04, 'square', 900, 700, 0.08 * v); break;
    case 'pickup': tone(t, 0.08, 'square', 660, 660, 0.1 * v); tone(t + 0.08, 0.14, 'square', 990, 990, 0.1 * v); break;
    case 'repair': tone(t, 0.1, 'triangle', 520, 520, 0.18 * v); tone(t + 0.1, 0.1, 'triangle', 660, 660, 0.18 * v); tone(t + 0.2, 0.2, 'triangle', 880, 880, 0.18 * v); break;
    case 'clank': tone(t, 0.12, 'triangle', 240, 120, 0.35 * v); noiseBurst(t, 0.15, 'bandpass', 1800, 600, 0.4 * v, 2); break;
    case 'thud': tone(t, 0.15, 'sine', 90, 40, 0.6 * v); break;
    case 'crunch': noiseBurst(t, 0.25, 'bandpass', 900, 300, 0.4 * v, 1); break;
    case 'crash': noiseBurst(t, 1.2, 'lowpass', 800, 80, 0.8 * v); tone(t, 0.9, 'sawtooth', 80, 30, 0.2 * v); break;
    case 'whoosh': noiseBurst(t, 0.6, 'bandpass', 300, 1800, 0.6 * v, 0.8); break;
    case 'sonic': tone(t, 0.7, 'sine', 320, 50, 0.8 * v); tone(t, 0.7, 'square', 160, 40, 0.15 * v); noiseBurst(t, 0.5, 'lowpass', 600, 60, 0.5 * v); break;
    case 'ice': tone(t, 0.3, 'triangle', 1800, 600, 0.2 * v); noiseBurst(t, 0.3, 'highpass', 4000, 2000, 0.2 * v); break;
    case 'beep': tone(t, 0.18, 'square', 440, 440, 0.14 * v); break;
    case 'go': tone(t, 0.4, 'square', 880, 880, 0.14 * v); break;
    case 'hurt': tone(t, 0.12, 'sawtooth', 160, 90, 0.12 * v); break;
  }
}
function updateAudio(dt) {
  if (!AU.ctx || !AU.engine) return;
  const e = AU.engine, p = G.player, t = AU.ctx.currentTime;
  const on = G.state === 'playing' && p && p.alive && G.settings.sound !== 'off';
  const sp = p ? p.speed : 0, thr = p ? Math.abs(p.input.throttle) : 0;
  const freq = 38 + sp * 2.1 + thr * 14 + (p && p.boost > 0 ? 30 : 0);
  e.o1.frequency.setTargetAtTime(freq, t, 0.06); e.o2.frequency.setTargetAtTime(freq, t, 0.06);
  e.f.frequency.setTargetAtTime(260 + sp * 14 + thr * 300, t, 0.08);
  e.g.gain.setTargetAtTime(on ? 0.05 + thr * 0.04 : 0, t, 0.1);
  let fl = 0;
  if (G.state === 'playing') for (const c of G.cars) if (c.flameOn) { const d = Math.hypot(camera.position.x - c.x, camera.position.z - c.z); fl = Math.max(fl, 1 / (1 + d / 20)); }
  AU.flame.gain.setTargetAtTime(fl * 0.5, t, 0.05);
}
