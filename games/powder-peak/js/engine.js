// Rendering basics for STEEP: renderer, sky, small math helpers and canvas textures.
import * as THREE from 'three';
export { THREE };

// Graphics levels. Low is made for iPads: fewer pixels, no shadows, a coarser mountain and fewer trees.
export const QUALITY = {
  low:    { ratio: 0.75, aa: false, shadows: 0,    cell: 9,   trees: 0.4,  snow: 0,   trail: false, far: 1500 },
  medium: { ratio: 1,    aa: true,  shadows: 1024, cell: 6.5, trees: 0.7,  snow: 260, trail: true,  far: 2200 },
  high:   { ratio: 1.5,  aa: true,  shadows: 2048, cell: 4,   trees: 1.15, snow: 600, trail: true,  far: 3000 },
  ultra:  { ratio: 2,    aa: true,  shadows: 4096, cell: 3,   trees: 1.45, snow: 1000, trail: true, far: 3600 }
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

// ---------- sky: a deep blue gradient, haze at the horizon, the sun with a glow, and drifting clouds ----------
const SKY_VS = `varying vec3 vDir; void main(){ vDir = (modelMatrix * vec4(position,0.)).xyz; vec4 p = projectionMatrix * viewMatrix * modelMatrix * vec4(position,1.); gl_Position = p.xyww; }`;
const SKY_FS = `uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunCol; uniform float time; uniform float clouds; varying vec3 vDir;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), f.x), f.y); }
float fbm(vec2 p){ float s = 0., a = .5; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 7.1; a *= .5; } return s; }
void main(){ vec3 d = normalize(vDir); float h = d.y;
  vec3 c = h > 0. ? mix(mid, top, pow(clamp(h, 0., 1.), .42)) : mix(mid, bottom, pow(clamp(-h, 0., 1.), .35));
  float s = max(dot(d, normalize(sunDir)), 0.);
  c += sunCol * (pow(s, 1200.) * 12.0 + pow(s, 80.) * .4 + pow(s, 8.) * .16);
  if (h > 0.0 && clouds > 0.0) {
    vec2 uv = d.xz / (h + .1) * 1.4 + vec2(time * .006, time * .003);
    float n = fbm(uv) + fbm(uv * 3.1 + 2.0) * .25;
    float cov = smoothstep(.6, .95, n) * smoothstep(0., .12, h) * clouds;
    vec3 cc = mix(vec3(.78, .83, .9), vec3(1.06), smoothstep(.65, 1.05, n)) + sunCol * pow(s, 6.) * .35;
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
      sunDir: { value: new THREE.Vector3(...t.sunDir).normalize() }, sunCol: { value: new THREE.Color(t.sunColor) },
      time: { value: 0 }, clouds: { value: clouds }
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
