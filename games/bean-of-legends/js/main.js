// Bean of Legends: boot, menus, the match camera and controls, and the main loop.
import { THREE, createRenderer, clamp, damp } from './engine.js';
import { HEROES, HERO, TEAM_COLOR, abilityAt } from './data.js';
import { GameMap, HALF, MAP_THEMES } from './map.js';
import { icon } from './icons.js';
import { FX } from './fx.js';
import { Audio, MUSIC } from './audio.js';
import { Match } from './match.js';
import { HUD, $ } from './hud.js';
import { Showroom, loadSave, writeSave, heroColors, renderHeroGrid, renderHeroInfo, renderCosmeticShop, renderEnd } from './menus.js';

const canvas = $('gl');
const app = window.BOL_APP = {
  state: 'boot', paused: false, save: loadSave(), audio: new Audio(), thumbs: {}, pickChroma: {},
  opts: { difficulty: 'normal', team: 0, quick: false, theme: 'candy' }, selHero: 'knight', selMode: 'play'
};
app.settings = app.save.settings;
app.opts.theme = app.settings.theme || 'candy';
app.audio.vol = { music: app.settings.music, sfx: app.settings.sfx };

// ---------- renderer ----------
const renderer = app.renderer = createRenderer(canvas, app.settings.quality);
function applyQuality() {
  const q = app.settings.quality;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, q === 'low' ? 1 : q === 'medium' ? 1.3 : 1.75));
  renderer.shadowMap.enabled = q !== 'low';
  if (app.sun) { app.sun.castShadow = q !== 'low'; const s = q === 'high' ? 2048 : 1024; if (app.sun.shadow.mapSize.x !== s) { app.sun.shadow.mapSize.set(s, s); if (app.sun.shadow.map) { app.sun.shadow.map.dispose(); app.sun.shadow.map = null; } } }
  if (app.fx) app.fx.quality = q === 'low' ? 0.5 : q === 'medium' ? 0.8 : 1;
  resize();
}
const camera = app.camera = new THREE.PerspectiveCamera(42, 1, 1, 420);
function resize() {
  const w = innerWidth, h = innerHeight, dpr = renderer.getPixelRatio();
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  if (app.hud) app.hud.resize(w, h, Math.min(2, devicePixelRatio || 1));
}
addEventListener('resize', resize);

// ---------- screens ----------
const SCREENS = ['boot', 'menu', 'modes', 'select', 'cshop', 'end'];
function screen(id) { for (const s of SCREENS) $(s).classList.toggle('on', s === id); }
function modal(id, on) { $(id).classList.toggle('on', on); }
app.refreshCoins = () => { $('coins').innerHTML = icon('coin', { cls: 'icn' }) + ' ' + app.save.coins; $('menuStats').textContent = app.save.played ? `${app.save.played} matches played · ${app.save.wins} wins` : 'Welcome, bean!'; };
function goMenu() {
  app.state = 'menu'; screen('menu'); app.show.showMenu(app.save); app.refreshCoins();
  app.audio.play(MUSIC.menu);
}
function goModes() { app.state = 'modes'; screen('modes'); }
function goSelect(mode) {
  app.selMode = mode; app.state = 'select'; screen('select');
  $('selHead').textContent = mode === 'collection' ? 'CHARACTER COLLECTION' : 'CHOOSE YOUR BEAN';
  $('lockIn').classList.toggle('hidden', mode === 'collection'); $('selRandom').classList.toggle('hidden', mode === 'collection');
  pickHero(app.selHero);
  app.audio.play(MUSIC.select);
}
function pickHero(id) {
  app.selHero = id;
  renderHeroGrid(app, pickHero);
  renderHeroInfo(app, id, app.selMode === 'collection');
  app.show.showHero(id, heroColors(app.save, id));
  app.audio.sfx('select');
}

