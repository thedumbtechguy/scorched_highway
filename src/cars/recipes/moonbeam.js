import { C_CHROME, C_RUBBER, M_CHROME, M_GLASS, M_PAINT, M_TRIM } from '../model/constants.js';
import { kf, loftZ } from '../model/loft.js';
import { FONT_COND } from './shared.js';
import { TAU, mulberry32 } from '../../engine/util.js';

// --- Moonbeam: custom '70s van ---
export function moonbeam(K, def) {
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
}
const PURP_CSS = '#5a2d6e';
