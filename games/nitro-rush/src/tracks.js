import * as THREE from "three";

export const TRACK_LIST = [
  {
    id: "harbor",
    name: "Harbor District",
    difficulty: "Easy",
    diffMul: 0.68,
    width: 34,
    corner: 130,
    scale: 188,
    tagline: "Huge dock roads. Long drift corners.",
    theme: "harbor",
    accent: "#ff8a3d",
  },
  {
    id: "neon",
    name: "Neon City",
    difficulty: "Medium",
    diffMul: 0.86,
    width: 32,
    corner: 125,
    scale: 184,
    tagline: "Towers wall the road. Drift the long bends.",
    theme: "neon",
    accent: "#22e4ff",
  },
  {
    id: "alpine",
    name: "Alpine Road",
    difficulty: "Hard",
    diffMul: 1.04,
    width: 30,
    corner: 145,
    scale: 168,
    tagline: "Climb a huge snow mountain. Drift the switchbacks.",
    theme: "alpine",
    accent: "#9fd4ff",
  },
  {
    id: "desert",
    name: "Desert Road",
    difficulty: "Medium",
    diffMul: 0.86,
    width: 36,
    corner: 155,
    scale: 200,
    tagline: "Much longer straights and wide drift bends.",
    theme: "desert",
    accent: "#f0c14a",
  },
  {
    id: "coast",
    name: "Coast Road",
    difficulty: "Easy",
    diffMul: 0.66,
    width: 38,
    corner: 165,
    scale: 208,
    tagline: "The biggest road. Easy sweepers.",
    theme: "coast",
    accent: "#5ec8ff",
  },
  {
    id: "industrial",
    name: "Industrial Docks",
    difficulty: "Hard",
    diffMul: 1.06,
    width: 33,
    corner: 135,
    scale: 192,
    tagline: "Long factory straights. Hard AI.",
    theme: "industrial",
    accent: "#f97316",
  },
  {
    id: "forest",
    name: "Forest Road",
    difficulty: "Medium",
    diffMul: 0.88,
    width: 32,
    corner: 140,
    scale: 182,
    tagline: "Wide forest curves made for a drift.",
    theme: "forest",
    accent: "#3ddc84",
  },
];

export function getTrackDef(id) {
  return TRACK_LIST.find((t) => t.id === id) || TRACK_LIST[0];
}

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return new THREE.Vector3(
    0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
    0.5 * (2 * p1.z + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3)
  );
}

function smoothClosed(points, per = 14) {
  const n = points.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    for (let s = 0; s < per; s++) out.push(catmull(p0, p1, p2, p3, s / per));
  }
  return out;
}

function gridPoints(cells, scale, yOf) {
  return cells.map((c, i) => {
    const x = c[0] * scale;
    const z = c[1] * scale;
    const y = yOf ? yOf(c, i) : c[2] || 0;
    return new THREE.Vector3(x, y, z);
  });
}

// Closed street routes: long blocks, then a real corner. Not an oval.
const STREET_CELLS = {
  harbor: [
    [0, 0], [6, 0], [6.4, 2.6], [1.2, 3.1], [0.6, 5.6], [-2.2, 5.2], [-2.6, 2.2], [-0.4, 1.6],
  ],
  neon: [
    [0, 0], [6.5, 0.3], [7, 3], [2.2, 3.4], [1.6, 6], [-1.8, 5.6], [-2.4, 2.4], [-0.3, 1.5],
  ],
  alpine: [
    [0, 0, 0], [7.6, 0.3, 3], [9.4, 3.6, 12], [5.2, 7.4, 22], [0.8, 9.6, 30], [-4.2, 7.2, 18], [-5.8, 3.1, 8], [-2.1, 0.7, 1],
  ],
  desert: [
    [0, 0], [7.5, 0.2], [8, 2.4], [2.4, 3], [1.8, 5.8], [-2.2, 5.4], [-2.8, 2], [-0.4, 1.4],
  ],
  coast: [
    [0, 0], [8, 0.3], [8.6, 2.2], [2, 2.8], [1.2, 5.4], [-2.6, 5], [-3.2, 1.8], [-0.5, 1.2],
  ],
  industrial: [
    [0, 0], [6.2, 0], [6.6, 2.8], [1.4, 3.2], [0.8, 5.8], [-2, 5.4], [-2.4, 2], [-0.3, 1.4],
  ],
  forest: [
    [0, 0, 1], [5.8, 1, 4], [6.4, 3.6, 7], [1.8, 4.4, 8], [1, 6.8, 6], [-2.2, 6, 4], [-2.6, 2.4, 2],
  ],
};

function controlPoints(def) {
  const scale = def.scale || 76;
  const yMul = def.id === "alpine" ? 7.4 : def.theme === "forest" ? 2.2 : 0;
  return gridPoints(STREET_CELLS[def.id] || STREET_CELLS.harbor, scale, (c) => (c[2] || 0) * yMul);
}

function streetPath(points, radius) {
  const n = points.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const curr = points[i];
    const next = points[(i + 1) % n];
    const vIn = new THREE.Vector3(curr.x - prev.x, 0, curr.z - prev.z);
    const vOut = new THREE.Vector3(next.x - curr.x, 0, next.z - curr.z);
    const len1 = vIn.length();
    const len2 = vOut.length();
    if (len1 < 0.05 || len2 < 0.05) {
      out.push(curr.clone());
      continue;
    }
    vIn.multiplyScalar(1 / len1);
    vOut.multiplyScalar(1 / len2);
    const cross = vIn.x * vOut.z - vIn.z * vOut.x;
    const dot = Math.min(1, Math.max(-1, vIn.dot(vOut)));
    const turn = Math.atan2(cross, dot);
    const absTurn = Math.abs(turn);
    if (absTurn < 0.08) {
      out.push(curr.clone());
      continue;
    }
    let r = radius;
    let tanLen = r * Math.tan(absTurn / 2);
    const maxTan = Math.min(len1, len2) * 0.46;
    if (!Number.isFinite(tanLen) || tanLen > maxTan) {
      tanLen = maxTan;
      r = tanLen / Math.tan(absTurn / 2);
    }
    const a = new THREE.Vector3(curr.x - vIn.x * tanLen, curr.y + (prev.y - curr.y) * (tanLen / len1), curr.z - vIn.z * tanLen);
    const b = new THREE.Vector3(curr.x + vOut.x * tanLen, curr.y + (next.y - curr.y) * (tanLen / len2), curr.z + vOut.z * tanLen);
    const sign = turn >= 0 ? 1 : -1;
    const rx = -vIn.z;
    const rz = vIn.x;
    const cx = a.x + rx * sign * r;
    const cz = a.z + rz * sign * r;
    const start = Math.atan2(a.z - cz, a.x - cx);
    const end = Math.atan2(b.z - cz, b.x - cx);
    let delta = end - start;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    let best = delta;
    let bestErr = Math.abs(Math.abs(delta) - absTurn);
    for (const extra of [delta + Math.PI * 2, delta - Math.PI * 2]) {
      const err = Math.abs(Math.abs(extra) - absTurn);
      if (err < bestErr) {
        best = extra;
        bestErr = err;
      }
    }
    delta = best;
    const steps = Math.max(5, Math.ceil(Math.abs(delta) / 0.1));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const ang = start + delta * t;
      out.push(new THREE.Vector3(cx + Math.cos(ang) * r, a.y + (b.y - a.y) * t, cz + Math.sin(ang) * r));
    }
  }
  return out;
}

function resampleClosed(raw, spacing) {
  const n = raw.length;
  const cum = [0];
  for (let i = 1; i <= n; i++) cum.push(cum[i - 1] + raw[(i - 1) % n].distanceTo(raw[i % n]));
  const total = cum[n];
  const count = Math.max(24, Math.floor(total / spacing));
  const pts = [];
  for (let k = 0; k < count; k++) {
    const d = (k / count) * total;
    let i = 1;
    while (i < cum.length - 1 && cum[i] < d) i++;
    const seg = cum[i] - cum[i - 1] || 1;
    const t = (d - cum[i - 1]) / seg;
    pts.push(raw[(i - 1) % n].clone().lerp(raw[i % n], t));
  }
  return { pts, total };
}