// ---------- the battlefield (built once) ----------
function buildGame(themeId = app.mapTheme || 'candy') {
  if (!MAP_THEMES[themeId]) themeId = 'candy';
  if (app.gameScene && app.mapQuality === app.settings.quality && app.mapTheme === themeId) return;
  if (app.gameScene) disposeScene(app.gameScene);
  const T = MAP_THEMES[themeId];
  const scene = app.gameScene = new THREE.Scene();
  scene.background = new THREE.Color(T.sky);
  scene.add(new THREE.HemisphereLight(T.hemi[0], T.hemi[1], T.hemi[2]));
  const sun = app.sun = new THREE.DirectionalLight(T.sun[0], T.sun[1]);
  sun.castShadow = app.settings.quality !== 'low';
  sun.shadow.mapSize.set(app.settings.quality === 'high' ? 2048 : 1024, app.settings.quality === 'high' ? 2048 : 1024);
  Object.assign(sun.shadow.camera, { left: -46, right: 46, top: 46, bottom: -46, near: 1, far: 220 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);
  app.map = app.map || new GameMap();
  app.mapObjs = app.map.build(scene, app.settings.quality, themeId);
  app.mapQuality = app.settings.quality; app.mapTheme = themeId;
  app.fx = new FX(scene);
  app.fx.initLights({ low: 0, medium: 2, high: 4 }[app.settings.quality] ?? 2);
  app.ambient = new Ambient(scene, T, app.settings.quality);
  buildIndicators(scene);
  applyQuality();
}
function disposeScene(scene) {
  const seen = new Set();
  scene.traverse(o => {
    if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
    for (const mt of [].concat(o.material || [])) {
      if (seen.has(mt)) continue; seen.add(mt);
      for (const k in mt) { const v = mt[k]; if (v && v.isTexture && !seen.has(v)) { seen.add(v); v.dispose(); } }
      mt.dispose();
    }
  });
  if (app.match) { app.match.dispose(); app.match = null; }
}
// floating weather around the camera: petals, snow, embers, sand or fireflies depending on the map
class Ambient {
  constructor(scene, T, quality) {
    const kind = this.kind = T.ambient, n = this.n = { low: 120, medium: 260, high: 420 }[quality] || 260;
    const glow = kind === 'embers' || kind === 'fireflies';
    const cols = { petals: ['#ffb3c6', '#ffffff', '#ffd6e0', '#ff9ebb'], snow: ['#ffffff', '#eaf6ff'], embers: ['#ffb347', '#ff6a00', '#ffd23f'], dust: ['#f3dcae', '#e6c48a'], fireflies: ['#d8ff7a', '#7df9ff', '#fff3a0'] }[kind] || ['#ffffff'];
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), c = new THREE.Color();
    this.v = new Float32Array(n * 3); this.ph = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 90; pos[i * 3 + 1] = Math.random() * 22; pos[i * 3 + 2] = (Math.random() - 0.5) * 90;
      c.set(cols[i % cols.length]); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      this.ph[i] = Math.random() * 100; this.resetVel(i);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d');
    if (kind === 'petals') { x.fillStyle = '#fff'; x.beginPath(); x.ellipse(32, 32, 26, 14, 0.6, 0, 7); x.fill(); }
    else { const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(glow ? 0.25 : 0.55, 'rgba(255,255,255,.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const size = { petals: 0.55, snow: 0.42, embers: 0.38, dust: 0.22, fireflies: 0.6 }[kind] || 0.4;
    this.pts = new THREE.Points(g, new THREE.PointsMaterial({ size, map: tex, vertexColors: true, transparent: true, opacity: kind === 'dust' ? 0.55 : 0.9, depthWrite: false, blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending }));
    this.pts.frustumCulled = false; this.pts.renderOrder = 6; scene.add(this.pts);
    this.t = 0;
  }
  resetVel(i) {
    const v = this.v, k = this.kind, r = Math.random;
    if (k === 'snow') { v[i * 3] = (r() - 0.5) * 1.2; v[i * 3 + 1] = -2.2 - r() * 1.6; v[i * 3 + 2] = (r() - 0.5) * 1.2; }
    else if (k === 'petals') { v[i * 3] = 1.2 + r() * 1.2; v[i * 3 + 1] = -1 - r() * 0.8; v[i * 3 + 2] = (r() - 0.5) * 1.2; }
    else if (k === 'embers') { v[i * 3] = (r() - 0.5) * 1.4; v[i * 3 + 1] = 1.4 + r() * 2.4; v[i * 3 + 2] = (r() - 0.5) * 1.4; }
    else if (k === 'dust') { v[i * 3] = 5 + r() * 4; v[i * 3 + 1] = (r() - 0.5) * 0.6; v[i * 3 + 2] = 1 + r() * 2; }
    else { v[i * 3] = (r() - 0.5) * 1.6; v[i * 3 + 1] = (r() - 0.5) * 0.8; v[i * 3 + 2] = (r() - 0.5) * 1.6; }
  }
  update(dt, cx, cz) {
    this.t += dt;
    const a = this.pts.geometry.attributes.position, p = a.array, v = this.v, n = this.n, k = this.kind, t = this.t;
    for (let i = 0; i < n; i++) {
      const j = i * 3, w = Math.sin(t * 1.3 + this.ph[i]);
      p[j] += (v[j] + (k === 'petals' || k === 'snow' ? w * 0.8 : k === 'fireflies' ? w * 0.9 : 0)) * dt;
      p[j + 1] += (v[j + 1] + (k === 'fireflies' ? Math.cos(t * 1.7 + this.ph[i]) * 0.6 : 0)) * dt;
      p[j + 2] += (v[j + 2] + (k === 'fireflies' ? Math.cos(t * 1.1 + this.ph[i] * 2) * 0.9 : 0)) * dt;
      let dx = p[j] - cx, dz = p[j + 2] - cz;
      if (dx > 45) p[j] -= 90; else if (dx < -45) p[j] += 90;
      if (dz > 45) p[j + 2] -= 90; else if (dz < -45) p[j + 2] += 90;
      if (p[j + 1] < 0) { p[j + 1] = 18 + Math.random() * 4; this.resetVel(i); }
      else if (p[j + 1] > 22) { p[j + 1] = k === 'embers' ? Math.random() * 2 : 0.5 + Math.random() * 3; this.resetVel(i); }
      if (k === 'fireflies' && (p[j + 1] > 6 || p[j + 1] < 0.4)) v[j + 1] = -v[j + 1] || 0.2;
    }
    a.needsUpdate = true;
    if (k === 'fireflies') this.pts.material.opacity = 0.65 + Math.sin(t * 3) * 0.25;
  }
}
function buildIndicators(scene) {
  const mat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, side: THREE.DoubleSide });
  const ring = (c, o) => { const g = new THREE.RingGeometry(0.96, 1, 72); g.rotateX(-Math.PI / 2); const m = new THREE.Mesh(g, mat(c, o)); m.visible = false; m.renderOrder = 5; scene.add(m); return m; };
  const disc = (c, o) => { const g = new THREE.CircleGeometry(1, 48); g.rotateX(-Math.PI / 2); const m = new THREE.Mesh(g, mat(c, o)); m.visible = false; m.renderOrder = 5; scene.add(m); return m; };
  const rect = (c, o) => { const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2); g.translate(0, 0, 0.5); const m = new THREE.Mesh(g, mat(c, o)); m.visible = false; m.renderOrder = 5; scene.add(m); return m; };
  app.ind = { range: ring('#9fe3ff', 0.7), aoe: disc('#9fe3ff', 0.28), aoeRing: ring('#ffffff', 0.8), line: rect('#9fe3ff', 0.3), attack: ring('#ff9aac', 0.55), hover: ring('#ff4d6d', 0.9), target: ring('#ffd23f', 0.9) };
}

