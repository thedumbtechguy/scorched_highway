// Route 67's course, in the band of world 6 km east of the ghost town (see maps/registry). The map module
// (index.ts) hands the world's ground, collision and sight queries here.
//
// A lap runs through three kinds of country: open desert flats around the start, slot canyons and washes cut
// into the mesas, and a cliff road along a mesa face. The course is a loop of sections; at a fork a section has
// two paths that split at one node and meet at the next. The ground is a height field shaped around the paths'
// centre lines, each path in its own style:
// - desert: a low berm at the road's edge, open dunes beyond, mesa cliffs far off;
// - canyon: rock walls rising from a shoulder at the road's edge to the mesa top;
// - ledge: a shelf on a cliff face, rock wall on one side and a sheer drop on the other, down to the road below.
// Where paths meet, the lowest ground wins, so forks and the rock between branches fall out of one function.
import * as THREE from 'three';
import { clamp, lerp, smooth } from '../../engine/util.js';
import type { Progress } from '../types';

export const OX = 6000, OZ = 0; // the course's origin in the world
export const LAPS = 3;

export type Surface = 'dirt' | 'tunnel' | 'asphalt' | 'sand';
export type Style = 'desert' | 'canyon' | 'ledge';
interface PathDef {
  name: string; half: number; surface: Surface; style: Style; pts: number[][];
  risky?: boolean;
  gap?: [number, number]; // a gorge across the road, as fractions of the path
  below?: string; // ledge: the path the drop falls to
}
interface SectionDef { paths: PathDef[]; fork?: string }

// layout in metres: x, z and floor height y; paths in a section share their first and last point
const N0 = [-60, -30, 0], N1 = [360, 130, 2], N2 = [420, 420, 4], N3 = [230, 535, 2], N4 = [-60, 520, 2], N4b = [-110, 490, 3], N5 = [-260, 330, 4], N6 = [-220, 120, 1];
const SECTIONS: SectionDef[] = [
  { paths: [{ name: 'Desert flats', half: 16, surface: 'dirt', style: 'desert', pts: [N0, [60, -10, 0], [180, 10, 1], [290, 55, 1], N1] }] },
  {
    fork: 'Mine shaft or dry wash',
    paths: [
      { name: 'Mine shaft', risky: true, half: 6, surface: 'tunnel', style: 'canyon', pts: [N1, [395, 230, 3], [415, 330, 4], N2] },
      { name: 'Dry wash', half: 14, surface: 'sand', style: 'canyon', pts: [N1, [460, 160, 2], [530, 250, 3], [525, 350, 4], N2] },
    ],
  },
  { paths: [{ name: 'Canyon run', half: 10, surface: 'dirt', style: 'canyon', pts: [N2, [370, 495, 4], [280, 528, 3], N3] }] },
  {
    fork: 'Cliff road or boulder alley',
    paths: [
      { name: 'Cliff road', risky: true, half: 5.5, surface: 'dirt', style: 'ledge', below: 'Boulder alley', pts: [N3, [208, 556, 2.5], [170, 570, 11], [130, 576, 19], [40, 578, 20], [0, 572, 12], [-32, 553, 3], N4] },
      { name: 'Boulder alley', half: 10, surface: 'sand', style: 'canyon', pts: [N3, [190, 545, 2], [130, 557, 2], [40, 560, 2], [-20, 543, 2], N4] },
    ],
  },
  { paths: [{ name: 'Mesa gap', half: 10, surface: 'dirt', style: 'canyon', pts: [N4, [-85, 505, 2], N4b] }] },
  {
    fork: 'Gorge jump or switchback',
    paths: [
      { name: 'Gorge jump', risky: true, half: 8, surface: 'dirt', style: 'canyon', gap: [0.44, 0.5], pts: [N4b, [-160, 440, 4], [-210, 385, 4], N5] },
      { name: 'Switchback', half: 8, surface: 'dirt', style: 'canyon', pts: [N4b, [-140, 560, 4], [-215, 575, 5], [-280, 520, 5], [-305, 420, 4], N5] },
    ],
  },
  { paths: [{ name: 'Canyon exit', half: 10, surface: 'dirt', style: 'canyon', pts: [N5, [-270, 230, 3], N6] }] },
  { paths: [{ name: 'Home straight', half: 16, surface: 'dirt', style: 'desert', pts: [N6, [-180, 50, 0], [-120, -20, 0], N0] }] },
];

