// The drone camera: it flies high above and behind the skier, like a filming drone.
//  - follows the direction you ride (never the spins and flips), swinging round smoothly in turns
//  - further back, higher and wider (FOV) the faster you go; climbs a little when you jump and settles
//    after the landing, with a shake on big landings
//  - hovers: a tiny slow drift, like a real drone holding position in the wind
//  - in the halfpipe it hangs above the pipe looking down it
//  - never in the snow or behind a ridge (it climbs over)
// C switches between DRONE (high), CHASE (lower and closer) and CINEMATIC (from the side).
import { THREE, clamp, lerp, damp, dampAngle, smooth, wrapAngle } from './engine.js';
import { parkUV, PIPE, PARK } from './terrain.js';

const _t = new THREE.Vector3(), _c = new THREE.Vector3(), _l = new THREE.Vector3(), _d = new THREE.Vector3();
export const CAM_MODES = ['DRONE', 'CHASE', 'CINEMATIC'];

export class DroneCam {
  constructor(camera, world) {
    this.cam = camera; this.world = world; this.mode = 0;
    this.yaw = 0; this.dist = 11; this.height = 5.5; this.fov = 58; this.shake = 0; this.dip = 0; this.dipV = 0;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.look = new THREE.Vector3(); this.lookV = new THREE.Vector3();
    this.has = false; this.t = 0; this.side = 1; this.oYaw = 0; this.oPitch = 0; this.dragT = 9; this.wasAir = false; this.pipeK = 0;
  }
  cycle() { this.mode = (this.mode + 1) % CAM_MODES.length; return CAM_MODES[this.mode]; }
  drag(dx, dy) { this.oYaw -= dx * 0.005; this.oPitch = clamp(this.oPitch + dy * 0.004, -0.4, 0.7); this.dragT = 0; }
  land(k) { this.dipV -= k * 1.4; this.shake = Math.max(this.shake, k); }
  snap(s) { this.update(0, s, true); }
  // s: the physics (ski.js)
  update(dt, s, instant = false) {
    instant = instant || !this.has; this.has = true;
    const W = this.world, air = !s.grounded && s.state !== 'fall', sp = s.speed, fall = s.state === 'fall';
    this.t += dt;
    // the direction to follow: where you travel (in the air the camera keeps its line)
    const hz = Math.hypot(s.v.x, s.v.z);
    let want = hz > 1.2 ? Math.atan2(s.v.x, s.v.z) : s.yaw + (s.sw ? Math.PI : 0);
    // in the halfpipe: look down the pipe, not across it
    const ph = parkUV(s.p.x, s.p.z), inPipe = ph && ph.u > PIPE.a - 20 && ph.u < PIPE.b + 10 && Math.abs(ph.v) < 20;
    this.pipeK = instant ? (inPipe ? 1 : 0) : damp(this.pipeK, inPipe ? 1 : 0, 1.5, dt);
    if (this.pipeK > 0.01 && ph) want += wrapAngle(Math.atan2(ph.dx, ph.dz) - want) * this.pipeK;
    const turnRate = air ? 0.7 : fall ? 0.8 : lerp(1.6, 2.6, smooth(2, 25, sp));
    this.yaw = instant ? want : dampAngle(this.yaw, want, turnRate, dt);
    this.dragT += dt; if (this.dragT > 1.5) { this.oYaw = damp(this.oYaw, 0, 1.5, dt); this.oPitch = damp(this.oPitch, 0, 1.5, dt); }
    // how far and how high
    const m = this.mode;
    let dist = m === 0 ? 6.6 + clamp(sp * 0.1, 0, 3.6) : m === 1 ? 4.3 + clamp(sp * 0.06, 0, 2) : 7.5 + clamp(sp * 0.08, 0, 3);
    let height = m === 0 ? 3.5 + clamp(sp * 0.055, 0, 2) : m === 1 ? 1.7 + clamp(sp * 0.025, 0, 0.8) : 2.2;
    if (air) { height += m === 1 ? 0.8 : 1.4; dist += 1.0; }
    if (fall) { height += 1.5; dist += 2; }
    height += this.pipeK * 4; dist += this.pipeK * 3;
    this.dist = instant ? dist : damp(this.dist, dist, air ? 1.2 : 1.8, dt);
    this.height = instant ? height : damp(this.height, height, air ? 1.0 : 1.6, dt);
    // landing: a soft dip that springs back
    if (!air && this.wasAir && !instant) this.dipV -= Math.min(2.5, 0.4 + Math.max(0, -s.v.y) * 0.08);
    this.wasAir = air;
    this.dipV += (-40 * this.dip - 9 * this.dipV) * dt; this.dip += this.dipV * dt;
    // where the camera wants to be
    const target = _t.copy(s.p); target.y += 1.0;
    let yaw = this.yaw + this.oYaw;
    if (m === 2) {
      // cinematic: off to the side and a little ahead, it pans with you
      const side = this.side;
      yaw += side * 1.25;
    }
    _c.set(target.x - Math.sin(yaw) * this.dist, target.y + this.height + this.oPitch * 6 + this.dip * 0.5, target.z - Math.cos(yaw) * this.dist);
    // stay above the snow here and on the way to the skier (climb over a ridge)
    const clear = m === 1 ? 1.4 : 2.6;
    for (const k of [1, 0.66, 0.33]) {
      const x = lerp(target.x, _c.x, k), z = lerp(target.z, _c.z, k), y = lerp(target.y, _c.y, k);
      const g = Math.max(W.height(x, z), W.drawnHeight(x, z)) + clear * k + 0.4;
      if (y < g) _c.y += (g - y) / k;
    }
    // a drone flies there smoothly: a spring, stiffer when fast (so it does not fall behind)
    if (instant) { this.pos.copy(_c); this.vel.set(0, 0, 0); }
    else {
      const w = air ? 3.2 : lerp(3.4, 6, smooth(5, 30, sp)), wy = air ? 2.6 : 3.6;
      // move with the skier (so speed never stretches the spring), then ease towards the spot
      _d.copy(s.v).multiplyScalar(dt); if (!fall) this.pos.add(_d);
      for (const [ax, ww] of [['x', w], ['z', w], ['y', wy]]) {
        const a = ww * ww * (_c[ax] - this.pos[ax]) - 2 * ww * this.vel[ax];
        this.vel[ax] += a * dt; this.pos[ax] += this.vel[ax] * dt;
      }
      // never under the snow
      const g = Math.max(W.height(this.pos.x, this.pos.z), W.drawnHeight(this.pos.x, this.pos.z)) + 1.0;
      if (this.pos.y < g) { this.pos.y = g; this.vel.y = Math.max(0, this.vel.y); }
    }
    // a drone hovering in the wind
    const t = this.t, hov = m === 1 ? 0.03 : 0.09;
    this.cam.position.set(this.pos.x + Math.sin(t * 0.7) * hov + Math.sin(t * 1.9) * hov * 0.3, this.pos.y + Math.sin(t * 0.9 + 1) * hov * 0.7, this.pos.z + Math.cos(t * 0.6 + 2) * hov);
    // look at the skier and a bit ahead (more when fast), a little lower in the air (to see the landing)
    const ahead = air ? clamp(sp * 0.18, 0, 5) : clamp(sp * 0.3, 0, 7);
    _l.set(target.x + Math.sin(this.yaw) * ahead, target.y - (air ? 0.8 : 0.4) - this.pipeK * 1.5, target.z + Math.cos(this.yaw) * ahead);
    if (fall) _l.copy(s.p);
    if (instant) { this.look.copy(_l); this.lookV.set(0, 0, 0); }
    else {
      const w = 7;
      _d.copy(s.v).multiplyScalar(dt); if (!fall) this.look.add(_d);
      for (const ax of ['x', 'y', 'z']) { const a = w * w * (_l[ax] - this.look[ax]) - 2 * w * this.lookV[ax]; this.lookV[ax] += a * dt; this.look[ax] += this.lookV[ax] * dt; }
    }
    // shake: smooth wobbles after a big landing or a crash, a light buzz when very fast
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.2); const a = this.shake * this.shake * 0.25;
      this.cam.position.x += Math.sin(t * 41) * a; this.cam.position.y += Math.sin(t * 33 + 1) * a; this.cam.position.z += Math.sin(t * 37 + 2) * a * 0.6;
    }
    const kmh = sp * 3.6;
    if (kmh > 60 && !air) { const a = Math.min(0.045, (kmh - 60) / 1400); this.cam.position.x += Math.sin(t * 23) * a; this.cam.position.y += Math.sin(t * 31 + 2) * a; }
    this.cam.lookAt(this.look);
    // wider the faster you go
    const fov = (m === 1 ? 62 : 55) + clamp((kmh - 15) / 85, 0, 1) * 18 + (air ? 3 : 0);
    this.fov = instant ? fov : damp(this.fov, fov, 1.6, dt);
    if (Math.abs(this.cam.fov - this.fov) > 0.05) { this.cam.fov = this.fov; this.cam.updateProjectionMatrix(); }
  }
}
