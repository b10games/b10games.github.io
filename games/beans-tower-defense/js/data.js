// All the numbers of Beans Tower Defense: difficulties, balloons and bosses, beans (towers) with their 10 upgrades,
// farms, maps, waves and the Bean Coins you earn for the shop.
// Distances are in world units (the playable field is about 82 x 52), times in seconds.

// ---------- difficulties ----------
export const DIFFS = {
  easy: { id: 'easy', name: 'Easy', lives: 200, money: 650, rounds: 30, speed: 0.88, hp: 0.9, count: 0.8, cost: 0.85, cash: 1.05, coins: 1, color: '#7bd389',
    desc: 'Slower, weaker balloons and fewer of them. Fewest Bean Coins.' },
  medium: { id: 'medium', name: 'Medium', lives: 100, money: 500, rounds: 40, speed: 1.0, hp: 1.1, count: 1.05, cost: 1.0, cash: 1.0, coins: 1.6, color: '#ffd23f',
    desc: 'Normal speed, more and stronger balloons. More Bean Coins.' },
  hard: { id: 'hard', name: 'Hard', lives: 50, money: 450, rounds: 50, speed: 1.05, hp: 1.2, count: 1.14, cost: 1.05, cash: 0.95, coins: 2.4, color: '#ff4d6d',
    desc: 'Fast, tough balloons in huge groups. Most Bean Coins.' },
  infinity: { id: 'infinity', name: 'Infinity', lives: 50, money: 450, rounds: Infinity, speed: 1.05, hp: 1.2, count: 1.14, cost: 1.05, cash: 0.95, coins: 2.8, color: '#b15cff', infinite: true,
    desc: 'Endless waves on Hard. They keep getting harder, forever. How far can you get?' }
};
export const ROUND_OPTIONS = [10, 20, 30, 40, 50, 60, 80, 100];

// ---------- balloons ----------
// hp = hits needed to pop this layer, children = what comes out when it pops, cash = money per pop
export const BALLOONS = {
  red: { name: 'Red Balloon', color: '#ff4d5e', speed: 4.37, hp: 1, size: 0.78, children: [], cash: 1 },
  blue: { name: 'Blue Balloon', color: '#3a8bff', speed: 5.77, hp: 1, size: 0.82, children: ['red'], cash: 1 },
  green: { name: 'Green Balloon', color: '#36c46b', speed: 7.18, hp: 1, size: 0.86, children: ['blue'], cash: 1 },
  yellow: { name: 'Yellow Balloon', color: '#ffd23f', speed: 10.14, hp: 1, size: 0.9, children: ['green'], cash: 1 },
  purple: { name: 'Purple Balloon', color: '#9b5de5', speed: 6.71, hp: 3, size: 1.0, children: ['yellow', 'yellow'], cash: 3, tough: true },
  rainbow: { name: 'Rainbow Balloon', color: 'rainbow', speed: 7.64, hp: 10, size: 1.12, children: ['purple', 'purple'], cash: 6, tough: true },
  steel: { name: 'Steel Balloon', color: '#aab4c0', speed: 5.0, hp: 26, size: 1.2, children: ['rainbow', 'rainbow'], cash: 10, tough: true, metal: true },
  // bosses (a boss comes every 10th wave; the last wave always brings the King)
  boss1: { name: 'Big Balloon', color: '#e05a2b', speed: 3.2, hp: 36, size: 2.2, children: ['purple', 'purple'], cash: 40, boss: true, tough: true, ref: 10, look: 'stripes' },
  giant: { name: 'Giant Balloon', color: '#5b4b8a', speed: 2.9, hp: 400, size: 3.0, children: ['rainbow', 'rainbow', 'rainbow', 'rainbow'], cash: 100, boss: true, tough: true, ref: 25, look: 'stars' },
  colossal: { name: 'Colossal Balloon', color: '#2b7a78', speed: 2.6, hp: 1700, size: 3.6, children: ['rainbow', 'rainbow', 'rainbow', 'rainbow', 'rainbow', 'rainbow'], cash: 220, boss: true, tough: true, ref: 45, look: 'bands' },
  king: { name: 'King Balloon', color: '#d4a017', speed: 2.4, hp: 2600, size: 4.3, children: ['giant', 'rainbow', 'rainbow'], cash: 500, boss: true, tough: true, ref: 50, look: 'crown' }
};
export const BALLOON_ORDER = ['red', 'blue', 'green', 'yellow', 'purple', 'rainbow', 'steel', 'boss1', 'giant', 'colossal', 'king'];
const RBE = {};
export function rbe(type, hpMul = 1) {
  const k = type + '|' + hpMul;
  if (RBE[k] === undefined) { const d = BALLOONS[type]; RBE[k] = Math.round(d.hp * (d.tough ? hpMul : 1)) + d.children.reduce((s, c) => s + rbe(c, hpMul), 0); }
  return RBE[k];
}
// which boss a boss wave brings, how many, how tough and what comes out of it
export function bossFor(w, rounds) { return w === rounds ? 'king' : w <= 10 ? 'boss1' : w <= 30 ? 'giant' : 'colossal'; }
export function bossCount(type, w) { return type === 'king' ? 1 : type === 'giant' ? (w >= 30 ? 2 : 1) : type === 'colossal' ? Math.min(6, 1 + Math.floor((w - 40) / 15)) : 1; }
export function bossHpScale(type, w) { return type === 'king' ? Math.max(0.035, Math.pow(w / 50, 2)) : Math.max(0.3, Math.pow(w / BALLOONS[type].ref, 1.15)); }
export function bossChildren(type, w) {
  if (type === 'king') return w < 20 ? ['purple', 'purple', 'purple', 'purple'] : w < 35 ? ['rainbow', 'rainbow', 'rainbow', 'rainbow'] : w < 70 ? ['giant', 'rainbow', 'rainbow'] : ['colossal', 'giant'];
  return BALLOONS[type].children;
}

