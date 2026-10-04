import { C_CHROME, M_CHROME, M_PAINT, M_TRIM } from '../model/constants.js';
import { kf, loftZ } from '../model/loft.js';
import { FONT_COND } from './shared.js';
import { coneGeo, mat4 } from '../../engine/geometry.js';
import { TAU, mulberry32 } from '../../engine/util.js';

// --- Big Chill: armoured ice cream step van ---
export function bigchill(K, def) {
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
}
