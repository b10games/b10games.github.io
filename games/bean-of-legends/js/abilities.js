// All hero abilities and the special effects of basic attacks.
// Q/W/E/R use KINDS[ab.kind](match, caster, abilityData, rank, x, z, target); ultimates (T, slot 4) are CAST['hero:4'].
import { THREE, canvasTex } from './engine.js';
import { Unit } from './units.js';
import { Bean } from './models.js';

const P = (m, x, z, up = 0) => new THREE.Vector3(x, m.groundY(x, z) + up, z);
const D = (c, ab, r) => (ab.dmg ? ab.dmg[r - 1] : 0) + (ab.ad || 0) * c.st.ad + (ab.ap || 0) * c.st.ap;
const dir = (c, x, z) => { const dx = x - c.x, dz = z - c.z, l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; };
const basic = (color, o = {}) => new THREE.MeshBasicMaterial({ color, transparent: o.opacity !== undefined, opacity: o.opacity ?? 1, depthWrite: o.opacity === undefined, side: THREE.DoubleSide, blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending });
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, emissive: o.emissive || '#000000', emissiveIntensity: o.ei ?? 1, roughness: 0.4, transparent: !!o.opacity, opacity: o.opacity ?? 1 });

// a mesh that follows a unit for a while
function follow(m, u, mesh, life, up = 0, extra) {
  m.fx.temp(mesh, life, (k, dt) => { mesh.position.set(u.x, m.groundY(u.x, u.z) + up, u.z); if (extra) extra(k, dt); if (!u.alive) mesh.visible = false; });
}
function bubble(m, u, color, life, r = 1.6) {
  const s = new THREE.Mesh(new THREE.SphereGeometry(r * (u.st.size || 1), 20, 14), basic(color, { opacity: 0.22 }));
  follow(m, u, s, life, 1.1, k => { s.material.opacity = 0.22 * (1 - k * k); });
}
function zoneDisc(m, x, z, r, color, opacity = 0.35) {
  const g = new THREE.Group(); g.position.copy(P(m, x, z, 0.15));
  const d = new THREE.Mesh(new THREE.CircleGeometry(r, 40), basic(color, { opacity })); d.rotation.x = -Math.PI / 2; g.add(d);
  const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.18, r, 48), basic(color, { opacity: Math.min(1, opacity * 2.4) })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; g.add(ring);
  return g;
}
function hitAll(m, c, x, z, r, fn) { for (const e of m.enemiesIn(x, z, r, c.team)) fn(e); }
function spinMesh(color, kind) {
  if (kind === 'star') { const g = new THREE.Group(); for (let i = 0; i < 2; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.22), std('#cfd6de', { emissive: color, ei: 0.4 })); b.rotation.y = i * Math.PI / 2; g.add(b); } return g; }
  if (kind === 'feather') { const f = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), std('#f8f9fa', { emissive: '#9aa5b1', ei: 0.3 })); f.scale.set(0.25, 0.08, 1); return f; }
  if (kind === 'laser') { const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 1.4, 4, 8), basic(color)); l.rotation.x = Math.PI / 2; const g = new THREE.Group(); g.add(l); return g; }
  if (kind === 'rock') { const g = new THREE.Group(); const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6), new THREE.MeshStandardMaterial({ color: '#8d6e63', roughness: 0.9, flatShading: true })); g.add(r); return g; }
  if (kind === 'blob') { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 1), std('#e53935', { emissive: '#7a0000', ei: 0.4 }))); for (let i = 0; i < 3; i++) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), std('#ff4d4d')); d.position.set((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, -0.5 - i * 0.3); g.add(d); } return g; }
  if (kind === 'banana') { const b = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.17, 6, 14, Math.PI * 1.1), std('#ffe14d', { emissive: '#7a5a00', ei: 0.2 })); b.rotation.x = Math.PI / 2; const g = new THREE.Group(); g.add(b); return g; }
  return new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), basic(color));
}
// diminishing damage when several missiles from one cast hit the same unit
function multiHit() { const hits = new Map(); return (u) => { const n = hits.get(u.id) || 0; hits.set(u.id, n + 1); return n === 0 ? 1 : 0.5; }; }

export function spawnClone(m, owner, x, z, dur, pct) {
  const u = new Unit(m, { kind: 'clone', team: owner.team, x, z, radius: 0.85, mass: 2, melee: true, owner, name: 'Shadow Clone',
    base: { hp: owner.st.maxHp * 0.4, ad: 0, armor: owner.st.armor, mr: owner.st.mr, as: owner.st.as, range: owner.st.range, ms: owner.st.ms + 0.4, hpRegen: 0 } });
  u.clonePct = pct;
  const model = new Bean('ninja', ['#1b1036', '#7b2cbf']);
  model.root.scale.setScalar(1.3);
  m.addUnit(u, model);
  u.addBuff({ id: 'clone', t: dur, onEnd: v => { if (v.alive) m.kill(v, null); } });
  m.fx.smoke(P(m, x, z, 0.5), '#5a189a', 10, 1.5);
  return u;
}

// ================= the ability kit =================
// Q = one strong hit (splash only reaches enemies bunched up next to the target), W = area attack,
// E = sprint, R = every bean's own special. Q/W/E use shared "kinds" tuned per hero in data.js; T = ultimates below.
const col = (c, ab) => ab.color || c.def.hitColor;
const foes = (m, c, x, z, r) => m.enemiesIn(x, z, r, c.team);
const byHeroThenNear = (from) => (a, b) => (b.hero - a.hero) * 4 + a.distTo(from.x, from.z) - b.distTo(from.x, from.z);
// the main hit of a Q: full damage on the target, a smaller splash on anyone squeezed right next to it
function strike(m, c, ab, r, t, mult = 1) {
  const color = col(c, ab), dmg = D(c, ab, r) * mult;
  const dealt = m.damage(c, t, dmg, ab.dtype);
  if (ab.slow) m.slow(t, ab.slow, 1.5);
  const sp = ab.splash || 0;
  if (sp > 0) {
    const others = foes(m, c, t.x, t.z, sp).filter(e => e !== t);
    for (const e of others) { m.damage(c, e, dmg * (ab.splashPct || 0.6), ab.dtype); m.fx.sparks(P(m, e.x, e.z, 1.1), color, 6); }
    if (others.length || sp >= 2) m.fx.ring(P(m, t.x, t.z), color, 0.3, sp + 0.4, 0.3, 0.85);
  }
  if (ab.splat) m.fx.decal(P(m, t.x, t.z), ab.splat, Math.max(1.2, sp * 0.8), 2.5, 0.65);
  m.fx.impact(P(m, t.x, t.z, 1.1 * (t.st.size || 1)), color, 1.1 + mult * 0.3);
  return dealt;
}
const RUNE_TEX = {};
function runeCircle(R, color) {
  const tex = RUNE_TEX[color] || (RUNE_TEX[color] = canvasTex(256, 256, (cx, w) => {
    cx.translate(w / 2, w / 2); cx.strokeStyle = color; cx.lineWidth = 7; cx.beginPath(); cx.arc(0, 0, w / 2 - 5, 0, 7); cx.stroke();
    cx.lineWidth = 3; cx.beginPath(); cx.arc(0, 0, w / 2 - 24, 0, 7); cx.stroke();
    cx.strokeStyle = '#ffd23f'; cx.lineWidth = 4; cx.beginPath(); for (let i = 0; i <= 5; i++) { const a = i * 4 * Math.PI / 5 - Math.PI / 2; cx.lineTo(Math.cos(a) * (w / 2 - 24), Math.sin(a) * (w / 2 - 24)); } cx.stroke();
    cx.fillStyle = '#ffffff'; for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; cx.beginPath(); cx.arc(Math.cos(a) * (w / 2 - 14), Math.sin(a) * (w / 2 - 14), 3, 0, 7); cx.fill(); }
  }));
  const g = new THREE.Group();
  const d = new THREE.Mesh(new THREE.CircleGeometry(R, 48), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  d.rotation.x = -Math.PI / 2; g.add(d);
  return g;
}
function birdMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), std('#9aa5b1')); body.scale.set(0.8, 0.75, 1.3); g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), std('#7bd389', { emissive: '#2e7d4f', ei: 0.2 })); head.position.set(0, 0.16, 0.34); g.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 6), std('#ff8c42')); beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.14, 0.55); g.add(beak);
  for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.32), std('#c3ccd6')); w.position.set(0.42 * s, 0.08, 0); w.rotation.z = 0.35 * s; g.add(w); }
  return g;
}

