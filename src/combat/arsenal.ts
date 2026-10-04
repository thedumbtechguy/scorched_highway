// The pickup weapons: what a crate gives, how much a car can hold, and the combo moves.
// A car carries the machine gun plus at most MAX_CARRIED of these at once.

export const WEAPON_ORDER = ['missile', 'rockets', 'mortar', 'mines', 'flame'] as const;
export type Weapon = typeof WEAPON_ORDER[number];
export const MAX_CARRIED = 3;
/** Ammo per crate and the most a car can hold (seconds of fuel for the torch). */
export const CRATE_AMMO: Record<Weapon, number> = { missile: 4, rockets: 8, mortar: 4, mines: 4, flame: 6 };
export const AMMO_CAP: Record<Weapon, number> = { missile: 10, rockets: 16, mortar: 8, mines: 8, flame: 12 };
/** ↑↑ + fire is always the attack combo and ↓↓ + fire the defensive one; both cost COMBO_COST ammo. */
export const COMBOS: Record<Weapon, [string, string]> = {
  missile: ['Rattler volley', 'Decoy flare'],
  rockets: ['Rocket fan', 'Tail gunner'],
  mortar: ['Carpet barrage', 'Smoke screen'],
  mines: ['Mine toss', 'Kickback'],
  flame: ['Fireball', 'Ring of fire'],
};
export const COMBO_COST = 3;

/** Lock-on ranges (metres) and cones (radians either side of the nose), sized for a 370 m arena. */
export const RANGE = { mg: 55, missile: 60, rockets: 70, mortar: 75 };
export const CONE = { mg: 0.2, missile: 0.5, mortar: 0.45 };

interface Armed { ammo: Record<string, number>; weapon: string | null }

/** The weapons a car is carrying, i.e. has ammo for. */
export const carried = (c: Armed): Weapon[] => WEAPON_ORDER.filter(w => c.ammo[w] > 0.01);

/**
 * Add a crate of `w` to the car. When it already carries MAX_CARRIED other weapons, the one with the least ammo
 * (relative to its cap, never the one selected) is thrown away to make room.
 * Returns false when the car can't take it (already full), otherwise the weapon dropped, or null.
 */
export function giveAmmo(c: Armed, w: Weapon): Weapon | null | false {
  if (c.ammo[w] >= AMMO_CAP[w]) return false;
  let dropped: Weapon | null = null;
  const held = carried(c);
  if (!held.includes(w) && held.length >= MAX_CARRIED) {
    const spare = held.filter(h => h !== c.weapon);
    dropped = spare.reduce((a, b) => (c.ammo[a] / AMMO_CAP[a] <= c.ammo[b] / AMMO_CAP[b] ? a : b));
    c.ammo[dropped] = 0;
  }
  c.ammo[w] = Math.min(AMMO_CAP[w], c.ammo[w] + CRATE_AMMO[w]);
  if (!c.weapon || c.ammo[c.weapon] <= 0.01) c.weapon = w;
  return dropped;
}
