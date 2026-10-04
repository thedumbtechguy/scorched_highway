import * as THREE from 'three';
import { renderer, sunDir } from '../../engine/renderer.js';
import { onTod } from '../../engine/sky';
import { TAU, mulberry32 } from '../../engine/util.js';

// ----- environment map for reflections, regenerated per time of day -----
export const CAR_ENV = (() => {
  const sc = new THREE.Scene();
  const geo = new THREE.SphereGeometry(50, 32, 16);
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3));
  sc.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const sunM = new THREE.Mesh(new THREE.SphereGeometry(5, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  sc.add(sunM);
  const mesaMat = new THREE.MeshBasicMaterial({ color: 0x6a3020 });
  const r = mulberry32(77);
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * TAU + r() * 0.3, h = 2 + r() * 6, wd = 5 + r() * 9;
    const m = new THREE.Mesh(new THREE.BoxGeometry(wd, h, 4), mesaMat);
    m.position.set(Math.sin(a) * 44, h / 2 - 0.5, Math.cos(a) * 44); m.lookAt(0, h / 2, 0); sc.add(m);
  }
  return { sc, geo, sunM, mesaMat, pm: null, cache: {}, tex: null, mats: new Set() };
})();
onTod(updateCarEnv);
function updateCarEnv(t) {
  const E = CAR_ENV;
  let tex = E.cache[t.name];
  if (!tex) {
    const cT = new THREE.Color(t.top), cM = new THREE.Color(t.mid), cH = new THREE.Color(t.hor);
    const cG = new THREE.Color(t.below).lerp(new THREE.Color(t.night ? 0x120c18 : 0x6a4a34), 0.5), cN = cG.clone().multiplyScalar(0.55), c = new THREE.Color();
    const pos = E.geo.attributes.position, col = E.geo.attributes.color;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 50;
      if (y > 0.3) c.copy(cM).lerp(cT, Math.pow((y - 0.3) / 0.7, 0.8));
      else if (y > 0) c.copy(cH).lerp(cM, y / 0.3);
      else if (y > -0.08) c.copy(cH).lerp(cG, -y / 0.08);
      else c.copy(cG).lerp(cN, Math.min(1, (-y - 0.08) * 2));
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
    E.sunM.position.copy(sunDir).multiplyScalar(44);
    E.sunM.material.color.setHex(t.sunC).multiplyScalar(t.night ? 0.8 : 1.6);
    E.mesaMat.color.setHex(t.night ? 0x1a1424 : 0x7a3a24);
    if (!E.pm) E.pm = new THREE.PMREMGenerator(renderer);
    tex = E.cache[t.name] = E.pm.fromScene(E.sc, 0.02).texture;
  }
  E.tex = tex;
  for (const m of E.mats) { m.envMap = tex; m.needsUpdate = true; }
}
