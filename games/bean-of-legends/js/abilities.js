// All hero abilities (Q, W, E, R for every hero) and the special effects of basic attacks.
// CAST['hero:slot'](match, caster, abilityData, rank, x, z, target)
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

export const CAST = {
  // ---------------- THE KNIGHT ----------------
  'knight:0'(m, c, ab, r, x, z) {
    m.sound('dash', c.x, c.z);
    m.dash(c, x, z, 20, { arc: 2.6, onArrive: u => {
      const p = P(m, u.x, u.z); m.fx.shockwave(p, '#cfd6de', ab.radius); m.fx.decal(p, '#2b2420', ab.radius * 0.9, 3, 0.5); m.fx.slash(P(m, u.x, u.z, 1.2), u.facing, '#ffffff', 2.8, 2.8, 1.2, 0.25); m.shake(u.x, u.z, 0.5); m.sound('boom', u.x, u.z, 0.8);
      hitAll(m, u, u.x, u.z, ab.radius, e => { m.damage(u, e, D(u, ab, r), 'phys'); m.slow(e, 0.3, 1.5); });
    } });
  },
  'knight:1'(m, c, ab, r) {
    c.addBuff({ id: 'shieldup', t: 2.5, dr: ab.dr[r - 1] });
    m.shield(c, c, ab.shield[r - 1] + c.st.maxHp * 0.08, 2.5);
    bubble(m, c, '#9fd8ff', 2.5, 1.8); m.fx.flash(P(m, c.x, c.z, 1.3), '#9fd8ff', 2, 0.25); m.fx.sparks(P(m, c.x, c.z, 1.5), '#ffffff', 16); m.sound('shield', c.x, c.z);
  },
  'knight:2'(m, c, ab, r, x, z) {
    const [dx, dz] = dir(c, x, z);
    m.sound('dash', c.x, c.z);
    c.addBuff({ id: 'charging', t: 0.4, ghost: true });
    m.dash(c, c.x + dx * ab.range, c.z + dz * ab.range, 26, { onStep: (u, d) => {
      m.fx.trail(P(m, u.x, u.z, 0.5), '#ffffff', 0.35);
      for (const e of m.enemiesIn(u.x, u.z, ab.width, u.team)) if (!d.hit.has(e.id)) {
        d.hit.add(e.id); m.damage(u, e, D(u, ab, r), 'phys');
        m.knock(e, u.x - dx, u.z - dz, 3, 0.3); m.after(0.3, () => m.stun(e, 0.45));
        m.fx.impact(P(m, e.x, e.z, 1.1), '#ffd23f', 1.4, true); m.shake(e.x, e.z, 0.3); m.sound('hit', e.x, e.z);
      }
    } });
  },
  'knight:3'(m, c, ab, r) {
    c.addBuff({ id: 'royal', t: 10, size: 1.55, mods: { hp: ab.bonusHp[r - 1], armor: ab.resist[r - 1], mr: ab.resist[r - 1] } });
    const p = P(m, c.x, c.z);
    m.fx.shockwave(p, '#ffd23f', ab.radius); m.fx.confetti(P(m, c.x, c.z, 2), 60, 4); m.fx.column(p, '#ffd23f', 2.4, 9, 0.9); m.fx.ring(p, '#ffffff', 0.5, ab.radius + 2, 0.7, 0.8);
    m.sound('boom', c.x, c.z, 1.2);
    hitAll(m, c, c.x, c.z, ab.radius, e => { m.damage(c, e, D(c, ab, r) + c.st.maxHp * 0.05, 'magic'); m.stun(e, 0.75, 'knockup'); });
  },
  // ---------------- THE NINJA ----------------
  'ninja:0'(m, c, ab, r, x, z) {
    const [dx, dz] = dir(c, x, z);
    m.skillshot({ src: c, dx, dz, speed: ab.speed, range: ab.range, width: ab.width, color: '#c77dff', mesh: spinMesh('#c77dff', 'star'), spin: 22, size: 0.3,
      onHit: e => { m.damage(c, e, D(c, ab, r), 'phys'); m.fx.sparks(P(m, e.x, e.z, 1.2), '#c77dff', 12); m.sound('hit', e.x, e.z); } });
    m.sound('swing', c.x, c.z);
  },
  'ninja:1'(m, c, ab, r, x, z) {
    const vis = zoneDisc(m, x, z, ab.radius, '#6c757d', 0.25);
    m.fx.smoke(P(m, x, z, 0.3), '#adb5bd', 26, ab.radius * 1.4); m.sound('poof', x, z);
    m.zone({ src: c, team: c.team, x, z, r: ab.radius, t: 4, every: 0.2, visual: vis,
      update: (zn, dt) => { if (Math.random() < dt * 8) m.fx.smoke(P(m, zn.x + (Math.random() - 0.5) * 5, zn.z + (Math.random() - 0.5) * 5, 0.2), '#ced4da', 2, 1); },
      onTick: (us) => { for (const u of us) { if (u === c) u.addBuff({ id: 'smoke', t: 0.3, stealth: true, mods: { msPct: 0.2 } }); else if (u.team !== c.team && u.kind !== 'tower' && u.kind !== 'core') m.slow(u, 0.25, 0.3); } } });
  },
  'ninja:2'(m, c, ab, r, x, z) {
    m.sound('dash', c.x, c.z); m.fx.smoke(P(m, c.x, c.z, 0.5), '#5a189a', 8, 1);
    m.dash(c, x, z, 32, { onStep: (u, d) => {
      m.fx.trail(P(m, u.x, u.z, 0.8), '#7b2cbf', 0.3);
      for (const e of m.enemiesIn(u.x, u.z, 1.5, u.team)) if (!d.hit.has(e.id)) { d.hit.add(e.id); m.damage(u, e, D(u, ab, r), 'phys'); m.fx.slash(P(m, e.x, e.z, 1.1), u.facing + 1.2, '#c77dff', 1.8, 2.4, 0.9, 0.22); m.fx.impact(P(m, e.x, e.z, 1.1), '#c77dff', 1); }
    }, onArrive: u => { u.empower = { kind: 'ninja', until: m.time + 3 }; } });
  },
  'ninja:3'(m, c, ab, r) {
    for (let i = 0; i < 3; i++) { const a = c.facing + (i - 1) * 1.2; m.after(i * 0.08, () => { if (c.alive) spawnClone(m, c, c.x + Math.sin(a) * 1.6, c.z + Math.cos(a) * 1.6, ab.dur[r - 1], ab.pct[r - 1]); }); }
    c.addBuff({ id: 'clonesms', t: 3, mods: { msPct: 0.25 } });
    m.fx.smoke(P(m, c.x, c.z, 0.5), '#3c096c', 30, 4); m.fx.ring(P(m, c.x, c.z), '#c77dff', 0.5, 5, 0.5);
    m.sound('poof', c.x, c.z, 1.2);
  },
  // ---------------- THE DINO ----------------
  'dino:0'(m, c, ab, r) {
    c.spinT = 0.4; c.spinMax = 0.4;
    m.fx.ring(P(m, c.x, c.z), '#7bd389', 0.5, ab.radius, 0.35); m.fx.slash(P(m, c.x, c.z, 0.7), c.facing, '#9be38f', ab.radius, Math.PI * 1.9, 0, 0.3); m.fx.dust(P(m, c.x, c.z), 14); m.sound('swing', c.x, c.z, 1.2);
    let heal = 0;
    hitAll(m, c, c.x, c.z, ab.radius, e => { m.damage(c, e, D(c, ab, r), 'phys'); heal += e.hero ? 0.04 : 0.01; });
    if (heal > 0) m.heal(c, c, c.st.maxHp * Math.min(0.12, heal));
  },
  'dino:1'(m, c, ab, r) {
    for (let i = 0; i < 4; i++) m.after(i * 0.1, () => { m.fx.ring(P(m, c.x, c.z, 0.2 + i * 0.4), i % 2 ? '#ffffff' : '#ffd23f', 1, ab.radius, 0.5, 0.75); });
    m.fx.flash(P(m, c.x + Math.sin(c.facing), c.z + Math.cos(c.facing), 1.6), '#ffd23f', 2, 0.3); m.shake(c.x, c.z, 0.35);
    m.sound('roar', c.x, c.z);
    hitAll(m, c, c.x, c.z, ab.radius, e => { m.slow(e, 0.4, 2); e.addBuff({ id: 'roared', t: 3, weaken: 0.2 }); });
  },
  'dino:2'(m, c, ab, r, x, z) {
    m.dash(c, x, z, 18, { arc: 3.4, onArrive: u => {
      const p = P(m, u.x, u.z); m.fx.shockwave(p, '#a1887f', ab.radius); m.fx.decal(p, '#3a2a1a', ab.radius, 3.5, 0.6); m.fx.smoke(p, '#d8cfc0', 14, 3); m.shake(u.x, u.z, 0.6); m.sound('boom', u.x, u.z);
      hitAll(m, u, u.x, u.z, ab.radius, e => { m.damage(u, e, D(u, ab, r), 'phys'); m.stun(e, 0.8); });
    } });
  },
  'dino:3'(m, c, ab, r) {
    c.addBuff({ id: 'giant', t: 10, giant: true, size: 1.6, mods: { hp: ab.bonusHp[r - 1], adPct: ab.adPct[r - 1] } });
    m.fx.shockwave(P(m, c.x, c.z), '#7bd389', 6); m.sound('roar', c.x, c.z, 1.3);
  },
  // ---------------- THE SHARK ----------------
  'shark:0'(m, c, ab, r, x, z, t) {
    m.sound('dash', c.x, c.z);
    const tx = t.x - Math.sin(Math.atan2(t.x - c.x, t.z - c.z)) * (t.radius + 0.6), tz = t.z - Math.cos(Math.atan2(t.x - c.x, t.z - c.z)) * (t.radius + 0.6);
    m.dash(c, tx, tz, 28, { onStep: u => m.fx.trail(P(m, u.x, u.z, 0.6), '#9fd8ff', 0.3), onArrive: u => {
      if (!t.alive) return;
      let dmg = D(u, ab, r); if (t.hp / t.st.maxHp < 0.4) dmg *= 2;
      const dealt = m.damage(u, t, dmg, 'phys');
      m.heal(u, u, dealt * 0.3, true);
      m.fx.burst(P(m, t.x, t.z, 1.2), '#ffffff', 16, 5); m.fx.burst(P(m, t.x, t.z, 1), '#4d9de0', 18, 6); const bp = P(m, t.x, t.z, 1.1); m.fx.slash(bp, u.facing + Math.PI / 2, '#ffffff', 1.4, 2.6, 1.4, 0.22); m.fx.slash(bp, u.facing + Math.PI / 2, '#9fd8ff', 1.4, 2.6, -1.4, 0.22, true); m.fx.decal(P(m, t.x, t.z), '#4d9de0', 1.6, 2, 0.5); m.shake(t.x, t.z, 0.3);
      m.sound('crit', t.x, t.z);
    } });
  },
  'shark:1'(m, c, ab, r, x, z) {
    const [dx, dz] = dir(c, x, z);
    const wave = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, ab.width, 16, 1, true, 0, Math.PI), std('#4d9de0', { opacity: 0.7, emissive: '#2ec4b6', ei: 0.4 }));
    wave.rotation.z = Math.PI / 2; const g = new THREE.Group(); g.add(wave);
    m.skillshot({ src: c, dx, dz, speed: ab.speed, range: ab.range, width: ab.width, pierce: true, color: '#9fd8ff', mesh: g, h: 0.2, size: 0.6,
      onHit: e => { m.damage(c, e, D(c, ab, r), 'magic'); m.slow(e, 0.35, 2); m.fx.burst(P(m, e.x, e.z, 0.6), '#9fd8ff', 10, 4); } });
    m.sound('splat', c.x, c.z);
  },
  'shark:2'(m, c, ab, r) {
    c.addBuff({ id: 'finrush', t: 3, ghost: true, mods: { msPct: ab.ms[r - 1] }, onTick: (u, dt) => { if (Math.random() < dt * 20) m.fx.trail(P(m, u.x, u.z, 0.2), '#9fd8ff', 0.3); } });
    c.empower = { kind: 'shark', until: m.time + 3 };
    m.sound('dash', c.x, c.z);
  },
  'shark:3'(m, c, ab, r) {
    c.addBuff({ id: 'frenzy', t: 7, frenzy: true, mods: { as: ab.as[r - 1], lifesteal: 0.2 } });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.12, 6, 40), basic('#4d9de0', { opacity: 0.7 }));
    ring.rotation.x = Math.PI / 2;
    follow(m, c, ring, 7, 0.4, (k, dt) => { ring.rotation.z += dt * 6; ring.scale.setScalar(c.st.size || 1); });
    m.fx.burst(P(m, c.x, c.z, 1), '#9fd8ff', 30, 7); m.sound('roar', c.x, c.z);
  },
  // ---------------- THE ASTRONAUT ----------------
  'astro:0'(m, c, ab, r, x, z) {
    const [dx, dz] = dir(c, x, z);
    m.skillshot({ src: c, dx, dz, speed: ab.speed, range: ab.range, width: ab.width, color: '#7df9ff', mesh: spinMesh('#7df9ff', 'laser'), size: 0.35,
      onHit: e => { m.damage(c, e, D(c, ab, r), 'magic'); m.fx.sparks(P(m, e.x, e.z, 1.2), '#7df9ff', 14); m.sound('magic', e.x, e.z); } });
    m.sound('laser', c.x, c.z);
  },
  'astro:1'(m, c, ab, r, x, z) {
    const vis = zoneDisc(m, x, z, ab.radius, '#8338ec', 0.3);
    const rings = new THREE.Group(); vis.add(rings);
    for (let i = 0; i < 3; i++) { const rr = new THREE.Mesh(new THREE.TorusGeometry(1 + i * 1.1, 0.06, 6, 40), basic('#c77dff', { opacity: 0.6 })); rr.rotation.x = Math.PI / 2; rr.position.y = 0.3 + i * 0.2; rings.add(rr); }
    m.sound('magic', x, z);
    m.zone({ src: c, team: c.team, x, z, r: ab.radius, t: 3, every: 0.5, visual: vis,
      update: (zn, dt) => { rings.rotation.y += dt * 2; rings.children.forEach((rr, i) => { rr.position.y = 0.3 + ((zn.max - zn.t) * 0.8 + i * 0.4) % 1.6; }); },
      onTick: (us) => { for (const u of us) if (u.team !== c.team && u.kind !== 'tower' && u.kind !== 'core' && u.targetable) { m.slow(u, 0.4, 0.6); m.damage(c, u, D(c, ab, r), 'magic'); } } });
  },
  'astro:2'(m, c, ab, r, x, z) {
    m.fx.burst(P(m, c.x, c.z, 1), '#7df9ff', 24, 5); m.fx.column(P(m, c.x, c.z), '#7df9ff', 1, 4, 0.45); m.fx.flash(P(m, c.x, c.z, 1.2), '#7df9ff', 1.8, 0.25);
    m.blink(c, x, z);
    m.fx.burst(P(m, c.x, c.z, 1), '#ffffff', 24, 5); m.fx.flash(P(m, c.x, c.z, 1.2), '#ffffff', 2, 0.25); m.fx.light(P(m, c.x, c.z), '#7df9ff', 25, 0.35); m.sound('teleport', c.x, c.z);
  },
  'astro:3'(m, c, ab, r, x, z) {
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
  'hotdog:0'(m, c, ab, r, x, z) {
    const [dx, dz] = dir(c, x, z);
    const splash = (px, pz) => { m.fx.burst(P(m, px, pz, 0.6), '#e53935', 28, 7, 0.27); m.fx.decal(P(m, px, pz), '#e53935', ab.radius, 3, 0.7); m.fx.flash(P(m, px, pz, 0.8), '#ff6b6b', 1.6, 0.2); m.sound('splat', px, pz); hitAll(m, c, px, pz, ab.radius, e => m.damage(c, e, D(c, ab, r), 'phys')); };
    let done = false;
    m.skillshot({ src: c, dx, dz, speed: ab.speed, range: ab.range, width: ab.width, color: '#e53935', size: 0.5,
      onHit: e => { if (!done) { done = true; splash(e.x, e.z); } }, onEnd: (px, pz) => { if (!done) { done = true; splash(px, pz); } } });
    m.sound('shoot', c.x, c.z);
  },
  'hotdog:1'(m, c, ab, r, x, z) {
    const vis = zoneDisc(m, x, z, ab.radius, '#ffd23f', 0.55);
    for (let i = 0; i < 8; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.35 + Math.random() * 0.3, 8, 6), std('#ffcc00')); b.scale.y = 0.3; const a = Math.random() * 6.28, d = Math.random() * ab.radius * 0.8; b.position.set(Math.cos(a) * d, 0.05, Math.sin(a) * d); vis.add(b); }
    m.sound('splat', x, z);
    m.zone({ src: c, team: c.team, x, z, r: ab.radius, t: 4, every: 0.5, visual: vis,
      onTick: (us) => { for (const u of us) if (u.team !== c.team && u.kind !== 'tower' && u.kind !== 'core' && u.targetable) { m.slow(u, 0.45, 0.6); m.damage(c, u, D(c, ab, r) * 0.5, 'magic'); } } });
  },
  'hotdog:2'(m, c, ab, r, x, z) {
    c.spinT = 0.35; c.spinMax = 0.35;
    m.dash(c, x, z, 22, { onStep: u => m.fx.flames(P(m, u.x, u.z, 0.1), 1, 0.6), onArrive: u => { u.empower = { kind: 'hotdog', until: m.time + 3 }; } });
    m.sound('dash', c.x, c.z);
  },
  'hotdog:3'(m, c, ab, r, x, z) {
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
  'pigeon:0'(m, c, ab, r, x, z) {
    const base = Math.atan2(x - c.x, z - c.z), mh = multiHit();
    for (let i = 0; i < 5; i++) {
      const a = base + (i - 2) * 0.17;
      m.skillshot({ src: c, dx: Math.sin(a), dz: Math.cos(a), speed: ab.speed, range: ab.range, width: ab.width, color: '#dfe7ef', mesh: spinMesh('#dfe7ef', 'feather'), size: 0.25,
        onHit: e => { m.damage(c, e, D(c, ab, r) * mh(e), 'phys'); m.fx.sparks(P(m, e.x, e.z, 1.1), '#ffffff', 6); } });
    }
    m.sound('swing', c.x, c.z);
  },
  'pigeon:1'(m, c, ab, r) {
    c.addBuff({ id: 'coo', t: 4, coo: true, mods: { as: ab.as[r - 1] } });
    m.fx.burst(P(m, c.x, c.z, 1.2), '#dfe7ef', 18, 4); m.sound('cast', c.x, c.z);
  },
  'pigeon:2'(m, c, ab, r, x, z) {
    const sx = c.x, sz = c.z;
    m.fx.burst(P(m, sx, sz, 1), '#dfe7ef', 20, 5);
    hitAll(m, c, sx, sz, 3, e => m.slow(e, 0.4, 1.5));
    m.dash(c, x, z, 22, { arc: 1.5 });
    m.sound('dash', c.x, c.z);
  },
  'pigeon:3'(m, c, ab, r, x, z) {
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
  'banana:0'(m, c, ab, r, x, z) {
    const mine = m.zones.filter(zn => zn.peelOf === c);
    if (mine.length >= 3) mine[0].dead = true;
    const peel = new THREE.Group();
    for (let i = 0; i < 3; i++) { const p = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 6, 0, Math.PI), std('#ffe14d', { emissive: '#3d2b00', ei: 0.3 })); p.scale.set(0.5, 0.12, 1.2); p.rotation.y = i * 2.1; p.position.set(Math.sin(i * 2.1) * 0.4, 0.1, Math.cos(i * 2.1) * 0.4); peel.add(p); }
    peel.position.copy(P(m, x, z, 0.05));
    // the peel flies there first
    const fly = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), std('#ffe14d')); const sx = c.x, sz = c.z, sy = m.groundY(c.x, c.z) + 1.5;
    m.fx.temp(fly, 0.35, k => { fly.position.set(sx + (x - sx) * k, sy + Math.sin(k * Math.PI) * 2.5 - k * 1.4, sz + (z - sz) * k); });
    m.after(0.35, () => m.zone({ src: c, team: c.team, x, z, r: 1.2, t: 30, trigger: 1.25, visual: peel, peelOf: c,
      onTrigger: (u) => { m.stun(u, ab.stun[r - 1]); m.damage(c, u, D(c, ab, r), 'magic'); m.fx.burst(P(m, u.x, u.z, 0.5), '#ffe14d', 22, 6); m.fx.flash(P(m, u.x, u.z, 1), '#ffe14d', 1.8, 0.25); m.fx.ring(P(m, u.x, u.z), '#ffe14d', 0.3, 2.5, 0.4); m.sound('slip', u.x, u.z); u.spinT = 0.8; u.spinMax = 0.8; } }));
    m.sound('cast', c.x, c.z);
  },
  'banana:1'(m, c, ab, r, x, z, t) {
    const amt = ab.heal[r - 1] + c.st.ap * ab.ap;
    m.heal(c, c, amt);
    let other = t && t !== c ? t : m.alliesIn(c.x, c.z, ab.range, c.team).filter(h => h !== c).sort((a, b) => a.hp / a.st.maxHp - b.hp / b.st.maxHp)[0];
    if (other) { m.heal(c, other, amt); m.fx.beam(P(m, c.x, c.z, 1.2), P(m, other.x, other.z, 1.2), '#7bd389', 0.2, 0.4); }
    m.sound('heal', c.x, c.z);
  },
  'banana:2'(m, c, ab, r, x, z) {
    let last = { x: c.x, z: c.z };
    const drop = (px, pz) => {
      const vis = zoneDisc(m, px, pz, 1.7, '#ffe14d', 0.4);
      m.zone({ src: c, team: c.team, x: px, z: pz, r: 1.7, t: 3, every: 0.2, visual: vis,
        onTick: (us) => { for (const u of us) { if (u.team === c.team && u.hero) u.addBuff({ id: 'slidefast', t: 0.4, mods: { msPct: 0.3 } }); else if (u.team !== c.team && u.kind !== 'tower' && u.kind !== 'core') m.slow(u, 0.4, 0.4); } } });
    };
    drop(c.x, c.z);
    m.dash(c, x, z, 24, { onStep: u => { if (u.distTo(last.x, last.z) > 2) { last = { x: u.x, z: u.z }; drop(u.x, u.z); } } });
    m.sound('slip', c.x, c.z);
  },
  'banana:3'(m, c, ab, r, x, z) {
    const p = P(m, x, z);
    for (let i = 0; i < 14; i++) { const a = Math.random() * 6.28, d = Math.random() * ab.radius; m.after(i * 0.03, () => m.fx.burst(P(m, x + Math.cos(a) * d, z + Math.sin(a) * d, 0.5), '#ffe14d', 6, 4)); }
    m.fx.shockwave(p, '#ffe14d', ab.radius); m.fx.confetti(P(m, x, z, 1), 50, ab.radius); m.shake(x, z, 0.5); m.sound('slip', x, z); m.sound('boom', x, z, 0.6);
    hitAll(m, c, x, z, ab.radius, e => { m.damage(c, e, D(c, ab, r), 'magic'); m.stun(e, ab.stun[r - 1]); e.spinT = 0.8; e.spinMax = 0.8; });
    for (const a of m.alliesIn(x, z, ab.radius, c.team)) { m.shield(c, a, ab.shield[r - 1], 3); a.addBuff({ id: 'split', t: 3, mods: { msPct: 0.3 } }); bubble(m, a, '#ffe14d', 3); }
  },
  // ---------------- THE MAGICIAN ----------------
  'wizard:0'(m, c, ab, r, x, z) {
    const base = Math.atan2(x - c.x, z - c.z), mh = multiHit();
    for (let i = 0; i < 3; i++) {
      const a = base + (i - 1) * 0.16;
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.35), basic('#ffd23f'));
      m.skillshot({ src: c, dx: Math.sin(a), dz: Math.cos(a), speed: ab.speed, range: ab.range, width: ab.width, color: '#c77dff', mesh: star, spin: 10, size: 0.3,
        onHit: e => { m.damage(c, e, D(c, ab, r) * mh(e), 'magic'); m.fx.sparks(P(m, e.x, e.z, 1.2), '#ffd23f', 10); m.sound('magic', e.x, e.z, 0.6); } });
    }
    m.sound('magic', c.x, c.z);
  },
  'wizard:1'(m, c, ab, r, x, z, t) {
    m.damage(c, t, D(c, ab, r), 'magic');
    m.fx.smoke(P(m, t.x, t.z, 0.6), '#ffffff', 16, 1.6); m.fx.burst(P(m, t.x, t.z, 1.2), '#ff9ebb', 18, 5); m.fx.flash(P(m, t.x, t.z, 1.2), '#ff9ebb', 1.6, 0.25); m.sound('poof', t.x, t.z);
    if (!t.alive || (t.kind === 'monster' && t.mdef.epic)) return;
    let ears = null;
    if (t.obj) {
      ears = new THREE.Group(); ears.position.y = 1.6;
      for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.5, 4, 8), std('#ffffff')); e.position.set(0.18 * s, 0.4, 0); e.rotation.z = -0.2 * s; ears.add(e); const in2 = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.35, 4, 8), std('#ff9ebb')); in2.position.set(0.18 * s, 0.42, 0.06); in2.rotation.z = -0.2 * s; ears.add(in2); }
      t.obj.add(ears);
    }
    t.addBuff({ id: 'bunny', t: ab.dur[r - 1], bunny: true, silence: true, disarm: true, slow: 0.4, onEnd: () => { if (ears) ears.removeFromParent(); } });
    t.windup = -1;
  },
  'wizard:2'(m, c, ab, r, x, z) {
    m.fx.smoke(P(m, c.x, c.z, 0.5), '#c77dff', 16, 1.6); m.sound('poof', c.x, c.z);
    m.blink(c, x, z);
    c.addBuff({ id: 'vanish', t: 1.25, stealth: true });
    m.fx.sparks(P(m, c.x, c.z, 1), '#ffd23f', 12);
  },
  'wizard:3'(m, c, ab, r, x, z) {
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
  'robot:0'(m, c, ab, r, x, z) {
    const [dx, dz] = dir(c, x, z);
    m.fx.sparks(P(m, c.x + dx, c.z + dz, 1.2), '#00e5ff', 10);
    m.after(0.25, () => {
      if (!c.alive) return;
      const ex = c.x + dx * ab.range, ez = c.z + dz * ab.range;
      m.fx.beam(P(m, c.x, c.z, 1.2), P(m, ex, ez, 1.2), '#00e5ff', 0.6, 0.4); m.fx.beam(P(m, c.x, c.z, 1.2), P(m, ex, ez, 1.2), '#ffffff', 0.22, 0.32); m.fx.light(P(m, (c.x + ex) / 2, (c.z + ez) / 2), '#00e5ff', 35, 0.35, 18);
      for (let k = 0; k < 3; k++) m.fx.lightning(P(m, c.x, c.z, 1.2), P(m, ex, ez, 1.2), '#7df9ff', 0.25); m.fx.flash(P(m, ex, ez, 1.2), '#7df9ff', 1.6, 0.25);
      m.sound('laser', c.x, c.z);
      for (const e of m.enemiesIn(c.x + dx * ab.range / 2, c.z + dz * ab.range / 2, ab.range / 2 + 1, c.team)) {
        const t = (e.x - c.x) * dx + (e.z - c.z) * dz, perp = Math.abs((e.x - c.x) * dz - (e.z - c.z) * dx);
        if (t < -0.5 || t > ab.range + e.radius || perp > ab.width / 2 + e.radius) continue;
        m.damage(c, e, D(c, ab, r), 'magic'); m.slow(e, 0.3, 1.5); m.fx.sparks(P(m, e.x, e.z, 1.1), '#00e5ff', 8);
      }
    });
  },
  'robot:1'(m, c, ab, r, x, z, t) {
    const a = t || c;
    m.shield(c, a, ab.shield[r - 1] + c.st.ap * ab.ap, 3);
    a.addBuff({ id: 'forcefast', t: 1.5, mods: { msPct: 0.2 } });
    bubble(m, a, '#00e5ff', 3, 1.7); if (a !== c) m.fx.beam(P(m, c.x, c.z, 1.2), P(m, a.x, a.z, 1.2), '#00e5ff', 0.15, 0.3);
    m.sound('shield', a.x, a.z);
  },
  'robot:2'(m, c, ab, r, x, z) {
    const [dx, dz] = dir(c, x, z);
    const mag = new THREE.Group(); const arc = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.12, 8, 16, Math.PI), std('#e53935', { emissive: '#e53935', ei: 0.3 })); arc.rotation.x = Math.PI / 2; mag.add(arc);
    for (const s of [-1, 1]) { const tip = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.24), std('#dee2e6')); tip.position.set(0.4 * s, 0, 0); mag.add(tip); }
    m.skillshot({ src: c, dx, dz, speed: ab.speed, range: ab.range, width: ab.width, color: '#e53935', mesh: mag, size: 0.4,
      onHit: e => {
        m.damage(c, e, D(c, ab, r), 'magic');
        m.fx.beam(P(m, c.x, c.z, 1.2), P(m, e.x, e.z, 1.2), '#e53935', 0.12, 0.5); m.fx.lightning(P(m, c.x, c.z, 1.2), P(m, e.x, e.z, 1.2), '#ff6b6b', 0.3);
        if (!(e.kind === 'monster' && e.mdef.epic) && e.alive) { const l = Math.max(0.1, e.dist(c)), tx = c.x + (e.x - c.x) / l * (c.radius + e.radius + 0.5), tz = c.z + (e.z - c.z) / l * (c.radius + e.radius + 0.5); m.dash(e, tx, tz, 26, { onArrive: u => m.stun(u, 0.5) }); m.stun(e, 0.6); }
        m.sound('hit', e.x, e.z);
      } });
    m.sound('shoot', c.x, c.z);
  },
  'robot:3'(m, c, ab, r) {
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
