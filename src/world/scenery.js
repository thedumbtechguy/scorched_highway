import * as THREE from 'three';
import { MAT_VC, PB, mat4, signTexture } from '../engine/geometry.js';
import { scene } from '../engine/renderer.js';
import { TAU, clamp, mulberry32, smooth, srand } from '../engine/util.js';
import { ARENA_R, RAMPS, baseHeight, ground } from './terrain.js';

// ================= collision data =================
export const BOXES = [];   // {minX,maxX,minZ,maxZ,h}
export const CIRCLES = []; // {x,z,r,h}
function addBox(cx, cz, w, d, h) { BOXES.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, h }); }

export let terrainMesh, staticMesh;
export const SIGN_MESHES = [];
export function buildTerrain(lowQ) {
  const SIZE = 440, SEG = lowQ ? 88 : 120;
  /** @type {THREE.BufferGeometry} */
  let g = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, baseHeight(p.getX(i), p.getZ(i)));
  g = g.toNonIndexed(); g.computeVertexNormals();
  const pos = g.attributes.position, nor = g.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  const sandA = new THREE.Color(0xe0a064), sandB = new THREE.Color(0xd0864e), rock = new THREE.Color(0xa4553a), town = new THREE.Color(0xcf9a68), c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 3) {
    const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3, cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3, cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const n = 0.5 + 0.5 * Math.sin(cx * 0.21 + Math.sin(cz * 0.17) * 2) * Math.cos(cz * 0.13 - cx * 0.05);
    c.copy(sandB).lerp(sandA, clamp(n * 0.7 + (cy + 2) * 0.06, 0, 1));
    const r = Math.hypot(cx, cz);
    if (r < 80) c.lerp(town, (1 - smooth(55, 80, r)) * 0.5);
    const slope = 1 - nor.getY(i);
    c.lerp(rock, clamp(slope * 5, 0, 0.8));
    if (r > 170) c.lerp(rock, smooth(170, 205, r) * 0.7);
    const j = (srand() - 0.5) * 0.05; c.r += j; c.g += j; c.b += j * 0.6;
    for (let k = 0; k < 3; k++) { col[(i + k) * 3] = c.r; col[(i + k) * 3 + 1] = c.g; col[(i + k) * 3 + 2] = c.b; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  terrainMesh = new THREE.Mesh(g, MAT_VC); terrainMesh.receiveShadow = true; scene.add(terrainMesh);
  terrainMesh.userData.phong = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 0, specular: 0x000000 });
  // outer desert floor
  const outer = new THREE.Mesh(new THREE.RingGeometry(200, 1500, 48, 1), new THREE.MeshLambertMaterial({ color: 0xc27a48 }));
  outer.rotation.x = -Math.PI / 2; outer.position.y = 29.6; scene.add(outer);
}

function ribbon(points, width, color, yOff, dashed) {
  const pos = [], idx = []; let n = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1]; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const px = -dz * width / 2, pz = dx * width / 2; const [x, z] = points[i];
    pos.push(x + px, ground(x + px, z + pz) + yOff, z + pz, x - px, ground(x - px, z - pz) + yOff, z - pz);
    if (i > 0 && (!dashed || i % 2 === 1)) { const k = n - 2; idx.push(k, n, k + 1, k + 1, n, n + 1); }
    n += 2;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.receiveShadow = true; scene.add(m); return m;
}

