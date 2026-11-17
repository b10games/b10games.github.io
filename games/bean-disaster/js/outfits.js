// Everything a bean can wear: colours (free), patterns, eyes, hats and outfits. Prices are in coins,
// which you earn by surviving disasters. The 3D pieces are built here and hung on the bean.
import { THREE } from './engine.js';

export const PALETTE = ['#ff4d6d', '#ff8c42', '#ffd23f', '#7bd389', '#2ec4b6', '#3a86ff', '#8338ec', '#ff6fd8',
  '#f8f9fa', '#343a40', '#a0522d', '#00e5ff', '#b8f35b', '#ff9ebb', '#c77dff', '#ffb703'];
export const PATTERNS = [
  { id: 'solid', name: 'Plain', price: 0 }, { id: 'stripes', name: 'Stripes', price: 0 }, { id: 'dots', name: 'Dots', price: 0 },
  { id: 'split', name: 'Half and Half', price: 40 }, { id: 'zigzag', name: 'Zigzag', price: 50 }, { id: 'gradient', name: 'Fade', price: 60 },
  { id: 'stars', name: 'Stars', price: 80 }, { id: 'hearts', name: 'Hearts', price: 80 }
];
export const EYES = [
  { id: 'round', name: 'Round', price: 0 }, { id: 'happy', name: 'Happy', price: 0 }, { id: 'sparkle', name: 'Sparkle', price: 0 },
  { id: 'wink', name: 'Wink', price: 40 }, { id: 'sleepy', name: 'Sleepy', price: 40 }, { id: 'cool', name: 'Shades', price: 120 }
];
export const HATS = [
  { id: 'none', name: 'No Hat', price: 0 }, { id: 'cap', name: 'Cap', price: 0 }, { id: 'beanie', name: 'Beanie', price: 0 },
  { id: 'hardhat', name: 'Hard Hat', price: 60 }, { id: 'party', name: 'Party Hat', price: 60 }, { id: 'cat', name: 'Cat Ears', price: 80 },
  { id: 'bunny', name: 'Bunny Ears', price: 80 }, { id: 'flower', name: 'Flower', price: 90 }, { id: 'umbrella', name: 'Umbrella Hat', price: 120 },
  { id: 'cowboy', name: 'Cowboy Hat', price: 150 }, { id: 'horns', name: 'Horns', price: 150 }, { id: 'tophat', name: 'Top Hat', price: 200 },
  { id: 'propeller', name: 'Propeller', price: 250 }, { id: 'halo', name: 'Halo', price: 350 }, { id: 'crown', name: 'Crown', price: 500 }
];
export const OUTFITS = [
  { id: 'none', name: 'No Outfit', price: 0 },
  { id: 'swimring', name: 'Swim Ring', price: 60 }, { id: 'raincoat', name: 'Raincoat', price: 90 }, { id: 'ninja', name: 'Ninja', price: 100 },
  { id: 'chef', name: 'Chef', price: 120 }, { id: 'tuxedo', name: 'Tuxedo', price: 150 }, { id: 'superhero', name: 'Superhero', price: 200 },
  { id: 'pirate', name: 'Pirate', price: 200 }, { id: 'bee', name: 'Bee', price: 220 }, { id: 'diver', name: 'Diver', price: 250 },
  { id: 'firefighter', name: 'Firefighter', price: 280 }, { id: 'dino', name: 'Dino', price: 320 }, { id: 'knight', name: 'Knight', price: 380 },
  { id: 'robot', name: 'Robot', price: 420 }, { id: 'wizard', name: 'Wizard', price: 450 }, { id: 'astronaut', name: 'Astronaut', price: 600 }
];
// outfits that cover the head (the hat is hidden while you wear them)
export const COVERS_HEAD = new Set(['astronaut', 'firefighter', 'dino', 'wizard', 'robot', 'pirate', 'raincoat', 'chef', 'knight']);

export function randomSkin(r = Math.random, cheap = true) {
  const pick = (list, maxPrice) => { const l = list.filter(x => x.price <= maxPrice); return l[Math.floor(r() * l.length)].id; };
  const p = PALETTE, rich = cheap ? 0 : 1e9;
  return { c1: p[Math.floor(r() * p.length)], c2: p[Math.floor(r() * p.length)], pattern: pick(PATTERNS, cheap ? 80 : rich), eyes: pick(EYES, cheap ? 40 : rich),
    hat: r() < 0.5 ? 'none' : pick(HATS, cheap ? 150 : rich), outfit: r() < 0.45 ? 'none' : pick(OUTFITS, cheap ? 320 : rich) };
}

