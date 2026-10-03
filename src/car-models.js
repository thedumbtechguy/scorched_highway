'use strict';
// ================= car models =================
// Cars are built from lofted hulls (cross-sections swept along the car's length), detail
// primitives, and canvas-painted decals (windows, stripes, badges) projected onto the hull.
// Everything for one car ends up in a single multi-material mesh.

const M_PAINT = 0, M_CHROME = 1, M_GLASS = 2, M_TRIM = 3, M_LAMP = 4, M_DECAL = 5, M_COUNT = 6;
const C_CHROME = 0xe8e6e2, C_GUN = 0x55555c, C_BLACK = 0x1c1a1b, C_RUBBER = 0x262322, C_HEAD = 0xfff4d8, C_TAIL = 0xe0241a, C_AMBER = 0xff9a1a;

// ----- environment map for reflections, regenerated per time of day -----
const CAR_ENV = (() => {
  const sc = new THREE.Scene();
  const geo = new THREE.SphereGeometry(50, 32, 16);
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3));
  sc.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const sunM = new THREE.Mesh(new THREE.SphereGeometry(5, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  sc.add(sunM);
  const mesaMat = new THREE.MeshBasicMaterial({ color: 0x6a3020 });
  const r = mulberry32(77);
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * TAU + r() * 0.3, h = 2 + r() * 6, wd = 5 + r() * 9;
    const m = new THREE.Mesh(new THREE.BoxGeometry(wd, h, 4), mesaMat);
    m.position.set(Math.sin(a) * 44, h / 2 - 0.5, Math.cos(a) * 44); m.lookAt(0, h / 2, 0); sc.add(m);
  }
  return { sc, geo, sunM, mesaMat, pm: null, cache: {}, tex: null, mats: new Set() };
})();
function updateCarEnv(t) {
  const E = CAR_ENV;
  let tex = E.cache[t.name || t.top];
  if (!tex) {
    const cT = new THREE.Color(t.top), cM = new THREE.Color(t.mid), cH = new THREE.Color(t.hor);
    const cG = new THREE.Color(t.below).lerp(new THREE.Color(t.night ? 0x120c18 : 0x6a4a34), 0.5), cN = cG.clone().multiplyScalar(0.55), c = new THREE.Color();
    const pos = E.geo.attributes.position, col = E.geo.attributes.color;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 50;
      if (y > 0.3) c.copy(cM).lerp(cT, Math.pow((y - 0.3) / 0.7, 0.8));
      else if (y > 0) c.copy(cH).lerp(cM, y / 0.3);
      else if (y > -0.08) c.copy(cH).lerp(cG, -y / 0.08);
      else c.copy(cG).lerp(cN, Math.min(1, (-y - 0.08) * 2));
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
    E.sunM.position.copy(sunDir).multiplyScalar(44);
    E.sunM.material.color.setHex(t.sunC).multiplyScalar(t.night ? 0.8 : 1.6);
    E.mesaMat.color.setHex(t.night ? 0x1a1424 : 0x7a3a24);
    if (!E.pm) E.pm = new THREE.PMREMGenerator(renderer);
    tex = E.cache[t.name || t.top] = E.pm.fromScene(E.sc, 0.02).texture;
  }
  E.tex = tex;
  for (const m of E.mats) { m.envMap = tex; m.needsUpdate = true; }
}

// ----- small helpers -----
const kf = pts => z => {
  if (z <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (z <= pts[i][0]) { const [z0, v0] = pts[i - 1], [z1, v1] = pts[i]; return v0 + (v1 - v0) * (z - z0) / (z1 - z0); }
  return pts[pts.length - 1][1];
};
const _cA = new THREE.Color(), _cB = new THREE.Color(), _nm3 = new THREE.Matrix3(), _pv = new THREE.Vector3();
const DUST = new THREE.Color(0xb08a62);

// ----- lofted hull -----
// A cross-section is a rounded trapezoid; `section` returns its right half as 16 points from
// bottom-centre round to top-centre. Index 5..9 is the flat side, 9..15 the top.
const ARC = [0.25, 0.5, 0.75], SIDE_T = [0.25, 0.5, 0.75];
function section(s) {
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
    this.rings = stations.map(s => ({ z: s.z, half: section(s), crease: s.crease }));
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
  sideRange(z) { const h = this.secAt(z); return [h[5][1], h[9][1]]; }
  sideX(z, y) {
    const h = this.secAt(z);
    if (y <= h[5][1]) return h[5][0]; if (y >= h[9][1]) return h[9][0];
    for (let i = 5; i < 9; i++) { const a = h[i], b = h[i + 1]; if (y <= b[1]) return lerp(a[0], b[0], (y - a[1]) / Math.max(1e-6, b[1] - a[1])); }
    return h[9][0];
  }
  topHalf(z) { return this.secAt(z)[9][0]; }
  topY(z, x) {
    const h = this.secAt(z); x = Math.abs(x);
    for (let i = 15; i > 9; i--) { const a = h[i], b = h[i - 1]; if (x <= b[0]) return lerp(a[1], b[1], (x - a[0]) / Math.max(1e-6, b[0] - a[0])); }
    return h[9][1];
  }
}
// Build a loft by sampling profile functions along z. Arches lift the floor of the hull
// in a half circle over each wheel.
function loftZ(o) {
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
function rboxLoft(w, h, d, r) {
  const hw = w / 2, hh = h / 2, hd = d / 2, e = Math.min(r * 0.7, hd * 0.45, hw * 0.45, hh * 0.45);
  const s = (z, k) => ({ z, y0: -hh + k, y1: hh - k, w: hw - k, rb: r, rt: r });
  return new Loft([s(-hd, e), s(-hd + e, 0), s(hd - e, 0), s(hd, e)].map((v, i) => Object.assign(v, { crease: i === 1 || i === 2 })));
}

// ----- multi-material mesh builder -----
function mat4(x, y, z, rx, ry, rz, sx, sy, sz) {
  const e = new THREE.Euler(rx || 0, ry || 0, rz || 0, 'YXZ');
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(e), new THREE.Vector3(sx == null ? 1 : sx, sy == null ? 1 : sy, sz == null ? 1 : sz));
}
class MB {
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

// ----- decals: canvas art projected onto a loft's side, top or end -----
const ATLAS = 1024, WHITE_UV = 3 / ATLAS; // top-left 8px of every atlas is solid white for untextured parts
function packDecals(decals) {
  for (let ppu = 210; ppu > 40; ppu *= 0.88) {
    const rects = []; let ok = true;
    decals.forEach((d, di) => { for (const side of (d.kind === 'side' && d.twin ? [-1, 1] : [0])) {
      const w = Math.ceil((d.a1 - d.a0) * ppu) + 4, h = Math.ceil((d.b1 - d.b0) * ppu) + 4; rects.push({ di, side, w, h });
    } });
    const order = rects.slice().sort((a, b) => b.h - a.h);
    let x = 0, y = 8, sh = 0;
    for (const r of order) {
      if (r.w > ATLAS) { ok = false; break; }
      if (x + r.w > ATLAS) { x = 0; y += sh; sh = 0; }
      r.x = x + 2; r.y = y + 2; x += r.w; sh = Math.max(sh, r.h);
    }
    if (ok && y + sh <= ATLAS) return { ppu, rects };
  }
  throw new Error('decal atlas overflow');
}
// pixel mapping for a decal; (a, b) are the decal's own coordinates:
//   side: (z, y), canvas right = car front     top: (x, z), canvas up = car front, right = -x
//   back: (x, y), seen from behind               front: (x, y), seen from ahead
function decalPx(d, r, ppu) {
  if (d.kind === 'side') return (a, b) => [r.x + (a - d.a0) * ppu, r.y + (d.b1 - b) * ppu];
  if (d.kind === 'top' || d.kind === 'back') return (a, b) => [r.x + (d.a1 - a) * ppu, r.y + (d.b1 - b) * ppu];
  return (a, b) => [r.x + (a - d.a0) * ppu, r.y + (d.b1 - b) * ppu];
}
const LIVERY = {};
function drawLivery(key, decals) {
  if (LIVERY[key]) return LIVERY[key];
  const pk = packDecals(decals), ppu = pk.ppu;
  const cv = document.createElement('canvas'); cv.width = cv.height = ATLAS;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 8, 8);
  for (const r of pk.rects) {
    const d = decals[r.di], px = decalPx(d, r, ppu), o = px(0, 0), ax = px(1, 0), bx = px(0, 1);
    ctx.save();
    ctx.beginPath(); ctx.rect(r.x - 1, r.y - 1, r.w - 2, r.h - 2); ctx.clip();
    ctx.setTransform(ax[0] - o[0], ax[1] - o[1], bx[0] - o[0], bx[1] - o[1], o[0], o[1]);
    const D = {
      ctx, ppu, d, flip: r.side === 1, L: d.L,
      text(str, a, b, size, fill, opt) {
        opt = opt || {};
        const p = px(a, b); ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.translate(p[0], p[1]);
        if (opt.rot) ctx.rotate(opt.rot);
        if (this.flip) ctx.scale(-1, 1);
        if (opt.sx) ctx.scale(opt.sx, 1);
        ctx.font = (opt.weight || '400') + ' ' + Math.round(size * ppu) + 'px ' + (opt.font || "Shrikhand, 'Cooper Black', 'Arial Black', serif");
        ctx.textAlign = opt.align || 'center'; ctx.textBaseline = 'middle';
        if (opt.stroke) { ctx.lineJoin = 'round'; ctx.lineWidth = opt.strokeW * ppu; ctx.strokeStyle = opt.stroke; ctx.strokeText(str, 0, 0); }
        ctx.fillStyle = fill; ctx.fillText(str, 0, 0); ctx.restore();
      },
      poly(pts, fill, stroke, lw) {
        ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath();
        if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.lineWidth = lw || 0.015; ctx.strokeStyle = stroke; ctx.stroke(); }
      },
      lin(a0, b0, a1, b1, stops) { const g = ctx.createLinearGradient(a0, b0, a1, b1); for (const [t, c] of stops) g.addColorStop(t, c); return g; },
    };
    d.draw(D);
    ctx.restore();
    // erase anything that falls outside the surface the decal sits on
    if (d.L && d.kind === 'side') for (let x = r.x; x < r.x + r.w - 4; x++) {
      const z = d.a0 + (x - r.x + 0.5) / ppu, [lo, hi] = d.L.sideRange(z);
      const yHi = r.y + (d.b1 - hi) * ppu, yLo = r.y + (d.b1 - lo) * ppu;
      if (yHi > r.y) ctx.clearRect(x, r.y - 1, 1, yHi - r.y + 1);
      if (yLo < r.y + r.h) ctx.clearRect(x, yLo, 1, r.y + r.h - yLo);
    }
    if (d.L && d.kind === 'top') for (let y = r.y; y < r.y + r.h - 4; y++) {
      const z = d.b1 - (y - r.y + 0.5) / ppu, hw = d.L.topHalf(z) - 0.01;
      const xl = r.x + (d.a1 - hw) * ppu, xr = r.x + (d.a1 + hw) * ppu;
      if (xl > r.x) ctx.clearRect(r.x - 1, y, xl - r.x + 1, 1);
      if (xr < r.x + r.w) ctx.clearRect(xr, y, r.x + r.w - xr, 1);
    }
  }
  const tex = new THREE.CanvasTexture(cv); tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return (LIVERY[key] = { tex, pk });
}
// emit the decal surfaces (grids hugging the hull) into the builder
function emitDecals(mb, decals, pk) {
  const S = ATLAS, ppu = pk.ppu, E = 0.006;
  decals.forEach((d, di) => {
    const rs = pk.rects.filter(r => r.di === di), L = d.L, m = d.m;
    const sides = d.kind === 'side' ? (d.sides || [-1, 1]) : [0];
    for (const s of sides) {
      const r = rs.length > 1 ? rs.find(q => q.side === s) : rs[0], px = decalPx(d, r, ppu);
      const nu = Math.max(2, Math.ceil((d.a1 - d.a0) / 0.08)), nv = Math.max(2, Math.ceil((d.b1 - d.b0) / 0.06));
      const grid = [];
      for (let i = 0; i <= nu; i++) {
        const row = []; const a = lerp(d.a0, d.a1, i / nu);
        for (let j = 0; j <= nv; j++) {
          const b = lerp(d.b0, d.b1, j / nv); let p;
          if (d.kind === 'side') { const [lo, hi] = L.sideRange(a); const y = clamp(b, lo, hi); p = [s * (L.sideX(a, y) + E), y, a]; }
          else if (d.kind === 'top') p = [a, L.topY(b, a) + E, b];
          else p = [a, b, d.z + (d.kind === 'front' ? E : -E)];
          const q = px(a, b);
          row.push({ p: m ? _pv.set(p[0], p[1], p[2]).applyMatrix4(m).toArray() : p, u: q[0] / S, v: 1 - q[1] / S });
        }
        grid.push(row);
      }
      const want = d.kind === 'side' ? [s, 0, 0] : d.kind === 'top' ? [0, 1, 0] : [0, 0, d.kind === 'front' ? 1 : -1];
      if (m) { _nm3.getNormalMatrix(m); _pv.fromArray(want).applyMatrix3(_nm3).normalize().toArray(want); }
      const nrm = (i, j) => {
        const a = grid[Math.min(i + 1, nu)][j].p, b = grid[Math.max(i - 1, 0)][j].p, c = grid[i][Math.min(j + 1, nv)].p, e = grid[i][Math.max(j - 1, 0)].p;
        const ux = a[0] - b[0], uy = a[1] - b[1], uz = a[2] - b[2], vx = c[0] - e[0], vy = c[1] - e[1], vz = c[2] - e[2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const l = (Math.hypot(nx, ny, nz) || 1) * ((nx * want[0] + ny * want[1] + nz * want[2]) < 0 ? -1 : 1);
        return [nx / l, ny / l, nz / l];
      };
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
        const q = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
        const A = grid[i][j].p, B = grid[i + 1][j].p, C = grid[i + 1][j + 1].p;
        const fx = (B[1] - A[1]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[1] - A[1]), fy = (B[2] - A[2]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[2] - A[2]), fz = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
        const flip = fx * want[0] + fy * want[1] + fz * want[2] < 0;
        const tris = flip ? [[0, 2, 1], [0, 3, 2]] : [[0, 1, 2], [0, 2, 3]];
        for (const t of tris) for (const k of t) {
          const [gi, gj] = q[k], g = grid[gi][gj], n = nrm(gi, gj);
          mb.vert(d.mi, g.p[0], g.p[1], g.p[2], n[0], n[1], n[2], d.tint || 0xffffff, g.u, g.v);
        }
      }
    }
  });
}

