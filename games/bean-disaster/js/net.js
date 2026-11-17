// Parties for Bean Disaster, over WebRTC (PeerJS finds the other players over the internet).
// The party leader's browser is the hub (the "server"): it runs the rounds, the disasters and the bots,
// and passes every player's messages on to the others. Codes are 6 easy-to-read letters and numbers,
// like K7PX9Q. Up to 10 players; you can join at any time and wait in the lobby for the next round.
const PREFIX = 'b10games-beandis-';
const MAX_MEMBERS = 10;
const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';     // no I, O, 0 or 1: they look too much alike
export function cleanCode(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
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
      if (typeof window.Peer !== 'function') { reject(new Error('Multiplayer could not load. Check your internet connection.')); return; }
      this.leave(true);
      const tryCode = (left) => {
        let code = ''; for (let i = 0; i < 6; i++) code += ABC[Math.floor(Math.random() * ABC.length)];
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
            else reject(new Error('Could not make a party (' + err.type + ')'));
          } else console.warn('party', err.type);
        });
        peer.on('disconnected', () => { if (this.peer === peer) setTimeout(() => { try { peer.reconnect(); } catch (e) {} }, 1000); });
        peer.on('connection', c => this.accept(c));
      };
      tryCode(5);
    });
  }
  profile() { return { id: this.me.id, name: this.me.name, outfit: this.me.outfit, gear: this.me.gear, ready: !!this.me.ready }; }

  accept(conn) {
    let id = null;
    conn.on('data', m => {
      if (!m || typeof m !== 'object') return;
      if (m.t === 'hello' && !id) {
        if (this.members.size >= MAX_MEMBERS) { conn.send({ t: 'deny', why: 'full' }); setTimeout(() => conn.close(), 400); return; }
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
      m.from = id;
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
      code = cleanCode(code);
      if (!/^[A-Z0-9]{6}$/.test(code)) { reject(new Error('A party code has 6 letters and numbers, like K7PX9Q.')); return; }
      if (typeof window.Peer !== 'function') { reject(new Error('Multiplayer could not load. Check your internet connection.')); return; }
      if (this.code === code) { reject(new Error('You are already in that party.')); return; }
      this.leave(true);
      const peer = new window.Peer(OPTS);
      let settled = false;
      const fail = (msg) => { if (settled) return; settled = true; clearTimeout(timer); try { peer.destroy(); } catch (e) {} reject(new Error(msg)); };
      const timer = setTimeout(() => fail('There is no party with the code ' + code + '.'), 12000);
      peer.on('open', () => {
        const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
        conn.on('open', () => conn.send({ t: 'hello', p: this.profile() }));
        conn.on('data', m => {
          if (!m || typeof m !== 'object') return;
          if (m.t === 'deny') { fail('The party is full (max ' + MAX_MEMBERS + ' players).'); return; }
          if (m.t === 'welcome') {
            settled = true; clearTimeout(timer);
            this.peer = peer; this.conn = conn; this.code = code; this.leader = false; this.leaderId = m.leader;
            this.members.clear(); m.members.forEach(p => this.members.set(p.id, p));
            this.startPing(); this.emit('roster'); resolve(code);
            return;
          }
          if (m.t === 'pong') { const now = performance.now(), rtt = now - m.c; if (rtt < this.bestRtt * 1.5) { this.bestRtt = Math.min(this.bestRtt, rtt); this.offset = m.h + rtt / 2 - now; } return; }
          if (m.t === 'roster') { this.members.clear(); m.members.forEach(p => this.members.set(p.id, p)); this.emit('roster'); return; }
          if (m.t === 'end') { this.ended('The party leader closed the party.'); return; }
          if (m.t === 'kick') { this.ended('You were removed from the party.'); return; }
          this.emit('msg', m, m.from || this.leaderId);
        });
        conn.on('close', () => { if (!settled) fail('There is no party with the code ' + code + '.'); else if (this.conn === conn) this.ended('The party is gone. The leader left.'); });
      });
      peer.on('error', err => {
        if (!settled) fail(err.type === 'peer-unavailable' ? 'There is no party with the code ' + code + '.' : 'Could not connect (' + err.type + ').');
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
