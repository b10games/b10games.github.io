// Beans Tower Defense: boot, the dancing lobby, the Bean Shop, map/difficulty/rounds select, the camera,
// mouse + touch controls (iPad friendly) and the main loop.
import { THREE, createRenderer, applyQuality, makeWorldScene, clamp, damp, rng } from './engine.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { DIFFS, MAPS, MAP, BEANS, BEAN, FARMS, FARM, BALLOONS, BALLOON_ORDER, FIELD, STARTERS, TEAM_SIZE, ROUND_OPTIONS, coinsFor, beanStats, upgradePrice, priceOf } from './data.js';
import { buildMap } from './map.js';
import { FX } from './fx.js';
import { Audio, MUSIC } from './audio.js';
import { Game } from './game.js';
import { BalloonView } from './balloons.js';
import { Bean, TowerBean, FarmModel, ACCESSORIES, setFace, dance, DANCES } from './bean.js';
import { icon, fillIcons } from './icons.js';
import { UI, $ } from './ui.js';
import { Ambient } from './ambient.js';
import { BeanPreview } from './preview.js';
import { Walker, RemotePlayer, PLAYER_COLORS } from './player.js';
import { Net } from './net.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const load = (k, d) => { try { return Object.assign(d, JSON.parse(localStorage.getItem(k)) || {}); } catch (e) { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const fmt = n => Math.floor(n).toLocaleString('en-US');
const app = window.BTD_APP = {
  state: 'boot', settings: load('btd-settings', { quality: 'high' }), progress: load('btd-progress', {}), audio: new Audio(),
  save: load('btd-save', { coins: 0, owned: [...STARTERS], team: [...STARTERS], farms: ['farm'], best: {} }),
  portraits: {}, thumbs: {}, sel: { map: 'valley', diff: 'medium', rounds: 40 }, speed: 1, paused: false, acc: 0, animT: 0
};
// keep the save valid even if beans were added or renamed
app.save.owned = [...new Set([...STARTERS, ...app.save.owned.filter(id => BEAN[id])])];
app.save.team = app.save.team.filter(id => app.save.owned.includes(id)).slice(0, TEAM_SIZE); if (!app.save.team.length) app.save.team = [...STARTERS];
app.save.farms = [...new Set(['farm', ...app.save.farms.filter(id => FARM[id])])];
const writeSave = () => save('btd-save', app.save);

// ---------- who you are (your B10GAMES account name, or a guest name) ----------
let guestName = null; try { guestName = localStorage.getItem('btd-name'); } catch (e) {}
if (!guestName) { guestName = 'Player' + (100 + Math.floor(Math.random() * 900)); try { localStorage.setItem('btd-name', guestName); } catch (e) {} }
const ME = { id: 'p' + Math.random().toString(36).slice(2, 9), skin: 0, level: 1, get name() { const u = window.B10Account && window.B10Account.user; return (u && u.name) || guestName; } };
const net = new Net(ME);
// a party game: the leader's computer runs the game and sends out the tick count and every action;
// everyone else runs the exact same game a moment behind, so all screens show the same balloons and beans
const party = { on: false, host: false, seed: 1, hostTick: 0, pending: [], outbox: [], seq: 0, sums: new Map(), sum: null, lastBeat: 0, lastAv: 0, needT: 0, names: {}, remotes: new Map(), speed: 1 };
function nameOf(id) { if (id === ME.id) return ME.name; const m = net.members.get(id); return (m && m.name) || party.names[id] || 'Player'; }
function colorOf(id) { const g = app.game, i = g ? g.players.indexOf(id) : -1; return PLAYER_COLORS[(i >= 0 ? i : 0) % PLAYER_COLORS.length]; }
app.nameOf = nameOf; app.colorOf = colorOf; app.me = ME;

// ---------- actions: alone they happen right away, in a party they go through the leader ----------
function act(a) {
  const g = app.game; if (!g || app.state !== 'game') return null;
  a.p = ME.id;
  if (party.on && !party.host) { net.send({ t: 'act', a }); return 'sent'; }
  return hostApply(a);
}
app.act = act;
function hostApply(a) {
  const g = app.game; if (!g) return null;
  const r = applyAct(g, a);
  if (party.on && party.host) { party.seq++; party.outbox.push([g.tick, party.seq, a]); }
  return r;
}
function applyAct(g, a) {
  const t = a.t ? g.towerById(a.t) : null, tp = t ? { x: t.x, z: t.z } : null;
  const r = g.act(a);
  if (a.p !== ME.id || g !== app.game) return r;
  // feedback for your own actions
  if (a.k === 'place') { if (r) { const p = app.toScreen(a.x, 2.5, a.z); app.ui.float(p.x, p.y, `-${icon('coin')}${fmt(r.spent)}`, true); } else app.audio.sfx('error'); }
  else if (a.k === 'up' || a.k === 'upall') { if (!r) app.audio.sfx('error'); else app.ui.infoKey = app.ui.multiKey = ''; }
  else if (a.k === 'sell' && tp) { const p = app.toScreen(tp.x, 2, tp.z); app.ui.float(p.x, p.y, `+${icon('coin')}${fmt(r)}`); }
  else if (a.k === 'sellall' && r) { const q = $('sMoney').getBoundingClientRect(); app.ui.float(q.left + 30, q.bottom + 4, `+${icon('coin')}${fmt(r)}`); }
  else if (a.k === 'wave' && !r) app.audio.sfx('error');
  return r;
}
const canvas = $('gl');
const renderer = app.renderer = createRenderer(canvas, app.settings.quality);
const camera = app.camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 1, 700);
// ---------- glow: on High graphics bright things (lasers, sparks, fireworks, lava, magic) shine ----------
// If the device cannot keep up, the glow switches itself off.
const post = { composer: null, render: null, bloom: null, ok: true, frames: 0, slow: 0 };
const GLOW = { valley: 0.95, candy: 1.0, dunes: 1.0, frost: 1.3, lava: 1.2, swamp: 0.75 };
function postOn() { return app.settings.quality !== 'low' && post.ok; }
function sizePost() { if (!post.composer) return; post.composer.setPixelRatio(renderer.getPixelRatio()); post.composer.setSize(innerWidth, innerHeight); }
function makePost() {
  const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
  post.composer = new EffectComposer(renderer, rt);
  post.render = new RenderPass(new THREE.Scene(), camera);
  post.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.42, 0.95);
  post.composer.addPass(post.render); post.composer.addPass(post.bloom); post.composer.addPass(new OutputPass());
  sizePost();
}
function draw(scene, dt) {
  if (!postOn()) { renderer.render(scene, camera); return; }
  if (!post.composer) makePost();
  post.render.scene = scene;
  post.bloom.threshold = GLOW[app.mapObj && app.mapObj.def.theme] || 0.95;
  post.composer.render(dt);
}
const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
app.ui = new UI(app);

// ---------- screens ----------
const SCREENS = ['boot', 'lobby', 'maps', 'shopScreen'];
function screen(id) { for (const s of SCREENS) $(s).classList.toggle('on', s === id); if (id === 'lobby') refreshContinue(); }
function modal(id, on) { $(id).classList.toggle('on', on); }
const click = () => app.audio.sfx('click');
function refreshCoins() { document.querySelectorAll('.coinCount').forEach(el => { el.textContent = fmt(app.save.coins); }); }

