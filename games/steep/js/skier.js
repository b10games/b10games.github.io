// The skier: a freestyle skier in a baggy jacket and pants, helmet and mirrored goggles, ski boots with
// buckles, twin-tip skis with bindings, and poles. Everything is animated in code, every frame:
//
//  - every part of the pose (hips, spine, chest, head, both feet with their skis, both hands, both pole
//    tips) has a target, and a spring pulls it there, so one movement always flows into the next
//  - the legs and arms are solved with two-bone IK (feet stay in the bindings, hands hold the poles,
//    pole tips can be planted in the snow)
//  - a landing, a bump or a wobble pushes the springs (the knees absorb it by themselves)
//  - short actions (pole plant, celebration, looking around, adjusting the goggles, leaning on the poles,
//    a fist pump...) are mixed in on top with smooth weights
//
// Space: the root sits on the snow between the boots, +z is where the skis point, +y is up (the snow's
// normal), +x is the skier's LEFT. The physics fills `skier.in` every frame (see ski.js).
import { THREE, canvasTex, clamp, lerp, smooth } from './engine.js';

const A = 0.44, B = 0.43;            // thigh and shin
const UA = 0.29, FA = 0.27;          // upper arm and forearm
const ANK = new THREE.Vector3(0, 0.14, -0.035);   // the ankle above the ski (inside the boot)
const POLE = 1.2;                    // grip to tip
export const PIVOT = 0.92;           // flips turn around the belly, this high above the feet
const STAND = 0.985;                 // the hips when standing relaxed
const V = () => new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0), UPV = new THREE.Vector3(0, 1, 0);
const _a = V(), _b = V(), _c = V(), _d = V(), _e = V(), _f = V(), _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _eu = new THREE.Euler(0, 0, 0, 'YXZ');

// ---------- outfits ----------
export const OUTFITS = [
  { id: 'blaze', name: 'Blaze', jacket: '#ff5a1f', accent: '#18243d', pants: '#2c3a52', helmet: '#f3f5f8', lens: '#ffb21c', frame: '#15171b', gloves: '#1b1d22', boots: '#eef1f5', bootAcc: '#ff5a1f', gaiter: '#18243d', ski: '#121821', skiA: '#ff5a1f', skiB: '#ffffff', base: '#ff5a1f' },
  { id: 'glacier', name: 'Glacier', jacket: '#7fd3ff', accent: '#ffffff', pants: '#e9eef5', helmet: '#1f2633', lens: '#5ad1ff', frame: '#ffffff', gloves: '#f2f5f9', boots: '#1f2633', bootAcc: '#7fd3ff', gaiter: '#ffffff', ski: '#f2f6fb', skiA: '#2a8cff', skiB: '#0f1a2b', base: '#0f1a2b' },
  { id: 'neon', name: 'Neon', jacket: '#c6ff2e', accent: '#0f1115', pants: '#0f1115', helmet: '#0f1115', lens: '#ff3df2', frame: '#c6ff2e', gloves: '#c6ff2e', boots: '#0f1115', bootAcc: '#c6ff2e', gaiter: '#0f1115', ski: '#0f1115', skiA: '#c6ff2e', skiB: '#ff3df2', base: '#c6ff2e' },
  { id: 'crimson', name: 'Crimson', jacket: '#d3122f', accent: '#f4f4f4', pants: '#141416', helmet: '#d3122f', lens: '#d9e2ee', frame: '#141416', gloves: '#141416', boots: '#f4f4f4', bootAcc: '#d3122f', gaiter: '#d3122f', ski: '#f4f4f4', skiA: '#d3122f', skiB: '#141416', base: '#141416' },
  { id: 'forest', name: 'Forest', jacket: '#3f6b3a', accent: '#e8d9b0', pants: '#5b4a35', helmet: '#e8d9b0', lens: '#ff8a3d', frame: '#2a2a24', gloves: '#5b4a35', boots: '#2a2a24', bootAcc: '#e8d9b0', gaiter: '#e8d9b0', ski: '#e8d9b0', skiA: '#3f6b3a', skiB: '#c0442b', base: '#3f6b3a' }
];

let FANCY = false;
export function setSkierQuality(q) { FANCY = q === 'high'; }
function std(c, rough = 0.7, o = {}) { return new THREE.MeshStandardMaterial({ color: c, roughness: rough, ...o }); }
function cloth(c, rough = 0.75) { return FANCY ? new THREE.MeshPhysicalMaterial({ color: c, roughness: rough, sheen: 0.7, sheenRoughness: 0.7, sheenColor: new THREE.Color('#ffffff') }) : std(c, rough); }
function gloss(c, rough = 0.35, o = {}) { return FANCY ? new THREE.MeshPhysicalMaterial({ color: c, roughness: rough, clearcoat: 0.8, clearcoatRoughness: 0.2, ...o }) : std(c, rough, o); }
const mesh = (g, m) => new THREE.Mesh(g, m);
function cap(r, len, m, seg = 12) { return mesh(new THREE.CapsuleGeometry(r, Math.max(0.001, len), 5, seg), m); }
function lathe(profile, m, seg = 22) { return mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg), m); }

// ---------- skis ----------
function skiShape(len, waist, tipW, tailW) {
  const hl = len / 2, s = new THREE.Shape(), N = 22, w = (t) => (waist + ((t > 0 ? tipW : tailW) - waist) * t * t) / 2;
  const e = 0.9;
  s.moveTo(-e * hl, -w(-e));
  for (let i = 1; i <= N; i++) { const t = -e + 2 * e * i / N; s.lineTo(t * hl, -w(t)); }
  s.quadraticCurveTo(hl, -w(e), hl, 0); s.quadraticCurveTo(hl, w(e), e * hl, w(e));
  for (let i = N - 1; i >= 0; i--) { const t = -e + 2 * e * i / N; s.lineTo(t * hl, w(t)); }
  s.quadraticCurveTo(-hl, w(-e), -hl, 0); s.quadraticCurveTo(-hl, -w(-e), -e * hl, -w(-e));
  return s;
}
function bendSki(g, len) {
  const p = g.attributes.position, hl = len / 2;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    const tip = Math.max(0, z - (hl - 0.24)) / 0.24, tail = Math.max(0, -z - (hl - 0.2)) / 0.2;
    // a little camber under the foot, a long rocker at the tip, a shorter one at the tail (twin tip)
    p.setY(i, p.getY(i) + tip * tip * 0.085 + tail * tail * 0.06 + 0.006 * Math.cos(z / hl * Math.PI / 2));
  }
  g.computeVertexNormals();
}
function skiGeometry(len = 1.78) {
  const shape = skiShape(len, 0.094, 0.124, 0.116);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.016, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 1, curveSegments: 6, steps: 1 });
  g.rotateX(-Math.PI / 2); g.rotateY(Math.PI / 2);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getZ(i) + len / 2) / len, (p.getX(i) + 0.065) / 0.13);
  bendSki(g, len);
  // the base, a little under the ski (its own colour, seen in every flip)
  const b = new THREE.ShapeGeometry(shape, 6); b.rotateX(Math.PI / 2); b.rotateY(Math.PI / 2); b.translate(0, -0.0035, 0);
  bendSki(b, len);
  return { top: g, base: b };
}
function skiTexture(o) {
  return canvasTex(1024, 96, (g, W, H) => {
    g.fillStyle = o.ski; g.fillRect(0, 0, W, H);
    // a chevron pattern at both ends and a stripe down the middle
    g.fillStyle = o.skiA;
    for (const [a, b] of [[0.02, 0.2], [0.74, 0.97]]) for (let x = a * W; x < b * W; x += 26) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 14, H / 2); g.lineTo(x, H); g.lineTo(x + 8, H); g.lineTo(x + 22, H / 2); g.lineTo(x + 8, 0); g.fill(); }
    g.fillRect(0.2 * W, H * 0.44, 0.54 * W, H * 0.12);
    g.fillStyle = o.skiB; g.fillRect(0.2 * W, H * 0.3, 0.54 * W, H * 0.05); g.fillRect(0.2 * W, H * 0.65, 0.54 * W, H * 0.05);
    g.save(); g.translate(W * 0.6, H / 2); g.rotate(Math.PI / 2 * 0); g.fillStyle = o.skiB;
    g.font = 'italic 900 58px "Barlow Condensed", Arial Narrow, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('STEEP', 0, 2);
    g.restore();
    g.fillStyle = o.skiB; g.font = '900 34px "Barlow Condensed", Arial Narrow, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('PRO MODEL', W * 0.33, H / 2 + 1);
  });
}
function baseTexture(o) {
  return canvasTex(512, 48, (g, W, H) => {
    g.fillStyle = '#16181c'; g.fillRect(0, 0, W, H);
    g.fillStyle = o.base; g.fillRect(W * 0.06, H * 0.2, W * 0.88, H * 0.6);
    g.fillStyle = '#16181c'; g.font = 'italic 900 34px "Barlow Condensed", Arial Narrow, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('STEEP  STEEP  STEEP', W / 2, H / 2 + 1);
  });
}
// the back of the jacket
function logoTexture(o) {
  return canvasTex(256, 96, (g, W, H) => {
    g.clearRect(0, 0, W, H);
    g.fillStyle = o.accent; g.font = 'italic 900 70px "Barlow Condensed", Arial Narrow, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('STEEP', W / 2, H / 2 + 4);
  });
}

