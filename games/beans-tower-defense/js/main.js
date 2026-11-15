// Beans Tower Defense: boot, the dancing lobby, the Bean Shop, map/difficulty/rounds select, the camera,
// mouse + touch controls (iPad friendly) and the main loop.
import { THREE, createRenderer, applyQuality, makeWorldScene, clamp, damp, rng } from './engine.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { DIFFS, MAPS, MAP, BEANS, BEAN, FARMS, FARM, BALLOONS, BALLOON_ORDER, FIELD, STARTERS, TEAM_SIZE, ROUND_OPTIONS, coinsFor } from './data.js';
import { buildMap } from './map.js';
import { FX } from './fx.js';
import { Audio, MUSIC } from './audio.js';
import { Game } from './game.js';
import { BalloonView } from './balloons.js';
import { Bean, TowerBean, FarmModel, ACCESSORIES, setFace, dance, DANCES } from './bean.js';
import { icon, fillIcons } from './icons.js';
import { UI, $ } from './ui.js';

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
const canvas = $('gl');
const renderer = app.renderer = createRenderer(canvas, app.settings.quality);
const camera = app.camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 1, 700);
const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
app.ui = new UI(app);

// ---------- screens ----------
const SCREENS = ['boot', 'lobby', 'maps', 'shopScreen'];
function screen(id) { for (const s of SCREENS) $(s).classList.toggle('on', s === id); }
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
const KIND_NAME = { dart: 'Darts', hitscan: 'Long range shots', boom: 'Boomerang', bomb: 'Explosions', ice: 'Freezing', tack: 'Tack ring', glue: 'Slowing glue', laser: 'Laser beam', chain: 'Chain lightning', magic: 'Homing magic', cannon: 'Heavy cannon' };
function renderShop() {
  const sv = app.save;
  refreshCoins();
  $('teamCount').textContent = `${sv.team.length} / ${TEAM_SIZE}`;
  $('teamBar').innerHTML = Array.from({ length: TEAM_SIZE }, (_, i) => { const id = sv.team[i]; return id ? `<div class="slot full" data-id="${id}" style="--c1:${BEAN[id].badge[0]};--c2:${BEAN[id].badge[1]}" title="Remove from team"><img src="${app.portraits[id]}" alt=""><span>${BEAN[id].name.replace(' Bean', '')}</span><b>${icon('close')}</b></div>` : `<div class="slot"><span>Empty</span></div>`; }).join('');
  const beanCard = b => {
    const own = sv.owned.includes(b.id), inTeam = sv.team.includes(b.id), can = sv.coins >= b.unlock;
    const btn = own ? (inTeam ? `<button class="btn ghost on" data-team="${b.id}">${icon('check')}IN TEAM</button>` : `<button class="btn blue" data-team="${b.id}" ${sv.team.length >= TEAM_SIZE ? 'disabled' : ''}>${icon('team')}ADD TO TEAM</button>`)
      : `<button class="btn ${can ? 'green' : ''}" data-buy="${b.id}" ${can ? '' : 'disabled'}>${icon('beancoin')}${fmt(b.unlock)}</button>`;
    return `<div class="scard panel ${own ? '' : 'locked'}" style="--c1:${b.badge[0]};--c2:${b.badge[1]}"><img src="${app.portraits[b.id]}" alt="">${own ? '' : `<span class="lockic">${icon('lock')}</span>`}<h3>${b.name}</h3><div class="kind">${KIND_NAME[b.kind]}</div><p>${b.desc}</p>${btn}</div>`;
  };
  $('shopBeans').innerHTML = BEANS.map(beanCard).join('');
  $('shopFarms').innerHTML = FARMS.map(f => {
    const own = sv.farms.includes(f.id), can = sv.coins >= f.unlock;
    return `<div class="scard panel ${own ? '' : 'locked'}" style="--c1:${f.badge[0]};--c2:${f.badge[1]}"><img src="${app.portraits[f.id]}" alt="">${own ? '' : `<span class="lockic">${icon('lock')}</span>`}<h3>${f.name}</h3><div class="kind">${f.income} money per wave</div><p>${f.desc}</p>${own ? `<button class="btn ghost on" disabled>${icon('check')}OWNED</button>` : `<button class="btn ${can ? 'green' : ''}" data-buyfarm="${f.id}" ${can ? '' : 'disabled'}>${icon('beancoin')}${fmt(f.unlock)}</button>`}</div>`;
  }).join('');
  const wire = (sel, fn) => document.querySelectorAll(sel).forEach(el => el.addEventListener('click', () => fn(el)));
  wire('#teamBar .slot.full', el => { if (sv.team.length <= 1) { app.audio.sfx('error'); return; } sv.team = sv.team.filter(x => x !== el.dataset.id); writeSave(); click(); renderShop(); });
  wire('[data-team]', el => { const id = el.dataset.team; if (sv.team.includes(id)) { if (sv.team.length <= 1) { app.audio.sfx('error'); return; } sv.team = sv.team.filter(x => x !== id); } else if (sv.team.length < TEAM_SIZE) sv.team.push(id); else { app.audio.sfx('error'); return; } writeSave(); app.audio.sfx('select'); renderShop(); });
  wire('[data-buy]', el => { const b = BEAN[el.dataset.buy]; if (sv.coins < b.unlock) { app.audio.sfx('error'); return; } sv.coins -= b.unlock; sv.owned.push(b.id); if (sv.team.length < TEAM_SIZE) sv.team.push(b.id); writeSave(); app.audio.sfx('unlock'); renderShop(); });
  wire('[data-buyfarm]', el => { const f = FARM[el.dataset.buyfarm]; if (sv.coins < f.unlock) { app.audio.sfx('error'); return; } sv.coins -= f.unlock; sv.farms.push(f.id); writeSave(); app.audio.sfx('unlock'); renderShop(); });
}

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
    this.place(this.fitD * this.zoom, this.cx, this.cz);
    if (app.mapObj) app.mapObj.scene.userData.setFocus(new THREE.Vector3(this.cx, 0, this.cz));
  }
  setZoom(z, gp) {
    const old = this.zoomT;
    this.zoomT = clamp(z, 0.32, 1);
    if (gp && this.zoomT < old) { const k = 1 - this.zoomT / old; this.tx += (gp.x - this.tx) * k; this.tz += (gp.z - this.tz) * k; }
  }
  wheel(dy, gp) { this.setZoom(this.zoomT * Math.exp(dy * 0.0011), gp); }
}
app.cam = new Cam();
app.toScreen = (x, y, z) => { const v = new THREE.Vector3(x, y, z).project(camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }; };