// ---------- the lobby: a stage full of dancing beans ----------
const CROWD = [
  { kind: 'dart' }, { colors: ['#ff5c9a', '#ffd23f'], acc: 'partyhat', ac: '#3a86ff', face: { eyes: 1.15 } }, { kind: 'freeze' },
  { colors: ['#4cc9f0', '#ffffff'], acc: 'headphones', ac: '#ff5c9a', face: { mouth: 'grin' } }, { kind: 'ninja' },
  { colors: ['#c77dff', '#ffd23f'], acc: 'crown', face: { eyes: 1.2, mouth: 'open' } }, { kind: 'boomerang' },
  { kind: 'magic' }, { kind: 'bomb' },
  { colors: ['#ffd23f', '#ff5c9a'], acc: 'bow', ac: '#ff5c9a', face: { brows: 'happy' } },
  { kind: 'cannon' },
  { colors: ['#7df9ff', '#5e60ce'], acc: 'antenna', ac: '#ffd23f', face: { eyes: 0.9, mouth: 'open' } },
  { kind: 'laser' }, { colors: ['#5bd16b', '#ff8c42'], acc: 'propeller', ac: '#ff4d6d', face: { freckles: true } }
];
class Lobby {
  constructor() {
    const T = { skyTop: '#7a5cff', skyMid: '#ffb3e0', skyBottom: '#ffe0f0', sunDir: [0.4, 0.9, 0.6], sunColor: '#fff4e0', sunInt: 2.4, fog: '#ffd9ef', fogNear: 60, fogFar: 160, hemiSky: '#fff2fb', hemiGround: '#6a8a4c', hemiInt: 1.3 };
    const s = this.scene = makeWorldScene(T, app.settings.quality); s.environment = envTex; s.environmentIntensity = 0.4;
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.5, 400);
    const R = rng(77);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(160, 48), new THREE.MeshStandardMaterial({ color: '#7cc458', roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; s.add(ground);
    const stage = new THREE.Mesh(new THREE.CylinderGeometry(10, 10.6, 0.7, 64), new THREE.MeshStandardMaterial({ color: '#ffe3f1', roughness: 0.5 })); stage.position.y = 0.35; stage.receiveShadow = true; stage.castShadow = true; s.add(stage);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(10.3, 0.22, 10, 80), new THREE.MeshPhysicalMaterial({ color: '#ff5c9a', roughness: 0.3, clearcoat: 1 })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.72; s.add(ring);
    const inner = new THREE.Mesh(new THREE.CircleGeometry(7.5, 64), new THREE.MeshStandardMaterial({ color: '#ffd23f', roughness: 0.6 })); inner.rotation.x = -Math.PI / 2; inner.position.y = 0.71; inner.receiveShadow = true; s.add(inner);
    const riser = new THREE.Mesh(new THREE.CylinderGeometry(8.6, 8.6, 0.5, 64, 1, false, Math.PI * 0.62, Math.PI * 0.76), new THREE.MeshStandardMaterial({ color: '#ff9ecf', roughness: 0.5 })); riser.position.set(0, 0.95, -0.4); riser.castShadow = true; riser.receiveShadow = true; s.add(riser);
    this.bulbs = [];
    for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2, b = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshStandardMaterial({ color: '#fff3b0', emissive: ['#ff5c9a', '#ffd23f', '#4cc9f0', '#5bd16b'][i % 4], emissiveIntensity: 1 })); b.position.set(Math.cos(a) * 10.3, 0.95, Math.sin(a) * 10.3); s.add(b); this.bulbs.push(b); }
    const treeG = new THREE.IcosahedronGeometry(1.6, 1), trunkG = new THREE.CylinderGeometry(0.25, 0.35, 2, 7);
    for (let i = 0; i < 26; i++) {
      const a = Math.PI * (1.08 + R() * 0.84), r = 20 + R() * 30, x = Math.cos(a) * r, z = Math.sin(a) * r - 4;
      const tr = new THREE.Mesh(trunkG, new THREE.MeshStandardMaterial({ color: '#8d5524' })); tr.position.set(x, 1, z); s.add(tr);
      const top = new THREE.Mesh(treeG, new THREE.MeshStandardMaterial({ color: ['#4caf50', '#ff9ebb', '#7bd389', '#f7b6d9', '#3f9d4a'][i % 5], flatShading: true })); top.position.set(x, 3 + R(), z); top.scale.setScalar(0.9 + R() * 0.8); top.castShadow = true; s.add(top);
    }
    const bGeo = new THREE.SphereGeometry(0.7, 20, 14); bGeo.scale(1, 1.2, 1);
    this.balloons = [];
    for (let i = 0; i < 22; i++) {
      const g = new THREE.Group(); const b = new THREE.Mesh(bGeo, new THREE.MeshPhysicalMaterial({ color: ['#ff4d5e', '#3a8bff', '#36c46b', '#ffd23f', '#9b5de5', '#ff8c42'][i % 6], roughness: 0.15, clearcoat: 1 })); g.add(b);
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.6, 4), new THREE.MeshBasicMaterial({ color: '#ffffff' })); st.position.y = -1.6; g.add(st);
      const side = i % 2 ? 1 : -1; g.userData = { x: side * (11 + R() * 14), z: -6 - R() * 16, y: R() * 14, sp: 0.6 + R() * 0.8, ph: R() * 6 };
      s.add(g); this.balloons.push(g);
    }
    this.beans = CROWD.map((c, i) => {
      let b;
      if (c.kind) b = new TowerBean(c.kind, BEAN[c.kind].colors);
      else { b = new Bean('plain', c.colors); ACCESSORIES[c.acc](b, c.ac || c.colors[1]); setFace(b, c.face || {}); }
      const row = i % 2, k = Math.floor(i / 2), n = 7, a = (k - (n - 1) / 2) * (row ? 0.31 : 0.29);
      const r = row ? 6.4 : 3.6;
      b.root.position.set(Math.sin(a) * r * 1.3, row ? 1.2 : 0.72, -Math.cos(a) * r + 3.2 - (row ? 1.0 : 0));
      b.root.rotation.y = -a * 0.6; b.root.scale.setScalar(1.25);
      b.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
      s.add(b.root);
      return { b, style: DANCES[i % DANCES.length], t: R() * 3, look: 0, lookT: 0 };
    });
    this.fx = new FX(s); this.confT = 1; this.t = 0;
  }
  update(dt, aspect) {
    this.t += dt;
    const cam = this.camera; cam.aspect = aspect; cam.fov = aspect < 1.2 ? 52 : 38; cam.updateProjectionMatrix();
    cam.position.set(Math.sin(this.t * 0.15) * 1.6, 5.2, 17.5); cam.lookAt(0, 2.4, 0);
    for (const d of this.beans) {
      d.t -= dt;
      if (d.t < 0) { d.t = 3 + Math.random() * 4; if (Math.random() < 0.5) d.style = DANCES[Math.floor(Math.random() * DANCES.length)]; if (Math.random() < 0.45) { d.look = (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.4); d.lookT = 1.6; } }
      if (d.lookT > 0) { d.lookT -= dt; if (d.lookT <= 0) d.look = 0; }
      dance(d.b, dt, d.style, d.look);
    }
    this.bulbs.forEach((b, i) => { b.material.emissiveIntensity = 0.4 + (Math.sin(this.t * 6 + i * 0.8) > 0.3 ? 1.4 : 0); });
    for (const g of this.balloons) { const u = g.userData; u.y += dt * u.sp; if (u.y > 18) u.y = -2; g.position.set(u.x + Math.sin(this.t + u.ph) * 0.6, u.y, u.z); g.rotation.z = Math.sin(this.t * 1.3 + u.ph) * 0.15; }
    this.confT -= dt; if (this.confT < 0) { this.confT = 2.5 + Math.random() * 2; this.fx.confetti(new THREE.Vector3((Math.random() - 0.5) * 12, 1.5, (Math.random() - 0.5) * 4), 70, 6); }
    this.fx.update(dt);
  }
}

// ---------- pictures for the shop cards and the map cards ----------
function renderToImage(scene, cam, w, h, transparent) {
  const rt = new THREE.WebGLRenderTarget(w, h, { samples: 4 }), buf = new Uint8Array(w * h * 4);
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const oldClear = renderer.getClearAlpha();
  if (transparent) renderer.setClearColor(0x000000, 0);
  renderer.setRenderTarget(rt); renderer.render(scene, cam); renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf); renderer.setRenderTarget(null);
  renderer.setClearColor(0x000000, oldClear);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d'), img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) img.data.set(buf.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  g.putImageData(img, 0, 0); rt.dispose();
  return cv.toDataURL();
}
function makePortraits() {
  const scene = new THREE.Scene(); scene.environment = envTex; scene.environmentIntensity = 0.5;
  scene.add(new THREE.HemisphereLight('#ffffff', '#806090', 1.6)); const l = new THREE.DirectionalLight('#ffffff', 2.2); l.position.set(2, 4, 5); scene.add(l);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50); cam.position.set(1.0, 1.55, 3.5); cam.lookAt(0, 1.0, 0);
  for (const b of BEANS) { const m = new TowerBean(b.id, b.colors); m.update(0.016, { speed: 0 }); scene.add(m.root); app.portraits[b.id] = renderToImage(scene, cam, 192, 192, true); scene.remove(m.root); }
  const fcam = new THREE.PerspectiveCamera(30, 1, 0.1, 60); fcam.position.set(4.5, 5, 7); fcam.lookAt(0, 0.4, 0);
  for (const f of FARMS) { const m = new FarmModel(f.id); m.setSkin(f.id === 'goldfarm' ? 3 : f.id === 'candyfarm' ? 2 : 1); m.update(0.016); scene.add(m.root); app.portraits[f.id] = renderToImage(scene, fcam, 192, 192, true); scene.remove(m.root); }
}
function disposeScene(scene) {
  scene.traverse(o => { if (o.geometry) o.geometry.dispose(); const ms = o.material ? [].concat(o.material) : []; for (const m of ms) { if (m.map) m.map.dispose(); m.dispose(); } });
}
function makeThumb(def) {
  const map = buildMap(def, 'low');
  const cam = new THREE.PerspectiveCamera(34, 16 / 10, 1, 600); cam.position.set(0, 88, 58); cam.lookAt(0, 0, 2);
  map.scene.environment = envTex; map.scene.environmentIntensity = 0.4;
  const url = renderToImage(map.scene, cam, 400, 250, false);
  disposeScene(map.scene);
  return url;
}

// ---------- the Bean Shop (buy beans and farms with Bean Coins, pick your team) ----------
const KIND_NAME = { dart: 'Darts', hitscan: 'Long range shots', boom: 'Boomerang', bomb: 'Explosions', ice: 'Freezing', tack: 'Tack ring', glue: 'Slowing glue', laser: 'Laser beam', tazer: 'Electric zaps', chain: 'Chain lightning', magic: 'Homing magic', cannon: 'Heavy cannon', wind: 'Blows balloons back', support: 'Makes beans faster' };
const KIND_OF = b => b.proj === 'arrow' ? 'Long range arrows' : b.proj === 'bullet' ? 'Super fast bullets' : b.proj === 'thorn' ? 'Thorn ring' : b.proj === 'fire' ? 'Fire and burning' : b.proj === 'bee' ? 'Homing bees' : b.proj === 'rocket' ? 'Map-wide rockets' : b.proj === 'super' ? 'Heat vision' : b.proj === 'grape' ? 'Double cannon' : KIND_NAME[b.kind];
function renderShop() {
  const sv = app.save;
  refreshCoins();
  $('teamCount').textContent = `${sv.team.length} / ${TEAM_SIZE}`;
  $('teamBar').innerHTML = Array.from({ length: TEAM_SIZE }, (_, i) => { const id = sv.team[i]; return id ? `<div class="slot full" data-id="${id}" style="--c1:${BEAN[id].badge[0]};--c2:${BEAN[id].badge[1]}" title="Remove from team"><img src="${app.portraits[id]}" alt=""><span>${BEAN[id].name.replace(' Bean', '')}</span><b>${icon('close')}</b></div>` : `<div class="slot"><span>Empty</span></div>`; }).join('');
  const beanCard = b => {
    const own = sv.owned.includes(b.id), inTeam = sv.team.includes(b.id), can = sv.coins >= b.unlock;
    const btn = own ? (inTeam ? `<button class="btn ghost on" data-team="${b.id}">${icon('check')}IN TEAM</button>` : `<button class="btn blue" data-team="${b.id}" ${sv.team.length >= TEAM_SIZE ? 'disabled' : ''}>${icon('team')}ADD TO TEAM</button>`)
      : `<button class="btn ${can ? 'green' : ''}" data-buy="${b.id}" ${can ? '' : 'disabled'}>${icon('beancoin')}${fmt(b.unlock)}</button>`;
    return `<div class="scard panel ${own ? '' : 'locked'}" style="--c1:${b.badge[0]};--c2:${b.badge[1]}"><button class="btn ghost lvBtn" data-book="${b.id}" title="See every level">${icon('upgrade')}LEVELS</button><img src="${app.portraits[b.id]}" alt="" data-book="${b.id}" title="See every level">${own ? '' : `<span class="lockic">${icon('lock')}</span>`}<h3>${b.name}</h3><div class="kind">${KIND_OF(b)}</div><p>${b.desc}</p>${btn}</div>`;
  };
  $('shopBeans').innerHTML = BEANS.slice().sort((a, b) => a.unlock - b.unlock || a.cost - b.cost).map(beanCard).join('');
  $('shopFarms').innerHTML = FARMS.map(f => {
    const own = sv.farms.includes(f.id), can = sv.coins >= f.unlock;
    return `<div class="scard panel ${own ? '' : 'locked'}" style="--c1:${f.badge[0]};--c2:${f.badge[1]}"><img src="${app.portraits[f.id]}" alt="">${own ? '' : `<span class="lockic">${icon('lock')}</span>`}<h3>${f.name}</h3><div class="kind">${f.income} money per wave</div><p>${f.desc}</p>${own ? `<button class="btn ghost on" disabled>${icon('check')}OWNED</button>` : `<button class="btn ${can ? 'green' : ''}" data-buyfarm="${f.id}" ${can ? '' : 'disabled'}>${icon('beancoin')}${fmt(f.unlock)}</button>`}</div>`;
  }).join('');
  const wire = (sel, fn) => document.querySelectorAll(sel).forEach(el => el.addEventListener('click', () => fn(el)));
  wire('#teamBar .slot.full', el => { if (sv.team.length <= 1) { app.audio.sfx('error'); return; } sv.team = sv.team.filter(x => x !== el.dataset.id); writeSave(); click(); renderShop(); });
  wire('[data-team]', el => { const id = el.dataset.team; if (sv.team.includes(id)) { if (sv.team.length <= 1) { app.audio.sfx('error'); return; } sv.team = sv.team.filter(x => x !== id); } else if (sv.team.length < TEAM_SIZE) sv.team.push(id); else { app.audio.sfx('error'); return; } writeSave(); app.audio.sfx('select'); renderShop(); });
  wire('[data-buy]', el => { const b = BEAN[el.dataset.buy]; if (sv.coins < b.unlock) { app.audio.sfx('error'); return; } sv.coins -= b.unlock; sv.owned.push(b.id); if (sv.team.length < TEAM_SIZE) sv.team.push(b.id); writeSave(); app.audio.sfx('unlock'); renderShop(); });
  wire('[data-book]', el => { click(); openBook(el.dataset.book); });
  wire('[data-buyfarm]', el => { const f = FARM[el.dataset.buyfarm]; if (sv.coins < f.unlock) { app.audio.sfx('error'); return; } sv.coins -= f.unlock; sv.farms.push(f.id); writeSave(); app.audio.sfx('unlock'); renderShop(); });
}

