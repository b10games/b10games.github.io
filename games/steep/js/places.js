// The things built on Steep Peak: the village at the bottom (chalets, a church, the hotel, street lamps),
// the start area at the top (the STEEP start gate, the summit restaurant, flags, the summit cross),
// the mid-station hut, piste poles along every run in its colour, and in the park the rails, boxes,
// banners and the lines that show you where the lips are.
// Everything here is merged into a few big meshes (few draw calls).
import { THREE, canvasTex, clamp, smooth, rng } from './engine.js';
import { terrain, PEAKS, RUNS, PARK, PARK_KICKERS, PARK_RAILS, PIPE, PIPE_W, VILLAGE, START, MID, runsAt } from './terrain.js';

export const RAILS = [];
// the very top of the mountain (for the summit cross)
export const SUMMIT = (() => {
  const p = PEAKS[0]; let best = -1e9, bx = p.x, bz = p.z;
  for (let r = 0; r < 420; r += 12) for (let a = 0; a < (r ? 24 : 1); a++) { const x = p.x + Math.cos(a / 24 * 6.283) * r, z = p.z + Math.sin(a / 24 * 6.283) * r, h = terrain(x, z); if (h > best) { best = h; bx = x; bz = z; } }
  for (let k = 0; k < 3; k++) for (let i = -6; i <= 6; i++) for (let j = -6; j <= 6; j++) { const x = bx + i * 2 / (k + 1), z = bz + j * 2 / (k + 1), h = terrain(x, z); if (h > best) { best = h; bx = x; bz = z; } }
  return { x: bx, z: bz, y: best };
})();

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
let M = null;
function mats(world) {
  if (M) return M;
  const std = (c, r = 0.85, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: r, ...o });
  const glow = (c, e, base, night) => { const m = std(c, 0.5, { emissive: e, emissiveIntensity: base }); m.userData = { base, night }; world.glowMats.push(m); return m; };
  M = {
    wood: std('#6e4326'), wood2: std('#8a5a35'), woodDark: std('#3f2716'), stone: std('#7d7f84', 0.95), plaster: std('#efe9dd', 0.9), plaster2: std('#e6dccb', 0.9),
    roof: std('#f4f8fd', 0.75), roofEdge: std('#3b2a1e'), metal: std('#5d6470', 0.5, { metalness: 0.6 }), red: std('#c0262d', 0.6), green: std('#2f5d3a', 0.8),
    copper: std('#4e8f80', 0.6, { metalness: 0.3 }), white: std('#ffffff', 0.6), orange: std('#ff7a1a', 0.7), blue: std('#2563eb', 0.6), black: std('#1d1f24', 0.7),
    win: glow('#ffd28a', '#ffb347', 0.15, 2.4), lamp: glow('#fff2c8', '#ffd890', 0.2, 3.2), clock: glow('#f6f1e4', '#fff1c4', 0.05, 0.9), sign: null
  };
  return M;
}
function box(g, m, w, h, d, x, y, z, ry = 0, rx = 0, rz = 0) { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); g.add(o); return o; }
function cyl(g, m, r0, r1, h, x, y, z, seg = 8) { const o = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), m); o.position.set(x, y, z); g.add(o); return o; }
// a pitched roof covered in snow (ridge along x), with dark eaves
function roof(g, w, d, rise, y, over = 0.9) {
  const W = w / 2 + over, D = d + over * 2, slope = Math.atan2(rise, W), len = Math.hypot(W, rise);
  for (const s of [-1, 1]) {
    const p = box(g, M.roof, len + 0.1, 0.35, D, s * W / 2, y + rise / 2, 0, 0, 0, s * slope * -1);
    const e = box(g, M.roofEdge, len + 0.1, 0.2, D + 0.05, s * W / 2, y + rise / 2 - 0.25, 0, 0, 0, s * slope * -1);
    p.position.y += 0.05; e.position.y -= 0.02;
  }
  // gable triangles
  const tri = new THREE.Shape(); tri.moveTo(-w / 2, 0); tri.lineTo(0, rise - 0.1); tri.lineTo(w / 2, 0);
  for (const s of [-1, 1]) { const o = new THREE.Mesh(new THREE.ShapeGeometry(tri), g.userData.wall || M.wood); o.position.set(0, y, s * d / 2); if (s < 0) o.rotation.y = Math.PI; g.add(o); }
}
// a window with shutters
function windowAt(g, x, y, z, ry, w = 1.1, h = 1.2, shutter = M.green) {
  const o = new THREE.Group(); o.position.set(x, y, z); o.rotation.y = ry; g.add(o);
  box(o, M.win, w, h, 0.05, 0, 0, 0);
  box(o, M.woodDark, w + 0.2, 0.12, 0.12, 0, -h / 2 - 0.05, 0.05);
  if (shutter) for (const s of [-1, 1]) box(o, shutter, w * 0.5, h, 0.06, s * (w * 0.75 + 0.05), 0, 0.04);
}

