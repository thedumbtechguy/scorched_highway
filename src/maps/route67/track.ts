// Route 67's course: a canyon race track with three forks, in the band of world 6 km east of the ghost town
// (see maps/registry). The map module (index.ts) hands the world's ground, collision and sight queries here.
//
// The track is a loop of sections. Plain sections have one path; at a fork the section has two paths that
// split at one node and meet again at the next. The ground is a height field carved around the paths'
// centre lines: inside a path's corridor it's the canyon floor, away from every path it rises to the plateau,
// so forks and the rock between branches fall out of the same function.
import * as THREE from 'three';
import { clamp, lerp } from '../../engine/util.js';
import type { Progress } from '../types';

export const OX = 6000, OZ = 0; // the track's origin in the world
const SCALE = 1.25; // layout units to metres
export const LAPS = 3;

export type Surface = 'dirt' | 'tunnel' | 'asphalt' | 'sand';
interface PathDef { name: string; half: number; surface: Surface; pts: number[][]; gap?: [number, number]; ramp?: boolean; risky?: boolean }
interface SectionDef { paths: PathDef[]; fork?: string }

// layout: x, z (layout units) and floor height y (metres); paths in a section share their first and last point
const N0 = [-60, -30, 0], N1 = [150, 80, 3], N2 = [240, 260, 5], N3 = [40, 350, 8], N4 = [-200, 330, 8], N5 = [-310, 150, 5], N6 = [-300, 15, 3];
const SECTIONS: SectionDef[] = [
  { paths: [{ name: 'Main street', half: 10, surface: 'dirt', pts: [N0, [20, 0, 1], [90, 35, 2], N1] }] },
  {
    fork: 'Mine shaft or canyon road',
    paths: [
      { name: 'Mine shaft', risky: true, half: 6, surface: 'tunnel', pts: [N1, [185, 140, 4], [215, 200, 5], N2] },
      { name: 'Canyon road', half: 9, surface: 'dirt', pts: [N1, [230, 75, 4], [300, 120, 6], [300, 190, 6], [255, 240, 5], N2] },
    ],
  },
  { paths: [{ name: 'Rim road', half: 10, surface: 'dirt', pts: [N2, [200, 320, 6], [120, 350, 7], N3] }] },
  {
    fork: 'Gorge jump or switchback',
    paths: [
      { name: 'Gorge jump', risky: true, half: 8, surface: 'dirt', ramp: true, gap: [0.42, 0.47], pts: [N3, [-20, 352, 8], [-90, 350, 8], [-140, 345, 8], N4] },
      { name: 'Switchback', half: 8, surface: 'dirt', pts: [N3, [20, 410, 9], [-40, 440, 10], [-110, 430, 10], [-150, 390, 9], N4] },
    ],
  },
  { paths: [{ name: 'Mesa run', half: 10, surface: 'dirt', pts: [N4, [-260, 280, 7], [-300, 210, 6], N5] }] },
  {
    fork: 'Old highway or riverbed',
    paths: [
      { name: 'Old highway', risky: true, half: 8, surface: 'asphalt', pts: [N5, [-345, 100, 4], [-330, 50, 3], N6] },
      { name: 'Dry riverbed', half: 13, surface: 'sand', pts: [N5, [-265, 110, 4], [-265, 60, 3], N6] },
    ],
  },
  { paths: [{ name: 'Home straight', half: 10, surface: 'dirt', pts: [N6, [-290, -40, 2], [-250, -75, 1], [-180, -80, 0], [-110, -60, 0], N0] }] },
];

// ---------- sampled paths ----------
const STEP = 3; // metres between samples
export interface Path {
  name: string; half: number; surface: Surface; section: number; index: number; risky: boolean;
  x: Float32Array; z: Float32Array; y: Float32Array; tx: Float32Array; tz: Float32Array; s: Float32Array; len: number;
  gap: [number, number] | null; // metres along the path where the gorge drops away
}
export interface Section { paths: Path[]; fork?: string; start: number; len: number }
export const SECTIONS_BUILT: Section[] = [];
export let LAP_LEN = 0;

