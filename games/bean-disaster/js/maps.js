// The other nine maps. Every map is an island with the same rules as Bean Town (the middle is a free plaza
// where the beans land, the land is at LAND, the beach slopes into the sea), so every disaster works on
// all of them. Each map is built from the same kit of buildings, each with its own look and places:
//   tower   - a tall building with an open ground floor and outside stairs to the roof (high + shelter)
//   spiral  - a round tower with a ramp spiralling up to a balcony (the highest place, lightning loves it)
//   house   - a small house with a door, a roof you can climb and crates to climb on (shelter, warm, high)
//   mart    - a big shop with a ramp up to the roof (shelter + high)
//   canopy  - a roof on posts (shelter)       gazebo - a little round roof (shelter)
//   fire    - a campfire (warm in a blizzard) hill   - part of the ground (high)
// plus a few one-offs: a temple pyramid, a pirate ship, a windmill, a graveyard, an ice rink...
// K is the kit from map.js (box, cyl, ramp, deco, sign, collide, materials, heightAt, ...).
import { THREE, smooth, clamp } from './engine.js';

const LAND = 2;
function noise2(x, z) { return Math.sin(x * 0.11 + Math.sin(z * 0.07) * 2) * Math.cos(z * 0.09 + Math.sin(x * 0.05) * 1.5); }

// ---------- the ground's shape: flat town land, a beach into the sea, round hills ----------
function makeHeight(cfg) {
  const R0 = cfg.r || 74, hills = cfg.hills || [], bump = cfg.bump ?? 0.6;
  return (x, z) => {
    const r = Math.hypot(x, z);
    let h = LAND;
    if (r > R0) h = LAND - (LAND + 3.2) * smooth(R0, R0 + 24, r) - Math.max(0, r - R0 - 24) * 0.12;
    h += noise2(x, z) * bump * smooth(R0 - 22, R0 - 6, r) * (1 - smooth(R0 + 2, R0 + 16, r));
    for (const hl of hills) {
      const d = Math.hypot(x - hl.x, z - hl.z);
      if (d < hl.r) { const c = Math.cos(Math.PI * d / (2 * hl.r)); h += hl.h * c * c; }
    }
    return h;
  };
}

// ---------- roads (painted on the ground; they keep trees away) ----------
const ROADS = {
  cross: (x, z, w, R) => (Math.abs(z) < w && Math.abs(x) < R) || (Math.abs(x) < w && Math.abs(z) < R),
  ring: (x, z, w, R) => { const r = Math.hypot(x, z); return Math.abs(r - 36) < w || ((Math.abs(x) < w || Math.abs(z) < w) && r < 36); },
  grid: (x, z, w, R) => { const m = v => { const k = ((v % 32) + 48) % 32 - 16; return Math.abs(k) < w; }; return Math.hypot(x, z) < R && (m(x) || m(z)); },
  none: () => false
};

// ---------- painting the ground ----------
function painter(K, T, cfg) {
  const R0 = cfg.r || 74, road = ROADS[T.roads || 'cross'], rw = T.roadW || 4;
  return (g, W, SPAN) => {
    const img = g.createImageData(W, W), d = img.data, k = SPAN / W;
    for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
      const x = -SPAN / 2 + (i + 0.5) * k, z = -SPAN / 2 + (j + 0.5) * k, r = Math.hypot(x, z), h = K.heightAt(x, z);
      const n = (Math.sin(x * 1.7) * Math.cos(z * 1.3) + Math.sin(x * 0.37 + z * 0.51)) * 0.5, n2 = Math.random() * 0.08;
      let c;
      if (r < 13) { const ring = (Math.floor(r / 1.6) + Math.floor(Math.atan2(z, x) * 6)) % 2; c = ring ? T.plaza[0] : T.plaza[1]; }
      else if (road(x, z, rw, R0) && r < R0 + 2) {
        c = T.road;
        if (T.line && road(x, z, 0.18, R0) && Math.floor((x + z) / 3) % 2 === 0) c = T.line;
        if (T.stripes && (Math.floor((x + z) / 1.5) % 2 === 0)) c = T.stripes;
      }
      else if (road(x, z, rw + 1.6, R0) && r < R0 + 2) c = T.walk || T.road;
      else if (r > R0 || h < 1.2) { const wet = smooth(1.2, -0.5, h); c = [T.sand[0] - wet * 50, T.sand[1] - wet * 50, T.sand[2] - wet * 40]; }
      else {
        const hill = smooth(LAND + 0.6, LAND + 9, h), b = T.base, hc = T.hill || b;
        c = [b[0] + n * 14 + (hc[0] - b[0]) * hill, b[1] + n * 18 + (hc[1] - b[1]) * hill, b[2] + n * 10 + (hc[2] - b[2]) * hill];
        if (T.cap && h > LAND + 7) { const s = smooth(LAND + 7, LAND + 10, h); c = [c[0] + (T.cap[0] - c[0]) * s, c[1] + (T.cap[1] - c[1]) * s, c[2] + (T.cap[2] - c[2]) * s]; }
        if (T.fields) for (const f of T.fields) if (x > f[0] && x < f[1] && z > f[2] && z < f[3]) { const row = Math.floor((f[4] ? x : z) / 1.6) % 2; c = row ? T.fieldA : T.fieldB; }
        if (T.patches && Math.sin(x * 0.21 + Math.sin(z * 0.13) * 2) * Math.cos(z * 0.17) > 0.55) c = T.patches;
      }
      const o = (j * W + i) * 4, m = 1 - n2;
      d[o] = c[0] * m; d[o + 1] = c[1] * m; d[o + 2] = c[2] * m; d[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    if (T.dots) for (let i = 0; i < W * 2; i++) { const x = Math.random() * W, y = Math.random() * W, wx = -SPAN / 2 + x * k, wz = -SPAN / 2 + y * k; if (road(wx, wz, rw + 1.6, R0) || Math.hypot(wx, wz) > R0 - 4 || Math.hypot(wx, wz) < 14) continue; g.fillStyle = T.dots[i % T.dots.length]; g.fillRect(x, y, Math.max(1, W / 1024), Math.max(1, W / 1024)); }
  };
}

// ================= the kit =================
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const block = (K, x0, x1, z0, z1) => K.blocked.push([x0, x1, z0, z1]);

// a tall building: open ground floor, then floors, flat roof; outside zig-zag stairs on its +z side.
// n = flights of 4 m (4 or 6)
function tower(K, out, o) {
  const { box, cyl, deco, ramp, sign, mat } = K;
  const n = o.n || 4, OF = { x0: o.x0, x1: o.x1, z0: o.z0, z1: o.z1, top: LAND + 4 * n };
  const ofx = (OF.x0 + OF.x1) / 2, ofz = (OF.z0 + OF.z1) / 2, ofw = OF.x1 - OF.x0, ofd = OF.z1 - OF.z0;
  const wallM = o.wall || mat.wallB, trim = o.trim || mat.concrete, trim2 = o.trim2 || mat.concrete2, glass = o.glass || mat.glass;
  for (const px of [OF.x0 + 0.6, ofx, OF.x1 - 0.6]) for (const pz of [OF.z0 + 0.6, OF.z1 - 0.6]) box(px, LAND + 2.25, pz, 0.9, 4.5, 0.9, trim2);
  box(ofx, LAND + 4.75, ofz, ofw, 0.5, ofd, trim);
  const bodyH = OF.top - LAND - 5.2;
  box(ofx, LAND + 5 + bodyH / 2, ofz, ofw - 0.4, bodyH, ofd - 0.4, wallM);
  box(ofx, OF.top - 0.1, ofz, ofw, 0.2, ofd, trim);
  const nx = Math.max(2, Math.floor((ofw - 2) / 2.6)), nz = Math.max(2, Math.floor((ofd - 2) / 2.8));
  for (let y = LAND + 7; y < OF.top - 1.4; y += 3.6) {
    for (const side of [-1, 1]) for (let i = 0; i < nx; i++) deco(new THREE.BoxGeometry(1.6, 1.8, 0.1), glass, ofx + (i - (nx - 1) / 2) * 2.6, y, ofz + side * (ofd / 2 - 0.15), 0, 0, 0, false);
    for (const side of [-1, 1]) for (let i = 0; i < nz; i++) deco(new THREE.BoxGeometry(0.1, 1.8, 1.6), glass, ofx + side * (ofw / 2 - 0.15), y, ofz + (i - (nz - 1) / 2) * 2.8, 0, 0, 0, false);
  }
  // parapet with an opening where the stairs arrive (east end of the +z side)
  box(ofx, OF.top + 0.7, OF.z0 + 0.15, ofw, 1, 0.3, trim2, { roof: false });
  box(OF.x0 + 0.15, OF.top + 0.7, ofz, 0.3, 1, ofd, trim2, { roof: false });
  box(OF.x1 - 0.15, OF.top + 0.7, ofz - 1.5, 0.3, 1, ofd - 3, trim2, { roof: false });
  box(ofx - 1.5, OF.top + 0.7, OF.z1 - 0.15, ofw - 3, 1, 0.3, trim2, { roof: false });
  cyl(OF.x0 + 3.5, OF.top + 1.6, OF.z0 + 3.5, 1.4, 3, o.tank || mat.metal, { seg: 14 });
  box(ofx + 2, OF.top + 0.7, ofz, 2.4, 1.2, 1.6, trim2);
  if (o.sign) sign(o.sign, Math.min(ofw - 2, 9), 1.4, o.signBg || '#3d5a80', o.signFg || '#ffffff', ofx, OF.top - 1, OF.z1 + 0.06, 0, { border: o.signBorder || '#ffd23f' });
  const SZ = OF.z1 + 1.6, sw = 2.6, xW = OF.x0 + 1.2, xE = OF.x1 + 1.3;
  const path = [V(xE + 2, LAND, SZ)];
  for (let k = 0; k < n; k++) {
    const y0 = LAND + k * 4, y1 = y0 + 4, west = k % 2 === 0;
    const from = west ? V(xE - 1.3, y0, SZ) : V(xW + 1.3, y0, SZ), to = west ? V(xW + 1.3, y1, SZ) : V(xE - 1.3, y1, SZ);
    ramp(from, to, sw, trim, { steps: trim2, t: 0.35 });
    const lx = west ? xW : xE;
    box(lx, y1 - 0.2, SZ, 2.6, 0.4, sw, trim);
    if (k < n - 1) box(lx + (west ? -1.2 : 1.2), y1 + 0.5, SZ, 0.2, 1.0, sw, mat.metal, { roof: false });
    path.push(V(to.x, y1, SZ), V(lx, y1, SZ));
    deco(new THREE.BoxGeometry(Math.hypot(to.x - from.x, y1 - y0), 0.08, 0.08), mat.metal, (from.x + to.x) / 2, (y0 + y1) / 2 + 1.0, SZ + sw / 2, 0, 0, Math.atan2(y1 - y0, to.x - from.x), false);
  }
  box(OF.x1 - 1.5, OF.top - 0.2, OF.z1 + 0.5, 3, 0.4, 1.2, trim);
  path.push(V(OF.x1 - 1.5, OF.top, OF.z1 - 1.2), V(ofx, OF.top, ofz));
  for (let k = 0; k < n; k++) for (const x of [xW, xE]) box(x, LAND + k * 4, SZ + sw / 2 + 0.25, 0.3, 4, 0.3, trim2, { roof: false });
  out.high.push({ name: o.name || 'tower', path, top: V(ofx, OF.top, ofz), y: OF.top, cap: 16, spread: 5 });
  out.shelter.push({ name: (o.name || 'tower') + ' floor', path: [V(ofx, LAND, OF.z1 + 4)], top: V(ofx, LAND, ofz), cap: 14, spread: 5 });
  out.tall.push(V(ofx, OF.top, ofz), V(OF.x0 + 3.5, OF.top + 3, OF.z0 + 3.5));
  out.edges.push({ x0: OF.x0, x1: OF.x1, z0: OF.z0, z1: OF.z1, y: OF.top });
  out.buildings.push(OF);
  block(K, OF.x0 - 1.5, OF.x1 + 4, OF.z0 - 1.5, OF.z1 + 5);
}

// a round tower with a ramp spiralling up to a balcony ring (lighthouse, silo, bell tower, ...)
function spiral(K, out, o) {
  const { box, cyl, deco, sign, mat, root, live, collide, M } = K;
  const r = o.r || 3.2, h = o.h || 24, LH = { x: o.x, z: o.z, r, top: LAND + h };
  const bodyM = o.body || mat.lighthouseW;
  cyl(LH.x, LAND + (h + 2) / 2, LH.z, LH.r, h + 2, bodyM, { seg: 28, r2: LH.r - 0.5 });
  if (o.stripe) for (let i = 0; i < Math.floor(h / 6); i++) deco(new THREE.CylinderGeometry(LH.r - 0.04 - i * 0.12 * (24 / h), LH.r - i * 0.12 * (24 / h), 2.4, 28), o.stripe, LH.x, LAND + 3 + i * 6, LH.z);
  let beam = null;
  if (o.room !== false) {
    cyl(LH.x, LAND + h + 3.2, LH.z, 2.6, 2.4, mat.glass, { seg: 16 });
    beam = new THREE.Mesh(new THREE.SphereGeometry(1.1, 16, 12), M(o.beamColor || '#fff6c2', { emissive: o.beamGlow || '#ffe066', ei: 2 })); beam.position.set(LH.x, LAND + h + 3.2, LH.z); live.add(beam);
  } else cyl(LH.x, LAND + h + 2.6, LH.z, LH.r - 0.6, 1.2, bodyM, { seg: 20 });
  if (o.cap === 'dome') deco(new THREE.SphereGeometry(2.9, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), o.capM || mat.metal, LH.x, LAND + h + 4.3, LH.z);
  else if (o.cap === 'tank') { cyl(LH.x, LAND + h + 6, LH.z, 4.2, 4.4, o.capM || mat.wood, { seg: 18 }); deco(new THREE.ConeGeometry(4.6, 1.8, 18), o.capM || mat.wood, LH.x, LAND + h + 9.1, LH.z); }
  else if (o.cap === 'cherry') { deco(new THREE.SphereGeometry(1.6, 16, 12), M('#e63946', { rough: 0.25 }), LH.x, LAND + h + 6, LH.z); deco(new THREE.CylinderGeometry(0.08, 0.08, 1.4, 6), mat.woodDark, LH.x + 0.3, LAND + h + 7.9, LH.z, 0, 0, -0.4); }
  else deco(new THREE.ConeGeometry(3.0, o.capH || 2.2, 16), o.capM || mat.lighthouseR, LH.x, LAND + h + 4.4 + ((o.capH || 2.2) - 2.2) / 2, LH.z);
  if (o.flag) { deco(new THREE.CylinderGeometry(0.06, 0.06, 4, 6), mat.dark, LH.x, LAND + h + 7.5, LH.z, 0, 0, 0, false); deco(new THREE.BoxGeometry(2.2, 1.3, 0.05), M(o.flag), LH.x + 1.1, LAND + h + 8.8, LH.z, 0, 0, 0, false); }
  const turns = 2.75 * h / 24, rise = h, rc = LH.r + 1.15, perTurn = 18, nSeg = Math.round(turns * perTurn);
  const path = [], a0 = Math.atan2(-o.x, -o.z);
  const rampM = o.rampM || mat.concrete, railM = o.railM || mat.red;
  for (let i = 0; i < nSeg; i++) {
    const a = a0 + (i + 0.5) / perTurn * Math.PI * 2, y = LAND + rise * (i + 0.5) / nSeg;
    const segLen = (2 * Math.PI * rc) / perTurn * 1.08, slope = Math.atan2(rise / nSeg, (2 * Math.PI * rc) / perTurn);
    const m = new THREE.Mesh(new THREE.BoxGeometry(segLen, 0.3, 2.3), rampM);
    m.position.set(LH.x + Math.sin(a) * rc, y - 0.15, LH.z + Math.cos(a) * rc);
    m.rotation.set(0, a, slope); m.castShadow = true; m.receiveShadow = true; root.add(m);
    collide('box', m, { half: new THREE.Vector3(segLen / 2, 0.15, 1.15) });
    if (i % 3 === 0) deco(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 5), railM, LH.x + Math.sin(a) * (rc + 1.05), y + 0.5, LH.z + Math.cos(a) * (rc + 1.05), 0, 0, 0, false);
    if (i % 3 === 1) path.push(V(LH.x + Math.sin(a) * rc, y, LH.z + Math.cos(a) * rc));
  }
  const aEnd = a0 + nSeg / perTurn * Math.PI * 2;
  for (let i = 0; i < 20; i++) {
    const a = aEnd + (i + 0.5) / 20 * Math.PI * 2;
    if ((i + 0.5) / 20 > 0.82) continue;
    const m = new THREE.Mesh(new THREE.BoxGeometry(2 * Math.PI * rc / 20 * 1.1, 0.35, 2.3), o.floorM || mat.concrete2);
    m.position.set(LH.x + Math.sin(a) * rc, LH.top - 0.17, LH.z + Math.cos(a) * rc); m.rotation.y = a; m.castShadow = true; root.add(m);
    collide('box', m, { half: new THREE.Vector3(2 * Math.PI * rc / 20 * 0.55, 0.17, 1.15) });
    const rail = new THREE.Mesh(new THREE.BoxGeometry(2 * Math.PI * (rc + 1.1) / 20 * 1.05, 1.0, 0.12), railM);
    rail.position.set(LH.x + Math.sin(a) * (rc + 1.1), LH.top + 0.5, LH.z + Math.cos(a) * (rc + 1.1)); rail.rotation.y = a; root.add(rail);
    collide('box', rail, { half: new THREE.Vector3(2 * Math.PI * (rc + 1.1) / 20 * 0.5, 0.5, 0.06), roof: false });
  }
  const top = V(LH.x + Math.sin(aEnd + 1.6) * rc, LH.top, LH.z + Math.cos(aEnd + 1.6) * rc);
  if (o.sign) sign(o.sign, Math.min(4.6, o.sign.length * 0.45 + 1), 0.9, o.signBg || '#d62828', o.signFg || '#ffffff', LH.x + Math.sin(a0 - 0.5) * (LH.r - 0.25), LAND + 3.2, LH.z + Math.cos(a0 - 0.5) * (LH.r - 0.25), a0 - 0.5, { size: 0.6 });
  out.high.push({ name: o.name || 'spiral', path: path.concat([top]), top, y: LH.top, cap: 6, spread: 1.2 });
  out.tall.push(V(LH.x, LH.top + 6, LH.z));
  if (beam && !out.beam) out.beam = beam;
  block(K, LH.x - rc - 3, LH.x + rc + 3, LH.z - rc - 3, LH.z + rc + 3);
}

