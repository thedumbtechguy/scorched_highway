import * as THREE from 'three';
import { M_CHROME, M_DECAL, M_GLASS, M_LAMP, M_PAINT, M_TRIM } from './constants.js';
import { drawLivery, emitDecals } from './decals.js';
import { CAR_ENV } from './env.js';
import { CarKit } from './kit.js';
import { buildWheelGeo } from './wheels.js';
import { CAR_RECIPES } from '../recipes/index.js';
import { curTod, glowTexture } from '../../engine/sky';
import { G } from '../../game/state.js';

/** @typedef {THREE.MeshStandardMaterial & { clearcoat?: number, clearcoatRoughness?: number }} LitMaterial Standard, or Physical with clear coat */

/** Read roughness, metalness and clear coat from the per-vertex `pbr` attribute (see MB.buildMerged), so paint,
 *  chrome and trim share one material and one draw call. */
function perVertexSurface(m) {
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 pbr;\nvarying vec3 vPbr;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPbr = pbr;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPbr;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vPbr.x;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vPbr.y;')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef CLEARCOAT\nmaterial.clearcoat *= vPbr.z;\n#endif');
  };
  m.customProgramCacheKey = () => 'car-pbr';
  return m;
}
export const CAR_BODY = 0, CAR_SKIN = 1, CAR_LAMP = 2; // material slots of a car model

