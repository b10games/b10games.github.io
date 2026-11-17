// How a bean moves: run, jump, swim, slide on ice, get pushed by wind and knocked over by disasters.
// Used for your own bean and for the bots. Other players in a party are only drawn, never simulated here.
import { THREE, clamp, angDiff } from './engine.js';

export const R = 0.42, H = 1.42;
export const MOVE = { speed: 8.6, accelGround: 60, accelAir: 22, accelIce: 5.5, jump: 12.4, swim: 0.55, coyote: 0.12, buffer: 0.14, edge: 136 };

const _c = new THREE.Vector3(), _cv = new THREE.Vector3(), _rel = new THREE.Vector3(), ZERO = new THREE.Vector3();
const ct = { n: new THREE.Vector3(), point: new THREE.Vector3(), depth: 0 };
const near = [];

export class Mover {
  constructor(world) {
    this.world = world;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.yaw = 0;
    this.grounded = false; this.groundC = null; this.groundVel = new THREE.Vector3();
    this.airTime = 0; this.coyote = 0; this.jumpBuf = 0;
    this.stun = 0; this.invuln = 0; this.landV = 0; this.impact = 0;
    this.swimming = false; this.waterY = -Infinity; this.climbT = 0; this.blocked = false;
    this.ext = new THREE.Vector3();          // pushes from wind, tornadoes and waves (set every frame)
    this.drift = new THREE.Vector3();        // the speed those pushes have built up (your feet can't stop it)
    this.slip = 0; this.speedMul = 1; this.frozen = false;
    this.events = [];
  }
  spawn(p, yaw = 0) {
    this.pos.copy(p); this.vel.set(0, 0, 0); this.yaw = yaw;
    this.grounded = false; this.stun = 0; this.invuln = 0.5; this.swimming = false; this.ext.set(0, 0, 0); this.drift.set(0, 0, 0);
  }
  // get knocked over: thrown in direction (dx, dz) with this speed, up and tumbling for a while
  knock(dx, dz, strength, up = 7, stun = 0.9) {
    const l = Math.hypot(dx, dz) || 1;
    this.vel.set(dx / l * strength, Math.max(this.vel.y, up), dz / l * strength);
    this.stun = Math.max(this.stun, stun); this.grounded = false;
    this.events.push('hit');
  }

