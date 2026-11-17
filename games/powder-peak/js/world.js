// The mountain range you ride on: the snow (drawn with more detail close to you), forests in the valleys,
// rocks, a hut at base camp, and the places you can start from, race down or do tricks at.
// height / normal / rideNormal are what the riders and the landing assist use.
import { THREE, makeSky, canvasTex, QUALITY, clamp, smooth, rng } from './engine.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { terrain, BOUNDS, PEAKS, LIPS, LOBBY, zoneAt } from './terrain.js';
import { makeNoise } from './noise.js';
import { TerrainLOD } from './terrainlod.js';

export const THEME = {
  skyTop: '#1f5fcf', skyMid: '#9ec8f2', skyBottom: '#e6f1fb', sunDir: [0.42, 0.5, -0.76], sunColor: '#ffeccc',
  fog: '#cfdff0', sunInt: 3.8, hemiSky: '#e4eefc', hemiGround: '#b4c3d8', hemiInt: 1.65
};

export function height(x, z) { return terrain(x, z); }
// the snow right under you, measured behind you along your direction of travel (so the lip of a jump
// stays sharp: you leave it with the angle of the ramp, not of the snow after it)
export function rideNormal(x, z, dx, dz, out = new THREE.Vector3()) {
  const l = Math.hypot(dx, dz);
  if (l < 0.5) return normal(x, z, out);
  const fx = dx / l, fz = dz / l, e = 0.25, h0 = height(x, z);
  const sF = (h0 - height(x - fx * e, z - fz * e)) / e;
  const sS = (height(x - fz * e, z + fx * e) - height(x + fz * e, z - fx * e)) / (2 * e);
  const ax = -fz, ay = sS, az = fx, bx = fx, by = sF, bz = fz;
  return out.set(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx).normalize();
}
export function normal(x, z, out = new THREE.Vector3()) {
  const e = 0.35;
  const hx = height(x + e, z) - height(x - e, z), hz = height(x, z + e) - height(x, z - e);
  return out.set(-hx, 2 * e, -hz).normalize();
}
export { zoneAt, BOUNDS, PEAKS, LOBBY };

function segDist(px, pz, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz;
  const t = clamp(((px - a[0]) * dx + (pz - a[1]) * dz) / l, 0, 1);
  return Math.hypot(px - a[0] - dx * t, pz - a[1] - dz * t);
}
export function lineDist(px, pz, pts) { let d = 1e9; for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, segDist(px, pz, pts[i], pts[i + 1])); return d; }
const slopeY = (x, z) => normal(x, z, new THREE.Vector3()).y;

// ---------- where you can start: a rideable spot just below every summit ----------
export const DROPS = [];
for (const p of PEAKS) {
  let best = null, bh = -1e9;
  for (let r = 50; r <= 420; r += 30) for (let a = 0; a < 24; a++) {
    const x = p.x + Math.cos(a / 24 * Math.PI * 2) * r, z = p.z + Math.sin(a / 24 * Math.PI * 2) * r, ny = slopeY(x, z);
    if (ny < 0.74 || ny > 0.92) continue;            // between about 23 and 42 degrees
    const h = height(x, z); if (h > bh) { bh = h; best = { x, z }; }
  }
  if (best) DROPS.push({ id: p.id, name: p.name, x: best.x, z: best.z, alt: Math.round(bh) });
}
DROPS.push({ id: 'base', name: 'Base Camp', x: LOBBY.x + 20, z: LOBBY.z - 60, alt: Math.round(height(LOBBY.x, LOBBY.z)) });

