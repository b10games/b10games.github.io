// STEEP: the game. Boots the mountain, runs the title-screen cinematic (a slow-motion double cork off the
// XL kicker), then the riding: input -> ski physics -> the animated skier -> the drone camera -> effects,
// sound, points and the screen info. Settings are kept in this browser.
import { THREE, createRenderer, applyQuality, QUALITY, clamp, lerp, smooth, damp } from './engine.js';
import { World, DROPS, THEME } from './world.js';
import { Skier, OUTFITS, setSkierQuality } from './skier.js';
import { Ski, G_AIR } from './ski.js';
import { DroneCam, CAM_MODES } from './camera.js';
import { SnowFX } from './fx.js';
import { Sound } from './audio.js';
import { Input } from './input.js';
import { Post } from './post.js';
import { Score, LANDING } from './score.js';
import { PARK, PARK_KICKERS, zoneAt, RUNS, terrain, parkUV } from './terrain.js';
import { ASSIST } from './assist.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const KEY = 'steep2';
const store = { get(k, d) { try { const v = localStorage.getItem(KEY + '.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(KEY + '.' + k, JSON.stringify(v)); } catch {} } };
const touchDevice = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1 && /iPad|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document;
const settings = Object.assign({ quality: touchDevice ? 'low' : 'high', outfit: 'blaze', cam: 0, assist: 1, sfx: 0.8, music: 0.35 }, store.get('settings', {}));
const Q = ['low', 'medium', 'high'].includes(params.get('q')) ? params.get('q') : settings.quality;
const COVER = params.has('cover');
const QNAME = { high: 'QUALITY', medium: 'FAST', low: 'ULTRA FAST' };
if (touchDevice) document.body.classList.add('touch');

// ---------- renderer and camera ----------
const canvas = $('gl');
const renderer = createRenderer(canvas, Q);
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.15, 14000);
const post = new Post(renderer, Q);
const app = { cam: null, touchSeen() { document.body.classList.add('touch'); } };
const input = new Input(app);
const sound = new Sound(); sound.setVolume(settings.music, settings.sfx);
let world, skier, ski, cam, fx, trails, demo, blob, score = new Score();
let mode = 'boot', lastDrop = DROPS[0], hudHidden = false;
score.total = 0; score.best = store.get('best', 0);
function onResize() {
  applyQuality(renderer, Q); camera.aspect = innerWidth / Math.max(1, innerHeight); camera.updateProjectionMatrix(); post.size();
  if (fx) fx.setScale(innerHeight * renderer.getPixelRatio());
}
addEventListener('resize', onResize);
const unlock = () => { sound.unlock(); if (mode === 'title' && settings.music > 0) sound.playMusic(); };
addEventListener('pointerdown', unlock); addEventListener('keydown', unlock);

// ---------- the light of a clear morning ----------
function clearDay() {
  const C = c => new THREE.Color(c), sd = new THREE.Vector3(...THEME.sunDir).normalize();
  return { top: C(THEME.skyTop), mid: C(THEME.skyMid), bot: C(THEME.skyBottom), sunDir: sd, sun: C(THEME.sunColor), moonDir: new THREE.Vector3(-0.3, 0.6, 0.7).normalize(),
    cover: 0.16, night: 0, cloud: C('#ffffff'), sunVis: 1, fog: C(THEME.fog), fogD: 0.00015, si: THEME.sunInt, lightDir: sd.clone(), hs: C(THEME.hemiSky), hg: C(THEME.hemiGround), hi: THEME.hemiInt,
    glow: 0, flakes: 0, wind: new THREE.Vector3(1, 0, 0.4) };
}

// ---------- a point on the park ----------
function parkAt(u, v = 0) {
  const P = PARK.P, S = PARK.S;
  let i = 0; while (i < S.length - 2 && S[i + 1] < u) i++;
  const k = clamp((u - S[i]) / (S[i + 1] - S[i]), 0, 1), ax = P[i][0], az = P[i][1], dx = P[i + 1][0] - ax, dz = P[i + 1][1] - az, l = Math.hypot(dx, dz);
  const x = ax + dx * k - dz / l * v, z = az + dz * k + dx / l * v;
  return { x, z, y: terrain(x, z), dx: dx / l, dz: dz / l };
}

// ======================================================================================
// the title-screen cinematic: approach, pop, a slow-motion Double Cork 1080 Mute, landing, ride out
// ======================================================================================
class Demo {
  constructor() {
    const k = this.k = PARK_KICKERS[3];
    const lip = parkAt(k.u - 0.05, 0), pre = parkAt(k.u - 0.9, 0);
    this.dir = new THREE.Vector3(lip.dx, 0, lip.dz);
    this.side = new THREE.Vector3(this.dir.z, 0, -this.dir.x);            // the skier's left
    const ang = Math.atan2(lip.y - pre.y, Math.hypot(lip.x - pre.x, lip.z - pre.z));
    this.lip = new THREE.Vector3(lip.x, lip.y, lip.z);
    // find the speed that lands in the sweet spot of the landing
    const want = k.u + k.deck + k.land * 0.42;
    let best = null;
    for (let S = 10; S <= 26; S += 0.25) {
      const r = this.fly(S, ang);
      if (!r) continue;
      const lu = this.uOf(r.p), d = Math.abs(lu - want);
      if (!best || d < best.d) best = { d, S, r };
    }
    this.S = best.S; this.path = best.r.path; this.T = best.r.T; this.landP = best.r.p; this.landV = best.r.v;
    this.ang = ang;
    this.approach = 3.2; this.out = 2.8;
    this.t = 0; this.real = 0; this.landed = false; this.loopN = 0;
    this.camPos = new THREE.Vector3(); this.camLook = new THREE.Vector3(); this.camV = new THREE.Vector3(); this.has = false;
    this.q = new THREE.Quaternion(); this.pivot = 0;
  }
  uOf(p) { const a = PARK.P[0]; return (p.x - a[0]) * this.dir.x + (p.z - a[1]) * this.dir.z; }
  fly(S, ang) {
    const p = this.lip.clone(), v = this.dir.clone().multiplyScalar(S * Math.cos(ang)); v.y = S * Math.sin(ang) + 3.4;
    p.y += 0.03; const path = [p.clone()], dt = 1 / 120;
    for (let t = dt; t < 6; t += dt) {
      v.y -= G_AIR * dt; v.multiplyScalar(1 - 0.0014 * v.length() * dt); p.addScaledVector(v, dt);
      path.push(p.clone());
      if (p.y <= terrain(p.x, p.z)) { p.y = terrain(p.x, p.z); return { T: t, p, v, path }; }
    }
    return null;
  }
  // the turn, eased: already turning at the pop, done a moment before touching down
  ease(x) { return (x - Math.sin(2 * Math.PI * x) / (2 * Math.PI)) * 0.6 + x * (2 - x) * 0.4; }
  frac(t) { return clamp((t - 0.04) / (this.T - 0.34), 0, 1); }
  // where everything is at time t (t = 0 at the lip)
  pose(t, out) {
    const I = skier.in, S = this.S;
    I.still = false; I.idle = 0; I.fall = 0; I.lying = 0; I.getUp = 0; I.rail = 0; I.wobble = 0; I.backseat = 0; I.sw = 0; I.plow = 0; I.brake = 0; I.skid = 0; I.push = 0; I.powder = 0;
    const n = new THREE.Vector3(), m = new THREE.Matrix4();
    if (t < 0) {
      // riding in towards the kicker: the speed, a little tuck, then charging the pop
      const u = this.k.u + t * S, p = parkAt(u, 0);
      out.set(p.x, p.y, p.z);
      world.normal(p.x, p.z, n);
      const f = this.dir.clone().addScaledVector(n, -this.dir.dot(n)).normalize(), l = new THREE.Vector3().crossVectors(n, f).normalize();
      this.q.setFromRotationMatrix(m.makeBasis(l, n, f)); this.pivot = 0;
      Object.assign(I, { grounded: true, speed: S, incl: Math.sin(t * 1.3) * 0.08 * smooth(-3, -1.6, -t), tuck: smooth(-3.2, -2.4, t) * (1 - smooth(-1.4, -1.0, t)) * 0.8, charge: smooth(-1.05, -0.15, t), airT: 0, takeoffT: 9, spin: 0, flip: 0, roll: 0, grab: 0, preland: 0 });
      return;
    }
    if (t < this.T) {
      // in the air: the path, the double cork, the grab
      const i = Math.min(this.path.length - 1, Math.floor(t * 120)); out.copy(this.path[i]);
      const x = this.frac(t), e = this.ease(x), dx = 0.004, de = (this.ease(Math.min(1, x + dx)) - e) / dx / (this.T - 0.34);
      const spin = e * Math.PI * 6, roll = -e * Math.PI * 4;
      const v = (this.path[Math.min(this.path.length - 1, i + 1)].clone().sub(this.path[i])).multiplyScalar(120);
      const hz = Math.hypot(v.x, v.z), yaw = Math.atan2(this.dir.x, this.dir.z);
      let pitch = clamp(Math.atan2(-v.y, hz) * 0.5, -0.5, 0.6);
      // the last part: skis to the slope of the landing
      const landSlope = Math.atan2(this.lip.y - this.landP.y, 1) * 0 + 0.62;
      pitch = lerp(pitch, landSlope, smooth(this.T - 0.6, this.T - 0.1, t));
      const neutral = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitch));
      const local = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spin).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll));
      // the ramp angle fades out of the start
      const ramp = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -this.ang * (1 - smooth(0, 0.3, t)));
      this.q.copy(neutral).multiply(ramp).multiply(local);
      this.pivot = smooth(0, 0.12, t);
      const g = smooth(0.24, 0.34, x) * (1 - smooth(0.72, 0.82, x));
      Object.assign(I, { grounded: false, speed: S, incl: 0, tuck: 0, charge: 0, airT: t, takeoffT: t, spin: de * Math.PI * 6, flip: 0, roll: -de * Math.PI * 4, grab: g, grabType: 'mute', preland: smooth(this.T - 0.45, this.T - 0.1, t) });
      return;
    }
    // landed: rolling out down the landing, slowing down
    const tt = t - this.T, sp = Math.max(6, this.landV.length() * 0.95 - tt * 2.5);
    const dist = (this.landV.length() * 0.95) * tt - 1.25 * tt * tt, p = this.landP.clone().addScaledVector(this.dir, dist);
    p.y = terrain(p.x, p.z); out.copy(p);
    world.normal(p.x, p.z, n);
    const f = this.dir.clone().addScaledVector(n, -this.dir.dot(n)).normalize(), l = new THREE.Vector3().crossVectors(n, f).normalize();
    this.q.setFromRotationMatrix(m.makeBasis(l, n, f)); this.pivot = Math.max(0, 1 - tt * 6);
    Object.assign(I, { grounded: true, speed: sp, incl: 0, tuck: 0, charge: 0, airT: 0, takeoffT: 9, spin: 0, flip: 0, roll: 0, grab: 0, preland: 0 });
  }
  reset() { this.t = -this.approach; this.landed = false; this.celebrated = false; this.has = false; skier.acts = []; }
  // the camera: behind on the way in, swinging round low under the skier in the air, behind again after
  camera(dt, p, instant) {
    const t = this.t, D = this.dir, L = this.side, x = this.frac(clamp(t, 0, this.T));
    let a, R, h, look = p.clone(); look.y += 0.9;
    if (t < 0) { a = Math.PI * 0.86; R = 8.5; h = 3.4; look.addScaledVector(D, 5); }
    else if (t < this.T) { const e = smooth(0, 1, x); a = lerp(Math.PI * 0.86, Math.PI * 0.2, e); R = lerp(8.5, 10.5, Math.sin(Math.PI * x)); h = lerp(3.0, -1.2, Math.sin(Math.PI * Math.min(1, x * 1.15))); }
    else { const k = smooth(0, 1.5, t - this.T); a = lerp(Math.PI * 0.2, -Math.PI * 0.75, k); R = lerp(10.5, 9, k); h = lerp(-0.5, 3.5, k); look.addScaledVector(D, 3 * k); }
    // a around the skier: PI = straight behind, PI/2 = on the left
    const off = D.clone().multiplyScalar(Math.cos(a) * R).addScaledVector(L, Math.sin(a) * R); off.y = h;
    const want = p.clone().add(off);
    const g = Math.max(world.height(want.x, want.z), world.drawnHeight(want.x, want.z)) + 0.8; if (want.y < g) want.y = g;
    if (instant || !this.has) { this.camPos.copy(want); this.camLook.copy(look); this.has = true; }
    else { const k = 1 - Math.exp(-5 * dt), kl = 1 - Math.exp(-10 * dt); this.camPos.lerp(want, k); this.camLook.lerp(look, kl); }
    camera.position.copy(this.camPos); camera.lookAt(this.camLook);
    const fov = t > 0 && t < this.T ? 50 : 56; camera.fov = damp(camera.fov, fov, 2, dt); camera.updateProjectionMatrix();
  }
  update(dt) {
    // slow motion in the air
    const t = this.t, slow = t > 0.08 && t < this.T - 0.12 ? lerp(1, 0.4, smooth(0.08, 0.3, t) * (1 - smooth(this.T - 0.4, this.T - 0.12, t))) : 1;
    this.t += dt * slow;
    const p = new THREE.Vector3();
    this.pose(this.t, p);
    if (this.t >= this.T && !this.landed) { this.landed = true; skier.impact(4.2); fx.burst(p, 1.1); sound.sfx('land', 0.6); }
    if (this.t > this.T + 0.7 && !this.celebrated) { this.celebrated = true; skier.celebrate(true); }
    if (this.t < 0 && this.t + dt > -0.05) {}
    skier.update(dt * (slow < 1 ? Math.max(0.55, slow) : 1));
    skier.place(p, this.q, this.pivot);
    // snow spray at the pop and on the way in
    if (this.t < 0 && Math.random() < 0.3) trails && fx.spray(p, this.dir.clone().multiplyScalar(this.S), this.side.clone().multiplyScalar(Math.random() < 0.5 ? 1 : -1), 0.25);
    if (this.t > this.T && this.t < this.T + 1.2) fx.spray(p, this.dir.clone().multiplyScalar(10), this.side.clone().multiplyScalar(Math.random() < 0.5 ? 1 : -1), 0.6);
    this.camera(dt, p, false);
    world.focus(p, camera); fx.update(dt * slow);
    if (this.t > this.T + this.out) { this.loopN++; this.reset(); this.camera(0, p, true); }
    return p;
  }
}

