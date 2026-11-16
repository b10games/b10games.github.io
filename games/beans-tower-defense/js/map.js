// The three maps: terrain, the winding balloon path, ponds, decorations, entrance and exit, plus the rules for
// where beans may stand. Everything is built from code (no downloads) and heavy decoration is instanced.
import { THREE, makeWorldScene, canvasTex, rng, clamp } from './engine.js';
import { FIELD } from './data.js';

export const THEMES = {
  valley: {
    skyTop: '#4fa8f0', skyMid: '#bfe6ff', skyBottom: '#d9f2c7', sunDir: [0.5, 0.9, 0.35], sunColor: '#fff4dc', sunInt: 2.6,
    fog: '#cdebf5', fogNear: 120, fogFar: 260, hemiSky: '#e8f6ff', hemiGround: '#5a8a3c', hemiInt: 1.25,
    ground: ['#7cc458', '#69b84b', '#8fd067'], edge: '#b8a06a', far: '#5fa848', path: ['#e2c08a', '#cfa66b', '#b88a52'], curb: '#9b8565',
    water: '#3fb7e8', waterDeep: '#1f78b4'
  },
  candy: {
    skyTop: '#ff9ad5', skyMid: '#ffd6f0', skyBottom: '#f7e1ff', sunDir: [0.45, 0.9, 0.4], sunColor: '#fff0f7', sunInt: 2.4,
    fog: '#ffe0f3', fogNear: 120, fogFar: 260, hemiSky: '#fff0fb', hemiGround: '#c070b0', hemiInt: 1.35,
    ground: ['#f7a8d4', '#ee95c8', '#f9bde0'], edge: '#ffe3f1', far: '#d98ad0', path: ['#7a4a2e', '#8e5a38', '#6b3f26'], curb: '#fff6e8',
    water: '#ff7ac8', waterDeep: '#d63a9a'
  },
  dunes: {
    skyTop: '#5aa7e8', skyMid: '#ffe6b8', skyBottom: '#ffd99a', sunDir: [0.55, 0.85, 0.3], sunColor: '#ffeac2', sunInt: 2.9,
    fog: '#f8dfb0', fogNear: 120, fogFar: 260, hemiSky: '#fff3dc', hemiGround: '#c08850', hemiInt: 1.25,
    ground: ['#edd39b', '#e3c483', '#f3dcaa'], edge: '#d7b073', far: '#d9b072', path: ['#c99f68', '#b98a55', '#a87a48'], curb: '#8a6a45',
    water: '#3ec6d9', waterDeep: '#1f8fa8'
  },
  frost: {
    skyTop: '#6fb3ff', skyMid: '#dff1ff', skyBottom: '#f4fbff', sunDir: [0.45, 0.85, 0.35], sunColor: '#ffffff', sunInt: 2.3,
    fog: '#e8f4ff', fogNear: 120, fogFar: 260, hemiSky: '#ffffff', hemiGround: '#9fb6cc', hemiInt: 1.35,
    ground: ['#f2f7fb', '#e3edf5', '#ffffff'], edge: '#c9d9e6', far: '#d7e6f2', path: ['#b9cad8', '#a8bccd', '#cfdbe6'], curb: '#8fa8bd',
    water: '#bfe6ff', waterDeep: '#6fb8e8', ice: true, ambient: 'snow'
  },
  lava: {
    skyTop: '#3a1410', skyMid: '#a8492a', skyBottom: '#ff9a5a', sunDir: [0.5, 0.8, 0.3], sunColor: '#ffd2a8', sunInt: 2.1,
    fog: '#7a3a2a', fogNear: 120, fogFar: 260, hemiSky: '#ffb38a', hemiGround: '#3a1a14', hemiInt: 1.15,
    ground: ['#5e4c44', '#4f3f39', '#6b5850'], edge: '#3a302c', far: '#3b2f2b', path: ['#8b6b52', '#7a5c46', '#a07a5c'], curb: '#2b2420',
    water: '#ff6a00', waterDeep: '#ff3d00', lava: true, ambient: 'embers'
  },
  swamp: {
    skyTop: '#1d1645', skyMid: '#4a3f7a', skyBottom: '#7d6aa8', sunDir: [0.4, 0.85, 0.4], sunColor: '#c7cfff', sunInt: 1.9,
    fog: '#3a3060', fogNear: 120, fogFar: 260, hemiSky: '#a9a6ff', hemiGround: '#2a3a2a', hemiInt: 1.25,
    ground: ['#4a6b4f', '#3f5c44', '#567a5a'], edge: '#3a4a35', far: '#2f4a35', path: ['#6e5a4a', '#5e4c3e', '#7a6656'], curb: '#3e3a48',
    water: '#4a6b3a', waterDeep: '#2a3a20', murky: true, ambient: 'fireflies'
  }
};

// ---------- the path ----------
export class Path {
  constructor(points) {
    const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
    this.len = curve.getLength();
    const n = Math.ceil(this.len / 0.5);
    this.step = this.len / n;
    this.pts = curve.getSpacedPoints(n);
    this.n = n;
  }
  // position at distance d along the path (out = Vector3), plus the heading angle in out.userData-free form
  at(d, out) {
    const f = clamp(d / this.step, 0, this.n - 0.0001), i = Math.floor(f), k = f - i, a = this.pts[i], b = this.pts[i + 1];
    out.x = a.x + (b.x - a.x) * k; out.z = a.z + (b.z - a.z) * k; out.y = 0;
    return out;
  }
  heading(d) { const i = clamp(Math.floor(d / this.step), 0, this.n - 1), a = this.pts[i], b = this.pts[i + 1]; return Math.atan2(b.x - a.x, b.z - a.z); }
}

