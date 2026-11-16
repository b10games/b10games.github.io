// Powder Peak: boot, the lobby, the game loop and the party (multiplayer) flow.
import { THREE, createRenderer, applyQuality, clamp, lerp, damp } from './engine.js';
import { World, DROPS, LIFT } from './world.js';
import { Rider, setRiderQuality } from './rider.js';
import { Rider3D } from './physics.js';
import { ChaseCam } from './camera.js';
import { Input } from './input.js';
import { SnowFX } from './fx.js';
import { Sound } from './audio.js';
import { Net, cleanCode } from './net.js';
import { Remotes, packState, COLORS } from './mp.js';
import { Session, fmtTime, fmtNum } from './modes.js';
import { loadSettings, saveSettings, loadSave, storeSave, isTouch, challengeState } from './settings.js';
import { MODES, CHALLENGES } from './data.js';
import { fillIcons } from './icons.js';
import { UI } from './ui.js';
import { MapView } from './map.js';
import { Post } from './post.js';

const $ = id => document.getElementById(id);
const settings = loadSettings(), save = loadSave();
if (save.gear) settings.gear = save.gear;
let guest = localStorage.getItem('pp-name'); if (!guest) { guest = 'Rider' + (100 + Math.floor(Math.random() * 900)); try { localStorage.setItem('pp-name', guest); } catch (e) {} }
const ME = { id: 'r' + Math.random().toString(36).slice(2, 9), get name() { const u = window.B10Account && window.B10Account.user; return (u && u.name) || guest; }, get outfit() { return save.outfit; }, get gear() { return settings.gear; }, ready: false };

const app = window.PP = {
  settings, save, ME, state: 'boot', paused: false, view: 'play', session: null, time: 0,
  sound: new Sound(), net: new Net(ME), touch: isTouch
};
const canvas = $('gl');
const renderer = app.renderer = createRenderer(canvas, settings.quality, settings.res);
const camera = app.camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.3, 9000);
const post = app.post = new Post(renderer, settings.quality);
function draw(cam, dt) { post.render(app.world.scene, cam, dt); }
function onResize() { applyQuality(renderer, settings.quality, settings.res); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); if (app.fx) app.fx.setScale(innerHeight * renderer.getPixelRatio()); post.size(); }
addEventListener('resize', onResize);
app.applyRes = onResize;

// ---------- little messages ----------
app.toast = (msg, bad, icon = 'star') => {
  const el = document.createElement('div'); el.className = 'toast' + (bad ? ' bad' : ''); el.innerHTML = `<i data-ic="${icon}"></i><span></span>`; el.querySelector('span').textContent = msg;
  fillIcons(el); $('toasts').appendChild(el);
  setTimeout(() => el.classList.add('out'), 3000); setTimeout(() => el.remove(), 3500);
};
let bannerT = 0;
app.banner = (b, s, t = 1.6) => { $('bnB').textContent = b; $('bnS').textContent = s || ''; $('banner').classList.add('on'); bannerT = t; };
app.touchSeen = () => { if (!document.body.classList.contains('touch')) { document.body.classList.add('touch'); app.touch = true; app.ui && app.ui.refreshTouch(); } };

// ---------- stats and challenges ----------
function stat(k, v, mode = 'add') {
  const S = save.stats, before = challengeState(save).filter(c => c.done).map(c => c.id);
  if (mode === 'add') S[k] = (S[k] || 0) + v;
  else if (mode === 'max') S[k] = Math.max(S[k] || 0, v);
  else if (mode === 'set') { const a = S[k] || []; if (!a.includes(v)) a.push(v); S[k] = a; }
  const after = challengeState(save).filter(c => c.done);
  for (const c of after) if (!before.includes(c.id)) { app.toast('Challenge complete: ' + c.name, false, 'trophy'); app.sound.sfx('big'); }
  dirty = true;
}
let dirty = false;
setInterval(() => { if (dirty) { dirty = false; storeSave(save); } }, 2000);
app.stat = stat;

