// Particle effects: dust puffs, dash trails and rings, hit stars, splashes, confetti, snow.
import { THREE } from './engine.js';

const MAX = 900;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();

export class FX {
  constructor(scene) {
    this.geo = new THREE.IcosahedronGeometry(0.5, 0);
    this.mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < MAX; i++) { this.mesh.setColorAt(i, _c.set(0xffffff)); _m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, _m); }
    scene.add(this.mesh);
    this.ps = [];
    this.rings = [];
    this.ringGeo = new THREE.TorusGeometry(1, 0.08, 6, 32);
    this.scene = scene;
  }
  emit(o) {
    if (this.ps.length >= MAX) this.ps.shift();
    this.ps.push({ p: o.p.clone(), v: o.v.clone(), life: o.life, max: o.life, size: o.size, color: _c.set(o.color).clone(), g: o.g ?? -9, spin: o.spin || 0, rot: Math.random() * 6, drag: o.drag ?? 1.5, shrink: o.shrink ?? true });
  }
  dust(pos, n = 10, color = '#ffffff') {
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 3; this.emit({ p: _p.set(pos.x + Math.cos(a) * 0.3, pos.y + 0.1, pos.z + Math.sin(a) * 0.3), v: new THREE.Vector3(Math.cos(a) * s, 0.8 + Math.random() * 1.5, Math.sin(a) * s), life: 0.45 + Math.random() * 0.25, size: 0.22 + Math.random() * 0.15, color, g: 1 }); }
  }
  dash(pos, vel, color) {
    for (let i = 0; i < 16; i++) { const a = Math.random() * Math.PI * 2; this.emit({ p: _p.copy(pos).add(new THREE.Vector3(0, 0.8, 0)), v: new THREE.Vector3(Math.cos(a) * 4 - vel.x * 0.25, Math.sin(a) * 4, -vel.z * 0.25 + (Math.random() - 0.5) * 2), life: 0.4, size: 0.18, color: i % 3 ? color : '#ffffff', g: 0 }); }
    const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, depthWrite: false }));
    ring.position.copy(pos).add(new THREE.Vector3(0, 0.8, 0));
    ring.lookAt(pos.x + vel.x, pos.y + 0.8 + vel.y, pos.z + vel.z);
    this.scene.add(ring);
    this.rings.push({ m: ring, life: 0.35, max: 0.35 });
  }
  trail(pos, color) { this.emit({ p: _p.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.6 + Math.random() * 0.4, (Math.random() - 0.5) * 0.4)), v: new THREE.Vector3(0, 0.2, 0), life: 0.3, size: 0.16, color, g: 0 }); }
  stars(pos) { for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; this.emit({ p: _p.copy(pos).add(new THREE.Vector3(0, 1.2, 0)), v: new THREE.Vector3(Math.cos(a) * 5, 2 + Math.random() * 3, Math.sin(a) * 5), life: 0.6, size: 0.22, color: i % 2 ? '#ffd23f' : '#ffffff', g: -8, spin: 8 }); } }
  splash(pos, color = '#9fd8ff') { for (let i = 0; i < 26; i++) { const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 4; this.emit({ p: _p.copy(pos), v: new THREE.Vector3(Math.cos(a) * s, 5 + Math.random() * 6, Math.sin(a) * s), life: 0.9, size: 0.2 + Math.random() * 0.15, color, g: -18 }); } }
  confetti(pos, n = 120, spread = 6) {
    const cols = ['#ff4d6d', '#ffd23f', '#3a86ff', '#7bd389', '#ff6fd8', '#ffffff', '#8338ec'];
    for (let i = 0; i < n; i++) this.emit({ p: _p.set(pos.x + (Math.random() - 0.5) * spread, pos.y + Math.random() * 2, pos.z + (Math.random() - 0.5) * spread), v: new THREE.Vector3((Math.random() - 0.5) * 8, 6 + Math.random() * 9, (Math.random() - 0.5) * 8), life: 2.5 + Math.random() * 1.5, size: 0.16, color: cols[i % cols.length], g: -7, spin: 10, drag: 1.2, shrink: false });
  }
  snow(center) { for (let i = 0; i < 3; i++) this.emit({ p: _p.set(center.x + (Math.random() - 0.5) * 60, center.y + 18, center.z + (Math.random() - 0.3) * 60), v: new THREE.Vector3(Math.random() - 0.5, -2.5, Math.random() - 0.5), life: 7, size: 0.12, color: '#ffffff', g: 0, drag: 0, shrink: false }); }
  embers(center) { this.emit({ p: _p.set(center.x + (Math.random() - 0.5) * 50, center.y - 5, center.z + (Math.random() - 0.2) * 60), v: new THREE.Vector3((Math.random() - 0.5), 3 + Math.random() * 3, (Math.random() - 0.5)), life: 4, size: 0.12, color: Math.random() < 0.5 ? '#ff7b00' : '#ffd23f', g: 0, drag: 0 }); }

  update(dt) {
    const ps = this.ps;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) { ps.splice(i, 1); continue; }
      p.v.y += p.g * dt;
      p.v.multiplyScalar(Math.exp(-p.drag * dt));
      p.p.addScaledVector(p.v, dt);
      p.rot += p.spin * dt;
    }
    for (let i = 0; i < MAX; i++) {
      const p = ps[i];
      if (!p) { _m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, _m); continue; }
      const k = p.shrink ? p.life / p.max : 1;
      _s.setScalar(p.size * (0.3 + 0.7 * k) * 2);
      _q.setFromEuler(_e.set(p.rot, p.rot * 0.7, 0));
      _m.compose(p.p, _q, _s);
      this.mesh.setMatrixAt(i, _m);
      this.mesh.setColorAt(i, p.color);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]; r.life -= dt;
      const k = 1 - r.life / r.max;
      r.m.scale.setScalar(0.4 + k * 1.8); r.m.material.opacity = 1 - k;
      if (r.life <= 0) { r.m.removeFromParent(); r.m.material.dispose(); this.rings.splice(i, 1); }
    }
  }
  dispose() { this.mesh.removeFromParent(); this.rings.forEach(r => r.m.removeFromParent()); }
}