// ---------- beans (towers) ----------
// kind = how it attacks. base stats: range, cd (seconds between attacks), dmg (layers popped per hit), pierce...
// Each bean has 10 upgrades in a row. Upgrades 5 and 10 are the big ones and give the bean a new look.
// mod keys add to a stat, except rate (multiplies attacks per second), bossMul (best wins) and the special flags.
const U = (name, desc, mod) => ({ name, desc, mod });
export const UP_COST = [0.4, 0.5, 0.7, 0.9, 1.45, 1.4, 1.8, 2.4, 3.2, 5];   // x the bean's price
export const BEANS = [
  { id: 'dart', name: 'Dart Bean', kind: 'dart', cost: 200, unlock: 0, target: 'first', icon: 'dart', colors: ['#ff8c42', '#3a86ff'], skins: [['#ff8c42', '#3a86ff'], ['#ff6b2c', '#ffd23f'], ['#ffb703', '#ff4d6d']], badge: ['#ffb37a', '#c2410c'],
    desc: 'Throws sharp darts. Cheap, quick and great early on.',
    base: { range: 9, cd: 0.8, dmg: 1, pierce: 3, count: 1, spread: 0.2, speed: 46 },
    ups: [U('Sharp Tips', '+1 pierce', { pierce: 1 }), U('Fast Throw', 'Throws 20% faster', { rate: 1.2 }), U('Long Arm', '+1.5 range', { range: 1.5 }), U('Razor Darts', '+1 damage', { dmg: 1 }),
      U('Triple Throw', 'Throws 3 darts at once', { count: 2 }), U('Quick Hands', 'Throws 25% faster', { rate: 1.25 }), U('Spiked Darts', '+3 pierce', { pierce: 3 }),
      U('Eagle Eye', '+2 range and faster darts', { range: 2, speed: 15 }), U('Heavy Darts', '+1 damage, 15% faster', { dmg: 1, rate: 1.15 }), U('Dart Storm', '5 darts, 50% faster', { count: 2, rate: 1.5 })] },
  { id: 'sniper', name: 'Sniper Bean', kind: 'hitscan', cost: 350, unlock: 0, target: 'strong', icon: 'sniper', colors: ['#6a994e', '#386641'], skins: [['#6a994e', '#386641'], ['#4f772d', '#ffd23f'], ['#2d6a4f', '#ff4d6d']], badge: ['#a7c957', '#386641'],
    desc: 'Hits balloons almost anywhere on the map. Slow but strong shots.',
    base: { range: 30, cd: 1.6, dmg: 3, pierce: 1 },
    ups: [U('Big Bullets', '+2 damage', { dmg: 2 }), U('Quick Reload', 'Shoots 25% faster', { rate: 1.25 }), U('Better Scope', '+12 range', { range: 12 }), U('Huge Bullets', '+3 damage', { dmg: 3 }),
      U('Ricochet', 'Sees the whole map, shots bounce to 2 more balloons', { ricochet: 2, range: 200 }), U('Fast Reload', 'Shoots 30% faster', { rate: 1.3 }), U('Armor Piercing', '+4 damage', { dmg: 4 }),
      U('Speedy Reload', 'Shoots 30% faster', { rate: 1.3 }), U('Boss Hunter', 'Double damage to bosses', { bossMul: 2 }), U('Elite Sniper', '+10 damage, 60% faster, 2 more bounces', { dmg: 10, rate: 1.6, ricochet: 2 })] },
  { id: 'boomerang', name: 'Boomerang Bean', kind: 'boom', cost: 300, unlock: 0, target: 'first', icon: 'boomerang', colors: ['#ffd166', '#06d6a0'], skins: [['#ffd166', '#06d6a0'], ['#ffb703', '#118ab2'], ['#ff9f1c', '#ef476f']], badge: ['#ffe08a', '#0f8a6a'],
    desc: 'Its boomerang flies out and back, popping many balloons on the way.',
    base: { range: 10, cd: 1.1, dmg: 1, pierce: 7, count: 1, speed: 24 },
    ups: [U('Wide Swing', '+3 pierce', { pierce: 3 }), U('Metal Edge', '+1 damage', { dmg: 1 }), U('Fast Throw', 'Throws 20% faster', { rate: 1.2 }), U('Long Flight', '+1.5 range, +3 pierce', { range: 1.5, pierce: 3 }),
      U('Double Throw', 'Throws 2 boomerangs', { count: 1 }), U('Spiked Rim', '+1 damage', { dmg: 1 }), U('Triple Throw', 'Throws 3 boomerangs', { count: 1 }),
      U('Endless Spin', '+10 pierce', { pierce: 10 }), U('Fast Hands', 'Throws 30% faster', { rate: 1.3 }), U('Blazing Party', '5 burning boomerangs, +2 damage', { count: 2, dmg: 2, blaze: 1 })] },
  { id: 'bomb', name: 'Bomb Bean', kind: 'bomb', cost: 520, unlock: 0, target: 'first', icon: 'bomb', colors: ['#5c5f7a', '#ff6b35'], skins: [['#5c5f7a', '#ff6b35'], ['#3d405b', '#ffd23f'], ['#22223b', '#ff4d6d']], badge: ['#ff9f6b', '#3d3f58'],
    desc: 'Lobs bombs that explode and pop whole groups of balloons.',
    base: { range: 9.5, cd: 1.3, dmg: 1, radius: 2.9, maxHits: 18, speed: 20 },
    ups: [U('Big Bombs', 'Bigger explosions', { radius: 0.6, maxHits: 6 }), U('Heavy Powder', '+1 damage', { dmg: 1 }), U('Short Fuse', 'Throws 20% faster', { rate: 1.2 }), U('Long Throw', '+2 range', { range: 2 }),
      U('Cluster Bombs', 'Each explosion throws out 6 mini bombs', { cluster: 6 }), U('Huge Bombs', 'Even bigger explosions', { radius: 0.8, maxHits: 10 }), U('Mega Powder', '+2 damage', { dmg: 2 }),
      U('Rapid Fire', 'Throws 30% faster', { rate: 1.3 }), U('Boss Buster', 'Triple damage to bosses', { bossMul: 3 }), U('Mega Blast', '+3 damage, giant explosions, 4 more mini bombs', { dmg: 3, radius: 1, cluster: 4 })] },
  { id: 'freeze', name: 'Freeze Bean', kind: 'ice', cost: 300, unlock: 0, target: 'first', icon: 'ice', colors: ['#a0e7ff', '#5e60ce'], skins: [['#a0e7ff', '#5e60ce'], ['#caf0f8', '#3a0ca3'], ['#ffffff', '#4cc9f0']], badge: ['#bfe8ff', '#3a3cb0'],
    desc: 'Shoots ice that freezes balloons for a moment, then slows them.',
    base: { range: 8.5, cd: 1.3, dmg: 1, freeze: 1.0, slow: 0.45, slowT: 1.8, area: 1.8, maxHits: 5, speed: 28 },
    ups: [U('Colder Ice', 'Freezes 0.3s longer', { freeze: 0.3 }), U('Bigger Blast', 'Freezes a bigger area', { area: 0.6, maxHits: 3 }), U('Quick Freeze', 'Shoots 20% faster', { rate: 1.2 }), U('Wide Reach', '+2 range', { range: 2 }),
      U('Frostbite', 'Longer freeze, more slow, frozen balloons take +1 damage', { freeze: 0.4, slow: 0.15, shatter: 1 }), U('Ice Cloud', 'An even bigger area', { area: 0.8, maxHits: 5 }), U('Icicles', '+2 damage', { dmg: 2 }),
      U('Cold Snap', 'Shoots 30% faster', { rate: 1.3 }), U('Deep Freeze', 'Freezes 0.5s longer, +1 shatter damage', { freeze: 0.5, shatter: 1 }), U('Blizzard', 'Every 3s freezes every balloon in range', { blizzard: 1, area: 1 })] },
  { id: 'ninja', name: 'Ninja Bean', kind: 'dart', proj: 'star', cost: 420, unlock: 250, target: 'first', icon: 'ninja', colors: ['#2b2d42', '#ff4d6d'], skins: [['#2b2d42', '#ff4d6d'], ['#3c096c', '#ffd23f'], ['#10002b', '#7df9ff']], badge: ['#9d4edd', '#240046'],
    desc: 'Throws lightning fast shurikens that cut through many balloons.',
    base: { range: 9.5, cd: 0.6, dmg: 1, pierce: 3, count: 1, spread: 0.25, speed: 52 },
    ups: [U('Sharp Stars', '+2 pierce', { pierce: 2 }), U('Quick Throw', 'Throws 20% faster', { rate: 1.2 }), U('Far Throw', '+1.5 range', { range: 1.5 }), U('Steel Stars', '+1 damage', { dmg: 1 }),
      U('Double Star', 'Throws 2 shurikens', { count: 1 }), U('Ninja Speed', 'Throws 30% faster', { rate: 1.3 }), U('Razor Stars', '+4 pierce', { pierce: 4 }),
      U('Shadow Strike', '+1 damage', { dmg: 1 }), U('Master Throw', 'Throws 25% faster', { rate: 1.25 }), U('Star Storm', '5 shurikens, +1 damage', { count: 3, dmg: 1 })] },
  { id: 'tack', name: 'Tack Bean', kind: 'tack', cost: 280, unlock: 200, target: 'first', icon: 'tack', colors: ['#e63946', '#f1faee'], skins: [['#e63946', '#f1faee'], ['#d00000', '#ffd23f'], ['#9d0208', '#7df9ff']], badge: ['#ff8a8a', '#9d0208'],
    desc: 'Shoots a ring of tacks in every direction. Short range, great at corners.',
    base: { range: 6, cd: 0.95, dmg: 1, pierce: 1, count: 8, speed: 30 },
    ups: [U('Longer Tacks', '+1 range', { range: 1 }), U('Faster Shots', 'Shoots 20% faster', { rate: 1.2 }), U('More Tacks', '+4 tacks', { count: 4 }), U('Sharp Tacks', '+1 pierce', { pierce: 1 }),
      U('Blade Ring', 'Blades instead of tacks: +1 damage, +2 pierce', { dmg: 1, pierce: 2 }), U('Even Faster', 'Shoots 30% faster', { rate: 1.3 }), U('Big Reach', '+1.5 range', { range: 1.5 }),
      U('Many Tacks', '+4 tacks', { count: 4 }), U('Hot Blades', '+1 damage', { dmg: 1 }), U('Tack Tornado', 'Shoots 80% faster, +4 blades', { rate: 1.8, count: 4 })] },
  { id: 'glue', name: 'Glue Bean', kind: 'glue', cost: 330, unlock: 350, target: 'first', icon: 'glue', colors: ['#f4d35e', '#0d3b66'], skins: [['#f4d35e', '#0d3b66'], ['#ffe066', '#2a9d8f'], ['#b5e48c', '#6a4c93']], badge: ['#ffe680', '#7a5c00'],
    desc: 'Squirts sticky glue: balloons get very slow. Upgrade for melting glue.',
    base: { range: 8.5, cd: 1.2, dmg: 0, slow: 0.5, slowT: 4, area: 1.2, maxHits: 3, speed: 24, dot: 0 },
    ups: [U('Stickier', '+10% slow', { slow: 0.1 }), U('Bigger Splat', 'Glues a bigger area', { area: 0.6, maxHits: 2 }), U('Quick Squirt', 'Shoots 20% faster', { rate: 1.2 }), U('Acid Glue', 'Glued balloons lose 1 layer every second', { dot: 1 }),
      U('Glue Storm', 'Glues even more balloons', { maxHits: 4, area: 0.6 }), U('Long Lasting', 'Glue lasts 2s longer', { slowT: 2 }), U('Strong Acid', '+1 acid damage per second', { dot: 1 }),
      U('Fast Squirt', 'Shoots 30% faster', { rate: 1.3 }), U('Super Glue', '+15% slow', { slow: 0.15 }), U('Melting Glue', '+3 acid damage, glues 6 more', { dot: 3, maxHits: 6 })] },
  { id: 'laser', name: 'Laser Bean', kind: 'laser', cost: 600, unlock: 600, target: 'first', icon: 'laser', colors: ['#e0e1dd', '#ff006e'], skins: [['#e0e1dd', '#ff006e'], ['#caf0f8', '#3a86ff'], ['#ffffff', '#ffd23f']], badge: ['#ff7ab8', '#7a0038'],
    desc: 'Fires a laser beam that burns through a whole line of balloons.',
    base: { range: 11, cd: 1.0, dmg: 2, pierce: 4, count: 1 },
    ups: [U('Focus Lens', '+1 damage', { dmg: 1 }), U('Longer Beam', '+2 range', { range: 2 }), U('Wide Beam', '+3 pierce', { pierce: 3 }), U('Cooler Core', 'Fires 25% faster', { rate: 1.25 }),
      U('Twin Beam', 'Fires 2 beams at once', { count: 1 }), U('Power Cell', '+2 damage', { dmg: 2 }), U('Long Beam', '+5 pierce', { pierce: 5 }),
      U('Overclock', 'Fires 30% faster', { rate: 1.3 }), U('Mega Lens', '+3 damage', { dmg: 3 }), U('Ultra Laser', '3 beams, 60% faster, +10 pierce', { rate: 1.6, pierce: 10, count: 1 })] },
  { id: 'lightning', name: 'Lightning Bean', kind: 'chain', cost: 650, unlock: 800, target: 'first', icon: 'lightning', colors: ['#90e0ef', '#ffd23f'], skins: [['#90e0ef', '#ffd23f'], ['#48cae4', '#ffffff'], ['#023e8a', '#ffd23f']], badge: ['#9fe7ff', '#03589e'],
    desc: 'Zaps a balloon with lightning that jumps on to the next ones.',
    base: { range: 9, cd: 1.3, dmg: 1, chain: 4, bounceR: 5, count: 1 },
    ups: [U('Longer Arcs', 'Jumps to 2 more balloons', { chain: 2 }), U('Charged', '+1 damage', { dmg: 1 }), U('Quick Charge', 'Zaps 20% faster', { rate: 1.2 }), U('Big Storm', '+2 range', { range: 2 }),
      U('Thunder', 'Jumps to 4 more, +1 damage', { chain: 4, dmg: 1 }), U('Static', 'Zaps 25% faster', { rate: 1.25 }), U('Mega Volt', '+2 damage', { dmg: 2 }),
      U('Wide Arcs', 'Jumps farther and to 4 more', { bounceR: 2, chain: 4 }), U('Storm Core', 'Zaps 30% faster', { rate: 1.3 }), U('Lightning Storm', '2 bolts at once, +6 jumps, +2 damage', { count: 1, chain: 6, dmg: 2 })] },
  { id: 'magic', name: 'Magic Bean', kind: 'magic', cost: 700, unlock: 1000, target: 'first', icon: 'magic', colors: ['#7b2cbf', '#ffd23f'], skins: [['#7b2cbf', '#ffd23f'], ['#5a189a', '#7df9ff'], ['#240046', '#ff6fd8']], badge: ['#c77dff', '#3c096c'],
    desc: 'Casts magic stars that chase balloons by themselves.',
    base: { range: 10, cd: 0.9, dmg: 1, pierce: 2, count: 1, speed: 18 },
    ups: [U('Bright Stars', '+1 damage', { dmg: 1 }), U('Quick Spell', 'Casts 20% faster', { rate: 1.2 }), U('Far Sight', '+2 range', { range: 2 }), U('Piercing Stars', '+2 pierce', { pierce: 2 }),
      U('Star Burst', 'Casts 3 stars', { count: 2 }), U('Arcane Power', '+1 damage', { dmg: 1 }), U('Fast Spell', 'Casts 30% faster', { rate: 1.3 }),
      U('Shining Stars', '+3 pierce', { pierce: 3 }), U('Big Magic', '+2 damage', { dmg: 2 }), U('Galaxy', '6 stars, 40% faster', { count: 3, rate: 1.4 })] },
  { id: 'cannon', name: 'Cannon Bean', kind: 'cannon', cost: 750, unlock: 1300, target: 'strong', icon: 'cannon', colors: ['#8d5524', '#2b2d42'], skins: [['#8d5524', '#2b2d42'], ['#6f4518', '#ffd23f'], ['#432818', '#e63946']], badge: ['#c08552', '#432818'],
    desc: 'Fires heavy cannonballs. Huge damage, perfect against bosses.',
    base: { range: 11, cd: 2.2, dmg: 4, radius: 1.4, maxHits: 6, speed: 40, count: 1, bossMul: 1.5 },
    ups: [U('Heavy Ball', '+2 damage', { dmg: 2 }), U('Bigger Splash', 'Bigger impact', { radius: 0.5, maxHits: 4 }), U('Fast Reload', 'Fires 20% faster', { rate: 1.2 }), U('Long Barrel', '+2 range', { range: 2 }),
      U('Double Barrel', 'Fires 2 cannonballs', { count: 1 }), U('Iron Ball', '+4 damage', { dmg: 4 }), U('Boss Smasher', 'Triple damage to bosses', { bossMul: 3 }),
      U('Quick Reload', 'Fires 30% faster', { rate: 1.3 }), U('Mega Ball', '+6 damage, bigger impact', { dmg: 6, radius: 0.5 }), U('Grand Cannon', '+10 damage, 40% faster, x4 vs bosses', { dmg: 10, rate: 1.4, bossMul: 4 })] }
];
export const BEAN = Object.fromEntries(BEANS.map(b => [b.id, b]));
export const STARTERS = BEANS.filter(b => !b.unlock).map(b => b.id);
export const TEAM_SIZE = 7;
export const TARGETS = ['first', 'last', 'strong', 'close'];
export const TARGET_NAME = { first: 'First', last: 'Last', strong: 'Strongest', close: 'Closest' };