// a house with a door (face +1: door on the +z side), crates to climb, a table and a rug inside.
// style: 'gable' (a pointed roof) or 'flat' (a flat roof you can stand on)
function house(K, out, o) {
  const { box, cyl, deco, mat, M } = K;
  const cx = o.x, cz = o.z, face = o.face || 1, wallM = o.wall || mat.wallA, roofM = o.roof || mat.roofA;
  const w = 8, d = 7, h = 3.4, t = 0.3, y0 = LAND;
  const dz = face * (d / 2 - t / 2);
  box(cx, y0 + h / 2, cz - dz, w, h, t, wallM);
  box(cx - w / 2 + t / 2, y0 + h / 2, cz, t, h, d, wallM);
  box(cx + w / 2 - t / 2, y0 + h / 2, cz, t, h, d, wallM);
  box(cx - 2.4, y0 + h / 2, cz + dz, 3.2, h, t, wallM); box(cx + 2.4, y0 + h / 2, cz + dz, 3.2, h, t, wallM);
  box(cx, y0 + h - 0.5, cz + dz, 1.6, 1.0, t, wallM);
  box(cx, y0 + h + 0.12, cz, w + 0.2, 0.24, d + 0.2, o.ceil || mat.trim);
  let top;
  if (o.style === 'flat') {
    box(cx, y0 + h + 0.36, cz, w + 0.6, 0.24, d + 0.6, roofM);
    for (const s of [-1, 1]) deco(new THREE.BoxGeometry(w + 0.6, 0.35, 0.25), roofM, cx, y0 + h + 0.62, cz + s * (d / 2 + 0.18), 0, 0, 0, false);
    top = V(cx, y0 + h + 0.48, cz);
  } else {
    const rh = 2.2, half = d / 2 + 0.5, L = Math.hypot(half, rh), sl = Math.atan2(rh, half);
    for (const s of [-1, 1]) box(cx, y0 + h + 0.24 + rh / 2, cz + s * half / 2, w + 0.8, 0.3, L, roofM, { rx: s * sl });
    const gab = new THREE.Shape([new THREE.Vector2(-half + 0.5, 0), new THREE.Vector2(half - 0.5, 0), new THREE.Vector2(0, rh - 0.2)]);
    for (const s of [-1, 1]) deco(new THREE.ShapeGeometry(gab), M(wallM.color.getStyle(), { double: true }), cx + s * (w / 2 - 0.02), y0 + h + 0.24, cz, s * Math.PI / 2, 0, 0, false);
    top = V(cx, y0 + h + 0.24 + rh, cz);
  }
  deco(new THREE.BoxGeometry(1.4, 2.4, 0.08), o.door || mat.door, cx + 1.0, y0 + 1.2, cz + face * (d / 2 + 0.02), face > 0 ? -1.1 : 1.1, 0, 0, false);
  for (const s of [-1, 1]) deco(new THREE.BoxGeometry(1.3, 1.1, 0.1), o.glass || mat.glass, cx + s * 2.4, y0 + 1.8, cz + face * (d / 2 + 0.02), 0, 0, 0, false);
  if (o.style !== 'flat') box(cx + 2.6, y0 + h + 2.4, cz - face * 1.2, 0.8, 2.2, 0.8, o.chimney || mat.stone);
  const sx = cx + w / 2 + 0.9, crate = o.crate || mat.wood;
  box(sx, y0 + 0.6, cz - face * 1.6, 1.2, 1.2, 1.2, crate); box(sx + 1.2, y0 + 0.6, cz - face * 0.4, 1.2, 1.2, 1.2, crate); box(sx, y0 + 1.8, cz - face * 1.6, 1.2, 1.2, 1.2, crate);
  cyl(cx - 1.5, y0 + 0.45, cz - face * 1, 0.7, 0.9, mat.woodDark, { seg: 10, roof: false });
  deco(new THREE.CylinderGeometry(1.6, 1.6, 0.03, 20), M(o.rug || ['#e76f51', '#457b9d', '#e9c46a', '#8338ec'][out.houses.length % 4]), cx + 0.8, y0 + 0.02, cz, 0, 0, 0, false);
  const inside = V(cx + 0.8, y0, cz), door = V(cx, y0, cz + face * (d / 2 + 1.5));
  const climbTop = o.style === 'flat' ? V(cx + 2.4, y0 + h + 0.48, cz - face * 1.6) : V(cx + 2.6, y0 + h + 1, cz - face * 1.6);
  const hs = { inside, door, top, climb: [V(sx + 2.4, y0, cz - face * 0.4), V(sx + 1.2, y0 + 1.2, cz - face * 0.4), V(sx, y0 + 2.4, cz - face * 1.6), climbTop] };
  const i = out.houses.length;
  out.houses.push(hs);
  out.high.push({ name: 'roof' + i, path: hs.climb, top: hs.top, y: hs.top.y, cap: o.style === 'flat' ? 4 : 2, spread: 1.2 });
  out.shelter.push({ name: 'house' + i, path: [door], top: inside, cap: 4, spread: 1.6 });
  out.warm.push({ name: 'house' + i, path: [door], top: inside, cap: 4, spread: 1.6 });
  out.edges.push({ x0: cx - 4, x1: cx + 4, z0: cz - 3.5, z1: cz + 3.5, y: top.y });
  if (o.bushes !== false) for (let k = 0; k < 4; k++) deco(new THREE.IcosahedronGeometry(0.7, 0), o.bush || (k % 2 ? mat.leaf : mat.leaf3), cx - w / 2 - 0.6, y0 + 0.5, cz - d / 2 + 1 + k * 1.7);
  block(K, cx - 5.2, cx + 7.6, cz - 4.6, cz + 4.6);
}

