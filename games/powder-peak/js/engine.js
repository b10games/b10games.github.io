// Rendering basics for Powder Peak: renderer, sky, small math helpers and canvas textures.
import * as THREE from 'three';
export { THREE };

// Graphics levels. Low is made for iPads: fewer pixels, no shadows, a coarser mountain and fewer trees.
export const QUALITY = {
  low:    { ratio: 0.75, aa: false, shadows: 0,    cell: 9,   trees: 0.4,  snow: 0,   trail: false, far: 1500 },
  medium: { ratio: 1,    aa: true,  shadows: 1024, cell: 6.5, trees: 0.7,  snow: 260, trail: true,  far: 2200 },
  high:   { ratio: 1.5,  aa: true,  shadows: 2048, cell: 5,   trees: 1,    snow: 600, trail: true,  far: 3000 },
  ultra:  { ratio: 2,    aa: true,  shadows: 4096, cell: 4,   trees: 1.25, snow: 1000, trail: true, far: 3600 }
};

export function createRenderer(canvas, q, scale = 1) {
  const Q = QUALITY[q] || QUALITY.medium;
  const r = new THREE.WebGLRenderer({ canvas, antialias: Q.aa, powerPreference: q === 'low' ? 'low-power' : 'high-performance' });
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.0;
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

// ---------- sky: a gradient with a soft sun ----------
const SKY_VS = `varying vec3 vDir; void main(){ vDir = (modelMatrix * vec4(position,0.)).xyz; vec4 p = projectionMatrix * viewMatrix * modelMatrix * vec4(position,1.); gl_Position = p.xyww; }`;
const SKY_FS = `uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunCol; varying vec3 vDir;
void main(){ vec3 d = normalize(vDir); float h = d.y;
  vec3 c = h > 0. ? mix(mid, top, pow(clamp(h,0.,1.), .5)) : mix(mid, bottom, pow(clamp(-h,0.,1.), .4));
  float s = max(dot(d, normalize(sunDir)), 0.);
  c += sunCol * (pow(s, 300.) * 4.0 + pow(s, 12.) * .25);
  gl_FragColor = vec4(c, 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
export function makeSky(t) {
  const m = new THREE.ShaderMaterial({
    vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(t.skyTop) }, mid: { value: new THREE.Color(t.skyMid) }, bottom: { value: new THREE.Color(t.skyBottom) },
      sunDir: { value: new THREE.Vector3(...t.sunDir).normalize() }, sunCol: { value: new THREE.Color(t.sunColor) }
    }
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(4000, 32, 16), m);
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
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const damp = (a, b, k, dt) => b + (a - b) * Math.exp(-k * dt);
export const wrapAngle = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
export const dampAngle = (a, b, k, dt) => a + wrapAngle(b - a) * (1 - Math.exp(-k * dt));
export function rng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1000000) / 1000000; }; }
