import { clamp } from '../engine/util.js';
import { G } from '../game/state.js';
import { PROPS } from './props.js';
import { BOXES, CIRCLES } from './scenery.js';
import { ARENA_R, ground } from './terrain.js';

// ================= static collision queries =================
export function pushOut(c, nx, nz, e) { // bounce velocity for moving object c
  const vn = c.vx * nx + c.vz * nz;
  if (vn < 0) { c.vx -= (1 + e) * vn * nx; c.vz -= (1 + e) * vn * nz; return -vn; }
  return 0;
}
export function resolveStatic(c) {
  let impact = 0;
  const rad = c.radius;
  const r = Math.hypot(c.x, c.z);
  if (r > ARENA_R - rad) { const k = (ARENA_R - rad) / r; c.x *= k; c.z *= k; impact = Math.max(impact, pushOut(c, -c.x / r, -c.z / r, 0.3)); }
  for (let i = 0; i < BOXES.length; i++) {
    const b = BOXES[i]; if (c.y > b.h) continue;
    const px = clamp(c.x, b.minX, b.maxX), pz = clamp(c.z, b.minZ, b.maxZ);
    let dx = c.x - px, dz = c.z - pz; const d2 = dx * dx + dz * dz;
    if (d2 >= rad * rad) continue;
    let nx, nz;
    if (d2 < 1e-6) { // inside: push along least penetration
      const l = c.x - b.minX, rr = b.maxX - c.x, t = c.z - b.minZ, bb = b.maxZ - c.z; const m = Math.min(l, rr, t, bb);
      if (m === l) { nx = -1; nz = 0; c.x = b.minX - rad; } else if (m === rr) { nx = 1; nz = 0; c.x = b.maxX + rad; } else if (m === t) { nx = 0; nz = -1; c.z = b.minZ - rad; } else { nx = 0; nz = 1; c.z = b.maxZ + rad; }
    } else { const d = Math.sqrt(d2); nx = dx / d; nz = dz / d; c.x = px + nx * rad; c.z = pz + nz * rad; }
    impact = Math.max(impact, pushOut(c, nx, nz, 0.3));
  }
  for (let i = 0; i < CIRCLES.length; i++) {
    const o = CIRCLES[i]; if (c.y > o.h) continue;
    const dx = c.x - o.x, dz = c.z - o.z; const R = rad + o.r; const d2 = dx * dx + dz * dz;
    if (d2 >= R * R) continue; const d = Math.sqrt(d2) || 0.01; const nx = dx / d, nz = dz / d;
    c.x = o.x + nx * R; c.z = o.z + nz * R; impact = Math.max(impact, pushOut(c, nx, nz, 0.3));
  }
  return impact;
}
export function blockedAt(x, z, m, ignore) {
  if (Math.hypot(x, z) > ARENA_R - 3 - m) return true;
  for (const b of BOXES) if (x > b.minX - m && x < b.maxX + m && z > b.minZ - m && z < b.maxZ + m) return true;
  for (const o of CIRCLES) { const dx = x - o.x, dz = z - o.z, R = o.r + m; if (dx * dx + dz * dz < R * R) return true; }
  for (const p of PROPS) if (p.solid && (p.kind === 'tower' || p.kind === 'billboard' || p.kind === 'pump')) { const dx = x - p.x, dz = z - p.z, R = p.r + m; if (dx * dx + dz * dz < R * R) return true; }
  for (const c of G.cars) if (!c.alive && c !== ignore) { const dx = x - c.x, dz = z - c.z, R = c.radius + m; if (dx * dx + dz * dz < R * R) return true; }
  return false;
}
export function pointBlocked(x, y, z) { // for projectiles & line of sight
  if (y < ground(x, z) - 0.2) return true;
  for (const b of BOXES) if (y < b.h && x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) return true;
  for (const o of CIRCLES) if (y < o.h) { const dx = x - o.x, dz = z - o.z; if (dx * dx + dz * dz < o.r * o.r) return true; }
  return false;
}
export function lineOfSight(x1, y1, z1, x2, y2, z2) {
  const d = Math.hypot(x2 - x1, y2 - y1, z2 - z1); const n = Math.ceil(d / 4);
  for (let i = 1; i < n; i++) { const t = i / n; if (pointBlocked(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, z1 + (z2 - z1) * t)) return false; }
  return true;
}
