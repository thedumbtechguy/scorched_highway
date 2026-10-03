# Scorched Highway

A free-for-all vehicular combat game set in a 1977 desert ghost town, inspired by late-90s car combat games like Vigilante 8. Six drivers, one arena, a trunk full of rockets — last car running wins.

Runs in any modern browser, desktop or phone. No build step, no install.

## Play

- **Locally:** open `index.html` in a browser.
- **Hosted:** serve the repo as static files (GitHub Pages works as-is).

Three.js r128 loads from cdnjs, so the first load needs an internet connection.

## Features

- **Six original cars**, each with its own speed, armor, handling and signature special:

  | Car | Driver | Special |
  | --- | --- | --- |
  | Sundowner | Dee Cortez | Twin cannons |
  | Gravel Queen | Ma Hollis | Scrap bomb (bursts into bomblets) |
  | Moonbeam | Sky Farrow | Good vibrations (sonic shockwave) |
  | Scorcher | Rex Vance | Afterburner (scorches anyone behind) |
  | Lawdog | Deputy Tull | Riot gun (close-range buckshot) |
  | Big Chill | Mister Frost | Brain freeze (homing ice shot that slows) |

- **Weapon crates:** homing missiles, mortar, mines and a torch, plus repair and special-ammo pickups.
- **Combo moves:** two per weapon — Rattler volley, Sky strike, Carpet barrage, Bunker buster, Mine toss, Minefield, Ring of fire, Fireball.
- **AI drivers** with personalities (rammers, snipers, opportunists) that hunt, retreat to repair, grab pickups and fight each other.
- **Destructible arena:** exploding barrels and gas pumps, cacti, billboards and a water tower you can drop on someone.
- **Arcade driving:** handbrake drifts, ramps and dunes for big air, cars that smoke, burn and lose wheels when wrecked.
- **Options:** 2–5 opponents, three difficulties, noon / sunset / night (with headlights), fast or pretty graphics, sound on/off.

## Controls

| Action | Keyboard | Gamepad | Touch |
| --- | --- | --- | --- |
| Drive / steer | WASD or arrows | Triggers + left stick | Left thumbstick |
| Handbrake | Space | B | Drift |
| Machine gun (hold) | J or Z | X | Gun |
| Fire weapon | K or X | A | Fire |
| Special | L or C | Y | Special |
| Switch weapon | Q / E | Bumpers | Swap |
| Flip back over | R | Back/Select | Flip back (appears when stuck) |
| Pause | P or Esc | Start | ❚❚ |

**Combos:** tap ↑↑ then fire for a weapon's first combo, ↓↓ then fire for its second (costs 3 ammo). On touch, swipe up or down on the Fire button.

## Project layout

Plain browser scripts sharing one global scope, loaded in order by `index.html`:

| File | What's in it |
| --- | --- |
| `src/style.css` | Menus, HUD, touch controls |
| `src/core.js` | Utilities, renderer, lighting, sky and time of day, particle systems, debris, geometry helpers |
| `src/world.js` | Terrain and ramps, town and scenery, collision, destructible props, pickups |
| `src/cars.js` | Car roster and stats, procedural car models, driving physics, car-to-car collisions |
| `src/weapons.js` | Projectiles, explosions, damage, weapons, combos and specials |
| `src/ai.js` | Opponent behaviour |
| `src/input-audio.js` | Keyboard, touch and gamepad input; synthesized sound effects |
| `src/game.js` | Game state, HUD, camera, menus, match flow, main loop |

Everything visual is built from code — no image, model or audio files.
