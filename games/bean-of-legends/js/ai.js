// Bot heroes. Each bot thinks a few times a second: retreat when hurt, fight when it is worth it,
// otherwise do its job (farm a lane, support the marksman, clear the jungle) or join a team plan
// (dragon, Mega Bean, defend, late-game push). Easy/normal/hard change reaction time, aim and courage.
import { RULES, ITEM, TOWER } from './data.js';
import { LANES, FOUNTAIN, mirror } from './map.js';

const lanePts = (team, lane) => team === 0 ? LANES[lane] : LANES[lane].map(mirror);
function progressOn(pts, x, z) {
  let best = 1e9, prog = 0, acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], vx = b.x - a.x, vz = b.z - a.z, l = Math.hypot(vx, vz);
    const t = Math.max(0, Math.min(1, ((x - a.x) * vx + (z - a.z) * vz) / (l * l)));
    const d = Math.hypot(x - (a.x + vx * t), z - (a.z + vz * t));
    if (d < best) { best = d; prog = acc + t * l; }
    acc += l;
  }
  return { prog, dist: best, total: acc };
}
function pointAt(pts, prog) {
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], l = Math.hypot(b.x - a.x, b.z - a.z);
    if (acc + l >= prog) { const t = (prog - acc) / l; return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }; }
    acc += l;
  }
  return { ...pts[pts.length - 1] };
}
const power = u => (u.hp + u.st.maxHp * 0.15) * (u.st.ad * u.st.as * 1.6 + u.st.ap * 0.8 + 40 + u.level * 6) / 1000;

