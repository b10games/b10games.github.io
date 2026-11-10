// The battlefield: three lanes, a river, jungle corridors between raised walls, bushes, two bases.
// The map is mirror-symmetric along the river (x,z) -> (z,x), so both teams get the same layout.
// It provides the height of the ground, where units may walk (with A* pathfinding) and builds the 3D scenery.
import { THREE, M, canvasTex, rng, clamp } from './engine.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BLUE, RED, TEAM_COLOR } from './data.js';

export const HALF = 110;
const N = HALF * 2 + 1;                       // samples per side (1 world unit apart)
const P = (x, z) => ({ x, z });
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
  { lane: 'core', tier: 3, ...P(-71, 81) }, { lane: 'core', tier: 3, ...P(-81, 71) }
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
  P(-38, -30), P(-58, 2)
];
export const BUSHES = [...BLUE_BUSHES, ...BLUE_BUSHES.map(mirror)].map((b, i) => ({ ...b, r: 3.2, id: i }));
const BRIDGES = [{ x: -27, z: -27 }, { x: 27, z: 27 }];

// ---------- distance helpers ----------
function segDist(px, pz, a, b) {
  const vx = b.x - a.x, vz = b.z - a.z, wx = px - a.x, wz = pz - a.z;
  const t = clamp((wx * vx + wz * vz) / (vx * vx + vz * vz), 0, 1);
  return Math.hypot(px - (a.x + vx * t), pz - (a.z + vz * t));
}
function lineDist(px, pz, pts) { let d = 1e9; for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, segDist(px, pz, pts[i], pts[i + 1])); return d; }