// ---------- mouse, touch and keys ----------
class Input {
  constructor() {
    this.mouse = { x: 0, y: 0 }; this.ground = new THREE.Vector3(); this.ray = new THREE.Raycaster(); this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.placing = null; this.placingFarm = false; this.ghost = null; this.selected = null; this.multi = false; this.picked = [];
    this.pointers = new Map(); this.drag = null; this.pinch = null;
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('pointerdown', e => this.down(e));
    canvas.addEventListener('pointermove', e => this.move(e));
    canvas.addEventListener('pointerup', e => this.up(e));
    canvas.addEventListener('pointercancel', e => { this.pointers.delete(e.pointerId); this.pinch = null; this.drag = null; });
    canvas.addEventListener('wheel', e => { if (app.state !== 'game') return; e.preventDefault(); app.cam.wheel(e.deltaY, this.ground); }, { passive: false });
    addEventListener('keydown', e => this.key(e));
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
  groundAt(x, y, out) { this.ray.setFromCamera({ x: x / innerWidth * 2 - 1, y: -(y / innerHeight) * 2 + 1 }, camera); return this.ray.ray.intersectPlane(this.plane, out); }
  down(e) {
    app.audio.unlock();
    if (app.state !== 'game') return;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* not every pointer can be captured */ }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, z: app.cam.zoomT, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, tx: app.cam.tx, tz: app.cam.tz };
      this.drag = null; return;
    }
    this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.groundAt(e.clientX, e.clientY, this.ground);
    this.drag = { b: e.button, x: e.clientX, y: e.clientY, moved: false, tx: app.cam.tx, tz: app.cam.tz, touch: e.pointerType !== 'mouse' };
  }
  move(e) {
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pinch && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      app.cam.setZoom(this.pinch.z * this.pinch.d / d, null);
      const k = app.cam.fitD * app.cam.zoom / 900;
      app.cam.tx = this.pinch.tx - ((a.x + b.x) / 2 - this.pinch.mx) * k; app.cam.tz = this.pinch.tz - ((a.y + b.y) / 2 - this.pinch.my) * k * 1.25;
      return;
    }
    this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.groundAt(e.clientX, e.clientY, this.ground);
    const d = this.drag;
    if (d) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > (d.touch ? 12 : 6)) d.moved = true;
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
    const { x, z } = this.ground;
    if (this.placing) {
      const id = this.placing, farm = this.placingFarm, r = farm ? 1.75 : 1.1;
      if (!g.map.canPlace(x, z, g.towers, r)) { app.audio.sfx('error'); return; }
      const t = g.place(id, x, z, farm);
      if (!t) { app.audio.sfx('error'); return; }
      const p = app.toScreen(x, 2.5, z); app.ui.float(p.x, p.y, `-${icon('coin')}${fmt(t.spent)}`, true);
      if (!(e.shiftKey && g.money >= g.price(farm ? FARM[id] : BEAN[id]))) this.clearGhost();
      return;
    }
    const t = this.towerAt(x, z);
    if (this.multi) { if (t) { const i = this.picked.indexOf(t); if (i >= 0) this.picked.splice(i, 1); else this.picked.push(t); app.audio.sfx('select'); } return; }
    if (t) { this.selected = t; app.ui.showInfo(t); app.audio.sfx('select'); } else this.deselect();
  }
  key(e) {
    if (app.state !== 'game') { if (e.code === 'Escape') { modal('settings', false); modal('howto', false); } return; }
    if (e.code === 'Escape') {
      if ($('settings').classList.contains('on') || $('howto').classList.contains('on')) { modal('settings', false); modal('howto', false); return; }
      if (this.placing || this.selected || this.multi) { this.cancel(); return; }
      togglePause(); return;
    }
    if (e.code === 'Space') { e.preventDefault(); startWave(); return; }
    if (e.code === 'KeyU' && this.selected) { if (!this.g.upgrade(this.selected)) app.audio.sfx('error'); return; }
    const n = +e.key, cards = app.ui.cards;
    if (n >= 1 && n <= cards.length) { const c = cards[n - 1]; this.pick(c.dataset.id, c.dataset.farm === '1'); }
  }
  update(dt) {
    const g = this.g; if (!g) return;
    const ghost = this.ghost, sel = this.selected && g.towers.includes(this.selected) ? this.selected : null;
    if (this.selected && !sel) this.deselect();
    let show = false, x = 0, z = 0, r = 1, ok = true;
    if (ghost) {
      x = this.ground.x; z = this.ground.z;
      const def = this.placingFarm ? FARM[this.placing] : BEAN[this.placing];
      ok = g.map.canPlace(x, z, g.towers, this.placingFarm ? 1.75 : 1.1) && g.money >= g.price(def);
      ghost.root.position.set(x, g.map.heightAt(x, z) + 0.15 + Math.abs(Math.sin(app.animT * 5)) * 0.15, z);
      if (this.placingFarm) ghost.update(dt); else ghost.update(dt, { speed: 0 });
      r = this.placingFarm ? 2.1 : def.base.range; show = true;
      canvas.style.cursor = ok ? 'pointer' : 'not-allowed';
    } else if (sel && !sel.isFarm) { x = sel.x; z = sel.z; r = sel.stats.range > 100 ? 0 : sel.stats.range; show = r > 0; }
    else canvas.style.cursor = this.towerAt(this.ground.x, this.ground.z) ? 'pointer' : 'default';
    this.rangeDisc.visible = this.rangeRing.visible = show;
    if (show) {
      const col = ghost ? (ok ? '#5bd16b' : '#ff4d6d') : '#ffffff';
      this.rangeDisc.material.color.set(col); this.rangeRing.material.color.set(col);
      this.rangeDisc.material.opacity = ghost && !ok ? 0.3 : 0.16;
      this.rangeDisc.position.set(x, 0.12, z); this.rangeRing.position.set(x, 0.14, z);
      this.rangeDisc.scale.setScalar(r); this.rangeRing.scale.setScalar(r);
    }
    // rings under every selected bean in Select mode (and under the one you clicked)
    const list = this.multi ? this.picked : sel ? [sel] : [];
    while (this.selRings.length < list.length) { const m = new THREE.Mesh(this.selRingGeo, this.selMat); m.renderOrder = 5; app.mapObj.scene.add(m); this.selRings.push(m); }
    this.selRings.forEach((m, i) => { const t = list[i]; m.visible = !!t; if (t) { m.position.set(t.x, t.y + 0.15, t.z); m.scale.setScalar((t.isFarm ? 1.7 : 1) * (1 + Math.sin(app.animT * 6) * 0.05)); } });
  }
}

