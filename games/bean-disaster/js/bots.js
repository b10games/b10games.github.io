// Bot beans, so a round is never empty. They are not perfect: some are slow to react, some pick a
// bad place to hide, and all of them can trip. What they do in each disaster:
//   flood, tsunami, volcano -> climb somewhere high      meteors, acid rain, lightning -> get under a roof
//   blizzard -> go to a campfire or inside               tornado -> run away from it (or hide inside)
//   earthquake -> stay away from buildings               and everyone steps out of warning circles
import { THREE, clamp, angDiff } from './engine.js';
import { LOBBY } from './map.js';

const NAMES = ['Bubbles', 'Jelly', 'Pickle', 'Noodle', 'Waffles', 'Sprinkles', 'Biscuit', 'Gumdrop', 'Tofu', 'Muffin', 'Pebble', 'Dumpling', 'Nugget', 'Taco', 'Marshmallow', 'Peanut', 'Sushi', 'Pudding', 'Zippy', 'Wobbles', 'Beanie', 'Squish', 'Bonbon', 'Kiwi'];
export function botNames(n, r = Math.random) { const l = NAMES.slice(); for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; } return l.slice(0, n); }

const GOAL = { flood: 'high', tsunami: 'high', volcano: 'high', meteor: 'shelter', acid: 'shelter', lightning: 'shelter', blizzard: 'warm' };
const _d = new THREE.Vector3(), _o = new THREE.Vector3();

