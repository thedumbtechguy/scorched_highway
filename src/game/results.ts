// The career record shown on the title screen, and the results screen at the end of a match.
import { $, loadStore, store } from '../engine/util.js';
import { G } from './state.js';

interface Career { matches: number; wins: number; kills: number; mostKills: number; bestPlace: number }
export function career(): Career { return Object.assign({ matches: 0, wins: 0, kills: 0, mostKills: 0, bestPlace: 0 }, loadStore('best', {})); }

const ordinal = (n: number) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** "12 matches · 3 wins · 27 wrecks" under the title, once there's a record to show. */
export function showRecord() {
  const c = career(), el = $('#record');
  el.hidden = !c.matches;
  el.textContent = [plural(c.matches, 'match').replace('matchs', 'matches'), plural(c.wins, 'win'), plural(c.kills, 'wreck')].join(' · ');
}

type Car = { isPlayer: boolean; alive: boolean; hp: number; place: number; kills: number; dealt: number; def: { hp: number; name: string; driver: string; tag: string }; wreckedBy?: Car | null };

/** Fill in the results screen for the match that just ended, and add it to the career record. */
export function showResults(win: boolean, by: Car | null) {
  const p = G.player as Car, cars = G.cars as Car[];
  // standings: cars still running (healthiest first), then the wrecks, most recent first
  const order = [...cars.filter(c => c.alive).sort((a, b) => b.hp / b.def.hp - a.hp / a.def.hp), ...cars.filter(c => !c.alive).sort((a, b) => a.place - b.place)];
  const place = order.indexOf(p) + 1;

  const title = $('#overTitle'); title.textContent = win ? 'Last one standing' : 'Wrecked'; title.classList.toggle('lost', !win);
  $('#overSub').textContent = win ? `${p.def.driver} rolls out of town with the ${p.def.name} still smoking.`
    : by ? `${by.def.driver} got the better of you this time.` : 'The desert got the better of you this time.';
  $('#rPlace').textContent = ordinal(place); $('#rOf').textContent = `of ${cars.length}`;
  $('#rKills').textContent = String(p.kills); $('#rDmg').textContent = String(Math.round(p.dealt));
  const s = G.clock | 0; $('#rTime').textContent = (s / 60 | 0) + ':' + String(s % 60).padStart(2, '0');

  $('#rStandings').innerHTML = order.map((c, i) => {
    const who = c.isPlayer ? `You <small>${esc(c.def.name)}</small>` : `${esc(c.def.driver)} <small>${esc(c.def.name)}</small>`;
    const fate = c.alive ? 'still running' : c.wreckedBy ? `wrecked by ${c.wreckedBy.isPlayer ? 'you' : esc(c.wreckedBy.def.driver.split(' ')[0])}` : 'crashed out';
    return `<li class="${c.isPlayer ? 'me' : ''}"><b>${ordinal(i + 1)}</b><i style="background:${c.def.tag}"></i><span class="who">${who}</span><span class="k">${plural(c.kills, 'wreck')}</span><span class="fate">${fate}</span></li>`;
  }).join('');

  // career record, and anything this match beat
  const c = career(), badges: string[] = [];
  if (win && !c.wins) badges.push('First win!');
  if (p.kills > c.mostKills && c.matches) badges.push('Most wrecks in a match');
  if (c.bestPlace && place < c.bestPlace) badges.push('Best finish yet');
  $('#rBadges').innerHTML = badges.map(b => `<span>${b}</span>`).join('');
  store('best', { matches: c.matches + 1, wins: c.wins + (win ? 1 : 0), kills: c.kills + p.kills, mostKills: Math.max(c.mostKills, p.kills), bestPlace: c.bestPlace ? Math.min(c.bestPlace, place) : place });
}
