import * as THREE from 'three';
import { signTexture } from '../../engine/geometry.js';
import { addToScene } from '../../engine/renderer.js';
import { onTod } from '../../engine/sky';
import { TAU, mulberry32 } from '../../engine/util.js';
import { addBoulders, addMesas } from '../../world/landscape';
import { PROPS, finishProps, placeProp } from '../../world/props.js';
import { ARENA_R, RAMPS, baseHeight } from './terrain.js';
import { buildCanyonWall, buildTerrainMesh } from './landscape';
import { SIGNS, buildTown } from './town';
import { buildRoads } from './roads';

// ================= collision data =================
export const BOXES = [];   // {minX,maxX,minZ,maxZ,h}
export const CIRCLES = []; // {x,z,r,h}
function addBox(cx, cz, w, d, h) { BOXES.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, h }); }

export const SIGN_MESHES = [];
// painted signs glow faintly at night
onTod(t => { for (const s of SIGN_MESHES) if (s.material.emissive) s.material.emissive.setHex(t.night ? 0x3a2a20 : 0); });
export function buildTerrain(lowQ) {
  buildTerrainMesh(lowQ); buildCanyonWall(lowQ);
}

// buildings: cx,cz,w,d,h,color,front(+1 faces +z, -1 faces -z),sign
/** @type {import('./town').Building[]} */
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
  // collision for buildings (porch included where there is one), gas canopy posts, sign pole and telephone poles
  for (const b of BUILDINGS) {
    if (b.sign) addBox(b.cx, b.cz + b.f * 1.4, b.w, b.d + 2.8, b.h); else addBox(b.cx, b.cz, b.w, b.d, b.h);
  }
  for (const [px, pz] of [[27, -19.5], [41, -19.5], [27, -28.5], [41, -28.5]]) CIRCLES.push({ x: px, z: pz, r: 0.45, h: 5 });
  CIRCLES.push({ x: 48, z: -16, r: 0.5, h: 9 });
  /** @type {Array<[number, number, number]>} */
  const poles = [];
  for (const sx of [-1, 1]) for (let x = 76; x < 180; x += 34) {
    const px = sx * x, pz = -8.5, y = baseHeight(px, pz);
    poles.push([px, y, pz]);
  }
  buildTown(BUILDINGS, RAMPS, poles);
  SIGN_MESHES.push(...SIGNS);
  { const t = signTexture('Gas', '#c0392b', '#f6ead4', 256, 256); const sm = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide })); sm.position.set(48, 10.4, -16); sm.rotation.y = Math.PI / 2; addToScene(sm, 'town'); SIGN_MESHES.push(sm); }
  // mesas inside the arena (collision stays a circle) and far buttes beyond the canyon
  addMesas(MESAS.map((m, i) => {
    const gy = baseHeight(m.x, m.z) - 1.5;
    CIRCLES.push({ x: m.x, z: m.z, r: m.r * 0.98, h: gy + m.h + 2 });
    return [m.x, m.z, gy, m.r * 1.08, m.h + 1.5, 100 + i];
  }), 72, true);
  const fr = mulberry32(42), far = [];
  for (let i = 0; i < 26; i++) {
    const a = i / 26 * TAU + fr() * 0.2, R = 280 + fr() * 260, r = 18 + fr() * 40, h = 35 + fr() * 70;
    far.push([Math.sin(a) * R, Math.cos(a) * R, 27, r, h, 200 + i]);
  }
  addMesas(far, 28, false);
  // boulders (same placement and collision as before), shaded like the canyon rock
  const rr = mulberry32(7), boulders = [];
  for (let i = 0; i < 26; i++) {
    let x, z, ok = false;
    for (let t = 0; t < 20 && !ok; t++) { const a = rr() * TAU, R = 75 + rr() * 100; x = Math.sin(a) * R; z = Math.cos(a) * R; ok = clearSpot(x, z, 10); }
    if (!ok) continue;
    const s = 1.2 + rr() * 1.8, y = baseHeight(x, z);
    boulders.push([x, y + s * 0.25, z, s * 1.25, s * 1.15, s * 1.1, rr() * 3, i]);
    if (rr() < 0.6) boulders.push([x + s, y + s * 0.1, z + s * 0.5, s * 0.7, s * 0.6, s * 0.7, rr() * 3, i + 100]);
    CIRCLES.push({ x, z, r: s * 1.1, h: y + s * 1.4 });
  }
  addBoulders(boulders);
  for (const [px, y, pz] of poles) CIRCLES.push({ x: px, z: pz, r: 0.45, h: y + 9 }); // after the rocks, as before, so rock placement is unchanged
  buildRoads();
}
// where ground clutter may not go: roads, buildings, rocks, ramps, props and the arena edge
export function decorBlocked(x, z, pad) {
  if (Math.hypot(x, z) > ARENA_R - 4 || Math.abs(z) < 6.5 + pad) return true;
  if (z > 12 && Math.abs(x - (4 + 12 * Math.sin(Math.max(0, z - 30) * 0.02))) < 4.5 + pad) return true;
  if (z < -26 && Math.abs(x - (-18 + 10 * Math.sin((z + 26) * 0.025))) < 4.5 + pad) return true;
  for (const b of BOXES) if (x > b.minX - pad - 1 && x < b.maxX + pad + 1 && z > b.minZ - pad - 1 && z < b.maxZ + pad + 1) return true;
  for (const c of CIRCLES) if (Math.hypot(x - c.x, z - c.z) < c.r + pad) return true;
  for (const r of RAMPS) if (Math.hypot(x - r.x, z - r.z) < 13 + pad) return true;
  for (const p of PROPS) if (Math.hypot(x - p.x, z - p.z) < p.r + 1 + pad) return true;
  return false;
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

/** The town's props: water tower, billboards, gas pumps, barrels and cacti. */
export function buildProps() {
  placeProp('tower', -24, 38);
  placeProp('billboard', -82, 16, { text: 'Sundown Springs', bg: '#27888a', fg: '#f6ead4', yaw: 0 });
  placeProp('billboard', 92, -16, { text: 'Cold Pop 10 Miles', bg: '#f2b134', fg: '#7a2a1f', yaw: Math.PI });
  placeProp('billboard', 28, 96, { text: 'Hollis Salvage', bg: '#c0392b', fg: '#f6ead4', yaw: Math.PI * 0.85 });
  placeProp('pump', 31, -24); placeProp('pump', 37, -24);
  for (const [x, z] of [[-50, -10.5], [-48.6, -10], [-49.4, -8.8], [47, 10.5], [48.2, 11.4], [26, -33], [-8, 11], [-30, -11], [58, -8], [-62, 9]]) placeProp('barrel', x, z);
  const cr = mulberry32(99);
  let n = 0;
  for (let t = 0; t < 400 && n < 34; t++) {
    const a = cr() * TAU, R = 72 + cr() * 105; const x = Math.sin(a) * R, z = Math.cos(a) * R;
    if (!clearSpot(x, z, 4)) continue;
    let bad = false; for (const p of PROPS) if (Math.hypot(p.x - x, p.z - z) < 8) bad = true; if (bad) continue;
    placeProp('cactus', x, z, { s: 0.8 + cr() * 0.5 }); n++;
  }
  for (const [x, z] of [[-66, 22], [64, -24], [8, 42], [-12, -40], [70, 14]]) placeProp('cactus', x, z, { s: 0.9 });
  finishProps();
}
