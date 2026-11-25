// Rendering basics for STEEP: renderer, sky, small math helpers and canvas textures.
import * as THREE from 'three';
export { THREE };

// Graphics modes (shown on screen as QUALITY / FAST / ULTRA FAST):
//  high   = QUALITY: sharp (more pixels), big soft shadows, the most trees, glow, colour grading and motion blur
//  medium = FAST: normal pixels, smaller shadows, fewer trees, no post effects
//  low    = ULTRA FAST: fewer pixels than the screen, no shadow maps (a soft blob under the skier),
//           a coarser mountain, few trees, few particles
export const QUALITY = {
  low:    { ratio: 0.7,  aa: false, shadows: 0,    trees: 0.35, snow: 0,    far: 1300, name: 'ULTRA FAST' },
  medium: { ratio: 1,    aa: true,  shadows: 1024, trees: 0.7,  snow: 600,  far: 2200, name: 'FAST' },
  high:   { ratio: 1.6,  aa: true,  shadows: 2048, trees: 1.1,  snow: 1500, far: 3000, name: 'QUALITY' }
};

export function createRenderer(canvas, q, scale = 1) {
  const Q = QUALITY[q] || QUALITY.medium;
  const r = new THREE.WebGLRenderer({ canvas, antialias: Q.aa, powerPreference: q === 'low' ? 'low-power' : 'high-performance' });
  r.outputColorSpace = THREE.SRGBColorSpace;
  // AgX keeps bright snow white and soft instead of flat grey
  r.toneMapping = THREE.AgXToneMapping;
  r.toneMappingExposure = 1.42;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  applyQuality(r, q, scale);
  return r;
}
export function applyQuality(r, q, scale = 1) {
  const Q = QUALITY[q] || QUALITY.medium;
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.ratio) * scale);
  r.shadowMap.enabled = Q.shadows > 0;
  r.setSize(window.innerWidth, window.innerHeight, false);
}

// ---------- sky: a gradient, haze at the horizon, the sun (or the moon) with a glow, stars at night and
// drifting clouds whose cover follows the weather ----------
const SKY_VS = `varying vec3 vDir; void main(){ vDir = (modelMatrix * vec4(position,0.)).xyz; vec4 p = projectionMatrix * viewMatrix * modelMatrix * vec4(position,1.); gl_Position = p.xyww; }`;
const SKY_FS = `uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunCol; uniform vec3 moonDir;
uniform float time; uniform float clouds; uniform float cover; uniform float night; uniform vec3 cloudCol; uniform float sunVis; varying vec3 vDir;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hash3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), f.x), f.y); }
float fbm(vec2 p){ float s = 0., a = .5; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 7.1; a *= .5; } return s; }
void main(){ vec3 d = normalize(vDir); float h = d.y;
  vec3 c = h > 0. ? mix(mid, top, pow(clamp(h, 0., 1.), .42)) : mix(mid, bottom, pow(clamp(-h, 0., 1.), .35));
  float s = max(dot(d, normalize(sunDir)), 0.);
  c += sunCol * sunVis * (pow(s, 1200.) * 12.0 + pow(s, 80.) * .4 + pow(s, 8.) * .16);
  // stars and the moon at night
  if (night > 0.01 && h > 0.0) {
    vec3 cell = floor(d * 260.0); float st = hash3(cell);
    float tw = 0.6 + 0.4 * sin(time * 2.0 + st * 40.0);
    c += vec3(0.85, 0.9, 1.0) * step(0.9975, st) * tw * night * smoothstep(0.0, 0.25, h) * 1.4;
    float m = max(dot(d, normalize(moonDir)), 0.);
    c += vec3(0.9, 0.93, 1.0) * night * (smoothstep(0.99955, 0.9997, m) * 1.6 + pow(m, 60.) * 0.12);
  }
  if (h > 0.0 && clouds > 0.0) {
    vec2 uv = d.xz / (h + .1) * 1.4 + vec2(time * .006, time * .003);
    float n = fbm(uv) + fbm(uv * 3.1 + 2.0) * .25;
    float lo = mix(.6, .2, cover), hi = mix(.95, .75, cover);
    float cov = smoothstep(lo, hi, n) * smoothstep(0., .12, h) * clouds;
    vec3 cc = mix(cloudCol * .82, cloudCol * 1.06, smoothstep(lo + .05, hi + .1, n)) + sunCol * sunVis * pow(s, 6.) * .35;
    c = mix(c, cc, cov);
  }
  gl_FragColor = vec4(c, 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
export function makeSky(t, clouds = 1) {
  const m = new THREE.ShaderMaterial({
    vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(t.skyTop) }, mid: { value: new THREE.Color(t.skyMid) }, bottom: { value: new THREE.Color(t.skyBottom) },
      sunDir: { value: new THREE.Vector3(...t.sunDir).normalize() }, sunCol: { value: new THREE.Color(t.sunColor) }, moonDir: { value: new THREE.Vector3(-0.3, 0.6, 0.7).normalize() },
      time: { value: 0 }, clouds: { value: clouds }, cover: { value: 0.2 }, night: { value: 0 }, cloudCol: { value: new THREE.Color('#ffffff') }, sunVis: { value: 1 }
    }
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(6000, 32, 16), m);
  sky.frustumCulled = false; sky.renderOrder = -1;
  return sky;
}

export function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  return t;
}

// ---------- math ----------
export { clamp, lerp, smooth, damp, wrapAngle, dampAngle, rng } from './math.js';
