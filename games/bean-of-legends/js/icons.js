// Bean of Legends icon set: hand-made vector icons (no emoji) for abilities, items, roles, buffs and the UI.
// icon(name, {badge: [c1, c2]}) returns an <svg> string; iconImage(name) gives an <img> for canvas drawing.
const O = '#1b1036', W = '#ffffff', Y = '#ffd23f', YD = '#f4a900';
const st = (f, w = 3) => `fill="${f}" stroke="${O}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
const C = (x, y, r, f, w) => `<circle cx="${x}" cy="${y}" r="${r}" ${st(f, w)}/>`;
const E = (x, y, rx, ry, f, r = 0, w) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" transform="rotate(${r} ${x} ${y})" ${st(f, w)}/>`;
const R = (x, y, w, h, r, f, sw) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ${st(f, sw)}/>`;
const P = (d, f, w) => `<path d="${d}" ${st(f, w)}/>`;
const PG = (pts, f, w) => `<polygon points="${pts}" ${st(f, w)}/>`;
const L = (d, c, w = 3, op = 1) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" opacity="${op}"/>`;
const OL = (d, c, w) => L(d, O, w + 4) + L(d, c, w);            // thick line with an outline
const G = (tf, inner) => `<g transform="${tf}">${inner}</g>`;
const rot = (deg, inner) => G(`rotate(${deg} 32 32)`, inner);
const blob = (cs, f) => cs.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r + 1.7}" fill="${O}"/>`).join('') + cs.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${f}"/>`).join('');
const starPts = (cx, cy, r1, r2, n = 5, a0 = -90) => { const p = []; for (let i = 0; i < n * 2; i++) { const a = (a0 + i * 180 / n) * Math.PI / 180, r = i % 2 ? r2 : r1; p.push((cx + Math.cos(a) * r).toFixed(1) + ',' + (cy + Math.sin(a) * r).toFixed(1)); } return p.join(' '); };
const STAR = (cx, cy, r1, r2, f, n = 5) => PG(starPts(cx, cy, r1, r2, n), f);
const shine = (x, y, rx, ry) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#fff" opacity=".55"/>`;
const swordShape = (blade = '#e9ecef', guard = Y, grip = '#8d5524') => PG('32,3 38,11 38,40 26,40 26,11', blade) + L('M32 10 L32 36', '#fff', 2, 0.7) + R(17, 38, 30, 7, 3.5, guard) + R(28.5, 45, 7, 11, 2.5, grip) + C(32, 59, 3.6, guard);
const shieldShape = (f, rim = W) => P('M32 5 L54 13 Q55 39 32 59 Q9 39 10 13 Z', f) + L('M32 13 L46 18 Q46 36 32 50 Q18 36 18 18 Z', rim, 2.5, 0.8);
const bootShape = (f) => P('M16 6 L34 6 L35 34 L50 38 Q59 41 58 50 L58 55 L15 55 Z', f) + R(13, 51, 47, 7, 3, '#f8f9fa') + L('M20 16 L30 16 M20 24 L30 24', '#fff', 2.5);
const featherShape = (f = '#f8f9fa') => P('M32 58 Q18 36 26 14 Q30 6 32 4 Q34 6 38 14 Q46 36 32 58 Z', f) + L('M32 56 L32 8', '#9aa5b1', 2.5) + L('M32 22 L24 18 M32 32 L23 27 M32 22 L40 18 M32 32 L41 27', '#ced4da', 2);
const heartShape = (f) => P('M32 57 Q7 40 7 23 Q7 9 20 9 Q28 9 32 18 Q36 9 44 9 Q57 9 57 23 Q57 40 32 57 Z', f) + shine(21, 19, 6, 4);

