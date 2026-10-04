// Race rules for Route 67: the starting grid, laps and positions, finishing, wrecks that respawn with a
// penalty, falling into the gorge, and the wrong-way warning.
import { G } from '../game/state.js';
import { LAPS, LAP_LEN, type Progress, distance, gridSlots, heading, inGorge, respawnPoint, track } from './track';

export interface RaceState { progress: Progress; finished: number; lapStart: number; lapTimes: number[]; respawnT: number; wrongT: number; best: number }
/** Respawn delay after a wreck, in seconds. */
export const RESPAWN_DELAY = 3;
type RaceCar = {
  x: number; y: number; z: number; yaw: number; speed: number; alive: boolean; isPlayer: boolean; race: RaceState; hp: number; def: { hp: number };
  reset(x: number, z: number, yaw: number): void; respawn(x: number, z: number, yaw: number): void;
};
let finishers = 0, spawnSlot = 0;

/** Line the cars up on the grid, player at the back like a challenger. */
export function setupRace(cars: RaceCar[]) {
  finishers = 0; spawnSlot = 0;
  const slots = gridSlots(cars.length), order = [...cars.filter(c => !c.isPlayer), ...cars.filter(c => c.isPlayer)];
  order.forEach((c, k) => {
    const s = slots[k]; c.reset(s.x, s.z, s.yaw);
    c.race = { progress: { ...s.progress }, finished: 0, lapStart: 0, lapTimes: [], respawnT: 0, wrongT: 0, best: 0 };
  });
}
/** Lap the car is on (1 to LAPS), for the HUD. */
export const lapOf = (c: RaceCar) => Math.min(LAPS, Math.max(1, c.race.progress.lap));
/** Cars in race order: finishers by time, then everyone else by distance covered. */
export function standings<T extends RaceCar>(cars: T[]): T[] {
  return [...cars].sort((a, b) => {
    const fa = a.race.finished, fb = b.race.finished;
    if (fa && fb) return fa - fb; if (fa) return -1; if (fb) return 1;
    return distance(b.race.progress) - distance(a.race.progress);
  });
}
/** Race time so far, from the green light. */
const now = () => G.clock;

/** Per frame: progress, laps, finishing, the gorge, respawns and wrong way. Calls `onFinish` when a car finishes. */
export function updateRace(cars: RaceCar[], dt: number, events: { lap(c: RaceCar, time: number, lap: number): void; finish(c: RaceCar, place: number): void; fell(c: RaceCar): void; respawned(c: RaceCar): void }) {
  for (const c of cars) {
    const r = c.race;
    if (!c.alive) {
      if (r.respawnT > 0 && (r.respawnT -= dt) <= 0) {
        const at = respawnPoint(r.progress, spawnSlot++);
        c.respawn(at.x, at.z, at.yaw); r.progress.i = at.i; r.wrongT = 0;
        events.respawned(c);
      }
      continue;
    }
    if (inGorge(c.x, c.y, c.z)) { events.fell(c); continue; }
    const lap = r.progress.lap;
    track(r.progress, c.x, c.z);
    if (r.progress.lap > lap && !r.finished) {
      if (lap >= 1) { const t = now() - r.lapStart; r.lapTimes.push(t); if (!r.best || t < r.best) r.best = t; events.lap(c, t, lap); }
      r.lapStart = now();
      if (r.progress.lap > LAPS) { r.finished = now(); events.finish(c, ++finishers); }
    }
    // driving the wrong way for more than a moment
    const [hx, hz] = heading(r.progress);
    r.wrongT = c.speed > 5 && Math.sin(c.yaw) * hx + Math.cos(c.yaw) * hz < -0.3 ? r.wrongT + dt : 0;
  }
}
/** Start a wrecked car's respawn countdown. */
export function wrecked(c: RaceCar) { c.race.respawnT = RESPAWN_DELAY; }
/** "1:07.42" */
export function raceTime(t: number) { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`; }
export { LAPS, LAP_LEN };
