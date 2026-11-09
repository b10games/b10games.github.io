// Collision world for the obstacle courses: boxes, cylinders and spheres that can move and spin.
// Characters are two stacked spheres; contacts give a push-out normal and the surface's velocity.
import { THREE } from './engine.js';

const _l = new THREE.Vector3(), _q = new THREE.Vector3(), _w = new THREE.Vector3(), _n = new THREE.Vector3(), _p = new THREE.Vector3();

export class Collider {
  // shape: 'box' (half: Vector3) | 'cyl' (r, h = half height, axis Y) | 'sphere' (r)
  constructor(shape, obj, o = {}) {
    this.shape = shape;
    this.obj = obj;
    this.half = o.half ? o.half.clone() : new THREE.Vector3(0.5, 0.5, 0.5);
    this.r = o.r || 0.5;
    this.h = o.h || 0.5;
    this.surface = o.surface || 'normal';   // normal | ice | slide | bounce | kill | sticky
    this.bounce = o.bounce || 0;
    this.hit = o.hit || 0;                  // knock-back strength when it hits you
    this.belt = o.belt || null;             // conveyor: local velocity vector
    this.dynamic = !!o.dynamic;
    this.enabled = true;
    this.tag = o.tag || '';
    this.onStand = o.onStand || null;
    this.mat = new THREE.Matrix4(); this.inv = new THREE.Matrix4(); this.prev = new THREE.Matrix4();
    this.pos = new THREE.Vector3();
    this.bound = shape === 'box' ? this.half.length() : shape === 'cyl' ? Math.hypot(this.r, this.h) : this.r;
    this.sync(true);
  }
  sync(first) {
    if (!first && !this.dynamic) return;
    this.prev.copy(this.mat);
    this.obj.updateWorldMatrix(true, false);
    this.mat.copy(this.obj.matrixWorld);
    this.inv.copy(this.mat).invert();
    this.pos.setFromMatrixPosition(this.mat);
    if (first) this.prev.copy(this.mat);
    const s = this.obj.matrixWorld.getMaxScaleOnAxis();
    this.boundW = this.bound * s;
  }
  // Velocity of the surface at world point p (moving / spinning platforms carry you).
  pointVel(p, dt, out) {
    if (!this.dynamic || dt <= 0) return this.beltVel(out);
    _l.copy(p).applyMatrix4(this.inv).applyMatrix4(this.prev);
    out.copy(p).sub(_l).divideScalar(dt);
    if (this.belt) { _w.copy(this.belt).transformDirection(this.mat).multiplyScalar(this.belt.length()); out.add(_w); }
    return out;
  }
  beltVel(out) {
    if (!this.belt) return out.set(0, 0, 0);
    return out.copy(this.belt).transformDirection(this.mat).multiplyScalar(this.belt.length());
  }
  // Sphere contact. Fills ct = { n, depth, point } and returns true when touching.
  contact(c, r, ct) {
    _l.copy(c).applyMatrix4(this.inv);
    let inside = false;
    if (this.shape === 'box') {
      const h = this.half;
      _q.set(Math.max(-h.x, Math.min(h.x, _l.x)), Math.max(-h.y, Math.min(h.y, _l.y)), Math.max(-h.z, Math.min(h.z, _l.z)));
      if (_q.x === _l.x && _q.y === _l.y && _q.z === _l.z) {
        inside = true;
        const dx = h.x - Math.abs(_l.x), dy = h.y - Math.abs(_l.y), dz = h.z - Math.abs(_l.z);
        _n.set(0, 0, 0);
        if (dy <= dx && dy <= dz) { _q.y = Math.sign(_l.y || 1) * h.y; _n.y = Math.sign(_l.y || 1); }
        else if (dx <= dz) { _q.x = Math.sign(_l.x || 1) * h.x; _n.x = Math.sign(_l.x || 1); }
        else { _q.z = Math.sign(_l.z || 1) * h.z; _n.z = Math.sign(_l.z || 1); }
      }
    } else if (this.shape === 'cyl') {
      const y = Math.max(-this.h, Math.min(this.h, _l.y)), d = Math.hypot(_l.x, _l.z);
      const k = d > this.r ? this.r / d : 1;
      _q.set(_l.x * k, y, _l.z * k);
      if (Math.abs(_l.y) <= this.h && d <= this.r) {
        inside = true;
        const top = this.h - Math.abs(_l.y), side = this.r - d;
        _n.set(0, 0, 0);
        if (top < side) { _q.y = Math.sign(_l.y || 1) * this.h; _n.y = Math.sign(_l.y || 1); }
        else { const kk = d > 1e-6 ? this.r / d : 0; _q.set(d > 1e-6 ? _l.x * kk : this.r, _l.y, _l.z * kk); _n.set(_q.x, 0, _q.z).normalize(); }
      }
    } else {
      const d = _l.length();
      _q.copy(_l).multiplyScalar(d > 1e-6 ? this.r / d : 0);
      if (d < 1e-6) _q.set(0, this.r, 0);
      if (d <= this.r) { inside = true; _n.copy(_q).normalize(); }
    }
    _w.copy(_q).applyMatrix4(this.mat);                    // closest point in the world
    if (inside) {
      ct.n.copy(_n).transformDirection(this.mat);
      ct.depth = r + _w.distanceTo(c);
      ct.point.copy(_w);
      return true;
    }
    _p.copy(c).sub(_w);
    const dist = _p.length();
    if (dist >= r) return false;
    ct.n.copy(_p).divideScalar(dist || 1);
    ct.depth = r - dist;
    ct.point.copy(_w);
    return true;
  }
}

