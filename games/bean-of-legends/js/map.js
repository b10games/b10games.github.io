// The battlefield: three lanes, a river, jungle corridors between raised walls, bushes, two bases.
// The map is mirror-symmetric along the river (x,z) -> (z,x), so both teams get the same layout.
// It provides the height of the ground, where units may walk (A* pathfinding), and builds the 3D scenery
// in one of several themes (same layout, different look).
import { THREE, M, canvasTex, rng, clamp } from './engine.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BLUE, RED, TEAM_COLOR } from './data.js';

export const S = 1.3;                          // map scale
export const HALF = Math.round(110 * S);
const N = HALF * 2 + 1;                       // samples per side (1 world unit apart)
const P = (x, z) => ({ x: x * S, z: z * S });
export const mirror = p => ({ ...p, x: p.z, z: p.x });

// ---------- layout (blue side; red is mirrored) ----------
export const LANES = {
  top: [P(-86, 62), P(-86, -50), P(-76, -76), P(-50, -86), P(62, -86)],
  mid: [P(-64, 64), P(64, -64)],
  bot: [P(-62, 86), P(50, 86), P(76, 76), P(86, 50), P(86, -62)]
};
export const BASE = [P(-86, 86), P(86, -86)];
export const FOUNTAIN = [P(-98, 98), P(98, -98)];
export const CORES = [P(-79, 79), P(79, -79)];
const BLUE_TOWERS = [
  { lane: 'top', tier: 0, ...P(-86, -28) }, { lane: 'top', tier: 1, ...P(-86, 14) }, { lane: 'top', tier: 2, ...P(-86, 52) },
  { lane: 'mid', tier: 0, ...P(-23, 23) }, { lane: 'mid', tier: 1, ...P(-40, 40) }, { lane: 'mid', tier: 2, ...P(-57, 57) },
  { lane: 'bot', tier: 0, ...P(28, 86) }, { lane: 'bot', tier: 1, ...P(-14, 86) }, { lane: 'bot', tier: 2, ...P(-52, 86) },
  { lane: 'core', tier: 3, ...P(-72, 81) }, { lane: 'core', tier: 3, ...P(-81, 72) }
];
export const TOWERS = [
  ...BLUE_TOWERS.map(t => ({ ...t, team: BLUE })),
  ...BLUE_TOWERS.map(t => ({ ...mirror(t), lane: t.lane, tier: t.tier, team: RED }))
];
const BLUE_CAMPS = [
  { id: 'gumdrop', mobs: [['gumdrop', 0, 0]], ...P(-66, 14) },
  { id: 'yeti', mobs: [['yeti', 0, 0]], ...P(-46, 4), buff: true },
  { id: 'toads', mobs: [['toad', 0, 0], ['toadlet', 2.2, 1.6], ['toadlet', -2.2, 1.8]], ...P(-52, -24) },
  { id: 'birds', mobs: [['mama', 0, 0], ['chick', 2, 1], ['chick', -2, 1], ['chick', 1.6, -1.8], ['chick', -1.6, -1.8], ['chick', 0, 2.4]], ...P(-8, 34) },
  { id: 'chili', mobs: [['chili', 0, 0]], ...P(8, 52), buff: true },
  { id: 'crabs', mobs: [['crab', 0, 0], ['crablet', 2.2, 1.6], ['crablet', -2.2, 1.8]], ...P(26, 64) }
];
export const CAMPS = [
  ...BLUE_CAMPS.map(c => ({ ...c, side: BLUE })),
  ...BLUE_CAMPS.map(c => ({ ...mirror(c), id: c.id + '_r', mobs: c.mobs.map(([t, dx, dz]) => [t, dz, dx]), side: RED })),
  { id: 'dragon', mobs: [['dragon', 0, 0]], ...P(46, 46), side: -1, epic: true },
  { id: 'boss', mobs: [['boss', 0, 0]], ...P(-46, -46), side: -1, epic: true }
];
const RIVER = [P(-88, -88), P(88, 88)];
const BLUE_PATHS = [
  [P(-70, 52), P(-56, 30), P(-46, 4)],
  [P(-86, 20), P(-66, 14), P(-46, 4)],
  [P(-46, 4), P(-52, -24), P(-44, -38)],
  [P(-46, 4), P(-30, 12), P(-20, 20)],
  [P(-52, -24), P(-34, -22), P(-22, -22)],
  [P(-30, 30), P(-8, 34), P(8, 52), P(26, 64), P(32, 86)],
  [P(8, 52), P(-20, 62), P(-48, 70)],
  [P(-8, 34), P(14, 26), P(24, 24)],
  [P(26, 64), P(40, 54), P(46, 46)],
  [P(-66, 14), P(-70, 34), P(-70, 52)]
];
const BLUE_BUSHES = [
  P(-79, -36), P(-80, -60), P(-66, -72), P(-79, 2), P(-27, 33), P(-33, 27), P(-12, 17), P(-17, 12),
  P(-32, 80), P(12, 80), P(42, 79), P(-40, 12), P(-14, 42), P(2, 60), P(-60, -20), P(18, 30), P(36, 56),
  P(-38, -30), P(-58, 2), P(-78, 30), P(-2, 81)
];
export const BUSHES = [...BLUE_BUSHES, ...BLUE_BUSHES.map(mirror)].map((b, i) => ({ ...b, r: 3.4, id: i }));
const BRIDGES = [P(-27, -27), P(27, 27)];
const LANE_W = 8, RIVER_W = 7.6, PATH_W = 4.4;

