'use strict';
// ================= terrain =================
const ARENA_R = 184;
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
const RAMPS = [
  { x: -100, z: 0, yaw: Math.PI / 2, len: 16, w: 9, h: 4.2 },
  { x: 120, z: 20, yaw: 0, len: 16, w: 9, h: 4.2 },
  { x: -18, z: -96, yaw: Math.PI, len: 16, w: 9, h: 4.4 },
  { x: 70, z: 100, yaw: -Math.PI / 2, len: 16, w: 9, h: 4.0 },
];
for (const r of RAMPS) { r.s = Math.sin(r.yaw); r.c = Math.cos(r.yaw); r.base = rawHeight(r.x, r.z); FLATS.push({ x: r.x, z: r.z, r: 14, f: 10, h: r.base }); }
function baseHeight(x, z) {
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
function ground(x, z) { return baseHeight(x, z) + rampHeight(x, z); }

// ================= collision data =================
const BOXES = [];   // {minX,maxX,minZ,maxZ,h}
const CIRCLES = []; // {x,z,r,h}
function addBox(cx, cz, w, d, h) { BOXES.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, h }); }

let terrainMesh, staticMesh;
const SIGN_MESHES = [];
function buildTerrain(lowQ) {
  const SIZE = 440, SEG = lowQ ? 88 : 120;
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

function buildStatic() {
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
  for (const g of Object.values(GEO)) { } // cached geos stay for reuse
  // roads
  const hw = []; for (let x = -214; x <= 214; x += 4) hw.push([x, 0]);
  ribbon(hw, 11, 0x5d4a4a, 0.14);
  ribbon(hw, 0.35, 0xf2b134, 0.18, true);
  const dirt = []; for (let z = 12; z <= 214; z += 4) dirt.push([4 + 12 * Math.sin(Math.max(0, z - 30) * 0.02), z]);
  ribbon(dirt, 7, 0xb97a4c, 0.13);
  const dirt2 = []; for (let z = -26; z >= -214; z -= 4) dirt2.push([-18 + 10 * Math.sin((z + 26) * 0.025), z]);
  ribbon(dirt2, 7, 0xb97a4c, 0.13);
}
function clearSpot(x, z, m) {
  if (Math.hypot(x, z) > ARENA_R - 8) return false;
  if (Math.hypot(x, z) < 70) return false;
  for (const c of CIRCLES) if (Math.hypot(x - c.x, z - c.z) < c.r + m) return false;
  for (const r of RAMPS) if (Math.hypot(x - r.x, z - r.z) < 14 + m) return false;
  for (const m2 of MESAS) if (Math.hypot(x - m2.x, z - m2.z) < m2.r + m) return false;
  if (Math.abs(z) < 8 + m * 0.3) return false;
  return true;
}

// ================= destructible props =================
const PROPS = [];
function makeProp(kind, x, z, opts) {
  const y = ground(x, z);
  const group = new THREE.Group(); group.position.set(x, y, z);
  const pb = new PB();
  let r = 0.8, h = 3, hp = 10, solid = true, breakOnRam = 0, explosive = null, topple = false, debrisCol = 0x557a3a;
  switch (kind) {
    case 'cactus': {
      const g = 0x4f7a3a, g2 = 0x5f8c46, s = opts && opts.s || 1;
      pb.cyl(0.42 * s, 0.5 * s, 5 * s, 7, g, 0, 2.5 * s, 0); pb.sph(0.42 * s, g2, 0, 5 * s, 0, 1, 0.7, 1);
      pb.cyl(0.28 * s, 0.28 * s, 1.4 * s, 6, g, 0.8 * s, 2.4 * s, 0, 0, 0, Math.PI / 2); pb.cyl(0.28 * s, 0.3 * s, 1.8 * s, 6, g, 1.45 * s, 3.2 * s, 0); pb.sph(0.28 * s, g2, 1.45 * s, 4.1 * s, 0);
      if (srand() < 0.7) { pb.cyl(0.26 * s, 0.26 * s, 1.1 * s, 6, g, -0.65 * s, 3.1 * s, 0, 0, 0, Math.PI / 2); pb.cyl(0.26 * s, 0.28 * s, 1.3 * s, 6, g, -1.15 * s, 3.7 * s, 0); pb.sph(0.26 * s, g2, -1.15 * s, 4.35 * s, 0); }
      group.rotation.y = srand() * TAU; r = 0.7; h = 5 * s; hp = 8; breakOnRam = 3; debrisCol = 0x4f7a3a; break;
    }
    case 'barrel': {
      pb.cyl(0.55, 0.55, 1.3, 10, 0xc0392b, 0, 0.65, 0); pb.cyl(0.57, 0.57, 0.14, 10, 0xf6ead4, 0, 0.9, 0); pb.cyl(0.57, 0.57, 0.1, 10, 0x6a1e17, 0, 0.3, 0);
      r = 0.65; h = 1.4; hp = 6; breakOnRam = 4; explosive = { r: 8, dmg: 26 }; debrisCol = 0xc0392b; break;
    }
    case 'pump': {
      pb.box(1.1, 2.2, 0.8, 0xc0392b, 0, 1.1, 0); pb.box(0.9, 0.7, 0.82, 0xf6ead4, 0, 1.6, 0); pb.box(1.2, 0.3, 0.9, 0x2a1d22, 0, 2.35, 0); pb.box(0.2, 0.9, 0.2, 0x2a1d22, 0.62, 1.1, 0);
      r = 0.9; h = 2.5; hp = 14; breakOnRam = 9; explosive = { r: 11, dmg: 34, fire: true }; debrisCol = 0xc0392b; break;
    }
    case 'tower': {
      const wood = 0x7a5238, tank = 0x9c6a4a;
      for (const [lx, lz] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) pb.box(0.4, 10, 0.4, wood, lx * 0.92, 5, lz * 0.92, lz * 0.03, 0, -lx * 0.03);
      pb.box(4.6, 0.3, 0.3, wood, 0, 4, -2); pb.box(4.6, 0.3, 0.3, wood, 0, 4, 2); pb.box(0.3, 0.3, 4.6, wood, -2, 4, 0); pb.box(0.3, 0.3, 4.6, wood, 2, 4, 0);
      pb.box(5.6, 0.35, 5.6, wood, 0, 10.1, 0);
      pb.cyl(3, 3, 4.4, 12, tank, 0, 12.4, 0); pb.cyl(3.05, 3.05, 0.3, 12, 0x4a3226, 0, 11.2, 0); pb.cyl(3.05, 3.05, 0.3, 12, 0x4a3226, 0, 13.6, 0);
      pb.cone(3.4, 2, 12, 0x6b3a2a, 0, 15.6, 0);
      r = 3.2; h = 17; hp = 60; topple = true; debrisCol = 0x7a5238; break;
    }
    case 'billboard': {
      const wood = 0x6b4a36;
      pb.box(0.4, 7, 0.4, wood, -3.5, 3.5, 0); pb.box(0.4, 7, 0.4, wood, 3.5, 3.5, 0); pb.box(9.4, 4.4, 0.3, 0x4a3226, 0, 6.8, -0.1);
      const tex = signTexture(opts.text, opts.bg, opts.fg, 512, 256);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(9, 4), new THREE.MeshLambertMaterial({ map: tex }));
      face.position.set(0, 6.8, 0.07); group.add(face);
      const back = face.clone(); back.material = new THREE.MeshLambertMaterial({ color: 0x5a3e2c }); back.rotation.y = Math.PI; back.position.z = -0.27; group.add(back);
      group.rotation.y = opts.yaw || 0; r = 2.6; h = 9; hp = 40; topple = true; debrisCol = 0x6b4a36; break;
    }
  }
  const mesh = new THREE.Mesh(pb.build(), MAT_VC); mesh.castShadow = true; mesh.receiveShadow = kind === 'tower';
  group.add(mesh); scene.add(group);
  const p = { kind, x, z, y, r, h, hp, maxHp: hp, solid, breakOnRam, explosive, topple, debrisCol, group, alive: true, fall: null, rot0: group.rotation.y };
  PROPS.push(p); return p;
}
function buildProps() {
  makeProp('tower', -24, 38);
  makeProp('billboard', -82, 16, { text: 'Sundown Springs', bg: '#27888a', fg: '#f6ead4', yaw: 0 });
  makeProp('billboard', 92, -16, { text: 'Cold Pop 10 Miles', bg: '#f2b134', fg: '#7a2a1f', yaw: Math.PI });
  makeProp('billboard', 28, 96, { text: 'Hollis Salvage', bg: '#c0392b', fg: '#f6ead4', yaw: Math.PI * 0.85 });
  makeProp('pump', 31, -24); makeProp('pump', 37, -24);
  for (const [x, z] of [[-50, -10.5], [-48.6, -10], [-49.4, -8.8], [47, 10.5], [48.2, 11.4], [26, -33], [-8, 11], [-30, -11], [58, -8], [-62, 9]]) makeProp('barrel', x, z);
  const cr = mulberry32(99);
  let n = 0;
  for (let t = 0; t < 400 && n < 34; t++) {
    const a = cr() * TAU, R = 72 + cr() * 105; const x = Math.sin(a) * R, z = Math.cos(a) * R;
    if (!clearSpot(x, z, 4)) continue;
    let bad = false; for (const p of PROPS) if (Math.hypot(p.x - x, p.z - z) < 8) bad = true; if (bad) continue;
    makeProp('cactus', x, z, { s: 0.8 + cr() * 0.5 }); n++;
  }
  for (const [x, z] of [[-66, 22], [64, -24], [8, 42], [-12, -40], [70, 14]]) makeProp('cactus', x, z, { s: 0.9 });
}
function resetProps() {
  for (const p of PROPS) {
    p.alive = true; p.hp = p.maxHp; p.fall = null; p.solid = true;
    p.group.visible = true; p.group.position.set(p.x, p.y, p.z); p.group.quaternion.identity(); p.group.rotation.set(0, p.rot0, 0);
  }
}
function damageProp(p, amt, by) {
  if (!p.alive) return; p.hp -= amt;
  if (p.hp <= 0) breakProp(p, by);
}
function breakProp(p, by, dirX, dirZ) {
  if (!p.alive) return; p.alive = false;
  const cnt = p.kind === 'cactus' ? 6 : 8;
  for (let i = 0; i < cnt * fxScale; i++) spawnDebris(p.x, p.y + rand(0.5, p.h * 0.6), p.z, rand(-6, 6), rand(4, 12), rand(-6, 6), rand(0.25, 0.7), p.debrisCol);
  if (p.topple) {
    let dx = dirX, dz = dirZ;
    if (dx == null) { if (by) { dx = p.x - by.x; dz = p.z - by.z; } else { dx = rand(-1, 1); dz = rand(-1, 1); } }
    const L = Math.hypot(dx, dz) || 1;
    p.fall = { t: 0, ax: dz / L, az: -dx / L, dx: dx / L, dz: dz / L, by, q0: p.group.quaternion.clone() };
    p.solid = false;
    playSfx('crash', p.x, p.z, 1);
  } else {
    p.group.visible = false; p.solid = false;
    if (p.explosive) explode(p.x, p.y + 1, p.z, p.explosive.r, p.explosive.dmg, by || null, { size: p.kind === 'pump' ? 2.2 : 1.4, fire: p.explosive.fire });
    else { puff(p.x, p.y + 1.5, p.z, 0x8a7a5a, 6); playSfx('crunch', p.x, p.z, 0.6); }
  }
}
const _axis = new THREE.Vector3();
function updateProps(dt) {
  for (const p of PROPS) {
    if (!p.fall) continue;
    const f = p.fall; if (f.t >= 1) continue;
    f.t = Math.min(1, f.t + dt / 1.3);
    const ang = f.t * f.t * (Math.PI / 2 - 0.08);
    _axis.set(f.ax, 0, f.az);
    _q1.setFromAxisAngle(_axis, ang); p.group.quaternion.copy(_q1).multiply(f.q0);
    if (f.t >= 1) {
      // impact
      const reach = p.kind === 'tower' ? 12 : 6;
      const ix = p.x + f.dx * reach, iz = p.z + f.dz * reach;
      shake(ix, iz, 0.9);
      if (p.kind === 'tower') {
        for (let i = 0; i < 60 * fxScale; i++) FX_SMOKE.spawn(ix + rand(-3, 3), p.y + 1, iz + rand(-3, 3), rand(-9, 9), rand(3, 14), rand(-9, 9), rand(0.8, 1.6), 1.2, 3.5, 0x9fd4e8, 0xe6f3f7, 0.8, 1.2, 14);
        for (const c of G.cars) if (c.alive) { const d = Math.hypot(c.x - ix, c.z - iz); if (d < 8) { damageCar(c, 45 * (1 - d / 10), f.by || null, 'tower'); c.vy += 6; } }
        playSfx('boom', ix, iz, 1.2);
      } else {
        puff(ix, p.y + 0.5, iz, 0xa98a62, 10);
        for (const c of G.cars) if (c.alive) { const d = Math.hypot(c.x - ix, c.z - iz); if (d < 5) damageCar(c, 18, f.by || null, 'sign'); }
      }
    }
  }
}
function puff(x, y, z, col, n) {
  for (let i = 0; i < n * fxScale; i++) FX_SMOKE.spawn(x + rand(-1, 1), y + rand(0, 1), z + rand(-1, 1), rand(-3, 3), rand(1, 4), rand(-3, 3), rand(0.8, 1.6), 1.2, 4, col, col, 0.55, 1.5, -1);
}

