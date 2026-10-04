import * as THREE from 'three';
import { playSfx } from '../audio/audio.js';
import { damageCar } from '../combat/damage.js';
import { explode } from '../combat/effects.js';
import { spawnDebris } from '../engine/debris.js';
import { MAT_VC, PB, signTexture } from '../engine/geometry.js';
import { FX_SMOKE, fxScale } from '../engine/particles.js';
import { scene } from '../engine/renderer.js';
import { TAU, _q1, mulberry32, rand, srand } from '../engine/util.js';
import { G, shake } from '../game/state.js';
import { clearSpot } from './scenery.js';
import { ground } from './terrain.js';

// ================= destructible props =================
export const PROPS = [];
function makeProp(kind, x, z, opts) {
  const y = ground(x, z);
  const group = new THREE.Group(); group.position.set(x, y, z);
  const pb = new PB();
  let r = 0.8, h = 3, hp = 10, solid = true, breakOnRam = 0, explosive = null, topple = false, debrisCol = 0x557a3a;
  switch (kind) {
    case 'cactus': {
      const g = 0x4f7a3a, g2 = 0x5f8c46, s = opts && opts.s || 1;
      pb.cyl(0.42 * s, 0.5 * s, 5 * s, 7, g, 0, 2.5 * s, 0); pb.sph(0.42 * s, g2, 0, 5 * s, 0, 1, 0.7, 1);
      pb.cyl(0.28 * s, 0.28 * s, 1.4 * s, 6, g, 0.8 * s, 2.4 * s, 0, 0, 0, Math.PI / 2); pb.cyl(0.28 * s, 0.3 * s, 1.8 * s, 6, g, 1.45 * s, 3.2 * s, 0); pb.sph(0.28 * s, g2, 1.45 * s, 4.1 * s, 0);
      if (srand() < 0.7) { pb.cyl(0.26 * s, 0.26 * s, 1.1 * s, 6, g, -0.65 * s, 3.1 * s, 0, 0, 0, Math.PI / 2); pb.cyl(0.26 * s, 0.28 * s, 1.3 * s, 6, g, -1.15 * s, 3.7 * s, 0); pb.sph(0.26 * s, g2, -1.15 * s, 4.35 * s, 0); }
      group.rotation.y = srand() * TAU; r = 0.7; h = 5 * s; hp = 8; breakOnRam = 3; debrisCol = 0x4f7a3a; break;
    }
    case 'barrel': {
      pb.cyl(0.55, 0.55, 1.3, 10, 0xc0392b, 0, 0.65, 0); pb.cyl(0.57, 0.57, 0.14, 10, 0xf6ead4, 0, 0.9, 0); pb.cyl(0.57, 0.57, 0.1, 10, 0x6a1e17, 0, 0.3, 0);
      r = 0.65; h = 1.4; hp = 6; breakOnRam = 4; explosive = { r: 8, dmg: 26 }; debrisCol = 0xc0392b; break;
    }
    case 'pump': {
      pb.box(1.1, 2.2, 0.8, 0xc0392b, 0, 1.1, 0); pb.box(0.9, 0.7, 0.82, 0xf6ead4, 0, 1.6, 0); pb.box(1.2, 0.3, 0.9, 0x2a1d22, 0, 2.35, 0); pb.box(0.2, 0.9, 0.2, 0x2a1d22, 0.62, 1.1, 0);
      r = 0.9; h = 2.5; hp = 14; breakOnRam = 9; explosive = { r: 11, dmg: 34, fire: true }; debrisCol = 0xc0392b; break;
    }
    case 'tower': {
      const wood = 0x7a5238, tank = 0x9c6a4a;
      for (const [lx, lz] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) pb.box(0.4, 10, 0.4, wood, lx * 0.92, 5, lz * 0.92, lz * 0.03, 0, -lx * 0.03);
      pb.box(4.6, 0.3, 0.3, wood, 0, 4, -2); pb.box(4.6, 0.3, 0.3, wood, 0, 4, 2); pb.box(0.3, 0.3, 4.6, wood, -2, 4, 0); pb.box(0.3, 0.3, 4.6, wood, 2, 4, 0);
      pb.box(5.6, 0.35, 5.6, wood, 0, 10.1, 0);
      pb.cyl(3, 3, 4.4, 12, tank, 0, 12.4, 0); pb.cyl(3.05, 3.05, 0.3, 12, 0x4a3226, 0, 11.2, 0); pb.cyl(3.05, 3.05, 0.3, 12, 0x4a3226, 0, 13.6, 0);
      pb.cone(3.4, 2, 12, 0x6b3a2a, 0, 15.6, 0);
      r = 3.2; h = 17; hp = 60; topple = true; debrisCol = 0x7a5238; break;
    }
    case 'billboard': {
      const wood = 0x6b4a36;
      pb.box(0.4, 7, 0.4, wood, -3.5, 3.5, 0); pb.box(0.4, 7, 0.4, wood, 3.5, 3.5, 0); pb.box(9.4, 4.4, 0.3, 0x4a3226, 0, 6.8, -0.1);
      const tex = signTexture(opts.text, opts.bg, opts.fg, 512, 256);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(9, 4), new THREE.MeshLambertMaterial({ map: tex }));
      face.position.set(0, 6.8, 0.07); group.add(face);
      const back = face.clone(); back.material = new THREE.MeshLambertMaterial({ color: 0x5a3e2c }); back.rotation.y = Math.PI; back.position.z = -0.27; group.add(back);
      group.rotation.y = opts.yaw || 0; r = 2.6; h = 9; hp = 40; topple = true; debrisCol = 0x6b4a36; break;
    }
  }
  const mesh = new THREE.Mesh(pb.build(), MAT_VC); mesh.castShadow = true; mesh.receiveShadow = kind === 'tower';
  group.add(mesh); scene.add(group);
  const p = { kind, x, z, y, r, h, hp, maxHp: hp, solid, breakOnRam, explosive, topple, debrisCol, group, alive: true, fall: null, rot0: group.rotation.y };
  PROPS.push(p); return p;
}
export function buildProps() {
  makeProp('tower', -24, 38);
  makeProp('billboard', -82, 16, { text: 'Sundown Springs', bg: '#27888a', fg: '#f6ead4', yaw: 0 });
  makeProp('billboard', 92, -16, { text: 'Cold Pop 10 Miles', bg: '#f2b134', fg: '#7a2a1f', yaw: Math.PI });
  makeProp('billboard', 28, 96, { text: 'Hollis Salvage', bg: '#c0392b', fg: '#f6ead4', yaw: Math.PI * 0.85 });
  makeProp('pump', 31, -24); makeProp('pump', 37, -24);
  for (const [x, z] of [[-50, -10.5], [-48.6, -10], [-49.4, -8.8], [47, 10.5], [48.2, 11.4], [26, -33], [-8, 11], [-30, -11], [58, -8], [-62, 9]]) makeProp('barrel', x, z);
  const cr = mulberry32(99);
  let n = 0;
  for (let t = 0; t < 400 && n < 34; t++) {
    const a = cr() * TAU, R = 72 + cr() * 105; const x = Math.sin(a) * R, z = Math.cos(a) * R;
    if (!clearSpot(x, z, 4)) continue;
    let bad = false; for (const p of PROPS) if (Math.hypot(p.x - x, p.z - z) < 8) bad = true; if (bad) continue;
    makeProp('cactus', x, z, { s: 0.8 + cr() * 0.5 }); n++;
  }
  for (const [x, z] of [[-66, 22], [64, -24], [8, 42], [-12, -40], [70, 14]]) makeProp('cactus', x, z, { s: 0.9 });
}
export function resetProps() {
  for (const p of PROPS) {
    p.alive = true; p.hp = p.maxHp; p.fall = null; p.solid = true;
    p.group.visible = true; p.group.position.set(p.x, p.y, p.z); p.group.quaternion.identity(); p.group.rotation.set(0, p.rot0, 0);
  }
}
export function damageProp(p, amt, by) {
  if (!p.alive) return; p.hp -= amt;
  if (p.hp <= 0) breakProp(p, by);
}
export function breakProp(p, by, dirX, dirZ) {
  if (!p.alive) return; p.alive = false;
  const cnt = p.kind === 'cactus' ? 6 : 8;
  for (let i = 0; i < cnt * fxScale; i++) spawnDebris(p.x, p.y + rand(0.5, p.h * 0.6), p.z, rand(-6, 6), rand(4, 12), rand(-6, 6), rand(0.25, 0.7), p.debrisCol);
  if (p.topple) {
    let dx = dirX, dz = dirZ;
    if (dx == null) { if (by) { dx = p.x - by.x; dz = p.z - by.z; } else { dx = rand(-1, 1); dz = rand(-1, 1); } }
    const L = Math.hypot(dx, dz) || 1;
    p.fall = { t: 0, ax: dz / L, az: -dx / L, dx: dx / L, dz: dz / L, by, q0: p.group.quaternion.clone() };
    p.solid = false;
    playSfx('crash', p.x, p.z, 1);
  } else {
    p.group.visible = false; p.solid = false;
    if (p.explosive) explode(p.x, p.y + 1, p.z, p.explosive.r, p.explosive.dmg, by || null, { size: p.kind === 'pump' ? 2.2 : 1.4, fire: p.explosive.fire });
    else { puff(p.x, p.y + 1.5, p.z, 0x8a7a5a, 6); playSfx('crunch', p.x, p.z, 0.6); }
  }
}
const _axis = new THREE.Vector3();
export function updateProps(dt) {
  for (const p of PROPS) {
    if (!p.fall) continue;
    const f = p.fall; if (f.t >= 1) continue;
    f.t = Math.min(1, f.t + dt / 1.3);
    const ang = f.t * f.t * (Math.PI / 2 - 0.08);
    _axis.set(f.ax, 0, f.az);
    _q1.setFromAxisAngle(_axis, ang); p.group.quaternion.copy(_q1).multiply(f.q0);
    if (f.t >= 1) {
      // impact
      const reach = p.kind === 'tower' ? 12 : 6;
      const ix = p.x + f.dx * reach, iz = p.z + f.dz * reach;
      shake(ix, iz, 0.9);
      if (p.kind === 'tower') {
        for (let i = 0; i < 60 * fxScale; i++) FX_SMOKE.spawn(ix + rand(-3, 3), p.y + 1, iz + rand(-3, 3), rand(-9, 9), rand(3, 14), rand(-9, 9), rand(0.8, 1.6), 1.2, 3.5, 0x9fd4e8, 0xe6f3f7, 0.8, 1.2, 14);
        for (const c of G.cars) if (c.alive) { const d = Math.hypot(c.x - ix, c.z - iz); if (d < 8) { damageCar(c, 45 * (1 - d / 10), f.by || null, 'tower'); c.vy += 6; } }
        playSfx('boom', ix, iz, 1.2);
      } else {
        puff(ix, p.y + 0.5, iz, 0xa98a62, 10);
        for (const c of G.cars) if (c.alive) { const d = Math.hypot(c.x - ix, c.z - iz); if (d < 5) damageCar(c, 18, f.by || null, 'sign'); }
      }
    }
  }
}
export function puff(x, y, z, col, n) {
  for (let i = 0; i < n * fxScale; i++) FX_SMOKE.spawn(x + rand(-1, 1), y + rand(0, 1), z + rand(-1, 1), rand(-3, 3), rand(1, 4), rand(-3, 3), rand(0.8, 1.6), 1.2, 4, col, col, 0.55, 1.5, -1);
}
