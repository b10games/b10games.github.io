// Rock: the detailed part of the mountain (the snow is kept plain white on purpose).
//  - two textures made once at start (no files): the rock's colour and its height. Grey and dark grey
//    stone with layers (strata), a web of deep cracks, finer cracks, small stones and chipped edges.
//    Both tile seamlessly.
//  - rockShader(): puts that rock on a material in world space from three sides (so cliffs and boulders
//    never look stretched), at two sizes (large forms and small grain), with bump detail from the
//    height (cracks really look cut into the stone). On the mountain it shows where it is too steep for
//    snow; on boulders everywhere except where snow lies on top.
//  - rockGeometry(): a broken boulder: lumpy, then cut by a few fracture planes (flat faces, sharp
//    edges), snow on the top.
import { THREE, clamp, smooth, rng } from './engine.js';

// ---------- seamless noise (wraps every `per` cells) ----------
function hash2(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 982451653) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(u, v, per, s) {
  const x = u * per, y = v * per, xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const a = hash2(((xi % per) + per) % per, ((yi % per) + per) % per, s), b = hash2((((xi + 1) % per) + per) % per, ((yi % per) + per) % per, s);
  const c = hash2(((xi % per) + per) % per, (((yi + 1) % per) + per) % per, s), d = hash2((((xi + 1) % per) + per) % per, (((yi + 1) % per) + per) % per, s);
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
}
function fbm(u, v, per, oct, s) { let t = 0, a = 0.5, n = 0; for (let i = 0; i < oct; i++) { t += a * vnoise(u, v, per << i, s + i * 17); n += a; a *= 0.5; } return t / n; }
// cells: distance to the nearest and second nearest point (seamless): cracks run along F2 - F1 = 0
function worley(u, v, per, s) {
  const x = u * per, y = v * per, xi = Math.floor(x), yi = Math.floor(y);
  let f1 = 9, f2 = 9;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = xi + i, cy = yi + j, wx = ((cx % per) + per) % per, wy = ((cy % per) + per) % per;
    const px = cx + hash2(wx, wy, s), py = cy + hash2(wx, wy, s + 7), d = Math.hypot(px - x, py - y);
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
  }
  return [f1, f2];
}

let TEX = null;
export function rockTextures(size = 512) {
  if (TEX) return TEX;
  const S = size, H = new Float32Array(S * S), C = new Float32Array(S * S * 3);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const u = i / S, v = j / S;
    const warp = fbm(u, v, 4, 4, 11) - 0.5;
    const base = fbm(u + warp * 0.08, v, 6, 5, 3);
    // layers in the stone, bent a little
    const strata = Math.sin((v + warp * 0.18 + fbm(u, v, 3, 2, 5) * 0.06) * Math.PI * 2 * 9) * 0.5 + 0.5;
    // big cracks between blocks, and finer ones
    const w2 = fbm(u, v, 8, 3, 61) - 0.5;
    const [a1, a2] = worley(u + warp * 0.22 + w2 * 0.06, v + warp * 0.12, 5, 21), [b1, b2] = worley(u + w2 * 0.08, v - warp * 0.06, 14, 37);
    // cracks come and go (not a net), and some are wider than others
    const cw = 0.025 + 0.035 * fbm(u, v, 4, 2, 71);
    const crack = (1 - smooth(0.0, cw, a2 - a1)) * smooth(0.32, 0.6, fbm(u, v, 6, 3, 91)), fine = (1 - smooth(0.0, 0.025, b2 - b1)) * smooth(0.3, 0.65, fbm(u, v, 10, 2, 93));
    // the blocks are a little rounded, chipped at the edges
    const block = smooth(0.0, 0.35, a2 - a1);
    const pebble = smooth(0.62, 0.8, fbm(u, v, 40, 2, 51));
    let h = base * 0.45 + strata * 0.12 + block * 0.35 + pebble * 0.08 - crack * 0.55 - fine * 0.18;
    H[j * S + i] = h;
    // colour: dark grey stone, lighter grey on the raised parts and the layers, near black in cracks
    const tone = 0.21 + base * 0.2 + strata * 0.06 + block * 0.1 + pebble * 0.07 - crack * 0.17 - fine * 0.06;
    const cool = (fbm(u, v, 3, 2, 77) - 0.5) * 0.03;
    C[(j * S + i) * 3] = tone - cool; C[(j * S + i) * 3 + 1] = tone; C[(j * S + i) * 3 + 2] = tone + cool * 1.4 + 0.008;
  }
  let lo = 1e9, hi = -1e9; for (const h of H) { lo = Math.min(lo, h); hi = Math.max(hi, h); }
  const mk = (fill) => { const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'), img = g.createImageData(S, S); fill(img.data); g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; return t; };
  const albedo = mk((d) => { for (let k = 0; k < S * S; k++) { for (let c = 0; c < 3; c++) d[k * 4 + c] = clamp(C[k * 3 + c], 0, 1) * 255; d[k * 4 + 3] = 255; } });
  albedo.colorSpace = THREE.SRGBColorSpace;
  const height = mk((d) => { for (let k = 0; k < S * S; k++) { const v = (H[k] - lo) / (hi - lo) * 255; d[k * 4] = d[k * 4 + 1] = d[k * 4 + 2] = v; d[k * 4 + 3] = 255; } });
  height.colorSpace = THREE.NoColorSpace;
  TEX = { albedo, height };
  return TEX;
}

