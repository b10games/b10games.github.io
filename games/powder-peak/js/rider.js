// The rider: a person in a snow suit on a snowboard or on skis, animated in code.
// root sits on the snow (its +z is the direction the board or the skis point, +y is up).
// The legs are solved with two-bone IK so the feet always stay in the bindings.
import { THREE, canvasTex, clamp, lerp, smooth } from './engine.js';
import { find, JACKETS, PANTS, HELMETS, GOGGLES, GLOVES, BOOTS, BOARDS, SKIS, DEFAULT_OUTFIT } from './data.js';

const A = 0.44, B = 0.43;                  // thigh and shin
export const PIVOT = 0.95;                 // flips turn around the belly, this high above the feet
const V = () => new THREE.Vector3();
const _a = V(), _b = V(), _c = V(), _d = V(), _k = V(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), DOWN = new THREE.Vector3(0, -1, 0);

function cap(r, len, mat, seg = 10) { return new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, seg), mat); }
function std(c, rough = 0.7, o = {}) { return new THREE.MeshStandardMaterial({ color: c, roughness: rough, ...o }); }
// on the better graphics settings clothes get a soft fabric sheen and the helmet a glossy coat
let FANCY = false;
export function setRiderQuality(q) { FANCY = q === 'high' || q === 'ultra'; }
function cloth(c, rough) { return FANCY ? new THREE.MeshPhysicalMaterial({ color: c, roughness: rough, sheen: 0.6, sheenRoughness: 0.75, sheenColor: new THREE.Color('#ffffff') }) : std(c, rough); }
function gloss(c, rough, o = {}) { return FANCY ? new THREE.MeshPhysicalMaterial({ color: c, roughness: rough, clearcoat: 0.7, clearcoatRoughness: 0.25, ...o }) : std(c, rough, o); }