// a big shop with a wide door at the front (-z) and a ramp up the east side to the roof
function mart(K, out, o) {
  const { box, deco, ramp, sign, mat, M } = K;
  const SM = { x: o.x, z: o.z, w: o.w || 20, d: o.d || 12, h: o.h || 6 }, wallM = o.wall || mat.wallE;
  const smy = LAND + SM.h / 2;
  box(SM.x, smy, SM.z + SM.d / 2 - 0.2, SM.w, SM.h, 0.4, wallM);
  box(SM.x - SM.w / 2 + 0.2, smy, SM.z, 0.4, SM.h, SM.d, wallM); box(SM.x + SM.w / 2 - 0.2, smy, SM.z, 0.4, SM.h, SM.d, wallM);
  const side = (SM.w - 6) / 2;
  box(SM.x - 3 - side / 2, smy, SM.z - SM.d / 2 + 0.2, side, SM.h, 0.4, wallM); box(SM.x + 3 + side / 2, smy, SM.z - SM.d / 2 + 0.2, side, SM.h, 0.4, wallM);
  box(SM.x, LAND + 4.5, SM.z - SM.d / 2 + 0.2, 6, SM.h - 3, 0.4, wallM);
  box(SM.x, LAND + SM.h + 0.15, SM.z, SM.w + 0.4, 0.3, SM.d + 0.4, o.roof || mat.concrete);
  box(SM.x - SM.w / 2, LAND + SM.h + 0.75, SM.z, 0.3, 0.9, SM.d + 0.4, o.trim || mat.concrete2, { roof: false });
  box(SM.x + SM.w / 2, LAND + SM.h + 0.75, SM.z - SM.d / 4 + 0.15, 0.3, 0.9, SM.d / 2 + 0.7, o.trim || mat.concrete2, { roof: false });
  box(SM.x - 2, LAND + SM.h + 0.75, SM.z - SM.d / 2, SM.w - 4, 0.9, 0.3, o.trim || mat.concrete2, { roof: false });
  for (const s of [-1, 1]) deco(new THREE.BoxGeometry(Math.min(5, side - 1.5), 2.2, 0.1), mat.glass, SM.x + s * (3 + side / 2), LAND + 1.6, SM.z - SM.d / 2 - 0.02, 0, 0, 0, false);
  if (o.sign) sign(o.sign, Math.min(SM.w - 4, 9), 1.6, o.signBg || '#2a9d8f', o.signFg || '#ffffff', SM.x, LAND + 4.6, SM.z - SM.d / 2 - 0.03, Math.PI, { border: o.signBorder || '#ffd23f' });
  const shelves = o.shelves || ['#e76f51', '#2a9d8f', '#e9c46a'];
  for (let i = 0; i < 3; i++) box(SM.x - 5 + i * 5, LAND + 0.9, SM.z + 1.5, 1, 1.8, Math.min(6, SM.d - 5), M(shelves[i % shelves.length]), { roof: false });
  ramp(V(SM.x + SM.w / 2 + 1.6, LAND, SM.z - SM.d / 2 - 8), V(SM.x + SM.w / 2 + 1.6, LAND + SM.h + 0.3, SM.z + 1), 3, o.rampM || mat.concrete2, { t: 0.5 });
  box(SM.x + SM.w / 2 + 1.6, LAND + SM.h + 0.05, SM.z + 3.6, 3, 0.5, 5.6, o.rampM || mat.concrete2);
  const path = [V(SM.x + SM.w / 2 + 1.6, LAND, SM.z - SM.d / 2 - 10), V(SM.x + SM.w / 2 + 1.6, LAND + SM.h, SM.z + 3.5), V(SM.x + SM.w / 2 - 1, LAND + SM.h + 0.3, SM.z + 3.5), V(SM.x, LAND + SM.h + 0.3, SM.z)];
  out.high.push({ name: o.name || 'mart', path, top: V(SM.x, LAND + SM.h + 0.3, SM.z), y: LAND + SM.h + 0.3, cap: 10, spread: 5 });
  out.shelter.push({ name: o.name || 'mart', path: [V(SM.x, LAND, SM.z - SM.d / 2 - 3)], top: V(SM.x, LAND, SM.z - 2), cap: 12, spread: Math.min(6, SM.w / 3) });
  out.tall.push(V(SM.x, LAND + SM.h, SM.z));
  out.edges.push({ x0: SM.x - SM.w / 2, x1: SM.x + SM.w / 2, z0: SM.z - SM.d / 2, z1: SM.z + SM.d / 2, y: LAND + SM.h });
  out.buildings.push(SM);
  block(K, SM.x - SM.w / 2 - 1.2, SM.x + SM.w / 2 + 4, SM.z - SM.d / 2 - 11, SM.z + SM.d / 2 + 1.2);
}

// a roof on four posts (gas station, ice cream stand, tractor shed...), with an optional little shop behind
function canopy(K, out, o) {
  const { box, deco, sign, mat, M } = K;
  const x = o.x, z = o.z, postM = o.post || mat.white;
  for (const [dx, dz] of [[-6, -4], [6, -4], [-6, 4], [6, 4]]) box(x + dx, LAND + 2.75, z + dz, 0.6, 5.5, 0.6, postM);
  box(x, LAND + 5.85, z, 15, 0.7, 10, o.roof || mat.red);
  box(x, LAND + 6.3, z, 15.2, 0.2, 10.2, o.top || mat.white);
  if (o.sign) sign(o.sign, Math.min(6, o.sign.length * 0.55 + 1), 0.6, o.signBg || '#e63946', o.signFg || '#ffffff', x, LAND + 5.85, z + 5.02, 0, { size: 0.8 });
  if (o.pumps) for (const dx of [-3, 3]) { box(x + dx, LAND + 0.9, z, 0.9, 1.8, 0.6, mat.white); deco(new THREE.BoxGeometry(0.7, 0.5, 0.05), M('#1b263b', { emissive: '#3a86ff', ei: 0.4 }), x + dx, LAND + 1.4, z + 0.33, 0, 0, 0, false); }
  if (o.tables) for (const dx of [-3, 3]) { K.cyl(x + dx, LAND + 0.45, z, 0.8, 0.9, mat.woodDark, { seg: 10, roof: false }); }
  if (o.shop) {
    box(x, LAND + 1.75, z - 9, 9, 3.5, 5, o.shopWall || mat.wallB); box(x, LAND + 3.65, z - 9, 9.4, 0.3, 5.4, o.roof || mat.red);
    deco(new THREE.BoxGeometry(4, 1.6, 0.1), mat.glass, x, LAND + 1.6, z - 6.45, 0, 0, 0, false);
    if (o.shopSign) sign(o.shopSign, 3.6, 0.7, '#ffd23f', '#3a2400', x, LAND + 3.0, z - 6.42, 0);
  }
  out.shelter.push({ name: o.name || 'canopy', path: [V(x, LAND, z + 7)], top: V(x, LAND, z), cap: 12, spread: 4 });
  block(K, x - 8, x + 8, z - (o.shop ? 12 : 5.5), z + 5.5);
}

// a little round roof on six posts
function gazebo(K, out, o) {
  const { cyl, deco, sign, mat } = K;
  const x = o.x, z = o.z;
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; cyl(x + Math.cos(a) * 3.6, LAND + 1.6, z + Math.sin(a) * 3.6, 0.18, 3.2, o.post || mat.white, { seg: 8 }); }
  cyl(x, LAND + 0.15, z, 4.2, 0.3, o.floor || mat.wood, { seg: 6 });
  cyl(x, LAND + 3.4, z, 4.4, 0.35, o.post || mat.white, { seg: 6 });
  deco(new THREE.ConeGeometry(4.8, 2.2, o.round ? 16 : 6), o.roof || mat.roofC, x, LAND + 4.7, z);
  if (o.sign) sign(o.sign, Math.min(4.4, o.sign.length * 0.45 + 1), 0.7, o.signBg || '#6a994e', '#ffffff', x, LAND + 3.0, z + 4.45, 0, { size: 0.62 });
  out.shelter.push({ name: o.name || 'gazebo', path: [V(x + 6, LAND, z)], top: V(x, LAND, z), cap: 5, spread: 2 });
  block(K, x - 5.5, x + 5.5, z - 5.5, z + 5.5);
}

function busStop(K, out, x, z, ry, roofM) {
  const { box, mat } = K;
  const back = new THREE.Vector3(0, 0, 1).applyAxisAngle(V(0, 1, 0), ry);
  box(x + back.x * 1, LAND + 1.3, z + back.z * 1, 4.4, 2.6, 0.15, mat.glass, { ry });
  box(x, LAND + 2.75, z, 4.8, 0.2, 2.4, roofM || mat.blue, { ry });
  for (const s of [-1, 1]) box(x + Math.cos(ry) * s * 2.2, LAND + 1.3, z - Math.sin(ry) * s * 2.2, 0.12, 2.6, 0.12, mat.metal, { ry });
  box(x + back.x * 0.6, LAND + 0.45, z + back.z * 0.6, 3.6, 0.15, 0.5, mat.wood, { ry, roof: false });
  out.shelter.push({ name: 'bus' + out.shelter.length, path: [], top: V(x - back.x * 0.1, LAND, z - back.z * 0.1), cap: 2, spread: 1.2 });
}

// a campfire: stones, logs and benches; it burns (and warms you) in a blizzard
function fire(K, out, x, z, o = {}) {
  const { box, deco, mat, live, M, ultra } = K;
  const f = V(x, K.heightAt(x, z), z);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; deco(new THREE.DodecahedronGeometry(0.32, 0), o.stone || mat.rock, f.x + Math.cos(a) * 1.1, f.y + 0.2, f.z + Math.sin(a) * 1.1); }
  if (o.pot) { deco(new THREE.SphereGeometry(0.9, 12, 8, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.65), mat.black, f.x, f.y + 1.2, f.z); }
  for (let i = 0; i < 3; i++) deco(new THREE.CylinderGeometry(0.12, 0.12, 1.6, 6), mat.woodDark, f.x, f.y + 0.25, f.z, i * 1.05, Math.PI / 2 - 0.3, 0);
  for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + 0.4; box(f.x + Math.cos(a) * 2.6, f.y + 0.3, f.z + Math.sin(a) * 2.6, 1.6, 0.4, 0.5, mat.woodDark, { ry: -a + Math.PI / 2, roof: false }); }
  const flame = new THREE.Group(); flame.position.copy(f); flame.visible = false; live.add(flame);
  for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.45 - i * 0.1, 1.2 + i * 0.3, 7), M(['#ff7b00', '#ffb703', '#ffe066'][i], { emissive: ['#ff5400', '#ff9e00', '#ffd23f'][i], ei: 1.5 })); c.position.y = 0.6 + i * 0.1; flame.add(c); }
  let light = null;
  if (!ultra) { light = new THREE.PointLight('#ff9a3c', 0, 14, 1.6); light.position.copy(f).add(V(0, 1.6, 0)); live.add(light); }
  out.fires.push({ flame, light, p: f });
  out.warm.push({ name: 'fire' + out.fires.length, path: [], top: V(f.x + 2, f.y, f.z), cap: 4, spread: 2, fire: f });
  block(K, x - 3.5, x + 3.5, z - 3.5, z + 3.5);
}