// ---------- Bean Book: every level of a bean with a live preview ----------
const STAT_NAME = { dmg: 'Damage', rate: 'Attacks / sec', range: 'Range', pierce: 'Pierce', count: 'Shots', radius: 'Blast size', maxHits: 'Hits per attack', freeze: 'Freeze time', slow: 'Slow', slowT: 'Effect time', area: 'Area', dot: 'Damage per sec', chain: 'Jumps', bounceR: 'Jump distance', ricochet: 'Bounces', bossMul: 'Boss damage', push: 'Push back', boost: 'Beans faster', rangeUp: 'Extra range for beans', cluster: 'Mini bombs', shatter: 'Shatter damage', blizzard: 'Blizzard', blaze: 'Burning', stun: 'Stun', arc: 'Arc jumps' };
const statVal = (k, v) => v == null ? '-' : k === 'rate' ? v.toFixed(2) : k === 'slow' || k === 'boost' ? Math.round(v * 100) + '%' : k === 'bossMul' ? 'x' + v : k === 'freeze' || k === 'slowT' || k === 'stun' ? (+v).toFixed(1) + 's' : k === 'blizzard' || k === 'blaze' ? (v ? 'Yes' : 'No') : k === 'range' && v > 100 ? 'Map' : +(+v).toFixed(1);
const book = { id: null, lvl: 0, view: null };
function openBook(id, lvl = 0) {
  book.id = id; const b = BEAN[id];
  $('bbImg').src = app.portraits[id] || ''; $('beanBook').style.setProperty('--c1', b.badge[0]); $('beanBook').style.setProperty('--c2', b.badge[1]);
  $('bbName').textContent = b.name; $('bbKind').textContent = KIND_OF(b); $('bbDesc').textContent = b.desc;
  $('bbLevels').innerHTML = Array.from({ length: 11 }, (_, i) => `<button data-lv="${i}" class="${i === 5 || i === 10 ? 'star' : ''}">${i === 0 ? 'NEW' : i}<small>${i === 0 ? 'START' : i === 5 || i === 10 ? 'NEW LOOK' : 'LEVEL'}</small></button>`).join('');
  $('bbLevels').querySelectorAll('button').forEach(el => el.onclick = () => { click(); showLevel(+el.dataset.lv); });
  modal('beanBook', true);
  if (!book.view) book.view = new BeanPreview($('bbCanvas'));
  showLevel(lvl);
}
function showLevel(L) {
  const b = BEAN[book.id], s = beanStats(b, L), prev = L > 0 ? beanStats(b, L - 1) : null, easy = DIFFS.easy;
  book.lvl = L;
  $('bbLevels').querySelectorAll('button').forEach(el => el.classList.toggle('on', +el.dataset.lv === L));
  $('bbTag').innerHTML = `${icon('upgrade')}${L === 0 ? 'Just bought' : 'Level ' + L + ' / 10'}`;
  const keys = Object.keys(STAT_NAME).filter(k => k !== 'cd' && (s[k] != null || (prev && prev[k] != null)) && !(k === 'bossMul' && s[k] === 1 && (!prev || prev[k] === 1)) && !(k === 'dmg' && b.kind === 'support') && !(k === 'rate' && b.kind === 'support'));
  const rows = keys.map(k => {
    const now = s[k], was = prev ? prev[k] : now, ch = prev && now !== was;
    const diff = ch && typeof now === 'number' && typeof (was || 0) === 'number' ? (k === 'rate' ? '+' + Math.round((now / (was || 1) - 1) * 100) + '%' : k === 'slow' || k === 'boost' ? '+' + Math.round((now - (was || 0)) * 100) + '%' : (now - (was || 0) > 0 ? '+' : '') + +(now - (was || 0)).toFixed(1)) : '';
    return `<div class="${ch ? 'ch' : ''}"><span>${STAT_NAME[k]}</span><b>${statVal(k, now)}</b><span class="up">${diff}</span></div>`;
  }).join('');
  const up = L > 0 ? b.ups[L - 1] : null;
  const head = up ? `<h2>${up.name}${L === 5 || L === 10 ? `<span class="newlook">${icon('max')}New look!</span>` : ''}</h2><p>${up.desc}</p><div class="price">${icon('coin')}${fmt(upgradePrice(b, L - 1, easy))} to upgrade</div>`
    : `<h2>Just bought</h2><p>${b.desc}</p><div class="price">${icon('coin')}${fmt(priceOf(b.cost, easy))} to place</div>`;
  $('bbInfo').innerHTML = `<div class="bbUp">${head}</div><div class="bbStats">${rows}</div>`;
  let total = priceOf(b.cost, easy); for (let i = 0; i < L; i++) total += upgradePrice(b, i, easy);
  const sv = app.save, own = sv.owned.includes(b.id), inTeam = sv.team.includes(b.id), can = sv.coins >= b.unlock;
  $('bbFoot').innerHTML = `<span class="note">Total for level ${L}: ${fmt(total)} money in a game</span>` +
    (own ? (inTeam ? `<button class="btn ghost on" disabled>${icon('check')}IN TEAM</button>` : `<button class="btn blue" id="bbTeam" ${sv.team.length >= TEAM_SIZE ? 'disabled' : ''}>${icon('team')}ADD TO TEAM</button>`)
      : `<button class="btn ${can ? 'green' : ''}" id="bbBuy" ${can ? '' : 'disabled'}>${icon('beancoin')}BUY ${fmt(b.unlock)}</button>`);
  if ($('bbBuy')) $('bbBuy').onclick = () => { if (sv.coins < b.unlock) return app.audio.sfx('error'); sv.coins -= b.unlock; sv.owned.push(b.id); if (sv.team.length < TEAM_SIZE) sv.team.push(b.id); writeSave(); app.audio.sfx('unlock'); renderShop(); showLevel(L); };
  if ($('bbTeam')) $('bbTeam').onclick = () => { if (sv.team.length >= TEAM_SIZE) return app.audio.sfx('error'); sv.team.push(b.id); writeSave(); app.audio.sfx('select'); renderShop(); showLevel(L); };
  book.view.show(book.id, L);
}
function closeBook() { modal('beanBook', false); if (book.view) book.view.stop(); }

// ---------- map, difficulty and rounds ----------
function renderMapSelect() {
  $('mapGrid').innerHTML = MAPS.map(m => {
    const pr = app.progress[m.id] || {}, best = app.save.best[m.id];
    const medals = ['easy', 'medium', 'hard'].map(d => `<span class="m ${pr[d] ? 'won' : ''}" title="${DIFFS[d].name}${pr[d] ? ' cleared' : ''}">${icon('medal')}</span>`).join('');
    return `<div class="mapcard panel ${app.sel.map === m.id ? 'on' : ''}" data-id="${m.id}"><div class="thumb" style="background-image:url(${app.thumbs[m.id] || ''})"></div><span class="tag">${m.level}</span><span class="sel">${icon('check')}</span><h2>${m.name}</h2><p>${m.desc}</p><div class="medals">${medals}${best ? `<span class="inf">${icon('infinity')}${best}</span>` : ''}</div></div>`;
  }).join('');
  const d = DIFFS[app.sel.diff];
  const diffCard = x => `<div class="diff panel ${app.sel.diff === x.id ? 'on' : ''} ${x.infinite ? 'infcard' : ''}" data-id="${x.id}" style="--dc:${x.color}"><h3>${x.infinite ? icon('infinity') : ''}${x.infinite ? 'INFINITY MODE' : x.name.toUpperCase()}</h3>
    ${x.infinite ? `<p>${x.desc}</p>` : `<div class="rows"><div>${icon('heart')}${x.lives}<small>LIVES</small></div><div>${icon('coin')}${x.money}<small>MONEY</small></div><div>${icon('beancoin')}x${x.coins}<small>COINS</small></div></div><p>${x.desc}</p>`}</div>`;
  $('diffGrid').innerHTML = ['easy', 'medium', 'hard'].map(k => diffCard(DIFFS[k])).join('') + `<div class="infslot">${diffCard(DIFFS.infinity)}</div>`;
  $('roundSeg').innerHTML = ROUND_OPTIONS.map(r => `<button data-v="${r}" class="${app.sel.rounds === r ? 'on' : ''}">${r}</button>`).join('');
  $('roundRow').classList.toggle('off', !!d.infinite);
  $('mapGrid').querySelectorAll('.mapcard').forEach(el => el.addEventListener('click', () => { app.sel.map = el.dataset.id; app.audio.sfx('select'); renderMapSelect(); }));
  $('diffGrid').querySelectorAll('.diff').forEach(el => el.addEventListener('click', () => { const id = el.dataset.id; if (!DIFFS[id].infinite && app.sel.diff !== id) app.sel.rounds = DIFFS[id].rounds; app.sel.diff = id; app.audio.sfx('select'); renderMapSelect(); }));
  $('roundSeg').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { if (d.infinite) return; app.sel.rounds = +b.dataset.v; app.audio.sfx('select'); renderMapSelect(); }));
  $('summary').innerHTML = `${MAP[app.sel.map].name} · <span style="color:${d.color}">${d.name}</span> · ${d.infinite ? 'endless waves' : app.sel.rounds + ' waves'}`;
}

