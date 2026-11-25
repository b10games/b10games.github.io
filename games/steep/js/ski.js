// How the skier moves.
//
// On the snow: gravity pulls you down the fall line, the edges grip and turn your slide towards where
// the skis point (a clean carve keeps your speed, a sharp skidded turn costs speed), snow friction and
// air drag slow you, deep powder slows you more. W pushes with the poles when slow and tucks when fast,
// S brakes (a snowplough when slow, a hockey stop when fast) and, when stopped, pushes you backwards
// (you can ride switch, the skis are twin tips). A / D turn.
//
// SPACE: hold to charge (you sink low), let go to jump. Holding W / S as you let go throws a front /
// back flip, Q / E a side flip, A / D starts the spin. In the air A / D spin, W / S flip, Q / E roll,
// SPACE grabs. The landing is judged on how you meet the snow (see land()).
//
// In the halfpipe the jump off a wall goes straight up (the sideways part of the speed is taken out),
// so you come back down into the pipe.
import { THREE, clamp, lerp, smooth, wrapAngle, dampAngle } from './engine.js';
import { Tricks } from './tricks.js';
import { Assist } from './assist.js';
import { BOUNDS, powderAt, parkUV, PIPE, PIPE_W, runsAt, PARK, PARK_KICKERS, terrain } from './terrain.js';
import { RAILS } from './places.js';

export const G = 11.5;          // on the snow (a bit more than real: snappier)
export const G_AIR = 9.4;       // in the air (keep assist.js the same)
const G_AIR_K = 9.4;
const Y = new THREE.Vector3(0, 1, 0);
const _n = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _m = new THREE.Matrix4();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _u = new THREE.Vector3();

// ---------- the speed each park kicker is built for ----------
// found by flying it at many speeds (with a medium pop) and keeping the one that lands on the sweet spot;
// with the landing help on, the snow before a kicker brings you to that speed (a speed check)
function parkPoint(u) {
  const P = PARK.P, S = PARK.S; let i = 0; while (i < S.length - 2 && S[i + 1] < u) i++;
  const k = clamp((u - S[i]) / (S[i + 1] - S[i]), 0, 1), x = P[i][0] + (P[i + 1][0] - P[i][0]) * k, z = P[i][1] + (P[i + 1][1] - P[i][1]) * k;
  return { x, z, y: terrain(x, z) };
}
for (const k of PARK_KICKERS) {
  const lip = parkPoint(k.u - 0.05), pre = parkPoint(k.u - 0.9), dx = lip.x - pre.x, dz = lip.z - pre.z, l = Math.hypot(dx, dz), fx = dx / l, fz = dz / l;
  const ang = Math.atan2(lip.y - pre.y, l), want = k.u + k.deck + k.land * 0.42, pop = lerp(2.6, 6.3, Math.pow(0.5, 0.85));
  let best = null;
  for (let S = 6; S <= 26; S += 0.25) {
    let px = lip.x, py = lip.y + 0.02, pz = lip.z, vh = S * Math.cos(ang) - Math.sin(ang) * pop * 0.8, vy = S * Math.sin(ang) + Math.cos(ang) * pop * 0.8 + pop * 0.25;
    const dt = 1 / 60;
    for (let t = 0; t < 6; t += dt) { vy -= G_AIR_K * dt; px += fx * vh * dt; pz += fz * vh * dt; py += vy * dt; if (py <= terrain(px, pz)) break; }
    const u = k.u + ((px - lip.x) * fx + (pz - lip.z) * fz), d = Math.abs(u - want);
    if (!best || d < best.d) best = { d, S };
  }
  k.ideal = best.S;
}

export class Ski {
  constructor(world) {
    this.world = world;
    this.p = new THREE.Vector3(); this.v = new THREE.Vector3(); this.n = new THREE.Vector3(0, 1, 0);
    this.quat = new THREE.Quaternion(); this.neutral = new THREE.Quaternion();
    this.tricks = new Tricks(); this.assist = new Assist(world); this.assistLevel = 1;
    this.events = [];
    this.safe = new THREE.Vector3(); this.safeYaw = 0; this.safeT = 0;
    this.spawn(0, 0, 0);
  }
  spawn(x, z, yaw = null) {
    const W = this.world;
    this.p.set(x, W.height(x, z), z); W.normal(x, z, this.n);
    this.yaw = yaw ?? Math.atan2(this.n.x, this.n.z);
    this.v.set(0, 0, 0); this.state = 'ride'; this.grounded = true; this.sw = false;
    this.charge = 0; this.charging = false; this.coyote = 0; this.airT = 0; this.takeoffT = 9;
    this.brake = 0; this.plow = 0; this.tuck = 0; this.push = 0; this.skid = 0; this.skidSide = 1; this.incl = 0; this.wob = 0; this.backseat = 0;
    this.fallT = 0; this.fallPhase = null; this.lying = 0; this.getUp = 0; this.fallK = 0; this.tumble = 0;
    this.grind = null; this.grindCool = 0; this.pipeAir = null; this.idleT = 0; this.speed = 0; this.travelYaw = this.yaw;
    this.lastSteer = 0; this.steerT = 0; this.pivot = 0; this.prevVy = null; this.landT = 9; this.inPowder = 0;
    this.tricks.reset(); this.assist.reset();
    this.safe.copy(this.p); this.safeYaw = this.yaw;
    this.groundQuat(this.quat);
  }
  emit(type, d = {}) { this.events.push({ type, ...d }); }
  get kmh() { return this.speed * 3.6; }

