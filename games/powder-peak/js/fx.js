// Snow effects: spray when carving and braking, a burst when landing, and the lines your board or skis
// leave in the snow.
import { THREE, clamp } from './engine.js';

export class SnowFX {
  constructor(scene, quality) {
    this.scene = scene;
    const N = this.N = quality === 'low' ? 260 : quality === 'medium' ? 700 : 1400;
    this.pos = new Float32Array(N * 3); this.vel = new Float32Array(N * 3); this.life = new Float32Array(N); this.max = new Float32Array(N);
    this.size = new Float32Array(N); this.alpha = new Float32Array(N); this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { scale: { value: 300 } },
      vertexShader: `attribute float size; attribute float alpha; varying float vA; uniform float scale;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vA = alpha * smoothstep(0.8, 2.5, -mv.z); gl_PointSize = clamp(size * scale / -mv.z, 1.0, 34.0); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(0.96, 0.98, 1.0, a * vA); }`
    });
    this.points = new THREE.Points(g, m); this.points.frustumCulled = false; scene.add(this.points);
    this.trails = [];
    this.trailOn = quality !== 'low';
  }
  emit(x, y, z, vx, vy, vz, life, size) {
    const i = this.next; this.next = (this.next + 1) % this.N;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.max[i] = life; this.size[i] = size;
  }
  // a fan of snow thrown out sideways from the edge
  spray(p, v, side, k) {
    if (Math.random() > 0.55) return;
    const n = Math.ceil(k * (this.N > 500 ? 2.5 : 1.2));
    for (let i = 0; i < n; i++) {
      const s = 0.4 + Math.random() * 0.8;
      this.emit(p.x + (Math.random() - 0.5) * 0.6, p.y + 0.1, p.z + (Math.random() - 0.5) * 0.6,
        v.x * 0.35 + side.x * (2 + Math.random() * 4) * k, 1.5 + Math.random() * 3 * k, v.z * 0.35 + side.z * (2 + Math.random() * 4) * k,
        0.35 + Math.random() * 0.45, 0.1 + s * 0.16);
    }
  }
  burst(p, k = 1) {
    const n = Math.round((this.N > 500 ? 60 : 24) * k);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = (2 + Math.random() * 5) * k;
      this.emit(p.x, p.y + 0.15, p.z, Math.cos(a) * s, 2 + Math.random() * 4 * k, Math.sin(a) * s, 0.6 + Math.random() * 0.7, 0.25 + Math.random() * 0.4);
    }
  }
  update(dt) {
    for (let i = 0; i < this.N; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const k = this.life[i] / this.max[i];
      this.vel[i * 3 + 1] -= 7 * dt; const drag = Math.exp(-2.2 * dt);
      this.vel[i * 3] *= drag; this.vel[i * 3 + 1] *= drag; this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.alpha[i] = clamp(k * 1.4, 0, 0.6); this.size[i] += dt * 0.12;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.size.needsUpdate = true; g.attributes.alpha.needsUpdate = true;
    for (const t of this.trails) t.fade(dt);
  }
  setScale(h) { this.points.material.uniforms.scale.value = h * 0.45; }
  trail(width, offsets) { const t = new Trail(this.scene, width, offsets); this.trails.push(t); return t; }
}

// lines in the snow: a ribbon that follows the board (two thin ones for skis)
class Trail {
  constructor(scene, width, offsets) {
    this.max = 260; this.w = width; this.offsets = offsets; this.pts = []; this.scene = scene;
    const verts = this.max * 2 * offsets.length;
    this.posA = new Float32Array(verts * 3); this.colA = new Float32Array(verts * 4);
    const g = this.geo = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.posA, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.colA, 4).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let o = 0; o < offsets.length; o++) for (let i = 0; i < this.max - 1; i++) { const a = (o * this.max + i) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    this.mesh.frustumCulled = false; scene.add(this.mesh);
    this.broken = true;
  }
  // p: feet on the snow, side: unit vector to the side, onSnow: false makes a gap
  add(p, side, n, onSnow) {
    if (!onSnow) { this.broken = true; return; }
    const last = this.pts[this.pts.length - 1];
    if (last && !this.broken && Math.hypot(p.x - last.x, p.z - last.z) < 0.6) return;
    this.pts.push({ x: p.x, y: p.y + 0.03, z: p.z, sx: side.x, sz: side.z, a: 1, gap: this.broken });
    this.broken = false;
    if (this.pts.length > this.max) this.pts.shift();
    this.write();
  }
  fade(dt) { if (!this.pts.length) return; for (const q of this.pts) q.a -= dt * 0.035; while (this.pts.length && this.pts[0].a <= 0) this.pts.shift(); this.fadeT = (this.fadeT || 0) + dt; if (this.fadeT > 0.5) { this.fadeT = 0; this.write(); } }
  write() {
    const P = this.posA, C = this.colA, w = this.w / 2;
    P.fill(0); C.fill(0);
    this.offsets.forEach((off, o) => {
      for (let i = 0; i < this.pts.length; i++) {
        const q = this.pts[i], a = (o * this.max + i) * 2, x = q.x + q.sx * off, z = q.z + q.sz * off;
        P[a * 3] = x + q.sx * w; P[a * 3 + 1] = q.y; P[a * 3 + 2] = z + q.sz * w;
        P[a * 3 + 3] = x - q.sx * w; P[a * 3 + 4] = q.y; P[a * 3 + 5] = z - q.sz * w;
        const al = q.gap || (this.pts[i + 1] && this.pts[i + 1].gap) ? 0 : Math.max(0, q.a) * 0.26;
        for (const k of [a, a + 1]) { C[k * 4] = 0.55; C[k * 4 + 1] = 0.64; C[k * 4 + 2] = 0.78; C[k * 4 + 3] = al; }
      }
      // the unused end of the ribbon sits on the last point (no stray triangles)
      const n = this.pts.length;
      if (n) for (let i = n; i < this.max; i++) { const a = (o * this.max + i) * 2, b = (o * this.max + n - 1) * 2; for (let k = 0; k < 6; k++) P[a * 3 + k] = P[b * 3 + k]; }
    });
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.color.needsUpdate = true;
  }
  clear() { this.pts.length = 0; this.write(); }
  dispose() { this.scene.remove(this.mesh); this.geo.dispose(); this.mesh.material.dispose(); }
}
