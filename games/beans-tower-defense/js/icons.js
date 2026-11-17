// Beans Tower Defense icon set: hand-made vector icons for the whole interface (no emoji anywhere).
// icon(name, {badge: [c1, c2], cls}) returns an <svg> string.
const O = '#2a1546', W = '#ffffff', Y = '#ffd23f', YD = '#f4a900';
const st = (f, w = 3) => `fill="${f}" stroke="${O}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
const C = (x, y, r, f, w) => `<circle cx="${x}" cy="${y}" r="${r}" ${st(f, w)}/>`;
const E = (x, y, rx, ry, f, r = 0, w) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" transform="rotate(${r} ${x} ${y})" ${st(f, w)}/>`;
const R = (x, y, w, h, r, f, sw) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ${st(f, sw)}/>`;
const P = (d, f, w) => `<path d="${d}" ${st(f, w)}/>`;
const PG = (pts, f, w) => `<polygon points="${pts}" ${st(f, w)}/>`;
const L = (d, c, w = 3, op = 1) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" opacity="${op}"/>`;
const OL = (d, c, w) => L(d, O, w + 4) + L(d, c, w);
const G = (tf, inner) => `<g transform="${tf}">${inner}</g>`;
const rot = (deg, inner) => G(`rotate(${deg} 32 32)`, inner);
const starPts = (cx, cy, r1, r2, n = 5, a0 = -90) => { const p = []; for (let i = 0; i < n * 2; i++) { const a = (a0 + i * 180 / n) * Math.PI / 180, r = i % 2 ? r2 : r1; p.push((cx + Math.cos(a) * r).toFixed(1) + ',' + (cy + Math.sin(a) * r).toFixed(1)); } return p.join(' '); };
const STAR = (cx, cy, r1, r2, f, n = 5) => PG(starPts(cx, cy, r1, r2, n), f);
const shine = (x, y, rx, ry) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#fff" opacity=".6"/>`;
const balloon = (x, y, s, f) => G(`translate(${x} ${y}) scale(${s})`, L('M0 22 Q-4 30 2 38', O, 2.5) + P('M0 -20 C14 -20 18 -6 14 6 C10 16 4 20 0 20 C-4 20 -10 16 -14 6 C-18 -6 -14 -20 0 -20 Z', f) + PG('-4,22 4,22 0,18', f, 2) + shine(-6, -9, 4, 6));
const dartShape = (f = '#ff8c42') => PG('6,58 12,52 46,18 50,22 16,56', '#cfd6de') + PG('46,10 56,8 54,18 48,24 40,16', f) + PG('2,52 12,62 14,52 8,48', '#3a86ff');
const bombShape = () => C(30, 38, 20, '#3d3d5c') + shine(22, 30, 6, 4) + R(25, 12, 10, 8, 2, '#6c757d') + OL('M30 12 Q32 4 40 4', '#cfa76b', 2.5) + STAR(44, 5, 7, 3, Y, 6);
const snowflake = (c = '#bfe8ff') => [0, 60, 120].map(a => rot(a, OL('M32 6 L32 58 M24 12 L32 20 L40 12 M24 52 L32 44 L40 52', c, 4))).join('') + C(32, 32, 5, W);
const beanShape = (f, x = 32, y = 34) => G(`translate(${x - 32} ${y - 34})`, R(16, 10, 32, 46, 16, f) + R(24, 52, 6, 8, 3, f) + R(34, 52, 6, 8, 3, f) + C(26, 26, 4.5, W, 2) + C(38, 26, 4.5, W, 2) + `<circle cx="27" cy="27" r="2" fill="${O}"/><circle cx="39" cy="27" r="2" fill="${O}"/>` + L('M27 36 Q32 41 37 36', O, 2.5) + shine(22, 18, 3, 6));

