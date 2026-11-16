// Outfits, gear, game modes and challenges.

// ---------- locker ----------
export const JACKETS = [
  { id: 'j-red', name: 'Summit Red', a: '#d7263d', b: '#1b1b1f' }, { id: 'j-teal', name: 'Glacier Teal', a: '#14b8a6', b: '#f8fafc' },
  { id: 'j-pink', name: 'Bubblegum', a: '#ff5fa2', b: '#ffd23f' }, { id: 'j-black', name: 'Midnight', a: '#23252b', b: '#ff8a1f' },
  { id: 'j-navy', name: 'Classic Navy', a: '#1d3a8a', b: '#ffffff' }, { id: 'j-lime', name: 'Lime Rush', a: '#a3e635', b: '#6d28d9' },
  { id: 'j-sky', name: 'Sky Blue', a: '#60a5fa', b: '#0f172a' }, { id: 'j-orange', name: 'Sunset', a: '#ff7a1a', b: '#ffe8cc' }
];
export const PANTS = [
  { id: 'p-black', name: 'Black', c: '#1f2026' }, { id: 'p-white', name: 'Snow White', c: '#eef2f7' }, { id: 'p-navy', name: 'Navy', c: '#1e2b5c' },
  { id: 'p-purple', name: 'Purple', c: '#6d28d9' }, { id: 'p-olive', name: 'Olive', c: '#5b6b2f' }, { id: 'p-red', name: 'Red', c: '#b91c1c' }, { id: 'p-grey', name: 'Grey', c: '#6b7280' }
];
export const HELMETS = [
  { id: 'h-white', name: 'White', c: '#f5f7fa' }, { id: 'h-black', name: 'Matte Black', c: '#1d1e22' }, { id: 'h-red', name: 'Red', c: '#e11d48' },
  { id: 'h-yellow', name: 'Yellow', c: '#facc15' }, { id: 'h-blue', name: 'Blue', c: '#2563eb' }, { id: 'h-mint', name: 'Mint', c: '#5eead4' }
];
export const GOGGLES = [
  { id: 'g-gold', name: 'Gold Mirror', c: '#f8b500', f: '#111111' }, { id: 'g-blue', name: 'Ice Blue', c: '#38bdf8', f: '#ffffff' },
  { id: 'g-pink', name: 'Rose', c: '#fb7185', f: '#1f2937' }, { id: 'g-green', name: 'Emerald', c: '#34d399', f: '#111111' }, { id: 'g-dark', name: 'Smoke', c: '#334155', f: '#f97316' }
];
export const GLOVES = [
  { id: 'gl-black', name: 'Black', c: '#18181b' }, { id: 'gl-white', name: 'White', c: '#f4f4f5' }, { id: 'gl-orange', name: 'Orange', c: '#f97316' },
  { id: 'gl-blue', name: 'Blue', c: '#3b82f6' }, { id: 'gl-pink', name: 'Pink', c: '#ec4899' }
];
export const BOOTS = [
  { id: 'b-black', name: 'Black', c: '#1c1c20' }, { id: 'b-white', name: 'White', c: '#e5e7eb' }, { id: 'b-brown', name: 'Brown', c: '#6b4226' }, { id: 'b-red', name: 'Red', c: '#b91c1c' }
];
export const BOARDS = [
  { id: 'sb-flame', name: 'Flame', a: '#111827', b: '#f97316', c: '#facc15', pat: 'flame' }, { id: 'sb-wave', name: 'Wave', a: '#0ea5e9', b: '#ffffff', c: '#0369a1', pat: 'wave' },
  { id: 'sb-stripe', name: 'Stripes', a: '#f8fafc', b: '#e11d48', c: '#1e293b', pat: 'stripe' }, { id: 'sb-forest', name: 'Pine', a: '#14532d', b: '#bbf7d0', c: '#f0fdf4', pat: 'pine' },
  { id: 'sb-candy', name: 'Candy', a: '#f472b6', b: '#fde047', c: '#a78bfa', pat: 'dots' }, { id: 'sb-night', name: 'Night', a: '#0f172a', b: '#a855f7', c: '#22d3ee', pat: 'stars' }
];
export const SKIS = [
  { id: 'sk-race', name: 'Racer', a: '#dc2626', b: '#ffffff', c: '#111827', pat: 'stripe' }, { id: 'sk-ice', name: 'Ice', a: '#e0f2fe', b: '#0284c7', c: '#0c4a6e', pat: 'wave' },
  { id: 'sk-gold', name: 'Gold', a: '#1f2937', b: '#fbbf24', c: '#fde68a', pat: 'stripe' }, { id: 'sk-lime', name: 'Lime', a: '#84cc16', b: '#1a2e05', c: '#ecfccb', pat: 'dots' },
  { id: 'sk-camo', name: 'Snow Camo', a: '#e5e7eb', b: '#94a3b8', c: '#475569', pat: 'camo' }, { id: 'sk-violet', name: 'Violet', a: '#7c3aed', b: '#f0abfc', c: '#2e1065', pat: 'stars' }
];
// ready made looks
export const PRESETS = [
  { id: 'pro', name: 'Pro Rider', o: { jacket: 'j-red', pants: 'p-black', helmet: 'h-black', goggles: 'g-gold', gloves: 'gl-black', boots: 'b-black', board: 'sb-flame', skis: 'sk-race' } },
  { id: 'colorful', name: 'Colorful', o: { jacket: 'j-pink', pants: 'p-purple', helmet: 'h-yellow', goggles: 'g-blue', gloves: 'gl-blue', boots: 'b-white', board: 'sb-candy', skis: 'sk-lime' } },
  { id: 'dark', name: 'Dark Mountain', o: { jacket: 'j-black', pants: 'p-grey', helmet: 'h-black', goggles: 'g-dark', gloves: 'gl-orange', boots: 'b-black', board: 'sb-night', skis: 'sk-gold' } },
  { id: 'classic', name: 'Classic Ski', o: { jacket: 'j-navy', pants: 'p-white', helmet: 'h-white', goggles: 'g-blue', gloves: 'gl-white', boots: 'b-red', board: 'sb-stripe', skis: 'sk-ice' } },
  { id: 'freestyle', name: 'Modern Freestyle', o: { jacket: 'j-lime', pants: 'p-olive', helmet: 'h-mint', goggles: 'g-pink', gloves: 'gl-pink', boots: 'b-brown', board: 'sb-wave', skis: 'sk-violet' } }
];
export const SLOTS = [
  { k: 'jacket', name: 'Jacket', list: JACKETS }, { k: 'pants', name: 'Pants', list: PANTS }, { k: 'helmet', name: 'Helmet', list: HELMETS },
  { k: 'goggles', name: 'Goggles', list: GOGGLES }, { k: 'gloves', name: 'Gloves', list: GLOVES }, { k: 'boots', name: 'Boots', list: BOOTS },
  { k: 'board', name: 'Snowboard', list: BOARDS }, { k: 'skis', name: 'Skis', list: SKIS }
];
export const find = (list, id) => list.find(i => i.id === id) || list[0];
export const DEFAULT_OUTFIT = { ...PRESETS[0].o };

