// The 10 race courses and the survival arenas. Each map has its own look, decorations, music and
// its own mix of obstacles. Everything is built from a seed so all players get the same map.
import { THREE, M, canvasTex, surfaceTex } from './engine.js';
import * as O from './obstacles.js';
import { Zone } from './physics.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------- themes (sky, light, fog, music) ----------
export const THEMES = {
  candy: { skyTop: '#ff9ed8', skyMid: '#ffd6f0', skyBottom: '#fff0fa', fog: '#ffd6f0', fogNear: 90, fogFar: 340, sunColor: '#fff4e0', sunInt: 2.4, sunDir: [0.5, 0.9, -0.3], hemiSky: '#ffe3f4', hemiGround: '#b05f8f', hemiInt: 1.1,
    music: { bpm: 132, root: 60, scale: 'major', lead: 'square', bass: 'triangle', drums: 'bouncy', seed: 11 } },
  lava: { skyTop: '#1a0505', skyMid: '#7a1d0b', skyBottom: '#ff5a1f', fog: '#5c1a0a', fogNear: 60, fogFar: 260, sunColor: '#ffb27a', sunInt: 2.2, sunDir: [-0.4, 0.7, 0.4], hemiSky: '#ff8a50', hemiGround: '#2b0a05', hemiInt: 0.9,
    music: { bpm: 140, root: 52, scale: 'phrygian', lead: 'sawtooth', bass: 'sawtooth', drums: 'heavy', seed: 23 } },
  sky: { skyTop: '#2f7bff', skyMid: '#8fd3ff', skyBottom: '#ffffff', fog: '#cfeaff', fogNear: 120, fogFar: 420, sunColor: '#fffbe8', sunInt: 2.6, sunDir: [0.3, 0.8, 0.5], hemiSky: '#cfefff', hemiGround: '#7aa8d8', hemiInt: 1.2,
    music: { bpm: 116, root: 62, scale: 'lydian', lead: 'triangle', bass: 'sine', drums: 'light', seed: 5 } },
  jungle: { skyTop: '#3aa0c8', skyMid: '#a8e6cf', skyBottom: '#dff7e3', fog: '#9fd8b0', fogNear: 60, fogFar: 260, sunColor: '#fff1c1', sunInt: 2.3, sunDir: [-0.3, 0.85, -0.4], hemiSky: '#d8ffd0', hemiGround: '#2d5016', hemiInt: 1.0,
    music: { bpm: 124, root: 57, scale: 'dorian', lead: 'triangle', bass: 'square', drums: 'tribal', seed: 31 } },
  ice: { skyTop: '#6fa8dc', skyMid: '#d6ecff', skyBottom: '#ffffff', fog: '#e6f3ff', fogNear: 80, fogFar: 320, sunColor: '#f0f8ff', sunInt: 2.5, sunDir: [0.4, 0.6, 0.6], hemiSky: '#ffffff', hemiGround: '#8fb3d9', hemiInt: 1.25,
    music: { bpm: 110, root: 64, scale: 'minor', lead: 'sine', bass: 'triangle', drums: 'light', seed: 17 } },
  space: { skyTop: '#030312', skyMid: '#0b0b2e', skyBottom: '#1a0b3d', fog: '#0b0b2e', fogNear: 120, fogFar: 520, sunColor: '#d6e4ff', sunInt: 2.2, sunDir: [0.6, 0.5, -0.4], hemiSky: '#6f7cff', hemiGround: '#10102a', hemiInt: 0.8,
    music: { bpm: 128, root: 50, scale: 'minor', lead: 'sawtooth', bass: 'square', drums: 'electro', seed: 41 } },
  water: { skyTop: '#2196f3', skyMid: '#8ee3ff', skyBottom: '#fff8e1', fog: '#bdeeff', fogNear: 100, fogFar: 380, sunColor: '#fff7d6', sunInt: 2.7, sunDir: [0.2, 0.9, 0.3], hemiSky: '#e0f7ff', hemiGround: '#1e88e5', hemiInt: 1.15,
    music: { bpm: 120, root: 65, scale: 'major', lead: 'triangle', bass: 'square', drums: 'bouncy', seed: 53 } },
  castle: { skyTop: '#4a6fa5', skyMid: '#c7d7ef', skyBottom: '#f1e6d0', fog: '#cfd8e6', fogNear: 80, fogFar: 330, sunColor: '#ffe7b8', sunInt: 2.4, sunDir: [-0.5, 0.75, 0.3], hemiSky: '#e8eefc', hemiGround: '#55603d', hemiInt: 1.0,
    music: { bpm: 112, root: 55, scale: 'dorian', lead: 'square', bass: 'triangle', drums: 'march', seed: 67 } },
  build: { skyTop: '#ff9f43', skyMid: '#ffd8a8', skyBottom: '#fff3e0', fog: '#ffe0b3', fogNear: 80, fogFar: 300, sunColor: '#ffe0a8', sunInt: 2.5, sunDir: [0.6, 0.6, 0.2], hemiSky: '#fff1d6', hemiGround: '#7a5230', hemiInt: 1.0,
    music: { bpm: 118, root: 53, scale: 'mixolydian', lead: 'square', bass: 'sawtooth', drums: 'funky', seed: 79 } },
  neon: { skyTop: '#05010f', skyMid: '#1c0640', skyBottom: '#5a0f6e', fog: '#1c0640', fogNear: 70, fogFar: 300, sunColor: '#c6b4ff', sunInt: 1.4, sunDir: [-0.3, 0.6, -0.5], hemiSky: '#8a6bff', hemiGround: '#1a0530', hemiInt: 0.9,
    music: { bpm: 126, root: 57, scale: 'minor', lead: 'sawtooth', bass: 'sawtooth', drums: 'electro', seed: 97 } },
  lobby: { skyTop: '#3b1cff', skyMid: '#b05cff', skyBottom: '#ffb3e6', fog: '#b05cff', fogNear: 60, fogFar: 260, sunColor: '#fff0e0', sunInt: 2.4, sunDir: [0.5, 0.8, 0.6], hemiSky: '#f0d8ff', hemiGround: '#5a2a8a', hemiInt: 1.2,
    music: { bpm: 104, root: 60, scale: 'major', lead: 'triangle', bass: 'sine', drums: 'light', seed: 3 } }
};