function samplePath(def: PathDef, section: number, index: number): Path {
  const curve = new THREE.CatmullRomCurve3(def.pts.map(([x, z, y]) => new THREE.Vector3(OX + x * SCALE, y, OZ + z * SCALE)), false, 'centripetal');
  const n = Math.max(8, Math.round(curve.getLength() / STEP)), pts = curve.getSpacedPoints(n);
  const x = new Float32Array(n + 1), z = new Float32Array(n + 1), y = new Float32Array(n + 1), tx = new Float32Array(n + 1), tz = new Float32Array(n + 1), s = new Float32Array(n + 1);
  for (let i = 0; i <= n; i++) {
    x[i] = pts[i].x; z[i] = pts[i].z; y[i] = pts[i].y;
    if (i) s[i] = s[i - 1] + Math.hypot(x[i] - x[i - 1], z[i] - z[i - 1]);
  }
  for (let i = 0; i <= n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n, i + 1), dx = x[b] - x[a], dz = z[b] - z[a], L = Math.hypot(dx, dz) || 1;
    tx[i] = dx / L; tz[i] = dz / L;
  }
  const len = s[n];
  return { name: def.name, half: def.half, surface: def.surface, section, index, risky: !!def.risky, x, z, y, tx, tz, s, len, gap: def.gap ? [def.gap[0] * len, def.gap[1] * len] : null };
}
SECTIONS.forEach((sd, k) => {
  const paths = sd.paths.map((p, i) => samplePath(p, k, i));
  const len = paths.reduce((a, p) => a + p.len, 0) / paths.length; // a fork counts as its paths' average length
  SECTIONS_BUILT.push({ paths, fork: sd.fork, start: LAP_LEN, len });
  LAP_LEN += len;
});
export const PATHS: Path[] = SECTIONS_BUILT.flatMap(s => s.paths);

// ---------- the gorge jump ----------
export interface Ramp { x: number; z: number; yaw: number; s: number; c: number; len: number; w: number; h: number; base: number }
export const TRACK_RAMPS: Ramp[] = [];
for (const p of PATHS) if (p.gap) {
  // a plank ramp running up to the lip of the gorge
  const len = 15, i = Math.round((p.gap[0] - len / 2 - 0.5) / (p.len / (p.x.length - 1)));
  const yaw = Math.atan2(p.tx[i], p.tz[i]);
  TRACK_RAMPS.push({ x: p.x[i], z: p.z[i], yaw, s: Math.sin(yaw), c: Math.cos(yaw), len, w: p.half * 1.4, h: 3.4, base: p.y[i] });
}
export function trackRamp(x: number, z: number): number {
  for (const R of TRACK_RAMPS) {
    const dx = x - R.x, dz = z - R.z, u = dx * R.s + dz * R.c; if (u < -R.len / 2 || u > R.len / 2) continue;
    const v = dx * R.c - dz * R.s; if (Math.abs(v) > R.w / 2) continue;
    return (u + R.len / 2) / R.len * R.h;
  }
  return 0;
}

// ---------- spatial index of path segments ----------
const CELL = 32, WALL = 16, SHOULDER = 1.8, REACH = 13 + SHOULDER + WALL + 4;
let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
for (const p of PATHS) for (let i = 0; i < p.x.length; i++) { minX = Math.min(minX, p.x[i]); maxX = Math.max(maxX, p.x[i]); minZ = Math.min(minZ, p.z[i]); maxZ = Math.max(maxZ, p.z[i]); }
minX -= REACH + CELL; minZ -= REACH + CELL; maxX += REACH + CELL; maxZ += REACH + CELL;
export const BOUNDS = { minX, minZ, maxX, maxZ };
const NX = Math.ceil((maxX - minX) / CELL), NZ = Math.ceil((maxZ - minZ) / CELL);
/** Per cell: segments (path index * 65536 + sample index) that come within REACH of it. */
const GRID: Int32Array[] = new Array(NX * NZ);
{
  const lists: number[][] = Array.from({ length: NX * NZ }, () => []);
  PATHS.forEach((p, pi) => {
    for (let i = 0; i < p.x.length - 1; i++) {
      const x0 = Math.min(p.x[i], p.x[i + 1]) - REACH, x1 = Math.max(p.x[i], p.x[i + 1]) + REACH, z0 = Math.min(p.z[i], p.z[i + 1]) - REACH, z1 = Math.max(p.z[i], p.z[i + 1]) + REACH;
      for (let cx = Math.floor((x0 - minX) / CELL); cx <= Math.floor((x1 - minX) / CELL); cx++) for (let cz = Math.floor((z0 - minZ) / CELL); cz <= Math.floor((z1 - minZ) / CELL); cz++) lists[cx * NZ + cz].push(pi * 65536 + i);
    }
  });
  lists.forEach((l, i) => { GRID[i] = Int32Array.from(l); });
}
const cellAt = (x: number, z: number) => {
  const cx = Math.floor((x - minX) / CELL), cz = Math.floor((z - minZ) / CELL);
  return cx < 0 || cz < 0 || cx >= NX || cz >= NZ ? null : GRID[cx * NZ + cz];
};

