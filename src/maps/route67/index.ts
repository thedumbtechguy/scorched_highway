// Route 67: a three-lap canyon race course with three forks (see track.ts), 6 km east of the ghost town.
import type { Course, GameMap } from '../types';
import { buildRoute67, isBuilt } from './scenery';
import {
  LAPS, PATHS, SECTIONS_BUILT, distance, gridSlots, heading, inGorge, inTunnel, keepOnTrack, offTrack, respawnPoint,
  surfaceSpeed, track, trackHeight, trackRamp, trackRoadLift, trackSolid, trackSurface,
} from './track';

const course: Course = {
  laps: LAPS, sections: SECTIONS_BUILT,
  grid: gridSlots, advance: track, distance, heading, respawn: respawnPoint, fallen: inGorge,
};
export const route67: GameMap = {
  id: 'route67', name: 'Route 67', x0: 3000, x1: 9000, modes: ['race'],
  build: lowQ => buildRoute67(lowQ), isBuilt,
  height: trackHeight, ramp: trackRamp, drawn: trackSurface, roadLift: trackRoadLift, speed: surfaceSpeed,
  collide: keepOnTrack, blocked: offTrack, solid: trackSolid,
  outOfBounds: (x, z) => offTrack(x, z, -40),
  sees: (ax, az, bx, bz) => inTunnel(ax, az) === inTunnel(bx, bz), // nothing homes into or out of the mine shaft
  course,
  drawRadar(x, toR) {
    x.strokeStyle = 'rgba(246,234,212,0.3)'; x.lineCap = 'round';
    for (const path of PATHS) {
      x.lineWidth = Math.max(3, path.half * 0.9); x.beginPath(); let on = false;
      for (let i = 0; i < path.x.length; i += 2) { const [px, py, ok] = toR(path.x[i], path.z[i]); if (ok) { if (on) x.lineTo(px, py); else x.moveTo(px, py); on = true; } else on = false; }
      x.stroke();
    }
  },
};