// ---------- building ----------
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, map: o.map || null, roughness: o.rough ?? 0.55, metalness: o.metal ?? 0, emissive: o.emissive || 0x000000, emissiveIntensity: o.ei ?? 1, transparent: o.opacity !== undefined, opacity: o.opacity ?? 1, side: o.double ? THREE.DoubleSide : THREE.FrontSide, depthWrite: o.opacity === undefined });
function piece(g, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(sx, sy, sz); m.castShadow = true; g.add(m); return m;
}
function arcAround(r, h, front, width) { return new THREE.CylinderGeometry(r, r, h, 24, 1, true, front - width / 2, width); }
const FRONT = 0;   // angle 0 points at +z, the face
// the bean's body is a capsule: radius 0.45, straight from y -0.14 to 0.24 (in the hips' frame)
export const bodyR = y => { const d = Math.abs(y - 0.05) - 0.19; return d <= 0 ? 0.45 : Math.sqrt(Math.max(0, 0.2025 - d * d)); };
// cloth that hugs the body from y0 to y1, around angle `front` with this width (Math.PI * 2 = all round)
function shell(y0, y1, front = 0, width = Math.PI * 2, extra = 0.015) {
  const pts = []; for (let i = 0; i <= 10; i++) { const y = y0 + (y1 - y0) * i / 10; pts.push(new THREE.Vector2(bodyR(y) + extra, y)); }
  return new THREE.LatheGeometry(pts, 28, front - width / 2, width);
}

