'use strict';
// ================= car definitions =================
const CARS = [
  { id: 'sundowner', name: 'Sundowner', driver: 'Dee Cortez', gang: 'Sun Riders', tag: '#ff8a4a', color: 0xe8662a,
    blurb: 'A big-block muscle car with a chip on its fender. Quick, balanced, and loud.',
    special: { name: 'Twin cannons', desc: 'Two heavy shells straight down the hood.' },
    hp: 150, max: 47, accel: 27, turn: 2.35, grip: 7.0, mass: 1.0, stats: { Speed: 4, Armor: 3, Handling: 4 }, ai: 'opportunist', front: 2.4, gunY: 1.25, gunX: 0.6 },
  { id: 'gravelqueen', name: 'Gravel Queen', driver: 'Ma Hollis', gang: 'Black Hats', tag: '#4fd0c0', color: 0x2f8f83,
    blurb: 'A salvage-yard pickup held together by spite and baling wire.',
    special: { name: 'Scrap bomb', desc: 'Lobs a bundle of junk that bursts into bomblets.' },
    hp: 180, max: 41, accel: 23, turn: 2.15, grip: 8.0, mass: 1.3, stats: { Speed: 3, Armor: 4, Handling: 3 }, ai: 'sniper', front: 2.55, gunY: 1.5, gunX: 0.7 },
  { id: 'moonbeam', name: 'Moonbeam', driver: 'Sky Farrow', gang: 'Sun Riders', tag: '#ffd35a', color: 0xf2b134,
    blurb: 'A painted van with a sound system strong enough to knock cars off the road.',
    special: { name: 'Good vibrations', desc: 'A sonic blast that shoves and shakes everything nearby.' },
    hp: 195, max: 37, accel: 19, turn: 1.95, grip: 7.5, mass: 1.45, stats: { Speed: 2, Armor: 5, Handling: 2 }, ai: 'rammer', front: 2.7, gunY: 1.1, gunX: 0.75 },
  { id: 'scorcher', name: 'Scorcher', driver: 'Rex Vance', gang: 'Black Hats', tag: '#ff5a4a', color: 0xb8322a,
    blurb: 'A chopped hot rod that is mostly engine. Fragile, and very hard to catch.',
    special: { name: 'Afterburner', desc: 'A flaming burst of speed that scorches anyone behind you.' },
    hp: 120, max: 53, accel: 33, turn: 2.6, grip: 6.2, mass: 0.8, stats: { Speed: 5, Armor: 2, Handling: 5 }, ai: 'rammer', front: 2.3, gunY: 1.2, gunX: 0.5 },
  { id: 'lawdog', name: 'Lawdog', driver: 'Deputy Tull', gang: 'Sun Riders', tag: '#9fc6ff', color: 0xf0ede6,
    blurb: 'A county cruiser that stopped answering the radio years ago.',
    special: { name: 'Riot gun', desc: 'A close-range spread of heavy buckshot.' },
    hp: 155, max: 45, accel: 26, turn: 2.45, grip: 8.2, mass: 1.05, stats: { Speed: 4, Armor: 3, Handling: 4 }, ai: 'opportunist', front: 2.6, gunY: 1.2, gunX: 0.6 },
  { id: 'bigchill', name: 'Big Chill', driver: 'Mister Frost', gang: 'Black Hats', tag: '#ff9fd0', color: 0xf1a7c3,
    blurb: 'An ice cream truck built like a bank vault. Slow, huge, and cold-hearted.',
    special: { name: 'Brain freeze', desc: 'An icy homing shot that slows and freezes its target.' },
    hp: 225, max: 34, accel: 17, turn: 1.8, grip: 9.0, mass: 1.65, stats: { Speed: 1, Armor: 5, Handling: 1 }, ai: 'rammer', front: 2.6, gunY: 1.3, gunX: 0.8 },
];
const CAR_BY_ID = Object.fromEntries(CARS.map(c => [c.id, c]));

// ================= car models =================
const C_GLASS = 0x33505e, C_DARK = 0x1f1b1e, C_CHROME = 0xc9c6c0, C_HEAD = 0xfff1b8, C_TAIL = 0xff2a1a;
const tireMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const WHEEL_GEO = {};
function wheelGeo(r, w) {
  const k = r + '_' + w; if (WHEEL_GEO[k]) return WHEEL_GEO[k];
  const pb = new PB();
  pb.cyl(r, r, w, 12, 0x1c1a1a, 0, 0, 0, 0, 0, Math.PI / 2);
  pb.cyl(r * 0.55, r * 0.55, w + 0.04, 8, C_CHROME, 0, 0, 0, 0, 0, Math.PI / 2);
  pb.box(w + 0.06, r * 0.25, r * 1.1, 0x8a8680, 0, 0, 0);
  return (WHEEL_GEO[k] = pb.build());
}
const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const beamGeo = (() => { const g = new THREE.ConeGeometry(3.2, 16, 12, 1, true); g.translate(0, -8, 0); g.rotateX(-Math.PI / 2); return g; })();

