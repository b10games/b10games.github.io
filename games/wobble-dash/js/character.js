// The "Wobbler": a round, colourful, slightly clumsy character with procedural animation.
import { THREE, canvasTex, damp, clamp } from './engine.js';

export const PALETTE = ['#ff4d6d', '#ff8c42', '#ffd23f', '#7bd389', '#2ec4b6', '#3a86ff', '#8338ec', '#ff6fd8',
  '#f8f9fa', '#343a40', '#a0522d', '#00e5ff', '#b8f35b', '#ff9ebb', '#c77dff', '#ffb703'];
export const PATTERNS = ['solid', 'stripes', 'dots', 'split', 'stars', 'zigzag', 'gradient', 'hearts'];
export const HATS = ['none', 'cap', 'bunny', 'horns', 'halo', 'tophat', 'crown', 'propeller', 'cat', 'flower'];
export const EYES = ['round', 'happy', 'sleepy', 'cool'];

export function randomSkin(r = Math.random) {
  const p = PALETTE;
  return { c1: p[Math.floor(r() * p.length)], c2: p[Math.floor(r() * p.length)], pattern: PATTERNS[Math.floor(r() * PATTERNS.length)],
    hat: HATS[Math.floor(r() * HATS.length)], eyes: EYES[Math.floor(r() * EYES.length)] };
}

const texCache = new Map();
function skinTexture(skin) {
  const key = skin.c1 + skin.c2 + skin.pattern;
  if (texCache.has(key)) return texCache.get(key);
  const t = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = skin.c1; g.fillRect(0, 0, w, h);
    g.fillStyle = skin.c2;
    switch (skin.pattern) {
      case 'stripes': for (let y = 0; y < h; y += 40) g.fillRect(0, y, w, 18); break;
      case 'dots': for (let y = 16; y < h; y += 42) for (let x = (y / 42 % 2) * 21 + 10; x < w; x += 42) { g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill(); } break;
      case 'split': g.fillRect(w / 2, 0, w / 2, h); break;
      case 'stars': for (let i = 0; i < 18; i++) star(g, (i * 53) % w, (i * 97) % h, 12); break;
      case 'zigzag': for (let y = 20; y < h; y += 56) { g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= w; x += 32) g.lineTo(x, y + ((x / 32) % 2 ? 18 : 0)); g.lineTo(w, y + 30); g.lineTo(0, y + 30); g.fill(); } break;
      case 'gradient': { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, skin.c1); gr.addColorStop(1, skin.c2); g.fillStyle = gr; g.fillRect(0, 0, w, h); break; }
      case 'hearts': for (let i = 0; i < 14; i++) heart(g, (i * 71) % w + 10, (i * 113) % h + 10, 11); break;
    }
  });
  texCache.set(key, t);
  return t;
}
function star(g, x, y, r) {
  g.beginPath();
  for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g.fill();
}
function heart(g, x, y, s) {
  g.beginPath(); g.moveTo(x, y + s * 0.4);
  g.bezierCurveTo(x - s, y - s * 0.4, x - s * 0.4, y - s, x, y - s * 0.3);
  g.bezierCurveTo(x + s * 0.4, y - s, x + s, y - s * 0.4, x, y + s * 0.4); g.fill();
}

const GEO = {
  body: new THREE.CapsuleGeometry(0.42, 0.52, 8, 20),
  limb: new THREE.CapsuleGeometry(0.11, 0.22, 4, 10),
  leg: new THREE.CapsuleGeometry(0.13, 0.1, 4, 10),
  eye: new THREE.SphereGeometry(0.115, 16, 12),
  pupil: new THREE.SphereGeometry(0.06, 12, 8),
  mouth: new THREE.TorusGeometry(0.075, 0.022, 6, 14, Math.PI),
  shadow: new THREE.CircleGeometry(0.5, 20)
};
const MAT_WHITE = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25 });
const MAT_BLACK = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 });
const MAT_SHADOW = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });

