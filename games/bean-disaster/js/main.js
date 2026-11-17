// BEAN DISASTER: wait on the floating lobby island, get dropped into Bean Town, survive a random
// disaster, earn coins, dress up your bean. Rounds never stop. Solo you play with bots; in a party the
// leader's game runs the rounds for everybody.
//
// Round: intermission (lobby, 15 s) -> prep (on the island, 8 s, the disaster is announced) ->
//        disaster (60 s or until nobody is left) -> results (6 s) -> back to the lobby.
import { THREE, createRenderer, makeWorldScene, clamp, lerp, damp, angDiff } from './engine.js';
import { buildWorld, LOBBY, LAND, SEA, heightAt, MAPS, MAP } from './map.js';
import { Character, nameTag } from './character.js';
import { Mover } from './mover.js';
import { Env, makeDisaster, DISASTERS, DIS, DURATION } from './disasters.js';
import { BotBrain, botNames } from './bots.js';
import { Audio } from './audio.js';
import { FX } from './fx.js';
import { Net, cleanCode } from './net.js';
import { icon, fillIcons } from './icons.js';
import { PALETTE, PATTERNS, EYES, HATS, OUTFITS, randomSkin } from './outfits.js';

const $ = id => document.getElementById(id);
const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const PLAYERS = 10;                                 // beans per round (bots fill the rest)
const TIMES = { intermission: 15, first: 8, prep: 8, results: 6 };
const COLORS = ['#ffd23f', '#3ee6ff', '#ff6fd8', '#7bd389', '#ff8c42', '#c77dff', '#60a5fa', '#f87171', '#b8f35b', '#ffffff'];

// ---------- profile and settings ----------
let prof = store.get('bd-profile', null);
if (!prof || !prof.skin) prof = { name: 'Bean' + (100 + Math.floor(Math.random() * 900)), skin: { c1: '#ff7a3d', c2: '#ffd23f', pattern: 'solid', eyes: 'round', hat: 'none', outfit: 'none' }, coins: 40, owned: [], stats: { rounds: 0, survived: 0, streak: 0, best: 0 } };
prof.owned = prof.owned || []; prof.stats = Object.assign({ rounds: 0, survived: 0, streak: 0, best: 0 }, prof.stats || {});
const saveProf = () => store.set('bd-profile', prof);
saveProf();
const settings = Object.assign({ quality: TOUCH ? 'low' : 'high', sens: 1 }, store.get('bd-settings', {}));
const saveSettings = () => store.set('bd-settings', settings);
const myId = 'p' + Math.random().toString(36).slice(2, 9);
const netMe = { id: myId, name: prof.name, skin: prof.skin };

// ---------- core ----------
const canvas = $('c');
const renderer = createRenderer(canvas, settings.quality);
const scene = makeWorldScene(settings.quality);
const atmos = scene.userData.atmos; atmos.renderer = renderer;
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1500);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
const audio = new Audio();
const net = new Net(netMe);
let map, world, env, fx;
const bodies = new Map();
let me = null;
const app = { state: 'boot', locker: false, spec: null, paused: false };
const game = { phase: 'idle', phaseStart: 0, phaseDur: 0, round: 0, disId: null, seed: 0, disaster: null, host: true, ids: new Set(), wins: {}, spotCount: {}, recent: [], survivors: [], startT: 0, mapId: 'town', recentMaps: ['town'] };
const mapName = () => (MAP[game.mapId] || MAPS[0]).name;
if (TOUCH) document.body.classList.add('touch');

// ============================== BEANS ==============================
const _v = new THREE.Vector3(), _w = new THREE.Vector3();
let colorI = 0;
class Body {
  constructor(o) {
    this.id = o.id; this.name = o.name; this.isMe = !!o.isMe; this.isBot = !!o.isBot; this.remote = !!o.remote;
    this.char = new Character(o.skin); scene.add(this.char.root);
    this.color = COLORS[colorI++ % COLORS.length];
    if (!this.isMe) { this.tag = nameTag(o.name, this.color); this.char.root.add(this.tag); }
    this.mover = new Mover(world);
    this.buf = []; this.yaw = 0; this.anim = { speed: 0, grounded: true, vy: 0, stun: 0, swim: false };
    this.hp = 100; this.stamina = 100; this.cold = 0; this.burnt = 0; this.alive = true; this.onMap = false;
    this.sheltered = false; this.shT = Math.random() * 0.25; this.outT = 0; this.flash = 0; this.hotT = 0; this.acid = false; this.warm = false; this.seen = performance.now();
    this.brain = null;
  }
  get local() { return !this.remote; }
  setName(n) { if (n === this.name) return; this.name = n; if (this.tag) { this.char.root.remove(this.tag); this.tag = nameTag(n, this.color); this.char.root.add(this.tag); } }
  hurt(d, kind, continuous) {
    if (!this.alive || this.remote || game.phase !== 'disaster' || !this.onMap) return;
    this.hp -= d; this.lastKind = kind;
    if (!continuous) { this.flash = 1; if (this.isMe) { audio.sfx('ouch'); flashScreen(Math.min(1, d / 40)); } fx.stars(this.mover.pos); }
    else if (this.isMe) flashScreen(0.18);
    if (this.hp <= 0) eliminate(this, kind);
  }
  burn(k) { this.burnt = Math.min(1, this.burnt + k); }
  tooHot() {
    if (this.hotT > 0) return; this.hotT = 1.2;
    fx.emit({ p: _v.copy(this.mover.pos).add(_w.set(0, 0.3, 0)), v: new THREE.Vector3(0, 3, 0), life: 0.8, size: 0.6, color: '#555', g: 1 });
    if (this.isMe) { toast('OUCH, HOT HOT HOT!', 'hot'); audio.sfx('hot'); } else audio.sfxAt('hot', this.mover.pos, 30);
  }
  dispose() { this.char.dispose(); }
}
function addBody(o) { const b = new Body(o); bodies.set(b.id, b); return b; }
function removeBody(id) { const b = bodies.get(id); if (!b) return; b.dispose(); bodies.delete(id); if (app.spec === b) app.spec = null; }
const localBodies = () => [...bodies.values()].filter(b => b.local && b.alive && b.onMap);

function lobbySpot(i) { const s = map.lobbySpawns[(i ?? Math.floor(Math.random() * 12)) % map.lobbySpawns.length]; return _v.copy(s).add(_w.set((Math.random() - 0.5) * 2, 0.5, (Math.random() - 0.5) * 2)); }
function toLobby(b, i) {
  b.onMap = false; b.mover.spawn(lobbySpot(i), Math.random() * 6); b.cold = 0; b.stamina = 100; b.acid = false;
  fx.confetti(b.mover.pos, 14, 2);
  if (b.brain) b.brain.reset();
}
function toMap(b, i) {
  const s = map.mapSpawns[i % map.mapSpawns.length];
  b.onMap = true; b.alive = true; b.hp = 100; b.stamina = 100; b.cold = 0; b.burnt = 0; b.outT = 0;
  b.mover.spawn(_v.copy(s).add(_w.set((Math.random() - 0.5) * 1.5, 0.4, (Math.random() - 0.5) * 1.5)), Math.atan2(-s.x, -s.z) + Math.PI);
  if (b.brain) b.brain.reset();
}

