// The lifts on Steep Peak (scenery that moves): the Summit Gondola from the village to the start at the top,
// the Mid Chair from the village to the mid station, and the Park Chair beside the snowpark.
// Pylons stand where the ground needs them (the cable never cuts through a ridge) and never on a run;
// cabins and chairs run round the loop all the time.
import { THREE, clamp, lerp, smooth } from './engine.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { terrain, runsAt } from './terrain.js';

export const LIFTS = [
  { id: 'gondola', name: 'Summit Gondola', kind: 'gondola', a: [150, 1705], b: [-38, -2022], speed: 10, spacing: 120, clear: 16, off: 3.4, hang: 3.2 },
  { id: 'mid', name: 'Mid Chair', kind: 'chair', a: [-95, 1690], b: [60, 300], speed: 4.8, spacing: 30, clear: 8, off: 2.4, hang: 2.4 },
  { id: 'park', name: 'Park Chair', kind: 'chair', a: [648, 1012], b: [444, 134], speed: 4.8, spacing: 30, clear: 8, off: 2.4, hang: 2.4 }
];
const UP = new THREE.Vector3(0, 1, 0);
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler();

function coloured(geo, color) {
  const c = new THREE.Color(color), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo.index ? geo.toNonIndexed() : geo;
}
function boxG(w, h, d, x, y, z, color, rx = 0, ry = 0, rz = 0) { const g = new THREE.BoxGeometry(w, h, d); if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz))); g.translate(x, y, z); return coloured(g, color); }
function cylG(r0, r1, h, x, y, z, color, seg = 8) { const g = new THREE.CylinderGeometry(r0, r1, h, seg); g.translate(x, y, z); return coloured(g, color); }
function merge(list) { for (const g of list) { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k); } return mergeGeometries(list); }

