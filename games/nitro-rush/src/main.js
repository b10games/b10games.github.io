import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { AudioBus } from "./audio.js";
import { CARS, RARITY_COLOR, buildCarMesh, getCar, statsToPhys } from "./cars.js";
import {
  applyCrossings,
  createRacerState,
  formatCoins,
  formatTime,
  placeOf,
  progressDelta,
  rewardFor,
  REWARDS,
} from "./logic.js";
import { TRACK_LIST, buildTrack, computeSamples, createSky, disposeObject, getTrackDef } from "./tracks.js";

const SAVE_KEY = "nitrorush-v1";
const FIELD = 11;
const AI_DEFS = [
  { name: "NOVA", color: "#e23b3b", accent: "#ffd166", skill: 0.98 },
  { name: "BLAZE", color: "#f97316", accent: "#fff7ed", skill: 0.96 },
  { name: "REX", color: "#22c55e", accent: "#d9f99d", skill: 0.97 },
  { name: "VIPER", color: "#3b82f6", accent: "#dbeafe", skill: 0.95 },
  { name: "LUNA", color: "#ec4899", accent: "#fbcfe8", skill: 0.96 },
  { name: "KITE", color: "#14b8a6", accent: "#ccfbf1", skill: 0.94 },
  { name: "ORION", color: "#a855f7", accent: "#f3e8ff", skill: 0.97 },
  { name: "JETT", color: "#facc15", accent: "#1f2937", skill: 0.95 },
  { name: "MIRA", color: "#fb7185", accent: "#fff1f2", skill: 0.96 },
  { name: "AXEL", color: "#38bdf8", accent: "#0f172a", skill: 0.98 },
];
const MAP_BG = {
  harbor: "linear-gradient(160deg,#ff9a4a 0%,#1d6ea8 72%)",
  neon: "linear-gradient(165deg,#7c3aed 0%,#12081f 58%,#0e7490 100%)",
  alpine: "linear-gradient(165deg,#e8f3ff 0%,#7eb0d4 55%,#f4f7fb 100%)",
  desert: "linear-gradient(165deg,#f6d48a 0%,#e07a32 48%,#c45c32 100%)",
  coast: "linear-gradient(165deg,#7ec8ff 0%,#f6d7a2 55%,#1d6ea8 100%)",
  industrial: "linear-gradient(165deg,#c4b5a0 0%,#f97316 42%,#3f3a36 100%)",
  forest: "linear-gradient(165deg,#d7e7c4 0%,#3f7d4e 48%,#1e3a2f 100%)",
};

const audio = new AudioBus();
const keys = new Set();
const $ = (id) => document.getElementById(id);

let save = loadSave();
let renderer, camera, envMap;
let menuScene, raceScene, activeScene;
let anchor, lobbyCar, lobbyRing, lobbySky, lobbySun;
let previewId = save.selected;
let tab = "play";
let screen = "menu";
let mapOpen = false;
let paused = false;
let resultsOpen = false;
let selectedMap = save.lastMap || "harbor";
let shownCoins = save.coins;
let toastTimer = 0;

const SMOKE = new THREE.Color("#d0d4dc");
const FLAME = new THREE.Color("#ff8a1e");
let track, cars, playerCar, particles, skids;
let nitroZoom = 0;
let raceTime = 0;
let countdown = 0;
let countLabel = "";
let raceDone = false;
let finalPlace = 1;
let finalTime = 0;
let finishTimer = 0;
let snapCam = false;
let shake = 0;
let wrongT = 0;
let hintT = 0;
let lastLapShown = 0;
let minimap = null;
const lookS = new THREE.Vector3();
const camDesired = new THREE.Vector3();
const lookDesired = new THREE.Vector3();
const sampleCache = new Map();

function loadSave() {
  const base = {
    coins: 0,
    owned: ["starter"],
    selected: "starter",
    name: "PILOT",
    wins: 0,
    races: 0,
    earned: 0,
    bestPlace: null,
    bestTimes: {},
    bestLaps: {},
    lastMap: "harbor",
    muted: false,
    seenTip: false,
    control: null,
  };
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
    if (!raw) return base;
    return { ...base, ...raw, owned: raw.owned?.length ? raw.owned : ["starter"] };
  } catch {
    return base;
  }
}
function saveGame() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
}

function samplesFor(def) {
  if (!sampleCache.has(def.id)) sampleCache.set(def.id, computeSamples(def));
  return sampleCache.get(def.id);
}

function trackSVG(def, color) {
  const { samples } = samplesFor(def);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const s of samples) {
    minX = Math.min(minX, s.pos.x);
    maxX = Math.max(maxX, s.pos.x);
    minZ = Math.min(minZ, s.pos.z);
    maxZ = Math.max(maxZ, s.pos.z);
  }
  const w = 240, h = 140, pad = 18;
  const sc = Math.min((w - pad * 2) / (maxX - minX || 1), (h - pad * 2) / (maxZ - minZ || 1));
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  let d = "";
  for (let i = 0; i < samples.length; i += 2) {
    const x = (w / 2 + (samples[i].pos.x - cx) * sc).toFixed(1);
    const y = (h / 2 + (samples[i].pos.z - cz) * sc).toFixed(1);
    d += `${i === 0 ? "M" : "L"}${x},${y}`;
  }
  return `<svg viewBox="0 0 ${w} ${h}"><path d="${d}Z" fill="none" stroke="${color}" stroke-width="8" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

function carSilhouette(color) {
  return `<svg class="sil" viewBox="0 0 120 50" fill="${color}">
    <path d="M8 34 h18 l8-12 h34 l10 8 h28 a8 8 0 0 1 0 10 h-6 a7 7 0 0 1-14 0 H36 a7 7 0 0 1-14 0 H8z"/>
    <circle cx="29" cy="36" r="5" fill="#111"/><circle cx="92" cy="36" r="5" fill="#111"/>
  </svg>`;
}

function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  toastTimer = 2.2;
}

function setMuted(m) {
  save.muted = m;
  audio.setMuted(m);
  saveGame();
  $("mute").innerHTML = m
    ? `<svg viewBox="0 0 24 24" style="fill:#fff;stroke:none"><path d="M4 9v6h4l5 4V5L8 9H4zm12.2.8 1.4-1.4 1.4 1.4L17.6 12l1.4 1.4-1.4 1.4-1.4-1.4-1.4 1.4-1.4-1.4L15.8 12l-1.4-1.4 1.4-1.4 1.4 1.4z"/></svg>`
    : `<svg viewBox="0 0 24 24" style="fill:#fff;stroke:none"><path d="M4 9v6h4l5 4V5L8 9H4zm10-1.5v9a4.5 4.5 0 0 0 0-9zm0 2.2a2.3 2.3 0 0 1 0 4.6z"/></svg>`;
}

function shownId() {
  return tab === "shop" ? previewId : save.selected;
}

function refreshMeta() {
  paintDevices();
  $("pname").value = save.name;
  $("level").textContent = String(1 + (save.wins || 0));
  const def = getTrackDef(selectedMap);
  $("mode-name").textContent = def.name.toUpperCase();
  $("mode-art").style.background = MAP_BG[def.id];
  $("mode-art").innerHTML = trackSVG(def, "rgba(255,255,255,0.92)");
  const pay = REWARDS[def.difficulty] || REWARDS.Easy;
  const rewards = $("reward-card");
  if (rewards) {
    rewards.innerHTML = [1, 2, 3].map((place) => (
      `<div class="reward-row"><span class="pos p${place}">${place}</span><span>${place === 1 ? "1st" : place === 2 ? "2nd" : "3rd"} · ${def.difficulty}</span><b>${formatCoins(pay[place])}</b></div>`
    )).join("");
  }
  const next = CARS.find((c) => !save.owned.includes(c.id));
  const card = $("next-card");
  if (!next) {
    card.innerHTML = `<div class="next-top"><span>GARAGE</span><span>COMPLETE</span></div><div class="next-sub">You own every car.</div>`;
  } else {
    const pct = Math.max(0, Math.min(100, (save.coins / next.price) * 100));
    card.innerHTML = `<div class="next-top"><span>NEXT CAR</span><span>${next.name.toUpperCase()}</span></div><div class="bar"><i style="width:${pct}%"></i></div><div class="next-sub">${formatCoins(save.coins)} / ${formatCoins(next.price)}</div>`;
  }
  const car = getCar(shownId());
  const float = $("car-float");
  float.innerHTML = `<span style="color:${RARITY_COLOR[car.rarity]}">${car.rarityLabel.toUpperCase()}</span><strong>${car.name.toUpperCase()}</strong>`;
  float.classList.toggle("hidden", tab === "shop");
}

function renderShop() {
  const car = getCar(previewId);
  const owned = save.owned.includes(car.id);
  const selected = save.selected === car.id;
  const afford = save.coins >= car.price;
  const feat = $("featured");
  feat.style.setProperty("--rarity", RARITY_COLOR[car.rarity]);
  const btn = owned ? (selected ? "SELECTED" : "EQUIP") : "BUY";
  const step = Math.max(0, CARS.findIndex((c) => c.id === car.id));
  feat.innerHTML = `
    <div class="rarity-label">${car.rarityLabel.toUpperCase()}</div>
    <h3>${car.name.toUpperCase()}</h3>
    <p class="blurb">${car.blurb}</p>
    ${statRow("SPEED", Math.min(100, 46 + step * 7))}
    ${statRow("STEERING", Math.min(100, 44 + step * 7))}
    ${statRow("DRIFT", Math.min(100, 42 + step * 7))}
    <div class="price-line">${owned ? "Owned" : `<span class="coin-icon">N</span> ${formatCoins(car.price)}`}</div>
    <button id="buy-btn" class="play-btn">${btn}</button>
  `;
  $("buy-btn").onclick = () => buyOrEquip(car.id);
  const dock = $("buy-float");
  const note = $("buy-note");
  if (dock) {
    dock.textContent = btn;
    dock.classList.toggle("owned", owned);
    dock.onclick = () => buyOrEquip(car.id);
  }
  if (note) {
    if (owned && selected) note.textContent = "This car is selected";
    else if (owned) note.textContent = "Owned — tap to drive it";
    else if (afford) note.textContent = `${car.name} · ${formatCoins(car.price)} coins`;
    else note.textContent = `You need ${formatCoins(car.price - save.coins)} more coins`;
  }
  const grid = $("shop-grid");
  grid.innerHTML = "";
  for (const c of CARS) {
    const b = document.createElement("button");
    b.className = "car-card" + (c.id === previewId ? " sel" : "");
    b.style.background = `linear-gradient(160deg, ${RARITY_COLOR[c.rarity]}, #141824 72%)`;
    const own = save.owned.includes(c.id);
    b.innerHTML = `${carSilhouette(c.colors.body)}<div class="tag">${c.rarityLabel.toUpperCase()}</div><em>${own ? "OWNED" : ""}</em><strong>${c.name}</strong><div class="cost"><span class="mini-coin">N</span>${own ? "✓" : formatCoins(c.price)}</div>`;
    b.onclick = () => {
      previewId = c.id;
      audio.click();
      swapLobbyCar();
      renderShop();
    };
    grid.appendChild(b);
  }
}

