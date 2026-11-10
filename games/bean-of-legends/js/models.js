// 3D models: costumed beans (heroes), minions, jungle monsters, the dragon, the Mega Bean, towers and cores.
// Everything is built from simple shapes and animated by code, so nothing has to be downloaded.
import { THREE, M, canvasTex, damp, clamp } from './engine.js';

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
    this.patterned = PATTERNED.has(costume);
    if (this.patterned) { this.bodyMat.map = patternTex(costume, this.c1, this.c2); this.bodyMat.color.set('#ffffff'); }
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
  setColors(c1, c2) { this.c1 = c1; this.c2 = c2; if (this.patterned) { this.bodyMat.map = patternTex(this.costume, c1, c2); this.bodyMat.needsUpdate = true; } else this.bodyMat.color.set(c1); this.accMat.color.set(c2); this.limbMat.color.copy(shade(c1, -0.08)); }
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

// ---------- costumes ----------
const metal = () => std('#d5dbe3', { metal: 0.7, rough: 0.22 });
const darkMetal = () => std('#6c757d', { metal: 0.7, rough: 0.3 });
const gold = () => std('#ffd23f', { metal: 0.65, rough: 0.28, emissive: '#5a3d00', ei: 0.4 });
const glowM = (c, ei = 2) => std(c, { emissive: c, ei });
// body patterns drawn on the capsule (u goes around the body, the front is at u = 0/1; v goes from the feet up)
const PATTERN_CACHE = new Map();
function patternTex(kind, c1, c2) {
  const key = kind + c1 + c2;
  if (PATTERN_CACHE.has(key)) return PATTERN_CACHE.get(key);
  const t = canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = c1; g.fillRect(0, 0, w, h);
    const front = (fn) => { fn(0); fn(w); };      // draw things that wrap around the front seam
    if (kind === 'dino') { g.fillStyle = shade(c1, -0.12).getStyle(); for (let i = 0; i < 26; i++) { const x = 30 + (i * 37) % 200, y = 18 + (i * 23) % 70; g.beginPath(); g.ellipse(x, y, 8 + (i % 3) * 3, 6 + (i % 2) * 3, 0, 0, 7); g.fill(); } front(x0 => { g.fillStyle = shade(c2, 0.25).getStyle(); g.beginPath(); g.ellipse(x0, h * 0.45, 40, 34, 0, 0, 7); g.fill(); }); }
    else if (kind === 'shark') { front(x0 => { g.fillStyle = '#f8f9fa'; g.beginPath(); g.ellipse(x0, h * 0.4, 46, 42, 0, 0, 7); g.fill(); }); g.fillStyle = shade(c1, -0.1).getStyle(); g.fillRect(100, 0, 56, h); }
    else if (kind === 'astro') { g.fillStyle = c2; g.fillRect(0, h * 0.28, w, 9); g.fillRect(0, h * 0.62, w, 6); g.fillStyle = shade(c1, -0.08).getStyle(); for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 2, h); }
    else if (kind === 'banana') { g.fillStyle = '#5c4033'; g.fillRect(0, 0, w, 8); g.fillStyle = 'rgba(92,64,51,.45)'; for (let i = 0; i < 40; i++) { g.beginPath(); g.arc((i * 53) % w, 12 + (i * 29) % 100, 1.5 + (i % 3), 0, 7); g.fill(); } g.strokeStyle = shade(c1, -0.12).getStyle(); g.lineWidth = 3; for (let x = 32; x < w; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } }
    else if (kind === 'wizard') { g.fillStyle = c2; for (let i = 0; i < 22; i++) { const x = (i * 47) % w, y = 10 + (i * 31) % 100, r = 4 + (i % 3) * 2; g.beginPath(); for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5 - Math.PI / 2, rr = k % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.fill(); } g.fillStyle = shade(c1, -0.15).getStyle(); g.fillRect(0, 0, w, 14); }
    else if (kind === 'robot') { g.strokeStyle = shade(c1, -0.25).getStyle(); g.lineWidth = 2; for (let y = 20; y < h; y += 34) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } for (let x = 16; x < w; x += 48) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } g.fillStyle = shade(c1, 0.2).getStyle(); for (let x = 8; x < w; x += 24) for (let y = 12; y < h; y += 34) { g.beginPath(); g.arc(x, y, 2, 0, 7); g.fill(); } }
    else if (kind === 'pigeon') { front(x0 => { g.fillStyle = shade(c1, 0.14).getStyle(); g.beginPath(); g.ellipse(x0, h * 0.42, 52, 46, 0, 0, 7); g.fill(); }); g.fillStyle = shade(c1, -0.18).getStyle(); for (const x of [96, 160]) { g.fillRect(x, h * 0.45, 26, 6); g.fillRect(x, h * 0.55, 26, 6); } }
    else if (kind === 'ninja') { g.strokeStyle = shade(c1, 0.08).getStyle(); g.lineWidth = 3; for (let i = -h; i < w; i += 22) { g.beginPath(); g.moveTo(i, h); g.lineTo(i + h * 0.6, 0); g.stroke(); } }
    else if (kind === 'hotdog') { g.strokeStyle = shade(c1, -0.25).getStyle(); g.lineWidth = 5; for (let i = 0; i < w; i += 40) { g.beginPath(); g.moveTo(i, 20); g.lineTo(i + 30, 100); g.stroke(); } }
  });
  PATTERN_CACHE.set(key, t);
  return t;
}
const PATTERNED = new Set(['dino', 'shark', 'astro', 'banana', 'wizard', 'robot', 'pigeon', 'ninja', 'hotdog']);