// ---------- boot ----------
async function boot() {
  fillIcons();
  if (isTouch) document.body.classList.add('touch');
  const bar = (p, t) => { $('bootBar').firstElementChild.style.width = p + '%'; $('bootTxt').textContent = t; return new Promise(r => setTimeout(r, 30)); };
  await bar(10, 'Piling up the snow…');
  const world = app.world = new World(settings.quality);
  await bar(70, 'Waxing the boards…');
  setRiderQuality(settings.quality);
  app.rider = new Rider(save.outfit, settings.gear);
  world.scene.add(app.rider.root);
  // a soft shadow on the snow right under the rider (always, also without real shadows)
  const bt = new THREE.CanvasTexture((() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62); gr.addColorStop(0, 'rgba(20,35,60,0.55)'); gr.addColorStop(1, 'rgba(20,35,60,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return c; })());
  app.blob = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), new THREE.MeshBasicMaterial({ map: bt, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
  app.blob.renderOrder = 2; world.scene.add(app.blob);
  app.ctrl = new Rider3D(world, settings.gear);
  app.cam = new ChaseCam(camera, world);
  app.fx = new SnowFX(world.scene, settings.quality);
  app.makeTrail();
  app.remotes = new Remotes(world.scene);
  app.input = new Input(app);
  app.input.onPress = onKey;
  app.lobbyMates = new Map();
  onResize();
  await bar(90, 'Starting the lift…');
  app.ui = new UI(app);
  app.map = new MapView(app);
  applySettings();
  // warm up: draw once from the lobby so the first frame is not slow
  lobbyCamera(0, true); renderer.compile(world.scene, camera); renderer.render(world.scene, camera);
  await bar(100, 'Ready!');
  $('boot').classList.add('off'); setTimeout(() => $('boot').remove(), 600);
  goLobby();
  requestAnimationFrame(frame);
  // a friend's party link (?join=K7PX9Q)
  const jq = cleanCode(new URLSearchParams(location.search).get('join') || '');
  if (jq.length === 6) { history.replaceState(null, '', location.pathname); app.ui.joinParty(jq); }
  const unlock = () => { app.sound.unlock(); if (app.state === 'lobby') app.sound.playMusic(); };
  addEventListener('pointerdown', unlock, { once: false }); addEventListener('keydown', unlock, { once: false });
}
app.makeTrail = () => {
  if (app.trail) { app.trail.dispose(); app.fx.trails = app.fx.trails.filter(t => t !== app.trail); }
  app.trail = app.fx.trailOn ? app.fx.trail(settings.gear === 'skis' ? 0.09 : 0.27, settings.gear === 'skis' ? [-0.12, 0.12] : [0]) : null;
};
function applySettings() {
  const s = settings;
  app.ctrl.assistLevel = s.assist;
  app.cam.sens = s.sens;
  document.documentElement.style.setProperty('--tsize', s.touchSize);
  document.documentElement.style.setProperty('--topacity', s.touchOpacity);
  app.sound.setVolume(s.music, s.sfx);
  $('keysHelp').classList.toggle('on', s.showKeys && !app.touch);
}
app.applySettings = () => { applySettings(); saveSettings(settings); };
app.setGear = (g) => {
  settings.gear = g; save.gear = g; saveSettings(settings); storeSave(save);
  app.rider.setGear(g); app.ctrl.setGear(g); app.makeTrail();
  stat('gear', g, 'set');
  if (app.net.inParty) app.net.updateProfile();
};
app.setOutfit = (o) => { save.outfit = { ...save.outfit, ...o }; storeSave(save); app.rider.setOutfit(save.outfit); if (app.net.inParty) app.net.updateProfile(); };

// ---------- the lobby: you (and your party) in the village, the mountain behind ----------
const LOBBY = { x: 0, z: 772 };
const SLOTS = [[0, 0], [-1.9, -1.0], [1.9, -1.0], [-3.7, -2.2], [3.7, -2.2], [-5.4, -3.6], [5.4, -3.6], [0, -3.8]];
function placeLobbyRider(model, i, gear) {
  const [ox, oz] = SLOTS[i] || [i * 1.5, -4];
  const x = LOBBY.x + ox, z = LOBBY.z + oz, y = app.world.height(x, z);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), gear === 'skis' ? 0.35 - ox * 0.06 : Math.PI / 2 - ox * 0.08);
  model.place(new THREE.Vector3(x, y, z), q, 0);
}
let lcam = { p: new THREE.Vector3(), l: new THREE.Vector3() };
function lobbyCamera(dt, instant) {
  const y = app.world.height(LOBBY.x, LOBBY.z);
  const v = app.view, many = app.lobbyMates.size > 0;
  let p, l;
  if (v === 'locker') { p = [0.55, 1.1, 3.7]; l = [0.45, 1.0, 0]; }
  else if (v === 'party' || (v === 'play' && many)) { p = [0.3, 2.3, 8.6]; l = [0, 0.4, -1.2]; }
  else if (v === 'challenges') { p = [0, 2.6, 8]; l = [0, 1.6, 0]; }
  else { p = [1.7, 0.95, 5.4]; l = [0.6, 1.4, 0]; }
  const P = new THREE.Vector3(LOBBY.x + p[0], y + p[1], LOBBY.z + p[2]), L = new THREE.Vector3(LOBBY.x + l[0], y + l[1], LOBBY.z + l[2]);
  if (instant) { lcam.p.copy(P); lcam.l.copy(L); } else { lcam.p.lerp(P, 1 - Math.exp(-4 * dt)); lcam.l.lerp(L, 1 - Math.exp(-4 * dt)); }
  camera.position.copy(lcam.p); camera.lookAt(lcam.l);
  if (camera.fov !== 50) { camera.fov = 50; camera.updateProjectionMatrix(); }
}
// party members standing next to you in the lobby
app.syncLobbyMates = () => {
  const net = app.net, list = net.inParty ? net.list().filter(m => m.id !== ME.id) : [];
  const ids = new Set(list.map(m => m.id));
  for (const [id, o] of app.lobbyMates) if (!ids.has(id)) { app.world.scene.remove(o.model.root); app.lobbyMates.delete(id); }
  list.forEach((m, i) => {
    let o = app.lobbyMates.get(m.id);
    if (!o) { o = { model: new Rider(m.outfit, m.gear), key: '' }; app.world.scene.add(o.model.root); app.lobbyMates.set(m.id, o); }
    const key = JSON.stringify([m.outfit, m.gear, m.name, m.ready]);
    if (key !== o.key) {
      o.key = key; o.model.setOutfit(m.outfit || {}); o.model.setGear(m.gear);
      if (o.tag) o.model.root.remove(o.tag);
      o.tag = makeTag(m.name + (m.ready || m.leader ? '' : ''), COLORS[(i + 1) % COLORS.length], m.leader ? 'LEADER' : m.ready ? 'READY' : 'NOT READY');
      o.tag.position.y = 2.25; o.model.root.add(o.tag);
    }
    o.slot = i + 1; o.gear = m.gear;
    o.model.root.visible = app.state === 'lobby';
  });
};
function makeTag(name, color, sub) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 150; const g = c.getContext('2d');
  g.fillStyle = 'rgba(8,20,44,0.72)'; g.beginPath(); g.roundRect(16, 10, 480, 130, 30); g.fill();
  g.fillStyle = color; g.font = '900 54px Nunito, sans-serif'; g.textAlign = 'center'; g.fillText(name, 256, 68, 450);
  g.fillStyle = sub === 'READY' ? '#4ade80' : sub === 'LEADER' ? '#ffd84a' : '#a9bdd6'; g.font = '900 32px Nunito, sans-serif'; g.fillText(sub, 256, 118);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); s.scale.set(1.9, 0.56, 1); s.renderOrder = 10; return s;
}

