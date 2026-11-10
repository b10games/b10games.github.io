// Building blocks and moving obstacles for the courses. Every obstacle's motion is a pure function
// of the shared round time t, so all players see the exact same hammers, platforms and lasers.
import { THREE, M, surfaceTex, rng } from './engine.js';
import { Collider, Zone } from './physics.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const hazardTex = surfaceTex('stripes', '#ffd23f', '#222222');

export function makeCtx(root, world, theme, diff, seed) {
  return { root, world, theme, diff, rand: rng(seed), ups: [], t: 0, others: () => [] };
}
function sh(m) { m.castShadow = true; m.receiveShadow = true; return m; }
function speedK(ctx) { return 0.8 + 0.2 * ctx.diff; }

// ---------- static pieces ----------
export function block(ctx, o) {
  const m = sh(new THREE.Mesh(new THREE.BoxGeometry(o.w, o.h, o.d), o.mat));
  m.position.set(o.x || 0, o.y || 0, o.z || 0);
  m.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0);
  (o.parent || ctx.root).add(m);
  if (o.solid !== false) m.userData.col = ctx.world.add(new Collider('box', m, { half: V(o.w / 2, o.h / 2, o.d / 2), surface: o.surface, bounce: o.bounce, hit: o.hit, dynamic: o.dyn, belt: o.belt, onStand: o.onStand }));
  return m;
}
export function cyl(ctx, o) {
  const m = sh(new THREE.Mesh(new THREE.CylinderGeometry(o.r, o.r2 ?? o.r, o.h, o.seg || 36), o.mat));
  m.position.set(o.x || 0, o.y || 0, o.z || 0);
  m.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0);
  (o.parent || ctx.root).add(m);
  if (o.solid !== false) m.userData.col = ctx.world.add(new Collider('cyl', m, { r: Math.max(o.r, o.r2 ?? o.r), h: o.h / 2, surface: o.surface, bounce: o.bounce, hit: o.hit, dynamic: o.dyn, onStand: o.onStand }));
  return m;
}
export function ball(ctx, o) {
  const m = sh(new THREE.Mesh(new THREE.SphereGeometry(o.r, 24, 16), o.mat));
  m.position.set(o.x || 0, o.y || 0, o.z || 0);
  (o.parent || ctx.root).add(m);
  if (o.solid !== false) m.userData.col = ctx.world.add(new Collider('sphere', m, { r: o.r, hit: o.hit, dynamic: o.dyn, surface: o.surface, bounce: o.bounce }));
  return m;
}

// ---------- start, checkpoints, finish ----------
export function startPad(ctx, o) {
  block(ctx, { x: o.x || 0, y: (o.y || 0) - 0.5, z: o.z || 0, w: o.w || 20, h: 1, d: o.d || 14, mat: o.mat });
  // starting gate posts
  for (const s of [-1, 1]) cyl(ctx, { x: s * ((o.w || 20) / 2 + 0.4), y: (o.y || 0) + 2.5, z: (o.z || 0) + (o.d || 14) / 2, r: 0.4, h: 5, mat: M('#ffffff') });
}
export function checkpoint(ctx, index, x, y, z, w = 18) {
  ctx.world.zone(new Zone('checkpoint', V(x - w / 2, y - 2, z - 1.5), V(x + w / 2, y + 6, z + 1.5), { index, spawn: V(x, y + 0.2, z + 1.5), yaw: 0 }));
  const flag = new THREE.Group();
  for (const s of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4, 8), M('#ffffff'));
    pole.position.set(s * w / 2, y + 2, z); flag.add(pole);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), M('#2ec4b6', { double: true, emissive: '#2ec4b6', ei: 0.3 }));
    f.position.set(s * w / 2 + 0.6 * -s, y + 3.5, z); flag.add(f);
  }
  ctx.root.add(flag);
}
export function finishLine(ctx, x, y, z, w = 20) {
  const g = new THREE.Group();
  const check = surfaceTex('checker', '#ffffff', '#111111');
  check.repeat.set(4, 1);
  const banner = new THREE.Mesh(new THREE.BoxGeometry(w + 2, 1.6, 0.5), M('#ffffff', { map: check }));
  banner.position.set(x, y + 7, z);
  g.add(banner);
  for (const s of [-1, 1]) {
    const p = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 8, 16), M('#ff4d6d')));
    p.position.set(x + s * (w / 2 + 0.6), y + 4, z); g.add(p);
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.8, 16, 12), M('#ffd23f', { emissive: '#ffb703', ei: 0.4 }));
    top.position.set(x + s * (w / 2 + 0.6), y + 8.4, z); g.add(top);
  }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, 2.5), M('#ffffff', { map: check }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(x, y + 0.03, z); g.add(floor);
  ctx.root.add(g);
  ctx.world.zone(new Zone('finish', V(x - w / 2 - 1, y - 2, z - 1), V(x + w / 2 + 1, y + 8, z + 30)));
  ctx.finishZ = z;
}

