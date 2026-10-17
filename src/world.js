// The NaxaStudio home page: a world of light the visitor scrolls through.
//
// Everything starts from one point of light, the idea (as the old home page did). Scrolling takes it on one
// continuous journey, like a film the visitor plays with the scroll, and the same particles become everything on
// the way:
//   0 the point    1 the mark (the logo, in depth)    2 a river: idea, action, result    3 the knot of daily
//   business    4 the five assistants    5 the first layer (the startup solution)    6 the cases: tangled
//   before, flowing after    7 a map of opportunities (the business review)    8 one again: the mark, and an invitation
// Scrolling back plays it backwards. The words of each stage are ordinary HTML (<section data-stage>) laid over
// the picture and rise in as their scene forms; a line of narration (<p class="sub">) carries the story across
// each flight from one scene to the next; small labels (<… data-tag>) follow the places they name. Without WebGL,
// or with reduced motion, the same sections read as a plain page.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js';
import { initAsk } from './ask.js';

const doc = document.documentElement;
const CAPTURE = /[?&]capture/.test(location.search);
const LAST = 8; // the last stage
const sections = [...document.querySelectorAll('[data-stage]')];

function canWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch (e) {
    return false;
  }
}
const still = !CAPTURE && (matchMedia('(prefers-reduced-motion: reduce)').matches || /[?&]static/.test(location.search));
if (still || !canWebGL()) {
  // the plain page: the stages one under another
  doc.classList.add('static');
  initAsk((s) => sections[s] && sections[s].scrollIntoView({ behavior: 'smooth', block: 'center' }));
} else {
  doc.classList.add('webgl');
  world().catch((err) => {
    // if anything goes wrong, the page is still there to read
    console.error(err);
    doc.classList.remove('webgl');
    doc.classList.add('static');
  });
}

