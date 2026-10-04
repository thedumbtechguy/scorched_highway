import * as THREE from 'three';
import { playSfx } from '../audio/audio.js';
import { DIFF, damageCar, knock } from './damage.js';
import { explode, ring, sparks } from './effects.js';
import { COMBOS, COMBO_COST, CONE, RANGE, WEAPON_ORDER } from './arsenal';
import { MINES, PROJ, SMOKES, takeMesh } from './pools.js';
import { FX_ADD, FX_SMOKE, fxScale } from '../engine/particles.js';
import { TAU, _v1, _v2, angDiff, clamp, rand } from '../engine/util.js';
import { bigText } from '../game/hud.js';
import { G, shake } from '../game/state.js';
import { lineOfSight, outOfBounds, pointBlocked } from '../world/collision.js';
import { mapAt } from '../maps/registry';
import { PROPS, breakProp, damageProp } from '../world/props.js';
import { ground } from '../world/terrain.js';

// ================= targeting =================
/**
 * Best car to aim at within `range` and `cone` of heading `yaw`; with `needSight`, only cars it can see.
 * The car's chosen target (`c.pref`) wins whenever it qualifies, with a little extra cone.
 */
export function findTarget(c, range, cone, needSight = false, yaw = c.yaw) {
  let best = null, bestS = 1e9; const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const pf = c.pref;
  if (pf && pf.alive) {
    const dx = pf.x - c.x, dz = pf.z - c.z, d = Math.hypot(dx, dz);
    if (d <= range && d >= 0.5 && Math.acos(clamp((dx * fx + dz * fz) / d, -1, 1)) <= cone * 1.5 && (!needSight || canSee(c.x, c.y + 1.4, c.z, pf))) return pf;
  }
  for (const o of G.cars) {
    if (o === c || !o.alive) continue;
    const dx = o.x - c.x, dz = o.z - c.z, d = Math.hypot(dx, dz);
    if (d > range || d < 0.5) continue;
    const a = Math.acos(clamp((dx * fx + dz * fz) / d, -1, 1)); if (a > cone) continue;
    const s = d * (1 + a * 2.5); if (s < bestS && (!needSight || canSee(c.x, c.y + 1.4, c.z, o))) { bestS = s; best = o; }
  }
  return best;
}
/** Clear line of sight to a car: not behind a building or the ground, and not through smoke. */
export function canSee(x, y, z, o) {
  const m = mapAt(o.x); if (m.sees && !m.sees(x, z, o.x, o.z)) return false; // the map's own sight rules (e.g. Route 67's mine shaft)
  return lineOfSight(x, y, z, o.x, o.y + 1.2, o.z) && !smokeBetween(x, z, o.x, o.z);
}
/** Does the line between two points pass through a smoke cloud? */
export function smokeBetween(x1, z1, x2, z2) {
  for (const s of SMOKES) {
    const dx = x2 - x1, dz = z2 - z1, L2 = dx * dx + dz * dz || 1, k = clamp(((s.x - x1) * dx + (s.z - z1) * dz) / L2, 0, 1);
    if (Math.hypot(x1 + dx * k - s.x, z1 + dz * k - s.z) < s.r) return true;
  }
  return false;
}
/** What a homing weapon fired at `t` should chase: its decoy flare while one is in the air. */
const lure = t => (t && t.flare && t.flare.alive ? t.flare : t);
function aimAt(from, target, speed, err, out) {
  const t = Math.hypot(target.x - from.x, target.z - from.z) / speed;
  out.set(target.x + target.vx * t * 0.85 - from.x, target.y + 1.0 + (target.grounded ? 0 : target.vy * t * 0.5) - from.y, target.z + target.vz * t * 0.85 - from.z).normalize();
  if (err) jitter(out, err);
  return out;
}
function jitter(v, err) { v.x += rand(-err, err); v.y += rand(-err, err) * 0.4; v.z += rand(-err, err); return v.normalize(); }
function carAim(c) { return c.isPlayer ? 0 : DIFF[G.settings.difficulty].aim; }