// ---------- starting and ending a game ----------
function startGame(mapId = app.sel.map, diffId = app.sel.diff, rounds = app.sel.rounds) {
  if (app.game && !app.game.over) awardCoins(app.game);
  app.sel.map = mapId; app.sel.diff = diffId; app.sel.rounds = rounds;
  screen('boot'); $('bootTxt').textContent = 'Building ' + MAP[mapId].name + '…'; $('bootBar').style.width = '70%';
  modal('victory', false); modal('gameover', false); modal('pauseMenu', false);
  app.state = 'loading';
  setTimeout(() => {
    endGame();
    const map = app.mapObj = buildMap(MAP[mapId], app.settings.quality);
    map.scene.environment = envTex; map.scene.environmentIntensity = 0.38;
    app.fx = new FX(map.scene); app.fx.quality = app.settings.quality === 'low' ? 0.6 : 1; app.fx.initLights(app.settings.quality === 'low' ? 0 : 3);
    const view = new BalloonView(map.scene); view.camQ = camera.quaternion;
    const diff = DIFFS[diffId];
    const g = app.game = new Game({ map, diff, rounds, fx: app.fx, audio: app.audio, view });
    g.coinsGiven = false;
    g.on((type, d) => onGameEvent(type, d));
    app.input.attach(map.scene);
    app.speed = 1; app.paused = false; app.acc = 0; app.animT = 0;
    app.cam.zoom = app.cam.zoomT = 1; app.cam.tx = app.cam.tz = app.cam.cx = app.cam.cz = 0; app.cam.fit();
    app.ui.start(g, app.save.team, app.save.farms);
    screen(null); app.state = 'game';
    app.audio.play(MUSIC.game);
    app.ui.banner(MAP[mapId].name.toUpperCase(), `${diff.name} · ${diff.infinite ? 'endless waves' : rounds + ' waves'} · place some beans, then press START WAVE`, 3.2);
  }, 40);
}
function endGame() {
  if (app.game) { app.game.dispose(); app.game = null; }
  app.input.clearGhost(); app.input.deselect(); app.input.multi = false; app.input.picked = [];
  if (app.mapObj) { disposeScene(app.mapObj.scene); app.mapObj = null; }
  app.ui.stop();
}
// Bean Coins for the shop, given once per game
function awardCoins(g) {
  if (!g || g.coinsGiven) return 0;
  g.coinsGiven = true;
  const coins = coinsFor(g.cleared, g.diff, g.won, g.rounds);
  app.save.coins += coins;
  if (g.diff.infinite) app.save.best[g.map.def.id] = Math.max(app.save.best[g.map.def.id] || 0, g.wave);
  writeSave(); refreshCoins();
  return coins;
}
function onGameEvent(type, d) {
  const g = app.game;
  if (type === 'wave') {
    app.ui.banner(d.final ? 'FINAL WAVE!' : 'WAVE ' + d.wave, d.boss ? (d.type === 'king' ? 'THE KING BALLOON IS COMING!' : 'BOSS WAVE: ' + BALLOONS[d.type].name.toUpperCase()) : d.count + ' balloons', 2.4, d.boss ? '#ff7aa2' : null);
    if (d.boss) app.audio.play(MUSIC.boss);
  } else if (type === 'waveEnd') {
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
    const p = $('sLives').getBoundingClientRect(); app.ui.float(p.left + 30, p.bottom + 4, `-${icon('heart')}${d.lost}`, true);
  } else if (type === 'victory') {
    const pr = app.progress[g.map.def.id] = app.progress[g.map.def.id] || {}; pr[g.diff.id] = true; save('btd-progress', app.progress);
    for (const t of g.towers) app.fx.confetti(new THREE.Vector3(t.x, 2, t.z), 30, 3);
    const coins = awardCoins(g);
    setTimeout(() => { if (app.game !== g) return; app.ui.results(true, coins); modal('victory', true); app.audio.play(MUSIC.lobby); }, 1800);
  } else if (type === 'gameover') {
    const coins = awardCoins(g);
    setTimeout(() => { if (app.game !== g) return; app.ui.results(false, coins); modal('gameover', true); app.audio.stop(); }, 1400);
  }
}
function startWave() { const g = app.game; if (!g) return; if (g.startWave()) { if (app.paused) setPause(false); } else app.audio.sfx('error'); }
function setPause(on) { app.paused = on; }
function togglePause() { const on = !$('pauseMenu').classList.contains('on'); modal('pauseMenu', on); setPause(on); click(); }
function goLobby() { if (app.game) awardCoins(app.game); endGame(); modal('pauseMenu', false); modal('victory', false); modal('gameover', false); app.state = 'lobby'; screen('lobby'); refreshCoins(); app.audio.play(MUSIC.lobby); }
function goMaps() { app.state = 'maps'; screen('maps'); renderMapSelect(); app.audio.play(MUSIC.select); }
function goShop() { app.state = 'shop'; screen('shopScreen'); renderShop(); app.audio.play(MUSIC.select); }

