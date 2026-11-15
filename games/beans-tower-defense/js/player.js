// Walking around on the map yourself ("GO IN"): a big, all white player bean with a detailed walk cycle,
// the controller that moves it (keys, touch stick, jumping, bumping into beans), the camera behind it,
// and the other players in a party (their bean, name tag and the bean they are about to place).
import { THREE, damp, clamp } from './engine.js';
import { FIELD, BEAN, FARM } from './data.js';
import { Bean, TowerBean, FarmModel } from './bean.js';

export const PLAYER_SCALE = 3.3;            // a lot taller than the beans on the map (they are 1.75)
const WALK = 11, RUN = 17.5, JUMP = 21, GRAVITY = 58, BODY_R = 1.25;
export const PLAYER_COLORS = ['#ffd23f', '#4cc9f0', '#ff6fb5', '#7bd389', '#c77dff', '#ff8c42'];

// ---------- the player bean ----------
export class PlayerBean extends Bean {
  constructor() {
    // white, but not so bright that the glow (bloom) makes it shine like a lamp
    super('plain', ['#c6c6c6', '#bababa']);
    this.bodyMat.clearcoat = 0.12; this.bodyMat.sheen = 0; this.bodyMat.roughness = 0.58; this.bodyMat.envMapIntensity = 0.6;
    this.limbMat.color.set('#bdbdbd'); this.limbMat.roughness = 0.6;
    this.root.scale.setScalar(PLAYER_SCALE);
    this.shoes = this.legs.map(l => l.children[1]);
    this.walkK = 0; this.runK = 0; this.airK = 0; this.phase = 0; this.lookY = 0; this.lookT = 2.5; this.roll = 0;
    this.onStep = null;
  }
  land(power = 1) { this.sqV = -7 * power; }
  // st: { speed (world units / s), run, air, vy, turn (rad / s) }
  update(dt, st) {
    this.t += dt;
    const P = this.pivot, spd = st.speed || 0;
    this.walkK = damp(this.walkK, clamp(spd / 5, 0, 1), 9, dt);
    this.runK = damp(this.runK, st.run && spd > WALK + 1 ? 1 : 0, 6, dt);
    this.airK = damp(this.airK, st.air ? 1 : 0, st.air ? 12 : 22, dt);
    // a springy squash (landing, footsteps)
    this.sqV += (1 - this.sq) * 230 * dt; this.sqV *= Math.exp(-10 * dt); this.sq += this.sqV * dt;
    // the walk cycle moves with the distance walked, so the feet do not slide over the ground
    const stride = 2.9 + this.runK * 2.2, prev = this.phase;
    if (!st.air) this.phase += dt * spd / stride * Math.PI * 2;
    else this.phase += dt * 2;
    const s = Math.sin(this.phase), c = Math.cos(this.phase), W = this.walkK * (1 - this.airK), A = this.airK;
    if (W > 0.35 && Math.floor(prev / Math.PI) !== Math.floor(this.phase / Math.PI)) { this.sqV -= 1.6 + this.runK * 1.4; if (this.onStep) this.onStep(Math.floor(this.phase / Math.PI) % 2 ? 1 : -1, this.runK); }
    // legs swing, the foot moving forward lifts, the foot behind pushes off with its toes
    const legAmp = 0.6 + this.runK * 0.42;
    let legL = s * legAmp * W, legR = -legL;
    const liftL = Math.max(0, -c) * (0.09 + this.runK * 0.07) * W, liftR = Math.max(0, c) * (0.09 + this.runK * 0.07) * W;
    let toeL = (Math.max(0, s) * 0.55 - Math.max(0, -s) * 0.25) * W, toeR = (Math.max(0, -s) * 0.55 - Math.max(0, s) * 0.25) * W;
    // arms swing the other way; running pumps them harder and a bit forward
    const armAmp = 0.5 + this.runK * 0.8;
    let armL = (-s * armAmp - this.runK * 0.45) * W, armR = (s * armAmp - this.runK * 0.45) * W;
    let armZ = 0.15 + Math.abs(s) * 0.06 * W;
    // idle: breathing, a slow weight shift, looking around now and then
    const idle = 1 - this.walkK;
    armL += Math.sin(this.t * 2.1) * 0.04 * idle; armR -= Math.sin(this.t * 2.1 + 0.6) * 0.04 * idle; armZ += Math.sin(this.t * 2.1) * 0.025 * idle;
    this.lookT -= dt;
    if (this.lookT <= 0) { this.lookT = 2 + Math.random() * 3.5; this.lookY = idle > 0.6 && Math.random() < 0.65 ? (Math.random() - 0.5) * 1.1 : 0; }
    // jumping: knees up, arms up, stretch on the way up
    if (A > 0.01) { legL = legL * (1 - A) - 0.75 * A; legR = legR * (1 - A) - 0.25 * A; armL = armL * (1 - A) - 2.3 * A; armR = armR * (1 - A) - 2.0 * A; armZ = armZ * (1 - A) + 0.75 * A; toeL *= 1 - A; toeR *= 1 - A; }
    const stretch = A * clamp((st.vy || 0) / 45, -0.1, 0.16);
    const sq = clamp(this.sq, 0.72, 1.3) * (1 + stretch) * (1 + Math.sin(this.t * 2.2) * 0.012 * idle);
    P.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    // body: bounces twice per step, sways over the foot it stands on, leans into speed and into turns
    const bob = Math.abs(c) * (0.055 + this.runK * 0.05) * W + A * 0.04;
    P.position.y = 0.72 + bob - (1 - Math.abs(c)) * 0.015 * W;
    this.roll = damp(this.roll, s * 0.06 * W + clamp(-(st.turn || 0) * 0.05, -0.16, 0.16) * this.walkK + Math.sin(this.t * 0.7) * 0.025 * idle, 10, dt);
    this.lean = damp(this.lean, 0.07 * this.walkK + 0.15 * this.runK - A * 0.1, 8, dt);
    P.rotation.set(this.lean, s * 0.09 * W, this.roll);
    this.face.rotation.y = damp(this.face.rotation.y, this.lookY * idle - s * 0.05 * W, 6, dt);
    this.face.position.y = -bob * 0.25;
    // limbs follow quickly so the cycle stays in step
    const a = this.arms, l = this.legs, k = 26;
    a[0].rotation.x = damp(a[0].rotation.x, armL, k, dt); a[1].rotation.x = damp(a[1].rotation.x, armR, k, dt);
    a[0].rotation.z = damp(a[0].rotation.z, -armZ, k, dt); a[1].rotation.z = damp(a[1].rotation.z, armZ, k, dt);
    l[0].rotation.x = damp(l[0].rotation.x, legL, k, dt); l[1].rotation.x = damp(l[1].rotation.x, legR, k, dt);
    l[0].position.y = -0.4 + liftL; l[1].position.y = -0.4 + liftR;
    this.shoes[0].rotation.x = damp(this.shoes[0].rotation.x, toeL, k, dt); this.shoes[1].rotation.x = damp(this.shoes[1].rotation.x, toeR, k, dt);
    // blink
    this.blinkT -= dt; const blink = this.blinkT < 0.12 ? 0.1 : 1; if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 3;
    this.eyes.forEach(e => { e.scale.y = blink; });
    this.shadow.scale.setScalar(1 - A * 0.35);
  }
}