// ---------- game modes ----------
export const MODES = [
  { id: 'free', name: 'Free Ride', desc: 'Ride anywhere on the mountain. No timer, no rules. Ride the lift back up whenever you like.', icon: 'mountain' },
  { id: 'tricks', name: 'Trick Challenge', desc: 'Three minutes in a jump area. Land the biggest tricks you can for the highest score.', icon: 'flip' },
  { id: 'time', name: 'Time Trial', desc: 'Race through the gates down to the finish line. Every gate counts.', icon: 'clock' },
  { id: 'mpfree', name: 'Multiplayer Free Ride', desc: 'Ride the same mountain together with your party. Race, jump and compare scores.', icon: 'party', mp: true }
];
export const TRICK_SPOTS = [
  { id: 'park', name: 'Freestyle Park', x: -10, z: -330, time: 180 },
  { id: 'peak', name: 'Sky Ramp and Peak Lips', x: -60, z: -820, time: 180 },
  { id: 'cliffs', name: 'Cliff Drops', x: 430, z: -620, time: 180 }
];

// ---------- challenges ----------
export const CHALLENGES = [
  { id: 'first-flip', name: 'Land a frontflip', goal: 1, stat: 'frontflips' },
  { id: 'backflip', name: 'Land a backflip', goal: 1, stat: 'backflips' },
  { id: 'diag', name: 'Land 5 diagonal flips', goal: 5, stat: 'diagonals' },
  { id: 'double', name: 'Land a double flip', goal: 1, stat: 'doubles' },
  { id: 'spin720', name: 'Land a 720 spin', goal: 1, stat: 'spin720' },
  { id: 'combo', name: 'Land a x3 combo', goal: 1, stat: 'combo3' },
  { id: 'jump5k', name: 'Score 5,000 in one jump', goal: 5000, stat: 'bestJump', max: true },
  { id: 'speed', name: 'Reach 90 km/h', goal: 90, stat: 'topSpeed', max: true },
  { id: 'air3', name: 'Stay in the air for 3 seconds', goal: 3, stat: 'bestAir', max: true },
  { id: 'explore', name: 'Visit all 5 areas', goal: 5, stat: 'areas' },
  { id: 'trial', name: 'Finish a Time Trial', goal: 1, stat: 'trials' },
  { id: 'trick20k', name: 'Score 20,000 in a Trick Challenge', goal: 20000, stat: 'bestTrickRun', max: true },
  { id: 'lift', name: 'Ride the chairlift', goal: 1, stat: 'lifts' },
  { id: 'switch', name: 'Try both snowboard and skis', goal: 2, stat: 'gear' }
];
