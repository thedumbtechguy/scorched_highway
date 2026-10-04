import * as THREE from 'three';
import { M_LAMP } from './constants.js';
import { drawLivery, emitDecals } from './decals.js';
import { CAR_ENV } from './env.js';
import { CarKit } from './kit.js';
import { buildWheelGeo } from './wheels.js';
import { CAR_RECIPES } from '../recipes/index.js';
import { curTod, glowTexture } from '../../engine/sky';
import { G } from '../../game/state.js';

/** @typedef {THREE.MeshStandardMaterial & { clearcoat?: number, clearcoatRoughness?: number }} LitMaterial Standard, or Physical with clear coat */

/** @returns {[LitMaterial, LitMaterial, LitMaterial, LitMaterial, THREE.MeshBasicMaterial, LitMaterial]} indexed by the M_* constants */
function carMaterials(livery, hi) {
  const env = CAR_ENV.tex;
  const P = hi ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  /** @type {LitMaterial} */
  const paint = new P({ vertexColors: true, roughness: 0.42, metalness: 0.12, envMap: env, envMapIntensity: 0.9 });
  /** @type {LitMaterial} */
  const decal = new P({ vertexColors: true, map: livery, transparent: true, depthWrite: false, alphaTest: 0.02, roughness: 0.4, metalness: 0.08, envMap: env, envMapIntensity: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  if (hi) for (const m of [paint, decal]) { m.clearcoat = 1; m.clearcoatRoughness = 0.12; }
  /** @type {[LitMaterial, LitMaterial, LitMaterial, LitMaterial, THREE.MeshBasicMaterial, LitMaterial]} */
  const mats = [
    paint,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.16, metalness: 1, envMap: env, envMapIntensity: 1.25 }),
    new THREE.MeshStandardMaterial({ vertexColors: true, map: livery, transparent: true, depthWrite: false, alphaTest: 0.02, roughness: 0.05, metalness: 0.25, envMap: env, envMapIntensity: 1.6, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, envMap: env, envMapIntensity: 0.6 }),
    new THREE.MeshBasicMaterial({ vertexColors: true }),
    decal,
  ];
  for (const m of /** @type {LitMaterial[]} */ ([0, 1, 2, 3, 5].map(i => mats[i]))) { CAR_ENV.mats.add(m); m.userData.env = m.envMapIntensity; }
  return mats;
}

let glowTex = null;
export function buildCarModel(def) {
  const K = new CarKit(def);
  const recipe = CAR_RECIPES[def.id];
  recipe(K, def);
  const liv = drawLivery(def.id, K.decals);
  emitDecals(K.mb, K.decals, liv.pk);
  const mats = carMaterials(liv.tex, G.settings.quality !== 'low');
  const group = new THREE.Group(), body = new THREE.Group(); group.add(body);
  const bodyMesh = new THREE.Mesh(K.mb.build(), mats); bodyMesh.castShadow = true; body.add(bodyMesh);
  for (const p of K.parts) body.add(p);
  let siren = K.siren || null;
  // lamp glows (night, brakes)
  if (!glowTex) glowTex = glowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0.25)');
  const glows = { heads: [], tails: [] };
  const addGlows = (list, col, out) => { for (const g of list) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: col, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    s.position.set(g.x, g.y, g.z); s.visible = false; body.add(s); out.push(s);
  } };
  addGlows(K.heads, 0xffe6b0, glows.heads); addGlows(K.tails, 0xff2a14, glows.tails);
  const beams = [];
  for (const sx of [-0.7, 0.7]) { const bm = new THREE.Mesh(beamGeo, beamMat); bm.position.set(sx, 0.9, def.front); bm.rotation.x = 0.06; bm.visible = false; body.add(bm); beams.push(bm); }
  const ws = [];
  for (const w of K.wheels) for (const s of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(s * w.x, w.y, w.z);
    const m = new THREE.Mesh(buildWheelGeo(w.style), mats); m.castShadow = true; if (s < 0) m.scale.x = -1;
    pivot.add(m); group.add(pivot); ws.push({ pivot, mesh: m, front: !!w.front, r: w.r });
  }
  const lit = /** @type {LitMaterial[]} */ ([0, 1, 2, 3, 5].map(i => mats[i]));
  const model = {
    group, body, wheels: ws, mats, mat: mats[0], siren, beams, bodyMesh, glows,
    // darken for damage / wrecks: reflections and clear coat fade with the paint
    tint(r, g, b) { const k = Math.max(r, g, b); for (const m of lit) { m.color.setRGB(r, g, b); m.envMapIntensity = m.userData.env * k * k; if (m.clearcoat !== undefined) m.clearcoat = k > 0.4 ? 1 : 0; } },
    emit(r, g, b) { for (const m of lit) m.emissive.setRGB(r, g, b); },
    lights(night, brake, alive) {
      mats[M_LAMP].color.setScalar(alive ? 1 : 0.25);
      for (const s of glows.heads) { s.visible = alive && night; s.scale.setScalar(1.5); s.material.opacity = 0.9; }
      for (const s of glows.tails) { const on = alive && (night || brake); s.visible = on; const k = brake ? 1 : 0.55; s.scale.setScalar((night ? 1.1 : 0.7) * (0.6 + k * 0.6)); s.material.opacity = brake ? 1 : 0.7; }
    },
  };
  model.lights(curTod.night, false, true);
  return model;
}
export function disposeCarModel(m) {
  m.group.parent && m.group.parent.remove(m.group);
  m.bodyMesh.geometry.dispose();
  for (const mt of m.mats) { CAR_ENV.mats.delete(mt); mt.dispose(); }
  for (const s of m.glows.heads.concat(m.glows.tails)) s.material.dispose();
  for (const p of m.siren || []) p.material.dispose();
}
const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const beamGeo = (() => { const g = new THREE.ConeGeometry(3.2, 16, 12, 1, true); g.translate(0, -8, 0); g.rotateX(-Math.PI / 2); return g; })();
