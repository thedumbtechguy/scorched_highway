// The ghost town's ground: the terrain mesh around town and the canyon wall ringing the arena.
import * as THREE from 'three';
import { addToScene } from '../../engine/renderer.js';
import { TAU, mulberry32, smooth } from '../../engine/util.js';
import { desertMaterial, paintVerts, ringNoise, sandTint, splitByTriangle, worldUV } from '../../world/landscape';
import { ARENA_R, baseHeight, setTerrainGrid } from './terrain.js';

const SAND_B = new THREE.Color(0xd08a55);
// ---------- terrain ----------
export function buildTerrainMesh(lowQ: boolean) {
  const SIZE = 440, SEG = lowQ ? 110 : 180;
  setTerrainGrid(SIZE, SEG);
  const g = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, baseHeight(p.getX(i), p.getZ(i)));
  g.computeVertexNormals(); worldUV(g); paintVerts(g, sandTint);
  // 4x4 tiles for culling; ground beyond the canyon wall is never seen, so it's dropped
  const TILE = SIZE / 4;
  for (const piece of splitByTriangle(g, (x, y, z) => Math.hypot(x, z) > 212 ? null : Math.floor((x + SIZE / 2) / TILE) * 4 + Math.floor((z + SIZE / 2) / TILE))) {
    const m = new THREE.Mesh(piece, desertMaterial()); m.receiveShadow = true; addToScene(m, 'landscape');
  }
  // distant desert floor beyond the canyon, seen through the passes
  const og = new THREE.RingGeometry(200, 1500, 64, 4); og.rotateX(-Math.PI / 2); og.translate(0, 29.6, 0); og.computeVertexNormals(); worldUV(og); paintVerts(og, (x, y, z, c) => c.copy(SAND_B));
  addToScene(new THREE.Mesh(og, desertMaterial()), 'landscape');
}

// ---------- canyon wall ----------
// roads leave the arena here: [angle (atan2(x, z)), half-width in radians]
export const PASSES: Array<[number, number]> = [[Math.PI / 2, 0.075], [-Math.PI / 2, 0.075], [-0.01, 0.06], [Math.PI + 0.04, 0.06]];
function passK(a: number) {
  let k = 1;
  for (const [pa, w] of PASSES) { let d = Math.abs(a - pa) % TAU; if (d > Math.PI) d = TAU - d; k = Math.min(k, smooth(w, w + 0.07, d)); }
  return k;
}
export function buildCanyonWall(lowQ: boolean) {
  const SEGS = lowQ ? 360 : 720, R0 = ARENA_R + 4;
  const hN = ringNoise(3, [3, 7, 13, 29]), rN = ringNoise(4, [5, 11, 23, 47, 97]), eN = ringNoise(5, [61, 131, 223]);
  // profile from the foot outwards and upwards: [radial offset, height fraction, cragginess]
  const PROF: Array<[number, number, number]> = [[-7, -0.04, 0], [-1.5, 0.05, 0.3], [0, 0.12, 1], [0.6, 0.36, 1], [2.6, 0.39, 0.5], [3.1, 0.62, 1], [5.4, 0.65, 0.5], [5.9, 0.94, 1], [7.5, 1, 0.3], [30, 1.03, 0], [90, 1.0, 0]];
  const rows = PROF.length, pos = new Float32Array((SEGS + 1) * rows * 3), r = mulberry32(77);
  for (let i = 0; i <= SEGS; i++) {
    const a = i / SEGS * TAU, k = passK(a), H = (20 + 26 * hN(a) + 8 * Math.max(0, rN(a) - 0.6)) * k;
    const R = R0 + 5 * rN(a) + (1 - k) * 10, sx = Math.sin(a), sz = Math.cos(a);
    const foot = baseHeight(sx * R, sz * R) - 1.5;
    for (let j = 0; j < rows; j++) {
      const [dr, yf, crag] = PROF[j];
      const jitter = crag * (2.2 * (eN(a + j * 0.37) - 0.5) + (r() - 0.5) * 0.8) * k;
      const rr = R + dr * (0.6 + 0.8 * hN(a + 1.3)) + jitter, y = foot + yf * H + (j > 0 && j < rows - 2 ? (r() - 0.5) * 0.6 * k : 0);
      const o = (i * rows + j) * 3; pos[o] = sx * rr; pos[o + 1] = y; pos[o + 2] = sz * rr;
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < SEGS; i++) for (let j = 0; j < rows - 1; j++) {
    const a = i * rows + j, b = (i + 1) * rows + j;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  worldUV(g); paintVerts(g, sandTint);
  // 16 slices around the ring, so only the stretch near the player is drawn into the shadow map
  for (const piece of splitByTriangle(g, (x, y, z) => Math.floor(((Math.atan2(x, z) + Math.PI) / TAU) * 16) % 16)) {
    const mesh = new THREE.Mesh(piece, desertMaterial()); mesh.receiveShadow = true; mesh.castShadow = true; addToScene(mesh, 'landscape');
  }
}