// ---------- a name over someone's head ----------
export function nameTag(text, color) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 112; const g = c.getContext('2d');
  g.font = '900 54px Nunito, Arial Black, sans-serif';
  const w = Math.min(500, g.measureText(text).width + 110), x0 = (512 - w) / 2;
  g.fillStyle = 'rgba(20, 8, 40, .72)'; g.beginPath(); g.roundRect(x0, 14, w, 84, 42); g.fill();
  g.lineWidth = 5; g.strokeStyle = color; g.stroke();
  g.fillStyle = color; g.beginPath(); g.arc(x0 + 44, 56, 15, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffffff'; g.textBaseline = 'middle'; g.fillText(text, x0 + 72, 59, w - 90);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false }));
  s.scale.set(6.4, 1.4, 1); s.renderOrder = 30;
  return s;
}

// ---------- you, walking ----------
export class Walker {
  constructor(scene, map, fx, audio) {
    this.scene = scene; this.map = map; this.fx = fx; this.audio = audio;
    this.bean = new PlayerBean(); this.bean.root.visible = false; scene.add(this.bean.root);
    this.bean.onStep = (side, run) => this.step(side, run);
    this.x = 0; this.z = 0; this.y = 0; this.vx = 0; this.vz = 0; this.vy = 0; this.air = false; this.yaw = Math.PI; this.turn = 0;
    this.camYaw = 0; this.camPitch = 0.42; this.camDist = 19; this.active = false;
    this.keys = { f: 0, b: 0, l: 0, r: 0, run: 0 }; this.joy = { x: 0, y: 0 }; this.jumpQ = false;
  }
  get speed() { return Math.hypot(this.vx, this.vz); }
  // jump in at a spot (it drops from the sky and lands with a thump)
  enter(x, z, towers) {
    // land on a free spot near there (not inside a tree or right next to one)
    const free = (px, pz) => Math.abs(px) < FIELD.w - 2 && Math.abs(pz) < FIELD.h - 2 && !(this.map.blockers || []).some(b => Math.hypot(b.x - px, b.z - pz) < b.r + 4) && !towers.some(t => Math.hypot(t.x - px, t.z - pz) < 4.2);
    let fx = clamp(x, -FIELD.w + 2, FIELD.w - 2), fz = clamp(z, -FIELD.h + 2, FIELD.h - 2);
    if (!free(fx, fz)) { outer: for (let r = 2; r < 30; r += 2) for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, px = fx + Math.cos(a) * r, pz = fz + Math.sin(a) * r; if (free(px, pz)) { fx = px; fz = pz; break outer; } } }
    this.x = fx; this.z = fz;
    this.collide(towers);
    this.y = this.map.heightAt(this.x, this.z) + 14; this.vy = -6; this.air = true; this.vx = this.vz = 0;
    this.yaw = Math.PI; this.camYaw = 0; this.active = true; this.bean.root.visible = true;
    this.bean.walkK = 0; this.bean.airK = 1;
  }
  leave() {
    this.active = false;
    this.fx.burst(new THREE.Vector3(this.x, this.y + 3, this.z), '#ffffff', 26, 7, 0.3, 4, 0.6);
    this.fx.ring(new THREE.Vector3(this.x, this.y + 0.2, this.z), '#ffffff', 0.5, 5, 0.45);
    this.bean.root.visible = false;
  }
  jump() { if (this.active && !this.air) this.jumpQ = true; }
  step(side, run) {
    const fx = Math.cos(this.yaw) * 0.55 * side, fz = -Math.sin(this.yaw) * 0.55 * side;
    this.fx.dust(new THREE.Vector3(this.x + fx, this.y + 0.1, this.z + fz), run > 0.5 ? 5 : 2);
    if (this.audio) this.audio.sfx('click', run > 0.5 ? 0.12 : 0.07);
  }
  collide(towers) {
    for (const b of this.map.blockers || []) {
      const r = b.r * 0.9 + BODY_R * 0.6, dx = this.x - b.x, dz = this.z - b.z, d = Math.hypot(dx, dz);
      if (d < r && d > 0.001) { this.x = b.x + dx / d * r; this.z = b.z + dz / d * r; }
    }
    for (const t of towers) {
      const r = (t.isFarm ? 2.1 : 1.15) + BODY_R, dx = this.x - t.x, dz = this.z - t.z, d = Math.hypot(dx, dz);
      if (d < r) { const k = d > 0.001 ? 1 / d : 1; this.x = t.x + (d > 0.001 ? dx : 1) * k * r; this.z = t.z + dz * k * r; }
    }
    this.x = clamp(this.x, -FIELD.w - 1, FIELD.w + 1); this.z = clamp(this.z, -FIELD.h - 1, FIELD.h + 1);
  }
  update(dt, towers) {
    this.dt = dt;
    if (!this.active) return;
    // input in camera space: forward is away from the camera
    let ix = this.keys.r - this.keys.l + this.joy.x, iz = this.keys.f - this.keys.b + this.joy.y;
    const il = Math.hypot(ix, iz); if (il > 1) { ix /= il; iz /= il; }
    const fwdX = -Math.sin(this.camYaw), fwdZ = -Math.cos(this.camYaw), rtX = Math.cos(this.camYaw), rtZ = -Math.sin(this.camYaw);
    const run = this.keys.run || Math.hypot(this.joy.x, this.joy.y) > 0.92;
    const top = run ? RUN : WALK, tx = (fwdX * iz + rtX * ix) * top, tz = (fwdZ * iz + rtZ * ix) * top;
    const acc = this.air ? 3.5 : (il > 0.05 ? 11 : 14);
    this.vx = damp(this.vx, tx, acc, dt); this.vz = damp(this.vz, tz, acc, dt);
    this.x += this.vx * dt; this.z += this.vz * dt;
    this.collide(towers);
    // face where you walk
    const sp = this.speed, oldYaw = this.yaw;
    if (sp > 0.6) { let d = Math.atan2(this.vx, this.vz) - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); this.yaw += d * Math.min(1, dt * 11); }
    this.turn = damp(this.turn, (Math.atan2(Math.sin(this.yaw - oldYaw), Math.cos(this.yaw - oldYaw))) / Math.max(dt, 1e-4), 10, dt);
    // gravity, jumping, landing
    const ground = this.map.heightAt(this.x, this.z);
    if (this.jumpQ) { this.jumpQ = false; if (!this.air) { this.vy = JUMP; this.air = true; this.bean.sqV = 4; if (this.audio) this.audio.sfx('throw', 0.35); } }
    if (this.air) {
      this.vy -= GRAVITY * dt; this.y += this.vy * dt;
      if (this.y <= ground) {
        const hard = clamp(-this.vy / 30, 0.3, 1.3);
        this.y = ground; this.vy = 0; this.air = false; this.bean.land(hard);
        const p = new THREE.Vector3(this.x, ground + 0.1, this.z);
        this.fx.dust(p, Math.round(8 + hard * 14)); this.fx.ring(p, '#ffffff', 0.5, 2 + hard * 3, 0.4, 0.6);
        if (this.audio) this.audio.sfx('place', 0.35 * hard);
        if (hard > 0.9 && this.onHardLand) this.onHardLand();
      }
    } else {
      this.y = damp(this.y, ground, 20, dt);
      if (this.y > ground + 0.6) this.air = true;
    }
    const b = this.bean;
    b.root.position.set(this.x, this.y, this.z); b.root.rotation.y = this.yaw;
    b.update(dt, { speed: this.air ? 0 : sp, run, air: this.air, vy: this.vy, turn: this.turn });
  }
  // third person camera: behind and above you, turned with drags
  camPose(outPos, outLook) {
    const ty = this.y + 4.4, sy = Math.sin(this.camYaw), cy = Math.cos(this.camYaw), base = this.camPitch;
    // trees, rocks and candy between the camera and you: the camera tilts up and looks over them
    let need = base;
    const L = Math.cos(base) * this.camDist;
    for (const b of this.map.blockers || []) {
      const along = (b.x - this.x) * sy + (b.z - this.z) * cy; if (along <= 0 || along >= L + b.r) continue;
      const side = Math.abs((b.x - this.x) * cy - (b.z - this.z) * sy); if (side > b.r * 1.15) continue;
      if (along * Math.tan(base) > 3.4) continue;
      need = Math.max(need, Math.min(1.2, Math.atan2(3.4, Math.max(0.6, along - b.r * 0.6))));
    }
    this.pitchFx = damp(this.pitchFx ?? base, need, need > (this.pitchFx ?? base) ? 9 : 2.2, this.dt || 0.016);
    const p = Math.max(base, this.pitchFx), cp = Math.cos(p);
    outLook.set(this.x, ty, this.z);
    outPos.set(this.x + sy * cp * this.camDist, ty + Math.sin(p) * this.camDist, this.z + cy * cp * this.camDist);
    const g = this.map.heightAt(outPos.x, outPos.z) + 1.2; if (outPos.y < g) outPos.y = g;
  }
  orbit(dx, dy) { this.camYaw -= dx * 0.0065; this.camPitch = clamp(this.camPitch + dy * 0.005, 0.08, 1.35); }
  zoom(k) { this.camDist = clamp(this.camDist * k, 9, 46); }
  state() { return [1, +this.x.toFixed(2), +this.y.toFixed(2), +this.z.toFixed(2), +this.yaw.toFixed(3), +this.speed.toFixed(2), this.air ? 1 : 0, this.keys.run ? 1 : 0]; }
  dispose() { this.bean.root.removeFromParent(); }
}

