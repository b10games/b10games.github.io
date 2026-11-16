// Third person camera: behind the rider, looking where they are going. Further back and wider when fast,
// steady in the air (it follows the flight, not the flips), never under the snow.
// Drag with the mouse or a finger to look around; it swings back by itself.
import { THREE, clamp, lerp, damp, dampAngle, wrapAngle } from './engine.js';

const _t = new THREE.Vector3(), _d = new THREE.Vector3(), _l = new THREE.Vector3();

export class ChaseCam {
  constructor(camera, world) {
    this.cam = camera; this.world = world;
    this.yaw = 0; this.pitch = 0.2; this.dist = 6.5; this.look = new THREE.Vector3(); this.pos = new THREE.Vector3();
    this.oYaw = 0; this.oPitch = 0; this.dragT = 99; this.fov = 60; this.shake = 0; this.sens = 1;
    this.mode = 'chase';
  }
  snap(r) { this.yaw = this.travelYaw(r); this.update(0, r, true); }
  travelYaw(r) {
    const hz = Math.hypot(r.v.x, r.v.z);
    return hz > 2 ? Math.atan2(r.v.x, r.v.z) : r.yaw;
  }
  drag(dx, dy) { this.oYaw -= dx * 0.005 * this.sens; this.oPitch = clamp(this.oPitch + dy * 0.004 * this.sens, -0.35, 0.9); this.dragT = 0; }
  update(dt, r, instant = false) {
    const air = !r.grounded && r.state !== 'bail', sp = r.speed;
    // where to look from: behind the direction of travel
    const want = this.travelYaw(r);
    this.yaw = instant ? want : dampAngle(this.yaw, want, air ? 1.3 : sp > 3 ? 3.2 : 1.6, dt);
    this.dragT += dt;
    if (this.dragT > 1.4) { this.oYaw = damp(this.oYaw, 0, 2.2, dt); this.oPitch = damp(this.oPitch, 0, 2.2, dt); }
    const yaw = this.yaw + this.oYaw;
    const dist = clamp(6.2 + sp * 0.075, 6.2, 9.5) + (air ? 1.6 : 0);
    const pitch = clamp(0.2 + (air ? 0.12 : 0) + this.oPitch, -0.3, 1.1);
    this.dist = instant ? dist : damp(this.dist, dist, 2.5, dt);
    _t.set(r.p.x, r.p.y + 1.35, r.p.z);
    if (instant) this.look.copy(_t); else this.look.lerp(_t, 1 - Math.exp(-(air ? 12 : 16) * dt));
    _d.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(this.dist);
    this.pos.copy(this.look).add(_d);
    // stay above the snow (and look over a ridge rather than through it)
    const g = this.world.height(this.pos.x, this.pos.z) + 1.3;
    if (this.pos.y < g) this.pos.y = g;
    this.cam.position.copy(this.pos);
    // look a bit ahead, and in the air a bit down towards the landing
    _l.copy(this.look); _l.x += Math.sin(this.yaw) * 2.2; _l.z += Math.cos(this.yaw) * 2.2; _l.y += air ? -0.6 : 0.2;
    if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt * 2.5); const a = this.shake * 0.25; this.cam.position.x += (Math.random() - 0.5) * a; this.cam.position.y += (Math.random() - 0.5) * a; }
    this.cam.lookAt(_l);
    const fov = lerp(58, 74, clamp((sp - 8) / 26, 0, 1));
    this.fov = instant ? fov : damp(this.fov, fov, 2, dt);
    if (Math.abs(this.cam.fov - this.fov) > 0.05) { this.cam.fov = this.fov; this.cam.updateProjectionMatrix(); }
  }
}
