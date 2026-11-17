// The disasters. Every one is built from a seed and the time since it started, so every player in a party
// sees the same meteors, the same tornado path and the same waves. Only lightning that hunts players is
// picked by the party leader and sent to everyone (with a warning long enough for the message to arrive).
//
// A disaster can: raise the water (flood, tsunami) or the lava (volcano), push beans (wind, tornado,
// waves), drop things on them (meteors, lava bombs, debris, lightning), make it cold (blizzard) or burn
// anyone outside (acid rain). Damage only ever happens to beans this computer is in charge of.
import { THREE, M, canvasTex, clamp, lerp, smooth, rng, wave } from './engine.js';
import { SEA, LAND, heightAt, HILL } from './map.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), DOWN = new THREE.Vector3(0, -1, 0);

export const DISASTERS = [
  { id: 'flood', name: 'FLOOD', tip: 'Get up high! The water is rising.', mood: 'rain', icon: 'flood' },
  { id: 'tsunami', name: 'TSUNAMI', tip: 'Giant waves are coming. Climb up somewhere tall!', mood: 'rain', icon: 'tsunami' },
  { id: 'tornado', name: 'TORNADO', tip: 'Stay away from the twister, or hide inside!', mood: 'storm', icon: 'tornado' },
  { id: 'meteor', name: 'METEOR SHOWER', tip: 'Watch for the red circles. Hide under a roof!', mood: 'meteor', icon: 'meteor' },
  { id: 'quake', name: 'EARTHQUAKE', tip: 'Keep your balance and watch for falling stuff!', mood: 'dust', icon: 'quake' },
  { id: 'volcano', name: 'VOLCANO', tip: 'Lava is coming! Get up high and dodge the fireballs.', mood: 'volcano', icon: 'volcano' },
  { id: 'lightning', name: 'LIGHTNING STORM', tip: 'Lightning loves tall places. Hide under a roof!', mood: 'storm', icon: 'lightning' },
  { id: 'blizzard', name: 'BLIZZARD', tip: 'Stay warm by a campfire or inside a house!', mood: 'snow', icon: 'blizzard' },
  { id: 'acid', name: 'ACID RAIN', tip: 'The rain burns! Get under a roof, fast!', mood: 'acid', icon: 'acid' }
];
export const DIS = Object.fromEntries(DISASTERS.map(d => [d.id, d]));
export const DURATION = 60;

