// Collision world: the island's ground (a smooth height map) plus boxes, cylinders and spheres for
// houses, stairs, trees and falling things. Characters are two stacked spheres; a contact gives a
// push-out direction and the speed of the thing you touch. Rays find the ground below, the roof above
// (are you sheltered?) and keep the camera out of walls.
import { THREE } from './engine.js';

const _l = new THREE.Vector3(), _q = new THREE.Vector3(), _w = new THREE.Vector3(), _n = new THREE.Vector3(), _p = new THREE.Vector3();
const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _m3 = new THREE.Matrix3();
const CELL = 12;

export class Collider {
  // shape: 'box' (half: Vector3) | 'cyl' (r, h = half height, axis Y) | 'sphere' (r)
  constructor(shape, obj, o = {}) {
    this.shape = shape; this.obj = obj;
    this.half = o.half ? o.half.clone() : new THREE.Vector3(0.5, 0.5, 0.5);
    this.r = o.r || 0.5; this.h = o.h || 0.5;
    this.surface = o.surface || 'normal';   // normal | ice | bounce
    this.bounce = o.bounce || 0;
    this.dynamic = !!o.dynamic; this.enabled = true;
    this.roof = o.roof !== false;           // counts as shelter from rain and falling things
    this.cam = o.cam !== false;             // the camera stays out of it
    this.tag = o.tag || '';
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
    this.boundW = this.bound * this.obj.matrixWorld.getMaxScaleOnAxis();
  }
  // speed of the surface at world point p (moving things carry you)
  pointVel(p, dt, out) {
    if (!this.dynamic || dt <= 0) return out.set(0, 0, 0);
    _l.copy(p).applyMatrix4(this.inv).applyMatrix4(this.prev);
    return out.copy(p).sub(_l).divideScalar(dt);
  }
  // sphere contact: fills ct = { n, depth, point } and returns true when touching
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
    _w.copy(_q).applyMatrix4(this.mat);
    if (inside) { ct.n.copy(_n).transformDirection(this.mat); ct.depth = r + _w.distanceTo(c); ct.point.copy(_w); return true; }
    _p.copy(c).sub(_w);
    const dist = _p.length();
    if (dist >= r) return false;
    ct.n.copy(_p).divideScalar(dist || 1); ct.depth = r - dist; ct.point.copy(_w);
    return true;
  }
  // ray hit: distance along d (d does not need to be normalized; the answer is in units of d), or Infinity
  raycast(o, d) {
    _o.copy(o).applyMatrix4(this.inv);
    _m3.setFromMatrix4(this.inv); _d.copy(d).applyMatrix3(_m3);
    if (this.shape === 'box') {
      const h = this.half; let t0 = -Infinity, t1 = Infinity;
      for (const k of ['x', 'y', 'z']) {
        if (Math.abs(_d[k]) < 1e-9) { if (_o[k] < -h[k] || _o[k] > h[k]) return Infinity; continue; }
        let a = (-h[k] - _o[k]) / _d[k], b = (h[k] - _o[k]) / _d[k]; if (a > b) { const t = a; a = b; b = t; }
        if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) return Infinity;
      }
      return t1 < 0 ? Infinity : Math.max(0, t0);
    }
    if (this.shape === 'cyl') {
      let best = Infinity;
      const a = _d.x * _d.x + _d.z * _d.z, b = 2 * (_o.x * _d.x + _o.z * _d.z), c = _o.x * _o.x + _o.z * _o.z - this.r * this.r;
      if (a > 1e-9) { const disc = b * b - 4 * a * c; if (disc >= 0) { const s = Math.sqrt(disc); for (const t of [(-b - s) / (2 * a), (-b + s) / (2 * a)]) if (t >= 0 && Math.abs(_o.y + _d.y * t) <= this.h) { best = Math.min(best, t); } } }
      if (Math.abs(_d.y) > 1e-9) for (const y of [-this.h, this.h]) { const t = (y - _o.y) / _d.y; if (t >= 0 && t < best) { const x = _o.x + _d.x * t, z = _o.z + _d.z * t; if (x * x + z * z <= this.r * this.r) best = t; } }
      if (c <= 0 && Math.abs(_o.y) <= this.h) return 0;
      return best;
    }
    const a = _d.dot(_d), b = 2 * _o.dot(_d), c = _o.dot(_o) - this.r * this.r, disc = b * b - 4 * a * c;
    if (disc < 0) return Infinity;
    const s = Math.sqrt(disc), t = (-b - s) / (2 * a);
    return t >= 0 ? t : ((-b + s) / (2 * a) >= 0 ? 0 : Infinity);
  }
}

