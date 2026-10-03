# Scorched Highway

A free-for-all vehicular combat game set in a 1977 desert ghost town, inspired by late-90s car combat games like Vigilante 8. Six drivers, one arena, a trunk full of rockets — last car running wins.

Runs in any modern browser, desktop or phone. Players need nothing installed; developing it needs Node (see below).

## Play

The game is a static site: `npm run build` produces `dist/`, which can be hosted anywhere. Pushes to `main` are built and published to GitHub Pages by CI (one-time setup: *Settings → Pages → Source: GitHub Actions*).

## Develop

Needs Node 20+.

```sh
npm install
npm run dev        # dev server with hot reload at http://localhost:5173
npm run check      # lint + typecheck + build + smoke tests, the same as CI
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` / `npm run preview` | Production build into `dist/`, and serve it |
| `npm run lint` | ESLint, which catches undefined names, unused code and writes to imported values |
| `npm run typecheck` | TypeScript checks the JavaScript (loose mode) against Three.js's types; catches wrong property names and argument types |
| `npm test` | Playwright smoke tests against the build: boot, every car model, garage, a fast-forwarded match |
| `npm run shots -- [--tod noon\|sunset\|night] [car ids]` | Renders each car from three angles plus a contact sheet into `shots/` |

The first test run needs a browser: `npx playwright install chromium`.

In the browser console, `window.SH` exposes the game state and a few entry points (`SH.G`, `SH.step(dt, dt)`, `SH.startMatch()`, `SH.buildCarModel(def)` ...). The tests and tools use it too.

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

ES modules bundled by Vite, with Three.js (pinned to r128) from npm. Modules are grouped by system; lower layers never import from higher ones at load time:

| Folder | What's in it |
| --- | --- |
| `src/main.js` | Boot: builds the world, wires the menus, starts the loop |
| `src/engine/` | Utilities, renderer and lights, sky and time of day (`onTod` listeners), particles, debris, geometry helpers |
| `src/world/` | Terrain and ramps, town and scenery, destructible props, collision queries, pickups |
| `src/cars/` | `roster.js` (stats), `car.js` (driving physics, car collisions), `model/` (procedural model kit: lofted hulls, materials and reflections, painted decals, wheels) and `recipes/` (one file per car) |
| `src/combat/` | Projectile pools, damage, explosions and effects, weapons, combos and specials |
| `src/ai/` | Opponent behaviour |
| `src/input/`, `src/audio/` | Keyboard, touch and gamepad input; synthesized sound |
| `src/game/` | Game state and settings, HUD, camera, menus, match flow, main loop and quality |
| `src/style.css` | Menus, HUD, touch controls |
| `tests/`, `tools/` | Smoke tests; the car screenshot tool |

New modules can be written in TypeScript (`.ts`) directly; Vite compiles them and `npm run typecheck` checks them alongside the JavaScript. Add JSDoc types (`/** @type {...} */`) when the checker can't infer something.

Everything visual is built from code. There are no image, model or audio files.

### Adding a car

Add its stats to `src/cars/roster.js`, write a recipe in `src/cars/recipes/<id>.js` (see `sundowner.js`: a `loftZ` body, `K.sideGlass` / `K.topGlass` windows, `K.decal` livery, lamps, `K.gun`, `K.wheel`), register it in `src/cars/recipes/index.js`, then check it with `npm run shots -- <id>`.
