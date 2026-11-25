// The STEEP mountain. One big peak with a ski resort on its south face:
//  - START at the top (a flat platform with the start gate)
//  - THE WALL: the steep black run straight down the face, with a mogul field half way
//  - PANORAMA: a wide blue run that swings across the mountain
//  - GREEN MEADOW: a gentle beginner run on the lower mountain
//  - STEEP PARK: kickers from small to extra large, rails and boxes, and a halfpipe at the bottom
//  - THE CLIFFS (west face): natural cliff drops; POWDER BOWL (east): deep untouched snow;
//    PINE GLADES (lower west): skiing between the trees
//  - STEEP BASE: the village at the bottom with the lifts
// Everything (riding, landing, the camera, trees, the map) asks terrain(), so what you see is what you ride.
// One unit is one metre, y is up, the runs go south (+z).
import { makeNoise, fbm } from './noise.js';
import { clamp, smooth, lerp, rng } from './math.js';

const N1 = makeNoise(7), N2 = makeNoise(31), N3 = makeNoise(77), N4 = makeNoise(123), N5 = makeNoise(555);

export const BOUNDS = { x: 2700, z0: -2450, z1: 2600 };

export const PEAKS = [
  { id: 'steep', name: 'Steep Peak', x: 0, z: -2000, h: 2650, r: 4300 },
  { id: 'raven', name: 'Raven Shoulder', x: -1750, z: -1300, h: 2050, r: 2600 },
  { id: 'glacier', name: 'Glacier Shoulder', x: 1850, z: -1500, h: 2200, r: 2800 },
  // the giants all round (scenery)
  { id: 'nord', name: 'Nordwand', x: -1600, z: -4700, h: 3100, r: 3400 }, { id: 'titan', name: 'Titan', x: 1900, z: -5100, h: 3300, r: 3600 },
  { id: 'fang', name: 'Ice Fang', x: -4300, z: -3100, h: 2800, r: 3000 }, { id: 'thunder', name: 'Thunder Horn', x: 4500, z: -2900, h: 2900, r: 3100 },
  { id: 'ghost', name: 'Ghost Ridge', x: -4400, z: 900, h: 2300, r: 2800 }, { id: 'lynx', name: 'Lynx Ridge', x: 4500, z: 700, h: 2400, r: 2900 },
  { id: 'ember', name: 'Ember Peak', x: -3700, z: 4400, h: 1900, r: 2600 }, { id: 'moon', name: 'Moon Peak', x: 3800, z: 4500, h: 2000, r: 2600 }
];
for (const p of PEAKS) p.r2 = p.r * p.r;

function ridged(x, z, oct) {
  let s = 0, a = 1, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { const q = N1(x * f, z * f), v = 1 - Math.sqrt(q * q + 0.012); s += a * v * v; n += a; a *= 0.4; f *= 2.0; }
  return s / n;
}
// the mountains without the small stuff
function massif(x, z) {
  const wx = x + 300 * N4(x / 2200, z / 2200), wz = z + 300 * N4(z / 2200 + 7.3, x / 2200);
  let acc = 1;
  for (let i = 0; i < PEAKS.length; i++) {
    const p = PEAKS[i], dx = wx - p.x, dz = wz - p.z, d2 = dx * dx + dz * dz;
    if (d2 >= p.r2) continue;
    const t = 1 - Math.sqrt(d2) / p.r;
    acc += Math.exp(p.h * t * Math.sqrt(Math.sqrt(t)) / 240);
  }
  let h = 240 * Math.log(acc);
  // far outside the resort: a wall of giant mountains all round the horizon
  const R = Math.max(Math.abs(x) * 1.1, z < 0 ? -z : z * 1.15);
  if (R > 3900) h += smooth(3900, 6500, R) * (1400 + 1300 * ridged(x / 1900 + 3, z / 1900, 3));
  const k = clamp(h / 2600, 0, 1);
  h += (ridged(wx / 1300, wz / 1300, 4) - 0.5) * 170 * Math.pow(k, 0.85);
  h += (ridged(wx / 480 + 9, wz / 480, 3) - 0.5) * 36 * Math.pow(k, 0.7);
  h += fbm(N2, x / 1300, z / 1300, 2) * 70 + 60;
  return h;
}
// rolls you can feel when riding (left out on the groomed runs)
const bumps = (x, z) => N3(x / 60, z / 60) * 1.6 + N5(x / 170, z / 170) * 4;