function statRow(label, value) {
  return `<div class="stat"><label>${label}</label><div class="bar"><i style="width:${value}%"></i></div></div>`;
}

function renderCareer() {
  const rows = TRACK_LIST.map((t) => {
    const best = save.bestTimes?.[t.id];
    return `<div class="career-row"><span>${t.name}</span><b>${best ? formatTime(best) : "—"}</b></div>`;
  }).join("");
  $("career-card").innerHTML = `
    <div class="kicker">SEASON 1</div>
    <h2>CAREER</h2>
    <div class="career-row"><span>Wins</span><b>${save.wins || 0}</b></div>
    <div class="career-row"><span>Races</span><b>${save.races || 0}</b></div>
    <div class="career-row"><span>Coins earned</span><b>${formatCoins(save.earned || 0)}</b></div>
    <div class="career-row"><span>Best place</span><b>${save.bestPlace || "—"}</b></div>
    <div class="career-row"><span>Coins</span><b>${formatCoins(save.coins)}</b></div>
    ${rows}
    <button id="reset-save" class="linkish">Reset progress</button>
  `;
  $("reset-save").onclick = () => {
    if (!confirm("Reset coins, cars, and times?")) return;
    const name = save.name;
    const muted = save.muted;
    save = loadSave();
    localStorage.removeItem(SAVE_KEY);
    save = { ...loadSave(), name, muted };
    saveGame();
    previewId = save.selected;
    selectedMap = "harbor";
    swapLobbyCar();
    refreshMeta();
    renderCareer();
    toast("Progress reset");
  };
}

function renderMaps() {
  const grid = $("map-grid");
  grid.innerHTML = "";
  for (const def of TRACK_LIST) {
    const b = document.createElement("button");
    b.className = "map-card" + (def.id === selectedMap ? " sel" : "");
    const best = save.bestTimes?.[def.id];
    b.innerHTML = `
      <div class="mv" style="background:${MAP_BG[def.id]}">${trackSVG(def, "#fff")}</div>
      <div class="mb">
        <span class="diff" style="color:${def.difficulty === "Easy" ? "#3dff8a" : def.difficulty === "Hard" ? "#ff6b6b" : "#f3e534"}">${def.difficulty.toUpperCase()}</span>
        <strong>${def.name}</strong>
        <small>${def.tagline}</small>
        <small>${best ? "Best " + formatTime(best) : "3 laps"}</small>
      </div>`;
    b.onclick = () => {
      selectedMap = def.id;
      audio.click();
      renderMaps();
      refreshMeta();
    };
    b.ondblclick = () => {
      selectedMap = def.id;
      beginRace();
    };
    grid.appendChild(b);
  }
}

function buyOrEquip(id) {
  const car = getCar(id);
  audio.unlock();
  if (save.owned.includes(id)) {
    save.selected = id;
    saveGame();
    audio.click();
    toast("Equipped");
    refreshMeta();
    renderShop();
    return;
  }
  if (save.coins < car.price) {
    toast(`You need ${formatCoins(car.price - save.coins)} more coins`);
    $("featured").classList.remove("shake");
    void $("featured").offsetWidth;
    $("featured").classList.add("shake");
    return;
  }
  save.coins -= car.price;
  save.owned.push(id);
  save.selected = id;
  previewId = id;
  saveGame();
  audio.buy();
  toast("Bought!");
  refreshMeta();
  renderShop();
  swapLobbyCar();
}

function setTab(name) {
  tab = name;
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  $("panel-play").classList.toggle("hidden", name !== "play");
  $("panel-shop").classList.toggle("hidden", name !== "shop");
  $("panel-career").classList.toggle("hidden", name !== "career");
  if (name === "shop") {
    const next = CARS.find((c) => !save.owned.includes(c.id));
    if (next && save.owned.includes(previewId)) previewId = next.id;
    renderShop();
    swapLobbyCar();
  }
  if (name === "career") renderCareer();
  swapLobbyCar();
  refreshMeta();
  if (lobbySky) tintSky(name === "shop");
}

function openMaps() {
  audio.unlock();
  audio.click();
  mapOpen = true;
  renderMaps();
  $("map-modal").classList.remove("hidden");
}
function closeMaps() {
  mapOpen = false;
  $("map-modal").classList.add("hidden");
}

function basis(yaw) {
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  return { fx, fz, rx: -fz, rz: fx };
}

function makeRacer(opts) {
  const mesh = buildCarMesh(opts.def, { number: opts.number });
  const car = {
    name: opts.name,
    isPlayer: !!opts.isPlayer,
    hex: opts.hex || opts.def.colors.body,
    phys: opts.phys,
    skill: opts.skill || 1,
    seed: Math.random() * 10,
    mesh,
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    yaw: 0,
    speed: 0,
    nitro: 100,
    nitroActive: false,
    boostTime: 0,
    wasPad: false,
    hit: 0,
    stuck: 0,
    steerVisual: 0,
    brakeVisual: false,
    wrong: false,
    diffMul: 1,
  };
  Object.assign(car, createRacerState(opts.idx));
  car.total = opts.total;
  const s = opts.sample;
  car.pos.copy(s.pos).addScaledVector(s.right, opts.side);
  car.yaw = Math.atan2(s.tangent.x, s.tangent.z);
  car.pos.y = s.pos.y;
  mesh.position.copy(car.pos);
  mesh.rotation.order = "YXZ";
  mesh.rotation.y = car.yaw;
  return car;
}

function respawn(car) {
  if (!track) return;
  const idx = car.lastCp ?? car.sampleIndex;
  const s = track.samples[idx];
  car.total += progressDelta(car.sampleIndex, idx, track.samples.length);
  car.sampleIndex = idx;
  car.prevSample = idx;
  car.pos.copy(s.pos);
  car.yaw = Math.atan2(s.tangent.x, s.tangent.z);
  car.vel.set(0, 0, 0);
  car.speed = 0;
  car.stuck = 0;
}

