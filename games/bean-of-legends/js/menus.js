// Menus: the 3D showroom stage (main menu, hero select, collection, victory dances), hero portraits,
// save data (Bean Coins, unlocked colour styles, settings), the cosmetic shop and the end screen.
import { THREE, canvasTex, damp, clamp } from './engine.js';
import { HEROES, HERO, ROLES, ITEM, TEAM_COLOR } from './data.js';
import { Bean } from './models.js';
import { FX } from './fx.js';
import { $, esc, abilityText, fmtT } from './hud.js';

// ---------- save data ----------
const KEY = 'bol-save';
export function loadSave() {
  let s = null; try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  s = Object.assign({ coins: 200, owned: {}, equip: {}, played: 0, wins: 0, settings: {} }, s || {});
  s.settings = Object.assign({ music: 0.5, sfx: 0.8, quality: 'medium', cast: 'indicator', cam: 'locked', edge: true, nums: true }, s.settings);
  return s;
}
export function writeSave(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
export function heroColors(save, id) { const h = HERO[id], k = save.equip[id] || 0; return k ? h.chromas[k - 1] : h.colors; }

// ---------- the stage ----------
export class Showroom {
  constructor(renderer) {
    this.r = renderer;
    const s = this.scene = new THREE.Scene();
    s.background = canvasTex(4, 512, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2a0f5c'); gr.addColorStop(0.55, '#8338ec'); gr.addColorStop(0.8, '#ff6fd8'); gr.addColorStop(1, '#ffb703'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    s.fog = new THREE.Fog('#5b2a9a', 30, 80);
    s.add(new THREE.HemisphereLight('#ffe9ff', '#3b1d7a', 1.4));
    const sun = new THREE.DirectionalLight('#fff2dd', 2.4); sun.position.set(6, 14, 10); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12 }); s.add(sun);
    const rim = new THREE.DirectionalLight('#7df9ff', 1.2); rim.position.set(-8, 6, -10); s.add(rim);
    // stage
    const stripes = canvasTex(256, 32, (g, w, h) => { for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#ff4d6d'; g.fillRect(i * w / 16, 0, w / 16, h); } });
    stripes.repeat.set(3, 1);
    const side = new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.5 }), top = new THREE.MeshStandardMaterial({ color: '#fff3e0', roughness: 0.6 });
    const stage = new THREE.Mesh(new THREE.CylinderGeometry(9, 9.4, 1.2, 64), [side, top, top]); stage.position.y = -0.6; stage.receiveShadow = true; s.add(stage);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(9.05, 0.18, 8, 80), new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#ffb703', emissiveIntensity: 0.8 })); ring.rotation.x = Math.PI / 2; s.add(ring);
    this.pedestal = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.5, 0.5, 40), new THREE.MeshStandardMaterial({ color: '#8338ec', emissive: '#3a0ca3', emissiveIntensity: 0.4, roughness: 0.3 }));
    this.pedestal.position.y = 0.25; this.pedestal.receiveShadow = true; s.add(this.pedestal);
    // decorations: rainbow arches, floating sweets, balloons
    ['#ff4d6d', '#ff8c42', '#ffd23f', '#7bd389', '#3a86ff', '#8338ec'].forEach((c, i) => { const a = new THREE.Mesh(new THREE.TorusGeometry(20 - i * 1.3, 0.6, 10, 64, Math.PI), new THREE.MeshStandardMaterial({ color: c, roughness: 0.4 })); a.position.set(0, -1, -18); s.add(a); });
    this.floaters = [];
    const shapes = [() => new THREE.TorusGeometry(0.7, 0.3, 10, 24), () => new THREE.OctahedronGeometry(0.8), () => new THREE.IcosahedronGeometry(0.7), () => new THREE.CapsuleGeometry(0.4, 0.7, 6, 12)];
    for (let i = 0; i < 18; i++) {
      const m = new THREE.Mesh(shapes[i % 4](), new THREE.MeshStandardMaterial({ color: ['#ff6fd8', '#ffd23f', '#7df9ff', '#7bd389', '#ff8c42'][i % 5], roughness: 0.3, emissive: '#222' }));
      const a = i / 18 * Math.PI * 2; m.position.set(Math.cos(a) * (13 + (i % 3) * 3), 3 + (i % 5) * 1.6, Math.sin(a) * (13 + (i % 3) * 3) - 4);
      m.userData.y = m.position.y; m.userData.k = i; s.add(m); this.floaters.push(m);
    }
    for (let i = 0; i < 8; i++) {
      const col = ['#ff4d6d', '#3a86ff', '#ffd23f', '#7bd389'][i % 4];
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.9, 18, 14), new THREE.MeshStandardMaterial({ color: col, roughness: 0.2 })); b.scale.y = 1.2;
      b.position.set((i - 3.5) * 4.2, 9 + (i % 3), -12 - (i % 2) * 3); b.userData.y = b.position.y; b.userData.k = i * 3; s.add(b); this.floaters.push(b);
    }
    this.fx = new FX(s);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
    this.beans = {};
    for (const h of HEROES) { const b = new Bean(h.id, h.colors); b.root.traverse(o => { if (o.isMesh) o.castShadow = true; }); b.root.visible = false; s.add(b.root); this.beans[h.id] = b; }
    this.mode = 'menu'; this.sel = null; this.yaw = 0.3; this.zoom = 13; this.t = 0; this.drag = null; this.confT = 0;
  }
  setColors(id, cols) { this.beans[id].setColors(cols[0], cols[1]); }
  showMenu(save) {
    this.mode = 'menu';
    const picks = HEROES.map(h => h.id).sort(() => Math.random() - 0.5).slice(0, 5);
    for (const id in this.beans) this.beans[id].root.visible = false;
    picks.forEach((id, i) => { const b = this.beans[id]; this.setColors(id, heroColors(save, id)); b.root.visible = true; const a = (i - 2) * 0.5; b.root.position.set(Math.sin(a) * 6, 0, Math.cos(a) * 6 - 4); b.root.rotation.y = a * 0.4; b.root.scale.setScalar(i === 2 ? 1.9 : 1.6); b.dance = i % 2 === 0; });
    this.pedestal.visible = false;
  }
  showHero(id, colors) {
    this.mode = 'select'; this.sel = id;
    for (const k in this.beans) this.beans[k].root.visible = false;
    const b = this.beans[id]; if (colors) this.setColors(id, colors);
    b.root.visible = true; b.root.position.set(0, 0.5, 0); b.root.rotation.y = 0; b.root.scale.setScalar(2.6); b.dance = false;
    this.pedestal.visible = true;
    b.cheer = 1;
  }
  showWinners(list) {
    this.mode = 'end';
    for (const k in this.beans) this.beans[k].root.visible = false;
    list.forEach((h, i) => { const b = this.beans[h.id]; this.setColors(h.id, h.colors); b.root.visible = true; const a = (i - (list.length - 1) / 2) * 0.5; b.root.position.set(Math.sin(a) * 5, 0, Math.cos(a) * 5 - 4); b.root.rotation.y = a * 0.5; b.root.scale.setScalar(1.7); b.dance = true; });
    this.pedestal.visible = false;
    this.fx.confetti(new THREE.Vector3(0, 6, 0), 200, 14);
  }
  update(dt, aspect) {
    this.t += dt;
    const c = this.camera; c.aspect = aspect; c.updateProjectionMatrix();
    if (this.mode === 'menu') { const a = Math.sin(this.t * 0.12) * 0.25; c.position.set(-5 + Math.sin(a) * 18, 5.5, Math.cos(a) * 18); c.lookAt(-5.5, 2, 0); }
    else if (this.mode === 'end') { c.position.set(Math.sin(this.t * 0.15) * 3, 2.2, 17); c.lookAt(0, -1.6, -2); this.confT -= dt; if (this.confT < 0) { this.confT = 1.4; this.fx.confetti(new THREE.Vector3((Math.random() - 0.5) * 10, 8, (Math.random() - 0.5) * 4), 60, 6); } }
    else {
      if (!this.drag) this.yaw += dt * 0.25;
      const d = this.zoom; c.position.set(Math.sin(this.yaw) * d, 3 + d * 0.1, Math.cos(this.yaw) * d); c.lookAt(0, 2.4, 0);
    }
    for (const f of this.floaters) { f.position.y = f.userData.y + Math.sin(this.t * 1.2 + f.userData.k) * 0.4; f.rotation.y += dt * 0.5; f.rotation.x += dt * 0.2; }
    for (const id in this.beans) {
      const b = this.beans[id]; if (!b.root.visible) continue;
      if (b.cheer > 0) b.cheer -= dt;
      b.update(dt, { speed: 0, dance: b.dance || b.cheer > 0.2, cast: b.cheer > 0 ? 1 - b.cheer : -1 });
    }
    this.fx.update(dt);
  }
  // portraits for cards and the HUD
  thumbnails() {
    const out = {}, size = 160, rt = new THREE.WebGLRenderTarget(size, size), buf = new Uint8Array(size * size * 4);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#ffffff', '#6b4fa0', 1.8)); const l = new THREE.DirectionalLight('#ffffff', 2); l.position.set(2, 3, 4); scene.add(l);
    for (const h of HEROES) {
      const b = new Bean(h.id, h.colors); scene.add(b.root);
      b.update(0.016, { speed: 0 });
      scene.background = new THREE.Color(ROLES[h.role].color).lerp(new THREE.Color('#1b1036'), 0.55);
      cam.position.set(0.9, 1.25, 3.1); cam.lookAt(0, 0.95, 0);
      this.r.setRenderTarget(rt); this.r.render(scene, cam); this.r.readRenderTargetPixels(rt, 0, 0, size, size, buf); this.r.setRenderTarget(null);
      const cv = document.createElement('canvas'); cv.width = cv.height = size; const g = cv.getContext('2d'), img = g.createImageData(size, size);
      for (let y = 0; y < size; y++) img.data.set(buf.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
      g.putImageData(img, 0, 0); out[h.id] = cv.toDataURL();
      scene.remove(b.root);
    }
    rt.dispose();
    return out;
  }
  bindDrag(el) {
    el.addEventListener('mousedown', e => { this.drag = { x: e.clientX, yaw: this.yaw }; el.style.cursor = 'grabbing'; });
    addEventListener('mousemove', e => { if (this.drag) this.yaw = this.drag.yaw - (e.clientX - this.drag.x) * 0.012; });
    addEventListener('mouseup', () => { this.drag = null; el.style.cursor = 'grab'; });
    el.addEventListener('wheel', e => { this.zoom = clamp(this.zoom + Math.sign(e.deltaY) * 0.8, 6, 18); e.preventDefault(); }, { passive: false });
  }
}