// a chalet: stone base (deep enough for a slope), wooden floors, balcony, snowy roof, chimney
export function chalet(world, parent, x, z, rot, o = {}) {
  mats(world);
  const w = o.w || 9, d = o.d || 8, floors = o.floors || 2, fh = 2.8, wall = o.wall || (Math.random() < 0.5 ? M.wood : M.wood2);
  // the ground under the corners: the house stands on its highest corner, the base goes down to the lowest
  const c = Math.cos(rot), s = Math.sin(rot), hs = [];
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) hs.push(terrain(x + (a * w / 2) * c + (b * d / 2) * s, z - (a * w / 2) * s + (b * d / 2) * c));
  const top = Math.max(...hs), low = Math.min(...hs), base = top - low + 1.1;
  const g = new THREE.Group(); g.position.set(x, top, z); g.rotation.y = rot; g.userData.wall = wall; parent.add(g);
  box(g, M.stone, w + 0.4, base, d + 0.4, 0, 0.4 - base / 2, 0);
  const lower = o.plaster ? M.plaster : wall;
  box(g, lower, w, fh, d, 0, 0.4 + fh / 2, 0);
  if (floors > 1) box(g, wall, w, fh * (floors - 1), d, 0, 0.4 + fh + fh * (floors - 1) / 2, 0);
  const H = 0.4 + fh * floors;
  roof(g, w, d, w * 0.36, H);
  box(g, M.stone, 0.8, 2.4, 0.8, w * 0.22, H + w * 0.3, -d * 0.15);
  // windows on all four sides, a door at the front
  for (let f = 0; f < floors; f++) {
    const y = 0.4 + fh * f + fh * 0.55;
    for (const k of [-1, 1]) {
      windowAt(g, k * w * 0.27, y, d / 2 + 0.03, 0);
      windowAt(g, k * w * 0.27, y, -d / 2 - 0.03, Math.PI);
    }
    windowAt(g, w / 2 + 0.03, y, 0, Math.PI / 2); windowAt(g, -w / 2 - 0.03, y, 0, -Math.PI / 2);
  }
  box(g, M.woodDark, 1.3, 2.2, 0.08, 0, 0.4 + 1.1, d / 2 + 0.05);
  // a balcony on the upper floor
  if (floors > 1) {
    const y = 0.4 + fh;
    box(g, M.woodDark, w + 0.6, 0.18, 1.4, 0, y, d / 2 + 0.7);
    box(g, wall, w + 0.6, 0.9, 0.1, 0, y + 0.5, d / 2 + 1.35);
    box(g, M.roof, w + 0.6, 0.12, 0.25, 0, y + 0.98, d / 2 + 1.35);
  }
  world.addSolid(x, z, Math.max(w, d) * 0.62, 'cabin');
  return g;
}
function church(world, parent, x, z, rot) {
  mats(world);
  const y = terrain(x, z), g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rot; g.userData.wall = M.plaster; parent.add(g);
  box(g, M.stone, 10.4, 3, 18.4, 0, -1.1, 0);
  box(g, M.plaster, 10, 7, 18, 0, 3.5, 0);
  roof(g, 10, 18, 4.6, 7, 0.7);
  // the tower with a clock and an onion-shaped green spire
  box(g, M.plaster, 4.2, 18, 4.2, 0, 9, 10.6);
  box(g, M.stone, 4.6, 0.6, 4.6, 0, 18, 10.6);
  cyl(g, M.copper, 1.9, 2.6, 2.2, 0, 19.3, 10.6, 8);
  const onion = new THREE.Mesh(new THREE.SphereGeometry(1.7, 10, 8), M.copper); onion.position.set(0, 21.3, 10.6); onion.scale.set(1, 1.15, 1); g.add(onion);
  cyl(g, M.copper, 0.15, 0.9, 3.6, 0, 24, 10.6, 8);
  box(g, M.metal, 0.12, 2.2, 0.12, 0, 26.6, 10.6); box(g, M.metal, 1.1, 0.12, 0.12, 0, 26.9, 10.6);
  for (const [a, px, pz] of [[0, 0, 12.72], [Math.PI / 2, 2.12, 10.6], [Math.PI, 0, 8.48], [-Math.PI / 2, -2.12, 10.6]]) {
    const c = new THREE.Mesh(new THREE.CircleGeometry(1.1, 20), M.clock); c.position.set(px, 15, pz); c.rotation.y = a; g.add(c);
  }
  for (const k of [-1, 1]) for (const zz of [-5, 0, 5]) { const o = box(g, M.win, 0.06, 2.6, 1.1, k * 5.03, 4.2, zz); o.position.x += k * 0.01; }
  box(g, M.woodDark, 1.6, 2.6, 0.1, 0, 1.3, 12.75);
  world.addSolid(x, z, 9.5, 'cabin');
  const tz = x + Math.sin(rot) * 10.6, tx = z + Math.cos(rot) * 10.6;
  world.addSolid(tz, tx, 3, 'cabin');
  return g;
}
function signTexture(text, bg, fg) {
  return canvasTex(512, 128, (c, W, H) => {
    c.fillStyle = bg; c.fillRect(0, 0, W, H);
    c.strokeStyle = fg; c.lineWidth = 6; c.strokeRect(8, 8, W - 16, H - 16);
    c.fillStyle = fg; c.font = 'italic 900 70px "Barlow Condensed", Arial Narrow, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, W / 2, H / 2 + 4);
  });
}
function hotel(world, parent, x, z, rot) {
  const g = chalet(world, parent, x, z, rot, { w: 26, d: 13, floors: 4, plaster: true, wall: M && M.wood2 });
  const t = signTexture('HOTEL STEEP', '#3b2416', '#ffd27a');
  const m = new THREE.MeshStandardMaterial({ map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.25 }); m.userData = { base: 0.25, night: 0.9 }; world.glowMats.push(m);
  const sg = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.2), m); sg.position.set(0, 0.4 + 2.8 * 4 + 0.2, 13 / 2 + 1.0); g.add(sg);
  return g;
}
function lamp(world, parent, x, z) {
  const y = terrain(x, z), g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
  cyl(g, M.black, 0.07, 0.1, 4, 0, 2, 0, 6); box(g, M.black, 0.5, 0.1, 0.5, 0, 4.05, 0); box(g, M.lamp, 0.36, 0.45, 0.36, 0, 3.75, 0);
}
function cross(world, parent, s) {
  const g = new THREE.Group(); g.position.set(s.x, s.y - 0.3, s.z); g.rotation.y = Math.atan2(s.x, s.z); parent.add(g);
  box(g, M.woodDark, 0.22, 3.3, 0.2, 0, 1.65, 0); box(g, M.woodDark, 1.5, 0.2, 0.2, 0, 2.45, 0);
  box(g, M.metal, 0.4, 0.34, 0.12, 0, 1.9, 0.14);
  // a cairn of stones at the foot
  for (let i = 0; i < 6; i++) { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2 + (i % 3) * 0.07, 0), M.stone); r.position.set(Math.cos(i * 2.1) * 0.4, 0.08 + (i % 2) * 0.12, Math.sin(i * 2.1) * 0.4); g.add(r); }
  world.addSolid(s.x, s.z, 0.6, 'rock');
  world.block(s.x, s.z, 12);
}
function hut(world, parent, h) {
  const y = terrain(h.x, h.z), g = chalet(world, parent, h.x, h.z, Math.atan2(-h.x, -h.z) + 0.3, { w: 10, d: 8, floors: 2, wall: M.wood });
  // a flag pole next to the hut
  const f = new THREE.Group(); f.position.set(h.x + 7, terrain(h.x + 7, h.z + 3), h.z + 3); parent.add(f);
  cyl(f, M.white, 0.06, 0.08, 8, 0, 4, 0, 6); box(f, M.red, 1.6, 1, 0.04, 0.8, 7.3, 0);
  world.block(h.x, h.z, 18);
  return y;
}


