// Wobble Dash: lobby, party, matches with rounds, and everything on screen.
import { THREE, createRenderer, applyQuality, makeWorldScene, M, canvasTex, clamp, damp, angDiff, rng, disposeTree } from './engine.js';
import { Character, PALETTE, PATTERNS, HATS, EYES, randomSkin, nameTag } from './character.js';
import { World } from './physics.js';
import { Mover, MOVE } from './mover.js';
import { makeCtx } from './obstacles.js';
import { MAPS, ARENAS, THEMES, buildMap } from './maps.js';
import { Audio } from './audio.js';
import { FX } from './fx.js';
import { Net } from './net.js';
import { Bot, botNames } from './bots.js';

const $ = id => document.getElementById(id);
const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
const hash = s => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- profile ----------
let prof = store.get('wd-profile', null);
if (!prof || !prof.skin) { prof = { name: 'Wobbler' + (100 + Math.floor(Math.random() * 900)), skin: randomSkin(), xp: 0 }; store.set('wd-profile', prof); }
const levelOf = xp => 1 + Math.floor(xp / 400);
const me = { id: 'w' + Math.random().toString(36).slice(2, 9), name: prof.name, skin: prof.skin, level: levelOf(prof.xp) };
let settings = Object.assign({ sens: 1, quality: 'high' }, store.get('wd-settings', {}));
function saveProfile() { me.name = prof.name; me.skin = prof.skin; me.level = levelOf(prof.xp); store.set('wd-profile', prof); net.updateProfile(); renderMe(); }
function addXp(n) { const before = levelOf(prof.xp); prof.xp += n; saveProfile(); if (levelOf(prof.xp) > before) toast('LEVEL UP! Du er nu level ' + levelOf(prof.xp), 'good'); }

// ---------- core ----------
const canvas = $('c');
const renderer = createRenderer(canvas, settings.quality);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 2000);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
const audio = new Audio();
const net = new Net(me);
let state = 'boot', lobby = null, match = null, R = null;
let mode = { id: 'solo', map: null };

// ---------- modes ----------
const MODES = {
  solo: { name: 'SOLO SHOW', desc: '4 runder: Race, Race, Survival og Finale', ico: '👑', rounds: [{ type: 'race', q: 0.7 }, { type: 'race', q: 0.55 }, { type: 'survival', q: 0.5 }, { type: 'race', final: true }] },
  race: { name: 'RACE RUSH', desc: '4 forhindringsbaner – først i mål vinder', ico: '🏁', rounds: [{ type: 'race', q: 0.75 }, { type: 'race', q: 0.6 }, { type: 'race', q: 0.5 }, { type: 'race', final: true }] },
  survival: { name: 'SURVIVAL SHOW', desc: 'Hold dig oppe – sidste spiller tilbage vinder', ico: '🌀', rounds: [{ type: 'survival', q: 0.65 }, { type: 'survival', q: 0.45 }, { type: 'survival', final: true }] },
  team: { name: 'TEAM SHOW', desc: 'Rødt mod blåt hold – taberholdet ryger ud', ico: '🤝', rounds: [{ type: 'team' }, { type: 'team' }, { type: 'race', final: true }] }
};

// ---------- input ----------
const keys = {};
let jumpPressed = false, wantReset = false, camYaw = 0, camPitch = 0.38, dragging = false;
addEventListener('keydown', e => {
  if (e.target && e.target.tagName === 'INPUT') return;
  keys[e.code] = true;
  if (e.code === 'Space') { if (!e.repeat) jumpPressed = true; e.preventDefault(); }
  if (e.code === 'KeyR' && state === 'match') wantReset = true;
  if (e.code === 'Escape' && state === 'match') togglePause();
  if (state === 'match' && (e.code === 'ArrowLeft' || e.code === 'ArrowRight') && R && R.spectating) cycleSpectate(e.code === 'ArrowRight' ? 1 : -1);
  audio.unlock();
});
addEventListener('keyup', e => { keys[e.code] = false; });
canvas.addEventListener('mousedown', e => {
  audio.unlock(); dragging = true;
  if (state === 'match' && !$('pause').classList.contains('on') && canvas.requestPointerLock) { try { canvas.requestPointerLock(); } catch (er) {} }
  if (state === 'match' && R && R.spectating && e.button === 0 && document.pointerLockElement !== canvas) cycleSpectate(1);
});
addEventListener('mouseup', () => { dragging = false; });
addEventListener('mousemove', e => {
  const locked = document.pointerLockElement === canvas;
  if (state === 'match' && (locked || dragging)) {
    camYaw -= e.movementX * 0.0026 * settings.sens;
    camPitch = clamp(camPitch + e.movementY * 0.0022 * settings.sens, -0.2, 1.2);
  } else if (state === 'lobby' && dragging && lobby) lobby.spin -= e.movementX * 0.01;
});
document.addEventListener('pointerlockchange', () => { $('clickToPlay').classList.toggle('hidden', state !== 'match' || document.pointerLockElement === canvas || (R && (R.phase === 'intro' || R.finalScreen))); });
function readInput() {
  const w = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  const d = (keys.KeyD || (keys.ArrowRight && !(R && R.spectating)) ? 1 : 0) - (keys.KeyA || (keys.ArrowLeft && !(R && R.spectating)) ? 1 : 0);
  const fx = Math.sin(camYaw), fz = Math.cos(camYaw), rx = -Math.cos(camYaw), rz = Math.sin(camYaw);
  const inp = { x: fx * w + rx * d, z: fz * w + rz * d, jump: jumpPressed };
  jumpPressed = false;
  return inp;
}

// ---------- UI helpers ----------
function toast(text, kind) { const t = document.createElement('div'); t.className = 'toast ' + (kind || ''); t.textContent = text; $('toasts').appendChild(t); setTimeout(() => t.remove(), 3600); }
let bannerTimer = 0;
function banner(html, cls = 'n', ms = 1600) { const b = $('banner'); b.innerHTML = html; b.className = 'banner on ' + cls; clearTimeout(bannerTimer); if (ms) bannerTimer = setTimeout(() => b.classList.remove('on'), ms); }
function show(id, on) { $(id).classList.toggle('on', on); }
function modal(id, on) { $(id).classList.toggle('on', on); }
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => { b.closest('.modal').classList.remove('on'); audio.sfx('click'); }));
document.querySelectorAll('.modal').forEach(m => m.addEventListener('mousedown', e => { if (e.target === m && m.id !== 'results') m.classList.remove('on'); }));
document.addEventListener('click', e => { if (e.target.closest('button')) { audio.unlock(); audio.sfx('click'); } }, true);

