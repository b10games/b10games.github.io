// Bean figures for Beans Tower Defense: the round body with arms, legs and a face (shared style with the other bean
// games), the five tower costumes, lobby hats and faces, upgrade gear and dance moves. Everything is built from
// simple shapes, so nothing has to be downloaded.
import { THREE, canvasTex, damp, clamp } from './engine.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
function mesh(geo, mat, x = 0, y = 0, z = 0, parent) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; if (parent) parent.add(m); return m; }
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: o.rough ?? 0.45, metalness: o.metal ?? 0, emissive: new THREE.Color(o.emissive || '#000000'), emissiveIntensity: o.ei ?? 1, transparent: !!o.opacity, opacity: o.opacity ?? 1, flatShading: !!o.flat, side: o.double ? THREE.DoubleSide : THREE.FrontSide });
const WHITE = std('#ffffff', { rough: 0.2 }), BLACK = std('#14101c', { rough: 0.25 }), IRIS = std('#1f130d', { rough: 0.1 }), SHINE = new THREE.MeshBasicMaterial({ color: 0xffffff });
const CHEEK = new THREE.MeshBasicMaterial({ color: 0xff6f9a, transparent: true, opacity: 0.45, depthWrite: false });
const BODY = new THREE.CapsuleGeometry(0.45, 0.4, 8, 22), LIMB = new THREE.CapsuleGeometry(0.11, 0.22, 4, 8), LEG = new THREE.CapsuleGeometry(0.13, 0.1, 4, 8);
const EYE = new THREE.SphereGeometry(0.13, 16, 12), IRIS_G = new THREE.SphereGeometry(0.095, 14, 10), DOT = new THREE.SphereGeometry(1, 8, 6);
const SHOE = new THREE.SphereGeometry(0.15, 12, 8), HAND = new THREE.SphereGeometry(0.12, 10, 8);
const OUTLINE = new THREE.MeshBasicMaterial({ color: 0x1b1036, side: THREE.BackSide });

// ---------- the bean ----------
export class Bean {
  // costume: hero id or 'plain'/'boss'; colors [c1, c2]
  constructor(costume, colors, opts = {}) {
    this.costume = costume; this.c1 = colors[0]; this.c2 = colors[1];
    this.root = new THREE.Group(); this.pivot = new THREE.Group(); this.pivot.position.y = 0.72; this.root.add(this.pivot);
    this.bodyMat = new THREE.MeshPhysicalMaterial({ color: this.c1, roughness: 0.34, clearcoat: 0.55, clearcoatRoughness: 0.3, sheen: 0.35, sheenColor: new THREE.Color('#ffffff') });
    this.accMat = std(this.c2, { rough: 0.4 }); this.limbMat = std(shade(this.c1, -0.08), { rough: 0.4 });
    this.body = mesh(BODY, this.bodyMat, 0, 0.05, 0, this.pivot);
    // a thin dark outline makes the beans pop on the busy map
    const outline = new THREE.Mesh(BODY, OUTLINE); outline.scale.setScalar(1.045); outline.castShadow = false; this.body.add(outline);
    // face
    this.face = new THREE.Group(); this.pivot.add(this.face);
    this.eyes = [];
    for (const s of [-1, 1]) {
      const g = new THREE.Group(); g.position.set(0.155 * s, 0.2, 0.39); g.rotation.set(-0.08, 0.36 * s, 0);
      const w = mesh(EYE, WHITE, 0, 0, 0, g); w.scale.set(1, 1.15, 0.42); w.castShadow = false;
      const ir = mesh(IRIS_G, IRIS, 0, -0.012, 0.03, g); ir.scale.set(1, 1.1, 0.36); ir.castShadow = false;
      const sh = mesh(DOT, SHINE, -0.034, 0.045, 0.068, g); sh.scale.set(0.034, 0.038, 0.012); sh.castShadow = false;
      const sh2 = mesh(DOT, SHINE, 0.034, -0.04, 0.066, g); sh2.scale.set(0.017, 0.017, 0.01); sh2.castShadow = false;
      this.face.add(g); this.eyes.push(g);
      const ch = mesh(DOT, CHEEK, 0.27 * s, 0.02, 0.37, this.face); ch.scale.set(0.075, 0.045, 0.02); ch.rotation.y = 0.7 * s; ch.castShadow = false;
    }
    this.mouth = mesh(new THREE.TorusGeometry(0.045, 0.016, 8, 14, Math.PI), BLACK, 0, -0.01, 0.44, this.face); this.mouth.rotation.z = Math.PI; this.mouth.castShadow = false;
    // limbs
    this.arms = [-1, 1].map(s => { const a = new THREE.Group(); a.position.set(0.46 * s, 0.08, 0); const m = mesh(LIMB, this.limbMat, 0, -0.2, 0, a); a.userData.m = m; this.pivot.add(a); return a; });
    this.legs = [-1, 1].map(s => { const l = new THREE.Group(); l.position.set(0.19 * s, -0.4, 0); mesh(LEG, this.limbMat, 0, -0.14, 0, l); const shoe = mesh(SHOE, this.accMat, 0, -0.26, 0.05, l); shoe.scale.set(1, 0.7, 1.35); this.pivot.add(l); return l; });
    this.hands = this.arms.map(a => { const hnd = mesh(HAND, this.limbMat, 0, -0.38, 0, a); hnd.castShadow = false; return hnd; });
    this.hand = new THREE.Group(); this.hand.position.set(0, -0.36, 0.05); this.arms[1].add(this.hand);       // right hand (weapon)
    this.offHand = new THREE.Group(); this.offHand.position.set(0, -0.36, 0.05); this.arms[0].add(this.offHand); // left hand
    this.top = new THREE.Group(); this.top.position.y = 0.68; this.pivot.add(this.top);
    this.back = new THREE.Group(); this.back.position.set(0, 0.05, -0.4); this.pivot.add(this.back);
    this.extra = [];
    (COSTUMES[costume] || (() => {}))(this);
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.55, 20), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.25, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = 0.04; this.root.add(this.shadow);
    this.t = Math.random() * 10; this.phase = 0; this.blinkT = 2; this.sq = 1; this.sqV = 0; this.lean = 0; this.deadT = 0; this.spin = 0;
    if (opts.scale) this.root.scale.setScalar(opts.scale);
  }
  setColors(c1, c2) { this.c1 = c1; this.c2 = c2; this.bodyMat.color.set(c1); this.accMat.color.set(c2); this.limbMat.color.copy(shade(c1, -0.08)); }
  hit() { this.sqV = -5; }
  // st: speed (0..), attack (0..1 progress or -1), cast (0..1 or -1), dead, dance, stun, air
  update(dt, st) {
    this.t += dt;
    const P = this.pivot, run = clamp((st.speed || 0) / 7, 0, 1.2);
    this.sqV += (1 - this.sq) * 200 * dt; this.sqV *= Math.exp(-11 * dt); this.sq += this.sqV * dt;
    const sq = clamp(this.sq, 0.7, 1.3); P.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    let armL = 0, armR = 0, armZ = 0.15, legL = 0, legR = 0, bob = 0, leanT = 0, rotY = 0;
    if (st.dead) {
      this.deadT += dt;
      const k = clamp(this.deadT / 0.5, 0, 1);
      P.rotation.set(-k * 1.45, 0, k * 0.4); P.position.y = 0.72 - k * 0.45;
      armL = armR = -0.3; armZ = 1.2; legL = 0.6; legR = -0.2;
      this.eyes.forEach(e => { e.scale.y = 0.15; });
      this.applyLimbs(dt, armL, armR, armZ, legL, legR, 30);
      return;
    }
    this.deadT = 0;
    if (st.stun) { this.spin += dt * 9; rotY = Math.sin(this.spin) * 0.5; armZ = 1.1 + Math.sin(this.t * 20) * 0.3; legL = Math.sin(this.t * 16) * 0.6; legR = -legL; bob = Math.abs(Math.sin(this.t * 9)) * 0.08; }
    else if (run > 0.05) {
      this.phase += dt * (5 + (st.speed || 0) * 1.45);
      const s = Math.sin(this.phase);
      legL = s * 0.95 * run; legR = -legL; armL = -s * 0.9 * run; armR = s * 0.9 * run;
      bob = Math.abs(Math.cos(this.phase)) * 0.09 * run; leanT = 0.18 * run;
    } else { bob = Math.sin(this.t * 2.4) * 0.018; armZ = 0.13 + Math.sin(this.t * 2.4) * 0.05; rotY = Math.sin(this.t * 1.3) * 0.08; }
    if (st.attack >= 0 && st.attack !== undefined && !st.stun) {
      const a = st.attack;    // 0 = start of swing, 1 = end
      if (st.melee) { armR = a < 0.45 ? -2.6 * (a / 0.45) : -2.6 + 3.4 * ((a - 0.45) / 0.55); armZ = 0.25; leanT = 0.25 * Math.sin(a * Math.PI); rotY = (a < 0.45 ? -0.5 : 0.5) * Math.sin(a * Math.PI); }
      else { armR = -1.5; armL = -0.4; leanT = -0.12 * Math.sin(a * Math.PI); }
    }
    if (st.cast >= 0 && st.cast !== undefined && !st.stun) { const c = Math.sin(clamp(st.cast, 0, 1) * Math.PI); armL = armR = -2.6 * c - 0.2; armZ = 0.5 * c + 0.15; bob += 0.12 * c; }
    if (st.dance) { const d = this.t * 7; bob = Math.abs(Math.sin(d)) * 0.3; armL = -2.4 + Math.sin(d) * 0.7; armR = -2.4 - Math.sin(d) * 0.7; armZ = 0.6; legL = Math.sin(d) * 0.5; legR = -legL; rotY = Math.sin(d * 0.5) * 0.9; }
    if (st.air) { legL = -0.6; legR = 0.3; armL = armR = -2.2; armZ = 0.6; }
    this.lean = damp(this.lean, leanT, 10, dt);
    P.rotation.set(this.lean, st.spin >= 0 && st.spin !== undefined ? st.spin * Math.PI * 2 : damp(P.rotation.y, rotY, 10, dt), 0);
    if (st.spin >= 0 && st.spin !== undefined) { armL = armR = -1.4; armZ = 1.2; }
    P.position.y = 0.72 + bob;
    this.applyLimbs(dt, armL, armR, armZ, legL, legR, 18);
    // blink + look
    this.blinkT -= dt; const blink = this.blinkT < 0.12 ? 0.1 : 1; if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 3;
    this.eyes.forEach(e => { e.scale.y = st.stun ? 0.3 : blink; });
    this.mouth.rotation.z = st.stun || st.hurt ? 0 : Math.PI;
    for (const f of this.extra) f(dt, this.t, st);
  }
  applyLimbs(dt, armL, armR, armZ, legL, legR, k) {
    const a = this.arms, l = this.legs;
    a[0].rotation.x = damp(a[0].rotation.x, armL, k, dt); a[1].rotation.x = damp(a[1].rotation.x, armR, k, dt);
    a[0].rotation.z = damp(a[0].rotation.z, -armZ, k, dt); a[1].rotation.z = damp(a[1].rotation.z, armZ, k, dt);
    l[0].rotation.x = damp(l[0].rotation.x, legL, k, dt); l[1].rotation.x = damp(l[1].rotation.x, legR, k, dt);
  }
  dispose() { this.root.removeFromParent(); this.root.traverse(o => { if (o.isMesh && o.geometry && !o.geometry.userData.shared) { /* shared geometries stay */ } }); }
}
[BODY, LIMB, LEG, EYE, IRIS_G, DOT, SHOE, HAND].forEach(g => { g.userData.shared = true; });

