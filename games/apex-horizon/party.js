/*
 * Apex Horizon parties: drive around Bayport City together.
 *
 * "Make Party" gives you a 5-digit code. Friends press "Join Party", type the
 * code and land in your Free Drive. Cars are sent straight between browsers
 * over WebRTC (PeerJS, free public signalling) - the party maker's browser
 * passes everyone's position on to the others. No server needed.
 *
 * The game calls window.__apexParty.tick(freeDrive, dt) every frame in Free
 * Drive and leaveWorld(freeDrive) when Free Drive closes (see the patched
 * FreeDrive-*.js). window.__apexLobby is the main menu.
 */
(function () {
  var PREFIX = 'b10games-apex-party-';
  var SEND_MS = 66;        // ~15 position updates per second
  var STALE_MS = 4000;     // hide a car that has not moved for this long
  var DELAY_MS = 120;      // draw others slightly in the past for smooth motion
  var MAX_PLAYERS = 8;
  var PEER_OPTS = { debug: 1 };

  var me = { id: rid() };
  var P = null;            // the current party
  var curFD = null;        // Free Drive we are drawing into
  var enteredAt = 0, placed = false, lastSend = 0;

  function rid() { return 'p' + Math.random().toString(36).slice(2, 10); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function r2(n) { return Math.round(n * 100) / 100; }
  function r4(n) { return Math.round(n * 10000) / 10000; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  // ---------- who am I ----------
  function myProfile() {
    var L = window.__apexLobby, save = L && L.save;
    var p = { id: me.id, name: 'Driver', car: null, paint: null, ups: null };
    if (save) {
      var prof = save.profile || {};
      p.name = String(prof.name || 'Driver').slice(0, 18);
      p.car = prof.selectedCar;
      try { p.paint = save.paintFor(p.car); } catch (e) {}
      try { p.ups = save.upgradesFor(p.car); } catch (e) {}
    }
    return p;
  }
  function newMember(p, id) {
    p = p || {};
    return { id: id, name: String(p.name || 'Driver').slice(0, 18), car: p.car, paint: p.paint, ups: p.ups, buf: [], last: 0, vehicle: null, vehicleFD: null, tag: null };
  }
  function pub(m) { return { id: m.id, name: m.name, car: m.car, paint: m.paint, ups: m.ups }; }

  // ---------- messages ----------
  function toast(text, kind) {
    var box = document.querySelector('.apx-toasts');
    if (!box) { box = el('div', 'apx-toasts'); document.body.appendChild(box); }
    var t = el('div', 'toast ' + (kind || ''), esc(text));
    box.appendChild(t);
    setTimeout(function () { t.remove(); }, 3800);
  }

  // ---------- making a party (this browser passes positions on) ----------
  function makeParty() {
    if (P) return;
    if (typeof window.Peer !== 'function') { toast('Party could not load – check your internet connection', 'bad'); return; }
    var code = String(10000 + Math.floor(Math.random() * 90000));
    var peer = new window.Peer(PREFIX + code, PEER_OPTS);
    var mine = { code: code, host: true, peer: peer, conns: new Map(), members: new Map(), ready: false };
    P = mine;
    renderAll();
    peer.on('open', function () {
      if (P !== mine) return;
      mine.ready = true;
      renderAll();
      toast('Party ' + code + ' is open – tell your friends the code!', 'gold');
    });
    peer.on('error', function (err) {
      if (P !== mine) return;
      if (!mine.ready) {
        try { peer.destroy(); } catch (e) {}
        P = null;
        if (err && err.type === 'unavailable-id') { makeParty(); return; }   // code taken, pick another
        toast('Could not make a party (' + (err && err.type) + ')', 'bad');
        renderAll();
      } else console.warn('Apex party:', err && err.type, err);
    });
    peer.on('disconnected', function () { if (P === mine) setTimeout(function () { try { peer.reconnect(); } catch (e) {} }, 1000); });
    peer.on('connection', function (conn) { hostAccept(mine, conn); });
  }

  function hostAccept(party, conn) {
    var id = null;
    conn.on('data', function (m) {
      if (P !== party || !m) return;
      if (m.t === 'hello' && !id) {
        if (party.members.size + 1 >= MAX_PLAYERS) { conn.send({ t: 'full' }); setTimeout(function () { conn.close(); }, 300); return; }
        id = String((m.p && m.p.id) || rid());
        var mem = newMember(m.p, id);
        party.conns.set(id, conn);
        party.members.set(id, mem);
        var everyone = [myProfile()];
        party.members.forEach(function (x) { everyone.push(pub(x)); });
        conn.send({ t: 'welcome', code: party.code, host: me.id, members: everyone });
        broadcast({ t: 'join', p: pub(mem) }, id);
        toast(mem.name + ' joined the party', 'gold');
        renderAll();
        return;
      }
      if (!id) return;
      if (m.t === 's') { onState(id, m.d); broadcast({ t: 's', id: id, d: m.d }, id); }
      else if (m.t === 'prof') { updateProfile(id, m.p); var x = party.members.get(id); if (x) broadcast({ t: 'prof', p: pub(x) }, id); }
      else if (m.t === 'bye') dropMember(id);
    });
    conn.on('close', function () { if (id) dropMember(id); });
    conn.on('error', function () { if (id) dropMember(id); });
  }

  function broadcast(msg, except) {
    if (!P || !P.host) return;
    P.conns.forEach(function (c, id) { if (id !== except && c.open) { try { c.send(msg); } catch (e) {} } });
  }

  // ---------- joining a friend's party ----------
  function joinParty(code, done) {
    if (P) leaveParty();
    if (typeof window.Peer !== 'function') { done('Party could not load – check your internet connection'); return; }
    var peer = new window.Peer(PEER_OPTS), settled = false;
    var mine = { code: code, host: false, peer: peer, conn: null, members: new Map(), ready: false };
    P = mine;
    var fail = function (msg) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { peer.destroy(); } catch (e) {}
      if (P === mine) P = null;
      renderAll();
      done(msg);
    };
    var timer = setTimeout(function () { fail('Could not find party ' + code + '. Check the code and that your friend is still in the game.'); }, 12000);
    peer.on('open', function () {
      var conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
      mine.conn = conn;
      conn.on('open', function () { conn.send({ t: 'hello', p: myProfile() }); });
      conn.on('data', function (m) {
        if (!m) return;
        if (m.t === 'full') { fail('That party is full.'); return; }
        if (m.t === 'welcome') {
          settled = true;
          clearTimeout(timer);
          mine.ready = true;
          (m.members || []).forEach(function (p) { if (p && p.id !== me.id) mine.members.set(p.id, newMember(p, p.id)); });
          renderAll();
          done(null);
          return;
        }
        if (P !== mine) return;
        if (m.t === 's') onState(m.id, m.d);
        else if (m.t === 'join' && m.p && m.p.id !== me.id) { mine.members.set(m.p.id, newMember(m.p, m.p.id)); toast(m.p.name + ' joined the party', 'gold'); renderAll(); }
        else if (m.t === 'leave') dropMember(m.id);
        else if (m.t === 'prof' && m.p) updateProfile(m.p.id, m.p);
        else if (m.t === 'end') partyEnded('The party maker left – the party is over');
      });
      conn.on('close', function () {
        if (!settled) fail('Could not join party ' + code + '.');
        else if (P === mine) partyEnded('Lost the connection to the party');
      });
    });
    peer.on('error', function (err) {
      if (!settled) fail(err && err.type === 'peer-unavailable' ? 'No party with code ' + code + ' is open right now.' : 'Could not join (' + (err && err.type) + ')');
      else console.warn('Apex party:', err && err.type, err);
    });
  }

  // ---------- leaving ----------
  function clearCars() {
    if (!P) return;
    P.members.forEach(function (m) { removeCar(m); });
    if (curFD && curFD.minimap && !curFD.race) curFD.minimap.others = [];
  }
  function leaveParty() {
    if (!P) return;
    var party = P;
    clearCars();
    if (party.host) {
      broadcast({ t: 'end' });
    } else if (party.conn && party.conn.open) {
      try { party.conn.send({ t: 'bye' }); } catch (e) {}
    }
    P = null;
    setTimeout(function () {
      if (party.conns) party.conns.forEach(function (c) { try { c.close(); } catch (e) {} });
      try { party.conn && party.conn.close(); } catch (e) {}
      try { party.peer.destroy(); } catch (e) {}
    }, 300);
    renderAll();
  }
  function partyEnded(text) {
    if (!P) return;
    var party = P;
    clearCars();
    P = null;
    try { party.peer.destroy(); } catch (e) {}
    toast(text, 'bad');
    renderAll();
  }
  function dropMember(id) {
    if (!P || !P.members.has(id)) return;
    var m = P.members.get(id);
    removeCar(m);
    P.members.delete(id);
    if (P.host) {
      var c = P.conns.get(id);
      P.conns.delete(id);
      try { c && c.close(); } catch (e) {}
      broadcast({ t: 'leave', id: id });
    }
    toast(m.name + ' left the party');
    renderAll();
  }
  function updateProfile(id, p) {
    var m = P && P.members.get(id);
    if (!m || !p) return;
    var carChanged = m.car !== p.car || JSON.stringify(m.paint) !== JSON.stringify(p.paint);
    m.name = String(p.name || m.name).slice(0, 18);
    m.car = p.car; m.paint = p.paint; m.ups = p.ups;
    if (carChanged) removeCar(m);        // rebuilt with the new car next frame
    renderAll();
  }

  // ---------- positions ----------
  function onState(id, d) {
    var m = P && P.members.get(id);
    if (!m || !d || d.length < 10) return;
    var now = performance.now();
    m.buf.push({ t: now, d: d });
    if (m.buf.length > 5) m.buf.shift();
    m.last = now;
  }
  function blend(a, b, k) {
    var out = [];
    for (var i = 0; i < 3; i++) out.push(a[i] + (b[i] - a[i]) * k);
    var dot = a[3] * b[3] + a[4] * b[4] + a[5] * b[5] + a[6] * b[6], s = dot < 0 ? -1 : 1, len = 0, q = [];
    for (i = 3; i < 7; i++) { var v = a[i] + (b[i] * s - a[i]) * k; q.push(v); len += v * v; }
    len = Math.sqrt(len) || 1;
    q.forEach(function (v) { out.push(v / len); });
    for (i = 7; i < 10; i++) out.push(a[i] + (b[i] - a[i]) * k);
    return out;
  }
  function sample(m, now) {
    var b = m.buf, target = now - DELAY_MS;
    if (!b.length) return null;
    if (target <= b[0].t) return b[0].d;
    for (var i = 1; i < b.length; i++) {
      if (b[i].t >= target) return blend(b[i - 1].d, b[i].d, clamp((target - b[i - 1].t) / Math.max(1, b[i].t - b[i - 1].t), 0, 1));
    }
    // Ahead of the newest update: keep moving with its speed for a moment.
    var last = b[b.length - 1].d, dt = Math.min(0.25, (target - b[b.length - 1].t) / 1000), out = last.slice();
    out[0] += last[7] * dt; out[1] += last[8] * dt; out[2] += last[9] * dt;
    return out;
  }

  function ensureCar(FD, m, d) {
    if (m.vehicle && m.vehicleFD === FD) return m.vehicle;
    var def = null;
    try { def = m.car ? FD.carDef(m.car) : null; } catch (e) {}
    if (!def) def = FD.player.def;
    var ups = m.ups, paint = m.paint;
    try { if (!ups) ups = FD.game.save.upgradesFor(def.id); } catch (e) {}
    try { if (!paint) paint = FD.game.save.paintFor(def.id); } catch (e) {}
    var v = new FD.Vehicle(FD.world.physics, def, ups, paint, 'hero', { x: d[0], y: d[1], z: d[2] }, 0);
    v.body.setBodyType(2, true);   // kinematic: moved by the network, still bumps into you
    FD.drive.addVehicle(v, false);
    m.vehicle = v;
    m.vehicleFD = FD;
    return v;
  }
  function removeCar(m) {
    if (m.vehicle && m.vehicleFD && m.vehicleFD === curFD) {
      try { m.vehicleFD.drive.removeVehicle(m.vehicle); } catch (e) {}
    }
    m.vehicle = null;
    m.vehicleFD = null;
    if (m.tag) { m.tag.remove(); m.tag = null; }
  }
  function placeTag(FD, m, v) {
    var cam = FD.drive && FD.drive.camera && FD.drive.camera.camera;
    if (!cam || !v.position || !v.position.clone) return;
    if (!m.tag) { m.tag = el('div', 'apx-tag'); document.body.appendChild(m.tag); }
    m.tag.textContent = m.name;
    var p = v.position.clone();
    p.y += 2.3;
    p.project(cam);
    var on = p.z > -1 && p.z < 1 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1 && !(FD.game && FD.game.paused);
    m.tag.style.display = on ? '' : 'none';
    if (on) m.tag.style.transform = 'translate(' + ((p.x + 1) / 2 * innerWidth) + 'px,' + ((1 - p.y) / 2 * innerHeight) + 'px) translate(-50%,-100%)';
  }

  // ---------- every frame in Free Drive ----------
  function tick(FD, dt) {
    if (curFD !== FD) { curFD = FD; enteredAt = performance.now(); placed = false; }
    renderHud(FD);
    if (!P || !P.ready || !FD.player || !FD.player.body) return;
    var now = performance.now();

    if (now - lastSend >= SEND_MS) {
      lastSend = now;
      var b = FD.player.body, t = b.translation(), q = b.rotation(), v = b.linvel();
      var d = [r2(t.x), r2(t.y), r2(t.z), r4(q.x), r4(q.y), r4(q.z), r4(q.w), r2(v.x), r2(v.y), r2(v.z)];
      if (P.host) broadcast({ t: 's', id: me.id, d: d });
      else if (P.conn && P.conn.open) { try { P.conn.send({ t: 's', d: d }); } catch (e) {} }
    }

    var dots = [], first = null;
    P.members.forEach(function (m) {
      if (m.id === me.id) return;
      if (!m.last || now - m.last > STALE_MS) { if (m.vehicle) removeCar(m); return; }
      var s = sample(m, now);
      if (!s) return;
      var car = ensureCar(FD, m, s);
      car.body.setNextKinematicTranslation({ x: s[0], y: s[1], z: s[2] });
      car.body.setNextKinematicRotation({ x: s[3], y: s[4], z: s[5], w: s[6] });
      dots.push({ pos: car.position, color: '#ffd21f' });
      placeTag(FD, m, car);
      if (!first) first = s;
    });
    if (FD.minimap && !FD.race) FD.minimap.others = dots;

    // Just arrived and friends are already driving: start next to them.
    if (!placed && first && now - enteredAt < 6000) {
      placed = true;
      try { FD.teleport(first[0] + 12, first[2] + 12, 0); } catch (e) {}
    }
    if (now - enteredAt >= 6000) placed = true;
  }
  function leaveWorld(FD) {
    if (P) P.members.forEach(function (m) {
      if (m.vehicleFD === FD) {
        try { FD.drive.removeVehicle(m.vehicle); } catch (e) {}
        m.vehicle = null; m.vehicleFD = null;
      }
      if (m.tag) { m.tag.remove(); m.tag = null; }
    });
    if (curFD === FD) curFD = null;
    hud.style.display = 'none';
  }

  // ---------- menu buttons and party panel ----------
  var style = el('style');
  style.textContent = [
    '.apx-playrow{display:flex;gap:14px;align-items:stretch;justify-content:flex-end;flex-wrap:wrap}',
    '.apx-party{display:flex;flex-direction:column;gap:8px;min-width:210px;justify-content:center}',
    '.apx-party .btn{font-size:24px;padding:10px 22px;width:100%}',
    '.apx-party .btn.apx-make{background:linear-gradient(180deg,#5ee7ff,#1f9dff);color:#04122b;box-shadow:0 5px #0b5fa8}',
    '.apx-party .btn.small{font-size:17px;padding:7px 16px}',
    '.apx-card{background:var(--panel,#0a0e1ee6);border:1px solid var(--line,#8caaff2e);border-radius:12px;padding:10px 14px;text-align:center}',
    '.apx-card .k{font-size:11px;font-weight:800;letter-spacing:.14em;opacity:.7}',
    '.apx-card .code{font-family:var(--font-display,inherit);font-size:44px;line-height:1;letter-spacing:.08em;color:#5ee7ff}',
    '.apx-card .who{font-size:12px;font-weight:700;opacity:.85;margin-top:4px;line-height:1.4}',
    '.apx-hud{position:fixed;top:82px;left:16px;z-index:40;pointer-events:none;background:#0a0e1ecc;border:1px solid #8caaff33;border-radius:10px;padding:8px 12px;font-weight:800;font-size:13px;color:#fff;display:none}',
    '.apx-hud b{color:#5ee7ff;font-size:18px;letter-spacing:.06em}',
    '.apx-tag{position:fixed;left:0;top:0;z-index:30;pointer-events:none;background:#0a0e1ecc;color:#ffd21f;font-weight:800;font-size:13px;padding:3px 8px;border-radius:6px;white-space:nowrap}',
    '.apx-toasts{position:fixed;top:120px;left:50%;transform:translate(-50%);display:flex;flex-direction:column;gap:8px;align-items:center;z-index:60;pointer-events:none}',
    '.apx-modal{position:fixed;inset:0;z-index:70;background:#000a;display:grid;place-items:center}',
    '.apx-modal .box{background:var(--panel-solid,#0e1428);border:1px solid var(--line,#8caaff2e);border-radius:16px;padding:24px;width:min(360px,90vw);text-align:center;color:#fff}',
    '.apx-modal h3{font-family:var(--font-display,inherit);font-size:34px;margin:0 0 6px;text-transform:uppercase}',
    '.apx-modal input{width:100%;box-sizing:border-box;font-family:var(--font-display,inherit);font-size:40px;letter-spacing:.2em;text-align:center;padding:8px;border-radius:10px;border:1px solid #8caaff55;background:#070a16;color:#fff;margin:10px 0}',
    '.apx-modal .err{color:#ff5d73;font-weight:700;font-size:14px;min-height:20px}',
    '.apx-modal .row{display:flex;gap:10px;margin-top:8px}',
    '.apx-modal .btn{flex:1;font-size:22px;padding:10px}'
  ].join('\n');
  document.head.appendChild(style);

  var hud = el('div', 'apx-hud');
  document.body.appendChild(hud);
  var box = null;

  function memberNames() {
    var names = ['You'];
    if (P) P.members.forEach(function (m) { names.push(m.name); });
    return names;
  }
  function renderLobby() {
    if (!box) return;
    box.innerHTML = '';
    if (!P) {
      var make = el('button', 'btn apx-make', '<span>Make Party</span>');
      var join = el('button', 'btn ghost small', '<span>Join Party</span>');
      make.onclick = function () { makeParty(); };
      join.onclick = openJoin;
      box.append(make, join);
      return;
    }
    var card = el('div', 'apx-card');
    if (!P.ready) card.innerHTML = '<div class="k">PARTY</div><div class="who">Connecting…</div>';
    else card.innerHTML = '<div class="k">' + (P.host ? 'YOUR PARTY CODE' : 'IN PARTY') + '</div><div class="code">' + esc(P.code) + '</div>' +
      '<div class="who">' + memberNames().map(esc).join(' · ') + '</div>';
    var leave = el('button', 'btn ghost small', '<span>Leave Party</span>');
    leave.onclick = function () { leaveParty(); };
    box.append(card, leave);
  }
  function renderHud(FD) {
    if (!P || !P.ready || FD.race) { hud.style.display = 'none'; return; }
    var html = 'PARTY <b>' + esc(P.code) + '</b> · ' + (P.members.size + 1) + ' driver' + (P.members.size ? 's' : '');
    if (hud.__html !== html) { hud.innerHTML = html; hud.__html = html; }
    hud.style.display = '';
  }
  function renderAll() {
    renderLobby();
    if (!P) hud.style.display = 'none';
  }

  function openJoin() {
    var modal = el('div', 'apx-modal');
    modal.innerHTML = '<div class="box"><h3>Join Party</h3><div style="opacity:.8;font-size:14px;font-weight:600">Type your friend\'s 5-digit party code</div>' +
      '<input inputmode="numeric" maxlength="5" placeholder="12345" autocomplete="off"><div class="err"></div>' +
      '<div class="row"><button class="btn ghost" data-x>Cancel</button><button class="btn primary" data-go>Join</button></div></div>';
    document.body.appendChild(modal);
    var input = modal.querySelector('input'), err = modal.querySelector('.err'), go = modal.querySelector('[data-go]');
    var close = function () { modal.remove(); };
    input.focus();
    input.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Enter') go.click(); if (e.key === 'Escape') close(); });
    input.addEventListener('input', function () { input.value = input.value.replace(/\D/g, '').slice(0, 5); });
    modal.querySelector('[data-x]').onclick = close;
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
    go.onclick = function () {
      var code = input.value.trim();
      if (!/^\d{5}$/.test(code)) { err.textContent = 'Party codes are exactly 5 digits'; return; }
      go.disabled = true;
      err.textContent = '';
      go.innerHTML = '<span>Joining…</span>';
      joinParty(code, function (problem) {
        if (problem) { go.disabled = false; go.innerHTML = '<span>Join</span>'; err.textContent = problem; return; }
        close();
        toast('You joined party ' + code + '!', 'good');
        // Drop straight into Free Drive with your friends.
        var L = window.__apexLobby;
        if (!curFD && L && L.handlers && L.handlers.freeDrive) L.handlers.freeDrive();
      });
    };
  }

  // Put the party buttons next to PLAY whenever the main menu is on screen.
  setInterval(function () {
    var right = document.querySelector('.lobby-right');
    var play = right && right.querySelector('.play-btn');
    if (!play) return;
    if (box && right.contains(box)) return;
    var row = el('div', 'apx-playrow');
    box = el('div', 'apx-party');
    play.parentNode.insertBefore(row, play);
    row.append(box, play);
    renderLobby();
  }, 400);

  // Tell the others when you pick another car or paint in the garage.
  var lastProf = '';
  setInterval(function () {
    if (!P || !P.ready) return;
    var p = myProfile(), key = JSON.stringify([p.name, p.car, p.paint, p.ups]);
    if (key === lastProf) return;
    var first = !lastProf;
    lastProf = key;
    if (first) return;
    if (P.host) broadcast({ t: 'prof', p: p });
    else if (P.conn && P.conn.open) { try { P.conn.send({ t: 'prof', p: p }); } catch (e) {} }
  }, 1500);

  window.addEventListener('beforeunload', function () { if (P) leaveParty(); });

  window.__apexParty = { tick: tick, leaveWorld: leaveWorld, make: makeParty, join: joinParty, leave: leaveParty, get party() { return P; } };
})();