// Things on the course, placed by path, fraction along it and metres to the side.
type At = [string, number, number];
/** Boulders on the road to steer round: [path, along, across, radius]. */
const ROCKS: Array<[...At, number]> = [
  ['Desert flats', 0.22, -8, 2.2], ['Desert flats', 0.68, 7, 1.8], ['Desert flats', 0.86, -4, 1.5],
  ['Dry wash', 0.3, 5, 2.5], ['Dry wash', 0.55, -6, 2], ['Dry wash', 0.75, 3, 1.6],
  ['Boulder alley', 0.18, 4, 2], ['Boulder alley', 0.33, -5, 2.4], ['Boulder alley', 0.47, 2, 1.8], ['Boulder alley', 0.6, -3, 2.2], ['Boulder alley', 0.76, 5, 2],
  ['Canyon exit', 0.5, -2, 1.5], ['Home straight', 0.62, -9, 2],
];
/** Sinkholes: fall in and you're wrecked. [path, along, across, radius]. */
const HOLES: Array<[...At, number]> = [
  ['Desert flats', 0.48, 6, 4.5], ['Dry wash', 0.42, 0, 4], ['Home straight', 0.38, -5, 4.5],
];
/** Jump ramps (over the sinkhole on the flats): [path, along, across]. */
const JUMPS: At[] = [['Desert flats', 0.43, 6]];
/** Explosive barrels, in clusters of three: [path, along, across]. */
export const BARRELS: At[] = [['Desert flats', 0.6, -12], ['Canyon run', 0.5, 7], ['Home straight', 0.25, 11], ['Boulder alley', 0.86, -6]];
const W = ['missile', 'rockets', 'mortar', 'mines', 'flame'];
/** Crates: [path, along, across, what can appear]. */
const CRATES: Array<[...At, string[]]> = [
  ['Desert flats', 0.32, 0, W], ['Desert flats', 0.8, -6, ['repair', 'special']], ['Dry wash', 0.5, -3, W], ['Canyon run', 0.3, 0, W],
  ['Cliff road', 0.45, 0, W], ['Cliff road', 0.7, 0, ['special']], ['Boulder alley', 0.68, 4, ['repair']], ['Switchback', 0.5, 0, W],
  ['Canyon exit', 0.6, 3, W], ['Home straight', 0.75, 5, W], ['Home straight', 0.18, -5, ['repair']],
];

// ---------- sampled paths ----------
const STEP = 3; // metres between samples
export interface Path {
  name: string; half: number; surface: Surface; style: Style; section: number; index: number; risky: boolean;
  x: Float32Array; z: Float32Array; y: Float32Array; tx: Float32Array; tz: Float32Array; s: Float32Array; len: number;
  gap: [number, number] | null; // metres along the path where the gorge drops away
  /** Ledge: which side the drop is on (in nearest()'s `side` sign), the height of the road below, and how wide the fall zone is. */
  open: number; below: number; fallWidth: number;
}
export interface Section { paths: Path[]; fork?: string; start: number; len: number }
export const SECTIONS_BUILT: Section[] = [];
export let LAP_LEN = 0;

