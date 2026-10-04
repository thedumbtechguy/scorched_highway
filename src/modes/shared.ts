// Rules several modes share.
import { playSfx } from '../audio/audio.js';
import { giveAmmo } from '../combat/arsenal';
import { FX_ADD, fxScale } from '../engine/particles.js';
import { rand } from '../engine/util.js';
import { feed } from '../game/hud.js';
import { G } from '../game/state.js';
import { PICK, PICKUPS, type Pickup } from '../world/pickups';
import type { Car } from './types';

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

/** Every car still running picks up any crate it drives through. */
export function collectPickups() {
  for (const c of G.cars as Car[]) {
    if (!c.alive) continue;
    for (const pk of PICKUPS) {
      if (!pk.active) continue; const dx = c.x - pk.x, dz = c.z - pk.z;
      if (dx * dx + dz * dz < 12 && Math.abs(c.y - pk.y) < 3.5) collect(c, pk);
    }
  }
}