// ---------- elimination ----------
const WHY = { wave: 'The giant wave got you!', meteor: 'Bonked by a meteor!', lava: 'Way too hot for a bean!', zap: 'Zapped by lightning!', cold: 'You froze like a popsicle!', acid: 'The acid rain got you!', quake: 'Squashed by falling stuff!', wind: 'Gone with the wind!', fall: 'You hit the ground too hard!', drown: 'Too tired to swim!' };
function eliminate(b, kind, fromNet) {
  if (!b.alive) return;
  b.alive = false; b.outT = 0; b.hp = 0;
  if (b.local) { const a = Math.random() * 6.28; b.mover.knock(Math.cos(a), Math.sin(a), 5, 17, 3); }
  fx.stars(b.isMe || b.local ? b.mover.pos : b.char.root.position);
  audio.sfxAt('out', b.local ? b.mover.pos : b.char.root.position, 60);
  if (b.isMe) {
    $('outWhy').textContent = WHY[kind] || 'Better luck next round!'; $('out').classList.remove('hidden');
    setTimeout(() => $('out').classList.add('hidden'), 2600);
    prof.stats.streak = 0; saveProf();
  }
  if (!fromNet && b.local && net.code) net.send({ t: 'out', r: 1, id: b.id });
}

// ============================== INPUT ==============================
const keys = {};
let jumpQ = false, camYaw = 0, camPitch = 0.3, dragging = false, lastMX = 0;
const joy = { x: 0, y: 0, id: null };
addEventListener('keydown', e => {
  if (e.target && e.target.tagName === 'INPUT') return;
  keys[e.code] = true;
  if (e.code === 'Space') { if (!e.repeat) jumpQ = true; e.preventDefault(); }
  if (app.state === 'game') {
    if (e.code === 'Escape' && !app.locker) togglePause();
    if (e.code === 'KeyL' && canLocker()) openLocker(true);
    if (app.spec && (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'KeyQ' || e.code === 'KeyE')) cycleSpec(e.code === 'ArrowRight' || e.code === 'KeyE' ? 1 : -1);
  }
  audio.unlock();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
canvas.addEventListener('mousedown', e => {
  audio.unlock(); dragging = true; lastMX = e.clientX;
  if (app.state === 'game' && !app.locker && !TOUCH && canvas.requestPointerLock && !anyModal()) { try { canvas.requestPointerLock(); } catch (er) {} }
});
addEventListener('mouseup', () => { dragging = false; });
addEventListener('mousemove', e => {
  const locked = document.pointerLockElement === canvas;
  if (app.locker && dragging) { me.mover.yaw -= (e.clientX - lastMX) * 0.012; lastMX = e.clientX; return; }
  if (app.state === 'game' && (locked || dragging) && !TOUCH) { camYaw -= e.movementX * 0.0026 * settings.sens; camPitch = clamp(camPitch + e.movementY * 0.0022 * settings.sens, -0.35, 1.25); }
});
// touch: joystick, jump button, drag anywhere else to look
(function wireTouch() {
  const j = $('joy'), knob = j.querySelector('.knob'), jb = $('jumpBtn');
  const move = e => { const r = j.getBoundingClientRect(), R = r.width * 0.42; let dx = (e.clientX - r.left - r.width / 2) / R, dy = (e.clientY - r.top - r.height / 2) / R; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; } joy.x = dx; joy.y = dy; knob.style.transform = `translate(${dx * R}px, ${dy * R}px)`; };
  j.addEventListener('pointerdown', e => { e.preventDefault(); joy.id = e.pointerId; j.setPointerCapture(e.pointerId); move(e); audio.unlock(); });
  j.addEventListener('pointermove', e => { if (e.pointerId === joy.id) move(e); });
  const end = e => { if (e.pointerId !== joy.id) return; joy.id = null; joy.x = joy.y = 0; knob.style.transform = ''; };
  j.addEventListener('pointerup', end); j.addEventListener('pointercancel', end);
  jb.addEventListener('pointerdown', e => { e.preventDefault(); jumpQ = true; audio.unlock(); });
  let drag = null;
  canvas.addEventListener('pointerdown', e => { if (e.pointerType !== 'touch') return; drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointermove', e => {
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
    if (app.locker) { me.mover.yaw -= dx * 0.012; return; }
    camYaw -= dx * 0.006 * settings.sens; camPitch = clamp(camPitch + dy * 0.005 * settings.sens, -0.35, 1.25);
  });
  const dend = e => { if (drag && drag.id === e.pointerId) drag = null; };
  canvas.addEventListener('pointerup', dend); canvas.addEventListener('pointercancel', dend);
  for (const ev of ['gesturestart', 'gesturechange', 'contextmenu']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
})();
function readInput() {
  let f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  let s = (keys.KeyD || (keys.ArrowRight && !app.spec) ? 1 : 0) - (keys.KeyA || (keys.ArrowLeft && !app.spec) ? 1 : 0);
  if (joy.id !== null) { f = -joy.y; s = joy.x; }
  const fx_ = Math.sin(camYaw), fz = Math.cos(camYaw), rx = -Math.cos(camYaw), rz = Math.sin(camYaw);
  const inp = { x: fx_ * f + rx * s, z: fz * f + rz * s, jump: jumpQ };
  jumpQ = false;
  return inp;
}

// ============================== UI HELPERS ==============================
function toast(text, kind = '') { const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = text; $('toasts').appendChild(t); setTimeout(() => t.remove(), 2900); while ($('toasts').children.length > 4) $('toasts').firstChild.remove(); }
let bannerT = 0;
function banner(big, small = '', o = {}) {
  $('bannerBig').textContent = big; $('bannerSmall').textContent = small; $('bannerWarn').textContent = o.warn || '';
  $('bannerIc').innerHTML = o.icon ? icon(o.icon) : ''; $('bannerIc').classList.toggle('hidden', !o.icon);
  $('banner').classList.add('on'); clearTimeout(bannerT); bannerT = setTimeout(() => $('banner').classList.remove('on'), o.ms || 2600);
}
let flashV = 0;
function flashScreen(k) { flashV = Math.max(flashV, k); }
const anyModal = () => !!document.querySelector('.modal.on');
function modal(id, on) { $(id).classList.toggle('on', on); if (on && document.pointerLockElement) document.exitPointerLock(); }
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => { b.closest('.modal').classList.remove('on'); }));
document.querySelectorAll('.modal').forEach(m => m.addEventListener('pointerdown', e => { if (e.target === m) m.classList.remove('on'); }));
document.addEventListener('click', e => { if (e.target.closest('button')) { audio.unlock(); audio.sfx('click'); } }, true);
function coinsUI() { document.querySelectorAll('.coinN').forEach(el => el.textContent = prof.coins); }
function addCoins(n, why) { prof.coins += n; saveProf(); coinsUI(); if (why) toast(`+${n} coins ${why}`, 'good'); audio.sfx('coin'); }

