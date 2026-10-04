import { playSfx } from '../audio/audio.js';
import { damageCar, knock } from './damage.js';
import { MINES, RINGS, takeMesh } from './pools.js';
import { spawnDebris } from '../engine/debris.js';
import { FX_ADD, FX_SMOKE, fxScale } from '../engine/particles.js';
import { flashLight } from '../engine/renderer.js';
import { TAU, clamp, pick, rand } from '../engine/util.js';
import { G, later, shake } from '../game/state.js';
import { PROPS, damageProp } from '../world/props.js';
import { ground } from '../world/terrain.js';

// ================= effects =================
export function sparks(x, y, z, n) {
  for (let i = 0; i < n * fxScale; i++) FX_ADD.spawn(x, y, z, rand(-12, 12), rand(2, 12), rand(-12, 12), rand(0.15, 0.4), 0.35, 0.1, 0xfff2b0, 0xff8020, 1, 2, 20);
}
export function explodeFX(x, y, z, size, opts) {
  opts = opts || {};
  const n = Math.round(16 * size * fxScale);
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), s = rand(2, 9) * size * 0.6;
    FX_ADD.spawn(x + rand(-0.5, 0.5) * size, y + rand(0, 1) * size, z + rand(-0.5, 0.5) * size, Math.cos(a) * s, rand(2, 10) * size * 0.6, Math.sin(a) * s, rand(0.35, 0.7), 2.4 * size, 5 * size, opts.ice ? 0xb8e6ff : 0xffc060, opts.ice ? 0x2a6aff : 0xd03008, 0.7, 3, -3);
  }
  for (let i = 0; i < n * 0.8; i++) {
    const a = rand(0, TAU), s = rand(1, 5) * size * 0.5;
    FX_SMOKE.spawn(x + rand(-1, 1) * size, y + rand(0, 1.5) * size, z + rand(-1, 1) * size, Math.cos(a) * s, rand(2, 6), Math.sin(a) * s, rand(1.4, 2.6), 2 * size, 7 * size, opts.ice ? 0xcfe8f5 : 0x3a3035, opts.ice ? 0xeef8ff : 0x8a7a78, opts.ice ? 0.5 : 0.7, 1.4, -1.2);
  }
  sparks(x, y, z, 10 * size);
  for (let i = 0; i < 3 * size * fxScale; i++) spawnDebris(x, y + 0.5, z, rand(-10, 10), rand(6, 16), rand(-10, 10), rand(0.2, 0.5), pick([0x3a3030, 0x5a4a40, 0x2a2626]), rand(1.5, 2.5));
  if (opts.fire) for (let i = 0; i < 10 * fxScale; i++) FX_ADD.spawn(x + rand(-2, 2), y, z + rand(-2, 2), rand(-1, 1), rand(2, 5), rand(-1, 1), rand(1, 2.2), 2.2, 0.5, 0xffc050, 0xff2a10, 0.8, 1, -2);
  if (size >= 1.4) ring(x, ground(x, z) + 0.4, z, 4 * size, 0.45, opts.ice ? 0x9fe8ff : 0xffd090);
  flashLight(x, y, z, opts.ice ? 1.5 : 2.5 + size);
  playSfx('boom', x, z, clamp(size / 2, 0.4, 1.3));
  shake(x, z, size * 0.35);
}
export function ring(x, y, z, radius, life, color) {
  const m = takeMesh('ring'); m.position.set(x, y, z); m.scale.set(0.1, 0.1, 0.1); m.material.color.setHex(color); m.material.opacity = 0.8;
  RINGS.push({ mesh: m, t: 0, life, radius });
}
export function updateRings(dt) {
  for (let i = RINGS.length - 1; i >= 0; i--) {
    const r = RINGS[i]; r.t += dt; const k = r.t / r.life;
    if (k >= 1) { r.mesh.visible = false; RINGS.splice(i, 1); continue; }
    const s = r.radius * (0.2 + 0.8 * Math.sqrt(k)); r.mesh.scale.set(s, s, s); r.mesh.material.opacity = 0.8 * (1 - k);
  }
}
export function explode(x, y, z, radius, dmg, owner, opts) {
  opts = opts || {};
  explodeFX(x, y, z, opts.size || radius / 4.5, opts);
  for (const c of G.cars) {
    const dx = c.x - x, dy = (c.y + 1) - y, dz = c.z - z; const d = Math.sqrt(dx * dx + dy * dy * 0.5 + dz * dz);
    if (d > radius + c.radius) continue;
    const f = c === opts.direct ? 1 : clamp(1 - (d - c.radius) / radius, 0, 1) * 0.85;
    if (c.alive) {
      damageCar(c, dmg * f * (c === owner ? 0.5 : 1), owner, opts.kind || 'blast');
      if (opts.freeze) c.frozen = Math.max(c.frozen, opts.freeze);
      if (opts.fire) { c.burning = Math.max(c.burning, 2); c.burnBy = owner; }
    }
    knock(c, x, z, (opts.push || 9) * f + 2, (opts.lift || 7) * f);
  }
  for (const p of PROPS) {
    if (!p.alive) continue; const d = Math.hypot(p.x - x, p.z - z);
    if (d < radius + p.r) { if (p.kind === 'barrel' || p.kind === 'pump') { const pp = p, o = owner; later(0.09 + Math.random() * 0.12, () => damageProp(pp, 999, o)); } else damageProp(p, dmg * 1.5, owner); }
  }
  for (const m of MINES) if (!m.dead && Math.hypot(m.x - x, m.z - z) < radius * 0.7) { m.fuse = Math.min(m.fuse == null ? 0.15 : m.fuse, 0.15); }
}