function buildCarModel(def) {
  const b = new PB(), L = new PB(); // body parts, emissive lights
  const P = def.color;
  let wheels = [];
  const guns = (x, y, z) => { b.box(0.13, 0.13, 0.7, 0x6a6660, x, y, z); b.box(0.13, 0.13, 0.7, 0x6a6660, -x, y, z); b.box(0.28, 0.18, 0.3, 0x4a4640, x, y - 0.1, z - 0.3); b.box(0.28, 0.18, 0.3, 0x4a4640, -x, y - 0.1, z - 0.3); };
  switch (def.id) {
    case 'sundowner':
      b.box(2.1, 0.62, 4.7, P, 0, 0.78, 0); b.box(2.14, 0.2, 3.6, C_DARK, 0, 0.52, 0);
      b.box(0.8, 0.18, 1.5, P, 0, 1.16, 1.25); b.box(0.5, 0.16, 0.45, C_DARK, 0, 1.3, 1.0);
      b.box(1.8, 0.52, 1.9, C_GLASS, 0, 1.35, -0.45); b.box(1.84, 0.1, 1.5, P, 0, 1.65, -0.55);
      b.box(0.22, 0.02, 4.72, 0xf6ead4, 0.28, 1.1, 0); b.box(0.22, 0.02, 4.72, 0xf6ead4, -0.28, 1.1, 0);
      b.box(0.22, 0.02, 1.52, 0xf6ead4, 0.28, 1.71, -0.55); b.box(0.22, 0.02, 1.52, 0xf6ead4, -0.28, 1.71, -0.55);
      b.box(2.0, 0.08, 0.45, C_DARK, 0, 1.32, -2.2); b.box(0.1, 0.22, 0.1, C_DARK, 0.8, 1.2, -2.2); b.box(0.1, 0.22, 0.1, C_DARK, -0.8, 1.2, -2.2);
      b.box(2.18, 0.18, 0.22, C_CHROME, 0, 0.6, 2.38); b.box(2.18, 0.18, 0.22, C_CHROME, 0, 0.6, -2.38); b.box(1.4, 0.28, 0.05, C_DARK, 0, 0.82, 2.36);
      b.cyl(0.08, 0.08, 0.4, 6, C_CHROME, 0.6, 0.45, -2.42, Math.PI / 2); b.cyl(0.08, 0.08, 0.4, 6, C_CHROME, -0.6, 0.45, -2.42, Math.PI / 2);
      L.box(0.36, 0.2, 0.06, C_HEAD, 0.72, 0.86, 2.37); L.box(0.36, 0.2, 0.06, C_HEAD, -0.72, 0.86, 2.37);
      L.box(0.5, 0.14, 0.06, C_TAIL, 0.7, 0.9, -2.37); L.box(0.5, 0.14, 0.06, C_TAIL, -0.7, 0.9, -2.37);
      guns(0.6, 1.2, 1.9);
      wheels = [[1.02, 0.46, 1.45, 0.46, 0.34, 1], [-1.02, 0.46, 1.45, 0.46, 0.34, 1], [1.02, 0.5, -1.45, 0.5, 0.42, 0], [-1.02, 0.5, -1.45, 0.5, 0.42, 0]];
      break;
    case 'gravelqueen':
      b.box(2.1, 0.7, 1.8, P, 0, 1.0, 1.45); b.box(2.3, 0.35, 1.2, P, 0, 0.95, 1.55);
      b.box(2.2, 0.9, 1.4, P, 0, 1.35, 0.0); b.box(2.22, 0.5, 1.0, C_GLASS, 0, 1.55, 0.05); b.box(2.24, 0.12, 1.42, P, 0, 1.86, 0);
      b.box(2.2, 0.2, 2.3, C_DARK, 0, 0.85, -1.75); b.box(0.14, 0.55, 2.3, P, 1.05, 1.2, -1.75); b.box(0.14, 0.55, 2.3, P, -1.05, 1.2, -1.75); b.box(2.2, 0.55, 0.14, P, 0, 1.2, -2.87);
      b.box(0.02, 0.35, 0.8, 0x8a4a2a, 1.16, 1.0, 1.5); b.box(0.02, 0.3, 0.6, 0x8a4a2a, -1.13, 1.25, -1.2); b.box(0.9, 0.02, 0.6, 0x8a4a2a, 0.4, 1.36, 1.8);
      b.box(0.12, 0.8, 0.12, C_CHROME, 0.95, 1.7, -0.9); b.box(0.12, 0.8, 0.12, C_CHROME, -0.95, 1.7, -0.9); b.box(2.0, 0.12, 0.12, C_CHROME, 0, 2.1, -0.9);
      b.box(0.8, 0.5, 0.6, 0x6b5a4a, 0.4, 1.2, -1.6, 0, 0.3); b.cyl(0.35, 0.35, 0.9, 8, 0x3f5a4a, -0.5, 1.15, -2.2, 0, 0, Math.PI / 2); b.box(0.5, 0.35, 0.9, 0x7a6a50, -0.4, 1.1, -1.3, 0, -0.4);
      b.box(2.3, 0.3, 0.3, C_CHROME, 0, 0.65, 2.42); b.box(0.12, 0.7, 0.12, C_CHROME, 0.6, 0.95, 2.5); b.box(0.12, 0.7, 0.12, C_CHROME, -0.6, 0.95, 2.5); b.box(1.4, 0.12, 0.12, C_CHROME, 0, 1.3, 2.5);
      L.box(0.28, 0.2, 0.2, C_HEAD, 0.5, 2.25, -0.9); L.box(0.28, 0.2, 0.2, C_HEAD, -0.5, 2.25, -0.9); L.box(0.3, 0.3, 0.06, C_HEAD, 0.78, 1.05, 2.36); L.box(0.3, 0.3, 0.06, C_HEAD, -0.78, 1.05, 2.36);
      L.box(0.2, 0.3, 0.06, C_TAIL, 0.95, 1.2, -2.95); L.box(0.2, 0.3, 0.06, C_TAIL, -0.95, 1.2, -2.95);
      guns(0.7, 1.45, 2.0);
      wheels = [[1.08, 0.52, 1.6, 0.52, 0.42, 1], [-1.08, 0.52, 1.6, 0.52, 0.42, 1], [1.08, 0.52, -1.5, 0.52, 0.42, 0], [-1.08, 0.52, -1.5, 0.52, 0.42, 0]];
      break;
    case 'moonbeam':
      b.box(2.2, 1.75, 4.5, P, 0, 1.45, 0); b.box(2.2, 0.7, 0.5, P, 0, 0.95, 2.45);
      b.box(2.0, 0.7, 0.1, C_GLASS, 0, 1.85, 2.26, -0.15); b.box(2.22, 0.55, 2.6, C_GLASS, 0, 1.9, -0.3);
      b.box(2.24, 0.35, 4.52, 0x5a2d6e, 0, 1.2, 0); b.box(2.24, 0.12, 4.52, 0xd9531e, 0, 1.45, 0); b.box(2.24, 0.1, 4.52, 0xc0392b, 0, 0.98, 0);
      b.sph(0.45, 0xf6ead4, 1.12, 1.25, -1.2, 0.1, 1, 1); b.sph(0.45, 0xf6ead4, -1.12, 1.25, -1.2, 0.1, 1, 1);
      b.box(1.8, 0.08, 2.6, C_DARK, 0, 2.4, -0.3);
      b.cyl(0.38, 0.3, 0.55, 10, 0x5a2d6e, 0.55, 2.72, 0.8, Math.PI / 2); b.cyl(0.38, 0.3, 0.55, 10, 0x5a2d6e, -0.55, 2.72, 0.8, Math.PI / 2);
      b.cyl(0.3, 0.3, 0.05, 10, 0x221a26, 0.55, 2.72, 1.08, Math.PI / 2); b.cyl(0.3, 0.3, 0.05, 10, 0x221a26, -0.55, 2.72, 1.08, Math.PI / 2);
      b.box(2.24, 0.22, 0.22, C_CHROME, 0, 0.55, 2.72); b.box(2.24, 0.22, 0.22, C_CHROME, 0, 0.55, -2.3);
      L.box(0.32, 0.32, 0.06, C_HEAD, 0.75, 0.98, 2.72); L.box(0.32, 0.32, 0.06, C_HEAD, -0.75, 0.98, 2.72);
      L.box(0.25, 0.4, 0.06, C_TAIL, 0.9, 1.3, -2.27); L.box(0.25, 0.4, 0.06, C_TAIL, -0.9, 1.3, -2.27);
      guns(0.75, 1.05, 2.5);
      wheels = [[1.05, 0.48, 1.5, 0.48, 0.38, 1], [-1.05, 0.48, 1.5, 0.48, 0.38, 1], [1.05, 0.48, -1.45, 0.48, 0.38, 0], [-1.05, 0.48, -1.45, 0.48, 0.38, 0]];
      break;
    case 'scorcher':
      b.box(1.5, 0.55, 2.8, P, 0, 0.95, -0.5); b.box(1.1, 0.25, 1.6, P, 0, 0.75, 1.4);
      b.box(0.9, 0.55, 1.0, 0x3a3a3a, 0, 1.2, 1.25); b.box(0.6, 0.3, 0.6, C_CHROME, 0, 1.6, 1.25); b.box(0.5, 0.25, 0.3, C_CHROME, 0, 1.85, 1.3);
      for (const s of [1, -1]) { for (let k = 0; k < 3; k++) b.cyl(0.07, 0.07, 0.6, 6, C_CHROME, s * 0.62, 1.05, 0.9 + k * 0.28, 0, 0, Math.PI / 2 * s * 0.6); b.cyl(0.09, 0.09, 2.2, 6, C_CHROME, s * 0.95, 0.75, -0.2, Math.PI / 2); }
      b.box(0.9, 0.6, 0.1, C_CHROME, 0, 1.0, 2.2);
      b.box(1.3, 0.45, 1.0, C_GLASS, 0, 1.42, -0.75); b.box(1.34, 0.08, 0.9, P, 0, 1.68, -0.85);
      b.box(0.02, 0.2, 1.3, 0xffb020, 0.76, 1.0, -0.2); b.box(0.02, 0.2, 1.3, 0xffb020, -0.76, 1.0, -0.2);
      b.box(0.02, 0.12, 0.9, 0xff6a1a, 0.77, 1.14, -0.05); b.box(0.02, 0.12, 0.9, 0xff6a1a, -0.77, 1.14, -0.05);
      b.cyl(0.06, 0.06, 1.9, 6, C_DARK, 0, 0.4, 1.95, 0, 0, Math.PI / 2);
      b.box(0.45, 0.12, 1.3, P, 1.05, 1.3, -1.25); b.box(0.45, 0.12, 1.3, P, -1.05, 1.3, -1.25);
      L.box(0.25, 0.25, 0.1, C_HEAD, 0.55, 1.05, 2.25); L.box(0.25, 0.25, 0.1, C_HEAD, -0.55, 1.05, 2.25);
      L.box(0.3, 0.12, 0.06, C_TAIL, 0.5, 0.95, -1.92); L.box(0.3, 0.12, 0.06, C_TAIL, -0.5, 0.95, -1.92);
      guns(0.5, 1.2, 1.9);
      wheels = [[0.95, 0.4, 1.95, 0.4, 0.28, 1], [-0.95, 0.4, 1.95, 0.4, 0.28, 1], [1.05, 0.62, -1.25, 0.62, 0.55, 0], [-1.05, 0.62, -1.25, 0.62, 0.55, 0]];
      break;
    case 'lawdog':
      b.box(2.1, 0.62, 4.9, 0x1b1b22, 0, 0.8, 0); b.box(2.14, 0.52, 1.9, 0xf0ede6, 0, 0.82, -0.2);
      b.box(1.8, 0.5, 2.1, C_GLASS, 0, 1.36, -0.35); b.box(1.84, 0.1, 1.7, 0xf0ede6, 0, 1.65, -0.4);
      b.box(0.02, 0.32, 0.32, 0xe8b02a, 1.08, 0.86, -0.2); b.box(0.02, 0.32, 0.32, 0xe8b02a, -1.08, 0.86, -0.2);
      b.box(1.6, 0.5, 0.12, C_DARK, 0, 0.8, 2.6); b.box(0.12, 0.6, 0.3, C_DARK, 0.6, 0.8, 2.5); b.box(0.12, 0.6, 0.3, C_DARK, -0.6, 0.8, 2.5);
      b.box(1.3, 0.12, 0.35, C_DARK, 0, 1.76, -0.2);
      b.cyl(0.02, 0.02, 1.2, 4, C_DARK, -0.7, 2.2, -1.8);
      b.box(2.12, 0.18, 0.2, C_CHROME, 0, 0.55, -2.48);
      L.box(0.36, 0.2, 0.06, C_HEAD, 0.72, 0.88, 2.46); L.box(0.36, 0.2, 0.06, C_HEAD, -0.72, 0.88, 2.46);
      L.box(0.45, 0.16, 0.06, C_TAIL, 0.7, 0.92, -2.46); L.box(0.45, 0.16, 0.06, C_TAIL, -0.7, 0.92, -2.46);
      guns(0.6, 1.2, 2.0);
      wheels = [[1.02, 0.46, 1.5, 0.46, 0.34, 1], [-1.02, 0.46, 1.5, 0.46, 0.34, 1], [1.02, 0.46, -1.5, 0.46, 0.34, 0], [-1.02, 0.46, -1.5, 0.46, 0.34, 0]];
      break;
    case 'bigchill':
      b.box(2.3, 1.3, 1.5, 0xf6f0f2, 0, 1.25, 1.75); b.box(2.32, 0.3, 1.52, P, 0, 0.9, 1.75); b.box(2.32, 0.5, 1.2, C_GLASS, 0, 1.65, 1.8);
      b.box(2.5, 2.3, 3.4, 0xf6f0f2, 0, 1.8, -0.75); b.box(2.52, 0.5, 3.42, P, 0, 1.2, -0.75); b.box(2.52, 0.14, 3.42, 0x7ad0e0, 0, 2.6, -0.75);
      b.box(0.04, 0.8, 1.6, C_GLASS, 1.26, 2.05, -0.6); b.box(0.7, 0.06, 1.9, 0xe8433a, 1.55, 2.62, -0.6, 0, 0, -0.35);
      b.cone(0.55, 1.3, 10, 0xd9a05a, 0, 3.6, -0.8, Math.PI); b.sph(0.62, P, 0, 4.35, -0.8, 1, 1, 1, 10, 8); b.sph(0.2, 0xe8433a, 0, 5.0, -0.8);
      b.box(2.4, 0.3, 0.3, C_CHROME, 0, 0.65, 2.55); b.box(2.5, 0.3, 0.3, C_CHROME, 0, 0.65, -2.5);
      L.box(0.34, 0.3, 0.06, C_HEAD, 0.8, 1.0, 2.52); L.box(0.34, 0.3, 0.06, C_HEAD, -0.8, 1.0, 2.52);
      L.box(0.25, 0.4, 0.06, C_TAIL, 1.0, 1.3, -2.47); L.box(0.25, 0.4, 0.06, C_TAIL, -1.0, 1.3, -2.47);
      guns(0.8, 1.3, 2.3);
      wheels = [[1.12, 0.55, 1.7, 0.55, 0.45, 1], [-1.12, 0.55, 1.7, 0.55, 0.45, 1], [1.12, 0.55, -1.5, 0.55, 0.45, 0], [-1.12, 0.55, -1.5, 0.55, 0.45, 0]];
      break;
  }
  const group = new THREE.Group(), body = new THREE.Group(); group.add(body);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x000000 });
  const bodyMesh = new THREE.Mesh(b.build(), mat); bodyMesh.castShadow = true; body.add(bodyMesh);
  const lightMesh = new THREE.Mesh(L.build(), MAT_VC_BASIC); body.add(lightMesh);
  let siren = null;
  if (def.id === 'lawdog') {
    const red = new THREE.Mesh(GEO.box, new THREE.MeshBasicMaterial({ color: 0xff2020 })); red.scale.set(0.55, 0.18, 0.3); red.position.set(-0.33, 1.9, -0.2);
    const blue = new THREE.Mesh(GEO.box, new THREE.MeshBasicMaterial({ color: 0x2050ff })); blue.scale.set(0.55, 0.18, 0.3); blue.position.set(0.33, 1.9, -0.2);
    body.add(red); body.add(blue); siren = [red, blue];
  }
  const beams = [];
  for (const sx of [-0.7, 0.7]) { const bm = new THREE.Mesh(beamGeo, beamMat); bm.position.set(sx, 0.9, def.front); bm.rotation.x = 0.06; bm.visible = false; body.add(bm); beams.push(bm); }
  const ws = [];
  for (const [x, y, z, r, w, front] of wheels) {
    const pivot = new THREE.Group(); pivot.position.set(x + Math.sign(x) * w * 0.3, y, z);
    const m = new THREE.Mesh(wheelGeo(r, w), tireMat); m.castShadow = true; pivot.add(m); group.add(pivot);
    ws.push({ pivot, mesh: m, front: !!front, r });
  }
  return { group, body, wheels: ws, mat, siren, beams, bodyMesh, lightMesh };
}
function disposeCarModel(m) {
  m.group.parent && m.group.parent.remove(m.group);
  m.bodyMesh.geometry.dispose(); m.lightMesh.geometry.dispose(); m.mat.dispose();
}