// ---------- hero select / collection ----------
export function renderHeroInfo(app, id, collection) {
  const h = HERO[id], role = ROLES[h.role], s = h.stats, save = app.save;
  const owned = [0, ...(save.owned[id] || [])], eq = app.pickChroma[id] ?? save.equip[id] ?? 0;
  const bar = (name, v, max, txt) => `<div class="statrow"><span>${name}</span><div class="sb"><i style="width:${clamp(v / max, 0.05, 1) * 100}%"></i></div><span>${txt}</span></div>`;
  $('selInfo').innerHTML = `
    <div style="opacity:.7;font-weight:900;letter-spacing:.12em">${esc(h.name.toUpperCase())}</div>
    <h2>${esc(h.title)}</h2>
    <div class="row" style="margin:8px 0"><span class="rolebadge" style="background:${role.color}">${role.icon} ${h.role.toUpperCase()}</span><span style="font-weight:900;opacity:.8">Difficulty</span><span class="dots">${[1, 2, 3].map(k => `<i class="${k <= h.difficulty ? 'on' : ''}"></i>`).join('')}</span><span style="opacity:.7;font-weight:800">${h.melee ? 'Melee' : 'Ranged'}</span></div>
    <div style="font-weight:700;opacity:.85;margin-bottom:10px">${esc(h.lore)} <i style="opacity:.75">${esc(role.desc)}</i></div>
    ${bar('Health', s.hp[0] + s.hp[1] * 17, 2500, Math.round(s.hp[0]))}
    ${bar('Attack', s.ad[0] + s.ad[1] * 17, 130, Math.round(s.ad[0]))}
    ${bar('Armor', s.armor[0], 40, Math.round(s.armor[0]))}
    ${bar('Attack speed', s.as[0], 0.72, s.as[0].toFixed(2))}
    ${bar('Range', s.range, 7.5, s.range)}
    ${bar('Speed', s.ms, 7.4, Math.round(s.ms * 50))}
    <h3 style="margin-top:14px;font-size:20px">ABILITIES</h3>
    ${h.abilities.map(ab => `<div class="abil"><div class="ai">${ab.icon}<b>${ab.key}</b></div><div><h4>${esc(ab.name)}</h4><p>${abilityText(ab, 1)}</p><div class="meta">Cooldown ${ab.cd.join('/')}s · Mana ${ab.cost[0]}${ab.range ? ' · Range ' + ab.range : ''}</div></div></div>`).join('')}
    <h3 style="margin-top:14px;font-size:20px">COSTUME COLOURS</h3>
    <div class="chromas">${[h.colors, ...h.chromas].map((c, k) => `<div class="chroma ${k === eq ? 'on' : ''} ${owned.includes(k) ? '' : 'locked'}" data-k="${k}" title="${owned.includes(k) ? 'Equip' : 'Unlock in the Bean Shop'}" style="background:linear-gradient(135deg, ${c[0]} 50%, ${c[1]} 50%)"></div>`).join('')}</div>
    ${collection ? '' : ''}`;
  $('selInfo').querySelectorAll('.chroma').forEach(el => el.addEventListener('click', () => {
    const k = +el.dataset.k;
    if (!owned.includes(k)) { app.audio.sfx('error'); return; }
    app.pickChroma[id] = k; save.equip[id] = k; writeSave(save);
    app.show.showHero(id, heroColors(save, id)); app.audio.sfx('select');
    renderHeroInfo(app, id, collection);
  }));
}
export function renderHeroGrid(app, onPick) {
  const g = $('heroGrid'); g.innerHTML = '';
  for (const h of HEROES) {
    const el = document.createElement('div'); el.className = 'hcard' + (h.id === app.selHero ? ' on' : ''); el.dataset.id = h.id;
    el.innerHTML = `<img src="${app.thumbs[h.id]}" alt=""><div class="rl" title="${h.role}">${ROLES[h.role].icon}</div><div class="nm">${esc(h.title.replace('THE ', ''))}</div>`;
    el.addEventListener('click', () => onPick(h.id));
    el.addEventListener('mouseenter', () => app.audio.sfx('hover'));
    g.appendChild(el);
  }
}