  // inp: { fwd: -1..1 (W +), steer: -1..1 (D +), jump: held, flip: -1/0/1 (W +), roll: -1/0/1 (E +), spin: -1/0/1 (A +), grab }
  update(dt, inp) {
    this.events.length = 0;
    if (this.state === 'frozen') return;
    const steps = Math.min(4, Math.ceil(dt / (1 / 90))), h = dt / steps;
    for (let i = 0; i < steps; i++) this.step(h, inp, i === steps - 1);
    this.speed = this.v.length();
    this.grindCool = Math.max(0, this.grindCool - dt);
    this.updateGrab(dt);
  }
  step(dt, inp, last) {
    if (this.state === 'fall') this.fallStep(dt);
    else if (this.state === 'grind') this.grindStep(dt, inp);
    else if (this.grounded) this.groundStep(dt, inp);
    else this.airStep(dt, inp);
    if (this.state === 'ride') this.checkRails();
    if (this.state !== 'grind') this.collide();
    this.bounds();
    if (last) this.visual(dt, inp);
  }

  // ---------- on the snow ----------
  heading(out) {
    out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    out.addScaledVector(this.n, -out.dot(this.n)).normalize();
    return out;
  }
  groundStep(dt, inp) {
    const W = this.world, n = W.rideNormal(this.p.x, this.p.z, this.v.x, this.v.z, this.n);
    this.landT += dt;
    let speed = this.v.length();
    this.heading(_f);
    let vf = this.v.dot(_f);
    // riding backwards (switch)? decided by which way you are sliding
    if (speed > 0.8) this.sw = vf < 0;
    const dir = this.sw ? -1 : 1;
    // which way the keys push you: W towards where you face, S the other way
    const want = inp.fwd * dir;                      // + = faster in the direction of travel, - = slow down
    const braking = want < -0.2 && speed > 0.9, going = want > 0.2;
    // powder: deep snow slows you down and lets you sink in
    const pw = powderAt(this.p.x, this.p.z) && !this.onRun() ? 1 : 0;
    this.inPowder = lerp(this.inPowder, pw, 1 - Math.exp(-3 * dt));
    // steering: quick when slow, at speed as much as the edges can hold
    const rate = Math.min(lerp(2.7, 1.35, smooth(3, 26, speed)), Math.max(0.65, 18 / Math.max(1, speed))) * (1 - this.inPowder * 0.25);
    const steer = inp.steer * (braking && speed > 5 ? 0.5 : 1);
    this.yaw -= steer * rate * dt;
    if (Math.sign(inp.steer) !== Math.sign(this.lastSteer) && Math.abs(inp.steer) > 0.5 && speed > 4 && speed < 17 && this.steerT > 0.35) { this.emit('turnStart', { side: inp.steer > 0 ? -1 : 1 }); this.steerT = 0; }
    if (Math.abs(inp.steer) > 0.5) this.lastSteer = inp.steer;
    this.steerT += dt;
    // with no keys the skis slowly follow the slide (after a bump or a landing)
    if (speed > 2.5 && Math.abs(inp.steer) < 0.3) { const ty = Math.atan2(this.v.x, this.v.z) + (this.sw ? Math.PI : 0); if (Math.abs(wrapAngle(ty - this.yaw)) < 1.2) this.yaw = dampAngle(this.yaw, ty, 0.7, dt); }
    this.heading(_f);
    // gravity along the slope
    _a.set(0, -G, 0); _a.addScaledVector(n, -_a.dot(n));
    this.v.addScaledVector(_a, dt);
    // the edges grip: the slide turns towards the skis; sliding sideways costs speed
    speed = this.v.length();
    if (speed > 0.05) {
      vf = this.v.dot(_f);
      _r.copy(this.v).addScaledVector(_f, -vf);
      const slip = _r.length() / speed;
      const grip = 6.4 * (braking ? 0.25 : 1) * (1 - this.inPowder * 0.35), k = 1 - Math.exp(-grip * dt);
      _b.copy(_f).multiplyScalar((vf >= 0 ? 1 : -1) * speed);
      this.v.lerp(_b, k).setLength(speed);
      // a skidded turn scrubs speed (a carve hardly any)
      this.v.setLength(Math.max(0, speed - slip * speed * 0.55 * dt * 1.6));
    }
    // friction, drag, tuck, braking, pushing
    speed = this.v.length();
    const tucking = going && speed > 7, charging = inp.jump;
    const drag = 0.0058 * (tucking ? 0.62 : charging ? 0.75 : 1) + this.inPowder * 0.006;
    let dec = (0.045 + this.inPowder * 0.07) * G * n.y + drag * speed * speed;
    if (braking) dec += speed > 4 ? 8.5 : 3.2;
    if (speed > 1e-4) this.v.multiplyScalar(Math.max(0, speed - dec * dt) / speed);
    // pushing with the poles when slow (W forward, S backwards)
    const pushing = Math.abs(inp.fwd) > 0.2 && speed < 6.5 && !braking && !charging;
    if (pushing) this.v.addScaledVector(_f, 3.4 * Math.sign(inp.fwd) * dt);
    // standing still: S starts you moving backwards
    if (inp.fwd < -0.2 && speed < 0.9 && !charging) { this.v.addScaledVector(_f, -2.6 * dt); }
    // the park's speed check before every kicker (with the landing help on)
    let check = 0;
    if (this.assistLevel > 0 && speed > 3) {
      const h = parkUV(this.p.x, this.p.z);
      if (h) for (const k of PARK_KICKERS) {
        const a = k.u - k.len;
        if (h.u > a - 60 && h.u < a + 1 && Math.abs(h.v) < k.wide + 3) {
          const sp = this.v.length(), tgt = k.ideal;
          if (sp > tgt + 0.3) { const d = Math.min(sp - tgt, (2.4 + this.assistLevel * 1.1) * dt); this.v.multiplyScalar((sp - d) / sp); check = clamp((sp - tgt) / 4, 0, 1); }
          else if (sp < tgt - 1.2) this.v.multiplyScalar(Math.min(tgt, sp + 1.3 * dt) / sp);
        }
      }
    }
    this.check = lerp(this.check || 0, check, 1 - Math.exp(-6 * dt));
    if (this.check > 0.15 && Math.random() < 0.5) this.emit('spray', { k: this.check * 0.8, side: this.skidSide });
    this.push = lerp(this.push, pushing ? 1 : 0, 1 - Math.exp(-8 * dt));
    this.tuck = lerp(this.tuck, tucking ? 1 : 0, 1 - Math.exp(-6 * dt));
    // braking: hockey stop (skis across, spraying) when fast, snowplough when slow
    this.brake = lerp(this.brake, braking && speed > 4 ? 1 : 0, 1 - Math.exp(-9 * dt));
    this.plow = lerp(this.plow, braking && speed <= 4 ? 1 : 0, 1 - Math.exp(-7 * dt));
    if (braking && speed > 4 && this.brake < 0.2) this.skidSide = inp.steer > 0.2 ? -1 : inp.steer < -0.2 ? 1 : (this.incl >= 0 ? 1 : -1);
    if (braking && speed > 4) this.emit('spray', { k: Math.min(1.4, speed / 14), side: this.skidSide });
    else if (Math.abs(inp.steer) > 0.4 && speed > 9) this.emit('spray', { k: Math.abs(inp.steer) * Math.min(1, speed / 24) * 0.6, side: inp.steer > 0 ? 1 : -1, carve: true });
    if (this.inPowder > 0.5 && speed > 5) this.emit('powder', { k: Math.min(1, speed / 20) });

    // charging a jump: hold, let go
    if (inp.jump) { this.charging = true; this.charge = Math.min(1, this.charge + dt / 0.8); }
    else if (this.charging) { this.jump(inp); return; }

    // move, and stay on the snow or fly off a lip
    this.p.addScaledVector(this.v, dt);
    const hgt = W.height(this.p.x, this.p.z), gap = this.p.y - hgt;
    W.rideNormal(this.p.x, this.p.z, this.v.x, this.v.z, _n);
    const vyGround = -(this.v.x * _n.x + this.v.z * _n.z) / Math.max(0.2, _n.y);
    const need = (this.v.y - vyGround) / dt;
    let sharp = false;
    if (gap > 0.004 && need > G * 1.6 && speed > 3) {
      const l = Math.hypot(this.v.x, this.v.z) || 1, ax = this.p.x + this.v.x / l * 2.2, az = this.p.z + this.v.z / l * 2.2;
      W.normal(ax, az, _b);
      sharp = _b.angleTo(_n) > 0.28 || W.height(ax, az) < hgt + (this.v.y / l) * 2.2 - 0.6;
    }
    if (gap > 0.35 || sharp) { this.takeoff(false, inp); return; }
    this.p.y = hgt;
    this.v.addScaledVector(_n, -this.v.dot(_n));
    // bumps: the snow curving up under you pushes the knees up
    if (this.prevVy !== null) { const dv = (this.v.y - this.prevVy) / dt; if (dv > 9 && speed > 6) this.emit('bump', { k: Math.min(2.2, (dv - 9) * 0.03) }); }
    this.prevVy = this.v.y;
    // the inclination into a turn: tan = v * turn rate / g
    const ty = Math.atan2(this.v.x, this.v.z), yr = speed > 1 ? wrapAngle(ty - this.travelYaw) / dt : 0; this.travelYaw = ty;
    const target = speed > 1.5 ? clamp(Math.atan(speed * clamp(yr, -3, 3) / 9.8) * (this.sw ? 0.6 : 1), -0.85, 0.85) : 0;
    this.incl = lerp(this.incl, target, 1 - Math.exp(-6 * dt));
    // remember a safe spot to come back to after a bad fall
    this.safeT += dt;
    if (this.safeT > 0.8 && speed > 1.5 && n.y > 0.8 && this.wob < 0.2) { this.safeT = 0; this.safe.copy(this.p); this.safeYaw = Math.atan2(this.v.x, this.v.z); }
    // stopped
    this.idleT = speed < 0.35 && !inp.jump && !Math.abs(inp.fwd) && !Math.abs(inp.steer) ? this.idleT + dt : 0;
  }
  onRun() { for (const h of runsAt(this.p.x, this.p.z)) if (Math.abs(h.v) < h.run.w + 4 && h.u > 0 && h.u < h.run.len) return true; return false; }

