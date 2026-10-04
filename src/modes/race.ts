// Race: laps round a map's course (see maps/types Course). Starting grid and lights, positions across forks,
// lap times, a finish window once the winner is home, wrecks that respawn with a penalty, falling off the
// course, the wrong-way warning, plates (see plates.ts), rubber banding and slipstreams, and how bots drive the
// racing line.
import { damageCar } from '../combat/damage.js';
import { clamp, rand } from '../engine/util.js';
import { bigText, feed } from '../game/hud.js';
import { G, later } from '../game/state.js';
import type { Course, CoursePath, PlateTag, Progress } from '../maps/types';
import { type PlateRules, drivePlates } from './plates';
import { collectPickups } from './shared';
import { PLATES } from '../world/plates';
import type { Bot, Car, GameMode } from './types';

export interface RaceState { progress: Progress; finished: number; lapStart: number; lapTimes: number[]; respawnT: number; wrongT: number; best: number }
/** Respawn delay after a wreck, in seconds. */
export const RESPAWN_DELAY = 3;
/** Once the winner is home, everyone else has this long to finish. */
const FINISH_WINDOW = 45;
/**
 * Rubber banding, by difficulty: a bot behind you gets up to `up` more top speed and one ahead of you up to `down`
 * less, in full once the gap is BAND metres. Easy pulls the field back to you harder; Hard mostly helps the bots.
 */
export const RUBBER = [{ up: 0.04, down: 0.12 }, { up: 0.08, down: 0.08 }, { up: 0.12, down: 0.04 }], BAND = 300;
/**
 * Bots' pace, by difficulty, as a share of the player's car: in a race every bot's top speed and acceleration are
 * matched to the car the player picked (heavy cars aren't hopeless, fast ones aren't untouchable), then each one
 * gets a few percent either way so the field spreads out.
 */
export const PACE = [0.9, 0.99, 1.05], SPREAD = 0.03;
/** How often bots take the risky shortcut at a fork, by difficulty. */
export const SHORTCUTS = [0.35, 0.7, 0.9];
/** Slipstream: tucked in close behind another car at speed, top speed rises by up to this much. */
export const DRAFT = 0.07;

let course: Course, finishers = 0, spawnSlot = 0, endT = -1, leader: Car | null = null;
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
  // how often bots take the shortcuts depends on the difficulty, then a little on character; hardly ever when badly hurt
  const nerve = SHORTCUTS[G.settings.difficulty] + (bot.pers === 'rammer' ? 0.1 : bot.pers === 'sniper' ? -0.15 : 0);
  const chance = c.fellLap === lap || risky < 0 ? 0 : c.hp / c.def.hp < 0.35 ? 0.1 : nerve;
  const path = Math.random() < chance ? risky : safe; routes[k] = { lap, path }; return path;
}
/** The sample of path p nearest (x, z). */
function nearestSample(p: CoursePath, x: number, z: number) {
  let bi = 0, bd = Infinity; for (let i = 0; i < p.x.length; i++) { const d = (p.x[i] - x) ** 2 + (p.z[i] - z) ** 2; if (d < bd) { bd = d; bi = i; } }
  return bi;
}
/** The lane (lateral offset) of a plate coming up on path p near sample i that the bot wants, or null. */
function plateFor(bot: Bot, p: CoursePath, i: number): number | null {
  const c = bot.car, hurt = c.hp / c.def.hp < 0.7;
  let best = 0, lat: number | null = null;
  for (const pl of PLATES) {
    const tag = pl.tag as PlateTag | undefined;
    if (!pl.armed || !tag || tag.path !== p || tag.i < i - 6 || tag.i > i + 14) continue;
    const want = pl.type === 'shield' ? (hurt ? 3 : 0.5) : pl.type === 'sword' ? (c.mgLocked ? 2.5 : 1) : leader !== c && bot.pers !== 'sniper' ? 0.8 : 0; // skulls: only to catch whoever's in front
    if (want > best) { best = want; lat = -tag.across; }
  }
  return lat;
}
/** How sharply each sample of a path bends (radians per metre, over about 18 m), cached. */
const BEND = new WeakMap<CoursePath, Float32Array>();
function bendOf(p: CoursePath) {
  let k = BEND.get(p); if (k) return k;
  const n = p.x.length; k = new Float32Array(n);
  for (let i = 0; i < n; i++) { const a = Math.max(0, i - 3), b = Math.min(n - 1, i + 3); k[i] = Math.acos(clamp(p.tx[a] * p.tx[b] + p.tz[a] * p.tz[b], -1, 1)) / (p.s[b] - p.s[a] || 1); }
  BEND.set(p, k); return k;
}
/** Braking the bots plan on (m/s², a little under what the brakes give) and how much of the car's turning they use. */
const BRAKE = 18, TURN_USE = 0.85;
/**
 * A point on the racing line ahead of the bot, and the speed it may carry now: the fastest speed from which it
 * can still brake down to every bend's limit before reaching it. A bend's limit is the speed at which the car's
 * steering (which weakens with speed, see cars/car.js) can just follow it.
 */