// ======================================================================================
// boot
// ======================================================================================
async function boot() {
  try {
    setSkierQuality(Q);
    world = new World(Q);
    await world.init(p => { $('bootBar').firstElementChild.style.width = Math.round(5 + p * 80) + '%'; $('bootTxt').textContent = 'Building the mountain · ' + Math.round(p * 100) + '%'; });
    world.setEnv(clearDay());
    skier = new Skier(OUTFITS.find(o => o.id === settings.outfit) || OUTFITS[0]);
    world.scene.add(skier.root);
    if (!QUALITY[Q].shadows) skier.root.traverse(o => { if (o.isMesh) o.castShadow = false; });
    world.envMats.push(...skier.envMats());
    world.updateEnvMap(renderer);
    ski = new Ski(world); ski.assistLevel = settings.assist;
    cam = app.cam = new DroneCam(camera, world); cam.mode = settings.cam;
    fx = new SnowFX(world.scene, Q); onResize();
    trails = [fx.trail(0.075, [0]), fx.trail(0.075, [0])];
    if (!QUALITY[Q].shadows) {
      const tex = new THREE.CanvasTexture((() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31); gr.addColorStop(0, 'rgba(20,30,50,0.55)'); gr.addColorStop(1, 'rgba(20,30,50,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return c; })());
      blob = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6 }));
      world.scene.add(blob);
    }
    demo = new Demo(); demo.reset();
    $('bootBar').firstElementChild.style.width = '92%'; $('bootTxt').textContent = 'Waxing the skis';
    // build the detail around the kicker before showing it
    const p = new THREE.Vector3(); demo.pose(-0.5, p); demo.camera(0, p, true); world.focus(p, camera); world.warm(camera);
    buildMenus();
    window.__PUV = parkUV;
    window.__S = { demo, skier, ski, world, cam, camera, score, fx, sound, input, renderer, post, startRide, dropAt, DROPS, parkAt, ride: (dt) => ride(dt), get mode() { return mode; }, set mode(v) { mode = v; } };
    $('qChip').textContent = QNAME[Q]; $('hQ').textContent = QNAME[Q]; $('hCam').textContent = CAM_MODES[cam.mode];
    $('boot').classList.add('off');
    if (COVER) return coverShot();
    if (params.has('go')) { const d = DROPS.find(x => x.id === params.get('go')) || DROPS[0]; startRide(d, true); }
    else toTitle();
    requestAnimationFrame(frame);
  } catch (e) {
    console.error(e);
    $('bootErr').style.display = 'block'; $('bootErr').textContent = 'STEEP could not start: ' + (e && e.message ? e.message : e) + '. Try reloading, or another browser.';
  }
}

