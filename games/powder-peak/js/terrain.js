// The shape of the mountain. Everything that needs the ground (riding, landing, the landing assist, trees,
// the camera) asks these functions, so the snow you see and the snow you ride on are the same.
//
// Coordinates: x is across the mountain, z goes downhill (the peak is at z = -960, the village at z = +700),
// y is up. One unit is one meter.
import { makeNoise, fbm } from './noise.js';
import { clamp, smooth } from './engine.js';

const N = makeNoise(7), N2 = makeNoise(31), N3 = makeNoise(77);

export const BOUNDS = { x: 780, z0: -990, z1: 980 };

// areas of the mountain (soft rectangles) – used for the shape, the trees and the names on screen
export const ZONES = [
  { id: 'peak', name: 'Mountain Peak', x0: -330, x1: 260, z0: -1000, z1: -560 },
  { id: 'park', name: 'Freestyle Park', x0: -165, x1: 165, z0: -330, z1: 380 },
  { id: 'cliffs', name: 'Cliff Area', x0: 250, x1: 680, z0: -560, z1: 240 },
  { id: 'forest', name: 'Snowy Forest', x0: -700, x1: -205, z0: -540, z1: 480 },
  { id: 'village', name: 'Village', x0: -460, x1: 460, z0: 600, z1: 1000 }
];
function rectMask(x, z, r, edge) {
  return smooth(r.x0 - edge, r.x0 + edge, x) * (1 - smooth(r.x1 - edge, r.x1 + edge, x)) * smooth(r.z0 - edge, r.z0 + edge, z) * (1 - smooth(r.z1 - edge, r.z1 + edge, z));
}
export function zoneAt(x, z) {
  if (z > 600) return ZONES[4];
  for (const zn of [ZONES[1], ZONES[2], ZONES[3], ZONES[0]]) if (x >= zn.x0 && x <= zn.x1 && z >= zn.z0 && z <= zn.z1) return zn;
  return { id: 'slopes', name: 'Open Slopes' };
}

// natural jumps: a lip that rises over ~25 m, then the snow drops away (u goes downhill)
export const LIPS = [
  { x: -120, z: -790, w: 34, a: 3.2, d: 7 }, { x: 105, z: -660, w: 44, a: 2.6, d: 9 }, { x: -40, z: -610, w: 30, a: 2.2, d: 6 },
  { x: -470, z: -270, w: 22, a: 2.2, d: 4.5 }, { x: -350, z: 60, w: 26, a: 2.6, d: 5.5 }, { x: -560, z: 230, w: 20, a: 2, d: 4 },
  { x: -260, z: 470, w: 40, a: 2.4, d: 5 }, { x: 270, z: 360, w: 36, a: 2.8, d: 6 }, { x: 40, z: 470, w: 50, a: 2, d: 4 }
];
// cliff bands in the Cliff Area: shelves with sudden drops
const CLIFFS = [{ z: -440, d: 16 }, { z: -265, d: 22 }, { z: -90, d: 15 }, { z: 70, d: 26 }];
const CLIFF_SPAN = 150;

// the main shape, without the noise
function profile(z) {
  const t = clamp((z + 960) / 1640, 0, 1);
  let h = 640 * Math.pow(1 - t, 1.35) + (680 - z) * 0.04;
  if (z < -960) h += (-960 - z) * 0.35;
  // past the village the valley just goes on, gently down (you cannot ride there, the edge stops you)
  if (z > 920) h -= (z - 920) * 0.03;
  return h;
}

export function terrain(x, z) {
  let h = profile(z);
  // a wide bowl. At the sides and behind the peak the snow rises into mountain ridges; their tops hide
  // the edge of the world
  const ax = Math.abs(x);
  h += 0.00008 * x * x;
  if (ax > 640) {
    const crest = 125 + 75 * N2(z / 170, x > 0 ? 3.3 : 7.7) + 30 * N3(z / 60, x / 60);
    h += crest * Math.pow(smooth(640, 845, ax), 1.25) * (1 - 0.75 * smooth(865, 960, ax));
  }
  if (z < -960) {
    const crest = 150 + 80 * N2(x / 180, 11.1) + 25 * N3(x / 55, 3.3);
    h += crest * smooth(-960, -1060, z) * (1 - 0.7 * smooth(-1075, -1120, z));
  }
  // the summit
  h += 75 * Math.exp(-((x * x) + (z + 905) * (z + 905)) / (2 * 115 * 115));
  // ridges that split the areas (good side hits)
  h += 16 * Math.exp(-(((x - 225) / 38) ** 2)) * smooth(-720, -620, z) * (1 - smooth(260, 420, z));
  h += 13 * Math.exp(-(((x + 195) / 34) ** 2)) * smooth(-560, -460, z) * (1 - smooth(380, 520, z));
  // noise: calm in the park and the village, bumpy in the forest
  const park = rectMask(x, z, ZONES[1], 50), vill = smooth(560, 660, z), forest = rectMask(x, z, ZONES[3], 60);
  const calm = 1 - Math.max(park * 0.85, vill * 0.75);
  h += fbm(N, x / 480, z / 480, 3) * 24 * calm;
  h += N2(x / 150, z / 150) * (6 + forest * 4) * calm;
  h += N3(x / 48, z / 48) * (1.4 + forest * 1.2) * calm;
  // natural lips
  for (const l of LIPS) {
    const u = z - l.z, v = x - l.x;
    if (u < -32 || u > 80 || Math.abs(v) > l.w * 1.8) continue;
    const side = Math.exp(-((v / l.w) ** 2) * 2);
    h += side * (l.a * smooth(-28, 0, u) - (l.a + l.d) * smooth(0, 9, u) + l.d * smooth(9, 75, u));
  }
  // the cliffs
  const cm = smooth(255, 320, x) * (1 - smooth(600, 660, x)) * smooth(-560, -500, z) * (1 - smooth(200, 260, z));
  if (cm > 0) {
    let c = 0;
    for (const cl of CLIFFS) {
      const e = cl.z + 22 * N2(x / 90, cl.z / 50);
      c += cl.d * (clamp((z - (e - CLIFF_SPAN)) / CLIFF_SPAN, 0, 1) - smooth(e - 2.5, e + 3.5, z));
    }
    h += c * cm;
  }
  return h;
}
