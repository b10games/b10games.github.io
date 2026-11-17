// The game modes: Free Ride, Trick Challenge, Time Trial and Multiplayer Free Ride.
// A Session runs one go of a mode: where you start, the clock, the gates, the score and the end screen.
import { THREE, clamp, canvasTex } from './engine.js';
import { DROPS, COURSES, TRICK_SPOTS, lineDist } from './world.js';
import { LIPS } from './terrain.js';
import { MODES } from './data.js';

export const fmtTime = ms => { ms = Math.max(0, ms); const m = Math.floor(ms / 60000), s = Math.floor(ms / 1000) % 60, c = Math.floor(ms / 10) % 100; return `${m}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`; };
export const fmtNum = n => Math.round(n).toLocaleString('en-US');

function gateMesh(finish) {
  const g = new THREE.Group();
  const poleM = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5 }), w = 15;
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 5.2, 10), poleM); p.position.set(s * w / 2, 2.6, 0); g.add(p); }
  const tex = canvasTex(512, 64, (c, W, H) => {
    if (finish) { for (let x = 0; x < 32; x++) for (let y = 0; y < 4; y++) { c.fillStyle = (x + y) % 2 ? '#111' : '#fff'; c.fillRect(x * 16, y * 16, 16, 16); } }
    else { c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, H); }
    c.fillStyle = finish ? '#ffd84a' : '#0b2a55'; c.font = '900 italic 46px "Barlow Condensed", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    if (finish) { c.fillStyle = 'rgba(0,0,0,.65)'; c.fillRect(150, 6, 212, 52); c.fillStyle = '#ffd84a'; }
    c.fillText(finish ? 'FINISH' : 'POWDER PEAK', W / 2, H / 2 + 2);
  });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  const bannerM = new THREE.MeshStandardMaterial({ color: '#ffffff', map: tex, roughness: 0.6, side: THREE.DoubleSide, emissive: '#ffffff', emissiveIntensity: 0.15, emissiveMap: tex });
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, 1.3, 0.15), [poleM, poleM, poleM, poleM, bannerM, bannerM]); b.position.y = 5.1; g.add(b);
  g.userData = { poleM, bannerM };
  return g;
}
function marker() {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.16, 8, 32), new THREE.MeshBasicMaterial({ color: '#ffd84a', transparent: true, opacity: 0.85 }));
  g.add(ring);
  const a = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.1, 4), new THREE.MeshBasicMaterial({ color: '#ffd84a' })); a.rotation.x = Math.PI; a.position.y = -2.2; g.add(a);
  return g;
}

export class Session {
  constructor(app, mode, opt = {}) {
    this.app = app; this.mode = mode; this.opt = opt; this.world = app.world; this.r = app.ctrl;
    this.def = MODES.find(m => m.id === mode);
    this.objs = []; this.score = 0; this.time = 0; this.over = false; this.landed = []; this.bestJump = 0;
    this.party = !!opt.party;
  }
  add(o) { this.world.scene.add(o); this.objs.push(o); return o; }
  dispose() { for (const o of this.objs) { this.world.scene.remove(o); o.traverse(c => { if (c.geometry) c.geometry.dispose(); }); } this.objs = []; }