// ================= the shared stage: water, lava, rain, snow, warning circles, marks =================
export class Env {
  constructor(scene, map, fx, audio, quality) {
    this.scene = scene; this.map = map; this.fx = fx; this.audio = audio; this.q = quality;
    this.ultra = quality === 'ultra';
    this.waterLevel = SEA; this.lavaLevel = -10; this.shake = 0;
    // the sea (it rises during a flood)
    const wt = canvasTex(256, 256, (g, W) => {
      g.fillStyle = '#2f8fd0'; g.fillRect(0, 0, W, W);
      for (let i = 0; i < 70; i++) { g.strokeStyle = `rgba(255,255,255,${0.12 + Math.random() * 0.18})`; g.lineWidth = 2 + Math.random() * 2; const y = Math.random() * W, x = Math.random() * W; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 15, y - 6, x + 30, y); g.stroke(); }
    }, [140, 140]);
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshStandardMaterial({ color: '#7fd0ff', map: wt, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.8, depthWrite: false }));
    this.water.rotation.x = -Math.PI / 2; this.water.position.y = SEA; this.water.renderOrder = 2; scene.add(this.water);
    const lt = canvasTex(256, 256, (g, W) => {
      g.fillStyle = '#d62800'; g.fillRect(0, 0, W, W);
      for (let i = 0; i < 90; i++) { g.strokeStyle = i % 3 ? '#ff7b00' : '#ffe066'; g.lineWidth = 2 + Math.random() * 7; g.globalAlpha = 0.7; g.beginPath(); const x = Math.random() * W, y = Math.random() * W; g.moveTo(x, y); for (let k = 0; k < 4; k++) g.lineTo(x + (Math.random() - 0.5) * 90, y + (Math.random() - 0.5) * 90); g.stroke(); }
      g.globalAlpha = 1; for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(40,10,0,.5)'; g.beginPath(); g.arc(Math.random() * W, Math.random() * W, 6 + Math.random() * 16, 0, 7); g.fill(); }
    }, [90, 90]);
    this.lava = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshStandardMaterial({ color: '#ffffff', map: lt, emissive: '#ff4400', emissiveMap: lt, emissiveIntensity: 1.1, roughness: 0.6 }));
    this.lava.rotation.x = -Math.PI / 2; this.lava.visible = false; scene.add(this.lava);
    // rain (lines) and snow (dots) around the camera
    const RN = this.ultra ? 450 : quality === 'low' ? 900 : 1600;
    const rg = new THREE.BufferGeometry(); this.rainPos = new Float32Array(RN * 6); this.rainSeed = new Float32Array(RN * 3);
    for (let i = 0; i < RN; i++) { this.rainSeed[i * 3] = (Math.random() - 0.5) * 70; this.rainSeed[i * 3 + 1] = Math.random() * 40; this.rainSeed[i * 3 + 2] = (Math.random() - 0.5) * 70; }
    rg.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: '#cfe3ff', transparent: true, opacity: 0.45, depthWrite: false }));
    this.rain.frustumCulled = false; this.rain.visible = false; scene.add(this.rain);
    this.rainN = RN; this.rainOn = 0; this.rainColor = new THREE.Color('#cfe3ff'); this.rainSpeed = 38;
    const SN = this.ultra ? 700 : 1800;
    const sg = new THREE.BufferGeometry(); this.snowPos = new Float32Array(SN * 3); this.snowSeed = new Float32Array(SN * 3);
    for (let i = 0; i < SN; i++) { this.snowSeed[i * 3] = (Math.random() - 0.5) * 60; this.snowSeed[i * 3 + 1] = Math.random() * 30; this.snowSeed[i * 3 + 2] = (Math.random() - 0.5) * 60; }
    sg.setAttribute('position', new THREE.BufferAttribute(this.snowPos, 3));
    this.snow = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 0.22, transparent: true, opacity: 0.95, depthWrite: false }));
    this.snow.frustumCulled = false; this.snow.visible = false; scene.add(this.snow);
    this.snowN = SN; this.snowOn = 0; this.wind = new THREE.Vector3();
    // warning circles and marks on the ground
    this.ringGeo = new THREE.RingGeometry(0.82, 1, 40); this.ringGeo.rotateX(-Math.PI / 2);
    this.warns = []; this.marks = []; this.waves = [];
    this.markTex = {
      crater: canvasTex(128, 128, (g, W) => { const gr = g.createRadialGradient(W / 2, W / 2, 4, W / 2, W / 2, W / 2); gr.addColorStop(0, 'rgba(20,12,8,.95)'); gr.addColorStop(0.6, 'rgba(50,30,20,.75)'); gr.addColorStop(1, 'rgba(50,30,20,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, W); }),
      acid: canvasTex(128, 128, (g, W) => { const gr = g.createRadialGradient(W / 2, W / 2, 4, W / 2, W / 2, W / 2); gr.addColorStop(0, 'rgba(150,255,60,.8)'); gr.addColorStop(0.7, 'rgba(110,220,40,.55)'); gr.addColorStop(1, 'rgba(110,220,40,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, W); }),
      crack: canvasTex(128, 128, (g, W) => { g.strokeStyle = 'rgba(30,20,12,.85)'; g.lineWidth = 4; g.lineCap = 'round'; for (let k = 0; k < 3; k++) { g.beginPath(); let x = W / 2, y = W / 2; g.moveTo(x, y); const a = Math.random() * 7; for (let i = 0; i < 6; i++) { x += Math.cos(a + (Math.random() - 0.5) * 1.4) * 11; y += Math.sin(a + (Math.random() - 0.5) * 1.4) * 11; g.lineTo(x, y); } g.stroke(); } }),
      fire: canvasTex(128, 128, (g, W) => { const gr = g.createRadialGradient(W / 2, W / 2, 4, W / 2, W / 2, W / 2); gr.addColorStop(0, 'rgba(255,220,90,.95)'); gr.addColorStop(0.5, 'rgba(255,90,0,.8)'); gr.addColorStop(1, 'rgba(120,20,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, W); })
    };
    for (const t of Object.values(this.markTex)) t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    this.markGeo = new THREE.PlaneGeometry(1, 1); this.markGeo.rotateX(-Math.PI / 2);
    this.groundSnow = 0;
  }
  // a pulsing red (or other colour) circle where something is about to land
  warn(x, y, z, r, until, color = '#ff2a2a') {
    const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.position.set(x, y + 0.09, z); m.scale.setScalar(r); m.renderOrder = 3; this.scene.add(m);
    const fill = new THREE.Mesh(new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    fill.position.copy(m.position); fill.scale.setScalar(0.01); fill.renderOrder = 3; this.scene.add(fill);
    const w = { m, fill, r, until, from: null };
    this.warns.push(w); return w;
  }
  mark(kind, x, y, z, r, life = 25) {
    if (this.marks.length > 70) { const o = this.marks.shift(); o.m.removeFromParent(); o.m.material.dispose(); }
    const m = new THREE.Mesh(this.markGeo, new THREE.MeshBasicMaterial({ map: this.markTex[kind], transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
    m.position.set(x, y + 0.05, z); m.scale.set(r * 2, 1, r * 2); m.rotation.y = Math.random() * 6; m.renderOrder = 1; this.scene.add(m);
    this.marks.push({ m, life, max: life, kind }); return m;
  }
  // an expanding ring in the air (explosions)
  shock(p, color, r, life = 0.5) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.15, 6, 32), new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false }));
    m.rotation.x = Math.PI / 2; m.position.copy(p); this.scene.add(m);
    this.waves.push({ m, r, life, max: life });
  }
  boom(p, r, color = '#ff7b00', smoke = '#5a4a40') {
    const fx = this.fx, n = this.ultra ? 14 : 30;
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = 3 + Math.random() * r * 2; fx.emit({ p: _v.copy(p).add(_w.set(0, 0.5, 0)), v: new THREE.Vector3(Math.cos(a) * s, 4 + Math.random() * 9, Math.sin(a) * s), life: 0.5 + Math.random() * 0.5, size: 0.35 + Math.random() * 0.4, color: i % 3 === 0 ? '#ffe066' : color, g: -14 }); }
    for (let i = 0; i < n / 2; i++) { const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 3; fx.emit({ p: _v.copy(p).add(_w.set(0, 1, 0)), v: new THREE.Vector3(Math.cos(a) * s, 2 + Math.random() * 4, Math.sin(a) * s), life: 1.4 + Math.random(), size: 0.8 + Math.random() * 0.6, color: smoke, g: 1, drag: 1.2 }); }
    this.shock(_v.copy(p).add(_w.set(0, 0.4, 0)), color, r * 1.6, 0.45);
  }
  setRain(on, color = '#cfe3ff', speed = 38) { this.rainOn = on; this.rainColor.set(color); this.rainSpeed = speed; }
  update(dt, t, focus) {
    // water and lava
    this.water.position.y = this.waterLevel; this.water.material.map.offset.x += dt * 0.004; this.water.material.map.offset.y += dt * 0.006;
    this.lava.visible = this.lavaLevel > -5; this.lava.position.y = this.lavaLevel; this.lava.material.map.offset.x += dt * 0.006; this.lava.material.emissiveIntensity = 1 + Math.sin(t * 3) * 0.15;
    this.water.visible = !(this.lava.visible && this.lavaLevel > this.waterLevel + 0.1);
    // rain
    const rm = this.rain.material;
    rm.opacity = lerp(rm.opacity, this.rainOn ? 0.5 : 0, 1 - Math.exp(-2 * dt)); rm.color.lerp(this.rainColor, 1 - Math.exp(-3 * dt));
    this.rain.visible = rm.opacity > 0.02;
    if (this.rain.visible) {
      const P = this.rainPos, S = this.rainSeed, sp = this.rainSpeed, wx = this.wind.x * 0.06, wz = this.wind.z * 0.06;
      for (let i = 0; i < this.rainN; i++) {
        let y = (S[i * 3 + 1] - t * sp) % 40; if (y < 0) y += 40;
        const x = focus.x + ((S[i * 3] - focus.x * 0.0 + 1e4) % 70) - 35, z = focus.z + ((S[i * 3 + 2] + 1e4) % 70) - 35, yy = focus.y - 12 + y;
        P[i * 6] = x; P[i * 6 + 1] = yy; P[i * 6 + 2] = z; P[i * 6 + 3] = x - wx * 0.5; P[i * 6 + 4] = yy + 0.9; P[i * 6 + 5] = z - wz * 0.5;
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }
    // snow
    const sm = this.snow.material;
    sm.opacity = lerp(sm.opacity, this.snowOn ? 0.95 : 0, 1 - Math.exp(-2 * dt)); this.snow.visible = sm.opacity > 0.02;
    if (this.snow.visible) {
      const P = this.snowPos, S = this.snowSeed;
      for (let i = 0; i < this.snowN; i++) {
        let y = (S[i * 3 + 1] - t * 3.2) % 30; if (y < 0) y += 30;
        const drift = (30 - y) * 0.35;
        let x = (S[i * 3] + this.wind.x * 0.25 * drift + Math.sin(t + i) * 0.4) % 60, z = (S[i * 3 + 2] + this.wind.z * 0.25 * drift) % 60;
        if (x < -30) x += 60; if (x > 30) x -= 60; if (z < -30) z += 60; if (z > 30) z -= 60;
        P[i * 3] = focus.x + x; P[i * 3 + 1] = focus.y - 8 + y; P[i * 3 + 2] = focus.z + z;
      }
      this.snow.geometry.attributes.position.needsUpdate = true;
    }
    // snow on the ground
    const gm = this.map.groundMesh.material, target = this.snowOn ? 1 : 0;
    this.groundSnow = lerp(this.groundSnow, target, 1 - Math.exp(-dt * (target ? 0.08 : 0.5)));
    gm.emissive.setRGB(0.55 * this.groundSnow, 0.6 * this.groundSnow, 0.68 * this.groundSnow); gm.color.setScalar(1 - this.groundSnow * 0.45);
    // warning circles
    const dt2 = this.disT ?? t;
    for (let i = this.warns.length - 1; i >= 0; i--) {
      const w = this.warns[i];
      if (dt2 >= w.until) { w.m.removeFromParent(); w.m.material.dispose(); w.fill.removeFromParent(); w.fill.geometry.dispose(); w.fill.material.dispose(); this.warns.splice(i, 1); continue; }
      if (w.from === null) w.from = dt2;
      const k = clamp((dt2 - w.from) / Math.max(0.01, w.until - w.from), 0, 1);
      w.m.material.opacity = 0.5 + Math.sin(t * 18) * 0.3; w.fill.scale.setScalar(Math.max(0.01, w.r * k)); w.fill.material.opacity = 0.15 + k * 0.2;
    }
    for (let i = this.marks.length - 1; i >= 0; i--) {
      const m = this.marks[i]; m.life -= dt;
      m.m.material.opacity = clamp(m.life / Math.min(4, m.max), 0, 1);
      if (m.life <= 0) { m.m.removeFromParent(); m.m.material.dispose(); this.marks.splice(i, 1); }
    }
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i]; w.life -= dt; const k = 1 - w.life / w.max;
      w.m.scale.setScalar(0.5 + k * w.r); w.m.material.opacity = 1 - k;
      if (w.life <= 0) { w.m.removeFromParent(); w.m.geometry.dispose(); w.m.material.dispose(); this.waves.splice(i, 1); }
    }
    this.shake = Math.max(0, this.shake - dt * 1.5);
  }
  // back to a sunny day
  clear() {
    this.waterLevel = SEA; this.lavaLevel = -10; this.rainOn = 0; this.snowOn = 0; this.wind.set(0, 0, 0);
    for (const w of this.warns) { w.m.removeFromParent(); w.fill.removeFromParent(); } this.warns = [];
    for (const m of this.marks) { m.life = Math.min(m.life, 3); m.max = 3; }
  }
}

// ================= the disasters =================
// Each one: start(), update(dt, t), affect(body, dt, t) for beans this computer runs, end().
// water(t) / lava(t) give the level, waterAt(x, z) for waves, onEvent(e) for events from the leader.
class Base {
  constructor(ctx, seed) { this.ctx = ctx; this.env = ctx.env; this.seed = seed; this.r = rng(seed); this.group = new THREE.Group(); ctx.scene.add(this.group); this.done = 0; this.events = []; this.evI = 0; this.hitOnce = new Map(); }
  start() {} update() {} affect() {} onEvent() {}
  water() { return SEA; } lava() { return -10; } waterAt() { return null; }
  end() { this.group.removeFromParent(); this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
  // the first surface straight below (x, z): roofs count, the lobby does not
  surfaceY(x, z) { const h = this.ctx.world.raycast(_v.set(x, 150, z), DOWN, 200, c => c.tag !== 'lobby'); return h ? 150 - h.t : heightAt(x, z); }
  // a random spot on the island; sometimes right on top of a popular place
  randomSpot(r, popular = 0.3) {
    const spots = this.ctx.map.spots;
    if (r() < popular) { const list = [...spots.high, ...spots.shelter]; const s = list[Math.floor(r() * list.length)].top; return [s.x + (r() - 0.5) * 10, s.z + (r() - 0.5) * 10]; }
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 70; return [Math.cos(a) * d, Math.sin(a) * d];
  }
  // hurt beans near p (a blast); sheltered beans under a roof are safe from things that hit the roof
  blast(p, R, dmg, push, kind, extra) {
    for (const b of this.ctx.localBodies()) {
      const c = _w.copy(b.mover.pos); c.y += 0.7;
      const d = c.distanceTo(p); if (d > R) continue;
      if (b.sheltered && p.y > b.mover.pos.y + 1.8) continue;
      const k = 1 - d / R;
      b.hurt(Math.round(dmg * (0.35 + 0.65 * k)), kind);
      const dx = c.x - p.x, dz = c.z - p.z;
      b.mover.knock(dx || 0.01, dz, push * (0.5 + k * 0.5), 6 + 6 * k, 0.6 + k * 0.6);
      if (extra) extra(b, k);
    }
    // the camera shakes when it is close
    const cd = this.ctx.camPos().distanceTo(p); this.env.shake = Math.max(this.env.shake, clamp(1.2 - cd / 60, 0, 1) * (R / 6));
  }
}

// ---------- FLOOD ----------
class Flood extends Base {
  start() {
    this.env.setRain(1);
    this.top = LAND + 7.6 + this.r() * 0.6;
    // crates that float on the water
    this.crates = [];
    const geo = new THREE.BoxGeometry(1.2, 1.2, 1.2);
    for (let i = 0; i < 14; i++) { const m = new THREE.Mesh(geo, M('#a0673a')); const a = this.r() * 6.28, d = 10 + this.r() * 55; m.position.set(Math.cos(a) * d, 0, Math.sin(a) * d); m.userData.ph = this.r() * 6; this.group.add(m); this.crates.push(m); }
  }
  water(t) { return SEA + (this.top - SEA) * smooth(4, 42, t); }
  update(dt, t) {
    const w = this.water(t);
    for (const c of this.crates) { const g = heightAt(c.position.x, c.position.z); c.visible = w > g + 0.3; c.position.y = Math.max(g + 0.6, w + Math.sin(t * 1.6 + c.userData.ph) * 0.15); c.rotation.y += dt * 0.1; c.position.x += Math.sin(t * 0.2 + c.userData.ph) * dt * 0.4; }
    if (Math.random() < dt * 4) { const p = this.ctx.camPos(); this.ctx.fx.emit({ p: _v.set(p.x + (Math.random() - 0.5) * 30, w + 0.05, p.z + (Math.random() - 0.5) * 30), v: new THREE.Vector3(0, 0.5, 0), life: 0.8, size: 0.2, color: '#e6f6ff', g: 0 }); }
  }
}

// ---------- TSUNAMI ----------
class Tsunami extends Base {
  start() {
    this.env.setRain(0.7);
    const base = this.r() * Math.PI * 2;
    this.waveList = [8, 24, 40].map((at, i) => { const a = base + (this.r() - 0.5) * 0.9; return { at, dx: Math.cos(a), dz: Math.sin(a), H: 10 + this.r() * 1.5 + i * 0.5, i }; });
    this.speed = 20; this.from = -160;
    // the wave: a long curved wall of water with white foam on top
    const W = 360, D = 34, gx = 90, gz = 24;
    const geo = new THREE.PlaneGeometry(W, D, gx, gz); geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const across = pos.getX(i), dd = pos.getZ(i) - 12;           // dd: -29 (back) .. +5 (front), 0 = the crest
      const p = profile(dd), bend = 1 - Math.pow(Math.abs(across) / (W / 2), 3) * 0.25;
      pos.setY(i, p * bend);
      pos.setZ(i, dd - Math.pow(across / (W / 2), 2) * 18 + (p > 0.85 ? (p - 0.85) * 18 : 0));
      const foam = smooth(0.78, 0.98, p);
      col[i * 3] = lerp(0.12, 1, foam); col[i * 3 + 1] = lerp(0.5, 1, foam); col[i * 3 + 2] = lerp(0.75, 1, foam);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
    this.waveGeo = geo; this.H0 = 1;
    this.meshes = this.waveList.map(w => {
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, metalness: 0.05, transparent: true, opacity: 0.88, side: THREE.DoubleSide }));
      m.scale.y = w.H; m.rotation.y = Math.atan2(w.dx, w.dz); m.visible = false; this.group.add(m); return m;
    });
    this.baseExtra = 0;
  }
  waveS(w, t) { return this.from + (t - w.at) * this.speed; }
  water(t) {
    // after each wave a little water stays on the land; it drains at the end
    let n = 0; for (const w of this.waveList) if (this.waveS(w, t) > 60) n++;
    return SEA + Math.min(3.2, n * 1.15) * (1 - smooth(52, 59, t));
  }
  waterAt(x, z, t) {
    let best = null;
    for (const w of this.waveList) {
      if (t < w.at) continue;
      const s = x * w.dx + z * w.dz, across = -x * w.dz + z * w.dx, ws = this.waveS(w, t) - (across / 180) ** 2 * 18;
      const p = profile(s - ws); if (p <= 0) continue;
      const y = SEA + w.H * p; if (best === null || y > best) best = y;
    }
    return best;
  }
  update(dt, t) {
    this.waveList.forEach((w, i) => {
      const m = this.meshes[i], s = this.waveS(w, t);
      m.visible = t >= w.at - 1 && s < 200;
      m.position.set(w.dx * s, SEA - 0.4, w.dz * s);
      if (m.visible && t >= w.at && !w.warned) { w.warned = true; this.ctx.announce('A GIANT WAVE IS COMING!'); this.ctx.audio.sfx('wave'); }
      // spray along the crest near the camera
      if (m.visible && Math.random() < dt * 30) {
        const cp = this.ctx.camPos(), across = -cp.x * w.dz + cp.z * w.dx + (Math.random() - 0.5) * 80;
        this.ctx.fx.emit({ p: _v.set(w.dx * (s + 2) - w.dz * across, SEA + w.H - 0.5, w.dz * (s + 2) + w.dx * across), v: new THREE.Vector3(w.dx * 8 + (Math.random() - 0.5) * 3, 3 + Math.random() * 4, w.dz * 8 + (Math.random() - 0.5) * 3), life: 1, size: 0.5, color: '#ffffff', g: -8 });
      }
      const cd = Math.abs(this.ctx.camPos().x * w.dx + this.ctx.camPos().z * w.dz - s);
      if (m.visible && cd < 40) this.env.shake = Math.max(this.env.shake, (1 - cd / 40) * 0.5);
    });
  }
  affect(b, dt, t) {
    const p = b.mover.pos;
    for (const w of this.waveList) {
      if (t < w.at) continue;
      const s = p.x * w.dx + p.z * w.dz, across = -p.x * w.dz + p.z * w.dx, ws = this.waveS(w, t) - (across / 180) ** 2 * 18, k = profile(s - ws);
      if (k <= 0.05 || p.y > SEA + w.H * k + 0.3) continue;
      // inside the wave: carried along with it
      b.mover.ext.x += w.dx * 60 * k; b.mover.ext.z += w.dz * 60 * k;
      const key = b.id + ':' + w.i;
      if (!this.hitOnce.has(key) && k > 0.4) { this.hitOnce.set(key, 1); b.hurt(24, 'wave'); b.mover.knock(w.dx, w.dz, 18, 9, 1.4); }
    }
  }
}
// the wave's shape seen from the side: d = distance in front of the crest (+ = in front)
function profile(d) { if (d > 5 || d < -30) return 0; if (d >= 0) return Math.cos(d / 5 * Math.PI / 2) ** 0.6; return Math.pow(1 + d / 30, 1.6); }

// ---------- TORNADO ----------
class Tornado extends Base {
  start() {
    this.env.setRain(0.6);
    const r = this.r;
    this.tw = [0, 1].map(i => ({ at: i ? 26 : 2, ax: 40 + r() * 20, az: 40 + r() * 20, wx: 0.06 + r() * 0.05, wz: 0.07 + r() * 0.05, px: r() * 6, pz: r() * 6, ox: (r() - 0.5) * 20, oz: (r() - 0.5) * 20, pos: new THREE.Vector3() }));
    // the funnel: two spinning see-through layers, wide at the top
    const tex = canvasTex(256, 256, (g, W) => {
      g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(0, 0, W, W);
      for (let i = 0; i < 160; i++) { g.strokeStyle = `rgba(${150 + Math.random() * 60},${150 + Math.random() * 50},${140 + Math.random() * 50},${0.25 + Math.random() * 0.45})`; g.lineWidth = 3 + Math.random() * 10; const x = Math.random() * W, y = Math.random() * W; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 70, y - 22); g.stroke(); }
    }, [3, 2]);
    const pts = []; for (let i = 0; i <= 24; i++) { const y = i / 24 * 70; pts.push(new THREE.Vector2(2.4 + Math.pow(y / 70, 2.2) * 24 + Math.sin(i * 0.9) * 0.4, y)); }
    const geo = new THREE.LatheGeometry(pts, 32);
    this.funnels = this.tw.map(() => {
      const g = new THREE.Group(); g.visible = false; this.group.add(g);
      const a = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#8a8478', map: tex, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, roughness: 1 }));
      const b = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#b8b0a2', map: tex.clone(), transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, roughness: 1 }));
      b.material.map.repeat.set(2, 1); b.scale.set(1.18, 1, 1.18);
      g.add(a, b);
      // flying junk
      const junk = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 0.15, 1.2), M('#7a5230'), 30); junk.frustumCulled = false; g.add(junk);
      const jd = []; for (let i = 0; i < 30; i++) jd.push({ r: 3 + Math.random() * 14, y: Math.random() * 40, sp: 1.5 + Math.random() * 2, a: Math.random() * 6 });
      return { g, a, b, junk, jd };
    });
    this.windLoop = this.ctx.audio.loop('wind', 0);
  }
  posAt(w, t, out) {
    const x = w.ox + Math.sin(t * w.wx + w.px) * w.ax + Math.sin(t * w.wx * 2.3 + w.pz) * 10, z = w.oz + Math.sin(t * w.wz + w.pz) * w.az + Math.cos(t * w.wz * 1.7 + w.px) * 10;
    const d = Math.hypot(x, z), k = d > 66 ? 66 / d : 1;
    return out.set(x * k, heightAt(x * k, z * k), z * k);
  }
  update(dt, t) {
    let near = 0;
    this.tw.forEach((w, i) => {
      const f = this.funnels[i], on = t >= w.at;
      this.posAt(w, t, w.pos); f.g.visible = on;
      if (!on) return;
      const grow = smooth(w.at, w.at + 4, t) * (1 - smooth(57, 60, t));
      f.g.position.copy(w.pos); f.g.scale.set(grow, Math.max(0.01, grow), grow);
      f.a.rotation.y -= dt * 4; f.b.rotation.y -= dt * 2.6; f.a.material.map.offset.y += dt * 0.6;
      const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1);
      f.jd.forEach((j, k) => { j.a += dt * j.sp; j.y = (j.y + dt * 3) % 40; const rr = j.r * (0.6 + j.y / 40); _q.setFromEuler(new THREE.Euler(j.a * 2, j.a, j.a * 1.3)); _m.compose(_v.set(Math.cos(j.a) * rr, j.y, Math.sin(j.a) * rr), _q, _s); f.junk.setMatrixAt(k, _m); });
      f.junk.instanceMatrix.needsUpdate = true;
      if (Math.random() < dt * 20) { const a = Math.random() * 6.28, rr = 4 + Math.random() * 6; this.ctx.fx.emit({ p: _v.set(w.pos.x + Math.cos(a) * rr, w.pos.y + 0.3, w.pos.z + Math.sin(a) * rr), v: new THREE.Vector3(-Math.sin(a) * 9, 2 + Math.random() * 3, Math.cos(a) * 9), life: 1.2, size: 0.7, color: '#a89f8c', g: 2, drag: 0.8 }); }
      const cd = this.ctx.camPos().distanceTo(w.pos); near = Math.max(near, clamp(1 - cd / 90, 0, 1));
      this.env.shake = Math.max(this.env.shake, clamp(1 - cd / 40, 0, 1) * 0.35);
    });
    this.windLoop.set(0.15 + near * 0.85);
  }
  affect(b, dt, t) {
    for (const w of this.tw) {
      if (t < w.at + 1) continue;
      const p = b.mover.pos, dx = p.x - w.pos.x, dz = p.z - w.pos.z, d = Math.hypot(dx, dz) || 0.01, R = 24;
      if (d > R) continue;
      let k = Math.pow(1 - d / R, 1.1);
      if (b.sheltered) k *= 0.2;
      const nx = dx / d, nz = dz / d;
      b.mover.ext.x += (-nx * 34 - nz * 30) * k; b.mover.ext.z += (-nz * 34 + nx * 30) * k;
      if (d < 6.5 && !b.sheltered) {
        b.mover.ext.y += 58; b.mover.stun = Math.max(b.mover.stun, 0.4);
        b.hurt(12 * dt, 'wind', true);
        const ground = heightAt(p.x, p.z);
        if (p.y > ground + 8 + (b.id.length % 4) * 1.5) { b.mover.knock(nx, nz, 24, 10, 1.6); b.mover.vel.y = Math.min(b.mover.vel.y, 13); b.mover.drift.set(0, 0, 0); b.mover.pos.addScaledVector(_v.set(nx, 0, nz), 2.5); this.ctx.audio.sfxAt('whoosh', p); }
      }
    }
  }
  end() { super.end(); this.windLoop.stop(); }
}