// ============================== LOBBY ==============================
const SLOTS = [[0, 0, 0], [-2.8, 0, -1.1], [2.8, 0, -1.1], [-5.4, 0, -2.4], [5.4, 0, -2.4], [-7.8, 0, -3.9], [7.8, 0, -3.9], [0, 0, -5]];
function buildLobby() {
  const scene = makeWorldScene(THEMES.lobby, settings.quality);
  const root = new THREE.Group(); scene.add(root);
  const add = (m, x = 0, y = 0, z = 0) => { m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; root.add(m); return m; };
  const ringTex = canvasTex(512, 512, (g, w) => { for (let r = 16; r > 0; r--) { g.fillStyle = r % 2 ? '#7b3fe4' : '#9b5cff'; g.beginPath(); g.arc(w / 2, w / 2, r * w / 32, 0, 7); g.fill(); } });
  add(new THREE.Mesh(new THREE.CylinderGeometry(42, 44, 2, 64), new THREE.MeshStandardMaterial({ map: ringTex, roughness: 0.6 })), 0, -1, -6);
  // water around the plaza
  const water = add(new THREE.Mesh(new THREE.PlaneGeometry(800, 800), M('#5fd3ff', { rough: 0.1, emissive: '#2a7fff', ei: 0.15 })), 0, -1.6, 0); water.rotation.x = -Math.PI / 2;
  // stage pads
  const pads = [];
  SLOTS.forEach((s, i) => {
    const r = i === 0 ? 2.2 : 1.25;
    const pad = add(new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.2, 0.5, 40), M(i === 0 ? '#ffffff' : '#ede4ff', { rough: 0.3 })), s[0], 0.25, s[2]);
    const glow = add(new THREE.Mesh(new THREE.TorusGeometry(r + 0.05, 0.07, 8, 48), M('#00e5ff', { emissive: '#00e5ff', ei: 2 })), s[0], 0.5, s[2]);
    glow.rotation.x = Math.PI / 2; glow.castShadow = false;
    pads.push({ pad, glow });
  });
  // rainbow arch behind
  ['#ff4d6d', '#ff8c42', '#ffd23f', '#7bd389', '#3a86ff', '#8338ec'].forEach((c, i) => { const a = add(new THREE.Mesh(new THREE.TorusGeometry(24 - i * 1.4, 0.7, 10, 64, Math.PI), M(c, { rough: 0.4 })), 0, 0, -26); a.castShadow = false; });
  // floating shapes, balloons, islands
  const floaters = [];
  const r = rng(77);
  const shapes = [() => new THREE.TorusGeometry(1.4, 0.55, 14, 28), () => new THREE.OctahedronGeometry(1.4), () => new THREE.IcosahedronGeometry(1.3, 0), () => new THREE.BoxGeometry(2, 2, 2), () => new THREE.TorusKnotGeometry(1, 0.35, 64, 10)];
  for (let i = 0; i < 18; i++) {
    const side = i % 2 ? 1 : -1, m = add(new THREE.Mesh(shapes[i % shapes.length](), M(PALETTE[i % 8], { rough: 0.3 })), side * (12 + r() * 22), 6 + r() * 16, -10 - r() * 30);
    floaters.push({ m, base: m.position.y, sp: 0.5 + r(), ph: r() * 6 });
  }
  for (let i = 0; i < 14; i++) {
    const side = i % 2 ? 1 : -1, x = side * (9 + r() * 14), z = -4 - r() * 16, y = 4 + r() * 6, col = PALETTE[(i * 3) % PALETTE.length];
    const b = add(new THREE.Mesh(new THREE.SphereGeometry(0.9, 18, 14), M(col, { rough: 0.15 })), x, y, z); b.scale.y = 1.15;
    const s = add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 3, 4), M('#ffffff')), x, y - 2.4, z); s.castShadow = false;
    floaters.push({ m: b, s, base: y, sp: 0.8 + r(), ph: r() * 6 });
  }
  for (let i = 0; i < 8; i++) {
    const side = i % 2 ? 1 : -1, sz = 3 + r() * 4, x = side * (30 + r() * 30), z = -20 - r() * 50, y = 5 + r() * 14;
    add(new THREE.Mesh(new THREE.ConeGeometry(sz, sz * 1.5, 7), M('#a1887f', { flat: true })), x, y - sz * 0.75, z).rotation.x = Math.PI;
    add(new THREE.Mesh(new THREE.CylinderGeometry(sz, sz, 0.8, 7), M('#7bd389', { flat: true })), x, y + 0.4, z);
    add(new THREE.Mesh(new THREE.IcosahedronGeometry(sz * 0.4, 0), M('#2e7d32', { flat: true })), x, y + sz * 0.7, z);
  }
  const lights = [new THREE.PointLight('#ff4dd2', 30, 18), new THREE.PointLight('#00e5ff', 30, 18)];
  lights[0].position.set(-4, 4, 3); lights[1].position.set(4, 4, 3); lights.forEach(l => scene.add(l));
  const fx = new FX(scene);
  return { scene, root, pads, floaters, fx, chars: new Map(), spin: 0, t: 0, confettiT: 3, dance: false, cam: { pos: new THREE.Vector3(0, 2.5, 8.4), look: new THREE.Vector3(0, 1.2, 0) } };
}

function lobbyChar(id, profile, slot) {
  let c = lobby.chars.get(id);
  if (!c) { c = { model: new Character(profile.skin), slot, tag: null, skinKey: '' }; lobby.root.add(c.model.root); lobby.chars.set(id, c); }
  const key = JSON.stringify(profile.skin) + profile.name;
  if (c.skinKey !== key) { c.model.setSkin(profile.skin); c.skinKey = key; if (c.tag) c.tag.removeFromParent(); if (id !== me.id) { c.tag = nameTag(profile.name, profile.leader ? '#ffd23f' : '#ffffff'); c.tag.position.y = 2.3; c.model.root.add(c.tag); } }
  c.slot = slot;
  const s = SLOTS[slot];
  c.model.root.position.set(s[0], 0.5, s[2]);
  return c;
}
function syncLobbyChars() {
  if (!lobby) return;
  const members = net.inParty ? net.list() : [{ ...me, leader: true }];
  const others = members.filter(m => m.id !== me.id);
  const keep = new Set([me.id]);
  lobbyChar(me.id, { ...me }, 0);
  others.forEach((m, i) => { keep.add(m.id); lobbyChar(m.id, m, Math.min(i + 1, SLOTS.length - 1)); });
  for (const [id, c] of lobby.chars) if (!keep.has(id)) { c.model.dispose(); lobby.chars.delete(id); }
  lobby.pads.forEach((p, i) => { p.glow.material = M(i < members.length ? (i === 0 ? '#ffd23f' : '#00e5ff') : '#6b5aa0', { emissive: i < members.length ? (i === 0 ? '#ffd23f' : '#00e5ff') : '#2a2050', ei: i < members.length ? 2 : 0.4 }); });
}
function tickLobby(dt) {
  const L = lobby; L.t += dt;
  L.floaters.forEach(f => { f.m.position.y = f.base + Math.sin(L.t * f.sp + f.ph) * 0.6; f.m.rotation.y += dt * 0.4 * f.sp; if (f.s) f.s.position.y = f.m.position.y - 2.4; });
  L.pads.forEach((p, i) => { p.glow.scale.setScalar(1 + Math.sin(L.t * 3 + i) * 0.03); });
  for (const [id, c] of L.chars) {
    const mine = id === me.id;
    c.model.root.rotation.y = mine ? L.spin + Math.sin(L.t * 0.6) * 0.15 : Math.sin(L.t * 0.5 + c.slot) * 0.25;
    c.model.update(dt, { speed: 0, grounded: true, vy: 0, dance: (mine && L.dance) || (c.danceT > 0), groundDist: 0 });
    if (c.danceT > 0) c.danceT -= dt;
  }
  L.confettiT -= dt;
  if (L.confettiT < 0) { L.confettiT = 6 + Math.random() * 6; L.fx.confetti(new THREE.Vector3((Math.random() - 0.5) * 14, 6, -3), 60, 10); }
  L.fx.update(dt);
  const locker = $('locker').classList.contains('on');
  const tp = locker ? new THREE.Vector3(1.0, 1.7, 3.9) : new THREE.Vector3(Math.sin(L.t * 0.15) * 0.45, 1.95 + Math.sin(L.t * 0.2) * 0.1, 5.5);
  const tl = locker ? new THREE.Vector3(1.0, 1.05, 0) : new THREE.Vector3(0, 1.15, -0.6);
  L.cam.pos.lerp(tp, 1 - Math.exp(-dt * 4)); L.cam.look.lerp(tl, 1 - Math.exp(-dt * 4));
  camera.position.copy(L.cam.pos); camera.lookAt(L.cam.look);
  if (camera.fov !== 50) { camera.fov = 50; camera.updateProjectionMatrix(); }
  L.scene.userData.setFocus(new THREE.Vector3(0, 0, 0));
}

