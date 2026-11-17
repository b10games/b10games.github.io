// The riding camera: close behind the rider, laid along the slope (behind you and a little above the snow
// surface), so it feels like the camera is skiing just behind you.
//  - it aims so the rider always sits a bit below the middle of the picture: on gentle snow you see the
//    horizon and the mountains, on a steep face you look down the fall line
//  - follows the direction you slide (flips and spins never spin it), trails a little in turns
//  - a touch further back and wider when fast, a little more room in the air
//  - never under the snow; drag to look around, it swings back by itself
import { THREE, clamp, lerp, damp, dampAngle, smooth } from './engine.js';

const _t = new THREE.Vector3(), _f = new THREE.Vector3(), _n = new THREE.Vector3(), _c = new THREE.Vector3(), _l = new THREE.Vector3();
const FRAME = 0.24;        // how far below the middle of the picture the rider sits (radians, ~14°)

export class ChaseCam {
  constructor(camera, world) {
    this.cam = camera; this.world = world;
    this.yaw = 0; this.pitch = 0.3; this.dist = 3.6; this.lift = 1.3; this.aim = 0.1;
    this.target = new THREE.Vector3(); this.pos = new THREE.Vector3(); this.has = false;
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
  update(dt, r, instant = false) {
    const air = !r.grounded && r.state !== 'bail', sp = r.speed, kmh = sp * 3.6, W = this.world;
    instant = instant || !this.has; this.has = true;
    // direction: where you slide, trailing a little in turns
    const want = this.travelYaw(r);
    this.yaw = instant ? want : dampAngle(this.yaw, want, air ? 1.2 : lerp(2.3, 3.8, smooth(2, 25, sp)), dt);
    // the slope we ride on (smoothed); in the air the flight decides
    let pitch = clamp(this.slopeAlong(r.p, this.yaw), -0.25, 0.95);
    if (air) { const hz = Math.max(2, Math.hypot(r.v.x, r.v.z)); pitch = clamp(Math.atan2(-r.v.y, hz) * 0.5 + 0.08, -0.2, 0.8); }
    this.pitch = instant ? pitch : damp(this.pitch, pitch, air ? 1.4 : 2.6, dt);
    // close: 3.6 m behind when slow, about 5 m when fast, a bit more in the air
    // on very steep faces it comes closer (otherwise it would hang high above you)
    const steep = 1 - 0.4 * smooth(0.45, 0.95, this.pitch);
    const dist = (3.6 + clamp(sp * 0.04, 0, 1.5)) * steep + (air ? 1.2 : 0) + (r.state === 'bail' ? 1.2 : 0);
    const lift = 1.25 + clamp(sp * 0.006, 0, 0.3) + (air ? 0.5 : 0);
    this.dist = instant ? dist : damp(this.dist, dist, 2.4, dt);
    this.lift = instant ? lift : damp(this.lift, lift, 2.4, dt);
    _t.set(r.p.x, r.p.y + 1.0, r.p.z);
    if (instant) this.target.copy(_t); else this.target.lerp(_t, 1 - Math.exp(-(air ? 14 : 24) * dt));
    this.dragT += dt;
    if (this.dragT > 1.2) { this.oYaw = damp(this.oYaw, 0, 2.5, dt); this.oPitch = damp(this.oPitch, 0, 2.5, dt); }
    const yaw = this.yaw + this.oYaw, pt = this.pitch + this.oPitch * 0.6;
    // along the slope: forward (down the slope) and the slope's up direction
    const cp = Math.cos(pt), spt = Math.sin(pt);
    _f.set(Math.sin(yaw) * cp, -spt, Math.cos(yaw) * cp);
    _n.set(Math.sin(yaw) * spt, cp, Math.cos(yaw) * spt);
    _c.copy(this.target).addScaledVector(_f, -this.dist).addScaledVector(_n, this.lift + Math.max(0, this.oPitch) * 2.5);
    // never in the snow
    const g = W.height(_c.x, _c.z) + 0.7;
    if (_c.y < g) _c.y = g;
    if (instant) this.pos.copy(_c); else this.pos.lerp(_c, 1 - Math.exp(-(air ? 8 : 14) * dt));
    const g2 = W.height(this.pos.x, this.pos.z) + 0.6; if (this.pos.y < g2) this.pos.y = g2;
    this.cam.position.copy(this.pos);
    // aim: the rider sits a little below the middle of the picture
    const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z, dy = this.target.y - this.pos.y;
    const toRider = Math.atan2(-dy, Math.hypot(dx, dz));            // how far down the rider is from the camera
    const aim = toRider - FRAME - (air ? 0.06 : 0);
    this.aim = instant ? aim : damp(this.aim, aim, 10, dt);
    const ay = Math.atan2(dx, dz);
    _l.set(this.pos.x + Math.sin(ay) * Math.cos(this.aim) * 10, this.pos.y - Math.sin(this.aim) * 10, this.pos.z + Math.cos(ay) * Math.cos(this.aim) * 10);
    if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt * 2.5); const a = this.shake * 0.2; this.cam.position.x += (Math.random() - 0.5) * a; this.cam.position.y += (Math.random() - 0.5) * a; }
    if (kmh > 70 && !air) { const a = (kmh - 70) / 500; this.cam.position.x += (Math.random() - 0.5) * a; this.cam.position.y += (Math.random() - 0.5) * a; }
    this.cam.lookAt(_l);
    const fov = lerp(64, 80, clamp((kmh - 20) / 90, 0, 1));
    this.fov = instant ? fov : damp(this.fov, fov, 2, dt);
    if (Math.abs(this.cam.fov - this.fov) > 0.05) { this.cam.fov = this.fov; this.cam.updateProjectionMatrix(); }
  }
}