// ---------- the runs: a smooth groomed surface along a path, blended into the mountain ----------
// width: half width of the groomed snow; blend: how far it blends out; smooth: how much the natural shape is evened out
export const RUNS = [
  { id: 'wall', name: 'The Wall', color: '#111827', level: 'black', w: 24, blend: 30, smooth: 90, gmax: 0.84,
    pts: [[-70, -1990], [-40, -1700], [0, -1300], [30, -900], [10, -500], [-20, -100], [0, 300], [30, 700], [10, 1100], [0, 1520]],
    moguls: [1250, 1750] },
  { id: 'panorama', name: 'Panorama', color: '#2563eb', level: 'blue', w: 30, blend: 34, smooth: 120, gmax: 0.55,
    pts: [[-150, -1985], [-520, -1750], [-860, -1380], [-1000, -950], [-820, -560], [-420, -300], [150, -120], [640, 160], [860, 520], [930, 900], [860, 1280], [650, 1560], [360, 1680], [150, 1720]] },
  { id: 'meadow', name: 'Green Meadow', color: '#16a34a', level: 'green', w: 36, blend: 36, smooth: 140, gmax: 0.42,
    pts: [[90, 250], [-260, 420], [-560, 660], [-650, 980], [-460, 1260], [-170, 1470], [-40, 1580]] },
  { id: 'park', name: 'Steep Park', color: '#f97316', level: 'park', w: 30, blend: 40, park: true,
    pts: [[600, 560], [612, 1460]] }
];
// the park: one straight run at a steady slope with everything on it
export const PARK_KICKERS = [
  { u: 85, h: 2.3, len: 9, deck: 6, land: 22, wide: 8, name: 'S' }, { u: 200, h: 3.5, len: 12, deck: 9, land: 26, wide: 9, name: 'M' },
  { u: 330, h: 4.9, len: 14, deck: 13, land: 30, wide: 10, name: 'L' }, { u: 470, h: 6.8, len: 18, deck: 18, land: 36, wide: 11, name: 'XL' }
];
export const PIPE = { a: 650, b: 860, half: 7.2, R: 5.2, H: 5.4, deck: 3.5 };
// rails and boxes: in the side lanes beside the kickers, and a line of them between the XL and the halfpipe
export const PARK_RAILS = [
  { u: 120, v: -21, L: 12, kind: 'box' }, { u: 150, v: 21, L: 14, kind: 'rail' }, { u: 255, v: -21, L: 16, kind: 'rail' },
  { u: 280, v: 21, L: 14, kind: 'box' }, { u: 395, v: -21, L: 18, kind: 'rail' }, { u: 420, v: 21, L: 16, kind: 'box' },
  { u: 548, v: -6, L: 14, kind: 'box' }, { u: 575, v: 6, L: 16, kind: 'rail' }, { u: 600, v: -13, L: 12, kind: 'rail', kink: true }
];

// ---------- the base village, the start platform and the mid station ----------
export const VILLAGE = { id: 'base', name: 'Steep Base', x: 10, z: 1760, r: 95 };
export const START = { id: 'start', name: 'Start', x: -95, z: -2005, r: 24 };
export const MID = { id: 'mid', name: 'Mid Station', x: 150, z: 240, r: 30 };
export const FLATS = [VILLAGE, START, MID];
for (const f of FLATS) f.level = massif(f.x, f.z) - (f === START ? 3 : 0);