// ============================== ROUNDS ==============================
const now = () => net.now();
const phaseTime = () => (now() - game.phaseStart) / 1000;
// the next map: one that was not played in the last few rounds
function pickMap() {
  const pool = MAPS.filter(x => x.id !== game.mapId && !game.recentMaps.includes(x.id));
  const p = pool[Math.floor(Math.random() * pool.length)] || MAPS[0];
  game.recentMaps.push(p.id); if (game.recentMaps.length > 5) game.recentMaps.shift();
  return p.id;
}
// swap the island (only while nobody is standing on it, or when joining a party)
function loadMap(id) {
  if (!MAP[id] || (map && map.id === id)) { game.mapId = id in MAP ? id : game.mapId; return; }
  game.mapId = id;
  if (!map) return;
  map.load(id);
  app.specOffered = false;
}
function hostPhase(ph, extra = {}) {
  const m = Object.assign({ t: 'phase', ph, start: now(), round: game.round }, extra);
  m.map = ph === 'intermission' ? (extra.map ?? pickMap()) : game.mapId;
  if (ph === 'intermission') m.dur = extra.dur ?? TIMES.intermission;
  if (ph === 'prep') { m.dur = TIMES.prep; game.round++; m.round = game.round; }
  if (ph === 'disaster') { m.dur = DURATION; m.dis = game.disId; m.seed = game.seed; }
  if (ph === 'results') m.dur = TIMES.results;
  applyPhase(m);
  if (net.code) net.send(m);
}
function startRound() {
  // a disaster that was not in the last three rounds
  const pool = DISASTERS.filter(d => !game.recent.includes(d.id));
  const d = pool[Math.floor(Math.random() * pool.length)];
  game.recent.push(d.id); if (game.recent.length > 3) game.recent.shift();
  const ids = [...bodies.values()].filter(b => !b.onMap).map(b => b.id);
  hostPhase('prep', { dis: d.id, seed: (Math.random() * 1e9) >>> 0, ids });
}
function applyPhase(m) {
  game.phase = m.ph; game.phaseStart = m.start; game.phaseDur = m.dur; game.round = m.round || game.round;
  $('results').classList.add('hidden');
  if (m.ph === 'intermission') {
    endDisaster();
    let i = 0; for (const b of bodies.values()) if (b.local && b.onMap) toLobby(b, i++);
    // everyone is back in the lobby: build the next map now
    if (m.map && m.map !== game.mapId) { loadMap(m.map); toast('Next map: ' + mapName() + '!', 'good'); }
    if (app.spec) stopSpec();
    audio.play(MUSIC.lobby);
  } else if (m.ph === 'prep') {
    endDisaster();
    if (m.map && m.map !== game.mapId) loadMap(m.map);
    game.disId = m.dis; game.seed = m.seed; game.ids = new Set(m.ids || []); game.spotCount = {};
    let i = 0;
    for (const b of bodies.values()) {
      if (game.ids.has(b.id)) { b.alive = true; b.hp = 100; if (b.local) toMap(b, i); i++; }
    }
    if (game.ids.has(myId)) {
      if (app.locker) closeLocker();
      banner('GET READY!', 'Welcome to ' + mapName() + '. Something is about to happen...', { warn: 'ROUND ' + game.round, ms: 3000 });
    } else if (me && !me.onMap) toast('Wait here for the next round!');
    audio.play(MUSIC.lobby);
  } else if (m.ph === 'disaster') {
    if (m.map && m.map !== game.mapId) loadMap(m.map);
    game.disId = m.dis; game.seed = m.seed;
    startDisaster(m.dis, m.seed, phaseTime());
  } else if (m.ph === 'results') {
    const surv = m.survivors || [];
    game.survivors = surv;
    endDisaster();
    showResults(surv);
  }
  renderPlist();
}
function startDisaster(id, seed, already = 0) {
  endDisaster();
  const d = game.disaster = makeDisaster(id, ctx, seed);
  d.start();
  // joined late: skip what already happened
  if (already > 1) { while (d.evI < d.events.length && d.events[d.evI].t < already) d.evI++; if (d.jolts) d.jolts.forEach(j => { if (j.t < already) j.done = true; }); if (d.boulders) d.boulders.forEach(b => { if (b.at < already) { b.started = true; b.life = 0; } }); for (const k of ['junkEv', 'cracks', 'hail', 'geysers', 'blobs']) { const L = d[k]; if (L) while (L.i < L.length && L[L.i].t < already) L.i++; } }
  atmos.set(DIS[id].mood);
  const def = DIS[id];
  banner(def.name, def.tip, { warn: 'WARNING!', icon: def.icon, ms: 3600 });
  audio.sfx('siren');
  audio.play(MUSIC.disaster(id));
}
function endDisaster() {
  if (!game.disaster) return;
  game.disaster.end(); game.disaster = null;
  env.clear(); atmos.set('sunny');
  for (const b of bodies.values()) { b.mover.speedMul = 1; b.mover.slip = 0; b.acid = false; }
}
function showResults(surv) {
  const names = surv.map(id => bodies.get(id)).filter(Boolean);
  $('resT').textContent = names.length ? (names.length === 1 ? 'ONE SURVIVOR!' : names.length + ' SURVIVORS') : 'NOBODY SURVIVED!';
  $('resList').innerHTML = names.map(b => `<span class="${b.isMe ? 'me' : ''}">${esc(b.name)}</span>`).join('') || '<span>The disaster won this time</span>';
  const was = game.ids.has(myId);
  if (was) {
    prof.stats.rounds++;
    if (surv.includes(myId)) {
      prof.stats.survived++; prof.stats.streak++; prof.stats.best = Math.max(prof.stats.best, prof.stats.streak);
      const bonus = Math.min(25, (prof.stats.streak - 1) * 5), n = 25 + bonus;
      $('resReward').innerHTML = `YOU SURVIVED! +${n} ${icon('coin').replace('<svg', '<i><svg').replace('</svg>', '</svg></i>')}` + (bonus ? `<br><small style="font-size:16px;color:#7bd389">${prof.stats.streak} in a row!</small>` : '');
      addCoins(n); audio.sfx('survive'); fx.confetti(me.mover.pos, 80, 4);
    } else {
      $('resReward').innerHTML = `+5 ${icon('coin').replace('<svg', '<i><svg').replace('</svg>', '</svg></i>')} for trying`;
      addCoins(5);
    }
    saveProf();
  } else $('resReward').innerHTML = '';
  $('results').classList.remove('hidden');
  if (game.host) {
    for (const id of surv) { const b = bodies.get(id); if (b) game.wins[id] = { name: b.name, n: (game.wins[id]?.n || 0) + 1 }; }
    if (net.code) net.send({ t: 'wins', w: game.wins });
    drawTop();
  }
}
function drawTop() {
  const rows = Object.entries(game.wins).filter(([id]) => bodies.has(id)).map(([id, w]) => ({ name: bodies.get(id).name, wins: w.n })).sort((a, b) => b.wins - a.wins);
  map.top.draw(rows);
  for (const [id, w] of Object.entries(game.wins)) { const b = bodies.get(id); if (b) b.wins = w.n; }
}
// the party leader (or you, alone) moves the rounds along
function hostTick() {
  if (!game.host || game.phase === 'idle') return;
  const t = phaseTime();
  if (game.phase === 'intermission' && t >= game.phaseDur) startRound();
  else if (game.phase === 'prep' && t >= game.phaseDur) hostPhase('disaster');
  else if (game.phase === 'disaster') {
    const left = [...bodies.values()].filter(b => b.alive && b.onMap && game.ids.has(b.id));
    if (t >= DURATION || (t > 4 && left.length === 0)) hostPhase('results', { survivors: left.map(b => b.id) });
  } else if (game.phase === 'results' && t >= game.phaseDur) hostPhase('intermission');
}
const MUSIC = {
  lobby: { bpm: 116, root: 60, scale: 'major', drums: 'funky', bass: 'triangle', lead: 'square', seed: 11 },
  disaster: id => ({ bpm: 148, root: 57, scale: id === 'blizzard' ? 'dorian' : 'minor', drums: 'heavy', bass: 'sawtooth', lead: 'square', seed: 100 + id.length * 7 })
};

// the spots bots go to: how many are already heading there
game.spotUse = n => game.spotCount[n] || 0;
game.spotTake = n => { game.spotCount[n] = (game.spotCount[n] || 0) + 1; };