export const MAPS = [
  { id: 'candy', name: 'Candy Land', desc: 'Slik, kæmpe slikkepinde og hoppende gummibamse-puder.', theme: 'candy', icon: '🍭' },
  { id: 'lava', name: 'Lava Run', desc: 'Kryds en lavaflod på glidende sten og undgå de rullende klipper.', theme: 'lava', icon: '🌋' },
  { id: 'sky', name: 'Sky Islands', desc: 'Små øer højt oppe, smalle broer og vind der blæser dig ud over kanten.', theme: 'sky', icon: '☁️' },
  { id: 'jungle', name: 'Jungle Adventure', desc: 'Sving med lianerne, hop over rullende træstammer og løb fra stammerne.', theme: 'jungle', icon: '🌴' },
  { id: 'ice', name: 'Ice World', desc: 'Glat is overalt. Snebolde ruller ned ad bakken og fliserne knækker.', theme: 'ice', icon: '❄️' },
  { id: 'space', name: 'Space Station', desc: 'Lasersluser, svævende platforme og lav tyngdekraft.', theme: 'space', icon: '🚀' },
  { id: 'water', name: 'Water Park', desc: 'Rutsjebaner, vandstråler og roterende platforme over poolen.', theme: 'water', icon: '🌊' },
  { id: 'castle', name: 'Medieval Castle', desc: 'Kanoner, svingende økser, hjul og vindebro.', theme: 'castle', icon: '🏰' },
  { id: 'build', name: 'Construction Site', desc: 'Kraner med nedrivningskugler, store hamre og rullebånd.', theme: 'build', icon: '🏗️' },
  { id: 'neon', name: 'Neon City', desc: 'Lysende platforme der blinker i takt, fartstriber og flippere.', theme: 'neon', icon: '🌃' }
];
export const ARENAS = [
  { id: 'spin', name: 'Spin Zone', desc: 'Hop over bjælkerne. Sidste spillere tilbage vinder.', theme: 'neon', icon: '🌀' },
  { id: 'crumble', name: 'Crumble Floors', desc: 'Fliserne falder, når du står på dem. Hold dig oppe!', theme: 'candy', icon: '🧱' },
  { id: 'lavarise', name: 'Rising Lava', desc: 'Lavaen stiger. Klatr opad og hold dig på platformene.', theme: 'lava', icon: '🔥' }
];

// ---------- course builder ----------
class Course {
  constructor(ctx, look) {
    this.c = ctx; this.z = 0; this.y = 0; this.cp = 0; this.W = 18; this.look = look;
    this.nav = [];      // bot hints: { z, x?, act: 'jump' | 'dash' }
  }
  floor(len, o = {}) {
    O.block(this.c, { x: o.x || 0, y: this.y - 0.5, z: this.z + len / 2, w: o.w || this.W, h: 1, d: len, mat: o.mat || this.look.floor, surface: o.surface });
    if (o.rim !== false && !o.noRim) for (const s of [-1, 1]) O.block(this.c, { x: (o.x || 0) + s * ((o.w || this.W) / 2 + 0.3), y: this.y + 0.25, z: this.z + len / 2, w: 0.6, h: 0.5, d: len, mat: this.look.rim });
    this.z += len;
    return this;
  }
  check(len = 6) { this.floor(len); O.checkpoint(this.c, ++this.cp, 0, this.y, this.z - len / 2, this.W); return this; }
  jumpAt(z, x) { this.nav.push({ z, x, act: 'jump' }); }
  dashAt(z, x) { this.nav.push({ z, x, act: 'dash' }); }
  laneAt(z, x) { this.nav.push({ z, x }); }
  finish() { this.floor(6); O.finishLine(this.c, 0, this.y, this.z, this.W); this.floor(26, { rim: true }); this.c.finishZ = this.z - 26; return this; }