function shade(hex, k) { const c = new THREE.Color(hex), h = {}; c.getHSL(h); c.setHSL(h.h, h.s, clamp(h.l + k, 0, 1)); return c; }

// ---------- materials for costumes ----------
const metal = () => std('#d5dbe3', { metal: 0.7, rough: 0.22 });
const darkMetal = () => std('#495057', { metal: 0.6, rough: 0.35 });
const gold = () => std('#ffd23f', { metal: 0.65, rough: 0.28, emissive: '#5a3d00', ei: 0.4 });
const glowM = (c, ei = 2) => std(c, { emissive: c, ei });
const wood = () => std('#8d5524', { rough: 0.7 });
const cloth = (c) => std(c, { rough: 0.75 });


// ---------- tower costumes (the five beans you can buy) ----------
const COSTUMES = {
  dart(b) {
    // headband with flying tails
    const band = mesh(new THREE.TorusGeometry(0.47, 0.06, 8, 30), b.accMat, 0, 0.42, 0, b.pivot); band.rotation.x = Math.PI / 2; band.scale.set(1, 1, 1);
    const knot = new THREE.Group(); knot.position.set(0, 0.42, -0.45); b.pivot.add(knot);
    const tails = [-1, 1].map(s => { const t = mesh(new THREE.BoxGeometry(0.08, 0.32, 0.03), b.accMat, 0.06 * s, -0.14, -0.02, knot); t.rotation.z = 0.35 * s; return t; });
    b.extra.push((dt, t) => { tails.forEach((x, i) => { x.rotation.x = -0.4 + Math.sin(t * 6 + i) * 0.25; }); });
    // quiver with darts on the back
    const q = mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.55, 12), wood(), 0.12, 0.05, -0.02, b.back); q.rotation.z = -0.35;
    ['#ff4d6d', '#ffd23f', '#7bd389'].forEach((c, i) => { const f = mesh(new THREE.ConeGeometry(0.06, 0.14, 4), std(c), 0.02 + i * 0.05, 0.36, 0, q); f.rotation.z = (i - 1) * 0.2; });
    // a dart in the hand, pointing forward
    const dart = new THREE.Group(); b.hand.add(dart); b.hand.rotation.x = Math.PI / 2;
    mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.45, 6), std('#e9ecef', { metal: 0.4 }), 0, 0.15, 0.05, dart);
    mesh(new THREE.ConeGeometry(0.045, 0.14, 6), metal(), 0, 0.43, 0.05, dart);
    for (const s of [-1, 1]) { const fin = mesh(new THREE.BoxGeometry(0.12, 0.1, 0.01), std('#3a86ff'), 0.03 * s, -0.06, 0.05, dart); fin.rotation.z = 0.3 * s; }
    b.weapon = dart;
  },
  sniper(b) {
    // floppy bucket hat with leaves
    const hat = new THREE.Group(); hat.position.y = -0.1; b.top.add(hat);
    mesh(new THREE.CylinderGeometry(0.62, 0.66, 0.05, 28), cloth('#4f772d'), 0, 0, 0, hat);
    mesh(new THREE.CylinderGeometry(0.4, 0.47, 0.32, 24), cloth('#4f772d'), 0, 0.16, 0, hat);
    for (let i = 0; i < 4; i++) { const lf = mesh(new THREE.SphereGeometry(0.12, 8, 6), std(i % 2 ? '#90be6d' : '#386641'), Math.cos(i * 1.6) * 0.42, 0.22, Math.sin(i * 1.6) * 0.42, hat); lf.scale.set(1.4, 0.35, 0.6); lf.rotation.y = i; }
    // scope over the right eye
    const sc = mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.12, 14), BLACK, 0.155, 0.2, 0.46, b.pivot); sc.rotation.x = Math.PI / 2; sc.castShadow = false;
    const lens = mesh(new THREE.CircleGeometry(0.07, 14), glowM('#7df9ff', 1.2), 0.155, 0.2, 0.525, b.pivot); lens.castShadow = false;
    // long pea-shooter rifle held forward
    const gun = new THREE.Group(); b.hand.add(gun); b.hand.rotation.x = Math.PI / 2;
    mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.25, 10), std('#386641', { rough: 0.5 }), 0, 0.35, 0.08, gun);
    mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.08, 10), darkMetal(), 0, 0.98, 0.08, gun);
    const scope = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.36, 10), darkMetal(), 0, 0.45, 0.2, gun); void scope;
    mesh(new THREE.BoxGeometry(0.12, 0.28, 0.14), wood(), 0, -0.25, 0.04, gun);
    b.weapon = gun; b.muzzle = new THREE.Object3D(); b.muzzle.position.set(0, 1.05, 0.08); gun.add(b.muzzle);
  },
  boomerang(b) {
    // safari hat and a neckerchief
    const hat = new THREE.Group(); hat.position.y = -0.12; b.top.add(hat);
    mesh(new THREE.CylinderGeometry(0.7, 0.72, 0.05, 30), cloth('#d4a373'), 0, 0, 0, hat);
    const dome = mesh(new THREE.SphereGeometry(0.44, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), cloth('#e9c46a'), 0, 0.02, 0, hat); dome.scale.y = 0.85;
    mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.08, 24), cloth('#8d5524'), 0, 0.06, 0, hat);
    const scarf = mesh(new THREE.TorusGeometry(0.4, 0.07, 8, 24), b.accMat, 0, -0.12, 0.03, b.pivot); scarf.rotation.x = Math.PI / 2 + 0.15;
    mesh(new THREE.ConeGeometry(0.14, 0.26, 4), b.accMat, 0, -0.27, 0.4, b.pivot).rotation.x = Math.PI;
    // the boomerang
    const boom = new THREE.Group(); b.hand.add(boom); b.hand.rotation.x = Math.PI / 2;
    for (const s of [-1, 1]) { const arm = mesh(new THREE.BoxGeometry(0.1, 0.42, 0.04), std('#ffb703', { rough: 0.5 }), 0.1 * s, 0.25, 0.05, boom); arm.rotation.z = 0.55 * s; }
    mesh(new THREE.SphereGeometry(0.06, 8, 6), std('#ff8c42'), 0, 0.08, 0.05, boom);
    b.weapon = boom;
  },
  bomb(b) {
    // goggles pushed up on the forehead
    const strap = mesh(new THREE.TorusGeometry(0.47, 0.035, 6, 28), BLACK, 0, 0.47, 0, b.pivot); strap.rotation.x = Math.PI / 2;
    for (const s of [-1, 1]) { const g = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.08, 14), darkMetal(), 0.13 * s, 0.5, 0.42, b.pivot); g.rotation.x = Math.PI / 2 - 0.3; const l = mesh(new THREE.CircleGeometry(0.075, 14), glowM('#ff8c42', 0.7), 0.13 * s, 0.512, 0.465, b.pivot); l.rotation.x = -0.3; l.castShadow = false; }
    // bandolier of little bombs
    const sash = mesh(new THREE.TorusGeometry(0.47, 0.05, 6, 30), cloth('#6f4518'), 0, -0.1, 0, b.pivot); sash.rotation.set(Math.PI / 2, 0.55, 0);
    for (let i = 0; i < 3; i++) { const a = -0.6 + i * 0.6; mesh(new THREE.SphereGeometry(0.075, 10, 8), std('#2b2d42'), Math.sin(a) * 0.44, -0.1 + Math.sin(a) * 0.22, Math.cos(a) * 0.44, b.pivot); }
    // the bomb in the hand, fuse sparkling
    const bomb = new THREE.Group(); b.hand.add(bomb); b.hand.rotation.x = 0.6;
    mesh(new THREE.SphereGeometry(0.2, 16, 12), std('#2b2d42', { rough: 0.3 }), 0, -0.05, 0.12, bomb);
    mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 8), darkMetal(), 0, 0.15, 0.12, bomb);
    const spark = mesh(new THREE.OctahedronGeometry(0.06), glowM('#ffd23f', 3), 0, 0.26, 0.12, bomb); spark.castShadow = false;
    b.extra.push((dt, t) => { spark.scale.setScalar(0.7 + Math.random() * 0.8); spark.rotation.y = t * 9; });
    b.weapon = bomb;
  },
  freeze(b) {
    // woolly beanie with a pompom and a scarf
    const hat = new THREE.Group(); hat.position.y = -0.2; b.top.add(hat);
    const dome = mesh(new THREE.SphereGeometry(0.49, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), cloth('#5e60ce'), 0, 0, 0, hat); dome.scale.y = 0.95;
    mesh(new THREE.TorusGeometry(0.47, 0.07, 8, 28), cloth('#f1f3f5'), 0, 0.02, 0, hat).rotation.x = Math.PI / 2;
    mesh(new THREE.SphereGeometry(0.14, 12, 10), cloth('#f1f3f5'), 0, 0.5, 0, hat);
    const scarf = mesh(new THREE.TorusGeometry(0.41, 0.08, 8, 24), cloth('#ff6b9a'), 0, -0.13, 0.03, b.pivot); scarf.rotation.x = Math.PI / 2 + 0.12;
    const tail = mesh(new THREE.BoxGeometry(0.14, 0.36, 0.05), cloth('#ff6b9a'), 0.2, -0.3, 0.38, b.pivot); tail.rotation.z = 0.2;
    // ice wand with a floating crystal
    const wand = new THREE.Group(); b.hand.add(wand); b.hand.rotation.x = 0.35;
    mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.7, 6), std('#e9ecef', { metal: 0.3 }), 0, 0.2, 0.05, wand);
    const crystal = mesh(new THREE.OctahedronGeometry(0.13), new THREE.MeshPhysicalMaterial({ color: '#bfe8ff', emissive: '#4cc9f0', emissiveIntensity: 0.9, roughness: 0.05, clearcoat: 1 }), 0, 0.66, 0.05, wand);
    crystal.scale.y = 1.6;
    b.extra.push((dt, t) => { crystal.rotation.y = t * 2; crystal.position.y = 0.66 + Math.sin(t * 3) * 0.03; });
    b.weapon = wand; b.muzzle = new THREE.Object3D(); b.muzzle.position.set(0, 0.66, 0.05); wand.add(b.muzzle);
  },
  ninja(b) {
    // hood, mask over the mouth and a red headband with long tails
    const hood = mesh(new THREE.SphereGeometry(0.5, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.42), cloth('#1b1b2f'), 0, 0.22, 0, b.pivot); hood.scale.set(1.04, 1.05, 1.04);
    const mask = mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.2, 24, 1, true, -Math.PI * 0.45, Math.PI * 0.9), cloth('#1b1b2f'), 0, -0.02, 0, b.pivot); mask.material.side = THREE.DoubleSide;
    b.mouth.visible = false;
    const band = mesh(new THREE.TorusGeometry(0.49, 0.045, 8, 30), b.accMat, 0, 0.34, 0, b.pivot); band.rotation.x = Math.PI / 2;
    const knot = new THREE.Group(); knot.position.set(0, 0.34, -0.47); b.pivot.add(knot);
    const tails = [-1, 1].map(s => mesh(new THREE.BoxGeometry(0.07, 0.45, 0.02), b.accMat, 0.05 * s, -0.2, -0.02, knot));
    b.extra.push((dt, t) => { tails.forEach((x, i) => { x.rotation.x = -0.6 + Math.sin(t * 7 + i * 1.3) * 0.3; x.rotation.z = (i ? 1 : -1) * 0.3; }); });
    const star = new THREE.Group(); b.hand.add(star); b.hand.rotation.x = Math.PI / 2;
    for (let i = 0; i < 4; i++) { const p = mesh(new THREE.ConeGeometry(0.06, 0.18, 4), metal(), 0, 0.2, 0.05, star); p.rotation.z = i * Math.PI / 2; p.position.set(Math.sin(i * Math.PI / 2) * 0.09, 0.2 + Math.cos(i * Math.PI / 2) * 0.09, 0.05); }
    b.weapon = star;
  },
  tack(b) {
    // the Tazer Bean: a safety helmet with a lightning bolt, glowing goggles, a battery pack and a crackling tazer
    const helm = mesh(new THREE.SphereGeometry(0.5, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.42), b.accMat, 0, 0.22, 0, b.pivot); helm.scale.set(1.06, 1, 1.06);
    const rim = mesh(new THREE.TorusGeometry(0.5, 0.045, 8, 32), b.accMat, 0, 0.36, 0, b.pivot); rim.rotation.x = Math.PI / 2; rim.scale.set(1.06, 1.06, 1);
    const stripe = mesh(new THREE.TorusGeometry(0.515, 0.05, 6, 30, Math.PI * 0.84), std('#ffd23f', { emissive: '#7a5200', ei: 0.4 }), 0, 0.22, 0, b.pivot); stripe.rotation.set(0, Math.PI / 2, Math.PI * 0.08);
    // lightning bolt badge on the front of the helmet
    const bolt = new THREE.Shape(); [[0.02, 0.16], [-0.09, -0.01], [-0.01, -0.01], [-0.05, -0.16], [0.09, 0.03], [0.01, 0.03], [0.06, 0.16]].forEach(([x, y], i) => bolt[i ? 'lineTo' : 'moveTo'](x, y));
    const boltG = new THREE.ExtrudeGeometry(bolt, { depth: 0.04, bevelEnabled: false }); boltG.translate(0, 0, -0.02);
    const glowY = std('#fff3b0', { emissive: '#ffd23f', ei: 1.6 });
    const badge = mesh(boltG, glowY, 0.2, 0.5, 0.39, b.pivot); badge.rotation.set(-0.7, 0.45, 0); badge.scale.setScalar(0.8);
    // goggles
    const band = mesh(new THREE.TorusGeometry(0.5, 0.035, 6, 30), std('#1b1036', { rough: 0.6 }), 0, 0.4, 0, b.pivot); band.rotation.x = Math.PI / 2;
    const lensM = std('#7df9ff', { emissive: '#4cc9f0', ei: 1.1, rough: 0.1 });
    for (const s2 of [-1, 1]) { const l = mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 16), lensM, 0.13 * s2, 0.44, 0.45, b.pivot); l.rotation.x = Math.PI / 2 - 0.55; const f = mesh(new THREE.TorusGeometry(0.09, 0.022, 6, 16), darkMetal(), 0.13 * s2, 0.445, 0.465, b.pivot); f.rotation.x = -0.55; }
    // battery pack with glowing coils
    const pack = mesh(new THREE.BoxGeometry(0.44, 0.5, 0.22), darkMetal(), 0, 0.02, -0.06, b.back);
    const coilM = std('#7df9ff', { emissive: '#4cc9f0', ei: 1.4 });
    const coils = [0, 1, 2].map(i => { const c = mesh(new THREE.TorusGeometry(0.09, 0.022, 6, 16), coilM.clone(), -0.12 + i * 0.12, 0.12, -0.13, b.back); return c; });
    mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 6), metal(), 0.15, 0.32, -0.06, b.back);
    // the tazer: a grip and two metal prongs with a spark jumping between them
    const tz = new THREE.Group(); b.hand.add(tz); b.hand.rotation.x = Math.PI / 2;
    mesh(new THREE.BoxGeometry(0.12, 0.3, 0.16), std('#2b2d42', { rough: 0.5 }), 0, 0.1, 0.05, tz);
    mesh(new THREE.BoxGeometry(0.13, 0.08, 0.17), std('#ffd23f', { rough: 0.4 }), 0, 0.22, 0.05, tz);
    for (const s2 of [-1, 1]) mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.16, 6), metal(), 0.04 * s2, 0.33, 0.05, tz);
    const arc = mesh(new THREE.BoxGeometry(0.1, 0.025, 0.025), new THREE.MeshBasicMaterial({ color: '#e0fbfc', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }), 0, 0.4, 0.05, tz); arc.castShadow = false;
    const halo = mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: '#7df9ff', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }), 0, 0.4, 0.05, tz); halo.castShadow = false;
    b.weapon = tz; b.muzzle = new THREE.Object3D(); b.muzzle.position.set(0, 0.42, 0.05); tz.add(b.muzzle);
    let flick = 0;
    b.extra.push((dt, t, st) => {
      const hot = st && st.attack >= 0 ? 1 : 0;
      flick -= dt; if (flick <= 0) { flick = 0.03 + Math.random() * 0.06; arc.visible = Math.random() < (hot ? 1 : 0.7); arc.rotation.z = (Math.random() - 0.5) * 0.9; arc.scale.set(0.8 + Math.random() * 0.5, 1 + Math.random() * 1.5, 1); }
      halo.scale.setScalar(0.8 + Math.sin(t * 40) * 0.2 + hot * 1.2);
      coils.forEach((c, i) => { c.material.emissiveIntensity = 0.8 + Math.max(0, Math.sin(t * 6 - i * 1.2)) * 1.4 + hot; });
      glowY.emissiveIntensity = 1.2 + Math.sin(t * 5) * 0.4 + hot * 1.5;
    });
  },
  glue(b) {
    // yellow rain hat and a squeezy glue bottle
    const hat = new THREE.Group(); hat.position.y = -0.12; b.top.add(hat);
    const dome = mesh(new THREE.SphereGeometry(0.46, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), cloth('#ffd23f'), 0, 0, 0, hat); dome.scale.y = 0.8;
    const brim = mesh(new THREE.CylinderGeometry(0.62, 0.7, 0.05, 26), cloth('#ffd23f'), 0, 0.0, -0.06, hat); brim.rotation.x = -0.12;
    const bottle = new THREE.Group(); b.hand.add(bottle); b.hand.rotation.x = 1.2;
    mesh(new THREE.CylinderGeometry(0.14, 0.15, 0.36, 12), std('#f1faee'), 0, 0.12, 0.08, bottle);
    mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.12, 12), std('#2a9d8f'), 0, 0.12, 0.08, bottle);
    mesh(new THREE.ConeGeometry(0.06, 0.18, 10), std('#ff7b00'), 0, 0.39, 0.08, bottle);
    const drip = mesh(new THREE.SphereGeometry(0.05, 8, 6), std('#c5f277', { emissive: '#4f7a00', ei: 0.3 }), 0, 0.5, 0.08, bottle);
    b.extra.push((dt, t) => { drip.position.y = 0.5 + ((t * 0.6) % 1) * -0.25; drip.scale.setScalar(0.6 + ((t * 0.6) % 1)); });
    b.weapon = bottle; b.muzzle = new THREE.Object3D(); b.muzzle.position.set(0, 0.45, 0.08); bottle.add(b.muzzle);
  },
  laser(b) {
    // glowing visor and a ray gun
    const visor = mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.16, 26, 1, true, -Math.PI * 0.42, Math.PI * 0.84), new THREE.MeshPhysicalMaterial({ color: '#ff006e', emissive: '#ff006e', emissiveIntensity: 0.8, transparent: true, opacity: 0.55, roughness: 0.05, side: THREE.DoubleSide }), 0, 0.22, 0, b.pivot);
    visor.castShadow = false;
    mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.32, 5), metal(), 0.22, 0.75, 0, b.pivot);
    const tip = mesh(new THREE.SphereGeometry(0.06, 8, 6), glowM('#ff006e', 2), 0.22, 0.92, 0, b.pivot); tip.castShadow = false;
    b.extra.push((dt, t) => { tip.material.emissiveIntensity = 1.2 + Math.sin(t * 8) * 0.8; });
    const gun = new THREE.Group(); b.hand.add(gun); b.hand.rotation.x = Math.PI / 2;
    mesh(new THREE.BoxGeometry(0.16, 0.42, 0.2), std('#e0e1dd', { metal: 0.5, rough: 0.3 }), 0, 0.2, 0.08, gun);
    for (let i = 0; i < 3; i++) mesh(new THREE.TorusGeometry(0.08, 0.02, 6, 12), glowM('#ff006e', 1.5), 0, 0.28 + i * 0.09, 0.08, gun).rotation.x = Math.PI / 2;
    mesh(new THREE.SphereGeometry(0.07, 10, 8), glowM('#ff6fb5', 2.4), 0, 0.5, 0.08, gun);
    b.weapon = gun; b.muzzle = new THREE.Object3D(); b.muzzle.position.set(0, 0.55, 0.08); gun.add(b.muzzle);
  },
  lightning(b) {
    // a little storm cloud hat and a lightning rod
    const cloud = new THREE.Group(); cloud.position.y = 0.12; b.top.add(cloud);
    [[0, 0, 0, 0.3], [0.25, -0.05, 0.05, 0.22], [-0.25, -0.05, -0.02, 0.22], [0.1, 0.12, -0.1, 0.2], [-0.12, 0.1, 0.12, 0.19]].forEach(([x, y, z, r]) => mesh(new THREE.SphereGeometry(r, 14, 10), std('#dee2e6', { rough: 0.9 }), x, y, z, cloud));
    const bolt = mesh(new THREE.ConeGeometry(0.07, 0.35, 4), glowM('#ffd23f', 1.6), 0.05, -0.28, 0.2, cloud); bolt.rotation.z = 0.4; bolt.rotation.x = Math.PI;
    b.extra.push((dt, t) => { cloud.position.y = 0.12 + Math.sin(t * 2) * 0.04; bolt.material.emissiveIntensity = Math.random() < 0.05 ? 4 : 1.4; });
    const rod = new THREE.Group(); b.hand.add(rod); b.hand.rotation.x = 0.3;
    mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.75, 6), metal(), 0, 0.22, 0.05, rod);
    const orb = mesh(new THREE.SphereGeometry(0.11, 14, 10), new THREE.MeshPhysicalMaterial({ color: '#caf0f8', emissive: '#48cae4', emissiveIntensity: 1.2, roughness: 0.05, clearcoat: 1 }), 0, 0.64, 0.05, rod);
    b.extra.push((dt, t) => { orb.scale.setScalar(1 + Math.sin(t * 9) * 0.08); });
    b.weapon = rod; b.muzzle = new THREE.Object3D(); b.muzzle.position.set(0, 0.64, 0.05); rod.add(b.muzzle);
  },
  magic(b) {
    // a starry wizard hat and a star wand
    const hat = new THREE.Group(); hat.position.y = -0.18; b.top.add(hat);
    mesh(new THREE.CylinderGeometry(0.64, 0.66, 0.05, 28), b.bodyMat, 0, 0, 0, hat);
    const cone = mesh(new THREE.ConeGeometry(0.4, 0.75, 24), b.bodyMat, 0, 0.38, 0, hat); cone.rotation.z = -0.12;
    mesh(new THREE.TorusGeometry(0.39, 0.05, 8, 26), b.accMat, 0, 0.07, 0, hat).rotation.x = Math.PI / 2;
    for (let i = 0; i < 5; i++) { const s = mesh(new THREE.OctahedronGeometry(0.05), gold(), Math.sin(i * 1.7) * 0.28, 0.15 + i * 0.1, Math.cos(i * 1.7) * 0.28, hat); s.scale.y = 1.6; }
    const wand = new THREE.Group(); b.hand.add(wand); b.hand.rotation.x = 0.4;
    mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.6, 6), std('#2b2d42'), 0, 0.18, 0.05, wand);
    const st = mesh(new THREE.OctahedronGeometry(0.12), glowM('#ffd23f', 2), 0, 0.55, 0.05, wand); st.scale.set(1, 1, 0.5);
    b.extra.push((dt, t) => { st.rotation.y = t * 3; });
    b.weapon = wand; b.muzzle = new THREE.Object3D(); b.muzzle.position.set(0, 0.55, 0.05); wand.add(b.muzzle);
  },
  thorn(b) {
    // flower crown with leaves, and a thorny staff with a rose
    const crown = new THREE.Group(); crown.position.y = -0.05; b.top.add(crown);
    for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; const pt = mesh(new THREE.SphereGeometry(0.1, 8, 6), std(i % 2 ? '#ff6fb5' : '#ffd23f'), Math.cos(a) * 0.36, 0.06, Math.sin(a) * 0.36, crown); pt.scale.set(1, 0.6, 1); }
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 + 0.3; const lf = mesh(new THREE.SphereGeometry(0.13, 8, 6), cloth('#2d6a4f'), Math.cos(a) * 0.43, 0, Math.sin(a) * 0.43, crown); lf.scale.set(1.5, 0.3, 0.7); lf.rotation.y = -a; }
    const staff = new THREE.Group(); b.hand.add(staff); b.hand.rotation.x = 0.35;
    mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.8, 6), std('#40916c'), 0, 0.22, 0.05, staff);
    for (let i = 0; i < 4; i++) { const th = mesh(new THREE.ConeGeometry(0.03, 0.1, 4), std('#1b4332'), 0.05 * (i % 2 ? 1 : -1), i * 0.15, 0.05, staff); th.rotation.z = (i % 2 ? -1 : 1) * 1.3; }
    const rose = mesh(new THREE.SphereGeometry(0.11, 10, 8), std('#e63946', { rough: 0.5 }), 0, 0.66, 0.05, staff); rose.scale.y = 0.8;
    b.extra.push((dt, t) => { crown.rotation.y = Math.sin(t * 1.5) * 0.1; });
    b.weapon = staff;
  },
  archer(b) {
    // pointy cap with a red feather, a quiver and a bow
    const hat = new THREE.Group(); hat.position.y = -0.12; b.top.add(hat);
    const cap = mesh(new THREE.ConeGeometry(0.5, 0.6, 20), cloth('#606c38'), 0, 0.24, -0.06, hat); cap.rotation.x = -0.35;
    mesh(new THREE.TorusGeometry(0.46, 0.05, 6, 24), cloth('#283618'), 0, 0.02, 0, hat).rotation.x = Math.PI / 2;
    const fe = mesh(new THREE.ConeGeometry(0.07, 0.6, 6), std('#e63946'), 0.3, 0.36, -0.1, hat); fe.rotation.set(-0.6, 0, -0.5); fe.scale.z = 0.3;
    const q = mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.6, 10), wood(), -0.12, 0.05, -0.02, b.back); q.rotation.z = 0.35;
    for (let i = 0; i < 3; i++) mesh(new THREE.ConeGeometry(0.05, 0.12, 4), std('#fefae0'), -0.05 + i * 0.05, 0.38, 0, q);
    const bow = new THREE.Group(); b.hand.add(bow); b.hand.rotation.x = Math.PI / 2;
    const arc = mesh(new THREE.TorusGeometry(0.42, 0.035, 6, 20, Math.PI), wood(), 0, 0.15, 0.05, bow); arc.rotation.set(Math.PI / 2, 0, Math.PI / 2);
    const str = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.84, 4), std('#fefae0'), 0, 0.15, 0.05, bow); str.rotation.x = Math.PI / 2;
    b.weapon = bow;
  },
  fire(b) {
    // flames for hair, a red bandana and a fireball in the hand
    const fl = new THREE.Group(); fl.position.y = -0.05; b.top.add(fl);
    const flames = [[0, 0.3, 0, 0.2, 0.6, '#ff5a00'], [0.17, 0.2, 0.05, 0.14, 0.42, '#ff9f1c'], [-0.17, 0.2, 0.05, 0.14, 0.42, '#ff9f1c'], [0, 0.18, 0.16, 0.12, 0.34, '#ffd23f']].map(([x, y, z, r, h, c]) => { const m = mesh(new THREE.ConeGeometry(r, h, 10), glowM(c, 1.6), x, y, z, fl); m.castShadow = false; return m; });
    b.extra.push((dt, t) => flames.forEach((f, i) => { f.scale.y = 0.85 + Math.sin(t * 14 + i * 2) * 0.15; f.rotation.z = Math.sin(t * 9 + i) * 0.12; }));
    const band = mesh(new THREE.TorusGeometry(0.47, 0.07, 8, 30), cloth('#d00000'), 0, 0.38, 0, b.pivot); band.rotation.x = Math.PI / 2;
    const ball = new THREE.Group(); b.hand.add(ball); b.hand.rotation.x = 0.6;
    const fb = mesh(new THREE.IcosahedronGeometry(0.17, 1), glowM('#ff8c42', 2.2), 0, 0.02, 0.12, ball); fb.castShadow = false;
    b.extra.push((dt, t) => { fb.scale.setScalar(0.85 + Math.sin(t * 12) * 0.12); fb.rotation.y = t * 4; });
    b.weapon = ball;
  },
  pirate(b) {
    // three-cornered hat with a skull, an eye patch and a hand cannon
    const hat = new THREE.Group(); hat.position.y = -0.1; b.top.add(hat);
    mesh(new THREE.CylinderGeometry(0.64, 0.68, 0.06, 3), cloth('#14101c'), 0, 0, 0, hat).rotation.y = Math.PI / 6;
    mesh(new THREE.CylinderGeometry(0.36, 0.44, 0.3, 20), cloth('#14101c'), 0, 0.16, 0, hat);
    mesh(new THREE.TorusGeometry(0.42, 0.03, 6, 24), gold(), 0, 0.04, 0, hat).rotation.x = Math.PI / 2;
    mesh(new THREE.SphereGeometry(0.07, 10, 8), std('#ffffff'), 0, 0.17, 0.4, hat);
    const patch = mesh(new THREE.CircleGeometry(0.1, 14), BLACK, -0.155, 0.2, 0.475, b.pivot); patch.castShadow = false;
    const strap = mesh(new THREE.TorusGeometry(0.485, 0.02, 6, 28), BLACK, 0, 0.24, 0, b.pivot); strap.rotation.set(Math.PI / 2, 0.35, 0);
    const gun = new THREE.Group(); b.hand.add(gun); b.hand.rotation.x = Math.PI / 2;
    mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.55, 12), darkMetal(), 0, 0.25, 0.08, gun);
    mesh(new THREE.TorusGeometry(0.11, 0.025, 6, 14), gold(), 0, 0.5, 0.08, gun).rotation.x = Math.PI / 2;
    b.weapon = gun;
  },
  bee(b) {
    // antennae, black stripes, buzzing wings and a honey pot
    for (const sd of [-1, 1]) { const a = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.4, 5), BLACK, 0.15 * sd, 0.2, 0.05, b.top); a.rotation.z = -0.4 * sd; mesh(new THREE.SphereGeometry(0.06, 8, 6), BLACK, 0.24 * sd, 0.38, 0.05, b.top); }
    for (const y of [-0.12, -0.34]) { const st = mesh(new THREE.TorusGeometry(y > -0.2 ? 0.5 : 0.47, 0.06, 6, 30), BLACK, 0, y, 0, b.pivot); st.rotation.x = Math.PI / 2; }
    const wm = new THREE.MeshPhysicalMaterial({ color: '#e0fbfc', transparent: true, opacity: 0.6, roughness: 0.1, side: THREE.DoubleSide });
    const wings = [-1, 1].map(sd => { const w = mesh(new THREE.CircleGeometry(0.3, 14), wm, 0.22 * sd, 0.25, -0.1, b.back); w.scale.y = 0.6; w.castShadow = false; return w; });
    b.extra.push((dt, t) => wings.forEach((w, i) => { w.rotation.y = (i ? 1 : -1) * (0.6 + Math.sin(t * 30) * 0.4); }));
    const pot = new THREE.Group(); b.hand.add(pot); b.hand.rotation.x = 0.5;
    mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.2, 12), std('#d4a017'), 0, 0, 0.12, pot);
    mesh(new THREE.TorusGeometry(0.13, 0.03, 6, 14), std('#ffd23f', { emissive: '#7a5200', ei: 0.4 }), 0, 0.11, 0.12, pot).rotation.x = Math.PI / 2;
    b.weapon = pot;
  },
  gatling(b) {
    // army helmet and a gatling gun with spinning barrels
    const hat = new THREE.Group(); hat.position.y = -0.18; b.top.add(hat);
    const dome = mesh(new THREE.SphereGeometry(0.53, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), std('#4b5320', { rough: 0.6 }), 0, 0, 0, hat); dome.scale.y = 0.75;
    mesh(new THREE.CylinderGeometry(0.57, 0.57, 0.05, 24), std('#3b4218'), 0, 0.01, 0, hat);
    const gun = new THREE.Group(); b.hand.add(gun); b.hand.rotation.x = Math.PI / 2;
    const barrels = new THREE.Group(); barrels.position.set(0, 0.35, 0.08); gun.add(barrels);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 6), darkMetal(), Math.cos(a) * 0.08, 0, Math.sin(a) * 0.08, barrels); }
    mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.22, 12), std('#6c757d', { metal: 0.6, rough: 0.3 }), 0, -0.05, 0.08, gun);
    b.extra.push((dt) => { barrels.rotation.y += dt * 9; });
    b.weapon = gun;
  },
  wind(b) {
    // aviator cap, goggles, a long scarf and a pinwheel
    const cap = mesh(new THREE.SphereGeometry(0.5, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), cloth('#8d5524'), 0, -0.2, 0, b.top); cap.scale.y = 0.8;
    for (const sd of [-1, 1]) { const g = mesh(new THREE.TorusGeometry(0.09, 0.03, 8, 14), std('#ffd23f', { metal: 0.5 }), 0.13 * sd, 0.47, 0.38, b.pivot); g.rotation.x = -0.3; const l = mesh(new THREE.CircleGeometry(0.08, 14), glowM('#90e0ef', 0.6), 0.13 * sd, 0.47, 0.4, b.pivot); l.rotation.x = -0.3; l.castShadow = false; }
    const scarf = mesh(new THREE.TorusGeometry(0.41, 0.07, 8, 24), cloth('#ffffff'), 0, -0.13, 0.03, b.pivot); scarf.rotation.x = Math.PI / 2 + 0.12;
    const tail = mesh(new THREE.BoxGeometry(0.12, 0.45, 0.04), cloth('#ffffff'), -0.25, -0.15, -0.38, b.pivot);
    b.extra.push((dt, t) => { tail.rotation.x = 0.8 + Math.sin(t * 8) * 0.3; });
    const pw = new THREE.Group(); b.hand.add(pw); b.hand.rotation.x = 0.4;
    mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.7, 6), wood(), 0, 0.2, 0.05, pw);
    const wheel = new THREE.Group(); wheel.position.set(0, 0.58, 0.1); pw.add(wheel);
    ['#ff4d6d', '#ffd23f', '#3a86ff', '#7bd389'].forEach((c, i) => { const holder = new THREE.Group(); holder.rotation.z = i * Math.PI / 2; wheel.add(holder); const bl = mesh(new THREE.ConeGeometry(0.12, 0.26, 3), std(c, { double: true }), 0, 0.12, 0, holder); bl.scale.z = 0.15; });
    b.extra.push((dt) => { wheel.rotation.z += dt * 9; });
    b.weapon = pw;
  },
  rocket(b) {
    // space cap with a blinking light, a jet pack and a rocket launcher
    const hat = new THREE.Group(); hat.position.y = -0.15; b.top.add(hat);
    const dome = mesh(new THREE.SphereGeometry(0.52, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), std('#f8f9fa', { rough: 0.3 }), 0, 0, 0, hat); dome.scale.y = 0.85;
    mesh(new THREE.TorusGeometry(0.5, 0.05, 8, 28), b.accMat, 0, 0.02, 0, hat).rotation.x = Math.PI / 2;
    mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.35, 5), darkMetal(), 0.2, 0.55, 0, hat);
    const light = mesh(new THREE.SphereGeometry(0.05, 8, 6), glowM('#ff4d6d', 2), 0.2, 0.74, 0, hat); light.castShadow = false;
    b.extra.push((dt, t) => { light.visible = Math.sin(t * 6) > 0; });
    mesh(new THREE.BoxGeometry(0.4, 0.45, 0.2), std('#adb5bd', { metal: 0.4 }), 0, 0, -0.08, b.back);
    for (const sd of [-1, 1]) mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.2, 10), darkMetal(), 0.12 * sd, -0.3, -0.08, b.back);
    const tube = new THREE.Group(); b.hand.add(tube); b.hand.rotation.x = Math.PI / 2;
    mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.8, 12), std('#495057', { metal: 0.4 }), 0, 0.3, 0.1, tube);
    mesh(new THREE.ConeGeometry(0.1, 0.18, 10), b.accMat, 0, 0.75, 0.1, tube);
    b.weapon = tube;
  },
  drummer(b) {
    // tall marching hat with a plume, a drum on the belly and a drum stick
    const hat = new THREE.Group(); hat.position.y = -0.18; b.top.add(hat);
    mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.62, 20), cloth('#14101c'), 0, 0.3, 0, hat);
    mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.06, 20), gold(), 0, 0.02, 0, hat);
    const plume = mesh(new THREE.SphereGeometry(0.13, 10, 8), cloth('#ffd23f'), 0, 0.75, 0.1, hat); plume.scale.y = 1.8;
    mesh(new THREE.OctahedronGeometry(0.08), gold(), 0, 0.35, 0.4, hat);
    const drum = mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.3, 20), b.accMat, 0, -0.32, 0.42, b.pivot); drum.rotation.x = Math.PI / 2 - 0.2;
    mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.04, 20), std('#ffffff'), 0, -0.29, 0.58, b.pivot).rotation.x = Math.PI / 2 - 0.2;
    b.extra.push((dt, t) => { plume.rotation.z = Math.sin(t * 6) * 0.15; });
    const stick = new THREE.Group(); b.hand.add(stick); b.hand.rotation.x = 0.8;
    mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.5, 6), wood(), 0, 0.15, 0.05, stick);
    mesh(new THREE.SphereGeometry(0.05, 8, 6), std('#ffffff'), 0, 0.4, 0.05, stick);
    b.weapon = stick;
  },
  super(b) {
    // a mask around the eyes, a big red cape and a golden emblem
    for (const sd of [-1, 1]) { const r = mesh(new THREE.RingGeometry(0.075, 0.15, 16), std('#14101c', { double: true }), 0.155 * sd, 0.2, 0.47, b.pivot); r.castShadow = false; }
    const cape = mesh(new THREE.CylinderGeometry(0.5, 0.82, 1.3, 20, 1, true, Math.PI * 0.6, Math.PI * 0.8), std('#e63946', { rough: 0.6, double: true }), 0, -0.3, -0.05, b.pivot);
    b.extra.push((dt, t) => { cape.rotation.x = 0.12 + Math.sin(t * 4) * 0.07; });
    const em = mesh(new THREE.OctahedronGeometry(0.16), std('#ffd23f', { metal: 0.4 }), 0, -0.15, 0.46, b.pivot); em.scale.set(1, 0.8, 0.3);
    mesh(new THREE.OctahedronGeometry(0.08), std('#e63946'), 0, -0.15, 0.5, b.pivot).scale.set(1, 0.8, 0.4);
    const fist = new THREE.Group(); b.hand.add(fist);
    b.weapon = fist;
  },
  sun(b) {
    // a crown of sun rays, round sunglasses, and a little sun in the hand
    const crown = new THREE.Group(); crown.position.y = -0.06; b.top.add(crown);
    mesh(new THREE.TorusGeometry(0.3, 0.06, 8, 24), std('#ffb703', { emissive: '#ff8c00', ei: 0.6 }), 0, 0, 0, crown).rotation.x = Math.PI / 2;
    const rays = [];
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; const r = mesh(new THREE.ConeGeometry(0.06, 0.26, 6), glowM(i % 2 ? '#ffd23f' : '#ff8c42', 0.9), Math.cos(a) * 0.36, 0.08, Math.sin(a) * 0.36, crown); r.rotation.set(Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2); rays.push(r); }
    b.extra.push((dt, t) => { crown.rotation.y = t * 0.6; });
    for (const s of [-1, 1]) { const g = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 16), BLACK, 0.155 * s, 0.21, 0.47, b.pivot); g.rotation.x = Math.PI / 2; g.castShadow = false; }
    mesh(new THREE.BoxGeometry(0.12, 0.025, 0.025), std('#ffd23f'), 0, 0.23, 0.49, b.pivot).castShadow = false;
    const orb = new THREE.Group(); b.hand.add(orb); b.hand.rotation.x = 0.6;
    mesh(new THREE.SphereGeometry(0.14, 16, 12), glowM('#ffd23f', 2.2), 0, 0.05, 0.14, orb);
    const halo = mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 20), glowM('#ff8c42', 1.5), 0, 0.05, 0.14, orb);
    b.extra.push((dt, t) => { halo.rotation.x = t * 2; halo.rotation.y = t * 1.3; });
    b.weapon = orb;
  },
  spike(b) {
    // a spiky helmet, a bag of spikes on the back and a spike ball in the hand
    const hat = new THREE.Group(); hat.position.y = -0.16; b.top.add(hat);
    const dome = mesh(new THREE.SphereGeometry(0.52, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), metal(), 0, 0, 0, hat); dome.scale.y = 0.75;
    for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2, r = i ? 0.3 : 0; const sp = mesh(new THREE.ConeGeometry(0.06, 0.24, 6), std('#e63946', { rough: 0.3 }), Math.cos(a) * r, i ? 0.3 : 0.45, Math.sin(a) * r, hat); sp.rotation.set(Math.sin(a) * 0.5 * (i ? 1 : 0), 0, -Math.cos(a) * 0.5 * (i ? 1 : 0)); }
    const bag = mesh(new THREE.SphereGeometry(0.26, 14, 10), cloth('#6f4518'), 0, -0.05, -0.08, b.back); bag.scale.set(1, 1.15, 0.8);
    for (let i = 0; i < 4; i++) mesh(new THREE.ConeGeometry(0.04, 0.16, 5), metal(), (i - 1.5) * 0.08, 0.25, -0.08, b.back);
    const ball = new THREE.Group(); b.hand.add(ball);
    mesh(new THREE.IcosahedronGeometry(0.11, 0), darkMetal(), 0, 0.02, 0.12, ball);
    for (let i = 0; i < 8; i++) { const v = new THREE.Vector3(Math.sin(i * 2.4) * Math.cos(i), Math.cos(i * 2.4), Math.sin(i * 2.4) * Math.sin(i)).normalize(); const c = mesh(new THREE.ConeGeometry(0.03, 0.12, 5), metal(), v.x * 0.13, 0.02 + v.y * 0.13, 0.12 + v.z * 0.13, ball); c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v); }
    b.weapon = ball;
  },
  ghost(b) {
    // a see-through ghost hood with a wavy hem, and a glowing green lantern
    const hood = mesh(new THREE.SphereGeometry(0.58, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), new THREE.MeshStandardMaterial({ color: '#f8f9fa', transparent: true, opacity: 0.55, roughness: 0.4, emissive: '#c8b6ff', emissiveIntensity: 0.35, side: THREE.DoubleSide }), 0, -0.25, -0.02, b.top);
    hood.scale.set(1, 1.05, 1); hood.castShadow = false;
    const hem = []; for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; if (Math.sin(a) > 0.55) continue; const h = mesh(new THREE.SphereGeometry(0.1, 8, 6), hood.material, Math.cos(a) * 0.52, -0.62, Math.sin(a) * 0.52, b.top); h.castShadow = false; hem.push(h); }
    b.extra.push((dt, t) => { hem.forEach((h, i) => { h.position.y = -0.62 + Math.sin(t * 4 + i) * 0.04; }); hood.position.y = -0.25 + Math.sin(t * 2) * 0.02; });
    const lan = new THREE.Group(); b.hand.add(lan); b.hand.rotation.x = 0.3;
    mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.2, 8), new THREE.MeshStandardMaterial({ color: '#7bd389', emissive: '#7bd389', emissiveIntensity: 1.8, transparent: true, opacity: 0.85 }), 0, -0.02, 0.1, lan);
    mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.04, 8), darkMetal(), 0, 0.1, 0.1, lan); mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.04, 8), darkMetal(), 0, -0.13, 0.1, lan);
    mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 12), darkMetal(), 0, 0.16, 0.1, lan);
    b.weapon = lan;
  },
  meteor(b) {
    // a dark blue star hood, and a glowing rock with hot cracks in the hand
    const hat = new THREE.Group(); hat.position.y = -0.2; b.top.add(hat);
    const cone = mesh(new THREE.ConeGeometry(0.5, 0.95, 20), cloth('#240046'), 0, 0.42, -0.04, hat); cone.rotation.x = -0.18;
    mesh(new THREE.TorusGeometry(0.48, 0.06, 8, 26), std('#ffd23f'), 0, 0.02, 0, hat).rotation.x = Math.PI / 2;
    for (let i = 0; i < 5; i++) { const a = i * 1.3; const st = mesh(new THREE.OctahedronGeometry(0.05), glowM('#fff3b0', 1.4), Math.cos(a) * 0.33, 0.3 + i * 0.1, Math.sin(a) * 0.33 - 0.02, hat); st.scale.z = 0.4; }
    const rock = new THREE.Group(); b.hand.add(rock); b.hand.rotation.x = 0.6;
    mesh(new THREE.DodecahedronGeometry(0.14, 0), std('#3a2a24', { emissive: '#ff5a1f', ei: 0.9, flat: true }), 0, 0.04, 0.14, rock);
    const glow = mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshBasicMaterial({ color: '#ff8c42', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }), 0, 0.04, 0.14, rock); glow.castShadow = false;
    b.extra.push((dt, t) => { glow.scale.setScalar(1 + Math.sin(t * 5) * 0.15); rock.rotation.y = t; });
    b.weapon = rock;
  },
  clock(b) {
    // a top hat with a clock face, a monocle, and a golden pocket watch on a chain
    const hat = new THREE.Group(); hat.position.y = -0.14; b.top.add(hat);
    mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 24), cloth('#14101c'), 0, 0, 0, hat);
    mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.55, 22), cloth('#14101c'), 0, 0.28, 0, hat);
    mesh(new THREE.CylinderGeometry(0.345, 0.345, 0.08, 22), b.accMat, 0, 0.08, 0, hat);
    const face = mesh(new THREE.CircleGeometry(0.17, 20), std('#fff8ee'), 0, 0.3, 0.335, hat); face.castShadow = false;
    const hands = [0.12, 0.08].map((l, i) => { const h = mesh(new THREE.BoxGeometry(0.018, l, 0.01), BLACK, 0, 0.3, 0.34, hat); h.geometry.translate(0, l / 2, 0); h.castShadow = false; return h; });
    b.extra.push((dt, t) => { hands[0].rotation.z = -t * 2; hands[1].rotation.z = -t * 0.17; });
    const mono = mesh(new THREE.TorusGeometry(0.1, 0.018, 6, 18), gold(), 0.155, 0.2, 0.48, b.pivot); mono.castShadow = false;
    const watch = new THREE.Group(); b.hand.add(watch); b.hand.rotation.x = 0.5;
    const case_ = mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.05, 20), gold(), 0, -0.05, 0.12, watch); case_.rotation.x = Math.PI / 2;
    mesh(new THREE.CircleGeometry(0.105, 18), std('#fff8ee'), 0, -0.05, 0.148, watch).castShadow = false;
    const wh = mesh(new THREE.BoxGeometry(0.012, 0.08, 0.01), BLACK, 0, -0.05, 0.152, watch); wh.geometry.translate(0, 0.04, 0);
    b.extra.push((dt, t) => { wh.rotation.z = -t * 3; watch.rotation.z = Math.sin(t * 2.5) * 0.25; });
    b.weapon = watch;
  },
  cannon(b) {
    // pirate hat, eye patch and a little cannon
    const hat = new THREE.Group(); hat.position.y = -0.1; b.top.add(hat);
    const crown = mesh(new THREE.CylinderGeometry(0.4, 0.46, 0.26, 20), cloth('#1b1b2f'), 0, 0.1, 0, hat); void crown;
    for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3; const fl = mesh(new THREE.BoxGeometry(0.62, 0.3, 0.06), cloth('#1b1b2f'), Math.sin(a) * 0.38, 0.12, Math.cos(a) * 0.38, hat); fl.rotation.y = a; fl.rotation.x = -0.35; }
    mesh(new THREE.TorusGeometry(0.42, 0.03, 6, 24), gold(), 0, 0.0, 0, hat).rotation.x = Math.PI / 2;
    const patch = mesh(new THREE.CircleGeometry(0.1, 14), BLACK, -0.16, 0.22, 0.47, b.pivot); patch.rotation.y = -0.35; patch.castShadow = false;
    const strap = mesh(new THREE.TorusGeometry(0.49, 0.015, 4, 30), BLACK, 0, 0.27, 0, b.pivot); strap.rotation.set(Math.PI / 2 - 0.25, 0, 0.35);
    b.eyes[0].visible = false;
    const can = new THREE.Group(); b.hand.add(can); b.hand.rotation.x = Math.PI / 2;
    mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.65, 14), darkMetal(), 0, 0.28, 0.1, can);
    mesh(new THREE.TorusGeometry(0.13, 0.03, 6, 14), gold(), 0, 0.6, 0.1, can).rotation.x = Math.PI / 2;
    mesh(new THREE.SphereGeometry(0.16, 12, 10), darkMetal(), 0, -0.05, 0.1, can);
    b.weapon = can; b.muzzle = new THREE.Object3D(); b.muzzle.position.set(0, 0.65, 0.1); can.add(b.muzzle);
  }
};

