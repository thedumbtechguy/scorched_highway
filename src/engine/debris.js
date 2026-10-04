import * as THREE from 'three';
import { addToScene } from './renderer.js';
import { GRAV, rand } from './util.js';
import { ground } from '../world/terrain.js';

// ================= debris =================
const debrisGeo = new THREE.BoxGeometry(1, 1, 1);
const DEBRIS = [];
for (let i = 0; i < 70; i++) {
  const m = new THREE.Mesh(debrisGeo, new THREE.MeshLambertMaterial({ color: 0x444444 }));
  m.visible = false; m.castShadow = false; addToScene(m, 'combat');
  DEBRIS.push({ m, life: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, s: 1 });
}
let debrisIdx = 0;
export function spawnDebris(x, y, z, vx, vy, vz, size, color, life) {
  const d = DEBRIS[debrisIdx]; debrisIdx = (debrisIdx + 1) % DEBRIS.length;
  d.m.position.set(x, y, z); d.vx = vx; d.vy = vy; d.vz = vz; d.rx = rand(-10, 10); d.ry = rand(-10, 10);
  d.s = size; d.m.scale.set(size, size * rand(0.4, 1), size * rand(0.5, 1.2)); d.life = life || rand(1.8, 3);
  d.m.material.color.setHex(color); d.m.visible = true;
}
export function updateDebris(dt) {
  for (const d of DEBRIS) {
    if (d.life <= 0) continue;
    d.life -= dt; if (d.life <= 0) { d.m.visible = false; continue; }
    const p = d.m.position; d.vy -= GRAV * dt;
    p.x += d.vx * dt; p.y += d.vy * dt; p.z += d.vz * dt;
    const g = ground(p.x, p.z) + d.s * 0.3;
    if (p.y < g) { p.y = g; d.vy *= -0.35; d.vx *= 0.6; d.vz *= 0.6; d.rx *= 0.6; d.ry *= 0.6; }
    d.m.rotation.x += d.rx * dt; d.m.rotation.y += d.ry * dt;
    if (d.life < 0.5) { const k = d.life / 0.5 * d.s; d.m.scale.setScalar(Math.max(0.01, k)); }
  }
}
export function clearDebris() { for (const d of DEBRIS) { d.life = 0; d.m.visible = false; } }