  jump(inp) {
    const k = this.charge;
    const pop = lerp(2.6, 6.3, Math.pow(k, 0.85));
    this.v.addScaledVector(this.n, pop * 0.8); this.v.y += pop * 0.25;
    this.charging = false; this.charge = 0;
    this.emit('jump', { k });
    this.takeoff(true, inp, k);
  }
  takeoff(popped, inp, k = 0) {
    this.grounded = false; this.airT = 0; this.takeoffT = 0; this.coyote = popped ? 0 : 0.15; this.prevVy = null;
    this.p.y += 0.02;
    this.pipeAir = null;
    // off a halfpipe wall: straight up, and the air frame stays the one you left the wall with
    const h = parkUV(this.p.x, this.p.z);
    if (h && h.u > PIPE.a - 5 && h.u < PIPE.b + 5 && Math.abs(h.v) > PIPE.half + 1.5 && Math.abs(h.v) < PIPE_W + 1.2) {
      const side = Math.sign(h.v), cx = -h.dz * side, cz = h.dx * side;    // across the pipe, out towards this wall
      const out = this.v.x * cx + this.v.z * cz;
      this.v.x -= cx * (out + 0.9); this.v.z -= cz * (out + 0.9);
      this.pipeAir = { up: this.n.clone() };
      if (this.v.y < 2.5) this.pipeAir = null;
    }
    this.groundQuat(_q);
    this.airNeutral(this.neutral, 0, _q);
    _q2.copy(this.neutral).invert().multiply(_q);
    // the rotation you had on the snow is where the tricks start from (it is not a trick)
    this.tricks.start(popped, k, { flip: inp.flip, roll: inp.roll, spin: inp.spin }, !!this.pipeAir);
    this.base = _q2.clone();
    this.assist.takeoff();
    this.emit('takeoff', { popped, k, pipe: !!this.pipeAir });
  }