// ---------- camera ----------
class Cam {
  constructor() { this.x = 0; this.z = 0; this.dist = 34; this.want = 34; this.pitch = 0.98; this.locked = true; this.ray = new THREE.Raycaster(); this.shakeA = 0; this.shakeT = 0; }
  shake(x, z, power) {
    const d = Math.hypot(x - this.x, z - this.z), k = clamp(1.15 - d / 38, 0, 1);
    if (k > 0) this.shakeA = Math.min(1.4, Math.max(this.shakeA, power * k));
  }
  lookAt(x, z, unlock) { this.x = x; this.z = z; if (unlock) this.locked = false; }
  update(dt) {
    const p = app.match && app.match.player, keys = app.input.keys, ms = app.input.mouse;
    if (p && (this.locked || keys.Space)) { const fx = p.alive ? p.x : p.x, fz = p.alive ? p.z : p.z; this.x = damp(this.x, fx, 12, dt); this.z = damp(this.z, fz, 12, dt); }
    else {
      const sp = 60 * dt * (this.dist / 40);
      let dx = 0, dz = 0;
      if (app.settings.edge && ms.inside && !app.paused) { if (ms.x < 12) dx = -1; if (ms.x > innerWidth - 12) dx = 1; if (ms.y < 10) dz = -1; if (ms.y > innerHeight - 10) dz = 1; }
      if (keys.ArrowLeft) dx = -1; if (keys.ArrowRight) dx = 1; if (keys.ArrowUp) dz = -1; if (keys.ArrowDown) dz = 1;
      this.x += dx * sp; this.z += dz * sp;
    }
    this.x = clamp(this.x, -HALF + 12, HALF - 12); this.z = clamp(this.z, -HALF + 8, HALF - 4);
    this.dist = damp(this.dist, this.want, 10, dt);
    const gy = app.map ? Math.max(0, app.map.heightAt(this.x, this.z)) * 0.4 : 0;
    camera.position.set(this.x, gy + this.dist * Math.sin(this.pitch), this.z + this.dist * Math.cos(this.pitch));
    camera.lookAt(this.x, gy, this.z);
    if (this.shakeA > 0.01 && !app.paused) {
      this.shakeT += dt * 38; const a = this.shakeA * 0.55;
      camera.position.x += Math.sin(this.shakeT * 1.13) * a; camera.position.y += Math.sin(this.shakeT * 1.71 + 1) * a * 0.6; camera.position.z += Math.cos(this.shakeT * 0.93) * a * 0.5;
      this.shakeA *= Math.exp(-dt * 6);
    } else this.shakeA = 0;
    if (app.sun) { app.sun.position.set(this.x + 30, 70, this.z + 25); app.sun.target.position.set(this.x, 0, this.z - 4); }
  }
  groundCorners() {
    const out = [], v = new THREE.Vector3(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    for (const [x, y] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) { this.ray.setFromCamera({ x, y }, camera); if (!this.ray.ray.intersectPlane(plane, v)) return null; out.push({ x: v.x, z: v.z }); }
    return out;
  }
}
app.cam = new Cam();

// ---------- input ----------
class Input {
  constructor() {
    this.keys = {}; this.mouse = { x: innerWidth / 2, y: innerHeight / 2, inside: false }; this.ground = { x: 0, z: 0 }; this.hover = null;
    this.aim = -1; this.aArmed = false; this.held = false; this.repeatT = 0; this.ray = new THREE.Raycaster(); this.v = new THREE.Vector3();
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('mousemove', e => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.inside = true; });
    document.addEventListener('mouseleave', () => { this.mouse.inside = false; });
    canvas.addEventListener('mousedown', e => this.down(e));
    addEventListener('mouseup', e => { if (e.button === 0 || e.button === 2) this.held = false; });
    canvas.addEventListener('wheel', e => { if (app.state === 'game') { app.cam.want = clamp(app.cam.want + Math.sign(e.deltaY) * 4, 22, 64); e.preventDefault(); } }, { passive: false });
    addEventListener('keydown', e => this.key(e, true));
    addEventListener('keyup', e => this.key(e, false));
    addEventListener('blur', () => { this.keys = {}; this.held = false; this.aim = -1; $('scoreModal').classList.remove('on'); });
  }
  get m() { return app.match; }
  get p() { return app.match && app.match.player; }
  pick() {
    const m = this.m; if (!m) return;
    const ndc = { x: this.mouse.x / innerWidth * 2 - 1, y: -(this.mouse.y / innerHeight) * 2 + 1 };
    this.ray.setFromCamera(ndc, camera);
    let h = 0;
    for (let i = 0; i < 3; i++) { const pl = new THREE.Plane(new THREE.Vector3(0, 1, 0), -h); if (!this.ray.ray.intersectPlane(pl, this.v)) return; h = m.map.heightAt(this.v.x, this.v.z); }
    this.ground.x = clamp(this.v.x, -HALF + 2, HALF - 2); this.ground.z = clamp(this.v.z, -HALF + 2, HALF - 2);
    // hover: generous hitboxes, both around the body on screen and around the feet on the ground
    let best = null, bd = 1e9; const v = new THREE.Vector3(), zoom = 40 / app.cam.dist;
    for (const u of m.units) {
      if (!u.alive || !(u.team === m.pteam || u.vis[m.pteam]) || u === this.p || !u.targetable) continue;
      const big = u.kind === 'tower' ? 4 : u.kind === 'core' ? 4 : u.kind === 'monster' ? (u.mdef.size || 1) * 0.9 : u.hero ? 1.3 * (u.st.size || 1) : 0.7;
      v.set(u.x, m.groundY(u.x, u.z) + big, u.z).project(camera);
      const sx = (v.x + 1) / 2 * innerWidth, sy = (1 - v.y) / 2 * innerHeight;
      const r = (u.kind === 'tower' || u.kind === 'core' ? 100 : u.hero ? 66 : u.kind === 'monster' ? 52 * (u.mdef.size || 1) : 42) * zoom;
      let d = Math.hypot(sx - this.mouse.x, sy - this.mouse.y);
      const dw = Math.hypot(this.ground.x - u.x, this.ground.z - u.z) - u.radius;
      if (dw < (u.hero ? 1.6 : 1.1)) d = Math.min(d, Math.max(0, dw) * 12 * zoom);
      d -= (u.team !== m.pteam ? 14 : 0) + (u.hero ? 8 : 0);
      if (d < r && d < bd) { bd = d; best = u; }
    }
    this.hover = best;
    canvas.style.cursor = best && best.team !== m.pteam ? 'crosshair' : this.aArmed ? 'crosshair' : 'default';
  }
  down(e) {
    if (app.state !== 'game' || app.paused) return;
    app.audio.unlock();
    const m = this.m, p = this.p; if (!m || !p) return;
    if (app.hud.shopOpen) return;
    this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.inside = true; this.pick();
    // left-click: move / attack (hold to keep walking). While aiming, left-click casts and right-click cancels.
    if (e.button === 2 && (this.aim >= 0 || this.aArmed)) { this.aim = -1; this.aArmed = false; return; }
    if (e.button !== 0 && e.button !== 2) return;
    if (e.button === 0 && this.aim >= 0) { this.castAim(); return; }
    if (e.button === 0 && this.aArmed) { this.aArmed = false; if (this.hover && this.hover.team !== m.pteam) m.orderAttack(p, this.hover); else m.orderAttackMove(p, this.ground.x, this.ground.z); app.fx.ring(new THREE.Vector3(this.ground.x, m.groundY(this.ground.x, this.ground.z), this.ground.z), '#ff9aac', 1.4, 0.4, 0.35); return; }
    const h = this.hover;
    if (h && h.team !== m.pteam) { m.orderAttack(p, h); app.fx.ring(new THREE.Vector3(h.x, m.groundY(h.x, h.z), h.z), '#ff4d6d', h.radius + 1, 0.6, 0.35); }
    else this.moveOrder(this.ground.x, this.ground.z);
    this.held = true; this.repeatT = 0.18;
  }
  moveOrder(x, z, quiet) {
    const m = this.m, p = this.p; if (!m || !p) return;
    m.orderMove(p, x, z);
    if (!quiet || true) app.fx.ring(new THREE.Vector3(x, m.groundY(x, z), z), '#7bd389', 1.3, 0.3, 0.35);
  }
  castAim() { const s = this.aim; this.aim = -1; this.cast(s); }
  cast(slot) { const m = this.m, p = this.p; if (!m || !p) return; m.cast(p, slot, this.ground.x, this.ground.z, this.hover); }
  key(e, down) {
    const c = e.code;
    if (down && !e.repeat) app.audio.unlock();
    if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(c) && app.state === 'game') e.preventDefault();
    const was = this.keys[c]; this.keys[c] = down;
    if (app.state !== 'game') { if (down && c === 'Escape') { modal('settings', false); modal('howtoModal', false); } return; }
    const m = this.m, p = this.p;
    if (c === 'Tab') { $('scoreModal').classList.toggle('on', down); if (down) app.hud.renderScore(); return; }
    if (!down) {
      if (['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT'].includes(c) && this.aim === 'QWERT'.indexOf(c[3]) && app.settings.cast === 'indicator') this.castAim();
      return;
    }
    if (c === 'Escape') {
      if (app.hud.shopOpen) { app.hud.closeShop(); return; }
      if (this.aim >= 0 || this.aArmed) { this.aim = -1; this.aArmed = false; return; }
      if ($('settings').classList.contains('on') || $('howtoModal').classList.contains('on')) { modal('settings', false); modal('howtoModal', false); return; }
      setPause(!app.paused); return;
    }
    if (app.paused || !m || !p) return;
    if (e.repeat && was) { if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(c)) return; }
    const slot = { KeyQ: 0, KeyW: 1, KeyE: 2, KeyR: 3, KeyT: 4 }[c];
    if (slot !== undefined) {
      if (e.shiftKey || e.altKey) { m.levelAbility(p, slot); return; }
      if (app.hud.shopOpen) return;
      this.aArmed = false;
      if (p.def.abilities[slot].type === 'self' && p.def.abilities[slot].kind === 'sprint') { this.cast(slot); return; }
      if (app.settings.cast === 'indicator') { if (m.canCastNow(p, slot) || p.abil[slot].rank === 0 || p.abil[slot].cd > 0) { if (p.abil[slot].rank > 0 && p.abil[slot].cd <= 0) this.aim = slot; else this.cast(slot); } else this.cast(slot); }
      else this.cast(slot);
      return;
    }
    if (c === 'KeyA') { this.aArmed = true; this.aim = -1; return; }
    if (c === 'KeyS') { m.orderStop(p); return; }
    if (c === 'KeyB') { m.startRecall(p); return; }
    if (c === 'KeyP') { app.hud.toggleShop(); return; }
    if (c === 'KeyY') { app.cam.locked = !app.cam.locked; app.hud.toast(app.cam.locked ? 'Camera locked to your bean' : 'Camera free - move it with the mouse at the screen edges', ''); return; }
    if (c.startsWith('Digit')) { const i = +c.slice(5) - 1; if (i >= 0 && i < 6) m.useItem(p, i); return; }
  }
  update(dt) {
    this.pick();
    const m = this.m, p = this.p; if (!m || !p) return;
    if (this.held && !app.paused && !app.hud.shopOpen) { this.repeatT -= dt; if (this.repeatT <= 0) { this.repeatT = 0.15; const o = p.order; if (!o || o.type === 'move') m.orderMove(p, this.ground.x, this.ground.z); } }
    // indicators
    const I = app.ind; for (const k in I) I[k].visible = false;
    if (!p.alive) return;
    const gy = (x, z) => m.groundY(x, z) + 0.18;
    if (this.aim >= 0) {
      const ab = abilityAt(p.def.abilities[this.aim], p.abil[this.aim].rank);
      const dx = this.ground.x - p.x, dz = this.ground.z - p.z, l = Math.hypot(dx, dz) || 1;
      if (ab.range) { I.range.visible = true; I.range.position.set(p.x, gy(p.x, p.z), p.z); I.range.scale.setScalar(ab.range + (ab.type === 'unit' ? 1 : 0)); }
      if (ab.type === 'skillshot') { I.line.visible = true; I.line.position.set(p.x, gy(p.x, p.z) + 0.02, p.z); I.line.rotation.y = Math.atan2(dx, dz); I.line.scale.set(ab.width || 1, 1, ab.range); }
      if (ab.radius) {
        let x = p.x, z = p.z;
        if (ab.type === 'ground') { const k = Math.min(1, ab.range / l); x = p.x + dx * k; z = p.z + dz * k; }
        I.aoe.visible = I.aoeRing.visible = true; I.aoe.position.set(x, gy(x, z), z); I.aoe.scale.setScalar(ab.radius); I.aoeRing.position.copy(I.aoe.position); I.aoeRing.scale.setScalar(ab.radius);
      } else if (ab.type === 'ground') { const k = Math.min(1, ab.range / l), x = p.x + dx * k, z = p.z + dz * k; I.aoeRing.visible = true; I.aoeRing.position.set(x, gy(x, z), z); I.aoeRing.scale.setScalar(1); }
    }
    if (this.aArmed) { I.attack.visible = true; I.attack.position.set(p.x, gy(p.x, p.z), p.z); I.attack.scale.setScalar(p.st.range + p.radius); }
    const h = this.hover;
    if (h && h.team !== m.pteam) { I.hover.visible = true; I.hover.position.set(h.x, gy(h.x, h.z), h.z); I.hover.scale.setScalar(h.radius + 0.4); }
    const t = p.order && p.order.type === 'attack' && !p.order.auto ? p.order.target : null;
    if (t && t.alive && t !== h) { I.target.visible = true; I.target.position.set(t.x, gy(t.x, t.z), t.z); I.target.scale.setScalar((t.radius + 0.5) * (1 + Math.sin(performance.now() / 120) * 0.06)); }
  }
}

