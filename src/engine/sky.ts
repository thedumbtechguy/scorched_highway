// Sky dome (gradient, sun or moon, drifting clouds), stars, and the time-of-day presets that
// drive lights and fog. Listeners registered with onTod() re-tune themselves on every change.
import * as THREE from 'three';
import { addToScene, fog, hemi, renderer, sun, sunDir } from './renderer.js';
import { TAU, srand } from './util.js';

export interface TimeOfDay {
  name: string; night: boolean;
  top: number; mid: number; hor: number; below: number; // sky gradient
  fog: number; fogNear: number; fogFar: number;
  hemiSky: number; hemiGround: number; hemiI: number; sunC: number; sunI: number; dir: [number, number, number];
  disc: number; discSize: number; glow: number; // sun (or moon) disc colour, angular size, halo strength
  cloudLit: number; cloudShade: number; cover: number; // cloud colours and coverage (0 none .. 1 overcast)
}
const TOD: Record<string, TimeOfDay> = {
  noon: { name: 'noon', night: false, top: 0x2f8fb5, mid: 0x8cc9d8, hor: 0xf1d9a8, below: 0xd9b27c, fog: 0xe8d2a6, fogNear: 170, fogFar: 640, hemiSky: 0xcfe8f0, hemiGround: 0xb07844, hemiI: 0.62, sunC: 0xfff1d6, sunI: 0.95, dir: [0.35, 0.9, 0.25], disc: 0xfff8e8, discSize: 0.9994, glow: 0.35, cloudLit: 0xffffff, cloudShade: 0xb8c8d4, cover: 0.42 },
  sunset: { name: 'sunset', night: false, top: 0x1d4f66, mid: 0xd8703c, hor: 0xf6b25a, below: 0xc4683a, fog: 0xe89a5c, fogNear: 140, fogFar: 580, hemiSky: 0x8fbcc6, hemiGround: 0x7a3b26, hemiI: 0.62, sunC: 0xffb070, sunI: 1.15, dir: [-0.8, 0.2, 0.55], disc: 0xffe0a0, discSize: 0.9988, glow: 1.0, cloudLit: 0xffb87e, cloudShade: 0x8a4a48, cover: 0.48 },
  night: { name: 'night', night: true, top: 0x070a24, mid: 0x1f1845, hor: 0x4a2c5c, below: 0x221732, fog: 0x2b2045, fogNear: 70, fogFar: 420, hemiSky: 0x5a6aaa, hemiGround: 0x2a1a2a, hemiI: 0.5, sunC: 0xa9b8ff, sunI: 0.4, dir: [0.3, 0.8, -0.5], disc: 0xeef0ff, discSize: 0.9996, glow: 0.25, cloudLit: 0x4a4a78, cloudShade: 0x161430, cover: 0.38 },
};

// ---------- dome ----------
const SKY_R = 1700;
const col = (h: number) => new THREE.Color(h);
const skyUniforms = {
  uTop: { value: col(0) }, uMid: { value: col(0) }, uHor: { value: col(0) }, uBelow: { value: col(0) },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uDisc: { value: col(0) }, uDiscSize: { value: 0.999 }, uGlow: { value: 1 }, uGlowCol: { value: col(0) },
  uCloudLit: { value: col(0) }, uCloudShade: { value: col(0) }, uCover: { value: 0.5 }, uTime: { value: 0 }, uNight: { value: 0 },
};
const SKY_VS = `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // pin to the far plane
}`;
const SKY_FS = `
uniform vec3 uTop, uMid, uHor, uBelow, uSunDir, uDisc, uGlowCol, uCloudLit, uCloudShade;
uniform float uDiscSize, uGlow, uCover, uTime, uNight;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  vec3 c = y > 0.3 ? mix(uMid, uTop, pow((y - 0.3) / 0.7, 0.8)) : y > 0.0 ? mix(uHor, uMid, y / 0.3) : mix(uHor, uBelow, min(1.0, -y * 6.0));
  float sd = dot(d, normalize(uSunDir));
  // glow around the sun, stronger near the horizon at sunset
  c += uGlowCol * (pow(max(sd, 0.0), 6.0) * 0.35 + pow(max(sd, 0.0), 60.0) * 0.6) * uGlow;
  // disc (moon gets a darker limb)
  float disc = smoothstep(uDiscSize - 0.00025, uDiscSize + 0.00008, sd);
  c = mix(c, uDisc * (uNight > 0.5 ? 0.9 + 0.1 * noise(d.xz * 900.0) : 1.6), disc);
  // clouds on a virtual plane, fading into the haze at the horizon
  if (y > 0.0) {
    vec2 uv = d.xz / (y + 0.12) * 1.6 + vec2(uTime * 0.006, uTime * 0.0025);
    float n = fbm(uv) * 0.75 + fbm(uv * 3.1 + 5.0) * 0.25;
    float dens = smoothstep(1.0 - uCover, 1.25 - uCover, n) * smoothstep(0.0, 0.18, y);
    float lit = clamp(0.55 + (n - fbm(uv + normalize(uSunDir.xz + 1e-4) * 0.08)) * 4.0, 0.0, 1.0); // brighter on the sun-facing side
    vec3 cc = mix(uCloudShade, uCloudLit, lit);
    cc += uGlowCol * pow(max(sd, 0.0), 12.0) * 0.8 * uGlow * (1.0 - dens * 0.6); // silver lining near the sun
    c = mix(c, cc, dens * 0.92);
  }
  gl_FragColor = vec4(c, 1.0);
}`;
export const sky = new THREE.Mesh(new THREE.SphereGeometry(SKY_R, 48, 24), new THREE.ShaderMaterial({ uniforms: skyUniforms, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false }));
sky.renderOrder = -10; sky.frustumCulled = false; addToScene(sky, 'sky');

