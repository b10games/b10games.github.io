// The bean: a round, colourful, slightly clumsy character with big eyes, short legs and little arms.
// All its moves are made in code: waddling runs, jumps, flailing falls, doggy-paddle swimming, tumbling
// when a disaster knocks it over, and a sooty or frozen look after lava and blizzards.
import { THREE, canvasTex, damp, clamp } from './engine.js';
import { EYES as EYE_LIST, COVERS_HEAD, buildHat, buildOutfit } from './outfits.js';
const EYES = EYE_LIST.map(e => e.id);

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

const BODY_R = 0.45;
// A soft ellipse that hugs the round body, used for the blushing cheeks.
function cheekGeometry(angle, y, rx, ry) {
  const g = new THREE.CircleGeometry(1, 24), p = g.attributes.position, R = BODY_R + 0.006;
  for (let i = 0; i < p.count; i++) {
    const a = angle + (p.getX(i) * rx) / R;
    p.setXYZ(i, Math.sin(a) * R, y + p.getY(i) * ry, Math.cos(a) * R);
  }
  g.computeVertexNormals();
  return g;
}
const GEO = {
  body: new THREE.CapsuleGeometry(BODY_R, 0.38, 10, 28),
  limb: new THREE.CapsuleGeometry(0.11, 0.22, 4, 10),
  leg: new THREE.CapsuleGeometry(0.13, 0.1, 4, 10),
  eyeWhite: new THREE.SphereGeometry(0.14, 24, 16),
  iris: new THREE.SphereGeometry(0.102, 20, 14),
  pupil: new THREE.SphereGeometry(0.05, 14, 10),
  shine: new THREE.SphereGeometry(1, 10, 8),
  lid: new THREE.SphereGeometry(0.148, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2),
  arc: new THREE.TorusGeometry(0.072, 0.021, 8, 18, Math.PI),
  bridge: new THREE.CylinderGeometry(0.016, 0.016, 0.06, 6),
  mouth: new THREE.TorusGeometry(0.046, 0.016, 8, 16, Math.PI),
  cheekL: cheekGeometry(-0.8, 0.0, 0.075, 0.045),
  cheekR: cheekGeometry(0.8, 0.0, 0.075, 0.045),
  shadow: new THREE.CircleGeometry(0.5, 20)
};
const MAT_WHITE = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.18 });
const MAT_BLACK = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 });
const MAT_IRIS = new THREE.MeshStandardMaterial({ color: 0x1f130d, roughness: 0.12 });
const MAT_SPARKLE = new THREE.MeshStandardMaterial({ color: 0x5a48e6, roughness: 0.12, emissive: 0x2a1a80, emissiveIntensity: 0.35 });
const MAT_LENS = new THREE.MeshStandardMaterial({ color: 0x111122, roughness: 0.08, metalness: 0.4 });
const MAT_SHINE = new THREE.MeshBasicMaterial({ color: 0xffffff });
const MAT_CHEEK = new THREE.MeshBasicMaterial({ color: 0xff6f9a, transparent: true, opacity: 0.5, depthWrite: false });
const MAT_SHADOW = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });
const EYE_X = 0.158, EYE_Y = 0.19, EYE_Z = 0.398;

export class Character {
  constructor(skin) {
    this.root = new THREE.Group();          // position = feet, rotation.y = facing
    this.pivot = new THREE.Group();         // hips: tilt, flips, tumbles
    this.pivot.position.y = 0.72;
    this.root.add(this.pivot);
    this.bodyMat = new THREE.MeshStandardMaterial({ roughness: 0.36, metalness: 0.02 });
    this.limbMat = new THREE.MeshStandardMaterial({ roughness: 0.4 });
    this.body = new THREE.Mesh(GEO.body, this.bodyMat);
    this.body.position.y = 0.05;
    this.body.rotation.y = Math.PI;          // texture seam at the back, not across the face
    this.pivot.add(this.body);
    // face: big shiny eyes, rosy cheeks and a small smile
    this.face = new THREE.Group();
    this.pivot.add(this.face);
    this.eyes = []; this.irises = [];
    this.cheeks = [new THREE.Mesh(GEO.cheekL, MAT_CHEEK), new THREE.Mesh(GEO.cheekR, MAT_CHEEK)];
    this.face.add(...this.cheeks);
    this.mouth = new THREE.Mesh(GEO.mouth, MAT_BLACK);
    this.mouth.position.set(0, -0.005, BODY_R - 0.006);
    this.mouth.rotation.z = Math.PI;
    this.face.add(this.mouth);
    // arms (pivot at shoulder) and legs (pivot at hip)
    this.arms = [-1, 1].map(s => {
      const a = new THREE.Group(); a.position.set(0.46 * s, 0.08, 0);
      const m = new THREE.Mesh(GEO.limb, this.limbMat); m.position.y = -0.2; a.add(m);
      this.pivot.add(a); a.userData.s = s; return a;
    });
    this.legs = [-1, 1].map(s => {
      const l = new THREE.Group(); l.position.set(0.19 * s, -0.42, 0);
      const m = new THREE.Mesh(GEO.leg, this.limbMat); m.position.y = -0.14; l.add(m);
      this.pivot.add(l); return l;
    });
    this.hat = new THREE.Group();
    this.hat.position.y = 0.7;
    this.pivot.add(this.hat);
    this.outfit = new THREE.Group(); this.outfit.userData.extra = [];
    this.pivot.add(this.outfit);
    this.burnt = 0; this.frozen = 0; this.tintKey = '';
    this.shadow = new THREE.Mesh(GEO.shadow, MAT_SHADOW);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.03;
    this.root.add(this.shadow);
    this.root.traverse(o => { if (o.isMesh && o !== this.shadow && !this.cheeks.includes(o)) o.castShadow = true; });
    // animation state
    this.phase = 0; this.sq = 1; this.sqV = 0; this.lean = 0; this.flip = 0; this.roll = 0;
    this.tumble = new THREE.Vector3(); this.wasGrounded = true; this.t = Math.random() * 10; this.blinkT = 2;
    this.lookT = 1; this.look = new THREE.Vector2(); this.lookTo = new THREE.Vector2();
    this.setSkin(skin);
  }

