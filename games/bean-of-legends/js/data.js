// Game data for Bean of Legends: heroes, abilities, items, jungle monsters and the rules of a match.
// Everything here is plain data so new heroes, items and monsters are easy to add.

export const BLUE = 0, RED = 1, NEUTRAL = 2;
export const TEAM_NAME = ['BLUE TEAM', 'RED TEAM', 'NEUTRAL'];
export const TEAM_COLOR = ['#3a86ff', '#ff4d6d', '#ffd23f'];

export const RULES = {
  startGold: 600, passiveGold: 2.8, passiveFrom: 40,
  firstWave: 20, waveEvery: 28, siegeEvery: 2,
  heroKillGold: 300, assistGold: 150, firstBlood: 100,
  towerGoldTeam: 150, towerGoldLast: 150,
  xpRange: 16, maxLevel: 18,
  respawn: () => 10,
  xpToNext: lvl => 150 + 50 * (lvl - 1),
  campFirst: 45, campRespawn: 100, buffRespawn: 150,
  dragonFirst: 150, dragonRespawn: 240, bossFirst: 480, bossRespawn: 300,
  recallTime: 5, fountainR: 13, shopR: 19
};
export const QUICK = { gold: 1.5, xp: 2.1, towerHp: 0.76, coreHp: 0.86, bossFirst: 330, dragonFirst: 90 };

export const DIFFICULTY = {
  easy: { name: 'EASY', think: 0.42, aim: 0.45, retreat: 0.22, dmg: 0.82, gold: 0.85, spread: 1.4, abilityUse: 0.55 },
  normal: { name: 'NORMAL', think: 0.26, aim: 0.8, retreat: 0.3, dmg: 1, gold: 1, spread: 0.7, abilityUse: 0.85 },
  hard: { name: 'HARD', think: 0.16, aim: 1, retreat: 0.36, dmg: 1.08, gold: 1.18, spread: 0.3, abilityUse: 1 }
};

export const ROLES = {
  Tank: { color: '#7bd389', icon: 'shield', desc: 'High health and strong defensive abilities.' },
  Fighter: { color: '#ff8c42', icon: 'swords', desc: 'Balanced damage and health.' },
  Assassin: { color: '#c77dff', icon: 'dagger', desc: 'High damage and mobility, but lower health.' },
  Mage: { color: '#3a86ff', icon: 'orb', desc: 'Magical attacks and powerful abilities.' },
  Marksman: { color: '#ffd23f', icon: 'bow', desc: 'Long-range attacks and consistent damage.' },
  Support: { color: '#00e5ff', icon: 'heartplus', desc: 'Helps teammates with healing, shields and buffs.' }
};
// which lane a role likes to play
export const ROLE_LANE = { Tank: 'top', Fighter: 'jungle', Assassin: 'mid', Mage: 'mid', Marksman: 'bot', Support: 'sup' };

