// Triggered hazards: things a map has waiting along its course that something sets off (in a race, a skull
// plate). Two kinds:
// - rockfall: a wall lets go; boulders crash onto the road over a stretch, hurting whoever they land on, and lie
//   there as obstacles for a while before they crumble;
// - truck: a big rig thunders down a stretch the wrong way, flattening whatever it meets.
// The map says where (HazardSite); this module runs them, collides them with cars, and tells the AI and the
// radar where they are. Whoever set a hazard off gets the credit for its wrecks.
import * as THREE from 'three';
import { playSfx } from '../audio/audio.js';
import { damageCar, knock } from '../combat/damage.js';
import { FX_SMOKE, fxScale } from '../engine/particles.js';
import { addToScene } from '../engine/renderer.js';
import { GRAV, clamp, mulberry32, rand } from '../engine/util.js';
import { G, shake } from '../game/state.js';
import { boulderGeometry } from './flora';
import { ground } from './terrain.js';

/** A rockfall: each drop falls from (fx, fy, fz) on the wall top to (tx, tz) on the road; `s` is where it starts on the lap. */
export interface RockfallSite { kind: 'rockfall'; name: string; s: number; drops: Array<{ fx: number; fy: number; fz: number; tx: number; tz: number; r: number }> }
/** A wrong-way truck: the polyline it drives, in order; `s` is where it starts on the lap (the end it drives off). */
export interface TruckSite { kind: 'truck'; name: string; s: number; route: { x: number[]; z: number[] } }
export type HazardSite = RockfallSite | TruckSite;
type Car = { x: number; y: number; z: number; vx: number; vz: number; vy: number; radius: number; mass: number; alive: boolean; isPlayer: boolean; hazardT?: number };
/** Heavier cars shrug off part of a hazard's hit (Big Chill takes about 70%, Scorcher about 115%). */
const toughness = (c: Car) => Math.pow(c.mass, -0.7);

/** Seconds of rumbling before the first boulder comes down. */
export const ROCK_WARN = 1.3;
const ROCK_REST = 15, ROCK_SINK = 2, ROCK_FLIGHT = 1.1, ROCK_HIT = 35;
/** A site that has gone off can't go off again for this long after it's over. */
const COOLDOWN = 20;
export const TRUCK_SPEED = 25;
const TRUCK_HALF_L = 7, TRUCK_HALF_W = 1.4;

interface Rock { x: number; y: number; z: number; vx: number; vy: number; vz: number; r: number; phase: 'wait' | 'fall' | 'rest' | 'sink'; t: number; spin: THREE.Vector3; rot: THREE.Quaternion; by: Car | null; hit: Set<Car> }
interface Truck { site: TruckSite; s: number; x: number; z: number; y: number; hx: number; hz: number; segs: number[]; by: Car | null; hornT: number }
const busy = new Set<HazardSite>();
/** Live boulders (falling, or lying on the road) and the truck, if one is out: for the radar and tests. */
export const ROCKS: Rock[] = [];
export let truck: Truck | null = null;
export const currentTruck = () => truck;

// ---------- meshes ----------
const MAX_ROCKS = 32;
let rockMesh: THREE.InstancedMesh | null = null, truckObj: THREE.Group | null = null;
function truckModel() {
  const g = new THREE.Group(), lam = (c: number, e = 0) => new THREE.MeshLambertMaterial({ color: c, emissive: e });
  const box = (w: number, h: number, l: number, x: number, y: number, z: number, m: THREE.Material) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), m); b.position.set(x, y, z); b.castShadow = true; g.add(b); return b; };
  const red = lam(0xb8322a), steel = lam(0xc9c3bb), dark = lam(0x2a2226), chrome = lam(0xe8e2d8, 0x2a2a2a);
  box(2.6, 0.5, 14, 0, 0.9, 0, dark); // chassis
  box(2.6, 2.1, 3.2, 0, 2.2, 5.2, red); box(2.4, 1.0, 1.4, 0, 1.6, 7.0, red); // cab and hood
  box(2.3, 0.8, 0.05, 0, 2.8, 6.83, lam(0x30404a, 0x101820)); // windscreen
  box(2.0, 0.6, 0.1, 0, 1.5, 7.72, chrome); // grille
  for (const x of [-0.85, 0.85]) box(0.5, 0.3, 0.1, x, 1.95, 7.74, lam(0xfff4c0, 0xfff0b0)); // headlights
  for (const x of [-1.2, 1.2]) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 2.6, 8), chrome); st.position.set(x, 3.4, 3.9); g.add(st); } // stacks
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 9.4, 18), steel); tank.rotation.x = Math.PI / 2; tank.position.set(0, 2.6, -2.2); tank.castShadow = true; g.add(tank); // tanker trailer
  box(2.75, 0.35, 9.4, 0, 2.6, -2.2, red); // its stripe
  const wheel = new THREE.CylinderGeometry(0.55, 0.55, 0.5, 12); wheel.rotateZ(Math.PI / 2);
  for (const z of [5.8, 1.6, 0.4, -4.6, -5.8]) for (const x of [-1.2, 1.2]) { const w = new THREE.Mesh(wheel, dark); w.position.set(x, 0.55, z); g.add(w); }
  g.visible = false; addToScene(g, 'cars'); return g;
}
/** Make the hazard meshes (once). */
export function buildHazards() {
  if (rockMesh) return;
  const geo = boulderGeometry(67, 1); geo.computeBoundingSphere(); geo.scale(1 / geo.boundingSphere!.radius, 0.8 / geo.boundingSphere!.radius, 1 / geo.boundingSphere!.radius); // unit radius, a little squat
  rockMesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xb98458 }), MAX_ROCKS);
  rockMesh.castShadow = true; rockMesh.receiveShadow = true; rockMesh.frustumCulled = false; rockMesh.count = 0; addToScene(rockMesh, 'props');
  truckObj = truckModel();
}