// ---------- moving obstacles ----------
// Beam(s) spinning around a post; low beams must be jumped, high ones dodged.
export function spinner(ctx, o) {
  const pivot = new THREE.Group(); pivot.position.set(o.x, o.y, o.z); ctx.root.add(pivot);
  cyl(ctx, { x: o.x, y: o.y + (o.postH || 1.6) / 2, z: o.z, r: o.postR || 0.7, h: o.postH || 1.6, mat: o.postMat || M('#555b6e', { metal: 0.3 }) });
  const arms = o.arms || 1, len = o.len, hgt = o.h ?? 0.8;
  const mat = o.mat || M('#ffffff', { map: hazardTex });
  for (let i = 0; i < arms; i++) {
    const arm = new THREE.Group(); arm.rotation.y = i * Math.PI / arms; pivot.add(arm);
    block(ctx, { parent: arm, x: 0, y: hgt, z: 0, w: len, h: o.thick || 0.6, d: o.thick || 0.6, mat, hit: o.hit ?? 13, dyn: true });
    for (const s of [-1, 1]) { const cap = sh(new THREE.Mesh(new THREE.SphereGeometry((o.thick || 0.6) * 0.75, 12, 8), M(o.cap || '#ff4d6d'))); cap.position.set(s * len / 2, hgt, 0); arm.add(cap); }
  }
  const sp = o.speed * speedK(ctx) * (o.dir || 1);
  ctx.ups.push(t => { pivot.rotation.y = t * sp + (o.phase || 0); });
  return pivot;
}

// Giant hammer on a spinning arm.
export function hammer(ctx, o) {
  const pivot = new THREE.Group(); pivot.position.set(o.x, o.y, o.z); ctx.root.add(pivot);
  cyl(ctx, { x: o.x, y: o.y + 2.5, z: o.z, r: 0.6, h: 5, mat: M('#6c757d', { metal: 0.4 }) });
  const r = o.r || 6;
  block(ctx, { parent: pivot, x: r / 2, y: 4.4, z: 0, w: r, h: 0.5, d: 0.5, mat: M('#adb5bd', { metal: 0.5 }), solid: false });
  const head = cyl(ctx, { parent: pivot, x: r, y: 2.2, z: 0, r: 1.0, h: 2.6, rx: Math.PI / 2, mat: o.mat || M('#ff4d6d'), hit: o.hit ?? 18, dyn: true });
  const handle = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 2.2, 8), M('#8d5524'))); handle.position.set(r, 3.3, 0); pivot.add(handle);
  for (const s of [-1, 1]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.12, 8, 20), M('#ffd23f', { metal: 0.6 })); ring.position.set(r, 2.2, s * 1.2); pivot.add(ring); }
  const sp = o.speed * speedK(ctx) * (o.dir || 1);
  ctx.ups.push(t => { pivot.rotation.y = t * sp + (o.phase || 0); });
  return head;
}