/** Does any path come near the rectangle? (For deciding which terrain tiles to build.) */
export function pathsNear(x0: number, z0: number, x1: number, z1: number): boolean {
  for (let x = x0; x <= x1; x += CELL) for (let z = z0; z <= z1; z += CELL) { const c = cellAt(Math.min(x, x1), Math.min(z, z1)); if (c && c.length) return true; }
  return false;
}
/** The closest point of the path network to (x, z), measured by how far outside its corridor the point is. */
export interface Near { path: Path; i: number; t: number; d: number; e: number; floor: number; side: number; alongside: boolean }
const _near: Near = { path: PATHS[0], i: 0, t: 0, d: 0, e: 0, floor: 0, side: 0, alongside: true };
const GORGE = 34, GORGE_WIDE = 5; // how deep the gorge is, and how far past the road it cuts into the walls
/** How far the gorge drops at distance s along path p (0 outside it). */
function gorgeDrop(p: Path, s: number) {
  return p.gap && s > p.gap[0] && s < p.gap[1] ? GORGE * Math.min(1, (s - p.gap[0]) / 1.5, (p.gap[1] - s) / 1.5) : 0;
}
/** Floor height along segment i at t; `alongside` means the point is level with the segment, not past its ends. */
function segFloor(p: Path, i: number, t: number, alongside = true) {
  const y = lerp(p.y[i], p.y[i + 1], t);
  return alongside ? y - gorgeDrop(p, lerp(p.s[i], p.s[i + 1], t)) : y;
}
/** Nearest corridor to (x, z), or null when no path is near. */
export function nearest(x: number, z: number): Near | null {
  const cell = cellAt(x, z); if (!cell || !cell.length) return null;
  let best = Infinity;
  for (let k = 0; k < cell.length; k++) {
    const p = PATHS[cell[k] >> 16], i = cell[k] & 65535;
    const ax = p.x[i], az = p.z[i], bx = p.x[i + 1] - ax, bz = p.z[i + 1] - az, L2 = bx * bx + bz * bz || 1;
    const raw = ((x - ax) * bx + (z - az) * bz) / L2, t = clamp(raw, 0, 1), px = ax + bx * t - x, pz = az + bz * t - z, d = Math.sqrt(px * px + pz * pz), e = d - p.half;
    if (e < best) { best = e; _near.path = p; _near.i = i; _near.t = t; _near.d = d; _near.e = e; _near.side = Math.sign(bx * (z - az) - bz * (x - ax)); _near.alongside = raw >= 0 && raw <= 1; }
  }
  _near.floor = segFloor(_near.path, _near.i, _near.t, _near.alongside);
  return _near;
}

// ---------- the height field ----------
/** Plateau height above the canyon: a broken mesa top. */
function plateau(x: number, z: number) {
  return 30 + 3 * Math.sin(x * 0.013 + 1.3) * Math.cos(z * 0.011) + 1.5 * Math.sin(x * 0.041 - z * 0.037);
}
/** Canyon wall profile, 0 at the corridor's edge to 1 at the rim, with ledges. */
function wall(e: number, x: number, z: number) {
  // a flat shoulder past the corridor's edge (where the barrier holds cars), then the rock, set back 0-2 m more
  const jitter = SHOULDER + 0.75 + 0.75 * Math.sin(x * 0.09 + z * 0.07) + 0.4 * Math.sin(x * 0.23 - z * 0.19);
  const u = clamp((e - jitter) / WALL, 0, 1); if (u <= 0) return 0;
  const steep = 1 - Math.pow(1 - u, 2.2);
  return clamp(steep + 0.05 * Math.sin(u * 19 + x * 0.05), 0, 1);
}
/** Ground height on Route 67 (ramps excluded). */
export function trackHeight(x: number, z: number): number {
  const top = plateau(x, z), cell = cellAt(x, z); if (!cell) return top;
  let h = top;
  for (let k = 0; k < cell.length; k++) {
    const p = PATHS[cell[k] >> 16], i = cell[k] & 65535;
    const ax = p.x[i], az = p.z[i], bx = p.x[i + 1] - ax, bz = p.z[i + 1] - az, L2 = bx * bx + bz * bz || 1;
    const raw = ((x - ax) * bx + (z - az) * bz) / L2, t = clamp(raw, 0, 1), d = Math.hypot(ax + bx * t - x, az + bz * t - z);
    const e = d - p.half; if (e > REACH) continue;
    const floor = lerp(p.y[i], p.y[i + 1], t) + (e < 0 ? -0.15 * (1 - (d / p.half) ** 2) : 0); // a slight crown down the middle
    let hh = floor + (top - floor) * wall(e, x, z);
    // the gorge cuts straight across, a little wider than the road, with sheer edges where the road stops
    if (p.gap && raw >= 0 && raw <= 1) { const drop = gorgeDrop(p, lerp(p.s[i], p.s[i + 1], t)); if (drop) hh = Math.min(hh, floor - drop + (top - floor + drop) * wall(e - GORGE_WIDE, x, z)); }
    if (hh < h) h = hh;
  }
  return h;
}
let gridS = 0;
/** The terrain mesh's sample spacing, so trackSurface() can follow its flat triangles exactly. */
export function setTrackGrid(spacing: number) { gridS = spacing; }
/** Height of the drawn terrain (flat triangles between samples), for resting things on it. */
export function trackSurface(x: number, z: number): number {
  if (!gridS) return trackHeight(x, z);
  const fx = x / gridS, fz = z / gridS, ix = Math.floor(fx), iz = Math.floor(fz), u = fx - ix, v = fz - iz, x0 = ix * gridS, z0 = iz * gridS;
  if (u + v <= 1) { const h = trackHeight(x0, z0); return h + u * (trackHeight(x0 + gridS, z0) - h) + v * (trackHeight(x0, z0 + gridS) - h); }
  const h = trackHeight(x0 + gridS, z0 + gridS); return h + (1 - u) * (trackHeight(x0, z0 + gridS) - h) + (1 - v) * (trackHeight(x0 + gridS, z0) - h);
}

