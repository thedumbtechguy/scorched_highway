import * as THREE from 'three';
import { playSfx } from '../audio/audio.js';
import { buildCarModel } from './model/build.js';
import { damageCar } from '../combat/damage.js';
import { sparks } from '../combat/effects.js';
import { spawnDebris } from '../engine/debris.js';
import { FX_ADD, FX_SMOKE, fxScale } from '../engine/particles.js';
import { addToScene } from '../engine/renderer.js';
import { curTod } from '../engine/sky';
import { GRAV, TAU, _m4, _v1, clamp, lerp, rand } from '../engine/util.js';
import { G, shake } from '../game/state.js';
import { pushOut, resolveStatic } from '../world/collision.js';
import { PROPS, breakProp, damageProp } from '../world/props.js';
import { drawnGround } from '../world/surface.js';
import { ground, rampHeight, groundSpeed } from '../world/terrain.js';

// ================= car physics =================
const _fwd = new THREE.Vector3(), _xAx = new THREE.Vector3(), _nrm = new THREE.Vector3();
const DROOP = 0.14; // how far a wheel can hang below its rest position to reach the ground
/** How far one wheel may rest above or below the ground under the car's middle (see sampleContacts). */
const CONTACT_RISE = 0.6, CONTACT_DROP = 0.8;
const BUBBLE_GEO = (() => { const g = new THREE.IcosahedronGeometry(1, 2); g.scale(1.9, 1.35, 3.1); return g; })();
const BUBBLE_MAT = new THREE.MeshBasicMaterial({ color: 0x3aa8f0, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, wireframe: true });
export class Car {
  constructor(def, isPlayer) {
    this.def = def; this.isPlayer = isPlayer;
    this.model = buildCarModel(def); this.obj = this.model.group; this.body = this.model.body;
    addToScene(this.obj, 'cars');
    this.radius = 1.9; this.mass = def.mass; this.up = new THREE.Vector3(0, 1, 0);
    this.input = { throttle: 0, steer: 0, handbrake: false };
    this.speedK = 1; // top-speed scale; AI difficulty lowers it
    this.accelK = 1; // acceleration scale (race bots are matched to the player's car)
    /** @type {import('../modes/race').RaceState | null} progress in a race */ this.race = null;
    // each wheel's position in the car's frame and the drawn ground under it, for resting the car on its wheels
    this.contacts = this.model.wheels.map(w => ({ wheel: w, lx: w.x, ly: w.y, lz: w.z, r: w.r, h: 0, need: 0 }));
    this.lift = 0; // visual ride height above the physics position
    this.reset(0, 0, 0);
  }
  reset(x, z, yaw) {
    this.x = x; this.z = z; this.yaw = yaw; this.vx = 0; this.vz = 0; this.vy = 0; this.y = ground(x, z); this.prevG = this.y; this.grounded = true;
    this.hp = this.def.hp; this.alive = true;
    // weapons
    this.ammo = { missile: 0, rockets: 0, mortar: 0, mines: 0, flame: 0 }; /** @type {string|null} */ this.weapon = null;
    this.special = 3; this.cdMG = 0; this.cdW = 0; this.cdS = 0; this.gunSide = 1;
    /** @type {any} */ this.flare = null; /** @type {Car|null} chosen target */ this.pref = null; this.flameOn = false; this.mgHeld = false; this.wHeld = false; this.wFire = false; this.wCombo = 0; this.sFire = false;
    // status effects and scoring
    this.mgLocked = false; this.shieldT = 0; this.draft = 0; // race rules: machine gun locked until a sword plate; shield plate; slipstream
    this.boost = 0; this.frozen = 0; this.burning = 0; /** @type {Car|null} */ this.burnBy = null; /** @type {Car|null} */ this.lastHitBy = null;
    this.lastHitTime = -99; this.kills = 0; this.dealt = 0; this.flash = 0; this.place = 0; /** @type {Car|null} */ this.wreckedBy = null;
    // body motion and visuals
    this.tumble = 0; this.tumbleV = 0; this.tumbleAxis = 0; this.wheelRot = 0; this.steerVis = 0; this.lean = 0; this.pitch = 0; this.lastVF = 0;
    this.smokeT = 0; this.dustT = 0; this.airT = 0; this.deathTime = 0; this.wreckT = 0; this.stuckT = 0; this.resetCd = 0;
    this.input.throttle = 0; this.input.steer = 0; this.input.handbrake = false;
    this.lift = 0; this.sampleContacts(); this.groundNormal(this.up);
    this.obj.visible = true; this.model.tint(1, 1, 1); this.model.emit(0, 0, 0);
    for (const w of this.model.wheels) w.on = true;
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
    if (this.shieldT > 0) this.shieldT -= dt;
    this.shieldFX();
    if (!this.alive) { inp.throttle = 0; inp.steer = 0; inp.handbrake = true; }
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), rx = -fz, rz = fx;
    let vF = this.vx * fx + this.vz * fz, vL = this.vx * rx + this.vz * rz;
    let maxS = d.max * (this.frozen > 0 ? 0.45 : 1) * this.speedK * groundSpeed(this.x, this.z); // sand slows you
    if (this.boost > 0) maxS *= 1.7;
    if (this.grounded) {
      const thr = inp.throttle;
      if (this.boost > 0) vF += d.accel * 2.4 * dt;
      else if (thr > 0.05) { if (vF < maxS) vF += d.accel * this.accelK * thr * dt * (vF < 0 ? 2.2 : 1); }
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
    const x0 = this.x, z0 = this.z;
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
      // follow the ground's slope (a ramp launches you), but a step up (a kerb, a ledge's edge) is a bump, not a launch
      const rise = g - this.prevG, run = Math.hypot(this.x - x0, this.z - z0);
      this.y = g; this.vy = rise > 0.05 && rise > run * 0.8 ? 0 : clamp(rise / Math.max(dt, 0.001), -12, 30);
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
    this.sampleContacts();
    if (this.grounded) this.up.lerp(this.groundNormal(_nrm), 1 - Math.exp(-50 * dt)).normalize();
    else {
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
  /** Height of the drawn ground under each wheel (ramps only within climbing reach of the car's centre). */
  sampleContacts() {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw), ramp = rampHeight(this.x, this.z), reach = ramp + 0.8;
    // a wheel can't sit much above or below the ground under the car's middle: ground that rises faster than that
    // is a wall (canyon rock, a building's footing) the car is pressed against, not something to climb onto
    const mid = drawnGround(this.x, this.z, reach), lo = mid - CONTACT_DROP, hi = mid + (ramp > 0 ? 3 : CONTACT_RISE);
    for (const k of this.contacts) k.h = clamp(drawnGround(this.x + k.lx * c + k.lz * s, this.z - k.lx * s + k.lz * c, reach), lo, hi);
  }
  /** Up vector of the plane through the wheels' ground points, tilt limited to about 40 degrees. */
  groundNormal(out) {
    let fz = 0, fh = 0, nf = 0, bz = 0, bh = 0, nb = 0, px = 0, ph = 0, np = 0, mx = 0, mh = 0, nm = 0;
    for (const k of this.contacts) {
      if (k.lz >= 0) { fz += k.lz; fh += k.h; nf++; } else { bz += k.lz; bh += k.h; nb++; }
      if (k.lx >= 0) { px += k.lx; ph += k.h; np++; } else { mx += k.lx; mh += k.h; nm++; }
    }
    const sF = clamp((fh / nf - bh / nb) / (fz / nf - bz / nb), -0.8, 0.8), sS = clamp((ph / np - mh / nm) / (px / np - mx / nm), -0.8, 0.8);
    // the car's x axis is (cos, 0, -sin) and forward is (sin, 0, cos); the plane h = sS*x + sF*z has normal (-sS, 1, -sF)
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    return out.set(-sS * c - sF * s, 1, sS * s - sF * c).normalize();
  }
  syncModel(dt) {
    _fwd.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const u = this.up; _fwd.addScaledVector(u, -_fwd.dot(u)).normalize();
    _xAx.crossVectors(u, _fwd).normalize();
    _m4.makeBasis(_xAx, u, _fwd); this.obj.quaternion.setFromRotationMatrix(_m4);
    // ride height: the physics only knows the height under the car's centre, so on the ground the car is
    // set down on its wheels instead (the one needing the most height touches, the others drop to meet the
    // ground), and in the air it is only kept from sinking a wheel into the ground below
    let need = -Infinity;
    for (const k of this.contacts) { k.need = k.h - (k.lx * _xAx.y + (k.ly - k.r) * u.y + k.lz * _fwd.y); if (k.need > need) need = k.need; }
    const minLift = need - this.y, target = this.grounded ? Math.max(minLift, -0.35) : Math.max(minLift, 0);
    this.lift = Math.max(minLift, lerp(this.lift, target, 1 - Math.exp(-25 * dt)));
    const Y = this.y + this.lift;
    this.obj.position.set(this.x, Y, this.z);
    for (const k of this.contacts) k.wheel.drop = Math.min((Y - k.need) / Math.max(u.y, 0.3), DROOP);
    this.body.rotation.set(this.pitch + (this.tumbleAxis === 0 ? this.tumble : 0), 0, this.lean + (this.tumbleAxis === 1 ? this.tumble : 0));
    this.body.position.y = 0.04 * Math.sin(this.wheelRot * 0.37) * (this.grounded ? clamp(this.speed / 30, 0, 1) : 0);
    this.model.poseWheels(this.wheelRot, this.steerVis);
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
  /** Bring a wrecked car back (in a race): half health and no pickup weapons; score, special ammo and race state carry over. */
  respawn(x, z, yaw) {
    const keep = { kills: this.kills, dealt: this.dealt, special: this.special, race: this.race, pref: this.pref, speedK: this.speedK, accelK: this.accelK, mgLocked: this.mgLocked };
    this.reset(x, z, yaw); Object.assign(this, keep); this.hp = this.def.hp * 0.5; this.resetCd = 2;
    for (const b of this.model.beams) b.visible = curTod.night;
  }
  wreck() {
    this.alive = false; this.hp = 0; this.deathTime = G.time; this.wreckT = 0;
    this.model.tint(0.18, 0.16, 0.15); this.model.emit(0, 0, 0); this.model.lights(false, false, false); this.frozen = 0; this.burning = 0; this.boost = 0;
    this.vy = 14; this.grounded = false; this.y += 0.2; this.tumbleV = rand(4, 7) * (Math.random() < 0.5 ? -1 : 1); this.tumbleAxis = Math.random() < 0.5 ? 0 : 1;
    for (const w of this.model.wheels) {
      if (Math.random() < 0.6) {
        w.on = false; this.model.wheelWorldPos(w, _v1);
        spawnDebris(_v1.x, _v1.y, _v1.z, rand(-10, 10), rand(8, 16), rand(-10, 10), w.r * 1.8, 0x1c1a1a, rand(3, 5));
      }
    }
    for (const bm of this.model.beams) bm.visible = false;
    if (this.model.siren) { this.model.siren[0].visible = false; this.model.siren[1].visible = false; }
  }
  /** The shield plate's bubble: shown while the shield lasts, flickering as it runs out. */
  shieldFX() {
    const on = this.shieldT > 0 && this.alive && (this.shieldT > 1.5 || (this.shieldT * 8 | 0) % 2 === 0);
    if (!on) { if (this.bubble) this.bubble.visible = false; return; }
    if (!this.bubble) { this.bubble = new THREE.Mesh(BUBBLE_GEO, BUBBLE_MAT); this.bubble.position.y = 1.1; this.obj.add(this.bubble); }
    this.bubble.visible = true; this.bubble.rotation.y += 0.05;
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