const CELL = 64, SEGS = new Map();
function cellKey(i, j) { return i * 100003 + j; }
function prep(run) {
  // the path, every 4 m
  const raw = run.pts, P = [];
  for (let i = 0; i < raw.length - 1; i++) {
    const [ax, az] = raw[i], [bx, bz] = raw[i + 1], l = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(l / 4));
    for (let k = 0; k < n; k++) P.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]);
  }
  P.push(raw[raw.length - 1]);
  // smooth the corners of the path (so the run curves)
  for (let it = 0; it < 6 && !run.park; it++) for (let i = 1; i < P.length - 1; i++) P[i] = [(P[i - 1][0] + 2 * P[i][0] + P[i + 1][0]) / 4, (P[i - 1][1] + 2 * P[i][1] + P[i + 1][1]) / 4];
  const S = [0]; for (let i = 1; i < P.length; i++) S.push(S[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  let Y = P.map(([x, z]) => massif(x, z));
  if (run.park) {
    // a steady slope from the natural top to the natural bottom
    const a = Y[0] - 2, b = Y[Y.length - 1] + 2, L = S[S.length - 1];
    Y = S.map(s => a + (b - a) * s / L);
  } else {
    // even it out: a moving average over "smooth" metres, a few times; never uphill
    const win = Math.max(1, Math.round(run.smooth / 4 / 2));
    for (let it = 0; it < 3; it++) {
      const out = Y.slice();
      for (let i = 0; i < Y.length; i++) { let s = 0, n = 0; for (let k = -win; k <= win; k++) { const j = clamp(i + k, 0, Y.length - 1); s += Y[j]; n++; } out[i] = s / n; }
      Y = out;
    }
    // not steeper than gmax: fill where it drops too fast, cut where it would have to, half of each
    if (run.gmax) for (let pass = 0; pass < 2; pass++) {
      const F = Y.slice(), C = Y.slice();
      for (let i = 1; i < Y.length; i++) F[i] = Math.max(F[i], F[i - 1] - run.gmax * (S[i] - S[i - 1]));
      for (let i = Y.length - 2; i >= 0; i--) C[i] = Math.min(C[i], C[i + 1] + run.gmax * (S[i + 1] - S[i]));
      Y = F.map((f, i) => (f + C[i]) / 2);
    }
    // starting from a flat (the start platform, the mid station): go down from it right away
    const f0 = FLATS.find(f => Math.hypot(P[0][0] - f.x, P[0][1] - f.z) < f.r * 2.3 + 25);
    if (f0) Y[0] = Math.min(Y[0], f0.level - 0.4);
    for (let i = 1; i < Y.length; i++) Y[i] = Math.min(Y[i], Y[i - 1] - (f0 && S[i] < 140 ? 0.14 : 0.0125) * (S[i] - S[i - 1]));
  }
  run.P = P; run.S = S; run.Y = Y; run.len = S[S.length - 1];
  // index the segments by cell (for quick lookups)
  const reach = run.w + run.blend + 4;
  for (let i = 0; i < P.length - 1; i++) {
    const x0 = Math.min(P[i][0], P[i + 1][0]) - reach, x1 = Math.max(P[i][0], P[i + 1][0]) + reach, z0 = Math.min(P[i][1], P[i + 1][1]) - reach, z1 = Math.max(P[i][1], P[i + 1][1]) + reach;
    for (let ci = Math.floor(x0 / CELL); ci <= Math.floor(x1 / CELL); ci++) for (let cj = Math.floor(z0 / CELL); cj <= Math.floor(z1 / CELL); cj++) {
      const k = cellKey(ci, cj); let a = SEGS.get(k); if (!a) SEGS.set(k, a = []); a.push([run, i]);
    }
  }
}
for (const r of RUNS) prep(r);
export const PARK = RUNS.find(r => r.park);

// where a point is on a run: { run, u (along), v (across, + = right when going down), y (groomed height) }
const _hits = [];
export function runsAt(x, z, out = _hits) {
  out.length = 0;
  const a = SEGS.get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL))); if (!a) return out;
  let lastRun = null, best = null;
  for (const [run, i] of a) {
    if (run !== lastRun) { if (best) out.push(best); best = null; lastRun = run; }
    const P = run.P, ax = P[i][0], az = P[i][1], dx = P[i + 1][0] - ax, dz = P[i + 1][1] - az, l2 = dx * dx + dz * dz;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1), px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x - px, z - pz);
    if (!best || d < Math.abs(best.v)) {
      const l = Math.sqrt(l2), side = (dx * (z - az) - dz * (x - ax)) < 0 ? 1 : -1;
      // past the ends: keep counting along the path (for fading out)
      let u = run.S[i] + t * l; if (i === 0 && t === 0) u = ((x - ax) * dx + (z - az) * dz) / l; if (i === P.length - 2 && t === 1) u = run.S[i] + ((x - ax) * dx + (z - az) * dz) / l;
      best = { run, u, v: d * side, dx: dx / l, dz: dz / l, i };
    }
  }
  if (best) out.push(best);
  return out;
}
function profileAt(run, u) {
  const f = clamp(u, 0, run.len) / run.len * (run.Y.length - 1), i = Math.min(run.Y.length - 2, Math.floor(f));
  return lerp(run.Y[i], run.Y[i + 1], f - i);
}