// ---------- corridor queries ----------
const EDGE = 0.6; // how far past a corridor's edge a car may go before the barrier stops it
/** Push a car back inside the track; returns the impact speed. */
export function keepOnTrack(c: { x: number; z: number; vx: number; vz: number; radius: number }): number {
  const n = nearest(c.x, c.z);
  if (!n) return 0;
  const over = n.e + c.radius * 0.5 - EDGE; if (over <= 0) return 0;
  const p = n.path, px = p.x[n.i] + (p.x[n.i + 1] - p.x[n.i]) * n.t, pz = p.z[n.i] + (p.z[n.i + 1] - p.z[n.i]) * n.t;
  const nx = (px - c.x) / (n.d || 1), nz = (pz - c.z) / (n.d || 1);
  c.x += nx * over; c.z += nz * over;
  const vn = -(c.vx * nx + c.vz * nz); if (vn <= 0) return 0;
  c.vx += 1.3 * vn * nx; c.vz += 1.3 * vn * nz; // bounce off at 30%
  return vn;
}
/** Is (x, z) outside the drivable track (for AI probes and spawning)? */
export function offTrack(x: number, z: number, margin = 0): boolean {
  const n = nearest(x, z); return !n || n.e + margin > EDGE;
}
/** Inside the mine shaft, away from its portals. */
export function inTunnel(x: number, z: number): boolean {
  const n = nearest(x, z); if (!n || n.path.surface !== 'tunnel' || n.e > 1) return false;
  const s = n.path.s[n.i]; return s > PORTAL && s < n.path.len - PORTAL;
}
export const PORTAL = 22, ROOF = 7.5;
/** Solid rock or roof at (x, y, z) beyond what the height field says: the mine shaft's ceiling. */
export function trackSolid(x: number, y: number, z: number): boolean {
  return inTunnel(x, z) && y > (nearest(x, z) as Near).floor + ROOF;
}
/** Off the jump and down in the gorge. */
export function inGorge(x: number, y: number, z: number): boolean {
  const n = nearest(x, z); if (!n || !n.path.gap) return false;
  const s = lerp(n.path.s[n.i], n.path.s[n.i + 1], n.t);
  return s > n.path.gap[0] && s < n.path.gap[1] && y < lerp(n.path.y[n.i], n.path.y[n.i + 1], n.t) - 6;
}
/** How wide each surface's road ribbon is, as a share of the corridor (sand has none). */
export const RIBBON: Record<Surface, number> = { dirt: 0.75, tunnel: 0.8, asphalt: 0.9, sand: 0 };
export const ROAD_LIFT = 0.08;
/** How far the road surface floats above the terrain at (x, z): 0 off the roads. */
export function trackRoadLift(x: number, z: number): number {
  const n = nearest(x, z); return n && n.d < n.path.half * RIBBON[n.path.surface] && !(n.path.gap && inGap(n)) ? ROAD_LIFT : 0;
}
const inGap = (n: Near) => { const s = lerp(n.path.s[n.i], n.path.s[n.i + 1], n.t); return !!n.path.gap && s > n.path.gap[0] - 1 && s < n.path.gap[1] + 1; };
/** Top speed on this surface, relative to dirt. */
export function surfaceSpeed(x: number, z: number): number {
  const n = nearest(x, z); if (!n || n.e > 0) return 1;
  return n.path.surface === 'sand' ? 0.8 : n.path.surface === 'asphalt' ? 1.06 : 1;
}