  // ---------- in the air ----------
  airStep(dt, inp) {
    const W = this.world;
    this.airT += dt; this.takeoffT += dt;
    // a jump can still be popped just after rolling off a lip
    if (this.coyote > 0) {
      this.coyote -= dt;
      if (inp.jump) { this.charging = true; this.charge = Math.min(1, this.charge + dt / 0.8); }
      else if (this.charging) {
        const k = this.charge; this.v.y += lerp(2.2, 5.2, k); this.charging = false; this.charge = 0; this.takeoffT = 0;
        this.tricks.start(true, k, { flip: inp.flip, roll: inp.roll, spin: inp.spin }, !!this.pipeAir);
        this.emit('jump', { k, late: true });
      }
    } else { this.charging = false; this.charge = 0; }
    const grab = inp.jump && this.coyote <= 0 && !this.charging;
    if (grab && !this.tricks.grabbing) this.emit('grab', {});
    this.tricks.update(dt, { spin: inp.spin, flip: inp.flip, roll: inp.roll, grab });
    this.v.y -= G_AIR * dt;
    const sp = this.v.length(); this.v.multiplyScalar(1 - 0.0014 * sp * dt);
    if (!this.pipeAir) this.assist.update(dt, this.assistLevel, this.p, this.v);
    this.p.addScaledVector(this.v, dt);
    const h = W.height(this.p.x, this.p.z);
    if (this.p.y <= h) { this.p.y = h; this.land(); }
  }
  // the air frame without tricks: facing the flight, the nose following it up and down; in the
  // halfpipe the frame you left the wall with
  airNeutral(out, k = 1, ground = null) {
    if (this.pipeAir) {
      if (ground) out.copy(ground); else out.copy(this.neutral);
      return out;
    }
    const hz = Math.hypot(this.v.x, this.v.z);
    const yaw = (hz > 0.5 ? Math.atan2(this.v.x, this.v.z) : this.yaw) + (this.sw ? Math.PI : 0);
    let pitch = clamp(Math.atan2(-this.v.y, Math.max(1, hz)) * 0.5 * k, -0.55, 0.65);
    // just before landing: tip the skis to the slope below
    const A = this.assist, im = A.impact;
    if (k > 0 && im && im.score > -1 && A.t < 0.6 && hz > 0.5) {
      const dx = this.v.x / hz, dz = this.v.z / hz, slope = Math.atan2(im.n.x * dx + im.n.z * dz, Math.max(0.3, im.n.y)) * (this.sw ? -1 : 1);
      pitch = lerp(pitch, clamp(slope, -0.6, 0.9), smooth(0.6, 0.12, A.t));
    }
    _q3.setFromAxisAngle(Y, yaw);
    out.setFromAxisAngle(_a.set(1, 0, 0), pitch).premultiply(_q3);
    // the last moment before touching down: line up with the snow you land on, also sideways
    if (k > 0 && im && im.score > -1 && A.t < 0.55 && hz > 0.5) {
      const n = im.n;
      _f.set(Math.sin(yaw), 0, Math.cos(yaw)); _f.addScaledVector(n, -_f.dot(n)).normalize();
      _r.crossVectors(n, _f).normalize();
      _m.makeBasis(_r, n, _f); _q2.setFromRotationMatrix(_m);
      out.slerp(_q2, smooth(0.55, 0.08, A.t) * (this.assistLevel > 0 ? 1 : 0.6));
    }
    return out;
  }
  land() {
    const W = this.world, n = W.normal(this.p.x, this.p.z, this.n);
    const into = -this.v.dot(n);
    _a.copy(this.v).addScaledVector(n, -this.v.dot(n));
    const travel = _a.lengthSq() > 0.04 ? _b.copy(_a).normalize() : this.heading(_b);
    const tr = this.tricks.current();
    // how the body meets the snow: up against the normal, forward against the direction of travel
    _u.set(0, 1, 0).applyQuaternion(this.quat); const up = _u.angleTo(n);
    _f.set(0, 0, 1).applyQuaternion(this.quat); _f.addScaledVector(n, -_f.dot(n));
    const fl = _f.length(); if (fl > 1e-3) _f.multiplyScalar(1 / fl);
    // nearly standing still: which way you face does not matter
    const slowLand = _a.length() < 3;
    const fa = slowLand ? 0 : fl > 1e-3 ? _f.angleTo(travel) : Math.PI / 2, face = Math.min(fa, Math.PI - fa), sw = fa > Math.PI / 2;
    // nose up (in the back seat) or nose down?
    _u.set(0, 1, 0).applyQuaternion(this.quat);
    const back = (sw ? 1 : -1) * _u.dot(travel);          // + = leaning back against the travel
    const rot = this.tricks.rotating;
    let q;
    if (up < 0.3 && face < 0.26 && !rot) q = 'perfect';
    else if (up < 0.62 && face < 0.55) q = 'clean';
    else if (up < 1.05 && face < 0.95) q = 'sketchy';
    else q = 'crash';
    // landing flat from very high hurts
    const hard = into > 17 ? 'crash' : into > 12.5 ? 'big' : null;
    if (hard === 'crash' && q !== 'crash') q = 'crash';
    if (this.tricks.grabbing && this.tricks.grabT > 0.25 && q === 'perfect') q = 'clean';
    else if (this.tricks.grabbing && this.tricks.grabT > 0.25 && q === 'clean' && Math.random() < 0.5) q = 'sketchy';
    const backseat = q !== 'crash' && back > 0.32;
    if (backseat && q === 'perfect') q = 'clean';
    // speed along the snow stays (a little lost in a hard landing)
    this.v.copy(_a).multiplyScalar(q === 'crash' ? 0.6 : hard === 'big' ? 0.86 : q === 'sketchy' ? 0.92 : 0.98);
    this.grounded = true; this.coyote = 0; this.pipeAir = null; this.landT = 0; this.prevVy = null;
    this.tricks.grabbing = false;
    this.sw = sw && q !== 'crash';
    this.yaw = Math.atan2(this.v.x, this.v.z) + (this.sw ? Math.PI : 0);
    // slow: keep facing the way the body faces (it does not snap round)
    if (slowLand && fl > 1e-3) { this.yaw = Math.atan2(_f.x, _f.z); this.sw = this.v.x * _f.x + this.v.z * _f.z < 0 && this.v.lengthSq() > 0.6; }
    this.travelYaw = Math.atan2(this.v.x, this.v.z);
    const res = { quality: q, big: hard === 'big', backseat, into, air: this.airT, trick: tr, switch: this.sw, fast: this.v.length() > 17, pipe: tr && this.tricks.pipe };
    this.lastLand = res;
    this.emit('land', res);
    if (q === 'crash') this.fall(into, travel);
    else { if (q === 'sketchy' || hard === 'big') this.wob = q === 'sketchy' ? 1 : 0.6; if (backseat) this.backseat = 1; }
    this.tricks.reset();
  }