// the bots can climb every hill: a path up from the side that faces the middle of the island
function hillSpot(K, out, hl, name) {
  const l = Math.hypot(hl.x, hl.z) || 1, dx = -hl.x / l, dz = -hl.z / l;
  const base = V(hl.x + dx * hl.r * 0.95, LAND, hl.z + dz * hl.r * 0.95), mid = V(hl.x + dx * hl.r * 0.35, 0, hl.z + dz * hl.r * 0.35);
  mid.y = K.heightAt(mid.x, mid.z);
  out.high.push({ name: name || 'hill', path: [base, mid], top: V(hl.x, LAND + hl.h, hl.z), y: LAND + hl.h, cap: 12, spread: Math.max(2, hl.r * 0.15) });
  out.tall.push(V(hl.x, LAND + hl.h + 6, hl.z));
}

// the plaza in the middle (where everyone lands): something small, so the beans have room
function centerPiece(K, kind, o = {}) {
  const { cyl, deco, live, mat, M } = K;
  if (kind === 'fountain') {
    cyl(0, LAND + 0.35, 0, 4.2, 0.7, o.stone || mat.stone, { seg: 24 });
    const fw = new THREE.Mesh(new THREE.CylinderGeometry(3.7, 3.7, 0.1, 24), M(o.water || '#62c4ff', { rough: 0.1, emissive: o.waterGlow || '#1d6fb8', ei: 0.3 })); fw.position.set(0, LAND + 0.68, 0); live.add(fw);
    cyl(0, LAND + 1.5, 0, 0.5, 2.2, o.stone || mat.stone, { seg: 12 });
    cyl(0, LAND + 2.6, 0, 1.4, 0.3, o.stone || mat.stone, { seg: 16, r2: 1.6 });
  } else if (kind === 'statue') {
    cyl(0, LAND + 0.6, 0, 2.4, 1.2, o.stone || mat.stone, { seg: 8 });
    const body = deco(new THREE.CapsuleGeometry(0.9, 1.2, 6, 14), o.metal || M('#d4af37', { metal: 0.7, rough: 0.3 }), 0, LAND + 2.9, 0);
    body.scale.set(1, 1, 0.9);
    for (const s of [-1, 1]) deco(new THREE.SphereGeometry(0.2, 10, 8), mat.black, s * 0.32, LAND + 3.5, 0.75);
    K.collide('cyl', body, { r: 1, h: 1.5 });
  } else if (kind === 'well') {
    cyl(0, LAND + 0.5, 0, 1.6, 1.0, o.stone || mat.stone, { seg: 14 });
    deco(new THREE.CylinderGeometry(1.35, 1.35, 0.05, 14), M('#2f6fa0', { rough: 0.2 }), 0, LAND + 0.9, 0);
    for (const s of [-1, 1]) cyl(s * 1.4, LAND + 1.6, 0, 0.12, 2.2, mat.woodDark, { seg: 6, roof: false });
    deco(new THREE.ConeGeometry(2.2, 1.2, 4), o.roof || mat.roofA, 0, LAND + 3.2, 0, Math.PI / 4);
  } else if (kind === 'cake') {
    cyl(0, LAND + 0.6, 0, 3.2, 1.2, M('#ffd1e8'), { seg: 24 });
    cyl(0, LAND + 1.6, 0, 2.2, 0.9, M('#fff3e0'), { seg: 24 });
    deco(new THREE.SphereGeometry(0.6, 12, 10), M('#e63946', { rough: 0.25 }), 0, LAND + 2.4, 0);
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; deco(new THREE.SphereGeometry(0.35, 8, 6), M(['#ff6fd8', '#ffffff', '#ffd23f'][i % 3]), Math.cos(a) * 3, LAND + 1.25, Math.sin(a) * 3); }
  } else if (kind === 'anchor') {
    cyl(0, LAND + 0.4, 0, 2.6, 0.8, o.stone || mat.stone, { seg: 10 });
    const g = mat.dark;
    cyl(0, LAND + 2.8, 0, 0.22, 4, g, { seg: 8 });
    deco(new THREE.TorusGeometry(1.4, 0.2, 8, 20, Math.PI), g, 0, LAND + 1.6, 0, 0, Math.PI, 0);
    deco(new THREE.TorusGeometry(0.5, 0.12, 8, 16), g, 0, LAND + 5.0, 0);
    deco(new THREE.BoxGeometry(2.2, 0.25, 0.25), g, 0, LAND + 4.3, 0);
  } else if (kind === 'idol') {
    cyl(0, LAND + 0.5, 0, 2.6, 1, o.stone || mat.stone, { seg: 6 });
    const head = deco(new THREE.BoxGeometry(1.8, 2.8, 1.6), M('#7d8a6a', { flat: true }), 0, LAND + 2.4, 0);
    for (const s of [-1, 1]) deco(new THREE.SphereGeometry(0.22, 8, 6), M('#7bd389', { emissive: '#3fbf5a', ei: 1.2 }), s * 0.45, LAND + 3, 0.82);
    K.collide('box', head, { half: new THREE.Vector3(0.9, 1.4, 0.8) });
  }
}

// lamp posts along the roads
function lamps(K, list, o = {}) {
  const { cyl, deco, mat } = K;
  for (const [x, z] of list) { cyl(x, LAND + 2.4, z, 0.12, 4.8, o.post || mat.dark, { seg: 6, roof: false }); deco(new THREE.SphereGeometry(0.35, 10, 8), o.light || mat.lamp, x, LAND + 4.9, z); }
}

// ---------- trees and other things that grow ----------
function tree(K, kind, x, z, s) {
  const { cyl, deco, mat, M, R, collide } = K;
  const y = K.heightAt(x, z);
  if (kind === 'round' || kind === 'pine' || kind === 'snowpine') {
    cyl(x, y + 1.2 * s, z, 0.3 * s, 2.4 * s, mat.trunk, { seg: 7, roof: false });
    if (kind === 'round') {
      const leafM = [mat.leaf, mat.leaf2, mat.leaf3][Math.floor(R() * 3)];
      deco(new THREE.IcosahedronGeometry(1.9 * s, 1), leafM, x, y + 3.6 * s, z);
      deco(new THREE.IcosahedronGeometry(1.3 * s, 1), leafM, x + 0.8 * s, y + 4.6 * s, z - 0.4 * s);
    } else for (let i = 0; i < 3; i++) {
      deco(new THREE.ConeGeometry((2.1 - i * 0.55) * s, 2.2 * s, 8), mat.pine, x, y + (2.8 + i * 1.3) * s, z);
      if (kind === 'snowpine') deco(new THREE.ConeGeometry((1.35 - i * 0.38) * s, 0.9 * s, 8), mat.white, x, y + (3.45 + i * 1.3) * s, z);
    }
  } else if (kind === 'palm') {
    const lean = (R() - 0.5) * 0.5, la = R() * Math.PI * 2;
    let px = x, py = y, pz = z;
    for (let i = 0; i < 5; i++) {
      const seg = deco(new THREE.CylinderGeometry(0.22 * s, 0.28 * s, 1.3 * s, 7), M('#9c7a4c', { flat: true }), px, py + 0.65 * s, pz, 0, Math.cos(la) * lean * i * 0.25, Math.sin(la) * lean * i * 0.25);
      px += Math.sin(la) * lean * 0.3 * i * s * 0.4; pz += Math.cos(la) * lean * 0.3 * i * s * 0.4; py += 1.22 * s;
      if (i === 0) collide('cyl', seg, { r: 0.35 * s, h: 0.65 * s, roof: false });
    }
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2 + R();
      const leaf = deco(new THREE.BoxGeometry(0.9 * s, 0.08, 3.2 * s), i % 2 ? mat.leaf2 : mat.leaf, px + Math.sin(a) * 1.3 * s, py + 0.1, pz + Math.cos(a) * 1.3 * s, a, 0.45, 0);
      leaf.rotation.order = 'YXZ'; leaf.rotation.set(0.45, a, 0);
    }
    for (let i = 0; i < 3; i++) deco(new THREE.SphereGeometry(0.22 * s, 8, 6), M('#6b4423'), px + Math.cos(i * 2.1) * 0.35 * s, py - 0.25, pz + Math.sin(i * 2.1) * 0.35 * s);
  } else if (kind === 'cactus') {
    const g = M('#3f8f4a', { flat: true }), hgt = 2.6 * s;
    const m = deco(new THREE.CylinderGeometry(0.42 * s, 0.48 * s, hgt, 9), g, x, y + hgt / 2, z);
    deco(new THREE.SphereGeometry(0.42 * s, 9, 6), g, x, y + hgt, z);
    collide('cyl', m, { r: 0.5 * s, h: hgt / 2, roof: false });
    for (const sd of [-1, 1]) {
      if (R() < 0.25) continue;
      const ah = (0.9 + R() * 0.8) * s;
      deco(new THREE.CylinderGeometry(0.22 * s, 0.22 * s, 0.9 * s, 7), g, x + sd * 0.6 * s, y + hgt * 0.45, z, 0, 0, Math.PI / 2);
      deco(new THREE.CylinderGeometry(0.24 * s, 0.24 * s, ah, 7), g, x + sd * 1.0 * s, y + hgt * 0.45 + ah / 2, z);
      deco(new THREE.SphereGeometry(0.24 * s, 7, 5), g, x + sd * 1.0 * s, y + hgt * 0.45 + ah, z);
    }
    if (R() < 0.4) deco(new THREE.SphereGeometry(0.18 * s, 7, 5), M('#ff6fd8'), x, y + hgt + 0.35 * s, z);
  } else if (kind === 'dead') {
    const bark = M('#4a3b33', { flat: true });
    cyl(x, y + 1.8 * s, z, 0.25 * s, 3.6 * s, bark, { seg: 6, roof: false, r2: 0.12 * s });
    for (let i = 0; i < 4; i++) { const a = i * 1.7 + R(), l = (1.2 + R()) * s; deco(new THREE.CylinderGeometry(0.06 * s, 0.11 * s, l, 5), bark, x + Math.sin(a) * l * 0.4, y + (2.2 + i * 0.5) * s, z + Math.cos(a) * l * 0.4, a, 0.9, 0); }
  } else if (kind === 'jungle') {
    const hgt = (4 + R() * 3) * s;
    cyl(x, y + hgt / 2, z, 0.35 * s, hgt, M('#6b4f2f', { flat: true }), { seg: 7, roof: false, r2: 0.25 * s });
    const leaves = [mat.leaf2, M('#1f6b3a', { flat: true }), mat.leaf];
    for (let i = 0; i < 3; i++) { const a = i * 2.1 + R(); const lf = deco(new THREE.IcosahedronGeometry((1.8 + R() * 0.8) * s, 1), leaves[i % 3], x + Math.sin(a) * 1.1 * s, y + hgt + (i - 1) * 0.5 * s, z + Math.cos(a) * 1.1 * s); lf.scale.y = 0.6; }
    if (R() < 0.5) for (let i = 0; i < 2; i++) deco(new THREE.CylinderGeometry(0.04, 0.04, hgt * 0.7, 4), mat.leaf2, x + (i ? 0.9 : -0.8) * s, y + hgt * 0.62, z + 0.3 * s, 0, 0, 0, false);
  } else if (kind === 'lollipop') {
    const hgt = (2.8 + R() * 1.4) * s;
    cyl(x, y + hgt / 2, z, 0.12 * s, hgt, mat.white, { seg: 6, roof: false });
    const col = ['#ff4d6d', '#3a86ff', '#ffd23f', '#8338ec', '#2ec4b6'][Math.floor(R() * 5)];
    const c = deco(new THREE.CylinderGeometry(1.3 * s, 1.3 * s, 0.35 * s, 20), M(col, { rough: 0.25 }), x, y + hgt + 1.1 * s, z, R() * 3, Math.PI / 2, 0);
    deco(new THREE.TorusGeometry(0.75 * s, 0.1 * s, 6, 18), mat.white, x, y + hgt + 1.1 * s, z, c.rotation.y, Math.PI / 2, 0, false).rotation.set(Math.PI / 2, c.rotation.y, 0);
  } else if (kind === 'cane') {
    const red = M('#e63946', { rough: 0.3 }), hgt = 3.2 * s;
    for (let i = 0; i < 6; i++) deco(new THREE.CylinderGeometry(0.22 * s, 0.22 * s, hgt / 6, 10), i % 2 ? mat.white : red, x, y + hgt / 12 + i * hgt / 6, z);
    deco(new THREE.TorusGeometry(0.55 * s, 0.22 * s, 8, 14, Math.PI), red, x + 0.55 * s, y + hgt, z);
    K.collide('cyl', K.deco(new THREE.CylinderGeometry(0.01, 0.01, 0.01, 3), mat.white, x, y + hgt / 2, z, 0, 0, 0, false), { r: 0.3 * s, h: hgt / 2, roof: false });
  }
}