  // inp: { x, z: wanted direction in world space (length <= 1), jump: pressed this frame }
  step(dt, inp, frameDt = dt) {
    if (this.frozen) { this.vel.set(0, 0, 0); return; }
    this.coyote -= dt; this.jumpBuf -= dt; this.stun -= dt; this.invuln -= dt; this.climbT -= dt;
    if (inp.jump) this.jumpBuf = MOVE.buffer;
    const control = this.stun <= 0, v = this.vel;
    let dx = control ? inp.x || 0 : 0, dz = control ? inp.z || 0 : 0;
    const len = Math.hypot(dx, dz);
    if (len > 1) { dx /= len; dz /= len; }
    // water: feet more than half a metre under the surface = swimming
    const W = this.waterY;
    this.swimming = this.pos.y + 0.6 < W;
    const gv = this.grounded ? this.groundVel : ZERO;
    const sp = MOVE.speed * this.speedMul * (this.swimming ? MOVE.swim : 1);
    // pushes build up a drift that walking cannot cancel (like standing on a moving floor)
    const dk = Math.exp(-2 * dt), D = this.drift;
    D.x = (D.x + this.ext.x * dt) * dk; D.z = (D.z + this.ext.z * dt) * dk;
    const onFloor = this.grounded || this.swimming;

    // steer toward the wanted speed
    const ice = this.slip > 0 || (this.groundC && this.groundC.surface === 'ice');
    let acc = this.swimming ? 14 : !this.grounded ? MOVE.accelAir : ice ? MOVE.accelIce : MOVE.accelGround;
    if (!control) acc = this.grounded ? 8 : this.swimming ? 4 : 0.5;
    let tx = dx * sp + gv.x + (onFloor ? D.x : 0), tz = dz * sp + gv.z + (onFloor ? D.z : 0);
    if (!this.grounded && !this.swimming) {
      const hs = Math.hypot(v.x, v.z);
      if (len < 0.1) { tx = v.x; tz = v.z; acc = 0; }                    // keep momentum in the air
      else if (hs > sp) { tx = dx * hs; tz = dz * hs; acc *= 0.6; }      // thrown fast: steer without braking
    }
    const ex = tx - v.x, ez = tz - v.z, el = Math.hypot(ex, ez), mx = acc * dt;
    if (el > mx) { v.x += ex / el * mx; v.z += ez / el * mx; } else { v.x = tx; v.z = tz; }

    // jump (or a hop out of the water)
    if (this.jumpBuf > 0 && control) {
      if (this.grounded || this.coyote > 0) {
        v.y = MOVE.jump + Math.max(0, gv.y * 0.6);
        this.grounded = false; this.coyote = 0; this.jumpBuf = 0;
        this.events.push('jump');
      } else if (this.swimming && this.pos.y > W - 1.5) {
        v.y = 9.5; this.jumpBuf = 0; this.events.push('swimjump');
      }
    }
    // swimming against a wall: climb out when the edge is low enough
    if (this.swimming && this.blocked && len > 0.3 && this.climbT <= 0 && control) { v.y = 8.5; this.climbT = 0.6; }

    // gravity, or floating with the head above water
    if (this.swimming) {
      v.y += ((W - 1.0) - this.pos.y) * 26 * dt;
      v.y *= Math.exp(-3.2 * dt);
    } else {
      let g = this.world.gravity;
      if (v.y < 0) g *= 1.2;
      v.y = Math.max(-48, v.y + g * dt);
    }
    v.y += this.ext.y * dt;
    if (!onFloor) { v.x += this.ext.x * dt; v.z += this.ext.z * dt; }

    // move in small steps so fast moves do not pass through thin walls
    const wasGrounded = this.grounded, vyBefore = v.y, wasSwim = this.swimming;
    this.grounded = false; this.groundC = null; this.blocked = false;
    const n = clamp(Math.ceil(v.length() * dt / 0.22), 1, 10);
    for (let i = 0; i < n; i++) { this.pos.addScaledVector(v, dt / n); this.resolve(frameDt, dx, dz); }
    if (v.y > 40) v.y = 40;
    const hv = Math.hypot(v.x, v.z); if (hv > 45) { v.x *= 45 / hv; v.z *= 45 / hv; }

    if (this.grounded) {
      if (!wasGrounded) {
        this.landV = vyBefore;
        if (vyBefore < -9) this.events.push('land');
        if (vyBefore < -21 && !wasSwim) { this.impact = -vyBefore; this.events.push('impact'); }
      }
      this.coyote = MOVE.coyote; this.airTime = 0;
    } else this.airTime += dt;
    if (!wasSwim && this.pos.y + 0.6 < W && vyBefore < -6) this.events.push('splash');

    // never leave the island area: an invisible fence far out in the sea
    const r = Math.hypot(this.pos.x, this.pos.z);
    if (r > MOVE.edge) { this.pos.x *= MOVE.edge / r; this.pos.z *= MOVE.edge / r; const k = (v.x * this.pos.x + v.z * this.pos.z) / (r * r); if (k > 0) { v.x -= k * this.pos.x; v.z -= k * this.pos.z; } }

    // face the way we move
    const hs = Math.hypot(v.x - gv.x, v.z - gv.z);
    if (hs > 0.6 && control) this.yaw += angDiff(Math.atan2(v.x - gv.x, v.z - gv.z), this.yaw) * Math.min(1, dt * 14);
    if (this.pos.y < this.world.killY || !isFinite(this.pos.y)) this.events.push('fall');
  }

  resolve(frameDt, dx, dz) {
    for (let it = 0; it < 2; it++) {
      for (const k of [R, H - R]) {
        _c.copy(this.pos); _c.y += k;
        this.world.near(_c, R + 0.2, near);
        for (const c of near) {
          if (!c.contact(_c, R, ct)) continue;
          this.pos.addScaledVector(ct.n, ct.depth);
          _c.addScaledVector(ct.n, ct.depth);
          c.pointVel(ct.point, frameDt, _cv);
          if (_cv.lengthSq() > 900) _cv.setLength(30);
          _rel.copy(this.vel).sub(_cv);
          const rn = _rel.dot(ct.n);
          if (rn < 0) this.vel.addScaledVector(ct.n, -rn);
          if (ct.n.y > 0.55) {
            this.grounded = true; this.groundC = c; this.groundVel.copy(_cv);
            if (c.surface === 'bounce' && this.vel.y <= _cv.y + 2) { this.vel.y = c.bounce; this.grounded = false; this.events.push('bounce'); }
          } else if (ct.n.y < -0.5 && this.vel.y > 0) this.vel.y = 0;
          else if (Math.abs(ct.n.y) < 0.4 && ct.n.x * dx + ct.n.z * dz < -0.3) this.blocked = true;
        }
      }
    }
  }

  // bump into another bean (we only move ourselves; they handle their own side)
  pushFrom(p) {
    const dx = this.pos.x - p.x, dz = this.pos.z - p.z, dy = this.pos.y - p.y;
    if (Math.abs(dy) > 1.3) return;
    const d = Math.hypot(dx, dz);
    if (d > 0.88 || d < 1e-4) return;
    const push = (0.88 - d) * 0.5;
    this.pos.x += dx / d * push; this.pos.z += dz / d * push;
  }

  // what the animation needs
  anim() {
    return { speed: Math.hypot(this.vel.x - (this.grounded ? this.groundVel.x : 0), this.vel.z - (this.grounded ? this.groundVel.z : 0)),
      grounded: this.grounded, vy: this.vel.y, stun: Math.max(0, this.stun), landV: this.landV, swim: this.swimming };
  }
}
