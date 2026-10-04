// Terrain, the canyon wall around the arena, and mesas. They share one material that shades flat
// ground as rippled sand and steep ground as banded sandstone, so they blend into each other.
import * as THREE from 'three';
import { scene } from '../engine/renderer.js';
import { TAU, clamp, mulberry32, smooth } from '../engine/util.js';
import { ARENA_R, baseHeight } from './terrain.js';
import { rockTexture, sandNormal, sandTexture, strataTexture } from './textures';
import { boulderGeometry } from './flora';

const SAND_TILE = 7; // metres per sand texture repeat

// ---------- material ----------
let desertMat: THREE.MeshStandardMaterial | null = null;
/** Sand on flats, sandstone strata (by world height) on slopes, triplanar rock detail. */
export function desertMaterial(): THREE.MeshStandardMaterial {
  if (desertMat) return desertMat;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: sandTexture(), normalMap: sandNormal(), normalScale: new THREE.Vector2(0.28, 0.28), roughness: 0.96, metalness: 0 });
  const uniforms = { uRockTex: { value: rockTexture() }, uStrata: { value: strataTexture() } };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN; uniform sampler2D uRockTex; uniform sampler2D uStrata; float rockK;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 wn = normalize(vWN);
          float slope = 1.0 - clamp(wn.y, 0.0, 1.0);
          float warp = texture2D(uRockTex, vWP.xz * 0.0035).r;
          rockK = smoothstep(0.22, 0.42, slope + (warp - 0.5) * 0.25);
          vec3 tw = pow(abs(wn), vec3(4.0)); tw /= (tw.x + tw.y + tw.z);
          float d = texture2D(uRockTex, vWP.zy * 0.06).r * tw.x + texture2D(uRockTex, vWP.xz * 0.06).r * tw.y + texture2D(uRockTex, vWP.xy * 0.06).r * tw.z;
          float d2 = texture2D(uRockTex, vWP.zy * 0.013 + 0.3).r * tw.x + texture2D(uRockTex, vWP.xz * 0.013).r * tw.y + texture2D(uRockTex, vWP.xy * 0.013 + 0.6).r * tw.z;
          float wob = texture2D(uRockTex, vec2(atan(vWP.x, vWP.z) * 2.0, vWP.y * 0.01)).r;
          vec3 strata = texture2D(uStrata, vec2(0.5, vWP.y * 0.009 + warp * 0.35 + wob * 0.04 + d2 * 0.08)).rgb;
          vec3 rockCol = strata * (0.5 + 0.8 * d) * (0.7 + 0.5 * d2);
          rockCol = mix(rockCol, vec3(dot(rockCol, vec3(0.33))), 0.12);
          diffuseColor.rgb = mix(diffuseColor.rgb, rockCol, rockK);
        }`)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(mix(normal, geometryNormal, max(rockK, 0.75 * (1.0 - smoothstep(56.0, 84.0, length(vWP.xz))))));');
  };
  m.customProgramCacheKey = () => 'desert-v3';
  return (desertMat = m);
}
function worldUV(g: THREE.BufferGeometry) {
  const p = g.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / SAND_TILE; uv[i * 2 + 1] = p.getZ(i) / SAND_TILE; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
const _c = new THREE.Color();
/** Per-vertex tint; the shader's rock blend takes over on slopes. */
function paintVerts(g: THREE.BufferGeometry, tint: (x: number, y: number, z: number, out: THREE.Color) => void) {
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { tint(p.getX(i), p.getY(i), p.getZ(i), _c); col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
}
// desert floor colouring: large soft patches of redder and paler sand, packed earth around town
const SAND_A = new THREE.Color(0xe7ab72), SAND_B = new THREE.Color(0xd08a55), SAND_PALE = new THREE.Color(0xecc293), TOWN = new THREE.Color(0xc9a27a);
function sandTint(x: number, y: number, z: number, out: THREE.Color) {
  const n = 0.5 + 0.5 * Math.sin(x * 0.031 + Math.sin(z * 0.023) * 2.2) * Math.cos(z * 0.027 - x * 0.011);
  const m = 0.5 + 0.5 * Math.sin(x * 0.11 + z * 0.07) * Math.sin(z * 0.13 - x * 0.05);
  out.copy(SAND_B).lerp(SAND_A, clamp(n * 0.8 + y * 0.05, 0, 1)).lerp(SAND_PALE, clamp((m - 0.6) * 1.5, 0, 0.5));
  const r = Math.hypot(x, z); if (r < 82) out.lerp(TOWN, (1 - smooth(52, 82, r)) * 0.55);
}

// ---------- terrain ----------
export let terrainMesh: THREE.Mesh | null = null;
export function buildTerrainMesh(lowQ: boolean) {
  const SIZE = 440, SEG = lowQ ? 110 : 180;
  const g = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, baseHeight(p.getX(i), p.getZ(i)));
  g.computeVertexNormals(); worldUV(g); paintVerts(g, sandTint);
  terrainMesh = new THREE.Mesh(g, desertMaterial()); terrainMesh.receiveShadow = true; scene.add(terrainMesh);
  // distant desert floor beyond the canyon, seen through the passes
  const og = new THREE.RingGeometry(200, 1500, 64, 4); og.rotateX(-Math.PI / 2); og.translate(0, 29.6, 0); og.computeVertexNormals(); worldUV(og); paintVerts(og, (x, y, z, c) => c.copy(SAND_B));
  scene.add(new THREE.Mesh(og, desertMaterial()));
  return terrainMesh;
}

// ---------- canyon wall ----------
/** 1-D periodic noise on the circle, smooth, roughly 0..1. */
function ringNoise(seed: number, freqs: number[]) {
  const r = mulberry32(seed), ph = freqs.map(() => r() * TAU), amps = freqs.map((_, i) => 1 / (i + 1));
  const tot = amps.reduce((a, b) => a + b, 0);
  return (a: number) => 0.5 + 0.5 * freqs.reduce((s, f, i) => s + Math.sin(a * f + ph[i]) * amps[i], 0) / tot;
}
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
  const mesh = new THREE.Mesh(g, desertMaterial()); mesh.receiveShadow = true; mesh.castShadow = true; scene.add(mesh);
  return mesh;
}

// ---------- mesas and buttes ----------
// profile: [radius scale, height fraction, cragginess]; the last row closes the cap
const MESA_PROF: Array<[number, number, number]> = [[1.2, -0.04, 0], [1.02, 0.05, 0.4], [0.96, 0.11, 1], [0.94, 0.42, 1], [0.86, 0.45, 0.5], [0.84, 0.74, 1], [0.78, 0.77, 0.5], [0.77, 0.97, 0.8], [0.73, 1, 0.3], [0.4, 1.01, 0], [0, 1.0, 0]];
/** A banded mesa with ledges and an eroded outline. Visual only; collision is kept separately. */
export function mesaGeometry(cx: number, cz: number, baseY: number, r: number, h: number, seed: number, segs: number): THREE.BufferGeometry {
  const rows = MESA_PROF.length, outline = ringNoise(seed, [2, 3, 5, 9]), crag = ringNoise(seed + 1, [17, 31, 53]), rnd = mulberry32(seed);
  const pos = new Float32Array((segs + 1) * rows * 3);
  for (let i = 0; i <= segs; i++) {
    const a = i / segs * TAU, R = r * (0.82 + 0.36 * outline(a)), sx = Math.sin(a), sz = Math.cos(a);
    for (let j = 0; j < rows; j++) {
      const [rs, yf, c] = MESA_PROF[j], jit = c * r * (0.07 * (crag(a + j * 0.7) - 0.5) + (rnd() - 0.5) * 0.025);
      const rr = R * rs + (rs > 0 ? jit : 0), o = (i * rows + j) * 3;
      pos[o] = cx + sx * rr; pos[o + 1] = baseY + yf * h + (j > 0 && j < rows - 1 ? (rnd() - 0.5) * 0.3 : 0); pos[o + 2] = cz + sz * rr;
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < segs; i++) for (let j = 0; j < rows - 1; j++) { const a = i * rows + j, b = (i + 1) * rows + j; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  worldUV(g); paintVerts(g, sandTint);
  return g;
}
export function addMesa(cx: number, cz: number, baseY: number, r: number, h: number, seed: number, segs: number, shadows: boolean) {
  const m = new THREE.Mesh(mesaGeometry(cx, cz, baseY, r, h, seed, segs), desertMaterial());
  m.castShadow = shadows; m.receiveShadow = shadows; scene.add(m); return m;
}

/** Boulders as one mesh in the desert material: [x, y, z, sx, sy, sz, yaw, seed] each. */
export function addBoulders(list: number[][]) {
  const parts: THREE.BufferGeometry[] = [], m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (const [x, y, z, sx, sy, sz, yaw, seed] of list) {
    const g = boulderGeometry(seed, 1); g.applyMatrix4(m.compose(new THREE.Vector3(x, y, z), q.setFromEuler(e.set(0, yaw, 0)), new THREE.Vector3(sx, sy, sz)));
    parts.push(g.toNonIndexed());
  }
  let n = 0; for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;
  for (const g of parts) { pos.set(g.attributes.position.array as Float32Array, o); nor.set(g.attributes.normal.array as Float32Array, o); o += g.attributes.position.array.length; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  worldUV(g); paintVerts(g, (x, y, z, c) => c.setHex(0xc48a5e));
  const mesh = new THREE.Mesh(g, desertMaterial()); mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh);
  return mesh;
}
