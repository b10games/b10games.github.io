// How a rider moves: sliding down the snow, carving, braking, charging a jump (hold, then let go),
// flying, tricks, landing and the occasional wipeout.
//
// Snowboard and skis use the same controls, but they ride a little differently: skis grip harder and
// turn quicker, a snowboard slides more in a turn and pops a bit higher.
import { THREE, clamp, lerp, smooth, wrapAngle, dampAngle } from './engine.js';
import { Tricks } from './tricks.js';
import { Assist } from './assist.js';
import { BOUNDS } from './terrain.js';

export const G = 12;
// in the air gravity is softer: jumps hang longer and you fall more slowly
export const G_AIR = 7.6;
const GEAR = {
  board: { grip: 5.2, turn: [2.5, 1.2], pop: [3.4, 9.6], drag: 0.0088, carveKeep: 0.6 },
  skis: { grip: 6.6, turn: [2.8, 1.35], pop: [3.1, 9.0], drag: 0.0082, carveKeep: 0.66 }
};
const Y = new THREE.Vector3(0, 1, 0);
const _n = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _m = new THREE.Matrix4();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();

export class Rider3D {
  constructor(world, gear = 'board') {
    this.world = world; this.gear = gear;
    this.p = new THREE.Vector3(); this.v = new THREE.Vector3(); this.n = new THREE.Vector3(0, 1, 0);
    this.yaw = 0; this.state = 'ride'; this.grounded = true; this.switch = false;
    this.charge = 0; this.charging = false; this.coyote = 0; this.offT = 0;
    this.quat = new THREE.Quaternion();         // how the rider is turned (what you see)
    this.neutral = new THREE.Quaternion();      // in the air: follows the flight
    this.tricks = new Tricks(); this.assist = new Assist(world);
    this.events = [];                            // things that happened this frame (for sounds, effects and the screen)
    this.lean = 0; this.edge = 0; this.brake = 0; this.tuck = 0; this.landK = 0; this.bailT = 0; this.wob = 0;
    this.revertT = 0; this.speed = 0; this.airT = 0; this.topSpeed = 0; this.lastLand = null;
    this.assistLevel = 2;
  }
  setGear(g) { this.gear = g === 'skis' ? 'skis' : 'board'; }
  // put the rider somewhere, facing downhill
  spawn(x, z, yaw = null) {
    this.p.set(x, this.world.height(x, z), z);
    this.world.normal(x, z, this.n);
    this.yaw = yaw ?? Math.atan2(this.n.x, this.n.z);          // downhill
    this.v.set(0, 0, 0); this.state = 'ride'; this.grounded = true; this.switch = false; this.charge = 0; this.charging = false;
    this.tricks.reset(); this.bailT = 0; this.landK = 0;
    this.groundQuat(this.quat);
  }
  get speedKmh() { return this.speed * 3.6; }
  emit(type, d) { this.events.push({ type, ...d }); }

  // input: { fwd: -1..1, steer: -1..1 (right +), jump: held?, flip: -1/0/1, spin: -1/0/1 }
  update(dt, inp) {
    this.events.length = 0;
    if (this.state === 'lift' || this.state === 'frozen') return;
    const steps = dt > 1 / 70 ? 2 : 1, h = dt / steps;
    for (let i = 0; i < steps; i++) this.step(h, inp, i === steps - 1);
    this.speed = this.v.length();
    if (this.speed > this.topSpeed) this.topSpeed = this.speed;
  }
  step(dt, inp, last) {
    if (this.state === 'bail') this.bailStep(dt);
    else if (this.grounded) this.groundStep(dt, inp);
    else this.airStep(dt, inp);
    this.collide();
    this.bounds();
    if (last) this.visual(dt, inp);
  }

