import * as THREE from "three";

export const CARS = [
  {
    id: "starter",
    name: "Street",
    rarity: "common",
    rarityLabel: "Common",
    price: 0,
    type: "hatch",
    blurb: "Free starter. The next car is 10% better at speed, steering, and drift.",
    colors: { body: "#d5dbe6", accent: "#3b82f6", glass: "#1b2838", rim: "#c5ccd6" },
    stats: { speed: 72, accel: 62, handling: 78, grip: 74 },
    drive: { speed: 1, turn: 1, drift: 1 },
  },
  {
    id: "sprint",
    name: "Sprint RS",
    rarity: "rare",
    rarityLabel: "Rare",
    price: 1000,
    type: "sport",
    blurb: "10% faster, sharper, and better in a drift than Street.",
    colors: { body: "#e11d2e", accent: "#f8fafc", glass: "#1a0c10", rim: "#e8e8e8" },
    stats: { speed: 74, accel: 66, handling: 78, grip: 74 },
    drive: { speed: 1.1, turn: 1.1, drift: 1.1 },
  },
  {
    id: "neon",
    name: "Neon GT",
    rarity: "epic",
    rarityLabel: "Epic",
    price: 2500,
    type: "gt",
    blurb: "10% better than Sprint RS. Underglow included.",
    colors: { body: "#6d28d9", accent: "#22e4ff", glass: "#12081f", rim: "#22e4ff" },
    glow: "#22e4ff",
    stats: { speed: 76, accel: 68, handling: 80, grip: 75 },
    drive: { speed: 1.21, turn: 1.21, drift: 1.21 },
  },
  {
    id: "thunder",
    name: "Thunder X",
    rarity: "legendary",
    rarityLabel: "Legendary",
    price: 6000,
    type: "muscle",
    blurb: "10% better than Neon GT. A small step, not a new class.",
    colors: { body: "#141414", accent: "#f5c542", glass: "#111", rim: "#f5c542" },
    stats: { speed: 78, accel: 70, handling: 80, grip: 76 },
    drive: { speed: 1.331, turn: 1.331, drift: 1.331 },
  },
  {
    id: "apex",
    name: "Apex One",
    rarity: "mythic",
    rarityLabel: "Mythic",
    price: 12000,
    type: "hyper",
    blurb: "10% better than Thunder X across speed, steering, and drift.",
    colors: { body: "#ff5a1f", accent: "#fff4e8", glass: "#2a0c04", rim: "#fff" },
    stats: { speed: 80, accel: 72, handling: 82, grip: 77 },
    drive: { speed: 1.464, turn: 1.464, drift: 1.464 },
  },
  {
    id: "vega",
    name: "Vega S",
    rarity: "epic",
    rarityLabel: "Epic",
    price: 18000,
    type: "gt",
    blurb: "10% better than Apex One. Low, wide, and a little easier to place.",
    colors: { body: "#0ea5e9", accent: "#f8fafc", glass: "#041018", rim: "#e2e8f0" },
    glow: "#38bdf8",
    stats: { speed: 82, accel: 74, handling: 83, grip: 78 },
    drive: { speed: 1.611, turn: 1.611, drift: 1.611 },
  },
  {
    id: "royal",
    name: "Royal 9",
    rarity: "legendary",
    rarityLabel: "Legendary",
    price: 26000,
    type: "hyper",
    blurb: "10% better than Vega S. Long nose, same racing rules.",
    colors: { body: "#f8f1dc", accent: "#b45309", glass: "#1c140c", rim: "#f5c542" },
    stats: { speed: 84, accel: 76, handling: 84, grip: 79 },
    drive: { speed: 1.772, turn: 1.772, drift: 1.772 },
  },
  {
    id: "ion",
    name: "Ion X",
    rarity: "mythic",
    rarityLabel: "Mythic",
    price: 36000,
    type: "suv",
    blurb: "The best car. 10% better than Royal 9, not a different sport.",
    colors: { body: "#111827", accent: "#34d399", glass: "#020617", rim: "#34d399" },
    glow: "#34d399",
    stats: { speed: 86, accel: 78, handling: 86, grip: 80 },
    drive: { speed: 1.949, turn: 1.949, drift: 1.949 },
  },
];

