// Tricks in the air. W frontflip, S backflip, A spin left, D spin right, and the four diagonal flips
// (W+A, W+D, S+A, S+D) when two keys are held together.
//
// The rider's rotation in the air = "neutral" (follows the flight path) x "local" (what the tricks did).
// Each trick turns the local rotation around one axis of the rider's own body. Holding the keys keeps
// turning; letting go eases the turn out smoothly to the half or whole turn (or back, if it had barely
// started), so it never stops dead.
//
// Turning speed is like real momentum: the pop off the snow gives you the most. Once you let go of a
// trick, starting to turn again in the same jump is slower (and slower again the next time).
// Holding SPACE in the air grabs the board or the skis.
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
    // one kind of trick per jump: the first one you start is the only one you can do until you land
    // (keep going with it, or let go and stop)
    this.lock = null; this.blockedT = 0;
    // how much turning speed is left in this jump (1 = all of it, straight after the pop)
    this.power = 1;
    // grabs: how long you have held one in this jump, which one, and whether you hold it right now
    this.grabT = 0; this.grabName = null; this.grabbing = false; this.grabSide = 1;
  }
  // takeoff: start with the rotation the rider has on the snow
  start(local, power = 1) { this.reset(); this.active = true; this.local.copy(local); this.power = power; }
  // SPACE held in the air: the name depends on what you are doing when you reach down
  grab(on, dt, gear) {
    if (on && !this.grabbing) {
      const L = this.lock || (this.seg && { f: this.seg.f, s: this.seg.s }) || { f: 0, s: 0 };
      if (gear === 'skis') { this.grabName = L.f ? 'Mute Grab' : L.s ? 'Japan Grab' : 'Safety Grab'; this.grabSide = 1; }
      else if (L.f < 0) { this.grabName = 'Method'; this.grabSide = -1; }
      else if (L.f > 0) { this.grabName = 'Nose Grab'; this.grabSide = 1; }
      else { this.grabName = L.s ? 'Indy' : 'Indy Grab'; this.grabSide = 1; }
    }
    this.grabbing = on;
    if (on) this.grabT += dt;
  }

  // f: +1 front / -1 back / 0, s: +1 right / -1 left / 0 (from the keys or the touch pad)
  update(dt, f, s, relax) {
    this.airT += dt;
    this.blockedT = Math.max(0, this.blockedT - dt);
    const L = this.lock;
    if (L && (f || s) && !(f === L.f && s === L.s)) {
      // holding more keys than the trick needs still does the trick; anything else is not allowed now
      const contains = (!L.f || f === L.f) && (!L.s || s === L.s);
      // one key of a diagonal let go a moment before the other: that is just letting go
      const part = L.f && L.s && (!f || f === L.f) && (!s || s === L.s);
      if (contains) { f = L.f; s = L.s; }
      else if (part) { f = 0; s = 0; }
      else { f = 0; s = 0; this.blockedT = 0.9; }
    }
    const seg = this.seg;
    if (f || s) {
      if (seg) {
        if (seg.f === f && seg.s === s) { seg.finishing = false; seg.spent = false; this.turn(seg, dt); return; }
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
      // letting go uses up some of the jump's turning speed: turning again later is slower
      if (!seg.spent) { seg.spent = true; this.power = Math.max(0.36, this.power * 0.6); }
      // where would the turn stop by itself? Finish to the nearest half/whole turn ahead of that,
      // or turn back if it had barely started
      const ahead = seg.th + Math.max(0, seg.om) * 0.2, frac = ahead / seg.unit - Math.floor(ahead / seg.unit);
      let k = frac > (seg.kind === 'spin' ? 0.22 : 0.16) ? Math.ceil(ahead / seg.unit) : Math.floor(ahead / seg.unit);
      // never further than the next half/whole turn from where you are now
      k = Math.min(k, Math.ceil(seg.th / seg.unit - 1e-6)); if (k * seg.unit < seg.th - seg.unit * 0.5) k++;
      seg.target = k * seg.unit;
      seg.om0 = Math.max(Math.abs(seg.om), seg.w * 0.5);
      // a spring that brings the turn to rest exactly on the target, starting at the speed you had
      // (going back a little after just finishing a turn is softer: it settles instead of snapping)
      const d = Math.abs(seg.target - seg.th);
      seg.wn = seg.target < seg.th ? 7 : Math.min(10, Math.max(6, 1.25 * Math.abs(seg.om) / Math.max(0.12, d)));
    }
    const d = seg.target - seg.th, wn = seg.wn;
    seg.om += (wn * wn * d - 2 * wn * seg.om) * dt;
    seg.om = Math.max(-seg.om0, Math.min(seg.om0, seg.om));
    seg.th += seg.om * dt;
    const left = seg.target - seg.th;
    if ((Math.abs(left) < 0.006 && Math.abs(seg.om) < 0.25) || (Math.sign(left) !== Math.sign(d) && Math.abs(left) < 0.02)) { seg.th = seg.target; seg.om = 0; this.apply(seg); this.close(); }
    else this.apply(seg);
  }
  nearestClean() {
    return this.local.angleTo(YAW180) < this.local.angleTo(_q.identity()) ? YAW180 : _q.identity();
  }
  open(f, s) {
    const kind = trickKind(f, s);
    this.seg = { f, s, kind, q0: this.local.clone(), th: 0, t: 0, om: 0, unit: kind === 'spin' ? Math.PI : TAU, w: kind === 'spin' ? TAU * 1.3 : kind === 'flip' ? TAU * 1.05 : TAU * 0.95, axis: new THREE.Vector3(), finishing: false };
    this.axisFor(this.seg);
  }
  upgrade(seg, f, s) { seg.f = f; seg.s = s; seg.kind = 'diag'; seg.unit = TAU; seg.w = TAU * 0.95; this.axisFor(seg); this.apply(seg); }
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
    // speed up to the speed this jump still has (a bit slower while grabbing), smoothly
    const top = seg.w * this.power * (this.grabbing ? 0.85 : 1);
    if (seg.om < top * 0.3) seg.om = Math.max(seg.om, top * 0.3);
    seg.om += (top - seg.om) * (1 - Math.exp(-(seg.om > top ? 5 : 10) * dt));
    seg.th += seg.om * dt;
    if (!this.lock && seg.th > seg.unit * 0.25) this.lock = { f: seg.f, s: seg.s };
    this.apply(seg);
  }
  apply(seg) { this.local.setFromAxisAngle(seg.axis, seg.th).multiply(seg.q0); }
  close() {
    const seg = this.seg; this.seg = null;
    if (!seg) return;
    const n = Math.floor(seg.th / seg.unit + 0.04);
    if (n <= 0) return;
    if (!this.lock) this.lock = { f: seg.f, s: seg.s };
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
    if (this.grabT >= 0.2) list.push({ f: 0, s: 0, kind: 'grab', n: 1, name: this.grabName, t: this.grabT });
    const names = list.filter(e => e.n > 0).map(e => e.kind === 'grab' ? e.name + (e.t > 1.2 ? ' (tweaked)' : '') : trickName(e.f, e.s, e.n));
    const liveName = seg ? trickName(seg.f, seg.s, Math.max(1, Math.floor(seg.th / seg.unit + 0.04) + (seg.finishing ? 0 : 1))) : null;
    const pts = list.reduce((a, e) => a + (e.kind === 'grab' ? Math.round(220 + Math.min(3, e.t) * 320) : trickPoints(e.f, e.s, e.n)), 0), done = list.filter(e => e.n > 0).length;
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
