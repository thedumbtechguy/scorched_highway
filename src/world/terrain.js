// Ground height anywhere in the world. Every map owns a band of x (see maps/registry), so these ask the map
// at that point. Physics uses ground(); things that must look like they touch the drawn ground use drawnGround()
// in surface.js.
import { mapAt } from '../maps/registry';

/** Terrain height, ramps excluded. */
export const baseHeight = (x, z) => mapAt(x).height(x, z);
/** Extra height of a ramp at (x, z), 0 off ramps. */
export const rampHeight = (x, z) => mapAt(x).ramp(x, z);
/** Physics ground: terrain plus ramps. */
export const ground = (x, z) => { const m = mapAt(x); return m.height(x, z) + m.ramp(x, z); };
/** Height of the terrain as drawn (its flat triangles), for resting things on it. */
export const surfaceHeight = (x, z) => mapAt(x).drawn(x, z);
/** How far a road surface floats above the terrain at (x, z), 0 off roads. */
export const roadLift = (x, z) => mapAt(x).roadLift(x, z);
/** Top-speed factor of the ground at (x, z): 1 on dirt, less on sand. */
export const groundSpeed = (x, z) => mapAt(x).speed(x, z);