// ============================== BOTS ==============================
function syncBots() {
  if (!game.host) return;
  const humans = [...bodies.values()].filter(b => !b.isBot).length;
  const want = Math.max(0, PLAYERS - humans);
  const bots = [...bodies.values()].filter(b => b.isBot);
  let changed = false;
  if (bots.length > want) { for (const b of bots.filter(b => !b.onMap).concat(bots.filter(b => b.onMap)).slice(0, bots.length - want)) { removeBody(b.id); changed = true; } }
  if (bots.length < want) {
    const used = new Set(bots.map(b => b.name)), names = botNames(24).filter(n => !used.has(n));
    for (let i = bots.length; i < want; i++) {
      const b = addBody({ id: 'bot-' + Math.random().toString(36).slice(2, 7), name: names.pop() || 'Bot', skin: randomSkin(), isBot: true });
      b.brain = new BotBrain(b, botGame, 0.3 + Math.random() * 0.7);
      toLobby(b); b.alive = game.phase === 'intermission' || game.phase === 'idle'; changed = true;
    }
  }
  if (changed && net.code) net.send({ t: 'botlist', list: botList() });
  renderPlist();
}
const botList = () => [...bodies.values()].filter(b => b.isBot).map(b => ({ id: b.id, name: b.name, skin: b.char.skin }));
// what bots can see of the game
const botGame = {
  get map() { return map; }, get world() { return world; }, get env() { return env; }, get disaster() { return game.disaster; }, get phase() { return game.phase; },
  get time() { return phaseTime(); }, spotUse: n => game.spotUse(n), spotTake: n => game.spotTake(n)
};

// ============================== SIMULATION ==============================
const ctx = {
  get env() { return env; }, scene, get world() { return world; }, get map() { return map; }, get fx() { return fx; }, audio, atmos,
  get host() { return game.host; }, send: e => { if (net.code) net.send({ t: 'ev', e }); },
  localBodies, allBodies: () => [...bodies.values()], camPos: () => camera.position,
  announce: text => toast(text, 'bad')
};
function stepLocal(b, dt, t) {
  const m = b.mover, dis = game.disaster, active = game.phase === 'disaster' && dis;
  let inp = { x: 0, z: 0, jump: false };
  if (b.isMe) { if (!app.locker && !app.paused && !(app.state !== 'game')) inp = readInput(); else jumpQ = false; }
  else if (b.brain && b.alive) inp = b.brain.think(dt);
  if (!b.alive && b.onMap) inp = { x: 0, z: 0, jump: false };
  m.ext.set(0, 0, 0); m.slip = 0; m.speedMul = 1;
  b.shT -= dt; if (b.shT <= 0) { b.shT = 0.25; b.sheltered = b.onMap && world.roofAbove(_v.set(m.pos.x, m.pos.y + 1.45, m.pos.z), 40); }
  // water here (or lava: no swimming in that)
  let wy = -Infinity;
  if (b.onMap) {
    wy = env.waterLevel;
    if (active && dis.waterAt) { const w2 = dis.waterAt(m.pos.x, m.pos.z, t); if (w2 !== null && w2 > wy) wy = w2; }
    if (env.lava.visible && env.lavaLevel > wy - 0.2) wy = -Infinity;
  }
  m.waterY = wy;
  if (active && b.alive && b.onMap) dis.affect(b, dt, t);
  m.step(dt, inp);
  // bump into other beans
  for (const o of bodies.values()) if (o !== b && o.onMap === b.onMap && (o.alive || !o.onMap)) m.pushFrom(o.remote ? o.char.root.position : o.mover.pos);
  // what happened
  for (const e of m.events) {
    if (e === 'jump') { if (b.isMe) audio.sfx('jump'); }
    else if (e === 'land') { fx.dust(m.pos, 8, b.onMap ? '#d9d2c0' : '#ffffff'); if (b.isMe) audio.sfx('land'); }
    else if (e === 'bounce') { audio.sfxAt('bounce', m.pos, 40); }
    else if (e === 'splash') { fx.splash(_v.set(m.pos.x, m.waterY, m.pos.z)); audio.sfxAt('splash', m.pos, 50); }
    else if (e === 'impact') { if (active && b.onMap && m.impact > 22) b.hurt(Math.min(60, (m.impact - 20) * 3.2), 'fall'); }
    else if (e === 'hit') { if (b.isMe) audio.sfx('hit'); }
  }
  m.events.length = 0;
  // fell off the lobby
  if (!b.onMap && m.pos.y < LOBBY.y - 30) toLobby(b);
  if (b.onMap && m.pos.y < -25) { if (b.alive && active) eliminate(b, 'fall'); else toMap(b, 0); }
  // swimming makes you tired
  if (b.onMap && m.swimming) { b.stamina -= dt * 100 / 14; if (b.stamina <= 0) { b.stamina = 0; if (b.alive) { b.hurt(10 * dt, 'drown', true); if (b.isMe && Math.random() < dt) toast('Too tired! Get out of the water!', 'bad'); } } }
  else b.stamina = Math.min(100, b.stamina + dt * (m.grounded ? 30 : 10));
  // drying, warming up
  if (!(active && game.disId === 'blizzard')) b.cold = Math.max(0, b.cold - dt * 20);
  b.burnt = Math.max(0, b.burnt - dt * 0.03); b.hotT -= dt;
  if (!b.alive && b.onMap) { b.outT += dt; if (b.outT > 1.7) { fx.confetti(m.pos, 20, 2); toLobby(b); } }
}
// beans from other computers glide 120 ms behind their real place
function stepRemote(b, dt) {
  const B = b.buf; if (!B.length) return;
  const t = now() - 120;
  let a = B[0], c = B[B.length - 1];
  for (let i = 0; i < B.length - 1; i++) if (B[i].at <= t && B[i + 1].at >= t) { a = B[i]; c = B[i + 1]; break; }
  const k = c.at > a.at ? clamp((t - a.at) / (c.at - a.at), 0, 1) : 1, s = a.s, e = c.s;
  const jump = Math.hypot(e[0] - s[0], e[1] - s[1], e[2] - s[2]) > 8;     // teleported: no gliding
  const kk = jump ? 1 : k;
  b.mover.pos.set(lerp(s[0], e[0], kk), lerp(s[1], e[1], kk), lerp(s[2], e[2], kk));
  b.yaw = s[3] + angDiff(e[3], s[3]) * kk;
  b.anim.speed = e[4]; b.anim.grounded = !!e[5]; b.anim.vy = e[6]; b.anim.stun = e[7]; b.anim.swim = !!e[8];
  b.hp = e[9]; b.onMap = !!e[11]; b.burnt = e[12]; b.cold = e[13] * 100;
  const alive = !!e[10];
  if (b.alive && !alive && game.phase === 'disaster') eliminate(b, 'x', true);
  if (!alive || game.phase !== 'disaster') b.alive = alive;
}
function pack(b) {
  const m = b.mover, a = m.anim(), r2 = x => Math.round(x * 100) / 100;
  return [r2(m.pos.x), r2(m.pos.y), r2(m.pos.z), r2(m.yaw), r2(a.speed), a.grounded ? 1 : 0, r2(a.vy), r2(a.stun), a.swim ? 1 : 0, Math.round(b.hp), b.alive ? 1 : 0, b.onMap ? 1 : 0, r2(b.burnt), r2(b.cold / 100)];
}
function animate(b, dt) {
  const ch = b.char, root = ch.root;
  let st;
  if (b.local) {
    const m = b.mover;
    root.position.copy(m.pos); root.rotation.y = m.yaw;
    st = m.anim();
    st.groundDist = m.grounded || m.swimming ? 0 : Math.max(0, m.pos.y - (b.onMap ? heightAt(m.pos.x, m.pos.z) : LOBBY.y));
  } else {
    root.position.copy(b.mover.pos); root.rotation.y = b.yaw;
    st = Object.assign({}, b.anim, { groundDist: 0 });
  }
  st.scared = game.phase === 'disaster' && b.onMap && b.alive && !b.sheltered && game.disaster && (b.hp < 50);
  st.celebrate = game.phase === 'results' && b.onMap && b.alive;
  st.sad = !b.alive && !b.onMap && (game.phase === 'disaster');
  ch.burnt = b.burnt; ch.frozen = clamp(b.cold / 100, 0, 1);
  ch.update(dt, st);
  // the out animation: spin and shrink away
  const outK = !b.alive && b.onMap ? clamp(b.outT / 1.7, 0, 1) : 0;
  root.scale.setScalar(1 - outK * 0.85);
  if (outK > 0) ch.pivot.rotation.y += dt * 18;
  if (b.tag) { const d = root.position.distanceTo(camera.position); b.tag.visible = d < 45 && !(app.locker); b.tag.material.opacity = b.alive || !b.onMap ? 1 : 0.4; }
  root.visible = !(b.remote && performance.now() - b.seen > 8000);
}