// Swinging pendulum: ball, axe, hammer or a ride-on platform (vines, cranes).
export function pendulum(ctx, o) {
  const pivot = new THREE.Group(); pivot.position.set(o.x, o.y, o.z); ctx.root.add(pivot);
  const len = o.len || 6;
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, len, 6), M(o.ropeColor || '#5c4033'));
  rope.position.y = -len / 2; pivot.add(rope);
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), M('#555b6e')); pivot.add(top);
  const kind = o.head || 'ball', s = o.size || 1.3;
  if (kind === 'ball') ball(ctx, { parent: pivot, x: 0, y: -len, z: 0, r: s, mat: o.mat || M('#343a40', { metal: 0.5, rough: 0.3 }), hit: o.hit ?? 16, dyn: true });
  else if (kind === 'axe') {
    block(ctx, { parent: pivot, x: 0, y: -len, z: 0, w: 0.25, h: s * 1.4, d: s * 2.2, mat: o.mat || M('#ced4da', { metal: 0.7, rough: 0.25 }), hit: o.hit ?? 17, dyn: true });
  } else if (kind === 'hammer') {
    cyl(ctx, { parent: pivot, x: 0, y: -len, z: 0, r: s * 0.8, h: s * 2.4, rz: Math.PI / 2, mat: o.mat || M('#ff8c42'), hit: o.hit ?? 18, dyn: true });
  } else if (kind === 'plat') {
    block(ctx, { parent: pivot, x: 0, y: -len, z: 0, w: o.pw || 3, h: 0.5, d: o.pd || 3, mat: o.mat || M('#7bd389'), dyn: true });
  }
  const axis = o.axis || 'x', amp = o.amp ?? 1.0, sp = (o.speed || 1.6) * speedK(ctx);
  ctx.ups.push(t => { const a = amp * Math.sin(t * sp + (o.phase || 0)); if (axis === 'x') pivot.rotation.x = a; else pivot.rotation.z = a; });
  return pivot;
}

// Platform sliding back and forth (or up and down).
export function mover(ctx, o) {
  const g = new THREE.Group(); ctx.root.add(g);
  const m = block(ctx, { parent: g, x: 0, y: 0, z: 0, w: o.w, h: o.h || 0.8, d: o.d, mat: o.mat, surface: o.surface, dyn: true });
  const sp = (o.speed || 1) * speedK(ctx), a = V(o.ax || 0, o.ay || 0, o.az || 0);
  ctx.ups.push(t => { const s = Math.sin(t * sp + (o.phase || 0)); g.position.set(o.x + a.x * s, o.y + a.y * s, o.z + a.z * s); });
  g.position.set(o.x, o.y, o.z);
  return m;
}

// Spinning round platform, optionally with bumpers on top.
export function disc(ctx, o) {
  const g = new THREE.Group(); g.position.set(o.x, o.y, o.z); ctx.root.add(g);
  const top = cyl(ctx, { parent: g, x: 0, y: 0, z: 0, r: o.r, h: o.h || 0.7, mat: o.mat, dyn: true, surface: o.surface });
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(o.r * 1.9, 0.05, 0.6), M(o.stripe || '#ffffff'));
  stripe.position.y = (o.h || 0.7) / 2 + 0.03; g.add(stripe);
  if (o.bumpers) for (let i = 0; i < o.bumpers; i++) {
    const a = i * Math.PI * 2 / o.bumpers;
    cyl(ctx, { parent: g, x: Math.cos(a) * o.r * 0.6, y: 0.9, z: Math.sin(a) * o.r * 0.6, r: 0.5, h: 1.2, mat: M('#ff4d6d'), hit: 10, dyn: true });
  }
  const sp = o.speed * speedK(ctx) * (o.dir || 1);
  ctx.ups.push(t => { g.rotation.y = t * sp; });
  return top;
}