function samplePath(def: PathDef, section: number, index: number): Path {
  const curve = new THREE.CatmullRomCurve3(def.pts.map(([x, z, y]) => new THREE.Vector3(OX + x, y, OZ + z)), false, 'centripetal');
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
  return {
    name: def.name, half: def.half, surface: def.surface, style: def.style, section, index, risky: !!def.risky, x, z, y, tx, tz, s, len,
    gap: def.gap ? [def.gap[0] * len, def.gap[1] * len] : null, open: 0, below: 0, fallWidth: 0,
  };
}
SECTIONS.forEach((sd, k) => {
  const paths = sd.paths.map((p, i) => samplePath(p, k, i));
  const len = paths.reduce((a, p) => a + p.len, 0) / paths.length; // a fork counts as its paths' average length
  SECTIONS_BUILT.push({ paths, fork: sd.fork, start: LAP_LEN, len });
  LAP_LEN += len;
});
export const PATHS: Path[] = SECTIONS_BUILT.flatMap(s => s.paths);
const byName = (name: string) => { const p = PATHS.find(q => q.name === name); if (!p) throw new Error('no path ' + name); return p; };
/** World position of [path, along, across]. */
export function place([name, along, across]: At) {
  const p = byName(name), i = Math.round(along * (p.x.length - 1));
  return { x: p.x[i] - p.tz[i] * across, z: p.z[i] + p.tx[i] * across, y: p.y[i], yaw: Math.atan2(p.tx[i], p.tz[i]), path: p, i };
}
// ledges: find which side the road below is on, how far down it is and how wide the drop zone must be
SECTIONS.forEach((sd, k) => sd.paths.forEach((d, j) => {
  if (!d.below) return;
  const p = SECTIONS_BUILT[k].paths[j], q = byName(d.below), m = Math.round(p.x.length / 2);
  let qi = 0, qd = Infinity; for (let i = 0; i < q.x.length; i++) { const dd = (q.x[i] - p.x[m]) ** 2 + (q.z[i] - p.z[m]) ** 2; if (dd < qd) { qd = dd; qi = i; } }
  p.open = Math.sign(p.tx[m] * (q.z[qi] - p.z[m]) - p.tz[m] * (q.x[qi] - p.x[m]));
  p.below = q.y[qi]; p.fallWidth = Math.sqrt(qd) - p.half + q.half;
}));

// ---------- ramps: the gorge jump's plank ramp and jumps on the flats ----------
export interface Ramp { x: number; z: number; yaw: number; s: number; c: number; len: number; w: number; h: number; base: number }
export const TRACK_RAMPS: Ramp[] = [];
function addRamp(x: number, z: number, yaw: number, len: number, w: number, h: number, base: number) {
  TRACK_RAMPS.push({ x, z, yaw, s: Math.sin(yaw), c: Math.cos(yaw), len, w, h, base });
}
for (const p of PATHS) if (p.gap) {
  const len = 15, i = Math.round((p.gap[0] - len / 2 - 0.5) / (p.len / (p.x.length - 1)));
  addRamp(p.x[i], p.z[i], Math.atan2(p.tx[i], p.tz[i]), len, p.half * 1.4, 3.4, p.y[i]);
}
for (const j of JUMPS) { const at = place(j); addRamp(at.x, at.z, at.yaw, 10, 7, 2.2, at.y); }
export function trackRamp(x: number, z: number): number {
  for (const R of TRACK_RAMPS) {
    const dx = x - R.x, dz = z - R.z, u = dx * R.s + dz * R.c; if (u < -R.len / 2 || u > R.len / 2) continue;
    const v = dx * R.c - dz * R.s; if (Math.abs(v) > R.w / 2) continue;
    return (u + R.len / 2) / R.len * R.h;
  }
  return 0;
}

// ---------- obstacles ----------
export interface Rock { x: number; z: number; r: number; top: number }
export const OBSTACLES: Rock[] = ROCKS.map(([n, a, c, r]) => { const at = place([n, a, c]); return { x: at.x, z: at.z, r, top: at.y + r * 1.3 }; });
export interface Hole { x: number; z: number; r: number; floor: number }
export const SINKHOLES: Hole[] = HOLES.map(([n, a, c, r]) => { const at = place([n, a, c]); return { x: at.x, z: at.z, r, floor: at.y }; });
export const CRATE_SPOTS = CRATES.map(([n, a, c, pool]) => { const at = place([n, a, c]); return [at.x, at.z, pool] as [number, number, string[]]; });

// ---------- spatial index of path segments ----------
const CELL = 32, WALL = 16, SHOULDER = 1.8;
const DESERT_OPEN = 90, DESERT_CLIFF = 30; // desert: open ground this far past the berm, then mesa cliffs
const reachOf = (p: Path) => p.half + SHOULDER + (p.style === 'desert' ? DESERT_OPEN + DESERT_CLIFF : (p.style === 'ledge' ? Math.max(WALL, p.fallWidth) : 0) + WALL + 4) + 4;
const MAX_REACH = Math.max(...PATHS.map(reachOf));
let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
for (const p of PATHS) for (let i = 0; i < p.x.length; i++) { minX = Math.min(minX, p.x[i]); maxX = Math.max(maxX, p.x[i]); minZ = Math.min(minZ, p.z[i]); maxZ = Math.max(maxZ, p.z[i]); }
minX -= MAX_REACH + CELL; minZ -= MAX_REACH + CELL; maxX += MAX_REACH + CELL; maxZ += MAX_REACH + CELL;
export const BOUNDS = { minX, minZ, maxX, maxZ };
const NX = Math.ceil((maxX - minX) / CELL), NZ = Math.ceil((maxZ - minZ) / CELL);
/**
 * Per cell: segments (path index * 65536 + sample index) within NEAR metres of it, for nearest() and the ground
 * near roads; and, for the open desert's far reaches, a coarse copy of the desert paths (every FAR_STRIDE-th
 * sample) out to their full reach, which only the height field needs (and only while the terrain is built).
 */