  setSkin(skin) {
    this.skin = Object.assign({ c1: '#3a86ff', c2: '#ffd23f', pattern: 'solid', hat: 'none', eyes: 'round', outfit: 'none' }, skin || {});
    const tex = skinTexture(this.skin);
    this.bodyMat.map = tex; this.bodyMat.needsUpdate = true;
    this.limbBase = new THREE.Color(this.skin.pattern === 'solid' ? shade(this.skin.c1, -0.12) : this.skin.c2);
    this.tintKey = ''; this.applyTint();
    this.buildEyes(EYES.includes(this.skin.eyes) ? this.skin.eyes : 'round');
    this.buildHat(this.skin.hat);
    this.buildOutfit(this.skin.outfit);
  }
  // soot after lava and lightning, ice-blue in a blizzard
  applyTint() {
    const key = Math.round(this.burnt * 20) + ':' + Math.round(this.frozen * 20);
    if (key === this.tintKey) return; this.tintKey = key;
    const b = this.burnt, f = this.frozen;
    this.bodyMat.color.setRGB(1, 1, 1).lerp(SOOT, b * 0.75).lerp(ICE, f * 0.6);
    this.limbMat.color.copy(this.limbBase).lerp(SOOT, b * 0.75).lerp(ICE, f * 0.6);
    this.bodyMat.emissive.setRGB(0.05 * f, 0.12 * f, 0.2 * f);
  }