// ----- wheels -----
const WHEEL_CACHE = {};
function buildWheelGeo(st) {
  const key = JSON.stringify(st);
  if (WHEEL_CACHE[key]) return WHEEL_CACHE[key];
  const mb = new MB(0), r = st.r, w = st.w, hw = w / 2, ri = r * (st.ri || 0.64);
  const prof = [[ri, -hw * 0.9], [r * 0.86, -hw], [r * 0.965, -hw * 0.86], [r, -hw * 0.55], [r, hw * 0.55], [r * 0.965, hw * 0.86], [r * 0.86, hw], [ri, hw * 0.9]];
  const lathe = new THREE.LatheGeometry(prof.map(([a, b]) => new THREE.Vector2(a, b)), 24); lathe.rotateZ(-Math.PI / 2);
  mb.geo(M_TRIM, lathe, new THREE.Matrix4(), st.tire || C_RUBBER);
  // tread blocks
  const n = Math.round(TAU * r / (st.tread === 'mud' ? 0.17 : 0.12)), blk = st.tread === 'mud' ? 0.06 : 0.035;
  if (st.tread !== 'slick') for (let k = 0; k < n; k++) for (const sx of [-1, 1]) {
    const a = (k + (sx > 0 ? 0.5 : 0)) / n * TAU;
    mb.geo(M_TRIM, GEO.box, mat4(sx * hw * 0.27, Math.sin(a) * (r + blk * 0.3), Math.cos(a) * (r + blk * 0.3), Math.PI / 2 - a, 0, 0, w * (st.tread === 'mud' ? 0.5 : 0.44), blk, TAU * r / n * 0.55), st.tire || C_RUBBER);
  }
  if (st.ww) { const g = new THREE.RingGeometry(ri * 1.12, r * 0.83, 24, 1); g.rotateY(Math.PI / 2); mb.geo(M_TRIM, g, mat4(hw + 0.004, 0, 0), 0xf2ede2); g.dispose(); }
  const fx = hw * 0.7; // rim face
  const ring = (rad, tube, col, x) => mb.geo(M_CHROME, new THREE.TorusGeometry(rad, tube, 6, 24), mat4(x, 0, 0, 0, Math.PI / 2, 0), col);
  mb.geo(M_TRIM, cylGeo(ri * 0.98, ri * 0.98, w * 0.8, 20), mat4(0, 0, 0, 0, 0, -Math.PI / 2), 0x2a2a2c); // barrel
  if (st.rim === 'mag') {
    mb.geo(M_CHROME, cylGeo(ri * 0.92, ri * 0.92, 0.03, 20), mat4(fx - 0.04, 0, 0, 0, 0, -Math.PI / 2), 0x5a5a60);
    for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; mb.geo(M_CHROME, GEO.box, mat4(fx, Math.sin(a) * ri * 0.45, Math.cos(a) * ri * 0.45, Math.PI / 2 - a, 0, 0, 0.05, ri * 0.85, ri * 0.24), 0xd8d6d0); }
    ring(ri * 0.93, 0.03, C_CHROME, fx + 0.01);
    mb.geo(M_CHROME, cylGeo(ri * 0.22, ri * 0.26, 0.06, 12), mat4(fx + 0.03, 0, 0, 0, 0, -Math.PI / 2), C_CHROME);
  } else if (st.rim === 'chrome') {
    mb.geo(M_CHROME, sphGeo(ri * 0.95, 20, 10), mat4(fx - ri * 0.5, 0, 0, 0, 0, 0, 0.6, 1, 1), C_CHROME);
    ring(ri * 0.95, 0.035, C_CHROME, fx + 0.01);
    mb.geo(M_CHROME, cylGeo(0.03, ri * 0.25, 0.12, 8), mat4(fx + 0.08, 0, 0, 0, 0, -Math.PI / 2), 0xf0d080);
    for (let k = 0; k < 3; k++) { const a = k / 3 * TAU; mb.geo(M_CHROME, GEO.box, mat4(fx + 0.1, Math.sin(a) * 0.09, Math.cos(a) * 0.09, Math.PI / 2 - a, 0, 0, 0.03, 0.12, 0.03), 0xf0d080); }
  } else { // painted steel wheel with a chrome cap ('steel' small dog-dish cap, 'cap' big hubcap)
    mb.geo(M_PAINT, cylGeo(ri * 0.95, ri * 0.95, 0.04, 20), mat4(fx - 0.03, 0, 0, 0, 0, -Math.PI / 2), st.rimCol || 0x202022);
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; mb.geo(M_TRIM, cylGeo(0.035, 0.035, 0.03, 8), mat4(fx, Math.sin(a) * ri * 0.62, Math.cos(a) * ri * 0.62, 0, 0, -Math.PI / 2), 0x111111); }
    if (st.rim === 'cap') mb.geo(M_CHROME, sphGeo(ri * 0.8, 20, 8), mat4(fx - ri * 0.08, 0, 0, 0, 0, 0, 0.25, 1, 1), C_CHROME);
    else mb.geo(M_CHROME, sphGeo(ri * 0.45, 16, 8), mat4(fx, 0, 0, 0, 0, 0, 0.35, 1, 1), C_CHROME);
    if (st.trimRing) ring(ri * 0.92, 0.025, C_CHROME, fx);
  }
  // inner face so the wheel doesn't look hollow from the car's side
  mb.geo(M_TRIM, cylGeo(ri * 0.95, ri * 0.95, 0.02, 16), mat4(-fx, 0, 0, 0, 0, -Math.PI / 2), 0x18181a);
  return (WHEEL_CACHE[key] = mb.build());
}