// a point on the park: u along it, v across it (+v to the right as seen on the map)
function parkAt(u, v) {
  const P = PARK.P, f = clamp(u / 4, 0, P.length - 1.001), i = Math.floor(f), k = f - i;
  const ax = P[i][0], az = P[i][1], bx = P[i + 1][0], bz = P[i + 1][1], dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz);
  const x = ax + dx * k - dz / l * v, z = az + dz * k + dx / l * v;
  return { x, z, y: terrain(x, z), dx: dx / l, dz: dz / l };
}
function banner(world, text, bg, fg) {
  const t = signTexture(text, bg, fg);
  const m = new THREE.MeshStandardMaterial({ map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.3 }); m.userData = { base: 0.3, night: 0.8 }; world.glowMats.push(m);
  return m;
}
function arch(world, g, p, yaw, half, text, bg, fg, hgt = 6, post = 0.6) {
  const a = new THREE.Group(); a.position.set(p.x, p.y, p.z); a.rotation.y = yaw; g.add(a);
  for (const k of [-1, 1]) { box(a, M.black, post, hgt, post, k * half, hgt / 2 - 0.5, 0); world.addSolid(p.x + Math.cos(yaw) * k * half, p.z - Math.sin(yaw) * k * half, post, 'rock'); }
  const sm = banner(world, text, bg, fg);
  const bn = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + 0.6, half * 0.45, 0.35), [M.black, M.black, M.black, M.black, sm, sm]); bn.position.y = hgt; a.add(bn);
  return a;
}
function parkThings(world, g) {
  // rails and boxes
  for (const r of PARK_RAILS) {
    const hgt = r.kind === 'box' ? 0.55 : 0.8, a0 = parkAt(r.u, r.v), b0 = parkAt(r.u + r.L, r.v);
    const pts = r.kink ? [a0, parkAt(r.u + r.L * 0.45, r.v), b0] : [a0, b0];
    const V = pts.map((p, i) => V3(p.x, p.y + hgt + (r.kink && i === 1 ? 0.7 : 0), p.z));
    if (r.kink) V[0].y += 0.25;
    for (let i = 0; i < V.length - 1; i++) {
      const a = V[i], b = V[i + 1];
      RAILS.push({ a, b, kind: r.kind, w: r.kind === 'box' ? 0.32 : 0.12, h: hgt });
      const len = a.distanceTo(b), mid = a.clone().add(b).multiplyScalar(0.5), dir = b.clone().sub(a).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 0, 1), dir);
      let top;
      if (r.kind === 'box') top = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.1, len), M.metal);
      else { top = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, len, 10), M.metal); top.geometry.rotateX(Math.PI / 2); }
      top.position.copy(mid); top.quaternion.copy(q); g.add(top);
      if (r.kind === 'box') { const side = new THREE.Mesh(new THREE.BoxGeometry(0.6, hgt, len), M.orange); side.position.copy(mid); side.position.y -= hgt / 2 + 0.03; side.quaternion.copy(q); g.add(side); }
      else { const n = Math.max(1, Math.floor(len / 3)); for (let k = 0; k <= n; k++) { const p = a.clone().lerp(b, k / n), gy = terrain(p.x, p.z), h = p.y - gy + 0.2; cyl(g, M.black, 0.05, 0.05, h, p.x, gy + h / 2 - 0.2, p.z, 6); } }
    }
  }
  // the lips and the knuckles: blue lines across, and a sign with the size of the jump
  for (const k of PARK_KICKERS) {
    for (const [u, w] of [[k.u - 0.15, k.wide], [k.u + k.deck, k.wide]]) {
      const p = parkAt(u, 0), m = new THREE.Mesh(new THREE.PlaneGeometry(w * 2, 0.4), M.blue);
      m.position.set(p.x, p.y + 0.06, p.z); m.rotation.set(-Math.PI / 2, Math.atan2(p.dx, p.dz), 0, 'YXZ'); g.add(m);
    }
    // size flags beside the run-in
    for (const v of [-1, 1]) {
      const p = parkAt(k.u - k.len - 6, v * (k.wide + 4));
      cyl(g, M.white, 0.05, 0.06, 3.2, p.x, p.y + 1.6, p.z, 6);
      const fm = banner(world, k.name, '#ff7a1a', '#101826'), f = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), fm);
      f.position.set(p.x, p.y + 2.8, p.z); f.rotation.y = Math.atan2(-p.dx, -p.dz); g.add(f);
    }
  }
  // the park's start arch and orange fences along both sides
  const s0 = parkAt(2, 0), yaw = Math.atan2(s0.dx, s0.dz);
  arch(world, g, s0, yaw, PARK.w - 4, 'STEEP PARK', '#101826', '#ff8a2a', 7);
  for (let u = 0; u < PARK.len; u += 12) for (const v of [-PARK.w - 6, PARK.w + 6]) { const p = parkAt(u, v); box(g, M.orange, 0.12, 1.3, 0.12, p.x, p.y + 0.55, p.z); }
  // the halfpipe: blue lines along the lips, banners on the decks
  for (let u = PIPE.a + 4; u < PIPE.b - 4; u += 3) for (const v of [-1, 1]) {
    const p = parkAt(u, v * (PIPE_W - 0.15)), m = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 3.1), M.blue);
    m.position.set(p.x, p.y + 0.05, p.z); m.rotation.set(-Math.PI / 2, Math.atan2(p.dx, p.dz), 0, 'YXZ'); g.add(m);
  }
  const pb = banner(world, 'STEEP SUPERPIPE', '#ff7a1a', '#ffffff');
  for (const u of [PIPE.a + 50, PIPE.a + 130]) for (const v of [-1, 1]) {
    // on the outside of the deck (not in your way)
    const p = parkAt(u, v * (PIPE_W + PIPE.deck + 3.2)), b = new THREE.Mesh(new THREE.BoxGeometry(12, 1.2, 0.15), [M.black, M.black, M.black, M.black, pb, pb]);
    b.position.set(p.x, p.y + 0.9, p.z); b.rotation.y = Math.atan2(p.dx, p.dz) + Math.PI / 2; g.add(b);
  }
  const pe = parkAt(PIPE.a - 25, 0);
  arch(world, g, pe, yaw, PIPE_W + 2, 'HALFPIPE', '#101826', '#5ec8ff', 7.5);
}

