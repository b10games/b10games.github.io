// Rendering basics: renderer, one world scene with a sky that can change mood (sunny, storm, snow,
// volcano...), lights, fog, materials and small helpers.
import * as THREE from 'three';
export { THREE };

// quality: 'high' (shadows, sharp), 'low' (Fast: no shadows) or 'ultra' (Ultra Fast: fewer pixels, no
// smoothing of edges, for iPads and old computers)
export function createRenderer(canvas, quality) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: quality === 'high', powerPreference: quality === 'ultra' ? 'low-power' : 'high-performance' });
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.05;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'ultra' ? 0.75 : quality === 'low' ? 1 : 1.75));
  r.shadowMap.enabled = quality === 'high';
  r.setSize(window.innerWidth, window.innerHeight, false);
  return r;
}

// ---------- sky ----------
const SKY_VS = `varying vec3 vDir; void main(){ vDir = (modelMatrix * vec4(position,0.)).xyz; vec4 p = projectionMatrix * viewMatrix * modelMatrix * vec4(position,1.); gl_Position = p.xyww; }`;
const SKY_FS = `uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunCol; uniform float sunK; uniform float flash; varying vec3 vDir;
void main(){ vec3 d = normalize(vDir); float h = d.y;
  vec3 c = h > 0. ? mix(mid, top, pow(clamp(h,0.,1.), .55)) : mix(mid, bottom, pow(clamp(-h,0.,1.), .45));
  float s = max(dot(d, normalize(sunDir)), 0.);
  c += sunCol * (pow(s, 90.) * 2.2 + pow(s, 8.) * .22) * sunK;
  c += vec3(.8, .85, 1.) * flash;
  gl_FragColor = vec4(c, 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// The weather moods. Every disaster picks one; the sky, fog and lights blend smoothly between them.
export const MOODS = {
  sunny:   { skyTop: '#3d8bff', skyMid: '#bfe3ff', skyBottom: '#8ec9ef', fog: '#cfe8ff', fogNear: 90, fogFar: 420, sun: '#fff1d6', sunInt: 3.1, sunK: 1, hemiSky: '#dff0ff', hemiGround: '#6b8f4e', hemiInt: 1.15, exposure: 1.05 },
  rain:    { skyTop: '#3b4a5e', skyMid: '#8695a8', skyBottom: '#5d6b7a', fog: '#8d9aab', fogNear: 40, fogFar: 260, sun: '#d9e2ef', sunInt: 1.2, sunK: 0.1, hemiSky: '#a9b8cc', hemiGround: '#4a5a45', hemiInt: 1.2, exposure: 1.0 },
  storm:   { skyTop: '#151b2e', skyMid: '#3a4360', skyBottom: '#252c40', fog: '#3a4258', fogNear: 30, fogFar: 210, sun: '#9fb2ff', sunInt: 0.8, sunK: 0, hemiSky: '#7a88b8', hemiGround: '#2e3528', hemiInt: 1.0, exposure: 1.15 },
  dust:    { skyTop: '#7a6a55', skyMid: '#c9b08a', skyBottom: '#a48a68', fog: '#b9a07c', fogNear: 30, fogFar: 230, sun: '#ffe2b0', sunInt: 2.0, sunK: 0.4, hemiSky: '#e6d2b0', hemiGround: '#6b5a40', hemiInt: 1.1, exposure: 1.0 },
  volcano: { skyTop: '#3a1410', skyMid: '#c4552a', skyBottom: '#5a2316', fog: '#8a3f25', fogNear: 40, fogFar: 260, sun: '#ffb070', sunInt: 2.0, sunK: 0.6, hemiSky: '#ff9a6a', hemiGround: '#3a2018', hemiInt: 1.05, exposure: 1.05 },
  snow:    { skyTop: '#9fb3c8', skyMid: '#e4edf5', skyBottom: '#c9d6e2', fog: '#e8eff6', fogNear: 14, fogFar: 120, sun: '#ffffff', sunInt: 1.4, sunK: 0.15, hemiSky: '#eef5ff', hemiGround: '#a7b4c2', hemiInt: 1.45, exposure: 1.0 },
  acid:    { skyTop: '#26331a', skyMid: '#8fa65a', skyBottom: '#4d5c2e', fog: '#8a9a5a', fogNear: 35, fogFar: 240, sun: '#e4ffb0', sunInt: 1.3, sunK: 0.2, hemiSky: '#c6e09a', hemiGround: '#3c4a28', hemiInt: 1.2, exposure: 1.05 },
  meteor:  { skyTop: '#1d1630', skyMid: '#7a4a6a', skyBottom: '#40284a', fog: '#6a4560', fogNear: 60, fogFar: 330, sun: '#ffc48a', sunInt: 1.8, sunK: 0.5, hemiSky: '#c99ac0', hemiGround: '#3a3030', hemiInt: 1.1, exposure: 1.1 }
};

export function makeSky() {
  const m = new THREE.ShaderMaterial({
    vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, bottom: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0.55, 0.62, 0.35).normalize() }, sunCol: { value: new THREE.Color() }, sunK: { value: 1 }, flash: { value: 0 }
    }
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), m);
  sky.frustumCulled = false; sky.renderOrder = -1;
  return sky;
}

// The world scene with sky, light and fog. atmos.set(mood) blends to a new mood; setFocus keeps the
// shadow box around the camera's target.
export function makeWorldScene(quality) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(new THREE.Color(), 90, 420);
  const sky = makeSky(); scene.add(sky);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  const sd = new THREE.Vector3(0.55, 0.62, 0.35).normalize();
  sun.castShadow = quality === 'high';
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -50; sc.right = 50; sc.top = 50; sc.bottom = -50; sc.near = 1; sc.far = 300;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);
  const cur = {}, from = {}, to = {};
  const COLORS = ['skyTop', 'skyMid', 'skyBottom', 'fog', 'sun', 'hemiSky', 'hemiGround'], NUMS = ['fogNear', 'fogFar', 'sunInt', 'sunK', 'hemiInt', 'exposure'];
  for (const k of COLORS) { cur[k] = new THREE.Color(); from[k] = new THREE.Color(); to[k] = new THREE.Color(); }
  const atmos = {
    k: 1, speed: 0.5, flash: 0, mood: 'sunny', renderer: null,
    set(name, instant) {
      const m = MOODS[name] || MOODS.sunny; this.mood = name;
      for (const k of COLORS) { from[k].copy(cur[k]); to[k].set(m[k]); }
      for (const k of NUMS) { from[k] = cur[k] ?? m[k]; to[k] = m[k]; }
      this.k = instant ? 1 : 0;
      if (instant) this.apply(1);
    },
    apply(t) {
      for (const k of COLORS) cur[k].copy(from[k]).lerp(to[k], t);
      for (const k of NUMS) cur[k] = from[k] + (to[k] - from[k]) * t;
      const u = sky.material.uniforms;
      u.top.value.copy(cur.skyTop); u.mid.value.copy(cur.skyMid); u.bottom.value.copy(cur.skyBottom); u.sunCol.value.copy(cur.sun); u.sunK.value = cur.sunK;
      scene.fog.color.copy(cur.fog); scene.fog.near = cur.fogNear; scene.fog.far = cur.fogFar;
      sun.color.copy(cur.sun); sun.intensity = cur.sunInt;
      hemi.color.copy(cur.hemiSky); hemi.groundColor.copy(cur.hemiGround); hemi.intensity = cur.hemiInt;
      if (this.renderer) this.renderer.toneMappingExposure = cur.exposure;
    },
    update(dt) {
      if (this.k < 1) { this.k = Math.min(1, this.k + dt * this.speed); const t = this.k * this.k * (3 - 2 * this.k); this.apply(t); }
      // lightning flash
      if (this.flash > 0) { this.flash = Math.max(0, this.flash - dt * 3.5); }
      sky.material.uniforms.flash.value = this.flash * 0.9;
      hemi.intensity = cur.hemiInt + this.flash * 3;
    }
  };
  atmos.set('sunny', true);
  scene.userData = {
    sky, sun, hemi, atmos,
    setFocus(v) { sun.position.copy(v).addScaledVector(sd, 140); sun.target.position.copy(v); sky.position.copy(v); }
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
    color: new THREE.Color(color), roughness: o.rough ?? 0.7, metalness: o.metal ?? 0,
    emissive: o.emissive ? new THREE.Color(o.emissive) : new THREE.Color(0), emissiveIntensity: o.ei ?? 1,
    transparent: o.opacity !== undefined, opacity: o.opacity ?? 1, flatShading: !!o.flat, side: o.double ? THREE.DoubleSide : THREE.FrontSide,
    depthWrite: o.depthWrite ?? true
  });
  if (o.map) { m.map = o.map; m.userData.own = true; return m; }
  cache.set(key, m);
  return m;
}

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

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export function angDiff(a, b) { const d = a - b; return Math.atan2(Math.sin(d), Math.cos(d)); }

// Seeded random numbers, so every player in a party sees exactly the same disaster.
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1000003) / 1000003; };
}
// Smooth wobbly numbers from time (for wind, shaking and wandering tornadoes): the same on every computer.
export function wave(t, seed) { return Math.sin(t * 0.73 + seed) * 0.5 + Math.sin(t * 1.37 + seed * 2.1) * 0.3 + Math.sin(t * 2.91 + seed * 3.7) * 0.2; }