// ----- car kit: what each car's recipe uses -----
let glowTex = null;
class CarKit {
  constructor(def) { this.def = def; this.mb = new MB(def.dirt == null ? 0.35 : def.dirt); this.decals = []; this.wheels = []; this.heads = []; this.tails = []; this.parts = []; }
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

function carMaterials(livery, hi) {
  const env = CAR_ENV.tex;
  const P = hi ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const paint = new P({ vertexColors: true, roughness: 0.42, metalness: 0.12, envMap: env, envMapIntensity: 0.9 });
  const decal = new P({ vertexColors: true, map: livery, transparent: true, depthWrite: false, alphaTest: 0.02, roughness: 0.4, metalness: 0.08, envMap: env, envMapIntensity: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  if (hi) for (const m of [paint, decal]) { m.clearcoat = 1; m.clearcoatRoughness = 0.12; }
  const mats = [
    paint,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.16, metalness: 1, envMap: env, envMapIntensity: 1.25 }),
    new THREE.MeshStandardMaterial({ vertexColors: true, map: livery, transparent: true, depthWrite: false, alphaTest: 0.02, roughness: 0.05, metalness: 0.25, envMap: env, envMapIntensity: 1.6, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, envMap: env, envMapIntensity: 0.6 }),
    new THREE.MeshBasicMaterial({ vertexColors: true }),
    decal,
  ];
  for (const m of mats) if (m.envMap !== undefined) { CAR_ENV.mats.add(m); m.userData.env = m.envMapIntensity; }
  return mats;
}

function buildCarModel(def) {
  const K = new CarKit(def);
  const recipe = CAR_RECIPES[def.id];
  recipe(K, def);
  const liv = drawLivery(def.id, K.decals);
  emitDecals(K.mb, K.decals, liv.pk);
  const mats = carMaterials(liv.tex, G.settings.quality !== 'low');
  const group = new THREE.Group(), body = new THREE.Group(); group.add(body);
  const bodyMesh = new THREE.Mesh(K.mb.build(), mats); bodyMesh.castShadow = true; body.add(bodyMesh);
  for (const p of K.parts) body.add(p);
  let siren = K.siren || null;
  // lamp glows (night, brakes)
  if (!glowTex) glowTex = glowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0.25)');
  const glows = { heads: [], tails: [] };
  for (const [list, col, key] of [[K.heads, 0xffe6b0, 'heads'], [K.tails, 0xff2a14, 'tails']]) for (const g of list) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: col, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    s.position.set(g.x, g.y, g.z); s.visible = false; body.add(s); glows[key].push(s);
  }
  const beams = [];
  for (const sx of [-0.7, 0.7]) { const bm = new THREE.Mesh(beamGeo, beamMat); bm.position.set(sx, 0.9, def.front); bm.rotation.x = 0.06; bm.visible = false; body.add(bm); beams.push(bm); }
  const ws = [];
  for (const w of K.wheels) for (const s of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(s * w.x, w.y, w.z);
    const m = new THREE.Mesh(buildWheelGeo(w.style), mats); m.castShadow = true; if (s < 0) m.scale.x = -1;
    pivot.add(m); group.add(pivot); ws.push({ pivot, mesh: m, front: !!w.front, r: w.r });
  }
  const lit = [0, 1, 2, 3, 5].map(i => mats[i]);
  const model = {
    group, body, wheels: ws, mats, mat: mats[0], siren, beams, bodyMesh, glows,
    // darken for damage / wrecks: reflections and clear coat fade with the paint
    tint(r, g, b) { const k = Math.max(r, g, b); for (const m of lit) { m.color.setRGB(r, g, b); m.envMapIntensity = m.userData.env * k * k; if (m.clearcoat !== undefined) m.clearcoat = k > 0.4 ? 1 : 0; } },
    emit(r, g, b) { for (const m of lit) m.emissive.setRGB(r, g, b); },
    lights(night, brake, alive) {
      mats[M_LAMP].color.setScalar(alive ? 1 : 0.25);
      for (const s of glows.heads) { s.visible = alive && night; s.scale.setScalar(1.5); s.material.opacity = 0.9; }
      for (const s of glows.tails) { const on = alive && (night || brake); s.visible = on; const k = brake ? 1 : 0.55; s.scale.setScalar((night ? 1.1 : 0.7) * (0.6 + k * 0.6)); s.material.opacity = brake ? 1 : 0.7; }
    },
  };
  model.lights(curTod.night, false, true);
  return model;
}
function disposeCarModel(m) {
  m.group.parent && m.group.parent.remove(m.group);
  m.bodyMesh.geometry.dispose();
  for (const mt of m.mats) { CAR_ENV.mats.delete(mt); mt.dispose(); }
  for (const s of m.glows.heads.concat(m.glows.tails)) s.material.dispose();
  for (const p of m.siren || []) p.material.dispose();
}
const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const beamGeo = (() => { const g = new THREE.ConeGeometry(3.2, 16, 12, 1, true); g.translate(0, -8, 0); g.rotateX(-Math.PI / 2); return g; })();

// ================= recipes =================
const CAR_RECIPES = {};

// --- Sundowner: '70 fastback muscle car ---
CAR_RECIPES.sundowner = (K, def) => {
  const P = def.color;
  const body = loftZ({
    z: [-2.42, 2.42], step: 0.14, arches: [[1.45, 0.46, 0.54], [-1.45, 0.5, 0.58]], creases: [-2.34],
    y0: kf([[-2.42, 0.5], [-2.15, 0.36], [2.1, 0.36], [2.42, 0.52]]),
    y1: kf([[-2.42, 0.98], [-2.34, 1.13], [-2.1, 1.1], [-1.5, 1.09], [0.6, 1.1], [2.15, 1.09], [2.34, 1.05], [2.42, 0.98]]),
    w: kf([[-2.42, 0.96], [-2.28, 1.02], [-1.45, 1.07], [-0.4, 1.03], [1.45, 1.05], [2.25, 1.03], [2.42, 0.96]]),
    wt: (z, w) => w - 0.08, rb: 0.08, rt: 0.12, bulge: 0.03, crown: 0.035,
  });
  K.loft(body, (x, y, z, nx, ny) => ny < -0.6 ? [M_TRIM, 0x1a1716] : P);
  const cab = loftZ({
    z: [-1.62, 0.62], step: 0.08, keys: [-0.78, -0.12],
    y0: () => 1.02, y1: kf([[-1.62, 1.06], [-0.78, 1.62], [-0.12, 1.64], [0.62, 1.06]]),
    w: () => 0.92, wt: () => 0.74, rb: 0.02, rt: 0.16, crown: 0.03,
  });
  K.loft(cab, (x, y, z, nx, ny) => ny > 0.8 && y > 1.5 ? [M_TRIM, 0x221d1c] : P); // black vinyl roof
  K.flare(1.0, 0.46, 1.45, 0.55, 0.035, P).flare(1.03, 0.5, -1.45, 0.59, 0.04, P);
  // glass
  K.sideGlass(cab, -1.5, 0.52, 1.12, { heads: [-0.28], after: D => { D.ctx.fillStyle = 'rgba(220,220,215,0.9)'; D.ctx.fillRect(0.2, 1.1, 0.022, 0.45); } });
  K.topGlass(cab, -0.08, 0.6, { heads: [-0.38, 0.38], headAt: 0.05 });
  K.topGlass(cab, -1.6, -0.8, { rear: true });
  // stripes & numbers
  const stripes = D => { D.ctx.fillStyle = '#141212'; for (const s of [-1, 1]) D.ctx.fillRect(s > 0 ? 0.1 : -0.34, D.d.b0 - 1, 0.24, 9); D.ctx.fillStyle = 'rgba(250,240,220,0.9)'; for (const s of [-1, 1]) { D.ctx.fillRect(s * 0.37 - 0.0125, D.d.b0 - 1, 0.025, 9); D.ctx.fillRect(s * 0.07 - 0.0125, D.d.b0 - 1, 0.025, 9); } };
  K.decal({ kind: 'top', L: body, a0: -1.05, a1: 1.05, b0: 0.62, b1: 2.42, draw: stripes });
  K.decal({ kind: 'top', L: body, a0: -1.05, a1: 1.05, b0: -2.42, b1: -1.6, draw: stripes });
  K.decal({ kind: 'top', L: cab, a0: -0.8, a1: 0.8, b0: -0.8, b1: -0.08, draw: stripes });
  K.decal({
    kind: 'side', L: body, twin: true, a0: -2.42, a1: 2.42, b0: 0.36, b1: 1.12, draw: D => {
      const c = D.ctx;
      // panel lines: door, fuel filler, hood edge
      c.strokeStyle = 'rgba(30,10,0,0.55)'; c.lineWidth = 0.012;
      c.beginPath(); c.moveTo(0.58, 1.06); c.lineTo(0.55, 0.42); c.moveTo(-0.78, 1.06); c.lineTo(-0.74, 0.42); c.stroke();
      // C-stripe
      c.fillStyle = '#141212';
      c.beginPath(); c.moveTo(2.25, 0.95); c.lineTo(-1.15, 0.95); c.quadraticCurveTo(-1.55, 0.95, -1.55, 0.75); c.quadraticCurveTo(-1.55, 0.58, -1.2, 0.58);
      c.lineTo(-0.95, 0.58); c.lineTo(-0.95, 0.66); c.lineTo(-1.15, 0.66); c.quadraticCurveTo(-1.45, 0.66, -1.45, 0.76); c.quadraticCurveTo(-1.45, 0.87, -1.15, 0.87); c.lineTo(2.25, 0.87); c.closePath(); c.fill();
      // number roundel
      c.fillStyle = '#f6efe2'; c.beginPath(); c.arc(-0.12, 0.7, 0.2, 0, TAU); c.fill();
      c.strokeStyle = '#141212'; c.lineWidth = 0.025; c.stroke();
      D.text('77', -0.12, 0.69, 0.24, '#141212', { weight: '900', font: "'Barlow Semi Condensed', 'Arial Narrow', sans-serif", sx: 0.9 });
      // side markers
      c.fillStyle = '#ff9a1a'; c.fillRect(2.05, 0.68, 0.16, 0.06); c.fillStyle = '#c01810'; c.fillRect(-2.25, 0.72, 0.16, 0.06);
    }
  });
  // front end
  K.rbox(M_TRIM, 1.86, 0.34, 0.1, 0.03, 0x121112, 0, 0.8, 2.41);
  for (let i = 0; i < 4; i++) K.box(M_CHROME, 1.0, 0.012, 0.03, 0x9a9a9a, 0, 0.7 + i * 0.06, 2.465);
  K.rbox(M_CHROME, 1.92, 0.4, 0.05, 0.02, C_CHROME, 0, 0.8, 2.405);
  K.lamp(0.6, 0.8, 2.455, 1, 'head', 'round', 0.095).lamp(0.83, 0.8, 2.455, 1, 'head', 'round', 0.095);
  K.rbox(M_CHROME, 2.0, 0.15, 0.2, 0.06, C_CHROME, 0, 0.5, 2.48).rbox(M_CHROME, 0.3, 0.15, 0.3, 0.06, C_CHROME, 0.92, 0.5, 2.33, 0, -0.5).rbox(M_CHROME, 0.3, 0.15, 0.3, 0.06, C_CHROME, -0.92, 0.5, 2.33, 0, 0.5);
  K.lamp(0.7, 0.4, 2.47, 1, 'amber', 'rect', 0.2, 0.05, false);
  // hood scoop + pins
  K.rbox(M_TRIM, 0.62, 0.14, 0.8, 0.06, 0x1a1716, 0, 1.15, 1.35).box(M_TRIM, 0.5, 0.08, 0.02, 0x050505, 0, 1.17, 1.76);
  for (const s of [-1, 1]) K.cyl(M_CHROME, 0.035, 0.035, 0.03, 8, C_CHROME, s * 0.62, 1.13, 2.2);
  // rear end
  K.rbox(M_TRIM, 1.8, 0.2, 0.06, 0.03, 0x141212, 0, 0.86, -2.42);
  K.lamp(0.48, 0.86, -2.44, -1, 'tail', 'rect', 0.62, 0.11);
  K.rbox(M_CHROME, 2.0, 0.15, 0.2, 0.06, C_CHROME, 0, 0.5, -2.48).rbox(M_CHROME, 0.3, 0.15, 0.3, 0.06, C_CHROME, 0.92, 0.5, -2.33, 0, 0.5).rbox(M_CHROME, 0.3, 0.15, 0.3, 0.06, C_CHROME, -0.92, 0.5, -2.33, 0, -0.5);
  for (const s of [-1, 1]) K.cylZ(M_CHROME, 0.07, 0.3, 10, C_CHROME, s * 0.55, 0.36, -2.45);
  K.cyl(M_CHROME, 0.07, 0.07, 0.03, 10, C_CHROME, -1.04, 1.0, -1.85, 0, 0, Math.PI / 2);
  // mirrors, handles, antenna
  for (const s of [-1, 1]) { K.box(M_CHROME, 0.12, 0.03, 0.04, C_CHROME, s * 1.0, 1.15, 0.42).sph(M_CHROME, 0.07, C_CHROME, s * 1.08, 1.18, 0.42, 1, 0.8, 1.3); K.box(M_CHROME, 0.02, 0.03, 0.16, C_CHROME, s * 1.04, 0.99, -0.62); }
  K.cyl(M_CHROME, 0.008, 0.008, 1.0, 4, C_CHROME, 1.0, 1.55, 1.9, 0, 0, 0.12);
  K.gun(0.62, 1.22, 1.85);
  K.wheel(0.9, 0.46, 1.45, 0.46, 0.32, 1, { rim: 'mag' }).wheel(0.88, 0.5, -1.45, 0.5, 0.42, 0, { rim: 'mag' });
};

