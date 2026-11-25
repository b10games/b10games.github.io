// The drone camera: it flies close behind and a little above the skier, like a filming drone.
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
  // k 0..1.2: only big ones shake a little
  land(k) { this.dipV -= k * 0.8; if (k > 0.45) this.shake = Math.max(this.shake, (k - 0.3) * 0.9); }
  snap(s) { this.update(0, s, true); }
  // s: the physics (ski.js)
  update(dt, s, instant = false) {
    instant = instant || !this.has; this.has = true;
    const W = this.world, air = !s.grounded && s.state !== 'fall', sp = s.speed, fall = s.state === 'fall';
    this.t += dt;
    // the direction to follow: where you travel (in the air the camera keeps its line, it never spins)
    const hz = Math.hypot(s.v.x, s.v.z);
    let want = hz > 1.2 ? Math.atan2(s.v.x, s.v.z) : s.yaw + (s.sw ? Math.PI : 0);
    // in the halfpipe: look down the pipe, not across it
    const ph = parkUV(s.p.x, s.p.z), inPipe = ph && ph.u > PIPE.a - 20 && ph.u < PIPE.b + 10 && Math.abs(ph.v) < 20;
    this.pipeK = instant ? (inPipe ? 1 : 0) : damp(this.pipeK, inPipe ? 1 : 0, 1.5, dt);
    if (this.pipeK > 0.01 && ph) want += wrapAngle(Math.atan2(ph.dx, ph.dz) - want) * this.pipeK;
    // swings round behind you with a little lag (you see a bit of your side in a turn)
    const turnRate = air ? 0.9 : fall ? 0.8 : lerp(2.0, 3.1, smooth(2, 25, sp));
    this.yaw = instant ? want : dampAngle(this.yaw, want, turnRate, dt);
    this.dragT += dt; if (this.dragT > 1.5) { this.oYaw = damp(this.oYaw, 0, 1.5, dt); this.oPitch = damp(this.oPitch, 0, 1.5, dt); }
    // how far and how high: close behind and a little above (a bit further and higher when fast)
    const m = this.mode;
    let dist = m === 0 ? 4.7 + clamp(sp * 0.065, 0, 2.3) : m === 1 ? 3.4 + clamp(sp * 0.045, 0, 1.6) : 7.5 + clamp(sp * 0.08, 0, 3);
    let height = m === 0 ? 2.25 + clamp(sp * 0.03, 0, 1.0) : m === 1 ? 1.35 + clamp(sp * 0.02, 0, 0.6) : 2.2;
    if (air) { height += m === 1 ? 0.4 : 0.6; dist += 0.5; }
    if (fall) { height += 1.0; dist += 1.5; }
    height += this.pipeK * 2.5; dist += this.pipeK * 2;
    this.dist = instant ? dist : damp(this.dist, dist, air ? 1.2 : 1.8, dt);
    this.height = instant ? height : damp(this.height, height, air ? 1.2 : 1.8, dt);
    // turning: the camera drifts a little to the side you turn to
    const lat = air || fall ? 0 : clamp(s.incl || 0, -0.8, 0.8) * 1.25;
    this.lat = instant ? lat : damp(this.lat || 0, lat, 2.0, dt);
    // landing: a small soft dip that springs back
    if (!air && this.wasAir && !instant) this.dipV -= Math.min(1.4, 0.25 + Math.max(0, -s.v.y) * 0.05);
    this.wasAir = air;
    this.dipV += (-45 * this.dip - 11 * this.dipV) * dt; this.dip += this.dipV * dt;
    // where the camera wants to be
    const target = _t.copy(s.p); target.y += 1.0;
    let yaw = this.yaw + this.oYaw;
    if (m === 2) yaw += this.side * 1.25;                    // cinematic: off to the side
    const lx = Math.cos(this.yaw), lz = -Math.sin(this.yaw);  // the skier's left (seen from behind)
    _c.set(target.x - Math.sin(yaw) * this.dist + lx * this.lat, target.y + this.height + this.oPitch * 5 + this.dip * 0.4, target.z - Math.cos(yaw) * this.dist + lz * this.lat);
    // stay above the snow here and on the way to the skier (it climbs over a ridge, and on a steep
    // slope it rides up with the snow behind you)
    const clear = m === 1 ? 1.0 : 1.6;
    for (const k of [1, 0.7, 0.4]) {
      const x = lerp(target.x, _c.x, k), z = lerp(target.z, _c.z, k), y = lerp(target.y, _c.y, k);
      const g = Math.max(W.height(x, z), W.drawnHeight(x, z)) + clear * k + 0.35;
      if (y < g) _c.y += (g - y) / k;
    }
    // a drone flies there smoothly: a spring, stiffer when fast (so it never falls behind)
    if (instant) { this.pos.copy(_c); this.vel.set(0, 0, 0); }
    else {
      const w = air ? 3.6 : lerp(3.8, 6.4, smooth(5, 30, sp)), wy = air ? 3.6 : 4.2;
      _d.copy(s.v).multiplyScalar(dt); if (!fall) this.pos.add(_d);
      for (const [ax, ww] of [['x', w], ['z', w], ['y', wy]]) {
        const a = ww * ww * (_c[ax] - this.pos[ax]) - 2 * ww * this.vel[ax];
        this.vel[ax] += a * dt; this.pos[ax] += this.vel[ax] * dt;
      }
      const g = Math.max(W.height(this.pos.x, this.pos.z), W.drawnHeight(this.pos.x, this.pos.z)) + 0.8;
      if (this.pos.y < g) { this.pos.y = g; this.vel.y = Math.max(0, this.vel.y); }
    }
    // a drone holding its place in the wind: a very slight drift
    const t = this.t, hov = m === 1 ? 0.015 : 0.04;
    this.cam.position.set(this.pos.x + Math.sin(t * 0.7) * hov + Math.sin(t * 1.9) * hov * 0.3, this.pos.y + Math.sin(t * 0.9 + 1) * hov * 0.7, this.pos.z + Math.cos(t * 0.6 + 2) * hov);
    // look at the skier and a little ahead; down the slope when it is steep (to see where you go),
    // a little lower in the air (to see the landing)
    const ahead = air ? clamp(sp * 0.15, 0, 3.5) : clamp(sp * 0.22, 0, 4.5);
    const ax = target.x + Math.sin(this.yaw) * ahead + lx * this.lat * 0.35, az = target.z + Math.cos(this.yaw) * ahead + lz * this.lat * 0.35;
    const drop = air ? -0.6 : clamp((W.height(ax, az) - s.p.y) * 0.35, -2.2, 0.4) - 0.3;
    _l.set(ax, target.y + drop - this.pipeK * 1.2, az);
    if (fall) _l.copy(s.p).add(_d.set(0, 0.4, 0));
    if (instant) { this.look.copy(_l); this.lookV.set(0, 0, 0); }
    else {
      const w = 7.5;
      _d.copy(s.v).multiplyScalar(dt); if (!fall) this.look.add(_d);
      for (const k of ['x', 'y', 'z']) { const a = w * w * (_l[k] - this.look[k]) - 2 * w * this.lookV[k]; this.lookV[k] += a * dt; this.look[k] += this.lookV[k] * dt; }
    }
    // a big landing or a crash: a short, soft shake (never on small ones)
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.8); const a = this.shake * this.shake * 0.1;
      this.cam.position.x += Math.sin(t * 37) * a; this.cam.position.y += Math.sin(t * 29 + 1) * a;
    }
    const kmh = sp * 3.6;
    if (kmh > 70 && !air) { const a = Math.min(0.02, (kmh - 70) / 3000); this.cam.position.x += Math.sin(t * 23) * a; this.cam.position.y += Math.sin(t * 31 + 2) * a; }
    this.cam.lookAt(this.look);
    // wider the faster you go
    const fov = (m === 1 ? 64 : 60) + clamp((kmh - 15) / 85, 0, 1) * 15 + (air ? 2 : 0);
    this.fov = instant ? fov : damp(this.fov, fov, 1.6, dt);
    if (Math.abs(this.cam.fov - this.fov) > 0.05) { this.cam.fov = this.fov; this.cam.updateProjectionMatrix(); }
  }
}
