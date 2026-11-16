// Tricks in the air. W frontflip, S backflip, A spin left, D spin right, and the four diagonal flips
// (W+A, W+D, S+A, S+D) when two keys are held together.
//
// The rider's rotation in the air = "neutral" (follows the flight path) x "local" (what the tricks did).
// Each trick turns the local rotation around one axis of the rider's own body. Holding the keys keeps
// turning; letting go finishes the half or whole turn (or turns back if it had barely started).
import { THREE } from './engine.js';

const TAU = Math.PI * 2;
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const _f = new THREE.Vector3(), _u = new THREE.Vector3(), _a = new THREE.Vector3(), _q = new THREE.Quaternion();
const YAW180 = new THREE.Quaternion().setFromAxisAngle(Y, Math.PI);

export const GRACE = 0.13;   // seconds: a second key pressed this soon after the first makes a diagonal trick

export function trickKind(f, s) { return f && s ? 'diag' : f ? 'flip' : s ? 'spin' : null; }
export function trickName(f, s, n) {
  const mult = n <= 1 ? '' : n <= 5 ? ['', '', 'Double ', 'Triple ', 'Quad ', 'Quint '][n] : n + 'x ';
  if (f && s) return mult + 'Diagonal ' + (f > 0 ? 'Frontflip' : 'Backflip') + (s > 0 ? ' Right' : ' Left');
  if (f) return mult + (f > 0 ? 'Frontflip' : 'Backflip');
  return (n * 180) + (s > 0 ? ' Right' : ' Left');
}
function trickPoints(f, s, n) {
  let p = 0;
  const base = f && s ? 750 : f ? (f > 0 ? 500 : 550) : 150, inc = f && s ? 0.35 : f ? 0.3 : 0.25;
  for (let k = 1; k <= n; k++) p += base * (1 + inc * (k - 1));
  return Math.round(p);
}

export class Tricks {
  constructor() { this.local = new THREE.Quaternion(); this.reset(); }
  reset() {
    this.active = false; this.seg = null; this.entries = []; this.airT = 0; this.local.identity();
    this.last = null; this.spinTotal = 0;
    // once you flip one way you cannot flip the other way in the same jump (no backflip right after a frontflip)
    this.lockF = 0; this.blockedT = 0;
  }
  // takeoff: start with the rotation the rider has on the snow
  start(local) { this.reset(); this.active = true; this.local.copy(local); }