async function world() {
  const canvas = document.getElementById('world');
  let W = innerWidth, H = innerHeight;
  let PORT = H > W * 1.05; // a phone held upright: things are stacked instead of side by side
  const SMALL = Math.min(W, H) < 600;
  const SIDE = SMALL ? 256 : 384, N = SIDE * SIDE; // the particles live in a SIDE x SIDE texture

  // ---------------------------------------------------------------- renderer
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: CAPTURE });
  let PR = Math.min(devicePixelRatio || 1, 2);
  renderer.setPixelRatio(PR);
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // colours are given as they should look
  renderer.setClearColor(0x02050d, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(PORT ? 58 : 40, W / H, 0.05, 400);

  // the air: the deep navy of the brand, and slow drifting haze tinted by the scene it is in; the nearer layer
  // slides more than the farther one as the camera travels, so it has depth
  const bgMat = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: { uAsp: { value: W / H }, uS: { value: 0 }, uT: { value: 0 }, uCam: { value: new THREE.Vector3() } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }`,
    fragmentShader: `varying vec2 vUv; uniform float uAsp, uS, uT; uniform vec3 uCam;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p){
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      float fbm(vec2 p){
        float s = 0.0, a = 0.5;
        for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
        return s;
      }
      vec3 tint(float k){
        return k < 0.5 ? vec3(0.25, 0.45, 1.0) : k < 1.5 ? vec3(0.3, 0.5, 1.0) : k < 2.5 ? vec3(0.2, 0.62, 0.95) : k < 3.5 ? vec3(1.0, 0.42, 0.18)
          : k < 4.5 ? vec3(0.55, 0.4, 1.0) : k < 5.5 ? vec3(0.18, 0.78, 0.8) : k < 6.5 ? vec3(0.75, 0.5, 0.45) : k < 7.5 ? vec3(0.3, 0.5, 1.0) : vec3(0.35, 0.45, 1.0);
      }
      void main(){
        vec2 p = vUv - vec2(0.5, 0.48);
        p.x *= uAsp;
        float g = exp(-dot(p, p) * 2.0);
        float k = floor(uS);
        vec3 tc = mix(tint(k), tint(k + 1.0), smoothstep(0.0, 1.0, uS - k));
        vec3 c = vec3(0.006, 0.012, 0.03) + vec3(0.016, 0.03, 0.075) * g;
        vec2 q1 = p * 1.5 + vec2(uCam.x * 0.04 + uT * 0.012, uCam.y * 0.04 - uCam.z * 0.01);
        vec2 q2 = p * 2.8 + vec2(uCam.x * 0.1 - uT * 0.01, uCam.y * 0.1 - uCam.z * 0.026);
        float f1 = fbm(q1);
        float f2 = fbm(q2 + f1 * 1.6 + vec2(0.0, uT * 0.02));
        float haze = smoothstep(0.38, 0.95, f1) * 0.55 + smoothstep(0.42, 1.0, f2) * 0.6;
        c += tc * haze * (0.028 + 0.075 * g) * min(1.0, 0.2 + uS);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMat);
  bg.frustumCulled = false;
  bg.renderOrder = -1;
  scene.add(bg);

  // ---------------------------------------------------------------- the places of the world (the shader has the same shapes)
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const riverC = (u) => V(Math.sin(u * 5 + 0.6) * (0.5 + u * 3), -1.8 + u + Math.sin(u * 5) * 0.4, 1 - u * 72);
  const NODES = [0.06, 0.15, 0.24];
  // (side by side they stay clear of the words in the bottom left; on a phone they stand two by two)
  const KNOTS = [V(-3.4, 1.5, -36), V(2.4, 2.0, -38), V(1.8, -1.7, -34), V(5.6, -0.6, -36)];
  const KNOTS_P = [V(-4.6, 1.5, -36), V(4.0, 1.9, -38), V(-3.3, -1.9, -34), V(4.6, -1.5, -35)];
  const knotAt = (p) => V(p.x * 0.5, (p.y - 0.2) * 1.3 + 0.2, p.z);
  const knotCenter = (k) => (PORT ? knotAt(KNOTS_P[k]) : KNOTS[k].clone());
  const formScale = () => (PORT ? 0.62 : 1);
  const formCenter = (g) => (PORT ? V(g % 2 ? 0.95 : -0.95, 2.9 - g * 1.45, -58) : V((g - 2) * 3.7, -0.15 - Math.abs(g - 2) * 0.12, -58 + Math.abs(g - 2) * 0.6));
  const layerC = () => (PORT ? V(0, 0.2, -80) : V(1.6, 0, -80));
  const layerR = (r) => (1 + r * 0.3) * (PORT ? 0.78 : 1);
  const layerY = (r) => -1.7 + r * 1.1;
  const CASE_Z = -102;
  const caseX = () => (PORT ? [-2.4, 2.4] : [-2.4, 4.8]);
  const caseRowY = (r) => (PORT ? 2.4 - r * 1.25 : 2.8 - r * 0.95);
  const MAPC = V(0, -1.8, -124);
  const MAPN = [V(-4.6, 0, 2.4), V(-1.9, 0, -1.4), V(1.2, 0, 1.9), V(4.3, 0, -2.5), V(-3.4, 0, -3.4), V(3.1, 0, 3.3)];
  const mapNode = (k) => {
    const n = MAPN[k].clone();
    if (PORT) (n.x *= 0.4), (n.z *= 1.1);
    return n.add(MAPC);
  };
  const FINAL = V(0, 0, -146);
  const glv = (v) => `vec3(${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`;

  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

  // the mark, sampled from the logo itself: its dark strokes sit forward, its light swooshes further back
  async function sampleMark(n) {
    const img = new Image();
    img.src = canvas.dataset.mark;
    await img.decode();
    const S = 640, c = document.createElement('canvas');
    c.width = S;
    c.height = Math.round((S * img.height) / img.width);
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, c.width, c.height);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const cand = [];
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (let y = 0; y < c.height; y++)
      for (let x = 0; x < c.width; x++) {
        const k = (y * c.width + x) * 4, r = d[k] / 255, gg = d[k + 1] / 255, b = d[k + 2] / 255;
        const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), l = (mx + mn) / 2, sat = mx - mn;
        if ((l > 0.9 && sat < 0.12) || (l > 0.86 && sat < 0.2)) continue; // the white around it
        let h = 0;
        if (sat > 0) {
          h = mx === r ? ((gg - b) / sat) % 6 : mx === gg ? (b - r) / sat + 2 : (r - gg) / sat + 4;
          h *= 60;
          if (h < 0) h += 360;
        }
        // its colours: 0 the dark core, 1 light azure, 2 brand blue, 3 indigo, 4 the teal arrow
        const ci = h > 165 && h < 200 && sat > 0.35 ? 4 : l < 0.3 ? 0 : l < 0.5 ? 2 : l < 0.7 ? 3 : 1;
        cand.push(x, y, ci);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, sc = 6.4 / (maxX - minX);
    const DEPTH = [0.32, -0.45, 0.08, -0.16, 0.22];
    const pos = new Float32Array(n * 3), cls = new Float32Array(n), m = cand.length / 3;
    for (let i = 0; i < n; i++) {
      const k = Math.floor(rnd() * m) * 3;
      pos[i * 3] = (cand[k] - cx) * sc + (rnd() - 0.5) * sc;
      pos[i * 3 + 1] = -(cand[k + 1] - cy) * sc + (rnd() - 0.5) * sc;
      pos[i * 3 + 2] = DEPTH[cand[k + 2]] + (rnd() - 0.5) * 0.14;
      cls[i] = cand[k + 2];
    }
    return { pos, cls };
  }

  // ---------------------------------------------------------------- the particles
  // They live on the graphics card: each frame a small simulation moves every one of them (a spring toward where
  // the story wants it, through slowly swirling air), and then they are drawn like light seen through a lens:
  // sharp where the camera is focused, soft round discs where it is not, drawn out a little when they move fast.
  const SHAPES = /* glsl */ `
  uniform float uT, uPort;
  uniform sampler2D tA, tB, tC, tR, tP;
  vec3 aLogo;
  vec4 aRnd, aP, aInfo; // info: x the mark's colour, y which assistant, w a node of the river
  void loadAttrs(vec2 uv){
    vec4 a = texture2D(tA, uv);
    aLogo = a.xyz;
    aInfo = vec4(a.w, texture2D(tB, uv).w, 0.0, texture2D(tC, uv).w);
    aRnd = texture2D(tR, uv);
    aP = texture2D(tP, uv);
  }
  const float PI = 3.14159265;
  vec3 rotY(vec3 v, float a){ float c = cos(a), s = sin(a); return vec3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z); }
  vec3 rotX(vec3 v, float a){ float c = cos(a), s = sin(a); return vec3(v.x, c * v.y - s * v.z, s * v.y + c * v.z); }
  vec4 hash4(float n){ return fract(sin(vec4(n * 12.9898, n * 78.233, n * 37.719, n * 4.581)) * 43758.5453); }
  // a tangle: one closed, knotted line of light (whole-number frequencies close the loop), different for each thread
  vec3 tangle(vec4 h, float u){
    float a = u * 6.2831853;
    vec3 f1 = floor(h.xyz * 3.0) + 1.0, f2 = floor(h.yzw * 4.0) + 2.0, ph = h.wxy * 6.2831853;
    return sin(a * f1 + ph) * 0.62 + sin(a * f2 + ph.zxy * 1.7) * 0.38;
  }
  // 2: the river, five strands like the swooshes of the mark, flowing away
  vec3 riverC(float u){ return vec3(sin(u * 5.0 + 0.6) * (0.5 + u * 3.0), -1.8 + u + sin(u * 5.0) * 0.4, 1.0 - u * 72.0); }
  vec3 riverAt(float u, float strand, float j){
    vec3 c = riverC(u), c2 = riverC(u + 0.002);
    vec2 tg = normalize(c2.xz - c.xz), nr = vec2(-tg.y, tg.x);
    float w = 1.5 + u * 2.6;
    float lat = (strand - 2.0) * 0.3 * w + j * 0.022 * w;
    float wave = sin(u * 60.0 - uT * 1.2 + strand * 1.3) * 0.07 + sin(u * 23.0 + strand) * 0.12;
    return c + vec3(nr.x * lat, wave + (strand - 2.0) * 0.08, nr.y * lat);
  }
  vec3 river(){
    if (aInfo.w > 0.5) {
      float u = aInfo.w < 1.5 ? ${NODES[0]} : aInfo.w < 2.5 ? ${NODES[1]} : ${NODES[2]};
      vec3 o = aP.xyz - 0.5;
      return riverC(u) + vec3(0.0, 0.3, 0.0) + normalize(o + 1e-4) * pow(length(o) * 1.7, 2.0) * 0.6;
    }
    return riverAt(fract(aP.x + uT * 0.006), floor(aP.y * 5.0), aP.z * 2.0 - 1.0);
  }
  // 4: the five assistants, each a shape that does what it does
  vec3 formCenter(float g){
    if (uPort > 0.5) return vec3(mod(g, 2.0) < 0.5 ? -0.95 : 0.95, 2.9 - g * 1.45, -58.0);
    return vec3((g - 2.0) * 3.7, -0.15 - abs(g - 2.0) * 0.12, -58.0 + abs(g - 2.0) * 0.6);
  }
  vec3 five(){
    float g = aInfo.y, t = uT;
    vec3 p = aP.xyz, q;
    if (g < 0.5) {
      // reception: rings, like a voice that is answered
      float k = floor(p.y * 3.0), a = p.x * 2.0 * PI;
      q = vec3(cos(a), sin(a), 0.0) * (0.72 + k * 0.27) + (p.z - 0.5) * 0.05;
      q = rotY(rotX(q, 0.9 + k * 0.6 + sin(t * 0.4) * 0.2), t * (0.35 + k * 0.15) + k * 2.1);
    } else if (g < 1.5) {
      // follow-up: a vortex drawing leads in and down
      float h = fract(p.x - t * 0.07), r = 0.12 + h * 1.15;
      float a = p.y * 2.0 * PI + t * (0.8 + (1.0 - h) * 2.2) + h * 6.0;
      q = vec3(cos(a) * r, (h - 0.55) * 2.3, sin(a) * r) + (p.z - 0.5) * 0.05;
    } else if (g < 2.5) {
      // marketing: rings going out, like a voice carrying
      float a = p.x * 2.0 * PI, r = fract(p.z + t * 0.22) * 1.35 + 0.06;
      q = rotY(rotX(vec3(cos(a) * r, sin(a) * r, (p.y - 0.5) * 0.06), 0.35), -0.4);
    } else if (g < 3.5) {
      // research: a dense core, and what it looks into turning around it
      if (p.z < 0.35) {
        float th = p.x * 2.0 * PI, ph = acos(1.0 - 2.0 * p.y);
        q = vec3(sin(ph) * cos(th), cos(ph), sin(ph) * sin(th)) * 0.34 * pow(p.z / 0.35, 0.33);
      } else {
        float k = floor(p.y * 3.0), a = p.x * 2.0 * PI + t * (0.5 + k * 0.25);
        q = rotY(rotX(vec3(cos(a), 0.0, sin(a)) * (0.85 + k * 0.22), 0.5 + k * 0.9), k * 1.7) + (fract(p.z * 7.0) - 0.5) * 0.03;
      }
    } else {
      // workflow: a double helix, step after step
      float h = p.x;
      if (p.z < 0.75) {
        float a = h * 4.0 * PI + t * 0.7 + step(0.5, p.y) * PI;
        q = vec3(cos(a) * 0.62, (h - 0.5) * 2.5, sin(a) * 0.62);
      } else {
        float k = floor(h * 10.0) / 10.0 + 0.05, a = k * 4.0 * PI + t * 0.7, w = (p.y - 0.5) * 2.0;
        q = vec3(cos(a) * 0.62 * w, (k - 0.5) * 2.5, sin(a) * 0.62 * w);
      }
    }
    return formCenter(g) + q * (uPort > 0.5 ? 0.62 : 1.0);
  }
  // 5: the first layer: four rings growing up a stem from a seed
  vec3 layerC(){ return uPort > 0.5 ? vec3(0.0, 0.2, -80.0) : vec3(1.6, 0.0, -80.0); }
  float layerR(float r){ return (1.0 + r * 0.3) * (uPort > 0.5 ? 0.78 : 1.0); }
  vec3 layers(){
    vec3 c = layerC();
    if (aP.w < 0.84) {
      float r = floor(aP.x * 4.0), a = aP.y * 2.0 * PI + uT * (0.25 + r * 0.07);
      float R = layerR(r) * (1.0 + (aP.z - 0.5) * 0.06);
      return c + vec3(cos(a) * R, -1.7 + r * 1.1 + sin(a * 3.0 + uT) * 0.03 + (aP.z - 0.5) * 0.03, sin(a) * R);
    }
    if (aP.w < 0.95) {
      float y = mix(-2.3, 2.0, aP.y);
      return c + vec3(sin(y * 1.3 + uT * 0.6) * 0.06 + (aP.z - 0.5) * 0.05, y, (aP.x - 0.5) * 0.05);
    }
    vec3 d = normalize(aP.xyz - 0.5 + 1e-4);
    return c + vec3(0.0, -2.45, 0.0) + d * 0.3 * pow(fract(aP.w * 20.0), 0.4);
  }
  // 6: the cases: a tangle on the left becomes clean lines on the right
  vec2 caseX(){ return uPort > 0.5 ? vec2(-2.4, 2.4) : vec2(-2.4, 4.8); }
  float caseRowY(float r){ return uPort > 0.5 ? 2.4 - r * 1.25 : 2.8 - r * 0.95; }
  vec3 knotAt(vec3 p){ return vec3(p.x * 0.5, (p.y - 0.2) * 1.3 + 0.2, p.z); }
  // 3: the knot of daily business: four snarls, each of ten tangled threads with light running along them
  vec3 knotC(float q){
    vec3 a = q < 0.5 ? ${glv(KNOTS[0])} : q < 1.5 ? ${glv(KNOTS[1])} : q < 2.5 ? ${glv(KNOTS[2])} : ${glv(KNOTS[3])};
    vec3 b = q < 0.5 ? ${glv(KNOTS_P[0])} : q < 1.5 ? ${glv(KNOTS_P[1])} : q < 2.5 ? ${glv(KNOTS_P[2])} : ${glv(KNOTS_P[3])};
    return uPort > 0.5 ? b : a;
  }
  vec3 knots(){
    float q = floor(aP.w * 4.0), j = floor(aP.y * 10.0);
    vec4 h = hash4(q * 10.0 + j + 1.0);
    float u = fract(aP.x + uT * (0.01 + h.x * 0.02) * (h.y < 0.5 ? 1.0 : -1.0));
    vec3 p = knotC(q) + tangle(h, u) * vec3(1.6, 1.05, 1.4) + (aP.z - 0.5) * 0.03;
    return uPort > 0.5 ? knotAt(p) : p;
  }
  vec3 cases(){
    vec2 X = caseX();
    float cx = (X.x + X.y) * 0.5, gap = uPort > 0.5 ? 0.35 : 0.5;
    if (aP.w < 0.5) {
      // before: each row's work is a small snarl of threads
      float r = floor(aP.x * 4.0), j = floor(aP.y * 3.0);
      vec4 h = hash4(r * 3.0 + j + 71.0);
      vec3 t = tangle(h, fract(aP.z + uT * (0.03 + h.x * 0.03)));
      return vec3(mix(X.x, cx - gap, t.x * 0.5 + 0.5), caseRowY(r) + t.y * 0.24, ${CASE_Z.toFixed(1)} + t.z * 0.2);
    }
    float r = floor(aP.x * 4.0);
    if (aP.w < 0.93) {
      float s = floor(aP.z * 5.0);
      return vec3(mix(cx + gap, X.y, fract(aP.y + uT * 0.09)), caseRowY(r) + (s - 2.0) * 0.075, ${CASE_Z.toFixed(1)});
    }
    float u = aP.y, side = aP.z < 0.5 ? 1.0 : -1.0;
    return vec3(cx - 0.08 + u * 0.16, caseRowY(r) + side * (0.16 - u * 0.16), ${CASE_Z.toFixed(1)});
  }
  // 7: a map of where AI can help: a grid, six areas, the route of the first steps, and a scan passing over it
  vec2 mapH(){ return uPort > 0.5 ? vec2(3.4, 6.0) : vec2(6.2, 5.0); }
  vec3 mapNode(float k){
    vec3 n = k < 0.5 ? vec3(-4.6, 0.0, 2.4) : k < 1.5 ? vec3(-1.9, 0.0, -1.4) : k < 2.5 ? vec3(1.2, 0.0, 1.9) : k < 3.5 ? vec3(4.3, 0.0, -2.5) : k < 4.5 ? vec3(-3.4, 0.0, -3.4) : vec3(3.1, 0.0, 3.3);
    if (uPort > 0.5) n.xz *= vec2(0.4, 1.1);
    return vec3(${MAPC.x.toFixed(1)}, ${MAPC.y.toFixed(1)}, ${MAPC.z.toFixed(1)}) + n;
  }
  vec3 map(){
    vec2 h = mapH();
    vec3 c = vec3(${MAPC.x.toFixed(1)}, ${MAPC.y.toFixed(1)}, ${MAPC.z.toFixed(1)});
    if (aP.w < 0.68) {
      float idx = floor(aP.y * 11.0) / 10.0 - 0.5;
      vec3 q = aP.z < 0.5 ? vec3((aP.x - 0.5) * 2.0 * h.x, 0.0, idx * 2.0 * h.y) : vec3(idx * 2.0 * h.x, 0.0, (aP.x - 0.5) * 2.0 * h.y);
      q.y = sin(q.x * 0.5 + uT * 0.5) * 0.04 + sin(q.z * 0.6 - uT * 0.4) * 0.04;
      return c + q;
    }
    if (aP.w < 0.84) {
      float u = fract(aP.x + uT * 0.05) * 3.0, k = floor(u), f = u - k;
      return mix(mapNode(k), mapNode(k + 1.0), f) + vec3(0.0, 0.03 + sin(f * PI) * 0.25, 0.0) + (aP.z - 0.5) * 0.04;
    }
    if (aP.w < 0.97) {
      vec3 d = normalize(vec3(aP.y - 0.5, aP.z - 0.5, fract(aP.y * 7.0) - 0.5) + 1e-4);
      return mapNode(floor(aP.x * 6.0)) + vec3(0.0, 0.18, 0.0) + d * 0.16 * pow(fract(aP.z * 13.0), 0.5);
    }
    float a = aP.x * 2.0 * PI;
    return c + vec3(sin(uT * 0.35) * h.x * 0.6, 0.02, cos(uT * 0.27) * h.y * 0.4) + vec3(cos(a), 0.0, sin(a)) * 1.3;
  }
  vec3 mark(float s, vec3 at){ return aLogo * s + at + vec3(sin(uT * 0.9 + aLogo.y * 2.0) * 0.015, 0.0, 0.0); }
  // 0: the point: a tiny dense heart, with a few motes turning slowly around it
  vec3 seed(){
    if (aRnd.w > 0.99) {
      float a = aP.x * 6.2832 + uT * (0.35 + aP.y * 0.5), r = 0.16 + aP.z * 0.34;
      return rotX(vec3(cos(a) * r, (aP.y - 0.5) * 0.08, sin(a) * r), 0.45 + aP.w * 0.7);
    }
    return normalize(aP.xyz - 0.5 + 1e-4) * 0.05 * aRnd.y * aRnd.z;
  }
  vec3 posAt(int k){
    if (k == 0) return seed();
    if (k == 1) return mark(1.0, vec3(0.0));
    if (k == 2) return river();
    if (k == 3) return knots();
    if (k == 4) return five();
    if (k == 5) return layers();
    if (k == 6) return cases();
    if (k == 7) return map();
    return mark(1.25, vec3(${FINAL.x.toFixed(1)}, ${FINAL.y.toFixed(1)}, ${FINAL.z.toFixed(1)}));
  }
  vec3 markCol(float i){
    return i < 0.5 ? vec3(0.78, 0.88, 1.0) : i < 1.5 ? vec3(0.62, 0.82, 1.0) : i < 2.5 ? vec3(0.31, 0.61, 1.0) : i < 3.5 ? vec3(0.38, 0.46, 1.0) : vec3(0.21, 0.78, 0.88);
  }
  vec3 colAt(int k){
    if (k == 0) return aRnd.w > 0.99 ? vec3(0.5, 0.72, 1.0) * 0.5 : vec3(0.95, 0.97, 1.0) * step(aRnd.z, 0.01);
    if (k == 1 || k == 8) return markCol(aInfo.x) * (1.0 + 1.1 * exp(-pow((aLogo.x + aLogo.y * 0.35 - (mod(uT * 0.9, 14.0) - 7.0)) * 1.4, 2.0)));
    if (k == 2) {
      if (aInfo.w > 0.5) return vec3(1.0, 0.98, 0.95);
      float u = fract(aP.x + uT * 0.006);
      float streak = 0.5 + 0.5 * sin(u * 90.0 - uT * 2.0 + aP.y * 5.0);
      return mix(vec3(0.55, 0.78, 1.0), vec3(0.3, 0.9, 0.95), aP.y) * streak * smoothstep(0.0, 0.08, u) * smoothstep(1.0, 0.8, u);
    }
    if (k == 3) {
      // amber threads, with beads of light running along them
      float bead = pow(0.5 + 0.5 * sin(aP.x * 70.0 - uT * 2.4 + aP.y * 9.0), 10.0);
      return mix(vec3(1.0, 0.56, 0.22), vec3(1.0, 0.36, 0.3), step(0.7, aRnd.w)) * (0.4 + 0.9 * bead) + vec3(1.0, 0.9, 0.75) * bead * 0.4;
    }
    if (k == 4) {
      float g = aInfo.y;
      vec3 c = g < 0.5 ? vec3(0.3, 0.9, 0.95) : g < 1.5 ? vec3(1.0, 0.74, 0.32) : g < 2.5 ? vec3(1.0, 0.45, 0.7) : g < 3.5 ? vec3(0.66, 0.55, 1.0) : vec3(0.42, 1.0, 0.72);
      if (g > 1.5 && g < 2.5) c *= 1.0 - 0.75 * fract(aP.z + uT * 0.22);
      return c;
    }
    if (k == 5) {
      if (aP.w < 0.84) { float r = floor(aP.x * 4.0); return r < 0.5 ? vec3(0.3, 0.9, 0.95) : r < 1.5 ? vec3(0.42, 1.0, 0.72) : r < 2.5 ? vec3(0.45, 0.7, 1.0) : vec3(0.66, 0.55, 1.0); }
      return aP.w < 0.95 ? vec3(0.7, 0.85, 1.0) : vec3(1.0);
    }
    if (k == 6) {
      if (aP.w < 0.5) return vec3(1.0, 0.6, 0.24) * (0.45 + 0.9 * pow(0.5 + 0.5 * sin(aP.z * 60.0 - uT * 2.0), 8.0));
      if (aP.w < 0.93) return mix(vec3(0.35, 0.85, 1.0), vec3(0.45, 0.6, 1.0), aP.z) * (0.6 + 0.4 * sin(aP.y * 40.0 - uT * 3.0));
      return vec3(1.0);
    }
    if (aP.w < 0.68) return vec3(0.22, 0.34, 0.75);
    if (aP.w < 0.84) return vec3(1.0, 0.76, 0.36);
    if (aP.w < 0.97) return floor(aP.x * 6.0) < 3.5 ? vec3(1.0, 0.92, 0.75) : vec3(0.75, 0.88, 1.0);
    return vec3(0.35, 0.95, 1.0);
  }
  float alphaAt(int k){
    return k == 0 ? 0.3 : k == 1 ? 0.12 : k == 2 ? 0.15 : k == 3 ? 0.2 : k == 4 ? 0.13 : k == 5 ? 0.12 : k == 6 ? 0.12 : k == 7 ? 0.12 : 0.13;
  }
  // where a particle is on its way from scene k to the next (e: how far along it is; each sets off a little after
  // the one before, so the change ripples through)
  float along(float s, out int k){
    k = int(min(floor(s), ${(LAST - 1).toFixed(1)}));
    return smoothstep(0.0, 1.0, clamp((s - float(k) - aRnd.x * 0.4) / 0.6, 0.0, 1.0));
  }`;
  const SIM_VEL = /* glsl */ `
  ${SHAPES}
  // simplex noise (Ashima Arts / Stefan Gustavson, MIT) and a divergence-free flow made from it: the air the
  // particles move in, so they swirl like smoke instead of sliding in straight lines
  vec3 mod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x){ return mod289(((x * 34.0) + 10.0) * x); }
  vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
  float snoise(vec3 v){
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;
    vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }
  vec3 nGrad(vec3 p){
    const float e = 0.08;
    float n = snoise(p);
    return vec3(snoise(p + vec3(e, 0.0, 0.0)) - n, snoise(p + vec3(0.0, e, 0.0)) - n, snoise(p + vec3(0.0, 0.0, e)) - n) / e;
  }
  vec3 curl(vec3 p){ return cross(nGrad(p), nGrad(p + vec3(31.4, -17.2, 9.7))); }
  uniform float uS, uDt, uStream, uPtr;
  uniform vec3 uC0, uC1, uOriginPrev, uRayO, uRayD;
  void main(){
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    loadAttrs(uv);
    vec3 p = texture2D(tPos, uv).xyz + uOriginPrev;
    vec3 v = texture2D(tVel, uv).xyz;
    int k;
    float e = along(clamp(uS, 0.0, ${LAST.toFixed(1)}), k);
    vec3 p0 = posAt(k), p1 = posAt(k + 1);
    // the point opens into the mark in a burst; after that, each shape pours as one twisting river of light along
    // the camera's own way to the next place, and opens out again into the next shape
    float d = min(length(p1 - p0), 8.0);
    vec3 sw = vec3(sin(aRnd.y * 31.0 + uT * 0.9), cos(aRnd.z * 27.0 + uT * 0.7), sin(aRnd.w * 23.0 + uT * 0.8));
    vec3 burst = mix(p0, p1, e) + sw * sin(PI * e) * (0.3 + d * 0.18);
    vec3 dir = normalize(uC1 - uC0 + vec3(0.0, 0.0, 1e-3));
    vec3 side = normalize(cross(dir, vec3(0.0, 1.0, 0.0)) + vec3(1e-3, 0.0, 0.0));
    vec3 up = cross(side, dir);
    float ang = aRnd.y * 6.2832 + e * 4.0 + uT * 0.5;
    vec3 off = (side * cos(ang) + up * sin(ang)) * (0.1 + pow(aRnd.z, 2.2) * 1.5);
    vec3 c1 = mix(uC0, uC1, 0.3) + off, c2 = mix(uC0, uC1, 0.7) + off;
    float ie = 1.0 - e;
    vec3 river = ie * ie * ie * p0 + 3.0 * ie * ie * e * c1 + 3.0 * ie * e * e * c2 + e * e * e * p1;
    vec3 target = mix(burst, river, uStream);
    // a spring pulls it there, firm at rest and loose in flight, and the air it moves through swirls it about
    float fly = sin(PI * e);
    float K = mix(30.0, 6.0, fly);
    vec3 acc = (target - p) * K - v * (1.7 * sqrt(K));
    acc += curl(p * mix(0.45, 0.2, fly) + vec3(0.0, uT * 0.05, uT * 0.03)) * 0.18 * mix(0.25, 2.2, fly) * (0.5 + aRnd.y);
    // the pointer parts them as it passes
    vec3 w = p - uRayO;
    vec3 perp = w - uRayD * dot(w, uRayD);
    float dd = length(perp);
    acc += perp / max(dd, 1e-3) * uPtr * 40.0 * exp(-dd * dd * 2.5);
    // (one that has to cross a long way while its shape holds still, like a drop of the river going back to its
    // source, does it unseen)
    float away = smoothstep(0.7, 1.8, length(target - p)) * (1.0 - smoothstep(0.0, 0.08, fly));
    gl_FragColor = vec4(v + acc * uDt, away);
  }`;
  const SIM_POS = /* glsl */ `
  uniform float uDt;
  uniform vec3 uShift;
  void main(){
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 p = texture2D(tPos, uv);
    // (positions are kept relative to where the camera looks, so they stay precise anywhere along the way)
    p.xyz += texture2D(tVel, uv).xyz * uDt - uShift;
    gl_FragColor = p;
  }`;
  // how one particle is drawn: its size is its own (at least a pixel or so) and the blur of the lens
  const SPRITE = /* glsl */ `
  uniform float uFocus, uAperture, uPR, uSize, uVW, uVH, uMaxPt;
  varying vec3 vCol;
  varying float vA, vSize, vStretch;
  varying vec2 vDir;
  void sprite(vec3 wp, vec3 vel, vec3 col, float a, float grain){
    vec4 mv = modelViewMatrix * vec4(wp, 1.0);
    gl_Position = projectionMatrix * mv;
    float dep = -mv.z;
    float ppu = projectionMatrix[1][1] * uVH * 0.5 / max(dep, 0.05);
    float core = max(1.4 * uPR * uSize * grain, 0.009 * ppu * grain);
    float coc = uAperture * uPR * abs(dep - uFocus) / max(dep, 0.05);
    float size = min(sqrt(core * core + coc * coc), uMaxPt * uPR);
    // (a blurred one spreads the same light over a larger disc)
    a *= max(pow(min(1.0, core * 1.5 / size), 1.7), 0.003);
    vec4 c2 = projectionMatrix * modelViewMatrix * vec4(wp + vel * 0.07, 1.0);
    vec2 sv = (c2.xy / c2.w - gl_Position.xy / gl_Position.w) * 0.5 * vec2(uVW, uVH);
    float L = c2.w > 0.05 ? length(sv) : 0.0;
    vStretch = clamp(1.0 + L / size, 1.0, 9.0);
    vDir = L > 1e-3 ? sv / L : vec2(1.0, 0.0);
    vSize = size;
    vCol = col;
    vA = a / mix(1.0, vStretch, 0.7) * smoothstep(1.0, 3.5, dep);
    gl_PointSize = dep < 0.4 || vA * max(col.r, max(col.g, col.b)) < 0.0004 ? 0.0 : size * vStretch;
  }`;
  const VERT = /* glsl */ `
  ${SHAPES}
  ${SPRITE}
  uniform sampler2D tPos, tVel;
  uniform vec3 uOrigin;
  uniform float uS, uStream;
  attribute vec2 ref;
  void main(){
    loadAttrs(ref);
    vec3 wp = texture2D(tPos, ref).xyz + uOrigin;
    vec4 V4 = texture2D(tVel, ref);
    vec3 vel = V4.xyz;
    int k;
    float e = along(clamp(uS, 0.0, ${LAST.toFixed(1)}), k);
    vec3 col = mix(colAt(k), colAt(k + 1), e);
    float a = mix(alphaAt(k), alphaAt(k + 1), e);
    // (a little thinner in the middle of a flight, where all of it passes close together)
    a = mix(a, min(a, 0.06), sin(PI * e) * uStream);
    // the fast ones run hotter and whiter
    float sp = clamp(length(vel) * 0.035, 0.0, 0.5);
    col = mix(col, vec3(max(col.r, max(col.g, col.b))), sp) * (1.0 + sp);
    // a few catch the light now and then
    float glint = step(0.93, aRnd.z) * pow(0.5 + 0.5 * sin(uT * (0.7 + aRnd.w * 2.4) + aRnd.x * 60.0), 14.0) * 3.5;
    sprite(wp, vel, col, a * (0.55 + aRnd.y * 0.9) * (1.0 + glint) * (1.0 - V4.w), 0.75 + aRnd.w * 0.7);
  }`;
  // the stars: the space the journey passes through, near ones big and soft, far ones fine
  const STAR_VERT = /* glsl */ `
  ${SPRITE}
  uniform float uT, uS;
  attribute vec4 aR;
  void main(){
    vec3 wp = position + vec3(sin(uT * 0.2 + aR.x * 30.0), cos(uT * 0.17 + aR.y * 30.0), sin(uT * 0.13 + aR.z * 30.0)) * 0.35;
    vec3 col = mix(vec3(0.42, 0.58, 1.0), vec3(0.88, 0.92, 1.0), aR.w) * (0.3 + aR.y * 0.55);
    float tw = 0.75 + 0.25 * sin(uT * (0.6 + aR.z) + aR.x * 40.0);
    // (and they fade into the distance)
    float far = 1.0 - smoothstep(16.0, 45.0, -(modelViewMatrix * vec4(wp, 1.0)).z);
    sprite(wp, vec3(0.0), col, 0.55 * tw * far * mix(0.08, 1.0, clamp(uS, 0.0, 1.0)), 0.7 + aR.z * 0.9);
  }`;
  const FRAG = /* glsl */ `
  varying vec3 vCol;
  varying float vA, vSize, vStretch;
  varying vec2 vDir;
  void main(){
    vec2 c = gl_PointCoord - 0.5;
    c.y = -c.y;
    vec2 q = vec2(dot(c, vDir), dot(c, vec2(-vDir.y, vDir.x)));
    float h = 0.5 / vStretch;
    float d = length(vec2(max(abs(q.x) - (0.5 - h), 0.0), q.y)) / h;
    if (d > 1.0) discard;
    // in focus a soft point of light; out of focus a clean disc with a slightly brighter rim, as a lens draws it
    float big = smoothstep(3.0, 10.0, vSize);
    float edge = clamp(1.6 / vSize, 0.04, 1.0);
    float disc = (1.0 - smoothstep(1.0 - edge, 1.0, d)) * (0.7 + 0.45 * smoothstep(0.45, 0.95, d));
    float pt = exp(-d * d * 4.5);
    gl_FragColor = vec4(vCol * vA * mix(pt, disc, big) * 2.6, 1.0);
  }`;

  // what each particle is: data textures the simulation and the drawing both read
  const markPts = await sampleMark(N);

  const tex = (data) => {
    const t = new THREE.DataTexture(data, SIDE, SIDE, THREE.RGBAFormat, THREE.FloatType);
    t.magFilter = t.minFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    return t;
  };
  const A = new Float32Array(N * 4), B = new Float32Array(N * 4), C = new Float32Array(N * 4), R = new Float32Array(N * 4), PP = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    A.set([markPts.pos[i * 3], markPts.pos[i * 3 + 1], markPts.pos[i * 3 + 2], markPts.cls[i]], i * 4);
    B[i * 4 + 3] = Math.floor(rnd() * 5);
    C[i * 4 + 3] = rnd() < 0.045 ? 1 + Math.floor(rnd() * 3) : 0;
    R.set([rnd(), rnd(), rnd(), rnd()], i * 4);
    PP.set([rnd(), rnd(), rnd(), rnd()], i * 4);
  }
  const U = {
    uT: { value: 0 },
    uPort: { value: PORT ? 1 : 0 },
    tA: { value: tex(A) },
    tB: { value: tex(B) },
    tC: { value: tex(C) },
    tR: { value: tex(R) },
    tP: { value: tex(PP) },
    uS: { value: 0 },
    uStream: { value: 0 },
    tPos: { value: null },
    tVel: { value: null },
    uOrigin: { value: new THREE.Vector3() },
    uFocus: { value: 7.5 },
    uAperture: { value: SMALL ? 7 : 10 },
    uPR: { value: PR },
    uSize: { value: 1 },
    uVW: { value: W * PR },
    uVH: { value: H * PR },
    uMaxPt: { value: SMALL ? 26 : 40 },
  };

  // the simulation
  const gpu = new GPUComputationRenderer(SIDE, SIDE, renderer);
  if (!renderer.extensions.has('EXT_color_buffer_float')) gpu.setDataType(THREE.HalfFloatType);
  const pos0 = gpu.createTexture();
  for (let i = 0; i < N; i++) {
    // everything starts in the point
    const th = rnd() * Math.PI * 2, ph = Math.acos(2 * rnd() - 1), r = 0.05 * rnd() * rnd();
    pos0.image.data.set([r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th), 1], i * 4);
  }
  const posVar = gpu.addVariable('tPos', SIM_POS, pos0);
  const velVar = gpu.addVariable('tVel', SIM_VEL, gpu.createTexture());
  gpu.setVariableDependencies(posVar, [posVar, velVar]);
  gpu.setVariableDependencies(velVar, [posVar, velVar]);
  const SU = {
    uDt: { value: 0 },
    uPtr: { value: 0 },
    uC0: { value: new THREE.Vector3() },
    uC1: { value: new THREE.Vector3() },
    uOriginPrev: { value: new THREE.Vector3() },
    uRayO: { value: new THREE.Vector3() },
    uRayD: { value: new THREE.Vector3(0, 0, -1) },
  };
  Object.assign(velVar.material.uniforms, { uT: U.uT, uPort: U.uPort, tA: U.tA, tB: U.tB, tC: U.tC, tR: U.tR, tP: U.tP, uS: U.uS, uStream: U.uStream }, SU);
  Object.assign(posVar.material.uniforms, { uDt: SU.uDt, uShift: { value: new THREE.Vector3() } });
  const gpuErr = gpu.init();
  if (gpuErr) throw new Error(gpuErr);

  // the drawing
  const refs = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) refs.set([((i % SIDE) + 0.5) / SIDE, (Math.floor(i / SIDE) + 0.5) / SIDE], i * 2);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  geo.setAttribute('ref', new THREE.BufferAttribute(refs, 2));
  const points = new THREE.Points(geo, new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
  points.frustumCulled = false;
  scene.add(points);
  const NS = SMALL ? 4500 : 9000;
  const starPos = new Float32Array(NS * 3), starR = new Float32Array(NS * 4);
  for (let i = 0; i < NS; i++) {
    // (around the way rather than on it, so the far ones do not gather in the middle of the view)
    const a = rnd() * Math.PI * 2, r = 3 + Math.pow(rnd(), 0.7) * 22;
    starPos.set([Math.cos(a) * r * 1.4, Math.sin(a) * r * 0.8, 14 - rnd() * 180], i * 3);
    starR.set([rnd(), rnd(), rnd(), rnd()], i * 4);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('aR', new THREE.BufferAttribute(starR, 4));
  const stars = new THREE.Points(starGeo, new THREE.ShaderMaterial({
    uniforms: { uT: U.uT, uS: U.uS, uFocus: U.uFocus, uAperture: U.uAperture, uPR: U.uPR, uSize: U.uSize, uVW: U.uVW, uVH: U.uVH, uMaxPt: U.uMaxPt },
    vertexShader: STAR_VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  }));
  stars.frustumCulled = false;
  scene.add(stars);

  // ---------------------------------------------------------------- the glow, then the look of film: a soft
  // shoulder for the bright parts, a touch of colour fringing toward the edges, cool shadows and warm light, a
  // vignette and grain
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.6, 0.6, 0.2);
  composer.addPass(bloom);
  const grain = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uT: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uT; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
        vec2 d = vUv - 0.5;
        float r2 = dot(d, d);
        vec2 o = d * r2 * 0.02;
        vec3 c = vec3(texture2D(tDiffuse, vUv + o).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - o).b);
        c = 1.0 - exp(-c * 1.15);
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c += vec3(-0.004, 0.002, 0.012) * (1.0 - l) + vec3(0.02, 0.008, -0.014) * l;
        c *= 1.0 - r2 * 0.9;
        c += (h(vUv * 1000.0 + fract(uT) * 77.0) - 0.5) * 0.026;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  composer.addPass(grain);

  // ---------------------------------------------------------------- the camera at each stage (the picture sits beside or above the words)
  let KEYS;
  function keys() {
    KEYS = PORT
      ? [
          { pos: V(0, 0, 7.5), look: V(0, 0, 0) },
          { pos: V(0, -1.6, 13.5), look: V(0, -1.6, 0) },
          { pos: V(-1.2, 5.6, 9), look: riverC(0.13).add(V(-0.6, -2.2, 0)) },
          { pos: V(0, -0.9, -15), look: V(0, -1.6, -36) },
          { pos: V(0, -0.8, -45.5), look: V(0, -1.3, -58) },
          { pos: V(0, 0.3, -69), look: V(0, -1.2, -80) },
          { pos: V(0, 0.4, -92.5), look: V(0, -0.8, CASE_Z) },
          { pos: V(0, 5.4, -114.5), look: V(0, -2.6, -124.5) },
          { pos: V(0, -1.6, -132.5), look: V(0, -1.6, -146) },
        ]
      : [
          { pos: V(0, 0, 7.5), look: V(0, 0, 0) },
          { pos: V(-1.9, 0, 9.4), look: V(-1.9, -0.25, 0) },
          { pos: V(-3.4, 3.4, 6.2), look: riverC(0.15).add(V(-1.2, 0, 0)) },
          { pos: V(0, 0.1, -21.5), look: V(0, -0.6, -36) },
          { pos: V(0, -0.1, -41), look: V(0, -1.2, -58) },
          { pos: V(-0.6, 2.8, -69.5), look: V(-0.6, -0.2, -80) },
          { pos: V(1.2, 0.95, -91.6), look: V(1.2, 0.4, CASE_Z) },
          { pos: V(-2.5, 4.3, -110.8), look: V(-2.5, -3.1, -125) },
          { pos: V(-2.3, 0.6, -136.6), look: FINAL.clone().add(V(-2.3, 0.35, 0)) },
        ];
  }
  keys();
  const smooth = (x) => x * x * (3 - 2 * x);
  function camAt(s, t, push) {
    const k = Math.min(Math.floor(s), LAST - 1), f = smooth(Math.min(1, Math.max(0, s - k)));
    const a = KEYS[k], b = KEYS[k + 1];
    const pos = a.pos.clone().lerp(b.pos, f), look = a.look.clone().lerp(b.look, f);
    pos.lerp(look, 0.07 * smooth(push));
    // between two places the camera rises a little, as if it took a breath
    pos.y += Math.sin(Math.PI * f) * 0.9;
    // at the mark it turns slowly around it
    const near1 = Math.max(0, 1 - Math.abs(s - 1) * 1.5) + Math.max(0, 1 - Math.abs(s - LAST) * 1.5);
    pos.x += Math.sin(t * 0.22) * (PORT ? 0.8 : 1.4) * near1;
    pos.y += Math.cos(t * 0.17) * 0.4 * near1;
    // and it is never quite still
    pos.x += Math.sin(t * 0.5) * 0.05 + PTR.x * 0.35;
    pos.y += Math.cos(t * 0.37) * 0.05 - PTR.y * 0.2;
    return { pos, look };
  }

  // ---------------------------------------------------------------- the words that follow places, the words of each stage, the rail
  const sc = formScale;
  const anchors = {
    idea: () => V(0, -0.38, 0),
    brand: () => V(0, -2.75, 0),
    n0: () => riverC(NODES[0]).add(V(0, 0.95, 0)),
    n1: () => riverC(NODES[1]).add(V(0, 0.95, 0)),
    n2: () => riverC(NODES[2]).add(V(0, 0.95, 0)),
    ...Object.fromEntries([0, 1, 2, 3].map((k) => ['p' + k, () => knotCenter(k).add(V(0, PORT ? 1.55 : 1.35, 0))])),
    ...Object.fromEntries([0, 1, 2, 3, 4].map((g) => ['a' + g, () => formCenter(g).add(V(0, -1.75 * sc(), 0))])),
    ...Object.fromEntries([0, 1, 2, 3].map((r) => ['l' + r, () => (PORT ? layerC().add(V(0, layerY(r) + 0.3, layerR(r))) : layerC().add(V(layerR(r) + 0.3, layerY(r), 0)))])),
    ...Object.fromEntries([0, 1, 2, 3].map((r) => ['c' + r, () => V(PORT ? 0 : (caseX()[0] + (caseX()[0] + caseX()[1]) / 2) / 2, caseRowY(r) + 0.48, CASE_Z)])),
    ...Object.fromEntries([0, 1, 2, 3, 4, 5].map((k) => ['m' + k, () => mapNode(k).add(V(0, 0.65, 0))])),
  };
  const STAGE_OF = { idea: 0, brand: 1, n: 2, p: 3, a: 4, l: 5, c: 6, m: 7 };
  let tags = [];
  const placeTags = () => {
    tags = [...document.querySelectorAll('[data-tag]')].map((el) => {
      const id = el.dataset.tag;
      // (the startup layers' labels start at their ring's edge rather than straddling it)
      const left = !PORT && el.classList.contains('t-layer');
      return { el, at: anchors[id](), stage: STAGE_OF[id] ?? STAGE_OF[id[0]], left, w: el.offsetWidth, shift: left ? 'translate(0, -50%)' : 'translate(-50%, -50%)' };
    });
    // the labels of one place come one after another, in the order they are written
    const seen = {};
    for (const g of tags) g.i = seen[g.stage] = (seen[g.stage] ?? -1) + 1;
    for (const g of tags) g.n = seen[g.stage] + 1;
  };
  placeTags();
  // (their widths change once the web fonts arrive)
  if (document.fonts) document.fonts.ready.then(placeTags);
  const tmp = new THREE.Vector3();
  function labels(s) {
    for (const g of tags) {
      const near = 1 - Math.abs(s - g.stage) * 2.4;
      let o = Math.min(1, Math.max(0, near * (1 + (g.n - 1) * 0.18) - g.i * 0.18));
      tmp.copy(g.at).project(camera);
      if (tmp.z > 1) o = 0;
      g.el.style.opacity = o.toFixed(3);
      g.el.style.visibility = o > 0.02 ? 'visible' : 'hidden';
      if (o <= 0) continue;
      // (kept inside the screen, clear of the rail on the right)
      const lo = g.left ? 12 : 12 + g.w / 2, hi = W - (PORT ? 16 : 44) - (g.left ? g.w : g.w / 2);
      const x = Math.min(Math.max((tmp.x * 0.5 + 0.5) * W, lo), Math.max(lo, hi));
      g.el.style.transform = `translate3d(${x.toFixed(1)}px, ${((-tmp.y * 0.5 + 0.5) * H).toFixed(1)}px, 0) ${g.shift}`;
    }
  }

  // ---------------------------------------------------------------- the words of the story, played by scrolling
  // Each heading is cut into letters (Chinese) or words (English) that rise into place one after another as its
  // scene forms; the kicker comes first, the line and the links after. Between two scenes a line of narration
  // (<p class="sub" data-t="from,to">, in story time) carries the story across while the particles fly.
  const ZH = /^zh/.test(doc.lang);
  const GRAD = [[0xb9, 0xa4, 0xff], [0x7f, 0xb6, 0xff], [0x8e, 0xf0, 0xff]]; // as --grad in world.css
  const gradAt = (x) => {
    const [a, b, f] = x < 0.6 ? [GRAD[0], GRAD[1], x / 0.6] : [GRAD[1], GRAD[2], (x - 0.6) / 0.4];
    return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * f)).join(',')})`;
  };
  function cut(el) {
    const out = [];
    const walk = (node, coloured) => {
      for (const n of [...node.childNodes]) {
        if (n.nodeType === 1) walk(n, coloured || n.tagName === 'B');
        if (n.nodeType !== 3) continue;
        const frag = document.createDocumentFragment();
        for (const p of ZH ? [...n.textContent] : n.textContent.split(/(\s+)/)) {
          if (!p) continue;
          if (!p.trim()) {
            frag.append(p);
            continue;
          }
          // (a mark of punctuation stays with the letter before it, so it never starts a line by itself)
          if (ZH && out.length && /[，。、？！：；…）」』]/.test(p)) {
            out[out.length - 1].textContent += p;
            continue;
          }
          const u = document.createElement('span');
          u.className = 'u';
          u.textContent = p;
          u.coloured = coloured;
          frag.append(u);
          out.push(u);
        }
        n.replaceWith(frag);
      }
    };
    walk(el, false);
    // (the coloured line keeps its gradient, one letter at a time)
    const c = out.filter((u) => u.coloured);
    c.forEach((u, i) => (u.style.color = gradAt(c.length > 1 ? i / (c.length - 1) : 0)));
    return out;
  }
  const lines = [
    ...sections
      .filter((el) => +el.dataset.stage > 0)
      .map((el) => {
        const k = +el.dataset.stage, head = el.querySelector('h1, h2');
        return {
          el,
          from: k - 0.2,
          rise: 0.24,
          to: k === LAST ? Infinity : k + 0.3,
          fall: 0.12,
          units: head ? cut(head) : [],
          before: [...el.querySelectorAll('.st-k')],
          after: [...el.children].filter((c) => !c.matches('h1, h2, .st-k, .st-only')),
          key: '',
        };
      }),
    ...[...document.querySelectorAll('.sub')].map((el) => {
      const [from, to] = el.dataset.t.split(',').map(Number);
      return { el, from, rise: 0.12, to: to - 0.08, fall: 0.08, units: cut(el), before: [], after: [], key: '' };
    }),
  ];
  const ease = (x) => 1 - (1 - x) ** 3;
  const clamp = (x) => Math.min(1, Math.max(0, x));
  const rise = (el, e) => {
    el.style.opacity = e.toFixed(3);
    el.style.transform = e < 1 ? `translate3d(0, ${((1 - e) * 0.65).toFixed(3)}em, 0)` : '';
  };
  function play(c, a, z) {
    const key = `${a.toFixed(3)} ${z.toFixed(3)}`;
    if (key === c.key) return;
    c.key = key;
    const on = a > 0.001 && z < 0.999;
    c.el.style.visibility = on ? 'visible' : 'hidden';
    c.el.setAttribute('aria-hidden', on ? 'false' : 'true');
    if (!on) return;
    c.el.style.pointerEvents = a > 0.85 && z < 0.15 ? 'auto' : 'none';
    // going, the whole of it lifts away and blurs
    c.el.style.opacity = (1 - z).toFixed(3);
    c.el.style.transform = z > 0 ? `translate3d(0, ${(-z * 36).toFixed(1)}px, 0)` : '';
    c.el.style.filter = z > 0.01 ? `blur(${(z * 7).toFixed(1)}px)` : '';
    c.before.forEach((el) => rise(el, ease(clamp(a / 0.3))));
    const n = c.units.length;
    c.units.forEach((u, i) => rise(u, ease(clamp((a - 0.08 - 0.5 * (n > 1 ? i / (n - 1) : 0)) / 0.35))));
    c.after.forEach((el, j) => rise(el, ease(clamp((a - 0.5 - j * 0.1) / 0.3))));
  }
  const rail = [...document.querySelectorAll('.rail button')];
  const hint = document.querySelector('.hint');
  function story(tau) {
    for (const c of lines) {
      // (the first line comes in by itself when the page opens)
      const a = c.from < 0 ? clamp((t - 0.4) / 1.6) : clamp((tau - c.from) / c.rise);
      play(c, a, clamp((tau - c.to) / c.fall));
    }
    const near = Math.min(LAST, Math.floor(tau + 0.2));
    rail.forEach((b, i) => b.classList.toggle('on', i === near));
    if (hint) hint.classList.toggle('gone', tau > 0.04);
  }

  // ---------------------------------------------------------------- the story clock: how far the page has scrolled is how far the story has come
  // One scene for every one and a half screens. At the start of each, the scene holds while its words are read;
  // then the particles fly to the next. Nothing snaps: stop anywhere and the picture waits, half made.
  const HOLD = 0.4, END = LAST + 0.3;
  const space = document.createElement('div');
  space.className = 'space';
  space.setAttribute('aria-hidden', 'true');
  document.body.append(space);
  let VW = innerWidth, VH = innerHeight, SEG = 1;
  const sizeSpace = () => {
    SEG = VH * 1.5;
    space.style.height = `${Math.round(END * SEG + VH)}px`;
  };
  sizeSpace();
  const stageOf = (tau) => {
    const k = Math.floor(tau), f = tau - k;
    return k >= LAST ? LAST : k + (f < HOLD ? 0 : (f - HOLD) / (1 - HOLD));
  };
  // while a scene holds the camera keeps drifting in, and lets go as the next one begins
  const pushOf = (tau) => {
    const k = Math.floor(tau), f = tau - k;
    return k >= LAST ? Math.min(1, f / HOLD) : f < HOLD ? f / HOLD : 1 - (f - HOLD) / (1 - HOLD);
  };
  let tauT = 0, tau = -1, stage = 0, t = 0;
  const PTR = { x: 0, y: 0, tx: 0, ty: 0, at: -9 };
  const jump = (k) => {
    const to = k <= 0 ? 0 : Math.min(END, k + 0.12);
    if (CAPTURE) tauT = to;
    else scrollTo({ top: to * SEG, behavior: 'smooth' });
  };
  initAsk(jump);
  rail.forEach((b, i) => b.addEventListener('click', () => jump(i)));
  document.querySelectorAll('[data-go]').forEach((el) => el.addEventListener('click', (e) => (e.preventDefault(), jump(+el.dataset.go))));
  if (!CAPTURE)
    addEventListener('pointermove', (e) => {
      PTR.tx = (e.clientX / W - 0.5) * 2;
      PTR.ty = (e.clientY / H - 0.5) * 2;
      PTR.at = t;
    }, { passive: true });
  addEventListener('resize', () => {
    W = innerWidth;
    H = innerHeight;
    PORT = H > W * 1.05;
    renderer.setSize(W, H, false);
    composer.setSize(W, H);
    camera.aspect = W / H;
    camera.fov = PORT ? 58 : 40;
    camera.updateProjectionMatrix();
    bgMat.uniforms.uAsp.value = W / H;
    U.uPort.value = PORT ? 1 : 0;
    U.uVW.value = W * PR;
    U.uVH.value = H * PR;
    keys();
    placeTags();
    // (a phone's address bar coming and going changes the height a little; that keeps the story where it is)
    if (W !== VW || Math.abs(H - VH) > VH * 0.25) {
      const keep = tauT;
      VW = W;
      VH = H;
      sizeSpace();
      if (!CAPTURE) scrollTo(0, keep * SEG);
    }
  });

  // ---------------------------------------------------------------- each frame; on a slow device it draws less
  let slow = 0, frames = 0, level = 0;
  const origin = new THREE.Vector3(), ray = new THREE.Raycaster();
  function frame(dt) {
    t += dt;
    if (!CAPTURE) tauT = Math.min(END, Math.max(0, scrollY / SEG));
    // (the story follows the scroll a moment behind, so even a mouse wheel's steps become one glide)
    tau = tau < 0 ? tauT : tau + (tauT - tau) * (1 - Math.exp(-dt * 6));
    stage = stageOf(tau);
    PTR.x += (PTR.tx - PTR.x) * Math.min(1, dt * 2);
    PTR.y += (PTR.ty - PTR.y) * Math.min(1, dt * 2);
    const { pos, look } = camAt(stage, t, pushOf(tau));
    camera.position.copy(pos);
    camera.lookAt(look);
    U.uT.value = t;
    U.uS.value = stage;
    // (the river of light between two places runs from where the camera looked to where it will look; the point
    // opening into the mark at the start is a burst instead)
    const k = Math.min(Math.floor(stage), LAST - 1);
    SU.uC0.value.copy(KEYS[k].look);
    SU.uC1.value.copy(KEYS[k + 1].look);
    U.uStream.value = k === 0 ? 0 : 1;
    // the simulation keeps its positions around where the camera looks
    SU.uDt.value = Math.min(dt, 1 / 30);
    SU.uOriginPrev.value.copy(origin);
    posVar.material.uniforms.uShift.value.copy(look).sub(origin);
    origin.copy(look);
    if (!CAPTURE) {
      ray.setFromCamera(new THREE.Vector2(PTR.tx, -PTR.ty), camera);
      SU.uRayO.value.copy(ray.ray.origin);
      SU.uRayD.value.copy(ray.ray.direction);
      SU.uPtr.value = Math.max(0, 1 - (t - PTR.at) / 1.2);
    }
    gpu.compute();
    U.tPos.value = gpu.getCurrentRenderTarget(posVar).texture;
    U.tVel.value = gpu.getCurrentRenderTarget(velVar).texture;
    U.uOrigin.value.copy(origin);
    // (in flight the picture is everywhere at once, so less of it is out of focus)
    U.uFocus.value = pos.distanceTo(look);
    U.uAperture.value = (SMALL ? 7 : 10) * (1 - 0.85 * Math.sin(Math.PI * Math.min(1, stage - k)));
    bgMat.uniforms.uS.value = stage;
    bgMat.uniforms.uT.value = t;
    bgMat.uniforms.uCam.value.copy(pos);
    grain.uniforms.uT.value = t;
    labels(stage);
    story(tau);
    composer.render(dt);
    if (CAPTURE) renderer.getContext().finish();
    else {
      frames++;
      if (dt > 0.045) slow++;
      if (frames === 90) {
        if (slow > 45 && level < 2) {
          level++;
          if (level === 1) {
            PR = Math.min(PR, 1);
            renderer.setPixelRatio(PR);
            composer.setPixelRatio && composer.setPixelRatio(PR);
            U.uPR.value = PR;
            U.uVW.value = W * PR;
            U.uVH.value = H * PR;
          } else geo.setDrawRange(0, Math.round(N * 0.55));
        }
        frames = slow = 0;
      }
    }
  }
  window.__w = {
    step: (dt) => frame(dt),
    // (story time: scene k begins at k, its words leave at k + 0.3, the flight to the next is k + 0.4 to k + 1)
    scrollTo: (s) => (tauT = Math.min(END, Math.max(0, s))),
    get t() {
      return t;
    },
    get s() {
      return tau;
    },
  };
  if (!CAPTURE) {
    let last = performance.now();
    const loop = (now) => {
      if (!document.hidden) frame(Math.min(0.05, (now - last) / 1000));
      last = now;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  } else frame(0.0001);
  doc.classList.add('ready');
}