// ---------- METEOR SHOWER ----------
class Meteor extends Base {
  start() {
    const r = this.r;
    const da = r() * Math.PI * 2; this.dir = new THREE.Vector3(Math.cos(da) * 0.55, 1, Math.sin(da) * 0.55).normalize();
    let t = 3;
    for (let i = 0; i < 400 && t < 56; i++) {
      t += 1 / lerp(1.0, 3.4, smooth(3, 50, t)) * (0.6 + r() * 0.8);
      const [x, z] = this.randomSpot(r, 0.3), big = i % 7 === 6;
      this.events.push({ t, x, z, big, R: big ? 8 : 4.6, dmg: big ? 60 : 42 });
    }
    this.rocks = [];
    this.geo = new THREE.DodecahedronGeometry(1, 1); this.mat = M('#3a2a24', { emissive: '#ff5a1f', ei: 0.7, flat: true });
  }
  update(dt, t) {
    const WARN = 2.0, FALL = 1.6, SPEED = 75;
    while (this.evI < this.events.length && this.events[this.evI].t - WARN <= t) {
      const e = this.events[this.evI++];
      e.y = this.surfaceY(e.x, e.z);
      this.env.warn(e.x, e.y, e.z, e.R * 0.75, e.t);
      const m = new THREE.Mesh(this.geo, this.mat); m.scale.setScalar(e.big ? 2.2 : 1.2); m.visible = false; this.group.add(m);
      this.rocks.push({ e, m });
    }
    for (let i = this.rocks.length - 1; i >= 0; i--) {
      const { e, m } = this.rocks[i], left = e.t - t;
      if (left <= 0) {
        m.removeFromParent();
        const p = _v.set(e.x, e.y, e.z);
        this.env.boom(p, e.R * 0.6, '#ff7b00', '#3d2f2a');
        this.env.mark('crater', e.x, e.y, e.z, e.R * 0.55, 30);
        this.ctx.audio.sfxAt(e.big ? 'bigboom' : 'boom', p);
        this.blast(p.clone().add(_w.set(0, 0.5, 0)), e.R, e.dmg, 16, 'meteor', (b) => { b.burn(0.5); });
        this.rocks.splice(i, 1); continue;
      }
      if (left < FALL) {
        m.visible = true;
        m.position.set(e.x, e.y, e.z).addScaledVector(this.dir, left * SPEED); m.rotation.x += dt * 5; m.rotation.y += dt * 3;
        if (Math.random() < 0.9) this.ctx.fx.emit({ p: m.position, v: new THREE.Vector3((Math.random() - 0.5) * 2, 2, (Math.random() - 0.5) * 2), life: 0.5, size: e.big ? 1.1 : 0.7, color: Math.random() < 0.5 ? '#ff7b00' : '#ffd23f', g: 0, drag: 2 });
        if (Math.random() < 0.4) this.ctx.fx.emit({ p: m.position, v: new THREE.Vector3(0, 1, 0), life: 1.2, size: 0.9, color: '#4a3c36', g: 0.5, drag: 1 });
      }
    }
  }
}