// ---------- extra hats and faces for the lobby crowd ----------
const STRIPE_TEX = {};
function stripeTex(a, c) { const k = a + c; return STRIPE_TEX[k] || (STRIPE_TEX[k] = canvasTex(64, 64, (g, w, h) => { g.fillStyle = a; g.fillRect(0, 0, w, h); g.fillStyle = c; for (let i = 0; i < 4; i++) g.fillRect(0, i * 16, w, 8); })); }
export const ACCESSORIES = {
  partyhat(b, c) { const h = mesh(new THREE.ConeGeometry(0.24, 0.6, 18), new THREE.MeshStandardMaterial({ map: stripeTex(c, '#ffffff'), roughness: 0.5 }), 0.08, 0.18, 0, b.top); h.rotation.z = -0.2; mesh(new THREE.SphereGeometry(0.08, 10, 8), std('#ffd23f'), 0.15, 0.5, 0, b.top); },
  bow(b, c) { for (const s of [-1, 1]) { const l = mesh(new THREE.ConeGeometry(0.13, 0.26, 10), std(c), 0.27 + 0.13 * s, -0.04, 0.12, b.top); l.rotation.z = Math.PI / 2 * s; } mesh(new THREE.SphereGeometry(0.07, 10, 8), std(c), 0.27, -0.04, 0.12, b.top); },
  shades(b) { for (const s of [-1, 1]) { const g = mesh(new THREE.BoxGeometry(0.2, 0.12, 0.04), BLACK, 0.155 * s, 0.21, 0.47, b.pivot); g.rotation.y = 0.3 * s; g.castShadow = false; } mesh(new THREE.BoxGeometry(0.12, 0.03, 0.03), BLACK, 0, 0.24, 0.49, b.pivot).castShadow = false; },
  headphones(b, c) { const band = mesh(new THREE.TorusGeometry(0.5, 0.045, 8, 24, Math.PI), std('#343a40'), 0, 0.12, 0, b.pivot); band.position.y = 0.25; for (const s of [-1, 1]) { const cup = mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.12, 14), std(c), 0.5 * s, 0.25, 0, b.pivot); cup.rotation.z = Math.PI / 2; } },
  crown(b) { const cr = new THREE.Group(); cr.position.y = -0.04; b.top.add(cr); mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.16, 10, 1, true), gold(), 0, 0, 0, cr); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; mesh(new THREE.ConeGeometry(0.05, 0.13, 6), gold(), Math.cos(a) * 0.26, 0.13, Math.sin(a) * 0.26, cr); } },
  flower(b, c) { const f = new THREE.Group(); f.position.set(0.24, -0.02, 0.18); b.top.add(f); for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; mesh(new THREE.SphereGeometry(0.08, 8, 6), std(c), Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0, f); } mesh(new THREE.SphereGeometry(0.07, 8, 6), std('#ffd23f'), 0, 0, 0.03, f); },
  propeller(b, c) { mesh(new THREE.SphereGeometry(0.3, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), std(c), 0, -0.1, 0, b.top); mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.18, 6), darkMetal(), 0, 0.27, 0, b.top); const p = new THREE.Group(); p.position.y = 0.36; b.top.add(p); for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.34, 0.02, 0.08), std('#ffd23f'), 0.17 * s, 0, 0, p); b.extra.push((dt) => { p.rotation.y += dt * 14; }); },
  antenna(b, c) { for (const s of [-1, 1]) { const a = mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.35, 5), BLACK, 0.12 * s, 0.12, 0, b.top); a.rotation.z = -0.35 * s; mesh(new THREE.SphereGeometry(0.06, 8, 6), glowM(c, 0.6), 0.18 * s, 0.29, 0, b.top); } }
};
export function setFace(b, f = {}) {
  if (f.eyes) b.eyes.forEach(e => { e.scale.setScalar(f.eyes); e.userData.sy = f.eyes; });
  if (f.mouth === 'open') { b.mouth.visible = false; const m = mesh(new THREE.SphereGeometry(0.07, 12, 8), BLACK, 0, -0.03, 0.44, b.face); m.scale.set(1, 1.2, 0.4); m.castShadow = false; }
  if (f.mouth === 'grin') b.mouth.scale.set(1.8, 1.3, 1);
  if (f.brows) for (const s of [-1, 1]) { const br = mesh(new THREE.BoxGeometry(0.12, 0.025, 0.02), BLACK, 0.155 * s, 0.38, 0.42, b.face); br.rotation.z = -0.25 * s * (f.brows === 'angry' ? -1 : 1); br.castShadow = false; }
  if (f.freckles) for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { const d = mesh(DOT, std('#c46a3a'), (0.24 + i * 0.03) * s, 0.06 + (i % 2) * 0.03, 0.4, b.face); d.scale.setScalar(0.012); d.castShadow = false; }
}

