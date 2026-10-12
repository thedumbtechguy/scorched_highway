# Scorched Highway: design

This is the design for the Godot version. The web prototype (Vigilante 8 style: six light cars, lots of pickups, combos) showed that the setting and car combat work. It also felt floaty and busy, so this version starts again from three words: **heavy, hard hitting, premium**.

## Pillars

### 1. Heavy
Every car is two tonnes of steel or more, and you should feel it.

- **Real weight transfer.** Raycast suspension per wheel, so the nose dips under braking, the body rolls in corners and the springs crunch on landing. A low centre of mass keeps cars on their wheels without them feeling glued down.
- **Momentum is a resource.** Acceleration is slow, top speed is high and turning sheds speed. Getting back up to speed costs time, so every line you take matters.
- **Grip that breaks away.** Tyres have a friction limit and slide past it. The handbrake kills rear grip for a deliberate drift. There is no auto-drift.
- **A camera with mass.** The chase camera lags behind, swings into turns and leans on the car's velocity rather than its nose. The field of view widens with speed.

### 2. Hard hitting
**The car is the main weapon. Guns set up hits; collisions finish them.**

- **Damage comes from physics.** Collision damage is the kinetic energy delivered along the contact normal: ½ · reduced mass · closing speed². A heavier car, or a faster one, hits harder. Nothing is scripted.
- **Armour zones decide who wins a collision.** Every hit lands on the front, side or rear of each car:

  | Zone | Damage taken |
  | --- | --- |
  | Front (reinforced ram) | ×0.35 |
  | Side | ×1.0 |
  | Rear (fuel tank) | ×1.3 |

  T-bone someone and they take about three times the damage you do. Run nose-first into a wall and you mostly hurt the wall. Positioning beats button mashing.
- **Ram charge.** The boost is also a ram. While it burns, extra thrust pushes the car on, front armour hardens to ×0.15 and ram damage goes up 50%. The meter is short, so every charge is a commitment.
- **One heavy gun per car.** No weapon pickups to juggle. Each car mounts a slow, punchy gun: the starter car has a 40 mm autocannon (about three rounds a second) whose shells shove the target sideways and kick the shooter back. It heats up, so you fire in bursts. Its job is to knock a car out of line for a ram, not to grind down a health bar.
- **Every hit is felt.** Impacts scale with energy:
  - **Hitstop:** the game freezes for 30–120 ms.
  - **Camera trauma:** shake plus a kick away from the hit.
  - **Sparks and debris.**
  - **Detaching panels:** bumpers, the hood and doors come off as their zones take damage.
  - **A layered sound:** a low thump plus metal crunch.

  A wreck gets slow motion and a fireball.

### 3. Premium
- **Restraint.** A small HUD that stays out of the way: an armour silhouette that shows which zones are hurt, a speed readout, and boost and heat bars. No clutter, and no popups during a fight.
- **A designed look, executed fully.** See *Visual direction* below. Every asset is drawn for the style; nothing ships half-stylised.
- **Fewer, better things.** One arena that is built well beats five rough ones. Each new car, gun or arena ships only when it is polished.
- **Sound carries half the weight.** The engine note follows revs and load. Impacts have a sub-bass layer. Gunfire booms.

## Visual direction: Drive-In Poster

Chosen from three look tests (`tools/look_dev.tscn`). Every frame should look like a 1970s drive-in movie poster or a hot-rod magazine illustration. Borderlands and XIII are the closest game references; Hi-Fi Rush for how comic timing sells hits.

- **Shading:** two-tone cel shading with hard light/shadow edges. Shadows are a warm purple (ambient), never grey or black.
- **Line:** ink outlines on every silhouette and major crease, thinning with distance so the horizon stays clean. Outlines are drawn on the models (inverted hull), with a screen-space edge pass on top where the renderer supports it.
- **Colour:** flat poster colour from a fixed period palette: sand ochre, canyon orange, sky gradient from burnt orange to cream, and car paints in saturated reds, teals, golds and creams. Textures are painted colour shapes and hatching, not photographic detail.
- **Print texture:** a light halftone screen in the shadows and a faint paper grain over everything.
- **Cars:** bold, graphic silhouettes with exaggerated proportions (fat tyres, big ram bars), painted stripes, numbers and decals. Damage shows as missing panels, crumples drawn in line, and scorch marks.
- **Hits:** ink-streak sparks, chunky inked debris, impact frames (a one- or two-frame flash of high-contrast colour on big hits), speed lines on the ram charge, smoke as flat stylised shapes. Optional onomatopoeia for the biggest hits.
- **HUD:** period type and print-style graphics, like a dashboard gauge or a magazine sidebar, in the same palette.
## The game

**Modes.** *Wreck*: free-for-all in an arena, last car running wins. *Run* comes later: a race on the highway itself, with the same physics and damage, where ramming rivals off the road is as valid as outdriving them.

**Arena 1: The Pit.** A sunken quarry floor ringed by rock walls. Shipping containers and concrete pillars give cover and something to slam people into. A central mesa with ramps gives jumps and a place to be rammed off, and banked corners keep speed flowing.

**Cars.** A small roster where each car is a clear trade-off between mass, power and its gun. The vertical slice has one chassis, *Sundowner* (2,000 kg muscle car, 40 mm autocannon). The roster then grows towards:

| Car | Mass | Feel | Gun |
| --- | --- | --- | --- |
| Sundowner | 2.0 t | Balanced muscle car | 40 mm autocannon |
| Gravel Queen | 3.4 t | Slow armoured truck, a battering ram | Mortar |
| Scorcher | 1.6 t | Fast and fragile, hit and run | Twin rocket rails |
| Lawdog | 2.4 t | Interceptor with a push bar | Slug shotgun |

**AI.** Bots read the same zone rules as the player. They try to line up side and rear hits, back off when their front is not facing you, and use the gun to knock you off line before they charge.

## Controls

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Throttle / brake & reverse | W / S (or arrows) | RT / LT |
| Steer | A / D | Left stick |
| Handbrake | Space | A |
| Ram charge (boost) | Shift | B / LB |
| Fire | J or left mouse | RB / X |
| Restart (after a match) | Enter | Start |

## Platforms

Targets are desktop (Windows, macOS, Linux) and high-end phones (recent iOS and Android flagships), designed at full quality. A quality setting scales down for other devices, which are supported but not targets:

| Setting | For | Renderer |
| --- | --- | --- |
| High | Desktop, flagship phones | Forward+ |
| Medium | Older capable phones | Mobile renderer, lighting baked into the art |
| Low | Web and weaker devices | Compatibility (WebGL 2) |

Changing renderer needs a restart. The Drive-In Poster style scales down well because it relies on colour and line rather than lighting effects.

Online play comes later, and the design keeps it in mind now: the server decides collisions and damage, hitstop and slow motion affect only the local camera and effects, and matches plan for 4 to 8 cars.

## Roadmap

1. **Vertical slice (this branch):**
   - Sundowner chassis with suspension, grip, handbrake and ram charge.
   - The Pit arena and the autocannon.
   - Zone damage, hitstop, shake, sparks and detaching panels.
   - Two AI opponents, procedural sound, the HUD and match flow.
   - Headless tests for physics resting, ramming rules and a full match.
2. **Feel pass:** tune with real play; add controller rumble.
3. **Art pass:** modelled cars (Blender to glTF) replace the procedural placeholders; arena dressing and decals.
4. **Roster:** the other three cars and their guns.
5. **Run mode:** the highway race.
