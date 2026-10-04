// Procedural, tileable textures for the desert, drawn once on canvases at startup.
import * as THREE from 'three';
import { mulberry32 } from '../engine/util.js';

type Field = Float32Array; // size*size values, roughly 0..1

/** Tileable value noise: `period` cells across the texture, smooth-interpolated. */
function valueNoise(size: number, period: number, seed: number): Field {
  const r = mulberry32(seed), grid = new Float32Array(period * period).map(() => r());
  const out = new Float32Array(size * size), k = period / size;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const fx = x * k, fy = y * k, x0 = Math.floor(fx), y0 = Math.floor(fy);
    let tx = fx - x0, ty = fy - y0; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
    const x1 = (x0 + 1) % period, y1 = (y0 + 1) % period;
    const a = grid[y0 * period + x0], b = grid[y0 * period + x1], c = grid[y1 * period + x0], d = grid[y1 * period + x1];
    out[y * size + x] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  }
  return out;
}
/** Fractal sum of tileable noise octaves, normalised to 0..1. */
export function fbm(size: number, periods: number[], seed: number, gain = 0.5): Field {
  const out = new Float32Array(size * size); let amp = 1, total = 0;
  periods.forEach((p, i) => { const n = valueNoise(size, p, seed + i * 101); for (let j = 0; j < out.length; j++) out[j] += n[j] * amp; total += amp; amp *= gain; });
  for (let j = 0; j < out.length; j++) out[j] /= total;
  return out;
}
export function toTexture(size: number, paint: (img: ImageData) => void, repeat = true): THREE.CanvasTexture {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const ctx = cv.getContext('2d')!, img = ctx.createImageData(size, size);
  paint(img); ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 8;
  return t;
}
/** Encode a height field as a tangent-space normal map. */
function heightToNormal(h: Field, size: number, strength: number): THREE.CanvasTexture {
  return toTexture(size, img => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const l = h[y * size + (x + size - 1) % size], r = h[y * size + (x + 1) % size];
      const u = h[((y + size - 1) % size) * size + x], d = h[((y + 1) % size) * size + x];
      let nx = (l - r) * strength, ny = (d - u) * strength, nz = 1; const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
      const i = (y * size + x) * 4; img.data[i] = (nx * 0.5 + 0.5) * 255; img.data[i + 1] = (ny * 0.5 + 0.5) * 255; img.data[i + 2] = (nz * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
    }
  });
}

const cache: Record<string, THREE.Texture> = {};
const once = <T extends THREE.Texture>(key: string, make: () => T): T => (cache[key] as T) || (cache[key] = make());

/** Sand albedo detail: near-white so vertex colours set the hue; grain, pebbles and soft blotches. */
export const sandTexture = () => once('sand', () => {
  const S = 512, n = fbm(S, [4, 8, 32, 128], 11), r = mulberry32(5);
  return toTexture(S, img => {
    for (let i = 0; i < S * S; i++) {
      const g = 0.8 + n[i] * 0.2 + (r() - 0.5) * 0.07;
      img.data[i * 4] = Math.min(255, g * 250); img.data[i * 4 + 1] = Math.min(255, g * 240); img.data[i * 4 + 2] = Math.min(255, g * 228); img.data[i * 4 + 3] = 255;
    }
    for (let k = 0; k < 2600; k++) { // pebbles
      const x = (r() * S) | 0, y = (r() * S) | 0, rad = r() < 0.9 ? 1 : 2, tone = r() < 0.6 ? 0.62 : 1.12, red = r() < 0.4 ? 1.12 : 1;
      for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
        if (dx * dx + dy * dy > rad * rad + 0.5) continue;
        const i = (((y + dy + S) % S) * S + (x + dx + S) % S) * 4;
        img.data[i] = Math.min(255, img.data[i] * tone * red); img.data[i + 1] *= tone; img.data[i + 2] *= tone * 0.95;
      }
    }
  });
});
/** Wind ripples and grain as a normal map. */
export const sandNormal = () => once('sandN', () => {
  const S = 512, warp = fbm(S, [3, 6], 21), grain = fbm(S, [64, 128, 256], 22), h = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, ph = (x / S * 16 + y / S * 5 + warp[i] * 3) * Math.PI * 2;
    const rip = Math.pow(0.5 + 0.5 * Math.sin(ph), 1.6); // sharper crests, soft troughs
    h[i] = rip * 0.35 + grain[i] * 0.65;
  }
  return heightToNormal(h, S, 6);
});
/** Rock detail: grainy, cracked, greyscale around 0.5 (shader scales it). */
export const rockTexture = () => once('rock', () => {
  const S = 512, n = fbm(S, [4, 8, 16, 64, 128], 31, 0.55), c = fbm(S, [6, 12], 32), r = mulberry32(9);
  return toTexture(S, img => {
    for (let i = 0; i < S * S; i++) {
      const crack = Math.abs(c[i] - 0.5) < 0.012 ? 0.55 : 1;
      const v = (0.3 + n[i] * 0.55 + (r() - 0.5) * 0.08) * crack * 255;
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
    }
  });
});
/** Sandstone strata: a vertical strip of colour bands, sampled by world height. */
export const strataTexture = () => once('strata', () => {
  const H = 256, r = mulberry32(1977);
  const pal = ['#b8623a', '#c97848', '#a4532f', '#d39364', '#934634', '#c06c40', '#a65a3c', '#dcab80', '#8a4634', '#b86a42'];
  const cv = document.createElement('canvas'); cv.width = 4; cv.height = H; const x = cv.getContext('2d')!;
  let y = 0;
  while (y < H) {
    const h = 2 + Math.floor(r() * r() * 26); x.fillStyle = pal[Math.floor(r() * pal.length)]; x.fillRect(0, y, 4, h);
    if (r() < 0.3) { x.fillStyle = 'rgba(60,24,16,0.25)'; x.fillRect(0, y, 4, 1); } // thin dark seams
    y += h;
  }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter;
  return t;
});
