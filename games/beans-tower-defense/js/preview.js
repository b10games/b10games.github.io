// The Bean Book "video": a little live field where one bean, at the level you picked, pops a stream of
// balloons. It runs the real game rules (the same Game class), so every upgrade shows exactly what it does.
import { THREE, canvasTex } from './engine.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Path } from './map.js';
import { FX } from './fx.js';
import { Game } from './game.js';
import { BalloonView } from './balloons.js';
import { BEAN, DIFFS, beanStats, skinFor } from './data.js';

const ROAD = [[-24, 7], [-12, 6], [-5, 1.2], [5, 1.2], [12, 6], [24, 7]];
const MIX = [
  ['red', 'blue', 'red', 'green', 'blue'],
  ['blue', 'green', 'yellow', 'green', 'purple'],
  ['green', 'yellow', 'purple', 'yellow', 'rainbow'],
  ['yellow', 'purple', 'rainbow', 'purple', 'steel']
];

export class BeanPreview {
  constructor(canvas) {
    this.canvas = canvas;
    const r = this.r = new THREE.WebGLRenderer({ canvas, antialias: true });
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.env = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture;
    this.camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.5, 300);
    this.active = false; this.acc = 0; this.t = 0;
  }
  // build a fresh little field with the bean at level lvl (0 = just bought, 10 = fully upgraded)
  show(id, lvl) {
    this.clear();
    this.id = id; this.lvl = lvl; this.t = 0; this.acc = 0; this.spawnT = 0.4; this.bossT = 6; this.i = 0;
    const def = BEAN[id];
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color('#bfe6ff'); scene.fog = new THREE.Fog('#d4efff', 55, 120);
    scene.environment = this.env; scene.environmentIntensity = 0.38;
    scene.add(new THREE.HemisphereLight('#e8f6ff', '#5a8a3c', 1.25));
    const sun = new THREE.DirectionalLight('#fff4dc', 2.6); sun.position.set(18, 40, 16); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 100 }); sun.shadow.bias = -0.0005;
    scene.add(sun);
    this.decorate(scene);
    const path = new Path(ROAD.map(([x, z]) => [x, z]));
    const map = { def: { id: 'preview', theme: 'valley' }, scene, path, anim: [], heightAt: () => 0, canPlace: () => true, distAt: () => 5 };
    const fx = this.fx = new FX(scene); fx.initLights(2);
    const view = new BalloonView(scene); view.camQ = this.camera.quaternion;
    const g = this.g = new Game({ map, diff: DIFFS.medium, rounds: 40, fx, audio: null, view });
    g.lives = 1e9;
    const put = (bid, x, z, L) => {
      const t = g.place(bid, x, z, false, true);
      t.lvl = L; t.stats = beanStats(BEAN[bid], L);
      const sk = skinFor(L); if (L > 0) t.model.setSkin(sk, BEAN[bid].skins[sk - 1]);
      t.facing = 0; t.model.root.rotation.y = 0;
      return t;
    };
    this.t0 = put(id, 0, -3.2, lvl);
    // a Drummer needs friends to make faster
    if (def.kind === 'support') { put('dart', -3.4, -2.4, 2); put('dart', 3.4, -2.4, 2); }
    // the range on the ground
    const r = Math.min(30, this.t0.stats.range || 0);
    if (r > 0 && r < 100) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.08, r, 96), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(0, 0.06, -3.2); scene.add(ring);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 96), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.1, depthWrite: false }));
      disc.rotation.x = -Math.PI / 2; disc.position.set(0, 0.05, -3.2); scene.add(disc);
    }
    // camera: close for short range beans, a bit further back for long range ones
    const far = Math.min(1, Math.max(0, ((this.t0.stats.range || 8) - 8) / 14));
    this.camera.position.set(0, 15 + far * 6, 17 + far * 8); this.camera.lookAt(0, 0, 0.5);
    this.active = true;
  }
  decorate(scene) {
    if (!this.groundTex) this.groundTex = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#74c050'; g.fillRect(0, 0, w, h); for (let i = 0; i < 900; i++) { g.fillStyle = ['#69b84b', '#8fd067', '#7cc458', '#5fa848'][i % 4]; g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 3, 2 + Math.random() * 3); } });
    this.groundTex.wrapS = this.groundTex.wrapT = THREE.RepeatWrapping; this.groundTex.repeat.set(10, 7);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(140, 100), new THREE.MeshStandardMaterial({ map: this.groundTex, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    // the road: a ribbon along the path
    const curve = new THREE.CatmullRomCurve3(ROAD.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
    const pts = curve.getSpacedPoints(120), pos = [], idx = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
      pos.push(pts[i].x + nx * 1.7, 0.03, pts[i].z + nz * 1.7, pts[i].x - nx * 1.7, 0.03, pts[i].z - nz * 1.7);
      if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
    }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); rg.setIndex(idx); rg.computeVertexNormals();
    const road = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ color: '#e2c08a', roughness: 0.95, side: THREE.DoubleSide })); road.receiveShadow = true; scene.add(road);
    const edge = new THREE.Mesh(new THREE.TubeGeometry(curve, 120, 0.12, 5), new THREE.MeshStandardMaterial({ color: '#b88a52' })); edge.scale.set(1, 0.4, 1); scene.add(edge);
    // trees and flowers around
    const treeG = new THREE.IcosahedronGeometry(1.4, 1), trunkG = new THREE.CylinderGeometry(0.2, 0.3, 1.6, 7), trunkM = new THREE.MeshStandardMaterial({ color: '#8d5524' });
    const spots = [[-15, -8], [-9, -13], [12, -10], [17, -5], [-20, -2], [21, 1], [-3, -14], [7, -15], [-24, 14], [24, 15]];
    spots.forEach(([x, z], i) => {
      const tr = new THREE.Mesh(trunkG, trunkM); tr.position.set(x, 0.8, z); tr.castShadow = true; scene.add(tr);
      const top = new THREE.Mesh(treeG, new THREE.MeshStandardMaterial({ color: ['#4caf50', '#3f9d4a', '#7bd389'][i % 3], flatShading: true, roughness: 0.8 }));
      top.position.set(x, 2.6, z); top.scale.setScalar(0.8 + (i % 3) * 0.2); top.castShadow = true; scene.add(top);
    });
    const fg = new THREE.SphereGeometry(0.16, 8, 6);
    for (let i = 0; i < 60; i++) {
      const x = (Math.random() - 0.5) * 50, z = -4 - Math.random() * 14 + (Math.random() < 0.4 ? 22 : 0);
      if (Math.abs(z - 3) < 4.5) continue;
      const f = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ color: ['#ff6fb5', '#ffd23f', '#ffffff', '#c77dff'][i % 4] })); f.position.set(x, 0.18, z); scene.add(f);
    }
  }
  // one frame: run the game, keep the balloons coming, draw
  frame(dt) {
    if (!this.active || !this.g) return;
    const c = this.canvas, w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    if (c.width !== Math.round(w * this.r.getPixelRatio()) || c.height !== Math.round(h * this.r.getPixelRatio())) { this.r.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
    const g = this.g, mix = MIX[Math.min(3, Math.floor(this.lvl / 3))];
    this.t += dt; this.acc += dt;
    while (this.acc >= 1 / 60) {
      this.acc -= 1 / 60;
      this.spawnT -= 1 / 60;
      if (this.spawnT <= 0) { g.spawn(mix[this.i++ % mix.length], 0); this.spawnT = this.lvl >= 6 ? 0.42 : 0.55; }
      if (this.lvl >= 8) { this.bossT -= 1 / 60; if (this.bossT <= 0) { g.spawn('boss1', 0); this.bossT = 14; } }
      g.update(1 / 60);
      g.lives = 1e9;
    }
    g.visuals(dt, this.t);
    this.fx.update(dt);
    this.r.render(this.scene, this.camera);
  }
  get popped() { return this.g ? this.g.stats.popped : 0; }
  clear() {
    this.active = false;
    if (this.g) { this.g.dispose(); this.g = null; }
    if (this.fx) { this.fx.dispose(); this.fx = null; }
    this.scene = null;
  }
  stop() { this.clear(); }
}
