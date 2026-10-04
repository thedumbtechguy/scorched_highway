import { ensureAudio, setSound } from '../audio/audio.js';
import { buildCarModel, disposeCarModel } from '../cars/model/build.js';
import { CARS, CAR_BY_ID } from '../cars/roster.js';
import { addToScene, camera } from '../engine/renderer.js';
import { applyTod, curTod } from '../engine/sky';
import { $ } from '../engine/util.js';
import { CAM } from './camera.js';
import { applyQuality, resize } from './loop.js';
import { clearMatch } from './match.js';
import { G, saveSettings } from './state.js';
import { PICKUPS } from '../world/pickups';
import { drawnGround } from '../world/surface.js';

// ================= screens =================
export function show(id) { for (const s of ['title', 'garage', 'pause', 'over', 'help', 'settings']) $('#' + s).hidden = s !== id; }
export function goTitle() {
  G.state = 'title'; show('title'); $('#hud').hidden = true; camera.clearViewOffset(); clearShowcase();
  for (const pk of PICKUPS) pk.visible = true;
}
export const SHOW_POS = { x: -72, z: 3 };
export function clearShowcase() { if (G.showcase) { disposeCarModel(G.showcase); G.showcase = null; } }
function setShowcase(def) {
  clearShowcase();
  const m = buildCarModel(def), yaw = 0.6, c = Math.cos(yaw), s = Math.sin(yaw);
  // stand it on the highest of the ground points under its wheels (the showroom spot is on the road)
  let y = -Infinity;
  for (const w of m.wheels) y = Math.max(y, drawnGround(SHOW_POS.x + w.x * c + w.z * s, SHOW_POS.z - w.x * s + w.z * c) - (w.y - w.r));
  m.group.position.set(SHOW_POS.x, y, SHOW_POS.z); m.group.userData.home = m.group.position.clone(); m.group.rotation.y = yaw; addToScene(m.group, 'cars'); G.showcase = m;
  for (const b of m.beams) b.visible = curTod.night;
}
export function buildGarage() {
  // one car per screen: arrows, dots, keyboard / gamepad left and right (see input/menu), and swipes on touch
  $('#carPrev').addEventListener('click', () => stepCar(-1));
  $('#carNext').addEventListener('click', () => stepCar(1));
  const dots = $('#carDots');
  for (const d of CARS) {
    const b = document.createElement('button'); b.dataset.id = d.id; b.setAttribute('aria-label', d.name); b.style.setProperty('--c', d.tag);
    b.addEventListener('click', () => selectCar(d.id)); dots.appendChild(b);
  }
  let sx = 0, sy = 0, sid = null;
  const g = $('#garage');
  g.addEventListener('pointerdown', e => { if (/** @type {HTMLElement} */ (e.target).closest('button,.gcard')) return; sid = e.pointerId; sx = e.clientX; sy = e.clientY; });
  g.addEventListener('pointerup', e => {
    if (e.pointerId !== sid) return; sid = null;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) stepCar(dx < 0 ? 1 : -1);
  });
  // match setup: ‹ value › pickers
  document.querySelectorAll('.cyc').forEach((/** @type {HTMLElement} */ el) => {
    const key = el.dataset.opt, vals = el.dataset.vals.split(','), labels = el.dataset.labels.split(',');
    el.innerHTML = `<button aria-label="Previous">‹</button><span></span><button aria-label="Next">›</button>`;
    const [prev, next] = el.querySelectorAll('button');
    const show = () => { el.querySelector('span').textContent = labels[Math.max(0, vals.indexOf(String(G.settings[key])))]; };
    const step = dir => {
      const i = (vals.indexOf(String(G.settings[key])) + dir + vals.length) % vals.length;
      setSetting(key, key === 'opponents' || key === 'difficulty' ? +vals[i] : vals[i]); show();
    };
    prev.addEventListener('click', () => step(-1)); next.addEventListener('click', () => step(1));
    show();
  });
  // settings screen: segmented buttons
  document.querySelectorAll('.seg[data-opt]').forEach((/** @type {HTMLElement} */ seg) => {
    const key = seg.dataset.opt;
    seg.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => { setSetting(key, btn.dataset.v); syncSegs(); }));
  });
  syncSegs();
}
function setSetting(key, v) {
  G.settings[key] = v; saveSettings();
  if (key === 'tod') { applyTod(String(v)); if (G.showcase) { for (const b of G.showcase.beams) b.visible = curTod.night; G.showcase.lights(curTod.night, false, true); } }
  if (key === 'quality') applyQuality();
  if (key === 'view') resize();
  if (key === 'sound') { ensureAudio(); setSound(v === 'on'); }
}
function syncSegs() {
  document.querySelectorAll('.seg[data-opt]').forEach((/** @type {HTMLElement} */ seg) => {
    const key = seg.dataset.opt;
    seg.querySelectorAll('button').forEach(btn => btn.setAttribute('aria-pressed', String(String(G.settings[key]) === btn.dataset.v)));
  });
}
/** Show the previous (-1) or next (1) car. */
export function stepCar(dir) {
  const i = CARS.findIndex(d => d.id === G.settings.car);
  selectCar(CARS[(i + dir + CARS.length) % CARS.length].id, dir);
}
/** Show a car in the showroom; `dir` slides it in from that side. */
export function selectCar(id, dir = 0) {
  G.settings.car = id; saveSettings(); const d = CAR_BY_ID[id];
  document.querySelectorAll('#carDots button').forEach((/** @type {HTMLElement} */ b) => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
  $('#cName').textContent = d.name; $('#cName').style.color = d.tag;
  $('#cDriver').textContent = `${d.driver} · ${d.gang}`;
  $('#cBlurb').textContent = d.blurb;
  $('#cStats').innerHTML = Object.entries(d.stats).map(([k, v]) => `<span>${k}</span><span class="bar">${[1, 2, 3, 4, 5].map(i => `<b class="${i <= v ? 'on' : ''}"></b>`).join('')}</span>`).join('');
  $('#cSpecial').textContent = 'Special: ' + d.special.name; $('#cSpecialDesc').textContent = d.special.desc;
  setShowcase(d); G.showIn = { t: 0, dir };
}
export function goGarage() {
  G.state = 'garage'; show('garage'); $('#hud').hidden = true;
  clearMatch(); applyTod(G.settings.tod);
  for (const pk of PICKUPS) pk.visible = false;
  selectCar(CAR_BY_ID[G.settings.car] ? G.settings.car : 'sundowner');
  CAM.orbit = 0.4; resize();
}
