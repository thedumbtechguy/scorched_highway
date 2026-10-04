// Deathmatch: free-for-all, last car running wins. Weapons come from the map's crates.
import { bigText } from '../game/hud.js';
import { G, later } from '../game/state.js';
import { collectPickups } from './shared';
import type { Car, GameMode } from './types';

const clock = () => { const s = G.clock | 0; return (s / 60 | 0) + ':' + String(s % 60).padStart(2, '0'); };

export const deathmatch: GameMode = {
  id: 'deathmatch', name: 'Deathmatch', startLabel: 'Enter the Arena', againLabel: 'Fight again', lights: false,
  unarmedHint: 'Grab a crate for heavy weapons',
  setup(cars, map) {
    const spots = map.spawns!(cars.length);
    cars.forEach((c, i) => { const s = spots[i]; c.reset(s.x, s.z, s.yaw); c.ammo.missile = 3; c.weapon = 'missile'; });
  },
  step: () => collectPickups(),
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
