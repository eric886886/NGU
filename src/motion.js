/* NaxaStudio — motion homepage engine.
   One clock drives everything: DOM cues (data-at / data-out), state classes (data-on / data-off),
   counters (data-count) and a particle field whose formations are pure functions of time,
   so the film can be paused, scrubbed and jumped to any chapter. */
(() => {
  'use strict';

  const doc = document.documentElement;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, e) => a + (b - a) * e;
  const easeOut = (x) => 1 - Math.pow(1 - x, 3);
  const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const smooth = (a, b, x) => {
    const k = clamp((x - a) / (b - a));
    return k * k * (3 - 2 * k);
  };
  const TAU = Math.PI * 2;

  const params = new URLSearchParams(location.search);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mqMobile = matchMedia('(max-width: 759px)');

  doc.classList.remove('no-js');

  /* ------------------------------------------------------------------ split headings into words */

  // Wraps every word of an element in its own span, keeping inline tags such as <em>.
  function splitWords(el, make) {
    let i = 0;
    const walk = (node, into) => {
      Array.from(node.childNodes).forEach((n) => {
        if (n.nodeType === 3) {
          n.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) into.appendChild(document.createTextNode(' '));
            else into.appendChild(make(part, i++));
          });
        } else if (n.nodeType === 1) {
          const c = n.cloneNode(false);
          into.appendChild(c);
          walk(n, c);
        }
      });
    };
    const frag = document.createDocumentFragment();
    walk(el, frag);
    el.textContent = '';
    el.appendChild(frag);
  }

  const word = (cls, text, at, dur) => {
    const s = document.createElement('span');
    s.className = cls;
    s.textContent = text;
    s.dataset.at = at.toFixed(3);
    s.dataset.dur = dur;
    return s;
  };

  // Headings: words rise in one after another.
  $$('[data-split]').forEach((el) => {
    const at = parseFloat(el.dataset.at || '0');
    const st = parseFloat(el.dataset.stagger || '0.06');
    const dur = el.dataset.dur || '0.9';
    splitWords(el, (w, i) => word('m m-word', w, at + i * st, dur));
    el.removeAttribute('data-at');
  });

  // Read-along paragraphs: the paragraph fades in dim, then lights up word by word at reading pace.
  $$('[data-read]').forEach((el) => {
    const at = parseFloat(el.dataset.read);
    const rate = parseFloat(el.dataset.rate || '0.12');
    splitWords(el, (w, i) => word('rw', w, at + i * rate, '0.35'));
  });

  /* ------------------------------------------------------------------ scenes & timeline */

  const OVER = 0.6; // scenes overlap by this much
  const EXIT = 0.8; // a scene fades out over its last EXIT seconds

  const num = (v, d) => (v == null || v === '' ? d : parseFloat(v));

  const scenes = $$('.scene').map((el, idx) => {
    const s = {
      el,
      idx,
      id: el.dataset.scene,
      label: el.dataset.label,
      dur: num(el.dataset.dur, 10),
      dimM: num(el.dataset.dimM, 1),
      cues: [],
      ons: [],
      counts: [],
      forms: [],
      keyed: {},
      vis: false,
      xv: -1,
    };
    $$('[data-at]', el).forEach((c) => {
      const cue = {
        el: c,
        at: num(c.dataset.at, 0),
        dur: num(c.dataset.dur, 0.9),
        out: num(c.dataset.out, null),
        outm: num(c.dataset.outm, null),
        land: num(c.dataset.land, null),
        ldur: num(c.dataset.ldur, 1),
        p: -1,
        o: -1,
        l: -1,
      };
      s.cues.push(cue);
      if (c.dataset.key) (s.keyed[c.dataset.key] = s.keyed[c.dataset.key] || []).push(cue);
    });
    $$('[data-on]', el).forEach((c) => s.ons.push({ el: c, on: num(c.dataset.on, 0), off: num(c.dataset.off, Infinity), st: '' }));
    $$('[data-count]', el).forEach((c) =>
      s.counts.push({
        el: c,
        to: num(c.dataset.count, 0),
        from: num(c.dataset.from, 0),
        at: num(c.dataset.cat, 0),
        dur: num(c.dataset.cdur, 1.2),
        last: null,
      })
    );
    (el.dataset.forms || '')
      .split(',')
      .filter(Boolean)
      .forEach((f) => {
        const [name, at] = f.split('@');
        s.forms.push({ name: name.trim(), at: num(at, 0) });
      });
    return s;
  });

  let acc = 0;
  scenes.forEach((s, i) => {
    s.start = acc;
    s.end = acc + s.dur;
    acc = s.end - (i < scenes.length - 1 ? OVER : 0);
  });
  const LAST = scenes[scenes.length - 1];
  const TOTAL = LAST.end;

  const forms = [];
  scenes.forEach((s) => s.forms.forEach((f) => forms.push({ name: f.name, t: s.start + f.at })));
  forms.sort((a, b) => a.t - b.t);

  /* ------------------------------------------------------------------ shared values the scenes publish for the field */

  const fx = {
    hubAct: [0, 0, 0, 0, 0, 0],
    riseRev: 0,
    roiAct: [0, 0, 0],
    pathHead: 0,
    cubeBuild: 0,
    cubePulse: 0,
    roiDim: 1,
    storm: 0,
    flowActive: -1,
  };

  const flowNum = $('#flowNum');
  const flowFill = $('#flowFill');
  const flowWord = $('#flowWord');
  const flowDesc = $('#flowDesc');
  const flowSteps = $$('.s-flow .gate').map((g) => ({ name: $('strong', g).textContent, desc: $('.gate-d', g).textContent }));
  const roiRow = $('#roiRow');

  // Deterministic "decoding" text: unrevealed letters cycle through glyphs, then settle left to right.
  const GLYPHS = 'abcdefghijklmnopqrstuvwxyz#%&*+=/<>';
  const hash = (a, b) => {
    let h = (Math.imul(a + 1, 374761393) + Math.imul(b + 7, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const decode = (text, q, tick) => {
    if (q >= 1) return text;
    let out = '';
    for (let j = 0; j < text.length; j++) {
      const reveal = (j / text.length) * 0.65 + hash(j, 3) * 0.3;
      out += q >= reveal + 0.05 || text[j] === ' ' ? text[j] : GLYPHS[Math.floor(hash(j, tick) * GLYPHS.length)];
    }
    return out;
  };
  const setText = (el, v) => {
    if (el.textContent !== v) el.textContent = v;
  };

  const cueAct = (c, lt, lead = 0, len = 1.3) => easeInOut(clamp((lt - c.at + lead) / len));

  const hooks = {
    flow(lt, s) {
      let k = -1;
      s.ons.forEach((o, i) => {
        if (lt >= o.on) k = i;
      });
      fx.flowActive = k;
      setText(flowNum, '0' + Math.max(1, k + 1));
      flowFill.style.setProperty('--f', clamp((lt - 2) / 11.9).toFixed(4));
      if (k < 0) {
        setText(flowWord, '');
        setText(flowDesc, '');
        return;
      }
      const q = clamp((lt - s.ons[k].on) / 0.75);
      setText(flowWord, decode(flowSteps[k].name, q, Math.floor(lt * 22)));
      setText(flowDesc, flowSteps[k].desc);
      flowDesc.style.setProperty('--dq', smooth(0.35, 0.95, q).toFixed(3));
    },
    pain(lt, s) {
      const notes = s.keyed.note || [];
      fx.storm = notes.reduce((a, c) => a + clamp((lt - c.at) / c.dur), 0) / 6;
      // the collage trembles harder as the storm grows
      const amp = 0.5 + fx.storm * 2.6;
      notes.forEach((c, i) => {
        const el = c.inner || (c.inner = $('.pain-in', c.el));
        el.style.setProperty('--jx', (Math.sin(lt * 13 + i * 1.7) * amp).toFixed(2) + 'px');
        el.style.setProperty('--jy', (Math.cos(lt * 11.3 + i * 2.3) * amp).toFixed(2) + 'px');
      });
    },
    solutions(lt, s) {
      (s.keyed.sol || []).forEach((c, i) => (fx.hubAct[i] = cueAct(c, lt, 0.25, 1.4)));
    },
    outcomes(lt, s) {
      const list = s.keyed.out || [];
      fx.riseRev = list.reduce((a, c) => a + cueAct(c, lt, 0.35, 1.2), 0) / Math.max(1, list.length);
    },
    roi(lt, s) {
      let spot = false;
      let spotness = 0;
      (s.keyed.roi || []).forEach((c, i) => {
        fx.roiAct[i] = easeInOut(clamp((lt - c.land) / c.ldur));
        spotness = Math.max(spotness, smooth(c.at, c.at + 0.4, lt) * (1 - smooth(c.land, c.land + c.ldur * 0.6, lt)));
        const on = lt >= c.at && lt < c.land + c.ldur * 0.6;
        spot = spot || on;
        const item = c.item || (c.item = c.el.closest('.roi-item'));
        if (item.classList.contains('in-spot') !== on) item.classList.toggle('in-spot', on);
      });
      if (roiRow.classList.contains('spot') !== spot) roiRow.classList.toggle('spot', spot);
      fx.roiDim = 1 - 0.75 * spotness;
    },
    founders(lt, s) {
      const marks = [...(s.keyed.step || []), ...(s.keyed.cta || [])];
      let h = 0;
      marks.forEach((c, i) => {
        h = lerp(h, L.pathMs[i + 1] == null ? 1 : L.pathMs[i + 1], cueAct(c, lt, 0.3, 1.4));
      });
      fx.pathHead = h;
    },
    start(lt, s) {
      fx.cubeBuild = easeInOut(clamp((lt - 0.3) / 5));
      fx.cubePulse = (s.keyed.proj || []).reduce((a, c) => a + Math.exp(-Math.pow((lt - c.at - 0.3) / 0.45, 2)), 0);
    },
  };

  /* ------------------------------------------------------------------ DOM rendering */

  let isMobile = mqMobile.matches;

  const setVar = (el, name, v, cache, key) => {
    if (cache[key] === v) return;
    cache[key] = v;
    el.style.setProperty(name, v.toFixed(4));
  };

  function renderScene(s, t, front) {
    const lt = t - s.start;
    const x = s === LAST ? 0 : easeInOut(clamp((lt - (s.dur - EXIT)) / EXIT));
    if (x !== s.xv) {
      s.xv = x;
      s.el.style.setProperty('--x', x.toFixed(4));
    }
    s.el.classList.toggle('front', front);
    for (const c of s.cues) {
      const p = easeOut(clamp((lt - c.at) / c.dur));
      const outT = isMobile && c.outm != null ? c.outm : c.out;
      const o = outT != null ? easeInOut(clamp((lt - outT) / 0.6)) : 0;
      setVar(c.el, '--p', p, c, 'p');
      setVar(c.el, '--o', o, c, 'o');
      if (c.land != null) setVar(c.el, '--land', easeInOut(clamp((lt - c.land) / c.ldur)), c, 'l');
    }
    for (const o of s.ons) {
      const st = lt >= o.off ? 'done' : lt >= o.on ? 'on' : '';
      if (st !== o.st) {
        o.el.classList.toggle('is-on', st === 'on');
        o.el.classList.toggle('is-done', st === 'done');
        o.st = st;
      }
    }
    for (const c of s.counts) {
      const v = Math.round(lerp(c.from, c.to, easeOut(clamp((lt - c.at) / c.dur))));
      if (v !== c.last) {
        c.last = v;
        c.el.textContent = v;
      }
    }
  }

  let frontScene = scenes[0];

  function renderDom(t) {
    let front = null;
    for (const s of scenes) {
      const live = t >= s.start && (t < s.end || s === LAST);
      if (live) front = s;
    }
    for (const s of scenes) {
      const live = t >= s.start && (t < s.end || s === LAST);
      if (!live) {
        if (s.vis) {
          s.vis = false;
          s.el.classList.remove('on', 'front');
        }
        continue;
      }
      if (!s.vis) {
        s.vis = true;
        s.el.classList.add('on');
      }
      renderScene(s, t, s === front);
    }
    // Hooks for the front scene and the one before it (its formation may still be morphing out).
    const fi = front ? front.idx : 0;
    for (let i = Math.max(0, fi - 1); i <= fi; i++) {
      const s = scenes[i];
      if (hooks[s.id]) hooks[s.id](clamp(t - s.start, 0, s.dur), s);
    }
    frontScene = front || scenes[0];
  }

  function showAllFinal() {
    // Read mode: final numbers, every gate lit as "done".
    scenes.forEach((s) => {
      s.counts.forEach((c) => {
        c.el.textContent = c.to;
        c.last = null;
      });
      s.ons.forEach((o) => {
        o.el.classList.remove('is-on');
        o.el.classList.add('is-done');
        o.st = '';
      });
    });
    flowNum.textContent = '05';
    flowFill.style.setProperty('--f', '1');
  }

  /* ------------------------------------------------------------------ particle field */

  const cvs = $('#field');
  const ctx = cvs.getContext('2d');
  const LOGO = (window.__NAXA_LOGO__ && window.__NAXA_LOGO__.pts) || [];
  const LOGO_ASPECT = (window.__NAXA_LOGO__ && window.__NAXA_LOGO__.aspect) || 1.55;

  const wide = Math.min(innerWidth, innerHeight * 1.8);
  const N = Math.min(LOGO.length || 1400, wide < 700 ? 1300 : wide < 1100 ? 1900 : 2600);

  let seed = 1234567;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const mk = () => {
    const a = new Float32Array(N);
    for (let i = 0; i < N; i++) a[i] = rnd();
    return a;
  };
  const R1 = mk(), R2 = mk(), R3 = mk(), R4 = mk(), R5 = mk(), R6 = mk();
  const DEL = new Float32Array(N), SW = new Float32Array(N), ANG = new Float32Array(N), SZ = new Float32Array(N);
  const COL = new Uint8Array(N), STAR = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    DEL[i] = R4[i] * 0.75;
    SW[i] = 18 + R5[i] * 70;
    ANG[i] = R6[i] * TAU;
    SZ[i] = 0.55 + R5[i] * 0.9;
    STAR[i] = R6[i] < 0.09 ? 1 : 0;
    COL[i] = LOGO[i] ? LOGO[i][2] : (i % 4) + 1;
  }
  const TDUR = 1.55;
  const MAXDEL = 0.75;

  // Glow sprites: 0 white-blue core, 1 light azure, 2 brand blue, 3 indigo, 4 teal, 5 amber (alerts)
  const PAL = ['234,244,255', '159,208,255', '79,155,255', '96,118,255', '54,200,224', '255,181,71'];
  const SPR = PAL.map((rgb) => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.1, `rgba(${rgb},1)`);
    gr.addColorStop(0.32, `rgba(${rgb},0.32)`);
    gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    return c;
  });

  let W = innerWidth, H = innerHeight, DPR = 1;
  const L = {
    hdr: 64,
    ctl: 76,
    intro: { x: 0, y: 0, s: 1 },
    hero: { x: 0, y: 0, s: 1 },
    fin: { x: 0, y: 0, s: 1 },
    gp: [],
    gc: 0,
    horiz: true,
    pain: { x: 0, y: 0, r: 1 },
    calm: { x: 0, y: 0, r: 1 },
    core: { x: 0, y: 0, r: 1 },
    sol: [],
    orbit: null,
    rise: null,
    roi: [],
    roiTop: 0,
    path: null,
    pathMs: [0, 0.25, 0.5, 0.75, 1],
    cube: { x: 0, y: 0, s: 1 },
  };

  /* ---- polyline helpers (Catmull-Rom through control points) */

  function spline(ctrl, per = 26) {
    const pts = [];
    const at = [];
    for (let i = 0; i < ctrl.length - 1; i++) {
      const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
      at.push(pts.length);
      for (let k = 0; k < per; k++) {
        const u = k / per, u2 = u * u, u3 = u2 * u;
        pts.push({
          x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * u + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * u2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * u3),
          y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * u + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * u2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * u3),
        });
      }
    }
    at.push(pts.length);
    pts.push({ x: ctrl[ctrl.length - 1].x, y: ctrl[ctrl.length - 1].y });
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    const len = cum[cum.length - 1] || 1;
    return { pts, cum, len, ms: at.map((k) => cum[k] / len) };
  }

  const AL = { x: 0, y: 0, nx: 0, ny: 0 };
  function along(poly, s) {
    const d = clamp(s) * poly.len;
    const { pts, cum } = poly;
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < d) lo = mid;
      else hi = mid;
    }
    const seg = cum[hi] - cum[lo] || 1;
    const e = (d - cum[lo]) / seg;
    const a = pts[lo], b = pts[hi];
    const dx = b.x - a.x, dy = b.y - a.y, dl = Math.hypot(dx, dy) || 1;
    AL.x = a.x + dx * e;
    AL.y = a.y + dy * e;
    AL.nx = -dy / dl;
    AL.ny = dx / dl;
    return AL;
  }

  /* ---- formations: f(i, t, o) writes position, alpha, size and heat for particle i at time t */

  function logoForm(key) {
    return (i, t, o) => {
      const c = L[key];
      const p = LOGO[i] || LOGO[i % LOGO.length];
      const px = p[0] / 1000, py = p[1] / 1000;
      let x = c.x + px * c.s, y = c.y + py * c.s;
      if (px < -0.3) {
        // the dotted "ideas" stream on the left keeps drifting into the mark
        x += Math.sin(t * 1.4 + R2[i] * TAU) * 5;
        y += Math.cos(t * 1.1 + R3[i] * TAU) * 3;
      } else {
        x += Math.sin(t * 0.9 + R1[i] * TAU) * 1.3;
        y += Math.cos(t * 0.8 + R2[i] * TAU) * 1.3;
      }
      // a light sweep travels left → right across the mark: idea → action
      const sweep = Math.max(0, Math.sin(t * 1.1 - px * 6));
      o.x = x;
      o.y = y;
      o.a = 0.5 + 0.5 * sweep * sweep;
      o.s = 1;
      o.h = 0;
    };
  }

  const F = {
    seed(i, t, o) {
      const c = L.intro;
      const a = R1[i] * TAU + t * (0.5 + R2[i] * 0.9);
      const r = 1.5 + R3[i] * R3[i] * 14 * (1 + 0.25 * Math.sin(t * 3 + R4[i] * 6));
      o.x = c.x + Math.cos(a) * r;
      o.y = c.y + Math.sin(a) * r;
      o.a = 0.42;
      o.s = 0.7;
      o.h = 0;
    },
    logoIntro: logoForm('intro'),
    logoHero: logoForm('hero'),
    logoFin: logoForm('fin'),

    flow(i, t, o) {
      const gp = L.gp;
      if (gp.length < 5) return F.calm(i, t, o);
      const horiz = L.horiz;
      const a0 = horiz ? -60 : gp[0] - 45;
      const a1 = horiz ? W + 60 : gp[4] + 150;
      const u = (R1[i] + t * 0.05 * (0.7 + R2[i] * 0.6)) % 1;
      let ax = a0 + u * (a1 - a0);
      const c0 = L.gc;
      const spread = horiz ? Math.min(H * 0.17, 150) : Math.min(W * 0.07, 34);
      const band = spread * 0.32;
      const lane = Math.floor(R3[i] * 3) - 1;
      const sgn = (R3[i] - 0.5) * 2;
      // cross-axis offset for each stage, blended at the gates
      const chaos = sgn * spread * (0.55 + 0.45 * Math.sin(t * 2.1 + R4[i] * 30)) + Math.sin(t * 3 + R5[i] * 40) * spread * 0.12;
      const P = [chaos, sgn * band, lane * band * 0.7, lane * band * 0.7, sgn * 2.5, sgn * 2.5];
      let off = P[0];
      let q = 0;
      for (let k = 0; k < 5; k++) {
        const w = smooth(gp[k] - 40, gp[k] + 40, ax);
        off = lerp(off, P[k + 1], w);
        if (k === 2) q = w;
        if (k === 3) q *= 1 - w;
      }
      // "Build": particles snap into blocks between gate 3 and 4
      if (q > 0.01) ax = lerp(ax, Math.round(ax / 15) * 15, q);
      const wave = Math.sin(ax * 0.011 + t * 0.9) * (horiz ? 9 : 3);
      const pos = c0 + wave + off;
      o.x = horiz ? ax : pos;
      o.y = horiz ? pos : ax;
      let a = horiz ? 0.75 * smooth(a0, gp[0], ax) + 0.25 : smooth(a0, gp[0], ax);
      a *= 1 - smooth(gp[4] + 20, horiz ? gp[4] + 160 : a1, ax) * (horiz ? 0.85 : 1);
      const act = fx.flowActive;
      if (act >= 0) a += 0.9 * Math.exp(-Math.pow((ax - gp[act]) / 60, 2));
      o.a = a;
      o.s = 0.9;
      o.h = 0;
    },

    storm(i, t, o) {
      const c = L.pain;
      const lvl = 1 + fx.storm * 1.4;
      const r = c.r * (0.18 + Math.pow(R3[i], 0.7) * 1.05);
      const w = (R2[i] - 0.5) * 1.5 + (R2[i] > 0.5 ? 0.35 : -0.35);
      const a = R1[i] * TAU + t * w;
      o.x = c.x + Math.cos(a) * r * 1.3 + Math.sin(t * 6.3 + R4[i] * 40) * 3.5 * lvl;
      o.y = c.y + Math.sin(a) * r * 0.9 + Math.cos(t * 5.1 + R5[i] * 40) * 3.5 * lvl;
      o.a = 0.22 + 0.3 * R5[i];
      o.s = 0.9;
      o.h = R4[i] < 0.12 + fx.storm * 0.16 ? 1 : 0;
    },

    calm(i, t, o) {
      const c = L.calm;
      const a = R1[i] * TAU + t * 0.12;
      const r = c.r * (1 + (R3[i] - 0.5) * 0.07);
      o.x = c.x + Math.cos(a) * r;
      o.y = c.y + Math.sin(a) * r * 0.9;
      o.a = 0.6 + 0.3 * Math.sin(a * 3 + t);
      o.s = 0.85;
      o.h = 0;
    },

    hub(i, t, o) {
      const core = L.core;
      const sats = L.sol;
      const k = i % 7;
      o.h = 0;
      if (!k || !sats[k - 1]) {
        if (L.orbit && R2[i] < 0.55) {
          // the lower half of the orbit the agents sit on
          const oa = ((R1[i] + t * 0.012) % 1) * Math.PI;
          o.x = L.orbit.x + Math.cos(oa) * L.orbit.rx;
          o.y = L.orbit.y + Math.sin(oa) * L.orbit.ry + (R3[i] - 0.5) * 3;
          o.a = 0.32;
          o.s = 0.7;
          return;
        }
        // the core: a small, dense sphere
        const ca = R1[i] * TAU + t * 0.6;
        const cr = core.r * Math.sqrt(R3[i]);
        o.x = core.x + Math.cos(ca) * cr;
        o.y = core.y + Math.sin(ca) * cr * 0.9;
        o.a = 0.5;
        o.s = 0.9;
        return;
      }
      // agents not deployed yet wait on a ring around the core
      const ra = R1[i] * TAU + t * 0.32;
      const rr = core.r * (2.2 + R3[i] * 1.6);
      const rx = core.x + Math.cos(ra) * rr;
      const ry = core.y + Math.sin(ra) * rr * 0.78;
      const sat = sats[k - 1];
      const act = fx.hubAct[k - 1];
      if (R2[i] < 0.45) {
        // data streaming from the core to each agent
        const u = (R4[i] + t * 0.22) % 1;
        const sx = core.x + (sat.x - core.x) * u;
        const sy = core.y + (sat.y - core.y) * u - Math.sin(u * Math.PI) * 26;
        o.x = lerp(rx, sx, act);
        o.y = lerp(ry, sy, act);
        o.a = lerp(0.3, 0.2 + 0.6 * Math.sin(Math.PI * u), act);
        o.s = 0.75;
      } else {
        const sa = R1[i] * TAU + t * 1.1;
        const sr = 3 + R3[i] * 9;
        o.x = lerp(rx, sat.x + Math.cos(sa) * sr, act);
        o.y = lerp(ry, sat.y + Math.sin(sa) * sr, act);
        o.a = lerp(0.3, 0.42, act);
        o.s = 0.8;
      }
    },

    rise(i, t, o) {
      const poly = L.rise;
      const rev = fx.riseRev;
      o.h = 0;
      if (!poly) return F.calm(i, t, o);
      if (R2[i] < 0.7) {
        const head = PRE.riseS;
        const s = (R1[i] + t * 0.025) % 1;
        const p = along(poly, s);
        const n = (R3[i] - 0.5) * 9;
        o.x = p.x + p.nx * n;
        o.y = p.y + p.ny * n;
        if (s <= head) {
          o.a = 0.7 + 0.3 * smooth(head - 0.05, head, s);
          o.s = 0.9;
        } else {
          o.a = 0.07;
          o.s = 0.7;
        }
      } else if (R2[i] < 0.84) {
        // arrowhead appears once the line has reached the end
        const ang = R4[i] < 0.5 ? 0.6 : -0.6;
        const v = R3[i] * 30;
        const done = smooth(0.88, 1, rev);
        const ux = PRE.ux, uy = PRE.uy;
        const hx = PRE.ex - (ux * Math.cos(ang) - uy * Math.sin(ang)) * v;
        const hy = PRE.ey - (ux * Math.sin(ang) + uy * Math.cos(ang)) * v;
        o.x = lerp(PRE.hx, hx, done);
        o.y = lerp(PRE.hy, hy, done);
        o.a = 0.25 + 0.75 * done;
        o.s = 1;
      } else {
        // dust rising through the whole scene
        o.x = R1[i] * W + Math.sin(t * 0.5 + R4[i] * 9) * 12;
        o.y = H - ((R3[i] + t * 0.03 * (0.5 + R4[i])) % 1) * H;
        o.a = 0.22;
        o.s = 0.7;
      }
    },

    pillars(i, t, o) {
      const cards = L.roi;
      o.h = 0;
      if (cards.length < 3) return F.calm(i, t, o);
      const k = i % 3;
      const c = cards[k];
      const act = fx.roiAct[k];
      const h = c.ph * act;
      const u = (R3[i] + t * 0.07 * (0.6 + R4[i] * 0.8)) % 1;
      const spread = c.w * 0.4 * (1 - u * 0.5);
      o.x = c.x + (R2[i] - 0.5) * 2 * spread + Math.sin(t + R5[i] * 9) * 2;
      o.y = c.base - u * h;
      o.a = (0.15 + 0.5 * (1 - u)) * act * fx.roiDim;
      o.s = 0.85;
    },

    path(i, t, o) {
      const poly = L.path;
      o.h = 0;
      if (!poly) return F.calm(i, t, o);
      const head = fx.pathHead;
      if (R2[i] < 0.88) {
        const s = (R1[i] + t * 0.01) % 1;
        const p = along(poly, s);
        const n = (R3[i] - 0.5) * 7;
        o.x = p.x + p.nx * n;
        o.y = p.y + p.ny * n;
        // the road already travelled fades behind the idea
        o.a = s <= head ? 0.22 + 0.63 * smooth(head - 0.35, head, s) : isMobile ? 0.1 : 0.2;
        o.s = s <= head ? 0.9 : 0.7;
      } else {
        // the idea itself, travelling milestone by milestone
        const a = R1[i] * TAU + t * 2.2;
        const r = 3 + R3[i] * R3[i] * 20;
        o.x = PRE.px + Math.cos(a) * r;
        o.y = PRE.py + Math.sin(a) * r;
        o.a = 0.42;
        o.s = 0.9;
      }
    },

    cube(i, t, o) {
      const c = L.cube;
      const build = fx.cubeBuild;
      const pulse = fx.cubePulse;
      o.h = 0;
      let x, y, z;
      if (R2[i] < 0.72) {
        // edges of a cube: 12 edges, each walked by its particles
        const e = i % 12;
        const u = R1[i] * 2 - 1;
        const axis = e >> 2;
        const s1 = e & 1 ? 1 : -1;
        const s2 = e & 2 ? 1 : -1;
        if (axis === 0) (x = u), (y = s1), (z = s2);
        else if (axis === 1) (x = s1), (y = u), (z = s2);
        else (x = s1), (y = s2), (z = u);
        const order = (e + (u + 1) / 2) / 12;
        const shown = order <= build ? 1 : 0;
        const k = shown ? 1 : 0.15;
        x *= k;
        y *= k;
        z *= k;
        o.a = shown ? 0.95 : 0.2;
      } else {
        // a soft core inside the cube
        const a = R1[i] * TAU, b = Math.acos(R3[i] * 2 - 1), r = 0.55 * Math.cbrt(R4[i]);
        x = r * Math.sin(b) * Math.cos(a);
        y = r * Math.cos(b);
        z = r * Math.sin(b) * Math.sin(a);
        o.a = 0.25 + 0.5 * build;
      }
      const ry = t * 0.35 + 0.6, rx = -0.42 + Math.sin(t * 0.4) * 0.08;
      const cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(rx), sx = Math.sin(rx);
      const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
      const y1 = y * cx - z1 * sx, z2 = y * sx + z1 * cx;
      const scale = c.s * (1 + pulse * 0.06);
      const persp = 3.2 / (3.2 + z2);
      o.x = c.x + x1 * scale * persp;
      o.y = c.y + y1 * scale * persp;
      o.a *= 0.55 + 0.45 * (1 - (z2 + 1.4) / 2.8) + pulse * 0.3;
      o.s = 0.85 * persp;
    },
  };

  // values shared by every particle in a frame
  const PRE = { riseS: 0, hx: 0, hy: 0, ex: 0, ey: 0, ux: 1, uy: 0, px: 0, py: 0 };
  function prepare() {
    if (L.rise) {
      PRE.riseS = 0.04 + fx.riseRev * 0.96;
      const h = along(L.rise, PRE.riseS);
      PRE.hx = h.x;
      PRE.hy = h.y;
      const b = along(L.rise, 0.97);
      const bx = b.x, by = b.y;
      const e = along(L.rise, 1);
      const dl = Math.hypot(e.x - bx, e.y - by) || 1;
      PRE.ex = e.x;
      PRE.ey = e.y;
      PRE.ux = (e.x - bx) / dl;
      PRE.uy = (e.y - by) / dl;
    }
    if (L.path) {
      const p = along(L.path, fx.pathHead);
      PRE.px = p.x;
      PRE.py = p.y;
    }
  }

  const A = { x: 0, y: 0, a: 0, s: 1, h: 0 };
  const B = { x: 0, y: 0, a: 0, s: 1, h: 0 };

  function formIndex(t) {
    let k = 0;
    for (let i = 0; i < forms.length; i++) if (forms[i].t <= t) k = i;
    return k;
  }

  let fieldDim = 1;

  function drawField(t, override) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';

    let fc, fp = null, since = 99;
    if (override) {
      fc = F[override];
    } else {
      const k = formIndex(t);
      fc = F[forms[k].name];
      if (k > 0) fp = F[forms[k - 1].name];
      since = t - forms[k].t;
    }
    const trans = fp && since < TDUR + MAXDEL;
    prepare();
    const starIn = override ? 1 : smooth(0.3, 2.5, t);
    const base = isMobile ? 2.6 : 3.1;

    for (let i = 0; i < N; i++) {
      let x, y, a, s, h;
      if (STAR[i]) {
        x = R1[i] * W;
        y = R2[i] * H;
        a = (0.12 + 0.28 * (0.5 + 0.5 * Math.sin(t * (0.4 + R3[i] * 1.4) + R4[i] * TAU))) * starIn;
        s = 0.55;
        h = 0;
      } else {
        fc(i, t, A);
        if (trans) {
          const q = clamp((since - DEL[i]) / TDUR);
          if (q < 1) {
            fp(i, t, B);
            const e = easeInOut(q);
            const sw = Math.sin(Math.PI * e) * SW[i];
            x = lerp(B.x, A.x, e) + Math.cos(ANG[i]) * sw;
            y = lerp(B.y, A.y, e) + Math.sin(ANG[i]) * sw;
            a = lerp(B.a, A.a, e);
            s = lerp(B.s, A.s, e);
            h = e < 0.5 ? B.h : A.h;
          } else {
            x = A.x; y = A.y; a = A.a; s = A.s; h = A.h;
          }
        } else {
          x = A.x; y = A.y; a = A.a; s = A.s; h = A.h;
        }
      }
      if (a < 0.01 || x < -30 || y < -30 || x > W + 30 || y > H + 30) continue;
      const r = base * s * SZ[i];
      ctx.globalAlpha = a * fieldDim > 1 ? 1 : a * fieldDim;
      ctx.drawImage(SPR[h ? 5 : STAR[i] ? 1 : COL[i]], x - r, y - r, r * 2, r * 2);
    }
  }

  /* ------------------------------------------------------------------ layout measuring */

  const rectOf = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height };
  };
  const anchors = (name) => $$(`[data-anchor="${name}"]`).map(rectOf);
  const fitLogo = (r, k = 0.92) => ({ x: r.x, y: r.y, s: Math.max(60, Math.min(r.w, r.h * LOGO_ASPECT) * k) });

  function measure() {
    W = innerWidth;
    H = innerHeight;
    DPR = Math.min(2, window.devicePixelRatio || 1);
    cvs.width = Math.round(W * DPR);
    cvs.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    isMobile = mqMobile.matches;
    const cs = getComputedStyle(doc);
    L.hdr = parseFloat(cs.getPropertyValue('--hdr')) || 64;
    L.ctl = parseFloat(cs.getPropertyValue('--ctl')) || 76;

    doc.classList.add('measuring');
    if (!readMode) {
      // Shrink any scene whose content is taller than the space between header and controls.
      scenes.forEach((s) => {
        const wrap = $('.wrap', s.el);
        wrap.style.setProperty('--fit', '1');
        const avail = s.el.clientHeight - (isMobile ? 26 : 30);
        const need = wrap.offsetHeight;
        const fit = need > avail ? Math.max(0.62, avail / need) : 1;
        wrap.style.setProperty('--fit', fit.toFixed(4));
      });
    }

    const [intro] = anchors('intro');
    const [hero] = anchors('hero');
    const [fin] = anchors('fin');
    if (intro) L.intro = fitLogo(intro);
    if (hero) L.hero = fitLogo(hero, isMobile ? 1 : 0.95);
    if (fin) L.fin = fitLogo(fin);

    const gates = anchors('gate');
    if (gates.length >= 5) {
      L.horiz = Math.abs(gates[4].x - gates[0].x) > Math.abs(gates[4].y - gates[0].y);
      L.gp = gates.map((r) => (L.horiz ? r.x : r.y));
      L.gc = L.horiz ? gates[0].y : gates[0].x;
    }

    const [pain] = anchors('pain');
    if (pain) L.pain = { x: pain.x, y: pain.y, r: Math.min(pain.w, pain.h) * (isMobile ? 0.5 : 0.56) };

    const midY = L.hdr + (H - L.hdr - L.ctl) / 2;
    L.calm = { x: W / 2, y: midY, r: Math.min(W * 0.4, (H - L.hdr - L.ctl) * 0.36) };

    const [core] = anchors('core');
    if (core) L.core = { x: core.x, y: core.y, r: isMobile ? 10 : 30 };
    L.sol = anchors('sol');
    const [orbit] = anchors('orbit');
    L.orbit = orbit && core && !isMobile ? { x: core.x, y: core.y, rx: orbit.w * 0.46, ry: orbit.h * 0.52 } : null;

    const outs = anchors('out');
    if (outs.length === 6 && !isMobile) {
      // the growth line runs through every outcome's dot and ends in an arrow
      const ctrl = [{ x: outs[0].x - 80, y: outs[0].y + 50 }];
      outs.forEach((r) => ctrl.push({ x: r.x, y: r.y }));
      ctrl.push({ x: Math.min(W - 24, outs[5].x + 70), y: outs[5].y - 46 });
      L.rise = spline(ctrl);
    } else {
      L.rise = spline([
        { x: W * 0.02, y: H * 0.86 },
        { x: W * 0.3, y: H * 0.74 },
        { x: W * 0.55, y: H * 0.6 },
        { x: W * 0.78, y: H * 0.42 },
        { x: W * 0.95, y: H * 0.22 },
      ]);
    }

    L.roi = anchors('roi').map((r, k) => {
      const base = r.b + 8;
      return { x: r.x, w: r.w * 0.95, base, ph: (r.h + (isMobile ? 20 : 70)) * [0.75, 1, 0.85][k] };
    });
    // keynote numbers: offset from their seat to centre stage, in the wrap's own (unscaled) pixels
    const row = $('#roiRow');
    if (row) {
      const rr = row.getBoundingClientRect();
      const fit = parseFloat($('.s-roi .wrap').style.getPropertyValue('--fit')) || 1;
      $$('.fly').forEach((el) => {
        const r = rectOf(el);
        const sx = W / 2, sy = isMobile ? rr.top + 70 : rr.top + rr.height * 0.42;
        const fs = isMobile ? Math.min(1.6, (W * 0.8) / r.w) : Math.min(2.1, (W * 0.6) / r.w);
        el.style.setProperty('--dx', ((sx - r.x) / fit).toFixed(1) + 'px');
        el.style.setProperty('--dy', ((sy - r.y) / fit).toFixed(1) + 'px');
        el.style.setProperty('--fs', fs.toFixed(3));
      });
    }

    const steps = anchors('step');
    const [end] = anchors('pathEnd');
    const [journey] = anchors('journey');
    if (steps.length === 3 && end) {
      const p0 = isMobile || !journey ? { x: W * 0.5, y: H - L.ctl - 50 } : { x: journey.l - 30, y: journey.b + 10 };
      const ctrl = [p0, ...steps.map((r) => ({ x: r.x, y: r.y })), { x: end.x, y: end.y }];
      L.path = spline(ctrl);
      L.pathMs = L.path.ms;
    }

    const [cube] = anchors('cube');
    if (isMobile) L.cube = { x: W * 0.8, y: H - L.ctl - 62, s: Math.min(W * 0.1, 40) };
    else if (cube) L.cube = { x: cube.x, y: cube.y, s: Math.min(cube.w, cube.h) * 0.36 };

    doc.classList.remove('measuring');
    // the read-mode backdrop: a slow ring on the right
    if (readMode) L.calm = { x: W * (isMobile ? 0.7 : 0.78), y: H * 0.42, r: Math.min(W, H) * 0.26 };
    dirty = true;
  }

  /* ------------------------------------------------------------------ playback state & UI */

  let t = 0;
  let playing = true;
  let ended = false;
  let speed = 1;
  let readMode = false;
  let dirty = true;
  let menuOpen = false;
  let wasPlayingBeforeMenu = false;

  const ctl = $('#ctl');
  const playBtn = $('#play');
  const rail = $('#rail');
  const railTip = $('#railTip');
  const chapEl = $('#chap');
  const timeEl = $('#time');
  const speedBtn = $('#speed');
  const readBtn = $('#read');
  const flash = $('#flash');

  const segs = scenes.map((s) => {
    const seg = document.createElement('span');
    seg.className = 'seg';
    seg.style.setProperty('--d', s.dur.toFixed(2));
    seg.appendChild(document.createElement('b'));
    rail.insertBefore(seg, railTip);
    return seg;
  });

  const fmt = (v) => {
    v = Math.max(0, Math.round(v));
    return Math.floor(v / 60) + ':' + String(v % 60).padStart(2, '0');
  };

  function setPlaying(v) {
    playing = v;
    if (v && ended) {
      ended = false;
      seek(0);
    }
    syncButtons();
  }

  function syncButtons() {
    ctl.classList.toggle('paused', !playing && !ended);
    ctl.classList.toggle('ended', ended);
    playBtn.setAttribute('aria-label', ended ? 'Replay' : playing ? 'Pause' : 'Play');
  }

  function seek(nt) {
    t = clamp(nt, 0, TOTAL);
    if (t < TOTAL) ended = false;
    ctx.clearRect(0, 0, W, H);
    dirty = true;
    syncButtons();
  }

  function currentIndex() {
    let k = 0;
    scenes.forEach((s, i) => {
      if (t >= s.start) k = i;
    });
    return k;
  }

  function go(dir) {
    const k = currentIndex();
    let target;
    if (dir < 0) target = t - scenes[k].start > 1.6 || k === 0 ? k : k - 1;
    else target = Math.min(scenes.length - 1, k + 1);
    if (dir > 0 && k === scenes.length - 1) return;
    seek(scenes[target].start + (target === 0 ? 0 : 0.01));
    if (!playing && !ended) setPlaying(true);
  }

  function doFlash(isPlay) {
    flash.classList.remove('go', 'is-play', 'is-pause');
    void flash.offsetWidth;
    flash.classList.add('go', isPlay ? 'is-play' : 'is-pause');
  }

  function toggle() {
    if (readMode) return;
    setPlaying(!playing || ended);
    doFlash(playing);
  }

  function updateUI() {
    scenes.forEach((s, i) => {
      const f = clamp((t - s.start) / (s.end - s.start));
      if (segs[i]._f !== f) {
        segs[i]._f = f;
        segs[i].style.setProperty('--f', f.toFixed(4));
      }
    });
    const label = frontScene.label;
    if (chapEl.textContent !== label) chapEl.textContent = label;
    const tt = fmt(t) + ' / ' + fmt(TOTAL);
    if (timeEl.textContent !== tt) timeEl.textContent = tt;
    rail.setAttribute('aria-valuenow', Math.round((t / TOTAL) * 100));
    rail.setAttribute('aria-valuetext', `${label}, ${fmt(t)}`);
  }

  function railTime(clientX) {
    for (let i = 0; i < segs.length; i++) {
      const r = segs[i].getBoundingClientRect();
      if (clientX <= r.right + 2 || i === segs.length - 1) {
        const f = clamp((clientX - r.left) / r.width);
        return { t: scenes[i].start + f * (scenes[i].end - scenes[i].start), i };
      }
    }
    return { t: 0, i: 0 };
  }

  let dragging = false;
  rail.addEventListener('pointerdown', (e) => {
    dragging = true;
    rail.setPointerCapture(e.pointerId);
    seek(railTime(e.clientX).t);
  });
  rail.addEventListener('pointermove', (e) => {
    const hit = railTime(e.clientX);
    railTip.textContent = scenes[hit.i].label;
    railTip.style.left = e.clientX - rail.getBoundingClientRect().left + 'px';
    if (dragging) seek(hit.t);
  });
  const endDrag = () => (dragging = false);
  rail.addEventListener('pointerup', endDrag);
  rail.addEventListener('pointercancel', endDrag);
  rail.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      seek(t + (e.key === 'ArrowLeft' ? -5 : 5));
    }
  });

  playBtn.addEventListener('click', () => {
    setPlaying(!playing || ended);
  });
  $('#prev').addEventListener('click', () => go(-1));
  $('#next').addEventListener('click', () => go(1));

  const SPEEDS = [1, 1.5, 2];
  speedBtn.addEventListener('click', () => {
    speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    speedBtn.textContent = speed + '×';
  });

  function setRead(v) {
    readMode = v;
    doc.classList.toggle('read', v);
    readBtn.textContent = v ? 'Play as film' : 'Read as page';
    if (v) {
      showAllFinal();
      scenes.forEach((s) => {
        s.vis = false;
        s.el.classList.remove('on', 'front');
      });
      window.scrollTo(0, 0);
    } else {
      scenes.forEach((s) => {
        s.counts.forEach((c) => (c.last = null));
        s.ons.forEach((o) => (o.st = 'x'));
        s.cues.forEach((c) => {
          c.p = -1;
          c.o = -1;
        });
        s.xv = -1;
      });
      window.scrollTo(0, 0);
      seek(t >= TOTAL ? 0 : t);
      setPlaying(true);
    }
    measure();
  }
  readBtn.addEventListener('click', () => setRead(!readMode));

  // click / tap on the stage toggles play
  $('#stage').addEventListener('click', (e) => {
    if (readMode || e.target.closest('a, button, summary, input, .ctl')) return;
    toggle();
  });

  // keyboard
  addEventListener('keydown', (e) => {
    if (readMode || menuOpen || e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (e.key === ' ' || e.key === 'k') {
      if (tag === 'button' || tag === 'a' || tag === 'summary') return;
      e.preventDefault();
      toggle();
    } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
      e.preventDefault();
      go(1);
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      e.preventDefault();
      go(-1);
    } else if (e.key === 'Home') {
      seek(0);
    } else if (e.key === 'End') {
      seek(TOTAL);
    }
  });

  // wheel → chapter (one jump per gesture)
  let wheelLock = 0;
  let wheelAcc = 0;
  addEventListener(
    'wheel',
    (e) => {
      if (readMode || menuOpen || e.target.closest('.menu-panel, .nav.open')) return;
      e.preventDefault();
      const now = performance.now();
      if (now < wheelLock) {
        wheelLock = Math.max(wheelLock, now + 260);
        return;
      }
      wheelAcc += Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (Math.abs(wheelAcc) > 45) {
        go(wheelAcc > 0 ? 1 : -1);
        wheelAcc = 0;
        wheelLock = now + 900;
      }
    },
    { passive: false }
  );

  // swipe → chapter
  let touch0 = null;
  $('#stage').addEventListener(
    'touchstart',
    (e) => {
      const p = e.touches[0];
      touch0 = { x: p.clientX, y: p.clientY };
    },
    { passive: true }
  );
  $('#stage').addEventListener(
    'touchend',
    (e) => {
      if (!touch0 || readMode) return;
      const p = e.changedTouches[0];
      const dx = p.clientX - touch0.x, dy = p.clientY - touch0.y;
      touch0 = null;
      if (Math.abs(dy) > 60 && Math.abs(dy) > Math.abs(dx) * 1.3) go(dy < 0 ? 1 : -1);
      else if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.3) go(dx < 0 ? 1 : -1);
    },
    { passive: true }
  );

  // mobile menu
  const nav = $('#nav');
  const navToggle = $('#navToggle');
  const menu = $('.menu', nav);
  navToggle.addEventListener('click', () => {
    menuOpen = !nav.classList.contains('open');
    nav.classList.toggle('open', menuOpen);
    navToggle.setAttribute('aria-expanded', String(menuOpen));
    if (menuOpen) {
      menu.open = true;
      wasPlayingBeforeMenu = playing;
      if (playing) setPlaying(false);
    } else if (wasPlayingBeforeMenu && !readMode) {
      setPlaying(true);
    }
  });
  // close the desktop dropdown when clicking elsewhere
  document.addEventListener('click', (e) => {
    if (!nav.classList.contains('open') && menu.open && !menu.contains(e.target)) menu.open = false;
  });

  /* ------------------------------------------------------------------ main loop */

  let last = performance.now();
  let idleT = 0;
  let resizeTimer = 0;

  let capturing = false;

  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (capturing) {
      requestAnimationFrame(frame);
      return;
    }
    if (readMode) {
      idleT += dt;
      fieldDim = lerp(fieldDim, isMobile ? 0.28 : 0.42, 0.05);
      drawField(idleT, 'calm');
    } else {
      if (playing && !document.hidden) {
        t += dt * speed;
        if (t >= TOTAL) {
          t = TOTAL;
          playing = false;
          ended = true;
          syncButtons();
        }
        dirty = true;
      }
      if (dirty) renderDom(t);
      const target = isMobile ? frontScene.dimM : 1;
      fieldDim = lerp(fieldDim, target, 0.06);
      drawField(t);
      updateUI();
      dirty = false;
    }
    requestAnimationFrame(frame);
  }

  function start() {
    const qt = parseFloat(params.get('t'));
    if (!isNaN(qt)) t = clamp(qt, 0, TOTAL);
    if (params.has('paused')) playing = false;
    measure();
    if (params.has('read') || reduceMotion) setRead(true);
    syncButtons();
    renderDom(t);
    requestAnimationFrame((n) => {
      last = n;
      frame(n);
    });
  }

  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(measure, 120);
  });
  mqMobile.addEventListener('change', measure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  window.__naxa = {
    seek,
    get t() {
      return t;
    },
    TOTAL,
    scenes,
    setPlaying,
    setRead,
    // Frame-by-frame rendering for recording a video of the film.
    capture(on) {
      capturing = on;
      playing = false;
      syncButtons();
      if (on) ctl.classList.remove('paused'); // the video should show the film as playing
    },
    step(dt) {
      t = clamp(t + dt, 0, TOTAL);
      renderDom(t);
      fieldDim = lerp(fieldDim, isMobile ? frontScene.dimM : 1, 0.06);
      drawField(t);
      updateUI();
    },
  };

  try {
    start();
  } catch (err) {
    // Never leave the content invisible: fall back to the plain page.
    console.error(err);
    doc.classList.add('read');
  }
})();