// ---------- settings ----------
function seg(id, value, fn) { const el = $(id); [...el.children].forEach(b => { b.classList.toggle('on', b.dataset.v === String(value)); b.onclick = () => { [...el.children].forEach(x => x.classList.toggle('on', x === b)); fn(b.dataset.v); click(); }; }); }
function openSettings() {
  const v = app.audio.vol;
  for (const [id, k] of [['setMaster', 'master'], ['setMusic', 'music'], ['setSfx', 'sfx']]) { $(id).value = v[k]; $(id).oninput = () => app.audio.setVolume(k, +$(id).value); }
  seg('setMute', v.mute ? 1 : 0, x => app.audio.setVolume('mute', x === '1'));
  seg('setQuality', app.settings.quality, q => { app.settings.quality = q; save('btd-settings', app.settings); applyQuality(renderer, q); onResize(); if (app.fx) app.fx.quality = q === 'low' ? 0.6 : 1; for (const s of [app.mapObj && app.mapObj.scene, app.lobby && app.lobby.scene]) if (s) s.userData.sun.castShadow = q !== 'low'; });
  modal('settings', true);
}

// ---------- wiring ----------
function wire() {
  fillIcons();
  $('playBtn').onclick = () => { app.audio.unlock(); app.audio.sfx('select'); goMaps(); };
  $('shopBtn').onclick = () => { app.audio.unlock(); app.audio.sfx('select'); goShop(); };
  $('shopBack').onclick = () => { click(); app.state = 'lobby'; screen('lobby'); refreshCoins(); app.audio.play(MUSIC.lobby); };
  $('lSettings').onclick = () => { app.audio.unlock(); click(); openSettings(); };
  $('lHow').onclick = () => { app.audio.unlock(); click(); modal('howto', true); };
  $('mapsBack').onclick = () => { click(); app.state = 'lobby'; screen('lobby'); app.audio.play(MUSIC.lobby); };
  $('goBtn').onclick = () => { app.audio.sfx('wave'); startGame(); };
  $('setClose').onclick = () => { click(); modal('settings', false); };
  $('howClose').onclick = () => { click(); modal('howto', false); };
  for (const id of ['settings', 'howto']) $(id).addEventListener('pointerdown', e => { if (e.target.id === id) modal(id, false); });
  $('menuBtn').onclick = () => togglePause();
  $('pResume').onclick = () => togglePause();
  $('pRestart').onclick = () => { click(); startGame(); };
  $('pSettings').onclick = () => { click(); openSettings(); };
  $('pHow').onclick = () => { click(); modal('howto', true); };
  $('pExit').onclick = () => { click(); goLobby(); };
  $('startBtn').onclick = () => startWave();
  $('pauseBtn').onclick = () => { setPause(!app.paused); click(); };
  $('speedBtn').onclick = () => { app.speed = app.speed === 1 ? 2 : app.speed === 2 ? 3 : 1; click(); };
  $('autoBtn').onclick = () => { const g = app.game; if (!g) return; g.auto = !g.auto; click(); if (g.auto && !g.waveActive && g.wave > 0 && !g.over) g.autoT = 0.6; };
  $('selectBtn').onclick = () => { app.input.setMulti(!app.input.multi); click(); };
  $('zoomIn').onclick = () => { const c = new THREE.Vector3(); app.input.groundAt((innerWidth - app.cam.shopW()) / 2, innerHeight / 2, c); app.cam.setZoom(app.cam.zoomT * 0.75, c); click(); };
  $('zoomOut').onclick = () => { app.cam.setZoom(app.cam.zoomT / 0.75, null); click(); };
  $('vicAgain').onclick = () => { click(); startGame(); };
  $('goAgain').onclick = () => { click(); startGame(); };
  $('vicLobby').onclick = () => { click(); goLobby(); };
  $('goLobby').onclick = () => { click(); goLobby(); };
  document.querySelectorAll('button').forEach(b => b.addEventListener('mouseenter', () => app.audio.sfx('hover')));
  document.addEventListener('pointerdown', () => app.audio.unlock());
  // no pinch-zooming the whole page on iPad, the game zooms its own camera
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('dblclick', e => e.preventDefault());
  $('balList').innerHTML = BALLOON_ORDER.map(k => `<div>${icon('b_' + k)}${BALLOONS[k].name.replace(' Balloon', '')}</div>`).join('');
}
function onResize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); if (app.state === 'game') app.cam.fit(); }
addEventListener('resize', onResize);

