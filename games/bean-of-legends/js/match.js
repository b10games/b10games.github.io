// The match: spawns everything, runs the simulation (movement, combat, AI for minions, towers and
// monsters, vision, gold, XP, items, objectives) and keeps the 3D models in sync.
import { THREE, clamp } from './engine.js';
import { RULES, QUICK, DIFFICULTY, HEROES, HERO, ITEM, MONSTERS, MINIONS, TOWER, CORE, BUFFS, DRAGON_KINDS, BLUE, RED, NEUTRAL, TEAM_COLOR } from './data.js';
import { Unit } from './units.js';
import { LANES, TOWERS, CORES, FOUNTAIN, CAMPS, mirror } from './map.js';
import { Bean, makeMinion, Monster, TowerModel, CoreModel } from './models.js';
import { CAST, KINDS, basicHitExtras } from './abilities.js';
import { Bot } from './ai.js';

const LANE_PREFS = { knight: ['top', 'sup', 'jungle'], ninja: ['jungle', 'mid'], dino: ['jungle', 'top'], shark: ['top', 'jungle'], astro: ['mid', 'sup'], hotdog: ['bot', 'mid'], pigeon: ['bot', 'mid'], banana: ['sup', 'mid'], wizard: ['mid', 'sup'], robot: ['sup', 'top'] };
const SIGHT = { hero: 13, clone: 7, minion: 9, tower: 12, core: 14 };
const _v = new THREE.Vector3();

export class Match {
  constructor(o) {
    this.scene = o.scene; this.map = o.map; this.fx = o.fx; this.audio = o.audio;
    this.diffKey = o.difficulty; this.diff = DIFFICULTY[o.difficulty]; this.quick = !!o.quick;
    this.mult = this.quick ? QUICK : { gold: 1, xp: 1, towerHp: 1, bossFirst: RULES.bossFirst, dragonFirst: RULES.dragonFirst };
    this.time = 0; this.over = false; this.winner = -1; this.endT = 0;
    this.units = []; this.heroes = []; this.towers = []; this.cores = []; this.camps = [];
    this.projectiles = []; this.zones = []; this.timers = []; this.listeners = [];
    this.teams = [0, 1].map(() => ({ kills: 0, towers: 0, dragons: [], gold: 0 }));
    this.grid = new Map(); this.visT = 0; this.pteam = o.team; this.firstBlood = false;
    this.nextWave = this.quick ? 18 : RULES.firstWave; this.waveN = 0; this.spawnQ = [];
    this.listener = { x: 0, z: 0 };
    this.dragonCount = 0;
    this.setupBuildings();
    this.setupHeroes(o);
    this.setupCamps();
  }
  on(fn) { this.listeners.push(fn); }
  emit(type, d) { for (const f of this.listeners) f(type, d); }
  sound(name, x, z, vol = 1) {
    if (!this.audio) return;
    const d = x === undefined ? 0 : Math.hypot(x - this.listener.x, z - this.listener.z);
    if (d > 48) return;
    this.audio.sfx(name, vol * clamp(1.15 - d / 48, 0.15, 1));
  }
  groundY(x, z) { return this.map.heightAt(x, z); }

