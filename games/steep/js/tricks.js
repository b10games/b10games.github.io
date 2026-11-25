// Tricks in the air and what they are worth.
//
// Three turns can run at the same time, each with its own momentum:
//   spin (A / D)      around the skier's own up axis, finishes on a half turn (180, 360, 540 ...)
//   flip (W / S)      front or back around the hips, finishes on a whole turn
//   roll (Q / E)      a side flip around the skier's own forward axis, finishes on a whole turn
// Holding the key at the moment you let go of SPACE throws the trick with all the pop behind it;
// starting one later in the air works too, but it turns slower. Holding a key keeps the turn going,
// letting go lets it finish smoothly on the next clean half / whole turn (or turn back if it had
// barely started). SPACE in the air is a grab.
//
// What you see in the air = neutral (follows the flight) x local, local = spin * flip * roll.
import { THREE } from './engine.js';

const PI = Math.PI, TAU = PI * 2;
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();

export const GRABS = { mute: 'Mute', safety: 'Safety', japan: 'Japan', tail: 'Tail Grab', truck: 'Truck Driver' };

class Turn {
  constructor(unit, top, accel) { this.unit = unit; this.top = top; this.accel = accel; this.reset(); }
  reset() { this.th = 0; this.om = 0; this.dir = 0; this.held = false; this.fin = null; this.used = false; this.max = 0; }
  // dir: -1 / 0 / +1 held this frame; power: how much turning speed is left
  update(dt, dir, power, slow) {
    if (dir) {
      if (this.fin && this.dir && dir !== this.dir && Math.abs(this.th) > this.unit * 0.3) dir = 0;   // no reversing a started turn
    }
    if (dir) {
      this.fin = null; this.held = true; this.dir = dir; this.used = true;
      const top = this.top * power * slow;
      const want = dir * top;
      // speed up quickly to the top speed (from a standing start a bit slower)
      const a = this.accel * (Math.sign(this.om) === dir || !this.om ? 1 : 1.6);
      if (Math.abs(this.om) < top * 0.3 && Math.sign(this.om) !== -dir) this.om = dir * Math.max(Math.abs(this.om), top * 0.3);
      this.om += Math.sign(want - this.om) * Math.min(Math.abs(want - this.om), a * dt);
      this.th += this.om * dt;
    } else {
      this.held = false;
      if (this.om || this.th % this.unit) this.finish(dt);
    }
    this.max = Math.max(this.max, Math.abs(this.th));
  }
  // let go: come to rest exactly on a half / whole turn
  finish(dt) {
    if (!this.fin) {
      const u = this.unit, base = Math.floor(this.th / u), frac = this.th / u - base;
      // going on: finish to the next half / whole turn, unless it has barely passed the last one
      let k;
      if (this.om > 0.3) k = frac < 0.12 ? base : base + 1;
      else if (this.om < -0.3) k = frac > 0.88 ? base + 1 : base;
      else k = Math.round(this.th / u);
      const d = Math.abs(k * u - this.th);
      this.fin = { target: k * u, om0: Math.max(Math.abs(this.om), this.top * 0.35), wn: Math.min(10, Math.max(5.5, 1.3 * Math.abs(this.om) / Math.max(0.12, d))) };
    }
    const f = this.fin, d = f.target - this.th;
    this.om += (f.wn * f.wn * d - 2 * f.wn * this.om) * dt;
    this.om = Math.max(-f.om0, Math.min(f.om0, this.om));
    this.th += this.om * dt;
    if (Math.abs(f.target - this.th) < 0.004 && Math.abs(this.om) < 0.3) { this.th = f.target; this.om = 0; }
  }
  get count() { return Math.floor(Math.abs(this.th) / this.unit + 0.12); }     // finished half / whole turns
  get busy() { return this.held || Math.abs(this.om) > 0.05; }
}

