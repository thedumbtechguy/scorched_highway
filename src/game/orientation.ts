// The game is landscape-only on phones and tablets. Browsers can't be made to rotate a page everywhere: Android
// Chrome can lock orientation once the page is fullscreen, iOS Safari can't do either. So we ask where we can,
// and otherwise a "turn your phone sideways" overlay (CSS, see #rotate) covers the game and the match pauses.
import { isTouch } from '../engine/util.js';

export const isPortrait = () => isTouch && innerHeight > innerWidth;

/** Call `onPortrait` whenever a touch device is turned upright (to pause the match). */
export function watchOrientation(onPortrait: () => void) {
  if (!isTouch) return;
  addEventListener('resize', () => { if (isPortrait()) onPortrait(); });
}

/** Go fullscreen and lock to landscape where the browser allows it. Must run inside a tap or click handler. */
export function lockLandscape() {
  if (!isTouch) return;
  const el = document.documentElement;
  const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
  const lock = () => orientation && orientation.lock ? orientation.lock('landscape').catch(() => {}) : undefined;
  if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).then(lock, () => {});
  else lock();
}
