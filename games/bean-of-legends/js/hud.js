// In-match interface: overlay (health bars, levels, names, damage numbers), bottom HUD, top bar,
// minimap, kill feed, announcements, toasts, the item shop and the scoreboard.
import { THREE, clamp } from './engine.js';
import { ITEMS, ITEM, SHOP_CATS, statText, HERO, ROLES, TEAM_COLOR, BUFFS, DRAGON_KINDS, RULES } from './data.js';
import { HALF, FOUNTAIN } from './map.js';

export const $ = id => document.getElementById(id);
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtT = s => { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const RATIO = (ab) => [ab.ad ? `<span style="color:#ffb46b">(+${Math.round(ab.ad * 100)}% AD)</span>` : '', ab.ap ? `<span style="color:#b98cff">(+${Math.round(ab.ap * 100)}% AP)</span>` : ''].join(' ');
// fill {dmg} {shield} {heal} with "70/110/150" and highlight the current rank
export function abilityText(ab, rank) {
  const list = arr => arr.map((v, i) => i === rank - 1 ? `<b style="color:#fff">${v}</b>` : `<span style="opacity:.75">${v}</span>`).join('/');
  return ab.text.replace('{dmg}', ab.dmg ? list(ab.dmg) + ' ' + RATIO(ab) : '').replace('{shield}', ab.shield ? list(ab.shield) + (ab.ap ? ' ' + RATIO(ab) : '') : '').replace('{heal}', ab.heal ? list(ab.heal) + ' ' + RATIO(ab) : '');
}
const BUFF_ICON = { brainfreeze: '🧊', hotsauce: '🌶️', megabean: '👑', shieldup: '🛡️', royal: '👑', giant: '🦕', frenzy: '🍽️', coo: '🐦', smoke: '💨', vanish: '🎩', overdrive: '⚡', potion: '🧪', bunny: '🐰', burn: '🔥', stun: '💫', knockup: '💫', finrush: '🌀', clonesms: '👥', roared: '📣', split: '🍨', forcefast: '🔰' };

export class HUD {
  constructor(app) {
    this.app = app; this.ov = $('overlay'); this.g = this.ov.getContext('2d');
    this.floats = []; this.tick = 0; this.mmT = 0; this.cat = 'all'; this.sel = null; this.selSlot = -1; this.announceQ = []; this.annT = 0;
    this.mm = $('minimap'); this.mg = this.mm.getContext('2d');
    this.fogC = document.createElement('canvas'); this.fogC.width = this.fogC.height = 128;
    this.tip = $('tooltip');
    this.bindStatic();
  }
  resize(w, h, dpr) { this.ov.width = w * dpr; this.ov.height = h * dpr; this.dpr = dpr; }
  // ---------- setup per match ----------
  start(match) {
    this.m = match; const p = match.player; this.p = p;
    this.floats = []; this.announceQ = []; $('killfeed').innerHTML = ''; $('toasts').innerHTML = '';
    this.mmBase = match.map.minimapImage(240);
    $('pIcon').style.backgroundImage = this.app.thumbs[p.heroId] ? `url(${this.app.thumbs[p.heroId]})` : '';
    $('pIcon').style.borderColor = TEAM_COLOR[p.team];
    // abilities
    const ab = $('abilities'); ab.innerHTML = '';
    p.def.abilities.forEach((a, i) => {
      const el = document.createElement('div'); el.className = 'ab pe' + (i === 3 ? ' ult' : ''); el.dataset.slot = i;
      el.innerHTML = `<div class="up">+</div><span class="ico">${a.icon}</span><span class="key">${a.key}</span><span class="cost"></span><div class="cd"></div><div class="pips">${(i === 3 ? [0, 1, 2] : [0, 1, 2, 3, 4]).map(() => '<i></i>').join('')}</div>`;
      el.querySelector('.up').addEventListener('mousedown', e => { e.stopPropagation(); this.m.levelAbility(p, i); });
      el.addEventListener('mouseenter', () => this.showTip(el, () => this.abilityTip(i)));
      el.addEventListener('mouseleave', () => this.hideTip());
      ab.appendChild(el);
    });
    this.abEls = [...ab.children];
    // items
    const it = $('items'); it.innerHTML = '';
    for (let i = 0; i < 6; i++) {
      const s = document.createElement('div'); s.className = 'slot'; s.dataset.i = i;
      s.addEventListener('mousedown', e => { e.stopPropagation(); if (e.button === 2 && this.m.inShop(p)) this.m.sell(p, i); else if (e.button === 0) this.m.useItem(p, i); });
      s.addEventListener('contextmenu', e => e.preventDefault());
      s.addEventListener('mouseenter', () => this.showTip(s, () => p.items[i] ? this.itemTip(p.items[i].id, true) : ''));
      s.addEventListener('mouseleave', () => this.hideTip());
      it.appendChild(s);
    }
    this.itemEls = [...it.children];
    match.on((type, d) => this.onEvent(type, d));
    this.refreshItems(); this.buildShop();
    $('hud').classList.add('on');
  }
  stop() { $('hud').classList.remove('on'); this.closeShop(); $('scoreModal').classList.remove('on'); this.g.clearRect(0, 0, this.ov.width, this.ov.height); this.hideTip(); $('gl').style.filter = ''; }
  bindStatic() {
    $('shopBtn').addEventListener('click', () => this.toggleShop());
    $('shopClose').addEventListener('click', () => this.closeShop());
    $('recallBtn').addEventListener('click', () => this.m && this.m.startRecall(this.p));
    $('shopModal').addEventListener('mousedown', e => { if (e.target.id === 'shopModal') this.closeShop(); });
    this.mm.addEventListener('contextmenu', e => e.preventDefault());
    const mmAct = (e, drag) => {
      const r = this.mm.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * HALF * 2 - HALF, z = (e.clientY - r.top) / r.height * HALF * 2 - HALF;
      if (e.button === 2 && !drag) this.app.input.moveOrder(x, z, true);
      else if (e.buttons & 1) this.app.cam.lookAt(x, z, true);
    };
    this.mm.addEventListener('mousedown', e => { e.stopPropagation(); mmAct(e, false); });
    this.mm.addEventListener('mousemove', e => { if (e.buttons & 1) mmAct(e, true); });
  }
  // ---------- events from the match ----------
  onEvent(type, d) {
    if (type === 'float') { if (this.app.settings.nums || d.text === 'PROTECTED' || String(d.text).includes('g')) this.floats.push({ ...d, t: 0 }); }
    else if (type === 'toast') this.toast(d.text, d.kind);
    else if (type === 'announce') this.announce(d.text, d.sub, d.color);
    else if (type === 'kill') this.killFeed(d);
    else if (type === 'inventory') { if (d === this.p) { this.refreshItems(); if ($('shopModal').classList.contains('on')) this.renderShop(); } }
    else if (type === 'levelup') this.toast('Level ' + d.level + '! You have an ability point (Shift+Q/W/E/R or click +)', 'good');
    else if (type === 'playerDied') { $('gl').style.filter = 'grayscale(.85) brightness(.8)'; }
    else if (type === 'respawn') { $('gl').style.filter = ''; }
  }
  toast(text, kind) {
    const t = document.createElement('div'); t.className = 'toast ' + (kind || ''); t.textContent = text;
    const box = $('toasts'); box.appendChild(t); while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => t.remove(), 2600);
  }
  announce(text, sub, color) { this.announceQ.push({ text, sub, color, at: performance.now() }); if (this.announceQ.length > 3) this.announceQ.shift(); }
  killFeed(d) {
    const k = d.killer, v = d.victim;
    const kn = k ? (k.hero ? k.def.title : k.kind === 'tower' ? 'Tower' : k.kind === 'minion' ? 'Minions' : k.kind === 'monster' ? k.name : 'Fountain') : 'Fountain';
    const ki = k && k.hero ? k.def.abilities[3].icon : k && k.kind === 'tower' ? '🗼' : '💥';
    const el = document.createElement('div'); el.className = 'kf' + (v.team === this.m.pteam ? ' red' : '');
    el.innerHTML = `<span class="ic">${ki}</span>${esc(kn)}${d.assists.length ? ' <span style="opacity:.6">+' + d.assists.length + '</span>' : ''} <span style="opacity:.7">⚔</span> <span class="ic">${v.def.abilities[3].icon}</span>${esc(v.def.title)}`;
    const box = $('killfeed'); box.prepend(el); while (box.children.length > 5) box.lastChild.remove();
    setTimeout(() => el.remove(), 7000);
    if (v === this.p) this.toast('You were slain' + (k && k.hero ? ' by ' + k.def.title : ''), 'bad');
  }
  // ---------- tooltips ----------
  showTip(el, fn) { const html = fn(); if (!html) return; this.tip.innerHTML = html; this.tip.style.display = 'block'; const r = el.getBoundingClientRect(); const tw = this.tip.offsetWidth, th = this.tip.offsetHeight; this.tip.style.left = clamp(r.left + r.width / 2 - tw / 2, 6, innerWidth - tw - 6) + 'px'; this.tip.style.top = Math.max(6, r.top - th - 10) + 'px'; }
  hideTip() { this.tip.style.display = 'none'; }
  abilityTip(i) {
    const p = this.p, ab = p.def.abilities[i], r = p.abil[i].rank;
    const cd = ab.cd[Math.max(0, r - 1)] * (1 - p.st.cdr);
    return `<h4>${ab.icon} ${esc(ab.name)} <span style="opacity:.6;font-size:13px">[${ab.key}]${r ? ' rank ' + r : ' not learned'}</span></h4><div>${abilityText(ab, r || 1)}</div><div style="margin-top:6px;opacity:.8;font-size:12px">Cooldown ${cd.toFixed(1)}s · Cost ${ab.cost[Math.max(0, r - 1)]} mana${ab.range ? ' · Range ' + ab.range : ''}</div>`;
  }
  itemTip(id, owned) {
    const it = ITEM[id];
    return `<h4>${it.icon} ${esc(it.name)}</h4>${Object.entries(it.stats).map(([k, v]) => `<div class="stat">${statText(k, v)}</div>`).join('')}${it.text ? `<div style="margin-top:4px">${esc(it.text)}</div>` : ''}<div style="margin-top:6px;opacity:.75;font-size:12px">${owned ? 'Sells for ' + Math.floor(it.cost * 0.7) + ' gold (right-click in base)' : 'Cost ' + it.cost}</div>`;
  }
  // ---------- per frame ----------
  update(dt) {
    const m = this.m, p = this.p; if (!m) return;
    this.tick -= dt;
    if (this.tick <= 0) { this.tick = 0.1; this.slowUpdate(); }
    this.mmT -= dt; if (this.mmT <= 0) { this.mmT = 0.12; this.drawMinimap(); }
    // announcements one at a time
    this.annT -= dt;
    if (this.annT <= 0) { while (this.announceQ.length && performance.now() - this.announceQ[0].at > 6000) this.announceQ.shift(); const a = this.announceQ.shift(); const el = $('announce'); if (a) { el.querySelector('h1').textContent = a.text; el.querySelector('h1').style.color = a.color || '#fff'; el.querySelector('p').textContent = a.sub || ''; el.classList.add('on'); this.annT = 3; } else el.classList.remove('on'); }
    this.drawOverlay(dt);
    void p;
  }
  slowUpdate() {
    const m = this.m, p = this.p, st = p.st;
    // top
    const left = m.pteam === 0 ? 0 : 1;
    $('kBlue').textContent = m.teams[0].kills; $('kRed').textContent = m.teams[1].kills; $('clock').textContent = fmtT(m.time);
    const side = t => `🏰 ${m.teams[t].towers} ${m.teams[t].dragons.map(k => `<span class="drg" style="background:${DRAGON_KINDS.find(d => d.id === k).color}"></span>`).join('')}`;
    $('sideBlue').innerHTML = side(0); $('sideRed').innerHTML = side(1);
    void left;
    const obj = [];
    for (const c of m.camps) if (c.def.epic) {
      const ic = c.def.id === 'dragon' ? '🐉 ' + (c.alive ? (m.dragonKind ? m.dragonKind.name : '') + ' Dragon' : 'Dragon') : '👑 Mega Bean';
      obj.push(`<span>${ic}: ${c.alive ? '<b style="color:#7bd389">ALIVE</b>' : fmtT(c.next - m.time)}</span>`);
    }
    $('objTimers').innerHTML = obj.join('');
    // bars
    const sh = p.shieldTotal(), tot = Math.max(st.maxHp, p.hp + sh);
    $('hpFill').style.width = (p.hp / tot * 100) + '%'; $('shFill').style.left = (p.hp / tot * 100) + '%'; $('shFill').style.width = (sh / tot * 100) + '%';
    $('hpText').textContent = Math.ceil(p.hp) + ' / ' + Math.round(st.maxHp) + (sh > 0 ? ' (+' + Math.round(sh) + ')' : '');
    $('mpFill').style.width = (p.mana / Math.max(1, st.maxMana) * 100) + '%'; $('mpText').textContent = Math.floor(p.mana) + ' / ' + Math.round(st.maxMana);
    $('pLevel').textContent = p.level;
    const need = RULES.xpToNext(p.level);
    $('xpArc').setAttribute('stroke-dashoffset', 301.6 * (1 - (p.level >= 18 ? 1 : p.xp / need)));
    // abilities
    p.def.abilities.forEach((ab, i) => {
      const el = this.abEls[i], a = p.abil[i];
      el.classList.toggle('can', p.canLevel(i));
      const ready = a.rank > 0 && a.cd <= 0;
      el.classList.toggle('off', a.rank === 0 || a.cd > 0 || !p.alive);
      el.classList.toggle('nomana', ready && p.mana < ab.cost[a.rank - 1]);
      el.querySelector('.cd').textContent = a.cd > 0 ? (a.cd > 1 ? Math.ceil(a.cd) : a.cd.toFixed(1)) : '';
      el.querySelector('.cd').style.background = a.cd > 0 ? `conic-gradient(rgba(0,0,0,.55) ${a.cd / (ab.cd[a.rank - 1] * (1 - st.cdr)) * 360}deg, transparent 0)` : '';
      el.querySelector('.cost').textContent = a.rank ? ab.cost[a.rank - 1] : '';
      [...el.querySelectorAll('.pips i')].forEach((pi, k) => pi.classList.toggle('on', k < a.rank));
    });
    // stats
    $('statsBox').innerHTML = [['⚔️', Math.round(st.ad)], ['🔮', Math.round(st.ap)], ['🛡️', Math.round(st.armor)], ['🫧', Math.round(st.mr)], ['⚡', st.as.toFixed(2)], ['🎯', Math.round(st.crit * 100) + '%'], ['👟', Math.round(st.ms * 50)], ['⏳', Math.round(st.cdr * 100) + '%']].map(([k, v]) => `<div title="">${k} ${v}</div>`).join('');
    $('gold').textContent = '🪙 ' + Math.floor(p.gold);
    $('shopGold').textContent = '🪙 ' + Math.floor(p.gold);
    // buffs
    $('buffs').innerHTML = p.buffs.filter(b => BUFF_ICON[b.id] || BUFF_ICON[(b.id || '').replace(/\d+$/, '')] || b.slow).slice(0, 8).map(b => {
      const ic = BUFF_ICON[b.id] || (b.slow ? '🐌' : '✨'), col = b.color || (b.stun || b.knockup || b.slow || b.bunny ? '#ff6b6b' : '#7bd389');
      return `<div class="buff" style="border-color:${col}" title="${esc(b.name || b.id)}">${ic}<span style="position:absolute;margin-top:30px;font-size:10px">${b.t < 99 ? Math.ceil(b.t) : ''}</span></div>`;
    }).join('');
    // death + recall
    $('death').classList.toggle('hidden', p.alive);
    if (!p.alive) $('deathT').textContent = Math.ceil(p.respawnT);
    $('recallBar').classList.toggle('hidden', p.recallT < 0);
    if (p.recallT >= 0) $('recallBar').querySelector('i').style.width = ((1 - p.recallT / p.recallMax) * 100) + '%';
    if (this.itemsDirty) this.refreshItems();
    if ($('scoreModal').classList.contains('on')) this.renderScore();
    if ($('shopModal').classList.contains('on')) { const can = this.m.inShop(p); $('shopBox').style.filter = ''; this.shopInBase = can; this.renderShopPrices(); }
  }
  refreshItems() {
    const p = this.p; if (!p) return;
    this.itemEls.forEach((s, i) => { const it = p.items[i]; s.innerHTML = it ? `${ITEM[it.id].icon}${it.count > 1 ? `<b>${it.count}</b>` : ''}<span class="k">${i + 1}</span>` : `<span class="k">${i + 1}</span>`; });
  }
  // ---------- overlay: bars and numbers ----------
  project(x, y, z) {
    const v = this._v || (this._v = new THREE.Vector3());
    v.set(x, y, z).project(this.app.camera);
    if (v.z > 1) return null;
    return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight];
  }
  drawOverlay(dt) {
    const g = this.g, m = this.m, pt = m.pteam, d = this.dpr;
    g.setTransform(d, 0, 0, d, 0, 0);
    g.clearRect(0, 0, innerWidth, innerHeight);
    const hov = this.app.input.hover;
    for (const u of m.units) {
      if (!u.alive) continue;
      if (!(u.team === pt || u.vis[pt])) continue;
      const k = u.kind;
      if (k === 'monster' && u.state === 'idle' && u.hp >= u.st.maxHp && u !== hov) continue;
      if (k === 'tower' && !u.alive) continue;
      const sz = u.st.size || 1;
      const hgt = k === 'hero' ? 3.25 * sz : k === 'tower' ? 9.4 : k === 'core' ? 9.5 : k === 'monster' ? (u.mdef.size || 1) * (u.mdef.epic ? 3.3 : 1.7) * sz : k === 'clone' ? 2.3 : 1.7 * (u.mtype === 'siege' ? 1.3 : 1);
      let y = m.groundY(u.x, u.z) + hgt; if (u.dash && u.dash.arc) y += 1.5;
      const s = this.project(u.x, y, u.z); if (!s) continue;
      const [sx, sy] = s;
      if (sx < -100 || sy < -60 || sx > innerWidth + 100 || sy > innerHeight + 60) continue;
      const w = k === 'hero' ? 96 : k === 'tower' ? 110 : k === 'core' ? 160 : k === 'monster' ? (u.mdef.epic ? 170 : u.mdef.buff || u.mdef.size > 1.2 ? 90 : 52) : k === 'clone' ? 60 : u.mtype === 'siege' ? 56 : 44;
      const h = k === 'hero' ? 11 : k === 'tower' || k === 'core' || (k === 'monster' && u.mdef.epic) ? 11 : 6;
      const col = u === this.p ? '#7be07b' : u.team === 2 ? '#ffb703' : u.team === pt ? '#4ea1ff' : '#ff4d6d';
      const x0 = sx - w / 2, y0 = sy - h;
      const sh = u.shieldTotal(), tot = Math.max(u.st.maxHp, u.hp + sh);
      g.fillStyle = 'rgba(10,6,24,.85)'; g.fillRect(x0 - 2, y0 - 2, w + 4, h + 4 + (k === 'hero' ? 5 : 0));
      g.fillStyle = col; g.fillRect(x0, y0, w * u.hp / tot, h);
      if (sh > 0) { g.fillStyle = '#ffffff'; g.fillRect(x0 + w * u.hp / tot, y0, w * sh / tot, h); }
      if (k === 'hero') {
        // little ticks every 100 health
        g.fillStyle = 'rgba(0,0,0,.35)'; for (let t = 100; t < u.st.maxHp; t += 100) g.fillRect(x0 + w * t / tot, y0, t % 1000 === 0 ? 2 : 1, h * (t % 1000 === 0 ? 1 : 0.55));
        g.fillStyle = '#4f8dff'; g.fillRect(x0, y0 + h + 1, w * u.mana / Math.max(1, u.st.maxMana), 3);
        // level badge and name
        g.fillStyle = 'rgba(10,6,24,.92)'; g.fillRect(x0 - 24, y0 - 2, 22, h + 9);
        g.fillStyle = '#ffd23f'; g.font = '900 13px Nunito'; g.textAlign = 'center'; g.fillText(u.level, x0 - 13, y0 + h + 2);
        g.font = '400 14px "Lilita One"'; g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.8)';
        const nm = u.isPlayer ? 'YOU' : u.def.title.replace('THE ', '');
        g.strokeText(nm, sx, y0 - 6); g.fillStyle = u.isPlayer ? '#ffd23f' : '#fff'; g.fillText(nm, sx, y0 - 6);
        if (u.recallT >= 0) { g.fillStyle = 'rgba(10,6,24,.85)'; g.fillRect(x0, y0 + h + 7, w, 5); g.fillStyle = '#8fc0ff'; g.fillRect(x0, y0 + h + 7, w * (1 - u.recallT / u.recallMax), 5); }
      } else if (k === 'tower' || k === 'core' || (k === 'monster' && (u.mdef.epic || u === hov))) {
        g.font = '400 13px "Lilita One"'; g.textAlign = 'center'; g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.8)';
        const nm = k === 'monster' ? u.name : u.protectedNow ? '🛡️ Protected' : '';
        if (nm) { g.strokeText(nm, sx, y0 - 6); g.fillStyle = '#fff'; g.fillText(nm, sx, y0 - 6); }
      }
      if (u === hov && u.team !== pt) { g.strokeStyle = '#ffd23f'; g.lineWidth = 2; g.strokeRect(x0 - 3, y0 - 3, w + 6, h + 6 + (k === 'hero' ? 5 : 0)); }
    }
    // floating numbers
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i]; f.t += dt;
      if (f.t > 1.1) { this.floats.splice(i, 1); continue; }
      const s = this.project(f.x, m.groundY(f.x, f.z) + f.y + f.t * 1.8, f.z); if (!s) continue;
      const a = f.t < 0.7 ? 1 : 1 - (f.t - 0.7) / 0.4, sc = f.crit ? 1 + Math.max(0, 0.4 - f.t) * 1.5 : 1;
      g.globalAlpha = a; g.font = `400 ${Math.round(f.size * sc)}px "Lilita One"`; g.textAlign = 'center'; g.lineWidth = 4; g.strokeStyle = 'rgba(20,10,30,.85)';
      g.strokeText(f.text, s[0], s[1]); g.fillStyle = f.color; g.fillText(f.text, s[0], s[1]);
      g.globalAlpha = 1;
    }
    if (this.floats.length > 80) this.floats.splice(0, this.floats.length - 80);
  }
  // ---------- minimap ----------
  w2m(x, z) { return [(x + HALF) / (HALF * 2) * 240, (z + HALF) / (HALF * 2) * 240]; }
  drawMinimap() {
    const g = this.mg, m = this.m, pt = m.pteam;
    g.drawImage(this.mmBase, 0, 0, 240, 240);
    // fog
    const fd = m.map.fogTex.image.data, fc = this.fogC.getContext('2d'), img = fc.createImageData(128, 128);
    for (let i = 0; i < 128 * 128; i++) { img.data[i * 4] = 8; img.data[i * 4 + 1] = 6; img.data[i * 4 + 2] = 30; img.data[i * 4 + 3] = (255 - fd[i * 4]) * 0.55; }
    fc.putImageData(img, 0, 0); g.imageSmoothingEnabled = true; g.drawImage(this.fogC, 0, 0, 240, 240);
    // camps
    for (const c of m.camps) {
      const [x, y] = this.w2m(c.def.x, c.def.z);
      if (c.def.epic) { g.font = '16px sans-serif'; g.textAlign = 'center'; g.globalAlpha = c.alive ? 1 : 0.45; g.fillText(c.def.id === 'dragon' ? '🐉' : '👑', x, y + 6); g.globalAlpha = 1; }
      else if (c.alive) { g.fillStyle = '#ffb703'; g.beginPath(); g.arc(x, y, 3.2, 0, 7); g.fill(); g.strokeStyle = '#3d2b00'; g.lineWidth = 1; g.stroke(); }
    }
    for (const u of m.units) {
      if (u.kind === 'tower' || u.kind === 'core') {
        const [x, y] = this.w2m(u.x, u.z), s = u.kind === 'core' ? 8 : 5;
        g.fillStyle = u.alive ? TEAM_COLOR[u.team] : '#555'; g.strokeStyle = '#fff'; g.lineWidth = 1.5;
        if (u.kind === 'core') { g.save(); g.translate(x, y); g.rotate(Math.PI / 4); g.fillRect(-s / 2, -s / 2, s, s); g.strokeRect(-s / 2, -s / 2, s, s); g.restore(); }
        else { g.fillRect(x - s / 2, y - s / 2, s, s); g.strokeRect(x - s / 2, y - s / 2, s, s); }
        continue;
      }
      if (!u.alive || !(u.team === pt || u.vis[pt])) continue;
      if (u.kind === 'minion' || u.kind === 'clone') { const [x, y] = this.w2m(u.x, u.z); g.fillStyle = u.team === pt ? '#8fc0ff' : '#ff9aac'; g.fillRect(x - 1.5, y - 1.5, 3, 3); }
      else if (u.kind === 'monster' && u.state !== 'idle') { const [x, y] = this.w2m(u.x, u.z); g.fillStyle = '#ffb703'; g.fillRect(x - 2, y - 2, 4, 4); }
    }
    for (const h of m.heroes) {
      if (!h.alive || !(h.team === pt || h.vis[pt])) continue;
      const [x, y] = this.w2m(h.x, h.z);
      g.beginPath(); g.arc(x, y, h === this.p ? 8 : 7, 0, 7); g.fillStyle = h.team === pt ? '#1f4fa8' : '#a3203a'; g.fill();
      g.lineWidth = 2.5; g.strokeStyle = h === this.p ? '#ffd23f' : TEAM_COLOR[h.team]; g.stroke();
      g.font = '10px sans-serif'; g.textAlign = 'center'; g.fillText(h.def.abilities[3].icon, x, y + 4);
    }
    // camera view
    const corners = this.app.cam.groundCorners();
    if (corners) { g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 1.5; g.beginPath(); corners.forEach((c, i) => { const [x, y] = this.w2m(c.x, c.z); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.closePath(); g.stroke(); }
  }
  // ---------- shop ----------
  toggleShop() { if ($('shopModal').classList.contains('on')) this.closeShop(); else this.openShop(); }
  openShop() { if (!this.m) return; $('shopModal').classList.add('on'); this.renderShop(); this.app.audio.sfx('click'); }
  closeShop() { $('shopModal').classList.remove('on'); this.hideTip(); }
  get shopOpen() { return $('shopModal').classList.contains('on'); }
  buildShop() {
    const cats = $('shopCats'); cats.innerHTML = '';
    for (const [id, name] of SHOP_CATS) { const b = document.createElement('button'); b.textContent = name; b.dataset.c = id; b.addEventListener('click', () => { this.cat = id; this.renderShop(); }); cats.appendChild(b); }
    this.sel = this.p.def.items.find(i => i !== 'potion') || 'potion'; this.selSlot = -1;
  }
  renderShop() {
    const p = this.p, grid = $('shopGrid');
    [...$('shopCats').children].forEach(b => b.classList.toggle('on', b.dataset.c === this.cat));
    const itm = id => { const it = ITEM[id], { price } = this.m.priceFor(p, id); return `<div class="itm ${id === this.sel ? 'on' : ''} ${p.gold < price ? 'cant' : ''} ${p.hasItem(id) ? 'own' : ''}" data-id="${id}"><div class="i">${it.icon}</div><div style="font-size:10.5px;font-weight:800;line-height:1.1;height:24px;overflow:hidden">${esc(it.name)}</div><div class="p">${price}</div></div>`; };
    const filter = it => this.cat === 'all' || it.cat.includes(this.cat);
    const rec = p.def.items.filter(id => filter(ITEM[id]));
    const parts = ITEMS.filter(it => !it.from && filter(it)).map(it => it.id);
    const full = ITEMS.filter(it => it.from && filter(it)).map(it => it.id);
    grid.innerHTML = (rec.length ? `<div class="igroup"><h4>⭐ Recommended for ${esc(p.def.title)}</h4><div class="iflow">${rec.map(itm).join('')}</div></div>` : '') +
      `<div class="igroup"><h4>Starter items and parts</h4><div class="iflow">${parts.map(itm).join('')}</div></div>` +
      `<div class="igroup"><h4>Finished items</h4><div class="iflow">${full.map(itm).join('')}</div></div>`;
    grid.querySelectorAll('.itm').forEach(el => {
      el.addEventListener('click', () => { this.sel = el.dataset.id; this.selSlot = -1; this.renderShop(); this.app.audio.sfx('hover'); });
      el.addEventListener('dblclick', () => { this.m.buy(p, el.dataset.id); });
      el.addEventListener('contextmenu', e => { e.preventDefault(); this.m.buy(p, el.dataset.id); });
    });
    this.renderDetail(); this.renderInv();
  }
  renderShopPrices() { if (this._lastGold !== Math.floor(this.p.gold)) { this._lastGold = Math.floor(this.p.gold); this.renderShop(); } }
  renderDetail() {
    const p = this.p, id = this.sel, it = ITEM[id]; if (!it) return;
    const { price } = this.m.priceFor(p, id), inBase = this.m.inShop(p);
    const into = ITEMS.filter(x => x.from && x.from.includes(id));
    const small = cid => `<div class="itm ${p.hasItem(cid) ? 'own' : ''}" data-id="${cid}"><div class="i">${ITEM[cid].icon}</div><div class="p">${ITEM[cid].cost}</div></div>`;
    $('shopDetail').innerHTML = `<h3>${it.icon} ${esc(it.name)}</h3>
      ${Object.entries(it.stats).map(([k, v]) => `<div class="stat">${statText(k, v)}</div>`).join('')}
      ${it.text ? `<div style="margin-top:6px;font-weight:800">${esc(it.text)}</div>` : ''}
      ${it.from ? `<div style="margin-top:12px;font-weight:900;opacity:.75">BUILDS FROM</div><div class="tree">${it.from.map(small).join('<span>+</span>')}<span>+ ${it.cost - it.from.reduce((s, c) => s + ITEM[c].cost, 0)}g</span></div>` : ''}
      ${into.length ? `<div style="margin-top:8px;font-weight:900;opacity:.75">BUILDS INTO</div><div class="tree">${into.map(x => small(x.id)).join('')}</div>` : ''}
      <div style="margin-top:12px;font-weight:900">Price: <span style="color:var(--gold)">${price}</span>${price < it.cost ? ` <span style="opacity:.6">(you own parts, full price ${it.cost})</span>` : ''}</div>
      <button class="btn" id="buyBtn" style="margin-top:10px;width:100%" ${p.gold < price || !inBase ? 'disabled' : ''}>BUY</button>
      ${!inBase ? '<div style="margin-top:8px;color:#ff9aac;font-weight:900">You can only buy in your base. Press B to recall.</div>' : ''}
      <div style="margin-top:8px;opacity:.6;font-size:12px">Tip: double-click or right-click an item to buy it quickly.</div>`;
    $('buyBtn').addEventListener('click', () => this.m.buy(p, id));
    $('shopDetail').querySelectorAll('.itm').forEach(el => el.addEventListener('click', () => { this.sel = el.dataset.id; this.renderShop(); }));
  }
  renderInv() {
    const p = this.p;
    $('shopInv').innerHTML = `<b style="opacity:.8">YOUR ITEMS</b>` + p.items.map((s, i) => `<div class="slot ${i === this.selSlot ? 'on' : ''}" data-i="${i}" style="${i === this.selSlot ? 'border-color:var(--gold)' : ''}">${s ? ITEM[s.id].icon + (s.count > 1 ? `<b>${s.count}</b>` : '') : ''}</div>`).join('') +
      (this.selSlot >= 0 && p.items[this.selSlot] ? `<button class="btn ghost mini" id="sellBtn">SELL ${esc(ITEM[p.items[this.selSlot].id].name)} for ${Math.floor(ITEM[p.items[this.selSlot].id].cost * 0.7)}g</button>` : '<span style="opacity:.6;font-weight:800">Click one of your items to sell it.</span>');
    $('shopInv').querySelectorAll('.slot').forEach(el => el.addEventListener('click', () => { const i = +el.dataset.i; this.selSlot = p.items[i] ? i : -1; if (p.items[i]) this.sel = p.items[i].id; this.renderShop(); }));
    const sb = $('sellBtn'); if (sb) sb.addEventListener('click', () => { this.m.sell(p, this.selSlot); this.selSlot = -1; this.renderShop(); });
  }
  // ---------- scoreboard ----------
  renderScore() {
    const m = this.m;
    const rows = team => m.heroes.filter(h => h.team === team).map(h => `<tr class="${h === this.p ? 'me' : ''}"><td style="font-size:20px">${h.def.abilities[3].icon}</td><td>${esc(h.def.title)}${h === this.p ? ' (you)' : ''}<div style="font-size:11px;opacity:.6">${h.def.name} · ${h.def.role}</div></td><td>${h.level}</td><td>${h.stats.kills} / ${h.stats.deaths} / ${h.stats.assists}</td><td>${h.stats.cs}</td><td>${Math.floor(h.stats.gold + 500)}</td><td>${h.items.map(s => s ? ITEM[s.id].icon : '').join(' ')}</td><td>${h.alive ? '' : '💀 ' + Math.ceil(h.respawnT)}</td></tr>`).join('');
    const head = team => `<tr><th colspan="2" class="${team ? 'tr' : 'tb'}" style="font-size:16px;opacity:1">${team ? '🔴 RED TEAM' : '🔵 BLUE TEAM'} — ${m.teams[team].kills} kills · ${m.teams[team].towers} towers · ${m.teams[team].dragons.length} dragons</th><th>LVL</th><th>K / D / A</th><th>CS</th><th>GOLD</th><th>ITEMS</th><th></th></tr>`;
    $('scoreBox').innerHTML = `<h2 style="font-size:26px;color:var(--gold);margin-bottom:8px">SCOREBOARD · ${fmtT(m.time)}</h2><table>${head(0)}${rows(0)}<tr><td colspan="8" style="height:10px"></td></tr>${head(1)}${rows(1)}</table>`;
  }
}
export { fmtT };