// ---------- the models ----------
function gondolaCabin(hang) {
  const red = '#c8202c', glass = '#1d2a3a', white = '#f2f4f7', steel = '#6b7280';
  return merge([
    boxG(2.1, 1.1, 2.5, 0, -hang - 0.85, 0, red), boxG(2.14, 0.95, 2.44, 0, -hang + 0.2, 0, glass),
    boxG(2.2, 0.22, 2.6, 0, -hang + 0.78, 0, white), boxG(1.9, 0.15, 2.3, 0, -hang - 1.47, 0, '#2a2d33'),
    cylG(0.06, 0.06, hang - 0.85, 0, -(hang - 0.85) / 2 - 0.05, 0, steel, 6), boxG(0.25, 0.3, 0.7, 0, 0, 0, steel)
  ]);
}
function chair(hang) {
  const seat = '#1f2937', steel = '#9aa3ad', accent = '#f59e0b';
  return merge([
    boxG(1.9, 0.12, 0.6, 0, -hang - 0.15, 0.1, seat), boxG(1.9, 0.6, 0.1, 0, -hang + 0.15, -0.22, seat, -0.2),
    cylG(0.04, 0.04, hang, 0, -hang / 2, -0.25, steel, 6), boxG(1.6, 0.05, 0.05, 0, -hang + 0.75, 0.55, accent),
    boxG(0.05, 0.05, 0.85, -0.78, -hang + 0.75, 0.15, accent), boxG(0.05, 0.05, 0.85, 0.78, -hang + 0.75, 0.15, accent),
    boxG(1.5, 0.05, 0.3, 0, -hang - 0.55, 0.55, steel), boxG(0.2, 0.25, 0.5, 0, 0, -0.25, steel)
  ]);
}
function pylon(H, off) {
  const steel = '#7c8590', dark = '#3b4048', parts = [];
  // a tapered steel column, a cross arm with the sheaves
  const col = new THREE.CylinderGeometry(0.45, 0.8, H, 6); col.translate(0, H / 2, 0); parts.push(coloured(col, steel));
  for (let y = 4; y < H - 2; y += 6) parts.push(boxG(1.4, 0.18, 0.18, 0, y, 0, dark));
  parts.push(boxG(off * 2 + 1.6, 0.5, 0.6, 0, H, 0, steel));
  for (const s of [-1, 1]) parts.push(boxG(0.5, 0.35, 2.4, s * off, H + 0.15, 0, dark));
  parts.push(boxG(0.6, 3, 0.6, 0, H - 1.5, 0, steel));
  parts.push(boxG(2.2, 0.6, 2.2, 0, 0.1, 0, '#8b8d92'));
  return merge(parts);
}
function station(kind, top) {
  const conc = '#9ca3af', roof = '#f4f8fd', wood = '#7b4a2a', glass = '#2a3a4f', red = '#c8202c', parts = [];
  if (kind === 'gondola') {
    parts.push(boxG(16, 1.2, 22, 0, 0.6, 0, conc));
    parts.push(boxG(14, 7, 6, 0, 4.5, -8, wood));
    parts.push(boxG(14.6, 0.5, 23, 0, 9.3, 0, roof), boxG(14.8, 0.4, 23.2, 0, 8.9, 0, '#3b2a1e'));
    for (const x of [-6.5, 6.5]) for (const z of [-10, 0, 10]) parts.push(boxG(0.6, 8, 0.6, x, 4.8, z, conc));
    parts.push(boxG(12, 3, 0.2, 0, 4, -4.9, glass));
    const wheel = new THREE.TorusGeometry(3.4, 0.25, 6, 24); wheel.rotateX(Math.PI / 2); wheel.translate(0, 7.4, 6); parts.push(coloured(wheel, '#3b4048'));
    parts.push(boxG(14, 1, 1, 0, 8.2, 9.5, red));
  } else {
    parts.push(boxG(9, 0.8, 9, 0, 0.4, 0, conc));
    parts.push(boxG(4, 3, 3.5, 3.8, 2.3, -3, wood), boxG(4.6, 0.35, 4.1, 3.8, 3.95, -3, roof));
    parts.push(boxG(0.8, 6.5, 0.8, 0, 3.6, 2.8, '#7c8590'));
    const wheel = new THREE.TorusGeometry(2.4, 0.18, 6, 20); wheel.rotateX(Math.PI / 2); wheel.translate(0, 6.6, 2.8); parts.push(coloured(wheel, '#3b4048'));
    parts.push(boxG(5.6, 0.4, 0.4, 0, 7.0, 2.8, '#f59e0b'));
  }
  return merge(parts);
}
// ---------- cable lifts ----------
// the cable from a to b: straight between pylons, and always well above the snow (an upper hull)
function cableLine(L) {
  const [ax, az] = L.a, [bx, bz] = L.b, len = Math.hypot(bx - ax, bz - az), n = Math.ceil(len / 8);
  const pts = [];
  for (let i = 0; i <= n; i++) { const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t; pts.push([t * len, terrain(x, z) + (i === 0 || i === n ? 7.4 : L.clear)]); }
  // the cable leaves the station flat-ish: lift the ends a little
  const hull = [];
  for (const p of pts) {
    while (hull.length >= 2) { const a = hull[hull.length - 2], b = hull[hull.length - 1]; if ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0) hull.pop(); else break; }
    hull.push(p);
  }
  // long spans get pylons in between too
  const tops = [hull[0]];
  for (let i = 1; i < hull.length; i++) {
    const a = tops[tops.length - 1], b = hull[i], span = b[0] - a[0], k = Math.ceil(span / (L.kind === 'gondola' ? 420 : 140));
    for (let j = 1; j < k; j++) tops.push([a[0] + span * j / k, a[1] + (b[1] - a[1]) * j / k]);
    tops.push(b);
  }
  // a pylon standing on a run moves along the line until it is beside it
  const onRun = (x, z) => runsAt(x, z).some(h => Math.abs(h.v) < h.run.w + 6 && h.u > -10 && h.u < h.run.len + 10);
  for (let i = 1; i < tops.length - 1; i++) {
    const t0 = tops[i];
    for (const d of [0, 12, -12, 24, -24, 36, -36, 50, -50, 65, -65]) {
      const s = clamp(t0[0] + d, tops[i - 1][0] + 20, tops[i + 1][0] - 20), x = ax + (bx - ax) * s / len, z = az + (bz - az) * s / len;
      if (!onRun(x, z)) { tops[i] = [s, Math.max(lerp(tops[i - 1][1], tops[i + 1][1], (s - tops[i - 1][0]) / (tops[i + 1][0] - tops[i - 1][0])), t0[1] + (s - t0[0]) * (tops[i + 1][1] - tops[i - 1][1]) / (tops[i + 1][0] - tops[i - 1][0]), terrain(x, z) + L.clear)]; break; }
    }
  }
  return { len, tops, dir: [(bx - ax) / len, (bz - az) / len] };
}

