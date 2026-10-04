import { explodeFX } from './effects.js';
import { rand } from '../engine/util.js';
import { feed, hudHit } from '../game/hud.js';
import { onCarKilled } from '../game/match.js';
import { G } from '../game/state.js';

// ================= damage =================
/** Share of damage that gets through a shield. */
export const SHIELD_TAKES = 0.25;
export const DIFF = [
  { name: 'Easy', aim: 0.13, mg: 0.45, fire: 0.55, react: 1.1, toPlayer: 0.5, combo: 0.05, speed: 0.9, bias: 0 },
  { name: 'Normal', aim: 0.065, mg: 0.75, fire: 0.8, react: 0.6, toPlayer: 0.75, combo: 0.18, speed: 0.97, bias: 12 },
  { name: 'Hard', aim: 0.03, mg: 0.95, fire: 1, react: 0.3, toPlayer: 1, combo: 0.35, speed: 1, bias: 25 },
];
export function damageCar(c, amt, by, kind, silent) {
  if (!c.alive || amt <= 0 || G.state !== 'playing') return;
  if (G.countdown > 0) return;
  if (c.isPlayer && by && by !== c) amt *= DIFF[G.settings.difficulty].toPlayer;
  if (c.shieldT > 0 && kind !== 'fall') amt *= SHIELD_TAKES; // a shield plate's shield
  c.hp -= amt;
  if (!silent) c.flash = Math.min(0.6, c.flash + 0.35);
  if (by && by !== c) { c.lastHitBy = by; c.lastHitTime = G.time; by.dealt += amt; }
  if (c.isPlayer && !silent) hudHit(amt);
  if (c.hp <= 0) killCar(c, by && by !== c ? by : (G.time - c.lastHitTime < 6 ? c.lastHitBy : null), kind);
}
function killCar(c, by, kind) {
  if (!c.alive) return;
  c.wreck();
  explodeFX(c.x, c.y + 1, c.z, 2.6, { fire: true });
  // splash from exploding car
  for (const o of G.cars) if (o !== c && o.alive) { const d = Math.hypot(o.x - c.x, o.z - c.z); if (d < 8) { damageCar(o, 14 * (1 - d / 8), by || null, 'blast'); knock(o, c.x, c.z, 10 * (1 - d / 8), 5); } }
  if (by) by.kills++;
  c.place = G.cars.filter(o => o.alive).length + 1;
  const vName = c.isPlayer ? 'You' : c.def.driver;
  let msg;
  if (!by) msg = kind === 'fall' ? vName + ' came down too hard' : kind === 'truck' ? vName + ' got flattened by the truck' : kind === 'rock' ? vName + ' got buried in the rockfall' : vName + (c.isPlayer ? ' wrecked yourself' : ' wrecked themselves');
  else msg = (by.isPlayer ? 'You' : by.def.driver) + ' wrecked ' + (c.isPlayer ? 'you' : c.def.driver);
  feed(msg, (by && by.isPlayer) || c.isPlayer);
  onCarKilled(c, by);
}
export function knock(c, fromX, fromZ, power, up) {
  let dx = c.x - fromX, dz = c.z - fromZ; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
  const k = power / c.mass;
  c.vx += dx * k; c.vz += dz * k;
  if (up > 0) {
    c.vy = Math.max(c.vy, up / Math.sqrt(c.mass)); c.y += 0.15; c.grounded = false; c.airT = 0.01;
    if (up > 9 && c.alive) { c.tumbleV = rand(5, 9) * (Math.random() < 0.5 ? -1 : 1); c.tumbleAxis = Math.random() < 0.5 ? 0 : 1; }
  }
}