// stats of a bean after `lvl` upgrades (0..10)
export function beanStats(def, lvl) {
  const s = { ...def.base, rate: 1, bossMul: def.base.bossMul || 1 };
  for (let k = 0; k < lvl; k++) for (const [key, v] of Object.entries(def.ups[k].mod)) { if (key === 'rate') s.rate *= v; else if (key === 'bossMul') s.bossMul = Math.max(s.bossMul, v); else s[key] = (s[key] || 0) + v; }
  s.cd = def.base.cd / s.rate;
  return s;
}
export const priceOf = (cost, diff) => Math.round(cost * diff.cost / 5) * 5;
export const upgradePrice = (def, lvl, diff) => lvl >= 10 ? null : priceOf(def.cost * UP_COST[lvl], diff);
export const skinFor = (lvl) => lvl >= 10 ? 3 : lvl >= 5 ? 2 : 1;

// ---------- farms ----------
// income = money per wave (part of it drops as coins during the wave, the rest when the wave ends)
export const FARMS = [
  { id: 'farm', name: 'Bean Farm', cost: 450, unlock: 0, income: 55, icon: 'farm', badge: ['#9be15d', '#2f7d32'], desc: 'Grows money every wave. Upgrade it to grow more.' },
  { id: 'candyfarm', name: 'Candy Farm', cost: 700, unlock: 600, income: 100, icon: 'candyfarm', badge: ['#ffb3d9', '#c2185b'], desc: 'A sweeter farm that grows almost twice as much.' },
  { id: 'goldfarm', name: 'Golden Farm', cost: 1100, unlock: 1500, income: 185, icon: 'goldfarm', badge: ['#ffe680', '#b07a00'], desc: 'The best farm. Grows real golden beans.' }
];
export const FARM = Object.fromEntries(FARMS.map(f => [f.id, f]));
export const FARM_MUL = [1, 1.25, 1.5, 1.8, 2.1, 2.8, 3.2, 3.7, 4.3, 5, 6.5];
export const FARM_UPS = ['Better Soil', 'Watering Can', 'More Rows', 'Scarecrow', 'Big Silo', 'Fertilizer', 'Greenhouse', 'Tractor', 'Bean Market', 'Mega Farm'];
export const farmIncome = (def, lvl, diff) => Math.round(def.income * FARM_MUL[lvl] * diff.cash);

