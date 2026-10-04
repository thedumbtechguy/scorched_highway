// What a mode is: the rules of a match. The match loop (game/match.js) runs cars, weapons and effects the
// same way for every mode and calls these hooks for everything that differs: where cars start, what happens
// each step and when a car is wrecked, what the HUD shows, how the results read, and how bots drive.
// To add a mode, implement GameMode in src/modes/ and register it in src/modes/index.ts. See README.md, "Maps and modes".
import type { GameMap } from '../maps/types';
import type { RaceState } from './race';

/** The parts of a car (cars/car.js) that modes use. */
export interface Car {
  def: { id: string; name: string; driver: string; tag: string; hp: number; max: number; ai: string };
  isPlayer: boolean; alive: boolean; hp: number; x: number; y: number; z: number; yaw: number; readonly speed: number;
  kills: number; dealt: number; place: number; special: number; speedK: number; burning: number;
  ammo: Record<string, number>; weapon: string | null;
  lastHitBy: Car | null; lastHitTime: number; wreckedBy: Car | null; fellLap?: number;
  race: RaceState | null;
  reset(x: number, z: number, yaw: number): void; respawn(x: number, z: number, yaw: number): void;
}
/** The parts of a bot (ai/ai.js) a mode's driving hook uses; `mem` is the mode's own scratch space. */
export interface Bot { car: Car; pers: string; mem: Record<string, unknown> }

/** How the results screen reads. */
export interface Results {
  order: Car[];             // standings, first place first
  win: boolean;
  title: string; sub: string;
  tiles: Array<[string, string]>; // [label, value] stat tiles
  fate(c: Car): string;     // one line under each name in the standings
}

export interface GameMode {
  id: string;
  name: string;
  /** Start button and play-again button labels. */
  startLabel: string; againLabel: string;
  /** Show start lights during the countdown. */
  lights: boolean;
  /** Weapon panel hint while the player has no heavy weapon. */
  unarmedHint: string;
  /** Place the cars and give them their starting loadout. */
  setup(cars: Car[], map: GameMap): void;
  /** Rules that run every step (dt: game time, rdt: real time). */
  step(dt: number, rdt: number): void;
  /** A car has just been wrecked (by `by`, if anyone). */
  wrecked(c: Car, by: Car | null): void;
  /** HUD top centre: status text and clock. */
  status(player: Car): [string, string];
  /** The results screen for the match that just ended. */
  results(): Results;
  /** Where a bot should steer and how fast it may go, or null to let it hunt (the default). */
  drive?(bot: Bot): { x: number; z: number; want: number } | null;
}