// ============================== CAMERA ==============================
const camT = new THREE.Vector3(), camP = new THREE.Vector3(), _d = new THREE.Vector3();
let titleA = 0;
function updateCamera(dt) {
  if ((app.state === 'title' || app.state === 'boot') && !app.locker) {
    titleA += dt * 0.06;
    camera.position.set(LOBBY.x + Math.sin(titleA) * 33, LOBBY.y + 12 + Math.sin(titleA * 0.7) * 2, LOBBY.z + Math.cos(titleA) * 33);
    camera.lookAt(LOBBY.x, LOBBY.y + 1, LOBBY.z);
    scene.userData.setFocus(_v.set(LOBBY.x, LOBBY.y, LOBBY.z));
    return;
  }
  if (app.locker) {
    const p = me.mover.pos, k = 1 - Math.exp(-6 * dt), side = innerWidth > 760 ? 1.2 : 0, up = innerWidth > 760 ? 0 : -0.9;
    const want = _v.set(p.x + Math.sin(lockerA) * 3.7, p.y + 1.35 - up, p.z + Math.cos(lockerA) * 3.7);
    if (app.lockSnap) { camera.position.copy(want); app.lockSnap = false; } else camera.position.lerp(want, k);
    _w.set(p.x - Math.cos(lockerA) * side, p.y + 0.85 + up, p.z + Math.sin(lockerA) * side);
    camera.lookAt(_w);
    return;
  }
  const target = app.spec && app.spec.onMap ? app.spec : me;
  const tp = target.local ? target.mover.pos : target.char.root.position;
  camT.lerp(_v.set(tp.x, tp.y + 1.4, tp.z), camT.distanceTo(_v) > 20 ? 1 : 1 - Math.exp(-14 * dt));
  const dist = 7.2, cp = Math.cos(camPitch);
  _d.set(-Math.sin(camYaw) * cp, Math.sin(camPitch), -Math.cos(camYaw) * cp);
  // keep the camera out of walls
  const hit = world.raycast(camT, _d, dist + 0.3, c => c.cam);
  const d = hit ? Math.max(0.6, hit.t - 0.35) : dist;
  camP.copy(camT).addScaledVector(_d, d);
  if (target.onMap) camP.y = Math.max(camP.y, heightAt(camP.x, camP.z) + 0.4);
  camera.position.copy(camP);
  if (env.shake > 0) { const s = env.shake * 0.35; camera.position.x += (Math.random() - 0.5) * s; camera.position.y += (Math.random() - 0.5) * s; camera.position.z += (Math.random() - 0.5) * s; }
  camera.lookAt(camT);
  scene.userData.setFocus(target.onMap ? _v.set(tp.x, LAND, tp.z) : _v.set(LOBBY.x, LOBBY.y, LOBBY.z));
}
// spectating after you are out
function specList() { return [...bodies.values()].filter(b => b.alive && b.onMap && b !== me); }
function startSpec() { const l = specList(); if (!l.length) return; app.spec = l[Math.floor(Math.random() * l.length)]; updateSpecUI(); }
function cycleSpec(dir) { const l = specList(); if (!l.length) return stopSpec(); let i = l.indexOf(app.spec); i = (i + dir + l.length) % l.length; app.spec = l[i]; updateSpecUI(); }
function stopSpec() { app.spec = null; $('spec').classList.add('hidden'); }
function updateSpecUI() { $('spec').classList.toggle('hidden', !app.spec); if (app.spec) $('specWho').textContent = 'WATCHING ' + app.spec.name; }
$('specPrev').onclick = () => cycleSpec(-1); $('specNext').onclick = () => cycleSpec(1); $('specStop').onclick = () => stopSpec();