function stepCar(car, dt, inp, allow) {
  if (!allow) {
    car.speed = 0;
    car.steerVisual = 0;
    return;
  }
  const phys = car.phys;
  let maxSpeed = phys.maxSpeed * (track.diffPlayer || 1);
  let accel = phys.accel;
  const nitroOn = !!(inp.nitro && inp.throttle && car.nitro > 1);
  if (car.boostTime > 0) {
    maxSpeed *= 1.1;
    accel *= 1.12;
    car.boostTime -= dt;
  }
  if (nitroOn) {
    maxSpeed *= 1.38;
    accel *= 1.9;
    car.nitro = Math.max(0, car.nitro - 18 * dt);
  } else if (!inp.nitro) {
    car.nitro = Math.min(100, car.nitro + 8 * dt);
  }
  car.nitroActive = nitroOn || car.boostTime > 0;

  let b = basis(car.yaw);
  let vF = car.vel.x * b.fx + car.vel.z * b.fz;
  let vR = car.vel.x * b.rx + car.vel.z * b.rz;
  if (inp.throttle) {
    const ratio = Math.max(0, vF) / maxSpeed;
    vF += accel * (1 - ratio * ratio) * dt;
  } else if (!inp.brake) {
    vF -= vF * 0.45 * dt;
  }
  if (inp.brake) vF -= 40 * dt;
  const samples = track.samples;
  const s0 = samples[car.sampleIndex];
  const s1 = samples[(car.sampleIndex + 3) % samples.length];
  const ds = Math.max(1.5, s0.pos.distanceTo(s1.pos));
  vF -= ((s1.pos.y - s0.pos.y) / ds) * 28 * dt;
  vF -= Math.sign(vF || 0) * 0.45 * dt;
  if (vF > maxSpeed) vF += (maxSpeed - vF) * Math.min(1, 3.2 * dt);
  if (vF < -12) vF = -12;

  const speed = Math.abs(vF) + Math.abs(vR) * 0.25;
  const driftMul = Math.min(phys.drift || 1, 8);
  const drifting = !!(inp.handbrake && speed > 7);
  car.drifting = drifting;
  car.steerSm = THREE.MathUtils.damp(car.steerSm || 0, inp.steer || 0, drifting ? 6 : 9, dt);
  const yawCap = 4.2 + driftMul * 0.7;
  const yawRate = Math.max(1.28, Math.min(phys.maxSpeed / 40, yawCap)) * (drifting ? 1.06 + driftMul * 0.035 : 1);
  const dir = vF < -0.6 ? -1 : 1;
  if (speed > 1.3) car.yaw -= car.steerSm * yawRate * dt * dir;
  else if (inp.steer && (inp.throttle || inp.brake)) car.yaw -= inp.steer * 1.25 * dt;

  b = basis(car.yaw);
  if (drifting) {
    const slip = 0.26 + Math.min(0.16, (driftMul - 1) * 0.028);
    const targetSlide = -car.steerSm * speed * slip;
    vR += (targetSlide - vR) * Math.min(1, (3.4 + driftMul * 0.45) * dt);
    vR *= Math.exp(-phys.grip * (0.2 / driftMul) * dt);
    vF *= Math.exp(-(0.18 / Math.min(driftMul, 3)) * dt);
  } else {
    vR *= Math.exp(-phys.grip * (0.9 + driftMul * 0.05) * dt);
  }
  car.vel.x = b.fx * vF + b.rx * vR;
  car.vel.z = b.fz * vF + b.rz * vR;
  car.pos.x += car.vel.x * dt;
  car.pos.z += car.vel.z * dt;
  car.speed = vF;
  car.steerVisual = inp.steer;
  car.brakeVisual = !!inp.brake;
  car.slide = Math.abs(vR);
  car.drifting = drifting || car.slide > 6.5;
  constrain(car, dt);
  collideObstacles(car);
  if (!Number.isFinite(car.pos.x)) respawn(car);
}

function collideObstacles(car) {
  const list = track?.obstacles;
  if (!list) return;
  for (const o of list) {
    const dx = car.pos.x - o.x;
    const dz = car.pos.z - o.z;
    const fwd = dx * o.fx + dz * o.fz;
    const lat = dx * o.rx + dz * o.rz;
    const padL = o.halfL + 1.2;
    const padW = o.halfW + 1.05;
    if (Math.abs(fwd) >= padL || Math.abs(lat) >= padW) continue;
    const overF = padL - Math.abs(fwd);
    const overL = padW - Math.abs(lat);
    if (overL < overF) {
      const push = Math.sign(lat || -o.side || 1) * overL;
      car.pos.x += o.rx * push;
      car.pos.z += o.rz * push;
    } else {
      const push = Math.sign(fwd || 1) * overF;
      car.pos.x += o.fx * push;
      car.pos.z += o.fz * push;
    }
    car.vel.x *= 0.35;
    car.vel.z *= 0.35;
    car.speed *= 0.4;
    car.hit = Math.max(car.hit || 0, 0.9);
  }
}

function constrain(car) {
  const samples = track.samples;
  const n = samples.length;
  let best = car.sampleIndex;
  let bestD = Infinity;
  for (let o = -28; o <= 80; o++) {
    const i = (car.sampleIndex + o + n * 4) % n;
    const dx = car.pos.x - samples[i].pos.x;
    const dz = car.pos.z - samples[i].pos.z;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  if (bestD > 3600) {
    for (let i = 0; i < n; i++) {
      const dx = car.pos.x - samples[i].pos.x;
      const dz = car.pos.z - samples[i].pos.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
  }
  const prev = car.sampleIndex;
  car.total += progressDelta(prev, best, n);
  car.sampleIndex = best;
  car.wrong = progressDelta(prev, best, n) < -0.4;
  const s = samples[best];
  const dx = car.pos.x - s.pos.x;
  const dz = car.pos.z - s.pos.z;
  const lat = dx * s.right.x + dz * s.right.z;
  const limit = s.width * 0.5 - 1.15;
  if (Math.abs(lat) > limit) {
    const overflow = lat - Math.sign(lat) * limit;
    car.pos.x -= s.right.x * overflow;
    car.pos.z -= s.right.z * overflow;
    const latVel = car.vel.x * s.right.x + car.vel.z * s.right.z;
    if (Math.sign(latVel) === Math.sign(lat)) {
      car.vel.x -= s.right.x * latVel * 0.86;
      car.vel.z -= s.right.z * latVel * 0.86;
    }
    car.vel.x *= 0.93;
    car.vel.z *= 0.93;
    if (Math.abs(overflow) > 0.15) car.hit = Math.min(1, Math.abs(overflow));
  }
  car.pos.y = s.pos.y + (s.bank || 0) * lat;
  if (s.boost && !car.wasPad) {
    car.boostTime = Math.max(car.boostTime, 0.8);
    car.nitro = Math.min(100, car.nitro + 24);
    if (car.isPlayer) audio.tone(520, 0.12, "sawtooth", 0.05, 280);
  }
  car.wasPad = !!s.boost;
  if (car.isPlayer && !raceDone) {
    const finished = applyCrossings(car, prev, best, track.checkpoints, n, raceTime);
    if (finished) onPlayerFinish();
  } else if (!car.isPlayer) {
    applyCrossings(car, prev, best, track.checkpoints, n, raceTime);
  }
}

function aiInput(ai, time) {
  const samples = track.samples;
  const n = samples.length;
  const tier = track.aiTier || "medium";
  const hard = tier === "hard";
  const easy = tier === "easy";
  const s = samples[ai.sampleIndex];
  const lookSteps = hard ? 12 : easy ? 5 : 8;
  const look = samples[(ai.sampleIndex + lookSteps) % n];
  let diff = Math.atan2(look.pos.x - ai.pos.x, look.pos.z - ai.pos.z) - ai.yaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  let steer = Math.max(-1, Math.min(1, -diff / (hard ? 0.26 : 0.34)));
  const lat = (ai.pos.x - s.pos.x) * s.right.x + (ai.pos.z - s.pos.z) * s.right.z;
  const wander = Math.sin(time * 0.5 + ai.seed) * (hard ? 0.16 : easy ? 0.95 : 0.5);
  steer += Math.max(-0.5, Math.min(0.5, (lat - wander) * (hard ? 0.22 : 0.14)));
  const b = basis(ai.yaw);
  for (const other of cars) {
    if (other === ai) continue;
    const ox = other.pos.x - ai.pos.x;
    const oz = other.pos.z - ai.pos.z;
    const fd = ox * b.fx + oz * b.fz;
    const rd = ox * b.rx + oz * b.rz;
    if (fd > 0 && fd < 8.5 && Math.abs(rd) < 2.3) steer -= Math.sign(rd || 1) * 0.8;
  }
  steer = Math.max(-1, Math.min(1, steer));
  const ahead = samples[(ai.sampleIndex + (hard ? 12 : 8)) % n];
  const far = samples[(ai.sampleIndex + (hard ? 22 : 16)) % n];
  const curv = Math.max(1 - s.tangent.dot(ahead.tangent), (1 - s.tangent.dot(far.tangent)) * 0.72);
  const corner = Math.max(0.36, 1 - curv * (hard ? 2.2 : easy ? 4.2 : 3.1));
  let mul = hard ? 0.97 + 0.03 * corner : easy ? 0.72 + 0.16 * corner : 0.95 + 0.04 * corner;
  if (playerCar) {
    const lead = ai.total - playerCar.total;
    if (lead > n * 0.3) mul *= hard ? 1 : easy ? 0.78 : 0.985;
    if (lead < -n * 0.5) mul *= hard ? 1 : easy ? 1.1 : 1.015;
  }
  if (track.obstacles) {
    for (const o of track.obstacles) {
      const ox = o.x - ai.pos.x;
      const oz = o.z - ai.pos.z;
      const fd = ox * b.fx + oz * b.fz;
      const rd = ox * b.rx + oz * b.rz;
      if (fd > -1 && fd < 42 && Math.abs(rd) < o.halfW + 7) {
        steer -= Math.sign(rd || o.side || 1) * (fd < 16 ? 1 : 0.7);
        if (fd < 18 && Math.abs(rd) < o.halfW + 1.5) mul *= 0.72;
      }
    }
    steer = Math.max(-1, Math.min(1, steer));
  }
  const target = ai.phys.maxSpeed * mul;
  return {
    throttle: ai.speed < target,
    brake: curv > (hard ? 0.075 : easy ? 0.026 : 0.045) && ai.speed > Math.max(11, target * (hard ? 0.84 : 0.68)),
    steer,
    handbrake: false,
    nitro: curv < (hard ? 0.05 : 0.03) && ai.nitro > (hard ? 30 : 55) && Math.random() < (hard ? 0.012 : 0.003),
  };
}

function collide() {
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      const dx = b.pos.x - a.pos.x;
      const dz = b.pos.z - a.pos.z;
      const min = 2.15;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const nz = dz / d;
      const overlap = min - d;
      a.pos.x -= nx * overlap * 0.5;
      a.pos.z -= nz * overlap * 0.5;
      b.pos.x += nx * overlap * 0.5;
      b.pos.z += nz * overlap * 0.5;
      a.vel.x -= nx * overlap * 7;
      a.vel.z -= nz * overlap * 7;
      b.vel.x += nx * overlap * 7;
      b.vel.z += nz * overlap * 7;
      a.hit = Math.max(a.hit, 0.4);
      b.hit = Math.max(b.hit, 0.4);
    }
  }
}

