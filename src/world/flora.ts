// Desert plants and ground clutter. Saguaros are the destructible cactus props; everything else is
// instanced decoration with no collision.
import * as THREE from 'three';
import { scene } from '../engine/renderer.js';
import { TAU, mulberry32 } from '../engine/util.js';
import { baseHeight } from './terrain.js';

const _c = new THREE.Color();
function colorize(g: THREE.BufferGeometry, fn: (x: number, y: number, z: number, i: number, out: THREE.Color) => void) {
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { fn(p.getX(i), p.getY(i), p.getZ(i), i, _c); col.set([_c.r, _c.g, _c.b], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
/** Merge non-indexed copies of geometries that all carry position, normal and color. */
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.map(g => (g.index ? g.toNonIndexed() : g));
  let n = 0; for (const g of flat) n += g.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const arr = new Float32Array(n * 3); let o = 0;
    for (const g of flat) { arr.set(g.attributes[name].array as Float32Array, o); o += g.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, 3));
  }
  out.computeBoundingSphere();
  return out;
}

// ---------- saguaro ----------
/** A tube with pleated ribs along a path, capped with a rounded tip. */
function ribbedTube(points: THREE.Vector3[], radius: number, ribs: number, seg: number): THREE.BufferGeometry[] {
  const curve = new THREE.CatmullRomCurve3(points);
  const tube = new THREE.TubeGeometry(curve, seg, radius, ribs * 2, false);
  const p = tube.attributes.position, nrm = tube.attributes.normal, ring = ribs * 2 + 1;
  for (let i = 0; i < p.count; i++) {
    const j = i % ring, k = Math.floor(i / ring), t = k / seg;
    const taper = 1 - 0.12 * t, d = radius * ((j % 2 ? -0.09 : 0.06) + (taper - 1));
    p.setXYZ(i, p.getX(i) + nrm.getX(i) * d, p.getY(i) + nrm.getY(i) * d, p.getZ(i) + nrm.getZ(i) * d);
  }
  tube.computeVertexNormals();
  colorize(tube, (x, y, z, i, out) => out.setHex((i % ring) % 2 ? 0x2f5a2c : 0x4f8a42).lerp(new THREE.Color(0x8a8a4a), Math.max(0, 0.35 - y * 0.25)));
  const end = points[points.length - 1], tip = new THREE.SphereGeometry(radius * 0.86, ribs * 2, 6, 0, TAU, 0, Math.PI / 2);
  tip.translate(end.x, end.y - radius * 0.05, end.z);
  colorize(tip, (x, y, z, i, out) => out.setHex(0x5a9248).lerp(new THREE.Color(0xd8c890), y > end.y + radius * 0.6 ? 0.5 : 0));
  return [tube, tip];
}
const SAGUARO_CACHE = new Map<string, THREE.BufferGeometry>();
/** Saguaro of scale s (about 5 m tall at 1) with 0..3 arms, deterministic per seed. */
export function saguaroGeometry(s: number, seed: number): THREE.BufferGeometry {
  const key = s.toFixed(2) + ':' + seed;
  const hit = SAGUARO_CACHE.get(key); if (hit) return hit;
  const r = mulberry32(seed), H = 5 * s, R = 0.42 * s, V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const parts = ribbedTube([V(0, -0.3, 0), V(0, H * 0.4, 0), V(r() * 0.1 * s, H * 0.8, 0), V(0, H, 0)], R, 11, 10);
  const arms = r() < 0.15 ? 0 : 1 + Math.floor(r() * 2.6);
  for (let a = 0; a < arms; a++) {
    const ang = r() * TAU, cx = Math.sin(ang), cz = Math.cos(ang), y0 = H * (0.32 + r() * 0.28), out = (0.8 + r() * 0.5) * s, up = H * (0.25 + r() * 0.3), ar = R * (0.62 + r() * 0.12);
    parts.push(...ribbedTube([V(cx * R * 0.3, y0, cz * R * 0.3), V(cx * out * 0.7, y0 + 0.05 * s, cz * out * 0.7), V(cx * out, y0 + 0.5 * s, cz * out), V(cx * out, y0 + up, cz * out)], ar, 9, 8));
  }
  const g = merge(parts); SAGUARO_CACHE.set(key, g); return g;
}
export const cactusMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0 });