// ---------- cosmetic shop ----------
export function renderCosmeticShop(app) {
  const save = app.save, PRICE = 250;
  $('cCoins').textContent = '🪙 ' + save.coins;
  $('cGrid').innerHTML = HEROES.map(h => h.chromas.map((c, i) => {
    const k = i + 1, own = (save.owned[h.id] || []).includes(k), eq = (save.equip[h.id] || 0) === k;
    return `<div class="citem"><img src="${app.thumbs[h.id]}"><div style="flex:1"><div class="lilita" style="font-size:16px">${esc(h.title.replace('THE ', ''))}</div><div class="row" style="gap:6px;margin:4px 0"><span class="chroma" style="width:24px;height:24px;background:linear-gradient(135deg, ${c[0]} 50%, ${c[1]} 50%)"></span><span style="font-weight:800;opacity:.8">Style ${k}</span></div>
      ${own ? `<button class="btn ${eq ? 'ghost' : 'blue'} mini" data-eq="${h.id}:${k}">${eq ? 'EQUIPPED' : 'EQUIP'}</button>` : `<button class="btn mini" data-buy="${h.id}:${k}" ${save.coins < PRICE ? 'disabled' : ''}>🪙 ${PRICE}</button>`}</div></div>`;
  }).join('')).join('');
  $('cGrid').querySelectorAll('[data-buy]').forEach(b => b.addEventListener('click', () => {
    const [id, k] = b.dataset.buy.split(':'); if (save.coins < PRICE) return;
    save.coins -= PRICE; (save.owned[id] = save.owned[id] || []).push(+k); save.equip[id] = +k; writeSave(save);
    app.audio.sfx('buy'); renderCosmeticShop(app); app.refreshCoins();
  }));
  $('cGrid').querySelectorAll('[data-eq]').forEach(b => b.addEventListener('click', () => {
    const [id, k] = b.dataset.eq.split(':'); save.equip[id] = save.equip[id] === +k ? 0 : +k; writeSave(save); app.audio.sfx('select'); renderCosmeticShop(app);
  }));
}