// ================= car physics =================
const _fwd = new THREE.Vector3(), _xAx = new THREE.Vector3(), _nrm = new THREE.Vector3(), _tq = new THREE.Quaternion();
class Car {
  constructor(def, isPlayer) {
    this.def = def; this.isPlayer = isPlayer;
    this.model = buildCarModel(def); this.obj = this.model.group; this.body = this.model.body; this.mat = this.model.mat;
    scene.add(this.obj);
    this.radius = 1.9; this.mass = def.mass; this.up = new THREE.Vector3(0, 1, 0);
    this.input = { throttle: 0, steer: 0, handbrake: false };
    this.reset(0, 0, 0);
  }
  reset(x, z, yaw) {
    Object.assign(this, {
      x, z, yaw, vx: 0, vz: 0, vy: 0, y: ground(x, z), prevG: ground(x, z), grounded: true, hp: this.def.hp, alive: true,
      ammo: { missile: 0, mortar: 0, mines: 0, flame: 0 }, weapon: null, special: 3, cdMG: 0, cdW: 0, cdS: 0, gunSide: 1,
      boost: 0, frozen: 0, burning: 0, burnBy: null, lastHitBy: null, lastHitTime: -99, kills: 0, dealt: 0, flash: 0,
      tumble: 0, tumbleV: 0, tumbleAxis: 0, wheelRot: 0, steerVis: 0, smokeT: 0, dustT: 0, flameOn: false, mgHeld: false, wHeld: false, wFire: false, wCombo: 0, sFire: false,
      airT: 0, deathTime: 0, wreckT: 0, lean: 0, pitch: 0, lastVF: 0, place: 0, stuckT: 0, resetCd: 0,
    });
    this.input.throttle = 0; this.input.steer = 0; this.input.handbrake = false;
    this.up.set(0, 1, 0);
    this.obj.visible = true; this.mat.color.setRGB(1, 1, 1); this.mat.emissive.setRGB(0, 0, 0);
    for (const w of this.model.wheels) w.pivot.visible = true;
    this.body.rotation.set(0, 0, 0);
    this.syncModel(1);
  }
  get speed() { return Math.hypot(this.vx, this.vz); }
  get fx() { return Math.sin(this.yaw); }
  get fz() { return Math.cos(this.yaw); }
  update(dt) {
    const d = this.def, inp = this.input;
    this.flash = Math.max(0, this.flash - dt * 5);
    if (this.boost > 0) this.boost -= dt; if (this.frozen > 0) this.frozen -= dt; this.resetCd -= dt;
    if (!this.alive) { inp.throttle = 0; inp.steer = 0; inp.handbrake = true; }
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), rx = -fz, rz = fx;
    let vF = this.vx * fx + this.vz * fz, vL = this.vx * rx + this.vz * rz;
    let maxS = d.max * (this.frozen > 0 ? 0.45 : 1) * (this.speedK || 1); if (this.boost > 0) maxS *= 1.7;
    if (this.grounded) {
      const thr = inp.throttle;
      if (this.boost > 0) vF += d.accel * 2.4 * dt;
      else if (thr > 0.05) { if (vF < maxS) vF += d.accel * thr * dt * (vF < 0 ? 2.2 : 1); }
      else if (thr < -0.05) { if (vF > 0.5) vF += 44 * thr * dt; else if (vF > -17) vF += d.accel * 0.75 * thr * dt; }
      else vF *= Math.max(0, 1 - 0.7 * dt);
      if (vF > maxS) vF = lerp(vF, maxS, 1 - Math.exp(-3 * dt));
      const gF = ground(this.x + fx, this.z + fz), gB = ground(this.x - fx, this.z - fz);
      vF -= (gF - gB) * 0.5 * GRAV * 0.5 * dt;
      const hb = inp.handbrake;
      vL *= Math.max(0, 1 - (hb ? 1.3 : d.grip) * dt);
      if (hb) vF *= Math.max(0, 1 - (this.alive ? 0.5 : 2.5) * dt);
      const sp = Math.abs(vF);
      const sf = clamp(sp / 7, 0, 1) * (1 - 0.3 * clamp(sp / d.max, 0, 1)) * (hb ? 1.5 : 1) * (this.frozen > 0 ? 0.6 : 1);
      this.yaw -= inp.steer * d.turn * sf * (vF < -0.5 ? -1 : 1) * dt;
      // drift dust
      if (this.alive && (sp > 14 || Math.abs(vL) > 5)) {
        this.dustT -= dt * (sp / 20 + Math.abs(vL) / 6);
        if (this.dustT <= 0) {
          this.dustT = 0.06 / fxScale;
          const bx = this.x - fx * 1.6, bz = this.z - fz * 1.6;
          FX_SMOKE.spawn(bx + rx * rand(-1, 1), this.y + 0.3, bz + rz * rand(-1, 1), -this.vx * 0.1 + rand(-1, 1), rand(0.5, 2), -this.vz * 0.1 + rand(-1, 1), rand(0.7, 1.3), 1, 3.5 + Math.abs(vL) * 0.2, curTod.night ? 0x6a5a6a : 0xd8a878, curTod.night ? 0x4a3a50 : 0xe8c090, Math.abs(vL) > 5 ? 0.5 : 0.28, 1.2, -0.5);
        }
      }
    } else {
      this.yaw -= inp.steer * d.turn * 0.3 * dt;
      vF *= 1 - 0.04 * dt;
    }
    this.vx = fx * vF + rx * vL; this.vz = fz * vF + rz * vL;
    this.accelVis = (vF - this.lastVF) / Math.max(dt, 0.001); this.lastVF = vF;
    // horizontal move with step check
    let nx = this.x + this.vx * dt, nz = this.z + this.vz * dt;
    let impact = 0;
    if (ground(nx, nz) - this.y > 1.3) {
      if (ground(nx, this.z) - this.y <= 1.3) { impact = Math.abs(this.vz); nz = this.z; this.vz *= -0.3; }
      else if (ground(this.x, nz) - this.y <= 1.3) { impact = Math.abs(this.vx); nx = this.x; this.vx *= -0.3; }
      else { impact = this.speed; nx = this.x; nz = this.z; this.vx *= -0.3; this.vz *= -0.3; }
    }
    this.x = nx; this.z = nz;
    impact = Math.max(impact, resolveStatic(this), resolveProps(this));
    if (impact > 22 && this.alive) {
      damageCar(this, (impact - 22) * 0.3, null, 'wall');
      sparks(this.x + fx * 2, this.y + 0.8, this.z + fz * 2, 8);
      playSfx('clank', this.x, this.z, 0.7);
      if (this.isPlayer) shake(this.x, this.z, 0.3);
    }
    // vertical
    const g = ground(this.x, this.z);
    this.vy -= GRAV * dt; this.y += this.vy * dt;
    if (this.y <= g) {
      if (this.airT > 0.35) this.land();
      this.y = g; this.vy = clamp((g - this.prevG) / Math.max(dt, 0.001), -12, 30);
      this.grounded = true; this.airT = 0;
    } else {
      this.grounded = this.y - g < 0.3;
      if (!this.grounded) this.airT += dt;
    }
    this.prevG = g;
    // tumble
    if (!this.grounded) this.tumble += this.tumbleV * dt;
    else if (this.tumble !== 0) { const tgt = Math.round(this.tumble / TAU) * TAU; this.tumble = lerp(this.tumble, tgt, 1 - Math.exp(-14 * dt)); if (Math.abs(this.tumble - tgt) < 0.02) { this.tumble = 0; this.tumbleV = 0; } }
    // orientation
    if (this.grounded) {
      const e = 1.3; const hx = ground(this.x + e, this.z) - ground(this.x - e, this.z), hz = ground(this.x, this.z + e) - ground(this.x, this.z - e);
      _nrm.set(-hx, 2 * e, -hz).normalize(); this.up.lerp(_nrm, 1 - Math.exp(-12 * dt)).normalize();
    } else {
      _nrm.set(0, 1, 0); _nrm.x -= Math.sin(this.yaw) * clamp(this.vy * 0.012, -0.4, 0.4); _nrm.z -= Math.cos(this.yaw) * clamp(this.vy * 0.012, -0.4, 0.4);
      this.up.lerp(_nrm.normalize(), 1 - Math.exp(-2.5 * dt)).normalize();
    }
    // visuals
    const leanT = this.alive && this.grounded ? -inp.steer * clamp(Math.abs(vF) / d.max, 0, 1) * 0.07 : 0;
    this.lean = lerp(this.lean, leanT, 1 - Math.exp(-6 * dt));
    this.pitch = lerp(this.pitch, clamp(-this.accelVis * 0.0025, -0.06, 0.06), 1 - Math.exp(-5 * dt));
    this.wheelRot += vF * dt / 0.48;
    this.steerVis = lerp(this.steerVis, -inp.steer * 0.45, 1 - Math.exp(-10 * dt));
    this.syncModel(dt);
    this.effects(dt);
  }
  land() {
    const hard = -this.vy;
    for (let i = 0; i < 12 * fxScale; i++) FX_SMOKE.spawn(this.x + rand(-2, 2), this.y + 0.2, this.z + rand(-2, 2), rand(-6, 6), rand(0.5, 3), rand(-6, 6), rand(0.7, 1.2), 1.5, 5, curTod.night ? 0x5a4a5a : 0xd8a878, curTod.night ? 0x3a2a40 : 0xe8c090, 0.45, 2, -0.3);
    playSfx('thud', this.x, this.z, clamp(hard / 20, 0.3, 1));
    if (hard > 26 && this.alive) damageCar(this, (hard - 26) * 0.5, null, 'fall');
    if (this.isPlayer) shake(this.x, this.z, clamp(hard / 40, 0.1, 0.5));
  }
  syncModel(dt) {
    _fwd.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const u = this.up; _fwd.addScaledVector(u, -_fwd.dot(u)).normalize();
    _xAx.crossVectors(u, _fwd).normalize();
    _m4.makeBasis(_xAx, u, _fwd); this.obj.quaternion.setFromRotationMatrix(_m4);
    this.obj.position.set(this.x, this.y, this.z);
    this.body.rotation.set(this.pitch + (this.tumbleAxis === 0 ? this.tumble : 0), 0, this.lean + (this.tumbleAxis === 1 ? this.tumble : 0));
    this.body.position.y = 0.04 * Math.sin(this.wheelRot * 0.37) * (this.grounded ? clamp(this.speed / 30, 0, 1) : 0);
    for (const w of this.model.wheels) { w.mesh.rotation.x = this.wheelRot * 0.48 / w.r; if (w.front) w.pivot.rotation.y = this.steerVis; }
  }
  effects(dt) {
    const hpF = this.hp / this.def.hp;
    // flash / freeze tint
    const e = this.mat.emissive;
    if (this.frozen > 0) e.setRGB(0.15 + this.flash, 0.35 + this.flash, 0.6 + this.flash);
    else if (this.burning > 0) e.setRGB(0.35 + this.flash, 0.12 + this.flash, 0.02 + this.flash);
    else e.setRGB(this.flash, this.flash * 0.9, this.flash * 0.8);
    if (this.alive) { const k = 0.45 + 0.55 * clamp(hpF * 1.4, 0, 1); this.mat.color.setRGB(k, k, k); }
    if (this.model.siren) { const on = (performance.now() / 180 | 0) % 2 === 0; this.model.siren[0].visible = on; this.model.siren[1].visible = !on; }
    this.smokeT -= dt;
    const top = this.y + 1.4;
    if (!this.alive) {
      this.wreckT += dt;
      if (this.smokeT <= 0) {
        this.smokeT = 0.09 / fxScale;
        if (this.wreckT < 7) FX_ADD.spawn(this.x + rand(-0.8, 0.8), top, this.z + rand(-0.8, 0.8), rand(-1, 1), rand(3, 6), rand(-1, 1), rand(0.35, 0.6), 1.6, 0.3, 0xffc050, 0xff3010, 0.85, 1, -2);
        FX_SMOKE.spawn(this.x + rand(-0.5, 0.5), top + 0.8, this.z + rand(-0.5, 0.5), rand(-1, 1), rand(3, 5), rand(-1, 1), rand(2, 3), 1.5, 6, 0x2a2228, 0x6a5a60, 0.55, 0.3, -1);
      }
      return;
    }
    if (this.burning > 0) {
      this.burning -= dt; damageCar(this, 5 * dt, this.burnBy, 'burn', true);
      if (Math.random() < 0.6 * fxScale) FX_ADD.spawn(this.x + rand(-1, 1), top, this.z + rand(-1, 1), this.vx * 0.5, rand(2, 5), this.vz * 0.5, rand(0.3, 0.5), 1.4, 0.3, 0xffd060, 0xff4010, 0.9, 1, -2);
    }
    if (this.frozen > 0 && Math.random() < 0.4 * fxScale) FX_ADD.spawn(this.x + rand(-1.2, 1.2), this.y + rand(0.5, 2), this.z + rand(-1.2, 1.2), 0, rand(-1, 1), 0, 0.6, 0.5, 0.1, 0xbfefff, 0x4fa0ff, 0.8, 0, 0);
    if (hpF < 0.6 && this.smokeT <= 0) {
      this.smokeT = (hpF < 0.3 ? 0.07 : 0.14) / fxScale;
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      const hx = this.x + fx * 1.4, hz = this.z + fz * 1.4;
      FX_SMOKE.spawn(hx, this.y + 1.2, hz, rand(-0.5, 0.5) - this.vx * 0.15, rand(2, 4), rand(-0.5, 0.5) - this.vz * 0.15, rand(1.2, 2), 0.8, 3.5, hpF < 0.3 ? 0x2a2228 : 0x8a8288, hpF < 0.3 ? 0x5a5055 : 0xb8b0b0, 0.5, 0.5, -1);
      if (hpF < 0.3) FX_ADD.spawn(hx + rand(-0.3, 0.3), this.y + 1.2, hz + rand(-0.3, 0.3), 0, rand(2, 4), 0, rand(0.25, 0.4), 1, 0.2, 0xffd060, 0xff3010, 0.9, 0, -2);
    }
    if (this.boost > 0) {
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      for (let i = 0; i < 3 * fxScale; i++) FX_ADD.spawn(this.x - fx * 2.2 + rand(-0.4, 0.4), this.y + 0.8, this.z - fz * 2.2 + rand(-0.4, 0.4), -fx * 30 + this.vx * 0.6 + rand(-3, 3), rand(-1, 2), -fz * 30 + this.vz * 0.6 + rand(-3, 3), rand(0.2, 0.4), 1.2, 2.6, 0xfff0a0, 0xff3a10, 0.9, 1, 0);
    }
    // headlight beams at night
    for (const bm of this.model.beams) bm.visible = curTod.night;
  }
  wreck() {
    this.alive = false; this.hp = 0; this.deathTime = G.time; this.wreckT = 0;
    this.mat.color.setRGB(0.18, 0.16, 0.15); this.mat.emissive.setRGB(0, 0, 0); this.frozen = 0; this.burning = 0; this.boost = 0;
    this.vy = 14; this.grounded = false; this.y += 0.2; this.tumbleV = rand(4, 7) * (Math.random() < 0.5 ? -1 : 1); this.tumbleAxis = Math.random() < 0.5 ? 0 : 1;
    for (const w of this.model.wheels) {
      if (Math.random() < 0.6) {
        w.pivot.visible = false; w.pivot.getWorldPosition(_v1);
        spawnDebris(_v1.x, _v1.y, _v1.z, rand(-10, 10), rand(8, 16), rand(-10, 10), w.r * 1.8, 0x1c1a1a, rand(3, 5));
      }
    }
    for (const bm of this.model.beams) bm.visible = false;
    if (this.model.siren) { this.model.siren[0].visible = false; this.model.siren[1].visible = false; }
  }
  worldPoint(lx, ly, lz, out) { return out.set(lx, ly, lz).applyQuaternion(this.obj.quaternion).add(this.obj.position); }
  worldDir(lx, ly, lz, out) { return out.set(lx, ly, lz).applyQuaternion(this.obj.quaternion).normalize(); }
}
function resolveProps(c) {
  let impact = 0;
  for (const p of PROPS) {
    if (!p.alive) continue;
    const dx = c.x - p.x, dz = c.z - p.z, R = c.radius + p.r, d2 = dx * dx + dz * dz;
    if (d2 >= R * R || c.y > p.y + p.h) continue;
    if (p.breakOnRam && c.speed > p.breakOnRam) { breakProp(p, c, c.vx, c.vz); c.vx *= 0.88; c.vz *= 0.88; continue; }
    const d = Math.sqrt(d2) || 0.01, nx = dx / d, nz = dz / d;
    c.x = p.x + nx * R; c.z = p.z + nz * R;
    const hit = pushOut(c, nx, nz, 0.3); impact = Math.max(impact, hit * 0.8);
    if (hit > 10) damageProp(p, hit * 1.2, c);
  }
  return impact;
}
function collideCars(cars) {
  for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
    const a = cars[i], b = cars[j];
    if (Math.abs(a.y - b.y) > 2.6) continue;
    const dx = b.x - a.x, dz = b.z - a.z, R = a.radius + b.radius, d2 = dx * dx + dz * dz;
    if (d2 >= R * R) continue;
    const d = Math.sqrt(d2) || 0.01, nx = dx / d, nz = dz / d, pen = R - d;
    const ma = a.alive ? a.mass : a.mass * 3, mb = b.alive ? b.mass : b.mass * 3, im = 1 / ma + 1 / mb;
    a.x -= nx * pen * (1 / ma) / im; a.z -= nz * pen * (1 / ma) / im; b.x += nx * pen * (1 / mb) / im; b.z += nz * pen * (1 / mb) / im;
    const vn = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
    if (vn < 0) {
      const jimp = -(1.35) * vn / im;
      a.vx -= jimp * nx / ma; a.vz -= jimp * nz / ma; b.vx += jimp * nx / mb; b.vz += jimp * nz / mb;
      const sp = -vn;
      if (sp > 12) {
        // who rammed whom: whoever was moving toward the other faster
        const aTo = a.vx * nx + a.vz * nz, bTo = -(b.vx * nx + b.vz * nz);
        const base = Math.min(30, (sp - 12) * 0.45);
        const aBoost = a.boost > 0 ? 2 : 1, bBoost = b.boost > 0 ? 2 : 1;
        if (b.alive) damageCar(b, base * (a.mass / b.mass) * aBoost * (aTo >= bTo ? 1 : 0.6), a.alive ? a : null, 'ram');
        if (a.alive) damageCar(a, base * (b.mass / a.mass) * bBoost * (bTo > aTo ? 1 : 0.6), b.alive ? b : null, 'ram');
        sparks(a.x + nx * a.radius, (a.y + b.y) / 2 + 0.8, a.z + nz * a.radius, 10 + sp * 0.3);
        playSfx('clank', a.x, a.z, clamp(sp / 25, 0.3, 1));
        if (a.isPlayer || b.isPlayer) shake(a.x, a.z, clamp(sp / 40, 0.15, 0.6));
      }
    }
  }
}