// ---------- the map ----------
export function buildMap(def, quality = 'high') {
  const T = THEMES[def.theme], R = rng(def.id.length * 977 + def.path.length * 31);
  const scene = makeWorldScene(T, quality);
  const sun = scene.userData.sun;
  // the camera looks down from high up, so the haze only starts far beyond the field
  scene.fog.near = 230; scene.fog.far = 620;
  Object.assign(sun.shadow.camera, { left: -56, right: 56, top: 44, bottom: -44, far: 320 });
  sun.shadow.camera.updateProjectionMatrix();
  scene.userData.setFocus(new THREE.Vector3(0, 0, 0));
  const path = new Path(def.path);
  const anim = [];
  // distance from the path, stored on a grid (fast lookups for terrain, decorations and placement)
  const GX = 70, GZ = 46, RES = 0.5, NX = Math.round(GX * 2 / RES) + 1, NZ = Math.round(GZ * 2 / RES) + 1;
  const dist = new Float32Array(NX * NZ).fill(99);
  for (const p of path.pts) {
    const cx = Math.round((p.x + GX) / RES), cz = Math.round((p.z + GZ) / RES), rr = Math.ceil(14 / RES);
    for (let j = Math.max(0, cz - rr); j <= Math.min(NZ - 1, cz + rr); j++) for (let i = Math.max(0, cx - rr); i <= Math.min(NX - 1, cx + rr); i++) {
      const x = i * RES - GX, z = j * RES - GZ, d = Math.hypot(x - p.x, z - p.z), k = j * NX + i;
      if (d < dist[k]) dist[k] = d;
    }
  }
  const distAt = (x, z) => { const i = clamp(Math.round((x + GX) / RES), 0, NX - 1), j = clamp(Math.round((z + GZ) / RES), 0, NZ - 1); return dist[j * NX + i]; };
  const ponds = def.ponds.map(([x, z, r]) => ({ x, z, r }));
  const inPond = (x, z, pad = 0) => ponds.some(p => Math.hypot(x - p.x, z - p.z) < p.r + pad);
  // gentle bumps inside the field, real hills around it
  const noise = (x, z) => Math.sin(x * 0.21 + Math.cos(z * 0.13) * 2) * Math.cos(z * 0.19 - x * 0.05) + Math.sin(x * 0.07 + z * 0.11) * 0.6;
  const heightAt = (x, z) => {
    const d = distAt(x, z), out = Math.max(Math.abs(x) - FIELD.w - 2, (Math.abs(z) - FIELD.h - 2) * 1.3, 0);
    let h = noise(x, z) * 0.22 * clamp((d - 3) / 5, 0, 1);
    h += out > 0 ? Math.pow(out, 1.25) * 0.55 * (0.7 + 0.3 * noise(x * 1.7, z * 1.7)) : 0;
    for (const p of ponds) { const pd = Math.hypot(x - p.x, z - p.z); if (pd < p.r + 1) h -= (1 - clamp(pd / (p.r + 1), 0, 1)) * 1.2; }
    return h * clamp((d - 2.2) / 2, 0, 1);
  };
  const root = new THREE.Group(); scene.add(root);

  // ---------- terrain ----------
  {
    const geo = new THREE.PlaneGeometry(GX * 2, GZ * 2, 180, 118); geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color(), tmp = new THREE.Color();
    const g0 = new THREE.Color(T.ground[0]), g1 = new THREE.Color(T.ground[1]), g2 = new THREE.Color(T.ground[2]), edge = new THREE.Color(T.edge), far = new THREE.Color(T.far);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), h = heightAt(x, z), d = distAt(x, z);
      pos.setY(i, h);
      const n = noise(x * 2.3, z * 2.3) * 0.5 + 0.5, m = Math.sin(x * 1.3) * Math.cos(z * 1.1) * 0.5 + 0.5;
      c.copy(g0).lerp(g1, n).lerp(g2, m * 0.5);
      if (d < 3.4) c.lerp(edge, clamp(1 - (d - 1.9) / 1.5, 0, 1) * 0.75);
      if (h > 0.6) c.lerp(far, clamp((h - 0.6) / 3, 0, 0.8));
      if (inPond(x, z, 0.8)) c.lerp(tmp.set(T.waterDeep), 0.45);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
    const detail = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#808080'; g.fillRect(0, 0, w, h); for (let i = 0; i < 2600; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.08)'; g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 3, 2 + Math.random() * 3); } }, [24, 16]);
    const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, map: detail }));
    ground.receiveShadow = true; root.add(ground);
    // an endless floor further out so there is never a hard edge
    const outer = new THREE.Mesh(new THREE.CircleGeometry(400, 40), new THREE.MeshStandardMaterial({ color: T.far, roughness: 1 }));
    outer.rotation.x = -Math.PI / 2; outer.position.y = -0.3; root.add(outer);
  }

  // ---------- path ribbon ----------
  {
    const W = 1.85, n = path.pts.length, pos = [], uv = [], idx = [], cpos = [];
    for (let i = 0; i < n; i++) {
      const p = path.pts[i], q = path.pts[Math.min(n - 1, i + 1)], o = path.pts[Math.max(0, i - 1)];
      let dx = q.x - o.x, dz = q.z - o.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const nx = -dz, nz = dx, v = i * path.step / 3.6;
      pos.push(p.x + nx * W, 0.05, p.z + nz * W, p.x - nx * W, 0.05, p.z - nz * W); uv.push(0, v, 1, v);
      for (const s of [1, -1]) cpos.push([p.x + nx * W * s, p.z + nz * W * s, s]);
      if (i < n - 1) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    const tex = pathTexture(def.theme, T);
    const road = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 })); road.receiveShadow = true; root.add(road);
    // curb stones along both edges
    const stones = cpos.filter((_, i) => i % 3 === 0);
    const sg = def.theme === 'candy' ? new THREE.SphereGeometry(0.32, 10, 8) : new THREE.DodecahedronGeometry(0.3, 0);
    const sm = def.theme === 'candy' ? new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.3, clearcoat: 0.6 }) : new THREE.MeshStandardMaterial({ color: T.curb, roughness: 0.9, flatShading: true });
    const curb = new THREE.InstancedMesh(sg, sm, stones.length), m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e = new THREE.Euler(), cc = new THREE.Color();
    const candyCols = ['#ff4d6d', '#ffd23f', '#7bd389', '#3a86ff', '#c77dff', '#ffffff'];
    stones.forEach(([x, z], i) => { const s = 0.8 + R() * 0.5; m4.compose(new THREE.Vector3(x, 0.08, z), q4.setFromEuler(e.set(R(), R() * 6, R())), new THREE.Vector3(s, s * 0.7, s)); curb.setMatrixAt(i, m4); curb.setColorAt(i, def.theme === 'candy' ? cc.set(candyCols[i % candyCols.length]) : cc.set(T.curb).offsetHSL(0, 0, (R() - 0.5) * 0.1)); });
    curb.castShadow = true; curb.receiveShadow = true; root.add(curb);
  }

  // ---------- ponds ----------
  const bubbles = [];
  const waterTex = canvasTex(128, 128, (g, w, h) => { g.fillStyle = T.water; g.fillRect(0, 0, w, h); g.globalAlpha = 0.35; g.strokeStyle = '#ffffff'; g.lineWidth = 2; for (let i = 0; i < 14; i++) { const y = Math.random() * h; g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin(x * 0.1 + i) * 3); g.stroke(); } }, [3, 3]);
  for (const p of ponds) {
    const water = new THREE.Mesh(new THREE.CircleGeometry(p.r + 0.4, 40), new THREE.MeshPhysicalMaterial({ map: waterTex, roughness: T.ice ? 0.02 : 0.08, clearcoat: 1, transparent: !T.lava, opacity: T.ice ? 0.95 : 0.88, emissive: T.waterDeep, emissiveIntensity: T.lava ? 1.4 : T.ice ? 0.05 : 0.15 }));
    water.rotation.x = -Math.PI / 2; water.position.set(p.x, -0.12, p.z); water.receiveShadow = true; root.add(water);
    if (!T.ice) anim.push(t => { waterTex.offset.set(t * 0.02, t * 0.015); if (T.lava) water.material.emissiveIntensity = 1.2 + Math.sin(t * 2 + p.x) * 0.35; });
    if (T.lava) anim.push(t => { if (Math.random() < 0.03) bubbles.push({ x: p.x + (Math.random() - 0.5) * p.r * 1.4, z: p.z + (Math.random() - 0.5) * p.r * 1.4, t: 0 }); });
    if (T.lava) { const light = new THREE.PointLight('#ff6a00', 30, p.r * 4, 1.6); light.position.set(p.x, 1.5, p.z); root.add(light); }
    // rim stones
    const nRim = Math.round(p.r * 7), rim = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.35, 0), new THREE.MeshStandardMaterial({ color: def.theme === 'candy' ? '#fff6e8' : '#a9a39b', roughness: 0.9, flatShading: true }), nRim);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    for (let i = 0; i < nRim; i++) { const a = i / nRim * Math.PI * 2, rr = p.r + 0.5 + R() * 0.3, s = 0.7 + R() * 0.7; m4.compose(new THREE.Vector3(p.x + Math.cos(a) * rr, 0.0, p.z + Math.sin(a) * rr), q.setFromEuler(e.set(R(), R() * 6, R())), new THREE.Vector3(s, s * 0.6, s)); rim.setMatrixAt(i, m4); }
    rim.castShadow = true; root.add(rim);
    if (def.theme === 'valley') { const pads = new THREE.InstancedMesh(new THREE.CircleGeometry(0.45, 12, 0.3, Math.PI * 1.8), new THREE.MeshStandardMaterial({ color: '#4caf50', side: THREE.DoubleSide }), 5); for (let i = 0; i < 5; i++) { const a = R() * 6.28, rr = R() * p.r * 0.7; m4.compose(new THREE.Vector3(p.x + Math.cos(a) * rr, -0.08, p.z + Math.sin(a) * rr), q.setFromEuler(e.set(-Math.PI / 2, 0, R() * 6)), new THREE.Vector3(1, 1, 1)); pads.setMatrixAt(i, m4); } root.add(pads); }
  }

  // ---------- decorations ----------
  const blockers = [];
  const deco = new Decor(root, R);
  const spot = (inside, minPath = 4) => {
    for (let k = 0; k < 40; k++) {
      const x = inside ? (R() * 2 - 1) * (FIELD.w - 1) : (R() * 2 - 1) * (GX - 4), z = inside ? (R() * 2 - 1) * (FIELD.h - 1) : (R() * 2 - 1) * (GZ - 4);
      if (!inside && Math.abs(x) < FIELD.w + 1 && Math.abs(z) < FIELD.h + 1) continue;
      if (distAt(x, z) < minPath || inPond(x, z, 1.5)) continue;
      if (blockers.some(b => Math.hypot(b.x - x, b.z - z) < b.r + 1.2)) continue;
      return [x, heightAt(x, z), z];
    }
    return null;
  };
  const kinds = DECOR[def.theme];
  // big things: around the field (dense) and a few inside it (they block placement)
  for (const [kind, nOut, nIn, r] of kinds.big) {
    for (let i = 0; i < nOut; i++) { const s = spot(false, 6); if (s) deco.add(kind, s, 0.8 + R() * 0.7); }
    for (let i = 0; i < nIn; i++) { const s = spot(true, 4.2); if (s) { const sc = 0.8 + R() * 0.4; deco.add(kind, s, sc); blockers.push({ x: s[0], z: s[2], r: r * sc }); } }
  }
  // small things: everywhere, never in the way
  for (const [kind, n] of kinds.small) for (let i = 0; i < n; i++) {
    const x = (R() * 2 - 1) * (GX - 6), z = (R() * 2 - 1) * (GZ - 6);
    if (distAt(x, z) < 2.6 || inPond(x, z, 0.6)) continue;
    deco.add(kind, [x, heightAt(x, z), z], 0.7 + R() * 0.6);
  }
  deco.finish();
  anim.push(...deco.anim);
  // drifting weather: snow, glowing embers or fireflies
  if (T.ambient) {
    const n = quality === 'ultra' ? 60 : quality === 'low' ? 160 : 360, pos = new Float32Array(n * 3), ph = new Float32Array(n);
    for (let i = 0; i < n; i++) { pos[i * 3] = (R() * 2 - 1) * 46; pos[i * 3 + 1] = R() * 18; pos[i * 3 + 2] = (R() * 2 - 1) * 30; ph[i] = R() * 10; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const glow = T.ambient !== 'snow';
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: T.ambient === 'snow' ? '#ffffff' : T.ambient === 'embers' ? '#ffb347' : '#d8ff7a', size: T.ambient === 'snow' ? 0.35 : 0.3, transparent: true, opacity: 0.9, depthWrite: false, blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending }));
    pts.frustumCulled = false; root.add(pts);
    let last = 0;
    anim.push(t => {
      const dt = Math.min(0.1, t - last); last = t; const a = geo.attributes.position.array;
      for (let i = 0; i < n; i++) {
        const j = i * 3;
        if (T.ambient === 'snow') { a[j + 1] -= dt * 2.2; a[j] += Math.sin(t + ph[i]) * dt * 0.8; if (a[j + 1] < 0) a[j + 1] = 18; }
        else if (T.ambient === 'embers') { a[j + 1] += dt * 2; a[j] += Math.sin(t * 2 + ph[i]) * dt; if (a[j + 1] > 16) a[j + 1] = 0; }
        else { a[j] += Math.sin(t * 0.9 + ph[i]) * dt * 1.2; a[j + 2] += Math.cos(t * 0.7 + ph[i] * 2) * dt * 1.2; a[j + 1] = 1 + (Math.sin(t * 0.8 + ph[i]) + 1) * 2; }
      }
      geo.attributes.position.needsUpdate = true;
      if (glow) pts.material.opacity = 0.65 + Math.sin(t * 3) * 0.25;
      if (bubbles.length) {
        for (const b of bubbles) b.t += dt;
        while (bubbles.length && bubbles[0].t > 1) bubbles.shift();
      }
    });
    scene.userData.bubbles = bubbles;
  }

  // ---------- entrance and exit ----------
  const start = path.pts[0], s2 = path.pts[Math.round(6 / path.step)], end = path.pts[path.n], e2 = path.pts[path.n - Math.round(6 / path.step)];
  const gate = entranceGate(def.theme, T); gate.position.set(s2.x, 0, s2.z); gate.rotation.y = Math.atan2(s2.x - start.x, s2.z - start.z); root.add(gate);
  const house = exitHouse(def.theme, T); house.position.set(e2.x, 0, e2.z); house.rotation.y = Math.atan2(end.x - e2.x, end.z - e2.z); root.add(house);
  blockers.push({ x: s2.x, z: s2.z, r: 3.4 }, { x: e2.x, z: e2.z, r: 3.6 });
  root.traverse(o => { if (o.isMesh && o.castShadow === undefined) o.castShadow = true; });
  return {
    def, scene, root, path, anim, ponds, blockers, distAt, heightAt, theme: T,
    // can a bean stand here? (towers = list of {x, z})
    canPlace(x, z, towers, r = 0.95) {
      if (Math.abs(x) > FIELD.w - 1 || Math.abs(z) > FIELD.h - 1) return false;
      if (distAt(x, z) < 1.85 + r + 0.35) return false;
      if (inPond(x, z, r + 0.3)) return false;
      if (blockers.some(b => Math.hypot(b.x - x, b.z - z) < b.r + r)) return false;
      if (towers.some(t => Math.hypot(t.x - x, t.z - z) < r + (t.r || 0.95) + 0.1)) return false;
      return true;
    }
  };
}

