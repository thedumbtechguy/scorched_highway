import * as THREE from 'three';

// ================= utilities =================
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = a => a[(Math.random() * a.length) | 0];
export const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
export function angDiff(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }
export function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export const srand = mulberry32(1977);
export const isTouch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || ('ontouchstart' in window);
export function store(k, v) { try { localStorage.setItem('shwy_' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable (private mode) */ } }
export function loadStore(k, d) { try { const v = localStorage.getItem('shwy_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
export const $ = s => document.querySelector(s);
export const GRAV = 34;
export const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _m4 = new THREE.Matrix4(), _q1 = new THREE.Quaternion();
