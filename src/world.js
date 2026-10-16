// The NaxaStudio home page: a world of light the visitor scrolls through.
//
// Everything starts from one point of light, the idea (as the old home page did). Scrolling takes it on a journey,
// one stage at a time, and the same particles become everything on the way:
//   0 the point    1 the mark (the logo, in depth)    2 a river: idea, action, result    3 the knot of daily
//   business    4 the five assistants    5 the first layer (the startup solution)    6 the cases: tangled
//   before, flowing after    7 a map of opportunities (the business review)    8 one again: the mark, and an invitation
// Scrolling back plays it backwards. The words of each stage are ordinary HTML (<section data-stage>) laid over
// the picture; small labels (<… data-tag>) follow the places they name. Without WebGL, or with reduced motion,
// the same sections read as a plain page.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
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
  const N = SMALL ? 64000 : 150000;

  // ---------------------------------------------------------------- renderer
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: CAPTURE });
  let PR = Math.min(devicePixelRatio || 1, 2);
  renderer.setPixelRatio(PR);
  renderer.setSize(W, H, false);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // colours are given as they should look
  renderer.setClearColor(0x02050d, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(PORT ? 58 : 40, W / H, 0.05, 400);

  // the deep navy of the brand, lighter in the middle; warmer while the knot is on screen
  const bgMat = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: { uAsp: { value: W / H }, uS: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }`,
    fragmentShader: `varying vec2 vUv; uniform float uAsp, uS;
      void main(){
        vec2 p = vUv - vec2(0.5, 0.48); p.x *= uAsp;
        float g = exp(-dot(p, p) * 2.2);
        float knot = smoothstep(2.4, 3.0, uS) * (1.0 - smoothstep(3.0, 3.7, uS));
        vec3 c = vec3(0.008, 0.016, 0.04) + vec3(0.025, 0.05, 0.11) * g * min(1.0, 0.25 + uS) + vec3(0.07, 0.04, 0.02) * knot * g;
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
  const KNOTS = [V(-4.6, 1.5, -36), V(4.0, 1.9, -38), V(-3.3, -1.9, -34), V(4.6, -1.5, -35)];
  const knotAt = (p) => (PORT ? V(p.x * 0.5, (p.y - 0.2) * 1.3 + 0.2, p.z) : p.clone());
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
  // the knot: tangled threads, gathered around four snarls
  function knot(n) {
    const out = new Float32Array(n * 3);
    let i = 0;
    while (i < n) {
      const a = KNOTS[Math.floor(rnd() * 4)], b = rnd() < 0.25 ? KNOTS[Math.floor(rnd() * 4)] : a;
      const p = a.clone().add(V((rnd() - 0.5) * 3, (rnd() - 0.5) * 2.4, (rnd() - 0.5) * 3));
      const v = V(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
      const len = 300 + Math.floor(rnd() * 500);
      for (let s = 0; s < len && i < n; s++, i++) {
        v.add(V(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.35));
        v.add(b.clone().sub(p).multiplyScalar(0.012)).normalize();
        p.addScaledVector(v, 0.035);
        out.set([p.x + (rnd() - 0.5) * 0.02, p.y + (rnd() - 0.5) * 0.02, p.z + (rnd() - 0.5) * 0.02], i * 3);
      }
    }
    return out;
  }
  // the cases' tangles, one per row, in a box of their own (placed by the shader): x, y in -1..1, and the row
  function tangles(n) {
    const out = new Float32Array(n * 3);
    let i = 0;
    while (i < n) {
      const row = Math.floor(rnd() * 4);
      let x = rnd() * 2 - 1, y = rnd() * 2 - 1, vx = rnd() - 0.5, vy = rnd() - 0.5;
      const len = 120 + Math.floor(rnd() * 200);
      for (let s = 0; s < len && i < n; s++, i++) {
        vx += (rnd() - 0.5) * 0.5 - x * 0.04;
        vy += (rnd() - 0.5) * 0.5 - y * 0.06;
        const l = Math.hypot(vx, vy) || 1;
        x += (vx / l) * 0.03;
        y += (vy / l) * 0.05;
        if (Math.abs(x) > 1) (x = Math.sign(x) * 2 - x), (vx = -vx);
        if (Math.abs(y) > 1) (y = Math.sign(y) * 2 - y), (vy = -vy);
        out.set([x, y, row], i * 3);
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- the particles
  const VERT = /* glsl */ `
  uniform float uT, uS, uFocus, uPR, uSize, uPort;
  attribute vec3 aLogo, aKnot, aCase;
  attribute vec4 aRnd, aP, aInfo; // info: x the mark's colour, y which assistant, z dust, w a node of the river
  varying vec3 vCol;
  varying float vA;
  const float PI = 3.14159265;
  vec3 rotY(vec3 v, float a){ float c = cos(a), s = sin(a); return vec3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z); }
  vec3 rotX(vec3 v, float a){ float c = cos(a), s = sin(a); return vec3(v.x, c * v.y - s * v.z, s * v.y + c * v.z); }
  // 2: the river, five strands like the swooshes of the mark, flowing away
  vec3 riverC(float u){ return vec3(sin(u * 5.0 + 0.6) * (0.5 + u * 3.0), -1.8 + u + sin(u * 5.0) * 0.4, 1.0 - u * 72.0); }
  vec3 riverAt(float u, float strand, float j){
    vec3 c = riverC(u), c2 = riverC(u + 0.002);
    vec2 tg = normalize(c2.xz - c.xz), nr = vec2(-tg.y, tg.x);
    float w = 1.5 + u * 2.6;
    float lat = (strand - 2.0) * 0.3 * w + j * 0.06 * w;
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
  vec3 cases(){
    vec2 X = caseX();
    float cx = (X.x + X.y) * 0.5, gap = uPort > 0.5 ? 0.35 : 0.5;
    if (aP.w < 0.5) {
      float r = aCase.z;
      return vec3(mix(X.x, cx - gap, aCase.x * 0.5 + 0.5), caseRowY(r) + aCase.y * 0.26, ${CASE_Z.toFixed(1)} + sin(aCase.x * 9.0 + aCase.y * 7.0) * 0.15)
        + vec3(sin(uT * 1.4 + aRnd.y * 30.0), cos(uT * 1.2 + aRnd.z * 30.0), 0.0) * 0.02;
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
  vec3 knotAt(vec3 p){ return uPort > 0.5 ? vec3(p.x * 0.5, (p.y - 0.2) * 1.3 + 0.2, p.z) : p; }
  vec3 mark(float s, vec3 at){ return aLogo * s + at + vec3(sin(uT * 0.9 + aLogo.y * 2.0) * 0.015, 0.0, 0.0); }
  vec3 posAt(int k){
    if (k == 0) return position;
    if (k == 1) return mark(1.0, vec3(0.0));
    if (k == 2) return river();
    if (k == 3) return knotAt(aKnot) + vec3(sin(uT * 1.3 + aRnd.y * 30.0), cos(uT * 1.1 + aRnd.z * 30.0), sin(uT * 0.9 + aRnd.w * 30.0)) * 0.16;
    if (k == 4) return five();
    if (k == 5) return layers();
    if (k == 6) return cases();
    if (k == 7) return map();
    return mark(1.25, vec3(${FINAL.x.toFixed(1)}, ${FINAL.y.toFixed(1)}, ${FINAL.z.toFixed(1)}));
  }
  vec3 markCol(float i){
    return i < 0.5 ? vec3(0.92, 0.96, 1.0) : i < 1.5 ? vec3(0.62, 0.82, 1.0) : i < 2.5 ? vec3(0.31, 0.61, 1.0) : i < 3.5 ? vec3(0.38, 0.46, 1.0) : vec3(0.21, 0.78, 0.88);
  }
  vec3 colAt(int k){
    if (k == 0) return vec3(0.95, 0.97, 1.0) * step(aRnd.z, 0.007);
    if (k == 1 || k == 8) return markCol(aInfo.x);
    if (k == 2) {
      if (aInfo.w > 0.5) return vec3(1.0, 0.98, 0.95);
      float u = fract(aP.x + uT * 0.006);
      float streak = 0.5 + 0.5 * sin(u * 90.0 - uT * 2.0 + aP.y * 5.0);
      return mix(vec3(0.55, 0.78, 1.0), vec3(0.3, 0.9, 0.95), aP.y) * streak * smoothstep(0.0, 0.03, u) * smoothstep(1.0, 0.8, u);
    }
    if (k == 3) return aRnd.y < 0.6 ? vec3(1.0, 0.64, 0.24) : vec3(0.32, 0.42, 0.78);
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
      if (aP.w < 0.5) return vec3(1.0, 0.64, 0.24);
      if (aP.w < 0.93) return mix(vec3(0.35, 0.85, 1.0), vec3(0.45, 0.6, 1.0), aP.z) * (0.6 + 0.4 * sin(aP.y * 40.0 - uT * 3.0));
      return vec3(1.0);
    }
    if (aP.w < 0.68) return vec3(0.22, 0.34, 0.75);
    if (aP.w < 0.84) return vec3(1.0, 0.76, 0.36);
    if (aP.w < 0.97) return floor(aP.x * 6.0) < 3.5 ? vec3(1.0, 0.92, 0.75) : vec3(0.75, 0.88, 1.0);
    return vec3(0.35, 0.95, 1.0);
  }
  float alphaAt(int k){
    return k == 0 ? 0.3 : k == 1 ? 0.085 : k == 2 ? 0.15 : k == 3 ? 0.22 : k == 4 ? 0.13 : k == 5 ? 0.12 : k == 6 ? 0.12 : k == 7 ? 0.12 : 0.1;
  }
  void main(){
    vec3 p, col;
    float a;
    if (aInfo.z > 0.5) {
      // the dust of the world, faint until the point opens
      p = position + vec3(sin(uT * 0.2 + aRnd.x * 30.0), cos(uT * 0.17 + aRnd.y * 30.0), sin(uT * 0.13 + aRnd.z * 30.0)) * 0.6;
      col = mix(vec3(0.42, 0.58, 1.0), vec3(0.85, 0.9, 1.0), aRnd.w) * (0.3 + aRnd.y * 0.45);
      a = 0.45 * mix(0.1, 1.0, clamp(uS, 0.0, 1.0));
    } else {
      float s = clamp(uS, 0.0, ${LAST.toFixed(1)});
      int k = int(min(floor(s), ${(LAST - 1).toFixed(1)}));
      float f = s - float(k);
      // each particle sets off a little after the one before: the change ripples through
      float e = smoothstep(0.0, 1.0, clamp((f - aRnd.x * 0.4) / 0.6, 0.0, 1.0));
      vec3 p0 = posAt(k), p1 = posAt(k + 1);
      float d = min(length(p1 - p0), 8.0);
      vec3 sw = vec3(sin(aRnd.y * 31.0 + uT * 0.9), cos(aRnd.z * 27.0 + uT * 0.7), sin(aRnd.w * 23.0 + uT * 0.8));
      p = mix(p0, p1, e) + sw * sin(PI * e) * (0.3 + d * 0.18);
      col = mix(colAt(k), colAt(k + 1), e);
      a = mix(alphaAt(k), alphaAt(k + 1), e);
    }
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float dep = -mv.z;
    float blur = abs(dep - uFocus) / max(uFocus, 1.0);
    gl_PointSize = uPR * uSize * (1.0 + aRnd.w * 1.3) * (1.0 + blur * 7.0) * (12.0 / max(dep, 0.3));
    vA = a / (1.0 + blur * blur * 22.0) * smoothstep(0.2, 1.5, dep) * (0.72 + 0.28 * sin(uT * 2.1 + aRnd.z * 60.0));
    vCol = col;
  }`;
  const FRAG = /* glsl */ `
  varying vec3 vCol;
  varying float vA;
  void main(){
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vCol * a * a * vA * 1.9, 1.0);
  }`;
  const U = { uT: { value: 0 }, uS: { value: 0 }, uFocus: { value: 7.5 }, uPR: { value: PR }, uSize: { value: SMALL ? 1.25 : 1 }, uPort: { value: PORT ? 1 : 0 } };
  const NA = Math.round(N * 0.12), NM = N - NA;
  const markPts = await sampleMark(NM);
  const knotPts = knot(NM), casePts = tangles(NM);
  const pos = new Float32Array(N * 3), logo = new Float32Array(N * 3), kn = new Float32Array(N * 3), cs = new Float32Array(N * 3);
  const rr = new Float32Array(N * 4), pp = new Float32Array(N * 4), info = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    rr.set([rnd(), rnd(), rnd(), rnd()], i * 4);
    pp.set([rnd(), rnd(), rnd(), rnd()], i * 4);
    if (i >= NM) {
      // dust: the whole length of the world
      pos.set([(rnd() - 0.5) * 36, (rnd() - 0.5) * 22, 14 - rnd() * 176], i * 3);
      info[i * 4 + 2] = 1;
      continue;
    }
    // the point: a tiny, dense heart
    const th = rnd() * Math.PI * 2, ph = Math.acos(2 * rnd() - 1), r = 0.05 * rnd() * rnd();
    pos.set([r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th)], i * 3);
    logo.set(markPts.pos.subarray(i * 3, i * 3 + 3), i * 3);
    kn.set(knotPts.subarray(i * 3, i * 3 + 3), i * 3);
    cs.set(casePts.subarray(i * 3, i * 3 + 3), i * 3);
    info[i * 4] = markPts.cls[i];
    info[i * 4 + 1] = Math.floor(rnd() * 5);
    if (rnd() < 0.045) info[i * 4 + 3] = 1 + Math.floor(rnd() * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aLogo', new THREE.BufferAttribute(logo, 3));
  geo.setAttribute('aKnot', new THREE.BufferAttribute(kn, 3));
  geo.setAttribute('aCase', new THREE.BufferAttribute(cs, 3));
  geo.setAttribute('aRnd', new THREE.BufferAttribute(rr, 4));
  geo.setAttribute('aP', new THREE.BufferAttribute(pp, 4));
  geo.setAttribute('aInfo', new THREE.BufferAttribute(info, 4));
  const points = new THREE.Points(geo, new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
  points.frustumCulled = false;
  scene.add(points);

  // ---------------------------------------------------------------- glow, then a little grain and a vignette
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.7, 0.5, 0.18);
  composer.addPass(bloom);
  const grain = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uT: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uT; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
        vec3 c = texture2D(tDiffuse, vUv).rgb;
        vec2 d = vUv - 0.5;
        c *= 1.0 - dot(d, d) * 0.7;
        c += (h(vUv * 1000.0 + fract(uT) * 77.0) - 0.5) * 0.025;
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
          { pos: V(0, 0.7, -21.5), look: V(0, 0.2, -36) },
          { pos: V(0, -0.1, -41), look: V(0, -1.2, -58) },
          { pos: V(-0.6, 2.8, -69.5), look: V(-0.6, -0.2, -80) },
          { pos: V(1.2, 0.95, -91.6), look: V(1.2, 0.4, CASE_Z) },
          { pos: V(-2.5, 4.3, -110.8), look: V(-2.5, -3.1, -125) },
          { pos: V(-2.3, 0.6, -136.6), look: FINAL.clone().add(V(-2.3, 0.35, 0)) },
        ];
  }
  keys();
  const smooth = (x) => x * x * (3 - 2 * x);
  function camAt(s, t) {
    const k = Math.min(Math.floor(s), LAST - 1), f = smooth(Math.min(1, Math.max(0, s - k)));
    const a = KEYS[k], b = KEYS[k + 1];
    const pos = a.pos.clone().lerp(b.pos, f), look = a.look.clone().lerp(b.look, f);
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
    ...Object.fromEntries([0, 1, 2, 3].map((k) => ['p' + k, () => knotAt(KNOTS[k]).add(V(0, 1.4, 0))])),
    ...Object.fromEntries([0, 1, 2, 3, 4].map((g) => ['a' + g, () => formCenter(g).add(V(0, -1.75 * sc(), 0))])),
    ...Object.fromEntries([0, 1, 2, 3].map((r) => ['l' + r, () => (PORT ? layerC().add(V(0, layerY(r) + 0.3, layerR(r))) : layerC().add(V(layerR(r) + 0.3, layerY(r), 0)))])),
    ...Object.fromEntries([0, 1, 2, 3].map((r) => ['c' + r, () => V(PORT ? 0 : (caseX()[0] + (caseX()[0] + caseX()[1]) / 2) / 2, caseRowY(r) + 0.48, CASE_Z)])),
    ...Object.fromEntries([0, 1, 2, 3, 4, 5].map((k) => ['m' + k, () => mapNode(k).add(V(0, 0.65, 0))])),
  };
  const STAGE_OF = { idea: 0, brand: 1, n: 2, p: 3, a: 4, l: 5, c: 6, m: 7 };
  let tags = [];
  const placeTags = () =>
    (tags = [...document.querySelectorAll('[data-tag]')].map((el) => {
      const id = el.dataset.tag;
      // (the startup layers' labels start at their ring's edge rather than straddling it)
      const left = !PORT && el.classList.contains('t-layer');
      return { el, at: anchors[id](), stage: STAGE_OF[id] ?? STAGE_OF[id[0]], left, w: el.offsetWidth, shift: left ? 'translate(0, -50%)' : 'translate(-50%, -50%)' };
    }));
  placeTags();
  // (their widths change once the web fonts arrive)
  if (document.fonts) document.fonts.ready.then(placeTags);
  const rail = [...document.querySelectorAll('.rail button')];
  const hint = document.querySelector('.hint');
  const tmp = new THREE.Vector3();
  let shownStage = -1;
  function words(s) {
    for (const g of tags) {
      let o = Math.max(0, 1 - Math.abs(s - g.stage) * 2.4);
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
    const near = Math.round(s);
    const on = Math.abs(s - near) < 0.28 ? near : -1;
    if (on !== shownStage) {
      shownStage = on;
      sections.forEach((el) => {
        const me = +el.dataset.stage === on;
        el.classList.toggle('on', me);
        el.setAttribute('aria-hidden', me ? 'false' : 'true');
      });
    }
    rail.forEach((b, i) => b.classList.toggle('on', i === near));
    if (hint) hint.classList.toggle('gone', s > 0.25);
  }

  // ---------------------------------------------------------------- moving through it: wheel, finger, keys, the rail; at rest it settles on a stage
  let target = 0, stage = 0, t = 0, idle = 0;
  const PTR = { x: 0, y: 0, tx: 0, ty: 0 };
  const go = (s) => {
    target = Math.min(LAST, Math.max(0, s));
    idle = 0;
  };
  const jump = (s) => {
    go(s);
    idle = 1; // settle straight away
  };
  initAsk(jump);
  rail.forEach((b, i) => b.addEventListener('click', () => jump(i)));
  document.querySelectorAll('[data-go]').forEach((el) => el.addEventListener('click', (e) => (e.preventDefault(), jump(+el.dataset.go))));
  const busy = (e) => e.target.closest && e.target.closest('.ask, input, textarea');
  if (!CAPTURE) {
    addEventListener('wheel', (e) => !busy(e) && go(target + Math.max(-60, Math.min(60, e.deltaY)) * 0.0045), { passive: true });
    let ty = null;
    addEventListener('touchstart', (e) => (ty = busy(e) ? null : e.touches[0].clientY), { passive: true });
    addEventListener('touchmove', (e) => {
      if (ty == null) return;
      go(target + (ty - e.touches[0].clientY) * 0.0085);
      ty = e.touches[0].clientY;
    }, { passive: true });
    addEventListener('keydown', (e) => {
      if (busy(e)) return;
      if (['ArrowDown', 'PageDown', ' '].includes(e.key)) jump(Math.round(target) + 1);
      if (['ArrowUp', 'PageUp'].includes(e.key)) jump(Math.round(target) - 1);
      if (e.key === 'Home') jump(0);
      if (e.key === 'End') jump(LAST);
    });
    addEventListener('pointermove', (e) => {
      PTR.tx = (e.clientX / W - 0.5) * 2;
      PTR.ty = (e.clientY / H - 0.5) * 2;
    }, { passive: true });
  }
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
    keys();
    placeTags();
  });

  // ---------------------------------------------------------------- each frame; on a slow device it draws less
  let slow = 0, frames = 0, level = 0;
  function frame(dt) {
    t += dt;
    idle += dt;
    if (!CAPTURE && idle > 0.22) target += (Math.round(target) - target) * Math.min(1, dt * 5);
    stage += (target - stage) * Math.min(1, dt * 2.4);
    PTR.x += (PTR.tx - PTR.x) * Math.min(1, dt * 2);
    PTR.y += (PTR.ty - PTR.y) * Math.min(1, dt * 2);
    const { pos, look } = camAt(stage, t);
    camera.position.copy(pos);
    camera.lookAt(look);
    U.uT.value = t;
    U.uS.value = stage;
    U.uFocus.value = pos.distanceTo(look);
    bgMat.uniforms.uS.value = stage;
    grain.uniforms.uT.value = t;
    words(stage);
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
          } else geo.setDrawRange(0, Math.round(N * 0.55));
        }
        frames = slow = 0;
      }
    }
  }
  window.__w = {
    step: (dt) => frame(dt),
    scrollTo: (s) => go(s),
    get t() {
      return t;
    },
    get s() {
      return stage;
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
