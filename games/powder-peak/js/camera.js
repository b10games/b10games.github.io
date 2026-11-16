// The riding camera: low and close behind the rider, tilted with the slope, so the rider sits in the
// lower third of the screen and you look down the mountain at where you are going.
//  - it follows the direction you slide (not where the body points), so flips and spins never spin it
//  - it tilts with the general slope ahead of you (not every little bump)
//  - a bit further back and wider when you go fast, a bit higher and looking ahead to the landing in the air
//  - never under the snow; drag to look around, it swings back by itself
import { THREE, clamp, lerp, damp, dampAngle, smooth } from './engine.js';

const _t = new THREE.Vector3(), _f = new THREE.Vector3(), _l = new THREE.Vector3(), _c = new THREE.Vector3();

export class ChaseCam {
  constructor(camera, world) {
    this.cam = camera; this.world = world;
    this.yaw = 0; this.pitch = 0.3; this.dist = 5; this.h = 1.6;
    this.target = new THREE.Vector3(); this.look = new THREE.Vector3(); this.pos = new THREE.Vector3();
    this.oYaw = 0; this.oPitch = 0; this.dragT = 99; this.fov = 62; this.shake = 0; this.sens = 1;
  }
  snap(r) { this.update(0, r, true); }
  travelYaw(r) {
    const hz = Math.hypot(r.v.x, r.v.z);
    return hz > 1.5 ? Math.atan2(r.v.x, r.v.z) : r.yaw;
  }
  // how steep the snow is in the direction we look (positive = downhill), measured over 16 m
  slopeAlong(p, yaw) {
    const s = Math.sin(yaw), c = Math.cos(yaw), W = this.world;
    const ahead = W.height(p.x + s * 9, p.z + c * 9), behind = W.height(p.x - s * 7, p.z - c * 7);
    return Math.atan2(behind - ahead, 16);
  }
  drag(dx, dy) { this.oYaw -= dx * 0.005 * this.sens; this.oPitch = clamp(this.oPitch + dy * 0.004 * this.sens, -0.45, 0.8); this.dragT = 0; }
  update(dt, r, instant = false) {
    const air = !r.grounded && r.state !== 'bail', sp = r.speed, kmh = sp * 3.6;
    // direction: where you slide. Quick to follow on the snow, calm in the air.
    const want = this.travelYaw(r);
    this.yaw = instant ? want : dampAngle(this.yaw, want, air ? 1.1 : lerp(2.4, 4.2, smooth(2, 25, sp)), dt);
    // tilt: the slope ahead; in the air slowly towards the flight, looking down at the landing
    let pitch = clamp(this.slopeAlong(r.p, this.yaw), -0.15, 0.75);
    if (air) { const hz = Math.max(2, Math.hypot(r.v.x, r.v.z)); pitch = clamp(Math.atan2(-r.v.y, hz) * 0.55 + 0.12, -0.1, 0.8); }
    this.pitch = instant ? pitch : damp(this.pitch, pitch, air ? 1.6 : 3, dt);
    // distance and height: closer when slow, further back when fast, a little more room in the air
    const dist = 4.3 + clamp(sp * 0.06, 0, 2.4) + (air ? 1.4 : 0) + (r.state === 'bail' ? 1.2 : 0);
    const h = 1.55 + clamp(sp * 0.012, 0, 0.5) + (air ? 0.5 : 0);
    this.dist = instant ? dist : damp(this.dist, dist, 2.2, dt);
    this.h = instant ? h : damp(this.h, h, 2.2, dt);
    // follow the rider (a little lag, so speed and landings are felt)
    _t.set(r.p.x, r.p.y + 1.0, r.p.z);
    if (instant) this.target.copy(_t); else this.target.lerp(_t, 1 - Math.exp(-(air ? 14 : 20) * dt));
    this.dragT += dt;
    if (this.dragT > 1.2) { this.oYaw = damp(this.oYaw, 0, 2.5, dt); this.oPitch = damp(this.oPitch, 0, 2.5, dt); }
    const yaw = this.yaw + this.oYaw, pt = this.pitch;
    // forward along the slope (pointing downhill as much as the slope does)
    _f.set(Math.sin(yaw) * Math.cos(pt), -Math.sin(pt), Math.cos(yaw) * Math.cos(pt));
    // the camera: behind along the slope and up; dragging tilts it around the rider
    const op = this.oPitch;
    _c.copy(_f).multiplyScalar(-this.dist * Math.cos(op)).add(this.target);
    _c.y += this.h + Math.sin(op) * this.dist;
    // stay above the snow behind you
    const g = this.world.height(_c.x, _c.z) + 0.8;
    if (_c.y < g) _c.y = g;
    this.pos.copy(_c);
    this.cam.position.copy(this.pos);
    // look down the mountain ahead of the rider; the rider ends up in the lower third
    _l.copy(this.target).addScaledVector(_f, 10); _l.y -= 0.15 + (air ? 0.8 : 0);
    if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt * 2.5); const a = this.shake * 0.22; this.cam.position.x += (Math.random() - 0.5) * a; this.cam.position.y += (Math.random() - 0.5) * a; }
    // a light buzz at high speed
    if (kmh > 70 && !air) { const a = (kmh - 70) / 400; this.cam.position.x += (Math.random() - 0.5) * a; this.cam.position.y += (Math.random() - 0.5) * a; }
    this.cam.lookAt(_l);
    const fov = lerp(60, 77, clamp((kmh - 20) / 85, 0, 1));
    this.fov = instant ? fov : damp(this.fov, fov, 2, dt);
    if (Math.abs(this.cam.fov - this.fov) > 0.05) { this.cam.fov = this.fov; this.cam.updateProjectionMatrix(); }
  }
}
