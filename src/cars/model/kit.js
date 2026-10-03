import * as THREE from 'three';
import { MB } from './builder.js';
import { C_AMBER, C_CHROME, C_GUN, C_HEAD, C_TAIL, M_CHROME, M_DECAL, M_GLASS, M_LAMP, M_PAINT, M_TRIM } from './constants.js';
import { rboxLoft } from './loft.js';
import { GEO, cylGeo, mat4, sphGeo } from '../../engine/geometry.js';
import { TAU, lerp } from '../../engine/util.js';

// ----- car kit: what each car's recipe uses -----
export class CarKit {
  constructor(def) {
    /** @type {THREE.Mesh[] | null} */ this.siren = null; // light-bar lenses that blink (Lawdog)
    this.def = def; this.mb = new MB(def.dirt == null ? 0.35 : def.dirt); this.decals = []; this.wheels = []; this.heads = []; this.tails = []; this.parts = []; }
  box(mi, w, h, d, c, x, y, z, rx, ry, rz) { this.mb.geo(mi, GEO.box, mat4(x, y, z, rx, ry, rz, w, h, d), c); return this; }
  rbox(mi, w, h, d, r, c, x, y, z, rx, ry, rz) { this.mb.loft(rboxLoft(w, h, d, r), [mi, c], mat4(x, y, z, rx, ry, rz)); return this; }
  cyl(mi, rt, rb, h, seg, c, x, y, z, rx, ry, rz) { this.mb.geo(mi, cylGeo(rt, rb, h, seg), mat4(x, y, z, rx, ry, rz), c); return this; }
  cylX(mi, r, h, seg, c, x, y, z) { return this.cyl(mi, r, r, h, seg, c, x, y, z, 0, 0, -Math.PI / 2); }
  cylZ(mi, r, h, seg, c, x, y, z, r2) { return this.cyl(mi, r, r2 == null ? r : r2, h, seg, c, x, y, z, Math.PI / 2, 0, 0); }
  sph(mi, r, c, x, y, z, sx, sy, sz, ws, hs) { this.mb.geo(mi, sphGeo(r, ws || 16, hs || 10), mat4(x, y, z, 0, 0, 0, sx, sy, sz), c); return this; }
  torus(mi, R, t, c, x, y, z, rx, ry, rz, arc, seg) { this.mb.geo(mi, new THREE.TorusGeometry(R, t, 6, seg || 18, arc || TAU), mat4(x, y, z, rx, ry, rz), c); return this; }
  tube(mi, pts, rad, c, seg) {
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], p[2]))), seg || 24, rad, 8, false);
    this.mb.geo(mi, g, new THREE.Matrix4(), c); g.dispose(); return this;
  }
  loft(L, cls, m) { this.mb.loft(L, cls, m); return this; }
  // wheel-arch lip that follows the arch over a wheel
  flare(x, y, z, R, t, c) { for (const s of [-1, 1]) this.torus(M_PAINT, R, t || 0.04, c, s * x, y, z, 0, Math.PI / 2, 0, Math.PI, 14); return this; }
  // lamp facing +z (dir 1) or -z (dir -1); kind: head | tail | amber | fog
  lamp(x, y, z, dir, kind, shape, w, h, bezel) {
    const col = kind === 'head' || kind === 'fog' ? C_HEAD : kind === 'amber' ? C_AMBER : C_TAIL;
    const rx = Math.PI / 2;
    for (const s of (x === 0 ? [1] : [-1, 1])) {
      const X = s * x;
      if (shape === 'round') {
        if (bezel !== false) this.cyl(M_CHROME, w * 1.28, w * 1.28, 0.06, 18, C_CHROME, X, y, z, rx);
        this.cyl(M_LAMP, w, w, 0.07, 18, col, X, y, z + dir * 0.006, rx);
        if (kind === 'head') this.sph(M_LAMP, w * 0.35, 0xffffff, X, y, z + dir * 0.04, 1, 1, 0.4);
      } else {
        if (bezel !== false) this.rbox(M_CHROME, w + 0.05, h + 0.05, 0.05, 0.02, C_CHROME, X, y, z);
        this.box(M_LAMP, w, h, 0.06, col, X, y, z + dir * 0.006);
      }
      const g = { x: X, y, z: z + dir * 0.06 };
      if (kind === 'head') this.heads.push(g); else if (kind === 'tail') this.tails.push(g);
    }
    return this;
  }
  gun(x, y, z) {
    for (const s of [-1, 1]) {
      const X = s * x;
      this.box(M_TRIM, 0.08, 0.12, 0.14, 0x2a2a2a, X, y - 0.13, z - 0.1);
      this.rbox(M_CHROME, 0.24, 0.16, 0.52, 0.05, 0x3c3c40, X, y, z - 0.1);
      this.box(M_CHROME, 0.1, 0.1, 0.18, 0x8a7a4a, X - s * 0.17, y - 0.02, z - 0.15);
      for (const o of [-0.045, 0.045]) this.cylZ(M_CHROME, 0.032, 0.5, 8, C_GUN, X + o, y + 0.02, z + 0.4);
      this.cylZ(M_TRIM, 0.05, 0.12, 8, 0x1a1a1a, X, y + 0.02, z + 0.62);
    }
    return this;
  }
  // cabin glass on both sides: a window following the top of the cabin's side wall
  sideGlass(L, z0, z1, yb, o) {
    o = o || {};
    this.decal({
      kind: 'side', L, mi: M_GLASS, a0: z0, a1: z1, b0: yb - 0.04, fit: true, draw: D => {
        const pts = [], top = [], m = o.margin || 0.06, steps = 40;
        for (let i = 0; i <= steps; i++) { const z = lerp(z0, z1, i / steps), hi = L.sideRange(z)[1] - m; if (hi > yb + 0.05) top.push([z, hi]); }
        if (top.length < 2) return;
        for (const p of top) pts.push(p);
        pts.push([top[top.length - 1][0], yb], [top[0][0], yb]);
        D.ctx.save(); D.poly(pts, null); D.ctx.clip();
        D.ctx.fillStyle = D.lin(0, yb, 0, yb + 0.6, [[0, '#0b1418'], [0.6, '#1c3440'], [1, '#3a5a66']]); D.ctx.fillRect(z0 - 1, yb - 1, z1 - z0 + 2, 3);
        if (o.heads) for (const hz of o.heads) { D.ctx.fillStyle = 'rgba(5,8,10,0.85)'; D.ctx.beginPath(); D.ctx.ellipse(hz, yb + 0.28, 0.11, 0.13, 0, 0, TAU); D.ctx.fill(); D.ctx.fillRect(hz - 0.12, yb - 0.1, 0.24, 0.3); }
        if (o.pillars) for (const [pz, pw] of o.pillars) { D.ctx.fillStyle = o.pillarCol || '#1a1a1a'; D.ctx.fillRect(pz - pw / 2, yb - 1, pw, 3); }
        D.ctx.restore();
        D.poly(pts, null, o.trim || 'rgba(220,220,215,0.9)', 0.022);
        if (o.after) o.after(D);
      }
    });
    return this;
  }
  topGlass(L, z0, z1, o) {
    o = o || {};
    this.decal({
      kind: 'top', L, mi: M_GLASS, a0: -2, a1: 2, b0: z0, b1: z1, fit: true, draw: D => {
        const m = o.margin || 0.07, steps = 20, R = [], Lf = [];
        for (let i = 0; i <= steps; i++) { const z = lerp(z0 + m, z1 - m, i / steps), hw = L.topHalf(z) - m; R.push([hw, z]); Lf.unshift([-hw, z]); }
        const pts = R.concat(Lf);
        D.ctx.save(); D.poly(pts, null); D.ctx.clip();
        D.ctx.fillStyle = D.lin(0, z0, 0, z1, o.rear ? [[0, '#3a5a66'], [1, '#0b1418']] : [[0, '#0b1418'], [0.5, '#1c3440'], [1, '#4a6a76']]); D.ctx.fillRect(-3, z0 - 1, 6, z1 - z0 + 2);
        if (o.heads) for (const hx of o.heads) { D.ctx.fillStyle = 'rgba(5,8,10,0.8)'; D.ctx.beginPath(); D.ctx.ellipse(hx, lerp(z0, z1, o.headAt || 0.25), 0.14, 0.12, 0, 0, TAU); D.ctx.fill(); }
        D.ctx.restore(); D.poly(pts, null, o.trim || 'rgba(220,220,215,0.9)', 0.025);
      }
    });
    return this;
  }
  decal(d) {
    if (d.kind === 'side' && d.fit) { let m = 0; const n = 24; for (let i = 0; i <= n; i++) m = Math.max(m, d.L.sideRange(lerp(d.a0, d.a1, i / n))[1]); d.b1 = m + 0.02; }
    if (d.kind === 'top' && d.fit) { let m = 0; const n = 12; for (let i = 0; i <= n; i++) m = Math.max(m, d.L.topHalf(lerp(d.b0, d.b1, i / n))); d.a0 = -m - 0.02; d.a1 = m + 0.02; }
    this.decals.push(Object.assign({ mi: M_DECAL }, d)); return this;
  }
  wheel(x, y, z, r, w, front, style) { this.wheels.push({ x, y, z, r, w, front, style: Object.assign({ r, w }, style) }); return this; }
}