// ================= firing =================
const _mz = new THREE.Vector3(), _dir = new THREE.Vector3();
function spawnProj(o) { o.age = 0; if (o.meshName) o.mesh = takeMesh(o.meshName); PROJ.push(o); return o; }
function fireMG(c) {
  c.cdMG = 0.095; c.gunSide *= -1;
  const d = c.def;
  c.worldPoint(d.gunX * c.gunSide, d.gunY, d.front, _mz);
  const t = findTarget(c, RANGE.mg, CONE.mg, true);
  if (t) aimAt(_mz, t, 150, carAim(c) + 0.012, _dir); else { c.worldDir(0, 0.01, 1, _dir); jitter(_dir, 0.012); }
  spawnProj({ type: 'bullet', meshName: 'bullet', x: _mz.x, y: _mz.y, z: _mz.z, vx: _dir.x * 150 + c.vx, vy: _dir.y * 150, vz: _dir.z * 150 + c.vz, owner: c, life: 0.6, dmg: 1.2, r: 0.3 });
  FX_ADD.spawn(_mz.x, _mz.y, _mz.z, c.vx, c.vy, c.vz, 0.05, 1.2, 0.4, 0xfff0b0, 0xffa040, 1, 0, 0);
  playSfx('gun', c.x, c.z, 0.5);
}
function fireMissile(c, dirOff, target) {
  target = lure(target);
  c.worldPoint(0, c.def.gunY + 0.3, c.def.front - 0.4, _mz);
  if (target) aimAt(_mz, target, 55, carAim(c) * 0.5, _dir); else c.worldDir(0, 0.05, 1, _dir);
  if (dirOff) turnDir(_dir, dirOff);
  spawnProj({ type: 'missile', meshName: 'missile', x: _mz.x, y: _mz.y, z: _mz.z, vx: _dir.x * 50 + c.vx * 0.5, vy: _dir.y * 50 + 1, vz: _dir.z * 50 + c.vz * 0.5, owner: c, life: 3, dmg: 13, r: 0.5, speed: 50, maxSpeed: 68, target, turn: 2.0 });
  playSfx('launch', c.x, c.z, 0.8);
}
function turnDir(v, off) { const a = Math.atan2(v.x, v.z) + off, h = Math.hypot(v.x, v.z); v.x = Math.sin(a) * h; v.z = Math.cos(a) * h; return v; }
/** Straight-flying rocket from alternating pods; `back` fires out of the tail. Only the slightest aim help. */
function fireRocket(c, off, back) {
  const d = c.def; c.gunSide *= -1;
  c.worldPoint(d.gunX * c.gunSide, d.gunY + 0.15, back ? -d.front * 0.95 : d.front - 0.2, _mz);
  const t = findTarget(c, RANGE.rockets, back ? 0.6 : 0.08, true, c.yaw + (back ? Math.PI : 0));
  if (t) aimAt(_mz, t, 95, carAim(c) * 0.5, _dir); else c.worldDir(0, 0.01, back ? -1 : 1, _dir);
  if (off) turnDir(_dir, off);
  spawnProj({ type: 'rocket', meshName: 'rocket', x: _mz.x, y: _mz.y, z: _mz.z, vx: _dir.x * 95 + c.vx, vy: _dir.y * 95, vz: _dir.z * 95 + c.vz, owner: c, life: 1.1, dmg: 14, r: 0.4 });
  FX_ADD.spawn(_mz.x, _mz.y, _mz.z, c.vx, 0, c.vz, 0.08, 1.4, 0.5, 0xfff0b0, 0xff8030, 1, 0, 0);
}
/** Flares that every homing weapon chasing `c` (and any fired at it while they burn) goes after instead. */
function fireDecoy(c) {
  const flares = [];
  for (const s of [-1, 1]) {
    c.worldPoint(0.5 * s, c.def.gunY + 0.6, -1.5, _mz); c.worldDir(s * 0.6, 1.1, -0.8, _dir);
    flares.push(spawnProj({ type: 'flare', meshName: 'flare', x: _mz.x, y: _mz.y, z: _mz.z, vx: _dir.x * 9 + c.vx * 0.4, vy: _dir.y * 9, vz: _dir.z * 9 + c.vz * 0.4, grav: 5, owner: c, life: 3.5, r: 0.3, inert: true, alive: true }));
  }
  c.flare = flares[0];
  let k = 0; for (const p of PROJ) if (p.turn && p.target === c) p.target = flares[k++ % 2];
  playSfx('launch', c.x, c.z, 0.6);
}
/** Where a mortar aimed at `target` (or straight ahead) should land, stretched by `mult` and turned by `ang`. */
function shellAim(c, target, mult = 1, ang = 0) {
  let tx, tz;
  if (target) { const D0 = Math.hypot(target.x - c.x, target.z - c.z); const t = Math.sqrt(D0) / 3.87; tx = target.x + target.vx * t * 0.8; tz = target.z + target.vz * t * 0.8; }
  else { tx = c.x + Math.sin(c.yaw) * 40; tz = c.z + Math.cos(c.yaw) * 40; }
  if (mult !== 1 || ang) { const dx = tx - c.x, dz = tz - c.z; const a = Math.atan2(dx, dz) + ang; const L = Math.hypot(dx, dz) * mult; tx = c.x + Math.sin(a) * L; tz = c.z + Math.cos(a) * L; }
  const err = carAim(c) * 20; return [tx + rand(-err, err), tz + rand(-err, err)];
}
function fireShell(c, tx, tz, smoke) {
  c.worldPoint(0, c.def.gunY + 0.6, 0, _mz);
  const dx = tx - _mz.x, dz = tz - _mz.z, D = Math.max(6, Math.hypot(dx, dz));
  const g = 30, v0 = Math.sqrt(D * g), vh = v0 * 0.7071, dy = ground(tx, tz) - _mz.y;
  const flight = D / vh; const vy = v0 * 0.7071 + dy / flight;
  spawnProj({ type: smoke ? 'smokeshell' : 'shell', meshName: 'shell', x: _mz.x, y: _mz.y, z: _mz.z, vx: dx / D * vh, vy, vz: dz / D * vh, grav: g, owner: c, life: 6, dmg: 22, rad: 6.5, r: 0.5 });
  FX_SMOKE.spawn(_mz.x, _mz.y + 0.4, _mz.z, 0, 4, 0, 0.8, 1, 3, 0x6a5a58, 0x9a8a88, 0.6, 1, 0);
  playSfx('thump', c.x, c.z, 0.8);
}
/** A smoke cloud: homing weapons lose anything inside it or behind it. */
function addSmoke(x, z) {
  SMOKES.push({ x, z, r: 11, t: 6 });
  for (const p of PROJ) if (p.turn && p.target && !p.target.inert && Math.hypot(p.target.x - x, p.target.z - z) < 11) p.target = null;
}
function updateSmoke(dt) {
  for (let i = SMOKES.length - 1; i >= 0; i--) {
    const s = SMOKES[i]; s.t -= dt; if (s.t <= 0) { SMOKES.splice(i, 1); continue; }
    const fade = Math.min(1, s.t / 1.5);
    for (let k = 0; k < 30 * dt * fxScale; k++) {
      const a = rand(0, TAU), r = Math.sqrt(Math.random()) * s.r, x = s.x + Math.sin(a) * r, z = s.z + Math.cos(a) * r;
      FX_SMOKE.spawn(x, ground(x, z) + rand(0.5, 3), z, rand(-1, 1), rand(0.3, 1.2), rand(-1, 1), rand(2, 3), 4, 8, 0xc8bcb0, 0xe0d8cc, 0.75 * fade, 1, -0.2);
    }
  }
}
function dropMine(c, ox, oz) {
  const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
  const x = c.x - fx * 3 + (ox || 0), z = c.z - fz * 3 + (oz || 0);
  addMine(x, z, c);
  playSfx('mine', c.x, c.z, 0.6);
}
const MAX_MINES = 6; // live mines per car; laying another retires its oldest
function addMine(x, z, owner) {
  const mine = MINES.filter(m => m.owner === owner);
  if (mine.length >= MAX_MINES) { const old = mine[0]; old.dead = true; old.mesh.visible = false; MINES.splice(MINES.indexOf(old), 1); sparks(old.x, old.y + 0.3, old.z, 4); }
  const m = takeMesh('mine'); const y = ground(x, z); m.position.set(x, y, z);
  MINES.push({ x, y, z, owner, arm: 0.9, grace: 1.6, mesh: m, fuse: null, dead: false, t: Math.random() * 3, life: 35 });
}
function fireWeapon(c, combo) {
  const w = c.weapon; if (!w || c.cdW > 0) return false;
  if (combo && c.ammo[w] < COMBO_COST) combo = 0;
  if (w === 'flame' && !combo) return false; // handled continuously
  if (c.ammo[w] <= 0) return false;
  const spend = n => { c.ammo[w] -= n; };
  switch (w) {
    case 'missile': {
      const t = findTarget(c, RANGE.missile, CONE.missile, true);
      if (combo === 1) { for (const off of [-0.28, 0, 0.28]) fireMissile(c, off, t); spend(COMBO_COST); c.cdW = 0.9; }
      else if (combo === 2) { fireDecoy(c); spend(COMBO_COST); c.cdW = 0.6; }
      else { fireMissile(c, 0, t); spend(1); c.cdW = 0.45; }
      break;
    }
    case 'rockets': {
      if (combo === 1) { for (const off of [-0.16, -0.08, 0, 0.08, 0.16]) fireRocket(c, off, false); spend(COMBO_COST); c.cdW = 0.8; }
      else if (combo === 2) { for (const off of [-0.1, -0.035, 0.035, 0.1]) fireRocket(c, off, true); spend(COMBO_COST); c.cdW = 0.8; }
      else { fireRocket(c, 0, false); spend(1); c.cdW = 0.3; }
      playSfx('launch', c.x, c.z, 0.6);
      break;
    }
    case 'mortar': {
      const t = findTarget(c, RANGE.mortar, CONE.mortar); // lobbed over cover, so no line of sight needed
      if (combo === 1) { for (const [k, a] of [[0.72, -0.12], [1, 0], [1.28, 0.12]]) fireShell(c, ...shellAim(c, t, k, a)); spend(COMBO_COST); c.cdW = 1.2; }
      else if (combo === 2) { fireShell(c, c.x - Math.sin(c.yaw) * 10 + c.vx * 0.6, c.z - Math.cos(c.yaw) * 10 + c.vz * 0.6, true); spend(COMBO_COST); c.cdW = 1.0; }
      else { fireShell(c, ...shellAim(c, t)); spend(1); c.cdW = 0.75; }
      break;
    }
    case 'mines': {
      if (combo === 1) {
        const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
        c.worldPoint(0, c.def.gunY + 0.6, 0, _mz);
        spawnProj({ type: 'minetoss', meshName: 'mine', x: _mz.x, y: _mz.y, z: _mz.z, vx: fx * 26 + c.vx * 0.6, vy: 14, vz: fz * 26 + c.vz * 0.6, grav: 30, owner: c, life: 5, r: 0.6 });
        spend(COMBO_COST); c.cdW = 0.6; playSfx('thump', c.x, c.z, 0.6);
      } else if (combo === 2) { kickback(c); spend(COMBO_COST); c.cdW = 1.0; }
      else { dropMine(c); spend(1); c.cdW = 0.35; }
      break;
    }
    case 'flame': {
      if (combo === 1) {
        c.worldPoint(0, c.def.gunY + 0.4, c.def.front + 0.5, _mz);
        const t = findTarget(c, 60, 0.4, true);
        if (t) aimAt(_mz, t, 34, carAim(c), _dir); else c.worldDir(0, 0.02, 1, _dir);
        spawnProj({ type: 'fireball', meshName: 'fireball', x: _mz.x, y: _mz.y, z: _mz.z, vx: _dir.x * 34 + c.vx * 0.5, vy: _dir.y * 34, vz: _dir.z * 34 + c.vz * 0.5, owner: c, life: 2.2, r: 1, dmg: 28 });
        spend(COMBO_COST); c.cdW = 1; playSfx('whoosh', c.x, c.z, 0.9);
      } else if (combo === 2) {
        for (let i = 0; i < 70 * fxScale; i++) { const a = i / 70 * TAU; FX_ADD.spawn(c.x + Math.sin(a) * 2, c.y + 1, c.z + Math.cos(a) * 2, Math.sin(a) * 22, rand(0, 3), Math.cos(a) * 22, rand(0.35, 0.55), 1.2, 3.5, 0xffe070, 0xff3010, 0.9, 2.5, -2); }
        for (const o of G.cars) if (o !== c && o.alive) { const d = Math.hypot(o.x - c.x, o.z - c.z); if (d < 11) { damageCar(o, 24 * (1 - d / 14), c, 'fire'); o.burning = Math.max(o.burning, 2.5); o.burnBy = c; knock(o, c.x, c.z, 8, 3); } }
        for (const p of PROPS) if (p.alive && Math.hypot(p.x - c.x, p.z - c.z) < 11) damageProp(p, 30, c);
        spend(COMBO_COST); c.cdW = 1; playSfx('whoosh', c.x, c.z, 1);
      }
      break;
    }
  }
  if (combo && c.isPlayer) bigText(COMBOS[w][combo - 1] + '!', 0.9, true);
  if (c.ammo[w] <= 0.01) { c.ammo[w] = 0; autoSwitch(c); }
  return true;
}
/** Mine set off under your own car: you're spared, everyone close is thrown clear, and enemy mines nearby are disarmed. */
function kickback(c) {
  for (let i = MINES.length - 1; i >= 0; i--) { const m = MINES[i]; if (m.owner !== c && Math.hypot(m.x - c.x, m.z - c.z) < 12) { m.dead = true; m.mesh.visible = false; MINES.splice(i, 1); sparks(m.x, m.y + 0.3, m.z, 5); } }
  explode(c.x, c.y + 0.3, c.z, 9, 14, c, { spare: c, size: 1.3, push: 24, lift: 9 });
}
function autoSwitch(c) {
  if (c.weapon && c.ammo[c.weapon] > 0.01) return;
  c.weapon = null;
  for (const w of WEAPON_ORDER) if (c.ammo[w] > 0.01) { c.weapon = w; break; }
}
/** Choose the next target: cars ordered by how far they are off the nose, starting with the one most ahead. */
export function cycleTarget(c) {
  const off = o => Math.abs(angDiff(c.yaw, Math.atan2(o.x - c.x, o.z - c.z)));
  const others = G.cars.filter(o => o !== c && o.alive).sort((a, b) => off(a) - off(b));
  c.pref = others.length ? others[(others.indexOf(c.pref) + 1) % others.length] : null;
  if (c.pref) playSfx('click', c.x, c.z, 0.5);
}
export function cycleWeapon(c, dir) {
  const i0 = c.weapon ? WEAPON_ORDER.indexOf(c.weapon) : -1;
  const n = WEAPON_ORDER.length;
  for (let k = 1; k <= n; k++) { const w = WEAPON_ORDER[(i0 + dir * k + n * 2) % n]; if (c.ammo[w] > 0.01) { c.weapon = w; playSfx('click', c.x, c.z, 0.5); return; } }
}
function flameTick(c, dt) {
  c.ammo.flame -= dt; if (c.ammo.flame <= 0) { c.ammo.flame = 0; c.flameOn = false; autoSwitch(c); return; }
  const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
  c.worldPoint(0, c.def.gunY, c.def.front + 0.3, _mz);
  for (let i = 0; i < 3 * fxScale; i++) {
    const a = c.yaw + rand(-0.2, 0.2), s = rand(20, 30);
    FX_ADD.spawn(_mz.x, _mz.y, _mz.z, Math.sin(a) * s + c.vx, rand(-0.5, 2.5), Math.cos(a) * s + c.vz, rand(0.35, 0.5), 0.6, 3.8, 0xfff0a0, 0xff3010, 0.85, 1.8, -3);
  }
  if (Math.random() < 0.3 * fxScale) FX_SMOKE.spawn(_mz.x + fx * 12, _mz.y + 1.5, _mz.z + fz * 12, fx * 4, 3, fz * 4, 1.2, 2, 5, 0x3a3035, 0x7a6a68, 0.35, 1, -1);
  for (const o of G.cars) {
    if (o === c || !o.alive) continue;
    const dx = o.x - c.x, dz = o.z - c.z, d = Math.hypot(dx, dz); if (d > 15) continue;
    const a = Math.acos(clamp((dx * fx + dz * fz) / (d || 1), -1, 1)); if (a > 0.42) continue;
    damageCar(o, 22 * dt, c, 'fire', true); o.flash = Math.max(o.flash, 0.15); o.burning = Math.max(o.burning, 1.3); o.burnBy = c;
  }
  for (const p of PROPS) { if (!p.alive) continue; const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz); if (d < 14 && (dx * fx + dz * fz) / (d || 1) > 0.9) damageProp(p, 25 * dt, c); }
}
function fireSpecial(c) {
  if (c.special <= 0 || c.cdS > 0) return false;
  c.special--; c.cdS = 1.1;
  const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), d = c.def;
  switch (d.id) {
    case 'sundowner': {
      const t = findTarget(c, 65, 0.25, true);
      for (const s of [-1, 1]) {
        c.worldPoint(d.gunX * s, d.gunY + 0.1, d.front + 0.2, _mz);
        if (t) aimAt(_mz, t, 120, carAim(c), _dir); else c.worldDir(0, 0.01, 1, _dir);
        spawnProj({ type: 'cannon', meshName: 'cannon', x: _mz.x, y: _mz.y, z: _mz.z, vx: _dir.x * 120 + c.vx, vy: _dir.y * 120, vz: _dir.z * 120 + c.vz, owner: c, life: 1.2, dmg: 15, r: 0.5 });
        FX_ADD.spawn(_mz.x, _mz.y, _mz.z, c.vx, 0, c.vz, 0.1, 2.5, 1, 0xfff0b0, 0xff8030, 1, 0, 0);
      }
      c.vx -= fx * 4; c.vz -= fz * 4; playSfx('cannon', c.x, c.z, 1); break;
    }
    case 'gravelqueen': {
      c.worldPoint(0, d.gunY + 0.8, -1.2, _mz);
      const t = findTarget(c, 70, 0.6);
      let tx = c.x + fx * 40, tz = c.z + fz * 40; if (t) { tx = t.x + t.vx * 1.2; tz = t.z + t.vz * 1.2; }
      const dx = tx - _mz.x, dz = tz - _mz.z, D = Math.max(8, Math.hypot(dx, dz)), v0 = Math.sqrt(D * 30), vh = v0 * 0.7071;
      spawnProj({ type: 'scrap', meshName: 'scrap', x: _mz.x, y: _mz.y, z: _mz.z, vx: dx / D * vh, vy: v0 * 0.7071 + (ground(tx, tz) - _mz.y) / (D / vh), vz: dz / D * vh, grav: 30, owner: c, life: 6, r: 0.8, spin: 6 });
      playSfx('thump', c.x, c.z, 1); break;
    }
    case 'moonbeam': {
      ring(c.x, c.y + 1, c.z, 24, 0.6, 0xd8a0ff); ring(c.x, c.y + 0.5, c.z, 16, 0.45, 0xffe0a0);
      for (let i = 0; i < 40 * fxScale; i++) { const a = i / 40 * TAU; FX_ADD.spawn(c.x, c.y + 1.2, c.z, Math.sin(a) * 38, rand(0, 4), Math.cos(a) * 38, 0.45, 1.5, 0.3, 0xe0b0ff, 0x7040ff, 0.9, 3, 0); }
      for (const o of G.cars) if (o !== c) { const dd = Math.hypot(o.x - c.x, o.z - c.z); if (dd < 22) { const f = 1 - dd / 26; if (o.alive) damageCar(o, 22 * f, c, 'sonic'); knock(o, c.x, c.z, 34 * f, 12 * f); } }
      for (const p of PROPS) if (p.alive && Math.hypot(p.x - c.x, p.z - c.z) < 20) breakProp(p, c);
      for (const m of MINES) if (Math.hypot(m.x - c.x, m.z - c.z) < 20) m.fuse = 0.2;
      shake(c.x, c.z, 0.8); playSfx('sonic', c.x, c.z, 1); break;
    }
    case 'scorcher': {
      c.boost = 1.8; playSfx('whoosh', c.x, c.z, 1);
      if (c.isPlayer) bigText('Afterburner!', 0.8, true);
      break;
    }
    case 'lawdog': {
      const t = findTarget(c, 40, 0.35);
      c.worldPoint(0, d.gunY + 0.1, d.front + 0.2, _mz);
      if (t) aimAt(_mz, t, 130, 0, _dir); else c.worldDir(0, 0.02, 1, _dir);
      for (let i = 0; i < 9; i++) {
        _v2.copy(_dir); jitter(_v2, 0.16);
        spawnProj({ type: 'bullet', meshName: 'bullet', x: _mz.x, y: _mz.y, z: _mz.z, vx: _v2.x * 130 + c.vx, vy: _v2.y * 130, vz: _v2.z * 130 + c.vz, owner: c, life: 0.3, dmg: 4.2, r: 0.45, knock: 2 });
      }
      FX_ADD.spawn(_mz.x, _mz.y, _mz.z, c.vx, 0, c.vz, 0.12, 3.5, 1, 0xfff0b0, 0xff8030, 1, 0, 0);
      c.vx -= fx * 3; c.vz -= fz * 3; playSfx('cannon', c.x, c.z, 0.9); break;
    }
    case 'bigchill': {
      const t = lure(findTarget(c, 65, 0.5, true));
      c.worldPoint(0, d.gunY + 0.6, d.front + 0.3, _mz);
      if (t) aimAt(_mz, t, 60, carAim(c) * 0.6, _dir); else c.worldDir(0, 0.03, 1, _dir);
      spawnProj({ type: 'ice', meshName: 'ice', x: _mz.x, y: _mz.y, z: _mz.z, vx: _dir.x * 60 + c.vx * 0.5, vy: _dir.y * 60, vz: _dir.z * 60 + c.vz * 0.5, owner: c, life: 2.4, dmg: 15, r: 0.8, target: t, turn: 1.4, speed: 60, maxSpeed: 60 });
      playSfx('ice', c.x, c.z, 1); break;
    }
  }
  return true;
}

