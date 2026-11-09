// Rendering basics: renderer, scenes with sky, lights, fog, materials and helpers.
import * as THREE from 'three';
export { THREE };

export function createRenderer(canvas, quality) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.05;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  applyQuality(r, quality);
  return r;
}
export function applyQuality(r, quality) {
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'low' ? 1 : 1.75));
  r.shadowMap.enabled = quality !== 'low';
  r.setSize(window.innerWidth, window.innerHeight, false);
}

// ---------- sky ----------
const SKY_VS = `varying vec3 vDir; void main(){ vDir = (modelMatrix * vec4(position,0.)).xyz; vec4 p = projectionMatrix * viewMatrix * modelMatrix * vec4(position,1.); gl_Position = p.xyww; }`;
const SKY_FS = `uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunCol; varying vec3 vDir;
void main(){ vec3 d = normalize(vDir); float h = d.y;
  vec3 c = h > 0. ? mix(mid, top, pow(clamp(h,0.,1.), .55)) : mix(mid, bottom, pow(clamp(-h,0.,1.), .45));
  float s = max(dot(d, normalize(sunDir)), 0.);
  c += sunCol * (pow(s, 90.) * 2.2 + pow(s, 8.) * .22);
  gl_FragColor = vec4(c, 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function makeSky(theme) {
  const m = new THREE.ShaderMaterial({
    vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(theme.skyTop) }, mid: { value: new THREE.Color(theme.skyMid) },
      bottom: { value: new THREE.Color(theme.skyBottom) }, sunDir: { value: new THREE.Vector3(...theme.sunDir).normalize() },
      sunCol: { value: new THREE.Color(theme.sunColor) }
    }
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), m);
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  return sky;
}

// A scene with the theme's sky, light and fog. setFocus keeps the shadow box around the action.
export function makeWorldScene(theme, quality) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(new THREE.Color(theme.fog), theme.fogNear, theme.fogFar);
  const sky = makeSky(theme);
  scene.add(sky);
  const hemi = new THREE.HemisphereLight(new THREE.Color(theme.hemiSky), new THREE.Color(theme.hemiGround), theme.hemiInt);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(new THREE.Color(theme.sunColor), theme.sunInt);
  const sd = new THREE.Vector3(...theme.sunDir).normalize();
  sun.castShadow = quality !== 'low';
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 260;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const focus = new THREE.Vector3();
  scene.userData = {
    sky, sun, hemi,
    setFocus(v) {
      focus.copy(v);
      sun.position.copy(v).addScaledVector(sd, 120);
      sun.target.position.copy(v);
      sky.position.copy(v);
    }
  };
  scene.userData.setFocus(new THREE.Vector3());
  return scene;
}

// ---------- materials ----------
const cache = new Map();
export function M(color, o = {}) {
  const key = o.map ? null : color + JSON.stringify(o);   // textured materials are never shared
  if (key && cache.has(key)) return cache.get(key);
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color), roughness: o.rough ?? 0.55, metalness: o.metal ?? 0,
    emissive: o.emissive ? new THREE.Color(o.emissive) : new THREE.Color(0), emissiveIntensity: o.ei ?? 1,
    transparent: !!o.opacity, opacity: o.opacity ?? 1, flatShading: !!o.flat, side: o.double ? THREE.DoubleSide : THREE.FrontSide
  });
  if (o.map) { m.map = o.map; m.userData.own = true; return m; }
  cache.set(key, m);
  return m;
}
export function clearMaterialCache() { cache.forEach(m => m.dispose()); cache.clear(); }

// Canvas texture helper.
export function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  return t;
}

// Scrolling surface for lava, water, neon grids, conveyors.
export function surfaceTex(kind, a, b) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = a; g.fillRect(0, 0, w, h);
    if (kind === 'lava') {
      for (let i = 0; i < 70; i++) {
        g.strokeStyle = i % 3 ? b : '#ffe066'; g.lineWidth = 2 + Math.random() * 6; g.globalAlpha = 0.6;
        g.beginPath(); const x = Math.random() * w, y = Math.random() * h; g.moveTo(x, y);
        for (let k = 0; k < 4; k++) g.lineTo(x + (Math.random() - 0.5) * 120, y + (Math.random() - 0.5) * 120);
        g.stroke();
      }
    } else if (kind === 'water') {
      g.globalAlpha = 0.45; g.strokeStyle = b; g.lineWidth = 3;
      for (let i = 0; i < 40; i++) {
        const y = Math.random() * h; g.beginPath(); g.moveTo(0, y);
        for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x * 0.05 + i) * 6);
        g.stroke();
      }
    } else if (kind === 'grid') {
      g.strokeStyle = b; g.lineWidth = 3; g.globalAlpha = 0.9;
      for (let i = 0; i <= w; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); }
    } else if (kind === 'stripes') {
      g.fillStyle = b;
      for (let i = -h; i < w; i += 48) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 24, 0); g.lineTo(i + 24 + h, h); g.lineTo(i + h, h); g.fill(); }
    } else if (kind === 'checker') {
      g.fillStyle = b;
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if ((x + y) % 2) g.fillRect(x * w / 8, y * h / 8, w / 8, h / 8);
    } else if (kind === 'clouds') {
      g.globalAlpha = 0.5; g.fillStyle = b;
      for (let i = 0; i < 60; i++) { g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 10 + Math.random() * 30, 0, 7); g.fill(); }
    }
  });
}

export function shadows(obj, cast = true, receive = true) {
  obj.traverse(o => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = receive; } });
  return obj;
}

export function disposeTree(obj) {
  obj.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material && !Array.isArray(o.material) && o.material.userData && o.material.userData.own) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
  });
}

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
export function angDiff(a, b) { let d = a - b; return Math.atan2(Math.sin(d), Math.cos(d)); }

// Deterministic random numbers so every player builds the exact same map.
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}
