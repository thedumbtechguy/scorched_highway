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
| `npm run perf -- [--quality high\|low] [--phone] [--frames 60]` | Benchmark: boot timings (median of warm loads), a scripted 6-car match driven frame by frame, draw calls, triangles and vertex memory per scene layer (shadow pass included), and the hottest functions. `--phone` emulates a phone viewport with touch and a 4x slower CPU. Writes `shots/perf-*.json`. It runs on a software GPU, so compare runs with each other |
| `npm run shots -- cars\|env [--tod noon\|sunset\|night] [names]` | Screenshots into `shots/` with a contact sheet: each car from three angles, or fixed viewpoints around the arena |

The first test run needs a browser: `npx playwright install chromium`.

In the browser console, `window.SH` exposes the game state and a few entry points (`SH.G`, `SH.tick(ms)`, `SH.step(dt, dt)`, `SH.startMatch()`, `SH.buildCarModel(def)` ...). The tests and tools use it too. Everything in the scene is added with `addToScene(obj, layer)` (`landscape`, `town`, `scatter`, `cars`, ...), so a layer can be found or hidden with `SH.scene.traverse(o => o.userData.layer === 'scatter' && (o.visible = false))`.

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

- **Two modes on two maps:** *Deathmatch* in the Ghost Town, last car running wins; and *Race* on **Route 67**, three laps of a canyon course with three forks (mine shaft or canyon road, gorge jump or switchback, old highway or sandy riverbed). Wrecks in a race respawn after three seconds with half armour.
- **Five weapons, carry three:** homing missiles, rocket pods, mortar, mines and a torch from crates, plus repair and special-ammo pickups. A fourth weapon throws out the one you have least of.
- **Combo moves:** an attack and a defensive combo for every weapon: Rattler volley and Decoy flare, Rocket fan and Tail gunner, Carpet barrage and Smoke screen, Mine toss and Kickback, Fireball and Ring of fire.
- **AI drivers** with personalities (rammers, snipers, opportunists) that hunt, retreat to repair, grab pickups and fight each other, or race the course and pick their branch at each fork.
- **Destructible arena:** exploding barrels and gas pumps, cacti, billboards and a water tower you can drop on someone.
- **Arcade driving:** drifts, ramps and dunes for big air, cars that smoke, burn and lose wheels when wrecked.
- **Options:** 2–5 opponents, three difficulties, noon / sunset / night (with headlights), view width and camera distance, auto-fire and auto-drift, fast or pretty graphics, sound on/off. Phones and tablets play in landscape.

## Controls

| Action | Keyboard | Gamepad | Touch |
| --- | --- | --- | --- |
| Drive / steer | WASD or arrows | Triggers + left stick | Left thumbstick |
| Drift | Space (also automatic on hard turns) | B | Drift |
| Machine gun | J or Z (also fires by itself at cars in its sights) | X | Automatic |
| Fire weapon | K or X | A | Fire |
| Attack combo | I or V | RB | Swipe up on Fire |
| Defensive combo | , or B | LB | Swipe down on Fire |
| Special | L or C | Y | Special |
| Switch weapon | Q / E | D-pad left / right | Tap the weapon panel |
| Switch target | Tab | Right-stick click | Tap a name tag |
| Flip back over | R | Back/Select | Flip back (appears when stuck) |
| Pause | P or Esc | Start | ❚❚ |

Menus work with arrows and Enter, or the d-pad, A and B. Auto-fire and auto-drift can be switched off in Settings. The keys live in one table, `src/input/bindings.ts`, which also drives the in-game help and HUD hints.

## Project layout

ES modules bundled by Vite, with Three.js (pinned to r128) from npm. Modules are grouped by system; lower layers never import from higher ones at load time, and shared code reaches maps and modes only through their registries:

