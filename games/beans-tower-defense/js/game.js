// The tower defense itself: waves of balloons and bosses walking the path, beans that find targets and attack,
// projectiles, popping layers into smaller balloons, farms, money, lives, upgrades and selling. Fixed time step.
import { THREE, canvasTex } from './engine.js';
import { BALLOONS, BEAN, FARM, beanStats, priceOf, upgradePrice, skinFor, rbe, makeWave, waveBonus, waveInfo, waveScale, bossHpScale, bossChildren, farmIncome, UP_COST } from './data.js';
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
  glow: new THREE.SphereGeometry(0.5, 10, 8)
};
const add = (c, o = 0.4) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });
const MATS = {
  dart: new THREE.MeshStandardMaterial({ color: '#dfe6ee', metalness: 0.6, roughness: 0.3 }), fin: new THREE.MeshStandardMaterial({ color: '#3a86ff' }),
  star: new THREE.MeshStandardMaterial({ color: '#cfd6de', metalness: 0.8, roughness: 0.2 }), tack: new THREE.MeshStandardMaterial({ color: '#e9ecef', metalness: 0.7, roughness: 0.25 }),
  boom: new THREE.MeshStandardMaterial({ color: '#ffb703', roughness: 0.4 }), blaze: new THREE.MeshStandardMaterial({ color: '#ff8c42', emissive: '#ff5a00', emissiveIntensity: 1.2 }),
  bomb: new THREE.MeshStandardMaterial({ color: '#2b2d42', roughness: 0.3 }), ball: new THREE.MeshStandardMaterial({ color: '#343a40', metalness: 0.6, roughness: 0.3 }),
  ice: new THREE.MeshStandardMaterial({ color: '#bfe8ff', emissive: '#4cc9f0', emissiveIntensity: 0.9, roughness: 0.1 }), iceGlow: add('#7df9ff', 0.35),
  glue: new THREE.MeshPhysicalMaterial({ color: '#c5f277', roughness: 0.15, clearcoat: 1, emissive: '#4f7a00', emissiveIntensity: 0.3 }), glueGlow: add('#c5f277', 0.25),
  magic: new THREE.MeshStandardMaterial({ color: '#fff3b0', emissive: '#ffd23f', emissiveIntensity: 1.6 }), magicGlow: add('#ff6fd8', 0.45)
};
let POP_TEX = null;
function popTex() { return POP_TEX || (POP_TEX = canvasTex(128, 64, (g, w, h) => { g.translate(w / 2, h / 2); g.fillStyle = '#ffd23f'; g.beginPath(); for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2, r = i % 2 ? 22 : 34; g.lineTo(Math.cos(a) * r * 1.6, Math.sin(a) * r * 0.85); } g.closePath(); g.fill(); g.strokeStyle = '#2a1546'; g.lineWidth = 4; g.stroke(); g.fillStyle = '#ff4d6d'; g.font = '30px Lilita One, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 6; g.strokeText('POP!', 0, 2); g.fillText('POP!', 0, 2); })); }

const DROP = 0.42;   // seconds a new bean falls before it lands
export class Game {
  constructor({ map, diff, rounds, fx, audio, view }) {
    this.map = map; this.diff = diff; this.rounds = diff.infinite ? Infinity : rounds; this.fx = fx; this.audio = audio; this.view = view; this.scene = map.scene;
    this.money = diff.money; this.lives = diff.lives; this.wave = 0; this.cleared = 0; this.waveActive = false;
    this.balloons = []; this.towers = []; this.projectiles = []; this.timers = [];
    this.queue = []; this.qi = 0; this.waveT = 0; this.time = 0; this.scale = waveScale(1, diff);
    this.over = false; this.won = false; this.auto = false; this.autoT = -1;
    this.stats = { popped: 0, leaked: 0, bosses: 0 };
    this.listeners = []; this.nextId = 1; this.pops = 0;
    this.grid = Array.from({ length: GW * GH }, () => []);
    this.leakAt = map.path.len - 6;
  }
  on(fn) { this.listeners.push(fn); }
  emit(type, d) { for (const f of this.listeners) f(type, d); }
  sound(name, v) { if (this.audio) this.audio.sfx(name, v); }

  // ---------- waves ----------
  startWave() {
    if (this.waveActive || this.over) return false;
    this.wave++;
    this.scale = waveScale(this.wave, this.diff);
    const groups = makeWave(this.wave, this.diff, this.rounds), q = [];
    for (const g of groups) for (let i = 0; i < g.n; i++) q.push({ t: (g.at || 0) + i * g.gap, type: g.t });
    q.sort((a, b) => a.t - b.t);
    this.queue = q; this.qi = 0; this.waveT = 0; this.waveActive = true; this.autoT = -1;
    for (const t of this.towers) if (t.isFarm) { t.drops = 0; t.dropT = 1 + Math.random() * 2; }
    const info = waveInfo(this.wave, this.rounds);
    this.sound(info.boss ? 'boss' : 'wave');
    this.emit('wave', { wave: this.wave, boss: info.boss, final: info.final, type: info.type, count: q.length });
    return true;
  }
  endWave() {
    if (this.over) return;
    this.waveActive = false; this.cleared = this.wave;
    const bonus = Math.round(waveBonus(this.wave) * this.diff.cash);
    this.money += bonus;
    // farms pay out what they did not drop during the wave
    for (const t of this.towers) if (t.isFarm) {
      const inc = farmIncome(t.def, t.lvl, this.diff), pay = Math.round(inc * 0.5 + (FARM_DROPS - t.drops) * inc * 0.5 / FARM_DROPS);
      this.money += pay; t.earned += pay; this.farmFx(t, pay, true);
    }
    for (const t of this.towers) if (!t.isFarm) t.cheerT = 1.3;
    this.sound('waveDone');
    this.emit('waveEnd', { wave: this.wave, bonus });
    if (this.wave >= this.rounds) { this.over = true; this.won = true; this.sound('victory'); this.emit('victory'); }
    else if (this.auto) this.autoT = 1.2;
  }

  // ---------- balloons ----------
  spawn(type, d = 0, parent = null) {
    const def = BALLOONS[type], sc = this.scale;
    const hp = Math.max(1, Math.round(def.hp * (def.boss ? bossHpScale(type, this.wave) * sc.hp : def.tough ? sc.hp : 1)));
    const b = { id: this.nextId++, type, def, d, hp, maxHp: hp, speed: def.speed * sc.speed, x: 0, z: 0, alive: true, frozenT: 0, slowT: 0, slowPct: 0, glueT: 0, dot: 0, dotT: 0, hitT: 0, spawnT: parent ? 1 : 0, heading: 0, skip: 0,
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
    this.money += b.def.cash * this.diff.cash;
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
  place(id, x, z, isFarm = false, free = false) {
    const def = isFarm ? FARM[id] : BEAN[id], cost = free ? 0 : this.price(def), r = isFarm ? 1.75 : 1.1;
    if (!def) return null;
    if (!free && (this.over || this.money < cost || !this.map.canPlace(x, z, this.towers, r))) return null;
    this.money -= cost;
    const y = this.map.heightAt(x, z);
    let t;
    if (isFarm) {
      const model = new FarmModel(id); model.root.position.set(x, y, z); model.root.rotation.y = Math.round(Math.random() * 3) * Math.PI / 2; this.scene.add(model.root);
      t = { id: this.nextId++, isFarm: true, def, x, z, y, r, lvl: 0, spent: cost, model, drops: 0, dropT: 2, earned: 0, pops: 0 };
    } else {
      const model = new TowerBean(id, def.colors); model.root.scale.setScalar(1.75);
      model.root.position.set(x, y, z); model.root.rotation.y = Math.PI;
      model.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
      this.scene.add(model.root);
      t = { id: this.nextId++, def, x, z, y, r, lvl: 0, spent: cost, cd: 0.2, target: def.target, model, facing: Math.PI, atk: -1, pops: 0, blizT: 0, cheerT: 0, hop: 0, stats: beanStats(def, 0) };
    }
    t.base = t.model.root.scale.x;
    this.towers.push(t);
    if (free) return t;
    // it drops in from the sky and lands with a thump (see land)
    t.dropT = DROP; t.model.root.position.y = y + 9;
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
  upgradeCost(t) { return t.isFarm ? (t.lvl >= 10 ? null : priceOf(t.def.cost * UP_COST[t.lvl], this.diff)) : upgradePrice(t.def, t.lvl, this.diff); }
  upgrade(t, quiet) {
    const cost = this.upgradeCost(t);
    if (cost === null || this.money < cost || this.over) return false;
    this.money -= cost; t.spent += cost; t.lvl++;
    const skin = skinFor(t.lvl), p = _v.set(t.x, t.y, t.z);
    if (t.isFarm) { t.model.setSkin(skin); t.model.pop(); }
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
  upgradeAll(list) {
    const ready = list.filter(t => this.upgradeCost(t) !== null), cost = this.upgradeAllCost(ready);
    if (!ready.length || this.money < cost || this.over) return 0;
    for (const t of ready) this.upgrade(t, true);
    this.sound('upgrade');
    return ready.length;
  }
  level(t) { return t.lvl; }
  sellValue(t) { return Math.round(t.spent * SELL_BACK); }
  sell(t) {
    const i = this.towers.indexOf(t); if (i < 0) return 0;
    const v = this.sellValue(t);
    this.money += v; this.towers.splice(i, 1);
    this.fx.burst(_v.set(t.x, t.y + 1, t.z), '#ffd23f', 24, 5, 0.2, 5, 0.6); this.fx.smoke(_v.set(t.x, t.y, t.z), '#e8e1d6', 10, 1.4);
    t.model.root.removeFromParent();
    this.sound('sell');
    this.emit('money');
    return v;
  }
  farmFx(t, amount, big) {
    const p = _v.set(t.x, t.y + 1.2, t.z);
    this.fx.burst(p, '#ffd23f', big ? 22 : 10, big ? 4 : 2.5, 0.2, big ? 9 : 6, 0.8); this.fx.sparks(p, '#fff3b0', big ? 10 : 4);
    if (big) this.fx.ring(_w.set(t.x, t.y + 0.1, t.z), '#ffd23f', 0.5, 3, 0.5);
    t.model.pop();
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
  effSpeed(b) { return b.frozenT > 0 ? (b.def.boss ? b.speed * 0.5 : 0) : b.slowT > 0 ? b.speed * (1 - b.slowPct) : b.speed; }
  lead(b, time, out) { return this.map.path.at(Math.min(this.leakAt, b.d + this.effSpeed(b) * time), out); }
  handPos(t, out) { if (t.model.muzzle) return t.model.muzzle.getWorldPosition(out); return out.set(t.x + Math.sin(t.facing) * 0.9, t.y + 1.7, t.z + Math.cos(t.facing) * 0.9); }

  // ---------- attacks ----------
  attack(t, b) {
    const s = t.stats, k = t.def.kind, hand = this.handPos(t, new THREE.Vector3());
    t.facing = Math.atan2(b.x - t.x, b.z - t.z); t.atk = 0;
    const dist = Math.hypot(b.x - t.x, b.z - t.z);
    if (k === 'dart') {
      const star = t.def.proj === 'star', aim = this.lead(b, dist / s.speed, new THREE.Vector3()), base = Math.atan2(aim.x - t.x, aim.z - t.z);
      for (let i = 0; i < s.count; i++) {
        const a = base + (i - (s.count - 1) / 2) * s.spread;
        let m; if (star) m = new THREE.Mesh(GEO.star, MATS.star); else { m = new THREE.Group(); m.add(new THREE.Mesh(GEO.dart, MATS.dart)); m.add(new THREE.Mesh(GEO.fin, MATS.fin)); }
        this.addProj({ kind: 'dart', x: t.x, z: t.z, y: t.y + 1.7, dx: Math.sin(a), dz: Math.cos(a), speed: s.speed, life: (s.range + 3) / s.speed, pierce: s.pierce, dmg: s.dmg, r: 0.55, tower: t, mesh: m, spin: star, trail: star ? '#c77dff' : '#ffffff' });
      }
      this.fx.burst(hand, star ? '#c77dff' : '#ffffff', 6, 3, 0.12, 2, 0.25);
      if (star) this.fx.slash(_w.set(t.x, t.y + 1.4, t.z), t.facing, '#c77dff', 1.6, 2.2, 0.3, 0.18);
      this.sound('throw', 0.55);
    } else if (k === 'tack') {
      for (let i = 0; i < s.count; i++) {
        const a = t.facing + i / s.count * Math.PI * 2;
        this.addProj({ kind: 'dart', x: t.x, z: t.z, y: t.y + 1.1, dx: Math.sin(a), dz: Math.cos(a), speed: s.speed, life: (s.range + 0.8) / s.speed, pierce: s.pierce, dmg: s.dmg, r: 0.5, tower: t, mesh: new THREE.Mesh(GEO.tack, s.dmg > 1 ? MATS.blaze : MATS.tack), trail: s.dmg > 1 ? '#ff8c42' : '#ffffff' });
      }
      this.fx.ring(_v.set(t.x, t.y + 0.9, t.z), '#ffffff', 0.4, 2.2, 0.25, 0.7); this.fx.sparks(_v.set(t.x, t.y + 1.1, t.z), '#e9ecef', 8);
      this.sound('throw', 0.5);
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
        this.addProj({ kind: 'bomb', cannon, sx: hand.x, sz: hand.z, sy: hand.y, tx: aim.x + Math.cos(t.facing) * off, tz: aim.z - Math.sin(t.facing) * off, s: 0, dur: time + i * 0.06, x: hand.x, z: hand.z, y: hand.y, tower: t, mesh: new THREE.Mesh(cannon ? GEO.ball : GEO.bomb, cannon ? MATS.ball : MATS.bomb) });
      }
      if (cannon) { this.fx.flash(hand, '#ffd23f', 1.6, 0.14); this.fx.smoke(hand, '#adb5bd', 10, 0.8); this.fx.burst(hand, '#ff8c42', 10, 5, 0.16, 2, 0.3); t.model.hit(); this.sound('boom', 0.35); }
      else { this.fx.sparks(hand, '#ffd23f', 6); this.sound('lob', 0.55); }
    } else if (k === 'ice' || k === 'glue') {
      const glue = k === 'glue', aim = this.lead(b, dist / s.speed, new THREE.Vector3()), l = Math.hypot(aim.x - t.x, aim.z - t.z) || 1;
      const m = new THREE.Group(); m.add(new THREE.Mesh(glue ? GEO.glue : GEO.ice, glue ? MATS.glue : MATS.ice)); const gl = new THREE.Mesh(GEO.glow, glue ? MATS.glueGlow : MATS.iceGlow); gl.scale.setScalar(0.9); m.add(gl);
      this.addProj({ kind: glue ? 'glue' : 'ice', x: hand.x, z: hand.z, y: hand.y, dx: (aim.x - hand.x) / l, dz: (aim.z - hand.z) / l, speed: s.speed, life: (l + 2) / s.speed, tower: t, mesh: m, trail: glue ? '#c5f277' : '#bfe8ff' });
      this.fx.burst(hand, glue ? '#c5f277' : '#bfe8ff', 8, 3, 0.15, 2, 0.35);
      this.sound(glue ? 'splat' : 'freeze', 0.5);
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
    } else if (k === 'magic') {
      for (let i = 0; i < s.count; i++) {
        const a = t.facing + (i - (s.count - 1) / 2) * 0.7;
        const m = new THREE.Group(); m.add(new THREE.Mesh(GEO.magic, MATS.magic)); const gl = new THREE.Mesh(GEO.glow, MATS.magicGlow); gl.scale.setScalar(1.1); m.add(gl);
        this.addProj({ kind: 'magic', x: hand.x, z: hand.z, y: hand.y, dx: Math.sin(a), dz: Math.cos(a), speed: s.speed, life: 3, pierce: s.pierce, dmg: s.dmg, r: 0.6, tower: t, mesh: m, target: b, hit: new Set() });
      }
      this.fx.burst(hand, '#ffd23f', 10, 3, 0.15, 3, 0.4); this.fx.burst(hand, '#ff6fd8', 6, 2.5, 0.13, 3, 0.4);
      this.sound('magic', 0.5);
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
    for (let i = 0; i < n; i++) { const o = hits[i].o; this.damage(o, s.dmg, t); this.fx.sparks(_v.set(o.x, 1.9, o.z), '#ff6fb5', 4); }
    const to = new THREE.Vector3(t.x + ux * endA, 1.8, t.z + uz * endA);
    this.fx.beam(from, to, '#ff006e', 0.5, 0.22); this.fx.beam(from, to, '#ffffff', 0.16, 0.18); this.fx.flash(from, '#ff6fb5', 0.9, 0.12); this.fx.flash(to, '#ff006e', 1, 0.15);
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
    const s = t.stats; let n = 0;
    const list = [];
    this.near(x, z, s.area, b => { list.push(b); });
    list.sort((a, b) => ((a.x - x) ** 2 + (a.z - z) ** 2) - ((b.x - x) ** 2 + (b.z - z) ** 2));
    for (const b of list) {
      if (n++ >= s.maxHits) break;
      if (glue) { b.slowT = Math.max(b.slowT, s.slowT); b.slowPct = Math.max(b.slowPct, b.def.boss ? s.slow * 0.5 : s.slow); b.glueT = s.slowT; b.dot = Math.max(b.dot, s.dot || 0); b.dotSrc = t; }
      else {
        if (!b.def.boss) b.frozenT = Math.max(b.frozenT, s.freeze);
        b.slowT = Math.max(b.slowT, s.freeze + s.slowT); b.slowPct = Math.max(b.slowPct, b.def.boss ? s.slow * 0.6 : s.slow);
        const dmg = (b === primary || n === 1 ? s.dmg : 0) + (s.shatter || 0);
        if (dmg > 0) this.damage(b, dmg, t);
      }
    }
    const p = _v.set(x, 1.6, z), g = _w.set(x, 0.12, z);
    if (glue) { this.fx.burst(p, '#c5f277', 16, s.area * 3, 0.2, 3, 0.5); this.fx.decal(g, '#9bd447', s.area, 3, 0.55); this.fx.ring(g, '#c5f277', 0.3, s.area + 0.3, 0.3); }
    else { this.fx.burst(p, '#bfe8ff', 18, s.area * 3, 0.2, 3, 0.5); this.fx.burst(p, '#ffffff', 8, s.area * 2, 0.14, 2, 0.4); this.fx.ring(g, '#7df9ff', 0.3, s.area + 0.4, 0.35); this.fx.smoke(g, '#e6f7ff', 4, s.area); this.fx.decal(g, '#dff6ff', s.area * 0.9, 2, 0.5); }
  }

  // ---------- one fixed step ----------
  update(dt) {
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
    let lost = Math.max(1, Math.round(b.hp + b.kids.reduce((s, c) => s + rbe(c, this.scale.hp), 0)));
    // a boss that gets through hurts a lot, but only the King takes everything
    const cap = { boss1: 0.25, giant: 0.4, colossal: 0.6, king: 1 }[b.type];
    if (cap) lost = Math.min(lost, Math.ceil(this.diff.lives * cap));
    this.lives = Math.max(0, this.lives - lost); this.stats.leaked += lost;
    this.fx.burst(_v.set(b.x, 2, b.z), '#ff4d6d', 10, 3, 0.2, 4, 0.4);
    this.sound('leak', 0.6);
    this.emit('leak', { lost });
    if (this.lives <= 0 && !this.over) { this.over = true; this.won = false; this.sound('defeat'); this.emit('gameover'); }
  }
  updateTowers(dt) {
    for (const t of this.towers) {
      if (t.isFarm) {
        if (this.waveActive && t.drops < FARM_DROPS) { t.dropT -= dt; if (t.dropT <= 0) { t.dropT = 3.5 + Math.random() * 1.5; t.drops++; const amt = farmIncome(t.def, t.lvl, this.diff) * 0.5 / FARM_DROPS; this.money += amt; t.earned += amt; this.farmFx(t, amt, false); } }
        continue;
      }
      const s = t.stats;
      t.cd -= dt;
      if (s.blizzard) { t.blizT += dt; if (t.blizT >= 3) { t.blizT = 0; let any = false; this.near(t.x, t.z, s.range, b => { any = true; if (!b.def.boss) b.frozenT = Math.max(b.frozenT, s.freeze * 0.7); b.slowT = Math.max(b.slowT, s.freeze + s.slowT); b.slowPct = Math.max(b.slowPct, s.slow); }); if (any) { this.fx.ring(_v.set(t.x, 0.3, t.z), '#bfe8ff', 0.5, s.range, 0.6, 0.7); this.fx.burst(_v.set(t.x, 2, t.z), '#ffffff', 30, s.range * 0.8, 0.18, 3, 0.8); this.fx.smoke(_v.set(t.x, 0.3, t.z), '#e6f7ff', 10, s.range * 0.8); this.sound('freeze', 0.8); } } }
      if (t.cd <= 0) {
        const b = this.findTarget(t, s.range);
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
        if (p.mesh) { p.mesh.position.set(p.x, p.y + Math.sin(p.life * 12) * 0.15, p.z); p.mesh.rotation.y += dt * 8; }
        if (Math.random() < 0.8) this.fx.trail(_v.set(p.x, p.y, p.z), Math.random() < 0.5 ? '#ffd23f' : '#ff6fd8', 0.16);
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
        if (p.mesh) { p.mesh.position.set(p.x, p.y, p.z); p.mesh.rotation.x += dt * 8; }
        if (Math.random() < 0.7) this.fx.trail(_v.set(p.x, p.y + (p.cannon ? 0 : 0.35), p.z), p.cannon ? '#adb5bd' : '#ffd23f', p.cannon ? 0.2 : 0.14);
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
      if (tw.dropT > 0) { tw.dropT -= dt; const k = Math.max(0, tw.dropT / DROP); dy = k * k * 9; if (tw.dropT <= 0) this.land(tw); }
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
    for (const b of this.balloons) if (b.alive && Math.random() < dt * 3) { if (b.glueT > 0) this.fx.emit({ p: _v.set(b.x, 1.3, b.z), v: _w.set(0, -1, 0), life: 0.5, size: 0.1, color: '#c5f277', g: -8 }); else if (b.frozenT > 0) this.fx.sparks(_v.set(b.x, 2, b.z), '#ffffff', 1); }
    this.view.update(this.balloons, t);
  }
  dispose() {
    for (const t of this.towers) t.model.root.removeFromParent();
    for (const p of this.projectiles) if (p.mesh) p.mesh.removeFromParent();
    this.view.clear();
    this.towers = []; this.projectiles = []; this.balloons = [];
  }
}