  // --- generic segments, styled by the map's look ---
  gaps(n, gap = 3.6, plat = 5, o = {}) {
    for (let i = 0; i < n; i++) {
      this.jumpAt(this.z - 0.4);
      this.z += gap;
      const x = o.xs ? o.xs[i] : 0;
      O.block(this.c, { x, y: this.y - 0.5 + (o.dy ? o.dy * (i + 1) : 0), z: this.z + plat / 2, w: o.w || 6, h: 1, d: plat, mat: i % 2 ? this.look.alt : this.look.floor });
      this.laneAt(this.z + plat / 2, x);
      this.z += plat;
    }
    if (o.dy) this.y += o.dy * n;
    if (!o.noTail) { this.jumpAt(this.z - 0.4); this.z += gap; }
    return this;
  }
  bigGap(gap = 10) { this.dashAt(this.z - 0.8); this.z += gap; return this; }
  spinners(len, list) { this.floor(len); const z0 = this.z - len; list.forEach(s => O.spinner(this.c, { x: s.x || 0, y: this.y, z: z0 + s.z, len: s.len || this.W - 2, speed: s.speed || 1.2, h: s.h ?? 0.8, arms: s.arms || 1, dir: s.dir, mat: this.look.hazard, cap: this.look.accent })); return this; }
  hammers(len, list) { this.floor(len); const z0 = this.z - len; list.forEach(s => O.hammer(this.c, { x: s.x, y: this.y, z: z0 + s.z, r: s.r || 6, speed: s.speed || 1.1, dir: s.dir, phase: s.phase, mat: this.look.accentMat })); return this; }
  movers(n, o = {}) {
    for (let i = 0; i < n; i++) {
      const z = this.z + (o.gap || 4.5) + 2;
      O.mover(this.c, { x: 0, y: this.y - 0.4, z, w: o.w || 5, d: 4, ax: o.ax ?? 5, ay: o.ay || 0, az: o.az || 0, speed: o.speed || 1.2, phase: i * 1.7, mat: this.look.alt });
      this.jumpAt(this.z - 0.5); this.laneAt(z, 0);
      this.z = z + 2;
    }
    this.jumpAt(this.z - 0.3); this.z += o.gap || 4.5;
    return this;
  }
  crumbles(rows, cols, o = {}) {
    const tw = (o.w || this.W) / cols;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++)
      O.crumble(this.c, { x: -((o.w || this.W) / 2) + tw * (c + 0.5), y: this.y - 0.3, z: this.z + r * tw + tw / 2, w: tw - 0.15, d: tw - 0.15, mat: (r + c) % 2 ? this.look.floor : this.look.alt, respawn: true, back: 3 });
    this.z += rows * tw;
    return this;
  }
  vanishes(n, o = {}) {
    for (let i = 0; i < n; i++) {
      const x = o.zig ? (i % 2 ? 3 : -3) : 0;
      this.jumpAt(this.z - 0.4, x); this.z += o.gap || 3;
      O.vanish(this.c, { x, y: this.y - 0.3, z: this.z + 2, w: 5, d: 4, mat: this.look.glow || this.look.alt, period: o.period || 3.6, on: 0.62, phase: i * (o.offset ?? 0.9) });
      this.laneAt(this.z + 2, x); this.z += 4;
    }
    this.jumpAt(this.z - 0.4); this.z += o.gap || 3;
    return this;
  }
  rollHill(len, rise, o = {}) {
    const a = Math.atan2(rise, len), L = Math.hypot(len, rise);
    O.block(this.c, { x: 0, y: this.y - 0.5 + rise / 2, z: this.z + len / 2, w: this.W, h: 1, d: L, rx: -a, mat: this.look.floor, surface: o.surface });
    O.rollers(this.c, { x: 0, y: this.y + rise - 0.3, z: this.z + len, len: L - 2, dir: [0, 0, -1], slope: -rise / len, speed: o.speed || 9, count: o.count || 5, r: o.r || 1.3, width: this.W - 4, mat: o.ballMat || this.look.accentMat, seed: o.seed || 3 });
    this.z += len; this.y += rise;
    return this;
  }
  pistons(len, n, o = {}) {
    this.floor(len);
    const z0 = this.z - len;
    for (let i = 0; i < n; i++) {
      const s = i % 2 ? 1 : -1;
      O.piston(this.c, { x: s * (this.W / 2 + 2.5), y: this.y + 1.1, z: z0 + (i + 0.5) * len / n, w: 5, h: 2.2, d: 2.6, dir: [-s, 0, 0], dist: this.W / 2 + 1.5, speed: o.speed || 1.5, phase: i * 1.3, mat: this.look.accentMat });
    }
    return this;
  }
  lasers(len, n, o = {}) {
    this.floor(len);
    const z0 = this.z - len;
    for (let i = 0; i < n; i++) O.laser(this.c, { x: 0, y: this.y, z: z0 + (i + 0.5) * len / n, w: this.W, period: o.period || 2.8, on: o.on || 0.45, phase: i * 0.9, heights: o.heights || (i % 2 ? [0.4, 1.0] : [1.25]), color: o.color });
    return this;
  }
  fans(len, n, o = {}) {
    const w = o.w || 3.2;
    O.block(this.c, { x: 0, y: this.y - 0.5, z: this.z + len / 2, w, h: 1, d: len, mat: this.look.alt });
    for (let k = 0; k <= len; k += 2.5) this.laneAt(this.z + k, 0);
    for (let i = 0; i < n; i++) {
      const s = i % 2 ? 1 : -1;
      O.fan(this.c, { x: s * 9, y: this.y + 1.5, z: this.z + (i + 0.5) * len / n, dir: [-s, 0, 0], strength: o.strength || 26, len: 18, w: 4, h: 5, period: o.period || 3.2 });
    }
    this.z += len;
    return this;
  }
  belts(len, o = {}) { O.belt(this.c, { x: 0, y: this.y - 0.3, z: this.z + len / 2, w: this.W, d: len, dir: [0, 0, -1], speed: o.speed || 5, c1: o.c1, c2: o.c2 }); this.z += len; return this; }
  discs(n, o = {}) {
    for (let i = 0; i < n; i++) {
      const r = o.r || 5;
      this.jumpAt(this.z - 0.5); this.z += o.gap || 2.6;
      const dx = o.zig ? (i % 2 ? 2.5 : -2.5) : 0;
      O.disc(this.c, { x: dx, y: this.y - 0.35, z: this.z + r, r, speed: (o.speed || 0.8) * (i % 2 ? -1 : 1), mat: i % 2 ? this.look.alt : this.look.floor, bumpers: o.bumpers, stripe: this.look.stripe });
      this.laneAt(this.z + r * 0.5, dx); this.laneAt(this.z + r * 1.5, dx); this.z += r * 2;
    }
    this.jumpAt(this.z - 0.5); this.z += o.gap || 2.6;
    return this;
  }
  bounceUp(rise, o = {}) {
    this.floor(6);
    O.bouncePad(this.c, { x: -3, y: this.y, z: this.z - 3, r: 1.6, power: 15 + rise * 1.4, mat: this.look.padMat });
    O.bouncePad(this.c, { x: 3, y: this.y, z: this.z - 3, r: 1.6, power: 15 + rise * 1.4, mat: this.look.padMat });
    this.nav.push({ z: this.z - 3, x: 3 });
    O.block(this.c, { x: 0, y: this.y + rise / 2 - 0.5, z: this.z + 0.5, w: this.W, h: rise + 1, d: 1, mat: this.look.alt });
    this.y += rise; this.z += 1;
    return this;
  }
  stairs(n, step = 0.6, depth = 1.6) {          // a ramp up (n * step high, n * depth long)
    const len = n * depth, rise = n * step, a = Math.atan2(rise, len);
    O.block(this.c, { x: 0, y: this.y - 0.5 + rise / 2, z: this.z + len / 2, w: this.W, h: 1, d: Math.hypot(len, rise) + 0.4, rx: -a, mat: this.look.alt });
    this.z += len; this.y += rise;
    return this;
  }
  bridge(len, w = 2.4, o = {}) { O.block(this.c, { x: o.x || 0, y: this.y - 0.4, z: this.z + len / 2, w, h: 0.8, d: len, mat: o.mat || this.look.alt, surface: o.surface }); for (let k = 0; k <= len; k += 2.5) this.laneAt(this.z + k, o.x || 0); this.z += len; return this; }
  pendulums(len, n, o = {}) {
    this.bridge(len, o.w || 4);
    const z0 = this.z - len;
    for (let i = 0; i < n; i++) O.pendulum(this.c, { x: 0, y: this.y + (o.len || 7) + 1.2, z: z0 + (i + 0.5) * len / n, len: o.len || 7, axis: 'z', amp: o.amp || 1.1, speed: o.speed || 1.7, phase: i * 1.6, head: o.head || 'ball', size: o.size || 1.4, mat: o.mat });
    return this;
  }
  swings(n, o = {}) {
    for (let i = 0; i < n; i++) {
      const L = o.len || 8;
      this.jumpAt(this.z - 0.5); this.z += 4.5;
      O.pendulum(this.c, { x: 0, y: this.y + L, z: this.z, len: L, axis: 'x', amp: 0.55, speed: o.speed || 1.4, phase: i * 2, head: 'plat', pw: 3.4, pd: 3.4, mat: o.mat || this.look.alt, ropeColor: o.rope });
      this.laneAt(this.z, 0);
      this.z += 1.7;
    }
    this.jumpAt(this.z - 0.3); this.z += 4.5;
    return this;
  }
  logs(n, o = {}) {
    for (let i = 0; i < n; i++) {
      this.floor(o.gap || 5);
      O.log(this.c, { x: 0, y: this.y + (o.r || 0.9) * 0.5, z: this.z + 0.5, len: this.W - 1, r: o.r || 0.9, speed: (o.speed || 2.5) * (i % 2 ? 1 : -1), mat: o.mat });
      this.jumpAt(this.z - 1.8);
    }
    this.floor(o.gap || 5);
    return this;
  }
  wheels(len, n, o = {}) { this.floor(len); const z0 = this.z - len; for (let i = 0; i < n; i++) O.wheel(this.c, { x: 0, y: this.y + (o.r || 4) + 0.6, z: z0 + (i + 0.5) * len / n, r: o.r || 4, w: this.W - 1, speed: (o.speed || 1.1) * (i % 2 ? -1 : 1), paddles: 4, mat: o.mat }); return this; }
  cannons(len, n, o = {}) {
    this.floor(len);
    const z0 = this.z - len;
    for (let i = 0; i < n; i++) {
      const s = i % 2 ? 1 : -1;
      O.cannon(this.c, { x: s * (this.W / 2 + 2), y: this.y, z: z0 + (i + 0.5) * len / n, dir: [-s, 0, 0], period: o.period || 2.6, speed: o.speed || 14, range: this.W + 4, phase: i * 0.7 });
    }
    return this;
  }
  tilts(n, o = {}) {
    for (let i = 0; i < n; i++) { this.jumpAt(this.z - 0.4); this.z += 2.5; O.tilter(this.c, { x: 0, y: this.y - 0.3, z: this.z + 3, w: 9, d: 6, amp: o.amp || 0.28, speed: o.speed || 1.1, phase: i * 1.4, mat: i % 2 ? this.look.alt : this.look.floor, surface: o.surface }); this.z += 6; }
    this.jumpAt(this.z - 0.4); this.z += 2.5;
    return this;
  }
  bumpers(len, n) { this.floor(len); const z0 = this.z - len; const r = this.c.rand; for (let i = 0; i < n; i++) O.bumper(this.c, { x: (r() - 0.5) * (this.W - 4), y: this.y, z: z0 + 2 + r() * (len - 4), mat: this.look.glowMat }); return this; }
  slideDown(len, drop, o = {}) {
    const a = Math.atan2(drop, len);
    O.slide(this.c, { x: 0, y: this.y - drop / 2 - 0.3, z: this.z + len / 2, w: o.w || 8, len: Math.hypot(len, drop), angle: -a, mat: o.mat || this.look.alt, wallMat: o.wall || this.look.rim });
    this.z += len; this.y -= drop;
    return this;
  }
}

