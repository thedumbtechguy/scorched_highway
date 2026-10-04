// The desert look shared by every map: one material that shades flat ground as rippled sand and steep ground
// as banded sandstone, plus helpers for terrain chunks, mesas and boulders built in it.
import * as THREE from 'three';
import { addToScene } from '../engine/renderer.js';
import { TAU, clamp, mulberry32, smooth } from '../engine/util.js';
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
          if (rockK > 0.001) { // flat sand (most of the screen) skips the triplanar rock work
          vec3 tw = pow(abs(wn), vec3(4.0)); tw /= (tw.x + tw.y + tw.z);
          float d = texture2D(uRockTex, vWP.zy * 0.06).r * tw.x + texture2D(uRockTex, vWP.xz * 0.06).r * tw.y + texture2D(uRockTex, vWP.xy * 0.06).r * tw.z;
          float d2 = texture2D(uRockTex, vWP.zy * 0.013 + 0.3).r * tw.x + texture2D(uRockTex, vWP.xz * 0.013).r * tw.y + texture2D(uRockTex, vWP.xy * 0.013 + 0.6).r * tw.z;
          float wob = texture2D(uRockTex, vec2(atan(vWP.x, vWP.z) * 2.0, vWP.y * 0.01)).r;
          vec3 strata = texture2D(uStrata, vec2(0.5, vWP.y * 0.009 + warp * 0.35 + wob * 0.04 + d2 * 0.08)).rgb;
          vec3 rockCol = strata * (0.5 + 0.8 * d) * (0.7 + 0.5 * d2);
          rockCol = mix(rockCol, vec3(dot(rockCol, vec3(0.33))), 0.12);
          diffuseColor.rgb = mix(diffuseColor.rgb, rockCol, rockK);
          }
        }`)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(mix(normal, geometryNormal, max(rockK, 0.75 * (1.0 - smoothstep(56.0, 84.0, length(vWP.xz))))));');
  };
  m.customProgramCacheKey = () => 'desert-v4';
  return (desertMat = m);
}
export function worldUV(g: THREE.BufferGeometry) {
  const p = g.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / SAND_TILE; uv[i * 2 + 1] = p.getZ(i) / SAND_TILE; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
const _c = new THREE.Color();
/** Per-vertex tint; the shader's rock blend takes over on slopes. */
export function paintVerts(g: THREE.BufferGeometry, tint: (x: number, y: number, z: number, out: THREE.Color) => void) {
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { tint(p.getX(i), p.getY(i), p.getZ(i), _c); col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
}
// desert floor colouring: large soft patches of redder and paler sand, packed earth around town
const SAND_A = new THREE.Color(0xe7ab72), SAND_B = new THREE.Color(0xd08a55), SAND_PALE = new THREE.Color(0xecc293), TOWN = new THREE.Color(0xc9a27a);
export function sandTint(x: number, y: number, z: number, out: THREE.Color) {
  const n = 0.5 + 0.5 * Math.sin(x * 0.031 + Math.sin(z * 0.023) * 2.2) * Math.cos(z * 0.027 - x * 0.011);
  const m = 0.5 + 0.5 * Math.sin(x * 0.11 + z * 0.07) * Math.sin(z * 0.13 - x * 0.05);
  out.copy(SAND_B).lerp(SAND_A, clamp(n * 0.8 + y * 0.05, 0, 1)).lerp(SAND_PALE, clamp((m - 0.6) * 1.5, 0, 0.5));
  const r = Math.hypot(x, z); if (r < 82) out.lerp(TOWN, (1 - smooth(52, 82, r)) * 0.55);
}

// ---------- chunking ----------
/** Split an indexed mesh into pieces by a key per triangle (null drops the triangle), keeping its normals, so
 *  each piece gets its own bounds and can be culled. */
export function splitByTriangle(g: THREE.BufferGeometry, keyOf: (cx: number, cy: number, cz: number) => number | null): THREE.BufferGeometry[] {
  const idx = g.index!.array, P = g.attributes.position.array, buckets = new Map<number, number[]>();
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const k = keyOf((P[a] + P[b] + P[c]) / 3, (P[a + 1] + P[b + 1] + P[c + 1]) / 3, (P[a + 2] + P[b + 2] + P[c + 2]) / 3);
    if (k == null) continue;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(idx[i], idx[i + 1], idx[i + 2]);
  }
  const out: THREE.BufferGeometry[] = [];
  for (const tris of buckets.values()) {
    const remap = new Map<number, number>(), sub = new THREE.BufferGeometry(), newIdx: number[] = [];
    for (const v of tris) { let n = remap.get(v); if (n == null) { n = remap.size; remap.set(v, n); } newIdx.push(n); }
    for (const name in g.attributes) {
      const src = g.attributes[name], size = src.itemSize, arr = new Float32Array(remap.size * size);
      for (const [o, n] of remap) for (let k = 0; k < size; k++) arr[n * size + k] = src.array[o * size + k];
      sub.setAttribute(name, new THREE.BufferAttribute(arr, size));
    }
    sub.setIndex(newIdx); sub.computeBoundingSphere(); out.push(sub);
  }
  g.dispose();
  return out;
}

// ---------- shared noise ----------
/** 1-D periodic noise on the circle, smooth, roughly 0..1. */
export function ringNoise(seed: number, freqs: number[]) {
  const r = mulberry32(seed), ph = freqs.map(() => r() * TAU), amps = freqs.map((_, i) => 1 / (i + 1));
  const tot = amps.reduce((a, b) => a + b, 0);
  return (a: number) => 0.5 + 0.5 * freqs.reduce((s, f, i) => s + Math.sin(a * f + ph[i]) * amps[i], 0) / tot;
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
/** Several mesas merged into one mesh: [x, z, baseY, r, h, seed] each. */
export function addMesas(list: number[][], segs: number, shadows: boolean) {
  const geos = list.map(([cx, cz, baseY, r, h, seed]) => mesaGeometry(cx, cz, baseY, r, h, seed, segs));
  let nv = 0, ni = 0; for (const g of geos) { nv += g.attributes.position.count; ni += g.index!.count; }
  const out = new THREE.BufferGeometry(), idx = new Uint32Array(ni);
  for (const name of ['position', 'normal', 'uv', 'color']) {
    const size = geos[0].attributes[name].itemSize, arr = new Float32Array(nv * size); let o = 0;
    for (const g of geos) { arr.set(g.attributes[name].array as Float32Array, o); o += g.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  let vo = 0, io = 0;
  for (const g of geos) { const src = g.index!.array; for (let i = 0; i < src.length; i++) idx[io + i] = src[i] + vo; io += src.length; vo += g.attributes.position.count; g.dispose(); }
  out.setIndex(new THREE.BufferAttribute(idx, 1)); out.computeBoundingSphere();
  const m = new THREE.Mesh(out, desertMaterial()); m.castShadow = shadows; m.receiveShadow = shadows; addToScene(m, 'landscape'); return m;
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
  const mesh = new THREE.Mesh(g, desertMaterial()); mesh.castShadow = true; mesh.receiveShadow = true; addToScene(mesh, 'landscape');
  return mesh;
}
