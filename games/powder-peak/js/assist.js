// Landing assist: a small invisible helping hand in the air.
//
// A few times a second it flies the rest of the jump ahead in its head and checks where you will land.
// If that spot is bad (a flat bottom far below, rock, a tree) but a good snowy slope is close by, it
// gently nudges your flight towards it. It never teleports and has a budget: the further off you are,
// the less it can do, and on OFF it does nothing. Near the ground it also helps you straighten up.
import { THREE } from './engine.js';

export const ASSIST = ['OFF', 'LOW', 'MEDIUM', 'HIGH'];
// how much speed it may add or take away (m/s), how hard it may push (m/s²), how much it helps you straighten up
const LEVEL = [
  { budget: 0, accel: 0, align: 0, alignMax: 0 },
  { budget: 1.6, accel: 2.4, align: 1.6, alignMax: 0.5 },
  { budget: 3.8, accel: 5, align: 3.2, alignMax: 0.9 },
  { budget: 6.5, accel: 8.5, align: 5.5, alignMax: 1.35 }
];
const G = 7.6;      // the same soft air gravity as the riders (physics.js G_AIR)
const _p = new THREE.Vector3(), _v = new THREE.Vector3(), _n = new THREE.Vector3(), _h = new THREE.Vector3(), _s = new THREE.Vector3();

export class Assist {
  constructor(world) { this.world = world; this.reset(); }
  reset() { this.timer = 0; this.dv = new THREE.Vector3(); this.left = 0; this.impact = null; this.t = 99; this.helping = false; this.last = null; }

  // fly ahead: where and when do we hit the snow, and how good a landing is it?
  predict(p, v, out) {
    const W = this.world, dt = 0.05;
    _p.copy(p); _v.copy(v);
    let prevGap = _p.y - W.height(_p.x, _p.z);
    for (let t = dt; t < 5; t += dt) {
      _v.y -= G * dt; _v.multiplyScalar(1 - 0.0016 * _v.length() * dt); _p.addScaledVector(_v, dt);
      const h = W.height(_p.x, _p.z), gap = _p.y - h;
      if (gap <= 0) {
        // back up to the moment of touching
        const k = prevGap / (prevGap - gap + 1e-6);
        _p.addScaledVector(_v, -(1 - k) * dt);
        out.t = t - (1 - k) * dt; out.p.copy(_p); out.v.copy(_v);
        W.normal(_p.x, _p.z, out.n);
        out.score = this.score(out.p, out.v, out.n);
        return out;
      }
      prevGap = gap;
    }
    out.t = 5; out.p.copy(_p); out.v.copy(_v); out.n.set(0, 1, 0); out.score = -1;
    return out;
  }
  // 1 = a perfect landing slope, below 0 = a bad place to land
  score(p, v, n) {
    if (n.y < 0.62) return -1;                                  // rock or a cliff face
    // right next to a cliff edge is risky: a little off and you hit the rock
    const hz = Math.hypot(v.x, v.z) || 1, fx = v.x / hz, fz = v.z / hz;
    for (const d of [-2.5, 2.5, 5]) { this.world.normal(p.x + fx * d, p.z + fz * d, _s); if (_s.y < 0.62) return -0.4; }
    const into = -v.dot(n);                                      // how hard you hit the snow
    let s = 1 - Math.min(1.4, Math.max(0, into - 4) / 16);
    // a tree or a rock right where you land
    for (const o of this.world.solidsNear(p.x, p.z)) if (Math.hypot(o.x - p.x, o.z - p.z) < o.r + 1.2) { s -= 1.2; break; }
    // landing going downhill is nicer than landing on a slope that faces you
    _h.set(v.x, 0, v.z).normalize(); _s.set(n.x, 0, n.z);
    s += Math.max(-0.3, Math.min(0.2, _h.dot(_s) * 0.6));
    return s;
  }

  // called every frame in the air; may change v
  update(dt, level, p, v) {
    this.helping = false;
    const L = LEVEL[level] || LEVEL[0];
    if (!L.budget) { this.impact = null; return; }
    this.timer -= dt;
    if (this.timer <= 0) { this.timer = 0.12; this.plan(L, p, v); }
    if (this.left > 0 && this.dv.lengthSq() > 0) {
      // spread the nudge over the time that is left
      const a = Math.min(L.accel, this.dv.length() / Math.max(0.2, this.t * 0.7));
      const step = Math.min(this.left, a * dt);
      _v.copy(this.dv).normalize().multiplyScalar(step);
      v.add(_v); this.left -= step; this.helping = true;
      this.used = (this.used || 0) + step;
    }
    this.t -= dt;
  }
  plan(L, p, v) {
    const cur = this.impact = this.predict(p, v, { p: new THREE.Vector3(), v: new THREE.Vector3(), n: new THREE.Vector3() });
    this.t = cur.t;
    if (cur.t < 0.25 || cur.score > 0.75) { this.left = 0; return; }
    // try small changes to the flight: left/right of the travel direction, a bit longer or shorter
    const hz = Math.hypot(v.x, v.z) || 1, fx = v.x / hz, fz = v.z / hz, rx = -fz, rz = fx;
    const budget = Math.max(0, L.budget - (this.used || 0));
    if (budget < 0.2) { this.left = 0; return; }
    let best = null, bestScore = cur.score + 0.25, tmp = { p: new THREE.Vector3(), v: new THREE.Vector3(), n: new THREE.Vector3() };
    for (const side of [-1, -0.5, 0, 0.5, 1]) for (const fwd of [-0.6, 0, 0.6]) {
      if (!side && !fwd) continue;
      const dx = (rx * side + fx * fwd) * budget, dz = (rz * side + fz * fwd) * budget, mag = Math.hypot(dx, dz);
      _n.set(v.x + dx, v.y, v.z + dz);
      const r = this.predict(p, _n, tmp);
      // prefer the smallest change that gives a good landing
      const sc = r.score - mag / budget * 0.15;
      if (sc > bestScore) { bestScore = sc; best = { dx, dz, mag }; }
    }
    // only trust a nudge that still works if the flight turns out a little different
    if (best) {
      let worst = 9;
      for (const k of [0.8, 1.2]) { _n.set(v.x + best.dx * k, v.y, v.z + best.dz * k); worst = Math.min(worst, this.predict(p, _n, tmp).score); }
      if (worst < cur.score + 0.1) best = null;
    }
    if (best) { this.dv.set(best.dx, 0, best.dz); this.left = best.mag; }
    else this.left = 0;
  }
  // near the ground: how much to straighten up this frame (0 = not at all)
  alignRate(level, rotating) {
    const L = LEVEL[level] || LEVEL[0];
    if (!L.align || rotating || !this.impact || this.t > 0.42) return 0;
    return L.align;
  }
  alignMax(level) { return (LEVEL[level] || LEVEL[0]).alignMax; }
  takeoff() { this.reset(); this.used = 0; }
}
