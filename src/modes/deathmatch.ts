// Deathmatch: free-for-all, last car running wins. Weapons come from the map's crates.
import { playSfx } from '../audio/audio.js';
import { giveAmmo } from '../combat/arsenal';
import { FX_ADD, fxScale } from '../engine/particles.js';
import { rand } from '../engine/util.js';
import { bigText, feed } from '../game/hud.js';
import { G, later } from '../game/state.js';
import { PICK, PICKUPS, type Pickup } from '../world/pickups';
import type { Car, GameMode } from './types';

const clock = () => { const s = G.clock | 0; return (s / 60 | 0) + ':' + String(s % 60).padStart(2, '0'); };

/** Driving through a crate: repair, special ammo or a weapon (which may push out the weapon you have least of). */
function collect(c: Car, p: Pickup) {
  const t = p.type;
  if (t === 'repair') { if (c.hp >= c.def.hp - 0.5) return; c.hp = Math.min(c.def.hp, c.hp + PICK.repair.amt); c.burning = 0; }
  else if (t === 'special') { if (c.special >= 6) return; c.special = Math.min(6, c.special + 2); }
  else { const dropped = giveAmmo(c, t as never); if (dropped === false) return; if (dropped && c.isPlayer) feed('Dropped ' + PICK[dropped].label + ' to make room', true); }
  p.active = false; p.respawn = t === 'repair' ? 22 : 14;
  for (let i = 0; i < 16 * fxScale; i++) FX_ADD.spawn(p.x, p.y + 1.4, p.z, rand(-6, 6), rand(2, 9), rand(-6, 6), 0.5, 1, 0.1, PICK[t].color, 0xffffff, 0.9, 1.5, 6);
  if (c.isPlayer) { playSfx(t === 'repair' ? 'repair' : 'pickup'); feed(t === 'repair' ? 'Repaired' : '+' + PICK[t].amt + (t === 'flame' ? 's' : '') + ' ' + PICK[t].label, true); }
}

export const deathmatch: GameMode = {
  id: 'deathmatch', name: 'Deathmatch', startLabel: 'Enter the Arena', againLabel: 'Fight again', lights: false,
  unarmedHint: 'Grab a crate for heavy weapons',
  setup(cars, map) {
    const spots = map.spawns!(cars.length);
    cars.forEach((c, i) => { const s = spots[i]; c.reset(s.x, s.z, s.yaw); c.ammo.missile = 3; c.weapon = 'missile'; });
  },
  step() {
    for (const c of G.cars as Car[]) {
      if (!c.alive) continue;
      for (const pk of PICKUPS) {
        if (!pk.active) continue; const dx = c.x - pk.x, dz = c.z - pk.z;
        if (dx * dx + dz * dz < 12 && Math.abs(c.y - pk.y) < 3.5) collect(c, pk);
      }
    }
  },
  wrecked(c, by) {
    if (c.isPlayer) { G.slowT = 0.8; bigText('Wrecked!', 2); G.endT = 3.2; G.result = { by }; }
    const alive = (G.cars as Car[]).filter(o => o.alive);
    if (G.player.alive && alive.length === 1) { G.slowT = 1.2; G.endT = 3; later(0.4, () => bigText('Last one standing!', 2.5)); }
  },
  status: () => [(G.cars as Car[]).filter(c => c.alive).length + ' cars left', clock()],
  results() {
    const p = G.player as Car, cars = G.cars as Car[], win = p.alive, by: Car | null = G.result?.by || null;
    // cars still running (healthiest first), then the wrecks, most recent first
    const order = [...cars.filter(c => c.alive).sort((a, b) => b.hp / b.def.hp - a.hp / a.def.hp), ...cars.filter(c => !c.alive).sort((a, b) => a.place - b.place)];
    return {
      order, win,
      title: win ? 'Last one standing' : 'Wrecked',
      sub: win ? `${p.def.driver} rolls out of town with the ${p.def.name} still smoking.`
        : by ? `${by.def.driver} got the better of you this time.` : 'The desert got the better of you this time.',
      tiles: [['Wrecks', String(p.kills)], ['Damage dealt', String(Math.round(p.dealt))], ['Survived', clock()]],
      fate: c => c.alive ? 'still running' : c.wreckedBy ? `wrecked by ${c.wreckedBy.isPlayer ? 'you' : c.wreckedBy.def.driver.split(' ')[0]}` : 'crashed out',
    };
  },
};
