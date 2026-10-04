import * as THREE from 'three';
import { GEO, MAT_VC, PB, sphGeo } from '../engine/geometry.js';
import { addToScene } from '../engine/renderer.js';

// ================= projectile meshes (pooled) =================
const POOLS = {};
function makePool(name, n, factory) {
  const arr = []; for (let i = 0; i < n; i++) { const m = factory(); m.visible = false; addToScene(m, 'combat'); arr.push(m); }
  POOLS[name] = { arr, i: 0 };
}
export function takeMesh(name) {
  const p = POOLS[name]; const n = p.arr.length;
  for (let k = 0; k < n; k++) { const m = p.arr[(p.i + k) % n]; if (!m.visible) { p.i = (p.i + k + 1) % n; m.visible = true; return m; } }
  const m = p.arr[p.i]; p.i = (p.i + 1) % n; m.visible = true; return m;
}
export function initPools() {
  const bulletMat = new THREE.MeshBasicMaterial({ color: 0xffe08a });
  makePool('bullet', 160, () => { const m = new THREE.Mesh(GEO.box, bulletMat); m.scale.set(0.14, 0.14, 1.8); return m; });
  const missileGeo = new PB().cyl(0.16, 0.16, 1.2, 8, 0xd8d0c4, 0, 0, 0, Math.PI / 2).cone(0.16, 0.45, 8, 0xc0392b, 0, 0, 0.82, Math.PI / 2).box(0.6, 0.05, 0.25, 0x5a5048, 0, 0, -0.5).box(0.05, 0.6, 0.25, 0x5a5048, 0, 0, -0.5).build();
  makePool('missile', 40, () => new THREE.Mesh(missileGeo, MAT_VC));
  const rocketGeo = new PB().cyl(0.11, 0.11, 0.8, 6, 0x6a6258, 0, 0, 0, Math.PI / 2).cone(0.11, 0.3, 6, 0xff9a3c, 0, 0, 0.55, Math.PI / 2).build();
  makePool('rocket', 40, () => new THREE.Mesh(rocketGeo, MAT_VC));
  const flareMat = new THREE.MeshBasicMaterial({ color: 0xfff4d0 });
  makePool('flare', 8, () => new THREE.Mesh(sphGeo(0.3, 8, 6), flareMat));
  const shellGeo = new PB().sph(0.36, 0x3a3a3a, 0, 0, 0, 1, 1, 1.3).build();
  makePool('shell', 24, () => new THREE.Mesh(shellGeo, MAT_VC));
  const mineGeo = new PB().cyl(0.55, 0.65, 0.3, 10, 0x4a4238, 0, 0.15, 0).cyl(0.2, 0.25, 0.15, 8, 0x2a2622, 0, 0.35, 0).build();
  const mineLightMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
  makePool('mine', 40, () => { const g = new THREE.Group(); const m = new THREE.Mesh(mineGeo, MAT_VC); g.add(m); const l = new THREE.Mesh(sphGeo(0.12, 6, 4), mineLightMat); l.position.y = 0.45; g.add(l); g.userData.light = l; return g; });
  const fbMat = new THREE.MeshBasicMaterial({ color: 0xffa030 });
  makePool('fireball', 12, () => new THREE.Mesh(sphGeo(0.8, 10, 8), fbMat));
  const canMat = new THREE.MeshBasicMaterial({ color: 0xfff0b0 });
  makePool('cannon', 16, () => new THREE.Mesh(sphGeo(0.32, 8, 6), canMat));
  const scrapGeo = new PB().rock(0.6, 0x6b5a4a, 0, 0, 0, 0, 1, 1, 1).box(0.8, 0.2, 0.3, 0x3f5a4a, 0.2, 0.3, 0).build();
  makePool('scrap', 16, () => new THREE.Mesh(scrapGeo, MAT_VC));
  const iceMat = new THREE.MeshBasicMaterial({ color: 0x9fe8ff });
  makePool('ice', 12, () => new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), iceMat));
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  makePool('ring', 10, () => { const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40), ringMat.clone()); m.rotation.x = -Math.PI / 2; return m; });
}
export const PROJ = [];
export const MINES = [];
export const RINGS = [];
/** Smoke clouds that homing weapons can't see through: { x, z, r, t } (t = seconds left). */
export const SMOKES = [];
export function clearWeapons() {
  for (const p of PROJ) if (p.mesh) p.mesh.visible = false; PROJ.length = 0;
  for (const m of MINES) m.mesh.visible = false; MINES.length = 0;
  for (const r of RINGS) r.mesh.visible = false; RINGS.length = 0;
  SMOKES.length = 0;
}
