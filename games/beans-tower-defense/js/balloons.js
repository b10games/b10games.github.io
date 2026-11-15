// Drawing the balloons. Ordinary balloons share a few instanced meshes (body, knot, string, ice shell), so hundreds
// of them cost only a handful of draw calls. Giant balloons are separate, more detailed models.
import { THREE, canvasTex } from './engine.js';
import { BALLOONS } from './data.js';

const MAXB = 1400;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color(), _e = new THREE.Euler();
const ICE = new THREE.Color('#bfe8ff'), WHITE = new THREE.Color('#ffffff');
let RAINBOW_TEX = null;
function rainbowTex() {
  if (RAINBOW_TEX) return RAINBOW_TEX;
  RAINBOW_TEX = canvasTex(64, 256, (g, w, h) => { const cols = ['#ff4d5e', '#ff8c42', '#ffd23f', '#36c46b', '#3a8bff', '#9b5de5']; cols.forEach((c, i) => { g.fillStyle = c; g.fillRect(0, i * h / cols.length, w, h / cols.length + 1); }); });
  RAINBOW_TEX.wrapS = RAINBOW_TEX.wrapT = THREE.ClampToEdgeWrapping;
  return RAINBOW_TEX;
}
function balloonGeo() {
  // a slightly pear-shaped balloon
  const pts = [];
  for (let i = 0; i <= 20; i++) { const a = i / 20 * Math.PI, r = Math.sin(a) * (1 - 0.18 * Math.max(0, Math.cos(a + 0.4))), y = -Math.cos(a) * 1.15; pts.push(new THREE.Vector2(Math.max(0.001, r), y)); }
  const g = new THREE.LatheGeometry(pts, 20);
  return g;
}

