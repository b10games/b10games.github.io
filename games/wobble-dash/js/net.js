// Real parties between different players, over WebRTC (PeerJS for finding each other).
// The party leader's browser is the hub: it keeps the member list, runs the match and
// passes every player's position on to the others. Codes are exactly 5 digits.
const PREFIX = 'b10games-wobble-';
const MAX_MEMBERS = 8;
const OPTS = { debug: 1 };

export class Net {
  constructor(me) {
    this.me = me;                 // { id, name, skin, level }
    this.peer = null; this.code = null; this.leader = false; this.leaderId = null;
    this.members = new Map();     // id -> profile (includes yourself)
    this.conns = new Map();       // leader: id -> connection
    this.conn = null;             // member: connection to the leader
    this.handlers = {};
    this.offset = 0; this.bestRtt = 1e9; this.pingTimer = null; this.inMatch = false;
  }
  on(t, f) { (this.handlers[t] = this.handlers[t] || []).push(f); }
  emit(t, ...a) { (this.handlers[t] || []).forEach(f => { try { f(...a); } catch (e) { console.error('net', t, e); } }); }
  get inParty() { return !!this.code && (this.leader || (this.conn && this.conn.open)); }
  now() { return performance.now() + (this.leader || !this.code ? 0 : this.offset); }
  list() { return [...this.members.values()]; }

  // ---------- create ----------
  create() {
    return new Promise((resolve, reject) => {
      if (typeof window.Peer !== 'function') { reject(new Error('Multiplayer kunne ikke indlæses – tjek din internetforbindelse')); return; }
      this.leave(true);
      const tryCode = (left) => {
        const code = String(10000 + Math.floor(Math.random() * 90000));
        const peer = new window.Peer(PREFIX + code, OPTS);
        let done = false;
        peer.on('open', () => {
          if (done) return; done = true;
          this.peer = peer; this.code = code; this.leader = true; this.leaderId = this.me.id;
          this.members.clear(); this.members.set(this.me.id, { ...this.profile(), leader: true });
          this.emit('roster'); resolve(code);
        });
        peer.on('error', err => {
          if (!done) {
            done = true; try { peer.destroy(); } catch (e) {}
            if (err.type === 'unavailable-id' && left > 0) tryCode(left - 1);
            else reject(new Error('Kunne ikke oprette et party (' + err.type + ')'));
          } else console.warn('party', err.type);
        });
        peer.on('disconnected', () => { if (this.peer === peer) setTimeout(() => { try { peer.reconnect(); } catch (e) {} }, 1000); });
        peer.on('connection', c => this.accept(c));
      };
      tryCode(5);
    });
  }
  profile() { return { id: this.me.id, name: this.me.name, skin: this.me.skin, level: this.me.level }; }

  accept(conn) {
    let id = null;
    conn.on('data', m => {
      if (!m || typeof m !== 'object') return;
      if (m.t === 'hello' && !id) {
        if (this.members.size >= MAX_MEMBERS) { conn.send({ t: 'deny', why: 'full' }); setTimeout(() => conn.close(), 400); return; }
        if (this.inMatch) { conn.send({ t: 'deny', why: 'match' }); setTimeout(() => conn.close(), 400); return; }
        id = String(m.p.id);
        this.conns.set(id, conn);
        this.members.set(id, { ...m.p, leader: false });
        conn.send({ t: 'welcome', code: this.code, leader: this.me.id, members: this.list() });
        this.sendAll({ t: 'roster', members: this.list() }, id);
        this.emit('roster'); this.emit('joined', this.members.get(id));
        return;
      }
      if (!id) return;
      if (m.t === 'ping') { conn.send({ t: 'pong', c: m.c, h: performance.now() }); return; }
      if (m.t === 'prof') { this.members.set(id, { ...m.p, leader: false }); this.sendAll({ t: 'roster', members: this.list() }); this.emit('roster'); return; }
      if (m.t === 'bye') { this.drop(id); return; }
      if (m.r) this.sendAll(m, id);          // relay to everyone else
      this.emit('msg', m, id);
    });
    conn.on('close', () => { if (id) this.drop(id); });
    conn.on('error', () => { if (id) this.drop(id); });
  }
  drop(id) {
    if (!this.members.has(id)) return;
    const p = this.members.get(id);
    this.members.delete(id);
    const c = this.conns.get(id); this.conns.delete(id);
    try { c && c.close(); } catch (e) {}
    this.sendAll({ t: 'roster', members: this.list() });
    this.emit('roster'); this.emit('left', p);
  }