export class GameMap {
  constructor() {
    const shapes = [];
    for (const k in LANES) shapes.push({ line: LANES[k], w: 7.2 }, { line: LANES[k].map(mirror), w: 7.2 });
    shapes.push({ line: RIVER, w: 6.6 });
    for (const p of BLUE_PATHS) shapes.push({ line: p, w: 3.8 }, { line: p.map(mirror), w: 3.8 });
    for (const b of BASE) shapes.push({ c: b, r: 25 });
    for (const c of CAMPS) shapes.push({ c, r: c.epic ? 11 : c.buff ? 7.5 : 6.8 });
    this.shapes = shapes;
    // signed distance to the walkable area (negative = inside)
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
      const edge = Math.max(Math.abs(wx), Math.abs(wz)) - (HALF - 4);
      d = Math.max(d, edge);
      this.sd[i] = d;
      const rd = lineDist(wx, wz, RIVER);
      this.river[i] = rd;
      let h = (2.4 + noise[i] * 3.2) * smooth(0, 3.2, d);
      if (d < 0.5) h -= 0.95 * (1 - smooth(3.8, 6.9, rd));
      for (const c of CAMPS) if (c.epic) { const pd = Math.hypot(wx - c.x, wz - c.z); if (pd < 11 && d < 0) h = Math.min(h, -0.55 * (1 - smooth(8, 11, pd)) - 0.05); }
      this.h[i] = h;
    }
    // bridges: planks over the river
    this.bridges = BRIDGES;
    // only keep bushes that are in open ground
    this.bushes = BUSHES.filter(b => this.sdAt(b.x, b.z) < -1.2);
    this.bushes.forEach((b, i) => { b.id = i; });
    // nav grid: blocked near walls and under buildings
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
      // bridge runs across the river (direction (1,-1)), 4 wide and 15 long
      const u = ((x - b.x) - (z - b.z)) / Math.SQRT2, v = ((x - b.x) + (z - b.z)) / Math.SQRT2;
      if (Math.abs(u) < 7.5 && Math.abs(v) < 2.2) h = Math.max(h, 0.12 + 0.25 * Math.cos(u / 7.5 * Math.PI / 2));
    }
    return h;
  }
  walkable(x, z) { return this.sdAt(x, z) < -0.35; }
  inRiver(x, z) { return this.sample(this.river, x, z) < 6.2 && this.sdAt(x, z) < 0; }
  bushAt(x, z) { for (const b of this.bushes) if ((x - b.x) ** 2 + (z - b.z) ** 2 < b.r * b.r) return b.id; return -1; }
  laneOf(x, z) {
    let best = 'mid', bd = 1e9;
    for (const k in LANES) { const d = Math.min(lineDist(x, z, LANES[k]), lineDist(x, z, LANES[k].map(mirror))); if (d < bd) { bd = d; best = k; } }
    return { lane: best, dist: bd };
  }
  // ---------- 3D scenery ----------
  build(scene, quality) {
    const objs = { anim: [] };
    const fogTex = new THREE.DataTexture(new Uint8Array(128 * 128 * 4).fill(255), 128, 128, THREE.RGBAFormat);
    fogTex.magFilter = fogTex.minFilter = THREE.LinearFilter; fogTex.needsUpdate = true;
    this.fogTex = fogTex;
    const fogU = { uFog: { value: fogTex }, uHalf: { value: HALF } };
    const fogify = m => fogMaterial(m, fogU);
    this.fogify = fogify;
    // terrain
    const seg = quality === 'low' ? 160 : 220;
    const geo = new THREE.PlaneGeometry(HALF * 2, HALF * 2, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, cols = new Float32Array(pos.count * 3), c = new THREE.Color(), r = rng(5);
    const sand = new THREE.Color('#e0bf84'), grass = new THREE.Color('#79c257'), grass2 = new THREE.Color('#5fae47'), wallTop = new THREE.Color('#4c9a3d'),
      cliff = new THREE.Color('#9b8b74'), riverBed = new THREE.Color('#62b6c4'), baseB = new THREE.Color('#9fbbe8'), baseR = new THREE.Color('#e8a6b0'), pit = new THREE.Color('#c9a0dc');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = this.heightAt(x, z), sd = this.sdAt(x, z);
      pos.setY(i, h);
      const slope = Math.abs(this.heightAt(x + 0.8, z) - this.heightAt(x - 0.8, z)) + Math.abs(this.heightAt(x, z + 0.8) - this.heightAt(x, z - 0.8));
      let laneD = 1e9; for (const k in LANES) laneD = Math.min(laneD, lineDist(x, z, LANES[k]), lineDist(x, z, LANES[k].map(mirror)));
      const n = r() * 0.06;
      if (sd > 0.3) { c.copy(wallTop).lerp(cliff, clamp(slope * 0.55 - 0.2, 0, 1)); c.offsetHSL(0, 0, n - 0.03); }
      else {
        c.copy(grass).lerp(grass2, 0.5 + 0.5 * Math.sin(x * 0.21) * Math.cos(z * 0.17));
        c.lerp(sand, 1 - smooth(4.2, 7.2, laneD));
        const bd0 = Math.hypot(x - BASE[0].x, z - BASE[0].z), bd1 = Math.hypot(x - BASE[1].x, z - BASE[1].z);
        if (bd0 < 24) c.lerp(baseB, 1 - smooth(17, 24, bd0));
        if (bd1 < 24) c.lerp(baseR, 1 - smooth(17, 24, bd1));
        for (const cp of CAMPS) if (cp.epic) { const pd = Math.hypot(x - cp.x, z - cp.z); if (pd < 10.5) c.lerp(pit, (1 - smooth(6, 10.5, pd)) * 0.5); }
        if (h < -0.2) c.lerp(riverBed, clamp(-h * 1.4, 0, 1));
        c.offsetHSL(0, 0, n - 0.03);
      }
      cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    const terrain = new THREE.Mesh(geo, fogify(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })));
    terrain.receiveShadow = true;
    scene.add(terrain);
    this.terrain = terrain;
    // water
    const wtex = canvasTex(256, 256, (g, w, hh) => {
      g.fillStyle = '#3fb7e8'; g.fillRect(0, 0, w, hh);
      g.globalAlpha = 0.35; g.strokeStyle = '#e6fbff'; g.lineWidth = 3;
      for (let i = 0; i < 26; i++) { const y = Math.random() * hh; g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x * 0.05 + i) * 5); g.stroke(); }
    });
    wtex.repeat.set(30, 30);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), fogify(new THREE.MeshStandardMaterial({ map: wtex, transparent: true, opacity: 0.78, roughness: 0.15, metalness: 0.1, emissive: new THREE.Color('#1c6fa8'), emissiveIntensity: 0.25 })));
    water.rotation.x = -Math.PI / 2; water.position.y = -0.38;
    scene.add(water);
    objs.anim.push((t) => { wtex.offset.set(t * 0.012, t * 0.02); });
    // bridges
    const plank = fogify(new THREE.MeshStandardMaterial({ color: '#a8754a', roughness: 0.85 }));
    for (const b of this.bridges) {
      const g = new THREE.Group(); g.position.set(b.x, 0, b.z); g.rotation.y = Math.PI / 4;
      for (let k = -7; k <= 7; k++) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 4.6), plank); p.position.set(k, 0.12 + 0.25 * Math.cos(k / 7.5 * Math.PI / 2), 0); p.castShadow = p.receiveShadow = true; g.add(p); }
      for (const s of [-1, 1]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(15, 0.15, 0.15), plank); rail.position.set(0, 0.95, s * 2.2); g.add(rail); for (let k = -7; k <= 7; k += 3.5) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.9, 6), plank); post.position.set(k, 0.55, s * 2.2); g.add(post); } }
      scene.add(g);
    }
    this.buildTrees(scene, quality, fogify);
    this.buildBushes(scene, fogify, objs);
    this.buildDecor(scene, quality, fogify, objs);
    return objs;
  }
  buildTrees(scene, quality, fogify) {
    const r = rng(11), spots = [];
    const step = quality === 'low' ? 4.4 : quality === 'medium' ? 3.6 : 3.1;
    for (let z = -HALF + 2; z < HALF - 1; z += step) for (let x = -HALF + 2; x < HALF - 1; x += step) {
      const px = x + (r() - 0.5) * step * 0.9, pz = z + (r() - 0.5) * step * 0.9;
      const sd = this.sdAt(px, pz);
      if (sd < 1.6 || r() < 0.08) continue;
      spots.push([px, pz, this.heightAt(px, pz), 0.8 + r() * 0.7, r()]);
    }
    const trunkG = new THREE.CylinderGeometry(0.22, 0.32, 1.6, 6); trunkG.translate(0, 0.8, 0);
    const crownG = new THREE.IcosahedronGeometry(1.5, 1); crownG.translate(0, 2.6, 0);
    const pineG = new THREE.ConeGeometry(1.4, 3.4, 7); pineG.translate(0, 3, 0);
    const trunks = new THREE.InstancedMesh(trunkG, fogify(new THREE.MeshStandardMaterial({ color: '#8a5a3c', roughness: 0.9 })), spots.length);
    const crowns = new THREE.InstancedMesh(crownG, fogify(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8, flatShading: true })), spots.length);
    const pines = new THREE.InstancedMesh(pineG, fogify(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8, flatShading: true })), spots.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
    const greens = ['#3f9d4a', '#58b84f', '#2e8b57', '#6cc04a', '#8bcf5b'], pinks = ['#ff9ebb', '#ffb3c6', '#ffd6e0'];
    let nc = 0, np = 0;
    spots.forEach(([x, z, h, sc, k], i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), k * 6.28); s.setScalar(sc); p.set(x, h - 0.1, z);
      m.compose(p, q, s); trunks.setMatrixAt(i, m);
      if (k < 0.35) { pines.setMatrixAt(np, m); pines.setColorAt(np++, col.set(greens[Math.floor(k * 100) % 3]).offsetHSL(0, 0, -0.05)); }
      else { crowns.setMatrixAt(nc, m); crowns.setColorAt(nc++, col.set(k > 0.93 ? pinks[Math.floor(k * 1000) % 3] : greens[Math.floor(k * 1000) % 5])); }
    });
    crowns.count = nc; pines.count = np;
    for (const im of [trunks, crowns, pines]) { im.castShadow = true; im.receiveShadow = true; scene.add(im); }
    // rocks along the cliff edges
    const rocks = [], rr = rng(19);
    for (let i = 0; i < 900; i++) { const x = (rr() - 0.5) * HALF * 2, z = (rr() - 0.5) * HALF * 2, sd = this.sdAt(x, z); if (sd > 0.2 && sd < 2.2) rocks.push([x, z, this.heightAt(x, z), 0.5 + rr() * 0.9, rr()]); }
    const rockM = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), fogify(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true })), rocks.length);
    rocks.forEach(([x, z, h, sc, k], i) => { q.setFromEuler(new THREE.Euler(k * 3, k * 9, k * 5)); s.set(sc * 1.3, sc * 0.8, sc); p.set(x, h + 0.1, z); m.compose(p, q, s); rockM.setMatrixAt(i, m); rockM.setColorAt(i, col.set(k < 0.5 ? '#a9a39b' : '#c2b8a3')); });
    rockM.castShadow = rockM.receiveShadow = true; scene.add(rockM);
  }
  buildBushes(scene, fogify, objs) {
    const r = rng(23);
    this.bushMeshes = [];
    for (const b of this.bushes) {
      const parts = [];
      for (let i = 0; i < 9; i++) {
        const a = i / 9 * Math.PI * 2 + r(), d = i === 0 ? 0 : 1.2 + r() * 1.4;
        const g = new THREE.IcosahedronGeometry(1.1 + r() * 0.5, 1);
        g.scale(1, 0.8, 1); g.translate(Math.cos(a) * d, 0.7 + r() * 0.4, Math.sin(a) * d);
        parts.push(g);
      }
      const mat = fogify(new THREE.MeshStandardMaterial({ color: '#2f8f46', roughness: 0.8, flatShading: true, transparent: true, opacity: 1 }));
      const mesh = new THREE.Mesh(mergeGeometries(parts), mat);
      mesh.position.set(b.x, this.heightAt(b.x, b.z), b.z);
      mesh.castShadow = true; mesh.receiveShadow = true;
      scene.add(mesh); this.bushMeshes.push(mesh);
      b.mesh = mesh;
    }
  }
  buildDecor(scene, quality, fogify, objs) {
    const r = rng(31), m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
    // flowers in the grass
    const flowers = [];
    const n = quality === 'low' ? 500 : 1400;
    for (let i = 0; i < n * 3 && flowers.length < n; i++) {
      const x = (r() - 0.5) * HALF * 2, z = (r() - 0.5) * HALF * 2, sd = this.sdAt(x, z);
      if (sd > -0.5 || sd < -5) continue;
      if (this.heightAt(x, z) < -0.1) continue;
      flowers.push([x, z, this.heightAt(x, z), r()]);
    }
    const fl = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.18, 0), fogify(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6, emissive: '#222222' })), flowers.length);
    const fcols = ['#ff6fd8', '#ffd23f', '#ffffff', '#ff8c42', '#c77dff', '#ff4d6d'];
    flowers.forEach(([x, z, h, k], i) => { p.set(x, h + 0.25, z); s.setScalar(0.8 + k); m.compose(p, q.identity(), s); fl.setMatrixAt(i, m); fl.setColorAt(i, col.set(fcols[i % fcols.length])); });
    scene.add(fl);
    // grass tufts
    const tufts = [];
    for (let i = 0; i < (quality === 'low' ? 600 : 1800); i++) { const x = (r() - 0.5) * HALF * 2, z = (r() - 0.5) * HALF * 2, sd = this.sdAt(x, z); if (sd < 0.8 && sd > -4 && this.heightAt(x, z) > -0.1) tufts.push([x, z, this.heightAt(x, z), r()]); }
    const tg = new THREE.ConeGeometry(0.16, 0.7, 4); tg.translate(0, 0.35, 0);
    const tm = new THREE.InstancedMesh(tg, fogify(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 })), tufts.length);
    tufts.forEach(([x, z, h, k], i) => { p.set(x, h, z); q.setFromEuler(new THREE.Euler((k - 0.5) * 0.4, k * 6, 0)); s.setScalar(0.7 + k * 0.8); m.compose(p, q, s); tm.setMatrixAt(i, m); tm.setColorAt(i, col.set(k < 0.5 ? '#4fa83d' : '#6cc04a')); });
    scene.add(tm);
    // bases: plazas, flags, fountains, shop stalls
    for (const team of [BLUE, RED]) {
      const b = BASE[team], f = FOUNTAIN[team], tc = TEAM_COLOR[team];
      const plaza = new THREE.Mesh(new THREE.CylinderGeometry(11, 11.5, 0.3, 48), fogify(M(team ? '#eab3bd' : '#b2c9ef', { rough: 0.6 })));
      plaza.position.set(f.x + (team ? -3 : 3), 0.08, f.z + (team ? 3 : -3)); plaza.receiveShadow = true; scene.add(plaza);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(10.5, 0.25, 8, 64), M(tc, { emissive: tc, ei: 1.4 }));
      ring.rotation.x = Math.PI / 2; ring.position.set(plaza.position.x, 0.3, plaza.position.z); scene.add(ring);
      // fountain
      const fg = new THREE.Group(); fg.position.set(f.x, 0, f.z);
      const basin = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.4, 1, 24), M('#ffffff', { rough: 0.4 })); basin.position.y = 0.5; fg.add(basin);
      const pool = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.7, 0.2, 24), M(tc, { emissive: tc, ei: 0.6, rough: 0.1 })); pool.position.y = 1; fg.add(pool);
      const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 2.6, 12), M('#ffffff')); spout.position.y = 2; fg.add(spout);
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.9, 20, 14), M(tc, { emissive: tc, ei: 2 })); orb.position.y = 3.8; fg.add(orb);
      fg.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      scene.add(fg);
      objs.anim.push(t => { orb.position.y = 3.8 + Math.sin(t * 2) * 0.3; orb.rotation.y = t; });
      // shop stall
      const sg = new THREE.Group();
      const sp = { x: f.x + (team ? -8 : 8), z: f.z + (team ? 1 : -1) };
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
      for (let i = 0; i < 6; i++) {
        const ang = (team ? 3 : -1) * Math.PI / 4 + (i - 2.5) * 0.4 + Math.PI;
        const px = b.x + Math.cos(ang) * 21, pz = b.z + Math.sin(ang) * 21;
        if (this.sdAt(px, pz) > 1 || this.sdAt(px, pz) < -6) continue;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6, 6), M('#ffffff')); pole.position.set(px, 3, pz); pole.castShadow = true; scene.add(pole);
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.3, 8, 2), M(tc, { double: true, emissive: tc, ei: 0.2 })); flag.position.set(px + 1.1, 5.2, pz); scene.add(flag);
        const fp = flag.geometry.attributes.position, base0 = fp.array.slice();
        objs.anim.push(t => { for (let k = 0; k < fp.count; k++) { const x0 = base0[k * 3]; fp.setZ(k, Math.sin(t * 4 + x0 * 2 + i) * 0.25 * (x0 + 1.1)); } fp.needsUpdate = true; });
      }
    }
    // pits: glowing rings around the dragon and boss pits
    for (const cp of CAMPS) if (cp.epic) {
      const col2 = cp.id === 'dragon' ? '#ff6fd8' : '#ffd23f';
      const ring = new THREE.Mesh(new THREE.TorusGeometry(10.4, 0.2, 6, 64), M(col2, { emissive: col2, ei: 1.2 }));
      ring.rotation.x = Math.PI / 2; ring.position.set(cp.x, this.heightAt(cp.x, cp.z) + 0.1, cp.z); scene.add(ring);
      for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, px = cp.x + Math.cos(a) * 11.8, pz = cp.z + Math.sin(a) * 11.8; const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 2.4, 8), fogify(M('#efe3d0'))); pil.position.set(px, this.heightAt(px, pz) + 1.2, pz); pil.castShadow = true; scene.add(pil); const cap = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), M(col2, { emissive: col2, ei: 1 })); cap.position.set(px, this.heightAt(px, pz) + 2.6, pz); scene.add(cap); }
    }
    // windmills and lollipops on the high ground
    for (let i = 0; i < 26; i++) {
      const x = (r() - 0.5) * HALF * 1.9, z = (r() - 0.5) * HALF * 1.9;
      if (this.sdAt(x, z) < 3 || this.sdAt(x, z) > 9) continue;
      const h = this.heightAt(x, z);
      if (i % 2) {
        const g = new THREE.Group(); g.position.set(x, h, z);
        const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 4.5, 8), fogify(M('#fff3e0'))); tower.position.y = 2.25; g.add(tower);
        const roof = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.2, 8), fogify(M('#ff4d6d'))); roof.position.y = 5; g.add(roof);
        const blades = new THREE.Group(); blades.position.set(0, 4.3, 0.8); g.add(blades);
        for (let k = 0; k < 4; k++) { const bl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.6, 0.06), fogify(M(k % 2 ? '#ffd23f' : '#ffffff'))); bl.position.y = 1.3; const piv = new THREE.Group(); piv.rotation.z = k * Math.PI / 2; piv.add(bl); blades.add(piv); }
        g.rotation.y = r() * 6; g.traverse(o => { if (o.isMesh) o.castShadow = true; });
        scene.add(g); const sp = 0.8 + r(); objs.anim.push(t => { blades.rotation.z = t * sp; });
      } else {
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3, 6), fogify(M('#ffffff'))); stick.position.set(x, h + 1.5, z); scene.add(stick);
        const candy = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.3, 24), fogify(M('#ffffff', { map: canvasTex(64, 64, (g, w) => { for (let k = 0; k < 8; k++) { g.fillStyle = k % 2 ? '#ff6fd8' : '#ffffff'; g.beginPath(); g.moveTo(w / 2, w / 2); g.arc(w / 2, w / 2, w / 2, k * Math.PI / 4, (k + 1) * Math.PI / 4); g.fill(); } }) })));
        candy.position.set(x, h + 3.2, z); candy.rotation.x = Math.PI / 2; candy.castShadow = true; scene.add(candy);
        objs.anim.push(t => { candy.rotation.z = t * 0.6; });
      }
    }
  }
  // fog-of-war texture: 255 where our team can see
  updateFog(sources) {
    const img = this.fogTex.image.data, S = 128, k = S / (HALF * 2);
    for (let i = 0; i < S * S; i++) img[i * 4] = 0;
    for (const s of sources) {
      const cx = (s.x + HALF) * k, cz = (s.z + HALF) * k, rr = s.r * k;
      const x0 = Math.max(0, Math.floor(cx - rr - 1)), x1 = Math.min(S - 1, Math.ceil(cx + rr + 1)), z0 = Math.max(0, Math.floor(cz - rr - 1)), z1 = Math.min(S - 1, Math.ceil(cz + rr + 1));
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
        const v = d < rr - 1 ? 255 : d < rr + 1 ? Math.round(255 * (rr + 1 - d) / 2) : 0;
        const i = (z * S + x) * 4; if (v > img[i]) img[i] = v;
      }
    }
    this.fogTex.needsUpdate = true;
  }
  // picture of the map for the minimap
  minimapImage(size = 256) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d'), img = g.createImageData(size, size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const wx = (x / size) * HALF * 2 - HALF, wz = (y / size) * HALF * 2 - HALF;
      const sd = this.sdAt(wx, wz), h = this.heightAt(wx, wz);
      let laneD = 1e9; for (const k in LANES) laneD = Math.min(laneD, lineDist(wx, wz, LANES[k]), lineDist(wx, wz, LANES[k].map(mirror)));
      let col = sd > 0.3 ? [38, 92, 46] : laneD < 5.5 ? [214, 186, 128] : [96, 170, 78];
      if (h < -0.25) col = [70, 170, 210];
      const b0 = Math.hypot(wx - BASE[0].x, wz - BASE[0].z), b1 = Math.hypot(wx - BASE[1].x, wz - BASE[1].z);
      if (b0 < 20) col = [140, 175, 230]; if (b1 < 20) col = [230, 150, 150];
      const i = (y * size + x) * 4; img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }
}
function smooth(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

// Darkens and tints everything outside our team's vision.
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
    while (hn > 0 && iter++ < 30000) {
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