const COSTUMES = {
  knight(b) {
    const steel = metal(), trim = gold();
    // helmet that sits above the eyes, with a raised visor and cheek guards
    mesh(new THREE.SphereGeometry(0.5, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.4), steel, 0, 0.25, 0, b.pivot);
    const brow = mesh(new THREE.CylinderGeometry(0.505, 0.505, 0.07, 30, 1, true, -Math.PI * 0.55, Math.PI * 1.1), trim, 0, 0.42, 0, b.pivot); brow.material.side = THREE.DoubleSide;
    mesh(new THREE.SphereGeometry(0.53, 24, 6, Math.PI * 0.15, Math.PI * 0.7, Math.PI * 0.2, Math.PI * 0.1), darkMetal(), 0, 0.25, 0, b.pivot);
    for (const s of [-1, 1]) { const ch = mesh(new THREE.BoxGeometry(0.06, 0.3, 0.22), steel, 0.46 * s, 0.3, 0.1, b.pivot); ch.rotation.y = 0.5 * s; }
    for (let i = 0; i < 3; i++) { const pl = mesh(new THREE.SphereGeometry(0.14 - i * 0.02, 10, 8), b.accMat, 0, 0.18 + i * 0.08, -0.08 - i * 0.12, b.top); pl.scale.set(0.7, 1, 1.5); }
    // breastplate, emblem, belt, pauldrons, cape
    const plate = mesh(new THREE.CylinderGeometry(0.47, 0.5, 0.36, 28, 1, true, -Math.PI * 0.55, Math.PI * 1.1), steel, 0, -0.21, 0, b.pivot); plate.material.side = THREE.DoubleSide;
    const em = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 5), trim, 0, -0.18, 0.49, b.pivot); em.rotation.x = Math.PI / 2;
    mesh(new THREE.TorusGeometry(0.49, 0.045, 8, 32), b.accMat, 0, -0.37, 0, b.pivot).rotation.x = Math.PI / 2;
    for (const a of b.arms) { const pd = mesh(new THREE.SphereGeometry(0.17, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), steel, 0, 0.02, 0, a); pd.scale.set(1.1, 0.9, 1.1); }
    const cape = mesh(new THREE.CylinderGeometry(0.5, 0.62, 0.95, 20, 3, true, Math.PI * 0.62, Math.PI * 0.76), std(shade(b.c2, -0.05).getStyle(), { double: true, rough: 0.6 }), 0, -0.1, -0.02, b.pivot);
    b.extra.push((dt, t, st) => { cape.rotation.x = -0.12 - Math.min(0.5, (st.speed || 0) * 0.05) + Math.sin(t * 3) * 0.03; });
    // sword
    const bladeG = new THREE.CylinderGeometry(0.02, 0.07, 1.15, 4); bladeG.scale(1, 1, 0.35);
    mesh(bladeG, std('#eef1f4', { metal: 0.8, rough: 0.15 }), 0, 0.62, 0.05, b.hand);
    mesh(new THREE.BoxGeometry(0.44, 0.07, 0.1), trim, 0, 0.04, 0.05, b.hand);
    mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.24, 6), std('#5c3a21'), 0, -0.1, 0.05, b.hand);
    mesh(new THREE.SphereGeometry(0.06, 8, 6), glowM('#ff4d6d', 0.6), 0, -0.24, 0.05, b.hand);
    b.hand.rotation.x = Math.PI / 2;
    // round shield with rim and emblem
    const sh = mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.07, 24), b.accMat, 0, 0, 0.12, b.offHand); sh.rotation.x = Math.PI / 2;
    const rim = mesh(new THREE.TorusGeometry(0.36, 0.035, 6, 24), trim, 0, 0, 0.16, b.offHand); void rim;
    const em2 = mesh(new THREE.OctahedronGeometry(0.12), trim, 0, 0, 0.18, b.offHand); em2.scale.z = 0.4;
    b.offHand.rotation.y = -0.6;
  },
  ninja(b) {
    const cloth = std(shade(b.c1, 0.02).getStyle(), { rough: 0.7 });
    mesh(new THREE.SphereGeometry(0.48, 26, 14, 0, Math.PI * 2, 0, Math.PI * 0.4), cloth, 0, 0.25, 0, b.pivot);
    // mask over the mouth only: the eyes stay visible
    const mask = mesh(new THREE.CylinderGeometry(0.465, 0.47, 0.17, 28, 1, true, -Math.PI * 0.6, Math.PI * 1.2), cloth, 0, -0.07, 0, b.pivot); mask.material.side = THREE.DoubleSide;
    b.mouth.visible = false;
    const band = mesh(new THREE.TorusGeometry(0.48, 0.05, 8, 30), b.accMat, 0, 0.42, 0, b.pivot); band.rotation.x = Math.PI / 2;
    mesh(new THREE.BoxGeometry(0.2, 0.1, 0.03), metal(), 0, 0.42, 0.48, b.pivot);
    const tails = new THREE.Group(); tails.position.set(0, 0.42, -0.46); b.pivot.add(tails);
    for (const s of [-1, 1]) { const t = mesh(new THREE.BoxGeometry(0.1, 0.5, 0.03), b.accMat, 0.08 * s, -0.22, 0, tails); t.rotation.z = 0.3 * s; }
    b.extra.push((dt, t, st) => { tails.rotation.x = 0.7 + Math.sin(t * 10) * 0.25 + Math.min(0.8, (st.speed || 0) * 0.09); });
    mesh(new THREE.TorusGeometry(0.47, 0.06, 8, 30), b.accMat, 0, -0.32, 0, b.pivot).rotation.x = Math.PI / 2;
    mesh(new THREE.SphereGeometry(0.08, 8, 6), b.accMat, 0.25, -0.32, 0.4, b.pivot);
    for (const a of b.arms) for (const y of [-0.12, -0.24]) mesh(new THREE.TorusGeometry(0.115, 0.02, 6, 14), std('#e9ecef'), 0, y, 0, a).rotation.x = Math.PI / 2;
    const katana = new THREE.Group(); katana.position.set(0.05, 0.15, -0.08); katana.rotation.z = 0.75; b.back.add(katana);
    mesh(new THREE.BoxGeometry(0.06, 1.0, 0.03), metal(), 0, 0.25, 0, katana); mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.32, 6), b.accMat, 0, -0.38, 0, katana); mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 10), gold(), 0, -0.22, 0, katana);
    mesh(new THREE.ConeGeometry(0.07, 0.42, 4), metal(), 0, 0.22, 0.05, b.hand); b.hand.rotation.x = Math.PI / 2;
  },
  dino(b) {
    const skin = b.bodyMat;
    // kigurumi hood: the dino head sits on top, our bean face peeks out underneath
    const hood = mesh(new THREE.SphereGeometry(0.52, 26, 14, 0, Math.PI * 2, 0, Math.PI * 0.4), skin, 0, 0.25, 0, b.pivot); void hood;
    const snout = mesh(new THREE.SphereGeometry(0.3, 18, 12), skin, 0, 0.56, 0.36, b.pivot); snout.scale.set(1.15, 0.6, 1.1);
    for (let i = 0; i < 7; i++) { const a = -0.6 + i * 0.2; const tooth = mesh(new THREE.ConeGeometry(0.035, 0.1, 4), WHITE, Math.sin(a) * 0.3, 0.42, 0.4 + Math.cos(a) * 0.17, b.pivot); tooth.rotation.x = Math.PI; }
    for (const s of [-1, 1]) { mesh(DOT, BLACK, 0.09 * s, 0.62, 0.67, b.pivot).scale.setScalar(0.035); const he = mesh(EYE, WHITE, 0.2 * s, 0.74, 0.22, b.pivot); he.scale.setScalar(0.6); mesh(IRIS_G, IRIS, 0.2 * s, 0.75, 0.27, b.pivot).scale.setScalar(0.5); }
    for (let i = 0; i < 6; i++) { const sp = mesh(new THREE.ConeGeometry(0.11 - i * 0.008, 0.26, 4), b.accMat, 0, 0.42 - i * 0.2, -0.42 + i * 0.015, b.pivot); sp.rotation.x = -0.5 - i * 0.16; }
    const tail = new THREE.Group(); tail.position.set(0, -0.35, -0.36); b.pivot.add(tail);
    const t1 = mesh(new THREE.ConeGeometry(0.24, 1.0, 12), skin, 0, 0, -0.45, tail); t1.rotation.x = -Math.PI / 2 - 0.3;
    for (let i = 0; i < 3; i++) { const ts = mesh(new THREE.ConeGeometry(0.06, 0.16, 4), b.accMat, 0, 0.14 - i * 0.05, -0.3 - i * 0.22, tail); ts.rotation.x = -0.4; }
    b.extra.push((dt, t, st) => { tail.rotation.y = Math.sin(t * 6) * 0.35 * (0.4 + Math.min(1, (st.speed || 0) / 7)); });
    for (const a of b.arms) for (const k of [-1, 0, 1]) { const cl = mesh(new THREE.ConeGeometry(0.025, 0.09, 4), WHITE, k * 0.05, -0.42, 0.06, a); cl.rotation.x = 0.4; }
  },
  shark(b) {
    const skin = b.bodyMat;
    const hood = mesh(new THREE.SphereGeometry(0.51, 26, 14, 0, Math.PI * 2, 0, Math.PI * 0.4), skin, 0, 0.25, 0, b.pivot); hood.scale.set(1, 1, 1.06);
    for (let i = 0; i < 11; i++) { const a = -1.0 + i * 0.2; const tooth = mesh(new THREE.ConeGeometry(0.035, 0.1, 4), WHITE, Math.sin(a) * 0.48, 0.4, Math.cos(a) * 0.5, b.pivot); tooth.rotation.x = Math.PI; }
    const fin = mesh(new THREE.ConeGeometry(0.26, 0.62, 4), skin, 0, 0.95, -0.1, b.pivot); fin.scale.set(0.35, 1, 1.3); fin.rotation.x = -0.35;
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { const gl = mesh(new THREE.BoxGeometry(0.02, 0.13, 0.02), std(shade(b.c1, -0.3).getStyle()), 0.42 * s, 0.05 - k * 0.07, 0.18 + k * 0.03, b.pivot); gl.rotation.z = 0.3 * s; }
    b.hands.forEach(h => { h.visible = false; });
    for (const a of b.arms) { a.userData.m.visible = false; const f = mesh(new THREE.ConeGeometry(0.16, 0.5, 4), skin, 0, -0.22, 0, a); f.scale.set(0.35, 1, 1); f.rotation.x = Math.PI; }
    const tail = new THREE.Group(); tail.position.set(0, -0.3, -0.42); b.pivot.add(tail);
    const tf = mesh(new THREE.ConeGeometry(0.28, 0.55, 4), skin, 0, 0.12, -0.2, tail); tf.scale.set(0.3, 1, 1); tf.rotation.x = -1;
    b.extra.push((dt, t) => { tail.rotation.y = Math.sin(t * 8) * 0.4; });
  },
  astro(b) {
    const glass = mesh(new THREE.SphereGeometry(0.6, 28, 20), new THREE.MeshPhysicalMaterial({ color: '#cdeeff', transparent: true, opacity: 0.22, roughness: 0.02, metalness: 0, clearcoat: 1, transmission: 0 }), 0, 0.24, 0.02, b.pivot); glass.castShadow = false;
    mesh(new THREE.TorusGeometry(0.5, 0.07, 10, 32), metal(), 0, -0.1, 0, b.pivot).rotation.x = Math.PI / 2;
    const panel = mesh(new THREE.BoxGeometry(0.34, 0.2, 0.06), std('#e9ecef'), 0, -0.26, 0.45, b.pivot); void panel;
    ['#ff4d6d', '#ffd23f', '#7bd389'].forEach((c, i) => mesh(DOT, glowM(c, 1.5), -0.09 + i * 0.09, -0.24, 0.49, b.pivot).scale.setScalar(0.03));
    mesh(new THREE.BoxGeometry(0.56, 0.62, 0.26), std('#f1f3f5'), 0, 0, -0.04, b.back);
    for (const s of [-1, 1]) { mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 10), b.accMat, 0.17 * s, 0, -0.18, b.back); mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.1, 8), darkMetal(), 0.17 * s, -0.3, -0.18, b.back); }
    mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.36, 4), metal(), 0.28, 0.6, -0.1, b.pivot);
    const tip = mesh(DOT, glowM('#ff4d6d', 1.5), 0.28, 0.8, -0.1, b.pivot); tip.scale.setScalar(0.05);
    b.extra.push((dt, t) => { tip.material.emissiveIntensity = 0.8 + (Math.sin(t * 5) > 0 ? 1.5 : 0); });
    for (const l of b.legs) mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.14, 12), std('#f1f3f5'), 0, -0.22, 0.02, l);
    mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.4, 8), b.accMat, 0, 0.12, 0.05, b.hand); b.hand.rotation.x = Math.PI / 2;
    mesh(DOT, glowM('#7df9ff', 2), 0, 0.34, 0.05, b.hand).scale.setScalar(0.07);
  },
  hotdog(b) {
    const bunMat = std('#f2c27e', { rough: 0.75 }), seed = std('#fff8e7');
    for (const s of [-1, 1]) {
      const bun = mesh(new THREE.CapsuleGeometry(0.22, 0.6, 6, 14), bunMat, 0.43 * s, -0.04, -0.08, b.pivot); bun.scale.set(1, 1, 1.5);
      for (let i = 0; i < 5; i++) mesh(DOT, seed, 0.47 * s + s * 0.12, 0.25 - i * 0.12, -0.05 + (i % 2) * 0.12, b.pivot).scale.set(0.025, 0.04, 0.02);
    }
    const back = mesh(new THREE.CapsuleGeometry(0.24, 0.55, 6, 14), bunMat, 0, -0.08, -0.36, b.pivot); back.scale.set(1.9, 1, 0.8);
    const curve = new THREE.CatmullRomCurve3([V(-0.2, -0.12, 0.43), V(-0.1, -0.22, 0.46), V(0, -0.14, 0.47), V(0.1, -0.24, 0.46), V(0.2, -0.15, 0.43), V(0.26, -0.26, 0.38)]);
    mesh(new THREE.TubeGeometry(curve, 30, 0.045, 8), std('#ffd23f', { rough: 0.3 }), 0, 0, 0, b.pivot);
    // a little chef hat
    mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.2, 16), WHITE, 0, 0.1, 0, b.top);
    for (const [x, z] of [[0, 0], [0.12, 0.05], [-0.12, 0.05], [0, -0.1]]) mesh(new THREE.SphereGeometry(0.15, 12, 10), WHITE, x, 0.25, z, b.top);
    mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.42, 12), std('#e53935', { rough: 0.3 }), 0, 0.1, 0.05, b.hand); b.hand.rotation.x = Math.PI / 2;
    mesh(new THREE.ConeGeometry(0.06, 0.16, 8), WHITE, 0, 0.38, 0.05, b.hand);
  },
  pigeon(b) {
    const beak = mesh(new THREE.ConeGeometry(0.1, 0.26, 10), std('#ffb703'), 0, 0.1, 0.5, b.pivot); beak.rotation.x = Math.PI / 2;
    mesh(new THREE.SphereGeometry(0.07, 8, 6), std('#fff3e0'), 0, 0.16, 0.46, b.pivot).scale.set(1.3, 0.6, 1);
    for (const e of b.eyes) { const ring = mesh(new THREE.TorusGeometry(0.135, 0.03, 6, 18), std('#ff8c42'), 0, 0, 0.02, e); ring.scale.set(1, 1.15, 1); }
    const neck = mesh(new THREE.TorusGeometry(0.46, 0.09, 10, 30), new THREE.MeshPhysicalMaterial({ color: '#6a4bd6', metalness: 0.5, roughness: 0.2, iridescence: 1, iridescenceIOR: 1.6, emissive: '#2ec4b6', emissiveIntensity: 0.15 }), 0, -0.04, 0, b.pivot); neck.rotation.x = Math.PI / 2;
    b.hands.forEach(h => { h.visible = false; });
    for (const a of b.arms) { a.userData.m.visible = false; for (let k = 0; k < 3; k++) { const w = mesh(new THREE.SphereGeometry(0.3 - k * 0.05, 12, 8), k % 2 ? b.limbMat : std(shade(b.c1, -0.16).getStyle()), 0, -0.22 - k * 0.07, -0.05 - k * 0.04, a); w.scale.set(0.24, 1, 0.75); } }
    const tuft = mesh(new THREE.ConeGeometry(0.08, 0.24, 6), b.accMat, 0, 0.06, -0.06, b.top); tuft.rotation.x = -0.4;
    const tail = new THREE.Group(); tail.position.set(0, -0.33, -0.42); b.pivot.add(tail);
    for (const k of [-1, 0, 1]) { const f = mesh(new THREE.SphereGeometry(0.22, 10, 6), std(shade(b.c1, -0.12).getStyle()), k * 0.12, 0, -0.18, tail); f.scale.set(0.35, 0.12, 1); f.rotation.y = k * 0.35; }
    b.extra.push((dt, t) => { tail.rotation.x = Math.sin(t * 4) * 0.12; });
    for (const l of b.legs) { mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.18, 5), std('#ff8c42'), 0, -0.18, 0, l); for (const k of [-1, 0, 1]) { const toe = mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.14, 5), std('#ff8c42'), k * 0.05, -0.28, 0.06, l); toe.rotation.x = Math.PI / 2; toe.rotation.z = k * 0.4; } }
  },
  banana(b) {
    const stem = mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.3, 8), std('#5c4033'), 0, 0.12, 0, b.top); stem.rotation.z = 0.25;
    const peels = new THREE.Group(); peels.position.y = -0.38; b.pivot.add(peels);
    const inner = std('#fff3b0', { double: true, rough: 0.6 });
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group(); g.rotation.y = i / 4 * Math.PI * 2 + 0.4; peels.add(g);
      const p = mesh(new THREE.SphereGeometry(0.32, 14, 8, 0, Math.PI), std(shade(b.c1, -0.04).getStyle(), { double: true }), 0, -0.05, 0.43, g); p.scale.set(0.7, 1.35, 0.35); p.rotation.x = 0.7;
      const pi = mesh(new THREE.SphereGeometry(0.28, 12, 8, 0, Math.PI), inner, 0, -0.04, 0.44, g); pi.scale.set(0.6, 1.2, 0.3); pi.rotation.x = 0.7;
      const tip = mesh(DOT, std('#5c4033'), 0, -0.36, 0.62, g); tip.scale.setScalar(0.05);
    }
    b.extra.push((dt, t, st) => { peels.rotation.y = Math.sin(t * 3) * 0.15; peels.children.forEach((g, i) => { g.children[0].rotation.x = 0.7 + Math.sin(t * 6 + i) * 0.08 * (1 + (st.speed || 0) * 0.1); }); });
    const leaf = mesh(new THREE.SphereGeometry(0.12, 8, 6), std('#7bd389'), 0.08, 0.26, 0, b.top); leaf.scale.set(1.2, 0.3, 0.6);
  },
  wizard(b) {
    const hat = new THREE.Group(); hat.position.y = -0.17; b.top.add(hat);
    mesh(new THREE.CylinderGeometry(0.62, 0.66, 0.06, 32), b.bodyMat, 0, 0, 0, hat);
    const cone1 = mesh(new THREE.ConeGeometry(0.4, 0.62, 24, 1, true), b.bodyMat, 0, 0.32, 0, hat); cone1.material.side = THREE.DoubleSide;
    const tip = new THREE.Group(); tip.position.set(0, 0.6, 0); hat.add(tip);
    const cone2 = mesh(new THREE.ConeGeometry(0.2, 0.5, 18), b.bodyMat, 0.08, 0.2, 0, tip); cone2.rotation.z = -0.5;
    mesh(new THREE.TorusGeometry(0.38, 0.05, 8, 28), b.accMat, 0, 0.06, 0, hat).rotation.x = Math.PI / 2;
    const bell = mesh(new THREE.OctahedronGeometry(0.07), gold(), 0.32, 0.4, 0, tip); void bell;
    for (let i = 0; i < 5; i++) { const s = mesh(new THREE.OctahedronGeometry(0.055), gold(), Math.sin(i * 1.7) * 0.28, 0.12 + i * 0.09, Math.cos(i * 1.7) * 0.28, hat); s.scale.y = 1.5; }
    b.extra.push((dt, t) => { tip.rotation.z = Math.sin(t * 2) * 0.12; });
    const beard = mesh(new THREE.ConeGeometry(0.3, 0.66, 16), WHITE, 0, -0.24, 0.32, b.pivot); beard.rotation.x = Math.PI + 0.28;
    for (const s of [-1, 1]) { const mu = mesh(new THREE.SphereGeometry(0.1, 10, 8), WHITE, 0.09 * s, 0.03, 0.43, b.pivot); mu.scale.set(1.3, 0.6, 0.8); const brow = mesh(new THREE.SphereGeometry(0.07, 8, 6), WHITE, 0.16 * s, 0.38, 0.4, b.pivot); brow.scale.set(1.6, 0.5, 0.6); }
    b.mouth.visible = false;
    const cape = mesh(new THREE.CylinderGeometry(0.5, 0.64, 0.95, 20, 2, true, Math.PI * 0.6, Math.PI * 0.8), std(b.c2, { double: true, rough: 0.6 }), 0, -0.1, -0.02, b.pivot); void cape;
    const staff = mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.35, 6), std('#7a4a2a'), 0, 0.3, 0.05, b.hand); b.hand.rotation.x = 0.15; b.hand.position.x = 0.06; void staff;
    mesh(new THREE.TorusGeometry(0.1, 0.035, 6, 14), gold(), 0, 0.92, 0.05, b.hand).rotation.x = Math.PI / 2;
    const orb = mesh(new THREE.SphereGeometry(0.13, 16, 12), glowM('#c77dff', 2.2), 0, 1.06, 0.05, b.hand);
    const halo = mesh(new THREE.TorusGeometry(0.19, 0.015, 6, 20), glowM('#ffd23f', 2), 0, 1.06, 0.05, b.hand); halo.castShadow = false;
    b.extra.push((dt, t) => { orb.scale.setScalar(1 + Math.sin(t * 5) * 0.15); halo.rotation.x = t * 2; halo.rotation.y = t * 1.3; });
  },
  robot(b) {
    b.bodyMat.metalness = 0.6; b.bodyMat.roughness = 0.28;
    // see-through visor so the eyes still show
    const visor = mesh(new THREE.SphereGeometry(0.49, 24, 10, Math.PI * 0.08, Math.PI * 0.84, Math.PI * 0.3, Math.PI * 0.28), new THREE.MeshPhysicalMaterial({ color: '#2a1f5c', transparent: true, opacity: 0.3, roughness: 0.05, clearcoat: 1, side: THREE.DoubleSide }), 0, 0.15, 0, b.pivot); visor.castShadow = false;
    const vrim = mesh(new THREE.CylinderGeometry(0.495, 0.495, 0.035, 30, 1, true, -Math.PI * 0.42, Math.PI * 0.84), glowM('#00e5ff', 1.4), 0, 0.44, 0, b.pivot); vrim.material.side = THREE.DoubleSide; vrim.castShadow = false;
    mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 4), metal(), 0, 0.16, 0, b.top);
    const bulb = mesh(DOT, glowM('#00e5ff', 2), 0, 0.34, 0, b.top); bulb.scale.setScalar(0.07);
    b.extra.push((dt, t) => { bulb.material.emissiveIntensity = 1 + Math.sin(t * 6) * 1; });
    for (const s of [-1, 1]) { const bolt = mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.08, 10), metal(), 0.46 * s, 0.22, 0, b.pivot); bolt.rotation.z = Math.PI / 2; mesh(new THREE.BoxGeometry(0.2, 0.08, 0.24), darkMetal(), 0.47 * s, 0.1, 0, b.pivot); }
    mesh(new THREE.BoxGeometry(0.36, 0.24, 0.05), b.accMat, 0, -0.18, 0.45, b.pivot);
    ['#ff4d6d', '#ffd23f', '#7bd389'].forEach((c, i) => mesh(DOT, glowM(c, 1.2), -0.1 + i * 0.1, -0.18, 0.48, b.pivot).scale.setScalar(0.032));
    for (const l of b.legs) mesh(new THREE.BoxGeometry(0.24, 0.12, 0.3), darkMetal(), 0, -0.22, 0.03, l);
    mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.42, 10), metal(), 0, 0.1, 0.05, b.hand); b.hand.rotation.x = Math.PI / 2;
    mesh(new THREE.TorusGeometry(0.1, 0.02, 6, 14), glowM('#00e5ff', 2), 0, 0.31, 0.05, b.hand).rotation.x = Math.PI / 2;
  },
  boss(b) {
    const crown = new THREE.Group(); crown.position.y = -0.05; b.top.add(crown);
    mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.18, 10, 1, true), gold(), 0, 0, 0, crown);
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; mesh(new THREE.ConeGeometry(0.06, 0.16, 6), gold(), Math.cos(a) * 0.3, 0.16, Math.sin(a) * 0.3, crown); }
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; mesh(new THREE.OctahedronGeometry(0.04), glowM(['#ff4d6d', '#3a86ff', '#7bd389', '#c77dff'][i], 1), Math.cos(a) * 0.31, 0.02, Math.sin(a) * 0.31, crown); }
    for (const s of [-1, 1]) { const brow = mesh(new THREE.BoxGeometry(0.22, 0.05, 0.05), BLACK, 0.16 * s, 0.38, 0.42, b.pivot); brow.rotation.z = -0.35 * s; }
    const cape = mesh(new THREE.SphereGeometry(0.5, 16, 10, Math.PI * 0.6, Math.PI * 0.8), std('#c62828', { double: true }), 0, 0.05, -0.02, b.pivot); cape.scale.set(1.05, 1.3, 1.05);
    mesh(new THREE.TorusGeometry(0.49, 0.06, 8, 30), gold(), 0, -0.3, 0, b.pivot).rotation.x = Math.PI / 2;
  }
};

