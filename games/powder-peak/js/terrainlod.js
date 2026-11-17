// Drawing a mountain range many kilometres wide: the ground is split into square tiles in a quadtree.
// Close to the camera the tiles are small and detailed (4 m between points), far away they are big
// and coarse. New detail is built a little every frame (never all at once), and a tile is only swapped
// for its four detailed children when all four are ready, so there are no holes. Tiles have short
// "skirts" hanging down at their edges, which hide the cracks between a detailed and a coarse tile.
import { THREE, clamp, smooth } from './engine.js';
import { terrain } from './terrain.js';
import { makeNoise } from './noise.js';

const RES = 32;
const NZ = makeNoise(99);
const C_SNOW = new THREE.Color('#f8fbff'), C_SHADE = new THREE.Color('#d2e1f5'), C_DEEP = new THREE.Color('#b5cae6'),
  C_ICE = new THREE.Color('#e6f2ff'), C_ROCK = new THREE.Color('#6b717c'), C_ROCK2 = new THREE.Color('#857d74'), C_LOW = new THREE.Color('#f3f6f9');

export class TerrainLOD {
  constructor(scene, material, o = {}) {
    this.scene = scene; this.mat = material;
    this.root = o.root || 16384; this.leaf = o.leaf || 128; this.split = o.split || 1.7; this.keep = o.keep || 1024;
    this.budget = o.budget || 6; this.maxNodes = o.maxNodes || 450;
    this.nodes = new Map(); this.visible = new Set(); this.queue = new Set(); this.frame = 0;
    this.index = this.makeIndex();
    this.group = new THREE.Group(); scene.add(this.group);
  }
  makeIndex() {
    const W = RES + 1, idx = [];
    for (let z = 0; z < RES; z++) for (let x = 0; x < RES; x++) { const a = z * W + x, b = a + W; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    // skirts: each edge vertex has a copy hanging below it
    const base = W * W, edges = this.edges = [];
    for (let i = 0; i < W; i++) edges.push(i);                      // top row, left to right
    for (let i = 1; i < W; i++) edges.push(i * W + RES);            // right column, down
    for (let i = RES - 1; i >= 0; i--) edges.push(RES * W + i);     // bottom row, right to left
    for (let i = RES - 1; i >= 1; i--) edges.push(i * W);           // left column, up
    const E = edges.length;
    for (let i = 0; i < E; i++) {
      const a = edges[i], b = edges[(i + 1) % E], sa = base + i, sb = base + (i + 1) % E;
      idx.push(a, sa, b, b, sa, sb, a, b, sa, b, sb, sa);      // both sides, so it hides cracks from any angle
    }
    return new THREE.Uint32BufferAttribute(idx, 1);
  }
  key(size, x, z) { return size + ':' + x + ':' + z; }
  node(size, cx, cz) {
    const k = this.key(size, cx, cz);
    let n = this.nodes.get(k);
    if (!n) { n = { k, size, cx, cz, mesh: null, used: 0 }; this.nodes.set(k, n); }
    return n;
  }
  // ---------- building one tile ----------
  build(n) {
    const s = n.size / RES, W = RES + 1, G = RES + 3, x0 = n.cx - n.size / 2, z0 = n.cz - n.size / 2;
    const H = new Float32Array(G * G);
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) H[j * G + i] = terrain(x0 + (i - 1) * s, z0 + (j - 1) * s);
    const E = this.edges.length, V = W * W + E;
    const pos = new Float32Array(V * 3), nor = new Float32Array(V * 3), col = new Uint8Array(V * 3), uv = new Float32Array(V * 2);
    const c = new THREE.Color();
    let minY = 1e9, maxY = -1e9;
    for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
      const v = j * W + i, gi = (j + 1) * G + (i + 1), h = H[gi], x = x0 + i * s, z = z0 + j * s;
      pos[v * 3] = x; pos[v * 3 + 1] = h; pos[v * 3 + 2] = z; uv[v * 2] = x / 13; uv[v * 2 + 1] = z / 13;
      if (h < minY) minY = h; if (h > maxY) maxY = h;
      let nx = (H[gi - 1] - H[gi + 1]) / (2 * s), nz = (H[gi - G] - H[gi + G]) / (2 * s);
      const l = Math.hypot(nx, 1, nz); nx /= l; nz /= l; const ny = 1 / l;
      nor[v * 3] = nx; nor[v * 3 + 1] = ny; nor[v * 3 + 2] = nz;
      // colour: snow, a cool shade in hollows, ice up high, rock where it is too steep for snow
      const lap = (H[gi - 1] + H[gi + 1] + H[gi - G] + H[gi + G] - 4 * h) / (s * s * Math.max(1, s / 6));
      const hollow = clamp(lap * 5, -1, 1), nv = NZ(x / 34, z / 34), steep = smooth(0.74, 0.56, ny);
      c.copy(h < 700 ? C_LOW : C_SNOW).lerp(C_SHADE, clamp(0.22 + nv * 0.28 + Math.max(0, hollow) * 0.5, 0, 1));
      if (hollow > 0.4) c.lerp(C_DEEP, (hollow - 0.4) * 0.5);
      if (h > 2300) c.lerp(C_ICE, smooth(2300, 2900, h) * 0.5);
      if (steep > 0) c.lerp(nv > 0 ? C_ROCK : C_ROCK2, steep * (0.55 + 0.35 * smooth(-0.4, 0.6, NZ(x / 14, z / 14))));
      col[v * 3] = c.r * 255; col[v * 3 + 1] = c.g * 255; col[v * 3 + 2] = c.b * 255;
    }
    // skirts hang below the edges
    const drop = 2 + n.size * 0.012;
    this.edges.forEach((e, i) => {
      const v = W * W + i;
      pos[v * 3] = pos[e * 3]; pos[v * 3 + 1] = pos[e * 3 + 1] - drop; pos[v * 3 + 2] = pos[e * 3 + 2];
      nor[v * 3] = nor[e * 3]; nor[v * 3 + 1] = nor[e * 3 + 1]; nor[v * 3 + 2] = nor[e * 3 + 2];
      col[v * 3] = col[e * 3]; col[v * 3 + 1] = col[e * 3 + 1]; col[v * 3 + 2] = col[e * 3 + 2];
      uv[v * 2] = uv[e * 2]; uv[v * 2 + 1] = uv[e * 2 + 1];
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(this.index);
    g.boundingBox = new THREE.Box3(new THREE.Vector3(x0, minY - drop, z0), new THREE.Vector3(x0 + n.size, maxY, z0 + n.size));
    g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
    const m = new THREE.Mesh(g, this.mat);
    m.receiveShadow = true; m.matrixAutoUpdate = false; m.visible = false;
    this.group.add(m);
    n.mesh = m; n.minY = minY; n.maxY = maxY;
  }
  // build every tile of this size and bigger (at the start, with a progress callback)
  async prebuild(onProgress) {
    const list = [];
    for (let size = this.root; size >= this.keep; size /= 2) {
      const cnt = this.root / size;
      for (let j = 0; j < cnt; j++) for (let i = 0; i < cnt; i++) list.push([size, -this.root / 2 + (i + 0.5) * size, -this.root / 2 + (j + 0.5) * size]);
    }
    let t = performance.now();
    for (let i = 0; i < list.length; i++) {
      const [size, cx, cz] = list[i]; this.build(this.node(size, cx, cz));
      if (performance.now() - t > 40) { onProgress && onProgress(i / list.length); await new Promise(r => setTimeout(r, 0)); t = performance.now(); }
    }
  }
  // ---------- every frame ----------
  update(cam) {
    this.frame++;
    const want = [], cp = cam.position, self = this;
    function dist(n) { const dx = Math.max(Math.abs(cp.x - n.cx) - n.size / 2, 0), dz = Math.max(Math.abs(cp.z - n.cz) - n.size / 2, 0); const y = cp.y - clamp(cp.y, n.minY ?? 0, n.maxY ?? 3000); return Math.hypot(dx, dz, y); }
    function visit(n) {
      n.used = self.frame;
      const half = n.size / 2;
      if (n.size > self.leaf && dist(n) < n.size * self.split) {
        const q = half / 2, kids = [self.node(half, n.cx - q, n.cz - q), self.node(half, n.cx + q, n.cz - q), self.node(half, n.cx - q, n.cz + q), self.node(half, n.cx + q, n.cz + q)];
        if (kids.every(k => k.mesh)) { kids.forEach(visit); return; }
        for (const k of kids) if (!k.mesh) { k.prio = dist(k) / k.size; self.queue.add(k); }
      }
      want.push(n);
    }
    visit(this.node(this.root, 0, 0));
    const now = new Set(want);
    for (const n of this.visible) if (!now.has(n) && n.mesh) n.mesh.visible = false;
    for (const n of now) if (n.mesh) n.mesh.visible = true;
    this.visible = now;
    // build the most wanted tiles, a few milliseconds per frame
    if (this.queue.size) {
      const t0 = performance.now(), q = [...this.queue].sort((a, b) => a.prio - b.prio);
      for (const n of q) { if (performance.now() - t0 > this.budget) break; this.queue.delete(n); if (!n.mesh && n.used >= this.frame - 1) this.build(n); }
      for (const n of this.queue) if (n.used < this.frame - 2) this.queue.delete(n);
    }
    // forget detailed tiles nobody looked at for a while
    if (this.nodes.size > this.maxNodes && this.frame % 30 === 0) {
      const old = [...this.nodes.values()].filter(n => n.mesh && n.size < this.keep && !now.has(n)).sort((a, b) => a.used - b.used);
      // the index is shared by all tiles: take it off before freeing the rest
      for (const n of old.slice(0, this.nodes.size - this.maxNodes)) { this.group.remove(n.mesh); n.mesh.geometry.setIndex(null); n.mesh.geometry.dispose(); n.mesh = null; this.nodes.delete(n.k); }
    }
  }
  // make sure everything around a point is detailed right now (after jumping somewhere on the map)
  warm(cam, frames = 40) { const b = this.budget; this.budget = 1000; for (let i = 0; i < frames; i++) { this.update(cam); if (!this.queue.size) break; } this.budget = b; }
  get count() { let n = 0; for (const v of this.nodes.values()) if (v.mesh) n++; return n; }
}
