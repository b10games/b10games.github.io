// Bean Town: the island where the disasters happen, and the floating lobby island above the sea.
// Everything solid gets a collider. Static meshes are merged per material at the end so the iPad only
// has to draw a few hundred things instead of thousands.
// The bots get "spots": high places (floods, waves, lava), shelters (meteors, rain, lightning),
// warm places (blizzard), each with a path of waypoints from the street.
import { THREE, M, canvasTex, clamp, smooth, rng } from './engine.js';
import { Collider, Ground, World } from './physics.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const LAND = 2, SEA = 0;
export const LOBBY = new THREE.Vector3(0, 92, 104);     // centre of the lobby island's floor
export const HILL = { x: 46, z: -42, r: 26, h: 11 };

// ---------- the island's shape ----------
function noise2(x, z) { return Math.sin(x * 0.11 + Math.sin(z * 0.07) * 2) * Math.cos(z * 0.09 + Math.sin(x * 0.05) * 1.5); }
export function heightAt(x, z) {
  const r = Math.hypot(x, z);
  let h = LAND;
  // beach down into the sea
  if (r > 74) h = LAND - (LAND + 3.2) * smooth(74, 98, r) - Math.max(0, r - 98) * 0.12;
  // gentle bumps far from the town
  h += noise2(x, z) * 0.6 * smooth(52, 68, r) * (1 - smooth(76, 90, r));
  // the hill
  const dh = Math.hypot(x - HILL.x, z - HILL.z);
  if (dh < HILL.r) { const c = Math.cos(Math.PI * dh / (2 * HILL.r)); h += HILL.h * c * c; }
  return h;
}

