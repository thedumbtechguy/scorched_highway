import { lerp, smooth } from '../engine/util.js';

// ================= terrain =================
export const ARENA_R = 184;
const DUNES = [
  { x1: -150, z1: 60, x2: -95, z2: 105, h: 2.9, w: 11 },
  { x1: 125, z1: -70, x2: 160, z2: 10, h: 3.1, w: 11 },
  { x1: -70, z1: -138, x2: 15, z2: -152, h: 2.8, w: 11 },
  { x1: 35, z1: 62, x2: 78, z2: 45, h: 2.6, w: 10 },
  { x1: -135, z1: -110, x2: -100, z2: -135, h: 3.0, w: 11 },
];
for (const d of DUNES) { d.dx = d.x2 - d.x1; d.dz = d.z2 - d.z1; d.L2 = d.dx * d.dx + d.dz * d.dz; }
function rawHeight(x, z) {
  let h = 1.8 * Math.sin(x * 0.018 + 0.7) * Math.cos(z * 0.015 - 0.4) + 1.1 * Math.sin(x * 0.041 - z * 0.033 + 2.1) + 0.45 * Math.sin(x * 0.09 + z * 0.11);
  for (const d of DUNES) {
    let t = ((x - d.x1) * d.dx + (z - d.z1) * d.dz) / d.L2; t = t < 0 ? 0 : (t > 1 ? 1 : t);
    const px = d.x1 + d.dx * t - x, pz = d.z1 + d.dz * t - z;
    const q2 = (px * px + pz * pz) / (d.w * d.w);
    if (q2 < 1) { const k = 1 - q2; h += d.h * k * k; }
  }
  return h;
}
const FLATS = [{ x: 0, z: 0, r: 64, f: 20, h: 0 }];
export const RAMPS = [
  { x: -100, z: 0, yaw: Math.PI / 2, len: 16, w: 9, h: 4.2 },
  { x: 120, z: 20, yaw: 0, len: 16, w: 9, h: 4.2 },
  { x: -18, z: -96, yaw: Math.PI, len: 16, w: 9, h: 4.4 },
  { x: 70, z: 100, yaw: -Math.PI / 2, len: 16, w: 9, h: 4.0 },
];
for (const r of RAMPS) { r.s = Math.sin(r.yaw); r.c = Math.cos(r.yaw); r.base = rawHeight(r.x, r.z); FLATS.push({ x: r.x, z: r.z, r: 14, f: 10, h: r.base }); }
export function baseHeight(x, z) {
  let h = rawHeight(x, z);
  for (let i = 0; i < FLATS.length; i++) {
    const f = FLATS[i]; const dx = x - f.x, dz = z - f.z; const d2 = dx * dx + dz * dz; const R = f.r + f.f;
    if (d2 < R * R) { const d = Math.sqrt(d2); h = lerp(h, f.h, 1 - smooth(f.r, R, d)); }
  }
  const r = Math.sqrt(x * x + z * z);
  if (r > 168) h += 30 * smooth(168, 214, r);
  return h;
}
function rampHeight(x, z) {
  for (let i = 0; i < RAMPS.length; i++) {
    const R = RAMPS[i]; const dx = x - R.x, dz = z - R.z;
    const u = dx * R.s + dz * R.c; if (u < -R.len / 2 || u > R.len / 2) continue;
    const v = dx * R.c - dz * R.s; if (v > R.w / 2 || v < -R.w / 2) continue;
    return (u + R.len / 2) / R.len * R.h;
  }
  return 0;
}
export function ground(x, z) { return baseHeight(x, z) + rampHeight(x, z); }
