// The town: textured false-front buildings, porches, the gas station, ramps and roadside bits.
// Built as one multi-material mesh; textures are near-white so vertex colours paint them.
import * as THREE from 'three';
import { flatGeo, signTexture } from '../engine/geometry.js';
import { addToScene } from '../engine/renderer.js';
import { onTod } from '../engine/sky';
import { TAU, mulberry32 } from '../engine/util.js';
import { fbm, toTexture } from './textures';

// ---------- textures ----------
const S = 512;
function clapboard() { // horizontal boards, 8 per tile, chipped paint
  const n = fbm(S, [4, 64, 128], 41), chip = fbm(S, [16, 64, 128], 42), r = mulberry32(3);
  return toTexture(S, img => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x, by = y % 64, grain = 0.92 + (n[(y * 8 % S) * S + x] - 0.5) * 0.16;
      const v = grain * (by < 3 ? 1.08 : by > 58 ? 0.55 + (63 - by) * 0.06 : 1);
      let rr = v, gg = v, bb = v;
      if (chip[i] > 0.76) { rr = 0.55 * grain; gg = 0.42 * grain; bb = 0.32 * grain; } // bare wood
      const k = (1 + (r() - 0.5) * 0.04) * 255;
      img.data[i * 4] = Math.min(255, rr * k); img.data[i * 4 + 1] = Math.min(255, gg * k * 0.98); img.data[i * 4 + 2] = Math.min(255, bb * k * 0.95); img.data[i * 4 + 3] = 255;
    }
  });
}
function planks() { // vertical weathered planks with dark gaps
  const n = fbm(S, [2, 32, 256], 51), r = mulberry32(5), tone = Array.from({ length: 8 }, () => 0.8 + r() * 0.25);
  return toTexture(S, img => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x, px = x % 64, t = tone[(x / 64) | 0] * (0.85 + (n[((y / 8) | 0) * S + x] - 0.5) * 0.35);
      const v = px < 2 ? 0.25 : t;
      img.data[i * 4] = v * 196; img.data[i * 4 + 1] = v * 152; img.data[i * 4 + 2] = v * 112; img.data[i * 4 + 3] = 255;
    }
  });
}
function stucco() {
  const n = fbm(S, [8, 32, 128, 256], 61), m = fbm(S, [3, 6], 62);
  return toTexture(S, img => {
    for (let i = 0; i < S * S; i++) { const v = (0.86 + (n[i] - 0.5) * 0.18 + (m[i] - 0.5) * 0.12) * 255; img.data[i * 4] = v; img.data[i * 4 + 1] = v * 0.97; img.data[i * 4 + 2] = v * 0.93; img.data[i * 4 + 3] = 255; }
  });
}
function brick() { // running bond, 8 courses per tile
  const n = fbm(S, [32, 128], 71), r = mulberry32(7), tones = Array.from({ length: 128 }, () => 0.75 + r() * 0.3);
  return toTexture(S, img => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x, row = (y / 64) | 0, off = row % 2 ? 64 : 0, bx = (x + off) % 128, by = y % 64, id = row * 4 + (((x + off) / 128) | 0) % 4;
      const mortar = bx < 5 || by < 5, t = tones[id % 128] * (0.9 + (n[i] - 0.5) * 0.3);
      const [cr, cg, cb] = mortar ? [205, 192, 172] : [178 * t, 92 * t, 70 * t];
      img.data[i * 4] = cr; img.data[i * 4 + 1] = cg; img.data[i * 4 + 2] = cb; img.data[i * 4 + 3] = 255;
    }
  });
}
function tin() { // corrugated sheet with rust runs from the top
  const n = fbm(S, [4, 16, 64], 81), runs = fbm(S, [64, 128], 82);
  return toTexture(S, img => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x, c = 0.78 + 0.22 * Math.sin(x / S * TAU * 24), rust = Math.max(0, (runs[(x * 7) % S] - 0.55) * 3 * (1 - y / S)) + Math.max(0, n[i] - 0.68) * 2.5;
      const k = Math.min(1, rust);
      img.data[i * 4] = (c * (1 - k) * 0.86 + k * 0.55) * 255; img.data[i * 4 + 1] = (c * (1 - k) * 0.86 + k * 0.3) * 255; img.data[i * 4 + 2] = (c * (1 - k) * 0.88 + k * 0.16) * 255; img.data[i * 4 + 3] = 255;
    }
  });
}

