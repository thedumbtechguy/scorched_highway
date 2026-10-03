'use strict';
// ================= utilities =================
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
function angDiff(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const srand = mulberry32(1977);
const isTouch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || ('ontouchstart' in window);
function store(k, v) { try { localStorage.setItem('shwy_' + k, JSON.stringify(v)); } catch (e) { } }
function loadStore(k, d) { try { const v = localStorage.getItem('shwy_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
const $ = s => document.querySelector(s);
const GRAV = 34;
const UP = new THREE.Vector3(0, 1, 0);
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _m4 = new THREE.Matrix4(), _q1 = new THREE.Quaternion();

// ================= renderer & scene =================
const renderer = new THREE.WebGLRenderer({ antialias: !isTouch, powerPreference: 'high-performance' });
renderer.setClearColor(0x2a1838);
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('stage').appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.3, 2400);
scene.fog = new THREE.Fog(0xe89a5c, 130, 560);

const hemi = new THREE.HemisphereLight(0x86b4c0, 0x7a3b26, 0.6); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffb070, 1.1);
sun.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
{ const sc = sun.shadow.camera; sc.left = -75; sc.right = 75; sc.top = 75; sc.bottom = -75; sc.near = 10; sc.far = 420; }
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.06;
scene.add(sun); scene.add(sun.target);
const sunDir = new THREE.Vector3(-0.8, 0.2, 0.55).normalize();
const headSpot = new THREE.SpotLight(0xfff0c8, 0, 85, 0.55, 0.55, 1);
scene.add(headSpot); scene.add(headSpot.target);
const boomLights = [];
for (let i = 0; i < 2; i++) { const l = new THREE.PointLight(0xffa040, 0, 45, 2); scene.add(l); boomLights.push({ l, t: 0, i0: 0 }); }
let boomIdx = 0;
function flashLight(x, y, z, power) {
  const b = boomLights[boomIdx]; boomIdx = (boomIdx + 1) % boomLights.length;
  b.l.position.set(x, y + 2, z); b.i0 = power; b.t = 0.35; b.l.intensity = power;
}
function updateLights(dt) {
  for (const b of boomLights) { if (b.t > 0) { b.t -= dt; b.l.intensity = Math.max(0, b.i0 * (b.t / 0.35)); } else b.l.intensity = 0; }
}

// sky dome
const SKY_R = 1700;
const skyGeo = new THREE.SphereGeometry(SKY_R, 32, 20);
skyGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(skyGeo.attributes.position.count * 3), 3));
const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
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
function glowTexture(inner, outer) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const x = cv.getContext('2d');
  const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, inner); g.addColorStop(0.22, inner); g.addColorStop(0.3, outer); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256); return new THREE.CanvasTexture(cv);
}
const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,236,190,1)', 'rgba(255,170,90,0.35)'), blending: THREE.AdditiveBlending, fog: false, depthWrite: false, transparent: true }));
sunSprite.scale.set(360, 360, 1); sunSprite.renderOrder = -9; scene.add(sunSprite);
// stars
const stars = (() => {
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
let curTod = TOD.sunset;
function applyTod(name) {
  const t = TOD[name] || TOD.sunset; curTod = t;
  paintSky(t.top, t.mid, t.hor, t.below);
  scene.fog.color.setHex(t.fog); scene.fog.near = t.fogNear; scene.fog.far = t.fogFar;
  renderer.setClearColor(t.fog);
  hemi.color.setHex(t.hemiSky); hemi.groundColor.setHex(t.hemiGround); hemi.intensity = t.hemiI;
  sun.color.setHex(t.sunC); sun.intensity = t.sunI;
  sunDir.set(t.dir[0], t.dir[1], t.dir[2]).normalize();
  sunSprite.material.color.setHex(t.spr); sunSprite.scale.set(t.sprS, t.sprS, 1);
  stars.visible = t.night;
  if (typeof onTodChanged === 'function') onTodChanged(t);
}

// ================= particles =================
const P_VS = `
attribute vec3 pcolor; attribute float psize; attribute float palpha;
uniform float scale;
varying vec3 vC; varying float vA; varying float vD;
void main(){
  vC = pcolor; vA = palpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vD = -mv.z;
  gl_PointSize = palpha > 0.001 ? psize * scale / max(-mv.z, 0.5) : 0.0;
  gl_Position = projectionMatrix * mv;
}`;
const P_FS = `
uniform vec3 fogCol; uniform float fogNear; uniform float fogFar; uniform float additive;
varying vec3 vC; varying float vA; varying float vD;
void main(){
  vec2 p = gl_PointCoord - 0.5; float d = length(p);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.12, d) * vA;
  float f = smoothstep(fogNear, fogFar, vD);
  vec3 c = vC;
  if (additive > 0.5) { a *= 1.0 - f; } else { c = mix(c, fogCol, f); }
  gl_FragColor = vec4(c, a);
}`;
const PSYS = [];
class Particles {
  constructor(max, additive) {
    this.max = max; this.i = 0; this.dirty = false;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3); this.size = new Float32Array(max); this.alpha = new Float32Array(max);
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('pcolor', this.aCol); g.setAttribute('psize', this.aSize); g.setAttribute('palpha', this.aAlpha);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max); this.c0 = new Float32Array(max * 3); this.c1 = new Float32Array(max * 3);
    this.a0 = new Float32Array(max); this.drag = new Float32Array(max); this.grav = new Float32Array(max);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { scale: { value: 400 }, fogCol: { value: new THREE.Color() }, fogNear: { value: 100 }, fogFar: { value: 500 }, additive: { value: additive ? 1 : 0 } },
      vertexShader: P_VS, fragmentShader: P_FS, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 5 : 4;
    scene.add(this.points); PSYS.push(this);
  }
  spawn(x, y, z, vx, vy, vz, life, s0, s1, c0, c1, a0, drag, grav) {
    const i = this.i; this.i = (i + 1) % this.max; const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life; this.s0[i] = s0; this.s1[i] = s1;
    this.c0[i3] = (c0 >> 16 & 255) / 255; this.c0[i3 + 1] = (c0 >> 8 & 255) / 255; this.c0[i3 + 2] = (c0 & 255) / 255;
    this.c1[i3] = (c1 >> 16 & 255) / 255; this.c1[i3 + 1] = (c1 >> 8 & 255) / 255; this.c1[i3 + 2] = (c1 & 255) / 255;
    this.a0[i] = a0; this.drag[i] = drag || 0; this.grav[i] = grav || 0;
    this.dirty = true;
  }
  clear() { this.life.fill(0); this.alpha.fill(0); this.aAlpha.needsUpdate = true; }
  update(dt) {
    const P = this.pos, V = this.vel, L = this.life;
    let any = false;
    for (let i = 0; i < this.max; i++) {
      let l = L[i];
      if (l <= 0) continue;
      any = true;
      l -= dt; L[i] = l;
      if (l <= 0) { this.alpha[i] = 0; continue; }
      const t = 1 - l / this.maxLife[i], i3 = i * 3;
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      V[i3] *= dr; V[i3 + 1] = V[i3 + 1] * dr - this.grav[i] * dt; V[i3 + 2] *= dr;
      P[i3] += V[i3] * dt; P[i3 + 1] += V[i3 + 1] * dt; P[i3 + 2] += V[i3 + 2] * dt;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      const C0 = this.c0, C1 = this.c1;
      this.col[i3] = C0[i3] + (C1[i3] - C0[i3]) * t; this.col[i3 + 1] = C0[i3 + 1] + (C1[i3 + 1] - C0[i3 + 1]) * t; this.col[i3 + 2] = C0[i3 + 2] + (C1[i3 + 2] - C0[i3 + 2]) * t;
      this.alpha[i] = this.a0[i] * (t < 0.08 ? t / 0.08 : 1 - (t - 0.08) / 0.92);
    }
    if (any || this.dirty) {
      this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.aSize.needsUpdate = true; this.aAlpha.needsUpdate = true; this.dirty = false;
    }
  }
  setUniforms(scale) {
    this.mat.uniforms.scale.value = scale;
    this.mat.uniforms.fogCol.value.copy(scene.fog.color); this.mat.uniforms.fogNear.value = scene.fog.near; this.mat.uniforms.fogFar.value = scene.fog.far;
  }
}
const FX_ADD = new Particles(1400, true);
const FX_SMOKE = new Particles(1600, false);
let fxScale = 1; // reduced on low quality