// ---------- EARTHQUAKE ----------
class Quake extends Base {
  start() {
    const r = this.r;
    this.jolts = []; for (let t = 7; t < 56; t += 6 + r() * 4) this.jolts.push({ t, done: false });
    // falling bits from buildings
    const edges = this.ctx.map.edges;
    let t = 4;
    while (t < 56) {
      t += lerp(1.1, 0.45, smooth(4, 45, t)) * (0.6 + r() * 0.8);
      const e = edges[Math.floor(r() * edges.length)], side = Math.floor(r() * 4), k = r(), out = 0.4 + r() * 3;
      let x, z;
      if (side === 0) { x = lerp(e.x0, e.x1, k); z = e.z0 - out; } else if (side === 1) { x = lerp(e.x0, e.x1, k); z = e.z1 + out; } else if (side === 2) { x = e.x0 - out; z = lerp(e.z0, e.z1, k); } else { x = e.x1 + out; z = lerp(e.z0, e.z1, k); }
      const inside = r() < 0.25;          // the ceiling comes down inside too!
      if (inside) { x = lerp(e.x0 + 1, e.x1 - 1, r()); z = lerp(e.z0 + 1, e.z1 - 1, r()); }
      this.events.push({ t, x, z, inside, from: e.y + 2, size: 0.6 + r() * 0.7 });
    }
    // boulders that roll down the hill
    this.boulders = [10, 19, 28, 37, 46].map(at => { const a = r() * Math.PI * 2; return { at, a, started: false }; });
    this.bm = []; this.debris = [];
    this.rumble = this.ctx.audio.loop('rumble', 0);
    this.geo = new THREE.BoxGeometry(1, 0.6, 1);
    this.crackT = 0;
  }
  level(t) { return smooth(0, 4, t) * (0.55 + 0.45 * Math.max(0, Math.sin(t * 0.8))) * (1 - smooth(57, 60, t)); }
  update(dt, t) {
    const I = this.level(t);
    this.env.shake = Math.max(this.env.shake, I * 0.55);
    this.rumble.set(0.3 + I * 0.7);
    this.crackT -= dt;
    if (this.crackT < 0 && t > 3) { this.crackT = 1.2; const a = Math.random() * 6.28, d = Math.random() * 60, x = Math.cos(a) * d, z = Math.sin(a) * d; this.env.mark('crack', x, heightAt(x, z), z, 2 + Math.random() * 3, 40); }
    for (const j of this.jolts) if (!j.done && t >= j.t) { j.done = true; this.env.shake = 1.2; this.ctx.audio.sfx('jolt'); this.ctx.announce('BIG SHAKE!'); for (const b of this.ctx.localBodies()) if (b.mover.grounded && hashf(b.id, j.t) < 0.65) { b.mover.knock(Math.sin(j.t * 7 + b.id.length), Math.cos(j.t * 5), 6, 6, 0.9); b.hurt(5, 'quake'); } }
    // falling bits
    const WARN = 1.3;
    while (this.evI < this.events.length && this.events[this.evI].t - WARN <= t) {
      const e = this.events[this.evI++];
      e.y = e.inside ? heightAt(e.x, e.z) + 0.02 : this.surfaceY(e.x, e.z);
      if (e.inside) e.from = e.y + 3.2;
      this.env.warn(e.x, e.y, e.z, 1.8, e.t, '#ffb000');
      const m = new THREE.Mesh(this.geo, M(['#b8bcc4', '#d1495b', '#9aa1ab', '#f4e1c1'][this.evI % 4], { flat: true })); m.scale.setScalar(e.size * 1.6); m.position.set(e.x, e.from, e.z); m.rotation.set(Math.random(), Math.random(), Math.random()); this.group.add(m);
      this.debris.push({ e, m, landed: false, life: 6 });
    }
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i], e = d.e;
      if (!d.landed) {
        const k = clamp(1 - (e.t - t) / WARN, 0, 1);
        d.m.position.y = lerp(e.from, e.y + 0.3 * e.size, k * k); d.m.rotation.x += dt * 4;
        if (t >= e.t) { d.landed = true; this.env.boom(_v.set(e.x, e.y, e.z), 1.2, '#c8b89a', '#8a7a68'); this.ctx.audio.sfxAt('crash', _v); this.blast(_v.set(e.x, e.y + 0.6, e.z), 2.4, 28, 8, 'quake'); }
      } else { d.life -= dt; if (d.life < 1) d.m.scale.setScalar(Math.max(0.01, d.life) * e.size * 1.6); if (d.life <= 0) { d.m.removeFromParent(); this.debris.splice(i, 1); } }
    }
    // boulders (moved in fixed steps so every computer rolls them the same way)
    for (const bo of this.boulders) {
      if (!bo.started && t >= bo.at) {
        bo.started = true; bo.p = new THREE.Vector3(HILL.x + Math.cos(bo.a) * 3, 0, HILL.z + Math.sin(bo.a) * 3); bo.p.y = heightAt(bo.p.x, bo.p.z) + 1.4;
        bo.v = new THREE.Vector3(Math.cos(bo.a) * 3, 0, Math.sin(bo.a) * 3); bo.acc = 0; bo.life = 14;
        bo.m = new THREE.Mesh(new THREE.DodecahedronGeometry(1.4, 1), M('#7d6e60', { flat: true })); this.group.add(bo.m);
        this.ctx.announce('ROCKS ARE ROLLING DOWN THE HILL!');
      }
      if (!bo.started || bo.life <= 0) continue;
      bo.acc += dt; bo.life -= dt;
      while (bo.acc > 1 / 60) {
        bo.acc -= 1 / 60; const h = 1 / 60, e2 = 0.5;
        const gx = heightAt(bo.p.x - e2, bo.p.z) - heightAt(bo.p.x + e2, bo.p.z), gz = heightAt(bo.p.x, bo.p.z - e2) - heightAt(bo.p.x, bo.p.z + e2);
        bo.v.x += gx * 14 * h; bo.v.z += gz * 14 * h; bo.v.multiplyScalar(Math.exp(-0.25 * h));
        bo.p.addScaledVector(bo.v, h); bo.p.y = heightAt(bo.p.x, bo.p.z) + 1.4;
      }
      bo.m.position.copy(bo.p); bo.m.rotation.x += bo.v.z * dt * 0.7; bo.m.rotation.z -= bo.v.x * dt * 0.7;
      if (bo.life < 1) bo.m.scale.setScalar(Math.max(0.01, bo.life));
      for (const b of this.ctx.localBodies()) {
        const c = _w.copy(b.mover.pos); c.y += 0.7;
        if (c.distanceTo(bo.p) < 2.1 && !(this.hitOnce.get(b.id) > t)) { this.hitOnce.set(b.id, t + 1); const sp = Math.hypot(bo.v.x, bo.v.z); if (sp > 2) { b.hurt(Math.min(40, 12 + sp * 2), 'quake'); b.mover.knock(bo.v.x, bo.v.z, 12 + sp * 0.5, 8, 1.2); this.ctx.audio.sfxAt('crash', c); } }
      }
    }
  }
  affect(b, dt, t) {
    const I = this.level(t);
    if (!b.mover.grounded || b.sheltered && I < 0.2) return;
    const id = b.id.length * 1.7 + b.id.charCodeAt(0);
    b.mover.ext.x += wave(t * 6, id) * 18 * I; b.mover.ext.z += wave(t * 6, id + 9) * 18 * I;
  }
  end() { super.end(); this.rumble.stop(); }
}
function hashf(s, k) { let h = Math.floor(k * 1000); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return (h % 1000) / 1000; }

