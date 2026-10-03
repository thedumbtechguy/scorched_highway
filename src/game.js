'use strict';
// ================= game state =================
const G = {
  state: 'loading', cars: [], ais: [], player: null, time: 0, clock: 0, countdown: 0, slowT: 0, timeScale: 1,
  shake: 0, endT: -1, result: null, delayed: [], showcase: null, playerDef: null, menuT: 0,
  settings: Object.assign({ opponents: 4, difficulty: 1, tod: 'sunset', quality: isTouch ? 'low' : 'high', sound: 'on', car: 'sundowner' }, loadStore('settings', {})),
};
function saveSettings() { store('settings', G.settings); }
function later(t, fn) { G.delayed.push({ t, fn }); }
function shake(x, z, amt) {
  const p = G.player && G.state === 'playing' ? G.player : null;
  const d = p ? Math.hypot(p.x - x, p.z - z) : Math.hypot(camera.position.x - x, camera.position.z - z);
  G.shake = Math.min(1.4, G.shake + amt / (1 + d / 18));
}
function pickTerrainMat() { if (terrainMesh) terrainMesh.material = (G.settings.quality === 'high' || curTod.night) ? terrainMesh.userData.phong : MAT_VC; }
function onTodChanged(t) {
  headSpot.intensity = t.night ? 2.4 : 0; pickTerrainMat();
  for (const s of SIGN_MESHES) if (s.material.emissive) s.material.emissive.setHex(t.night ? 0x3a2a20 : 0);
}

