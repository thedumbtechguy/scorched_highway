// Balance check: bots-only matches, simulated as fast as possible (no rendering).
// Deathmatch: the player's car is parked out of the way and can't be hurt; reports match length and weapon use.
// Race: the player's car sits on the grid (so rubber banding is off: it would hold every bot back to it), or with
// --player bot a bot drives it as a stand-in for a player who takes the shortcuts, to check the bots' pace; reports finish and lap times, wrecks, which branch each bot took at
// each fork, when each one unlocked its machine gun (sword plate), the hazards skulls set off, and any bot that
// stopped making progress (stuck).
//   npm run bots -- [--mode deathmatch|race] [--map id] [--matches 6] [--difficulty 0-2] [--car id] [--player bot] [--url http://localhost:4173/]   (default: starts a dev server)
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const standIn = opt('player', '') === 'bot', mode = opt('mode', 'deathmatch'), map = opt('map', mode === 'race' ? 'route67' : 'ghost-town'), N = +opt('matches', mode === 'race' ? 2 : 6);
let server = null, url = opt('url');
if (!url) { server = await createServer({ server: { port: 5197, strictPort: false }, logLevel: 'error' }); await server.listen(); url = server.resolvedUrls.local[0]; }
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('pageerror', e => console.error('page error:', e.message));
await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
await page.addInitScript(s => localStorage.setItem('shwy_settings', JSON.stringify(s)), { mode, map, opponents: 5, quality: 'low', rubber: standIn ? 'on' : 'off', difficulty: +opt('difficulty', 1), car: opt('car', 'sundowner') });
await page.goto(url); await page.waitForFunction(() => window.SH && window.SH.G.state === 'title', null, { timeout: 60000 });

