import { TAU, mulberry32 } from '../../engine/util.js';

// splotchy rust patch for decals, deterministic per seed
export function rustSpot(D, a, b, r, seed, col) {
  const rnd = mulberry32(seed), c = D.ctx;
  for (const [k, fill] of [[1, col || 'rgba(122,58,24,0.85)'], [0.55, 'rgba(70,32,14,0.8)']]) {
    c.beginPath();
    for (let i = 0; i <= 14; i++) { const t = i / 14 * TAU, rr = r * k * (0.6 + rnd() * 0.5); c[i ? 'lineTo' : 'moveTo'](a + Math.cos(t) * rr * 1.4, b + Math.sin(t) * rr); }
    c.fillStyle = fill; c.fill();
  }
  c.fillStyle = 'rgba(90,40,16,0.7)';
  for (let i = 0; i < 10; i++) { const t = rnd() * TAU, d = r * (1 + rnd() * 0.6); c.beginPath(); c.arc(a + Math.cos(t) * d * 1.4, b + Math.sin(t) * d, r * 0.08 * (0.5 + rnd()), 0, TAU); c.fill(); }
}
export const FONT_COND = "'Barlow Semi Condensed', 'Arial Narrow', sans-serif";
