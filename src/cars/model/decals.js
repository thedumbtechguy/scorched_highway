import * as THREE from 'three';
import { _nm3, _pv } from './loft.js';
import { renderer } from '../../engine/renderer.js';
import { clamp, lerp } from '../../engine/util.js';

// ----- decals: canvas art projected onto a loft's side, top or end -----
export const ATLAS = 1024, WHITE_UV = 3 / ATLAS; // top-left 8px of every atlas is solid white for untextured parts
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
export function drawLivery(key, decals) {
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
export function emitDecals(mb, decals, pk) {
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
