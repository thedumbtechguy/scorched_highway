import { camera } from '../engine/renderer.js';
import { G } from '../game/state.js';

// ================= audio =================
const AU = { ctx: null, master: null, noise: null, engine: null, flame: null, last: {} };
export function ensureAudio() {
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
export function setSound(on) { if (AU.master) AU.master.gain.value = on ? 0.55 : 0; }
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
export function playSfx(name, x, z, vol) {
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
export function updateAudio(dt) {
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