// ---------- the tower bean ----------
export class TowerBean extends Bean {
  constructor(kind, colors) { super(kind, colors); this.kind = kind; this.skin = 1; this.gear = []; this.aura = null; }
  // new looks at upgrade 5 (skin 2) and upgrade 10 (skin 3)
  setSkin(n, colors) {
    if (n <= this.skin) return;
    if (colors) this.setColors(colors[0], colors[1]);
    if (n >= 2 && this.skin < 2) {
      for (const a of this.arms) { const band = mesh(new THREE.TorusGeometry(0.12, 0.035, 6, 14), gold(), 0, -0.12, 0, a); band.rotation.x = Math.PI / 2; }
      const cape = mesh(new THREE.CylinderGeometry(0.47, 0.62, 0.9, 20, 1, true, Math.PI * 0.62, Math.PI * 0.76), std(this.c2, { rough: 0.6 }), 0, -0.1, -0.03, this.pivot); cape.material.side = THREE.DoubleSide;
      this.extra.push((dt, t) => { cape.rotation.x = Math.sin(t * 3) * 0.05; });
      const belt = mesh(new THREE.TorusGeometry(0.47, 0.04, 6, 30), std('#5a3a22'), 0, -0.3, 0, this.pivot); belt.rotation.x = Math.PI / 2;
      mesh(new THREE.BoxGeometry(0.14, 0.11, 0.04), gold(), 0, -0.3, 0.47, this.pivot);
      const star = mesh(new THREE.OctahedronGeometry(0.07), gold(), -0.17, -0.06, 0.45, this.pivot); star.scale.z = 0.4;
    }
    if (n >= 3 && this.skin < 3) {
      const cr = new THREE.Group(); cr.position.set(0, 0.02, 0); this.top.add(cr);
      mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.14, 10, 1, true), gold(), 0, 0, 0, cr);
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; mesh(new THREE.ConeGeometry(0.045, 0.12, 5), gold(), Math.cos(a) * 0.23, 0.12, Math.sin(a) * 0.23, cr); }
      mesh(new THREE.OctahedronGeometry(0.06), std('#ff4d6d', { emissive: '#ff4d6d', ei: 1 }), 0, 0.02, 0.24, cr);
      const aura = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.05, 6, 40), new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
      aura.rotation.x = Math.PI / 2; aura.position.y = 0.08; this.root.add(aura); this.aura = aura;
      const orbs = [0, 1, 2].map(i => { const o = mesh(new THREE.OctahedronGeometry(0.07), std('#fff3b0', { emissive: '#ffd23f', ei: 2 }), 0, 0, 0, this.root); o.castShadow = false; return o; });
      this.extra.push((dt, t) => { aura.rotation.z = t; aura.material.opacity = 0.5 + Math.sin(t * 3) * 0.25; orbs.forEach((o, i) => { const a = t * 2 + i * 2.09; o.position.set(Math.cos(a) * 0.75, 1.1 + Math.sin(t * 3 + i) * 0.25, Math.sin(a) * 0.75); o.rotation.y = t * 4; }); });
      // golden weapon
      if (this.weapon) { const g = gold(); this.weapon.traverse(o => { if (o.isMesh && o.material.emissive && o.material.emissive.getHex() === 0) o.material = g; }); }
    }
    this.skin = n;
  }
}