export const RARITY_COLOR = {
  common: "#a8b3c4",
  rare: "#3b9eff",
  epic: "#c084fc",
  legendary: "#f5c542",
  mythic: "#ff5a1f",
};

const STYLES = {
  hatch: { length: 3.65, width: 1.68, height: 0.5, cabinL: 1.55, cabinH: 0.46, cabinZ: -0.12, wheelR: 0.33, wheelW: 0.26, wb: 1.12, tw: 0.74 },
  sport: { length: 4.25, width: 1.88, height: 0.36, cabinL: 1.28, cabinH: 0.36, cabinZ: -0.38, wheelR: 0.35, wheelW: 0.28, wb: 1.32, tw: 0.84, wing: true },
  gt: { length: 4.15, width: 1.96, height: 0.34, cabinL: 1.2, cabinH: 0.34, cabinZ: -0.28, wheelR: 0.35, wheelW: 0.3, wb: 1.28, tw: 0.88, wing: true, glow: true },
  hyper: { length: 4.55, width: 2.05, height: 0.3, cabinL: 1.05, cabinH: 0.3, cabinZ: -0.5, wheelR: 0.36, wheelW: 0.3, wb: 1.4, tw: 0.92, wing: true },
  muscle: { length: 4.7, width: 1.92, height: 0.42, cabinL: 1.35, cabinH: 0.38, cabinZ: -0.15, wheelR: 0.36, wheelW: 0.32, wb: 1.38, tw: 0.86, wing: true },
  suv: { length: 4.4, width: 1.9, height: 0.62, cabinL: 1.7, cabinH: 0.5, cabinZ: -0.05, wheelR: 0.4, wheelW: 0.3, wb: 1.3, tw: 0.82 },
};

export function getCar(id) {
  return CARS.find((c) => c.id === id) || CARS[0];
}

export function statsToPhys(stats, drive = {}) {
  const speedMul = drive.speed || 1;
  const turnMul = drive.turn || 1;
  const driftMul = drive.drift || 1;
  return {
    maxSpeed: (34 + stats.speed * 0.16) * speedMul * 1.25,
    accel: (13 + stats.accel * 0.2) * Math.min(speedMul, 3.4) * 1.2,
    grip: 4.4 + stats.grip * 0.028,
    steer: (1.05 + (stats.handling - 70) * 0.008) * turnMul,
    drift: driftMul,
  };
}

function physMat(color, extra = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0.72,
    roughness: 0.28,
    clearcoat: 0.8,
    clearcoatRoughness: 0.18,
    ...extra,
  });
}

function makeWheel(radius, width, rimColor) {
  const pivot = new THREE.Group();
  const spin = new THREE.Group();
  pivot.add(spin);
  const tire = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, width, 18),
    new THREE.MeshStandardMaterial({ color: 0x171717, roughness: 0.72, metalness: 0.05 })
  );
  tire.rotation.z = Math.PI / 2;
  tire.castShadow = true;
  spin.add(tire);
  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.58, radius * 0.58, width + 0.03, 14),
    new THREE.MeshStandardMaterial({ color: rimColor, metalness: 0.9, roughness: 0.25 })
  );
  rim.rotation.z = Math.PI / 2;
  spin.add(rim);
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.2, radius * 0.2, width + 0.06, 10),
    new THREE.MeshStandardMaterial({ color: 0xf4f4f4, metalness: 0.85, roughness: 0.2 })
  );
  hub.rotation.z = Math.PI / 2;
  spin.add(hub);
  return { pivot, spin };
}

