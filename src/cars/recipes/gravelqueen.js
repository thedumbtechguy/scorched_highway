import { C_CHROME, C_RUBBER, M_CHROME, M_GLASS, M_PAINT, M_TRIM } from '../model/constants.js';
import { kf, loftZ } from '../model/loft.js';
import { FONT_COND, rustSpot } from './shared.js';
import { mat4 } from '../../engine/geometry.js';
import { TAU } from '../../engine/util.js';

// --- Gravel Queen: '50s stepside pickup from the salvage yard ---
export function gravelqueen(K, def) {
  const P = def.color, PRIMER = 0x8e8a80, UNDER = [M_TRIM, 0x1a1716];
  const hood = loftZ({ z: [0.7, 2.46], step: 0.12, y0: () => 0.8, y1: kf([[0.7, 1.5], [2.15, 1.44], [2.46, 1.3]]), w: kf([[0.7, 0.72], [2.3, 0.68], [2.46, 0.62]]), wt: (z, w) => w - 0.1, rb: 0.04, rt: 0.2, crown: 0.05 });
  K.loft(hood, P);
  const fen = loftZ({ z: [0.5, 2.52], step: 0.1, arches: [[1.6, 0.52, 0.6]], y0: kf([[0.5, 0.66], [0.9, 0.6], [2.52, 0.72]]), y1: kf([[0.5, 0.9], [0.95, 1.18], [1.6, 1.3], [2.25, 1.27], [2.52, 1.08]]), w: kf([[0.5, 0.25], [1.0, 0.3], [2.52, 0.27]]), rb: 0.05, rt: 0.13, bulge: 0.02 });
  for (const s of [-1, 1]) K.loft(fen, (x, y, z, nx, ny) => ny < -0.6 ? UNDER : s > 0 ? PRIMER : P, mat4(s * 0.86, 0, 0));
  const cab = loftZ({ z: [-0.86, 0.8], step: 0.1, keys: [0.72, 0.42, -0.72, -0.62, 0.6], creases: [0.72], y0: () => 0.72, y1: kf([[-0.86, 1.98], [-0.72, 2.08], [0.42, 2.08], [0.72, 1.56], [0.8, 1.5]]), w: () => 1.0, wt: () => 0.86, rb: 0.05, rt: 0.2, bulge: 0.02 });
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
}
