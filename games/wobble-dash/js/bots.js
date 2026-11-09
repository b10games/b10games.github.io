// Bots fill the match up to 12 players. They follow the course hints, jump gaps, dash over big
// ones, hop over beams coming at them, and make mistakes like real players.
import { THREE } from './engine.js';

const NAMES = ['Wobbly', 'Bouncy', 'Jellybop', 'Noodle', 'Pickle', 'Sprinkles', 'Tofu', 'Zippy', 'Mochi', 'Pudding', 'Bubbles', 'Gizmo', 'Waffles', 'Nugget', 'Pebble', 'Squish', 'Dumpling', 'Biscuit', 'Marble', 'Turbo'];
// Every bot in a match gets a different first name.
export function botNames(n, r) {
  const pool = NAMES.slice().sort(() => r() - 0.5);
  return Array.from({ length: n }, (_, i) => pool[i % pool.length] + (Math.floor(r() * 90) + 10));
}

const near = [], _v = new THREE.Vector3();

export class Bot {
  constructor(mover, map, skill, rand) {
    this.m = mover; this.map = map; this.skill = skill; this.r = rand;
    this.offset = (rand() - 0.5) * 6; this.used = new Set(); this.dashAt = -1;
    this.lastZ = -99; this.stuckT = 0; this.cpT = 0; this.lastCp = -2; this.wander = null; this.wanderT = 0; this.hesitate = 0;
  }
  input(dt, t) {
    const m = this.m, p = m.pos, inp = { x: 0, z: 0, jump: false };
    if (m.finished) { inp.x = Math.sin(t * 2 + this.offset) * 0.3; return inp; }
    if (this.hesitate > 0) { this.hesitate -= dt; return inp; }
    if (this.map.arena) return this.arena(dt, t, inp);

    // where to go: follow lane hints ahead
    const nav = this.map.nav;
    let tx = this.offset;
    for (let i = 0; i < nav.length; i++) {           // aim at the next platform / bridge ahead
      const n = nav[i];
      if (n.x != null && !n.act && n.z > p.z - 0.3 && n.z < p.z + 11) { tx = n.x + this.offset * 0.12; break; }
    }
    const dx = tx - p.x;
    inp.z = 1; inp.x = Math.max(-1, Math.min(1, dx * 0.5));

    // jumps and dashes at the marked spots
    const reach = 0.25 + (1 - this.skill) * 0.55;
    for (let i = 0; i < nav.length; i++) {
      const n = nav[i];
      if (!n.act || this.used.has(i)) continue;
      if (n.z < p.z - 3) { this.used.add(i); continue; }
      if (n.z - p.z < reach && n.z - p.z > -1.5 && m.grounded) {
        this.used.add(i);
        if (this.r() < 0.06 * (1.2 - this.skill)) { this.hesitate = 0.3; break; }   // fumble
        inp.jump = true;
        if (n.act === 'dash') this.dashAt = t + 0.24 + this.r() * 0.08;
        break;
      }
    }
    if (this.dashAt > 0 && t >= this.dashAt) { inp.jump = true; this.dashAt = -1; }
    this.dodge(inp, t);

    // after a respawn, forget the spots behind the checkpoint
    if (p.z < this.lastZ - 6) { for (const i of [...this.used]) if (nav[i].z > p.z - 1) this.used.delete(i); }
    // stuck? wiggle and hop; stuck at one checkpoint for long? skip ahead quietly
    if (p.z > this.lastZ + 1) { this.lastZ = p.z; this.stuckT = 0; } else this.stuckT += dt;
    if (this.stuckT > 4) { inp.jump = true; inp.x = this.r() < 0.5 ? -1 : 1; if (this.stuckT > 5) { this.stuckT = 0; this.lastZ = p.z - 2; } }
    if (m.cpIndex !== this.lastCp) { this.lastCp = m.cpIndex; this.cpT = 0; } else this.cpT += dt;
    if (this.cpT > 28 + this.skill * 10) { this.cpT = 0; this.skipAhead(); }
    return inp;
  }
  // Hop over a beam or hammer that is about to hit us.
  dodge(inp, t) {
    const m = this.m;
    if (!m.grounded || inp.jump || this.r() > 0.25 + this.skill * 0.6) return;
    _v.copy(m.pos); _v.y += 0.6;
    m.world.near(_v, 2.6, near);
    for (const c of near) {
      if (!c.hit || !c.dynamic) continue;
      const d = c.pos.distanceTo(_v);
      if (d < c.boundW + 1.4 && c.pos.y < m.pos.y + 1.6) { inp.jump = true; return; }
    }
  }
  skipAhead() {
    const zones = this.m.world.zones.filter(z => z.type === 'checkpoint' && z.data.index > this.m.cpIndex).sort((a, b) => a.data.index - b.data.index);
    if (!zones.length) return;
    const z = zones[0];
    this.m.cpIndex = z.data.index; this.m.checkpoint.copy(z.data.spawn); this.m.respawn();
    this.lastZ = this.m.pos.z; this.used.clear();
  }
  arena(dt, t, inp) {
    const m = this.m, p = m.pos, id = this.map.def.id;
    this.wanderT -= dt;
    if (id === 'lavarise') {
      // climb to the next higher platform
      let best = null, bd = 1e9;
      for (const q of this.map.platforms || []) {
        const dy = q.y - p.y, d = Math.hypot(q.x - p.x, q.z - p.z);
        if (dy > 0.4 && dy < 2.3 && d < 7 && d < bd) { bd = d; best = q; }
      }
      if (best) { inp.x = best.x - p.x; inp.z = best.z - p.z; const l = Math.hypot(inp.x, inp.z) || 1; inp.x /= l; inp.z /= l; if (bd < 3.2 && m.grounded) inp.jump = true; }
      else { const a = Math.atan2(p.z, p.x) + 0.5; inp.x = Math.cos(a) * 0.6 - p.x * 0.05; inp.z = Math.sin(a) * 0.6 - p.z * 0.05; if (this.r() < 0.02) inp.jump = true; }
      return inp;
    }
    if (!this.wander || this.wanderT <= 0 || Math.hypot(this.wander.x - p.x, this.wander.z - p.z) < 1) {
      const a = this.r() * Math.PI * 2, rad = id === 'spin' ? 5 + this.r() * 7 : 2 + this.r() * 9;
      this.wander = { x: Math.cos(a) * rad, z: Math.sin(a) * rad }; this.wanderT = 1.5 + this.r() * 2;
    }
    inp.x = this.wander.x - p.x; inp.z = this.wander.z - p.z;
    const l = Math.hypot(inp.x, inp.z) || 1; inp.x /= l; inp.z /= l;
    if (id === 'crumble') { inp.x *= 0.8; inp.z *= 0.8; if (m.grounded && this.r() < 0.015) inp.jump = true; }
    this.dodge(inp, t);
    return inp;
  }
}