// Trigger zones: checkpoints, finish line, wind, kill volumes.
export class Zone {
  constructor(type, min, max, data = {}) { this.type = type; this.min = min.clone(); this.max = max.clone(); this.data = data; this.enabled = true; }
  has(p) { return this.enabled && p.x >= this.min.x && p.x <= this.max.x && p.y >= this.min.y && p.y <= this.max.y && p.z >= this.min.z && p.z <= this.max.z; }
}

export class World {
  constructor() {
    this.cells = new Map();   // static colliders bucketed along z
    this.dyn = [];
    this.all = [];
    this.zones = [];
    this.gravity = -34;
    this.killY = -30;
  }
  add(c) {
    this.all.push(c);
    if (c.dynamic) { this.dyn.push(c); return c; }
    const z0 = Math.floor((c.pos.z - c.boundW) / 10), z1 = Math.floor((c.pos.z + c.boundW) / 10);
    for (let z = z0; z <= z1; z++) { if (!this.cells.has(z)) this.cells.set(z, []); this.cells.get(z).push(c); }
    return c;
  }
  remove(c) {
    this.all = this.all.filter(x => x !== c);
    this.dyn = this.dyn.filter(x => x !== c);
    this.cells.forEach(list => { const i = list.indexOf(c); if (i >= 0) list.splice(i, 1); });
  }
  zone(z) { this.zones.push(z); return z; }
  sync() { for (const c of this.dyn) c.sync(false); }
  // Colliders near a point.
  near(p, r, out) {
    out.length = 0;
    const z0 = Math.floor((p.z - r) / 10), z1 = Math.floor((p.z + r) / 10);
    for (let z = z0; z <= z1; z++) {
      const list = this.cells.get(z);
      if (list) for (const c of list) if (c.enabled && !out.includes(c) && c.pos.distanceToSquared(p) < (c.boundW + r) ** 2) out.push(c);
    }
    for (const c of this.dyn) if (c.enabled && c.pos.distanceToSquared(p) < (c.boundW + r) ** 2) out.push(c);
    return out;
  }
  // Height of the ground below p (for shadows and bots), or -Infinity.
  groundBelow(p, maxDist = 30) {
    const ct = { n: new THREE.Vector3(), point: new THREE.Vector3(), depth: 0 };
    const probe = p.clone(), list = [];
    for (let d = 0; d < maxDist; d += 0.5) {
      probe.y = p.y - d;
      this.near(probe, 0.3, list);
      for (const c of list) if (c.surface !== 'kill' && c.contact(probe, 0.3, ct) && ct.n.y > 0.5) return { y: ct.point.y, c };
    }
    return null;
  }
}
