// The STEEP mountain as you see it: the snow (drawn with more detail close to you and very fine in the park),
// forests on the lower mountain, rocks and cliffs, the village and the lifts, and the spots you can drop in at.
// height / normal / rideNormal are what the riders and the landing assist use.
import { THREE, makeSky, canvasTex, QUALITY, clamp, smooth, rng } from './engine.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { terrain, BOUNDS, PEAKS, LIPS, LOBBY, zoneAt, runsAt, RUNS, PARK, PIPE, PARK_KICKERS, FLATS, START, MID, VILLAGE, CLIFF_ZONE, POWDER, powderAt, DETAIL } from './terrain.js';
import { makeNoise } from './noise.js';
import { TerrainLOD } from './terrainlod.js';
import { buildPlaces } from './places.js';
import { buildLifts } from './lifts.js';

// a clear, sunny day: the sun behind and to the right of you as you ride down (long soft shadows on the snow)
export const THEME = {
  skyTop: '#1f5fcf', skyMid: '#9ec8f2', skyBottom: '#e6f1fb', sunDir: [0.74, 0.44, -0.5], sunColor: '#ffeccc',
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
export { zoneAt, BOUNDS, PEAKS, LOBBY, RUNS, PARK, PIPE, START, VILLAGE, MID };

function segDist(px, pz, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz;
  const t = clamp(((px - a[0]) * dx + (pz - a[1]) * dz) / l, 0, 1);
  return Math.hypot(px - a[0] - dx * t, pz - a[1] - dz * t);
}
export function lineDist(px, pz, pts) { let d = 1e9; for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, segDist(px, pz, pts[i], pts[i + 1])); return d; }
const slopeY = (x, z) => normal(x, z, new THREE.Vector3()).y;