// ---------- decoration helpers ----------
function scatter(ctx, course, n, make, o = {}) {
  const r = ctx.rand, L = course.z;
  for (let i = 0; i < n; i++) {
    const side = r() < 0.5 ? -1 : 1, x = side * ((o.min || 16) + r() * (o.spread || 40)), z = -20 + r() * (L + 40);
    const g = make(r, i);
    g.position.set(x, (o.y ?? -8) + (o.yJit ? r() * o.yJit : 0), z);
    g.rotation.y = r() * Math.PI * 2;
    ctx.root.add(g);
  }
}
function mesh(geo, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; }
function group(...kids) { const g = new THREE.Group(); kids.forEach(k => g.add(k)); return g; }
function ground(ctx, mat, y, size = 1600) { const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat); m.rotation.x = -Math.PI / 2; m.position.set(0, y, 120); m.receiveShadow = true; ctx.root.add(m); return m; }
function swirlTex(a, b) { return canvasTex(256, 256, (g, w) => { g.fillStyle = a; g.fillRect(0, 0, w, w); g.strokeStyle = b; g.lineWidth = 16; g.beginPath(); for (let t = 0; t < 30; t += 0.05) { const r = t * 4.2; g.lineTo(w / 2 + Math.cos(t) * r, w / 2 + Math.sin(t) * r); } g.stroke(); }); }
function windowsTex(on) { return canvasTex(128, 256, (g, w, h) => { g.fillStyle = '#0d0820'; g.fillRect(0, 0, w, h); for (let y = 6; y < h; y += 14) for (let x = 6; x < w; x += 14) { g.fillStyle = Math.random() < 0.55 ? on[Math.floor(Math.random() * on.length)] : '#1a1235'; g.fillRect(x, y, 8, 9); } }); }
function stars(ctx, n = 1500, rad = 600) {
  const p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u); p.set([Math.cos(a) * s * rad, Math.abs(u) * rad * 0.9 + 20, Math.sin(a) * s * rad + 120], i * 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  ctx.root.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false })));
}
function cloud(r, white = '#ffffff', sz = 1) {
  const g = new THREE.Group(), mat = M(white, { rough: 0.95 });
  for (let i = 0; i < 6; i++) g.add(mesh(new THREE.SphereGeometry((2 + r() * 2.5) * sz, 12, 10), mat, (i - 3) * 2.2 * sz, r() * 1.5 * sz, (r() - 0.5) * 3 * sz));
  return g;
}
function tree(r, leaf = '#3fa34d', trunk = '#8d5524', s = 1) {
  return group(mesh(new THREE.CylinderGeometry(0.4 * s, 0.6 * s, 5 * s, 8), M(trunk), 0, 2.5 * s, 0), mesh(new THREE.IcosahedronGeometry(2.6 * s, 1), M(leaf, { flat: true }), 0, 6 * s, 0), mesh(new THREE.IcosahedronGeometry(1.8 * s, 1), M(leaf, { flat: true }), 1.2 * s, 7.4 * s, 0.4 * s));
}
function pine(r, s = 1, snow = false) {
  const g = group(mesh(new THREE.CylinderGeometry(0.3 * s, 0.4 * s, 2 * s, 8), M('#6d4c41'), 0, 1 * s, 0));
  for (let i = 0; i < 3; i++) g.add(mesh(new THREE.ConeGeometry((2.6 - i * 0.6) * s, 2.8 * s, 9), M(snow && i === 2 ? '#ffffff' : '#2e7d4f', { flat: true }), 0, (2.4 + i * 1.5) * s, 0));
  if (snow) g.children.forEach((c, i) => { if (i > 0) c.material = M(i % 2 ? '#e9f5ff' : '#2e7d4f', { flat: true }); });
  return g;
}
function palm(r, s = 1) {
  const g = new THREE.Group();
  for (let i = 0; i < 6; i++) g.add(mesh(new THREE.CylinderGeometry(0.35 * s, 0.42 * s, 1.3 * s, 8), M('#a1887f'), Math.sin(i * 0.3) * 0.4 * s, (0.65 + i * 1.2) * s, 0));
  for (let i = 0; i < 6; i++) { const l = mesh(new THREE.BoxGeometry(0.9 * s, 0.1 * s, 4 * s), M('#43a047'), 0, 7.4 * s, 0); l.rotation.y = i * Math.PI / 3; l.rotation.x = 0.4; l.geometry.translate(0, 0, 2 * s); g.add(l); }
  return g;
}

