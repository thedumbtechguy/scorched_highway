import * as THREE from 'three';
import { C_CHROME, M_CHROME, M_TRIM } from '../model/constants.js';
import { kf, loftZ } from '../model/loft.js';
import { FONT_COND } from './shared.js';
import { GEO } from '../../engine/geometry.js';
import { TAU } from '../../engine/util.js';

// --- Lawdog: '74 county cruiser ---
export function lawdog(K, def) {
  const BLK = 0x17171b, WHT = 0xf0ede6;
  const body = loftZ({
    z: [-2.52, 2.54], step: 0.14, arches: [[1.5, 0.46, 0.54], [-1.5, 0.46, 0.54]], creases: [-2.42], keys: [-0.92, 0.9], // stations on the door paint edges
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
}
