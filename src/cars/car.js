import * as THREE from 'three';
import { playSfx } from '../audio/audio.js';
import { buildCarModel } from './model/build.js';
import { damageCar } from '../combat/damage.js';
import { sparks } from '../combat/effects.js';
import { spawnDebris } from '../engine/debris.js';
import { FX_ADD, FX_SMOKE, fxScale } from '../engine/particles.js';
import { scene } from '../engine/renderer.js';
import { curTod } from '../engine/sky';
import { GRAV, TAU, _m4, _v1, clamp, lerp, rand } from '../engine/util.js';
import { G, shake } from '../game/state.js';
import { pushOut, resolveStatic } from '../world/collision.js';
import { PROPS, breakProp, damageProp } from '../world/props.js';
import { ground } from '../world/terrain.js';

// ================= car physics =================
const _fwd = new THREE.Vector3(), _xAx = new THREE.Vector3(), _nrm = new THREE.Vector3();
export class Car {
  constructor(def, isPlayer) {
    this.def = def; this.isPlayer = isPlayer;
    this.model = buildCarModel(def); this.obj = this.model.group; this.body = this.model.body;
    scene.add(this.obj);
    this.radius = 1.9; this.mass = def.mass; this.up = new THREE.Vector3(0, 1, 0);
    this.input = { throttle: 0, steer: 0, handbrake: false };
    this.speedK = 1; // top-speed scale; AI difficulty lowers it
    this.reset(0, 0, 0);
  }
  reset(x, z, yaw) {
    this.x = x; this.z = z; this.yaw = yaw; this.vx = 0; this.vz = 0; this.vy = 0; this.y = ground(x, z); this.prevG = this.y; this.grounded = true;
    this.hp = this.def.hp; this.alive = true;
    // weapons
    this.ammo = { missile: 0, mortar: 0, mines: 0, flame: 0 }; /** @type {string|null} */ this.weapon = null;
    this.special = 3; this.cdMG = 0; this.cdW = 0; this.cdS = 0; this.gunSide = 1;
    this.flameOn = false; this.mgHeld = false; this.wHeld = false; this.wFire = false; this.wCombo = 0; this.sFire = false;
    // status effects and scoring
    this.boost = 0; this.frozen = 0; this.burning = 0; /** @type {Car|null} */ this.burnBy = null; /** @type {Car|null} */ this.lastHitBy = null;
    this.lastHitTime = -99; this.kills = 0; this.dealt = 0; this.flash = 0; this.place = 0;
    // body motion and visuals
    this.tumble = 0; this.tumbleV = 0; this.tumbleAxis = 0; this.wheelRot = 0; this.steerVis = 0; this.lean = 0; this.pitch = 0; this.lastVF = 0;
    this.smokeT = 0; this.dustT = 0; this.airT = 0; this.deathTime = 0; this.wreckT = 0; this.stuckT = 0; this.resetCd = 0;
    this.input.throttle = 0; this.input.steer = 0; this.input.handbrake = false;
    this.up.set(0, 1, 0);
    this.obj.visible = true; this.model.tint(1, 1, 1); this.model.emit(0, 0, 0);
    for (const w of this.model.wheels) w.pivot.visible = true;
    this.body.rotation.set(0, 0, 0);
    this.syncModel(1);
  }
  get speed() { return Math.hypot(this.vx, this.vz); }
  get fx() { return Math.sin(this.yaw); }
  get fz() { return Math.cos(this.yaw); }
  update(dt) {
    const d = this.def, inp = this.input;
    this.flash = Math.max(0, this.flash - dt * 5);
    if (this.boost > 0) this.boost -= dt; if (this.frozen > 0) this.frozen -= dt; this.resetCd -= dt;
    if (!this.alive) { inp.throttle = 0; inp.steer = 0; inp.handbrake = true; }
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), rx = -fz, rz = fx;
    let vF = this.vx * fx + this.vz * fz, vL = this.vx * rx + this.vz * rz;
    let maxS = d.max * (this.frozen > 0 ? 0.45 : 1) * this.speedK; if (this.boost > 0) maxS *= 1.7;
    if (this.grounded) {
      const thr = inp.throttle;
      if (this.boost > 0) vF += d.accel * 2.4 * dt;
      else if (thr > 0.05) { if (vF < maxS) vF += d.accel * thr * dt * (vF < 0 ? 2.2 : 1); }
      else if (thr < -0.05) { if (vF > 0.5) vF += 44 * thr * dt; else if (vF > -17) vF += d.accel * 0.75 * thr * dt; }
      else vF *= Math.max(0, 1 - 0.7 * dt);
      if (vF > maxS) vF = lerp(vF, maxS, 1 - Math.exp(-3 * dt));
      const gF = ground(this.x + fx, this.z + fz), gB = ground(this.x - fx, this.z - fz);
      vF -= (gF - gB) * 0.5 * GRAV * 0.5 * dt;
      const hb = inp.handbrake;
      vL *= Math.max(0, 1 - (hb ? 1.3 : d.grip) * dt);
      if (hb) vF *= Math.max(0, 1 - (this.alive ? 0.5 : 2.5) * dt);
      const sp = Math.abs(vF);
      const sf = clamp(sp / 7, 0, 1) * (1 - 0.3 * clamp(sp / d.max, 0, 1)) * (hb ? 1.5 : 1) * (this.frozen > 0 ? 0.6 : 1);
      this.yaw -= inp.steer * d.turn * sf * (vF < -0.5 ? -1 : 1) * dt;
      // drift dust
      if (this.alive && (sp > 14 || Math.abs(vL) > 5)) {
        this.dustT -= dt * (sp / 20 + Math.abs(vL) / 6);
        if (this.dustT <= 0) {
          this.dustT = 0.06 / fxScale;
          const bx = this.x - fx * 1.6, bz = this.z - fz * 1.6;
          FX_SMOKE.spawn(bx + rx * rand(-1, 1), this.y + 0.3, bz + rz * rand(-1, 1), -this.vx * 0.1 + rand(-1, 1), rand(0.5, 2), -this.vz * 0.1 + rand(-1, 1), rand(0.7, 1.3), 1, 3.5 + Math.abs(vL) * 0.2, curTod.night ? 0x6a5a6a : 0xd8a878, curTod.night ? 0x4a3a50 : 0xe8c090, Math.abs(vL) > 5 ? 0.5 : 0.28, 1.2, -0.5);
        }
      }
    } else {
      this.yaw -= inp.steer * d.turn * 0.3 * dt;
      vF *= 1 - 0.04 * dt;
    }
    this.vx = fx * vF + rx * vL; this.vz = fz * vF + rz * vL;
    this.accelVis = (vF - this.lastVF) / Math.max(dt, 0.001); this.lastVF = vF;
    // horizontal move with step check
    let nx = this.x + this.vx * dt, nz = this.z + this.vz * dt;
    let impact = 0;
    if (ground(nx, nz) - this.y > 1.3) {
      if (ground(nx, this.z) - this.y <= 1.3) { impact = Math.abs(this.vz); nz = this.z; this.vz *= -0.3; }
      else if (ground(this.x, nz) - this.y <= 1.3) { impact = Math.abs(this.vx); nx = this.x; this.vx *= -0.3; }
      else { impact = this.speed; nx = this.x; nz = this.z; this.vx *= -0.3; this.vz *= -0.3; }
    }
    this.x = nx; this.z = nz;
    impact = Math.max(impact, resolveStatic(this), resolveProps(this));
    if (impact > 22 && this.alive) {
      damageCar(this, (impact - 22) * 0.3, null, 'wall');
      sparks(this.x + fx * 2, this.y + 0.8, this.z + fz * 2, 8);
      playSfx('clank', this.x, this.z, 0.7);
      if (this.isPlayer) shake(this.x, this.z, 0.3);
    }
    // vertical
    const g = ground(this.x, this.z);
    this.vy -= GRAV * dt; this.y += this.vy * dt;
    if (this.y <= g) {
      if (this.airT > 0.35) this.land();
      this.y = g; this.vy = clamp((g - this.prevG) / Math.max(dt, 0.001), -12, 30);
      this.grounded = true; this.airT = 0;
    } else {
      this.grounded = this.y - g < 0.3;
      if (!this.grounded) this.airT += dt;
    }
    this.prevG = g;
    // tumble
    if (!this.grounded) this.tumble += this.tumbleV * dt;
    else if (this.tumble !== 0) { const tgt = Math.round(this.tumble / TAU) * TAU; this.tumble = lerp(this.tumble, tgt, 1 - Math.exp(-14 * dt)); if (Math.abs(this.tumble - tgt) < 0.02) { this.tumble = 0; this.tumbleV = 0; } }
    // orientation
    if (this.grounded) {
      const e = 1.3; const hx = ground(this.x + e, this.z) - ground(this.x - e, this.z), hz = ground(this.x, this.z + e) - ground(this.x, this.z - e);
      _nrm.set(-hx, 2 * e, -hz).normalize(); this.up.lerp(_nrm, 1 - Math.exp(-12 * dt)).normalize();
    } else {
      _nrm.set(0, 1, 0); _nrm.x -= Math.sin(this.yaw) * clamp(this.vy * 0.012, -0.4, 0.4); _nrm.z -= Math.cos(this.yaw) * clamp(this.vy * 0.012, -0.4, 0.4);
      this.up.lerp(_nrm.normalize(), 1 - Math.exp(-2.5 * dt)).normalize();
    }
    // visuals
    const leanT = this.alive && this.grounded ? -inp.steer * clamp(Math.abs(vF) / d.max, 0, 1) * 0.07 : 0;
    this.lean = lerp(this.lean, leanT, 1 - Math.exp(-6 * dt));
    this.pitch = lerp(this.pitch, clamp(-this.accelVis * 0.0025, -0.06, 0.06), 1 - Math.exp(-5 * dt));
    this.wheelRot += vF * dt / 0.48;
    this.steerVis = lerp(this.steerVis, -inp.steer * 0.45, 1 - Math.exp(-10 * dt));
    this.syncModel(dt);
    this.effects(dt);
  }
  land() {
    const hard = -this.vy;
    for (let i = 0; i < 12 * fxScale; i++) FX_SMOKE.spawn(this.x + rand(-2, 2), this.y + 0.2, this.z + rand(-2, 2), rand(-6, 6), rand(0.5, 3), rand(-6, 6), rand(0.7, 1.2), 1.5, 5, curTod.night ? 0x5a4a5a : 0xd8a878, curTod.night ? 0x3a2a40 : 0xe8c090, 0.45, 2, -0.3);
    playSfx('thud', this.x, this.z, clamp(hard / 20, 0.3, 1));
    if (hard > 26 && this.alive) damageCar(this, (hard - 26) * 0.5, null, 'fall');
    if (this.isPlayer) shake(this.x, this.z, clamp(hard / 40, 0.1, 0.5));
  }
  syncModel(dt) {
    _fwd.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const u = this.up; _fwd.addScaledVector(u, -_fwd.dot(u)).normalize();
    _xAx.crossVectors(u, _fwd).normalize();
    _m4.makeBasis(_xAx, u, _fwd); this.obj.quaternion.setFromRotationMatrix(_m4);
    this.obj.position.set(this.x, this.y, this.z);
    this.body.rotation.set(this.pitch + (this.tumbleAxis === 0 ? this.tumble : 0), 0, this.lean + (this.tumbleAxis === 1 ? this.tumble : 0));
    this.body.position.y = 0.04 * Math.sin(this.wheelRot * 0.37) * (this.grounded ? clamp(this.speed / 30, 0, 1) : 0);
    for (const w of this.model.wheels) { w.mesh.rotation.x = this.wheelRot * 0.48 / w.r; if (w.front) w.pivot.rotation.y = this.steerVis; }
  }
  effects(dt) {
    const hpF = this.hp / this.def.hp;
    // flash / freeze tint
    const md = this.model;
    if (this.frozen > 0) md.emit(0.15 + this.flash, 0.35 + this.flash, 0.6 + this.flash);
    else if (this.burning > 0) md.emit(0.35 + this.flash, 0.12 + this.flash, 0.02 + this.flash);
    else md.emit(this.flash, this.flash * 0.9, this.flash * 0.8);
    if (this.alive) { const k = 0.45 + 0.55 * clamp(hpF * 1.4, 0, 1); md.tint(k, k, k); }
    md.lights(curTod.night, this.alive && this.input.throttle < -0.05 && this.lastVF > 0.5, this.alive);
    if (this.model.siren) { const on = (performance.now() / 180 | 0) % 2 === 0; this.model.siren[0].visible = on; this.model.siren[1].visible = !on; }
    this.smokeT -= dt;
    const top = this.y + 1.4;
    if (!this.alive) {
      this.wreckT += dt;
      if (this.smokeT <= 0) {
        this.smokeT = 0.09 / fxScale;
        if (this.wreckT < 7) FX_ADD.spawn(this.x + rand(-0.8, 0.8), top, this.z + rand(-0.8, 0.8), rand(-1, 1), rand(3, 6), rand(-1, 1), rand(0.35, 0.6), 1.6, 0.3, 0xffc050, 0xff3010, 0.85, 1, -2);
        FX_SMOKE.spawn(this.x + rand(-0.5, 0.5), top + 0.8, this.z + rand(-0.5, 0.5), rand(-1, 1), rand(3, 5), rand(-1, 1), rand(2, 3), 1.5, 6, 0x2a2228, 0x6a5a60, 0.55, 0.3, -1);
      }
      return;
    }
    if (this.burning > 0) {
      this.burning -= dt; damageCar(this, 5 * dt, this.burnBy, 'burn', true);
      if (Math.random() < 0.6 * fxScale) FX_ADD.spawn(this.x + rand(-1, 1), top, this.z + rand(-1, 1), this.vx * 0.5, rand(2, 5), this.vz * 0.5, rand(0.3, 0.5), 1.4, 0.3, 0xffd060, 0xff4010, 0.9, 1, -2);
    }
    if (this.frozen > 0 && Math.random() < 0.4 * fxScale) FX_ADD.spawn(this.x + rand(-1.2, 1.2), this.y + rand(0.5, 2), this.z + rand(-1.2, 1.2), 0, rand(-1, 1), 0, 0.6, 0.5, 0.1, 0xbfefff, 0x4fa0ff, 0.8, 0, 0);
    if (hpF < 0.6 && this.smokeT <= 0) {
      this.smokeT = (hpF < 0.3 ? 0.07 : 0.14) / fxScale;
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      const hx = this.x + fx * 1.4, hz = this.z + fz * 1.4;
      FX_SMOKE.spawn(hx, this.y + 1.2, hz, rand(-0.5, 0.5) - this.vx * 0.15, rand(2, 4), rand(-0.5, 0.5) - this.vz * 0.15, rand(1.2, 2), 0.8, 3.5, hpF < 0.3 ? 0x2a2228 : 0x8a8288, hpF < 0.3 ? 0x5a5055 : 0xb8b0b0, 0.5, 0.5, -1);
      if (hpF < 0.3) FX_ADD.spawn(hx + rand(-0.3, 0.3), this.y + 1.2, hz + rand(-0.3, 0.3), 0, rand(2, 4), 0, rand(0.25, 0.4), 1, 0.2, 0xffd060, 0xff3010, 0.9, 0, -2);
    }
    if (this.boost > 0) {
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      for (let i = 0; i < 3 * fxScale; i++) FX_ADD.spawn(this.x - fx * 2.2 + rand(-0.4, 0.4), this.y + 0.8, this.z - fz * 2.2 + rand(-0.4, 0.4), -fx * 30 + this.vx * 0.6 + rand(-3, 3), rand(-1, 2), -fz * 30 + this.vz * 0.6 + rand(-3, 3), rand(0.2, 0.4), 1.2, 2.6, 0xfff0a0, 0xff3a10, 0.9, 1, 0);
    }
    // headlight beams at night
    for (const bm of this.model.beams) bm.visible = curTod.night;
  }
  wreck() {
    this.alive = false; this.hp = 0; this.deathTime = G.time; this.wreckT = 0;
    this.model.tint(0.18, 0.16, 0.15); this.model.emit(0, 0, 0); this.model.lights(false, false, false); this.frozen = 0; this.burning = 0; this.boost = 0;
    this.vy = 14; this.grounded = false; this.y += 0.2; this.tumbleV = rand(4, 7) * (Math.random() < 0.5 ? -1 : 1); this.tumbleAxis = Math.random() < 0.5 ? 0 : 1;
    for (const w of this.model.wheels) {
      if (Math.random() < 0.6) {
        w.pivot.visible = false; w.pivot.getWorldPosition(_v1);
        spawnDebris(_v1.x, _v1.y, _v1.z, rand(-10, 10), rand(8, 16), rand(-10, 10), w.r * 1.8, 0x1c1a1a, rand(3, 5));
      }
    }
    for (const bm of this.model.beams) bm.visible = false;
    if (this.model.siren) { this.model.siren[0].visible = false; this.model.siren[1].visible = false; }
  }
  worldPoint(lx, ly, lz, out) { return out.set(lx, ly, lz).applyQuaternion(this.obj.quaternion).add(this.obj.position); }
  worldDir(lx, ly, lz, out) { return out.set(lx, ly, lz).applyQuaternion(this.obj.quaternion).normalize(); }
}
function resolveProps(c) {
  let impact = 0;
  for (const p of PROPS) {
    if (!p.alive) continue;
    const dx = c.x - p.x, dz = c.z - p.z, R = c.radius + p.r, d2 = dx * dx + dz * dz;
    if (d2 >= R * R || c.y > p.y + p.h) continue;
    if (p.breakOnRam && c.speed > p.breakOnRam) { breakProp(p, c, c.vx, c.vz); c.vx *= 0.88; c.vz *= 0.88; continue; }
    const d = Math.sqrt(d2) || 0.01, nx = dx / d, nz = dz / d;
    c.x = p.x + nx * R; c.z = p.z + nz * R;
    const hit = pushOut(c, nx, nz, 0.3); impact = Math.max(impact, hit * 0.8);
    if (hit > 10) damageProp(p, hit * 1.2, c);
  }
  return impact;
}
export function collideCars(cars) {
  for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
    const a = cars[i], b = cars[j];
    if (Math.abs(a.y - b.y) > 2.6) continue;
    const dx = b.x - a.x, dz = b.z - a.z, R = a.radius + b.radius, d2 = dx * dx + dz * dz;
    if (d2 >= R * R) continue;
    const d = Math.sqrt(d2) || 0.01, nx = dx / d, nz = dz / d, pen = R - d;
    const ma = a.alive ? a.mass : a.mass * 3, mb = b.alive ? b.mass : b.mass * 3, im = 1 / ma + 1 / mb;
    a.x -= nx * pen * (1 / ma) / im; a.z -= nz * pen * (1 / ma) / im; b.x += nx * pen * (1 / mb) / im; b.z += nz * pen * (1 / mb) / im;
    const vn = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
    if (vn < 0) {
      const jimp = -(1.35) * vn / im;
      a.vx -= jimp * nx / ma; a.vz -= jimp * nz / ma; b.vx += jimp * nx / mb; b.vz += jimp * nz / mb;
      const sp = -vn;
      if (sp > 12) {
        // who rammed whom: whoever was moving toward the other faster
        const aTo = a.vx * nx + a.vz * nz, bTo = -(b.vx * nx + b.vz * nz);
        const base = Math.min(30, (sp - 12) * 0.45);
        const aBoost = a.boost > 0 ? 2 : 1, bBoost = b.boost > 0 ? 2 : 1;
        if (b.alive) damageCar(b, base * (a.mass / b.mass) * aBoost * (aTo >= bTo ? 1 : 0.6), a.alive ? a : null, 'ram');
        if (a.alive) damageCar(a, base * (b.mass / a.mass) * bBoost * (bTo > aTo ? 1 : 0.6), b.alive ? b : null, 'ram');
        sparks(a.x + nx * a.radius, (a.y + b.y) / 2 + 0.8, a.z + nz * a.radius, 10 + sp * 0.3);
        playSfx('clank', a.x, a.z, clamp(sp / 25, 0.3, 1));
        if (a.isPlayer || b.isPlayer) shake(a.x, a.z, clamp(sp / 40, 0.15, 0.6));
      }
    }
  }
}