// ---------- multi-material builder with box-projected UVs ----------
const enum M { Siding, Planks, Stucco, Brick, Tin, Trim, Glass, LitGlass, Sign }
const TILE = [2, 2.4, 3, 2, 2.2, 1, 1, 1, 1]; // metres per texture repeat
class TownBuilder {
  g = Array.from({ length: 9 }, () => ({ p: [] as number[], n: [] as number[], c: [] as number[], u: [] as number[] }));
  frame = new THREE.Matrix4();
  private nm = new THREE.Matrix3(); private v = new THREE.Vector3(); private w = new THREE.Vector3(); private col = new THREE.Color();
  private m = new THREE.Matrix4(); private tp: number[] = []; private tn: number[] = [];
  add(mi: M, geo: THREE.BufferGeometry, local: THREE.Matrix4, color: number) {
    const f = flatGeo(geo), src = f.attributes.position.array, srcN = f.attributes.normal.array, b = this.g[mi], tile = TILE[mi];
    this.m.multiplyMatrices(this.frame, local); this.nm.getNormalMatrix(this.m);
    // transform into scratch arrays, then project UVs per triangle
    const p = this.tp, n = this.tn; p.length = n.length = src.length;
    for (let i = 0; i < src.length; i += 3) {
      this.v.set(src[i], src[i + 1], src[i + 2]).applyMatrix4(this.m); p[i] = this.v.x; p[i + 1] = this.v.y; p[i + 2] = this.v.z;
      this.v.set(srcN[i], srcN[i + 1], srcN[i + 2]).applyMatrix3(this.nm).normalize(); n[i] = this.v.x; n[i + 1] = this.v.y; n[i + 2] = this.v.z;
    }
    this.col.setHex(color);
    for (let i = 0; i < p.length; i += 9) {
      // project each triangle on the axis its face points along
      this.v.set(p[i + 3] - p[i], p[i + 4] - p[i + 1], p[i + 5] - p[i + 2]); this.w.set(p[i + 6] - p[i], p[i + 7] - p[i + 1], p[i + 8] - p[i + 2]); this.v.cross(this.w);
      const ax = Math.abs(this.v.x), ay = Math.abs(this.v.y), az = Math.abs(this.v.z);
      for (let k = 0; k < 9; k += 3) {
        const x = p[i + k], y = p[i + k + 1], z = p[i + k + 2];
        b.p.push(x, y, z); b.n.push(n[i + k], n[i + k + 1], n[i + k + 2]); b.c.push(this.col.r, this.col.g, this.col.b);
        if (ay >= ax && ay >= az) b.u.push(x / tile, z / tile); else if (ax >= az) b.u.push(z / tile, y / tile); else b.u.push(x / tile, y / tile);
      }
    }
  }
  box(mi: M, w: number, h: number, d: number, color: number, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) {
    this.add(mi, BOX, mat(x, y, z, rx, ry, rz, w, h, d), color);
  }
  cyl(mi: M, r: number, h: number, color: number, x: number, y: number, z: number, seg = 10, rx = 0, rz = 0) {
    this.add(mi, new THREE.CylinderGeometry(r, r, h, seg), mat(x, y, z, rx, 0, rz), color);
  }
  build(): THREE.BufferGeometry {
    const out = new THREE.BufferGeometry(); let n = 0; for (const b of this.g) n += b.p.length / 3;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), uv = new Float32Array(n * 2); let o = 0;
    this.g.forEach((b, mi) => { const k = b.p.length / 3; if (!k) return; pos.set(b.p, o * 3); nor.set(b.n, o * 3); col.set(b.c, o * 3); uv.set(b.u, o * 2); out.addGroup(o, k, mi); o += k; });
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.computeBoundingSphere(); return out;
  }
}
const BOX = new THREE.BoxGeometry(1, 1, 1);
const _e = new THREE.Euler(), _q = new THREE.Quaternion();
function mat(x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));
}