function enterLobby() {
  state = 'lobby';
  if (document.pointerLockElement) document.exitPointerLock();
  if (!lobby) lobby = buildLobby();
  syncLobbyChars();
  show('lobby', true); show('hud', false); show('final', false);
  ['results', 'pause'].forEach(id => modal(id, false));
  $('intro').classList.remove('on'); $('banner').classList.remove('on'); $('clickToPlay').classList.add('hidden');
  audio.play(THEMES.lobby.music);
  renderMe(); renderParty(); renderMode();
}

// ---------- lobby UI ----------
function renderMe() {
  $('meName').textContent = me.name;
  const lv = levelOf(prof.xp), into = prof.xp % 400;
  $('lvl').textContent = lv; $('xpBar').style.width = (into / 400 * 100) + '%'; $('xpTxt').textContent = into + ' / 400 XP';
}
function renderParty() {
  const inP = net.inParty, members = inP ? net.list() : [{ ...me, leader: true }];
  $('partyCount').textContent = members.length + '/8';
  const list = $('partyList'); list.innerHTML = '';
  members.forEach(m => {
    const row = document.createElement('div'); row.className = 'member';
    row.innerHTML = `<span class="dot" style="background:${esc(m.skin.c1)}"></span><span>${esc(m.name)}${m.id === me.id ? ' (dig)' : ''}</span><em>${m.leader ? '👑 LEDER' : 'LV ' + (m.level || 1)}</em>`;
    if (net.leader && m.id !== me.id) { const k = document.createElement('button'); k.className = 'kick'; k.title = 'Fjern fra party'; k.textContent = '✕'; k.onclick = () => net.kick(m.id); row.appendChild(k); }
    list.appendChild(row);
  });
  if (members.length < 4) for (let i = members.length; i < 4; i++) { const e = document.createElement('div'); e.className = 'member empty'; e.textContent = inP ? 'Venter på venner…' : '+ Inviter venner med CREATE PARTY'; list.appendChild(e); if (!inP) break; }
  $('partyCode').classList.toggle('hidden', !inP); $('codeTxt').textContent = net.code || '';
  $('partyBtns').classList.toggle('hidden', inP); $('btnLeave').classList.toggle('hidden', !inP);
  const canStart = !inP || net.leader;
  $('btnPlay').disabled = !canStart;
  $('playHint').textContent = canStart ? (inP ? 'Du er leder – PLAY starter kampen for hele partyet' : 'Spil alene mod bots – eller lav et party') : 'Venter på at lederen starter kampen…';
  $('modeCard').disabled = !canStart;
  syncLobbyChars();
}
function renderMode() {
  const m = mode.id === 'course' ? null : MODES[mode.id];
  if (m) { $('modeName').textContent = m.name; $('modeDesc').textContent = m.desc; }
  else { const mp = MAPS.find(x => x.id === mode.map); $('modeName').textContent = (mp ? mp.icon + ' ' + mp.name : 'BANE').toUpperCase(); $('modeDesc').textContent = 'Øv dig på én bane med dit party'; }
}
$('modeCard').onclick = () => { buildModeGrid(); modal('modeModal', true); };
function buildModeGrid() {
  const g = $('modeGrid'); g.innerHTML = '';
  for (const [id, m] of Object.entries(MODES)) {
    const b = document.createElement('button'); b.className = 'opt' + (mode.id === id ? ' on' : '');
    b.innerHTML = `<span class="ico">${m.ico}</span><b>${m.name}</b><span>${m.desc}</span>`;
    b.onclick = () => { setMode({ id, map: null }); modal('modeModal', false); };
    g.appendChild(b);
  }
  const mg = $('mapGrid'); mg.innerHTML = '';
  MAPS.forEach(mp => {
    const b = document.createElement('button'); b.className = 'opt' + (mode.id === 'course' && mode.map === mp.id ? ' on' : '');
    b.innerHTML = `<span class="ico">${mp.icon}</span><b>${mp.name}</b><span>${mp.desc}</span>`;
    b.onclick = () => { setMode({ id: 'course', map: mp.id }); modal('modeModal', false); };
    mg.appendChild(b);
  });
}
function setMode(m) { mode = m; renderMode(); if (net.leader) net.send({ t: 'mode', mode }); }
$('btnPlay').onclick = () => { audio.unlock(); if (!net.inParty || net.leader) startMatch(); };
$('btnCreate').onclick = async () => {
  audio.unlock(); $('partyMsg').textContent = 'Opretter party…';
  try { const code = await net.create(); $('partyMsg').textContent = 'Del koden med dine venner!'; toast('Party oprettet – koden er ' + code, 'good'); audio.sfx('join'); }
  catch (e) { $('partyMsg').textContent = e.message; toast(e.message, 'bad'); }
  renderParty();
};
$('btnJoin').onclick = () => { $('joinErr').textContent = ''; $('joinInput').value = ''; modal('joinModal', true); setTimeout(() => $('joinInput').focus(), 50); };
$('joinInput').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 5); });
$('joinInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('joinGo').click(); });
$('joinGo').onclick = async () => {
  const code = $('joinInput').value.trim();
  $('joinErr').textContent = ''; $('joinGo').disabled = true; $('joinGo').textContent = 'SØGER…';
  try { await net.join(code); modal('joinModal', false); toast('Du er med i partyet!', 'good'); audio.sfx('join'); }
  catch (e) { $('joinErr').textContent = e.message; }
  $('joinGo').disabled = false; $('joinGo').textContent = 'JOIN';
  renderParty();
};
$('btnLeave').onclick = () => { net.leave(); toast('Du forlod partyet'); renderParty(); };
$('copyCode').onclick = () => {
  const code = net.code || '';
  const done = () => { $('copyCode').textContent = 'KOPIERET ✓'; setTimeout(() => $('copyCode').textContent = 'KOPIÉR KODE', 1500); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(done, () => { prompt('Kopiér koden:', code); });
  else { prompt('Kopiér koden:', code); }
};
$('btnDance').onclick = () => { if (lobby) { lobby.dance = !lobby.dance; $('btnDance').textContent = lobby.dance ? '✋ STOP' : '💃 DANS'; net.send({ t: 'emote', r: 1, id: me.id }); } };
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => {
  document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b));
  const t = b.dataset.tab;
  show('locker', t === 'locker'); $('rightCol').classList.toggle('hidden', t === 'locker');
  if (t === 'settings') openSettings();
  if (t === 'locker') buildLocker();
});
$('btnLocker2').onclick = () => document.querySelector('.tabs button[data-tab=locker]').click();
$('lockerDone').onclick = () => document.querySelector('.tabs button[data-tab=play]').click();
$('meCard').onclick = openSettings;

// ---------- locker ----------
let lockerTab = 'c1';
const LTABS = { c1: 'FARVE 1', c2: 'FARVE 2', pattern: 'MØNSTER', hat: 'HAT', eyes: 'ØJNE', random: '🎲 TILFÆLDIG' };
const ICONS = { none: '∅', cap: '🧢', bunny: '🐰', horns: '😈', halo: '😇', tophat: '🎩', crown: '👑', propeller: '🚁', cat: '🐱', flower: '🌸', round: '👀', sparkle: '🤩', happy: '😊', wink: '😉', sleepy: '😴', cool: '😎',
  solid: '⬤', stripes: '▤', dots: '⠿', split: '◐', stars: '★', zigzag: '〰', gradient: '▒', hearts: '♥' };