// ---------- themes: same layout, different look ----------
export const MAP_THEMES = {
  candy: { name: 'Candy Valley', desc: 'Sunny meadows, candy windmills and a sparkling river.', swatch: ['#79c257', '#3fb7e8', '#ff6fd8'],
    sky: '#7fcdf2', ground: ['#7cc458', '#5fae47'], lane: '#e2c088', curb: ['#d8cbb8', '#c2b39c'], wallTop: '#4c9a3d', cliff: '#9b8b74', bed: '#62b6c4', pit: '#c9a0dc',
    water: { color: '#3fb7e8', emissive: '#1c6fa8', ei: 0.25, opacity: 0.8, flow: 1, foam: '#e6fbff' }, outer: { color: '#3aa6dd', emissive: '#155c8f', ei: 0.3 },
    hemi: ['#eef7ff', '#56803f', 1.3], sun: ['#fff1d6', 2.7],
    trees: [['round', 5, ['#3f9d4a', '#58b84f', '#2e8b57', '#6cc04a', '#8bcf5b']], ['pine', 3, ['#2e7d4f', '#3f9d4a', '#2b6e44']], ['blossom', 1, ['#ff9ebb', '#ffb3c6', '#ffd6e0']]],
    rocks: ['#a9a39b', '#c2b8a3'], bush: '#2f8f46', bushDots: ['#ff6fd8', '#ffd23f', '#ffffff'], flowers: ['#ff6fd8', '#ffd23f', '#ffffff', '#ff8c42', '#c77dff', '#ff4d6d'], tufts: ['#4fa83d', '#6cc04a'],
    shrooms: ['#ff4d6d', '#ff8c42'], props: ['windmill', 'lollipop'], ambient: 'petals', lamp: '#ffd27a' },
  frost: { name: 'Frosty Peaks', desc: 'Deep snow, frozen rivers and very cold beans.', swatch: ['#eef5fb', '#9fd8ff', '#2e7d4f'],
    sky: '#cfe9ff', ground: ['#f0f6fb', '#dbe8f2'], lane: '#c4d2e0', curb: ['#9fb3c6', '#b7c7d6'], wallTop: '#f7fbff', cliff: '#a2bbd1', bed: '#7fc8f0', pit: '#bfe3ff',
    water: { color: '#bfeaff', emissive: '#5fb8e6', ei: 0.35, opacity: 0.72, flow: 0.15, foam: '#ffffff', ice: true }, outer: { color: '#d9eef9', emissive: '#7fb8d9', ei: 0.2 },
    hemi: ['#ffffff', '#93a9bd', 1.35], sun: ['#ffffff', 2.3],
    trees: [['snowpine', 5, ['#2e5e4e', '#2b6e5a', '#3b6e5e']], ['pine', 2, ['#3e6e5e', '#2b5a4e']], ['crystal', 1, ['#9fe3ff', '#bfeaff', '#ffffff']]],
    rocks: ['#b7c7d6', '#9fb3c6'], bush: '#4f7f86', bushDots: ['#ffffff', '#dff4ff'], flowers: ['#bfeaff', '#ffffff', '#9fd8ff'], tufts: null,
    shrooms: null, props: ['snowman', 'icespike'], ambient: 'snow', lamp: '#bfe8ff' },
  lava: { name: 'Lava Isles', desc: 'Rivers of glowing lava and burnt black rock.', swatch: ['#3b302c', '#ff6a00', '#ffd23f'],
    sky: '#2a1210', ground: ['#5e4c44', '#4a3c36'], lane: '#8b6b52', curb: ['#3a302c', '#2b2420'], wallTop: '#3b302c', cliff: '#231c1a', bed: '#ff5a00', pit: '#8a3a2a',
    water: { color: '#ff6a00', emissive: '#ff3d00', ei: 1.7, opacity: 1, flow: 0.5, foam: '#ffd23f', lava: true }, outer: { color: '#ff5a00', emissive: '#ff2a00', ei: 1.4, lava: true },
    hemi: ['#ffb38a', '#2a1410', 1.05], sun: ['#ffcf9e', 2.1],
    trees: [['dead', 4, ['#2b2420', '#3a2e2a', '#241c19']], ['crystal', 2, ['#ff4d00', '#ff7b00', '#ffb703']]],
    rocks: ['#3a302c', '#2b2420'], bush: '#6b3a2a', bushDots: ['#ff7b00', '#ffd23f'], flowers: ['#ff7b00', '#ffd23f', '#ff4d00'], tufts: ['#6b4a32', '#7a5a3a'],
    shrooms: null, props: ['vent', 'obsidian'], ambient: 'embers', lamp: '#ff9a3a' },
  desert: { name: 'Sunny Dunes', desc: 'Hot sand, cool oasis water and tall cactuses.', swatch: ['#ecd29a', '#3ec6d9', '#7c9a3a'],
    sky: '#ffe2ae', ground: ['#edd39b', '#e0c286'], lane: '#c99f68', curb: ['#b98a55', '#a87a48'], wallTop: '#d9a467', cliff: '#b7743f', bed: '#3ec6d9', pit: '#e0a070',
    water: { color: '#3ec6d9', emissive: '#138a9c', ei: 0.3, opacity: 0.82, flow: 0.8, foam: '#e6fffb' }, outer: { color: '#35b9cf', emissive: '#0f6f80', ei: 0.3 },
    hemi: ['#fff3d6', '#c08850', 1.25], sun: ['#ffe7b8', 2.9],
    trees: [['palm', 4, ['#4f9a3a', '#6cb04a', '#3e8a32']], ['cactus', 3, ['#4f8f3a', '#5fa045', '#3f7f32']]],
    rocks: ['#c98b53', '#b07543'], bush: '#7c9a3a', bushDots: ['#ff6fd8', '#ffd23f'], flowers: ['#ff6fd8', '#ffd23f', '#ff8c42'], tufts: ['#b8b05a', '#a8a04a'],
    shrooms: null, props: ['pyramid', 'obelisk'], ambient: 'dust', lamp: '#ffd27a' },
  spooky: { name: 'Moonlit Grove', desc: 'A glowing night forest full of giant mushrooms.', swatch: ['#2a3f35', '#6a4bd6', '#7df9ff'],
    sky: '#1d1645', ground: ['#3f5c4b', '#33503f'], lane: '#6e6474', curb: ['#4a4458', '#5a5468'], wallTop: '#26332d', cliff: '#463f52', bed: '#3a2f6b', pit: '#5a3f8a',
    water: { color: '#7b5bff', emissive: '#4b2bb0', ei: 0.7, opacity: 0.85, flow: 0.6, foam: '#c9b8ff' }, outer: { color: '#2a1f5c', emissive: '#1a0f40', ei: 0.4 },
    hemi: ['#a9a6ff', '#2a2148', 1.25], sun: ['#d2d8ff', 1.95],
    trees: [['spooky', 3, ['#3b2b5a', '#2b1f45', '#4a3570']], ['mushroom', 3, ['#c77dff', '#7df9ff', '#ff6fd8']], ['pine', 2, ['#1f3d33', '#244a3c']]],
    rocks: ['#5a5468', '#4a4458'], bush: '#2f4a3a', bushDots: ['#7df9ff', '#c77dff'], flowers: ['#7df9ff', '#c77dff', '#b8f35b'], tufts: ['#3f6a4a', '#355a40'],
    shrooms: ['#7df9ff', '#c77dff'], props: ['lantern', 'grave'], ambient: 'fireflies', lamp: '#9fe8ff' }
};

// ---------- distance helpers ----------
function segDist(px, pz, a, b) {
  const vx = b.x - a.x, vz = b.z - a.z, wx = px - a.x, wz = pz - a.z;
  const t = clamp((wx * vx + wz * vz) / (vx * vx + vz * vz), 0, 1);
  return Math.hypot(px - (a.x + vx * t), pz - (a.z + vz * t));
}
function lineDist(px, pz, pts) { let d = 1e9; for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, segDist(px, pz, pts[i], pts[i + 1])); return d; }
const ALL_LANES = Object.values(LANES).flatMap(l => [l, l.map(mirror)]);
const laneDist = (x, z) => { let d = 1e9; for (const l of ALL_LANES) d = Math.min(d, lineDist(x, z, l)); return d; };