// ---------- farms ----------
// a little farm: field with crops, a barn, and with upgrades a silo (level 5) and a windmill (level 10)
const FARM_LOOK = {
  farm: { barn: '#d62828', roof: '#6b2d1f', crop: '#5cb85c', soil: '#7a4a2a', fence: '#c8a26b' },
  candyfarm: { barn: '#ff7ac8', roof: '#ffffff', crop: '#ff4d6d', soil: '#7a4a2e', fence: '#ffffff', candy: true },
  goldfarm: { barn: '#fff1d6', roof: '#ffd23f', crop: '#ffd23f', soil: '#6b4a2a', fence: '#ffd23f', gold: true }
};
export class FarmModel {
  constructor(id) {
    const L = this.look = FARM_LOOK[id] || FARM_LOOK.farm;
    const g = this.root = new THREE.Group();
    const soil = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.18, 2.2), std(L.soil, { rough: 0.95 })); soil.position.set(0.4, 0.09, 0.3); soil.receiveShadow = true; g.add(soil);
    this.crops = [];
    const cropG = L.candy ? new THREE.SphereGeometry(0.16, 10, 8) : new THREE.ConeGeometry(0.13, 0.42, 6);
    const cropM = L.gold ? gold() : L.candy ? new THREE.MeshPhysicalMaterial({ color: L.crop, roughness: 0.2, clearcoat: 1 }) : std(L.crop, { flat: true });
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
      const cr = new THREE.Group(); cr.position.set(-0.55 + c * 0.62, 0.18, -0.4 + r * 0.7); g.add(cr);
      if (L.candy) { mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.36, 4), std('#ffffff'), 0, 0.18, 0, cr); mesh(cropG, cropM, 0, 0.42, 0, cr).scale.z = 0.4; }
      else { mesh(cropG, cropM, 0, 0.21, 0, cr); mesh(cropG, cropM, 0.1, 0.16, 0.05, cr).scale.setScalar(0.7); }
      this.crops.push(cr);
    }
    const barn = new THREE.Group(); barn.position.set(-1.25, 0, -0.6); g.add(barn);
    mesh(new THREE.BoxGeometry(1.1, 0.85, 0.95), std(L.barn), 0, 0.43, 0, barn);
    const roof = mesh(new THREE.ConeGeometry(0.82, 0.55, 4), new THREE.MeshPhysicalMaterial({ color: L.roof, roughness: 0.35, clearcoat: 0.5 }), 0, 1.13, 0, barn); roof.rotation.y = Math.PI / 4; roof.scale.z = 0.85;
    mesh(new THREE.BoxGeometry(0.42, 0.55, 0.04), std('#ffffff'), 0, 0.3, 0.49, barn);
    mesh(new THREE.BoxGeometry(0.36, 0.48, 0.05), std(L.gold ? '#b07a00' : '#7a2a1a'), 0, 0.27, 0.5, barn);
    // fence posts
    for (let i = 0; i < 7; i++) mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.32, 5), L.candy ? new THREE.MeshPhysicalMaterial({ color: i % 2 ? '#ff4d6d' : '#ffffff', roughness: 0.3, clearcoat: 1 }) : std(L.fence), -0.85 + i * 0.4, 0.16, 1.45, g);
    const rail = mesh(new THREE.BoxGeometry(2.5, 0.04, 0.04), std(L.fence), 0.35, 0.24, 1.45, g); void rail;
    this.coinFx = [];
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.skin = 1; this.t = Math.random() * 10; this.bounce = 0; this.mill = null;
  }
  setSkin(n) {
    if (n <= this.skin) return;
    const L = this.look;
    if (n >= 2 && this.skin < 2) {
      const silo = new THREE.Group(); silo.position.set(1.65, 0, -0.8); this.root.add(silo);
      mesh(new THREE.CylinderGeometry(0.34, 0.34, 1.5, 16), std(L.gold ? '#ffe9a8' : '#cfd6de', { metal: 0.3, rough: 0.4 }), 0, 0.75, 0, silo);
      mesh(new THREE.SphereGeometry(0.34, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: L.roof, roughness: 0.3, clearcoat: 0.6 }), 0, 1.5, 0, silo);
      for (let i = 0; i < 3; i++) mesh(new THREE.TorusGeometry(0.35, 0.025, 6, 20), darkMetal(), 0, 0.3 + i * 0.45, 0, silo).rotation.x = Math.PI / 2;
    }
    if (n >= 3 && this.skin < 3) {
      const mill = new THREE.Group(); mill.position.set(-1.3, 0, 0.9); this.root.add(mill);
      mesh(new THREE.CylinderGeometry(0.22, 0.32, 1.9, 8), std('#fff1d6'), 0, 0.95, 0, mill);
      mesh(new THREE.ConeGeometry(0.34, 0.4, 8), std(L.roof), 0, 2.08, 0, mill);
      const blades = new THREE.Group(); blades.position.set(0, 1.75, 0.3); mill.add(blades);
      for (let k = 0; k < 4; k++) { const piv = new THREE.Group(); piv.rotation.z = k * Math.PI / 2; blades.add(piv); mesh(new THREE.BoxGeometry(0.16, 0.95, 0.03), std(k % 2 ? '#ffd23f' : '#ffffff'), 0, 0.5, 0, piv); }
      this.mill = blades;
      const glow = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.05, 6, 48), new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.rotation.x = Math.PI / 2; glow.position.y = 0.1; this.root.add(glow); this.glow = glow;
      this.crops.forEach(c => c.scale.setScalar(1.35));
    }
    this.root.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
    this.skin = n;
  }
  pop() { this.bounce = 1; }
  update(dt) {
    this.t += dt;
    this.crops.forEach((c, i) => { c.rotation.z = Math.sin(this.t * 2 + i) * 0.12; });
    if (this.mill) this.mill.rotation.z += dt * 2.5;
    if (this.glow) this.glow.material.opacity = 0.35 + Math.sin(this.t * 3) * 0.2;
    if (this.bounce > 0) { this.bounce = Math.max(0, this.bounce - dt * 3); const s = 1 + Math.sin(this.bounce * Math.PI) * 0.08; this.root.scale.set(s, 2 - s, s); }
  }
}