function buildLocker() {
  const tabs = $('ltabs'); tabs.innerHTML = '';
  for (const [k, v] of Object.entries(LTABS)) { const b = document.createElement('button'); b.textContent = v; b.className = lockerTab === k ? 'on' : ''; b.onclick = () => { if (k === 'random') { prof.skin = randomSkin(); applySkin(); } else lockerTab = k; buildLocker(); }; tabs.appendChild(b); }
  const sw = $('swatches'); sw.innerHTML = '';
  const opts = lockerTab === 'c1' || lockerTab === 'c2' ? PALETTE : lockerTab === 'pattern' ? PATTERNS : lockerTab === 'hat' ? HATS : EYES;
  opts.forEach(o => {
    const b = document.createElement('div'); b.className = 'sw' + (prof.skin[lockerTab] === o ? ' on' : '');
    if (lockerTab === 'c1' || lockerTab === 'c2') b.style.background = o;
    else b.innerHTML = `<span><span class="ico">${ICONS[o] || '•'}</span>${o.toUpperCase()}</span>`;
    b.onclick = () => { prof.skin = { ...prof.skin, [lockerTab]: o }; applySkin(); buildLocker(); audio.sfx('pop'); };
    sw.appendChild(b);
  });
}
function applySkin() { saveProfile(); syncLobbyChars(); if (lobby) lobby.fx.confetti(new THREE.Vector3(0, 1.5, 0), 20, 2); }

// ---------- settings ----------
function openSettings() {
  $('setName').value = prof.name; $('setMusic').value = audio.vol.music; $('setSfx').value = audio.vol.sfx; $('setSens').value = settings.sens;
  document.querySelectorAll('#setQuality button').forEach(b => b.classList.toggle('on', b.dataset.q === settings.quality));
  modal('settingsModal', true);
}
$('setName').addEventListener('change', e => { const n = e.target.value.replace(/[^\wæøåÆØÅ \-]/g, '').trim().slice(0, 14); if (n) { prof.name = n; saveProfile(); syncLobbyChars(); renderParty(); } });
$('setMusic').oninput = e => audio.setVolume('music', +e.target.value);
$('setSfx').oninput = e => audio.setVolume('sfx', +e.target.value);
$('setSens').oninput = e => { settings.sens = +e.target.value; store.set('wd-settings', settings); };
document.querySelectorAll('#setQuality button').forEach(b => b.onclick = () => { settings.quality = b.dataset.q; store.set('wd-settings', settings); applyQuality(renderer, settings.quality); openSettings(); toast('Grafik: ' + (settings.quality === 'high' ? 'høj' : 'lav') + ' (gælder fra næste bane)'); });

// ---------- party events ----------
net.on('roster', () => { renderParty(); });
net.on('joined', p => { toast(p.name + ' kom med i partyet!', 'good'); audio.sfx('join'); if (net.leader) net.send({ t: 'mode', mode }); });
net.on('left', p => { toast(p.name + ' forlod partyet'); if (state === 'match' && net.leader) leaderOut(p.id, true); });
net.on('ended', why => { toast(why, 'bad'); if (state === 'match') { cleanupMatch(); enterLobby(); } renderParty(); });
net.on('msg', (m, from) => onMessage(m, from));

// ============================== MATCH ==============================
const isLeader = () => !net.inParty || net.leader;

function startMatch() {
  if (state !== 'lobby') return;
  const seed = Math.floor(Math.random() * 1e9), r = rng(seed);
  const humans = net.inParty ? net.list().map(p => ({ id: p.id, name: p.name, skin: p.skin })) : [{ id: me.id, name: me.name, skin: me.skin }];
  const course = mode.id === 'course';
  const total = course ? Math.max(humans.length, 8) : 12;
  const players = humans.slice();
  const names = botNames(total, r);
  for (let i = 0; players.length < total; i++) players.push({ id: 'bot' + i, name: names[i], skin: randomSkin(r), bot: true, skill: 0.3 + r() * 0.6 });
  const races = MAPS.map(m => m.id).sort(() => r() - 0.5), arenas = ARENAS.map(a => a.id).sort(() => r() - 0.5);
  const rdefs = course ? [{ type: 'race', practice: true }] : MODES[mode.id].rounds;
  let ri = 0, ai = 0;
  const rounds = rdefs.map((d, i) => ({ ...d, map: course ? mode.map : d.type === 'survival' ? arenas[ai++ % arenas.length] : races[ri++ % races.length], diff: 1 + 0.22 * i }));
  const msg = { t: 'match', mode: { ...mode }, players, rounds, seed };
  net.send(msg); onMatch(msg);
  net.inMatch = true;
  setTimeout(() => leaderStartRound(0), 300);
}

function onMatch(m) {
  cleanupMatch();
  match = { mode: m.mode, players: m.players, rounds: m.rounds, seed: m.seed, alive: new Set(m.players.map(p => p.id)), idx: -1, quals: {} };
  state = 'match';
  show('lobby', false); show('locker', false); modal('modeModal', false); modal('joinModal', false); modal('settingsModal', false);
  $('rightCol').classList.remove('hidden');
  document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x.dataset.tab === 'play'));
  if (lobby) lobby.dance = false;
  show('hud', true);
}

function leaderStartRound(i) {
  if (!match || !isLeader()) return;
  const rd = match.rounds[i];
  const parts = match.players.filter(p => match.alive.has(p.id)).map(p => p.id).sort(() => Math.random() - 0.5);
  let teams = null;
  if (rd.type === 'team') { teams = {}; parts.forEach((id, k) => { teams[id] = k % 2 ? 'blue' : 'red'; }); }
  const n = parts.length;
  const quota = rd.final ? 1 : rd.practice ? n : rd.type === 'team' ? Math.ceil(n / 2) : clamp(Math.round(n * (rd.q || 0.6)), 1, Math.max(1, n - 1));
  const msg = { t: 'round', i, type: rd.type, map: rd.map, diff: rd.diff, final: !!rd.final, practice: !!rd.practice, parts, teams, quota, seed: match.seed + i * 977, startAt: net.now() + 7200 };
  net.send(msg); onRound(msg);
}

// ---------- building a round ----------
function makeEnt(p, spawn, local, R) {
  const model = new Character(p.skin);
  R.scene.add(model.root);
  const e = { id: p.id, name: p.name, skin: p.skin, bot: !!p.bot, model, tag: null, mover: null, brain: null, buf: [], last: 0, status: 'play',
    pos: new THREE.Vector3(spawn.x, spawn.y, spawn.z), yaw: spawn.yaw || 0, anim: { speed: 0, grounded: true, vy: 0, dash: 0, stun: 0 }, prevDash: 0, prevStun: 0, team: R.teams ? R.teams[p.id] : null, hideT: 0 };
  if (p.id !== me.id) {
    e.tag = nameTag(p.name, e.team === 'red' ? '#ff6b81' : e.team === 'blue' ? '#6fb1ff' : p.bot ? '#ffffff' : '#ffd23f');
    model.root.add(e.tag);
  }
  if (e.team) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.07, 6, 24), M(e.team === 'red' ? '#ff4d6d' : '#3a86ff', { emissive: e.team === 'red' ? '#ff4d6d' : '#3a86ff', ei: 1.2 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.06; model.root.add(ring);
  }
  if (local) {
    e.mover = new Mover(R.world);
    e.mover.spawn(new THREE.Vector3(spawn.x, spawn.y, spawn.z), spawn.yaw || 0);
    e.mover.frozen = true;
    if (p.bot) e.brain = new Bot(e.mover, R.map, p.skill || 0.5, rng(match.seed + hash(p.id) * 31 + R.i * 7));
  }
  model.root.position.copy(e.pos); model.root.rotation.y = e.yaw;
  return e;
}

