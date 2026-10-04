// The maps in the game, looked up by id or by world position. Maps register themselves from src/maps/index.ts;
// this module imports none of them, so the world engines can depend on it without import cycles.
import type { GameMap } from './types';

const MAPS: GameMap[] = [];
export function registerMap(m: GameMap) {
  for (const o of MAPS) if (m.x0 < o.x1 && o.x0 < m.x1) throw new Error(`map ${m.id} overlaps ${o.id}`);
  MAPS.push(m); MAPS.sort((a, b) => a.x0 - b.x0);
}
/** The map that owns world x (the first map if none does). */
export function mapAt(x: number): GameMap {
  for (let i = 0; i < MAPS.length; i++) if (x < MAPS[i].x1) return x >= MAPS[i].x0 ? MAPS[i] : MAPS[0];
  return MAPS[0];
}
export const getMap = (id: string): GameMap | undefined => MAPS.find(m => m.id === id);
export const allMaps = (): readonly GameMap[] => MAPS;
/** The map behind the menus: title screen and garage. */
export const MENU_MAP = 'ghost-town';