// ============================== HUD ==============================
let hudT = 0, plistT = 0, boardT = 0, sendT = 0, botSendT = 0;
const fmtT = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
function updateHud(dt) {
  flashV = Math.max(0, flashV - dt * 1.8);
  $('flash').style.opacity = flashV.toFixed(2);
  $('frost').style.opacity = (me && me.onMap ? clamp((me.cold - 30) / 70, 0, 1) * 0.9 : 0).toFixed(2);
  $('acidV').style.opacity = me && me.acid && me.alive ? (0.5 + Math.sin(performance.now() / 150) * 0.15).toFixed(2) : '0';
  hudT -= dt; if (hudT > 0) return; hudT = 0.1;
  const t = phaseTime(), ph = game.phase;
  let title = '', n = '';
  if (ph === 'idle') { title = net.code && !game.host ? 'WAITING' : 'LOBBY'; n = net.code && !game.host ? 'for leader' : ''; }
  else if (ph === 'intermission') { title = 'NEXT ROUND IN'; n = fmtT(game.phaseDur - t); }
  else if (ph === 'prep') { title = 'GET READY'; n = fmtT(game.phaseDur - t); }
  else if (ph === 'disaster') { const d = DIS[game.disId]; title = `${icon(d.icon).replace('<svg', '<i><svg').replace('</svg>', '</svg></i>')}${d.name}`; n = fmtT(DURATION - t); }
  else if (ph === 'results') { title = 'ROUND OVER'; n = fmtT(game.phaseDur - t); }
  if ($('phaseT').dataset.v !== title) { $('phaseT').innerHTML = title; $('phaseT').dataset.v = title; }
  $('phaseN').textContent = n;
  // countdown ticks
  const left = Math.ceil(game.phaseDur - t);
  if ((ph === 'intermission' || ph === 'prep') && left <= 3 && left > 0 && left !== updateHud.lastTick) { updateHud.lastTick = left; audio.sfx('tick'); }
  if (me) {
    const hp = Math.max(0, Math.round(me.hp));
    $('hpBar').firstChild.style.width = (me.onMap && me.alive ? hp : 100) + '%'; $('hpN').textContent = me.onMap && me.alive ? hp : 100;
    $('stRow').classList.toggle('hidden', !(me.onMap && (me.mover.swimming || me.stamina < 99)));
    $('stBar').firstChild.style.width = me.stamina + '%';
    $('coRow').classList.toggle('hidden', !(me.onMap && game.disId === 'blizzard' && ph === 'disaster'));
    $('coBar').firstChild.style.width = clamp(me.cold, 0, 100) + '%';
    $('lobbyBar').classList.toggle('hidden', !canLocker() || app.locker || !!app.spec);
    const pmShow = !me.onMap && !app.locker && !app.spec;
    if ($('partyMini').classList.contains('hidden') === pmShow) renderPartyMini();
    // out: watch someone who is still in
    if (!me.alive && ph === 'disaster' && !me.onMap && !app.spec && !app.specOffered) { app.specOffered = true; startSpec(); }
    if (ph !== 'disaster') app.specOffered = false;
    if (app.spec && (!app.spec.alive || !app.spec.onMap)) cycleSpec(1);
  }
  const inRound = ph === 'prep' || ph === 'disaster' || ph === 'results';
  const alive = [...bodies.values()].filter(b => b.alive && b.onMap).length;
  $('aliveN').textContent = inRound ? `${alive} / ${game.ids.size} left` : `${bodies.size} beans`;
  plistT -= 0.1; if (plistT <= 0) { plistT = 0.5; renderPlist(); }
  boardT -= 0.1; if (boardT <= 0) { boardT = 0.5; drawBoard(); }
}
function renderPlist() {
  const list = [...bodies.values()].sort((a, b) => (b.wins || 0) - (a.wins || 0) || (b.isMe - a.isMe));
  const inRound = game.phase === 'prep' || game.phase === 'disaster' || game.phase === 'results';
  $('plist').innerHTML = '<h4>BEANS</h4>' + list.map(b => {
    const cls = b.isMe ? 'me' : '', st = !inRound ? '' : !game.ids.has(b.id) ? 'lobby' : (b.alive && b.onMap) ? '' : 'out';
    return `<div class="p ${cls} ${st}"><span class="dot" style="${!inRound ? 'background:' + b.color : ''}"></span>${esc(b.name)}${b.isBot ? '' : ''}<span class="w">${b.wins || 0}</span></div>`;
  }).join('');
}
function drawBoard() {
  const t = phaseTime(), ph = game.phase;
  if (ph === 'idle') map.board.draw('BEAN DISASTER', 'HI!', net.code && !game.host ? 'Waiting for the party leader' : 'Press PLAY to start');
  else if (ph === 'intermission') map.board.draw('NEXT ROUND IN', String(Math.max(0, Math.ceil(game.phaseDur - t))), 'Next map: ' + mapName());
  else if (ph === 'prep') map.board.draw('ROUND ' + game.round, 'GO!', 'The beans are in ' + mapName());
  else if (ph === 'disaster') { const d = DIS[game.disId]; map.board.draw(d.name, String(Math.max(0, Math.ceil(DURATION - t))), [...bodies.values()].filter(b => b.alive && b.onMap).length + ' beans still standing'); }
  else if (ph === 'results') map.board.draw('ROUND OVER', String(game.survivors.length), game.survivors.length === 1 ? 'survivor' : 'survivors');
}

// ============================== LOCKER ==============================
let lockerA = 0, lockerTab = 'colors', tryOn = null;
const canLocker = () => app.state === 'game' && me && !me.onMap && game.phase !== 'prep';
const TABS = [['colors', 'COLORS'], ['pattern', 'PATTERNS'], ['eyes', 'EYES'], ['hat', 'HATS'], ['outfit', 'OUTFITS']];
const LISTS = { pattern: PATTERNS, eyes: EYES, hat: HATS, outfit: OUTFITS };
const owns = (k, id) => { const l = LISTS[k].find(x => x.id === id); return !l || l.price === 0 || prof.owned.includes(k + ':' + id); };
function openLocker(fromGame) {
  if (app.state === 'game' && !canLocker()) { toast('The locker opens in the lobby'); return; }
  app.locker = true; tryOn = null;
  if (document.pointerLockElement) document.exitPointerLock();
  lockerA = me.mover.yaw; me.mover.vel.set(0, 0, 0); app.lockSnap = true;
  $('locker').classList.add('on'); $('lockerSpin').classList.add('on'); $('partyMini').classList.add('hidden');
  $('hud').classList.remove('on'); $('title').classList.remove('on');
  renderLocker();
}
function closeLocker() {
  app.locker = false; tryOn = null; me.char.setSkin(prof.skin);
  $('locker').classList.remove('on'); $('lockerSpin').classList.remove('on');
  if (app.state === 'game') $('hud').classList.add('on'); else $('title').classList.add('on');
  renderPartyMini();
}
$('lockerClose').onclick = closeLocker;
function renderLocker() {
  coinsUI();
  $('tabs').innerHTML = TABS.map(([k, n]) => `<button class="${k === lockerTab ? 'on' : ''}" data-k="${k}">${n}</button>`).join('');
  $('tabs').querySelectorAll('button').forEach(b => b.onclick = () => { lockerTab = b.dataset.k; tryOn = null; me.char.setSkin(prof.skin); renderLocker(); });
  const box = $('items');
  if (lockerTab === 'colors') {
    const sw = key => PALETTE.map(c => `<div class="sw ${prof.skin[key] === c ? 'on' : ''}" data-key="${key}" data-c="${c}" style="background:${c}"></div>`).join('');
    box.innerHTML = `<div class="colors"><div><label class="muted">MAIN COLOR</label><div class="swatches">${sw('c1')}</div></div><div><label class="muted">SECOND COLOR</label><div class="swatches">${sw('c2')}</div></div><p class="muted">Colors are free. Earn coins by surviving and buy hats, outfits, patterns and eyes.</p></div>`;
    box.querySelectorAll('.sw').forEach(s => s.onclick = () => { prof.skin[s.dataset.key] = s.dataset.c; equipSave(); renderLocker(); });
    return;
  }
  const list = LISTS[lockerTab], key = lockerTab;
  const coin = icon('coin').replace('<svg', '<i><svg').replace('</svg>', '</svg></i>');
  box.innerHTML = list.map(it => {
    const own = owns(key, it.id), wearing = prof.skin[key] === it.id, trying = tryOn && tryOn.id === it.id;
    return `<div class="item ${wearing || trying ? 'on' : ''} ${own ? '' : 'locked'}" data-id="${it.id}"><div class="nm">${esc(it.name)}</div>${own ? `<div class="owned">${wearing ? 'WEARING' : 'OWNED'}</div>` : `<div class="pr">${trying ? 'BUY ' : ''}${coin}${it.price}</div>`}</div>`;
  }).join('');
  box.querySelectorAll('.item').forEach(el => el.onclick = () => {
    const id = el.dataset.id, it = list.find(x => x.id === id);
    if (owns(key, id)) { prof.skin[key] = id; tryOn = null; equipSave(); renderLocker(); return; }
    if (tryOn && tryOn.id === id) {
      if (prof.coins < it.price) { toast(`You need ${it.price - prof.coins} more coins`, 'bad'); audio.sfx('error'); return; }
      prof.coins -= it.price; prof.owned.push(key + ':' + id); prof.skin[key] = id; tryOn = null; audio.sfx('buy'); toast('Bought ' + it.name + '!', 'good'); equipSave(); renderLocker(); return;
    }
    tryOn = { key, id }; me.char.setSkin(Object.assign({}, prof.skin, { [key]: id })); renderLocker();
  });
}
function equipSave() { saveProf(); me.char.setSkin(prof.skin); netMe.skin = prof.skin; net.updateProfile(); coinsUI(); }