// ---------- VOLCANO ----------
class Volcano extends Base {
  start() {
    const r = this.r;
    let t = 4;
    while (t < 57) { t += lerp(0.95, 0.38, smooth(4, 45, t)) * (0.6 + r() * 0.8); const [x, z] = this.randomSpot(r, 0.3); this.events.push({ t, x, z }); }
    this.top = LAND + 2.3 + r() * 0.4;
    this.bombs = []; this.fires = [];
    this.geo = new THREE.DodecahedronGeometry(0.9, 0); this.mat = M('#2a1a14', { emissive: '#ff4500', ei: 1.2, flat: true });
    this.ctx.map.volcano.crater.material.emissiveIntensity = 2;
    this.bub = this.ctx.audio.loop('rumble', 0.25);
  }
  lava(t) { return lerp(-4, this.top, smooth(14, 36, t)) - smooth(57, 60, t) * 8; }
  update(dt, t) {
    const V = this.ctx.map.volcano.pos;
    // smoke and fire from the volcano
    if (Math.random() < dt * 14) this.ctx.fx.emit({ p: _v.set(V.x + (Math.random() - 0.5) * 10, V.y, V.z + (Math.random() - 0.5) * 10), v: new THREE.Vector3((Math.random() - 0.5) * 4, 14 + Math.random() * 8, (Math.random() - 0.5) * 4), life: 4, size: 5 + Math.random() * 4, color: Math.random() < 0.3 ? '#ff6a00' : '#3b302c', g: 0, drag: 0.3, shrink: false });
    const WARN = 1.8, FLY = 3.2;
    while (this.evI < this.events.length && this.events[this.evI].t - FLY <= t) {
      const e = this.events[this.evI++]; e.y = this.surfaceY(e.x, e.z); e.warned = false;
      const m = new THREE.Mesh(this.geo, this.mat); m.visible = false; this.group.add(m); this.bombs.push({ e, m });
    }
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const { e, m } = this.bombs[i], left = e.t - t;
      if (!e.warned && left <= WARN) { e.warned = true; this.env.warn(e.x, e.y, e.z, 3.4, e.t, '#ff5a00'); }
      if (left <= 0) {
        m.removeFromParent(); this.bombs.splice(i, 1);
        const p = _v.set(e.x, e.y, e.z); this.env.boom(p, 3, '#ff5a00', '#2e2420'); this.env.mark('fire', e.x, e.y, e.z, 2.6, 6); this.ctx.audio.sfxAt('boom', p);
        this.blast(p.clone().add(_w.set(0, 0.5, 0)), 4.2, 36, 12, 'lava', b => b.burn(0.6));
        this.fires.push({ x: e.x, y: e.y, z: e.z, until: t + 5 });
        continue;
      }
      // fly in an arc from the crater
      const k = clamp(1 - left / FLY, 0, 1);
      m.visible = k > 0.35;
      m.position.set(lerp(V.x, e.x, k), lerp(V.y, e.y, k) + Math.sin(k * Math.PI) * 120, lerp(V.z, e.z, k)); m.rotation.x += dt * 6;
      if (m.visible && Math.random() < 0.8) this.ctx.fx.emit({ p: m.position, v: new THREE.Vector3(0, 1, 0), life: 0.6, size: 0.9, color: Math.random() < 0.5 ? '#ff6a00' : '#ffd23f', g: 0, drag: 2 });
    }
    this.fires = this.fires.filter(f => f.until > t);
    for (const f of this.fires) if (Math.random() < dt * 8) this.ctx.fx.emit({ p: _v.set(f.x + (Math.random() - 0.5) * 3, f.y + 0.2, f.z + (Math.random() - 0.5) * 3), v: new THREE.Vector3(0, 2 + Math.random() * 2, 0), life: 0.7, size: 0.4, color: Math.random() < 0.5 ? '#ff6a00' : '#ffd23f', g: 1 });
    // bubbles on the lava
    const L = this.lava(t);
    if (L > SEA - 1 && Math.random() < dt * 10) { const cp = this.ctx.camPos(); this.ctx.fx.emit({ p: _v.set(cp.x + (Math.random() - 0.5) * 40, L + 0.1, cp.z + (Math.random() - 0.5) * 40), v: new THREE.Vector3(0, 3, 0), life: 0.6, size: 0.4, color: '#ffb000', g: -6 }); }
  }
  affect(b, dt, t) {
    const p = b.mover.pos;
    for (const f of this.fires) if (Math.hypot(p.x - f.x, p.z - f.z) < 2.6 && Math.abs(p.y - f.y) < 1.2) { b.hurt(18 * dt, 'lava', true); b.burn(dt * 0.4); }
    const L = this.lava(t);
    if (p.y < L - 0.05) {
      // too hot: you jump right out (and it hurts)
      b.hurt(30 * dt + (b.mover.vel.y < 1 ? 6 : 0), 'lava', true); b.burn(dt * 1.5);
      if (b.mover.vel.y < 6) { b.mover.vel.y = 12 + Math.random() * 2; b.mover.stun = Math.max(b.mover.stun, 0.25); b.tooHot(); }
    }
  }
  end() { super.end(); this.ctx.map.volcano.crater.material.emissiveIntensity = 0.6; this.bub.stop(); }
}