  // ---------- setup ----------
  addUnit(u, model) {
    u.model = model; u.obj = model ? model.root : null;
    if (u.obj) { u.obj.position.set(u.x, this.groundY(u.x, u.z), u.z); this.scene.add(u.obj); }
    this.units.push(u);
    return u;
  }
  setupBuildings() {
    for (const t of TOWERS) {
      const hp = TOWER.hp[t.tier] * this.mult.towerHp;
      const u = new Unit(this, { kind: 'tower', team: t.team, x: t.x, z: t.z, radius: TOWER.radius, static: true, melee: false, name: (t.team ? 'Red ' : 'Blue ') + t.lane + ' tower', base: { hp, ad: TOWER.ad, armor: TOWER.armor, mr: TOWER.mr, as: TOWER.as, range: TOWER.range, ms: 0 } });
      u.lane = t.lane; u.tier = t.tier; u.heat = 0; u.heatTarget = null;
      this.addUnit(u, new TowerModel(t.team));
      this.towers.push(u);
    }
    for (const team of [BLUE, RED]) {
      const c = CORES[team];
      const u = new Unit(this, { kind: 'core', team, x: c.x, z: c.z, radius: CORE.radius, static: true, name: (team ? 'Red' : 'Blue') + ' Bean Core', base: { hp: CORE.hp * (this.mult.coreHp || 1), armor: CORE.armor, mr: CORE.mr, ms: 0 } });
      this.addUnit(u, new CoreModel(team));
      this.cores.push(u);
    }
  }
  setupHeroes(o) {
    const pool = HEROES.map(h => h.id).filter(id => id !== o.heroId);
    const lanes = ['top', 'jungle', 'mid', 'bot', 'sup'];
    const lineup = [{}, {}];
    const pl = LANE_PREFS[o.heroId][0];
    lineup[o.team][pl] = o.heroId;
    for (const lane of ['sup', 'bot', 'mid', 'jungle', 'top']) for (const team of [o.team, 1 - o.team]) {
      if (lineup[team][lane]) continue;
      pool.sort((a, b) => rank(a, lane) - rank(b, lane));
      lineup[team][lane] = pool.shift();
    }
    function rank(id, lane) { const i = LANE_PREFS[id].indexOf(lane); return i < 0 ? 9 : i; }
    for (const team of [BLUE, RED]) lanes.forEach((lane, k) => {
      const id = lineup[team][lane], def = HERO[id];
      const f = FOUNTAIN[team], a = (team ? Math.PI : 0) + -Math.PI / 4 + (k - 2) * 0.45;
      const x = f.x + Math.cos(a) * 5 * (team ? 1 : 1), z = f.z - Math.sin(a) * 5;
      const isPlayer = team === o.team && id === o.heroId;
      const colors = isPlayer && o.chroma ? o.chroma : def.colors;
      const u = new Unit(this, { kind: 'hero', team, x, z, radius: 0.95, def, mass: 3, melee: def.melee, proj: def.proj, name: def.title });
      u.heroId = id; u.lane = lane; u.colors = colors;
      u.gold = RULES.startGold; u.isPlayer = isPlayer;
      const model = new Bean(id, colors); model.root.scale.setScalar(1.65);
      this.addUnit(u, model);
      this.heroes.push(u);
      if (isPlayer) this.player = u; else u.bot = new Bot(this, u, lane);
    });
  }
  setupCamps() {
    for (const c of CAMPS) {
      const camp = { def: c, mobs: [], alive: false, next: c.id === 'dragon' ? this.mult.dragonFirst : c.id === 'boss' ? this.mult.bossFirst : RULES.campFirst };
      this.camps.push(camp);
    }
  }
  spawnCamp(camp) {
    const c = camp.def; camp.mobs = []; camp.alive = true;
    const minutes = this.time / 60;
    for (const [type, dx, dz] of c.mobs) {
      const d = MONSTERS[type], grow = 1 + 0.06 * minutes + (d.epic ? 0.03 * minutes : 0);
      const u = new Unit(this, { kind: 'monster', team: NEUTRAL, x: c.x + dx, z: c.z + dz, radius: d.radius, mass: d.epic ? 50 : 6, name: d.name, base: { hp: d.hp * grow, ad: d.ad * (1 + 0.04 * minutes), armor: d.armor, mr: d.mr, as: d.as, range: d.range, ms: 6.5, hpRegen: 0 } });
      u.mtype = type; u.mdef = d; u.camp = camp; u.home = { x: u.x, z: u.z }; u.state = 'idle'; u.aggro = null; u.specialT = 4; u.special2T = 9;
      u.facing = Math.atan2(-c.x, -c.z);
      const model = new Monster(type, d);
      if (type === 'dragon') { this.dragonKind = DRAGON_KINDS[this.dragonCount % 4]; model.setTint(this.dragonKind.color); u.name = this.dragonKind.name + ' ' + d.name; }
      this.addUnit(u, model);
      camp.mobs.push(u);
    }
    if (c.epic) { this.emit('announce', { text: c.id === 'dragon' ? (this.dragonKind.name.toUpperCase() + ' DRAGON HAS SPAWNED') : 'THE MEGA BEAN HAS AWOKEN', sub: c.id === 'dragon' ? 'Bottom river pit' : 'Top river pit', color: c.id === 'dragon' ? this.dragonKind.color : '#ffd23f' }); this.sound('announce'); }
  }
  // ---------- queries ----------
  rebuildGrid() {
    const g = this.grid; g.clear();
    for (const u of this.units) {
      if (!u.alive) continue;
      const k = ((Math.floor(u.x / 8) + 20) * 64) + (Math.floor(u.z / 8) + 20);
      let a = g.get(k); if (!a) g.set(k, a = []); a.push(u);
    }
  }
  near(x, z, r, out = []) {
    out.length = 0;
    const x0 = Math.floor((x - r) / 8), x1 = Math.floor((x + r) / 8), z0 = Math.floor((z - r) / 8), z1 = Math.floor((z + r) / 8);
    for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) {
      const a = this.grid.get(((gx + 20) * 64) + (gz + 20)); if (!a) continue;
      for (const u of a) if ((u.x - x) ** 2 + (u.z - z) ** 2 <= (r + u.radius) ** 2) out.push(u);
    }
    return out;
  }
  // enemies of `team` in a circle (no buildings unless asked)
  enemiesIn(x, z, r, team, buildings = false) {
    return this.near(x, z, r, []).filter(u => u.team !== team && u.alive && u.targetable && (buildings || (u.kind !== 'tower' && u.kind !== 'core')));
  }
  alliesIn(x, z, r, team, heroesOnly = true) { return this.near(x, z, r, []).filter(u => u.team === team && u.alive && (!heroesOnly || u.hero)); }
  visibleTo(u, team) { return u.team === team || u.vis[team]; }

  // ---------- combat ----------
  damage(src, tgt, amount, type = 'phys', opt = {}) {
    if (!tgt || !tgt.alive || amount <= 0) return 0;
    if (tgt.flag('invuln') || tgt.state === 'reset') return 0;
    if (tgt.protectedNow) { if (src && src.hero && src.isPlayer && Math.random() < 0.2) this.emit('float', { x: tgt.x, y: 6, z: tgt.z, text: 'PROTECTED', color: '#bcd7ff', size: 15 }); return 0; }
    const owner = src && (src.owner || src);
    let dmg = amount * (src ? src.st.dmgMul : 1);
    if (src && src.bot && src.hero) dmg *= this.diff.dmg;
    if (type === 'phys') { const a = tgt.st.armor; dmg *= a >= 0 ? 100 / (100 + a) : 2 - 100 / (100 - a); }
    else if (type === 'magic') { const r = tgt.st.mr * (1 - (src ? src.st.magicPen || 0 : 0)); dmg *= r >= 0 ? 100 / (100 + r) : 2 - 100 / (100 - r); }
    if (tgt.st.dr) dmg *= 1 - tgt.st.dr;
    // minions chip towers slowly (siege minions are the tower breakers)
    if ((tgt.kind === 'tower' || tgt.kind === 'core') && src && src.kind === 'minion') dmg *= src.mtype === 'siege' ? 1.5 : 0.45;
    const raw = dmg;
    // shields soak damage first
    for (const b of tgt.buffs) if (b.shield > 0 && dmg > 0) { const s = Math.min(b.shield, dmg); b.shield -= s; dmg -= s; }
    tgt.hp -= dmg;
    if (owner) {
      owner.stats.dmg += raw;
      if (tgt.hero) owner.stats.heroDmg += raw;
      if (owner.hero) { owner.revealT = Math.max(owner.revealT, 1.2); owner.combatT = 3; }
      if (tgt.hero && owner.hero) tgt.hitBy.set(owner.id, this.time);
      if (owner.hero && tgt.hero && owner.team !== tgt.team) {
        owner.towerAggroT = 2.5; owner.aggroT = 2.5;
        for (const t of this.towers) if (t.alive && t.team === tgt.team && t.dist(owner) < TOWER.range + 1) { t.aggroOn = owner; t.aggroUntil = this.time + 3; }
      }
    }
    tgt.combatT = 3;
    if (tgt.recallT >= 0 && owner && owner.team !== tgt.team) this.cancelRecall(tgt);
    if (tgt.kind === 'monster' && owner && tgt.state !== 'reset') for (const mob of tgt.camp.mobs) if (mob.alive && (!mob.aggro || !mob.aggro.alive || (owner.hero && !mob.aggro.hero))) { mob.aggro = owner; mob.state = 'fight'; }
    if (tgt.model && tgt.model.hit && dmg > 0) tgt.model.hit();
    // floating numbers for what the player cares about
    const pl = this.player;
    if (pl && (owner === pl || tgt === pl || (owner && owner.owner === pl)) && dmg + (raw - dmg) > 0.5) {
      this.emit('float', { x: tgt.x, y: (tgt.kind === 'tower' ? 7 : tgt.kind === 'core' ? 8 : 2.8) * (tgt.st.size || 1), z: tgt.z, text: Math.round(raw), color: tgt === pl ? '#ff5c5c' : opt.crit ? '#ff9d00' : type === 'magic' ? '#b98cff' : type === 'true' ? '#ffffff' : '#ffd29a', size: opt.crit ? 24 : tgt === pl ? 15 : 17, crit: opt.crit });
    }
    if (opt.basic && src) {
      if (src.st.lifesteal > 0) this.heal(src, src, raw * src.st.lifesteal, true);
      if (tgt.st.thorns > 0 && !opt.noThorns) this.damage(tgt, src, amount * tgt.st.thorns, 'magic', { noThorns: true });
    }
    if (tgt.hp <= 0) this.kill(tgt, owner);
    return raw;
  }
  heal(src, tgt, amount, quiet) {
    if (!tgt || !tgt.alive) return;
    const a = amount * (1 + (src && src !== tgt ? src.st.healPower || 0 : 0));
    tgt.hp = Math.min(tgt.st.maxHp, tgt.hp + a);
    if (!quiet) { this.fx.heal(_v.set(tgt.x, this.groundY(tgt.x, tgt.z), tgt.z)); if (tgt === this.player || src === this.player) this.emit('float', { x: tgt.x, y: 3, z: tgt.z, text: '+' + Math.round(a), color: '#7bd389', size: 16 }); }
  }
  shield(src, tgt, amount, dur) {
    const a = amount * (1 + (src ? src.st.healPower || 0 : 0));
    tgt.addBuff({ id: 'shield-' + (src ? src.id : 0), t: dur, shield: a, shieldOnly: true, shieldMax: a });
  }
  stun(tgt, dur, kind = 'stun') { if (!tgt.alive || tgt.static || tgt.kind === 'monster' && tgt.mdef.epic) return; tgt.addBuff({ id: kind, t: dur, [kind]: true }); tgt.windup = -1; tgt.dash = null; }
  slow(tgt, pct, dur) { if (!tgt.alive || tgt.static) return; tgt.addBuff({ id: 'slow' + Math.round(pct * 100), t: dur, slow: pct }); }
  knock(tgt, fromX, fromZ, dist, dur = 0.35) {
    if (!tgt.alive || tgt.static || (tgt.kind === 'monster' && tgt.mdef.epic)) return;
    let dx = tgt.x - fromX, dz = tgt.z - fromZ; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    tgt.forced = { dx, dz, speed: dist / dur, t: dur };
    this.stun(tgt, dur + 0.15, 'knockup');
  }
  pull(tgt, x, z, speed, dt) {
    if (!tgt.alive || tgt.static || (tgt.kind === 'monster' && tgt.mdef.epic)) return;
    const dx = x - tgt.x, dz = z - tgt.z, l = Math.hypot(dx, dz); if (l < 0.3) return;
    this.tryMove(tgt, tgt.x + dx / l * Math.min(l, speed * dt), tgt.z + dz / l * Math.min(l, speed * dt));
  }
  // move a unit quickly to a point (dashes, leaps, charges)
  dash(u, x, z, speed, o = {}) {
    const l = u.distTo(x, z);
    u.dash = { sx: u.x, sz: u.z, tx: x, tz: z, speed, total: Math.max(0.01, l), arc: o.arc || 0, onArrive: o.onArrive, onStep: o.onStep, hit: new Set(), untargetable: o.untargetable };
    u.path = null; u.windup = -1;
    if (o.untargetable) u.addBuff({ id: 'airborne', t: l / speed + 0.1, airborne: true, untargetable: true });
  }
  blink(u, x, z) {
    const sd = this.map.sdAt(x, z);
    if (sd > -0.6) { const i = this.map.nav.nearestFree(x, z, 10); if (i >= 0) { const c = this.map.nav.cell(i); x = c.x; z = c.z; } else return; }
    u.x = x; u.z = z; u.path = null; u.dash = null;
  }
  tryMove(u, nx, nz) {
    if (this.map.walkable(nx, nz)) { u.x = nx; u.z = nz; return true; }
    if (this.map.walkable(nx, u.z)) { u.x = nx; return true; }
    if (this.map.walkable(u.x, nz)) { u.z = nz; return true; }
    return false;
  }
  // ---------- projectiles, zones, timers ----------
  homing(o) { // { src, tgt, speed, color, size, onHit, feather, shape }
    const m = o.mesh || projMesh(o.shape || (o.feather ? 'feather' : 'orb'), o.color || '#ffffff', o.size || 0.3);
    const y0 = this.groundY(o.src.x, o.src.z) + (o.y0 || 1.6);
    m.position.set(o.src.x, y0, o.src.z); this.scene.add(m);
    this.projectiles.push({ kind: 'homing', ...o, m, x: o.src.x, y: y0, z: o.src.z });
  }
  shake(x, z, power) { this.emit('shake', { x, z, power }); }
  skillshot(o) { // { src, x, z, dx, dz, speed, range, width, pierce, onHit(u, p), onEnd(x,z), color, size, mesh }
    const m = o.mesh || new THREE.Mesh(new THREE.SphereGeometry(o.size || 0.4, 12, 10), new THREE.MeshBasicMaterial({ color: o.color || '#ffffff' }));
    const l = Math.hypot(o.dx, o.dz) || 1;
    const p = { kind: 'skill', ...o, dx: o.dx / l, dz: o.dz / l, m, traveled: 0, hit: new Set(), x: o.x ?? o.src.x, z: o.z ?? o.src.z, h: o.h ?? 1.3 };
    m.position.set(p.x, this.groundY(p.x, p.z) + p.h, p.z); m.lookAt(p.x + p.dx, m.position.y, p.z + p.dz);
    this.scene.add(m); this.projectiles.push(p);
    return p;
  }
  zone(o) { // { src, team, x, z, r, t, every, onTick(units, z), onEnter(u, z), onEnd(z), visual }
    const z = { acc: 0, every: 0.25, ...o, max: o.t };
    if (z.visual) this.scene.add(z.visual);
    this.zones.push(z);
    return z;
  }
  after(t, fn) { this.timers.push({ t, fn }); }

  // ---------- orders ----------
  orderMove(u, x, z) { if (!u.alive) return; u.order = { type: 'move', x, z }; u.path = null; u.pending = null; if (u.recallT >= 0) this.cancelRecall(u); }
  orderAttack(u, t) { if (!u.alive || !t || t.team === u.team) return; u.order = { type: 'attack', target: t }; u.path = null; u.pending = null; if (u.recallT >= 0) this.cancelRecall(u); }
  orderAttackMove(u, x, z) { if (!u.alive) return; u.order = { type: 'amove', x, z }; u.path = null; u.pending = null; if (u.recallT >= 0) this.cancelRecall(u); }
  orderStop(u) { u.order = null; u.path = null; u.windup = -1; u.pending = null; }
  startRecall(u) {
    if (!u.alive || u.recallT >= 0 || !u.canAct) return;
    u.recallT = u.flag('megabean') ? 4 : RULES.recallTime; u.recallMax = u.recallT; u.order = null; u.path = null; u.windup = -1;
    this.sound('recall', u.x, u.z, 0.6);
  }
  cancelRecall(u) { if (u.recallT >= 0) { u.recallT = -1; if (u === this.player) this.emit('toast', { text: 'Recall cancelled', kind: 'bad' }); } }
  inShop(u) { return !u.alive || u.distTo(FOUNTAIN[u.team].x, FOUNTAIN[u.team].z) < RULES.shopR; }

  // ---------- abilities ----------
  levelAbility(u, slot) {
    if (!u.canLevel(slot)) return false;
    u.abil[slot].rank++; u.points--;
    if (u === this.player) this.sound('select');
    return true;
  }
  abilityCost(u, slot) { const ab = u.def.abilities[slot], r = u.abil[slot].rank; return r ? ab.cost[r - 1] : 0; }
  canCastNow(u, slot) { const a = u.abil[slot]; return u.alive && a.rank > 0 && a.cd <= 0 && u.mana >= this.abilityCost(u, slot) && u.canCast; }
  // x,z = cursor point on the ground, target = unit under the cursor
  cast(u, slot, x, z, target) {
    if (!u.def || u.dash || !u.alive) return false;
    const ab = u.def.abilities[slot], a = u.abil[slot];
    if (a.rank <= 0) { if (u === this.player) this.emit('toast', { text: 'Level up ' + ab.name + ' first (Shift+' + ab.key + ' or the + button)', kind: 'bad' }); return false; }
    if (a.cd > 0) return false;
    if (!u.canCast) return false;
    const cost = ab.cost[a.rank - 1];
    if (u.mana < cost) { if (u === this.player) { this.emit('toast', { text: 'Not enough mana', kind: 'bad' }); this.sound('error'); } return false; }
    if (ab.type === 'unit') {
      if (!target || target.team === u.team || !target.alive || !target.targetable || !this.visibleTo(target, u.team) || target.kind === 'tower' || target.kind === 'core') {
        target = this.enemiesIn(x, z, 3, u.team).filter(e => this.visibleTo(e, u.team)).sort((p, q) => p.distTo(x, z) - q.distTo(x, z) + (q.hero - p.hero) * 3)[0];
      }
      if (!target) { if (u === this.player) this.emit('toast', { text: 'No target', kind: 'bad' }); return false; }
      if (u.edge(target) > ab.range) { u.pending = { slot, target }; u.order = { type: 'attack', target }; return true; }
    }
    if (ab.type === 'ally') {
      if (!target || target.team !== u.team || !target.hero || !target.alive || target.dist(u) > ab.range) {
        const allies = this.alliesIn(u.x, u.z, ab.range, u.team).filter(h => h !== u);
        target = allies.sort((p, q) => p.hp / p.st.maxHp - q.hp / q.st.maxHp)[0] || u;
        const hov = this.alliesIn(x, z, 2.5, u.team).filter(h => h.dist(u) <= ab.range)[0];
        if (hov) target = hov;
      }
    }
    if (ab.type === 'ground' || ab.type === 'skillshot') {
      const dx = x - u.x, dz = z - u.z, l = Math.hypot(dx, dz);
      if (l < 0.05) { x = u.x + Math.sin(u.facing); z = u.z + Math.cos(u.facing); }
      else if (ab.type === 'ground' && l > ab.range) { x = u.x + dx / l * ab.range; z = u.z + dz / l * ab.range; }
    }
    if (u.recallT >= 0) this.cancelRecall(u);
    u.mana -= cost; a.cd = ab.cd[a.rank - 1] * (1 - u.st.cdr);
    u.castAnim = 0; u.windup = -1; u.revealT = Math.max(u.revealT, 1.5);
    if (target) u.facing = Math.atan2(target.x - u.x, target.z - u.z);
    else if (ab.type !== 'self') u.facing = Math.atan2(x - u.x, z - u.z);
    const fn = CAST[u.heroId + ':' + slot] || KINDS[ab.kind];
    if (fn) fn(this, u, ab, a.rank, x, z, target);
    this.castFx(u, slot);
    u.stats.casts = (u.stats.casts || 0) + 1;
    return true;
  }

  // every ability gets a little flourish; ultimates get a big one
  castFx(u, slot) {
    const col = u.def.hitColor, gy = this.groundY(u.x, u.z), sz = u.st.size || 1;
    const feet = new THREE.Vector3(u.x, gy, u.z), chest = new THREE.Vector3(u.x, gy + 1.4 * sz, u.z);
    this.fx.ring(feet, col, 0.4, 2.4 * sz, 0.35, 0.8);
    this.fx.sparks(chest, col, 12); this.fx.flash(chest, col, 1.1, 0.16);
    if (slot === 4) {
      this.fx.rays(feet, col, 12, 8, 0.75); this.fx.light(feet, col, 45, 0.7, 20); this.fx.flash(chest, '#ffffff', 2.6, 0.32);
      this.fx.ring(feet, '#ffffff', 0.5, 6, 0.6, 0.7); this.fx.burst(chest, col, 30, 8, 0.25, 6, 0.8);
      this.shake(u.x, u.z, 0.45);
      if (u === this.player || u.team === this.pteam || u.vis[this.pteam]) this.emit('ultCast', u);
    }
  }
  // ---------- items ----------
  // price after counting the components we already own
  priceFor(u, id) {
    const it = ITEM[id]; let price = it.cost;
    const used = [];
    if (it.from) for (const c of it.from) { const i = u.items.findIndex((s, k) => s && s.id === c && !used.includes(k)); if (i >= 0) { used.push(i); price -= ITEM[c].cost; } }
    return { price, used };
  }
  buy(u, id) {
    const it = ITEM[id];
    if (!this.inShop(u)) { if (u === this.player) this.emit('toast', { text: 'Go back to your base to shop (press B)', kind: 'bad' }); return false; }
    const { price, used } = this.priceFor(u, id);
    if (u.gold < price) { if (u === this.player) { this.emit('toast', { text: 'Not enough gold', kind: 'bad' }); this.sound('error'); } return false; }
    if (it.boots && u.items.some((s, k) => s && ITEM[s.id].boots && !used.includes(k))) { if (u === this.player) this.emit('toast', { text: 'You can only carry one pair of boots', kind: 'bad' }); return false; }
    if (it.consumable) {
      const st = u.items.find(s => s && s.id === id && s.count < it.stack);
      if (st) { st.count++; u.gold -= price; this.afterBuy(u); return true; }
    }
    let slot = used.length ? used[0] : u.freeSlot();
    if (slot < 0) { if (u === this.player) this.emit('toast', { text: 'Your inventory is full - sell something first', kind: 'bad' }); return false; }
    for (const k of used) u.items[k] = null;
    u.items[slot] = { id, count: 1 };
    u.gold -= price;
    this.afterBuy(u);
    return true;
  }
  afterBuy(u) { u.recalc(); if (u === this.player) this.sound('buy'); this.emit('inventory', u); }
  sell(u, slot) {
    const s = u.items[slot]; if (!s) return false;
    if (!this.inShop(u)) { if (u === this.player) this.emit('toast', { text: 'You can only sell in your base', kind: 'bad' }); return false; }
    const it = ITEM[s.id];
    u.gold += Math.floor(it.cost * 0.7) * (it.consumable ? 1 : 1);
    if (it.consumable && s.count > 1) s.count--; else u.items[slot] = null;
    u.recalc(); if (u === this.player) this.sound('sell'); this.emit('inventory', u);
    return true;
  }
  useItem(u, slot) {
    const s = u.items[slot]; if (!s || !u.alive) return false;
    if (s.id === 'potion') {
      if (u.flag('potion')) { if (u === this.player) this.emit('toast', { text: 'Already drinking a potion', kind: 'bad' }); return false; }
      u.addBuff({ id: 'potion', t: 10, potion: true, onTick: (h, dt) => this.heal(null, h, 15 * dt, true) });
      this.fx.heal(_v.set(u.x, this.groundY(u.x, u.z), u.z)); this.sound('heal', u.x, u.z, 0.6);
      if (--s.count <= 0) u.items[slot] = null;
      this.emit('inventory', u);
      return true;
    }
    return false;
  }

  // ---------- rewards ----------
  addGold(u, g, show) {
    if (!u || !u.hero) return;
    if (u.bot) g *= this.diff.gold;
    g *= this.mult.gold; u.gold += g; u.stats.gold += g; this.teams[u.team].gold += g;
    if (show && u === this.player && g >= 5) { this.emit('float', { x: u.x, y: 3.6, z: u.z, text: '+' + Math.round(g) + 'g', color: '#ffd23f', size: 15 }); this.sound('gold'); }
  }
  addXp(u, xp) {
    if (!u || !u.hero || u.level >= RULES.maxLevel) return;
    u.xp += xp * this.mult.xp;
    while (u.level < RULES.maxLevel && u.xp >= RULES.xpToNext(u.level)) {
      u.xp -= RULES.xpToNext(u.level); u.level++; u.points++;
      u.recalc(); u.mana = Math.min(u.st.maxMana, u.mana + 60);
      if (u.alive) this.fx.levelUp(_v.set(u.x, this.groundY(u.x, u.z), u.z));
      if (u === this.player) { this.sound('levelup'); this.emit('levelup', u); }
      if (u.bot) u.bot.autoLevel();
    }
    if (u.level >= RULES.maxLevel) u.xp = 0;
  }
  shareXp(x, z, team, total) {
    const hs = this.heroes.filter(h => h.alive && h.team === team && h.distTo(x, z) < RULES.xpRange);
    if (!hs.length) return;
    const each = total * (hs.length === 1 ? 1 : 1.25 / hs.length);
    for (const h of hs) this.addXp(h, each);
  }
  kill(v, killer) {
    if (!v.alive) return;
    v.alive = false; v.hp = 0; v.deadAt = this.time; v.windup = -1; v.dash = null; v.forced = null; v.order = null; v.path = null; v.recallT = -1; v.pending = null;
    for (const b of [...v.buffs]) if (b.onEnd) b.onEnd(v);
    v.buffs = []; v.recalc();
    const kh = killer && killer.hero ? killer : null;
    const pos = _v.set(v.x, this.groundY(v.x, v.z), v.z).clone();
    if (v.hero) {
      v.stats.deaths++; v.respawnT = RULES.respawn(v.level); v.stats.streak = 0; v.stats.deathStreak++;
      // credit: the killer, or the last enemy hero that hit them
      let credit = kh && kh.team !== v.team ? kh : null;
      if (!credit) { let best = 0; for (const [id, t] of v.hitBy) if (this.time - t < 10 && t > best) { const h = this.heroes.find(x => x.id === id); if (h && h.team !== v.team) { best = t; credit = h; } } }
      const assists = [];
      for (const [id, t] of v.hitBy) if (this.time - t < 10) { const h = this.heroes.find(x => x.id === id); if (h && h !== credit && h.team !== v.team) assists.push(h); }
      const team = credit ? credit.team : 1 - v.team;
      this.teams[team].kills++;
      if (credit) {
        let bounty = RULES.heroKillGold * clamp(1 - 0.12 * (v.stats.deathStreak - 1), 0.4, 1) + Math.min(400, Math.max(0, (v.stats.kills - v.stats.deaths) * 40));
        if (!this.firstBlood) { this.firstBlood = true; bounty += RULES.firstBlood; this.emit('announce', { text: 'FIRST BLOOD!', sub: credit.def.title + ' got the first takedown', color: '#ff4d6d' }); }
        this.addGold(credit, bounty, true); credit.stats.kills++; credit.stats.streak++; credit.stats.deathStreak = 0;
        const now = this.time; credit.multi = (credit.multiT && now - credit.multiT < 10) ? credit.multi + 1 : 1; credit.multiT = now;
        if (credit.multi >= 2) this.emit('announce', { text: ['', '', 'DOUBLE KILL!', 'TRIPLE KILL!', 'QUADRA KILL!', 'PENTA BEAN!'][Math.min(5, credit.multi)], sub: credit.def.title, color: TEAM_COLOR[credit.team] });
        else if (credit.stats.streak === 3) this.emit('announce', { text: 'ON A ROLL!', sub: credit.def.title + ' has 3 kills in a row', color: TEAM_COLOR[credit.team] });
      }
      for (const a of assists) { this.addGold(a, RULES.assistGold / Math.max(1, assists.length), true); a.stats.assists++; }
      this.shareXp(v.x, v.z, 1 - v.team, 160 + 45 * v.level);
      v.hitBy.clear();
      this.emit('kill', { killer: credit || killer, victim: v, assists });
      this.fx.burst(pos.clone().setY(pos.y + 1.2), v.colors[0], 26, 7, 0.28, 5, 0.7); this.fx.burst(pos.clone().setY(pos.y + 1.2), v.colors[1], 14, 5, 0.22, 6, 0.7);
      this.fx.flash(pos.clone().setY(pos.y + 1), '#ffffff', 2.2, 0.3); this.fx.ring(pos, TEAM_COLOR[v.team], 0.4, 4, 0.5);
      if (v === this.player || credit === this.player) this.shake(v.x, v.z, 0.5);
      this.sound(credit === this.player ? 'kill' : 'death', v.x, v.z, v === this.player ? 1.2 : 0.8);
      if (v === this.player) this.emit('playerDied', v);
    } else if (v.kind === 'minion') {
      if (kh && kh.team !== v.team) { this.addGold(kh, MINIONS[v.mtype].gold, true); kh.stats.cs++; }
      else if (killer && killer.owner && killer.owner.hero) { this.addGold(killer.owner, MINIONS[v.mtype].gold, true); killer.owner.stats.cs++; }
      this.shareXp(v.x, v.z, 1 - v.team, MINIONS[v.mtype].xp);
      v.removeT = 1.1;
      this.fx.burst(pos.setY(pos.y + 0.8), TEAM_COLOR[v.team], 10, 4, 0.18);
    } else if (v.kind === 'monster') {
      const d = v.mdef, team = kh ? kh.team : killer ? killer.team : -1;
      v.removeT = 1.5;
      this.fx.burst(pos.setY(pos.y + 1), d.color, 22, 6, 0.25);
      if (team === BLUE || team === RED) {
        if (kh) { this.addGold(kh, d.gold, true); kh.stats.cs++; }
        this.shareXp(v.x, v.z, team, d.xp);
        if (d.buff && kh) this.giveBuff(kh, d.buff);
        if (d.epic === 'dragon') {
          const k = this.dragonKind || DRAGON_KINDS[0]; this.dragonCount++;
          this.teams[team].dragons.push(k.id);
          for (const h of this.heroes) if (h.team === team) { this.addGold(h, 120, h.alive); h.recalc(); }
          this.emit('announce', { text: (team === this.pteam ? 'YOUR TEAM' : 'THE ENEMY') + ' SLEW THE ' + k.name.toUpperCase() + ' DRAGON', sub: k.text + ' (permanent)', color: k.color });
          this.sound('announce');
        }
        if (d.epic === 'boss') {
          for (const h of this.heroes) if (h.team === team) { this.addGold(h, 250, h.alive); if (h.alive) this.giveBuff(h, 'megabean'); }
          this.emit('announce', { text: (team === this.pteam ? 'YOUR TEAM' : 'THE ENEMY') + ' DEFEATED THE MEGA BEAN', sub: 'Mega Bean Blessing: stronger heroes and minions', color: '#ffd23f' });
          this.sound('announce');
        }
      }
      if (v.camp.mobs.every(m => !m.alive)) { v.camp.alive = false; v.camp.next = this.time + (d.epic === 'dragon' ? RULES.dragonRespawn : d.epic === 'boss' ? RULES.bossRespawn : d.buff ? RULES.buffRespawn : RULES.campRespawn); }
    } else if (v.kind === 'tower') {
      const team = 1 - v.team;
      this.teams[team].towers++;
      for (const h of this.heroes) if (h.team === team) this.addGold(h, RULES.towerGoldTeam, h.alive && h.distTo(v.x, v.z) < 20);
      if (kh && kh.team === team) { this.addGold(kh, RULES.towerGoldLast, true); kh.stats.towers++; }
      this.fx.shockwave(pos, '#ffffff', 7); this.fx.smoke(pos, '#d8cfc0', 30, 4);
      this.sound('towerDown', v.x, v.z, 1.2);
      this.emit('announce', { text: v.team === this.pteam ? 'YOUR TOWER HAS FALLEN' : 'ENEMY TOWER DESTROYED', sub: v.lane === 'core' ? 'BASE GUARD TOWER' : v.lane.toUpperCase() + ' LANE', color: TEAM_COLOR[team] });
      this.emit('tower', v);
    } else if (v.kind === 'core') {
      this.fx.shockwave(pos, TEAM_COLOR[v.team], 14); this.fx.confetti(pos.setY(pos.y + 4), 220, 12);
      this.sound('boom', v.x, v.z, 1.5);
      this.over = true; this.winner = 1 - v.team; this.endT = 0;
      this.emit('end', { winner: this.winner });
    } else if (v.kind === 'clone') v.removeT = 0.4;
  }
  giveBuff(h, id) {
    const B = BUFFS[id];
    const b = { id, t: B.dur, [id]: true, name: B.name, color: B.color };
    if (id === 'brainfreeze') b.mods = { cdr: 0.15, manaRegen: 5 };
    if (id === 'megabean') b.mods = { ad: 25, ap: 40, hpRegen: 3 };
    h.addBuff(b);
    if (h === this.player) this.emit('toast', { text: 'You got ' + B.name + ': ' + B.text, kind: 'good' });
  }

  // ---------- main update ----------
  update(dt) {
    if (this.over) { this.endT += dt; return; }
    this.time += dt;
    const T = this.time;
    if (T > RULES.passiveFrom) for (const h of this.heroes) this.addGold(h, RULES.passiveGold * dt);
    // minion waves
    if (T >= this.nextWave) { this.nextWave += RULES.waveEvery; this.queueWave(); }
    for (let i = this.spawnQ.length - 1; i >= 0; i--) { const s = this.spawnQ[i]; s.t -= dt; if (s.t <= 0) { this.spawnMinion(s); this.spawnQ.splice(i, 1); } }
    for (const c of this.camps) if (!c.alive && T >= c.next) this.spawnCamp(c);
    for (let i = this.timers.length - 1; i >= 0; i--) { const t = this.timers[i]; t.t -= dt; if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); } }
    this.rebuildGrid();
    this.visT -= dt; if (this.visT <= 0) { this.visT = 0.12; this.updateVision(); }
    // buildings protection: a tower needs the one in front of it gone, the core needs a base tower gone
    // the guard towers need a base tower gone, the core needs both guard towers gone
    for (const t of this.towers) t.protectedNow = t.tier === 3 ? !this.towers.some(o => !o.alive && o.team === t.team && o.tier === 2) : t.tier > 0 && this.towers.some(o => o.alive && o.team === t.team && o.lane === t.lane && o.tier === t.tier - 1);
    for (const c of this.cores) c.protectedNow = this.towers.some(t => t.alive && t.team === c.team && t.tier === 3);
    // alternate the update order every frame so neither team always acts first
    const us = this.units, n = us.length, rev = (this.frameN = (this.frameN || 0) + 1) & 1;
    for (let k = 0; k < n; k++) this.updateUnit(us[rev ? n - 1 - k : k], dt);
    this.updateProjectiles(dt);
    this.updateZones(dt);
    this.collide();
    this.fountains(dt);
    // respawns and clean-up
    for (const h of this.heroes) if (!h.alive) { h.respawnT -= dt; if (h.respawnT <= 0) this.respawn(h); }
    for (let i = this.units.length - 1; i >= 0; i--) { const u = this.units[i]; if (!u.alive && u.removeT >= 0) { u.removeT -= dt; if (u.removeT < 0) { if (u.model) u.model.root.removeFromParent(); this.units.splice(i, 1); } } }
    const hs = this.heroes;
    for (let k = 0; k < hs.length; k++) { const h = hs[rev ? hs.length - 1 - k : k]; if (h.bot) h.bot.update(dt); }
  }
  respawn(h) {
    const f = FOUNTAIN[h.team];
    h.alive = true; h.x = f.x + (Math.random() - 0.5) * 3; h.z = f.z + (Math.random() - 0.5) * 3;
    h.recalc(); h.hp = h.st.maxHp; h.mana = h.st.maxMana; h.order = null; h.path = null; h.target = null;
    if (h.model) { h.model.deadT = 0; }
    this.fx.column(_v.set(h.x, 0, h.z), TEAM_COLOR[h.team], 1.4, 6, 0.8);
    if (h === this.player) this.emit('respawn', h);
  }
  queueWave() {
    this.waveN++;
    const siege = this.waveN % (this.time > 900 ? 2 : RULES.siegeEvery) === 0;
    const types = ['melee', 'melee', 'melee', ...(siege ? ['siege'] : []), 'ranged', 'ranged', 'ranged'];
    for (const team of [BLUE, RED]) for (const lane of ['top', 'mid', 'bot']) types.forEach((type, i) => this.spawnQ.push({ t: i * 0.75, team, lane, type, idx: i }));
  }
  spawnMinion(s) {
    // red walks the mirrored lane, which starts at its own base
    const lanePts = s.team === BLUE ? LANES[s.lane] : LANES[s.lane].map(mirror);
    const d = MINIONS[s.type], minutes = this.time / 60;
    // super minions: when the enemy lost the base tower of this lane, our minions there get much stronger
    const superM = this.towers.some(t => !t.alive && t.team !== s.team && t.lane === s.lane && t.tier === 2) ? 1.5 : 1;
    const grow = (1 + 0.045 * minutes) * superM, adGrow = (1 + 0.035 * minutes) * superM;
    const p0 = lanePts[0];
    const u = new Unit(this, { kind: 'minion', team: s.team, x: p0.x + (Math.random() - 0.5), z: p0.z + (Math.random() - 0.5), radius: d.radius, mass: s.type === 'siege' ? 2 : 1, melee: s.type === 'melee', name: s.type + ' minion', base: { hp: d.hp * grow, ad: d.ad * adGrow, armor: d.armor, mr: d.mr, as: d.as, range: d.range, ms: d.ms } });
    u.mtype = s.type; u.lanePts = lanePts; u.laneIdx = 1; u.lane = s.lane; u.offset = ((s.idx % 3) - 1) * 1.6; u.retargetT = 0;
    u.proj = s.type === 'melee' ? null : { color: TEAM_COLOR[s.team], size: s.type === 'siege' ? 0.4 : 0.22, speed: 22 };
    // the Mega Bean blessing makes nearby minions stronger
    const model = makeMinion(s.type, s.team);
    if (superM > 1) { u.radius *= 1.2; model.root.scale.multiplyScalar(1.3); u.superM = true; }
    this.addUnit(u, model);
  }
  updateVision() {
    for (const team of [BLUE, RED]) {
      const srcs = this.units.filter(u => u.alive && u.team === team && SIGHT[u.kind]);
      for (const u of this.units) {
        if (!u.alive && u.kind !== 'tower') { u.vis[team] = (u.vis[team] || u.team === team) && this.time - (u.deadAt || 0) < 3; continue; }
        if (u.team === team || u.kind === 'tower' || u.kind === 'core') { u.vis[team] = true; continue; }
        const stealth = u.flag('stealth');
        let vis = false;
        for (const s of srcs) {
          const d = Math.hypot(s.x - u.x, s.z - u.z);
          if (d > SIGHT[s.kind]) continue;
          if (stealth && d > 2.6) continue;
          if (u.bush >= 0 && u.revealT <= 0 && s.bush !== u.bush && d > 2.8) continue;
          vis = true; break;
        }
        u.vis[team] = vis;
      }
    }
    const pt = this.pteam;
    this.fogN = (this.fogN || 0) + 1; if (this.fogN % 2) return;
    this.map.updateFog(this.units.filter(u => u.alive && u.team === pt && SIGHT[u.kind]).map(u => ({ x: u.x, z: u.z, r: SIGHT[u.kind] })).concat([{ ...FOUNTAIN[pt], r: 22 }]));
  }

  // ---------- per-unit logic ----------
  updateUnit(u, dt) {
    if (!u.alive) return;
    u.updateBuffs(dt);
    if (!u.alive) return;
    if (u.revealT > 0) u.revealT -= dt;
    if (u.combatT > 0) u.combatT -= dt;
    if (u.aggroT > 0) u.aggroT -= dt;
    if (u.hero || u.kind === 'monster' && u.state !== 'reset') { u.hp = Math.min(u.st.maxHp, u.hp + u.st.hpRegen * dt); u.mana = Math.min(u.st.maxMana, u.mana + u.st.manaRegen * dt); }
    if (u.atkCd > 0) u.atkCd -= dt;
    for (const a of u.abil) if (a.cd > 0) a.cd -= dt;
    if (u.castAnim >= 0) { u.castAnim += dt * 2.5; if (u.castAnim > 1) u.castAnim = -1; }
    u.moving = false;
    const ox = u.x, oz = u.z;
    u.bush = u.kind === 'tower' || u.kind === 'core' ? -1 : this.map.bushAt(u.x, u.z);
    // forced movement (knockbacks) and dashes override everything
    if (u.forced) {
      const f = u.forced; f.t -= dt;
      this.tryMove(u, u.x + f.dx * f.speed * dt, u.z + f.dz * f.speed * dt);
      if (f.t <= 0) u.forced = null;
    } else if (u.dash) {
      const d = u.dash, step = d.speed * dt, rem = u.distTo(d.tx, d.tz);
      const k = Math.min(1, step / Math.max(0.001, rem));
      const nx = u.x + (d.tx - u.x) * k, nz = u.z + (d.tz - u.z) * k;
      const moved = this.tryMove(u, nx, nz);
      u.facing = Math.atan2(d.tx - d.sx, d.tz - d.sz);
      if (d.onStep) d.onStep(u, d);
      if ((u.hero || u.kind === 'clone') && u.colors !== undefined) { const gy = this.groundY(u.x, u.z); this.fx.trail(_v.set(u.x, gy + 0.9 + (Math.random() - 0.5), u.z), u.colors[0], 0.38); this.fx.trail(_v.set(u.x, gy + 0.3, u.z), '#ffffff', 0.22); if (Math.random() < 0.3) this.fx.dust(_v.set(u.x, gy, u.z), 2, '#e8e1d6'); }
      if (k >= 1 || !moved || u.distTo(d.tx, d.tz) < 0.05) { u.dash = null; if (d.onArrive) d.onArrive(u); }
    } else if (u.recallT >= 0) {
      if (!u.canAct) this.cancelRecall(u);
      else { u.recallT -= dt; if (u.recallT <= 0) { u.recallT = -1; const f = FOUNTAIN[u.team]; this.fx.column(_v.set(u.x, this.groundY(u.x, u.z), u.z), TEAM_COLOR[u.team], 1.2, 6, 0.6); u.x = f.x + (Math.random() - 0.5) * 2; u.z = f.z + (Math.random() - 0.5) * 2; this.fx.column(_v.set(u.x, 0, u.z), TEAM_COLOR[u.team], 1.2, 6, 0.6); this.sound('teleport', u.x, u.z); if (u === this.player) this.emit('recalled', u); } }
    } else if (u.canAct || u.kind === 'tower') {
      if (u.kind === 'minion') this.minionThink(u, dt);
      else if (u.kind === 'tower') this.towerThink(u, dt);
      else if (u.kind === 'monster') this.monsterThink(u, dt);
      else if (u.kind === 'clone') this.cloneThink(u, dt);
      if (u.kind !== 'tower' && u.kind !== 'core') this.runOrder(u, dt);
      else if (u.kind === 'tower') this.runOrder(u, dt);
    } else u.windup = -1;
    u.vx = (u.x - ox) / Math.max(dt, 1e-4); u.vz = (u.z - oz) / Math.max(dt, 1e-4);
    if (Math.hypot(u.vx, u.vz) > 0.5) u.moving = true;
  }
  runOrder(u, dt) {
    let o = u.order;
    // auto-attack when idle (heroes and clones)
    if (!o && (u.hero || u.kind === 'clone') && u.canAttack && !u.isPlayerHold) {
      const t = this.closestEnemy(u, u.st.range + 0.6, true);
      if (t) o = { type: 'attack', target: t, auto: true };
    }
    if (u.pending) { const p = u.pending; if (!p.target.alive || !p.target.targetable) u.pending = null; else if (u.edge(p.target) <= u.def.abilities[p.slot].range) { u.pending = null; this.cast(u, p.slot, p.target.x, p.target.z, p.target); if (u.order && u.order.target === p.target) u.order = { type: 'attack', target: p.target }; return; } }
    if (!o) { u.windup = -1; return; }
    let tgt = null, dest = null;
    if (o.type === 'attack') {
      tgt = o.target;
      if (!tgt.alive || !tgt.targetable || !this.visibleTo(tgt, u.team) || tgt.state === 'reset') { u.order = null; u.windup = -1; return; }
    } else if (o.type === 'move') dest = o;
    else if (o.type === 'amove') {
      const t = this.closestEnemy(u, Math.max(7, u.st.range + 2), true);
      if (t) tgt = t; else dest = o;
    }
    if (tgt) {
      const range = u.st.range + (u.kind === 'tower' ? 0 : 0.1);
      if (u.edge(tgt) <= range) {
        u.facing = Math.atan2(tgt.x - u.x, tgt.z - u.z);
        u.path = null;
        if (u.canAttack) this.attackTick(u, tgt, dt);
      } else if (u.kind !== 'tower') {
        u.windup = -1;
        this.moveToward(u, tgt.x, tgt.z, dt, u.hero || u.kind === 'clone');
      } else u.windup = -1;
    } else if (dest) {
      u.windup = -1;
      if (u.distTo(dest.x, dest.z) < 0.35) { u.order = null; u.path = null; return; }
      this.moveToward(u, dest.x, dest.z, dt, u.hero || u.kind === 'clone');
      if (u.path && !u.path.length) u.order = null;
    }
  }
  closestEnemy(u, r, heroesFirst) {
    let best = null, bs = 1e9;
    for (const e of this.near(u.x, u.z, r + 2, [])) {
      if (e.team === u.team || !e.alive || !e.targetable || !this.visibleTo(e, u.team) || e.state === 'reset') continue;
      if (e.kind === 'monster' && e.state === 'idle' && (u.hero || u.kind === 'clone') && !e.aggro) continue;  // do not pull camps by accident
      if (e.kind === 'core' && e.protectedNow) continue;
      const d = u.edge(e); if (d > r) continue;
      const s = d + (heroesFirst && !e.hero ? 0 : 0) + (e.kind === 'tower' || e.kind === 'core' ? 6 : 0);
      if (s < bs) { bs = s; best = e; }
    }
    return best;
  }
  moveToward(u, x, z, dt, usePath) {
    if (!u.canMove) return;
    // units without pathfinding switch it on for a while when they bump into a wall
    if (u.pathMode > 0) { u.pathMode -= dt; usePath = true; }
    let tx = x, tz = z;
    if (usePath) {
      u.pathT -= dt;
      const end = u.path && u.path[u.path.length - 1];
      // only plan a new route when the goal moved or we got stuck (A* is the expensive part)
      const goalMoved = end && Math.hypot(end.x - x, end.z - z) > 1.5;
      if (!u.path || !end || (goalMoved && u.pathT <= 0) || (u.repath && u.pathT <= 0)) { u.path = this.map.nav.find(u.x, u.z, x, z) || [{ x, z }]; u.pathT = goalMoved ? 0.45 : 0.8; u.repath = false; }
      while (u.path.length > 1 && u.distTo(u.path[0].x, u.path[0].z) < 0.4) u.path.shift();
      if (u.path.length) { tx = u.path[0].x; tz = u.path[0].z; }
    }
    const dx = tx - u.x, dz = tz - u.z, l = Math.hypot(dx, dz);
    if (l < 0.01) { if (u.path && u.path.length) u.path.shift(); return; }
    const step = Math.min(l, u.st.ms * dt);
    const bx = u.x, bz = u.z;
    const ok = this.tryMove(u, u.x + dx / l * step, u.z + dz / l * step);
    if (!ok || Math.hypot(u.x - bx, u.z - bz) < step * 0.3) { if (usePath) u.repath = true; else { u.pathMode = 3; u.path = null; } }
    u.facing = turn(u.facing, Math.atan2(dx, dz), dt * 14);
    if (usePath && u.path && u.path.length && u.distTo(u.path[0].x, u.path[0].z) < 0.4) u.path.shift();
  }
  attackTick(u, tgt, dt) {
    if (u.windup < 0) {
      if (u.atkCd > 0) return;
      const period = 1 / u.st.as;
      u.windupMax = clamp(period * 0.3, 0.08, 0.4); u.windup = u.windupMax; u.atkAnim = 0; u.atkTarget = tgt;
      if (u.hero || u.kind === 'clone') this.sound(u.melee ? 'swing' : 'shoot', u.x, u.z, 0.5);
      else if (u.kind === 'minion') this.sound('mhit', u.x, u.z, 0.35);
      if (u.recallT >= 0) this.cancelRecall(u);
      return;
    }
    u.windup -= dt;
    if (u.windup > 0) return;
    u.windup = -1; u.atkCd = 1 / u.st.as - u.windupMax;
    if (u.atkTarget !== tgt || !tgt.alive) return;
    if (u.kind === 'tower') {
      // towers heat up on the same hero
      if (tgt.hero) { u.heat = u.heatTarget === tgt ? Math.min(3, u.heat + 1) : 0; u.heatTarget = tgt; } else { u.heat = 0; u.heatTarget = null; }
      const dmg = (u.st.ad + 6 * this.time / 60) * (1 + 0.3 * u.heat) * (tgt.kind === 'minion' ? (tgt.mtype === 'siege' ? 0.75 : 1.75) : 1);
      this.fx.flash(_v.set(u.x, this.groundY(u.x, u.z) + 7.4, u.z), TEAM_COLOR[u.team], 1.6, 0.2);
      this.homing({ src: u, tgt, speed: 26, color: TEAM_COLOR[u.team], size: 0.6, y0: 7.4, onHit: () => { this.damage(u, tgt, dmg, 'phys', {}); this.fx.impact(_v.set(tgt.x, this.groundY(tgt.x, tgt.z) + 1.2, tgt.z), TEAM_COLOR[u.team], 1.2, tgt.hero); if (tgt === this.player) this.shake(tgt.x, tgt.z, 0.35); } });
      this.sound('tower', u.x, u.z, 0.7);
      u.firing = 0.3;
      return;
    }
    if (u.melee || !u.proj) { this.basicHit(u, tgt); this.meleeFx(u, tgt); }
    else {
      const sty = ATK_STYLE[u.heroId] || {};
      if (u.hero) this.fx.flash(_v.set(u.x + Math.sin(u.facing) * 0.9, this.groundY(u.x, u.z) + 1.6, u.z + Math.cos(u.facing) * 0.9), u.proj.color, 0.6, 0.12);
      this.homing({ src: u, tgt, speed: u.proj.speed || 24, color: u.proj.color, size: u.proj.size * (u.hero ? 1.1 : 1), shape: sty.shape, spin: sty.spin, onHit: () => { this.basicHit(u, tgt); if (u.hero) this.fx.impact(_v.set(tgt.x, this.groundY(tgt.x, tgt.z) + 1.2 * (tgt.st.size || 1), tgt.z), u.proj.color, 0.9); if (sty.splat) this.fx.decal(_v.set(tgt.x, this.groundY(tgt.x, tgt.z), tgt.z), sty.splat, 1.1, 1.5, 0.6); } });
    }
  }
  basicHit(u, tgt) {
    if (!tgt.alive) return;
    let mult = 1, crit = false;
    if (u.st.crit > 0 && Math.random() < u.st.crit) crit = true;
    const extra = basicHitExtras(this, u, tgt);
    if (extra.crit) crit = true;
    mult *= extra.mult || 1;
    if (crit) mult *= 1.75;
    let dmg = u.st.ad * mult;
    if (u.kind === 'clone') dmg = u.owner.st.ad * u.clonePct;
    if (u.kind === 'minion' && tgt.hero) dmg *= 0.6;
    if (u.kind === 'minion' && this.megaNear(u)) dmg *= 1.5;
    this.damage(u, tgt, dmg, 'phys', { basic: true, crit });
    if (extra.after) extra.after();
    if (u.hero || u.kind === 'clone') {
      const c = u.def ? u.def.hitColor : '#c77dff', p = _v.set(tgt.x, this.groundY(tgt.x, tgt.z) + 1.2 * (tgt.st.size || 1), tgt.z);
      this.fx.sparks(p, crit ? '#ff9d00' : c, crit ? 16 : 8);
      if (crit) { this.fx.impact(p, '#ffd23f', 1.3, true); if (u === this.player || tgt === this.player) this.shake(tgt.x, tgt.z, 0.3); }
      this.sound(crit ? 'crit' : 'hit', tgt.x, tgt.z, 0.6);
    }
  }
  // swing arcs, bites and claw marks for melee attackers
  meleeFx(u, tgt) {
    if (!(u.hero || u.kind === 'clone')) { if (u.kind === 'minion' && Math.random() < 0.5) this.fx.sparks(_v.set(tgt.x, this.groundY(tgt.x, tgt.z) + 1, tgt.z), '#ffffff', 3); return; }
    const sty = ATK_STYLE[u.kind === 'clone' ? 'ninja' : u.heroId] || { slash: '#ffffff' };
    const sz = u.st.size || 1, y = this.groundY(u.x, u.z) + 1.1 * sz;
    const pos = _v.set(u.x + Math.sin(u.facing) * 0.8 * sz, y, u.z + Math.cos(u.facing) * 0.8 * sz).clone();
    u.swingFlip = !u.swingFlip;
    if (sty.bite) { const tp = _v.set(tgt.x, this.groundY(tgt.x, tgt.z) + 1.1, tgt.z).clone(); this.fx.slash(tp, u.facing + Math.PI / 2, sty.slash, 1.1 * sz, 2.6, 1.4, 0.18, false); this.fx.slash(tp, u.facing + Math.PI / 2, sty.slash, 1.1 * sz, 2.6, -1.4, 0.18, true); }
    else { this.fx.slash(pos, u.facing, sty.slash, (sty.r || 2.2) * sz, sty.arc || 2.3, sty.tilt ?? 0.35, 0.2, u.swingFlip); if (sty.double) this.after(0.08, () => this.fx.slash(pos, u.facing, '#ffffff', 1.8 * sz, 2.0, -0.4, 0.16, !u.swingFlip)); }
    this.fx.impact(_v.set(tgt.x, this.groundY(tgt.x, tgt.z) + 1.1 * (tgt.st.size || 1), tgt.z), sty.slash, 0.9);
  }
  megaNear(u) { for (const h of this.heroes) if (h.alive && h.team === u.team && h.flag('megabean') && h.dist(u) < 12) return true; return false; }

  // ---------- AI for minions, towers, monsters, clones ----------
  minionThink(u, dt) {
    u.retargetT -= dt;
    const t = u.order && u.order.type === 'attack' ? u.order.target : null;
    const valid = t && t.alive && t.targetable && this.visibleTo(t, u.team) && u.dist(t) < 11;
    if (!valid || u.retargetT <= 0) {
      u.retargetT = 0.5;
      let best = null, bs = 1e9;
      for (const e of this.near(u.x, u.z, 8.5, [])) {
        if (e.team === u.team || e.team === NEUTRAL || !e.alive || !e.targetable || !this.visibleTo(e, u.team)) continue;
        if (e.kind === 'core' && e.protectedNow) continue;
        if (e.kind === 'tower' && e.protectedNow) continue;
        let s = u.dist(e);
        if (e.hero) s += e.aggroT > 0 ? -8 : 7;            // heroes that hit our heroes get punished
        if (e.kind === 'tower' || e.kind === 'core') s += 4;
        if (valid && e === t) s -= 2;                        // stick to the current target
        if (s < bs) { bs = s; best = e; }
      }
      if (best) u.order = { type: 'attack', target: best };
      else u.order = null;
    }
    if (!u.order) {
      // walk down the lane (spread out a little)
      const pts = u.lanePts;
      while (u.laneIdx < pts.length) {
        const p = pts[u.laneIdx];
        if (u.distTo(p.x, p.z) < 3.5) u.laneIdx++; else break;
      }
      let tx, tz;
      if (u.laneIdx < pts.length) {
        const p = pts[u.laneIdx], q = pts[u.laneIdx - 1];
        const dx = p.x - q.x, dz = p.z - q.z, l = Math.hypot(dx, dz) || 1;
        tx = p.x - dz / l * u.offset; tz = p.z + dx / l * u.offset;
      } else { const c = this.cores[1 - u.team]; tx = c.x; tz = c.z; }
      u.order = null;
      this.moveToward(u, tx, tz, dt, false);
    }
  }
  towerThink(u, dt) {
    if (u.firing > 0) u.firing -= dt;
    const r = u.st.range;
    const inR = e => e && e.alive && e.targetable && e.team !== u.team && e.team !== NEUTRAL && this.visibleTo(e, u.team) && u.dist(e) - e.radius <= r;
    let t = u.order && u.order.target;
    if (u.aggroOn && this.time < u.aggroUntil && inR(u.aggroOn)) t = u.aggroOn;
    else if (!inR(t)) {
      t = null; let bs = 1e9;
      for (const e of this.near(u.x, u.z, r + 1, [])) {
        if (!inR(e)) continue;
        const s = u.dist(e) + (e.hero ? 30 : e.kind === 'clone' ? 5 : 0);
        if (s < bs) { bs = s; t = e; }
      }
    }
    u.order = t ? { type: 'attack', target: t } : null;
  }
  monsterThink(u, dt) {
    const d = u.mdef, leash = d.epic ? 17 : 12.5;
    const homeD = u.distTo(u.home.x, u.home.z);
    if (u.state === 'reset') {
      u.order = null; u.hp = Math.min(u.st.maxHp, u.hp + u.st.maxHp * 0.4 * dt);
      if (homeD < 0.6) { u.state = 'idle'; u.hp = u.st.maxHp; u.aggro = null; u.facing = Math.atan2(-u.home.x, -u.home.z); }
      else this.moveToward(u, u.home.x, u.home.z, dt * 1.6, false);
      return;
    }
    if (u.state === 'idle') { u.order = null; return; }
    const a = u.aggro;
    if (!a || !a.alive || !a.targetable || homeD > leash || u.dist(a) > leash + 2) {
      // try another hero nearby that is hitting us, otherwise go home
      const other = this.near(u.x, u.z, 8, []).find(h => h.hero && h.alive && h.targetable && h.combatT > 0 && u.distTo(u.home.x, u.home.z) < leash);
      if (other && other !== a) { u.aggro = other; return; }
      u.state = 'reset'; u.order = null; u.windup = -1;
      for (const m of u.camp.mobs) if (m.alive && m !== u && m.state !== 'reset') { m.state = 'reset'; m.order = null; }
      return;
    }
    u.order = { type: 'attack', target: a };
    // special attacks for the dragon and the Mega Bean
    if (d.epic) {
      u.specialT -= dt; u.special2T -= dt;
      if (d.epic === 'dragon' && u.specialT <= 0) {
        u.specialT = 6; u.castAnim = 0;
        const dir = Math.atan2(a.x - u.x, a.z - u.z);
        this.fx.flames(_v.set(u.x + Math.sin(dir) * 3, this.groundY(u.x, u.z) + 1, u.z + Math.cos(dir) * 3), 30, 4);
        this.sound('boom', u.x, u.z, 0.7);
        for (const e of this.enemiesIn(u.x, u.z, 9, NEUTRAL)) {
          const ang = Math.abs(angDiff(Math.atan2(e.x - u.x, e.z - u.z), dir));
          if (ang < 0.6 && e.dist(u) < 9) { this.damage(u, e, 110 + 9 * this.time / 60, 'magic'); e.addBuff({ id: 'burn', t: 3, onTick: (h, dt2) => this.damage(u, h, 18 * dt2, 'magic') }); }
        }
        for (let k = 0; k < 6; k++) { const dd = 1.5 + k * 1.3; this.fx.flames(_v.set(u.x + Math.sin(dir) * dd, this.groundY(u.x, u.z) + 0.8, u.z + Math.cos(dir) * dd), 8, 0.8 + k * 0.3); }
      }
      if (d.epic === 'boss') {
        if (u.specialT <= 0) {
          u.specialT = 7.5;
          const tx = a.x, tz = a.z;
          this.dash(u, tx, tz, 14, { arc: 6, onArrive: () => {
            this.fx.shockwave(_v.set(tx, this.groundY(tx, tz), tz), '#ffd23f', 6); this.sound('boom', tx, tz, 1);
            for (const e of this.enemiesIn(tx, tz, 6, NEUTRAL)) { this.damage(u, e, 280 + 12 * this.time / 60, 'phys'); this.knock(e, tx, tz, 4); }
          } });
        } else if (u.special2T <= 0) {
          u.special2T = 12;
          const c = _v.set(u.x, this.groundY(u.x, u.z), u.z).clone();
          this.fx.ring(c, '#ffd23f', 0.5, 11, 0.9, 0.9);
          this.after(0.45, () => { for (const e of this.enemiesIn(c.x, c.z, 11, NEUTRAL)) { this.damage(u, e, 170 + 8 * this.time / 60, 'magic'); this.slow(e, 0.4, 2); } });
          this.sound('roar', u.x, u.z, 0.8);
        }
      }
    }
  }
  cloneThink(u, dt) {
    const o = u.owner;
    if (!o || !o.alive) { this.kill(u, null); return; }
    const t = u.order && u.order.target;
    if (!t || !t.alive || !t.targetable || t.dist(o) > 10) {
      const e = (o.order && o.order.target && o.order.target.alive && o.order.target.team !== u.team ? o.order.target : null) || this.closestEnemy(u, 8, true);
      u.order = e ? { type: 'attack', target: e } : (u.dist(o) > 3 ? { type: 'move', x: o.x + (Math.random() - 0.5) * 2, z: o.z + (Math.random() - 0.5) * 2 } : null);
    }
  }

  // ---------- projectiles / zones ----------
  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      if (p.kind === 'homing') {
        const t = p.tgt;
        if (!t.alive) { p.m.removeFromParent(); this.projectiles.splice(i, 1); continue; }
        const ty = this.groundY(t.x, t.z) + (t.kind === 'tower' ? 5 : t.kind === 'core' ? 5 : 1.1 * (t.st.size || 1));
        const dx = t.x - p.x, dy = ty - p.y, dz = t.z - p.z, l = Math.hypot(dx, dy, dz), step = p.speed * dt;
        if (l <= step + 0.3) { p.m.removeFromParent(); this.projectiles.splice(i, 1); if (p.onHit) p.onHit(); continue; }
        p.x += dx / l * step; p.y += dy / l * step; p.z += dz / l * step;
        p.m.position.set(p.x, p.y, p.z); p.m.lookAt(t.x, ty, t.z);
        if (p.spin) p.m.rotateZ(dt * p.spin);
        this.fx.trail(p.m.position, p.color, (p.size || 0.3) * 0.8);
        if (Math.random() < 0.5) this.fx.trail(p.m.position, '#ffffff', (p.size || 0.3) * 0.45);
      } else {
        const step = p.speed * dt;
        const ax = p.x, az = p.z;
        p.x += p.dx * step; p.z += p.dz * step; p.traveled += step;
        p.m.position.set(p.x, this.groundY(p.x, p.z) + p.h, p.z);
        if (p.spin) p.m.rotation.y += dt * p.spin;
        if (p.trail !== false && Math.random() < 0.7) this.fx.trail(p.m.position, p.color || '#ffffff', (p.size || 0.4) * 0.6);
        let done = p.traveled >= p.range;
        for (const e of this.near(p.x, p.z, p.width + 2, [])) {
          if (e.team === p.src.team || !e.alive || !e.targetable || e.kind === 'tower' || e.kind === 'core' || p.hit.has(e.id)) continue;
          if (segDist(e.x, e.z, ax, az, p.x, p.z) > p.width / 2 + e.radius) continue;
          p.hit.add(e.id);
          if (p.onHit) p.onHit(e, p);
          this.fx.impact(_v.set(e.x, this.groundY(e.x, e.z) + 1.2 * (e.st.size || 1), e.z), p.color || '#ffffff', 1.1);
          if (!p.pierce) { done = true; break; }
        }
        if (done) { p.m.removeFromParent(); this.projectiles.splice(i, 1); if (p.onEnd) p.onEnd(p.x, p.z, p); }
      }
    }
  }
  updateZones(dt) {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      z.t -= dt; z.acc += dt;
      if (z.update) z.update(z, dt);
      if (z.onTick && z.acc >= z.every) { z.acc -= z.every; z.onTick(this.near(z.x, z.z, z.r, []).filter(u => u.alive), z); }
      if (z.trigger) { const hit = this.enemiesIn(z.x, z.z, z.trigger, z.team).filter(u => u.kind === 'hero' || u.kind === 'minion' || u.kind === 'monster')[0]; if (hit) { z.onTrigger(hit, z); z.t = 0; } }
      if (z.t <= 0 || z.dead) { this.zones.splice(i, 1); if (z.visual) z.visual.removeFromParent(); if (z.onEnd) z.onEnd(z); }
    }
  }
  // keep units from standing inside each other and inside buildings
  collide() {
    const list = [];
    for (const u of this.units) {
      if (!u.alive || u.static || u.dash || u.forced) continue;
      if (u.flag('ghost')) continue;
      for (const o of this.near(u.x, u.z, u.radius + 1.6, list)) {
        if (o === u || !o.alive || o.id < u.id && !o.static) continue;
        if (o.flag('ghost') || o.dash || o.forced) continue;
        const dx = u.x - o.x, dz = u.z - o.z, d = Math.hypot(dx, dz), min = u.radius + o.radius - (o.static ? 0 : 0.25);
        if (d >= min || d < 1e-4) continue;
        const push = min - d, nx = dx / d, nz = dz / d;
        if (o.static) { this.tryMove(u, u.x + nx * push, u.z + nz * push); continue; }
        const wu = o.mass / (u.mass + o.mass), wo = u.mass / (u.mass + o.mass);
        this.tryMove(u, u.x + nx * push * wu * 0.6, u.z + nz * push * wu * 0.6);
        this.tryMove(o, o.x - nx * push * wo * 0.6, o.z - nz * push * wo * 0.6);
      }
    }
  }
  fountains(dt) {
    for (const team of [BLUE, RED]) {
      const f = FOUNTAIN[team];
      for (const u of this.near(f.x, f.z, RULES.fountainR, [])) {
        if (!u.alive) continue;
        if (u.team === team) { if (u.hero) { u.hp = Math.min(u.st.maxHp, u.hp + u.st.maxHp * 0.12 * dt); u.mana = Math.min(u.st.maxMana, u.mana + u.st.maxMana * 0.12 * dt); } }
        else if (u.kind !== 'tower' && u.kind !== 'core') {
          this.damage(null, u, 900 * dt, 'true');
          if (Math.random() < dt * 6) this.fx.beam(_v.set(f.x, 4, f.z).clone(), new THREE.Vector3(u.x, this.groundY(u.x, u.z) + 1, u.z), TEAM_COLOR[team], 0.3, 0.15);
        }
      }
    }
  }

  // ---------- 3D sync ----------
  updateVisuals(dt) {
    const pt = this.pteam;
    for (const u of this.units) {
      if (!u.obj) continue;
      const shown = u.alive ? (u.vis[pt] || u.team === pt) : (u.kind === 'tower' || this.time - (u.deadAt || 0) < 3);
      u.obj.visible = shown || (u.kind === 'tower' || u.kind === 'core');
      let y = this.groundY(u.x, u.z);
      if (u.dash && u.dash.arc) { const k = 1 - u.distTo(u.dash.tx, u.dash.tz) / u.dash.total; y += Math.sin(clamp(k, 0, 1) * Math.PI) * u.dash.arc; }
      if (u.forced) y += 0.8;
      if (u.flag('knockup')) y += 0.6;
      const air = u.flag('airborne'); if (air && !u.dash) y += 5;
      if (u.flag('burrow')) y -= 2.6;
      u.obj.position.set(u.x, y, u.z);
      if (u.kind !== 'tower' && u.kind !== 'core') u.obj.rotation.y = turn(u.obj.rotation.y, u.facing, dt * 12);
      const base = u.hero ? 1.65 : u.kind === 'monster' ? (u.mdef.size || 1) : u.kind === 'clone' ? 1.3 : null;
      if (base) { const want = base * (u.st.size || 1); const s = u.obj.scale.x + (want - u.obj.scale.x) * Math.min(1, dt * 5); u.obj.scale.setScalar(s); }
      if (u.atkAnim >= 0) { u.atkAnim += dt / Math.max(0.15, Math.min(0.6, 1 / u.st.as)); if (u.atkAnim > 1) u.atkAnim = -1; }
      if (u.spinT > 0) u.spinT -= dt;
      const st = { spin: u.spinT > 0 ? 1 - u.spinT / u.spinMax : -1, speed: u.moving ? u.st.ms : 0, attack: u.atkAnim, melee: u.melee, cast: u.castAnim, dead: !u.alive, stun: u.stunned, air: !!(u.dash && u.dash.arc) || !!air,
        dance: this.over && u.hero && u.team === this.winner && u.alive, hurt: u.alive && u.hp < u.st.maxHp * 0.25, attacking: u.firing > 0, protected: u.protectedNow };
      if (u.model.update) u.model.update(dt, st);
      // ghosts and stealth look see-through to their own team
      const stealth = u.alive && u.flag('stealth');
      if (u.hero || u.kind === 'clone') setOpacity(u, stealth ? 0.35 : u.kind === 'clone' ? 0.6 : 1);
    }
    // bushes go see-through when the player stands in them
    const pb = this.player && this.player.alive ? this.player.bush : -1;
    for (const b of this.map.bushes) { const want = b.id === pb ? 0.45 : 1; b.mesh.material.opacity += (want - b.mesh.material.opacity) * Math.min(1, dt * 8); }
  }
  dispose() {
    for (const u of this.units) if (u.model) u.model.root.removeFromParent();
    for (const p of this.projectiles) p.m.removeFromParent();
    for (const z of this.zones) if (z.visual) z.visual.removeFromParent();
    this.units = []; this.projectiles = []; this.zones = [];
  }
}

