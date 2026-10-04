import * as THREE from 'three';
import { M_CHROME, M_COUNT, M_DECAL, M_PAINT, M_TRIM } from './constants.js';
import { WHITE_UV } from './decals.js';
import { DUST, _cA, _nm3 } from './loft.js';
import { smooth } from '../../engine/util.js';

// ----- multi-material mesh builder -----
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
    let g = geo.clone(); g.applyMatrix4(m); if (g.index) { const t = g.toNonIndexed(); g.dispose(); g = t; }
    if (!g.attributes.normal) g.computeVertexNormals();
    const p = g.attributes.position.array, n = g.attributes.normal.array;
    for (let i = 0; i < p.length; i += 3) this.vert(mi, p[i], p[i + 1], p[i + 2], n[i], n[i + 1], n[i + 2], typeof color === 'function' ? color(p[i], p[i + 1], p[i + 2]) : color);
    g.dispose(); return this;
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
  build() {
    let count = 0; for (const g of this.g) count += g.p.length / 3;
    const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), col = new Float32Array(count * 3), uv = new Float32Array(count * 2);
    const out = new THREE.BufferGeometry(); let o = 0;
    this.g.forEach((g, mi) => {
      const n = g.p.length / 3; if (!n) return;
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