export class Tricks {
  constructor() {
    this.local = new THREE.Quaternion();
    this.spin = new Turn(PI, TAU * 1.2, 26); this.flip = new Turn(TAU, TAU * 1.05, 22); this.roll = new Turn(TAU, TAU * 1.0, 20);
    this.reset();
  }
  reset() {
    this.spin.reset(); this.flip.reset(); this.roll.reset(); this.local.identity();
    this.airT = 0; this.power = 1; this.popped = false; this.pipe = false;
    this.grabT = 0; this.grabType = null; this.grabbing = false; this.grabs = []; this.maxH = 0;
  }
  // takeoff: pop = did you let go of SPACE (k = charge), keys = what you held at that moment
  start(pop, k, keys, pipe) {
    this.reset();
    this.popped = pop; this.pipe = pipe;
    this.power = pop ? 0.82 + 0.18 * k : 0.7;
    // the trick thrown with the pop starts at full speed
    if (pop) {
      if (keys.flip) { this.flip.om = keys.flip * this.flip.top * this.power; this.flip.dir = keys.flip; }
      if (keys.roll) { this.roll.om = keys.roll * this.roll.top * this.power; this.roll.dir = keys.roll; }
      if (keys.spin) { this.spin.om = keys.spin * this.spin.top * this.power * 0.8; this.spin.dir = keys.spin; }
    }
  }
  update(dt, keys) {
    this.airT += dt;
    // a trick started in the air (not thrown off the snow) turns slower
    const late = this.popped ? 1 : 0.75;
    this.spin.update(dt, keys.spin, this.power, (this.flip.busy || this.roll.busy ? 0.75 : 1) * (this.grabbing ? 0.85 : 1));
    this.flip.update(dt, keys.flip, this.power, late * (this.grabbing ? 0.85 : 1));
    this.roll.update(dt, keys.roll, this.power, late * 0.95);
    // grabs
    if (keys.grab && !this.grabbing) {
      this.grabbing = true; this.grabT = 0;
      this.grabType = this.flip.busy ? (this.flip.dir < 0 ? 'japan' : 'mute') : this.roll.busy ? 'safety' : this.spin.busy ? (this.grabs.length % 2 ? 'safety' : 'mute') : (this.airT > 0.6 && this.grabs.length ? 'truck' : ['mute', 'tail', 'safety', 'truck'][(this.grabs.length + Math.floor(this.airT * 3)) % 4]);
      this.grabs.push({ type: this.grabType, t: 0 });
    }
    if (!keys.grab) this.grabbing = false;
    if (this.grabbing) { this.grabT += dt; this.grabs[this.grabs.length - 1].t = this.grabT; }
    // the local rotation
    this.local.setFromAxisAngle(Y, this.spin.th);
    this.local.multiply(_q.setFromAxisAngle(X, this.flip.th));
    this.local.multiply(_q.setFromAxisAngle(Z, this.roll.th));
  }
  get rotating() { return this.spin.busy || this.flip.busy || this.roll.busy; }
  get rates() { return { spin: this.spin.om, flip: this.flip.om, roll: this.roll.om }; }

  // the name and points of what has been done so far in this jump
  current() {
    const s = this.spin.count, f = this.flip.count, r = this.roll.count;
    const deg = s * 180, sd = this.spin.th > 0 ? 'Left' : 'Right';
    const mult = (n) => n <= 1 ? '' : n <= 5 ? ['', '', 'Double ', 'Triple ', 'Quad ', 'Quint '][n] : n + 'x ';
    let name = '';
    if (f && r) name = mult(Math.max(f, r)) + 'Corkscrew' + (deg >= 180 ? ' ' + deg : '');
    else if (f && deg >= 360) name = mult(f) + (this.flip.th < 0 ? 'Rodeo ' : 'Misty ') + deg;
    else if (r && deg >= 360) name = mult(r) + 'Cork ' + deg;
    else if (f) name = mult(f) + (this.flip.th < 0 ? 'Backflip' : 'Frontflip') + (deg ? ' ' + deg : '');
    else if (r) name = mult(r) + 'Side Flip' + (deg ? ' ' + deg : '');
    else if (deg) name = (this.pipe && deg === 180 ? '' : sd + ' ') + deg;
    // the longest grab joins the name
    const g = this.grabs.filter(x => x.t > 0.18).sort((a, b) => b.t - a.t)[0];
    if (g) name = (name ? name + ' ' : '') + (g.t > 0.9 ? 'Tweaked ' : '') + GRABS[g.type];
    if (!name && this.airT > 1.0) name = this.pipe ? 'Air to Fakie' : 'Straight Air';
    // points
    let pts = 0;
    for (let i = 1; i <= s; i++) pts += 110 * (1 + 0.18 * (i - 1));
    for (let i = 1; i <= f; i++) pts += (this.flip.th < 0 ? 650 : 600) * (1 + 0.45 * (i - 1));
    for (let i = 1; i <= r; i++) pts += 720 * (1 + 0.45 * (i - 1));
    if ((f || r) && s >= 2) pts *= 1.3;
    if (f && r) pts *= 1.2;
    for (const x of this.grabs) if (x.t > 0.18) pts += 200 + Math.min(1.5, x.t) * 320 + (x.t > 0.9 ? 150 : 0);
    pts += Math.max(0, this.airT - 0.5) * 130;
    if (this.pipe) pts *= 1.2;
    if (!s && !f && !r && !g) pts = this.airT < 1.0 ? 0 : 100 + (this.airT - 1) * 120 + (this.pipe ? 60 : 0);
    return { name, points: Math.round(pts / 10) * 10, spin: deg, flips: f, rolls: r, grab: g ? g.type : null, air: this.airT };
  }
}
