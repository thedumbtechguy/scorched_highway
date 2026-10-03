import { playSfx } from '../audio/audio.js';
import { COMBOS, findTarget } from '../combat/weapons.js';
import { camera } from '../engine/renderer.js';
import { $, TAU, _v1 } from '../engine/util.js';
import { G } from './state.js';
import { PICK, PICKUPS, drawGlyph } from '../world/pickups.js';
import { BOXES } from '../world/scenery.js';
import { ARENA_R } from '../world/terrain.js';

// ================= HUD helpers =================
export const hud = {
  big: $('#big'), feed: $('#feed'), vign: $('#vign'), hpFill: $('#hpFill'), hpBar: $('#hpBar'), hHp: $('#hHp'), hName: $('#hName'),
  wName: $('#wName'), wAmmo: $('#wAmmo'), wIcon: $('#wIcon'), sPips: $('#sPips'), combo: $('#comboHint'), alive: $('#alive'), clock: $('#clock'),
  spd: $('#spd'), radar: $('#radar'), lock: $('#lock'), tags: $('#tags'), reset: $('#bReset'), cache: {},
};
let bigTimer = 0;
export function bigText(txt, dur, small) {
  hud.big.textContent = txt; hud.big.classList.toggle('small', !!small); hud.big.classList.add('show');
  bigTimer = dur || 1;
}
export function feed(msg, mine) {
  const d = document.createElement('div'); d.textContent = msg; if (mine) d.className = 'me';
  hud.feed.appendChild(d); while (hud.feed.children.length > 4) hud.feed.removeChild(hud.feed.firstChild);
  setTimeout(() => { if (d.parentNode) d.parentNode.removeChild(d); }, 4200);
}
let vignT = 0;
export function hudHit(amt) { vignT = Math.min(1, vignT + 0.25 + amt * 0.03); if (amt > 3) playSfx('hurt', null, null, 0.8); }
function setIf(key, el, prop, val) { if (hud.cache[key] !== val) { hud.cache[key] = val; el[prop] = val; } }
function drawWeaponIcon(type) {
  const x = hud.wIcon.getContext('2d'); x.clearRect(0, 0, 80, 80);
  x.fillStyle = 'rgba(246,234,212,0.08)'; x.beginPath(); x.arc(40, 40, 38, 0, TAU); x.fill();
  x.save(); x.translate(8, 8); drawGlyph(x, type || 'mg', 64, type ? PICK[type].css : '#f6ead4'); x.restore();
}
export function updateHUD(dt) {
  const p = G.player; if (!p) return;
  const hpF = Math.max(0, p.hp / p.def.hp);
  hud.hpFill.style.transform = `scaleX(${hpF.toFixed(3)})`;
  setIf('hp', hud.hHp, 'textContent', Math.ceil(Math.max(0, p.hp)) + '');
  const low = hpF < 0.3; if (hud.cache.low !== low) { hud.cache.low = low; hud.hpBar.classList.toggle('low', low); }
  const w = p.weapon;
  if (hud.cache.w !== w) { hud.cache.w = w; drawWeaponIcon(w); hud.wName.textContent = w ? PICK[w].label : 'Machine gun only'; hud.combo.innerHTML = w ? `↑↑ + fire: ${COMBOS[w][0]}<br>↓↓ + fire: ${COMBOS[w][1]}` : 'Grab a crate for heavy weapons'; }
  setIf('ammo', hud.wAmmo, 'textContent', w ? (w === 'flame' ? p.ammo.flame.toFixed(1) + 's' : Math.floor(p.ammo[w]) + '') : '∞');
  if (hud.cache.sp !== p.special) { hud.cache.sp = p.special; let s = ''; for (let i = 0; i < 6; i++) s += `<i class="${i < p.special ? 'on' : ''}"></i>`; hud.sPips.innerHTML = s; }
  const alive = G.cars.filter(c => c.alive).length;
  setIf('alive', hud.alive, 'textContent', alive + ' cars left');
  const secs = Math.max(0, G.clock | 0); setIf('clock', hud.clock, 'textContent', (secs / 60 | 0) + ':' + String(secs % 60).padStart(2, '0'));
  setIf('spd', hud.spd, 'textContent', Math.round(p.speed * 2.1) + '');
  vignT = Math.max(0, vignT - dt * 1.6);
  hud.vign.style.opacity = Math.max(vignT, low ? 0.25 + 0.15 * Math.sin(performance.now() / 150) : 0).toFixed(2);
  if (bigTimer > 0) { bigTimer -= dt; if (bigTimer <= 0) hud.big.classList.remove('show'); }
  // stuck detection for flip button
  if (p.alive && ((Math.abs(p.input.throttle) > 0.5 && p.speed < 1.5) || p.airT > 4)) p.stuckT += dt; else p.stuckT = 0;
  const showReset = p.stuckT > 2;
  if (hud.cache.reset !== showReset) { hud.cache.reset = showReset; hud.reset.hidden = !showReset; }
  drawRadar();
  updateTags();
}
function drawRadar() {
  const cv = hud.radar, x = cv.getContext('2d'), S = cv.width, R = S / 2, p = G.player, range = 130;
  x.clearRect(0, 0, S, S);
  x.fillStyle = 'rgba(30,17,42,0.7)'; x.beginPath(); x.arc(R, R, R - 3, 0, TAU); x.fill();
  x.strokeStyle = 'rgba(246,234,212,0.35)'; x.lineWidth = 3; x.stroke();
  x.strokeStyle = 'rgba(246,234,212,0.12)'; x.lineWidth = 2; x.beginPath(); x.arc(R, R, R * 0.5, 0, TAU); x.stroke();
  const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
  /** @type {(wx: number, wz: number) => [number, number, boolean]} */
  const toR = (wx, wz) => { const dx = wx - p.x, dz = wz - p.z; const lx = dx * cy - dz * sy, lz = dx * sy + dz * cy; return [R - lx / range * (R - 8), R - lz / range * (R - 8), Math.hypot(lx, lz) < range]; };
  // arena edge
  const [ax, ay] = toR(0, 0); x.strokeStyle = 'rgba(232,102,42,0.5)'; x.lineWidth = 2; x.save(); x.beginPath(); x.arc(R, R, R - 4, 0, TAU); x.clip();
  x.beginPath(); x.arc(ax, ay, ARENA_R / range * (R - 8), 0, TAU); x.stroke();
  x.fillStyle = 'rgba(246,234,212,0.18)'; for (const b of BOXES) { const [bx, by, ok] = toR((b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2); if (ok) x.fillRect(bx - 3, by - 3, 6, 6); }
  for (const pk of PICKUPS) { if (!pk.active) continue; const [px, py, ok] = toR(pk.x, pk.z); if (!ok) continue; x.fillStyle = PICK[pk.type].css; x.fillRect(px - 3.5, py - 3.5, 7, 7); }
  for (const c of G.cars) {
    if (c === p) continue; const [cx, cyy, ok] = toR(c.x, c.z);
    const px = ok ? cx : R + (cx - R) * (R - 10) / Math.hypot(cx - R, cyy - R), py = ok ? cyy : R + (cyy - R) * (R - 10) / Math.hypot(cx - R, cyy - R);
    x.fillStyle = c.alive ? c.def.tag : 'rgba(120,110,110,0.7)';
    x.beginPath(); x.arc(px, py, c.alive ? 6.5 : 4, 0, TAU); x.fill();
  }
  x.restore();
  x.fillStyle = '#f6ead4'; x.beginPath(); x.moveTo(R, R - 10); x.lineTo(R + 7, R + 7); x.lineTo(R, R + 3); x.lineTo(R - 7, R + 7); x.closePath(); x.fill();
}
export const TAGS = [];
export function buildTags() {
  hud.tags.innerHTML = ''; TAGS.length = 0;
  for (const c of G.cars) {
    if (c.isPlayer) continue;
    const el = document.createElement('div'); el.className = 'tag'; el.style.color = c.def.tag;
    el.innerHTML = `<span>${c.def.driver}</span><b><i></i></b>`; hud.tags.appendChild(el);
    TAGS.push({ c, el, bar: el.querySelector('i'), vis: null });
  }
}
function updateTags() {
  const W = innerWidth, H = innerHeight, p = G.player;
  for (const t of TAGS) {
    const c = t.c; let show = c.alive;
    if (show) {
      _v1.set(c.x, c.y + 3.6, c.z).project(camera);
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      show = _v1.z < 1 && d < 100 && Math.abs(_v1.x) < 1.1 && Math.abs(_v1.y) < 1.1;
      if (show) {
        const sx = (_v1.x * 0.5 + 0.5) * W, sy = (-_v1.y * 0.5 + 0.5) * H;
        t.el.style.transform = `translate(${sx.toFixed(1)}px,${(sy - 20).toFixed(1)}px)`;
        t.el.style.opacity = d < 70 ? 1 : (1 - (d - 70) / 30).toFixed(2);
        t.bar.style.transform = `scaleX(${Math.max(0, c.hp / c.def.hp).toFixed(3)})`;
      }
    }
    if (t.vis !== show) { t.vis = show; t.el.style.display = show ? '' : 'none'; }
  }
  // lock-on
  let lt = null;
  if (p.alive && (p.weapon === 'missile' || p.weapon === 'mortar' || p.def.id === 'bigchill')) lt = findTarget(p, p.weapon === 'mortar' ? 95 : 120, p.weapon === 'mortar' ? 0.45 : 0.55);
  if (lt) {
    _v1.set(lt.x, lt.y + 1.2, lt.z).project(camera);
    if (_v1.z < 1) { hud.lock.style.transform = `translate(${((_v1.x * 0.5 + 0.5) * W).toFixed(1)}px,${((-_v1.y * 0.5 + 0.5) * H).toFixed(1)}px)`; hud.lock.classList.add('on'); } else lt = null;
  }
  if (!lt) hud.lock.classList.remove('on');
}