export function buildLifts(world) {
  const scene = world.scene, built = [];
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, metalness: 0.15 });
  const statMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  const cableMat = new THREE.LineBasicMaterial({ color: '#1b1d22' });
  for (const L of LIFTS) {
    const C = cableLine(L), [dx, dz] = C.dir, rx = -dz, rz = dx;
    L.len = C.len; L.tops = C.tops; L.dir = C.dir; L.yaw = Math.atan2(dx, dz);
    // pylons (not at the two ends: there are the stations)
    const pg = [];
    for (let i = 1; i < C.tops.length - 1; i++) {
      const [s, y] = C.tops[i], x = L.a[0] + dx * s, z = L.a[1] + dz * s, g0 = terrain(x, z), H = y - g0 + 0.6;
      const g = pylon(H, L.off); g.applyMatrix4(new THREE.Matrix4().makeRotationY(L.yaw)); g.translate(x, g0 - 0.4, z); pg.push(g);
      world.addSolid(x, z, 1.4, 'rock');
    }
    if (pg.length) { const m = new THREE.Mesh(mergeGeometries(pg), mat); m.castShadow = !!world.Q.shadows; scene.add(m); }
    // stations at both ends
    for (const [end, sgn] of [['a', 1], ['b', -1]]) {
      const [x, z] = L[end], g0 = terrain(x, z), g = station(L.kind, end === 'b');
      g.applyMatrix4(new THREE.Matrix4().makeRotationY(L.yaw + (sgn < 0 ? Math.PI : 0))); g.translate(x, g0 - 0.3, z);
      const m = new THREE.Mesh(g, statMat); m.castShadow = !!world.Q.shadows; m.receiveShadow = true; scene.add(m);
      world.addSolid(x + dx * sgn * (L.kind === 'gondola' ? 0 : 2), z + dz * sgn * (L.kind === 'gondola' ? 0 : 2), L.kind === 'gondola' ? 9 : 4.5, 'cabin');
      world.block(x, z, 30);
    }
    // the two cables (lines are always one pixel wide, so they stay visible from far away)
    const lp = [];
    for (const side of [1, -1]) for (let i = 0; i < C.tops.length - 1; i++) {
      const [s0, y0] = C.tops[i], [s1, y1] = C.tops[i + 1];
      lp.push(L.a[0] + dx * s0 + rx * L.off * side, y0, L.a[1] + dz * s0 + rz * L.off * side, L.a[0] + dx * s1 + rx * L.off * side, y1, L.a[1] + dz * s1 + rz * L.off * side);
    }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    const lines = new THREE.LineSegments(lg, cableMat); lines.frustumCulled = false; scene.add(lines);
    // cabins / chairs running round the loop
    const geo = L.kind === 'gondola' ? gondolaCabin(L.hang) : chair(L.hang);
    const loop = 2 * C.len + 2 * Math.PI * L.off, n = Math.floor(loop / L.spacing);
    const inst = new THREE.InstancedMesh(geo, mat, n + 1); inst.castShadow = !!world.Q.shadows; inst.frustumCulled = false; scene.add(inst);
    L.inst = inst; L.count = n; L.loop = loop; L.geo = geo; L.mat = mat;
    // at the top you leave the station going on downhill, beyond it
    L.exitB = exitBeyond(L.b, dx, dz, 22);
    L.exitA = exitBeyond(L.a, -dx, -dz, 18, true);
    world.addCorridor([L.a, L.b], L.kind === 'gondola' ? 11 : 7);
    built.push(L);
  }
  // move everything every frame
  world.updaters.push((dt, t) => { for (const L of LIFTS) moveLift(L, t); });
  world.lifts = LIFTS;
  return LIFTS;
}
// a spot near the end of a lift where you can start riding (a little way out from the station)
function exitBeyond(end, dx, dz, d, side) {
  const x = end[0] + dx * d + (side ? -dz * 10 : 0), z = end[1] + dz * d + (side ? dx * 10 : 0);
  return { x, z };
}
// where the cable is at distance s from the bottom (side +1 up, -1 down)
export function cablePoint(L, s, side, out = new THREE.Vector3()) {
  const T = L.tops; s = clamp(s, 0, L.len);
  let i = 0; while (i < T.length - 2 && T[i + 1][0] < s) i++;
  const [s0, y0] = T[i], [s1, y1] = T[i + 1], k = (s - s0) / Math.max(1e-6, s1 - s0);
  const [dx, dz] = L.dir, rx = -dz, rz = dx;
  return out.set(L.a[0] + dx * s + rx * L.off * side, lerp(y0, y1, k), L.a[1] + dz * s + rz * L.off * side);
}
// a point on the loop: up the right cable, round the top wheel, down the left cable, round the bottom wheel
function loopPoint(L, u, out) {
  const len = L.len, half = Math.PI * L.off;
  u = ((u % L.loop) + L.loop) % L.loop;
  if (u < len) { cablePoint(L, u, 1, out); return 0; }
  if (u < len + half) { const a = (u - len) / L.off; cablePoint(L, len, 0, out); const [dx, dz] = L.dir; out.x += -dz * L.off * Math.cos(a) + dx * L.off * 0.6 * Math.sin(a); out.z += dx * L.off * Math.cos(a) + dz * L.off * 0.6 * Math.sin(a); return 1; }
  if (u < 2 * len + half) { cablePoint(L, len - (u - len - half), -1, out); return Math.PI; }
  const a = (u - 2 * len - half) / L.off; cablePoint(L, 0, 0, out); const [dx, dz] = L.dir; out.x += dz * L.off * Math.cos(a) - dx * L.off * 0.6 * Math.sin(a); out.z += -dx * L.off * Math.cos(a) - dz * L.off * 0.6 * Math.sin(a); return 2;
}
function moveLift(L, t) {
  for (let k = 0; k < L.count; k++) {
    const seg = loopPoint(L, t * L.speed + k * L.spacing, _p);
    const yaw = L.yaw + (seg === 2 || seg === Math.PI ? Math.PI : 0);
    _q.setFromAxisAngle(UP, yaw); _m.compose(_p, _q, _s); L.inst.setMatrixAt(k, _m);
  }
  _m.makeScale(0, 0, 0); L.inst.setMatrixAt(L.count, _m);
  L.inst.instanceMatrix.needsUpdate = true;
}