function pathTexture(theme, T) {
  return canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = T.path[0]; g.fillRect(0, 0, w, h);
    if (theme === 'frost') {
      for (let i = 0; i < 40; i++) { g.fillStyle = Math.random() < 0.5 ? T.path[1] : T.path[2]; g.globalAlpha = 0.5; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 4 + Math.random() * 10, 0, 7); g.fill(); }
      g.globalAlpha = 0.55; g.fillStyle = '#8fa8bd'; for (let y = 10; y < h; y += 34) { g.beginPath(); g.ellipse(w * 0.38, y, 5, 8, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(w * 0.6, y + 17, 5, 8, 0, 0, 7); g.fill(); }
      g.globalAlpha = 1; g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(0, 0, 9, h); g.fillRect(w - 9, 0, 9, h);
    } else if (theme === 'lava') {
      g.fillStyle = '#4a3a32'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 32) for (let x = (y / 32) % 2 * 21; x < w; x += 42) { g.fillStyle = Math.random() < 0.5 ? '#6b5444' : '#5a463a'; g.fillRect(x + 2, y + 2, 38, 28); }
      g.strokeStyle = '#ff6a00'; g.lineWidth = 2; g.globalAlpha = 0.8; for (let i = 0; i < 10; i++) { g.beginPath(); let x = Math.random() * w, y = Math.random() * h; g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (Math.random() - 0.5) * 30; y += Math.random() * 20; g.lineTo(x, y); } g.stroke(); }
    } else if (theme === 'swamp') {
      for (let i = 0; i < 50; i++) { g.fillStyle = Math.random() < 0.5 ? T.path[1] : T.path[2]; g.globalAlpha = 0.5; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 3 + Math.random() * 9, 0, 7); g.fill(); }
      g.globalAlpha = 1; for (let y = 0; y < h; y += 26) { g.fillStyle = '#8a7258'; g.fillRect(6, y + 2, w - 12, 18); g.fillStyle = '#6e5a46'; g.fillRect(6, y + 16, w - 12, 4); g.fillStyle = '#4a3a2a'; g.fillRect(14, y + 9, 4, 4); g.fillRect(w - 18, y + 9, 4, 4); }
    } else if (theme === 'candy') {
      // chocolate with sprinkles and a cream stripe
      g.fillStyle = T.path[1]; for (let i = 0; i < 40; i++) { g.globalAlpha = 0.4; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 6 + Math.random() * 10, 0, 7); g.fill(); }
      g.globalAlpha = 1; const cols = ['#ff4d6d', '#ffd23f', '#7bd389', '#3a86ff', '#ffffff', '#c77dff'];
      for (let i = 0; i < 70; i++) { g.save(); g.translate(Math.random() * w, Math.random() * h); g.rotate(Math.random() * 6); g.fillStyle = cols[i % cols.length]; g.fillRect(-5, -1.5, 10, 3); g.restore(); }
      g.fillStyle = 'rgba(255,240,220,.85)'; g.fillRect(0, 0, 8, h); g.fillRect(w - 8, 0, 8, h);
    } else if (theme === 'dunes') {
      g.globalAlpha = 0.5; for (let i = 0; i < 26; i++) { g.strokeStyle = T.path[2]; g.lineWidth = 2; g.beginPath(); const y = Math.random() * h; g.moveTo(0, y); g.quadraticCurveTo(w / 2, y + (Math.random() - 0.5) * 12, w, y); g.stroke(); }
      g.globalAlpha = 0.35; g.fillStyle = '#7a5a35'; for (const x of [w * 0.3, w * 0.7]) g.fillRect(x - 5, 0, 10, h);
      g.globalAlpha = 1; for (let i = 0; i < 40; i++) { g.fillStyle = Math.random() < 0.5 ? '#d9b07a' : '#9a7448'; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 1.5 + Math.random() * 2, 0, 7); g.fill(); }
    } else {
      for (let i = 0; i < 50; i++) { g.fillStyle = Math.random() < 0.5 ? T.path[1] : T.path[2]; g.globalAlpha = 0.5; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 3 + Math.random() * 9, 0, 7); g.fill(); }
      g.globalAlpha = 1; for (let i = 0; i < 30; i++) { g.fillStyle = Math.random() < 0.5 ? '#a89a8a' : '#d8cdbf'; g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 3 + Math.random() * 4, 2 + Math.random() * 3, Math.random() * 3, 0, 7); g.fill(); }
      g.fillStyle = 'rgba(80,120,40,.35)'; g.fillRect(0, 0, 6, h); g.fillRect(w - 6, 0, 6, h);
    }
  });
}