// buildings: cx,cz,w,d,h,color,front(+1 faces +z, -1 faces -z),sign
const BUILDINGS = [
  { cx: -49, cz: 19, w: 14, d: 10, h: 7, c: 0xc98b5b, f: -1, sign: 'Saloon', sc: ['#7a2a1f', '#f6ead4'] },
  { cx: -29, cz: 18, w: 12, d: 9, h: 6, c: 0x8fa3a0, f: -1, sign: 'Feed & Seed', sc: ['#f6ead4', '#2a1838'] },
  { cx: -11, cz: 20, w: 10, d: 12, h: 11, c: 0xb55d3c, f: -1, sign: 'Hotel', sc: ['#2a1838', '#f2b134'] },
  { cx: 22, cz: 19, w: 16, d: 10, h: 6, c: 0xe0b66e, f: -1, sign: 'Eats', sc: ['#c0392b', '#f6ead4'] },
  { cx: 43, cz: 18, w: 10, d: 9, h: 8, c: 0x9c6b8e, f: -1, sign: 'Motel', sc: ['#27888a', '#f6ead4'] },
  { cx: -48, cz: -19, w: 16, d: 10, h: 7, c: 0x7e8c6a, f: 1, sign: 'Garage', sc: ['#f2b134', '#2a1838'] },
  { cx: -27, cz: -18, w: 10, d: 9, h: 6, c: 0xd9a066, f: 1, sign: 'Jail', sc: ['#2a1838', '#f6ead4'] },
  { cx: -1, cz: -21, w: 14, d: 10, h: 8, c: 0xc47f5a, f: 1, sign: 'Bank', sc: ['#f6ead4', '#7a2a1f'] },
  { cx: 34, cz: -34, w: 8, d: 5, h: 4, c: 0xefe4d0, f: 1, sign: null },
];
const MESAS = [
  { x: -110, z: -70, r: 16, h: 30 }, { x: 95, z: 85, r: 13, h: 24 }, { x: 60, z: -120, r: 11, h: 18 }, { x: -60, z: 125, r: 10, h: 16 },
];

