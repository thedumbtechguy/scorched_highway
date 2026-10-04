// Every map in the game. Import this once at startup; it registers them all (see registry.ts).
import { registerMap } from './registry';
import { ghostTown } from './ghost-town';
import { route67 } from './route67';

for (const m of [ghostTown, route67]) registerMap(m);
