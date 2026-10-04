// Every mode in the game. Import this once at startup; it registers them all (see registry.ts).
import { deathmatch } from './deathmatch';
import { race } from './race';
import { registerMode } from './registry';

for (const m of [deathmatch, race]) registerMode(m);