// splotchy rust patch for decals, deterministic per seed
function rustSpot(D, a, b, r, seed, col) {
  const rnd = mulberry32(seed), c = D.ctx;
  for (const [k, fill] of [[1, col || 'rgba(122,58,24,0.85)'], [0.55, 'rgba(70,32,14,0.8)']]) {
    c.beginPath();
    for (let i = 0; i <= 14; i++) { const t = i / 14 * TAU, rr = r * k * (0.6 + rnd() * 0.5); c[i ? 'lineTo' : 'moveTo'](a + Math.cos(t) * rr * 1.4, b + Math.sin(t) * rr); }
    c.fillStyle = fill; c.fill();
  }
  c.fillStyle = 'rgba(90,40,16,0.7)';
  for (let i = 0; i < 10; i++) { const t = rnd() * TAU, d = r * (1 + rnd() * 0.6); c.beginPath(); c.arc(a + Math.cos(t) * d * 1.4, b + Math.sin(t) * d, r * 0.08 * (0.5 + rnd()), 0, TAU); c.fill(); }
}
const FONT_COND = "'Barlow Semi Condensed', 'Arial Narrow', sans-serif";

// --- Gravel Queen: '50s stepside pickup from the salvage yard ---
CAR_RECIPES.gravelqueen = (K, def) => {
  const P = def.color, PRIMER = 0x8e8a80, UNDER = [M_TRIM, 0x1a1716];
  const hood = loftZ({ z: [0.7, 2.46], step: 0.12, y0: () => 0.8, y1: kf([[0.7, 1.5], [2.15, 1.44], [2.46, 1.3]]), w: kf([[0.7, 0.72], [2.3, 0.68], [2.46, 0.62]]), wt: (z, w) => w - 0.1, rb: 0.04, rt: 0.2, crown: 0.05 });
  K.loft(hood, P);
  const fen = loftZ({ z: [0.5, 2.52], step: 0.1, arches: [[1.6, 0.52, 0.6]], y0: kf([[0.5, 0.66], [0.9, 0.6], [2.52, 0.72]]), y1: kf([[0.5, 0.9], [0.95, 1.18], [1.6, 1.3], [2.25, 1.27], [2.52, 1.08]]), w: kf([[0.5, 0.25], [1.0, 0.3], [2.52, 0.27]]), rb: 0.05, rt: 0.13, bulge: 0.02 });
  for (const s of [-1, 1]) K.loft(fen, (x, y, z, nx, ny) => ny < -0.6 ? UNDER : s > 0 ? PRIMER : P, mat4(s * 0.86, 0, 0));
  const cab = loftZ({ z: [-0.86, 0.8], step: 0.1, keys: [0.72, 0.42, -0.72], creases: [0.72], y0: () => 0.72, y1: kf([[-0.86, 1.98], [-0.72, 2.08], [0.42, 2.08], [0.72, 1.56], [0.8, 1.5]]), w: () => 1.0, wt: () => 0.86, rb: 0.05, rt: 0.2, bulge: 0.02 });
  K.loft(cab, (x, y, z, nx, ny) => ny < -0.6 ? UNDER : (x < -0.5 && nx < -0.5 && z > -0.62 && z < 0.6 && y < 1.62 ? PRIMER : P));
  const rf = loftZ({ z: [-2.35, -0.66], step: 0.1, arches: [[-1.5, 0.52, 0.6]], y0: kf([[-2.35, 0.75], [-1.5, 0.66], [-0.66, 0.66]]), y1: kf([[-2.35, 0.98], [-2.0, 1.22], [-1.5, 1.3], [-1.0, 1.22], [-0.66, 0.92]]), w: () => 0.27, rb: 0.05, rt: 0.13 });
  for (const s of [-1, 1]) K.loft(rf, (x, y, z, nx, ny) => ny < -0.6 ? UNDER : P, mat4(s * 0.9, 0, 0));
  // running boards, bed, frame
  for (const s of [-1, 1]) K.rbox(M_TRIM, 0.32, 0.05, 1.5, 0.02, 0x2a2826, s * 0.9, 0.64, -0.08);
  K.box(M_TRIM, 1.0, 0.14, 4.6, 0x1a1818, 0, 0.62, -0.3);
  K.box(M_TRIM, 1.3, 0.06, 2.0, 0x6a4a30, 0, 0.96, -1.92);
  for (let i = 0; i < 6; i++) K.box(M_CHROME, 0.04, 0.012, 2.0, 0x8a8a84, -0.5 + i * 0.2, 1.0, -1.92);
  for (const s of [-1, 1]) { K.rbox(M_PAINT, 0.08, 0.52, 2.02, 0.03, P, s * 0.66, 1.2, -1.92); K.rbox(M_CHROME, 0.11, 0.05, 2.06, 0.02, 0x8a8a84, s * 0.66, 1.47, -1.92); for (const z of [-1.0, -2.85]) K.box(M_TRIM, 0.13, 0.08, 0.1, 0x222020, s * 0.66, 1.42, z); }
  K.rbox(M_PAINT, 1.4, 0.52, 0.08, 0.03, P, 0, 1.2, -0.94).rbox(M_PAINT, 1.4, 0.5, 0.07, 0.03, P, 0, 1.19, -2.9);
  K.tube(M_CHROME, [[0.62, 1.44, -2.94], [0.4, 1.3, -2.97], [0, 1.25, -2.98], [-0.4, 1.3, -2.97], [-0.62, 1.44, -2.94]], 0.015, 0x6a6a64, 16);
  // junk in the bed
  K.cyl(M_TRIM, 0.28, 0.28, 0.78, 14, 0x3f5a4a, -0.32, 1.38, -2.25).torus(M_TRIM, 0.28, 0.02, 0x2f4a3a, -0.32, 1.55, -2.25, Math.PI / 2, 0, 0).torus(M_TRIM, 0.28, 0.02, 0x2f4a3a, -0.32, 1.2, -2.25, Math.PI / 2, 0, 0);
  K.box(M_TRIM, 0.55, 0.42, 0.55, 0x8a6a40, 0.3, 1.2, -1.45, 0, 0.35).box(M_TRIM, 0.57, 0.05, 0.08, 0x5a4020, 0.3, 1.2, -1.45, 0, 0.35);
  K.torus(M_TRIM, 0.24, 0.1, C_RUBBER, 0.32, 1.05, -2.42, Math.PI / 2, 0, 0, TAU, 16);
  K.box(M_PAINT, 0.9, 0.04, 0.5, 0xa04a2a, -0.2, 1.3, -1.35, 0.3, -0.4, 0.4);
  // roll bar, lights, stack
  K.tube(M_CHROME, [[0.62, 1.47, -1.0], [0.62, 2.08, -1.0], [0.5, 2.22, -1.0], [-0.5, 2.22, -1.0], [-0.62, 2.08, -1.0], [-0.62, 1.47, -1.0]], 0.05, 0x7a7a74, 30);
  for (const s of [-1, 1]) { K.cylZ(M_TRIM, 0.13, 0.16, 12, 0x1a1a1a, s * 0.38, 2.36, -1.0, 0.11); K.lamp(0.38, 2.36, -0.91, 1, 'fog', 'round', 0.1, 0, false); }
  K.cyl(M_CHROME, 0.065, 0.065, 1.55, 12, C_CHROME, 0.98, 1.65, -0.78).cyl(M_CHROME, 0.085, 0.085, 0.4, 12, 0x9a9a94, 0.98, 1.3, -0.78).box(M_TRIM, 0.16, 0.02, 0.16, 0x222222, 0.98, 2.44, -0.74, 0.5);
  // front: grille, lamps, bumper, bull bar
  K.rbox(M_CHROME, 1.16, 0.46, 0.06, 0.05, C_CHROME, 0, 1.02, 2.46).rbox(M_TRIM, 1.0, 0.34, 0.06, 0.03, 0x121212, 0, 1.02, 2.48);
  K.rbox(M_CHROME, 1.12, 0.07, 0.07, 0.03, C_CHROME, 0, 1.02, 2.51).cylZ(M_CHROME, 0.07, 0.05, 12, C_CHROME, 0, 1.02, 2.54);
  K.lamp(0.86, 1.1, 2.53, 1, 'head', 'round', 0.12).lamp(0.86, 0.86, 2.52, 1, 'amber', 'round', 0.045);
  K.rbox(M_CHROME, 2.36, 0.2, 0.18, 0.07, 0xb0aea8, 0, 0.62, 2.62);
  K.tube(M_CHROME, [[0.55, 0.62, 2.7], [0.55, 1.28, 2.76], [0.35, 1.42, 2.76], [-0.35, 1.42, 2.76], [-0.55, 1.28, 2.76], [-0.55, 0.62, 2.7]], 0.045, 0x4a4a46, 30);
  K.cylX(M_CHROME, 0.04, 1.1, 8, 0x4a4a46, 0, 0.98, 2.74);
  // rear
  K.lamp(0.9, 1.18, -2.33, -1, 'tail', 'round', 0.075);
  K.rbox(M_CHROME, 1.9, 0.12, 0.14, 0.04, 0x6a6a64, 0, 0.72, -3.0);
  // mirrors, handles
  for (const s of [-1, 1]) { K.tube(M_CHROME, [[s * 0.98, 1.5, 0.62], [s * 1.12, 1.62, 0.6], [s * 1.18, 1.7, 0.58]], 0.015, C_CHROME, 8); K.rbox(M_CHROME, 0.04, 0.24, 0.14, 0.02, C_CHROME, s * 1.2, 1.78, 0.58); K.box(M_CHROME, 0.02, 0.03, 0.14, C_CHROME, s * 1.0, 1.4, -0.45); }
  // glass
  K.sideGlass(cab, -0.78, 0.76, 1.6, { heads: [-0.15], pillars: [[0.44, 0.03]] });
  K.topGlass(cab, 0.43, 0.73, { margin: 0.05, heads: [-0.4], headAt: 0.1 });
  K.decal({ kind: 'back', z: -0.86, mi: M_GLASS, a0: -0.7, a1: 0.7, b0: 1.5, b1: 2.0, draw: D => { const c = D.ctx; c.beginPath(); c.moveTo(-0.55, 1.6); c.lineTo(0.55, 1.6); c.quadraticCurveTo(0.6, 1.6, 0.6, 1.66); c.lineTo(0.58, 1.86); c.quadraticCurveTo(0.56, 1.9, 0.5, 1.9); c.lineTo(-0.5, 1.9); c.quadraticCurveTo(-0.56, 1.9, -0.58, 1.86); c.lineTo(-0.6, 1.66); c.quadraticCurveTo(-0.6, 1.6, -0.55, 1.6); c.fillStyle = '#16262e'; c.fill(); c.lineWidth = 0.02; c.strokeStyle = '#cfcfc8'; c.stroke(); } });
  // rust, lettering
  K.decal({ kind: 'side', L: cab, twin: true, a0: -0.86, a1: 0.8, b0: 0.72, b1: 1.62, draw: D => {
    const c = D.ctx; c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 0.012; c.beginPath(); c.moveTo(0.6, 1.6); c.lineTo(0.6, 0.8); c.lineTo(-0.62, 0.8); c.lineTo(-0.62, 1.6); c.stroke();
    if (!D.flip) { D.text('HOLLIS', -0.01, 1.3, 0.2, '#f2e6c8', { font: FONT_COND, weight: '700', stroke: 'rgba(20,20,20,0.6)', strokeW: 0.015 }); D.text('SALVAGE & SCRAP', -0.01, 1.13, 0.085, '#f2e6c8', { font: FONT_COND, weight: '700' }); }
    else { D.text('HOLLIS', -0.01, 1.3, 0.2, '#f2e6c8', { font: FONT_COND, weight: '700', stroke: 'rgba(20,20,20,0.6)', strokeW: 0.015 }); D.text('SALVAGE & SCRAP', -0.01, 1.13, 0.085, '#f2e6c8', { font: FONT_COND, weight: '700' }); }
    rustSpot(D, -0.7, 0.85, 0.07, 3); rustSpot(D, 0.5, 0.9, 0.05, 4);
  } });
  K.decal({ kind: 'side', L: fen, m: mat4(0.86, 0, 0), sides: [1], a0: 0.5, a1: 2.52, b0: 0.6, b1: 1.3, draw: D => { rustSpot(D, 0.9, 0.95, 0.09, 7); rustSpot(D, 2.25, 0.95, 0.06, 8); } });
  K.decal({ kind: 'side', L: fen, m: mat4(-0.86, 0, 0), sides: [-1], a0: 0.5, a1: 2.52, b0: 0.6, b1: 1.3, draw: D => { rustSpot(D, 1.0, 0.9, 0.08, 11); rustSpot(D, 2.3, 1.05, 0.05, 12); } });
  K.decal({ kind: 'side', L: rf, m: mat4(0.9, 0, 0), sides: [1], a0: -2.35, a1: -0.66, b0: 0.66, b1: 1.3, draw: D => { rustSpot(D, -2.0, 0.95, 0.08, 13); } });
  K.decal({ kind: 'side', L: rf, m: mat4(-0.9, 0, 0), sides: [-1], a0: -2.35, a1: -0.66, b0: 0.66, b1: 1.3, draw: D => { rustSpot(D, -0.95, 0.9, 0.07, 14); } });
  K.decal({ kind: 'top', L: hood, fit: true, b0: 0.72, b1: 2.46, draw: D => { rustSpot(D, 0.3, 1.9, 0.12, 21, 'rgba(140,70,30,0.7)'); rustSpot(D, -0.25, 1.1, 0.08, 22, 'rgba(140,70,30,0.7)'); D.ctx.fillStyle = 'rgba(142,138,128,0.95)'; D.ctx.beginPath(); D.ctx.ellipse(-0.3, 2.2, 0.18, 0.12, 0.3, 0, TAU); D.ctx.fill(); } });
  K.decal({ kind: 'back', z: -2.94, a0: -0.68, a1: 0.68, b0: 0.96, b1: 1.42, draw: D => { D.text('GRAVEL QUEEN', 0, 1.2, 0.15, 'rgba(242,230,200,0.85)', { font: FONT_COND, weight: '700' }); rustSpot(D, 0.5, 1.02, 0.06, 31); } });
  K.gun(0.72, 1.47, 1.95);
  K.wheel(0.95, 0.52, 1.6, 0.52, 0.42, 1, { rim: 'steel', rimCol: 0xe6dcc0, tread: 'mud', trimRing: true }).wheel(0.95, 0.52, -1.5, 0.52, 0.42, 0, { rim: 'steel', rimCol: 0xe6dcc0, tread: 'mud', trimRing: true });
};