// ======================================================================================
// screens
// ======================================================================================
function show(id) { for (const s of document.querySelectorAll('.screen')) s.classList.toggle('on', s.id === id); }
let back = null;
function toTitle() {
  mode = 'title'; show('title'); $('hud').classList.remove('on'); input.enabled = false;
  demo.reset(); if (settings.music > 0) sound.playMusic();
  sound.ride(0, false, 0, 0, 0, false, false); sound.air(0, 'off');
}
function startRide(d, instant) {
  sound.stopMusic();
  show(null); $('hud').classList.add('on'); input.reset(); input.enabled = true; mode = 'play';
  dropAt(d, instant);
}
function dropAt(d, instant = false) {
  lastDrop = d;
  const go = () => {
    ski.spawn(d.x, d.z, d.yaw); score.reset();
    for (const t of trails) t.clear();
    skier.acts = []; ski.poseInto(skier.in); skier.snap();
    placeSkier(0);
    cam.snap(ski); world.focus(ski.p, camera); world.warm(camera);
    zoneT = 9; lastZone = null;
  };
  if (instant) { go(); return; }
  fade('dark', go);
}
// a quick fade: to dark (drop in) or to white (after a fall in a bad place)
let fading = null;
function fade(kind, mid) {
  const f = $('fade'); f.classList.toggle('dark', kind === 'dark'); f.classList.add('on');
  fading = { t: 0, mid, done: false };
  setTimeout(() => { try { mid(); } finally { setTimeout(() => f.classList.remove('on'), 80); fading = null; } }, 360);
}
function pause(on) {
  if (mode !== 'play' && mode !== 'pause') return;
  mode = on ? 'pause' : 'play'; input.enabled = !on; input.reset();
  show(on ? 'pause' : null);
}
function openMenu(id, from) { back = from; show(id); if (id === 'settings') paintSettings(); }
function closeMenu() { if (back === 'title') show('title'); else if (back === 'pause') show('pause'); else { show(null); if (mode === 'pause') pause(false); } }