// ================= per-frame weapons =================
export function tickCarWeapons(c, dt) {
  c.cdMG -= dt; c.cdW -= dt; c.cdS -= dt;
  if (!c.alive || G.countdown > 0) { c.flameOn = false; return; }
  if (c.mgHeld && c.cdMG <= 0 && !c.mgLocked) fireMG(c);
  if (c.wFire) { fireWeapon(c, c.wCombo); c.wFire = false; c.wCombo = 0; }
  else if (c.wHeld && c.weapon && c.weapon !== 'flame' && c.cdW <= 0 && c.isPlayer) fireWeapon(c, 0);
  c.flameOn = !!(c.wHeld && c.weapon === 'flame' && c.ammo.flame > 0 && c.cdW <= 0);
  if (c.flameOn) flameTick(c, dt);
  if (c.sFire) { fireSpecial(c); c.sFire = false; }
  // afterburner scorches cars behind
  if (c.boost > 0) {
    const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
    for (const o of G.cars) { if (o === c || !o.alive) continue; const dx = o.x - c.x, dz = o.z - c.z, d = Math.hypot(dx, dz); if (d < 12 && (dx * fx + dz * fz) / (d || 1) < -0.75) { damageCar(o, 30 * dt, c, 'fire', true); o.burning = Math.max(o.burning, 1.5); o.burnBy = c; } }
  }
}
function projHit(p) {
  for (const c of G.cars) {
    if (c === p.owner && p.age < 0.6) continue;
    const dx = p.x - c.x, dy = p.y - (c.y + 1.0), dz = p.z - c.z, R = c.radius + p.r;
    if (dx * dx + dy * dy * 1.6 + dz * dz < R * R) return c;
  }
  return null;
}
function propHit(p) {
  for (const pr of PROPS) { if (!pr.alive || p.y > pr.y + pr.h) continue; const dx = p.x - pr.x, dz = p.z - pr.z, R = pr.r + p.r * 0.5; if (dx * dx + dz * dz < R * R) return pr; }
  return null;
}
export function updateProjectiles(dt) {
  updateSmoke(dt);
  for (let i = PROJ.length - 1; i >= 0; i--) {
    const p = PROJ[i]; p.age += dt; p.life -= dt;
    let done = false;
    if (p.life <= 0) { if (!p.inert && p.type !== 'bullet' && p.type !== 'cannon' && p.type !== 'rocket') impact(p, null, null); done = true; }
    if (!done) {
      // guidance: homing weapons steer at their target while they can see it, and lose it after a moment out of sight
      if (p.turn && p.target && p.target.alive) {
        const t = p.target, aimY = t.inert ? 0 : 1;
        p.seeT = (p.seeT || 0) - dt;
        if (p.seeT <= 0) { p.seeT = 0.12; p.sees = t.inert || canSee(p.x, p.y, p.z, t); }
        p.blind = p.sees ? 0 : (p.blind || 0) + dt;
        if (p.blind > 0.35) p.target = null;
        else {
          _v1.set(t.x - p.x, t.y + aimY - p.y, t.z - p.z);
          if (t.inert && _v1.length() < 1.6) { impact(p, null, null); done = true; } // caught the flare
          _v1.normalize(); _v2.set(p.vx, p.vy, p.vz);
          p.speed = Math.min(p.maxSpeed, p.speed + 30 * dt); _v2.normalize();
          if (_v2.dot(_v1) > -0.2) _v2.lerp(_v1, Math.min(1, p.turn * dt)).normalize();
          _v2.multiplyScalar(p.speed); p.vx = _v2.x; p.vy = _v2.y; p.vz = _v2.z;
        }
      } else if (p.type === 'missile') { p.vy -= 2 * dt; }
      if (p.grav) p.vy -= p.grav * dt;
      const sp = Math.hypot(p.vx, p.vy, p.vz), steps = Math.max(1, Math.ceil(sp * dt / 1.3)), sdt = dt / steps;
      for (let s = 0; s < steps && !done; s++) {
        p.x += p.vx * sdt; p.y += p.vy * sdt; p.z += p.vz * sdt;
        if (p.inert) { if (p.y < ground(p.x, p.z) + 0.3) { p.y = ground(p.x, p.z) + 0.3; p.vy = 0; p.vx *= 0.9; p.vz *= 0.9; } continue; }
        const car = projHit(p);
        if (car) { impact(p, car, null); done = true; break; }
        const pr = propHit(p);
        if (pr) { impact(p, null, pr); done = true; break; }
        if (pointBlocked(p.x, p.y, p.z) || outOfBounds(p.x, p.z)) { impact(p, null, null); done = true; break; }
      }
    }
    if (done) { if (p.mesh) p.mesh.visible = false; p.alive = false; PROJ.splice(i, 1); continue; }
    // visuals
    if (p.mesh) {
      p.mesh.position.set(p.x, p.y, p.z);
      if (p.type === 'scrap' || p.type === 'shell' || p.type === 'smokeshell' || p.type === 'minetoss' || p.type === 'ice' || p.type === 'flare') { p.mesh.rotation.x += dt * 8; p.mesh.rotation.y += dt * 5; }
      else { _v1.set(p.x + p.vx, p.y + p.vy, p.z + p.vz); p.mesh.lookAt(_v1); }
    }
    if (p.type === 'missile') {
      FX_SMOKE.spawn(p.x, p.y, p.z, rand(-0.5, 0.5), rand(0, 1), rand(-0.5, 0.5), rand(0.7, 1.1), 0.5, 2.2, 0xd8d0c8, 0xa89a98, 0.55, 1, -0.5);
      FX_ADD.spawn(p.x - p.vx * 0.012, p.y - p.vy * 0.012, p.z - p.vz * 0.012, 0, 0, 0, 0.08, 1, 0.3, 0xfff0a0, 0xff6020, 1, 0, 0);
    } else if (p.type === 'rocket') {
      FX_ADD.spawn(p.x - p.vx * 0.01, p.y - p.vy * 0.01, p.z - p.vz * 0.01, 0, 0, 0, 0.06, 0.8, 0.2, 0xfff0a0, 0xff7020, 1, 0, 0);
      if (Math.random() < 0.5 * fxScale) FX_SMOKE.spawn(p.x, p.y, p.z, 0, 0.5, 0, 0.6, 0.4, 1.4, 0xd8d0c8, 0xb0a8a0, 0.4, 1, 0);
    } else if (p.type === 'flare') {
      for (let k = 0; k < 2 * fxScale; k++) FX_ADD.spawn(p.x, p.y, p.z, rand(-1.5, 1.5), rand(0, 2), rand(-1.5, 1.5), 0.3, 0.7, 0.15, 0xffffff, 0xff6040, 1, 1, 0);
      if (Math.random() < 0.5 * fxScale) FX_SMOKE.spawn(p.x, p.y, p.z, 0, 1.5, 0, 1.5, 0.6, 2.5, 0xe8e0d8, 0xc8c0b8, 0.5, 1, -0.4);
    } else if (p.type === 'shell' || p.type === 'smokeshell') {
      if (Math.random() < 0.6 * fxScale) FX_SMOKE.spawn(p.x, p.y, p.z, 0, 0, 0, 0.6, 0.5, 1.4, 0x8a7a78, 0xb0a8a0, 0.4, 0, 0);
    } else if (p.type === 'fireball') {
      for (let k = 0; k < 2 * fxScale; k++) FX_ADD.spawn(p.x + rand(-0.6, 0.6), p.y + rand(-0.6, 0.6), p.z + rand(-0.6, 0.6), rand(-2, 2), rand(0, 3), rand(-2, 2), rand(0.25, 0.45), 2.4, 0.4, 0xffe070, 0xff2a10, 0.9, 1, -2);
      if (p.mesh) p.mesh.scale.setScalar(1 + Math.sin(p.age * 30) * 0.15);
    } else if (p.type === 'ice') {
      if (Math.random() < 0.7 * fxScale) FX_ADD.spawn(p.x, p.y, p.z, rand(-1, 1), rand(-1, 1), rand(-1, 1), 0.5, 0.8, 0.1, 0xd8f8ff, 0x4f8aff, 0.9, 0, 0);
    } else if (p.type === 'cannon') {
      FX_ADD.spawn(p.x, p.y, p.z, 0, 0, 0, 0.12, 0.9, 0.2, 0xfff0b0, 0xff8030, 0.8, 0, 0);
    }
  }
}
function impact(p, car, prop) {
  const o = p.owner;
  switch (p.type) {
    case 'bullet':
      if (car) { if (car.alive) { damageCar(car, p.dmg, o, 'gun'); if (p.knock) knock(car, o.x, o.z, p.knock, 0); } sparks(p.x, p.y, p.z, 3); if (car.isPlayer || o.isPlayer) playSfx('ping', p.x, p.z, 0.35); }
      else if (prop) { damageProp(prop, p.dmg * 1.5, o); sparks(p.x, p.y, p.z, 2); }
      else if (p.y < ground(p.x, p.z) + 0.3) { if (Math.random() < 0.5) FX_SMOKE.spawn(p.x, p.y + 0.2, p.z, 0, 1.5, 0, 0.5, 0.4, 1.2, 0xc89868, 0xe0b890, 0.5, 0, 0); }
      else sparks(p.x, p.y, p.z, 2);
      break;
    case 'cannon': explode(p.x, p.y, p.z, 3.5, p.dmg, o, { direct: car, size: 0.7, push: 6, lift: 3 }); break;
    case 'missile': explode(p.x, p.y, p.z, 4.2, p.dmg, o, { direct: car, size: 0.9, push: 8, lift: 6 }); break;
    case 'rocket': explode(p.x, p.y, p.z, 2.6, p.dmg, o, { direct: car, size: 0.6, push: 5, lift: 3, spare: p.age < 0.4 ? o : null }); break;
    case 'shell': explode(p.x, p.y, p.z, p.rad, p.dmg, o, { direct: car, size: 1.35, push: 10, lift: 10 }); break;
    case 'smokeshell': explode(p.x, p.y, p.z, 3, 6, o, { direct: car, size: 0.6, push: 4, lift: 2, spare: o }); addSmoke(p.x, p.z); break;
    case 'fireball': explode(p.x, p.y, p.z, 6.5, p.dmg, o, { direct: car, size: 1.5, fire: true, push: 8, lift: 6 }); break;
    case 'ice': explode(p.x, p.y, p.z, 4.5, p.dmg, o, { direct: car, size: 1.0, ice: true, freeze: 3, push: 3, lift: 2 }); break;
    case 'scrap': {
      explode(p.x, p.y, p.z, 5, 12, o, { direct: car, size: 1.1, push: 6, lift: 6 });
      for (let k = 0; k < 5; k++) { const a = k / 5 * TAU + rand(0, 1); spawnProj({ type: 'bomblet', meshName: 'scrap', x: p.x, y: Math.max(p.y, ground(p.x, p.z) + 0.8), z: p.z, vx: Math.sin(a) * rand(8, 13), vy: rand(9, 14), vz: Math.cos(a) * rand(8, 13), grav: 30, owner: o, life: 3, r: 0.5, spin: 8 }); }
      break;
    }
    case 'bomblet': explode(p.x, p.y, p.z, 4.5, 10, o, { direct: car, size: 0.8, push: 6, lift: 6 }); break;
    case 'minetoss': {
      if (car) explode(p.x, p.y, p.z, 6, 24, o, { direct: car, size: 1.3, push: 10, lift: 14 });
      else if (mapAt(p.x).blocked(p.x, p.z, 0)) sparks(p.x, p.y, p.z, 4); // landed somewhere it can't sit: it fizzles
      else { addMine(p.x, p.z, o); const m = MINES[MINES.length - 1]; m.arm = 0.3; m.grace = 0.3; }
      break;
    }
  }
}
export function updateMines(dt, t) {
  for (let i = MINES.length - 1; i >= 0; i--) {
    const m = MINES[i];
    m.arm -= dt; m.grace -= dt; m.life -= dt; m.t += dt;
    m.mesh.userData.light.visible = m.arm <= 0 && (Math.sin(m.t * (m.fuse != null ? 30 : 6)) > 0);
    let boom = m.life <= 0;
    if (m.fuse != null) { m.fuse -= dt; if (m.fuse <= 0) boom = true; }
    if (!boom && m.arm <= 0) {
      for (const c of G.cars) {
        if (!c.alive || (c === m.owner && m.grace > 0)) continue;
        const dx = c.x - m.x, dz = c.z - m.z; if (dx * dx + dz * dz < 10.5 && Math.abs(c.y - m.y) < 2.5) { boom = true; break; }
      }
    }
    if (boom) {
      m.dead = true; m.mesh.visible = false; MINES.splice(i, 1);
      explode(m.x, m.y + 0.6, m.z, 6.5, 26, m.owner, { size: 1.4, push: 8, lift: 17 });
    }
  }
}