// --- Moonbeam: custom '70s van ---
CAR_RECIPES.moonbeam = (K, def) => {
  const P = def.color, PURP = 0x5a2d6e;
  const body = loftZ({
    z: [-2.35, 2.78], step: 0.13, arches: [[1.5, 0.48, 0.56], [-1.5, 0.48, 0.56]], creases: [2.16], keys: [1.5, 1.72],
    y0: kf([[-2.35, 0.52], [-2.15, 0.4], [2.35, 0.4], [2.78, 0.55]]),
    y1: kf([[-2.35, 2.48], [-2.24, 2.62], [1.5, 2.64], [1.72, 2.5], [2.16, 1.66], [2.62, 1.48], [2.78, 1.24]]),
    w: kf([[-2.35, 1.06], [-2.2, 1.1], [2.4, 1.1], [2.78, 1.0]]), wt: (z, w) => w - 0.1, rb: 0.1, rt: 0.3, bulge: 0.02, crown: 0.03,
  });
  K.loft(body, (x, y, z, nx, ny) => ny < -0.6 ? [M_TRIM, 0x1a1716] : P);
  K.flare(1.08, 0.48, 1.5, 0.57, 0.035, P).flare(1.08, 0.48, -1.5, 0.57, 0.035, P);
  K.topGlass(body, 1.74, 2.14, { margin: 0.06, heads: [-0.45, 0.45], headAt: 0.2 });
  K.sideGlass(body, 1.02, 2.12, 1.74, { heads: [1.4] });
  // full-length rainbow swoosh
  K.decal({ kind: 'side', L: body, a0: -2.35, a1: 2.78, b0: 0.5, b1: 1.74, draw: D => {
    const c = D.ctx, cols = ['#c0392b', '#e8642a', PURP_CSS];
    cols.forEach((col, i) => {
      const o = i * 0.13;
      c.beginPath(); c.moveTo(2.8, 1.02 + o); c.bezierCurveTo(1.2, 1.02 + o, 0.6, 1.0 + o, -0.2, 1.2 + o); c.bezierCurveTo(-0.9, 1.38 + o, -1.6, 1.35 + o, -2.4, 1.32 + o);
      c.lineTo(-2.4, 1.42 + o); c.bezierCurveTo(-1.6, 1.45 + o, -0.9, 1.48 + o, -0.2, 1.3 + o); c.bezierCurveTo(0.6, 1.1 + o, 1.2, 1.12 + o, 2.8, 1.12 + o); c.closePath();
      c.fillStyle = col; c.fill();
    });
    c.fillStyle = 'rgba(30,10,30,0.5)'; c.fillRect(-0.05, 0.55, 0.012, 1.2); c.fillRect(1.0, 0.55, 0.012, 1.2);
  } });
  // mural on the rear panels
  K.decal({ kind: 'side', L: body, twin: true, a0: -2.25, a1: 0.95, b0: 1.62, b1: 2.36, draw: D => {
    const c = D.ctx;
    c.fillStyle = D.lin(0, 2.36, 0, 1.62, [[0, '#2a1650'], [0.55, '#8a2a6a'], [1, '#f08a3a']]);
    c.beginPath(); c.moveTo(-2.15, 1.7); c.lineTo(0.85, 1.7); c.quadraticCurveTo(0.92, 1.7, 0.92, 1.78); c.lineTo(0.92, 2.25); c.quadraticCurveTo(0.92, 2.32, 0.85, 2.32); c.lineTo(-2.15, 2.32); c.quadraticCurveTo(-2.22, 2.32, -2.22, 2.25); c.lineTo(-2.22, 1.78); c.quadraticCurveTo(-2.22, 1.7, -2.15, 1.7); c.fill();
    c.fillStyle = '#ffd35a'; c.beginPath(); c.arc(D.flip ? 0.55 : -1.85, 1.86, 0.2, Math.PI, 0); c.fill();
    c.fillStyle = 'rgba(40,16,40,0.85)'; for (let i = 0; i < 4; i++) c.fillRect(-2.22, 1.72 + i * 0.035, 3.14, 0.012);
    c.fillStyle = '#fff6d0'; const mz = D.flip ? -1.85 : 0.55; c.beginPath(); c.arc(mz, 2.17, 0.1, 0, TAU); c.fill(); c.fillStyle = '#2a1650'; c.beginPath(); c.arc(mz + 0.045, 2.19, 0.085, 0, TAU); c.fill();
    const rnd = mulberry32(5); c.fillStyle = '#fff6d0'; for (let i = 0; i < 26; i++) { c.beginPath(); c.arc(-2.15 + rnd() * 3.0, 2.0 + rnd() * 0.3, 0.008 + rnd() * 0.008, 0, TAU); c.fill(); }
    D.text('Moonbeam', -0.65, 2.0, 0.26, '#ffd35a', { stroke: '#2a1650', strokeW: 0.03 });
  } });
  // bubble windows
  for (const s of [-1, 1]) { K.torus(M_CHROME, 0.28, 0.035, C_CHROME, s * 1.1, 1.0, -1.0, 0, Math.PI / 2, 0); K.sph(M_GLASS, 0.27, 0x2a1838, s * 1.08, 1.0, -1.0, 0.35, 1, 1); }
  // roof: rack + speakers
  for (const s of [-1, 1]) { K.cylZ(M_CHROME, 0.025, 2.5, 8, C_CHROME, s * 0.75, 2.8, -0.75); for (const z of [-1.9, 0.4]) K.cyl(M_CHROME, 0.02, 0.02, 0.18, 6, C_CHROME, s * 0.75, 2.72, z); }
  for (const z of [-1.6, -0.75, 0.1]) K.cylX(M_CHROME, 0.02, 1.5, 6, C_CHROME, 0, 2.8, z);
  for (const s of [-1, 1]) { K.cylZ(M_PAINT, 0.36, 0.55, 18, PURP, s * 0.5, 2.98, 1.0, 0.2); K.torus(M_CHROME, 0.34, 0.03, C_CHROME, s * 0.5, 2.98, 1.28, 0, 0, 0); K.cylZ(M_TRIM, 0.31, 0.04, 18, 0x111014, s * 0.5, 2.98, 1.25); K.sph(M_CHROME, 0.09, C_CHROME, s * 0.5, 2.98, 1.22, 1, 1, 0.5); K.box(M_TRIM, 0.1, 0.25, 0.3, 0x222222, s * 0.5, 2.75, 0.85); }
  // front
  K.rbox(M_CHROME, 1.24, 0.34, 0.06, 0.04, C_CHROME, 0, 1.14, 2.78).rbox(M_TRIM, 1.1, 0.24, 0.06, 0.03, 0x141214, 0, 1.14, 2.8);
  for (let i = 0; i < 3; i++) K.box(M_CHROME, 1.08, 0.015, 0.03, 0xb0b0b0, 0, 1.06 + i * 0.08, 2.83);
  K.lamp(0.78, 1.14, 2.8, 1, 'head', 'round', 0.12).lamp(0.78, 0.88, 2.79, 1, 'amber', 'rect', 0.16, 0.06, false);
  K.rbox(M_CHROME, 2.24, 0.22, 0.22, 0.08, C_CHROME, 0, 0.56, 2.86);
  // rear: doors, spare, ladder, lamps
  K.decal({ kind: 'back', z: -2.35, mi: M_GLASS, a0: -1.0, a1: 1.0, b0: 1.6, b1: 2.3, draw: D => { const c = D.ctx; for (const s of [-1, 1]) { c.beginPath(); c.rect(s > 0 ? 0.08 : -0.82, 1.72, 0.74, 0.44); c.fillStyle = '#16202a'; c.fill(); c.lineWidth = 0.02; c.strokeStyle = '#cfcfc8'; c.stroke(); } } });
  K.decal({ kind: 'back', z: -2.35, a0: -1.0, a1: 1.0, b0: 0.5, b1: 1.62, draw: D => { const c = D.ctx; c.fillStyle = 'rgba(30,10,30,0.55)'; c.fillRect(-0.006, 0.55, 0.012, 1.1); D.text('KEEP ON TRUCKIN', 0, 0.75, 0.08, '#5a2d6e', { font: FONT_COND, weight: '700' }); } });
  K.torus(M_TRIM, 0.34, 0.12, C_RUBBER, 0.42, 1.3, -2.5, 0, 0, 0, TAU, 20).cylZ(M_CHROME, 0.24, 0.06, 16, C_CHROME, 0.42, 1.3, -2.5).cylZ(M_PAINT, 0.36, 0.05, 20, PURP, 0.42, 1.3, -2.57);
  for (const x of [-0.95, -0.65]) K.cyl(M_CHROME, 0.022, 0.022, 1.9, 6, C_CHROME, x, 1.65, -2.42);
  for (let i = 0; i < 6; i++) K.cylX(M_CHROME, 0.018, 0.3, 6, C_CHROME, -0.8, 0.85 + i * 0.3, -2.42);
  K.lamp(1.0, 1.15, -2.36, -1, 'tail', 'rect', 0.12, 0.34);
  K.rbox(M_CHROME, 2.24, 0.22, 0.22, 0.08, C_CHROME, 0, 0.56, -2.42);
  for (const s of [-1, 1]) { K.cylZ(M_CHROME, 0.075, 1.7, 12, C_CHROME, s * 1.1, 0.46, -0.05); K.rbox(M_CHROME, 0.04, 0.2, 0.14, 0.02, C_CHROME, s * 1.2, 2.0, 2.0); K.box(M_CHROME, 0.12, 0.02, 0.03, C_CHROME, s * 1.13, 2.0, 2.0); }
  K.gun(0.66, 1.72, 2.2);
  K.wheel(0.93, 0.48, 1.5, 0.48, 0.38, 1, { rim: 'mag' }).wheel(0.93, 0.48, -1.5, 0.48, 0.38, 0, { rim: 'mag' });
};
const PURP_CSS = '#5a2d6e';