// ---------- piste poles: every 45 m on both sides of each run, in its colour ----------
function pistePoles(world, g) {
  for (const run of RUNS) {
    if (run.park) continue;
    const m = new THREE.MeshStandardMaterial({ color: run.color === '#111827' ? '#20242c' : run.color, roughness: 0.6 });
    for (let u = 20; u < run.len - 10; u += 45) {
      const f = Math.floor(u / 4), [ax, az] = run.P[f], [bx, bz] = run.P[f + 1], dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz);
      for (const s of [-1, 1]) {
        const x = ax - dz / l * s * (run.w + 3), z = az + dx / l * s * (run.w + 3);
        // not inside another run
        if (runsAt(x, z).some(h => h.run !== run && Math.abs(h.v) < h.run.w + 2 && h.u > 0 && h.u < h.run.len)) continue;
        const y = terrain(x, z);
        cyl(g, m, 0.045, 0.05, 1.6, x, y + 0.75, z, 6);
        cyl(g, M.orange, 0.05, 0.05, 0.28, x, y + 1.42, z, 6);
      }
    }
  }
}

// ---------- the village ----------
function village(world, g) {
  const v = VILLAGE, r = rng(321), taken = [], vg = new THREE.Group();
  const free = (x, z, rad) => {
    for (const t of taken) if (Math.hypot(x - t[0], z - t[1]) < rad + t[2]) return false;
    for (const b of world.blocks || []) if (Math.hypot(x - b.x, z - b.z) < b.r + rad) return false;
    for (const c of world.corridors) if (x > c.x0 - 20 && x < c.x1 + 20 && z > c.z0 - 20 && z < c.z1 + 20 && corridorDist(x, z, c.pts) < c.w + rad) return false;
    if (runsAt(x, z).some(h => Math.abs(h.v) < h.run.w + rad + 6 && h.u > -20 && h.u < h.run.len + 40)) return false;
    // the ski-in lane from the runs to the square stays open
    if (z < v.z - 20 && Math.abs(x - v.x - 40) < 110 + rad) return false;
    return true;
  };
  const put = (x, z, rad) => { taken.push([x, z, rad]); };
  put(v.x, v.z, 38);
  { const a = 2.0, hx = v.x + Math.cos(a) * 75, hz = v.z + Math.sin(a) * 75; if (free(hx, hz, 18)) { hotel(world, vg, hx, hz, Math.atan2(v.x - hx, v.z - hz)); put(hx, hz, 18); } }
  { const a = 0.9, cx = v.x + Math.cos(a) * 85, cz = v.z + Math.sin(a) * 85; if (free(cx, cz, 14)) { church(world, vg, cx, cz, Math.atan2(v.x - cx, v.z - cz) + Math.PI); put(cx, cz, 14); } }
  let made = 0;
  for (let i = 0; i < 400 && made < 30; i++) {
    const a = r() * Math.PI * 2, d = v.r * (0.5 + Math.sqrt(r()) * 1.5), x = v.x + Math.cos(a) * d, z = v.z + Math.sin(a) * d;
    const w = 7 + r() * 5, dd = 6 + r() * 4, rad = Math.max(w, dd) * 0.75 + 3;
    if (!free(x, z, rad)) continue;
    const sl = Math.abs(terrain(x + 6, z) - terrain(x - 6, z)) + Math.abs(terrain(x, z + 6) - terrain(x, z - 6));
    if (sl > 9) continue;
    chalet(world, vg, x, z, Math.atan2(v.x - x, v.z - z) + (r() - 0.5) * 0.4, { w, d: dd, floors: r() < 0.55 ? 2 : 3, plaster: r() < 0.35 });
    put(x, z, rad); made++;
  }
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 + 0.2, rr = 34; lamp(world, vg, v.x + Math.cos(a) * rr, v.z + Math.sin(a) * rr); }
  g.add(vg);
}