// ---------- the boot: a side profile pushed out to its width ----------
function bootGeometry() {
  const s = new THREE.Shape();
  s.moveTo(-0.15, 0.03); s.lineTo(0.15, 0.03); s.quadraticCurveTo(0.172, 0.032, 0.17, 0.065); s.quadraticCurveTo(0.165, 0.095, 0.12, 0.1);
  s.quadraticCurveTo(0.06, 0.11, 0.045, 0.15); s.lineTo(0.045, 0.285); s.quadraticCurveTo(-0.03, 0.305, -0.1, 0.29); s.lineTo(-0.115, 0.15);
  s.quadraticCurveTo(-0.15, 0.12, -0.158, 0.06); s.lineTo(-0.15, 0.03);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.014, bevelSize: 0.012, bevelSegments: 2, curveSegments: 8 });
  g.translate(0, 0, -0.05); g.rotateY(-Math.PI / 2);     // shape x -> z (forward), width along x
  g.computeVertexNormals();
  return g;
}

// a critically damped spring for a Vector3 (or a number held in .x)
class Spring {
  constructor(x, y, z, w = 12) { this.x = new THREE.Vector3(x, y, z); this.v = new THREE.Vector3(); this.t = new THREE.Vector3(x, y, z); this.w = w; }
  step(dt, w = this.w) {
    // a stable implicit step: never overshoots wildly on a slow frame
    const k = w * w, c = 2 * w;
    _f.subVectors(this.t, this.x).multiplyScalar(k).addScaledVector(this.v, -c);
    this.v.addScaledVector(_f, dt / (1 + c * dt + k * dt * dt));
    this.x.addScaledVector(this.v, dt);
  }
  snap() { this.x.copy(this.t); this.v.set(0, 0, 0); }
}

export class Skier {
  constructor(outfit = OUTFITS[0]) {
    this.root = new THREE.Group();
    this.o = outfit;
    this.mats = {};
    this.build();
    this.setOutfit(outfit);
    // what the physics tells us (ski.js fills it)
    this.in = {
      grounded: true, speed: 0, incl: 0, brake: 0, skid: 0, plow: 0, tuck: 0, push: 0, sw: 0, charge: 0, airT: 0, takeoffT: 9,
      spin: 0, flip: 0, roll: 0, grab: 0, grabType: 'mute', preland: 0, wobble: 0, backseat: 0, fall: 0, lying: 0, getUp: 0,
      idle: 0, powder: 0, look: 0, pipe: 0, still: true, lookDown: 0, rail: 0, railSlide: 0
    };
    // the pose: every part has a spring
    const S = (x, y, z, w) => new Spring(x, y, z, w);
    this.P = {
      hip: S(0, STAND, -0.04, 15), hipR: S(0, 0, 0, 11), spine: S(0, 0, 0, 10), chest: S(0, 0, 0, 10), head: S(0, 0, 0, 8),
      fL: S(0.11, 0, 0, 20), fR: S(-0.11, 0, 0, 20), rL: S(0, 0, 0, 16), rR: S(0, 0, 0, 16),
      hL: S(0.3, 1.05, 0.25, 11), hR: S(-0.3, 1.05, 0.25, 11), tL: S(0.4, 0.05, -0.4, 11), tR: S(-0.4, 0.05, -0.4, 11)
    };
    this.t = 0; this.pushPh = 0;
    this.acts = [];                  // running actions: { type, t, dur, side, k }
    this.idleNext = 2.5;
    this.lastIncl = 0;
  }