// --- Scorcher: chopped '32 highboy coupe with a blown motor ---
CAR_RECIPES.scorcher = (K, def) => {
  const P = def.color;
  const body = loftZ({ z: [-1.98, 0.48], step: 0.1, y0: kf([[-1.98, 0.8], [-1.8, 0.66], [0.48, 0.66]]), y1: kf([[-1.98, 1.02], [-1.85, 1.24], [-1.6, 1.33], [0.48, 1.36]]), w: kf([[-1.98, 0.6], [-1.75, 0.72], [0.48, 0.74]]), wt: (z, w) => w - 0.05, rb: 0.12, rt: 0.07, bulge: 0.02 });
  K.loft(body, (x, y, z, nx, ny) => ny < -0.6 ? [M_TRIM, 0x1a1716] : P);
  const cab = loftZ({ z: [-1.32, 0.4], step: 0.08, keys: [-1.1, 0.26], y0: () => 1.32, y1: kf([[-1.32, 1.36], [-1.1, 1.76], [0.26, 1.8], [0.4, 1.79]]), w: () => 0.7, wt: () => 0.64, rb: 0.02, rt: 0.08 });
  K.loft(cab, (x, y, z, nx, ny) => ny > 0.8 && y > 1.7 ? [M_TRIM, 0x1c1a1a] : P);
  K.sideGlass(cab, -1.05, 0.36, 1.42, { heads: [-0.35], margin: 0.05 });
  K.decal({ kind: 'front', z: 0.4, mi: M_GLASS, a0: -0.7, a1: 0.7, b0: 1.34, b1: 1.8, draw: D => { const c = D.ctx; c.beginPath(); c.rect(-0.6, 1.4, 1.2, 0.33); c.fillStyle = D.lin(0, 1.4, 0, 1.73, [[0, '#0b1418'], [1, '#3a5a66']]); c.fill(); c.lineWidth = 0.025; c.strokeStyle = '#d8d8d2'; c.stroke(); c.fillStyle = 'rgba(5,8,10,0.85)'; c.beginPath(); c.ellipse(-0.25, 1.5, 0.12, 0.1, 0, 0, TAU); c.fill(); } });
  K.topGlass(cab, -1.3, -1.12, { rear: true, margin: 0.04 });
  // flames down the flanks, with a pinstripe edge
  K.decal({ kind: 'side', L: body, a0: -1.98, a1: 0.48, b0: 0.66, b1: 1.36, draw: D => {
    const c = D.ctx, tongues = [[0.98, 1.05, 0.12], [1.18, 1.25, 0.1], [0.85, 0.88, 0.1], [1.35, 0.96, 0.09], [1.6, 1.12, 0.08], [0.7, 1.28, 0.06]];
    c.beginPath(); c.moveTo(0.5, 1.33);
    for (const [len, y, h] of tongues.sort((a, b) => b[1] - a[1])) { c.quadraticCurveTo(0.2, y + h, 0.48 - len, y + h * 0.2); c.quadraticCurveTo(0.1, y - h * 0.4, 0.3, y - h * 0.9); }
    c.lineTo(0.5, 0.75); c.closePath();
    c.fillStyle = D.lin(0.5, 0, -1.2, 0, [[0, '#fff2a0'], [0.35, '#ffc21a'], [0.7, '#ff7a14'], [1, '#e8401a']]); c.fill();
    c.lineWidth = 0.014; c.strokeStyle = '#7ad0ff'; c.stroke();
    c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 0.01; c.beginPath(); c.moveTo(0.3, 1.33); c.lineTo(0.3, 0.72); c.lineTo(-0.85, 0.72); c.lineTo(-0.85, 1.33); c.stroke();
  } });
  // chassis
  for (const s of [-1, 1]) K.box(M_TRIM, 0.1, 0.14, 4.25, 0x1e1c1c, s * 0.42, 0.56, 0.1);
  K.tube(M_CHROME, [[-0.92, 0.4, 1.95], [-0.55, 0.3, 1.95], [0.55, 0.3, 1.95], [0.92, 0.4, 1.95]], 0.04, C_CHROME, 16);
  K.rbox(M_TRIM, 1.0, 0.05, 0.1, 0.02, 0x1a1a1a, 0, 0.52, 1.92);
  for (const s of [-1, 1]) K.tube(M_CHROME, [[s * 0.6, 0.32, 1.95], [s * 0.45, 0.5, 1.2]], 0.025, C_CHROME, 6);
  K.tube(M_CHROME, [[-0.7, 0.42, -1.25], [0, 0.4, -1.25], [0.7, 0.42, -1.25]], 0.07, 0x6a6a6a, 8);
  // motor
  K.rbox(M_PAINT, 0.6, 0.42, 0.85, 0.06, 0xd8422a, 0, 0.9, 1.15).box(M_TRIM, 0.4, 0.15, 0.6, 0x1a1a1a, 0, 0.62, 1.15);
  for (const s of [-1, 1]) K.rbox(M_CHROME, 0.16, 0.11, 0.82, 0.04, C_CHROME, s * 0.27, 1.13, 1.15, 0, 0, s * 0.5);
  K.box(M_TRIM, 0.34, 0.1, 0.7, 0x2a2a2a, 0, 1.15, 1.15);
  K.rbox(M_CHROME, 0.44, 0.32, 0.64, 0.08, C_CHROME, 0, 1.36, 1.15);
  for (let i = 0; i < 5; i++) K.box(M_CHROME, 0.46, 0.02, 0.02, 0xa8a8a8, 0, 1.3 + i * 0.03, 1.48);
  K.rbox(M_TRIM, 0.36, 0.3, 0.44, 0.07, 0x1a1a1a, 0, 1.64, 1.2).box(M_TRIM, 0.28, 0.18, 0.02, 0x030303, 0, 1.66, 1.43);
  K.cylZ(M_CHROME, 0.12, 0.05, 14, C_CHROME, 0, 0.88, 1.62).cylZ(M_CHROME, 0.1, 0.05, 14, C_CHROME, 0, 1.36, 1.5).box(M_TRIM, 0.07, 0.5, 0.03, 0x111111, 0, 1.12, 1.62);
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) { const z = 0.82 + k * 0.17; K.tube(M_CHROME, [[s * 0.3, 0.92, z], [s * 0.55, 0.9, z], [s * 0.7, 0.95, z - 0.08], [s * 0.78, 1.2, z - 0.28]], 0.042, C_CHROME, 10); }
  // radiator shell, lamps
  K.rbox(M_CHROME, 0.66, 0.82, 0.14, 0.12, C_CHROME, 0, 1.0, 1.98).box(M_TRIM, 0.5, 0.66, 0.02, 0x121212, 0, 1.0, 2.05);
  for (let i = -4; i <= 4; i++) K.box(M_CHROME, 0.012, 0.64, 0.02, 0xc8c8c8, i * 0.054, 1.0, 2.06);
  K.cyl(M_CHROME, 0.04, 0.05, 0.08, 10, C_CHROME, 0, 1.44, 1.96);
  K.cylX(M_CHROME, 0.025, 1.24, 8, C_CHROME, 0, 0.92, 1.86);
  for (const s of [-1, 1]) { K.cyl(M_CHROME, 0.02, 0.02, 0.18, 6, C_CHROME, s * 0.6, 1.0, 1.86); K.sph(M_CHROME, 0.15, C_CHROME, s * 0.6, 1.12, 1.84, 1, 1, 0.9); }
  K.lamp(0.6, 1.12, 1.97, 1, 'head', 'round', 0.12, 0, false);
  // tail
  K.lamp(0.42, 0.98, -1.99, -1, 'tail', 'round', 0.07);
  for (const s of [-1, 1]) K.cylZ(M_CHROME, 0.08, 0.5, 14, C_CHROME, s * 0.24, 0.56, -2.0);
  K.cyl(M_CHROME, 0.06, 0.06, 0.04, 10, C_CHROME, 0, 1.31, -1.6);
  for (const s of [-1, 1]) K.box(M_CHROME, 0.06, 0.06, 0.06, C_CHROME, s * 0.5, 1.02, 1.8).box(M_TRIM, 0.05, 0.4, 0.05, 0x1a1a1a, s * 0.5, 0.82, 1.62);
  K.gun(0.5, 1.2, 1.68);
  K.wheel(0.92, 0.4, 1.95, 0.4, 0.26, 1, { rim: 'chrome', ww: true }).wheel(1.05, 0.62, -1.25, 0.62, 0.55, 0, { rim: 'chrome', tread: 'slick' });
};