// ---------- the 10 courses ----------
function looks(t) {
  const L = {
    candy: { floor: M('#ffffff', { map: surfaceTex('stripes', '#ff9ed8', '#ffffff') }), alt: M('#7bdff2'), rim: M('#ff4d6d'), hazard: M('#ffffff', { map: surfaceTex('stripes', '#ff4d6d', '#ffffff') }), accent: '#ffd23f', accentMat: M('#c77dff', { rough: 0.3 }), padMat: M('#ff6fd8', { emissive: '#ff6fd8', ei: 0.3 }), stripe: '#ffffff' },
    lava: { floor: M('#3d2b2b', { rough: 0.9, flat: true }), alt: M('#5a3a32', { rough: 0.85 }), rim: M('#241414'), hazard: M('#ffffff', { map: surfaceTex('stripes', '#ff7b00', '#1a1a1a') }), accent: '#ff7b00', accentMat: M('#4a3530', { rough: 0.95, flat: true }), padMat: M('#ff7b00', { emissive: '#ff4500', ei: 0.6 }), stripe: '#ff7b00' },
    sky: { floor: M('#9be36b'), alt: M('#f1e3c2'), rim: M('#c49a6c'), hazard: M('#ffffff', { map: surfaceTex('stripes', '#3a86ff', '#ffffff') }), accent: '#ffd23f', accentMat: M('#ffffff'), padMat: M('#3a86ff', { emissive: '#3a86ff', ei: 0.3 }), stripe: '#ffffff', glow: M('#ffffff', { opacity: 0.95, emissive: '#cfeaff', ei: 0.4 }) },
    jungle: { floor: M('#6b8e23', { rough: 0.9 }), alt: M('#8d5524'), rim: M('#5c3d1e'), hazard: M('#ffffff', { map: surfaceTex('stripes', '#ffd23f', '#3d2b1f') }), accent: '#ffd23f', accentMat: M('#7c5c3b'), padMat: M('#ff8c42'), stripe: '#ffd23f' },
    ice: { floor: M('#dff3ff', { rough: 0.08, metal: 0.1 }), alt: M('#ffffff', { rough: 0.6 }), rim: M('#9cc9ef'), hazard: M('#ffffff', { map: surfaceTex('stripes', '#3a86ff', '#ffffff') }), accent: '#3a86ff', accentMat: M('#ffffff', { rough: 0.7 }), padMat: M('#00e5ff', { emissive: '#00e5ff', ei: 0.4 }), stripe: '#3a86ff' },
    space: { floor: M('#bcc5d6', { metal: 0.6, rough: 0.35, map: surfaceTex('grid', '#aab4c8', '#7a86a0') }), alt: M('#5c677d', { metal: 0.6, rough: 0.3 }), rim: M('#00e5ff', { emissive: '#00e5ff', ei: 1.2 }), hazard: M('#ffffff', { map: surfaceTex('stripes', '#ffd23f', '#222222') }), accent: '#00e5ff', accentMat: M('#8338ec', { metal: 0.5, rough: 0.3 }), padMat: M('#00e5ff', { emissive: '#00e5ff', ei: 0.8 }), stripe: '#00e5ff', glow: M('#00e5ff', { opacity: 0.8, emissive: '#00e5ff', ei: 1.2 }), glowMat: M('#ff2a6d', { emissive: '#ff2a6d', ei: 1 }) },
    water: { floor: M('#ffffff', { map: surfaceTex('checker', '#ffffff', '#bde0fe') }), alt: M('#ffd23f'), rim: M('#ff4d6d'), hazard: M('#ffffff', { map: surfaceTex('stripes', '#ff4d6d', '#ffffff') }), accent: '#ff4d6d', accentMat: M('#3a86ff'), padMat: M('#2ec4b6', { emissive: '#2ec4b6', ei: 0.3 }), stripe: '#ff4d6d' },
    castle: { floor: M('#9e9e9e', { rough: 0.95, map: surfaceTex('checker', '#a8a8a8', '#8f8f8f') }), alt: M('#8d6e63', { rough: 0.9 }), rim: M('#6d6d6d'), hazard: M('#ffffff', { map: surfaceTex('stripes', '#c62828', '#f5f5f5') }), accent: '#c62828', accentMat: M('#795548'), padMat: M('#c62828'), stripe: '#ffd23f' },
    build: { floor: M('#c8a26b', { rough: 0.9 }), alt: M('#ffb703', { metal: 0.3, rough: 0.5 }), rim: M('#343a40'), hazard: M('#ffffff', { map: surfaceTex('stripes', '#ffb703', '#222222') }), accent: '#ffb703', accentMat: M('#495057', { metal: 0.6 }), padMat: M('#ff6b00'), stripe: '#222222' },
    neon: { floor: M('#140a2e', { map: surfaceTex('grid', '#140a2e', '#ff2a6d'), emissive: '#2a0a4a', ei: 0.4 }), alt: M('#1b0f3d', { emissive: '#00e5ff', ei: 0.35 }), rim: M('#00e5ff', { emissive: '#00e5ff', ei: 1.4 }), hazard: M('#ffffff', { map: surfaceTex('stripes', '#ff2a6d', '#140a2e'), emissive: '#ff2a6d', ei: 0.4 }), accent: '#ff2a6d', accentMat: M('#ff2a6d', { emissive: '#ff2a6d', ei: 0.7 }), padMat: M('#b8f35b', { emissive: '#b8f35b', ei: 0.8 }), stripe: '#00e5ff', glow: M('#ff6fd8', { emissive: '#ff6fd8', ei: 1, opacity: 0.9 }), glowMat: M('#00e5ff', { emissive: '#00e5ff', ei: 1 }) }
  };
  return L[t];
}

