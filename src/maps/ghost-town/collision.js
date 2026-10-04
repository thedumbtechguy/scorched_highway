// The ghost town's static collision: the canyon wall ringing the arena, buildings (boxes), and posts, poles,
// mesas and boulders (circles).
import { clamp } from '../../engine/util.js';
import { pushOut } from '../../world/collision.js';
import { BOXES, CIRCLES } from './scenery.js';
import { ARENA_R } from './terrain.js';

/** Push a car out of the wall and scenery; returns the impact speed. */
export function collide(c) {
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
/** Scenery or the arena's edge within m metres of (x, z). */
export function blocked(x, z, m) {
  if (Math.hypot(x, z) > ARENA_R - 3 - m) return true;
  for (const b of BOXES) if (x > b.minX - m && x < b.maxX + m && z > b.minZ - m && z < b.maxZ + m) return true;
  for (const o of CIRCLES) { const dx = x - o.x, dz = z - o.z, R = o.r + m; if (dx * dx + dz * dz < R * R) return true; }
  return false;
}
/** Inside a building, post or rock at (x, y, z). */
export function solid(x, y, z) {
  for (const b of BOXES) if (y < b.h && x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) return true;
  for (const o of CIRCLES) if (y < o.h) { const dx = x - o.x, dz = z - o.z; if (dx * dx + dz * dz < o.r * o.r) return true; }
  return false;
}