// ---------- LIGHTNING STORM ----------
class Lightning extends Base {
  start() {
    this.env.setRain(1, '#d6e2ff', 46);
    const r = this.r, tall = this.ctx.map.tallPoints;
    let t = 3;
    while (t < 57) { t += lerp(1.3, 0.55, smooth(3, 45, t)) * (0.6 + r() * 0.8); if (r() < 0.45) { const p = tall[Math.floor(r() * tall.length)]; this.events.push({ t, x: p.x + (r() - 0.5) * 3, z: p.z + (r() - 0.5) * 3 }); } else { const [x, z] = this.randomSpot(r, 0.15); this.events.push({ t, x, z }); } }
    this.extra = []; this.bolts = []; this.huntT = 4;
  }
  onEvent(e) { if (e.k === 'strike') this.extra.push({ t: e.at, x: e.x, z: e.z, pending: true }); }
  update(dt, t) {
    // the leader picks beans to aim at, and tells everyone
    if (this.ctx.host) {
      this.huntT -= dt;
      if (this.huntT <= 0 && t < 56) {
        this.huntT = lerp(1.6, 0.8, smooth(4, 45, t));
        const list = this.ctx.allBodies().filter(b => b.alive && b.onMap);
        if (list.length) { const b = list[Math.floor(Math.random() * list.length)], a = Math.random() * 6.28, d = Math.random() * 2.5; const e = { k: 'strike', x: b.mover.pos.x + Math.cos(a) * d, z: b.mover.pos.z + Math.sin(a) * d, at: t + 1.3 }; this.onEvent(e); this.ctx.send(e); }
      }
    }
    const WARN = 1.2;
    const due = [];
    while (this.evI < this.events.length && this.events[this.evI].t - WARN <= t) due.push(this.events[this.evI++]);
    for (const e of this.extra) if (e.pending && e.t - WARN <= t) { e.pending = false; due.push(e); }
    for (const e of due) { e.y = this.surfaceY(e.x, e.z); this.env.warn(e.x, e.y, e.z, 3, e.t, '#9fd0ff'); e.live = true; this.bolts.push(e); }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const e = this.bolts[i];
      if (t < e.t) { if (Math.random() < dt * 20) this.ctx.fx.emit({ p: _v.set(e.x + (Math.random() - 0.5) * 2, e.y + 0.2, e.z + (Math.random() - 0.5) * 2), v: new THREE.Vector3(0, 3, 0), life: 0.3, size: 0.12, color: '#cfe8ff', g: 0 }); continue; }
      if (!e.struck) {
        e.struck = true; e.until = t + 0.25;
        e.mesh = bolt(e.x, e.y, e.z); this.group.add(e.mesh);
        this.ctx.atmos.flash = 1;
        const p = _v.set(e.x, e.y, e.z);
        this.env.mark('crater', e.x, e.y, e.z, 1.8, 20); this.env.shock(_w.set(e.x, e.y + 0.3, e.z), '#cfe8ff', 5, 0.35);
        for (let k = 0; k < 20; k++) { const a = Math.random() * 6.28; this.ctx.fx.emit({ p, v: new THREE.Vector3(Math.cos(a) * 6, 4 + Math.random() * 6, Math.sin(a) * 6), life: 0.5, size: 0.15, color: k % 2 ? '#ffffff' : '#9fd0ff', g: -12 }); }
        this.ctx.audio.sfxAt('thunder', p);
        this.blast(_v.set(e.x, e.y + 0.6, e.z), 5.5, 55, 13, 'zap', b => b.burn(0.7));
      }
      if (t > e.until) { e.mesh.removeFromParent(); e.mesh.geometry.dispose(); e.mesh.material.dispose(); e.mesh.children[0].material.dispose(); this.bolts.splice(i, 1); }
      else e.mesh.material.opacity = Math.random() < 0.5 ? 1 : 0.4;
    }
  }
}
function bolt(x, y, z) {
  const pts = []; let px = x, pz = z;
  for (let h = 120; h > 0; h -= 6) { pts.push(px, y + h, pz); px = x + (Math.random() - 0.5) * 6 * (h / 120 + 0.2); pz = z + (Math.random() - 0.5) * 6 * (h / 120 + 0.2); pts.push(px, y + h - 6, pz); }
  pts.push(px, y + 6, pz, x, y, z);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true }));
  const glow = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#9fd0ff', transparent: true, opacity: 0.6 })); glow.scale.set(1.02, 1, 1.02); m.add(glow);
  return m;
}