// ---------- race courses: from a summit down the fall line, gates along the way ----------
function makeCourse(drop) {
  const pts = [[drop.x, drop.z]], n = new THREE.Vector3();
  let x = drop.x, z = drop.z; normal(x, z, n); let dx = n.x, dz = n.z; let l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
  let len = 0, last = height(x, z), flat = 0;
  for (let i = 0; i < 400 && len < 4200; i++) {
    // the way down, but not straight over cliffs: try a few directions and take a steep-enough, not-too-steep one
    let best = null, bs = -1e9;
    for (const a of [-1.2, -0.8, -0.4, 0, 0.4, 0.8, 1.2]) {
      const c = Math.cos(a), s = Math.sin(a), tx = dx * c - dz * s, tz = dx * s + dz * c, nx = x + tx * 15, nz = z + tz * 15;
      const fall = last - height(nx, nz), ny = slopeY(nx, nz);
      if (fall < -1.5) continue;                       // a little uphill is fine (you carry speed), more is not
      // downhill, but traverse round the cliffs
      const sc = Math.min(fall, 8) - (ny < 0.62 ? 10 : ny < 0.7 ? 3 : 0) - Math.abs(a) * 1.2;
      if (sc > bs) { bs = sc; best = [tx, tz, nx, nz]; }
    }
    if (!best) break;
    const before = last;
    [dx, dz, x, z] = best; len += 15; last = height(x, z);
    flat = before - last < 0.5 ? flat + 1 : 0; if (flat > 8) break;
    if (Math.abs(x) > BOUNDS.x - 60 || z < BOUNDS.z0 + 60 || z > BOUNDS.z1 - 60) break;
    if (len % 225 < 15) pts.push([x, z]);
    if (last < 1000) break;
  }
  if (Math.hypot(pts[pts.length - 1][0] - x, pts[pts.length - 1][1] - z) > 80) pts.push([x, z]);
  return pts;
}
export const COURSES = {};
for (const id of ['titan', 'eagle', 'glacier', 'nord', 'aurora']) {
  const d = DROPS.find(x => x.id === id); if (!d) continue;
  const g = makeCourse(d);
  if (g.length >= 4) COURSES[id] = { name: d.name + ' Downhill', gates: g, drop: Math.round(d.alt - height(g[g.length - 1][0], g[g.length - 1][1])) };
}
// ---------- trick spots: the peaks with the most natural lips near the top ----------
export const TRICK_SPOTS = DROPS.filter(d => d.id !== 'base').map(d => ({ id: d.id, name: d.name, x: d.x, z: d.z, time: 180, lips: LIPS.filter(l => Math.hypot(l.x - d.x, l.z - d.z) < 1400).length }))
  .sort((a, b) => b.lips - a.lips).slice(0, 4);