// ================= static collision queries =================
function pushOut(c, nx, nz, e) { // bounce velocity for moving object c
  const vn = c.vx * nx + c.vz * nz;
  if (vn < 0) { c.vx -= (1 + e) * vn * nx; c.vz -= (1 + e) * vn * nz; return -vn; }
  return 0;
}
function resolveStatic(c) {
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
function blockedAt(x, z, m, ignore) {
  if (Math.hypot(x, z) > ARENA_R - 3 - m) return true;
  for (const b of BOXES) if (x > b.minX - m && x < b.maxX + m && z > b.minZ - m && z < b.maxZ + m) return true;
  for (const o of CIRCLES) { const dx = x - o.x, dz = z - o.z, R = o.r + m; if (dx * dx + dz * dz < R * R) return true; }
  for (const p of PROPS) if (p.solid && (p.kind === 'tower' || p.kind === 'billboard' || p.kind === 'pump')) { const dx = x - p.x, dz = z - p.z, R = p.r + m; if (dx * dx + dz * dz < R * R) return true; }
  for (const c of G.cars) if (!c.alive && c !== ignore) { const dx = x - c.x, dz = z - c.z, R = c.radius + m; if (dx * dx + dz * dz < R * R) return true; }
  return false;
}
function pointBlocked(x, y, z) { // for projectiles & line of sight
  if (y < ground(x, z) - 0.2) return true;
  for (const b of BOXES) if (y < b.h && x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) return true;
  for (const o of CIRCLES) if (y < o.h) { const dx = x - o.x, dz = z - o.z; if (dx * dx + dz * dz < o.r * o.r) return true; }
  return false;
}
function lineOfSight(x1, y1, z1, x2, y2, z2) {
  const d = Math.hypot(x2 - x1, y2 - y1, z2 - z1); const n = Math.ceil(d / 4);
  for (let i = 1; i < n; i++) { const t = i / n; if (pointBlocked(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, z1 + (z2 - z1) * t)) return false; }
  return true;
}

// ================= pickups =================
const PICK = {
  missile: { color: 0xe8433a, css: '#e8433a', amt: 8, label: 'Homing missiles' },
  mortar: { color: 0x2fb5b0, css: '#2fb5b0', amt: 6, label: 'Mortar' },
  mines: { color: 0xf4cf3a, css: '#f4cf3a', amt: 6, label: 'Mines' },
  flame: { color: 0xff7a1f, css: '#ff7a1f', amt: 8, label: 'Torch' },
  repair: { color: 0x5fd068, css: '#5fd068', amt: 55, label: 'Repair' },
  special: { color: 0x9b6bff, css: '#9b6bff', amt: 2, label: 'Special ammo' },
};
const AMMO_CAP = { missile: 16, mortar: 12, mines: 12, flame: 16 };
const WEAPON_ORDER = ['missile', 'mortar', 'mines', 'flame'];
function drawGlyph(ctx, type, s, color) {
  ctx.save(); ctx.translate(s / 2, s / 2); const k = s / 100;
  ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = 9 * k; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const P = (pts) => { ctx.beginPath(); ctx.moveTo(pts[0] * k, pts[1] * k); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i] * k, pts[i + 1] * k); ctx.closePath(); ctx.fill(); };
  switch (type) {
    case 'missile':
      ctx.rotate(Math.PI / 4);
      ctx.beginPath(); ctx.moveTo(0, -40 * k); ctx.quadraticCurveTo(13 * k, -24 * k, 11 * k, 18 * k); ctx.lineTo(-11 * k, 18 * k); ctx.quadraticCurveTo(-13 * k, -24 * k, 0, -40 * k); ctx.fill();
      P([-11, 4, -24, 26, -11, 20]); P([11, 4, 24, 26, 11, 20]); ctx.globalAlpha = 0.7; P([-6, 22, 0, 40, 6, 22]); break;
    case 'mortar':
      ctx.beginPath(); ctx.arc(14 * k, 14 * k, 18 * k, 0, TAU); ctx.fill();
      ctx.setLineDash([8 * k, 9 * k]); ctx.lineWidth = 7 * k; ctx.beginPath(); ctx.moveTo(-38 * k, 34 * k); ctx.quadraticCurveTo(-30 * k, -40 * k, 2 * k, -6 * k); ctx.stroke(); break;
    case 'mines':
      ctx.beginPath(); ctx.arc(0, 0, 22 * k, 0, TAU); ctx.fill();
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 18 * k, Math.sin(a) * 18 * k); ctx.lineTo(Math.cos(a) * 36 * k, Math.sin(a) * 36 * k); ctx.stroke(); } break;
    case 'flame':
      ctx.beginPath(); ctx.moveTo(0, -40 * k); ctx.bezierCurveTo(30 * k, -10 * k, 32 * k, 20 * k, 0, 38 * k); ctx.bezierCurveTo(-32 * k, 20 * k, -26 * k, -8 * k, -8 * k, -16 * k); ctx.bezierCurveTo(-8 * k, -2 * k, 2 * k, -8 * k, 0, -40 * k); ctx.fill(); break;
    case 'repair':
      P([-10, -36, 10, -36, 10, -10, 36, -10, 36, 10, 10, 10, 10, 36, -10, 36, -10, 10, -36, 10, -36, -10, -10, -10]); break;
    case 'special': {
      ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * TAU - Math.PI / 2, r = (i % 2 ? 17 : 40) * k; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fill(); break;
    }
    case 'mg':
      for (const x of [-14, 14]) { ctx.beginPath(); ctx.moveTo(x * k, -34 * k); ctx.quadraticCurveTo((x + 10) * k, -22 * k, (x + 10) * k, -6 * k); ctx.lineTo((x + 10) * k, 32 * k); ctx.lineTo((x - 10) * k, 32 * k); ctx.lineTo((x - 10) * k, -6 * k); ctx.quadraticCurveTo((x - 10) * k, -22 * k, x * k, -34 * k); ctx.fill(); } break;
  }
  ctx.restore();
}
const PICK_ASSETS = {};
function pickAssets(type) {
  if (PICK_ASSETS[type]) return PICK_ASSETS[type];
  const d = PICK[type];
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d');
  x.fillStyle = 'rgba(42,24,56,0.9)'; x.beginPath(); x.arc(64, 64, 58, 0, TAU); x.fill();
  x.lineWidth = 8; x.strokeStyle = d.css; x.beginPath(); x.arc(64, 64, 54, 0, TAU); x.stroke();
  x.translate(22, 22); drawGlyph(x, type, 84, d.css);
  const tex = new THREE.CanvasTexture(cv);
  PICK_ASSETS[type] = {
    sprite: new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }),
    crate: new THREE.MeshLambertMaterial({ color: d.color, emissive: d.color, emissiveIntensity: 0.25 }),
    ring: new THREE.MeshBasicMaterial({ color: d.color, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  };
  return PICK_ASSETS[type];
}
const W_POOL = ['missile', 'missile', 'mortar', 'mines', 'flame', 'missile', 'mortar', 'special'];
const PICKUPS = [];
const PICK_SPOTS = [
  [0, 0, ['repair']], [-120, -20, ['repair']], [130, 60, ['repair']],
  [-38, 3, W_POOL], [36, -3, W_POOL], [4, 28, W_POOL], [-14, -32, W_POOL],
  [-80, -80, W_POOL], [-140, 40, W_POOL], [-60, 80, W_POOL], [10, 80, W_POOL], [80, 20, W_POOL], [120, -40, W_POOL],
  [40, -80, W_POOL], [-20, -122, W_POOL], [-100, 130, W_POOL], [90, -110, W_POOL], [150, -10, ['special', 'missile']], [-150, -40, ['special', 'mortar']],
];
const crateGeo = new THREE.BoxGeometry(1.5, 1.5, 1.5);
const ringGeo = new THREE.RingGeometry(1.9, 2.4, 28);
function buildPickups() {
  for (const [x, z, pool] of PICK_SPOTS) {
    const group = new THREE.Group(); const y = ground(x, z); group.position.set(x, y, z);
    const crate = new THREE.Mesh(crateGeo, pickAssets(pool[0]).crate); crate.castShadow = true; crate.position.y = 1.4; group.add(crate);
    const spr = new THREE.Sprite(pickAssets(pool[0]).sprite); spr.scale.set(2.3, 2.3, 1); spr.position.y = 3.4; group.add(spr);
    const ring = new THREE.Mesh(ringGeo, pickAssets(pool[0]).ring); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.25; group.add(ring);
    scene.add(group);
    PICKUPS.push({ x, z, y, pool, type: pool[0], active: true, respawn: 0, group, crate, spr, ring, ph: srand() * TAU });
  }
}
function setPickupType(p, type) {
  p.type = type; const a = pickAssets(type);
  p.crate.material = a.crate; p.spr.material = a.sprite; p.ring.material = a.ring;
}
function resetPickups() {
  for (const p of PICKUPS) { setPickupType(p, pick(p.pool)); p.active = true; p.group.visible = true; p.respawn = 0; }
}
function updatePickups(dt, t) {
  for (const p of PICKUPS) {
    if (!p.active) {
      p.respawn -= dt;
      if (p.respawn <= 0) { setPickupType(p, pick(p.pool)); p.active = true; p.group.visible = true; for (let i = 0; i < 10 * fxScale; i++) FX_ADD.spawn(p.x, p.y + 1.4, p.z, rand(-4, 4), rand(2, 7), rand(-4, 4), 0.6, 0.8, 0.1, PICK[p.type].color, 0xffffff, 0.9, 1, 4); }
      continue;
    }
    p.crate.rotation.y = t * 1.6 + p.ph; p.crate.rotation.x = Math.sin(t * 1.3 + p.ph) * 0.25;
    p.crate.position.y = 1.4 + Math.sin(t * 2.4 + p.ph) * 0.25;
    p.spr.position.y = 3.4 + Math.sin(t * 2.4 + p.ph) * 0.25;
    const s = 1 + 0.12 * Math.sin(t * 4 + p.ph); p.ring.scale.set(s, s, s);
  }
}
function nearestPickup(c, filter, maxD) {
  let best = null, bd = maxD * maxD;
  for (const p of PICKUPS) { if (!filter(p)) continue; const dx = p.x - c.x, dz = p.z - c.z, d2 = dx * dx + dz * dz; if (d2 < bd) { bd = d2; best = p; } }
  return best;
}