const NEAR = 44, FAR_STRIDE = 6;
const GRID: Int32Array[] = new Array(NX * NZ), FAR_GRID: Int32Array[] = new Array(NX * NZ);
/** Per cell: sinkholes and rocks near it. */
const HOLE_GRID: Hole[][] = Array.from({ length: NX * NZ }, () => []), ROCK_GRID: Rock[][] = Array.from({ length: NX * NZ }, () => []);
{
  const lists: number[][] = Array.from({ length: NX * NZ }, () => []), far: number[][] = Array.from({ length: NX * NZ }, () => []);
  const cover = (x0: number, z0: number, x1: number, z1: number, fn: (c: number) => void) => {
    for (let cx = Math.floor((x0 - minX) / CELL); cx <= Math.floor((x1 - minX) / CELL); cx++) for (let cz = Math.floor((z0 - minZ) / CELL); cz <= Math.floor((z1 - minZ) / CELL); cz++) fn(cx * NZ + cz);
  };
  PATHS.forEach((p, pi) => {
    const R = Math.min(reachOf(p), p.half + NEAR);
    for (let i = 0; i < p.x.length - 1; i++) cover(Math.min(p.x[i], p.x[i + 1]) - R, Math.min(p.z[i], p.z[i + 1]) - R, Math.max(p.x[i], p.x[i + 1]) + R, Math.max(p.z[i], p.z[i + 1]) + R, c => lists[c].push(pi * 65536 + i));
    if (p.style !== 'desert') return;
    const RF = reachOf(p);
    for (let i = 0; i < p.x.length - 1; i += FAR_STRIDE) {
      const j = Math.min(i + FAR_STRIDE, p.x.length - 1);
      cover(Math.min(p.x[i], p.x[j]) - RF, Math.min(p.z[i], p.z[j]) - RF, Math.max(p.x[i], p.x[j]) + RF, Math.max(p.z[i], p.z[j]) + RF, c => far[c].push(pi * 65536 + i));
    }
  });
  lists.forEach((l, i) => { GRID[i] = Int32Array.from(l); });
  far.forEach((l, i) => { FAR_GRID[i] = Int32Array.from(l); });
  for (const h of SINKHOLES) cover(h.x - h.r, h.z - h.r, h.x + h.r, h.z + h.r, c => HOLE_GRID[c].push(h));
  for (const r of OBSTACLES) cover(r.x - r.r - 4, r.z - r.r - 4, r.x + r.r + 4, r.z + r.r + 4, c => ROCK_GRID[c].push(r));
}
const cellIndex = (x: number, z: number) => {
  const cx = Math.floor((x - minX) / CELL), cz = Math.floor((z - minZ) / CELL);
  return cx < 0 || cz < 0 || cx >= NX || cz >= NZ ? -1 : cx * NZ + cz;
};
const cellAt = (x: number, z: number) => { const i = cellIndex(x, z); return i < 0 ? null : GRID[i]; };

/** Does any path come near the rectangle? (For deciding which terrain tiles to build.) */
export function pathsNear(x0: number, z0: number, x1: number, z1: number): boolean {
  for (let x = x0; x <= x1; x += CELL) for (let z = z0; z <= z1; z += CELL) { const i = cellIndex(Math.min(x, x1), Math.min(z, z1)); if (i >= 0 && (GRID[i].length || FAR_GRID[i].length)) return true; }
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
  const p = _near.path;
  _near.floor = lerp(p.y[_near.i], p.y[_near.i + 1], _near.t) - (_near.alongside ? gorgeDrop(p, lerp(p.s[_near.i], p.s[_near.i + 1], _near.t)) : 0);
  return _near;
}

