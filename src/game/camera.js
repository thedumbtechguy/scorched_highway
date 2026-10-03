import { camera } from '../engine/renderer.js';
import { angDiff, clamp, lerp, rand } from '../engine/util.js';
import { G } from './state.js';
import { pointBlocked } from '../world/collision.js';
import { ground } from '../world/terrain.js';

// ================= camera =================
export const CAM = { x: 0, y: 30, z: -60, yaw: 0, fov: 62, orbit: 0 };
export function baseFov() { return camera.aspect < 1 ? 80 : 62; }
export function chaseCam(dt, c) {
  const sp = c.speed;
  CAM.yaw += angDiff(CAM.yaw, c.yaw) * (1 - Math.exp(-(c.grounded ? 4.2 : 1.6) * dt));
  const back = 8.8 + sp * 0.07, up = 3.5 + sp * 0.03;
  const fx = Math.sin(CAM.yaw), fz = Math.cos(CAM.yaw);
  let tx = c.x - fx * back, tz = c.z - fz * back, ty = c.y + up;
  // pull in if a building is between
  for (let k = 0; k < 6; k++) { if (!pointBlocked(tx, ty - 0.5, tz)) break; tx = lerp(tx, c.x, 0.3); tz = lerp(tz, c.z, 0.3); ty += 0.6; }
  ty = Math.max(ty, ground(tx, tz) + 1.4);
  const k = 1 - Math.exp(-9 * dt);
  CAM.x = lerp(CAM.x, tx, k); CAM.z = lerp(CAM.z, tz, k); CAM.y = lerp(CAM.y, ty, 1 - Math.exp(-6 * dt));
  const s = G.shake * 0.8;
  camera.position.set(CAM.x + rand(-s, s), CAM.y + rand(-s, s), CAM.z + rand(-s, s));
  camera.lookAt(c.x + fx * 6, c.y + 1.7, c.z + fz * 6);
  const tf = baseFov() + clamp(sp / 45, 0, 1.3) * 10 + (c.boost > 0 ? 7 : 0);
  if (Math.abs(camera.fov - tf) > 0.05) { camera.fov = lerp(camera.fov, tf, 1 - Math.exp(-4 * dt)); camera.updateProjectionMatrix(); }
}
export function orbitCam(dt, cx, cy, cz, radius, height, speed, lookY) {
  CAM.orbit += dt * speed;
  camera.position.set(cx + Math.sin(CAM.orbit) * radius, cy + height, cz + Math.cos(CAM.orbit) * radius);
  camera.lookAt(cx, cy + (lookY == null ? 1 : lookY), cz);
  if (Math.abs(camera.fov - baseFov()) > 0.05) { camera.fov = baseFov(); camera.updateProjectionMatrix(); }
}