export function computeSamples(def) {
  const controls = controlPoints(def);
  const dense = streetPath(controls, def.corner || 16);
  const { pts, total } = resampleClosed(dense, 2.55);
  const n = pts.length;
  const samples = [];
  let dist = 0;
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 2 + n) % n];
    const next = pts[(i + 2) % n];
    const tangent = next.clone().sub(prev);
    if (tangent.lengthSq() < 1e-8) tangent.set(0, 0, 1);
    tangent.normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(up, tangent);
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    right.normalize();
    if (i > 0) dist += pts[i].distanceTo(pts[i - 1]);
    samples.push({
      pos: pts[i],
      tangent,
      right,
      dist,
      width: def.width,
      boost: false,
      bank: 0,
    });
  }
  for (let i = 0; i < n; i++) {
    const a = samples[i].tangent;
    const b = samples[(i + 8) % n].tangent;
    const turn = a.x * b.z - a.z * b.x;
    samples[i].bank = Math.max(-0.11, Math.min(0.11, -turn * 2.8));
  }
  const step = samples.length > 1 ? samples[1].dist - samples[0].dist || 2.55 : 2.55;
  placeBoosts(samples);
  const checkpoints = [];
  for (let k = 0; k < 8; k++) checkpoints.push(Math.floor((k * n) / 8));
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const s of samples) {
    minX = Math.min(minX, s.pos.x);
    maxX = Math.max(maxX, s.pos.x);
    minZ = Math.min(minZ, s.pos.z);
    maxZ = Math.max(maxZ, s.pos.z);
    minY = Math.min(minY, s.pos.y);
    maxY = Math.max(maxY, s.pos.y);
  }
  return {
    samples,
    checkpoints,
    length: total,
    spacing: step,
    bounds: { minX, maxX, minZ, maxZ, minY, maxY },
    controls,
  };
}

function placeBoosts(samples) {
  const n = samples.length;
  const straights = [];
  let run = 0;
  let start = 0;
  for (let i = 0; i < n; i++) {
    const a = samples[i].tangent;
    const b = samples[(i + 6) % n].tangent;
    const curv = 1 - a.dot(b);
    const nearFinish = i < 18 || i > n - 18;
    if (curv < 0.035 && !nearFinish) {
      if (run === 0) start = i;
      run++;
    } else if (run > 10) {
      straights.push({ start, len: run });
      run = 0;
    } else run = 0;
  }
  if (run > 10) straights.push({ start, len: run });
  if (straights.length < 2) {
    straights.push({ start: Math.floor(n * 0.36), len: 14 });
    straights.push({ start: Math.floor(n * 0.68), len: 14 });
  }
  straights.sort((a, b) => b.len - a.len);
  for (const s of straights.slice(0, 3)) {
    const mid = s.start + Math.floor(s.len * 0.55);
    for (let k = 0; k < 7; k++) samples[(mid + k) % n].boost = true;
  }
}

function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  }
  tex.anisotropy = 16;
  return tex;
}

