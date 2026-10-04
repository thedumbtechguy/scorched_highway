// Collision and sight queries anywhere in the world: the map at the point answers for its own scenery, then
// props and wrecks (which every map shares) are checked here.
import { G } from '../game/state.js';
import { mapAt } from '../maps/registry';
import { hazardBlocked } from './hazards';
import { PROPS } from './props.js';
import { ground } from './terrain.js';

export function pushOut(c, nx, nz, e) { // bounce velocity for moving object c
  const vn = c.vx * nx + c.vz * nz;
  if (vn < 0) { c.vx -= (1 + e) * vn * nx; c.vz -= (1 + e) * vn * nz; return -vn; }
  return 0;
}
/** Keep a car out of the walls and static scenery of the map it's on; returns the impact speed. */
export function resolveStatic(c) { return mapAt(c.x).collide(c); }
export function blockedAt(x, z, m, ignore) {
  if (mapAt(x).blocked(x, z, m)) return true;
  return obstacleAt(x, z, m, ignore);
}
/** Something in the way at (x, z) that isn't the map's edge: rocks and holes on a course, hazards, solid props, wrecks (bots following a racing line). */
export function obstacleAt(x, z, m, ignore) {
  const ob = mapAt(x).obstacles;
  if (ob) for (const list of [ob.rocks, ob.holes]) for (const o of list) { const dx = x - o.x, dz = z - o.z, R = o.r + m; if (dx * dx + dz * dz < R * R) return true; }
  if (hazardBlocked(x, z, m)) return true;
  for (const p of PROPS) if (p.solid && (p.kind === 'tower' || p.kind === 'billboard' || p.kind === 'pump')) { const dx = x - p.x, dz = z - p.z, R = p.r + m; if (dx * dx + dz * dz < R * R) return true; }
  for (const c of G.cars) if (!c.alive && c !== ignore) { const dx = x - c.x, dz = z - c.z, R = c.radius + m; if (dx * dx + dz * dz < R * R) return true; }
  return false;
}
export function pointBlocked(x, y, z) { // for projectiles & line of sight
  if (y < ground(x, z) - 0.2) return true;
  return mapAt(x).solid(x, y, z);
}
/** Far outside the playable world: projectiles stop here. */
export function outOfBounds(x, z) { return mapAt(x).outOfBounds(x, z); }
export function lineOfSight(x1, y1, z1, x2, y2, z2) {
  const d = Math.hypot(x2 - x1, y2 - y1, z2 - z1); const n = Math.ceil(d / 4);
  for (let i = 1; i < n; i++) { const t = i / n; if (pointBlocked(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, z1 + (z2 - z1) * t)) return false; }
  return true;
}