const BUILD = {
  candy(ctx, c) {
    c.floor(10).spinners(16, [{ z: 8, speed: 1.1 }]).check()
      .gaps(3, 3.4, 5, { xs: [-3, 3, 0] })
      .bounceUp(4).check()
      .discs(3, { r: 4.5, speed: 0.9, zig: true })
      .check().pendulums(26, 3, { head: 'ball', size: 1.5, mat: M('#ff6fd8', { rough: 0.3 }) })
      .check().rollHill(30, 6, { speed: 8, count: 6, ballMat: M('#ffd23f', { rough: 0.2 }) })
      .check().spinners(18, [{ z: 6, speed: 1.4, arms: 2 }, { z: 14, speed: -1.2, h: 2.1 }]).finish();
    ground(ctx, M('#ffc2e2', { map: surfaceTex('water', '#ffc2e2', '#ffffff') }), -14);
    scatter(ctx, c, 26, r => { const h = 6 + r() * 10, col = ['#ff4d6d', '#3a86ff', '#ffd23f', '#7bd389'][Math.floor(r() * 4)]; const pop = mesh(new THREE.CylinderGeometry(2.8, 2.8, 0.6, 32), M('#ffffff', { map: swirlTex(col, '#ffffff') }), 0, h, 0); pop.rotation.x = Math.PI / 2; return group(mesh(new THREE.CylinderGeometry(0.25, 0.25, h, 8), M('#ffffff'), 0, h / 2, 0), pop); }, { y: -14 });
    scatter(ctx, c, 20, r => mesh(new THREE.CylinderGeometry(1.2, 2.6, 3, 16), M(['#7bd389', '#ff4d6d', '#c77dff', '#ff8c42'][Math.floor(r() * 4)], { rough: 0.25 }), 0, 1.5, 0), { y: -14, min: 14 });
    scatter(ctx, c, 10, r => { const d = mesh(new THREE.TorusGeometry(3, 1.4, 14, 28), M('#ff9ebb', { rough: 0.35 }), 0, 0, 0); d.rotation.x = Math.PI / 2 * r(); return d; }, { y: 4, yJit: 20, min: 26 });
    scatter(ctx, c, 12, r => cloud(r, '#fff0fa', 1.2), { y: 30, yJit: 25, min: 40, spread: 80 });
  },
  lava(ctx, c) {
    c.floor(10).check()
      .movers(4, { ax: 5, speed: 1.1, gap: 4 })
      .check().hammers(24, [{ x: 0, z: 12, r: 6.5, speed: 1.0 }])
      .check().crumbles(4, 4, {})
      .check().spinners(16, [{ z: 8, speed: 1.6, mat: null }])
      .check().rollHill(34, 7, { speed: 10, count: 5, r: 1.6, ballMat: M('#3d2b2b', { rough: 0.9, flat: true, emissive: '#ff4500', ei: 0.25 }) })
      .check().gaps(3, 4, 4.5, { xs: [2, -2, 2] }).finish();
    const lava = M('#ff4500', { map: surfaceTex('lava', '#c62000', '#ff9f1c'), emissive: '#ff5a00', ei: 1.2 });
    lava.map.repeat.set(40, 40); lava.emissiveMap = lava.map;
    O.hazardFloor(ctx, { x: 0, y: -4, z: c.z / 2, w: 900, d: c.z + 500, mat: lava, flow: 0.01 });
    ctx.world.killY = -6;
    scatter(ctx, c, 14, r => { const h = 20 + r() * 30; return group(mesh(new THREE.ConeGeometry(h * 0.8, h, 10), M('#2b1d1d', { flat: true, rough: 1 }), 0, h / 2, 0), mesh(new THREE.ConeGeometry(h * 0.18, h * 0.12, 10), M('#ff7b00', { emissive: '#ff4500', ei: 2 }), 0, h * 0.97, 0)); }, { y: -4, min: 35, spread: 90 });
    scatter(ctx, c, 30, r => mesh(new THREE.DodecahedronGeometry(1.5 + r() * 2.5), M('#4a3530', { flat: true, rough: 1 })), { y: -4, min: 13, spread: 25 });
  },
  sky(ctx, c) {
    c.floor(10).check()
      .gaps(2, 4, 6, { xs: [-2, 2], noTail: true }).bigGap(9).floor(8).check()
      .bridge(14, 2.2).floor(4)
      .fans(20, 3, { strength: 24 }).floor(4).check()
      .vanishes(4, { zig: true, period: 3.8 })
      .check().spinners(18, [{ z: 9, speed: 0.9, h: 0.8, arms: 2, len: 16 }])
      .check().gaps(2, 3.5, 5, { noTail: true }).bigGap(10).finish();
    ground(ctx, M('#ffffff', { map: surfaceTex('clouds', '#e9f6ff', '#ffffff'), rough: 1 }), -40);
    ctx.world.killY = -25;
    scatter(ctx, c, 18, r => { const s = 3 + r() * 6; const g = group(mesh(new THREE.ConeGeometry(s, s * 1.6, 7), M('#8d6e63', { flat: true }), 0, -s * 0.8, 0), mesh(new THREE.CylinderGeometry(s, s, 0.8, 7), M('#7bd389', { flat: true }), 0, 0.3, 0)); if (r() < 0.7) g.add(tree(r, '#5cb85c', '#8d5524', s / 6)); return g; }, { y: -6, yJit: 20, min: 18, spread: 70 });
    scatter(ctx, c, 30, r => cloud(r, '#ffffff', 1 + r()), { y: -20, yJit: 60, min: 20, spread: 120 });
  },
  jungle(ctx, c) {
    c.floor(10).check()
      .logs(3, { r: 0.9, speed: 2.2 }).check()
      .swings(4, { len: 9, speed: 1.3, mat: M('#6b8e23'), rope: '#3e6b1f' })
      .check().pistons(24, 4, { speed: 1.3 })
      .check().slideDown(22, 5, { mat: M('#7c5c3b'), wall: M('#5c3d1e') }).floor(4)
      .check().spinners(16, [{ z: 8, speed: 1.3, h: 0.6, arms: 2 }])
      .check().gaps(3, 3.5, 4.5, { xs: [0, -3, 3] }).finish();
    const river = M('#3aa58a', { map: surfaceTex('water', '#2f8f7a', '#9de0c9'), rough: 0.15, opacity: 0.92 });
    river.map.repeat.set(30, 30);
    O.hazardFloor(ctx, { x: 0, y: -6, z: c.z / 2, w: 900, d: c.z + 500, mat: river, flow: 0.03 });
    ctx.world.killY = -8;
    scatter(ctx, c, 40, r => tree(r, ['#2e7d32', '#43a047', '#558b2f'][Math.floor(r() * 3)], '#6d4c41', 1.4 + r() * 1.2), { y: -6, min: 14, spread: 50 });
    scatter(ctx, c, 14, r => group(mesh(new THREE.BoxGeometry(3, 10 + r() * 8, 3), M('#8a8f6a', { flat: true, rough: 1 }), 0, 6, 0)), { y: -6, min: 18, spread: 30 });
  },
  ice(ctx, c) {
    c.floor(10).check()
      .floor(20, { surface: 'ice' })
      .check().rollHill(30, 6, { surface: 'ice', speed: 8, count: 6, r: 1.4, ballMat: M('#ffffff', { rough: 0.8 }) })
      .check().fans(18, 3, { strength: 20 }).floor(4)
      .check().crumbles(5, 4)
      .check().spinners(18, [{ z: 9, speed: 1.0, arms: 3, len: 17, mat: M('#ffffff', { map: surfaceTex('stripes', '#3a86ff', '#ffffff') }) }])
      .floor(10, { surface: 'ice' }).check()
      .tilts(3, { surface: 'ice', amp: 0.22 }).finish();
    const water = M('#2b6cb0', { map: surfaceTex('water', '#245a94', '#9fd3ff'), rough: 0.1 });
    water.map.repeat.set(40, 40);
    O.hazardFloor(ctx, { x: 0, y: -8, z: c.z / 2, w: 900, d: c.z + 500, mat: water, flow: 0.01 });
    ctx.world.killY = -9;
    scatter(ctx, c, 40, r => pine(r, 1.2 + r() * 1.5, true), { y: -8, min: 14, spread: 50 });
    scatter(ctx, c, 16, r => mesh(new THREE.OctahedronGeometry(2 + r() * 3), M('#bfe9ff', { opacity: 0.75, emissive: '#7fd4ff', ei: 0.4, rough: 0.05 })), { y: -6, min: 14, spread: 30 });
    ctx.snow = true;
  },
  space(ctx, c) {
    ctx.world.zone(new Zone('lowgrav', V(-60, -50, 40), V(60, 80, 120), { k: 0.55 }));
    c.floor(10).check()
      .lasers(26, 4, { period: 2.6 })
      .check().gaps(3, 5, 4, { xs: [-3, 0, 3] })
      .floor(4).check()
      .vanishes(4, { period: 3.2 })
      .check().spinners(18, [{ z: 9, speed: 1.5, arms: 2, len: 17 }])
      .check().belts(18, { speed: 5, c1: '#3d4a63', c2: '#00e5ff' })
      .check().lasers(18, 3, { period: 2.2, heights: [0.5, 1.4] }).finish();
    stars(ctx, 2200);
    ctx.world.killY = -25;
    [['#ff8c42', 60, -200, 120, 300], ['#8338ec', 30, 180, 60, 120], ['#3a86ff', 45, -120, 160, -40]].forEach(([col, r, x, y, z]) => {
      const p = mesh(new THREE.SphereGeometry(r, 32, 24), M(col, { rough: 0.8 }), x, y, z); ctx.root.add(p);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.6, r * 0.12, 4, 64), M('#ffffff', { opacity: 0.4, rough: 1 })); ring.position.copy(p.position); ring.rotation.x = 1.2; ctx.root.add(ring);
    });
    scatter(ctx, c, 16, r => group(mesh(new THREE.BoxGeometry(2, 2, 6), M('#adb5bd', { metal: 0.7 }), 0, 0, 0), mesh(new THREE.BoxGeometry(10, 0.1, 3), M('#1d3557', { metal: 0.5, emissive: '#00e5ff', ei: 0.2 }), 0, 0, 0)), { y: -10, yJit: 40, min: 20, spread: 60 });
  },
  water(ctx, c) {
    c.floor(10).check()
      .slideDown(26, 7, { mat: M('#3a86ff', { rough: 0.15 }), wall: M('#ffffff') }).floor(6)
      .check().discs(3, { r: 5, speed: 1.0, bumpers: 2 })
      .check().floor(18);
    for (let i = 0; i < 5; i++) O.jet(ctx, { x: (i % 2 ? 4 : -4), y: c.y, z: c.z - 16 + i * 3.3, period: 2.8, phase: i * 0.6, power: 20 });
    c.check().movers(3, { ax: 0, az: 0, ay: 1.2, speed: 1.4, gap: 3.5 })
      .check().pendulums(24, 3, { head: 'ball', size: 1.6, mat: M('#ff4d6d', { rough: 0.2 }) })
      .check().bounceUp(5).finish();
    const pool = M('#2ec4ff', { map: surfaceTex('water', '#1da1f2', '#bff0ff'), rough: 0.05, opacity: 0.9 });
    pool.map.repeat.set(40, 40);
    O.hazardFloor(ctx, { x: 0, y: -10, z: c.z / 2, w: 900, d: c.z + 500, mat: pool, flow: 0.025 });
    ctx.world.killY = -11;
    scatter(ctx, c, 30, r => palm(r, 1.2 + r() * 0.6), { y: -10, min: 14, spread: 40 });
    scatter(ctx, c, 14, r => group(mesh(new THREE.ConeGeometry(3, 1.2, 12, 1, true), M(['#ff4d6d', '#ffd23f', '#3a86ff'][Math.floor(r() * 3)], { double: true }), 0, 4, 0), mesh(new THREE.CylinderGeometry(0.1, 0.1, 4, 6), M('#ffffff'), 0, 2, 0)), { y: -10, min: 14, spread: 30 });
    scatter(ctx, c, 10, r => { const t = mesh(new THREE.TorusGeometry(8, 1.2, 12, 32, Math.PI), M(['#ff8c42', '#7bd389', '#c77dff'][Math.floor(r() * 3)], { rough: 0.2 }), 0, 0, 0); t.rotation.y = r() * 3; return t; }, { y: -10, min: 22, spread: 40 });
  },
  castle(ctx, c) {
    c.floor(10).check()
      .floor(6);
    // drawbridge going up and down
    O.mover(ctx, { x: 0, y: c.y - 0.4, z: c.z + 6, w: 8, d: 10, ay: 1.4, speed: 1.1, mat: M('#8d6e63') });
    c.jumpAt(c.z - 0.5); c.z += 12; c.jumpAt(c.z - 0.5); c.z += 1;
    c.check().cannons(26, 4, { period: 2.8 })
      .check().pendulums(26, 3, { head: 'axe', size: 1.5, len: 8, amp: 1.0 })
      .check().wheels(22, 2, { r: 4, speed: 1.0, mat: M('#6d4c41') })
      .check().stairs(6, 0.7, 2).floor(4)
      .check().hammers(20, [{ x: 0, z: 10, r: 6, speed: 1.2 }]).finish();
    ground(ctx, M('#5f8a3a', { rough: 1 }), -8);
    const moat = M('#3b6ea5', { map: surfaceTex('water', '#2f5d8a', '#a8d0ff'), rough: 0.1 }); moat.map.repeat.set(10, 30);
    O.hazardFloor(ctx, { x: 0, y: -7.6, z: c.z / 2, w: 40, d: c.z + 60, mat: moat, flow: 0.02 });
    ctx.world.killY = -9;
    scatter(ctx, c, 14, r => { const h = 14 + r() * 14; return group(mesh(new THREE.CylinderGeometry(3.4, 3.8, h, 14), M('#a5a5a5', { rough: 1 }), 0, h / 2, 0), mesh(new THREE.ConeGeometry(4.2, 6, 14), M('#b71c1c'), 0, h + 3, 0), mesh(new THREE.PlaneGeometry(2, 1.2), M('#ffd23f', { double: true }), 1, h + 7, 0)); }, { y: -8, min: 26, spread: 40 });
    scatter(ctx, c, 30, r => tree(r, '#4f7f2f', '#6d4c41', 1 + r()), { y: -8, min: 22, spread: 60 });
  },
  build(ctx, c) {
    c.floor(10).check()
      .bridge(16, 1.8, { mat: M('#ff6b00', { metal: 0.4 }) }).floor(5)
      .check().pendulums(26, 3, { head: 'ball', size: 1.8, len: 10, amp: 1.0, speed: 1.4, mat: M('#343a40', { metal: 0.7, rough: 0.3 }) })
      .check().hammers(24, [{ x: -4, z: 6, r: 5, speed: 1.1 }, { x: 4, z: 17, r: 5, speed: -1.1, phase: 1.5 }])
      .check().belts(20, { speed: 6, c1: '#2b2b2b', c2: '#ffb703' })
      .check().tilts(3, { amp: 0.3 })
      .check().stairs(5, 0.8, 2.2).crumbles(3, 4).finish();
    ground(ctx, M('#9c7b54', { rough: 1 }), -14);
    ctx.world.killY = -15;
    scatter(ctx, c, 8, r => { const h = 30 + r() * 20, g = new THREE.Group(); g.add(mesh(new THREE.BoxGeometry(2, h, 2), M('#ffb703', { metal: 0.3 }), 0, h / 2, 0)); const arm = mesh(new THREE.BoxGeometry(1.5, 1.5, 28), M('#ffb703', { metal: 0.3 }), 0, h, 8); g.add(arm); g.add(mesh(new THREE.BoxGeometry(3, 3, 4), M('#343a40'), 0, h - 2.5, -4)); return g; }, { y: -14, min: 28, spread: 40 });
    scatter(ctx, c, 30, r => r() < 0.5 ? mesh(new THREE.ConeGeometry(0.6, 1.6, 12), M('#ff6b00'), 0, 0.8, 0) : mesh(new THREE.CylinderGeometry(0.9, 0.9, 2, 12), M(['#1d3557', '#e63946', '#2a9d8f'][Math.floor(r() * 3)], { metal: 0.3 }), 0, 1, 0), { y: -14, min: 12, spread: 30 });
    scatter(ctx, c, 12, r => mesh(new THREE.BoxGeometry(4, 4, 4), M('#a0522d', { rough: 1 }), 0, 2, 0), { y: -14, min: 14, spread: 30 });
  },
  neon(ctx, c) {
    c.floor(10).check()
      .vanishes(5, { period: 2.4, offset: 0.48 })   // blink in time with the music
      .check().bumpers(22, 9)
      .check().floor(16);
    ctx.world.zone(new Zone('boost', V(-9, c.y - 1, c.z - 16), V(9, c.y + 3, c.z), { x: 0, z: 22 }));
    for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.4), M('#b8f35b', { emissive: '#b8f35b', ei: 1.5 })); s.rotation.x = -Math.PI / 2; s.position.set(0, c.y + 0.03, c.z - 14 + i * 4); ctx.root.add(s); }
    c.bigGap(11).floor(8)
      .check().spinners(20, [{ z: 6, speed: 1.6, arms: 2 }, { z: 15, speed: -1.4, h: 2.2 }])
      .check().pistons(20, 4, { speed: 1.6 })
      .check().movers(3, { ax: 5.5, speed: 1.5, gap: 4.5 }).finish();
    ground(ctx, M('#0a0620', { map: surfaceTex('grid', '#0a0620', '#3a1d7a') }), -16).material.map.repeat.set(80, 80);
    ctx.world.killY = -14;
    const wins = windowsTex(['#ff2a6d', '#00e5ff', '#ffd23f', '#b8f35b']);
    scatter(ctx, c, 40, r => { const h = 20 + r() * 60, w = 6 + r() * 8; const b = mesh(new THREE.BoxGeometry(w, h, w), M('#ffffff', { map: wins, emissive: '#ffffff', ei: 0.6 }), 0, h / 2, 0); b.material = b.material.clone(); b.material.emissiveMap = wins; return group(b, mesh(new THREE.BoxGeometry(w + 0.4, 0.4, w + 0.4), M(['#ff2a6d', '#00e5ff', '#b8f35b'][Math.floor(r() * 3)], { emissive: '#ff2a6d', ei: 2 }), 0, h, 0)); }, { y: -16, min: 18, spread: 70 });
    stars(ctx, 900);
  }
};

