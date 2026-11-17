// The in-game interface: top bar, shop (your team of beans + farms), the upgrade panel with one upgrade button,
// the multi-select panel, wave banners, floating numbers and the end screens.
import { BEAN, FARM, TARGETS, TARGET_NAME, skinFor, farmIncome } from './data.js';
import { icon } from './icons.js';

export const $ = id => document.getElementById(id);
const fmt = n => Math.floor(n).toLocaleString('en-US');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class UI {
  constructor(app) { this.app = app; this.last = {}; this.bannerT = 0; this.cards = []; }
  get g() { return this.app.game; }

  // ---------- setup for a new game ----------
  start(game, team, farms) {
    const d = game.diff;
    $('diffBadge').innerHTML = `<span style="color:${d.color}">${d.infinite ? icon('infinity') : d.oneLife ? icon('skull') : ''}${d.name.toUpperCase()}</span>`;
    const list = $('beanList'); list.innerHTML = '';
    const card = (def, i, farm) => {
      const el = document.createElement('div'); el.className = 'bcard' + (farm ? ' farmcard' : ''); el.dataset.id = def.id; el.dataset.farm = farm ? 1 : 0;
      el.style.setProperty('--c1', def.badge[0]); el.style.setProperty('--c2', def.badge[1]);
      el.innerHTML = `<img src="${this.app.portraits[def.id] || ''}" alt=""><div><div class="nm">${def.name}</div><div class="ds">${def.desc}</div></div><div class="pr">${icon('coin')}<span>${game.price(def)}</span></div>${i < 9 ? `<div class="key">${i + 1}</div>` : ''}`;
      el.addEventListener('click', () => this.app.input.pick(def.id, farm));
      el.addEventListener('mouseenter', () => this.app.audio.sfx('hover'));
      list.appendChild(el);
    };
    team.forEach((id, i) => card(BEAN[id], i, false));
    const h = document.createElement('div'); h.className = 'shead'; h.innerHTML = `${icon('farm')}FARMS`; list.appendChild(h);
    farms.forEach((id, i) => card(FARM[id], team.length + i, true));
    this.cards = [...list.querySelectorAll('.bcard')];
    this.last = {}; this.hideInfo();
    $('hud').classList.add('on');
    this.update(true);
  }
  stop() { $('hud').classList.remove('on'); this.hideInfo(); $('banner').classList.remove('on'); }

  // ---------- every frame ----------
  update(force) {
    const g = this.g; if (!g) return;
    const set = (k, v, el) => { if (force || this.last[k] !== v) { const old = this.last[k]; this.last[k] = v; $(el).textContent = v; return old; } return undefined; };
    const oldL = set('lives', fmt(g.lives), 'vLives');
    if (oldL !== undefined && +oldL.replace(/,/g, '') > g.lives) this.flash('sLives', 'hurt');
    const oldM = set('money', fmt(g.money), 'vMoney');
    if (oldM !== undefined && +oldM.replace(/,/g, '') < Math.floor(g.money) && !force) this.flash('sMoney', 'bump');
    set('wave', g.rounds === Infinity ? `${Math.max(g.wave, 0)}` : `${Math.max(g.wave, 0)} / ${g.rounds}`, 'vWave');
    const inp = this.app.input;
    for (const el of this.cards) {
      const farm = el.dataset.farm === '1', def = farm ? FARM[el.dataset.id] : BEAN[el.dataset.id];
      el.classList.toggle('poor', g.money < g.price(def)); el.classList.toggle('on', inp.placing === def.id);
    }
    const sb = $('startBtn'), label = g.over ? (g.won ? 'VICTORY!' : 'GAME OVER') : g.waveActive ? 'WAVE IN PROGRESS' : `START WAVE ${g.wave + 1}`;
    if (this.last.sb !== label) { this.last.sb = label; sb.querySelector('span').textContent = label; }
    sb.disabled = g.waveActive || g.over;
    const paused = this.app.paused;
    if (this.last.paused !== paused) { this.last.paused = paused; $('pauseBtn').innerHTML = paused ? `${icon('play')}<span>Resume</span>` : `${icon('pause')}<span>Pause</span>`; $('pauseBtn').classList.toggle('on', paused); }
    if (this.last.speed !== this.app.speed) { this.last.speed = this.app.speed; $('speedBtn').querySelector('span').textContent = this.app.speed + 'x'; $('speedBtn').classList.toggle('on', this.app.speed > 1); $('speedBtn').classList.toggle('turbo', this.app.speed > 3); }
    $('autoBtn').classList.toggle('on', g.auto);
    $('selectBtn').classList.toggle('on', inp.multi);
    const walking = !!this.app.walking;
    if (this.last.walk !== walking) { this.last.walk = walking; $('walkBtn').innerHTML = walking ? `${icon('walkout')}<span>GO OUT</span>` : `${icon('walkin')}<span>GO IN</span>`; $('walkBtn').classList.toggle('on', walking); }
    this.mates(g);
    if (inp.multi) this.refreshMulti(); else if (this.sel) this.refreshInfo();
    if (this.bannerT > 0) { this.bannerT -= 1 / 60; if (this.bannerT <= 0) $('banner').classList.remove('on'); }
  }
  // the other players' money (in a party everyone has their own)
  mates(g) {
    const others = g.players.filter(p => p !== g.me);
    const key = g.mul + '#' + others.map(p => p + ':' + Math.floor(g.wallets[p] || 0) + ':' + this.app.nameOf(p)).join('|');
    if (key === this.last.mates) return; this.last.mates = key;
    // more players = tougher balloons
    const hard = g.mul > 1 ? `<div class="stat hardx" title="${g.mul} players: the balloons have ${g.mul}X life (and give ${g.mul}X money per pop)">${icon('b_red')}<div><small>BALLOON LIFE</small><div class="v">${g.mul}X</div></div></div>` : '';
    $('mates').innerHTML = hard + others.map(p => `<div class="stat mate" style="--pc:${this.app.colorOf(p)}"><span class="pdot"></span><div><small>${esc(this.app.nameOf(p))} MONEY</small><div class="v">${fmt(g.wallets[p] || 0)}</div></div></div>`).join('');
    $('sMoney').querySelector('small').textContent = others.length ? 'YOUR MONEY' : 'MONEY';
  }
  flash(id, cls) { const el = $(id); el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
  banner(title, sub, time = 2.2, color) {
    const b = $('banner'); b.querySelector('h1').textContent = title; b.querySelector('h1').style.color = color || ''; b.querySelector('p').textContent = sub || '';
    b.classList.remove('on'); void b.offsetWidth; b.classList.add('on'); this.bannerT = time;
  }
  hint(text) { const h = $('hint'); if (!text) { h.classList.add('hidden'); return; } h.classList.remove('hidden'); h.querySelector('span').textContent = text; }
  float(x, y, html, bad) {
    const el = document.createElement('div'); el.className = 'float' + (bad ? ' bad' : ''); el.innerHTML = html;
    el.style.left = x + 'px'; el.style.top = y + 'px'; $('floats').appendChild(el);
    setTimeout(() => el.remove(), 1150);
  }

  // ---------- upgrade panel (one bean or farm) ----------
  showInfo(t) { this.sel = t; this.infoKey = ''; $('info').classList.add('on'); this.refreshInfo(); }
  hideInfo() { this.sel = null; this.multiKey = ''; $('info').classList.remove('on'); }
  refreshInfo() {
    const g = this.g, t = this.sel; if (!t || !g) return;
    if (!g.towers.includes(t)) { this.hideInfo(); return; }
    const cost = g.upgradeCost(t), mine = t.owner === g.me;
    const key = [t.lvl, cost !== null && g.money >= cost, t.target, Math.floor(t.pops / 5), Math.floor(t.earned || 0), g.over, t.owner].join('|');
    if (key === this.infoKey) return; this.infoKey = key;
    const d = t.def, farm = t.isFarm;
    const stat = (ic, label, v) => `<div>${icon(ic)}<div><small>${label}</small>${v}</div></div>`;
    let stats;
    if (farm) stats = [stat('coin', 'MONEY / WAVE', fmt(farmIncome(d, t.lvl, g.diff))), stat('coinstack', 'EARNED', fmt(t.earned)), stat('coinstack', 'SPENT', fmt(t.spent)), stat('farm', 'LEVEL', `${t.lvl} / 10`)].join('');
    else {
      const s = t.stats;
      stats = [stat('damage', 'DAMAGE', s.dmg + (s.dot ? ` <span class="sm">+${s.dot}/s acid</span>` : '') + (s.bossMul > 1 ? ` <span class="sm">x${s.bossMul} boss</span>` : '')),
        stat('rate', 'ATTACKS / SEC', (1 / s.cd).toFixed(2)), stat('range', 'RANGE', s.range > 100 ? 'Map' : s.range.toFixed(1)),
        d.kind === 'tazer' ? stat('pierce', s.arc ? 'ZAPS + JUMPS' : 'ZAPS AT ONCE', (s.count || 1) + (s.arc ? ` <span class="sm">+${s.arc}</span>` : '') + (s.stun ? ` <span class="sm">${s.stun.toFixed(1)}s stun</span>` : '')) : d.kind === 'wind' ? stat('slow', 'PUSH BACK', s.push.toFixed(1)) : d.kind === 'support' ? stat('rate', 'BEANS FASTER', '+' + Math.round(s.boost * 100) + '%') : d.proj === 'fire' ? stat('blast', 'BURN / SEC', s.dot) :
        d.kind === 'bomb' || d.kind === 'cannon' ? stat('blast', 'BLAST SIZE', s.radius.toFixed(1)) : d.kind === 'ice' ? stat('freeze', 'FREEZE', s.freeze.toFixed(1) + 's') : d.kind === 'glue' ? stat('slow', 'SLOW', Math.round(s.slow * 100) + '%') : d.kind === 'chain' ? stat('pierce', 'JUMPS', s.chain) : d.kind === 'hitscan' ? stat('pierce', 'BOUNCES', s.ricochet || 0) : stat('pierce', 'PIERCE', s.pierce + (s.count > 1 ? ` <span class="sm">x${s.count}</span>` : '')),
        stat('pop', 'POPPED', fmt(t.pops)), stat('coinstack', 'SPENT', fmt(t.spent))].join('');
    }
    const pips = Array.from({ length: 10 }, (_, j) => `<b class="${j < t.lvl ? 'on' : ''} ${j === 4 || j === 9 ? 'star' : ''}"></b>`).join('');
    const next = t.lvl < 10 ? (farm ? { name: ['Better Soil', 'Watering Can', 'More Rows', 'Scarecrow', 'Big Silo', 'Fertilizer', 'Greenhouse', 'Tractor', 'Bean Market', 'Mega Farm'][t.lvl], desc: `Grows ${fmt(farmIncome(d, t.lvl + 1, g.diff))} per wave` } : d.ups[t.lvl]) : null;
    const look = next && (t.lvl + 1 === 5 || t.lvl + 1 === 10) ? `<div class="newlook">${icon('max')}New look!</div>` : '';
    const upBox = !mine ? `<div class="upbox max owner" style="--pc:${this.app.colorOf(t.owner)}"><span class="pdot"></span>Placed by <b>${esc(this.app.nameOf(t.owner))}</b><div class="upd">Only they can upgrade or sell it</div></div>`
      : next ? `<div class="upbox"><div class="upn">Next: <b>${next.name}</b>${look}</div><div class="upd">${next.desc}</div>
        <button class="btn ${g.money >= cost ? 'green' : ''} upbtn" id="upBtn" ${g.money >= cost && !g.over ? '' : 'disabled'}>${icon('upgrade')}UPGRADE<span>${icon('coin')}${fmt(cost)}</span></button></div>`
      : `<div class="upbox max">${icon('max')}<b>Fully upgraded!</b></div>`;
    $('info').style.setProperty('--c1', d.badge[0]); $('info').style.setProperty('--c2', d.badge[1]);
    $('info').innerHTML = `<div class="head"><img src="${this.app.portraits[d.id] || ''}" alt=""><div><h2>${d.name}</h2><span class="lvl">LEVEL ${t.lvl} / 10</span><div class="pips10">${pips}</div></div><button class="x" id="infoClose">${icon('close')}</button></div>
      <div class="stats">${stats}</div>${upBox}
      <div class="infoBtns" ${mine ? '' : 'hidden'}>${farm ? '' : `<button class="btn ghost" id="targetBtn">${icon('target')}${TARGET_NAME[t.target]}</button>`}<button class="btn pink" id="sellBtn" ${farm ? 'style="grid-column:1/span 2"' : ''}>${icon('sell')}Sell ${icon('coin')}${fmt(g.sellValue(t))}</button></div>`;
    const up = $('upBtn'); if (up) up.addEventListener('click', () => { if (this.app.act({ k: 'up', t: t.id })) { this.infoKey = ''; this.refreshInfo(); } });
    $('infoClose').addEventListener('click', () => { this.app.input.deselect(); this.app.audio.sfx('click'); });
    const tb = $('targetBtn'); if (tb) tb.addEventListener('click', () => { this.app.act({ k: 'tgt', t: t.id, v: TARGETS[(TARGETS.indexOf(t.target) + 1) % TARGETS.length] }); this.app.audio.sfx('select'); this.infoKey = ''; this.refreshInfo(); });
    $('sellBtn').addEventListener('click', () => { this.app.act({ k: 'sell', t: t.id }); this.app.input.deselect(); });
  }

  // ---------- multi-select panel ----------
  refreshMulti() {
    const g = this.g, list = this.app.input.picked.filter(t => g.towers.includes(t));
    this.app.input.picked = list;
    const own = list.filter(t => t.owner === g.me), ready = own.filter(t => g.upgradeCost(t) !== null), cost = g.upgradeAllCost(ready), sell = own.reduce((s, t) => s + g.sellValue(t), 0);
    const key = [list.map(t => t.id + ':' + t.lvl).join(','), g.money >= cost, g.over].join('|');
    if (key === this.multiKey) return; this.multiKey = key;
    $('info').classList.add('on');
    const faces = list.slice(0, 18).map(t => `<span class="mini" style="--c1:${t.def.badge[0]};--c2:${t.def.badge[1]}"><img src="${this.app.portraits[t.def.id] || ''}" alt=""><b>${t.lvl}</b></span>`).join('') + (list.length > 18 ? `<span class="more">+${list.length - 18}</span>` : '');
    $('info').innerHTML = `<div class="head"><div class="selic">${icon('select')}</div><div><h2>${list.length} selected</h2><span class="lvl">TAP BEANS TO ADD OR REMOVE</span></div><button class="x" id="infoClose">${icon('close')}</button></div>
      <div class="minis">${list.length ? faces : '<div class="empty">Tap beans and farms on the map to select them.</div>'}</div>
      <div class="upbox"><div class="upn">Upgrade all of them <b>one level</b></div><div class="upd">${ready.length ? `${ready.length} can still be upgraded` : list.length ? 'They are all fully upgraded' : 'Nothing selected yet'}</div>
        <button class="btn ${ready.length && g.money >= cost ? 'green' : ''} upbtn" id="upAllBtn" ${ready.length && g.money >= cost && !g.over ? '' : 'disabled'}>${icon('upgrade')}UPGRADE ALL<span>${icon('coin')}${fmt(cost)}</span></button></div>
      <div class="infoBtns"><button class="btn ghost" id="selAllBtn">${icon('team')}Select all</button><button class="btn pink" id="sellAllBtn" ${own.length ? '' : 'disabled'}>${icon('sell')}Sell all ${icon('coin')}${fmt(sell)}</button></div>`;
    $('upAllBtn').addEventListener('click', () => { this.app.act({ k: 'upall', ts: this.app.input.picked.filter(t => t.owner === this.g.me).map(t => t.id) }); this.multiKey = ''; });
    $('infoClose').addEventListener('click', () => { this.app.input.setMulti(false); this.app.audio.sfx('click'); });
    $('selAllBtn').addEventListener('click', () => { this.app.input.picked = this.g.towers.filter(t => t.owner === this.g.me); this.multiKey = ''; this.app.audio.sfx('select'); });
    $('sellAllBtn').addEventListener('click', () => { this.app.act({ k: 'sellall', ts: this.app.input.picked.filter(t => t.owner === this.g.me).map(t => t.id) }); this.app.input.picked = []; this.multiKey = ''; });
  }

  // ---------- end screens ----------
  results(won, coins) {
    const g = this.g, m = g.map.def;
    const box = (ic, label, v, wide) => `<div class="${wide ? 'wide' : ''}">${icon(ic)}<div><small>${label}</small>${v}</div></div>`;
    const coinBox = box('beancoin', 'BEAN COINS EARNED', `<span style="color:#7bd389">+${fmt(coins)}</span>`, true);
    const rounds = g.rounds === Infinity ? 'Infinity' : g.rounds;
    if (won) {
      $('vicSub').textContent = `${m.name} · ${g.diff.name} · ${rounds} waves`;
      $('vicStats').innerHTML = box('trophy', 'MAP', m.name) + box('medal', 'DIFFICULTY', `<span style="color:${g.diff.color}">${g.diff.name}</span>`) + box('wave', 'WAVES CLEARED', `${g.cleared} / ${rounds}`) + box('pop', 'BALLOONS POPPED', fmt(g.stats.popped)) + box('coin', 'MONEY LEFT', fmt(g.money)) + box('heart', 'LIVES LEFT', g.lives) + coinBox;
    } else {
      $('goSub').textContent = `${m.name} · ${g.diff.name}${g.diff.infinite ? '' : ' · ' + rounds + ' waves'}`;
      $('goStats').innerHTML = box('wave', g.diff.infinite ? 'YOU REACHED WAVE' : 'LOST ON WAVE', g.diff.infinite ? g.wave : `${g.wave} / ${rounds}`) + box('trophy', 'WAVES CLEARED', g.cleared) + box('pop', 'BALLOONS POPPED', fmt(g.stats.popped)) + box('crown', 'BOSSES POPPED', g.stats.bosses) + coinBox;
    }
  }
}
export { skinFor };
