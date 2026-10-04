// The career record shown on the title screen, and the results screen at the end of a match.
import { $, loadStore, store } from '../engine/util.js';
import { G } from './state.js';
import type { Car, GameMode } from '../modes/types';

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

/** Fill in the results screen for the match that just ended (the mode supplies the content) and add it to the career record. */
export function showResults() {
  const p = G.player as Car, cars = G.cars as Car[], r = (G.mode as GameMode).results(), place = r.order.indexOf(p) + 1, win = r.win;
  const title = $('#overTitle'); title.textContent = r.title; title.classList.toggle('lost', !win);
  $('#overSub').textContent = r.sub;
  $('#againBtn').textContent = (G.mode as GameMode).againLabel;
  $('#rPlace').textContent = ordinal(place); $('#rOf').textContent = `of ${cars.length}`;
  $('#rTiles').innerHTML = r.tiles.map(([label, value]) => `<div><b>${esc(value)}</b><span>${esc(label)}</span></div>`).join('');
  $('#rStandings').innerHTML = r.order.map((c, i) => {
    const who = c.isPlayer ? `You <small>${esc(c.def.name)}</small>` : `${esc(c.def.driver)} <small>${esc(c.def.name)}</small>`;
    return `<li class="${c.isPlayer ? 'me' : ''}"><b>${ordinal(i + 1)}</b><i style="background:${c.def.tag}"></i><span class="who">${who}</span><span class="k">${plural(c.kills, 'wreck')}</span><span class="fate">${esc(r.fate(c))}</span></li>`;
  }).join('');
  // career record, and anything this match beat
  const c = career(), badges: string[] = [];
  if (win && !c.wins) badges.push('First win!');
  if (p.kills > c.mostKills && c.matches) badges.push('Most wrecks in a match');
  if (c.bestPlace && place < c.bestPlace) badges.push('Best finish yet');
  $('#rBadges').innerHTML = badges.map(b => `<span>${b}</span>`).join('');
  store('best', { matches: c.matches + 1, wins: c.wins + (win ? 1 : 0), kills: c.kills + p.kills, mostKills: Math.max(c.mostKills, p.kills), bestPlace: c.bestPlace ? Math.min(c.bestPlace, place) : place });
}
