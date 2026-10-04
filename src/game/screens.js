import { ensureAudio, setSound } from '../audio/audio.js';
import { buildCarModel, disposeCarModel } from '../cars/model/build.js';
import { CARS, CAR_BY_ID } from '../cars/roster.js';
import { camera, scene } from '../engine/renderer.js';
import { applyTod, curTod } from '../engine/sky.js';
import { $ } from '../engine/util.js';
import { CAM } from './camera.js';
import { applyQuality, resize } from './loop.js';
import { clearMatch } from './match.js';
import { G, saveSettings } from './state.js';
import { PICKUPS } from '../world/pickups.js';
import { ground } from '../world/terrain.js';

// ================= screens =================
export function show(id) { for (const s of ['title', 'garage', 'pause', 'over', 'help']) $('#' + s).hidden = s !== id; }
export function goTitle() {
  G.state = 'title'; show('title'); $('#hud').hidden = true; camera.clearViewOffset(); clearShowcase();
  for (const pk of PICKUPS) pk.group.visible = pk.active;
}
export const SHOW_POS = { x: -72, z: 3 };
export function clearShowcase() { if (G.showcase) { disposeCarModel(G.showcase); G.showcase = null; } }
function setShowcase(def) {
  clearShowcase();
  const m = buildCarModel(def); const y = ground(SHOW_POS.x, SHOW_POS.z);
  m.group.position.set(SHOW_POS.x, y, SHOW_POS.z); m.group.rotation.y = 0.6; scene.add(m.group); G.showcase = m;
  for (const b of m.beams) b.visible = curTod.night;
}
export function buildGarage() {
  const list = $('#carList'); list.innerHTML = '';
  for (const d of CARS) {
    const b = document.createElement('button'); b.className = 'carbtn'; b.dataset.id = d.id;
    b.innerHTML = `<i style="background:${d.tag}"></i>${d.name}`;
    b.addEventListener('click', () => selectCar(d.id)); list.appendChild(b);
  }
  document.querySelectorAll('.seg').forEach((/** @type {HTMLElement} */ seg) => {
    const key = seg.dataset.opt;
    seg.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => {
      const v = key === 'opponents' || key === 'difficulty' ? +btn.dataset.v : btn.dataset.v;
      G.settings[key] = v; saveSettings(); syncSegs();
      if (key === 'tod') { applyTod(v); if (G.showcase) { for (const b of G.showcase.beams) b.visible = curTod.night; G.showcase.lights(curTod.night, false, true); } }
      if (key === 'quality') applyQuality();
      if (key === 'sound') { ensureAudio(); setSound(v === 'on'); }
    }));
  });
  syncSegs();
}
function syncSegs() {
  document.querySelectorAll('.seg').forEach((/** @type {HTMLElement} */ seg) => {
    const key = seg.dataset.opt;
    seg.querySelectorAll('button').forEach(btn => btn.setAttribute('aria-pressed', String(String(G.settings[key]) === btn.dataset.v)));
  });
}
export function selectCar(id) {
  G.settings.car = id; saveSettings(); const d = CAR_BY_ID[id];
  document.querySelectorAll('.carbtn').forEach((/** @type {HTMLElement} */ b) => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
  $('#cName').textContent = d.name; $('#cName').style.color = d.tag;
  $('#cDriver').textContent = `Driven by ${d.driver} of the ${d.gang}`;
  $('#cBlurb').textContent = d.blurb;
  $('#cStats').innerHTML = Object.entries(d.stats).map(([k, v]) => `<span>${k}</span><span class="bar">${[1, 2, 3, 4, 5].map(i => `<b class="${i <= v ? 'on' : ''}"></b>`).join('')}</span>`).join('');
  $('#cSpecial').textContent = 'Special: ' + d.special.name; $('#cSpecialDesc').textContent = d.special.desc;
  setShowcase(d);
}
export function goGarage() {
  G.state = 'garage'; show('garage'); $('#hud').hidden = true;
  clearMatch(); applyTod(G.settings.tod);
  for (const pk of PICKUPS) pk.group.visible = false;
  selectCar(CAR_BY_ID[G.settings.car] ? G.settings.car : 'sundowner');
  CAM.orbit = 0.4; resize();
}