// --- Lawdog: '74 county cruiser ---
CAR_RECIPES.lawdog = (K, def) => {
  const BLK = 0x17171b, WHT = 0xf0ede6;
  const body = loftZ({
    z: [-2.52, 2.54], step: 0.14, arches: [[1.5, 0.46, 0.54], [-1.5, 0.46, 0.54]], creases: [-2.42],
    y0: kf([[-2.52, 0.5], [-2.3, 0.38], [2.3, 0.38], [2.54, 0.5]]),
    y1: kf([[-2.52, 0.98], [-2.42, 1.07], [-1.4, 1.08], [0.85, 1.08], [2.4, 1.05], [2.54, 0.98]]),
    w: kf([[-2.52, 1.0], [-2.35, 1.04], [2.35, 1.04], [2.54, 1.0]]), wt: (z, w) => w - 0.05, rb: 0.08, rt: 0.07, bulge: 0.015, crown: 0.02,
  });
  K.loft(body, (x, y, z, nx, ny) => ny < -0.6 ? [M_TRIM, 0x1a1716] : (Math.abs(nx) > 0.5 && z > -0.92 && z < 0.9 ? WHT : BLK));
  const cab = loftZ({ z: [-1.45, 0.86], step: 0.08, keys: [-1.0, 0.3], y0: () => 1.02, y1: kf([[-1.45, 1.07], [-1.0, 1.6], [0.3, 1.62], [0.86, 1.07]]), w: () => 0.93, wt: () => 0.78, rb: 0.02, rt: 0.1, crown: 0.02 });
  K.loft(cab, WHT);
  K.sideGlass(cab, -1.38, 0.8, 1.14, { heads: [0.0, -0.85], pillars: [[-0.38, 0.07]], pillarCol: '#e8e4dc' });
  K.topGlass(cab, 0.32, 0.84, { heads: [-0.38, 0.38], headAt: 0.08 });
  K.topGlass(cab, -1.44, -1.02, { rear: true });
  K.decal({ kind: 'side', L: body, twin: true, a0: -2.52, a1: 2.54, b0: 0.38, b1: 1.08, draw: D => {
    const c = D.ctx; c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 0.012; c.beginPath(); for (const z of [0.86, -0.35, -0.9]) { c.moveTo(z, 1.06); c.lineTo(z, 0.42); } c.stroke();
    const sz = 0.35, sy = 0.74; c.fillStyle = '#d8a826'; c.beginPath(); for (let i = 0; i < 12; i++) { const r = i % 2 ? 0.1 : 0.21, t = i / 12 * TAU - Math.PI / 2; c.lineTo(sz + Math.cos(t) * r, sy - Math.sin(t) * r); } c.closePath(); c.fill();
    c.strokeStyle = '#8a6a10'; c.lineWidth = 0.012; c.stroke(); c.beginPath(); c.arc(sz, sy, 0.075, 0, TAU); c.fillStyle = '#f2d060'; c.fill();
    for (let i = 0; i < 6; i++) { const t = i / 6 * TAU - Math.PI / 2; c.beginPath(); c.arc(sz + Math.cos(t) * 0.21, sy - Math.sin(t) * 0.21, 0.022, 0, TAU); c.fillStyle = '#d8a826'; c.fill(); }
    D.text('SHERIFF', -0.6, 0.82, 0.16, '#17171b', { font: FONT_COND, weight: '700' });
    D.text('COUNTY', -0.6, 0.66, 0.08, '#17171b', { font: FONT_COND, weight: '700' });
    D.text('UNIT 7', 1.75, 0.82, 0.09, '#f0ede6', { font: FONT_COND, weight: '700' });
  } });
  K.decal({ kind: 'top', L: cab, fit: true, b0: -1.0, b1: 0.3, draw: D => D.text('7', 0, -0.35, 0.8, '#17171b', { font: FONT_COND, weight: '700' }) });
  // light bar
  K.rbox(M_CHROME, 1.34, 0.08, 0.3, 0.03, 0x9a9a9a, 0, 1.7, -0.25).box(M_TRIM, 0.08, 0.16, 0.2, 0x111111, 0, 1.79, -0.25);
  const lens = (col, x) => { const m = new THREE.Mesh(GEO.box, new THREE.MeshBasicMaterial({ color: col })); m.scale.set(0.52, 0.16, 0.26); m.position.set(x, 1.82, -0.25); K.parts.push(m); return m; };
  K.siren = [lens(0xff2020, -0.34), lens(0x2050ff, 0.34)];
  // front
  K.rbox(M_TRIM, 1.06, 0.28, 0.06, 0.02, 0x0e0e10, 0, 0.78, 2.53).rbox(M_CHROME, 1.12, 0.33, 0.04, 0.02, C_CHROME, 0, 0.78, 2.52);
  for (let i = 0; i < 6; i++) K.box(M_CHROME, 0.012, 0.24, 0.02, 0x9a9a9a, -0.4 + i * 0.16, 0.78, 2.565);
  K.lamp(0.62, 0.8, 2.555, 1, 'head', 'rect', 0.18, 0.13).lamp(0.85, 0.8, 2.555, 1, 'head', 'rect', 0.18, 0.13);
  K.rbox(M_CHROME, 2.12, 0.17, 0.2, 0.06, C_CHROME, 0, 0.48, 2.6);
  K.tube(M_TRIM, [[0.62, 0.42, 2.68], [0.62, 1.05, 2.76], [-0.62, 1.05, 2.76], [-0.62, 0.42, 2.68]], 0.045, 0x111111, 24);
  K.cylX(M_TRIM, 0.04, 1.24, 8, 0x111111, 0, 0.78, 2.75);
  for (const s of [-1, 1]) K.rbox(M_TRIM, 0.12, 0.5, 0.1, 0.04, 0x2a2a2a, s * 0.62, 0.78, 2.8);
  // rear
  K.lamp(0.64, 0.86, -2.53, -1, 'tail', 'rect', 0.52, 0.12);
  K.rbox(M_CHROME, 2.12, 0.17, 0.2, 0.06, C_CHROME, 0, 0.48, -2.6);
  K.cyl(M_CHROME, 0.008, 0.008, 1.6, 4, 0x2a2a2a, -0.8, 1.85, -2.2, -0.15);
  for (const s of [-1, 1]) { K.rbox(M_CHROME, 0.04, 0.12, 0.18, 0.02, C_CHROME, s * 1.05, 1.18, 0.5); K.box(M_CHROME, 0.02, 0.03, 0.14, C_CHROME, s * 1.05, 0.98, 0.3); }
  K.cylZ(M_CHROME, 0.08, 0.16, 12, C_CHROME, -0.99, 1.22, 0.68).lamp(-0.99, 1.22, 0.77, 1, 'fog', 'round', 0.06, 0, false);
  K.gun(0.6, 1.22, 2.0);
  K.wheel(0.89, 0.46, 1.5, 0.46, 0.34, 1, { rim: 'steel', rimCol: 0x141416 }).wheel(0.89, 0.46, -1.5, 0.46, 0.34, 0, { rim: 'steel', rimCol: 0x141416 });
};