// ---------- dances for the lobby ----------
export const DANCES = ['hop', 'spin', 'wave', 'sway', 'jacks', 'twist', 'disco', 'bounce'];
export function dance(b, dt, style, lookY = 0) {
  b.t += dt;
  const t = b.t, P = b.pivot;
  let armL = 0, armR = 0, armZ = 0.2, legL = 0, legR = 0, bob = 0, rotY = lookY, rotZ = 0, lean = 0;
  switch (style) {
    case 'hop': { const h = Math.abs(Math.sin(t * 5)); bob = h * 0.5; armL = armR = -2.6 - Math.sin(t * 10) * 0.3; armZ = 0.5; legL = legR = h > 0.3 ? -0.5 * h : 0; break; }
    case 'spin': rotY = t * 4; armZ = 1.35; bob = Math.abs(Math.sin(t * 8)) * 0.08; legL = Math.sin(t * 8) * 0.4; legR = -legL; break;
    case 'wave': armR = -2.9 + Math.sin(t * 9) * 0.35; armZ = 0.35 + Math.sin(t * 9) * 0.25; armL = Math.sin(t * 3) * 0.3; rotZ = Math.sin(t * 3) * 0.12; bob = Math.abs(Math.sin(t * 3)) * 0.06; break;
    case 'sway': rotZ = Math.sin(t * 3.2) * 0.28; armL = Math.sin(t * 3.2) * 0.9; armR = -armL; armZ = 0.5; bob = Math.abs(Math.cos(t * 3.2)) * 0.08; legL = Math.sin(t * 3.2) * 0.3; legR = -legL; break;
    case 'jacks': { const k = (Math.sin(t * 7) + 1) / 2; armZ = 0.2 + 2.6 * k; bob = k * 0.25; legL = -0.25 * k; legR = 0.25 * k; break; }
    case 'twist': rotY = lookY + Math.sin(t * 6) * 0.8; armL = -1.4 + Math.sin(t * 6) * 0.4; armR = -1.4 - Math.sin(t * 6) * 0.4; armZ = 0.9; legL = Math.sin(t * 12) * 0.35; legR = -legL; bob = Math.abs(Math.sin(t * 6)) * 0.07; break;
    case 'disco': { const up = Math.sin(t * 4) > 0; armR = up ? -2.8 : -0.4; armL = up ? -0.4 : -2.8; armZ = up ? 0.9 : 0.3; rotY = lookY + (up ? 0.4 : -0.4); lean = 0.12; bob = Math.abs(Math.sin(t * 8)) * 0.1; legL = up ? 0.3 : 0; legR = up ? 0 : 0.3; break; }
    default: { const h = Math.abs(Math.sin(t * 7)); bob = h * 0.18; armL = -0.8 - h; armR = -0.8 - h; armZ = 0.7; rotZ = Math.sin(t * 3.5) * 0.1; }
  }
  P.position.y = 0.72 + bob;
  P.rotation.set(lean, rotY, rotZ);
  b.applyLimbs(dt, armL, armR, armZ, legL, legR, 16);
  b.blinkT -= dt; const blink = b.blinkT < 0.12 ? 0.1 : 1; if (b.blinkT < 0) b.blinkT = 2 + Math.random() * 3;
  b.eyes.forEach(e => { e.scale.y = blink * (e.userData.sy || 1); });
  for (const f of b.extra) f(dt, t, {});
}