  // ---------- on the snow ----------
  groundStep(dt, inp) {
    const W = this.world, g = GEAR[this.gear], n = W.rideNormal(this.p.x, this.p.z, this.v.x, this.v.z, this.n);
    let speed = this.v.length();
    const braking = inp.fwd < -0.2 && speed > 1.2, tucking = inp.fwd > 0.2;
    // steering: quick when slow; when fast the turn is limited by how hard the edges can hold (about 1.4 g)
    const rate = Math.min(lerp(g.turn[0], g.turn[1], smooth(3, 28, speed)), Math.max(0.62, 17 / Math.max(1, speed)));
    this.yaw -= inp.steer * rate * dt;
    // the heading slowly follows where you actually slide (after a bump or a landing)
    if (speed > 2.5 && Math.abs(inp.steer) < 0.3) { const vy = Math.atan2(this.v.x, this.v.z); if (Math.abs(wrapAngle(vy - this.yaw)) < 1.3) this.yaw = dampAngle(this.yaw, vy, 0.6, dt); }
    this.heading(_f);
    // gravity along the slope
    _a.set(0, -G, 0); _a.addScaledVector(n, -_a.dot(n));
    this.v.addScaledVector(_a, dt);
    // the edges grip: the slide turns towards the heading. Sliding sideways (skidding) costs speed,
    // a clean carve almost none. Speed is never created here.
    speed = this.v.length();
    if (speed > 0.05) {
      let vf = this.v.dot(_f);
      _r.copy(this.v).addScaledVector(_f, -vf);
      const side = _r.length(), slip = side / speed;                      // sin of the slide angle
      const grip = g.grip * (braking ? 0.3 : 1), k = 1 - Math.exp(-grip * dt);
      // turn the velocity towards the heading (or straight backwards when riding backwards)
      const dirSign = vf >= 0 ? 1 : -1;
      _b.copy(_f).multiplyScalar(dirSign * speed);
      this.v.lerp(_b, k).setLength(speed);
      const loss = slip * (this.gear === 'board' ? 1.1 : 0.8) * (1 - g.carveKeep * 0.6) * speed;
      this.v.setLength(Math.max(0, speed - loss * dt * 1.6));
    }
    // snow friction, air drag, braking, pushing off when slow
    speed = this.v.length();
    let dec = 0.035 * G * n.y + g.drag * speed * speed * (tucking ? 0.62 : 1);
    if (braking) dec += 8.5;
    if (speed > 1e-4) this.v.multiplyScalar(Math.max(0, speed - dec * dt) / speed);
    this._pushing = tucking && speed < 7.5;
    if (this._pushing) this.v.addScaledVector(_f, 3.4 * inp.fwd * dt);
    if (inp.fwd < -0.2 && speed < 1.2) this.v.copy(_f).multiplyScalar(-1.4);   // shuffle backwards
    this.brake = lerp(this.brake, braking ? 1 : 0, 1 - Math.exp(-10 * dt));
    this.tuck = lerp(this.tuck, tucking && speed > 7 ? 1 : 0, 1 - Math.exp(-6 * dt));
    this.lean = lerp(this.lean, clamp(inp.steer * smooth(1, 14, speed), -1, 1), 1 - Math.exp(-7 * dt));
    if (braking && speed > 4) this.emit('spray', { k: Math.min(1, speed / 18) * 1.4 });
    else if (Math.abs(inp.steer) > 0.4 && speed > 8) this.emit('spray', { k: Math.abs(inp.steer) * Math.min(1, speed / 25) * 0.6 });

    // charging a jump: hold, then let go
    if (inp.jump) { this.charging = true; this.charge = Math.min(1, this.charge + dt / 0.85); }
    else if (this.charging) { this.jump(); return; }

    // move and stay on the snow, or fly off a lip
    this.p.addScaledVector(this.v, dt);
    const hgt = W.height(this.p.x, this.p.z), gap = this.p.y - hgt;
    W.rideNormal(this.p.x, this.p.z, this.v.x, this.v.z, _n);
    // leave the snow when it drops away faster than gravity could pull you down onto it
    // (the lip of a kicker, a cliff, the top of a bump at speed)
    const vyGround = -(this.v.x * _n.x + this.v.z * _n.z) / Math.max(0.2, _n.y);
    const need = (this.v.y - vyGround) / dt;
    // only a sharp edge throws you off (a lip, a cliff, a ridge); over smooth rolls you stay on the snow
    let sharp = false;
    if (gap > 0.004 && need > G * 1.65 && speed > 3) {
      const l = Math.hypot(this.v.x, this.v.z) || 1, ax = this.p.x + this.v.x / l * 2.5, az = this.p.z + this.v.z / l * 2.5;
      W.normal(ax, az, _b);
      // the snow 2.5 m ahead turns away a lot, or drops well below the line you are sliding on
      sharp = _b.angleTo(_n) > 0.3 || W.height(ax, az) < hgt + (this.v.y / l) * 2.5 - 0.7;
    }
    if (gap > 0.35 || sharp) { this.takeoff(false); return; }
    this.p.y = hgt;
    const into = this.v.dot(_n);
    this.v.addScaledVector(_n, -into);
    if (this.switch) { this.revertT += dt; }
  }
  heading(out) {
    out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    out.addScaledVector(this.n, -out.dot(this.n)).normalize();
    return out;
  }
  jump() {
    const g = GEAR[this.gear], k = this.charge;
    const pop = lerp(g.pop[0], g.pop[1], k * k * 0.4 + k * 0.6);
    this.v.addScaledVector(this.n, pop * 0.75).y += pop * 0.35;
    this.charging = false; this.charge = 0;
    this.emit('jump', { k });
    this.takeoff(true);
  }
  takeoff(popped) {
    this.grounded = false; this.airT = 0; this.coyote = popped ? 0 : 0.16;
    this.p.y += 0.02;
    // the rotation on the snow becomes the start of the rotation in the air
    this.groundQuat(_q);
    this.airNeutral(this.neutral, 0);
    _q2.copy(this.neutral).invert().multiply(_q);
    this.tricks.start(_q2);
    this.assist.takeoff();
    this.emit('takeoff', { popped });
  }