function goLobby() {
  endSession();
  app.state = 'lobby'; app.paused = false;
  app.input.enabled = false; app.input.reset();
  $('hud').classList.remove('on'); $('touch').classList.remove('on');
  for (const m of ['pauseModal', 'resModal']) $(m).classList.remove('on');
  $('lobby').classList.add('on');
  app.rider.root.visible = true; app.rider.pose.speed = 0; app.rider.pose.air = 0; app.rider.pose.bail = 0; app.rider.pose.charge = 0; app.rider.pose.land = 0; app.rider.pose.flip = 0; app.rider.pose.brake = 0; app.rider.pose.tuck = 0; app.rider.pose.lean = 0; app.rider.pose.edge = 0;
  app.remotes.clear();
  if (app.trail) app.trail.clear();
  ME.ready = false; if (app.net.inParty) app.net.updateProfile();
  app.syncLobbyMates();
  app.ui.renderAll();
  lobbyCamera(0, true);
  app.sound.ride(0, true, 0, 0, false, false);
  app.sound.playMusic();
}
app.goLobby = goLobby;

// ---------- starting a game ----------
function startSession(mode, opt = {}) {
  endSession();
  app.state = 'game'; app.paused = false; app.time = 0;
  $('lobby').classList.remove('on'); for (const m of ['modeModal', 'setModal', 'pauseModal', 'resModal']) $(m).classList.remove('on');
  $('hud').classList.add('on'); $('touch').classList.toggle('on', app.touch);
  for (const o of app.lobbyMates.values()) o.model.root.visible = false;
  app.input.enabled = true; app.input.reset();
  app.sound.stopMusic();
  app.ctrl.setGear(settings.gear); app.rider.setGear(settings.gear);
  app.ctrl.topSpeed = 0;
  const s = app.session = new Session(app, mode, opt);
  s.start();
  stat('gear', settings.gear, 'set');
  $('score').textContent = '0';
}
app.startSession = startSession;
function endSession() { if (app.map && app.map.on) app.map.close(); if (app.session) { app.session.dispose(); app.session = null; } }
app.afterSpawn = () => {
  app.rider.place(app.ctrl.p, app.ctrl.quat, 0);
  app.cam.snap(app.ctrl);
  if (app.trail) app.trail.clear();
};
app.liftStarted = () => { stat('lifts', 1); };
app.sessionOver = (s) => {
  const r = s.result;
  if (r.kind === 'time') {
    stat('trials', 1);
    const key = s.opt.course || 'peak', best = save.best.time[key];
    const pb = !best || r.ms < best; if (pb) save.best.time[key] = r.ms;
    storeSave(save);
    app.sound.sfx('finish');
    if (s.party) app.net.send({ t: 'fin', r: 1, ms: r.ms, n: ME.name });
    app.partyTimes = app.partyTimes || {}; app.partyTimes[ME.id] = { n: ME.name, ms: r.ms };
    app.ui.results({ title: 'Finished!', big: fmtTime(r.ms), sub: r.course + (r.penalty ? ` · +${r.penalty / 1000}s for missed gates` : '') + (pb ? ' · New best time!' : ''), rows: [['Best time', fmtTime(save.best.time[key])]], party: s.party });
  } else {
    stat('bestTrickRun', r.score, 'max');
    const key = s.opt.spot || 'park', best = save.best.tricks[key] || 0, pb = r.score > best;
    if (pb) save.best.tricks[key] = r.score;
    storeSave(save);
    app.sound.sfx('finish');
    app.ui.results({ title: "Time's up!", big: fmtNum(r.score), sub: r.spot + (pb ? ' · New best score!' : ''), rows: [['Jumps landed', r.jumps], ['Best jump', fmtNum(r.best)], ['Best score here', fmtNum(save.best.tricks[key])]], party: s.party });
  }
};