// ---------- BLIZZARD ----------
class Blizzard extends Base {
  start() {
    this.env.snowOn = 1;
    this.ctx.map.fires.forEach(f => { f.flame.visible = true; if (f.light) f.light.intensity = 30; });
    this.windLoop = this.ctx.audio.loop('wind', 0.4);
    this.windA = this.r() * 6.28;
  }
  windAt(t, out) {
    const a = this.windA + wave(t * 0.15, this.seed % 100) * 1.5, s = (8 + 9 * Math.max(0, wave(t * 0.5, 3.3))) * smooth(2, 8, t);
    return out.set(Math.cos(a) * s, 0, Math.sin(a) * s);
  }
  update(dt, t) {
    this.windAt(t, this.env.wind);
    this.windLoop.set(0.3 + this.env.wind.length() / 30);
    this.ctx.map.fires.forEach(f => { f.flame.children.forEach((c, i) => { c.scale.set(1 + Math.sin(t * 14 + i) * 0.1, 1 + Math.sin(t * 11 + i * 2) * 0.18, 1); }); if (f.light) f.light.intensity = 26 + Math.sin(t * 13) * 5; if (Math.random() < dt * 12) this.ctx.fx.emit({ p: _v.copy(f.p).add(_w.set((Math.random() - 0.5) * 0.6, 1.2, (Math.random() - 0.5) * 0.6)), v: new THREE.Vector3(0, 2.5, 0), life: 0.8, size: 0.15, color: '#ffb703', g: 0 }); });
  }
  affect(b, dt, t) {
    const p = b.mover.pos;
    b.mover.slip = 1;
    if (!b.sheltered) { b.mover.ext.x += this.env.wind.x * 0.55; b.mover.ext.z += this.env.wind.z * 0.55; }
    const fire = this.ctx.map.fires.some(f => Math.hypot(f.p.x - p.x, f.p.z - p.z) < 6 && Math.abs(f.p.y - p.y) < 3);
    const rate = fire ? -30 : b.sheltered ? -9 : (5 + this.env.wind.length() * 0.15) * smooth(3, 10, t);
    b.cold = clamp(b.cold + rate * dt, 0, 120);
    b.warm = fire || b.sheltered;
    if (b.cold >= 100) b.hurt(8 * dt, 'cold', true);
    b.mover.speedMul = b.cold > 70 ? lerp(1, 0.55, (b.cold - 70) / 50) : 1;
  }
  end() {
    super.end(); this.env.snowOn = 0; this.windLoop.stop();
    this.ctx.map.fires.forEach(f => { f.flame.visible = false; if (f.light) f.light.intensity = 0; });
  }
}