function buildMenus() {
  document.body.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    sound.sfx('click');
    const a = b.dataset.act, where = mode === 'title' ? 'title' : 'pause';
    if (a === 'ride') startRide(DROPS[0]);
    else if (a === 'drop') openMenu('drop', where);
    else if (a === 'settings') openMenu('settings', where);
    else if (a === 'help') openMenu('help', where);
    else if (a === 'back') closeMenu();
    else if (a === 'resume') pause(false);
    else if (a === 'respawn') { pause(false); dropAt(lastDrop); }
    else if (a === 'title') toTitle();
  });
  const g = $('dropGrid');
  for (const d of DROPS) {
    const b = document.createElement('button'); b.className = 'spot';
    b.innerHTML = `<b>${d.name}</b><span>${d.desc}</span><i>${d.alt.toLocaleString('en')} M</i>`;
    b.onclick = () => { sound.sfx('select'); if (mode === 'title') startRide(d); else { pause(false); dropAt(d); } };
    g.appendChild(b);
  }
  // settings
  const seg = (id, items, get, set) => {
    const el = $(id); el.innerHTML = '';
    for (const it of items) { const b = document.createElement('button'); b.innerHTML = it.html || it.label; b.onclick = () => { set(it.v); sound.sfx('select'); paintSettings(); }; b.dataset.v = it.v; el.appendChild(b); }
    el._get = get;
  };
  seg('sQ', [{ v: 'high', label: 'Quality' }, { v: 'medium', label: 'Fast' }, { v: 'low', label: 'Ultra fast' }], () => settings.quality, v => {
    if (v === Q && !params.get('q')) { settings.quality = v; store.set('settings', settings); return; }
    settings.quality = v; store.set('settings', settings);
    // a new graphics mode builds everything again (trees, the snow, shadows, effects)
    const u = new URL(location.href); u.searchParams.delete('q'); u.searchParams.delete('go');
    if (mode !== 'title') u.searchParams.set('go', lastDrop.id);
    location.href = u.toString();
  });
  seg('sOutfit', OUTFITS.map(o => ({ v: o.id, html: `<span class="sw" style="background:${o.jacket}"></span>${o.name}` })), () => settings.outfit, v => { settings.outfit = v; store.set('settings', settings); skier.setOutfit(OUTFITS.find(o => o.id === v)); });
  seg('sCam', CAM_MODES.map((m, i) => ({ v: i, label: m })), () => cam.mode, v => { cam.mode = v; settings.cam = v; store.set('settings', settings); $('hCam').textContent = CAM_MODES[v]; });
  seg('sAssist', ASSIST.map((m, i) => ({ v: i, label: m })), () => settings.assist, v => { settings.assist = v; ski.assistLevel = v; store.set('settings', settings); });
  $('sSfx').value = settings.sfx; $('sMusic').value = settings.music;
  $('sSfx').oninput = e => { settings.sfx = +e.target.value; sound.setVolume(settings.music, settings.sfx); store.set('settings', settings); };
  $('sMusic').oninput = e => { settings.music = +e.target.value; sound.setVolume(settings.music, settings.sfx); store.set('settings', settings); if (settings.music > 0 && mode === 'title') sound.playMusic(); };
  $('tPause').onclick = () => pause(true);
  input.onPress = (code) => {
    if (code === 'Escape' || code === 'KeyP') {
      if (mode === 'play') pause(true);
      else if (mode === 'pause') { if ($('pause').classList.contains('on')) pause(false); else closeMenu(); }
      else if (mode === 'title' && back) { closeMenu(); back = null; }
      return;
    }
    if (mode !== 'play') { if (mode === 'title' && (code === 'Enter')) startRide(DROPS[0]); return; }
    if (code === 'KeyT') { pause(true); openMenu('drop', 'pause'); }
    if (code === 'KeyR') dropAt(lastDrop);
    if (code === 'KeyC') { const m = cam.cycle(); settings.cam = cam.mode; store.set('settings', settings); $('hCam').textContent = m; toast(m + ' camera'); }
    if (code === 'KeyH') { hudHidden = !hudHidden; $('hud').classList.toggle('hide', hudHidden); }
  };
}
function paintSettings() {
  for (const id of ['sQ', 'sOutfit', 'sCam', 'sAssist']) { const el = $(id), v = el._get(); for (const b of el.children) b.classList.toggle('on', String(b.dataset.v) === String(v)); }
}

