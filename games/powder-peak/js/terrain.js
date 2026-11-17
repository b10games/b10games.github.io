// The shape of the mountains: a whole range of huge peaks (up to about 3 km above the valleys), with
// sharp ridges, gullies, rolls and natural lips to jump off. Everything that needs the ground (riding,
// landing, the landing assist, trees, the camera, the map) asks terrain(), so what you see is what you ride.
// One unit is one meter. y is up.
import { makeNoise, fbm } from './noise.js';
import { clamp, smooth, rng } from './math.js';

const N1 = makeNoise(7), N2 = makeNoise(31), N3 = makeNoise(77), N4 = makeNoise(123), N5 = makeNoise(555);

export const BOUNDS = { x: 3800, z0: -3800, z1: 3800 };

// the big peaks you can ride (name, position, height, how wide the mountain is)
export const PEAKS = [
  { id: 'titan', name: 'Titan Peak', x: 0, z: -1900, h: 3050, r: 4500 },
  { id: 'frost', name: 'Frost Horn', x: -2500, z: -1000, h: 2650, r: 3900 },
  { id: 'eagle', name: 'Eagle Spire', x: 2400, z: -1300, h: 2800, r: 4100 },
  { id: 'storm', name: 'Storm Crown', x: -1700, z: 1300, h: 2250, r: 3400 },
  { id: 'glacier', name: 'Glacier Dome', x: 1900, z: 1500, h: 2400, r: 3600 },
  { id: 'wolf', name: 'Wolf Tooth', x: 3300, z: 450, h: 1950, r: 2900 },
  { id: 'raven', name: 'Raven Ridge', x: -3300, z: 350, h: 1850, r: 2800 },
  { id: 'sunset', name: 'Sunset Point', x: 200, z: 2900, h: 1650, r: 2600 }
];
// a quiet spot in the valley for the lobby (the big peak right behind it)
for (const p of PEAKS) p.r2 = p.r * p.r;
export const LOBBY = { x: 0, z: 2200, r: 70 };   // Titan Peak towers 4 km to the north

function ridged(x, z, oct) {
  let s = 0, a = 1, f = 1, n = 0;
  // a rounded crest instead of a knife edge (sqrt(n² + e) instead of |n|), so ridges are steep but rideable
  for (let i = 0; i < oct; i++) { const q = N1(x * f, z * f), v = 1 - Math.sqrt(q * q + 0.012); s += a * v * v; n += a; a *= 0.4; f *= 2.0; }
  return s / n;
}
// the mountains without the small stuff (also used for the fall line of the lips)
function massif(x, z) {
  const wx = x + 380 * N4(x / 2200, z / 2200), wz = z + 380 * N4(z / 2200 + 7.3, x / 2200);
  // smooth maximum of all the peaks: saddles and valleys appear between them
  let acc = 1;
  for (let i = 0; i < PEAKS.length; i++) {
    const p = PEAKS[i], dx = wx - p.x, dz = wz - p.z, d2 = dx * dx + dz * dz;
    if (d2 >= p.r2) continue;
    const t = 1 - Math.sqrt(d2) / p.r;
    acc += Math.exp(p.h * t * Math.sqrt(Math.sqrt(t)) / 240);     // (1 - d)^1.25
  }
  let h = 240 * Math.log(acc);
  // far outside the riding area: more giant mountains all around the horizon
  const R = Math.max(Math.abs(x), Math.abs(z));
  if (R > 4300) h += smooth(4300, 7000, R) * (1600 + 1300 * ridged(x / 1900 + 3, z / 1900, 3));
  const k = clamp(h / 2600, 0, 1);
  // arêtes and couloirs on the high parts, softer folds lower down
  h += (ridged(wx / 1300, wz / 1300, 4) - 0.5) * 190 * Math.pow(k, 0.85);
  h += (ridged(wx / 480 + 9, wz / 480, 3) - 0.5) * 42 * Math.pow(k, 0.7);
  // the valleys are not flat either
  h += fbm(N2, x / 1300, z / 1300, 2) * 90 + 60;
  return h;
}

// natural lips (wind lips, rolls that drop away): placed once, on rideable slopes
export const LIPS = [];
// a plain grid of 200 m cells (fast to look up: no text keys)
const LC = 200, LN = 48, LOFF = 24, LIPGRID = new Array(LN * LN).fill(null);
const lipCell = (cx, cz) => (cx + LOFF < 0 || cz + LOFF < 0 || cx + LOFF >= LN || cz + LOFF >= LN) ? null : LIPGRID[(cx + LOFF) * LN + cz + LOFF];
(function placeLips() {
  const r = rng(99);
  for (let gx = -3600; gx <= 3600; gx += 140) for (let gz = -3600; gz <= 3600; gz += 140) {
    const x = gx + (r() - 0.5) * 120, z = gz + (r() - 0.5) * 120, e = 6;
    if (r() > 0.2) continue;
    const h = massif(x, z), dx = (massif(x + e, z) - massif(x - e, z)) / (2 * e), dz = (massif(x, z + e) - massif(x, z - e)) / (2 * e), s = Math.hypot(dx, dz);
    if (s < 0.3 || s > 0.8 || h < 250 || h > 2700) continue;
    const l = { x, z, dx: -dx / s, dz: -dz / s, w: 22 + r() * 40, a: 1.8 + r() * 2.4, d: 4 + r() * 9 };
    LIPS.push(l);
    const cx = Math.floor(x / LC) + LOFF, cz = Math.floor(z / LC) + LOFF, k = cx * LN + cz;
    (LIPGRID[k] || (LIPGRID[k] = [])).push(l);
  }
})();

const LOBBY_H = massif(LOBBY.x, LOBBY.z);
export function terrain(x, z) {
  let h = massif(x, z);
  // rolls and bumps you can feel when riding
  h += N3(x / 60, z / 60) * 1.6 + N5(x / 170, z / 170) * 4;
  // the lips
  const cx = Math.floor(x / LC), cz = Math.floor(z / LC);
  for (let i = -1; i <= 1; i++) for (let k = -1; k <= 1; k++) {
    const a = lipCell(cx + i, cz + k); if (!a) continue;
    for (const l of a) {
      const rx = x - l.x, rz = z - l.z, u = rx * l.dx + rz * l.dz, v = rx * -l.dz + rz * l.dx;
      if (u < -32 || u > 80 || Math.abs(v) > l.w * 1.8) continue;
      const side = Math.exp(-((v / l.w) ** 2) * 2);
      h += side * (l.a * smooth(-28, 0, u) - (l.a + l.d) * smooth(0, 9, u) + l.d * smooth(9, 75, u));
    }
  }
  // the lobby: a small flat spot in the valley
  const ld = Math.hypot(x - LOBBY.x, z - LOBBY.z);
  if (ld < LOBBY.r * 2.5) h += (LOBBY_H - h) * (1 - smooth(LOBBY.r, LOBBY.r * 2.5, ld));
  return h;
}

// the name of the place you are at: the nearest peak, or the valley
export function zoneAt(x, z) {
  if (terrain(x, z) < 380) return { id: 'valley', name: 'The Valley' };
  let best = PEAKS[0], bd = 1e9;
  for (const p of PEAKS) { const d = Math.hypot(x - p.x, z - p.z) / p.r; if (d < bd) { bd = d; best = p; } }
  return { id: best.id, name: best.name };
}
export const ZONES = PEAKS;
