// The tower defense itself: waves of balloons and bosses walking the path, beans that find targets and attack,
// projectiles, popping layers into smaller balloons, farms, money, lives, upgrades and selling. Fixed time step.
import { THREE, canvasTex } from './engine.js';
import { BALLOONS, BEAN, FARM, TARGETS, beanStats, priceOf, upgradePrice, skinFor, rbe, makeWave, waveBonus, waveInfo, waveScale, bossHpScale, bossChildren, farmIncome, UP_COST } from './data.js';
import { TowerBean, FarmModel } from './bean.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3();
const CELL = 4, GW = 30, GH = 20;          // spatial grid for quick "which balloons are near here?"
const SELL_BACK = 0.7, FARM_DROPS = 4;
const RAINBOW = ['#ff4d5e', '#ffd23f', '#36c46b', '#3a8bff', '#9b5de5'];
const col = (b) => b.def.color === 'rainbow' ? RAINBOW[b.id % 5] : b.def.color;

// shared projectile looks
const GEO = {
  dart: (() => { const g = new THREE.ConeGeometry(0.09, 0.7, 6); g.rotateX(Math.PI / 2); return g; })(),
  fin: (() => { const g = new THREE.BoxGeometry(0.3, 0.02, 0.18); g.translate(0, 0, -0.32); return g; })(),
  star: (() => { const s = new THREE.Shape(); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, r = i % 2 ? 0.12 : 0.36; s[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } const g = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: false }); g.rotateX(Math.PI / 2); g.center(); return g; })(),
  tack: (() => { const g = new THREE.ConeGeometry(0.07, 0.45, 5); g.rotateX(Math.PI / 2); return g; })(),
  boom: (() => { const s = new THREE.Shape(); s.moveTo(-0.7, 0.15); s.quadraticCurveTo(0, 0.9, 0.7, 0.15); s.lineTo(0.55, -0.05); s.quadraticCurveTo(0, 0.55, -0.55, -0.05); s.closePath(); const g = new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: false }); g.rotateX(Math.PI / 2); g.center(); return g; })(),
  bomb: new THREE.SphereGeometry(0.32, 14, 10), ball: new THREE.SphereGeometry(0.28, 14, 10),
  ice: new THREE.OctahedronGeometry(0.3), glue: new THREE.IcosahedronGeometry(0.28, 1), magic: new THREE.OctahedronGeometry(0.26),
  glow: new THREE.SphereGeometry(0.5, 10, 8),
  arrow: (() => { const g = new THREE.CylinderGeometry(0.035, 0.035, 1.1, 5); g.rotateX(Math.PI / 2); return g; })(),
  arrowHead: (() => { const g = new THREE.ConeGeometry(0.08, 0.22, 5); g.rotateX(Math.PI / 2); g.translate(0, 0, 0.62); return g; })(),
  bullet: (() => { const g = new THREE.CapsuleGeometry(0.07, 0.28, 3, 6); g.rotateX(Math.PI / 2); return g; })(),
  thorn: (() => { const g = new THREE.ConeGeometry(0.08, 0.5, 4); g.rotateX(Math.PI / 2); return g; })(),
  bee: new THREE.SphereGeometry(0.18, 10, 8), wing: new THREE.CircleGeometry(0.14, 10),
  rocket: (() => { const g = new THREE.CapsuleGeometry(0.16, 0.6, 4, 8); g.rotateX(Math.PI / 2); return g; })(),
  nose: (() => { const g = new THREE.ConeGeometry(0.16, 0.3, 8); g.rotateX(Math.PI / 2); g.translate(0, 0, 0.55); return g; })(),
  fireball: new THREE.IcosahedronGeometry(0.3, 1)
};
const add = (c, o = 0.4) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });
const MATS = {
  dart: new THREE.MeshStandardMaterial({ color: '#dfe6ee', metalness: 0.6, roughness: 0.3 }), fin: new THREE.MeshStandardMaterial({ color: '#3a86ff' }),
  star: new THREE.MeshStandardMaterial({ color: '#cfd6de', metalness: 0.8, roughness: 0.2 }), tack: new THREE.MeshStandardMaterial({ color: '#e9ecef', metalness: 0.7, roughness: 0.25 }),
  boom: new THREE.MeshStandardMaterial({ color: '#ffb703', roughness: 0.4 }), blaze: new THREE.MeshStandardMaterial({ color: '#ff8c42', emissive: '#ff5a00', emissiveIntensity: 1.2 }),
  bomb: new THREE.MeshStandardMaterial({ color: '#2b2d42', roughness: 0.3 }), ball: new THREE.MeshStandardMaterial({ color: '#343a40', metalness: 0.6, roughness: 0.3 }),
  ice: new THREE.MeshStandardMaterial({ color: '#bfe8ff', emissive: '#4cc9f0', emissiveIntensity: 0.9, roughness: 0.1 }), iceGlow: add('#7df9ff', 0.35),
  glue: new THREE.MeshPhysicalMaterial({ color: '#c5f277', roughness: 0.15, clearcoat: 1, emissive: '#4f7a00', emissiveIntensity: 0.3 }), glueGlow: add('#c5f277', 0.25),
  magic: new THREE.MeshStandardMaterial({ color: '#fff3b0', emissive: '#ffd23f', emissiveIntensity: 1.6 }), magicGlow: add('#ff6fd8', 0.45),
  arrow: new THREE.MeshStandardMaterial({ color: '#8d5524', roughness: 0.6 }), arrowHead: new THREE.MeshStandardMaterial({ color: '#dfe6ee', metalness: 0.7, roughness: 0.25 }),
  bullet: new THREE.MeshStandardMaterial({ color: '#ffd23f', metalness: 0.8, roughness: 0.2, emissive: '#7a5200', emissiveIntensity: 0.6 }),
  thorn: new THREE.MeshStandardMaterial({ color: '#2d6a4f', roughness: 0.5 }),
  bee: new THREE.MeshStandardMaterial({ color: '#ffd23f', roughness: 0.4 }), beeWing: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
  rocket: new THREE.MeshStandardMaterial({ color: '#f1f3f5', metalness: 0.3, roughness: 0.35 }), nose: new THREE.MeshStandardMaterial({ color: '#e63946', roughness: 0.4 }),
  fire: new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#ff5a00', emissiveIntensity: 2 }), fireGlow: add('#ff8c42', 0.55)
};
// a bee with a stripe and two wings
function beeMesh() {
  const g = new THREE.Group(); const body = new THREE.Mesh(GEO.bee, MATS.bee); body.scale.set(1, 0.9, 1.35); g.add(body);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 6, 12), MATS.bomb); band.position.z = -0.05; g.add(band);
  for (const s of [-1, 1]) { const w = new THREE.Mesh(GEO.wing, MATS.beeWing); w.position.set(0.14 * s, 0.14, 0); w.rotation.set(-Math.PI / 2, 0, 0.5 * s); w.userData.s = s; g.add(w); g.userData.wings = (g.userData.wings || []).concat(w); }
  return g;
}
let POP_TEX = null;
function popTex() { return POP_TEX || (POP_TEX = canvasTex(128, 64, (g, w, h) => { g.translate(w / 2, h / 2); g.fillStyle = '#ffd23f'; g.beginPath(); for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2, r = i % 2 ? 22 : 34; g.lineTo(Math.cos(a) * r * 1.6, Math.sin(a) * r * 0.85); } g.closePath(); g.fill(); g.strokeStyle = '#2a1546'; g.lineWidth = 4; g.stroke(); g.fillStyle = '#ff4d6d'; g.font = '30px Lilita One, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 6; g.strokeText('POP!', 0, 2); g.fillText('POP!', 0, 2); })); }

const DROP = 0.42;   // seconds a new bean falls before it lands
export class Game {
  constructor({ map, diff, rounds, fx, audio, view, players, me, seed }) {
    this.map = map; this.diff = diff; this.rounds = diff.infinite ? Infinity : rounds; this.fx = fx; this.audio = audio; this.view = view; this.scene = map.scene;
    // Everyone has their own money. Alone there is just one wallet; in a party one per player.
    this.players = players && players.length ? players.slice() : ['me']; this.me = me || this.players[0];
    this.wallets = {}; for (const p of this.players) this.wallets[p] = diff.money;
    // the same seed and the same actions at the same tick give the same game on every computer in a party
    this.tick = 0; this.rs = (seed >>> 0) || 1;
    this.lives = diff.lives; this.wave = 0; this.cleared = 0; this.waveActive = false;
    this.balloons = []; this.towers = []; this.projectiles = []; this.timers = [];
    this.queue = []; this.qi = 0; this.waveT = 0; this.time = 0; this.scale = waveScale(1, diff);
    this.over = false; this.won = false; this.auto = false; this.autoT = -1;
    this.stats = { popped: 0, leaked: 0, bosses: 0 };
    this.listeners = []; this.nextId = 1; this.pops = 0;
    this.grid = Array.from({ length: GW * GH }, () => []);
    this.leakAt = map.path.len - 6;
  }
  get money() { return this.wallets[this.me] || 0; }
  set money(v) { this.wallets[this.me] = v; }
  // the more players in the party, the tougher the balloons: 2 players = 2X life (and 2X money per pop, so everyone earns like alone)
  get mul() { return Math.max(1, this.players.length); }
  pay(owner, amt) { if (!(owner in this.wallets)) owner = this.players[0]; this.wallets[owner] += amt; }
  rnd() { let x = this.rs; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.rs = x >>> 0 || 1; return (this.rs % 100000) / 100000; }
  towerById(id) { for (const t of this.towers) if (t.id === id) return t; return null; }
  addPlayer(id, money) { if (id in this.wallets) return; this.players.push(id); this.wallets[id] = money ?? this.diff.money; this.emit('money'); this.emit('players', { n: this.mul }); }
  // a player who leaves hands their beans and money to the party leader
  removePlayer(id) {
    if (!(id in this.wallets) || this.players[0] === id) return;
    const to = this.players[0];
    for (const t of this.towers) if (t.owner === id) t.owner = to;
    this.wallets[to] += this.wallets[id]; delete this.wallets[id]; this.players = this.players.filter(p => p !== id);
    this.emit('money'); this.emit('players', { n: this.mul });
  }
  on(fn) { this.listeners.push(fn); }
  emit(type, d) { for (const f of this.listeners) f(type, d); }
  sound(name, v) { if (this.audio) this.audio.sfx(name, v); }

  // ---------- waves ----------
  startWave() {
    if (this.waveActive || this.over) return false;
    this.wave++;
    this.scale = waveScale(this.wave, this.diff);
    const q = this.buildQueue(this.wave);
    this.queue = q; this.qi = 0; this.waveT = 0; this.waveActive = true; this.autoT = -1;
    for (const t of this.towers) if (t.isFarm) { t.drops = 0; t.dropT = 1 + this.rnd() * 2; }
    const info = waveInfo(this.wave, this.rounds);
    this.sound(info.boss ? 'boss' : 'wave');
    this.emit('wave', { wave: this.wave, boss: info.boss, final: info.final, type: info.type, count: q.length });
    return true;
  }
  buildQueue(w) {
    const q = [];
    for (const g of makeWave(w, this.diff, this.rounds)) for (let i = 0; i < g.n; i++) q.push({ t: (g.at || 0) + i * g.gap, type: g.t });
    return q.sort((a, b) => a.t - b.t);
  }
  endWave() {
    if (this.over) return;
    this.waveActive = false; this.cleared = this.wave;
    const bonus = Math.round(waveBonus(this.wave) * this.diff.cash);
    for (const p of this.players) this.wallets[p] += bonus;
    // farms pay out what they did not drop during the wave
    for (const t of this.towers) if (t.isFarm) {
      const inc = farmIncome(t.def, t.lvl, this.diff), pay = Math.round(inc * 0.5 + (FARM_DROPS - t.drops) * inc * 0.5 / FARM_DROPS);
      this.pay(t.owner, pay); t.earned += pay; this.farmFx(t, pay, true);
    }
    for (const t of this.towers) if (!t.isFarm) t.cheerT = 1.3;
    this.sound('waveDone');
    this.emit('waveEnd', { wave: this.wave, bonus });
    if (this.wave >= this.rounds) { this.over = true; this.won = true; this.sound('victory'); this.emit('victory'); }
    else if (this.auto) this.autoT = 1.2;
  }

  // ---------- balloons ----------
  spawn(type, d = 0, parent = null) {
    const def = BALLOONS[type], sc = this.scale, pm = parent ? parent.pm || 1 : this.mul;
    const hp = Math.max(1, Math.round(def.hp * (def.boss ? bossHpScale(type, this.wave) * sc.hp : def.tough ? sc.hp : 1) * pm));
    const b = { id: this.nextId++, type, def, d, hp, maxHp: hp, pm, speed: def.speed * sc.speed, x: 0, z: 0, alive: true, frozenT: 0, stunT: 0, slowT: 0, slowPct: 0, glueT: 0, dot: 0, dotT: 0, hitT: 0, spawnT: parent ? 1 : 0, heading: 0, skip: 0,
      kids: def.boss ? bossChildren(type, this.wave) : def.children };
    if (parent) { b.slowT = parent.slowT; b.slowPct = parent.slowPct; b.glueT = parent.glueT; b.dot = parent.dot; }
    this.map.path.at(d, _v); b.x = _v.x; b.z = _v.z;
    this.balloons.push(b);
    if (def.boss && !parent) { this.emit('boss', { type, name: def.name }); this.fx.ring(_v.set(b.x, 0.2, b.z), '#ff4d6d', 1, 8, 0.8); }
    return b;
  }
  // damage a balloon; extra damage spills over into what comes out of it
  damage(b, amt, src, projId = 0) {
    if (!b.alive || amt <= 0) return;
    if (b.def.boss && src && src.stats) amt *= src.stats.bossMul || 1;
    b.hp -= amt; b.hitT = 0.14;
    if (b.hp > 0) { if (b.def.tough) this.fx.sparks(_v.set(b.x, 2 + b.def.size * 0.5, b.z), b.def.boss ? '#ffd23f' : '#ffffff', b.def.boss ? 4 : 2); return; }
    const over = -b.hp;
    b.alive = false;
    this.pay(src && src.owner, b.def.cash * this.diff.cash * (b.pm || 1));
    this.stats.popped++; if (src) src.pops++;
    if (b.def.boss) this.stats.bosses++;
    this.popFx(b);
    const kids = b.kids.map((t, i) => { const k = this.spawn(t, Math.max(0, b.d - i * (b.def.boss ? 1.2 : 0.7)), b); k.skip = projId; return k; });
    if (over > 0 && kids.length) this.damage(kids[0], over, src, projId);
  }
  popFx(b) {
    const c = col(b), y = 1.7 + b.def.size * 0.4, p = _v.set(b.x, b.def.boss ? 4 : y, b.z);
    if (b.def.boss) {
      const g = _w.set(b.x, 0.1, b.z);
      this.fx.shockwave(g, '#ffd23f', 8); this.fx.confetti(_u.set(b.x, 3, b.z), 160, 7); this.fx.rays(g, '#ffd23f', 16, 12, 0.8);
      this.fx.burst(p, c, 60, 12, 0.35, 8, 1); this.fx.flash(p, '#ffffff', 5, 0.35); this.fx.light(p, '#ffd23f', 60, 0.6, 30);
      this.sound('boom'); this.sound('bigpop'); this.emit('bossPop', { name: b.def.name });
      return;
    }
    this.fx.burst(p, c, 11, 6.5, 0.17, 4, 0.42);
    this.fx.burst(p, '#ffffff', 4, 4, 0.12, 3, 0.25);
    if (b.def.tough) { this.fx.flash(p, c, 1.4, 0.18); this.fx.ring(_w.set(b.x, 0.2, b.z), c, 0.3, 2, 0.3); }
    if (++this.pops % 7 === 0) this.popSprite(p);
    this.sound(b.def.tough ? 'bigpop' : 'pop', 0.8);
  }
  popSprite(p) {
    if ((this.popSprites || 0) > 8) return;
    this.popSprites = (this.popSprites || 0) + 1;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: popTex(), transparent: true, depthTest: false }));
    s.position.copy(p).add(_w.set(0, 1, 0)); s.renderOrder = 20;
    this.fx.temp(s, 0.5, k => { const sc = 1.6 * (0.6 + Math.sin(Math.min(1, k * 3) * Math.PI / 2) * 0.6); s.scale.set(sc * 2, sc, 1); s.material.opacity = 1 - k * k; s.position.y += 0.02; if (k >= 0.98) this.popSprites--; });
  }
  rebuildGrid() {
    for (const c of this.grid) c.length = 0;
    for (const b of this.balloons) {
      if (!b.alive) continue;
      const i = Math.floor((b.x + GW * CELL / 2) / CELL), j = Math.floor((b.z + GH * CELL / 2) / CELL);
      if (i >= 0 && j >= 0 && i < GW && j < GH) this.grid[j * GW + i].push(b);
    }
  }
  // call fn(b) for live balloons whose center is within r (+ their size) of x, z
  near(x, z, r, fn) {
    const pad = 4;
    const i0 = Math.max(0, Math.floor((x - r - pad + GW * CELL / 2) / CELL)), i1 = Math.min(GW - 1, Math.floor((x + r + pad + GW * CELL / 2) / CELL));
    const j0 = Math.max(0, Math.floor((z - r - pad + GH * CELL / 2) / CELL)), j1 = Math.min(GH - 1, Math.floor((z + r + pad + GH * CELL / 2) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) for (const b of this.grid[j * GW + i]) {
      if (!b.alive) continue;
      const rr = r + b.def.size * 0.75;
      if ((b.x - x) ** 2 + (b.z - z) ** 2 <= rr * rr) if (fn(b) === false) return;
    }
  }

  // ---------- beans and farms ----------
  price(def) { return priceOf(def.cost, this.diff); }
  place(id, x, z, isFarm = false, free = false, owner = this.me) {
    const def = isFarm ? FARM[id] : BEAN[id], cost = free ? 0 : this.price(def), r = isFarm ? 1.75 : 1.1;
    if (!def) return null;
    if (!(owner in this.wallets)) owner = this.players[0];
    if (!free && (this.over || this.wallets[owner] < cost || !this.map.canPlace(x, z, this.towers, r))) return null;
    this.wallets[owner] -= cost;
    const y = this.map.heightAt(x, z);
    let t;
    if (isFarm) {
      const model = new FarmModel(id); model.root.position.set(x, y, z); model.root.rotation.y = (this.nextId % 4) * Math.PI / 2; this.scene.add(model.root);
      t = { id: this.nextId++, isFarm: true, def, x, z, y, r, lvl: 0, spent: cost, model, drops: 0, dropT: 2, earned: 0, pops: 0 };
    } else {
      const model = new TowerBean(id, def.colors); model.root.scale.setScalar(1.75);
      model.root.position.set(x, y, z); model.root.rotation.y = Math.PI;
      model.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
      this.scene.add(model.root);
      t = { id: this.nextId++, def, x, z, y, r, lvl: 0, spent: cost, cd: 0.2, target: def.target, model, facing: Math.PI, atk: -1, pops: 0, blizT: 0, cheerT: 0, hop: 0, stats: beanStats(def, 0) };
    }
    t.base = t.model.root.scale.x; t.owner = owner;
    this.towers.push(t);
    if (free) return t;
    // it drops in from the sky and lands with a thump (see land)
    t.fallT = DROP; t.model.root.position.y = y + 9;
    const p = _v.set(x, y, z);
    this.fx.ring(p, '#ffffff', r * 2.2, 0.3, DROP, 0.5);
    this.fx.sparks(_w.set(x, y + 6, z), '#ffffff', 6);
    this.sound('drop');
    this.emit('money');
    return t;
  }
  land(t) {
    const p = _v.set(t.x, t.y, t.z), c = t.isFarm ? '#9be15d' : (t.def.colors || ['#ffd23f'])[0];
    t.squash = 1;
    this.fx.dust(p, 22); this.fx.ring(p, '#ffffff', 0.4, t.r * 2.8, 0.5); this.fx.ring(p, c, 0.3, t.r * 2, 0.4, 0.7);
    this.fx.burst(_w.set(t.x, t.y + 0.5, t.z), c, 16, 4.5, 0.18, 5, 0.55); this.fx.decal(p, '#5a4632', 1.6, 1.6, 0.25);
    if (!t.isFarm) t.model.hit();
    this.sound('place');
    this.emit('land', t);
  }
  // ---------- saving a game you are in the middle of (between waves) ----------
  runState() {
    return {
      wave: this.cleared, money: Math.round(this.money), lives: this.lives, stats: { ...this.stats },
      towers: this.towers.map(t => ({ b: t.def.id, f: t.isFarm ? 1 : 0, x: +t.x.toFixed(2), z: +t.z.toFixed(2), lvl: t.lvl, spent: t.spent, target: t.target, earned: t.earned || 0, pops: t.pops || 0 }))
    };
  }
  restore(s) {
    this.restoring = true;
    this.wave = this.cleared = s.wave | 0; this.money = +s.money || 0; this.lives = s.lives | 0 || this.lives;
    Object.assign(this.stats, s.stats || {});
    this.scale = waveScale(Math.max(1, this.wave), this.diff);
    for (const r of s.towers || []) {
      const t = this.place(r.b, r.x, r.z, !!r.f, true);
      if (!t) continue;
      t.lvl = Math.max(0, Math.min(10, r.lvl | 0)); t.spent = r.spent || t.spent; t.pops = r.pops || 0;
      const skin = skinFor(t.lvl);
      if (t.isFarm) { t.earned = r.earned || 0; if (t.lvl) t.model.setSkin(skin); }
      else { if (r.target) t.target = r.target; t.stats = beanStats(t.def, t.lvl); if (t.lvl) t.model.setSkin(skin, t.def.skins[skin - 1]); }
    }
    this.restoring = false;
    this.emit('money');
  }
  // ---------- actions (what a player does), the same on every computer in a party ----------
  act(a) {
    const p = a.p in this.wallets ? a.p : null, t = a.t ? this.towerById(a.t) : null, mine = t && t.owner === p;
    switch (a.k) {
      case 'place': return p ? this.place(a.id, a.x, a.z, !!a.f, false, p) : null;
      case 'up': return mine ? this.upgrade(t) : false;
      case 'sell': return mine ? this.sell(t) : 0;
      case 'tgt': if (mine && TARGETS.includes(a.v)) t.target = a.v; return mine;
      case 'upall': return p ? this.upgradeAll((a.ts || []).map(id => this.towerById(id)).filter(Boolean), p) : 0;
      case 'sellall': { let v = 0; for (const id of a.ts || []) { const x = this.towerById(id); if (x && x.owner === p) v += this.sell(x); } return v; }
      case 'wave': return this.startWave();
      case 'auto': this.auto = !!a.v; if (this.auto && !this.waveActive && this.wave > 0 && !this.over) this.autoT = 0.6; return true;
      case 'join': this.addPlayer(a.p, a.m); return true;
      case 'leave': this.removePlayer(a.p); return true;
    }
    return null;
  }
  // ---------- the whole game as plain data (for a friend who joins late, or to fix a party that drifted apart) ----------
  snapshot() {
    return {
      k: this.tick, tm: this.time, w: this.wave, c: this.cleared, wa: this.waveActive, qi: this.qi, wt: this.waveT, nid: this.nextId, au: this.auto, at: this.autoT,
      ov: this.over, won: this.won, li: this.lives, wal: { ...this.wallets }, pl: this.players.slice(), st: { ...this.stats }, rs: this.rs,
      tw: this.towers.map(t => [t.id, t.owner, t.def.id, t.isFarm ? 1 : 0, t.x, t.z, t.lvl, t.spent, t.target || '', t.cd || 0, t.blizT || 0, t.beatT || 0, t.drops || 0, t.dropT || 0, t.earned || 0, t.pops || 0, t.facing || 0]),
      bl: this.balloons.filter(b => b.alive).map(b => [b.id, b.type, b.d, b.hp, b.maxHp, b.speed, b.frozenT, b.slowT, b.slowPct, b.glueT, b.dot, b.dotT, b.dotSrc ? b.dotSrc.id : 0, b.burnT || 0, b.spawnT, b.skip || 0, b.kids, b.stunT || 0, b.pm || 1])
    };
  }
  load(s) {
    for (const t of this.towers) t.model.root.removeFromParent();
    for (const p of this.projectiles) if (p.mesh) p.mesh.removeFromParent();
    this.towers = []; this.projectiles = []; this.timers = []; this.balloons = [];
    this.players = s.pl.slice(); this.wallets = {}; for (const p of this.players) this.wallets[p] = 0;
    if (!(this.me in this.wallets)) this.me = this.players[0];
    this.wave = s.w; this.cleared = s.c; this.waveActive = s.wa; this.waveT = s.wt; this.time = s.tm;
    this.scale = waveScale(Math.max(1, this.wave), this.diff);
    this.queue = this.waveActive ? this.buildQueue(this.wave) : []; this.qi = s.qi;
    this.restoring = true;
    for (const r of s.tw) {
      const t = this.place(r[2], r[4], r[5], !!r[3], true, r[1] in this.wallets ? r[1] : this.players[0]);
      if (!t) continue;
      t.id = r[0]; t.lvl = r[6]; t.spent = r[7]; t.cd = r[9]; t.blizT = r[10]; t.beatT = r[11]; t.drops = r[12]; t.dropT = r[13]; t.earned = r[14]; t.pops = r[15]; t.facing = r[16];
      const skin = skinFor(t.lvl);
      if (t.isFarm) { t.model.root.rotation.y = (t.id % 4) * Math.PI / 2; if (t.lvl) t.model.setSkin(skin); }
      else { if (r[8]) t.target = r[8]; t.stats = beanStats(t.def, t.lvl); if (t.lvl) t.model.setSkin(skin, t.def.skins[skin - 1]); t.model.root.rotation.y = t.facing; }
    }
    this.restoring = false;
    const path = this.map.path;
    for (const r of s.bl) {
      const def = BALLOONS[r[1]]; if (!def) continue;
      const b = { id: r[0], type: r[1], def, d: r[2], hp: r[3], maxHp: r[4], speed: r[5], x: 0, z: 0, alive: true, frozenT: r[6], slowT: r[7], slowPct: r[8], glueT: r[9], dot: r[10], dotT: r[11], dotSrc: r[12] ? this.towerById(r[12]) : null, burnT: r[13], hitT: 0, spawnT: r[14], heading: 0, skip: r[15], kids: r[16], stunT: r[17] || 0, pm: r[18] || 1 };
      path.at(b.d, _v); b.x = _v.x; b.z = _v.z; if (def.boss) b.heading = path.heading(b.d);
      this.balloons.push(b);
    }
    this.tick = s.k; this.nextId = s.nid; this.auto = s.au; this.autoT = s.at; this.over = s.ov; this.won = s.won; this.lives = s.li; this.rs = s.rs;
    Object.assign(this.wallets, s.wal); Object.assign(this.stats, s.st);
    this.rebuildGrid();
    this.emit('money');
  }
  // a short fingerprint of the game, to notice when two computers no longer agree
  checksum() {
    let h = (this.lives * 7 + this.towers.length * 17 + this.nextId * 3 + this.wave * 101) | 0;
    for (const p of this.players) h = (h * 31 + Math.round(this.wallets[p] * 10)) | 0;
    for (const t of this.towers) h = (h * 31 + t.id * 7 + t.lvl) | 0;
    for (const b of this.balloons) if (b.alive) h = (h * 31 + Math.round(b.d * 100) + Math.round(b.hp * 10) * 7 + b.id) | 0;
    return h;
  }
  upgradeCost(t) { return t.isFarm ? (t.lvl >= 10 ? null : priceOf(t.def.cost * UP_COST[t.lvl], this.diff)) : upgradePrice(t.def, t.lvl, this.diff); }
  upgrade(t, quiet) {
    const cost = this.upgradeCost(t);
    if (cost === null || this.wallets[t.owner] < cost || this.over) return false;
    this.wallets[t.owner] -= cost; t.spent += cost; t.lvl++;
    const skin = skinFor(t.lvl), p = _v.set(t.x, t.y, t.z);
    if (t.isFarm) { t.model.setSkin(skin); for (let i = 0; i < 3; i++) this.fx.coin(_w.set(t.x + (i - 1) * 0.9, t.y + 1.2, t.z), 1, i * 0.12); }
    else {
      t.stats = beanStats(t.def, t.lvl);
      const newLook = skin > t.model.skin;
      t.model.setSkin(skin, t.def.skins[skin - 1]);
      t.model.hit(); t.hop = 1;
      if (newLook) { this.fx.column(p, '#ffd23f', 1.4, 9, 0.9); this.fx.confetti(_w.set(t.x, t.y + 2, t.z), 60, 2.5); this.fx.rays(p, '#ffd23f', 12, 5, 0.7); this.emit('newLook', t); }
    }
    this.fx.levelUp(p); this.fx.ring(p, '#ffd23f', 0.4, 2.8, 0.5); this.fx.burst(_w.set(t.x, t.y + 2, t.z), '#ffd23f', 22, 4.5, 0.18, 6, 0.65); this.fx.sparks(_w.set(t.x, t.y + 1.5, t.z), '#ffffff', 10);
    if (!quiet) this.sound('upgrade');
    this.emit('money');
    return true;
  }
  // upgrade several at once, one level each, only if all of them can be paid for
  upgradeAllCost(list) { let sum = 0; for (const t of list) { const c = this.upgradeCost(t); if (c !== null) sum += c; } return sum; }
  upgradeAll(list, owner = this.me) {
    const ready = list.filter(t => t.owner === owner && this.upgradeCost(t) !== null), cost = this.upgradeAllCost(ready);
    if (!ready.length || this.wallets[owner] < cost || this.over) return 0;
    for (const t of ready) this.upgrade(t, true);
    this.sound('upgrade');
    return ready.length;
  }
  level(t) { return t.lvl; }
  sellValue(t) { return Math.round(t.spent * SELL_BACK); }
  sell(t) {
    const i = this.towers.indexOf(t); if (i < 0) return 0;
    const v = this.sellValue(t);
    this.pay(t.owner, v); this.towers.splice(i, 1);
    this.fx.burst(_v.set(t.x, t.y + 1, t.z), '#ffd23f', 24, 5, 0.2, 5, 0.6); this.fx.smoke(_v.set(t.x, t.y, t.z), '#e8e1d6', 10, 1.4);
    t.model.root.removeFromParent();
    this.sound('sell');
    this.emit('money');
    return v;
  }
  farmFx(t, amount, big) {
    const p = _v.set(t.x, t.y + 1.2, t.z);
    this.fx.sparks(p, '#fff3b0', big ? 8 : 3);
    if (big) this.fx.ring(_w.set(t.x, t.y + 0.1, t.z), '#5bd16b', 0.5, 3, 0.5);
    if (big) for (let i = 0; i < 3; i++) this.fx.coin(_w.set(t.x + (i - 1) * 0.9, t.y + 1.2, t.z + (Math.random() - 0.5) * 0.4), 1.1, i * 0.14);
    else this.fx.coin(_w.set(t.x, t.y + 1.2, t.z), 1);
    this.sound('coin', big ? 1 : 0.5);
    this.emit('farm', { t, amount: Math.round(amount) });
  }

  // ---------- targeting ----------
  findTarget(t, range, skip) {
    let best = null, bs = -Infinity;
    const mode = t.target;
    this.near(t.x, t.z, range, b => {
      if (skip && skip.has(b.id)) return;
      const s = mode === 'first' ? b.d : mode === 'last' ? -b.d : mode === 'strong' ? (b.def.boss ? 1e7 : 0) + rbe(b.type) * 1000 + b.d : -((b.x - t.x) ** 2 + (b.z - t.z) ** 2);
      if (s > bs) { bs = s; best = b; }
    });
    return best;
  }
  effSpeed(b) { return b.stunT > 0 && !b.def.boss ? 0 : b.frozenT > 0 ? (b.def.boss ? b.speed * 0.5 : 0) : b.slowT > 0 ? b.speed * (1 - b.slowPct) : b.speed; }
  lead(b, time, out) { return this.map.path.at(Math.min(this.leakAt, b.d + this.effSpeed(b) * time), out); }
  handPos(t, out) { if (t.model.muzzle) return t.model.muzzle.getWorldPosition(out); return out.set(t.x + Math.sin(t.facing) * 0.9, t.y + 1.7, t.z + Math.cos(t.facing) * 0.9); }

  // ---------- attacks ----------
  attack(t, b) {
    const s = t.stats, k = t.def.kind, hand = this.handPos(t, new THREE.Vector3());
    t.facing = Math.atan2(b.x - t.x, b.z - t.z); t.atk = 0;
    const dist = Math.hypot(b.x - t.x, b.z - t.z);
    if (k === 'dart') {
      const pj = t.def.proj, star = pj === 'star', aim = this.lead(b, dist / s.speed, new THREE.Vector3()), base = Math.atan2(aim.x - t.x, aim.z - t.z);
      for (let i = 0; i < s.count; i++) {
        const a = base + (i - (s.count - 1) / 2) * s.spread;
        let m;
        if (star) m = new THREE.Mesh(GEO.star, MATS.star);
        else if (pj === 'arrow') { m = new THREE.Group(); m.add(new THREE.Mesh(GEO.arrow, MATS.arrow)); m.add(new THREE.Mesh(GEO.arrowHead, MATS.arrowHead)); const f = new THREE.Mesh(GEO.fin, MATS.fin); f.position.z = -0.2; m.add(f); }
        else if (pj === 'bullet') m = new THREE.Mesh(GEO.bullet, MATS.bullet);
        else { m = new THREE.Group(); m.add(new THREE.Mesh(GEO.dart, MATS.dart)); m.add(new THREE.Mesh(GEO.fin, MATS.fin)); }
        this.addProj({ kind: 'dart', x: t.x, z: t.z, y: t.y + 1.7, dx: Math.sin(a), dz: Math.cos(a), speed: s.speed, life: (s.range + 3) / s.speed, pierce: s.pierce, dmg: s.dmg, r: pj === 'bullet' ? 0.45 : 0.55, tower: t, mesh: m, spin: star, trail: star ? '#c77dff' : pj === 'bullet' ? (Math.random() < 0.5 ? '#ffd23f' : null) : '#ffffff' });
      }
      if (pj === 'bullet') { this.fx.flash(hand, '#ffd23f', 0.7, 0.07); this.fx.emit({ p: hand, v: _w.set(Math.cos(t.facing) * 3, 3, -Math.sin(t.facing) * 3), life: 0.5, size: 0.06, color: '#d4a017', g: -16 }); if (Math.random() < 0.5) this.sound('throw', 0.25); }
      else {
        this.fx.burst(hand, star ? '#c77dff' : '#ffffff', 6, 3, 0.12, 2, 0.25);
        if (star) this.fx.slash(_w.set(t.x, t.y + 1.4, t.z), t.facing, '#c77dff', 1.6, 2.2, 0.3, 0.18);
        if (pj === 'arrow') this.fx.slash(_w.set(t.x, t.y + 1.5, t.z), t.facing, '#fefae0', 1.2, 1.4, 0.2, 0.15);
        this.sound('throw', 0.55);
      }
    } else if (k === 'tack') {
      for (let i = 0; i < s.count; i++) {
        const a = t.facing + i / s.count * Math.PI * 2;
        const thorn = t.def.proj === 'thorn';
        this.addProj({ kind: 'dart', x: t.x, z: t.z, y: t.y + 1.1, dx: Math.sin(a), dz: Math.cos(a), speed: s.speed, life: (s.range + 0.8) / s.speed, pierce: s.pierce, dmg: s.dmg, r: 0.5, tower: t, mesh: new THREE.Mesh(thorn ? GEO.thorn : GEO.tack, thorn ? MATS.thorn : s.dmg > 1 ? MATS.blaze : MATS.tack), trail: thorn ? '#95d5b2' : s.dmg > 1 ? '#ff8c42' : '#ffffff' });
      }
      const ringC = t.def.proj === 'thorn' ? '#95d5b2' : '#ffffff';
      this.fx.ring(_v.set(t.x, t.y + 0.9, t.z), ringC, 0.4, 2.2, 0.25, 0.7); this.fx.sparks(_v.set(t.x, t.y + 1.1, t.z), t.def.proj === 'thorn' ? '#7bd389' : '#e9ecef', 8);
      if (t.def.proj === 'thorn') this.fx.burst(_v.set(t.x, t.y + 1.2, t.z), '#ff6fb5', 5, 3, 0.14, 3, 0.4);
      this.sound('throw', 0.5);
    } else if (k === 'tazer') {
      const targets = [b];
      if ((s.count || 1) > 1) { const skip = new Set([b.id]); for (let i = 1; i < s.count; i++) { const o = this.findTarget(t, s.range + (t.buffR || 0), skip); if (!o) break; targets.push(o); skip.add(o.id); } }
      for (const tg of targets) this.zap(t, tg, hand);
      this.fx.flash(hand, '#7df9ff', 1.1, 0.12); this.fx.sparks(hand, '#fff3b0', 6); this.fx.light(hand, '#7df9ff', 18, 0.12, 8);
      t.model.hit();
      this.sound('zap', 0.75);
    } else if (k === 'hitscan') {
      const hit = new Set([b.id]); let cur = b, from = hand.clone();
      for (let n = 0; n <= (s.ricochet || 0) && cur; n++) {
        const to = new THREE.Vector3(cur.x, 1.9 + (cur.def.boss ? 2.4 : 0), cur.z);
        this.fx.beam(from, to, n ? '#ffd23f' : '#ffffff', 0.14, 0.2); this.fx.beam(from, to, '#ffb703', 0.32, 0.12);
        this.fx.flash(to, '#ffd23f', 0.8, 0.14); this.fx.sparks(to, '#ffd23f', 6);
        const prev = cur; this.damage(cur, s.dmg, t);
        from = to; cur = null;
        if (n < (s.ricochet || 0)) { let bd = 1e9; this.near(prev.x, prev.z, 9, x => { if (hit.has(x.id)) return; const dd = (x.x - prev.x) ** 2 + (x.z - prev.z) ** 2; if (dd < bd) { bd = dd; cur = x; } }); if (cur) hit.add(cur.id); }
      }
      this.fx.flash(hand, '#fff3b0', 1, 0.1); this.fx.smoke(hand, '#cfd6de', 3, 0.3);
      this.fx.emit({ p: hand, v: _w.set(Math.cos(t.facing) * 3, 4, -Math.sin(t.facing) * 3), life: 0.6, size: 0.08, color: '#d4a017', g: -16 });
      t.model.hit();
      this.sound('sniper', 0.65);
    } else if (k === 'boom') {
      const D = Math.min(s.range + 1, Math.max(4, dist + 1)), aim = this.lead(b, D / s.speed, new THREE.Vector3()), base = Math.atan2(aim.x - t.x, aim.z - t.z);
      for (let i = 0; i < s.count; i++) {
        const a = base + (i - (s.count - 1) / 2) * 0.45, side = i % 2 ? -1 : 1;
        this.addProj({ kind: 'boom', ox: t.x, oz: t.z, y: t.y + 1.5, a, D, side, s: 0, dur: Math.PI * D * 1.15 / s.speed, pierce: s.pierce, dmg: s.dmg, r: 0.75, tower: t, mesh: new THREE.Mesh(GEO.boom, s.blaze ? MATS.blaze : MATS.boom), x: t.x, z: t.z, hit: new Set() });
      }
      this.fx.dust(_v.set(t.x, t.y, t.z), 5); this.fx.burst(hand, '#ffd23f', 6, 3, 0.14, 2, 0.3);
      this.sound('boomerang', 0.55);
    } else if (k === 'bomb' || k === 'cannon') {
      const cannon = k === 'cannon';
      for (let i = 0; i < (s.count || 1); i++) {
        const time = cannon ? Math.max(0.12, dist / s.speed) : Math.max(0.35, dist / s.speed), aim = this.lead(b, time, new THREE.Vector3());
        const off = (i - ((s.count || 1) - 1) / 2) * 0.9;
        const rocket = t.def.proj === 'rocket';
        let mesh; if (rocket) { mesh = new THREE.Group(); mesh.add(new THREE.Mesh(GEO.rocket, MATS.rocket)); mesh.add(new THREE.Mesh(GEO.nose, MATS.nose)); for (let f = 0; f < 3; f++) { const fin = new THREE.Mesh(GEO.fin, MATS.nose); fin.rotation.z = f * 2.1; fin.position.z = -0.25; mesh.add(fin); } } else mesh = new THREE.Mesh(cannon ? GEO.ball : GEO.bomb, cannon ? MATS.ball : MATS.bomb);
        this.addProj({ kind: 'bomb', cannon, rocket, sx: hand.x, sz: hand.z, sy: hand.y, tx: aim.x + Math.cos(t.facing) * off, tz: aim.z - Math.sin(t.facing) * off, s: 0, dur: time + i * 0.06, x: hand.x, z: hand.z, y: hand.y, tower: t, mesh });
      }
      if (t.def.proj === 'rocket') { this.fx.smoke(hand, '#dee2e6', 12, 1); this.fx.flash(hand, '#ff8c42', 1.4, 0.15); this.fx.burst(hand, '#ffd23f', 12, 4, 0.16, 3, 0.35); t.model.hit(); this.sound('launch', 0.7); }
      else if (cannon) { this.fx.flash(hand, '#ffd23f', 1.6, 0.14); this.fx.smoke(hand, '#adb5bd', 10, 0.8); this.fx.burst(hand, '#ff8c42', 10, 5, 0.16, 2, 0.3); t.model.hit(); this.sound('boom', 0.35); }
      else { this.fx.sparks(hand, '#ffd23f', 6); this.sound('lob', 0.55); }
    } else if (k === 'ice' || k === 'glue') {
      const glue = k === 'glue', fire = t.def.proj === 'fire', aim = this.lead(b, dist / s.speed, new THREE.Vector3()), l = Math.hypot(aim.x - t.x, aim.z - t.z) || 1;
      const m = new THREE.Group(); m.add(new THREE.Mesh(fire ? GEO.fireball : glue ? GEO.glue : GEO.ice, fire ? MATS.fire : glue ? MATS.glue : MATS.ice)); const gl = new THREE.Mesh(GEO.glow, fire ? MATS.fireGlow : glue ? MATS.glueGlow : MATS.iceGlow); gl.scale.setScalar(fire ? 1.3 : 0.9); m.add(gl);
      this.addProj({ kind: glue ? 'glue' : 'ice', x: hand.x, z: hand.z, y: hand.y, dx: (aim.x - hand.x) / l, dz: (aim.z - hand.z) / l, speed: s.speed, life: (l + 2) / s.speed, tower: t, mesh: m, trail: fire ? '#ff8c42' : glue ? '#c5f277' : '#bfe8ff', fire });
      this.fx.burst(hand, fire ? '#ff8c42' : glue ? '#c5f277' : '#bfe8ff', 8, 3, 0.15, 2, 0.35);
      if (fire) this.fx.flames(hand, 4, 0.3);
      this.sound(fire ? 'boomerang' : glue ? 'splat' : 'freeze', 0.5);
    } else if (k === 'laser') {
      const targets = [b]; if (s.count > 1) { const skip = new Set([b.id]); for (let i = 1; i < s.count; i++) { const o = this.findTarget(t, s.range, skip); if (!o) break; targets.push(o); skip.add(o.id); } }
      for (const tg of targets) this.laser(t, tg, hand);
      t.model.hit();
      this.sound('laser', 0.5);
    } else if (k === 'chain') {
      const skip = new Set(); let first = b;
      for (let i = 0; i < (s.count || 1) && first; i++) { this.chain(t, first, hand, skip); first = this.findTarget(t, s.range, skip); }
      this.fx.flash(hand, '#caf0f8', 1.2, 0.15);
      this.sound('zap', 0.6);
    } else if (k === 'wind') {
      // a gust that blows balloons back along the road (bosses are too heavy)
      let n = 0;
      const list = []; this.near(t.x, t.z, s.range, x => { list.push(x); });
      list.sort((a, c) => c.d - a.d);
      for (const x of list) {
        if (n++ >= s.maxHits) break;
        if (!x.def.boss) x.d = Math.max(0, x.d - s.push * (x.def.tough ? 0.6 : 1));
        x.slowT = Math.max(x.slowT, 1.2); x.slowPct = Math.max(x.slowPct, 0.3);
        if (s.dmg) this.damage(x, s.dmg, t);
        this.fx.burst(_v.set(x.x, 1.9, x.z), '#e0fbfc', 4, 2.5, 0.14, 2, 0.35);
      }
      const c = _v.set(t.x, t.y + 0.4, t.z);
      this.fx.ring(c, '#e0fbfc', 0.6, s.range, 0.55, 0.7); this.fx.ring(c, '#90e0ef', 0.4, s.range * 0.7, 0.45, 0.5);
      for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2, r = 0.8 + Math.random() * s.range * 0.6; this.fx.emit({ p: _w.set(t.x + Math.cos(a) * r, t.y + 0.6 + Math.random() * 2, t.z + Math.sin(a) * r), v: _u.set(-Math.sin(a) * 9 + Math.cos(a) * 3, 0.6, Math.cos(a) * 9 + Math.sin(a) * 3), life: 0.55, size: 0.14, color: i % 3 ? '#e0fbfc' : '#90e0ef', g: 0, drag: 1.2 }); }
      t.hop = 0.6;
      this.sound('freeze', 0.4);
    } else if (k === 'magic') {
      for (let i = 0; i < s.count; i++) {
        const a = t.facing + (i - (s.count - 1) / 2) * 0.7;
        const bee = t.def.proj === 'bee';
        let m; if (bee) m = beeMesh(); else { m = new THREE.Group(); m.add(new THREE.Mesh(GEO.magic, MATS.magic)); const gl = new THREE.Mesh(GEO.glow, MATS.magicGlow); gl.scale.setScalar(1.1); m.add(gl); }
        this.addProj({ kind: 'magic', bee, x: hand.x, z: hand.z, y: hand.y, dx: Math.sin(a), dz: Math.cos(a), speed: s.speed * (bee ? 0.85 + this.rnd() * 0.3 : 1), life: bee ? 4 : 3, pierce: s.pierce, dmg: s.dmg, r: 0.6, tower: t, mesh: m, target: b, hit: new Set() });
      }
      if (t.def.proj === 'bee') { this.fx.burst(hand, '#ffd23f', 8, 3, 0.12, 3, 0.4); this.sound('zap', 0.25); }
      else { this.fx.burst(hand, '#ffd23f', 10, 3, 0.15, 3, 0.4); this.fx.burst(hand, '#ff6fd8', 6, 2.5, 0.13, 3, 0.4); this.sound('magic', 0.5); }
    }
  }
  // one electric shock: big damage, a short stun, and with Arc Jump it hops on to balloons next to it
  zap(t, b, from) {
    const s = t.stats, to = new THREE.Vector3(b.x, 1.9 + (b.def.boss ? 2.4 : 0), b.z);
    this.fx.lightning(from, to, '#ffd23f', 0.3); this.fx.lightning(from, to, '#ffffff', 0.16); this.fx.lightning(from, to, '#7df9ff', 0.22);
    this.fx.flash(to, '#fff3b0', 1.2, 0.16); this.fx.sparks(to, '#7df9ff', 8); this.fx.ring(_v.set(b.x, 0.25, b.z), '#ffd23f', 0.3, 1.9, 0.25, 0.8);
    if (s.stun) b.stunT = Math.max(b.stunT || 0, s.stun);
    let px = b.x, pz = b.z;
    this.damage(b, s.dmg, t);
    if (!s.arc) return;
    const hit = new Set([b.id]); let prev = to;
    for (let i = 0; i < s.arc; i++) {
      let nb = null, bd = 1e9;
      this.near(px, pz, 4, o => { if (hit.has(o.id)) return; const d = (o.x - px) ** 2 + (o.z - pz) ** 2; if (d < bd) { bd = d; nb = o; } });
      if (!nb) break;
      hit.add(nb.id);
      const nt = new THREE.Vector3(nb.x, 1.9 + (nb.def.boss ? 2.4 : 0), nb.z);
      this.fx.lightning(prev, nt, '#7df9ff', 0.2); this.fx.lightning(prev, nt, '#ffffff', 0.12); this.fx.sparks(nt, '#ffd23f', 4);
      if (s.stun) nb.stunT = Math.max(nb.stunT || 0, s.stun * 0.5);
      px = nb.x; pz = nb.z; prev = nt;
      this.damage(nb, Math.ceil(s.dmg / 2), t);
    }
  }
  laser(t, b, from) {
    const s = t.stats, dx = b.x - t.x, dz = b.z - t.z, l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l, len = s.range + 1;
    const hits = [];
    this.near(t.x + ux * len / 2, t.z + uz * len / 2, len / 2 + 1, o => {
      const px = o.x - t.x, pz = o.z - t.z, along = px * ux + pz * uz, perp = Math.abs(px * uz - pz * ux);
      if (along > 0 && along < len && perp < 0.7 + o.def.size * 0.6) hits.push({ o, along });
    });
    hits.sort((a, c) => a.along - c.along);
    const n = Math.min(hits.length, s.pierce), endA = n ? hits[n - 1].along + 1 : len;
    for (let i = 0; i < n; i++) { const o = hits[i].o; this.damage(o, s.dmg, t); this.fx.sparks(_v.set(o.x, 1.9, o.z), t.def.proj === 'super' ? '#ffd23f' : '#ff6fb5', 4); }
    const to = new THREE.Vector3(t.x + ux * endA, 1.8, t.z + uz * endA);
    const sup = t.def.proj === 'super', c1 = sup ? '#ff4d1a' : '#ff006e', c2 = sup ? '#ffd23f' : '#ff6fb5';
    if (sup) from = _u.set(t.x + Math.sin(t.facing) * 0.6, t.y + 2.2, t.z + Math.cos(t.facing) * 0.6).clone();
    this.fx.beam(from, to, c1, sup ? 0.36 : 0.5, 0.22); this.fx.beam(from, to, '#ffffff', 0.16, 0.18); this.fx.flash(from, c2, 0.9, 0.12); this.fx.flash(to, c1, 1, 0.15);
    this.fx.decal(_v.set(to.x, 0.05, to.z), '#3a1020', 0.6, 1.5, 0.35);
  }
  chain(t, b, from, skip) {
    const s = t.stats; let cur = b, prev = from.clone(), dmg = s.dmg;
    for (let i = 0; i <= s.chain && cur; i++) {
      skip.add(cur.id);
      const to = new THREE.Vector3(cur.x, 1.9 + (cur.def.boss ? 2.4 : 0), cur.z);
      this.fx.lightning(prev, to, '#7df9ff', 0.25); this.fx.lightning(prev, to, '#ffffff', 0.16); this.fx.flash(to, '#caf0f8', 0.8, 0.14); this.fx.sparks(to, '#ffd23f', 4);
      this.damage(cur, dmg, t);
      prev = to; const last = cur; cur = null; let bd = 1e9;
      this.near(last.x, last.z, s.bounceR, o => { if (skip.has(o.id)) return; const d = (o.x - last.x) ** 2 + (o.z - last.z) ** 2; if (d < bd) { bd = d; cur = o; } });
    }
  }
  addProj(p) { p.id = this.nextId++; if (p.mesh) { p.mesh.position.set(p.x, p.y, p.z); this.scene.add(p.mesh); } this.projectiles.push(p); }
  explode(x, z, t, radius, mini = false, cannon = false) {
    const s = t.stats; let n = 0;
    const hits = [];
    this.near(x, z, radius, b => { hits.push(b); });
    hits.sort((a, b) => b.d - a.d);
    for (const b of hits) { if (n++ >= s.maxHits) break; this.damage(b, s.dmg, t); }
    const p = _v.set(x, 0.3, z), up = _w.set(x, 1.1, z);
    this.fx.ring(p, '#ff8c42', 0.3, radius, 0.35); this.fx.ring(p, '#ffffff', 0.2, radius * 0.7, 0.25, 0.6); this.fx.flash(up, '#ffd23f', radius * 0.7, 0.22);
    this.fx.burst(up, '#ff8c42', mini ? 9 : 22, radius * 2.6, 0.27, 5, 0.5); this.fx.burst(up, '#ffd23f', mini ? 6 : 14, radius * 1.8, 0.2, 4, 0.4);
    this.fx.burst(up, '#3d3d5c', mini ? 3 : 8, radius * 2, 0.16, 7, 0.7);
    this.fx.smoke(_u.set(x, 0.5, z), '#8d8da0', mini ? 3 : 8, radius * 0.6);
    if (!mini) { this.fx.decal(p, '#2a1a12', radius * 0.75, 2.4, 0.4); this.fx.light(up, '#ff8c42', 40, 0.3, radius * 4); this.sound('boom', cannon ? 0.4 : 0.55); }
    if (!mini && s.cluster && !cannon) for (let k = 0; k < s.cluster; k++) { const a = k / s.cluster * Math.PI * 2, rr = radius * 0.95, cx = x + Math.cos(a) * rr, cz = z + Math.sin(a) * rr; this.later(0.12 + k * 0.03, () => this.explode(cx, cz, t, radius * 0.55, true)); }
  }
  later(time, fn) { this.timers.push({ t: time, fn }); }
  // freeze or glue an area
  splash(x, z, t, primary, glue) {
    const s = t.stats, fire = t.def.proj === 'fire'; let n = 0;
    const list = [];
    this.near(x, z, s.area, b => { list.push(b); });
    list.sort((a, b) => ((a.x - x) ** 2 + (a.z - z) ** 2) - ((b.x - x) ** 2 + (b.z - z) ** 2));
    for (const b of list) {
      if (n++ >= s.maxHits) break;
      if (glue) { b.slowT = Math.max(b.slowT, s.slowT); b.slowPct = Math.max(b.slowPct, b.def.boss ? s.slow * 0.5 : s.slow); b.glueT = s.slowT; b.dot = Math.max(b.dot, s.dot || 0); b.dotSrc = t; if (fire) b.burnT = s.slowT; if (s.dmg && n === 1) this.damage(b, s.dmg, t); }
      else {
        if (!b.def.boss) b.frozenT = Math.max(b.frozenT, s.freeze);
        b.slowT = Math.max(b.slowT, s.freeze + s.slowT); b.slowPct = Math.max(b.slowPct, b.def.boss ? s.slow * 0.6 : s.slow);
        const dmg = (b === primary || n === 1 ? s.dmg : 0) + (s.shatter || 0);
        if (dmg > 0) this.damage(b, dmg, t);
      }
    }
    const p = _v.set(x, 1.6, z), g = _w.set(x, 0.12, z);
    if (fire) { this.fx.burst(p, '#ff8c42', 18, s.area * 3, 0.22, 4, 0.5); this.fx.flames(g, 10, s.area * 1.2); this.fx.flash(p, '#ff8c42', s.area * 0.8, 0.2); this.fx.decal(g, '#2a1a12', s.area, 2.5, 0.45); this.fx.ring(g, '#ffd23f', 0.3, s.area + 0.3, 0.3); this.fx.light(p, '#ff8c42', 20, 0.3, 8); }
    else if (glue) { this.fx.burst(p, '#c5f277', 16, s.area * 3, 0.2, 3, 0.5); this.fx.decal(g, '#9bd447', s.area, 3, 0.55); this.fx.ring(g, '#c5f277', 0.3, s.area + 0.3, 0.3); }
    else { this.fx.burst(p, '#bfe8ff', 18, s.area * 3, 0.2, 3, 0.5); this.fx.burst(p, '#ffffff', 8, s.area * 2, 0.14, 2, 0.4); this.fx.ring(g, '#7df9ff', 0.3, s.area + 0.4, 0.35); this.fx.smoke(g, '#e6f7ff', 4, s.area); this.fx.decal(g, '#dff6ff', s.area * 0.9, 2, 0.5); }
  }

  // ---------- one fixed step ----------
  update(dt) {
    this.tick++;
    if (this.over) return;
    this.time += dt;
    if (this.autoT > 0) { this.autoT -= dt; if (this.autoT <= 0) this.startWave(); }
    for (let i = this.timers.length - 1; i >= 0; i--) { const tm = this.timers[i]; tm.t -= dt; if (tm.t <= 0) { this.timers.splice(i, 1); tm.fn(); } }
    if (this.waveActive) {
      this.waveT += dt;
      while (this.qi < this.queue.length && this.queue[this.qi].t <= this.waveT) { this.spawn(this.queue[this.qi].type, 0); this.qi++; }
    }
    const path = this.map.path;
    for (const b of this.balloons) {
      if (!b.alive) continue;
      if (b.spawnT < 1) b.spawnT += dt * 3;
      if (b.hitT > 0) b.hitT -= dt;
      if (b.frozenT > 0) b.frozenT -= dt;
      if (b.stunT > 0) b.stunT -= dt;
      if (b.slowT > 0) { b.slowT -= dt; if (b.slowT <= 0) { b.slowPct = 0; b.dot = 0; } }
      if (b.glueT > 0) b.glueT -= dt;
      if (b.dot > 0 && b.glueT > 0) { b.dotT += dt; if (b.dotT >= 1) { b.dotT = 0; this.damage(b, b.dot, b.dotSrc); if (!b.alive) continue; } }
      b.d += this.effSpeed(b) * dt;
      if (b.d >= this.leakAt) { this.leak(b); continue; }
      path.at(b.d, _v); b.x = _v.x; b.z = _v.z;
      if (b.def.boss) b.heading = path.heading(b.d);
    }
    if (this.balloons.length > 64 && this.balloons.some(b => !b.alive)) this.balloons = this.balloons.filter(b => b.alive);
    this.rebuildGrid();
    this.updateTowers(dt);
    this.updateProjectiles(dt);
    if (this.balloons.length && !this.balloons.some(b => b.alive)) this.balloons.length = 0;
    if (!this.over && this.waveActive && this.qi >= this.queue.length && !this.balloons.some(b => b.alive)) this.endWave();
  }
  leak(b) {
    b.alive = false;
    let lost = Math.max(1, Math.round(b.hp + b.kids.reduce((s, c) => s + rbe(c, this.scale.hp), 0) * (b.pm || 1)));
    // a boss that gets through hurts a lot, but only the King takes everything
    const cap = { boss1: 0.25, giant: 0.4, colossal: 0.6, king: 1 }[b.type];
    if (cap) lost = Math.min(lost, Math.ceil(this.diff.lives * cap));
    // a boss with 1% life left only does 1% of its damage
    if (b.def.boss) lost = Math.max(1, Math.round(lost * Math.max(0, b.hp) / b.maxHp));
    this.lives = Math.max(0, this.lives - lost); this.stats.leaked += lost;
    this.fx.burst(_v.set(b.x, 2, b.z), '#ff4d6d', 10, 3, 0.2, 4, 0.4);
    this.sound('leak', 0.6);
    this.emit('leak', { lost });
    if (this.lives <= 0 && !this.over) { this.over = true; this.won = false; this.sound('defeat'); this.emit('gameover'); }
  }
  updateTowers(dt) {
    for (const t of this.towers) { t.buff = 0; t.buffR = 0; }
    for (const d of this.towers) {
      if (d.isFarm || d.def.kind !== 'support') continue;
      const r2 = d.stats.range * d.stats.range;
      for (const t of this.towers) if (t !== d && !t.isFarm && t.def.kind !== 'support' && (t.x - d.x) ** 2 + (t.z - d.z) ** 2 <= r2) { t.buff = Math.max(t.buff, d.stats.boost); t.buffR = Math.max(t.buffR, d.stats.rangeUp || 0); }
      // the beat
      d.beatT = (d.beatT || 0) + dt;
      if (d.beatT >= d.stats.cd) {
        d.beatT = 0; d.atk = 0; d.hop = 0.5;
        if (this.waveActive) { this.fx.ring(_v.set(d.x, d.y + 0.2, d.z), d.def.colors[1], 0.5, d.stats.range, 0.5, 0.45); if (Math.random() < 0.35) this.sound('click', 0.25); }
        for (const t of this.towers) if (t.buff > 0 && Math.random() < 0.25) this.fx.emit({ p: _w.set(t.x, t.y + 2.4, t.z), v: _u.set(0, 1.5, 0), life: 0.7, size: 0.13, color: '#ffd23f', g: 0, drag: 0.5 }, true);
      }
    }
    for (const t of this.towers) {
      if (t.isFarm) {
        if (this.waveActive && t.drops < FARM_DROPS) { t.dropT -= dt; if (t.dropT <= 0) { t.dropT = 3.5 + this.rnd() * 1.5; t.drops++; const amt = farmIncome(t.def, t.lvl, this.diff) * 0.5 / FARM_DROPS; this.pay(t.owner, amt); t.earned += amt; this.farmFx(t, amt, false); } }
        continue;
      }
      const s = t.stats;
      if (t.def.kind === 'support') continue;
      t.cd -= dt * (1 + (t.buff || 0));
      if (s.blizzard) { t.blizT += dt; if (t.blizT >= 3) { t.blizT = 0; let any = false; this.near(t.x, t.z, s.range, b => { any = true; if (!b.def.boss) b.frozenT = Math.max(b.frozenT, s.freeze * 0.7); b.slowT = Math.max(b.slowT, s.freeze + s.slowT); b.slowPct = Math.max(b.slowPct, s.slow); }); if (any) { this.fx.ring(_v.set(t.x, 0.3, t.z), '#bfe8ff', 0.5, s.range, 0.6, 0.7); this.fx.burst(_v.set(t.x, 2, t.z), '#ffffff', 30, s.range * 0.8, 0.18, 3, 0.8); this.fx.smoke(_v.set(t.x, 0.3, t.z), '#e6f7ff', 10, s.range * 0.8); this.sound('freeze', 0.8); } } }
      if (t.cd <= 0) {
        const b = this.findTarget(t, s.range + (t.buffR || 0));
        if (b) { this.attack(t, b); t.cd = s.cd; } else t.cd = 0.05;
      }
    }
  }
  updateProjectiles(dt) {
    const keep = [];
    for (const p of this.projectiles) {
      let alive = true;
      if (p.kind === 'dart' || p.kind === 'ice' || p.kind === 'glue') {
        p.x += p.dx * p.speed * dt; p.z += p.dz * p.speed * dt; p.life -= dt;
        if (p.kind === 'dart') {
          p.hit = p.hit || new Set();
          this.near(p.x, p.z, p.r, b => {
            if (p.hit.has(b.id) || b.skip === p.id) return;
            p.hit.add(b.id); this.damage(b, p.dmg, p.tower, p.id);
            if (--p.pierce <= 0) { alive = false; return false; }
          });
        } else {
          let hitB = null; this.near(p.x, p.z, 0.5, b => { hitB = b; return false; });
          if (hitB) { this.splash(p.x, p.z, p.tower, hitB, p.kind === 'glue'); alive = false; }
        }
        if (p.life <= 0) { if (p.kind !== 'dart') this.splash(p.x, p.z, p.tower, null, p.kind === 'glue'); alive = false; }
        if (p.mesh) { p.mesh.position.set(p.x, p.y, p.z); p.mesh.rotation.y = p.spin ? p.mesh.rotation.y + dt * 25 : Math.atan2(p.dx, p.dz); if (p.kind !== 'dart') p.mesh.rotation.x += dt * 10; }
        if (p.trail && Math.random() < 0.55) this.fx.trail(_v.set(p.x, p.y, p.z), p.trail, 0.12);
      } else if (p.kind === 'magic') {
        if (!p.target || !p.target.alive) { let best = null, bd = 1e9; this.near(p.x, p.z, 10, b => { if (p.hit.has(b.id)) return; const d = (b.x - p.x) ** 2 + (b.z - p.z) ** 2; if (d < bd) { bd = d; best = b; } }); p.target = best; }
        if (p.target) { const dx = p.target.x - p.x, dz = p.target.z - p.z, l = Math.hypot(dx, dz) || 1, turn = Math.min(1, dt * 7); p.dx += (dx / l - p.dx) * turn; p.dz += (dz / l - p.dz) * turn; const n = Math.hypot(p.dx, p.dz) || 1; p.dx /= n; p.dz /= n; }
        p.x += p.dx * p.speed * dt; p.z += p.dz * p.speed * dt; p.life -= dt;
        this.near(p.x, p.z, p.r, b => { if (p.hit.has(b.id) || b.skip === p.id) return; p.hit.add(b.id); this.damage(b, p.dmg, p.tower, p.id); this.fx.burst(_v.set(b.x, 1.9, b.z), '#ffd23f', 6, 3, 0.13, 3, 0.3); if (b === p.target) p.target = null; if (--p.pierce <= 0) { alive = false; return false; } });
        if (p.life <= 0) alive = false;
        if (p.mesh) {
          p.mesh.position.set(p.x, p.y + Math.sin(p.life * 12) * 0.15, p.z);
          if (p.bee) { p.mesh.rotation.y = Math.atan2(p.dx, p.dz); for (const w of p.mesh.userData.wings) w.rotation.y = Math.sin(this.time * 60 + p.id) * 0.8 * w.userData.s; }
          else p.mesh.rotation.y += dt * 8;
        }
        if (!p.bee && Math.random() < 0.8) this.fx.trail(_v.set(p.x, p.y, p.z), Math.random() < 0.5 ? '#ffd23f' : '#ff6fd8', 0.16);
      } else if (p.kind === 'boom') {
        p.s += dt / p.dur;
        const fwd = Math.sin(Math.PI * Math.min(1, p.s)) * p.D, lat = Math.sin(Math.PI * 2 * Math.min(1, p.s)) * p.D * 0.42 * p.side, ca = Math.cos(p.a), sa = Math.sin(p.a);
        p.x = p.ox + sa * fwd + ca * lat; p.z = p.oz + ca * fwd - sa * lat;
        this.near(p.x, p.z, p.r, b => { if (p.hit.has(b.id) || b.skip === p.id || p.pierce <= 0) return; p.hit.add(b.id); this.damage(b, p.dmg, p.tower, p.id); p.pierce--; });
        if (p.mesh) { p.mesh.position.set(p.x, p.y + Math.sin(Math.PI * p.s) * 0.4, p.z); p.mesh.rotation.y += dt * 22; }
        if (Math.random() < 0.6) this.fx.trail(_v.set(p.x, p.y, p.z), p.tower.stats.blaze ? '#ff8c42' : '#ffe08a', 0.18);
        if (p.tower.stats.blaze && Math.random() < 0.4) this.fx.flames(_v.set(p.x, p.y - 0.2, p.z), 1, 0.3);
        if (p.s >= 1) alive = false;
      } else if (p.kind === 'bomb') {
        p.s += dt / p.dur; const k = Math.min(1, p.s);
        p.x = p.sx + (p.tx - p.sx) * k; p.z = p.sz + (p.tz - p.sz) * k; p.y = p.sy * (1 - k) + 1.2 * k + (p.cannon ? 0 : Math.sin(Math.PI * k) * 3.2);
        let early = false;
        if (k > (p.cannon ? 0.2 : 0.55)) this.near(p.x, p.z, 0.35, () => { early = true; return false; });
        if (p.mesh) {
          if (p.rocket) { p.mesh.lookAt(p.x + (p.tx - p.sx) * 0.01, p.sy * (1 - Math.min(1, p.s + 0.01)) + 1.2 * Math.min(1, p.s + 0.01) + Math.sin(Math.PI * Math.min(1, p.s + 0.01)) * 3.2, p.z + (p.tz - p.sz) * 0.01); }
          else p.mesh.rotation.x += dt * 8;
          p.mesh.position.set(p.x, p.y, p.z);
        }
        if (p.rocket) { if (Math.random() < 0.3) this.fx.emit({ p: _v.set(p.x, p.y, p.z), v: _w.set(0, 0.6, 0), life: 0.6, size: 0.22, color: '#f1f3f5', g: 0, drag: 1, grow: 0.8 }); this.fx.trail(_v.set(p.x, p.y, p.z), '#ff8c42', 0.22); }
        else if (Math.random() < 0.7) this.fx.trail(_v.set(p.x, p.y + (p.cannon ? 0 : 0.35), p.z), p.cannon ? '#adb5bd' : '#ffd23f', p.cannon ? 0.2 : 0.14);
        if (early || p.s >= 1) { this.explode(p.x, p.z, p.tower, p.tower.stats.radius, false, p.cannon); alive = false; }
      }
      if (alive) keep.push(p); else if (p.mesh) p.mesh.removeFromParent();
    }
    this.projectiles = keep;
  }
  // per-frame looks (not part of the fixed step)
  visuals(dt, t) {
    for (const tw of this.towers) {
      const m = tw.model;
      // dropping in from the sky, a squash when it lands, and a little grow when the mouse is on it
      let dy = 0;
      if (tw.fallT > 0) { tw.fallT -= dt; const k = Math.max(0, tw.fallT / DROP); dy = k * k * 9; if (tw.fallT <= 0) this.land(tw); }
      if (tw.squash > 0) tw.squash = Math.max(0, tw.squash - dt * 2.6);
      tw.hoverK = (tw.hoverK || 0) + ((this.hover === tw ? 1 : 0) - (tw.hoverK || 0)) * Math.min(1, dt * 12);
      const sq = tw.squash > 0 ? Math.cos((1 - tw.squash) * Math.PI * 2.5) * tw.squash : 0, grow = (tw.base || 1) * (1 + tw.hoverK * 0.09);
      m.root.scale.set(grow * (1 + sq * 0.2), grow * (1 - sq * 0.28), grow * (1 + sq * 0.2));
      if (tw.isFarm) { m.update(dt); m.root.position.y = tw.y + dy; continue; }
      let d = tw.facing - m.root.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
      m.root.rotation.y += d * Math.min(1, dt * 14);
      if (tw.atk >= 0) { tw.atk += dt / Math.min(0.4, Math.max(0.16, tw.stats.cd * 0.6)); if (tw.atk > 1) tw.atk = -1; }
      if (tw.cheerT > 0) tw.cheerT -= dt;
      if (tw.hop > 0) tw.hop = Math.max(0, tw.hop - dt * 2.5);
      const k = tw.def.kind, cast = k === 'chain' || k === 'magic';
      m.update(dt, { speed: 0, attack: cast || k === 'tack' ? -1 : tw.atk, cast: cast ? tw.atk : -1, spin: k === 'tack' && tw.atk >= 0 ? tw.atk : -1, melee: k === 'dart' || k === 'boom' || k === 'bomb', dance: this.won || tw.cheerT > 0 });
      m.root.position.y = tw.y + Math.sin(tw.hop * Math.PI) * 0.8 + dy;
      // glued balloons drip, frozen ones sparkle a little
    }
    for (const b of this.balloons) if (b.alive && b.stunT > 0 && Math.random() < dt * 14) this.fx.sparks(_v.set(b.x + (Math.random() - 0.5), 1.6 + Math.random(), b.z + (Math.random() - 0.5)), Math.random() < 0.5 ? '#7df9ff' : '#fff3b0', 2);
    for (const b of this.balloons) if (b.alive && b.burnT > 0 && b.glueT > 0 && Math.random() < dt * 8) this.fx.flames(_v.set(b.x, 1.6, b.z), 1, 0.5);
    for (const b of this.balloons) if (b.alive && Math.random() < dt * 3) { if (b.glueT > 0 && !(b.burnT > 0)) this.fx.emit({ p: _v.set(b.x, 1.3, b.z), v: _w.set(0, -1, 0), life: 0.5, size: 0.1, color: '#c5f277', g: -8 }); else if (b.frozenT > 0) this.fx.sparks(_v.set(b.x, 2, b.z), '#ffffff', 1); }
    this.view.update(this.balloons, t);
  }
  dispose() {
    for (const t of this.towers) t.model.root.removeFromParent();
    for (const p of this.projectiles) if (p.mesh) p.mesh.removeFromParent();
    this.view.clear();
    this.towers = []; this.projectiles = []; this.balloons = [];
  }
}