// ---------- maps ----------
// path = control points from the entrance to the exit (x right, z down the screen)
export const MAPS = [
  { id: 'valley', name: 'Green Valley', desc: 'Rolling green hills, trees, flowers and a quiet pond.', level: 'Beginner', theme: 'valley',
    path: [[-46, -12], [-30, -14], [-22, -4], [-30, 8], [-20, 18], [-6, 12], [-7, -4], [3, -16], [17, -13], [16, 1], [24, 13], [36, 11], [35, -5], [46, -8]], ponds: [[-8, 22, 4.5], [30, -18, 4]] },
  { id: 'candy', name: 'Candy World', desc: 'Pink candy hills, giant candy canes and a soda lake.', level: 'Beginner', theme: 'candy',
    path: [[-46, 17], [-31, 18], [-34, 5], [-24, -7], [-34, -18], [-20, -22], [-8, -13], [-12, 3], [-1, 15], [11, 6], [8, -9], [19, -20], [31, -13], [25, 2], [34, 15], [46, 13]], ponds: [[-12, 21, 4], [36, -1, 3.5]] },
  { id: 'frost', name: 'Frozen Lake', desc: 'Snowy pines and snowmen around a frozen lake.', level: 'Intermediate', theme: 'frost',
    path: [[-46, -14], [-26, -16], [-14, -8], [-24, 4], [-30, 16], [-16, 22], [0, 16], [2, 2], [10, -10], [22, -16], [32, -8], [28, 6], [34, 18], [46, 18]], ponds: [[15, 10, 5]] },
  { id: 'dunes', name: 'Desert Dunes', desc: 'Hot sand, cactuses and rocks along a long winding road.', level: 'Intermediate', theme: 'dunes',
    path: [[-46, -19], [-10, -19], [22, -19], [31, -12], [24, -5], [-6, -5], [-26, -5], [-33, 2], [-26, 9], [4, 9], [24, 9], [31, 16], [24, 22], [-10, 22], [-46, 22]], ponds: [[38, 2, 3.2]] },
  { id: 'lava', name: 'Lava Land', desc: 'A zig-zag road between bubbling lava pools.', level: 'Advanced', theme: 'lava',
    path: [[-46, -20], [-32, -20], [-28, -8], [-34, 6], [-28, 20], [-16, 22], [-10, 10], [-14, -4], [-8, -18], [4, -20], [10, -8], [6, 6], [12, 20], [24, 22], [30, 10], [26, -4], [32, -18], [46, -18]], ponds: [[-21, -12, 3], [19, 8, 3]] },
  { id: 'swamp', name: 'Spooky Swamp', desc: 'A moonlit swamp with glowing mushrooms and tight turns.', level: 'Expert', theme: 'swamp',
    path: [[-46, 0], [-34, 0], [-30, -12], [-18, -20], [-6, -14], [-12, -2], [-22, 8], [-14, 20], [2, 18], [8, 6], [4, -8], [14, -20], [28, -18], [34, -6], [24, 4], [22, 16], [34, 22], [46, 20]], ponds: [[-36, 14, 4], [14, 9, 2.6]] }
];
export const MAP = Object.fromEntries(MAPS.map(m => [m.id, m]));
export const FIELD = { w: 41, h: 26 };       // playable half sizes

