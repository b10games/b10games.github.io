/*
 * B10GAMES accounts: name + password, profile skin, friends and cloud saves.
 *
 * Loaded on every page (front page and all games). The front page also loads
 * account-ui.js, which draws the account button and menu.
 *
 * Storage is textdb.dev, a free key/value text store with no sign-up. Anyone
 * who knows a key can read and write it, so every key is a hash that cannot be
 * guessed from outside:
 *   <ns>-p-<id>   public profile    { name, skin, created }      (is the name taken?)
 *   <ns>-o-<id>   who is online     { name, skin, g, party, at } (friends read this)
 *   <ns>-i-<id>   friend requests   [ { from, at } ]
 *   <ns>-d-<dk>   private account   { name, skin, friends, saves, rev, at }
 *   id = sha256("b10games|" + name), dk = sha256("b10games|data|" + name + "|" + password)
 * Only someone who knows the password can find the private account.
 *
 * Saves: the games keep their progress in localStorage. Every entry except the
 * site's own ("b10-...") is copied to the account and back again, so progress
 * follows the account to other devices and survives cleared browser data.
 *
 * Online games: a page that opens a party (PeerJS id "b10games-<game>-<5 digits>")
 * or joins one is noticed here, and the party code goes into "who is online", so
 * friends can press Join and land in the same party (?join=<code>).
 */
