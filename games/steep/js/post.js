// The finishing touch in QUALITY mode: a soft glow on the brightest snow and the sun, gentle colour
// grading (cool shadows, warm light), a light vignette and motion blur at high speed (the picture
// streaks out from the middle).
import { THREE } from './engine.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const GRADE = {
  uniforms: { tDiffuse: { value: null }, vig: { value: 0.3 }, blur: { value: 0 }, center: { value: new THREE.Vector2(0.5, 0.45) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float vig; uniform float blur; uniform vec2 center; varying vec2 vUv;
    void main(){
      vec4 t = texture2D(tDiffuse, vUv); vec3 c = t.rgb;
      if (blur > 0.0005) {
        // motion blur: average along the line to the middle (more at the edges)
        vec2 d = (vUv - center) * blur; vec3 s = c;
        for (int i = 1; i < 8; i++) s += texture2D(tDiffuse, vUv - d * float(i)).rgb;
        c = s / 8.0;
      }
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
    this.r = renderer; this.frames = 0; this.slow = 0;
    this.setQuality(quality);
  }
  // only HIGH has the glow and colour grading (it can be switched on and off while playing)
  setQuality(q) {
    this.ok = q === 'high';
    if (!this.ok || this.c) return;
    const quality = q;
    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 2 });
    this.c = new EffectComposer(this.r, rt);
    this.pass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.28, 0.5, 1.08);
    this.grade = new ShaderPass(GRADE);
    this.c.addPass(this.pass); this.c.addPass(this.bloom); this.c.addPass(this.grade); this.c.addPass(new OutputPass());
    this.size();
  }
  size() { if (!this.c) return; this.c.setPixelRatio(this.r.getPixelRatio()); this.c.setSize(Math.max(1, innerWidth), Math.max(1, innerHeight)); }
  // motion blur 0..1 (from the speed)
  setBlur(k) { if (this.grade) this.grade.uniforms.blur.value = k * 0.012; }
  render(scene, cam, dt) {
    if (!innerWidth || !innerHeight) return;            // a hidden window has no size: nothing to draw
    if (!this.ok || !this.c) { this.r.render(scene, cam); return; }
    this.pass.scene = scene; this.pass.camera = cam;
    this.c.render(dt);
    // keep it smooth: too many slow frames and the effects switch off

  }
}