// ---------- boulders ----------
/** A lumpy, faceted boulder of radius ~1 (scale it), flattened a little. */
export function boulderGeometry(seed: number, detail = 1): THREE.BufferGeometry {
  const r = mulberry32(seed), g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position, lumps = [0, 1, 2, 3].map(() => new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize()), v = new THREE.Vector3();
  const cache = new Map<string, number>(); // keep shared corners welded so the rock stays closed
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i)); const key = v.toArray().map(n => n.toFixed(3)).join();
    let k = cache.get(key);
    if (k == null) { k = 1; for (const l of lumps) k += 0.22 * Math.max(0, v.dot(l)) - 0.06; k += (r() - 0.5) * 0.18; cache.set(key, k); }
    v.multiplyScalar(k); v.y = v.y > 0 ? v.y * 0.72 : v.y * 0.4;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// ---------- scatter ----------
function grassTuft(r: () => number): THREE.BufferGeometry {
  const blades: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 11; i++) { // one double-sided triangle per blade
    const h = 0.35 + r() * 0.45, a = r() * TAU, lean = 0.15 + r() * 0.35, w = 0.05;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([-w, 0, 0, w, 0, 0, 0, h, 0], 3));
    g.rotateZ(lean); g.rotateY(a); g.translate(Math.sin(a) * 0.08, 0, Math.cos(a) * 0.08); g.computeVertexNormals();
    const n = g.attributes.normal; for (let k = 0; k < 3; k++) n.setXYZ(k, 0, 1, 0); // light blades like the ground under them
    blades.push(colorize(g, (x, y, z, k, out) => out.setHex(0x8a7a3e).lerp(new THREE.Color(0xd8c27a), Math.min(1, y * 1.8))));
  }
  return merge(blades);
}
function sagebrush(r: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const g = new THREE.IcosahedronGeometry(0.32 + r() * 0.2, 0), a = r() * TAU, d = r() * 0.35;
    g.scale(1, 0.75, 1); g.translate(Math.sin(a) * d, 0.28 + r() * 0.2, Math.cos(a) * d);
    parts.push(colorize(g, (x, y, z, k, out) => out.setHex(r() < 0.5 ? 0x7d8a5e : 0x949a70).multiplyScalar(0.85 + y * 0.3)));
  }
  return merge(parts);
}
function pricklyPear(r: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const pad = (x: number, y: number, z: number, ry: number, rz: number, s: number) => {
    const g = new THREE.SphereGeometry(0.28 * s, 8, 6); g.scale(1, 1.25, 0.32); g.rotateZ(rz); g.rotateY(ry); g.translate(x, y, z);
    parts.push(colorize(g, (px, py, pz, k, out) => out.setHex(0x5f8a4a).lerp(new THREE.Color(0x9aa04a), r() * 0.25)));
  };
  for (let i = 0; i < 4; i++) { const a = r() * TAU; pad(Math.sin(a) * 0.25, 0.3, Math.cos(a) * 0.25, a, (r() - 0.5) * 0.6, 1); pad(Math.sin(a) * 0.35, 0.75, Math.cos(a) * 0.35, a + 0.5, (r() - 0.5) * 0.9, 0.85); }
  return merge(parts);
}
function ocotillo(r: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const h = 2.4 + r() * 1.6, g = new THREE.CylinderGeometry(0.025, 0.05, h, 4, 3); g.translate(0, h / 2, 0); g.rotateZ(0.12 + r() * 0.25); g.rotateY(r() * TAU);
    parts.push(colorize(g, (x, y, z, k, out) => out.setHex(0x4a4a30).lerp(new THREE.Color(0x6a8a3a), Math.min(1, y / 3))));
  }
  return merge(parts);
}