// --- Big Chill: armoured ice cream step van ---
CAR_RECIPES.bigchill = (K, def) => {
  const P = def.color, WHT = 0xf7f2f2, UNDER = [M_TRIM, 0x1a1716];
  const cab = loftZ({
    z: [0.85, 2.56], step: 0.1, arches: [[1.7, 0.55, 0.64]], creases: [2.05], keys: [1.45, 1.62],
    y0: kf([[0.85, 0.5], [2.3, 0.5], [2.56, 0.6]]),
    y1: kf([[0.85, 2.48], [1.45, 2.48], [1.62, 2.4], [2.05, 1.52], [2.45, 1.44], [2.56, 1.26]]),
    w: kf([[0.85, 1.2], [2.4, 1.2], [2.56, 1.12]]), wt: (z, w) => w - 0.08, rb: 0.1, rt: 0.2, bulge: 0.02, crown: 0.03,
  });
  K.loft(cab, (x, y, z, nx, ny) => ny < -0.6 ? UNDER : y < 1.25 ? P : WHT);
  const box = loftZ({ z: [-2.52, 1.05], step: 0.15, arches: [[-1.5, 0.55, 0.64]], y0: () => 0.62, y1: () => 2.95, w: () => 1.27, wt: () => 1.22, rb: 0.08, rt: 0.24, bulge: 0.01, crown: 0.03 });
  K.loft(box, (x, y, z, nx, ny) => ny < -0.6 ? UNDER : y < 1.3 ? P : WHT);
  K.topGlass(cab, 1.62, 2.05, { margin: 0.05, heads: [-0.5], headAt: 0.15 });
  K.sideGlass(cab, 0.95, 2.0, 1.55, { heads: [1.3] });
  K.decal({ kind: 'side', L: box, twin: true, a0: -2.52, a1: 1.05, b0: 0.62, b1: 2.72, draw: D => {
    const c = D.ctx, pink = '#f1a7c3', deep = '#d0507e';
    // wavy pink hem and dripping top band
    c.fillStyle = pink; c.beginPath(); c.moveTo(-2.6, 1.0); for (let z = -2.6; z <= 1.1; z += 0.05) c.lineTo(z, 1.32 + Math.sin(z * 9) * 0.035); c.lineTo(1.1, 1.0); c.fill();
    c.beginPath(); c.moveTo(-2.6, 2.8); c.lineTo(-2.6, 2.55); const rnd = mulberry32(9);
    for (let z = -2.6; z < 1.1; z += 0.22) { const L = 0.08 + rnd() * 0.22; c.lineTo(z + 0.04, 2.55); c.quadraticCurveTo(z + 0.06, 2.55 - L, z + 0.11, 2.55 - L); c.quadraticCurveTo(z + 0.16, 2.55 - L, z + 0.18, 2.55); }
    c.lineTo(1.1, 2.55); c.lineTo(1.1, 2.8); c.fill();
    const lz = D.flip ? -1.5 : -0.85, ls = D.flip ? 0.4 : 0.5; // the service window takes the middle of the right side
    D.text('Big Chill', lz, 2.05, ls, deep, { stroke: '#ffffff', strokeW: 0.06 });
    D.text('ICE CREAM • SODAS • POPS', lz, 1.62, 0.12, '#5a3a8a', { font: FONT_COND, weight: '700' });
    if (!D.flip) for (let i = 0; i < 3; i++) { // menu pictures
      const z = 0.25 + i * 0.27, y = 1.98; c.fillStyle = '#fff'; c.fillRect(z - 0.11, y - 0.17, 0.22, 0.34); c.strokeStyle = deep; c.lineWidth = 0.012; c.strokeRect(z - 0.11, y - 0.17, 0.22, 0.34);
      c.fillStyle = ['#ff7aa8', '#8a5a3a', '#7ad0e0'][i]; c.beginPath(); c.arc(z, y + 0.05, 0.065, 0, TAU); c.fill();
      c.fillStyle = '#d9a05a'; c.beginPath(); c.moveTo(z - 0.06, y + 0.02); c.lineTo(z + 0.06, y + 0.02); c.lineTo(z, y - 0.13); c.fill();
    }
  } });
  K.decal({ kind: 'back', z: -2.52, a0: -1.2, a1: 1.2, b0: 0.7, b1: 2.8, draw: D => {
    const c = D.ctx; c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 0.012; c.strokeRect(-0.9, 0.75, 1.8, 1.9); c.beginPath(); c.moveTo(0, 0.75); c.lineTo(0, 2.65); c.stroke();
    c.fillStyle = '#16202a'; for (const s of [-1, 1]) c.fillRect(s > 0 ? 0.15 : -0.75, 2.1, 0.6, 0.4);
    c.fillStyle = '#ffd35a'; c.fillRect(-0.85, 1.45, 1.7, 0.42); D.text('STOP', 0, 1.74, 0.17, '#c0201a', { font: FONT_COND, weight: '700' }); D.text('WATCH FOR CHILDREN', 0, 1.56, 0.09, '#17171b', { font: FONT_COND, weight: '700' });
    D.text('Big Chill', 0, 1.15, 0.26, '#d0507e', { stroke: '#fff', strokeW: 0.03 });
  } });
  // service window + awning (right side)
  K.rbox(M_CHROME, 0.04, 0.8, 1.28, 0.03, C_CHROME, 1.27, 1.88, 0.1).box(M_TRIM, 0.03, 0.7, 1.16, 0x101418, 1.28, 1.88, 0.1).rbox(M_CHROME, 0.22, 0.05, 1.3, 0.02, C_CHROME, 1.36, 1.5, 0.1);
  for (let i = 0; i < 8; i++) K.box(M_PAINT, 0.62, 0.03, 0.17, i % 2 ? 0xf6f0ea : 0xe8433a, 1.52, 2.38, -0.47 + i * 0.163, 0, 0, -0.38);
  // front
  K.rbox(M_CHROME, 1.5, 0.36, 0.06, 0.05, C_CHROME, 0, 1.0, 2.56).rbox(M_TRIM, 1.36, 0.26, 0.06, 0.03, 0x121212, 0, 1.0, 2.58);
  for (let i = 0; i < 4; i++) K.box(M_CHROME, 1.34, 0.014, 0.03, 0xb0b0b0, 0, 0.9 + i * 0.065, 2.61);
  K.lamp(0.88, 1.08, 2.575, 1, 'head', 'round', 0.13);
  K.rbox(M_CHROME, 2.5, 0.3, 0.26, 0.1, C_CHROME, 0, 0.62, 2.66);
  K.tube(M_CHROME, [[0.5, 0.65, 2.78], [0.5, 1.25, 2.8], [-0.5, 1.25, 2.8], [-0.5, 0.65, 2.78]], 0.05, 0x5a5a60, 24);
  for (const y of [0.85, 1.05]) K.cylX(M_CHROME, 0.035, 1.0, 8, 0x5a5a60, 0, y, 2.8);
  K.cylZ(M_CHROME, 0.06, 0.4, 10, C_CHROME, 0, 2.6, 1.15, 0.18);
  for (const s of [-1, 1]) { K.tube(M_CHROME, [[s * 1.2, 1.8, 2.0], [s * 1.4, 1.9, 2.0], [s * 1.42, 2.2, 2.0]], 0.02, C_CHROME, 8); K.rbox(M_CHROME, 0.05, 0.42, 0.18, 0.02, C_CHROME, s * 1.43, 2.05, 2.0); }
  // rear
  K.lamp(1.02, 1.12, -2.53, -1, 'tail', 'round', 0.09);
  K.rbox(M_CHROME, 2.56, 0.3, 0.32, 0.1, C_CHROME, 0, 0.62, -2.62);
  // the cone
  K.mb.geo(M_PAINT, coneGeo(0.55, 1.3, 18), mat4(0, 3.62, -0.8, Math.PI), 0xd9a05a);
  for (let i = 0; i < 4; i++) K.torus(M_PAINT, 0.18 + i * 0.1, 0.015, 0xb87838, 0, 3.2 + i * 0.24, -0.8, Math.PI / 2, 0, 0);
  K.torus(M_PAINT, 0.56, 0.06, 0xc48848, 0, 4.25, -0.8, Math.PI / 2, 0, 0);
  K.sph(M_PAINT, 0.64, P, 0, 4.42, -0.8, 1, 0.85, 1, 18, 12);
  const rnd = mulberry32(3); for (let i = 0; i < 9; i++) { const a = i / 9 * TAU + rnd() * 0.3; K.sph(M_PAINT, 0.12, P, Math.sin(a) * 0.55, 4.18 - rnd() * 0.12, -0.8 + Math.cos(a) * 0.55, 1, 1.6, 1); }
  K.sph(M_PAINT, 0.42, 0xfaf3e6, 0, 4.95, -0.8, 1, 0.85, 1, 16, 10);
  K.sph(M_PAINT, 0.15, 0xd0201a, 0, 5.4, -0.8).cyl(M_TRIM, 0.012, 0.012, 0.25, 4, 0x3a5a2a, 0.05, 5.6, -0.8, 0, 0, -0.3);
  K.gun(0.8, 1.58, 2.0);
  K.wheel(1.0, 0.55, 1.7, 0.55, 0.45, 1, { rim: 'steel', rimCol: 0xf0ede6, ri: 0.6 }).wheel(1.06, 0.55, -1.5, 0.55, 0.45, 0, { rim: 'cap', rimCol: 0xf0ede6, ri: 0.6 });
};