// trees (and rocks) all over the free land: not on roads, buildings or the plaza
function scatter(K, cfg, T, n, kinds) {
  const R0 = cfg.r || 74, road = ROADS[T.roads || 'cross'], rw = (T.roadW || 4) + 2.5;
  const free = (x, z, pad) => !K.blocked.some(b => x > b[0] - pad && x < b[1] + pad && z > b[2] - pad && z < b[3] + pad) && !road(x, z, rw, R0) && Math.hypot(x, z) > 15 && Math.hypot(x, z) < R0 - 3;
  let made = 0;
  const want = K.ultra ? Math.round(n * 0.6) : n;
  for (let k = 0; k < 900 && made < want; k++) {
    const x = (K.R() - 0.5) * 2 * R0, z = (K.R() - 0.5) * 2 * R0;
    if (!free(x, z, 2.5)) continue;
    const kind = kinds[Math.floor(K.R() * kinds.length)];
    tree(K, kind, x, z, 0.8 + K.R() * 0.6);
    K.blocked.push([x - 1, x + 1, z - 1, z + 1]);
    made++;
  }
  return free;
}
function coastRocks(K, cfg, m) {
  const R0 = cfg.r || 74;
  for (let k = 0; k < 40; k++) {
    const a = K.R() * Math.PI * 2, r = R0 - 4 + K.R() * 22, x = Math.cos(a) * r, z = Math.sin(a) * r;
    const s = 0.6 + K.R() * 1.4; K.deco(new THREE.DodecahedronGeometry(s, 0), m || K.mat.rock, x, K.heightAt(x, z) + s * 0.3, z, K.R() * 3, K.R(), K.R());
  }
}
// boxes you can climb on (crates, hay bales, barrels)
function stack(K, x, z, m, kind = 'box') {
  const { box, cyl } = K;
  if (kind === 'hay') { cyl(x, LAND + 0.6, z, 0.7, 1.4, m, { seg: 12, rz: Math.PI / 2 }); cyl(x + 1.5, LAND + 0.6, z, 0.7, 1.4, m, { seg: 12, rz: Math.PI / 2 }); cyl(x + 0.75, LAND + 1.8, z, 0.7, 1.4, m, { seg: 12, rz: Math.PI / 2 }); }
  else if (kind === 'barrel') { for (const [dx, dz] of [[0, 0], [1.1, 0.3], [0.4, 1.1]]) cyl(x + dx, LAND + 0.65, z + dz, 0.5, 1.3, m, { seg: 12 }); }
  else { box(x, LAND + 0.6, z, 1.2, 1.2, 1.2, m); box(x + 1.2, LAND + 0.6, z + 0.3, 1.2, 1.2, 1.2, m); box(x + 0.4, LAND + 1.8, z + 0.2, 1.2, 1.2, 1.2, m); }
  K.blocked.push([x - 1.5, x + 2.5, z - 1.5, z + 2]);
}
function cars(K, list, cols) {
  const { box, deco, mat, M } = K;
  list.forEach(([x, z, ry], i) => {
    const c = M(cols[i % cols.length], { rough: 0.35, metal: 0.2 });
    box(x, LAND + 0.85, z, 4.2, 1.0, 1.9, c, { ry });
    const ux = Math.cos(ry), uz = -Math.sin(ry);
    box(x - ux * 0.3, LAND + 1.75, z - uz * 0.3, 2.3, 0.85, 1.75, c, { ry });
    deco(new THREE.BoxGeometry(2.0, 0.6, 1.8), mat.glass, x - ux * 0.3, LAND + 1.75, z - uz * 0.3, ry, 0, 0, false);
    for (const s of [-1, 1]) for (const t of [-1, 1]) { const w = deco(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12), mat.tire, x + ux * s * 1.35 + Math.sin(ry) * t * 0.95, LAND + 0.42, z + uz * s * 1.35 + Math.cos(ry) * t * 0.95); w.rotation.order = 'YXZ'; w.rotation.set(Math.PI / 2, ry, 0); }
  });
}

// ---------- far away: other islands and the volcano (the volcano disaster shoots from it) ----------
function farScenery(K, o = {}) {
  const { live, M, R } = K;
  const VOLC = V(-230, 0, -210);
  const vol = new THREE.Mesh(new THREE.CylinderGeometry(14, 95, 85, 24, 4), M(o.volcano || '#5b4b49', { flat: true }));
  vol.position.set(VOLC.x, 40, VOLC.z); live.add(vol);
  const crater = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, 1, 20), M('#ff5400', { emissive: '#ff3c00', ei: 0.6 })); crater.position.set(VOLC.x, 82.6, VOLC.z); live.add(crater);
  VOLC.y = 84;
  for (let i = 0; i < 7; i++) {
    const a = 0.6 + i * 0.85, r = 300 + R() * 160, x = Math.cos(a) * r, z = Math.sin(a) * r, s = 20 + R() * 40;
    if (Math.hypot(x - VOLC.x, z - VOLC.z) < 160) continue;
    const isl = new THREE.Mesh(new THREE.ConeGeometry(s, s * 0.7, 9), M(o.islands || '#6a8f4e', { flat: true })); isl.position.set(x, s * 0.2, z); live.add(isl);
  }
  return { pos: VOLC, crater };
}

// ---------- one-off places ----------
// a stepped temple pyramid with stairs up the +z side and a little roofed shrine on top
function pyramid(K, out, o) {
  const { box, cyl, ramp, deco, mat, M } = K;
  const x = o.x, z = o.z, stone = o.stone || M('#a39e86', { flat: true }), moss = M('#6f8f4f', { flat: true });
  const sizes = [24, 18, 12, 7];
  sizes.forEach((s, i) => { box(x, LAND + 1.5 + i * 3, z, s, 3, s, i % 2 ? moss : stone); });
  const top = LAND + 12;
  ramp(V(x, LAND, z + 24), V(x, top, z + 3.5), 4, stone, { steps: moss, t: 0.5 });
  for (const s of [-1, 1]) for (const dz of [-2.6, 2.6]) cyl(x + s * 2.6, top + 1.6, z + dz, 0.35, 3.2, stone, { seg: 8 });
  box(x, top + 3.4, z, 7, 0.5, 7, stone);
  deco(new THREE.ConeGeometry(4.6, 2, 4), moss, x, top + 4.6, z, Math.PI / 4);
  deco(new THREE.SphereGeometry(0.7, 12, 10), M('#ffd23f', { emissive: '#ffb703', ei: 0.8, metal: 0.6, rough: 0.3 }), x, top + 0.8, z);
  const path = [V(x, LAND, z + 27), V(x, LAND + 6, z + 14), V(x, top, z + 3.5)];
  out.high.push({ name: 'temple', path, top: V(x, top, z), y: top, cap: 14, spread: 2.4 });
  out.shelter.push({ name: 'shrine', path, top: V(x, top, z - 1), cap: 8, spread: 1.8 });
  out.tall.push(V(x, top + 4, z));
  out.edges.push({ x0: x - 12, x1: x + 12, z0: z - 12, z1: z + 12, y: top });
  block(K, x - 13, x + 13, z - 13, z + 27);
}
// a pirate ship washed up on the beach: a deck to stand on, a cabin to hide in, masts for lightning
function ship(K, out, o) {
  const { box, cyl, ramp, deco, mat, M } = K;
  const x = o.x, z = o.z, len = 22, wid = 7, deckY = LAND + 5, s = z < 0 ? 1 : -1;
  const hull = M('#5a3a22', { flat: true }), plank = M('#8b5a2b');
  box(x, LAND + 2.5, z, len, 5, wid, hull);
  deco(new THREE.ConeGeometry(wid / 2, 6, 4), hull, x + len / 2 + 2.6, LAND + 3, z, 0, 0, -Math.PI / 2).rotation.set(Math.PI / 4, 0, -Math.PI / 2);
  box(x, deckY + 0.1, z, len, 0.2, wid, plank);
  for (const sd of [-1, 1]) {
    const rz = z + sd * (wid / 2 - 0.1);
    if (sd !== s) { box(x, deckY + 0.7, rz, len, 1, 0.2, hull, { roof: false }); continue; }
    // a gap where the plank comes up
    const a0 = x - len / 2, a1 = x + 0.4, b0 = x + 3.6, b1 = x + len / 2;
    box((a0 + a1) / 2, deckY + 0.7, rz, a1 - a0, 1, 0.2, hull, { roof: false }); box((b0 + b1) / 2, deckY + 0.7, rz, b1 - b0, 1, 0.2, hull, { roof: false });
  }
  box(x + len / 2 - 0.1, deckY + 0.7, z, 0.2, 1, wid, hull, { roof: false });
  // the captain's cabin at the back (open to the front)
  const cx = x - len / 2 + 3;
  box(cx - 2.4, deckY + 1.6, z, 0.3, 3, wid - 0.4, hull);
  for (const sd of [-1, 1]) box(cx, deckY + 1.6, z + sd * (wid / 2 - 0.35), 5, 3, 0.3, hull);
  box(cx, deckY + 3.25, z, 5.4, 0.3, wid, plank);
  for (const [mx, mh] of [[x - 1, 15], [x + 6, 12]]) {
    cyl(mx, deckY + mh / 2, z, 0.3, mh, M('#6b4423'), { seg: 8, roof: false });
    deco(new THREE.BoxGeometry(0.1, mh * 0.45, wid * 0.95), M('#f4ecd8', { double: true }), mx + 0.4, deckY + mh * 0.6, z, 0, 0, 0, false);
    deco(new THREE.BoxGeometry(0.1, 1.2, 1.8), mat.black, mx, deckY + mh + 0.6, z + 0.9, 0, 0, 0, false);
    out.tall.push(V(mx, deckY + mh, z));
  }
  ramp(V(x + 2, LAND, z + s * (wid / 2 + 9)), V(x + 2, deckY + 0.2, z + s * (wid / 2 - 0.2)), 2.4, plank, { steps: hull, t: 0.3 });
  const path = [V(x + 2, LAND, z + s * (wid / 2 + 11)), V(x + 2, deckY, z + s * (wid / 2 - 0.5)), V(x + 2, deckY, z)];
  out.high.push({ name: 'ship', path, top: V(x + 3, deckY + 0.2, z), y: deckY + 0.2, cap: 14, spread: 3.5 });
  out.shelter.push({ name: 'cabin', path, top: V(cx, deckY + 0.2, z), cap: 6, spread: 1.5 });
  out.edges.push({ x0: x - len / 2, x1: x + len / 2, z0: z - wid / 2, z1: z + wid / 2, y: deckY });
  block(K, x - len / 2 - 2, x + len / 2 + 6, z - wid / 2 - 12, z + wid / 2 + 12);
}
function windmill(K, out, x, z) {
  const { cyl, deco, mat, M, live } = K;
  cyl(x, LAND + 7, z, 2.2, 14, M('#f4e1c1'), { seg: 12, r2: 1.5 });
  deco(new THREE.ConeGeometry(2.2, 2.4, 12), mat.roofA, x, LAND + 15.2, z);
  const hub = new THREE.Group(); hub.position.set(x, LAND + 13, z + 2.2); live.add(hub);
  for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.9, 7, 0.12), M('#fff8e7')); b.position.y = 3.6; const arm = new THREE.Group(); arm.rotation.z = i * Math.PI / 2; arm.add(b); hub.add(arm); }
  hub.userData.spin = 0.8; out.spinners.push(hub);
  out.tall.push(V(x, LAND + 16, z));
  out.edges.push({ x0: x - 2.2, x1: x + 2.2, z0: z - 2.2, z1: z + 2.2, y: LAND + 14 });
  block(K, x - 4, x + 4, z - 4, z + 5);
}
function graveyard(K, x, z) {
  const { box, deco, M } = K;
  const st = M('#8d8f96', { flat: true });
  for (let i = 0; i < 12; i++) {
    const gx = x + (i % 4) * 3 - 4.5, gz = z + Math.floor(i / 4) * 3.5 - 3.5;
    box(gx, LAND + 0.6, gz, 0.9, 1.2, 0.3, st, { roof: false });
    deco(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 10, 1, false, 0, Math.PI), st, gx, LAND + 1.2, gz, 0, Math.PI / 2, 0);
  }
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; deco(new THREE.BoxGeometry(0.12, 1.2, 0.12), M('#2b2d42'), x + Math.cos(a) * 9, LAND + 0.6, z + Math.sin(a) * 9, 0, 0, 0, false); }
  block(K, x - 9, x + 9, z - 9, z + 9);
}
function pumpkins(K, list) {
  const { deco, M } = K;
  const o = M('#ff7b00', { emissive: '#ff5400', ei: 0.35, rough: 0.5 });
  for (const [x, z, s] of list) { const p = deco(new THREE.SphereGeometry(0.7 * s, 12, 8), o, x, K.heightAt(x, z) + 0.55 * s, z); p.scale.y = 0.75; deco(new THREE.CylinderGeometry(0.08 * s, 0.1 * s, 0.4 * s, 5), K.mat.leaf2, x, K.heightAt(x, z) + 1.1 * s, z); }
}
function snowmen(K, list) {
  const { deco, mat, M } = K;
  for (const [x, z] of list) {
    const y = K.heightAt(x, z), b = deco(new THREE.SphereGeometry(0.9, 14, 10), mat.white, x, y + 0.8, z);
    K.collide('sphere', b, { r: 0.9, roof: false });
    deco(new THREE.SphereGeometry(0.65, 14, 10), mat.white, x, y + 2.0, z); deco(new THREE.SphereGeometry(0.45, 12, 10), mat.white, x, y + 2.9, z);
    deco(new THREE.ConeGeometry(0.1, 0.5, 6), M('#ff7b00'), x, y + 2.9, z + 0.6, 0, Math.PI / 2, 0);
    deco(new THREE.CylinderGeometry(0.35, 0.35, 0.5, 10), mat.black, x, y + 3.45, z);
  }
}
function gumdrops(K, list) {
  for (const [x, z, c] of list) {
    const m = K.cyl(x, LAND + 0.45, z, 1.6, 0.9, K.M(c, { rough: 0.3 }), { seg: 16, r2: 1.1, surface: 'bounce', bounce: 17, roof: false });
    K.deco(new THREE.SphereGeometry(1.1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), m.material, x, LAND + 0.9, z);
    K.blocked.push([x - 2, x + 2, z - 2, z + 2]);
  }
}