// ---------- triggering ----------
export const isBusy = (site: HazardSite) => busy.has(site);
/** Set a hazard off; `by` gets the credit for what it wrecks. Returns false if it's already going. */
export function triggerHazard(site: HazardSite, by: Car | null): boolean {
  if (busy.has(site) || (site.kind === 'truck' && truck)) return false;
  buildHazards(); busy.add(site);
  if (site.kind === 'rockfall') {
    const cx = site.drops.reduce((a, d) => a + d.fx, 0) / site.drops.length, cz = site.drops.reduce((a, d) => a + d.fz, 0) / site.drops.length;
    playSfx('rumble', cx, cz, 1.4); shake(cx, cz, 0.5);
    site.drops.forEach((d, k) => {
      if (ROCKS.length >= MAX_ROCKS) return;
      const T = ROCK_FLIGHT + rand(0, 0.3), ty = ground(d.tx, d.tz) + d.r * 0.4;
      ROCKS.push({
        x: d.fx, y: d.fy, z: d.fz, vx: (d.tx - d.fx) / T, vz: (d.tz - d.fz) / T, vy: (ty - d.fy + 0.5 * GRAV * T * T) / T, r: d.r,
        phase: 'wait', t: ROCK_WARN + k * 0.22 + rand(0, 0.15), spin: new THREE.Vector3(rand(-3, 3), rand(-3, 3), rand(-3, 3)), rot: new THREE.Quaternion(), by, hit: new Set(),
      });
    });
    G.delayed.push({ t: ROCK_WARN + site.drops.length * 0.22 + ROCK_FLIGHT + ROCK_REST + ROCK_SINK + COOLDOWN, fn: () => busy.delete(site) });
  } else {
    const r = site.route, segs = [0]; for (let i = 1; i < r.x.length; i++) segs.push(segs[i - 1] + Math.hypot(r.x[i] - r.x[i - 1], r.z[i] - r.z[i - 1]));
    truck = { site, s: 0, x: r.x[0], z: r.z[0], y: 0, hx: 0, hz: 1, segs, by, hornT: 0 };
    placeTruck(truck);
  }
  return true;
}
function placeTruck(t: Truck) {
  const { x, z } = t.site.route, n = x.length; let i = 0; while (i < n - 2 && t.segs[i + 1] < t.s) i++;
  const L = t.segs[i + 1] - t.segs[i] || 1, u = clamp((t.s - t.segs[i]) / L, 0, 1);
  t.x = x[i] + (x[i + 1] - x[i]) * u; t.z = z[i] + (z[i + 1] - z[i]) * u;
  // heading eases round the corners of the polyline
  const hx = (x[i + 1] - x[i]) / L, hz = (z[i + 1] - z[i]) / L, k = 1 - Math.exp(-6 * 1 / 60);
  if (t.s === 0) { t.hx = hx; t.hz = hz; } else { t.hx += (hx - t.hx) * k; t.hz += (hz - t.hz) * k; const m = Math.hypot(t.hx, t.hz) || 1; t.hx /= m; t.hz /= m; }
  const yF = ground(t.x + t.hx * 5, t.z + t.hz * 5), yB = ground(t.x - t.hx * 5, t.z - t.hz * 5);
  t.y = Math.max(ground(t.x, t.z), (yF + yB) / 2);
  const o = truckObj!; o.visible = true; o.position.set(t.x, t.y, t.z); o.rotation.set(0, 0, 0); o.rotation.y = Math.atan2(t.hx, t.hz); o.rotateX(-Math.atan2(yF - yB, 10));
}