// Tile that shakes and drops after someone stands on it.
export function crumble(ctx, o) {
  const mat = o.mat.clone(); mat.transparent = true;
  const m = block(ctx, { x: o.x, y: o.y, z: o.z, w: o.w, h: o.h || 0.6, d: o.d, mat, dyn: true });
  const col = m.userData.col, base = m.position.clone();
  let trig = -1, fallen = false;
  col.onStand = () => { if (trig < 0) trig = ctx.t; };
  const delay = o.delay ?? 0.7, back = o.respawn === false ? Infinity : (o.back || 4);
  ctx.ups.push(t => {
    if (trig < 0) {
      for (const p of ctx.others()) {
        if (Math.abs(p.x - base.x) < o.w / 2 + 0.2 && Math.abs(p.z - base.z) < o.d / 2 + 0.2 && p.y > base.y && p.y - base.y < 1.4) { trig = t; break; }
      }
      return;
    }
    const k = t - trig;
    if (k < delay) { m.position.set(base.x + Math.sin(k * 60) * 0.06, base.y, base.z + Math.cos(k * 53) * 0.06); mat.color.setRGB(1, 1 - k * 0.6, 1 - k * 0.6).multiply(o.mat.color); }
    else if (k < delay + 1.2) { fallen = true; col.enabled = false; m.position.y = base.y - (k - delay) ** 2 * 9; mat.opacity = Math.max(0, 1 - (k - delay)); }
    else if (k > delay + back) { trig = -1; fallen = false; col.enabled = true; m.position.copy(base); mat.opacity = 1; mat.color.copy(o.mat.color); }
    else { m.visible = false; }
    if (!fallen || k > delay + back) m.visible = true;
  });
  return m;
}

// Platform that blinks in and out on a timer.
export function vanish(ctx, o) {
  const mat = o.mat.clone(); mat.transparent = true;
  const m = block(ctx, { x: o.x, y: o.y, z: o.z, w: o.w, h: o.h || 0.6, d: o.d, mat, dyn: true });
  const col = m.userData.col, per = o.period || 4, on = o.on || 0.6;
  ctx.ups.push(t => {
    const k = (((t + (o.phase || 0)) % per) + per) % per / per;
    const solid = k < on;
    col.enabled = solid;
    const warn = solid && k > on - 0.6 / per;
    mat.opacity = solid ? (warn ? 0.45 + 0.4 * Math.abs(Math.sin(t * 25)) : 1) : 0.12;
    m.visible = true;
  });
  return m;
}

// Balls rolling down a lane, over and over.
export function rollers(ctx, o) {
  const n = o.count || 4, len = o.len, sp = (o.speed || 8) * speedK(ctx), dir = V(...(o.dir || [0, 0, -1])).normalize();
  const balls = [];
  for (let i = 0; i < n; i++) balls.push(ball(ctx, { x: 0, y: -100, z: 0, r: o.r || 1.4, mat: o.mat || M('#ff6fd8', { rough: 0.3 }), hit: o.hit ?? 15, dyn: true }));
  const r = rng(o.seed || 7), lanes = balls.map(() => (r() - 0.5) * (o.width || 10));
  ctx.ups.push(t => {
    balls.forEach((b, i) => {
      const s = ((t * sp + i * len / n) % len + len) % len;
      const slope = o.slope || 0;
      b.position.set(o.x + lanes[i] + dir.x * s, o.y + (o.r || 1.4) + s * slope, o.z + dir.z * s);
      b.rotation.x = -s / (o.r || 1.4);
    });
  });
}