export function glowTexture(inner: string, outer: string): THREE.CanvasTexture {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const x = cv.getContext('2d')!;
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, inner); g.addColorStop(0.22, inner); g.addColorStop(0.3, outer); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256); return new THREE.CanvasTexture(cv);
}

// ---------- stars ----------
export const stars = (() => {
  const n = 900, p = new Float32Array(n * 3), c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = srand(), v = srand() * 0.9 + 0.08; const th = u * TAU, ph = Math.acos(v), b = 0.4 + srand() * 0.6, warm = srand() * 0.15;
    p[i * 3] = Math.sin(ph) * Math.cos(th) * 1500; p[i * 3 + 1] = Math.cos(ph) * 1500; p[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * 1500;
    c[i * 3] = b; c[i * 3 + 1] = b * (1 - warm * 0.5); c[i * 3 + 2] = b * (1 - warm);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  const s = new THREE.Points(g, new THREE.PointsMaterial({ vertexColors: true, size: 2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.9, depthWrite: false }));
  s.renderOrder = -8; s.visible = false; addToScene(s, 'sky'); return s;
})();

/** Keep the sky centred on the camera and the clouds drifting. */
export function updateSky(camPos: THREE.Vector3, dt: number) {
  sky.position.copy(camPos); stars.position.copy(camPos);
  skyUniforms.uTime.value += dt;
}

// ---------- time of day ----------
export let curTod: TimeOfDay = TOD.sunset;
const todListeners: Array<(t: TimeOfDay) => void> = []; // called with the new time of day after applyTod
export function onTod(fn: (t: TimeOfDay) => void) { todListeners.push(fn); }
export function applyTod(name: string) {
  const t = TOD[name] || TOD.sunset; curTod = t;
  const u = skyUniforms;
  u.uTop.value.setHex(t.top); u.uMid.value.setHex(t.mid); u.uHor.value.setHex(t.hor); u.uBelow.value.setHex(t.below);
  u.uDisc.value.setHex(t.disc); u.uDiscSize.value = t.discSize; u.uGlow.value = t.glow; u.uGlowCol.value.setHex(t.sunC);
  u.uCloudLit.value.setHex(t.cloudLit); u.uCloudShade.value.setHex(t.cloudShade); u.uCover.value = t.cover; u.uNight.value = t.night ? 1 : 0;
  fog.color.setHex(t.fog); fog.near = t.fogNear; fog.far = t.fogFar;
  renderer.setClearColor(t.fog);
  hemi.color.setHex(t.hemiSky); hemi.groundColor.setHex(t.hemiGround); hemi.intensity = t.hemiI;
  sun.color.setHex(t.sunC); sun.intensity = t.sunI;
  sunDir.set(t.dir[0], t.dir[1], t.dir[2]).normalize(); u.uSunDir.value.copy(sunDir);
  stars.visible = t.night;
  for (const fn of todListeners) fn(t);
}