// ---------- building parts (local space: front faces +z, ground at y = 0) ----------
const WOOD = 0x6b4a36, DARK_WOOD = 0x4a3226, WHITE_TRIM = 0xe8e0d0;
type Style = 'siding' | 'brick' | 'stucco' | 'tin';
const WALL: Record<Style, M> = { siding: M.Siding, brick: M.Brick, stucco: M.Stucco, tin: M.Tin };
function window(T: TownBuilder, x: number, y: number, z: number, w: number, h: number, lit: boolean, trim: number, opts: { bars?: boolean; shutters?: number } = {}) {
  T.box(M.Trim, w + 0.24, h + 0.24, 0.1, trim, x, y, z + 0.03);             // frame
  T.box(lit ? M.LitGlass : M.Glass, w, h, 0.06, 0xffffff, x, y, z + 0.06);   // glass
  T.box(M.Trim, w, 0.06, 0.08, trim, x, y, z + 0.1); T.box(M.Trim, 0.06, h, 0.08, trim, x, y, z + 0.1); // mullions
  T.box(M.Trim, w + 0.4, 0.1, 0.24, trim, x, y - h / 2 - 0.12, z + 0.1);     // sill
  if (opts.bars) for (let i = -2; i <= 2; i++) T.box(M.Trim, 0.04, h, 0.04, 0x2a2a2a, x + i * w / 5, y, z + 0.16);
  if (opts.shutters) for (const s of [-1, 1]) { T.box(M.Planks, w * 0.45, h + 0.1, 0.06, opts.shutters, x + s * (w * 0.75 + 0.12), y, z + 0.06, s * 0.15); }
}
function door(T: TownBuilder, x: number, z: number, w: number, h: number, color: number, saloon = false) {
  T.box(M.Trim, w + 0.3, h + 0.15, 0.1, WHITE_TRIM, x, h / 2, z + 0.02);
  T.box(M.Trim, w, h, 0.06, 0x1c1418, x, h / 2, z + 0.05); // dark interior
  if (saloon) for (const s of [-1, 1]) T.box(M.Planks, w / 2 - 0.04, h * 0.42, 0.06, color, x + s * w / 4, h * 0.52, z + 0.12, s * 0.35);
  else { T.box(M.Planks, w - 0.08, h - 0.06, 0.06, color, x, h / 2, z + 0.08); T.box(M.Trim, 0.08, 0.08, 0.06, 0xc8b070, x + w * 0.35, h * 0.48, z + 0.14); }
}
function porch(T: TownBuilder, w: number, depth: number, z: number, roofY: number, post: number, roofCol: number, rail: boolean) {
  T.box(M.Planks, w, 0.25, depth, 0xffffff, 0, 0.13, z + depth / 2);                                     // deck
  T.box(M.Planks, w, 0.18, 0.3, 0xd8c8b0, 0, 0.09, z + depth + 0.15);                                  // step
  T.box(M.Tin, w + 0.2, 0.1, depth + 0.4, roofCol, 0, roofY, z + depth / 2 + 0.1, 0, -0.08);           // roof, slight fall
  T.box(M.Trim, w + 0.2, 0.22, 0.12, post, 0, roofY - 0.12, z + depth + 0.25);                         // fascia
  const n = Math.max(2, Math.round(w / 3.5));
  for (let i = 0; i <= n; i++) {
    const px = -w / 2 + 0.2 + i * (w - 0.4) / n;
    T.box(M.Trim, 0.22, roofY, 0.22, post, px, roofY / 2, z + depth - 0.1);
    for (const s of [-1, 1]) if ((s < 0 && i > 0) || (s > 0 && i < n)) T.box(M.Trim, 0.6, 0.1, 0.1, post, px + s * 0.28, roofY - 0.38, z + depth - 0.1, 0, 0, s * 0.7); // brackets
    if (rail && i < n) { const mx = px + (w - 0.4) / n / 2; if (Math.abs(mx) > 1.4) { T.box(M.Trim, (w - 0.4) / n - 0.2, 0.08, 0.08, post, mx, 1.0, z + depth - 0.1); for (let k = -2; k <= 2; k++) T.box(M.Trim, 0.05, 0.75, 0.05, post, mx + k * 0.5, 0.62, z + depth - 0.1); } }
  }
}
/** Main body with a pitched roof behind a false front; returns the front-face z. */
function body(T: TownBuilder, w: number, d: number, h: number, style: Style, color: number, roofCol: number) {
  T.box(WALL[style], w, h, d, color, 0, h / 2, 0);
  const rise = Math.min(2.2, w * 0.2), ridge = new THREE.BufferGeometry();
  const hw = w / 2 + 0.25, hd = d / 2 + 0.2;
  // gable roof along the depth: two slopes plus the gable ends (in wall colour)
  const v = (a: number[]) => new THREE.Float32BufferAttribute(a, 3);
  ridge.setAttribute('position', v([-hw, 0, -hd, 0, rise, -hd, 0, rise, hd, -hw, 0, -hd, 0, rise, hd, -hw, 0, hd, hw, 0, -hd, hw, 0, hd, 0, rise, hd, hw, 0, -hd, 0, rise, hd, 0, rise, -hd]));
  ridge.computeVertexNormals();
  T.add(M.Tin, ridge, mat(0, h, 0), roofCol);
  const gable = new THREE.BufferGeometry(); gable.setAttribute('position', v([-w / 2, 0, -d / 2, w / 2, 0, -d / 2, 0, rise - 0.1, -d / 2, w / 2, 0, d / 2 - 0.3, -w / 2, 0, d / 2 - 0.3, 0, rise - 0.1, d / 2 - 0.3]));
  gable.computeVertexNormals(); T.add(WALL[style], gable, mat(0, h, 0), color);
  T.box(M.Trim, w + 0.1, 0.18, 0.18, DARK_WOOD, 0, 0.09, d / 2 + 0.02);                                 // sill board
  for (const s of [-1, 1]) T.box(M.Trim, 0.16, h, 0.16, WHITE_TRIM, s * (w / 2 + 0.02), h / 2, d / 2 + 0.02); // corner boards
  return d / 2;
}
/** Tall false front with a shaped top: 'flat' | 'step' | 'arch' | 'peak'. */
function falseFront(T: TownBuilder, w: number, h: number, top: number, z: number, shape: string, style: Style, color: number, trim: number) {
  const s = new THREE.Shape(), hw = w / 2;
  s.moveTo(-hw, 0); s.lineTo(hw, 0); s.lineTo(hw, h);
  if (shape === 'step') { s.lineTo(hw * 0.62, h); s.lineTo(hw * 0.62, h + top * 0.5); s.lineTo(hw * 0.3, h + top * 0.5); s.lineTo(hw * 0.3, h + top); s.lineTo(-hw * 0.3, h + top); s.lineTo(-hw * 0.3, h + top * 0.5); s.lineTo(-hw * 0.62, h + top * 0.5); s.lineTo(-hw * 0.62, h); }
  else if (shape === 'arch') { s.lineTo(hw * 0.55, h); s.quadraticCurveTo(hw * 0.5, h + top, 0, h + top); s.quadraticCurveTo(-hw * 0.5, h + top, -hw * 0.55, h); }
  else if (shape === 'peak') { s.lineTo(0, h + top); }
  else { s.lineTo(hw, h + top); s.lineTo(-hw, h + top); }
  s.lineTo(-hw, h); s.lineTo(-hw, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.35, bevelEnabled: false, curveSegments: 10 });
  T.add(WALL[style], g, mat(0, 0, z - 0.33), color); g.dispose(); // flush with the wall face so doors and windows sit in front
  T.box(M.Trim, w + 0.5, 0.3, 0.5, trim, 0, h + 0.05, z + 0.25);      // cornice
  for (let i = 0; i < Math.round(w / 1.2); i++) T.box(M.Trim, 0.12, 0.28, 0.32, trim, -hw + 0.4 + i * (w - 0.8) / Math.max(1, Math.round(w / 1.2) - 1), h - 0.2, z + 0.42); // dentils
}