| Folder | What's in it |
| --- | --- |
| `src/main.js` | Boot: builds the world, wires the menus, starts the loop |
| `src/engine/` | Utilities, renderer and lights, sky shader and time of day (`sky.ts`, `onTod` listeners), particles, debris, geometry helpers |
| `src/world/` | Engines every map shares: ground and collision queries that ask the map at a point (`terrain.js`, `collision.js`, `surface.js`), the sand/sandstone material, mesas and boulders (`landscape.ts`), procedural textures, road surfaces (`roads.ts`), plants and scatter (`flora.ts`), destructible props, pickups and their icons |
| `src/maps/` | The places. `types.ts` (what a map provides), `registry.ts` (lookup by id or position), `index.ts` (registers them), one folder per map: `ghost-town/` (the arena and menu backdrop: terrain, town, canyon wall, roads, props, crates) and `route67/` (the canyon race course and its scenery) |
| `src/modes/` | The rules. `types.ts` (what a mode provides), `registry.ts`, `index.ts`, and one file per mode: `deathmatch.ts`, `race.ts` |
| `src/cars/` | `roster.js` (stats), `car.js` (driving physics, car collisions), `model/` (procedural model kit: lofted hulls, materials and reflections, painted decals, wheels) and `recipes/` (one file per car) |
| `src/combat/` | Projectile pools, damage, explosions and effects, weapons, combos and specials |
| `src/ai/` | Opponent behaviour |
| `src/input/`, `src/audio/` | Keyboard, touch and gamepad input; synthesized sound |
| `src/game/` | Game state and settings, HUD, camera, menus and results, the match loop (`match.js`, the same for every map and mode), main loop and quality |
| `src/style.css` | Menus, HUD, touch controls |
| `tests/`, `tools/` | Playwright tests; screenshot, benchmark (`perf.js`) and bot-match (`botmatch.js`) tools |

New modules can be written in TypeScript (`.ts`) directly; Vite compiles them and `npm run typecheck` checks them alongside the JavaScript. Add JSDoc types (`/** @type {...} */`) when the checker can't infer something.

### Performance notes

- Draw calls matter most on phones. Static scenery is merged per area (terrain tiles, canyon slices, ground-cover cells) so it can be culled without costing a call per object; repeated things are instanced (wheels, pickups, barrels, tumbleweeds).
- Cars use one material for paint, chrome and trim, reading roughness, metalness and clear coat from a per-vertex attribute, so a car is about five draw calls. Distant cars swap to simple wheels.
- All shaders are compiled at boot and at match start (`renderer.compile`), so effects don't stutter the first time they appear.
- Run `npm run perf` before and after a change that adds geometry or materials.

Everything visual is built from code. There are no image, model or audio files.

### Maps and modes

A **map** is a place and a **mode** is a set of rules; the garage pairs them (each map lists the modes it can host). The match loop in `src/game/match.js` runs cars, weapons and effects the same way everywhere and asks the mode for everything that differs.

All maps live in one scene, each in its own 6 km band of world x (`x0` to `x1`), far enough apart that fog and the camera's far plane keep them out of each other's view. Shared code never asks "which map is this?": ground height, collision, sight lines and surface grip go through `mapAt(x)` in `src/maps/registry.ts`. A map other than the menu map is built the first time it's played.

### Adding a map

1. Make `src/maps/<id>/index.ts` exporting a `GameMap` (`src/maps/types.ts`). Give it the next free band (`x0: 9000, x1: 15000`, and so on) and put everything inside it: an origin at the band's middle keeps coordinates small.
2. Provide the ground (`height`, `ramp`, `drawn`, `roadLift`, `speed`), collision (`collide`, `blocked`, `solid`, `outOfBounds`, optionally `sees`), a `build` that adds its meshes, and `drawRadar`. Reuse `desertMaterial`, `addMesas`, `addBoulders`, `ribbon` and the scatter and props engines from `src/world/`.
3. List its `modes`, and provide what they need: `spawns` for deathmatch, a `course` for races (see `route67/track.ts`).
4. Register it in `src/maps/index.ts`. `tests/maps.spec.js` then plays it in each of its modes; check the frame cost with `npm run perf -- --map <id> --mode <mode>`.

### Adding a mode

1. Make `src/modes/<id>.ts` exporting a `GameMode` (`src/modes/types.ts`): `setup` places the cars and gives loadouts, `step` runs the rules, `wrecked` says what a wreck means, `status` fills the HUD's top line, `results` fills the results screen, and `drive` (optional) steers the bots.
2. Register it in `src/modes/index.ts` and add its id to the `modes` of each map that can host it. It appears in the garage automatically.

### Adding a car

Add its stats to `src/cars/roster.js`, write a recipe in `src/cars/recipes/<id>.js` (see `sundowner.js`: a `loftZ` body, `K.sideGlass` / `K.topGlass` windows, `K.decal` livery, lamps, `K.gun`, `K.wheel`), register it in `src/cars/recipes/index.js`, then check it with `npm run shots -- cars <id>`.