// The island ground: a height function with a normal from its slope.
export class Ground {
  constructor(heightFn) { this.H = heightFn; this.surface = 'normal'; this.enabled = true; this.dynamic = false; this.roof = false; this.cam = true; this.pos = new THREE.Vector3(); this.boundW = 1e9; this.tag = 'ground'; }
  normal(x, z, out) { const e = 0.4, H = this.H; return out.set(H(x - e, z) - H(x + e, z), 2 * e, H(x, z - e) - H(x, z + e)).normalize(); }
  contact(c, r, ct) {
    const h = this.H(c.x, c.z);
    if (c.y - r > h + 0.05) return false;
    this.normal(c.x, c.z, ct.n);
    const d = (c.y - h) * ct.n.y;
    if (d >= r) return false;
    ct.depth = r - d; ct.point.copy(c).addScaledVector(ct.n, -d);
    return true;
  }
  pointVel(p, dt, out) { return out.set(0, 0, 0); }
  raycast(o, d) {
    const len = d.length(), step = 1 / len;   // about 1 m steps
    let prev = 0, pa = o.y - this.H(o.x, o.z);
    if (pa <= 0) return 0;
    for (let t = step; t < 400 * step; t += step) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t, a = y - this.H(x, z);
      if (a <= 0) { let lo = prev, hi = t; for (let i = 0; i < 12; i++) { const m = (lo + hi) / 2; if (o.y + d.y * m - this.H(o.x + d.x * m, o.z + d.z * m) > 0) lo = m; else hi = m; } return hi; }
      prev = t; pa = a;
      if (d.y > 0 && y > 60) return Infinity;
    }
    return Infinity;
  }
}

export class World {
  constructor() {
    this.cells = new Map(); this.dyn = []; this.all = []; this.ground = null;
    this.gravity = -34; this.killY = -40;
  }
  key(x, z) { return (x + 500) * 1000 + (z + 500); }
  add(c) {
    this.all.push(c);
    if (c.dynamic) { this.dyn.push(c); return c; }
    const x0 = Math.floor((c.pos.x - c.boundW) / CELL), x1 = Math.floor((c.pos.x + c.boundW) / CELL);
    const z0 = Math.floor((c.pos.z - c.boundW) / CELL), z1 = Math.floor((c.pos.z + c.boundW) / CELL);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { const k = this.key(x, z); let l = this.cells.get(k); if (!l) this.cells.set(k, l = []); l.push(c); }
    return c;
  }
  remove(c) {
    this.all = this.all.filter(x => x !== c); this.dyn = this.dyn.filter(x => x !== c);
    this.cells.forEach(list => { const i = list.indexOf(c); if (i >= 0) list.splice(i, 1); });
  }
  // throw away a whole set of colliders at once (when the map changes)
  removeMany(list) {
    const gone = new Set(list);
    this.all = this.all.filter(x => !gone.has(x)); this.dyn = this.dyn.filter(x => !gone.has(x));
    for (const [k, l] of this.cells) { const keep = l.filter(x => !gone.has(x)); if (keep.length) this.cells.set(k, keep); else this.cells.delete(k); }
  }
  sync() { for (const c of this.dyn) c.sync(false); }
  // colliders near a point (the ground is always included)
  near(p, r, out) {
    out.length = 0;
    if (this.ground) out.push(this.ground);
    const x0 = Math.floor((p.x - r) / CELL), x1 = Math.floor((p.x + r) / CELL), z0 = Math.floor((p.z - r) / CELL), z1 = Math.floor((p.z + r) / CELL);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const list = this.cells.get(this.key(x, z));
      if (list) for (const c of list) if (c.enabled && c.pos.distanceToSquared(p) < (c.boundW + r) ** 2 && !out.includes(c)) out.push(c);
    }
    for (const c of this.dyn) if (c.enabled && c.pos.distanceToSquared(p) < (c.boundW + r) ** 2) out.push(c);
    return out;
  }
  // first thing a ray hits: { t (metres), c } or null. filter(c) can skip colliders.
  raycast(o, dir, max, filter) {
    const d = _p.copy(dir).normalize(), seen = new Set();
    let best = max, hit = null;
    const test = c => { if (!c.enabled || seen.has(c)) return; seen.add(c); if (filter && !filter(c)) return; const t = c.raycast(o, d); if (t < best) { best = t; hit = c; } };
    if (this.ground && (!filter || filter(this.ground))) { const t = this.ground.raycast(o, d); if (t < best) { best = t; hit = this.ground; } }
    const steps = Math.ceil(max / (CELL * 0.5));
    let lastK = null;
    for (let i = 0; i <= steps; i++) {
      const s = Math.min(max, i * CELL * 0.5), x = o.x + d.x * s, z = o.z + d.z * s;
      const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
      for (let ax = cx - 1; ax <= cx + 1; ax++) for (let az = cz - 1; az <= cz + 1; az++) {
        const k = this.key(ax, az); if (k === lastK) continue;
        const list = this.cells.get(k); if (list) for (const c of list) test(c);
      }
      if (s > best) break;
    }
    for (const c of this.dyn) test(c);
    return hit ? { t: best, c: hit } : null;
  }
  // height of the first surface straight below p
  groundY(p, max = 80) { const h = this.raycast(_w.set(p.x, p.y, p.z), DOWN, max); return h ? p.y - h.t : -Infinity; }
  // is there a roof (anything solid) above this point?
  roofAbove(p, max = 40) { return !!this.raycast(_n.set(p.x, p.y, p.z), UP, max, c => c.roof); }
}
const DOWN = new THREE.Vector3(0, -1, 0), UP = new THREE.Vector3(0, 1, 0);