// ---------- match flow ----------
function startMatch() {
  screen('boot'); $('bootTxt').textContent = 'Preparing the battlefield…'; $('bootBar').style.width = '60%';
  app.state = 'loading';
  const ids = Object.keys(MAP_THEMES), theme = app.opts.theme === 'random' ? ids[Math.floor(Math.random() * ids.length)] : app.opts.theme;
  if (theme !== app.mapTheme) $('bootTxt').textContent = 'Building ' + MAP_THEMES[theme].name + '…';
  setTimeout(() => {
    if (app.match) { app.match.dispose(); app.match = null; }
    buildGame(theme);
    app.fx.clearTemps();
    const chroma = heroColors(app.save, app.selHero);
    const m = app.match = new Match({ scene: app.gameScene, map: app.map, fx: app.fx, audio: app.audio, heroId: app.selHero, team: app.opts.team, difficulty: app.opts.difficulty, quick: app.opts.quick, chroma });
    m.on((type, d) => { if (type === 'end') onEnd(); else if (type === 'shake') app.cam.shake(d.x, d.z, d.power); else if (type === 'ultCast' && d) app.cam.shake(d.x, d.z, 0.35); });
    m.updateVision();
    app.hud.start(m);
    app.cam.locked = app.settings.cam !== 'free'; app.cam.x = m.player.x; app.cam.z = m.player.z; app.cam.want = app.cam.dist = 34;
    app.paused = false; app.endShown = false;
    screen(null); app.state = 'game';
    app.audio.play(MUSIC.match); app.lateMusic = false;
    $('gl').style.filter = '';
    m.emit('announce', { text: 'WELCOME TO ' + MAP_THEMES[app.mapTheme].name.toUpperCase(), sub: 'Minions spawn in ' + Math.round(m.nextWave) + ' seconds · buy items with P', color: '#ffd23f' });
  }, 40);
}
function onEnd() {
  const m = app.match, win = m.winner === m.pteam;
  m.emit('announce', { text: win ? 'VICTORY!' : 'DEFEAT', sub: win ? 'The enemy Bean Core is destroyed!' : m.surrendered ? 'Your team surrendered' : 'Your Bean Core is destroyed', color: win ? '#ffd23f' : '#ff4d6d' });
  app.audio.sfx(win ? 'victory' : 'defeat');
  app.cam.locked = false; app.cam.lookAt(m.cores[1 - m.winner].x, m.cores[1 - m.winner].z);
  setTimeout(() => showEnd(), 4500);
}
function showEnd() {
  if (app.endShown || !app.match) return; app.endShown = true;
  const m = app.match, p = m.player, win = m.winner === m.pteam;
  const coins = (win ? 120 : 60) + Math.min(60, p.stats.kills * 6 + p.stats.assists * 3) - (m.surrendered ? 40 : 0);
  app.save.coins += Math.max(10, coins); app.save.played++; if (win) app.save.wins++; writeSave(app.save);
  app.hud.stop(); setPause(false, true);
  renderEnd(app, m, Math.max(10, coins));
  app.state = 'end'; screen('end');
  app.audio.play(MUSIC.menu);
}
function quitToMenu() {
  if (app.match) { app.match.dispose(); app.match = null; }
  app.hud.stop(); setPause(false, true); goMenu();
}
function setPause(on, silent) {
  app.paused = on; modal('pause', on);
  if (!silent) app.audio.sfx('click');
}

