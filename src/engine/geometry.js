import * as THREE from 'three';
import { _q1 } from './util.js';

// ================= geometry merge helpers =================
export const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
};
export function cylGeo(rt, rb, h, seg) { const k = 'c' + rt + '_' + rb + '_' + h + '_' + seg; return GEO[k] || (GEO[k] = new THREE.CylinderGeometry(rt, rb, h, seg)); }
export function coneGeo(r, h, seg) { const k = 'k' + r + '_' + h + '_' + seg; return GEO[k] || (GEO[k] = new THREE.ConeGeometry(r, h, seg)); }
export function sphGeo(r, ws, hs) { const k = 's' + r + '_' + ws + '_' + hs; return GEO[k] || (GEO[k] = new THREE.SphereGeometry(r, ws, hs)); }
function dodecaGeo(r) { const k = 'd' + r; return GEO[k] || (GEO[k] = new THREE.DodecahedronGeometry(r, 0)); }
const _euler = new THREE.Euler(0, 0, 0, 'YXZ'), _pos = new THREE.Vector3(), _scl = new THREE.Vector3();
export function mat4(x, y, z, rx, ry, rz, sx, sy, sz) {
  _euler.set(rx || 0, ry || 0, rz || 0, 'YXZ'); _q1.setFromEuler(_euler); _pos.set(x, y, z); _scl.set(sx == null ? 1 : sx, sy == null ? 1 : sy, sz == null ? 1 : sz);
  return new THREE.Matrix4().compose(_pos, _q1, _scl);
}
export class PB { // parts builder: merges many primitives into one vertex-coloured geometry
  constructor() { this.parts = []; }
  add(geo, color, m) { this.parts.push({ geo, color, m }); return this; }
  box(w, h, d, color, x, y, z, rx, ry, rz) { return this.add(GEO.box, color, mat4(x, y, z, rx, ry, rz, w, h, d)); }
  cyl(rt, rb, h, seg, color, x, y, z, rx, ry, rz) { return this.add(cylGeo(rt, rb, h, seg), color, mat4(x, y, z, rx, ry, rz)); }
  cone(r, h, seg, color, x, y, z, rx, ry, rz) { return this.add(coneGeo(r, h, seg), color, mat4(x, y, z, rx, ry, rz)); }
  sph(r, color, x, y, z, sx, sy, sz, ws, hs) { return this.add(sphGeo(r, ws || 8, hs || 6), color, mat4(x, y, z, 0, 0, 0, sx, sy, sz)); }
  rock(r, color, x, y, z, ry, sx, sy, sz) { return this.add(dodecaGeo(r), color, mat4(x, y, z, 0.3, ry, 0.2, sx, sy, sz)); }
  build() { return mergeParts(this.parts); }
}
function mergeParts(parts) {
  const geos = []; let count = 0;
  for (const p of parts) {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    g.applyMatrix4(p.m); g.computeVertexNormals();
    geos.push([g, p.color]); count += g.attributes.position.count;
  }
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), col = new Float32Array(count * 3);
  let o = 0; const c = new THREE.Color();
  for (const [g, hex] of geos) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    c.setHex(hex);
    for (let i = 0; i < n; i++) { col[(o + i) * 3] = c.r; col[(o + i) * 3 + 1] = c.g; col[(o + i) * 3 + 2] = c.b; }
    o += n; g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}
export const MAT_VC = new THREE.MeshLambertMaterial({ vertexColors: true });

// canvas text texture for signs
const SIGNS = []; // [texture, paint] — repainted when the web fonts finish loading after boot
export function signTexture(text, bg, fg, w, h, font) {
  const cv = document.createElement('canvas'); cv.width = w || 512; cv.height = h || 128;
  const paint = () => {
    const x = cv.getContext('2d');
    x.fillStyle = bg; x.fillRect(0, 0, cv.width, cv.height);
    x.strokeStyle = fg; x.lineWidth = 6; x.strokeRect(10, 10, cv.width - 20, cv.height - 20);
    x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
    let size = cv.height * 0.58;
    x.font = (font || "400 ") + size + "px Shrikhand, 'Cooper Black', 'Arial Black', serif";
    while (x.measureText(text).width > cv.width - 50 && size > 12) { size -= 4; x.font = (font || "400 ") + size + "px Shrikhand, 'Cooper Black', 'Arial Black', serif"; }
    x.fillText(text, cv.width / 2, cv.height / 2 + size * 0.06);
  };
  paint();
  const t = new THREE.CanvasTexture(cv); t.anisotropy = 4; SIGNS.push([t, paint]); return t;
}
if (document.fonts) document.fonts.addEventListener('loadingdone', () => { for (const [t, paint] of SIGNS) { paint(); t.needsUpdate = true; } });

// de-indexed copies of source shapes (with normals), so builders can add a primitive with a plain transform loop
const FLAT = new WeakMap();
export function flatGeo(geo) {
  let f = FLAT.get(geo);
  if (!f) { f = geo.index ? geo.toNonIndexed() : geo; if (!f.attributes.normal) f.computeVertexNormals(); FLAT.set(geo, f); }
  return f;
}