// Spring pad that launches you upward.
export function bouncePad(ctx, o) {
  const pad = cyl(ctx, { x: o.x, y: o.y - 0.07, z: o.z, r: o.r || 1.6, h: 0.3, mat: o.mat || M('#ff4d6d', { emissive: '#ff4d6d', ei: 0.25 }), surface: 'bounce', bounce: o.power || 22, dyn: true });
  const ring = new THREE.Mesh(new THREE.TorusGeometry((o.r || 1.6) * 0.75, 0.1, 8, 24), M('#ffffff', { emissive: '#ffffff', ei: 0.6 }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(o.x, o.y + 0.12, o.z); ctx.root.add(ring);
  let hitT = -9;
  pad.userData.col.onStand = () => { hitT = ctx.t; };
  ctx.ups.push(t => { const k = t - hitT; const s = k < 0.4 ? 1 - Math.sin(k / 0.4 * Math.PI) * 0.5 : 1; pad.scale.set(1, s, 1); ring.scale.setScalar(1 + Math.sin(t * 4) * 0.08); });
  return pad;
}

// Fan that blows you sideways (or up).
export function fan(ctx, o) {
  const g = new THREE.Group(); g.position.set(o.x, o.y, o.z); ctx.root.add(g);
  const d = V(...o.dir).normalize();
  g.lookAt(o.x + d.x, o.y + d.y, o.z + d.z);
  const housing = sh(new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2, 1.2, 24, 1, true), M('#495057', { metal: 0.5, double: true })));
  housing.rotation.x = Math.PI / 2; g.add(housing);
  const blades = new THREE.Group(); g.add(blades);
  for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.6, 0.08), M('#e9ecef', { metal: 0.4 })); b.position.y = 0.8; const p = new THREE.Group(); p.rotation.z = i * Math.PI / 2; p.add(b); blades.add(p); }
  const strength = (o.strength || 30) * (0.9 + 0.1 * ctx.diff), L = o.len || 14, W = o.w || 6, Hh = o.h || 5;
  // wind zone in front of the fan
  const c = V(o.x, o.y, o.z).addScaledVector(d, L / 2), half = V(Math.abs(d.x) > 0.5 ? L / 2 : W / 2, Math.abs(d.y) > 0.5 ? L / 2 : Hh / 2, Math.abs(d.z) > 0.5 ? L / 2 : W / 2);
  const per = o.period || 0, f = V();
  const zone = ctx.world.zone(new Zone('wind', c.clone().sub(half), c.clone().add(half), { force: t => { const on = !per || (t % per) < per * 0.6; return f.copy(d).multiplyScalar(on ? strength : 0); } }));
  // visible air streaks
  const streakMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false });
  const streaks = [];
  for (let i = 0; i < 10; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1.6), streakMat); g.add(s); streaks.push({ m: s, x: (Math.random() - 0.5) * 2.4, y: (Math.random() - 0.5) * 2.4, o: Math.random() * L }); }
  ctx.ups.push(t => {
    const on = !per || (t % per) < per * 0.6;
    blades.rotation.z = t * (on ? 18 : 3);
    streaks.forEach(s => { s.m.visible = on; s.m.position.set(s.x, s.y, ((t * 14 + s.o) % L)); });
  });
  return zone;
}

// Block that shoots out from the side and pulls back.
export function piston(ctx, o) {
  const g = new THREE.Group(); ctx.root.add(g);
  block(ctx, { parent: g, x: 0, y: 0, z: 0, w: o.w, h: o.h, d: o.d, mat: o.mat || M('#ff8c42'), hit: o.hit ?? 14, dyn: true });
  const face = new THREE.Mesh(new THREE.BoxGeometry(o.w + 0.02, o.h * 0.5, o.d + 0.02), M('#ffffff', { map: hazardTex })); g.add(face);
  const dir = V(...(o.dir || [1, 0, 0])), sp = (o.speed || 1.4) * speedK(ctx), dist = o.dist || 5;
  ctx.ups.push(t => {
    const k = ((t * sp + (o.phase || 0)) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) / (Math.PI * 2);
    const out = k < 0.15 ? k / 0.15 : k < 0.45 ? 1 : k < 0.85 ? 1 - (k - 0.45) / 0.4 : 0;   // fast punch, slow return
    g.position.set(o.x + dir.x * dist * out, o.y + dir.y * dist * out, o.z + dir.z * dist * out);
  });
}