// ---------- settings ----------
function seg(id, value, fn) {
  const el = $(id);
  [...el.children].forEach(b => { b.classList.toggle('on', b.dataset.v === String(value)); b.onclick = () => { [...el.children].forEach(x => x.classList.toggle('on', x === b)); fn(b.dataset.v); app.audio.sfx('click'); }; });
}
function openSettings() {
  const s = app.settings;
  $('setMusic').value = s.music; $('setSfx').value = s.sfx;
  $('setMusic').oninput = () => { s.music = +$('setMusic').value; app.audio.setVolume('music', s.music); writeSave(app.save); };
  $('setSfx').oninput = () => { s.sfx = +$('setSfx').value; app.audio.setVolume('sfx', s.sfx); writeSave(app.save); };
  seg('setQuality', s.quality, v => { s.quality = v; writeSave(app.save); applyQuality(); if (app.state !== 'game') app.mapQuality = app.mapQuality; });
  seg('setCast', s.cast, v => { s.cast = v; writeSave(app.save); });
  seg('setCam', s.cam, v => { s.cam = v; app.cam.locked = v !== 'free'; writeSave(app.save); });
  seg('setEdge', s.edge ? 1 : 0, v => { s.edge = v === '1'; writeSave(app.save); });
  seg('setNums', s.nums ? 1 : 0, v => { s.nums = v === '1'; writeSave(app.save); });
  modal('settings', true);
}