function onRound(m) {
  if (!match) return;
  disposeRound();
  match.idx = m.i;
  const def = [...MAPS, ...ARENAS].find(x => x.id === m.map);
  const theme = THEMES[def.theme];
  const scene = makeWorldScene(theme, settings.quality);
  const world = new World();
  const root = new THREE.Group(); scene.add(root);
  const ctx = makeCtx(root, world, theme, m.diff, m.seed);
  const map = buildMap(m.map, ctx);
  R = { i: m.i, type: m.type, final: m.final, practice: m.practice, quota: m.quota, parts: m.parts, teams: m.teams, startAt: m.startAt, def, theme, scene, world, root, ctx, map,
    fx: new FX(scene), ents: new Map(), finishOrder: [], outSet: new Set(), ended: false, phase: 'intro', lastSend: 0, countBeep: 4, spectating: false, spectId: null, shake: 0,
    timeLimit: m.type === 'survival' ? (m.map === 'crumble' ? 90 : m.map === 'lavarise' ? 75 : 70) : m.practice ? 240 : 150, camPos: new THREE.Vector3(), camLook: new THREE.Vector3(), fov: 64 };
  ctx.others = () => { const out = []; for (const e of R.ents.values()) if (!e.mover && e.status === 'play') out.push(e.pos); return out; };
  const byId = new Map(match.players.map(p => [p.id, p]));
  m.parts.forEach((id, k) => {
    const p = byId.get(id); if (!p) return;
    const local = id === me.id || (isLeader() && p.bot);
    R.ents.set(id, makeEnt(p, map.spawns[k % map.spawns.length], local, R));
  });
  const mine = R.ents.get(me.id);
  if (!mine) { R.spectating = true; R.spectId = m.parts[0]; toast('Du er ude af showet – du ser med som tilskuer 👀'); }
  camYaw = mine ? mine.yaw : 0; camPitch = 0.38;
  // intro card
  const total = match.rounds.length;
  $('iRound').textContent = m.practice ? 'ØVEBANE' : m.final ? 'FINALE' : 'RUNDE ' + (m.i + 1) + ' AF ' + total;
  $('iName').textContent = def.icon + ' ' + def.name;
  $('iDesc').textContent = def.desc;
  const typeTxt = m.practice ? 'KOM I MÅL' : m.final ? (m.type === 'survival' ? 'SIDSTE MAND STÅENDE VINDER' : 'FØRST I MÅL VINDER') : m.type === 'survival' ? 'SURVIVAL · ' + m.quota + ' GÅR VIDERE' : m.type === 'team' ? 'TEAM RACE · RØD MOD BLÅ' : 'RACE · ' + m.quota + ' AF ' + m.parts.length + ' GÅR VIDERE';
  $('iType').textContent = typeTxt;
  $('intro').classList.add('on');
  modal('results', false); show('final', false); show('hud', true);
  $('hProgress').classList.toggle('hidden', map.arena);
  $('spect').classList.add('hidden');
  if (mine && m.teams) toast('Du er på ' + (m.teams[me.id] === 'red' ? '🔴 RØDT' : '🔵 BLÅT') + ' hold!');
  audio.play(theme.music);
  if (document.pointerLockElement) document.exitPointerLock();
}

function disposeRound() {
  if (!R) return;
  for (const e of R.ents.values()) e.model.dispose();
  R.fx.dispose();
  disposeTree(R.scene);
  R = null;
}
function cleanupMatch() {
  disposeRound();
  match = null; net.inMatch = false;
  $('intro').classList.remove('on'); $('banner').classList.remove('on');
  modal('results', false); modal('pause', false); show('final', false);
}

// ---------- messages ----------
function onMessage(m, from) {
  switch (m.t) {
    case 'mode': if (!net.leader) { mode = m.mode; renderMode(); } break;
    case 'emote': if (lobby) { const c = lobby.chars.get(m.id); if (c) c.danceT = 5; } break;
    case 'match': if (!net.leader) onMatch(m); break;
    case 'round': if (!net.leader) onRound(m); break;
    case 'st': remoteState(m.id, m.s); break;
    case 'bs': if (!net.leader) m.s.forEach(s => remoteState(s[0], s.slice(1))); break;
    case 'q': if (!net.leader) applyQ(m.id, m.place); break;
    case 'o': if (!net.leader) applyOut(m.id); break;
    case 'rend': if (!net.leader) onRoundEnd(m); break;
    case 'final': if (!net.leader) onFinal(m); break;
    case 'abort': if (!net.leader && state === 'match') { toast('Lederen afsluttede kampen'); cleanupMatch(); enterLobby(); } break;
    case 'fin': if (net.leader) leaderFinish(m.id); break;
    case 'out': if (net.leader) leaderOut(m.id, !!m.quit); break;
  }
}
function remoteState(id, s) {
  if (!R) return;
  const e = R.ents.get(id);
  if (!e || e.mover) return;
  e.buf.push({ t: performance.now(), s });
  if (e.buf.length > 6) e.buf.shift();
  e.last = performance.now();
}
function encode(e) {
  const m = e.mover, a = m.anim();
  return [+m.pos.x.toFixed(2), +m.pos.y.toFixed(2), +m.pos.z.toFixed(2), +m.yaw.toFixed(3), +a.speed.toFixed(1), +a.vy.toFixed(1), +a.dash.toFixed(2), (a.grounded ? 1 : 0) | (a.stun > 0 ? 2 : 0), +m.vel.x.toFixed(1), +m.vel.z.toFixed(1)];
}

// ---------- leader decisions ----------
function leaderFinish(id) {
  if (!R || R.ended || R.type === 'survival') return;
  const e = R.ents.get(id);
  if (!e || e.status !== 'play' || R.finishOrder.includes(id)) return;
  R.finishOrder.push(id);
  const place = R.finishOrder.length;
  net.send({ t: 'q', id, place }); applyQ(id, place);
  leaderCheck();
}
function leaderOut(id, quit) {
  if (!R || R.ended) return;
  const e = R.ents.get(id);
  if (!e || (e.status !== 'play' && !quit)) return;
  if (R.type !== 'survival' && !quit) return;
  R.outSet.add(id);
  if (quit) match.alive.delete(id);
  net.send({ t: 'o', id }); applyOut(id);
  leaderCheck();
}
function leaderCheck() {
  if (!R || R.ended || !isLeader()) return;
  const t = (net.now() - R.startAt) / 1000;
  const n = R.parts.length;
  const playing = R.parts.filter(id => { const e = R.ents.get(id); return e && e.status === 'play'; });
  let end = false;
  if (R.practice) end = R.parts.filter(id => !id.startsWith('bot')).every(id => R.finishOrder.includes(id) || R.outSet.has(id)) || t > R.timeLimit;
  else if (R.type === 'survival') end = (R.final ? playing.length <= 1 : playing.length <= R.quota) || t > R.timeLimit;
  else if (R.type === 'team') end = R.finishOrder.length >= Math.ceil(n / 2) || t > R.timeLimit;
  else end = R.finishOrder.length >= (R.final ? 1 : R.quota) || t > R.timeLimit;
  if (playing.length === 0) end = true;
  if (end) leaderEndRound();
}
function progressOf(id) { const e = R.ents.get(id); return e ? (R.map.arena ? -Math.hypot(e.pos.x, e.pos.z) + e.pos.y * 3 : e.pos.z) : -1e9; }
function leaderEndRound() {
  R.ended = true;
  let q = [], out = [], winner = null, win = null;
  const alive = R.parts.filter(id => !R.outSet.has(id));
  if (R.practice) { q = R.finishOrder.slice(); out = []; }
  else if (R.type === 'survival') {
    q = alive.filter(id => R.ents.get(id) && R.ents.get(id).status !== 'out');
    out = R.parts.filter(id => !q.includes(id));
    if (R.final) { const best = q.slice().sort((a, b) => progressOf(b) - progressOf(a)); winner = best[0] || [...R.outSet].pop() || R.parts[0]; }
  } else if (R.type === 'team') {
    const score = { red: 0, blue: 0 };
    R.finishOrder.forEach((id, k) => { score[R.teams[id]] += 1 + (R.finishOrder.length - k) * 0.01; });
    win = score.red >= score.blue ? 'red' : 'blue';
    q = R.parts.filter(id => R.teams[id] === win && !R.outSet.has(id)); out = R.parts.filter(id => !q.includes(id));
  } else {
    q = R.finishOrder.slice(0, R.final ? 1 : R.quota);
    out = R.parts.filter(id => !q.includes(id));
    if (R.final) winner = q[0] || R.parts.slice().sort((a, b) => progressOf(b) - progressOf(a))[0];
  }
  if (!R.practice) { match.alive = new Set(R.final ? [winner] : q); }
  const msg = { t: 'rend', q, out, winner, win, order: R.finishOrder };
  net.send(msg); onRoundEnd(msg);
  setTimeout(() => {
    if (!match) return;
    const next = match.idx + 1;
    if (R && (R.final || R.practice) || next >= match.rounds.length || match.alive.size <= 1) {
      const w = R && R.practice ? (R.finishOrder[0] || null) : (winner || [...match.alive][0] || q[0] || null);
      const fm = { t: 'final', winner: w, practice: !!(R && R.practice), order: R ? R.finishOrder : [] };
      net.send(fm); onFinal(fm);
    } else leaderStartRound(next);
  }, 5600);
}