function syncVisual(car, dt) {
  const mesh = car.mesh;
  mesh.position.copy(car.pos);
  mesh.position.y += 0.015 * Math.sin(performance.now() / 70) * Math.min(1, Math.abs(car.speed) / 18);
  const s0 = track.samples[car.sampleIndex];
  const s1 = track.samples[(car.sampleIndex + 2) % track.samples.length];
  const pitch = Math.atan2(s1.pos.y - s0.pos.y, 6);
  mesh.rotation.y = car.yaw;
  mesh.rotation.x = THREE.MathUtils.damp(mesh.rotation.x, -pitch, 6, dt);
  const lean = Math.min(0.18, car.slide * (car.drifting ? 0.014 : 0.008));
  mesh.rotation.z = THREE.MathUtils.damp(mesh.rotation.z, -car.steerVisual * 0.08 - Math.sign(car.speed || 1) * lean, 8, dt);
  const ud = mesh.userData;
  const spin = (car.speed * dt) / ud.wheelR;
  ud.wheels.forEach((w, i) => {
    w.spin.rotation.x -= spin;
    if (i < 2) w.pivot.rotation.y = -car.steerVisual * 0.36;
  });
  ud.brakeLights.forEach((m) => {
    m.material.emissiveIntensity = car.brakeVisual ? 2.4 : 0.55;
  });
  const flame = car.nitroActive ? 1 : 0.01;
  ud.flames.forEach((f) => f.scale.set(flame, flame, flame));
  if (ud.underglow) ud.underglow.material.opacity = 0.35 + (car.nitroActive ? 0.35 : 0.1);
}

class Particles {
  constructor(scene) {
    this.count = 90;
    this.alive = new Float32Array(this.count);
    this.vel = Array.from({ length: this.count }, () => new THREE.Vector3());
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.count * 3);
    this.col = new Float32Array(this.count * 3);
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 0.42, vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false })
    );
    scene.add(this.points);
  }
  emit(x, y, z, color, speed) {
    for (let i = 0; i < this.count; i++) {
      if (this.alive[i] > 0) continue;
      this.alive[i] = 0.45;
      this.pos[i * 3] = x;
      this.pos[i * 3 + 1] = y + 0.2;
      this.pos[i * 3 + 2] = z;
      this.col[i * 3] = color.r;
      this.col[i * 3 + 1] = color.g;
      this.col[i * 3 + 2] = color.b;
      this.vel[i].set((Math.random() - 0.5) * speed, 0.4 + Math.random(), (Math.random() - 0.5) * speed);
      return;
    }
  }
  update(dt) {
    for (let i = 0; i < this.count; i++) {
      if (this.alive[i] <= 0) {
        this.pos[i * 3 + 1] = -99;
        continue;
      }
      this.alive[i] -= dt;
      this.pos[i * 3] += this.vel[i].x * dt;
      this.pos[i * 3 + 1] += this.vel[i].y * dt;
      this.pos[i * 3 + 2] += this.vel[i].z * dt;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}

class SkidMarks {
  constructor(scene) {
    const c = document.createElement("canvas");
    c.width = 32;
    c.height = 64;
    const g = c.getContext("2d");
    const grd = g.createLinearGradient(0, 0, 32, 0);
    grd.addColorStop(0, "rgba(0,0,0,0)");
    grd.addColorStop(0.16, "rgba(8,8,8,0.82)");
    grd.addColorStop(0.5, "rgba(0,0,0,1)");
    grd.addColorStop(0.84, "rgba(8,8,8,0.82)");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 32, 64);
    const tex = new THREE.CanvasTexture(c);
    const geo = new THREE.PlaneGeometry(0.42, 1.35);
    geo.rotateX(-Math.PI / 2);
    this.pool = [];
    this.cursor = 0;
    this.group = new THREE.Group();
    for (let i = 0; i < 520; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        color: 0x070707,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      m.renderOrder = 2;
      m.userData.life = 0;
      this.group.add(m);
      this.pool.push(m);
    }
    scene.add(this.group);
  }
  stamp(x, y, z, yaw) {
    const m = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % this.pool.length;
    m.visible = true;
    m.position.set(x, y, z);
    m.rotation.y = yaw;
    m.userData.life = 5.5;
    m.userData.max = 5.5;
    m.material.opacity = 0.92;
  }
  update(dt) {
    for (const m of this.pool) {
      if (!m.visible) continue;
      m.userData.life -= dt;
      const k = m.userData.life / m.userData.max;
      m.material.opacity = Math.max(0, 0.92 * k);
      if (m.userData.life <= 0) m.visible = false;
    }
  }
}

function dropSkids(car) {
  if (!skids) return;
  const ud = car.mesh.userData;
  const wb = ud.wb || 1.15;
  const tw = ud.tw || 0.76;
  const b = basis(car.yaw);
  const heading = Math.hypot(car.vel.x, car.vel.z) > 2 ? Math.atan2(car.vel.x, car.vel.z) : car.yaw;
  for (const side of [-1, 1]) {
    skids.stamp(
      car.pos.x - b.fx * wb + b.rx * side * tw,
      car.pos.y + 0.08,
      car.pos.z - b.fz * wb + b.rz * side * tw,
      heading
    );
  }
}

function clearRace() {
  if (raceScene) {
    disposeObject(raceScene);
    raceScene = null;
  }
  track = null;
  cars = null;
  playerCar = null;
  particles = null;
  skids = null;
  minimap = null;
}

