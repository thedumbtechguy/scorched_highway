// The ghost town: a free-for-all arena around a 1977 desert town, ringed by a canyon wall. Also the backdrop
// for the title screen and the garage.
import { buildScatter, buildTumbleweeds } from '../../world/flora';
import { BOXES, buildProps, buildStatic, buildTerrain, decorBlocked } from './scenery.js';
import { PICK, PICKUPS, type PickSpot, buildPickups } from '../../world/pickups';
import { blocked, collide, solid } from './collision.js';
import { roadLift } from './roads';
import { ARENA_R, baseHeight, rampHeight, surfaceHeight } from './terrain.js';
import type { GameMap, Spot } from '../types';

const W_POOL = ['missile', 'rockets', 'mortar', 'mines', 'flame', 'missile', 'rockets', 'special'];
/** Crate locations: repairs in the middle and on two flanks, weapons around town, special ammo out by the wall. */
const PICK_SPOTS: PickSpot[] = [
  [0, 0, ['repair']], [-120, -20, ['repair']], [130, 60, ['repair']],
  [-38, 3, W_POOL], [36, -3, W_POOL], [4, 28, W_POOL], [-14, -32, W_POOL],
  [-80, -80, W_POOL], [-140, 40, W_POOL], [-60, 80, W_POOL], [10, 80, W_POOL], [80, 20, W_POOL], [120, -40, W_POOL],
  [40, -80, W_POOL], [-20, -122, W_POOL], [-100, 130, W_POOL], [90, -110, W_POOL], [150, -10, ['special', 'rockets']], [-150, -40, ['special', 'mortar']],
];
/** Starting spots round the edge of town, everyone facing the middle. */
const SPAWNS = [[0, 118], [102, 59], [102, -59], [0, -118], [-92, -38], [-102, 59]];

let built = false;
export const ghostTown: GameMap = {
  id: 'ghost-town', name: 'Ghost Town', x0: -3000, x1: 3000, modes: ['deathmatch'],
  build(lowQ, timed = (_name, fn) => fn()) {
    if (built) return; built = true;
    timed('terrain', () => buildTerrain(lowQ));
    timed('town', () => buildStatic());
    timed('props', () => { buildProps(); buildPickups(PICK_SPOTS); });
    timed('scatter', () => { buildScatter({ lowQ, blocked: decorBlocked }); buildTumbleweeds(lowQ ? 4 : 8, baseHeight); });
  },
  isBuilt: () => built,
  height: baseHeight, ramp: rampHeight, drawn: surfaceHeight, roadLift, speed: () => 1,
  collide, blocked, solid,
  outOfBounds: (x, z) => Math.hypot(x, z) > 215,
  spawns(n) {
    return SPAWNS.slice().sort(() => Math.random() - 0.5).slice(0, n).map(([x, z]): Spot => ({ x, z, yaw: Math.atan2(-x, -z) }));
  },
  drawRadar(x, toR, R, range) {
    const [ax, ay] = toR(0, 0);
    x.strokeStyle = 'rgba(232,102,42,0.5)'; x.lineWidth = 2; x.beginPath(); x.arc(ax, ay, ARENA_R / range * (R - 8), 0, Math.PI * 2); x.stroke();
    x.fillStyle = 'rgba(246,234,212,0.18)'; for (const b of BOXES) { const [bx, by, ok] = toR((b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2); if (ok) x.fillRect(bx - 3, by - 3, 6, 6); }
    for (const pk of PICKUPS) { if (!pk.active) continue; const [px, py, ok] = toR(pk.x, pk.z); if (!ok) continue; x.fillStyle = PICK[pk.type].css; x.fillRect(px - 3.5, py - 3.5, 7, 7); }
  },
};