function asphaltTexture() {
  return canvasTex(1024, 512, (g, w, h) => {
    g.fillStyle = "#101114";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 22000; i++) {
      const v = 12 + Math.random() * 28;
      g.fillStyle = `rgba(${v},${v},${v + 4},${0.18 + Math.random() * 0.22})`;
      g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
    const patches = ["#050506", "#1c1e24", "#2a241c", "#12141a", "#08090c", "#242018"];
    for (let i = 0; i < 22; i++) {
      g.globalAlpha = 0.28 + Math.random() * 0.28;
      g.fillStyle = patches[i % patches.length];
      g.beginPath();
      g.ellipse(Math.random() * w, Math.random() * h, 36 + Math.random() * 140, 16 + Math.random() * 48, Math.random() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    g.strokeStyle = "rgba(18,16,14,0.55)";
    g.lineWidth = 1.4;
    for (let i = 0; i < 16; i++) {
      let x = Math.random() * w;
      let y = Math.random() * h;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 7; k++) {
        x += (Math.random() - 0.5) * 70;
        y += 16 + Math.random() * 36;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    g.fillStyle = "rgba(8,10,14,0.32)";
    for (let i = 0; i < 7; i++) {
      g.beginPath();
      g.ellipse(Math.random() * w, Math.random() * h, 24 + Math.random() * 20, 10, Math.random(), 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = "rgba(12,12,12,0.4)";
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(w * 0.28, 0);
    g.bezierCurveTo(w * 0.3, h * 0.3, w * 0.24, h * 0.6, w * 0.31, h);
    g.moveTo(w * 0.72, 0);
    g.bezierCurveTo(w * 0.68, h * 0.4, w * 0.76, h * 0.7, w * 0.7, h);
    g.stroke();
    g.fillStyle = "rgba(255,248,230,0.05)";
    g.fillRect(w * 0.4, 0, w * 0.18, h);
  });
}

function sidewalkTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#b7b1a6";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2500; i++) {
      const v = 140 + Math.random() * 70;
      g.fillStyle = `rgba(${v},${v - 8},${v - 16},${0.18})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    g.strokeStyle = "rgba(70,64,56,0.45)";
    g.lineWidth = 3;
    for (let y = 0; y < h; y += 64) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
    }
    for (let x = 0; x < w; x += 64) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, h);
      g.stroke();
    }
    g.fillStyle = "rgba(90,70,50,0.18)";
    g.beginPath();
    g.ellipse(80, 160, 40, 18, 0.4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "rgba(40,70,40,0.12)";
    g.fillRect(180, 30, 28, 16);
  });
}

function groundTexture(kind) {
  const sets = {
    city: ["#2a2e36", "#3c414c", "#24362e", "#4a4036", "#1c2430", "#5a5348"],
    harbor: ["#d2b48a", "#c4a574", "#8aa0a8", "#6f9468", "#e4d2b0", "#a89078"],
    alpine: ["#f4f7fb", "#d5e0ea", "#e7eef4", "#c9d4c4", "#f7fbff", "#b9c6d4"],
    desert: ["#e8c27a", "#f3d7a4", "#c98448", "#d9b56a", "#a86b3c", "#f0e0b8"],
  };
  const cols = sets[kind] || sets.city;
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = cols[0];
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 48; i++) {
      g.globalAlpha = 0.3 + Math.random() * 0.45;
      g.fillStyle = cols[i % cols.length];
      g.beginPath();
      g.ellipse(Math.random() * w, Math.random() * h, 24 + Math.random() * 110, 16 + Math.random() * 80, Math.random() * 6, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    for (let i = 0; i < 9000; i++) {
      const v = Math.random() * 255;
      g.fillStyle = `rgba(${v},${v},${v},${Math.random() * 0.07})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    g.strokeStyle = "rgba(0,0,0,0.16)";
    g.lineWidth = 2;
    for (let i = 0; i < 10; i++) {
      g.beginPath();
      g.moveTo(Math.random() * w, Math.random() * h);
      g.quadraticCurveTo(Math.random() * w, Math.random() * h, Math.random() * w, Math.random() * h);
      g.stroke();
    }
  });
}

function rockTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#8d847c";
    g.fillRect(0, 0, w, h);
    const cols = ["#6e6762", "#a39890", "#5c534c", "#b7a89a", "#7a624e", "#c4b8ae"];
    for (let i = 0; i < 40; i++) {
      g.globalAlpha = 0.45;
      g.fillStyle = cols[i % cols.length];
      g.beginPath();
      g.ellipse(Math.random() * w, Math.random() * h, 10 + Math.random() * 40, 8 + Math.random() * 28, Math.random() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    g.strokeStyle = "rgba(40,32,28,0.45)";
    for (let i = 0; i < 18; i++) {
      g.beginPath();
      g.moveTo(Math.random() * w, Math.random() * h);
      g.lineTo(Math.random() * w, Math.random() * h);
      g.stroke();
    }
  }, false);
}

function facadeTexture(p, night) {
  return canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = p.wall;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1600; i++) {
      const v = Math.random() * 50;
      g.fillStyle = `rgba(${v},${v},${v},${0.08 + Math.random() * 0.12})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    g.strokeStyle = p.trim;
    g.globalAlpha = 0.28;
    g.lineWidth = 2;
    for (let y = 8; y < h; y += 22) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
    }
    g.globalAlpha = 1;
    g.fillStyle = p.trim;
    g.fillRect(0, 0, w, 8);
    g.fillRect(0, 0, 5, h);
    g.fillRect(w - 5, 0, 5, h);
    g.fillStyle = p.awning;
    g.fillRect(0, h - 52, w, 10);
    g.fillStyle = p.trim;
    g.fillRect(0, h - 42, w, 42);
    g.fillStyle = night ? "#1a140c" : "#243044";
    g.fillRect(14, h - 34, w - 28, 22);
    g.fillStyle = p.awning;
    g.font = "700 14px sans-serif";
    g.textAlign = "center";
    g.fillText(p.sign, w / 2, h - 18);
    const lits = ["#ffe7a3", "#ffd27a", "#9ad7ff", "#ff8ad4", "#fff6df", "#7ee0c8", "#ffb070"];
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 4; col++) {
        const x = 14 + col * 28;
        const y = 18 + row * 24;
        if (y > h - 64) continue;
        const lit = night ? Math.random() > 0.32 : Math.random() > 0.8;
        g.fillStyle = lit ? lits[(row * 4 + col) % lits.length] : p.win;
        g.fillRect(x, y, 16, 14);
        g.fillStyle = "rgba(255,255,255,0.2)";
        g.fillRect(x, y, 4, 14);
      }
    }
  }, false);
}

function crosswalkTexture() {
  return canvasTex(256, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = "rgba(255,255,255,0.92)";
    for (let x = 6; x < w; x += 28) g.fillRect(x, 4, 16, h - 8);
  }, false);
}

function arrowTexture() {
  return canvasTex(64, 96, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = "#f3e534";
    g.beginPath();
    g.moveTo(w / 2, 8);
    g.lineTo(w - 8, h * 0.55);
    g.lineTo(w * 0.66, h * 0.55);
    g.lineTo(w * 0.66, h - 8);
    g.lineTo(w * 0.34, h - 8);
    g.lineTo(w * 0.34, h * 0.55);
    g.lineTo(8, h * 0.55);
    g.closePath();
    g.fill();
  }, false);
}

function dashTexture() {
  return canvasTex(64, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = "#f2d14a";
    g.fillRect(8, 8, w - 16, 64);
  });
}

function curbTexture() {
  return canvasTex(64, 128, (g, w, h) => {
    for (let y = 0; y < h; y += 16) {
      g.fillStyle = (y / 16) % 2 === 0 ? "#e23b3b" : "#f3f3f3";
      g.fillRect(0, y, w, 16);
    }
  });
}

function checkerTexture() {
  return canvasTex(256, 64, (g, w, h) => {
    const s = 16;
    for (let y = 0; y < h; y += s) {
      for (let x = 0; x < w; x += s) {
        g.fillStyle = ((x + y) / s) % 2 === 0 ? "#111" : "#f5f5f5";
        g.fillRect(x, y, s, s);
      }
    }
  }, false);
}

function bannerTexture() {
  return canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = "#12141c";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#f2e435";
    g.fillRect(0, 0, w, 8);
    g.fillRect(0, h - 8, w, 8);
    g.fillStyle = "#ffffff";
    g.font = "700 64px sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("NITRO RUSH", w / 2, h / 2 + 2);
  }, false);
}

function windowTexture(dark = true) {
  return canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = dark ? "#161824" : "#6d5a48";
    g.fillRect(0, 0, w, h);
    for (let y = 10; y < h; y += 20) {
      for (let x = 8; x < w; x += 16) {
        const lit = Math.random() > (dark ? 0.38 : 0.75);
        g.fillStyle = lit ? (Math.random() > 0.55 ? "#ffe08a" : "#7ee7ff") : dark ? "#2a3144" : "#8a7560";
        g.fillRect(x, y, 8, 12);
      }
    }
  }, false);
}

function signTexture(text, bg, fg) {
  return canvasTex(256, 96, (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = fg;
    g.font = "700 54px sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, w / 2, h / 2 + 2);
  }, false);
}

function buildRibbon(samples, half, yLift, material, inset = 0) {
  const n = samples.length;
  const positions = new Float32Array(n * 2 * 3);
  const uvs = new Float32Array(n * 2 * 2);
  const indices = [];
  for (let i = 0; i < n; i++) {
    const s = samples[i];
    const hw = half - inset;
    const y = s.pos.y + yLift;
    const bank = s.bank || 0;
    const lx = s.pos.x - s.right.x * hw;
    const lz = s.pos.z - s.right.z * hw;
    const rx = s.pos.x + s.right.x * hw;
    const rz = s.pos.z + s.right.z * hw;
    const o = i * 6;
    positions[o] = lx;
    positions[o + 1] = y - bank * hw;
    positions[o + 2] = lz;
    positions[o + 3] = rx;
    positions[o + 4] = y + bank * hw;
    positions[o + 5] = rz;
    const v = s.dist * 0.05;
    uvs[i * 4] = 0;
    uvs[i * 4 + 1] = v;
    uvs[i * 4 + 2] = 1;
    uvs[i * 4 + 3] = v;
  }
  for (let i = 0; i < n; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = ((i + 1) % n) * 2;
    const d = c + 1;
    indices.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  return mesh;
}

function edgeRibbon(samples, inner, outer, yLift, material) {
  const n = samples.length;
  const positions = new Float32Array(n * 4 * 3);
  const uvs = new Float32Array(n * 4 * 2);
  const indices = [];
  for (let i = 0; i < n; i++) {
    const s = samples[i];
      const y = s.pos.y + yLift;
      const bank = s.bank || 0;
      const sides = [-1, 1];
      for (let k = 0; k < 2; k++) {
        const sign = sides[k];
        const base = (i * 2 + k) * 2;
        const i0 = sign * inner;
        const i1 = sign * outer;
        positions[base * 3] = s.pos.x + s.right.x * i0;
        positions[base * 3 + 1] = y + bank * i0;
        positions[base * 3 + 2] = s.pos.z + s.right.z * i0;
        positions[(base + 1) * 3] = s.pos.x + s.right.x * i1;
        positions[(base + 1) * 3 + 1] = y + bank * i1;
        positions[(base + 1) * 3 + 2] = s.pos.z + s.right.z * i1;
      const v = s.dist * 0.18;
      uvs[base * 2] = 0;
      uvs[base * 2 + 1] = v;
      uvs[(base + 1) * 2] = 1;
      uvs[(base + 1) * 2 + 1] = v;
    }
  }
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 2; k++) {
      const a = (i * 2 + k) * 2;
      const b = a + 1;
      const c = (((i + 1) % n) * 2 + k) * 2;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  return mesh;
}

export function createSky(colors) {
  const uniforms = {
    top: { value: new THREE.Color(colors.top) },
    mid: { value: new THREE.Color(colors.mid) },
    bottom: { value: new THREE.Color(colors.bottom) },
    sunDir: { value: new THREE.Vector3(...(colors.sunDir || [0.35, 0.25, -0.4])).normalize() },
    sunColor: { value: new THREE.Color(colors.sun || "#ffb15e") },
  };
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    fog: false,
    uniforms,
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: `
      varying vec3 vWorld;
      uniform vec3 top, mid, bottom, sunDir, sunColor;
      void main() {
        vec3 n = normalize(vWorld);
        float h = clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 col = mix(bottom, mid, smoothstep(0.02, 0.55, h));
        col = mix(col, top, smoothstep(0.42, 1.0, h));
        float sun = pow(max(dot(n, normalize(sunDir)), 0.0), 90.0);
        float glow = pow(max(dot(n, normalize(sunDir)), 0.0), 8.0);
        col += sunColor * sun * 0.9;
        col += sunColor * glow * 0.16;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(5200, 48, 32), mat);
  return { mesh, uniforms };
}

function addBarriers(group, samples) {
  const n = samples.length;
  const geo = new THREE.BoxGeometry(0.42, 0.85, 2.45);
  const mat = new THREE.MeshStandardMaterial({ color: 0xcfd5de, roughness: 0.72, metalness: 0.08 });
  const stripe = new THREE.MeshStandardMaterial({ color: 0xf2e435, roughness: 0.5, metalness: 0.1 });
  const mesh = new THREE.InstancedMesh(geo, mat, n * 2);
  const stripeMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.44, 0.12, 2.45), stripe, n * 2);
  const dummy = new THREE.Object3D();
  let k = 0;
  for (let i = 0; i < n; i += 3) {
    const s = samples[i];
    for (const side of [-1, 1]) {
      const p = s.pos.clone().addScaledVector(s.right, side * (s.width * 0.5 + 1.05));
      p.y += 0.32;
      dummy.position.copy(p);
      dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), s.tangent);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(k, dummy.matrix);
      p.y += 0.28;
      dummy.position.copy(p);
      dummy.updateMatrix();
      stripeMesh.setMatrixAt(k, dummy.matrix);
      k++;
    }
  }
  mesh.count = k;
  stripeMesh.count = k;
  mesh.receiveShadow = true;
  group.add(mesh, stripeMesh);
}

