import * as THREE from 'three';
import { fog, hemi, renderer, scene, sun, sunDir } from './renderer.js';
import { TAU, srand } from './util.js';

// sky dome
const SKY_R = 1700;
const skyGeo = new THREE.SphereGeometry(SKY_R, 32, 20);
skyGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(skyGeo.attributes.position.count * 3), 3));
export const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
sky.renderOrder = -10; scene.add(sky);
function paintSky(top, mid, hor, below) {
  const cT = new THREE.Color(top), cM = new THREE.Color(mid), cH = new THREE.Color(hor), cB = new THREE.Color(below), c = new THREE.Color();
  const pos = skyGeo.attributes.position, col = skyGeo.attributes.color;
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / SKY_R;
    if (t > 0.3) c.copy(cM).lerp(cT, Math.pow((t - 0.3) / 0.7, 0.8));
    else if (t > 0) c.copy(cH).lerp(cM, t / 0.3);
    else c.copy(cH).lerp(cB, Math.min(1, -t * 6));
    col.setXYZ(i, c.r, c.g, c.b);
  }
  col.needsUpdate = true;
}
export function glowTexture(inner, outer) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const x = cv.getContext('2d');
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, inner); g.addColorStop(0.22, inner); g.addColorStop(0.3, outer); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256); return new THREE.CanvasTexture(cv);
}
export const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,236,190,1)', 'rgba(255,170,90,0.35)'), blending: THREE.AdditiveBlending, fog: false, depthWrite: false, transparent: true }));
sunSprite.scale.set(360, 360, 1); sunSprite.renderOrder = -9; scene.add(sunSprite);
// stars
export const stars = (() => {
  const n = 700, p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = srand(), v = srand() * 0.9 + 0.08; const th = u * TAU, ph = Math.acos(v);
    p[i * 3] = Math.sin(ph) * Math.cos(th) * 1500; p[i * 3 + 1] = Math.cos(ph) * 1500; p[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * 1500;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const s = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xfff6e0, size: 2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85, depthWrite: false }));
  s.renderOrder = -8; s.visible = false; scene.add(s); return s;
})();

const TOD = {
  noon: { top: 0x2f8fb5, mid: 0x8cc9d8, hor: 0xf1d9a8, below: 0xd9b27c, fog: 0xe8d2a6, fogNear: 170, fogFar: 640, hemiSky: 0xcfe8f0, hemiGround: 0xb07844, hemiI: 0.62, sunC: 0xfff1d6, sunI: 0.95, dir: [0.35, 0.9, 0.25], spr: 0xfff4d0, sprS: 220, night: false },
  sunset: { top: 0x1d4f66, mid: 0xd8703c, hor: 0xf6b25a, below: 0xc4683a, fog: 0xe89a5c, fogNear: 140, fogFar: 580, hemiSky: 0x8fbcc6, hemiGround: 0x7a3b26, hemiI: 0.62, sunC: 0xffb070, sunI: 1.15, dir: [-0.8, 0.2, 0.55], spr: 0xffc070, sprS: 380, night: false },
  night: { top: 0x070a24, mid: 0x1f1845, hor: 0x4a2c5c, below: 0x221732, fog: 0x2b2045, fogNear: 70, fogFar: 420, hemiSky: 0x5a6aaa, hemiGround: 0x2a1a2a, hemiI: 0.5, sunC: 0xa9b8ff, sunI: 0.4, dir: [0.3, 0.8, -0.5], spr: 0xdfe6ff, sprS: 90, night: true },
};
export let curTod = TOD.sunset;
const todListeners = []; // called with the new time of day after applyTod
export function onTod(fn) { todListeners.push(fn); }
export function applyTod(name) {
  const t = TOD[name] || TOD.sunset; curTod = t;
  paintSky(t.top, t.mid, t.hor, t.below);
  fog.color.setHex(t.fog); fog.near = t.fogNear; fog.far = t.fogFar;
  renderer.setClearColor(t.fog);
  hemi.color.setHex(t.hemiSky); hemi.groundColor.setHex(t.hemiGround); hemi.intensity = t.hemiI;
  sun.color.setHex(t.sunC); sun.intensity = t.sunI;
  sunDir.set(t.dir[0], t.dir[1], t.dir[2]).normalize();
  sunSprite.material.color.setHex(t.spr); sunSprite.scale.set(t.sprS, t.sprS, 1);
  stars.visible = t.night;
  for (const fn of todListeners) fn(t);
}