function drive(bot: Bot) {
  const c = bot.car as Car & { race: RaceState }, pr = c.race.progress, n = course.sections.length, d = c.def;
  const lane = (bot.mem.lane ??= rand(-0.35, 0.35)) as number;
  let k = pr.section, p: CoursePath = course.sections[k].paths[pr.path], i = pr.i;
  // at a fork, keep to the branch picked even where it overlaps the other one (a ledge climbing away from the road below)
  const chosen = course.sections[k].paths[pick(bot, k)];
  if (chosen !== p) { const j = nearestSample(chosen, c.x, c.z); if (Math.hypot(chosen.x[j] - c.x, chosen.z[j] - c.z) < chosen.half + 3) { p = chosen; i = j; } }
  const top = d.max * c.speedK, a = d.turn * TURN_USE, horizon = top * top / (2 * BRAKE) + 20;
  let want = top, gone = 0, aim: [number, number] | null = null;
  const reach = 9 + c.speed * 0.5;
  // walk the chosen paths ahead: where to steer, and the slowest bend coming up
  while (gone < Math.max(horizon, reach)) {
    if (i >= p.x.length - 1) { k = (k + 1) % n; p = course.sections[k].paths[pick(bot, k)]; i = 0; continue; }
    gone += p.s[i + 1] - p.s[i]; i++;
    if (!aim && gone >= reach) {
      let lat = (p.open ? p.open * 0.25 : lane) * p.half; // on a ledge, hug the wall
      const plate = plateFor(bot, p, i); if (plate !== null) lat = plate;
      aim = [p.x[i] + p.tz[i] * lat, p.z[i] - p.tx[i] * lat];
    }
    const bend = bendOf(p)[i] * (p.open ? 1.25 : 1); // and give a ledge's bends some room
    if (bend > 1e-4) { const limit = a / (bend + 0.3 * a / d.max); want = Math.min(want, Math.sqrt(limit * limit + 2 * BRAKE * Math.max(0, gone - 8))); }
  }
  return { x: aim![0], z: aim![1], want };
}
/** A bot's top-speed scale before rubber banding: the player's car's top speed, at the difficulty's pace, give or take its own spread. */
const paceOf = new WeakMap<Car, number>();
function pace(c: Car): number {
  let k = paceOf.get(c);
  if (k === undefined) {
    k = (G.player as Car).def.max * PACE[G.settings.difficulty] * (1 + rand(-SPREAD, SPREAD)) / c.def.max; paceOf.set(c, k);
    c.accelK = Math.max(1, (G.player as Car).def.accel / c.def.accel * k); // and the acceleration to get there
  }
  return k;
}
/** Right behind another running car, close and lined up, at speed. */
function inSlipstream(c: Car): boolean {
  if (!c.alive || c.speed < 18) return false;
  const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
  for (const o of G.cars as Car[]) {
    if (o === c || !o.alive) continue;
    const dx = o.x - c.x, dz = o.z - c.z, d = Math.hypot(dx, dz);
    if (d > 3 && d < 24 && (dx * fx + dz * fz) / d > 0.97) return true;
  }
  return false;
}
const RULES: PlateRules = {
  rank: c => { const order = standings(cars()); return order.length > 1 ? order.indexOf(c as Car & { race: RaceState }) / (order.length - 1) : 0; },
  ahead: (c, s) => { const L = course.lapLength, d = s - (c as Car & { race: RaceState }).race.progress.s; return ((d % L) + L) % L; },
};

export const race: GameMode = {
  id: 'race', name: 'Race', startLabel: 'Start the race', againLabel: 'Race again', lights: true, unarmedHint: 'Sword plates and crates arm you',
  rivalry: 35, // bots are racing you: they'd rather shoot you than each other
  /** Line the cars up on the grid, the player at the back like a challenger. */
  setup(list, map) {
    course = map.course!; finishers = 0; spawnSlot = 0; endT = -1; leader = null;
    const slots = course.grid(list.length), order = [...list.filter(c => !c.isPlayer), ...list.filter(c => c.isPlayer)];
    order.forEach((c, k) => {
      const s = slots[k]; c.reset(s.x, s.z, s.yaw);
      c.race = { progress: { ...s.progress }, finished: 0, lapStart: 0, lapTimes: [], respawnT: 0, wrongT: 0, best: 0 };
      c.mgLocked = true; // no machine gun until a sword plate
      c.accelK = 1;
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
    // rubber banding and slipstreams; warnings; plates; the finish window
    const p = G.player as Car & { race: RaceState }, pd = course.distance(p.race.progress);
    const band = G.settings.rubber === 'off' ? { up: 0, down: 0 } : RUBBER[G.settings.difficulty];
    for (const c of cars()) {
      c.draft = clamp(c.draft + (inSlipstream(c) ? dt * 2 : -dt * 2), 0, 1);
      const gap = pd - course.distance(c.race.progress), k = gap > 0 ? band.up * clamp(gap / BAND, 0, 1) : -band.down * clamp(-gap / BAND, 0, 1);
      c.speedK = (c.isPlayer ? 1 : pace(c) * (1 + k)) * (1 + DRAFT * c.draft);
    }
    leader = standings(cars())[0];
    if (p.alive && p.race.wrongT > 1 && (G.time % 1.2) < dt) bigText('Wrong way!', 0.7);
    if (endT > 0 && G.endT < 0 && (endT -= rdt) <= 0) G.endT = 0.5;
    collectPickups(); drivePlates(RULES);
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