// Laser gate: beams that switch on and off. Touching a live beam sends you back to the checkpoint.
export function laser(ctx, o) {
  const w = o.w || 18, per = o.period || 3, on = o.on || 0.5;
  const g = new THREE.Group(); g.position.set(o.x, o.y, o.z); ctx.root.add(g);
  for (const s of [-1, 1]) { const p = sh(new THREE.Mesh(new THREE.BoxGeometry(0.6, 3.4, 0.6), M('#adb5bd', { metal: 0.7, rough: 0.3 }))); p.position.set(s * (w / 2 + 0.3), 1.7, 0); g.add(p); }
  const beamMat = new THREE.MeshStandardMaterial({ color: o.color || '#ff2a6d', emissive: o.color || '#ff2a6d', emissiveIntensity: 3, transparent: true });
  const beams = (o.heights || [0.5, 1.3]).map(hh => block(ctx, { parent: g, x: 0, y: hh, z: 0, w, h: 0.14, d: 0.14, mat: beamMat, surface: 'kill', dyn: true }));
  ctx.ups.push(t => {
    const k = (((t + (o.phase || 0)) % per) + per) % per / per;
    const live = k < on, warn = !live && k > 1 - 0.18;
    beams.forEach(b => { b.userData.col.enabled = live; b.visible = live || warn; b.scale.set(1, live ? 1 : 0.3, live ? 1 : 0.3); });
    beamMat.opacity = live ? 1 : 0.5;
  });
}

// Cannon firing balls down the lane.
export function cannon(ctx, o) {
  const g = new THREE.Group(); g.position.set(o.x, o.y, o.z); ctx.root.add(g);
  const d = V(...o.dir).normalize();
  g.rotation.y = Math.atan2(d.x, d.z);
  const barrel = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 3, 16), M('#343a40', { metal: 0.6, rough: 0.35 }))); barrel.rotation.x = Math.PI / 2; barrel.position.y = 1.4; g.add(barrel);
  for (const s of [-1, 1]) { const w = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.3, 16), M('#8d5524'))); w.rotation.z = Math.PI / 2; w.position.set(s * 1.1, 0.9, -0.4); g.add(w); }
  const per = (o.period || 2.4) / speedK(ctx), sp = (o.speed || 16) * speedK(ctx), range = o.range || 40, n = Math.ceil(range / sp / per) + 1;
  const balls = [];
  for (let i = 0; i < n; i++) balls.push(ball(ctx, { x: 0, y: -100, z: 0, r: o.r || 0.9, mat: M('#212529', { metal: 0.5, rough: 0.3 }), hit: o.hit ?? 16, dyn: true }));
  ctx.ups.push(t => {
    const tt = t + (o.phase || 0), last = Math.floor(tt / per);
    balls.forEach((b, i) => {
      const s = (tt - (last - i) * per) * sp;
      if (s < 0 || s > range) { b.position.set(0, -100, 0); b.userData.col.enabled = false; return; }
      b.userData.col.enabled = true;
      b.position.set(o.x + d.x * (s + 1.5), o.y + (o.r || 0.9), o.z + d.z * (s + 1.5));
    });
    barrel.position.z = -Math.max(0, 0.6 - ((tt % per) / per) * 3);
  });
}

// Conveyor belt.
export function belt(ctx, o) {
  const tex = surfaceTex('stripes', o.c1 || '#495057', o.c2 || '#adb5bd'); tex.repeat.set(o.w / 4, o.d / 4);
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
  const dir = V(...(o.dir || [0, 0, -1])).normalize().multiplyScalar(o.speed || 5);
  const m = block(ctx, { x: o.x, y: o.y, z: o.z, w: o.w, h: o.h || 0.6, d: o.d, mat, belt: dir });
  ctx.ups.push(t => { tex.offset.y = -t * (o.speed || 5) / 4 * Math.sign(dir.z || dir.x); });
  return m;
}

