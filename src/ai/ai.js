import { DIFF } from '../combat/damage.js';
import { TAU, angDiff, clamp, rand } from '../engine/util.js';
import { G } from '../game/state.js';
import { blockedAt, lineOfSight, obstacleAt } from '../world/collision.js';
import { COMBO_COST, RANGE, WEAPON_ORDER } from '../combat/arsenal';
import { PROJ } from '../combat/pools.js';
import { smokeBetween } from '../combat/weapons.js';
import { nearestPickup } from '../world/pickups';

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
    this.cd = rand(0.8, 2); this.defCd = 0; this.mem = {}; this.want = 99; this.targetT = 0; this.strafe = Math.random() < 0.5 ? 1 : -1; this.los = false; this.mgOn = false; this.wander = null; this.wanderT = 0; this.line = false; this.why = '';
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
        if (o.isPlayer) s -= diff.bias + (G.mode.rivalry || 0);
        s += rand(0, 20);
        if (s < bs) { bs = s; best = o; }
      }
      this.target = best; this.targetT = rand(4, 8);
    }
    const t = this.target;
    const dT = t ? Math.hypot(t.x - c.x, t.z - c.z) : 999;
    this.los = t ? lineOfSight(c.x, c.y + 1.4, c.z, t.x, t.y + 1.2, t.z) && !smokeBetween(c.x, c.z, t.x, t.z) : false;
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
    // on a racing line the road's edges are the line's business: look out only for things in the way
    return (this.line ? obstacleAt : blockedAt)(c.x + Math.sin(a) * dist, c.z + Math.cos(a) * dist, 2.2, c);
  }
  update(dt) {
    const c = this.car; if (!c.alive) return;
    this.think -= dt;
    if (this.think <= 0) { this.think = rand(0.3, 0.5); this.decide(); }
    let gx = c.x, gz = c.z;
    const g = this.goal, t = this.target;
    if (g.type === 'pickup') {
      if (!g.p.active) { this.think = 0; } gx = g.p.x; gz = g.p.z;
    }
    const line = G.mode.drive ? G.mode.drive(this) : null; // the mode may set the course (a racing line)
    this.line = !!line;
    this.want = line ? line.want : 99;
    if (line) { gx = line.x; gz = line.z; }
    else if (g.type === 'pickup') { /* steering set above */ } else if (g.type === 'attack' && t && t.alive) {
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
    const sp = c.speed, L = 6 + sp * 0.32; this.why = 'full'; // why the bot isn't flat out (tools/botmatch.js)
    if (this.probe(0, L) || this.probe(0, L * 0.5)) {
      this.why = 'avoid';
      const lf = !this.probe(0.55, L * 0.8), rf = !this.probe(-0.55, L * 0.8);
      if (lf && (!rf || da > 0)) da = 1.1; else if (rf) da = -1.1; else da = da >= 0 ? 1.6 : -1.6;
    } else {
      if (this.probe(0.45, L * 0.7)) da -= 0.35;
      if (this.probe(-0.45, L * 0.7)) da += 0.35;
    }
    let steer = clamp(-da * 2.4, -1, 1), throttle = 1, hb = false;
    const ada = Math.abs(da);
    if (ada > 1.25) { throttle = 0.6; if (sp > 18) hb = true; if (this.why === 'full') this.why = 'sharp'; }
    else if (ada > 0.6 && sp > 30) { throttle = 0.4; if (this.why === 'full') this.why = 'turn'; }
    if (sp > this.want) { throttle = sp > this.want + 3 ? -0.5 : 0.25; if (this.why === 'full') this.why = 'corner'; } // brake for the corner ahead
    if (g.type === 'pickup') { const pd = Math.hypot(g.p.x - c.x, g.p.z - c.z); if (pd < 12 && ada > 0.8) throttle = 0.35; }
    if (this.reverseT > 0) { this.reverseT -= dt; throttle = -1; this.why = 'reverse'; steer = this.revSteer; hb = false; }
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
  /** A defensive combo when one fits the moment: flares or smoke against incoming homing shots, kickback or ring of fire when crowded, rear rockets at a tailgater. */
  defend(d, a) {
    const c = this.car, has = w => c.ammo[w] >= COMBO_COST;
    let incoming = false; for (const p of PROJ) if (p.turn && p.target === c && Math.hypot(p.x - c.x, p.z - c.z) < 35) { incoming = true; break; }
    let crowd = 99; for (const o of G.cars) if (o !== c && o.alive) crowd = Math.min(crowd, Math.hypot(o.x - c.x, o.z - c.z));
    if (incoming && has('missile')) return 'missile';
    if (incoming && has('mortar')) return 'mortar';
    if (crowd < 8 && has('mines')) return 'mines';
    if (crowd < 9 && has('flame')) return 'flame';
    if (a > 2.5 && d < 40 && this.los && has('rockets')) return 'rockets';
    return null;
  }
  combat(dt) {
    const c = this.car, t = this.target; c.mgHeld = false; c.wHeld = false;
    if (!t || !t.alive || G.countdown > 0) return;
    const diff = DIFF[G.settings.difficulty];
    const dx = t.x - c.x, dz = t.z - c.z, d = Math.hypot(dx, dz);
    const a = Math.abs(angDiff(c.yaw, Math.atan2(dx, dz)));
    c.mgHeld = this.mgOn && this.los && d < RANGE.mg && a < 0.24;
    this.defCd -= dt;
    if (this.defCd <= 0) {
      this.defCd = rand(0.3, 0.5);
      const w = this.defend(d, a);
      if (w && Math.random() < diff.combo * 2) { c.weapon = w; c.wFire = true; c.wCombo = 2; this.defCd = 2.5; return; }
    }
    // flame is continuous
    if (c.ammo.flame > 0.3 && d < 14 && a < 0.45) { c.weapon = 'flame'; c.wHeld = true; return; }
    this.cd -= dt; if (this.cd > 0) return;
    let choice = null, combo = 0;
    const cmb = w => (c.ammo[w] >= COMBO_COST && Math.random() < diff.combo ? 1 : 0);
    if (c.special > 0 && this.specialOK(d, a)) choice = 'special';
    else if (c.ammo.rockets >= 1 && this.los && d < RANGE.rockets * 0.8 && a < 0.12) { choice = 'rockets'; if (d < 40) combo = cmb('rockets'); }
    else if (c.ammo.missile >= 1 && this.los && d < RANGE.missile && a < 0.45) { choice = 'missile'; combo = cmb('missile'); }
    else if (c.ammo.mortar >= 1 && d > 18 && d < RANGE.mortar && a < 0.35) { choice = 'mortar'; combo = cmb('mortar'); }
    else if (c.ammo.mines >= 1 && d < 28 && a > 2.3) choice = 'mines';
    else if (c.ammo.mines >= COMBO_COST && d < 40 && d > 20 && a < 0.3 && Math.random() < diff.combo) { choice = 'mines'; combo = 1; }
    else if (c.ammo.flame >= COMBO_COST && d < 45 && d > 14 && a < 0.3 && Math.random() < 0.3) { choice = 'flame'; combo = 1; }
    if (!choice) return;
    if (Math.random() > diff.fire) { this.cd = rand(0.4, 0.9); return; }
    if (choice === 'special') c.sFire = true; else { c.weapon = choice; c.wFire = true; c.wCombo = combo; }
    this.cd = choice === 'rockets' && !combo ? 0.32 + diff.react * 0.4 : diff.react + rand(0.25, 1.1);
  }
}