  // ---------- in the air ----------
  airStep(dt, inp) {
    const W = this.world;
    this.airT += dt;
    // a jump can still be popped just after rolling off a lip
    if (this.coyote > 0) {
      this.coyote -= dt;
      if (inp.jump) { this.charging = true; this.charge = Math.min(1, this.charge + dt / 0.85); }
      else if (this.charging) { const g = GEAR[this.gear], k = this.charge; this.v.y += lerp(g.pop[0], g.pop[1], k) * 0.8; this.charging = false; this.charge = 0; this.emit('jump', { k }); }
    } else { this.charging = false; this.charge = 0; }
    this.v.y -= G_AIR * dt;
    const sp = this.v.length(); this.v.multiplyScalar(1 - 0.0016 * sp * dt);
    this.assist.update(dt, this.assistLevel, this.p, this.v);
    this.p.addScaledVector(this.v, dt);
    // tricks
    const relax = this.tricks.rotating ? 0 : 2.4 + this.assist.alignRate(this.assistLevel, false);
    this.tricks.update(dt, inp.flip, inp.spin, relax);
    const h = W.height(this.p.x, this.p.z);
    if (this.p.y <= h) { this.p.y = h; this.land(dt); }
  }
  // the neutral air rotation: facing the flight direction, nose a bit up or down with the flight
  airNeutral(out, k = 1) {
    const hz = Math.hypot(this.v.x, this.v.z);
    const yaw = hz > 0.5 ? Math.atan2(this.v.x, this.v.z) + (this.switch ? Math.PI : 0) : this.yaw + (this.switch ? Math.PI : 0);
    const pitch = clamp(Math.atan2(-this.v.y, Math.max(1, hz)) * 0.55 * k, -0.6, 0.7);
    _q3.setFromAxisAngle(Y, yaw);
    out.setFromAxisAngle(_a.set(1, 0, 0), pitch).premultiply(_q3);
    return out;
  }
  land(dt) {
    const W = this.world, n = W.normal(this.p.x, this.p.z, this.n);
    const into = -this.v.dot(n);
    _a.copy(this.v).addScaledVector(n, -this.v.dot(n));
    const travel = _a.lengthSq() > 0.01 ? _a.clone().normalize() : this.heading(new THREE.Vector3());
    const res = this.tricks.land(this.quat, n, travel, this.assistLevel);
    // where you land matters too: a flat bottom far below hurts, rock or a cliff face is a wipeout
    if (into > 30 || n.y < 0.45) { res.quality = 'crash'; res.total = 0; }
    else if ((into > 19 || n.y < 0.6) && (res.quality === 'clean' || res.quality === 'perfect')) { res.quality = 'sketchy'; res.total = Math.round(res.total * 0.5); res.hard = true; }
    // keep the speed along the snow, lose a bit on hard landings
    this.v.copy(_a).multiplyScalar(1 - Math.min(0.3, Math.max(0, into - 6) / 70));
    this.grounded = true; this.coyote = 0;
    this.yaw = Math.atan2(this.v.x, this.v.z);
    this.switch = res.switch && res.quality !== 'crash'; this.revertT = 0;
    this.landK = Math.min(1, 0.35 + into / 18);
    this.lastLand = res;
    this.emit('land', { ...res, into });
    if (res.quality === 'crash') this.bail(into);
    else if (res.quality === 'sketchy') this.wob = 1;
  }