const GLYPHS = {
  // ---------- knight ----------
  smash: () => G('translate(0 -4)', PG('32,46 37,38 37,16 27,16 27,38', '#e9ecef') + R(17, 12, 30, 7, 3.5, Y) + R(28.5, 2, 7, 11, 2.5, '#8d5524')) + OL('M10 56 L20 48 M54 56 L44 48 M32 62 L32 52 M18 62 L24 54 M46 62 L40 54', Y, 3) + C(32, 50, 5, W),
  shieldup: () => shieldShape('#3a86ff') + PG('32,16 43,29 37,29 37,43 27,43 27,29 21,29', W),
  charge: () => PG('10,25 38,25 38,14 59,32 38,50 38,39 10,39', Y) + OL('M3 18 L14 18 M2 32 L8 32 M3 46 L14 46', W, 3),
  crown: () => PG('7,48 7,17 20,30 32,8 44,30 57,17 57,48', Y) + R(6, 45, 52, 10, 3, YD) + C(32, 38, 4.5, '#ff4d6d') + C(18, 38, 3.2, '#3a86ff') + C(46, 38, 3.2, '#7bd389') + shine(26, 26, 3, 6),
  // ---------- ninja ----------
  shuriken: () => rot(15, PG('32,2 39,25 62,32 39,39 32,62 25,39 2,32 25,25', '#cfd6de') + `<circle cx="32" cy="32" r="5.5" fill="${O}"/>` + L('M32 8 L35 26 M56 32 L38 35 M32 56 L29 38 M8 32 L26 29', '#fff', 2, 0.7)),
  smoke: () => blob([[19, 40, 12], [33, 28, 15], [46, 40, 12], [32, 47, 11]], '#c9c9d6') + `<circle cx="27" cy="25" r="5" fill="#fff" opacity=".6"/>` + blob([[50, 14, 5], [57, 22, 3.5]], '#e9ecef'),
  dash: () => PG('8,13 25,32 8,51 17,51 34,32 17,13', '#b06cff') + PG('28,13 45,32 28,51 37,51 54,32 37,13', W),
  clones: () => E(16, 36, 10, 15, '#5a189a') + E(48, 36, 10, 15, '#5a189a') + E(32, 32, 12, 19, '#7b2cbf') + C(27, 27, 3.4, W) + C(37, 27, 3.4, W) + `<circle cx="27.5" cy="27.5" r="1.6" fill="${O}"/><circle cx="37.5" cy="27.5" r="1.6" fill="${O}"/>` + R(20, 31, 24, 5, 2.5, '#ff4d6d'),
  // ---------- dino ----------
  tail: () => OL('M6 56 Q34 56 44 38 Q51 24 58 8', '#7bd389', 10) + PG('22,50 27,40 31,51', Y) + PG('35,44 42,36 43,47', Y) + PG('45,31 53,26 51,36', Y),
  roar: () => P('M6 20 Q26 10 40 24 L40 42 Q26 54 6 46 Z', '#7bd389') + PG('12,22 16,30 20,21', W) + PG('22,19 26,28 30,19', W) + PG('12,45 16,37 20,46', W) + PG('22,47 26,38 30,46', W) + OL('M47 20 Q53 32 47 44', W, 3.5) + OL('M54 13 Q63 32 54 51', W, 3.5),
  stomp: () => E(32, 38, 13, 15, '#7bd389') + E(17, 17, 5, 7.5, '#7bd389', -20) + E(32, 12, 5, 7.5, '#7bd389') + E(47, 17, 5, 7.5, '#7bd389', 20) + OL('M4 60 L14 52 L10 47 M60 60 L50 52 L54 47', Y, 3),
  dinohead: () => P('M6 44 Q6 16 30 14 L52 18 Q60 22 58 34 L56 44 Z', '#7bd389') + C(29, 26, 5, W) + `<circle cx="30" cy="26.5" r="2.4" fill="${O}"/>` + PG('34,44 37,51 40,44', W) + PG('42,44 45,51 48,44', W) + PG('26,44 29,51 32,44', W) + PG('16,14 20,4 26,14', Y) + PG('30,13 34,3 38,14', Y),
  // ---------- shark ----------
  jaws: () => P('M5 29 Q32 0 59 29 Z', '#4d9de0') + P('M5 35 Q32 64 59 35 Z', '#4d9de0') + [10, 19, 28, 37, 46].map(x => PG(`${x},29 ${x + 4},38 ${x + 8},29`, W)).join('') + [10, 19, 28, 37, 46].map(x => PG(`${x},35 ${x + 4},26 ${x + 8},35`, W)).join(''),
  wave: () => P('M3 50 Q8 18 34 14 Q56 12 60 30 Q48 21 39 29 Q31 39 43 45 Q52 49 61 45 L61 58 L3 58 Z', '#4d9de0') + L('M12 40 Q16 26 30 22', '#e6fbff', 3) + L('M40 32 Q44 38 52 38', '#e6fbff', 2.5),
  fin: () => P('M10 50 Q30 40 37 6 Q45 30 57 50 Z', '#4d9de0') + L('M30 24 Q36 30 34 42', '#9fd8ff', 3) + OL('M3 54 Q15 47 27 54 T51 54 T63 54', '#9fd8ff', 3.5),
  frenzy: () => rot(-38, R(29, 28, 6, 32, 3, '#e9ecef') + R(24, 6, 4, 18, 2, '#e9ecef') + R(30, 6, 4, 18, 2, '#e9ecef') + R(36, 6, 4, 18, 2, '#e9ecef') + R(23, 20, 18, 9, 4, '#e9ecef')) + rot(38, P('M30 4 Q44 9 39 34 L29 34 Z', '#e9ecef') + R(28.5, 33, 8, 26, 3.5, '#8d5524')) + C(52, 52, 7, '#ff4d6d'),
  // ---------- astronaut ----------
  laser: () => R(4, 26, 30, 15, 6, '#e9ecef') + R(10, 38, 9, 15, 3, '#ff8c42') + C(33, 33, 5, '#7df9ff') + OL('M40 33 L61 33', '#7df9ff', 7) + L('M44 24 L52 20 M44 42 L52 46', '#7df9ff', 2.5),
  planet: () => C(32, 32, 15, '#c77dff') + `<ellipse cx="32" cy="32" rx="29" ry="8" transform="rotate(-20 32 32)" fill="none" stroke="${O}" stroke-width="8"/><ellipse cx="32" cy="32" rx="29" ry="8" transform="rotate(-20 32 32)" fill="none" stroke="${Y}" stroke-width="4"/>` + shine(26, 25, 5, 3),
  sparkle: () => PG('32,3 37,27 61,32 37,37 32,61 27,37 3,32 27,27', '#7df9ff') + STAR(52, 11, 7, 3, Y, 4) + STAR(12, 52, 6, 2.5, W, 4) + `<circle cx="32" cy="32" r="4" fill="#fff"/>`,
  blackhole: () => C(32, 32, 27, '#240046') + L('M32 32 m-4 0 a4 4 0 1 1 8 0 a8 8 0 1 1 -16 0 a12 12 0 1 1 24 0 a16 16 0 1 1 -32 0 a20 20 0 1 1 40 0', '#c77dff', 3.2) + `<circle cx="32" cy="32" r="5" fill="#000"/>`,
  // ---------- hot dog ----------
  ketchup: () => P('M21 22 L41 22 L44 56 Q31 60 18 56 Z', '#e53935') + R(26, 12, 11, 11, 2, W) + PG('29,3 34,3 35,12 28,12', W) + R(22, 32, 19, 12, 2, W) + C(49, 10, 3.5, '#e53935') + C(55, 19, 2.8, '#e53935') + C(47, 24, 2.2, '#e53935'),
  mustard: () => blob([[32, 38, 16], [17, 32, 8], [47, 31, 9], [23, 52, 6], [44, 52, 7], [33, 18, 6]], Y) + `<ellipse cx="27" cy="33" rx="6" ry="4" fill="#fff" opacity=".6"/>`,
  flame: () => P('M32 3 Q47 21 47 36 Q47 57 32 59 Q17 57 17 38 Q17 27 26 19 Q26 32 32 34 Q35 20 32 3 Z', '#ff7b00') + P('M32 30 Q41 40 39 48 Q37 55 32 55 Q26 55 25 48 Q25 41 32 30 Z', Y, 2),
  hotdograin: () => rot(-22, R(10, 30, 46, 13, 6.5, '#f1c27d') + R(12, 26, 42, 11, 5.5, '#c0583a') + L('M16 31 L22 28 L28 33 L34 28 L40 33 L46 28 L50 31', Y, 3) + R(10, 34, 46, 10, 5, '#e6b26b')) + OL('M8 4 L16 14 M22 2 L28 10 M48 50 L56 60', W, 3),
  // ---------- pigeon ----------
  feathers: () => G('rotate(-32 32 58) translate(0 2) scale(.9)', featherShape()) + G('rotate(32 32 58) translate(0 2) scale(.9)', featherShape()) + featherShape(),
  bird: () => E(29, 39, 19, 13, '#9aa5b1') + C(44, 22, 10, '#9aa5b1') + PG('52,19 61,23 52,27', '#ffb703') + `<circle cx="46.5" cy="20" r="2.4" fill="${O}"/>` + P('M12 34 Q27 22 38 36 Q26 45 12 34 Z', '#c3ccd6') + L('M38 26 Q44 32 50 28', '#7b2cbf', 3) + OL('M24 52 L22 60 M34 52 L36 60', '#ffb703', 2.5),
  wing: () => P('M8 46 Q18 8 57 9 Q50 17 54 22 Q46 26 50 32 Q40 34 44 41 Q30 42 28 51 Z', '#dfe7ef') + L('M16 40 Q26 24 46 18', '#9aa5b1', 2.5) + L('M22 44 Q32 32 44 30', '#9aa5b1', 2.5),
  comet: () => OL('M30 30 L8 8', Y, 6) + OL('M36 26 L22 4', '#ff8c42', 4) + OL('M26 36 L4 22', '#ff8c42', 4) + C(40, 40, 13, '#dfe7ef') + shine(35, 35, 4, 3) + OL('M40 56 L40 62', W, 2.5),
  // ---------- banana ----------
  peel: () => E(19, 44, 7, 17, '#ffe14d', 42) + E(45, 44, 7, 17, '#ffe14d', -42) + E(32, 39, 8, 19, '#ffe14d') + R(29, 6, 6, 12, 2, '#8d5524') + `<ellipse cx="32" cy="40" rx="3" ry="9" fill="#fff6c7" opacity=".9"/>`,
  smoothie: () => PG('16,22 48,22 44,59 20,59', '#ff6fd8') + R(13, 17, 38, 7, 3.5, W) + OL('M36 17 L45 3', '#7df9ff', 4) + C(26, 40, 3, '#fff') + C(37, 48, 2.5, '#fff') + `<rect x="18" y="26" width="28" height="7" fill="#ffe14d" opacity=".9"/>`,
  slide: () => OL('M3 46 Q13 37 23 46 T43 46 T63 46', '#ffe14d', 6) + OL('M8 58 L24 58 M30 58 L42 58', W, 3) + P('M18 30 Q22 12 44 12 Q54 12 56 18 Q44 16 34 24 Q28 30 18 30 Z', '#ffe14d'),
  split: () => P('M7 33 L57 33 Q55 59 32 59 Q9 59 7 33 Z', '#9fd8ff') + C(22, 26, 9, '#ff9ebb') + C(40, 26, 9, '#fff6c7') + C(32, 18, 8, '#c77dff') + C(33, 7, 4.5, '#ff4d6d') + P('M6 34 Q20 44 30 36 Q20 40 6 34 Z', '#ffe14d', 2) + P('M58 34 Q44 44 34 36 Q44 40 58 34 Z', '#ffe14d', 2),
  // ---------- magician ----------
  stars3: () => STAR(32, 19, 15, 6.5, Y) + STAR(14, 46, 10, 4.5, '#c77dff') + STAR(50, 46, 10, 4.5, '#7df9ff'),
  bunny: () => E(22, 17, 6, 15, W, -12) + E(42, 17, 6, 15, W, 12) + `<ellipse cx="22" cy="18" rx="2.5" ry="9" transform="rotate(-12 22 18)" fill="#ff9ebb"/><ellipse cx="42" cy="18" rx="2.5" ry="9" transform="rotate(12 42 18)" fill="#ff9ebb"/>` + C(32, 42, 17, W) + `<circle cx="25" cy="40" r="2.6" fill="${O}"/><circle cx="39" cy="40" r="2.6" fill="${O}"/>` + PG('29,46 35,46 32,50', '#ff6fd8', 2),
  tophat: () => R(18, 13, 28, 31, 3, '#2b2d42') + E(32, 45, 25, 6.5, '#2b2d42') + R(18, 33, 28, 7, 0, '#c77dff', 2.5) + STAR(52, 12, 7, 3, Y, 4) + STAR(9, 24, 5, 2, W, 4) + STAR(55, 34, 4, 1.8, W, 4),
  firework: () => [0, 45, 90, 135, 180, 225, 270, 315].map((a, i) => { const r = a * Math.PI / 180, c = ['#ff4d6d', Y, '#7df9ff', '#c77dff'][i % 4]; return OL(`M${32 + Math.cos(r) * 8} ${32 + Math.sin(r) * 8} L${32 + Math.cos(r) * 24} ${32 + Math.sin(r) * 24}`, c, 3.5) + `<circle cx="${32 + Math.cos(r) * 28}" cy="${32 + Math.sin(r) * 28}" r="3.5" fill="${c}" stroke="${O}" stroke-width="2"/>`; }).join('') + C(32, 32, 6, Y),
  // ---------- robot ----------
  eyebeam: () => PG('30,27 62,17 62,47 30,37', '#7df9ff') + C(20, 32, 15, '#adb5bd') + C(20, 32, 7.5, '#00e5ff') + `<circle cx="18" cy="30" r="2.5" fill="#fff"/>`,
  hexshield: () => PG('32,4 56,18 56,46 32,60 8,46 8,18', '#00e5ff') + L('M32 14 L47 23 L47 41 L32 50 L17 41 L17 23 Z', '#fff', 2.5, 0.85) + shine(24, 20, 5, 3),
  magnet: () => OL('M18 12 L18 34 Q18 52 32 52 Q46 52 46 34 L46 12', '#e53935', 12) + R(10, 6, 16, 10, 2, '#dee2e6') + R(38, 6, 16, 10, 2, '#dee2e6') + L('M6 30 Q2 40 6 50 M58 30 Q62 40 58 50', '#7df9ff', 2.5),
  bolt: () => PG('37,2 13,36 29,36 22,62 51,24 34,24 43,2', Y) + L('M34 10 L25 30', '#fff', 2.5, 0.7),
  // ---------- new kit (Q / W / E / R) ----------
  swordstrike: () => G('translate(-5 5)', rot(40, swordShape())) + STAR(49, 14, 13, 5, W, 8) + STAR(49, 14, 7, 3, Y, 8),
  horseshoe: () => OL('M24 12 L24 32 Q24 54 40 54 Q56 54 56 32 L56 12', '#cfd6de', 10) + `<circle cx="27" cy="20" r="2" fill="${O}"/><circle cx="53" cy="20" r="2" fill="${O}"/><circle cx="29" cy="40" r="2" fill="${O}"/><circle cx="51" cy="40" r="2" fill="${O}"/>` + OL('M3 22 L13 22 M2 33 L10 33 M3 44 L13 44', Y, 3.5),
  shieldthrow: () => G('translate(28 26) scale(.55)', shieldShape('#3a86ff')) + OL('M10 50 Q4 14 38 8', W, 4) + PG('34,2 46,8 35,15', W) + OL('M8 30 L4 36 M14 22 L8 24', Y, 2.5),
  shuriken3: () => ['translate(1 1)', 'translate(30 6)', 'translate(14 31)'].map(t => G(t + ' scale(.5)', rot(15, PG('32,2 39,25 62,32 39,39 32,62 25,39 2,32 25,25', '#cfd6de') + `<circle cx="32" cy="32" r="6" fill="${O}"/>`))).join(''),
  spinslash: () => OL('M32 6 A26 26 0 1 1 6 32', '#c77dff', 6) + PG('2,26 6,40 14,30', '#c77dff') + OL('M32 18 A14 14 0 1 0 46 32', W, 4) + PG('50,28 44,40 40,30', W) + C(32, 32, 4.5, Y),
  shadowstrike: () => E(22, 38, 13, 18, '#3c096c') + C(17, 33, 2.6, W) + C(26, 33, 2.6, W) + rot(-35, G('translate(14 -6)', PG('32,6 38,14 38,40 26,40 26,14', '#e9ecef') + R(19, 38, 26, 6, 3, '#ff4d6d') + R(28.5, 44, 7, 12, 3, '#3c096c'))) + STAR(52, 14, 9, 3.5, '#c77dff', 6),
  rock: () => PG('12,40 16,20 32,10 50,16 57,34 46,52 24,55', '#a1887f') + L('M24 24 L34 32 L30 44 M40 22 L44 34', '#6d4c41', 2.5) + shine(26, 20, 6, 3) + OL('M2 50 L10 46 M4 58 L14 54', W, 2.5),
  fissure: () => R(3, 44, 58, 16, 5, '#8d6e63') + L('M6 52 L18 48 L24 54 L34 47 L44 53 L58 49', '#3e2723', 3) + PG('8,47 14,24 20,47', '#cfd6de') + PG('24,47 32,8 40,47', '#e9ecef') + PG('42,47 49,22 56,47', '#cfd6de') + shine(30, 26, 1.5, 6),
  dive: () => R(3, 36, 58, 24, 6, '#8d6e63') + L('M6 44 Q14 40 22 44 T38 44 T56 44', '#6d4c41', 3) + PG('18,38 34,6 46,38', '#4d9de0') + L('M34 12 L40 34', W, 2.5, 0.6) + C(10, 30, 3, '#a1887f') + C(54, 28, 3.5, '#a1887f') + C(50, 18, 2.2, '#a1887f'),
  meteor: () => OL('M4 4 L26 26 M14 2 L32 20 M2 16 L20 34', '#ff8c42', 6) + OL('M8 8 L24 24', Y, 3) + C(40, 40, 16, '#8d6e63') + C(35, 36, 4, '#6d4c41') + C(46, 46, 3, '#6d4c41') + C(45, 33, 2.4, '#6d4c41') + shine(34, 30, 4, 2.5),
  jetpack: () => P('M20 48 Q26 64 32 48 Z', '#ff8c42') + P('M38 48 Q44 64 50 48 Z', '#ff8c42') + P('M23 48 Q26 57 29 48 Z', Y) + P('M41 48 Q44 57 47 48 Z', Y) + R(14, 8, 16, 42, 7, '#cfd6de') + R(34, 8, 16, 42, 7, '#cfd6de') + R(12, 24, 40, 8, 3, '#ff8c42') + shine(19, 16, 2, 5) + shine(39, 16, 2, 5),
  grill: () => OL('M24 4 Q20 10 24 14 M36 4 Q32 10 36 14', '#ced4da', 2.5) + R(6, 18, 52, 8, 4, '#c0583a') + R(8, 28, 48, 18, 6, '#343a40') + L('M10 28 L54 28', '#adb5bd', 3) + OL('M16 46 L12 60 M48 46 L52 60', '#6c757d', 3) + P('M24 38 Q28 32 32 38 Q36 32 40 38', '#ff5a00', 2),
  bananabomb: () => P('M10 40 Q12 58 34 56 Q22 50 18 36 Z', '#ffe14d') + P('M20 36 Q26 56 46 50 Q32 46 28 32 Z', '#ffe14d') + P('M30 32 Q40 50 56 40 Q42 40 36 28 Z', '#ffe14d') + R(28, 22, 9, 10, 3, '#8d5524') + OL('M33 22 Q36 12 46 10', '#8d6e63', 3) + STAR(48, 9, 9, 3.5, '#ff8c42', 7) + STAR(48, 9, 5, 2, Y, 7),
  runecircle: () => C(32, 32, 27, '#3c096c') + `<circle cx="32" cy="32" r="20" fill="none" stroke="#c77dff" stroke-width="2.5"/>` + L('M32 13 L43 47 L14 26 L50 26 L21 47 Z', Y, 2.5) + C(32, 32, 3.5, W),
  haste: () => G('translate(6 6) scale(.82)', bootShape('#c77dff')) + STAR(50, 13, 10, 4, Y) + OL('M2 30 L12 30 M4 40 L12 40', W, 3) + STAR(14, 10, 5, 2, W, 4),
  chain: () => OL('M8 8 L34 18 L20 30 L46 40 L30 48 L56 58', '#c77dff', 6) + OL('M8 8 L34 18 L20 30 L46 40 L30 48 L56 58', W, 1.8) + C(8, 8, 6, Y) + C(20, 30, 4.5, Y) + C(46, 40, 4.5, Y) + C(56, 58, 5.5, Y),
  pulse: () => `<circle cx="32" cy="32" r="27" fill="none" stroke="${O}" stroke-width="7"/><circle cx="32" cy="32" r="27" fill="none" stroke="#00e5ff" stroke-width="3.5"/><circle cx="32" cy="32" r="18" fill="none" stroke="${O}" stroke-width="6"/><circle cx="32" cy="32" r="18" fill="none" stroke="#7df9ff" stroke-width="3"/>` + G('translate(16 16) scale(.5)', PG('37,2 13,36 29,36 22,62 51,24 34,24 43,2', Y)),
  turbo: () => OL('M2 22 L16 22 M4 32 L14 32 M2 42 L16 42', '#00e5ff', 3.5) + C(40, 32, 20, '#343a40') + C(40, 32, 10, '#cfd6de') + L('M40 22 L40 42 M30 32 L50 32 M33 25 L47 39 M47 25 L33 39', O, 2.5) + C(40, 32, 3.5, '#00e5ff'),
  // ---------- items ----------
  potion: () => P('M26 6 L38 6 L38 22 Q54 30 52 44 Q50 59 32 59 Q14 59 12 44 Q10 30 26 22 Z', '#ff6fd8') + R(24, 3, 16, 7, 2, '#8d5524') + `<path d="M15 42 Q32 36 49 42 Q48 55 32 56 Q16 55 15 42 Z" fill="#c2185b" opacity=".55"/>` + C(24, 36, 3, '#fff', 2) + shine(22, 30, 3, 5),
  sword: () => rot(45, swordShape()),
  wand: () => OL('M12 54 L40 26', '#8d5524', 6) + STAR(45, 19, 15, 6.5, Y) + STAR(16, 20, 5, 2, W, 4),
  vest: () => P('M18 8 L26 12 Q32 21 38 12 L46 8 L55 20 L48 27 L48 57 L16 57 L16 27 L9 20 Z', '#ff8c42') + L('M32 24 L32 56', '#fff', 2.5) + R(19, 38, 9, 8, 2, '#ffd23f', 2) + R(36, 38, 9, 8, 2, '#ffd23f', 2),
  cloak: () => P('M22 7 L42 7 L57 57 Q32 63 7 57 Z', '#2ec4b6') + P('M18 7 L46 7 L40 17 L24 17 Z', '#1b998b') + C(32, 13, 3.5, Y, 2),
  heart: () => heartShape('#ff4d6d'),
  glove: () => P('M18 57 L18 27 Q18 12 30 12 Q42 12 44 26 L46 31 Q54 27 56 35 Q56 41 48 45 L44 57 Z', '#ff9ebb') + R(15, 50, 32, 9, 3, '#ff6fd8') + L('M27 14 L27 32 M35 14 L35 32', '#e86a9a', 2),
  boot: () => bootShape('#3a86ff'),
  clover: () => OL('M32 40 Q36 52 48 59', '#2e7d32', 4) + blob([[22, 22, 10.5], [42, 22, 10.5], [22, 40, 10.5], [42, 40, 10.5]], '#7bd389') + `<circle cx="32" cy="31" r="4" fill="#2e7d32"/>`,
  candy: () => PG('20,32 5,21 5,43', '#7df9ff') + PG('44,32 59,21 59,43', '#7df9ff') + C(32, 32, 14, '#7df9ff') + L('M24 32 Q32 22 40 32 Q32 42 24 32', '#fff', 3),
  gem: () => PG('18,9 46,9 59,26 32,59 5,26', '#c77dff') + L('M5 26 L59 26 M18 9 L26 26 L32 59 L38 26 L46 9', '#fff', 2, 0.75),
  blade: () => rot(45, PG('32,1 39,10 39,40 25,40 25,10', '#f1f3f5') + L('M32 8 L32 36', '#c3ccd6', 2.5) + R(13, 38, 38, 8, 4, Y) + C(32, 42, 3.8, '#ff4d6d', 2) + R(28.5, 46, 7, 10, 2.5, '#5a189a') + C(32, 59, 4, Y)),
  wingboot: () => G('translate(4 0) scale(.92)', bootShape('#ff8c42')) + P('M14 22 Q2 18 4 8 Q10 14 18 12 Q8 6 12 2 Q20 8 22 18 Z', W, 2.5),
  treads: () => bootShape('#7bd389') + R(34, 32, 22, 12, 3, '#adb5bd') + C(40, 38, 2, O, 1) + C(50, 38, 2, O, 1),
  slipper: () => P('M5 48 Q7 36 22 36 L40 36 Q52 36 56 25 Q63 29 59 40 Q54 55 36 55 L12 55 Q5 55 5 48 Z', '#c77dff') + C(57, 22, 5, Y) + L('M14 44 L40 44', '#fff', 2),
  orbwand: () => OL('M10 56 L34 30', '#8d5524', 6) + C(42, 21, 14, '#c77dff') + shine(37, 16, 4, 3) + STAR(42, 21, 5, 2, W, 4),
  wizhat: () => PG('32,3 51,48 13,48', '#5a189a') + E(32, 49, 27, 7, '#5a189a') + R(16, 39, 32, 6, 0, Y, 2) + STAR(30, 22, 5, 2, Y, 5) + STAR(38, 32, 3.5, 1.5, W, 4),
  bulwark: () => shieldShape('#cfd6de', '#ffd23f') + E(32, 30, 9, 12, '#ff6fd8') + `<circle cx="28.5" cy="27" r="2.2" fill="${O}"/><circle cx="35.5" cy="27" r="2.2" fill="${O}"/>`,
  bubble: () => `<circle cx="32" cy="30" r="24" fill="#9fd8ff" fill-opacity=".55" stroke="${O}" stroke-width="3"/>` + shine(23, 20, 7, 4) + C(54, 52, 5, '#9fd8ff', 2) + C(10, 54, 3.5, '#9fd8ff', 2),
  fangs: () => P('M8 10 Q32 20 56 10 L56 18 Q32 28 8 18 Z', '#ff6b8b') + PG('15,16 29,19 21,50', W) + PG('35,19 49,16 43,50', W) + C(21, 57, 3.5, '#e53935', 2),
  bow: () => OL('M22 5 Q56 32 22 59', '#8d5524', 5) + L('M22 5 L22 59', '#fff', 2) + OL('M6 32 L52 32', '#e9ecef', 3) + PG('58,32 48,26 48,38', '#e9ecef', 2.5) + PG('6,26 12,32 6,38', '#ff4d6d', 2) + PG('46,8 38,20 44,20 40,30 50,16 44,16 48,8', Y, 2),
  belt: () => R(3, 23, 58, 18, 5, '#8d5524') + R(23, 18, 18, 28, 3, Y) + R(28, 24, 8, 16, 2, '#8d5524', 2) + C(12, 32, 2.5, Y, 1.5) + C(52, 32, 2.5, Y, 1.5),
  spikeshell: () => P('M6 47 Q6 13 32 13 Q58 13 58 47 Z', '#7bd389') + [[14, 26], [24, 15], [40, 15], [50, 26]].map(([x, y]) => PG(`${x - 5},${y + 4} ${x},${y - 8} ${x + 5},${y + 4}`, W, 2.5)).join('') + L('M20 47 L24 30 L40 30 L44 47 M24 30 L32 20 L40 30', '#2e7d32', 2.5) + R(4, 45, 56, 8, 4, '#2e7d32'),
  starstaff: () => OL('M14 59 L38 24', '#8d5524', 6) + STAR(43, 17, 15, 6.5, Y) + STAR(14, 16, 5, 2, '#ff6fd8', 4) + STAR(56, 42, 5, 2, '#7df9ff', 4),
  cleaver: () => rot(-20, P('M8 14 L44 14 L44 42 Q28 46 8 38 Z', '#e9ecef') + `<circle cx="16" cy="22" r="3.5" fill="${O}"/>` + R(43, 22, 18, 9, 3.5, '#8d5524')),
  // ---------- roles / stats / buffs ----------
  shield: () => shieldShape('#7bd389'),
  swords: () => rot(-45, G('translate(0 2) scale(.95)', swordShape())) + rot(45, G('translate(0 2) scale(.95)', swordShape('#dee2e6', '#ff8c42'))),
  dagger: () => rot(40, PG('32,4 37,14 37,40 27,40 27,14', '#e9ecef') + R(20, 38, 24, 6, 3, '#c77dff') + R(29, 44, 6, 12, 2.5, '#2b2d42')),
  orb: () => C(32, 32, 21, '#c77dff') + shine(25, 24, 6, 4) + STAR(32, 33, 9, 3.5, W, 4),
  heartplus: () => heartShape('#7bd389') + PG('28,22 36,22 36,30 44,30 44,38 36,38 36,46 28,46 28,38 20,38 20,30 28,30', W, 2.5),
  bolt2: () => PG('37,2 13,36 29,36 22,62 51,24 34,24 43,2', '#7df9ff'),
  target: () => C(32, 32, 25, '#ff4d6d') + C(32, 32, 16, W) + C(32, 32, 7, '#ff4d6d') + OL('M32 1 L32 12 M32 52 L32 63 M1 32 L12 32 M52 32 L63 32', W, 3),
  hourglass: () => P('M15 5 L49 5 L49 12 L36 32 L49 52 L49 59 L15 59 L15 52 L28 32 L15 12 Z', '#9fd8ff') + PG('22,52 42,52 32,40', Y, 2) + PG('24,13 40,13 32,23', Y, 2),
  snowflake: () => [0, 60, 120].map(a => rot(a, OL('M32 4 L32 60 M32 14 L25 7 M32 14 L39 7 M32 50 L25 57 M32 50 L39 57', '#9fd8ff', 4))).join('') + C(32, 32, 5, W),
  chili: () => P('M14 20 Q22 14 30 22 Q44 34 54 56 Q36 50 22 38 Q12 28 14 20 Z', '#e53935') + OL('M18 18 Q14 8 22 4', '#2e7d32', 4) + shine(24, 26, 4, 2.5),
  snail: () => E(28, 48, 24, 7, '#ffb703') + C(28, 32, 16, '#ff8c42') + L('M28 32 m0 -4 a4 4 0 1 1 -4 4 a8 8 0 1 1 8 -8', '#fff', 2.5) + OL('M48 44 L54 30 M52 44 L60 32', '#ffb703', 2.5),
  stun: () => `<ellipse cx="32" cy="36" rx="27" ry="10" fill="none" stroke="${O}" stroke-width="7"/><ellipse cx="32" cy="36" rx="27" ry="10" fill="none" stroke="${Y}" stroke-width="3"/>` + STAR(12, 30, 9, 4, Y) + STAR(52, 30, 9, 4, '#7df9ff') + STAR(32, 46, 9, 4, '#ff6fd8'),
  swirl: () => L('M32 32 m-3 0 a3 3 0 1 1 6 0 a7 7 0 1 1 -14 0 a11 11 0 1 1 22 0 a15 15 0 1 1 -30 0 a19 19 0 1 1 38 0', '#9fd8ff', 4.5),
  check: () => OL('M12 34 L26 48 L52 16', '#7bd389', 7),
  // ---------- UI ----------
  coin: () => C(32, 32, 26, Y) + `<circle cx="32" cy="32" r="19" fill="none" stroke="${YD}" stroke-width="3"/>` + E(32, 32, 7, 11, YD, 25, 2.5) + shine(23, 21, 6, 3.5),
  play: () => PG('19,9 55,32 19,55', W),
  bean: () => R(17, 6, 30, 52, 15, '#ff6fd8') + C(26, 24, 5, W) + C(38, 24, 5, W) + `<circle cx="27" cy="25" r="2.5" fill="${O}"/><circle cx="39" cy="25" r="2.5" fill="${O}"/>` + L('M27 36 Q32 41 37 36', O, 2.5) + shine(24, 13, 4, 3),
  bag: () => L('M22 22 Q22 7 32 7 Q42 7 42 22', O, 8) + L('M22 22 Q22 7 32 7 Q42 7 42 22', Y, 4) + R(11, 21, 42, 36, 7, '#ff6fd8') + STAR(32, 39, 9, 4, Y),
  gear: () => { const p = []; for (let i = 0; i < 32; i++) { const a = i / 32 * Math.PI * 2, r = (i % 4 < 2) ? 28 : 21; p.push((32 + Math.cos(a) * r).toFixed(1) + ',' + (32 + Math.sin(a) * r).toFixed(1)); } return PG(p.join(' '), '#ced4da') + C(32, 32, 9, '#6c757d'); },
  question: () => C(32, 32, 26, '#3a86ff') + `<text x="32" y="45" text-anchor="middle" font-family="Lilita One, Arial Black, sans-serif" font-size="38" fill="#fff" stroke="${O}" stroke-width="2">?</text>`,
  home: () => PG('32,6 59,30 51,30 51,57 13,57 13,30 5,30', Y) + R(27, 38, 10, 19, 2, '#8d5524', 2.5) + R(17, 34, 8, 8, 1.5, '#9fd8ff', 2),
  trophy: () => L('M18 14 Q4 14 8 26 Q12 34 22 32 M46 14 Q60 14 56 26 Q52 34 42 32', O, 6) + L('M18 14 Q4 14 8 26 Q12 34 22 32 M46 14 Q60 14 56 26 Q52 34 42 32', Y, 3) + P('M17 6 L47 6 L45 30 Q41 41 32 41 Q23 41 19 30 Z', Y) + R(28, 40, 8, 10, 1, YD) + R(17, 49, 30, 9, 3, '#8d5524') + STAR(32, 21, 7, 3, W),
  skull: () => C(32, 27, 21, '#f8f9fa') + R(21, 40, 22, 14, 4, '#f8f9fa') + `<circle cx="24" cy="27" r="5.5" fill="${O}"/><circle cx="40" cy="27" r="5.5" fill="${O}"/>` + PG('32,34 28,40 36,40', O, 1) + L('M27 46 L27 53 M32 46 L32 53 M37 46 L37 53', O, 2),
  dragon: () => P('M7 40 Q7 20 25 18 L29 6 L35 17 L44 10 L44 21 Q58 25 58 37 Q58 50 44 50 L20 50 Q7 50 7 40 Z', '#ff6fd8') + C(37, 30, 5, W) + `<circle cx="38" cy="30" r="2.5" fill="${O}"/>` + PG('46,50 49,57 52,50', W, 2) + PG('36,50 39,57 42,50', W, 2) + `<circle cx="53" cy="38" r="1.8" fill="${O}"/>`,
  tower: () => R(17, 20, 30, 39, 2, '#efe3d0') + R(13, 12, 8, 10, 1, '#efe3d0') + R(28, 12, 8, 10, 1, '#efe3d0') + R(43, 12, 8, 10, 1, '#efe3d0') + R(13, 19, 38, 6, 1, '#d6c7ae') + P('M26 59 L26 46 Q32 38 38 46 L38 59 Z', '#8d5524', 2.5) + C(32, 31, 5, '#3a86ff', 2.5),
  clock: () => C(32, 32, 25, W) + L('M32 32 L32 16 M32 32 L43 39', O, 4),
  dice: () => R(8, 8, 48, 48, 11, W) + [[20, 20], [44, 20], [32, 32], [20, 44], [44, 44]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4.5" fill="${O}"/>`).join(''),
  lock: () => L('M22 28 L22 18 Q22 7 32 7 Q42 7 42 18 L42 28', O, 9) + L('M22 28 L22 18 Q22 7 32 7 Q42 7 42 18 L42 28', '#adb5bd', 5) + R(13, 27, 38, 30, 6, Y) + C(32, 39, 4, O, 1) + R(30.5, 40, 3, 9, 1, O, 1),
  back: () => PG('8,32 30,12 30,24 56,24 56,40 30,40 30,52', W),
  star: () => STAR(32, 33, 27, 11, Y),
  sparkles: () => STAR(32, 32, 20, 6, Y, 4) + STAR(52, 12, 8, 3, W, 4) + STAR(12, 50, 7, 3, W, 4),
  swords2: () => GLYPHS.swords()
};

let uid = 0;
export function icon(name, o = {}) {
  const fn = GLYPHS[name] || GLYPHS.star;
  const glyph = fn(o);
  let bg = '', inner = glyph;
  if (o.badge) {
    const id = 'bg' + (++uid), [c1, c2] = o.badge;
    bg = `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect x="1.5" y="1.5" width="61" height="61" rx="14" fill="url(#${id})" stroke="${O}" stroke-width="3"/><rect x="6" y="5" width="52" height="22" rx="10" fill="#fff" opacity=".16"/>`;
    inner = G('translate(32 32) scale(0.74) translate(-32 -32)', glyph);
  }
  const size = o.size ? ` width="${o.size}" height="${o.size}"` : '';
  return `<svg class="ic ${o.cls || ''}" viewBox="0 0 64 64"${size} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${bg}${inner}</svg>`;
}
const imgCache = new Map();
export function iconImage(name, o = {}) {
  const key = name + JSON.stringify(o);
  if (imgCache.has(key)) return imgCache.get(key);
  const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(icon(name, { ...o, size: 64 }));
  imgCache.set(key, img); return img;
}
export const ICON_NAMES = Object.keys(GLYPHS);