// ---------- race progress ----------
/** Nearest sample on one path to (x, z), searching around a hint first. */
function onPath(p: Path, x: number, z: number, hint: number): [number, number] {
  let bi = 0, bd = Infinity;
  const scan = (a: number, b: number) => { for (let i = Math.max(0, a); i <= Math.min(p.x.length - 1, b); i++) { const d = (p.x[i] - x) ** 2 + (p.z[i] - z) ** 2; if (d < bd) { bd = d; bi = i; } } };
  scan(hint - 12, hint + 12);
  if (bd > 30 * 30) scan(0, p.x.length - 1);
  return [bi, Math.sqrt(bd)];
}
/** Advance a car's progress to where it is now: moves between sections as it passes nodes, counts laps. */
export function track(pr: Progress, x: number, z: number) {
  const n = SECTIONS_BUILT.length;
  const cand: Array<[number, number]> = [];
  for (const k of [pr.section, (pr.section + 1) % n, (pr.section + n - 1) % n]) SECTIONS_BUILT[k].paths.forEach((_, j) => cand.push([k, j]));
  let best: [number, number, number] = [pr.section, pr.path, pr.i], bd = Infinity;
  for (const [k, j] of cand) {
    const p = SECTIONS_BUILT[k].paths[j], [i, d] = onPath(p, x, z, k === pr.section && j === pr.path ? pr.i : 0);
    // prefer staying put: only switch when clearly closer, and only onto the ends of neighbouring sections
    const atEnd = k === pr.section || (k === (pr.section + 1) % n ? i < 10 : i > p.x.length - 11);
    const score = d + (k === pr.section && j === pr.path ? 0 : 2);
    if (atEnd && score < bd) { bd = score; best = [k, j, i]; }
  }
  const [k, j, i] = best;
  if (k === (pr.section + 1) % n && k !== pr.section) { if (k === 0) pr.lap++; }
  else if (k === (pr.section + n - 1) % n && k !== pr.section) { if (pr.section === 0) pr.lap--; }
  pr.section = k; pr.path = j; pr.i = i;
  const sec = SECTIONS_BUILT[k], p = sec.paths[j];
  pr.s = sec.start + p.s[i] / p.len * sec.len;
}
/** Total distance covered, for ordering cars: laps plus progress round the current one. */
export const distance = (pr: Progress) => pr.lap * LAP_LEN + pr.s;
/** Direction of the track at a car's progress point. */
export function heading(pr: Progress): [number, number] { const p = SECTIONS_BUILT[pr.section].paths[pr.path]; return [p.tx[pr.i], p.tz[pr.i]]; }

/** Starting grid: two columns behind the start line, front row first. */
export function gridSlots(n: number): Array<{ x: number; z: number; yaw: number; progress: Progress }> {
  const last = SECTIONS_BUILT.length - 1, p = SECTIONS_BUILT[last].paths[0], end = p.x.length - 1, out = [];
  for (let k = 0; k < n; k++) {
    const i = end - 3 - Math.floor(k / 2) * 3, side = k % 2 ? -1 : 1, lat = side * 3.4;
    const x = p.x[i] - p.tz[i] * lat * -1, z = p.z[i] - p.tx[i] * lat;
    out.push({ x, z, yaw: Math.atan2(p.tx[i], p.tz[i]), progress: { section: last, path: 0, i, s: 0, lap: 0 } });
  }
  return out;
}
/** Where a car restarts after a wreck: the start of the section it's in, its lane spread by `slot`. */
export function respawnPoint(pr: Progress, slot: number) {
  const sec = SECTIONS_BUILT[pr.section], p = sec.paths[Math.min(pr.path, sec.paths.length - 1)], i = Math.min(4 + (slot % 3) * 3, p.x.length - 2), lat = ((slot % 2) * 2 - 1) * Math.min(3, p.half * 0.4);
  return { x: p.x[i] + p.tz[i] * lat, z: p.z[i] - p.tx[i] * lat, yaw: Math.atan2(p.tx[i], p.tz[i]), i };
}
