// Plates: pads set into the road that do something to whoever drives over them first (Death Race style).
// A plate goes dark when it's taken and lights up again a few seconds later. What each type does is up to the
// mode (see modes/plates.ts); this module draws them and says which car has just driven over which plate.
// Every plate of every map is one instance of two meshes: the plate face and its glow.
import * as THREE from 'three';
import { addToScene } from '../engine/renderer.js';
import { TAU } from '../engine/util.js';
import { drawGlyph, rrect } from './glyphs';
import { ground } from './terrain.js';

export type PlateType = 'sword' | 'shield' | 'skull';
export const PLATE: Record<PlateType, { color: number; css: string; label: string }> = {
  sword: { color: 0xe8433a, css: '#e8433a', label: 'Sword' },
  shield: { color: 0x3aa8f0, css: '#3aa8f0', label: 'Shield' },
  skull: { color: 0xf6ead4, css: '#f6ead4', label: 'Skull' },
};
const TYPES = Object.keys(PLATE) as PlateType[];
/** Plate size: across the road and along it, in metres. */
export const PLATE_W = 4.4, PLATE_L = 3.6;
/** Seconds a taken plate stays dark, by type: skulls take longest, so hazards stay an event. */
export const PLATE_REARM: Record<PlateType, number> = { sword: 6, shield: 10, skull: 25 };

/** Where a plate goes: position, the road's heading there, and its type. `tag` is free for the map (bots use it). */
export interface PlateSpot { x: number; z: number; yaw: number; type: PlateType; tag?: unknown }
export interface Plate extends PlateSpot { y: number; armed: boolean; t: number; i: number }
/** Every plate on every built map. */
export const PLATES: Plate[] = [];
let face: THREE.InstancedMesh | null = null, glow: THREE.InstancedMesh | null = null;
const MAX = 64;