// ---------- camera ----------
class Cam {
  constructor() { this.zoom = 1; this.zoomT = 1; this.tx = 0; this.tz = 0; this.cx = 0; this.cz = 0; this.fitD = 90; this.pitch = 0.98; }
  shopW() { return innerWidth < 760 ? 200 : innerWidth < 1100 ? 250 : 300; }
  place(dist, tx, tz) { camera.position.set(tx, Math.sin(this.pitch) * dist, tz + Math.cos(this.pitch) * dist); camera.lookAt(tx, 0, tz); camera.updateMatrixWorld(); }
  fit() {
    const W = innerWidth, H = innerHeight, sw = this.shopW();
    camera.fov = 36;
    document.documentElement.style.setProperty('--shopw', sw + 'px');
    camera.aspect = W / H; camera.setViewOffset(W, H, sw / 2, -24, W, H); camera.updateProjectionMatrix();
    const v = new THREE.Vector3(), fits = d => { this.place(d, 0, 0); for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { v.set(x * (FIELD.w + 1), 0, z * (FIELD.h + 1)).project(camera); const px = (v.x + 1) / 2 * W, py = (1 - v.y) / 2 * H; if (px < 6 || px > W - sw - 4 || py < 68 || py > H - 6) return false; } return true; };
    let lo = 20, hi = 400; for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
    this.fitD = hi;
  }
  update(dt) {
    this.zoom = damp(this.zoom, this.zoomT, 10, dt);
    if (this.zoomT >= 0.999) { this.tx = damp(this.tx, 0, 6, dt); this.tz = damp(this.tz, 0, 6, dt); }
    const lim = (1 - this.zoom) * 1.15;
    this.tx = clamp(this.tx, -FIELD.w * lim, FIELD.w * lim); this.tz = clamp(this.tz, -FIELD.h * lim, FIELD.h * lim);
    this.cx = damp(this.cx, this.tx, 12, dt); this.cz = damp(this.cz, this.tz, 12, dt);
    // walking: the camera flies down behind your bean (and back up when you go out)
    app.walkK = clamp((app.walkK || 0) + (app.walking ? dt : -dt) / 0.75, 0, 1);
    const D = this.fitD * this.zoom, w = app.walker, k = w ? app.walkK : 0;
    _tp.set(this.cx, Math.sin(this.pitch) * D, this.cz + Math.cos(this.pitch) * D); _tl.set(this.cx, 0, this.cz);
    if (k > 0.0005) {
      w.camPose(_wp, _wl);
      const e = k * k * (3 - 2 * k), lift = Math.sin(e * Math.PI) * 6;
      camera.position.lerpVectors(_tp, _wp, e); camera.position.y += lift; _tl.lerp(_wl, e);
      const fov = 36 + 16 * e; if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
      camera.lookAt(_tl); camera.updateMatrixWorld();
      if (app.mapObj) app.mapObj.scene.userData.setFocus(_fv.set(this.cx + (w.x - this.cx) * e, 0, this.cz + (w.z - this.cz) * e));
    } else {
      if (camera.fov !== 36) { camera.fov = 36; camera.updateProjectionMatrix(); }
      camera.position.copy(_tp); camera.lookAt(_tl); camera.updateMatrixWorld();
      if (app.mapObj) app.mapObj.scene.userData.setFocus(_fv.set(this.cx, 0, this.cz));
    }
  }
  setZoom(z, gp) {
    const old = this.zoomT;
    this.zoomT = clamp(z, 0.32, 1);
    if (gp && this.zoomT < old) { const k = 1 - this.zoomT / old; this.tx += (gp.x - this.tx) * k; this.tz += (gp.z - this.tz) * k; }
  }
  wheel(dy, gp) { this.setZoom(this.zoomT * Math.exp(dy * 0.0011), gp); }
}
const _tp = new THREE.Vector3(), _tl = new THREE.Vector3(), _wp = new THREE.Vector3(), _wl = new THREE.Vector3(), _fv = new THREE.Vector3();
app.cam = new Cam();
app.toScreen = (x, y, z) => { const v = new THREE.Vector3(x, y, z).project(camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }; };