// ================= the nine maps =================
function arena(def) {
  return { id: def.id, name: def.name, tip: def.tip, hill: def.hills[0], height: makeHeight(def), build: K => buildArena(K, def) };
}
function buildArena(K, def) {
  const out = { high: [], shelter: [], warm: [], tall: [], edges: [], houses: [], buildings: [], fires: [], spinners: [], beam: null };
  const T = def.ground;
  const { groundMesh, groundTex } = K.groundOf(painter(K, T, def));
  centerPiece(K, def.center || 'fountain', def.centerOpt);
  def.build(K, out);
  def.hills.forEach((hl, i) => hillSpot(K, out, hl, 'hill' + i));
  if (def.trees) scatter(K, def, T, def.trees.n, def.trees.kinds);
  coastRocks(K, def, def.coastRock && K.M(def.coastRock, { flat: true }));
  const volcano = farScenery(K, def.far);
  // a map with no lighthouse still has a "beam" (the game makes it glow): keep a tiny hidden one
  const beam = out.beam || new THREE.Mesh(new THREE.SphereGeometry(0.01), K.M('#000000', { emissive: '#000000' }));
  return {
    spots: { high: out.high, shelter: out.shelter, warm: out.warm }, tallPoints: out.tall, fires: out.fires, beam, volcano,
    houses: out.houses, buildings: out.buildings, edges: out.edges, groundMesh, groundTex, spinners: out.spinners
  };
}
const C = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