// ---------- decorations: shared, instanced parts ----------
const DECOR = {
  valley: { big: [['tree', 60, 7, 1.6], ['pine', 45, 5, 1.3], ['rock', 30, 6, 1.1], ['bush', 30, 8, 1.0]], small: [['flower', 700], ['tuft', 900], ['mushroom', 60], ['pebble', 260]] },
  candy: { big: [['cane', 36, 6, 0.9], ['lolly', 40, 6, 1.0], ['cotton', 50, 6, 1.5], ['gumdrop', 40, 8, 0.9], ['donut', 14, 3, 1.2]], small: [['sprinkle', 900], ['candyball', 260], ['flower', 300]] },
  dunes: { big: [['cactus', 50, 9, 0.9], ['mesa', 26, 4, 2.0], ['rock', 40, 7, 1.1], ['shrub', 40, 7, 0.9], ['palm', 10, 2, 1.2]], small: [['pebble', 500], ['drygrass', 600], ['bones', 30]] },
  frost: { big: [['snowpine', 80, 7, 1.3], ['snowman', 12, 4, 0.9], ['iceblock', 30, 6, 1.1], ['snowrock', 30, 5, 1.1]], small: [['snowball', 400], ['icecrystal', 200], ['pebble', 120]] },
  lava: { big: [['volcano', 10, 0, 3], ['obsidian', 40, 7, 1.0], ['lavarock', 50, 8, 1.1], ['deadtree', 26, 5, 0.8]], small: [['ember', 260], ['pebble', 400], ['ash', 300]] },
  swamp: { big: [['deadtree', 50, 6, 0.8], ['glowshroom', 40, 8, 0.9], ['swampbush', 40, 6, 1.0], ['stump', 26, 6, 0.7]], small: [['reed', 600], ['minishroom', 200], ['pebble', 200]] }
};
const MAT = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: o.rough ?? 0.75, flatShading: !!o.flat, metalness: 0, emissive: o.emissive || '#000000', emissiveIntensity: o.ei ?? 1 });
const PHYS = (c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.2 });
let CANE_TEX = null, LOLLY_TEX = null;
// each kind is a list of parts: [geometry, material, offset [x,y,z], scale [x,y,z], colors?]
function partsFor(kind) {
  switch (kind) {
    case 'tree': return [[new THREE.CylinderGeometry(0.22, 0.32, 1.8, 7), MAT('#8d5524'), [0, 0.9, 0]], [new THREE.IcosahedronGeometry(1.3, 1), MAT('#4caf50', { flat: true }), [0, 2.6, 0], [1, 0.9, 1], ['#3f9d4a', '#58b84f', '#6cc04a', '#2e8b57']], [new THREE.IcosahedronGeometry(0.9, 1), MAT('#5cb85c', { flat: true }), [0.6, 3.2, 0.2], [1, 1, 1], ['#58b84f', '#7bd389', '#4caf50']]];
    case 'pine': return [[new THREE.CylinderGeometry(0.18, 0.25, 1.2, 6), MAT('#7a4a2a'), [0, 0.6, 0]], [new THREE.ConeGeometry(1.3, 1.8, 8), MAT('#2e7d4f', { flat: true }), [0, 1.8, 0], [1, 1, 1], ['#2e7d4f', '#357f4a', '#2b6e44']], [new THREE.ConeGeometry(0.95, 1.5, 8), MAT('#3a9058', { flat: true }), [0, 2.8, 0], [1, 1, 1], ['#3a9058', '#3f9d4a']]];
    case 'bush': return [[new THREE.IcosahedronGeometry(0.85, 1), MAT('#3f9d4a', { flat: true }), [0, 0.5, 0], [1.2, 0.8, 1], ['#3f9d4a', '#2f8f46', '#4caf50']], [new THREE.IcosahedronGeometry(0.12, 0), MAT('#ffffff', { emissive: '#333333' }), [0.4, 0.95, 0.5], [1, 1, 1], ['#ff6fd8', '#ffd23f', '#ffffff', '#ff4d6d']]];
    case 'rock': return [[new THREE.DodecahedronGeometry(0.9, 0), MAT('#a9a39b', { flat: true, rough: 0.9 }), [0, 0.4, 0], [1.2, 0.75, 1], ['#a9a39b', '#b8b2a8', '#948e86']]];
    case 'flower': return [[new THREE.SphereGeometry(0.12, 6, 4), MAT('#ffffff'), [0, 0.15, 0], [1, 0.7, 1], ['#ff6fd8', '#ffd23f', '#ffffff', '#ff8c42', '#c77dff', '#ff4d6d', '#7df9ff']]];
    case 'tuft': return [[new THREE.ConeGeometry(0.12, 0.45, 4), MAT('#4fa83d', { flat: true }), [0, 0.2, 0], [1, 1, 1], ['#4fa83d', '#6cc04a', '#5aa846']]];
    case 'mushroom': return [[new THREE.CylinderGeometry(0.07, 0.09, 0.3, 6), MAT('#f1e3c8'), [0, 0.15, 0]], [new THREE.SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), MAT('#ff4d6d'), [0, 0.28, 0], [1, 1, 1], ['#ff4d6d', '#ff8c42']]];
    case 'pebble': return [[new THREE.DodecahedronGeometry(0.16, 0), MAT('#b0a89c', { flat: true }), [0, 0.05, 0], [1.3, 0.6, 1], ['#b0a89c', '#9a9288', '#c8bfb2']]];
    case 'cane': {
      if (!CANE_TEX) CANE_TEX = canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.fillStyle = '#ff2e63'; for (let i = -h; i < w; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 8, 0); g.lineTo(i + 8 + h, h); g.lineTo(i + h, h); g.fill(); } }, [1, 6]);
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 2.2, 0), new THREE.Vector3(0, 3.2, 0), new THREE.Vector3(0.45, 3.75, 0), new THREE.Vector3(1.0, 3.5, 0), new THREE.Vector3(1.15, 2.9, 0)]);
      return [[new THREE.TubeGeometry(curve, 40, 0.22, 10), new THREE.MeshPhysicalMaterial({ map: CANE_TEX, roughness: 0.25, clearcoat: 0.8 }), [0, 0, 0]]];
    }
    case 'lolly': {
      if (!LOLLY_TEX) LOLLY_TEX = canvasTex(128, 128, (g, w) => { g.translate(w / 2, w / 2); const cols = ['#ff4d6d', '#ffffff', '#ffd23f', '#ffffff', '#7bd389', '#ffffff', '#3a86ff', '#ffffff']; for (let i = 0; i < 8; i++) { g.fillStyle = cols[i]; g.beginPath(); g.moveTo(0, 0); for (let t = 0; t <= 1.01; t += 0.05) { const a = i / 8 * Math.PI * 2 + t * 4, rr = t * w / 2; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } for (let t = 1; t >= 0; t -= 0.05) { const a = (i + 1) / 8 * Math.PI * 2 + t * 4, rr = t * w / 2; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.fill(); } });
      const disc = new THREE.CylinderGeometry(0.85, 0.85, 0.22, 28); disc.rotateX(Math.PI / 2);
      return [[new THREE.CylinderGeometry(0.07, 0.07, 2.4, 6), MAT('#ffffff', { rough: 0.4 }), [0, 1.2, 0]], [disc, new THREE.MeshPhysicalMaterial({ map: LOLLY_TEX, roughness: 0.25, clearcoat: 0.9 }), [0, 2.75, 0]]];
    }
    case 'cotton': return [[new THREE.CylinderGeometry(0.1, 0.13, 1.8, 6), MAT('#ffffff', { rough: 0.4 }), [0, 0.9, 0]], [new THREE.IcosahedronGeometry(1.2, 2), MAT('#ffb3d9', { rough: 1 }), [0, 2.4, 0], [1, 0.9, 1], ['#ffb3d9', '#b8e6ff', '#d9b8ff', '#fff2a8']], [new THREE.IcosahedronGeometry(0.8, 2), MAT('#ffd1ea', { rough: 1 }), [0.6, 2.9, -0.3], [1, 1, 1], ['#ffd1ea', '#d1f0ff', '#ead1ff']]];
    case 'gumdrop': { const g = new THREE.SphereGeometry(0.6, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2); return [[g, PHYS('#ff4d6d'), [0, 0, 0], [1, 1.25, 1], ['#ff4d6d', '#ffd23f', '#7bd389', '#3a86ff', '#c77dff', '#ff8c42']]]; }
    case 'donut': return [[new THREE.TorusGeometry(0.8, 0.38, 12, 24), MAT('#e0a96d'), [0, 0.38, 0], [1, 1, 1]], [new THREE.TorusGeometry(0.8, 0.3, 12, 24, Math.PI * 2), PHYS('#ff7ac8'), [0, 0.52, 0], [1, 1, 0.8], ['#ff7ac8', '#7a4a2e', '#ffffff']]];
    case 'sprinkle': return [[new THREE.CapsuleGeometry(0.035, 0.14, 2, 4), MAT('#ffffff', { rough: 0.4 }), [0, 0.04, 0], [1, 1, 1], ['#ff4d6d', '#ffd23f', '#7bd389', '#3a86ff', '#ffffff', '#c77dff']]];
    case 'candyball': return [[new THREE.SphereGeometry(0.18, 10, 8), PHYS('#ff4d6d'), [0, 0.15, 0], [1, 1, 1], ['#ff4d6d', '#ffd23f', '#7bd389', '#3a86ff', '#ff8c42']]];
    case 'cactus': return [[new THREE.CapsuleGeometry(0.32, 1.9, 4, 10), MAT('#4f8a3a'), [0, 1.2, 0], [1, 1, 1], ['#4f8a3a', '#5c9a42', '#3f7a30']], [new THREE.CapsuleGeometry(0.2, 0.7, 4, 8), MAT('#5c9a42'), [0.55, 1.4, 0], [1, 1, 1], ['#5c9a42', '#4f8a3a']], [new THREE.CapsuleGeometry(0.18, 0.55, 4, 8), MAT('#4f8a3a'), [-0.5, 1.05, 0], [1, 1, 1], ['#4f8a3a']], [new THREE.SphereGeometry(0.12, 8, 6), MAT('#ff6fa8'), [0, 2.55, 0], [1, 0.7, 1], ['#ff6fa8', '#ffd23f', '#ff8c42']]];
    case 'mesa': return [[new THREE.CylinderGeometry(2.2, 2.8, 3.2, 7), MAT('#c8743f', { flat: true, rough: 0.95 }), [0, 1.5, 0], [1, 1, 1], ['#c8743f', '#b7643a', '#d8894e']], [new THREE.CylinderGeometry(2.25, 2.25, 0.4, 7), MAT('#e0a06a', { flat: true }), [0, 3.1, 0], [1, 1, 1]]];
    case 'shrub': return [[new THREE.IcosahedronGeometry(0.6, 0), MAT('#8a9a4a', { flat: true }), [0, 0.35, 0], [1.2, 0.7, 1], ['#8a9a4a', '#9c8a4a', '#7a8a3e']]];
    case 'palm': return [[new THREE.CylinderGeometry(0.16, 0.26, 3.4, 7), MAT('#a0794a'), [0, 1.7, 0]], ...[0, 1, 2, 3, 4].map(i => { const lf = new THREE.SphereGeometry(1, 8, 4); lf.scale(0.35, 0.08, 1.4); lf.translate(0, 0, 1.2); lf.rotateX(0.35); lf.rotateY(i * Math.PI * 2 / 5); return [lf, MAT('#4caf50', { flat: true }), [0, 3.4, 0], [1, 1, 1], ['#4caf50', '#5cb85c']]; })];
    case 'drygrass': return [[new THREE.ConeGeometry(0.1, 0.4, 3), MAT('#c9a45a', { flat: true }), [0, 0.18, 0], [1, 1, 1], ['#c9a45a', '#b8934a', '#d8b46a']]];
    case 'bones': return [[new THREE.CapsuleGeometry(0.06, 0.5, 2, 6), MAT('#f4ecd8'), [0, 0.07, 0], [1, 1, 1]]];
    case 'snowpine': return [[new THREE.CylinderGeometry(0.18, 0.25, 1.2, 6), MAT('#6b4a2a'), [0, 0.6, 0]], [new THREE.ConeGeometry(1.35, 1.9, 8), MAT('#2e6b4f', { flat: true }), [0, 1.8, 0], [1, 1, 1], ['#2e6b4f', '#2b5e46']], [new THREE.ConeGeometry(1.15, 0.7, 8), MAT('#ffffff', { flat: true }), [0, 2.3, 0]], [new THREE.ConeGeometry(0.95, 1.5, 8), MAT('#357f5a', { flat: true }), [0, 2.9, 0]], [new THREE.ConeGeometry(0.62, 0.6, 8), MAT('#ffffff', { flat: true }), [0, 3.45, 0]]];
    case 'snowman': return [[new THREE.SphereGeometry(0.75, 14, 10), MAT('#ffffff'), [0, 0.65, 0]], [new THREE.SphereGeometry(0.52, 14, 10), MAT('#ffffff'), [0, 1.65, 0]], [new THREE.SphereGeometry(0.36, 12, 10), MAT('#ffffff'), [0, 2.4, 0]], [new THREE.ConeGeometry(0.08, 0.4, 8), MAT('#ff8c42'), [0, 2.4, 0.45], [1, 1, 1]], [new THREE.CylinderGeometry(0.3, 0.3, 0.4, 12), MAT('#2b2d42'), [0, 2.85, 0]], [new THREE.TorusGeometry(0.5, 0.09, 6, 20), MAT('#e63946'), [0, 1.95, 0], [1, 1, 0.6], ['#e63946', '#3a86ff', '#7bd389']]];
    case 'iceblock': return [[new THREE.BoxGeometry(1.2, 1.2, 1.2), new THREE.MeshPhysicalMaterial({ color: '#bfe8ff', roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.8 }), [0, 0.55, 0], [1, 1, 1]]];
    case 'snowrock': return [[new THREE.DodecahedronGeometry(0.9, 0), MAT('#8fa3b5', { flat: true }), [0, 0.4, 0], [1.2, 0.75, 1]], [new THREE.DodecahedronGeometry(0.7, 0), MAT('#ffffff', { flat: true }), [0, 0.75, 0], [1.3, 0.35, 1.1]]];
    case 'snowball': return [[new THREE.SphereGeometry(0.2, 8, 6), MAT('#ffffff'), [0, 0.08, 0], [1.3, 0.6, 1]]];
    case 'icecrystal': return [[new THREE.OctahedronGeometry(0.22), new THREE.MeshPhysicalMaterial({ color: '#cff1ff', roughness: 0.05, clearcoat: 1, emissive: '#4cc9f0', emissiveIntensity: 0.2 }), [0, 0.2, 0], [0.6, 1.4, 0.6]]];
    case 'volcano': return [[new THREE.ConeGeometry(5, 6, 10, 1, true), MAT('#3b2f2b', { flat: true }), [0, 3, 0]], [new THREE.CircleGeometry(1.6, 12), MAT('#ff6a00', { emissive: '#ff3d00', ei: 2 }), [0, 5.9, 0], [1, 1, 1]]].map((p, i) => { if (i === 1) p[0].rotateX(-Math.PI / 2); return p; });
    case 'obsidian': return [[new THREE.ConeGeometry(0.45, 2.4, 5), new THREE.MeshStandardMaterial({ color: '#1b1418', roughness: 0.15, metalness: 0.3, flatShading: true }), [0, 1.1, 0], [1, 1, 1]], [new THREE.ConeGeometry(0.35, 1.6, 5), new THREE.MeshStandardMaterial({ color: '#2a1f26', roughness: 0.15, flatShading: true }), [0.5, 0.7, 0.2], [1, 1, 1]]];
    case 'lavarock': return [[new THREE.DodecahedronGeometry(0.9, 0), MAT('#3a2e2a', { flat: true, rough: 0.95 }), [0, 0.4, 0], [1.2, 0.75, 1]], [new THREE.IcosahedronGeometry(0.2, 0), MAT('#ff6a00', { emissive: '#ff3d00', ei: 1.5 }), [0.3, 0.75, 0.3], [1, 1, 1]]];
    case 'deadtree': return [[new THREE.CylinderGeometry(0.16, 0.3, 2.6, 6), MAT('#4a3a30', { flat: true }), [0, 1.3, 0]], [new THREE.CylinderGeometry(0.06, 0.12, 1.3, 5), MAT('#4a3a30'), [0.5, 2.1, 0], [1, 1, 1]], [new THREE.CylinderGeometry(0.05, 0.1, 1.1, 5), MAT('#4a3a30'), [-0.45, 1.8, 0.2], [1, 1, 1]]].map((p, i) => { if (i === 1) p[0].rotateZ(-0.7); if (i === 2) p[0].rotateZ(0.8); return p; });
    case 'glowshroom': return [[new THREE.CylinderGeometry(0.2, 0.28, 1.4, 8), MAT('#e9e3f5'), [0, 0.7, 0]], [new THREE.SphereGeometry(0.9, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), MAT('#7df9ff', { emissive: '#4cc9f0', ei: 0.9 }), [0, 1.35, 0], [1, 0.8, 1], ['#7df9ff', '#c77dff', '#5bd16b']]];
    case 'swampbush': return [[new THREE.IcosahedronGeometry(0.85, 1), MAT('#3a5a3f', { flat: true }), [0, 0.5, 0], [1.2, 0.8, 1], ['#3a5a3f', '#2f4a35', '#4a6b4f']]];
    case 'stump': return [[new THREE.CylinderGeometry(0.5, 0.6, 0.7, 10), MAT('#5a4636', { flat: true }), [0, 0.35, 0]], [new THREE.CylinderGeometry(0.45, 0.45, 0.04, 10), MAT('#c8a882'), [0, 0.71, 0]]];
    case 'reed': return [[new THREE.CylinderGeometry(0.02, 0.03, 0.9, 4), MAT('#6b8a4a'), [0, 0.45, 0]], [new THREE.CapsuleGeometry(0.05, 0.18, 2, 6), MAT('#6b4a2a'), [0, 0.9, 0]]];
    case 'minishroom': return [[new THREE.CylinderGeometry(0.05, 0.06, 0.22, 6), MAT('#f1e3c8'), [0, 0.11, 0]], [new THREE.SphereGeometry(0.14, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), MAT('#7df9ff', { emissive: '#4cc9f0', ei: 0.8 }), [0, 0.2, 0], [1, 1, 1], ['#7df9ff', '#c77dff', '#d8ff7a']]];
    case 'ember': return [[new THREE.IcosahedronGeometry(0.1, 0), MAT('#ff8c42', { emissive: '#ff5a00', ei: 1.6 }), [0, 0.05, 0]]];
    case 'ash': return [[new THREE.DodecahedronGeometry(0.14, 0), MAT('#5a504c', { flat: true }), [0, 0.04, 0], [1.3, 0.5, 1]]];
  }
  return [];
}
class Decor {
  constructor(root, R) { this.root = root; this.R = R; this.items = {}; this.anim = []; }
  add(kind, pos, scale) { (this.items[kind] = this.items[kind] || []).push({ pos, scale, rot: this.R() * Math.PI * 2, tilt: (this.R() - 0.5) * 0.12, ci: Math.floor(this.R() * 100) }); }
  finish() {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color(), o = new THREE.Vector3(), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (const [kind, list] of Object.entries(this.items)) {
      const small = ['flower', 'tuft', 'pebble', 'sprinkle', 'drygrass', 'candyball', 'bones', 'snowball', 'icecrystal', 'ember', 'ash', 'reed', 'minishroom'].includes(kind);
      for (const [geo, mat, off, sc = [1, 1, 1], cols] of partsFor(kind)) {
        const im = new THREE.InstancedMesh(geo, mat, list.length);
        list.forEach((it, i) => {
          q.setFromEuler(e.set(it.tilt, it.rot, it.tilt * 0.5));
          o.set(off[0], off[1], off[2]).multiplyScalar(it.scale).applyQuaternion(q);
          p.set(it.pos[0] + o.x, it.pos[1] + o.y, it.pos[2] + o.z);
          s.set(sc[0], sc[1], sc[2]).multiplyScalar(it.scale);
          m4.compose(p, q, s); im.setMatrixAt(i, m4);
          if (cols) im.setColorAt(i, c.set(cols[it.ci % cols.length]));
        });
        im.castShadow = !small; im.receiveShadow = true;
        this.root.add(im);
      }
    }
  }
}