function addChevrons(group, samples) {
  const mat = new THREE.MeshBasicMaterial({ color: 0xf2e435 });
  const geo = new THREE.ConeGeometry(0.55, 1.35, 4);
  geo.translate(0, 0.72, 0);
  for (const idx of [8, 14, 20, 26]) {
    if (!samples[idx]) continue;
    const s = samples[idx];
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(s.pos).add(new THREE.Vector3(0, 0.08, 0));
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), s.tangent);
    group.add(m);
  }
}

function addGantry(group, samples) {
  const s = samples[0];
  const hw = s.width * 0.5 + 0.2;
  const concrete = new THREE.MeshStandardMaterial({ color: 0x9aa3b2, roughness: 0.7 });
  const lights = [];
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.55, 5.2, 0.55), concrete);
    pillar.position.copy(s.pos).addScaledVector(s.right, side * hw);
    pillar.position.y += 2.6;
    pillar.castShadow = true;
    group.add(pillar);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 0.8, 0.42, 0.7), concrete);
  beam.position.copy(s.pos);
  beam.position.y += 5.05;
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), s.right);
  group.add(beam);
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(hw * 1.5, hw * 0.38),
    new THREE.MeshBasicMaterial({ map: bannerTexture() })
  );
  banner.position.copy(s.pos).add(new THREE.Vector3(0, 4.35, 0));
  const out = s.tangent.clone();
  banner.lookAt(banner.position.clone().add(out));
  group.add(banner);
  for (let i = -1; i <= 1; i++) {
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff1a1a, emissiveIntensity: 0.2 })
    );
    lamp.position.copy(s.pos).addScaledVector(s.right, i * 1.3);
    lamp.position.y += 4.7;
    group.add(lamp);
    lights.push(lamp);
  }
  const checker = new THREE.Mesh(
    new THREE.PlaneGeometry(s.width * 0.92, 2.4),
    new THREE.MeshBasicMaterial({ map: checkerTexture() })
  );
  checker.rotation.x = -Math.PI / 2;
  checker.position.copy(s.pos);
  checker.position.y += 0.05;
  checker.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(s.right.x, s.right.z)));
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), s.tangent);
  checker.quaternion.copy(q);
  checker.rotateX(-Math.PI / 2);
  group.add(checker);
  return lights;
}

function addBoostPads(group, samples) {
  const mat = new THREE.MeshBasicMaterial({ color: 0x29e1ff, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
  const geo = new THREE.PlaneGeometry(1, 1);
  for (let i = 0; i < samples.length; i++) {
    if (!samples[i].boost) continue;
    const s = samples[i];
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(s.pos);
    m.position.y += 0.06;
    m.scale.set(s.width * 0.42, 2.1, 1);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), s.tangent);
    m.quaternion.copy(q);
    m.rotateX(-Math.PI / 2);
    group.add(m);
  }
}

function scatterOutside(samples, every, minOut, extra, fn) {
  const n = samples.length;
  for (let i = 6; i < n - 6; i += every) {
    const s = samples[i];
    const side = i % (every * 2) < every ? 1 : -1;
    const dist = s.width * 0.5 + minOut + Math.random() * extra;
    const p = s.pos.clone().addScaledVector(s.right, side * dist);
    p.y = s.pos.y;
    fn(p, s, i, side);
  }
}

function hash01(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function nearestSample(samples, x, z) {
  let best = samples[0];
  let bestD = Infinity;
  const step = Math.max(1, Math.floor(samples.length / 240));
  let bestI = 0;
  for (let i = 0; i < samples.length; i += step) {
    const dx = samples[i].pos.x - x;
    const dz = samples[i].pos.z - z;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = samples[i];
      bestI = i;
    }
  }
  const n = samples.length;
  for (let i = bestI - step - 2; i <= bestI + step + 2; i++) {
    const s = samples[(i + n) % n];
    const dx = s.pos.x - x;
    const dz = s.pos.z - z;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return { s: best, dist: Math.sqrt(bestD) };
}

function addGround(group, kind, y) {
  const tex = groundTexture(kind);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(kind === "city" ? 28 : 22, kind === "city" ? 28 : 22);
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(2800, 64),
    new THREE.MeshStandardMaterial({ map: tex, color: 0xffffff, roughness: 0.96, metalness: 0.02 })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  mesh.receiveShadow = true;
  group.add(mesh);
}

const FACADES = {
  neon: [
    { wall: "#2a3148", trim: "#d7deea", win: "#141820", awning: "#22e4ff", sign: "METRO" },
    { wall: "#5b2d6e", trim: "#f3e534", win: "#120818", awning: "#ff2bd6", sign: "NEON" },
    { wall: "#1d3b4a", trim: "#9ad7ff", win: "#0c141c", awning: "#7ee0c8", sign: "RUSH" },
    { wall: "#3a2a28", trim: "#e7c8a8", win: "#16120e", awning: "#ff7a3c", sign: "BAR" },
    { wall: "#243044", trim: "#f4f1ea", win: "#10141c", awning: "#f3e534", sign: "NITRO" },
    { wall: "#16342e", trim: "#d7efe4", win: "#0c1614", awning: "#35e1ff", sign: "24H" },
  ],
  harbor: [
    { wall: "#c4554a", trim: "#f2e2c4", win: "#243044", awning: "#1d6ea8", sign: "KAJ" },
    { wall: "#e7d3b0", trim: "#8a5a3a", win: "#2a3344", awning: "#e23b3b", sign: "FISK" },
    { wall: "#6d7c8a", trim: "#e8eef2", win: "#1c2430", awning: "#f3e534", sign: "DOCK" },
    { wall: "#c47a45", trim: "#fff1dc", win: "#2a241c", awning: "#2f6f5e", sign: "CAFE" },
    { wall: "#8e3d55", trim: "#f6e4ea", win: "#241820", awning: "#f0c14a", sign: "BAR" },
  ],
  desert: [
    { wall: "#e7c9a0", trim: "#8a5a3a", win: "#3a2c22", awning: "#c23b3b", sign: "SOUK" },
    { wall: "#d9895b", trim: "#fff1dc", win: "#3a2418", awning: "#1d6ea8", sign: "TE" },
    { wall: "#f0e0c0", trim: "#a8683a", win: "#2a241c", awning: "#2f6f5e", sign: "HOTEL" },
    { wall: "#c47a45", trim: "#f6e4c8", win: "#2c2018", awning: "#f3e534", sign: "BENZIN" },
    { wall: "#a85b48", trim: "#f2d7c4", win: "#241810", awning: "#7c3aed", sign: "MARKED" },
  ],
};

function fillDistrict(group, samples, opts) {
  const { roadHalf, near = 8, far = 36, palettes, night = false, minH = 7, maxH = 24, wide = false, cell = 26 } = opts;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const s of samples) {
    minX = Math.min(minX, s.pos.x);
    maxX = Math.max(maxX, s.pos.x);
    minZ = Math.min(minZ, s.pos.z);
    maxZ = Math.max(maxZ, s.pos.z);
  }
  minX -= 8;
  maxX += 8;
  minZ -= 8;
  maxZ += 8;
  const textures = palettes.map((p) => facadeTexture(p, night));
  const mats = textures.map((tex) => new THREE.MeshStandardMaterial({
    map: tex,
    color: 0xffffff,
    roughness: 0.74,
    metalness: 0.05,
    emissive: night ? 0xfff2dd : 0x000000,
    emissiveMap: night ? tex : null,
    emissiveIntensity: night ? 0.38 : 0,
  }));
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const spots = [];
  let idx = 0;
  for (let x = minX; x <= maxX; x += cell) {
    for (let z = minZ; z <= maxZ; z += cell) {
      idx++;
      const px = x + (hash01(idx) - 0.5) * 5;
      const pz = z + (hash01(idx + 9) - 0.5) * 5;
      const hit = nearestSample(samples, px, pz);
      const gap = hit.dist - roadHalf;
      if (gap < near || gap > far) continue;
      if (hash01(idx + 4) > 0.86) continue;
      const slot = Math.floor(hash01(idx + 3) * mats.length);
      const h = minH + hash01(idx + 7) * (maxH - minH);
      const bw = (wide ? 11 : 8) + hash01(idx + 11) * (wide ? 7 : 4);
      const bd = (wide ? 8 : 7) + hash01(idx + 13) * 4;
      spots.push({
        slot,
        px,
        pz,
        h,
        bw,
        bd,
        yaw: Math.atan2(hit.s.tangent.x, hit.s.tangent.z) + (hash01(idx + 2) > 0.5 ? 0 : Math.PI / 2),
        y: hit.s.pos.y,
      });
    }
  }
  const counts = mats.map(() => 0);
  spots.forEach((s) => counts[s.slot]++);
  const meshes = mats.map((mat, i) => (counts[i] ? new THREE.InstancedMesh(geo, mat, counts[i]) : null));
  const cursor = mats.map(() => 0);
  const dummy = new THREE.Object3D();
  for (const spot of spots) {
    const mesh = meshes[spot.slot];
    if (!mesh) continue;
    const k = cursor[spot.slot]++;
    dummy.position.set(spot.px, spot.y + spot.h / 2, spot.pz);
    dummy.scale.set(spot.bw, spot.h, spot.bd);
    dummy.rotation.set(0, spot.yaw, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(k, dummy.matrix);
  }
  meshes.forEach((m) => {
    if (!m) return;
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  });
}

function addStreetLife(group, samples, theme) {
  const colors = [0xc23b3b, 0x2f6fed, 0xf4f4f4, 0x1c1c1c, 0xe7b23c, 0x3aa76d, 0x7c3aed, 0xd9783a];
  const geo = new THREE.BoxGeometry(1.55, 0.48, 3.2);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0.25 });
  const n = Math.min(70, Math.floor(samples.length / 12));
  const cars = new THREE.InstancedMesh(geo, mat, n);
  const dummy = new THREE.Object3D();
  let k = 0;
  for (let i = 14; i < samples.length - 8 && k < n; i += 15) {
    const s = samples[i];
    const ahead = samples[(i + 6) % samples.length];
    if (1 - s.tangent.dot(ahead.tangent) > 0.12) continue;
    const side = k % 2 === 0 ? 1 : -1;
    dummy.position.copy(s.pos).addScaledVector(s.right, side * (s.width * 0.5 + 3.3));
    dummy.position.y += 0.34;
    dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), s.tangent);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    cars.setMatrixAt(k, dummy.matrix);
    cars.setColorAt(k, new THREE.Color(colors[k % colors.length]));
    k++;
  }
  cars.count = k;
  cars.castShadow = true;
  group.add(cars);

  if (theme === "neon" || theme === "harbor") {
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2e36, metalness: 0.55, roughness: 0.4 });
    const glow = new THREE.MeshBasicMaterial({ color: theme === "neon" ? 0x22e4ff : 0xffc56a });
    scatterOutside(samples, theme === "neon" ? 8 : 11, 2.6, 0.3, (p) => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 4.2, 6), poleMat);
      pole.position.copy(p);
      pole.position.y += 2.1;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), glow);
      bulb.position.copy(p);
      bulb.position.y += 4.3;
      group.add(pole, bulb);
    });
  }
}