export const SIGNS: THREE.Mesh[] = [];
function sign(text: string, colors: [string, string], w: number, x: number, y: number, z: number, ry: number, frame: (sw: number) => void) {
  const tex = signTexture(text, colors[0], colors[1], 512, 128);
  const sm = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4.2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
  sm.position.set(x, y, z); sm.rotation.y = ry; addToScene(sm, 'town'); SIGNS.push(sm); frame(w);
}

// ---------- the buildings ----------
export interface Building { cx: number; cz: number; w: number; d: number; h: number; c: number; f: number; sign: string | null; sc?: [string, string] }
type Recipe = (T: TownBuilder, b: Building, fz: number, r: () => number) => void;
const RECIPES: Record<string, Recipe> = {
  Saloon: (T, b, fz) => {
    body(T, b.w, b.d, b.h, 'siding', b.c, 0x8a7a6a);
    falseFront(T, b.w, b.h, 2.6, fz, 'step', 'siding', b.c, 0x5a2a1f);
    porch(T, b.w, 2.8, fz, 3.4, 0x5a3a2a, 0x7a5a4a, true);
    door(T, 0, fz, 1.8, 2.6, 0x8a5a3a, true);
    for (const x of [-4.2, 4.2]) { window(T, x, 1.9, fz, 1.6, 1.5, true, WHITE_TRIM); window(T, x, 5.2, fz, 1.3, 1.3, false, WHITE_TRIM); }
    T.box(M.Planks, b.w - 1, 0.12, 1.4, 0xffffff, 0, 3.9, fz + 0.7); // balcony on the porch roof
  },
  'Feed & Seed': (T, b, fz) => {
    body(T, b.w, b.d, b.h, 'siding', b.c, 0x6a6a64);
    falseFront(T, b.w, b.h, 2.2, fz, 'peak', 'siding', b.c, 0xf6ead4);
    porch(T, b.w, 2.8, fz, 3.4, WOOD, 0x8a8478, false);
    T.box(M.Trim, 3.2, 2.8, 0.1, WHITE_TRIM, 0, 1.4, fz + 0.03); T.box(M.Planks, 3, 2.7, 0.08, 0x9a3a2a, 0, 1.38, fz + 0.06);
    for (const s of [-1, 1]) T.box(M.Trim, 2.9, 0.14, 0.08, WHITE_TRIM, 0, 1.38, fz + 0.12, 0, 0, s * 0.72); // barn door X
    window(T, -4, 1.9, fz, 1.4, 1.3, false, WHITE_TRIM); window(T, 4, 1.9, fz, 1.4, 1.3, true, WHITE_TRIM);
    for (let i = 0; i < 5; i++) T.box(M.Planks, 0.8, 0.5, 0.5, 0xd8c8a0, -4.6 + (i % 3) * 0.85, 0.5 + Math.floor(i / 3) * 0.5, fz + 1.6); // feed sacks
  },
  Hotel: (T, b, fz) => {
    body(T, b.w, b.d, b.h, 'brick', 0xffffff, 0x5a4a44);
    falseFront(T, b.w, b.h, 1.6, fz, 'flat', 'brick', 0xffffff, 0xe8dcc8);
    porch(T, b.w, 2.8, fz, 3.4, 0x3a2a24, 0x6a5a54, false);
    door(T, 0, fz, 1.6, 2.7, 0x3a2a24);
    for (const y of [5.4, 8.6]) for (const x of [-3.2, 0, 3.2]) window(T, x, y, fz, 1.2, 1.6, (x + y) % 2 > 0.5, 0xe8dcc8, { shutters: 0x27606a });
    for (const x of [-3.2, 3.2]) window(T, x, 1.9, fz, 1.6, 1.5, true, 0xe8dcc8);
    T.box(M.Planks, b.w, 0.15, 1.6, 0xffffff, 0, 6.6 - 2.3, fz + 0.8); // 2nd floor balcony
    for (let i = 0; i < 11; i++) T.box(M.Trim, 0.05, 0.8, 0.05, 0x3a2a24, -b.w / 2 + 0.4 + i * (b.w - 0.8) / 10, 4.7, fz + 1.55);
    T.box(M.Trim, b.w, 0.08, 0.08, 0x3a2a24, 0, 5.1, fz + 1.55);
  },
  Eats: (T, b, fz) => { // roadside diner
    T.box(M.Stucco, b.w, b.h, b.d, 0xf2ead8, 0, b.h / 2, 0);
    T.box(M.Trim, b.w + 0.6, 0.5, b.d + 0.6, 0xc0392b, 0, b.h + 0.1, 0); T.box(M.Trim, b.w + 0.62, 0.12, b.d + 0.62, 0xe8e6e2, 0, b.h - 0.2, 0);
    T.box(M.Trim, b.w + 0.04, 0.3, 0.05, 0xc0392b, 0, 1.0, fz + 0.03); T.box(M.Trim, b.w + 0.04, 0.08, 0.05, 0xe8e6e2, 0, 1.25, fz + 0.04);
    for (let i = 0; i < 4; i++) window(T, -5.6 + i * 2.6 + (i > 1 ? 1.4 : 0), 2.5, fz, 2.2, 1.6, true, 0xe8e6e2);
    door(T, -0.3, fz, 1.4, 2.4, 0xc0392b);
    T.box(M.Trim, b.w * 0.8, 0.12, 2.2, 0xf2ead8, 0, 3.6, fz + 1.1); // canopy
    T.box(M.Trim, 0.12, 3.5, 0.12, 0xe8e6e2, -b.w * 0.38, 1.75, fz + 2.1); T.box(M.Trim, 0.12, 3.5, 0.12, 0xe8e6e2, b.w * 0.38, 1.75, fz + 2.1);
  },
  Motel: (T, b, fz) => {
    T.box(M.Stucco, b.w, b.h, b.d, 0xf0e2ee, 0, b.h / 2, 0);
    T.box(M.Trim, b.w + 0.4, 0.35, b.d + 0.4, 0x27888a, 0, b.h + 0.1, 0);
    T.box(M.Planks, b.w, 0.2, 1.8, 0xd8c8b0, 0, 3.8, fz + 0.9); // walkway
    for (let i = 0; i < 6; i++) T.box(M.Trim, 0.05, 0.9, 0.05, 0x27888a, -b.w / 2 + 0.3 + i * (b.w - 0.6) / 5, 4.35, fz + 1.75);
    T.box(M.Trim, b.w, 0.07, 0.07, 0x27888a, 0, 4.8, fz + 1.75);
    for (let k = 0; k < 2; k++) for (const s of [-1, 1]) { door(T, s * 2.6, fz, 1.0, 2.2, k ? 0xf2b134 : 0x27888a); window(T, s * 1.1 + s * 0.5, 1.7 + k * 3.8, fz, 1.0, 0.9, (k + s) % 2 === 0, WHITE_TRIM); }
    for (const s of [-1, 1]) T.box(M.Trim, 0.15, 3.8, 0.15, 0x27888a, s * (b.w / 2 - 0.2), 1.9, fz + 1.75);
  },
  Garage: (T, b, fz) => {
    body(T, b.w, b.d, b.h, 'tin', 0xd8d2c4, 0x9a8a7a);
    falseFront(T, b.w, b.h, 1.4, fz, 'flat', 'tin', 0xc8c0b0, 0x7e8c6a);
    T.box(M.Trim, 5.4, 4.2, 0.12, 0x7e8c6a, -2.5, 2.1, fz + 0.03); T.box(M.Tin, 5, 3.9, 0.1, 0xb8b0a0, -2.5, 1.95, fz + 0.06, 0, 0, Math.PI / 2); // roll-up door
    window(T, 4, 2.2, fz, 2.4, 1.4, true, 0x7e8c6a); door(T, 1.8, fz, 1.0, 2.3, 0x7e8c6a);
    for (let i = 0; i < 4; i++) T.cyl(M.Trim, 0.42, 0.28, 0x1a1818, 6.4, 0.14 + i * 0.29, fz + 1.2, 16); // tire stack
    T.box(M.Trim, 2.4, 0.9, 0.8, 0xc0392b, -6, 0.45, fz + 0.9); // tool chest
  },
  Jail: (T, b, fz) => {
    body(T, b.w, b.d, b.h, 'stucco', 0xe0c09a, 0x7a6a5a);
    falseFront(T, b.w, b.h, 1.4, fz, 'arch', 'stucco', 0xe0c09a, 0x6a4a36);
    porch(T, b.w, 2.8, fz, 3.4, DARK_WOOD, 0x6a5a4a, false);
    door(T, -1.5, fz, 1.2, 2.5, 0x2a2a2a);
    window(T, 2.3, 1.9, fz, 1.2, 1.1, false, 0x5a5a5a, { bars: true });
  },
  Bank: (T, b, fz) => {
    body(T, b.w, b.d, b.h, 'brick', 0xffffff, 0x5a4a44);
    falseFront(T, b.w, b.h, 2.2, fz, 'arch', 'brick', 0xffffff, 0xe8dcc8);
    for (const x of [-b.w / 2 + 0.5, -2.2, 2.2, b.w / 2 - 0.5]) T.box(M.Stucco, 0.7, b.h, 0.3, 0xefe6d6, x, b.h / 2, fz + 0.15); // pilasters
    porch(T, b.w, 2.8, fz, 3.4, 0x3a2a24, 0x5a5050, false);
    door(T, 0, fz, 1.8, 2.9, 0x3a2a24);
    for (const x of [-4.4, 4.4]) { window(T, x, 1.9, fz, 1.6, 1.6, false, 0xe8dcc8, { bars: true }); window(T, x, 5.6, fz, 1.4, 1.5, false, 0xe8dcc8); }
  },
  office: (T, b, fz) => { // gas station office
    T.box(M.Stucco, b.w, b.h, b.d, 0xf4efe6, 0, b.h / 2, 0);
    T.box(M.Trim, b.w + 0.4, 0.3, b.d + 0.4, 0xc0392b, 0, b.h + 0.05, 0);
    door(T, -2.4, fz, 1.2, 2.3, 0xc0392b); window(T, 1.0, 2.0, fz, 3.4, 1.6, true, 0xe8e6e2);
    T.box(M.Trim, 1.0, 1.5, 0.6, 0xc0392b, 3.3, 0.75, fz + 0.5); // vending machine
  },
};