  // ---------- wipeouts ----------
  bail(hard = 10) {
    if (this.state === 'bail') return;
    this.state = 'bail'; this.bailT = 0; this.grounded = true; this.charge = 0; this.charging = false;
    this.tricks.reset();
    this.emit('bail', { hard });
  }
  bailStep(dt) {
    const W = this.world;
    this.bailT += dt;
    const n = W.normal(this.p.x, this.p.z, this.n);
    _a.set(0, -G, 0); _a.addScaledVector(n, -_a.dot(n)); this.v.addScaledVector(_a, dt * 0.5);
    const sp = this.v.length(); if (sp > 1e-4) this.v.multiplyScalar(Math.max(0, sp - 7 * dt) / sp);
    this.p.addScaledVector(this.v, dt);
    const h = W.height(this.p.x, this.p.z); if (this.p.y < h + 0.5) { this.p.y = h; this.v.addScaledVector(n, -this.v.dot(n)); }
    else this.v.y -= G * dt;
    if (this.bailT > 1.7) {
      // back on your feet, facing downhill
      this.state = 'ride'; this.p.y = h; this.switch = false;
      this.yaw = Math.atan2(n.x, n.z); this.v.multiplyScalar(0.3);
      this.emit('recover', {});
    }
  }

  // ---------- trees, rocks, cabins, the edge of the world ----------
  collide() {
    const W = this.world, near = W.solidsNear(this.p.x, this.p.z, this._near || (this._near = []));
    const ground = W.terrain(this.p.x, this.p.z), above = this.p.y - ground;
    for (const o of near) {
      const top = o.kind === 'tree' ? 7 * (o.r / 0.9) : o.kind === 'rock' ? o.r * 0.9 : o.kind === 'cabin' ? 7 : 4;
      if (above > top) continue;
      const dx = this.p.x - o.x, dz = this.p.z - o.z, d = Math.hypot(dx, dz), min = o.r + 0.35;
      if (d >= min || d < 1e-4) continue;
      const nx = dx / d, nz = dz / d, vin = -(this.v.x * nx + this.v.z * nz);
      this.p.x = o.x + nx * min; this.p.z = o.z + nz * min;
      if (vin > 0) {
        this.v.x += nx * vin * 1.3; this.v.z += nz * vin * 1.3;
        if (vin > 9 && this.state !== 'bail') { this.v.multiplyScalar(0.35); if (!this.grounded) { this.grounded = true; this.tricks.reset(); } this.bail(vin); this.emit('hit', { kind: o.kind }); }
      }
    }
  }
  bounds() {
    const p = this.p, v = this.v;
    if (p.x > BOUNDS.x) { p.x = BOUNDS.x; v.x = Math.min(0, v.x); } if (p.x < -BOUNDS.x) { p.x = -BOUNDS.x; v.x = Math.max(0, v.x); }
    if (p.z < BOUNDS.z0) { p.z = BOUNDS.z0; v.z = Math.max(0, v.z); } if (p.z > BOUNDS.z1) { p.z = BOUNDS.z1; v.z = Math.min(0, v.z); }
  }