// ---------- keys ----------
function onKey(code) {
  if (app.state !== 'game') return;
  // the map: M opens and closes it, T drops you in where you point
  if (code === 'KeyM' && !$('pauseModal').classList.contains('on') && !(app.session && app.session.over)) { app.map.toggle(); return; }
  if (app.map.on) { if (code === 'Escape') app.map.close(); else app.map.key(code); return; }
  if (code === 'Escape' || code === 'KeyP') { togglePause(); return; }
  if (app.paused) return;
  if (code === 'KeyR') respawn();
  if (code === 'KeyE' && app.session && app.session.nearLift) app.session.startLift();
}
function togglePause(on = !$('pauseModal').classList.contains('on')) {
  if (app.state !== 'game' || (app.session && app.session.over)) return;
  $('pauseModal').classList.toggle('on', on);
  // a party keeps riding while you look at the menu
  app.paused = on && !(app.session && app.session.party);
  app.input.reset();
  if (on) app.ui.renderPause();
}
app.togglePause = togglePause;
function respawn() { if (app.session && !app.session.over) { if (app.session.lift) app.session.lift = null; app.session.respawn(); } }
app.respawn = respawn;

// ---------- landing feedback ----------
function onEvents() {
  const r = app.ctrl;
  for (const e of r.events) {
    if (e.type === 'jump') app.sound.sfx('jump', e.k);
    else if (e.type === 'takeoff') { if (!e.popped) app.sound.sfx('jump', 0.2); }
    else if (e.type === 'spray') sprayFx(e.k);
    else if (e.type === 'land') landed(e);
    else if (e.type === 'bail') { app.sound.sfx('bail'); app.fx.burst(r.p, 1); app.cam.shake = 0.8; }
    else if (e.type === 'hit') app.cam.shake = 1;
  }
}
const _side = new THREE.Vector3();
function sprayFx(k) {
  const r = app.ctrl; _side.set(Math.cos(r.yaw), 0, -Math.sin(r.yaw)).multiplyScalar(r.lean >= 0 ? -1 : 1);
  app.fx.spray(r.p, r.v, _side, k);
}
let popT = 0;
function landed(e) {
  const into = e.into;
  app.fx.burst(app.ctrl.p, Math.min(1.4, 0.25 + into / 14));
  app.sound.sfx('land', Math.min(1, into / 14));
  if (into > 10) app.cam.shake = Math.min(1, into / 25);
  if (app.session) app.session.onLand(e);
  const q = e.quality, show = e.total > 0 || q === 'crash' || e.names.length;
  // challenges
  if (q !== 'crash') {
    for (const t of e.list) {
      if (t.n <= 0) continue;
      if (t.kind === 'flip') stat(t.f > 0 ? 'frontflips' : 'backflips', t.n);
      if (t.kind === 'diag') stat('diagonals', t.n);
      if ((t.kind === 'flip' || t.kind === 'diag') && t.n >= 2) stat('doubles', 1);
      if (t.kind === 'spin' && t.n * 180 >= 720) stat('spin720', 1);
    }
    if (e.list.filter(t => t.n > 0).length >= 3) stat('combo3', 1);
    stat('bestJump', e.total, 'max'); stat('bestAir', Math.round(e.air * 10) / 10, 'max');
    if (e.total > 0) { save.career += e.total; dirty = true; }
  }
  if (!show) return;
  const label = q === 'crash' ? 'Wipeout' : q === 'perfect' ? 'Perfect landing!' : q === 'clean' ? 'Clean landing' : 'Sketchy landing';
  $('lpQ').textContent = label; $('lpQ').style.color = q === 'crash' ? 'var(--red)' : q === 'sketchy' ? '#ffb347' : q === 'perfect' ? 'var(--green)' : '#fff';
  $('lpP').textContent = e.total > 0 ? '+' + fmtNum(e.total) : q === 'crash' && e.base ? 'Points lost' : '';
  const lp = $('landPop'); lp.classList.remove('go'); void lp.offsetWidth; lp.classList.add('go');
  if (e.total > 0) app.sound.sfx(e.total > 3000 ? 'big' : 'trick');
}