export const KINDS = {
  // ---------- Q ----------
  // one or more projectiles; each stops at the first enemy it touches
  bolt(m, c, ab, r, x, z) {
    const base = Math.atan2(x - c.x, z - c.z), n = ab.count || 1, mh = multiHit(), color = col(c, ab);
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * (ab.spread || 0.16);
      m.after(i * 0.04, () => {
        if (!c.alive) return;
        m.skillshot({ src: c, dx: Math.sin(a), dz: Math.cos(a), speed: ab.speed, range: ab.range, width: ab.width, color, mesh: spinMesh(color, ab.shape), spin: ab.spin || 0, size: 0.35,
          onHit: e => { strike(m, c, ab, r, e, mh(e)); m.sound(ab.shape === 'blob' ? 'splat' : 'hit', e.x, e.z, 0.8); if ((ab.splash || 0) >= 2) m.shake(e.x, e.z, 0.2); } });
      });
    }
    m.fx.flash(P(m, c.x + Math.sin(base), c.z + Math.cos(base), 1.3), color, 1.1, 0.15);
    c.atkAnim = 0;
    m.sound(ab.shape === 'laser' ? 'laser' : ab.shape === 'blob' ? 'splat' : 'shoot', c.x, c.z);
  },
  // leap at one enemy and hit it (the shark bites twice)
  lunge(m, c, ab, r, x, z, t) {
    if (!t) return;
    const color = col(c, ab), hits = ab.hits || 1;
    const hit = () => {
      for (let i = 0; i < hits; i++) m.after(i * 0.2, () => {
        if (!t.alive || !c.alive) return;
        c.facing = Math.atan2(t.x - c.x, t.z - c.z); c.atkAnim = 0;
        const dealt = strike(m, c, ab, r, t);
        if (ab.lifesteal) m.heal(c, c, dealt * ab.lifesteal, true);
        const bp = P(m, t.x, t.z, 1.1 * (t.st.size || 1));
        if (ab.bite) { m.fx.slash(bp, c.facing + Math.PI / 2, '#ffffff', 1.4, 2.6, 1.4, 0.2); m.fx.slash(bp, c.facing + Math.PI / 2, color, 1.4, 2.6, -1.4, 0.2, true); m.fx.burst(bp, '#4d9de0', 12, 5); }
        else { m.fx.slash(bp, c.facing, '#ffffff', 2.4, 2.8, 0.9, 0.22); m.fx.slash(bp, c.facing, color, 2.0, 2.4, -0.9, 0.22, true); m.fx.rays(P(m, t.x, t.z), '#ffd23f', 8, 3.5, 0.3); m.fx.decal(P(m, t.x, t.z), '#2b2420', 1.4, 2, 0.45); }
        m.shake(t.x, t.z, 0.25); m.sound(ab.bite ? 'crit' : 'hit', t.x, t.z);
      });
    };
    const d = c.dist(t), stop = t.radius + c.radius + 0.3;
    if (d > stop + 0.4) {
      const ang = Math.atan2(t.x - c.x, t.z - c.z);
      m.sound('dash', c.x, c.z);
      m.dash(c, t.x - Math.sin(ang) * stop, t.z - Math.cos(ang) * stop, 28, { arc: ab.bite ? 0.8 : 1.4, onStep: u => m.fx.trail(P(m, u.x, u.z, 0.7), color, 0.35), onArrive: hit });
    } else hit();
  },
  // homing missiles that never miss
  missiles(m, c, ab, r, x, z, t) {
    if (!t) return;
    const n = ab.count || 3, mh = multiHit(), color = col(c, ab);
    for (let i = 0; i < n; i++) m.after(i * 0.12, () => {
      if (!c.alive || !t.alive) return;
      const a = c.facing + (i - (n - 1) / 2) * 0.9;
      m.homing({ src: { x: c.x + Math.sin(a) * 0.9, z: c.z + Math.cos(a) * 0.9, team: c.team }, tgt: t, speed: 20 + i * 3, color, size: 0.34, shape: 'star', spin: 12, y0: 1.9,
        onHit: () => { if (t.alive) { strike(m, c, ab, r, t, mh(t)); m.fx.sparks(P(m, t.x, t.z, 1.2), '#ffd23f', 8); m.sound('magic', t.x, t.z, 0.6); } } });
      m.fx.sparks(P(m, c.x, c.z, 1.8), color, 5);
    });
    c.atkAnim = 0; m.sound('magic', c.x, c.z);
  },
  // a feather that bounces on to more enemies, but only when they stand close together
  bounce(m, c, ab, r, x, z, t) {
    if (!t) return;
    const color = col(c, ab), hit = new Set();
    const go = (from, tgt, k) => {
      hit.add(tgt.id);
      m.homing({ src: from, tgt, speed: 30, color, size: 0.34, feather: true, y0: 1.4, onHit: () => {
        if (!tgt.alive) return;
        strike(m, c, ab, r, tgt, Math.pow(0.65, k));
        m.fx.burst(P(m, tgt.x, tgt.z, 1.2), '#ffffff', 8, 4);
        m.sound('hit', tgt.x, tgt.z, 0.6);
        if (k >= (ab.bounces || 2)) return;
        const next = foes(m, c, tgt.x, tgt.z, ab.bounceR || 5).filter(e => !hit.has(e.id) && m.visibleTo(e, c.team)).sort(byHeroThenNear(tgt))[0];
        if (next) go({ x: tgt.x, z: tgt.z, team: c.team }, next, k + 1);
      } });
    };
    go({ x: c.x, z: c.z, team: c.team }, t, 0);
    c.atkAnim = 0; m.sound('swing', c.x, c.z);
  },
  // ---------- W ----------
  // area around yourself
  nova(m, c, ab, r) {
    const color = col(c, ab), R = ab.radius, p = P(m, c.x, c.z);
    if (ab.spin) { c.spinT = 0.4; c.spinMax = 0.4; m.fx.slash(P(m, c.x, c.z, 0.8), c.facing, color, R, Math.PI * 1.95, 0, 0.3); m.fx.slash(P(m, c.x, c.z, 1.1), c.facing + Math.PI, '#ffffff', R * 0.8, Math.PI * 1.9, 0, 0.25, true); }
    m.fx.shockwave(p, color, R);
    m.fx.ring(p, '#ffffff', 0.5, R, 0.4, 0.9);
    if (ab.crack) { m.fx.decal(p, '#2b2420', R * 0.85, 3, 0.55); m.fx.dust(p, 18); for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28; m.fx.burst(P(m, c.x + Math.cos(a) * R * 0.7, c.z + Math.sin(a) * R * 0.7, 0.3), '#a1887f', 5, 4, 0.25, 5); } }
    if (ab.water) { m.fx.burst(P(m, c.x, c.z, 0.5), '#4d9de0', 40, 8, 0.28, 7); m.fx.burst(P(m, c.x, c.z, 0.5), '#ffffff', 20, 6, 0.2, 8); m.fx.decal(p, '#4d9de0', R, 2.5, 0.5); }
    if (ab.zap) { m.fx.light(p, color, 40, 0.4, R * 3); for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28 + Math.random(); m.fx.lightning(P(m, c.x, c.z, 1.2), P(m, c.x + Math.cos(a) * R, c.z + Math.sin(a) * R, 0.3), color, 0.25); } }
    m.shake(c.x, c.z, R > 5 ? 0.45 : 0.3);
    m.sound(ab.zap ? 'laser' : ab.water ? 'splat' : ab.crack ? 'boom' : 'swing', c.x, c.z, 0.9);
    for (const e of foes(m, c, c.x, c.z, R)) {
      m.damage(c, e, D(c, ab, r), ab.dtype);
      if (ab.slow) m.slow(e, ab.slow, 1.5);
      if (ab.knock) m.knock(e, c.x, c.z, ab.knock, 0.3);
      if (ab.zap) m.fx.lightning(P(m, c.x, c.z, 1.2), P(m, e.x, e.z, 1.1), '#ffffff', 0.2);
      m.fx.sparks(P(m, e.x, e.z, 1.1), color, 6);
    }
  },
  // area at a spot, after a short delay (meteor, bottle, bananas, magic circle)
  blast(m, c, ab, r, x, z) {
    const color = col(c, ab), R = ab.radius, delay = ab.delay || 0.5;
    const warn = zoneDisc(m, x, z, R, color, 0.16);
    m.fx.temp(warn, delay, k => { warn.children[0].material.opacity = 0.08 + 0.22 * k; });
    m.fx.ring(P(m, x, z), color, R, 0.4, delay, 0.7);
    const sx = c.x, sz = c.z, sy = m.groundY(c.x, c.z) + 1.6, ty = m.groundY(x, z);
    let obj = null;
    if (ab.drop === 'meteor') { obj = new THREE.Group(); obj.add(new THREE.Mesh(new THREE.DodecahedronGeometry(1.1), std('#5d4037', { emissive: '#ff5a00', ei: 0.6 }))); obj.add(new THREE.Mesh(new THREE.SphereGeometry(1.7, 12, 10), basic('#ff8c42', { opacity: 0.45, add: true }))); }
    else if (ab.drop === 'bottle') { obj = new THREE.Group(); obj.add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, 1.1, 10), std('#ffcc00'))); const cap = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 10), std('#e53935')); cap.position.y = 0.75; obj.add(cap); }
    else if (ab.drop === 'banana') { obj = new THREE.Group(); for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.2, 6, 12, Math.PI * 1.1), std('#ffe14d')); b.rotation.set(0, i * 0.6 - 0.6, Math.PI * 0.2); obj.add(b); } }
    else if (ab.drop === 'rune') { const rc = runeCircle(R, color); rc.position.copy(P(m, x, z, 0.2)); m.fx.temp(rc, delay + 0.15, (k, dt) => { rc.rotation.y += dt * 3; rc.children[0].material.opacity = 0.3 + 0.7 * Math.min(1, k * 1.5); }); m.fx.column(P(m, x, z), color, 0.6, 3, delay); }
    if (obj) m.fx.temp(obj, delay, (k, dt) => {
      if (ab.drop === 'meteor') { obj.position.set(x - 8 * (1 - k), ty + 22 * (1 - k) + 0.6, z - 5 * (1 - k)); obj.rotation.x += dt * 4; m.fx.flames(obj.position, 2, 0.6); m.fx.trail(obj.position, '#ff8c42', 0.8); }
      else { obj.position.set(sx + (x - sx) * k, sy + (ty - sy) * k + Math.sin(k * Math.PI) * 5, sz + (z - sz) * k); obj.rotation.z += dt * 10; }
    });
    c.atkAnim = 0;
    m.sound(ab.drop === 'rune' ? 'magic' : ab.drop === 'meteor' ? 'alarm' : 'swing', c.x, c.z, 0.7);
    m.after(delay, () => {
      const p = P(m, x, z);
      m.fx.shockwave(p, color, R); m.fx.flash(P(m, x, z, 1), ab.drop === 'meteor' ? '#ffffff' : color, R * 0.5, 0.3); m.fx.light(p, color, 40, 0.45, R * 3);
      m.fx.decal(p, ab.splat || (ab.drop === 'meteor' ? '#2b1a12' : color), R * 0.9, 3, ab.splat ? 0.7 : 0.5);
      m.fx.burst(P(m, x, z, 0.6), color, 30, 8, 0.28, 6, 0.6);
      if (ab.drop === 'meteor') { m.fx.smoke(P(m, x, z, 0.5), '#6d5a50', 18, R * 0.8); m.fx.rays(p, '#ffd23f', 12, R * 1.6, 0.5); m.fx.flames(P(m, x, z, 0.2), 14, R * 0.6); }
      if (ab.drop === 'banana') m.fx.confetti(P(m, x, z, 1), 40, R);
      if (ab.drop === 'rune') m.fx.column(p, color, R * 0.5, 7, 0.5);
      m.shake(x, z, R > 5 ? 0.6 : 0.35); m.sound(ab.drop === 'meteor' ? 'boom' : ab.drop === 'rune' ? 'magic' : ab.drop === 'banana' ? 'slip' : 'splat', x, z, 1);
      for (const e of foes(m, c, x, z, R)) {
        m.damage(c, e, D(c, ab, r), ab.dtype);
        if (ab.slow) m.slow(e, ab.slow, 1.5);
        if (ab.stun) { m.stun(e, ab.stun); e.spinT = 0.6; e.spinMax = 0.6; }
        m.fx.sparks(P(m, e.x, e.z, 1.1), color, 6);
      }
    });
  },
  // cone in front of you
  cone(m, c, ab, r, x, z) {
    const color = col(c, ab), R = ab.radius, arc = ab.arc || 1.4, base = Math.atan2(x - c.x, z - c.z), half = arc / 2;
    c.facing = base; c.atkAnim = 0;
    m.fx.slash(P(m, c.x, c.z, 0.9), base, color, R, arc, 0, 0.35);
    m.fx.slash(P(m, c.x, c.z, 1.4), base, '#ffffff', R * 0.75, arc * 0.9, 0, 0.3, true);
    for (let i = 0; i < 46; i++) { const a = base + (Math.random() - 0.5) * arc, sp = 12 + Math.random() * 8; m.fx.emit({ p: P(m, c.x + Math.sin(a), c.z + Math.cos(a), 0.4 + Math.random() * 1.2), v: new THREE.Vector3(Math.sin(a) * sp, 0.6, Math.cos(a) * sp), life: 0.4, size: i % 4 ? 0.14 : 0.24, color: i % 3 ? '#ffffff' : color, drag: 2.5 }); }
    m.fx.dust(P(m, c.x + Math.sin(base) * 2, c.z + Math.cos(base) * 2), 10);
    m.sound('swing', c.x, c.z, 1.2); m.sound('dash', c.x, c.z, 0.6);
    for (const e of foes(m, c, c.x, c.z, R)) {
      let da = Math.abs(Math.atan2(e.x - c.x, e.z - c.z) - base); if (da > Math.PI) da = 2 * Math.PI - da;
      if (da > half + 0.15 && c.dist(e) > 1.6) continue;
      m.damage(c, e, D(c, ab, r), ab.dtype);
      if (ab.knock) m.knock(e, c.x, c.z, ab.knock, 0.3);
      m.fx.burst(P(m, e.x, e.z, 1.1), '#ffffff', 8, 4);
    }
  },
  // ---------- E ----------
  sprint(m, c, ab, r) {
    const color = col(c, ab), dur = ab.dur || 3, flame = c.heroId === 'hotdog' || c.heroId === 'astro';
    c.addBuff({ id: 'sprint', icon: ab.icon, color: '#7bd389', name: ab.name, t: dur, ghost: true, mods: { msPct: ab.ms[r - 1] },
      onTick: (u, dt) => {
        if (Math.random() < dt * 24) m.fx.trail(P(m, u.x - Math.sin(u.facing) * 0.6, u.z - Math.cos(u.facing) * 0.6, 0.3 + Math.random() * 0.9), color, 0.4);
        if (u.moving && Math.random() < dt * 8) m.fx.dust(P(m, u.x, u.z), 2);
        if (flame && Math.random() < dt * 14) m.fx.flames(P(m, u.x - Math.sin(u.facing) * 0.5, u.z - Math.cos(u.facing) * 0.5, c.heroId === 'astro' ? 0.9 : 0.1), 1, 0.3);
      } });
    m.fx.ring(P(m, c.x, c.z), color, 0.4, 3.2, 0.4, 0.9); m.fx.burst(P(m, c.x, c.z, 0.8), color, 16, 5, 0.22, 3); m.fx.dust(P(m, c.x, c.z), 10);
    m.sound('dash', c.x, c.z);
  },
  // ---------- R: every bean's own special ----------
  // knight: shield thrown like a boomerang, hits on the way out and back
  boomerang(m, c, ab, r, x, z) {
    const color = col(c, ab), [dx, dz] = dir(c, x, z); let stunned = false;
    const mk = () => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.14, 20), std('#3a86ff', { emissive: '#1d3f8f', ei: 0.5 })));
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.08, 6, 24), std('#ffd23f', { emissive: '#7a5a00', ei: 0.4 })); rim.rotation.x = Math.PI / 2; g.add(rim);
      const boss = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), std('#ffd23f')); boss.position.y = 0.08; g.add(boss);
      return g;
    };
    const onHit = e => {
      m.damage(c, e, D(c, ab, r), ab.dtype); m.fx.impact(P(m, e.x, e.z, 1.1), '#ffd23f', 1.3, true); m.sound('hit', e.x, e.z);
      if (!stunned && e.hero) { stunned = true; m.stun(e, ab.stun); m.fx.ring(P(m, e.x, e.z), '#ffd23f', 0.3, 2, 0.4); m.shake(e.x, e.z, 0.3); }
    };
    c.atkAnim = 0; m.sound('swing', c.x, c.z, 1.2);
    m.skillshot({ src: c, dx, dz, speed: ab.speed, range: ab.range, width: ab.width, pierce: true, color, mesh: mk(), spin: 16, size: 0.6, onHit,
      onEnd: (ex, ez) => {
        if (!c.alive) return;
        const bdx = c.x - ex, bdz = c.z - ez, l = Math.hypot(bdx, bdz) || 1;
        m.fx.sparks(P(m, ex, ez, 1.3), '#ffd23f', 8);
        m.skillshot({ src: c, x: ex, z: ez, dx: bdx, dz: bdz, speed: ab.speed * 1.15, range: l, width: ab.width, pierce: true, color, mesh: mk(), spin: -16, size: 0.6, onHit,
          onEnd: () => { if (c.alive) { m.fx.sparks(P(m, c.x, c.z, 1.3), '#ffd23f', 10); m.sound('shield', c.x, c.z, 0.6); } } });
      } });
  },
  // ninja: teleport behind an enemy and stab it
  shadowstrike(m, c, ab, r, x, z, t) {
    if (!t) return;
    m.fx.smoke(P(m, c.x, c.z, 0.5), '#3c096c', 14, 1.2); m.fx.flash(P(m, c.x, c.z, 1.2), '#7b2cbf', 1.6, 0.2);
    const ang = Math.atan2(t.x - c.x, t.z - c.z), back = t.radius + c.radius + 0.4;
    m.blink(c, t.x + Math.sin(ang) * back, t.z + Math.cos(ang) * back);
    c.facing = ang + Math.PI; c.atkAnim = 0;
    const bp = P(m, t.x, t.z, 1.1);
    m.damage(c, t, D(c, ab, r), ab.dtype);
    m.fx.slash(bp, c.facing, '#c77dff', 2.2, 2.6, 0.9, 0.25); m.fx.slash(bp, c.facing, '#ffffff', 1.8, 2.4, -0.9, 0.22, true); m.fx.impact(bp, '#c77dff', 1.6, true); m.fx.smoke(P(m, c.x, c.z, 0.5), '#5a189a', 12, 1.2);
    m.shake(t.x, t.z, 0.35); m.sound('crit', t.x, t.z); m.sound('poof', c.x, c.z, 0.7);
    c.addBuff({ id: 'vanish', icon: 'shadowstrike', t: 1, stealth: true });
    c.empower = { kind: 'ninja', until: m.time + 4 };
  },
  // dino: a line of rock spikes bursting out of the ground
  fissure(m, c, ab, r, x, z) {
    const [dx, dz] = dir(c, x, z), sx = c.x, sz = c.z, hit = new Set(), color = col(c, ab), step = 1.1, steps = Math.ceil(ab.range / step);
    const geo = new THREE.ConeGeometry(0.55, 2.3, 5); geo.translate(0, 1.15, 0);
    const mat = new THREE.MeshStandardMaterial({ color: '#8d6e63', roughness: 0.85, flatShading: true });
    c.atkAnim = 0; c.spinT = 0.3; c.spinMax = 0.3;
    m.sound('roar', c.x, c.z, 0.6); m.sound('boom', c.x, c.z, 0.5);
    for (let i = 1; i <= steps; i++) m.after(i * 0.035, () => {
      const d = i * step, px = sx + dx * d, pz = sz + dz * d;
      for (let k = 0; k < 2; k++) {
        const s = new THREE.Mesh(geo, mat), jx = (Math.random() - 0.5) * 1.6, jz = (Math.random() - 0.5) * 1.6, sc = 0.6 + Math.random() * 0.6;
        s.position.copy(P(m, px + jx, pz + jz, -0.2)); s.rotation.set((Math.random() - 0.5) * 0.6, Math.random() * 6, (Math.random() - 0.5) * 0.6); s.castShadow = true;
        m.fx.temp(s, 1.1, kk => { const g = kk < 0.12 ? kk / 0.12 : kk > 0.7 ? 1 - (kk - 0.7) / 0.3 : 1; s.scale.set(sc, sc * Math.max(0.01, g), sc); });
      }
      m.fx.dust(P(m, px, pz), 4, '#a1887f');
      if (i % 2) m.fx.decal(P(m, px, pz), '#3a2a1a', 1.3, 2.5, 0.5);
      for (const e of foes(m, c, px, pz, ab.width / 2 + 0.6)) if (!hit.has(e.id)) { hit.add(e.id); m.damage(c, e, D(c, ab, r), ab.dtype); m.stun(e, 0.6, 'knockup'); m.fx.impact(P(m, e.x, e.z, 1.2), color, 1.2); }
      if (i === Math.ceil(steps / 2)) m.shake(px, pz, 0.5);
    });
  },
  // shark: swim under the ground, burst out at the other end
  deepdive(m, c, ab, r, x, z) {
    const color = col(c, ab), l = c.distTo(x, z), speed = 20;
    m.fx.burst(P(m, c.x, c.z, 0.4), '#8d6e63', 24, 6, 0.3, 5); m.fx.burst(P(m, c.x, c.z, 0.4), color, 16, 5); m.fx.decal(P(m, c.x, c.z), '#3a2a1a', 1.8, 2.5, 0.6); m.sound('splat', c.x, c.z);
    c.addBuff({ id: 'burrow', icon: 'dive', t: l / speed + 0.4, burrow: true, untargetable: true, ghost: true });
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.1, 4), std('#4d9de0')); fin.scale.z = 0.35;
    m.fx.temp(fin, l / speed + 0.1, () => { fin.position.set(c.x, m.groundY(c.x, c.z) + 0.45, c.z); fin.rotation.y = c.facing; });
    m.dash(c, x, z, speed, { onStep: u => { if (Math.random() < 0.7) m.fx.dust(P(m, u.x, u.z), 2, '#a1887f'); }, onArrive: u => {
      u.removeBuff('burrow');
      const p = P(m, u.x, u.z);
      m.fx.shockwave(p, color, ab.radius); m.fx.burst(P(m, u.x, u.z, 0.5), '#8d6e63', 30, 8, 0.3, 8); m.fx.burst(P(m, u.x, u.z, 0.6), '#9fd8ff', 24, 7, 0.25, 8); m.fx.decal(p, '#3a2a1a', ab.radius, 3, 0.6);
      m.shake(u.x, u.z, 0.55); m.sound('boom', u.x, u.z, 0.9);
      for (const e of foes(m, u, u.x, u.z, ab.radius)) { m.damage(u, e, D(u, ab, r), ab.dtype); m.stun(e, 0.75, 'knockup'); }
    } });
  },
  // astronaut: three satellites circling around (damage runs in the simulation, the look follows the same clock)
  satellite(m, c, ab, r) {
    const color = col(c, ab), dur = ab.dur || 5, R = ab.radius, t0 = m.time, last = new Map();
    const at = (i, t) => { const a = (t - t0) * 3.2 + i * Math.PI * 2 / 3; return [c.x + Math.cos(a) * R, c.z + Math.sin(a) * R, a]; };
    c.addBuff({ id: 'satellite', icon: 'planet', t: dur, onTick: () => {
      for (let i = 0; i < 3; i++) {
        const [ox, oz] = at(i, m.time);
        for (const e of foes(m, c, ox, oz, 1.1)) {
          const k = e.id * 4 + i, lt = last.get(e.id) || -9;
          if (m.time - lt < 0.5) continue;
          last.set(e.id, m.time); void k;
          m.damage(c, e, D(c, ab, r), ab.dtype); m.fx.sparks(P(m, e.x, e.z, 1.1), color, 8);
        }
      }
    } });
    const holder = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.3), basic('#ffffff')));
      g.add(new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.04, 0.3), std('#3a86ff', { emissive: '#3a86ff', ei: 0.7 })));
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), basic(color, { opacity: 0.35, add: true })));
      holder.add(g);
    }
    m.fx.temp(holder, dur, () => {
      holder.visible = c.alive;
      for (let i = 0; i < 3; i++) { const [ox, oz, a] = at(i, m.time), o = holder.children[i]; o.position.set(ox, m.groundY(ox, oz) + 1.3 + Math.sin(m.time * 4 + i) * 0.25, oz); o.rotation.y = -a; if (Math.random() < 0.6) m.fx.trail(o.position, color, 0.3); }
    });
    m.fx.ring(P(m, c.x, c.z), color, 0.5, R, 0.4); m.sound('magic', c.x, c.z); m.sound('laser', c.x, c.z, 0.5);
  },
  // hot dog: a grill turret that shoots sausages
  grill(m, c, ab, r, x, z) {
    const dur = ab.dur || 6, g = new THREE.Group(); g.position.copy(P(m, x, z));
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 1.1), std('#343a40')); box.position.y = 1.0; g.add(box);
    for (const [lx, lz] of [[-0.7, -0.4], [0.7, -0.4], [-0.7, 0.4], [0.7, 0.4]]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 6), std('#6c757d')); leg.position.set(lx, 0.4, lz); g.add(leg); }
    const coals = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 0.9), std('#ff5a00', { emissive: '#ff5a00', ei: 1.4 })); coals.position.y = 1.29; g.add(coals);
    for (let i = 0; i < 5; i++) { const bar = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.04, 0.05), std('#adb5bd')); bar.position.set(0, 1.33, -0.4 + i * 0.2); g.add(bar); }
    for (const s of [-0.25, 0.25]) { const sa = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.9, 4, 8), std('#c0583a')); sa.rotation.z = Math.PI / 2; sa.position.set(0, 1.45, s); g.add(sa); }
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.85, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), std('#e53935')); lid.scale.set(1, 0.5, 0.65); lid.position.set(0, 1.3, -0.55); lid.rotation.x = -1.2; g.add(lid);
    m.fx.smoke(P(m, x, z, 0.5), '#adb5bd', 10, 1.2); m.fx.ring(P(m, x, z), '#ff8c42', 0.4, 2.5, 0.4); m.sound('cast', x, z);
    m.zone({ src: c, team: c.team, x, z, r: 8, t: dur, every: 0.6, visual: g,
      update: (zn, dt) => { if (Math.random() < dt * 6) m.fx.flames(P(m, x, z, 1.35), 1, 0.5); if (Math.random() < dt * 3) m.fx.smoke(P(m, x, z, 1.8), '#ced4da', 1, 0.4); },
      onTick: () => {
        const t = m.enemiesIn(x, z, 8, c.team).filter(e => m.visibleTo(e, c.team)).sort(byHeroThenNear({ x, z }))[0];
        if (!t) return;
        m.homing({ src: { x, z, team: c.team }, tgt: t, speed: 24, color: '#c0583a', size: 0.32, shape: 'laser', y0: 1.5,
          onHit: () => { if (t.alive) { m.damage(c, t, D(c, ab, r), ab.dtype); m.fx.flames(P(m, t.x, t.z, 1), 4, 0.5); m.fx.impact(P(m, t.x, t.z, 1.1), '#ff8c42', 0.9); } } });
        m.sound('shoot', x, z, 0.5); m.fx.flash(P(m, x, z, 1.5), '#ff8c42', 0.8, 0.12);
      } });
  },
  // pigeon: a flock of pigeon friends dive at enemies
  flock(m, c, ab, r) {
    const n = ab.count || 6, list = foes(m, c, c.x, c.z, ab.radius).filter(e => m.visibleTo(e, c.team)).sort(byHeroThenNear(c));
    m.fx.burst(P(m, c.x, c.z, 1.2), '#dfe7ef', 30, 6, 0.25, 6); m.sound('cast', c.x, c.z); m.sound('swing', c.x, c.z);
    c.spinT = 0.3; c.spinMax = 0.3;
    if (!list.length) return;
    for (let i = 0; i < n; i++) m.after(i * 0.07, () => {
      const t = list[i % list.length]; if (!t.alive || !c.alive) return;
      const a = Math.random() * 6.28;
      m.homing({ src: { x: c.x + Math.cos(a) * 1.5, z: c.z + Math.sin(a) * 1.5, team: c.team }, tgt: t, speed: 17 + Math.random() * 6, color: '#dfe7ef', size: 0.2, mesh: birdMesh(), y0: 2.5 + Math.random() * 2,
        onHit: () => { if (t.alive) { m.damage(c, t, D(c, ab, r), ab.dtype); m.slow(t, 0.2, 1.2); m.fx.burst(P(m, t.x, t.z, 1.2), '#dfe7ef', 10, 4); m.sound('hit', t.x, t.z, 0.5); } } });
    });
  },
  // banana: a healing smoothie fountain
  fountain(m, c, ab, r, x, z) {
    const R = ab.radius, dur = ab.dur || 4;
    const vis = zoneDisc(m, x, z, R, '#7bd389', 0.22);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 0.6, 16), std('#f1c27d')); base.position.y = 0.3; vis.add(base);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.5, 0.4, 16), std('#ffe14d')); bowl.position.y = 1.4; vis.add(bowl);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.9, 8), std('#f1c27d')); pole.position.y = 0.95; vis.add(pole);
    const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.3, 1.4, 10), basic('#ff9ebb', { opacity: 0.75 })); jet.position.y = 2.2; vis.add(jet);
    m.fx.burst(P(m, x, z, 1), '#7bd389', 20, 5); m.sound('heal', x, z);
    m.zone({ src: c, team: c.team, x, z, r: R, t: dur, every: 0.5, visual: vis,
      update: (zn, dt) => { jet.scale.y = 0.8 + Math.sin(m.time * 12) * 0.2; if (Math.random() < dt * 14) m.fx.emit({ p: P(m, x + (Math.random() - 0.5) * 0.4, z + (Math.random() - 0.5) * 0.4, 2.8), v: new THREE.Vector3((Math.random() - 0.5) * 4, 4 + Math.random() * 2, (Math.random() - 0.5) * 4), life: 0.8, size: 0.2, color: Math.random() < 0.5 ? '#ff9ebb' : '#ffe14d', g: -9, drag: 0 }); },
      onTick: us => {
        for (const u of us) {
          if (u.team === c.team && u.hero) m.heal(c, u, ab.heal[r - 1] + c.st.ap * ab.ap);
          else if (u.team !== c.team && u.kind !== 'tower' && u.kind !== 'core' && u.targetable) m.slow(u, 0.25, 0.6);
        }
      } });
  },
  // magician: lightning that jumps from enemy to enemy
  chain(m, c, ab, r, x, z, t) {
    if (!t) return;
    const color = col(c, ab), hit = new Set();
    let from = P(m, c.x, c.z, 1.9), cur = t, k = 0;
    const jump = () => {
      if (!cur || !cur.alive) return;
      hit.add(cur.id);
      const to = P(m, cur.x, cur.z, 1.1 * (cur.st.size || 1));
      m.fx.lightning(from, to, color, 0.3); m.fx.lightning(from, to, '#ffffff', 0.2); m.fx.flash(to, color, 1.4, 0.2); m.fx.sparks(to, '#ffd23f', 10); m.fx.light(to, color, 25, 0.3, 10);
      m.damage(c, cur, D(c, ab, r) * Math.pow(0.85, k), ab.dtype);
      m.sound('laser', cur.x, cur.z, 0.6);
      if (k >= (ab.bounces || 4)) return;
      const next = foes(m, c, cur.x, cur.z, ab.bounceR || 6).filter(e => !hit.has(e.id) && m.visibleTo(e, c.team)).sort(byHeroThenNear(cur))[0];
      from = to; cur = next; k++;
      if (cur) m.after(0.1, jump);
    };
    c.atkAnim = 0;
    jump();
  },
  // robot: a giant magnet that yanks enemies in
  magnet(m, c, ab, r) {
    const color = col(c, ab), R = ab.radius;
    m.fx.ring(P(m, c.x, c.z), color, R, 0.6, 0.35, 0.9); m.fx.ring(P(m, c.x, c.z, 0.5), '#ffffff', R * 0.8, 0.5, 0.3, 0.8);
    const mag = new THREE.Group(); const arc = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.22, 8, 18, Math.PI), std('#e53935', { emissive: '#e53935', ei: 0.4 })); mag.add(arc);
    for (const s of [-1, 1]) { const tip = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.4, 0.44), std('#dee2e6')); tip.position.set(0.7 * s, -0.15, 0); mag.add(tip); }
    m.fx.temp(mag, 0.8, k => { mag.position.set(c.x, m.groundY(c.x, c.z) + 3 + k * 0.6, c.z); mag.rotation.y = k * 6; mag.rotation.z = Math.PI; });
    m.fx.light(P(m, c.x, c.z), color, 35, 0.4, R * 2.5);
    m.sound('laser', c.x, c.z); m.sound('alarm', c.x, c.z, 0.4); m.shake(c.x, c.z, 0.35);
    for (const e of foes(m, c, c.x, c.z, R)) {
      m.fx.lightning(P(m, c.x, c.z, 3), P(m, e.x, e.z, 1.1), color, 0.35);
      m.damage(c, e, D(c, ab, r), ab.dtype);
      if ((e.kind === 'monster' && e.mdef.epic) || !e.alive || e.static) continue;
      const l = Math.max(0.1, e.dist(c)), want = c.radius + e.radius + 0.6;
      if (l > want) {
        e.addBuff({ id: 'pulled', t: (l - want) / 24 + 0.05, disarm: true, silence: true });
        m.dash(e, c.x + (e.x - c.x) / l * want, c.z + (e.z - c.z) / l * want, 24, { onArrive: u => { m.stun(u, ab.stun); m.fx.sparks(P(m, u.x, u.z, 1.1), color, 8); } });
      } else m.stun(e, ab.stun);
    }
  }
};

