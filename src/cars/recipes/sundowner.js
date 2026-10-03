import { C_CHROME, M_CHROME, M_TRIM } from '../model/constants.js';
import { kf, loftZ } from '../model/loft.js';
import { TAU } from '../../engine/util.js';

// --- Sundowner: '70 fastback muscle car ---
export function sundowner(K, def) {
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
}