function buildRace(mapId) {
  clearRace();
  const def = getTrackDef(mapId);
  track = buildTrack(def);
  track.diffMul = def.diffMul;
  track.aiTier = def.difficulty === "Hard" ? "hard" : def.difficulty === "Easy" ? "easy" : "medium";
  raceScene = new THREE.Scene();
  raceScene.environment = envMap;
  raceScene.fog = new THREE.Fog(track.theme.fog, track.theme.fogNear, track.theme.fogFar);
  raceScene.add(track.group);
  particles = new Particles(raceScene);
  skids = new SkidMarks(raceScene);

  const n = track.samples.length;
  cars = [];
  const playerDef = getCar(save.selected);
  const playerIndex = Math.max(0, CARS.findIndex((c) => c.id === playerDef.id));
  const aiBase = CARS[Math.max(0, playerIndex - 1)];
  const playerPhys = statsToPhys(playerDef.stats, playerDef.drive);
  const pace = track.aiTier === "hard" ? 1 : track.aiTier === "medium" ? 0.97 : 0.72;
  const aiPhys = statsToPhys(aiBase.stats, aiBase.drive);
  aiPhys.maxSpeed = playerPhys.maxSpeed * pace;
  aiPhys.accel = playerPhys.accel * (track.aiTier === "easy" ? 0.8 : 0.98);
  const roster = [
    { isPlayer: true, name: (save.name || "PILOT").toUpperCase(), def: playerDef, phys: statsToPhys(playerDef.stats, playerDef.drive), hex: "#f3e534", number: 1 },
    ...AI_DEFS.map((a, i) => ({
      name: a.name,
      def: {
        type: aiBase.type,
        colors: { body: a.color, accent: a.accent, glass: aiBase.colors.glass, rim: aiBase.colors.rim },
        glow: aiBase.glow || null,
      },
      phys: aiPhys,
      skill: a.skill * (track.aiTier === "hard" ? 1.04 : track.aiTier === "easy" ? 0.9 : 0.97),
      hex: a.color,
      number: i + 2,
    })),
  ];
  roster.forEach((r, slot) => {
    const cols = 3;
    const col = slot % cols;
    const row = Math.floor(slot / cols);
    const side = (col - 1) * 6.2;
    const idx = (n - 22 - row * 12 + n) % n;
    const car = makeRacer({
      ...r,
      idx,
      total: idx + (FIELD - slot) * 0.02,
      side,
      sample: track.samples[idx],
    });
    raceScene.add(car.mesh);
    cars.push(car);
    if (r.isPlayer) playerCar = car;
  });
  raceTime = 0;
  countdown = 3.25;
  countLabel = "3";
  $("countdown").textContent = "3";
  $("countdown").classList.remove("hidden");
  raceDone = false;
  finishTimer = 0;
  paused = false;
  resultsOpen = false;
  snapCam = true;
  wrongT = 0;
  lastLapShown = 0;
  setLights(1);
  audio.beep(false);
  buildMinimap();
  activeScene = raceScene;
  screen = "race";
  camera.fov = 63;
  nitroZoom = 0;
  camera.updateProjectionMatrix();
  $("toast").classList.add("hidden");
  toastTimer = 0;
  $("menu").classList.add("hidden");
  $("map-modal").classList.add("hidden");
  $("pause").classList.add("hidden");
  $("results").classList.add("hidden");
  $("hud").classList.remove("hidden");
  syncPad();
}

function setLights(phase) {
  if (!track?.lights) return;
  track.lights.forEach((lamp, i) => {
    const mat = lamp.material;
    if (phase >= 4) {
      mat.color.set("#39f58a");
      mat.emissive.set("#39f58a");
      mat.emissiveIntensity = 2.4;
    } else if (i < phase) {
      mat.color.set("#ff2a2a");
      mat.emissive.set("#ff1a1a");
      mat.emissiveIntensity = 2.2;
    } else {
      mat.color.set("#4a1515");
      mat.emissive.set("#330808");
      mat.emissiveIntensity = 0.15;
    }
  });
}

function onPlayerFinish() {
  if (raceDone) return;
  raceDone = true;
  finalPlace = placeOf(cars, playerCar);
  finalTime = raceTime;
  finishTimer = 1.2;
}

function showResults() {
  resultsOpen = true;
  const place = finalPlace;
  const reward = rewardFor(place, getTrackDef(selectedMap).difficulty);
  save.coins += reward;
  save.earned = (save.earned || 0) + reward;
  save.races = (save.races || 0) + 1;
  if (place === 1) save.wins = (save.wins || 0) + 1;
  if (!save.bestPlace || place < save.bestPlace) save.bestPlace = place;
  const mapId = track ? getTrackDef(selectedMap).id : selectedMap;
  if (!save.bestTimes[mapId] || finalTime < save.bestTimes[mapId]) save.bestTimes[mapId] = finalTime;
  const laps = (playerCar?.lapTimes || []).filter((t) => t > 1);
  const bestLap = laps.length ? Math.min(...laps) : null;
  if (bestLap && (!save.bestLaps[mapId] || bestLap < save.bestLaps[mapId])) save.bestLaps[mapId] = bestLap;
  save.lastMap = selectedMap;
  saveGame();
  if (reward) audio.reward();
  const card = $("results-card");
  card.classList.toggle("win", place <= 3);
  $("res-place").textContent = place + ".";
  $("res-title").textContent = place === 1 ? "WIN" : place <= 3 ? "PODIUM" : "OUTSIDE TOP 3";
  $("res-reward").textContent = reward ? `+${formatCoins(reward)} COINS` : "NO PRIZE";
  $("res-stats").innerHTML = `Time ${formatTime(finalTime)}${bestLap ? `<br>Best lap ${formatTime(bestLap)}` : ""}${reward ? "" : "<br>Only the top 3 earn coins"}`;
  $("results").classList.remove("hidden");
  $("streaks")?.classList.add("hidden");
  $("fx").classList.remove("boost");
  $("hud").classList.add("hidden");
  $("countdown").classList.add("hidden");
  if (place <= 3) burst();
  audio.engineStop();
}

function burst() {
  const wrap = document.createElement("div");
  wrap.className = "confetti";
  const colors = ["#f3e534", "#fff", "#ff4fd8", "#35e1ff", "#ff7a3c"];
  for (let i = 0; i < 48; i++) {
    const d = document.createElement("i");
    d.style.left = Math.random() * 100 + "%";
    d.style.background = colors[i % colors.length];
    d.style.animationDuration = 1.6 + Math.random() * 1.3 + "s";
    d.style.animationDelay = Math.random() * 0.3 + "s";
    wrap.appendChild(d);
  }
  document.body.appendChild(wrap);
  setTimeout(() => wrap.remove(), 3200);
}

function beginRace() {
  audio.unlock();
  closeMaps();
  const boot = $("boot");
  boot.classList.remove("hidden");
  boot.querySelector(".boot-title").textContent = "BUILDING TRACK";
  setTimeout(() => {
    try {
      buildRace(selectedMap);
      boot.classList.add("hidden");
      $("boot-error").textContent = "";
    } catch (err) {
      console.error(err);
      boot.classList.add("hidden");
      $("menu").classList.remove("hidden");
      screen = "menu";
      toast("Could not start the race. Try another track.");
    }
  }, 50);
}

function toLobby() {
  audio.engineStop();
  clearRace();
  screen = "menu";
  paused = false;
  resultsOpen = false;
  mapOpen = false;
  activeScene = menuScene;
  camera.fov = 34;
  camera.updateProjectionMatrix();
  $("hud").classList.add("hidden");
  $("pause").classList.add("hidden");
  $("results").classList.add("hidden");
  $("countdown").classList.add("hidden");
  $("race-hint").classList.add("hidden");
  document.body.classList.remove("pad");
  $("touch").classList.add("hidden");
  $("menu").classList.remove("hidden");
  $("fx").className = "";
  $("streaks")?.classList.add("hidden");
  refreshMeta();
  if (tab === "shop") renderShop();
  if (tab === "career") renderCareer();
  swapLobbyCar();
}

function buildMinimap() {
  const b = track.bounds;
  const w = 336, h = 336, pad = 28;
  const sc = Math.min((w - pad * 2) / (b.maxX - b.minX || 1), (h - pad * 2) / (b.maxZ - b.minZ || 1));
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  minimap = {
    sc, cx, cz, w, h,
    pts: track.samples.filter((_, i) => i % 2 === 0).map((s) => [w / 2 + (s.pos.x - cx) * sc, h / 2 + (s.pos.z - cz) * sc]),
  };
}