// ---------- survival arenas ----------
const ARENA = {
  spin(ctx, look) {
    O.cyl(ctx, { x: 0, y: -0.5, z: 0, r: 15, h: 1, mat: look.floor, seg: 48 });
    O.spinner(ctx, { x: 0, y: 0, z: 0, len: 30, speed: 1.0, h: 0.6, arms: 1, mat: look.hazard, cap: look.accent, postR: 1.2, postH: 2.4 });
    const late = O.spinner(ctx, { x: 0, y: 0, z: 0, len: 26, speed: -0.8, h: 2.0, arms: 1, mat: look.hazard, cap: look.accent, postR: 0.01, postH: 0.01 });
    ctx.ups.push(t => { late.visible = t > 20; late.children.forEach(a => a.children.forEach(m => { if (m.userData.col) m.userData.col.enabled = t > 20; })); });
    ctx.speedUp = true;
    return { spawnR: 10, killY: -12 };
  },
  crumble(ctx, look) {
    for (let layer = 0; layer < 3; layer++) {
      const y = -layer * 9, n = 9, tw = 3;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        if (Math.hypot(i - 4, j - 4) > 4.6) continue;
        O.crumble(ctx, { x: (i - 4) * tw, y, z: (j - 4) * tw, w: tw - 0.12, d: tw - 0.12, mat: (i + j + layer) % 2 ? look.floor : look.alt, respawn: false, delay: 0.55 });
      }
    }
    return { spawnR: 8, killY: -28 };
  },
  lavarise(ctx, look) {
    const r = ctx.rand;
    O.cyl(ctx, { x: 0, y: -0.5, z: 0, r: 12, h: 1, mat: look.floor });
    for (let i = 0; i < 26; i++) {
      const a = i * 0.9, rad = 4 + (i % 5) * 2.2, y = 1.5 + i * 1.1;
      O.block(ctx, { x: Math.cos(a) * rad, y, z: Math.sin(a) * rad, w: 3.4, h: 0.6, d: 3.4, mat: i % 2 ? look.alt : look.floor });
      (ctx.platforms = ctx.platforms || []).push({ x: Math.cos(a) * rad, y: y + 0.3, z: Math.sin(a) * rad });
    }
    for (let i = 0; i < 4; i++) O.bouncePad(ctx, { x: Math.cos(i * 1.57) * 8, y: 0, z: Math.sin(i * 1.57) * 8, power: 18, mat: look.padMat });
    const lava = M('#ff4500', { map: surfaceTex('lava', '#c62000', '#ff9f1c'), emissive: '#ff5a00', ei: 1.2 }); lava.map.repeat.set(12, 12); lava.emissiveMap = lava.map;
    O.rising(ctx, { x: 0, y: -2, z: 0, w: 120, d: 120, mat: lava, delay: 6, rate: 0.32 });
    return { spawnR: 9, killY: -10 };
  }
};