// ================= debris =================
const debrisGeo = new THREE.BoxGeometry(1, 1, 1);
const DEBRIS = [];
for (let i = 0; i < 70; i++) {
  const m = new THREE.Mesh(debrisGeo, new THREE.MeshLambertMaterial({ color: 0x444444 }));
  m.visible = false; m.castShadow = false; scene.add(m);
  DEBRIS.push({ m, life: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, s: 1 });
}
let debrisIdx = 0;
function spawnDebris(x, y, z, vx, vy, vz, size, color, life) {
  const d = DEBRIS[debrisIdx]; debrisIdx = (debrisIdx + 1) % DEBRIS.length;
  d.m.position.set(x, y, z); d.vx = vx; d.vy = vy; d.vz = vz; d.rx = rand(-10, 10); d.ry = rand(-10, 10);
  d.s = size; d.m.scale.set(size, size * rand(0.4, 1), size * rand(0.5, 1.2)); d.life = life || rand(1.8, 3);
  d.m.material.color.setHex(color); d.m.visible = true;
}
function updateDebris(dt) {
  for (const d of DEBRIS) {
    if (d.life <= 0) continue;
    d.life -= dt; if (d.life <= 0) { d.m.visible = false; continue; }
    const p = d.m.position; d.vy -= GRAV * dt;
    p.x += d.vx * dt; p.y += d.vy * dt; p.z += d.vz * dt;
    const g = ground(p.x, p.z) + d.s * 0.3;
    if (p.y < g) { p.y = g; d.vy *= -0.35; d.vx *= 0.6; d.vz *= 0.6; d.rx *= 0.6; d.ry *= 0.6; }
    d.m.rotation.x += d.rx * dt; d.m.rotation.y += d.ry * dt;
    if (d.life < 0.5) { const k = d.life / 0.5 * d.s; d.m.scale.setScalar(Math.max(0.01, k)); }
  }
}
function clearDebris() { for (const d of DEBRIS) { d.life = 0; d.m.visible = false; } }

