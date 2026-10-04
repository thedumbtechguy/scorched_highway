import { C_CHROME, M_CHROME, M_GLASS, M_PAINT, M_TRIM } from '../model/constants.js';
import { kf, loftZ } from '../model/loft.js';
import { TAU } from '../../engine/util.js';

// --- Scorcher: chopped '32 highboy coupe with a blown motor ---
export function scorcher(K, def) {
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
}
