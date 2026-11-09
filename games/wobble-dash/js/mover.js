// Character movement: run, jump, air-dash (Space twice), knock-backs, moving platforms, respawns.
// Used for your own character and for bots. Remote players are only drawn, never simulated here.
import { THREE, clamp, angDiff } from './engine.js';

export const R = 0.42, H = 1.42;
export const MOVE = {
  speed: 9.2, accelGround: 62, accelAir: 24, accelIce: 6.5, accelSlide: 4,
  jump: 12.6, dashSpeed: 19.5, dashUp: 7.2, dashTime: 0.34, dashCd: 1.0,
  coyote: 0.12, buffer: 0.14
};

const _c = new THREE.Vector3(), _cv = new THREE.Vector3(), _rel = new THREE.Vector3(), ZERO = new THREE.Vector3();
const ct = { n: new THREE.Vector3(), point: new THREE.Vector3(), depth: 0 };
const near = [];

export class Mover {
  constructor(world) {
    this.world = world;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.yaw = 0;
    this.grounded = false; this.groundC = null; this.groundVel = new THREE.Vector3();
    this.airTime = 0; this.coyote = 0; this.jumpBuf = 0;
    this.dashT = 0; this.dashCd = 0; this.canDash = true;
    this.stun = 0; this.invuln = 0; this.landV = 0;
    this.checkpoint = new THREE.Vector3(); this.cpIndex = -1; this.cpYaw = 0;
    this.finished = false; this.frozen = false; this.speedMul = 1; this.gravMul = 1;
    this.events = [];
  }
  spawn(p, yaw = 0) {
    this.pos.copy(p); this.vel.set(0, 0, 0); this.yaw = yaw;
    this.checkpoint.copy(p); this.cpYaw = yaw; this.cpIndex = -1;
    this.grounded = false; this.stun = 0; this.dashT = 0; this.finished = false; this.invuln = 0;
  }
  respawn() {
    this.pos.copy(this.checkpoint).add(new THREE.Vector3((Math.random() - 0.5) * 3, 0.3, (Math.random() - 0.5) * 1.5));
    this.vel.set(0, 0, 0); this.yaw = this.cpYaw; this.stun = 0; this.dashT = 0; this.invuln = 1.5;
    this.events.push('respawn');
  }
  knock(n, cv, strength) {
    const hx = cv.x * 0.7 + n.x * 6, hz = cv.z * 0.7 + n.z * 6, l = Math.hypot(hx, hz) || 1;
    this.vel.set(hx / l * strength, Math.max(this.vel.y, 6 + strength * 0.3), hz / l * strength);
    this.stun = 0.85; this.dashT = 0; this.grounded = false;
    this.events.push('hit');
  }

  // inp: { x, z: wanted direction in world space (length <= 1), jump: pressed this frame }
  step(dt, inp, frameDt = dt) {
    if (this.frozen) { this.vel.set(0, 0, 0); return; }
    this.coyote -= dt; this.jumpBuf -= dt; this.dashCd -= dt; this.stun -= dt; this.invuln -= dt; this.dashT -= dt;
    if (inp.jump) this.jumpBuf = MOVE.buffer;
    const control = this.stun <= 0;
    let dx = control ? inp.x || 0 : 0, dz = control ? inp.z || 0 : 0;
    const len = Math.hypot(dx, dz);
    if (len > 1) { dx /= len; dz /= len; }
    const surf = this.grounded && this.groundC ? this.groundC.surface : 'air';
    const gv = this.grounded ? this.groundVel : ZERO;
    const v = this.vel, sp = MOVE.speed * this.speedMul;

    // horizontal: steer toward the wanted velocity (on top of the ground's own motion)
    if (this.dashT > 0) {
      if (len > 0.1) {           // steer the dash a little
        const cur = Math.atan2(v.x, v.z), want = Math.atan2(dx, dz), hs = Math.hypot(v.x, v.z);
        const a = cur + clamp(angDiff(want, cur), -2.6 * dt, 2.6 * dt);
        v.x = Math.sin(a) * hs; v.z = Math.cos(a) * hs;
      }
    } else {
      let acc = !this.grounded ? MOVE.accelAir : surf === 'ice' ? MOVE.accelIce : surf === 'slide' ? MOVE.accelSlide : MOVE.accelGround;
      if (!control) acc = this.grounded ? 10 : 0.5;
      let tx = dx * sp + gv.x, tz = dz * sp + gv.z;
      if (!this.grounded) {
        const hs = Math.hypot(v.x, v.z);
        if (len < 0.1) { tx = v.x; tz = v.z; acc = 0; }                      // keep momentum in the air
        else if (hs > sp) { tx = dx * hs; tz = dz * hs; acc *= 0.6; }        // fast after a dash/launch: steer without braking
      }
      const ex = tx - v.x, ez = tz - v.z, el = Math.hypot(ex, ez), mx = acc * dt;
      if (el > mx) { v.x += ex / el * mx; v.z += ez / el * mx; } else { v.x = tx; v.z = tz; }
    }

    // jump, then dash in the air
    if (this.jumpBuf > 0 && control) {
      if (this.grounded || this.coyote > 0) {
        v.y = MOVE.jump + Math.max(0, gv.y * 0.6);
        this.grounded = false; this.coyote = 0; this.jumpBuf = 0; this.canDash = true;
        this.events.push('jump');
      } else if (this.canDash && this.dashCd <= 0) {
        let fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
        if (len > 0.1) { fx = dx / Math.max(len, 1e-6); fz = dz / Math.max(len, 1e-6); }
        const hs = Math.max(MOVE.dashSpeed, Math.hypot(v.x, v.z));
        v.set(fx * hs, MOVE.dashUp, fz * hs);
        this.yaw = Math.atan2(fx, fz);
        this.dashT = MOVE.dashTime; this.canDash = false; this.dashCd = MOVE.dashCd; this.jumpBuf = 0;
        this.events.push('dash');
      }
    }

    // gravity and trigger zones (wind, low gravity)
    let g = this.world.gravity * this.gravMul;
    if (this.dashT > 0) g *= 0.4; else if (v.y < 0) g *= 1.25;
    _c.copy(this.pos); _c.y += 0.7;
    for (const z of this.world.zones) {
      if (!z.has(_c)) continue;
      if (z.type === 'wind') { const f = z.data.force(this.world.time || 0); v.x += f.x * dt; v.y += f.y * dt; v.z += f.z * dt; }
      else if (z.type === 'lowgrav') g *= z.data.k || 0.5;
      else if (z.type === 'boost' && this.grounded) { v.x += z.data.x * dt; v.z += z.data.z * dt; }
    }
    v.y = Math.max(-46, v.y + g * dt);

    // move in small steps so fast moves do not pass through thin things
    const wasGrounded = this.grounded, vyBefore = v.y;
    this.grounded = false; this.groundC = null;
    const n = clamp(Math.ceil(v.length() * dt / 0.22), 1, 8);
    for (let i = 0; i < n; i++) { this.pos.addScaledVector(v, dt / n); this.resolve(frameDt); }
    if (v.y > 34) v.y = 34;
    const hv = Math.hypot(v.x, v.z); if (hv > 40) { v.x *= 40 / hv; v.z *= 40 / hv; }

    if (this.grounded) {
      if (!wasGrounded) { this.landV = vyBefore; if (vyBefore < -9) this.events.push('land'); }
      this.coyote = MOVE.coyote; this.canDash = true; this.airTime = 0;
    } else this.airTime += dt;

    // face the way we move
    const hs = Math.hypot(v.x - gv.x, v.z - gv.z);
    if (hs > 0.6 && (control || this.dashT > 0)) {
      const want = Math.atan2(v.x - gv.x, v.z - gv.z);
      this.yaw += angDiff(want, this.yaw) * Math.min(1, dt * (this.dashT > 0 ? 25 : 14));
    }
    if (this.pos.y < this.world.killY) this.events.push('fall');
    if (this.pos.y > this.checkpoint.y + 70 || !isFinite(this.pos.y)) this.respawn();   // safety net: never fly off into space

    // checkpoints and finish
    _c.copy(this.pos); _c.y += 0.7;
    for (const z of this.world.zones) {
      if (z.type === 'checkpoint' && z.data.index > this.cpIndex && z.has(_c)) {
        this.cpIndex = z.data.index; this.checkpoint.copy(z.data.spawn); this.cpYaw = z.data.yaw || 0;
        this.events.push('checkpoint');
      } else if (z.type === 'finish' && !this.finished && z.has(_c)) { this.finished = true; this.events.push('finish'); }
    }
  }