// ---------- mouse, touch and keys ----------
const MOVE_KEYS = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r' };
const _gp = new THREE.Vector3();
class Input {
  constructor() {
    this.mouse = { x: 0, y: 0 }; this.ground = new THREE.Vector3(); this.ray = new THREE.Raycaster(); this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.placing = null; this.placingFarm = false; this.ghost = null; this.selected = null; this.multi = false; this.picked = [];
    this.pointers = new Map(); this.drag = null; this.pinch = null;
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('pointerdown', e => this.down(e));
    canvas.addEventListener('pointermove', e => { this.mouseHover = e.pointerType === 'mouse'; this.move(e); });
    canvas.addEventListener('pointerleave', () => { this.mouseHover = false; });
    canvas.addEventListener('pointerup', e => this.up(e));
    canvas.addEventListener('pointercancel', e => { this.pointers.delete(e.pointerId); this.pinch = null; this.drag = null; });
    canvas.addEventListener('wheel', e => { if (app.state !== 'game') return; e.preventDefault(); if (app.walking) app.walker.zoom(Math.exp(e.deltaY * 0.001)); else app.cam.wheel(e.deltaY, this.ground); }, { passive: false });
    addEventListener('keydown', e => this.key(e));
    addEventListener('keyup', e => this.keyUp(e));
    addEventListener('blur', () => this.releaseKeys());
    const disc = new THREE.CircleGeometry(1, 64); disc.rotateX(-Math.PI / 2);
    const ring = new THREE.RingGeometry(0.97, 1, 72); ring.rotateX(-Math.PI / 2);
    this.rangeDisc = new THREE.Mesh(disc, new THREE.MeshBasicMaterial({ color: '#5bd16b', transparent: true, opacity: 0.18, depthWrite: false }));
    this.rangeRing = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color: '#5bd16b', transparent: true, opacity: 0.85, depthWrite: false }));
    this.rangeDisc.renderOrder = 3; this.rangeRing.renderOrder = 4;
    this.selRingGeo = new THREE.RingGeometry(1.15, 1.45, 40); this.selRingGeo.rotateX(-Math.PI / 2);
    this.selMat = new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.9, depthWrite: false });
    this.selRings = [];
  }
  get g() { return app.game; }
  attach(scene) { scene.add(this.rangeDisc, this.rangeRing); this.rangeDisc.visible = this.rangeRing.visible = false; this.selRings = []; }
  groundAt(x, y, out) {
    this.ray.setFromCamera({ x: x / innerWidth * 2 - 1, y: -(y / innerHeight) * 2 + 1 }, camera);
    const hit = this.ray.ray.intersectPlane(this.plane, _gp);
    // when walking you can look at the sky; only spots on the field (and not too far away) count
    const ok = !!hit && (!app.walking || camera.position.distanceTo(_gp) < 140);
    if (out === this.ground) this.groundOk = ok;
    if (ok) out.copy(_gp);
    return ok ? out : null;
  }
  down(e) {
    app.audio.unlock();
    if (app.state !== 'game') return;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* not every pointer can be captured */ }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: app.cam.zoomT, wd: app.walker ? app.walker.camDist : 20, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, tx: app.cam.tx, tz: app.cam.tz };
      this.drag = null; return;
    }
    this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.groundAt(e.clientX, e.clientY, this.ground);
    this.drag = { b: e.button, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, tx: app.cam.tx, tz: app.cam.tz, touch: e.pointerType !== 'mouse' };
  }
  move(e) {
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pinch && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      if (app.walking) { app.walker.camDist = clamp(this.pinch.wd * this.pinch.d / d, 9, 46); return; }
      app.cam.setZoom(this.pinch.z * this.pinch.d / d, null);
      const k = app.cam.fitD * app.cam.zoom / 900;
      app.cam.tx = this.pinch.tx - ((a.x + b.x) / 2 - this.pinch.mx) * k; app.cam.tz = this.pinch.tz - ((a.y + b.y) / 2 - this.pinch.my) * k * 1.25;
      return;
    }
    this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.groundAt(e.clientX, e.clientY, this.ground);
    const d = this.drag;
    if (d) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > (d.touch ? 12 : 6)) d.moved = true;
      // walking: drag to look around (not while dragging a bean you are placing)
      if (app.walking) { if (d.moved && !(this.placing && d.touch && d.b === 0)) app.walker.orbit(e.clientX - d.lx, e.clientY - d.ly); d.lx = e.clientX; d.ly = e.clientY; return; }
      // drag to move the camera (not while placing with a finger, then the finger moves the bean)
      if (d.moved && !(this.placing && d.b === 0) && app.cam.zoomT < 0.999) { const k = app.cam.fitD * app.cam.zoom / 900; app.cam.tx = d.tx - (e.clientX - d.x) * k; app.cam.tz = d.tz - (e.clientY - d.y) * k * 1.25; }
    }
  }
  up(e) {
    const wasPinch = !!this.pinch;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    const d = this.drag; this.drag = null;
    if (wasPinch || !d || app.state !== 'game') return;
    if (d.b === 2) { if (!d.moved) this.cancel(); return; }
    if (d.b !== 0) return;
    // a finger that dragged a bean around places it where it was let go
    if (d.moved && !(this.placing && d.touch)) return;
    this.click(e);
  }
  pick(id, farm = false) {
    const g = this.g; if (!g || g.over) return;
    if (this.placing === id) { this.cancel(); return; }
    const def = farm ? FARM[id] : BEAN[id], price = g.price(def);
    if (g.money < price) { app.audio.sfx('error'); const el = $('beanList').querySelector(`[data-id="${id}"]`); if (el) { const p = el.getBoundingClientRect(); app.ui.float(p.left + 20, p.top + 10, 'Not enough money', true); } return; }
    this.setMulti(false); this.deselect(); this.clearGhost();
    this.placing = id; this.placingFarm = farm;
    if (farm) { this.ghost = new FarmModel(id); } else { this.ghost = new TowerBean(id, def.colors); this.ghost.root.scale.setScalar(1.75); this.ghost.root.rotation.y = Math.PI; }
    this.ghost.root.position.set(0, -50, 0);
    app.mapObj.scene.add(this.ghost.root);
    app.audio.sfx('select');
    app.ui.hint(matchMedia('(pointer: coarse)').matches ? 'Tap the grass to place it · tap the card again to cancel' : 'Click on the grass to place it · right-click to cancel');
  }
  clearGhost() { if (this.ghost) { this.ghost.root.removeFromParent(); this.ghost = null; } this.placing = null; app.ui.hint(null); }
  cancel() { if (this.placing) { this.clearGhost(); click(); } else if (this.multi) this.setMulti(false); else if (this.selected) this.deselect(); }
  deselect() { this.selected = null; app.ui.hideInfo(); }
  setMulti(on) {
    this.multi = on; this.picked = [];
    if (on) { this.clearGhost(); this.selected = null; app.ui.multiKey = ''; app.ui.hint('Tap beans to select them · then upgrade them all at once'); }
    else { app.ui.hideInfo(); app.ui.hint(null); }
  }
  towerAt(x, z) { let best = null, bd = 99; for (const t of this.g.towers) { const d = Math.hypot(t.x - x, t.z - z); if (d < (t.isFarm ? 2.4 : 1.7) && d < bd) { bd = d; best = t; } } return best; }
  click(e) {
    const g = this.g; if (!g) return;
    this.groundAt(e.clientX, e.clientY, this.ground);
    if (!this.groundOk) { if (!this.placing) this.deselect(); return; }
    const { x, z } = this.ground;
    if (this.placing) {
      const id = this.placing, farm = this.placingFarm, r = farm ? 1.75 : 1.1, def = farm ? FARM[id] : BEAN[id];
      if (!g.map.canPlace(x, z, g.towers, r) || g.money < g.price(def)) { app.audio.sfx('error'); return; }
      const t = act({ k: 'place', id, f: farm ? 1 : 0, x: +x.toFixed(3), z: +z.toFixed(3) });
      if (!t) return;
      if (!(e.shiftKey && g.money >= g.price(def) * (t === 'sent' ? 2 : 1))) this.clearGhost();
      return;
    }
    const t = this.towerAt(x, z);
    if (this.multi) { if (t) { const i = this.picked.indexOf(t); if (i >= 0) this.picked.splice(i, 1); else this.picked.push(t); app.audio.sfx('select'); } return; }
    if (t) { this.selected = t; app.ui.showInfo(t); app.audio.sfx('select'); } else this.deselect();
  }
  key(e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (app.state !== 'game') { if (e.code === 'Escape') { modal('settings', false); modal('howto', false); modal('partyModal', false); closeBook(); } return; }
    // walking around
    const w = app.walker, mv = MOVE_KEYS[e.code];
    if (app.walking && w) {
      if (mv) { w.keys[mv] = 1; e.preventDefault(); return; }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') { w.keys.run = 1; return; }
      if (e.code === 'Space') { e.preventDefault(); w.jump(); return; }
    }
    if (e.code === 'KeyG' && !e.repeat) { toggleWalk(); return; }
    if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); startWave(); return; }
    if (e.code === 'Escape') {
      if ($('settings').classList.contains('on') || $('howto').classList.contains('on')) { modal('settings', false); modal('howto', false); return; }
      if (this.placing || this.selected || this.multi) { this.cancel(); return; }
      togglePause(); return;
    }
    if (e.code === 'Space') { e.preventDefault(); startWave(); return; }
    if (e.code === 'KeyU' && this.selected) { if (this.selected.owner !== app.game.me) app.audio.sfx('error'); else act({ k: 'up', t: this.selected.id }); return; }
    const n = +e.key, cards = app.ui.cards;
    if (n >= 1 && n <= cards.length) { const c = cards[n - 1]; this.pick(c.dataset.id, c.dataset.farm === '1'); }
  }
  keyUp(e) {
    const w = app.walker; if (!w) return;
    const mv = MOVE_KEYS[e.code]; if (mv) w.keys[mv] = 0;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') w.keys.run = 0;
  }
  releaseKeys() { const w = app.walker; if (w) { w.keys = { f: 0, b: 0, l: 0, r: 0, run: 0 }; w.joy.x = w.joy.y = 0; } }
  update(dt) {
    const g = this.g; if (!g) return;
    const ghost = this.ghost, sel = this.selected && g.towers.includes(this.selected) ? this.selected : null;
    if (this.selected && !sel) this.deselect();
    let show = false, x = 0, z = 0, r = 1, ok = true;
    if (ghost) {
      x = this.ground.x; z = this.ground.z;
      const def = this.placingFarm ? FARM[this.placing] : BEAN[this.placing];
      ok = this.groundOk !== false && g.map.canPlace(x, z, g.towers, this.placingFarm ? 1.75 : 1.1) && g.money >= g.price(def);
      this.ghostOk = ok;
      ghost.root.position.set(x, g.map.heightAt(x, z) + 0.15 + Math.abs(Math.sin(app.animT * 5)) * 0.15, z);
      if (this.placingFarm) ghost.update(dt); else ghost.update(dt, { speed: 0 });
      r = this.placingFarm ? 2.1 : def.base.range; show = true;
      canvas.style.cursor = ok ? 'pointer' : 'not-allowed';
    }
    // the mouse over a bean shows how far it reaches (and makes it grow a little)
    const hov = !ghost && this.mouseHover && !this.drag ? this.towerAt(this.ground.x, this.ground.z) : null;
    g.hover = hov;
    if (!ghost) {
      canvas.style.cursor = hov ? 'pointer' : 'default';
      const rt = hov && !hov.isFarm ? hov : sel && !sel.isFarm ? sel : null;
      if (rt) { x = rt.x; z = rt.z; r = rt.stats.range > 100 ? 0 : rt.stats.range; show = r > 0; }
    }
    this.rangeDisc.visible = this.rangeRing.visible = show;
    if (show) {
      const col = ghost ? (ok ? '#5bd16b' : '#ff4d6d') : '#ffffff';
      this.rangeDisc.material.color.set(col); this.rangeRing.material.color.set(col);
      this.rangeDisc.material.opacity = ghost && !ok ? 0.3 : 0.16;
      // the circle grows out from the bean when you point at a new one
      if (this.rangeFor !== (ghost ? 'ghost' : x + ',' + z)) { this.rangeFor = ghost ? 'ghost' : x + ',' + z; this.rangeK = ghost ? 1 : 0; }
      this.rangeK = Math.min(1, (this.rangeK || 0) + dt * 6);
      const e = 1 - Math.pow(1 - this.rangeK, 3), pulse = 1 + Math.sin(app.animT * 4) * 0.008;
      this.rangeDisc.position.set(x, 0.12, z); this.rangeRing.position.set(x, 0.14, z);
      this.rangeDisc.scale.setScalar(r * e); this.rangeRing.scale.setScalar(r * e * pulse);
    } else this.rangeFor = null;
    // rings under every selected bean in Select mode (and under the one you clicked)
    const list = this.multi ? this.picked : sel ? [sel] : [];
    while (this.selRings.length < list.length) { const m = new THREE.Mesh(this.selRingGeo, this.selMat); m.renderOrder = 5; app.mapObj.scene.add(m); this.selRings.push(m); }
    this.selRings.forEach((m, i) => { const t = list[i]; m.visible = !!t; if (t) { m.position.set(t.x, t.y + 0.15, t.z); m.scale.setScalar((t.isFarm ? 1.7 : 1) * (1 + Math.sin(app.animT * 6) * 0.05)); } });
  }
}

// ---------- a game you left halfway: saved after every wave, CONTINUE in the lobby ----------
const RUN = 'btd-run';
function readRun() { try { const r = JSON.parse(localStorage.getItem(RUN)); return r && MAP[r.map] && DIFFS[r.diff] ? r : null; } catch (e) { return null; } }
function saveRun(g) {
  if (party.on) return;
  if (!g || g.over || g.restoring || g.waveActive || app.game !== g) return;
  if (!g.cleared && !g.towers.length) return;
  save(RUN, { map: g.map.def.id, diff: g.diff.id, rounds: app.sel.rounds, paid: g.paid || 0, at: Date.now(), ...g.runState() });
}
function clearRun() { try { localStorage.removeItem(RUN); } catch (e) {} }
function refreshContinue() {
  const r = readRun(), b = $('contBtn');
  if (!b) return;
  b.hidden = !r;
  if (r) $('contInfo').textContent = `${MAP[r.map].name} · ${DIFFS[r.diff].name} · Wave ${r.wave + 1}${DIFFS[r.diff].infinite ? '' : ' of ' + r.rounds}`;
}