export class Character {
  constructor(skin) {
    this.root = new THREE.Group();          // position = feet, rotation.y = facing
    this.pivot = new THREE.Group();         // hips: tilt, flips, tumbles
    this.pivot.position.y = 0.72;
    this.root.add(this.pivot);
    this.bodyMat = new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0.02 });
    this.limbMat = new THREE.MeshStandardMaterial({ roughness: 0.45 });
    this.body = new THREE.Mesh(GEO.body, this.bodyMat);
    this.body.position.y = 0.05;
    this.pivot.add(this.body);
    // face
    this.face = new THREE.Group();
    this.face.position.set(0, 0.3, 0.33);
    this.pivot.add(this.face);
    this.eyes = [];
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(GEO.eye, MAT_WHITE);
      e.position.set(0.15 * s, 0.02, 0.03);
      e.scale.set(1, 1.15, 0.7);
      const p = new THREE.Mesh(GEO.pupil, MAT_BLACK);
      p.position.set(0, 0, 0.085);
      e.add(p);
      this.face.add(e);
      this.eyes.push(e);
    }
    this.mouth = new THREE.Mesh(GEO.mouth, MAT_BLACK);
    this.mouth.position.set(0, -0.16, 0.06);
    this.mouth.rotation.z = Math.PI;
    this.face.add(this.mouth);
    // arms (pivot at shoulder) and legs (pivot at hip)
    this.arms = [-1, 1].map(s => {
      const a = new THREE.Group(); a.position.set(0.44 * s, 0.12, 0);
      const m = new THREE.Mesh(GEO.limb, this.limbMat); m.position.y = -0.2; a.add(m);
      this.pivot.add(a); a.userData.s = s; return a;
    });
    this.legs = [-1, 1].map(s => {
      const l = new THREE.Group(); l.position.set(0.19 * s, -0.42, 0);
      const m = new THREE.Mesh(GEO.leg, this.limbMat); m.position.y = -0.14; l.add(m);
      this.pivot.add(l); return l;
    });
    this.hat = new THREE.Group();
    this.hat.position.y = 0.72;
    this.pivot.add(this.hat);
    this.shadow = new THREE.Mesh(GEO.shadow, MAT_SHADOW);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.03;
    this.root.add(this.shadow);
    this.root.traverse(o => { if (o.isMesh && o !== this.shadow) o.castShadow = true; });
    // animation state
    this.phase = 0; this.sq = 1; this.sqV = 0; this.lean = 0; this.flip = 0; this.roll = 0;
    this.tumble = new THREE.Vector3(); this.wasGrounded = true; this.t = Math.random() * 10; this.blinkT = 2;
    this.setSkin(skin);
  }

  setSkin(skin) {
    this.skin = Object.assign({ c1: '#3a86ff', c2: '#ffd23f', pattern: 'solid', hat: 'none', eyes: 'round' }, skin || {});
    const tex = skinTexture(this.skin);
    this.bodyMat.map = tex; this.bodyMat.color.set('#ffffff'); this.bodyMat.needsUpdate = true;
    this.limbMat.color.set(this.skin.pattern === 'solid' ? shade(this.skin.c1, -0.12) : this.skin.c2);
    // eyes
    const e = this.skin.eyes;
    this.eyes.forEach(eye => { eye.scale.set(1, e === 'sleepy' ? 0.55 : e === 'happy' ? 0.8 : 1.15, 0.7); eye.children[0].scale.setScalar(e === 'cool' ? 1.5 : 1); });
    this.buildHat(this.skin.hat);
  }

  buildHat(type) {
    this.hat.clear();
    const c2 = new THREE.MeshStandardMaterial({ color: this.skin.c2, roughness: 0.5 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xffd23f, metalness: 0.6, roughness: 0.3, emissive: 0x332200 });
    const add = (geo, mat, x, y, z, rx = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.x = rx; m.rotation.z = rz; m.castShadow = true; this.hat.add(m); return m; };
    switch (type) {
      case 'cap': add(new THREE.SphereGeometry(0.36, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), c2, 0, -0.08, 0); add(new THREE.BoxGeometry(0.42, 0.04, 0.3), c2, 0, -0.07, 0.36); break;
      case 'bunny': for (const s of [-1, 1]) add(new THREE.CapsuleGeometry(0.07, 0.36, 4, 8), MAT_WHITE, 0.14 * s, 0.22, 0, 0, -0.18 * s); break;
      case 'horns': for (const s of [-1, 1]) add(new THREE.ConeGeometry(0.08, 0.3, 10), new THREE.MeshStandardMaterial({ color: 0xfff3e0 }), 0.2 * s, 0.05, 0, 0, -0.5 * s); break;
      case 'halo': { const h = add(new THREE.TorusGeometry(0.26, 0.04, 8, 24), gold, 0, 0.28, 0, Math.PI / 2); h.userData.spin = 1; break; }
      case 'tophat': add(new THREE.CylinderGeometry(0.36, 0.36, 0.04, 20), MAT_BLACK, 0, -0.03, 0); add(new THREE.CylinderGeometry(0.22, 0.24, 0.42, 20), MAT_BLACK, 0, 0.18, 0); add(new THREE.CylinderGeometry(0.245, 0.245, 0.07, 20), c2, 0, 0.02, 0); break;
      case 'crown': { const g = new THREE.CylinderGeometry(0.24, 0.24, 0.16, 8, 1, true); add(g, gold, 0, 0.02, 0); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; add(new THREE.ConeGeometry(0.05, 0.12, 6), gold, Math.cos(a) * 0.24, 0.15, Math.sin(a) * 0.24); } break; }
      case 'propeller': { add(new THREE.SphereGeometry(0.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), c2, 0, -0.06, 0); const p = new THREE.Group(); p.position.y = 0.3; p.userData.spin = 12; for (const s of [0, Math.PI]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.08), new THREE.MeshStandardMaterial({ color: 0xff4d6d })); b.rotation.y = s; p.add(b); } this.hat.add(p); add(new THREE.CylinderGeometry(0.02, 0.02, 0.1, 6), MAT_BLACK, 0, 0.25, 0); break; }
      case 'cat': for (const s of [-1, 1]) add(new THREE.ConeGeometry(0.1, 0.2, 4), this.limbMat, 0.2 * s, 0.05, 0, 0, -0.35 * s); break;
      case 'flower': { for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; add(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshStandardMaterial({ color: 0xff6fd8 }), 0.18 + Math.cos(a) * 0.1, 0.05 + Math.sin(a) * 0.1, 0.1); } add(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffd23f }), 0.18, 0.05, 0.13); break; }
    }
  }

  // st: { speed, grounded, vy, dash (0..1), stun, celebrate, dance, sad, airTime }
  update(dt, st) {
    this.t += dt;
    const speed = st.speed || 0, run = clamp(speed / 8, 0, 1.3), P = this.pivot;
    // landing squash
    if (st.grounded && !this.wasGrounded && (st.landV || 0) < -6) { this.sqV = -6 - Math.min(10, -(st.landV || 0) * 0.4); }
    if (!st.grounded && this.wasGrounded && st.vy > 4) this.sqV = 7;
    this.wasGrounded = st.grounded;
    this.sqV += (1 - this.sq) * 220 * dt; this.sqV *= Math.exp(-12 * dt); this.sq += this.sqV * dt;
    const sq = clamp(this.sq, 0.65, 1.35);
    P.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));

    let armL = 0, armR = 0, armZ = 0.15, legL = 0, legR = 0, bob = 0, leanT = 0;
    if (st.stun > 0) {
      this.tumble.x += dt * 9; this.tumble.z += dt * 6.5;
      P.rotation.set(this.tumble.x, 0, this.tumble.z);
      armZ = 1.3 + Math.sin(this.t * 25) * 0.4; legL = Math.sin(this.t * 20); legR = -legL;
    } else if (st.dash > 0) {
      // dash: superman dive with a corkscrew roll
      const k = st.dash;
      this.roll = (1 - k) * Math.PI * 2;
      P.rotation.set(1.25, 0, this.roll);
      armL = armR = -2.9; armZ = 0.12; legL = legR = 0.15;
    } else {
      this.tumble.set(0, 0, 0);
      if (st.grounded) {
        this.phase += dt * (4 + speed * 1.55);
        const s = Math.sin(this.phase);
        legL = s * 1.0 * run; legR = -s * 1.0 * run;
        armL = -s * 0.9 * run; armR = s * 0.9 * run;
        bob = Math.abs(Math.cos(this.phase)) * 0.09 * run;
        leanT = 0.22 * run;
        if (run < 0.05) { bob = Math.sin(this.t * 2.4) * 0.015; armZ = 0.12 + Math.sin(this.t * 2.4) * 0.04; }
      } else {
        // in the air: tucked legs going up, flailing arms when falling
        const falling = st.vy < -4;
        legL = -0.6; legR = 0.3;
        armL = armR = falling ? -2.6 + Math.sin(this.t * 22) * 0.5 : -1.9;
        armZ = falling ? 0.9 + Math.sin(this.t * 18) * 0.3 : 0.5;
        leanT = falling ? -0.15 : 0.1;
      }
      if (st.dance) {
        bob = Math.abs(Math.sin(this.t * 7)) * 0.25;
        armL = -2.5 + Math.sin(this.t * 7) * 0.6; armR = -2.5 - Math.sin(this.t * 7) * 0.6; armZ = 0.6;
        legL = Math.sin(this.t * 7) * 0.5; legR = -legL;
        P.rotation.y = Math.sin(this.t * 3.5) * 0.6;
      } else P.rotation.y = damp(P.rotation.y, 0, 10, dt);
      if (st.celebrate) {
        bob = Math.abs(Math.sin(this.t * 9)) * 0.35;
        armL = armR = -2.8 + Math.sin(this.t * 14) * 0.3; armZ = 0.7;
      }
      if (st.sad) { leanT = 0.45; armL = armR = 0.3; armZ = 0.05; bob = 0; }
      this.lean = damp(this.lean, leanT, 10, dt);
      P.rotation.x = damp(P.rotation.x, this.lean, 14, dt);
      P.rotation.z = damp(P.rotation.z, 0, 14, dt);
    }
    P.position.y = 0.72 + bob;
    const a = this.arms, l = this.legs;
    a[0].rotation.x = damp(a[0].rotation.x, armL, 18, dt); a[1].rotation.x = damp(a[1].rotation.x, armR, 18, dt);
    a[0].rotation.z = damp(a[0].rotation.z, -armZ, 18, dt); a[1].rotation.z = damp(a[1].rotation.z, armZ, 18, dt);
    l[0].rotation.x = damp(l[0].rotation.x, legL, 20, dt); l[1].rotation.x = damp(l[1].rotation.x, legR, 20, dt);
    // blink
    this.blinkT -= dt;
    const blink = this.blinkT < 0.12 ? 0.1 : 1;
    if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 3;
    const ey = this.skin.eyes === 'sleepy' ? 0.55 : this.skin.eyes === 'happy' ? 0.8 : 1.15;
    this.eyes.forEach(e => { e.scale.y = st.stun > 0 ? 0.25 : ey * blink; });
    this.mouth.rotation.z = st.stun > 0 || st.sad ? 0 : Math.PI;
    this.hat.children.forEach(h => { if (h.userData.spin) h.rotation.y += dt * h.userData.spin * (h.userData.spin > 5 ? 1 + speed * 0.3 : 1); });
    // blob shadow stays on the ground below
    this.shadow.position.y = 0.03 - (st.groundDist || 0);
    this.shadow.material.opacity = 0.28;
    const ss = clamp(1 - (st.groundDist || 0) * 0.08, 0.35, 1);
    this.shadow.scale.setScalar(ss);
  }

  dispose() { this.root.removeFromParent(); this.bodyMat.dispose(); this.limbMat.dispose(); }
}

function shade(hex, k) {
  const c = new THREE.Color(hex);
  const hsl = {}; c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, clamp(hsl.l + k, 0, 1));
  return c;
}

// Floating name tag sprite.
export function nameTag(text, color = '#ffffff') {
  const tex = canvasTex(256, 64, (g, w, h) => {
    g.font = '700 30px "Lilita One", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,.65)'; g.strokeText(text, w / 2, h / 2);
    g.fillStyle = color; g.fillText(text, w / 2, h / 2);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(2.2, 0.55, 1);
  s.position.y = 2.15;
  s.renderOrder = 10;
  return s;
}