// ---------- applying results everywhere ----------
function applyQ(id, place) {
  if (!R) return;
  const e = R.ents.get(id); if (!e) return;
  e.status = 'q'; e.place = place;
  if (id === me.id) {
    const txt = R.final ? '👑 DU VANDT!' : R.practice ? 'I MÅL! #' + place : R.type === 'team' ? 'I MÅL! #' + place : 'KVALIFICERET!';
    banner(txt + `<small>Plads ${place}</small>`, 'q', 2600); audio.sfx(R.final ? 'win' : 'qualify');
    R.fx.confetti(e.pos.clone().add(new THREE.Vector3(0, 1, 0)), 80, 4);
    if (!R.practice) addXp(R.final ? 250 : 60);
    setTimeout(() => { if (R && R.ents.get(me.id) && R.ents.get(me.id).status === 'q') startSpectate(); }, 2600);
  }
}
function applyOut(id) {
  if (!R) return;
  const e = R.ents.get(id); if (!e) return;
  e.status = 'out'; e.hideT = 1.2;
  R.fx.splash(e.pos.clone());
  if (id === me.id) { banner('UDE!<small>Du faldt af – se de andre spille</small>', 'out', 2600); audio.sfx('eliminated'); setTimeout(startSpectate, 1500); }
}
function onRoundEnd(m) {
  if (!R) return;
  R.ended = true;
  for (const id of m.out) { const e = R.ents.get(id); if (e && e.status === 'play') { e.status = 'out'; } }
  const myQ = m.q.includes(me.id), myIn = R.parts.includes(me.id);
  if (myIn && !R.practice) {
    if (R.final) { /* final screen comes next */ }
    else if (myQ) banner(R.type === 'team' ? (m.win === R.teams[me.id] ? 'DIT HOLD VANDT!' : 'KVALIFICERET!') : 'KVALIFICERET!', 'q', 2000);
    else { banner('ELIMINERET', 'out', 2400); audio.sfx('eliminated'); }
  }
  // results board
  const title = R.practice ? 'RESULTAT' : R.final ? 'FINALEN ER SLUT' : R.type === 'team' ? (m.win === 'red' ? '🔴 RØDT HOLD VANDT' : '🔵 BLÅT HOLD VANDT') : 'RUNDE ' + (R.i + 1) + ' SLUT';
  $('rTitle').textContent = title;
  const rows = R.parts.map(id => ({ id, e: R.ents.get(id), q: m.q.includes(id), place: m.order ? m.order.indexOf(id) : -1 }))
    .sort((a, b) => (b.q - a.q) || ((a.place < 0 ? 99 : a.place) - (b.place < 0 ? 99 : b.place)));
  $('rList').innerHTML = rows.map(r => `<div class="rl ${r.q ? 'q' : 'out'} ${r.id === me.id ? 'me' : ''}"><span class="dot" style="background:${esc(r.e ? r.e.skin.c1 : '#888')}"></span>${esc(r.e ? r.e.name : r.id)}${r.id === me.id ? ' (dig)' : ''}<em>${r.q ? (r.place >= 0 ? '#' + (r.place + 1) + ' ✔' : '✔') : '✖'}</em></div>`).join('');
  $('rNext').textContent = R.final || R.practice ? 'Vinderen findes…' : 'Næste runde starter om lidt…';
  setTimeout(() => { if (R && R.ended) modal('results', true); }, 1200);
}
function onFinal(m) {
  if (!match) return;
  modal('results', false);
  const w = m.winner && R ? R.ents.get(m.winner) : null;
  const wp = match.players.find(p => p.id === m.winner);
  state = 'match';
  R && (R.finalScreen = { winner: m.winner, t: 0 });
  $('fTitle').textContent = m.practice ? (m.order && m.order.length ? 'FØRST I MÅL' : 'BANEN ER SLUT') : 'VINDER';
  $('fWinner').textContent = m.practice ? (m.order && m.order.length ? '🏁 ' + (match.players.find(p => p.id === m.order[0]) || {}).name : 'Ingen i mål') : (wp ? '👑 ' + wp.name : '—');
  $('fInfo').textContent = m.practice ? (m.winner === me.id ? 'Du kom først i mål! 🎉' : (m.order || []).includes(me.id) ? 'Godt løbet – du kom i mål!' : 'Godt forsøgt – prøv igen!') : m.winner === me.id ? 'DU VANDT SHOWET! +250 XP' : 'Bedre held næste gang – du fik XP for at være med!';
  show('final', true); show('hud', false);
  if (m.winner === me.id) audio.sfx('win');
  if (w && R) {
    // golden podium for the winner
    const at = w.pos.clone();
    const pod = new THREE.Group();
    const gold = M('#ffd23f', { metal: 0.55, rough: 0.25, emissive: '#ffb703', ei: 0.25 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.75, 2.2, 32), gold); base.position.y = -0.1; base.castShadow = base.receiveShadow = true; pod.add(base);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.09, 8, 40), M('#ffffff', { emissive: '#ffffff', ei: 1.5 })); ring.rotation.x = Math.PI / 2; ring.position.y = 1.01; pod.add(ring);
    const one = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.1), M('#ffffff', { map: canvasTex(128, 64, (g, cw, ch) => { g.fillStyle = '#ffb703'; g.fillRect(0, 0, cw, ch); g.fillStyle = '#ffffff'; g.font = '400 52px "Lilita One", sans-serif'; g.textAlign = 'center'; g.fillText('#1', cw / 2, 52); }) }));
    one.position.set(0, 0.35, 1.66); one.rotation.x = -0.06; pod.add(one);
    pod.position.copy(at); R.scene.add(pod);
    at.y += 1;   // the winner stands on top
    w.model.setSkin({ ...w.skin, hat: 'crown' });
    R.finalScreen.pos = at; R.finalScreen.conf = 0;
    R.fx.confetti(at.clone().add(new THREE.Vector3(0, 2, 0)), 220, 8); R.spectId = w.id; R.spectating = true;
  }
  $('clickToPlay').classList.add('hidden'); $('spect').classList.add('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
  addXp(30);
  net.inMatch = false;
}
$('fBack').onclick = () => { cleanupMatch(); enterLobby(); };