// ---------- end screen ----------
export function renderEnd(app, m, coins) {
  const win = m.winner === m.pteam;
  $('endTitle').textContent = win ? 'VICTORY!' : 'DEFEAT';
  $('endTitle').style.color = win ? '#ffd23f' : '#ff9aac';
  $('endSub').innerHTML = `${win ? 'Your team destroyed the enemy Bean Core!' : m.surrendered ? 'Your team surrendered.' : 'Your Bean Core was destroyed.'} · Match time ${fmtT(m.time)} · 🪙 +${coins} Bean Coins`;
  const row = h => `<tr class="${h.isPlayer ? 'me' : ''}"><td style="font-size:20px">${h.def.abilities[3].icon}</td><td>${esc(h.def.title)}${h.isPlayer ? ' (you)' : ''}</td><td>${h.level}</td><td>${h.stats.kills}</td><td>${h.stats.deaths}</td><td>${h.stats.assists}</td><td>${Math.floor(h.stats.gold + 500)}</td><td>${Math.round(h.stats.heroDmg)}</td><td>${h.stats.cs}</td><td>${h.stats.towers}</td><td>${h.items.map(s => s ? ITEM[s.id].icon : '').join(' ')}</td></tr>`;
  const team = t => `<tr><th colspan="2" class="${t ? 'tr' : 'tb'}" style="font-size:15px;opacity:1">${t ? '🔴 RED' : '🔵 BLUE'} ${t === m.winner ? '🏆' : ''} · ${m.teams[t].kills} kills · ${m.teams[t].towers} towers</th><th>LVL</th><th>K</th><th>D</th><th>A</th><th>GOLD</th><th>HERO DMG</th><th>MINIONS</th><th>TOWERS</th><th>ITEMS</th></tr>` + m.heroes.filter(h => h.team === t).map(row).join('');
  $('endStats').innerHTML = `<table>${team(m.pteam)}<tr><td colspan="11" style="height:8px"></td></tr>${team(1 - m.pteam)}</table>`;
  app.show.showWinners(m.heroes.filter(h => h.team === m.winner).map(h => ({ id: h.heroId, colors: h.colors })));
  void TEAM_COLOR; void damp;
}