const DEFS = [
  // ---------- PALM BEACH ----------
  {
    id: 'beach', name: 'Palm Beach', tip: 'Sunny sand, palm trees and a big beach hotel.',
    r: 66, hills: [{ x: 46, z: -46, r: 22, h: 9 }],
    ground: { roads: 'cross', base: C('#9fd36a'), hill: C('#e9d29a'), sand: C('#f6e2a8'), road: C('#c9a26b'), walk: C('#e8d5a8'), plaza: [C('#f4e1c1'), C('#e9d2a8')], dots: ['#ffffff', '#ff6fd8', '#ffd23f'], patches: C('#efdcaa') },
    center: 'fountain', trees: { n: 46, kinds: ['palm', 'palm', 'palm', 'round'] }, coastRock: '#a8957a',
    far: { islands: '#5fae5a' },
    build(K, out) {
      const { mat, M } = K;
      tower(K, out, { name: 'hotel', x0: -36, x1: -20, z0: -38, z1: -26, n: 4, wall: M('#ffd6e0'), sign: 'BEACH HOTEL', signBg: '#ff6fd8' });
      spiral(K, out, { name: 'surf tower', x: 44, z: 34, h: 22, body: mat.white, stripe: mat.blue, capM: mat.blue, railM: mat.yellow, sign: 'SURF TOWER', signBg: '#3a86ff' });
      const hut = { wall: M('#f4e1c1'), roof: M('#e9c46a', { rough: 0.9 }) };
      house(K, out, { x: -18, z: 14, face: -1, ...hut }); house(K, out, { x: -32, z: 14, face: -1, ...hut }); house(K, out, { x: 18, z: 14, face: -1, ...hut }); house(K, out, { x: -18, z: -16, face: 1, ...hut });
      mart(K, out, { name: 'surf shop', x: -30, z: 38, wall: M('#cfe8ff'), sign: 'SURF SHOP', signBg: '#3a86ff' });
      canopy(K, out, { name: 'ice cream', x: 16, z: -22, roof: M('#ff6fd8'), sign: 'ICE CREAM', signBg: '#ff6fd8', tables: true });
      gazebo(K, out, { name: 'tiki bar', x: 14, z: 40, roof: M('#c9a26b', { flat: true }), post: mat.wood, sign: 'TIKI BAR', signBg: '#a0673a' });
      for (const [x, z] of [[-56, 10], [56, 8], [4, 56], [-14, -54], [-50, -24]]) fire(K, out, x, z);
      lamps(K, [[-14, 5.2], [14, 5.2], [-14, -5.2], [14, -5.2], [5.2, 30], [-5.2, -30]], { post: mat.wood });
      // lifeguard chairs and beach umbrellas
      for (const [x, z, c] of [[30, -6.5, '#e63946'], [-40, 7, '#3a86ff'], [8, 48, '#ffd23f'], [-46, -8, '#2ec4b6']]) {
        K.cyl(x, LAND + 1.3, z, 0.06, 2.6, mat.white, { seg: 6, roof: false });
        K.deco(new THREE.ConeGeometry(1.8, 0.7, 10), M(c), x, LAND + 2.7, z);
      }
    }
  },
  // ---------- FROSTY VILLAGE ----------
  {
    id: 'snow', name: 'Frosty Village', tip: 'A snowy mountain town with log cabins and a slippery ice rink.',
    r: 74, hills: [{ x: 42, z: -44, r: 30, h: 14 }],
    ground: { roads: 'cross', base: C('#eef4fb'), hill: C('#ffffff'), sand: C('#d9e4ee'), road: C('#a9b7c6'), walk: C('#dbe5ef'), plaza: [C('#dfe8f2'), C('#cfdbe8')], patches: C('#e2ecf6') },
    center: 'fountain', centerOpt: { water: '#cfeaff', waterGlow: '#5aa0d8' }, trees: { n: 60, kinds: ['snowpine', 'snowpine', 'pine'] }, coastRock: '#7f8a99',
    far: { islands: '#e8eef5', volcano: '#4e4a4f' },
    build(K, out) {
      const { mat, M } = K;
      const log = M('#8b5a2b', { flat: true }), snowRoof = M('#ffffff', { rough: 0.9 });
      tower(K, out, { name: 'lodge', x0: -36, x1: -20, z0: -36, z1: -24, n: 4, wall: log, trim: M('#d9e4ee'), sign: 'SKI LODGE', signBg: '#3d5a80' });
      spiral(K, out, { name: 'clock tower', x: -50, z: 46, h: 24, body: M('#9aa1ab', { flat: true }), capM: M('#3d5a80'), capH: 4, railM: mat.dark, sign: 'CLOCK TOWER', signBg: '#3d5a80' });
      for (const [x, z, f] of [[16, 13, -1], [31, 13, -1], [16, -13, 1], [-16, 13, -1]]) house(K, out, { x, z, face: f, wall: log, roof: snowRoof, ceil: M('#d9e4ee'), bush: mat.pine });
      mart(K, out, { name: 'cocoa', x: 31, z: 38, wall: M('#f4e1c1'), sign: 'HOT COCOA', signBg: '#6f4a2a' });
      gazebo(K, out, { name: 'sleigh stop', x: -36, z: -9, roof: snowRoof, post: log, sign: 'SLEIGHS', signBg: '#d1495b' });
      // the ice rink: slippery!
      K.cyl(-26, LAND + 0.1, 34, 9, 0.2, M('#d6f0ff', { rough: 0.05, metal: 0.1 }), { seg: 32, surface: 'ice', roof: false });
      for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; K.deco(new THREE.BoxGeometry(2.4, 0.5, 0.15), mat.white, -26 + Math.cos(a) * 9.3, LAND + 0.35, 34 + Math.sin(a) * 9.3, -a + Math.PI / 2, 0, 0, false); }
      block(K, -36, -16, 24, 44);
      snowmen(K, [[-8, 22], [24, -26], [-44, -16], [10, 58], [-58, 20], [52, 10]]);
      for (const [x, z] of [[6, -26], [-44, 6], [46, 56], [-10, 58], [62, -4], [-30, -50]]) fire(K, out, x, z);
      lamps(K, [[-14, 5.2], [14, 5.2], [-14, -5.2], [14, -5.2], [-40, 5.2], [40, 5.2], [5.2, 30], [-5.2, -30]], { post: mat.dark });
    }
  },
  // ---------- CACTUS CANYON ----------
  {
    id: 'desert', name: 'Cactus Canyon', tip: 'A dusty desert town between two big red mesas.',
    r: 74, hills: [{ x: 44, z: -42, r: 26, h: 12 }, { x: -50, z: -38, r: 20, h: 8 }],
    ground: { roads: 'cross', base: C('#e2b273'), hill: C('#c8693e'), sand: C('#f0cf95'), road: C('#b98a5e'), walk: C('#d8b07c'), plaza: [C('#e8c79a'), C('#d6b080')], patches: C('#d9a467') },
    center: 'well', centerOpt: { roof: null }, trees: { n: 48, kinds: ['cactus', 'cactus', 'cactus', 'dead'] }, coastRock: '#a0583a',
    far: { islands: '#c98a52', volcano: '#6a3b2a' },
    build(K, out) {
      const { mat, M } = K;
      const adobe = M('#e3b88a', { flat: true }), adobeRoof = M('#c98a52', { flat: true }), wood = M('#8b5a2b');
      spiral(K, out, { name: 'water tower', x: -46, z: 46, h: 22, body: wood, room: false, cap: 'tank', capM: M('#7a4f2a'), rampM: M('#a0673a'), railM: mat.woodDark, sign: 'WATER', signBg: '#2a6f97' });
      tower(K, out, { name: 'hotel', x0: 18, x1: 34, z0: 16, z1: 28, n: 4, wall: adobe, trim: M('#cfa77c'), trim2: M('#b98a5e'), sign: 'GRAND HOTEL', signBg: '#a0583a' });
      mart(K, out, { name: 'saloon', x: -34, z: 22, wall: wood, roof: M('#6f4a2a'), trim: M('#5a3a22'), rampM: M('#a0673a'), sign: 'SALOON', signBg: '#5a3a22', signBorder: '#e9c46a' });
      for (const [x, z, f] of [[-16, -14, 1], [16, -14, 1], [-30, -14, 1], [30, -12, 1]]) house(K, out, { x, z, face: f, style: 'flat', wall: adobe, roof: adobeRoof, ceil: adobeRoof, bushes: false });
      canopy(K, out, { name: 'gas', x: 52, z: 22, roof: M('#e63946'), pumps: true, shop: true, shopWall: adobe, shopSign: 'SNACKS', sign: 'GAS' });
      busStop(K, out, 8.5, 7.2, 0, wood); busStop(K, out, -8.5, -7.2, Math.PI, wood);
      for (const [x, z] of [[6, -30], [-46, 6], [40, 52], [-12, 58], [62, -6]]) fire(K, out, x, z);
      for (const [x, z] of [[-60, 24], [24, -58], [-20, -48], [60, 40]]) stack(K, x, z, M('#a0673a'), 'barrel');
      cars(K, [[-46, 1.8, 0], [24, -2, 0], [-2, 22, Math.PI / 2]], ['#e63946', '#e9c46a', '#2a9d8f']);
    }
  },
  // ---------- BEAN CITY ----------
  {
    id: 'city', name: 'Bean City', tip: 'Skyscrapers, busy streets and a tall radio tower.',
    r: 76, hills: [{ x: 16, z: 48, r: 11, h: 5 }],
    ground: { roads: 'grid', roadW: 4, base: C('#8fbf6a'), hill: C('#6fa84e'), sand: C('#e8d5a8'), road: C('#4a4e58'), line: C('#ffe678'), walk: C('#c4c4c8'), plaza: [C('#cec8be'), C('#bcb6ae')] },
    center: 'statue', trees: { n: 18, kinds: ['round'] }, coastRock: '#7d8597',
    far: { islands: '#7d8a99' },
    build(K, out) {
      const { mat, M, box, deco } = K;
      tower(K, out, { name: 'bean tower', x0: -56, x1: -40, z0: -24, z1: -12, n: 6, wall: M('#9ad1ff', { metal: 0.3, rough: 0.25 }), sign: 'BEAN TOWER', signBg: '#1d3557' });
      tower(K, out, { name: 'news', x0: 8, x1: 24, z0: -56, z1: -44, n: 4, wall: mat.wallB, sign: 'NEWS 10', signBg: '#e63946' });
      spiral(K, out, { name: 'radio tower', x: 48, z: 46, h: 26, r: 2.8, body: mat.metal, stripe: mat.red, room: true, beamColor: '#ff6b6b', beamGlow: '#ff2a2a', capM: mat.red, railM: mat.yellow, sign: 'RADIO', signBg: '#e63946' });
      mart(K, out, { name: 'mall', x: -48, z: 46, w: 18, wall: M('#ffd6e0'), sign: 'BEAN MALL', signBg: '#8338ec' });
      for (const [x, z, f, w] of [[16, 16, -1, mat.wallA], [-16, 16, -1, mat.wallC], [16, -16, 1, mat.wallD], [-16, -16, 1, mat.wallE]]) house(K, out, { x, z, face: f, wall: w, style: 'flat', roof: mat.concrete2, bushes: false });
      canopy(K, out, { name: 'parking', x: 48, z: -16, roof: mat.concrete, top: mat.concrete2, post: mat.concrete2, sign: 'PARKING', signBg: '#3a86ff' });
      gazebo(K, out, { name: 'park', x: 48, z: 16, roof: mat.roofC });
      // skyscrapers you cannot climb (but things fall off them in an earthquake)
      for (const [x, z, h, c] of [[-16, -48, 22, '#b8bcc4'], [48, -48, 18, '#cfe8ff'], [-48, 16, 14, '#f4e1c1']]) {
        box(x, LAND + h / 2, z, 12, h, 12, M(c));
        for (let y = LAND + 3; y < LAND + h - 1; y += 3) for (const s of [-1, 1]) { deco(new THREE.BoxGeometry(10, 1.4, 0.1), mat.glass, x, y, z + s * 6.02, 0, 0, 0, false); deco(new THREE.BoxGeometry(0.1, 1.4, 10), mat.glass, x + s * 6.02, y, z, 0, 0, 0, false); }
        out.edges.push({ x0: x - 6, x1: x + 6, z0: z - 6, z1: z + 6, y: LAND + h }); out.tall.push(V(x, LAND + h, z));
        block(K, x - 7, x + 7, z - 7, z + 7);
      }
      for (const [x, z, r] of [[8.5, 7.2, 0], [-8.5, -7.2, Math.PI], [40.5, 7.2, 0], [-40.5, -7.2, Math.PI]]) busStop(K, out, x, z, r);
      for (const [x, z] of [[26, 26], [-26, -30], [36, -36], [-24, 28], [60, 0]]) fire(K, out, x, z, { pot: true });
      cars(K, [[-24, 1.8, 0], [24, -2, 0], [52, 1.8, 0], [-58, -2, 0], [-2, 22, Math.PI / 2], [2, -40, Math.PI / 2], [30, 34, 0], [-30, -34, 0], [34, -24, Math.PI / 2], [-34, 52, Math.PI / 2]], ['#e63946', '#3a86ff', '#ffd23f', '#2a9d8f', '#f8f9fa', '#8338ec', '#ff8c42']);
      lamps(K, [[-14, 5.2], [14, 5.2], [-14, -5.2], [14, -5.2], [-46, 5.2], [46, 5.2], [5.2, 26], [-5.2, -26], [37, 26], [-37, -26]]);
    }
  },
  // ---------- HAPPY FARM ----------
  {
    id: 'farm', name: 'Happy Farm', tip: 'Fields, a big red barn, a silo and a windmill.',
    r: 74, hills: [{ x: 46, z: -42, r: 26, h: 10 }],
    ground: { roads: 'cross', roadW: 3, base: C('#7cc45a'), hill: C('#5fa848'), sand: C('#eed9a4'), road: C('#a8825a'), walk: C('#9bc477'), plaza: [C('#d8c39a'), C('#c9b088')], dots: ['#ffffff', '#ffd23f'],
      fields: [[-66, -48, -30, -6, 1], [12, 34, -66, -56, 0], [-30, -8, 46, 64, 0]], fieldA: C('#8b6a42'), fieldB: C('#c9b04a') },
    center: 'well', trees: { n: 30, kinds: ['round', 'round', 'pine'] }, coastRock: '#8a8f98',
    far: { islands: '#6fa84e' },
    build(K, out) {
      const { mat, M } = K;
      const red = M('#b23a48'), white = mat.white;
      mart(K, out, { name: 'barn', x: 31, z: 36, wall: red, roof: M('#7d2a35'), trim: white, rampM: M('#a0673a'), sign: 'BARN', signBg: '#ffffff', signFg: '#b23a48', signBorder: '#b23a48', shelves: ['#e9c46a', '#e9c46a', '#d4a373'] });
      spiral(K, out, { name: 'silo', x: -50, z: 46, h: 22, body: M('#c9d1d9', { metal: 0.5, rough: 0.35 }), room: false, cap: 'dome', capM: mat.metal, railM: mat.red, sign: 'SILO', signBg: '#b23a48' });
      for (const [x, z, f, w, rf] of [[16, 13, -1, mat.white, mat.roofA], [-16, 13, -1, M('#fff1b8'), mat.roofC], [16, -13, 1, M('#ffd6e0'), mat.roofB]]) house(K, out, { x, z, face: f, wall: w, roof: rf });
      windmill(K, out, -40, -36);
      canopy(K, out, { name: 'tractor shed', x: -30, z: 24, roof: M('#2a9d8f'), top: M('#2a9d8f'), post: M('#a0673a'), sign: 'TRACTORS', signBg: '#2a9d8f' });
      gazebo(K, out, { name: 'farm stand', x: -12, z: -36, roof: M('#e9c46a'), sign: 'FRESH EGGS', signBg: '#e76f51' });
      for (const [x, z] of [[-6, 26], [26, -22], [-52, 4], [58, 14], [8, 58]]) stack(K, x, z, M('#e9c46a', { rough: 0.95 }), 'hay');
      for (const [x, z] of [[6, -26], [-46, 18], [46, 56], [-36, 58], [60, -8]]) fire(K, out, x, z);
      cars(K, [[-46, 1.8, 0], [24, -2, 0]], ['#2a9d8f', '#e63946']);
      // fences round the fields
      for (const f of [[-66, -48, -30, -6], [12, 34, -66, -56], [-30, -8, 46, 64]]) for (let x = f[0]; x <= f[1]; x += 2.5) for (const z of [f[2], f[3]]) K.deco(new THREE.BoxGeometry(2.6, 0.12, 0.12), mat.wood, x, LAND + 0.8, z, 0, 0, 0, false);
    }
  },
  // ---------- SPOOKY HOLLOW ----------
  {
    id: 'spooky', name: 'Spooky Hollow', tip: 'A haunted town with a graveyard and glowing pumpkins.',
    r: 74, hills: [{ x: -44, z: -42, r: 24, h: 10 }],
    ground: { roads: 'cross', base: C('#4f6045'), hill: C('#3e4a39'), sand: C('#a8977a'), road: C('#5a4a42'), walk: C('#6e6258'), plaza: [C('#777078'), C('#5f5862')], dots: ['#b892ff', '#ff9e00'], patches: C('#475a3d') },
    center: 'statue', centerOpt: { metal: null }, trees: { n: 42, kinds: ['dead', 'dead', 'pine'] }, coastRock: '#4a4a52',
    far: { islands: '#3f4a3a', volcano: '#3a2f33' },
    build(K, out) {
      const { mat, M } = K;
      const dark = M('#5c5470'), purple = M('#3b2f4a'), stone = M('#6b6870', { flat: true });
      tower(K, out, { name: 'haunted hotel', x0: 18, x1: 34, z0: -36, z1: -24, n: 4, wall: M('#6d597a'), trim: M('#4a4458'), trim2: M('#3b3548'), glass: M('#ffb000', { emissive: '#ff8c00', ei: 0.6 }), sign: 'HAUNTED HOTEL', signBg: '#2b2d42', signFg: '#ff9e00', signBorder: '#8338ec' });
      spiral(K, out, { name: 'bell tower', x: -50, z: 46, h: 24, body: stone, room: false, capM: purple, capH: 6, rampM: M('#5a5660'), floorM: M('#4a4650'), railM: mat.black, sign: 'BELL TOWER', signBg: '#2b2d42', signFg: '#ff9e00', flag: '#8338ec' });
      for (const [x, z, f] of [[16, 13, -1], [31, 13, -1], [-16, 13, -1], [-16, -13, 1]]) house(K, out, { x, z, face: f, wall: dark, roof: purple, glass: M('#ffb000', { emissive: '#ff8c00', ei: 0.7 }), bush: M('#2e3b2a', { flat: true }) });
      mart(K, out, { name: 'monster mart', x: -30, z: 36, wall: M('#4a4458'), sign: 'MONSTER MART', signBg: '#8338ec', signBorder: '#7bd389' });
      graveyard(K, 40, 40);
      gazebo(K, out, { name: 'crypt', x: 46, z: -11, roof: purple, post: stone, floor: stone, sign: 'CRYPT', signBg: '#2b2d42' });
      pumpkins(K, [[8, 22, 1], [-8, -22, 1.3], [24, -6, 1], [-26, 6, 0.9], [36, 24, 1.4], [-40, 22, 1], [10, -40, 1.1], [56, 30, 1], [-58, -10, 1.2], [-6, 40, 1]]);
      for (const [x, z] of [[6, -26], [-46, 6], [56, 12], [-10, 58], [20, 56]]) fire(K, out, x, z, { pot: true });
      lamps(K, [[-14, 5.2], [14, 5.2], [-14, -5.2], [14, -5.2], [5.2, 30], [-5.2, -30]], { light: M('#c77dff', { emissive: '#9d4edd', ei: 1 }) });
    }
  },
  // ---------- JUNGLE RUINS ----------
  {
    id: 'jungle', name: 'Jungle Ruins', tip: 'Thick jungle around an old temple pyramid.',
    r: 74, hills: [{ x: 46, z: -42, r: 24, h: 10 }],
    ground: { roads: 'cross', roadW: 2.4, base: C('#3f8a3a'), hill: C('#2f6f2f'), sand: C('#e8d39a'), road: C('#8a6a45'), walk: C('#5d8f45'), plaza: [C('#a39e86'), C('#8a8570')], dots: ['#ff4d6d', '#ffd23f', '#ff8c42'], patches: C('#357d33') },
    center: 'idol', trees: { n: 78, kinds: ['jungle', 'jungle', 'jungle', 'palm', 'round'] }, coastRock: '#6f7a63',
    far: { islands: '#2f7a3a' },
    build(K, out) {
      const { mat, M } = K;
      const stone = M('#9a957d', { flat: true }), thatch = M('#c9a26b', { rough: 0.95, flat: true });
      pyramid(K, out, { x: -36, z: -36 });
      spiral(K, out, { name: 'watch tower', x: 50, z: 40, h: 22, body: M('#7a5230', { flat: true }), room: false, capM: thatch, capH: 3, rampM: M('#8b5a2b'), floorM: M('#7a5230'), railM: mat.woodDark, sign: 'LOOKOUT', signBg: '#6a994e' });
      for (const [x, z, f] of [[16, 13, -1], [30, 13, -1], [-16, 13, -1], [16, -13, 1]]) house(K, out, { x, z, face: f, wall: stone, roof: thatch, style: f > 0 ? 'flat' : 'gable', chimney: stone, bush: M('#2f6f2f', { flat: true }) });
      gazebo(K, out, { name: 'shrine', x: -34, z: 22, roof: thatch, post: stone, floor: stone, sign: 'SHRINE', signBg: '#6a994e' });
      canopy(K, out, { name: 'camp', x: -14, z: 44, roof: M('#2a9d8f'), top: M('#2a9d8f'), post: mat.wood, sign: 'CAMP', signBg: '#2a9d8f', tables: true });
      for (const [x, z] of [[6, -28], [-48, 6], [40, 56], [-14, 60], [60, -6]]) fire(K, out, x, z);
      for (const [x, z] of [[-6, 24], [24, -26], [-56, -8]]) stack(K, x, z, M('#a0673a'), 'box');
    }
  },
  // ---------- CANDY ISLAND ----------
  {
    id: 'candy', name: 'Candy Island', tip: 'Gingerbread houses, lollipop trees and bouncy gumdrops.',
    r: 74, hills: [{ x: 44, z: -42, r: 24, h: 10 }],
    ground: { roads: 'cross', base: C('#ffb3d1'), hill: C('#fff3e0'), cap: C('#ffffff'), sand: C('#ffe0b8'), road: C('#ffffff'), stripes: C('#ff8fab'), walk: C('#b8f2e6'), plaza: [C('#ffd1e8'), C('#c8f7ff')], dots: ['#ffffff', '#ffd23f', '#3a86ff', '#8338ec'], patches: C('#ffc2dc') },
    center: 'cake', trees: { n: 44, kinds: ['lollipop', 'lollipop', 'cane'] }, coastRock: '#d4a373',
    far: { islands: '#ff9ecb', volcano: '#7a4a3a' },
    build(K, out) {
      const { mat, M } = K;
      const ginger = M('#b5651d'), icing = M('#ffffff', { rough: 0.5 });
      spiral(K, out, { name: 'cake tower', x: -50, z: 46, h: 24, body: M('#ffd1e8'), stripe: M('#7a4a3a'), cap: 'cherry', rampM: M('#fff3e0'), floorM: M('#ffe0b8'), railM: M('#ff4d6d'), sign: 'CAKE TOWER', signBg: '#ff4d6d' });
      tower(K, out, { name: 'candy hotel', x0: -36, x1: -20, z0: -36, z1: -24, n: 4, wall: M('#b8f2e6'), trim: M('#ffd1e8'), trim2: M('#ff8fab'), sign: 'CANDY HOTEL', signBg: '#ff4d6d' });
      for (const [x, z, f] of [[16, 13, -1], [31, 13, -1], [16, -13, 1], [-16, 13, -1]]) house(K, out, { x, z, face: f, wall: ginger, roof: icing, ceil: icing, chimney: M('#ff8fab'), crate: M('#ff6fd8'), bush: M('#7bd389') });
      mart(K, out, { name: 'sweet shop', x: 31, z: 38, wall: M('#ff8fab'), roof: M('#fff3e0'), sign: 'SWEET SHOP', signBg: '#8338ec', shelves: ['#ff4d6d', '#ffd23f', '#3a86ff'] });
      gazebo(K, out, { name: 'cupcake', x: -36, z: -9, roof: M('#ff6fd8'), post: icing, floor: M('#ffe0b8'), round: true, sign: 'CUPCAKE', signBg: '#ff6fd8' });
      canopy(K, out, { name: 'popcorn', x: -28, z: 26, roof: M('#e63946'), top: icing, sign: 'POPCORN', signBg: '#e63946', tables: true });
      gumdrops(K, [[-8, -24, '#ff4d6d'], [24, -24, '#3a86ff'], [-52, 4, '#ffd23f'], [8, 54, '#8338ec'], [52, 14, '#2ec4b6'], [-20, 54, '#ff8c42']]);
      for (const [x, z] of [[6, -40], [-46, 18], [46, 56], [-12, 62], [62, -8]]) fire(K, out, x, z);
      lamps(K, [[-14, 5.2], [14, 5.2], [-14, -5.2], [14, -5.2], [5.2, 30], [-5.2, -30]], { post: M('#ff4d6d'), light: M('#fff3b0', { emissive: '#ffd6ff', ei: 0.9 }) });
    }
  },
  // ---------- PIRATE COVE ----------
  {
    id: 'pirate', name: 'Pirate Cove', tip: 'A pirate ship on the beach, a fort and a tavern.',
    r: 70, hills: [{ x: -44, z: -42, r: 24, h: 10 }],
    ground: { roads: 'cross', roadW: 2.6, base: C('#9ccf6a'), hill: C('#c9b27a'), sand: C('#f2d49b'), road: C('#a0673a'), walk: C('#d9c08a'), plaza: [C('#c9b08a'), C('#b39a76')], patches: C('#e8d49f') },
    center: 'anchor', trees: { n: 36, kinds: ['palm', 'palm', 'round'] }, coastRock: '#8a8170',
    far: { islands: '#6fa84e' },
    build(K, out) {
      const { mat, M } = K;
      const wood = M('#8b5a2b', { flat: true }), stone = M('#8a8f98', { flat: true });
      ship(K, out, { x: 46, z: -24 });
      spiral(K, out, { name: 'crows nest', x: -46, z: 40, h: 22, body: wood, room: false, capM: mat.dark, rampM: M('#a0673a'), floorM: wood, railM: mat.woodDark, sign: "CROW'S NEST", signBg: '#1b1b1f', flag: '#1b1b1f' });
      tower(K, out, { name: 'fort', x0: 14, x1: 30, z0: 24, z1: 36, n: 4, wall: stone, trim: M('#9aa1ab', { flat: true }), trim2: M('#6b717c', { flat: true }), sign: 'THE FORT', signBg: '#1b1b1f', signBorder: '#e63946' });
      mart(K, out, { name: 'tavern', x: -26, z: 26, w: 18, wall: wood, roof: M('#6f4a2a'), trim: M('#5a3a22'), rampM: M('#a0673a'), sign: 'TAVERN', signBg: '#5a3a22', signBorder: '#e9c46a' });
      for (const [x, z, f] of [[16, -13, 1], [-16, -13, 1], [-30, -14, 1], [16, 13, -1]]) house(K, out, { x, z, face: f, wall: M('#a0673a'), roof: M('#5a3a22'), ceil: wood });
      for (const [x, z] of [[-6, 24], [26, -40], [-56, 6], [56, 14]]) stack(K, x, z, M('#7a4f2a'), 'barrel');
      // treasure on the hill
      K.box(-44, K.heightAt(-44, -42) + 0.5, -42, 1.6, 1, 1, M('#6b4423'), { roof: false });
      K.deco(new THREE.BoxGeometry(1.4, 0.3, 0.8), M('#ffd23f', { emissive: '#ffb703', ei: 0.7, metal: 0.6 }), -44, K.heightAt(-44, -42) + 1.1, -42);
      for (const [x, z] of [[6, -28], [-50, 16], [40, 52], [-10, 54], [58, 2]]) fire(K, out, x, z);
      lamps(K, [[-14, 3.8], [14, 3.8], [-14, -3.8], [3.8, 30], [-3.8, -30]], { post: mat.woodDark });
    }
  }
];

export const ARENAS = Object.fromEntries(DEFS.map(d => [d.id, arena(d)]));
export const ARENA_LIST = DEFS.map(d => ({ id: d.id, name: d.name, tip: d.tip }));