// Hats sit on top of the head (the hat group is at the top of the bean).
export function buildHat(g, type, c2, limbMat) {
  const white = std(0xffffff, { rough: 0.3 }), black = std(0x111111, { rough: 0.4 }), gold = std(0xffd23f, { metal: 0.6, rough: 0.3, emissive: 0x332200 });
  const col = std(c2, { rough: 0.5 });
  switch (type) {
    case 'cap': piece(g, new THREE.SphereGeometry(0.36, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), col, 0, -0.08, 0); piece(g, new THREE.BoxGeometry(0.42, 0.04, 0.3), col, 0, -0.07, 0.36); break;
    case 'beanie': piece(g, new THREE.SphereGeometry(0.38, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), col, 0, -0.1, 0); piece(g, new THREE.TorusGeometry(0.37, 0.06, 8, 24), std(0xffffff), 0, -0.08, 0, Math.PI / 2); piece(g, new THREE.SphereGeometry(0.09, 10, 8), std(0xffffff), 0, 0.3, 0); break;
    case 'hardhat': { const y = std(0xffc300, { rough: 0.35 }); piece(g, new THREE.SphereGeometry(0.38, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), y, 0, -0.08, 0); piece(g, new THREE.CylinderGeometry(0.46, 0.46, 0.03, 24), y, 0, -0.08, 0.04); piece(g, new THREE.BoxGeometry(0.06, 0.06, 0.62), y, 0, 0.27, 0); break; }
    case 'party': { const m = std(c2, { rough: 0.4 }); piece(g, new THREE.ConeGeometry(0.2, 0.5, 18), m, 0.05, 0.18, 0, 0, 0, -0.15); piece(g, new THREE.SphereGeometry(0.07, 10, 8), std(0xffd23f), 0.09, 0.44, 0); break; }
    case 'bunny': for (const s of [-1, 1]) piece(g, new THREE.CapsuleGeometry(0.07, 0.36, 4, 8), white, 0.14 * s, 0.22, 0, 0, 0, -0.18 * s); break;
    case 'horns': for (const s of [-1, 1]) piece(g, new THREE.ConeGeometry(0.08, 0.3, 10), std(0xfff3e0), 0.2 * s, 0.05, 0, 0, 0, -0.5 * s); break;
    case 'halo': { const h = piece(g, new THREE.TorusGeometry(0.26, 0.04, 8, 24), gold, 0, 0.28, 0, Math.PI / 2); h.userData.spin = 1; break; }
    case 'tophat': piece(g, new THREE.CylinderGeometry(0.36, 0.36, 0.04, 20), black, 0, -0.03, 0); piece(g, new THREE.CylinderGeometry(0.22, 0.24, 0.42, 20), black, 0, 0.18, 0); piece(g, new THREE.CylinderGeometry(0.245, 0.245, 0.07, 20), col, 0, 0.02, 0); break;
    case 'crown': piece(g, new THREE.CylinderGeometry(0.24, 0.24, 0.16, 8, 1, true), gold, 0, 0.02, 0); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; piece(g, new THREE.ConeGeometry(0.05, 0.12, 6), gold, Math.cos(a) * 0.24, 0.15, Math.sin(a) * 0.24); } break;
    case 'propeller': { piece(g, new THREE.SphereGeometry(0.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), col, 0, -0.06, 0); const p = new THREE.Group(); p.position.y = 0.3; p.userData.spin = 12; for (const s of [0, Math.PI]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.08), std(0xff4d6d)); b.rotation.y = s; p.add(b); } g.add(p); piece(g, new THREE.CylinderGeometry(0.02, 0.02, 0.1, 6), black, 0, 0.25, 0); break; }
    case 'cat': for (const s of [-1, 1]) piece(g, new THREE.ConeGeometry(0.1, 0.2, 4), limbMat, 0.2 * s, 0.05, 0, 0, 0, -0.35 * s); break;
    case 'flower': { const pink = std(0xff6fd8); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; piece(g, new THREE.SphereGeometry(0.07, 8, 6), pink, 0.18 + Math.cos(a) * 0.1, 0.05 + Math.sin(a) * 0.1, 0.1); } piece(g, new THREE.SphereGeometry(0.06, 8, 6), std(0xffd23f), 0.18, 0.05, 0.13); break; }
    case 'umbrella': {
      const canopy = new THREE.Group(); canopy.position.y = 0.55; canopy.userData.spin = 0.6; g.add(canopy);
      const cols = [0xff4d6d, 0xffffff, 0x3a86ff, 0xffffff, 0xffd23f, 0xffffff];
      for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.26, 3, 1, true, i * Math.PI / 3, Math.PI / 3), std(cols[i], { double: true })); m.castShadow = true; canopy.add(m); }
      piece(g, new THREE.CylinderGeometry(0.018, 0.018, 0.6, 6), black, 0, 0.27, 0); piece(g, new THREE.TorusGeometry(0.2, 0.025, 6, 16), std(0x555555), 0, -0.02, 0, Math.PI / 2); break;
    }
    case 'cowboy': { const brown = std(0x8b5a2b, { rough: 0.8 }); piece(g, new THREE.CylinderGeometry(0.56, 0.56, 0.035, 24), brown, 0, -0.02, 0, 0, 0, 0, 1, 1, 0.9); piece(g, new THREE.CylinderGeometry(0.24, 0.29, 0.3, 18), brown, 0, 0.13, 0); piece(g, new THREE.CylinderGeometry(0.295, 0.295, 0.06, 18), black, 0, 0.03, 0); break; }
  }
}