// ---------- starting and ending a game ----------
function startGame(mapId = app.sel.map, diffId = app.sel.diff, rounds = app.sel.rounds, run = null, mp = null) {
  if (app.game && !app.game.over) awardCoins(app.game);
  if (!run && !mp) clearRun();
  // party state is reset right away: messages for the new game can arrive while the map is being built
  party.on = !!mp; party.host = !!(mp && mp.host); party.seed = mp ? mp.seed : 1; party.hostTick = mp && mp.snap ? mp.snap.k : 0;
  party.pending = []; party.outbox = []; party.seq = (mp && mp.seq) || 0; party.sums.clear(); party.sum = null;
  if (mp && mp.names) Object.assign(party.names, mp.names);
  app.walking = false; app.walkK = 0;
  modal('partyModal', false);
  app.sel.map = mapId; app.sel.diff = diffId; app.sel.rounds = rounds;
  screen('boot'); $('bootTxt').textContent = 'Building ' + MAP[mapId].name + '…'; $('bootBar').style.width = '70%';
  modal('victory', false); modal('gameover', false); modal('pauseMenu', false);
  app.state = 'loading';
  setTimeout(() => {
    endGame();
    const map = app.mapObj = buildMap(MAP[mapId], app.settings.quality);
    map.scene.environment = envTex; map.scene.environmentIntensity = 0.38;
    app.fx = new FX(map.scene); app.fx.quality = app.settings.quality === 'low' ? 0.6 : 1; app.fx.initLights(app.settings.quality === 'low' ? 0 : 3);
    app.fx.onBurst = () => app.audio.sfx('firework', 0.45);
    app.ambient = new Ambient(map.scene, MAP[mapId].theme);
    const view = new BalloonView(map.scene); view.camQ = camera.quaternion;
    const diff = DIFFS[diffId];
    const g = app.game = new Game({ map, diff, rounds, fx: app.fx, audio: app.audio, view, players: mp ? mp.players : [ME.id], me: ME.id, seed: mp ? mp.seed : (Math.random() * 1e9) >>> 0 });
    g.coinsGiven = false; g.paid = 0;
    if (run) { g.restore(run); g.paid = Math.min(run.paid | 0, g.cleared); }
    if (mp && mp.snap) g.load(mp.snap);
    app.walker = new Walker(map.scene, map, app.fx, app.audio);
    app.walker.onHardLand = () => { app.cam.shakeT = Math.max(app.cam.shakeT || 0, 0.12); };
    g.on((type, d) => onGameEvent(type, d));
    app.input.attach(map.scene);
    app.speed = 1; app.paused = false; app.acc = 0; app.animT = 0;
    app.cam.zoom = app.cam.zoomT = 1; app.cam.tx = app.cam.tz = app.cam.cx = app.cam.cz = 0; app.cam.fit();
    app.ui.start(g, app.save.team, app.save.farms);
    screen(null); app.state = 'game';
    app.audio.play(MUSIC.game);
    if (mp) app.ui.banner(mp.snap ? 'YOU JOINED!' : 'PARTY GAME!', `${MAP[mapId].name} · ${diff.name} · ${g.players.length} players · everyone has their own money`, 3.4);
    else if (run) app.ui.banner('WELCOME BACK!', `${MAP[mapId].name} · ${diff.name} · wave ${g.cleared + 1}${diff.infinite ? '' : ' of ' + rounds} · press START WAVE`, 3.2);
    else app.ui.banner(MAP[mapId].name.toUpperCase(), `${diff.name} · ${diff.infinite ? 'endless waves' : rounds + ' waves'} · place some beans, then press START WAVE`, 3.2);
  }, 40);
}
function endGame() {
  if (app.game) { app.game.dispose(); app.game = null; }
  if (app.ambient) { app.ambient.dispose(); app.ambient = null; }
  app.input.clearGhost(); app.input.deselect(); app.input.multi = false; app.input.picked = [];
  if (app.walker) { app.walker.dispose(); app.walker = null; }
  app.walking = false; app.walkK = 0; $('joy').classList.remove('on');
  for (const r of party.remotes.values()) r.dispose();
  party.remotes.clear();
  if (app.mapObj) { disposeScene(app.mapObj.scene); app.mapObj = null; }
  app.ui.stop();
}
// Bean Coins for the shop, given once per game
function awardCoins(g) {
  if (!g || g.coinsGiven) return 0;
  g.coinsGiven = true;
  // A continued game only pays for the waves cleared since you last left it.
  const coins = Math.max(0, coinsFor(g.cleared, g.diff, g.won, g.rounds) - coinsFor(g.paid || 0, g.diff, false, g.rounds));
  app.save.coins += coins;
  g.paid = g.cleared;
  if (!g.over) { const r = readRun(); if (r && r.map === g.map.def.id && r.diff === g.diff.id) { r.paid = g.paid; save(RUN, r); } }
  if (g.diff.infinite) app.save.best[g.map.def.id] = Math.max(app.save.best[g.map.def.id] || 0, g.wave);
  writeSave(); refreshCoins();
  return coins;
}
function onGameEvent(type, d) {
  const g = app.game;
  if (type === 'wave') {
    // a burst of light where the balloons come in
    const sp = g.map.path.at(5, new THREE.Vector3()); sp.y = g.map.heightAt(sp.x, sp.z);
    app.fx.column(sp, d.boss ? '#ff4d6d' : '#ffffff', 2.2, 10, 0.9); app.fx.ring(sp, d.boss ? '#ff4d6d' : '#ffd23f', 0.5, 7, 0.7); app.fx.burst(sp.clone().setY(sp.y + 1), '#ffffff', 24, 6, 0.2, 6, 0.6);
    app.ui.banner(d.final ? 'FINAL WAVE!' : 'WAVE ' + d.wave, d.boss ? (d.type === 'king' ? 'THE KING BALLOON IS COMING!' : 'BOSS WAVE: ' + BALLOONS[d.type].name.toUpperCase()) : d.count + ' balloons', 2.4, d.boss ? '#ff7aa2' : null);
    if (d.boss) app.audio.play(MUSIC.boss);
  } else if (type === 'money') {
    saveRun(g);
  } else if (type === 'land') {
    app.cam.shakeT = Math.max(app.cam.shakeT, 0.1);
  } else if (type === 'waveEnd') {
    saveRun(g);
    // fireworks over the field for every wave you beat (more for later waves and bosses)
    const cols = ['#ff4d6d', '#ffd23f', '#3a86ff', '#7bd389', '#ff6fd8', '#b15cff', '#7df9ff'];
    const n = Math.min(9, 3 + Math.floor(d.wave / 8) + (d.wave % 10 === 0 ? 3 : 0));
    for (let i = 0; i < n; i++) app.fx.later(0.15 + i * 0.32 + Math.random() * 0.15, () => {
      if (app.game !== g) return;
      app.fx.firework((Math.random() - 0.5) * 64, (Math.random() - 0.5) * 34, cols[(i + d.wave) % cols.length], 13 + Math.random() * 5);
      app.audio.sfx('launch', 0.5);
    });
    const p = $('sMoney').getBoundingClientRect(); app.ui.float(p.left + 30, p.bottom + 4, `+${icon('coin')}${d.bonus}`);
    if (app.audio.music && app.audio.music.params === MUSIC.boss) app.audio.play(MUSIC.game);
  } else if (type === 'boss') {
    app.cam.shakeT = 0.6;
  } else if (type === 'bossPop') {
    app.ui.banner('BOSS POPPED!', d.name, 1.8, '#ffd23f');
  } else if (type === 'farm') {
    const p = app.toScreen(d.t.x, 3, d.t.z); app.ui.float(p.x - 10, p.y, `+${icon('coin')}${d.amount}`);
  } else if (type === 'newLook') {
    const p = app.toScreen(d.x, 4, d.z); app.ui.float(p.x - 40, p.y, `${icon('max')}NEW LOOK!`);
  } else if (type === 'leak') {
    const h = $('hurtFx'); h.classList.remove('on'); void h.offsetWidth; h.classList.add('on');
    app.cam.shakeT = Math.max(app.cam.shakeT, 0.3);
    const ep = g.map.path.at(g.map.path.len - 5, new THREE.Vector3()); ep.y = g.map.heightAt(ep.x, ep.z) + 1.5;
    app.fx.burst(ep, '#ff4d6d', 18, 6, 0.22, 5, 0.5); app.fx.flash(ep, '#ff4d6d', 1.6, 0.25);
    const p = $('sLives').getBoundingClientRect(); app.ui.float(p.left + 30, p.bottom + 4, `-${icon('heart')}${d.lost}`, true);
  } else if (type === 'victory') {
    if (!party.on) clearRun();
    const pr = app.progress[g.map.def.id] = app.progress[g.map.def.id] || {}; pr[g.diff.id] = true; save('btd-progress', app.progress);
    for (const t of g.towers) app.fx.confetti(new THREE.Vector3(t.x, 2, t.z), 30, 3);
    const coins = awardCoins(g);
    setTimeout(() => { if (app.game !== g) return; app.ui.results(true, coins); modal('victory', true); app.audio.play(MUSIC.lobby); }, 1800);
  } else if (type === 'gameover') {
    if (!party.on) clearRun();
    const coins = awardCoins(g);
    setTimeout(() => { if (app.game !== g) return; app.ui.results(false, coins); modal('gameover', true); app.audio.stop(); }, 1400);
  }
}
function startWave() { const g = app.game; if (!g) return; if (g.waveActive || g.over) { app.audio.sfx('error'); return; } act({ k: 'wave' }); if (app.paused) setPause(false); }
function setPause(on) { if (party.on && !party.host) { net.send({ t: 'ctl', pz: on ? 1 : 0 }); return; } app.paused = on; }
// in a party the menu does not stop the game for everyone (the Pause button does)
function togglePause() { const on = !$('pauseMenu').classList.contains('on'); modal('pauseMenu', on); if (!party.on) setPause(on); click(); }
function restart() { if (!party.on) return startGame(); if (party.host) return startParty(); toast('Only the party leader can start a new game'); app.audio.sfx('error'); }
function leavePartyGame() { if (!party.on) return; net.send(party.host ? { t: 'gend' } : { t: 'quit' }); party.on = false; }
function goLobby() { leavePartyGame(); if (app.game) awardCoins(app.game); endGame(); modal('pauseMenu', false); modal('victory', false); modal('gameover', false); app.state = 'lobby'; screen('lobby'); refreshCoins(); app.audio.play(MUSIC.lobby); }
function goMaps() { app.state = 'maps'; screen('maps'); renderMapSelect(); app.audio.play(MUSIC.select); }
function goShop() { app.state = 'shop'; screen('shopScreen'); renderShop(); app.audio.play(MUSIC.select); }

