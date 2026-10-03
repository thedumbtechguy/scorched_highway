// Ambient declarations for browser globals the game touches.
interface Window {
  /** Debug handle for tests, tools and the console; see src/main.js. */
  SH: Record<string, any>;
  /** Older Safari. */
  webkitAudioContext?: typeof AudioContext;
}
