/*
 * Buttcraft multiplayer without a server.
 *
 * Buttcraft was built to talk to a small relay server over a WebSocket
 * ("npm start"). GitHub Pages cannot run that server, so this file gives the
 * game a drop-in replacement for its connection class: the host's browser acts
 * as the relay, and friends connect straight to it over WebRTC using PeerJS
 * (free public signalling at 0.peerjs.com).
 *
 * game.js calls window.__bcNet(OriginalClass) once and uses whatever it
 * returns. If a custom server address is set in Multiplayer settings, the
 * original WebSocket class is still used.
 */
(function () {
  var PREFIX = 'b10games-buttcraft-';
  var CHUNK = 15000;            // characters per WebRTC message
  var PEER_OPTS = { debug: 1 };

  function rid() {
    return 's' + Array.from(crypto.getRandomValues(new Uint8Array(6)), function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }
  function playerIdentity() {
    try {
      var p = JSON.parse(localStorage.getItem('buttcraft.player.v1'));
      if (p && p.id) return p;
    } catch (e) {}
    return { id: rid(), name: 'Player' + (1000 + Math.floor(Math.random() * 9000)) };
  }

  // ---------- framing: JSON over WebRTC, split into chunks when large ----------
  var seq = 0;
  function sendTo(conn, obj) {
    if (!conn || !conn.open) return false;
    var s = JSON.stringify(obj);
    try {
      if (s.length <= CHUNK) { conn.send(s); return true; }
      var id = ++seq, n = Math.ceil(s.length / CHUNK);
      for (var i = 0; i < n; i++) conn.send('\u0001' + id + ':' + i + ':' + n + ':' + s.slice(i * CHUNK, (i + 1) * CHUNK));
      return true;
    } catch (e) { return false; }
  }
  function decoder() {
    var parts = {};
    return function (raw) {
      if (typeof raw !== 'string') return null;
      if (raw.charCodeAt(0) === 1) {
        var a = raw.indexOf(':'), b = raw.indexOf(':', a + 1), c = raw.indexOf(':', b + 1);
        var id = raw.slice(1, a), i = +raw.slice(a + 1, b), n = +raw.slice(b + 1, c);
        var p = parts[id] || (parts[id] = { got: 0, list: new Array(n) });
        if (p.list[i] == null) { p.list[i] = raw.slice(c + 1); p.got++; }
        if (p.got < n) return null;
        delete parts[id];
        raw = p.list.join('');
      }
      try { return JSON.parse(raw); } catch (e) { return null; }
    };
  }
  function bufferedOf(conn) { return (conn && conn.dataChannel && conn.dataChannel.bufferedAmount) || 0; }

  // ---------- the connection class the game uses ----------
  function P2PConn() {
    this.url = 'p2p';
    this.sid = null;
    this.handlers = new Map();
    this.open = false;
    this.closedReason = null;
    this.onclose = null;
    this.peer = null;
    this.conn = null;       // client: connection to the host
    this.hub = null;        // host: the shared relay for this world
    this.retired = false;   // host: replaced by a newer request for the same world
    this.isHost = false;
    this.ended = false;
  }

  P2PConn.prototype.connect = function () {
    if (typeof window.Peer !== 'function') return Promise.reject(new Error('Multiplayer could not load - check your internet connection'));
    this.sid = rid();
    this.open = true;
    return Promise.resolve(this);
  };
  P2PConn.prototype.on = function (t, f) {
    var h = this.handlers;
    if (!h.has(t)) h.set(t, new Set());
    h.get(t).add(f);
    return function () { h.get(t).delete(f); };
  };
  P2PConn.prototype.once = function (types, ms) {
    var self = this;
    return new Promise(function (resolve, reject) {
      var offs = [];
      var timer = setTimeout(function () { offs.forEach(function (o) { o(); }); reject(new Error('Timed out - please try again')); }, ms || 15000);
      types.forEach(function (t) {
        offs.push(self.on(t, function (m) { clearTimeout(timer); offs.forEach(function (o) { o(); }); resolve(m); }));
      });
    });
  };
  P2PConn.prototype.emit = function (m) {
    var h = this.handlers.get(m.t);
    if (!h) return;
    [].concat(Array.from(h)).forEach(function (f) { try { f(m); } catch (e) { console.error('net handler', m.t, e); } });
  };
  // Replies to the game's own requests are delivered after it starts listening.
  P2PConn.prototype.later = function (m) { var self = this; setTimeout(function () { self.emit(m); }, 0); };

  P2PConn.prototype.sendRaw = function (m) {
    switch (m.t) {
      case 'hello': return true;
      case 'claim':
        this.later({ t: 'claimed', worlds: (m.worlds || []).map(function (w) { return { code: w.code, token: w.token }; }) });
        return true;
      case 'release': this.later({ t: 'released' }); return true;
      case 'status': this.status(m.codes || []); return true;
      case 'host': this.host(m); return true;
      case 'join': this.join(String(m.code || '')); return true;
      case 'msg':
        if (this.isHost) return !this.retired && this.hub.route(this.sid, m.to, m.d);
        return sendTo(this.conn, { t: 'msg', to: m.to, d: m.d });
      case 'unhost': if (this.isHost && !this.retired) this.hub.shutdown('stopped'); return true;
      case 'leave': if (this.conn) sendTo(this.conn, { t: 'leave' }); return true;
    }
    return false;
  };
  P2PConn.prototype.to = function (t, d) { return this.sendRaw({ t: 'msg', to: t, d: d }); };
  Object.defineProperty(P2PConn.prototype, 'buffered', {
    get: function () {
      if (this.conn) return bufferedOf(this.conn);
      var max = 0;
      if (this.hub) this.hub.members.forEach(function (m) { max = Math.max(max, bufferedOf(m.conn)); });
      return max;
    }
  });
  P2PConn.prototype.close = function (reason) {
    if (this.ended) return;
    this.closedReason = reason || 'closed';
    this.ended = true;
    this.open = false;
    if (this.isHost) {
      if (!this.retired) this.hub.shutdown(reason === 'stopped' ? 'stopped' : 'host-left');
      return;
    }
    var peer = this.peer, conn = this.conn;
    setTimeout(function () {
      try { conn && conn.close(); } catch (e) {}
      try { peer && peer.destroy(); } catch (e) {}
    }, 200);
  };

  // ---------- hosting: this browser is the relay ----------
  // The game can ask to open the same world twice at once (automatically and
  // from the menu). Both requests share one Hub per world code; the newest
  // request becomes its owner and receives the events.
  var HUBS = {};

  P2PConn.prototype.host = function (m) {
    var self = this, hub = HUBS[m.code];
    if (!hub || hub.dead) { hub = HUBS[m.code] = new Hub(m.code, m.name); hub.start(); }
    if (hub.owner && hub.owner !== this) hub.owner.retired = true;
    hub.owner = this;
    this.hub = hub;
    this.isHost = true;
    this.sid = hub.sid;
    var reply = function (err) {
      if (err) self.emit({ t: 'hostError', error: err });
      else self.emit({ t: 'hosted', code: m.code, token: m.token });
    };
    if (hub.ready) setTimeout(function () { reply(null); }, 0);
    else hub.waiters.push(reply);
  };

  function Hub(code, name) {
    this.code = code;
    this.name = name;
    this.sid = rid();
    this.members = new Map();   // sid -> { conn, player }
    this.owner = null;
    this.peer = null;
    this.ready = false;
    this.dead = false;
    this.waiters = [];
  }

  Hub.prototype.start = function () {
    var hub = this, tries = 0;
    (function attempt() {
      var peer = new window.Peer(PREFIX + hub.code, PEER_OPTS), opened = false;
      hub.peer = peer;
      peer.on('open', function () {
        opened = true;
        hub.ready = true;
        var w = hub.waiters; hub.waiters = [];
        w.forEach(function (f) { f(null); });
      });
      peer.on('error', function (err) {
        if (opened) { console.warn('Buttcraft multiplayer:', err && err.type, err); return; }
        try { peer.destroy(); } catch (e) {}
        // After a reload the old page can hold the code for a few seconds.
        if (err && err.type === 'unavailable-id' && ++tries < 6 && !hub.dead) { setTimeout(attempt, 2000); return; }
        hub.dead = true;
        if (HUBS[hub.code] === hub) delete HUBS[hub.code];
        var w = hub.waiters; hub.waiters = [];
        w.forEach(function (f) { f(err && err.type === 'unavailable-id' ? 'taken' : 'error'); });
      });
      // Stay reachable for new friends if the signalling link drops.
      peer.on('disconnected', function () { if (!hub.dead) setTimeout(function () { try { peer.reconnect(); } catch (e) {} }, 1000); });
      peer.on('connection', function (conn) { hub.accept(conn); });
    })();
  };

  Hub.prototype.emit = function (m) { if (this.owner && !this.dead) this.owner.emit(m); };

  Hub.prototype.accept = function (conn) {
    var hub = this, sid = null, decode = decoder();
    conn.on('data', function (raw) {
      var m = decode(raw);
      if (!m || hub.dead) return;
      if (m.t === 'probe') {
        sendTo(conn, { t: 'probeReply', players: hub.members.size + 1, name: hub.name });
        return;
      }
      if (m.t === 'join') {
        if (sid) return;
        if (hub.members.size >= 15) { sendTo(conn, { t: 'joinError', error: 'full' }); return; }
        sid = m.sid || rid();
        var player = m.player || {};
        hub.members.forEach(function (o) { sendTo(o.conn, { t: 'peerJoin', sid: sid, player: player }); });
        hub.members.set(sid, { conn: conn, player: player });
        sendTo(conn, { t: 'joining', name: hub.name, hostSid: hub.sid });
        hub.emit({ t: 'peerJoin', sid: sid, player: player });
        return;
      }
      if (!sid) return;
      if (m.t === 'msg') hub.route(sid, m.to, m.d);
      else if (m.t === 'leave') hub.drop(sid, 'left');
    });
    conn.on('close', function () { if (sid) hub.drop(sid, 'left'); });
    conn.on('error', function () { if (sid) hub.drop(sid, 'lost'); });
  };

  Hub.prototype.drop = function (sid, reason) {
    if (!this.members.has(sid)) return;
    var m = this.members.get(sid);
    this.members.delete(sid);
    try { m.conn.close(); } catch (e) {}
    this.members.forEach(function (o) { sendTo(o.conn, { t: 'peerLeave', sid: sid, reason: reason }); });
    this.emit({ t: 'peerLeave', sid: sid, reason: reason });
  };

  // Deliver a game message from one player to another, to the host or to everyone.
  Hub.prototype.route = function (from, to, d) {
    var hub = this, msg = { t: 'msg', from: from, d: d };
    if (to === 'all') {
      if (from !== hub.sid) hub.emit(msg);
      hub.members.forEach(function (o, s) { if (s !== from) sendTo(o.conn, msg); });
      return true;
    }
    if (to === 'host' || to === hub.sid) {
      if (from !== hub.sid) hub.emit(msg);
      return true;
    }
    var target = hub.members.get(to);
    return target ? sendTo(target.conn, msg) : false;
  };

  Hub.prototype.shutdown = function (reason) {
    if (this.dead) return;
    this.dead = true;
    if (HUBS[this.code] === this) delete HUBS[this.code];
    var members = this.members, peer = this.peer;
    members.forEach(function (o) { sendTo(o.conn, { t: 'closed', reason: reason }); });
    setTimeout(function () {
      members.forEach(function (o) { try { o.conn.close(); } catch (e) {} });
      try { peer && peer.destroy(); } catch (e) {}
    }, 300);
  };

  // ---------- joining a friend's world ----------
  P2PConn.prototype.join = function (code) {
    var self = this, settled = false;
    if (!/^\d{5}$/.test(code)) { this.later({ t: 'joinError', error: 'invalid' }); return; }
    var fail = function (error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      self.emit({ t: 'joinError', error: error });
      try { peer.destroy(); } catch (e) {}
    };
    var timer = setTimeout(function () { fail('offline'); }, 12000);
    var peer = new window.Peer(PEER_OPTS);
    this.peer = peer;
    peer.on('open', function () {
      var conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'raw' });
      var decode = decoder();
      self.conn = conn;
      conn.on('open', function () { sendTo(conn, { t: 'join', sid: self.sid, player: playerIdentity(), code: code }); });
      conn.on('data', function (raw) {
        var m = decode(raw);
        if (!m) return;
        if (m.t === 'joining') { settled = true; clearTimeout(timer); }
        if (m.t === 'joinError') { fail(m.error); return; }
        self.emit(m);
      });
      var gone = function () {
        if (!settled) { fail('offline'); return; }
        if (self.ended) return;
        self.ended = true;
        self.open = false;
        if (self.onclose) self.onclose(self.closedReason || 'connection-lost');
      };
      conn.on('close', gone);
      conn.on('error', gone);
    });
    peer.on('error', function (err) {
      if (!settled) fail(err && err.type === 'peer-unavailable' ? 'offline' : 'offline');
      else console.warn('Buttcraft multiplayer:', err && err.type, err);
    });
  };

  // ---------- "Status: Online · 2 players" in the server list ----------
  P2PConn.prototype.status = function (codes) {
    var self = this, servers = {}, left = codes.length;
    if (!left) { this.later({ t: 'status', servers: servers }); return; }
    var peer = new window.Peer(PEER_OPTS), finishers = {};
    var finishAll = function () { self.emit({ t: 'status', servers: servers }); setTimeout(function () { try { peer.destroy(); } catch (e) {} }, 200); };
    codes.forEach(function (code) {
      var done = false;
      finishers[code] = function (info) {
        if (done) return;
        done = true;
        servers[code] = info;
        if (--left === 0) finishAll();
      };
      setTimeout(function () { finishers[code]({ exists: true, online: false, players: 0 }); }, 3800);
    });
    peer.on('open', function () {
      codes.forEach(function (code) {
        var c = peer.connect(PREFIX + code, { reliable: true, serialization: 'raw' }), decode = decoder();
        c.on('open', function () { sendTo(c, { t: 'probe' }); });
        c.on('data', function (raw) {
          var m = decode(raw);
          if (m && m.t === 'probeReply') { finishers[code]({ exists: true, online: true, players: m.players }); try { c.close(); } catch (e) {} }
        });
      });
    });
    peer.on('error', function (err) {
      var hit = err && err.type === 'peer-unavailable' && /(\d{5})\s*$/.exec(String(err.message || ''));
      if (hit && finishers[hit[1]]) finishers[hit[1]]({ exists: true, online: false, players: 0 });
    });
  };

  // ---------- hook used by game.js ----------
  window.__bcNet = function (WsConn) {
    return function Conn(url) {
      var own = (location.protocol === 'https:' ? 'wss' : 'ws') + '://' + location.host + '/mp';
      if (url && url !== own) return new WsConn(url); // a real Buttcraft server address was set
      return new P2PConn();
    };
  };
})();
