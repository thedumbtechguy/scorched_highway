// Height of the ground as it is drawn, for resting things on it: the terrain mesh, the roads that float
// a few centimetres above it, and ramps. Physics uses ground() from terrain.js; this is for looks.
import { baseHeight, rampHeight, roadLift, surfaceHeight } from './terrain.js';

/** Ramps count only up to `rampReach`, so a car brushing past a ramp's tall side isn't hoisted onto it. */
export function drawnGround(x, z, rampReach = Infinity) {
  const r = rampHeight(x, z), lift = roadLift(x, z), h = surfaceHeight(x, z);
  return (lift ? Math.max(h, baseHeight(x, z) + lift) : h) + (r <= rampReach ? r : 0);
}