function setOpacity(u, o) {
  if (u._op === o) return; u._op = o;
  u.obj.traverse(m => {
    if (!m.isMesh || !m.material || m.material.isMeshBasicMaterial) return;
    const mt = m.material, ud = mt.userData;
    if (ud.baseOp === undefined) { ud.baseOp = mt.opacity; ud.baseT = mt.transparent; }
    mt.opacity = ud.baseOp * o; mt.transparent = o < 1 || ud.baseT; mt.needsUpdate = true;
  });
}
export function turn(a, b, k) { const d = angDiff(b, a); return a + d * Math.min(1, k); }
export function angDiff(a, b) { let d = a - b; return Math.atan2(Math.sin(d), Math.cos(d)); }
function segDist(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz;
  const t = l2 > 0 ? clamp(((px - ax) * vx + (pz - az) * vz) / l2, 0, 1) : 0;
  return Math.hypot(px - ax - vx * t, pz - az - vz * t);
}
export { segDist };

// how each hero's basic attack looks
const ATK_STYLE = {
  knight: { slash: '#e9ecef', r: 2.5, arc: 2.6 }, ninja: { slash: '#c77dff', double: true, r: 2.1 }, dino: { slash: '#9be38f', bite: true },
  shark: { slash: '#9fd8ff', bite: true }, astro: { shape: 'laser' }, hotdog: { shape: 'blob', splat: '#e53935' }, pigeon: { shape: 'feather', spin: 12 },
  banana: { shape: 'banana', spin: 14 }, wizard: { shape: 'star', spin: 10 }, robot: { shape: 'laser' }
};
const PROJ_GEO = { orb: new THREE.SphereGeometry(1, 12, 10), glow: new THREE.SphereGeometry(1, 10, 8), laser: new THREE.CapsuleGeometry(0.5, 2.6, 4, 8).rotateX(Math.PI / 2), feather: new THREE.SphereGeometry(1, 8, 6).scale(0.35, 0.12, 1.2), star: new THREE.OctahedronGeometry(1.1), banana: new THREE.TorusGeometry(0.9, 0.35, 6, 12, Math.PI * 1.1), blob: new THREE.IcosahedronGeometry(1, 1) };
const PROJ_MATS = new Map();
function projMat(color, glow) {
  const k = color + (glow ? 'g' : '');
  if (!PROJ_MATS.has(k)) PROJ_MATS.set(k, glow ? new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }) : new THREE.MeshBasicMaterial({ color }));
  return PROJ_MATS.get(k);
}
function projMesh(shape, color, size) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(PROJ_GEO[shape] || PROJ_GEO.orb, projMat(shape === 'feather' ? '#f8f9fa' : shape === 'banana' ? '#ffe14d' : color));
  core.scale.setScalar(size); g.add(core);
  const glow = new THREE.Mesh(PROJ_GEO.glow, projMat(color, true));
  glow.scale.setScalar(size * (shape === 'laser' ? 1.8 : 2.2)); if (shape === 'laser') glow.scale.z = size * 3.2; g.add(glow);
  return g;
}