  // ---------- rails and boxes ----------
  checkRails() {
    const sp = this.v.length(); if (sp < 2.5 || this.grindCool > 0) return;
    for (const r of RAILS) {
      _a.subVectors(r.b, r.a); const L2 = _a.lengthSq(), t = _b.subVectors(this.p, r.a).dot(_a) / L2;
      if (t < 0.02 || t > 0.92) continue;
      const cx = r.a.x + _a.x * t, cy = r.a.y + _a.y * t, cz = r.a.z + _a.z * t;
      const dh = Math.hypot(this.p.x - cx, this.p.z - cz), dy = this.p.y - cy;
      if (dh > r.w + 0.35 || dy > 0.8 || dy < (this.grounded ? -r.h - 0.15 : -0.4)) continue;
      if (!this.grounded && this.v.y > 3) continue;
      const len = Math.sqrt(L2), dx = _a.x / len, dy2 = _a.y / len, dz = _a.z / len, along = this.v.x * dx + this.v.y * dy2 + this.v.z * dz;
      if (Math.abs(along) < sp * 0.55) continue;
      const sg = along >= 0 ? 1 : -1;
      // came in at an angle: skis across the rail (a slide); straight: along it
      const yawDiff = Math.abs(wrapAngle(this.yaw - Math.atan2(dx * sg, dz * sg)));
      const slide = yawDiff > 0.55 && yawDiff < 2.6 ? (wrapAngle(this.yaw - Math.atan2(dx * sg, dz * sg)) > 0 ? 1 : -1) : 0;
      const name = (r.kind === 'box' ? 'Box ' : 'Rail ') + (slide ? 'Slide' : '50-50');
      this.grind = { r, t, sg, speed: Math.max(4, Math.abs(along)), slide, name, time: 0, len, dir: new THREE.Vector3(dx * sg, dy2 * sg, dz * sg), wob: 0 };
      if (!this.grounded) this.tricks.reset();
      this.state = 'grind'; this.grounded = true; this.charge = 0; this.charging = false;
      this.emit('grindStart', { name });
      return;
    }
  }
  grindStep(dt, inp) {
    const g = this.grind, r = g.r;
    g.time += dt;
    g.speed += (-G * g.dir.y - 0.8) * dt;
    g.t += g.sg * g.speed * dt / g.len;
    this.p.copy(r.a).lerp(r.b, g.t); this.p.y += 0.02;
    this.v.copy(g.dir).multiplyScalar(g.speed);
    this.yaw = Math.atan2(g.dir.x, g.dir.z) + (g.slide ? g.slide * Math.PI / 2 : 0);
    g.wob += (inp.steer * 0.8 + Math.sin(g.time * 6) * 0.1) * dt; g.wob *= Math.exp(-2.5 * dt);
    if (inp.jump) { this.charging = true; this.charge = Math.min(1, this.charge + dt / 0.6); }
    const pop = this.charging && !inp.jump;
    if (g.t > 1 || g.t < 0 || g.speed < 0.6 || pop) {
      this.state = 'ride'; this.grind = null; this.grindCool = 0.4;
      this.emit('grindEnd', { name: g.name, time: g.time, points: Math.round((150 + g.time * 480 + (g.slide ? 120 : 0)) / 10) * 10 });
      this.n.set(0, 1, 0);
      this.v.y += pop ? 2.4 + this.charge * 2.4 : 1.0;
      this.yaw = Math.atan2(this.v.x, this.v.z);
      this.sw = false;
      const k = this.charge; this.charging = false; this.charge = 0;
      this.takeoff(pop, inp, k);
    }
  }