// ---------- the spots you can drop in at (R takes you back to the last one) ----------
function along(run, u, back = 0) {
  const f = Math.max(0, Math.min(run.P.length - 2, Math.floor(u / 4))), [ax, az] = run.P[f], [bx, bz] = run.P[f + 1];
  const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1;
  return { x: ax - dx / l * back, z: az - dz / l * back, yaw: Math.atan2(dx, dz) };
}
const downhillYaw = (x, z) => { const n = normal(x, z, new THREE.Vector3()); return Math.atan2(n.x, n.z); };
export const DROPS = [];
{
  const park = PARK, wall = RUNS.find(r => r.id === 'wall'), pano = RUNS.find(r => r.id === 'panorama'), meadow = RUNS.find(r => r.id === 'meadow');
  const add = (id, name, p, desc) => DROPS.push({ id, name, desc, x: p.x, z: p.z, yaw: p.yaw ?? downhillYaw(p.x, p.z), alt: Math.round(height(p.x, p.z)) });
  add('start', 'Summit Start', { x: START.x + 6, z: START.z + 14, yaw: along(wall, 0).yaw }, 'The top of the mountain');
  add('wall', 'The Wall', along(wall, 60), 'Steep black run with moguls');
  add('panorama', 'Panorama', along(pano, 90), 'Wide blue run across the mountain');
  add('meadow', 'Green Meadow', along(meadow, 70), 'Gentle beginner run');
  add('park', 'Steep Park', along(park, 0, 25), 'Kickers S, M, L and XL, rails and boxes');
  add('xl', 'XL Kicker', along(park, PARK_KICKERS[3].u - PARK_KICKERS[3].len - 70), 'The biggest jump on the mountain');
  { const p = along(park, PIPE.a - 75), s = 0, d = along(park, PIPE.a - 67); const dx = d.x - p.x, dz = d.z - p.z, l = Math.hypot(dx, dz);
    add('pipe', 'Halfpipe', { x: p.x - dz / l * s, z: p.z + dx / l * s, yaw: p.yaw }, 'A 200 m superpipe'); }
  const cliff = LIPS.filter(l => l.cliff).sort((a, b) => Math.hypot(a.x - CLIFF_ZONE.x, a.z - CLIFF_ZONE.z) - Math.hypot(b.x - CLIFF_ZONE.x, b.z - CLIFF_ZONE.z))[0];
  if (cliff) add('cliffs', 'The Cliffs', { x: cliff.x - cliff.dx * 120, z: cliff.z - cliff.dz * 120, yaw: Math.atan2(cliff.dx, cliff.dz) }, 'Natural cliff drops');
  add('powder', 'Powder Bowl', { x: POWDER[0].x, z: POWDER[0].z - POWDER[0].rz * 0.75 }, 'Deep untouched snow');
  add('glades', 'Pine Glades', { x: POWDER[1].x, z: POWDER[1].z - POWDER[1].rz * 0.8 }, 'Ski between the trees');
  add('base', 'Steep Base', { x: VILLAGE.x - 30, z: VILLAGE.z - 40 }, 'The village at the bottom');
}

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
  mat.userData.sparkle = { value: 1 };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.ripple = { value: ripple };
    sh.uniforms.sparkleK = mat.userData.sparkle;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    let f = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform sampler2D ripple;\nuniform float sparkleK;\nfloat hsh(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }');
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
          totalEmissiveRadiance += vec3(0.95, 0.97, 1.0) * sp * 2.4 * sparkleK; }`);
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
    this.hemi = new THREE.HemisphereLight(THEME.hemiSky, THEME.hemiGround, THEME.hemiInt); scene.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight(THEME.sunColor, THEME.sunInt);
    this.sunDir = new THREE.Vector3(...THEME.sunDir).normalize();
    {
      sun.castShadow = !!this.Q.shadows; sun.shadow.mapSize.set(this.Q.shadows || 1024, this.Q.shadows || 1024);
      const c = sun.shadow.camera, s = 55; c.left = -s; c.right = s; c.top = s; c.bottom = -s; c.near = 1; c.far = 600;
      sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.08; sun.shadow.radius = 3;
    }
    scene.add(sun, sun.target);
    this.grid = new Map(); this.tiles = new Map(); this.treeCount = 0;
    this.corridors = [];      // lift lines and the railway: no trees or rocks there
    this.glowMats = [];       // windows and lamps that light up in the evening
    this.envMats = [];        // shiny things that reflect the sky (ice, helmets)
    this.updaters = [];       // things that move every frame (lifts, flags)
    // the snow
    const mat = this.snowMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, normalMap: snowNormalMap(), normalScale: new THREE.Vector2(0.3, 0.3) });
    snowShader(mat, quality !== 'low');
    const lo = quality === 'low';
    this.lod = new TerrainLOD(scene, mat, { root: 16384, leaf: lo ? 256 : 128, split: quality === 'high' ? 1.9 : lo ? 1.45 : 1.7, keep: lo ? 2048 : 1024, budget: lo ? 5 : 8, maxNodes: lo ? 460 : 900, workers: 2,
      detail: DETAIL, detailLeaf: lo ? 64 : 32, detailDist: lo ? 170 : quality === 'high' ? 300 : 240 });
    // trees and rocks are made per 512 m tile, around wherever you are
    this.treeGeo = [treeGeometry(0, lo), treeGeometry(1, lo), treeGeometry(2, lo)];
    this.farTreeGeo = farTreeGeometry();
    this.treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
    this.rockGeo = [rockGeometry(1, lo ? 0 : 1, 0), rockGeometry(7, lo ? 0 : 1, 1), rockGeometry(13, lo ? 0 : 1, 2)];
    this.rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.05, flatShading: true });
    this.treeNear = lo ? 420 : 700; this.treeFar = lo ? 1700 : 2900;
  }
  // the slow part of starting: the coarse tiles of the whole range, the villages, huts and lifts, the snowfall
  async init(progress) {
    await this.lod.prebuild(progress);
    buildLifts(this);
    buildPlaces(this);
    this.buildFlakes();
  }
  // the light of the moment (from weather.js)
  setEnv(E) {
    const u = this.sky.material.uniforms;
    u.top.value.copy(E.top); u.mid.value.copy(E.mid); u.bottom.value.copy(E.bot); u.sunDir.value.copy(E.sunDir); u.sunCol.value.copy(E.sun);
    u.moonDir.value.copy(E.moonDir); u.cover.value = E.cover; u.night.value = E.night; u.cloudCol.value.copy(E.cloud); u.sunVis.value = E.sunVis;
    this.scene.background.copy(E.mid);
    this.scene.fog.color.copy(E.fog); this.fogBase = E.fogD * (this.q === 'low' ? 1.3 : 1);
    this.sun.color.copy(E.sun); this.sun.intensity = E.si; this.sunDir.copy(E.lightDir);
    this.hemi.color.copy(E.hs); this.hemi.groundColor.copy(E.hg); this.hemi.intensity = E.hi;
    for (const m of this.glowMats) m.emissiveIntensity = (m.userData.base || 0.2) + E.glow * (m.userData.night || 2.2);
    if (this.flakeMat) { this.flakeMat.uniforms.amount.value = E.flakes; this.flakeMat.uniforms.wind.value.copy(E.wind); this.flakes.visible = E.flakes > 0.01; }
    if (this.snowMat.userData.sparkle) this.snowMat.userData.sparkle.value = (1 - E.night) * E.sunVis;
    this.env = E;
  }
  // a picture of the sky for shiny things to reflect (made again when the light has changed)
  updateEnvMap(renderer) {
    if (!this.pmrem) { this.pmrem = new THREE.PMREMGenerator(renderer); this.envScene = new THREE.Scene(); this.envSky = new THREE.Mesh(this.sky.geometry, this.sky.material); this.envScene.add(this.envSky); }
    const old = this.envRT;
    this.envRT = this.pmrem.fromScene(this.envScene, 0.02, 1, 20000);
    for (const m of this.envMats) { m.envMap = this.envRT.texture; m.needsUpdate = !old; }
    if (old) old.dispose();
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
    for (const u of this.updaters) u(dt, t);
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
  treeLine(x, z) { return 1350 + 220 * FOREST(x / 1500 + 5, z / 1500); }
  clearOf(x, z) {
    for (const h of runsAt(x, z)) if (Math.abs(h.v) < h.run.w + 8 && h.u > -30 && h.u < h.run.len + 30) return false;
    for (const f of FLATS) if (Math.hypot(x - f.x, z - f.z) < f.r * 1.6 + 10) return false;
    for (const c of this.corridors) if (x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1 && lineDist(x, z, c.pts) < c.w) return false;
    for (const b of this.blocks || []) if (Math.hypot(x - b.x, z - b.z) < b.r) return false;
    return true;
  }
  // keep trees and rocks off a line (a lift, the railway)
  addCorridor(pts, w) {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
    this.corridors.push({ pts, w, x0: x0 - w, x1: x1 + w, z0: z0 - w, z1: z1 + w });
  }
  // keep a round spot clear (a hut, a summit cross)
  block(x, z, r) { (this.blocks || (this.blocks = [])).push({ x, z, r }); }
  makeTile(i, j) {
    const key = i + ',' + j, r = rng(i * 7919 + j * 104729 + 17), x0 = i * TILE, z0 = j * TILE, trees = [], rocks = [];
    const n = new THREE.Vector3(), dens = this.Q.trees;
    for (let k = 0; k < 520 * dens; k++) {
      const x = x0 + r() * TILE, z = z0 + r() * TILE;
      if (Math.abs(x) > BOUNDS.x - 10 || z < BOUNDS.z0 + 10 || z > BOUNDS.z1 - 10) continue;
      const h = height(x, z), forest = FOREST(x / 650, z / 650) + FOREST(x / 170 + 3, z / 170) * 0.35;
      normal(x, z, n);
      // in the glades the trees stand apart, so you can ski between them
      const glade = powderAt(x, z);
      if (h < this.treeLine(x, z) && n.y > 0.8 && (glade ? r() < 0.3 : forest > -0.15) && this.clearOf(x, z)) {
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
  // ---------- falling snow around the camera ----------
  buildFlakes() {
    const n = this.Q.snow; if (!n) return;
    const p = new Float32Array(n * 3), k = new Float32Array(n), r = rng(5);
    for (let i = 0; i < n; i++) { p[i * 3] = (r() - 0.5) * 70; p[i * 3 + 1] = (r() - 0.5) * 44; p[i * 3 + 2] = (r() - 0.5) * 70; k[i] = r(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('k', new THREE.BufferAttribute(k, 1));
    this.flakeMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false, uniforms: { time: { value: 0 }, amount: { value: 0 }, wind: { value: new THREE.Vector3() }, light: { value: 1 } },
      // only "amount" of the flakes are shown (light snow: a third, heavy snow: all); the wind blows them sideways
      vertexShader: `uniform float time; uniform float amount; uniform vec3 wind; attribute float k; varying float vA;
        void main(){ vec3 p = position; float fall = 1.4 + k * 0.9;
          p.y = mod(p.y - time * fall + 22.0, 44.0) - 22.0;
          p.x = mod(p.x + time * wind.x * 0.8 + sin(time * 0.7 + position.z) * 1.2 + 35.0, 70.0) - 35.0;
          p.z = mod(p.z + time * wind.z * 0.8 + cos(time * 0.5 + position.x) * 1.2 + 35.0, 70.0) - 35.0;
          vA = step(k, amount);
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = vA * clamp(110.0 / -mv.z, 1.5, 8.0); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vA; void main(){ if (vA < 0.5) discard; vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.1, length(c)); gl_FragColor = vec4(1.0, 1.0, 1.0, a * 0.85); }`
    });
    this.flakes = new THREE.Points(g, this.flakeMat); this.flakes.frustumCulled = false; this.flakes.visible = false;
    this.scene.add(this.flakes);
  }
}

export { LIPS };