function drawMinimap() {
  if (!minimap) return;
  const ctx = $("mmap").getContext("2d");
  const { w, h, pts, sc, cx, cz } = minimap;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "rgba(8,12,28,0.2)";
  ctx.fillRect(0, 0, w, h);
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.strokeStyle = "rgba(255,255,255,0.88)";
  ctx.lineWidth = 8;
  ctx.stroke();
  const order = [...cars].sort((a, b) => b.total - a.total);
  for (const car of [...order].reverse()) {
    const x = w / 2 + (car.pos.x - cx) * sc;
    const y = h / 2 + (car.pos.z - cz) * sc;
    ctx.beginPath();
    ctx.fillStyle = car.isPlayer ? "#f3e534" : car.hex;
    ctx.arc(x, y, car.isPlayer ? 8 : 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function updateHUD() {
  const place = raceDone ? finalPlace : placeOf(cars, playerCar);
  $("hud-place").textContent = String(place);
  const lap = raceDone ? 3 : Math.min(3, (playerCar.laps || 0) + 1);
  $("hud-lap").textContent = String(lap);
  $("hud-time").textContent = formatTime(raceDone ? finalTime : raceTime);
  $("hud-speed").textContent = String(Math.round(Math.abs(playerCar.speed) * 6.4));
  $("nitro-fill").style.width = playerCar.nitro + "%";
  const order = [...cars].sort((a, b) => b.total - a.total);
  const rows = $("board").children;
    order.forEach((car, i) => {
    const li = rows[i];
    if (!li) return;
    li.classList.toggle("me", car.isPlayer);
    li.children[0].textContent = String(i + 1);
    li.children[1].textContent = car.name;
    li.style.color = car.isPlayer ? "" : car.hex;
  });
  $("wrong").classList.toggle("hidden", wrongT <= 0);
  const boosting = !!playerCar.nitroActive;
  $("fx").classList.toggle("on", boosting);
  $("fx").classList.toggle("boost", boosting);
  $("streaks")?.classList.toggle("hidden", !boosting);
}

function updateRaceCam(dt, cinematic) {
  const zoomTarget = playerCar?.nitroActive ? 1 : 0;
  nitroZoom += (zoomTarget - nitroZoom) * Math.min(1, dt * 3.4);
  const pace = Math.min(1, Math.abs(playerCar.speed) / 80);
  const back = (cinematic ? 10.6 : 9.3) + nitroZoom * 1.9 + pace * 1.5;
  const height = (cinematic ? 4.15 : 3.5) + nitroZoom * 0.48 + pace * 0.35;
  const ahead = (cinematic ? 8.5 : 11.2) + nitroZoom * 0.8;
  const sin = Math.sin(playerCar.yaw);
  const cos = Math.cos(playerCar.yaw);
  camDesired.set(playerCar.pos.x - sin * back, playerCar.pos.y + height, playerCar.pos.z - cos * back);
  lookDesired.set(playerCar.pos.x + sin * ahead, playerCar.pos.y + 1.05, playerCar.pos.z + cos * ahead);
  if (snapCam) {
    camera.position.copy(camDesired);
    lookS.copy(lookDesired);
    snapCam = false;
  } else {
    const k = 1 - Math.exp(-4.4 * dt);
    camera.position.lerp(camDesired, k);
    lookS.lerp(lookDesired, k);
  }
  if (shake > 0.01) {
    camera.position.x += (Math.random() - 0.5) * shake * 0.4;
    camera.position.y += (Math.random() - 0.5) * shake * 0.22;
    shake *= Math.exp(-6 * dt);
  }
  camera.lookAt(lookS);
  const fov = (cinematic ? 60 : 63) + nitroZoom * 5 + Math.min(2.5, Math.abs(playerCar.speed) * 0.04);
  if (Math.abs(camera.fov - fov) > 0.25) {
    camera.fov += (fov - camera.fov) * 0.15;
    camera.updateProjectionMatrix();
  }
  track.sun.position.set(playerCar.pos.x + 26, playerCar.pos.y + 48, playerCar.pos.z + 14);
  track.sun.target.position.set(playerCar.pos.x, playerCar.pos.y, playerCar.pos.z);
  track.sun.target.updateMatrixWorld();
}

function countPhase(cd) {
  if (cd > 2.45) return { n: 1, label: "3" };
  if (cd > 1.65) return { n: 2, label: "2" };
  if (cd > 0.85) return { n: 3, label: "1" };
  if (cd > 0) return { n: 4, label: "GO!" };
  return { n: 4, label: "" };
}

function updateRace(dt) {
  if (resultsOpen) return;
  if (paused) {
    audio.engineStop();
    $("streaks")?.classList.add("hidden");
    return;
  }
  if (countdown > 0) {
    countdown -= dt;
    const phase = countPhase(Math.max(countdown, 0));
    if (phase.label !== countLabel) {
      countLabel = phase.label;
      if (phase.label) {
        audio.beep(phase.label === "GO!");
        const el = $("countdown");
        el.textContent = phase.label;
        el.classList.remove("hidden");
        el.style.animation = "none";
        void el.offsetWidth;
        el.style.animation = "";
      }
    }
    setLights(phase.n);
    if (countdown <= 0) {
      $("countdown").classList.add("hidden");
      countLabel = "";
      setLights(4);
      hintT = 6.5;
    }
    updateRaceCam(dt, countdown > 0.2);
    audio.engineUpdate(8, 40, true, false);
    if (playerCar) {
      updateHUD();
      drawMinimap();
    }
    return;
  }
  raceTime += dt;
  const time = raceTime;
  for (const car of cars) {
    const inp = car.isPlayer ? readInput() : aiInput(car, time);
    stepCar(car, dt, inp, true);
    if (Math.abs(car.speed) < 1.1 && (car.isPlayer ? inp.throttle : true)) car.stuck += dt;
    else car.stuck = 0;
    if (car.stuck > 2.3) respawn(car);
    syncVisual(car, dt);
    if (car.drifting && Math.abs(car.speed) > 7) {
      car.skidAcc = (car.skidAcc || 0) + Math.hypot(car.vel.x, car.vel.z) * dt;
      if (car.skidAcc > 0.28) {
        car.skidAcc = 0;
        if (car.isPlayer) dropSkids(car);
      }
      if (car.isPlayer && Math.random() < 0.85) {
        const b = basis(car.yaw);
        const wb = car.mesh.userData.wb || 1.15;
        const tw = car.mesh.userData.tw || 0.76;
        for (const side of [-1, 1]) {
          particles.emit(
            car.pos.x - b.fx * wb + b.rx * side * tw,
            car.pos.y,
            car.pos.z - b.fz * wb + b.rz * side * tw,
            SMOKE,
            0.7
          );
        }
      }
    }
    if (car.nitroActive && Math.random() < 0.8) {
      const b = basis(car.yaw);
      particles.emit(car.pos.x - b.fx * 1.8, car.pos.y + 0.3, car.pos.z - b.fz * 1.8, FLAME, 1.5);
    }
    if (car.hit > 0.25 && car.isPlayer) {
      shake = Math.max(shake, car.hit);
      audio.hit();
      $("fx").classList.add("hit");
      setTimeout(() => $("fx").classList.remove("hit"), 140);
    }
    car.hit = 0;
  }
  collide();
  particles.update(dt);
  if (skids) skids.update(dt);
  if (track.waterUniforms) track.waterUniforms.uTime.value += dt;
  if (playerCar.wrong) wrongT = 0.7;
  else wrongT = Math.max(0, wrongT - dt);
  if (hintT > 0) hintT -= dt;
  $("race-hint").classList.toggle("hidden", hintT <= 0);
  if (playerCar.laps > lastLapShown && !raceDone) {
    lastLapShown = playerCar.laps;
    const flash = $("lap-flash");
    flash.textContent = `LAP ${Math.min(3, playerCar.laps + 1)}`;
    flash.classList.remove("hidden");
    setTimeout(() => flash.classList.add("hidden"), 900);
  }
  if (raceDone) {
    finishTimer -= dt;
    if (finishTimer <= 0) showResults();
  }
  updateHUD();
  drawMinimap();
  updateRaceCam(dt, false);
  audio.engineUpdate(playerCar.speed, playerCar.phys.maxSpeed, readInput().throttle, playerCar.nitroActive);
}

function readInput() {
  const right = keys.has("KeyD") || keys.has("ArrowRight") || keys.has("touch-right");
  const left = keys.has("KeyA") || keys.has("ArrowLeft") || keys.has("touch-left");
  return {
    throttle: keys.has("KeyW") || keys.has("ArrowUp") || keys.has("touch-gas"),
    brake: keys.has("KeyS") || keys.has("ArrowDown") || keys.has("touch-brake"),
    steer: (right ? 1 : 0) - (left ? 1 : 0),
    nitro: keys.has("ShiftLeft") || keys.has("ShiftRight") || keys.has("touch-nitro"),
    handbrake: keys.has("Space") || keys.has("touch-drift"),
  };
}

function makePalm() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.24, 2.6, 6),
    new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.9 })
  );
  trunk.position.y = 1.3;
  g.add(trunk);
  const leaf = new THREE.MeshStandardMaterial({ color: 0x2f9d4f, roughness: 0.7 });
  for (let i = 0; i < 6; i++) {
    const pivot = new THREE.Group();
    pivot.position.y = 2.5;
    pivot.rotation.y = (i / 6) * Math.PI * 2;
    const frond = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 1.35), leaf);
    frond.position.z = 0.55;
    frond.rotation.x = 0.55;
    pivot.add(frond);
    g.add(pivot);
  }
  return g;
}