// ================= HUD helpers =================
const hud = {
  big: $('#big'), feed: $('#feed'), vign: $('#vign'), hpFill: $('#hpFill'), hpBar: $('#hpBar'), hHp: $('#hHp'), hName: $('#hName'),
  wName: $('#wName'), wAmmo: $('#wAmmo'), wIcon: $('#wIcon'), sPips: $('#sPips'), combo: $('#comboHint'), alive: $('#alive'), clock: $('#clock'),
  spd: $('#spd'), radar: $('#radar'), lock: $('#lock'), tags: $('#tags'), reset: $('#bReset'), cache: {},
};
let bigTimer = 0;
function bigText(txt, dur, small) {
  hud.big.textContent = txt; hud.big.classList.toggle('small', !!small); hud.big.classList.add('show');
  bigTimer = dur || 1;
}
function feed(msg, mine) {
  const d = document.createElement('div'); d.textContent = msg; if (mine) d.className = 'me';
  hud.feed.appendChild(d); while (hud.feed.children.length > 4) hud.feed.removeChild(hud.feed.firstChild);
  setTimeout(() => { if (d.parentNode) d.parentNode.removeChild(d); }, 4200);
}
let vignT = 0;
function hudHit(amt) { vignT = Math.min(1, vignT + 0.25 + amt * 0.03); if (amt > 3) playSfx('hurt', null, null, 0.8); }
function setIf(key, el, prop, val) { if (hud.cache[key] !== val) { hud.cache[key] = val; el[prop] = val; } }
function drawWeaponIcon(type) {
  const x = hud.wIcon.getContext('2d'); x.clearRect(0, 0, 80, 80);
  x.fillStyle = 'rgba(246,234,212,0.08)'; x.beginPath(); x.arc(40, 40, 38, 0, TAU); x.fill();
  x.save(); x.translate(8, 8); drawGlyph(x, type || 'mg', 64, type ? PICK[type].css : '#f6ead4'); x.restore();
}
function updateHUD(dt) {
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
const TAGS = [];
function buildTags() {
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

// ================= camera =================
const CAM = { x: 0, y: 30, z: -60, yaw: 0, fov: 62, orbit: 0 };
function baseFov() { return camera.aspect < 1 ? 80 : 62; }
function chaseCam(dt, c) {
  const sp = c.speed;
  CAM.yaw += angDiff(CAM.yaw, c.yaw) * (1 - Math.exp(-(c.grounded ? 4.2 : 1.6) * dt));
  const back = 8.8 + sp * 0.07, up = 3.5 + sp * 0.03;
  const fx = Math.sin(CAM.yaw), fz = Math.cos(CAM.yaw);
  let tx = c.x - fx * back, tz = c.z - fz * back, ty = c.y + up;
  // pull in if a building is between
  for (let k = 0; k < 6; k++) { if (!pointBlocked(tx, ty - 0.5, tz)) break; tx = lerp(tx, c.x, 0.3); tz = lerp(tz, c.z, 0.3); ty += 0.6; }
  ty = Math.max(ty, ground(tx, tz) + 1.4);
  const k = 1 - Math.exp(-9 * dt);
  CAM.x = lerp(CAM.x, tx, k); CAM.z = lerp(CAM.z, tz, k); CAM.y = lerp(CAM.y, ty, 1 - Math.exp(-6 * dt));
  const s = G.shake * 0.8;
  camera.position.set(CAM.x + rand(-s, s), CAM.y + rand(-s, s), CAM.z + rand(-s, s));
  camera.lookAt(c.x + fx * 6, c.y + 1.7, c.z + fz * 6);
  const tf = baseFov() + clamp(sp / 45, 0, 1.3) * 10 + (c.boost > 0 ? 7 : 0);
  if (Math.abs(camera.fov - tf) > 0.05) { camera.fov = lerp(camera.fov, tf, 1 - Math.exp(-4 * dt)); camera.updateProjectionMatrix(); }
}
function orbitCam(dt, cx, cy, cz, radius, height, speed, lookY) {
  CAM.orbit += dt * speed;
  camera.position.set(cx + Math.sin(CAM.orbit) * radius, cy + height, cz + Math.cos(CAM.orbit) * radius);
  camera.lookAt(cx, cy + (lookY == null ? 1 : lookY), cz);
  if (Math.abs(camera.fov - baseFov()) > 0.05) { camera.fov = baseFov(); camera.updateProjectionMatrix(); }
}

// ================= screens =================
function show(id) { for (const s of ['title', 'garage', 'pause', 'over', 'help']) $('#' + s).hidden = s !== id; }
function goTitle() {
  G.state = 'title'; show('title'); $('#hud').hidden = true; camera.clearViewOffset(); clearShowcase();
  for (const pk of PICKUPS) pk.group.visible = pk.active;
}
const SHOW_POS = { x: -72, z: 3 };
function clearShowcase() { if (G.showcase) { disposeCarModel(G.showcase); G.showcase = null; } }
function setShowcase(def) {
  clearShowcase();
  const m = buildCarModel(def); const y = ground(SHOW_POS.x, SHOW_POS.z);
  m.group.position.set(SHOW_POS.x, y, SHOW_POS.z); m.group.rotation.y = 0.6; scene.add(m.group); G.showcase = m;
  for (const b of m.beams) b.visible = curTod.night;
}
function buildGarage() {
  const list = $('#carList'); list.innerHTML = '';
  for (const d of CARS) {
    const b = document.createElement('button'); b.className = 'carbtn'; b.dataset.id = d.id;
    b.innerHTML = `<i style="background:${d.tag}"></i>${d.name}`;
    b.addEventListener('click', () => selectCar(d.id)); list.appendChild(b);
  }
  document.querySelectorAll('.seg').forEach(seg => {
    const key = seg.dataset.opt;
    seg.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => {
      let v = btn.dataset.v; if (key === 'opponents' || key === 'difficulty') v = +v;
      G.settings[key] = v; saveSettings(); syncSegs();
      if (key === 'tod') { applyTod(v); if (G.showcase) { for (const b of G.showcase.beams) b.visible = curTod.night; G.showcase.lights(curTod.night, false, true); } }
      if (key === 'quality') applyQuality();
      if (key === 'sound') { ensureAudio(); setSound(v === 'on'); }
    }));
  });
  syncSegs();
}
function syncSegs() {
  document.querySelectorAll('.seg').forEach(seg => {
    const key = seg.dataset.opt;
    seg.querySelectorAll('button').forEach(btn => btn.setAttribute('aria-pressed', String(String(G.settings[key]) === btn.dataset.v)));
  });
}
function selectCar(id) {
  G.settings.car = id; saveSettings(); const d = CAR_BY_ID[id];
  document.querySelectorAll('.carbtn').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
  $('#cName').textContent = d.name; $('#cName').style.color = d.tag;
  $('#cDriver').textContent = `Driven by ${d.driver} of the ${d.gang}`;
  $('#cBlurb').textContent = d.blurb;
  $('#cStats').innerHTML = Object.entries(d.stats).map(([k, v]) => `<span>${k}</span><span class="bar">${[1, 2, 3, 4, 5].map(i => `<b class="${i <= v ? 'on' : ''}"></b>`).join('')}</span>`).join('');
  $('#cSpecial').textContent = 'Special: ' + d.special.name; $('#cSpecialDesc').textContent = d.special.desc;
  setShowcase(d);
}
function goGarage() {
  G.state = 'garage'; show('garage'); $('#hud').hidden = true;
  clearMatch(); applyTod(G.settings.tod);
  for (const pk of PICKUPS) pk.group.visible = false;
  selectCar(CAR_BY_ID[G.settings.car] ? G.settings.car : 'sundowner');
  CAM.orbit = 0.4; resize();
}

