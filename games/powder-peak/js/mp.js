// The other riders in your party: every rider sends where they are about 15 times a second (position,
// rotation, pose, trick, score). Here those snapshots are played back smoothly, 120 ms behind, so the
// others glide instead of jumping from point to point.
import { THREE, clamp } from './engine.js';
import { Rider, nameTag } from './rider.js';

export const COLORS = ['#3ee6ff', '#ffd84a', '#ff5fa2', '#4ade80', '#a78bfa', '#ff8a3d', '#60a5fa', '#f87171'];
const DELAY = 120;
const _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _p2 = new THREE.Vector3();

// pack my state into a small array
export function packState(ctrl, P, extra) {
  const p = ctrl.p, q = ctrl.quat, v = ctrl.v;
  const r = x => Math.round(x * 100) / 100, r3 = x => Math.round(x * 1000) / 1000;
  return [r(p.x), r(p.y), r(p.z), r3(q.x), r3(q.y), r3(q.z), r3(q.w), r(v.x), r(v.y), r(v.z),
    r(P.crouch), r(P.edge), r(P.lean), r(P.air), r(P.flip), r(P.land), P.bail, r(P.brake), r(P.tuck), r(P.charge), r(P.speed), r(ctrl.pivot || 0), r(P.wobble), ctrl.state === 'lift' ? 1 : 0];
}

export class Remotes {
  constructor(scene) { this.scene = scene; this.map = new Map(); }
  get(id, prof, i) {
    let o = this.map.get(id);
    if (!o) {
      const model = new Rider(prof.outfit, prof.gear);
      const tag = nameTag(prof.name || 'Rider', COLORS[i % COLORS.length]); tag.position.y = 2.35; model.root.add(tag);
      this.scene.add(model.root);
      o = { id, model, tag, buf: [], name: prof.name, gear: prof.gear, outfitKey: JSON.stringify(prof.outfit || {}), score: 0, trick: '', top: 0, color: COLORS[i % COLORS.length], seen: performance.now(), visible: true };
      this.map.set(id, o);
    }
    return o;
  }
  // a state message from another rider
  push(id, m, prof, i, now) {
    const o = this.get(id, prof || { name: m.n, outfit: m.o, gear: m.g }, i);
    o.seen = performance.now();
    if (m.n && m.n !== o.name) { o.name = m.n; o.model.root.remove(o.tag); o.tag = nameTag(m.n, o.color); o.tag.position.y = 2.35; o.model.root.add(o.tag); }
    if (m.g && m.g !== o.gear) { o.gear = m.g; o.model.setGear(m.g); }
    if (m.o) { const k = JSON.stringify(m.o); if (k !== o.outfitKey) { o.outfitKey = k; o.model.setOutfit(m.o); } }
    o.score = m.sc || 0; o.trick = m.tr || ''; o.top = m.top || o.top;
    if (m.s) { o.buf.push({ t: m.at || now, s: m.s }); if (o.buf.length > 30) o.buf.shift(); }
  }
  remove(id) { const o = this.map.get(id); if (!o) return; this.scene.remove(o.model.root); this.map.delete(id); }
  clear() { for (const id of [...this.map.keys()]) this.remove(id); }
  update(dt, now, cam, world) {
    const t = now - DELAY;
    for (const o of this.map.values()) {
      const b = o.buf; if (!b.length) continue;
      // find the two snapshots around t and blend them
      let a = b[0], c = b[b.length - 1];
      for (let i = 0; i < b.length - 1; i++) if (b[i].t <= t && b[i + 1].t >= t) { a = b[i]; c = b[i + 1]; break; }
      const k = c.t > a.t ? clamp((t - a.t) / (c.t - a.t), 0, 1) : 1;
      const s = a.s, e = c.s;
      _p.set(s[0], s[1], s[2]).lerp(_p2.set(e[0], e[1], e[2]), k);
      // past the last snapshot: keep going a little with the speed it had
      if (t > c.t) { const x = Math.min(0.25, (t - c.t) / 1000); _p.set(e[0] + e[7] * x, e[1] + e[8] * x, e[2] + e[9] * x); }
      _q.set(s[3], s[4], s[5], s[6]).slerp(new THREE.Quaternion(e[3], e[4], e[5], e[6]), k);
      const P = o.model.pose, L = (i) => s[i] + (e[i] - s[i]) * k;
      P.crouch = L(10); P.edge = L(11); P.lean = L(12); P.air = L(13); P.flip = L(14); P.land = L(15); P.bail = e[16]; P.brake = L(17); P.tuck = L(18); P.charge = L(19); P.speed = L(20); P.wobble = L(22) || 0;
      if (world) _p.y += world.drawnHeight(_p.x, _p.z) - world.height(_p.x, _p.z);   // on the snow you see
      o.model.place(_p, _q, L(21));
      o.model.update(dt);
      // hide riders who stopped sending
      o.model.root.visible = performance.now() - o.seen < 6000;
    }
  }
}
