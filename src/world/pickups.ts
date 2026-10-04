import * as THREE from 'three';
import { FX_ADD, fxScale } from '../engine/particles.js';
import { addToScene } from '../engine/renderer.js';
import { TAU, pick, rand, srand } from '../engine/util.js';
import { ground } from './terrain.js';
import { CRATE_AMMO } from '../combat/arsenal';
import { drawGlyph, rrect } from './glyphs';

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
// Every pickup type gets a cell in two atlases: the badge that floats over it and the panel painted on its crate.
const TYPES = Object.keys(PICK);
function atlas(cell: number, paint: (x: CanvasRenderingContext2D, type: string) => void): THREE.CanvasTexture {
  const cv = document.createElement('canvas'); cv.width = cell * TYPES.length; cv.height = cell; const x = cv.getContext('2d')!;
  TYPES.forEach((type, i) => { x.save(); x.translate(i * cell, 0); paint(x, type); x.restore(); });
  const t = new THREE.CanvasTexture(cv); t.anisotropy = 4; return t;
}
/** Floating badge: dark disc, coloured ring, glyph in the pickup's colour. */
const badgeAtlas = () => atlas(128, (x, type) => {
  const d = PICK[type];
  x.shadowColor = 'rgba(0,0,0,.55)'; x.shadowBlur = 8; x.shadowOffsetY = 3;
  x.fillStyle = 'rgba(30,17,42,.92)'; x.beginPath(); x.arc(64, 62, 54, 0, TAU); x.fill();
  x.shadowColor = 'transparent';
  x.lineWidth = 8; x.strokeStyle = d.css; x.beginPath(); x.arc(64, 62, 50, 0, TAU); x.stroke();
  x.translate(24, 22); drawGlyph(x, type, 80, d.css, 'rgba(30,17,42,.95)');
});
/** Crate face: riveted steel frame around a panel in the pickup's colour, with its glyph stencilled in dark. */
const crateAtlas = () => atlas(256, (x, type) => {
  const d = PICK[type];
  const g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, '#4a4048'); g.addColorStop(1, '#2c2430');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  x.strokeStyle = 'rgba(255,255,255,.18)'; x.lineWidth = 4; x.strokeRect(4, 4, 248, 248);
  rrect(x, 30, 30, 196, 196, 18); x.fillStyle = d.css; x.fill();
  rrect(x, 30, 30, 196, 196, 18); x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 6; x.stroke();
  const shine = x.createLinearGradient(0, 30, 0, 226); shine.addColorStop(0, 'rgba(255,255,255,.28)'); shine.addColorStop(0.5, 'rgba(255,255,255,0)');
  rrect(x, 30, 30, 196, 196, 18); x.fillStyle = shine; x.fill();
  for (const [cx, cy] of [[16, 16], [240, 16], [16, 240], [240, 240]]) { x.fillStyle = '#7a7078'; x.beginPath(); x.arc(cx, cy, 7, 0, TAU); x.fill(); x.fillStyle = '#2a2228'; x.beginPath(); x.arc(cx - 1, cy - 1, 3, 0, TAU); x.fill(); }
  x.translate(48, 48); drawGlyph(x, type, 160, 'rgba(30,17,42,.92)', d.css);
});
const W_POOL = ['missile', 'rockets', 'mortar', 'mines', 'flame', 'missile', 'rockets', 'special'];
export interface Pickup { x: number; z: number; y: number; pool: string[]; type: string; active: boolean; visible: boolean; respawn: number; ph: number; i: number }
export const PICKUPS: Pickup[] = [];
const PICK_SPOTS: Array<[number, number, string[]]> = [
  [0, 0, ['repair']], [-120, -20, ['repair']], [130, 60, ['repair']],
  [-38, 3, W_POOL], [36, -3, W_POOL], [4, 28, W_POOL], [-14, -32, W_POOL],
  [-80, -80, W_POOL], [-140, 40, W_POOL], [-60, 80, W_POOL], [10, 80, W_POOL], [80, 20, W_POOL], [120, -40, W_POOL],
  [40, -80, W_POOL], [-20, -122, W_POOL], [-100, 130, W_POOL], [90, -110, W_POOL], [150, -10, ['special', 'rockets']], [-150, -40, ['special', 'mortar']],
];
// Every pickup's crate, ring, beam and badge are instances of four meshes (4 draw calls for all of them);
// a hidden or collected pickup's instances are collapsed to nothing.
let crates: THREE.InstancedMesh, rings: THREE.InstancedMesh, beams: THREE.InstancedMesh, icons: THREE.InstancedMesh;
let iconIdx: THREE.InstancedBufferAttribute, crateIdx: THREE.InstancedBufferAttribute;
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
  // crates: lit and shadowed like the scenery, each face showing its type's panel from the atlas, with a soft glow
  const crateGeo = new THREE.BoxGeometry(1.5, 1.5, 1.5); crateIdx = new THREE.InstancedBufferAttribute(new Float32Array(n), 1); crateGeo.setAttribute('icon', crateIdx);
  const crateMat = new THREE.MeshLambertMaterial({ map: crateAtlas() });
  crateMat.onBeforeCompile = sh => {
    sh.vertexShader = 'attribute float icon;\n' + sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>\nvUv.x = (vUv.x + icon) / ${TYPES.length}.0;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 0.3;');
  };
  crates = new THREE.InstancedMesh(crateGeo, crateMat, n); crates.castShadow = true;
  const ringGeo = new THREE.RingGeometry(1.9, 2.4, 28); ringGeo.rotateX(-Math.PI / 2);
  rings = new THREE.InstancedMesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }), n);
  // light beams, so pickups can be spotted across the arena: bright at the ground, fading out upwards
  const beamGeo = new THREE.CylinderGeometry(0.45, 0.7, 16, 12, 1, true); beamGeo.translate(0, 8, 0);
  const shade = new Float32Array(beamGeo.attributes.position.count * 3);
  for (let i = 0; i < beamGeo.attributes.position.count; i++) { const k = Math.pow(1 - beamGeo.attributes.position.getY(i) / 16, 2) * 0.55; shade.set([k, k, k], i * 3); }
  beamGeo.setAttribute('color', new THREE.BufferAttribute(shade, 3));
  beams = new THREE.InstancedMesh(beamGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }), n);
  const quad = new THREE.PlaneGeometry(2.6, 2.6); iconIdx = new THREE.InstancedBufferAttribute(new Float32Array(n), 1); quad.setAttribute('icon', iconIdx);
  icons = new THREE.InstancedMesh(quad, new THREE.ShaderMaterial({ uniforms: { map: { value: badgeAtlas() } }, vertexShader: ICON_VS, fragmentShader: ICON_FS, transparent: true, depthWrite: false }), n);
  for (const m of [crates, rings, beams, icons]) { m.frustumCulled = false; addToScene(m, 'pickups'); } // spread over the arena
  PICK_SPOTS.forEach(([x, z, pool], i) => {
    const p: Pickup = { x, z, y: ground(x, z), pool, type: pool[0], active: true, visible: true, respawn: 0, ph: srand() * TAU, i };
    PICKUPS.push(p); setPickupType(p, pool[0]);
  });
  updatePickups(0, 0);
}
const _c = new THREE.Color(), _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
function setPickupType(p: Pickup, type: string) {
  p.type = type; _c.setHex(PICK[type].color);
  rings.setColorAt(p.i, _c); beams.setColorAt(p.i, _c); iconIdx.setX(p.i, TYPES.indexOf(type)); crateIdx.setX(p.i, TYPES.indexOf(type));
  rings.instanceColor!.needsUpdate = true; beams.instanceColor!.needsUpdate = true; iconIdx.needsUpdate = true; crateIdx.needsUpdate = true;
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
    if (!p.active || !p.visible) { for (const m of [crates, rings, beams, icons]) m.setMatrixAt(p.i, ZERO); continue; }
    const bob = Math.sin(t * 2.4 + p.ph) * 0.25, s = 1 + 0.12 * Math.sin(t * 4 + p.ph);
    crates.setMatrixAt(p.i, _m.compose(_p.set(p.x, p.y + 1.4 + bob, p.z), _q.setFromEuler(_e.set(Math.sin(t * 1.3 + p.ph) * 0.25, t * 1.6 + p.ph, 0)), _s.setScalar(1)));
    rings.setMatrixAt(p.i, _m.compose(_p.set(p.x, p.y + 0.25, p.z), _q.identity(), _s.setScalar(s)));
    beams.setMatrixAt(p.i, _m.compose(_p.set(p.x, p.y, p.z), _q.identity(), _s.set(1, 1 + 0.08 * Math.sin(t * 3 + p.ph), 1)));
    icons.setMatrixAt(p.i, _m.compose(_p.set(p.x, p.y + 3.6 + bob, p.z), _q.identity(), _s.setScalar(1)));
  }
  for (const m of [crates, rings, beams, icons]) m.instanceMatrix.needsUpdate = true;
}
export function nearestPickup(c, filter, maxD) {
  let best = null, bd = maxD * maxD;
  for (const p of PICKUPS) { if (!filter(p)) continue; const dx = p.x - c.x, dz = p.z - c.z, d2 = dx * dx + dz * dz; if (d2 < bd) { bd = d2; best = p; } }
  return best;
}