function tintSky(shop) {
  const top = new THREE.Color(shop ? "#5a237f" : "#243e9e");
  const mid = new THREE.Color(shop ? "#ff6a3c" : "#ff8a55");
  const bottom = new THREE.Color(shop ? "#ffb15e" : "#ffc9a0");
  lobbySky.uniforms.top.value.copy(top);
  lobbySky.uniforms.mid.value.copy(mid);
  lobbySky.uniforms.bottom.value.copy(bottom);
}

function buildLobby() {
  menuScene = new THREE.Scene();
  menuScene.environment = envMap;
  lobbySky = createSky({
    top: "#243e9e",
    mid: "#ff8a55",
    bottom: "#ffc9a0",
    sun: "#ffe7c4",
    sunDir: [0.25, 0.16, -0.55],
  });
  menuScene.add(lobbySky.mesh);
  menuScene.fog = new THREE.Fog(0xff8d55, 24, 62);

  const water = new THREE.Mesh(
    new THREE.CircleGeometry(180, 40),
    new THREE.MeshStandardMaterial({ color: 0x1c74b0, roughness: 0.18, metalness: 0.35 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.35;
  menuScene.add(water);
  const sand = new THREE.Mesh(
    new THREE.CircleGeometry(80, 48),
    new THREE.MeshStandardMaterial({ color: 0xe6c48a, roughness: 1 })
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.y = -0.12;
  sand.receiveShadow = true;
  menuScene.add(sand);

  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const hill = new THREE.Mesh(
      new THREE.ConeGeometry(10 + (i % 3) * 3, 16 + (i % 2) * 8, 6),
      new THREE.MeshStandardMaterial({ color: i % 2 ? 0x3e8f52 : 0x67a15a, roughness: 0.9 })
    );
    hill.position.set(Math.cos(a) * 70, 4, Math.sin(a) * 48 - 10);
    menuScene.add(hill);
  }
  for (let i = 0; i < 10; i++) {
    const palm = makePalm();
    const a = (i / 10) * Math.PI * 2 + 0.3;
    const r = 10.5 + (i % 3) * 2.4;
    palm.position.set(Math.cos(a) * r, 0, Math.sin(a) * r * 0.75);
    menuScene.add(palm);
  }

  anchor = new THREE.Group();
  anchor.position.set(0.9, 0.18, 0);
  menuScene.add(anchor);
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(3.15, 3.25, 0.16, 40),
    new THREE.MeshStandardMaterial({ color: 0x171b2a, metalness: 0.55, roughness: 0.38 })
  );
  disc.receiveShadow = true;
  anchor.add(disc);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x35e1ff, side: THREE.DoubleSide });
  lobbyRing = new THREE.Mesh(new THREE.RingGeometry(1.85, 2.05, 64), ringMat);
  lobbyRing.rotation.x = -Math.PI / 2;
  lobbyRing.position.y = 0.11;
  const ring2 = new THREE.Mesh(
    new THREE.RingGeometry(1.35, 1.48, 64),
    new THREE.MeshBasicMaterial({ color: 0xff4fd8, side: THREE.DoubleSide })
  );
  ring2.rotation.x = -Math.PI / 2;
  ring2.position.y = 0.12;
  const ringSpin = new THREE.Group();
  ringSpin.add(lobbyRing, ring2);
  anchor.add(ringSpin);
  anchor.userData.ringSpin = ringSpin;

  const hemi = new THREE.HemisphereLight(0xffc9a4, 0x3c6e58, 0.9);
  const sun = new THREE.DirectionalLight(0xfff1d2, 3.4);
  lobbySun = sun;
  sun.position.set(6, 10, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 30;
  sun.shadow.camera.left = -8;
  sun.shadow.camera.right = 8;
  sun.shadow.camera.top = 8;
  sun.shadow.camera.bottom = -8;
  menuScene.add(hemi, sun, sun.target);
  sun.target.position.set(0.9, 0.5, 0);
  const rimA = new THREE.SpotLight(0xff4fd8, 900, 18, 0.6, 0.35, 1);
  rimA.position.set(-2.5, 4.5, 2);
  const rimB = new THREE.SpotLight(0x35e1ff, 800, 18, 0.6, 0.35, 1);
  rimB.position.set(4.2, 4.2, 1.5);
  const under = new THREE.PointLight(0x35e1ff, 60, 8, 2);
  under.position.set(0.9, 0.4, 0);
  menuScene.add(rimA, rimA.target, rimB, rimB.target, under);
  rimA.target.position.set(0.9, 0.6, 0);
  rimB.target.position.set(0.9, 0.6, 0);
  swapLobbyCar();
  activeScene = menuScene;
}

let carRot = -0.65;
let drag = false;
let padForced = null;
let lastX = 0;

function swapLobbyCar() {
  if (!anchor) return;
  if (lobbyCar) anchor.remove(lobbyCar);
  const def = getCar(shownId());
  lobbyCar = buildCarMesh(def, { number: 1 });
  lobbyCar.rotation.y = carRot;
  lobbyCar.position.y = 0.1;
  anchor.add(lobbyCar);
}

function updateMenu(dt) {
  if (!anchor) return;
  if (!drag) carRot += dt * 0.25;
  const shop = tab === "shop" && !mapOpen;
  const targetX = shop ? 2.25 : 0.95;
  anchor.position.x = THREE.MathUtils.damp(anchor.position.x, targetX, 3.5, dt);
  if (lobbyCar) lobbyCar.rotation.y = carRot;
  if (anchor.userData.ringSpin) anchor.userData.ringSpin.rotation.y += dt * 0.35;
  if (lobbySun) {
    lobbySun.position.set(anchor.position.x + 4, 10, 7);
    lobbySun.target.position.set(anchor.position.x, 0.6, 0);
    lobbySun.target.updateMatrixWorld();
  }
  camDesired.set(anchor.position.x + 2.5, 2.25, 6.9);
  camera.position.lerp(camDesired, 1 - Math.exp(-3 * dt));
  camera.lookAt(anchor.position.x, 0.42, 0);
  shownCoins += (save.coins - shownCoins) * Math.min(1, dt * 5);
  if (Math.abs(save.coins - shownCoins) < 0.4) shownCoins = save.coins;
  $("coin-val").textContent = formatCoins(shownCoins);
  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0) $("toast").classList.add("hidden");
  }
}

function isTouchDevice() {
  const ua = navigator.userAgent || "";
  const iPad = /iPad/.test(ua) || (navigator.platform === "MacIntel" && (navigator.maxTouchPoints || 0) > 1);
  return iPad
    || (navigator.maxTouchPoints || 0) > 0
    || "ontouchstart" in window
    || matchMedia("(pointer: coarse)").matches
    || matchMedia("(hover: none)").matches;
}

function chosenControl() {
  return save.control === "pad" ? "pad" : "pc";
}
function paintDevices() {
  const mode = chosenControl();
  $("device-pad")?.classList.toggle("on", mode === "pad");
  $("device-pc")?.classList.toggle("on", mode === "pc");
  const status = $("device-status");
  if (status) {
    status.textContent = mode === "pad"
      ? "iPad: touch controls show in the race"
      : "Computer: no touch controls";
  }
  const hint = document.querySelector("#panel-play .hint");
  if (hint) {
    hint.textContent = mode === "pad"
      ? "Right side = gas · left side = steer · DRIFT and NITRO on the buttons"
      : "WASD drive · SPACE drift · SHIFT nitro · R reset";
  }
  syncPad();
}
function setControl(mode) {
  save.control = mode === "pad" ? "pad" : "pc";
  saveGame();
  paintDevices();
  syncPad();
}
function syncPad() {
  const mode = chosenControl();
  const on = screen === "race" && mode === "pad";
  document.body.classList.toggle("ctrl-pad", mode === "pad");
  document.body.classList.toggle("ctrl-pc", mode !== "pad");
  document.body.classList.toggle("racing", screen === "race");
  document.body.classList.toggle("pad", on);
  const el = $("touch");
  if (el) el.classList.toggle("hidden", !on);
  const padBtn = $("hud-pad");
  if (padBtn) padBtn.classList.toggle("hidden", mode !== "pad");
  const hint = $("race-hint");
  if (hint) hint.textContent = on ? "Hold the right side for gas · left side to steer" : "WASD drive · SPACE drift · SHIFT nitro";
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (camera) {
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }
  if (renderer) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(w, h);
  }
  syncPad();
}

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - loop.last) / 1000 || 0.016);
  loop.last = now;
  if (screen === "race") updateRace(dt);
  else updateMenu(dt);
  renderer.render(activeScene, camera);
}
loop.last = performance.now();