function addStreetMarkings(group, samples) {
  const crossMat = new THREE.MeshBasicMaterial({ map: crosswalkTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const arrowMat = new THREE.MeshBasicMaterial({ map: arrowTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const n = samples.length;
  for (let i = 8; i < n; i += 16) {
    const s = samples[i];
    const ahead = samples[(i + 7) % n];
    const curv = 1 - s.tangent.dot(ahead.tangent);
    if (curv > 0.16) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(s.width * 0.82, 3.4), crossMat);
      m.position.copy(s.pos);
      m.position.y += 0.05;
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), s.tangent);
      m.quaternion.copy(q);
      m.rotateX(-Math.PI / 2);
      group.add(m);
    }
    const a = samples[(i + 5) % n];
    const arrow = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 2.6), arrowMat);
    arrow.position.copy(a.pos);
    arrow.position.y += 0.055;
    const q2 = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), a.tangent);
    arrow.quaternion.copy(q2);
    arrow.rotateX(-Math.PI / 2);
    group.add(arrow);
  }
}

function themeHarbor(group, samples) {
  const waterUniforms = { uTime: { value: 0 } };
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(3200, 3200, 40, 40),
    new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        uTime: waterUniforms.uTime,
        uColor: { value: new THREE.Color("#2f8ec4") },
        uDeep: { value: new THREE.Color("#0c4e78") },
        uFoam: { value: new THREE.Color("#d7f3ff") },
      },
      vertexShader: `
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec3 p = position;
          p.z += sin(position.x * 0.05 + uTime * 1.1) * 0.35;
          p.z += cos(position.y * 0.04 + uTime * 0.8) * 0.22;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform vec3 uColor, uDeep, uFoam;
        uniform float uTime;
        void main() {
          float w = sin(vUv.x * 46.0 + uTime) * sin(vUv.y * 32.0 - uTime * 0.7);
          float rip = sin(vUv.x * 120.0 + vUv.y * 80.0 + uTime * 1.4);
          vec3 col = mix(uDeep, uColor, 0.35 + 0.55 * w);
          col = mix(col, uFoam, smoothstep(0.72, 1.0, rip) * 0.18);
          gl_FragColor = vec4(col, 0.92);
        }
      `,
    })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = -3.2;
  group.add(water);
  addGround(group, "harbor", -0.22);

  fillDistrict(group, samples, {
    roadHalf: samples[0].width * 0.5,
    near: 3.4,
    far: 22,
    palettes: FACADES.harbor,
    minH: 6,
    maxH: 16,
    wide: true,
    cell: 20,
  });

  const boxColors = [0xc23b3b, 0x1d6ea8, 0xf3e534, 0x2f6f5e, 0xe7e2d8, 0xd9783a];
  const boxGeo = new THREE.BoxGeometry(2.2, 1.1, 1.1);
  const boxMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.15 });
  const boxes = new THREE.InstancedMesh(boxGeo, boxMat, 48);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 48; i++) {
    const s = samples[(i * 13 + 20) % samples.length];
    const side = i % 2 === 0 ? 1 : -1;
    dummy.position.copy(s.pos).addScaledVector(s.right, side * (s.width * 0.5 + 6 + (i % 3)));
    dummy.position.y += 0.55 + (i % 3) * 0.35;
    dummy.rotation.y = Math.atan2(s.tangent.x, s.tangent.z);
    dummy.updateMatrix();
    boxes.setMatrixAt(i, dummy.matrix);
    boxes.setColorAt(i, new THREE.Color(boxColors[i % boxColors.length]));
  }
  boxes.castShadow = true;
  group.add(boxes);

  const palmMat = new THREE.MeshStandardMaterial({ color: 0x2f9d4f, roughness: 0.7 });
  const palmMat2 = new THREE.MeshStandardMaterial({ color: 0x3caf62, roughness: 0.7 });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.9 });
  scatterOutside(samples, 14, 10, 8, (p, _s, i) => {
    const palm = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 2.8, 6), trunkMat);
    trunk.position.y = 1.4;
    palm.add(trunk);
    const leaf = i % 2 === 0 ? palmMat : palmMat2;
    for (let k = 0; k < 6; k++) {
      const pivot = new THREE.Group();
      pivot.position.y = 2.7;
      pivot.rotation.y = (k / 6) * Math.PI * 2;
      const frond = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 1.5), leaf);
      frond.position.z = 0.65;
      frond.rotation.x = 0.5;
      pivot.add(frond);
      palm.add(pivot);
    }
    palm.position.copy(p);
    group.add(palm);
  });

  const boatColors = [0xf4f7fb, 0xc23b3b, 0x1d6ea8, 0xf3e534, 0x243044];
  for (let i = 0; i < 6; i++) {
    const boat = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 0.7, 1.35),
      new THREE.MeshStandardMaterial({ color: boatColors[i % boatColors.length], roughness: 0.45 })
    );
    const ang = (i / 6) * Math.PI * 2;
    boat.position.set(Math.cos(ang) * 280, -2.6, Math.sin(ang) * 220);
    boat.rotation.y = ang;
    group.add(boat);
  }
  return { waterUniforms };
}