function numberTexture(n, accent) {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "rgba(0,0,0,0.55)";
  g.fillRect(18, 28, 92, 72);
  g.fillStyle = accent;
  g.font = "700 58px sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(String(n), 64, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildCarMesh(def, opts = {}) {
  const number = opts.number ?? 1;
  const style = STYLES[def.type] || STYLES.hatch;
  const colors = def.colors;
  const g = new THREE.Group();
  const bodyMat = physMat(colors.body);
  const accentMat = physMat(colors.accent, { roughness: 0.35, metalness: 0.55 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x101820,
    metalness: 0.45,
    roughness: 0.08,
    transparent: true,
    opacity: 0.78,
  });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.6, metalness: 0.3 });

  const bodyY = style.wheelR + style.height * 0.32;
  const body = new THREE.Mesh(new THREE.BoxGeometry(style.width, style.height, style.length), bodyMat);
  body.position.y = bodyY;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  const skirtW = Math.max(0.4, style.tw * 2 - style.wheelW - 0.28);
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(skirtW, 0.08, style.length * 0.86), darkMat);
  skirt.position.y = style.wheelR * 0.42;
  g.add(skirt);

  const hood = new THREE.Mesh(new THREE.BoxGeometry(style.width * 0.9, 0.07, style.length * 0.36), bodyMat);
  hood.position.set(0, bodyY + style.height * 0.46, style.length * 0.26);
  hood.rotation.x = -0.1;
  hood.castShadow = true;
  g.add(hood);

  const cabinY = bodyY + style.height * 0.5 + style.cabinH * 0.28;
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(style.width * 0.7, style.cabinH * 0.72, style.cabinL * 0.62),
    bodyMat
  );
  cabin.position.set(0, cabinY, style.cabinZ - 0.08);
  cabin.castShadow = true;
  g.add(cabin);

  const windshield = new THREE.Mesh(new THREE.PlaneGeometry(style.width * 0.6, style.cabinH * 0.62), glassMat);
  windshield.position.set(0, cabinY + 0.02, style.cabinZ + style.cabinL * 0.28);
  windshield.rotation.x = -0.42;
  g.add(windshield);
  for (const side of [-1, 1]) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(style.cabinL * 0.42, style.cabinH * 0.42), glassMat);
    win.position.set(side * style.width * 0.36, cabinY + 0.02, style.cabinZ);
    win.rotation.y = side * Math.PI / 2;
    g.add(win);
  }

  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(style.width * 0.66, 0.05, style.cabinL * 0.5),
    bodyMat
  );
  roof.position.set(0, cabin.position.y + style.cabinH * 0.4, style.cabinZ - 0.08);
  g.add(roof);

  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.03, style.length * 0.78),
    accentMat
  );
  stripe.position.set(0, bodyY + style.height * 0.52, 0.05);
  g.add(stripe);

  const bumperF = new THREE.Mesh(new THREE.BoxGeometry(style.tw * 1.55, 0.14, 0.14), accentMat);
  bumperF.position.set(0, style.wheelR * 0.78, style.length * 0.5 - 0.02);
  g.add(bumperF);
  const bumperR = bumperF.clone();
  bumperR.position.z = -style.length * 0.5 + 0.02;
  g.add(bumperR);
  const grille = new THREE.Mesh(new THREE.BoxGeometry(style.width * 0.38, 0.14, 0.05), darkMat);
  grille.position.set(0, style.wheelR * 0.72, style.length * 0.5 + 0.02);
  g.add(grille);
  for (let i = -1; i <= 1; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(style.width * 0.32, 0.015, 0.02), accentMat);
    slat.position.set(0, grille.position.y + i * 0.035, grille.position.z + 0.02);
    g.add(slat);
  }
  for (const side of [-1, 1]) {
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.07, 0.1), bodyMat);
    mirror.position.set(side * style.width * 0.52, cabinY + 0.02, style.cabinZ + style.cabinL * 0.2);
    mirror.castShadow = true;
    g.add(mirror);
    const mirrorGlass = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.045, 0.02),
      new THREE.MeshStandardMaterial({ color: 0xdbeafe, metalness: 0.85, roughness: 0.08 })
    );
    mirrorGlass.position.set(side * style.width * 0.6, cabinY + 0.02, style.cabinZ + style.cabinL * 0.2);
    g.add(mirrorGlass);
    const pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.055, 0.18, 10),
      new THREE.MeshStandardMaterial({ color: 0xc5ccd6, metalness: 0.92, roughness: 0.22 })
    );
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(side * 0.22, style.wheelR * 0.52, -style.length * 0.5 - 0.08);
    g.add(pipe);
  }

  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff4d2, emissive: 0xfff1c4, emissiveIntensity: 1.6 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xff1f3a, emissive: 0xff1a36, emissiveIntensity: 0.8 });
  const headlights = [];
  const brakeLights = [];
  for (const side of [-1, 1]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.06), lampMat);
    lamp.position.set(side * style.width * 0.32, style.wheelR * 0.95, style.length * 0.5 + 0.02);
    g.add(lamp);
    headlights.push(lamp);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.08), tailMat.clone());
    tail.position.set(side * style.width * 0.32, style.wheelR + 0.12, -style.length * 0.5 - 0.01);
    g.add(tail);
    brakeLights.push(tail);
  }

  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.46, 0.46),
    new THREE.MeshBasicMaterial({ map: numberTexture(number, colors.accent), transparent: true })
  );
  plate.rotation.x = -Math.PI / 2;
  plate.position.set(0, roof.position.y + 0.04, style.cabinZ);
  g.add(plate);

  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 16, 12),
    new THREE.MeshStandardMaterial({ color: colors.accent, roughness: 0.35, metalness: 0.4 })
  );
  helmet.position.set(0, cabin.position.y + 0.08, style.cabinZ + 0.02);
  helmet.scale.set(1, 0.92, 1);
  g.add(helmet);
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.26, 0.08, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x111318, metalness: 0.8, roughness: 0.1, emissive: 0x223344, emissiveIntensity: 0.4 })
  );
  visor.position.set(0, helmet.position.y + 0.02, style.cabinZ + 0.18);
  g.add(visor);

  if (style.wing || def.type === "hyper") {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(style.width * 0.92, 0.06, 0.28), accentMat);
    wing.position.set(0, bodyY + style.height + 0.32, -style.length * 0.42);
    wing.castShadow = true;
    g.add(wing);
    for (const side of [-1, 1]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.28, 0.08), darkMat);
      strut.position.set(side * 0.42, wing.position.y - 0.14, wing.position.z);
      g.add(strut);
    }
  }

  let underglow = null;
  if (style.glow || def.glow) {
    underglow = new THREE.Mesh(
      new THREE.PlaneGeometry(style.width * 0.8, style.length * 0.7),
      new THREE.MeshBasicMaterial({
        color: def.glow || colors.accent,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    underglow.rotation.x = -Math.PI / 2;
    underglow.position.y = 0.08;
    g.add(underglow);
  }

  const flames = [];
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xff7a18, transparent: true, opacity: 0.9 });
  for (const side of [-0.28, 0.28]) {
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.42, 8), flameMat);
    flame.position.set(side, style.wheelR * 0.7, -style.length * 0.52);
    flame.rotation.x = Math.PI / 2;
    flame.scale.setScalar(0.01);
    g.add(flame);
    flames.push(flame);
  }

  const wheels = [];
  const spots = [
    [style.tw, style.wb],
    [-style.tw, style.wb],
    [style.tw, -style.wb],
    [-style.tw, -style.wb],
  ];
  for (const [x, z] of spots) {
    const w = makeWheel(style.wheelR, style.wheelW, colors.rim);
    w.pivot.position.set(x, style.wheelR, z);
    g.add(w.pivot);
    wheels.push(w);
  }

  g.userData = {
    wheels,
    brakeLights,
    underglow,
    flames,
    wheelR: style.wheelR,
    halfLength: style.length * 0.5,
    wb: style.wb,
    tw: style.tw,
  };
  return g;
}