export class GameMap {
  constructor() {
    const shapes = [];
    for (const l of ALL_LANES) shapes.push({ line: l, w: LANE_W });
    shapes.push({ line: RIVER, w: RIVER_W });
    for (const p of BLUE_PATHS) shapes.push({ line: p, w: PATH_W }, { line: p.map(mirror), w: PATH_W });
    for (const b of BASE) shapes.push({ c: b, r: 31 });
    for (const c of CAMPS) shapes.push({ c, r: c.epic ? 12.5 : c.buff ? 8.2 : 7.6 });
    this.shapes = shapes;
    this.sd = new Float32Array(N * N);
    this.h = new Float32Array(N * N);
    this.river = new Float32Array(N * N);
    const r = rng(77);
    const noise = new Float32Array(N * N);
    for (let i = 0; i < noise.length; i++) noise[i] = r();
    for (let k = 0; k < 3; k++) for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) { const i = z * N + x; noise[i] = (noise[i] * 2 + noise[i - 1] + noise[i + 1] + noise[i - N] + noise[i + N]) / 6; }
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const wx = x - HALF, wz = z - HALF, i = z * N + x;
      let d = 1e9;
      for (const s of shapes) d = Math.min(d, s.line ? lineDist(wx, wz, s.line) - s.w : Math.hypot(wx - s.c.x, wz - s.c.z) - s.r);
      const border = HALF - Math.max(Math.abs(wx), Math.abs(wz));
      d = Math.max(d, 5 - border);
      this.sd[i] = d;
      const rd = lineDist(wx, wz, RIVER);
      this.river[i] = rd;
      let h = (2.4 + noise[i] * 3.4) * smooth(0, 3.4, d);
      if (d < 0.5) h -= 1.0 * (1 - smooth(RIVER_W - 3, RIVER_W + 0.3, rd));
      for (const c of CAMPS) if (c.epic) { const pd = Math.hypot(wx - c.x, wz - c.z); if (pd < 12.5 && d < 0) h = Math.min(h, -0.55 * (1 - smooth(9, 12.5, pd)) - 0.05); }
      // the island edge slopes down into the sea around it
      if (border < 3.5) h = -2.4 + (h + 2.4) * smooth(0, 3.5, border);
      this.h[i] = h;
    }
    this.bridges = BRIDGES;
    this.bushes = BUSHES.filter(b => this.sdAt(b.x, b.z) < -1.4);
    this.bushes.forEach((b, i) => { b.id = i; });
    this.blocked = new Uint8Array(N * N);
    for (let i = 0; i < N * N; i++) this.blocked[i] = this.sd[i] > -0.9 ? 1 : 0;
    this.statics = [];
    for (const t of TOWERS) this.addStatic(t.x, t.z, 2.1);
    for (const c of CORES) this.addStatic(c.x, c.z, 3.4);
    this.nav = new Nav(this);
  }
  addStatic(x, z, r) {
    this.statics.push({ x, z, r });
    for (let dz = -Math.ceil(r); dz <= Math.ceil(r); dz++) for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
      if (Math.hypot(dx, dz) > r + 0.3) continue;
      const cx = Math.round(x + dx) + HALF, cz = Math.round(z + dz) + HALF;
      if (cx >= 0 && cz >= 0 && cx < N && cz < N) this.blocked[cz * N + cx] = 1;
    }
  }
  sample(arr, x, z) {
    const fx = clamp(x + HALF, 0, N - 1.001), fz = clamp(z + HALF, 0, N - 1.001);
    const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz, i = iz * N + ix;
    return (arr[i] * (1 - tx) + arr[i + 1] * tx) * (1 - tz) + (arr[i + N] * (1 - tx) + arr[i + N + 1] * tx) * tz;
  }
  sdAt(x, z) { return this.sample(this.sd, x, z); }
  heightAt(x, z) {
    let h = this.sample(this.h, x, z);
    for (const b of this.bridges) {
      const u = ((x - b.x) - (z - b.z)) / Math.SQRT2, v = ((x - b.x) + (z - b.z)) / Math.SQRT2;
      if (Math.abs(u) < 9 && Math.abs(v) < 2.4) h = Math.max(h, 0.12 + 0.3 * Math.cos(u / 9 * Math.PI / 2));
    }
    return h;
  }
  walkable(x, z) { return this.sdAt(x, z) < -0.35; }
  inRiver(x, z) { return this.sample(this.river, x, z) < RIVER_W - 0.4 && this.sdAt(x, z) < 0; }
  bushAt(x, z) { for (const b of this.bushes) if ((x - b.x) ** 2 + (z - b.z) ** 2 < b.r * b.r) return b.id; return -1; }
  laneOf(x, z) {
    let best = 'mid', bd = 1e9;
    for (const k in LANES) { const d = Math.min(lineDist(x, z, LANES[k]), lineDist(x, z, LANES[k].map(mirror))); if (d < bd) { bd = d; best = k; } }
    return { lane: best, dist: bd };
  }
  // ---------- 3D scenery ----------
  build(scene, quality, themeId = 'candy') {
    const T = this.theme = MAP_THEMES[themeId] || MAP_THEMES.candy;
    const objs = { anim: [], theme: T };
    const fogTex = new THREE.DataTexture(new Uint8Array(160 * 160 * 4).fill(255), 160, 160, THREE.RGBAFormat);
    fogTex.magFilter = fogTex.minFilter = THREE.LinearFilter; fogTex.needsUpdate = true;
    this.fogTex = fogTex; this.fogSize = 160;
    const fogU = { uFog: { value: fogTex }, uHalf: { value: HALF } };
    const fogify = m => fogMaterial(m, fogU);
    this.fogify = fogify;
    const hi = quality === 'high', lo = quality === 'low';
    // ----- terrain with vertex colours and a detail texture -----
    const seg = lo ? 200 : hi ? 300 : 260;
    const geo = new THREE.PlaneGeometry(HALF * 2, HALF * 2, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, cols = new Float32Array(pos.count * 3), c = new THREE.Color(), r = rng(5);
    const g1 = new THREE.Color(T.ground[0]), g2 = new THREE.Color(T.ground[1]), lane = new THREE.Color(T.lane), wallTop = new THREE.Color(T.wallTop),
      cliff = new THREE.Color(T.cliff), bed = new THREE.Color(T.bed), baseB = new THREE.Color('#9fbbe8'), baseR = new THREE.Color('#e8a6b0'), pit = new THREE.Color(T.pit);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = this.heightAt(x, z), sd = this.sdAt(x, z);
      pos.setY(i, h);
      const slope = Math.abs(this.heightAt(x + 0.8, z) - this.heightAt(x - 0.8, z)) + Math.abs(this.heightAt(x, z + 0.8) - this.heightAt(x, z - 0.8));
      const n = r() * 0.07;
      if (sd > 0.3) { c.copy(wallTop).lerp(cliff, clamp(slope * 0.55 - 0.2, 0, 1)); c.offsetHSL(0, 0, n - 0.035 + Math.sin(x * 0.4 + z * 0.3) * 0.02); }
      else {
        const ld = laneDist(x, z);
        c.copy(g1).lerp(g2, 0.5 + 0.5 * Math.sin(x * 0.21) * Math.cos(z * 0.17));
        c.lerp(lane, 1 - smooth(LANE_W - 3.2, LANE_W - 0.2, ld));
        const bd0 = Math.hypot(x - BASE[0].x, z - BASE[0].z), bd1 = Math.hypot(x - BASE[1].x, z - BASE[1].z);
        if (bd0 < 31) c.lerp(baseB, (1 - smooth(22, 31, bd0)) * 0.85);
        if (bd1 < 31) c.lerp(baseR, (1 - smooth(22, 31, bd1)) * 0.85);
        for (const cp of CAMPS) if (cp.epic) { const pd = Math.hypot(x - cp.x, z - cp.z); if (pd < 12) c.lerp(pit, (1 - smooth(7, 12, pd)) * 0.55); }
        if (h < -0.2) c.lerp(bed, clamp(-h * 1.4, 0, 1));
        c.offsetHSL(0, 0, n - 0.035);
      }
      if (h < -1.2) c.lerp(new THREE.Color(T.outer.color), 0.6);
      cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    const detail = canvasTex(256, 256, (g, w, hh) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, hh);
      const rr = rng(9);
      for (let i = 0; i < 1600; i++) { const v = 205 + Math.floor(rr() * 50); g.fillStyle = `rgb(${v},${v},${v})`; const s = 1 + rr() * 3; g.fillRect(rr() * w, rr() * hh, s, s); }
      for (let i = 0; i < 40; i++) { g.globalAlpha = 0.08; g.fillStyle = rr() < 0.5 ? '#000' : '#fff'; g.beginPath(); g.arc(rr() * w, rr() * hh, 8 + rr() * 24, 0, 7); g.fill(); }
      g.globalAlpha = 1;
    }, [HALF / 4, HALF / 4]);
    detail.colorSpace = THREE.NoColorSpace;
    const terrain = new THREE.Mesh(geo, fogify(new THREE.MeshStandardMaterial({ vertexColors: true, map: detail, roughness: 0.94 })));
    terrain.receiveShadow = true; scene.add(terrain); this.terrain = terrain;
    // ----- water / lava / ice inside the map and the sea around it -----
    const W = T.water;
    const wtex = canvasTex(256, 256, (g, w, hh) => {
      g.fillStyle = W.color; g.fillRect(0, 0, w, hh);
      if (W.lava) { for (let i = 0; i < 70; i++) { g.strokeStyle = i % 3 ? '#ffb703' : '#ff3d00'; g.lineWidth = 2 + Math.random() * 6; g.globalAlpha = 0.55; g.beginPath(); const x = Math.random() * w, y = Math.random() * hh; g.moveTo(x, y); for (let k = 0; k < 4; k++) g.lineTo(x + (Math.random() - 0.5) * 120, y + (Math.random() - 0.5) * 120); g.stroke(); } }
      else if (W.ice) { g.globalAlpha = 0.5; g.strokeStyle = '#ffffff'; g.lineWidth = 2; for (let i = 0; i < 30; i++) { g.beginPath(); let x = Math.random() * w, y = Math.random() * hh; g.moveTo(x, y); for (let k = 0; k < 3; k++) { x += (Math.random() - 0.5) * 70; y += (Math.random() - 0.5) * 70; g.lineTo(x, y); } g.stroke(); } }
      else { g.globalAlpha = 0.35; g.strokeStyle = W.foam; g.lineWidth = 3; for (let i = 0; i < 26; i++) { const y = Math.random() * hh; g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x * 0.05 + i) * 5); g.stroke(); } }
      g.globalAlpha = 1;
    });
    wtex.repeat.set(36, 36);
    const wmat = new THREE.MeshStandardMaterial({ map: wtex, transparent: W.opacity < 1, opacity: W.opacity, roughness: W.lava ? 0.6 : 0.12, metalness: 0.1, emissive: new THREE.Color(W.emissive), emissiveIntensity: W.ei });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), fogify(wmat));
    water.rotation.x = -Math.PI / 2; water.position.y = -0.38; scene.add(water);
    const otex = wtex.clone(); otex.needsUpdate = true; otex.repeat.set(80, 80);
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshStandardMaterial({ map: otex, color: T.outer.color, roughness: 0.3, emissive: new THREE.Color(T.outer.emissive), emissiveIntensity: T.outer.ei }));
    outer.rotation.x = -Math.PI / 2; outer.position.y = -1.7; scene.add(outer);
    objs.anim.push((t) => { const f = W.flow; wtex.offset.set(t * 0.012 * f, t * 0.02 * f); otex.offset.set(-t * 0.006 * f, t * 0.01 * f); if (W.lava) wmat.emissiveIntensity = W.ei + Math.sin(t * 1.5) * 0.25; });
    // bridges
    const plank = fogify(new THREE.MeshStandardMaterial({ color: T === MAP_THEMES.frost ? '#9a7a5a' : '#a8754a', roughness: 0.85 }));
    for (const b of this.bridges) {
      const g = new THREE.Group(); g.position.set(b.x, 0, b.z); g.rotation.y = Math.PI / 4;
      for (let k = -8; k <= 8; k++) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.2, 5), plank); p.position.set(k, 0.12 + 0.3 * Math.cos(k / 9 * Math.PI / 2), 0); p.castShadow = p.receiveShadow = true; g.add(p); }
      for (const s of [-1, 1]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(17, 0.16, 0.16), plank); rail.position.set(0, 1.05, s * 2.4); g.add(rail); for (let k = -8; k <= 8; k += 4) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 1, 6), plank); post.position.set(k, 0.6, s * 2.4); g.add(post); } }
      scene.add(g);
    }
    this.buildTrees(scene, quality, fogify, T);
    this.buildBushes(scene, fogify, T);
    this.buildLanes(scene, quality, fogify, T, objs);
    this.buildDecor(scene, quality, fogify, T, objs);
    return objs;
  }
  // ----- trees and big plants in the theme's style -----
  treeParts(kind, hi) {
    const d = hi ? 1 : 0;
    const trunk = (h = 1.6, r0 = 0.22, r1 = 0.32) => { const g = new THREE.CylinderGeometry(r0, r1, h, 6); g.translate(0, h / 2, 0); return g; };
    const at = (g, x, y, z) => { g.translate(x, y, z); return g; };
    switch (kind) {
      case 'round': return [{ geo: trunk(), color: '#8a5a3c' }, { geo: at(new THREE.IcosahedronGeometry(1.5, d), 0, 2.6, 0), pal: true }, { geo: at(new THREE.IcosahedronGeometry(0.9, d), 0.7, 3.4, 0.3), pal: true, shade: 0.08 }];
      case 'blossom': return [{ geo: trunk(1.8), color: '#7a4a32' }, { geo: at(new THREE.IcosahedronGeometry(1.6, d), 0, 2.8, 0), pal: true }, { geo: at(new THREE.IcosahedronGeometry(0.8, d), -0.8, 3.3, 0.2), pal: true, shade: 0.06 }];
      case 'pine': return [{ geo: trunk(1.2), color: '#6b4430' }, { geo: at(new THREE.ConeGeometry(1.6, 2.6, 8), 0, 2.3, 0), pal: true }, { geo: at(new THREE.ConeGeometry(1.15, 2.0, 8), 0, 3.6, 0), pal: true, shade: 0.06 }];
      case 'snowpine': return [{ geo: trunk(1.2), color: '#5a3a2a' }, { geo: at(new THREE.ConeGeometry(1.7, 2.6, 8), 0, 2.3, 0), pal: true }, { geo: at(new THREE.ConeGeometry(1.2, 1.0, 8), 0, 3.15, 0), color: '#ffffff' }, { geo: at(new THREE.ConeGeometry(1.15, 2.0, 8), 0, 3.8, 0), pal: true, shade: 0.05 }, { geo: at(new THREE.ConeGeometry(0.75, 0.8, 8), 0, 4.55, 0), color: '#ffffff' }];
      case 'dead': { const br = []; for (let i = 0; i < 3; i++) { const g = new THREE.CylinderGeometry(0.06, 0.14, 1.4, 5); g.translate(0, 0.7, 0); g.rotateZ(0.9 - i * 0.2); g.rotateY(i * 2.1); g.translate(0, 1.8 + i * 0.35, 0); br.push(g); } return [{ geo: trunk(2.8, 0.14, 0.34), pal: true }, { geo: mergeGeometries(br), pal: true, shade: 0.05 }, { geo: at(new THREE.IcosahedronGeometry(0.25, 0), 0, 0.15, 0.3), color: '#ff7b00', glow: 1.5 }]; }
      case 'crystal': { const g1 = new THREE.OctahedronGeometry(0.8, 0); g1.scale(0.7, 2.2, 0.7); g1.translate(0, 1.6, 0); const g2 = new THREE.OctahedronGeometry(0.55, 0); g2.scale(0.7, 2, 0.7); g2.rotateZ(0.5); g2.translate(0.7, 1.0, 0.2); const g3 = new THREE.OctahedronGeometry(0.5, 0); g3.scale(0.7, 1.8, 0.7); g3.rotateZ(-0.6); g3.translate(-0.6, 0.9, -0.2); return [{ geo: mergeGeometries([g1, g2, g3]), pal: true, glow: 0.6, rough: 0.15 }, { geo: at(new THREE.DodecahedronGeometry(0.8, 0), 0, 0.2, 0), color: '#4a4458' }]; }
      case 'palm': { const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.3, 2, 0), new THREE.Vector3(1.0, 4, 0)); const tr = new THREE.TubeGeometry(curve, 8, 0.2, 6); const fr = []; for (let i = 0; i < 6; i++) { const g = new THREE.SphereGeometry(1, 8, 4); g.scale(1.7, 0.14, 0.45); g.translate(1.5, -0.25, 0); g.rotateZ(-0.35); g.rotateY(i / 6 * Math.PI * 2); g.translate(1.0, 4.05, 0); fr.push(g); } return [{ geo: tr, color: '#a0754a' }, { geo: mergeGeometries(fr), pal: true }, { geo: at(new THREE.SphereGeometry(0.22, 6, 5), 0.9, 3.85, 0.2), color: '#6b4a2a' }]; }
      case 'cactus': { const m = new THREE.CapsuleGeometry(0.42, 2.4, 4, 8); m.translate(0, 1.6, 0); const a1 = new THREE.CapsuleGeometry(0.26, 0.9, 4, 6); a1.translate(0.7, 1.9, 0); const a1b = new THREE.CapsuleGeometry(0.24, 0.5, 4, 6); a1b.rotateZ(Math.PI / 2); a1b.translate(0.42, 1.45, 0); const a2 = new THREE.CapsuleGeometry(0.24, 0.7, 4, 6); a2.translate(-0.66, 1.4, 0); const a2b = new THREE.CapsuleGeometry(0.22, 0.45, 4, 6); a2b.rotateZ(Math.PI / 2); a2b.translate(-0.4, 1.05, 0); return [{ geo: mergeGeometries([m, a1, a1b, a2, a2b]), pal: true }, { geo: at(new THREE.IcosahedronGeometry(0.2, 0), 0, 3.25, 0), color: '#ff6fd8' }]; }
      case 'mushroom': return [{ geo: at(new THREE.CylinderGeometry(0.3, 0.45, 2.4, 8), 0, 1.2, 0), color: '#efe6ff' }, { geo: at(new THREE.SphereGeometry(1.7, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, 2.2, 0), pal: true, glow: 0.45 }, { geo: at(new THREE.CylinderGeometry(1.65, 1.65, 0.12, 14), 0, 2.22, 0), color: '#f4ecff' }];
      case 'spooky': { const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.4, 1.2, 0.2), new THREE.Vector3(-0.3, 2.4, -0.1), new THREE.Vector3(0.3, 3.4, 0.2)]); return [{ geo: new THREE.TubeGeometry(curve, 10, 0.24, 6), color: '#2a2238' }, { geo: at(new THREE.IcosahedronGeometry(1.4, 0), 0.2, 3.7, 0), pal: true }, { geo: at(new THREE.IcosahedronGeometry(0.9, 0), -0.8, 3.1, 0.4), pal: true, shade: 0.05 }]; }
    }
    return [];
  }
  buildTrees(scene, quality, fogify, T) {
    const r = rng(11), spots = [];
    const step = quality === 'low' ? 4.6 : quality === 'medium' ? 3.8 : 3.3;
    for (let z = -HALF + 3; z < HALF - 2; z += step) for (let x = -HALF + 3; x < HALF - 2; x += step) {
      const px = x + (r() - 0.5) * step * 0.9, pz = z + (r() - 0.5) * step * 0.9;
      const sd = this.sdAt(px, pz);
      if (sd < 1.7 || r() < 0.08 || HALF - Math.max(Math.abs(px), Math.abs(pz)) < 3) continue;
      spots.push([px, pz, this.heightAt(px, pz), 0.8 + r() * 0.75, r(), r()]);
    }
    const total = T.trees.reduce((s, t) => s + t[1], 0);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
    const groups = T.trees.map(() => []);
    for (const sp of spots) { let k = sp[5] * total, i = 0; while (k > T.trees[i][1] && i < T.trees.length - 1) { k -= T.trees[i][1]; i++; } groups[i].push(sp); }
    T.trees.forEach(([kind, , pal], gi) => {
      const list = groups[gi]; if (!list.length) return;
      for (const part of this.treeParts(kind, quality === 'high')) {
        const mat = fogify(new THREE.MeshStandardMaterial({ color: part.pal ? '#ffffff' : part.color, roughness: part.rough ?? 0.8, flatShading: true, emissive: part.glow ? new THREE.Color(part.pal ? pal[0] : part.color) : new THREE.Color(0), emissiveIntensity: part.glow || 0 }));
        const im = new THREE.InstancedMesh(part.geo, mat, list.length);
        list.forEach(([x, z, h, sc, k], i) => {
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), k * 6.28); s.setScalar(sc); p.set(x, h - 0.1, z);
          m.compose(p, q, s); im.setMatrixAt(i, m);
          if (part.pal) im.setColorAt(i, col.set(pal[Math.floor(k * 1000) % pal.length]).offsetHSL(0, 0, part.shade || 0));
        });
        im.castShadow = true; im.receiveShadow = true; scene.add(im);
      }
    });
    // rocks along the cliff edges
    const rocks = [], rr = rng(19);
    for (let i = 0; i < 1500; i++) { const x = (rr() - 0.5) * HALF * 2, z = (rr() - 0.5) * HALF * 2, sd = this.sdAt(x, z); if (sd > 0.2 && sd < 2.4) rocks.push([x, z, this.heightAt(x, z), 0.5 + rr() * 1.0, rr()]); }
    const rockM = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), fogify(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true })), rocks.length);
    rocks.forEach(([x, z, h, sc, k], i) => { q.setFromEuler(new THREE.Euler(k * 3, k * 9, k * 5)); s.set(sc * 1.3, sc * 0.8, sc); p.set(x, h + 0.1, z); m.compose(p, q, s); rockM.setMatrixAt(i, m); rockM.setColorAt(i, col.set(T.rocks[k < 0.5 ? 0 : 1])); });
    rockM.castShadow = rockM.receiveShadow = true; scene.add(rockM);
  }
  buildBushes(scene, fogify, T) {
    const r = rng(23);
    this.bushMeshes = [];
    for (const b of this.bushes) {
      const parts = [];
      for (let i = 0; i < 11; i++) {
        const a = i / 11 * Math.PI * 2 + r(), d = i === 0 ? 0 : 1.2 + r() * 1.6;
        const g = new THREE.IcosahedronGeometry(1.1 + r() * 0.6, 1);
        g.scale(1, 0.8, 1); g.translate(Math.cos(a) * d, 0.75 + r() * 0.45, Math.sin(a) * d);
        parts.push(g);
      }
      const mat = fogify(new THREE.MeshStandardMaterial({ color: T.bush, roughness: 0.8, flatShading: true, transparent: true, opacity: 1 }));
      const mesh = new THREE.Mesh(mergeGeometries(parts), mat);
      mesh.position.set(b.x, this.heightAt(b.x, b.z), b.z);
      mesh.castShadow = true; mesh.receiveShadow = true;
      // little flowers / berries on top
      if (T.bushDots) for (let i = 0; i < 7; i++) {
        const a = r() * 6.28, d = r() * 2.4;
        const dot = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 0), new THREE.MeshStandardMaterial({ color: T.bushDots[i % T.bushDots.length], emissive: T.bushDots[i % T.bushDots.length], emissiveIntensity: T.ambient === 'fireflies' || T.ambient === 'embers' ? 0.9 : 0.15, transparent: true }));
        dot.position.set(Math.cos(a) * d, 1.4 + r() * 0.5, Math.sin(a) * d); mesh.add(dot);
      }
      scene.add(mesh); this.bushMeshes.push(mesh);
      b.mesh = mesh;
    }
  }
  // ----- lane borders: curb stones and lanterns -----
  buildLanes(scene, quality, fogify, T, objs) {
    const r = rng(41), stones = [], lamps = [];
    for (const l of ALL_LANES) for (let i = 0; i < l.length - 1; i++) {
      const a = l[i], b = l[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z), dx = (b.x - a.x) / len, dz = (b.z - a.z) / len;
      for (let t = 0; t < len; t += 2.2) for (const side of [-1, 1]) {
        const x = a.x + dx * t - dz * side * (LANE_W - 0.6), z = a.z + dz * t + dx * side * (LANE_W - 0.6);
        if (this.sdAt(x, z) > 0.4 || Math.hypot(x - BASE[0].x, z - BASE[0].z) < 30 || Math.hypot(x - BASE[1].x, z - BASE[1].z) < 30) continue;
        if (this.inRiver(x, z)) continue;
        stones.push([x + (r() - 0.5) * 0.6, z + (r() - 0.5) * 0.6, r()]);
        if (Math.round(t / 2.2) % 11 === (side > 0 ? 0 : 5) && this.sdAt(x, z) < -0.2) lamps.push([x, z]);
      }
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
    const st = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.45, 0), fogify(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, flatShading: true })), stones.length);
    stones.forEach(([x, z, k], i) => { q.setFromEuler(new THREE.Euler(k * 3, k * 7, 0)); s.set(1 + k * 0.6, 0.55 + k * 0.3, 1); p.set(x, this.heightAt(x, z) + 0.12, z); m.compose(p, q, s); st.setMatrixAt(i, m); st.setColorAt(i, col.set(T.curb[k < 0.5 ? 0 : 1])); });
    st.receiveShadow = true; st.castShadow = true; scene.add(st);
    const postG = new THREE.CylinderGeometry(0.09, 0.13, 2.6, 6); postG.translate(0, 1.3, 0);
    const lampG = new THREE.OctahedronGeometry(0.32, 0); lampG.scale(1, 1.3, 1); lampG.translate(0, 2.75, 0);
    const posts = new THREE.InstancedMesh(postG, fogify(new THREE.MeshStandardMaterial({ color: '#4a3b35', roughness: 0.6, metalness: 0.4 })), lamps.length);
    const lanterns = new THREE.InstancedMesh(lampG, new THREE.MeshStandardMaterial({ color: T.lamp, emissive: T.lamp, emissiveIntensity: 1.6 }), lamps.length);
    const halo = new THREE.InstancedMesh(new THREE.SphereGeometry(0.7, 10, 8).translate(0, 2.75, 0), new THREE.MeshBasicMaterial({ color: T.lamp, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }), lamps.length);
    lamps.forEach(([x, z], i) => { p.set(x, this.heightAt(x, z), z); m.compose(p, q.identity(), s.setScalar(1)); posts.setMatrixAt(i, m); lanterns.setMatrixAt(i, m); halo.setMatrixAt(i, m); });
    posts.castShadow = true; scene.add(posts, lanterns, halo);
    objs.anim.push(t => { halo.material.opacity = 0.16 + Math.sin(t * 2) * 0.04; });
  }
  buildDecor(scene, quality, fogify, T, objs) {
    const r = rng(31), m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
    const many = quality === 'low' ? 0.5 : quality === 'high' ? 1.4 : 1;
    // flowers / crystals / glowing pebbles in the grass
    if (T.flowers) {
      const fl = [];
      for (let i = 0; i < 4000 * many && fl.length < 1800 * many; i++) {
        const x = (r() - 0.5) * HALF * 2, z = (r() - 0.5) * HALF * 2, sd = this.sdAt(x, z);
        if (sd > -0.5 || sd < -5.5 || this.heightAt(x, z) < -0.1 || laneDist(x, z) < LANE_W - 1) continue;
        fl.push([x, z, this.heightAt(x, z), r()]);
      }
      const glow = T.ambient === 'embers' || T.ambient === 'fireflies';
      const im = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.18, 0), fogify(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6, emissive: glow ? '#ffffff' : '#222222', emissiveIntensity: glow ? 0.5 : 1 })), fl.length);
      fl.forEach(([x, z, h, k], i) => { p.set(x, h + 0.25, z); s.setScalar(0.8 + k); m.compose(p, q.identity(), s); im.setMatrixAt(i, m); im.setColorAt(i, col.set(T.flowers[i % T.flowers.length])); });
      scene.add(im);
    }
    // grass tufts (or snow mounds)
    const tufts = [];
    for (let i = 0; i < 2600 * many; i++) { const x = (r() - 0.5) * HALF * 2, z = (r() - 0.5) * HALF * 2, sd = this.sdAt(x, z); if (sd < 0.8 && sd > -5 && this.heightAt(x, z) > -0.1 && laneDist(x, z) > LANE_W - 1.5) tufts.push([x, z, this.heightAt(x, z), r()]); }
    if (T.tufts) {
      const tg = new THREE.ConeGeometry(0.16, 0.75, 4); tg.translate(0, 0.37, 0);
      const tm = new THREE.InstancedMesh(tg, fogify(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 })), tufts.length);
      tufts.forEach(([x, z, h, k], i) => { p.set(x, h, z); q.setFromEuler(new THREE.Euler((k - 0.5) * 0.4, k * 6, 0)); s.setScalar(0.7 + k * 0.9); m.compose(p, q, s); tm.setMatrixAt(i, m); tm.setColorAt(i, col.set(T.tufts[k < 0.5 ? 0 : 1])); });
      scene.add(tm);
    } else {
      const mg = new THREE.SphereGeometry(0.6, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2);
      const mm = new THREE.InstancedMesh(mg, fogify(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7 })), Math.floor(tufts.length / 2));
      for (let i = 0; i < mm.count; i++) { const [x, z, h, k] = tufts[i]; p.set(x, h - 0.1, z); s.set(1 + k, 0.5 + k * 0.4, 1 + k * 0.6); m.compose(p, q.identity(), s); mm.setMatrixAt(i, m); }
      mm.receiveShadow = true; scene.add(mm);
    }
    // little mushrooms and pebbles near the jungle edges
    const peb = [];
    for (let i = 0; i < 1600 * many; i++) { const x = (r() - 0.5) * HALF * 2, z = (r() - 0.5) * HALF * 2, sd = this.sdAt(x, z); if (sd < 0.2 && sd > -2.5 && this.heightAt(x, z) > -0.1) peb.push([x, z, this.heightAt(x, z), r()]); }
    const pm = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.22, 0), fogify(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true })), peb.length);
    peb.forEach(([x, z, h, k], i) => { p.set(x, h + 0.08, z); q.setFromEuler(new THREE.Euler(k * 4, k * 9, 0)); s.set(1 + k, 0.6, 1); m.compose(p, q, s); pm.setMatrixAt(i, m); pm.setColorAt(i, col.set(T.rocks[k < 0.5 ? 0 : 1]).offsetHSL(0, 0, 0.08)); });
    scene.add(pm);
    if (T.shrooms) {
      const sh = peb.filter((_, i) => i % 5 === 0);
      const stem = new THREE.CylinderGeometry(0.07, 0.1, 0.4, 6); stem.translate(0, 0.2, 0);
      const cap = new THREE.SphereGeometry(0.24, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2); cap.translate(0, 0.36, 0);
      const st = new THREE.InstancedMesh(stem, fogify(new THREE.MeshStandardMaterial({ color: '#f4ecff' })), sh.length);
      const cp = new THREE.InstancedMesh(cap, fogify(new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: T.ambient === 'fireflies' ? 0.5 : 0.05 })), sh.length);
      sh.forEach(([x, z, h, k], i) => { p.set(x + 0.4, h, z); s.setScalar(0.8 + k * 1.2); m.compose(p, q.identity(), s); st.setMatrixAt(i, m); cp.setMatrixAt(i, m); cp.setColorAt(i, col.set(T.shrooms[i % T.shrooms.length])); });
      scene.add(st, cp);
    }
    // bases: plazas, flags, fountains, shop stalls
    for (const team of [BLUE, RED]) {
      const b = BASE[team], f = FOUNTAIN[team], tc = TEAM_COLOR[team];
      const plaza = new THREE.Mesh(new THREE.CylinderGeometry(13, 13.6, 0.3, 56), fogify(M(team ? '#eab3bd' : '#b2c9ef', { rough: 0.55 })));
      plaza.position.set(f.x + (team ? -3 : 3), 0.08, f.z + (team ? 3 : -3)); plaza.receiveShadow = true; scene.add(plaza);
      const tiles = new THREE.Mesh(new THREE.RingGeometry(6, 12.6, 56, 1), new THREE.MeshStandardMaterial({ color: team ? '#f6d0d6' : '#d2e0f7', roughness: 0.5, side: THREE.DoubleSide }));
      tiles.rotation.x = -Math.PI / 2; tiles.position.set(plaza.position.x, 0.24, plaza.position.z); tiles.receiveShadow = true; scene.add(tiles);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(12.6, 0.25, 8, 72), M(tc, { emissive: tc, ei: 1.4 }));
      ring.rotation.x = Math.PI / 2; ring.position.set(plaza.position.x, 0.3, plaza.position.z); scene.add(ring);
      // fountain
      const fg = new THREE.Group(); fg.position.set(f.x, 0, f.z);
      const basin = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.7, 1, 28), M('#ffffff', { rough: 0.35 })); basin.position.y = 0.5; fg.add(basin);
      const pool = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 0.2, 28), M(tc, { emissive: tc, ei: 0.7, rough: 0.1 })); pool.position.y = 1; fg.add(pool);
      const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 2.6, 12), M('#ffffff')); spout.position.y = 2; fg.add(spout);
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.9, 20, 14), M(tc, { emissive: tc, ei: 2 })); orb.position.y = 3.8; fg.add(orb);
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 2.4, 8), M('#ffffff')); pil.position.set(Math.cos(a) * 5, 1.2, Math.sin(a) * 5); fg.add(pil); const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.35), M(tc, { emissive: tc, ei: 1.5 })); gem.position.set(Math.cos(a) * 5, 2.7, Math.sin(a) * 5); fg.add(gem); }
      fg.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      scene.add(fg);
      objs.anim.push(t => { orb.position.y = 3.8 + Math.sin(t * 2) * 0.3; orb.rotation.y = t; });
      // shop stall
      const sg = new THREE.Group();
      const sp = { x: f.x + (team ? -9 : 9), z: f.z + (team ? 1 : -1) };
      sg.position.set(sp.x, 0, sp.z); sg.lookAt(b.x, 0, b.z);
      const counter = new THREE.Mesh(new THREE.BoxGeometry(4, 1.3, 1.6), M('#a8754a')); counter.position.y = 0.65; sg.add(counter);
      for (const sx of [-1.8, 1.8]) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.4, 6), M('#ffffff')); pole.position.set(sx, 1.7, 0.6); sg.add(pole); }
      const awn = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.2, 2.4), M('#ffffff', { map: canvasTex(128, 32, (g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ffffff' : tc; g.fillRect(i * w / 8, 0, w / 8, h); } }) }));
      awn.position.set(0, 3.4, 0.2); awn.rotation.x = 0.25; sg.add(awn);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.8), M('#ffffff', { map: canvasTex(256, 80, (g, w, h) => { g.fillStyle = '#ffd23f'; g.fillRect(0, 0, w, h); g.fillStyle = '#1b1036'; g.font = '400 56px "Lilita One", sans-serif'; g.textAlign = 'center'; g.fillText('SHOP', w / 2, 60); }), double: true }));
      sign.position.set(0, 2.55, 1.05); sg.add(sign);
      for (let i = 0; i < 5; i++) { const ball = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), M(['#ff4d6d', '#ffd23f', '#7bd389', '#c77dff', '#3a86ff'][i], { emissive: '#222' })); ball.position.set(-1.4 + i * 0.7, 1.5, 0); sg.add(ball); }
      sg.traverse(o => { if (o.isMesh) o.castShadow = true; });
      scene.add(sg);
      // flags around the base
      for (let i = 0; i < 8; i++) {
        const ang = (team ? 3 : -1) * Math.PI / 4 + (i - 3.5) * 0.36 + Math.PI;
        const px = b.x + Math.cos(ang) * 27, pz = b.z + Math.sin(ang) * 27;
        if (this.sdAt(px, pz) > 1 || this.sdAt(px, pz) < -7) continue;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6, 6), M('#ffffff')); pole.position.set(px, 3, pz); pole.castShadow = true; scene.add(pole);
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.3, 8, 2), M(tc, { double: true, emissive: tc, ei: 0.2 })); flag.position.set(px + 1.1, 5.2, pz); scene.add(flag);
        const fp = flag.geometry.attributes.position, base0 = fp.array.slice();
        objs.anim.push(t => { for (let k = 0; k < fp.count; k++) { const x0 = base0[k * 3]; fp.setZ(k, Math.sin(t * 4 + x0 * 2 + i) * 0.25 * (x0 + 1.1)); } fp.needsUpdate = true; });
      }
    }
    // pits: glowing rings and pillars around the dragon and boss pits
    for (const cp of CAMPS) if (cp.epic) {
      const col2 = cp.id === 'dragon' ? '#ff6fd8' : '#ffd23f';
      const ring = new THREE.Mesh(new THREE.TorusGeometry(12, 0.22, 6, 72), M(col2, { emissive: col2, ei: 1.2 }));
      ring.rotation.x = Math.PI / 2; ring.position.set(cp.x, this.heightAt(cp.x, cp.z) + 0.1, cp.z); scene.add(ring);
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, px = cp.x + Math.cos(a) * 13.4, pz = cp.z + Math.sin(a) * 13.4; if (this.sdAt(px, pz) < -1.5) continue; const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 2.8, 8), fogify(M('#efe3d0'))); pil.position.set(px, this.heightAt(px, pz) + 1.4, pz); pil.castShadow = true; scene.add(pil); const cap = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), M(col2, { emissive: col2, ei: 1 })); cap.position.set(px, this.heightAt(px, pz) + 3, pz); scene.add(cap); }
    }
    // theme set pieces on the high ground
    const nProps = quality === 'low' ? 18 : 34;
    let placed = 0;
    for (let i = 0; i < 400 && placed < nProps; i++) {
      const x = (r() - 0.5) * HALF * 1.85, z = (r() - 0.5) * HALF * 1.85;
      const sd = this.sdAt(x, z);
      if (sd < 3 || sd > 10 || HALF - Math.max(Math.abs(x), Math.abs(z)) < 6) continue;
      const h = this.heightAt(x, z), kind = T.props[placed % 2];
      const g = makeProp(kind, r, fogify, objs);
      if (!g) continue;
      g.position.set(x, h, z); g.rotation.y = r() * 6.28;
      g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      scene.add(g); placed++;
    }
  }
  // fog-of-war texture: 255 where our team can see
  updateFog(sources) {
    const img = this.fogTex.image.data, Sz = this.fogSize, k = Sz / (HALF * 2);
    for (let i = 0; i < Sz * Sz; i++) img[i * 4] = 0;
    for (const s of sources) {
      const cx = (s.x + HALF) * k, cz = (s.z + HALF) * k, rr = s.r * k;
      const x0 = Math.max(0, Math.floor(cx - rr - 1)), x1 = Math.min(Sz - 1, Math.ceil(cx + rr + 1)), z0 = Math.max(0, Math.floor(cz - rr - 1)), z1 = Math.min(Sz - 1, Math.ceil(cz + rr + 1));
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
        const v = d < rr - 1 ? 255 : d < rr + 1 ? Math.round(255 * (rr + 1 - d) / 2) : 0;
        const i = (z * Sz + x) * 4; if (v > img[i]) img[i] = v;
      }
    }
    this.fogTex.needsUpdate = true;
  }
  // picture of the map for the minimap
  minimapImage(size = 256) {
    const T = this.theme || MAP_THEMES.candy;
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d'), img = g.createImageData(size, size);
    const hex = h => { const v = new THREE.Color(h); return [v.r * 255, v.g * 255, v.b * 255]; };
    const wall = hex(T.wallTop).map(v => v * 0.7), grass = hex(T.ground[0]), lane = hex(T.lane), water = hex(T.water.color), outer = hex(T.outer.color);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const wx = (x / size) * HALF * 2 - HALF, wz = (y / size) * HALF * 2 - HALF;
      const sd = this.sdAt(wx, wz), h = this.heightAt(wx, wz);
      let col = sd > 0.3 ? wall : laneDist(wx, wz) < LANE_W - 1.5 ? lane : grass;
      if (h < -0.25) col = water;
      if (h < -1.4) col = outer;
      const b0 = Math.hypot(wx - BASE[0].x, wz - BASE[0].z), b1 = Math.hypot(wx - BASE[1].x, wz - BASE[1].z);
      if (b0 < 24) col = [140, 175, 230]; if (b1 < 24) col = [230, 150, 150];
      const i = (y * size + x) * 4; img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }
}
function smooth(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

// ---------- theme set pieces ----------
function makeProp(kind, r, fogify, objs) {
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  const F = (c, o = {}) => fogify(M(c, o));
  switch (kind) {
    case 'windmill': {
      add(new THREE.CylinderGeometry(0.5, 0.9, 4.5, 8), F('#fff3e0'), 0, 2.25, 0); add(new THREE.ConeGeometry(0.95, 1.3, 8), F('#ff4d6d'), 0, 5.1, 0);
      const blades = new THREE.Group(); blades.position.set(0, 4.3, 0.85); g.add(blades);
      for (let k = 0; k < 4; k++) { const piv = new THREE.Group(); piv.rotation.z = k * Math.PI / 2; const bl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 2.7, 0.06), F(k % 2 ? '#ffd23f' : '#ffffff')); bl.position.y = 1.35; piv.add(bl); blades.add(piv); }
      const sp = 0.8 + r(); objs.anim.push(t => { blades.rotation.z = t * sp; }); return g;
    }
    case 'lollipop': {
      add(new THREE.CylinderGeometry(0.1, 0.1, 3, 6), F('#ffffff'), 0, 1.5, 0);
      const candy = add(new THREE.CylinderGeometry(1, 1, 0.3, 24), F('#ffffff', { map: canvasTex(64, 64, (c, w) => { for (let k = 0; k < 8; k++) { c.fillStyle = k % 2 ? '#ff6fd8' : '#ffffff'; c.beginPath(); c.moveTo(w / 2, w / 2); c.arc(w / 2, w / 2, w / 2, k * Math.PI / 4, (k + 1) * Math.PI / 4); c.fill(); } }) }), 0, 3.2, 0);
      candy.rotation.x = Math.PI / 2; objs.anim.push(t => { candy.rotation.z = t * 0.6; }); return g;
    }
    case 'snowman': {
      add(new THREE.SphereGeometry(1.1, 14, 10), F('#ffffff'), 0, 1.0, 0); add(new THREE.SphereGeometry(0.8, 14, 10), F('#ffffff'), 0, 2.5, 0); add(new THREE.SphereGeometry(0.55, 14, 10), F('#ffffff'), 0, 3.6, 0);
      const nose = add(new THREE.ConeGeometry(0.1, 0.5, 6), F('#ff8c42'), 0, 3.6, 0.6); nose.rotation.x = Math.PI / 2;
      for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.07, 6, 5), F('#1b1036'), 0.18 * s, 3.75, 0.48);
      add(new THREE.CylinderGeometry(0.4, 0.4, 0.5, 12), F('#2b2d42'), 0, 4.2, 0); add(new THREE.CylinderGeometry(0.6, 0.6, 0.06, 12), F('#2b2d42'), 0, 3.97, 0);
      add(new THREE.TorusGeometry(0.62, 0.12, 6, 16), F('#ff4d6d'), 0, 3.15, 0).rotation.x = Math.PI / 2; return g;
    }
    case 'icespike': { for (let k = 0; k < 5; k++) { const h = 2 + r() * 3; const c = add(new THREE.ConeGeometry(0.4 + r() * 0.3, h, 6), new THREE.MeshStandardMaterial({ color: '#bfeaff', emissive: '#5fb8e6', emissiveIntensity: 0.4, roughness: 0.1, transparent: true, opacity: 0.85 }), (r() - 0.5) * 2, h / 2, (r() - 0.5) * 2); c.rotation.z = (r() - 0.5) * 0.4; } return g; }
    case 'vent': {
      add(new THREE.CylinderGeometry(1.3, 1.8, 0.8, 10), F('#2b2420', { flat: true }), 0, 0.3, 0);
      const core = add(new THREE.CylinderGeometry(0.8, 0.8, 0.2, 12), new THREE.MeshStandardMaterial({ color: '#ff7b00', emissive: '#ff4d00', emissiveIntensity: 2 }), 0, 0.72, 0);
      objs.anim.push(t => { core.material.emissiveIntensity = 1.6 + Math.sin(t * 3 + r() * 6) * 0.6; }); objs.vents = objs.vents || []; objs.vents.push(g); return g;
    }
    case 'obsidian': { for (let k = 0; k < 4; k++) { const h = 2 + r() * 3.5; const c = add(new THREE.ConeGeometry(0.5, h, 5), new THREE.MeshStandardMaterial({ color: '#1b1418', roughness: 0.15, metalness: 0.4, emissive: '#ff3d00', emissiveIntensity: 0.15, flatShading: true }), (r() - 0.5) * 2.4, h / 2, (r() - 0.5) * 2.4); c.rotation.z = (r() - 0.5) * 0.5; } return g; }
    case 'pyramid': { const p = add(new THREE.ConeGeometry(3, 3.6, 4), F('#e9c57a', { flat: true }), 0, 1.8, 0); p.rotation.y = Math.PI / 4; add(new THREE.ConeGeometry(0.5, 0.6, 4), F('#ffd23f', { metal: 0.6 }), 0, 3.45, 0).rotation.y = Math.PI / 4; return g; }
    case 'obelisk': { add(new THREE.BoxGeometry(0.9, 4.5, 0.9), F('#d9b77a'), 0, 2.25, 0); add(new THREE.ConeGeometry(0.64, 0.9, 4), F('#ffd23f', { metal: 0.6 }), 0, 4.95, 0).rotation.y = Math.PI / 4; add(new THREE.BoxGeometry(1.6, 0.4, 1.6), F('#c9a46a'), 0, 0.2, 0); return g; }
    case 'lantern': {
      add(new THREE.CylinderGeometry(0.1, 0.12, 3.4, 6), F('#2a2238'), 0, 1.7, 0); add(new THREE.BoxGeometry(1.2, 0.1, 0.1), F('#2a2238'), 0.5, 3.3, 0);
      const l = add(new THREE.SphereGeometry(0.38, 12, 10), new THREE.MeshStandardMaterial({ color: '#ffd27a', emissive: '#ffb347', emissiveIntensity: 1.8 }), 1.0, 2.9, 0); l.scale.y = 1.25;
      objs.anim.push(t => { l.position.x = 1.0 + Math.sin(t * 1.3 + r() * 6) * 0.06; }); return g;
    }
    case 'grave': { const s2 = add(new THREE.BoxGeometry(1.1, 1.5, 0.3), F('#8a8696'), 0, 0.75, 0); void s2; add(new THREE.CylinderGeometry(0.55, 0.55, 0.3, 14, 1, false, 0, Math.PI), F('#8a8696'), 0, 1.5, 0).rotation.x = Math.PI / 2; add(new THREE.BoxGeometry(1.6, 0.25, 0.9), F('#5a5468'), 0, 0.12, 0.3); return g; }
  }
  return null;
}

