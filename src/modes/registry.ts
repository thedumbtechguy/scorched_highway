// The modes in the game. Modes register themselves from src/modes/index.ts.
import type { GameMode } from './types';

const MODES: GameMode[] = [];
export const registerMode = (m: GameMode) => { MODES.push(m); };
export const getMode = (id: string): GameMode | undefined => MODES.find(m => m.id === id);
export const allModes = (): readonly GameMode[] => MODES;