function atlas() {
  const cell = 128, cv = document.createElement('canvas'); cv.width = cell * TYPES.length; cv.height = cell; const x = cv.getContext('2d')!;
  TYPES.forEach((type, i) => {
    const d = PLATE[type]; x.save(); x.translate(i * cell, 0);
    x.fillStyle = '#2a2026'; x.fillRect(0, 0, cell, cell);
    rrect(x, 8, 8, cell - 16, cell - 16, 14); x.fillStyle = '#3c3036'; x.fill(); x.lineWidth = 6; x.strokeStyle = d.css; x.stroke();
    for (const [cx, cy] of [[18, 18], [110, 18], [18, 110], [110, 110]]) { x.fillStyle = '#8a7c80'; x.beginPath(); x.arc(cx, cy, 4, 0, TAU); x.fill(); }
    x.translate(24, 24); drawGlyph(x, type, 80, d.css, '#3c3036'); x.restore();
  });
  const t = new THREE.CanvasTexture(cv); t.anisotropy = 4; return t;
}
const VS = `
attribute float icon; varying vec2 vUv; varying vec3 vCol;
void main() {
  vUv = vec2((uv.x + icon) / ${TYPES.length}.0, uv.y);
  vCol = instanceColor;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;
const FS = `
uniform sampler2D map; varying vec2 vUv; varying vec3 vCol;
void main() { gl_FragColor = vec4(texture2D(map, vUv).rgb * vCol * 1.25, 1.0); }`;

function meshes() {
  if (face) return;
  const g = new THREE.PlaneGeometry(PLATE_W, PLATE_L); g.rotateX(-Math.PI / 2);
  // turn the face round so its glyph reads upright to a driver coming at it
  const uv = g.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setXY(i, 1 - uv.getX(i), 1 - uv.getY(i));
  const icon = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1); g.setAttribute('icon', icon);
  face = new THREE.InstancedMesh(g, new THREE.ShaderMaterial({ uniforms: { map: { value: atlas() } }, vertexShader: VS, fragmentShader: FS, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), MAX);
  face.setColorAt(0, new THREE.Color(1, 1, 1)); face.count = 0; face.frustumCulled = false; face.receiveShadow = false;
  const gg = new THREE.PlaneGeometry(PLATE_W + 2.4, PLATE_L + 2.4); gg.rotateX(-Math.PI / 2);
  const gc = document.createElement('canvas'); gc.width = gc.height = 64; const x = gc.getContext('2d')!, rg = x.createRadialGradient(32, 32, 8, 32, 32, 32);
  rg.addColorStop(0, 'rgba(255,255,255,0.9)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = rg; x.fillRect(0, 0, 64, 64);
  glow = new THREE.InstancedMesh(gg, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(gc), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), MAX);
  glow.setColorAt(0, new THREE.Color(1, 1, 1)); glow.count = 0; glow.frustumCulled = false;
  addToScene(glow, 'pickups'); addToScene(face, 'pickups');
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _up = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3(), _p = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1), _c = new THREE.Color();
/** Lay a map's plates into the road. */
export function buildPlates(spots: PlateSpot[]) {
  meshes();
  for (const s of spots) {
    const i = PLATES.length; if (i >= MAX) break;
    // follow the slope of the road under the plate
    const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw), h = PLATE_L / 2, w = PLATE_W / 2;
    const y = ground(s.x, s.z), dF = ground(s.x + fx * h, s.z + fz * h) - ground(s.x - fx * h, s.z - fz * h), dR = ground(s.x + fz * w, s.z - fx * w) - ground(s.x - fz * w, s.z + fx * w);
    _f.set(fx * 2 * h, dF, fz * 2 * h).normalize(); _r.set(fz * 2 * w, dR, -fx * 2 * w).normalize(); _up.crossVectors(_f, _r).normalize(); if (_up.y < 0) _up.negate();
    _r.crossVectors(_up, _f).normalize();
    _m.makeBasis(_r, _up, _f); _q.setFromRotationMatrix(_m);
    _m.compose(_p.set(s.x, y + 0.16, s.z), _q, _one); // above the road ribbon
    face!.setMatrixAt(i, _m); glow!.setMatrixAt(i, _m);
    (face!.geometry.attributes.icon as THREE.BufferAttribute).setX(i, TYPES.indexOf(s.type));
    PLATES.push({ ...s, y, armed: true, t: 0, i });
  }
  face!.count = glow!.count = PLATES.length;
  face!.instanceMatrix.needsUpdate = glow!.instanceMatrix.needsUpdate = true; face!.geometry.attributes.icon.needsUpdate = true;
  paint();
}
function paint() {
  for (const p of PLATES) {
    face!.setColorAt(p.i, p.armed ? _c.setRGB(1, 1, 1) : _c.setRGB(0.35, 0.33, 0.33));
    glow!.setColorAt(p.i, p.armed ? _c.setHex(PLATE[p.type].color) : _c.setRGB(0, 0, 0));
  }
  if (face) { face.instanceColor!.needsUpdate = true; glow!.instanceColor!.needsUpdate = true; }
}
export function resetPlates() { for (const p of PLATES) { p.armed = true; p.t = 0; } if (face) paint(); }
/** Re-arm plates whose time is up; the glow breathes. */
export function updatePlates(dt: number, time: number) {
  let changed = false;
  for (const p of PLATES) if (!p.armed && (p.t -= dt) <= 0) { p.armed = true; changed = true; }
  if (changed) paint();
  if (glow) (glow.material as THREE.MeshBasicMaterial).opacity = 0.55 + 0.35 * Math.sin(time * 5);
}
/** The armed plate a car at (x, y, z) is on, if any; it goes dark. */
export function takePlate(x: number, y: number, z: number): Plate | null {
  for (const p of PLATES) {
    if (!p.armed || Math.abs(y - p.y) > 2.5) continue;
    const dx = x - p.x, dz = z - p.z, fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    if (Math.abs(dx * fx + dz * fz) < PLATE_L / 2 + 1 && Math.abs(dx * fz - dz * fx) < PLATE_W / 2 + 0.6) { p.armed = false; p.t = PLATE_REARM[p.type]; paint(); return p; }
  }
  return null;
}