  // ---------- the model ----------
  build() {
    const M = this.mats, R = this.root;
    M.jacket = cloth('#f50', 0.72); M.accent = cloth('#123', 0.7); M.pants = cloth('#234', 0.82); M.gaiter = cloth('#123', 0.85);
    M.helmet = gloss('#fff', 0.42, { metalness: 0.05 }); M.vent = std('#15171b', 0.6);
    M.lens = new THREE.MeshStandardMaterial({ color: '#fb0', roughness: 0.06, metalness: 1, emissive: '#000', envMapIntensity: 1.6 });
    M.frame = std('#111', 0.5); M.skin = std('#efc3a2', 0.7); M.gloves = cloth('#111', 0.8); M.boots = gloss('#eee', 0.32);
    M.bootAcc = std('#f50', 0.5); M.buckle = std('#c9ced6', 0.25, { metalness: 0.9 });
    M.skiTop = gloss('#fff', 0.3); M.skiBase = std('#fff', 0.45); M.edge = std('#9aa3ad', 0.25, { metalness: 0.9 });
    M.bind = std('#1b1d22', 0.45); M.bindA = std('#f50', 0.45); M.pole = std('#c9ced6', 0.22, { metalness: 0.85 }); M.grip = std('#15171b', 0.7);
    M.logo = new THREE.MeshStandardMaterial({ transparent: true, roughness: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });

    // ----- feet: ski, binding and the lower boot move together -----
    this.feet = [1, -1].map(s => {
      const f = new THREE.Group(); R.add(f);
      const sk = skiGeometry();
      const top = mesh(sk.top, M.skiTop); f.add(top);
      const base = mesh(sk.base, M.skiBase); f.add(base);
      // binding: a plate, the toe piece, the heel piece with its lever and the brake arms
      const plate = mesh(new THREE.BoxGeometry(0.072, 0.016, 0.46), M.bind); plate.position.set(0, 0.026, 0); f.add(plate);
      const toe = mesh(new THREE.BoxGeometry(0.078, 0.042, 0.07), M.bind); toe.position.set(0, 0.045, 0.19); f.add(toe);
      const toeCap = mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.04, 12), M.bindA); toeCap.rotation.x = Math.PI / 2; toeCap.position.set(0, 0.055, 0.215); f.add(toeCap);
      const heel = mesh(new THREE.BoxGeometry(0.074, 0.06, 0.1), M.bind); heel.position.set(0, 0.055, -0.205); f.add(heel);
      const lever = mesh(new THREE.BoxGeometry(0.05, 0.016, 0.12), M.bindA); lever.position.set(0, 0.09, -0.24); lever.rotation.x = 0.35; f.add(lever);
      for (const k of [-1, 1]) { const arm = mesh(new THREE.BoxGeometry(0.008, 0.008, 0.09), M.buckle); arm.position.set(k * 0.05, 0.03, -0.13); arm.rotation.x = -0.4; f.add(arm); }
      // the boot shell with buckles and a power strap
      const boot = mesh(bootGeometry(), M.boots); boot.position.y = 0.012; f.add(boot);
      const sole = mesh(new THREE.BoxGeometry(0.11, 0.022, 0.31), M.bind); sole.position.set(0, 0.046, 0.005); f.add(sole);
      for (const [y, z, r] of [[0.115, 0.1, -0.55], [0.18, 0.06, -0.15], [0.245, 0.06, 0]]) {
        const b = mesh(new THREE.BoxGeometry(0.13, 0.016, 0.035), M.buckle); b.position.set(0, y + 0.012, z); b.rotation.x = r; f.add(b);
      }
      const strap = mesh(new THREE.BoxGeometry(0.135, 0.03, 0.03), M.bootAcc); strap.position.set(0, 0.29, 0.035); f.add(strap);
      const shell = mesh(new THREE.BoxGeometry(0.128, 0.05, 0.16), M.bootAcc); shell.position.set(0, 0.075, -0.06); f.add(shell);
      return { g: f, s };
    });

    // ----- pelvis, spine, chest, head -----
    const pelvis = this.pelvis = new THREE.Group(); R.add(pelvis);
    const seat = mesh(new THREE.SphereGeometry(0.16, 16, 12), M.pants); seat.scale.set(1.15, 0.8, 0.95); seat.position.y = -0.05; pelvis.add(seat);
    // the jacket is long and baggy (it covers the hips)
    const hem = lathe([[0.0, -0.13], [0.192, -0.13], [0.198, -0.1], [0.19, 0.0], [0.184, 0.12], [0.0, 0.12]], M.jacket); hem.scale.set(1.1, 1, 0.84); pelvis.add(hem);
    const hemBand = mesh(new THREE.CylinderGeometry(0.2, 0.202, 0.03, 22, 1, true), M.accent); hemBand.position.y = -0.115; hemBand.scale.set(1.1, 1, 0.84); pelvis.add(hemBand);
    const spine = this.spine = new THREE.Group(); spine.position.y = 0.07; pelvis.add(spine);
    const belly = lathe([[0.0, -0.04], [0.182, -0.04], [0.186, 0.08], [0.19, 0.2], [0.0, 0.2]], M.jacket); belly.scale.set(1.08, 1, 0.8); spine.add(belly);
    const chest = this.chest = new THREE.Group(); chest.position.y = 0.17; spine.add(chest);
    const torso = lathe([[0.0, -0.06], [0.188, -0.06], [0.2, 0.06], [0.206, 0.16], [0.198, 0.24], [0.16, 0.29], [0.09, 0.325], [0.0, 0.33]], M.jacket); torso.scale.set(1.1, 1, 0.8); chest.add(torso);
    // a colour-blocked yoke over the shoulders, the zip, a chest pocket, the hood and the logo on the back
    const yoke = mesh(new THREE.SphereGeometry(0.213, 22, 10, 0, Math.PI * 2, 0, Math.PI * 0.32), M.accent); yoke.position.y = 0.085; yoke.scale.set(1.1, 1.05, 0.82); chest.add(yoke);
    const zip = mesh(new THREE.BoxGeometry(0.022, 0.4, 0.012), M.accent); zip.position.set(0, 0.07, 0.165); zip.rotation.x = -0.05; chest.add(zip);
    const pocket = mesh(new THREE.BoxGeometry(0.1, 0.07, 0.02), M.accent); pocket.position.set(0.09, 0.12, 0.158); pocket.rotation.y = 0.25; chest.add(pocket);
    const hood = mesh(new THREE.SphereGeometry(0.13, 14, 10), M.jacket); hood.scale.set(1.15, 0.62, 0.7); hood.position.set(0, 0.3, -0.11); chest.add(hood);
    const collar = mesh(new THREE.CylinderGeometry(0.088, 0.115, 0.1, 16), M.jacket); collar.position.y = 0.33; chest.add(collar);
    const logo = mesh(new THREE.PlaneGeometry(0.26, 0.1), M.logo); logo.position.set(0, 0.15, -0.168); logo.rotation.y = Math.PI; chest.add(logo);
    this.shoulderPads = [1, -1].map(s => { const sh = mesh(new THREE.SphereGeometry(0.083, 12, 10), M.jacket); sh.position.set(s * 0.19, 0.245, 0); chest.add(sh); return sh; });
    const neck = this.neck = new THREE.Group(); neck.position.y = 0.32; chest.add(neck);
    const gaiter = mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.11, 14), M.gaiter); gaiter.position.y = 0.03; neck.add(gaiter);
    const head = this.head = new THREE.Group(); head.position.y = 0.1; neck.add(head);
    const face = mesh(new THREE.SphereGeometry(0.098, 18, 14), M.skin); face.scale.set(0.94, 1.08, 1); face.position.set(0, 0.0, 0.01); head.add(face);
    // the gaiter pulled up over the mouth and nose
    const buff = mesh(new THREE.SphereGeometry(0.104, 18, 10, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.45), M.gaiter); buff.scale.set(0.96, 1.1, 1.04); buff.position.set(0, 0.006, 0.012); head.add(buff);
    const helmet = mesh(new THREE.SphereGeometry(0.128, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.56), M.helmet); helmet.scale.set(1, 1.02, 1.1); helmet.position.set(0, 0.025, -0.008); head.add(helmet);
    for (const s of [-1, 1]) { const ear = mesh(new THREE.SphereGeometry(0.05, 12, 8), M.helmet); ear.scale.set(0.5, 1, 0.9); ear.position.set(s * 0.104, -0.012, -0.005); head.add(ear); }
    for (const x of [-0.04, 0, 0.04]) { const v = mesh(new THREE.BoxGeometry(0.014, 0.008, 0.09), M.vent); v.position.set(x, 0.148, -0.01); v.rotation.x = 0.1; head.add(v); }
    // goggles: a frame, a mirrored lens, and the strap round the back of the helmet
    const frame = mesh(new THREE.CylinderGeometry(0.118, 0.118, 0.066, 24, 1, true, -1.25, 2.5), M.frame); frame.position.set(0, 0.028, 0.0); frame.scale.set(1, 1, 1.12); head.add(frame);
    const lens = mesh(new THREE.CylinderGeometry(0.1215, 0.1215, 0.052, 24, 1, true, -1.12, 2.24), M.lens); lens.position.set(0, 0.028, 0.0); lens.scale.set(1, 1, 1.12); head.add(lens);
    const gstrap = mesh(new THREE.CylinderGeometry(0.133, 0.133, 0.036, 24, 1, true, 1.2, Math.PI * 2 - 2.4), M.accent); gstrap.position.set(0, 0.03, -0.006); gstrap.scale.set(1, 1, 1.12); head.add(gstrap);

    // ----- arms (solved in root space) -----
    this.arms = [1, -1].map(s => {
      const up = new THREE.Group(); R.add(up);
      const um = cap(0.066, UA - 0.08, M.jacket); um.position.y = -UA / 2; up.add(um);
      const badge = mesh(new THREE.BoxGeometry(0.05, 0.05, 0.012), M.accent); badge.position.set(s * 0.062, -0.07, 0); badge.rotation.y = s * Math.PI / 2; up.add(badge);
      const el = new THREE.Group(); el.position.y = -UA; up.add(el);
      const elb = mesh(new THREE.SphereGeometry(0.064, 10, 8), M.jacket); el.add(elb);
      const fm = cap(0.061, FA - 0.1, M.jacket); fm.position.y = -FA / 2 + 0.01; el.add(fm);
      const cuff = mesh(new THREE.CylinderGeometry(0.066, 0.058, 0.07, 12), M.gloves); cuff.position.y = -FA + 0.05; el.add(cuff);
      const hand = new THREE.Group(); hand.position.y = -FA; el.add(hand);
      const mitt = mesh(new THREE.SphereGeometry(0.058, 12, 10), M.gloves); mitt.scale.set(0.82, 1.25, 1.05); mitt.position.y = -0.04; hand.add(mitt);
      const thumb = cap(0.022, 0.035, M.gloves, 8); thumb.position.set(s * -0.005, -0.03, 0.045); thumb.rotation.x = 0.7; hand.add(thumb);
      return { up, el, hand, s };
    });
    // ----- poles -----
    this.poles = [1, -1].map(() => {
      const g = new THREE.Group(); R.add(g);
      const grip = mesh(new THREE.CylinderGeometry(0.019, 0.016, 0.15, 10), M.grip); grip.position.y = -0.05; g.add(grip);
      const loop = mesh(new THREE.TorusGeometry(0.035, 0.006, 5, 12), M.bindA); loop.position.y = 0.02; loop.rotation.y = Math.PI / 2; loop.scale.set(1, 1.6, 1); g.add(loop);
      const shaft = mesh(new THREE.CylinderGeometry(0.0095, 0.0075, POLE - 0.1, 7), M.pole); shaft.position.y = -POLE / 2 - 0.05; g.add(shaft);
      const basket = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.008, 12), M.bind); basket.position.y = -POLE + 0.08; g.add(basket);
      const tip = mesh(new THREE.ConeGeometry(0.008, 0.05, 6), M.buckle); tip.rotation.x = Math.PI; tip.position.y = -POLE + 0.02; g.add(tip);
      return g;
    });
    // ----- legs (solved in root space) -----
    this.legs = [1, -1].map(s => {
      const th = new THREE.Group(); R.add(th);
      const tm = cap(0.098, A - 0.12, M.pants); tm.position.y = -A / 2; th.add(tm);
      const kn = new THREE.Group(); kn.position.y = -A; th.add(kn);
      const kp = mesh(new THREE.SphereGeometry(0.092, 12, 10), M.pants); kn.add(kp);
      const pad = mesh(new THREE.SphereGeometry(0.06, 10, 8), M.accent); pad.scale.set(1, 1, 0.45); pad.position.set(0, 0.0, 0.07); kn.add(pad);
      const sm = cap(0.09, B - 0.16, M.pants); sm.position.y = -B / 2 + 0.03; kn.add(sm);
      // the pants are wide at the bottom and go over the boot
      const flare = mesh(new THREE.CylinderGeometry(0.098, 0.118, 0.15, 14), M.pants); flare.position.y = -B + 0.13; kn.add(flare);
      const cuffB = mesh(new THREE.CylinderGeometry(0.075, 0.08, 0.12, 12), M.boots); cuffB.position.y = -B + 0.06; kn.add(cuffB);
      return { th, kn, s };
    });
    this.root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
    M.logo.userData.noShadow = true;
  }
  setOutfit(o) {
    this.o = o; const M = this.mats;
    M.jacket.color.set(o.jacket); M.accent.color.set(o.accent); M.pants.color.set(o.pants); M.gaiter.color.set(o.gaiter);
    M.helmet.color.set(o.helmet); M.lens.color.set(o.lens); M.lens.emissive.set(o.lens); M.lens.emissiveIntensity = 0.18;
    M.frame.color.set(o.frame); M.gloves.color.set(o.gloves); M.boots.color.set(o.boots); M.bootAcc.color.set(o.bootAcc); M.bindA.color.set(o.bootAcc);
    if (M.skiTop.map) M.skiTop.map.dispose(); if (M.skiBase.map) M.skiBase.map.dispose(); if (M.logo.map) M.logo.map.dispose();
    M.skiTop.map = skiTexture(o); M.skiBase.map = baseTexture(o); M.logo.map = logoTexture(o);
    for (const m of [M.skiTop, M.skiBase, M.logo]) { m.map.wrapS = m.map.wrapT = THREE.ClampToEdgeWrapping; m.needsUpdate = true; }
  }
  // shiny parts that reflect the sky
  envMats() { return [this.mats.lens, this.mats.helmet, this.mats.boots, this.mats.skiTop, this.mats.pole, this.mats.buckle]; }

  // ---------- placing it in the world ----------
  // feet on the snow at pos, turned by quat; in the air (pivot 1) the rotation is around the belly
  place(pos, quat, pivot = 0) {
    this.root.quaternion.copy(quat);
    _a.set(0, PIVOT, 0).applyQuaternion(quat);
    this.root.position.set(pos.x - _a.x * pivot, pos.y + (PIVOT - _a.y) * pivot, pos.z - _a.z * pivot);
  }

  // ---------- one-off actions ----------
  act(type, dur, o = {}) {
    // the same action again restarts it; a few kinds replace each other
    this.acts = this.acts.filter(a => a.type !== type && !(o.exclusive && a.exclusive));
    this.acts.push({ type, t: 0, dur, side: o.side || 1, k: o.k ?? 1, exclusive: !!o.exclusive });
  }
  has(type) { return this.acts.some(a => a.type === type); }
  // the knees take a hit (landing, a bump): k in m/s downwards
  impact(k) { this.P.hip.v.y -= k; this.P.hipR.v.x += k * 0.6; this.P.chest.v.x += k * 0.5; this.P.hL.v.y -= k * 0.4; this.P.hR.v.y -= k * 0.4; }
  bump(k) { this.P.hip.v.y -= k; this.P.hL.v.y += k * 0.3; this.P.hR.v.y += k * 0.3; }
  plant(side) { if (!this.has('plant')) this.act('plant', 0.42, { side }); }
  celebrate(big) { this.act(big ? 'celebrateBig' : 'fist', big ? 1.8 : 1.1, { side: Math.random() < 0.5 ? 1 : -1, exclusive: true }); }
  // jump the pose to where it should be (after a teleport)
  snap() { this.update(0.016, true); for (const k in this.P) this.P[k].snap(); this.update(0, true); }

  // ---------- every frame ----------
  update(dt, noStep = false) {
    const I = this.in, P = this.P;
    this.t += dt; const t = this.t;
    for (const a of this.acts) a.t += dt;
    this.acts = this.acts.filter(a => a.t < a.dur);
    const w = (type) => { let s = 0; for (const a of this.acts) if (a.type === type) s = Math.max(s, env(a)); return s; };
    const env = (a) => { const r = Math.min(0.22, a.dur * 0.3); return smooth(0, r, a.t) * (1 - smooth(a.dur - r, a.dur, a.t)); };
    this.idleActions(dt);

    const sp = smooth(0.5, 15, I.speed);
    const air = !I.grounded && !I.fall && !I.rail;
    const ch = I.charge > 0 ? 0.35 + 0.65 * Math.sqrt(I.charge) : 0;
    const incl = clamp(I.incl, -0.8, 0.8);
    // ======== ground stance ========
    let hipH = lerp(STAND, 0.875, sp) - I.tuck * 0.27 - ch * 0.33 - I.plow * 0.04 - I.brake * 0.13 - I.powder * 0.06;
    let hipZ = -0.04 - 0.05 * sp - I.tuck * 0.1 - I.brake * 0.04 - I.backseat * 0.2;
    let pitch = 0.1 + 0.18 * sp + I.tuck * 0.55 + ch * 0.55 + I.brake * 0.15 - I.backseat * 0.25;
    let spineP = 0.03 + 0.08 * sp + I.tuck * 0.32 + ch * 0.15, chestP = 0.02 + I.tuck * 0.12 + ch * 0.1 + I.backseat * 0.35;
    let hipX = Math.sin(incl) * hipH * 0.78, hipRoll = -incl * 0.55;
    hipH *= Math.cos(incl * 0.85);
    let spineRoll = incl * 0.3, chestRoll = incl * 0.2, chestYaw = -I.skid * 0.55 + I.sw * 0.35 * (I.look >= 0 ? 1 : -1), hipYaw = -I.skid * 0.25;
    // feet: a little wider when slow, the inside ski a little ahead in a turn, on edge
    const stance = lerp(0.125, 0.105, sp) + I.plow * 0.2 - I.tuck * 0.01;
    const edge = clamp(-incl * 1.2, -1.05, 1.05);
    let fL = [stance, Math.max(0, incl) * 0.05, 0.03 * incl * 2], fR = [-stance, Math.max(0, -incl) * 0.05, -0.03 * incl * 2];
    let rL = [0, -0.3 * I.plow, edge + 0.26 * I.plow], rR = [0, 0.3 * I.plow, edge - 0.26 * I.plow];
    if (I.backseat) { rL[0] = rR[0] = -0.22 * I.backseat; }
    // hands forward and out, poles back
    const hy = hipH + 0.16 + I.tuck * 0.12 + ch * 0.05;
    let hL = [0.3 - I.tuck * 0.14 - ch * 0.05, hy, 0.26 + I.tuck * 0.2 + ch * 0.12], hR = [-hL[0], hy, hL[2]];
    let tL = [0.42 - I.tuck * 0.15, 0.08 + I.tuck * 0.45, -0.42 - I.tuck * 0.5], tR = [-tL[0], tL[1], tL[2]];
    // turning: the hands follow the upper body, the inside hand a bit lower
    hL[1] -= Math.max(0, incl) * 0.12; hR[1] -= Math.max(0, -incl) * 0.12;
    // looking: where you go, into the turn, over the shoulder when riding backwards
    let headYaw = incl * 0.35 + I.look * 0.9 + I.sw * 1.15 * (I.look >= 0 ? 1 : -1), headPitch = -pitch * 0.6 - spineP * 0.5 - chestP * 0.4 + 0.05, headRoll = incl * 0.25;
    if (I.sw) { chestYaw += 0; hL[2] -= 0.1 * I.sw; hR[2] -= 0.1 * I.sw; }
    // charging: arms back ready to swing; the longer you hold, the lower you go (and it starts to shake)
    if (ch) {
      hL[2] = lerp(hL[2], -0.12, ch); hR[2] = lerp(hR[2], -0.12, ch); hL[1] = lerp(hL[1], hipH + 0.1, ch); hR[1] = hL[1];
      tL[2] = lerp(tL[2], -0.85, ch); tR[2] = tL[2]; tL[1] = tR[1] = lerp(tL[1], 0.35, ch);
      const shake = smooth(0.8, 1, I.charge) * Math.sin(t * 60) * 0.006; hipH += shake;
    }
    // double-pole pushing when slow (W)
    if (I.push > 0.01) {
      this.pushPh = (this.pushPh + dt * 1.15) % 1;
      const ph = this.pushPh, k = I.push;
      const reach = ph < 0.35 ? smooth(0, 0.35, ph) : ph < 0.72 ? 1 - smooth(0.35, 0.72, ph) : smooth(0.72, 1, ph) * 0.0;
      const push = ph >= 0.35 && ph < 0.72 ? smooth(0.35, 0.72, ph) : ph >= 0.72 ? 1 - smooth(0.72, 1, ph) : 0;
      const handZ = lerp(-0.15, 0.48, reach) - push * 0.25, handY = hipH + lerp(0.1, 0.42, reach) - push * 0.12;
      const tipZ = ph < 0.35 ? lerp(-0.4, 0.2, reach) : ph < 0.72 ? lerp(0.2, -0.75, push) : lerp(-0.75, -0.3, smooth(0.72, 1, ph));
      const tipY = ph < 0.3 || ph >= 0.72 ? 0.2 : 0.0;
      for (const [h, tp, s] of [[hL, tL, 1], [hR, tR, -1]]) {
        h[0] = lerp(h[0], s * 0.27, k); h[1] = lerp(h[1], handY, k); h[2] = lerp(h[2], handZ, k);
        tp[0] = lerp(tp[0], s * 0.3, k); tp[1] = lerp(tp[1], tipY, k); tp[2] = lerp(tp[2], tipZ, k);
      }
      pitch += push * 0.5 * k; spineP += push * 0.25 * k; hipH -= push * 0.07 * k;
    }
    // ======== in the air ========
    if (air) {
      const up = smooth(0, 0.22, I.takeoffT);                    // 0 just after the pop (still stretched)
      const rot = clamp(Math.max(Math.abs(I.flip), Math.abs(I.roll)) / 6, 0, 1), spin = clamp(Math.abs(I.spin) / 7, 0, 1);
      const pre = I.preland;
      let tuck = clamp(0.32 + rot * 0.65 + I.grab * 0.15, 0, 1) * up * (1 - pre * 0.8);
      hipH = lerp(1.0, 0.95 - tuck * 0.32, up); hipX = 0; hipRoll = 0; hipZ = -0.02;
      pitch = lerp(0.05, 0.2 + rot * 0.5, up) + pre * 0.1; spineP = 0.05 + rot * 0.25; chestP = 0.05 + rot * 0.1;
      spineRoll = chestRoll = 0; chestYaw = Math.sign(I.spin) * spin * 0.4; hipYaw = 0;
      const fy = tuck * 0.34, fz = tuck * 0.06;
      fL = [0.12, fy, fz]; fR = [-0.12, fy, fz]; rL = [-pre * 0.05, 0, 0]; rR = [-pre * 0.05, 0, 0];
      // arms: up as you pop, out wide for balance, in tight when spinning, on the knees in a flip
      const out = (1 - spin) * (1 - rot);
      const ay = hipH + 0.2 + (1 - up) * 0.4;
      hL = [lerp(0.2, 0.46, out), ay + out * 0.08, lerp(0.22, 0.12, out) + (1 - up) * 0.15]; hR = [-hL[0], hL[1], hL[2]];
      if (rot > 0.05) { const k = rot * up; for (const [h, s] of [[hL, 1], [hR, -1]]) { h[0] = lerp(h[0], s * 0.17, k); h[1] = lerp(h[1], fy + 0.5, k); h[2] = lerp(h[2], 0.32, k); } }
      if (spin > 0.05) { const k = spin * up * (1 - rot); for (const [h, s] of [[hL, 1], [hR, -1]]) { h[0] = lerp(h[0], s * 0.14, k); h[1] = lerp(h[1], hipH + 0.36, k); h[2] = lerp(h[2], 0.2, k); } }
      tL = [0.35 * out + 0.1, hL[1] - 0.6, -0.85]; tR = [-tL[0], tL[1], tL[2]];
      headYaw = Math.sign(I.spin) * spin * 0.55; headPitch = -pitch * 0.5 + 0.1 + pre * 0.35; headRoll = 0;
      // reaching for the snow just before touching down
      if (pre > 0) { for (const h of [hL, hR]) { h[1] = lerp(h[1], hipH + 0.15, pre); h[2] = lerp(h[2], 0.38, pre); } }
      // ---- grabs ----
      const g = I.grab;
      if (g > 0.01) this.grabPose(I.grabType, g, { fL, fR, rL, rR, hL, hR, tL, tR }, (v) => { hipH = lerp(hipH, v.hipH ?? hipH, g); pitch += (v.pitch || 0) * g; headPitch += (v.head || 0) * g; });
    }
    // ======== on a rail ========
    if (I.rail) {
      const k = I.rail, sl = I.railSlide;
      hipH = lerp(hipH, 0.86, k); pitch = lerp(pitch, 0.25, k); chestYaw = lerp(chestYaw, sl * -1.2, k); headYaw = lerp(headYaw, sl * -1.35, k);
      hL = [lerp(hL[0], 0.5, k), lerp(hL[1], hipH + 0.32, k), lerp(hL[2], 0.1, k)]; hR = [lerp(hR[0], -0.5, k), hL[1] + Math.sin(t * 5) * 0.03, hL[2]];
      fL[0] = lerp(fL[0], 0.12, k); fR[0] = lerp(fR[0], -0.12, k); rL[2] = rR[2] = 0;
    }
    // ======== a fall: lying in the snow, then getting up ========
    if (I.fall > 0.01) {
      const ly = I.lying, gu = I.getUp, k = I.fall;
      // lying on the back, legs out in front, arms out
      const lyHip = { h: 0.16, p: -1.42, z: 0.0 };
      const s1 = smooth(0, 0.45, gu), s2 = smooth(0.4, 1, gu);
      const hH = lerp(lerp(lerp(hipH, 0.45, smooth(0, 0.3, ly)), lyHip.h, smooth(0.3, 1, ly)), 0.34, s1);
      const fallFlail = (1 - ly) * Math.sin(t * 11);
      const pp = lerp(lerp(-0.4, lyHip.p, ly), -0.25, s1);
      const fz = lerp(0.72 * ly, 0.12, s1);
      const tgtHip = lerp(hH, STAND - 0.04, s2), tgtP = lerp(pp, 0.18, s2), tgtFz = lerp(fz, 0, s2);
      hipH = lerp(hipH, tgtHip, k); pitch = lerp(pitch, tgtP, k); hipZ = lerp(hipZ, lerp(-0.25 * ly, -0.12, s1) * (1 - s2), k); hipX = lerp(hipX, 0, k); hipRoll = lerp(hipRoll, (1 - s1) * 0.25 * ly, k);
      spineP = lerp(spineP, lerp(0.25 * ly, 0.35, s1) * (1 - s2) + s2 * 0.05, k); chestP = lerp(chestP, lerp(0.3 * ly, 0.2, s1) * (1 - s2), k);
      const fy = lerp(0.1 * ly, 0.02, s1) * (1 - s2);
      for (const [f, r, s] of [[fL, rL, 1], [fR, rR, -1]]) {
        f[0] = lerp(f[0], s * lerp(0.2, 0.15, s1), k); f[1] = lerp(f[1], fy + (s > 0 ? 0.08 * ly * (1 - s1) : 0), k); f[2] = lerp(f[2], tgtFz + (s > 0 ? 0.1 : -0.05) * ly * (1 - s2), k);
        r[0] = lerp(r[0], 0, k); r[1] = lerp(r[1], s * 0.25 * ly * (1 - s2), k); r[2] = lerp(r[2], -s * 0.4 * ly * (1 - s1), k);
      }
      // the arms: flailing while tumbling, out flat while lying, pushing on the snow to get up
      for (const [h, tp, s] of [[hL, tL, 1], [hR, tR, -1]]) {
        const lyH = [s * 0.65, 0.12, 0.25], upH = [s * 0.42, 0.05, -0.05];
        const x = lerp(lerp(s * 0.55, lyH[0], ly), upH[0], s1), y = lerp(lerp(1.3 + fallFlail * s * 0.3, lyH[1], ly), upH[1], s1), z = lerp(lerp(0.2, lyH[2], ly), upH[2], s1);
        h[0] = lerp(h[0], lerp(x, h[0], s2), k); h[1] = lerp(h[1], lerp(y, h[1], s2), k); h[2] = lerp(h[2], lerp(z, h[2], s2), k);
        tp[0] = lerp(tp[0], lerp(s * 1.1, tp[0], s2), k); tp[1] = lerp(tp[1], lerp(0.1, tp[1], s2), k); tp[2] = lerp(tp[2], lerp(-0.3, tp[2], s2), k);
      }
      headPitch = lerp(headPitch, lerp(0.5 * ly, 0.2, s1) * (1 - s2), k); headYaw = lerp(headYaw, Math.sin(t * 0.8) * 0.4 * ly * (1 - s1), k);
    }
    // ======== wobbling (unstable landing): arms windmill, hips sway, a ski comes up ========
    if (I.wobble > 0.01 && !air) {
      const k = I.wobble, ph = t * 9;
      hipX += Math.sin(t * 5.3) * 0.09 * k; hipRoll += Math.sin(t * 5.3 + 1) * 0.15 * k; chestRoll += Math.sin(t * 6.1) * 0.25 * k;
      for (const [h, s] of [[hL, 1], [hR, -1]]) { h[0] += s * 0.2 * k; h[1] += (0.25 + Math.sin(ph + s * 1.6) * 0.3) * k; h[2] += Math.cos(ph + s * 1.6) * 0.3 * k; }
      const lift = Math.max(0, Math.sin(t * 4.2)) * 0.13 * k; if (Math.sin(t * 2.1) > 0) fL[1] += lift; else fR[1] += lift;
      headRoll -= Math.sin(t * 5.3 + 1) * 0.12 * k;
    }
    // ======== actions on top ========
    let a;
    if ((a = w('plant')) > 0) {
      // a quick plant of the inside pole as a turn starts
      const act = this.acts.find(x => x.type === 'plant'), s = act.side, p = clamp(act.t / act.dur, 0, 1), h = s > 0 ? hL : hR, tp = s > 0 ? tL : tR;
      h[2] += 0.18 * a; h[1] -= 0.08 * a; h[0] += s * 0.04 * a;
      tp[0] = lerp(tp[0], s * 0.42, a); tp[1] = lerp(tp[1], -0.02, a); tp[2] = lerp(tp[2], 0.38 - p * I.speed * 0.4, a);
    }
    if ((a = w('fist')) > 0) {
      const act = this.acts.find(x => x.type === 'fist'), s = act.side, h = s > 0 ? hL : hR, tp = s > 0 ? tL : tR, pump = Math.abs(Math.sin(act.t * 9)) * 0.12;
      h[0] = lerp(h[0], s * 0.32, a); h[1] = lerp(h[1], hipH + 0.95 + pump, a); h[2] = lerp(h[2], 0.1, a);
      tp[0] = lerp(tp[0], s * 0.5, a); tp[1] = lerp(tp[1], hipH + 1.8, a); tp[2] = lerp(tp[2], -0.6, a);
      headPitch -= 0.15 * a;
    }
    if ((a = w('celebrateBig')) > 0) {
      const act = this.acts.find(x => x.type === 'celebrateBig'), pump = Math.abs(Math.sin(act.t * 7)) * 0.1;
      for (const [h, tp, s] of [[hL, tL, 1], [hR, tR, -1]]) {
        h[0] = lerp(h[0], s * 0.42, a); h[1] = lerp(h[1], hipH + 0.92 + pump, a); h[2] = lerp(h[2], 0.12, a);
        tp[0] = lerp(tp[0], s * 1.1, a); tp[1] = lerp(tp[1], hipH + 1.5, a); tp[2] = lerp(tp[2], -0.5, a);
      }
      headPitch -= 0.3 * a; chestP -= 0.15 * a; hipH += 0.03 * a;
    }
    if ((a = w('look')) > 0) { const act = this.acts.find(x => x.type === 'look'); headYaw += act.side * 1.05 * a * Math.sin(Math.min(1, act.t / act.dur) * Math.PI * 2 * 0.5 + 0.3) ; chestYaw += act.side * 0.25 * a; headPitch -= 0.08 * a; }
    if ((a = w('goggles')) > 0) {
      // the right hand up to the goggles, pushing them straight
      const act = this.acts.find(x => x.type === 'goggles'), wig = Math.sin(act.t * 14) * 0.012;
      hR[0] = lerp(hR[0], -0.07, a); hR[1] = lerp(hR[1], hipH + 0.73 + wig, a); hR[2] = lerp(hR[2], 0.17, a);
      tR[0] = lerp(tR[0], -0.4, a); tR[1] = lerp(tR[1], hipH + 1.4, a); tR[2] = lerp(tR[2], -0.8, a);
      headPitch -= 0.1 * a;
    }
    if ((a = w('lean')) > 0) {
      // both poles in front, leaning on them, looking at the view
      for (const [h, tp, s] of [[hL, tL, 1], [hR, tR, -1]]) { h[0] = lerp(h[0], s * 0.16, a); h[1] = lerp(h[1], 1.08, a); h[2] = lerp(h[2], 0.43, a); tp[0] = lerp(tp[0], s * 0.24, a); tp[1] = lerp(tp[1], -0.05, a); tp[2] = lerp(tp[2], 0.5, a); }
      pitch += 0.22 * a; spineP += 0.08 * a; hipH -= 0.03 * a; headPitch -= 0.12 * a;
    }
    if ((a = w('tap')) > 0) {
      // knock the snow off the boots with a pole
      const act = this.acts.find(x => x.type === 'tap'), k2 = Math.abs(Math.sin(act.t * 10));
      hR[0] = lerp(hR[0], -0.28, a); hR[1] = lerp(hR[1], hipH + 0.15 + k2 * 0.06, a); hR[2] = lerp(hR[2], 0.18, a);
      tR[0] = lerp(tR[0], 0.02, a); tR[1] = lerp(tR[1], 0.12 + k2 * 0.12, a); tR[2] = lerp(tR[2], 0.12, a);
      headPitch += 0.35 * a; headYaw -= 0.2 * a; pitch += 0.15 * a;
    }
    if ((a = w('stretch')) > 0) {
      const act = this.acts.find(x => x.type === 'stretch'), s = Math.sin(act.t * 2) * 0.2;
      for (const [h, tp, sd] of [[hL, tL, 1], [hR, tR, -1]]) { h[0] = lerp(h[0], sd * 0.2 + s, a); h[1] = lerp(h[1], hipH + 1.0, a); h[2] = lerp(h[2], 0.02, a); tp[0] = lerp(tp[0], sd * 0.7 + s, a); tp[1] = lerp(tp[1], hipH + 1.3, a); tp[2] = lerp(tp[2], -0.6, a); }
      chestRoll += s * 0.8 * a; headPitch -= 0.1 * a;
    }
    if ((a = w('shift')) > 0) { const act = this.acts.find(x => x.type === 'shift'); hipX += Math.sin(act.t * 2.4) * 0.07 * a; hipRoll += Math.sin(act.t * 2.4) * 0.08 * a; }
    // breathing
    const br = Math.sin(t * (I.speed < 1 ? 1.9 : 2.6)) * (I.speed < 1 ? 0.01 : 0.004);
    chestP += br;

    // ======== to the springs ========
    P.hip.t.set(hipX, hipH, hipZ); P.hipR.t.set(pitch, hipYaw, hipRoll);
    P.spine.t.set(spineP, chestYaw * 0.4, spineRoll); P.chest.t.set(chestP, chestYaw * 0.6, chestRoll);
    P.head.t.set(headPitch, headYaw, headRoll);
    P.fL.t.fromArray(fL); P.fR.t.fromArray(fR); P.rL.t.fromArray(rL); P.rR.t.fromArray(rR);
    P.hL.t.fromArray(hL); P.hR.t.fromArray(hR); P.tL.t.fromArray(tL); P.tR.t.fromArray(tR);
    if (!noStep && dt > 0) {
      const fast = I.fall > 0.01 ? 1.0 : 1;
      const h = Math.min(dt, 1 / 30);
      for (const k in P) P[k].step(h, P[k].w * fast);
    }
    this.apply();
  }

  // the grab poses: where the feet, skis and hands go (blended in by g)
  grabPose(type, g, X, body) {
    const L = (a, b) => { for (let i = 0; i < 3; i++) a[i] = lerp(a[i], b[i], g); };
    const tw = 1;
    if (type === 'mute') {
      // knees up, skis crossed in an X, the left hand on the right ski in front of the boot
      L(X.fL, [0.06, 0.4, 0.06]); L(X.fR, [-0.06, 0.4, 0.02]); L(X.rL, [0.15, -0.42 * tw, -0.25]); L(X.rR, [0.1, 0.42 * tw, 0.25]);
      L(X.hL, [-0.02, 0.5, 0.36]); L(X.tL, [0.4, 0.1, -0.5]);
      L(X.hR, [-0.52, 1.15, 0.0]);
      body({ hipH: 0.66, pitch: 0.35, head: 0.25 });
    } else if (type === 'safety') {
      // the right hand grabs the right ski under the foot, outside; knees up
      L(X.fL, [0.13, 0.36, 0.04]); L(X.fR, [-0.13, 0.42, 0.0]); L(X.rL, [0.05, 0, 0]); L(X.rR, [0.12, 0, 0.35]);
      L(X.hR, [-0.21, 0.5, 0.02]); L(X.tR, [-0.65, 0.4, -0.4]);
      L(X.hL, [0.5, 1.12, 0.1]);
      body({ hipH: 0.68, pitch: 0.3, head: 0.2 });
    } else if (type === 'japan') {
      // the left ski pulled up behind, tip down, the hand on it under the foot
      L(X.fL, [0.1, 0.55, -0.22]); L(X.rL, [-0.8, 0.1, 0.2]); L(X.fR, [-0.12, 0.2, 0.12]); L(X.rR, [0.15, 0, 0]);
      L(X.hL, [0.12, 0.62, -0.08]); L(X.tL, [0.5, 0.3, -0.7]);
      L(X.hR, [-0.5, 1.15, 0.25]);
      body({ hipH: 0.72, pitch: 0.3, head: 0.15 });
    } else if (type === 'tail') {
      // both skis out in front, tips up, the right hand back on the tail
      L(X.fL, [0.12, 0.3, 0.2]); L(X.fR, [-0.11, 0.34, 0.12]); L(X.rL, [-0.55, 0, 0]); L(X.rR, [-0.55, 0, 0.1]);
      L(X.hR, [-0.2, 0.3, -0.42]); L(X.tR, [-0.55, 0.9, -0.3]);
      L(X.hL, [0.5, 1.2, 0.35]);
      body({ hipH: 0.7, pitch: -0.05, head: 0.1 });
    } else {
      // truck driver: both hands on both skis in front of the boots, knees tucked to the chest
      L(X.fL, [0.13, 0.42, -0.08]); L(X.fR, [-0.13, 0.42, -0.08]); L(X.rL, [-0.15, 0, 0]); L(X.rR, [-0.15, 0, 0]);
      L(X.hL, [0.14, 0.52, 0.28]); L(X.hR, [-0.14, 0.52, 0.28]); L(X.tL, [0.5, 0.6, -0.6]); L(X.tR, [-0.5, 0.6, -0.6]);
      body({ hipH: 0.64, pitch: 0.45, head: 0.25 });
    }
  }

  // standing still: little things to do now and then
  idleActions(dt) {
    const I = this.in;
    if (!I.still || I.fall || !I.grounded) { this.idleNext = Math.max(this.idleNext, 1.5); return; }
    this.idleNext -= dt;
    if (this.idleNext > 0 || this.acts.some(a => a.exclusive)) return;
    const r = Math.random(), lng = I.idle > 6;
    if (lng && r < 0.3) this.act('lean', 4.5, { exclusive: true });
    else if (r < 0.45) this.act('look', 2.4, { side: Math.random() < 0.5 ? 1 : -1, exclusive: true });
    else if (r < 0.6) this.act('goggles', 1.6, { exclusive: true });
    else if (r < 0.75) this.act('tap', 1.4, { exclusive: true });
    else if (r < 0.87) this.act('shift', 2.6, { exclusive: true });
    else this.act('stretch', 2.4, { exclusive: true });
    this.idleNext = 2.2 + Math.random() * 3;
  }

  // ======== the springs -> the bones ========
  apply() {
    const P = this.P;
    this.pelvis.position.copy(P.hip.x);
    this.pelvis.rotation.set(P.hipR.x.x, P.hipR.x.y, P.hipR.x.z, 'YXZ');
    this.spine.rotation.set(P.spine.x.x, P.spine.x.y, P.spine.x.z, 'YXZ');
    this.chest.rotation.set(P.chest.x.x, P.chest.x.y, P.chest.x.z, 'YXZ');
    this.neck.rotation.set(P.head.x.x * 0.4, P.head.x.y * 0.4, P.head.x.z * 0.4, 'YXZ');
    this.head.rotation.set(P.head.x.x * 0.6, P.head.x.y * 0.6, P.head.x.z * 0.6, 'YXZ');
    // the feet (and the skis with them)
    const ft = [[P.fL, P.rL], [P.fR, P.rR]];
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i].g, [p, r] = ft[i];
      f.position.copy(p.x);
      // keep the skis from going through each other
      if (i === 1) { const gap = this.feet[0].g.position.x - f.position.x; if (gap < 0.075 && Math.abs(this.feet[0].g.position.y - f.position.y) < 0.05 && Math.abs(P.rL.x.y) < 0.2) f.position.x = this.feet[0].g.position.x - 0.075; }
      _eu.set(r.x.x, r.x.y, r.x.z, 'YXZ'); f.quaternion.setFromEuler(_eu);
      f.updateMatrix();
    }
    // the chain down from the hips (for the shoulder and hip joints in root space)
    this.pelvis.updateMatrix(); this.spine.updateMatrix(); this.chest.updateMatrix();
    _m.multiplyMatrices(this.pelvis.matrix, this.spine.matrix).multiply(this.chest.matrix);   // chest -> root
    // legs: hip -> ankle in the boot
    for (let i = 0; i < 2; i++) {
      const L = this.legs[i], s = L.s, f = this.feet[i].g;
      _a.set(s * 0.093, -0.05, 0).applyMatrix4(this.pelvis.matrix);          // hip joint
      _b.copy(ANK).applyMatrix4(f.matrix);                                   // ankle
      // the knee goes forward over the ski, a little outwards (inwards in a snowplough)
      _c.set(0, 0, 1).applyQuaternion(f.quaternion); _c.y = Math.max(_c.y, -0.3);
      _c.x += s * (0.12 - this.in.plow * 0.45); _c.normalize();
      this.solve(L.th, L.kn, _a, _b, _c, A, B);
    }
    // arms: shoulder -> hand
    const hands = [this.P.hL.x, this.P.hR.x], tips = [this.P.tL.x, this.P.tR.x];
    for (let i = 0; i < 2; i++) {
      const Ar = this.arms[i], s = Ar.s;
      _a.set(s * 0.19, 0.245, 0).applyMatrix4(_m);                           // shoulder
      // the elbows go out to the side and back
      _c.set(s * 0.75, -0.35, -0.55).transformDirection(_m);
      const reach = this.solve(Ar.up, Ar.el, _a, hands[i], _c, UA, FA);
      // the hand and the pole: the pole goes from the hand towards its tip target
      _d.copy(reach);                                                        // where the hand really is
      const pole = this.poles[i];
      pole.position.copy(_d);
      _e.subVectors(tips[i], _d); if (_e.lengthSq() < 1e-4) _e.set(0, -1, 0); _e.normalize();
      pole.quaternion.setFromUnitVectors(DOWN, _e);
      // the glove turns to hold the grip
      Ar.hand.quaternion.identity();
    }
  }
  // two-bone IK in root space: upper starts at S and reaches for T, the middle joint goes towards hint;
  // returns where the end really is
  solve(upper, lower, S, T, hint, L1, L2) {
    upper.position.copy(S);
    _d.subVectors(T, S); let len = _d.length();
    if (len < 1e-5) _d.set(0, -1, 0); else _d.multiplyScalar(1 / len);
    len = clamp(len, 0.06, L1 + L2 - 0.002);
    const ang = Math.acos(clamp((L1 * L1 + len * len - L2 * L2) / (2 * L1 * len), -1, 1));
    _e.crossVectors(_d, hint); if (_e.lengthSq() < 1e-8) _e.set(1, 0, 0); _e.normalize();
    _f.copy(_d).applyAxisAngle(_e, ang);                                    // the upper bone
    upper.quaternion.setFromUnitVectors(DOWN, _f);
    const mid = _b2.copy(S).addScaledVector(_f, L1);
    _f.copy(S).addScaledVector(_d, len).sub(mid).normalize();               // the lower bone
    _q.setFromUnitVectors(DOWN, _f);
    lower.quaternion.copy(upper.quaternion).invert().multiply(_q);
    return _r2.copy(mid).addScaledVector(_f, L2);
  }
}
const _b2 = new THREE.Vector3(), _r2 = new THREE.Vector3();