// ---------- party: messages ----------
const net = app.net;
let sendT = 0, outfitT = 0;
function sendState(dt) {
  sendT -= dt; if (sendT > 0) return; sendT = 1 / 15;
  const r = app.ctrl, P = app.rider.pose, s = app.session;
  const cur = r.grounded ? null : r.tricks.current();
  const m = { t: 'st', r: 1, s: packState(r, P), at: net.now(), sc: s ? s.score : 0, tr: cur && cur.liveName ? cur.liveName : '', g: settings.gear, n: ME.name, top: Math.round(r.topSpeed * 3.6) };
  outfitT -= 1 / 15; if (outfitT <= 0) { outfitT = 2; m.o = save.outfit; }
  net.send(m);
}
net.on('msg', (m, from) => {
  from = String(from);
  if (m.t === 'st') { if (app.state === 'game' && from !== ME.id) { const i = net.list().findIndex(p => p.id === from); app.remotes.push(from, m, net.members.get(from), Math.max(0, i), net.now()); } return; }
  if (m.t === 'go') { if (!net.leader) { app.partyTimes = {}; app.ui.setMode(m.mode, m.opt, true); startSession(m.mode, { ...m.opt, party: true }); } return; }
  if (m.t === 'mode') { if (!net.leader) app.ui.setMode(m.mode, m.opt, true); return; }
  if (m.t === 'lobby') { if (!net.leader && app.state === 'game') { app.toast('The party leader went back to the lobby'); goLobby(); } return; }
  if (m.t === 'fin') { app.partyTimes = app.partyTimes || {}; app.partyTimes[from] = { n: m.n, ms: m.ms }; app.ui.refreshResults(); app.toast(m.n + ' finished: ' + fmtTime(m.ms), false, 'flag'); return; }
});
net.on('roster', () => { app.syncLobbyMates(); app.ui.renderParty(); });
net.on('joined', p => {
  app.toast(p.name + ' joined the party!', false, 'party'); app.sound.sfx('ready');
  // a friend who joins while we ride jumps straight into the same mode
  if (net.leader && app.state === 'game' && app.session && app.session.party) net.sendTo(String(p.id), { t: 'go', mode: app.session.mode, opt: strip(app.session.opt) });
  else if (net.leader) net.sendTo(String(p.id), { t: 'mode', mode: save.mode.id, opt: modeOpt() });
});
net.on('left', p => { app.toast(p.name + ' left the party', true, 'party'); app.remotes.remove(String(p.id)); });
net.on('ended', why => { app.toast(why, true); app.remotes.clear(); app.syncLobbyMates(); app.ui.renderParty(); if (app.state === 'game' && app.session && app.session.party) goLobby(); });
const strip = o => { const c = { ...o }; delete c.party; return c; };
function modeOpt() { const m = save.mode; return { drop: m.drop, spot: m.spot, course: m.course }; }
app.modeOpt = modeOpt;
// the leader starts the game for everyone
app.partyGo = () => {
  const mode = save.mode.id === 'free' ? 'mpfree' : save.mode.id, opt = modeOpt();
  app.partyTimes = {};
  net.send({ t: 'go', mode, opt }); net.inMatch = true;
  startSession(mode, { ...opt, party: true });
};
app.leaveGame = () => {
  if (app.session && app.session.party && net.leader) net.send({ t: 'lobby' });
  goLobby();
};

