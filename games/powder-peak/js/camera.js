// The riding camera: close behind the rider, low and laid along the slope (behind you and a little above
// the snow surface), so it feels like the camera is skiing right behind you.
//  - it looks a little ahead of you (more when fast), so you see the snow you are about to ride
//  - everything is eased with springs: no jitter, a soft dip when you land, a slight bank in turns
//  - it aims so the rider always sits a bit below the middle of the picture: on gentle snow you see the
//    horizon and the mountains, on a steep face you look down the fall line
//  - follows the direction you slide (flips and spins never spin it), trails a little in turns
//  - a touch further back and wider when fast, a little more room in the air
//  - never under the snow; drag to look around, it swings back by itself
import { THREE, clamp, lerp, damp, dampAngle, smooth } from './engine.js';

const _t = new THREE.Vector3(), _f = new THREE.Vector3(), _n = new THREE.Vector3(), _c = new THREE.Vector3(), _l = new THREE.Vector3();
const FRAME = 0.14;        // how far below the middle of the picture the rider sits (radians, ~8°)

export class ChaseCam {
  constructor(camera, world) {
    this.cam = camera; this.world = world;
    this.yaw = 0; this.pitch = 0.3; this.dist = 2.7; this.lift = 1.0; this.aim = 0.1; this.roll = 0; this.dip = 0; this.dipV = 0; this.wasAir = false; this.look = 0;
    this.target = new THREE.Vector3(); this.pos = new THREE.Vector3(); this.has = false; this.off = new THREE.Vector3();
    this.oYaw = 0; this.oPitch = 0; this.dragT = 99; this.fov = 64; this.shake = 0; this.sens = 1;
  }
  snap(r) { this.update(0, r, true); }
  travelYaw(r) {
    const hz = Math.hypot(r.v.x, r.v.z);
    return hz > 1.5 ? Math.atan2(r.v.x, r.v.z) : r.yaw;
  }
  // how steep the snow is in the direction we look (positive = downhill), over about 16 m
  slopeAlong(p, yaw) {
    const s = Math.sin(yaw), c = Math.cos(yaw), W = this.world;
    return Math.atan2(W.height(p.x - s * 6, p.z - c * 6) - W.height(p.x + s * 10, p.z + c * 10), 16);
  }
  drag(dx, dy) { this.oYaw -= dx * 0.005 * this.sens; this.oPitch = clamp(this.oPitch + dy * 0.004 * this.sens, -0.5, 0.9); this.dragT = 0; }
  // vis: how far the drawn snow is above (or below) the exact snow where the rider is
  update(dt, r, instant = false, vis = 0) {
    const air = !r.grounded && r.state !== 'bail', sp = r.speed, kmh = sp * 3.6, W = this.world;
    instant = instant || !this.has; this.has = true;
    // direction: where you slide, trailing a little in turns
    const want = this.travelYaw(r);
    this.yaw = instant ? want : dampAngle(this.yaw, want, air ? 1.0 : lerp(2.0, 3.4, smooth(2, 25, sp)), dt);
    // the slope we ride on (smoothed); in the air the flight decides
    let pitch = clamp(this.slopeAlong(r.p, this.yaw), -0.25, 0.95);
    if (air) { const hz = Math.max(2, Math.hypot(r.v.x, r.v.z)); pitch = clamp(Math.atan2(-r.v.y, hz) * 0.5 + 0.08, -0.2, 0.8); }
    this.pitch = instant ? pitch : damp(this.pitch, pitch, air ? 1.2 : 2.4, dt);
    // close: 3 m behind when slow, about 3.8 m when fast, a little more in the air
    // on very steep faces it comes closer (otherwise it would hang high above you)
    const steep = 1 - 0.35 * smooth(0.45, 0.95, this.pitch);
    const dist = (3.0 + clamp(sp * 0.03, 0, 0.85)) * steep + (air ? 0.7 : 0) + (r.state === 'bail' ? 1.4 : 0);
    const lift = 0.95 + clamp(sp * 0.005, 0, 0.25) + (air ? 0.35 : 0);
    this.dist = instant ? dist : damp(this.dist, dist, air ? 1.6 : 2.2, dt);
    this.lift = instant ? lift : damp(this.lift, lift, 2.0, dt);
    // landing: the camera dips a little and springs back (bigger landings, bigger dip)
    if (!air && this.wasAir && !instant) this.dipV -= Math.min(2.2, 0.5 + Math.max(0, -r.v.y) * 0.08);
    this.wasAir = air;
    this.dipV += (-60 * this.dip - 11 * this.dipV) * dt; this.dip += this.dipV * dt;
    // the point we follow: exactly where the rider is sideways and along the track (so the camera never
    // falls behind when fast), a touch softer up and down (bumps do not shake it)
    _t.set(r.p.x, r.p.y + 0.85 + vis + this.dip * 0.25, r.p.z);
    if (instant) this.target.copy(_t);
    else { this.target.x = _t.x; this.target.z = _t.z; this.target.y += (_t.y - this.target.y) * (1 - Math.exp(-(air ? 14 : 20) * dt)); }
    this.dragT += dt;
    if (this.dragT > 1.2) { this.oYaw = damp(this.oYaw, 0, 2.5, dt); this.oPitch = damp(this.oPitch, 0, 2.5, dt); }
    const yaw = this.yaw + this.oYaw, pt = this.pitch + this.oPitch * 0.6;
    // along the slope: forward (down the slope) and the slope's up direction
    const cp = Math.cos(pt), spt = Math.sin(pt);
    _f.set(Math.sin(yaw) * cp, -spt, Math.cos(yaw) * cp);
    _n.set(Math.sin(yaw) * spt, cp, Math.cos(yaw) * spt);
    _c.copy(this.target).addScaledVector(_f, -this.dist).addScaledVector(_n, this.lift + Math.max(0, this.oPitch) * 2.5);
    // never in the snow
    const g = Math.max(W.height(_c.x, _c.z), W.drawnHeight(_c.x, _c.z)) + 0.6;
    if (_c.y < g) _c.y = g;
    // the camera's place relative to the rider is eased (it swings round smoothly in turns), but it is
    // always that close: speed never makes it fall back
    _c.sub(this.target);
    if (instant) this.off.copy(_c);
    else { const kh = 1 - Math.exp(-(air ? 6 : 10) * dt), kv = 1 - Math.exp(-(air ? 5 : 8) * dt); this.off.x += (_c.x - this.off.x) * kh; this.off.z += (_c.z - this.off.z) * kh; this.off.y += (_c.y - this.off.y) * kv; }
    this.pos.copy(this.target).add(this.off);
    const g2 = Math.max(W.height(this.pos.x, this.pos.z), W.drawnHeight(this.pos.x, this.pos.z)) + 0.5; if (this.pos.y < g2) this.pos.y = g2;
    this.cam.position.copy(this.pos);
    // aim: a point a little ahead of the rider (more when fast), with the rider a bit below the middle
    const la = instant || air ? 0 : clamp(sp * 0.11, 0, 3.5);
    this.look = instant ? la : damp(this.look, la, 2, dt);
    const tx = this.target.x + Math.sin(this.yaw) * this.look, tz = this.target.z + Math.cos(this.yaw) * this.look;
    const dx = tx - this.pos.x, dz = tz - this.pos.z, dy = this.target.y - this.pos.y;
    const toRider = Math.atan2(-dy, Math.hypot(dx, dz));            // how far down the rider is from the camera
    const aim = toRider - FRAME * (air ? 0.4 : 1);
    this.aim = instant ? aim : damp(this.aim, aim, 9, dt);
    const ay = Math.atan2(dx, dz);
    _l.set(this.pos.x + Math.sin(ay) * Math.cos(this.aim) * 10, this.pos.y - Math.sin(this.aim) * 10, this.pos.z + Math.cos(ay) * Math.cos(this.aim) * 10);
    // shake: smooth wobbles (not random jumps) after a crash, and a light buzz when very fast
    const t = (this.t = (this.t || 0) + dt);
    if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt * 2.5); const a = this.shake * 0.12; this.cam.position.x += Math.sin(t * 37) * a; this.cam.position.y += Math.sin(t * 29 + 1) * a; }
    if (kmh > 70 && !air) { const a = Math.min(0.05, (kmh - 70) / 900); this.cam.position.x += Math.sin(t * 23) * a; this.cam.position.y += Math.sin(t * 31 + 2) * a; }
    this.cam.lookAt(_l);
    // bank a little into turns
    const roll = air || r.state === 'bail' ? 0 : -(r.lean || 0) * 0.045 * smooth(4, 20, sp);
    this.roll = instant ? roll : damp(this.roll, roll, 3, dt);
    if (this.roll) this.cam.rotateZ(this.roll);
    const fov = lerp(60, 74, clamp((kmh - 20) / 90, 0, 1));
    this.fov = instant ? fov : damp(this.fov, fov, 2, dt);
    if (Math.abs(this.cam.fov - this.fov) > 0.05) { this.cam.fov = this.fov; this.cam.updateProjectionMatrix(); }
  }
}
