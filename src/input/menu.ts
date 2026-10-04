// Menu navigation without a mouse: arrow keys or the d-pad / left stick move focus between the visible screen's
// buttons, Enter or A presses the focused one (or the screen's main button), Esc or B goes back.
// In the garage, left and right switch cars, or change a ‹ value › picker when one has focus.
import { stepCar } from '../game/screens.js';

export type Dir = 'up' | 'down' | 'left' | 'right';
/** The button that "back" presses on each screen. */
const BACK: Record<string, string> = { garage: '#gBack', help: '#helpClose', settings: '#settingsClose', pause: '#resumeBtn' };

/** The menu screen currently showing, if any. */
export function currentScreen(): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>('.screen')) if (!el.hidden) return el;
  return null;
}
const visible = (el: HTMLElement) => el.offsetParent !== null || getComputedStyle(el).position === 'fixed';
const buttons = (root: HTMLElement) => [...root.querySelectorAll<HTMLButtonElement>('button')].filter(b => !b.disabled && visible(b));
const focused = (root: HTMLElement) => { const a = document.activeElement as HTMLElement | null; return a && root.contains(a) && a.tagName === 'BUTTON' ? a : null; };
function focus(el: HTMLElement) { document.body.classList.add('navfocus'); el.focus(); }

/** Move focus (or switch car / picker value in the garage). Returns false when no menu is showing. */
export function menuMove(dir: Dir): boolean {
  const screen = currentScreen(); if (!screen) return false;
  const cur = focused(screen);
  if (dir === 'left' || dir === 'right') {
    const cyc = cur && cur.closest('.cyc');
    if (cyc) { (cyc.querySelectorAll('button')[dir === 'left' ? 0 : 1] as HTMLElement).click(); return true; }
    if (screen.id === 'garage') { stepCar(dir === 'left' ? -1 : 1); return true; }
  }
  const all = buttons(screen);
  if (!cur) { const first = screen.querySelector<HTMLElement>('.btn.primary') || all[0]; if (first) focus(first); return true; }
  const r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const [ux, uy] = dir === 'up' ? [0, -1] : dir === 'down' ? [0, 1] : dir === 'left' ? [-1, 0] : [1, 0];
  let best: HTMLElement | null = null, bestS = Infinity;
  for (const b of all) {
    if (b === cur) continue;
    const q = b.getBoundingClientRect(), dx = q.left + q.width / 2 - cx, dy = q.top + q.height / 2 - cy;
    const along = dx * ux + dy * uy, across = Math.abs(dx * uy - dy * ux);
    if (along < 4) continue;
    const s = along + across * 2; if (s < bestS) { bestS = s; best = b; }
  }
  if (best) focus(best);
  return true;
}
/** Press the focused button, or the screen's main one. */
export function menuSelect(): boolean {
  const screen = currentScreen(); if (!screen) return false;
  const b = focused(screen) || screen.querySelector<HTMLElement>('.btn.primary');
  if (b) b.click();
  return true;
}
/** Go back from the current screen, where that means something. */
export function menuBack(): boolean {
  const screen = currentScreen(); if (!screen) return false;
  const sel = BACK[screen.id]; const b = sel && document.querySelector<HTMLElement>(sel);
  if (b) b.click();
  return true;
}
addEventListener('pointerdown', () => document.body.classList.remove('navfocus'), { capture: true });
