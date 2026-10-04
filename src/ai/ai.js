import { DIFF } from '../combat/damage.js';
import { TAU, angDiff, clamp, rand } from '../engine/util.js';
import { G } from '../game/state.js';
import { blockedAt, lineOfSight } from '../world/collision.js';
import { WEAPON_ORDER, nearestPickup } from '../world/pickups.js';

// ================= AI =================
const PERS = {
  rammer: { flee: 0.22, keep: 0, charge: true },
  sniper: { flee: 0.4, keep: 34, charge: false },
  opportunist: { flee: 0.33, keep: 0, charge: false },
};
export class AI {
  constructor(car) {
    this.car = car; this.pers = car.def.ai; this.P = PERS[this.pers];
    this.target = null; this.goal = { type: 'wander' }; this.think = rand(0, 0.3); this.stuck = 0; this.reverseT = 0; this.revSteer = 1;
    this.cd = rand(0.8, 2); this.targetT = 0; this.strafe = Math.random() < 0.5 ? 1 : -1; this.los = false; this.mgOn = false; this.wander = null; this.wanderT = 0;
  }
  decide() {
    const c = this.car, diff = DIFF[G.settings.difficulty];
    const hpF = c.hp / c.def.hp;
    // choose target
    this.targetT -= 0.4;
    const recentHit = c.lastHitBy && c.lastHitBy.alive && c.lastHitBy !== c && G.time - c.lastHitTime < 1.2;
    if (!this.target || !this.target.alive || this.targetT <= 0 || (recentHit && this.target !== c.lastHitBy && Math.random() < 0.45)) {
      let best = null, bs = 1e9;
      for (const o of G.cars) {
        if (o === c || !o.alive) continue;
        let s = Math.hypot(o.x - c.x, o.z - c.z);
        if (this.pers === 'opportunist') s -= (1 - o.hp / o.def.hp) * 70;
        if (o === c.lastHitBy && G.time - c.lastHitTime < 4) s -= 45;
        if (o.isPlayer) s -= diff.bias;
        s += rand(0, 20);
        if (s < bs) { bs = s; best = o; }
      }
      this.target = best; this.targetT = rand(4, 8);
    }
    const t = this.target;
    const dT = t ? Math.hypot(t.x - c.x, t.z - c.z) : 999;
    this.los = t ? lineOfSight(c.x, c.y + 1.4, c.z, t.x, t.y + 1.2, t.z) : false;
    this.mgOn = Math.random() < diff.mg;
    // flee to repair
    if (hpF < this.P.flee) {
      const rp = nearestPickup(c, p => p.active && p.type === 'repair', 170);
      if (rp) { this.goal = { type: 'pickup', p: rp }; return; }
    }
    let ammo = 0; for (const w of WEAPON_ORDER) ammo += c.ammo[w] > 0.5 ? c.ammo[w] : 0;
    if ((ammo < 1 && dT > 18) || (ammo < 4 && dT > 55)) {
      const wp = nearestPickup(c, p => p.active && p.type !== 'repair', 150);
      if (wp) { this.goal = { type: 'pickup', p: wp }; return; }
    }
    const near = nearestPickup(c, p => p.active && (p.type !== 'repair' || hpF < 0.75) && (p.type !== 'special' || c.special < 6), 28);
    if (near && Math.random() < 0.7) { this.goal = { type: 'pickup', p: near }; return; }
    this.goal = t ? { type: 'attack' } : { type: 'wander' };
  }
  probe(ang, dist) {
    const c = this.car, a = c.yaw + ang;
    return blockedAt(c.x + Math.sin(a) * dist, c.z + Math.cos(a) * dist, 2.2, c);
  }
  update(dt) {
    const c = this.car; if (!c.alive) return;
    this.think -= dt;
    if (this.think <= 0) { this.think = rand(0.3, 0.5); this.decide(); }
    let gx = c.x, gz = c.z;
    const g = this.goal, t = this.target;
    if (g.type === 'pickup') {
      if (!g.p.active) { this.think = 0; } gx = g.p.x; gz = g.p.z;
    } else if (g.type === 'attack' && t && t.alive) {
      const dx = t.x - c.x, dz = t.z - c.z, d = Math.hypot(dx, dz) || 1;
      const lead = Math.min(1.2, d / 45);
      gx = t.x + t.vx * lead; gz = t.z + t.vz * lead;
      if (this.P.keep && d < this.P.keep) { // back off and circle
        const px = -dz / d * this.strafe, pz = dx / d * this.strafe;
        gx = c.x + px * 30 - dx / d * 12; gz = c.z + pz * 30 - dz / d * 12;
      } else if (!this.P.charge && d < 11) { gx = t.x + dx / d * 22; gz = t.z + dz / d * 22; }
    } else {
      this.wanderT -= dt;
      if (!this.wander || this.wanderT <= 0 || Math.hypot(this.wander[0] - c.x, this.wander[1] - c.z) < 15) {
        for (let k = 0; k < 10; k++) { const a = rand(0, TAU), R = rand(20, 150); const x = Math.sin(a) * R, z = Math.cos(a) * R; if (!blockedAt(x, z, 4)) { this.wander = [x, z]; break; } }
        this.wanderT = 8;
      }
      if (this.wander) { gx = this.wander[0]; gz = this.wander[1]; }
    }
    const desired = Math.atan2(gx - c.x, gz - c.z);
    let da = angDiff(c.yaw, desired);
    // obstacle avoidance
    const sp = c.speed, L = 6 + sp * 0.32;
    if (this.probe(0, L) || this.probe(0, L * 0.5)) {
      const lf = !this.probe(0.55, L * 0.8), rf = !this.probe(-0.55, L * 0.8);
      if (lf && (!rf || da > 0)) da = 1.1; else if (rf) da = -1.1; else da = da >= 0 ? 1.6 : -1.6;
    } else {
      if (this.probe(0.45, L * 0.7)) da -= 0.35;
      if (this.probe(-0.45, L * 0.7)) da += 0.35;
    }
    let steer = clamp(-da * 2.4, -1, 1), throttle = 1, hb = false;
    const ada = Math.abs(da);
    if (ada > 1.25) { throttle = 0.6; if (sp > 18) hb = true; }
    else if (ada > 0.6 && sp > 30) throttle = 0.4;
    if (g.type === 'pickup') { const pd = Math.hypot(g.p.x - c.x, g.p.z - c.z); if (pd < 12 && ada > 0.8) throttle = 0.35; }
    if (this.reverseT > 0) { this.reverseT -= dt; throttle = -1; steer = this.revSteer; hb = false; }
    else {
      if (sp < 2.2 && G.countdown <= 0) this.stuck += dt; else this.stuck = Math.max(0, this.stuck - dt * 2);
      if (this.stuck > 1.0) { this.reverseT = rand(0.8, 1.3); this.revSteer = steer >= 0 ? -1 : 1; this.stuck = 0; this.strafe *= -1; }
    }
    c.input.throttle = throttle; c.input.steer = steer; c.input.handbrake = hb;
    this.combat(dt);
  }
  specialOK(d, a) {
    const c = this.car;
    switch (c.def.id) {
      case 'sundowner': return this.los && d < 70 && a < 0.2;
      case 'gravelqueen': return d > 15 && d < 75 && a < 0.5;
      case 'moonbeam': return d < 15;
      case 'scorcher': return (a < 0.2 && d > 12 && d < 55) || (c.hp / c.def.hp < 0.25 && a > 2.5 && d < 25);
      case 'lawdog': return this.los && d < 22 && a < 0.3;
      case 'bigchill': return this.los && d < 80 && a < 0.4;
    }
    return false;
  }
  combat(dt) {
    const c = this.car, t = this.target; c.mgHeld = false; c.wHeld = false;
    if (!t || !t.alive || G.countdown > 0) return;
    const diff = DIFF[G.settings.difficulty];
    const dx = t.x - c.x, dz = t.z - c.z, d = Math.hypot(dx, dz);
    const a = Math.abs(angDiff(c.yaw, Math.atan2(dx, dz)));
    c.mgHeld = this.mgOn && this.los && d < 70 && a < 0.24;
    // flame is continuous
    if (c.ammo.flame > 0.3 && d < 14 && a < 0.45) { c.weapon = 'flame'; c.wHeld = true; return; }
    this.cd -= dt; if (this.cd > 0) return;
    let choice = null, combo = 0;
    const cmb = () => (Math.random() < diff.combo ? (Math.random() < 0.6 ? 1 : 2) : 0);
    if (c.special > 0 && this.specialOK(d, a)) choice = 'special';
    else if (c.ammo.missile >= 1 && this.los && d < 110 && a < 0.45) { choice = 'missile'; if (c.ammo.missile >= 3) combo = cmb(); }
    else if (c.ammo.mortar >= 1 && d > 18 && d < 85 && a < 0.35) { choice = 'mortar'; if (c.ammo.mortar >= 3) combo = cmb(); }
    else if (c.ammo.mines >= 1 && d < 28 && a > 2.3) { choice = 'mines'; if (c.ammo.mines >= 3 && Math.random() < diff.combo) combo = 2; }
    else if (c.ammo.mines >= 3 && d < 40 && d > 20 && a < 0.3 && Math.random() < diff.combo) { choice = 'mines'; combo = 1; }
    else if (c.ammo.flame >= 3 && d < 45 && d > 14 && a < 0.3 && Math.random() < 0.3) { choice = 'flame'; combo = 2; }
    if (!choice) return;
    if (Math.random() > diff.fire) { this.cd = rand(0.4, 0.9); return; }
    if (choice === 'special') c.sFire = true; else { c.weapon = choice; c.wFire = true; c.wCombo = combo; }
    this.cd = diff.react + rand(0.25, 1.1);
  }
}