// ---------- the height field ----------
/** Mesa top: broken, and higher away from the course. */
function plateau(x: number, z: number) {
  return 34 + 3 * Math.sin(x * 0.013 + 1.3) * Math.cos(z * 0.011) + 1.5 * Math.sin(x * 0.041 - z * 0.037);
}
/** Canyon wall profile, 0 at the corridor's edge to 1 at the rim, with ledges; e is metres past the corridor's edge. */
function wall(e: number, x: number, z: number) {
  // a flat shoulder past the edge (where the barrier holds cars), then the rock, set back 0-2 m more
  const jitter = SHOULDER + 0.75 + 0.75 * Math.sin(x * 0.09 + z * 0.07) + 0.4 * Math.sin(x * 0.23 - z * 0.19);
  const u = clamp((e - jitter) / WALL, 0, 1); if (u <= 0) return 0;
  const steep = 1 - Math.pow(1 - u, 2.2);
  return clamp(steep + 0.05 * Math.sin(u * 19 + x * 0.05), 0, 1);
}
/** Desert either side of the road: a low berm, open dunes, then mesa cliffs. */
function desert(e: number, x: number, z: number, floor: number, top: number) {
  const berm = 2.2 * smooth(SHOULDER, SHOULDER + 5, e);
  const dunes = (0.8 + 0.8 * Math.sin(x * 0.045 + Math.sin(z * 0.03) * 2) * Math.cos(z * 0.05 - x * 0.02)) * smooth(SHOULDER + 4, SHOULDER + 14, e);
  return floor + Math.max(berm + dunes, (top - floor) * wall(e - DESERT_OPEN, x, z));
}
/** Ground height on Route 67 (ramps excluded). */
export function trackHeight(x: number, z: number): number {
  const top = plateau(x, z), ci = cellIndex(x, z); if (ci < 0) return top;
  const cell = GRID[ci];
  let h = top, shelf = -Infinity;
  for (let k = 0; k < cell.length; k++) {
    const p = PATHS[cell[k] >> 16], i = cell[k] & 65535;
    const ax = p.x[i], az = p.z[i], bx = p.x[i + 1] - ax, bz = p.z[i + 1] - az, L2 = bx * bx + bz * bz || 1;
    const raw = ((x - ax) * bx + (z - az) * bz) / L2, t = clamp(raw, 0, 1), d = Math.hypot(ax + bx * t - x, az + bz * t - z);
    const e = d - p.half; if (e > reachOf(p)) continue;
    const floor = lerp(p.y[i], p.y[i + 1], t) + (e < 0 ? -0.15 * (1 - (d / p.half) ** 2) : 0); // a slight crown down the middle
    let hh: number;
    if (p.style === 'ledge' && e <= 0.3 && raw >= 0 && raw <= 1) shelf = Math.max(shelf, floor); // a ledge's road surface stands, whatever carves below it
    if (p.style === 'desert') hh = desert(e, x, z, floor, top);
    else if (p.style === 'ledge' && p.open && Math.sign(bx * (z - az) - bz * (x - ax)) === p.open) {
      // the open side: a sheer drop (with a lip) down to the road below, never lower, then that road's far wall
      const drop = Math.max(0, floor - p.below), cliff = floor - Math.min(drop, Math.max(0, e - 0.3) * 4);
      hh = Math.max(cliff, p.below + (top - p.below) * wall(e - p.fallWidth, x, z));
    } else hh = floor + (top - floor) * wall(e, x, z);
    // the gorge cuts straight across, a little wider than the road, with sheer edges where the road stops
    if (p.gap && raw >= 0 && raw <= 1) { const drop = gorgeDrop(p, lerp(p.s[i], p.s[i + 1], t)); if (drop) hh = Math.min(hh, floor - drop + (top - floor + drop) * wall(e - GORGE_WIDE, x, z)); }
    if (hh < h) h = hh;
  }
  // the open desert's far reaches: dunes and the distant mesa cliffs, from the coarse paths
  const farCell = FAR_GRID[ci];
  for (let k = 0; k < farCell.length; k++) {
    const p = PATHS[farCell[k] >> 16], i = farCell[k] & 65535, j = Math.min(i + FAR_STRIDE, p.x.length - 1);
    const ax = p.x[i], az = p.z[i], bx = p.x[j] - ax, bz = p.z[j] - az, L2 = bx * bx + bz * bz || 1;
    const t = clamp(((x - ax) * bx + (z - az) * bz) / L2, 0, 1), e = Math.hypot(ax + bx * t - x, az + bz * t - z) - p.half;
    if (e < NEAR - 4 || e > reachOf(p)) continue; // near the road the detailed segments above already answer
    const hh = desert(e, x, z, lerp(p.y[i], p.y[j], t), top); if (hh < h) h = hh;
  }
  if (shelf > h) h = shelf;
  // sinkholes: steep-sided pits
  for (const s of HOLE_GRID[ci]) { const dd = Math.hypot(x - s.x, z - s.z); if (dd < s.r) h = Math.min(h, s.floor - HOLE_DEPTH * smooth(s.r, s.r * 0.65, dd)); }
  return h;
}
const HOLE_DEPTH = 7;
// Once the terrain is built, its height grid (computed for the whole course) answers every ground query: the
// flat triangles between samples are exactly what's drawn, and a lookup is far cheaper than the height field.
let grid: { s: number; x0: number; z0: number; nx: number; nz: number; h: Float32Array } | null = null;
/** Keep the terrain's height grid: spacing, origin, size and heights (index i * nz + j for x0 + i * s, z0 + j * s). */
export function setTrackGrid(s: number, x0: number, z0: number, nx: number, nz: number, h: Float32Array) { grid = { s, x0, z0, nx, nz, h }; }
const gh = (i: number, j: number) => { const g = grid!; return g.h[clamp(i, 0, g.nx - 1) * g.nz + clamp(j, 0, g.nz - 1)]; };
/** Ground height as drawn: the terrain grid's flat triangles (or the height field before the terrain is built). */
export function trackSurface(x: number, z: number): number {
  if (!grid) return trackHeight(x, z);
  const fx = (x - grid.x0) / grid.s, fz = (z - grid.z0) / grid.s, i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
  // PlaneGeometry-style split along the diagonal from (i + 1, j) to (i, j + 1), as the terrain mesh is built
  if (u + v <= 1) { const h = gh(i, j); return h + u * (gh(i + 1, j) - h) + v * (gh(i, j + 1) - h); }
  const h = gh(i + 1, j + 1); return h + (1 - u) * (gh(i, j + 1) - h) + (1 - v) * (gh(i + 1, j) - h);
}