// Ability fields:
//  Q = strong single-target hit (splash only on clumped enemies), W = area attack, E = sprint (innate, ranks up with level),
//  R = the bean's own special, T = ultimate (levels 6/11/16).
//  type: skillshot (fires toward the cursor) | ground (target point) | unit (enemy target) | ally (ally or self) | self
//  dmg/ad/ap/dtype: damage per rank and ratios, cd/cost per rank, range/radius/width/speed in world units
//  ai: how bots use it (nuke, aoe, engage, escape, buff, heal, shield, trap, ult)
// {dmg} in the text is filled in with the numbers per rank.
export const HEROES = [
  {
    id: 'knight', badge: ['#7fb2ff', '#1d3f8f'], title: 'THE KNIGHT', name: 'Sir Wobbleton', role: 'Tank', difficulty: 1, melee: true,
    colors: ['#c0c7d1', '#3a86ff'], chromas: [['#ffd23f', '#c62828'], ['#343a40', '#7bd389']],
    lore: 'A tiny bean in very large armour. Swore an oath to protect every snack in the kingdom.',
    stats: { hp: [640, 104], mana: [300, 42], ad: [62, 3.4], armor: [36, 4.6], mr: [32, 2.1], as: [0.65, 0.024], range: 2.3, ms: 7.93, hpRegen: [2.2, 0.2], manaRegen: [1.6, 0.1] },
    proj: null, hitColor: '#e9ecef',
    abilities: [
      { key: 'Q', name: 'Royal Strike', icon: 'swordstrike', kind: 'lunge', type: 'unit', range: 4.5, splash: 1.4, color: '#e9ecef', dmg: [80, 125, 170, 215, 260], ad: 1.0, dtype: 'phys', cd: [7, 6.5, 6, 5.5, 5], cost: [40, 40, 40, 40, 40], ai: 'nuke',
        text: 'Leaps at one enemy and strikes it hard for {dmg} physical damage. Only enemies squeezed right next to the target also get hit (60%).' },
      { key: 'W', name: 'Earthquake Slam', icon: 'smash', kind: 'nova', type: 'self', radius: 5.5, slow: 0.3, crack: true, color: '#cfd6de', dmg: [60, 95, 130, 165, 200], ad: 0.6, dtype: 'phys', cd: [10, 9.5, 9, 8.5, 8], cost: [55, 55, 55, 55, 55], ai: 'aoe',
        text: 'BIG area: slams the ground, dealing {dmg} physical damage to every enemy in a wide circle and slowing them by 30% for 1.5s.' },
      { key: 'E', name: 'Gallop', icon: 'horseshoe', kind: 'sprint', type: 'self', innate: true, ms: [0.4, 0.46, 0.52, 0.58, 0.64], dur: 3, color: '#ffd23f', cd: [14, 13, 12, 11, 10], cost: [0, 0, 0, 0, 0], ai: 'sprint',
        text: 'Gallops like a (very small) horse. Gains {ms} movement speed for 3s and runs through units. Free, and it ranks up by itself as you level.' },
      { key: 'R', name: 'Shield Boomerang', icon: 'shieldthrow', kind: 'boomerang', type: 'skillshot', range: 10, width: 1.7, speed: 24, stun: 0.6, color: '#3a86ff', dmg: [60, 95, 130, 165, 200], ad: 0.5, dtype: 'phys', cd: [14, 13, 12, 11, 10], cost: [60, 60, 60, 60, 60], ai: 'nuke',
        text: 'Throws the shield like a boomerang. It hits every enemy on the way out AND on the way back for {dmg} physical damage, and the first hero hit is stunned for 0.6s.' },
      { key: 'T', name: 'Royal Bean', icon: 'crown', type: 'self', radius: 5.5, dmg: [150, 250, 350], ap: 0.5, dtype: 'magic', bonusHp: [300, 500, 700], resist: [30, 45, 60], cd: [110, 95, 80], cost: [100, 100, 100], ai: 'ult',
        text: 'Grows huge for 10s, gaining 300/500/700 health and 30/45/60 armor and magic resist, and smashes the ground for {dmg} magic damage (+5% max health), knocking enemies up.' }
    ],
    items: ['potion', 'treads', 'bulwark', 'cape', 'belt', 'shell']
  },
  {
    id: 'ninja', badge: ['#b06cff', '#2b0f4d'], title: 'THE NINJA', name: 'Shadowbean', role: 'Assassin', difficulty: 3, melee: true,
    colors: ['#2b2d42', '#ff4d6d'], chromas: [['#f8f9fa', '#3a86ff'], ['#5a189a', '#ffd23f']],
    lore: 'Nobody has ever seen Shadowbean. Mostly because Shadowbean keeps hiding in the bushes.',
    stats: { hp: [560, 92], mana: [320, 40], ad: [66, 3.6], armor: [28, 4.2], mr: [30, 2.0], as: [0.68, 0.03], range: 2.1, ms: 8.28, hpRegen: [1.8, 0.16], manaRegen: [1.8, 0.12] },
    proj: null, hitColor: '#c77dff',
    abilities: [
      { key: 'Q', name: 'Triple Shuriken', icon: 'shuriken3', kind: 'bolt', type: 'skillshot', count: 3, spread: 0.17, range: 10, width: 0.8, speed: 34, shape: 'star', spin: 22, splash: 1.0, color: '#c77dff', dmg: [50, 80, 110, 140, 170], ad: 0.6, dtype: 'phys', cd: [6, 5.5, 5, 4.5, 4], cost: [35, 35, 35, 35, 35], ai: 'nuke',
        text: 'STRONG Q: throws 3 shurikens in a fan. Each deals {dmg} physical damage to the first enemy it hits (extra shurikens on the same target deal 50%).' },
      { key: 'W', name: 'Spin Slash', icon: 'spinslash', kind: 'nova', type: 'self', radius: 3.2, spin: true, color: '#c77dff', dmg: [60, 95, 130, 165, 200], ad: 0.7, dtype: 'phys', cd: [9, 8.5, 8, 7.5, 7], cost: [45, 45, 45, 45, 45], ai: 'aoe',
        text: 'Small area: spins with both blades, dealing {dmg} physical damage to enemies close around the Ninja.' },
      { key: 'E', name: 'Shadow Step', icon: 'dash', kind: 'sprint', type: 'self', innate: true, ms: [0.4, 0.46, 0.52, 0.58, 0.64], dur: 3, color: '#7b2cbf', cd: [14, 13, 12, 11, 10], cost: [0, 0, 0, 0, 0], ai: 'sprint',
        text: 'Runs like a shadow. Gains {ms} movement speed for 3s and runs through units. Free, and it ranks up by itself as you level.' },
      { key: 'R', name: 'Shadow Strike', icon: 'shadowstrike', kind: 'shadowstrike', type: 'unit', range: 8, color: '#c77dff', dmg: [70, 110, 150, 190, 230], ad: 0.8, dtype: 'phys', cd: [16, 15, 14, 13, 12], cost: [60, 60, 60, 60, 60], ai: 'engage',
        text: 'Teleports behind an enemy and stabs it for {dmg} physical damage, then turns invisible for 1s. The next basic attack deals 40% bonus damage.' },
      { key: 'T', name: 'Shadow Clones', icon: 'clones', type: 'self', dur: [6, 7, 8], pct: [0.35, 0.45, 0.55], cd: [100, 85, 70], cost: [100, 100, 100], ai: 'ult',
        text: 'Summons 3 shadow clones for 6/7/8s that attack nearby enemies for 35/45/55% of the Ninja\'s damage. Gains 25% movement speed for 3s.' }
    ],
    items: ['potion', 'knife', 'fangs', 'sneakers', 'blade', 'bulwark']
  },
  {
    id: 'dino', badge: ['#8be07f', '#1f6b33'], title: 'THE DINO', name: 'Rexy', role: 'Fighter', difficulty: 1, melee: true,
    colors: ['#7bd389', '#ffd23f'], chromas: [['#ff8c42', '#8338ec'], ['#3a86ff', '#ff6fd8']],
    lore: 'Rexy is 100% a real dinosaur. Please do not look at the zipper.',
    stats: { hp: [620, 100], mana: [290, 40], ad: [65, 3.6], armor: [33, 4.4], mr: [32, 2.0], as: [0.64, 0.026], range: 2.3, ms: 7.93, hpRegen: [2.1, 0.2], manaRegen: [1.5, 0.1] },
    proj: null, hitColor: '#7bd389',
    abilities: [
      { key: 'Q', name: 'Rock Throw', icon: 'rock', kind: 'bolt', type: 'skillshot', count: 1, range: 9, width: 1.1, speed: 24, shape: 'rock', spin: 8, splash: 1.6, slow: 0.25, color: '#a1887f', dmg: [80, 125, 170, 215, 260], ad: 1.0, dtype: 'phys', cd: [7, 6.5, 6, 5.5, 5], cost: [40, 40, 40, 40, 40], ai: 'nuke',
        text: 'Hurls a big rock: {dmg} physical damage to the first enemy hit and a 25% slow. Only enemies right next to it also get hit (60%).' },
      { key: 'W', name: 'Tail Quake', icon: 'tail', kind: 'nova', type: 'self', radius: 5, knock: 2, spin: true, crack: true, color: '#7bd389', dmg: [60, 95, 130, 165, 200], ad: 0.6, dtype: 'phys', cd: [10, 9.5, 9, 8.5, 8], cost: [50, 50, 50, 50, 50], ai: 'aoe',
        text: 'BIG area: spins and slams the tail down, dealing {dmg} physical damage to all enemies in a wide circle and knocking them back.' },
      { key: 'E', name: 'Stampede', icon: 'stomp', kind: 'sprint', type: 'self', innate: true, ms: [0.4, 0.46, 0.52, 0.58, 0.64], dur: 3, color: '#a1887f', cd: [14, 13, 12, 11, 10], cost: [0, 0, 0, 0, 0], ai: 'sprint',
        text: 'Stomps along at full dino speed. Gains {ms} movement speed for 3s and runs through units. Free, and it ranks up by itself as you level.' },
      { key: 'R', name: 'Rock Fissure', icon: 'fissure', kind: 'fissure', type: 'skillshot', range: 11, width: 2.4, speed: 40, color: '#a1887f', dmg: [70, 110, 150, 190, 230], ad: 0.6, dtype: 'phys', cd: [15, 14, 13, 12, 11], cost: [60, 60, 60, 60, 60], ai: 'nuke',
        text: 'Cracks the ground in a straight line. Rock spikes burst up along it, dealing {dmg} physical damage and knocking every enemy up for 0.6s.' },
      { key: 'T', name: 'Giant Dino', icon: 'dinohead', type: 'self', bonusHp: [300, 450, 600], adPct: [0.35, 0.5, 0.65], cd: [110, 95, 80], cost: [100, 100, 100], ai: 'ultbuff',
        text: 'Grows giant for 10s: gains 300/450/600 health and 35/50/65% attack damage, and basic attacks splash around the target.' }
    ],
    items: ['potion', 'knife', 'treads', 'belt', 'fangs', 'bulwark']
  },
  {
    id: 'shark', badge: ['#6ec6ff', '#0b4a7a'], title: 'THE SHARK', name: 'Chomps', role: 'Fighter', difficulty: 2, melee: true,
    colors: ['#4d9de0', '#f8f9fa'], chromas: [['#ff6fd8', '#f8f9fa'], ['#343a40', '#ff4d6d']],
    lore: 'Chomps left the ocean because the ocean did not have enough snacks. Still looking.',
    stats: { hp: [600, 96], mana: [300, 40], ad: [67, 3.7], armor: [31, 4.3], mr: [32, 2.0], as: [0.68, 0.03], range: 2.2, ms: 8.05, hpRegen: [2.0, 0.18], manaRegen: [1.6, 0.1] },
    proj: null, hitColor: '#9fd8ff',
    abilities: [
      { key: 'Q', name: 'Double Bite', icon: 'jaws', kind: 'lunge', type: 'unit', range: 5.5, hits: 2, splash: 1.2, lifesteal: 0.25, bite: true, color: '#9fd8ff', dmg: [45, 70, 95, 120, 145], ad: 0.6, dtype: 'phys', cd: [7, 6.5, 6, 5.5, 5], cost: [40, 40, 40, 40, 40], ai: 'nuke',
        text: 'STRONG Q: lunges at an enemy and bites TWICE, each bite dealing {dmg} physical damage. Heals for 25% of the damage.' },
      { key: 'W', name: 'Splash Down', icon: 'wave', kind: 'nova', type: 'self', radius: 3.8, slow: 0.35, water: true, color: '#4d9de0', dmg: [60, 95, 130, 165, 200], ad: 0.5, ap: 0.3, dtype: 'magic', cd: [10, 9.5, 9, 8.5, 8], cost: [50, 50, 50, 50, 50], ai: 'aoe',
        text: 'Small area: belly-flops and splashes water around, dealing {dmg} magic damage to nearby enemies and slowing them by 35% for 1.5s.' },
      { key: 'E', name: 'Surf Rush', icon: 'fin', kind: 'sprint', type: 'self', innate: true, ms: [0.4, 0.46, 0.52, 0.58, 0.64], dur: 3, color: '#9fd8ff', cd: [14, 13, 12, 11, 10], cost: [0, 0, 0, 0, 0], ai: 'sprint',
        text: 'Surfs over the ground. Gains {ms} movement speed for 3s and runs through units. Free, and it ranks up by itself as you level.' },
      { key: 'R', name: 'Deep Dive', icon: 'dive', kind: 'deepdive', type: 'ground', range: 10, radius: 3.2, color: '#4d9de0', dmg: [70, 110, 150, 190, 230], ad: 0.6, dtype: 'phys', cd: [16, 15, 14, 13, 12], cost: [60, 60, 60, 60, 60], ai: 'engage',
        text: 'Dives under the ground (nothing can hit Chomps) and swims to a spot, then bursts out, dealing {dmg} physical damage and knocking enemies up for 0.75s.' },
      { key: 'T', name: 'Feeding Frenzy', icon: 'frenzy', type: 'self', as: [0.5, 0.7, 0.9], cd: [100, 85, 70], cost: [100, 100, 100], ai: 'ultbuff',
        text: 'Goes into a frenzy for 7s: gains 50/70/90% attack speed and 20% life steal, and basic attacks deal 5% of the target\'s missing health as bonus damage.' }
    ],
    items: ['potion', 'fangs', 'sneakers', 'stormbow', 'belt', 'bulwark']
  },
  {
    id: 'astro', badge: ['#7df9ff', '#2a3a8f'], title: 'THE ASTRONAUT', name: 'Nova', role: 'Mage', difficulty: 2, melee: false,
    colors: ['#f8f9fa', '#ff8c42'], chromas: [['#c77dff', '#00e5ff'], ['#ffd23f', '#343a40']],
    lore: 'Nova went to space once, ate one astronaut ice cream and came back with very strong opinions about gravity.',
    stats: { hp: [520, 86], mana: [400, 50], ad: [52, 3.0], armor: [22, 4.0], mr: [30, 1.4], as: [0.62, 0.018], range: 6.2, ms: 7.82, hpRegen: [1.6, 0.12], manaRegen: [2.4, 0.16] },
    proj: { color: '#7df9ff', size: 0.35, speed: 26 }, hitColor: '#7df9ff',
    abilities: [
      { key: 'Q', name: 'Plasma Bolt', icon: 'laser', kind: 'bolt', type: 'skillshot', count: 1, range: 11, width: 0.8, speed: 32, shape: 'laser', splash: 1.5, color: '#7df9ff', dmg: [80, 125, 170, 215, 260], ap: 0.8, dtype: 'magic', cd: [6, 5.5, 5, 4.5, 4], cost: [45, 50, 55, 60, 65], ai: 'nuke',
        text: 'Fires a plasma bolt: {dmg} magic damage to the first enemy hit. Only enemies right next to it also get hit (60%).' },
      { key: 'W', name: 'Meteor Strike', icon: 'meteor', kind: 'blast', type: 'ground', range: 10, radius: 5.5, delay: 0.7, drop: 'meteor', slow: 0.3, color: '#ff8c42', dmg: [60, 95, 130, 165, 200], ap: 0.6, dtype: 'magic', cd: [11, 10.5, 10, 9.5, 9], cost: [65, 65, 65, 65, 65], ai: 'aoe',
        text: 'BIG area: calls down a meteor that crashes after 0.7s, dealing {dmg} magic damage to all enemies in a wide circle and slowing them by 30%.' },
      { key: 'E', name: 'Jetpack', icon: 'jetpack', kind: 'sprint', type: 'self', innate: true, ms: [0.4, 0.46, 0.52, 0.58, 0.64], dur: 3, color: '#ff8c42', cd: [14, 13, 12, 11, 10], cost: [0, 0, 0, 0, 0], ai: 'sprint',
        text: 'Fires up the jetpack. Gains {ms} movement speed for 3s and runs through units. Free, and it ranks up by itself as you level.' },
      { key: 'R', name: 'Satellite Orbit', icon: 'planet', kind: 'satellite', type: 'self', radius: 3.4, dur: 5, color: '#7df9ff', dmg: [35, 50, 65, 80, 95], ap: 0.25, dtype: 'magic', cd: [16, 15, 14, 13, 12], cost: [70, 70, 70, 70, 70], ai: 'aoe',
        text: 'Three little satellites orbit Nova for 5s. Each one deals {dmg} magic damage to enemies it touches (the same enemy can be hit every 0.5s).' },
      { key: 'T', name: 'Black Hole', icon: 'blackhole', type: 'ground', range: 10, radius: 6.5, dmg: [150, 250, 350], ap: 0.6, tick: [30, 50, 70], dtype: 'magic', cd: [120, 100, 80], cost: [100, 100, 100], ai: 'ult',
        text: 'Opens a black hole for 3s that pulls enemies toward its center and deals 30/50/70 magic damage four times a second, then collapses for {dmg} magic damage.' }
    ],
    items: ['potion', 'megawand', 'slippers', 'cosmichat', 'cape', 'staff']
  },
  {
    id: 'hotdog', badge: ['#ffb15c', '#a3361f'], title: 'THE HOT DOG', name: 'Frank', role: 'Marksman', difficulty: 2, melee: false,
    colors: ['#e07a3f', '#ffd23f'], chromas: [['#ff4d6d', '#7bd389'], ['#8d5524', '#f8f9fa']],
    lore: 'Frank is a hot dog. Frank is also a bean. Frank does not want to talk about it.',
    stats: { hp: [540, 88], mana: [320, 38], ad: [60, 3.2], armor: [24, 4.0], mr: [30, 1.4], as: [0.66, 0.03], range: 6.5, ms: 7.82, hpRegen: [1.7, 0.14], manaRegen: [1.6, 0.1] },
    proj: { color: '#e53935', size: 0.32, speed: 28 }, hitColor: '#e53935',
    abilities: [
      { key: 'Q', name: 'Ketchup Cannon', icon: 'ketchup', kind: 'bolt', type: 'skillshot', count: 1, range: 12, width: 1.0, speed: 26, shape: 'blob', splash: 2.6, splashPct: 0.75, splat: '#e53935', color: '#e53935', dmg: [75, 115, 155, 195, 235], ad: 0.9, dtype: 'phys', cd: [7, 6.5, 6, 5.5, 5], cost: [45, 45, 45, 45, 45], ai: 'nuke',
        text: 'STRONG Q: fires a huge ketchup blob with extra long range. {dmg} physical damage to the first enemy hit, and it splashes wide: enemies near it take 75%.' },
      { key: 'W', name: 'Mustard Bomb', icon: 'mustard', kind: 'blast', type: 'ground', range: 8, radius: 3.6, delay: 0.45, drop: 'bottle', slow: 0.45, splat: '#ffcc00', color: '#ffd23f', dmg: [60, 95, 130, 165, 200], ad: 0.5, ap: 0.3, dtype: 'magic', cd: [10, 9.5, 9, 8.5, 8], cost: [50, 50, 50, 50, 50], ai: 'aoe',
        text: 'Small area: lobs a mustard bottle that bursts for {dmg} magic damage and a 45% slow for 1.5s.' },
      { key: 'E', name: 'Sizzle Sprint', icon: 'flame', kind: 'sprint', type: 'self', innate: true, ms: [0.4, 0.46, 0.52, 0.58, 0.64], dur: 3, color: '#ff8c42', cd: [14, 13, 12, 11, 10], cost: [0, 0, 0, 0, 0], ai: 'sprint',
        text: 'Runs so fast it leaves a trail of flames. Gains {ms} movement speed for 3s and runs through units. Free, and it ranks up by itself as you level.' },
      { key: 'R', name: 'Grill Turret', icon: 'grill', kind: 'grill', type: 'ground', range: 7, dur: 6, color: '#ff8c42', dmg: [30, 45, 60, 75, 90], ad: 0.3, dtype: 'phys', cd: [18, 17, 16, 15, 14], cost: [70, 70, 70, 70, 70], ai: 'trap',
        text: 'Sets up a hot grill turret for 6s. It shoots a sizzling sausage at the nearest enemy every 0.6s for {dmg} physical damage.' },
      { key: 'T', name: 'Hot Dog Rain', icon: 'hotdograin', type: 'ground', range: 12, radius: 5, dmg: [70, 110, 150], ad: 0.4, dtype: 'phys', cd: [100, 85, 70], cost: [100, 100, 100], ai: 'ult',
        text: 'Calls down 8 giant hot dogs over 2s. Each one deals {dmg} physical damage where it lands and slows by 30%.' }
    ],
    items: ['potion', 'stormbow', 'sneakers', 'blade', 'fangs', 'cape']
  },
  {
    id: 'pigeon', badge: ['#c3ccd6', '#3d4a5c'], title: 'THE PIGEON', name: 'Coo', role: 'Marksman', difficulty: 2, melee: false,
    colors: ['#9aa5b1', '#7bd389'], chromas: [['#f8f9fa', '#ff6fd8'], ['#5c4033', '#ffd23f']],
    lore: 'Coo has stolen 4,312 sandwiches. Coo regrets none of them.',
    stats: { hp: [530, 86], mana: [310, 38], ad: [58, 3.1], armor: [23, 3.9], mr: [30, 1.4], as: [0.68, 0.032], range: 7, ms: 7.93, hpRegen: [1.7, 0.14], manaRegen: [1.6, 0.1] },
    proj: { color: '#dfe7ef', size: 0.28, speed: 30, feather: true }, hitColor: '#dfe7ef',
    abilities: [
      { key: 'Q', name: 'Bouncing Feather', icon: 'feathers', kind: 'bounce', type: 'unit', range: 8, bounces: 2, bounceR: 5, color: '#dfe7ef', dmg: [80, 125, 170, 215, 260], ad: 0.9, dtype: 'phys', cd: [7, 6.5, 6, 5.5, 5], cost: [40, 40, 40, 40, 40], ai: 'nuke',
        text: 'STRONG Q: flings a sharp feather at an enemy for {dmg} physical damage. If more enemies are close by, it bounces to 2 more of them (65% damage per bounce).' },
      { key: 'W', name: 'Wing Gust', icon: 'wing', kind: 'cone', type: 'ground', range: 6, radius: 6, arc: 1.4, knock: 2.5, color: '#dfe7ef', dmg: [60, 95, 130, 165, 200], ad: 0.6, dtype: 'phys', cd: [10, 9.5, 9, 8.5, 8], cost: [50, 50, 50, 50, 50], ai: 'aoe',
        text: 'Cone: flaps a strong gust of wind in front of Coo, dealing {dmg} physical damage and pushing enemies back.' },
      { key: 'E', name: 'Tailwind', icon: 'wingboot', kind: 'sprint', type: 'self', innate: true, ms: [0.4, 0.46, 0.52, 0.58, 0.64], dur: 3, color: '#dfe7ef', cd: [14, 13, 12, 11, 10], cost: [0, 0, 0, 0, 0], ai: 'sprint',
        text: 'Rides the wind. Gains {ms} movement speed for 3s and runs through units. Free, and it ranks up by itself as you level.' },
      { key: 'R', name: 'Pigeon Flock', icon: 'bird', kind: 'flock', type: 'self', radius: 9, count: 6, color: '#9aa5b1', dmg: [40, 60, 80, 100, 120], ad: 0.35, dtype: 'phys', cd: [15, 14, 13, 12, 11], cost: [60, 60, 60, 60, 60], ai: 'aoe',
        text: 'Whistles for 6 pigeon friends that fly at enemies nearby. Each one deals {dmg} physical damage and slows by 20%. Several can hit the same enemy.' },
      { key: 'T', name: 'Sky Dive', icon: 'comet', type: 'ground', range: 14, radius: 4.5, dmg: [200, 325, 450], ad: 0.8, dtype: 'phys', cd: [90, 75, 60], cost: [100, 100, 100], ai: 'ult',
        text: 'Flies up out of reach and dive-bombs a spot, dealing {dmg} physical damage and slowing enemies by 50% for 2s.' }
    ],
    items: ['potion', 'stormbow', 'sneakers', 'blade', 'fangs', 'bulwark']
  },
  {
    id: 'banana', badge: ['#ffe680', '#b07a00'], title: 'THE BANANA', name: 'Peely', role: 'Support', difficulty: 2, melee: false,
    colors: ['#ffe14d', '#8d5524'], chromas: [['#7bd389', '#5c4033'], ['#ff8c42', '#3a86ff']],
    lore: 'Peely is very fast, very slippery and very, very proud of being a banana.',
    stats: { hp: [540, 88], mana: [380, 48], ad: [50, 2.8], armor: [26, 4.0], mr: [30, 1.4], as: [0.62, 0.02], range: 5.6, ms: 8.28, hpRegen: [1.8, 0.14], manaRegen: [2.2, 0.16] },
    proj: { color: '#ffe14d', size: 0.3, speed: 24 }, hitColor: '#ffe14d',
    abilities: [
      { key: 'Q', name: 'Banana Shot', icon: 'peel', kind: 'bolt', type: 'skillshot', count: 1, range: 9, width: 0.9, speed: 26, shape: 'banana', spin: 14, splash: 1.3, slow: 0.25, color: '#ffe14d', dmg: [75, 115, 155, 195, 235], ap: 0.7, dtype: 'magic', cd: [7, 6.5, 6, 5.5, 5], cost: [45, 45, 45, 45, 45], ai: 'nuke',
        text: 'Throws a spinning banana: {dmg} magic damage to the first enemy hit and a 25% slow. Only enemies right next to it also get hit (60%).' },
      { key: 'W', name: 'Banana Bomb', icon: 'bananabomb', kind: 'blast', type: 'ground', range: 9, radius: 5.5, delay: 0.6, drop: 'banana', stun: 0.5, color: '#ffe14d', dmg: [55, 90, 125, 160, 195], ap: 0.55, dtype: 'magic', cd: [12, 11.5, 11, 10.5, 10], cost: [60, 60, 60, 60, 60], ai: 'aoe',
        text: 'BIG area: throws a whole bunch of bananas that bursts over a wide circle: {dmg} magic damage and everyone slips (stunned 0.5s).' },
      { key: 'E', name: 'Slippery Sprint', icon: 'slide', kind: 'sprint', type: 'self', innate: true, ms: [0.4, 0.46, 0.52, 0.58, 0.64], dur: 3, color: '#ffe14d', cd: [14, 13, 12, 11, 10], cost: [0, 0, 0, 0, 0], ai: 'sprint',
        text: 'Slides around like only a banana can. Gains {ms} movement speed for 3s and runs through units. Free, and it ranks up by itself as you level.' },
      { key: 'R', name: 'Smoothie Fountain', icon: 'smoothie', kind: 'fountain', type: 'ground', range: 7, radius: 4.5, dur: 4, color: '#7bd389', heal: [25, 35, 45, 55, 65], ap: 0.12, cd: [18, 17, 16, 15, 14], cost: [70, 70, 70, 70, 70], ai: 'heal',
        text: 'Places a smoothie fountain for 4s. Allies inside heal {heal} every half second (8 times), and enemies inside are slowed by 25%.' },
      { key: 'T', name: 'Banana Split', icon: 'split', type: 'ground', range: 10, radius: 6, dmg: [150, 250, 350], ap: 0.5, dtype: 'magic', stun: [1.0, 1.25, 1.5], shield: [100, 150, 200], cd: [110, 95, 80], cost: [100, 100, 100], ai: 'ult',
        text: 'Throws a whole bunch of bananas: enemies in the area slip for 1-1.5s and take {dmg} magic damage. Allies there get a 100/150/200 shield and 30% movement speed.' }
    ],
    items: ['potion', 'staff', 'slippers', 'cape', 'cosmichat', 'bulwark']
  },
  {
    id: 'wizard', badge: ['#d39bff', '#3c0f6b'], title: 'THE MAGICIAN', name: 'Merlean', role: 'Mage', difficulty: 3, melee: false,
    colors: ['#5a189a', '#ffd23f'], chromas: [['#2ec4b6', '#f8f9fa'], ['#c62828', '#343a40']],
    lore: 'Merlean knows exactly one spell for everything. Most of them involve rabbits.',
    stats: { hp: [510, 84], mana: [420, 52], ad: [50, 3.0], armor: [21, 4.0], mr: [30, 1.4], as: [0.62, 0.018], range: 6, ms: 7.82, hpRegen: [1.5, 0.12], manaRegen: [2.5, 0.17] },
    proj: { color: '#c77dff', size: 0.34, speed: 25 }, hitColor: '#c77dff',
    abilities: [
      { key: 'Q', name: 'Magic Missiles', icon: 'stars3', kind: 'missiles', type: 'unit', range: 8, count: 3, splash: 1.0, color: '#c77dff', dmg: [45, 70, 95, 120, 145], ap: 0.4, dtype: 'magic', cd: [6, 5.5, 5, 4.5, 4], cost: [45, 50, 55, 60, 65], ai: 'nuke',
        text: 'STRONG Q: fires 3 homing magic missiles that never miss. Each deals {dmg} magic damage (2nd and 3rd missile deal 50%).' },
      { key: 'W', name: 'Arcane Circle', icon: 'runecircle', kind: 'blast', type: 'ground', range: 9, radius: 4.2, delay: 0.5, drop: 'rune', color: '#c77dff', dmg: [60, 95, 130, 165, 200], ap: 0.6, dtype: 'magic', cd: [10, 9.5, 9, 8.5, 8], cost: [60, 60, 60, 60, 60], ai: 'aoe',
        text: 'Medium area: draws a magic circle that explodes after 0.5s for {dmg} magic damage.' },
      { key: 'E', name: 'Haste Spell', icon: 'haste', kind: 'sprint', type: 'self', innate: true, ms: [0.4, 0.46, 0.52, 0.58, 0.64], dur: 3, color: '#c77dff', cd: [14, 13, 12, 11, 10], cost: [0, 0, 0, 0, 0], ai: 'sprint',
        text: 'Casts a speedy spell on itself. Gains {ms} movement speed for 3s and runs through units. Free, and it ranks up by itself as you level.' },
      { key: 'R', name: 'Chain Spell', icon: 'chain', kind: 'chain', type: 'unit', range: 8, bounces: 4, bounceR: 6, color: '#c77dff', dmg: [80, 120, 160, 200, 240], ap: 0.6, dtype: 'magic', cd: [14, 13, 12, 11, 10], cost: [70, 70, 70, 70, 70], ai: 'nuke',
        text: 'A crackling spell that jumps from enemy to enemy up to 5 times, dealing {dmg} magic damage to the first and 15% less to each next one.' },
      { key: 'T', name: 'Grand Finale', icon: 'firework', type: 'ground', range: 11, radius: 6.5, dmg: [250, 400, 550], ap: 0.9, dtype: 'magic', cd: [110, 95, 80], cost: [100, 100, 100], ai: 'ult',
        text: 'Draws a giant magic circle that explodes after 1s for {dmg} magic damage, stunning enemies for 1s.' }
    ],
    items: ['potion', 'megawand', 'slippers', 'cosmichat', 'staff', 'cape']
  },
  {
    id: 'robot', badge: ['#5ff2ff', '#0b5a6b'], title: 'THE ROBOT', name: 'B0-LT', role: 'Support', difficulty: 2, melee: false,
    colors: ['#adb5bd', '#00e5ff'], chromas: [['#ff8c42', '#343a40'], ['#ff6fd8', '#f8f9fa']],
    lore: 'B0-LT was built to make toast. B0-LT has decided it was built to protect its friends instead.',
    stats: { hp: [580, 94], mana: [360, 46], ad: [52, 2.9], armor: [30, 4.4], mr: [32, 1.8], as: [0.62, 0.02], range: 5.6, ms: 7.82, hpRegen: [2.0, 0.16], manaRegen: [2.0, 0.15] },
    proj: { color: '#00e5ff', size: 0.3, speed: 28 }, hitColor: '#00e5ff',
    abilities: [
      { key: 'Q', name: 'Laser Bolt', icon: 'eyebeam', kind: 'bolt', type: 'skillshot', count: 1, range: 10, width: 0.9, speed: 34, shape: 'laser', splash: 1.3, color: '#00e5ff', dmg: [75, 115, 155, 195, 235], ap: 0.7, dtype: 'magic', cd: [7, 6.5, 6, 5.5, 5], cost: [45, 45, 45, 45, 45], ai: 'nuke',
        text: 'Fires a laser bolt: {dmg} magic damage to the first enemy hit. Only enemies right next to it also get hit (60%).' },
      { key: 'W', name: 'Shock Pulse', icon: 'pulse', kind: 'nova', type: 'self', radius: 5.5, slow: 0.3, zap: true, color: '#00e5ff', dmg: [55, 90, 125, 160, 195], ap: 0.55, dtype: 'magic', cd: [10, 9.5, 9, 8.5, 8], cost: [60, 60, 60, 60, 60], ai: 'aoe',
        text: 'BIG area: releases an electric pulse that zaps all enemies in a wide circle for {dmg} magic damage and slows them by 30%.' },
      { key: 'E', name: 'Turbo Boost', icon: 'turbo', kind: 'sprint', type: 'self', innate: true, ms: [0.4, 0.46, 0.52, 0.58, 0.64], dur: 3, color: '#00e5ff', cd: [14, 13, 12, 11, 10], cost: [0, 0, 0, 0, 0], ai: 'sprint',
        text: 'Switches to turbo wheels. Gains {ms} movement speed for 3s and runs through units. Free, and it ranks up by itself as you level.' },
      { key: 'R', name: 'Magnet Pulse', icon: 'magnet', kind: 'magnet', type: 'self', radius: 7, stun: 0.6, color: '#e53935', dmg: [60, 95, 130, 165, 200], ap: 0.5, dtype: 'magic', cd: [16, 15, 14, 13, 12], cost: [70, 70, 70, 70, 70], ai: 'aoe',
        text: 'Switches on a giant magnet: all enemies nearby are yanked next to B0-LT, take {dmg} magic damage and are stunned for 0.6s.' },
      { key: 'T', name: 'Overdrive', icon: 'bolt', type: 'self', radius: 10, shield: [150, 250, 350], ap: 0.6, cd: [110, 95, 80], cost: [100, 100, 100], ai: 'ultbuff',
        text: 'Overclocks the whole team nearby for 5s: a 150/250/350 shield, 30% movement speed and 30% attack speed.' }
    ],
    items: ['potion', 'staff', 'treads', 'bulwark', 'cape', 'cosmichat']
  }
];
export const HERO = Object.fromEntries(HEROES.map(h => [h.id, h]));