// ================= ultimates (T) =================
export const CAST = {
  // ---------------- THE KNIGHT ----------------
  'knight:4'(m, c, ab, r) {
    c.addBuff({ id: 'royal', t: 10, size: 1.55, mods: { hp: ab.bonusHp[r - 1], armor: ab.resist[r - 1], mr: ab.resist[r - 1] } });
    const p = P(m, c.x, c.z);
    m.fx.shockwave(p, '#ffd23f', ab.radius); m.fx.confetti(P(m, c.x, c.z, 2), 60, 4); m.fx.column(p, '#ffd23f', 2.4, 9, 0.9); m.fx.ring(p, '#ffffff', 0.5, ab.radius + 2, 0.7, 0.8);
    m.sound('boom', c.x, c.z, 1.2);
    hitAll(m, c, c.x, c.z, ab.radius, e => { m.damage(c, e, D(c, ab, r) + c.st.maxHp * 0.05, 'magic'); m.stun(e, 0.75, 'knockup'); });
  },
  // ---------------- THE NINJA ----------------
  'ninja:4'(m, c, ab, r) {
    for (let i = 0; i < 3; i++) { const a = c.facing + (i - 1) * 1.2; m.after(i * 0.08, () => { if (c.alive) spawnClone(m, c, c.x + Math.sin(a) * 1.6, c.z + Math.cos(a) * 1.6, ab.dur[r - 1], ab.pct[r - 1]); }); }
    c.addBuff({ id: 'clonesms', t: 3, mods: { msPct: 0.25 } });
    m.fx.smoke(P(m, c.x, c.z, 0.5), '#3c096c', 30, 4); m.fx.ring(P(m, c.x, c.z), '#c77dff', 0.5, 5, 0.5);
    m.sound('poof', c.x, c.z, 1.2);
  },
  // ---------------- THE DINO ----------------
  'dino:4'(m, c, ab, r) {
    c.addBuff({ id: 'giant', t: 10, giant: true, size: 1.6, mods: { hp: ab.bonusHp[r - 1], adPct: ab.adPct[r - 1] } });
    m.fx.shockwave(P(m, c.x, c.z), '#7bd389', 6); m.sound('roar', c.x, c.z, 1.3);
  },
  // ---------------- THE SHARK ----------------
  'shark:4'(m, c, ab, r) {
    c.addBuff({ id: 'frenzy', t: 7, frenzy: true, mods: { as: ab.as[r - 1], lifesteal: 0.2 } });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.12, 6, 40), basic('#4d9de0', { opacity: 0.7 }));
    ring.rotation.x = Math.PI / 2;
    follow(m, c, ring, 7, 0.4, (k, dt) => { ring.rotation.z += dt * 6; ring.scale.setScalar(c.st.size || 1); });
    m.fx.burst(P(m, c.x, c.z, 1), '#9fd8ff', 30, 7); m.sound('roar', c.x, c.z);
  },
  // ---------------- THE ASTRONAUT ----------------
  'astro:4'(m, c, ab, r, x, z) {
    const g = zoneDisc(m, x, z, ab.radius, '#240046', 0.45);
    const core = new THREE.Mesh(new THREE.SphereGeometry(1.3, 24, 16), new THREE.MeshBasicMaterial({ color: '#000000' })); core.position.y = 1.5; g.add(core);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(2, 0.25, 8, 48), basic('#c77dff', { opacity: 0.8, add: true })); halo.position.y = 1.5; halo.rotation.x = Math.PI / 2.4; g.add(halo);
    const swirl = new THREE.Mesh(new THREE.CircleGeometry(ab.radius, 48), basic('#ffffff', { opacity: 0.35 }));
    swirl.material.map = canvasTex(256, 256, (cx, w) => { cx.translate(w / 2, w / 2); for (let i = 0; i < 5; i++) { cx.rotate(Math.PI * 2 / 5); cx.strokeStyle = i % 2 ? '#c77dff' : '#7df9ff'; cx.lineWidth = 10; cx.beginPath(); for (let t = 0; t < 1; t += 0.02) { const rr = t * w / 2; cx.lineTo(Math.cos(t * 6) * rr, Math.sin(t * 6) * rr); } cx.stroke(); } });
    swirl.rotation.x = -Math.PI / 2; swirl.position.y = 0.05; g.add(swirl);
    m.sound('boom', x, z, 0.7);
    m.zone({ src: c, team: c.team, x, z, r: ab.radius, t: 3, every: 0.25, visual: g,
      update: (zn, dt) => {
        swirl.rotation.z -= dt * 3; halo.rotation.z += dt * 2; core.scale.setScalar(1 + Math.sin(m.time * 8) * 0.08);
        for (const u of m.enemiesIn(zn.x, zn.z, zn.r, c.team)) m.pull(u, zn.x, zn.z, 3.6, dt);
        if (Math.random() < dt * 4) { const a = Math.random() * 6.28; m.fx.lightning(P(m, zn.x, zn.z, 1.5), P(m, zn.x + Math.cos(a) * zn.r * 0.8, zn.z + Math.sin(a) * zn.r * 0.8, 0.4), '#c77dff', 0.18); }
        if (Math.random() < dt * 30) { const a = Math.random() * 6.28, d = zn.r; m.fx.emit({ p: P(m, zn.x + Math.cos(a) * d, zn.z + Math.sin(a) * d, 0.5), v: new THREE.Vector3(-Math.cos(a) * d * 1.2, 0.5, -Math.sin(a) * d * 1.2), life: 0.8, size: 0.15, color: '#c77dff', g: 0, drag: 0 }, true); }
      },
      onTick: (us) => { for (const u of us) if (u.team !== c.team && u.kind !== 'tower' && u.kind !== 'core' && u.targetable) m.damage(c, u, ab.tick[r - 1] + c.st.ap * 0.12, 'magic'); },
      onEnd: (zn) => { m.fx.shockwave(P(m, zn.x, zn.z), '#c77dff', zn.r); m.fx.flash(P(m, zn.x, zn.z, 1.5), '#ffffff', 4, 0.35); m.fx.rays(P(m, zn.x, zn.z), '#c77dff', 14, 9, 0.6); m.shake(zn.x, zn.z, 0.7); m.sound('boom', zn.x, zn.z); hitAll(m, c, zn.x, zn.z, zn.r, e => m.damage(c, e, D(c, ab, r), 'magic')); } });
  },
  // ---------------- THE HOT DOG ----------------
  'hotdog:4'(m, c, ab, r, x, z) {
    m.fx.ring(P(m, x, z), '#e53935', ab.radius, ab.radius, 2.2, 0.6);
    m.sound('alarm', x, z, 0.6);
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * 6.28, d = Math.sqrt(Math.random()) * (ab.radius - 1), px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      m.after(0.15 + i * 0.25, () => {
        const dog = new THREE.Group();
        const sausage = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.6, 6, 12), std('#c0583a')); sausage.rotation.z = Math.PI / 2; dog.add(sausage);
        for (const s of [-1, 1]) { const bun = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.4, 6, 12), std('#f1c27d')); bun.rotation.z = Math.PI / 2; bun.position.set(0, -0.2, s * 0.35); dog.add(bun); }
        const warn = new THREE.Mesh(new THREE.CircleGeometry(2, 24), basic('#ff4d6d', { opacity: 0.35 })); warn.rotation.x = -Math.PI / 2; warn.position.copy(P(m, px, pz, 0.12));
        m.fx.temp(warn, 0.5, k => { warn.material.opacity = 0.2 + 0.3 * k; });
        const y0 = m.groundY(px, pz);
        m.fx.temp(dog, 0.5, k => { dog.position.set(px, y0 + 14 * (1 - k) + 0.5, pz); dog.rotation.y = k * 3; });
        m.after(0.5, () => { m.fx.shockwave(P(m, px, pz), '#ffd23f', 2.2); m.fx.burst(P(m, px, pz, 0.5), '#e53935', 16, 6); m.fx.decal(P(m, px, pz), '#ffd23f', 1.6, 3, 0.6); m.shake(px, pz, 0.25); m.sound('boom', px, pz, 0.5);
          hitAll(m, c, px, pz, 2.1, e => { m.damage(c, e, D(c, ab, r), 'phys'); m.slow(e, 0.3, 1); }); });
      });
    }
  },
  // ---------------- THE PIGEON ----------------
  'pigeon:4'(m, c, ab, r, x, z) {
    c.addBuff({ id: 'skydive', t: 1.05, airborne: true, untargetable: true });
    const warn = zoneDisc(m, x, z, ab.radius, '#ff4d6d', 0.25);
    m.fx.temp(warn, 1.05, k => { warn.scale.setScalar(0.3 + 0.7 * k); });
    m.fx.burst(P(m, c.x, c.z, 1), '#dfe7ef', 26, 6); m.sound('dash', c.x, c.z);
    m.after(1.0, () => {
      if (!c.alive) return;
      m.blink(c, x, z);
      const p = P(m, c.x, c.z); m.fx.shockwave(p, '#dfe7ef', ab.radius); m.fx.burst(P(m, c.x, c.z, 0.5), '#9aa5b1', 40, 9); m.fx.burst(P(m, c.x, c.z, 1), '#ffffff', 26, 7, 0.3, 6, 1.2); m.fx.decal(p, '#4a4458', ab.radius, 3, 0.55); m.shake(c.x, c.z, 0.8); m.sound('boom', c.x, c.z);
      hitAll(m, c, c.x, c.z, ab.radius, e => { m.damage(c, e, D(c, ab, r), 'phys'); m.slow(e, 0.5, 2); });
    });
  },
  // ---------------- THE BANANA ----------------
  'banana:4'(m, c, ab, r, x, z) {
    const p = P(m, x, z);
    for (let i = 0; i < 14; i++) { const a = Math.random() * 6.28, d = Math.random() * ab.radius; m.after(i * 0.03, () => m.fx.burst(P(m, x + Math.cos(a) * d, z + Math.sin(a) * d, 0.5), '#ffe14d', 6, 4)); }
    m.fx.shockwave(p, '#ffe14d', ab.radius); m.fx.confetti(P(m, x, z, 1), 50, ab.radius); m.shake(x, z, 0.5); m.sound('slip', x, z); m.sound('boom', x, z, 0.6);
    hitAll(m, c, x, z, ab.radius, e => { m.damage(c, e, D(c, ab, r), 'magic'); m.stun(e, ab.stun[r - 1]); e.spinT = 0.8; e.spinMax = 0.8; });
    for (const a of m.alliesIn(x, z, ab.radius, c.team)) { m.shield(c, a, ab.shield[r - 1], 3); a.addBuff({ id: 'split', t: 3, mods: { msPct: 0.3 } }); bubble(m, a, '#ffe14d', 3); }
  },
  // ---------------- THE MAGICIAN ----------------
  'wizard:4'(m, c, ab, r, x, z) {
    const g = new THREE.Group(); g.position.copy(P(m, x, z, 0.15));
    const circ = new THREE.Mesh(new THREE.CircleGeometry(ab.radius, 64), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false, map: canvasTex(512, 512, (cx, w) => {
      cx.translate(w / 2, w / 2); cx.strokeStyle = '#ffd23f'; cx.lineWidth = 8; cx.beginPath(); cx.arc(0, 0, w / 2 - 6, 0, 7); cx.stroke(); cx.lineWidth = 4; cx.beginPath(); cx.arc(0, 0, w / 2 - 40, 0, 7); cx.stroke();
      cx.strokeStyle = '#c77dff'; cx.lineWidth = 6; cx.beginPath(); for (let i = 0; i <= 5; i++) { const a = i * 4 * Math.PI / 5 - Math.PI / 2; cx.lineTo(Math.cos(a) * (w / 2 - 40), Math.sin(a) * (w / 2 - 40)); } cx.stroke();
      cx.fillStyle = '#ffd23f'; for (let i = 0; i < 12; i++) { cx.save(); cx.rotate(i * Math.PI / 6); cx.translate(0, -w / 2 + 24); cx.beginPath(); for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, rr = k % 2 ? 4 : 13; cx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } cx.closePath(); cx.fill(); cx.restore(); }
    }) }));
    circ.rotation.x = -Math.PI / 2; g.add(circ);
    m.sound('magic', x, z, 1.2);
    m.fx.temp(g, 1.0, (k, dt) => { circ.rotation.z += dt * 2; circ.material.opacity = 0.4 + 0.6 * k; });
    m.after(1.0, () => {
      m.fx.shockwave(P(m, x, z), '#c77dff', ab.radius); m.fx.confetti(P(m, x, z, 1), 110, ab.radius * 1.4); m.fx.column(P(m, x, z), '#ffd23f', ab.radius * 0.6, 10, 0.7); m.fx.rays(P(m, x, z), '#ffd23f', 14, 10, 0.7); m.shake(x, z, 0.8);
      ['#ff4d6d', '#ffd23f', '#7df9ff', '#c77dff', '#7bd389'].forEach((col, i) => m.after(0.08 * i, () => { const a = Math.random() * 6.28, d = Math.random() * ab.radius * 0.7; const fp = P(m, x + Math.cos(a) * d, z + Math.sin(a) * d, 4 + Math.random() * 3); m.fx.burst(fp, col, 30, 9, 0.22, 2, 0.9); m.fx.flash(fp, col, 2.2, 0.3); }));
      m.sound('boom', x, z, 1.2);
      hitAll(m, c, x, z, ab.radius, e => { m.damage(c, e, D(c, ab, r), 'magic'); m.stun(e, 1); });
    });
  },
  // ---------------- THE ROBOT ----------------
  'robot:4'(m, c, ab, r) {
    for (let i = 0; i < 3; i++) m.after(i * 0.12, () => m.fx.ring(P(m, c.x, c.z), '#00e5ff', 1, ab.radius, 0.6, 0.8));
    m.sound('laser', c.x, c.z); m.sound('shield', c.x, c.z);
    for (const a of m.alliesIn(c.x, c.z, ab.radius, c.team)) {
      m.shield(c, a, ab.shield[r - 1] + c.st.ap * ab.ap, 5);
      a.addBuff({ id: 'overdrive', t: 5, mods: { msPct: 0.3, as: 0.3 }, onTick: (u, dt) => { if (Math.random() < dt * 8) m.fx.sparks(P(m, u.x, u.z, 1.2), '#00e5ff', 2); } });
      if (a !== c) m.fx.lightning(P(m, c.x, c.z, 1.5), P(m, a.x, a.z, 1.3), '#7df9ff', 0.35);
      bubble(m, a, '#00e5ff', 5, 1.7);
    }
  }
};