// ================= match =================
const SPAWNS = [[0, 118], [102, 59], [102, -59], [0, -118], [-92, -38], [-102, 59]];
function clearMatch() {
  for (const c of G.cars) disposeCarModel(c.model);
  G.cars = []; G.ais = []; G.player = null; G.delayed = [];
  clearWeapons(); clearDebris(); for (const s of PSYS) s.clear();
  resetProps(); resetPickups();
  hud.tags.innerHTML = ''; TAGS.length = 0; hud.feed.innerHTML = '';
}
function startMatch() {
  ensureAudio();
  clearShowcase(); clearMatch(); camera.clearViewOffset();
  applyTod(G.settings.tod);
  const pdef = CAR_BY_ID[G.settings.car] || CARS[0];
  const others = CARS.filter(d => d !== pdef).sort(() => Math.random() - 0.5).slice(0, G.settings.opponents);
  const spots = SPAWNS.slice().sort(() => Math.random() - 0.5);
  const diff = DIFF[G.settings.difficulty];
  [pdef, ...others].forEach((d, i) => {
    const c = new Car(d, i === 0); const [x, z] = spots[i];
    c.reset(x, z, Math.atan2(-x, -z)); c.speedK = i === 0 ? 1 : diff.speed;
    if (i === 0) { c.ammo.missile = 4; c.weapon = 'missile'; }
    else { c.ammo.missile = 2; c.weapon = 'missile'; }
    G.cars.push(c); if (i > 0) G.ais.push(new AI(c)); else G.player = c;
  });
  G.time = 0; G.clock = 0; G.countdown = 3.2; G.endT = -1; G.result = null; G.slowT = 0; G.timeScale = 1; G.shake = 0;
  const p = G.player; CAM.yaw = p.yaw; CAM.x = p.x - Math.sin(p.yaw) * 30; CAM.z = p.z - Math.cos(p.yaw) * 30; CAM.y = p.y + 14;
  hud.cache = {}; hud.hName.textContent = pdef.name; hud.hName.style.color = pdef.tag;
  buildTags(); show(null); $('#hud').hidden = false; G.state = 'playing'; lastCount = 4;
  resize();
}
let lastCount = 4;
function onCarKilled(c, by) {
  if (by && by.isPlayer) { G.slowT = 0.55; bigText('Wrecked ' + c.def.driver.split(' ')[0] + '!', 1.1, true); }
  if (c.isPlayer) { G.slowT = 0.8; bigText('Wrecked!', 2); G.endT = 3.2; G.result = { win: false, by }; }
  const alive = G.cars.filter(o => o.alive);
  if (G.player.alive && alive.length === 1) { G.slowT = 1.2; G.endT = 3; G.result = { win: true }; later(0.4, () => bigText('Last one standing!', 2.5)); }
}
function endMatch() {
  G.state = 'over'; const p = G.player, r = G.result || { win: p.alive };
  const place = p.alive ? 1 : p.place;
  $('#overTitle').textContent = r.win ? 'Last one standing' : 'Wrecked';
  $('#overSub').textContent = r.win ? `${p.def.driver} rolls out of town with the ${p.def.name} still smoking.` : (r.by ? `${r.by.def.driver} got the better of you this time.` : 'The desert got the better of you this time.');
  $('#rPlace').textContent = place + (['th', 'st', 'nd', 'rd'][place] || 'th');
  $('#rKills').textContent = p.kills; $('#rDmg').textContent = Math.round(p.dealt);
  const s = G.clock | 0; $('#rTime').textContent = (s / 60 | 0) + ':' + String(s % 60).padStart(2, '0');
  show('over'); $('#hud').hidden = true;
  const best = loadStore('best', { wins: 0, kills: 0 }); if (r.win) best.wins++; best.kills += p.kills; store('best', best);
}
function pauseGame() { if (G.state !== 'playing') return; G.state = 'paused'; show('pause'); for (const k in KEYS) KEYS[k] = false; }
function resumeGame() { if (G.state !== 'paused') return; G.state = 'playing'; show(null); }