export class Bot {
  constructor(m, h, lane) {
    this.m = m; this.h = h; this.lane = lane;
    this.t = Math.random() * 0.5; this.stuckT = 0; this.last = { x: h.x, z: h.z };
    this.potionT = 0;
    this.autoLevel();
  }
  get laneName() { return this.lane === 'sup' ? 'bot' : this.lane === 'jungle' ? 'mid' : this.lane; }
  get pts() { return lanePts(this.h.team, this.laneName); }
  autoLevel() {
    // Q/W/R take points (E sprint ranks up by itself, T is the ultimate)
    const h = this.h, pri = h.def.role === 'Support' ? [1, 3, 0] : h.def.role === 'Tank' ? [1, 0, 3] : [0, 1, 3];
    let guard = 20;
    while (h.points > 0 && guard-- > 0) {
      if (this.m.levelAbility(h, 4)) continue;
      // keep at least one rank in every basic ability early
      const missing = [0, 1, 3].find(s => h.abil[s].rank === 0 && h.canLevel(s));
      if (missing !== undefined && h.level <= 3) { this.m.levelAbility(h, missing); continue; }
      let done = false;
      for (const s of pri) if (this.m.levelAbility(h, s)) { done = true; break; }
      if (!done) break;
    }
  }
  update(dt) {
    this.t -= dt;
    if (this.t > 0) return;
    const D = this.m.diff;
    this.t = D.think * (0.8 + Math.random() * 0.4);
    try { this.think(); } catch (e) { console.error('bot', e); }
  }
  moveTo(x, z) {
    const o = this.h.order;
    if (o && o.type === 'move' && Math.hypot(o.x - x, o.z - z) < 2) return;
    // long walks: use the sprint (E)
    if (this.h.distTo(x, z) > 30 && this.m.canCastNow(this.h, 2) && this.h.def.abilities[2].kind === 'sprint' && Math.random() < 0.5) this.m.cast(this.h, 2, x, z, null);
    this.m.orderMove(this.h, x, z);
  }
  attack(t) { const o = this.h.order; if (o && o.type === 'attack' && o.target === t) return; this.m.orderAttack(this.h, t); }
  // ---------- main decision ----------
  think() {
    const m = this.m, h = this.h, D = m.diff;
    if (!h.alive) { this.shop(); return; }
    const inBase = h.distTo(FOUNTAIN[h.team].x, FOUNTAIN[h.team].z) < RULES.shopR;
    if (inBase) this.shop();
    const hp = h.hp / h.st.maxHp;
    const enemies = m.heroes.filter(e => e.team !== h.team && e.alive && e.targetable && m.visibleTo(e, h.team) && e.dist(h) < 16).sort((a, b) => a.dist(h) - b.dist(h));
    const allies = m.heroes.filter(a => a.team === h.team && a.alive && a !== h && a.dist(h) < 16);
    if (h.recallT >= 0) { if (enemies.some(e => e.dist(h) < 11)) m.cancelRecall(h); else return; }
    // stuck?
    if (h.order && h.order.type === 'move' && Math.hypot(h.x - this.last.x, h.z - this.last.z) < 0.15) { this.stuckT += D.think; if (this.stuckT > 1.5) { this.stuckT = 0; m.orderMove(h, h.x + (Math.random() - 0.5) * 6, h.z + (Math.random() - 0.5) * 6); return; } } else this.stuckT = 0;
    this.last = { x: h.x, z: h.z };
    // potion
    if (hp < 0.5 && !inBase && !h.flag('potion')) { const i = h.items.findIndex(s => s && s.id === 'potion'); if (i >= 0) m.useItem(h, i); }
    // heal up in the fountain
    if (inBase && (hp < 0.9 || h.mana < h.st.maxMana * 0.6) && !enemies.length) { if (h.order) m.orderStop(h); return; }
    // ---- retreat ----
    const myPow = power(h) + allies.filter(a => a.dist(h) < 12).reduce((s, a) => s + power(a), 0);
    const enPow = enemies.filter(e => e.dist(h) < 12).reduce((s, e) => s + power(e), 0);
    const towerHit = m.towers.some(t => t.alive && t.team !== h.team && t.order && t.order.target === h);
    if (hp < D.retreat || (hp < 0.5 && enPow > myPow * 1.4) || (towerHit && hp < 0.6)) {
      const near = enemies[0];
      if (!near || near.dist(h) > 10) { if (!towerHit) { m.startRecall(h); return; } }
      const f = FOUNTAIN[h.team];
      if (near && near.dist(h) < 6) this.useEscape(f);
      this.moveTo(f.x, f.z);
      return;
    }
    // ---- fight enemy heroes ----
    const target = this.pickTarget(enemies, myPow, enPow);
    if (target) { this.useAbilities(target, enemies); this.attack(target); return; }
    // support abilities even when not fighting
    this.supportAbilities(allies);
    // ---- team plans ----
    const plan = this.teamPlan();
    if (plan && this.doPlan(plan, enemies)) return;
    // ---- role ----
    if (this.lane === 'jungle') this.jungle(enemies);
    else if (this.lane === 'sup') this.support(enemies, allies);
    else this.laneFarm(enemies);
  }
  // pick an enemy hero worth fighting
  pickTarget(enemies, myPow, enPow) {
    const m = this.m, h = this.h, D = this.m.diff;
    let best = null, bs = 1e9;
    for (const e of enemies) {
      const d = e.dist(h); if (d > h.st.range + 7) continue;
      const eHp = e.hp / e.st.maxHp;
      const underTower = m.towers.some(t => t.alive && t.team === e.team && t.dist(e) < TOWER.range + 1 && !t.protectedNow) && !m.units.some(u => u.kind === 'minion' && u.team === h.team && u.alive && m.towers.some(t => t.alive && t.team === e.team && t.dist(u) < TOWER.range && t.dist(e) < TOWER.range + 1));
      const meUnderTower = m.towers.some(t => t.alive && t.team === h.team && t.dist(h) < TOWER.range);
      const favorable = myPow > enPow * (D.dmg > 1 ? 0.85 : 1.0) || eHp < 0.3 || (meUnderTower && myPow > enPow * 0.6);
      if (!favorable) continue;
      if (underTower && !(eHp < 0.2 && h.hp / h.st.maxHp > 0.5)) continue;
      const s = e.hp + d * 30;
      if (s < bs) { bs = s; best = e; }
    }
    return best;
  }
  aimAt(t, speed) {
    const h = this.h, D = this.m.diff;
    const d = t.dist(h), tt = speed ? d / speed : 0.3;
    const noise = D.spread * (Math.random() - 0.5) * 2;
    return { x: t.x + t.vx * tt * D.aim + noise, z: t.z + t.vz * tt * D.aim + noise };
  }
  useAbilities(t, enemies) {
    const m = this.m, h = this.h, D = m.diff;
    for (const slot of [4, 0, 3, 1, 2]) {
      if (!m.canCastNow(h, slot) || Math.random() > D.abilityUse) continue;
      const ab = h.def.abilities[slot], d = t.dist(h);
      const range = (ab.range || ab.radius || 4) + t.radius;
      let cast = false, x = t.x, z = t.z;
      switch (ab.ai) {
        case 'nuke': if (d <= range) { const p = this.aimAt(t, ab.speed); x = p.x; z = p.z; cast = true; } break;
        case 'aoe': if (ab.type === 'self' ? d <= (ab.radius || 3) * 0.9 : d <= range) { const p = this.aimAt(t, 0); x = p.x; z = p.z; cast = true; } break;
        case 'engage': if (d <= range && d > (h.melee ? 2.5 : 1)) { const p = this.aimAt(t, ab.speed || 25); x = p.x; z = p.z; cast = true; } break;
        case 'buff': case 'ultbuff': if (d <= h.st.range + 3) cast = true; break;
        case 'trap': if (d <= range) { const p = this.aimAt(t, 0); x = p.x + t.vx * 0.5; z = p.z + t.vz * 0.5; cast = true; } break;
        case 'ult': {
          if (ab.type === 'self') { if (enemies.filter(e => e.dist(h) <= (ab.radius || 5)).length >= 1 && (t.hp / t.st.maxHp < 0.6 || enemies.length > 1)) cast = true; break; }
          if (d > range) break;
          const p = this.aimAt(t, 0);
          const hits = enemies.filter(e => Math.hypot(e.x - p.x, e.z - p.z) < (ab.radius || 4)).length;
          if (hits >= 2 || t.hp / t.st.maxHp < 0.55) { x = p.x; z = p.z; cast = true; }
          break;
        }
        case 'sprint': if (d > h.st.range + 2.5 && d < 15 && (t.hp / t.st.maxHp < 0.6 || h.melee)) cast = true; break;
        case 'escape': if (h.def.role === 'Assassin' && d > h.st.range + 1 && d < (ab.range || 5) + 2 && t.hp / t.st.maxHp < 0.5) { x = t.x; z = t.z; cast = true; } break;
        case 'heal': case 'shield': if (h.hp / h.st.maxHp < 0.6) { cast = m.cast(h, slot, h.x, h.z, h); if (cast) return; } break;
      }
      if (cast && m.cast(h, slot, x, z, t)) return;
    }
  }
  supportAbilities(allies) {
    const m = this.m, h = this.h;
    for (const slot of [1, 3, 4]) {
      const ab = h.def.abilities[slot];
      if (!(ab.ai === 'heal' || ab.ai === 'shield') || !m.canCastNow(h, slot)) continue;
      const hurt = [h, ...allies].filter(a => a.dist(h) <= (ab.range || 6) && a.hp / a.st.maxHp < (ab.ai === 'heal' ? 0.6 : 0.5) && (a.combatT > 0 || ab.ai === 'heal')).sort((a, b) => a.hp / a.st.maxHp - b.hp / b.st.maxHp)[0];
      if (hurt) { m.cast(h, slot, hurt.x, hurt.z, hurt); return; }
    }
  }
  useEscape(f) {
    const m = this.m, h = this.h;
    for (let slot = 0; slot < 5; slot++) {
      const ab = h.def.abilities[slot];
      if (ab.ai === 'sprint' && m.canCastNow(h, slot)) { if (m.cast(h, slot, h.x, h.z, null)) return; continue; }
      if (ab.ai !== 'escape' || !m.canCastNow(h, slot)) continue;
      const dx = f.x - h.x, dz = f.z - h.z, l = Math.hypot(dx, dz) || 1, r = ab.range || 5;
      if (m.cast(h, slot, h.x + dx / l * r, h.z + dz / l * r, null)) return;
    }
  }
  // ---------- lanes ----------
  laneFarm(enemies) {
    const m = this.m, h = this.h, pts = this.pts;
    const myProg = progressOn(pts, h.x, h.z);
    // far from the lane: walk there
    const lane = this.laneName;
    const mine = m.units.filter(u => u.kind === 'minion' && u.alive && u.team === h.team && u.lane === lane);
    const foes = m.units.filter(u => u.kind === 'minion' && u.alive && u.team !== h.team && u.lane === lane && m.visibleTo(u, h.team));
    const dmg = h.st.ad;
    // last hits
    for (const e of foes) {
      if (e.dist(h) > h.st.range + 4) continue;
      const eff = dmg * 100 / (100 + e.st.armor);
      if (e.hp <= eff * 1.05 && !this.towerDanger(e.x, e.z, mine)) { this.attack(e); return; }
    }
    // mages clear waves with spells when they have mana to spare
    if (foes.length >= 3 && h.mana > h.st.maxMana * 0.7 && h.def.role === 'Mage') {
      const near = foes.filter(f => f.dist(h) < 9)[0];
      if (near && m.canCastNow(h, 0) && Math.random() < 0.3) m.cast(h, 0, near.x, near.z, near);
    }
    // push: hit minions and towers when it is safe
    const pushing = m.time > (m.quick ? 300 : 480) || !enemies.length;
    const tower = m.towers.find(t => t.alive && t.team !== h.team && (t.lane === lane || t.lane === 'core') && !t.protectedNow && t.dist(h) < TOWER.range + 6);
    if (tower) {
      const tTarget = tower.order && tower.order.target;
      const tanked = mine.some(u => u.dist(tower) < TOWER.range);
      if (tanked && tTarget && tTarget.kind === 'minion' && !enemies.some(e => e.dist(h) < 9)) { this.attack(tower); return; }
    }
    const core = m.cores[1 - h.team];
    if (!core.protectedNow && core.alive && core.dist(h) < 14 && mine.some(u => u.dist(core) < 12)) { this.attack(core); return; }
    if (pushing) {
      const f = foes.filter(e => e.dist(h) < h.st.range + 3 && !this.towerDanger(e.x, e.z, mine)).sort((a, b) => a.hp - b.hp)[0];
      if (f) { this.attack(f); return; }
    }
    // stand a bit behind our wave front (or our tower when there is no wave)
    let front = -1;
    for (const u of mine) { const p = progressOn(pts, u.x, u.z); if (p.dist < 12 && p.prog > front) front = p.prog; }
    if (front < 0) {
      const own = m.towers.filter(t => t.alive && t.team === h.team && t.lane === lane).map(t => progressOn(pts, t.x, t.z).prog);
      front = (own.length ? Math.max(...own) : 20) + 4;
    }
    const want = Math.max(10, front - (h.melee ? 2.5 : 5));
    const p = pointAt(pts, want);
    const side = (h.id % 3 - 1) * 2;
    let x = p.x + side * 0.7, z = p.z - side * 0.7;
    if (this.towerDanger(x, z, mine)) { const q = pointAt(pts, Math.max(10, want - 9)); x = q.x; z = q.z; }
    if (Math.hypot(x - h.x, z - h.z) > 1.5 || myProg.dist > 10) this.moveTo(x, z);
    else if (!h.order) { const f = foes.filter(e => e.dist(h) < h.st.range + 1)[0]; if (f && m.time > 90) this.attack(f); }
  }
  // is (x,z) inside an enemy tower's range with none of our minions there to take the hits?
  towerDanger(x, z, mine) {
    for (const t of this.m.towers) {
      if (!t.alive || t.team === this.h.team || Math.hypot(t.x - x, t.z - z) > TOWER.range + 1.5) continue;
      const tanks = mine.filter(u => u.dist(t) < TOWER.range).length;
      if (tanks < 2) return true;
    }
    return false;
  }
  support(enemies, allies) {
    const m = this.m, h = this.h;
    const adc = m.heroes.find(a => a.team === h.team && a.alive && a.bot !== undefined && a !== h && (a.lane === 'bot'));
    if (adc && adc.dist(FOUNTAIN[h.team]) > 30) {
      // stay close behind the marksman
      const toBase = Math.atan2(FOUNTAIN[h.team].x - adc.x, FOUNTAIN[h.team].z - adc.z);
      const x = adc.x + Math.sin(toBase) * 3, z = adc.z + Math.cos(toBase) * 3;
      if (h.distTo(x, z) > 2.5) { this.moveTo(x, z); return; }
      // poke enemy heroes near the marksman
      const e = enemies.find(e => e.dist(h) < h.st.range + 1);
      if (e) { this.useAbilities(e, enemies); this.attack(e); }
      return;
    }
    this.laneFarm(enemies);
  }
  // ---------- jungle ----------
  jungle(enemies) {
    const m = this.m, h = this.h;
    // gank: a hurt enemy hero not too far away
    const prey = m.heroes.filter(e => e.team !== h.team && e.alive && m.visibleTo(e, h.team) && e.dist(h) < 28 && e.hp / e.st.maxHp < 0.55 && !m.towers.some(t => t.alive && t.team === e.team && t.dist(e) < TOWER.range + 2))[0];
    if (prey && h.level >= 3) { if (prey.dist(h) < 10) { this.useAbilities(prey, enemies); this.attack(prey); } else this.moveTo(prey.x, prey.z); return; }
    // fight the camp we are at
    const fighting = m.units.find(u => u.kind === 'monster' && u.alive && u.aggro === h && !u.mdef.epic);
    if (fighting) {
      this.attack(fighting);
      if (h.mana > h.st.maxMana * 0.35) for (const s of [0, 1, 3]) { const ab = h.def.abilities[s]; if ((ab.ai === 'nuke' || ab.ai === 'aoe' || ab.ai === 'engage') && m.canCastNow(h, s) && fighting.dist(h) < (ab.range || ab.radius || 3)) { m.cast(h, s, fighting.x, fighting.z, fighting); break; } }
      return;
    }
    // next camp: nearest alive one, own side first
    const camps = m.camps.filter(c => c.alive && !c.def.epic && c.mobs.some(u => u.alive));
    const mineFirst = camps.filter(c => c.def.side === h.team);
    const pool = mineFirst.length ? mineFirst : (h.level >= 5 ? camps : []);
    const camp = pool.sort((a, b) => h.distTo(a.def.x, a.def.z) - h.distTo(b.def.x, b.def.z))[0];
    if (camp) {
      const big = camp.mobs.filter(u => u.alive).sort((a, b) => b.st.maxHp - a.st.maxHp)[0];
      if (big.dist(h) < 6) this.attack(big); else this.moveTo(big.x, big.z);
      return;
    }
    // before the camps spawn: wait at our buff camp
    if (m.time < RULES.campFirst) { const c = m.camps.find(c => c.def.side === h.team && c.def.id.startsWith('yeti')); if (c) { this.moveTo(c.def.x + 2, c.def.z + 2); return; } }
    this.laneFarm(enemies);
  }
  // ---------- team plans ----------
  teamPlan() {
    const m = this.m, h = this.h, team = h.team;
    m.plans = m.plans || [{ t: -1 }, { t: -1 }];
    const P = m.plans[team];
    if (m.time - P.t < 3) return P.plan;
    P.t = m.time; P.plan = null;
    const mates = m.heroes.filter(x => x.team === team && x.alive), foes = m.heroes.filter(x => x.team !== team && x.alive);
    // defend a tower or the core
    for (const t of [...m.towers, ...m.cores]) {
      if (!t.alive || t.team !== team) continue;
      const attackers = foes.filter(e => e.dist(t) < 14 && m.visibleTo(e, team));
      if (attackers.length >= 1 && (t.kind === 'core' || t.tier >= 1 || attackers.length >= 2)) { P.plan = { kind: 'defend', x: t.x, z: t.z, who: attackers.length >= 2 || t.kind === 'core' ? 'all' : 'near' }; return P.plan; }
    }
    const dragon = m.camps.find(c => c.def.id === 'dragon');
    if (dragon.alive && mates.length >= 3 && foes.length <= mates.length + 1 && m.time > m.mult.dragonFirst + 20) { P.plan = { kind: 'dragon', x: dragon.def.x, z: dragon.def.z, camp: dragon, who: ['jungle', 'bot', 'sup', ...(m.time > 900 ? ['mid', 'top'] : [])] }; return P.plan; }
    const boss = m.camps.find(c => c.def.id === 'boss');
    if (boss.alive && mates.length >= 4 && mates.length >= foes.length && mates.reduce((s, x) => s + x.level, 0) >= 40) { P.plan = { kind: 'boss', x: boss.def.x, z: boss.def.z, camp: boss, who: 'all' }; return P.plan; }
    if (m.time > (m.quick ? 420 : 900) && mates.length >= foes.length) {
      // push the lane whose next enemy tower is weakest
      let best = 'mid', bh = 1e9;
      for (const lane of ['top', 'mid', 'bot']) { const t = m.towers.filter(t => t.alive && t.team !== team && t.lane === lane).sort((a, b) => a.tier - b.tier)[0]; const hp = t ? t.hp : 0; if (hp < bh) { bh = hp; best = lane; } }
      if (bh === 0) best = 'mid';
      P.plan = { kind: 'push', lane: best, who: 'all' };
    }
    return P.plan;
  }
  doPlan(plan, enemies) {
    const m = this.m, h = this.h;
    const joins = plan.who === 'all' || (plan.who === 'near' ? h.distTo(plan.x, plan.z) < 45 : plan.who.includes(this.lane));
    if (!joins) return false;
    if (h.hp / h.st.maxHp < 0.45) return false;
    if (plan.kind === 'push') {
      const keep = this.lane; this.lane = plan.lane; this.laneFarm(enemies); this.lane = keep; return true;
    }
    if (plan.kind === 'defend') {
      if (h.distTo(plan.x, plan.z) > 8) { this.moveTo(plan.x, plan.z); return true; }
      return false;
    }
    // dragon / boss
    const mob = plan.camp.mobs.find(u => u.alive);
    if (!mob) return false;
    const gathered = m.heroes.filter(x => x.team === h.team && x.alive && x.distTo(plan.x, plan.z) < 16).length;
    const need = plan.kind === 'boss' ? 4 : 2;
    if (gathered < need && h.distTo(plan.x, plan.z) < 16) { if (h.distTo(plan.x, plan.z) > 9) this.moveTo(plan.x, plan.z); else if (h.order) m.orderStop(h); return true; }
    if (h.distTo(mob.x, mob.z) > 18) { this.moveTo(plan.x, plan.z); return true; }
    this.attack(mob);
    for (const s of [0, 1, 3]) { const ab = h.def.abilities[s]; if ((ab.ai === 'nuke' || ab.ai === 'aoe') && m.canCastNow(h, s) && mob.dist(h) < (ab.range || ab.radius || 3) + mob.radius) { m.cast(h, s, mob.x, mob.z, mob); break; } }
    this.supportAbilities(m.heroes.filter(a => a.team === h.team && a.alive && a !== h && a.dist(h) < 12));
    return true;
  }
  // ---------- shopping ----------
  shop() {
    const m = this.m, h = this.h;
    if (!m.inShop(h)) return;
    for (let guard = 0; guard < 6; guard++) {
      let bought = false;
      for (const id of h.def.items) {
        if (id === 'potion') { const have = h.items.reduce((s, i) => s + (i && i.id === 'potion' ? i.count : 0), 0); if (h.level < 9 && have < 2 && h.gold >= 50 && h.items.filter(Boolean).length < 5 && m.buy(h, 'potion')) { bought = true; break; } continue; }
        if (h.hasItem(id)) continue;
        const { price } = m.priceFor(h, id);
        if (h.gold >= price && (h.freeSlot() >= 0 || ITEM[id].from)) { if (m.buy(h, id)) { bought = true; break; } }
        // otherwise buy a part of it
        const it = ITEM[id];
        if (it.from) for (const c of it.from) {
          const need = it.from.filter(x => x === c).length, have = h.items.filter(s => s && s.id === c).length;
          if (have < need && h.gold >= ITEM[c].cost && h.freeSlot() >= 0) { if (m.buy(h, c)) { bought = true; break; } }
        }
        break;    // focus on the next item in the build
      }
      if (!bought) {
        // inventory full of parts: sell potions to make room
        if (h.freeSlot() < 0) { const p = h.items.findIndex(s => s && s.id === 'potion'); if (p >= 0) { m.sell(h, p); continue; } }
        break;
      }
    }
  }
}
