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
export function show(id) { for (const s of ['title', 'garage', 'pause', 'over', 'help']) $('#' + s).hidden = s !== id; }
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
  m.group.position.set(SHOW_POS.x, y, SHOW_POS.z); m.group.rotation.y = yaw; addToScene(m.group, 'cars'); G.showcase = m;
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
      if (key === 'tod') { applyTod(String(v)); if (G.showcase) { for (const b of G.showcase.beams) b.visible = curTod.night; G.showcase.lights(curTod.night, false, true); } }
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
  for (const pk of PICKUPS) pk.visible = false;
  selectCar(CAR_BY_ID[G.settings.car] ? G.settings.car : 'sundowner');
  CAM.orbit = 0.4; resize();
}