// mode 'terrain': rock where the vertex attribute `rock` says so (steep), white snow elsewhere
// mode 'boulder': rock everywhere except where the vertex colour is white (snow on top)
export function rockShader(mat, mode, lq) {
  const T = rockTextures();
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.rockTex = { value: T.albedo }; sh.uniforms.rockH = { value: T.height };
    let v = sh.vertexShader.replace('#include <common>', `#include <common>
      varying vec3 vWPos; varying vec3 vWNor; ${mode === 'terrain' ? 'attribute float rock; varying float vRock;' : ''}`);
    v = v.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      { vec4 wp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
        #endif
        vWPos = (modelMatrix * wp).xyz; }
      vWNor = normalize((vec4(transformedNormal, 0.0) * viewMatrix).xyz);
      ${mode === 'terrain' ? 'vRock = rock;' : ''}`);
    sh.vertexShader = v;
    let f = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vWPos; varying vec3 vWNor; ${mode === 'terrain' ? 'varying float vRock;' : ''}
      uniform sampler2D rockTex; uniform sampler2D rockH;
      float rockMask; float rockHgt; float rockBmp;
      // the rock seen from three sides, blended by the surface direction
      vec4 tri(sampler2D t, vec3 p, vec3 w, float s) {
        return texture2D(t, p.zy * s) * w.x + texture2D(t, p.xz * s + 0.31) * w.y + texture2D(t, p.xy * s + 0.67) * w.z;
      }
      vec3 bumpN(vec3 n, float h, float k) {
        vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
        float hx = dFdx(h) * k, hy = dFdy(h) * k;
        vec3 r1 = cross(sy, n), r2 = cross(n, sx);
        float det = dot(sx, r1);
        vec3 g = sign(det) * (hx * r1 + hy * r2);
        return normalize(abs(det) * n - g);
      }`);
    // colour: white snow, or rock
    f = f.replace('#include <color_fragment>', `#include <color_fragment>
      rockMask = 0.0; rockHgt = 0.5; rockBmp = 0.5;
      ${mode === 'terrain' ? 'if (vRock > 0.02)' : ''} {
        vec3 w = pow(abs(normalize(vWNor)), vec3(4.0)); w /= (w.x + w.y + w.z);
        vec3 p = vWPos;
        // three sizes: the big forms of a cliff (60 m), the blocks (13 m) and the grain (3 m)
        vec4 cL = tri(rockTex, p, w, 0.016), hL = tri(rockH, p, w, 0.016);
        vec4 c1 = tri(rockTex, p, w, 0.075), h1 = tri(rockH, p, w, 0.075);
        ${lq ? 'vec4 c2 = c1, h2 = h1;' : 'vec4 c2 = tri(rockTex, p, w, 0.29), h2 = tri(rockH, p, w, 0.29);'}
        float dist = length(vWPos - cameraPosition), near = 1.0 - smoothstep(60.0, 220.0, dist), far = smoothstep(150.0, 900.0, dist);
        rockHgt = mix(mix(h1.r, h1.r * 0.55 + h2.r * 0.45, near), hL.r, 0.15 + far * 0.3);
        rockBmp = mix(h1.r, hL.r, 0.3);
        vec3 rc = mix(mix(c1.rgb, c1.rgb * 0.5 + c2.rgb * 0.5, near), cL.rgb, 0.12 + far * 0.3);
        rc *= 0.84 + hL.r * 0.3;
        // snow lying on thin ledges across the rock (where it is not too steep)
        float band = 0.5 + 0.5 * (0.6 * sin(vWPos.y * 0.55 + hL.r * 11.0 + cL.g * 6.0) + 0.4 * sin(vWPos.y * 1.6 + h1.r * 6.0));
        float ledge = smoothstep(0.7 + hL.r * 0.25, 0.97, band) * smoothstep(0.25, 0.55, vWNor.y) * (1.0 - far * 0.7);
        ${mode === 'terrain'
          ? 'rockMask = smoothstep(0.42, 0.62, vRock + (rockHgt - 0.5) * 0.5) * (1.0 - 0.85 * ledge);'
          : 'rockMask = smoothstep(0.35, 0.65, (1.0 - vColor.r) + (rockHgt - 0.5) * 0.45);'}
        diffuseColor.rgb = mix(${mode === 'terrain' ? 'diffuseColor.rgb' : 'vec3(1.0)'}, rc * 1.15, rockMask);
      }`);
    f = f.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, 0.86, rockMask);`);
    // bump: the cracks and edges catch the light
    if (!lq) f = f.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      if (rockMask > 0.01) normal = normalize(mix(normal, bumpN(normal, rockBmp, ${mode === 'terrain' ? '2.6' : '2.0'}), rockMask * (1.0 - smoothstep(35.0, 160.0, length(vWPos - cameraPosition)))));`);
    sh.fragmentShader = f;
  };
  mat.customProgramCacheKey = () => 'rock-' + mode + (lq ? '-lq' : '');
}