function bind() {
  document.querySelectorAll(".tab").forEach((b) => {
    b.onclick = () => {
      audio.unlock();
      audio.click();
      setTab(b.dataset.tab);
    };
  });
  $("play-btn").onclick = openMaps;
  const pickDevice = (mode, msg) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    audio.unlock();
    audio.click();
    setControl(mode);
    toast(msg);
  };
  $("device-pad")?.addEventListener("pointerdown", pickDevice("pad", "iPad controls for the next race"));
  $("device-pc")?.addEventListener("pointerdown", pickDevice("pc", "Computer — no touch controls"));
  $("mode-card").onclick = openMaps;
  $("map-back").onclick = () => {
    audio.click();
    closeMaps();
  };
  $("map-go").onclick = beginRace;
  $("resume").onclick = () => {
    paused = false;
    $("pause").classList.add("hidden");
    audio.click();
  };
  $("restart").onclick = () => {
    audio.click();
    beginRace();
  };
  $("quit").onclick = () => {
    audio.click();
    toLobby();
  };
  $("again").onclick = () => {
    audio.click();
    beginRace();
  };
  $("to-lobby").onclick = () => {
    audio.click();
    toLobby();
  };
  $("hud-pause").onclick = () => {
    if (screen !== "race" || resultsOpen) return;
    paused = true;
    $("pause").classList.remove("hidden");
  };
  $("mute").onclick = () => {
    audio.unlock();
    setMuted(!save.muted);
  };
  $("full").onclick = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  };
  $("pname").addEventListener("change", () => {
    save.name = ($("pname").value || "PILOT").slice(0, 12);
    saveGame();
  });
  const holdCounts = new Map();
  const pressCode = (code) => {
    holdCounts.set(code, (holdCounts.get(code) || 0) + 1);
    keys.add(code);
  };
  const releaseCode = (code) => {
    const left = (holdCounts.get(code) || 1) - 1;
    if (left <= 0) {
      holdCounts.delete(code);
      keys.delete(code);
    } else holdCounts.set(code, left);
  };
  const bindPress = (el, code) => {
    const pointers = new Set();
    const down = (e) => {
      e.preventDefault();
      audio.unlock();
      if (pointers.has(e.pointerId)) return;
      pointers.add(e.pointerId);
      try { el.setPointerCapture(e.pointerId); } catch { /* iPad can refuse capture */ }
      pressCode(code);
      el.classList.add("held");
    };
    const up = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      releaseCode(code);
      if (!pointers.size) el.classList.remove("held");
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
  };
  document.querySelectorAll("#touch button[data-hold]").forEach((btn) => {
    bindPress(btn, "touch-" + btn.dataset.hold);
  });
  const steer = $("zone-steer");
  const gas = $("zone-gas");
  if (gas) bindPress(gas, "touch-gas");
  if (steer) {
    const pointers = new Map();
    const apply = () => {
      keys.delete("touch-left");
      keys.delete("touch-right");
      if (!pointers.size) return;
      const x = [...pointers.values()].at(-1);
      if (x < 0.4) keys.add("touch-left");
      else if (x > 0.6) keys.add("touch-right");
    };
    steer.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      audio.unlock();
      const rect = steer.getBoundingClientRect();
      pointers.set(e.pointerId, (e.clientX - rect.left) / Math.max(1, rect.width));
      try { steer.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      apply();
    });
    steer.addEventListener("pointermove", (e) => {
      if (!pointers.has(e.pointerId)) return;
      const rect = steer.getBoundingClientRect();
      pointers.set(e.pointerId, (e.clientX - rect.left) / Math.max(1, rect.width));
      apply();
    });
    const endSteer = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      apply();
    };
    steer.addEventListener("pointerup", endSteer);
    steer.addEventListener("pointercancel", endSteer);
    steer.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
  }
  $("touch-reset")?.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    audio.unlock();
    if (screen === "race" && !resultsOpen && countdown <= 0 && playerCar) respawn(playerCar);
  });
  $("hud-pad")?.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    audio.unlock();
    setControl("pc");
    toast("Computer — touch controls hidden");
  });
  window.addEventListener("keydown", (e) => {
    if (e.target.matches("input, textarea")) return;
    keys.add(e.code);
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
    if (e.code === "Escape") {
      if (screen === "race" && !resultsOpen) {
        paused = !paused;
        $("pause").classList.toggle("hidden", !paused);
      } else if (mapOpen) closeMaps();
      else if (tab !== "play") setTab("play");
    }
    if (e.code === "KeyR" && screen === "race" && !resultsOpen && countdown <= 0) respawn(playerCar);
    if (e.code === "Enter" && mapOpen) beginRace();
  });
  window.addEventListener("keyup", (e) => keys.delete(e.code));
  window.addEventListener("blur", () => keys.clear());
  $("c").addEventListener("pointerdown", (e) => {
    audio.unlock();
    $("c").focus();
    if (screen !== "menu" || mapOpen) return;
    drag = true;
    lastX = e.clientX;
  });
  window.addEventListener("pointerup", () => {
    drag = false;
  });
  window.addEventListener("pointermove", (e) => {
    if (!drag) return;
    carRot += (e.clientX - lastX) * 0.01;
    lastX = e.clientX;
  });
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", () => setTimeout(resize, 80));
  window.addEventListener("pointerdown", () => audio.unlock());
  document.addEventListener("gesturestart", (e) => e.preventDefault());
  document.addEventListener("contextmenu", (e) => {
    if (e.target.closest("#touch, #c, .play-btn")) e.preventDefault();
  });
}

function bootBoard() {
  const board = $("board");
  for (let i = 0; i < FIELD; i++) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="bp"></span><span class="bn"></span>`;
    board.appendChild(li);
  }
}

function buildStreaks() {
  const el = $("streaks");
  if (!el || el.childElementCount) return;
  for (let side = 0; side < 2; side++) {
    for (let i = 0; i < 12; i++) {
      const s = document.createElement("i");
      s.className = side ? "r" : "l";
      s.style.setProperty("--x", (2 + Math.random() * 14).toFixed(1) + "%");
      s.style.setProperty("--d", (0.26 + Math.random() * 0.22).toFixed(2) + "s");
      s.style.setProperty("--delay", (-Math.random() * 0.45).toFixed(2) + "s");
      s.style.setProperty("--h", (16 + Math.random() * 18).toFixed(0) + "vh");
      s.style.setProperty("--w", (2 + Math.random() * 2.5).toFixed(1) + "px");
      el.appendChild(s);
    }
  }
}

function init() {
  const canvas = $("c");
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.16;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  camera = new THREE.PerspectiveCamera(34, 1, 0.1, 6500);
  camera.position.set(2.4, 1.5, 5);
  resize();
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
  } catch (err) {
    console.warn(err);
  }
  buildLobby();
  buildStreaks();
  bootBoard();
  bind();
  setMuted(!!save.muted);
  refreshMeta();
  setTab("play");
  $("boot").classList.add("hidden");
  $("menu").classList.remove("hidden");
  if (!save.shopGrant) {
    save.coins = (save.coins || 0) + 2000;
    save.shopGrant = true;
    save.seenTip = true;
    saveGame();
    shownCoins = save.coins;
    refreshMeta();
    setTimeout(() => toast("2,000 coins — pick a car and press BUY"), 400);
  } else if (!save.seenTip) {
    save.seenTip = true;
    saveGame();
    setTimeout(() => toast("Hard pays 2,000 for 1st. Medium pays 1,500."), 400);
  }
  requestAnimationFrame(loop);
}

try {
  init();
} catch (err) {
  console.error(err);
  const el = $("boot-error");
  if (el) el.textContent = "WebGL could not start in this browser.";
}