  resolve(frameDt) {
    for (let it = 0; it < 2; it++) {
      for (const k of [R, H - R]) {
        _c.copy(this.pos); _c.y += k;
        this.world.near(_c, R + 0.2, near);
        for (const c of near) {
          if (!c.contact(_c, R, ct)) continue;
          if (c.surface === 'kill') { if (this.invuln <= 0) this.events.push('kill'); continue; }
          this.pos.addScaledVector(ct.n, ct.depth);
          _c.addScaledVector(ct.n, ct.depth);
          c.pointVel(ct.point, frameDt, _cv);
          if (_cv.lengthSq() > 900) _cv.setLength(30);   // teleporting pieces (respawning tiles, wrapping balls) must not fling you
          _rel.copy(this.vel).sub(_cv);
          const rn = _rel.dot(ct.n);
          if (rn < 0) this.vel.addScaledVector(ct.n, -rn);
          if (ct.n.y > 0.55) {
            this.grounded = true; this.groundC = c; this.groundVel.copy(_cv);
            if (c.onStand) c.onStand(this);
            if (c.surface === 'bounce' && this.vel.y <= _cv.y + 2) {
              this.vel.y = c.bounce; this.grounded = false; this.canDash = true; this.events.push('bounce');
            }
          } else if (ct.n.y < -0.5 && this.vel.y > 0) this.vel.y = 0;
          if (c.hit && this.stun <= 0 && this.invuln <= 0 && (_cv.lengthSq() > 2.5 || c.alwaysHit)) this.knock(ct.n, _cv, c.hit);
        }
      }
    }
  }

  // Bump into another character (we only move ourselves; they handle their own side).
  pushFrom(p, otherVel, otherDash) {
    const dx = this.pos.x - p.x, dz = this.pos.z - p.z, dy = this.pos.y - p.y;
    if (Math.abs(dy) > 1.3) return;
    const d = Math.hypot(dx, dz);
    if (d > 0.88 || d < 1e-4) return;
    const push = (0.88 - d) * 0.5;
    this.pos.x += dx / d * push; this.pos.z += dz / d * push;
    if (otherDash && this.stun <= 0 && this.invuln <= 0) {
      _cv.set(otherVel[0], 0, otherVel[2]);
      this.knock(_rel.set(dx / d, 0, dz / d), _cv, 9);
    }
  }

  // Compact state for the network / animation.
  anim() {
    return { speed: Math.hypot(this.vel.x - (this.grounded ? this.groundVel.x : 0), this.vel.z - (this.grounded ? this.groundVel.z : 0)),
      grounded: this.grounded, vy: this.vel.y, dash: this.dashT > 0 ? this.dashT / MOVE.dashTime : 0, stun: Math.max(0, this.stun), landV: this.landV };
  }
}