// ---------- ACID RAIN ----------
class Acid extends Base {
  start() { this.env.setRain(1, '#b6ff5a', 34); this.sizzleT = 0; }
  update(dt, t) {
    if (Math.random() < dt * 3 && t > 4) { const [x, z] = this.randomSpot(Math.random, 0); this.env.mark('acid', x, heightAt(x, z), z, 1 + Math.random() * 2.5, 30); }
  }
  affect(b, dt, t) {
    if (b.sheltered) { b.acid = false; return; }
    const k = smooth(5, 9, t) * lerp(6, 11, smooth(10, 55, t));
    if (k <= 0) return;
    b.acid = true;
    b.hurt(k * dt, 'acid', true);
    if (Math.random() < dt * 12) this.ctx.fx.emit({ p: _v.copy(b.mover.pos).add(_w.set((Math.random() - 0.5) * 0.6, 1.3, (Math.random() - 0.5) * 0.6)), v: new THREE.Vector3(0, 1.6, 0), life: 0.6, size: 0.18, color: '#b6ff5a', g: 0 });
  }
}

const CLASSES = { flood: Flood, tsunami: Tsunami, tornado: Tornado, meteor: Meteor, quake: Quake, volcano: Volcano, lightning: Lightning, blizzard: Blizzard, acid: Acid };
export function makeDisaster(id, ctx, seed) { const C = CLASSES[id]; const d = new C(ctx, seed); d.id = id; d.def = DIS[id]; return d; }