// ---------- entrance gate and the exit house ----------
function entranceGate(theme, T) {
  const g = new THREE.Group();
  const post = theme === 'candy' ? new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.3, clearcoat: 0.8 }) : MAT(theme === 'dunes' ? '#c8743f' : '#8d6e63', { flat: true });
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 4.2, 10), post); p.position.set(3 * s, 2.1, 0); g.add(p);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 10), PHYS(theme === 'candy' ? '#ff4d6d' : '#ffd23f')); cap.position.set(3 * s, 4.4, 0); g.add(cap);
  }
  const arch = new THREE.Mesh(new THREE.TorusGeometry(3, 0.4, 10, 30, Math.PI), PHYS(theme === 'candy' ? '#7bd389' : theme === 'dunes' ? '#e0a06a' : '#ff8c42')); arch.position.y = 4.2; g.add(arch);
  // a bunch of balloons tied to the arch
  ['#ff4d5e', '#3a8bff', '#36c46b', '#ffd23f', '#9b5de5'].forEach((c, i) => {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.15, clearcoat: 1 }));
    b.scale.y = 1.2; b.position.set(-2 + i, 7.6 + Math.sin(i * 2) * 0.4, (i % 2 - 0.5) * 0.6); g.add(b);
    const str = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 4), MAT('#ffffff')); str.position.set(-1 + i * 0.5, 6.6, 0); str.rotation.z = (2 - i) * 0.25; g.add(str);
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.9), new THREE.MeshStandardMaterial({ map: canvasTex(256, 64, (gg, w, h) => { gg.fillStyle = '#2a1546'; gg.fillRect(0, 0, w, h); gg.fillStyle = '#ffd23f'; gg.font = 'bold 34px Lilita One, sans-serif'; gg.textAlign = 'center'; gg.fillText('BALLOONS!', w / 2, 45); }), side: THREE.DoubleSide }));
  sign.position.set(0, 5.3, 0.45); g.add(sign);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