if (mode === 'race') {
  for (let k = 0; k < N; k++) {
    const r = await page.evaluate(standIn => {
      const { G, goGarage, startMatch, step, AI } = window.SH; goGarage(); startMatch(); G.countdown = 0;
      const p = G.player, bots = G.cars.filter(c => !c.isPlayer), course = G.map.course;
      if (standIn) { const me = new AI(p); me.pers = 'rammer'; G.ais.push(me); bots.unshift(p); } // rammers take the shortcuts
      const wrecks = new Map(bots.map(c => [c, 0])), branches = new Map(bots.map(c => [c, []])), alive = new Map(bots.map(c => [c, true]));
      const last = new Map(bots.map(c => [c, { d: 0, t: 0 }])), stuck = [], armed = new Map(), hz = window.SH.hazards;
      let falls = 0, trucks = 0, rocks = 0, truck = null;
      let t = 0;
      for (; t < 420 && !bots.every(c => c.race.finished); t += 1 / 60) {
        if (!standIn) { p.input = { throttle: 0, steer: 0, handbrake: true }; p.mgHeld = p.wHeld = p.wFire = p.sFire = false; p.hp = 1e6; }
        step(1 / 60, 1 / 60);
        if (hz.ROCKS.length > rocks) falls++; rocks = hz.ROCKS.length; if (hz.truck && hz.truck !== truck) trucks++; truck = hz.truck;
        for (const c of bots) {
          if (!c.mgLocked && !armed.has(c)) armed.set(c, Math.round(t));
          if (alive.get(c) && !c.alive) wrecks.set(c, wrecks.get(c) + 1); alive.set(c, c.alive);
          const pr = c.race.progress, sec = course.sections[pr.section];
          if (sec.paths.length > 1) { const b = branches.get(c), tag = `${pr.lap}:${pr.section}`; if (!b.length || b[b.length - 1].tag !== tag) b.push({ tag, name: sec.paths[pr.path].name }); else b[b.length - 1].name = sec.paths[pr.path].name; }
          // no progress for 15 s while running: stuck
          const d = course.distance(pr), L = last.get(c);
          if (!c.alive) { L.d = -Infinity; L.t = t; } else if (d > L.d + 5 || c.race.finished) { L.d = d; L.t = t; } // a respawn starts the count again else if (t - L.t > 15 && !L.reported) { L.reported = true; const q = sec.paths[pr.path]; stuck.push(`${c.def.id} on ${q.name} at ${Math.round(q.s[pr.i])} m`); }
        }
      }
      const fmt = s => s ? `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}` : 'DNF';
      return {
        t: Math.round(t), stuck, hazards: `rockfalls ${falls}, trucks ${trucks}`,
        rows: [...bots].sort((a, b) => (a.race.finished || 1e9) - (b.race.finished || 1e9)).map(c => `${(c.isPlayer ? '*' : ' ') + c.def.id.padEnd(12)} ${fmt(c.race.finished).padEnd(7)} laps ${c.race.lapTimes.map(x => x.toFixed(1)).join(' / ').padEnd(20)} wrecks ${wrecks.get(c)}  gun ${armed.has(c) ? armed.get(c) + 's' : 'never'}  ${branches.get(c).map(b => b.name).join(', ')}`),
      };
    }, standIn);
    console.log(`race ${k + 1} (${r.t} s, ${r.hazards})\n  ` + r.rows.join('\n  ') + (r.stuck.length ? '\n  STUCK: ' + r.stuck.join('; ') : ''));
  }
} else {
  const res = [];
  for (let k = 0; k < N; k++) res.push(await page.evaluate(() => {
    const { G, goGarage, startMatch, step } = window.SH; goGarage(); startMatch(); G.countdown = 0;
    const p = G.player; const seen = new WeakSet(), use = {};
    let t = 0;
    for (; t < 240 && G.cars.filter(c => c.alive && c !== p).length > 1; t += 1 / 60) {
      p.hp = 1e6; p.x = 170; p.z = 0; p.vx = p.vz = 0; p.input = { throttle: 0, steer: 0, handbrake: true }; p.mgHeld = p.wHeld = p.wFire = p.sFire = false;
      step(1 / 60, 1 / 60);
      for (const q of window.SH.combat.PROJ) if (!seen.has(q)) { seen.add(q); use[q.type] = (use[q.type] || 0) + 1; }
    }
    const kills = G.cars.reduce((a, c) => a + c.kills, 0);
    // finishing place per car: survivors by health share, then the wrecks, last wrecked first
    const order = [...G.cars.filter(c => c !== p && c.alive).sort((a, b) => b.hp / b.def.hp - a.hp / a.def.hp), ...G.cars.filter(c => c !== p && !c.alive).sort((a, b) => a.place - b.place)];
    return { t: Math.round(t), kills, use, places: order.map((c, i) => [c.def.id, i + 1, c.kills]) };
  }));
  const ts = res.map(r => r.t).sort((a, b) => a - b);
  console.log('match lengths (s):', ts.join(' '), '| median', ts[ts.length >> 1]);
  const use = {}; for (const r of res) for (const [k, v] of Object.entries(r.use)) use[k] = (use[k] || 0) + v;
  const per = {}; for (const r of res) for (const [id, place, k] of r.places) { const e = per[id] ||= { n: 0, place: 0, wins: 0, kills: 0 }; e.n++; e.place += place; e.kills += k; if (place === 1) e.wins++; }
  console.log('per car (avg place, wins, kills per match):'); for (const [id, e] of Object.entries(per).sort((a, b) => a[1].place / a[1].n - b[1].place / b[1].n)) console.log(`  ${id.padEnd(12)} place ${(e.place / e.n).toFixed(1)}  wins ${e.wins}/${e.n}  kills ${(e.kills / e.n).toFixed(1)}`);
  console.log('shots per match (machine gun excluded):', Object.fromEntries(Object.entries(use).filter(([k]) => k !== 'bullet').map(([k, v]) => [k, +(v / N).toFixed(1)])));
}
await browser.close(); if (server) await server.close();