// ======================================================================================
// the screen info
// ======================================================================================
const fmt = n => Math.round(n).toLocaleString('en');
let popT = 0, toastT = 0;
function popup(q, name, pts, color) {
  const p = $('pop'); $('pQ').textContent = q; $('pQ').style.color = color || '#fff'; $('pN').textContent = name || ''; $('pP').textContent = pts ? '+' + fmt(pts) : '';
  p.classList.remove('show'); void p.offsetWidth; p.classList.add('show');
}
function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('on'); toastT = 1.6; }
let hudT = 0, zoneT = 9, lastZone = null;
const LEVEL = { black: 'Black run · expert', blue: 'Blue run · intermediate', green: 'Green run · beginner', park: 'Freestyle park' };
function hud(dt) {
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('on'); }
  $('hSpd').textContent = Math.round(ski.kmh);
  // the charge meter, and what trick the keys would throw
  const ch = $('charge');
  if (ski.charging && ski.grounded) {
    ch.classList.add('on'); ch.classList.toggle('max', ski.charge >= 1); $('chFill').style.width = (ski.charge * 100).toFixed(1) + '%';
    const s = input.state(), parts = [];
    if (s.flip > 0) parts.push('Frontflip'); else if (s.flip < 0) parts.push('Backflip');
    if (s.roll) parts.push('Side flip ' + (s.roll > 0 ? 'right' : 'left'));
    if (s.spin) parts.push('Spin ' + (s.spin > 0 ? 'left' : 'right'));
    $('chTrick').textContent = parts.join(' + ');
  } else ch.classList.remove('on', 'max');
  hudT -= dt; if (hudT > 0) return; hudT = 0.08;
  $('hScore').textContent = fmt(score.total);
  $('hBest').textContent = score.best ? 'Best combo ' + fmt(score.best) : '';
  // the combo
  const c = $('combo'), live = !ski.grounded && ski.state !== 'fall' ? ski.tricks.current() : null;
  if (score.open || (live && live.name)) {
    c.style.opacity = 1;
    const names = score.chain.slice(-3).map(x => `<div class="old">${x.name}</div>`).join('');
    $('cNames').innerHTML = names + (live && live.name ? `<div class="live">${live.name}</div>` : ski.grind ? `<div class="live">${ski.grind.name}</div>` : '');
    $('cPts').innerHTML = score.open ? `${fmt(score.pts)} <b>× ${score.mult.toFixed(1).replace('.0', '')}</b>` : '';
    $('cBar').style.width = (score.open ? clamp(score.window / score.windowMax, 0, 1) * 100 : 100) + '%';
  } else c.style.opacity = 0;
  // where you are
  zoneT += 0.08;
  if (zoneT > 0.4) {
    zoneT = 0;
    const z = zoneAt(ski.p.x, ski.p.z);
    if (!lastZone || z.id !== lastZone) {
      lastZone = z.id;
      const run = RUNS.find(r => r.id === z.id);
      $('zName').innerHTML = (run ? `<span class="dot" style="background:${run.color === '#111827' ? '#0b0d12;border:1px solid #fff' : run.color}"></span>` : '') + z.name;
      $('zSub').textContent = run ? LEVEL[run.level] : z.id === 'pipe' ? 'Superpipe' : z.id === 'cliffs' ? 'Natural drops' : z.id === 'powder' ? 'Deep snow' : z.id === 'glades' ? 'Tree skiing' : z.id === 'base' ? 'Village' : z.id === 'start' ? 'Start area' : z.id === 'mid' ? 'Mid station' : 'Off piste';
    }
  }
}