export class BotBrain {
  constructor(body, game, skill) {
    this.b = body; this.g = game; this.skill = skill;
    this.spot = null; this.wp = 0; this.offset = new THREE.Vector3((Math.random() - 0.5) * 2, 0, (Math.random() - 0.5) * 2);
    this.wander = null; this.wanderT = 0; this.react = 0; this.lastDis = null;
    this.stuckT = 0; this.side = 0; this.sideT = 0; this.probeT = 0; this.steer = 0; this.jumpT = Math.random() * 3;
  }
  reset() { this.spot = null; this.wp = 0; this.wander = null; this.lastDis = null; this.stuckT = 0; this.sideT = 0; }
  // what the bot wants to do this frame: { x, z, jump }
  think(dt) {
    const b = this.b, m = b.mover, g = this.g, p = m.pos;
    const inp = { x: 0, z: 0, jump: false };
    if ((!b.alive && b.onMap) || m.stun > 0.3) return inp;
    let target = null, run = true;
    if (!b.onMap) {
      // the lobby: walk around, bounce on the mushrooms now and then
      this.wanderT -= dt;
      if (!this.wander || this.wanderT <= 0 || p.distanceTo(this.wander) < 1.5) {
        const a = Math.random() * 6.28, d = 3 + Math.random() * 15;
        this.wander = new THREE.Vector3(LOBBY.x + Math.sin(a) * d, LOBBY.y, LOBBY.z + Math.cos(a) * d);
        if (Math.random() < 0.2 && g.map.mush.length) { const mu = g.map.mush[Math.floor(Math.random() * g.map.mush.length)]; this.wander.set(mu.position.x, LOBBY.y, mu.position.z); }
        this.wanderT = 2 + Math.random() * 5; this.idle = Math.random() < 0.35;
      }
      if (this.idle) return inp;
      target = this.wander; run = false;
    } else {
      const dis = g.disaster, phase = g.phase;
      if (dis && phase === 'disaster') {
        if (this.lastDis !== dis) { this.lastDis = dis; this.react = 0.4 + (1 - this.skill) * 5 * Math.random(); this.spot = null; this.wp = 0; }
        this.react -= dt;
        if (this.react <= 0) target = this.plan(dis);
      }
      if (!target) {
        // waiting for the disaster (or still thinking): stroll around the town square
        this.wanderT -= dt;
        if (!this.wander || this.wanderT <= 0 || p.distanceTo(this.wander) < 1.5) { const a = Math.random() * 6.28, d = 6 + Math.random() * 26; this.wander = new THREE.Vector3(Math.sin(a) * d, 2, Math.cos(a) * d); this.wanderT = 3 + Math.random() * 5; }
        target = this.wander; run = false;
      }
    }
    // step out of warning circles first
    let dx = 0, dz = 0;
    for (const w of g.env.warns) {
      const wx = p.x - w.m.position.x, wz = p.z - w.m.position.z, d = Math.hypot(wx, wz);
      if (d < w.r + 1.6 && Math.abs(p.y - w.m.position.y) < 4 && Math.random() < 0.6 + this.skill * 0.4) { dx += wx / (d || 1) * 3; dz += wz / (d || 1) * 3; }
    }
    if (target && !(dx || dz)) {
      dx = target.x - p.x; dz = target.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < (this.atTop ? 0.6 : 0.4)) { dx = dz = 0; }
      else { dx /= d; dz /= d; if (!run && d < 3) { dx *= 0.5; dz *= 0.5; } }
    }
    // steer around walls: look a little ahead every few frames
    if (dx || dz) {
      this.probeT -= dt;
      if (this.probeT <= 0) {
        this.probeT = 0.2; this.steer = 0;
        const base = Math.atan2(dx, dz);
        for (const off of [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9]) {
          const a = base + off * (this.side || 1);
          _d.set(Math.sin(a), 0, Math.cos(a));
          const hit = g.world.raycast(_o.set(p.x, p.y + 0.9, p.z), _d, 2.6, c => c.tag !== 'ground' && c !== m.groundC);
          if (!hit) { this.steer = off * (this.side || 1); break; }
        }
      }
      if (this.steer) { const a = Math.atan2(dx, dz) + this.steer, l = Math.hypot(dx, dz); dx = Math.sin(a) * l; dz = Math.cos(a) * l; }
    }
    // stuck? jump and try another way
    const sp = Math.hypot(m.vel.x, m.vel.z);
    if ((dx || dz) && sp < 1.2 && m.grounded) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt * 2);
    if (this.stuckT > 0.6) { inp.jump = true; this.stuckT = 0; this.side = Math.random() < 0.5 ? 1 : -1; this.sideT = 0.8; }
    if (this.sideT > 0) { this.sideT -= dt; const a = Math.atan2(dx, dz) + this.side * 1.3; const l = Math.hypot(dx, dz) || 1; dx = Math.sin(a) * l; dz = Math.cos(a) * l; }
    // climb out of the water
    if (m.swimming && Math.random() < dt * 3) inp.jump = true;
    // the odd happy hop
    this.jumpT -= dt; if (this.jumpT <= 0) { this.jumpT = 2 + Math.random() * 6; if (!b.onMap || !g.disaster) inp.jump = Math.random() < 0.4; }
    inp.x = dx; inp.z = dz;
    return inp;
  }
  // where to go for this disaster
  plan(dis) {
    const g = this.g, p = this.b.mover.pos, id = dis.id;
    if (id === 'tornado') {
      // run from the nearest twister; hide in a shelter if one is close
      let best = null, bd = 1e9;
      for (const w of dis.tw || []) if (g.time >= w.at - 1) { const d = Math.hypot(p.x - w.pos.x, p.z - w.pos.z); if (d < bd) { bd = d; best = w; } }
      if (best && bd < 36) {
        if (!this.spot || this.spot.kind !== 'shelter') { const s = this.pick('shelter', 22); if (s) { this.spot = s; this.wp = 0; } }
        if (this.spot && Math.hypot(this.spot.top.x - p.x, this.spot.top.z - p.z) < 22) return this.follow();
        const ax = p.x - best.pos.x, az = p.z - best.pos.z, l = Math.hypot(ax, az) || 1;
        return _o.set(p.x + ax / l * 10, p.y, p.z + az / l * 10);
      }
      if (this.spot) return this.follow();
      return null;
    }
    if (id === 'quake') {
      // away from walls: pick an open place
      if (!this.wander || this.b.mover.pos.distanceTo(this.wander) < 1.5 || Math.random() < 0.003) { const opens = [[0, 22], [-22, 0], [22, -26], [-8, -50], [56, 6], [-52, 24], [10, 52]]; const o = opens[Math.floor(Math.random() * opens.length)]; this.wander = new THREE.Vector3(o[0] + (Math.random() - 0.5) * 8, 2, o[1] + (Math.random() - 0.5) * 8); }
      return this.wander;
    }
    const kind = GOAL[id];
    if (!kind) return null;
    if (!this.spot) {
      // a not-so-clever bot sometimes picks a bad place
      const wrong = Math.random() < (1 - this.skill) * 0.45;
      const k = wrong ? (kind === 'high' ? 'shelter' : 'high') : kind;
      this.spot = this.pick(k, 999); this.wp = 0;
      if (!this.spot) return null;
    }
    return this.follow();
  }
  pick(kind, maxD) {
    const g = this.g, p = this.b.mover.pos, list = g.map.spots[kind];
    let best = null, bs = -1e9;
    for (const s of list) {
      const used = g.spotUse(s.name), d = Math.hypot(s.top.x - p.x, s.top.z - p.z);
      if (d > maxD) continue;
      const score = -d / 35 + Math.random() * 1.2 - Math.max(0, used - s.cap + 1) * 2 + (kind === 'high' ? (s.y || 0) / 12 : 0);
      if (score > bs) { bs = score; best = s; }
    }
    if (best) { g.spotTake(best.name); best.kind = kind; }
    return best;
  }
  // walk the spot's path, then stand near its top
  follow() {
    const s = this.spot, p = this.b.mover.pos;
    const path = s.path;
    // fell off? start the path again from the nearest point below
    if (this.wp > 0 && path[this.wp - 1] && p.y < path[this.wp - 1].y - 2.5) { let bi = 0, bd = 1e9; path.forEach((q, i) => { if (q.y <= p.y + 1) { const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < bd) { bd = d; bi = i; } } }); this.wp = bi; }
    while (this.wp < path.length) {
      const q = path[this.wp];
      if (Math.hypot(q.x - p.x, q.z - p.z) < 1.7 && p.y > q.y - 1.5) this.wp++;
      else break;
    }
    this.atTop = this.wp >= path.length;
    if (!this.atTop) return path[this.wp];
    return _o.set(s.top.x + this.offset.x * s.spread, s.top.y, s.top.z + this.offset.z * s.spread);
  }
}
