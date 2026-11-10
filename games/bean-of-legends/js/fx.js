// Visual effects: instanced particles (bursts, sparks, smoke, flames, confetti) plus short-lived meshes
// (ground rings, shockwaves, beams, glowing zones). Everything fades out and cleans itself up.
import { THREE } from './engine.js';

const MAX = 1600;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();
const RING_G = new THREE.RingGeometry(0.85, 1, 48); RING_G.rotateX(-Math.PI / 2);
const DISC_G = new THREE.CircleGeometry(1, 48); DISC_G.rotateX(-Math.PI / 2);
const BEAM_G = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true); BEAM_G.rotateX(Math.PI / 2); BEAM_G.translate(0, 0, 0.5);
const COL_G = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true); COL_G.translate(0, 0.5, 0);

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }), MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.frustumCulled = false;
    for (let i = 0; i < MAX; i++) { this.mesh.setColorAt(i, _c.set(0xffffff)); _m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, _m); }
    scene.add(this.mesh);
    this.glow = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }), 500);
    this.glow.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.glow.frustumCulled = false;
    for (let i = 0; i < 500; i++) { this.glow.setColorAt(i, _c.set(0xffffff)); _m.makeScale(0, 0, 0); this.glow.setMatrixAt(i, _m); }
    scene.add(this.glow);
    this.ps = []; this.gs = []; this.temps = [];
    this.quality = 1;
  }
  emit(o, add) {
    const list = add ? this.gs : this.ps, cap = add ? 500 : MAX;
    if (list.length >= cap) list.shift();
    list.push({ p: o.p.clone(), v: o.v ? o.v.clone() : new THREE.Vector3(), life: o.life, max: o.life, size: o.size, color: _c.set(o.color).clone(), g: o.g ?? 0, spin: o.spin || 0, rot: Math.random() * 6, drag: o.drag ?? 2, grow: o.grow || 0 });
  }
  burst(pos, color, n = 14, speed = 5, size = 0.22, up = 3, life = 0.5) {
    n = Math.ceil(n * this.quality);
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.8); this.emit({ p: pos, v: _p.set(Math.cos(a) * s, up * (0.3 + Math.random()), Math.sin(a) * s), life: life * (0.6 + Math.random() * 0.6), size: size * (0.6 + Math.random() * 0.8), color: i % 4 ? color : '#ffffff', g: -9, spin: 6 }); }
  }
  sparks(pos, color, n = 10) { for (let i = 0; i < Math.ceil(n * this.quality); i++) { const a = Math.random() * Math.PI * 2; this.emit({ p: pos, v: _p.set(Math.cos(a) * 6, 2 + Math.random() * 4, Math.sin(a) * 6), life: 0.35, size: 0.18, color, g: -12 }, true); } }
  smoke(pos, color = '#c9c9d6', n = 14, spread = 2) { for (let i = 0; i < Math.ceil(n * this.quality); i++) this.emit({ p: _p.set(pos.x + (Math.random() - 0.5) * spread, pos.y + Math.random(), pos.z + (Math.random() - 0.5) * spread), v: new THREE.Vector3((Math.random() - 0.5), 1 + Math.random(), (Math.random() - 0.5)), life: 1.0 + Math.random() * 0.5, size: 0.4 + Math.random() * 0.3, color, g: 0, drag: 1, grow: 0.9 }); }
  flames(pos, n = 6, spread = 1) { for (let i = 0; i < Math.ceil(n * this.quality); i++) this.emit({ p: _p.set(pos.x + (Math.random() - 0.5) * spread, pos.y + 0.2, pos.z + (Math.random() - 0.5) * spread), v: new THREE.Vector3(0, 2.5 + Math.random() * 2, 0), life: 0.5, size: 0.35, color: Math.random() < 0.5 ? '#ff7b00' : '#ffd23f', g: 0, drag: 0.5 }, true); }
  trail(pos, color, size = 0.2) { this.emit({ p: pos, v: _p.set((Math.random() - 0.5) * 0.5, 0.3, (Math.random() - 0.5) * 0.5), life: 0.35, size, color, g: 0 }, true); }
  heal(pos) { for (let i = 0; i < Math.ceil(12 * this.quality); i++) this.emit({ p: _p.set(pos.x + (Math.random() - 0.5) * 1.6, pos.y + Math.random() * 1.5, pos.z + (Math.random() - 0.5) * 1.6), v: new THREE.Vector3(0, 2 + Math.random(), 0), life: 0.8, size: 0.2, color: i % 2 ? '#7bd389' : '#c8ffd4', g: 0, drag: 0.5 }, true); }
  levelUp(pos) { for (let i = 0; i < 30; i++) { const a = i / 30 * Math.PI * 2; this.emit({ p: _p.set(pos.x + Math.cos(a) * 1.2, pos.y + 0.2, pos.z + Math.sin(a) * 1.2), v: new THREE.Vector3(0, 4 + Math.random() * 2, 0), life: 0.9, size: 0.2, color: i % 2 ? '#ffd23f' : '#ffffff', g: 0, drag: 1 }, true); } this.column(pos, '#ffd23f', 1.4, 5, 0.7); }
  confetti(pos, n = 120, spread = 8) {
    const cols = ['#ff4d6d', '#ffd23f', '#3a86ff', '#7bd389', '#ff6fd8', '#ffffff', '#8338ec'];
    for (let i = 0; i < n; i++) this.emit({ p: _p.set(pos.x + (Math.random() - 0.5) * spread, pos.y + Math.random() * 2, pos.z + (Math.random() - 0.5) * spread), v: new THREE.Vector3((Math.random() - 0.5) * 8, 6 + Math.random() * 9, (Math.random() - 0.5) * 8), life: 2.5 + Math.random() * 1.5, size: 0.18, color: cols[i % cols.length], g: -7, spin: 10, drag: 1.2 });
  }
  // a flat ring that grows from r0 to r1 on the ground
  ring(pos, color, r0, r1, life = 0.45, opacity = 0.9) {
    const m = new THREE.Mesh(RING_G, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }));
    m.position.set(pos.x, pos.y + 0.12, pos.z); this.scene.add(m);
    this.temps.push({ m, life, max: life, up: k => { m.scale.setScalar(r0 + (r1 - r0) * (1 - (1 - k) * (1 - k))); m.material.opacity = opacity * (1 - k); } });
  }
  disc(pos, color, r, life = 0.3, opacity = 0.5) {
    const m = new THREE.Mesh(DISC_G, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    m.position.set(pos.x, pos.y + 0.1, pos.z); m.scale.setScalar(r); this.scene.add(m);
    this.temps.push({ m, life, max: life, up: k => { m.material.opacity = opacity * (1 - k); } });
  }
  shockwave(pos, color, r) { this.ring(pos, color, 0.3, r, 0.45); this.ring(pos, '#ffffff', 0.2, r * 0.7, 0.35, 0.6); this.disc(pos, color, r, 0.25, 0.35); this.burst(_p.set(pos.x, pos.y + 0.3, pos.z), color, 18, r * 1.6, 0.25, 4); }
  beam(from, to, color, width = 0.25, life = 0.25) {
    const m = new THREE.Mesh(BEAM_G, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
    const len = from.distanceTo(to); m.position.copy(from); m.lookAt(to); m.scale.set(width, width, len); this.scene.add(m);
    this.temps.push({ m, life, max: life, up: k => { m.material.opacity = 0.9 * (1 - k); m.scale.x = m.scale.y = width * (1 - k * 0.6); } });
  }
  column(pos, color, r, h, life = 0.6) {
    const m = new THREE.Mesh(COL_G, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.position.set(pos.x, pos.y, pos.z); m.scale.set(r, h, r); this.scene.add(m);
    this.temps.push({ m, life, max: life, up: k => { m.material.opacity = 0.55 * (1 - k); m.scale.x = m.scale.z = r * (1 + k * 0.3); } });
  }
  // a mesh that lives for a while; up(k, dt) is called with k going 0 -> 1
  temp(m, life, up) { this.scene.add(m); this.temps.push({ m, life, max: life, up: up || (() => {}) }); }
  update(dt) {
    for (const [list, mesh, cap] of [[this.ps, this.mesh, MAX], [this.gs, this.glow, 500]]) {
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i]; p.life -= dt;
        if (p.life <= 0) { list.splice(i, 1); continue; }
        p.v.y += p.g * dt; p.v.multiplyScalar(Math.exp(-p.drag * dt)); p.p.addScaledVector(p.v, dt); p.rot += p.spin * dt;
      }
      for (let i = 0; i < cap; i++) {
        const p = list[i];
        if (!p) { if (i < (mesh.userData.n || cap)) { _m.makeScale(0, 0, 0); mesh.setMatrixAt(i, _m); } continue; }
        const k = p.life / p.max;
        _s.setScalar(p.size * 2 * (p.grow ? 1 + (1 - k) * p.grow : 0.3 + 0.7 * k));
        _q.setFromEuler(_e.set(p.rot, p.rot * 0.7, 0)); _m.compose(p.p, _q, _s);
        mesh.setMatrixAt(i, _m); mesh.setColorAt(i, p.grow ? _c.copy(p.color).multiplyScalar(0.5 + 0.5 * k) : p.color);
      }
      mesh.userData.n = list.length + 1;
      mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    for (let i = this.temps.length - 1; i >= 0; i--) {
      const t = this.temps[i]; t.life -= dt;
      t.up(Math.min(1, 1 - t.life / t.max), dt);
      if (t.life <= 0) { t.m.removeFromParent(); if (t.m.material && t.m.material.dispose) t.m.material.dispose(); this.temps.splice(i, 1); }
    }
  }
  dispose() { this.mesh.removeFromParent(); this.glow.removeFromParent(); this.temps.forEach(t => t.m.removeFromParent()); this.temps = []; }
}