// board and ski graphics
const TEX = new Map();
function gearTex(d, w, h) {
  const k = d.id + w; if (TEX.has(k)) return TEX.get(k);
  const t = canvasTex(w, h, (g) => {
    g.fillStyle = d.a; g.fillRect(0, 0, w, h);
    g.fillStyle = d.b; g.strokeStyle = d.c;
    if (d.pat === 'stripe') { for (let i = -h; i < w; i += h * 0.9) { g.beginPath(); g.moveTo(i, h); g.lineTo(i + h * 0.35, h); g.lineTo(i + h * 0.75, 0); g.lineTo(i + h * 0.4, 0); g.fill(); } g.fillStyle = d.c; g.fillRect(0, h * 0.44, w, h * 0.12); }
    else if (d.pat === 'flame') { for (let i = 0; i < 9; i++) { const x = w * 0.15 + i * w * 0.08; g.beginPath(); g.moveTo(x, h); g.quadraticCurveTo(x + w * 0.05, h * 0.3, x + w * 0.02, 0); g.quadraticCurveTo(x + w * 0.09, h * 0.4, x + w * 0.08, h); g.fill(); } g.fillStyle = d.c; g.fillRect(w * 0.1, h * 0.46, w * 0.8, h * 0.08); }
    else if (d.pat === 'wave') { g.lineWidth = h * 0.08; for (let r = 0; r < 4; r++) { g.strokeStyle = r % 2 ? d.c : d.b; g.beginPath(); for (let x = 0; x <= w; x += 8) g.lineTo(x, h * (0.2 + r * 0.2) + Math.sin(x / w * 18 + r) * h * 0.07); g.stroke(); } }
    else if (d.pat === 'pine') { for (let i = 0; i < 12; i++) { const x = (i + 0.5) * w / 12; g.beginPath(); g.moveTo(x, h * 0.15); g.lineTo(x + w * 0.03, h * 0.85); g.lineTo(x - w * 0.03, h * 0.85); g.fill(); } }
    else if (d.pat === 'dots') { for (let i = 0; i < 70; i++) { g.fillStyle = i % 2 ? d.b : d.c; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, h * (0.05 + Math.random() * 0.08), 0, 7); g.fill(); } }
    else if (d.pat === 'stars') { for (let i = 0; i < 40; i++) { g.fillStyle = i % 3 ? d.c : d.b; const x = Math.random() * w, y = Math.random() * h, s = h * (0.04 + Math.random() * 0.06); g.beginPath(); for (let p = 0; p < 10; p++) { const a = p / 10 * Math.PI * 2, r = p % 2 ? s * 0.45 : s; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } g.fill(); } }
    else if (d.pat === 'camo') { for (let i = 0; i < 60; i++) { g.fillStyle = i % 2 ? d.b : d.c; g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, h * 0.25, h * 0.14, Math.random() * 3, 0, 7); g.fill(); } }
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.font = `900 ${Math.round(h * 0.28)}px Nunito, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('POWDER', w * 0.5, h * 0.5);
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  TEX.set(k, t); return t;
}
// a board: rounded at both ends, nose and tail bent up
function boardGeometry(len, wid, rise, thick = 0.025) {
  const s = new THREE.Shape(), hl = len / 2, hw = wid / 2, r = hw * 0.95;
  s.moveTo(-hl + r, -hw); s.lineTo(hl - r, -hw); s.quadraticCurveTo(hl, -hw, hl, 0); s.quadraticCurveTo(hl, hw, hl - r, hw); s.lineTo(-hl + r, hw); s.quadraticCurveTo(-hl, hw, -hl, 0); s.quadraticCurveTo(-hl, -hw, -hl + r, -hw);
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1, curveSegments: 10, steps: 1 });
  g.rotateX(-Math.PI / 2);                 // shape x = length, shape y -> -z ; extrude goes up
  g.rotateY(Math.PI / 2);                  // length along z
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const z = p.getZ(i), e = Math.abs(z) - (hl - 0.22); if (e > 0) p.setY(i, p.getY(i) + (e / 0.22) ** 2 * rise * (z > 0 ? 1 : 0.7)); }
  // planar uvs along the board
  const uv = g.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getZ(i) + hl) / len, (p.getX(i) + hw) / wid);
  g.computeVertexNormals();
  return g;
}
function skiGeometry(len, wid) {
  const g = boardGeometry(len, wid, 0.12, 0.022), p = g.attributes.position;
  // the tip curls up more, the tail only a bit
  for (let i = 0; i < p.count; i++) { const z = p.getZ(i), e = z - (len / 2 - 0.3); if (e > 0) p.setY(i, p.getY(i) + (e / 0.3) ** 2 * 0.12); }
  g.computeVertexNormals();
  return g;
}

export class Rider {
  constructor(outfit = DEFAULT_OUTFIT, gear = 'board') {
    this.root = new THREE.Group();
    this.gearGroup = new THREE.Group(); this.root.add(this.gearGroup);
    this.body = new THREE.Group(); this.root.add(this.body);
    this.mats = {
      jacket: cloth('#d00', 0.6), accent: cloth('#111', 0.55), pants: cloth('#222', 0.82), helmet: gloss('#fff', 0.35, { metalness: 0.1 }),
      lens: std('#fb0', 0.08, { metalness: 0.9, emissive: '#000' }), frame: std('#111', 0.5), gloves: cloth('#111', 0.8), boots: gloss('#111', 0.55),
      skin: std('#f1c7a5', 0.7), board: std('#fff', 0.35), base: std('#1a1a1a', 0.4), bind: std('#1b1c20', 0.5), pole: std('#c9ced6', 0.3, { metalness: 0.8 })
    };
    this.build();
    this.pose = { crouch: 0.3, edge: 0, lean: 0, air: 0, tuck: 0, flip: 0, land: 0, bail: 0, idle: 0, push: 0, brake: 0, speed: 0, charge: 0, wobble: 0, lobby: 0 };
    this.t = Math.random() * 10; this.idleT = 3; this.idleAct = 0; this.idleK = 0;
    this.setOutfit(outfit); this.setGear(gear);
  }
  build() {
    const M = this.mats, b = this.body;
    const hips = this.hips = new THREE.Group(); b.add(hips);
    const pelvis = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), M.pants); pelvis.scale.set(1.12, 0.8, 0.9); hips.add(pelvis);
    const spine = this.spine = new THREE.Group(); spine.position.y = 0.04; hips.add(spine);
    // a puffy jacket: narrower at the waist, wide at the chest, round shoulders
    const prof = [[0.0, 0.0], [0.165, 0.0], [0.178, 0.08], [0.19, 0.2], [0.2, 0.32], [0.19, 0.4], [0.14, 0.47], [0.08, 0.5], [0.0, 0.5]].map(([r, y]) => new THREE.Vector2(r, y));
    const torso = new THREE.Mesh(new THREE.LatheGeometry(prof, 18), M.jacket); torso.position.y = 0.0; torso.scale.set(1.12, 1, 0.8); spine.add(torso);
    for (const sx of [-1, 1]) { const sh = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 10), M.jacket); sh.position.set(sx * 0.19, 0.42, 0); spine.add(sh); }
    const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.03), M.accent); pocket.position.set(0, 0.12, 0.155); spine.add(pocket);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.07, 18, 1, true), M.accent); band.position.y = 0.3; band.scale.set(1.12, 1, 0.82); spine.add(band);
    const zip = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.42, 0.02), M.accent); zip.position.set(0, 0.25, 0.158); spine.add(zip);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.09, 12), M.jacket); collar.position.y = 0.5; spine.add(collar);
    // head with helmet and goggles
    const head = this.head = new THREE.Group(); head.position.y = 0.52; spine.add(head);
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.105, 14, 12), M.skin); face.position.y = 0.12; head.add(face);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.135, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), M.helmet); helmet.position.set(0, 0.14, -0.01); helmet.scale.set(1, 1.02, 1.08); head.add(helmet);
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.128, 0.018, 6, 24), M.frame); strap.position.set(0, 0.135, 0); strap.rotation.x = Math.PI / 2 - 0.12; strap.scale.set(1, 1.1, 1); head.add(strap);
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 6, Math.PI / 2 - 0.95, 1.9, Math.PI * 0.4, Math.PI * 0.17), M.lens); lens.position.set(0, 0.12, 0.006); head.add(lens);
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.008, 0.01), std('#7a3b2e')); mouth.position.set(0, 0.06, 0.1); head.add(mouth);
    // arms
    this.arms = [1, -1].map(s => {
      const sh = new THREE.Group(); sh.position.set(0.205 * s, 0.42, 0); spine.add(sh);
      const up = cap(0.07, 0.19, M.jacket); up.position.y = -0.14; sh.add(up);
      const el = new THREE.Group(); el.position.y = -0.28; sh.add(el);
      const fo = cap(0.064, 0.17, M.jacket); fo.position.y = -0.12; el.add(fo);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 10), M.accent); cuff.position.y = -0.22; el.add(cuff);
      const hand = new THREE.Group(); hand.position.y = -0.27; el.add(hand);
      const glove = new THREE.Mesh(new THREE.SphereGeometry(0.072, 10, 8), M.gloves); glove.scale.set(0.85, 1.15, 1); hand.add(glove);
      return { sh, el, hand, s };
    });
    // legs: hip joint -> knee -> ankle, solved with IK every frame
    this.legs = [1, -1].map(s => {
      const thigh = new THREE.Group(); b.add(thigh);
      const tm = cap(0.1, A - 0.14, M.pants); tm.position.y = -A / 2; thigh.add(tm);
      const knee = new THREE.Group(); knee.position.y = -A; thigh.add(knee);
      const sm = cap(0.088, B - 0.12, M.pants); sm.position.y = -B / 2; knee.add(sm);
      const kp = new THREE.Mesh(new THREE.SphereGeometry(0.098, 10, 8), M.pants); knee.add(kp);
      const ankle = new THREE.Group(); ankle.position.y = -B; knee.add(ankle);
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.13, 0.3), M.boots); boot.position.set(0, -0.03, 0.04); ankle.add(boot);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.09, 0.12, 10), M.boots); cuff.position.y = 0.04; ankle.add(cuff);
      return { thigh, knee, ankle, s, foot: V(), hip: V() };
    });
    this.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  }
  setOutfit(o) {
    this.outfit = { ...DEFAULT_OUTFIT, ...o };
    const M = this.mats, j = find(JACKETS, this.outfit.jacket), g = find(GOGGLES, this.outfit.goggles);
    M.jacket.color.set(j.a); M.accent.color.set(j.b);
    M.pants.color.set(find(PANTS, this.outfit.pants).c); M.helmet.color.set(find(HELMETS, this.outfit.helmet).c);
    M.lens.color.set(g.c); M.lens.emissive.set(g.c); M.lens.emissiveIntensity = 0.25; M.frame.color.set(g.f);
    M.gloves.color.set(find(GLOVES, this.outfit.gloves).c); M.boots.color.set(find(BOOTS, this.outfit.boots).c);
    if (this.gear) this.buildGear();
  }
  setGear(gear) { this.gear = gear === 'skis' ? 'skis' : 'board'; this.buildGear(); }
  buildGear() {
    const G = this.gearGroup, M = this.mats;
    while (G.children.length) { const c = G.children.pop(); c.traverse(o => { if (o.isMesh && o.geometry) o.geometry.dispose(); }); }
    if (this.poles) for (const p of this.poles) p.parent && p.parent.remove(p);
    this.poles = null;
    if (this.gear === 'board') {
      const d = find(BOARDS, this.outfit.board), top = gloss('#fff', 0.3); top.map = gearTex(d, 512, 128);
      const board = new THREE.Mesh(boardGeometry(1.56, 0.29, 0.07), [top, M.base]); board.position.y = 0.01; G.add(board);
      for (const s of [1, -1]) {
        const bd = new THREE.Group(); bd.position.set(0, 0.04, s * 0.26); bd.rotation.y = s * 0.12;
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.02, 0.18), M.bind); bd.add(plate);
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.17, 0.16), M.bind); back.position.set(-0.12, 0.09, 0); back.rotation.z = 0.25; bd.add(back);
        const strap = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.18), std(find(BOARDS, this.outfit.board).b, 0.5)); strap.position.set(0.02, 0.1, 0); bd.add(strap);
        G.add(bd);
      }
    } else {
      const d = find(SKIS, this.outfit.skis), top = gloss('#fff', 0.28); top.map = gearTex(d, 512, 48);
      for (const s of [1, -1]) {
        const ski = new THREE.Mesh(skiGeometry(1.72, 0.088), [top, M.base]); ski.position.set(s * 0.12, 0.01, 0.05); G.add(ski);
        const bd = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.36), M.bind); bd.position.set(s * 0.12, 0.05, 0.02); G.add(bd);
      }
      // poles in the hands
      this.poles = this.arms.map(a => {
        const p = new THREE.Group();
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.009, 1.15, 6), M.pole); shaft.position.y = -0.55; p.add(shaft);
        const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.02, 0.13, 8), M.bind); grip.position.y = 0.02; p.add(grip);
        const basket = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 5, 12), M.bind); basket.rotation.x = Math.PI / 2; basket.position.y = -1.02; p.add(basket);
        a.hand.add(p); return p;
      });
    }
    G.traverse(o => { if (o.isMesh) o.castShadow = true; });
    // stand sideways on a board (left foot forward), face forward on skis
    this.body.rotation.y = this.gear === 'board' ? -Math.PI / 2 : 0;
  }

  // place the rider: feet on the snow at pos, turned by quat. In the air (pivot 1) flips turn around the belly.
  place(pos, quat, pivot = 0) {
    this.root.quaternion.copy(quat);
    _a.set(0, PIVOT, 0).applyQuaternion(quat);
    this.root.position.set(pos.x - _a.x * pivot, pos.y + (PIVOT - _a.y) * pivot, pos.z - _a.z * pivot);
  }

  solveLeg(L, H, F, kneeDir, footQ) {
    L.thigh.position.copy(H);
    _a.subVectors(F, H); let len = _a.length(); _a.normalize();
    len = clamp(len, 0.08, A + B - 0.003);
    const ang = Math.acos(clamp((A * A + len * len - B * B) / (2 * A * len), -1, 1));
    _b.crossVectors(_a, kneeDir); if (_b.lengthSq() < 1e-6) _b.set(1, 0, 0); _b.normalize();
    _c.copy(_a).applyAxisAngle(_b, ang);                       // thigh direction
    _k.copy(H).addScaledVector(_c, A);                         // knee
    _d.subVectors(F, _k).normalize();                          // shin direction
    L.thigh.quaternion.setFromUnitVectors(DOWN, _c);
    _q.setFromUnitVectors(DOWN, _d);
    L.knee.quaternion.copy(L.thigh.quaternion).invert().multiply(_q);
    L.ankle.quaternion.copy(_q).invert().multiply(footQ);
  }

  update(dt) {
    const P = this.pose, board = this.gear === 'board';
    this.t += dt;
    const t = this.t, still = P.speed < 0.6 && P.air < 0.1;
    // idle moves when standing still (and in the lobby)
    let idleArm = 0, look = 0;
    if (still && P.bail < 0.1) {
      this.idleT -= dt;
      if (this.idleT < 0) { this.idleT = 2.5 + Math.random() * 3; this.idleAct = 1 + Math.floor(Math.random() * 3); this.idleK = 0; }
      if (this.idleAct) { this.idleK += dt; if (this.idleK > 1.8) this.idleAct = 0; }
      const k = this.idleAct ? Math.sin(Math.min(1, this.idleK / 1.8) * Math.PI) : 0;
      if (this.idleAct === 1) idleArm = k;                        // adjust the goggles
      if (this.idleAct === 2) look = Math.sin(this.idleK * 3) * k * 0.7;   // look around
      if (this.idleAct === 3) idleArm = -k;                       // shake out the arms
    } else this.idleAct = 0;
    const breathe = Math.sin(t * 2.1) * 0.012;
    // how low the hips are
    let crouch = P.crouch + P.charge * 0.55 + P.land * 0.45 + P.air * 0.18 + P.flip * 0.35 - (still ? 0.15 : 0);
    crouch = clamp(crouch, 0, 1);
    const edge = P.edge;
    const hipH = 0.11 + (A + B) * lerp(0.95, 0.5, crouch) + breathe;
    const hipZ = board ? (edge > 0 ? 0.07 * edge : 0.13 * edge) - P.brake * 0.08 : -0.06 - crouch * 0.08;
    this.hips.position.set(board ? 0 : -P.lean * 0.06, hipH - (board && edge < 0 ? -edge * 0.06 : 0), hipZ);
    // upper body
    const lean = board ? 0.12 + crouch * 0.35 + Math.max(0, edge) * 0.25 - Math.max(0, -edge) * 0.08 : 0.3 + crouch * 0.5 + P.tuck * 0.35;
    this.spine.rotation.set(lean - P.bail * 0.6 + Math.sin(t * 9) * P.wobble * 0.15, board ? (0.38 - P.air * 0.15) * (1 - P.lobby * 0.8) : 0, board ? Math.sin(t * 7) * P.wobble * 0.2 : -P.lean * 0.25 + Math.sin(t * 7) * P.wobble * 0.2);
    // head looks where you are going
    this.head.rotation.set(-lean * 0.55 + P.bail * 0.3 - P.lobby * 0.08, (board ? 1.05 : 0) * (1 - P.lobby) + look - (board ? P.lobby * 0.25 : 0), board ? 0 : P.lean * 0.15);
    // arms
    const [L, R] = this.arms;
    if (board) {
      const fly = P.air * 0.6 + P.bail * Math.sin(t * 14) * 0.8;
      L.sh.rotation.set(-0.35 - P.charge * 0.4 + idleArm * -1.6, 0, 0.55 + fly + P.brake * 0.3); L.el.rotation.set(-0.5 - idleArm * 1.2, 0, 0);
      R.sh.rotation.set(0.25 + P.charge * 0.5, 0, -0.45 - fly - P.brake * 0.2); R.el.rotation.set(-0.35, 0, 0);
      if (P.flip > 0.1) { L.sh.rotation.x -= P.flip * 0.9; R.sh.rotation.x -= P.flip * 0.9; L.el.rotation.x -= P.flip; R.el.rotation.x -= P.flip; }
    } else {
      const pole = Math.sin(t * 4.5) * clamp(P.push, 0, 1);
      const tuck = P.tuck, fly = P.air * 0.5 + P.bail * Math.sin(t * 14) * 0.8;
      for (const a of this.arms) {
        a.sh.rotation.set(lerp(-0.45, -1.15, tuck) - P.charge * 0.25 + pole * 0.7 * a.s - (a.s > 0 ? idleArm * 1.4 : 0), 0, a.s * (0.22 + fly + P.brake * 0.2));
        a.el.rotation.set(lerp(-0.55, -1.5, tuck) - (a.s > 0 ? Math.abs(idleArm) * 1.1 : 0), 0, 0);
      }
      if (this.poles) this.poles.forEach((p, i) => { p.rotation.set(lerp(1.2, 2.2, tuck) + P.air * 0.4, 0, (i ? 1 : -1) * 0.12); });
    }
    // legs
    const footY = board ? 0.12 : 0.12, stance = board ? 0.26 : 0.12;
    const kneeDir = _c.set(0, 0, 1);
    _q2.identity();
    for (const Lg of this.legs) {
      const s = Lg.s;
      // on skis the inside ski slides a little ahead in a turn; in a flip the knees come up
      const fz = board ? 0 : (P.lean * s * 0.08);
      const lift = P.flip * 0.0;
      Lg.foot.set(s * stance, footY + lift, fz);
      Lg.hip.set(this.hips.position.x + s * 0.1, this.hips.position.y - 0.06, this.hips.position.z);
      // a board turns the feet a little outwards (duck stance)
      if (board) _q2.setFromAxisAngle(_d.set(0, 1, 0), -s * 0.12); else _q2.identity();
      this.solveLeg(Lg, Lg.hip, Lg.foot, kneeDir.set(board ? s * 0.25 : P.lean * 0.3, 0, 1).normalize(), _q2);
    }
  }
}

// a name over a rider's head
export function nameTag(text, color = '#ffffff') {
  const c = document.createElement('canvas'); c.width = 512; c.height = 112;
  const g = c.getContext('2d'); g.font = '900 54px Nunito, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const w = Math.min(500, g.measureText(text).width + 60);
  g.fillStyle = 'rgba(10,20,40,0.6)'; g.beginPath(); g.roundRect(256 - w / 2, 14, w, 84, 42); g.fill();
  g.fillStyle = color; g.fillText(text, 256, 58);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(2.4, 0.52, 1); s.renderOrder = 10;
  return s;
}