// ---------- waves ----------
// a wave is a list of groups: { t: balloon type, n: how many, gap: seconds between them, at: start time }
const HAND = [
  [{ t: 'red', n: 16, gap: 1.15 }],
  [{ t: 'red', n: 22, gap: 0.81 }, { t: 'blue', n: 5, gap: 1.49, at: 8 }],
  [{ t: 'blue', n: 14, gap: 1.01 }, { t: 'green', n: 5, gap: 1.62, at: 7 }, { t: 'red', n: 12, gap: 0.54, at: 3 }],
  [{ t: 'red', n: 32, gap: 0.38 }, { t: 'blue', n: 16, gap: 0.74, at: 9 }],
  [{ t: 'blue', n: 18, gap: 0.74 }, { t: 'green', n: 12, gap: 1.01, at: 5 }, { t: 'red', n: 24, gap: 0.3, at: 12 }],
  [{ t: 'green', n: 20, gap: 0.74 }, { t: 'blue', n: 14, gap: 0.51, at: 9 }],
  [{ t: 'yellow', n: 10, gap: 1.22 }, { t: 'green', n: 16, gap: 0.74, at: 4 }],
  [{ t: 'blue', n: 40, gap: 0.27 }, { t: 'green', n: 18, gap: 0.61, at: 7 }, { t: 'yellow', n: 6, gap: 1.08, at: 12 }],
  [{ t: 'green', n: 24, gap: 0.61 }, { t: 'purple', n: 4, gap: 2.7, at: 6 }],
  [{ t: 'yellow', n: 14, gap: 0.68 }, { t: 'green', n: 20, gap: 0.41, at: 8 }]       // + the first boss
];
function rand(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; }