function lineTowers(group, samples, opts) {
  const { offset = 22, every = 16, minH = 48, maxH = 90, palettes, night = true, width = 12 } = opts;
  const textures = palettes.map((p) => facadeTexture(p, night));
  const mats = textures.map((tex) => new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.48,
    metalness: 0.18,
    emissive: night ? 0xfff1d0 : 0x000000,
    emissiveMap: night ? tex : null,
    emissiveIntensity: night ? 0.62 : 0,
  }));
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const antenna = new THREE.MeshStandardMaterial({ color: 0x22e4ff, emissive: 0x22e4ff, emissiveIntensity: 2 });
  const spots = [];
  for (let i = 10; i < samples.length; i += every) {
    const s = samples[i];
    const ahead = samples[(i + 8) % samples.length];
    if (1 - s.tangent.dot(ahead.tangent) > 0.16) continue;
    for (const side of [-1, 1]) {
      const h = minH + ((i * 13 + (side > 0 ? 7 : 0)) % 97) / 97 * (maxH - minH);
      spots.push({
        slot: Math.abs(i + side * 3) % mats.length,
        x: s.pos.x + s.right.x * side * offset,
        z: s.pos.z + s.right.z * side * offset,
        y: s.pos.y,
        h,
        bw: width + (i % 5) * 1.4,
        bd: width * 0.82 + (i % 4) * 1.6,
        yaw: Math.atan2(s.tangent.x, s.tangent.z),
      });
    }
  }
  const counts = mats.map(() => 0);
  spots.forEach((s) => counts[s.slot]++);
  const meshes = mats.map((mat, i) => (counts[i] ? new THREE.InstancedMesh(geo, mat, counts[i]) : null));
  const cursor = mats.map(() => 0);
  const dummy = new THREE.Object3D();
  spots.forEach((spot) => {
    const mesh = meshes[spot.slot];
    if (!mesh) return;
    dummy.position.set(spot.x, spot.y + spot.h / 2, spot.z);
    dummy.scale.set(spot.bw, spot.h, spot.bd);
    dummy.rotation.set(0, spot.yaw, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(cursor[spot.slot]++, dummy.matrix);
    if ((cursor[spot.slot] + spot.slot) % 8 === 0) {
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.4, 6, 0.4), antenna);
      tip.position.set(spot.x, spot.y + spot.h + 3, spot.z);
      group.add(tip);
    }
  });
  meshes.forEach((m) => {
    if (!m) return;
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  });
}

function themeNeon(group, samples) {
  addGround(group, "city", -0.28);
  fillDistrict(group, samples, {
    roadHalf: samples[0].width * 0.5,
    near: 6,
    far: 28,
    palettes: FACADES.neon,
    night: true,
    minH: 22,
    maxH: 48,
    cell: 22,
  });
  lineTowers(group, samples, {
    offset: 24,
    every: 14,
    minH: 46,
    maxH: 78,
    palettes: FACADES.neon,
    night: true,
    width: 11,
  });
  lineTowers(group, samples, {
    offset: 42,
    every: 18,
    minH: 90,
    maxH: 150,
    palettes: FACADES.neon,
    night: true,
    width: 14,
  });
  const signs = [
    ["NITRO", "#ff2bd6", "#fff"],
    ["DRIFT", "#12121a", "#22e4ff"],
    ["METRO", "#7c3aed", "#fff"],
    ["RUSH", "#f2e435", "#161616"],
    ["BYEN", "#ff4d2e", "#fff"],
    ["OPEN", "#35e1ff", "#071018"],
  ];
  let si = 0;
  scatterOutside(samples, 20, 7, 2, (p, s) => {
    const spec = signs[si % signs.length];
    si++;
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(4.4, 1.6),
      new THREE.MeshBasicMaterial({ map: signTexture(spec[0], spec[1], spec[2]) })
    );
    sign.position.copy(p);
    sign.position.y += 4.2;
    sign.lookAt(s.pos.x, sign.position.y, s.pos.z);
    group.add(sign);
  });
  return {};
}

function themeAlpine(group, samples, bounds) {
  addGround(group, "alpine", bounds.minY - 8);
  const rockMap = rockTexture();
  const rockMat = new THREE.MeshStandardMaterial({ map: rockMap, color: 0xffffff, roughness: 0.92 });
  const snowMat = new THREE.MeshStandardMaterial({ color: 0xf7fbff, roughness: 0.72, map: groundTexture("alpine") });
  const shelf = buildRibbon(samples, 78, -0.55, snowMat);
  shelf.receiveShadow = true;
  group.add(shelf);
  let peak = samples[0];
  for (const s of samples) if (s.pos.y > peak.pos.y) peak = s;
  const summitH = Math.max(160, peak.pos.y * 0.9);
  const summit = new THREE.Mesh(new THREE.ConeGeometry(260, summitH, 8), snowMat);
  summit.position.set(peak.pos.x + peak.right.x * 210, peak.pos.y - summitH * 0.22, peak.pos.z + peak.right.z * 210);
  summit.castShadow = true;
  group.add(summit);
  const ridge = new THREE.Mesh(new THREE.ConeGeometry(140, summitH * 0.72, 7), rockMat);
  ridge.position.set(peak.pos.x - peak.right.x * 240, peak.pos.y - summitH * 0.2, peak.pos.z - peak.right.z * 240);
  group.add(ridge);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(70, summitH * 0.28, 7), snowMat);
  cap.position.set(summit.position.x, summit.position.y + summitH * 0.34, summit.position.z);
  group.add(cap);
  const ridgeColors = [0x8e98a3, 0x6e7c88, 0xa7b0ba, 0x7d6a5c];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.2;
    const r = 1500 + (i % 4) * 180;
    const h = 90 + (i % 4) * 36;
    const m = new THREE.Mesh(new THREE.ConeGeometry(30 + (i % 3) * 7, h, 7), rockMat);
    m.position.set(Math.cos(a) * r, bounds.minY + h / 2 - 10, Math.sin(a) * r);
    group.add(m);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(15, h * 0.36, 7), snowMat);
    cap.position.set(m.position.x, m.position.y + h * 0.3, m.position.z);
    group.add(cap);
    const boulder = new THREE.Mesh(new THREE.DodecahedronGeometry(6 + (i % 3) * 2, 0), new THREE.MeshStandardMaterial({ color: ridgeColors[i % ridgeColors.length], roughness: 0.9, map: rockMap }));
    boulder.position.set(Math.cos(a + 0.3) * (r - 40), bounds.minY + 2, Math.sin(a + 0.3) * (r - 40));
    group.add(boulder);
  }

  const trunkColors = [0x6b442c, 0x8a5a32, 0x4e3420];
  const leafColors = [0x1f6b3a, 0x2f8f4a, 0x1a4e32, 0x3c6b32];
  scatterOutside(samples, 5, 6, 14, (p, _s, i) => {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.28, 1.6, 6),
      new THREE.MeshStandardMaterial({ color: trunkColors[i % trunkColors.length], roughness: 0.9 })
    );
    trunk.position.y = 0.8;
    const leaf = new THREE.Mesh(
      new THREE.ConeGeometry(0.85 + (i % 3) * 0.15, 2.3, 6),
      new THREE.MeshStandardMaterial({ color: leafColors[i % leafColors.length], roughness: 0.8 })
    );
    leaf.position.y = 2.3;
    tree.add(trunk, leaf);
    tree.position.copy(p);
    tree.scale.setScalar(0.85 + (i % 5) * 0.12);
    group.add(tree);
  });

  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 36);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 36; i++) {
    const s = samples[(i * 17) % samples.length];
    const side = i % 2 === 0 ? 1 : -1;
    dummy.position.copy(s.pos).addScaledVector(s.right, side * (s.width * 0.5 + 3.5 + (i % 4)));
    dummy.position.y += 0.4;
    dummy.scale.set(0.7 + (i % 5) * 0.25, 0.45 + (i % 3) * 0.2, 0.7 + (i % 4) * 0.2);
    dummy.rotation.set(i, i * 0.7, i * 0.2);
    dummy.updateMatrix();
    rocks.setMatrixAt(i, dummy.matrix);
  }
  group.add(rocks);
  return {};
}

