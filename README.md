# Scorched Highway

Heavy, hard-hitting vehicular combat in a desert quarry. Two tonnes of muscle car, a 40 mm autocannon, and a front end built for ramming. Last car running wins.

This is the Godot rebuild. The earlier browser prototype is in the git history (before this branch). **[DESIGN.md](DESIGN.md)** sets out the new game: pillars, damage rules, roster and roadmap.

## Play

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
| Fire | J or left mouse | RB / X |
| Restart after a match | Enter | Start |
| Quit | Esc | Back |

**How fights work:** collisions do damage from physics: ½ · reduced mass · closing speed². Every hit lands on a zone: the **front** (ram bar) takes ×0.35, **sides** ×1.0 and the **rear** ×1.3. T-bone people and keep your nose pointed at trouble. The ram charge hardens your front to ×0.15 and hits 50% harder. The cannon's shells are for shoving a car into position, not for grinding it down.

## Develop

```sh
# Headless tests: physics at rest, driving, ram and wall damage, the cannon, wrecking, a full bot match
godot --headless --fixed-fps 120 --path . res://tests/test_runner.tscn

# Screenshots of a bot match (needs a GPU or software Vulkan; not --headless)
godot --path . res://tools/screenshot.tscn -- shots 2 9 16
```

CI runs the tests on every push and pull request.

| Path | What's there |
| --- | --- |
| `scripts/car/car.gd` | The car: raycast suspension, tyre grip, ram charge, collision → zone damage |
| `scripts/car/car_defs.gd` | Tuning numbers per chassis |
| `scripts/car/car_visual.gd` | Placeholder body built from primitives, with panels that come off |
| `scripts/car/ai_driver.gd`, `player_driver.gd` | Drivers write throttle / steer / fire into the car |
| `scripts/combat/` | Autocannon and its shells |
| `scripts/fx/impact.gd` | Autoload `Impact`: hitstop, slow motion, shake, sparks, debris, fireballs |
| `scripts/fx/chase_camera.gd` | A camera with mass, trauma shake and kicks |
| `scripts/audio/sfx.gd` | Autoload `Sfx`: synthesised engine, impacts, cannon, explosions |
| `scripts/world/arena.gd` | The Pit: lighting, sky, rocks, containers, ramps |
| `scripts/ui/hud.gd` | Armour silhouette, speed, ram and heat meters |
| `scripts/game.gd` | Match flow |

Everything is built in code for now, so the project is easy to read and diff. Modelled cars and real sound recordings come with the art pass (see the roadmap in DESIGN.md).