// ---------- upgrades ----------
// Every rank after the first: +7% range and area, and 1 second shorter cooldown (Q, W, E, R; never below 2s).
// Ultimates (T) keep their own, bigger cooldown drops.
export const RANK_GROW = 0.07;
for (const h of HEROES) h.abilities.forEach((ab, i) => { if (i < 4) ab.cd = ab.cd.map((_, k) => Math.max(Math.min(2, ab.cd[0]), ab.cd[0] - k)); });
const SCALED = ['range', 'radius', 'splash', 'bounceR'];
// the ability as it is at a given rank (range/area grown); rank 1 or unlearned is the base data
export function abilityAt(ab, rank) {
  const r = Math.max(1, rank || 1);
  if (r === 1) return ab;
  const cache = ab._ranks || (ab._ranks = []);
  if (!cache[r]) {
    const o = Object.create(ab), k = 1 + RANK_GROW * (r - 1);
    for (const f of SCALED) if (ab[f]) o[f] = Math.round(ab[f] * k * 10) / 10;
    cache[r] = o;
  }
  return cache[r];
}

// ---------- items ----------
// stats: hp, mana, ad, ap, armor, mr, as (attack speed %), ms (flat), crit, cdr, lifesteal, hpRegen, magicPen, thorns, healPower
export const ITEMS = [
  { id: 'potion', name: 'Jelly Potion', icon: 'potion', cost: 50, consumable: true, stack: 5, stats: {}, text: 'Use (click or 1-6): restores 150 health over 10 seconds.', cat: ['hp'] },
  { id: 'sword', name: 'Rubber Sword', icon: 'sword', cost: 350, stats: { ad: 10 }, cat: ['ad'] },
  { id: 'wand', name: 'Wobbly Wand', icon: 'wand', cost: 400, stats: { ap: 20 }, cat: ['ap'] },
  { id: 'vest', name: 'Jelly Vest', icon: 'vest', cost: 300, stats: { armor: 15 }, cat: ['armor'] },
  { id: 'cloak', name: 'Fizzy Cloak', icon: 'cloak', cost: 400, stats: { mr: 20 }, cat: ['mr'] },
  { id: 'heart', name: 'Gummy Heart', icon: 'heart', cost: 400, stats: { hp: 150 }, cat: ['hp'] },
  { id: 'gloves', name: 'Sugar Gloves', icon: 'glove', cost: 300, stats: { as: 0.15 }, cat: ['as'] },
  { id: 'boots', name: 'Bouncy Boots', icon: 'boot', cost: 300, stats: { ms: 0.6 }, cat: ['ms'], boots: true },
  { id: 'clover', name: 'Lucky Clover', icon: 'clover', cost: 400, stats: { crit: 0.15 }, cat: ['crit'] },
  { id: 'mint', name: 'Mana Mint', icon: 'candy', cost: 350, stats: { mana: 250 }, cat: ['ap'] },
  { id: 'gem', name: 'Sprinkle Gem', icon: 'gem', cost: 350, stats: { cdr: 0.1 }, cat: ['ap', 'ad'] },
  { id: 'blade', name: 'Royal Toy Blade', icon: 'blade', cost: 2000, from: ['sword', 'sword', 'clover'], stats: { ad: 50, crit: 0.2 }, cat: ['ad', 'crit'] },
  { id: 'sneakers', name: 'Turbo Sneakers', icon: 'wingboot', cost: 900, from: ['boots', 'gloves'], stats: { ms: 1.1, as: 0.25 }, cat: ['ms', 'as'], boots: true },
  { id: 'treads', name: 'Tank Treads', icon: 'treads', cost: 900, from: ['boots', 'vest'], stats: { ms: 1.0, armor: 20 }, cat: ['ms', 'armor'], boots: true },
  { id: 'slippers', name: 'Wizard Slippers', icon: 'slipper', cost: 1000, from: ['boots', 'wand'], stats: { ms: 1.0, ap: 25, magicPen: 0.12 }, cat: ['ms', 'ap'], boots: true },
  { id: 'megawand', name: 'Mega Wand of Wobble', icon: 'orbwand', cost: 2050, from: ['wand', 'wand', 'mint'], stats: { ap: 85, mana: 300 }, cat: ['ap'] },
  { id: 'cosmichat', name: 'Cosmic Hat', icon: 'wizhat', cost: 1600, from: ['wand', 'gem'], stats: { ap: 60, cdr: 0.2 }, cat: ['ap'] },
  { id: 'bulwark', name: 'Bean Bulwark', icon: 'bulwark', cost: 1400, from: ['vest', 'heart'], stats: { armor: 45, hp: 300 }, cat: ['armor', 'hp'] },
  { id: 'cape', name: 'Bubble Cape', icon: 'bubble', cost: 1500, from: ['cloak', 'heart'], stats: { mr: 45, hp: 300 }, cat: ['mr', 'hp'] },
  { id: 'fangs', name: 'Vampire Fangs', icon: 'fangs', cost: 1400, from: ['sword', 'heart'], stats: { ad: 30, hp: 150, lifesteal: 0.15 }, cat: ['ad', 'hp'] },
  { id: 'stormbow', name: 'Storm Bow', icon: 'bow', cost: 1700, from: ['gloves', 'gloves', 'clover'], stats: { as: 0.45, crit: 0.25, ms: 0.3 }, cat: ['as', 'crit'] },
  { id: 'belt', name: 'Titan Belt', icon: 'belt', cost: 1600, from: ['heart', 'heart'], stats: { hp: 650, hpRegen: 3 }, cat: ['hp'] },
  { id: 'shell', name: 'Spike Shell', icon: 'spikeshell', cost: 1700, from: ['vest', 'vest', 'heart'], stats: { armor: 60, hp: 200, thorns: 0.2 }, cat: ['armor', 'hp'], text: 'Reflects 20% of basic attack damage taken as magic damage.' },
  { id: 'staff', name: 'Glitter Staff', icon: 'starstaff', cost: 1300, from: ['mint', 'gem'], stats: { ap: 35, cdr: 0.15, mana: 200, healPower: 0.15 }, cat: ['ap'], text: 'Heals and shields are 15% stronger.' },
  { id: 'knife', name: "Chef's Knife", icon: 'cleaver', cost: 1500, from: ['sword', 'gem'], stats: { ad: 40, cdr: 0.15 }, cat: ['ad'] }
];
export const ITEM = Object.fromEntries(ITEMS.map(i => [i.id, i]));
export const SHOP_CATS = [
  ['all', 'All'], ['ad', 'Attack Damage'], ['ap', 'Ability Power'], ['hp', 'Health'], ['armor', 'Armor'],
  ['mr', 'Magic Resist'], ['as', 'Attack Speed'], ['ms', 'Movement'], ['crit', 'Critical Strike']
];
export const STAT_NAME = { hp: 'Health', mana: 'Mana', ad: 'Attack Damage', ap: 'Ability Power', armor: 'Armor', mr: 'Magic Resist', as: 'Attack Speed', ms: 'Move Speed', crit: 'Critical Strike', cdr: 'Cooldown Reduction', lifesteal: 'Life Steal', hpRegen: 'Health Regen /s', magicPen: 'Magic Penetration', thorns: 'Thorns', healPower: 'Heal & Shield Power' };
export const PCT_STATS = new Set(['as', 'crit', 'cdr', 'lifesteal', 'magicPen', 'thorns', 'healPower']);
export function statText(k, v) { return PCT_STATS.has(k) ? '+' + Math.round(v * 100) + '% ' + STAT_NAME[k] : '+' + (k === 'ms' ? (v * 10).toFixed(0) : v) + ' ' + STAT_NAME[k]; }