// ---------- pause ----------
function togglePause() { const on = !$('pause').classList.contains('on'); modal('pause', on); if (on && document.pointerLockElement) document.exitPointerLock(); }
$('pResume').onclick = () => modal('pause', false);
$('pSettings').onclick = () => { modal('pause', false); openSettings(); };
$('pLeave').onclick = () => {
  modal('pause', false);
  if (isLeader()) { net.send({ t: 'abort' }); }
  else { net.send({ t: 'out', id: me.id, quit: true }); }
  cleanupMatch(); enterLobby();
};

// ---------- spectating ----------
function startSpectate() { if (!R) return; R.spectating = true; cycleSpectate(0); }
function cycleSpectate(dir) {
  if (!R) return;
  const list = R.parts.filter(id => { const e = R.ents.get(id); return e && e.status === 'play'; });
  const all = list.length ? list : R.parts.filter(id => R.ents.get(id));
  if (!all.length) return;
  let i = all.indexOf(R.spectId);
  i = i < 0 ? 0 : (i + dir + all.length) % all.length;
  R.spectId = all[i];
  const e = R.ents.get(R.spectId);
  $('spect').classList.remove('hidden');
  $('spect').textContent = '👀 SER: ' + (e ? e.name : '') + '  ·  ← → skift';
}

// ============================== FRAME ==============================
const _v = new THREE.Vector3(), _t = new THREE.Vector3();
function sampleRemote(e, now) {
  const b = e.buf;
  if (!b.length) return null;
  const target = now - 110;
  let s = b[b.length - 1].s;
  for (let i = 1; i < b.length; i++) {
    if (b[i].t >= target) {
      const a = b[i - 1], c = b[i], k = clamp((target - a.t) / Math.max(1, c.t - a.t), 0, 1);
      s = a.s.map((v, j) => j === 3 ? a.s[3] + angDiff(c.s[3], a.s[3]) * k : j === 7 ? c.s[7] : v + (c.s[j] - v) * k);
      return s;
    }
  }
  return s;
}

function tickMatch(dt) {
  if (!R) return;
  const now = performance.now(), t = (net.now() - R.startAt) / 1000, leader = isLeader();
  R.t = t;
  const prevPhase = R.phase;
  R.phase = t < -3 ? 'intro' : t < 0 ? 'count' : 'play';
  if (prevPhase === 'intro' && R.phase !== 'intro') { $('intro').classList.remove('on'); $('clickToPlay').classList.toggle('hidden', document.pointerLockElement === canvas); if (!R.ents.get(me.id)) cycleSpectate(0); }
  if (R.phase === 'count' || (R.phase === 'play' && R.countBeep > 0)) {
    const c = Math.ceil(-t);
    if (c < R.countBeep) {
      R.countBeep = c;
      if (c > 0) { banner(String(c), 'n', 700); audio.sfx('beep'); } else { banner('GO!', 'go', 900); audio.sfx('go'); }
    }
  }
  // obstacles (shared clock) then collisions
  R.ctx.t = t + 30; R.world.time = R.ctx.t;
  for (const u of R.ctx.ups) u(R.ctx.t, dt);
  R.world.sync();

  const live = R.phase === 'play' && !R.finalScreen;
  const mine = R.ents.get(me.id);
  if (mine && mine.mover && wantReset && live && mine.status === 'play' && !R.map.arena) mine.mover.respawn();
  wantReset = false;

  // simulate our own character and (as leader) the bots
  for (const e of R.ents.values()) {
    if (!e.mover) continue;
    const mv = e.mover;
    mv.frozen = !live || e.status === 'out';
    let inp = { x: 0, z: 0, jump: false };
    if (e.id === me.id) { const i = readInput(); if (!$('pause').classList.contains('on') && e.status !== 'out') inp = i; }
    else if (e.brain && live && e.status === 'play') inp = e.brain.input(dt, t);
    else if (e.brain && e.status === 'q') inp = e.brain.input(dt, t);
    if (e.status === 'q' && e.id !== me.id) inp.jump = false;
    mv.step(dt, inp, dt);
    // bump into the others
    for (const o of R.ents.values()) {
      if (o === e || o.status === 'out') continue;
      const op = o.mover ? o.mover.pos : o.pos, ov = o.mover ? [o.mover.vel.x, 0, o.mover.vel.z] : o.vel || [0, 0, 0];
      mv.pushFrom(op, ov, o.mover ? o.mover.dashT > 0 : o.anim.dash > 0);
    }
    handleEvents(e);
    e.pos.copy(mv.pos); e.yaw = mv.yaw; Object.assign(e.anim, mv.anim());
  }
  // everyone else from the network
  for (const e of R.ents.values()) {
    if (e.mover) continue;
    const s = sampleRemote(e, now);
    if (!s) continue;
    e.pos.set(s[0], s[1], s[2]); e.yaw = s[3]; e.vel = [s[8] || 0, 0, s[9] || 0];
    e.anim.speed = s[4]; e.anim.vy = s[5]; e.anim.dash = s[6]; e.anim.grounded = !!(s[7] & 1); e.anim.stun = s[7] & 2 ? 0.5 : 0;
    if (e.anim.dash > 0.8 && e.prevDash <= 0) R.fx.dash(e.pos, _v.set(Math.sin(e.yaw) * 19, 7, Math.cos(e.yaw) * 19), e.skin.c1);
    if (e.anim.stun > 0 && e.prevStun <= 0) R.fx.stars(e.pos);
    e.prevDash = e.anim.dash; e.prevStun = e.anim.stun;
  }
  // the winner stays on the podium, with confetti now and then
  if (R.finalScreen && R.finalScreen.pos) {
    const w = R.ents.get(R.finalScreen.winner);
    if (w) { w.pos.copy(R.finalScreen.pos); Object.assign(w.anim, { grounded: true, speed: 0, vy: 0, dash: 0, stun: 0 }); w.status = 'q'; w.hideT = 9; }
    R.finalScreen.conf -= dt;
    if (R.finalScreen.conf < 0) { R.finalScreen.conf = 1.6; R.fx.confetti(R.finalScreen.pos.clone().add(new THREE.Vector3(0, 3, 0)), 70, 6); }
  }
  // draw the characters
  for (const e of R.ents.values()) {
    const root = e.model.root;
    root.position.copy(e.pos); root.rotation.y = e.yaw;
    if (e.status === 'out') { e.hideT -= dt; root.visible = e.hideT > 0; }
    else root.visible = true;
    if (e.anim.dash > 0) R.fx.trail(e.pos, e.skin.c1);
    const celebrate = e.status === 'q' && e.anim.grounded && e.anim.speed < 1;
    const win = R.finalScreen && R.finalScreen.winner === e.id;
    e.model.update(dt, { ...e.anim, celebrate: celebrate || win, groundDist: e.anim.grounded ? 0 : Math.min(6, e.anim.vy < 0 ? 1.5 : 0.8) });
  }
  // send our state ~15 times a second
  if (now - R.lastSend > 66 && net.inParty) {
    R.lastSend = now;
    if (mine && mine.mover && mine.status !== 'out') net.send({ t: 'st', r: 1, id: me.id, s: encode(mine) });
    if (net.leader) {
      const bs = [];
      for (const e of R.ents.values()) if (e.bot && e.mover && e.status !== 'out') bs.push([e.id, ...encode(e)]);
      if (bs.length) net.send({ t: 'bs', s: bs });
    }
  }
  if (leader && live && !R.ended && Math.floor(t * 4) !== R.lastCheck) { R.lastCheck = Math.floor(t * 4); leaderCheck(); }
  // ambience
  if (R.map.snow) R.fx.snow(camera.position);
  if (R.def.theme === 'lava' && Math.random() < 0.5) R.fx.embers(camera.position);
  R.fx.update(dt);
  updateCamera(dt);
  updateHud(t);
}