(function () {
  if (window.B10Account) return;

  var API = 'https://textdb.dev/api/data/';
  // Local testing must never touch the real accounts.
  var NS = location.hostname === 'b10games.github.io' ? 'b10g' : 'b10gdev';
  var ACCT = 'b10-acct', BASE = 'b10-acct-base';
  var GAME = (location.pathname.match(/\/games\/([^/]+)/) || [])[1] || '';
  var ONLINE_MS = 100000;     // seen in the last 100 s = online
  var MAX_VALUE = 150000;     // skip giant entries (worlds live in IndexedDB anyway)

  var GAMES = {
    'crown-clash': 'Crown Clash',
    'beans-tower-defense': 'Beans Tower Defense',
    'bean-of-legends': 'Bean of Legends',
    'wobble-dash': 'Wobble Dash',
    'apex-horizon': 'Apex Horizon',
    'block-storm': 'Block Storm',
    'super-snake': 'Super Snake',
    'b10-words': 'B10 Words',
    'matas-surfers': 'Matas Surfers',
    'buttcraft': 'Buttcraft',
    'buttcraft-low-quality': 'Buttcraft Low Quality Version',
    'turbo-royale': 'Turbo Royale',
    'yellow-circle-clicker': 'Yellow Circle Clicker'
  };
  // Games where friends can play together with a party code.
  var PARTY = { 'b10games-wobble-': 'wobble-dash', 'b10games-apex-party-': 'apex-horizon', 'b10games-buttcraft-': 'buttcraft', 'b10games-btd-': 'beans-tower-defense' };

  // ---------- small helpers ----------
  function read(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function write(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function keys(a, b) { var o = {}, k; for (k in a) o[k] = 1; for (k in b) o[k] = 1; return Object.keys(o); }
  function same(a, b) { return keys(a, b).every(function (k) { return a[k] === b[k]; }); }
  function lower(s) { return String(s).toLowerCase(); }

  function sha(s) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)).then(function (b) {
      return Array.prototype.map.call(new Uint8Array(b), function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join('');
    });
  }
  var idCache = {};
  function idOf(name) {
    var n = lower(name);
    return idCache[n] || (idCache[n] = sha('b10games|' + n).then(function (h) { return h.slice(0, 32); }));
  }

  // GET: the stored object, or null when nothing is stored. Rejects when offline.
  function get(key) {
    return fetch(API + NS + '-' + key, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('net');
      return r.text();
    }).then(function (t) {
      if (!t) return null;
      try { return JSON.parse(t); } catch (e) { return null; }
    });
  }
  // POST as text/plain: a "simple" request, so no CORS preflight and keepalive works.
  function put(key, obj, keep) {
    var body = obj === '' ? '' : JSON.stringify(obj);
    return fetch(API + NS + '-' + key, {
      method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: body,
      keepalive: !!keep && body.length < 60000
    }).then(function (r) { if (!r.ok) throw new Error('net'); });
  }

  // ---------- events ----------
  var handlers = [];
  function emit(what) { handlers.forEach(function (f) { try { f(what); } catch (e) {} }); }

  // ---------- state ----------
  var acct = read(ACCT);                 // { name, id, dk, skin, friends, rev } or null
  if (acct && (!acct.id || !acct.dk)) acct = null;
  var base = read(BASE) || {};           // the saves as they were at the last sync
  var metaDirty = false;                 // skin or friends changed here, not uploaded yet
  var ready = false;                     // first download done: uploads are allowed
  var busy = null;
  var status = acct ? 'syncing' : 'out'; // 'ok' | 'syncing' | 'offline' | 'out'
  var lastSync = 0;

  function persist() { write(ACCT, acct); write(BASE, acct ? base : null); }
  function setStatus(s) { if (status !== s) { status = s; emit('status'); } }

  function snapshot() {
    var o = {};
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k || k.indexOf('b10-') === 0) continue;
        var v = localStorage.getItem(k);
        if (v != null && v.length <= MAX_VALUE) o[k] = v;
      }
    } catch (e) {}
    return o;
  }

  // Merge this browser's saves with the account's: entries changed here since
  // the last sync win, everything else comes from the account.
  function sync(first) {
    if (!acct) return Promise.resolve();
    if (busy) return busy;
    setStatus('syncing');
    var me = acct;
    busy = get('d-' + me.dk).then(function (remote) {
      if (acct !== me) return;
      remote = remote || { saves: {}, rev: 0 };
      var rs = remote.saves || {}, cur = snapshot(), mine = {};
      keys(cur, base).forEach(function (k) { if (cur[k] !== base[k]) mine[k] = 1; });
      // Opening a page after the account was played somewhere else: the account wins,
      // so a game that saved its old state while loading cannot undo newer progress.
      var remoteWins = first && (remote.rev | 0) > (me.rev | 0);
      function keepMine(k) { return mine[k] && !(remoteWins && (k in rs || k in base)); }
      var merged = {};
      for (var k in rs) merged[k] = rs[k];
      Object.keys(mine).forEach(function (k) { if (!keepMine(k)) return; if (k in cur) merged[k] = cur[k]; else delete merged[k]; });

      // Progress made on another device comes into this browser.
      var applied = false;
      keys(merged, cur).forEach(function (k) {
        if (keepMine(k) || merged[k] === cur[k]) return;
        try { if (k in merged) localStorage.setItem(k, merged[k]); else localStorage.removeItem(k); applied = true; } catch (e) {}
      });

      if (!metaDirty) {
        if (remote.name) me.name = remote.name;
        if (typeof remote.skin === 'number') me.skin = remote.skin;
        if (Array.isArray(remote.friends)) me.friends = remote.friends;
      }
      var upload = metaDirty || !remote.rev || !same(merged, rs);
      var done = function (rev) {
        me.rev = rev; base = merged; persist();
        lastSync = Date.now(); setStatus('ok'); emit('change');
        // A game already read its old save: start it again with the new one (once).
        if (first && applied && GAME) {
          var t = 0; try { t = +sessionStorage.getItem('b10-acct-reload') || 0; } catch (e) {}
          if (Date.now() - t > 30000) {
            try { sessionStorage.setItem('b10-acct-reload', String(Date.now())); } catch (e) {}
            location.reload();
          }
        }
      };
      if (!upload) return done(remote.rev | 0);
      var rev = (remote.rev | 0) + 1, wasDirty = metaDirty;
      metaDirty = false;
      return put('d-' + me.dk, { name: me.name, skin: me.skin, friends: me.friends, saves: merged, rev: rev, at: Date.now() })
        .then(function () { done(rev); }, function (e) { if (wasDirty) metaDirty = true; throw e; });
    }).catch(function () { setStatus('offline'); })
      .then(function () { busy = null; ready = true; });
    return busy;
  }

  // Leaving the page: send what changed without waiting for an answer.
  function flush() {
    if (!acct || !ready) return;
    var cur = snapshot();
    if (!metaDirty && same(cur, base)) return;
    var merged = {}, k;
    for (k in base) merged[k] = base[k];
    keys(cur, base).forEach(function (k) { if (cur[k] !== base[k]) { if (k in cur) merged[k] = cur[k]; else delete merged[k]; } });
    acct.rev = (acct.rev | 0) + 1;
    put('d-' + acct.dk, { name: acct.name, skin: acct.skin, friends: acct.friends, saves: merged, rev: acct.rev, at: Date.now() }, true).catch(function () {});
    base = merged; metaDirty = false; persist();
  }

  // ---------- who is online ----------
  var party = null;   // party code this page is in, if any
  function beat(force) {
    // A tab in the background stops counting as online, unless something just happened.
    if (!acct || (document.hidden && force !== true)) return;
    put('o-' + acct.id, { name: acct.name, skin: acct.skin, g: GAME, party: party, at: Date.now() }).catch(function () {});
  }

  // Notice PeerJS parties without touching the games: wrap Peer's events.
  function hookPeer() {
    var P = window.Peer;
    if (typeof P !== 'function' || !P.prototype || P.prototype.__b10) return;
    var proto = P.prototype, oEmit = proto.emit, oConnect = proto.connect, oDestroy = proto.destroy;
    proto.__b10 = true;
    function codeOf(id) {
      for (var pre in PARTY) if (typeof id === 'string' && id.indexOf(pre) === 0 && /^\d{5}$/.test(id.slice(pre.length))) return id.slice(pre.length);
      return null;
    }
    function setParty(peer, code) { peer.__b10party = code; if (party !== code) { party = code; beat(true); } }
    if (oEmit) proto.emit = function (ev, a) {
      try {
        if (ev === 'open' && codeOf(a)) setParty(this, codeOf(a));                       // hosting a party
        if ((ev === 'close' || ev === 'disconnected') && this.__b10party && party === this.__b10party) setParty(this, null);
      } catch (e) {}
      return oEmit.apply(this, arguments);
    };
    if (oConnect) proto.connect = function (id) {
      var conn = oConnect.apply(this, arguments), peer = this, code = codeOf(id);
      try {
        if (code && conn && conn.on) {
          // Joined a party (a connection that stays open; quick status checks do not count).
          conn.on('open', function () { setTimeout(function () { if (conn.open) setParty(peer, code); }, 2500); });
          conn.on('close', function () { if (party === code) setParty(peer, null); });
        }
      } catch (e) {}
      return conn;
    };
    if (oDestroy) proto.destroy = function () {
      try { if (this.__b10party && party === this.__b10party) setParty(this, null); } catch (e) {}
      return oDestroy.apply(this, arguments);
    };
  }

  // ---------- account actions ----------
  function cleanName(name) { return String(name || '').replace(/\s+/g, ' ').trim(); }
  function checkName(name) {
    if (name.length < 2) return 'Dit navn skal være mindst 2 tegn.';
    if (name.length > 16) return 'Dit navn må højst være 16 tegn.';
    if (!/^[0-9A-Za-zÆØÅæøåÄÖÜäöüé _.-]+$/.test(name)) return 'Brug kun bogstaver, tal, mellemrum, - og _ i dit navn.';
    return null;
  }
  function netError() { return new Error('Kunne ikke forbinde. Tjek din internetforbindelse og prøv igen.'); }

  function login(name, password) {
    name = cleanName(name);
    var bad = checkName(name);
    if (bad) return Promise.reject(new Error(bad));
    if (String(password || '').length < 4) return Promise.reject(new Error('Din adgangskode skal være mindst 4 tegn.'));
    var id, dk;
    return Promise.all([idOf(name), sha('b10games|data|' + lower(name) + '|' + password)]).then(function (h) {
      id = h[0]; dk = h[1].slice(0, 40);
      return get('p-' + id).catch(function () { throw netError(); });
    }).then(function (prof) {
      if (prof) {
        // The name exists: the password decides if this is you.
        return get('d-' + dk).catch(function () { throw netError(); }).then(function (data) {
          if (!data) throw new Error('Forkert adgangskode. Eller også er navnet "' + (prof.name || name) + '" allerede taget af en anden.');
          var saves = data.saves || {};
          // Logging in on this device: the account's progress wins.
          Object.keys(saves).forEach(function (k) { try { localStorage.setItem(k, saves[k]); } catch (e) {} });
          acct = { name: data.name || prof.name || name, id: id, dk: dk, skin: data.skin | 0, friends: data.friends || [], rev: data.rev | 0 };
          base = saves; metaDirty = false; persist();
          return { created: false };
        });
      }
      // A new account. This device's progress becomes the account's progress.
      acct = { name: name, id: id, dk: dk, skin: 0, friends: [], rev: 0 };
      base = {}; metaDirty = true;
      return put('p-' + id, { name: name, skin: 0, created: Date.now() }).catch(function () { acct = null; throw netError(); })
        .then(function () { persist(); return { created: true }; });
    }).then(function (res) {
      ready = true; emit('change');
      return sync().then(function () { beat(true); return res; });
    });
  }

  function logout() {
    flush();
    acct = null; base = {}; ready = false; metaDirty = false;
    persist(); setStatus('out'); emit('change');
  }

  // Delete the account for good: profile, friends, online saves and friend requests.
  // The games on this device keep their progress.
  function deleteAccount() {
    if (!acct) return Promise.resolve();
    var me = acct;
    return Promise.all(['d-' + me.dk, 'p-' + me.id, 'o-' + me.id, 'i-' + me.id].map(function (k) { return put(k, ''); }))
      .catch(function () { throw netError(); })
      .then(function () {
        if (acct !== me) return;
        acct = null; base = {}; ready = false; metaDirty = false;
        persist(); setStatus('out'); emit('change');
      });
  }

  function setSkin(n) {
    if (!acct) return;
    acct.skin = n | 0; metaDirty = true; persist(); emit('change');
    // Friends see the new picture on the profile and in "who is online".
    put('p-' + acct.id, { name: acct.name, skin: acct.skin }).catch(function () {});
    beat(true); sync();
  }

  function isFriend(name) { return !!acct && acct.friends.some(function (f) { return lower(f) === lower(name); }); }

  function addFriend(name) {
    if (!acct) return Promise.reject(new Error('Lav en account først.'));
    name = cleanName(name);
    if (!name) return Promise.reject(new Error('Skriv din vens navn.'));
    if (lower(name) === lower(acct.name)) return Promise.reject(new Error('Det er dit eget navn.'));
    if (isFriend(name)) return Promise.reject(new Error(name + ' er allerede din ven.'));
    var id, me = acct;
    return idOf(name).then(function (h) { id = h; return get('p-' + id).catch(function () { throw netError(); }); }).then(function (prof) {
      if (!prof) { var e = new Error('Der findes ingen account med navnet "' + name + '".'); e.gone = true; throw e; }
      if (acct !== me) return null;
      me.friends = me.friends.concat([prof.name || name]);
      metaDirty = true; persist(); emit('change'); sync();
      // Let them know, so they can add you back with one click.
      get('i-' + id).catch(function () { return null; }).then(function (list) {
        list = Array.isArray(list) ? list : [];
        if (list.some(function (r) { return r && lower(r.from) === lower(me.name); })) return;
        list.push({ from: me.name, at: Date.now() });
        return put('i-' + id, list.slice(-30));
      }).catch(function () {});
      return prof.name || name;
    });
  }

  function removeFriend(name) {
    if (!acct) return;
    acct.friends = acct.friends.filter(function (f) { return lower(f) !== lower(name); });
    metaDirty = true; persist(); emit('change'); sync();
  }

  // Friend requests: people who added you and are not your friends yet.
  function requests() {
    if (!acct) return Promise.resolve([]);
    return get('i-' + acct.id).then(function (list) {
      return (Array.isArray(list) ? list : []).filter(function (r) { return r && r.from && !isFriend(r.from); });
    });
  }
  function dropRequest(name) {
    if (!acct) return Promise.resolve();
    var id = acct.id;
    return get('i-' + id).then(function (list) {
      list = (Array.isArray(list) ? list : []).filter(function (r) { return r && lower(r.from) !== lower(name); });
      return put('i-' + id, list);
    }).catch(function () {});
  }
  function acceptRequest(name) {
    return addFriend(name).catch(function (e) {
      if (e.gone) { dropRequest(name); throw e; }
      if (!isFriend(name)) throw e;
    }).then(function () { return dropRequest(name); });
  }

  // Where are my friends? [{ name, skin, online, game, gameName, party, at }]
  function friends() {
    if (!acct) return Promise.resolve([]);
    var now = Date.now();
    return Promise.all(acct.friends.map(function (name) {
      return idOf(name).then(function (id) { return get('o-' + id); }).then(function (p) {
        p = p || {};
        var online = !!p.at && now - p.at < ONLINE_MS && now - p.at > -ONLINE_MS;
        return { name: name, skin: p.skin | 0, online: online, game: online ? p.g || '' : '', gameName: online ? GAMES[p.g] || '' : '', party: online ? p.party || null : null, at: p.at || 0 };
      }, function () { return { name: name, skin: 0, online: false, game: '', gameName: '', party: null, at: 0, unknown: true }; });
    }));
  }

  // The link that takes you to a friend: their party if they have one, else just the game.
  function joinUrl(f, root) {
    if (!f || !f.game || !GAMES[f.game]) return null;
    return (root || '/') + 'games/' + f.game + '/' + (f.party ? '?join=' + f.party : '');
  }

  // ---------- start ----------
  if (acct) sync(true).then(function () { beat(true); });
  // Upload changed saves every 20 s at most (leaving the page sends them at once).
  setInterval(function () {
    if (!acct || !ready || busy) return;
    if (metaDirty || (Date.now() - lastSync > 20000 && !same(snapshot(), base))) sync();
  }, 5000);
  setInterval(beat, 40000);
  setInterval(hookPeer, 1000); hookPeer();
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) flush();
    else if (acct) { beat(); if (ready && !busy) sync(); }
  });
  window.addEventListener('pagehide', flush);

  window.B10Account = {
    get user() { return acct ? { name: acct.name, skin: acct.skin, friends: acct.friends.slice() } : null; },
    get status() { return status; },
    get lastSync() { return lastSync; },
    get party() { return party; },
    games: GAMES,
    login: login, logout: logout, deleteAccount: deleteAccount, setSkin: setSkin,
    addFriend: addFriend, removeFriend: removeFriend, isFriend: isFriend,
    requests: requests, acceptRequest: acceptRequest, declineRequest: dropRequest,
    friends: friends, joinUrl: joinUrl, sync: function () { return sync(); },
    on: function (f) { handlers.push(f); }
  };
})();