  // ---------- falling ----------
  fall(hard = 10, dir = null) {
    if (this.state === 'fall') return;
    this.state = 'fall'; this.fallT = 0; this.fallPhase = 'tumble'; this.grounded = true; this.charge = 0; this.charging = false;
    this.tricks.reset(); this.grind = null; this.pipeAir = null;
    // tumble forward or sideways, by how you came in
    this.tumbleAxis = new THREE.Vector3(Math.random() < 0.5 ? 1 : 0.3, 0, Math.random() < 0.5 ? 0.6 : -0.6).normalize();
    this.tumble = 0; this.tumbleRate = clamp(hard * 0.7, 5, 13);
    this.lying = 0; this.getUp = 0; this.fallK = 0; this.wob = 0; this.backseat = 0;
    this.emit('fall', { hard });
  }
  fallStep(dt) {
    const W = this.world;
    this.fallT += dt;
    const n = W.normal(this.p.x, this.p.z, this.n);
    if (this.fallPhase === 'tumble' || this.fallPhase === 'slide') {
      // sliding on your back: gravity, a lot of friction
      _a.set(0, -G, 0); _a.addScaledVector(n, -_a.dot(n)); this.v.addScaledVector(_a, dt * 0.55);
      const sp = this.v.length(); if (sp > 1e-4) this.v.multiplyScalar(Math.max(0, sp - (5.5 + sp * 0.12) * dt) / sp);
      this.p.addScaledVector(this.v, dt);
      const h = W.height(this.p.x, this.p.z);
      if (this.p.y < h + 0.3) { this.p.y = h; this.v.addScaledVector(n, -this.v.dot(n)); } else this.v.y -= G_AIR * dt;
      this.fallK = Math.min(1, this.fallK + dt * 6);
      if (this.fallPhase === 'tumble') {
        this.tumble += this.tumbleRate * dt; this.tumbleRate *= Math.exp(-1.2 * dt);
        this.lying = smooth(0.25, 0.9, this.fallT);
        if (this.fallT > 1.0) { this.fallPhase = 'slide'; this.emit('settle', {}); }
      } else {
        // the tumble ends on a whole turn
        const tgt = Math.round(this.tumble / (Math.PI * 2)) * Math.PI * 2; this.tumble += (tgt - this.tumble) * (1 - Math.exp(-5 * dt));
        this.lying = 1;
        if (this.v.length() < 0.8 && this.fallT > 1.7) { this.fallPhase = 'rest'; this.restT = 0; this.v.set(0, 0, 0); }
      }
    } else if (this.fallPhase === 'rest') {
      this.restT += dt; this.tumble = 0;
      this.p.y = W.height(this.p.x, this.p.z);
      if (this.restT > 0.6) {
        // a bad place to get up (a cliff, among trees, very steep): back to the last good spot
        const near = W.solidsNear(this.p.x, this.p.z);
        const bad = n.y < 0.72 || near.some(o => Math.hypot(o.x - this.p.x, o.z - this.p.z) < o.r + 1);
        this.fallPhase = 'up'; this.upT = 0;
        if (bad) this.emit('resetSpot', {});
        // face downhill
        this.yaw = Math.atan2(n.x, n.z); this.sw = false;
        this.emit('getUp', {});
      }
    } else if (this.fallPhase === 'up') {
      this.upT += dt; this.getUp = smooth(0, 1.4, this.upT);
      this.p.y = W.height(this.p.x, this.p.z);
      if (this.upT > 1.45) {
        this.state = 'ride'; this.fallPhase = null; this.v.set(0, 0, 0); this.lying = 0; this.getUp = 0; this.fallK = 0; this.idleT = 0;
        this.emit('recover', {});
      }
    }
  }
  // back to the last safe spot (during a fall, while the screen is white)
  toSafe() { this.p.copy(this.safe); this.p.y = this.world.height(this.p.x, this.p.z); this.yaw = this.safeYaw; this.v.set(0, 0, 0); this.world.normal(this.p.x, this.p.z, this.n); }

