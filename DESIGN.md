# Scorched Highway: design

This is the design for the Godot version. The web prototype showed that the setting and car combat work, but it felt floaty and busy. This version keeps the Vigilante 8 spirit (weapons, specials, characters, couch play) and the contact racing of Wreckfest, and builds both on three words: **heavy, hard hitting, premium**.

**Decided so far:** races and arena combat are equal headline modes; V8-style weapons (a signature special per car plus pickups); four race types and four arena modes; a career mode; classed car upgrades; a televised-bloodsport alternate 1970s; 8-car events of 3–5 minutes; 8 cars at launch; heavy arcade handling; a choice of touch schemes; split-screen for up to 4 players; online later; configurable bots in every multiplayer mode; the Drive-In Poster visual direction.

## Pillars

### 1. Heavy
Every car is two tonnes of steel or more, and you should feel it.

- **Real weight transfer.** Raycast suspension per wheel, so the nose dips under braking, the body rolls in corners and the springs crunch on landing. A low centre of mass keeps cars on their wheels without them feeling glued down.
- **Momentum is a resource.** Acceleration is slow, top speed is high and turning sheds speed. Getting back up to speed costs time, so every line you take matters.
- **Grip that breaks away.** Tyres have a friction limit and slide past it. The handbrake kills rear grip for a deliberate drift. There is no auto-drift.
- **A camera with mass.** The chase camera lags behind, swings into turns and leans on the car's velocity rather than its nose. The field of view widens with speed.

### 2. Hard hitting
**Guns and rams matter equally, as in Vigilante 8.** Weapons do real damage; collisions are a weapon in their own right, and armour zones apply to both.

- **Damage comes from physics.** Collision damage is the kinetic energy delivered along the contact normal: ½ · reduced mass · closing speed². A heavier car, or a faster one, hits harder. Nothing is scripted.
- **Armour zones decide who wins a collision.** Every hit lands on the front, side or rear of each car:

  | Zone | Damage taken |
  | --- | --- |
  | Front (reinforced ram) | ×0.35 |
  | Side | ×1.0 |
  | Rear (fuel tank) | ×1.3 |

  T-bone someone and they take about three times the damage you do. Run nose-first into a wall and you mostly hurt the wall. Positioning beats button mashing.
- **Ram charge.** The boost is also a ram. While it burns, extra thrust pushes the car on, front armour hardens to ×0.15 and ram damage goes up 50%. The meter is short, so every charge is a commitment.
- **Weapons, V8 style.** Every car has a signature special weapon, and pickups on the track or arena add the rest (missiles, mortar, mines and more). Every weapon hits with weight: shells and blasts shove cars, recoil kicks the shooter, and the armour zones apply, so a rocket up the tailpipe hurts more than one off the ram bar. The prototype's 40 mm autocannon (shove, recoil, overheating) is the template for how a weapon should feel.
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

### Premise
An alternate 1970s where a TV network runs vehicular bloodsport coast to coast for ratings, in the spirit of *Death Race 2000*. Races and brawls are broadcast events with sponsors, commentators, rivalries and seasons. The premise justifies every mode and gives the career its structure.

### Modes
Races and arena combat carry equal weight. Every event has 8 cars, human or bot, and lasts 3–5 minutes: races of 3–4 laps, brawls on about a 4-minute clock.

**Races.** Wreckfest-style contact racing with V8 weapons. Wrecked cars respawn after a few seconds, damaged and behind.

| Type | What it is |
| --- | --- |
| Branching circuits | Multi-lap tracks with forks, risky shortcuts, and routes that open mid-race when something is destroyed (a wall, a bridge, a water tower) |
| Crossover tracks | Figure-8s and tracks that cross themselves, so the field collides head-on and side-on every lap |
| Highway runs | Point-to-point dashes down the highway through traffic, tankers and roadblocks |
| Elimination | Last place is knocked out each lap, or the field shrinks until one car is left |

**Arena combat.**

| Mode | What it is |
| --- | --- |
| Last car running | Free-for-all with no respawns; the last car alive wins |
| Timed brawl | Respawns on; most wrecks when the clock runs out wins |
| Team battle | Two teams with a shared score, under either rule set above |
| Objective modes | Hold a zone, escort or attack a convoy, destroy a target structure |

### Career
Wreckfest-style championships across every mode: series of events, earning money and unlocks, with the TV network's seasons, sponsors and rivals as a light story on top.

**Progression.** Unlock cars, buy performance and armour upgrades, paint and decals. Upgrades raise a car's class rating, and events (and online matchmaking later) are restricted by class, so upgrades never make online play unfair.

### Multiplayer
- **Split-screen** for up to 4 players on desktop (and consoles, if we go there). Cameras, HUD and input are per player from the start, and the visual budget assumes up to four views.
- **Online** comes later; see *Platforms* for what that means for the design now.
- **Bots in every mode.** Split-screen and online events can include AI drivers alongside humans. The host configures them: how many bots (up to the 8-car field), their difficulty, and optionally which cars they drive. Online, bots can also fill slots left by players who drop out.

### Cars
Eight cars at launch, one per grid slot, each a clear trade-off between mass, power, armour and its special weapon, each with a driver. The prototype has one chassis, *Sundowner* (a 2,000 kg muscle car). The roster, the drivers and the weapon list are still to be designed.

**Handling: heavy arcade.** Weight transfer, momentum and real collisions, but forgiving: generous grip, easy drifts, air control and quick recovery, so it plays well on gamepad, keyboard and touch.

### AI
Bots read the same zone rules as the player: they try to land side and rear hits and keep their own nose towards trouble. In races they pick branches, fight for position and use pickups.

## Controls

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Throttle / brake & reverse | W / S (or arrows) | RT / LT |
| Steer | A / D | Left stick |
| Handbrake | Space | A |
| Ram charge (boost) | Shift | B / LB |
| Fire | J or left mouse | RB / X |
| Restart (after a match) | Enter | Start |

**Touch** offers a choice of schemes. The default has automatic throttle, thumb steering on the left, and buttons on the right for brake, fire, special and ram. Options add tilt steering and manual throttle, and gamepads work on phones too.

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