export function fogMaterial(mat, U) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uFog = U.uFog; sh.uniforms.uHalf = U.uHalf;
    sh.vertexShader = 'uniform float uHalf;\nvarying vec2 vFogUv;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      vec4 bolWP = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        bolWP = instanceMatrix * bolWP;
      #endif
      bolWP = modelMatrix * bolWP;
      vFogUv = (bolWP.xz + uHalf) / (2.0 * uHalf);`);
    sh.fragmentShader = 'uniform sampler2D uFog;\nvarying vec2 vFogUv;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', `#include <opaque_fragment>
      float bolF = texture2D(uFog, vFogUv).r;
      gl_FragColor.rgb = mix(gl_FragColor.rgb * vec3(0.36, 0.42, 0.58), gl_FragColor.rgb, bolF);`);
  };
  mat.customProgramCacheKey = () => 'bolfog';
  return mat;
}

// ---------- A* pathfinding on the 1-unit grid ----------
export class Nav {
  constructor(map) {
    this.map = map; this.b = map.blocked;
    this.g = new Float32Array(N * N); this.from = new Int32Array(N * N); this.stamp = new Uint32Array(N * N); this.closed = new Uint32Array(N * N);
    this.run = 0;
    this.heap = new Int32Array(N * N); this.f = new Float32Array(N * N);
  }
  idx(x, z) { return clamp(Math.round(z) + HALF, 0, N - 1) * N + clamp(Math.round(x) + HALF, 0, N - 1); }
  free(i) { return !this.b[i]; }
  nearestFree(x, z, maxR = 12) {
    const i0 = this.idx(x, z);
    if (this.free(i0)) return i0;
    const cx = i0 % N, cz = (i0 / N) | 0;
    let best = -1, bd = 1e9;
    for (let r = 1; r <= maxR && best < 0; r++)
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const ix = cx + dx, iz = cz + dz; if (ix < 0 || iz < 0 || ix >= N || iz >= N) continue;
        const i = iz * N + ix; if (!this.free(i)) continue;
        const d = Math.hypot(ix - HALF - x, iz - HALF - z); if (d < bd) { bd = d; best = i; }
      }
    return best;
  }
  los(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.45);
    for (let k = 1; k < n; k++) { const t = k / n; if (this.b[this.idx(ax + (bx - ax) * t, az + (bz - az) * t)]) return false; }
    return true;
  }
  find(sx, sz, tx, tz) {
    const s = this.nearestFree(sx, sz), t = this.nearestFree(tx, tz);
    if (s < 0 || t < 0) return null;
    const tWorld = this.free(this.idx(tx, tz)) ? { x: tx, z: tz } : this.cell(t);
    if (this.los(sx, sz, tWorld.x, tWorld.z)) return [tWorld];
    const run = ++this.run, g = this.g, from = this.from, stamp = this.stamp, closed = this.closed, heap = this.heap, f = this.f;
    const tx0 = t % N, tz0 = (t / N) | 0;
    const H = i => { const dx = Math.abs(i % N - tx0), dz = Math.abs(((i / N) | 0) - tz0); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
    let hn = 0;
    const push = i => { let k = hn++; heap[k] = i; while (k > 0) { const p = (k - 1) >> 1; if (f[heap[p]] <= f[heap[k]]) break; const tmp = heap[p]; heap[p] = heap[k]; heap[k] = tmp; k = p; } };
    const pop = () => { const top = heap[0]; heap[0] = heap[--hn]; let k = 0; for (;;) { const l = k * 2 + 1, r = l + 1; let m = k; if (l < hn && f[heap[l]] < f[heap[m]]) m = l; if (r < hn && f[heap[r]] < f[heap[m]]) m = r; if (m === k) break; const tmp = heap[m]; heap[m] = heap[k]; heap[k] = tmp; k = m; } return top; };
    stamp[s] = run; g[s] = 0; f[s] = H(s); from[s] = -1; push(s);
    let found = false, iter = 0;
    while (hn > 0 && iter++ < 70000) {
      const cur = pop();
      if (closed[cur] === run) continue;
      closed[cur] = run;
      if (cur === t) { found = true; break; }
      const cx = cur % N, cz = (cur / N) | 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = cx + dx, nz = cz + dz; if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
        const ni = nz * N + nx; if (this.b[ni] || closed[ni] === run) continue;
        if (dx && dz && (this.b[cz * N + nx] || this.b[nz * N + cx])) continue;
        const ng = g[cur] + (dx && dz ? 1.4142 : 1);
        if (stamp[ni] !== run || ng < g[ni]) { stamp[ni] = run; g[ni] = ng; from[ni] = cur; f[ni] = ng + H(ni); push(ni); }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let i = t; i !== -1 && i !== s; i = from[i]) cells.push(i);
    cells.reverse();
    // string pulling
    const pts = [];
    let ax = sx, az = sz, k = 0;
    while (k < cells.length) {
      let far = k;
      for (let j = cells.length - 1; j > k; j--) { const c = this.cell(cells[j]); if (this.los(ax, az, c.x, c.z)) { far = j; break; } }
      const c = this.cell(cells[far]); pts.push(c); ax = c.x; az = c.z; k = far + 1;
    }
    if (pts.length) pts[pts.length - 1] = tWorld;
    return pts;
  }
  cell(i) { return { x: (i % N) - HALF, z: ((i / N) | 0) - HALF }; }
}