// ---------- minions ----------
// A lighter bean (fewer parts, only the body casts a shadow) because there can be 100+ minions.
const MINI_BODY = new THREE.CapsuleGeometry(0.45, 0.4, 6, 14), MINI_HELM = new THREE.SphereGeometry(0.48, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.45);
const MINI_EYE = new THREE.SphereGeometry(0.12, 10, 8), MINI_IRIS = new THREE.SphereGeometry(0.085, 8, 6);
const MINI_MATS = {};
function miniMats(team) {
  if (MINI_MATS[team]) return MINI_MATS[team];
  const tc = team === 0 ? '#3a86ff' : '#ff4d6d', light = team === 0 ? '#bcd7ff' : '#ffc7d1';
  return (MINI_MATS[team] = { body: std(light, { rough: 0.4 }), team: std(tc, { rough: 0.4 }), limb: std(shade(light, -0.1), { rough: 0.4 }), glow: std(tc, { emissive: tc, ei: 2 }), metal: metal(), wood: std('#8d5524'), dark: std('#495057', { metal: 0.6 }) });
}
class MiniBean {
  constructor(type, team) {
    const M2 = miniMats(team);
    this.root = new THREE.Group(); this.pivot = new THREE.Group(); this.pivot.position.y = 0.72; this.root.add(this.pivot);
    const body = mesh(MINI_BODY, M2.body, 0, 0.05, 0, this.pivot);
    const helm = mesh(MINI_HELM, M2.team, 0, 0.53, 0, this.pivot); helm.castShadow = false;
    for (const s of [-1, 1]) {
      const w = mesh(MINI_EYE, WHITE, 0.15 * s, 0.22, 0.37, this.pivot); w.scale.set(1, 1.15, 0.5); w.castShadow = false;
      const i = mesh(MINI_IRIS, IRIS, 0.15 * s, 0.21, 0.42, this.pivot); i.scale.set(1, 1.1, 0.4); i.castShadow = false;
    }
    this.arms = [-1, 1].map(s => { const a = new THREE.Group(); a.position.set(0.46 * s, 0.08, 0); const m = mesh(LIMB, M2.limb, 0, -0.2, 0, a); m.castShadow = false; this.pivot.add(a); return a; });
    this.legs = [-1, 1].map(s => { const l = new THREE.Group(); l.position.set(0.19 * s, -0.4, 0); const m = mesh(LEG, M2.limb, 0, -0.14, 0, l); m.castShadow = false; this.pivot.add(l); return l; });
    const hand = new THREE.Group(); hand.position.set(0, -0.36, 0.05); hand.rotation.x = Math.PI / 2; this.arms[1].add(hand);
    if (type === 'melee') mesh(new THREE.BoxGeometry(0.08, 0.6, 0.04), M2.metal, 0, 0.3, 0, hand).castShadow = false;
    else if (type === 'ranged') { mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 5), M2.wood, 0, 0.25, 0, hand).castShadow = false; mesh(DOT, M2.glow, 0, 0.58, 0, hand).scale.setScalar(0.1); }
    else { const c = mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.7, 10), M2.dark, 0, 0.1, -0.42, this.pivot); c.rotation.x = -1.1; }
    void body;
    this.t = Math.random() * 6; this.phase = 0; this.sq = 1; this.sqV = 0; this.deadT = 0;
  }
  hit() { this.sqV = -4; }
  update(dt, st) {
    this.t += dt; const P = this.pivot;
    if (st.dead) { this.deadT += dt; const k = clamp(this.deadT / 0.4, 0, 1); P.rotation.x = -k * 1.4; P.position.y = 0.72 - k * 0.45; return; }
    this.sqV += (1 - this.sq) * 200 * dt; this.sqV *= Math.exp(-11 * dt); this.sq += this.sqV * dt;
    const sq = clamp(this.sq, 0.75, 1.25); P.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    let armR = 0, armL = 0, legL = 0, bob = 0;
    if (st.speed > 0.1) { this.phase += dt * 13; const s2 = Math.sin(this.phase); legL = s2 * 0.9; armL = -s2 * 0.8; armR = s2 * 0.8; bob = Math.abs(Math.cos(this.phase)) * 0.08; }
    else bob = Math.sin(this.t * 2.4) * 0.02;
    if (st.attack >= 0 && st.attack !== undefined) { const a = st.attack; armR = st.melee ? (a < 0.45 ? -2.4 * a / 0.45 : -2.4 + 3 * (a - 0.45) / 0.55) : -1.5; }
    P.position.y = 0.72 + bob; P.rotation.x = st.speed > 0.1 ? 0.15 : 0;
    this.arms[0].rotation.x = armL; this.arms[1].rotation.x = armR; this.arms[0].rotation.z = -0.15; this.arms[1].rotation.z = 0.15;
    this.legs[0].rotation.x = legL; this.legs[1].rotation.x = -legL;
  }
}
export function makeMinion(type, team) {
  const b = new MiniBean(type, team);
  b.root.scale.setScalar(type === 'siege' ? 1.2 : type === 'ranged' ? 0.85 : 0.95);
  return b;
}

