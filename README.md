# Scorched Highway

Vehicular combat and contact racing in an alternate 1970s, where a TV network runs the bloodsport coast to coast. Eight cars, eight drivers, every one the star of a show, each with a signature special. Heavy, hard-hitting physics in an inked-comic look after Borderlands.

This is the Godot rebuild. The earlier browser prototype is in the git history. **[DESIGN.md](DESIGN.md)** sets out the game: pillars, damage rules, modes, roster, visual direction and roadmap.

## Play

**[Play it in your browser →](https://thedumbtechguy.github.io/scorched_highway/)** Keyboard or gamepad; best in a desktop browser. The browser build uses Godot's simpler web renderer; it has the same ink and hatching, without the desktop's extra crease lines.

To run it locally instead:

Needs [Godot 4.5](https://godotengine.org/download) (standard build, not .NET).

```sh
godot --path .            # run the game
godot -e --path .         # open the editor
```

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Throttle / brake & reverse | W / S | RT / LT |
| Steer | A / D | Left stick |
| Handbrake | Space | A |
| Ram charge | Shift | B / LB |
| Fire machine gun | J or left mouse | RB / X |
| Special | K / E or right mouse | Y |
| Choose car (before the match) | A / D or arrows | D-pad / left stick |
| Start / restart | Enter | Start |
| Reset when stuck | R | Back |
| Quit (desktop) | Esc | |

**How fights work:** collisions do damage from physics, and where a hit lands matters: the **front** takes ×0.35, **sides** ×1.0 and the **rear** ×1.3. The lighter car always takes the bigger jolt. The ram charge hardens your nose and hits harder. Every car has a machine gun and a signature special that recharges: cannons, a riot gun, fireworks mortars, a sound blast, scrap bombs, a tow hook, a hydraulic hop and a sidecar gunner.

## Develop

```sh
# Headless tests: every car at rest and driving, rams, walls, the gun, damage, all eight specials, a full 8-car match
godot --headless --fixed-fps 120 --path . res://tests/test_runner.tscn

# Stills and a gameplay clip of a bot match (needs a GPU or software Vulkan; not --headless)
godot --fixed-fps 30 --path . res://tools/showcase.tscn -- stills shots
godot --fixed-fps 30 --write-movie clip.avi --path . res://tools/showcase.tscn -- movie 15

# Screen flicker while firing (needs a real renderer; add --rendering-method gl_compatibility for the web one)
godot --fixed-fps 30 --path . res://tools/flash_check.tscn

# Bot combat benchmark: hunters against a looping target, then two 8-bot brawls (optionally name the hunters)
godot --headless --fixed-fps 60 --path . res://tools/bot_bench.tscn [-- gravel_queen ...]
```

CI runs the tests on every push and pull request.

| Path | What's there |
| --- | --- |
| `scripts/car/car.gd` | The car: raycast suspension on any wheel layout, tyre grip, ram charge, collision → zone damage |
| `scripts/car/car_defs.gd` | The roster: three body classes, each car's stats, and how stats become physics |
| `scripts/car/car_bodies.gd` | The eight silhouettes, built from primitives; `car_visual.gd` has the building kit, breakable panels and parts |
| `scripts/car/ai_driver.gd`, `player_driver.gd` | Drivers write throttle / steer / fire into the car |
| `scripts/combat/` | Machine gun, projectiles, explosions, aim assist |
| `scripts/combat/specials/` | One script per signature special |
| `scripts/fx/impact.gd` | Autoload `Impact`: hitstop, slow motion, shake, sparks, debris, fireballs |
| `scripts/fx/chase_camera.gd` | A camera with mass, trauma shake and kicks |
| `scripts/audio/sfx.gd` | Autoload `Sfx`: synthesised engine, impacts, cannon, explosions |
| `scripts/world/arena.gd` | The Pit: poster sky and lighting, rocks, containers, ramps |
| `scripts/fx/poster.gd`, `shaders/ink_surface.gdshader`, `shaders/ink_outline.gdshader`, `shaders/poster_post.gdshader` | The comic-ink look: cel shading with hatched shade, grime and cracks, brush-weight outlines, palette, crease lines |
| `scripts/ui/hud.gd` | Armour silhouette, speed, ram and heat meters |
| `scripts/game.gd` | Car selection and match flow |

Everything is built in code for now, so the project is easy to read and diff. Modelled cars and real sound recordings come with the art pass (see the roadmap in DESIGN.md).
