// Roads as ground-hugging ribbons with painted textures: cracked asphalt with lane markings, and
// dirt tracks with tyre ruts. Edges fade out so they sit in the sand instead of on it.
import * as THREE from 'three';
import { addToScene } from '../engine/renderer.js';
import { mulberry32 } from '../engine/util.js';
import { ground } from './terrain.js';
import { fbm } from './textures';

const W = 256, H = 512; // texture: across the road x along it

function canvasTex(paint: (x: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const x = cv.getContext('2d')!;
  paint(x);
  const t = new THREE.CanvasTexture(cv); t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}
/** Noise speckle + an alpha falloff at both edges. */
function grain(x: CanvasRenderingContext2D, seed: number, base: [number, number, number], amp: number, edge: number) {
  const img = x.getImageData(0, 0, W, H), n = fbm(256, [8, 32, 128], seed), r = mulberry32(seed);
  for (let y = 0; y < H; y++) for (let i = 0; i < W; i++) {
    const k = (y * W + i) * 4, v = 1 + (n[(y % 256) * 256 + i] - 0.5) * amp + (r() - 0.5) * amp * 0.6;
    const a = img.data[k + 3] / 255; // painted marks keep their colour; unpainted pixels get the base
    for (let c = 0; c < 3; c++) img.data[k + c] = Math.min(255, (a > 0 ? img.data[k + c] : base[c]) * v);
    const e = Math.min(i, W - 1 - i) / (W * edge), wob = (n[((y * 3) % 256) * 256 + (i % 256)] - 0.5) * 0.8;
    img.data[k + 3] = 255 * Math.max(0, Math.min(1, e + wob));
  }
  x.putImageData(img, 0, 0);
}
function asphalt() {
  return canvasTex(x => {
    const r = mulberry32(12);
    x.fillStyle = 'rgba(232,206,96,1)'; for (const o of [-5, 5]) x.fillRect(W / 2 + o - 3, 0, 6, H * 0.45); // double yellow, dashed
    x.fillStyle = 'rgba(226,222,210,1)'; for (const e of [22, W - 28]) x.fillRect(e, 0, 6, H); // edge lines
    grain(x, 31, [78, 72, 72], 0.35, 0.06);
    // cracks and patches
    x.strokeStyle = 'rgba(30,26,26,0.7)'; x.lineWidth = 1.5;
    for (let i = 0; i < 14; i++) { x.beginPath(); let px = 30 + r() * (W - 60), py = r() * H; x.moveTo(px, py); for (let k = 0; k < 6; k++) { px += (r() - 0.5) * 30; py += (r() - 0.3) * 30; x.lineTo(px, py); } x.stroke(); }
    for (let i = 0; i < 3; i++) { x.fillStyle = `rgba(${r() < 0.5 ? '50,46,48' : '96,90,88'},0.55)`; x.fillRect(40 + r() * (W - 120), r() * H, 30 + r() * 40, 20 + r() * 50); }
    // sand blown onto the shoulders
    const g = x.createLinearGradient(0, 0, W, 0); g.addColorStop(0, 'rgba(214,170,118,0.8)'); g.addColorStop(0.12, 'rgba(214,170,118,0)'); g.addColorStop(0.88, 'rgba(214,170,118,0)'); g.addColorStop(1, 'rgba(214,170,118,0.8)');
    x.globalCompositeOperation = 'source-atop'; x.fillStyle = g; x.fillRect(0, 0, W, H);
  });
}
function dirt() {
  return canvasTex(x => {
    grain(x, 41, [196, 146, 100], 0.3, 0.22);
    x.globalCompositeOperation = 'source-atop';
    for (const c of [W * 0.3, W * 0.7]) { const g = x.createLinearGradient(c - 22, 0, c + 22, 0); g.addColorStop(0, 'rgba(120,80,50,0)'); g.addColorStop(0.5, 'rgba(120,80,50,0.35)'); g.addColorStop(1, 'rgba(120,80,50,0)'); x.fillStyle = g; x.fillRect(c - 22, 0, 44, H); }
    const r = mulberry32(4); x.fillStyle = 'rgba(90,60,40,0.5)'; for (let i = 0; i < 500; i++) x.fillRect(r() * W, r() * H, 2, 2);
  });
}

/** A strip following `points` (x, z) across the ground; the texture repeats every `tile` metres. */
function ribbon(points: Array<[number, number]>, width: number, yOff: number, tile: number, mat: THREE.Material) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = []; let along = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)], [x, z] = points[i];
    if (i > 0) along += Math.hypot(x - points[i - 1][0], z - points[i - 1][1]);
    let dx = b[0] - a[0], dz = b[1] - a[1]; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const ACROSS = 6; // vertices across, so the strip follows the ground's curvature
    for (let k = 0; k <= ACROSS; k++) {
      const t = k / ACROSS - 0.5, px = x - dz * width * t, pz = z + dx * width * t;
      pos.push(px, ground(px, pz) + yOff, pz); uv.push(k / ACROSS, along / tile);
    }
    // triangles wind counter-clockwise seen from above, so they face up
    if (i > 0) for (let k = 0; k < ACROSS; k++) { const p = (i - 1) * (ACROSS + 1) + k, q = p + ACROSS + 1; idx.push(p, p + 1, q, p + 1, q + 1, q); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.renderOrder = 1; addToScene(m, 'roads'); return m;
}
// No polygon offset: it scales with depth-buffer precision, so far away it lifted the road through the
// bottom of distant cars. The ribbons sit a few centimetres above the ground instead.
const roadMat = (map: THREE.Texture, rough: number) => new THREE.MeshStandardMaterial({ map, roughness: rough, metalness: 0, transparent: true, depthWrite: false });

export function buildRoads() {
  const hw: Array<[number, number]> = []; for (let x = -214; x <= 214; x += 3) hw.push([x, 0]);
  ribbon(hw, 13, 0.05, 13, roadMat(asphalt(), 0.85));
  const mud = roadMat(dirt(), 1);
  const north: Array<[number, number]> = []; for (let z = 12; z <= 214; z += 3) north.push([4 + 12 * Math.sin(Math.max(0, z - 30) * 0.02), z]);
  const south: Array<[number, number]> = []; for (let z = -26; z >= -214; z -= 3) south.push([-18 + 10 * Math.sin((z + 26) * 0.025), z]);
  ribbon(north, 9, 0.04, 9, mud); ribbon(south, 9, 0.04, 9, mud);
}
