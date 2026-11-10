// Units: heroes, minions, towers, cores, jungle monsters and summoned clones.
// A unit has base stats (heroes grow per level), items and buffs; recalc() turns those into final stats.
import { ITEM, DRAGON_KINDS } from './data.js';

let NEXT = 1;
const STAT_KEYS = ['hp', 'mana', 'ad', 'ap', 'armor', 'mr', 'as', 'ms', 'crit', 'cdr', 'lifesteal', 'hpRegen', 'manaRegen', 'magicPen', 'thorns', 'healPower'];

export class Unit {
  constructor(m, o) {
    this.m = m; this.id = NEXT++;
    this.kind = o.kind; this.team = o.team; this.name = o.name || o.kind;
    this.x = o.x; this.z = o.z; this.y = 0; this.facing = o.facing || 0; this.radius = o.radius || 0.8;
    this.def = o.def || null;                // hero definition (heroes only)
    this.base = o.base || {};                // flat base stats for non-heroes
    this.level = 1; this.xp = 0; this.gold = 0; this.points = 1;
    this.items = [null, null, null, null, null, null];
    this.buffs = [];
    this.st = {};
    this.abil = [0, 1, 2, 3, 4].map(() => ({ rank: 0, cd: 0 }));
    this.stats = { kills: 0, deaths: 0, assists: 0, cs: 0, dmg: 0, heroDmg: 0, gold: 0, towers: 0, streak: 0, deathStreak: 0 };
    this.hitBy = new Map();                   // hero id -> time (for assists)
    this.alive = true; this.respawnT = 0; this.removeT = -1;
    this.order = null; this.path = null; this.pathT = 0; this.target = null;
    this.atkCd = 0; this.windup = -1; this.windupMax = 0; this.atkAnim = -1; this.castAnim = -1;
    this.vx = 0; this.vz = 0; this.moving = false;
    this.vis = [true, true]; this.bush = -1; this.revealT = 0;
    this.recallT = -1; this.pending = null; this.empower = null;
    this.mass = o.mass || 1; this.ms0 = o.ms || 0;
    this.melee = o.melee ?? true; this.proj = o.proj || null;
    this.owner = o.owner || null; this.bot = null; this.isPlayer = false;
    this.static = !!o.static;
    this.recalc();
    this.hp = this.st.maxHp; this.mana = this.st.maxMana;
  }
  get hero() { return this.kind === 'hero'; }
  dist(u) { return Math.hypot(u.x - this.x, u.z - this.z); }
  distTo(x, z) { return Math.hypot(x - this.x, z - this.z); }
  edge(u) { return this.dist(u) - this.radius - u.radius; }
  enemyOf(u) { return u.team !== this.team; }
  flag(f) { for (const b of this.buffs) if (b[f]) return b; return null; }
  get stunned() { return !!(this.flag('stun') || this.flag('knockup')); }
  get canAct() { return this.alive && !this.stunned && !this.flag('airborne'); }
  get canAttack() { return this.canAct && !this.flag('disarm'); }
  get canCast() { return this.canAct && !this.flag('silence'); }
  get canMove() { return this.alive && !this.stunned && !this.flag('root') && !this.static; }
  get targetable() { return this.alive && !this.flag('untargetable') && !this.flag('airborne'); }
  addBuff(b) {
    if (!this.alive && this.kind !== 'tower') return null;
    const old = b.id ? this.buffs.find(x => x.id === b.id) : null;
    if (old) { Object.assign(old, b, { t: Math.max(old.t, b.t) }); this.recalc(); return old; }
    b.max = b.t; this.buffs.push(b); this.recalc();
    if (b.stun || b.knockup || b.bunny) { this.windup = -1; if (this.recallT >= 0) this.m.cancelRecall(this); }
    return b;
  }
  removeBuff(id) { const i = this.buffs.findIndex(b => b.id === id); if (i >= 0) { const b = this.buffs[i]; this.buffs.splice(i, 1); if (b.onEnd) b.onEnd(this); this.recalc(); } }
  shieldTotal() { let s = 0; for (const b of this.buffs) if (b.shield > 0) s += b.shield; return s; }
  updateBuffs(dt) {
    let changed = false;
    for (let i = this.buffs.length - 1; i >= 0; i--) {
      const b = this.buffs[i];
      if (b.onTick) b.onTick(this, dt);
      b.t -= dt;
      if (b.t <= 0 || (b.shieldOnly && b.shield <= 0)) { this.buffs.splice(i, 1); if (b.onEnd) b.onEnd(this); changed = true; }
    }
    if (changed || this.hero) this.recalc();
  }
  // ---------- stats ----------
  recalc() {
    const S = this.st, d = this.def, L = this.level;
    const add = {}; for (const k of STAT_KEYS) add[k] = 0;
    let adPct = 0, apPct = 0, armorPct = 0, mrPct = 0, msPct = 0, slow = 0, hpPct = 0, dr = 0, dmgMul = 1, size = 1;
    for (const it of this.items) if (it) { const s = ITEM[it.id].stats; for (const k in s) add[k] += s[k]; }
    for (const b of this.buffs) {
      const md = b.mods; if (md) for (const k in md) { if (k in add) add[k] += md[k]; }
      if (md) { adPct += md.adPct || 0; apPct += md.apPct || 0; armorPct += md.armorPct || 0; mrPct += md.mrPct || 0; msPct += md.msPct || 0; hpPct += md.hpPct || 0; }
      if (b.slow) slow = Math.max(slow, b.slow);
      if (b.dr) dr = Math.max(dr, b.dr);
      if (b.weaken) dmgMul *= 1 - b.weaken;
      if (b.size) size = Math.max(size, b.size);
    }
    // dragon stacks belong to the whole team
    const tm = this.m.teams && this.m.teams[this.team];
    if (tm && (this.hero || this.kind === 'clone')) for (const k of tm.dragons) {
      if (k === 'fire') { adPct += 0.08; apPct += 0.08; }
      else if (k === 'ocean') { add.hpRegen += 2; add.manaRegen += 1.5; }
      else if (k === 'cloud') add.ms += 0.5;
      else if (k === 'mountain') { armorPct += 0.1; mrPct += 0.1; }
    }
    let base;
    if (d) {
      const s = d.stats, g = (a) => a[0] + a[1] * (L - 1);
      base = { hp: g(s.hp), mana: g(s.mana), ad: g(s.ad), ap: 0, armor: g(s.armor), mr: g(s.mr), as: s.as[0] * (1 + s.as[1] * (L - 1)), ms: s.ms, range: s.range, hpRegen: g(s.hpRegen), manaRegen: g(s.manaRegen) };
    } else base = this.base;
    const oldMax = S.maxHp || 0;
    S.maxHp = ((base.hp || 0) + add.hp) * (1 + hpPct);
    S.maxMana = (base.mana || 0) + add.mana;
    S.ad = ((base.ad || 0) + add.ad) * (1 + adPct);
    S.ap = ((base.ap || 0) + add.ap) * (1 + apPct);
    S.armor = ((base.armor || 0) + add.armor) * (1 + armorPct);
    S.mr = ((base.mr || 0) + add.mr) * (1 + mrPct);
    S.as = Math.min(2.6, (base.as || 1) * (1 + add.as));
    S.range = base.range || 1.5;
    S.ms = Math.max(1.2, ((base.ms || this.ms0 || 6) + add.ms) * (1 + msPct) * (1 - slow));
    S.crit = Math.min(1, add.crit); S.cdr = Math.min(0.45, add.cdr); S.lifesteal = add.lifesteal;
    S.hpRegen = (base.hpRegen || 0) + add.hpRegen; S.manaRegen = (base.manaRegen || 0) + add.manaRegen;
    S.magicPen = add.magicPen; S.thorns = add.thorns; S.healPower = add.healPower;
    // heroes grow a little with every level (2.5% per level: level 18 is about 40% bigger)
    if (this.kind === 'hero') size *= 1 + 0.025 * (L - 1);
    S.dr = dr; S.dmgMul = dmgMul; S.size = size;
    // the sprint (E) needs no points: it ranks up by itself every few levels
    if (this.def) this.def.abilities.forEach((ab, i) => { if (ab.innate) this.abil[i].rank = Math.min(5, 1 + Math.floor((this.level - 1) / 4)); });
    if (oldMax && S.maxHp > oldMax && this.alive) this.hp += S.maxHp - oldMax;
    if (this.hp > S.maxHp) this.hp = S.maxHp;
    if (this.mana > S.maxMana) this.mana = S.maxMana;
  }
  // ---------- items ----------
  hasItem(id) { return this.items.some(i => i && i.id === id); }
  freeSlot() { return this.items.findIndex(i => !i); }
  // ---------- abilities ----------
  canLevel(slot) {
    if (this.points <= 0 || !this.def) return false;
    const r = this.abil[slot].rank;
    if (this.def.abilities[slot].innate) return false;
    if (slot === 4) return r < 3 && this.level >= [6, 11, 16][r];
    return r < 5 && r < Math.ceil(this.level / 2);
  }
}

export function dragonText(kinds) { return kinds.map(k => DRAGON_KINDS.find(d => d.id === k).name).join(', '); }
