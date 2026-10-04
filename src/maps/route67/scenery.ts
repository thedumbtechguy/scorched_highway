// Route 67's meshes: the carved canyon, road surfaces, the mine shaft, the gorge ramp, start gantry, fork signs,
// boulders and far buttes. Built the first time a race starts, then kept.
import * as THREE from 'three';
import { MAT_VC, PB, signTexture } from '../../engine/geometry.js';
import { addToScene } from '../../engine/renderer.js';
import { TAU, clamp, mulberry32 } from '../../engine/util.js';
import { addBoulders, addMesas, desertMaterial } from '../../world/landscape';
import { saguaroGeometry } from '../../world/flora';
import { buildHazards } from '../../world/hazards';
import { buildPickups } from '../../world/pickups';
import { buildPlates } from '../../world/plates';
import { finishProps, placeProp } from '../../world/props.js';
import { asphalt, dirt, ribbon, roadMat } from '../../world/roads';
import { BARRELS, BOUNDS, CRATE_SPOTS, PLATE_SPOTS, buildHazardSites, OBSTACLES, OX, OZ, PATHS, PORTAL, RIBBON, ROAD_LIFT, ROOF, SECTIONS_BUILT, TRACK_RAMPS, type Path, nearest, pathsNear, place, setTrackGrid, trackHeight, trackSurface } from './track';

let built = false;
export const isBuilt = () => built;

const FLOOR: Record<string, THREE.Color> = { dirt: new THREE.Color(0xe8aa72), tunnel: new THREE.Color(0x6a4c3a), asphalt: new THREE.Color(0xd9a070), sand: new THREE.Color(0xf6dcaa) };
const PLATEAU = new THREE.Color(0xd29a66), DEEP = new THREE.Color(0x6e4030);

/** The canyon terrain: one height grid, cut into 128 m tiles wherever the track runs. */
function buildTerrain(lowQ: boolean) {
  const S = lowQ ? 4 : 2, TILE = 128;
  const x0 = Math.floor(BOUNDS.minX / TILE) * TILE, z0 = Math.floor(BOUNDS.minZ / TILE) * TILE, x1 = Math.ceil(BOUNDS.maxX / TILE) * TILE, z1 = Math.ceil(BOUNDS.maxZ / TILE) * TILE;
  const nx = (x1 - x0) / S + 1, nz = (z1 - z0) / S + 1, H = new Float32Array(nx * nz);
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) H[i * nz + j] = trackHeight(x0 + i * S, z0 + j * S);
  setTrackGrid(S, x0, z0, nx, nz, H);
  const h = (i: number, j: number) => H[clamp(i, 0, nx - 1) * nz + clamp(j, 0, nz - 1)];
  const mat = desertMaterial(), c = new THREE.Color(), per = TILE / S;
  for (let tx = x0; tx < x1; tx += TILE) for (let tz = z0; tz < z1; tz += TILE) {
    if (!pathsNear(tx, tz, tx + TILE, tz + TILE)) continue;
    const n = (per + 1) * (per + 1), pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx: number[] = [];
    const bi = (tx - x0) / S, bj = (tz - z0) / S;
    for (let a = 0; a <= per; a++) for (let b = 0; b <= per; b++) {
      const v = a * (per + 1) + b, i = bi + a, j = bj + b, x = x0 + i * S, z = z0 + j * S, y = h(i, j);
      pos.set([x, y, z], v * 3); uv.set([x / 7, z / 7], v * 2);
      // normals from the shared grid, so tiles meet without lighting seams
      const gx = (h(i + 1, j) - h(i - 1, j)) / (2 * S), gz = (h(i, j + 1) - h(i, j - 1)) / (2 * S), L = Math.hypot(gx, 1, gz);
      nor.set([-gx / L, 1 / L, -gz / L], v * 3);
      const near = nearest(x, z);
      if (near && near.e < 1) { c.copy(FLOOR[near.path.surface]); if (y < near.floor - 3) c.lerp(DEEP, clamp((near.floor - 3 - y) / 20, 0, 1)); }
      else c.copy(PLATEAU).multiplyScalar(0.92 + 0.08 * Math.sin(x * 0.05 + z * 0.03));
      col.set([c.r, c.g, c.b], v * 3);
    }
    // same diagonal split as PlaneGeometry, which trackSurface() assumes
    for (let a = 0; a < per; a++) for (let b = 0; b < per; b++) { const p = a * (per + 1) + b, q = p + per + 1; idx.push(p, p + 1, q, p + 1, q + 1, q); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.castShadow = !lowQ; addToScene(m, 'track');
  }
}