// ---------- corridor queries ----------
const EDGE = 0.6; // how far past a corridor's edge a car may go before the barrier stops it
/** Off a ledge's open side: no barrier there, the car goes over. */
const overTheEdge = (n: Near) => n.path.open !== 0 && n.side === n.path.open;
/** Keep a car on the course: barriers at the corridors' edges (not over a ledge's drop) and the rocks. Returns the impact speed. */
export function keepOnTrack(c: { x: number; y: number; z: number; vx: number; vz: number; radius: number }): number {
  let impact = 0;
  const n = nearest(c.x, c.z);
  if (n && !overTheEdge(n)) {
    const over = n.e + c.radius * 0.5 - EDGE;
    if (over > 0) {
      const p = n.path, px = p.x[n.i] + (p.x[n.i + 1] - p.x[n.i]) * n.t, pz = p.z[n.i] + (p.z[n.i + 1] - p.z[n.i]) * n.t;
      const nx = (px - c.x) / (n.d || 1), nz = (pz - c.z) / (n.d || 1);
      c.x += nx * over; c.z += nz * over;
      const vn = -(c.vx * nx + c.vz * nz); if (vn > 0) { c.vx += 1.3 * vn * nx; c.vz += 1.3 * vn * nz; impact = vn; } // bounce off at 30%
    }
  }
  const ci = cellIndex(c.x, c.z);
  if (ci >= 0) for (const r of ROCK_GRID[ci]) {
    if (c.y > r.top) continue;
    const dx = c.x - r.x, dz = c.z - r.z, R = c.radius + r.r * 0.9, d2 = dx * dx + dz * dz; if (d2 >= R * R) continue;
    const d = Math.sqrt(d2) || 0.01, nx = dx / d, nz = dz / d; c.x = r.x + nx * R; c.z = r.z + nz * R;
    const vn = -(c.vx * nx + c.vz * nz); if (vn > 0) { c.vx += 1.3 * vn * nx; c.vz += 1.3 * vn * nz; impact = Math.max(impact, vn); }
  }
  return impact;
}
const rockAt = (x: number, z: number, m: number) => { const ci = cellIndex(x, z); if (ci >= 0) for (const r of ROCK_GRID[ci]) if (Math.hypot(x - r.x, z - r.z) < r.r + m) return true; return false; };
/** Off the drivable course, or into a rock or sinkhole (AI probes, placing things). */
export function offTrack(x: number, z: number, margin = 0): boolean {
  const n = nearest(x, z); if (!n || n.e + margin > EDGE) return true;
  if (rockAt(x, z, margin)) return true;
  const ci = cellIndex(x, z); for (const s of HOLE_GRID[ci]) if (Math.hypot(x - s.x, z - s.z) < s.r + margin) return true;
  return false;
}
/** Inside the mine shaft, away from its portals. */
export function inTunnel(x: number, z: number): boolean {
  const n = nearest(x, z); if (!n || n.path.surface !== 'tunnel' || n.e > 1) return false;
  const s = n.path.s[n.i]; return s > PORTAL && s < n.path.len - PORTAL;
}
export const PORTAL = 22, ROOF = 7.5;
/** Solid at (x, y, z) beyond what the height field says: the mine shaft's ceiling and the rocks. */
export function trackSolid(x: number, y: number, z: number): boolean {
  const ci = cellIndex(x, z);
  if (ci >= 0) for (const r of ROCK_GRID[ci]) if (y < r.top && Math.hypot(x - r.x, z - r.z) < r.r * 0.9) return true;
  return inTunnel(x, z) && y > (nearest(x, z) as Near).floor + ROOF;
}
/** Down in the gorge or a sinkhole: there's no way out, the car is wrecked. */
export function fallen(x: number, y: number, z: number): boolean {
  const ci = cellIndex(x, z);
  if (ci >= 0) for (const s of HOLE_GRID[ci]) if (Math.hypot(x - s.x, z - s.z) < s.r * 0.8 && y < s.floor - 3) return true;
  const n = nearest(x, z); if (!n || !n.path.gap) return false;
  const s = lerp(n.path.s[n.i], n.path.s[n.i + 1], n.t);
  return s > n.path.gap[0] && s < n.path.gap[1] && y < lerp(n.path.y[n.i], n.path.y[n.i + 1], n.t) - 6;
}
/** How wide each surface's road ribbon is, as a share of the corridor (sand has none). */
export const RIBBON: Record<Surface, number> = { dirt: 0.75, tunnel: 0.8, asphalt: 0.9, sand: 0 };
export const ROAD_LIFT = 0.08;
const inGap = (n: Near) => { const s = lerp(n.path.s[n.i], n.path.s[n.i + 1], n.t); return !!n.path.gap && s > n.path.gap[0] - 1 && s < n.path.gap[1] + 1; };
/** How far the road surface floats above the terrain at (x, z): 0 off the roads. */
export function trackRoadLift(x: number, z: number): number {
  const n = nearest(x, z); return n && n.d < n.path.half * RIBBON[n.path.surface] && !(n.path.gap && inGap(n)) ? ROAD_LIFT : 0;
}
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
    const i = end - 3 - Math.floor(k / 2) * 3, lat = (k % 2 ? -1 : 1) * 3.4;
    out.push({ x: p.x[i] + p.tz[i] * lat, z: p.z[i] - p.tx[i] * lat, yaw: Math.atan2(p.tx[i], p.tz[i]), progress: { section: last, path: 0, i, s: 0, lap: 0 } });
  }
  return out;
}
/** Where a car restarts after a wreck: the start of the section it's in, its lane spread by `slot`. */
export function respawnPoint(pr: Progress, slot: number) {
  const sec = SECTIONS_BUILT[pr.section], p = sec.paths[Math.min(pr.path, sec.paths.length - 1)], i = Math.min(4 + (slot % 3) * 3, p.x.length - 2), lat = ((slot % 2) * 2 - 1) * Math.min(3, p.half * 0.4);
  return { x: p.x[i] + p.tz[i] * lat, z: p.z[i] - p.tx[i] * lat, yaw: Math.atan2(p.tx[i], p.tz[i]), i };
}
