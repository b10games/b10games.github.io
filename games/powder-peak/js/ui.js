// Menus and the in-game HUD: lobby tabs (Play, Locker, Party, Challenges), game modes, settings,
// pause, results, and the speed / trick / score display while riding.
import { MODES, SLOTS, PRESETS, TRICK_SPOTS, find } from './data.js';
import { DROPS, COURSES } from './world.js';
import { ASSIST } from './assist.js';
import { fillIcons, ICON } from './icons.js';
import { saveSettings, storeSave, challengeState } from './settings.js';
import { fmtTime, fmtNum } from './modes.js';
import { COLORS } from './mp.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class UI {
  constructor(app) {
    this.app = app; this.cat = 'presets'; this.setTab = 'gameplay'; this.pickMode = null;
    // tabs
    document.querySelectorAll('.tab').forEach(t => t.onclick = () => { this.click(); this.setView(t.dataset.view); });
    document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => { this.click(); $(b.dataset.close).classList.remove('on'); });
    $('setBtn').onclick = () => { this.click(); this.openSettings(); };
    $('modeCard').onclick = () => { this.click(); this.openModes(); };
    $('playBtn').onclick = () => this.play();
    document.querySelectorAll('#gearT button').forEach(b => b.onclick = () => { this.click(); app.setGear(b.dataset.g); this.renderPlay(); });
    $('pmCreate').onclick = () => { this.click(); this.setView('party'); this.createParty(); };
    $('pmJoin').onclick = () => { this.click(); this.setView('party'); setTimeout(() => { const i = $('codeInput'); if (i) i.focus(); }, 50); };
    // game
    $('pauseBtn').onclick = () => { this.click(); app.togglePause(true); };
    $('pResume').onclick = () => { this.click(); app.togglePause(false); };
    $('pRespawn').onclick = () => { this.click(); app.togglePause(false); app.respawn(); };
    $('pSettings').onclick = () => { this.click(); this.openSettings(); };
    $('pQuit').onclick = () => { this.click(); app.leaveGame(); };
    $('liftBtn').onclick = () => { if (app.session && app.session.nearLift) app.session.startLift(); };
    $('resLobby').onclick = () => { this.click(); app.leaveGame(); };
    $('resAgain').onclick = () => { this.click(); this.again(); };
    this.view = 'play';
  }
  click() { this.app.sound.unlock(); this.app.sound.sfx('click'); }
  refreshTouch() { if (this.app.state === 'game') $('touch').classList.add('on'); $('keysHelp').classList.remove('on'); }

  // ---------- lobby ----------
  renderAll() {
    $('meName').textContent = this.app.ME.name; $('careerPts').textContent = fmtNum(this.app.save.career);
    this.renderPlay(); this.renderParty(); this.renderLocker(); this.renderChallenges();
    this.setView(this.view);
  }
  setView(v) {
    this.view = this.app.view = v;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.view === v));
    document.querySelectorAll('.view').forEach(e => e.classList.toggle('on', e.id === 'v-' + v));
    if (v === 'challenges') this.renderChallenges();
    if (v === 'party') this.renderParty();
  }
  renderPlay() {
    const app = this.app, m = MODES.find(x => x.id === app.save.mode.id) || MODES[0], o = app.save.mode;
    $('mcName').textContent = m.name; $('mcDesc').textContent = m.desc;
    let opt = '';
    if (m.id === 'free' || m.id === 'mpfree') opt = `<i data-ic="map"></i>Start at ${esc((DROPS.find(d => d.id === o.drop) || DROPS[0]).name)}`;
    if (m.id === 'tricks') opt = `<i data-ic="flip"></i>${esc((TRICK_SPOTS.find(d => d.id === o.spot) || TRICK_SPOTS[0]).name)}`;
    if (m.id === 'time') opt = `<i data-ic="flag"></i>${esc((COURSES[o.course] || COURSES.peak).name)}`;
    $('mcOpt').innerHTML = opt; fillIcons($('mcOpt'));
    document.querySelectorAll('#gearT button').forEach(b => b.classList.toggle('on', b.dataset.g === app.settings.gear));
    // the big button: play alone, start the party, or say you are ready
    const net = app.net, btn = $('playBtn');
    btn.disabled = false;
    if (net.inParty && !net.leader) btn.innerHTML = app.ME.ready ? 'Ready!<small>waiting for the leader</small>' : 'Ready up<small>the leader starts the game</small>';
    else if (net.inParty && net.list().length > 1) {
      const others = net.list().filter(p => p.id !== app.ME.id), ready = others.filter(p => p.ready).length;
      btn.innerHTML = ready === others.length ? 'Start<small>everyone is ready</small>' : `Start<small>${ready} of ${others.length} ready</small>`;
      btn.disabled = ready !== others.length;
    } else btn.textContent = 'Play';
  }
  play() {
    const app = this.app, net = app.net;
    app.sound.unlock(); app.sound.sfx('select');
    if (net.inParty && !net.leader) { app.ME.ready = !app.ME.ready; net.updateProfile(); app.sound.sfx(app.ME.ready ? 'ready' : 'click'); this.renderPlay(); this.renderParty(); return; }
    if (net.inParty) { app.partyGo(); return; }
    const mode = app.save.mode.id;
    if (mode === 'mpfree') { app.toast('Make or join a party first', true, 'party'); this.setView('party'); return; }
    app.startSession(mode, app.modeOpt());
  }
  again() {
    const app = this.app, s = app.session; if (!s) return;
    $('resModal').classList.remove('on');
    if (s.party) { if (app.net.leader) app.partyGo(); else app.toast('The party leader starts the next one'); return; }
    app.startSession(s.mode, s.opt);
  }

  // ---------- mode select ----------
  openModes() {
    const app = this.app;
    if (app.net.inParty && !app.net.leader) { app.toast('The party leader picks the mode', true, 'crown'); return; }
    this.pickMode = { ...app.save.mode };
    this.renderModes();
    $('modeModal').classList.add('on');
  }
  renderModes() {
    const app = this.app, pm = this.pickMode, inParty = app.net.inParty;
    $('modeList').innerHTML = MODES.map(m => `<button class="mode ${pm.id === m.id ? 'on' : ''}" data-m="${m.id}" ${m.mp && !inParty ? 'disabled' : ''}><i data-ic="${m.icon}"></i><h3 class="h">${m.name}</h3><p>${m.desc}${m.mp && !inParty ? '<br><b style="color:var(--yellow)">Needs a party</b>' : ''}</p></button>`).join('');
    $('modeList').querySelectorAll('.mode').forEach(b => b.onclick = () => { if (b.disabled) return; this.click(); pm.id = b.dataset.m; this.renderModes(); });
    let html = '';
    if (pm.id === 'free' || pm.id === 'mpfree') html = '<span>Start at</span>' + DROPS.map(d => `<button class="btn ${pm.drop === d.id ? 'on' : ''}" data-o="drop" data-v="${d.id}">${d.name}</button>`).join('');
    if (pm.id === 'tricks') html = '<span>Where</span>' + TRICK_SPOTS.map(d => `<button class="btn ${pm.spot === d.id ? 'on' : ''}" data-o="spot" data-v="${d.id}">${d.name}${app.save.best.tricks[d.id] ? ' · ' + fmtNum(app.save.best.tricks[d.id]) : ''}</button>`).join('');
    if (pm.id === 'time') html = '<span>Course</span>' + Object.entries(COURSES).map(([k, c]) => `<button class="btn ${pm.course === k ? 'on' : ''}" data-o="course" data-v="${k}">${c.name}${app.save.best.time[k] ? ' · ' + fmtTime(app.save.best.time[k]) : ''}</button>`).join('');
    $('modeOpts').innerHTML = html;
    $('modeOpts').querySelectorAll('[data-o]').forEach(b => b.onclick = () => { this.click(); pm[b.dataset.o] = b.dataset.v; this.renderModes(); });
    $('modeOk').onclick = () => { this.click(); this.setMode(pm.id, pm); $('modeModal').classList.remove('on'); };
    fillIcons($('modeList'));
  }
  setMode(id, opt = {}, fromLeader) {
    const app = this.app, m = app.save.mode;
    m.id = id === 'mpfree' && !app.net.inParty ? 'free' : id;
    for (const k of ['drop', 'spot', 'course']) if (opt[k]) m[k] = opt[k];
    storeSave(app.save); this.renderPlay();
    if (!fromLeader && app.net.inParty && app.net.leader) app.net.send({ t: 'mode', mode: m.id, opt: app.modeOpt() });
  }

  // ---------- locker ----------
  renderLocker() {
    const app = this.app, cats = [{ k: 'presets', name: 'Outfits' }, ...SLOTS];
    $('lockCats').innerHTML = cats.map(c => `<button class="cat ${this.cat === c.k ? 'on' : ''}" data-c="${c.k}">${c.name}<i style="background:${this.swatchColor(c)}"></i></button>`).join('');
    $('lockCats').querySelectorAll('.cat').forEach(b => b.onclick = () => { this.click(); this.cat = b.dataset.c; this.renderLocker(); });
    const o = app.save.outfit;
    if (this.cat === 'presets') {
      $('liTitle').textContent = 'Outfits';
      $('liGrid').innerHTML = PRESETS.map(p => { const on = Object.entries(p.o).every(([k, v]) => o[k] === v); const s = SLOTS.find(x => x.k === 'jacket').list.find(j => j.id === p.o.jacket), pa = SLOTS[1].list.find(j => j.id === p.o.pants), h = SLOTS[2].list.find(j => j.id === p.o.helmet);
        return `<button class="item ${on ? 'on' : ''}" data-p="${p.id}"><div class="sw" style="background:linear-gradient(180deg, ${h.c} 0 22%, ${s.a} 22% 62%, ${pa.c} 62%)"></div>${p.name}</button>`; }).join('');
      $('liGrid').querySelectorAll('[data-p]').forEach(b => b.onclick = () => { this.click(); app.setOutfit(PRESETS.find(p => p.id === b.dataset.p).o); this.renderLocker(); });
      return;
    }
    const slot = SLOTS.find(s => s.k === this.cat);
    $('liTitle').textContent = slot.name;
    $('liGrid').innerHTML = slot.list.map(it => `<button class="item ${o[slot.k] === it.id ? 'on' : ''}" data-i="${it.id}"><div class="sw" style="background:${this.itemBg(it)}"></div>${it.name}</button>`).join('');
    $('liGrid').querySelectorAll('[data-i]').forEach(b => b.onclick = () => {
      this.click(); app.setOutfit({ [slot.k]: b.dataset.i });
      // looking at a board or skis: put them on
      if (slot.k === 'board' && app.settings.gear !== 'board') app.setGear('board');
      if (slot.k === 'skis' && app.settings.gear !== 'skis') app.setGear('skis');
      this.renderLocker(); this.renderPlay();
    });
  }
  itemBg(it) {
    if (it.a && it.pat) return `linear-gradient(115deg, ${it.a} 0 45%, ${it.b} 45% 70%, ${it.c} 70%)`;
    if (it.a) return `linear-gradient(180deg, ${it.a} 0 70%, ${it.b} 70%)`;
    if (it.f) return `radial-gradient(circle at 50% 50%, ${it.c} 0 45%, ${it.f} 46%)`;
    return it.c;
  }
  swatchColor(c) { if (c.k === 'presets') return 'linear-gradient(135deg,#3ee6ff,#ffd84a)'; const it = find(c.list, this.app.save.outfit[c.k]); return it.a || it.c; }

  // ---------- party ----------
  renderParty() {
    const app = this.app, net = app.net, inP = net.inParty, list = inP ? net.list() : [];
    // the small card on the Play tab
    $('pmCode').textContent = inP ? net.code : '';
    $('pmList').innerHTML = inP ? list.map((m, i) => this.memRow(m, i)).join('') : `<div class="mem"><span class="dot" style="background:${COLORS[0]}"></span><b>${esc(app.ME.name)}</b><span class="tag">You</span></div>`;
    $('pmBtns').style.display = inP ? 'none' : 'flex';
    fillIcons($('pmList'));
    // the Party tab
    const box = $('partyBox');
    if (!inP) {
      box.innerHTML = `<h2 class="h">Party</h2><p class="sub">Ride together over the internet on computers and iPads. Up to 8 riders.</p>
        <button class="btn yellow" id="pCreate" style="width:100%;font-size:30px"><i data-ic="party"></i>Create party</button>
        <div class="or">OR JOIN A FRIEND</div>
        <div class="codeIn"><input id="codeInput" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="K7PX9Q"><button class="btn cyan" id="pJoin">Join party</button></div>
        <div class="err" id="pErr"></div>`;
      $('pCreate').onclick = () => { this.click(); this.createParty(); };
      $('pJoin').onclick = () => { this.click(); this.joinParty($('codeInput').value); };
      $('codeInput').onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') this.joinParty($('codeInput').value); };
      $('codeInput').oninput = e => { const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); if (v !== e.target.value) e.target.value = v; };
    } else {
      const lead = net.leader, others = list.filter(p => p.id !== app.ME.id), ready = others.filter(p => p.ready).length;
      const mode = MODES.find(x => x.id === app.save.mode.id) || MODES[0];
      box.innerHTML = `<h2 class="h">Your party</h2><p class="sub">Share the code. Your friends press PARTY, then JOIN PARTY, and type it in.</p>
        <div class="bigcode"><b>${net.code}</b><button class="iconbtn" id="pCopy" title="Copy"><i data-ic="copy"></i></button></div>
        <div>${list.map((m, i) => this.memRow(m, i)).join('')}</div>
        <p class="sub" style="margin-top:12px">Mode: <b style="color:#fff">${mode.id === 'free' ? 'Multiplayer Free Ride' : mode.name}</b>${lead ? ' · you pick it on the Play tab' : ' · the leader picks it'}</p>
        <div class="row">${lead ? `<button class="btn yellow" id="pGo" ${ready !== others.length ? 'disabled' : ''}>${others.length ? `Start (${ready}/${others.length} ready)` : 'Start'}</button>` : `<button class="btn ${app.ME.ready ? 'on' : 'yellow'}" id="pReady"><i data-ic="ready"></i>${app.ME.ready ? 'Ready!' : 'Ready up'}</button>`}<button class="btn" id="pLeave">Leave party</button></div>`;
      $('pCopy').onclick = () => { this.click(); try { navigator.clipboard.writeText(net.code); app.toast('Code copied: ' + net.code, false, 'copy'); } catch (e) { app.toast('The code is ' + net.code); } };
      if (lead) $('pGo').onclick = () => { this.click(); app.partyGo(); };
      else $('pReady').onclick = () => { app.ME.ready = !app.ME.ready; net.updateProfile(); app.sound.sfx(app.ME.ready ? 'ready' : 'click'); this.renderParty(); this.renderPlay(); };
      $('pLeave').onclick = () => { this.click(); net.leave(); app.ME.ready = false; app.toast('You left the party', false, 'party'); app.syncLobbyMates(); this.renderParty(); this.renderPlay(); };
    }
    fillIcons(box);
    this.renderPlay();
  }
  memRow(m, i) {
    const me = m.id === this.app.ME.id;
    return `<div class="mem"><span class="dot" style="background:${COLORS[i % COLORS.length]}"></span><b>${esc(m.name)}${me ? ' (you)' : ''}</b>${m.leader ? '<span class="tag lead"><i data-ic="crown"></i>Leader</span>' : m.ready ? '<span class="tag ok"><i data-ic="check"></i>Ready</span>' : '<span class="tag">Not ready</span>'}</div>`;
  }
  async createParty() {
    const app = this.app;
    try { const code = await app.net.create(); app.toast('Party created! The code is ' + code, false, 'party'); app.sound.sfx('ready'); }
    catch (e) { app.toast(e.message, true); const el = $('pErr'); if (el) el.textContent = e.message; }
    app.syncLobbyMates(); this.renderParty();
  }
  async joinParty(code) {
    const app = this.app, el = $('pErr');
    if (el) el.textContent = 'Joining…';
    try { await app.net.join(code); if ($('pErr')) $('pErr').textContent = ''; app.toast('You joined the party!', false, 'party'); app.sound.sfx('ready'); this.setView('party'); }
    catch (e) { if ($('pErr')) $('pErr').textContent = e.message; else app.toast(e.message, true); app.sound.sfx('error'); }
    app.syncLobbyMates(); this.renderParty();
  }

  // ---------- challenges ----------
  renderChallenges() {
    const list = challengeState(this.app.save);
    $('chals').innerHTML = list.map(c => `<div class="chal ${c.done ? 'done' : ''}"><b>${c.done ? '<i data-ic="check"></i>' : '<i data-ic="trophy"></i>'}${c.name}</b><div class="bar"><i style="width:${Math.round(c.v / c.goal * 100)}%"></i></div><small>${fmtNum(c.v)} / ${fmtNum(c.goal)}</small></div>`).join('');
    fillIcons($('chals'));
  }

  // ---------- settings ----------
  openSettings(tab) { if (tab) this.setTab = tab; this.renderSettings(); $('setModal').classList.add('on'); }
  renderSettings() {
    const app = this.app, s = app.settings, T = this.setTab;
    document.querySelectorAll('#setTabs .btn').forEach(b => { b.classList.toggle('on', b.dataset.st === T); b.onclick = () => { this.click(); this.setTab = b.dataset.st; this.renderSettings(); }; });
    const seg = (key, opts) => `<div class="seg" data-k="${key}">${opts.map(([v, l]) => `<button data-v="${v}" class="${String(s[key]) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    const range = (key, a, b, st) => `<input type="range" data-k="${key}" min="${a}" max="${b}" step="${st}" value="${s[key]}">`;
    const row = (t, sub, c) => `<div class="srow"><span>${t}<small>${sub}</small></span>${c}</div>`;
    let h = '';
    if (T === 'gameplay') h = row('Landing Assist', 'Gently helps you reach a nearby slope and land straight. OFF, LOW, MEDIUM or HIGH.', seg('assist', ASSIST.map((n, i) => [i, n])))
      + row('Default equipment', 'What you ride when you start.', seg('gear', [['board', 'Snowboard'], ['skis', 'Skis']]));
    if (T === 'controls') h = row('Show keyboard controls', 'A small help box while riding.', seg('showKeys', [[true, 'On'], [false, 'Off']]))
      + row('Touch control size', 'For iPads and phones.', range('touchSize', 0.7, 1.4, 0.05))
      + row('Touch control opacity', 'How see-through the buttons are.', range('touchOpacity', 0.3, 1, 0.05))
      + row('Camera sensitivity', 'Dragging to look around.', range('sens', 0.4, 2, 0.1));
    if (T === 'graphics') h = row('Graphics', 'Low is best for iPads. Changing it restarts the page.', seg('quality', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra']]));
    if (T === 'audio') h = row('Music volume', 'The lobby music.', range('music', 0, 1, 0.05)) + row('Sound effects volume', 'Snow, wind, jumps and menus.', range('sfx', 0, 1, 0.05));
    if (T === 'display') {
      const fsOk = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
      h = (fsOk ? row('Fullscreen', 'Fill the whole screen.', `<button class="btn" id="fsBtn"><i data-ic="full"></i>${document.fullscreenElement || document.webkitFullscreenElement ? 'Exit' : 'Go'} fullscreen</button>`) : row('Fullscreen', 'Not supported by this browser. On an iPad: Share, then Add to Home Screen.', ''))
        + row('Resolution', 'Fewer pixels = smoother on slow devices.', seg('res', [[0.5, '50%'], [0.75, '75%'], [1, '100%']]));
    }
    $('setBody').innerHTML = h; fillIcons($('setBody'));
    $('setBody').querySelectorAll('.seg').forEach(g => g.querySelectorAll('button').forEach(b => b.onclick = () => {
      this.click();
      const k = g.dataset.k; let v = b.dataset.v;
      if (k === 'assist') v = +v; if (k === 'res') v = +v; if (k === 'showKeys') v = v === 'true';
      if (k === 'gear') { app.setGear(v); this.renderPlay(); }
      else if (k === 'quality') {
        if (v === s.quality) return;
        s.quality = v; saveSettings(s);
        if (app.state === 'lobby' && !app.net.inParty) { app.toast('Changing the graphics…', false, 'gear'); setTimeout(() => location.reload(), 400); }
        else app.toast('The new graphics start the next time you open the game', false, 'gear');
      } else s[k] = v;
      if (k === 'res') app.applyRes();
      app.applySettings(); this.renderSettings();
    }));
    $('setBody').querySelectorAll('input[type=range]').forEach(r => r.oninput = () => { s[r.dataset.k] = +r.value; app.applySettings(); });
    const fs = $('fsBtn');
    if (fs) fs.onclick = () => {
      const d = document, el = d.documentElement;
      if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
      else (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
      setTimeout(() => this.renderSettings(), 300);
    };
  }

  // ---------- pause and results ----------
  renderPause() {
    const s = this.app.session, free = s && (s.mode === 'free' || s.mode === 'mpfree');
    $('pRespawn').innerHTML = s && s.mode === 'time' ? `${ICON.restart}<span>Restart the run</span>` : `${ICON.restart}<span>Back to start</span>`;
    $('pDropBox').style.display = free ? 'block' : 'none';
    $('pDrops').innerHTML = DROPS.map(d => `<button class="btn" data-d="${d.id}">${d.name}</button>`).join('');
    $('pDrops').querySelectorAll('[data-d]').forEach(b => b.onclick = () => { this.click(); this.app.togglePause(false); this.app.session.dropAt(b.dataset.d); });
  }
  results(r) {
    this.res = r;
    $('resTitle').textContent = r.title; $('resBig').textContent = r.big; $('resSub').textContent = r.sub;
    this.refreshResults();
    $('resAgain').style.display = r.party && !this.app.net.leader ? 'none' : '';
    $('resModal').classList.add('on');
    this.app.input.reset();
  }
  refreshResults() {
    const r = this.res; if (!r || !$('resModal')) return;
    let rows = r.rows.slice();
    const app = this.app, s = app.session;
    if (r.party && s) {
      if (s.mode === 'time') {
        const times = Object.entries(app.partyTimes || {}).sort((a, b) => a[1].ms - b[1].ms);
        rows = times.map(([id, t], i) => [`${i + 1}. ${t.n}${id === app.ME.id ? ' (you)' : ''}`, fmtTime(t.ms)]);
        const still = [...app.remotes.map.values()].filter(o => !(app.partyTimes || {})[o.id]).map(o => [o.name, 'still riding']);
        rows = rows.concat(still);
      } else {
        const all = [[app.ME.name + ' (you)', s.score], ...[...app.remotes.map.values()].map(o => [o.name, o.score])].sort((a, b) => b[1] - a[1]);
        rows = all.map(([n, v], i) => [`${i + 1}. ${n}`, fmtNum(v)]);
      }
    }
    $('resTable').innerHTML = rows.map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join('');
  }

  // ---------- the HUD while riding ----------
  hud(dt) {
    const app = this.app, r = app.ctrl, s = app.session;
    $('spd').textContent = Math.round(r.speed * 3.6);
    $('score').textContent = fmtNum(s ? s.score : 0);
    if (s) {
      const inf = s.info();
      $('modeInfo').innerHTML = (inf.big ? esc(inf.big) : '') + `<small>${esc(inf.small)}</small>`;
      // arrow to the next gate
      const ga = $('gateArrow');
      if (inf.target) {
        const c = app.camera, fx = Math.sin(app.cam.yaw), fz = Math.cos(app.cam.yaw), dx = inf.target.x - r.p.x, dz = inf.target.z - r.p.z;
        const ang = Math.atan2(dx * -fz + dz * fx, dx * fx + dz * fz);
        ga.style.transform = `rotate(${ang}rad)`; ga.classList.add('on');
      } else ga.classList.remove('on');
      $('prompt').classList.toggle('on', !!s.nearLift);
    }
    // tricks in the air
    const air = !r.grounded && r.state !== 'bail';
    const tEl = $('trick');
    if (air && r.tricks.blockedT > 0) {
      $('tName').textContent = r.tricks.blockedF < 0 ? 'No backflip now' : 'No frontflip now';
      $('tChain').textContent = r.tricks.blockedF < 0 ? 'You already flipped forwards in this jump' : 'You already flipped backwards in this jump';
      $('tPts').innerHTML = ''; tEl.classList.add('on');
    } else if (air) {
      const c = r.tricks.current();
      const name = c.liveName || (c.names.length ? c.names[c.names.length - 1] : '');
      if (name) {
        $('tName').textContent = name;
        $('tChain').textContent = c.names.length > 1 ? c.names.join('  +  ') : '';
        $('tPts').innerHTML = c.points ? `${fmtNum(c.points)}<em>x${c.mult.toFixed(1)}</em>` : '';
        tEl.classList.add('on');
      } else tEl.classList.remove('on');
    } else tEl.classList.remove('on');
    // jump charge
    const ch = r.charging ? r.charge : 0;
    $('charge').classList.toggle('on', ch > 0.02); $('charge').firstElementChild.style.width = Math.round(ch * 100) + '%';
    $('act').style.setProperty('--ch', ch);
    // party riders
    if (s && s.party) {
      const list = [...app.remotes.map.values()];
      const key = list.map(o => o.name + o.score).join('|');
      if (key !== this.othersKey) { this.othersKey = key; $('others').innerHTML = list.map(o => `<div><i style="background:${o.color}"></i>${esc(o.name)} <b>${fmtNum(o.score)}</b></div>`).join(''); }
    } else if (this.othersKey) { this.othersKey = ''; $('others').innerHTML = ''; }
  }
}