/** Build every building plus the gas station, ramps and roadside furniture. */
export function buildTown(buildings: Building[], ramps: Array<{ x: number; z: number; yaw: number; len: number; w: number; h: number; base: number }>, poles: Array<[number, number, number]>) {
  const T = new TownBuilder(), r = mulberry32(1877);
  for (const b of buildings) {
    T.frame = mat(b.cx, 0, b.cz, 0, b.f > 0 ? 0 : Math.PI, 0);
    const fz = b.d / 2;
    (RECIPES[b.sign || 'office'] || RECIPES.office)(T, b, fz, r);
    // side windows: local +z points out of each side wall
    for (const s of [-1, 1]) { T.frame = mat(b.cx + s * b.w / 2, 0, b.cz, 0, s * Math.PI / 2, 0); window(T, 0, 2.2, 0, 1.4, 1.2, false, WHITE_TRIM); }
    if (b.sign && b.sc) {
      const ry = b.f > 0 ? 0 : Math.PI, zf = b.cz + b.f * (fz + 0.62), sw = Math.min(b.w - 1.5, 8), hy = b.h + 1.25;
      sign(b.sign, b.sc, sw, b.cx, hy, zf, ry, w => { T.frame = mat(b.cx, 0, b.cz, 0, ry, 0); T.box(M.Trim, w + 0.3, w / 4.2 + 0.3, 0.12, 0x2a1d1a, 0, hy, fz + 0.55); });
      if (b.sign === 'Eats') { T.frame = mat(b.cx, 0, b.cz, 0, ry, 0); for (const s of [-1, 1]) T.box(M.Trim, 0.12, 1.6, 0.12, 0x9a9a9a, s * 3.5, b.h + 0.6, fz + 0.4); }
    }
  }
  // gas station canopy
  T.frame = new THREE.Matrix4();
  T.box(M.Trim, 16, 0.7, 11, 0xf4efe6, 34, 5.45, -24); T.box(M.Trim, 16.3, 0.35, 11.3, 0xc0392b, 34, 5.0, -24); T.box(M.Trim, 16.32, 0.08, 11.32, 0xf4efe6, 34, 5.2, -24);
  for (const [px, pz] of [[27, -19.5], [41, -19.5], [27, -28.5], [41, -28.5]]) { T.cyl(M.Trim, 0.3, 5, 0xe8e6e2, px, 2.5, pz, 12); T.cyl(M.Trim, 0.36, 0.5, 0xc0392b, px, 0.25, pz, 12); }
  T.box(M.Trim, 14, 0.2, 2.2, 0xb8b0a4, 34, 0.1, -24); // pump island
  T.cyl(M.Trim, 0.22, 9, 0x5a5048, 48, 4.5, -16, 8);
  // telephone poles
  for (const [px, py, pz] of poles) {
    T.cyl(M.Planks, 0.2, 9.2, 0xa08a70, px, py + 4.5, pz, 7);
    T.box(M.Planks, 2.4, 0.18, 0.2, 0xa08a70, px, py + 8.2, pz); for (const s of [-1, 0.4, 1]) T.cyl(M.Glass, 0.06, 0.18, 0xffffff, px + s * 1.05, py + 8.4, pz, 6);
  }
  // ramps: plank deck on a timber frame, hazard stripes
  for (const rp of ramps) {
    T.frame = mat(rp.x, rp.base, rp.z, 0, rp.yaw, 0);
    const ang = Math.atan2(rp.h, rp.len), L = Math.hypot(rp.len, rp.h);
    T.box(M.Planks, rp.w, 0.2, L, 0xffffff, 0, rp.h / 2, 0, 0, -ang);
    for (const s of [-1, 1]) { T.box(M.Trim, 0.6, 0.04, L, 0xf2b134, s * rp.w * 0.3, rp.h / 2 + 0.11, 0, 0, -ang); T.box(M.Trim, 0.3, rp.h, 0.3, DARK_WOOD, s * (rp.w / 2 - 0.2), rp.h / 2, rp.len / 2 - 0.2); T.box(M.Trim, 0.3, rp.h / 2, 0.3, DARK_WOOD, s * (rp.w / 2 - 0.2), rp.h / 4, 0); }
    // solid sides so it reads as a wedge
    for (const s of [-1, 1]) {
      const a = [0, 0, -rp.len / 2], b = [0, 0, rp.len / 2], c = [0, rp.h, rp.len / 2]; // wound to face outwards on each side
      const side = new THREE.BufferGeometry(); side.setAttribute('position', new THREE.Float32BufferAttribute(s < 0 ? [...a, ...b, ...c] : [...a, ...c, ...b], 3)); side.computeVertexNormals();
      T.add(M.Planks, side, mat(s * rp.w / 2, 0, 0), 0xb09078);
    }
    T.box(M.Planks, rp.w, rp.h, 0.2, 0xb09078, 0, rp.h / 2, rp.len / 2);
  }
  // hitching rail and water trough by the saloon
  T.frame = new THREE.Matrix4();
  T.box(M.Trim, 6, 0.14, 0.14, WOOD, -40, 0.95, 11.5); for (const x of [-43, -37]) T.box(M.Trim, 0.18, 1.0, 0.18, WOOD, x, 0.5, 11.5);
  T.box(M.Planks, 2.4, 0.7, 0.8, 0xffffff, -35, 0.35, 11.6); T.box(M.Glass, 2.2, 0.05, 0.6, 0xffffff, -35, 0.66, 11.6);

  const mats = townMaterials();
  const mesh = new THREE.Mesh(T.build(), mats); mesh.castShadow = true; mesh.receiveShadow = true; addToScene(mesh, 'town');
  return mesh;
}

function townMaterials(): THREE.Material[] {
  const std = (map: THREE.Texture | null, rough: number, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, map, roughness: rough, metalness: 0, ...extra });
  const glass = std(null, 0.15, { color: 0x2a3a44, metalness: 0.4 });
  const lit = std(null, 0.2, { color: 0x3a3a3a, emissive: new THREE.Color(0xffb860), emissiveIntensity: 0 });
  onTod(t => { lit.emissiveIntensity = t.night ? 1.1 : 0; lit.color.setHex(t.night ? 0x5a4a30 : 0x2a3a44); });
  const tinMat = std(tin(), 0.55, { metalness: 0.35 });
  return [std(clapboard(), 0.85), std(planks(), 0.9), std(stucco(), 0.95), std(brick(), 0.9), tinMat, std(null, 0.8), glass, lit, std(null, 0.7)];
}