// ================= step =================
function step(dt, rdt) {
  const p = G.player;
  // delayed events
  for (let i = G.delayed.length - 1; i >= 0; i--) { const d = G.delayed[i]; d.t -= dt; if (d.t <= 0) { G.delayed.splice(i, 1); d.fn(); } }
  if (G.countdown > 0) {
    G.countdown -= rdt;
    const n = Math.ceil(G.countdown - 0.2);
    if (n !== lastCount) { lastCount = n; if (n > 0) { bigText(String(n), 0.8); playSfx('beep'); } else { bigText('Go!', 0.8); playSfx('go'); } }
  } else G.clock += dt;
  G.time += dt;
  if (p.alive && G.state === 'playing') readPlayerInput(p); else { p.mgHeld = p.wHeld = false; p.input.throttle = 0; p.input.steer = 0; }
  if (G.countdown > 0) { for (const c of G.cars) { c.input.throttle = 0; c.input.steer = 0; c.input.handbrake = true; } if (p.alive) { p.wFire = false; p.sFire = false; } }
  for (const ai of G.ais) ai.update(dt);
  if (G.countdown > 0) for (const c of G.cars) { c.input.throttle = 0; c.input.handbrake = true; c.wFire = false; c.sFire = false; }
  for (const c of G.cars) c.update(dt);
  collideCars(G.cars);
  for (const c of G.cars) tickCarWeapons(c, dt);
  updateProjectiles(dt); updateMines(dt, G.time); updateRings(dt); updateProps(dt);
  updatePickups(dt, G.time);
  // collect
  for (const c of G.cars) {
    if (!c.alive) continue;
    for (const pk of PICKUPS) {
      if (!pk.active) continue; const dx = c.x - pk.x, dz = c.z - pk.z;
      if (dx * dx + dz * dz < 12 && Math.abs(c.y - pk.y) < 3.5) applyPickup(c, pk);
    }
  }
  if (G.endT > 0) { G.endT -= rdt; if (G.endT <= 0) endMatch(); }
}
function applyPickup(c, p) {
  const t = p.type;
  if (t === 'repair') { if (c.hp >= c.def.hp - 0.5) return; c.hp = Math.min(c.def.hp, c.hp + PICK.repair.amt); c.burning = 0; }
  else if (t === 'special') { if (c.special >= 6) return; c.special = Math.min(6, c.special + 2); }
  else { if (c.ammo[t] >= AMMO_CAP[t]) return; c.ammo[t] = Math.min(AMMO_CAP[t], c.ammo[t] + PICK[t].amt); if (!c.weapon || c.ammo[c.weapon] <= 0.01) c.weapon = t; }
  p.active = false; p.group.visible = false; p.respawn = t === 'repair' ? 22 : 14;
  for (let i = 0; i < 16 * fxScale; i++) FX_ADD.spawn(p.x, p.y + 1.4, p.z, rand(-6, 6), rand(2, 9), rand(-6, 6), 0.5, 1, 0.1, PICK[t].color, 0xffffff, 0.9, 1.5, 6);
  if (c.isPlayer) { playSfx(t === 'repair' ? 'repair' : 'pickup'); feed(t === 'repair' ? 'Repaired' : '+' + PICK[t].amt + (t === 'flame' ? 's' : '') + ' ' + PICK[t].label, true); if (t !== 'repair' && t !== 'special' && c.weapon !== t && !c.weapon) c.weapon = t; }
}

