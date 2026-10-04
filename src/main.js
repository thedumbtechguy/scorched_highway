import { ensureAudio } from './audio/audio.js';
import { giveAmmo } from './combat/arsenal';
import { MINES, PROJ, SMOKES, initPools } from './combat/pools.js';
import { applyTod } from './engine/sky';
import { camera, renderer, scene } from './engine/renderer.js';
import { buildCarModel, disposeCarModel } from './cars/model/build.js';
import { CARS } from './cars/roster.js';
import { damageCar } from './combat/damage.js';
import { $ } from './engine/util.js';
import { applyQuality, startLoop, tick } from './game/loop.js';
import { pauseGame, resumeGame, startMatch, step } from './game/match.js';
import { buildGarage, goGarage, goTitle, selectCar, show } from './game/screens.js';
import { G } from './game/state.js';
import { setupTouch } from './input/input.js';
import { buildPickups } from './world/pickups';
import { buildProps } from './world/props.js';
import { buildStatic, buildTerrain, decorBlocked } from './world/scenery.js';
import { buildScatter, buildTumbleweeds } from './world/flora';
import { baseHeight } from './world/terrain.js';

// ================= boot =================
function wireUI() {
  $('#toGarage').addEventListener('click', () => { ensureAudio(); goGarage(); });
  $('#toHelp').addEventListener('click', () => { G.helpFrom = G.state; show('help'); });
  $('#helpClose').addEventListener('click', () => { if (G.helpFrom === 'paused') show('pause'); else if (G.helpFrom === 'title') show('title'); else show(null); });
  $('#gBack').addEventListener('click', goTitle);
  $('#startBtn').addEventListener('click', startMatch);
  $('#resumeBtn').addEventListener('click', resumeGame);
  $('#restartBtn').addEventListener('click', startMatch);
  $('#quitBtn').addEventListener('click', goGarage);
  $('#pHelpBtn').addEventListener('click', () => { G.helpFrom = 'paused'; show('help'); });
  $('#pauseBtn').addEventListener('click', pauseGame);
  $('#againBtn').addEventListener('click', startMatch);
  $('#oGarageBtn').addEventListener('click', goGarage);
  addEventListener('pointerdown', () => ensureAudio(), { once: true });
}
function boot() {
  const lowQ = G.settings.quality === 'low';
  // each step is timed into the performance timeline as boot:<name> (see tools/perf.js)
  const timed = (name, fn) => { const t = performance.now(); fn(); performance.measure('boot:' + name, { start: t }); };
  timed('sky', () => applyTod(G.settings.tod));
  timed('terrain', () => buildTerrain(lowQ));
  timed('town', () => buildStatic());
  timed('props', () => { buildProps(); buildPickups(); initPools(); });
  timed('scatter', () => { buildScatter({ lowQ, blocked: decorBlocked }); buildTumbleweeds(lowQ ? 4 : 8, baseHeight); });
  timed('ui', () => { setupTouch(); wireUI(); buildGarage(); applyQuality(); goTitle(); });
  timed('shaders', () => renderer.compile(scene, camera));
  const L = $('#loading'); L.style.opacity = '0'; setTimeout(() => L.remove(), 550);
  startLoop();
}
// handle for tests, tools and the browser console
window.SH = { combat: { PROJ, MINES, SMOKES, giveAmmo }, G, CARS, step, tick, startMatch, goGarage, selectCar, damageCar, buildCarModel, disposeCarModel, applyTod, applyQuality, camera, renderer, scene };

(function start() {
  let done = false; const go = () => { if (done) return; done = true; try { boot(); } catch (e) { console.error(e); $('#loading').lastChild.textContent = 'Something went wrong starting the game: ' + e.message; } };
  // signs and liveries are painted with the web fonts, so wait (at most 2.5 s) for the stylesheet, then the font
  const css = /** @type {HTMLLinkElement | null} */ (document.getElementById('fontcss'));
  const cssReady = new Promise(res => {
    if (!css) return res();
    const on = () => { css.media = 'all'; res(); }; // loaded as media=print so it can't block startup
    if (css.sheet) on(); else { css.addEventListener('load', on); css.addEventListener('error', () => res()); }
  });
  if (document.fonts && document.fonts.ready) { cssReady.then(() => document.fonts.load('40px Shrikhand')).catch(() => { }).then(() => document.fonts.ready).then(go, go); setTimeout(go, 2500); } else go();
})();