export function waveInfo(w, rounds) { return { boss: w % 10 === 0 || w === rounds, final: w === rounds, type: (w % 10 === 0 || w === rounds) ? bossFor(w, rounds) : null }; }
// after wave 20 tough balloons get more life and a little more speed; in Infinity mode it keeps growing after wave 50
export function waveScale(w, diff) {
  const mid = Math.max(0, w - 20), late = diff.infinite ? Math.max(0, w - 50) : 0;
  return { hp: diff.hp * (1 + mid * 0.035) * (1 + late * 0.05), speed: diff.speed * Math.min(1.35, 1 + mid * 0.006) * Math.min(1.4, 1 + late * 0.01), count: diff.count * Math.pow(1.045, late) };
}
export function makeWave(w, diff, rounds) {
  const groups = [], sc = waveScale(w, diff), info = waveInfo(w, rounds);
  if (w <= HAND.length) for (const g of HAND[w - 1]) groups.push({ ...g, at: g.at || 0, n: Math.max(1, Math.round(g.n * (1 + (sc.count - 1) * 0.5) * (w <= 2 ? 1 : 0.85))) });
  else {
    const r = rand(w * 7919 + diff.id.length * 31);
    let left = (10 + 1.25 * Math.pow(w, 1.95)) * (1 + Math.max(0, w - 15) * 0.13) * sc.count, at = 0;
    if (info.boss) left *= 0.45;
    const unlocked = ['red', 'blue', 'green', 'yellow', 'purple', 'rainbow', 'steel'].filter(t => ({ red: w < 24, blue: w < 30, green: w < 36, yellow: w < 46, purple: w >= 11, rainbow: w >= 16, steel: w >= 28 })[t]);
    const theme = ['mixed', 'rush', 'wall', 'escort', 'mixed'][Math.floor(r() * 5)];
    const nGroups = theme === 'rush' || theme === 'wall' ? 2 : 3;
    const pick = (pref) => {
      const pool = unlocked.filter(t => !pref || pref.includes(t)), list = pool.length ? pool : unlocked;
      const weights = list.map((t, i) => 1 + i * (w / 16));
      let x = r() * weights.reduce((a, b) => a + b, 0);
      for (let i = 0; i < list.length; i++) { x -= weights[i]; if (x <= 0) return list[i]; }
      return list[list.length - 1];
    };
    for (let i = 0; i < nGroups && left > 0; i++) {
      const t = theme === 'rush' ? pick(['yellow', 'green', 'blue', 'purple']) : theme === 'wall' ? pick(['purple', 'rainbow', 'steel', 'green']) : theme === 'escort' && i === 0 ? pick(['steel', 'rainbow', 'purple']) : pick();
      const share = i === nGroups - 1 ? left : left * (0.35 + r() * 0.3);
      const n = Math.max(1, Math.min(260, Math.round(share / rbe(t, sc.hp))));
      left -= n * rbe(t, sc.hp);
      const dur = theme === 'rush' ? 8 + r() * 6 : 14 + r() * 12;
      groups.push({ t, n, gap: Math.max(0.1, Math.min(2.5, dur / n)), at });
      at += theme === 'rush' ? 1 + r() * 2 : 3 + r() * 6;
    }
  }
  if (info.boss) { const bt = info.type, n = bossCount(bt, w); groups.push({ t: bt, n, gap: 6, at: 5 }); }
  return groups;
}
// money for finishing wave w
export const waveBonus = (w) => 100 + w;
// Bean Coins for the shop: more for harder difficulties and longer games
export function coinsFor(cleared, diff, won, rounds) { return Math.round(cleared * 2.2 * diff.coins + (won ? Math.min(rounds, 100) * 1.3 * diff.coins + 20 : 0)); }