// ================= render loop =================
const _bs = new THREE.Vector2();
let lastT = performance.now(), fpsAcc = 0, fpsN = 0, autoLowered = false;
function frame(now) {
  requestAnimationFrame(frame);
  const rdt = Math.min(0.05, Math.max(0.001, (now - lastT) / 1000)); lastT = now;
  pollGamepad();
  let dt = rdt;
  if (G.state === 'playing') {
    G.slowT -= rdt; const ts = G.slowT > 0 ? 0.3 : 1; G.timeScale = lerp(G.timeScale, ts, 1 - Math.exp(-8 * rdt)); dt = rdt * G.timeScale;
    step(dt, rdt);
    const p = G.player;
    if (p.alive || G.endT > 1.5) chaseCam(rdt, p);
    else orbitCam(rdt, p.x, p.y, p.z, 14, 6, 0.4, 1);
    // player headlight
    if (curTod.night) {
      p.worldPoint(0, 1.2, p.def.front, _v1); headSpot.position.copy(_v1); p.worldPoint(0, -1.5, p.def.front + 20, _v2); headSpot.target.position.copy(_v2);
      headSpot.intensity = p.alive ? 2.4 : 0;
    }
    updateHUD(rdt);
    // auto quality drop if very slow
    fpsAcc += rdt; fpsN++;
    if (fpsAcc > 4) { const fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; if (fps < 26 && !autoLowered && G.settings.quality === 'high') { autoLowered = true; G.settings.quality = 'low'; applyQuality(); feed('Switched to fast graphics'); } }
  } else if (G.state === 'title') {
    G.menuT += rdt; orbitCam(rdt, 0, 0, 0, 78, 28, 0.06, 4); updatePickups(rdt, G.menuT);
  } else if (G.state === 'garage') {
    G.menuT += rdt; orbitCam(rdt, SHOW_POS.x, ground(SHOW_POS.x, SHOW_POS.z), SHOW_POS.z, 10, 3.4, 0.25, 0.9); updatePickups(rdt, G.menuT);
    if (G.showcase) { if (G.showcase.siren) { const on = (now / 180 | 0) % 2 === 0; G.showcase.siren[0].visible = on; G.showcase.siren[1].visible = !on; } }
  } else if (G.state === 'over') {
    const p = G.player; if (p) orbitCam(rdt, p.x, p.y, p.z, 12, 5, 0.25, 1);
    step(rdt * 0.5, rdt); // world keeps moving gently behind the results
  }
  if (G.state !== 'paused') {
    for (const s of PSYS) s.update(G.state === 'playing' ? dt : rdt);
    updateDebris(G.state === 'playing' ? dt : rdt); updateLights(rdt);
  }
  G.shake = Math.max(0, G.shake - rdt * 2.2);
  updateAudio(rdt);
  // sky & sun follow camera
  sky.position.copy(camera.position);
  sunSprite.position.copy(camera.position).addScaledVector(sunDir, 1400);
  stars.position.copy(camera.position);
  // shadow camera follows focus
  const f = G.player && G.state !== 'garage' && G.state !== 'title' ? G.player : (G.state === 'garage' ? { x: SHOW_POS.x, y: 0, z: SHOW_POS.z } : { x: 0, y: 0, z: 0 });
  sun.target.position.set(f.x, f.y || 0, f.z); sun.position.set(f.x + sunDir.x * 200, (f.y || 0) + Math.max(0.25, sunDir.y) * 200, f.z + sunDir.z * 200);
  const bs = renderer.getDrawingBufferSize(_bs);
  const scale = bs.y / (2 * Math.tan(camera.fov * Math.PI / 360));
  for (const s of PSYS) s.setUniforms(scale);
  renderer.render(scene, camera);
}

// ================= quality & resize =================
function applyQuality() {
  const hi = G.settings.quality === 'high';
  const dpr = window.devicePixelRatio || 1;
  renderer.setPixelRatio(Math.min(dpr, hi ? (isTouch ? 1.75 : 2) : (isTouch ? 1.3 : 1)));
  renderer.shadowMap.enabled = hi; sun.castShadow = hi;
  scene.traverse(o => { if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.needsUpdate = true); } });
  fxScale = hi ? 1 : 0.55;
  pickTerrainMat();
  resize();
}
function resize() {
  const W = innerWidth, H = innerHeight;
  renderer.setSize(W, H, false); camera.aspect = W / H;
  if (G.state === 'garage') {
    const portrait = W < H && W <= 700;
    const panel = document.querySelector('.gpanel'); const pw = panel ? panel.getBoundingClientRect() : { width: 0, height: 0 };
    if (portrait) camera.setViewOffset(W, H, 0, pw.height * 0.5, W, H); else camera.setViewOffset(W, H, -pw.width * 0.5, 0, W, H);
  } else camera.clearViewOffset();
  camera.fov = baseFov(); camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'playing') pauseGame(); });

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
  requestAnimationFrame(t => { lastT = t; frame(t); });
}
(function start() {
  let done = false; const go = () => { if (done) return; done = true; try { boot(); } catch (e) { console.error(e); $('#loading').lastChild.textContent = 'Something went wrong starting the game: ' + e.message; } };
  if (document.fonts && document.fonts.ready) { document.fonts.load("40px Shrikhand").catch(() => { }).then(() => document.fonts.ready).then(go, go); setTimeout(go, 2500); } else go();
})();