// ---------- walking around on the map (GO IN / GO OUT) ----------
const coarse = () => matchMedia('(pointer: coarse)').matches;
function toggleWalk() {
  const g = app.game, w = app.walker; if (!g || !w || app.state !== 'game') return;
  app.input.releaseKeys();
  if (!app.walking) {
    app.walking = true; w.camPitch = 0.42; w.camDist = 19;
    w.enter(app.cam.cx, app.cam.cz, g.towers);
    app.audio.sfx('wave', 0.5);
    const msg = coarse() ? 'Walk with the stick · drag to look around · tap the grass to place beans' : 'WASD to walk · Shift to run · Space to jump · drag to look around · G to go out';
    if (!app.input.placing) { app.ui.hint(msg); setTimeout(() => { if (!app.input.placing && $('hint').textContent === msg) app.ui.hint(null); }, 5200); }
  } else {
    app.walking = false; w.leave();
    if (app.cam.zoomT < 0.999) { app.cam.tx = w.x; app.cam.tz = w.z; }
    app.audio.sfx('select');
  }
  $('joy').classList.toggle('on', app.walking && coarse());
}
function wireJoy() {
  const pad = $('joy'), knob = pad.querySelector('.knob'), R = 46; let id = null, cx = 0, cy = 0;
  const move = e => {
    if (e.pointerId !== id) return;
    let dx = e.clientX - cx, dy = e.clientY - cy; const l = Math.hypot(dx, dy); if (l > R) { dx *= R / l; dy *= R / l; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    if (app.walker) { app.walker.joy.x = dx / R; app.walker.joy.y = -dy / R; }
  };
  const end = e => { if (e.pointerId !== id) return; id = null; knob.style.transform = ''; if (app.walker) app.walker.joy.x = app.walker.joy.y = 0; };
  pad.addEventListener('pointerdown', e => { e.preventDefault(); id = e.pointerId; try { pad.setPointerCapture(id); } catch (err) {} const r = pad.querySelector('.ring').getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; move(e); });
  pad.addEventListener('pointermove', move); pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
  $('jumpBtn').addEventListener('pointerdown', e => { e.preventDefault(); if (app.walker) app.walker.jump(); });
}

// ---------- parties: play together with friends ----------
function toast(msg, bad) {
  const el = document.createElement('div'); el.className = 'toast' + (bad ? ' bad' : ''); el.textContent = msg; $('toasts').appendChild(el);
  setTimeout(() => el.classList.add('out'), 3200); setTimeout(() => el.remove(), 3700);
}
app.toast = toast;
function startParty() {
  if (!net.leader) return;
  const players = [ME.id, ...net.list().map(p => String(p.id)).filter(id => id !== ME.id)];
  const names = {}; for (const id of players) names[id] = nameOf(id);
  const msg = { t: 'start', map: app.sel.map, diff: app.sel.diff, rounds: app.sel.rounds, seed: (Math.random() * 1e9) >>> 0, players, names };
  net.send(msg); net.inMatch = true;
  startGame(msg.map, msg.diff, msg.rounds, null, { players, seed: msg.seed, host: true, names });
}
function startMsg(withSnap) {
  const g = app.game, names = {}; for (const id of g.players) names[id] = nameOf(id);
  return { t: 'start', map: g.map.def.id, diff: g.diff.id, rounds: app.sel.rounds, seed: party.seed, players: g.players.slice(), names, ...(withSnap ? { snap: g.snapshot(), seq: party.seq } : {}) };
}
// a party member runs the same game as the leader, never further than the leader has got
function stepMember(g, dt) {
  const ahead = party.hostTick - g.tick;
  if (ahead > 900) needSnap();
  if (!app.paused) app.acc += dt * app.speed;
  let n = Math.floor(app.acc * 60 + 1e-6);
  if (ahead - n > 6) n += Math.min(ahead - n - 3, 12);          // fell behind: catch up a little faster
  n = Math.max(0, Math.min(n, ahead, 30));
  app.acc = Math.max(0, app.acc - n / 60); if (n === 0) app.acc = Math.min(app.acc, 3 / 60);
  for (let i = 0; i < n; i++) { applyPending(g); g.update(1 / 60); checkSum(g); }
  applyPending(g);
}
function applyPending(g) {
  while (party.pending.length && party.pending[0][0] <= g.tick) {
    const [, seq, a] = party.pending.shift();
    if (seq <= party.seq) continue;
    party.seq = seq; applyAct(g, a);
  }
}
function checkSum(g) {
  const h = party.sums.get(g.tick); if (h === undefined) return;
  party.sums.delete(g.tick);
  if (h !== g.checksum()) { console.info('The party game drifted apart, getting it again from the leader'); needSnap(); }
}
function needSnap() { const now = performance.now(); if (now - party.needT < 3000) return; party.needT = now; net.send({ t: 'need' }); }
function loadSnap(s, seq) {
  const g = app.game; if (!g) return;
  app.input.deselect(); app.input.picked = [];
  g.load(s); party.seq = seq; party.pending = party.pending.filter(e => e[1] > seq); party.hostTick = Math.max(party.hostTick, s.k); party.sums.clear(); app.acc = 0;
}
function partyTick(g) {
  const now = performance.now();
  if (party.host && (now - party.lastBeat > 33 || party.outbox.length)) {
    net.send({ t: 'tk', k: g.tick, sp: app.speed, pz: app.paused ? 1 : 0, a: party.outbox, h: party.sum });
    party.outbox = []; party.sum = null; party.lastBeat = now;
  }
  if (now - party.lastAv > 90) { party.lastAv = now; net.send({ t: 'av', r: 1, id: ME.id, s: avatarState() }); }
}
// where you are and which bean you are about to place, for the other players' screens
function avatarState() {
  const w = app.walker, inp = app.input;
  const s = w && app.walking ? w.state() : [0, 0, 0, 0, 0, 0, 0, 0];
  if (inp.placing && inp.ghost) s.push(inp.placing, inp.placingFarm ? 1 : 0, +inp.ground.x.toFixed(2), +inp.ground.z.toFixed(2), inp.ghostOk ? 1 : 0);
  else s.push('', 0, 0, 0, 1);
  return s;
}
function onAvatar(id, s) {
  if (!party.on || !app.game || !app.mapObj || app.state !== 'game' || id === ME.id || !Array.isArray(s)) return;
  let r = party.remotes.get(id);
  if (!r) { r = new RemotePlayer(app.mapObj.scene, id, nameOf(id), colorOf(id)); party.remotes.set(id, r); }
  r.set(s);
}
function dropRemote(id) { const r = party.remotes.get(id); if (r) { r.dispose(); party.remotes.delete(id); } }
net.on('msg', (m, from) => {
  if (!m || typeof m !== 'object') return;
  const g = app.game, lead = net.leader;
  switch (m.t) {
    case 'start':
      if (lead) return;
      app.audio.unlock(); app.audio.sfx('wave');
      closeBook(); modal('settings', false); modal('howto', false);
      startGame(m.map, m.diff, m.rounds, null, { players: m.players, seed: m.seed, host: false, snap: m.snap, seq: m.seq, names: m.names });
      return;
    case 'tk':
      if (lead || !party.on) return;
      party.hostTick = Math.max(party.hostTick, m.k); app.speed = m.sp || 1; app.paused = !!m.pz;
      for (const e of m.a || []) if (e[1] > party.seq) party.pending.push(e);
      if (m.h) party.sums.set(m.h[0], m.h[1]);
      return;
    case 'snap': if (!lead && party.on && g && app.state === 'game') loadSnap(m.s, m.seq); return;
    case 'gend': if (!lead && party.on) { party.on = false; toast('The party leader went back to the lobby'); goLobby(); } return;
    case 'act': if (lead && party.on && g && m.a && typeof m.a === 'object') { m.a.p = String(from); hostApply(m.a); } return;
    case 'ctl': if (lead && party.on) { if (m.pz !== undefined) app.paused = !!m.pz; if ([1, 2, 3].includes(m.sp)) app.speed = m.sp; } return;
    case 'need': if (lead && party.on && g && app.state === 'game') net.sendTo(String(from), { t: 'snap', s: g.snapshot(), seq: party.seq }); return;
    case 'quit': if (lead && party.on && g) { hostApply({ k: 'leave', p: String(from) }); dropRemote(String(from)); toast(nameOf(String(from)) + ' went back to the lobby'); } return;
    case 'av': if (m.id) onAvatar(String(m.id), m.s); return;
  }
});
net.on('joined', p => {
  toast(p.name + ' joined the party!'); app.audio.sfx('unlock', 0.6);
  const g = app.game, id = String(p.id);
  // a friend who joins while we play jumps straight into the game, with some money to start with
  if (net.leader && party.on && g && app.state === 'game' && !g.over) {
    if (!g.players.includes(id)) hostApply({ k: 'join', p: id, m: Math.round(g.diff.money + g.cleared * 60) });
    party.names[id] = p.name;
    net.sendTo(id, startMsg(true));
  }
});
net.on('left', p => {
  const id = String(p.id);
  toast(p.name + ' left the party');
  if (net.leader && party.on && app.game) hostApply({ k: 'leave', p: id });
  dropRemote(id);
});
net.on('ended', why => { toast(why, true); if (party.on) { party.on = false; goLobby(); } renderParty(); });
net.on('roster', () => renderParty());
function renderParty() {
  const inP = net.inParty, list = inP ? net.list() : [];
  $('pMe').textContent = ME.name;
  $('partyOut').hidden = inP; $('partyIn').hidden = !inP;
  $('pCodeTxt').textContent = net.code || '';
  $('pList').innerHTML = list.map((m, i) => `<div class="pmem ${m.id === ME.id ? 'me' : ''}"><span class="dot" style="background:${PLAYER_COLORS[i % PLAYER_COLORS.length]}"></span><b>${esc(m.name)}</b>${m.leader ? `<span class="lead">${icon('crown')}LEADER</span>` : ''}${m.id === ME.id ? '<span class="you">YOU</span>' : ''}</div>`).join('');
  $('pHint').textContent = !inP ? '' : net.leader ? 'You are the leader: press PLAY, pick a map and every player joins your game.' : 'Waiting for the leader to start a game. You jump in automatically.';
  const chip = $('partyChip');
  chip.hidden = !inP; if (inP) chip.innerHTML = `${icon('party')}<span>PARTY ${net.code}<small>${list.length} / 4 players</small></span>`;
  $('partyBtn').classList.toggle('on', inP);
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function wireParty() {
  const open = () => { app.audio.unlock(); click(); $('pErr').textContent = ''; renderParty(); modal('partyModal', true); };
  $('partyBtn').onclick = open; $('partyChip').onclick = open;
  $('partyClose').onclick = () => { click(); modal('partyModal', false); };
  $('partyModal').addEventListener('pointerdown', e => { if (e.target.id === 'partyModal') modal('partyModal', false); });
  $('pCreate').onclick = async () => {
    $('pErr').textContent = 'Making a party…'; $('pCreate').disabled = true;
    try { const code = await net.create(); $('pErr').textContent = ''; toast('Party made! The code is ' + code); app.audio.sfx('unlock'); }
    catch (e) { $('pErr').textContent = e.message; }
    $('pCreate').disabled = false; renderParty();
  };
  $('pCode').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 5); });
  $('pCode').addEventListener('keydown', e => { if (e.key === 'Enter') $('pJoin').click(); });
  $('pJoin').onclick = async () => {
    const code = $('pCode').value.trim();
    $('pErr').textContent = 'Looking for the party…'; $('pJoin').disabled = true;
    try { await net.join(code); $('pErr').textContent = ''; toast('You are in the party!'); app.audio.sfx('unlock'); }
    catch (e) { $('pErr').textContent = e.message; }
    $('pJoin').disabled = false; renderParty();
  };
  $('pLeave').onclick = () => { click(); if (party.on) goLobby(); net.leave(); toast('You left the party'); renderParty(); };
  $('pCopy').onclick = () => {
    const code = net.code || '', done = () => { $('pCopy').lastChild.textContent = 'COPIED'; setTimeout(() => { $('pCopy').lastChild.textContent = 'COPY'; }, 1400); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(done, () => prompt('Copy the code:', code)); else prompt('Copy the code:', code);
  };
  addEventListener('beforeunload', () => net.leave(true));
  renderParty();
}

