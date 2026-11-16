// The mountain you ride on: snow, rocks, trees, cabins, the ski lift and the jumps.
// world.height / world.normal are what the riders and the landing assist use.
import { THREE, makeSky, canvasTex, QUALITY, clamp, smooth, rng } from './engine.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { terrain, BOUNDS, ZONES, LIPS, zoneAt } from './terrain.js';
import { makeNoise } from './noise.js';

export const THEME = {
  skyTop: '#2f6fd1', skyMid: '#a9cdf2', skyBottom: '#e9f3fb', sunDir: [0.45, 0.62, -0.64], sunColor: '#fff3df',
  fog: '#d6e6f5', sunInt: 3.0, hemiSky: '#dcecff', hemiGround: '#8aa0b8', hemiInt: 1.15
};

// ---------- jumps built by people: kickers, tables and the big air gap ----------
const SIZES = {
  S: { lk: 6, hk: 1.5, deck: 6, ll: 12, w: 6 },
  M: { lk: 8, hk: 2.3, deck: 10, ll: 18, w: 8 },
  L: { lk: 11, hk: 3.4, deck: 14, ll: 24, w: 10 },
  XL: { lk: 16, hk: 5.4, gap: 22, hl: 6.5, ll: 38, w: 14 }
};
export const JUMPS = [
  { id: 'a1', x: -80, z: -250, size: 'S', name: 'Park Starter' }, { id: 'a2', x: -80, z: -140, size: 'M', name: 'Park Medium' },
  { id: 'a3', x: -80, z: -10, size: 'L', name: 'Park Large' }, { id: 'a4', x: -80, z: 140, size: 'L', name: 'Park Large 2' },
  { id: 'b1', x: 60, z: -270, size: 'M', name: 'Blue Line' }, { id: 'b2', x: 60, z: -150, size: 'L', name: 'Blue Line Large' },
  { id: 'b3', x: 60, z: -5, size: 'XL', name: 'Big Air' }, { id: 'b4', x: 60, z: 190, size: 'M', name: 'Blue Line Finish' },
  { id: 'p1', x: -60, z: -720, size: 'XL', name: 'Sky Ramp' }, { id: 'c1', x: 440, z: -560, size: 'L', name: 'Canyon Kicker' },
  { id: 'f1', x: -420, z: -140, size: 'M', name: 'Forest Kicker' }, { id: 'v1', x: 120, z: 610, size: 'S', name: 'Village Hop' },
  { id: 'v2', x: -150, z: 520, size: 'L', name: 'Lower Kicker' }
];
function setupJump(j) {
  const s = SIZES[j.size];
  Object.assign(j, s);
  j.side = 3;
  j.len = s.gap ? s.lk + s.gap + 4 + s.ll : s.lk + s.deck + s.ll;
  // it points straight down the fall line
  const e = 4, gx = (terrain(j.x + e, j.z) - terrain(j.x - e, j.z)) / (2 * e), gz = (terrain(j.x, j.z + e) - terrain(j.x, j.z - e)) / (2 * e);
  const l = Math.hypot(gx, gz) || 1;
  j.dx = -gx / l; j.dz = -gz / l;
  j.cx = j.x + j.dx * j.len / 2; j.cz = j.z + j.dz * j.len / 2; j.r = j.len / 2 + j.w;
}
JUMPS.forEach(setupJump);
// extra height of a jump at local u (along) / w (across)
function jumpProfile(j, u, w) {
  const side = 1 - smooth(j.w / 2, j.w / 2 + j.side, Math.abs(w));
  if (side <= 0 || u < 0 || u > j.len) return 0;
  let h;
  if (u <= j.lk) h = j.hk * (u / j.lk) ** 2;
  else if (j.gap) {
    const a = u - j.lk;
    if (a < 1) h = j.hk * (1 - a);
    else if (a < j.gap) h = 0;
    else if (a < j.gap + 4) h = j.hl * smooth(j.gap, j.gap + 4, a);
    else h = j.hl * (1 - smooth(j.gap + 4, j.gap + 4 + j.ll, a));
  } else {
    const a = u - j.lk;
    h = a < j.deck ? j.hk : j.hk * (1 - smooth(j.deck, j.deck + j.ll, a));
  }
  return h * side;
}
function jumpAt(x, z) {
  for (const j of JUMPS) {
    const dx = x - j.cx, dz = z - j.cz;
    if (dx * dx + dz * dz > j.r * j.r) continue;
    const rx = x - j.x, rz = z - j.z, u = rx * j.dx + rz * j.dz, w = rx * -j.dz + rz * j.dx;
    const h = jumpProfile(j, u, w);
    if (h > 0) return h;
  }
  return 0;
}