export class BalloonView {
  constructor(scene) {
    this.scene = scene;
    const geo = balloonGeo();
    const mat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.12, sheen: 0.2 });
    this.body = new THREE.InstancedMesh(geo, mat, MAXB);
    this.rainbow = new THREE.InstancedMesh(geo, new THREE.MeshPhysicalMaterial({ map: rainbowTex(), roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.12 }), 300);
    const knotG = new THREE.ConeGeometry(0.16, 0.22, 8); knotG.rotateX(Math.PI);
    this.knot = new THREE.InstancedMesh(knotG, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 }), MAXB + 300);
    const strG = new THREE.CylinderGeometry(0.018, 0.018, 1, 4); strG.translate(0, -0.5, 0);
    this.string = new THREE.InstancedMesh(strG, new THREE.MeshBasicMaterial({ color: '#f5f0e6' }), MAXB + 300);
    this.ice = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.25, 1), new THREE.MeshPhysicalMaterial({ color: '#cff1ff', roughness: 0.05, transparent: true, opacity: 0.45, clearcoat: 1, flatShading: true, depthWrite: false }), 600);
    for (const m of [this.body, this.rainbow, this.knot, this.string, this.ice]) { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.count = 0; scene.add(m); }
    for (const m of [this.body, this.knot]) { for (let i = 0; i < m.instanceMatrix.count; i++) m.setColorAt(i, WHITE); }
    this.body.castShadow = true; this.rainbow.castShadow = true;
    this.giants = new Map();
  }
  // draw all live balloons (list of game balloons with x, z, y, def, hitT, frozenT, slowT)
  update(list, t) {
    let nb = 0, nr = 0, nk = 0, ni = 0;
    const seen = new Set();
    for (const b of list) {
      if (!b.alive) continue;
      const d = b.def, s = d.size * (1 + Math.max(0, b.hitT) * 0.9) * (b.spawnT < 0.3 ? b.spawnT / 0.3 : 1);
      if (d.boss) { seen.add(b.id); this.giant(b, t); continue; }
      const bob = Math.sin(t * 3 + b.id) * 0.12, y = 1.7 + bob + d.size * 0.4;
      const sway = Math.sin(t * 2 + b.id * 1.7) * 0.12;
      _q.setFromEuler(_e.set(sway, b.id * 0.7, sway * 0.6));
      _p.set(b.x, y, b.z); _s.set(s, s * (1 - b.hitT * 0.6), s);
      _m.compose(_p, _q, _s);
      if (d.color === 'rainbow') this.rainbow.setMatrixAt(nr++, _m);
      else {
        this.body.setMatrixAt(nb, _m);
        _c.set(d.color); if (d.metal) _c.offsetHSL(0, 0, Math.sin(t * 3 + b.id) * 0.05); if (b.frozenT > 0) _c.lerp(ICE, 0.55); else if (b.slowT > 0) _c.lerp(ICE, 0.25);
        if (b.hitT > 0) _c.lerp(WHITE, b.hitT * 1.5);
        this.body.setColorAt(nb++, _c);
      }
      // knot and string
      _p.set(b.x, y - 1.15 * s, b.z); _s.setScalar(s); _m.compose(_p, _q, _s); this.knot.setMatrixAt(nk, _m);
      _c.set(d.color === 'rainbow' ? '#9b5de5' : d.color); this.knot.setColorAt(nk, _c);
      _p.set(b.x, y - 1.25 * s, b.z); _s.set(1, 1.0 + d.size * 0.4, 1); _m.compose(_p, _q.setFromEuler(_e.set(sway * 2, 0, Math.sin(t * 4 + b.id) * 0.25)), _s); this.string.setMatrixAt(nk++, _m);
      if (b.frozenT > 0 && ni < 600) { _p.set(b.x, y, b.z); _s.setScalar(s * 1.05); _m.compose(_p, _q.setFromEuler(_e.set(0, b.id, 0)), _s); this.ice.setMatrixAt(ni++, _m); }
    }
    this.body.count = nb; this.rainbow.count = nr; this.knot.count = nk; this.string.count = nk; this.ice.count = ni;
    for (const m of [this.body, this.rainbow, this.knot, this.string, this.ice]) m.instanceMatrix.needsUpdate = true;
    if (this.body.instanceColor) this.body.instanceColor.needsUpdate = true;
    if (this.knot.instanceColor) this.knot.instanceColor.needsUpdate = true;
    for (const [id, g] of this.giants) if (!seen.has(id)) { g.root.removeFromParent(); this.giants.delete(id); }
  }
  giant(b, t) {
    let g = this.giants.get(b.id);
    if (!g) {
      const root = new THREE.Group();
      const def = b.def, base = def.color;
      const mat = new THREE.MeshPhysicalMaterial({ color: base, roughness: 0.25, clearcoat: 1, map: canvasTex(128, 128, (gg, w, h) => {
        gg.fillStyle = base; gg.fillRect(0, 0, w, h);
        if (def.look === 'stripes') { gg.fillStyle = '#ffd23f'; for (let i = 0; i < 6; i++) gg.fillRect(0, i * 22 + 4, w, 9); }
        else if (def.look === 'bands') { gg.fillStyle = '#7df9ff'; for (let i = 0; i < 4; i++) gg.fillRect(0, i * 32 + 10, w, 6); gg.fillStyle = '#16504e'; for (let i = 0; i < 4; i++) gg.fillRect(0, i * 32 + 18, w, 4); }
        else { gg.fillStyle = def.look === 'crown' ? '#fff3b0' : '#ffd23f'; for (let i = 0; i < 8; i++) { gg.beginPath(); const x = (i % 4) * 32 + 16, y = Math.floor(i / 4) * 64 + 32; for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2 - Math.PI / 2, r = k % 2 ? 5 : 12; gg.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } gg.fill(); } }
      }) });
      if (def.look === 'crown') {
        const cr = new THREE.Group(); cr.position.y = 1.05; root.add(cr);
        const gm = new THREE.MeshStandardMaterial({ color: '#ffd23f', metalness: 0.7, roughness: 0.25, emissive: '#6a4a00', emissiveIntensity: 0.4 });
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.22, 12, 1, true), gm); cr.add(ring);
        for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, sp = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.24, 6), gm); sp.position.set(Math.cos(a) * 0.44, 0.2, Math.sin(a) * 0.44); cr.add(sp); }
        ['#ff4d6d', '#3a86ff', '#5bd16b', '#c77dff'].forEach((c, i) => { const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.06), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.8 })); const a = i / 4 * Math.PI * 2 + 0.4; gem.position.set(Math.cos(a) * 0.46, 0.02, Math.sin(a) * 0.46); cr.add(gem); });
        const cape = new THREE.Mesh(new THREE.SphereGeometry(1.02, 20, 12, Math.PI * 0.65, Math.PI * 0.7, Math.PI * 0.3, Math.PI * 0.5), new THREE.MeshStandardMaterial({ color: '#c1121f', side: THREE.DoubleSide, roughness: 0.6 })); root.add(cape);
      }
      const body = new THREE.Mesh(balloonGeo(), mat); root.add(body);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.98, 0.06, 8, 40), new THREE.MeshStandardMaterial({ color: '#ffd23f', metalness: 0.5, roughness: 0.3 })); band.rotation.x = Math.PI / 2; root.add(band);
      for (let i = 0; i < 3; i++) { const k = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.16, 8), new THREE.MeshStandardMaterial({ color: '#5b4b8a' })); k.rotation.x = Math.PI; k.position.set((i - 1) * 0.25, -1.2, 0); root.add(k); }
      // angry little face so it reads as a boss
      for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' })); e.position.set(0.28 * s, 0.3, 0.86); e.scale.z = 0.4; root.add(e); const p = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: '#14101c' })); p.position.set(0.28 * s, 0.28, 0.92); root.add(p); const br = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: '#14101c' })); br.position.set(0.28 * s, 0.48, 0.9); br.rotation.z = 0.35 * s; root.add(br); }
      const hpBack = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.22), new THREE.MeshBasicMaterial({ color: '#2a1546', depthTest: false, transparent: true }));
      const hpFill = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.14), new THREE.MeshBasicMaterial({ color: '#ff4d6d', depthTest: false, transparent: true }));
      hpBack.renderOrder = 10; hpFill.renderOrder = 11;
      const bar = new THREE.Group(); bar.add(hpBack); bar.add(hpFill); hpFill.position.z = 0.01;
      this.scene.add(root); this.scene.add(bar); root.add(new THREE.Object3D());
      root.traverse(o => { if (o.isMesh) o.castShadow = true; });
      g = { root, body, bar, hpFill };
      this.giants.set(b.id, g);
      const rm = root.removeFromParent.bind(root); root.removeFromParent = () => { rm(); bar.removeFromParent(); return root; };
    }
    const s = b.def.size * (1 + Math.max(0, b.hitT) * 0.25);
    g.root.position.set(b.x, 2.6 + b.def.size * 0.6 + Math.sin(t * 1.5) * 0.2, b.z);
    g.root.scale.set(s, s, s);
    g.root.rotation.y = b.heading || 0;
    g.root.rotation.z = Math.sin(t * 1.2 + b.id) * 0.06;
    g.body.material.emissive.set(b.hitT > 0 ? '#ffffff' : '#000000'); g.body.material.emissiveIntensity = b.hitT * 2;
    const k = Math.max(0, b.hp / b.maxHp);
    g.bar.position.set(b.x, g.root.position.y + b.def.size * 1.35 + 0.6, b.z);
    g.bar.quaternion.copy(this.camQ || g.bar.quaternion);
    g.hpFill.scale.x = Math.max(0.001, k); g.hpFill.position.x = -1.15 * (1 - k);
  }
  clear() { for (const g of this.giants.values()) g.root.removeFromParent(); this.giants.clear(); for (const m of [this.body, this.rainbow, this.knot, this.string, this.ice]) m.count = 0; }
  dispose() { this.clear(); for (const m of [this.body, this.rainbow, this.knot, this.string, this.ice]) m.removeFromParent(); }
}
export { BALLOONS };
