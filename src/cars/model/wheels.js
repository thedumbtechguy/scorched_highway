import * as THREE from 'three';
import { MB } from './builder.js';
import { C_CHROME, C_RUBBER, M_CHROME, M_PAINT, M_TRIM } from './constants.js';
import { GEO, cylGeo, mat4, sphGeo } from '../../engine/geometry.js';
import { TAU } from '../../engine/util.js';

// ----- wheels -----
const WHEEL_CACHE = {};
export function buildWheelGeo(st, simple = false) {
  const key = JSON.stringify(st) + (simple ? ':far' : '');
  if (WHEEL_CACHE[key]) return WHEEL_CACHE[key];
  if (simple) return (WHEEL_CACHE[key] = simpleWheel(st));
  const mb = new MB(0), r = st.r, w = st.w, hw = w / 2, ri = r * (st.ri || 0.64);
  const prof = [[ri, -hw * 0.9], [r * 0.86, -hw], [r * 0.965, -hw * 0.86], [r, -hw * 0.55], [r, hw * 0.55], [r * 0.965, hw * 0.86], [r * 0.86, hw], [ri, hw * 0.9]];
  const lathe = new THREE.LatheGeometry(prof.map(([a, b]) => new THREE.Vector2(a, b)), 20); lathe.rotateZ(-Math.PI / 2);
  mb.geo(M_TRIM, lathe, new THREE.Matrix4(), st.tire || C_RUBBER);
  // tread blocks
  const n = Math.round(TAU * r / (st.tread === 'mud' ? 0.21 : 0.16)), blk = st.tread === 'mud' ? 0.06 : 0.035;
  if (st.tread !== 'slick') for (let k = 0; k < n; k++) for (const sx of [-1, 1]) {
    const a = (k + (sx > 0 ? 0.5 : 0)) / n * TAU;
    mb.geo(M_TRIM, GEO.box, mat4(sx * hw * 0.27, Math.sin(a) * (r + blk * 0.3), Math.cos(a) * (r + blk * 0.3), Math.PI / 2 - a, 0, 0, w * (st.tread === 'mud' ? 0.5 : 0.44), blk, TAU * r / n * 0.55), st.tire || C_RUBBER);
  }
  const rimStart = mb.mark(); // the rim and whitewall are built on the +x face, then mirrored to the other
  if (st.ww) { const g = new THREE.RingGeometry(ri * 1.12, r * 0.83, 24, 1); g.rotateY(Math.PI / 2); mb.geo(M_TRIM, g, mat4(hw + 0.004, 0, 0), 0xf2ede2); g.dispose(); }
  const fx = hw * 0.7; // rim face
  const ring = (rad, tube, col, x) => mb.geo(M_CHROME, new THREE.TorusGeometry(rad, tube, 4, 18), mat4(x, 0, 0, 0, Math.PI / 2, 0), col);
  if (st.rim === 'mag') {
    mb.geo(M_CHROME, cylGeo(ri * 0.92, ri * 0.92, 0.03, 16), mat4(fx - 0.04, 0, 0, 0, 0, -Math.PI / 2), 0x5a5a60);
    for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; mb.geo(M_CHROME, GEO.box, mat4(fx, Math.sin(a) * ri * 0.45, Math.cos(a) * ri * 0.45, Math.PI / 2 - a, 0, 0, 0.05, ri * 0.85, ri * 0.24), 0xd8d6d0); }
    ring(ri * 0.93, 0.03, C_CHROME, fx + 0.01);
    mb.geo(M_CHROME, cylGeo(ri * 0.22, ri * 0.26, 0.06, 12), mat4(fx + 0.03, 0, 0, 0, 0, -Math.PI / 2), C_CHROME);
  } else if (st.rim === 'chrome') {
    mb.geo(M_CHROME, sphGeo(ri * 0.95, 16, 6), mat4(fx - ri * 0.5, 0, 0, 0, 0, 0, 0.6, 1, 1), C_CHROME);
    ring(ri * 0.95, 0.035, C_CHROME, fx + 0.01);
    mb.geo(M_CHROME, cylGeo(0.03, ri * 0.25, 0.12, 8), mat4(fx + 0.08, 0, 0, 0, 0, -Math.PI / 2), 0xf0d080);
    for (let k = 0; k < 3; k++) { const a = k / 3 * TAU; mb.geo(M_CHROME, GEO.box, mat4(fx + 0.1, Math.sin(a) * 0.09, Math.cos(a) * 0.09, Math.PI / 2 - a, 0, 0, 0.03, 0.12, 0.03), 0xf0d080); }
  } else { // painted steel wheel with a chrome cap ('steel' small dog-dish cap, 'cap' big hubcap)
    mb.geo(M_PAINT, cylGeo(ri * 0.95, ri * 0.95, 0.04, 16), mat4(fx - 0.03, 0, 0, 0, 0, -Math.PI / 2), st.rimCol || 0x202022);
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; mb.geo(M_TRIM, cylGeo(0.035, 0.035, 0.03, 8), mat4(fx, Math.sin(a) * ri * 0.62, Math.cos(a) * ri * 0.62, 0, 0, -Math.PI / 2), 0x111111); }
    if (st.rim === 'cap') mb.geo(M_CHROME, sphGeo(ri * 0.8, 16, 5), mat4(fx - ri * 0.08, 0, 0, 0, 0, 0, 0.25, 1, 1), C_CHROME);
    else mb.geo(M_CHROME, sphGeo(ri * 0.45, 12, 5), mat4(fx, 0, 0, 0, 0, 0, 0.35, 1, 1), C_CHROME);
    if (st.trimRing) ring(ri * 0.92, 0.025, C_CHROME, fx);
  }
  // symmetric wheels need no mirroring per side, so all four can be drawn as instances of one mesh
  mb.mirrorX(rimStart);
  mb.geo(M_TRIM, new THREE.CylinderGeometry(ri * 0.98, ri * 0.98, w * 0.6, 20, 1, true), mat4(0, 0, 0, 0, 0, -Math.PI / 2), 0x2a2a2c); // open barrel between the rim faces
  return (WHEEL_CACHE[key] = mb.buildMerged([[M_PAINT, M_CHROME, M_TRIM]]));
}

/** A cheap wheel for distant cars: rounded tyre and a flat hub disc on each face. */
function simpleWheel(st) {
  const mb = new MB(0), r = st.r, hw = st.w / 2, ri = r * (st.ri || 0.64);
  const prof = [[ri, -hw * 0.9], [r * 0.9, -hw], [r, -hw * 0.5], [r, hw * 0.5], [r * 0.9, hw], [ri, hw * 0.9]];
  const lathe = new THREE.LatheGeometry(prof.map(([a, b]) => new THREE.Vector2(a, b)), 10); lathe.rotateZ(-Math.PI / 2);
  mb.geo(M_TRIM, lathe, new THREE.Matrix4(), st.tire || C_RUBBER);
  const hub = st.rim === 'mag' || st.rim === 'chrome' ? [M_CHROME, C_CHROME] : [M_PAINT, st.rimCol || 0x202022];
  for (const s of [-1, 1]) mb.geo(hub[0], cylGeo(ri * 0.95, ri * 0.95, 0.02, 10), mat4(s * hw * 0.75, 0, 0, 0, 0, -Math.PI / 2), hub[1]);
  return mb.buildMerged([[M_PAINT, M_CHROME, M_TRIM]]);
}
