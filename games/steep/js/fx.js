// Snow effects: spray when carving and braking, powder clouds, a burst when landing, a puff at takeoff,
// and the two lines your skis leave in the snow (wider and darker in powder).
import { THREE, clamp, smooth } from './engine.js';

export class SnowFX {
  constructor(scene, quality) {
    this.scene = scene; this.q = quality;
    const N = this.N = quality === 'low' ? 360 : quality === 'medium' ? 1100 : 2400;
    this.k = quality === 'low' ? 0.4 : quality === 'medium' ? 0.8 : 1.3;      // how many particles per effect
    this.pos = new Float32Array(N * 3); this.vel = new Float32Array(N * 3); this.life = new Float32Array(N); this.max = new Float32Array(N);
    this.size = new Float32Array(N); this.alpha = new Float32Array(N); this.grow = new Float32Array(N); this.drag = new Float32Array(N); this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { scale: { value: 300 }, sun: { value: new THREE.Vector3(0.5, 0.5, -0.7) } },
      vertexShader: `attribute float size; attribute float alpha; varying float vA; uniform float scale;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vA = alpha * smoothstep(0.6, 2.2, -mv.z); gl_PointSize = clamp(size * scale / -mv.z, 1.0, 90.0); gl_Position = projectionMatrix * mv; }`,
      // a soft puff: brighter in the middle, a little blue at the edge (snow in the shade)
      fragmentShader: `varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); float a = smoothstep(0.5, 0.0, d);
        // a soft cloud, not a ball: the edge fades out slowly, a little uneven
        a = a * a * (0.75 + 0.25 * sin(c.x * 17.0 + c.y * 11.0));
        vec3 col = mix(vec3(0.84, 0.89, 0.97), vec3(1.0), smoothstep(0.45, 0.0, d + c.y * 0.3)); gl_FragColor = vec4(col, a * vA * 0.8); }`
    });
    this.points = new THREE.Points(g, m); this.points.frustumCulled = false; this.points.renderOrder = 2; scene.add(this.points);
    this.trails = [];
  }
  emit(x, y, z, vx, vy, vz, life, size, grow = 0.15, drag = 2.2) {
    const i = this.next; this.next = (this.next + 1) % this.N;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.max[i] = life; this.size[i] = size; this.grow[i] = grow; this.drag[i] = drag;
  }
  // a fan of snow thrown out sideways from the edges (carving, braking)
  spray(p, v, side, k) {
    const n = Math.max(0, Math.round(k * 3.2 * this.k * (0.6 + Math.random() * 0.8)));
    for (let i = 0; i < n; i++) {
      const s = 0.4 + Math.random() * 0.8;
      this.emit(p.x + (Math.random() - 0.5) * 0.7, p.y + 0.08, p.z + (Math.random() - 0.5) * 0.7,
        v.x * 0.45 + side.x * (2 + Math.random() * 5) * k, 1.2 + Math.random() * 3.2 * k, v.z * 0.45 + side.z * (2 + Math.random() * 5) * k,
        0.35 + Math.random() * 0.5, 0.08 + s * 0.14, 0.4, 2.6);
    }
  }
  // deep snow: a big slow cloud behind you
  powder(p, v, k) {
    const n = Math.max(0, Math.round(k * 4 * this.k * Math.random()));
    for (let i = 0; i < n; i++) {
      this.emit(p.x + (Math.random() - 0.5) * 1.2, p.y + 0.2 + Math.random() * 0.4, p.z + (Math.random() - 0.5) * 1.2,
        v.x * 0.25 + (Math.random() - 0.5) * 2, 1 + Math.random() * 2.5 * k, v.z * 0.25 + (Math.random() - 0.5) * 2,
        0.9 + Math.random() * 1.1, 0.35 + Math.random() * 0.45, 1.1, 1.6);
    }
  }
  // landing: a ring of snow (and a big cloud in powder)
  burst(p, k = 1, deep = 0) {
    const n = Math.round((40 + deep * 40) * k * this.k);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = (2 + Math.random() * 5) * k;
      this.emit(p.x, p.y + 0.15, p.z, Math.cos(a) * s, 1.5 + Math.random() * 4 * k, Math.sin(a) * s, 0.6 + Math.random() * 0.8 + deep * 0.6, 0.18 + Math.random() * 0.35 + deep * 0.3, 0.6 + deep, 2);
    }
  }
  // takeoff: a little puff off the tails
  puff(p, v) {
    const n = Math.round(10 * this.k);
    for (let i = 0; i < n; i++) this.emit(p.x + (Math.random() - 0.5) * 0.5, p.y + 0.05, p.z + (Math.random() - 0.5) * 0.5, v.x * 0.2 + (Math.random() - 0.5) * 2, 0.5 + Math.random() * 1.5, v.z * 0.2 + (Math.random() - 0.5) * 2, 0.5 + Math.random() * 0.4, 0.15 + Math.random() * 0.2, 0.5, 2.5);
  }
  update(dt) {
    for (let i = 0; i < this.N; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const k = this.life[i] / this.max[i];
      this.vel[i * 3 + 1] -= 6 * dt; const drag = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= drag; this.vel[i * 3 + 1] *= drag; this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.alpha[i] = clamp(k * 1.6, 0, 0.75) * smooth(0, 0.08, this.max[i] - this.life[i] + 0.02); this.size[i] += dt * this.grow[i];
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.size.needsUpdate = true; g.attributes.alpha.needsUpdate = true;
    for (const t of this.trails) t.fade(dt);
  }
  setScale(h) { this.points.material.uniforms.scale.value = h * 0.5; }
  trail(width, offsets) { const t = new Trail(this.scene, width, offsets, this.q === 'low' ? 140 : 320); this.trails.push(t); return t; }
}