// ---------- jungle ----------
export const MONSTERS = {
  chick: { name: 'Gummy Chick', hp: 260, ad: 14, armor: 6, mr: 0, as: 1, range: 1.6, gold: 14, xp: 24, radius: 0.6, size: 0.7, color: '#ff9ebb' },
  mama: { name: 'Mama Chick', hp: 700, ad: 30, armor: 12, mr: 6, as: 0.9, range: 1.9, gold: 40, xp: 60, radius: 0.9, size: 1.1, color: '#ff6fd8' },
  toad: { name: 'Wobble Toad', hp: 950, ad: 36, armor: 14, mr: 8, as: 0.8, range: 2, gold: 60, xp: 100, radius: 1.1, size: 1.3, color: '#7bd389' },
  toadlet: { name: 'Toadlet', hp: 360, ad: 18, armor: 6, mr: 0, as: 1, range: 1.6, gold: 20, xp: 35, radius: 0.7, size: 0.8, color: '#b8f35b' },
  crab: { name: 'Candy Crab', hp: 1050, ad: 38, armor: 18, mr: 8, as: 0.8, range: 2, gold: 64, xp: 105, radius: 1.1, size: 1.3, color: '#ff8c42' },
  crablet: { name: 'Crablet', hp: 380, ad: 18, armor: 8, mr: 0, as: 1, range: 1.6, gold: 22, xp: 36, radius: 0.7, size: 0.8, color: '#ffb703' },
  gumdrop: { name: 'Gumdrop Golem', hp: 1450, ad: 46, armor: 20, mr: 10, as: 0.7, range: 2.4, gold: 90, xp: 130, radius: 1.4, size: 1.6, color: '#8338ec' },
  yeti: { name: 'Brainfreeze Yeti', hp: 1750, ad: 50, armor: 22, mr: 18, as: 0.75, range: 2.6, gold: 100, xp: 150, radius: 1.5, size: 1.75, color: '#9fd8ff', buff: 'brainfreeze' },
  chili: { name: 'Chili Golem', hp: 1750, ad: 56, armor: 22, mr: 14, as: 0.75, range: 2.6, gold: 100, xp: 150, radius: 1.5, size: 1.75, color: '#e53935', buff: 'hotsauce' },
  dragon: { name: 'Sugar Dragon', hp: 3300, ad: 95, armor: 40, mr: 30, as: 0.6, range: 4.5, gold: 0, xp: 260, radius: 2.6, size: 2.6, color: '#ff6fd8', epic: 'dragon' },
  boss: { name: 'Mega Bean', hp: 8500, ad: 210, armor: 70, mr: 60, as: 0.5, range: 5, gold: 0, xp: 500, radius: 3.4, size: 3.4, color: '#ffd23f', epic: 'boss' }
};
export const DRAGON_KINDS = [
  { id: 'fire', name: 'Fire', color: '#ff7b00', text: '+8% attack damage and ability power' },
  { id: 'ocean', name: 'Ocean', color: '#2ec4b6', text: '+2 health regen and +1.5 mana regen per second' },
  { id: 'cloud', name: 'Cloud', color: '#dfe7ef', text: '+0.5 movement speed' },
  { id: 'mountain', name: 'Mountain', color: '#a1887f', text: '+10% armor and magic resist' }
];
export const BUFFS = {
  brainfreeze: { name: 'Brain Freeze', color: '#9fd8ff', text: '+15% cooldown reduction and +5 mana regen per second', dur: 90 },
  hotsauce: { name: 'Hot Sauce', color: '#e53935', text: 'Basic attacks burn and slow', dur: 90 },
  megabean: { name: 'Mega Bean Blessing', color: '#ffd23f', text: '+25 attack damage, +40 ability power, faster recall, stronger minions nearby', dur: 150 }
};

// ---------- minions and buildings ----------
export const MINIONS = {
  melee: { hp: 460, ad: 13, armor: 0, mr: 0, as: 0.9, range: 1.6, ms: 6.61, gold: 25, xp: 70, radius: 0.65, size: 0.85 },
  ranged: { hp: 300, ad: 22, armor: 0, mr: 0, as: 0.75, range: 6, ms: 6.61, gold: 18, xp: 38, radius: 0.6, size: 0.75 },
  siege: { hp: 920, ad: 40, armor: 20, mr: 20, as: 0.55, range: 7, ms: 6.37, gold: 66, xp: 90, radius: 1.0, size: 1.15, towerBonus: 2 }
};
export const TOWER = { hp: [1450, 1700, 1950, 1600], ad: 150, armor: 45, mr: 45, as: 0.85, range: 10, radius: 1.8 };
export const CORE = { hp: 3100, armor: 30, mr: 30, radius: 3.2 };
