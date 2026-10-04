// Route 67: a three-lap canyon race course with three forks (see track.ts), 6 km east of the ghost town.
import type { Course, GameMap } from '../types';
import { PICK, PICKUPS } from '../../world/pickups';
import { buildRoute67, isBuilt } from './scenery';
import {
  LAPS, OBSTACLES, PATHS, SECTIONS_BUILT, SINKHOLES, distance, fallen, gridSlots, heading, inTunnel, keepOnTrack, offTrack, respawnPoint,
  surfaceSpeed, track, trackRamp, trackRoadLift, trackSolid, trackSurface,
} from './track';

const course: Course = {
  laps: LAPS, sections: SECTIONS_BUILT,
  grid: gridSlots, advance: track, distance, heading, respawn: respawnPoint, fallen,
};
export const route67: GameMap = {
  id: 'route67', name: 'Route 67', x0: 3000, x1: 9000, modes: ['race'],
  build: lowQ => buildRoute67(lowQ), isBuilt,
  // ground comes from the built terrain's height grid (see trackSurface)
  height: trackSurface, ramp: trackRamp, drawn: trackSurface, roadLift: trackRoadLift, speed: surfaceSpeed,
  collide: keepOnTrack, blocked: offTrack, solid: trackSolid,
  outOfBounds: (x, z) => offTrack(x, z, -40),
  sees: (ax, az, bx, bz) => inTunnel(ax, az) === inTunnel(bx, bz), // nothing homes into or out of the mine shaft
  course, obstacles: { rocks: OBSTACLES, holes: SINKHOLES },
  drawRadar(x, toR) {
    x.strokeStyle = 'rgba(246,234,212,0.3)'; x.lineCap = 'round';
    for (const path of PATHS) {
      x.lineWidth = Math.max(3, path.half * 0.9); x.beginPath(); let on = false;
      for (let i = 0; i < path.x.length; i += 2) { const [px, py, ok] = toR(path.x[i], path.z[i]); if (ok) { if (on) x.lineTo(px, py); else x.moveTo(px, py); on = true; } else on = false; }
      x.stroke();
    }
    // rocks and sinkholes to steer round, crates to grab
    x.fillStyle = 'rgba(30,17,42,0.85)'; for (const h of SINKHOLES) { const [px, py, ok] = toR(h.x, h.z); if (ok) { x.beginPath(); x.arc(px, py, 5, 0, Math.PI * 2); x.fill(); } }
    x.fillStyle = 'rgba(160,120,90,0.9)'; for (const o of OBSTACLES) { const [px, py, ok] = toR(o.x, o.z); if (ok) x.fillRect(px - 3, py - 3, 6, 6); }
    for (const pk of PICKUPS) { if (!pk.active) continue; const [px, py, ok] = toR(pk.x, pk.z); if (ok) { x.fillStyle = PICK[pk.type].css; x.fillRect(px - 3.5, py - 3.5, 7, 7); } }
  },
};