// ======================================================================================
// riding
// ======================================================================================
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _s = new THREE.Vector3(), _t = new THREE.Vector3();
const NOIN = { fwd: 0, steer: 0, jump: false, flip: 0, spin: 0, roll: 0, grab: false };
let lastSpin = 0, lastFlip = 0, lastRoll = 0;
function placeSkier(dt) {
  _v.copy(ski.p);
  // sit on the snow as it is drawn; sink into powder
  if (ski.grounded && ski.state !== 'grind') {
    const off = world.drawnHeight(ski.p.x, ski.p.z) - world.height(ski.p.x, ski.p.z);
    _v.y += clamp(off, -0.4, 0.4) - ski.inPowder * 0.16;
  }
  skier.place(_v, ski.quat, ski.pivot);
  if (blob) {
    const g = world.drawnHeight(ski.p.x, ski.p.z), up = Math.max(0, ski.p.y - g);
    blob.position.set(ski.p.x, g + 0.04, ski.p.z); blob.rotation.set(-Math.PI / 2, 0, -Math.atan2(ski.v.x, ski.v.z));
    blob.material.opacity = clamp(1 - up / 8, 0, 1); blob.scale.setScalar(1 + up * 0.08);
  }
}
function events() {
  for (const e of ski.events) {
    switch (e.type) {
      case 'jump': sound.sfx('pop', e.k); fx.puff(ski.p, ski.v); break;
      case 'takeoff': score.hold(); if (!e.popped) fx.puff(ski.p, ski.v); lastSpin = lastFlip = lastRoll = 0; break;
      case 'grab': sound.sfx('grab'); break;
      case 'land': {
        const r = e, k = clamp((r.into - 3) / 10, 0, 1.4), deep = ski.inPowder;
        skier.impact(Math.min(5.5, 1 + r.into * 0.32));
        fx.burst(ski.p, 0.5 + k * 0.8, deep);
        sound.sfx(deep > 0.5 ? 'powderLand' : 'land', k);
        if (r.into > 9) cam.land(clamp((r.into - 8) / 8, 0.2, 1.2)); else cam.land(k * 0.3);
        if (r.quality === 'crash') break;
        const tr = r.trick, L = LANDING[r.quality];
        if (tr && tr.name && tr.points > 0) {
          const p = score.add(tr.name, tr.points, r.quality, { switch: r.switch });
          const label = r.backseat ? 'BACKSEAT' : r.big ? 'BIG LANDING' : L.label;
          const col = r.quality === 'perfect' ? '#ffd34a' : r.quality === 'sketchy' || r.backseat ? '#ff9a4a' : '#ffffff';
          popup(label + (r.switch ? ' · SWITCH' : ''), tr.name, p, col);
          sound.sfx(r.quality === 'perfect' ? 'perfect' : p > 1500 ? 'big' : 'trick');
          if (r.quality === 'perfect' && p >= 900 && ski.speed < 22) skier.celebrate(p >= 2500);
        } else if (r.quality === 'sketchy' || r.backseat) popup(r.backseat ? 'BACKSEAT' : 'SKETCHY', '', 0, '#ff9a4a');
        else if (r.big) popup('BIG LANDING', '', 0, '#fff');
        break;
      }
      case 'fall': {
        const lost = score.lose();
        popup('BAIL', lost ? 'Combo lost' : '', 0, '#ff3b4e');
        sound.sfx('crash'); cam.land(1.1);
        break;
      }
      case 'hit': sound.sfx('crash'); break;
      case 'resetSpot': fade('white', () => { ski.toSafe(); placeSkier(0); cam.snap(ski); world.focus(ski.p, camera); world.warm(camera); for (const t of trails) t.clear(); }); break;
      case 'spray': {
        _t.set(ski.v.x, 0, ski.v.z).normalize(); _s.set(_t.z, 0, -_t.x);            // left of the travel
        const out = e.carve ? (e.side > 0 ? 1 : -1) : -e.side;
        _w.copy(_s).multiplyScalar(-out); if (!e.carve) _w.addScaledVector(_t, 0.9).normalize();
        fx.spray(ski.p, ski.v, _w, e.k);
        break;
      }
      case 'powder': fx.powder(ski.p, ski.v, e.k); break;
      case 'bump': skier.bump(e.k); break;
      case 'turnStart': if (ski.tuck < 0.3 && !ski.charging) skier.plant(e.side); break;
      case 'grindStart': sound.sfx('railOn'); score.hold(); break;
      case 'grindEnd': { const p = score.add(e.name, e.points, 'clean'); popup('RAIL', e.name, p, '#5ec8ff'); break; }
      case 'recover': break;
    }
  }
  // a whoosh on every half turn of a spin, every whole flip
  if (!ski.grounded && ski.state !== 'fall') {
    const tr = ski.tricks, s = tr.spin.count, f = tr.flip.count, r = tr.roll.count;
    if (s > lastSpin || f > lastFlip || r > lastRoll) sound.sfx('spin', Math.min(3, s + f + r) / 3);
    lastSpin = s; lastFlip = f; lastRoll = r;
  }
}
function ride(dt) {
  const inp = input.enabled ? input.state() : NOIN;
  ski.update(dt, inp);
  events();
  const banked = score.update(dt, ski.grounded && ski.state === 'ride');
  if (banked > 0) {
    toast('Combo  +' + fmt(banked));
    sound.sfx(banked > 4000 ? 'medal' : 'cash');
    if (score.best > store.get('best', 0)) store.set('best', score.best);
  }
  ski.poseInto(skier.in);
  skier.update(dt);
  placeSkier(dt);
  // tracks in the snow from both skis
  const onSnow = ski.grounded && ski.state === 'ride';
  _t.set(ski.v.x, 0, ski.v.z); const sp = _t.length(); if (sp > 0.01) _t.multiplyScalar(1 / sp); _s.set(_t.z, 0, -_t.x);
  for (let i = 0; i < 2; i++) {
    skier.feet[i].g.getWorldPosition(_v);
    _v.y = world.drawnHeight(_v.x, _v.z);
    trails[i].add(_v, _s, null, onSnow && sp > 0.5, ski.inPowder);
  }
  cam.update(dt, ski);
  world.focus(ski.p, camera, _w.copy(ski.p).addScaledVector(ski.v, 2.5));
  fx.update(dt);
  post.setBlur(Q === 'high' ? smooth(20, 34, ski.speed) * (ski.grounded ? 1 : 0.6) : 0);
  // sound
  const carve = Math.abs(ski.incl) * 1.4;
  sound.ride(ski.speed, ski.grounded && ski.state !== 'fall', carve, ski.brake + ski.plow * 0.3, ski.inPowder, ski.state === 'grind', true);
  sound.air(ski.speed, ski.grounded ? 'ground' : 'air');
  hud(dt);
}