  // ---------- what you see ----------
  // on the snow: up is the snow's normal, forward is the heading; leaning into turns, sideways when braking
  groundQuat(out) {
    const n = this.n;
    this.heading(_f);
    _r.crossVectors(n, _f).normalize();                     // left
    _m.makeBasis(_r, n, _f); out.setFromRotationMatrix(_m);
    const roll = this.lean * (this.gear === 'board' ? 0.42 : 0.32) * smooth(1, 10, this.speed);
    out.multiply(_q2.setFromAxisAngle(_b.set(0, 0, 1), roll));
    const skid = this.brake * (this.gear === 'board' ? 1.25 : 1.05) * (this.lean >= 0 ? 1 : -1);
    if (skid) out.multiply(_q2.setFromAxisAngle(Y, skid));
    if (this.switch) out.multiply(_q2.setFromAxisAngle(Y, Math.PI));
    return out;
  }
  visual(dt, inp) {
    if (this.state === 'bail') {
      // tumbling, then lying in the snow
      this.groundQuat(_q);
      const k = Math.min(1, this.bailT / 0.6), spin = (1 - k) * this.bailT * 9;
      _q.multiply(_q2.setFromAxisAngle(_a.set(0, 0, 1), spin + k * 1.3));
      this.quat.slerp(_q, 1 - Math.exp(-12 * dt));
      this.pivot = 0;
    } else if (this.grounded) {
      // a switch landing turns around again after a moment
      if (this.switch && this.revertT > 0.9) { this.switch = false; this.emit('revert', {}); }
      this.groundQuat(_q);
      this.quat.slerp(_q, 1 - Math.exp(-16 * dt));
      this.pivot = Math.max(0, (this.pivot || 0) - dt * 6);
    } else {
      this.airNeutral(this.neutral);
      // the landing assist straightens you up just before you touch down
      const ar = this.assist.alignRate(this.assistLevel, this.tricks.rotating);
      if (ar > 0) {
        const tgt = this.tricks.nearestClean(), ang = this.tricks.local.angleTo(tgt);
        if (ang < this.assist.alignMax(this.assistLevel)) this.tricks.local.slerp(tgt, 1 - Math.exp(-ar * dt));
      }
      this.quat.copy(this.neutral).multiply(this.tricks.local);
      this.pivot = Math.min(1, (this.pivot || 0) + dt * 6);
    }
    this.landK = Math.max(0, this.landK - dt * 2.4);
    this.wob = Math.max(0, this.wob - dt * 1.4);
    // turning edge for the snowboard: toes when turning right (we stand left foot forward), heels when turning left
    this.edge = this.lean;
  }
  // pose numbers for the animated body
  poseInto(P) {
    const air = !this.grounded && this.state !== 'bail';
    P.crouch = 0.3 + this.tuck * 0.3 + (this.brake * 0.15);
    P.charge = this.charge; P.edge = this.edge; P.lean = this.lean; P.tuck = this.tuck; P.brake = this.brake;
    P.air = air ? Math.min(1, this.airT * 4) : 0;
    P.flip = air && this.tricks.rotating ? 1 : Math.max(0, (P.flip || 0) - 0.08);
    P.land = this.landK; P.bail = this.state === 'bail' ? 1 : 0; P.wobble = this.wob; P.speed = this.speed;
    P.push = this.grounded && this.speed < 7.5 && this._pushing ? 1 : 0;
  }
}