// map picker on the game mode screen
function renderThemes() {
  const el = $('optTheme'), list = [...Object.entries(MAP_THEMES), ['random', { name: 'Random', desc: 'A surprise map every match.', swatch: ['#ff6fd8', '#3a86ff', '#ffd23f'] }]];
  el.innerHTML = list.map(([id, t]) => `<button data-v="${id}" class="${id === app.opts.theme ? 'on' : ''}"><span class="sw" style="background:linear-gradient(135deg, ${t.swatch[0]} 0 45%, ${t.swatch[1]} 45% 75%, ${t.swatch[2]} 75%)">${id === 'random' ? icon('dice') : ''}</span>${t.name}</button>`).join('');
  const desc = () => { const t = MAP_THEMES[app.opts.theme]; $('themeDesc').textContent = t ? t.desc + ' Same map layout, new look.' : 'A random map every match. Same layout every time.'; };
  [...el.children].forEach(b => { b.onclick = () => { app.opts.theme = b.dataset.v; app.settings.theme = b.dataset.v; writeSave(app.save); [...el.children].forEach(x => x.classList.toggle('on', x === b)); desc(); app.audio.sfx('click'); }; b.addEventListener('mouseenter', () => app.audio.sfx('hover')); });
  desc();
}
// ---------- wiring ----------
function wire() {
  $('mPlay').onclick = () => { app.audio.unlock(); app.audio.sfx('click'); goModes(); };
  $('mCollection').onclick = () => { app.audio.sfx('click'); goSelect('collection'); };
  $('mShop').onclick = () => { app.audio.sfx('click'); app.state = 'cshop'; screen('cshop'); renderCosmeticShop(app); };
  $('mSettings').onclick = () => { app.audio.sfx('click'); openSettings(); };
  $('mHow').onclick = () => { app.audio.sfx('click'); modal('howtoModal', true); };
  $('cBack').onclick = () => { app.audio.sfx('click'); goMenu(); };
  seg('optDiff', app.opts.difficulty, v => { app.opts.difficulty = v; });
  seg('optTeam', app.opts.team, v => { app.opts.team = +v; });
  seg('optQuick', app.opts.quick ? 1 : 0, v => { app.opts.quick = v === '1'; });
  renderThemes();
  $('modeBack').onclick = () => { app.audio.sfx('click'); goMenu(); };
  $('modeGo').onclick = () => { app.audio.sfx('click'); goSelect('play'); };
  $('selBack').onclick = () => { app.audio.sfx('click'); if (app.selMode === 'collection') goMenu(); else goModes(); };
  $('selRandom').onclick = () => pickHero(HEROES[Math.floor(Math.random() * HEROES.length)].id);
  $('lockIn').onclick = () => { app.audio.sfx('lockin'); app.show.beans[app.selHero].cheer = 1.2; setTimeout(startMatch, 500); };
  $('endMenu').onclick = () => { app.audio.sfx('click'); if (app.match) { app.match.dispose(); app.match = null; } goMenu(); };
  $('endAgain').onclick = () => { app.audio.sfx('click'); if (app.match) { app.match.dispose(); app.match = null; } goSelect('play'); };
  $('setClose').onclick = () => modal('settings', false);
  $('howClose').onclick = () => modal('howtoModal', false);
  $('pResume').onclick = () => setPause(false);
  $('pSettings').onclick = () => openSettings();
  $('pHow').onclick = () => modal('howtoModal', true);
  $('pSurrender').onclick = () => { const m = app.match; if (!m) return; setPause(false, true); m.surrendered = true; m.over = true; m.winner = 1 - m.pteam; m.emit('end', { winner: m.winner }); };
  $('pQuit').onclick = () => quitToMenu();
  for (const id of ['settings', 'howtoModal']) $(id).addEventListener('mousedown', e => { if (e.target.id === id) modal(id, false); });
  document.addEventListener('pointerdown', () => app.audio.unlock(), { once: false });
  document.querySelectorAll('button').forEach(b => b.addEventListener('mouseenter', () => app.audio.sfx('hover')));
  app.show.bindDrag($('selPreview'));
}

