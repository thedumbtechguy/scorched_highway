import * as THREE from 'three';
import { clamp, lerp } from '../../engine/util.js';

// ----- small helpers -----
export const kf = pts => z => {
  if (z <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (z <= pts[i][0]) { const [z0, v0] = pts[i - 1], [z1, v1] = pts[i]; return v0 + (v1 - v0) * (z - z0) / (z1 - z0); }
  return pts[pts.length - 1][1];
};
export const _cA = new THREE.Color(), _cB = new THREE.Color(), _nm3 = new THREE.Matrix3(), _pv = new THREE.Vector3();
export const DUST = new THREE.Color(0xb08a62);

// ----- lofted hull -----
// A cross-section is a rounded trapezoid; `section` returns its right half from bottom-centre round to
// top-centre. Full detail has 3 points per corner and 3 along the side; `simple` (small parts) has 1 and 0.
const DETAIL = { full: { arc: [0.25, 0.5, 0.75], side: [0.25, 0.5, 0.75] }, simple: { arc: [0.5], side: [] } };
/** Index range of the flat side within a half section: [start, end]; the top runs from end to the last point. */
const sideIdx = d => [2 + d.arc.length, 3 + d.arc.length + d.side.length];
function section(s, d) {
  const ARC = d.arc, SIDE_T = d.side;
  const y0 = s.y0, y1 = Math.max(s.y1, s.y0 + 0.004), h = y1 - y0, w = s.w, wt = s.wt == null ? w : s.wt;
  const rb = clamp(s.rb == null ? 0.06 : s.rb, 0.004, Math.min(h * 0.45, w * 0.9)), rt = clamp(s.rt == null ? 0.1 : s.rt, 0.004, Math.min(h * 0.45, wt * 0.9));
  const b = s.bulge || 0, cr = s.crown || 0;
  const p = [[0, y0], [w - rb, y0]];
  for (const a of ARC) { const t = a * Math.PI / 2; p.push([w - rb + Math.sin(t) * rb, y0 + rb - Math.cos(t) * rb]); }
  p.push([w, y0 + rb]);
  for (const t of SIDE_T) p.push([lerp(w, wt, t) + b * Math.sin(Math.PI * t), lerp(y0 + rb, y1 - rt, t)]);
  p.push([wt, y1 - rt]);
  for (const a of ARC) { const t = a * Math.PI / 2; p.push([wt - rt + Math.cos(t) * rt, y1 - rt + Math.sin(t) * rt]); }
  p.push([wt - rt, y1], [(wt - rt) * 0.5, y1 + cr * 0.75], [0, y1 + cr]);
  return p;
}
function fullRing(h) { const r = h.slice(); for (let i = h.length - 2; i >= 1; i--) r.push([-h[i][0], h[i][1]]); return r; }

class Loft {
  // stations: [{z, y0, y1, w, wt, rb, rt, bulge, crown, crease}], sorted by z
  constructor(stations, opt) {
    opt = opt || {};
    const detail = DETAIL[opt.detail || 'full'];
    const [iS, iT] = sideIdx(detail); this.iS = iS; this.iT = iT; // where the flat side starts and ends in a half section
    this.rings = stations.map(s => ({ z: s.z, half: section(s, detail), crease: s.crease }));
    const segs = []; let cur = [];
    for (const r of this.rings) { cur.push(r); if (r.crease && cur.length > 1) { segs.push(cur); cur = [r]; } }
    if (cur.length > 1) segs.push(cur);
    const P = [], N = [];
    for (const seg of segs) {
      const rings = seg.map(r => fullRing(r.half).map(([x, y]) => [x, y, r.z]));
      const k = rings.length, n = rings[0].length, nrm = rings.map(r => r.map(() => [0, 0, 0]));
      const tris = [];
      for (let i = 0; i < k - 1; i++) for (let j = 0; j < n; j++) {
        const j1 = (j + 1) % n;
        tris.push([i, j, i, j1, i + 1, j1], [i, j, i + 1, j1, i + 1, j]);
      }
      for (const t of tris) {
        const a = rings[t[0]][t[1]], b = rings[t[2]][t[3]], c = rings[t[4]][t[5]];
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        for (let q = 0; q < 6; q += 2) { const v = nrm[t[q]][t[q + 1]]; v[0] += nx; v[1] += ny; v[2] += nz; }
      }
      for (const r of nrm) for (const v of r) { const l = Math.hypot(v[0], v[1], v[2]) || 1; v[0] /= l; v[1] /= l; v[2] /= l; }
      for (const t of tris) for (let q = 0; q < 6; q += 2) { P.push(...rings[t[q]][t[q + 1]]); N.push(...nrm[t[q]][t[q + 1]]); }
    }
    if (opt.caps !== false) for (const [r, dir] of [[this.rings[0], -1], [this.rings[this.rings.length - 1], 1]]) {
      const ring = fullRing(r.half); let cx = 0, cy = 0; for (const p of ring) { cx += p[0]; cy += p[1]; } cx /= ring.length; cy /= ring.length;
      for (let j = 0; j < ring.length; j++) {
        const a = ring[j], b = ring[(j + 1) % ring.length];
        const tri = dir > 0 ? [[cx, cy], a, b] : [[cx, cy], b, a];
        for (const p of tri) { P.push(p[0], p[1], r.z); N.push(0, 0, dir); }
      }
    }
    this.P = P; this.N = N;
  }
  secAt(z) {
    const R = this.rings;
    if (z <= R[0].z) return R[0].half;
    for (let i = 1; i < R.length; i++) if (z <= R[i].z) {
      const a = R[i - 1], b = R[i], t = b.z - a.z < 1e-6 ? 1 : (z - a.z) / (b.z - a.z);
      return a.half.map((p, k) => [lerp(p[0], b.half[k][0], t), lerp(p[1], b.half[k][1], t)]);
    }
    return R[R.length - 1].half;
  }
  sideRange(z) { const h = this.secAt(z); return [h[this.iS][1], h[this.iT][1]]; }
  sideX(z, y) {
    const h = this.secAt(z);
    const S = this.iS, T = this.iT;
    if (y <= h[S][1]) return h[S][0]; if (y >= h[T][1]) return h[T][0];
    for (let i = S; i < T; i++) { const a = h[i], b = h[i + 1]; if (y <= b[1]) return lerp(a[0], b[0], (y - a[1]) / Math.max(1e-6, b[1] - a[1])); }
    return h[T][0];
  }
  topHalf(z) { return this.secAt(z)[this.iT][0]; }
  topY(z, x) {
    const h = this.secAt(z); x = Math.abs(x);
    for (let i = h.length - 1; i > this.iT; i--) { const a = h[i], b = h[i - 1]; if (x <= b[0]) return lerp(a[1], b[1], (x - a[0]) / Math.max(1e-6, b[0] - a[0])); }
    return h[this.iT][1];
  }
}
// Build a loft by sampling profile functions along z. Arches lift the floor of the hull
// in a half circle over each wheel.
export function loftZ(o) {
  const [za, zb] = o.z, zs = new Set();
  const step = o.step || 0.15;
  for (let z = za; z < zb; z += step) zs.add(+z.toFixed(4));
  zs.add(zb);
  for (const k of (o.keys || [])) if (k > za && k < zb) zs.add(k);
  for (const k of (o.creases || [])) zs.add(k);
  for (const [az, , R] of (o.arches || [])) for (let i = 0; i <= 12; i++) { const z = az - R * Math.cos(i / 12 * Math.PI); if (z > za && z < zb) zs.add(+z.toFixed(4)); }
  const list = [...zs].sort((a, b) => a - b), cre = new Set(o.creases || []);
  const st = list.map(z => {
    let y0 = o.y0(z);
    for (const [az, ay, R] of (o.arches || [])) { const d = z - az; if (Math.abs(d) < R) y0 = Math.max(y0, ay + Math.sqrt(R * R - d * d)); }
    const w = o.w(z);
    return { z, y0, y1: o.y1(z), w, wt: o.wt ? o.wt(z, w) : w, rb: o.rb, rt: o.rt, bulge: o.bulge, crown: o.crown, crease: cre.has(z) };
  });
  return new Loft(st, o);
}
// rounded box as a short loft (bevelled on all edges)
export function rboxLoft(w, h, d, r) {
  const hw = w / 2, hh = h / 2, hd = d / 2, e = Math.min(r * 0.7, hd * 0.45, hw * 0.45, hh * 0.45);
  const s = (z, k) => ({ z, y0: -hh + k, y1: hh - k, w: hw - k, rb: r, rt: r });
  return new Loft([s(-hd, e), s(-hd + e, 0), s(hd - e, 0), s(hd, e)].map((v, i) => Object.assign(v, { crease: i === 1 || i === 2 })), { detail: 'simple' });
}