// ======================================================================================
// the loop
// ======================================================================================
let last = performance.now(), T = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000)); last = now; T += dt;
  if (mode === 'title') demo.update(dt);
  else if (mode === 'play') ride(dt);
  else if (mode === 'pause') { skier.update(0); }
  else if (mode === 'freeze') world.focus(skier.root.position, camera);   // (tests: stepped by hand)
  world.update(dt, T);
  post.render(world.scene, camera, dt);
}

// ======================================================================================
// the cover picture for the website (?cover): the double cork, frozen in the air, from below
// ======================================================================================
function coverShot() {
  mode = 'cover'; show(null); $('hud').classList.remove('on');
  const x = +(params.get('x') || 0.36), t = clamp(x, 0, 1) * (demo.T - 0.34) + 0.04;
  const p = new THREE.Vector3();
  demo.t = t; demo.pose(t, p);
  for (let i = 0; i < 90; i++) skier.update(1 / 60);
  skier.place(p, demo.q, demo.pivot);
  const D = demo.dir, L = demo.side, a = +(params.get('a') || 1.05), R = +(params.get('r') || 7.5), h = +(params.get('h') || -2.2);
  const off = D.clone().multiplyScalar(Math.cos(a) * R).addScaledVector(L, Math.sin(a) * R); off.y = h;
  camera.position.copy(p).add(off);
  const g = world.drawnHeight(camera.position.x, camera.position.z) + 0.6; if (camera.position.y < g) camera.position.y = g;
  const look = p.clone(); look.y += 0.9 + +(params.get('ly') || 0); camera.fov = +(params.get('fov') || 52); camera.updateProjectionMatrix(); camera.lookAt(look);
  // some snow still in the air from the takeoff
  const lipP = demo.lip.clone();
  for (let i = 0; i < 6; i++) fx.puff(lipP, D.clone().multiplyScalar(8));
  world.focus(p, camera); world.warm(camera);
  let n = 0;
  const t0 = performance.now();
  const loop = () => { world.focus(p, camera); world.update(1 / 60, n / 60); fx.update(1 / 60); post.render(world.scene, camera, 1 / 60); if (++n < 30 || performance.now() - t0 < 8000) requestAnimationFrame(loop); else document.title = 'READY'; };
  requestAnimationFrame(loop);
}

boot();
