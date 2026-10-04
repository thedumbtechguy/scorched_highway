// What a map is. Maps share one scene: each owns a band of world x (x0 to x1, 6 km wide) far enough from the
// others that fog and draw distance keep them apart, so the shared engines (physics, weapons, AI, effects)
// just ask the map at a point. To add a map, implement GameMap in src/maps/<id>/ and register it in
// src/maps/index.ts. See README.md, "Maps and modes".
import type { HazardSite } from '../world/hazards';
import type { PlateSpot } from '../world/plates';

/** Anything that moves and collides with the scenery. */
export interface Body { x: number; y: number; z: number; vx: number; vz: number; radius: number }
export interface Spot { x: number; z: number; yaw: number }
/** Where a car is on a course: which section and path, the sample it's nearest, distance into the lap, and its lap. */
export interface Progress { section: number; path: number; i: number; s: number; lap: number }

export interface GameMap {
  id: string;
  name: string;
  /** The band of world x this map owns. */
  x0: number; x1: number;
  /** Ids of the modes that can be played here (see src/modes). */
  modes: string[];

  /** Build the map's meshes. Called once, the first time it's played (the menu map at boot); `timed` labels boot steps. */
  build(lowQ: boolean, timed?: (name: string, fn: () => void) => void): void;
  isBuilt(): boolean;

  // ---- ground ----
  /** Terrain height, ramps excluded. */
  height(x: number, z: number): number;
  /** Extra height of a ramp, 0 off ramps. */
  ramp(x: number, z: number): number;
  /** Height of the terrain as drawn (its flat triangles). */
  drawn(x: number, z: number): number;
  /** How far road surfaces float above the terrain, 0 off roads. */
  roadLift(x: number, z: number): number;
  /** Top-speed factor of the surface, 1 on dirt. */
  speed(x: number, z: number): number;

  // ---- collision and sight ----
  /** Keep a car out of walls and static scenery; returns the impact speed. */
  collide(c: Body): number;
  /** Static scenery or the map's edge within `m` metres of (x, z) (AI probes, placing things). */
  blocked(x: number, z: number, m: number): boolean;
  /** Something solid above the ground at (x, y, z): buildings, rock, roofs (projectiles and sight lines). */
  solid(x: number, y: number, z: number): boolean;
  /** Far outside the playable area: projectiles stop here. */
  outOfBounds(x: number, z: number): boolean;
  /** Extra sight rule for homing weapons; false blocks the line from (ax, az) to (bx, bz). */
  sees?(ax: number, az: number, bx: number, bz: number): boolean;

  // ---- places for modes ----
  /** Spread-out starting spots facing inwards, for free-for-all modes. */
  spawns?(n: number): Spot[];
  /** A closed course, for race modes. */
  course?: Course;
  /** Fixed hazards on the course: rocks to steer round and holes that wreck you (radar, tests). */
  obstacles?: { rocks: Array<{ x: number; z: number; r: number }>; holes: Array<{ x: number; z: number; r: number }> };
  /** Plates set into the road (see world/plates), laid when the map is built. */
  plates?: PlateSpot[];
  /** Hazards waiting to be set off (see world/hazards); may fill in when the map is built. */
  hazards?: HazardSite[];

  /** Draw the map's static features on the radar; `toR` turns world x, z into radar x, y and whether it's in range. */
  drawRadar(ctx: CanvasRenderingContext2D, toR: (x: number, z: number) => [number, number, boolean], R: number, range: number): void;
}

/** A sampled path of a course: centre line, tangent and distance along it. */
export interface CoursePath {
  name: string; half: number; risky: boolean;
  /** A ledge's open side (the drop), 0 for none; lateral offsets are tz * lat, -tx * lat. */
  open: number;
  x: Float32Array; z: Float32Array; tx: Float32Array; tz: Float32Array; s: Float32Array; len: number;
}
/** How a course map tags its plates (PlateSpot.tag), so bots can steer onto them: the path, sample and metres across. */
export interface PlateTag { path: CoursePath; i: number; across: number }
/**
 * A race course: a loop of sections, each one path or a fork of several that split at one node and meet at the
 * next. Progress through it is comparable across the paths of a fork.
 */
export interface Course {
  laps: number;
  /** Length of a lap, in metres (the distance() of one lap). */
  lapLength: number;
  sections: Array<{ paths: CoursePath[] }>;
  /** Starting grid behind the line, front row first. */
  grid(n: number): Array<Spot & { progress: Progress }>;
  /** Move a car's progress to (x, z): passes nodes, counts laps. */
  advance(pr: Progress, x: number, z: number): void;
  /** Total distance covered, for ordering cars. */
  distance(pr: Progress): number;
  /** Direction of the course at a car's progress point. */
  heading(pr: Progress): [number, number];
  /** Where a wrecked car restarts. */
  respawn(pr: Progress, slot: number): Spot & { i: number };
  /** Fallen somewhere it can't get out of (the gorge): the car is wrecked. */
  fallen(x: number, y: number, z: number): boolean;
}
