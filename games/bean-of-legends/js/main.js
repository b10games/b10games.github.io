// Bean of Legends: boot, menus, the match camera and controls, and the main loop.
import { THREE, createRenderer, clamp, damp } from './engine.js';
import { HEROES, HERO, TEAM_COLOR } from './data.js';
import { GameMap, HALF } from './map.js';
import { FX } from './fx.js';
import { Audio, MUSIC } from './audio.js';
import { Match } from './match.js';
import { HUD, $ } from './hud.js';
import { Showroom, loadSave, writeSave, heroColors, renderHeroGrid, renderHeroInfo, renderCosmeticShop, renderEnd } from './menus.js';

const canvas = $('gl');
const app = window.BOL_APP = {
  state: 'boot', paused: false, save: loadSave(), audio: new Audio(), thumbs: {}, pickChroma: {},
  opts: { difficulty: 'normal', team: 0, quick: false }, selHero: 'knight', selMode: 'play'
};
app.settings = app.save.settings;
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
app.refreshCoins = () => { $('coins').textContent = '🪙 ' + app.save.coins; $('menuStats').textContent = app.save.played ? `${app.save.played} matches played · ${app.save.wins} wins` : 'Welcome, bean!'; };
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
function buildGame() {
  if (app.gameScene && app.mapQuality === app.settings.quality) return;
  if (app.gameScene) { app.gameScene.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
  const scene = app.gameScene = new THREE.Scene();
  scene.background = new THREE.Color('#79c9f0');
  scene.add(new THREE.HemisphereLight('#eef7ff', '#56803f', 1.3));
  const sun = app.sun = new THREE.DirectionalLight('#fff1d6', 2.7);
  sun.castShadow = app.settings.quality !== 'low';
  sun.shadow.mapSize.set(app.settings.quality === 'high' ? 2048 : 1024, app.settings.quality === 'high' ? 2048 : 1024);
  Object.assign(sun.shadow.camera, { left: -46, right: 46, top: 46, bottom: -46, near: 1, far: 220 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);
  app.map = app.map || new GameMap();
  app.mapObjs = app.map.build(scene, app.settings.quality);
  app.mapQuality = app.settings.quality;
  app.fx = new FX(scene);
  buildIndicators(scene);
  applyQuality();
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
  constructor() { this.x = 0; this.z = 0; this.dist = 34; this.want = 34; this.pitch = 0.98; this.locked = true; this.ray = new THREE.Raycaster(); }
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
    this.aim = -1; this.aArmed = false; this.rightHeld = false; this.repeatT = 0; this.ray = new THREE.Raycaster(); this.v = new THREE.Vector3();
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('mousemove', e => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.inside = true; });
    document.addEventListener('mouseleave', () => { this.mouse.inside = false; });
    canvas.addEventListener('mousedown', e => this.down(e));
    addEventListener('mouseup', e => { if (e.button === 2) this.rightHeld = false; });
    canvas.addEventListener('wheel', e => { if (app.state === 'game') { app.cam.want = clamp(app.cam.want + Math.sign(e.deltaY) * 4, 22, 64); e.preventDefault(); } }, { passive: false });
    addEventListener('keydown', e => this.key(e, true));
    addEventListener('keyup', e => this.key(e, false));
    addEventListener('blur', () => { this.keys = {}; this.rightHeld = false; this.aim = -1; $('scoreModal').classList.remove('on'); });
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
    // hover: the unit closest to the cursor on screen
    let best = null, bd = 1e9; const v = new THREE.Vector3();
    for (const u of m.units) {
      if (!u.alive || !(u.team === m.pteam || u.vis[m.pteam]) || u === this.p || !u.targetable) continue;
      const big = u.kind === 'tower' ? 4 : u.kind === 'core' ? 4 : u.kind === 'monster' ? (u.mdef.size || 1) * 0.9 : u.hero ? 1.3 * (u.st.size || 1) : 0.7;
      v.set(u.x, m.groundY(u.x, u.z) + big, u.z).project(camera);
      const sx = (v.x + 1) / 2 * innerWidth, sy = (1 - v.y) / 2 * innerHeight;
      const r = (u.kind === 'tower' || u.kind === 'core' ? 60 : u.hero ? 38 : u.kind === 'monster' ? 30 * (u.mdef.size || 1) : 24) * (40 / app.cam.dist);
      const d = Math.hypot(sx - this.mouse.x, sy - this.mouse.y) - (u.team !== m.pteam ? 6 : 0);
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
    if (e.button === 2) {
      if (this.aim >= 0) { this.aim = -1; return; }
      this.aArmed = false;
      const h = this.hover;
      if (h && h.team !== m.pteam && !(h.kind === 'core' && h.protectedNow && false)) { m.orderAttack(p, h); app.fx.ring(new THREE.Vector3(h.x, m.groundY(h.x, h.z), h.z), '#ff4d6d', 1.6, 0.6, 0.35); }
      else this.moveOrder(this.ground.x, this.ground.z);
      this.rightHeld = true; this.repeatT = 0.18;
    } else if (e.button === 0) {
      if (this.aim >= 0) { this.castAim(); return; }
      if (this.aArmed) { this.aArmed = false; if (this.hover && this.hover.team !== m.pteam) m.orderAttack(p, this.hover); else m.orderAttackMove(p, this.ground.x, this.ground.z); app.fx.ring(new THREE.Vector3(this.ground.x, m.groundY(this.ground.x, this.ground.z), this.ground.z), '#ff9aac', 1.4, 0.4, 0.35); }
    }
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
      if (['KeyQ', 'KeyW', 'KeyE', 'KeyR'].includes(c) && this.aim === 'QWER'.indexOf(c[3]) && app.settings.cast === 'indicator') this.castAim();
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
    const slot = { KeyQ: 0, KeyW: 1, KeyE: 2, KeyR: 3 }[c];
    if (slot !== undefined) {
      if (e.shiftKey || e.altKey) { m.levelAbility(p, slot); return; }
      if (app.hud.shopOpen) return;
      this.aArmed = false;
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
    if (this.rightHeld && !app.paused) { this.repeatT -= dt; if (this.repeatT <= 0) { this.repeatT = 0.15; const o = p.order; if (!o || o.type === 'move') m.orderMove(p, this.ground.x, this.ground.z); } }
    // indicators
    const I = app.ind; for (const k in I) I[k].visible = false;
    if (!p.alive) return;
    const gy = (x, z) => m.groundY(x, z) + 0.18;
    if (this.aim >= 0) {
      const ab = p.def.abilities[this.aim];
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
  setTimeout(() => {
    buildGame();
    if (app.match) app.match.dispose();
    const chroma = heroColors(app.save, app.selHero);
    const m = app.match = new Match({ scene: app.gameScene, map: app.map, fx: app.fx, audio: app.audio, heroId: app.selHero, team: app.opts.team, difficulty: app.opts.difficulty, quick: app.opts.quick, chroma });
    m.on((type) => { if (type === 'end') onEnd(); });
    m.updateVision();
    app.hud.start(m);
    app.cam.locked = app.settings.cam !== 'free'; app.cam.x = m.player.x; app.cam.z = m.player.z; app.cam.want = app.cam.dist = 34;
    app.paused = false; app.endShown = false;
    screen(null); app.state = 'game';
    app.audio.play(MUSIC.match); app.lateMusic = false;
    $('gl').style.filter = '';
    m.emit('announce', { text: 'WELCOME TO THE BEAN ARENA', sub: 'Minions spawn in ' + Math.round(m.nextWave) + ' seconds · buy items with P', color: '#ffd23f' });
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
    if (!app.paused) app.fx.update(dt);
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
  app.hud = new HUD(app); app.input = new Input();
  resize();
  app.show = new Showroom(renderer);
  $('bootBar').style.width = '35%'; $('bootTxt').textContent = 'Painting the beans…';
  await new Promise(r => setTimeout(r, 30));
  app.thumbs = app.show.thumbnails();
  $('bootBar').style.width = '60%'; $('bootTxt').textContent = 'Growing the jungle…';
  await new Promise(r => setTimeout(r, 30));
  buildGame();
  $('bootBar').style.width = '100%';
  wire();
  applyQuality();
  goMenu();
  requestAnimationFrame(frame);
}
boot().catch(e => { console.error(e); $('bootTxt').textContent = 'Something went wrong: ' + e.message; });

// test hooks
window.BOL = { app, step, startMatch, quitToMenu, pickHero, get match() { return app.match; }, HERO, TEAM_COLOR };