// ---------- park features (heights over the park's steady slope) ----------
// the kickers are as wide as k.wide (the side lanes stay free for the rails), with sloped sides
function kickerH(u, v) {
  const g = (PARK.Y[0] - PARK.Y[PARK.Y.length - 1]) / PARK.len;
  for (const k of PARK_KICKERS) {
    const a = k.u - k.len, b = k.u, c = k.u + k.deck, d = c + k.land;
    if (u <= a || u >= d) continue;
    const side = 1 - smooth(k.wide, k.wide + k.h * 1.1, Math.abs(v));
    if (side <= 0) return 0;
    return side * kickerProfile(k, u, a, b, c, d, g);
  }
  return 0;
}
function kickerProfile(k, u, a, b, c, d, g) {
  {
    // a ramp that curves up to the lip, a level table, the knuckle and a long steep landing back to the slope
    if (u < b) return k.h * ((u - a) / k.len) ** 2;
    if (u < c) return k.h + (u - b) * g;
    const top = k.h + (c - b) * g, t = (u - c) / (d - c);
    return top * (1 - t * t * (3 - 2 * t));
  }
}
// the halfpipe's walls (0 in the middle, up to H at the lip), and how far in from the open ends
export function pipeWall(u, v) {
  const P = PIPE; if (u < P.a - 30 || u > P.b + 30) return 0;
  const fade = smooth(P.a - 30, P.a + 10, u) * (1 - smooth(P.b - 10, P.b + 30, u)), H = P.H * fade;
  if (H <= 0) return 0;
  const av = Math.abs(v), R = P.R, k = H / P.H;
  if (av <= P.half) return 0;
  const x = av - P.half;
  // a quarter circle up to 76 degrees, then straight to the lip, then the deck, then the outside bank
  const xs = R * Math.sin(1.33), hs = R * (1 - Math.cos(1.33)), lipX = xs + (P.H - hs) / 4;
  let h;
  if (x < xs) h = R - Math.sqrt(Math.max(0, R * R - x * x));
  else if (x < lipX) h = hs + (x - xs) * 4;
  else if (x < lipX + P.deck) h = P.H;
  else h = Math.max(0, P.H - (x - lipX - P.deck) * 0.7);
  return h * k;
}
export const PIPE_W = PIPE.half + PIPE.R * Math.sin(1.33) + (PIPE.H - PIPE.R * (1 - Math.cos(1.33))) / 4;