// ---------- the other players in a party ----------
function ghostify(root) {
  root.traverse(o => { if (o.isMesh) { o.castShadow = false; o.material = [].concat(o.material).map(m => { const c = m.clone(); c.transparent = true; c.opacity = Math.min(c.opacity, 0.55); c.depthWrite = false; return c; }); if (o.material.length === 1) o.material = o.material[0]; } });
}
export class RemotePlayer {
  constructor(scene, id, name, color) {
    this.scene = scene; this.id = id; this.name = name; this.color = color;
    this.bean = new PlayerBean(); this.bean.root.visible = false; scene.add(this.bean.root);
    this.tag = nameTag(name, color); this.tag.visible = false; scene.add(this.tag);
    this.x = 0; this.y = 0; this.z = 0; this.yaw = 0; this.speed = 0; this.air = false; this.run = false; this.inside = false; this.seen = false; this.lastYaw = 0;
    this.target = null; this.ghost = null; this.ghostKey = ''; this.gx = 0; this.gz = 0; this.gok = true;
    const ring = new THREE.RingGeometry(0.94, 1, 64); ring.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false })); this.ring.renderOrder = 4; this.ring.visible = false; scene.add(this.ring);
    this.gtag = nameTag(name, color); this.gtag.scale.multiplyScalar(0.75); this.gtag.visible = false; scene.add(this.gtag);
  }
  // s = [inside, x, y, z, yaw, speed, air, run, ghostId, ghostFarm, gx, gz, ok]
  set(s) {
    const inside = !!s[0];
    if (inside && (!this.inside || !this.seen)) { this.x = s[1]; this.y = s[2] + (this.inside ? 0 : 10); this.z = s[3]; this.yaw = s[4]; }
    this.inside = inside; this.seen = true;
    this.target = { x: s[1], y: s[2], z: s[3], yaw: s[4] }; this.speed = s[5]; this.air = !!s[6]; this.run = !!s[7];
    const key = s[8] ? s[8] + (s[9] ? ':f' : '') : '';
    if (key !== this.ghostKey) this.setGhost(key, s[8], !!s[9]);
    this.gx = s[10] || 0; this.gz = s[11] || 0; this.gok = s[12] !== 0;
  }
  setGhost(key, id, farm) {
    this.ghostKey = key;
    if (this.ghost) { this.ghost.root.removeFromParent(); this.ghost = null; }
    if (!key) return;
    const def = farm ? FARM[id] : BEAN[id]; if (!def) return;
    this.ghost = farm ? new FarmModel(id) : new TowerBean(id, def.colors);
    if (!farm) { this.ghost.root.scale.setScalar(1.75); this.ghost.root.rotation.y = Math.PI; }
    ghostify(this.ghost.root); this.ghost.farm = farm; this.ghost.range = farm ? 2.1 : def.base.range;
    this.scene.add(this.ghost.root);
  }
  update(dt, t, map) {
    const b = this.bean;
    b.root.visible = this.inside; this.tag.visible = this.inside;
    if (this.inside && this.target) {
      const k = Math.min(1, dt * 12), T = this.target;
      this.x += (T.x - this.x) * k; this.z += (T.z - this.z) * k; this.y += (T.y - this.y) * Math.min(1, dt * 16);
      let d = T.yaw - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); this.yaw += d * k;
      const turn = d * 12;
      b.root.position.set(this.x, this.y, this.z); b.root.rotation.y = this.yaw;
      b.update(dt, { speed: this.air ? 0 : this.speed, run: this.run, air: this.air, vy: 0, turn });
      this.tag.position.set(this.x, this.y + 6.4, this.z);
    }
    const gh = this.ghost;
    this.ring.visible = this.gtag.visible = !!gh;
    if (gh) {
      const y = map.heightAt(this.gx, this.gz);
      gh.root.position.set(this.gx, y + 0.15 + Math.abs(Math.sin(t * 5)) * 0.15, this.gz);
      if (gh.farm) gh.update(dt); else gh.update(dt, { speed: 0 });
      this.ring.position.set(this.gx, 0.13, this.gz); this.ring.scale.setScalar(gh.range); this.ring.material.color.set(this.gok ? this.color : '#ff4d6d');
      this.gtag.position.set(this.gx, y + 4.2, this.gz);
    }
  }
  dispose() { for (const o of [this.bean.root, this.tag, this.ring, this.gtag]) o.removeFromParent(); if (this.ghost) this.ghost.root.removeFromParent(); }
}