  // ---------- start ----------
  start() {
    const m = this.mode;
    if (m === 'free' || m === 'mpfree') {
      const d = DROPS.find(x => x.id === this.opt.drop) || DROPS[0];
      this.spawnAt = d; this.spawnRider(d.x, d.z);
      this.app.banner(this.def.name, d.name, 2.2);
    } else if (m === 'tricks') {
      const s = this.spot = TRICK_SPOTS.find(x => x.id === this.opt.spot) || TRICK_SPOTS[0];
      this.spawnAt = s; this.spawnRider(s.x, s.z);
      this.left = s.time;
      // rings over the jumps in this area
      this.markers = [];
      for (const l of LIPS) if (Math.hypot(l.x - s.x, l.z - s.z) < 1400) { const mk = this.add(marker()); mk.position.set(l.x, this.world.height(l.x, l.z) + 7, l.z); this.markers.push(mk); }
      this.app.banner('Trick Challenge', s.name + ' · 3:00 · jump off the yellow rings', 2.6);
    } else if (m === 'time') {
      const c = this.course = COURSES[this.opt.course] || Object.values(COURSES)[0];
      const pts = c.gates;
      this.gates = pts.slice(1).map((p, i) => {
        const prev = pts[i], dx = p[0] - prev[0], dz = p[1] - prev[1], l = Math.hypot(dx, dz);
        const finish = i === pts.length - 2;
        const mesh = this.add(gateMesh(finish)); mesh.position.set(p[0], this.world.height(p[0], p[1]), p[1]); mesh.rotation.y = Math.atan2(dx, dz);
        return { x: p[0], z: p[1], dx: dx / l, dz: dz / l, mesh, passed: false, finish, side: 0 };
      });
      this.gi = 0; this.penalty = 0; this.spawnAt = { x: pts[0][0], z: pts[0][1] };
      this.spawnRider(pts[0][0], pts[0][1], Math.atan2(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]));
      this.countdown();
      this.paintGates();
    }
  }
  spawnRider(x, z, yaw) { this.r.spawn(x, z, yaw); this.app.afterSpawn(); }
  countdown() {
    this.r.state = 'frozen'; this.count = 3.6; this.running = false; this.time = 0;
  }
  respawn() {
    this.spawnY = null;
    if (this.mode === 'time') { for (const g of this.gates) g.passed = false; this.gi = 0; this.penalty = 0; this.paintGates(); this.spawnRider(this.spawnAt.x, this.spawnAt.z, Math.atan2(this.gates[0].x - this.spawnAt.x, this.gates[0].z - this.spawnAt.z)); this.countdown(); return; }
    this.spawnRider(this.spawnAt.x, this.spawnAt.z);
  }
  dropAt(id) { const d = DROPS.find(x => x.id === id); if (!d) return; this.spawnAt = d; this.spawnRider(d.x, d.z); this.app.banner(d.name, '', 1.4); }
  paintGates() {
    this.gates.forEach((g, i) => {
      const next = i === this.gi, c = g.passed ? '#4ade80' : next ? '#ffd84a' : '#ffffff';
      g.mesh.userData.poleM.color.set(c); g.mesh.userData.poleM.emissive = new THREE.Color(next ? '#ffb700' : '#000000'); g.mesh.userData.poleM.emissiveIntensity = next ? 0.6 : 0;
      g.mesh.visible = !g.passed || i >= this.gi - 1;
    });
  }

  // ---------- every frame ----------
  update(dt) {
    const r = this.r, app = this.app;
    if (this.mode === 'time') {
      if (this.count > 0) {
        const before = Math.ceil(this.count - 0.6);
        this.count -= dt;
        const now = Math.ceil(this.count - 0.6);
        if (now !== before && now > 0) { app.banner(String(now), this.course.name, 0.8); app.sound.sfx('beep'); }
        if (this.count <= 0.6 && !this.running) { this.running = true; r.state = 'ride'; app.banner('GO!', '', 0.8); app.sound.sfx('go'); }
        if (this.count <= 0) this.count = 0;
      }
      if (this.running && !this.over) {
        this.time += dt * 1000;
        const g = this.gates[this.gi];
        if (g) {
          const rx = r.p.x - g.x, rz = r.p.z - g.z, along = rx * g.dx + rz * g.dz, side = Math.abs(rx * g.dz - rz * g.dx);
          if (g.prevAlong !== undefined && g.prevAlong < 0 && along >= 0 && side < 9.5) { g.passed = true; this.gi++; app.sound.sfx('gate'); this.paintGates(); if (g.finish) this.finish(); }
          else if (along > 30 || (along > 0 && g.prevAlong !== undefined && g.prevAlong < 0 && side >= 9.5)) {
            // went past without going through
            if (!g.finish) { this.penalty += 5000; this.gi++; app.toast('Missed a gate: +5 seconds', true); app.sound.sfx('error'); this.paintGates(); }
            else if (along > 30) { this.penalty += 5000; this.finish(); }
          }
          g.prevAlong = along;
        }
      }
    } else if (this.mode === 'tricks' && !this.over) {
      this.left -= dt;
      if (this.left <= 0) { this.left = 0; if (r.grounded || r.state === 'bail') this.finishTricks(); }
    }
    if (this.markers) { const t = performance.now() / 1000; this.markers.forEach((m, i) => { m.position.y += Math.sin(t * 2 + i) * 0.01; m.rotation.y = t * 1.5 + i; }); }
    this.nearLift = false;
  }
  // a landing: count the points
  onLand(res) {
    if (this.over) return;
    if (this.mode === 'tricks' && this.left <= 0 && res.total <= 0) return;
    if (res.total > 0) { this.score += res.total; this.landed.push(res); this.bestJump = Math.max(this.bestJump, res.total); }
  }

  // ---------- the end ----------
  finish() {
    if (this.over) return;
    this.over = true;
    const total = this.time + this.penalty;
    this.result = { kind: 'time', ms: total, penalty: this.penalty, course: this.course.name };
    this.app.sessionOver(this);
  }
  finishTricks() {
    if (this.over) return;
    this.over = true;
    this.result = { kind: 'tricks', score: this.score, jumps: this.landed.length, best: this.bestJump, spot: this.spot.name };
    this.app.sessionOver(this);
  }

  // what the top-left corner of the screen shows
  info() {
    if (this.mode === 'time') {
      const g = this.gates[this.gi];
      return { big: fmtTime(this.time + this.penalty), small: `Gate ${Math.min(this.gi + 1, this.gates.length)} / ${this.gates.length}` + (this.penalty ? ` · +${this.penalty / 1000}s` : ''), target: g && !this.over ? g : null };
    }
    if (this.mode === 'tricks') { const l = Math.ceil(this.left); return { big: `${Math.floor(l / 60)}:${String(l % 60).padStart(2, '0')}`, small: 'Trick Challenge · ' + this.spot.name }; }
    return { big: '', small: this.party ? 'Multiplayer Free Ride' : 'Free Ride' };
  }
}
export { lineDist };