// ---------- loop ----------
let last = performance.now();
function step(dt) {
  if (app.state === 'game' && app.game) {
    const g = app.game;
    if (!app.paused) { app.acc += dt * app.speed; let n = 0; while (app.acc >= 1 / 60 && n < 12) { g.update(1 / 60); app.acc -= 1 / 60; n++; } if (n >= 12) app.acc = 0; }
    const vdt = app.paused ? 0 : dt * app.speed;
    app.animT += vdt;
    for (const f of app.mapObj.anim) f(app.animT);
    g.visuals(vdt, app.animT);
    app.fx.update(vdt);
    app.cam.update(dt);
    if (app.cam.shakeT > 0) { app.cam.shakeT -= dt; const a = app.cam.shakeT * 1.2; camera.position.x += Math.sin(app.animT * 47) * a; camera.position.y += Math.sin(app.animT * 61) * a * 0.6; }
    app.input.update(dt);
    app.ui.update();
    renderer.render(app.mapObj.scene, camera);
  } else if (app.lobby) {
    app.lobby.update(dt, innerWidth / innerHeight);
    renderer.render(app.lobby.scene, app.lobby.camera);
  }
}
function frame(now) { requestAnimationFrame(frame); const dt = Math.min(0.05, (now - last) / 1000); last = now; step(dt); }

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
}
boot().catch(e => { console.error(e); $('bootTxt').textContent = 'Something went wrong: ' + e.message; });

// test hooks
window.BTD = { app, step, startGame, goLobby, goMaps, goShop, startWave, awardCoins, get game() { return app.game; } };