export function buildWorld(quality) {
  const world = new World();
  world.ground = new Ground(heightAt);
  const root = new THREE.Group();          // merged later
  const live = new THREE.Group();          // things that move or glow (not merged)
  const lo = quality !== 'high', ultra = quality === 'ultra';
  const R = rng(1234);

  // ---------- helpers ----------
  const tmp = new THREE.Object3D();
  function place(o, x, y, z, ry = 0, rx = 0, rz = 0) { o.position.set(x, y, z); o.rotation.set(rx, ry, rz); return o; }
  function addMesh(geo, mat, x, y, z, ry = 0, rx = 0, rz = 0, cast = true) {
    const m = new THREE.Mesh(geo, mat); place(m, x, y, z, ry, rx, rz); m.castShadow = cast; m.receiveShadow = true; root.add(m); return m;
  }
  function collide(shape, obj, o) { obj.updateWorldMatrix(true, false); return world.add(new Collider(shape, obj, o)); }
  // a box: centre (x, y, z), size (w, h, d)
  function box(x, y, z, w, h, d, mat, o = {}) {
    const m = addMesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, o.ry || 0, o.rx || 0, o.rz || 0, o.cast !== false);
    if (o.col !== false) collide('box', m, { half: new THREE.Vector3(w / 2, h / 2, d / 2), surface: o.surface, bounce: o.bounce, roof: o.roof, cam: o.cam, tag: o.tag });
    return m;
  }
  function cyl(x, y, z, r, h, mat, o = {}) {
    const m = addMesh(new THREE.CylinderGeometry(o.r2 ?? r, r, h, o.seg || 16), mat, x, y, z, o.ry || 0, o.rx || 0, o.rz || 0, o.cast !== false);
    if (o.col !== false) collide('cyl', m, { r: Math.max(r, o.r2 ?? r), h: h / 2, surface: o.surface, bounce: o.bounce, roof: o.roof, cam: o.cam, tag: o.tag });
    return m;
  }
  function deco(geo, mat, x, y, z, ry = 0, rx = 0, rz = 0, cast = true) { return addMesh(geo, mat, x, y, z, ry, rx, rz, cast); }
  // an invisible wall (keeps you from falling off the lobby)
  function wall(x, y, z, w, h, d, ry = 0, tag) { const o = place(new THREE.Object3D(), x, y, z, ry); collide('box', o, { half: new THREE.Vector3(w / 2, h / 2, d / 2), roof: false, cam: false, tag }); }
  // a ramp from point a to point b (centre line of its top), width w
  function ramp(a, b, w, mat, o = {}) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, len = Math.hypot(dx, dz), slope = Math.atan2(dy, len), L = Math.hypot(len, dy), t = o.t || 0.3;
    const g = new THREE.BoxGeometry(L, t, w);
    const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true;
    m.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 - t / 2 * Math.cos(slope), (a.z + b.z) / 2);
    m.rotation.set(0, -Math.atan2(dz, dx), slope);
    root.add(m);
    collide('box', m, { half: new THREE.Vector3(L / 2, t / 2, w / 2), surface: o.surface, roof: o.roof, tag: o.tag });
    // little steps drawn on top so it reads as stairs
    if (o.steps) { const n = Math.floor(L / 0.45); for (let i = 0; i < n; i++) { const k = (i + 0.5) / n; deco(new THREE.BoxGeometry(0.08, 0.06, w * 0.96), o.steps, a.x + dx * k, a.y + dy * k + 0.02, a.z + dz * k, -Math.atan2(dz, dx), 0, 0, false); } }
    return m;
  }
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  function sign(text, w, h, bg, fg, x, y, z, ry, o = {}) {
    const tex = canvasTex(512, Math.round(512 * h / w), (g, W, H) => {
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      if (o.border) { g.strokeStyle = o.border; g.lineWidth = 14; g.strokeRect(7, 7, W - 14, H - 14); }
      g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `${o.weight || 900} ${Math.round(H * (o.size || 0.62))}px "Lilita One", "Arial Black", sans-serif`;
      g.fillText(text, W / 2, H / 2 + H * 0.04);
    });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), M('#ffffff', { map: tex, rough: 0.6, emissive: o.glow ? '#ffffff' : undefined, ei: o.glow ? 0.35 : 1 }));
    if (o.glow) m.material.emissiveMap = tex;
    place(m, x, y, z, ry); (o.live ? live : root).add(m);
    return m;
  }

  // ---------- materials ----------
  const mat = {
    wallA: M('#f4e1c1'), wallB: M('#cfe8ff'), wallC: M('#ffd6e0'), wallD: M('#d8f3dc'), wallE: M('#fff1b8'),
    roofA: M('#d1495b', { rough: 0.6 }), roofB: M('#3d5a80', { rough: 0.6 }), roofC: M('#6a994e', { rough: 0.6 }), roofD: M('#8338ec', { rough: 0.6 }),
    trim: M('#ffffff'), dark: M('#2b2d42'), door: M('#8d5524'), glass: M('#9ad1ff', { rough: 0.1, metal: 0.3, emissive: '#1d4e89', ei: 0.25 }),
    concrete: M('#b8bcc4'), concrete2: M('#9aa1ab'), stone: M('#8a8f98', { flat: true }), wood: M('#a0673a'), woodDark: M('#6f4a2a'),
    metal: M('#c9d1d9', { metal: 0.6, rough: 0.35 }), red: M('#e63946'), yellow: M('#ffd23f'), blue: M('#3a86ff'), green: M('#2a9d8f'), white: M('#f8f9fa'), black: M('#1b1b1f'),
    trunk: M('#8b5a2b'), leaf: M('#4caf50', { flat: true }), leaf2: M('#2e7d32', { flat: true }), leaf3: M('#8bc34a', { flat: true }), pine: M('#2f6f3e', { flat: true }),
    rock: M('#7d8597', { flat: true }), sand: M('#f2d49b'), lamp: M('#fff3b0', { emissive: '#ffe08a', ei: 0.8 }), tire: M('#2a2a2a', { rough: 0.9 }),
    lighthouseW: M('#f8f9fa'), lighthouseR: M('#d62828'), grassTop: M('#7bd389'), soil: M('#7a5230', { flat: true })
  };

  // ---------- ground ----------
  const TEX = ultra ? 512 : lo ? 1024 : 2048, SPAN = 230;
  const groundTex = canvasTex(TEX, TEX, (g, W, Hh) => paintGround(g, W, SPAN));
  groundTex.wrapS = groundTex.wrapT = THREE.ClampToEdgeWrapping;
  const seg = ultra ? 110 : lo ? 150 : 210;
  const gg = new THREE.PlaneGeometry(SPAN, SPAN, seg, seg); gg.rotateX(-Math.PI / 2);
  const gp = gg.attributes.position;
  for (let i = 0; i < gp.count; i++) gp.setY(i, heightAt(gp.getX(i), gp.getZ(i)));
  gg.computeVertexNormals();
  const groundMesh = new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.92 }));
  groundMesh.receiveShadow = true; live.add(groundMesh);
  // sea floor further out
  const sf = new THREE.Mesh(new THREE.CircleGeometry(900, 48), M('#c8b27a', { rough: 1 })); sf.rotation.x = -Math.PI / 2; sf.position.y = -6; live.add(sf);

  // ---------- roads, plaza, fountain ----------
  // the plaza fountain
  cyl(0, LAND + 0.35, 0, 4.2, 0.7, mat.stone, { seg: 24 });
  const fw = new THREE.Mesh(new THREE.CylinderGeometry(3.7, 3.7, 0.1, 24), M('#62c4ff', { rough: 0.1, emissive: '#1d6fb8', ei: 0.3 })); fw.position.set(0, LAND + 0.68, 0); live.add(fw);
  cyl(0, LAND + 1.5, 0, 0.5, 2.2, mat.stone, { seg: 12 });
  cyl(0, LAND + 2.6, 0, 1.4, 0.3, mat.stone, { seg: 16, r2: 1.6 });
  // street lamps along the roads
  for (const [x, z] of [[-14, 5.2], [14, 5.2], [-14, -5.2], [14, -5.2], [-40, 5.2], [40, 5.2], [-40, -5.2], [5.2, 30], [-5.2, 30], [5.2, -30], [-5.2, -30], [5.2, 56], [-5.2, -56], [62, -5.2], [-62, 5.2]]) {
    cyl(x, LAND + 2.4, z, 0.12, 4.8, mat.dark, { seg: 6, roof: false });
    deco(new THREE.SphereGeometry(0.35, 10, 8), mat.lamp, x, LAND + 4.9, z);
  }

  // ---------- the lighthouse (the tallest place on the island) ----------
  const LH = { x: -52, z: 50, r: 3.2, top: LAND + 24 };
  cyl(LH.x, LAND + 13, LH.z, LH.r, 26, mat.lighthouseW, { seg: 28, r2: 2.7 });
  for (let i = 0; i < 4; i++) deco(new THREE.CylinderGeometry(LH.r - 0.1 - i * 0.12 + 0.06, LH.r - 0.06 - i * 0.12 + 0.06, 2.4, 28), mat.lighthouseR, LH.x, LAND + 3 + i * 6, LH.z);
  // lamp room on top
  cyl(LH.x, LAND + 27.2, LH.z, 2.6, 2.4, mat.glass, { seg: 16 });
  const beam = new THREE.Mesh(new THREE.SphereGeometry(1.1, 16, 12), M('#fff6c2', { emissive: '#ffe066', ei: 2 })); beam.position.set(LH.x, LAND + 27.2, LH.z); live.add(beam);
  deco(new THREE.ConeGeometry(3.0, 2.2, 16), mat.lighthouseR, LH.x, LAND + 29.5, LH.z);
  // spiral ramp around it, 2.75 turns up to the balcony
  const turns = 2.75, rise = LH.top - LAND, rc = LH.r + 1.15, perTurn = 18, nSeg = Math.round(turns * perTurn);
  const lhPath = [];
  const a0 = Math.PI * 0.75;     // starts on the town side
  for (let i = 0; i < nSeg; i++) {
    const a = a0 + (i + 0.5) / perTurn * Math.PI * 2, y = LAND + rise * (i + 0.5) / nSeg;
    const segLen = (2 * Math.PI * rc) / perTurn * 1.08, slope = Math.atan2(rise / nSeg, (2 * Math.PI * rc) / perTurn);
    const o = new THREE.Mesh(new THREE.BoxGeometry(segLen, 0.3, 2.3), mat.concrete);
    o.position.set(LH.x + Math.sin(a) * rc, y - 0.15, LH.z + Math.cos(a) * rc);
    o.rotation.set(0, a, slope); o.castShadow = true; o.receiveShadow = true; root.add(o);
    collide('box', o, { half: new THREE.Vector3(segLen / 2, 0.15, 1.15) });
    if (i % 3 === 0) deco(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 5), mat.red, LH.x + Math.sin(a) * (rc + 1.05), y + 0.5, LH.z + Math.cos(a) * (rc + 1.05), 0, 0, 0, false);
    if (i % 3 === 1) lhPath.push(V(LH.x + Math.sin(a) * rc, y, LH.z + Math.cos(a) * rc));
  }
  // balcony ring with a gap where the ramp comes up
  const aEnd = a0 + turns * Math.PI * 2;
  for (let i = 0; i < 20; i++) {
    const a = aEnd + (i + 0.5) / 20 * Math.PI * 2;
    if ((i + 0.5) / 20 > 0.82) continue;            // the gap just before the ramp's end
    const o = new THREE.Mesh(new THREE.BoxGeometry(2 * Math.PI * rc / 20 * 1.1, 0.35, 2.3), mat.concrete2);
    o.position.set(LH.x + Math.sin(a) * rc, LH.top - 0.17, LH.z + Math.cos(a) * rc); o.rotation.y = a; o.castShadow = true; root.add(o);
    collide('box', o, { half: new THREE.Vector3(2 * Math.PI * rc / 20 * 0.55, 0.17, 1.15) });
    const rail = new THREE.Mesh(new THREE.BoxGeometry(2 * Math.PI * (rc + 1.1) / 20 * 1.05, 1.0, 0.12), mat.red);
    rail.position.set(LH.x + Math.sin(a) * (rc + 1.1), LH.top + 0.5, LH.z + Math.cos(a) * (rc + 1.1)); rail.rotation.y = a; root.add(rail);
    collide('box', rail, { half: new THREE.Vector3(2 * Math.PI * (rc + 1.1) / 20 * 0.5, 0.5, 0.06), roof: false });
  }
  const lhTop = V(LH.x + Math.sin(aEnd + 1.6) * rc, LH.top, LH.z + Math.cos(aEnd + 1.6) * rc);
  sign('LIGHTHOUSE', 4.4, 0.9, '#d62828', '#ffffff', LH.x + Math.sin(a0 - 0.5) * (LH.r - 0.25), LAND + 3.2, LH.z + Math.cos(a0 - 0.5) * (LH.r - 0.25), a0 - 0.5, { size: 0.6 });

  // ---------- the office tower: open ground floor, outside stairs to the roof ----------
  const OF = { x0: -36, x1: -20, z0: -36, z1: -24, top: LAND + 16 };
  const ofx = (OF.x0 + OF.x1) / 2, ofz = (OF.z0 + OF.z1) / 2, ofw = OF.x1 - OF.x0, ofd = OF.z1 - OF.z0;
  for (const px of [OF.x0 + 0.6, ofx, OF.x1 - 0.6]) for (const pz of [OF.z0 + 0.6, OF.z1 - 0.6]) box(px, LAND + 2.25, pz, 0.9, 4.5, 0.9, mat.concrete2);
  box(ofx, LAND + 4.75, ofz, ofw, 0.5, ofd, mat.concrete);                              // ceiling of the open floor
  box(ofx, LAND + 10.4, ofz, ofw - 0.4, 10.8, ofd - 0.4, mat.wallB);                       // the building
  box(ofx, OF.top - 0.1, ofz, ofw, 0.2, ofd, mat.concrete);                              // roof
  for (let f = 0; f < 3; f++) for (const side of [-1, 1]) for (let i = 0; i < 6; i++) deco(new THREE.BoxGeometry(1.6, 1.8, 0.1), mat.glass, OF.x0 + 1.6 + i * 2.6, LAND + 7 + f * 3.6, ofz + side * (ofd / 2 - 0.15), 0, 0, 0, false);
  for (let f = 0; f < 3; f++) for (const side of [-1, 1]) for (let i = 0; i < 4; i++) deco(new THREE.BoxGeometry(0.1, 1.8, 1.6), mat.glass, ofx + side * (ofw / 2 - 0.15), LAND + 7 + f * 3.6, OF.z0 + 1.8 + i * 2.8, 0, 0, 0, false);
  // parapet with an opening where the stairs arrive
  box(ofx, OF.top + 0.7, OF.z0 + 0.15, ofw, 1, 0.3, mat.concrete2, { roof: false });
  box(OF.x0 + 0.15, OF.top + 0.7, ofz, 0.3, 1, ofd, mat.concrete2, { roof: false });
  box(OF.x1 - 0.15, OF.top + 0.7, ofz - 1.5, 0.3, 1, ofd - 3, mat.concrete2, { roof: false });
  box(ofx - 1.5, OF.top + 0.7, OF.z1 - 0.15, ofw - 3, 1, 0.3, mat.concrete2, { roof: false });
  // rooftop stuff
  cyl(OF.x0 + 3.5, OF.top + 1.6, OF.z0 + 3.5, 1.4, 3, mat.metal, { seg: 14 });
  box(ofx + 2, OF.top + 0.7, ofz, 2.4, 1.2, 1.6, mat.concrete2);
  sign('BEAN CORP', 7, 1.4, '#3d5a80', '#ffffff', ofx, LAND + 15, OF.z1 + 0.06, 0, { border: '#ffd23f' });
  // zig-zag stairs on the south side
  const SZ = OF.z1 + 1.6, sw = 2.6, xW = OF.x0 + 1.2, xE = OF.x1 + 1.3;
  const ofPath = [V(xE + 2, LAND, SZ)];
  for (let k = 0; k < 4; k++) {
    const y0 = LAND + k * 4, y1 = y0 + 4, west = k % 2 === 0;
    const from = west ? V(xE - 1.3, y0, SZ) : V(xW + 1.3, y0, SZ), to = west ? V(xW + 1.3, y1, SZ) : V(xE - 1.3, y1, SZ);
    ramp(from, to, sw, mat.concrete, { steps: mat.concrete2, t: 0.35 });
    // landing at the top of this flight
    const lx = west ? xW : xE;
    box(lx, y1 - 0.2, SZ, 2.6, 0.4, sw, mat.concrete);
    if (k < 3) box(lx + (west ? -1.2 : 1.2), y1 + 0.5, SZ, 0.2, 1.0, sw, mat.metal, { roof: false });
    ofPath.push(V(to.x, y1, SZ), V(lx, y1, SZ));
    // rails on the outside
    deco(new THREE.BoxGeometry(Math.hypot(to.x - from.x, y1 - y0), 0.08, 0.08), mat.metal, (from.x + to.x) / 2, (y0 + y1) / 2 + 1.0, SZ + sw / 2, 0, 0, Math.atan2(y1 - y0, to.x - from.x), false);
  }
  // the top landing joins the roof (it is at the east end, beside the roof opening)
  box(OF.x1 - 1.5, OF.top - 0.2, OF.z1 + 0.5, 3, 0.4, 1.2, mat.concrete);
  ofPath.push(V(OF.x1 - 1.5, OF.top, OF.z1 - 1.2), V(ofx, OF.top, ofz));
  for (let k = 0; k < 4; k++) for (const x of [xW, xE]) box(x, LAND + k * 4, SZ + sw / 2 + 0.25, 0.3, 4, 0.3, mat.concrete2, { roof: false });

  // ---------- houses ----------
  const houses = [];
  function house(cx, cz, face, wallM, roofM) {
    // face: +1 = door on the +z side, -1 = door on the -z side
    const w = 8, d = 7, h = 3.4, t = 0.3, y0 = LAND;
    const dz = face * (d / 2 - t / 2);
    box(cx, y0 + h / 2, cz - dz, w, h, t, wallM);                                      // back wall
    box(cx - w / 2 + t / 2, y0 + h / 2, cz, t, h, d, wallM);                           // sides
    box(cx + w / 2 - t / 2, y0 + h / 2, cz, t, h, d, wallM);
    box(cx - 2.4, y0 + h / 2, cz + dz, 3.2, h, t, wallM); box(cx + 2.4, y0 + h / 2, cz + dz, 3.2, h, t, wallM);   // front with a door gap
    box(cx, y0 + h - 0.5, cz + dz, 1.6, 1.0, t, wallM);
    box(cx, y0 + h + 0.12, cz, w + 0.2, 0.24, d + 0.2, mat.trim);                       // ceiling
    // gable roof
    const rh = 2.2, half = d / 2 + 0.5, L = Math.hypot(half, rh), sl = Math.atan2(rh, half);
    for (const s of [-1, 1]) box(cx, y0 + h + 0.24 + rh / 2, cz + s * half / 2, w + 0.8, 0.3, L, roofM, { rx: s * sl });
    const gab = new THREE.Shape([new THREE.Vector2(-half + 0.5, 0), new THREE.Vector2(half - 0.5, 0), new THREE.Vector2(0, rh - 0.2)]);
    for (const s of [-1, 1]) { const ge = new THREE.ShapeGeometry(gab); deco(ge, wallM, cx + s * (w / 2 - 0.02), y0 + h + 0.24, cz, s * Math.PI / 2, 0, 0, false).material = M(wallM.color.getStyle(), { double: true }); }
    deco(new THREE.BoxGeometry(1.4, 2.4, 0.08), mat.door, cx + 1.0, y0 + 1.2, cz + face * (d / 2 + 0.02), 0, 0, 0, false).rotation.y = face > 0 ? -1.1 : 1.1;
    for (const s of [-1, 1]) deco(new THREE.BoxGeometry(1.3, 1.1, 0.1), mat.glass, cx + s * 2.4, y0 + 1.8, cz + face * (d / 2 + 0.02), 0, 0, 0, false);
    // chimney, a crate pile to climb on
    box(cx + 2.6, y0 + h + 2.4, cz - face * 1.2, 0.8, 2.2, 0.8, mat.stone);
    const sx = cx + w / 2 + 0.9;
    box(sx, y0 + 0.6, cz - face * 1.6, 1.2, 1.2, 1.2, mat.wood); box(sx + 1.2, y0 + 0.6, cz - face * 0.4, 1.2, 1.2, 1.2, mat.wood); box(sx, y0 + 1.8, cz - face * 1.6, 1.2, 1.2, 1.2, mat.wood);
    // inside: a table and a rug
    cyl(cx - 1.5, y0 + 0.45, cz - face * 1, 0.7, 0.9, mat.woodDark, { seg: 10, roof: false });
    deco(new THREE.CylinderGeometry(1.6, 1.6, 0.03, 20), M(['#e76f51', '#457b9d', '#e9c46a', '#8338ec'][houses.length % 4]), cx + 0.8, y0 + 0.02, cz, 0, 0, 0, false);
    const inside = V(cx + 0.8, y0, cz), door = V(cx, y0, cz + face * (d / 2 + 1.5));
    houses.push({ inside, door, top: V(cx, y0 + h + 0.24 + rh, cz), climb: [V(sx + 2.4, y0, cz - face * 0.4), V(sx + 1.2, y0 + 1.2, cz - face * 0.4), V(sx, y0 + 2.4, cz - face * 1.6), V(cx + 2.6, y0 + h + 1, cz - face * 1.6)] });
    // a little garden fence and bushes
    for (let i = 0; i < 4; i++) deco(new THREE.IcosahedronGeometry(0.7, 0), i % 2 ? mat.leaf : mat.leaf3, cx - w / 2 - 0.6, y0 + 0.5, cz - d / 2 + 1 + i * 1.7);
  }
  house(16, 13, -1, mat.wallA, mat.roofA); house(31, 13, -1, mat.wallC, mat.roofB); house(16, -13, 1, mat.wallD, mat.roofD); house(-16, 13, -1, mat.wallE, mat.roofC);

  // ---------- gas station ----------
  const GS = { x: -28, z: 26 };
  for (const [dx, dz] of [[-6, -4], [6, -4], [-6, 4], [6, 4]]) box(GS.x + dx, LAND + 2.75, GS.z + dz, 0.6, 5.5, 0.6, mat.white);
  box(GS.x, LAND + 5.85, GS.z, 15, 0.7, 10, mat.red);
  box(GS.x, LAND + 6.3, GS.z, 15.2, 0.2, 10.2, mat.white);
  sign('GAS', 3.2, 0.6, '#e63946', '#ffffff', GS.x, LAND + 5.85, GS.z + 5.02, 0, { size: 0.8 });
  for (const dx of [-3, 3]) { box(GS.x + dx, LAND + 0.9, GS.z, 0.9, 1.8, 0.6, mat.white); deco(new THREE.BoxGeometry(0.7, 0.5, 0.05), M('#1b263b', { emissive: '#3a86ff', ei: 0.4 }), GS.x + dx, LAND + 1.4, GS.z + 0.33, 0, 0, 0, false); }
  // the little shop
  box(GS.x, LAND + 1.75, GS.z - 9, 9, 3.5, 5, mat.wallB); box(GS.x, LAND + 3.65, GS.z - 9, 9.4, 0.3, 5.4, mat.red);
  deco(new THREE.BoxGeometry(4, 1.6, 0.1), mat.glass, GS.x, LAND + 1.6, GS.z - 6.45, 0, 0, 0, false);
  sign('SNACKS', 3.6, 0.7, '#ffd23f', '#3a2400', GS.x, LAND + 3.0, GS.z - 6.42, 0);
  const gsIn = [V(GS.x - 3, LAND, GS.z + 1.5), V(GS.x + 3, LAND, GS.z - 1.5), V(GS.x, LAND, GS.z + 2.5), V(GS.x - 4.5, LAND, GS.z - 2.5)];

  // ---------- supermarket with a loading ramp to the roof ----------
  const SM = { x: 31, z: 36, w: 20, d: 12, h: 6 };
  const smy = LAND + SM.h / 2;
  box(SM.x, smy, SM.z + SM.d / 2 - 0.2, SM.w, SM.h, 0.4, mat.wallE);                                     // back (north)
  box(SM.x - SM.w / 2 + 0.2, smy, SM.z, 0.4, SM.h, SM.d, mat.wallE); box(SM.x + SM.w / 2 - 0.2, smy, SM.z, 0.4, SM.h, SM.d, mat.wallE);
  box(SM.x - 6.5, smy, SM.z - SM.d / 2 + 0.2, 7, SM.h, 0.4, mat.wallE); box(SM.x + 6.5, smy, SM.z - SM.d / 2 + 0.2, 7, SM.h, 0.4, mat.wallE);   // front with a wide door
  box(SM.x, LAND + 4.5, SM.z - SM.d / 2 + 0.2, 6, 3, 0.4, mat.wallE);
  box(SM.x, LAND + SM.h + 0.15, SM.z, SM.w + 0.4, 0.3, SM.d + 0.4, mat.concrete);
  box(SM.x - SM.w / 2, LAND + SM.h + 0.75, SM.z, 0.3, 0.9, SM.d + 0.4, mat.concrete2, { roof: false });
  box(SM.x + SM.w / 2, LAND + SM.h + 0.75, SM.z - SM.d / 4 + 0.15, 0.3, 0.9, SM.d / 2 + 0.7, mat.concrete2, { roof: false });
  box(SM.x - 2, LAND + SM.h + 0.75, SM.z - SM.d / 2, SM.w - 4, 0.9, 0.3, mat.concrete2, { roof: false });
  for (const s of [-1, 1]) deco(new THREE.BoxGeometry(5, 2.2, 0.1), mat.glass, SM.x + s * 6.5, LAND + 1.6, SM.z - SM.d / 2 - 0.02, 0, 0, 0, false);
  sign('BEAN MART', 9, 1.6, '#2a9d8f', '#ffffff', SM.x, LAND + 4.6, SM.z - SM.d / 2 - 0.03, Math.PI, { border: '#ffd23f' });
  // shelves inside
  for (let i = 0; i < 3; i++) box(SM.x - 5 + i * 5, LAND + 0.9, SM.z + 1.5, 1, 1.8, 6, M(['#e76f51', '#2a9d8f', '#e9c46a'][i]), { roof: false });
  // the ramp goes up the east side to the roof
  ramp(V(SM.x + SM.w / 2 + 1.6, LAND, SM.z - SM.d / 2 - 8), V(SM.x + SM.w / 2 + 1.6, LAND + SM.h + 0.3, SM.z + 1), 3, mat.concrete2, { t: 0.5 });
  box(SM.x + SM.w / 2 + 1.6, LAND + SM.h + 0.05, SM.z + 3.6, 3, 0.5, 5.6, mat.concrete2);
  const smPath = [V(SM.x + SM.w / 2 + 1.6, LAND, SM.z - SM.d / 2 - 10), V(SM.x + SM.w / 2 + 1.6, LAND + SM.h, SM.z + 3.5), V(SM.x + SM.w / 2 - 1, LAND + SM.h + 0.3, SM.z + 3.5), V(SM.x, LAND + SM.h + 0.3, SM.z)];
  const smIn = [V(SM.x - 7, LAND, SM.z - 2), V(SM.x + 7, LAND, SM.z - 2), V(SM.x - 2.5, LAND, SM.z - 2.5), V(SM.x + 2.5, LAND, SM.z - 3), V(SM.x - 7.5, LAND, SM.z + 3), V(SM.x + 7.5, LAND, SM.z + 3)];
  const smDoor = V(SM.x, LAND, SM.z - SM.d / 2 - 3);

  // ---------- park with a gazebo, playground, bus stops ----------
  const GZ = { x: -36, z: -9 };
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; cyl(GZ.x + Math.cos(a) * 3.6, LAND + 1.6, GZ.z + Math.sin(a) * 3.6, 0.18, 3.2, mat.white, { seg: 8 }); }
  cyl(GZ.x, LAND + 0.15, GZ.z, 4.2, 0.3, mat.wood, { seg: 6 });
  cyl(GZ.x, LAND + 3.4, GZ.z, 4.4, 0.35, mat.white, { seg: 6 });
  deco(new THREE.ConeGeometry(4.8, 2.2, 6), mat.roofC, GZ.x, LAND + 4.7, GZ.z);
  // playground: a slide
  const PG = { x: -8, z: 40 };
  box(PG.x, LAND + 1.5, PG.z, 2, 0.3, 2, mat.yellow);
  for (const [dx, dz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) cyl(PG.x + dx, LAND + 0.75, PG.z + dz, 0.1, 1.5, mat.red, { seg: 6, roof: false });
  ramp(V(PG.x - 5, LAND, PG.z), V(PG.x - 1, LAND + 1.65, PG.z), 1.4, mat.blue, { steps: mat.white });
  ramp(V(PG.x + 1, LAND + 1.65, PG.z), V(PG.x + 6.5, LAND + 0.1, PG.z), 1.3, M('#ff6fd8', { rough: 0.25 }), { surface: 'ice' });
  // bouncy trampoline
  cyl(PG.x + 2, LAND + 0.35, PG.z + 7, 2, 0.5, M('#3a86ff', { rough: 0.4 }), { seg: 20, surface: 'bounce', bounce: 17, roof: false });
  // bus stops
  const busStops = [];
  for (const [x, z, ry] of [[8.5, 7.2, 0], [-8.5, -7.2, Math.PI]]) {
    const back = new THREE.Vector3(0, 0, 1).applyAxisAngle(V(0, 1, 0), ry);
    box(x + back.x * 1, LAND + 1.3, z + back.z * 1, 4.4, 2.6, 0.15, mat.glass, { ry });
    box(x, LAND + 2.75, z, 4.8, 0.2, 2.4, mat.blue, { ry });
    for (const s of [-1, 1]) box(x + Math.cos(ry) * s * 2.2, LAND + 1.3, z - Math.sin(ry) * s * 2.2, 0.12, 2.6, 0.12, mat.metal, { ry });
    box(x + back.x * 0.6, LAND + 0.45, z + back.z * 0.6, 3.6, 0.15, 0.5, mat.wood, { ry, roof: false });
    busStops.push(V(x - back.x * 0.1, LAND, z - back.z * 0.1));
  }

  // ---------- pier and boats ----------
  const pier = { x: 66, z: 58, a: Math.atan2(58, 66) };
  const px = Math.cos(pier.a), pz = Math.sin(pier.a);
  for (let i = 0; i < 9; i++) {
    const d = i * 3.2, x = pier.x + px * d, z = pier.z + pz * d;
    box(x, LAND - 0.1, z, 3.3, 0.3, 3, mat.wood, { ry: -pier.a });
    for (const s of [-1, 1]) cyl(x - pz * s * 1.4, LAND - 3, z + px * s * 1.4, 0.18, 6, mat.woodDark, { seg: 6, roof: false });
  }
  for (let i = 0; i < 2; i++) {
    const d = 10 + i * 12, x = pier.x + px * d - pz * (5 - i * 10), z = pier.z + pz * d + px * (5 - i * 10);
    const hull = deco(new THREE.CylinderGeometry(1.4, 0.9, 1.2, 10, 1, false, 0, Math.PI), M(i ? '#ffffff' : '#e63946'), x, 0.3, z, -pier.a + Math.PI / 2, Math.PI / 2, 0);
    hull.scale.set(1, 3, 1);
  }

  // ---------- campfires (warm in a blizzard) ----------
  const fires = [V(6, LAND, -26), V(-44, LAND, 6), V(46, LAND, 56), V(-10, LAND, 58), V(54, LAND, -8)];
  const fireLights = [];
  for (const f of fires) {
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; deco(new THREE.DodecahedronGeometry(0.32, 0), mat.rock, f.x + Math.cos(a) * 1.1, f.y + 0.2, f.z + Math.sin(a) * 1.1); }
    for (let i = 0; i < 3; i++) deco(new THREE.CylinderGeometry(0.12, 0.12, 1.6, 6), mat.woodDark, f.x, f.y + 0.25, f.z, i * 1.05, Math.PI / 2 - 0.3, 0);
    for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + 0.4; box(f.x + Math.cos(a) * 2.6, f.y + 0.3, f.z + Math.sin(a) * 2.6, 1.6, 0.4, 0.5, mat.woodDark, { ry: -a + Math.PI / 2, roof: false }); }
    const flame = new THREE.Group(); flame.position.copy(f); flame.visible = false; live.add(flame);
    for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.45 - i * 0.1, 1.2 + i * 0.3, 7), M(['#ff7b00', '#ffb703', '#ffe066'][i], { emissive: ['#ff5400', '#ff9e00', '#ffd23f'][i], ei: 1.5 })); c.position.y = 0.6 + i * 0.1; flame.add(c); }
    let light = null;
    if (!ultra) { light = new THREE.PointLight('#ff9a3c', 0, 14, 1.6); light.position.copy(f).add(V(0, 1.6, 0)); live.add(light); }
    fireLights.push({ flame, light, p: f });
  }

  // ---------- cars ----------
  const carCols = ['#e63946', '#3a86ff', '#ffd23f', '#2a9d8f', '#f8f9fa', '#8338ec', '#ff8c42'];
  const cars = [[-46, 1.8, 0], [24, -2, 0], [50, 2, 0], [-2, 22, Math.PI / 2], [2.2, -40, Math.PI / 2], [-30, 18.5, 0.1], [36, 24.5, 0], [-58, -2, 0]];
  cars.forEach(([x, z, ry], i) => {
    const c = M(carCols[i % carCols.length], { rough: 0.35, metal: 0.2 });
    box(x, LAND + 0.85, z, 4.2, 1.0, 1.9, c, { ry });
    const ux = Math.cos(ry), uz = -Math.sin(ry);
    box(x - ux * 0.3, LAND + 1.75, z - uz * 0.3, 2.3, 0.85, 1.75, c, { ry });
    deco(new THREE.BoxGeometry(2.0, 0.6, 1.8), mat.glass, x - ux * 0.3, LAND + 1.75, z - uz * 0.3, ry, 0, 0, false);
    for (const s of [-1, 1]) for (const t of [-1, 1]) { const w = deco(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12), mat.tire, x + ux * s * 1.35 + Math.sin(ry) * t * 0.95, LAND + 0.42, z + uz * s * 1.35 + Math.cos(ry) * t * 0.95); w.rotation.order = 'YXZ'; w.rotation.set(Math.PI / 2, ry, 0); }
  });

  // ---------- trees, rocks, bushes ----------
  const blocked = [
    [-38, -18, -38, -18], [5, 38, 7, 20], [5, 22, -20, -6], [-23, -9, 7, 20], [-37, -19, 14, 34], [19, 46, 28, 44], [-44, -28, -16, -2], [-14, 4, 34, 50],
    [-60, -44, 42, 58], [-6, 6, -6, 6], [44, 76, 46, 72]
  ];
  const free = (x, z, pad = 0) => !blocked.some(b => x > b[0] - pad && x < b[1] + pad && z > b[2] - pad && z < b[3] + pad) && Math.abs(x) > 6 && Math.abs(z) > 6 && Math.hypot(x, z) < 72;
  let trees = 0;
  for (let k = 0; k < 600 && trees < (ultra ? 34 : 56); k++) {
    const x = (R() - 0.5) * 150, z = (R() - 0.5) * 150;
    if (!free(x, z, 2.5)) continue;
    if (fires.some(f => Math.hypot(f.x - x, f.z - z) < 5)) continue;
    const y = heightAt(x, z), kind = R(), s = 0.8 + R() * 0.6;
    cyl(x, y + 1.2 * s, z, 0.3 * s, 2.4 * s, mat.trunk, { seg: 7, roof: false });
    if (kind < 0.55) {
      const leafM = [mat.leaf, mat.leaf2, mat.leaf3][Math.floor(R() * 3)];
      deco(new THREE.IcosahedronGeometry(1.9 * s, 1), leafM, x, y + 3.6 * s, z);
      deco(new THREE.IcosahedronGeometry(1.3 * s, 1), leafM, x + 0.8 * s, y + 4.6 * s, z - 0.4 * s);
    } else {
      for (let i = 0; i < 3; i++) deco(new THREE.ConeGeometry((2.1 - i * 0.55) * s, 2.2 * s, 8), mat.pine, x, y + (2.8 + i * 1.3) * s, z);
    }
    trees++;
  }
  for (let k = 0; k < 40; k++) {
    const a = R() * Math.PI * 2, r = 70 + R() * 22, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!free(x, z, 3) && r < 72) continue;
    const s = 0.6 + R() * 1.4; deco(new THREE.DodecahedronGeometry(s, 0), mat.rock, x, heightAt(x, z) + s * 0.3, z, R() * 3, R(), R());
  }
  // a big tree and bench on the hill top
  cyl(HILL.x, LAND + HILL.h + 2, HILL.z, 0.6, 4, mat.trunk, { seg: 8, roof: false });
  deco(new THREE.IcosahedronGeometry(3.2, 1), mat.leaf2, HILL.x, LAND + HILL.h + 5.5, HILL.z);
  box(HILL.x + 3, LAND + HILL.h + 0.3, HILL.z + 1, 2.4, 0.2, 0.7, mat.wood, { roof: false });
  sign('LOOKOUT HILL', 3.4, 0.8, '#6a994e', '#ffffff', HILL.x - 10, heightAt(HILL.x - 10, HILL.z + 14) + 1.6, HILL.z + 14, 0.6);
  cyl(HILL.x - 10, heightAt(HILL.x - 10, HILL.z + 14) + 0.6, HILL.z + 14, 0.08, 1.2, mat.woodDark, { seg: 5, roof: false });

  // ---------- far away: other islands and the volcano ----------
  const VOLC = V(-230, 0, -210);
  const vol = new THREE.Mesh(new THREE.CylinderGeometry(14, 95, 85, 24, 4), M('#5b4b49', { flat: true }));
  vol.position.set(VOLC.x, 40, VOLC.z); live.add(vol);
  const crater = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, 1, 20), M('#ff5400', { emissive: '#ff3c00', ei: 0.6 })); crater.position.set(VOLC.x, 82.6, VOLC.z); live.add(crater);
  VOLC.y = 84;
  for (let i = 0; i < 7; i++) {
    const a = 0.6 + i * 0.85, r = 300 + R() * 160, x = Math.cos(a) * r, z = Math.sin(a) * r, s = 20 + R() * 40;
    if (Math.hypot(x - VOLC.x, z - VOLC.z) < 160) continue;
    const isl = new THREE.Mesh(new THREE.ConeGeometry(s, s * 0.7, 9), M('#6a8f4e', { flat: true })); isl.position.set(x, s * 0.2, z); live.add(isl);
  }

  // ---------- the lobby island ----------
  const L = LOBBY, LR = 24;
  const lobbyTex = canvasTex(512, 512, (g, W) => {
    g.fillStyle = '#7bd389'; g.fillRect(0, 0, W, W);
    for (let i = 0; i < 2600; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(46,125,50,.25)' : 'rgba(184,243,91,.25)'; g.fillRect(Math.random() * W, Math.random() * W, 3, 6); }
    g.strokeStyle = '#f2d49b'; g.lineWidth = 28; g.beginPath(); g.arc(W / 2, W / 2, W * 0.2, 0, 7); g.stroke();
    g.fillStyle = '#f2d49b'; g.beginPath(); g.arc(W / 2, W / 2, W * 0.09, 0, 7); g.fill();
  });
  const lobbyFloor = new THREE.Mesh(new THREE.CylinderGeometry(LR, LR - 1, 1.2, 48), [M('#8d6e4f', { flat: true }), M('#7bd389', { map: lobbyTex }), M('#6d4c35')]);
  lobbyFloor.position.set(L.x, L.y - 0.6, L.z); lobbyFloor.receiveShadow = true; live.add(lobbyFloor);
  collide('cyl', lobbyFloor, { r: LR, h: 0.6, tag: 'lobby' });
  const under = new THREE.Mesh(new THREE.ConeGeometry(LR - 1, 26, 12), M('#8d6e4f', { flat: true })); under.rotation.x = Math.PI; under.position.set(L.x, L.y - 14.2, L.z); live.add(under);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const rk = new THREE.Mesh(new THREE.DodecahedronGeometry(3 + (i % 3), 0), M('#7d6650', { flat: true })); rk.position.set(L.x + Math.cos(a) * (LR - 6), L.y - 6 - (i % 3) * 3, L.z + Math.sin(a) * (LR - 6)); live.add(rk); }
  // fence all round
  const N = 36;
  for (let i = 0; i < N; i++) {
    const a = i / N * Math.PI * 2, x = L.x + Math.sin(a) * (LR - 0.6), z = L.z + Math.cos(a) * (LR - 0.6);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.3, 0.25), mat.white); post.position.set(x, L.y + 0.65, z); live.add(post);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(2 * Math.PI * LR / N, 0.18, 0.12), mat.white); rail.position.set(x, L.y + 1.1, z); rail.rotation.y = a; live.add(rail);
    wall(x, L.y + 2.5, z, 2 * Math.PI * LR / N + 0.3, 5, 0.6, a, 'lobby');
  }
  // the big sign
  const signG = new THREE.Group(); signG.position.set(L.x, L.y, L.z - LR + 4); live.add(signG);
  const logoTex = canvasTex(1024, 384, (g, W, H) => {
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#ff7a3d'); gr.addColorStop(1, '#d62828');
    g.fillStyle = '#1b1036'; roundRect(g, 0, 0, W, H, 60); g.fill();
    g.fillStyle = gr; roundRect(g, 18, 18, W - 36, H - 36, 46); g.fill();
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.font = '900 150px "Lilita One", "Arial Black", sans-serif';
    g.lineWidth = 22; g.strokeStyle = '#1b1036'; g.strokeText('BEAN', W / 2, H * 0.33); g.fillStyle = '#ffd23f'; g.fillText('BEAN', W / 2, H * 0.33);
    g.strokeText('DISASTER', W / 2, H * 0.72); g.fillStyle = '#ffffff'; g.fillText('DISASTER', W / 2, H * 0.72);
  });
  logoTex.wrapS = logoTex.wrapT = THREE.ClampToEdgeWrapping;
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(16, 6), new THREE.MeshStandardMaterial({ map: logoTex, emissive: '#ffffff', emissiveMap: logoTex, emissiveIntensity: 0.35, roughness: 0.5 }));
  logo.position.set(0, 9.5, 0); signG.add(logo);
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 7, 10), mat.dark); p.position.set(s * 6, 3.5, -0.3); signG.add(p); }
  wall(L.x, L.y + 3.5, L.z - LR + 3.7, 13, 7, 0.8, 0, 'lobby');
  // the round board with the countdown (drawn every second by the game)
  const board = { canvas: document.createElement('canvas') };
  board.canvas.width = 512; board.canvas.height = 256;
  board.tex = new THREE.CanvasTexture(board.canvas); board.tex.colorSpace = THREE.SRGBColorSpace;
  const boardM = new THREE.Mesh(new THREE.PlaneGeometry(8, 4), new THREE.MeshStandardMaterial({ map: board.tex, emissive: '#ffffff', emissiveMap: board.tex, emissiveIntensity: 0.55 }));
  const bAng = -0.85;
  boardM.position.set(L.x + Math.sin(bAng) * (LR - 5), L.y + 4.2, L.z - Math.cos(bAng) * (LR - 5)); boardM.lookAt(L.x, L.y + 4.2, L.z); live.add(boardM);
  const bp = new THREE.Mesh(new THREE.BoxGeometry(8.4, 4.4, 0.3), mat.dark); bp.position.copy(boardM.position); bp.quaternion.copy(boardM.quaternion); bp.translateZ(-0.2); live.add(bp);
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 2.2, 8), mat.dark); p.position.copy(boardM.position); p.quaternion.copy(boardM.quaternion); p.translateX(s * 3.4); p.translateZ(-0.3); p.position.y = L.y + 1.1; live.add(p); }
  board.draw = (title, big, small) => {
    const g = board.canvas.getContext('2d'), W = 512, Hh = 256;
    g.fillStyle = '#1b1036'; g.fillRect(0, 0, W, Hh);
    g.fillStyle = '#ff7a3d'; g.fillRect(0, 0, W, 54);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#ffffff'; g.font = '900 36px "Lilita One", "Arial Black", sans-serif'; g.fillText(title, W / 2, 29);
    g.fillStyle = '#ffd23f'; g.font = '900 104px "Lilita One", "Arial Black", sans-serif'; g.fillText(big, W / 2, 140);
    g.fillStyle = '#cfd8ff'; g.font = '800 26px "Nunito", sans-serif'; g.fillText(small, W / 2, 222);
    board.tex.needsUpdate = true;
  };
  board.draw('NEXT ROUND', '--', 'Welcome to Bean Town!');
  // the survivors board (the game draws the names on it)
  const top = { canvas: document.createElement('canvas') };
  top.canvas.width = 512; top.canvas.height = 512;
  top.tex = new THREE.CanvasTexture(top.canvas); top.tex.colorSpace = THREE.SRGBColorSpace;
  const tAng = 0.85;
  const topM = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshStandardMaterial({ map: top.tex, emissive: '#ffffff', emissiveMap: top.tex, emissiveIntensity: 0.5 }));
  topM.position.set(L.x + Math.sin(tAng) * (LR - 5), L.y + 4.4, L.z - Math.cos(tAng) * (LR - 5)); topM.lookAt(L.x, L.y + 4.4, L.z); live.add(topM);
  const tp = new THREE.Mesh(new THREE.BoxGeometry(6.4, 6.4, 0.3), mat.dark); tp.position.copy(topM.position); tp.quaternion.copy(topM.quaternion); tp.translateZ(-0.2); live.add(tp);
  top.draw = (rows) => {
    const g = top.canvas.getContext('2d'), W = 512;
    g.fillStyle = '#1b1036'; g.fillRect(0, 0, W, W);
    g.fillStyle = '#2a9d8f'; g.fillRect(0, 0, W, 70);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.font = '900 40px "Lilita One", "Arial Black", sans-serif'; g.fillText('MOST SURVIVED', W / 2, 38);
    g.font = '800 30px "Nunito", sans-serif';
    rows.slice(0, 9).forEach((r, i) => {
      g.textAlign = 'left'; g.fillStyle = i === 0 ? '#ffd23f' : '#ffffff'; g.fillText(`${i + 1}. ${r.name}`.slice(0, 20), 26, 108 + i * 45);
      g.textAlign = 'right'; g.fillStyle = '#7bd389'; g.fillText(String(r.wins), W - 26, 108 + i * 45);
    });
    top.tex.needsUpdate = true;
  };
  top.draw([]);
  // bouncy mushrooms and benches
  const mush = [];
  for (const [a, r, s] of [[2.3, 14, 1], [3.1, 16, 1.2], [4.0, 13, 0.9], [-2.3, 15, 1.1]]) {
    const x = L.x + Math.sin(a) * r, z = L.z - Math.cos(a) * r;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.5 * s, 0.6 * s, 1.6 * s, 10), M('#fff3e0')); stem.position.set(x, L.y + 0.8 * s, z); live.add(stem);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(1.6 * s, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), M('#ff4d6d', { rough: 0.4 })); cap.position.set(x, L.y + 1.5 * s, z); cap.scale.y = 0.6; live.add(cap);
    for (let i = 0; i < 5; i++) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.22 * s, 8, 6), mat.white); const aa = i * 1.3; d.position.set(x + Math.cos(aa) * 0.9 * s, L.y + 1.5 * s + 0.75 * s, z + Math.sin(aa) * 0.9 * s); live.add(d); }
    collide('cyl', cap, { r: 1.6 * s, h: 0.5 * s, surface: 'bounce', bounce: 19, tag: 'lobby' });
    mush.push(cap);
  }
  // the locker booth (walk in to change your look)
  const lockAng = 2.95, lockP = V(L.x + Math.sin(lockAng) * 17, L.y, L.z - Math.cos(lockAng) * 17);
  const booth = new THREE.Group(); booth.position.copy(lockP); booth.lookAt(L.x, L.y, L.z); live.add(booth);
  const tent = new THREE.Mesh(new THREE.ConeGeometry(3.4, 3.4, 8, 1, true), M('#8338ec', { double: true, rough: 0.6 })); tent.position.y = 4.2; booth.add(tent);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.6, 6), mat.white); p.position.set(Math.cos(a) * 3, 1.3, Math.sin(a) * 3); booth.add(p); }
  const lockSign = sign('LOCKER', 3.4, 0.9, '#ffd23f', '#3a2400', 0, 0, 0, 0, { live: true });
  booth.add(lockSign); lockSign.position.set(0, 2.9, 3.05);
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.08, 24), M('#ffd23f', { emissive: '#ffb703', ei: 0.5 })); pad.position.y = 0.04; booth.add(pad);
  // spawn points
  const lobbySpawns = []; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; lobbySpawns.push(V(L.x + Math.sin(a) * 6, L.y + 0.2, L.z + Math.cos(a) * 6)); }
  const mapSpawns = []; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 + 0.26; mapSpawns.push(V(Math.sin(a) * (8 + (i % 2) * 3.5), LAND + 0.3, Math.cos(a) * (8 + (i % 2) * 3.5))); }

  // ---------- merge the static meshes per material ----------
  root.updateMatrixWorld(true);
  const groups = new Map();
  root.traverse(o => { if (o.isMesh) { const k = o.material.uuid + (o.castShadow ? 'c' : 'n'); if (!groups.has(k)) groups.set(k, { mat: o.material, cast: o.castShadow, list: [] }); groups.get(k).list.push(o); } });
  const merged = new THREE.Group();
  for (const g of groups.values()) {
    const geos = g.list.map(o => { let geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); geo.applyMatrix4(o.matrixWorld); for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k); if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2)); return geo; });
    const mg = mergeGeometries(geos, false);
    geos.forEach(x => x.dispose());
    if (!mg) continue;
    const m = new THREE.Mesh(mg, g.mat); m.castShadow = g.cast && !lo; m.receiveShadow = !ultra; merged.add(m);
  }
  root.traverse(o => { if (o.isMesh) o.geometry.dispose(); });

  const scene = new THREE.Group(); scene.add(merged, live);
  if (lo) live.traverse(o => { if (o.isMesh) o.castShadow = false; });

  // ---------- where to go in each kind of disaster (for the bots) ----------
  const spots = {
    high: [
      { name: 'office', path: ofPath, top: V(ofx, OF.top, ofz), y: OF.top, cap: 16, spread: 5 },
      { name: 'lighthouse', path: lhPath.concat([lhTop]), top: lhTop, y: LH.top, cap: 6, spread: 1.2 },
      { name: 'hill', path: [V(HILL.x - 14, LAND, HILL.z + 12), V(HILL.x - 3, LAND + 8, HILL.z + 2)], top: V(HILL.x, LAND + HILL.h, HILL.z), y: LAND + HILL.h, cap: 12, spread: 4 },
      { name: 'mart', path: smPath, top: V(SM.x, LAND + SM.h + 0.3, SM.z), y: LAND + SM.h + 0.3, cap: 10, spread: 5 },
      ...houses.map((h, i) => ({ name: 'roof' + i, path: h.climb, top: h.top, y: h.top.y, cap: 2, spread: 1.2 }))
    ],
    shelter: [
      { name: 'office floor', path: [V(ofx, LAND, OF.z1 + 4)], top: V(ofx, LAND, ofz), cap: 14, spread: 5 },
      { name: 'gas', path: [V(GS.x, LAND, GS.z + 7)], top: V(GS.x, LAND, GS.z), cap: 12, spread: 4 },
      { name: 'mart', path: [smDoor], top: V(SM.x, LAND, SM.z - 2), cap: 12, spread: 6 },
      { name: 'gazebo', path: [V(GZ.x + 6, LAND, GZ.z)], top: V(GZ.x, LAND, GZ.z), cap: 5, spread: 2 },
      ...houses.map((h, i) => ({ name: 'house' + i, path: [h.door], top: h.inside, cap: 4, spread: 1.6 })),
      ...busStops.map((b, i) => ({ name: 'bus' + i, path: [], top: b, cap: 2, spread: 1.2 }))
    ],
    warm: [
      ...fires.map((f, i) => ({ name: 'fire' + i, path: [], top: V(f.x + 2, f.y, f.z), cap: 4, spread: 2, fire: f })),
      ...houses.map((h, i) => ({ name: 'house' + i, path: [h.door], top: h.inside, cap: 4, spread: 1.6 }))
    ]
  };
  // points that lightning likes (the tall ones)
  const tallPoints = [V(LH.x, LH.top + 6, LH.z), V(ofx, OF.top, ofz), V(OF.x0 + 3.5, OF.top + 3, OF.z0 + 3.5), V(HILL.x, LAND + HILL.h + 6, HILL.z), V(SM.x, LAND + SM.h, SM.z)];

  return {
    world, scene, groundMesh, groundTex, spots, tallPoints, mapSpawns, lobbySpawns, fires: fireLights, board, top, mush,
    lockP, beam, volcano: { pos: VOLC, crater }, houses, buildings: [OF, SM],
    // the outlines of buildings (for falling debris in an earthquake)
    edges: [
      { x0: OF.x0, x1: OF.x1, z0: OF.z0, z1: OF.z1, y: OF.top }, { x0: SM.x - SM.w / 2, x1: SM.x + SM.w / 2, z0: SM.z - SM.d / 2, z1: SM.z + SM.d / 2, y: LAND + SM.h },
      ...houses.map(h => ({ x0: h.inside.x - 4.8, x1: h.inside.x + 3.2, z0: h.inside.z - 3.5, z1: h.inside.z + 3.5, y: h.top.y }))
    ]
  };
}

