// Race: laps round a map's course (see maps/types Course). Starting grid and lights, positions across forks,
// lap times, a finish window once the winner is home, wrecks that respawn with a penalty, falling off the
// course, the wrong-way warning, and how bots drive the racing line.
import { DIFF, damageCar } from '../combat/damage.js';
import { clamp, rand } from '../engine/util.js';
import { bigText, feed } from '../game/hud.js';
import { G, later } from '../game/state.js';
import type { Course, CoursePath, Progress } from '../maps/types';
import { collectPickups } from './shared';
import type { Bot, Car, GameMode } from './types';

export interface RaceState { progress: Progress; finished: number; lapStart: number; lapTimes: number[]; respawnT: number; wrongT: number; best: number }
/** Respawn delay after a wreck, in seconds. */
export const RESPAWN_DELAY = 3;
/** Once the winner is home, everyone else has this long to finish. */
const FINISH_WINDOW = 45;

let course: Course, finishers = 0, spawnSlot = 0, endT = -1;
const cars = () => G.cars as Array<Car & { race: RaceState }>;
const ordinal = (n: number) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
/** "1:07.42" */
export function raceTime(t: number) { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`; }
/** Lap the car is on (1 to the course's laps), for the HUD. */
export const lapOf = (c: Car & { race: RaceState }) => Math.min(course.laps, Math.max(1, c.race.progress.lap));
/** Cars in race order: finishers by time, then everyone else by distance covered. */
export function standings<T extends Car & { race: RaceState }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const fa = a.race.finished, fb = b.race.finished;
    if (fa && fb) return fa - fb; if (fa) return -1; if (fb) return 1;
    return course.distance(b.race.progress) - course.distance(a.race.progress);
  });
}

// ---------- events ----------
function lapDone(c: Car, t: number, lap: number) {
  if (!c.isPlayer) return;
  feed(`Lap ${lap}: ${raceTime(t)}`, true);
  if (lap === course.laps - 1) later(0.2, () => bigText('Final lap!', 1.4));
}
function finished(c: Car, place: number) {
  if (endT < 0) endT = FINISH_WINDOW;
  if (c.isPlayer) { G.endT = 4; G.slowT = 1; bigText(place === 1 ? 'You win!' : `${ordinal(place)} place`, 2.5); }
  else feed(`${c.def.driver} finishes ${ordinal(place)}`, false);
}

// ---------- bots ----------
/** Which way a bot goes at fork k this lap: risky shortcut or safe way, from its style, health and car. */
function pick(bot: Bot, k: number): number {
  const paths = course.sections[k].paths, c = bot.car as Car & { race: RaceState };
  if (paths.length < 2) return 0;
  const routes = (bot.mem.routes ||= {}) as Record<number, { lap: number; path: number }>, lap = c.race.progress.lap, memo = routes[k];
  if (memo && memo.lap === lap) return memo.path;
  const risky = paths.findIndex(p => p.risky), safe = risky === 0 ? 1 : 0;
  // never straight back into whatever it just fell off this lap; less often when hurt or in a slow car
  let chance = c.fellLap === lap || risky < 0 ? 0 : (c.hp / c.def.hp < 0.35 ? 0.1 : bot.pers === 'rammer' ? 0.8 : bot.pers === 'sniper' ? 0.25 : 0.5);
  if (c.def.max < 38) chance *= 0.5;
  const path = Math.random() < chance ? risky : safe; routes[k] = { lap, path }; return path;
}
/** The sample of path p nearest (x, z). */
function nearestSample(p: CoursePath, x: number, z: number) {
  let bi = 0, bd = Infinity; for (let i = 0; i < p.x.length; i++) { const d = (p.x[i] - x) ** 2 + (p.z[i] - z) ** 2; if (d < bd) { bd = d; bi = i; } }
  return bi;
}
/** A point on the racing line ahead of the bot, and the speed the bend beyond it allows. */
function drive(bot: Bot) {
  const c = bot.car as Car & { race: RaceState }, pr = c.race.progress, n = course.sections.length;
  const lane = (bot.mem.lane ??= rand(-0.35, 0.35)) as number;
  let k = pr.section, p: CoursePath = course.sections[k].paths[pr.path], i = pr.i;
  // at a fork, keep to the branch picked even where it overlaps the other one (a ledge climbing away from the road below)
  const chosen = course.sections[k].paths[pick(bot, k)];
  if (chosen !== p) { const j = nearestSample(chosen, c.x, c.z); if (Math.hypot(chosen.x[j] - c.x, chosen.z[j] - c.z) < chosen.half + 3) { p = chosen; i = j; } }
  const walk = (dist: number) => { // follow the chosen paths `dist` metres on
    while (dist > 0) { if (i >= p.x.length - 1) { k = (k + 1) % n; p = course.sections[k].paths[pick(bot, k)]; i = 0; } dist -= p.s[i + 1] - p.s[i]; i++; }
  };
  const t0x = p.tx[i], t0z = p.tz[i];
  walk(9 + c.speed * 0.5);
  const lat = (p.open ? p.open * 0.25 : lane) * p.half, x = p.x[i] + p.tz[i] * lat, z = p.z[i] - p.tx[i] * lat; // on a ledge, hug the wall
  walk(26);
  const turn = Math.acos(clamp(t0x * p.tx[i] + t0z * p.tz[i], -1, 1)); // how much the road bends over the next stretch
  return { x, z, want: c.def.max * c.speedK * (1 - (p.open ? 0.8 : 0.5) * clamp(turn / 1.3, 0, 1)) }; // and take its bends gently
}

export const race: GameMode = {
  id: 'race', name: 'Race', startLabel: 'Start the race', againLabel: 'Race again', lights: true, unarmedHint: '',
  /** Line the cars up on the grid, the player at the back like a challenger. */
  setup(list, map) {
    course = map.course!; finishers = 0; spawnSlot = 0; endT = -1;
    const slots = course.grid(list.length), order = [...list.filter(c => !c.isPlayer), ...list.filter(c => c.isPlayer)];
    order.forEach((c, k) => {
      const s = slots[k]; c.reset(s.x, s.z, s.yaw);
      c.race = { progress: { ...s.progress }, finished: 0, lapStart: 0, lapTimes: [], respawnT: 0, wrongT: 0, best: 0 };
    });
  },
  step(dt, rdt) {
    for (const c of cars()) {
      const r = c.race;
      if (!c.alive) {
        if (r.respawnT > 0 && (r.respawnT -= dt) <= 0) {
          const at = course.respawn(r.progress, spawnSlot++);
          c.respawn(at.x, at.z, at.yaw); r.progress.i = at.i; r.wrongT = 0;
          if (c.isPlayer) bigText('Go!', 0.6);
        }
        continue;
      }
      if (course.fallen(c.x, c.y, c.z)) { c.fellLap = r.progress.lap; damageCar(c, c.hp + 1, G.time - c.lastHitTime < 4 ? c.lastHitBy : null, 'fall'); continue; }
      const lap = r.progress.lap;
      course.advance(r.progress, c.x, c.z);
      if (r.progress.lap > lap && !r.finished) {
        if (lap >= 1) { const t = G.clock - r.lapStart; r.lapTimes.push(t); if (!r.best || t < r.best) r.best = t; lapDone(c, t, lap); }
        r.lapStart = G.clock;
        if (r.progress.lap > course.laps) { r.finished = G.clock; finished(c, ++finishers); }
      }
      // driving the wrong way for more than a moment
      const [hx, hz] = course.heading(r.progress);
      r.wrongT = c.speed > 5 && Math.sin(c.yaw) * hx + Math.cos(c.yaw) * hz < -0.3 ? r.wrongT + dt : 0;
    }
    // a gentle catch-up keeps the pack together; warnings; the finish window
    const p = G.player as Car & { race: RaceState }, pd = course.distance(p.race.progress), diff = DIFF[G.settings.difficulty];
    for (const c of cars()) if (!c.isPlayer) c.speedK = diff.speed * (1 + clamp((pd - course.distance(c.race.progress)) / 600, -0.05, 0.05));
    if (p.alive && p.race.wrongT > 1 && (G.time % 1.2) < dt) bigText('Wrong way!', 0.7);
    if (endT > 0 && G.endT < 0 && (endT -= rdt) <= 0) G.endT = 0.5;
    collectPickups();
  },
  wrecked(c) {
    (c as Car & { race: RaceState }).race.respawnT = RESPAWN_DELAY; // nobody is out: back on the track shortly
    if (c.isPlayer) { G.slowT = 0.5; bigText(`Wrecked! Back in ${RESPAWN_DELAY}`, 1.6); }
  },
  status(player) {
    const p = player as Car & { race: RaceState };
    return [`${ordinal(standings(cars()).indexOf(p) + 1)} of ${G.cars.length} · Lap ${lapOf(p)}/${course.laps}`, raceTime(Math.max(0, p.race.finished || G.clock)).slice(0, -1)];
  },
  results() {
    const p = G.player as Car & { race: RaceState }, order = standings(cars()), place = order.indexOf(p) + 1, first = order[0];
    const done = !!p.race.finished, win = place === 1 && done, s = G.clock | 0;
    return {
      order, win,
      title: win ? 'Winner' : done ? `Finished ${ordinal(place)}` : 'Out of time',
      sub: win ? `${p.def.driver} takes ${G.map.name} in ${raceTime(p.race.finished)}.`
        : first.race.finished ? `${first.isPlayer ? 'You' : first.def.driver} won it in ${raceTime(first.race.finished)}.` : 'Nobody made it home.',
      tiles: [['Wrecks', String(p.kills)], ['Best lap', p.race.best ? raceTime(p.race.best) : '–'], ['Race time', done ? raceTime(p.race.finished) : (s / 60 | 0) + ':' + String(s % 60).padStart(2, '0')]],
      fate: c => { const r = (c as Car & { race: RaceState }).race; return r.finished ? `finished in ${raceTime(r.finished)}` : `on lap ${lapOf(c as Car & { race: RaceState })}`; },
    };
  },
  drive,
};