/** Road ribbons along every path except the sandy riverbed; the jump's ribbon stops at the ramp. */
function buildRoads() {
  const mud = roadMat(dirt(), 1), tar = roadMat(asphalt(), 0.85);
  for (const p of PATHS) {
    const k = RIBBON[p.surface]; if (!k) continue;
    const runs: Array<Array<[number, number]>> = [[]];
    const cut = p.gap ? [p.gap[0] - TRACK_RAMPS[0].len - 2, p.gap[1] + 1] : null;
    for (let i = 0; i < p.x.length; i++) {
      if (cut && p.s[i] > cut[0] && p.s[i] < cut[1]) { if (runs[runs.length - 1].length) runs.push([]); continue; }
      runs[runs.length - 1].push([p.x[i], p.z[i]]);
    }
    for (const r of runs) if (r.length > 1) ribbon(r, p.half * 2 * k, ROAD_LIFT, p.surface === 'asphalt' ? 13 : 9, p.surface === 'asphalt' ? tar : mud).userData.layer = 'track';
  }
}

/** Extrude a cross-section (lateral offset, height above the floor) along part of a path. */
function extrude(p: Path, from: number, to: number, section: Array<[number, number]>): THREE.BufferGeometry {
  const pos: number[] = [], idx: number[] = []; let rows = 0;
  for (let i = 0; i < p.x.length; i++) {
    if (p.s[i] < from || p.s[i] > to) continue;
    for (const [lat, up] of section) pos.push(p.x[i] + p.tz[i] * lat, p.y[i] + up, p.z[i] - p.tx[i] * lat);
    if (rows) for (let k = 0; k < section.length - 1; k++) { const a = (rows - 1) * section.length + k, b = a + section.length; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    rows++;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
/** The mine shaft: a rock roof over the slot, timber portals at both ends, lamps along the walls. */
function buildTunnel(p: Path) {
  const W = p.half + 7, roof = extrude(p, PORTAL - 1, p.len - PORTAL + 1, [[W, ROOF + 5], [W, ROOF], [-W, ROOF], [-W, ROOF + 5], [W, ROOF + 5]]);
  const uv = new Float32Array(roof.attributes.position.count * 2), col = new Float32Array(roof.attributes.position.count * 3), P = roof.attributes.position;
  for (let i = 0; i < P.count; i++) { uv[i * 2] = P.getX(i) / 7; uv[i * 2 + 1] = P.getZ(i) / 7; col.set([0.55, 0.42, 0.34], i * 3); }
  roof.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); roof.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const rm = new THREE.Mesh(roof, desertMaterial()); rm.castShadow = true; rm.receiveShadow = true; addToScene(rm, 'track');
  // portals and lamps
  const wood = new PB(), lamps = new PB();
  for (const s of [PORTAL - 1, p.len - PORTAL + 1]) {
    const i = p.s.findIndex(v => v >= s), yaw = Math.atan2(p.tx[i], p.tz[i]), at = (lat: number, up: number) => [p.x[i] + p.tz[i] * lat, p.y[i] + up, p.z[i] - p.tx[i] * lat];
    for (const side of [-1, 1]) { const [x, y, z] = at(side * (p.half + 0.4), ROOF / 2); wood.box(0.9, ROOF + 0.6, 0.9, 0x6b4a30, x, y, z, 0, yaw, 0); }
    const [x, y, z] = at(0, ROOF + 0.3); wood.box(p.half * 2 + 2.4, 1.1, 1.1, 0x5a3c26, x, y, z, 0, yaw, 0);
    const [sx, sy, sz] = at(0, ROOF + 1.6); wood.box(5.5, 1.3, 0.25, 0x2a1d16, sx, sy, sz, 0, yaw, 0);
  }
  for (let s = PORTAL + 6; s < p.len - PORTAL; s += 16) {
    const i = p.s.findIndex(v => v >= s);
    for (const side of [-1, 1]) lamps.box(0.4, 0.4, 0.4, 0xffd27a, p.x[i] + p.tz[i] * side * (p.half + 0.6), p.y[i] + 4.2, p.z[i] - p.tx[i] * side * (p.half + 0.6));
  }
  const wm = new THREE.Mesh(wood.build(), MAT_VC); wm.castShadow = true; addToScene(wm, 'track');
  addToScene(new THREE.Mesh(lamps.build(), new THREE.MeshBasicMaterial({ vertexColors: true })), 'track');
}
/** The plank ramp up to the gorge's lip. */
function buildRamps() {
  for (const R of TRACK_RAMPS) {
    const g = new THREE.BoxGeometry(R.w, 1, R.len, 1, 1, 8), P = g.attributes.position;
    for (let i = 0; i < P.count; i++) P.setY(i, P.getY(i) > 0 ? (P.getZ(i) + R.len / 2) / R.len * R.h + 0.04 : -0.4);
    g.computeVertexNormals();
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 256; const x = cv.getContext('2d')!;
    for (let k = 0; k < 16; k++) { x.fillStyle = k % 2 ? '#8a5a36' : '#7a4d2e'; x.fillRect(0, k * 16, 64, 16); x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(0, k * 16, 64, 2); }
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: new THREE.CanvasTexture(cv), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    m.position.set(R.x, R.base, R.z); m.rotation.y = R.yaw; m.castShadow = true; m.receiveShadow = true; addToScene(m, 'track');
  }
}
/** An overhead banner across a path at sample i: posts, a beam and a painted board facing oncoming cars. */
function gantry(p: Path, i: number, text: string, colors: [string, string], width = 1) {
  const yaw = Math.atan2(p.tx[i], p.tz[i]), half = p.half * width + 1, b = new PB();
  const at = (lat: number) => [p.x[i] + p.tz[i] * lat, p.y[i], p.z[i] - p.tx[i] * lat];
  for (const side of [-1, 1]) { const [x, y, z] = at(side * half); b.box(0.6, 8, 0.6, 0x3a2a24, x, y + 4, z, 0, yaw, 0); }
  const [x, y, z] = at(0);
  const frame = new THREE.Mesh(b.build(), MAT_VC); frame.castShadow = true; addToScene(frame, 'track');
  const board = new THREE.Mesh(new THREE.PlaneGeometry(half * 1.6, 2.6), new THREE.MeshLambertMaterial({ map: signTexture(text, colors[0], colors[1], 1024, 160), side: THREE.DoubleSide }));
  board.position.set(x, y + 7, z); board.rotation.y = yaw + Math.PI; addToScene(board, 'track');
}
/** Start/finish: a gantry and a chequered line across the road. */
function buildStart() {
  const p = SECTIONS_BUILT[0].paths[0];
  gantry(p, 0, 'ROUTE 67', ['#c0392b', '#f6ead4']);
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 32; const x = cv.getContext('2d')!;
  for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { x.fillStyle = (i + j) % 2 ? '#f6ead4' : '#1e1322'; x.fillRect(i * 16, j * 16, 16, 16); }
  const line = new THREE.Mesh(new THREE.PlaneGeometry(p.half * 2 * RIBBON.dirt, 2), new THREE.MeshLambertMaterial({ map: new THREE.CanvasTexture(cv), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  // laid flat with its long side across the road, just above the drawn ground and the road ribbon
  line.rotation.set(-Math.PI / 2, 0, Math.atan2(p.tx[0], p.tz[0]));
  line.position.set(p.x[0], trackSurface(p.x[0], p.z[0]) + ROAD_LIFT + 0.1, p.z[0]); line.receiveShadow = true;
  addToScene(line, 'track');
}
/** Banners before each fork saying which way each branch goes. */
function buildForkSigns() {
  SECTIONS_BUILT.forEach((sec, k) => {
    if (sec.paths.length < 2) return;
    const before = SECTIONS_BUILT[(k + SECTIONS_BUILT.length - 1) % SECTIONS_BUILT.length].paths[0], i = before.x.length - 6;
    // which branch is on the left as you arrive
    const ax = before.tx[i], az = before.tz[i];
    const side = (p: Path) => { const j = Math.min(12, p.x.length - 1), dx = p.x[j] - p.x[0], dz = p.z[j] - p.z[0]; return Math.sign(ax * dz - az * dx); };
    const [l, r] = side(sec.paths[0]) > 0 ? [sec.paths[0], sec.paths[1]] : [sec.paths[1], sec.paths[0]];
    gantry(before, i, `◀ ${l.name.toUpperCase()}     ${r.name.toUpperCase()} ▶`, ['#f2b134', '#1e1322']);
  });
}
/** Fallen rock along the foot of the walls, and buttes on the skyline. */
function buildRocks() {
  const r = mulberry32(67), list: number[][] = [];
  for (const p of PATHS) for (let s = 10; s < p.len - 10; s += 22 + r() * 18) {
    const i = p.s.findIndex(v => v >= s), side = r() < 0.5 ? -1 : 1, lat = side * (p.half + 1.5 + r() * 3);
    const x = p.x[i] + p.tz[i] * lat, z = p.z[i] - p.tx[i] * lat, sc = 1 + r() * 2.5;
    const n = nearest(x, z); if (n && n.e < 0.8) continue; // never on the road
    list.push([x, trackHeight(x, z) - 0.4 * sc, z, sc, sc * (0.6 + r() * 0.4), sc, r() * TAU, Math.floor(r() * 1000)]);
  }
  // boulders on the road itself (they collide; see track.ts)
  OBSTACLES.forEach((o, k) => list.push([o.x, trackHeight(o.x, o.z) + 0.25 * o.r, o.z, o.r * 1.15, o.r * 0.95, o.r * 1.05, r() * TAU, 500 + k]));
  if (list.length) addBoulders(list).userData.layer = 'track';
  const cx = (BOUNDS.minX + BOUNDS.maxX) / 2, cz = (BOUNDS.minZ + BOUNDS.maxZ) / 2, R = Math.hypot(BOUNDS.maxX - cx, BOUNDS.maxZ - cz), buttes: number[][] = [];
  for (let k = 0; k < 11; k++) { const a = k / 11 * TAU + r() * 0.3, d = R + 120 + r() * 260; buttes.push([cx + Math.sin(a) * d, cz + Math.cos(a) * d, 26, 40 + r() * 50, 45 + r() * 50, 300 + k]); }
  addMesas(buttes, 40, false).userData.layer = 'track';
}

/** Saguaros and boulders scattered over the open desert, merged into one mesh (scenery only, off the road). */
function buildDesertPlants() {
  const r = mulberry32(1967), parts: THREE.BufferGeometry[] = [], m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (const p of PATHS) {
    if (p.style !== 'desert') continue;
    for (let s = 8; s < p.len - 8; s += 9 + r() * 8) {
      const i = p.s.findIndex(v => v >= s), side = r() < 0.5 ? -1 : 1, lat = side * (p.half + 7 + r() * r() * 70);
      const x = p.x[i] + p.tz[i] * lat, z = p.z[i] - p.tx[i] * lat, n = nearest(x, z);
      if (!n || n.e < 4) continue; // keep clear of every road
      const y = trackHeight(x, z); if (y > p.y[i] + 6) continue; // not up on the mesas
      const g = saguaroGeometry(0.8 + r() * 0.6, Math.floor(r() * 1e4)).toNonIndexed();
      g.applyMatrix4(m.compose(new THREE.Vector3(x, y - 0.2, z), q.setFromEuler(e.set(0, r() * TAU, 0)), new THREE.Vector3(1, 1, 1)));
      parts.push(g);
    }
  }
  if (!parts.length) return;
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const size = parts[0].attributes[name].itemSize, arr = new Float32Array(parts.reduce((a, g) => a + g.attributes[name].count, 0) * size); let o = 0;
    for (const g of parts) { arr.set(g.attributes[name].array as Float32Array, o); o += g.attributes[name].array.length; g.dispose(); }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  out.computeBoundingSphere();
  const mesh = new THREE.Mesh(out, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 }));
  mesh.castShadow = true; mesh.receiveShadow = true; addToScene(mesh, 'track');
}

/** Build everything once. */
export function buildRoute67(lowQ: boolean) {
  if (built) return; built = true;
  buildTerrain(lowQ); buildRoads(); buildRamps(); buildStart(); buildForkSigns(); buildRocks(); buildDesertPlants();
  for (const p of PATHS) if (p.surface === 'tunnel') buildTunnel(p);
  // explosive barrels in threes, and the weapon crates
  for (const b of BARRELS) { const at = place(b); for (const [dx, dz] of [[0, 0], [1.3, 0.5], [0.4, 1.4]]) placeProp('barrel', at.x + dx, at.z + dz); }
  finishProps();
  buildPickups(CRATE_SPOTS);
  // plates in the road, and the hazards their skulls set off
  buildPlates(PLATE_SPOTS); buildHazardSites(); buildHazards();
}
export const ROUTE_CENTER = { x: OX, z: OZ };
