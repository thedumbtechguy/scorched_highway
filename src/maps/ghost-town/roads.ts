// The ghost town's roads: the highway through town and the dirt tracks north and south.
import { asphalt, dirt, ribbon, roadMat } from '../../world/roads';

// where the roads run; buildRoads() draws them and roadLift() lets things sit on them
const HIGHWAY = { half: 6.5, lift: 0.05 }, TRACK = { half: 4.5, lift: 0.04 };
const northX = (z: number) => 4 + 12 * Math.sin(Math.max(0, z - 30) * 0.02);
const southX = (z: number) => -18 + 10 * Math.sin((z + 26) * 0.025);
/** How far the road surface floats above the ground at (x, z): 0 off the roads. */
export function roadLift(x: number, z: number): number {
  if (Math.abs(z) < HIGHWAY.half && Math.abs(x) <= 214) return HIGHWAY.lift;
  if (z >= 12 && z <= 214 && Math.abs(x - northX(z)) < TRACK.half) return TRACK.lift;
  if (z <= -26 && z >= -214 && Math.abs(x - southX(z)) < TRACK.half) return TRACK.lift;
  return 0;
}
export function buildRoads() {
  const hw: Array<[number, number]> = []; for (let x = -214; x <= 214; x += 3) hw.push([x, 0]);
  ribbon(hw, HIGHWAY.half * 2, HIGHWAY.lift, 13, roadMat(asphalt(), 0.85));
  const mud = roadMat(dirt(), 1);
  const north: Array<[number, number]> = []; for (let z = 12; z <= 214; z += 3) north.push([northX(z), z]);
  const south: Array<[number, number]> = []; for (let z = -26; z >= -214; z -= 3) south.push([southX(z), z]);
  ribbon(north, TRACK.half * 2, TRACK.lift, 9, mud); ribbon(south, TRACK.half * 2, TRACK.lift, 9, mud);
}