function themeDesert(group, samples, bounds) {
  addGround(group, "desert", -0.35);
  fillDistrict(group, samples, {
    roadHalf: samples[0].width * 0.5,
    near: 3.6,
    far: 22,
    palettes: FACADES.desert,
    minH: 5,
    maxH: 13,
    wide: true,
    cell: 20,
  });
  const rockMap = rockTexture();
  const rockMat = new THREE.MeshStandardMaterial({ map: rockMap, color: 0xd08958, roughness: 0.92 });
  const mesaColors = [0xc47a45, 0xb5653a, 0xd9a066, 0x8d5a3c];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.35;
    const mesa = new THREE.Mesh(
      new THREE.CylinderGeometry(12, 18, 16 + (i % 3) * 7, 6),
      new THREE.MeshStandardMaterial({ map: rockMap, color: mesaColors[i % mesaColors.length], roughness: 0.9 })
    );
    mesa.position.set(Math.cos(a) * 340, 5, Math.sin(a) * 260);
    group.add(mesa);
  }
  const duneColors = [0xefc56d, 0xf0d7a0, 0xd7a85a, 0xe8b86a];
  const duneMap = groundTexture("desert");
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const dune = new THREE.Mesh(
      new THREE.SphereGeometry(18, 12, 8),
      new THREE.MeshStandardMaterial({ color: duneColors[i % duneColors.length], roughness: 1, map: duneMap })
    );
    dune.scale.y = 0.26;
    dune.position.set(Math.cos(a) * (210 + (i % 4) * 22), -1.2, Math.sin(a) * (170 + (i % 3) * 18));
    group.add(dune);
  }
  const cacColors = [0x3f8f45, 0x2f6f3a, 0x5aa15a];
  scatterOutside(samples, 13, 8, 12, (p, _s, i) => {
    const cac = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: cacColors[i % cacColors.length], roughness: 0.75 });
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 2.2 + (i % 3) * 0.4, 7), mat);
    stem.position.y = 1.2;
    cac.add(stem);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.9, 6), mat);
    arm.position.set(0.45, 1.5, 0);
    arm.rotation.z = Math.PI / 2.4;
    cac.add(arm);
    cac.position.copy(p);
    group.add(cac);
  });
  return { bounds };
}

const THEMES = {
  harbor: {
    sky: { top: "#3a4fbe", mid: "#ff7a45", bottom: "#ffc08a", sun: "#ffd2a0", sunDir: [0.55, 0.18, -0.35] },
    fog: "#ffb07a",
    fogNear: 120,
    fogFar: 720,
    hemi: ["#ffd0a8", "#3a6ea5", 0.75],
    sun: { color: "#ffd2a2", intensity: 2.6, pos: [80, 50, -30] },
    road: { color: 0xffffff, roughness: 0.82, metalness: 0.04 },
  },
  neon: {
    sky: { top: "#07081a", mid: "#24124a", bottom: "#0b1024", sun: "#7a4cff", sunDir: [-0.2, 0.4, 0.3] },
    fog: "#120a22",
    fogNear: 110,
    fogFar: 700,
    hemi: ["#8d7cff", "#1a1020", 0.72],
    sun: { color: "#c9d4ff", intensity: 1.35, pos: [-40, 70, 20] },
    road: { color: 0xd5deee, roughness: 0.62, metalness: 0.18 },
  },
  alpine: {
    sky: { top: "#6ea8ef", mid: "#d5e7f8", bottom: "#eef3f7", sun: "#fff6e4", sunDir: [0.2, 0.55, 0.3] },
    fog: "#d5e4f2",
    fogNear: 70,
    fogFar: 640,
    hemi: ["#d7ecff", "#b7c4a4", 0.7],
    sun: { color: "#fff4dd", intensity: 2.3, pos: [40, 80, 30] },
    road: { color: 0xe7eef5, roughness: 0.78, metalness: 0.04 },
  },
  desert: {
    sky: { top: "#4aa3e8", mid: "#f2c27a", bottom: "#f6d7a2", sun: "#fff1c4", sunDir: [0.15, 0.72, 0.2] },
    fog: "#f0c98a",
    fogNear: 100,
    fogFar: 700,
    hemi: ["#ffe0b0", "#c48a4a", 0.65],
    sun: { color: "#fff0cc", intensity: 2.8, pos: [20, 90, 10] },
    road: { color: 0xf0e2c8, roughness: 0.8, metalness: 0.04 },
  },
  coast: {
    sky: { top: "#8ec8ff", mid: "#f7e7c4", bottom: "#ffe9c2", sun: "#fff6df", sunDir: [0.2, 0.72, 0.25] },
    fog: "#d7e8f6",
    fogNear: 140,
    fogFar: 560,
    hemi: ["#e7f4ff", "#c8b48a", 0.7],
    sun: { color: "#fff4dd", intensity: 2.4, pos: [50, 80, 20] },
    road: { color: 0xd5dde6, roughness: 0.76, metalness: 0.05 },
  },
  industrial: {
    sky: { top: "#6a7f98", mid: "#c9a27a", bottom: "#e7c9a0", sun: "#ffe0b8", sunDir: [0.1, 0.55, 0.3] },
    fog: "#cbb59a",
    fogNear: 120,
    fogFar: 520,
    hemi: ["#f0e2cf", "#8a6a4a", 0.6],
    sun: { color: "#ffe6c4", intensity: 2.1, pos: [30, 70, 10] },
    road: { color: 0x8d8680, roughness: 0.84, metalness: 0.08 },
  },
  forest: {
    sky: { top: "#7ec0ea", mid: "#d7e7c8", bottom: "#c9d8b0", sun: "#fff6df", sunDir: [0.25, 0.7, 0.15] },
    fog: "#d5e4c8",
    fogNear: 110,
    fogFar: 500,
    hemi: ["#eef6e4", "#6d8a55", 0.65],
    sun: { color: "#fff4dd", intensity: 2.2, pos: [40, 80, 20] },
    road: { color: 0x6e756c, roughness: 0.82, metalness: 0.04 },
  },
};

function hazardTexture() {
  return canvasTex(128, 64, (g, w, h) => {
    g.fillStyle = "#111";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#f3e534";
    for (let x = -h; x < w + h; x += 18) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + h, h);
      g.lineTo(x + h + 10, h);
      g.lineTo(x + 10, 0);
      g.fill();
    }
  });
}

function orient(mesh, sample) {
  const up = new THREE.Vector3(0, 1, 0);
  mesh.setRotationFromMatrix(new THREE.Matrix4().makeBasis(sample.right, up, sample.tangent));
}