// ---------- jungle monsters ----------
export class Monster {
  constructor(type, def) {
    this.type = type; this.root = new THREE.Group(); this.body = new THREE.Group(); this.root.add(this.body);
    this.t = Math.random() * 6; this.parts = {};
    const col = def.color, mat = std(col, { rough: 0.4 }), dark = std(shade(col, -0.2));
    const eyes = (y, z, s, spread = 0.25) => { for (const k of [-1, 1]) { const w = mesh(EYE, WHITE, spread * k * s, y, z, this.body); w.scale.setScalar(s * 1.2); const i = mesh(IRIS_G, IRIS, spread * k * s, y, z + 0.08 * s, this.body); i.scale.setScalar(s * 1.1); } };
    const angry = (y, z, s) => { for (const k of [-1, 1]) { const br = mesh(new THREE.BoxGeometry(0.28 * s, 0.06 * s, 0.06 * s), BLACK, 0.25 * k * s, y, z, this.body); br.rotation.z = -0.4 * k; } };
    if (type === 'chick' || type === 'mama') {
      mesh(new THREE.SphereGeometry(0.5, 16, 12), mat, 0, 0.5, 0, this.body);
      const beak = mesh(new THREE.ConeGeometry(0.1, 0.22, 6), std('#ffb703'), 0, 0.5, 0.52, this.body); beak.rotation.x = Math.PI / 2;
      eyes(0.62, 0.36, 0.7, 0.3);
      for (const k of [-1, 1]) { const w = mesh(new THREE.SphereGeometry(0.22, 10, 8), dark, 0.48 * k, 0.48, 0, this.body); w.scale.set(0.4, 0.8, 1); this.parts['w' + k] = w; }
      const crest = mesh(new THREE.ConeGeometry(0.08, 0.2, 6), std('#ff4d6d'), 0, 1.02, 0.05, this.body); void crest;
    } else if (type === 'toad' || type === 'toadlet') {
      const bd = mesh(new THREE.SphereGeometry(0.6, 18, 12), mat, 0, 0.45, 0, this.body); bd.scale.set(1.2, 0.75, 1);
      eyes(0.85, 0.25, 0.9, 0.3);
      const mouth = mesh(new THREE.TorusGeometry(0.3, 0.035, 6, 16, Math.PI), BLACK, 0, 0.45, 0.6, this.body); mouth.rotation.z = Math.PI;
      for (const k of [-1, 1]) mesh(new THREE.SphereGeometry(0.2, 10, 8), dark, 0.55 * k, 0.12, 0.3, this.body).scale.set(1, 0.5, 1.3);
    } else if (type === 'crab' || type === 'crablet') {
      const bd = mesh(new THREE.SphereGeometry(0.6, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat, 0, 0.3, 0, this.body); bd.scale.set(1.3, 0.9, 1);
      eyes(0.85, 0.15, 0.7, 0.25);
      for (const k of [-1, 1]) {
        const claw = new THREE.Group(); claw.position.set(0.85 * k, 0.4, 0.3); this.body.add(claw); this.parts['c' + k] = claw;
        mesh(new THREE.SphereGeometry(0.25, 10, 8), dark, 0, 0, 0.1, claw).scale.set(1, 0.7, 1.3);
      }
      for (let i = 0; i < 6; i++) { const leg = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 4), dark, (i < 3 ? -1 : 1) * 0.7, 0.15, -0.3 + (i % 3) * 0.3, this.body); leg.rotation.z = (i < 3 ? 1 : -1) * 0.9; }
    } else if (type === 'gumdrop') {
      const bd = mesh(new THREE.CylinderGeometry(0.45, 0.85, 1.3, 20), std(col, { rough: 0.2, metal: 0.05 }), 0, 0.65, 0, this.body); void bd;
      mesh(new THREE.SphereGeometry(0.45, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), std(col, { rough: 0.2 }), 0, 1.3, 0, this.body);
      for (let i = 0; i < 24; i++) { const a = i * 2.4, y = 0.3 + (i % 8) * 0.14; const r = 0.85 - y * 0.32; mesh(DOT, WHITE, Math.cos(a) * r, y, Math.sin(a) * r, this.body).scale.setScalar(0.05); }
      eyes(1.0, 0.55, 0.9, 0.3); angry(1.2, 0.6, 1);
      for (const k of [-1, 1]) { const arm = mesh(new THREE.SphereGeometry(0.25, 10, 8), std(col), 0.95 * k, 0.7, 0, this.body); this.parts['a' + k] = arm; }
    } else if (type === 'yeti') {
      mesh(new THREE.IcosahedronGeometry(0.85, 2), std('#f8fbff', { flat: true, rough: 0.9 }), 0, 0.9, 0, this.body).scale.set(1, 1.05, 0.9);
      const face = mesh(new THREE.SphereGeometry(0.42, 16, 10), std('#9fd8ff'), 0, 1.05, 0.55, this.body); face.scale.set(1, 0.85, 0.4);
      eyes(1.15, 0.72, 0.7, 0.32); angry(1.3, 0.75, 0.8);
      for (const k of [-1, 1]) { const arm = mesh(new THREE.IcosahedronGeometry(0.32, 1), std('#f8fbff', { flat: true }), 0.95 * k, 0.6, 0.1, this.body); this.parts['a' + k] = arm; }
      const crown = mesh(new THREE.IcosahedronGeometry(0.2, 0), std('#9fd8ff', { emissive: '#9fd8ff', ei: 1.2 }), 0, 1.85, 0, this.body); this.parts.crown = crown;
    } else if (type === 'chili') {
      const curve = new THREE.CatmullRomCurve3([V(0, 0.2, 0), V(0, 0.9, 0.1), V(0.15, 1.5, -0.1), V(0.4, 1.8, -0.3)]);
      mesh(new THREE.TubeGeometry(curve, 20, 0.55, 14), std('#e53935', { rough: 0.25 }), 0, 0, 0, this.body);
      mesh(new THREE.SphereGeometry(0.55, 14, 10), std('#e53935', { rough: 0.25 }), 0, 0.2, 0, this.body);
      const stem = mesh(new THREE.CylinderGeometry(0.08, 0.14, 0.35, 8), std('#2e7d32'), 0.4, 1.95, -0.3, this.body); stem.rotation.z = -0.6;
      eyes(1.0, 0.5, 0.85, 0.3); angry(1.2, 0.55, 1);
      for (let i = 0; i < 6; i++) { const f = mesh(new THREE.ConeGeometry(0.12, 0.4, 6), std('#ffb703', { emissive: '#ff7b00', ei: 1.5, opacity: 0.85 }), Math.cos(i) * 0.5, 1.8 + (i % 2) * 0.1, Math.sin(i) * 0.4, this.body); this.parts['f' + i] = f; }
    } else if (type === 'dragon') {
      const bd = mesh(new THREE.CapsuleGeometry(0.75, 1.3, 8, 16), mat, 0, 1.3, 0, this.body); bd.rotation.x = Math.PI / 2;
      const belly = mesh(new THREE.CapsuleGeometry(0.55, 1.1, 8, 14), std('#ffe0f0'), 0, 1.05, 0.05, this.body); belly.rotation.x = Math.PI / 2;
      const neck = new THREE.Group(); neck.position.set(0, 1.7, 1.1); this.body.add(neck); this.parts.neck = neck;
      mesh(new THREE.CylinderGeometry(0.28, 0.4, 1.1, 12), mat, 0, 0.45, 0.2, neck).rotation.x = 0.5;
      const head = new THREE.Group(); head.position.set(0, 1.05, 0.55); neck.add(head); this.parts.head = head;
      mesh(new THREE.SphereGeometry(0.55, 16, 12), mat, 0, 0, 0, head);
      const snout = mesh(new THREE.SphereGeometry(0.35, 14, 10), mat, 0, -0.1, 0.45, head); snout.scale.set(1, 0.7, 1.2);
      for (const k of [-1, 1]) { const w = mesh(EYE, WHITE, 0.24 * k, 0.15, 0.38, head); w.scale.setScalar(1.3); const i = mesh(IRIS_G, IRIS, 0.24 * k, 0.15, 0.47, head); i.scale.setScalar(1.1); const horn = mesh(new THREE.ConeGeometry(0.08, 0.4, 6), std('#ffffff'), 0.25 * k, 0.5, -0.1, head); horn.rotation.x = -0.5; }
      for (const k of [-1, 1]) {
        const wing = new THREE.Group(); wing.position.set(0.6 * k, 1.8, 0); this.body.add(wing); this.parts['w' + k] = wing;
        const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(1.9 * k, 0.6); shape.lineTo(1.6 * k, -0.4); shape.lineTo(0.9 * k, -0.2); shape.lineTo(0.6 * k, -0.7); shape.lineTo(0, -0.3);
        const wm = mesh(new THREE.ShapeGeometry(shape), std(shade(col, 0.1), { double: true, opacity: 0.9 }), 0, 0, 0, wing); wm.rotation.x = -Math.PI / 2 + 0.2;
      }
      const tail = mesh(new THREE.ConeGeometry(0.4, 2, 10), mat, 0, 1.0, -1.7, this.body); tail.rotation.x = -Math.PI / 2 - 0.25;
      for (let i = 0; i < 5; i++) mesh(new THREE.ConeGeometry(0.12, 0.3, 4), std('#ffd23f'), 0, 2.05 - i * 0.08, 0.6 - i * 0.45, this.body);
      for (const k of [-1, 1]) for (const z of [-0.5, 0.5]) mesh(new THREE.CylinderGeometry(0.15, 0.18, 0.8, 8), mat, 0.5 * k, 0.4, z, this.body);
      this.tint = [mat];
    } else if (type === 'boss') {
      this.bean = new Bean('boss', ['#ffd23f', '#c62828']);
      this.body.add(this.bean.root);
    }
    this.root.scale.setScalar(def.size || 1);
    this.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  }
  update(dt, st) {
    this.t += dt;
    const P = this.parts, t = this.t;
    if (this.bean) { this.bean.update(dt, { speed: st.speed, attack: st.attack, melee: true, dead: st.dead, cast: st.cast }); return; }
    if (st.dead) { this.body.rotation.z = damp(this.body.rotation.z, 1.5, 8, dt); this.body.position.y = damp(this.body.position.y, -0.3, 4, dt); return; }
    this.body.rotation.z = damp(this.body.rotation.z, 0, 8, dt); this.body.position.y = Math.abs(Math.sin(t * (st.speed > 0.5 ? 9 : 2.5))) * (st.speed > 0.5 ? 0.15 : 0.04);
    const atk = st.attack >= 0 ? Math.sin(st.attack * Math.PI) : 0;
    this.body.rotation.x = -atk * 0.35;
    if (P['w-1']) { const f = this.type === 'dragon' ? Math.sin(t * 3) * 0.4 : Math.sin(t * 12) * 0.3 * (st.speed > 0.5 ? 1.5 : 0.3); P['w-1'].rotation.z = f; P['w1'].rotation.z = -f; }
    if (P['c-1']) { P['c-1'].rotation.y = atk * 0.8; P['c1'].rotation.y = -atk * 0.8; }
    if (P['a-1']) { P['a-1'].position.z = 0.1 + atk * 0.6; P['a1'].position.z = 0.1 + Math.sin(t * 2) * 0.05; }
    if (P.neck) { P.neck.rotation.x = -atk * 0.5 + Math.sin(t * 1.5) * 0.08; }
    if (P.crown) P.crown.rotation.y += dt * 2;
    for (let i = 0; i < 6; i++) if (P['f' + i]) P['f' + i].scale.y = 1 + Math.sin(t * 10 + i) * 0.3;
  }
  setTint(color) { if (this.tint) this.tint.forEach(m => m.color.set(color)); }
  dispose() { this.root.removeFromParent(); }
}