function handleEvents(e) {
  const mv = e.mover, ev = mv.events, mine = e.id === me.id, near = mine || e.pos.distanceToSquared(camera.position) < 400;
  for (const k of ev) {
    switch (k) {
      case 'jump': R.fx.dust(mv.pos, 6); if (mine) audio.sfx('jump'); break;
      case 'dash': R.fx.dash(mv.pos, mv.vel, e.skin.c1); if (mine) { audio.sfx('dash'); R.fovKick = 12; } break;
      case 'land': R.fx.dust(mv.pos, 10); if (mine) audio.sfx('land'); break;
      case 'bounce': R.fx.dust(mv.pos, 12, '#ffd23f'); if (near) audio.sfx('bounce'); break;
      case 'hit': R.fx.stars(mv.pos); if (mine) { audio.sfx('hit'); R.shake = 0.5; } else if (near) audio.sfx('hit'); break;
      case 'checkpoint': if (mine) { audio.sfx('checkpoint'); toast('Checkpoint!'); } break;
      case 'respawn': R.fx.dust(mv.pos, 14, '#ffffff'); break;
      case 'fall': case 'kill':
        if (R.type === 'survival') {
          if (e.status === 'play' && R.phase === 'play' && !e.outSent) {
            e.outSent = true;
            if (isLeader()) leaderOut(e.id); else if (mine) net.send({ t: 'out', id: me.id });
            if (mine) audio.sfx(k === 'kill' ? 'splash' : 'fall');
          }
        } else {
          R.fx.splash(mv.pos.clone()); if (mine) audio.sfx(k === 'kill' ? 'splash' : 'fall');
          mv.respawn();
        }
        break;
      case 'finish':
        if (R.type !== 'survival' && e.status === 'play' && R.phase === 'play') {
          if (isLeader()) leaderFinish(e.id);
          else if (mine) { net.send({ t: 'fin', id: me.id }); banner('I MÅL!', 'q', 1200); }
        }
        break;
    }
  }
  ev.length = 0;
}

function updateCamera(dt) {
  const t = R.t;
  if (R.phase === 'intro' && !R.finalScreen) {
    const k = clamp((t + 7.2) / 4.2, 0, 1), ease = k * k * (3 - 2 * k);
    if (R.map.arena) { const a = t * 0.3; _v.set(Math.cos(a) * 32, 22 - ease * 6, Math.sin(a) * 32); _t.set(0, 0, 0); }
    else { const L = R.map.length || 150; _v.set(18 - ease * 18, 30 - ease * 20, L - ease * (L + 14)); _t.set(0, 0, Math.max(0, L - 40 - ease * (L - 30))); }
    R.camPos.copy(_v); R.camLook.copy(_t);
    camera.position.copy(_v); camera.lookAt(_t);
    R.scene.userData.setFocus(_t);
    return;
  }
  let target = R.ents.get(me.id);
  if (R.spectating || !target || target.status === 'out') {
    target = R.ents.get(R.spectId) || target;
    if (target && target.status === 'out' && !R.finalScreen) { cycleSpectate(0); target = R.ents.get(R.spectId) || target; }
  }
  if (!target) return;
  if (R.finalScreen) { camYaw += dt * 0.35; camPitch = damp(camPitch, 0.1, 2, dt); }
  const dist = R.finalScreen ? 6 : 7.6, look = _t.copy(target.pos); look.y += 1.5;
  const cp = Math.cos(camPitch), sp = Math.sin(camPitch);
  _v.set(look.x - Math.sin(camYaw) * dist * cp, look.y + dist * sp, look.z - Math.cos(camYaw) * dist * cp);
  if (_v.y < look.y - 1) _v.y = look.y - 1;
  if (R.finalScreen) look.y -= 2.1;   // keep the winner in the upper half, above the winner text
  if (R.shake > 0) { R.shake -= dt; _v.x += (Math.random() - 0.5) * R.shake; _v.y += (Math.random() - 0.5) * R.shake; }
  const k = 1 - Math.exp(-dt * 14);
  R.camPos.lerp(_v, k); R.camLook.lerp(look, 1 - Math.exp(-dt * 18));
  camera.position.copy(R.camPos); camera.lookAt(R.camLook);
  const fast = target.anim.dash > 0 ? 10 : 0;
  R.fovKick = Math.max(0, (R.fovKick || 0) - dt * 30);
  const want = 64 + fast + (R.fovKick || 0) * 0.5;
  if (Math.abs(camera.fov - want) > 0.05) { camera.fov = damp(camera.fov, want, 8, dt); camera.updateProjectionMatrix(); }
  R.scene.userData.setFocus(target.pos);
}

function updateHud(t) {
  const total = match.rounds.length;
  $('hRound').textContent = (R.practice ? 'ØVEBANE' : R.final ? 'FINALE' : 'RUNDE ' + (R.i + 1) + '/' + total) + ' · ' + R.def.name;
  const playing = R.parts.filter(id => { const e = R.ents.get(id); return e && e.status === 'play'; }).length;
  if (R.type === 'survival') $('hCount').textContent = '👥 ' + playing + ' TILBAGE' + (R.final ? '' : ' · ' + R.quota + ' GÅR VIDERE');
  else if (R.type === 'team') { const s = { red: 0, blue: 0 }; R.finishOrder.forEach(id => s[R.teams[id]]++); $('hCount').textContent = '🔴 ' + s.red + '  –  ' + s.blue + ' 🔵'; }
  else if (R.practice) $('hCount').textContent = '🏁 ' + R.parts.filter(id => (R.ents.get(id) || {}).status === 'q').length + '/' + R.parts.length + ' I MÅL';
  else $('hCount').textContent = R.final ? '👑 FØRST I MÅL VINDER' : '✔ ' + R.parts.filter(id => (R.ents.get(id) || {}).status === 'q').length + ' / ' + R.quota;
  const left = Math.max(0, Math.ceil(R.timeLimit - Math.max(0, t)));
  $('hTime').textContent = '⏱ ' + Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
  const mine = R.ents.get(me.id);
  if (!R.map.arena && mine) {
    const p = clamp(mine.pos.z / (R.map.length || 1), 0, 1);
    $('hProgress').querySelector('i').style.width = (p * 100) + '%'; $('hProgress').querySelector('b').style.left = (p * 100) + '%';
  }
  const d = $('dash');
  if (mine && mine.mover) {
    const mv = mine.mover, ready = mv.dashCd <= 0 && (mv.canDash || mv.grounded);
    d.querySelector('i').style.width = (ready ? 100 : 100 * (1 - clamp(mv.dashCd / MOVE.dashCd, 0, 1))) + '%';
    d.querySelector('i').style.background = ready ? '#ffd23f' : '#888';
    d.style.display = mine.status === 'play' ? '' : 'none';
  } else d.style.display = 'none';
}

// ============================== LOOP ==============================
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  step(dt);
}
function step(dt) {
  if (state === 'lobby' && lobby) { tickLobby(dt); renderer.render(lobby.scene, camera); }
  else if (state === 'match' && R) { tickMatch(dt); renderer.render(R.scene, camera); }
}

// boot
async function boot() {
  $('bootBar').style.width = '40%';
  await document.fonts.ready.catch(() => {});
  $('bootBar').style.width = '80%';
  lobby = buildLobby();
  $('bootBar').style.width = '100%';
  setTimeout(() => { show('boot', false); enterLobby(); }, 250);
  requestAnimationFrame(frame);
}
boot();
addEventListener('beforeunload', () => net.leave(true));

// debug / test hooks
window.WD = { get state() { return state; }, get round() { return R; }, get match() { return match; }, net, me, step, startMatch, setMode, MODES, keys, press(k, on) { keys[k] = on; }, jump() { jumpPressed = true; },
  skip(sec) { if (R && isLeader()) { R.startAt -= sec * 1000; } }, leaderCheck };