// ================= geometry merge helpers =================
const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
};
function cylGeo(rt, rb, h, seg) { const k = 'c' + rt + '_' + rb + '_' + h + '_' + seg; return GEO[k] || (GEO[k] = new THREE.CylinderGeometry(rt, rb, h, seg)); }
function coneGeo(r, h, seg) { const k = 'k' + r + '_' + h + '_' + seg; return GEO[k] || (GEO[k] = new THREE.ConeGeometry(r, h, seg)); }
function sphGeo(r, ws, hs) { const k = 's' + r + '_' + ws + '_' + hs; return GEO[k] || (GEO[k] = new THREE.SphereGeometry(r, ws, hs)); }
function dodecaGeo(r) { const k = 'd' + r; return GEO[k] || (GEO[k] = new THREE.DodecahedronGeometry(r, 0)); }
const _euler = new THREE.Euler(0, 0, 0, 'YXZ'), _pos = new THREE.Vector3(), _scl = new THREE.Vector3();
function mat4(x, y, z, rx, ry, rz, sx, sy, sz) {
  _euler.set(rx || 0, ry || 0, rz || 0, 'YXZ'); _q1.setFromEuler(_euler); _pos.set(x, y, z); _scl.set(sx == null ? 1 : sx, sy == null ? 1 : sy, sz == null ? 1 : sz);
  return new THREE.Matrix4().compose(_pos, _q1, _scl);
}
class PB { // parts builder: merges many primitives into one vertex-coloured geometry
  constructor() { this.parts = []; }
  add(geo, color, m) { this.parts.push({ geo, color, m }); return this; }
  box(w, h, d, color, x, y, z, rx, ry, rz) { return this.add(GEO.box, color, mat4(x, y, z, rx, ry, rz, w, h, d)); }
  cyl(rt, rb, h, seg, color, x, y, z, rx, ry, rz) { return this.add(cylGeo(rt, rb, h, seg), color, mat4(x, y, z, rx, ry, rz)); }
  cone(r, h, seg, color, x, y, z, rx, ry, rz) { return this.add(coneGeo(r, h, seg), color, mat4(x, y, z, rx, ry, rz)); }
  sph(r, color, x, y, z, sx, sy, sz, ws, hs) { return this.add(sphGeo(r, ws || 8, hs || 6), color, mat4(x, y, z, 0, 0, 0, sx, sy, sz)); }
  rock(r, color, x, y, z, ry, sx, sy, sz) { return this.add(dodecaGeo(r), color, mat4(x, y, z, 0.3, ry, 0.2, sx, sy, sz)); }
  build() { return mergeParts(this.parts); }
}
function mergeParts(parts) {
  const geos = []; let count = 0;
  for (const p of parts) {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    g.applyMatrix4(p.m); g.computeVertexNormals();
    geos.push([g, p.color]); count += g.attributes.position.count;
  }
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), col = new Float32Array(count * 3);
  let o = 0; const c = new THREE.Color();
  for (const [g, hex] of geos) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    c.setHex(hex);
    for (let i = 0; i < n; i++) { col[(o + i) * 3] = c.r; col[(o + i) * 3 + 1] = c.g; col[(o + i) * 3 + 2] = c.b; }
    o += n; g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}
const MAT_VC = new THREE.MeshLambertMaterial({ vertexColors: true });
const MAT_VC_BASIC = new THREE.MeshBasicMaterial({ vertexColors: true });

// canvas text texture for signs
function signTexture(text, bg, fg, w, h, font) {
  const cv = document.createElement('canvas'); cv.width = w || 512; cv.height = h || 128; const x = cv.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, cv.width, cv.height);
  x.strokeStyle = fg; x.lineWidth = 6; x.strokeRect(10, 10, cv.width - 20, cv.height - 20);
  x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
  let size = cv.height * 0.58;
  x.font = (font || "400 ") + size + "px Shrikhand, 'Cooper Black', 'Arial Black', serif";
  while (x.measureText(text).width > cv.width - 50 && size > 12) { size -= 4; x.font = (font || "400 ") + size + "px Shrikhand, 'Cooper Black', 'Arial Black', serif"; }
  x.fillText(text, cv.width / 2, cv.height / 2 + size * 0.06);
  const t = new THREE.CanvasTexture(cv); t.anisotropy = 4; return t;
}