  // ---------- trees, rocks, houses, the edge of the world ----------
  collide() {
    const W = this.world, near = W.solidsNear(this.p.x, this.p.z, this._near || (this._near = []));
    const ground = W.terrain(this.p.x, this.p.z), above = this.p.y - ground;
    for (const o of near) {
      const top = o.kind === 'tree' ? 7 * (o.r / 0.9) : o.kind === 'rock' ? o.r * 0.9 : o.kind === 'cabin' ? 8 : 4;
      if (above > top) continue;
      const dx = this.p.x - o.x, dz = this.p.z - o.z, d = Math.hypot(dx, dz), min = o.r + 0.32;
      if (d >= min || d < 1e-4) continue;
      const nx = dx / d, nz = dz / d, vin = -(this.v.x * nx + this.v.z * nz);
      this.p.x = o.x + nx * min; this.p.z = o.z + nz * min;
      if (vin > 0) {
        this.v.x += nx * vin * 1.3; this.v.z += nz * vin * 1.3;
        if (vin > 7.5 && this.state !== 'fall') { this.v.multiplyScalar(0.3); this.grounded = true; this.state = this.state === 'grind' ? 'ride' : this.state; this.fall(vin); this.emit('hit', { kind: o.kind, k: vin }); }
      }
    }
  }
  bounds() {
    const p = this.p, v = this.v;
    if (p.x > BOUNDS.x) { p.x = BOUNDS.x; v.x = Math.min(0, v.x); } if (p.x < -BOUNDS.x) { p.x = -BOUNDS.x; v.x = Math.max(0, v.x); }
    if (p.z < BOUNDS.z0) { p.z = BOUNDS.z0; v.z = Math.max(0, v.z); } if (p.z > BOUNDS.z1) { p.z = BOUNDS.z1; v.z = Math.min(0, v.z); }
  }