// ---------- snow textures ----------
function snowNormalMap() {
  const S = 256, n = makeNoise(5), hgt = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S; let s = 0;
    // tileable: noise on a torus
    for (const [f, a] of [[3, 1], [7, 0.5], [17, 0.25], [37, 0.12]]) {
      const ax = Math.cos(u * Math.PI * 2) * f / 6.28, ay = Math.sin(u * Math.PI * 2) * f / 6.28, bx = Math.cos(v * Math.PI * 2) * f / 6.28, by = Math.sin(v * Math.PI * 2) * f / 6.28;
      s += a * n(ax + bx * 1.7 + 11, ay + by * 1.3 + 7);
    }
    hgt[y * S + x] = s;
  }
  return canvasTex(S, S, (g) => {
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const l = hgt[y * S + ((x + S - 1) % S)], r = hgt[y * S + ((x + 1) % S)], u = hgt[((y + S - 1) % S) * S + x], d = hgt[((y + 1) % S) * S + x];
      let nx = (l - r) * 2.2, ny = (u - d) * 2.2, nz = 1; const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
      const i = (y * S + x) * 4; img.data[i] = (nx * 0.5 + 0.5) * 255; img.data[i + 1] = (ny * 0.5 + 0.5) * 255; img.data[i + 2] = (nz * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
}
// wind ripples in the snow (sastrugi): thin wavy ridges, tileable
function rippleNormalMap() {
  const S = 256, n = makeNoise(17), hgt = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S;
    const w = n(Math.cos(u * 6.283) * 1.3 + Math.cos(v * 6.283) * 0.7, Math.sin(u * 6.283) * 1.3 + Math.sin(v * 6.283) * 0.9);
    const ph = 6.283 * (5 * u + 2 * v) + w * 2.4, r = 0.5 + 0.5 * Math.sin(ph);
    hgt[y * S + x] = Math.pow(r, 3) * (0.7 + 0.3 * n(u * 9.1, v * 9.1));
  }
  return canvasTex(S, S, (g) => {
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const l = hgt[y * S + ((x + S - 1) % S)], r = hgt[y * S + ((x + 1) % S)], u = hgt[((y + S - 1) % S) * S + x], d = hgt[((y + 1) % S) * S + x];
      let nx = (l - r) * 1.6, ny = (u - d) * 1.6, nz = 1; const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
      const i = (y * S + x) * 4; img.data[i] = (nx * 0.5 + 0.5) * 255; img.data[i + 1] = (ny * 0.5 + 0.5) * 255; img.data[i + 2] = (nz * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  });
}
// the snow surface: the bump texture at three sizes (so it never looks tiled), wind ripples and fine
// grains close to you, and on the better settings glitter that twinkles as you move
function snowShader(mat, sparkle) {
  const ripple = rippleNormalMap();
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.ripple = { value: ripple };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    let f = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform sampler2D ripple;\nfloat hsh(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }');
    // the normal map code lives in a chunk that is only included later: put our own version in its place
    f = f.replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps);
    f = f.replace('vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;',
      `float camD = length(vWPos - cameraPosition);
       float near = 1.0 - smoothstep(25.0, 140.0, camD), close = 1.0 - smoothstep(6.0, 35.0, camD);
       vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
       vec3 mapN2 = texture2D( normalMap, vNormalMapUv * 0.23 + vec2(0.37, 0.11) ).xyz * 2.0 - 1.0;
       vec3 mapN3 = texture2D( normalMap, vNormalMapUv * 4.1 + vec2(0.71, 0.53) ).xyz * 2.0 - 1.0;
       vec3 rip = texture2D( ripple, vNormalMapUv * 1.7 + vec2(0.13, 0.29) ).xyz * 2.0 - 1.0;
       vec3 grain = texture2D( normalMap, vNormalMapUv * 13.0 + vec2(0.5, 0.2) ).xyz * 2.0 - 1.0;
       mapN = normalize(vec3(mapN.xy * 0.5 + mapN2.xy * 0.5 + mapN3.xy * 0.35 + rip.xy * 0.45 * near + grain.xy * 0.5 * close, mapN.z));`);
    if (sparkle) f = f.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { vec3 cell = floor(vWPos * 9.0);
          float tw = hsh(cell + floor(cameraPosition * 0.8));
          float sp = step(0.9955, tw) * (1.0 - smoothstep(8.0, 55.0, camD));
          totalEmissiveRadiance += vec3(0.95, 0.97, 1.0) * sp * 2.4; }`);
    sh.fragmentShader = f;
  };
}

// ---------- building blocks ----------
function treeGeometry(kind, lo) {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.18, 0.34, 2.6, lo ? 5 : 7); trunk.translate(0, 1.3, 0); paint(trunk, '#4a2f1d'); parts.push(trunk);
  // kind 0: a broad fir, 1: a tall slim spruce, 2: heavy with snow (fewer layers and corners on Low, for iPads)
  const n = (kind === 1 ? 7 : 6) - (lo ? 2 : 0), H = kind === 1 ? 9.5 : 7.6, R = kind === 1 ? 2.3 : 3.1, nz = makeNoise(31 + kind);
  const green = new THREE.Color(kind === 1 ? '#1d4a34' : '#22543a'), dark = new THREE.Color('#123222'), snow = new THREE.Color('#f5f9ff');
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), r = R * (1 - t * 0.82) + 0.25, h = (H / n) * 1.9 * (1 - t * 0.25), y = 1.6 + t * (H - 2.2);
    const c = new THREE.ConeGeometry(r, h, lo ? 7 : 11, lo ? 1 : 2); c.translate(0, y, 0);
    const pos = c.attributes.position, col = new Float32Array(pos.count * 3), cc = new THREE.Color();
    for (let k = 0; k < pos.count; k++) {
      const px = pos.getX(k), py = pos.getY(k), pz = pos.getZ(k), a = Math.atan2(pz, px), rr = Math.hypot(px, pz);
      // a ragged, drooping rim
      if (py < y - h * 0.45 && rr > 0.01) { const j = 1 + 0.16 * Math.sin(a * 11 + i * 1.7); pos.setXYZ(k, px * j, py - (j - 1) * 1.2 - 0.12, pz * j); }
      const up = smooth(y - h * 0.35, y + h * 0.3, py), patch = nz(px * 0.9 + i * 3, pz * 0.9) * 0.5 + 0.5;
      const sn = clamp(up * (kind === 2 ? 1.05 : 0.8) + (patch - 0.5) * 0.5 + (kind === 2 ? 0.25 : 0), 0, 1);
      cc.copy(dark).lerp(green, smooth(y - h * 0.5, y, py)).lerp(snow, sn);
      col[k * 3] = cc.r; col[k * 3 + 1] = cc.g; col[k * 3 + 2] = cc.b;
    }
    c.setAttribute('color', new THREE.BufferAttribute(col, 3));
    c.computeVertexNormals();
    parts.push(c);
  }
  return mergeGeometries(parts.map(p => p.index ? p.toNonIndexed() : p));
}
function paint(geo, color) {
  const c = new THREE.Color(color), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo;
}
// a simple far-away tree: one snowy cone
function farTreeGeometry() {
  const c = new THREE.ConeGeometry(2.4, 8.5, 6, 1); c.translate(0, 5, 0);
  const p = c.attributes.position, col = new Float32Array(p.count * 3), g = new THREE.Color('#2c5a40'), s = new THREE.Color('#e9f1fa'), cc = new THREE.Color();
  for (let i = 0; i < p.count; i++) { cc.copy(g).lerp(s, smooth(3, 8, p.getY(i)) * 0.8); col[i * 3] = cc.r; col[i * 3 + 1] = cc.g; col[i * 3 + 2] = cc.b; }
  c.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return c;
}
function rockGeometry(seed, detail = 1, shape = 0) {
  const g = new THREE.DodecahedronGeometry(1, detail), p = g.attributes.position, r = rng(seed), col = new Float32Array(p.count * 3);
  // black stone with grey on it: lighter grey streaks (layers in the rock), grey patches, a dusting of snow on top
  const black = new THREE.Color('#17181b'), dark = new THREE.Color('#26282c'), grey = new THREE.Color('#6b6e74'), lite = new THREE.Color('#9a9da3'), snow = new THREE.Color('#f4f7fb');
  const nz = makeNoise(900 + seed), c = new THREE.Color();
  const sx = [1.25, 1.6, 0.95][shape], sy = [0.8, 0.62, 1.15][shape], sz = [1, 0.9, 0.85][shape];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    // lumpy and broken: big bumps, then sharper chips
    const k = 0.78 + 0.3 * Math.sin(x * 3.1 + seed) * Math.cos(z * 2.7 + y * 1.3) + 0.12 * nz(x * 2.3 + seed, z * 2.3 - y);
    const fy = y * k * sy;
    p.setXYZ(i, x * k * sx, fy > 0.55 ? 0.55 + (fy - 0.55) * 0.5 : fy, z * k * sz);
    const streak = Math.sin(y * 9 + nz(x * 1.5, z * 1.5) * 3) * 0.5 + 0.5, patch = nz(x * 1.7 + 4, z * 1.7 + y * 1.2) * 0.5 + 0.5;
    c.copy(black).lerp(dark, patch);
    c.lerp(grey, smooth(0.55, 0.9, patch) * 0.75 + smooth(0.82, 0.98, streak) * 0.45);
    c.lerp(lite, smooth(0.9, 1, streak) * smooth(0.5, 0.8, patch) * 0.6);
    c.lerp(snow, smooth(0.45, 0.75, y + (patch - 0.5) * 0.3) * 0.9);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals(); r();
  return g;
}


const TILE = 512;
const FOREST = makeNoise(4242);

export class World {
  constructor(quality) {
    this.q = quality; this.Q = QUALITY[quality] || QUALITY.medium;
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(THEME.skyMid);
    scene.fog = new THREE.FogExp2(new THREE.Color(THEME.fog), quality === 'low' ? 0.00026 : 0.00018);
    this.fogBase = scene.fog.density;
    this.sky = makeSky(THEME, quality === 'low' ? 0.8 : 1); scene.add(this.sky);
    scene.add(new THREE.HemisphereLight(THEME.hemiSky, THEME.hemiGround, THEME.hemiInt));
    const sun = this.sun = new THREE.DirectionalLight(THEME.sunColor, THEME.sunInt);
    this.sunDir = new THREE.Vector3(...THEME.sunDir).normalize();
    if (this.Q.shadows) {
      sun.castShadow = true; sun.shadow.mapSize.set(this.Q.shadows, this.Q.shadows);
      const c = sun.shadow.camera, s = this.Q.shadows >= 4096 ? 90 : this.Q.shadows >= 2048 ? 65 : 40; c.left = -s; c.right = s; c.top = s; c.bottom = -s; c.near = 1; c.far = 600;
      sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.08; sun.shadow.radius = 3;
    }
    scene.add(sun, sun.target);
    this.grid = new Map(); this.tiles = new Map(); this.treeCount = 0;
    // the snow
    const mat = this.snowMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, normalMap: snowNormalMap(), normalScale: new THREE.Vector2(0.3, 0.3) });
    snowShader(mat, quality !== 'low');
    const lo = quality === 'low';
    this.lod = new TerrainLOD(scene, mat, { root: 16384, leaf: lo ? 256 : 128, split: quality === 'ultra' ? 2.2 : lo ? 1.45 : 1.75, keep: lo ? 2048 : 1024, budget: lo ? 5 : 7, maxNodes: lo ? 380 : 750, workers: 2 });
    // trees and rocks are made per 512 m tile, around wherever you are
    this.treeGeo = [treeGeometry(0, lo), treeGeometry(1, lo), treeGeometry(2, lo)];
    this.farTreeGeo = farTreeGeometry();
    this.treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
    this.rockGeo = [rockGeometry(1, lo ? 0 : 1, 0), rockGeometry(7, lo ? 0 : 1, 1), rockGeometry(13, lo ? 0 : 1, 2)];
    this.rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.05, flatShading: true });
    this.treeNear = lo ? 420 : 700; this.treeFar = lo ? 1700 : 2900;
  }
  // the slow part of starting: the coarse tiles of the whole range, the hut and the snowfall
  async init(progress) {
    await this.lod.prebuild(progress);
    this.baseCamp();
    this.buildFlakes();
  }
  height(x, z) { return height(x, z); }
  // the snow as it is drawn (for putting things on it and keeping the camera above it)
  drawnHeight(x, z) { const h = this.lod.heightAt(x, z); return h == null ? height(x, z) : h; }
  normal(x, z, out) { return normal(x, z, out); }
  rideNormal(x, z, dx, dz, out) { return rideNormal(x, z, dx, dz, out); }
  terrain(x, z) { return terrain(x, z); }
  zoneAt(x, z) { return zoneAt(x, z); }

  // detail, shadows and falling snow follow the camera
  focus(p, cam, ahead) {
    this.sun.position.copy(p).addScaledVector(this.sunDir, 300); this.sun.target.position.copy(p);
    this.sky.position.copy(cam.position);
    if (this.flakes) this.flakes.position.copy(cam.position);
    this.lod.update(cam, ahead);
    this.updateTiles(cam.position, p);
    // very high up (or on the map) you can see further
    this.scene.fog.density = this.fogBase * (1 - 0.45 * smooth(800, 4000, cam.position.y - height(cam.position.x, cam.position.z)));
  }
  update(dt, t) {
    this.sky.material.uniforms.time.value = t;
    if (this.flakes) this.flakeMat.uniforms.time.value = t;
  }
  // after jumping far away (the map): build the detail there right now
  warm(cam) { this.lod.warm(cam); this.updateTiles(cam.position, cam.position, true); }

  // ---------- solid things you can hit ----------
  addSolid(x, z, r, kind) {
    const k = Math.floor(x / 16) + ',' + Math.floor(z / 16);
    let a = this.grid.get(k); if (!a) this.grid.set(k, a = []);
    a.push({ x, z, r, kind });
  }
  solidsNear(x, z, out = []) {
    out.length = 0;
    const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
    for (let i = -1; i <= 1; i++) for (let k = -1; k <= 1; k++) { const a = this.grid.get((cx + i) + ',' + (cz + k)); if (a) for (const s of a) out.push(s); }
    return out;
  }

  // ---------- forests and rocks, per tile ----------
  treeLine(x, z) { return 1250 + 260 * FOREST(x / 1500 + 5, z / 1500); }
  clearOf(x, z) {
    for (const c of Object.values(COURSES)) if (lineDist(x, z, c.gates) < 16) return false;
    if (Math.hypot(x - LOBBY.x, z - LOBBY.z) < LOBBY.r + 15) return false;
    return true;
  }
  makeTile(i, j) {
    const key = i + ',' + j, r = rng(i * 7919 + j * 104729 + 17), x0 = i * TILE, z0 = j * TILE, trees = [], rocks = [];
    const n = new THREE.Vector3(), dens = this.Q.trees;
    for (let k = 0; k < 520 * dens; k++) {
      const x = x0 + r() * TILE, z = z0 + r() * TILE;
      if (Math.abs(x) > BOUNDS.x - 10 || z < BOUNDS.z0 + 10 || z > BOUNDS.z1 - 10) continue;
      const h = height(x, z), forest = FOREST(x / 650, z / 650) + FOREST(x / 170 + 3, z / 170) * 0.35;
      normal(x, z, n);
      if (h < this.treeLine(x, z) && n.y > 0.82 && forest > -0.15 && this.clearOf(x, z)) {
        const kk = r(); trees.push([x, h, z, 0.75 + r() * 0.85, r() * 6.28, kk < 0.4 ? 1 : kk < 0.75 ? 0 : 2, (r() - 0.5) * 0.08, (r() - 0.5) * 0.08, 0.86 + r() * 0.16]);
      } else if ((n.y < 0.74 && n.y > 0.42 && r() < 0.13) || (h > this.treeLine(x, z) - 150 && r() < 0.022) || r() < 0.004) {
        if (!this.clearOf(x, z)) continue;
        // a boulder, often with a few smaller stones around it
        const big = 1.4 + r() * r() * 5.5, kind = Math.floor(r() * 3);
        rocks.push([x, h, z, big, r() * 6.28, kind]);
        const extra = r() < 0.55 ? 1 + Math.floor(r() * 3) : 0;
        for (let m = 0; m < extra; m++) {
          const a = r() * 6.28, d = big * (1.1 + r() * 1.6), xx = x + Math.cos(a) * d, zz = z + Math.sin(a) * d;
          rocks.push([xx, height(xx, zz), zz, 0.5 + r() * big * 0.45, r() * 6.28, Math.floor(r() * 3)]);
        }
      }
    }
    const t = { key, i, j, cx: x0 + TILE / 2, cz: z0 + TILE / 2, near: [], far: null, rocks: null };
    const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler(), tint = new THREE.Color();
    for (const kind of [0, 1, 2]) {
      const sel = trees.filter(tr => tr[5] === kind); if (!sel.length) continue;
      const inst = new THREE.InstancedMesh(this.treeGeo[kind], this.treeMat, sel.length);
      sel.forEach((tr, k) => { p.set(tr[0], tr[1] - 0.3, tr[2]); e.set(tr[6], tr[4], tr[7]); q.setFromEuler(e); s.set(tr[3], tr[3] * (0.9 + (k % 7) * 0.035), tr[3]); mx.compose(p, q, s); inst.setMatrixAt(k, mx); tint.setRGB(tr[8], tr[8] + 0.03, tr[8]); inst.setColorAt(k, tint); });
      inst.castShadow = !!this.Q.shadows; inst.visible = false; inst.computeBoundingSphere(); this.scene.add(inst); t.near.push(inst);
    }
    if (trees.length) {
      const far = new THREE.InstancedMesh(this.farTreeGeo, this.treeMat, trees.length);
      trees.forEach((tr, k) => { p.set(tr[0], tr[1] - 0.3, tr[2]); q.identity(); s.setScalar(tr[3]); mx.compose(p, q, s); far.setMatrixAt(k, mx); tint.setRGB(tr[8], tr[8] + 0.03, tr[8]); far.setColorAt(k, tint); });
      far.visible = false; far.computeBoundingSphere(); this.scene.add(far); t.far = far;
    }
    if (rocks.length) {
      // one rock shape per tile (one draw call); every stone is turned, tilted and stretched differently
      const kind = (Math.abs(i * 3 + j * 5)) % 3;
      const inst = new THREE.InstancedMesh(this.rockGeo[kind], this.rockMat, rocks.length);
      rocks.forEach((rk, k) => {
        // sunk a little into the snow and tilted with the slope
        normal(rk[0], rk[2], n);
        const st = rk[5] === 1 ? 1.3 : rk[5] === 2 ? 0.8 : 1;
        p.set(rk[0], rk[1] - rk[3] * 0.28, rk[2]); e.set(n.z * 0.6 + (rk[5] - 1) * 0.2, rk[4], -n.x * 0.6); q.setFromEuler(e);
        s.set(rk[3] * st, rk[3] * (0.75 + (k % 5) * 0.06), rk[3] * (0.95 + (k % 3) * 0.1) / st); mx.compose(p, q, s); inst.setMatrixAt(k, mx);
        tint.setScalar(0.85 + (k % 7) * 0.04); inst.setColorAt(k, tint);
        this.addSolid(rk[0], rk[2], rk[3] * Math.max(st, 1 / st), 'rock');
      });
      inst.castShadow = !!this.Q.shadows; inst.receiveShadow = true; inst.visible = false; inst.computeBoundingSphere(); this.scene.add(inst); t.rocks = inst;
    }
    for (const tr of trees) this.addSolid(tr[0], tr[2], 0.55 * tr[3] + 0.2, 'tree');
    this.treeCount += trees.length;
    this.tiles.set(key, t);
    return t;
  }
  updateTiles(cam, rider, all) {
    const R = this.treeFar, ci = Math.floor(cam.x / TILE), cj = Math.floor(cam.z / TILE), span = Math.ceil(R / TILE);
    let built = 0;
    // the tiles right around the rider first (they also hold what you can crash into)
    const ri = Math.floor(rider.x / TILE), rj = Math.floor(rider.z / TILE);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (!this.tiles.has((ri + a) + ',' + (rj + b))) this.makeTile(ri + a, rj + b);
    for (let a = -span; a <= span; a++) for (let b = -span; b <= span; b++) {
      const i = ci + a, j = cj + b, key = i + ',' + j;
      let t = this.tiles.get(key);
      const d = Math.hypot((i + 0.5) * TILE - cam.x, (j + 0.5) * TILE - cam.z) - TILE * 0.7;
      if (!t) { if (d > R || (built >= 1 && !all)) continue; t = this.makeTile(i, j); built++; }
    }
    for (const t of this.tiles.values()) {
      const d = Math.hypot(t.cx - cam.x, t.cz - cam.z) - TILE * 0.7;
      const near = d < this.treeNear, far = !near && d < R;
      for (const m of t.near) m.visible = near;
      if (t.far) t.far.visible = far;
      if (t.rocks) t.rocks.visible = d < 1800;
    }
  }

  // many little meshes -> one mesh per material (far fewer draw calls, good for iPads)
  mergeGroup(group) {
    group.updateMatrixWorld(true);
    const byMat = new Map();
    group.traverse(o => { if (!o.isMesh) return; const g = o.geometry.clone().applyMatrix4(o.matrixWorld); const a = byMat.get(o.material) || []; a.push(g.index ? g.toNonIndexed() : g); byMat.set(o.material, a); });
    for (const [mat, list] of byMat) {
      for (const g of list) { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); }
      const m = new THREE.Mesh(mergeGeometries(list), mat); m.castShadow = !!this.Q.shadows; m.receiveShadow = true; this.scene.add(m);
    }
  }
  cabin(x, z, rot, w = 8, d = 7, hh = 4, wood = '#7b4a2a') {
    const g = new THREE.Group(), y = terrain(x, z);
    const C = this.cabMats || (this.cabMats = {});
    const mat = (k, o) => C[k] || (C[k] = new THREE.MeshStandardMaterial(o));
    const walls = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), mat('w' + wood, { color: wood, roughness: 0.85 })); walls.position.y = hh / 2 - 0.4; g.add(walls);
    const base = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 1, d + 0.4), mat('base', { color: '#6c6f75', roughness: 1 })); base.position.y = -0.2; g.add(base);
    // roof: two slopes, white on top
    const rh = w * 0.38, roof = new THREE.Shape(); roof.moveTo(-w / 2 - 0.8, 0); roof.lineTo(0, rh); roof.lineTo(w / 2 + 0.8, 0); roof.lineTo(w / 2 + 0.8, -0.35); roof.lineTo(0, rh - 0.4); roof.lineTo(-w / 2 - 0.8, -0.35);
    const rg = new THREE.ExtrudeGeometry(roof, { depth: d + 1.4, bevelEnabled: false }); rg.translate(0, 0, -(d + 1.4) / 2);
    const rm = new THREE.Mesh(rg, mat('roof', { color: '#f3f7fc', roughness: 0.8 })); rm.position.y = hh - 0.4; g.add(rm);
    const gable = new THREE.Shape(); gable.moveTo(-w / 2, 0); gable.lineTo(0, rh - 0.3); gable.lineTo(w / 2, 0);
    for (const s of [-1, 1]) { const gm = new THREE.Mesh(new THREE.ShapeGeometry(gable), walls.material); gm.position.set(0, hh - 0.4, s * d / 2); if (s < 0) gm.rotation.y = Math.PI; g.add(gm); }
    const chim = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.2, 0.8), mat('chim', { color: '#7d7b78' })); chim.position.set(w * 0.25, hh + rh * 0.6, 0); g.add(chim);
    const win = mat('win', { color: '#ffd28a', emissive: '#ffb347', emissiveIntensity: 0.9 });
    for (const s of [-1, 1]) for (const k of [-1, 1]) { const wm = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.1), win); wm.position.set(k * w * 0.25, hh * 0.5, s * (d / 2 + 0.02)); if (s < 0) wm.rotation.y = Math.PI; g.add(wm); }
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.1), mat('door', { color: '#3d2617' })); door.position.set(0, 0.65, d / 2 + 0.03); g.add(door);
    g.position.set(x, y, z); g.rotation.y = rot;
    (this.cabins || (this.cabins = new THREE.Group())).add(g);
    this.addSolid(x, z, Math.max(w, d) * 0.62, 'cabin');
    return g;
  }
  // base camp: a couple of huts next to the lobby spot
  baseCamp() {
    const g = this.cabins = new THREE.Group();
    this.cabin(LOBBY.x - 16, LOBBY.z - 14, 0.5, 9, 7, 4.2);
    this.cabin(LOBBY.x + 22, LOBBY.z - 26, -0.35, 7, 6, 3.8, '#8a5a35');
    this.mergeGroup(g); this.cabins = null;
  }

  // ---------- falling snow around the camera ----------
  buildFlakes() {
    const n = this.Q.snow; if (!n) return;
    const p = new Float32Array(n * 3), r = rng(5);
    for (let i = 0; i < n; i++) { p[i * 3] = (r() - 0.5) * 60; p[i * 3 + 1] = (r() - 0.5) * 40; p[i * 3 + 2] = (r() - 0.5) * 60; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    this.flakeMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: { time: { value: 0 } },
      vertexShader: `uniform float time; void main(){ vec3 p = position; p.y = mod(p.y - time * 1.6 + 20.0, 40.0) - 20.0; p.x += sin(time * 0.7 + position.z) * 1.2; p.z += cos(time * 0.5 + position.x) * 1.2;
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = clamp(90.0 / -mv.z, 1.5, 7.0); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.1, length(c)); gl_FragColor = vec4(1.0, 1.0, 1.0, a * 0.85); }`
    });
    this.flakes = new THREE.Points(g, this.flakeMat); this.flakes.frustumCulled = false;
    this.scene.add(this.flakes);
  }
}

export { LIPS };
