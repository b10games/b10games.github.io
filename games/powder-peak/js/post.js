// The finishing touch on High and Ultra: a soft glow on the brightest snow and the sun, gentle colour
// grading (cool shadows, warm light) and a light vignette. Switches itself off if the computer is too slow.
import { THREE } from './engine.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const GRADE = {
  uniforms: { tDiffuse: { value: null }, vig: { value: 0.32 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float vig; varying vec2 vUv;
    void main(){
      vec4 t = texture2D(tDiffuse, vUv); vec3 c = t.rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      // cool shadows, a touch of warmth in the light
      c *= mix(vec3(0.94, 0.98, 1.08), vec3(1.04, 1.01, 0.97), smoothstep(0.05, 0.9, l));
      // a little more colour
      c = mix(vec3(l), c, 1.1);
      // vignette
      vec2 d = vUv - 0.5; c *= 1.0 - vig * smoothstep(0.25, 0.95, dot(d, d) * 2.2);
      gl_FragColor = vec4(c, t.a);
    }`
};

export class Post {
  constructor(renderer, quality) {
    this.r = renderer; this.ok = quality === 'high' || quality === 'ultra'; this.frames = 0; this.slow = 0;
    if (!this.ok) return;
    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: quality === 'ultra' ? 4 : 2 });
    this.c = new EffectComposer(renderer, rt);
    this.pass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.55, 1.05);
    this.c.addPass(this.pass); this.c.addPass(this.bloom); this.c.addPass(new ShaderPass(GRADE)); this.c.addPass(new OutputPass());
    this.size();
  }
  size() { if (!this.c) return; this.c.setPixelRatio(this.r.getPixelRatio()); this.c.setSize(Math.max(1, innerWidth), Math.max(1, innerHeight)); }
  render(scene, cam, dt) {
    if (!innerWidth || !innerHeight) return;            // a hidden window has no size: nothing to draw
    if (!this.ok || !this.c) { this.r.render(scene, cam); return; }
    this.pass.scene = scene; this.pass.camera = cam;
    this.c.render(dt);
    // keep it smooth: too many slow frames and the effects switch off
    if (document.visibilityState === 'visible' && dt < 0.25) { this.frames++; if (dt > 1 / 36) this.slow++; if (this.frames >= 240) { if (this.slow > 170) { this.ok = false; console.info('Effects switched off to keep the game smooth'); } this.frames = this.slow = 0; } }
  }
}
