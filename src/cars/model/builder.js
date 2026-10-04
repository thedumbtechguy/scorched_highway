import * as THREE from 'three';
import { M_CHROME, M_COUNT, M_DECAL, M_PAINT, M_TRIM } from './constants.js';
import { WHITE_UV } from './decals.js';
import { DUST, _cA, _nm3 } from './loft.js';
import { smooth } from '../../engine/util.js';
import { flatGeo } from '../../engine/geometry.js';

// ----- multi-material mesh builder -----
const _gp = new THREE.Vector3(), _nv = new THREE.Vector3(), _gm = new THREE.Matrix3();
// per-slot surface: [roughness, metalness, clear coat] for paint, chrome, glass, trim, lamp, decal (see constants.js)
const PBR = [[0.42, 0.12, 1], [0.16, 1, 0], [0.05, 0.25, 0], [0.82, 0, 0], [1, 0, 0], [0.4, 0.08, 1]];
export class MB {
  constructor(dirt) { this.g = []; for (let i = 0; i < M_COUNT; i++) this.g.push({ p: [], n: [], c: [], u: [] }); this.dirt = dirt || 0; }
  vert(mi, x, y, z, nx, ny, nz, hex, u, v) {
    const g = this.g[mi]; g.p.push(x, y, z); g.n.push(nx, ny, nz); g.u.push(u == null ? WHITE_UV : u, v == null ? 1 - WHITE_UV : v);
    _cA.setHex(hex);
    const dk = mi === M_PAINT || mi === M_TRIM || mi === M_DECAL ? 1 : mi === M_CHROME ? 0.4 : 0;
    if (dk && this.dirt) { const a = this.dirt * dk * (1 - smooth(0.25, 1.15, y)) * (0.75 + 0.25 * Math.max(0, -ny)); _cA.lerp(DUST, a); }
    g.c.push(_cA.r, _cA.g, _cA.b);
  }
  geo(mi, geo, m, color) {
    const f = flatGeo(geo), p = f.attributes.position.array, n = f.attributes.normal.array, fn = typeof color === 'function';
    _gm.getNormalMatrix(m);
    for (let i = 0; i < p.length; i += 3) {
      _gp.set(p[i], p[i + 1], p[i + 2]).applyMatrix4(m); _nv.set(n[i], n[i + 1], n[i + 2]).applyMatrix3(_gm).normalize();
      this.vert(mi, _gp.x, _gp.y, _gp.z, _nv.x, _nv.y, _nv.z, fn ? color(_gp.x, _gp.y, _gp.z) : color);
    }
    return this;
  }
  // cls: hex (paint) | fn(cx,cy,cz,nx,ny,nz) -> hex or [mi, hex]
  loft(L, cls, m) {
    const P = L.P, N = L.N, v = new THREE.Vector3(), nn = new THREE.Vector3();
    if (m) _nm3.getNormalMatrix(m);
    const tp = [], tn = [];
    for (let i = 0; i < P.length; i += 3) {
      v.set(P[i], P[i + 1], P[i + 2]); nn.set(N[i], N[i + 1], N[i + 2]);
      if (m) { v.applyMatrix4(m); nn.applyMatrix3(_nm3).normalize(); }
      tp.push(v.x, v.y, v.z); tn.push(nn.x, nn.y, nn.z);
    }
    for (let i = 0; i < tp.length; i += 9) {
      let mi = M_PAINT, hex = cls;
      if (typeof cls === 'function') {
        const cx = (tp[i] + tp[i + 3] + tp[i + 6]) / 3, cy = (tp[i + 1] + tp[i + 4] + tp[i + 7]) / 3, cz = (tp[i + 2] + tp[i + 5] + tp[i + 8]) / 3;
        const ux = tp[i + 3] - tp[i], uy = tp[i + 4] - tp[i + 1], uz = tp[i + 5] - tp[i + 2], wx = tp[i + 6] - tp[i], wy = tp[i + 7] - tp[i + 1], wz = tp[i + 8] - tp[i + 2];
        let fx = uy * wz - uz * wy, fy = uz * wx - ux * wz, fz = ux * wy - uy * wx; const l = Math.hypot(fx, fy, fz) || 1; fx /= l; fy /= l; fz /= l;
        const r = cls(cx, cy, cz, fx, fy, fz);
        if (Array.isArray(r)) { mi = r[0]; hex = r[1]; } else hex = r;
      } else if (Array.isArray(cls)) { mi = cls[0]; hex = cls[1]; }
      for (let k = 0; k < 9; k += 3) this.vert(mi, tp[i + k], tp[i + k + 1], tp[i + k + 2], tn[i + k], tn[i + k + 1], tn[i + k + 2], hex);
    }
    return this;
  }
  /** Vertex counts so far, for mirrorX. */
  mark() { return this.g.map(g => g.p.length); }
  /** Duplicate everything added since `mark`, mirrored across x = 0 (wound so it still faces out). */
  mirrorX(mark) {
    this.g.forEach((g, mi) => {
      const end = g.p.length;
      for (let i = mark[mi]; i < end; i += 9) for (const k of [0, 2, 1]) {
        const v = i / 3 + k;
        g.p.push(-g.p[v * 3], g.p[v * 3 + 1], g.p[v * 3 + 2]); g.n.push(-g.n[v * 3], g.n[v * 3 + 1], g.n[v * 3 + 2]);
        g.c.push(g.c[v * 3], g.c[v * 3 + 1], g.c[v * 3 + 2]); g.u.push(g.u[v * 2], g.u[v * 2 + 1]);
      }
    });
  }
  /** Merge material slots into draw groups: `groups[i]` lists the slots drawn with material i. Each vertex gets
   *  a `pbr` attribute (roughness, metalness, clear coat) from its slot, which the car materials read. */
  buildMerged(groups) {
    let count = 0; for (const slots of groups) for (const mi of slots) count += this.g[mi].p.length / 3;
    const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), col = new Float32Array(count * 3), uv = new Float32Array(count * 2), pbr = new Float32Array(count * 3);
    const out = new THREE.BufferGeometry(); let o = 0;
    groups.forEach((slots, gi) => {
      const start = o;
      for (const mi of slots) {
        const g = this.g[mi], n = g.p.length / 3; if (!n) continue;
        pos.set(g.p, o * 3); nor.set(g.n, o * 3); col.set(g.c, o * 3); uv.set(g.u, o * 2);
        for (let i = 0; i < n; i++) pbr.set(PBR[mi], (o + i) * 3);
        o += n;
      }
      if (o > start) out.addGroup(start, o - start, gi);
    });
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.setAttribute('pbr', new THREE.BufferAttribute(pbr, 3));
    out.computeBoundingSphere();
    return out;
  }
  /** Build a geometry; `only` limits it to some material slots (group indices still match the full material list). */
  build(only) {
    const use = (mi) => !only || only.includes(mi);
    let count = 0; this.g.forEach((g, mi) => { if (use(mi)) count += g.p.length / 3; });
    const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), col = new Float32Array(count * 3), uv = new Float32Array(count * 2);
    const out = new THREE.BufferGeometry(); let o = 0;
    this.g.forEach((g, mi) => {
      const n = g.p.length / 3; if (!n || !use(mi)) return;
      pos.set(g.p, o * 3); nor.set(g.n, o * 3); col.set(g.c, o * 3); uv.set(g.u, o * 2);
      out.addGroup(o, n, mi); o += n;
    });
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.computeBoundingSphere();
    return out;
  }
}