export function buildStatic() {
  const pb = new PB();
  // buildings
  for (const b of BUILDINGS) {
    const fz = b.cz + b.f * b.d / 2; // front face z
    const shade = new THREE.Color(b.c).multiplyScalar(0.72).getHex();
    const light = new THREE.Color(b.c).lerp(new THREE.Color(0xffffff), 0.18).getHex();
    pb.box(b.w, b.h, b.d, b.c, b.cx, b.h / 2, b.cz);
    pb.box(b.w + 0.5, 0.45, b.d + 0.5, shade, b.cx, b.h + 0.2, b.cz);
    if (b.sign) {
      // false front
      pb.box(b.w, 2.4, 0.5, light, b.cx, b.h + 1.2, fz + b.f * 0.1);
      // porch roof + posts
      pb.box(b.w, 0.25, 2.8, shade, b.cx, 3.4, fz + b.f * 1.4);
      for (const px of [-b.w / 2 + 0.3, b.w / 2 - 0.3, -b.w / 6, b.w / 6]) pb.box(0.28, 3.3, 0.28, 0x5a3a2a, b.cx + px, 1.65, fz + b.f * 2.65);
      pb.box(b.w, 0.3, 2.8, 0x6b4a36, b.cx, 0.15, fz + b.f * 1.4);
      // door & windows
      pb.box(1.8, 2.8, 0.12, 0x2a1d22, b.cx, 1.4, fz + b.f * 0.06);
      for (const wx of [-b.w / 3.2, b.w / 3.2]) {
        pb.box(1.8, 1.5, 0.12, 0x243640, b.cx + wx, 1.9, fz + b.f * 0.06);
        if (b.h >= 7.5) pb.box(1.6, 1.4, 0.12, 0x243640, b.cx + wx, b.h - 2.4, fz + b.f * 0.06);
      }
      if (b.h >= 10) { pb.box(1.6, 1.4, 0.12, 0x243640, b.cx, b.h - 2.4, fz + b.f * 0.06); pb.box(1.6, 1.4, 0.12, 0x243640, b.cx + b.w / 3.2, 5.6, fz + b.f * 0.06); pb.box(1.6, 1.4, 0.12, 0x243640, b.cx - b.w / 3.2, 5.6, fz + b.f * 0.06); }
      addBox(b.cx, b.cz + b.f * 1.4, b.w, b.d + 2.8, b.h);
      // sign
      const tex = signTexture(b.sign, b.sc[0], b.sc[1], 512, 128);
      const sm = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(b.w - 1.5, 9), 2.0), new THREE.MeshLambertMaterial({ map: tex }));
      sm.position.set(b.cx, b.h + 1.1, fz + b.f * 0.4); if (b.f < 0) sm.rotation.y = Math.PI;
      scene.add(sm); SIGN_MESHES.push(sm);
    } else {
      pb.box(1.4, 2.4, 0.12, 0x2a1d22, b.cx, 1.2, fz + b.f * 0.06);
      pb.box(2.4, 1.2, 0.12, 0x243640, b.cx + 2, 2, fz + b.f * 0.06);
      addBox(b.cx, b.cz, b.w, b.d, b.h);
    }
    // side windows
    pb.box(0.12, 1.3, 1.6, 0x243640, b.cx - b.w / 2 - 0.02, 2.2, b.cz); pb.box(0.12, 1.3, 1.6, 0x243640, b.cx + b.w / 2 + 0.02, 2.2, b.cz);
  }
  // gas station canopy
  pb.box(16, 0.6, 11, 0xefe4d0, 34, 5.4, -24); pb.box(16.2, 0.4, 11.2, 0xc0392b, 34, 5.0, -24);
  for (const [px, pz] of [[27, -19.5], [41, -19.5], [27, -28.5], [41, -28.5]]) { pb.cyl(0.3, 0.3, 5, 6, 0xd8d0c4, px, 2.5, pz); CIRCLES.push({ x: px, z: pz, r: 0.45, h: 5 }); }
  pb.box(0.4, 9, 0.4, 0x5a5048, 48, 4.5, -16); CIRCLES.push({ x: 48, z: -16, r: 0.5, h: 9 });
  { const t = signTexture('Gas', '#c0392b', '#f6ead4', 256, 256); const sm = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide })); sm.position.set(48, 10.4, -16); sm.rotation.y = Math.PI / 2; scene.add(sm); SIGN_MESHES.push(sm); }
  // mesas inside arena
  const bands = [0xb4552f, 0xc9733f, 0x9a4630, 0xd08a52];
  for (const m of MESAS) {
    const gy = baseHeight(m.x, m.z) - 2;
    pb.cyl(m.r * 0.92, m.r, m.h * 0.45, 8, bands[0], m.x, gy + m.h * 0.225, m.z, 0, 0.2);
    pb.cyl(m.r * 0.84, m.r * 0.92, m.h * 0.3, 8, bands[1], m.x, gy + m.h * 0.6, m.z, 0, 0.2);
    pb.cyl(m.r * 0.8, m.r * 0.84, m.h * 0.25, 8, bands[2], m.x, gy + m.h * 0.875, m.z, 0, 0.2);
    pb.rock(3, bands[2], m.x + m.r * 0.9, gy + 1.5, m.z + 2, 0.4, 1.4, 1, 1.2);
    CIRCLES.push({ x: m.x, z: m.z, r: m.r * 0.98, h: gy + m.h + 2 });
  }
  // far mesas
  const fr = mulberry32(42);
  for (let i = 0; i < 26; i++) {
    const a = i / 26 * TAU + fr() * 0.2, R = 250 + fr() * 260, r = 18 + fr() * 40, h = 25 + fr() * 70;
    const x = Math.sin(a) * R, z = Math.cos(a) * R, y = 28;
    pb.cyl(r * 0.85, r, h * 0.55, 7, bands[i % 4], x, y + h * 0.275, z, 0, fr() * 3);
    pb.cyl(r * 0.75, r * 0.85, h * 0.45, 7, bands[(i + 1) % 4], x, y + h * 0.775, z, 0, fr() * 3);
  }
  // rocks
  const rr = mulberry32(7);
  for (let i = 0; i < 26; i++) {
    let x, z, ok = false;
    for (let t = 0; t < 20 && !ok; t++) { const a = rr() * TAU, R = 75 + rr() * 100; x = Math.sin(a) * R; z = Math.cos(a) * R; ok = clearSpot(x, z, 10); }
    if (!ok) continue;
    const s = 1.2 + rr() * 1.8, y = baseHeight(x, z);
    pb.rock(s, 0x9a5a3e, x, y + s * 0.4, z, rr() * 3, 1.2, 0.8, 1);
    if (rr() < 0.6) pb.rock(s * 0.6, 0xa8674a, x + s, y + s * 0.2, z + s * 0.5, rr() * 3, 1, 0.8, 1);
    CIRCLES.push({ x, z, r: s * 1.1, h: y + s * 1.4 });
  }
  // scrub bushes (decor only)
  for (let i = 0; i < 90; i++) {
    const a = rr() * TAU, R = 20 + rr() * 160; const x = Math.sin(a) * R, z = Math.cos(a) * R;
    if (Math.abs(z) < 7 || !clearSpot(x, z, 3)) continue;
    const y = baseHeight(x, z); pb.rock(0.5 + rr() * 0.5, rr() < 0.5 ? 0x6f7a3a : 0x8a7a44, x, y + 0.2, z, rr() * 3, 1.3, 0.6, 1.3);
  }
  // telephone poles along highway
  for (const sx of [-1, 1]) for (let x = 76; x < 180; x += 34) {
    const px = sx * x, pz = -8.5, y = baseHeight(px, pz);
    pb.box(0.35, 9, 0.35, 0x5a4232, px, y + 4.5, pz); pb.box(2.4, 0.25, 0.25, 0x5a4232, px, y + 8.2, pz);
    CIRCLES.push({ x: px, z: pz, r: 0.45, h: y + 9 });
  }
  // ramps
  for (const r of RAMPS) {
    const L = r.len, W = r.w, H = r.h;
    const g = new THREE.BufferGeometry();
    const v = [ // wedge rising along +z (local)
      -W / 2, 0, -L / 2, W / 2, 0, -L / 2, W / 2, H, L / 2, -W / 2, H, L / 2, // top
      -W / 2, 0, L / 2, W / 2, 0, L / 2, // bottom back
    ];
    const tris = [0, 3, 2, 0, 2, 1, 1, 2, 5, 0, 4, 3, 4, 5, 2, 4, 2, 3];
    const pos = []; for (const t of tris) pos.push(v[t * 3], v[t * 3 + 1], v[t * 3 + 2]);
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    pb.add(g, 0x8a5a3a, mat4(r.x, r.base, r.z, 0, r.yaw, 0));
    // stripes on ramp top
    for (let k = -1; k <= 1; k += 2) pb.box(0.5, 0.06, Math.hypot(L, H), 0xf2b134, r.x + r.c * k * W * 0.3, r.base + H / 2 + 0.05, r.z - r.s * k * W * 0.3, -Math.atan2(H, L), r.yaw, 0);
  }
  // water tank shadow base / town details: hitching rails, crates
  pb.box(6, 1, 0.2, 0x6b4a36, -40, 0.9, 11.5); pb.box(0.2, 1, 0.2, 0x6b4a36, -43, 0.5, 11.5); pb.box(0.2, 1, 0.2, 0x6b4a36, -37, 0.5, 11.5);
  staticMesh = new THREE.Mesh(pb.build(), MAT_VC); staticMesh.castShadow = true; staticMesh.receiveShadow = true; scene.add(staticMesh);
  // roads
  const hw = []; for (let x = -214; x <= 214; x += 4) hw.push([x, 0]);
  ribbon(hw, 11, 0x5d4a4a, 0.14);
  ribbon(hw, 0.35, 0xf2b134, 0.18, true);
  const dirt = []; for (let z = 12; z <= 214; z += 4) dirt.push([4 + 12 * Math.sin(Math.max(0, z - 30) * 0.02), z]);
  ribbon(dirt, 7, 0xb97a4c, 0.13);
  const dirt2 = []; for (let z = -26; z >= -214; z -= 4) dirt2.push([-18 + 10 * Math.sin((z + 26) * 0.025), z]);
  ribbon(dirt2, 7, 0xb97a4c, 0.13);
}
export function clearSpot(x, z, m) {
  if (Math.hypot(x, z) > ARENA_R - 8) return false;
  if (Math.hypot(x, z) < 70) return false;
  for (const c of CIRCLES) if (Math.hypot(x - c.x, z - c.z) < c.r + m) return false;
  for (const r of RAMPS) if (Math.hypot(x - r.x, z - r.z) < 14 + m) return false;
  for (const m2 of MESAS) if (Math.hypot(x - m2.x, z - m2.z) < m2.r + m) return false;
  if (Math.abs(z) < 8 + m * 0.3) return false;
  return true;
}