  // ---------- what you see ----------
  // on the snow: up is the snow's normal, forward is where you face; a hockey stop turns you across
  groundQuat(out) {
    const n = this.n;
    this.heading(_f);
    _r.crossVectors(n, _f).normalize();
    _m.makeBasis(_r, n, _f); out.setFromRotationMatrix(_m);
    if (this.skid) out.multiply(_q2.setFromAxisAngle(Y, this.skid));
    return out;
  }
  visual(dt, inp) {
    this.skid = lerp(this.skid, (this.brake * 1.25 + (this.check || 0) * 0.45) * this.skidSide, 1 - Math.exp(-10 * dt));
    if (this.state === 'fall') {
      this.groundQuat(_q);
      if (this.fallPhase === 'tumble' || this.fallPhase === 'slide') _q.multiply(_q2.setFromAxisAngle(this.tumbleAxis, this.tumble));
      this.quat.slerp(_q, 1 - Math.exp(-14 * dt));
      this.pivot = lerp(this.pivot, this.fallPhase === 'tumble' ? 1 : 0, 1 - Math.exp(-4 * dt));
    } else if (this.state === 'grind') {
      const g = this.grind;
      _f.copy(g.dir).setY(0).normalize();
      _q.setFromAxisAngle(Y, Math.atan2(_f.x, _f.z) + g.slide * Math.PI / 2);
      _q.multiply(_q2.setFromAxisAngle(_b.set(0, 0, 1), g.wob * 0.4));
      this.quat.slerp(_q, 1 - Math.exp(-18 * dt));
      this.pivot = 0;
    } else if (this.grounded) {
      this.groundQuat(_q);
      this.quat.slerp(_q, 1 - Math.exp(-16 * dt));
      this.pivot = Math.max(0, this.pivot - dt * 5);
    } else {
      this.airNeutral(this.neutral);
      // the start rotation (from the snow) fades out quickly, the tricks are on top
      this.base.slerp(_q2.identity(), 1 - Math.exp(-5 * dt));
      _q.copy(this.neutral).multiply(this.base).multiply(this.tricks.local);
      // with no tricks running, settle into a riding position; very close to the snow line up with it
      this.quat.copy(_q);
      this.pivot = Math.min(1, this.pivot + dt * 6);
    }
    this.wob = Math.max(0, this.wob - dt * 0.9);
    this.backseat = Math.max(0, this.backseat - dt * 1.2);
  }
  // what the animated skier needs to know
  poseInto(I) {
    const air = !this.grounded && this.state !== 'fall';
    I.grounded = this.grounded; I.speed = this.speed; I.incl = this.state === 'ride' && this.grounded ? this.incl + (this.brake * this.skidSide * 0.35) : 0;
    I.brake = Math.max(this.brake, (this.check || 0) * 0.5); I.skid = this.skid; I.plow = this.plow; I.tuck = this.tuck; I.push = this.push;
    I.sw = this.sw && this.grounded ? 1 : 0; I.charge = this.charging ? this.charge : 0;
    I.airT = this.airT; I.takeoffT = air ? this.takeoffT : 9;
    const r = this.tricks.rates; I.spin = air ? r.spin : 0; I.flip = air ? r.flip : 0; I.roll = air ? r.roll : 0;
    I.grab = this.grabW || 0; I.grabType = this.tricks.grabType || I.grabType;
    I.preland = air && this.assist.impact && this.airT > 0.25 && !this.tricks.rotating ? smooth(0.5, 0.12, this.assist.t) : 0;
    I.wobble = this.wob; I.backseat = this.backseat; I.powder = this.grounded ? this.inPowder : 0;
    I.fall = this.state === 'fall' ? this.fallK : 0; I.lying = this.lying; I.getUp = this.getUp;
    I.still = this.state === 'ride' && this.grounded && this.speed < 0.35; I.idle = this.idleT;
    I.rail = this.state === 'grind' ? 1 : 0; I.railSlide = this.grind ? this.grind.slide : 0;
    I.look = 0;
  }
  // the grab blend (the hand goes down quickly, comes back up a bit slower; let go just before landing)
  updateGrab(dt) {
    const soon = this.assist.impact && this.assist.t < 0.16;
    const want = !this.grounded && this.state !== 'fall' && this.tricks.grabbing && !soon ? 1 : 0;
    this.grabW = (this.grabW || 0) + (want - (this.grabW || 0)) * (1 - Math.exp(-(want ? 12 : 9) * dt));
  }
}