// ---------- loop ----------
let last = performance.now(), animT = 0;
function step(dt) {
  if (app.state === 'game' && app.match) {
    const m = app.match;
    if (!app.paused) { let rem = dt; while (rem > 1e-4) { const s = Math.min(rem, 1 / 30); m.update(s); rem -= s; } }
    m.updateVisuals(app.paused ? 0 : dt);
    animT += dt;
    for (const f of app.mapObjs.anim) f(animT);
    app.input.update(dt);
    app.cam.update(dt);
    m.listener.x = app.cam.x; m.listener.z = app.cam.z;
    // soft footsteps for your own bean
    const pl = m.player; if (pl && pl.alive && pl.moving && !app.paused) { app.stepT = (app.stepT || 0) - dt; if (app.stepT <= 0) { app.stepT = 0.3; app.audio.sfx('step', 0.5); } }
    if (!app.paused) { app.fx.update(dt); if (app.ambient) app.ambient.update(dt, app.cam.x, app.cam.z); }
    app.hud.update(dt);
    if (!app.lateMusic && m.time > (m.quick ? 600 : 900)) { app.lateMusic = true; app.audio.play(MUSIC.late); }
    renderer.render(app.gameScene, camera);
  } else if (app.show) {
    app.show.update(dt, innerWidth / innerHeight);
    renderer.render(app.show.scene, app.show.camera);
  }
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  step(dt);
}

// ---------- boot ----------
async function boot() {
  $('bootBar').style.width = '15%';
  await document.fonts.ready.catch(() => {});
  document.querySelectorAll('i[data-ic]').forEach(el => { el.innerHTML = icon(el.dataset.ic); });
  app.hud = new HUD(app); app.input = new Input();
  resize();
  app.show = new Showroom(renderer);
  $('bootBar').style.width = '35%'; $('bootTxt').textContent = 'Painting the beans…';
  await new Promise(r => setTimeout(r, 30));
  app.thumbs = app.show.thumbnails();
  $('bootBar').style.width = '60%'; $('bootTxt').textContent = 'Growing the jungle…';
  await new Promise(r => setTimeout(r, 30));
  buildGame(MAP_THEMES[app.opts.theme] ? app.opts.theme : 'candy');
  $('bootBar').style.width = '100%';
  wire();
  applyQuality();
  goMenu();
  requestAnimationFrame(frame);
}
boot().catch(e => { console.error(e); $('bootTxt').textContent = 'Something went wrong: ' + e.message; });

// test hooks
window.BOL = { app, step, startMatch, quitToMenu, pickHero, get match() { return app.match; }, HERO, TEAM_COLOR };
