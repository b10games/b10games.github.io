// The 3D mountain map. M opens and closes it. You see the whole mountain from above, can move, zoom and
// turn it, and press T (or tap DROP IN HERE) to start riding from the spot you point at.
import { THREE, clamp, damp, smooth } from './engine.js';
import { ZONES, COURSES, LIFT, JUMPS, BOUNDS } from './world.js';

const $ = id => document.getElementById(id);
const _v = new THREE.Vector3(), _o = new THREE.Vector3(), _d = new THREE.Vector3(), _n = new THREE.Vector3();
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();

export class MapView {
  constructor(app) {
    this.app = app; this.on = false;
    this.cam = new THREE.PerspectiveCamera(45, 1, 5, 9000);
    this.tx = 0; this.tz = 0; this.yaw = 0; this.pitch = 0.95; this.dist = 1500;
    this.want = { tx: 0, tz: 0, yaw: 0, pitch: 0.95, dist: 1500 };
    this.hover = null; this.pin = null; this.drag = null; this.pinch = null;
    this.group = new THREE.Group(); this.built = false;
    this.labels = [];
    this.wire();
  }
  // ---------- things you only see on the map ----------
  build() {
    const W = this.app.world, g = this.group;
    // the two race courses
    for (const [k, c] of Object.entries(COURSES)) {
      const pts = c.gates.map(([x, z]) => new THREE.Vector3(x, W.height(x, z) + 4, z));
      const curve = new THREE.CatmullRomCurve3(pts);
      const dense = curve.getPoints(pts.length * 12).map(p => { p.y = W.height(p.x, p.z) + 4; return p; });
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(dense), dense.length, 2.2, 6), new THREE.MeshBasicMaterial({ color: k === 'peak' ? '#ffd84a' : '#3ee6ff', transparent: true, opacity: 0.85 }));
      g.add(tube);
    }
    // the lift
    const [ax, az] = LIFT.a, [bx, bz] = LIFT.b, lp = [];
    for (let i = 0; i <= 40; i++) { const t = i / 40, x = ax + (bx - ax) * t, z = az + (bz - az) * t; lp.push(new THREE.Vector3(x, W.height(x, z) + 14, z)); }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lp), 40, 2, 5), new THREE.MeshBasicMaterial({ color: '#ff5f7a' })));
    // jumps
    const cone = new THREE.ConeGeometry(5, 14, 4); cone.rotateX(Math.PI); cone.translate(0, 12, 0);
    const jm = new THREE.InstancedMesh(cone, new THREE.MeshBasicMaterial({ color: '#ff8a3d' }), JUMPS.length), mx = new THREE.Matrix4();
    JUMPS.forEach((j, i) => { const x = j.x + j.dx * j.lk, z = j.z + j.dz * j.lk; mx.makeTranslation(x, W.height(x, z), z); jm.setMatrixAt(i, mx); });
    g.add(jm);
    // you, the cursor and the pin
    this.me = this.marker('#3ee6ff', 1.2); g.add(this.me);
    this.cursor = this.ring('#ffffff'); g.add(this.cursor);
    this.pinMesh = this.marker('#ffd84a', 1); g.add(this.pinMesh);
    this.mates = new Map();
    // labels
    const L = (text, x, z, cls = '') => this.labels.push({ el: this.label(text, cls), x, z, y: W.height(x, z) + 30 });
    L('Mountain Peak', 0, -880, 'zone'); L('Freestyle Park', 0, 20, 'zone'); L('Cliff Area', 450, -200, 'zone'); L('Snowy Forest', -460, -40, 'zone'); L('Village', 0, 800, 'zone');
    L('Lift', LIFT.a[0] + 20, LIFT.a[1], 'lift'); L('Lift top', LIFT.b[0] + 20, LIFT.b[1], 'lift');
    L('Peak to Village', COURSES.peak.gates[0][0] + 40, COURSES.peak.gates[0][1] + 40, 'course y'); L('Forest Run', COURSES.forest.gates[0][0], COURSES.forest.gates[0][1] - 30, 'course c');
    this.meLabel = this.label('YOU', 'me'); this.built = true;
  }
  marker(color, k) {
    const m = new THREE.Group();
    const c = new THREE.Mesh(new THREE.ConeGeometry(9 * k, 30 * k, 16), new THREE.MeshBasicMaterial({ color })); c.rotation.x = Math.PI; c.position.y = 34 * k; m.add(c);
    const r = new THREE.Mesh(new THREE.RingGeometry(10 * k, 14 * k, 32), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.8 })); r.rotation.x = -Math.PI / 2; r.position.y = 1.5; m.add(r);
    return m;
  }
  ring(color) { const r = new THREE.Mesh(new THREE.RingGeometry(9, 12, 32), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthTest: false })); r.rotation.x = -Math.PI / 2; r.renderOrder = 5; return r; }
  label(text, cls) { const el = document.createElement('div'); el.className = 'mlabel ' + cls; el.textContent = text; $('mapLabels').appendChild(el); return el; }

  // ---------- open / close ----------
  toggle() { this.on ? this.close() : this.open(); }
  open() {
    const app = this.app; if (app.state !== 'game' || this.on) return;
    if (!this.built) this.build();
    this.on = true;
    app.world.scene.add(this.group);
    const r = app.ctrl.p;
    // start with the whole mountain in view, seen from the valley, a little towards where you are
    this.want = { tx: clamp(r.x * 0.45, -350, 350), tz: clamp(-180 + (r.z + 180) * 0.35, -500, 300), yaw: 0.12, pitch: 0.58, dist: 1900 };
    Object.assign(this, this.want);
    this.pin = null; this.hover = null;
    this.saveFog = app.world.scene.fog.density; app.world.scene.fog.density = 0.00012;
    if (app.world.flakes) app.world.flakes.visible = false;
    $('mapUI').classList.add('on'); $('hud').classList.remove('on'); $('touch').classList.remove('on');
    app.input.reset();
    app.mapPaused = !(app.session && app.session.party);
    this.paintPin();
    app.sound.sfx('select');
  }
  close() {
    const app = this.app; if (!this.on) return;
    this.on = false;
    app.world.scene.remove(this.group);
    app.world.scene.fog.density = this.saveFog;
    if (app.world.flakes) app.world.flakes.visible = true;
    $('mapUI').classList.remove('on');
    if (app.state === 'game') { $('hud').classList.add('on'); $('touch').classList.toggle('on', app.touch); }
    app.mapPaused = false; app.input.reset();
    app.sound.sfx('click');
  }
  // ---------- dropping in ----------
  canDrop() { const s = this.app.session; return !!s && (s.mode === 'free' || s.mode === 'mpfree'); }
  dropHere() {
    const p = this.pin || this.hover;
    if (!p) { this.app.toast('Point at a spot on the mountain first', true, 'map'); return; }
    if (!this.canDrop()) { this.app.toast('Dropping in anywhere works in Free Ride', true, 'map'); this.app.sound.sfx('error'); return; }
    let x = clamp(p.x, -BOUNDS.x + 15, BOUNDS.x - 15), z = clamp(p.z, BOUNDS.z0 + 15, BOUNDS.z1 - 15);
    const W = this.app.world;
    // not on a cliff face, not inside a tree: look around for a good spot nearby
    let best = null, bestS = -9;
    for (let r = 0; r <= 24 && bestS < 0.9; r += 6) for (let a = 0; a < 8; a++) {
      const px = x + Math.cos(a / 8 * Math.PI * 2) * r, pz = z + Math.sin(a / 8 * Math.PI * 2) * r;
      W.normal(px, pz, _n); let s = _n.y - r * 0.003;
      for (const o of W.solidsNear(px, pz)) if (Math.hypot(o.x - px, o.z - pz) < o.r + 1.5) s -= 1;
      if (s > bestS) { bestS = s; best = [px, pz]; }
      if (!r) break;
    }
    this.close();
    this.app.session.spawnAt = { x: best[0], z: best[1], name: 'Map' };
    this.app.session.spawnRider(best[0], best[1]);
    this.app.banner('Drop in!', this.app.world.zoneAt(best[0], best[1]).name, 1.4);
    this.app.sound.sfx('go');
  }
  paintPin() {
    const b = $('mapDrop');
    b.disabled = !(this.pin || this.hover);
    b.classList.toggle('dim', !this.canDrop());
    this.pinMesh.visible = !!this.pin;
    if (this.pin) this.pinMesh.position.set(this.pin.x, this.pin.y, this.pin.z);
  }

  // ---------- finding the snow under the pointer: march along the ray over the height map ----------
  pick(cx, cy) {
    const W = this.app.world, el = this.app.renderer.domElement, rc = el.getBoundingClientRect();
    ndc.set(((cx - rc.left) / rc.width) * 2 - 1, -((cy - rc.top) / rc.height) * 2 + 1);
    ray.setFromCamera(ndc, this.cam);
    _o.copy(ray.ray.origin); _d.copy(ray.ray.direction);
    let t = 0, prev = 0;
    for (let i = 0; i < 1200; i++) {
      const step = Math.max(2, t * 0.006); t += step;
      _v.copy(_o).addScaledVector(_d, t);
      if (Math.abs(_v.x) > 1300 || Math.abs(_v.z) > 1500) { if (t > 6000) return null; continue; }
      if (_v.y < W.height(_v.x, _v.z)) {
        let a = prev, b = t;
        for (let k = 0; k < 10; k++) { const m = (a + b) / 2; _v.copy(_o).addScaledVector(_d, m); if (_v.y < W.height(_v.x, _v.z)) b = m; else a = m; }
        _v.copy(_o).addScaledVector(_d, b);
        if (Math.abs(_v.x) > BOUNDS.x + 60 || _v.z < BOUNDS.z0 - 60 || _v.z > BOUNDS.z1 + 60) return null;
        return { x: _v.x, y: W.height(_v.x, _v.z), z: _v.z };
      }
      prev = t;
    }
    return null;
  }

  // ---------- mouse, touch, keys ----------
  wire() {
    const cv = $('gl');
    cv.addEventListener('pointerdown', e => {
      if (!this.on) return;
      cv.setPointerCapture(e.pointerId);
      const pts = this.ptrs || (this.ptrs = new Map()); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) { const [a, b] = [...pts.values()]; this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), dist: this.want.dist, yaw: this.want.yaw }; this.drag = null; }
      else this.drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, btn: e.button, moved: 0 };
    });
    cv.addEventListener('pointermove', e => {
      if (!this.on) return;
      const pts = this.ptrs; if (pts && pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pinch && pts && pts.size === 2) {
        const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
        this.want.dist = clamp(this.pinch.dist * this.pinch.d / Math.max(20, d), 350, 3200); this.want.yaw = this.pinch.yaw - (ang - this.pinch.ang);
        return;
      }
      const d = this.drag;
      if (d) {
        const dx = e.clientX - d.x, dy = e.clientY - d.y; d.x = e.clientX; d.y = e.clientY; d.moved += Math.abs(dx) + Math.abs(dy);
        if (d.btn === 2 || e.shiftKey) { this.want.yaw -= dx * 0.006; this.want.pitch = clamp(this.want.pitch + dy * 0.004, 0.25, 1.45); }
        else {
          // pan along the ground: the snow follows your finger
          const k = this.want.dist / 900 * 1.2, s = Math.sin(this.want.yaw), c = Math.cos(this.want.yaw);
          this.want.tx = clamp(this.want.tx + (-s * dy - c * dx) * k, -900, 900);
          this.want.tz = clamp(this.want.tz + (-c * dy + s * dx) * k, -1100, 1100);
        }
      }
      if (e.pointerType === 'mouse') { this.hover = this.pick(e.clientX, e.clientY); this.paintPin(); }
    });
    const up = e => {
      if (!this.on) return;
      const pts = this.ptrs; if (pts) pts.delete(e.pointerId);
      if (pts && pts.size < 2) this.pinch = null;
      const d = this.drag; this.drag = null;
      // a tap or a click without moving: put the pin there
      if (d && d.moved < 8 && d.btn === 0) { const p = this.pick(e.clientX, e.clientY); if (p) { this.pin = p; this.app.sound.sfx('click'); } this.paintPin(); }
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', e => { if (!this.on) return; e.preventDefault(); this.want.dist = clamp(this.want.dist * Math.exp(e.deltaY * 0.0012), 350, 3200); }, { passive: false });
    cv.addEventListener('contextmenu', e => { if (this.on) e.preventDefault(); });
    $('mapClose').onclick = () => this.close();
    $('mapDrop').onclick = () => this.dropHere();
    $('mapBtn').onclick = () => this.toggle();
  }
  key(code) {
    if (code === 'KeyT') { this.dropHere(); return true; }
    if (code === 'KeyQ') { this.want.yaw += 0.35; return true; }
    if (code === 'KeyE') { this.want.yaw -= 0.35; return true; }
    return false;
  }

  // ---------- every frame while open ----------
  update(dt, keys) {
    const W = this.app.world, w = this.want;
    // WASD / arrows move the map
    if (keys) {
      const k = w.dist / 900 * 420 * dt, s = Math.sin(w.yaw), c = Math.cos(w.yaw);
      const f = (keys.w ? 1 : 0) - (keys.s ? 1 : 0), r = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
      w.tx = clamp(w.tx + (-f * s + r * c) * k, -900, 900); w.tz = clamp(w.tz + (-f * c - r * s) * k, -1100, 1100);
    }
    for (const key of ['tx', 'tz', 'pitch', 'dist']) this[key] = damp(this[key], w[key], 8, dt);
    this.yaw = this.yaw + (w.yaw - this.yaw) * (1 - Math.exp(-8 * dt));
    const ty = W.height(this.tx, this.tz);
    const cam = this.cam, cp = Math.cos(this.pitch);
    cam.position.set(this.tx + Math.sin(this.yaw) * cp * this.dist, ty + Math.sin(this.pitch) * this.dist, this.tz + Math.cos(this.yaw) * cp * this.dist);
    cam.lookAt(this.tx, ty, this.tz);
    cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix();
    // markers
    const sc = this.dist / 1200, r = this.app.ctrl.p;
    this.me.position.set(r.x, r.y, r.z); this.me.scale.setScalar(sc);
    this.me.children[0].position.y = 34 + Math.sin(performance.now() / 300) * 4;
    this.pinMesh.scale.setScalar(sc);
    if (this.hover) { this.cursor.visible = true; this.cursor.position.set(this.hover.x, this.hover.y + 2, this.hover.z); this.cursor.scale.setScalar(sc); } else this.cursor.visible = false;
    // party riders
    const seen = new Set();
    for (const o of this.app.remotes.map.values()) {
      let m = this.mates.get(o.id); if (!m) { m = { mk: this.marker(o.color, 0.9), el: this.label(o.name, 'mate') }; this.group.add(m.mk); this.mates.set(o.id, m); }
      const p = o.model.root.position; m.mk.position.copy(p); m.mk.scale.setScalar(sc); m.el.textContent = o.name; m.p = p; seen.add(o.id);
    }
    for (const [id, m] of this.mates) if (!seen.has(id)) { this.group.remove(m.mk); m.el.remove(); this.mates.delete(id); }
    // labels on the screen
    const place = (el, x, y, z) => {
      _v.set(x, y, z).project(cam);
      const vis = _v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1;
      el.style.display = vis ? 'block' : 'none';
      if (vis) el.style.transform = `translate(${(_v.x * 0.5 + 0.5) * innerWidth}px, ${(-_v.y * 0.5 + 0.5) * innerHeight}px) translate(-50%, -100%)`;
    };
    for (const l of this.labels) place(l.el, l.x, l.y, l.z);
    place(this.meLabel, r.x, r.y + 75 * sc, r.z);
    for (const m of this.mates.values()) place(m.el, m.p.x, m.p.y + 70 * sc, m.p.z);
    const where = this.pin || this.hover;
    $('mapWhere').textContent = where ? W.zoneAt(where.x, where.z).name + ' · ' + Math.round(where.y) + ' m' : 'Point at the mountain';
  }
}