// lines in the snow: a ribbon that follows the board (two thin ones for skis)
class Trail {
  constructor(scene, width, offsets, max = 260) {
    this.max = max; this.w = width; this.offsets = offsets; this.pts = []; this.scene = scene;
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
  add(p, side, n, onSnow, deep = 0) {
    if (!onSnow) { this.broken = true; return; }
    const last = this.pts[this.pts.length - 1];
    if (last && !this.broken && Math.hypot(p.x - last.x, p.z - last.z) < 0.45) return;
    this.pts.push({ x: p.x, y: p.y + 0.03, z: p.z, sx: side.x, sz: side.z, a: 1, gap: this.broken, d: deep });
    this.broken = false;
    if (this.pts.length > this.max) this.pts.shift();
    this.write();
  }
  fade(dt) { if (!this.pts.length) return; for (const q of this.pts) q.a -= dt * 0.02; while (this.pts.length && this.pts[0].a <= 0) this.pts.shift(); this.fadeT = (this.fadeT || 0) + dt; if (this.fadeT > 0.5) { this.fadeT = 0; this.write(); } }
  write() {
    const P = this.posA, C = this.colA, w = this.w / 2;
    P.fill(0); C.fill(0);
    this.offsets.forEach((off, o) => {
      for (let i = 0; i < this.pts.length; i++) {
        const q = this.pts[i], a = (o * this.max + i) * 2, x = q.x + q.sx * off, z = q.z + q.sz * off;
        const ww = w * (1 + q.d * 1.6);
        P[a * 3] = x + q.sx * ww; P[a * 3 + 1] = q.y; P[a * 3 + 2] = z + q.sz * ww;
        P[a * 3 + 3] = x - q.sx * ww; P[a * 3 + 4] = q.y; P[a * 3 + 5] = z - q.sz * ww;
        const al = q.gap || (this.pts[i + 1] && this.pts[i + 1].gap) ? 0 : Math.max(0, q.a) * (0.3 + q.d * 0.25);
        for (const k of [a, a + 1]) { C[k * 4] = 0.5 - q.d * 0.08; C[k * 4 + 1] = 0.6 - q.d * 0.06; C[k * 4 + 2] = 0.76; C[k * 4 + 3] = al; }
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