// ---------- a broken boulder ----------
export function rockGeometry(seed, detail = 2, shape = 0) {
  const g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position, r = rng(seed);
  const sx = [1.3, 1.65, 0.95][shape], sy = [0.78, 0.6, 1.2][shape], sz = [1, 0.85, 0.9][shape];
  // a few fracture planes: everything beyond a plane is pushed back onto it (flat faces, sharp edges)
  const cuts = [];
  for (let i = 0; i < 5 + Math.floor(r() * 4); i++) {
    const a = r() * Math.PI * 2, b = (r() - 0.35) * 1.4;
    const n = new THREE.Vector3(Math.cos(a) * Math.cos(b), Math.sin(b), Math.sin(a) * Math.cos(b)).normalize();
    cuts.push([n, 0.62 + r() * 0.3]);
  }
  const ph = [r() * 9, r() * 9, r() * 9];
  const v = new THREE.Vector3(), col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i)).normalize();
    // lumps
    let k = 1 + 0.16 * Math.sin(v.x * 3.1 + ph[0]) * Math.cos(v.z * 2.7 + v.y * 1.3 + ph[1]) + 0.08 * Math.sin(v.y * 7 + v.x * 5 + ph[2]) + 0.04 * Math.sin(v.x * 13 + v.z * 11);
    v.multiplyScalar(k);
    for (const [n, d] of cuts) { const e = v.dot(n) - d; if (e > 0) v.addScaledVector(n, -e * 0.92); }
    v.x *= sx; v.y *= sy; v.z *= sz;
    if (v.y > 0.5 * sy) v.y = 0.5 * sy + (v.y - 0.5 * sy) * 0.6;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  // snow lies on the top (white), the rest is rock (black in the vertex colour = "rock here")
  const nor = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const up = nor.getY(i), y = p.getY(i) / sy;
    const snow = clamp(smooth(0.62, 0.92, up) * smooth(0.1, 0.5, y) * 0.9 + 0.15 * Math.sin(p.getX(i) * 4 + p.getZ(i) * 3), 0, 1);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = snow;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