export interface ScatterOpts { lowQ: boolean; blocked: (x: number, z: number, pad: number) => boolean }
/** Instanced ground cover across the arena floor. Purely visual. */
export function buildScatter({ lowQ, blocked }: ScatterOpts) {
  const r = mulberry32(2024), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
  const kinds: Array<{ geo: THREE.BufferGeometry; n: number; scale: [number, number]; pad: number; minR: number; shadow: boolean; mat?: THREE.Material }> = [
    { geo: grassTuft(r), n: lowQ ? 900 : 2800, scale: [0.7, 1.5], pad: 0.5, minR: 30, shadow: false, mat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }) },
    { geo: sagebrush(r), n: lowQ ? 120 : 320, scale: [0.7, 1.5], pad: 1.2, minR: 55, shadow: true },
    { geo: pricklyPear(r), n: lowQ ? 30 : 70, scale: [0.8, 1.4], pad: 1.5, minR: 60, shadow: true },
    { geo: ocotillo(r), n: lowQ ? 10 : 24, scale: [0.8, 1.2], pad: 2, minR: 70, shadow: true },
    { geo: boulderGeometry(5, 0), n: lowQ ? 200 : 520, scale: [0.12, 0.45], pad: 0.6, minR: 20, shadow: false, mat: new THREE.MeshStandardMaterial({ color: 0xa86848, roughness: 0.95, flatShading: true }) },
  ];
  for (const k of kinds) {
    const mesh = new THREE.InstancedMesh(k.geo, k.mat || mat, k.n); let n = 0;
    for (let t = 0; t < k.n * 12 && n < k.n; t++) {
      const a = r() * TAU, R = k.minR + Math.sqrt(r()) * (178 - k.minR), x = Math.sin(a) * R, z = Math.cos(a) * R;
      if (blocked(x, z, k.pad)) continue;
      const s = k.scale[0] + r() * (k.scale[1] - k.scale[0]);
      q.setFromAxisAngle(up, r() * TAU); s3.set(s, s * (0.85 + r() * 0.3), s); p3.set(x, baseHeight(x, z) - 0.05, z);
      mesh.setMatrixAt(n++, m4.compose(p3, q, s3));
    }
    mesh.count = n; mesh.castShadow = k.shadow; mesh.receiveShadow = true; mesh.instanceMatrix.needsUpdate = true;
    scene.add(mesh);
  }
}

// ---------- tumbleweeds ----------
interface Weed { mesh: THREE.Mesh; x: number; z: number; v: number; phase: number; r: number }
const WEEDS: Weed[] = [];
const WIND = new THREE.Vector2(0.94, 0.34).normalize();
function tumbleweedGeometry(seed: number): THREE.BufferGeometry {
  const r = mulberry32(seed), parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 26; i++) {
    const a = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize().multiplyScalar(0.55), b = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize().multiplyScalar(0.55);
    const mid = a.clone().add(b).multiplyScalar(0.3);
    const g = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 5, 0.018, 3, false);
    parts.push(colorize(g, (x, y, z, k, out) => out.setHex(r() < 0.5 ? 0xb89a68 : 0x9a7a50)));
  }
  return merge(parts);
}
export function buildTumbleweeds(n: number, ground: (x: number, z: number) => number) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), r = mulberry32(77);
  for (let i = 0; i < n; i++) {
    const mesh = new THREE.Mesh(tumbleweedGeometry(300 + i), mat); mesh.castShadow = true;
    const a = r() * TAU, R = 40 + r() * 120, s = 0.8 + r() * 0.6; mesh.scale.setScalar(s);
    WEEDS.push({ mesh, x: Math.sin(a) * R, z: Math.cos(a) * R, v: 3 + r() * 4, phase: r() * TAU, r: 0.55 * s });
    scene.add(mesh);
  }
  tumbleGround = ground;
}
let tumbleGround: (x: number, z: number) => number = () => 0;
const _axis = new THREE.Vector3(), _q = new THREE.Quaternion();
/** Roll the tumbleweeds downwind with little hops; ones that reach the canyon wrap to the far side. */
export function updateTumbleweeds(dt: number, t: number) {
  for (const w of WEEDS) {
    const gust = 0.7 + 0.5 * Math.sin(t * 0.7 + w.phase);
    w.x += WIND.x * w.v * gust * dt; w.z += WIND.y * w.v * gust * dt;
    if (Math.hypot(w.x, w.z) > 176) { w.x = -w.x * 0.98; w.z = -w.z * 0.98; }
    const hop = Math.abs(Math.sin(t * 2.2 + w.phase)) * 0.6 * gust;
    w.mesh.position.set(w.x, tumbleGround(w.x, w.z) + w.r + hop, w.z);
    _axis.set(WIND.y, 0, -WIND.x); _q.setFromAxisAngle(_axis, w.v * gust * dt / w.r); w.mesh.quaternion.premultiply(_q);
  }
}