  // f: +1 front / -1 back / 0, s: +1 right / -1 left / 0 (from the keys or the touch pad)
  update(dt, f, s, relax) {
    this.airT += dt;
    this.blockedT = Math.max(0, this.blockedT - dt);
    if (f && f === this.lockF) { f = 0; this.blockedT = 0.9; this.blockedF = this.lockF; }
    const seg = this.seg;
    if (f || s) {
      if (seg) {
        if (seg.f === f && seg.s === s) { seg.finishing = false; this.turn(seg, dt); return; }
        // a second key soon after the first: the trick becomes the diagonal one
        if (!seg.finishing && seg.t < GRACE && f && s && seg.kind !== 'diag' && (seg.f === f || seg.s === s)) { this.upgrade(seg, f, s); this.turn(seg, dt); return; }
        // one of the two keys let go a moment before the other: that is still letting go of the diagonal
        if (seg.kind === 'diag' && (!f || f === seg.f) && (!s || s === seg.s)) { this.finish(seg, dt); return; }
        this.close();
      }
      this.open(f, s); this.turn(this.seg, dt);
      return;
    }
    if (seg) { this.finish(seg, dt); return; }
    // nothing pressed: float back towards a clean riding position (forward or switch)
    if (relax > 0) {
      const target = this.nearestClean();
      this.local.slerp(target, 1 - Math.exp(-relax * dt));
    }
  }
  // keys let go: finish the turn that was started, or turn back if it had barely started
  finish(seg, dt) {
    if (!seg.finishing) {
      seg.finishing = true;
      const frac = seg.th / seg.unit - Math.floor(seg.th / seg.unit);
      seg.target = (frac > (seg.kind === 'spin' ? 0.28 : 0.22) ? Math.ceil(seg.th / seg.unit) : Math.floor(seg.th / seg.unit)) * seg.unit;
    }
    const d = seg.target - seg.th, step = seg.w * Math.max(0.35, Math.min(1, Math.abs(d) / 0.9)) * dt;
    if (Math.abs(d) <= step) { seg.th = seg.target; this.apply(seg); this.close(); }
    else { seg.th += Math.sign(d) * step; this.apply(seg); }
  }
  nearestClean() {
    return this.local.angleTo(YAW180) < this.local.angleTo(_q.identity()) ? YAW180 : _q.identity();
  }
  open(f, s) {
    const kind = trickKind(f, s);
    this.seg = { f, s, kind, q0: this.local.clone(), th: 0, t: 0, unit: kind === 'spin' ? Math.PI : TAU, w: kind === 'spin' ? TAU * 1.35 : kind === 'flip' ? TAU * 1.1 : TAU * 1.0, axis: new THREE.Vector3(), finishing: false };
    this.axisFor(this.seg);
  }
  upgrade(seg, f, s) { seg.f = f; seg.s = s; seg.kind = 'diag'; seg.unit = TAU; seg.w = TAU; this.axisFor(seg); this.apply(seg); }
  // the axis comes from the rider's own body at the start of the trick
  axisFor(seg) {
    _f.copy(Z).applyQuaternion(seg.q0); _u.copy(Y).applyQuaternion(seg.q0);
    seg.axis.set(0, 0, 0);
    if (seg.f) seg.axis.add(_a.crossVectors(_u, _f).multiplyScalar(seg.f));   // front: up x forward
    if (seg.s) seg.axis.addScaledVector(_u, -seg.s);                          // right: around -up
    seg.axis.normalize();
  }
  turn(seg, dt) {
    seg.t += dt;
    seg.th += seg.w * Math.min(1, 0.35 + seg.t / 0.14) * dt;
    if (seg.f && seg.th > seg.unit * 0.25) this.lockF = -seg.f;
    this.apply(seg);
  }
  apply(seg) { this.local.setFromAxisAngle(seg.axis, seg.th).multiply(seg.q0); }
  close() {
    const seg = this.seg; this.seg = null;
    if (!seg) return;
    const n = Math.floor(seg.th / seg.unit + 0.04);
    if (n <= 0) return;
    if (seg.f) this.lockF = -seg.f;
    // the same trick again right away counts as one bigger trick
    const last = this.entries[this.entries.length - 1];
    if (last && last.f === seg.f && last.s === seg.s) last.n += n; else this.entries.push({ f: seg.f, s: seg.s, kind: seg.kind, n });
  }
  // what to show on screen while in the air
  current() {
    const seg = this.seg;
    const list = this.entries.map(e => ({ ...e }));
    if (seg) {
      const n = Math.floor(seg.th / seg.unit + 0.04);
      const last = list[list.length - 1];
      if (last && last.f === seg.f && last.s === seg.s) last.n += n;
      else if (n > 0 || !seg.finishing) list.push({ f: seg.f, s: seg.s, kind: seg.kind, n, live: true });
    }
    const names = list.filter(e => e.n > 0).map(e => trickName(e.f, e.s, e.n));
    const liveName = seg ? trickName(seg.f, seg.s, Math.max(1, Math.floor(seg.th / seg.unit + 0.04) + (seg.finishing ? 0 : 1))) : null;
    const pts = list.reduce((a, e) => a + trickPoints(e.f, e.s, e.n), 0), done = list.filter(e => e.n > 0).length;
    const mult = Math.min(5, 1 + 0.5 * Math.max(0, done - 1));
    return { names, liveName, points: pts, mult, count: done, list };
  }
  get rotating() { return !!this.seg; }

  // landing: how clean was it? up and forward of the rider against the snow and the direction of travel
  land(bodyQ, n, travel, assistLevel) {
    if (this.seg) { const s = this.seg; s.finishing = true; this.close(); }
    const cur = this.current();
    _u.copy(Y).applyQuaternion(bodyQ); _f.copy(Z).applyQuaternion(bodyQ);
    const up = _u.angleTo(n);
    _f.addScaledVector(n, -_f.dot(n)).normalize();
    const fa = _f.angleTo(travel), face = Math.min(fa, Math.PI - fa), sw = fa > Math.PI / 2;
    const extra = [0, 0.09, 0.17, 0.3][assistLevel] || 0;
    let q;
    if (up < 0.6 + extra && face < 0.55 + extra) q = up < 0.22 && face < 0.22 ? 'perfect' : 'clean';
    else if (up < 1.15 + extra && face < 1.0 + extra) q = 'sketchy';
    else q = 'crash';
    const air = this.airT;
    const bonus = air > 1.2 ? Math.round((air - 1.2) * 180) : 0;
    let total = Math.round((cur.points * cur.mult + bonus) * (q === 'perfect' ? 1.1 : q === 'clean' ? 1 : q === 'sketchy' ? 0.5 : 0));
    this.active = false;
    return { quality: q, names: cur.names, list: cur.list, mult: cur.mult, base: cur.points, bonus, total, air, switch: sw };
  }
}