function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

// The ground picture: grass, roads, the plaza, sand and the hill path, painted pixel by pixel from the
// same height map as the ground itself.
function paintGround(g, W, SPAN) {
  const img = g.createImageData(W, W), d = img.data, k = SPAN / W;
  const road = (x, z) => (Math.abs(z) < 4 && Math.abs(x) < 74) || (Math.abs(x) < 4 && Math.abs(z) < 74);
  const walk = (x, z) => (Math.abs(z) < 5.6 && Math.abs(x) < 74) || (Math.abs(x) < 5.6 && Math.abs(z) < 74);
  for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
    const x = -SPAN / 2 + (i + 0.5) * k, z = -SPAN / 2 + (j + 0.5) * k, r = Math.hypot(x, z), h = heightAt(x, z);
    const n = (Math.sin(x * 1.7) * Math.cos(z * 1.3) + Math.sin(x * 0.37 + z * 0.51)) * 0.5, n2 = Math.random() * 0.08;
    let c;
    if (r < 13) { const ring = (Math.floor(r / 1.6) + Math.floor(Math.atan2(z, x) * 6)) % 2; c = ring ? [206, 200, 190] : [190, 184, 176]; }
    else if (road(x, z) && r < 76) { c = [74, 78, 88]; if ((Math.abs(z) < 0.18 && Math.abs(x) > 13 && Math.floor(x / 3) % 2 === 0) || (Math.abs(x) < 0.18 && Math.abs(z) > 13 && Math.floor(z / 3) % 2 === 0)) c = [255, 230, 120]; }
    else if (walk(x, z) && r < 76) c = [196, 196, 200];
    else if (r > 74 || h < 1.2) { const wet = smooth(1.2, -0.5, h); c = [238 - wet * 50, 214 - wet * 50, 160 - wet * 40]; }
    else if (x > -46 && x < -10 && z > 16 && z < 36) c = [120, 124, 134];                               // gas station lot
    else if (x > 17 && x < 47 && z > 22 && z < 30) c = [120, 124, 134];                                 // parking
    else {
      const hill = smooth(LAND + 0.6, LAND + 9, h);
      c = [96 + n * 14 - hill * 10, 176 + n * 18 - hill * 20, 72 + n * 10 - hill * 8];
      const pd = Math.abs((x - HILL.x) * 0.62 + (z - HILL.z) * 0.78) ;   // the dirt path up the hill
      if (Math.hypot(x - HILL.x, z - HILL.z) < HILL.r && pd < 1.5 && x < HILL.x + 2) c = [168, 128, 86];
    }
    const o = (j * W + i) * 4, m = 1 - n2;
    d[o] = c[0] * m; d[o + 1] = c[1] * m; d[o + 2] = c[2] * m; d[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // flower dots
  for (let i = 0; i < W * 2; i++) { const x = Math.random() * W, y = Math.random() * W; const wx = -SPAN / 2 + x * k, wz = -SPAN / 2 + y * k; if (road(wx, wz) || Math.hypot(wx, wz) > 70 || Math.hypot(wx, wz) < 14) continue; g.fillStyle = ['#ffffff', '#ffd23f', '#ff6fd8', '#ff8c42'][i % 4]; g.fillRect(x, y, Math.max(1, W / 1024), Math.max(1, W / 1024)); }
}
