import * as THREE from 'three';
import { FX_ADD, fxScale } from '../engine/particles.js';
import { addToScene } from '../engine/renderer.js';
import { TAU, pick, rand, srand } from '../engine/util.js';
import { ground } from './terrain.js';
import { CRATE_AMMO } from '../combat/arsenal';

// ================= pickups =================
export const PICK: Record<string, { color: number; css: string; amt: number; label: string }> = {
  missile: { color: 0xe8433a, css: '#e8433a', amt: CRATE_AMMO.missile, label: 'Homing missiles' },
  rockets: { color: 0xff9a3c, css: '#ff9a3c', amt: CRATE_AMMO.rockets, label: 'Rocket pods' },
  mortar: { color: 0x2fb5b0, css: '#2fb5b0', amt: CRATE_AMMO.mortar, label: 'Mortar' },
  mines: { color: 0xf4cf3a, css: '#f4cf3a', amt: CRATE_AMMO.mines, label: 'Mines' },
  flame: { color: 0xff5a2a, css: '#ff5a2a', amt: CRATE_AMMO.flame, label: 'Torch' },
  repair: { color: 0x5fd068, css: '#5fd068', amt: 55, label: 'Repair' },
  special: { color: 0x9b6bff, css: '#9b6bff', amt: 2, label: 'Special ammo' },
};
export function drawGlyph(ctx: CanvasRenderingContext2D, type: string, s: number, color: string) {
  ctx.save(); ctx.translate(s / 2, s / 2); const k = s / 100;
  ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = 9 * k; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const P = (pts: number[]) => { ctx.beginPath(); ctx.moveTo(pts[0] * k, pts[1] * k); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i] * k, pts[i + 1] * k); ctx.closePath(); ctx.fill(); };
  switch (type) {
    case 'missile':
      ctx.rotate(Math.PI / 4);
      ctx.beginPath(); ctx.moveTo(0, -40 * k); ctx.quadraticCurveTo(13 * k, -24 * k, 11 * k, 18 * k); ctx.lineTo(-11 * k, 18 * k); ctx.quadraticCurveTo(-13 * k, -24 * k, 0, -40 * k); ctx.fill();
      P([-11, 4, -24, 26, -11, 20]); P([11, 4, 24, 26, 11, 20]); ctx.globalAlpha = 0.7; P([-6, 22, 0, 40, 6, 22]); break;
    case 'rockets':
      for (const x of [-22, 0, 22]) { const y = x ? 8 : -4; P([x, y - 34, x + 8, y - 22, x + 8, y + 24, x - 8, y + 24, x - 8, y - 22]); ctx.globalAlpha = 0.7; P([x - 5, y + 28, x, y + 40, x + 5, y + 28]); ctx.globalAlpha = 1; }
      break;
    case 'mortar':
      ctx.beginPath(); ctx.arc(14 * k, 14 * k, 18 * k, 0, TAU); ctx.fill();
      ctx.setLineDash([8 * k, 9 * k]); ctx.lineWidth = 7 * k; ctx.beginPath(); ctx.moveTo(-38 * k, 34 * k); ctx.quadraticCurveTo(-30 * k, -40 * k, 2 * k, -6 * k); ctx.stroke(); break;
    case 'mines':
      ctx.beginPath(); ctx.arc(0, 0, 22 * k, 0, TAU); ctx.fill();
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 18 * k, Math.sin(a) * 18 * k); ctx.lineTo(Math.cos(a) * 36 * k, Math.sin(a) * 36 * k); ctx.stroke(); } break;
    case 'flame':
      ctx.beginPath(); ctx.moveTo(0, -40 * k); ctx.bezierCurveTo(30 * k, -10 * k, 32 * k, 20 * k, 0, 38 * k); ctx.bezierCurveTo(-32 * k, 20 * k, -26 * k, -8 * k, -8 * k, -16 * k); ctx.bezierCurveTo(-8 * k, -2 * k, 2 * k, -8 * k, 0, -40 * k); ctx.fill(); break;
    case 'repair':
      P([-10, -36, 10, -36, 10, -10, 36, -10, 36, 10, 10, 10, 10, 36, -10, 36, -10, 10, -36, 10, -36, -10, -10, -10]); break;
    case 'special': {
      ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * TAU - Math.PI / 2, r = (i % 2 ? 17 : 40) * k; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fill(); break;
    }
    case 'mg':
      for (const x of [-14, 14]) { ctx.beginPath(); ctx.moveTo(x * k, -34 * k); ctx.quadraticCurveTo((x + 10) * k, -22 * k, (x + 10) * k, -6 * k); ctx.lineTo((x + 10) * k, 32 * k); ctx.lineTo((x - 10) * k, 32 * k); ctx.lineTo((x - 10) * k, -6 * k); ctx.quadraticCurveTo((x - 10) * k, -22 * k, x * k, -34 * k); ctx.fill(); } break;
  }
  ctx.restore();
}
// icons for all pickup types in one atlas, one cell per type
const TYPES = Object.keys(PICK);
function iconAtlas(): THREE.CanvasTexture {
  const cv = document.createElement('canvas'); cv.width = 128 * TYPES.length; cv.height = 128; const x = cv.getContext('2d')!;
  TYPES.forEach((type, i) => {
    const d = PICK[type]; x.save(); x.translate(i * 128, 0);
    x.fillStyle = 'rgba(42,24,56,0.9)'; x.beginPath(); x.arc(64, 64, 58, 0, TAU); x.fill();
    x.lineWidth = 8; x.strokeStyle = d.css; x.beginPath(); x.arc(64, 64, 54, 0, TAU); x.stroke();
    x.translate(22, 22); drawGlyph(x, type, 84, d.css); x.restore();
  });
  return new THREE.CanvasTexture(cv);
}
const W_POOL = ['missile', 'rockets', 'mortar', 'mines', 'flame', 'missile', 'rockets', 'special'];
export interface Pickup { x: number; z: number; y: number; pool: string[]; type: string; active: boolean; visible: boolean; respawn: number; ph: number; i: number }
export const PICKUPS: Pickup[] = [];
const PICK_SPOTS: Array<[number, number, string[]]> = [
  [0, 0, ['repair']], [-120, -20, ['repair']], [130, 60, ['repair']],
  [-38, 3, W_POOL], [36, -3, W_POOL], [4, 28, W_POOL], [-14, -32, W_POOL],
  [-80, -80, W_POOL], [-140, 40, W_POOL], [-60, 80, W_POOL], [10, 80, W_POOL], [80, 20, W_POOL], [120, -40, W_POOL],
  [40, -80, W_POOL], [-20, -122, W_POOL], [-100, 130, W_POOL], [90, -110, W_POOL], [150, -10, ['special', 'rockets']], [-150, -40, ['special', 'mortar']],
];
// Every pickup's crate, ring and icon are instances of three meshes (3 draw calls for all of them);
// a hidden or collected pickup's instances are collapsed to nothing.
let crates: THREE.InstancedMesh, rings: THREE.InstancedMesh, icons: THREE.InstancedMesh, iconIdx: THREE.InstancedBufferAttribute;
const ICON_VS = `
attribute float icon; varying vec2 vUv;
void main() {
  vUv = vec2((uv.x + icon) / ${TYPES.length}.0, uv.y);
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xy += position.xy * length(instanceMatrix[0].xyz); // camera-facing quad, scaled with the instance
  gl_Position = projectionMatrix * mv;
}`;
const ICON_FS = `
uniform sampler2D map; varying vec2 vUv;
void main() { vec4 c = texture2D(map, vUv); if (c.a < 0.02) discard; gl_FragColor = c; }`;
export function buildPickups() {
  const n = PICK_SPOTS.length;
  const crateMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  crateMat.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor * 0.25;'); }; // glow in its own colour
  crates = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), crateMat, n); crates.castShadow = true;
  const ringGeo = new THREE.RingGeometry(1.9, 2.4, 28); ringGeo.rotateX(-Math.PI / 2);
  rings = new THREE.InstancedMesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), n);
  const quad = new THREE.PlaneGeometry(2.3, 2.3); iconIdx = new THREE.InstancedBufferAttribute(new Float32Array(n), 1); quad.setAttribute('icon', iconIdx);
  icons = new THREE.InstancedMesh(quad, new THREE.ShaderMaterial({ uniforms: { map: { value: iconAtlas() } }, vertexShader: ICON_VS, fragmentShader: ICON_FS, transparent: true, depthWrite: false }), n);
  for (const m of [crates, rings, icons]) { m.frustumCulled = false; addToScene(m, 'pickups'); } // spread over the arena
  PICK_SPOTS.forEach(([x, z, pool], i) => {
    const p: Pickup = { x, z, y: ground(x, z), pool, type: pool[0], active: true, visible: true, respawn: 0, ph: srand() * TAU, i };
    PICKUPS.push(p); setPickupType(p, pool[0]);
  });
  updatePickups(0, 0);
}
const _c = new THREE.Color(), _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
function setPickupType(p: Pickup, type: string) {
  p.type = type; _c.setHex(PICK[type].color);
  crates.setColorAt(p.i, _c); rings.setColorAt(p.i, _c); iconIdx.setX(p.i, TYPES.indexOf(type));
  crates.instanceColor!.needsUpdate = true; rings.instanceColor!.needsUpdate = true; iconIdx.needsUpdate = true;
}
export function resetPickups() {
  for (const p of PICKUPS) { setPickupType(p, pick(p.pool)); p.active = true; p.visible = true; p.respawn = 0; }
}
export function updatePickups(dt: number, t: number) {
  for (const p of PICKUPS) {
    if (!p.active) {
      p.respawn -= dt;
      if (p.respawn <= 0) { setPickupType(p, pick(p.pool)); p.active = true; p.visible = true; for (let i = 0; i < 10 * fxScale; i++) FX_ADD.spawn(p.x, p.y + 1.4, p.z, rand(-4, 4), rand(2, 7), rand(-4, 4), 0.6, 0.8, 0.1, PICK[p.type].color, 0xffffff, 0.9, 1, 4); }
    }
    if (!p.active || !p.visible) { crates.setMatrixAt(p.i, ZERO); rings.setMatrixAt(p.i, ZERO); icons.setMatrixAt(p.i, ZERO); continue; }
    const bob = Math.sin(t * 2.4 + p.ph) * 0.25, s = 1 + 0.12 * Math.sin(t * 4 + p.ph);
    crates.setMatrixAt(p.i, _m.compose(_p.set(p.x, p.y + 1.4 + bob, p.z), _q.setFromEuler(_e.set(Math.sin(t * 1.3 + p.ph) * 0.25, t * 1.6 + p.ph, 0)), _s.setScalar(1)));
    rings.setMatrixAt(p.i, _m.compose(_p.set(p.x, p.y + 0.25, p.z), _q.identity(), _s.setScalar(s)));
    icons.setMatrixAt(p.i, _m.compose(_p.set(p.x, p.y + 3.4 + bob, p.z), _q.identity(), _s.setScalar(1)));
  }
  for (const m of [crates, rings, icons]) m.instanceMatrix.needsUpdate = true;
}
export function nearestPickup(c, filter, maxD) {
  let best = null, bd = maxD * maxD;
  for (const p of PICKUPS) { if (!filter(p)) continue; const dx = p.x - c.x, dz = p.z - c.z, d2 = dx * dx + dz * dz; if (d2 < bd) { bd = d2; best = p; } }
  return best;
}
