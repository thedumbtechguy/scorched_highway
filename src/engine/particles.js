import * as THREE from 'three';
import { scene } from './renderer.js';

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
export const PSYS = [];
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
export const FX_ADD = new Particles(1400, true);
export const FX_SMOKE = new Particles(1600, false);
export let fxScale = 1; // reduced on low quality
export function setFxScale(v) { fxScale = v; }
