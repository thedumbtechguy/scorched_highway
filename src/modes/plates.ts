// Plates, as a race plays them (Death Race style). Drive over one and it's yours:
// - sword: arms you. The first one unlocks the machine gun (races start with it locked), and every one hands
//   you a heavy weapon, heavier the further back you are;
// - shield: a few seconds in which you take a quarter of the damage;
// - skull: sets off the next hazard ahead of you (a rockfall, a wrong-way truck), for whoever's in front.
import { playSfx } from '../audio/audio.js';
import { type Weapon, giveAmmo } from '../combat/arsenal';
import { FX_ADD, fxScale } from '../engine/particles.js';
import { pick, rand } from '../engine/util.js';
import { bigText, feed } from '../game/hud.js';
import { G } from '../game/state.js';
import { type HazardSite, isBusy, triggerHazard } from '../world/hazards';
import { PICK } from '../world/pickups';
import { PLATE, type Plate, takePlate } from '../world/plates';
import type { Car } from './types';

export const SHIELD_TIME = 8;
/** Sword weapons for the back of the field and the front. */
const SWORD_BACK: Weapon[] = ['missile', 'mortar', 'rockets'], SWORD_FRONT: Weapon[] = ['mines', 'flame', 'rockets'];
/** A skull reaches no nearer than this ahead (metres), so there's time to see it coming. */
export const SKULL_MIN_AHEAD = 80;

export interface PlateRules {
  /** How far back in the field a car is: 0 leading, 1 last. */
  rank(c: Car): number;
  /** How far ahead of the car a lap distance is, in metres (0 to a lap). */
  ahead(c: Car, s: number): number;
}

/** The hazard a skull driven over by `c` sets off: the nearest one far enough ahead that isn't already going. */
export function nextHazard(c: Car, sites: HazardSite[], rules: PlateRules): HazardSite | null {
  let best: HazardSite | null = null, bd = Infinity;
  for (const s of sites) { if (isBusy(s)) continue; const d = rules.ahead(c, s.s); if (d >= SKULL_MIN_AHEAD && d < bd) { bd = d; best = s; } }
  return best;
}

/** Every running car takes any armed plate it drives over. */
export function drivePlates(rules: PlateRules) {
  for (const c of G.cars as Car[]) {
    if (!c.alive) continue;
    const p = takePlate(c.x, c.y, c.z); if (p) plate(c, p, rules);
  }
}
function plate(c: Car, p: Plate, rules: PlateRules) {
  const me = c.isPlayer;
  for (let i = 0; i < 18 * fxScale; i++) FX_ADD.spawn(p.x + rand(-1.5, 1.5), p.y + 0.3, p.z + rand(-1.5, 1.5), rand(-2, 2), rand(5, 11), rand(-2, 2), 0.5, 1, 0.1, PLATE[p.type].color, 0xffffff, 0.9, 1, 4);
  if (me) playSfx('plate');
  if (p.type === 'sword') {
    if (c.mgLocked) { c.mgLocked = false; if (me) bigText('Machine gun armed!', 1.2); }
    const pool = rules.rank(c) >= 0.5 ? SWORD_BACK : SWORD_FRONT;
    for (const w of [pick(pool), ...pool]) { const dropped = giveAmmo(c, w); if (dropped === false) continue; if (me) feed(`Sword: +${PICK[w].amt}${w === 'flame' ? 's' : ''} ${PICK[w].label}`, true); break; }
  } else if (p.type === 'shield') {
    c.shieldT = SHIELD_TIME; if (me) feed('Shield up', true);
  } else {
    const site = nextHazard(c, (G.map.hazards || []) as HazardSite[], rules);
    if (!site || !triggerHazard(site, c as never)) { if (me) feed('Skull: nothing left to set off', true); return; }
    const what = site.kind === 'truck' ? `a truck is coming down ${site.name}` : `rockfall in ${site.name}`;
    if (me) feed(`Skull: ${what}`, true);
    else {
      const pl = G.player as Car;
      if (pl.alive && rules.ahead(pl, site.s) < 450) bigText(site.kind === 'truck' ? 'Truck coming!' : 'Rockfall ahead!', 1.4);
      feed(`${c.def.driver.split(' ')[0]} hit a skull: ${what}`, false);
    }
  }
}