function exitHouse(theme, T) {
  const g = new THREE.Group();
  const wall = theme === 'candy' ? MAT('#e0a96d') : theme === 'dunes' ? MAT('#e6c08a') : MAT('#fff1d6');
  const body = new THREE.Mesh(new THREE.BoxGeometry(5, 3.2, 4), wall); body.position.y = 1.6; g.add(body);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(4, 2.4, 4), PHYS(theme === 'candy' ? '#ff7ac8' : theme === 'dunes' ? '#c8743f' : '#ff4d6d')); roof.position.y = 4.4; roof.rotation.y = Math.PI / 4; g.add(roof);
  const door = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.4, 0.2), MAT('#5a3a22')); door.position.set(0, 1.2, -2.02); g.add(door);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), PHYS('#ffd23f')); knob.position.set(0.7, 1.2, -2.15); g.add(knob);
  for (const s of [-1, 1]) { const win = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.9, 0.9), MAT('#bfe8ff', { emissive: '#3a86ff', ei: 0.2 })); win.position.set(2.52 * s, 2, 0); g.add(win); }
  const chim = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.4, 0.6), MAT('#a9a39b')); chim.position.set(1.2, 5, 0.6); g.add(chim);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.6), new THREE.MeshStandardMaterial({ color: '#ffd23f', side: THREE.DoubleSide })); flag.position.set(0.5, 6.6, 0); g.add(flag);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2, 6), MAT('#6c757d')); pole.position.set(0, 6.1, 0); g.add(pole);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
