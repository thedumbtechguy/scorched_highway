// Every player action and what triggers it on each device. Input handling, the help screen and the HUD hints
// all read this table, so they can't drift apart.

export type Action = 'drive' | 'drift' | 'gun' | 'fire' | 'attack' | 'defend' | 'special' | 'swap' | 'target' | 'flip' | 'pause';

interface Binding {
  label: string;
  /** KeyboardEvent.code values; the first of each group is shown in hints. */
  keys: string[];
  keyHint: string;
  pad: string;
  touch: string;
}

export const BINDINGS: Record<Action, Binding> = {
  drive: { label: 'Drive and steer', keys: ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'], keyHint: 'W A S D or arrows', pad: 'Triggers, left stick', touch: 'Left thumb stick' },
  drift: { label: 'Drift', keys: ['Space'], keyHint: 'Space', pad: 'B', touch: 'Drift button' },
  gun: { label: 'Machine gun', keys: ['KeyJ', 'KeyZ'], keyHint: 'J or Z', pad: 'X', touch: 'Automatic' },
  fire: { label: 'Fire weapon', keys: ['KeyK', 'KeyX'], keyHint: 'K or X', pad: 'A', touch: 'Fire' },
  attack: { label: 'Attack combo (3 ammo)', keys: ['KeyI', 'KeyV'], keyHint: 'I or V', pad: 'RB', touch: 'Swipe up on Fire' },
  defend: { label: 'Defensive combo (3 ammo)', keys: ['Comma', 'KeyB'], keyHint: ', or B', pad: 'LB', touch: 'Swipe down on Fire' },
  special: { label: 'Special weapon', keys: ['KeyL', 'KeyC'], keyHint: 'L or C', pad: 'Y', touch: 'Special' },
  swap: { label: 'Switch weapon', keys: ['KeyQ', 'KeyE'], keyHint: 'Q / E', pad: 'D-pad left / right', touch: 'Tap the weapon panel' },
  target: { label: 'Switch target', keys: ['Tab'], keyHint: 'Tab', pad: 'Right stick click', touch: 'Tap a name tag' },
  flip: { label: 'Flip back over', keys: ['KeyR'], keyHint: 'R', pad: 'Back / View', touch: 'Flip back button' },
  pause: { label: 'Pause', keys: ['KeyP', 'Escape'], keyHint: 'P or Esc', pad: 'Start / Menu', touch: 'Pause button' },
};

const BY_KEY = new Map<string, Action>();
for (const [a, b] of Object.entries(BINDINGS) as [Action, Binding][]) for (const k of b.keys) BY_KEY.set(k, a);
/** The action a key triggers, if any. */
export const actionForKey = (code: string): Action | undefined => BY_KEY.get(code);

export type Device = 'keys' | 'pad' | 'touch';
/** How to trigger an action on a device, for hints. */
export function hint(a: Action, d: Device): string { const b = BINDINGS[a]; return d === 'keys' ? b.keyHint : d === 'pad' ? b.pad : b.touch; }

/** Rows for the help screen's controls table on one device. */
export function controlsTable(d: Device): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return (Object.keys(BINDINGS) as Action[]).map(a => `<tr><td>${esc(BINDINGS[a].label)}</td><td><kbd>${esc(hint(a, d))}</kbd></td></tr>`).join('');
}