// Outfits hang on the body (the pivot: hips at the middle of the bean, face toward +z).
export function buildOutfit(g, type, ch) {
  const c1 = ch.skin.c1, c2 = ch.skin.c2;
  const white = std(0xffffff, { rough: 0.5 }), black = std(0x1a1a1a, { rough: 0.5 }), red = std(0xe63946, { rough: 0.5 });
  const metal = std(0xc9d1d9, { metal: 0.7, rough: 0.3 }), gold = std(0xffd23f, { metal: 0.6, rough: 0.3 });
  const legs = ch.legs, arms = ch.arms;
  const onLegs = (geo, mat, x, y, z) => legs.forEach(l => { const m = piece(new THREE.Group(), geo, mat, x, y, z); l.add(m); g.userData.extra.push(m); });
  const onArms = (geo, mat, x, y, z, rz = 0) => arms.forEach(a => { const m = piece(new THREE.Group(), geo, mat, x * a.userData.s, y, z, 0, 0, rz * a.userData.s); a.add(m); g.userData.extra.push(m); });
  switch (type) {
    case 'swimring': {
      const tex = stripesTex('#ff4d6d', '#ffffff');
      piece(g, new THREE.TorusGeometry(0.5, 0.14, 12, 32), std(0xffffff, { map: tex, rough: 0.3 }), 0, -0.22, 0, Math.PI / 2);
      break;
    }
    case 'raincoat': {
      const y = std(0xffd000, { rough: 0.35, double: true });
      piece(g, shell(-0.6, 0.12, 0, Math.PI * 2, 0.035), y, 0, 0, 0);
      piece(g, new THREE.SphereGeometry(0.47, 22, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), y, 0, 0.24, 0);
      piece(g, new THREE.CylinderGeometry(0.62, 0.62, 0.03, 26), y, 0, 0.46, -0.06, -0.15);
      for (let i = 0; i < 3; i++) piece(g, new THREE.SphereGeometry(0.03, 8, 6), black, 0, -0.08 - i * 0.16, 0.48);
      break;
    }
    case 'ninja': {
      const dark = std(0x22223b, { rough: 0.6 });
      piece(g, shell(0.36, 0.48, Math.PI, Math.PI * 1.3, 0.012), std(0xe63946, { double: true }), 0, 0, 0);
      for (const s of [-1, 1]) { const t = piece(g, new THREE.BoxGeometry(0.06, 0.32, 0.02), red, 0.05 * s, 0.3, -0.48, 0.3, 0, 0.25 * s); t.userData.sway = 1; }
      piece(g, shell(-0.36, -0.22, 0, Math.PI * 2, 0.02), std(0x22223b, { double: true }), 0, 0, 0);
      break;
    }
    case 'chef': {
      piece(g, shell(-0.5, 0.0, FRONT, Math.PI * 0.95, 0.015), std(0xffffff, { double: true, rough: 0.6 }), 0, 0, 0);
      piece(g, shell(-0.02, 0.03, 0, Math.PI * 2, 0.03), std(0xffffff, { double: true }), 0, 0, 0);
      piece(g, new THREE.ConeGeometry(0.1, 0.16, 4), red, 0, 0.36, 0.42, Math.PI / 2 + 0.3, 0, Math.PI / 4);
      const top = new THREE.Group(); top.position.y = 0.66; g.add(top);
      piece(top, new THREE.CylinderGeometry(0.28, 0.26, 0.3, 18), white, 0, 0.12, 0);
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; piece(top, new THREE.SphereGeometry(0.17, 12, 10), white, Math.cos(a) * 0.17, 0.33, Math.sin(a) * 0.17); }
      break;
    }
    case 'tuxedo': {
      for (const s of [-1, 1]) piece(g, shell(-0.55, 0.36, s * 0.78, 0.95, 0.015), std(0x1a1a1a, { double: true }), 0, 0, 0);
      for (const s of [-1, 1]) piece(g, new THREE.ConeGeometry(0.07, 0.14, 4), black, 0.07 * s, 0.38, 0.43, 0, 0, s * Math.PI / 2);
      piece(g, new THREE.SphereGeometry(0.035, 8, 6), black, 0, 0.38, 0.45);
      for (let i = 0; i < 2; i++) piece(g, new THREE.SphereGeometry(0.03, 8, 6), white, 0, 0.1 - i * 0.18, 0.465);
      break;
    }
    case 'superhero': {
      const cape = new THREE.Group(); cape.position.set(0, 0.42, -0.36); cape.userData.sway = 1.4; g.add(cape);
      piece(cape, new THREE.PlaneGeometry(0.8, 1.05, 1, 4), std(c2, { double: true, rough: 0.6 }), 0, -0.5, -0.04, 0.12);
      piece(g, new THREE.CircleGeometry(0.15, 5), std(0xffd23f, { rough: 0.4 }), 0, -0.02, 0.462, 0, 0, Math.PI);
      piece(g, shell(0.13, 0.27, FRONT, Math.PI * 0.9, 0.004), std(0x1a1a1a, { double: true }), 0, 0, 0);
      break;
    }
    case 'pirate': {
      const bandana = std(0xd62828, { rough: 0.6 });
      piece(g, new THREE.SphereGeometry(0.47, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.38), bandana, 0, 0.26, 0);
      piece(g, new THREE.SphereGeometry(0.08, 8, 6), bandana, 0.1, 0.5, -0.38);
      piece(g, new THREE.CircleGeometry(0.075, 16), black, 0.158, 0.19, 0.475, 0, 0.36, 0);
      piece(g, new THREE.TorusGeometry(0.455, 0.012, 6, 32), black, 0, 0.26, 0, Math.PI / 2 - 0.25);
      piece(g, shell(-0.34, -0.2, 0, Math.PI * 2, 0.025), std(0x8b5a2b, { double: true }), 0, 0, 0);
      break;
    }
    case 'bee': {
      for (const y of [-0.04, -0.3]) piece(g, shell(y - 0.06, y + 0.06, 0, Math.PI * 2, 0.01), std(0x1a1a1a, { double: true }), 0, 0, 0);
      for (const s of [-1, 1]) { const w = new THREE.Group(); w.position.set(0.12 * s, 0.2, -0.42); w.userData.flap = s; g.add(w); piece(w, new THREE.CircleGeometry(0.25, 16), std(0xdff6ff, { opacity: 0.55, double: true }), 0.22 * s, 0.1, 0, 0, s * 0.5, 0, 1, 0.6, 1); }
      for (const s of [-1, 1]) { piece(g, new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6), black, 0.12 * s, 0.75, 0.05, 0, 0, -0.3 * s); piece(g, new THREE.SphereGeometry(0.045, 8, 6), black, 0.17 * s, 0.89, 0.05); }
      break;
    }
    case 'diver': {
      piece(g, new THREE.BoxGeometry(0.5, 0.24, 0.06), std(0x99e4ff, { opacity: 0.45, rough: 0.05 }), 0, 0.19, 0.47);
      piece(g, new THREE.TorusGeometry(0.2, 0.025, 6, 20), black, 0, 0.19, 0.47, 0, 0, 0, 1.3, 0.62, 1);
      piece(g, shell(0.16, 0.22, Math.PI, Math.PI * 1.2, 0.006), std(0x1a1a1a, { double: true }), 0, 0, 0);
      piece(g, new THREE.CylinderGeometry(0.025, 0.025, 0.5, 8), std(0xff8c42), 0.4, 0.38, 0.12, 0, 0, -0.15);
      onLegs(new THREE.BoxGeometry(0.22, 0.03, 0.42), std(0x3a86ff, { rough: 0.4 }), 0, -0.26, 0.14);
      break;
    }
    case 'firefighter': {
      const r2 = std(0xc1121f, { rough: 0.4 }), yel = std(0xffd23f, { rough: 0.3, emissive: 0x332200 });
      piece(g, new THREE.SphereGeometry(0.47, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.4), r2, 0, 0.25, 0);
      piece(g, new THREE.CylinderGeometry(0.58, 0.6, 0.03, 26), r2, 0, 0.44, -0.08, -0.2);
      piece(g, new THREE.BoxGeometry(0.16, 0.2, 0.04), gold, 0, 0.64, 0.25, -0.5);
      piece(g, shell(-0.6, 0.1, 0, Math.PI * 2, 0.03), std(0x3d3020, { rough: 0.7, double: true }), 0, 0, 0);
      for (const y of [-0.12, -0.36]) piece(g, shell(y - 0.035, y + 0.035, 0, Math.PI * 2, 0.04), std(0xffd23f, { rough: 0.3, emissive: 0x332200, double: true }), 0, 0, 0);
      piece(g, new THREE.CapsuleGeometry(0.11, 0.35, 4, 10), metal, 0, 0, -0.55);
      break;
    }
    case 'dino': {
      const gr = std(0x52b788, { rough: 0.6 }), light = std(0xd8f3dc, { rough: 0.6 });
      piece(g, new THREE.SphereGeometry(0.5, 22, 12, Math.PI * 0.68, Math.PI * 1.64, 0, Math.PI * 0.62), std(0x52b788, { rough: 0.6, double: true }), 0, 0.2, 0);
      for (let i = 0; i < 5; i++) { const a = 0.15 + i * 0.32; piece(g, new THREE.ConeGeometry(0.07, 0.17, 4), light, 0, 0.22 + Math.cos(a) * 0.5, -Math.sin(a) * 0.5, -a); }
      const tail = piece(g, new THREE.ConeGeometry(0.16, 0.6, 10), gr, 0, -0.45, -0.6, -Math.PI / 2 - 0.5); tail.userData.wag = 1;
      for (const s of [-1, 1]) piece(g, new THREE.ConeGeometry(0.04, 0.09, 4), white, 0.12 * s, 0.32, 0.43, 0.6);
      break;
    }
    case 'knight': {
      piece(g, shell(-0.48, 0.12, FRONT, Math.PI * 1.15, 0.03), std(0xc9d1d9, { metal: 0.7, rough: 0.3, double: true }), 0, 0, 0);
      piece(g, new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), std(0xe63946), 0, -0.1, 0.48, 0, 0, 0);
      piece(g, new THREE.BoxGeometry(0.3, 0.05, 0.03), std(0xe63946), 0, -0.02, 0.485);
      onArms(new THREE.SphereGeometry(0.17, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), metal, 0.02, 0.02, 0, -0.3);
      piece(g, shell(-0.36, -0.26, 0, Math.PI * 2, 0.04), std(0x6b4423, { double: true }), 0, 0, 0);
      piece(g, new THREE.SphereGeometry(0.48, 20, 10, Math.PI * 0.75, Math.PI * 1.5, 0, Math.PI * 0.45), metal, 0, 0.24, 0);
      const plume = piece(g, new THREE.CapsuleGeometry(0.07, 0.3, 4, 8), std(0xe63946), 0, 0.78, -0.1, -0.6); plume.userData.sway = 0.5;
      break;
    }
    case 'robot': {
      piece(g, new THREE.BoxGeometry(0.5, 0.42, 0.12), metal, 0, -0.12, 0.42);
      const lights = [0xff4d6d, 0xffd23f, 0x7bd389];
      lights.forEach((c, i) => { const l = piece(g, new THREE.SphereGeometry(0.04, 8, 6), std(c, { emissive: c, ei: 1.5 }), -0.12 + i * 0.12, -0.04, 0.49); l.userData.blink = i; });
      piece(g, new THREE.BoxGeometry(0.3, 0.04, 0.02), black, 0, -0.22, 0.485);
      for (const s of [-1, 1]) piece(g, new THREE.CylinderGeometry(0.09, 0.09, 0.08, 12), metal, 0.47 * s, 0.25, 0, 0, 0, Math.PI / 2);
      piece(g, new THREE.CylinderGeometry(0.015, 0.015, 0.35, 6), metal, 0, 0.82, 0);
      const ball = piece(g, new THREE.SphereGeometry(0.06, 10, 8), std(0xff4d6d, { emissive: 0xff4d6d, ei: 1.2 }), 0, 1.0, 0); ball.userData.blink = 3;
      break;
    }
    case 'wizard': {
      const purple = std(0x5a189a, { rough: 0.6, double: true }), starM = std(0xffd23f, { emissive: 0x806000 });
      const cape = new THREE.Group(); cape.position.set(0, 0.4, -0.36); cape.userData.sway = 1; g.add(cape);
      piece(cape, new THREE.PlaneGeometry(0.9, 1.15, 1, 4), purple, 0, -0.55, -0.04, 0.1);
      const hat = new THREE.Group(); hat.position.y = 0.6; g.add(hat);
      piece(hat, new THREE.CylinderGeometry(0.55, 0.55, 0.04, 24), purple, 0, 0, 0);
      piece(hat, new THREE.ConeGeometry(0.3, 0.75, 20), purple, 0.04, 0.38, -0.02, -0.12, 0, -0.1);
      for (let i = 0; i < 4; i++) { const a = i * 1.6; piece(hat, new THREE.OctahedronGeometry(0.045), starM, Math.cos(a) * 0.22, 0.12 + i * 0.12, Math.sin(a) * 0.18 + 0.05); }
      break;
    }
    case 'astronaut': {
      piece(g, new THREE.SphereGeometry(0.58, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.62), std(0xcfefff, { opacity: 0.38, rough: 0.05, metal: 0.3 }), 0, 0.12, 0);
      piece(g, new THREE.TorusGeometry(0.5, 0.06, 10, 32), white, 0, -0.07, 0, Math.PI / 2);
      piece(g, shell(-0.6, -0.04, 0, Math.PI * 2, 0.03), std(0xf1f3f5, { rough: 0.6, double: true }), 0, 0, 0);
      piece(g, new THREE.BoxGeometry(0.55, 0.6, 0.22), white, 0, -0.1, -0.55);
      piece(g, new THREE.BoxGeometry(0.2, 0.12, 0.04), std(0x3a86ff, { emissive: 0x1a3e9e }), 0.12, -0.25, 0.48);
      break;
    }
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
}

function stripesTex(a, b) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 8;
  const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect(i * 8, 0, 8, 8); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 1);
  return t;
}