// Big wheel spinning across the lane with paddles.
export function wheel(ctx, o) {
  // A big paddle wheel. Each paddle covers only half the lane and the halves are a quarter turn
  // apart, so one side is always open: wait for the paddle on your side to pass, then run through.
  const g = new THREE.Group(); g.position.set(o.x, o.y, o.z); ctx.root.add(g);
  const r = o.r || 4, w = o.w || 6, n = 4, half = w / 2 - 0.2;
  const hub = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, w + 1, 16), M('#6c757d', { metal: 0.5 }))); hub.rotation.z = Math.PI / 2; g.add(hub);
  const matA = o.mat || M('#8d5524'), matB = M('#a1887f', { rough: 0.9 });
  const paddles = [];
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? 1 : -1, phi = i * Math.PI * 2 / n;
    const p = new THREE.Group(); p.rotation.x = phi; g.add(p);
    block(ctx, { parent: p, x: side * (w / 4 + 0.1), y: r / 2 + 0.4, z: 0, w: half, h: r, d: 0.5, mat: side < 0 ? matA : matB, hit: o.hit ?? 10, dyn: true });
    // a stripe on the edge so you can see which half it covers
    const edge = sh(new THREE.Mesh(new THREE.BoxGeometry(half, 0.3, 0.56), M('#ffd23f'))); edge.position.set(side * (w / 4 + 0.1), r + 0.25, 0); p.add(edge);
    paddles.push({ side, phi });
  }
  const sp = (o.speed || 1.0) * speedK(ctx) * (o.dir || 1);
  ctx.ups.push(t => { g.rotation.x = t * sp; });
  // Bot hint: is the half at lane x free of low paddles between `from` and `to` seconds from now?
  const band = 0.9, reach = Math.sin(band) * (r + 0.4) + 0.6;
  (ctx.gates || (ctx.gates = [])).push({
    z0: o.z - reach, z1: o.z + reach, sides: [-(w / 4 + 0.1), w / 4 + 0.1],
    clear(x, from, to) {
      const side = x > 0 ? 1 : -1;
      for (let tau = from; tau <= to + 1e-6; tau += 0.05)
        for (const q of paddles) {
          if (q.side !== side) continue;
          const a = (ctx.t + tau) * sp + q.phi - Math.PI, d = Math.atan2(Math.sin(a), Math.cos(a));
          if (Math.abs(d) < band) return false;
        }
      return true;
    }
  });
}

// Water jet that pops up and throws you high.
export function jet(ctx, o) {
  const per = o.period || 3, on = o.on || 0.45;
  const water = M('#6fd6ff', { opacity: 0.75, emissive: '#3a86ff', ei: 0.3, rough: 0.1 });
  const col = sh(new THREE.Mesh(new THREE.CylinderGeometry(o.r || 1.3, (o.r || 1.3) * 1.2, 1, 20, 1, true), water));
  ctx.root.add(col);
  const pad = cyl(ctx, { x: o.x, y: o.y - 0.07, z: o.z, r: o.r || 1.3, h: 0.3, mat: M('#adb5bd', { metal: 0.6 }), surface: 'bounce', bounce: o.power || 24, dyn: true });
  ctx.ups.push(t => {
    const k = (((t + (o.phase || 0)) % per) + per) % per / per, live = k < on;
    pad.userData.col.surface = live ? 'bounce' : 'normal';
    const hgt = live ? 3 + Math.sin(k / on * Math.PI) * 5 : 0.2;
    col.scale.set(1, hgt, 1); col.position.set(o.x, o.y + hgt / 2, o.z); col.visible = hgt > 0.3;
  });
}