// ---------- natural lips, cliff drops and the powder bowl ----------
export const POWDER = [{ x: 1220, z: -820, rx: 560, rz: 520, name: 'Powder Bowl' }, { x: -980, z: 900, rx: 460, rz: 560, name: 'Pine Glades' }];
export function powderAt(x, z) { for (const p of POWDER) { const d = ((x - p.x) / p.rx) ** 2 + ((z - p.z) / p.rz) ** 2; if (d < 1) return p; } return null; }
export const CLIFF_ZONE = { x: -1060, z: -420, r: 420, name: 'The Cliffs' };
export const LIPS = [];
const LC = 200, LN = 40, LOFF = 20, LIPGRID = new Array(LN * LN).fill(null);
const lipCell = (cx, cz) => (cx + LOFF < 0 || cz + LOFF < 0 || cx + LOFF >= LN || cz + LOFF >= LN) ? null : LIPGRID[(cx + LOFF) * LN + cz + LOFF];
function addLip(l) {
  const cx = Math.floor(l.x / LC) + LOFF, cz = Math.floor(l.z / LC) + LOFF;
  const R = l.k > 1 ? 1 : 0;
  for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) { const k = (cx + i) * LN + cz + j; if (k >= 0 && k < LIPGRID.length) (LIPGRID[k] || (LIPGRID[k] = [])).push(l); }
  LIPS.push(l);
}
function onRun(x, z, pad) { for (const h of runsAt(x, z)) if (Math.abs(h.v) < h.run.w + h.run.blend + pad && h.u > -40 && h.u < h.run.len + 40) return true; return false; }
function nearFlat(x, z, pad) { for (const f of FLATS) if (Math.hypot(x - f.x, z - f.z) < f.r * 2.3 + pad) return true; return false; }
(function placeLips() {
  const r = rng(99);
  for (let gx = -BOUNDS.x + 150; gx <= BOUNDS.x - 150; gx += 120) for (let gz = BOUNDS.z0 + 200; gz <= BOUNDS.z1 - 200; gz += 120) {
    const x = gx + (r() - 0.5) * 100, z = gz + (r() - 0.5) * 100, e = 6;
    const inPowder = !!powderAt(x, z);
    if (r() > (inPowder ? 0.45 : 0.2)) continue;
    const h = massif(x, z), dx = (massif(x + e, z) - massif(x - e, z)) / (2 * e), dz = (massif(x, z + e) - massif(x, z - e)) / (2 * e), s = Math.hypot(dx, dz);
    if (s < 0.25 || s > 0.85 || onRun(x, z, 30) || nearFlat(x, z, 60)) continue;
    addLip({ x, z, dx: -dx / s, dz: -dz / s, w: 18 + r() * 34, a: 1.6 + r() * 2.2, d: 3 + r() * 7, k: 1 });
  }
  // the cliff band: big drops onto steep landings
  let n = 0;
  for (let i = 0; i < 600 && n < 6; i++) {
    const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * CLIFF_ZONE.r, x = CLIFF_ZONE.x + Math.cos(a) * rr, z = CLIFF_ZONE.z + Math.sin(a) * rr, e = 8;
    const dx = (massif(x + e, z) - massif(x - e, z)) / (2 * e), dz = (massif(x, z + e) - massif(x, z - e)) / (2 * e), s = Math.hypot(dx, dz);
    if (s < 0.35 || s > 0.75 || onRun(x, z, 40) || LIPS.some(l => l.cliff && Math.hypot(l.x - x, l.z - z) < 140)) continue;
    addLip({ x, z, dx: -dx / s, dz: -dz / s, w: 30 + r() * 20, a: 1.2, d: 9 + r() * 8, k: 1.7, cliff: true });
    n++;
  }
})();