/** @returns {[LitMaterial, LitMaterial, THREE.MeshBasicMaterial]} body, skin (glass + decals), lamps */
function carMaterials(livery, hi) {
  const env = CAR_ENV.tex;
  const P = hi ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  /** @type {LitMaterial} */
  const body = perVertexSurface(new P({ vertexColors: true, envMap: env, envMapIntensity: 1 }));
  /** @type {LitMaterial} */
  const skin = perVertexSurface(new P({ vertexColors: true, map: livery, transparent: true, depthWrite: false, alphaTest: 0.02, envMap: env, envMapIntensity: 1.3, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  if (hi) for (const m of [body, skin]) { m.clearcoat = 1; m.clearcoatRoughness = 0.12; }
  /** @type {[LitMaterial, LitMaterial, THREE.MeshBasicMaterial]} */
  const mats = [body, skin, new THREE.MeshBasicMaterial({ vertexColors: true })];
  for (const m of [body, skin]) { CAR_ENV.mats.add(m); m.userData.env = m.envMapIntensity; }
  return mats;
}

let glowTex = null;
const _m = new THREE.Matrix4(), _e = new THREE.Euler(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
export function buildCarModel(def) {
  const K = new CarKit(def);
  const recipe = CAR_RECIPES[def.id];
  recipe(K, def);
  const liv = drawLivery(def.id, K.decals);
  emitDecals(K.mb, K.decals, liv.pk);
  const mats = carMaterials(liv.tex, G.settings.quality !== 'low');
  const group = new THREE.Group(), body = new THREE.Group(); group.add(body);
  // the solid body casts shadows; glass, decals and lamps sit on its surface, so they don't need to
  const bodyMesh = new THREE.Mesh(K.mb.buildMerged([[M_PAINT, M_CHROME, M_TRIM]]), mats); bodyMesh.castShadow = true; body.add(bodyMesh);
  const skinMesh = new THREE.Mesh(K.mb.buildMerged([[], [M_GLASS, M_DECAL], [M_LAMP]]), mats); body.add(skinMesh);
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
  // wheels: one instanced mesh per wheel style (front and rear usually differ only in size, so they share one)
  const ws = [], wheelMeshes = [], byStyle = new Map();
  for (const w of K.wheels) { const { r, w: width, ...look } = w.style, key = JSON.stringify(look); if (!byStyle.has(key)) byStyle.set(key, []); byStyle.get(key).push(w); }
  const view = (base) => { // a view of a cached wheel shape with bounds covering all four wheel positions
    const v = new THREE.BufferGeometry();
    for (const k in base.attributes) v.setAttribute(k, base.attributes[k]);
    for (const g of base.groups) v.addGroup(g.start, g.count, g.materialIndex);
    v.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.6, 0), 3.4);
    return v;
  };
  for (const list of byStyle.values()) {
    const near = view(buildWheelGeo(list[0].style)), far = view(buildWheelGeo(list[0].style, true));
    const mesh = new THREE.InstancedMesh(near, mats, list.length * 2); mesh.castShadow = true; mesh.userData.lod = { near, far }; group.add(mesh); wheelMeshes.push(mesh);
    list.forEach((w, k) => { for (const s of [-1, 1]) ws.push({ x: s * w.x, y: w.y, z: w.z, r: w.r, front: !!w.front, on: true, mesh, i: k * 2 + (s > 0 ? 1 : 0), sw: w.w / list[0].w, sr: w.r / list[0].r }); });
  }
  const lit = [mats[CAR_BODY], mats[CAR_SKIN]];
  const model = {
    group, body, wheels: ws, wheelMeshes, mats, mat: mats[0], siren, beams, bodyMesh, skinMesh, glows,
    /** Spin and steer the wheels; detached wheels collapse to nothing. */
    poseWheels(rot, steer) {
      for (const w of ws) {
        if (!w.on) _m.makeScale(0, 0, 0);
        else { _e.set(rot * 0.48 / w.r, w.front ? steer : 0, 0, 'YXZ'); _m.compose(_p.set(w.x, w.y, w.z), _q.setFromEuler(_e), _s.set(w.sw, w.sr, w.sr)); }
        w.mesh.setMatrixAt(w.i, _m);
      }
      for (const m of wheelMeshes) m.instanceMatrix.needsUpdate = true;
    },
    wheelWorldPos(w, out) { return out.set(w.x, w.y, w.z).applyMatrix4(group.matrixWorld); },
    /** Distant cars get simple wheels (no tread or rim detail); a little hysteresis avoids flicker. */
    lod(cam) {
      const d = group.position.distanceTo(cam);
      for (const m of wheelMeshes) { const { near, far } = m.userData.lod; if (d > 50 && m.geometry === near) m.geometry = far; else if (d < 40 && m.geometry === far) m.geometry = near; }
    },
    // darken for damage / wrecks: reflections and clear coat fade with the paint
    tint(r, g, b) { const k = Math.max(r, g, b); for (const m of lit) { m.color.setRGB(r, g, b); m.envMapIntensity = m.userData.env * k * k; if (m.clearcoat !== undefined) m.clearcoat = k > 0.4 ? 1 : 0; } },
    emit(r, g, b) { for (const m of lit) m.emissive.setRGB(r, g, b); },
    lights(night, brake, alive) {
      mats[CAR_LAMP].color.setScalar(alive ? 1 : 0.25);
      for (const s of glows.heads) { s.visible = alive && night; s.scale.setScalar(1.5); s.material.opacity = 0.9; }
      for (const s of glows.tails) { const on = alive && (night || brake); s.visible = on; const k = brake ? 1 : 0.55; s.scale.setScalar((night ? 1.1 : 0.7) * (0.6 + k * 0.6)); s.material.opacity = brake ? 1 : 0.7; }
    },
  };
  model.lights(curTod.night, false, true); model.poseWheels(0, 0);
  return model;
}
export function disposeCarModel(m) {
  m.group.parent && m.group.parent.remove(m.group);
  m.bodyMesh.geometry.dispose(); m.skinMesh.geometry.dispose();
  for (const w of m.wheelMeshes) { w.userData.lod.near.dispose(); w.userData.lod.far.dispose(); } // views only; the wheel shapes stay cached
  for (const mt of m.mats) { CAR_ENV.mats.delete(mt); mt.dispose(); }
  for (const s of m.glows.heads.concat(m.glows.tails)) s.material.dispose();
  for (const p of m.siren || []) p.material.dispose();
}
const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const beamGeo = (() => { const g = new THREE.ConeGeometry(3.2, 16, 12, 1, true); g.translate(0, -8, 0); g.rotateX(-Math.PI / 2); return g; })();
