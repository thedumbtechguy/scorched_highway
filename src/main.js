import { ensureAudio } from './audio/audio.js';
import { initPools } from './combat/pools.js';
import { applyTod } from './engine/sky.js';
import { camera, renderer, scene } from './engine/renderer.js';
import { buildCarModel, disposeCarModel } from './cars/model/build.js';
import { CARS } from './cars/roster.js';
import { damageCar } from './combat/damage.js';
import { $ } from './engine/util.js';
import { applyQuality, startLoop } from './game/loop.js';
import { pauseGame, resumeGame, startMatch, step } from './game/match.js';
import { buildGarage, goGarage, goTitle, selectCar, show } from './game/screens.js';
import { G } from './game/state.js';
import { setupTouch } from './input/input.js';
import { buildPickups } from './world/pickups.js';
import { buildProps } from './world/props.js';
import { buildStatic, buildTerrain } from './world/scenery.js';

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
  applyTod(G.settings.tod);
  buildTerrain(G.settings.quality === 'low'); buildStatic(); buildProps(); buildPickups(); initPools();
  setupTouch(); wireUI(); buildGarage();
  applyQuality();
  goTitle();
  const L = $('#loading'); L.style.opacity = '0'; setTimeout(() => L.remove(), 550);
  startLoop();
}
// handle for tests, tools and the browser console
window.SH = { G, CARS, step, startMatch, goGarage, selectCar, damageCar, buildCarModel, disposeCarModel, applyTod, applyQuality, camera, renderer, scene };

(function start() {
  let done = false; const go = () => { if (done) return; done = true; try { boot(); } catch (e) { console.error(e); $('#loading').lastChild.textContent = 'Something went wrong starting the game: ' + e.message; } };
  if (document.fonts && document.fonts.ready) { document.fonts.load("40px Shrikhand").catch(() => { }).then(() => document.fonts.ready).then(go, go); setTimeout(go, 2500); } else go();
})();