export function height(x, z) { return terrain(x, z) + jumpAt(x, z); }
// the snow right under you, measured behind you along your direction of travel (so the lip of a kicker
// stays sharp: you leave it with the angle of the ramp, not of the snow after it)
export function rideNormal(x, z, dx, dz, out = new THREE.Vector3()) {
  const l = Math.hypot(dx, dz);
  if (l < 0.5) return normal(x, z, out);
  const fx = dx / l, fz = dz / l, e = 0.25, h0 = height(x, z);
  const sF = (h0 - height(x - fx * e, z - fz * e)) / e;                         // slope along travel
  const sS = (height(x - fz * e, z + fx * e) - height(x + fz * e, z - fx * e)) / (2 * e);   // slope across
  // tangent vectors: along (fx, sF, fz) and across (-fz, sS, fx); normal = across x along
  const ax = -fz, ay = sS, az = fx, bx = fx, by = sF, bz = fz;
  return out.set(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx).normalize();
}
export function normal(x, z, out = new THREE.Vector3()) {
  const e = 0.35;
  const hx = height(x + e, z) - height(x - e, z), hz = height(x, z + e) - height(x, z - e);
  return out.set(-hx, 2 * e, -hz).normalize();
}
export { zoneAt, ZONES, BOUNDS };

// ---------- paths that stay free of trees ----------
export const LIFT = { a: [205, 735], b: [175, -850] };        // bottom and top station
export const COURSES = {
  peak: { name: 'Peak to Village', gates: [[30, -840], [95, -720], [20, -600], [-120, -470], [-205, -330], [-170, -150], [-235, 20], [-150, 200], [-60, 360], [-120, 500], [0, 640], [0, 760]] },
  forest: { name: 'Forest Run', gates: [[-420, -470], [-470, -330], [-400, -190], [-520, -40], [-430, 110], [-540, 250], [-400, 400], [-250, 560], [-120, 700]] }
};
const FOREST_PATHS = [[[-420, -500], [-470, -330], [-400, -190], [-520, -40], [-430, 110], [-540, 250], [-400, 400], [-250, 560]], [[-300, -480], [-290, -250], [-330, -60], [-300, 150], [-330, 350]]];
function segDist(px, pz, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz;
  const t = clamp(((px - a[0]) * dx + (pz - a[1]) * dz) / l, 0, 1);
  return Math.hypot(px - a[0] - dx * t, pz - a[1] - dz * t);
}
function lineDist(px, pz, pts) { let d = 1e9; for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, segDist(px, pz, pts[i], pts[i + 1])); return d; }

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
// a little glitter in the snow on the higher graphics settings
function addSparkle(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nfloat hsh(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { float dist = length(vWPos - cameraPosition);
          vec3 cell = floor(vWPos * 7.0);
          float tw = hsh(cell + floor(cameraPosition * 0.6));
          float sp = step(0.9975, tw) * (1.0 - smoothstep(10.0, 45.0, dist));
          totalEmissiveRadiance += vec3(0.9, 0.95, 1.0) * sp * 1.6; }`);
  };
}

// ---------- building blocks ----------
function treeGeometry(kind) {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.22, 0.32, 2.2, 6); trunk.translate(0, 1.1, 0); paint(trunk, '#5b3a24'); parts.push(trunk);
  const layers = kind ? [[2.4, 3.4, 2.4], [1.9, 3, 4.1], [1.35, 2.6, 5.6], [0.8, 2.1, 6.9]] : [[2.9, 3.2, 2.2], [2.2, 2.8, 3.7], [1.5, 2.4, 5], [0.85, 1.9, 6.1]];
  for (const [r, h, y] of layers) {
    const c = new THREE.ConeGeometry(r, h, 8, 1); c.translate(0, y, 0);
    // snow on the top of every layer, dark green below
    const pos = c.attributes.position, nrm = c.attributes.normal, col = new Float32Array(pos.count * 3), g = new THREE.Color('#1f4d33'), s = new THREE.Color('#f4f8ff');
    for (let i = 0; i < pos.count; i++) { const k = smooth(y - h * 0.1, y + h * 0.25, pos.getY(i)) * 0.85 + (nrm.getY(i) > 0.6 ? 0.1 : 0); const cc = g.clone().lerp(s, k); col[i * 3] = cc.r; col[i * 3 + 1] = cc.g; col[i * 3 + 2] = cc.b; }
    c.setAttribute('color', new THREE.BufferAttribute(col, 3));
    parts.push(c);
  }
  return mergeGeometries(parts.map(p => p.index ? p.toNonIndexed() : p));
}
function paint(geo, color) {
  const c = new THREE.Color(color), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo;
}
function rockGeometry(seed, detail = 1) {
  const g = new THREE.DodecahedronGeometry(1, detail), p = g.attributes.position, r = rng(seed), col = new Float32Array(p.count * 3);
  const rock = new THREE.Color('#6d7178'), snow = new THREE.Color('#eef4fb');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 0.8 + 0.35 * Math.sin(x * 3.1 + seed) * Math.cos(z * 2.7 + y * 1.3);
    p.setXYZ(i, x * k * 1.25, y * k * 0.8, z * k);
    const c = rock.clone().lerp(snow, smooth(0.25, 0.6, y)); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals(); r();
  return g;
}

export class World {
  constructor(quality) {
    this.q = quality; this.Q = QUALITY[quality] || QUALITY.medium;
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(THEME.skyMid);
    scene.fog = new THREE.FogExp2(new THREE.Color(THEME.fog), 0.00042);
    this.sky = makeSky(THEME); scene.add(this.sky);
    scene.add(new THREE.HemisphereLight(THEME.hemiSky, THEME.hemiGround, THEME.hemiInt));
    const sun = this.sun = new THREE.DirectionalLight(THEME.sunColor, THEME.sunInt);
    this.sunDir = new THREE.Vector3(...THEME.sunDir).normalize();
    if (this.Q.shadows) {
      sun.castShadow = true; sun.shadow.mapSize.set(this.Q.shadows, this.Q.shadows);
      const c = sun.shadow.camera, s = this.Q.shadows >= 2048 ? 60 : 40; c.left = -s; c.right = s; c.top = s; c.bottom = -s; c.near = 1; c.far = 400;
      sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.06;
    }
    scene.add(sun, sun.target);
    this.trees = []; this.grid = new Map(); this.solids = [];
    this.buildTerrain();
    this.buildDistant();
    this.buildJumps();
    this.buildTrees();
    this.buildRocks();
    this.buildVillage();
    this.buildLift();
    this.buildFlakes();
  }
  height(x, z) { return height(x, z); }
  normal(x, z, out) { return normal(x, z, out); }
  rideNormal(x, z, dx, dz, out) { return rideNormal(x, z, dx, dz, out); }
  terrain(x, z) { return terrain(x, z); }
  zoneAt(x, z) { return zoneAt(x, z); }

  // shadows and falling snow stay around what the camera looks at
  focus(p, cam) {
    this.sun.position.copy(p).addScaledVector(this.sunDir, 200); this.sun.target.position.copy(p);
    this.sky.position.copy(cam.position);
    if (this.flakes) this.flakes.position.copy(cam.position);
  }
  update(dt, t) {
    if (this.flakes) this.flakeMat.uniforms.time.value = t;
    if (this.chairs) this.moveChairs(t);
  }

  // ---------- snow ----------
  buildTerrain() {
    const cell = this.Q.cell, x0 = -BOUNDS.x - 140, x1 = BOUNDS.x + 140, z0 = BOUNDS.z0 - 120, z1 = BOUNDS.z1 + 140;
    const nx = Math.round((x1 - x0) / cell), nz = Math.round((z1 - z0) / cell);
    const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0, nx, nz); geo.rotateX(-Math.PI / 2); geo.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    const pos = geo.attributes.position, nrm = geo.attributes.normal, uv = geo.attributes.uv, col = new Float32Array(pos.count * 3);
    const snow = new THREE.Color('#f7fbff'), shade = new THREE.Color('#dce8f6'), rock = new THREE.Color('#737a84'), rock2 = new THREE.Color('#8c857c'), groom = new THREE.Color('#ffffff');
    const n = new THREE.Vector3(), c = new THREE.Color(), nz2 = makeNoise(99);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), h = terrain(x, z);
      pos.setY(i, h);
      const e = 1.2; n.set(terrain(x - e, z) - terrain(x + e, z), 2 * e, terrain(x, z - e) - terrain(x, z + e)).normalize();
      nrm.setXYZ(i, n.x, n.y, n.z);
      uv.setXY(i, x / 13, z / 13);
      // rock where it is too steep for snow to stay, a light blue in the hollows
      const steep = smooth(0.72, 0.56, n.y), v = nz2(x / 30, z / 30);
      c.copy(snow).lerp(shade, clamp(0.35 + v * 0.35, 0, 1));
      const zn = zoneAt(x, z);
      if (zn.id === 'park' || zn.id === 'village') c.lerp(groom, 0.5);
      if (steep > 0) c.lerp(v > 0 ? rock : rock2, steep * (0.6 + 0.3 * smooth(-0.4, 0.6, nz2(x / 12, z / 12))));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeBoundingSphere();
    const mat = this.snowMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0, normalMap: snowNormalMap(), normalScale: new THREE.Vector2(0.38, 0.38) });
    if (this.q === 'high' || this.q === 'ultra') addSparkle(mat);
    const m = this.ground = new THREE.Mesh(geo, mat); m.receiveShadow = true;
    this.scene.add(m);
  }
  // big mountains all around, far away
  buildDistant() {
    const n = makeNoise(321), rings = 30, segs = 200, geo = new THREE.BufferGeometry(), p = [], col = [], idx = [];
    const snow = new THREE.Color('#f2f6fb'), rock = new THREE.Color('#7d8796'), far = new THREE.Color('#b9cce0');
    for (let r = 0; r <= rings; r++) {
      const rad = 1500 + r * 130;
      for (let s = 0; s <= segs; s++) {
        const a = s / segs * Math.PI * 2, x = Math.cos(a) * rad, z = Math.sin(a) * rad * 1.15;
        const k = r / rings, ridge = 1 - Math.abs(n(Math.cos(a) * 3 + r * 0.05, Math.sin(a) * 3));
        let h = 30 + (120 + 780 * Math.pow(ridge, 1.7)) * smooth(0, 0.3, k) * (1 - smooth(0.85, 1, k)) + n(x / 500, z / 500) * 60 * smooth(0, 0.2, k);
        if (z < 0) h += 300 * smooth(0, -1, Math.sin(a)) * smooth(0.1, 0.5, k);   // taller behind the peak
        p.push(x, h, z);
        const c = rock.clone().lerp(snow, smooth(120, 420, h + n(x / 90, z / 90) * 120)).lerp(far, 0.25 + k * 0.45);
        col.push(c.r, c.g, c.b);
      }
    }
    for (let r = 0; r < rings; r++) for (let s = 0; s < segs; s++) { const a = r * (segs + 1) + s, b = a + segs + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    this.scene.add(m);
  }

  // ---------- kickers and tables ----------
  buildJumps() {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, normalMap: this.snowMat.normalMap, normalScale: new THREE.Vector2(0.3, 0.3), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const white = new THREE.Color('#ffffff'), blue = new THREE.Color('#2f7dff'), side = new THREE.Color('#e3edf8');
    const poleGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6); poleGeo.translate(0, 0.8, 0);
    const poles = [];
    for (const j of JUMPS) {
      const W = j.w / 2 + j.side + 0.6, du = 0.5, dw = 0.5, nu = Math.ceil((j.len + 2) / du), nw = Math.ceil(2 * W / dw);
      const p = [], col = [], uv = [], idx = [];
      for (let a = 0; a <= nu; a++) for (let b = 0; b <= nw; b++) {
        const u = -1 + a * du, w = -W + b * dw, x = j.x + j.dx * u - j.dz * w, z = j.z + j.dz * u + j.dx * w;
        const ph = jumpProfile(j, u, w);
        p.push(x, terrain(x, z) + ph + 0.04, z); uv.push(x / 9, z / 9);
        // a blue line on the lip so you can see where to pop
        const lip = Math.abs(u - j.lk) < 0.45 && Math.abs(w) < j.w / 2 ? 1 : 0;
        const c = lip ? blue : ph > 0.05 ? white : side;
        col.push(c.r, c.g, c.b);
      }
      for (let a = 0; a < nu; a++) for (let b = 0; b < nw; b++) { const i = a * (nw + 1) + b, k = i + nw + 1; idx.push(i, k, i + 1, k, k + 1, i + 1); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat); m.receiveShadow = false; this.scene.add(m);
      // orange poles at the sides of the lip
      for (const s of [-1, 1]) {
        const u = j.lk, w = s * (j.w / 2 + 0.4), x = j.x + j.dx * u - j.dz * w, z = j.z + j.dz * u + j.dx * w;
        poles.push([x, height(x, z), z]);
      }
    }
    const inst = new THREE.InstancedMesh(poleGeo, new THREE.MeshStandardMaterial({ color: '#ff7a1a', roughness: 0.5 }), poles.length);
    const mx = new THREE.Matrix4();
    poles.forEach((q, i) => { mx.makeTranslation(q[0], q[1] - 0.2, q[2]); inst.setMatrixAt(i, mx); });
    this.scene.add(inst);
  }

  // ---------- trees ----------
  addSolid(x, z, r, kind) {
    const k = Math.floor(x / 16) + ',' + Math.floor(z / 16);
    let a = this.grid.get(k); if (!a) this.grid.set(k, a = []);
    a.push({ x, z, r, kind });
  }
  // anything solid near (x, z): trees, rocks, cabins, lift poles
  solidsNear(x, z, out = []) {
    out.length = 0;
    const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
    for (let i = -1; i <= 1; i++) for (let k = -1; k <= 1; k++) { const a = this.grid.get((cx + i) + ',' + (cz + k)); if (a) for (const s of a) out.push(s); }
    return out;
  }
  clearOf(x, z) {
    // keep runs, the park, the lift line and the village square free
    for (const c of Object.values(COURSES)) if (lineDist(x, z, c.gates) < 16) return false;
    for (const p of FOREST_PATHS) if (lineDist(x, z, p) < 9) return false;
    if (segDist(x, z, LIFT.a, LIFT.b) < 14) return false;
    for (const j of JUMPS) if (Math.hypot(x - j.cx, z - j.cz) < j.r + 6) return false;
    if (x > -180 && x < 180 && z > -340 && z < 400) return false;
    if (Math.abs(x) < 120 && z > 600 && z < 900) return false;
    return true;
  }
  buildTrees() {
    const r = rng(11), list = [], dens = this.Q.trees;
    const tryAt = (x, z) => {
      if (Math.abs(x) > BOUNDS.x - 10 || z < BOUNDS.z0 + 20 || z > BOUNDS.z1 - 20 || !this.clearOf(x, z)) return;
      const h = terrain(x, z); if (h > 470) return;           // above the tree line
      const n = normal(x, z); if (n.y < 0.8) return;
      list.push([x, h, z, 0.75 + r() * 0.75, r() * 6.28, r() < 0.45 ? 1 : 0]);
    };
    const forest = ZONES[3];
    for (let i = 0; i < 2600 * dens; i++) tryAt(forest.x0 + r() * (forest.x1 - forest.x0), forest.z0 + r() * (forest.z1 - forest.z0));
    for (let i = 0; i < 1500 * dens; i++) {
      const x = (r() * 2 - 1) * BOUNDS.x, z = BOUNDS.z0 + r() * (BOUNDS.z1 - BOUNDS.z0);
      // clusters: more trees where a slow noise is high
      if (Math.sin(x * 0.013 + z * 0.004) + Math.cos(z * 0.011 - x * 0.006) > 0.2 || r() < 0.25) tryAt(x, z);
    }
    for (const kind of [0, 1]) {
      const sel = list.filter(t => t[5] === kind); if (!sel.length) continue;
      const geo = treeGeometry(kind), inst = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }), sel.length);
      const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
      sel.forEach((t, i) => { p.set(t[0], t[1] - 0.3, t[2]); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t[4]); s.setScalar(t[3]); mx.compose(p, q, s); inst.setMatrixAt(i, mx); this.addSolid(t[0], t[2], 0.55 * t[3] + 0.2, 'tree'); });
      inst.castShadow = !!this.Q.shadows; inst.receiveShadow = false;
      this.scene.add(inst);
    }
    this.treeCount = list.length;
  }
  buildRocks() {
    const r = rng(23), list = [];
    const maxRocks = Math.round(520 * Math.min(1, this.Q.trees + 0.2));
    for (let i = 0; i < 2600 && list.length < maxRocks; i++) {
      const x = (r() * 2 - 1) * (BOUNDS.x + 60), z = BOUNDS.z0 - 40 + r() * 1300;
      if (!this.clearOf(x, z) && Math.abs(x) < BOUNDS.x) continue;
      const n = normal(x, z), steep = n.y < 0.8, high = terrain(x, z) > 380;
      if (!(steep || (high && r() < 0.18) || (Math.abs(x) > BOUNDS.x - 30 && r() < 0.5))) continue;
      list.push([x, terrain(x, z), z, 1 + r() * (steep ? 4 : 2.2), r() * 6.28]);
    }
    const geos = [rockGeometry(1, this.q === 'low' ? 0 : 1), rockGeometry(2, this.q === 'low' ? 0 : 1)];
    geos.forEach((geo, gi) => {
      const sel = list.filter((_, i) => i % 2 === gi), inst = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }), sel.length);
      const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
      sel.forEach((t, i) => { p.set(t[0], t[1] - t[3] * 0.25, t[2]); e.set(0, t[4], 0); q.setFromEuler(e); s.set(t[3], t[3] * 0.8, t[3] * 1.1); mx.compose(p, q, s); inst.setMatrixAt(i, mx); this.addSolid(t[0], t[2], t[3] * 1.0, 'rock'); });
      inst.castShadow = !!this.Q.shadows; inst.receiveShadow = true;
      this.scene.add(inst);
    });
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
  // ---------- the village: cabins with snowy roofs ----------
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
  buildVillage() {
    const r = rng(41);
    const spots = [[-150, 700], [-95, 740], [-170, 790], [-110, 840], [-220, 730], [140, 860], [100, 800], [-60, 880], [70, 900], [270, 820], [-280, 860], [320, 700], [-330, 660]];
    spots.forEach(([x, z], i) => this.cabin(x, z, (r() - 0.5) * 0.8 + (x > 0 ? -0.3 : 0.3), 7 + r() * 4, 6 + r() * 3, 3.6 + r() * 1.4, ['#7b4a2a', '#8a5a35', '#6b3f24', '#9a6b43'][i % 4]));
    // a few mountain huts higher up
    this.cabin(-330, -620, 0.4, 6, 5, 3.4); this.cabin(520, -40, -0.6, 6, 5, 3.4); this.cabin(-610, 90, 0.2, 5, 5, 3.2);
    this.mergeGroup(this.cabins); this.cabins = null;
    // lamp posts on the square
    const post = new THREE.CylinderGeometry(0.08, 0.1, 3.6, 6), lamp = new THREE.SphereGeometry(0.28, 10, 8);
    const pm = new THREE.MeshStandardMaterial({ color: '#2c2f36' }), lm = new THREE.MeshStandardMaterial({ color: '#fff1c9', emissive: '#ffcf6b', emissiveIntensity: 1.4 });
    for (const [x, z] of [[-30, 760], [30, 760], [-30, 840], [30, 840], [-60, 700], [60, 700]]) {
      const y = terrain(x, z), a = new THREE.Mesh(post, pm), b = new THREE.Mesh(lamp, lm); a.position.set(x, y + 1.8, z); b.position.set(x, y + 3.7, z); this.scene.add(a, b); this.addSolid(x, z, 0.3, 'pole');
    }
  }

  // ---------- chairlift from the village to the peak ----------
  buildLift() {
    const [ax, az] = LIFT.a, [bx, bz] = LIFT.b, dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len;
    const steel = new THREE.MeshStandardMaterial({ color: '#8b95a3', metalness: 0.6, roughness: 0.4 }), red = new THREE.MeshStandardMaterial({ color: '#d83a3a', roughness: 0.5 });
    const n = Math.round(len / 110), tops = [];
    const towerGeo = new THREE.CylinderGeometry(0.35, 0.5, 1, 8), armGeo = new THREE.BoxGeometry(6, 0.35, 0.5);
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = ax + dx * t, z = az + dz * t, y = terrain(x, z), h = 11 + (i === 0 || i === n ? 2 : 0);
      const tw = new THREE.Mesh(towerGeo, steel); tw.scale.y = h; tw.position.set(x, y + h / 2, z);
      const arm = new THREE.Mesh(armGeo, steel); arm.position.set(x, y + h, z); arm.rotation.y = Math.atan2(ux, uz);
      this.scene.add(tw, arm); this.addSolid(x, z, 0.8, 'pole');
      tops.push(new THREE.Vector3(x, y + h - 0.2, z));
    }
    this.liftTops = tops;
    // two cables (up and down), 2.6 m to each side
    const side = new THREE.Vector3(uz, 0, -ux).multiplyScalar(2.6);
    this.cables = [-1, 1].map(s => {
      const pts = []; for (let i = 0; i < tops.length - 1; i++) for (let k = 0; k < 8; k++) { const t = k / 8, p = tops[i].clone().lerp(tops[i + 1], t); p.y -= Math.sin(t * Math.PI) * 1.4; p.addScaledVector(side, s); pts.push(p); }
      pts.push(tops[tops.length - 1].clone().addScaledVector(side, s));
      const curve = new THREE.CatmullRomCurve3(pts);
      const line = new THREE.Mesh(new THREE.TubeGeometry(curve, pts.length * 2, 0.05, 4, false), new THREE.MeshStandardMaterial({ color: '#33383f' }));
      this.scene.add(line); return curve;
    });
    // chairs
    const chair = new THREE.Group();
    const hang = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 5), steel); hang.position.y = -1.1; chair.add(hang);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.12, 0.6), red); seat.position.set(0, -2.2, 0); chair.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 0.1), red); back.position.set(0, -1.85, -0.28); chair.add(back);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.05, 0.05), steel); bar.position.set(0, -1.6, 0.35); chair.add(bar);
    const count = this.q === 'low' ? 14 : 30;
    const bake = (meshes) => mergeGeometries(meshes.map(m => { m.updateMatrix(); const g = m.geometry.clone().applyMatrix4(m.matrix); return g.index ? g.toNonIndexed() : g; }));
    this.chairParts = [new THREE.InstancedMesh(bake([hang, bar]), steel, count), new THREE.InstancedMesh(bake([seat, back]), red, count)];
    for (const m of this.chairParts) { m.frustumCulled = false; this.scene.add(m); }
    this.chairs = [];
    for (let i = 0; i < count; i++) this.chairs.push({ obj: new THREE.Object3D(), off: i / count, i });
    // stations
    for (const [x, z, rot] of [[ax, az + 8, 0], [bx, bz - 8, Math.PI]]) {
      const y = terrain(x, z), g = new THREE.Group();
      const roof = new THREE.Mesh(new THREE.BoxGeometry(12, 0.6, 14), new THREE.MeshStandardMaterial({ color: '#f1f5fa' })); roof.position.y = 7; g.add(roof);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(5, 4, 5), new THREE.MeshStandardMaterial({ color: '#3a6fd8', roughness: 0.6 })); cab.position.set(-6, 2, 0); g.add(cab);
      for (const [px, pz] of [[-5, -6], [5, -6], [-5, 6], [5, 6]]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7, 0.5), steel); p.position.set(px, 3.5, pz); g.add(p); }
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.25, 8, 24), steel); wheel.rotation.x = Math.PI / 2; wheel.position.y = 6.4; g.add(wheel);
      g.position.set(x, y, z); g.rotation.y = Math.atan2(ux, uz) + rot; this.scene.add(g);
      this.addSolid(x - 6 * Math.cos(g.rotation.y), z + 6 * Math.sin(g.rotation.y), 3.4, 'cabin');
    }
  }
  moveChairs(t) {
    const L = this.chairs.length; if (!L) return;
    const v = new THREE.Vector3(), w = new THREE.Vector3();
    for (const c of this.chairs) {
      let k = (c.off + t * 0.004) % 1;
      const up = k < 0.5, s = up ? k * 2 : (k - 0.5) * 2, curve = this.cables[up ? 0 : 1];
      const u = up ? s : 1 - s;
      curve.getPointAt(Math.min(0.999, u), v); curve.getPointAt(Math.min(1, u + 0.001), w);
      c.obj.position.copy(v); c.obj.rotation.y = Math.atan2(w.x - v.x, w.z - v.z) + (up ? 0 : Math.PI);
      c.obj.updateMatrix();
      for (const m of this.chairParts) m.setMatrixAt(c.i, c.obj.matrix);
    }
    for (const m of this.chairParts) m.instanceMatrix.needsUpdate = true;
  }
  // where you sit when you ride the lift (t from 0 at the bottom to 1 at the top)
  liftPoint(t, out = new THREE.Vector3()) { return this.cables[0].getPointAt(clamp(t, 0, 0.999), out); }

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

// drop points: where you can start
export const DROPS = [
  { id: 'peak', name: 'Mountain Peak', x: 20, z: -880 },
  { id: 'cliffs', name: 'Cliff Area', x: 420, z: -600 },
  { id: 'forest', name: 'Snowy Forest', x: -420, z: -500 },
  { id: 'park', name: 'Freestyle Park', x: -10, z: -340 },
  { id: 'village', name: 'Village', x: 0, z: 690 }
];
export { lineDist };