// ---------- the loop ----------
let last = performance.now(), zoneT = 0, lastZone = '';
const _v = new THREE.Vector3();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  step(dt);
}
function step(dt) {
  const W = app.world;
  app.time += dt;
  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) $('banner').classList.remove('on'); }
  if (app.state === 'game') {
    const r = app.ctrl, s = app.session;
    if (!app.paused && !app.mapPaused) {
      const blocked = $('pauseModal').classList.contains('on') || (s && s.over) || r.state === 'frozen' || app.map.on;
      const inp = blocked ? { fwd: 0, steer: 0, jump: false, flip: 0, spin: 0 } : app.input.state();
      r.update(dt, inp);
      onEvents();
      if (s) s.update(dt);
      // the body
      const P = app.rider.pose;
      r.poseInto(P); P.lobby = 0;
      if (r.state === 'lift') { P.crouch = 0.95; P.speed = 0; P.air = 0; }
      app.rider.place(r.p, r.quat, r.pivot || 0);
      app.rider.update(dt);
      placeBlob(r.p.x, r.p.z, r.p.y, r.gear === 'skis' ? 0.8 : 1);
      app.input.setAir(!r.grounded && r.state !== 'bail');
      // snow lines
      if (app.trail) { _side.set(Math.cos(r.yaw), 0, -Math.sin(r.yaw)); app.trail.add(r.p, _side, r.n, r.grounded && r.state === 'ride' && r.speed > 1); }
      app.fx.update(dt);
      // camera
      if (r.state === 'lift') {
        const p = r.p; camera.position.lerp(_v.set(p.x + 9, p.y + 4, p.z + 6), 1 - Math.exp(-3 * dt)); camera.lookAt(p.x, p.y + 1.5, p.z);
      } else app.cam.update(dt, r);
      app.sound.ride(r.speed, r.grounded && r.state === 'ride', Math.abs(r.lean), r.brake, settings.gear === 'skis', true);
      // stats
      zoneT -= dt;
      if (zoneT <= 0) {
        zoneT = 0.5;
        const z = W.zoneAt(r.p.x, r.p.z);
        if (z.name !== lastZone) { lastZone = z.name; $('zone').textContent = z.name; if (z.id !== 'slopes') stat('areas', z.id, 'set'); }
        stat('topSpeed', Math.round(r.topSpeed * 3.6), 'max');
      }
    }
    if (net.inParty && s && s.party) sendState(dt);
    app.remotes.update(dt, net.now(), camera);
    if (app.map.on) { app.map.update(dt, app.input.down); W.focus(app.ctrl.p, app.map.cam); }
    else { W.focus(app.ctrl.p, camera); app.ui.hud(dt); }
  } else {
    // lobby
    const P = app.rider.pose; P.speed = 0; P.crouch = 0.12; P.lobby = 1;
    placeLobbyRider(app.rider, 0, settings.gear);
    app.rider.update(dt);
    placeBlob(LOBBY.x, LOBBY.z, W.height(LOBBY.x, LOBBY.z), 1);
    for (const o of app.lobbyMates.values()) { placeLobbyRider(o.model, o.slot, o.gear); o.model.pose.speed = 0; o.model.pose.crouch = 0.12; o.model.pose.lobby = 1; o.model.update(dt); }
    lobbyCamera(dt);
    W.focus(_v.set(LOBBY.x, W.height(LOBBY.x, LOBBY.z), LOBBY.z), camera);
  }
  W.update(dt, app.time);
  draw(app.state === 'game' && app.map.on ? app.map.cam : camera, dt);
}
app.step = step;
const _bn = new THREE.Vector3(), _bz = new THREE.Vector3(0, 0, 1);
function placeBlob(x, z, y, k) {
  const W = app.world, g = W.height(x, z), up = Math.max(0, y - g);
  W.normal(x, z, _bn);
  app.blob.position.set(x, g + 0.04, z);
  app.blob.quaternion.setFromUnitVectors(_bz, _bn);
  const s = k * (1 + Math.min(1.5, up * 0.06)); app.blob.scale.set(s, s, s);
  app.blob.material.opacity = Math.max(0, 1 - up / 25);
}
boot();