function addRoadObstacles(group, samples, kind) {
  const obstacles = [];
  const n = samples.length;
  const step = kind === "ice" ? 86 : 72;
  const rock = rockTexture();
  const snow = new THREE.MeshStandardMaterial({ color: 0xf4f8ff, roughness: 0.62, metalness: 0.04 });
  const ice = new THREE.MeshStandardMaterial({ color: 0xb9e7ff, roughness: 0.18, metalness: 0.35, transparent: true, opacity: 0.82 });
  const hazard = new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.45 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1e27, roughness: 0.55, metalness: 0.35 });
  for (let i = 64; i < n - 90; i += step) {
    const s = samples[i];
    const ahead = samples[(i + 10) % n];
    if (1 - s.tangent.dot(ahead.tangent) > 0.07) continue;
    const side = obstacles.length % 2 === 0 ? 1 : -1;
    const intrude = kind === "ice" ? 8.2 : 7.4;
    const depth = kind === "ice" ? 16 : 10;
    const along = kind === "ice" ? 18 : 11;
    const edge = s.width * 0.5;
    const centerLat = side * (edge + depth * 0.5 - intrude);
    const pos = s.pos.clone().addScaledVector(s.right, centerLat);
    pos.y = s.pos.y;
    if (kind === "ice") {
      const h = 15 + (obstacles.length % 3) * 3.5;
      const spur = new THREE.Mesh(new THREE.ConeGeometry(depth * 0.62, h, 7), new THREE.MeshStandardMaterial({ map: rock, color: 0xd5dde6, roughness: 0.88 }));
      spur.position.copy(pos);
      spur.position.y += h * 0.42;
      orient(spur, s);
      spur.castShadow = true;
      spur.receiveShadow = true;
      group.add(spur);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(depth * 0.34, h * 0.38, 6), snow);
      cap.position.copy(spur.position);
      cap.position.y += h * 0.28;
      orient(cap, s);
      cap.castShadow = true;
      group.add(cap);
      const slab = new THREE.Mesh(new THREE.BoxGeometry(depth * 0.7, 1.3, along * 0.72), ice);
      slab.position.copy(pos).addScaledVector(s.right, -side * depth * 0.18);
      slab.position.y += 0.7;
      orient(slab, s);
      slab.castShadow = true;
      group.add(slab);
      for (let k = 0; k < 4; k++) {
        const shard = new THREE.Mesh(new THREE.DodecahedronGeometry(0.7 + (k % 3) * 0.35, 0), k % 2 ? ice : snow);
        shard.position.copy(pos).addScaledVector(s.right, -side * (depth * 0.28 + k * 0.4)).addScaledVector(s.tangent, (k - 1.5) * 2.2);
        shard.position.y += 0.6 + (k % 2) * 0.5;
        shard.castShadow = true;
        group.add(shard);
      }
    } else {
      const palette = (kind === "neon" ? FACADES.neon : FACADES.harbor)[obstacles.length % 5];
      const tex = facadeTexture(palette, kind === "neon");
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(1.4, 2.2);
      const h = 12 + (obstacles.length % 4) * 3;
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(depth, h, along),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.62, metalness: 0.08 })
      );
      body.position.copy(pos);
      body.position.y += h * 0.5;
      orient(body, s);
      body.castShadow = true;
      body.receiveShadow = true;
      group.add(body);
      const lip = new THREE.Mesh(new THREE.BoxGeometry(depth + 0.4, 0.35, along + 0.3), new THREE.MeshStandardMaterial({ color: palette.awning, roughness: 0.4, metalness: 0.2 }));
      lip.position.copy(pos);
      lip.position.y += h - 0.2;
      orient(lip, s);
      group.add(lip);
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(4.8, 1.5),
        new THREE.MeshBasicMaterial({ map: signTexture(kind === "neon" ? "BLOCK" : "SITE", "#111318", "#f3e534") })
      );
      sign.position.copy(pos).addScaledVector(s.right, -side * (depth * 0.5 + 0.08)).add(new THREE.Vector3(0, h * 0.72, 0));
      sign.lookAt(s.pos.x, sign.position.y, s.pos.z);
      group.add(sign);
      const glow = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, h * 0.55, along * 0.82),
        new THREE.MeshStandardMaterial({ color: kind === "neon" ? 0x22e4ff : 0xffd27a, emissive: kind === "neon" ? 0x22e4ff : 0xffb24a, emissiveIntensity: 1.4 })
      );
      glow.position.copy(pos).addScaledVector(s.right, -side * (depth * 0.5 + 0.02));
      glow.position.y += h * 0.48;
      orient(glow, s);
      group.add(glow);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(1.1, 4.4, along * 0.86), hazard);
      frame.position.copy(pos).addScaledVector(s.right, -side * (depth * 0.5 + 0.55));
      frame.position.y += 2.2;
      orient(frame, s);
      frame.castShadow = true;
      group.add(frame);
    }
    const paint = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.05, 6.5), hazard);
    paint.position.copy(pos).addScaledVector(s.right, -side * (depth * 0.5 + 2.6)).addScaledVector(s.tangent, -8);
    paint.position.y += 0.07;
    orient(paint, s);
    group.add(paint);
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.5, along * 0.7), hazard);
    board.position.copy(pos).addScaledVector(s.right, -side * (depth * 0.5 + 0.7)).addScaledVector(s.tangent, -along * 0.15);
    board.position.y += 0.9;
    orient(board, s);
    board.castShadow = true;
    group.add(board);
    for (const t of [-1, 1]) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.7, 8), hazard);
      cone.position.copy(pos).addScaledVector(s.right, -side * (depth * 0.5 + 1.5)).addScaledVector(s.tangent, t * along * 0.32);
      cone.position.y += 0.35;
      cone.castShadow = true;
      group.add(cone);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6), dark);
      post.position.copy(cone.position);
      post.position.y += 0.7;
      group.add(post);
    }
    obstacles.push({
      x: pos.x,
      z: pos.z,
      fx: s.tangent.x,
      fz: s.tangent.z,
      rx: s.right.x,
      rz: s.right.z,
      halfL: along * 0.5,
      halfW: depth * 0.5 + 1.7,
      side,
    });
  }
  return obstacles;
}

export function buildTrack(def) {
  const computed = computeSamples(def);
  const { samples, checkpoints, length, bounds } = computed;
  const theme = {
    ...THEMES[def.theme],
    fogNear: def.id === "alpine" ? 160 : 200,
    fogFar: def.id === "alpine" ? 2800 : 2100,
  };
  const group = new THREE.Group();
  const sky = createSky(theme.sky);
  group.add(sky.mesh);

  const roadMat = new THREE.MeshStandardMaterial({
    color: 0x141418,
    map: asphaltTexture(),
    roughness: 0.78,
    metalness: 0.08,
    envMapIntensity: 0.22,
    side: THREE.DoubleSide,
  });
  roadMat.map.repeat.set(1.4, 0.22);
  const road = buildRibbon(samples, def.width * 0.5, 0, roadMat);
  road.receiveShadow = true;
  group.add(road);

  const dashMat = new THREE.MeshBasicMaterial({
    map: dashTexture(),
    transparent: true,
    alphaTest: 0.4,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const dashes = buildRibbon(samples, 0.12, 0.035, dashMat);
  group.add(dashes);

  const curbMat = new THREE.MeshStandardMaterial({ map: curbTexture(), roughness: 0.6, side: THREE.DoubleSide });
  const curbs = edgeRibbon(samples, def.width * 0.5 - 0.55, def.width * 0.5 + 0.05, 0.04, curbMat);
  group.add(curbs);

  if (def.theme === "neon") {
    const glow = new THREE.MeshBasicMaterial({ color: 0x22e4ff, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    group.add(edgeRibbon(samples, def.width * 0.5 + 0.08, def.width * 0.5 + 0.22, 0.05, glow));
  }

  const walkMat = new THREE.MeshStandardMaterial({
    map: sidewalkTexture(),
    color: def.theme === "neon" ? 0x9aa3b2 : def.theme === "desert" ? 0xe7d3b0 : 0xffffff,
    roughness: 0.92,
    side: THREE.DoubleSide,
  });
  walkMat.map.repeat.set(1, 0.35);
  group.add(edgeRibbon(samples, def.width * 0.5 + 0.2, def.width * 0.5 + 5.2, 0.025, walkMat));
  const laneMat = new THREE.MeshBasicMaterial({ color: 0xf7f4ee, side: THREE.DoubleSide });
  group.add(edgeRibbon(samples, def.width * 0.16, def.width * 0.16 + 0.16, 0.045, laneMat));
  const edgeMat = new THREE.MeshBasicMaterial({ color: 0xf7f4ee, side: THREE.DoubleSide });
  group.add(edgeRibbon(samples, def.width * 0.5 - 1.2, def.width * 0.5 - 0.96, 0.04, edgeMat));

  addBarriers(group, samples);
  addChevrons(group, samples);
  addStreetMarkings(group, samples);
  const lights = addGantry(group, samples);
  addBoostPads(group, samples);

  let extra = {};
  if (def.theme === "harbor" || def.theme === "coast") extra = themeHarbor(group, samples);
  if (def.theme === "neon") extra = themeNeon(group, samples);
  if (def.theme === "alpine" || def.theme === "forest") extra = themeAlpine(group, samples, bounds);
  if (def.theme === "desert" || def.theme === "industrial") extra = themeDesert(group, samples, bounds);
  addStreetLife(group, samples, def.theme);
  const obstacleKind = def.id === "alpine" ? "ice" : def.id === "neon" ? "neon" : def.id === "harbor" ? "harbor" : null;
  const obstacles = obstacleKind ? addRoadObstacles(group, samples, obstacleKind) : [];

  const hemi = new THREE.HemisphereLight(theme.hemi[0], theme.hemi[1], theme.hemi[2] + 0.12);
  const fill = new THREE.DirectionalLight(0xb9d7ff, 0.42);
  fill.position.set(-36, 22, -18);
  group.add(fill);
  const sun = new THREE.DirectionalLight(theme.sun.color, theme.sun.intensity);
  sun.position.set(...theme.sun.pos);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 2;
  sun.shadow.camera.far = 140;
  sun.shadow.camera.left = -70;
  sun.shadow.camera.right = 70;
  sun.shadow.camera.top = 70;
  sun.shadow.camera.bottom = -70;
  sun.shadow.radius = 2;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  group.add(hemi, sun, sun.target);

  return {
    ...computed,
    group,
    lights,
    theme,
    sky,
    sun,
    waterUniforms: extra.waterUniforms || null,
    obstacles,
  };
}

export function disposeObject(root) {
  root.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => {
        if (m.map) m.map.dispose();
        if (m.emissiveMap && m.emissiveMap !== m.map) m.emissiveMap.dispose();
        m.dispose();
      });
    }
  });
}