const GLYPHS = {
  // ---------- HUD ----------
  heart: () => P('M32 57 Q7 40 7 23 Q7 9 20 9 Q28 9 32 18 Q36 9 44 9 Q57 9 57 23 Q57 40 32 57 Z', '#ff4d6d') + shine(21, 19, 6, 4),
  coin: () => C(32, 32, 26, Y) + `<circle cx="32" cy="32" r="18" fill="none" stroke="${YD}" stroke-width="4"/>` + G('translate(32 32)', R(-4, -11, 8, 22, 3, '#fff3b0', 2.5)) + shine(22, 20, 5, 3),
  wave: () => balloon(22, 30, 0.95, '#ff4d5e') + balloon(42, 26, 0.85, '#3a8bff') + balloon(34, 40, 0.6, '#36c46b'),
  balloon: () => balloon(32, 28, 1.15, '#ff4d5e'),
  skull: () => P('M32 6 C48 6 56 16 56 28 C56 38 50 42 48 46 L48 54 L16 54 L16 46 C14 42 8 38 8 28 C8 16 16 6 32 6 Z', '#f1f3f5') + E(22, 30, 6, 7, O) + E(42, 30, 6, 7, O) + PG('32,36 28,44 36,44', O) + L('M24 54 L24 48 M32 54 L32 48 M40 54 L40 48', O, 2.5),
  // ---------- buttons ----------
  play: () => P('M18 9 L54 32 L18 55 Z', '#7bd389') + L('M24 20 L24 44', W, 3, 0.6),
  pause: () => R(13, 9, 14, 46, 4, '#ffd23f') + R(37, 9, 14, 46, 4, '#ffd23f'),
  fast: () => P('M5 12 L31 32 L5 52 Z', '#ffd23f') + P('M31 12 L57 32 L31 52 Z', '#ff8c42'),
  gear: () => rot(0, [0, 45, 90, 135].map(a => rot(a, R(27, 3, 10, 58, 3, '#adb5bd'))).join('') + C(32, 32, 20, '#adb5bd') + C(32, 32, 8, '#495057')),
  question: () => C(32, 32, 27, '#3a86ff') + OL('M23 24 Q23 13 32 13 Q41 13 41 22 Q41 29 32 32 L32 38', W, 5) + C(32, 49, 3.6, W, 2.5),
  home: () => PG('32,6 58,30 50,30 50,56 14,56 14,30 6,30', '#ff8c42') + R(26, 38, 12, 18, 2, '#8d5524') + R(18, 34, 8, 8, 1, '#bfe8ff', 2) + R(38, 34, 8, 8, 1, '#bfe8ff', 2),
  back: () => P('M28 10 L6 32 L28 54 L28 42 L56 42 L56 22 L28 22 Z', '#ffd23f'),
  close: () => OL('M14 14 L50 50 M50 14 L14 50', '#ff4d6d', 7),
  restart: () => OL('M50 30 A18 18 0 1 1 40 16', '#7bd389', 7) + PG('34,6 50,10 40,24', '#7bd389'),
  menu: () => R(8, 12, 48, 8, 4, W) + R(8, 28, 48, 8, 4, W) + R(8, 44, 48, 8, 4, W),
  auto: () => OL('M12 28 A20 20 0 0 1 48 18', '#7df9ff', 6) + PG('44,8 56,20 42,24', '#7df9ff') + OL('M52 36 A20 20 0 0 1 16 46', '#ffd23f', 6) + PG('20,56 8,44 22,40', '#ffd23f'),
  sound: () => PG('8,24 20,24 34,10 34,54 20,40 8,40', '#ffd23f') + OL('M42 22 Q48 32 42 42 M48 14 Q60 32 48 50', W, 3.5),
  mute: () => PG('8,24 20,24 34,10 34,54 20,40 8,40', '#adb5bd') + OL('M42 22 L58 42 M58 22 L42 42', '#ff4d6d', 4),
  music: () => R(18, 12, 6, 34, 2, W, 2.5) + R(42, 6, 6, 34, 2, W, 2.5) + PG('21,12 45,6 45,16 21,22', '#c77dff') + E(17, 46, 9, 7, '#c77dff', -20) + E(41, 40, 9, 7, '#c77dff', -20),
  graphics: () => R(6, 12, 52, 36, 6, '#3a86ff') + R(11, 17, 42, 26, 3, '#bfe8ff', 2) + PG('14,40 26,26 34,34 40,28 50,40', '#7bd389', 2) + C(44, 22, 4, Y, 2) + R(24, 50, 16, 6, 2, '#adb5bd'),
  trophy: () => P('M18 8 L46 8 L46 24 Q46 38 32 40 Q18 38 18 24 Z', Y) + OL('M18 14 Q6 14 8 24 Q10 30 18 30 M46 14 Q58 14 56 24 Q54 30 46 30', YD, 3) + R(28, 40, 8, 8, 1, YD) + R(18, 48, 28, 9, 3, '#8d5524') + shine(26, 16, 3, 6),
  medal: () => PG('20,4 30,4 34,24 24,24', '#3a86ff') + PG('44,4 34,4 30,24 40,24', '#ff4d6d') + C(32, 40, 18, Y) + STAR(32, 40, 10, 4.5, YD),
  lock: () => R(14, 28, 36, 28, 6, Y) + OL('M22 28 L22 20 Q22 8 32 8 Q42 8 42 20 L42 28', '#adb5bd', 4) + C(32, 41, 4, O),
  check: () => C(32, 32, 27, '#7bd389') + OL('M18 33 L28 43 L46 22', W, 6),
  // ---------- stats & upgrades ----------
  damage: () => STAR(32, 32, 28, 13, '#ff4d6d', 8) + STAR(32, 32, 14, 7, Y, 8),
  rate: () => PG('38,2 12,36 28,36 22,62 52,24 35,24 44,2', Y) + L('M35 10 L25 30', W, 2.5, 0.7),
  range: () => C(32, 32, 26, '#7bd389') + `<circle cx="32" cy="32" r="16" fill="#bff5c9" stroke="${O}" stroke-width="3"/>` + C(32, 32, 6, '#ff4d6d') + OL('M32 2 L32 14 M32 50 L32 62 M2 32 L14 32 M50 32 L62 32', W, 2.5),
  pierce: () => C(16, 40, 9, '#ff4d5e') + C(32, 32, 9, '#3a8bff') + C(48, 24, 9, '#36c46b') + OL('M4 50 L58 18', '#cfd6de', 4) + PG('52,12 62,14 56,22', '#cfd6de'),
  multi: () => G('translate(-10 4) scale(.6)', dartShape()) + G('translate(14 -4) scale(.6)', dartShape('#c77dff')) + G('translate(6 18) scale(.6)', dartShape('#7bd389')),
  blast: () => STAR(32, 34, 28, 14, '#ff8c42', 10) + STAR(32, 34, 17, 8, Y, 8) + C(32, 34, 6, W, 2),
  freeze: () => snowflake('#7df9ff'),
  slow: () => P('M10 44 Q10 22 30 22 Q46 22 46 36 Q46 44 38 44 Z', '#7bd389') + E(36, 34, 8, 8, '#ff8c42') + L('M36 30 Q40 34 36 38', O, 2) + PG('46,38 58,42 46,44', '#7bd389') + OL('M6 52 L58 52', '#adb5bd', 3),
  target: () => C(32, 32, 24, 'none') + `<circle cx="32" cy="32" r="24" fill="none" stroke="#ff4d6d" stroke-width="4"/><circle cx="32" cy="32" r="12" fill="none" stroke="#ff4d6d" stroke-width="4"/>` + OL('M32 2 L32 20 M32 44 L32 62 M2 32 L20 32 M44 32 L62 32', W, 3) + C(32, 32, 4, '#ff4d6d', 2),
  sell: () => C(28, 36, 22, Y) + `<circle cx="28" cy="36" r="15" fill="none" stroke="${YD}" stroke-width="3"/>` + G('translate(28 36)', R(-3.5, -9, 7, 18, 3, '#fff3b0', 2)) + OL('M48 26 L48 4 M40 12 L48 4 L56 12', '#7bd389', 4),
  upgrade: () => PG('32,4 58,30 44,30 44,58 20,58 20,30 6,30', '#7bd389') + L('M32 14 L32 50', W, 3, 0.5),
  max: () => STAR(32, 32, 28, 13, Y) + shine(26, 22, 4, 3),
  pop: () => STAR(32, 32, 28, 12, '#ff5c9a', 9) + STAR(32, 32, 15, 7, '#fff3b0', 7) + C(14, 12, 4, '#4cc9f0', 2) + C(52, 54, 3.5, '#5bd16b', 2),
  bean: () => beanShape('#ff8c42'),
  coinstack: () => E(32, 48, 22, 8, YD) + E(32, 40, 22, 8, Y) + E(32, 32, 22, 8, YD) + E(32, 24, 22, 8, Y) + shine(24, 22, 6, 2),
  // ---------- beans ----------
  dart: () => dartShape(),
  sniper: () => rot(-35, R(4, 26, 54, 9, 4, '#5a7d3a') + R(22, 16, 18, 9, 4, '#343a40') + C(42, 20, 4, '#7df9ff', 2) + R(6, 34, 12, 14, 3, '#8d5524')) + OL('M54 6 L60 6 M57 3 L57 9', '#ff4d6d', 2.5),
  boomerang: () => P('M10 50 Q14 14 50 8 Q58 8 56 16 Q24 22 22 54 Q18 60 10 50 Z', '#ffb703') + L('M16 48 Q20 20 48 14', '#ff8c42', 3) + shine(22, 30, 2, 8),
  bomb: () => bombShape(),
  ice: () => PG('32,4 46,22 40,60 24,60 18,22', '#bfe8ff') + L('M32 4 L32 60 M18 22 L46 22', '#7df9ff', 2.5) + shine(26, 18, 3, 7),
  ninja: () => rot(15, PG('32,2 39,25 62,32 39,39 32,62 25,39 2,32 25,25', '#cfd6de')) + `<circle cx="32" cy="32" r="6" fill="${O}"/>` + OL('M6 54 Q20 44 30 50', '#ff4d6d', 3),
  tazer: () => R(22, 30, 20, 28, 5, '#2b2d42') + R(22, 26, 20, 8, 3, Y) + R(25, 14, 4, 13, 2, '#cfd6de', 2) + R(35, 14, 4, 13, 2, '#cfd6de', 2) + PG('36,2 22,22 31,22 25,38 44,15 34,15 40,2', '#fff3b0', 2.5) + shine(27, 40, 3, 6),
  walkin: () => beanShape(W, 26, 36) + OL('M50 8 L50 30', Y, 5) + PG('42,26 58,26 50,38', Y),
  walkout: () => beanShape(W, 26, 36) + OL('M50 38 L50 16', Y, 5) + PG('42,18 58,18 50,6', Y),
  party: () => beanShape('#ffd23f', 22, 36) + beanShape(W, 42, 32),
  copy: () => R(18, 6, 34, 40, 6, '#bfe8ff') + R(10, 18, 34, 40, 6, W),
  user: () => beanShape(W, 32, 34),
  tack: () => [0, 45, 90, 135, 180, 225, 270, 315].map(a => rot(a, PG('32,2 36,18 28,18', '#e9ecef'))).join('') + C(32, 32, 13, '#e63946') + shine(27, 27, 4, 3),
  glue: () => R(20, 18, 24, 40, 8, '#f1faee') + R(20, 30, 24, 12, 2, '#2a9d8f') + PG('26,18 38,18 32,4', '#ff7b00') + E(14, 50, 8, 5, '#c5f277') + C(12, 38, 4, '#c5f277'),
  laser: () => R(8, 24, 34, 16, 5, '#e0e1dd') + R(18, 38, 10, 14, 3, '#adb5bd') + OL('M42 32 L60 32', '#ff006e', 5) + C(42, 32, 5, '#ff6fb5') + L('M44 26 L54 20 M44 38 L54 44', '#ff6fb5', 2.5),
  lightning: () => P('M14 24 Q14 12 26 14 Q30 4 42 8 Q54 8 52 20 Q60 24 54 30 L12 30 Q6 28 14 24 Z', '#dee2e6') + PG('34,30 22,46 30,46 24,62 44,40 35,40 40,30', Y),
  magic: () => PG('32,4 52,52 12,52', '#7b2cbf') + R(6, 50, 52, 8, 4, '#5a189a') + STAR(32, 30, 8, 3.5, Y) + STAR(22, 44, 4, 1.8, W) + STAR(42, 42, 4, 1.8, W),
  cannon: () => rot(-20, R(10, 22, 44, 18, 8, '#495057') + R(48, 20, 8, 22, 3, '#ffd23f')) + C(22, 46, 9, '#8d5524') + C(22, 46, 3, O, 2) + C(48, 14, 4, '#adb5bd', 2),
  sun: () => [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map(a => rot(a, PG('32,2 36,14 28,14', a % 60 ? '#ff8c42' : Y))).join('') + C(32, 32, 16, Y) + shine(26, 26, 5, 3),
  spike: () => R(8, 46, 48, 10, 4, '#6c757d') + PG('12,46 18,22 24,46', '#dfe6ee') + PG('22,46 30,12 38,46', '#dfe6ee') + PG('36,46 44,20 50,46', '#dfe6ee') + PG('26,30 32,24 34,32', '#e63946', 2),
  ghost: () => P('M14 56 L14 28 Q14 8 32 8 Q50 8 50 28 L50 56 L44 50 L38 56 L32 50 L26 56 L20 50 Z', '#f8f9fa') + E(25, 28, 4, 6, O) + E(39, 28, 4, 6, O) + E(32, 41, 4, 3, O) + shine(22, 16, 5, 3),
  meteor: () => OL('M8 8 L30 30', '#ff8c42', 7) + OL('M18 4 L34 22', '#ffd23f', 4) + OL('M4 20 L24 36', '#ffd23f', 4) + C(40, 40, 16, '#5a3a2a') + E(34, 36, 4, 3, '#ff8c42', 20, 2) + E(45, 46, 3, 2, '#ff8c42', -20, 2),
  clock: () => C(32, 34, 24, '#ffd23f') + C(32, 34, 18, '#fff8ee', 2) + R(29, 4, 6, 8, 2, '#ffd23f') + OL('M32 34 L32 22', O, 3) + OL('M32 34 L41 39', O, 3) + C(32, 34, 3, O, 1),
  farm: () => R(4, 40, 56, 18, 3, '#7a4a2a') + [10, 22, 34, 46].map(x => PG(`${x},44 ${x + 4},30 ${x + 8},44`, '#5cb85c', 2)).join('') + PG('40,26 52,14 64,26', '#6b2d1f', 2) + R(42, 26, 20, 16, 1, '#d62828', 2),
  candyfarm: () => R(4, 40, 56, 18, 3, '#7a4a2e') + [12, 26, 40].map(x => C(x, 32, 6, '#ff4d6d', 2) + L(`M${x} 38 L${x} 44`, W, 2.5)).join('') + PG('42,24 53,12 64,24', '#ffffff', 2) + R(44, 24, 18, 18, 1, '#ff7ac8', 2),
  goldfarm: () => R(4, 40, 56, 18, 3, '#6b4a2a') + [10, 22, 34].map(x => PG(`${x},44 ${x + 4},28 ${x + 8},44`, Y, 2)).join('') + PG('40,24 52,12 64,24', Y, 2) + R(42, 24, 20, 18, 1, '#fff1d6', 2) + STAR(16, 14, 7, 3, Y),
  select: () => R(6, 6, 30, 30, 6, 'none') + `<rect x="6" y="6" width="30" height="30" rx="6" fill="none" stroke="${W}" stroke-width="4" stroke-dasharray="6 5"/>` + C(42, 42, 14, '#5bd16b') + OL('M35 42 L41 48 L50 36', W, 3.5),
  zoomin: () => C(27, 27, 19, '#bfe8ff') + OL('M42 42 L58 58', '#adb5bd', 6) + OL('M18 27 L36 27 M27 18 L27 36', O, 2),
  zoomout: () => C(27, 27, 19, '#bfe8ff') + OL('M42 42 L58 58', '#adb5bd', 6) + OL('M18 27 L36 27', O, 2),
  shop: () => P('M10 22 L54 22 L50 58 L14 58 Z', '#ff5c9a') + OL('M22 26 L22 16 Q22 6 32 6 Q42 6 42 16 L42 26', '#ffd23f', 3.5) + STAR(32, 40, 9, 4, Y),
  team: () => R(4, 18, 20, 34, 10, '#ff8c42') + R(40, 18, 20, 34, 10, '#4cc9f0') + R(20, 12, 24, 42, 12, '#5bd16b') + C(28, 26, 3, W, 1.5) + C(36, 26, 3, W, 1.5),
  infinity: () => OL('M32 32 C24 18 8 18 8 32 C8 46 24 46 32 32 C40 18 56 18 56 32 C56 46 40 46 32 32 Z', '#b15cff', 6),
  beancoin: () => C(32, 32, 26, '#5bd16b') + `<circle cx="32" cy="32" r="18" fill="none" stroke="#2f9e44" stroke-width="4"/>` + G('translate(0 2)', R(25, 18, 14, 22, 7, '#fff8ee', 2.5)) + C(30, 26, 1.8, O, 0) + C(35, 26, 1.8, O, 0) + shine(22, 20, 5, 3),
  crown: () => PG('7,48 7,17 20,30 32,8 44,30 57,17 57,48', Y) + R(6, 45, 52, 10, 3, YD) + C(32, 38, 4.5, '#ff4d6d') + C(18, 38, 3.2, '#3a86ff') + C(46, 38, 3.2, '#7bd389'),
  b_steel: () => balloon(32, 28, 1.15, '#aab4c0') + L('M20 20 L44 20 M18 30 L46 30', '#6c757d', 2.5, 0.8),
  b_boss1: () => balloon(32, 26, 1.3, '#e05a2b') + L('M14 22 Q32 30 50 22', W, 3, 0.7),
  b_colossal: () => balloon(32, 26, 1.3, '#2b7a78') + L('M14 18 Q32 26 50 18 M14 28 Q32 36 50 28', '#7df9ff', 3, 0.8),
  b_king: () => balloon(32, 30, 1.2, '#d4a017') + G('translate(16 0) scale(.5)', PG('7,48 7,17 20,30 32,8 44,30 57,17 57,48', '#ffd23f') + R(6, 45, 52, 10, 3, '#f4a900')),
  // ---------- balloon kinds ----------
  b_red: () => balloon(32, 28, 1.15, '#ff4d5e'), b_blue: () => balloon(32, 28, 1.15, '#3a8bff'), b_green: () => balloon(32, 28, 1.15, '#36c46b'),
  b_yellow: () => balloon(32, 28, 1.15, '#ffd23f'), b_purple: () => balloon(32, 28, 1.15, '#9b5de5'),
  b_rainbow: () => `<defs><linearGradient id="rbw" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff4d5e"/><stop offset=".25" stop-color="#ffd23f"/><stop offset=".5" stop-color="#36c46b"/><stop offset=".75" stop-color="#3a8bff"/><stop offset="1" stop-color="#9b5de5"/></linearGradient></defs>` + balloon(32, 28, 1.15, 'url(#rbw)'),
  b_giant: () => balloon(32, 26, 1.3, '#5b4b8a') + STAR(32, 22, 8, 3.5, Y)
};

let uid = 0;
export function icon(name, o = {}) {
  const fn = GLYPHS[name] || GLYPHS.max;
  let bg = '', inner = fn(o);
  if (o.badge) {
    const id = 'bg' + (++uid), [c1, c2] = o.badge;
    bg = `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect x="1.5" y="1.5" width="61" height="61" rx="14" fill="url(#${id})" stroke="${O}" stroke-width="3"/><rect x="6" y="5" width="52" height="20" rx="9" fill="#fff" opacity=".18"/>`;
    inner = G('translate(32 32) scale(0.72) translate(-32 -32)', inner);
  }
  return `<svg class="ic ${o.cls || ''}" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${bg}${inner}</svg>`;
}
export const ICON_NAMES = Object.keys(GLYPHS);
// fill every <i data-ic="name"> placeholder in the page
export function fillIcons(root = document) { root.querySelectorAll('i[data-ic]').forEach(el => { if (!el.firstChild) el.innerHTML = icon(el.dataset.ic, el.dataset.badge ? { badge: el.dataset.badge.split(',') } : {}); }); }