// ---------- the final height ----------
let _stamp = 1;
export function terrain(x, z) {
  let h = massif(x, z), b = bumps(x, z);
  // natural lips and cliff drops
  const cx = Math.floor(x / LC), cz = Math.floor(z / LC);
  let lip = 0;
  for (let i = -1; i <= 1; i++) for (let k = -1; k <= 1; k++) {
    const a = lipCell(cx + i, cz + k); if (!a) continue;
    for (const l of a) {
      if (l.k > 1) { if (l._s === _stamp) continue; l._s = _stamp; }
      const rx = x - l.x, rz = z - l.z, u = rx * l.dx + rz * l.dz, v = rx * -l.dz + rz * l.dx, K = l.k;
      if (u < -32 * K || u > 80 * K || Math.abs(v) > l.w * 1.8) continue;
      const side = Math.exp(-((v / l.w) ** 2) * 2);
      lip += side * (l.a * smooth(-28 * K, 0, u) - (l.a + l.d) * smooth(0, 9 * K, u) + l.d * smooth(9 * K, 75 * K, u));
    }
  }
  _stamp++;
  h += b + lip;
  // the runs
  for (const hit of runsAt(x, z)) {
    const run = hit.run, av = Math.abs(hit.v), reach = run.w + run.blend;
    if (av > reach || hit.u < -run.blend || hit.u > run.len + run.blend) continue;
    let s = profileAt(run, hit.u);
    if (run.park) s += kickerH(hit.u, hit.v) + pipeWall(hit.u, hit.v) + smooth(run.w * 0.55, run.w, av) * 2.2;
    else {
      // a slight bank at the edges, a few soft rolls, and the mogul field
      s += smooth(run.w * 0.5, run.w, av) * 1.2 + N3(x / 45, z / 45) * 0.5;
      if (run.moguls && hit.u > run.moguls[0] - 40 && hit.u < run.moguls[1] + 40) {
        const k = smooth(run.moguls[0] - 40, run.moguls[0], hit.u) * (1 - smooth(run.moguls[1], run.moguls[1] + 40, hit.u)) * (1 - smooth(run.w * 0.7, run.w, av));
        s += k * 0.5 * (Math.sin(hit.u / 1.05) * Math.sin(hit.v / 0.95 + Math.sin(hit.u / 7) * 0.8));
      }
    }
    const wv = smooth(run.w, reach, av), wu = hit.u < 0 ? smooth(0, -run.blend, hit.u) : hit.u > run.len ? smooth(run.len, run.len + run.blend, hit.u) : 0;
    const w = Math.max(wv, wu);
    h = s * (1 - w) + h * w;
  }
  // the flat spots
  for (const f of FLATS) {
    const d = Math.hypot(x - f.x, z - f.z);
    if (d < f.r * 2.3) h += (f.level - h) * (1 - smooth(f.r, f.r * 2.3, d));
  }
  return h;
}
// the park's u / v for a point (null if outside)
export function parkUV(x, z) { for (const h of runsAt(x, z)) if (h.run.park) return h; return null; }
// is this point inside the halfpipe (between the lips)?
export function inPipe(x, z) { const h = parkUV(x, z); return !!h && h.u > PIPE.a && h.u < PIPE.b && Math.abs(h.v) < PIPE_W + 0.5; }
// ground-level detail is needed here (the park and the mogul field): areas as [x0, z0, x1, z1]
export const DETAIL = [
  [Math.min(PARK.pts[0][0], PARK.pts[1][0]) - 50, PARK.pts[0][1] - 40, Math.max(PARK.pts[0][0], PARK.pts[1][0]) + 50, PARK.pts[1][1] + 40]
];
(function mogulZone() {
  const run = RUNS.find(r => r.moguls); if (!run) return;
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (let i = 0; i < run.P.length; i++) if (run.S[i] > run.moguls[0] - 40 && run.S[i] < run.moguls[1] + 40) { x0 = Math.min(x0, run.P[i][0]); x1 = Math.max(x1, run.P[i][0]); z0 = Math.min(z0, run.P[i][1]); z1 = Math.max(z1, run.P[i][1]); }
  DETAIL.push([x0 - run.w - 10, z0 - 10, x1 + run.w + 10, z1 + 10]);
})();

// the name of the place you are at
export function zoneAt(x, z) {
  for (const f of FLATS) if (Math.hypot(x - f.x, z - f.z) < f.r * 1.8) return { id: f.id, name: f.name };
  const hits = runsAt(x, z);
  for (const h of hits) if (Math.abs(h.v) < h.run.w + 6 && h.u > -10 && h.u < h.run.len + 10) {
    if (h.run.park && h.u > PIPE.a - 20 && h.u < PIPE.b + 10) return { id: 'pipe', name: 'Halfpipe' };
    return { id: h.run.id, name: h.run.name };
  }
  if (Math.hypot(x - CLIFF_ZONE.x, z - CLIFF_ZONE.z) < CLIFF_ZONE.r) return { id: 'cliffs', name: CLIFF_ZONE.name };
  const p = powderAt(x, z); if (p) return { id: p.name === 'Powder Bowl' ? 'powder' : 'glades', name: p.name };
  return { id: 'free', name: 'Steep Peak' };
}
export const LOBBY = VILLAGE;