  // Each eye is a group that sits on the round face and turns a little outward.
  buildEyes(type) {
    for (const e of this.eyes) e.removeFromParent();
    this.eyes = []; this.irises = [];
    const mesh = (geo, mat, x, y, z, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); return m; };
    for (const s of [-1, 1]) {
      const g = new THREE.Group();
      g.position.set(EYE_X * s, EYE_Y, EYE_Z);
      g.rotation.set(-0.08, 0.36 * s, 0);
      const closed = type === 'happy' || (type === 'wink' && s < 0);
      g.userData.blinks = !closed && type !== 'cool';
      if (closed) {
        // happy closed eye: a little upside-down U
        g.add(mesh(GEO.arc, MAT_BLACK, 0, -0.02, 0.045, 1.05, 1, 1));
      } else if (type === 'cool') {
        g.add(mesh(GEO.eyeWhite, MAT_LENS, 0, 0.01, 0, 1.02, 0.8, 0.44));
        const streak = mesh(GEO.shine, MAT_SHINE, -0.045, 0.045, 0.06, 0.05, 0.016, 0.01); streak.rotation.z = 0.6; g.add(streak);
        g.add(mesh(GEO.shine, MAT_SHINE, 0.06, -0.035, 0.055, 0.016, 0.016, 0.01));
      } else {
        g.add(mesh(GEO.eyeWhite, MAT_WHITE, 0, 0, 0, 1, 1.15, 0.42));
        const iris = new THREE.Group();
        const sparkle = type === 'sparkle';
        iris.add(mesh(GEO.iris, sparkle ? MAT_SPARKLE : MAT_IRIS, 0, 0, 0, sparkle ? 1.08 : 1, sparkle ? 1.2 : 1.1, 0.36));
        if (sparkle) iris.add(mesh(GEO.pupil, MAT_IRIS, 0, -0.01, 0.018, 1, 1.15, 0.3));
        iris.position.set(0, type === 'sleepy' ? -0.03 : -0.012, 0.03);
        iris.userData.base = iris.position.clone();
        g.add(iris); this.irises.push(iris);
        // shines: one big, one small, and an extra twinkle for sparkle eyes
        g.add(mesh(GEO.shine, MAT_SHINE, -0.036, 0.045, 0.068, 0.036, 0.04, 0.012));
        g.add(mesh(GEO.shine, MAT_SHINE, 0.036, -0.042, 0.066, 0.018, 0.018, 0.01));
        if (sparkle) g.add(mesh(GEO.shine, MAT_SHINE, 0.042, 0.04, 0.066, 0.012, 0.012, 0.01));
        if (type === 'sleepy') { const lid = mesh(GEO.lid, this.limbMat, 0, 0.004, 0, 1, 1.15, 0.47); lid.rotation.x = 0.55; g.add(lid); }
      }
      g.traverse(o => { if (o.isMesh) o.castShadow = false; });
      this.face.add(g); this.eyes.push(g);
    }
    if (type === 'cool') { const b = mesh(GEO.bridge, MAT_LENS, 0, EYE_Y + 0.02, BODY_R + 0.006); b.rotation.z = Math.PI / 2; b.userData.bridge = true; this.eyes.push(b); this.face.add(b); }
  }

  buildHat(type) {
    for (const o of [...this.hat.children]) { o.removeFromParent(); disposeTree(o); }
    buildHat(this.hat, type, this.skin.c2, this.limbMat);
  }
  buildOutfit(type) {
    for (const o of [...this.outfit.children]) { o.removeFromParent(); disposeTree(o); }
    for (const o of this.outfit.userData.extra) { o.removeFromParent(); disposeTree(o); }
    this.outfit.userData.extra = [];
    this.hat.visible = !COVERS_HEAD.has(type);
    buildOutfit(this.outfit, type, this);
    this.moving = []; this.outfit.traverse(o => { if (o.userData.sway || o.userData.flap || o.userData.wag || o.userData.blink !== undefined) { o.userData.rx = o.rotation.x; o.userData.rz = o.rotation.z; o.userData.ry = o.rotation.y; this.moving.push(o); } });
  }

  // st: { speed, grounded, vy, stun, swim, landV, celebrate, sad, groundDist }
  update(dt, st) {
    this.t += dt;
    const speed = st.speed || 0, run = clamp(speed / 8, 0, 1.3), P = this.pivot;
    // squash when landing, stretch when jumping
    if (st.grounded && !this.wasGrounded && (st.landV || 0) < -6) this.sqV = -6 - Math.min(10, -(st.landV || 0) * 0.4);
    if (!st.grounded && this.wasGrounded && st.vy > 4 && !st.swim) this.sqV = 7;
    this.wasGrounded = st.grounded || st.swim;
    this.sqV += (1 - this.sq) * 220 * dt; this.sqV *= Math.exp(-12 * dt); this.sq += this.sqV * dt;
    const sq = clamp(this.sq, 0.65, 1.35);
    P.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));

    let armL = 0, armR = 0, armZ = 0.15, legL = 0, legR = 0, bob = 0, leanT = 0, rollT = 0, baseY = 0.72;
    if (st.stun > 0 && !st.swim) {
      // knocked over: tumbling head over heels, arms and legs everywhere
      this.tumble.x += dt * (st.grounded ? 5 : 9); this.tumble.z += dt * (st.grounded ? 3 : 6.5);
      P.rotation.set(this.tumble.x, 0, this.tumble.z);
      armZ = 1.3 + Math.sin(this.t * 25) * 0.4; legL = Math.sin(this.t * 20); legR = -legL;
    } else {
      this.tumble.set(0, 0, 0);
      if (st.swim) {
        // doggy paddle: leaning forward, arms paddling in turns, little legs kicking
        this.phase += dt * (6 + speed * 1.2);
        const s = Math.sin(this.phase);
        armL = -1.6 + s * 1.1; armR = -1.6 - s * 1.1; armZ = 0.45;
        legL = Math.sin(this.t * 13) * 0.6; legR = -legL;
        leanT = 0.5 + run * 0.35; bob = Math.sin(this.t * 4) * 0.05; rollT = s * 0.12;
      } else if (st.grounded) {
        this.phase += dt * (4 + speed * 1.55);
        const s = Math.sin(this.phase);
        legL = s * 1.0 * run; legR = -s * 1.0 * run;
        armL = -s * 0.9 * run; armR = s * 0.9 * run;
        bob = Math.abs(Math.cos(this.phase)) * 0.09 * run;
        leanT = 0.22 * run;
        rollT = s * 0.13 * Math.min(1, run);          // the waddle
        if (run < 0.05) { bob = Math.sin(this.t * 2.4) * 0.015; armZ = 0.12 + Math.sin(this.t * 2.4) * 0.04; rollT = Math.sin(this.t * 1.3) * 0.03; }
      } else {
        // in the air: tucked legs going up, flailing arms when falling
        const falling = st.vy < -4;
        legL = -0.6; legR = 0.3;
        armL = armR = falling ? -2.6 + Math.sin(this.t * 22) * 0.5 : -1.9;
        armZ = falling ? 0.9 + Math.sin(this.t * 18) * 0.3 : 0.5;
        leanT = falling ? -0.15 : 0.1;
        if (falling && st.vy < -16) { legL = Math.sin(this.t * 24) * 0.9; legR = -legL; }
      }
      if (st.celebrate) { bob = Math.abs(Math.sin(this.t * 9)) * 0.35; armL = armR = -2.8 + Math.sin(this.t * 14) * 0.3; armZ = 0.7; }
      if (st.sad) { leanT = 0.45; armL = armR = 0.3; armZ = 0.05; bob = 0; }
      this.lean = damp(this.lean, leanT, 10, dt);
      P.rotation.x = damp(P.rotation.x, this.lean, 14, dt);
      P.rotation.z = damp(P.rotation.z, rollT, 12, dt);
      P.rotation.y = damp(P.rotation.y, 0, 10, dt);
    }
    // shivering when frozen
    const shiver = this.frozen > 0.5 ? Math.sin(this.t * 60) * 0.025 * this.frozen : 0;
    P.position.set(shiver, baseY + bob, 0);
    const a = this.arms, l = this.legs;
    a[0].rotation.x = damp(a[0].rotation.x, armL, 18, dt); a[1].rotation.x = damp(a[1].rotation.x, armR, 18, dt);
    a[0].rotation.z = damp(a[0].rotation.z, -armZ, 18, dt); a[1].rotation.z = damp(a[1].rotation.z, armZ, 18, dt);
    l[0].rotation.x = damp(l[0].rotation.x, legL, 20, dt); l[1].rotation.x = damp(l[1].rotation.x, legR, 20, dt);
    // blink, and look around now and then
    this.blinkT -= dt;
    const blink = this.blinkT < 0.12 ? 0.1 : 1;
    if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 3;
    this.eyes.forEach(e => { if (e.userData.blinks) e.scale.y = st.stun > 0 ? 0.3 : blink; });
    this.lookT -= dt;
    if (this.lookT < 0) { this.lookT = 0.8 + Math.random() * 2.2; this.lookTo.set(Math.random() < 0.45 ? 0 : (Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.024); }
    this.look.x = damp(this.look.x, this.lookTo.x, 14, dt); this.look.y = damp(this.look.y, this.lookTo.y, 14, dt);
    this.irises.forEach(i => { i.position.x = i.userData.base.x + this.look.x; i.position.y = i.userData.base.y + this.look.y; });
    const scared = st.stun > 0 || st.sad || st.scared;
    this.mouth.rotation.z = scared ? 0 : Math.PI;
    this.mouth.scale.setScalar(st.celebrate ? 1.35 : st.stun > 0 ? 1.4 : 1);
    this.hat.children.forEach(h => { if (h.userData.spin) h.rotation.y += dt * h.userData.spin * (h.userData.spin > 5 ? 1 + speed * 0.3 : 1); });
    // capes and tails swing, wings flap, robot lights blink
    for (const o of this.moving) {
      const u = o.userData;
      if (u.sway) o.rotation.x = u.rx + clamp(speed * 0.06, 0, 0.9) * u.sway + Math.sin(this.t * 7) * 0.06 * (0.3 + run) + (st.grounded ? 0 : 0.3);
      if (u.flap) o.rotation.y = u.ry + Math.sin(this.t * 40) * 0.4 * u.flap;
      if (u.wag) o.rotation.z = u.rz + Math.sin(this.t * 6) * 0.3;
      if (u.blink !== undefined && o.material) o.material.emissiveIntensity = (Math.sin(this.t * 4 + u.blink * 1.7) > 0) ? 1.6 : 0.2;
    }
    this.applyTint();
    // blob shadow on the ground below
    this.shadow.position.y = 0.03 - (st.groundDist || 0);
    this.shadow.visible = !st.swim && (st.groundDist || 0) < 25;
    this.shadow.scale.setScalar(clamp(1 - (st.groundDist || 0) * 0.06, 0.35, 1));
  }

  dispose() { this.root.removeFromParent(); this.buildHat('none'); this.buildOutfit('none'); this.bodyMat.dispose(); this.limbMat.dispose(); }
}

const SOOT = new THREE.Color('#2b2522'), ICE = new THREE.Color('#9fd6ff');
function disposeTree(o) { o.traverse(m => { if (m.geometry) m.geometry.dispose(); if (m.material) { if (m.material.map) m.material.map.dispose(); m.material.dispose(); } }); }
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