// ============================== MENUS ==============================
$('playBtn').onclick = () => enterGame();
$('lockerBtn').onclick = () => openLocker(false);
$('lockerBtn2').onclick = () => openLocker(true);
$('partyBtn').onclick = () => { renderParty(); modal('partyM', true); };
$('setBtn').onclick = () => { renderSettings(); modal('setM', true); };
$('menuBtn').onclick = () => togglePause();
$('mLocker').onclick = () => { modal('pauseM', false); app.paused = false; openLocker(true); };
$('mParty').onclick = () => { modal('pauseM', false); app.paused = false; renderParty(); modal('partyM', true); };
$('mSet').onclick = () => { modal('pauseM', false); app.paused = false; renderSettings(); modal('setM', true); };
$('mQuit').onclick = () => { modal('pauseM', false); app.paused = false; leaveGame(); };
function togglePause() {
  const on = !$('pauseM').classList.contains('on');
  modal('pauseM', on); app.paused = on;
  $('mLocker').disabled = !canLocker();
  const s = prof.stats; $('mStats').textContent = `Rounds played: ${s.rounds} · Survived: ${s.survived} · Best streak: ${s.best}`;
}
new MutationObserver(() => { if (!$('pauseM').classList.contains('on')) app.paused = false; }).observe($('pauseM'), { attributes: true });
function enterGame() {
  audio.unlock();
  app.state = 'game';
  $('title').classList.remove('on'); $('hud').classList.add('on');
  $('titleHint').classList.add('hidden');
  camYaw = Math.atan2(LOBBY.x - me.mover.pos.x, LOBBY.z - me.mover.pos.z) + Math.PI; camPitch = 0.3; camT.copy(me.mover.pos);
  if (game.host && game.phase === 'idle') hostPhase('intermission', { dur: TIMES.first });
  audio.play(MUSIC.lobby);
  if (TOUCH) toast('Left stick to move, orange button to jump');
  renderPartyMini();
}
function leaveGame() {
  if (net.code) net.leave();
  app.state = 'title'; stopSpec();
  becomeHost();
  game.phase = 'idle'; endDisaster();
  for (const b of bodies.values()) { if (b.onMap) toLobby(b); b.alive = true; }
  $('hud').classList.remove('on'); $('title').classList.add('on');
  if (document.pointerLockElement) document.exitPointerLock();
  renderTitle();
}
function renderTitle() { coinsUI(); const pc = $('partyChip'); pc.classList.toggle('hidden', !net.code); if (net.code) pc.textContent = `PARTY ${net.code} · ${net.members.size}`; renderPartyMini(); }
// the party panel in the corner: who is in your party, the code, make / join / leave
function renderPartyMini() {
  const show = app.state === 'title' || (app.state === 'game' && me && !me.onMap && !app.locker && !app.spec);
  $('partyMini').classList.toggle('hidden', !show || app.locker);
  document.body.classList.toggle('ingame', app.state === 'game');
  const inP = !!net.code;
  $('pmCode').textContent = inP ? net.code : '';
  $('pmOut').classList.toggle('hidden', inP); $('pmIn').classList.toggle('hidden', !inP);
  const list = inP ? net.list() : [{ id: myId, name: prof.name, leader: true }];
  $('pmList').innerHTML = list.map(p => { const b = bodies.get(p.id); return `<div><span class="dot" style="background:${b ? b.color : '#ffd23f'}"></span>${esc(p.name)}${p.id === myId ? ' (you)' : ''}<small>${inP && p.leader ? 'LEADER' : ''}</small></div>`; }).join('');
  $('pmMsg').textContent = inP ? (net.leader ? `Friends type the code ${net.code} to join. ${net.members.size} / 10 players.` : 'You are on your friend\'s island.') : 'Play with friends: make a party and send them the code.';
}
$('pmCreate').onclick = () => $('pCreate').onclick();
$('pmJoin').onclick = () => { renderParty(); modal('partyM', true); setTimeout(() => $('pCode').focus(), 50); };
$('pmCopy').onclick = () => $('pCopy').onclick();
$('pmLeave').onclick = () => $('pLeave').onclick();
function renderSettings() {
  $('sName').value = prof.name;
  $('sQuality').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === settings.quality));
  $('sSens').value = settings.sens; $('sMusic').value = audio.vol.music; $('sSfx').value = audio.vol.sfx;
}
$('sName').addEventListener('change', () => {
  const n = $('sName').value.trim().replace(/[^\w æøåÆØÅ-]/g, '').slice(0, 14);
  if (!n) return; prof.name = n; saveProf(); me.setName(n); netMe.name = n; net.updateProfile(); renderPlist();
});
$('sQuality').querySelectorAll('button').forEach(b => b.onclick = () => { if (b.dataset.v === settings.quality) return; settings.quality = b.dataset.v; saveSettings(); location.reload(); });
$('sSens').oninput = () => { settings.sens = +$('sSens').value; saveSettings(); };
$('sMusic').oninput = () => audio.setVolume('music', +$('sMusic').value);
$('sSfx').oninput = () => audio.setVolume('sfx', +$('sSfx').value);

// ============================== PARTY ==============================
function renderParty() {
  const inP = !!net.code;
  $('partyOut').classList.toggle('hidden', inP); $('partyIn').classList.toggle('hidden', !inP); $('pErr').textContent = '';
  if (inP) {
    $('pShow').textContent = net.code;
    $('pMembers').innerHTML = net.list().map(p => `<div>${icon('user').replace('<svg', '<i style="width:26px;height:26px;display:inline-block"><svg').replace('</svg>', '</svg></i>')}${esc(p.name)}${p.id === myId ? ' (you)' : ''}<small>${p.leader ? 'LEADER' : ''}</small></div>`).join('');
    $('pNote').textContent = net.leader ? 'You run the rounds for everyone. Bots fill the empty spots.' : 'The party leader runs the rounds. You play on their island.';
  }
  renderTitle();
}
$('pCreate').onclick = async () => {
  $('pErr').textContent = 'Making a party...';
  try { await net.create(); becomeHost(); renderParty(); toast('Party made! Code ' + net.code, 'good'); } catch (e) { $('pErr').textContent = e.message; }
};
$('pJoin').onclick = () => joinParty($('pCode').value);
$('pCode').addEventListener('keydown', e => { if (e.key === 'Enter') joinParty($('pCode').value); });
async function joinParty(code) {
  code = cleanCode(code);
  $('pErr').textContent = 'Joining...';
  try {
    await net.join(code);
    becomeMember();
    renderParty(); modal('partyM', false);
    toast('You joined the party!', 'good'); audio.sfx('join');
    if (app.state !== 'game') enterGame();
  } catch (e) { $('pErr').textContent = e.message; }
}
$('pLeave').onclick = () => { net.leave(); becomeHost(); renderParty(); };
$('pCopy').onclick = () => { try { navigator.clipboard.writeText(net.code); toast('Code copied'); } catch (e) {} };