// ---------- towers and cores ----------
export class TowerModel {
  constructor(team) {
    const tc = team === 0 ? '#3a86ff' : '#ff4d6d';
    this.root = new THREE.Group(); this.alive = new THREE.Group(); this.root.add(this.alive);
    const stone = std('#efe3d0', { rough: 0.7 }), stoneD = std('#d6c7ae', { rough: 0.8 });
    mesh(new THREE.CylinderGeometry(1.9, 2.2, 1, 10), stoneD, 0, 0.5, 0, this.root);
    const col = mesh(new THREE.CylinderGeometry(1.15, 1.5, 4.6, 12), stone, 0, 3.3, 0, this.alive); void col;
    const stripes = std('#ffffff', { map: canvasTex(64, 256, (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.fillStyle = tc; for (let y = -64; y < h; y += 48) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + 32); g.lineTo(w, y + 52); g.lineTo(0, y + 20); g.fill(); } }) });
    mesh(new THREE.CylinderGeometry(1.2, 1.2, 2.2, 16, 1, true), stripes, 0, 3.2, 0, this.alive);
    mesh(new THREE.CylinderGeometry(1.6, 1.25, 0.6, 12), stoneD, 0, 5.8, 0, this.alive);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; mesh(new THREE.BoxGeometry(0.5, 0.6, 0.5), stone, Math.cos(a) * 1.35, 6.35, Math.sin(a) * 1.35, this.alive); }
    this.orb = mesh(new THREE.IcosahedronGeometry(0.75, 1), std(tc, { emissive: tc, ei: 1.6, rough: 0.2 }), 0, 7.4, 0, this.alive);
    this.ring = mesh(new THREE.TorusGeometry(1.1, 0.07, 6, 30), std(tc, { emissive: tc, ei: 2 }), 0, 7.4, 0, this.alive);
    this.rubble = new THREE.Group(); this.rubble.visible = false; this.root.add(this.rubble);
    for (let i = 0; i < 9; i++) { const r = mesh(new THREE.DodecahedronGeometry(0.4 + Math.random() * 0.4, 0), i % 3 ? stone : stoneD, (Math.random() - 0.5) * 3, 1.1 + Math.random() * 0.4, (Math.random() - 0.5) * 3, this.rubble); r.rotation.set(Math.random() * 3, Math.random() * 3, 0); }
    this.t = Math.random() * 5; this.dead = false; this.fallT = 0;
    this.root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.orbTop = 7.4;
  }
  update(dt, st) {
    this.t += dt;
    if (st.dead) {
      if (!this.dead) { this.dead = true; this.fallT = 0; }
      this.fallT += dt;
      const k = clamp(this.fallT / 0.9, 0, 1);
      this.alive.position.y = -k * 6; this.alive.rotation.z = k * 0.5; this.alive.scale.setScalar(1 - k * 0.3);
      if (k >= 1) this.alive.visible = false;
      this.rubble.visible = true;
      return;
    }
    this.orb.rotation.y += dt * 1.5; this.orb.position.y = this.orbTop + Math.sin(this.t * 2) * 0.15;
    this.ring.rotation.x = Math.PI / 2 + Math.sin(this.t) * 0.3; this.ring.rotation.y += dt;
    this.orb.material.emissiveIntensity = st.attacking ? 2.6 : 1.6;
  }
}
export class CoreModel {
  constructor(team) {
    const tc = team === 0 ? '#3a86ff' : '#ff4d6d';
    this.root = new THREE.Group();
    const stone = std('#efe3d0', { rough: 0.6 });
    mesh(new THREE.CylinderGeometry(3.6, 4.2, 1.2, 16), stone, 0, 0.6, 0, this.root);
    mesh(new THREE.CylinderGeometry(3.0, 3.3, 0.6, 16), std(tc, { emissive: tc, ei: 0.3 }), 0, 1.5, 0, this.root);
    this.bean = new THREE.Mesh(new THREE.CapsuleGeometry(1.5, 1.6, 10, 24), std(tc, { emissive: tc, ei: 0.8, rough: 0.1, metal: 0.2, opacity: 0.92 }));
    this.bean.position.y = 5; this.bean.castShadow = true; this.root.add(this.bean);
    // cute face on the core
    for (const s of [-1, 1]) { const w = mesh(EYE, WHITE, 0.55 * s, 5.7, 1.35, this.root); w.scale.set(2.8, 3.2, 1.2); const i = mesh(IRIS_G, IRIS, 0.55 * s, 5.65, 1.52, this.root); i.scale.set(2.8, 3, 1); }
    this.face = this.root.children.slice(-4);
    this.rings = [];
    for (let i = 0; i < 3; i++) { const r = mesh(new THREE.TorusGeometry(2.6 + i * 0.5, 0.08, 6, 40), std('#ffffff', { emissive: tc, ei: 1.5 }), 0, 5, 0, this.root); this.rings.push(r); }
    this.shield = new THREE.Mesh(new THREE.SphereGeometry(4.6, 24, 16), new THREE.MeshBasicMaterial({ color: tc, transparent: true, opacity: 0.12, depthWrite: false }));
    this.shield.position.y = 4; this.root.add(this.shield);
    this.t = 0; this.dead = false;
  }
  update(dt, st) {
    this.t += dt;
    this.shield.visible = !!st.protected && !st.dead;
    if (st.dead) { this.bean.scale.y = damp(this.bean.scale.y, 0.2, 4, dt); this.bean.position.y = damp(this.bean.position.y, 2, 4, dt); this.rings.forEach(r => { r.visible = false; }); this.face.forEach(f => { f.visible = false; }); return; }
    this.bean.position.y = 5 + Math.sin(this.t * 1.5) * 0.3; this.bean.rotation.y += dt * 0.4;
    this.rings.forEach((r, i) => { r.rotation.x = Math.PI / 2 + Math.sin(this.t * (0.7 + i * 0.3)) * 0.6; r.rotation.y += dt * (0.5 + i * 0.4); r.position.y = this.bean.position.y; });
    this.face.forEach((f, i) => { f.position.y = (i % 2 ? 5.65 : 5.7) + this.bean.position.y - 5; });
  }
}