// ---------- every step ----------
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
export function updateHazards(dt: number) {
  const cars = G.cars as Car[];
  for (let k = ROCKS.length - 1; k >= 0; k--) {
    const r = ROCKS[k];
    if (r.phase === 'wait') {
      if (Math.random() < 0.2 * fxScale) FX_SMOKE.spawn(r.x + rand(-2, 2), r.y, r.z + rand(-2, 2), rand(-2, 2), rand(-4, -1), rand(-2, 2), rand(0.6, 1.1), 1.5, 4, 0xc89a70, 0xc89a70, 0.45, 1, 2); // dust trickling off the lip
      if ((r.t -= dt) <= 0) { r.phase = 'fall'; playSfx('crunch', r.x, r.z, 0.8); }
      continue;
    }
    if (r.phase === 'fall') {
      r.vy -= GRAV * dt; r.x += r.vx * dt; r.y += r.vy * dt; r.z += r.vz * dt;
      _q.setFromAxisAngle(_p.copy(r.spin).normalize(), r.spin.length() * dt); r.rot.premultiply(_q);
      for (const c of cars) {
        if (!c.alive || r.hit.has(c) || (c.hazardT ?? -1) > G.time) continue; // one boulder at a time
        if (Math.hypot(c.x - r.x, c.y + 1 - r.y, c.z - r.z) < r.r + 1.6) { r.hit.add(c); c.hazardT = G.time + 0.8; damageCar(c, ROCK_HIT * toughness(c), r.by !== c ? r.by : null, 'rock'); knock(c, r.x, r.z, 9, 6); shake(c.x, c.z, 0.6); playSfx('clank', c.x, c.z, 1); }
      }
      const g = ground(r.x, r.z);
      if (r.vy < 0 && r.y <= g + r.r * 0.4) {
        r.y = g + r.r * 0.4; r.phase = 'rest'; r.t = ROCK_REST;
        for (let i = 0; i < 14 * fxScale; i++) FX_SMOKE.spawn(r.x + rand(-r.r, r.r), r.y, r.z + rand(-r.r, r.r), rand(-6, 6), rand(1, 5), rand(-6, 6), rand(1, 2.2), 2, 6, 0xd8a878, 0xc89a70, 0.6, 1.5, -0.5);
        playSfx('thud', r.x, r.z, 1.4); shake(r.x, r.z, 0.45);
      }
      continue;
    }
    if (r.phase === 'rest' && (r.t -= dt) <= 0) { r.phase = 'sink'; r.t = ROCK_SINK; }
    if (r.phase === 'sink') { r.y -= r.r * 1.3 / Math.min(ROCK_SINK, r.t + dt) * dt; if ((r.t -= dt) <= 0) { ROCKS.splice(k, 1); continue; } }
    for (const c of cars) restingRock(c, r);
  }
  if (truck) driveTruck(truck, dt, cars);
  draw();
}
/** A boulder lying on the road is solid. */
function restingRock(c: Car, r: Rock) {
  if (c.y > r.y + r.r) return;
  const dx = c.x - r.x, dz = c.z - r.z, R = c.radius + r.r * 0.9, d2 = dx * dx + dz * dz; if (d2 >= R * R) return;
  const d = Math.sqrt(d2) || 0.01, nx = dx / d, nz = dz / d; c.x = r.x + nx * R; c.z = r.z + nz * R;
  const vn = -(c.vx * nx + c.vz * nz);
  if (vn > 0) { c.vx += 1.3 * vn * nx; c.vz += 1.3 * vn * nz; if (vn > 14 && c.alive) damageCar(c, (vn - 14) * 1.2, null, 'ram'); }
}
function driveTruck(t: Truck, dt: number, cars: Car[]) {
  t.s += TRUCK_SPEED * dt;
  if (t.s >= t.segs[t.segs.length - 1]) { const site = t.site; G.delayed.push({ t: COOLDOWN, fn: () => busy.delete(site) }); truck = null; truckObj!.visible = false; return; }
  placeTruck(t);
  for (let i = 0; i < 2 * fxScale; i++) FX_SMOKE.spawn(t.x - t.hx * 7 + rand(-1.5, 1.5), t.y + 0.4, t.z - t.hz * 7 + rand(-1.5, 1.5), rand(-2, 2), rand(0.5, 2), rand(-2, 2), rand(0.8, 1.4), 1.5, 4, 0xd8a878, 0xd8a878, 0.35, 1, -0.5);
  const p = G.player as Car | null;
  if (p && (t.hornT -= dt) <= 0) {
    const dx = p.x - t.x, dz = p.z - t.z, d = Math.hypot(dx, dz);
    if (d < 110 && (dx * t.hx + dz * t.hz) > 0) { playSfx('horn', t.x, t.z, 1.6); t.hornT = 2.2; }
  }
  for (const c of cars) {
    if (Math.abs(c.y - t.y) > 4) continue;
    const dx = c.x - t.x, dz = c.z - t.z, along = clamp(dx * t.hx + dz * t.hz, -TRUCK_HALF_L, TRUCK_HALF_L);
    const px = t.x + t.hx * along, pz = t.z + t.hz * along, ex = c.x - px, ez = c.z - pz, d = Math.hypot(ex, ez), R = TRUCK_HALF_W + c.radius;
    if (d >= R) continue;
    const nx = ex / (d || 1), nz = ez / (d || 1); c.x = px + nx * R; c.z = pz + nz * R;
    const vn = (c.vx - t.hx * TRUCK_SPEED) * nx + (c.vz - t.hz * TRUCK_SPEED) * nz; // closing speed
    if (vn < 0) { c.vx -= 1.5 * vn * nx; c.vz -= 1.5 * vn * nz; }
    if (c.alive && (c.hazardT ?? -1) < G.time) {
      c.hazardT = G.time + 0.6;
      const hit = clamp(-vn * 1.6, 10, 90) * toughness(c);
      damageCar(c, hit, t.by !== c ? t.by : null, 'truck'); if (hit > 30) knock(c, px, pz, 6, 8);
      playSfx('crash', c.x, c.z, 1); shake(c.x, c.z, 0.9);
    }
  }
}
function draw() {
  if (!rockMesh) return;
  ROCKS.forEach((r, i) => rockMesh!.setMatrixAt(i, _m.compose(_p.set(r.x, r.y, r.z), r.rot, _s.setScalar(r.r))));
  for (let i = ROCKS.length; i < rockMesh.count; i++) rockMesh.setMatrixAt(i, ZERO);
  rockMesh.count = Math.max(rockMesh.count, ROCKS.length); rockMesh.instanceMatrix.needsUpdate = true;
}
/** Shatter the fallen boulders within r of (x, z) (Moonbeam's sonic blast): they crumble away at once. */
export function shatterRocks(x: number, z: number, r: number) {
  for (const k of ROCKS) if (k.phase === 'rest' && Math.hypot(k.x - x, k.z - z) < r + k.r) { k.phase = 'sink'; k.t = 0.4; for (let i = 0; i < 10 * fxScale; i++) FX_SMOKE.spawn(k.x + rand(-k.r, k.r), k.y, k.z + rand(-k.r, k.r), rand(-5, 5), rand(2, 6), rand(-5, 5), rand(0.8, 1.6), 2, 5, 0xd8a878, 0xc89a70, 0.6, 1.5, -0.5); }
}
/** End every hazard (a new match). */
export function clearHazards() {
  ROCKS.length = 0; busy.clear(); truck = null;
  if (truckObj) truckObj.visible = false;
  draw();
}
/** A boulder on the road, a falling one about to land, or the truck (and where it'll be in a moment) within `m` of (x, z): for AI probes. */
export function hazardBlocked(x: number, z: number, m: number): boolean {
  for (const r of ROCKS) {
    if (r.phase === 'wait') continue;
    const lx = r.phase === 'fall' ? r.x + r.vx * 0.4 : r.x, lz = r.phase === 'fall' ? r.z + r.vz * 0.4 : r.z;
    if (Math.hypot(x - lx, z - lz) < r.r + m) return true;
  }
  if (truck) for (const ahead of [0, 10, 20]) {
    const cx = truck.x + truck.hx * ahead, cz = truck.z + truck.hz * ahead, dx = x - cx, dz = z - cz, along = clamp(dx * truck.hx + dz * truck.hz, -TRUCK_HALF_L, TRUCK_HALF_L);
    if (Math.hypot(dx - truck.hx * along, dz - truck.hz * along) < TRUCK_HALF_W + m + 1) return true;
  }
  return false;
}
/** A seeded scatter of boulder drops along a stretch of road, for maps building their rockfall sites. */
export function scatterDrops(n: number, seed: number, at: (u: number, side: number, rng: () => number) => { fx: number; fy: number; fz: number; tx: number; tz: number }) {
  const rng = mulberry32(seed), out: RockfallSite['drops'] = [];
  for (let k = 0; k < n; k++) out.push({ ...at((k + 0.5 + (rng() - 0.5) * 0.6) / n, rng() < 0.5 ? -1 : 1, rng), r: 1.3 + rng() * 0.9 });
  return out;
}