// Inclined slippery slide.
export function slide(ctx, o) {
  const len = o.len, a = o.angle || 0.3;
  const m = block(ctx, { x: o.x, y: o.y, z: o.z, w: o.w, h: 0.6, d: len, rx: -a, mat: o.mat, surface: 'slide' });
  if (o.walls !== false) for (const s of [-1, 1]) block(ctx, { x: o.x + s * (o.w / 2 + 0.3), y: o.y + 0.6, z: o.z, w: 0.6, h: 1.4, d: len, rx: -a, mat: o.wallMat || o.mat });
  return m;
}

// Log spinning along its length: stand on it and it rolls you around.
export function log(ctx, o) {
  const g = new THREE.Group(); g.position.set(o.x, o.y, o.z); g.rotation.z = Math.PI / 2; ctx.root.add(g);
  const m = cyl(ctx, { parent: g, x: 0, y: 0, z: 0, r: o.r || 1.2, h: o.len || 10, mat: o.mat || M('#8d5524'), dyn: true, seg: 24 });
  for (let i = -2; i <= 2; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry((o.r || 1.2) + 0.02, 0.06, 6, 24), M('#5c3d1e')); ring.rotation.x = Math.PI / 2; ring.position.y = i * (o.len || 10) / 5; m.add(ring); }
  const sp = (o.speed || 1.5) * speedK(ctx) * (o.dir || 1);
  ctx.ups.push(t => { m.rotation.y = t * sp; });
}

// Platform tilting from side to side.
export function tilter(ctx, o) {
  const g = new THREE.Group(); g.position.set(o.x, o.y, o.z); ctx.root.add(g);
  block(ctx, { parent: g, x: 0, y: 0, z: 0, w: o.w, h: 0.6, d: o.d, mat: o.mat, dyn: true, surface: o.surface });
  const sp = (o.speed || 1) * speedK(ctx);
  ctx.ups.push(t => { g.rotation.z = (o.amp || 0.3) * Math.sin(t * sp + (o.phase || 0)); });
}

// Round bumper that bounces you away.
export function bumper(ctx, o) {
  const m = cyl(ctx, { x: o.x, y: o.y + 0.8, z: o.z, r: o.r || 0.9, h: 1.6, mat: o.mat || M('#ff2a6d', { emissive: '#ff2a6d', ei: 0.6 }), hit: 11, dyn: true });
  m.userData.col.alwaysHit = true;
  ctx.ups.push(t => { const s = 1 + Math.sin(t * 5 + o.x) * 0.05; m.scale.set(s, 1, s); });
}

// Kill volume (lava, water, laser floor) with an animated surface on top.
export function hazardFloor(ctx, o) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(o.w, o.d, 1, 1), o.mat);
  m.rotation.x = -Math.PI / 2; m.position.set(o.x, o.y, o.z); m.receiveShadow = true; ctx.root.add(m);
  const killer = new THREE.Object3D(); killer.position.set(o.x, o.y - 1, o.z); ctx.root.add(killer);
  ctx.world.add(new Collider('box', killer, { half: V(o.w / 2, 1, o.d / 2), surface: 'kill' }));
  if (o.mat.map) ctx.ups.push(t => { o.mat.map.offset.set(t * (o.flow || 0.02), t * (o.flow || 0.02) * 0.6); });
  return m;
}

// Rising kill plane for survival rounds.
export function rising(ctx, o) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(o.w, o.d), o.mat);
  m.rotation.x = -Math.PI / 2; ctx.root.add(m);
  const killer = new THREE.Object3D(); ctx.root.add(killer);
  const col = ctx.world.add(new Collider('box', killer, { half: V(o.w / 2, 1, o.d / 2), surface: 'kill', dynamic: true }));
  ctx.ups.push(t => { const y = o.y + Math.max(0, t - (o.delay || 10)) * (o.rate || 0.08); m.position.set(o.x, y, o.z); killer.position.set(o.x, y - 1, o.z); if (o.mat.map) o.mat.map.offset.set(t * 0.03, t * 0.02); });
  return col;
}