// ---------- the start at the top ----------
function startArea(world, g) {
  const wall = RUNS[0], [ax, az] = wall.P[0], [bx, bz] = wall.P[3], yaw = Math.atan2(bx - ax, bz - az);
  // the start gate: you ride through it at the top of The Wall
  const yaw0 = Math.atan2(wall.P[1][0] - wall.P[0][0], wall.P[1][1] - wall.P[0][1]);
  const gx = START.x + 6 + Math.sin(yaw0) * 16, gz = START.z + 14 + Math.cos(yaw0) * 16;
  arch(world, g, { x: gx, z: gz, y: terrain(gx, gz) }, yaw0, 4.2, 'STEEP', '#0b1220', '#ffffff', 3.4, 0.3);
  // the summit restaurant (a big chalet) and flags in a row
  const hx = START.x - 38, hz = START.z - 14;
  chalet(world, g, hx, hz, yaw + 0.25, { w: 16, d: 10, floors: 2, plaster: true });
  world.block(hx, hz, 16);
  const cols = [M.red, M.blue, M.orange, M.white, M.green];
  for (let i = 0; i < 5; i++) {
    const fx = START.x - 10 + i * 6, fz = START.z - 24, fy = terrain(fx, fz);
    cyl(g, M.white, 0.06, 0.08, 8, fx, fy + 4, fz, 6); box(g, cols[i], 1.7, 1.05, 0.04, fx + 0.85, fy + 7.3, fz);
  }
  cross(world, g, SUMMIT);
}

function midStation(world, g) {
  const x = MID.x + 26, z = MID.z - 12;
  chalet(world, g, x, z, Math.atan2(-1, 0.3), { w: 12, d: 9, floors: 2, wall: M.wood });
  world.block(x, z, 14);
}

export function buildPlaces(world) {
  mats(world);
  const g = new THREE.Group();
  village(world, g);
  startArea(world, g);
  midStation(world, g);
  pistePoles(world, g);
  parkThings(world, g);
  world.mergeGroup(g);
}
function corridorDist(x, z, pts) {
  let d = 1e9;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz;
    const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / l, 0, 1);
    d = Math.min(d, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t));
  }
  return d;
}