// Build a race map or arena into root. Returns everything the game needs about it.
export function buildMap(id, ctx) {
  const def = MAPS.find(m => m.id === id) || ARENAS.find(a => a.id === id);
  const isArena = !!ARENAS.find(a => a.id === id);
  const look = looks(def.theme);
  if (isArena) {
    const info = ARENA[id](ctx, look);
    ctx.world.killY = info.killY;
    const decor = { neon: 'neon', candy: 'candy', lava: 'lava' }[def.theme];
    if (decor === 'neon') stars(ctx, 1200);
    if (decor === 'lava') { const lava = M('#ff4500', { map: surfaceTex('lava', '#c62000', '#ff9f1c'), emissive: '#ff5a00', ei: 1.2 }); lava.map.repeat.set(30, 30); lava.emissiveMap = lava.map; ground(ctx, lava, -14, 600); }
    if (decor === 'candy') ground(ctx, M('#ffc2e2', { map: surfaceTex('water', '#ffc2e2', '#ffffff') }), -32);
    const spawns = [];
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; spawns.push({ x: Math.cos(a) * info.spawnR * (i % 2 ? 0.6 : 1), y: 0.3, z: Math.sin(a) * info.spawnR * (i % 2 ? 0.6 : 1), yaw: Math.atan2(-Math.cos(a), -Math.sin(a)) }); }
    return { def, theme: THEMES[def.theme], arena: true, spawns, nav: [], platforms: ctx.platforms || [], length: 0, camStart: V(0, 26, -30), camEnd: V(0, 12, -22) };
  }
  const c = new Course(ctx, look);
  // start area behind z = 0 with a back wall and the starting gate
  O.block(ctx, { x: 0, y: -0.5, z: -5, w: c.W, h: 1, d: 10, mat: look.floor });
  O.block(ctx, { x: 0, y: 1, z: -10.3, w: c.W + 1.2, h: 3, d: 0.6, mat: look.rim });
  for (const s of [-1, 1]) O.block(ctx, { x: s * (c.W / 2 + 0.3), y: 0.5, z: -5, w: 0.6, h: 2, d: 10, mat: look.rim });
  for (const s of [-1, 1]) O.cyl(ctx, { x: s * (c.W / 2 + 0.6), y: 3, z: 0, r: 0.45, h: 6, mat: look.rim });
  const gate = new THREE.Mesh(new THREE.BoxGeometry(c.W + 1.2, 1, 0.4), M('#ffffff', { map: canvasTex(512, 64, (g, w, h) => { g.fillStyle = '#ff4d6d'; g.fillRect(0, 0, w, h); g.font = '400 44px "Lilita One", sans-serif'; g.textAlign = 'center'; g.fillStyle = '#ffffff'; g.fillText('START', w / 2, 48); }) }));
  gate.position.set(0, 6, 0); ctx.root.add(gate);
  BUILD[id](ctx, c);
  const spawns = [];
  for (let i = 0; i < 16; i++) spawns.push({ x: -7 + (i % 8) * 2, y: 0.3, z: -6 + Math.floor(i / 8) * 2.4, yaw: 0 });
  return { def, theme: THEMES[def.theme], arena: false, spawns, nav: c.nav.sort((a, b) => a.z - b.z), length: ctx.finishZ || c.z, finishZ: ctx.finishZ, snow: !!ctx.snow };
}
