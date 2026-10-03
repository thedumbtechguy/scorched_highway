import * as THREE from 'three';
import { isTouch } from './util.js';

// ================= renderer & scene =================
export const renderer = new THREE.WebGLRenderer({ antialias: !isTouch, powerPreference: 'high-performance' });
renderer.setClearColor(0x2a1838);
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('stage').appendChild(renderer.domElement);
export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(62, 1, 0.3, 2400);
scene.fog = new THREE.Fog(0xe89a5c, 130, 560);

export const hemi = new THREE.HemisphereLight(0x86b4c0, 0x7a3b26, 0.6); scene.add(hemi);
export const sun = new THREE.DirectionalLight(0xffb070, 1.1);
sun.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
{ const sc = sun.shadow.camera; sc.left = -75; sc.right = 75; sc.top = 75; sc.bottom = -75; sc.near = 10; sc.far = 420; }
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.06;
scene.add(sun); scene.add(sun.target);
export const sunDir = new THREE.Vector3(-0.8, 0.2, 0.55).normalize();
export const headSpot = new THREE.SpotLight(0xfff0c8, 0, 85, 0.55, 0.55, 1);
scene.add(headSpot); scene.add(headSpot.target);
const boomLights = [];
for (let i = 0; i < 2; i++) { const l = new THREE.PointLight(0xffa040, 0, 45, 2); scene.add(l); boomLights.push({ l, t: 0, i0: 0 }); }
let boomIdx = 0;
export function flashLight(x, y, z, power) {
  const b = boomLights[boomIdx]; boomIdx = (boomIdx + 1) % boomLights.length;
  b.l.position.set(x, y + 2, z); b.i0 = power; b.t = 0.35; b.l.intensity = power;
}
export function updateLights(dt) {
  for (const b of boomLights) { if (b.t > 0) { b.t -= dt; b.l.intensity = Math.max(0, b.i0 * (b.t / 0.35)); } else b.l.intensity = 0; }
}