// ---------- settings ----------
function seg(id, value, fn) { const el = $(id); [...el.children].forEach(b => { b.classList.toggle('on', b.dataset.v === String(value)); b.onclick = () => { [...el.children].forEach(x => x.classList.toggle('on', x === b)); fn(b.dataset.v); click(); }; }); }
function openSettings() {
  const v = app.audio.vol;
  for (const [id, k] of [['setMaster', 'master'], ['setMusic', 'music'], ['setSfx', 'sfx']]) { $(id).value = v[k]; $(id).oninput = () => app.audio.setVolume(k, +$(id).value); }
  seg('setMute', v.mute ? 1 : 0, x => app.audio.setVolume('mute', x === '1'));
  seg('setQuality', app.settings.quality, q => { app.settings.quality = q; post.ok = true; save('btd-settings', app.settings); applyQuality(renderer, q); onResize(); if (app.fx) app.fx.quality = q === 'low' ? 0.6 : 1; for (const s of [app.mapObj && app.mapObj.scene, app.lobby && app.lobby.scene]) if (s) s.userData.sun.castShadow = q !== 'low'; });
  modal('settings', true);
}

// ---------- wiring ----------
function wire() {
  fillIcons();
  $('playBtn').onclick = () => { app.audio.unlock(); app.audio.sfx('select'); goMaps(); };
  $('shopBtn').onclick = () => { app.audio.unlock(); app.audio.sfx('select'); goShop(); };
  $('contBtn').onclick = () => { const r = readRun(); if (!r) return refreshContinue(); if (net.inParty) { toast('Leave the party to continue a game on your own'); app.audio.sfx('error'); return; } app.audio.unlock(); app.audio.sfx('wave'); startGame(r.map, r.diff, r.rounds, r); };
  $('shopBack').onclick = () => { click(); app.state = 'lobby'; screen('lobby'); refreshCoins(); app.audio.play(MUSIC.lobby); };
  $('lSettings').onclick = () => { app.audio.unlock(); click(); openSettings(); };
  $('lHow').onclick = () => { app.audio.unlock(); click(); modal('howto', true); };
  $('mapsBack').onclick = () => { click(); app.state = 'lobby'; screen('lobby'); app.audio.play(MUSIC.lobby); };
  $('goBtn').onclick = () => {
    if (net.inParty && !net.leader) { toast('The party leader picks the map and starts the game'); app.audio.sfx('error'); return; }
    app.audio.sfx('wave'); if (net.inParty) startParty(); else startGame();
  };
  $('setClose').onclick = () => { click(); modal('settings', false); };
  $('howClose').onclick = () => { click(); modal('howto', false); };
  $('bbClose').onclick = () => { click(); closeBook(); };
  $('beanBook').addEventListener('pointerdown', e => { if (e.target.id === 'beanBook') closeBook(); });
  for (const id of ['settings', 'howto']) $(id).addEventListener('pointerdown', e => { if (e.target.id === id) modal(id, false); });
  $('menuBtn').onclick = () => togglePause();
  $('pResume').onclick = () => togglePause();
  $('pRestart').onclick = () => { click(); modal('pauseMenu', false); restart(); };
  $('pSettings').onclick = () => { click(); openSettings(); };
  $('pHow').onclick = () => { click(); modal('howto', true); };
  $('pExit').onclick = () => { click(); goLobby(); };
  $('startBtn').onclick = () => startWave();
  $('pauseBtn').onclick = () => { setPause(!app.paused); click(); };
  $('speedBtn').onclick = () => { const sp = app.speed === 1 ? 2 : app.speed === 2 ? 3 : 1; if (party.on && !party.host) net.send({ t: 'ctl', sp }); else app.speed = sp; click(); };
  $('autoBtn').onclick = () => { const g = app.game; if (!g) return; act({ k: 'auto', v: !g.auto }); click(); };
  $('walkBtn').onclick = () => { toggleWalk(); };
  $('selectBtn').onclick = () => { app.input.setMulti(!app.input.multi); click(); };
  $('zoomIn').onclick = () => { if (app.walking) { app.walker.zoom(0.8); click(); return; } const c = new THREE.Vector3(); app.input.groundAt((innerWidth - app.cam.shopW()) / 2, innerHeight / 2, c); app.cam.setZoom(app.cam.zoomT * 0.75, c); click(); };
  $('zoomOut').onclick = () => { if (app.walking) { app.walker.zoom(1.25); click(); return; } app.cam.setZoom(app.cam.zoomT / 0.75, null); click(); };
  $('vicAgain').onclick = () => { click(); restart(); };
  $('goAgain').onclick = () => { click(); restart(); };
  $('vicLobby').onclick = () => { click(); goLobby(); };
  $('goLobby').onclick = () => { click(); goLobby(); };
  document.querySelectorAll('button').forEach(b => b.addEventListener('mouseenter', () => app.audio.sfx('hover')));
  document.addEventListener('pointerdown', () => app.audio.unlock());
  // no pinch-zooming the whole page on iPad, the game zooms its own camera
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('dblclick', e => e.preventDefault());
  wireParty(); wireJoy();
  $('balList').innerHTML = BALLOON_ORDER.map(k => `<div>${icon('b_' + k)}${BALLOONS[k].name.replace(' Balloon', '')}</div>`).join('');
}
function onResize() { renderer.setSize(innerWidth, innerHeight, false); sizePost(); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); if (app.state === 'game') app.cam.fit(); }
addEventListener('resize', onResize);

// ---------- loop ----------
let last = performance.now();
function step(dt) {
  if (app.state === 'game' && app.game) {
    const g = app.game;
    if (party.on && !party.host) stepMember(g, dt);
    else if (!app.paused) {
      app.acc += dt * app.speed; let n = 0;
      while (app.acc >= 1 / 60 && n < 12) { g.update(1 / 60); app.acc -= 1 / 60; n++; if (party.on && g.tick % 120 === 0) party.sum = [g.tick, g.checksum()]; }
      if (n >= 12) app.acc = 0;
    }
    const vdt = app.paused ? 0 : dt * app.speed;
    app.animT += vdt;
    for (const f of app.mapObj.anim) f(app.animT);
    g.visuals(vdt, app.animT);
    app.fx.update(vdt);
    if (app.ambient) app.ambient.update(vdt);
    if (app.walker) app.walker.update(dt, g.towers);
    for (const r of party.remotes.values()) r.update(dt, app.animT, app.mapObj);
    if (party.on) partyTick(g);
    app.cam.update(dt);
    if (app.cam.shakeT > 0) { app.cam.shakeT -= dt; const a = app.cam.shakeT * 1.2; camera.position.x += Math.sin(app.animT * 47) * a; camera.position.y += Math.sin(app.animT * 61) * a * 0.6; }
    app.input.update(dt);
    app.ui.update();
    draw(app.mapObj.scene, dt);
  } else if (app.lobby) {
    app.lobby.update(dt, innerWidth / innerHeight);
    renderer.render(app.lobby.scene, app.lobby.camera);
  }
  if (book.view && book.view.active) { book.view.frame(dt); const p = $('bbPop'); const n = book.view.popped; if (p.dataset.n !== String(n)) { p.dataset.n = n; p.textContent = n + ' popped'; } }
}
function frame(now) {
  requestAnimationFrame(frame);
  const raw = (now - last) / 1000, dt = Math.min(0.05, raw); last = now;
  step(dt);
  // the glow costs the most: if a game keeps running slowly with it on, switch it off
  if (app.state === 'game' && postOn() && document.visibilityState === 'visible' && raw < 0.25) {
    post.frames++; if (raw > 1 / 38) post.slow++;
    if (post.frames >= 180) { if (post.slow > 120) { post.ok = false; console.info('Glow switched off to keep the game smooth'); } post.frames = post.slow = 0; }
  }
}

// ---------- boot ----------
async function boot() {
  fillIcons();
  await document.fonts.ready.catch(() => {});
  onResize();
  app.input = new Input();
  const bar = (p, t) => { $('bootBar').style.width = p + '%'; $('bootTxt').textContent = t; return new Promise(r => setTimeout(r, 20)); };
  await bar(10, 'Dressing up the beans…');
  makePortraits();
  for (const [i, m] of MAPS.entries()) { await bar(20 + i * 12, 'Building ' + m.name + '…'); app.thumbs[m.id] = makeThumb(m); }
  await bar(94, 'Inflating balloons…');
  app.lobby = new Lobby();
  wire(); refreshCoins();
  await bar(100, 'Ready!');
  app.state = 'lobby'; screen('lobby');
  app.audio.play(MUSIC.lobby);
  requestAnimationFrame(frame);
  const jq = new URLSearchParams(location.search).get('join') || '';
  if (/^\d{5}$/.test(jq)) {
    history.replaceState(null, '', location.pathname);
    toast('Joining your friend\'s party…');
    net.join(jq).then(() => { toast('You are in the party!'); app.audio.sfx('unlock'); renderParty(); }, e => { toast(e.message, true); renderParty(); });
  }
}
boot().catch(e => { console.error(e); $('bootTxt').textContent = 'Something went wrong: ' + e.message; });

// test hooks
window.BTD = { app, step, startGame, goLobby, goMaps, goShop, startWave, awardCoins, readRun, post, openBook, showLevel, book, act, net, party, ME, toggleWalk, startParty, get game() { return app.game; } };