  // ---------- join ----------
  join(code) {
    return new Promise((resolve, reject) => {
      code = String(code || '').trim();
      if (!/^\d{5}$/.test(code)) { reject(new Error('Koden er forkert – en partykode er præcis 5 tal.')); return; }
      if (typeof window.Peer !== 'function') { reject(new Error('Multiplayer kunne ikke indlæses – tjek din internetforbindelse')); return; }
      if (this.code === code) { reject(new Error('Du er allerede i det party.')); return; }
      this.leave(true);
      const peer = new window.Peer(OPTS);
      let settled = false;
      const fail = (msg) => { if (settled) return; settled = true; clearTimeout(timer); try { peer.destroy(); } catch (e) {} reject(new Error(msg)); };
      const timer = setTimeout(() => fail('Der findes ikke noget party med koden ' + code + '.'), 12000);
      peer.on('open', () => {
        const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
        conn.on('open', () => conn.send({ t: 'hello', p: this.profile() }));
        conn.on('data', m => {
          if (!m || typeof m !== 'object') return;
          if (m.t === 'deny') { fail(m.why === 'full' ? 'Partyet er fuldt (max ' + MAX_MEMBERS + ' spillere).' : 'Partyet er midt i en kamp – prøv igen om lidt.'); return; }
          if (m.t === 'welcome') {
            settled = true; clearTimeout(timer);
            this.peer = peer; this.conn = conn; this.code = code; this.leader = false; this.leaderId = m.leader;
            this.members.clear(); m.members.forEach(p => this.members.set(p.id, p));
            this.startPing(); this.emit('roster'); resolve(code);
            return;
          }
          if (m.t === 'pong') { const now = performance.now(), rtt = now - m.c; if (rtt < this.bestRtt * 1.5) { this.bestRtt = Math.min(this.bestRtt, rtt); this.offset = m.h + rtt / 2 - now; } return; }
          if (m.t === 'roster') { this.members.clear(); m.members.forEach(p => this.members.set(p.id, p)); this.emit('roster'); return; }
          if (m.t === 'end') { this.ended('Partyets leder har lukket partyet.'); return; }
          if (m.t === 'kick') { this.ended('Du blev fjernet fra partyet.'); return; }
          this.emit('msg', m, m.from || this.leaderId);
        });
        conn.on('close', () => { if (!settled) fail('Der findes ikke noget party med koden ' + code + '.'); else if (this.conn === conn) this.ended('Partyet findes ikke længere – lederen er gået.'); });
      });
      peer.on('error', err => {
        if (!settled) fail(err.type === 'peer-unavailable' ? 'Der findes ikke noget party med koden ' + code + '.' : 'Kunne ikke forbinde (' + err.type + ').');
        else console.warn('party', err.type);
      });
    });
  }
  startPing() {
    clearInterval(this.pingTimer); this.bestRtt = 1e9;
    const ping = () => { if (this.conn && this.conn.open) this.conn.send({ t: 'ping', c: performance.now() }); };
    for (let i = 0; i < 5; i++) setTimeout(ping, i * 150);
    this.pingTimer = setInterval(ping, 4000);
  }
  ended(why) {
    const was = this.code;
    this.reset();
    if (was) this.emit('ended', why);
  }
  reset() {
    clearInterval(this.pingTimer);
    const peer = this.peer;
    this.peer = null; this.conn = null; this.code = null; this.leader = false; this.leaderId = null; this.inMatch = false;
    this.conns.clear(); this.members.clear();
    setTimeout(() => { try { peer && peer.destroy(); } catch (e) {} }, 300);
    this.emit('roster');
  }
  leave(silent) {
    if (!this.code) return;
    if (this.leader) this.sendAll({ t: 'end' });
    else if (this.conn && this.conn.open) { try { this.conn.send({ t: 'bye' }); } catch (e) {} }
    this.reset();
    if (!silent) this.emit('left-self');
  }
  kick(id) { if (!this.leader) return; const c = this.conns.get(id); if (c) { try { c.send({ t: 'kick' }); } catch (e) {} } setTimeout(() => this.drop(id), 200); }

  // ---------- messages ----------
  sendAll(m, except) { if (!this.leader) return; this.conns.forEach((c, id) => { if (id !== except && c.open) { try { c.send(m); } catch (e) {} } }); }
  // Leader: to all members. Member: to the leader, who passes it on when r = 1.
  send(m) {
    if (!this.code) return;
    if (this.leader) this.sendAll(m);
    else if (this.conn && this.conn.open) { try { this.conn.send(m); } catch (e) {} }
  }
  sendTo(id, m) { const c = this.conns.get(id); if (c && c.open) { try { c.send(m); } catch (e) {} } }
  updateProfile() {
    if (!this.code) return;
    if (this.leader) { this.members.set(this.me.id, { ...this.profile(), leader: true }); this.sendAll({ t: 'roster', members: this.list() }); this.emit('roster'); }
    else if (this.conn && this.conn.open) this.conn.send({ t: 'prof', p: this.profile() });
  }
}
