import * as THREE from 'three';
import { FX_ADD, fxScale } from '../engine/particles.js';
import { scene } from '../engine/renderer.js';
import { TAU, pick, rand, srand } from '../engine/util.js';
import { ground } from './terrain.js';

// ================= pickups =================
export const PICK = {
  missile: { color: 0xe8433a, css: '#e8433a', amt: 8, label: 'Homing missiles' },
  mortar: { color: 0x2fb5b0, css: '#2fb5b0', amt: 6, label: 'Mortar' },
  mines: { color: 0xf4cf3a, css: '#f4cf3a', amt: 6, label: 'Mines' },
  flame: { color: 0xff7a1f, css: '#ff7a1f', amt: 8, label: 'Torch' },
  repair: { color: 0x5fd068, css: '#5fd068', amt: 55, label: 'Repair' },
  special: { color: 0x9b6bff, css: '#9b6bff', amt: 2, label: 'Special ammo' },
};
export const AMMO_CAP = { missile: 16, mortar: 12, mines: 12, flame: 16 };
export const WEAPON_ORDER = ['missile', 'mortar', 'mines', 'flame'];
export function drawGlyph(ctx, type, s, color) {
  ctx.save(); ctx.translate(s / 2, s / 2); const k = s / 100;
  ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = 9 * k; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const P = (pts) => { ctx.beginPath(); ctx.moveTo(pts[0] * k, pts[1] * k); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i] * k, pts[i + 1] * k); ctx.closePath(); ctx.fill(); };
  switch (type) {
    case 'missile':
      ctx.rotate(Math.PI / 4);
      ctx.beginPath(); ctx.moveTo(0, -40 * k); ctx.quadraticCurveTo(13 * k, -24 * k, 11 * k, 18 * k); ctx.lineTo(-11 * k, 18 * k); ctx.quadraticCurveTo(-13 * k, -24 * k, 0, -40 * k); ctx.fill();
      P([-11, 4, -24, 26, -11, 20]); P([11, 4, 24, 26, 11, 20]); ctx.globalAlpha = 0.7; P([-6, 22, 0, 40, 6, 22]); break;
    case 'mortar':
      ctx.beginPath(); ctx.arc(14 * k, 14 * k, 18 * k, 0, TAU); ctx.fill();
      ctx.setLineDash([8 * k, 9 * k]); ctx.lineWidth = 7 * k; ctx.beginPath(); ctx.moveTo(-38 * k, 34 * k); ctx.quadraticCurveTo(-30 * k, -40 * k, 2 * k, -6 * k); ctx.stroke(); break;
    case 'mines':
      ctx.beginPath(); ctx.arc(0, 0, 22 * k, 0, TAU); ctx.fill();
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 18 * k, Math.sin(a) * 18 * k); ctx.lineTo(Math.cos(a) * 36 * k, Math.sin(a) * 36 * k); ctx.stroke(); } break;
    case 'flame':
      ctx.beginPath(); ctx.moveTo(0, -40 * k); ctx.bezierCurveTo(30 * k, -10 * k, 32 * k, 20 * k, 0, 38 * k); ctx.bezierCurveTo(-32 * k, 20 * k, -26 * k, -8 * k, -8 * k, -16 * k); ctx.bezierCurveTo(-8 * k, -2 * k, 2 * k, -8 * k, 0, -40 * k); ctx.fill(); break;
    case 'repair':
      P([-10, -36, 10, -36, 10, -10, 36, -10, 36, 10, 10, 10, 10, 36, -10, 36, -10, 10, -36, 10, -36, -10, -10, -10]); break;
    case 'special': {
      ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * TAU - Math.PI / 2, r = (i % 2 ? 17 : 40) * k; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fill(); break;
    }
    case 'mg':
      for (const x of [-14, 14]) { ctx.beginPath(); ctx.moveTo(x * k, -34 * k); ctx.quadraticCurveTo((x + 10) * k, -22 * k, (x + 10) * k, -6 * k); ctx.lineTo((x + 10) * k, 32 * k); ctx.lineTo((x - 10) * k, 32 * k); ctx.lineTo((x - 10) * k, -6 * k); ctx.quadraticCurveTo((x - 10) * k, -22 * k, x * k, -34 * k); ctx.fill(); } break;
  }
  ctx.restore();
}
const PICK_ASSETS = {};
function pickAssets(type) {
  if (PICK_ASSETS[type]) return PICK_ASSETS[type];
  const d = PICK[type];
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d');
  x.fillStyle = 'rgba(42,24,56,0.9)'; x.beginPath(); x.arc(64, 64, 58, 0, TAU); x.fill();
  x.lineWidth = 8; x.strokeStyle = d.css; x.beginPath(); x.arc(64, 64, 54, 0, TAU); x.stroke();
  x.translate(22, 22); drawGlyph(x, type, 84, d.css);
  const tex = new THREE.CanvasTexture(cv);
  PICK_ASSETS[type] = {
    sprite: new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }),
    crate: new THREE.MeshLambertMaterial({ color: d.color, emissive: d.color, emissiveIntensity: 0.25 }),
    ring: new THREE.MeshBasicMaterial({ color: d.color, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  };
  return PICK_ASSETS[type];
}
const W_POOL = ['missile', 'missile', 'mortar', 'mines', 'flame', 'missile', 'mortar', 'special'];
export const PICKUPS = [];
/** @type {Array<[number, number, string[]]>} */
const PICK_SPOTS = [
  [0, 0, ['repair']], [-120, -20, ['repair']], [130, 60, ['repair']],
  [-38, 3, W_POOL], [36, -3, W_POOL], [4, 28, W_POOL], [-14, -32, W_POOL],
  [-80, -80, W_POOL], [-140, 40, W_POOL], [-60, 80, W_POOL], [10, 80, W_POOL], [80, 20, W_POOL], [120, -40, W_POOL],
  [40, -80, W_POOL], [-20, -122, W_POOL], [-100, 130, W_POOL], [90, -110, W_POOL], [150, -10, ['special', 'missile']], [-150, -40, ['special', 'mortar']],
];
const crateGeo = new THREE.BoxGeometry(1.5, 1.5, 1.5);
const ringGeo = new THREE.RingGeometry(1.9, 2.4, 28);
export function buildPickups() {
  for (const [x, z, pool] of PICK_SPOTS) {
    const group = new THREE.Group(); const y = ground(x, z); group.position.set(x, y, z);
    const crate = new THREE.Mesh(crateGeo, pickAssets(pool[0]).crate); crate.castShadow = true; crate.position.y = 1.4; group.add(crate);
    const spr = new THREE.Sprite(pickAssets(pool[0]).sprite); spr.scale.set(2.3, 2.3, 1); spr.position.y = 3.4; group.add(spr);
    const ring = new THREE.Mesh(ringGeo, pickAssets(pool[0]).ring); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.25; group.add(ring);
    scene.add(group);
    PICKUPS.push({ x, z, y, pool, type: pool[0], active: true, respawn: 0, group, crate, spr, ring, ph: srand() * TAU });
  }
}
function setPickupType(p, type) {
  p.type = type; const a = pickAssets(type);
  p.crate.material = a.crate; p.spr.material = a.sprite; p.ring.material = a.ring;
}
export function resetPickups() {
  for (const p of PICKUPS) { setPickupType(p, pick(p.pool)); p.active = true; p.group.visible = true; p.respawn = 0; }
}
export function updatePickups(dt, t) {
  for (const p of PICKUPS) {
    if (!p.active) {
      p.respawn -= dt;
      if (p.respawn <= 0) { setPickupType(p, pick(p.pool)); p.active = true; p.group.visible = true; for (let i = 0; i < 10 * fxScale; i++) FX_ADD.spawn(p.x, p.y + 1.4, p.z, rand(-4, 4), rand(2, 7), rand(-4, 4), 0.6, 0.8, 0.1, PICK[p.type].color, 0xffffff, 0.9, 1, 4); }
      continue;
    }
    p.crate.rotation.y = t * 1.6 + p.ph; p.crate.rotation.x = Math.sin(t * 1.3 + p.ph) * 0.25;
    p.crate.position.y = 1.4 + Math.sin(t * 2.4 + p.ph) * 0.25;
    p.spr.position.y = 3.4 + Math.sin(t * 2.4 + p.ph) * 0.25;
    const s = 1 + 0.12 * Math.sin(t * 4 + p.ph); p.ring.scale.set(s, s, s);
  }
}
export function nearestPickup(c, filter, maxD) {
  let best = null, bd = maxD * maxD;
  for (const p of PICKUPS) { if (!filter(p)) continue; const dx = p.x - c.x, dz = p.z - c.z, d2 = dx * dx + dz * dz; if (d2 < bd) { bd = d2; best = p; } }
  return best;
}
