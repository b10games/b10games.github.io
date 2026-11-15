// Small things that make a map feel alive: little flocks of birds (bats in the swamp) that fly over the
// field now and then, flapping their wings and throwing real shadows on the ground.
import { THREE } from './engine.js';

const LOOK = {
  valley: { body: '#ffffff', wing: '#e8eef5', tip: '#3b3b48', n: [4, 7] },
  candy: { body: '#ffd6f0', wing: '#ff9ad5', tip: '#ffffff', n: [3, 6] },
  dunes: { body: '#8a6a45', wing: '#a8875a', tip: '#3b2a1a', n: [3, 5] },
  frost: { body: '#ffffff', wing: '#dfeaf5', tip: '#2b3a4a', n: [3, 6] },
  swamp: { body: '#2a1f3d', wing: '#3d2c5c', tip: '#120c1f', n: [4, 8], bat: true }
};
const BODY_G = new THREE.SphereGeometry(0.22, 8, 6); BODY_G.scale(1, 0.8, 2);
function wingGeo(bat) {
  // one wing pointing along +x, hinged at x = 0
  const g = new THREE.BufferGeometry();
  const v = bat
    ? [0, 0, 0.3, 1.1, 0, 0.35, 0.55, 0, -0.1, 0, 0, 0.3, 0.55, 0, -0.1, 0, 0, -0.35, 0.55, 0, -0.1, 1.1, 0, 0.35, 1.25, 0, -0.35]
    : [0, 0, 0.32, 0.75, 0, 0.18, 0, 0, -0.3, 0.75, 0, 0.18, 1.35, 0, -0.1, 0, 0, -0.3, 0.75, 0, 0.18, 1.35, 0, -0.1, 0.7, 0, -0.32];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}
const WING = { bird: wingGeo(false), bat: wingGeo(true) };
const mats = new Map();
function mat(c) { if (!mats.has(c)) mats.set(c, new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, side: THREE.DoubleSide })); return mats.get(c); }

export class Ambient {
  constructor(scene, theme) {
    this.scene = scene; this.look = LOOK[theme] || null; this.flocks = []; this.wait = 2 + Math.random() * 4;
  }
  spawn() {
    const L = this.look, group = new THREE.Group(), n = L.n[0] + Math.floor(Math.random() * (L.n[1] - L.n[0] + 1));
    const birds = [];
    for (let i = 0; i < n; i++) {
      const b = new THREE.Group();
      const body = new THREE.Mesh(BODY_G, mat(L.body)); b.add(body);
      const lw = new THREE.Group(), rw = new THREE.Group();
      const lm = new THREE.Mesh(L.bat ? WING.bat : WING.bird, mat(L.wing)), rm = lm.clone(); rm.scale.x = -1;
      lw.add(lm); rw.add(rm); lw.position.x = 0.12; rw.position.x = -0.12; b.add(lw, rw);
      b.traverse(o => { if (o.isMesh) o.castShadow = true; });
      // a loose V: the leader in front, the others behind on alternating sides
      const side = i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2);
      b.position.set(side * 1.6 + (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 1.2, -Math.abs(side) * 1.5);
      const s = (L.bat ? 0.9 : 1) * (0.85 + Math.random() * 0.3);
      b.scale.setScalar(s);
      group.add(b); birds.push({ b, lw, rw, ph: Math.random() * 6, sp: (L.bat ? 15 : 9) * (0.9 + Math.random() * 0.2) });
    }
    // fly straight over the field from one side to the other
    const a = Math.random() * Math.PI * 2, dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const off = (Math.random() - 0.5) * 30, start = dir.clone().multiplyScalar(-75).add(new THREE.Vector3(-dir.z * off, 0, dir.x * off));
    group.position.set(start.x, 13 + Math.random() * 6, start.z);
    group.rotation.y = Math.atan2(dir.x, dir.z);
    this.scene.add(group);
    this.flocks.push({ group, birds, dir, speed: (L.bat ? 11 : 8) + Math.random() * 3, t: 0 });
  }
  update(dt) {
    if (!this.look) return;
    this.wait -= dt;
    if (this.wait <= 0) { if (this.flocks.length < 2) this.spawn(); this.wait = 9 + Math.random() * 12; }
    for (let i = this.flocks.length - 1; i >= 0; i--) {
      const f = this.flocks[i]; f.t += dt;
      f.group.position.addScaledVector(f.dir, f.speed * dt);
      f.group.position.y += Math.sin(f.t * 0.8) * dt * 0.6;
      for (const o of f.birds) {
        // flap, then glide for a moment
        const cyc = (f.t * 0.5 + o.ph) % 3, flapping = this.look.bat || cyc < 2;
        const w = flapping ? Math.sin(f.t * o.sp + o.ph) * (this.look.bat ? 0.9 : 0.7) : 0.12;
        o.lw.rotation.z = w; o.rw.rotation.z = -w;
        o.b.position.y += Math.cos(f.t * o.sp + o.ph) * dt * (this.look.bat ? 1.2 : 0.3);
        if (this.look.bat) o.b.position.x += Math.sin(f.t * 3 + o.ph) * dt * 1.5;
      }
      if (f.group.position.length() > 95) { f.group.removeFromParent(); this.flocks.splice(i, 1); }
    }
  }
  dispose() { for (const f of this.flocks) f.group.removeFromParent(); this.flocks = []; }
}