// you run the rounds (alone, or as the party leader)
function becomeHost() {
  const was = game.host;
  game.host = true;
  for (const b of [...bodies.values()]) if (b.remote) removeBody(b.id);
  if (!was) { endDisaster(); game.phase = 'idle'; for (const b of bodies.values()) if (b.onMap) toLobby(b); me.alive = true; if (app.state === 'game') hostPhase('intermission', { dur: TIMES.first }); }
  syncBots(); renderPlist();
}
// the leader's computer runs the rounds; your bots go away
function becomeMember() {
  game.host = false;
  for (const b of [...bodies.values()]) if (b.isBot) removeBody(b.id);
  endDisaster(); game.phase = 'idle';
  if (me.onMap) toLobby(me); me.alive = true;
  syncHumans(); renderPlist();
}
function syncHumans() {
  const list = net.code ? net.list() : [];
  const ids = new Set(list.map(p => p.id));
  for (const p of list) {
    if (p.id === myId) continue;
    let b = bodies.get(p.id);
    if (!b) { b = addBody({ id: p.id, name: p.name, skin: p.skin, remote: true }); b.onMap = false; b.mover.pos.copy(lobbySpot()); }
    b.setName(p.name);
    if (p.skin && JSON.stringify(p.skin) !== JSON.stringify(b.char.skin)) b.char.setSkin(p.skin);
  }
  for (const b of [...bodies.values()]) if (b.remote && !b.isBot && !ids.has(b.id)) removeBody(b.id);
  if (game.host) syncBots();
  renderPlist();
}
net.on('roster', () => { if (me) syncHumans(); renderTitle(); if ($('partyM').classList.contains('on')) renderParty(); });
net.on('joined', p => {
  toast(p.name + ' joined!', 'good'); audio.sfx('join');
  if (!game.host) return;
  net.sendTo(p.id, { t: 'botlist', list: botList() });
  net.sendTo(p.id, { t: 'wins', w: game.wins });
  if (game.phase !== 'idle') net.sendTo(p.id, { t: 'phase', ph: game.phase, start: game.phaseStart, dur: game.phaseDur, round: game.round, dis: game.disId, seed: game.seed, ids: [...game.ids], survivors: game.survivors, map: game.mapId });
});
net.on('left', p => { toast(p.name + ' left'); });
net.on('ended', why => { toast(why, 'bad'); becomeHost(); renderParty(); });
net.on('msg', (m, from) => {
  if (m.t === 's') {
    const b = bodies.get(m.id); if (!b || !b.remote) return;
    b.seen = performance.now(); b.buf.push({ at: m.at, s: m.s }); if (b.buf.length > 30) b.buf.shift();
  } else if (m.t === 'bots') {
    if (game.host) return;
    for (const [id, ...s] of m.b) { const b = bodies.get(id); if (!b) continue; b.seen = performance.now(); b.buf.push({ at: m.at, s }); if (b.buf.length > 30) b.buf.shift(); }
  } else if (m.t === 'botlist') {
    if (game.host) return;
    const ids = new Set(m.list.map(x => x.id));
    for (const x of m.list) if (!bodies.has(x.id)) { const b = addBody({ id: x.id, name: x.name, skin: x.skin, remote: true, isBot: true }); b.mover.pos.copy(lobbySpot()); }
    for (const b of [...bodies.values()]) if (b.isBot && !ids.has(b.id)) removeBody(b.id);
    renderPlist();
  } else if (m.t === 'phase') {
    if (game.host) return;
    applyPhase(m);
  } else if (m.t === 'ev') {
    if (game.disaster) game.disaster.onEvent(m.e);
  } else if (m.t === 'out') {
    const b = bodies.get(m.id); if (b && b.remote) eliminate(b, 'x', true);
  } else if (m.t === 'wins') {
    game.wins = m.w || {}; drawTop();
  }
});

// ============================== MAIN LOOP ==============================
let last = performance.now();
function frame() {
  requestAnimationFrame(frame);
  const tNow = performance.now(), dt = Math.min(0.05, (tNow - last) / 1000); last = tNow;
  if (!map || !env || !me) return;
  if (!innerWidth || !innerHeight) return;
  const T0 = performance.now();
  hostTick();
  const t = phaseTime();
  // the disaster
  const dis = game.disaster, active = game.phase === 'disaster' && dis;
  env.disT = t;
  if (active) dis.update(dt, t);
  const wT = active ? dis.water(t) : SEA, lT = active ? dis.lava(t) : -10;
  env.waterLevel = active ? wT : damp(env.waterLevel, SEA, 1.2, dt);
  env.lavaLevel = active ? lT : damp(env.lavaLevel, -10, 1.2, dt);
  // beans
  const T1 = performance.now();
  for (const b of bodies.values()) { if (b.local) stepLocal(b, dt, t); else stepRemote(b, dt); }
  const T2 = performance.now();
  for (const b of bodies.values()) animate(b, dt);
  const T3 = performance.now();
  // the lobby's mushrooms wobble, the lighthouse turns
  map.beam.material.emissiveIntensity = 1.5 + Math.sin(tNow / 300) * 0.5;
  if (map.spinners) for (const sp of map.spinners) sp.rotation.z += dt * sp.userData.spin;
  // send our state
  if (net.code && app.state === 'game') {
    sendT -= dt; if (sendT <= 0) { sendT = 1 / 12; net.send({ t: 's', r: 1, id: myId, at: now(), s: pack(me) }); }
    if (game.host) { botSendT -= dt; if (botSendT <= 0) { botSendT = 0.1; const list = [...bodies.values()].filter(b => b.isBot); if (list.length) net.send({ t: 'bots', at: now(), b: list.map(b => [b.id, ...pack(b)]) }); } }
  }
  updateCamera(dt);
  audio.setListener(camera.position);
  env.update(dt, tNow / 1000, camT.lengthSq() ? camT : camera.position);
  fx.update(dt);
  atmos.update(dt);
  if (app.state === 'game') updateHud(dt);
  const T4 = performance.now();
  renderer.render(scene, camera);
  const T5 = performance.now(), A = timing, k = 0.1;
  A.dis = lerp(A.dis, T1 - T0, k); A.beans = lerp(A.beans, T2 - T1, k); A.anim = lerp(A.anim, T3 - T2, k); A.rest = lerp(A.rest, T4 - T3, k); A.render = lerp(A.render, T5 - T4, k);
}
const timing = { dis: 0, beans: 0, anim: 0, rest: 0, render: 0 };

// ============================== START ==============================
async function boot() {
  const bar = $('bootBar'), txt = $('bootText');
  const step = async (k, msg) => { bar.style.width = k + '%'; txt.textContent = msg; await new Promise(r => setTimeout(r, 30)); };
  fillIcons();
  await step(10, 'Building Bean Town...');
  try { await document.fonts.load('400 40px "Lilita One"'); } catch (e) {}
  map = buildWorld(settings.quality); world = map.world;
  scene.add(map.scene);
  await step(70, 'Filling the sea...');
  fx = new FX(scene);
  env = new Env(scene, map, fx, audio, settings.quality);
  me = addBody({ id: myId, name: prof.name, skin: prof.skin, isMe: true });
  toLobby(me, 0); me.alive = true;
  syncBots();
  await step(100, 'Ready!');
  coinsUI();
  app.state = 'title';
  $('boot').classList.remove('on'); $('title').classList.add('on');
  renderTitle();
  if (TOUCH) $('titleHint').textContent = 'Left stick to move, orange button to jump, drag to look around';
  // a friend's join link: ?join=CODE
  const code = new URLSearchParams(location.search).get('join');
  if (code) joinParty(code);
  // use your B10GAMES account name if you have one
  setTimeout(() => { const u = window.B10Account && window.B10Account.user; if (u && u.name && /^Bean\d+$/.test(prof.name)) { prof.name = u.name.slice(0, 14); saveProf(); me.setName(prof.name); netMe.name = prof.name; } }, 1500);
}
requestAnimationFrame(frame);
boot().catch(e => { console.error(e); $('bootText').textContent = 'Something went wrong: ' + e.message; });
window.BD = { timing, renderer, camera, scene, app, game, bodies, get me() { return me; }, get map() { return map; }, get env() { return env; }, hostPhase, startRound, net, look(yaw, pitch) { camYaw = yaw; if (pitch !== undefined) camPitch = pitch; } };