// Extra effects on basic attacks: empowered attacks, buffs from jungle camps, ultimates.
export function basicHitExtras(m, u, t) {
  const out = { mult: 1 };
  if (!u.hero) return out;
  const afters = [];
  if (u.empower && m.time < u.empower.until) {
    const k = u.empower.kind; u.empower = null;
    if (k === 'ninja') { out.mult *= 1.4; m.fx.sparks(P(m, t.x, t.z, 1.1), '#c77dff', 14); }
    if (k === 'hotdog') out.crit = true;
    if (k === 'shark') afters.push(() => { if (t.alive) { m.stun(t, 0.6, 'knockup'); m.fx.burst(P(m, t.x, t.z, 0.4), '#9fd8ff', 16, 5); } });
  }
  if (u.flag('hotsauce')) afters.push(() => { if (t.alive && !t.static) { t.addBuff({ id: 'burn', t: 3, onTick: (h, dt) => { m.damage(u, h, (8 + 2 * u.level) * dt, 'true'); if (Math.random() < dt * 6) m.fx.flames(P(m, h.x, h.z, 0.5), 1, 0.5); } }); m.slow(t, 0.15, 1); } });
  if (u.flag('giant')) afters.push(() => { for (const e of m.enemiesIn(t.x, t.z, 2.6, u.team)) if (e !== t) m.damage(u, e, u.st.ad * 0.5, 'phys'); m.fx.ring(P(m, t.x, t.z), '#7bd389', 0.5, 2.6, 0.3); });
  if (u.flag('frenzy')) afters.push(() => { if (t.alive) m.damage(u, t, Math.min(t.kind === 'hero' ? 9999 : 250, 0.05 * (t.st.maxHp - t.hp)), 'phys'); });
  if (u.flag('coo')) afters.push(() => {
    const o = m.enemiesIn(t.x, t.z, 5, u.team).filter(e => e !== t && m.visibleTo(e, u.team))[0];
    if (o) m.homing({ src: { x: t.x, z: t.z, team: u.team }, tgt: o, speed: 26, color: '#dfe7ef', size: 0.22, y0: 1.2, feather: true, onHit: () => m.damage(u, o, u.st.ad * 0.5, 'phys', {}) });
  });
  if (afters.length) out.after = () => afters.forEach(f => f());
  return out;
}
