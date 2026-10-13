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

  const ZH = (doc.lang || '').toLowerCase().startsWith('zh');
  const UI = ZH
    ? { play: '播放', pause: '暂停', replay: '重新播放', read: '按页面阅读', film: '按短片播放' }
    : { play: 'Play', pause: 'Pause', replay: 'Replay', read: 'Read as page', film: 'Play as film' };

  /* ------------------------------------------------------------------ split headings into words */

  // Wraps every word of an element in its own span, keeping inline tags such as <em>.
  // Latin text splits into words; Chinese into single characters, each keeping the punctuation that follows it.
  const TOKENS = /\s+|[\u2e80-\u2fff\u3040-\u9fff\uf900-\ufaff][\u3000-\u303f\uff00-\uffef]*|[\u3000-\u303f\uff00-\uffef]+|[^\s\u2e80-\u2fff\u3000-\u9fff\uf900-\ufaff\uff00-\uffef]+[\u3000-\u303f\uff00-\uffef]*/g;

  const HAS_CJK = /[\u2e80-\u2fff\u3040-\u9fff\uf900-\ufaff]/;
  const SEG = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('zh', { granularity: 'word' }) : null;

  function splitWords(el, make) {
    let i = 0;
    const walk = (node, into) => {
      Array.from(node.childNodes).forEach((n) => {
        if (n.nodeType === 3 && SEG && HAS_CJK.test(n.textContent)) {
          // Chinese: characters animate one by one, but each word is kept on one line (no breaks inside 销售, 行政 …)
          let group = null;
          for (const { segment, isWordLike } of SEG.segment(n.textContent)) {
            if (/^\s+$/.test(segment)) {
              into.appendChild(document.createTextNode(' '));
              group = null;
              continue;
            }
            if (!isWordLike && group) {
              (segment.match(TOKENS) || [segment]).forEach((part) => group.appendChild(make(part, i++)));
              continue;
            }
            group = document.createElement('span');
            group.className = 'wg';
            into.appendChild(group);
            (segment.match(TOKENS) || [segment]).forEach((part) => group.appendChild(make(part, i++)));
          }
        } else if (n.nodeType === 3) {
          (n.textContent.match(TOKENS) || []).forEach((part) => {
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
    const rate = parseFloat(el.dataset.rate || (ZH ? '0.065' : '0.12'));
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
  const FILM = LAST.end; // the film; the tour of the other pages follows it
  let TOTAL = FILM;

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
  const GLYPHS = ZH ? '数据系统流程智能执行优化整理构建捕捉想法行动客户销售回复跟进营销内容资料方案' : 'abcdefghijklmnopqrstuvwxyz#%&*+=/<>';
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
    scroll0: 0,
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
    return (i, t, o, c = L[key]) => {
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

    calm(i, t, o, c = L.calm) {
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

    cube(i, t, o, c = L.cube, build = fx.cubeBuild, pulse = fx.cubePulse) {
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

  // ---- the tour below the film. Each section opens on a title card with its own particle "hero"; while
  // its text is read the hero steps aside (TC moves and shrinks) and the whole field reacts to the page's
  // movement. TC is set every frame: the hero's centre, its radius, the time since the section's form
  // started, and the page's scroll position (for the parallax dust).
  const TC = { x: 0, y: 0, s: 1, since: 0, sy: 0 };
  const P3 = { x: 0, y: 0, z: 0, k: 1 };
  // rotate a point of the hero (unit coordinates) by yaw and pitch, then project it with perspective
  function proj(o, x, y, z, yaw, pitch) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cx = Math.cos(pitch), sx = Math.sin(pitch);
    const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
    const y1 = y * cx - z1 * sx, z2 = y * sx + z1 * cx;
    const k = 3.4 / (3.4 + z2);
    P3.x = TC.x + x1 * TC.s * k;
    P3.y = TC.y + y1 * TC.s * k;
    P3.z = z2;
    P3.k = k;
    o.x = P3.x;
    o.y = P3.y;
    return P3;
  }
  // nearer particles are brighter
  const near = (z) => 0.5 + 0.5 * clamp((1.1 - z) / 2.2);
  // the angle travelled since a sweep passed angle a
  const behind = (sweep, a) => (((sweep - a) % TAU) + TAU) % TAU;
  // a point walking the outline of a rectangle (u in 0..1)
  const PT = { x: 0, y: 0 };
  function onRect(u, x0, y0, x1, y1) {
    const w = x1 - x0, h = y1 - y0;
    let d = u * 2 * (w + h);
    if (d < w) return (PT.x = x0 + d), (PT.y = y0), PT;
    d -= w;
    if (d < h) return (PT.x = x1), (PT.y = y0 + d), PT;
    d -= h;
    if (d < w) return (PT.x = x1 - d), (PT.y = y1), PT;
    return (PT.x = x0), (PT.y = y1 - (d - w)), PT;
  }
  function onSeg(u, ax, ay, bx, by) {
    PT.x = ax + (bx - ax) * u;
    PT.y = ay + (by - ay) * u;
    return PT;
  }
  // the outcome line of the cases hero, in unit coordinates
  const CASE = spline([
    { x: -0.02, y: 0.12 },
    { x: 0.3, y: 0.06 },
    { x: 0.62, y: -0.18 },
    { x: 0.98, y: -0.62 },
  ]);
  const LH = { x: 0, y: 0, s: 1 };
  const logoAt = logoForm('fin');
  // the paper plane, pointing right: nose, upper wing tip, fold, lower wing tip, keel
  const PLANE = [
    [0.55, 0, -0.5, -0.36],
    [-0.5, -0.36, -0.2, 0.04],
    [-0.2, 0.04, 0.55, 0],
    [0.55, 0, -0.36, 0.34],
    [-0.36, 0.34, -0.2, 0.04],
    [-0.2, 0.04, -0.3, 0.16],
  ];
  const flight = (t) => ({ x: 0.72 * Math.sin(t * 0.42), y: 0.34 * Math.sin(t * 0.84) - 0.05 });

  Object.assign(F, {
    // motes drifting upward at different depths; they move with the page, slower the deeper they are
    dust(i, t, o) {
      const depth = 0.12 + R4[i] * 0.6;
      const span = H * 1.3;
      let y = (R3[i] * span - t * 7 * (0.4 + R5[i]) - TC.sy * depth) % span;
      if (y < 0) y += span;
      o.x = R1[i] * W + Math.sin(t * 0.3 + R2[i] * 9) * 14;
      o.y = y - H * 0.15;
      o.a = 0.1 + 0.4 * depth * R5[i] + 0.06;
      o.s = 0.45 + depth * 0.7;
      o.h = 0;
    },

    // AI solutions: five agents on tilted orbits around one core, data running out to each of them
    orbitH(i, t, o) {
      if (R2[i] > 0.9) return F.dust(i, t, o);
      const yaw = t * 0.16, pitch = -0.5;
      const g = R2[i];
      o.h = 0;
      if (g < 0.24) {
        const a = R1[i] * TAU + t * 0.5, b = Math.acos(R3[i] * 2 - 1);
        const r = 0.23 * (0.8 + 0.2 * Math.sin(t * 2.2 + R4[i] * 9));
        proj(o, r * Math.sin(b) * Math.cos(a), r * Math.cos(b), r * Math.sin(b) * Math.sin(a), yaw, pitch);
        o.a = 0.5 * near(P3.z);
        o.s = 0.95 * P3.k;
        return;
      }
      const k = i % 5;
      const R = 0.62 + k * 0.15;
      const inc = (k - 2) * 0.34, node = k * 1.26;
      const sat = t * (0.62 - k * 0.07) + k * 1.9;
      let ang, rad = R, a, s = 0.8, lift = 0;
      if (g < 0.6) {
        // the orbit, brightest in the satellite's wake
        ang = R1[i] * TAU;
        a = 0.14 + 0.7 * Math.exp(-behind(sat, ang) * 1.5);
      } else if (g < 0.78) {
        ang = sat + (R3[i] - 0.5) * 0.14;
        rad = R + (R4[i] - 0.5) * 0.09;
        lift = (R5[i] - 0.5) * 0.09;
        a = 0.95;
        s = 1.15;
      } else {
        const u = (R1[i] + t * 0.5) % 1;
        ang = sat;
        rad = R * u;
        a = 0.2 + 0.75 * Math.sin(Math.PI * u);
      }
      const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
      const y2 = -z * Math.sin(inc) + lift, z2 = z * Math.cos(inc);
      const cn = Math.cos(node), sn = Math.sin(node);
      proj(o, x * cn + z2 * sn, y2, -x * sn + z2 * cn, yaw, pitch);
      o.a = a * near(P3.z);
      o.s = s * P3.k;
    },

    // Startup: four layers drop into a stack, one after another; a light scans up through them
    layersH(i, t, o) {
      if (R2[i] > 0.9) return F.dust(i, t, o);
      o.h = 0;
      const j = i % 4;
      const build = smooth(0.2 + j * 0.42, 1.1 + j * 0.42, TC.since);
      const gap = 0.3 * (0.92 + 0.08 * Math.sin(t * 0.9));
      const y = (1.5 - j) * gap - (1 - build) * 1.1;
      const u = R1[i] * 2 - 1, line = Math.floor(R3[i] * 10);
      let x, z;
      if (line < 4) {
        const e = line & 1 ? 1 : -1;
        if (line < 2) (x = u), (z = e);
        else (x = e), (z = u);
      } else {
        const q = (((line - 4) % 3) - 1) * 0.5;
        if (line < 7) (x = u), (z = q);
        else (x = q), (z = u);
      }
      const half = 0.66;
      const scan = Math.exp(-Math.pow(((t * 0.45) % 1.5) - 0.15 - j * 0.32, 2) * 40);
      proj(o, x * half, y, z * half, t * 0.22 + 0.7, -0.6);
      o.a = ((line < 4 ? 0.42 : 0.2) + 0.6 * scan) * build * near(P3.z);
      o.s = (0.8 + scan * 0.4) * P3.k;
    },

    // Demo: a lock that opens, then turns into a window with a play button
    lockH(i, t, o) {
      if (R2[i] > 0.9) return F.dust(i, t, o);
      o.h = 0;
      const since = TC.since;
      const g = R1[i];
      // the lock
      let ax, ay;
      if (g < 0.55) {
        onRect(g / 0.55, -0.4, -0.02, 0.4, 0.62);
        (ax = PT.x), (ay = PT.y);
      } else if (g < 0.82) {
        // the shackle: an arch over the body that lifts and swings open
        const v = (g - 0.55) / 0.27;
        const th = Math.PI + v * Math.PI;
        let sx = Math.cos(th) * 0.26, sy = Math.sin(th) * 0.3 - 0.02;
        if (v < 0.06) sy += (0.06 - v) * 2.4;
        const open = easeOut(smooth(2.2, 3.0, since));
        const rot = -open * 0.7;
        const px = 0.26, py = -0.02;
        const dx = sx - px, dy = sy - py;
        sx = px + dx * Math.cos(rot) - dy * Math.sin(rot);
        sy = py + dx * Math.sin(rot) + dy * Math.cos(rot) - open * 0.16;
        (ax = sx), (ay = sy);
      } else {
        const a = R3[i] * TAU;
        ax = Math.cos(a) * 0.07;
        ay = 0.24 + Math.sin(a) * 0.07 + (R4[i] < 0.35 ? R4[i] * 0.4 : 0);
      }
      // the window with its play button
      let bx, by;
      if (g < 0.46) {
        onRect(g / 0.46, -0.78, -0.5, 0.78, 0.5);
        (bx = PT.x), (by = PT.y);
      } else if (g < 0.54) {
        onSeg((g - 0.46) / 0.08, -0.78, -0.32, 0.78, -0.32);
        (bx = PT.x), (by = PT.y);
      } else if (g < 0.6) {
        const k = Math.floor((g - 0.54) / 0.02);
        const a = R3[i] * TAU;
        bx = -0.68 + k * 0.08 + Math.cos(a) * 0.022;
        by = -0.41 + Math.sin(a) * 0.022;
      } else {
        // the play triangle: outline, then a soft fill
        const v = (g - 0.6) / 0.4;
        const A = [-0.14, -0.2], B = [0.24, 0.06], C = [-0.14, 0.32];
        if (v < 0.6) {
          const e = (v / 0.6) * 3, k = Math.floor(e), f = e - k;
          const P = [A, B, C, A];
          onSeg(f, P[k][0], P[k][1], P[k + 1][0], P[k + 1][1]);
          (bx = PT.x), (by = PT.y);
        } else {
          const r1 = Math.sqrt(R3[i]), r2 = R4[i];
          bx = A[0] * (1 - r1) + B[0] * r1 * (1 - r2) + C[0] * r1 * r2;
          by = A[1] * (1 - r1) + B[1] * r1 * (1 - r2) + C[1] * r1 * r2;
        }
      }
      const q = easeInOut(clamp((since - 3.4 - DEL[i] * 0.8) / 1.3));
      const sw = Math.sin(Math.PI * q) * 0.25;
      const x = lerp(ax, bx, q) + Math.cos(ANG[i]) * sw;
      const y = lerp(ay, by, q) + Math.sin(ANG[i]) * sw;
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
      const tri = g >= 0.6 ? q : 0;
      proj(o, x, y, 0, Math.sin(t * 0.5) * 0.28, Math.sin(t * 0.37) * 0.12);
      o.a = (0.5 + 0.3 * pulse * (1 - q) + 0.35 * tri * pulse) * (g >= 0.6 && R2[i] > 0.6 ? 0.7 : 1);
      o.s = 0.9 + tri * 0.25;
      // the lock glows amber while it is shut
      o.h = q < 0.3 && since < 3 && R4[i] < 0.18 ? 1 : 0;
    },

    // Cases: a restless knot of problems funnels through one gate and leaves as a single rising line
    casesH(i, t, o) {
      if (R2[i] > 0.9) return F.dust(i, t, o);
      const g = R2[i];
      let x, y, a, h = 0, s = 0.85;
      if (g < 0.1) {
        // the gate: the AI layer
        const ang = R1[i] * TAU + t * 0.8;
        x = -0.02 + Math.cos(ang) * 0.07;
        y = 0.12 + Math.sin(ang) * 0.36;
        a = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(ang * 2 - t * 3));
      } else if (g < 0.18) {
        // the arrowhead at the end of the line
        const end = along(CASE, 1), pre = along(CASE, 0.94);
        let ux = end.x - pre.x, uy = end.y - pre.y;
        const ul = Math.hypot(ux, uy) || 1;
        (ux /= ul), (uy /= ul);
        const side = R3[i] < 0.5 ? 0.62 : -0.62, v = R4[i] * 0.2;
        x = end.x - (ux * Math.cos(side) - uy * Math.sin(side)) * v;
        y = end.y - (ux * Math.sin(side) + uy * Math.cos(side)) * v;
        a = 0.95;
        s = 1;
      } else {
        const u = (R1[i] + t * 0.075 * (0.8 + R3[i] * 0.4)) % 1;
        if (u < 0.45) {
          const c = u / 0.45;
          const ang = R4[i] * TAU + t * (1.6 + R5[i] * 1.2);
          const r = 0.3 * (0.35 + R3[i]) * (1 - c * 0.45);
          x = -0.74 + Math.cos(ang) * r + c * 0.28;
          y = 0.12 + Math.sin(ang * 1.3) * r * 0.95 + Math.sin(t * 7 + g * 40) * 0.02;
          a = 0.42 * smooth(0, 0.08, u);
          h = R5[i] < 0.32 ? 1 : 0;
        } else if (u < 0.56) {
          const c = (u - 0.45) / 0.11;
          x = lerp(-0.36, -0.02, c);
          y = 0.12 + (R3[i] - 0.5) * 2 * (0.24 * (1 - smooth(0, 1, c)) + 0.012);
          a = 0.5 + 0.4 * c;
        } else {
          const p = along(CASE, (u - 0.56) / 0.44);
          const n = (R3[i] - 0.5) * 0.028;
          x = p.x + p.nx * n;
          y = p.y + p.ny * n;
          a = 0.85 * (1 - smooth(0.97, 1, u)) + 0.1;
        }
      }
      o.x = TC.x + x * TC.s;
      o.y = TC.y + y * TC.s;
      o.a = a;
      o.s = s;
      o.h = h;
    },

    // About: the logo itself, ideas streaming into the mark
    logoH(i, t, o) {
      LH.x = TC.x;
      LH.y = TC.y;
      LH.s = TC.s * 2.1;
      logoAt(i, t, o, LH);
    },

    // Business review: a radar sweeping the business; six opportunities light up as the beam passes them
    radarH(i, t, o) {
      if (R2[i] > 0.9) return F.dust(i, t, o);
      o.h = 0;
      const sweep = t * 1.5;
      const g = R2[i];
      let ang, r, a, s = 0.8;
      if (g < 0.4) {
        const k = i % 3;
        r = 0.38 + k * 0.31;
        ang = R1[i] * TAU;
        a = 0.14 + 0.5 * Math.exp(-behind(sweep, ang) * 2);
      } else if (g < 0.66) {
        const d = Math.pow(R3[i], 2) * 1.4;
        ang = sweep - d;
        r = 0.04 + Math.sqrt(R1[i]) * 0.96;
        a = 0.8 * Math.exp(-d * 2.6);
      } else if (g < 0.8) {
        const k = i % 6;
        const ba = k * 1.047 + 0.5 + (k % 2) * 0.3;
        const br = 0.36 + ((k * 3) % 5) * 0.13;
        ang = ba + (R3[i] - 0.5) * 0.09;
        r = br + (R4[i] - 0.5) * 0.06;
        const hit = Math.exp(-behind(sweep, ba) * 0.8);
        a = 0.18 + 0.82 * hit;
        s = 0.9 + hit * 0.6;
      } else {
        const u = R1[i] * 2 - 1;
        const k = i % 2;
        proj(o, k ? u : 0, 0, k ? 0 : u, t * 0.05, -1.0);
        o.a = 0.12 * near(P3.z);
        o.s = 0.7 * P3.k;
        return;
      }
      proj(o, Math.cos(ang) * r, 0, Math.sin(ang) * r, t * 0.05, -1.0);
      o.a = a * near(P3.z);
      o.s = s * P3.k;
    },

    // Contact: a paper plane looping through the space, leaving a long trail behind it
    planeH(i, t, o) {
      if (R2[i] > 0.9) return F.dust(i, t, o);
      o.h = 0;
      const g = R2[i];
      if (g < 0.56) {
        const lag = 0.06 + Math.pow(R1[i], 1.3) * 4;
        const p = flight(t - lag);
        const spread = 0.01 + lag * 0.035;
        o.x = TC.x + (p.x + (R3[i] - 0.5) * spread) * TC.s;
        o.y = TC.y + (p.y + (R4[i] - 0.5) * spread) * TC.s;
        o.a = 0.85 * Math.exp(-lag * 0.65);
        o.s = 0.75;
        return;
      }
      const p = flight(t), q = flight(t + 0.05);
      const head = Math.atan2(q.y - p.y, q.x - p.x);
      const bank = Math.cos(t * 0.42);
      const e = PLANE[i % PLANE.length];
      const u = R1[i];
      let lx = e[0] + (e[2] - e[0]) * u, ly = (e[1] + (e[3] - e[1]) * u) * (0.55 + 0.45 * Math.abs(bank));
      const sc = 0.62;
      (lx *= sc), (ly *= sc);
      const ch = Math.cos(head), sh = Math.sin(head);
      o.x = TC.x + (p.x + lx * ch - ly * sh) * TC.s;
      o.y = TC.y + (p.y + lx * sh + ly * ch) * TC.s;
      o.a = 0.85;
      o.s = 0.95;
    },
  });

  // ---- icons drawn by particles. Each is a list of strokes in unit coordinates (about -1..1, y down):
  //   ['l', x0, y0, x1, y1, pulse?]  a line (pulse: a phase; the stroke then glows in turn)
  //   ['a', cx, cy, rx, ry, a0, a1, pulse?]  an arc or ellipse
  //   ['f', x0, y0, x1, y1, speed]  a line its particles keep running along (things flowing in)
  //   ['r', cx, cy, len, speed, phase]  a hand turning around a centre
  //   ['p', x, y, pulse?]  a dot
  // Particles flow slowly along the strokes, so an icon is never quite still.
  const ICONS = {};
  function defIcon(name, strokes, spin = 0) {
    const segs = [];
    let total = 0;
    for (const s of strokes) {
      let len;
      if (s[0] === 'l' || s[0] === 'f') len = Math.hypot(s[3] - s[1], s[4] - s[2]);
      else if (s[0] === 'a') len = (Math.abs(s[6] - s[5]) * (s[3] + s[4])) / 2;
      else if (s[0] === 'r') len = s[3];
      else len = 0.3;
      segs.push({ s, a: total, len });
      total += len;
    }
    ICONS[name] = { segs, total, spin };
  }
  const pulseAt = (t, ph) => 0.35 + 0.65 * Math.pow(Math.max(0, Math.sin(t * 2.2 - ph)), 2);
  const poly = (pts, ph) => pts.slice(1).map((p, k) => ['l', pts[k][0], pts[k][1], p[0], p[1], ph]);

  defIcon('chat', [
    ['a', 0, -0.12, 0.92, 0.64, 2.2, 1.78 + TAU],
    ['l', -0.54, 0.4, -0.62, 0.86],
    ['l', -0.62, 0.86, -0.19, 0.51],
    ['p', -0.4, -0.12, 0],
    ['p', 0, -0.12, 0.7],
    ['p', 0.4, -0.12, 1.4],
  ]);
  defIcon('funnel', [
    ['a', 0, -0.62, 0.9, 0.2, 0, TAU],
    ['l', -0.9, -0.62, -0.16, 0.18],
    ['l', 0.9, -0.62, 0.16, 0.18],
    ['l', -0.16, 0.18, -0.16, 0.8],
    ['l', 0.16, 0.18, 0.16, 0.8],
    ['f', -0.5, -1.05, 0, 0.95, 0.5],
    ['f', 0.45, -1.1, 0, 0.95, 0.42],
    ['f', 0, -1.15, 0, 0.95, 0.6],
  ]);
  defIcon('megaphone', [
    ...poly([[-0.75, -0.26], [0.2, -0.68], [0.2, 0.68], [-0.75, 0.26], [-0.75, -0.26]]),
    ['l', -0.55, 0.32, -0.42, 0.78],
    ['a', 0.2, 0, 0.42, 0.42, -0.75, 0.75, 0],
    ['a', 0.2, 0, 0.66, 0.66, -0.7, 0.7, 0.9],
    ['a', 0.2, 0, 0.9, 0.9, -0.65, 0.65, 1.8],
  ]);
  defIcon('magnifier', [
    ['a', -0.2, -0.2, 0.58, 0.58, 0, TAU],
    ['a', -0.2, -0.2, 0.36, 0.36, 3.5, 4.5, 0],
    ['l', 0.22, 0.22, 0.84, 0.84],
    ['l', 0.3, 0.14, 0.92, 0.76],
  ]);
  defIcon('checklist', [
    ...[-0.6, 0, 0.6].flatMap((y, k) => [
      ...poly([[-0.88, y - 0.17], [-0.54, y - 0.17], [-0.54, y + 0.17], [-0.88, y + 0.17], [-0.88, y - 0.17]]),
      ...poly([[-0.82, y], [-0.73, y + 0.1], [-0.5, y - 0.26]], k * 0.9),
      ['l', -0.3, y, 0.88, y],
    ]),
  ]);
  defIcon('document', [
    ...poly([[-0.62, -0.88], [0.3, -0.88], [0.62, -0.56], [0.62, 0.88], [-0.62, 0.88], [-0.62, -0.88]]),
    ...poly([[0.3, -0.88], [0.3, -0.56], [0.62, -0.56]]),
    ...[-0.32, -0.06, 0.2, 0.46].map((y, k) => ['l', -0.4, y, k === 3 ? 0.1 : 0.4, y, k * 0.6]),
  ]);
  defIcon('growth', [
    ['l', -0.86, -0.86, -0.86, 0.76],
    ['l', -0.86, 0.76, 0.92, 0.76],
    ...poly([[-0.72, 0.5], [-0.34, 0.16], [0, 0.32], [0.34, -0.18], [0.78, -0.72]], 0),
    ['l', 0.78, -0.72, 0.48, -0.68],
    ['l', 0.78, -0.72, 0.76, -0.42],
  ]);
  defIcon('target', [
    ['a', 0, 0, 0.9, 0.9, 0, TAU],
    ['a', 0, 0, 0.6, 0.6, 0, TAU, 0.6],
    ['a', 0, 0, 0.3, 0.3, 0, TAU, 1.2],
    ['p', 0, 0, 1.8],
  ]);
  defIcon('shield', [
    ...poly([[-0.72, -0.6], [0, -0.9], [0.72, -0.6], [0.72, 0.06], [0, 0.9], [-0.72, 0.06], [-0.72, -0.6]]),
    ...poly([[-0.32, 0], [-0.08, 0.26], [0.36, -0.26]], 0),
  ]);
  defIcon('envelope', [
    ...poly([[-0.9, -0.58], [0.9, -0.58], [0.9, 0.58], [-0.9, 0.58], [-0.9, -0.58]]),
    ...poly([[-0.9, -0.58], [0, 0.1], [0.9, -0.58]], 0),
  ]);
  defIcon('clock', [
    ['a', 0, 0, 0.88, 0.88, 0, TAU],
    ...[0, 1, 2, 3].map((k) => {
      const a = (k * Math.PI) / 2;
      return ['l', Math.cos(a) * 0.68, Math.sin(a) * 0.68, Math.cos(a) * 0.82, Math.sin(a) * 0.82];
    }),
    ['r', 0, 0, 0.58, 1.6, -1.5],
    ['r', 0, 0, 0.36, 0.13, 0.3],
  ]);
  defIcon('coins', [
    ['a', 0, 0.5, 0.62, 0.2, 0, TAU],
    ['a', 0, 0.18, 0.62, 0.2, 0, TAU, 0.6],
    ['a', 0.12, -0.16, 0.62, 0.2, 0, TAU, 1.2],
    ['l', -0.62, 0.18, -0.62, 0.5],
    ['l', 0.62, 0.18, 0.62, 0.5],
    ['f', 0.12, -1, 0.12, -0.24, 0.45],
  ]);
  defIcon('bulb', [
    ['a', 0, -0.24, 0.58, 0.58, 2.35, 0.79 + TAU],
    ['l', -0.41, 0.17, -0.25, 0.5],
    ['l', 0.41, 0.17, 0.25, 0.5],
    ['l', -0.25, 0.5, 0.25, 0.5],
    ['l', -0.21, 0.65, 0.21, 0.65],
    ['l', -0.13, 0.8, 0.13, 0.8],
    ...poly([[-0.2, 0.16], [-0.1, -0.12], [0, 0.16], [0.1, -0.12], [0.2, 0.16]], 0),
    ...[-2.4, -1.57, -0.74].map((a) => ['l', Math.cos(a) * 0.74, -0.24 + Math.sin(a) * 0.74, Math.cos(a) * 0.95, -0.24 + Math.sin(a) * 0.95, 1]),
  ]);
  defIcon('route', [
    ['f', -0.86, 0.62, -0.4, 0.16, 0.5],
    ['f', -0.4, 0.16, 0.04, 0.46, 0.5],
    ['f', 0.04, 0.46, 0.4, -0.1, 0.5],
    ['f', 0.4, -0.1, 0.82, -0.56, 0.5],
    ['a', -0.86, 0.62, 0.09, 0.09, 0, TAU, 0],
    ['a', -0.4, 0.16, 0.09, 0.09, 0, TAU, 0.7],
    ['a', 0.04, 0.46, 0.09, 0.09, 0, TAU, 1.4],
    ['a', 0.4, -0.1, 0.09, 0.09, 0, TAU, 2.1],
    ...poly([[0.82, -0.56], [0.82, -1], [1.12, -0.88], [0.82, -0.76]], 2.8),
  ]);
  defIcon(
    'gear',
    [
      ['a', 0, 0, 0.66, 0.66, 0, TAU],
      ['a', 0, 0, 0.24, 0.24, 0, TAU],
      ...[0, 1, 2, 3, 4, 5, 6, 7].flatMap((k) => {
        const a = (k * Math.PI) / 4;
        const c = Math.cos(a), s = Math.sin(a), px = -s * 0.13, py = c * 0.13;
        return [
          ['l', c * 0.66 + px, s * 0.66 + py, c * 0.92 + px, s * 0.92 + py],
          ['l', c * 0.66 - px, s * 0.66 - py, c * 0.92 - px, s * 0.92 - py],
          ['l', c * 0.92 + px, s * 0.92 + py, c * 0.92 - px, s * 0.92 - py],
        ];
      }),
    ],
    0.5
  );
  defIcon('layers', [
    ...[-0.46, 0, 0.46].flatMap((y, k) => poly([[-0.82, y], [0, y - 0.32], [0.82, y], [0, y + 0.32], [-0.82, y]], k * 0.8)),
  ]);
  defIcon('window', [
    ...poly([[-0.92, -0.66], [0.92, -0.66], [0.92, 0.66], [-0.92, 0.66], [-0.92, -0.66]]),
    ['l', -0.92, -0.42, 0.92, -0.42],
    ['p', -0.8, -0.54],
    ['p', -0.66, -0.54],
    ['p', -0.52, -0.54],
    ...poly([[-0.2, -0.22], [0.34, 0.06], [-0.2, 0.34], [-0.2, -0.22]], 0),
  ]);

  // where particle i sits on an icon at time t (unit coordinates); also how bright, and whether amber
  function iconPoint(name, i, t, out) {
    out.a = 1;
    out.h = 0;
    if (name === 'storm') {
      // a problem: a restless knot, a third of it amber
      const ang = R1[i] * TAU + t * (1.4 + R5[i] * 1.6);
      const r = 0.95 * Math.sqrt(R3[i]);
      out.x = Math.cos(ang) * r + Math.sin(t * 7 + R2[i] * 40) * 0.05;
      out.y = Math.sin(ang * 1.2) * r * 0.8 + Math.cos(t * 6 + R4[i] * 40) * 0.05;
      out.a = 0.75;
      out.h = R4[i] < 0.35 ? 1 : 0;
      return out;
    }
    if (name === 'logo') {
      const p = LOGO[i] || LOGO[i % LOGO.length];
      out.x = (p[0] / 1000) * 2.2;
      out.y = (p[1] / 1000) * 2.2;
      return out;
    }
    const ic = ICONS[name] || ICONS.target;
    const u = (R1[i] + t * 0.018) % 1;
    const d = u * ic.total;
    let g = ic.segs[ic.segs.length - 1];
    for (const x of ic.segs) {
      if (d < x.a + x.len) {
        g = x;
        break;
      }
    }
    let k = clamp((d - g.a) / (g.len || 1));
    const s = g.s;
    let x, y, ph;
    if (s[0] === 'l') {
      x = s[1] + (s[3] - s[1]) * k;
      y = s[2] + (s[4] - s[2]) * k;
      ph = s[5];
    } else if (s[0] === 'f') {
      k = (k + t * s[5]) % 1;
      x = s[1] + (s[3] - s[1]) * k;
      y = s[2] + (s[4] - s[2]) * k;
      out.a = Math.sin(Math.PI * k);
    } else if (s[0] === 'a') {
      const a = s[5] + (s[6] - s[5]) * k;
      x = s[1] + Math.cos(a) * s[3];
      y = s[2] + Math.sin(a) * s[4];
      ph = s[7];
    } else if (s[0] === 'r') {
      const a = s[5] + t * s[4];
      x = s[1] + Math.cos(a) * s[3] * k;
      y = s[2] + Math.sin(a) * s[3] * k;
    } else {
      const a = k * TAU * 3;
      x = s[1] + Math.cos(a) * 0.07 * k;
      y = s[2] + Math.sin(a) * 0.07 * k;
      ph = s[3];
    }
    if (ph != null) out.a = pulseAt(t, ph);
    if (ic.spin) {
      const a = t * ic.spin, c = Math.cos(a), sn = Math.sin(a);
      const x1 = x * c - y * sn;
      y = x * sn + y * c;
      x = x1;
    }
    out.x = x + (R3[i] - 0.5) * 0.04;
    out.y = y + (R4[i] - 0.5) * 0.04;
    return out;
  }

  // The swarm: while the autopilot reads a section, about 40% of the particles leave the hero, fly to the
  // spot where the next piece of text is about to appear, draw an icon of what it is about, burst into
  // the text as it appears, and settle as a glowing underline beneath it, until the next piece is due.
  const SWARM = { on: false, d: 0, icon: 'target', c: null, p: null };
  const SWARM_FRAC = 0.42;
  const IP = { x: 0, y: 0, a: 1, h: 0 };
  const SP = { x: 0, y: 0, a: 0, s: 1, h: 0 };
  function swarmPos(i, t, fx, fy, fa) {
    const c = SWARM.c, pv = SWARM.p;
    const d = SWARM.d - DEL[i] * 0.25;
    // it sets off from the underline of the previous piece, or from its place in the hero
    let ox, oy, oa;
    if (pv) {
      ox = pv.l + R1[i] * pv.w;
      oy = pv.t + pv.h + 7 + (R3[i] - 0.5) * 4;
      oa = 0.28;
    } else {
      ox = fx;
      oy = fy;
      oa = fa;
    }
    iconPoint(SWARM.icon, i, t, IP);
    const ix = c.x + IP.x * c.s, iy = c.y + IP.y * c.s, ia = 0.95 * IP.a;
    const bx = c.l + R1[i] * c.w, by = c.t + R3[i] * c.h;
    const uy = c.t + c.h + 7 + (R3[i] - 0.5) * 4;
    SP.s = 0.85;
    SP.h = 0;
    if (d < -0.8) {
      SP.x = ox;
      SP.y = oy;
      SP.a = oa;
    } else if (d < -0.2) {
      const e = easeInOut((d + 0.8) / 0.6);
      const sw = Math.sin(Math.PI * e) * SW[i] * 0.9;
      SP.x = lerp(ox, ix, e) + Math.cos(ANG[i]) * sw;
      SP.y = lerp(oy, iy, e) + Math.sin(ANG[i]) * sw;
      SP.a = lerp(oa, ia, e);
      SP.h = e > 0.5 ? IP.h : 0;
    } else if (d < 0.25) {
      SP.x = ix;
      SP.y = iy;
      SP.a = ia;
      SP.s = 0.95;
      SP.h = IP.h;
    } else if (d < 0.75) {
      const e = easeOut((d - 0.25) / 0.5);
      SP.x = lerp(ix, bx, e);
      SP.y = lerp(iy, by, e);
      SP.a = lerp(ia, 0.5, e);
      SP.h = e < 0.4 ? IP.h : 0;
    } else if (d < 1.4) {
      const e = easeInOut((d - 0.75) / 0.65);
      SP.x = bx;
      SP.y = lerp(by, uy, e);
      SP.a = lerp(0.5, 0.3, e);
    } else {
      SP.x = bx + Math.sin(t * 0.8 + R2[i] * 9) * 1.5;
      SP.y = uy;
      SP.a = 0.2 + 0.14 * Math.sin(t * 2 + R4[i] * 20);
    }
    return SP;
  }

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

  function drawField(t, override, oy = 0, blend = null) {
    let fc, fp = null, since = 99;
    if (override) {
      fc = F[override];
    } else {
      const k = formIndex(t);
      fc = F[forms[k].name];
      if (k > 0) fp = F[forms[k - 1].name];
      since = t - forms[k].t;
    }
    // coming back up from the tour: morph from the tour's formation into the film's
    if (blend && blend.since < TDUR + MAXDEL) {
      fp = F[blend.from];
      since = blend.since;
    }
    renderField(fc, fp, since, t, override ? 1 : smooth(0.3, 2.5, t), oy);
  }

  // How the field moves with the page (the tour only): stars at different depths scroll with it and stretch
  // into streaks when it moves fast, particles are dragged along a little and spring back, and trails
  // grow longer while things are moving.
  const MOT = { on: false, sy: 0, vel: 0, fade: 0.4 };

  function renderField(fc, fp, since, t, starIn, oy) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = 1;
    ctx.fillStyle = `rgba(0,0,0,${MOT.on ? MOT.fade : 0.4})`;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';

    const trans = fp && since < TDUR + MAXDEL;
    prepare();
    const base = isMobile ? 2.6 : 3.1;

    const vel = MOT.on ? MOT.vel : 0;
    const swarm = MOT.on && SWARM.on;
    for (let i = 0; i < N; i++) {
      let x, y, a, s, h;
      let dim = fieldDim;
      if (STAR[i]) {
        x = R1[i] * W;
        y = R2[i] * H;
        a = (0.12 + 0.28 * (0.5 + 0.5 * Math.sin(t * (0.4 + R3[i] * 1.4) + R4[i] * TAU))) * starIn;
        s = 0.55;
        h = 0;
        if (MOT.on) {
          const depth = 0.08 + R3[i] * 0.42;
          y = (((R2[i] * H * 1.2 - MOT.sy * depth) % (H * 1.2)) + H * 1.2) % (H * 1.2) - H * 0.1;
          const len = Math.min(140, Math.abs(vel) * depth * 0.07);
          if (len > 2) {
            const r = 1.6 * s * SZ[i];
            ctx.globalAlpha = Math.min(1, a * fieldDim * 1.6);
            ctx.drawImage(SPR[1], x - r, y - r - (vel > 0 ? 0 : len), r * 2, r * 2 + len);
            continue;
          }
        }
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
        y += oy;
        if (swarm && R5[i] < SWARM_FRAC) {
          swarmPos(i, t, x, y, a * fieldDim);
          x = SP.x;
          y = SP.y;
          a = SP.a;
          s = SP.s;
          h = SP.h;
          dim = 1;
        } else if (vel) {
          // dragged along by the page, then springing back
          y -= Math.max(-120, Math.min(120, vel * (0.025 + R4[i] * 0.06)));
        }
      }
      if (a < 0.01 || x < -30 || y < -30 || x > W + 30 || y > H + 30) continue;
      const r = base * s * SZ[i];
      ctx.globalAlpha = a * dim > 1 ? 1 : a * dim;
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

    // the tour's hero spots: on the title card (right of the text, or above it on phones) and aside while reading
    L.scroll0 = window.scrollY;
    const mid = L.hdr + (H - L.hdr - L.ctl) / 2;
    L.heroAt = isMobile
      ? { x: W * 0.5, y: L.hdr + (H - L.hdr - L.ctl) * 0.27, s: Math.min(W * 0.36, H * 0.17) }
      : { x: W * 0.74, y: mid, s: Math.min(W * 0.17, H * 0.3) };
    L.asideAt = isMobile
      ? { x: W * 0.8, y: L.hdr + H * 0.16, s: L.heroAt.s * 0.62 }
      : { x: W * 0.95, y: mid, s: L.heroAt.s * 0.56 };
    if (!TC.ready) {
      Object.assign(TC, L.heroAt);
      TC.ready = true;
    }
    measureTour();

    doc.classList.remove('measuring');
    // the read-mode backdrop: a slow ring on the right
    if (readMode) L.calm = { x: W * (isMobile ? 0.7 : 0.78), y: H * 0.42, r: Math.min(W, H) * 0.26 };
    dirty = true;
  }

  /* ------------------------------------------------------------------ the tour: the other pages, below the film */

  // Elements in the tour appear when they scroll into view (time-based, so a paused page still finishes
  // its entrances); headings rise word by word and paragraphs light up at reading pace.
  const tourEl = $('#tour');
  const tsecs = tourEl
    ? $$('[data-tour]', tourEl).map((el) => ({ el, id: el.id, label: el.dataset.label, form: el.dataset.form || 'dust', start: 0, end: 0 }))
    : [];
  const tcues = [];
  let readbar = null;
  if (tourEl) {
    // every title card gets its chapter number, huge and outlined, drifting behind the title
    tsecs.forEach((sec) => {
      const th = $('.thead', sec.el);
      const n = th && $('[data-n]', th);
      sec.th = th;
      if (!n) return;
      const big = document.createElement('span');
      big.className = 't-bignum m';
      big.setAttribute('aria-hidden', 'true');
      big.dataset.r = '0';
      big.dataset.dur = '1.6';
      big.textContent = n.dataset.n;
      th.prepend(big);
      sec.big = big;
    });
    $$('[data-rs]', tourEl).forEach((el) => {
      splitWords(el, (w, i) => {
        const s = word('m m-word', w, i * (ZH ? 0.04 : 0.06), '0.9');
        s.style.setProperty('--wd', (i * 0.11).toFixed(2)); // the sheen travels along the line
        return s;
      });
      $$('.m-word', el).forEach((w) => tcues.push({ el: w, trig: el, delay: parseFloat(w.dataset.at), rel: parseFloat(w.dataset.at), dur: 0.9 }));
    });
    $$('[data-rr]', tourEl).forEach((el) => {
      const base = num(el.dataset.r, 0) + 0.35;
      const rate = ZH ? 0.055 : 0.1;
      splitWords(el, (w, i) => word('rw', w, base + i * rate, '0.7'));
      const r0 = num(el.dataset.r, 0);
      $$('.rw', el).forEach((w) => tcues.push({ el: w, trig: el, delay: parseFloat(w.dataset.at), rel: parseFloat(w.dataset.at) - r0, dur: 0.7, lin: true }));
    });
    // the reading bar: sits beside the block being read and fills up while the page waits on it
    readbar = document.createElement('div');
    readbar.className = 'readbar';
    readbar.setAttribute('aria-hidden', 'true');
    readbar.innerHTML = '<i></i>';
    document.body.appendChild(readbar);
    $$('[data-r]', tourEl).forEach((el) => tcues.push({ el, trig: el, delay: num(el.dataset.r, 0), rel: 0, dur: num(el.dataset.dur, 0.9) }));
    tcues.forEach((c) => {
      c.top = 0;
      c.go = null;
      c.p = -1;
    });
  }

  // Items: the pieces of text the autopilot reveals one after another (a heading, a paragraph, a card…).
  // Each gets a moment on the timeline (beatT) and an icon for the particles to draw (data-icon).
  const items = [];
  if (tourEl) {
    const byEl = new Map();
    tcues.forEach((c) => {
      if (c.el.classList.contains('t-bignum')) return;
      let it = byEl.get(c.trig);
      if (!it) {
        it = { el: c.trig, beatT: null };
        byEl.set(c.trig, it);
        items.push(it);
      }
      c.item = it;
    });
    items.sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    items.forEach((it) => {
      const host = it.el.closest('[data-icon]');
      it.icon = host ? host.dataset.icon : 'target';
      it.sec = tsecs.find((x) => x.el.contains(it.el));
      it.card = !!it.el.closest('.thead');
      const e = it.el;
      it.kind = e.matches('[data-rs]') ? 'head' : e.matches('.eyebrow, .btns, .layers-title, .practice-title') ? 'small' : e.querySelector('form') ? 'form' : 'text';
    });
  }

  // Autopilot: after the film the page glides from stop to stop ([data-stop] blocks) and lingers on each
  // as long as its text takes to read. Its whole path is a function of time, so it sits on the same
  // timeline (and progress bar) as the film.
  let tour = { steps: [], total: 0 };
  let deliveries = []; // the items the particle swarm delivers, in order

  function stepAt(tau) {
    let st = null;
    for (const x of tour.steps) {
      if (tau >= x.start) st = x;
      else break;
    }
    return st;
  }

  const docTop = (el) => el.getBoundingClientRect().top + window.scrollY;

  function measureTour() {
    if (!tourEl) return;
    const sy = window.scrollY;
    tcues.forEach((c) => (c.top = c.trig.getBoundingClientRect().top + sy));
    const pad = isMobile ? 14 : Math.round(H * 0.08);
    const avail = Math.max(200, H - L.hdr - L.ctl - pad - 16);
    const maxY = Math.max(0, doc.scrollHeight - H);
    const raw = [];
    $$('[data-stop]', tourEl).forEach((el) => {
      const r = el.getBoundingClientRect();
      const top = r.top + sy;
      const sec = tsecs.find((x) => x.el.contains(el)) || tsecs[tsecs.length - 1];
      const text = el.textContent.replace(/\s+/g, ' ').trim();
      const read = ZH ? text.replace(/\s/g, '').length / 11 : text.split(' ').length / 5.6;
      let dwell = el.dataset.dwell ? parseFloat(el.dataset.dwell) : clamp(read + 0.7, 2.2, 10);
      if (el.classList.contains('thead')) dwell = Math.max(dwell, 4.6); // time to watch the title card
      const y0 = top - L.hdr - pad;
      // a block taller than the screen is panned through in pieces
      const pieces = r.height > avail ? Math.ceil((r.height - avail) / (avail * 0.7)) + 1 : 1;
      for (let k = 0; k < pieces; k++) {
        const y = pieces === 1 ? y0 : y0 + ((r.height - avail) * k) / (pieces - 1);
        raw.push({ y: clamp(Math.round(y), 0, maxY), dwell: dwell / pieces, sec, els: [el], whole: pieces === 1, bottom: top + r.height });
      }
    });
    // Like a teleprompter: the page only moves on when the next block is not already on screen.
    // Blocks that fit below the current one are read in place; a new section always gets its own move.
    const steps = [];
    raw.forEach((st) => {
      const prev = steps[steps.length - 1];
      const onScreen = prev && st.whole && st.sec === prev.sec && st.bottom <= prev.y + L.hdr + pad + avail;
      if (prev && (onScreen || Math.abs(st.y - prev.y) < 40)) {
        prev.dwell += st.dwell;
        prev.els.push(...st.els);
      } else steps.push(st);
    });
    // where the reading bar goes for each step: beside its blocks, within what the screen shows
    steps.forEach((st) => {
      let top = Infinity, bot = -Infinity, left = Infinity;
      st.els.forEach((el) => {
        const r = el.getBoundingClientRect();
        top = Math.min(top, r.top + sy);
        bot = Math.max(bot, r.bottom + sy);
        left = Math.min(left, r.left);
      });
      st.bt = Math.max(top, st.y + L.hdr + pad * 0.5);
      st.bb = Math.min(bot, st.y + H - L.ctl - 10);
      st.bl = left;
    });
    // each item belongs to the first stop of its section that shows all of it; a stop lasts as long as
    // its items take to appear and be read, one after another
    items.forEach((it) => {
      const r = it.el.getBoundingClientRect();
      it.l = r.left;
      it.t = r.top + sy;
      it.w = r.width;
      it.h = r.height;
      const txt = (it.el.innerText || '').trim();
      const n = ZH ? txt.replace(/\s/g, '').length : txt.split(/\s+/).filter(Boolean).length;
      const rate = ZH ? 10 : 5;
      it.time =
        it.kind === 'small' ? 0.6 : it.kind === 'form' ? 3.2 : it.kind === 'head' ? 0.8 + n * (ZH ? 0.04 : 0.06) + n / (rate * 1.6) : 1 + n / rate;
      it.beatT = null;
    });
    steps.forEach((st) => (st.items = []));
    items.forEach((it) => {
      const own = steps.filter((x) => x.sec === it.sec);
      const st =
        own.find((x) => it.t + it.h <= x.y + H - L.ctl - 6) || own.find((x) => it.t >= x.y + L.hdr) || own[own.length - 1];
      if (st) st.items.push(it);
    });
    steps.forEach((st) => {
      if (!st.items.length) return;
      const sum = st.items.reduce((a, it) => a + it.time, 0) + 0.6;
      st.card = st.items.some((it) => it.card);
      st.dwell = Math.max(sum, st.card ? 4.6 : 2);
    });
    let tt = 0;
    let prevY = 0;
    steps.forEach((st, i) => {
      const d = Math.abs(st.y - prevY);
      st.y0 = prevY;
      st.move = i === 0 ? 2.4 : clamp(0.55 + (d / H) * 0.5, 0.7, 1.5);
      st.start = tt;
      tt += st.move + st.dwell;
      prevY = st.y;
    });
    tour = { steps, total: tt };
    steps.forEach((st) => {
      // a title card fills in as it arrives; elsewhere the page settles first, so the particles can draw
      let b = st.start + st.move * (st.card ? 0.7 : 1) + (st.card ? 0 : 0.25);
      st.items.forEach((it) => {
        it.beatT = b;
        b += it.time;
      });
    });
    deliveries = items.filter((it) => it.beatT != null && !it.card && it.kind !== 'small').sort((a, b) => a.beatT - b.beatT);
    tsecs.forEach((sec) => {
      sec.top = sec.el.getBoundingClientRect().top + sy;
      sec.thTop = sec.th ? sec.th.getBoundingClientRect().top + sy : sec.top;
      sec.thH = sec.th ? sec.th.offsetHeight : H;
      sec.cardY = sec.thTop - L.hdr - pad;
      const own = steps.filter((x) => x.sec === sec);
      sec.start = own.length ? own[0].start : tt;
      const lastStep = own[own.length - 1];
      sec.end = lastStep ? lastStep.start + lastStep.move + lastStep.dwell : sec.start;
    });
    TOTAL = FILM + tt;
    buildRail();
  }

  function tourY(tau) {
    const steps = tour.steps;
    if (!steps.length) return 0;
    for (const st of steps) {
      if (tau < st.start + st.move) return lerp(st.y0, st.y, easeInOut(clamp((tau - st.start) / st.move)));
      if (tau < st.start + st.move + st.dwell) return st.y;
    }
    return steps[steps.length - 1].y;
  }

  // The moment on the timeline that matches a scroll position: the first stop at or below it,
  // so carrying on from there always moves the page forward, never back up.
  function tauAt(y) {
    const steps = tour.steps;
    if (!steps.length) return 0;
    const st = steps.find((x) => x.y >= y - 4) || steps[steps.length - 1];
    return st.start + st.move;
  }

  // While the autopilot runs, each item appears at its moment on the timeline (one after another);
  // a reader scrolling on their own sees things appear as they come into view.
  function renderTour(now, sy) {
    const beats = (playing || capturing) && !readMode;
    const tau = t - FILM;
    for (const c of tcues) {
      const top = c.top - sy;
      let k;
      if (beats && c.item && c.item.beatT != null) {
        k = clamp((tau - c.item.beatT - c.rel) / c.dur);
        c.go = k > 0 ? now - k * c.dur : null;
      } else {
        if (c.go == null) {
          if (top < H * 0.9) c.go = now + c.delay;
        } else if (top > H * 1.05) {
          c.go = null; // left through the bottom: play again next time
        }
        k = c.go == null ? 0 : clamp((now - c.go) / c.dur);
      }
      const p = c.lin ? k : easeOut(k);
      if (p !== c.p) {
        c.p = p;
        c.el.style.setProperty('--p', p.toFixed(4));
      }
    }
  }

  // which tour section is under the middle of the screen
  function sectionAt(sy) {
    const mid = sy + H * 0.45;
    let cur = tsecs[0];
    for (const sec of tsecs) if (sec.top <= mid) cur = sec;
    return cur;
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
  let tclock = 0; // always-running clock for tour entrances and tour particles
  let expectedY = 0; // where the autopilot last put the page
  let glide = null; // a short smooth scroll (resume, chapter jump)
  let savedFilmT = null; // film position to come back to after scrolling down mid-film
  let tf = { cur: 'logoFin', prev: null, t0: -99 }; // tour particle formation
  let filmBlend = null;
  let fieldMode = 'film';
  // Reading at your own pace pauses the film; it carries on by itself once the page has been still for a while.
  const IDLE = 7;
  let resumeAt = null;

  const ctl = $('#ctl');
  const playBtn = $('#play');
  const rail = $('#rail');
  const railTip = $('#railTip');
  const chapEl = $('#chap');
  const timeEl = $('#time');
  const speedBtn = $('#speed');
  const readBtn = $('#read');
  const flash = $('#flash');

  // chapters on the progress bar: the film's scenes, then the tour's sections
  let chapters = [];
  let segs = [];
  function buildRail() {
    chapters = scenes
      .map((s) => ({ start: s.start, end: s.end, label: s.label }))
      .concat(tsecs.map((sec) => ({ start: FILM + sec.start, end: FILM + sec.end, label: sec.label, sec })));
    segs.forEach((seg) => seg.remove());
    segs = chapters.map((c) => {
      const seg = document.createElement('span');
      seg.className = 'seg' + (c.sec ? ' tour-seg' : '');
      seg.style.setProperty('--d', Math.max(1, c.end - c.start).toFixed(2));
      seg.appendChild(document.createElement('b'));
      rail.insertBefore(seg, railTip);
      return seg;
    });
  }
  buildRail();

  const fmt = (v) => {
    v = Math.max(0, Math.round(v));
    return Math.floor(v / 60) + ':' + String(v % 60).padStart(2, '0');
  };

  function setPlaying(v) {
    playing = v;
    resumeAt = null;
    if (v && ended) {
      ended = false;
      seek(0, true);
    } else if (v) {
      startGlide(); // ease from wherever the reader left the page back onto the path
    }
    syncButtons();
  }

  function syncButtons() {
    ctl.classList.toggle('paused', !playing && !ended);
    ctl.classList.toggle('resuming', resumeAt != null && !playing);
    ctl.classList.toggle('ended', ended);
    playBtn.setAttribute('aria-label', ended ? UI.replay : playing ? UI.pause : UI.play);
  }

  // where the page should be at timeline position t
  const targetY = (tt) => (tt < FILM ? 0 : tourY(tt - FILM));

  function startGlide(dur = 0.9) {
    if (readMode) return;
    const from = window.scrollY;
    if (Math.abs(from - targetY(t)) < 2) return;
    glide = { from, t0: tclock, dur };
  }

  function setScroll(y) {
    y = Math.round(y);
    expectedY = y;
    if (Math.abs(window.scrollY - y) >= 1) window.scrollTo(0, y);
  }

  function seek(nt, instant = false) {
    t = clamp(nt, 0, TOTAL);
    if (t < TOTAL) ended = false;
    if (t < FILM) {
      ctx.clearRect(0, 0, W, H);
      savedFilmT = null;
    }
    dirty = true;
    if (instant) {
      glide = null;
      setScroll(targetY(t));
    } else startGlide();
    syncButtons();
  }

  function currentIndex() {
    let k = 0;
    chapters.forEach((c, i) => {
      if (t >= c.start - 0.001) k = i;
    });
    return k;
  }

  function go(dir) {
    const k = currentIndex();
    let target;
    if (dir < 0) target = t - chapters[k].start > 1.6 || k === 0 ? k : k - 1;
    else target = Math.min(chapters.length - 1, k + 1);
    if (dir > 0 && k === chapters.length - 1) return;
    seek(chapters[target].start + (target === 0 ? 0 : 0.01));
    if (!playing && !ended) setPlaying(true);
  }

  // jump to an element of the tour (menu links, buttons) and stay there for a while
  function jumpTo(el, auto = playing || resumeAt != null) {
    const y = docTop(el) - L.hdr - (isMobile ? 14 : Math.round(H * 0.08));
    playing = false;
    seek(FILM + tauAt(y));
    glide = { from: window.scrollY, t0: tclock, dur: 1.1, to: clamp(y, 0, doc.scrollHeight - H) };
    resumeAt = auto ? tclock + 1.1 + IDLE : null;
    syncButtons();
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

  function currentLabel() {
    const sy = window.scrollY;
    if (t < FILM && sy < H * 0.5) return frontScene.label;
    if (sy >= H * 0.5 && tsecs.length && !readMode) return sectionAt(sy).label; // whatever is on screen
    const k = currentIndex();
    return chapters[k] ? chapters[k].label : frontScene.label;
  }

  function updateUI() {
    chapters.forEach((c, i) => {
      const f = clamp((t - c.start) / Math.max(0.001, c.end - c.start));
      if (segs[i] && segs[i]._f !== f) {
        segs[i]._f = f;
        segs[i].style.setProperty('--f', f.toFixed(4));
      }
    });
    if (resumeAt != null && !playing) ctl.style.setProperty('--rk', clamp(1 - (resumeAt - tclock) / IDLE).toFixed(3));
    const label = currentLabel();
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
        return { t: chapters[i].start + f * (chapters[i].end - chapters[i].start), i };
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
    railTip.textContent = chapters[hit.i].label;
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
    readBtn.textContent = v ? UI.film : UI.read;
    glide = null;
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
      measure();
      seek(t >= TOTAL ? 0 : t, true);
      setPlaying(true);
    }
    measure();
  }
  readBtn.addEventListener('click', () => setRead(!readMode));

  // click / tap on the film toggles play
  $('#stage').addEventListener('click', (e) => {
    if (readMode || e.target.closest('a, button, summary, input, .ctl')) return;
    toggle();
  });

  const typing = (el) => el && el.closest && el.closest('input, textarea, select, [contenteditable="true"]');
  const modalOpen = () => !!$('.demo-modal.is-open');

  // keyboard
  addEventListener('keydown', (e) => {
    if (readMode || menuOpen || modalOpen() || typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (e.key === ' ' || e.key === 'k') {
      if (tag === 'button' || tag === 'a' || tag === 'summary') return;
      e.preventDefault();
      toggle();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      go(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      go(-1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      seek(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      seek(TOTAL);
    }
  });

  // The reader scrolled the page themselves: stop the autopilot and follow them on the timeline.
  function userScrolled() {
    const y = window.scrollY;
    const auto = playing || resumeAt != null;
    glide = null;
    if (playing) {
      playing = false;
      syncButtons();
    }
    if (y > H * 0.35 && tour.steps.length) {
      if (t < FILM) savedFilmT = t;
      t = FILM + tauAt(y);
    } else if (t >= FILM) {
      t = savedFilmT != null ? savedFilmT : LAST.start + 2;
      savedFilmT = null;
    }
    ended = false;
    resumeAt = auto ? tclock + IDLE : null;
    dirty = true;
    syncButtons();
  }
  addEventListener(
    'scroll',
    () => {
      if (readMode || capturing) return;
      const y = window.scrollY;
      if (Math.abs(y - expectedY) <= 3) return; // our own scrolling
      expectedY = y;
      userScrolled();
    },
    { passive: true }
  );
  // a wheel or a finger on the page always wins over the autopilot
  const grab = (e) => {
    if (readMode || (e.target.closest && e.target.closest('.ctl, .nav, .demo-modal'))) return;
    if (playing || glide) {
      if (playing) resumeAt = tclock + IDLE;
      glide = null;
      playing = false;
      syncButtons();
    }
  };
  addEventListener('wheel', grab, { passive: true });
  addEventListener('touchmove', grab, { passive: true });

  // filling in a form pauses everything
  document.addEventListener('focusin', (e) => {
    if (typing(e.target) && (playing || resumeAt != null)) setPlaying(false);
  });

  // Links to pages that now live on this page scroll to them instead of leaving.
  const PAGE_IDS = {
    'ai-agents': 'ai-solutions',
    'base-ai-agent': 'startup',
    'demo-center': 'demo',
    cases: 'cases',
    about: 'about',
    'business-review': 'business-review',
    contact: 'contact',
  };
  const SELF = ZH ? 'zh' : 'index';
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || a.target === '_blank') return;
    const m = (a.getAttribute('href') || '').match(/^(zh-)?([a-z-]+)\.html(?:#([\w-]+))?$/);
    if (!m) return;
    const isZh = !!m[1] || m[2] === 'zh';
    if (isZh !== ZH) return; // the other language: really navigate
    let target = null;
    if (m[2] === SELF && !m[3]) {
      e.preventDefault();
      closeMenu();
      seek(0);
      setPlaying(true);
      return;
    }
    if (m[3]) target = document.getElementById(m[3]);
    if (!target && PAGE_IDS[m[2]]) target = document.getElementById(PAGE_IDS[m[2]]);
    if (!target) return;
    e.preventDefault();
    const auto = playing || resumeAt != null || (menuOpen && wasPlayingBeforeMenu);
    closeMenu();
    jumpTo(target, auto);
  });

  // demo buttons open the unlock form: the autopilot waits
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-demo-agent]') && (playing || resumeAt != null)) setPlaying(false);
  });

  // mobile menu
  const nav = $('#nav');
  const navToggle = $('#navToggle');
  const menu = $('.menu', nav);
  function closeMenu() {
    if (menu.open && !nav.classList.contains('open')) menu.open = false;
    if (!nav.classList.contains('open')) return;
    menuOpen = false;
    nav.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
  }
  navToggle.addEventListener('click', () => {
    menuOpen = !nav.classList.contains('open');
    nav.classList.toggle('open', menuOpen);
    navToggle.setAttribute('aria-expanded', String(menuOpen));
    if (menuOpen) {
      menu.open = true;
      wasPlayingBeforeMenu = playing || resumeAt != null;
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
  let resizeTimer = 0;
  let capturing = false;

  function advance(dt) {
    tclock += dt;
    if (resumeAt != null && !playing) {
      if (menuOpen || modalOpen() || typing(document.activeElement)) resumeAt = null;
      else if (tclock >= resumeAt) setPlaying(true);
    }
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
    // the page follows the timeline while playing (and during a glide)
    if (playing || glide) {
      let y = glide && glide.to != null ? glide.to : targetY(t);
      if (glide) {
        const k = clamp((tclock - glide.t0) / glide.dur);
        y = lerp(glide.from, y, easeInOut(k));
        if (k >= 1) glide = null;
      }
      setScroll(y);
    }
  }

  // the field below the film: the current section's hero, centre stage on its title card, stepped aside
  // (smaller, dimmer, at the edge) while the reader is in the section's text
  function heroField(sec, sy) {
    const k = sec ? smooth(H * 0.04, H * 0.55, sy - sec.cardY) : 1;
    const a = L.heroAt, b = L.asideAt;
    TC.x = lerp(TC.x, lerp(a.x, b.x, k), 0.08);
    TC.y = lerp(TC.y, lerp(a.y, b.y, k), 0.08);
    TC.s = lerp(TC.s, lerp(a.s, b.s, k), 0.08);
    TC.since = tclock - tf.t0;
    TC.sy = sy;
    MOT.on = true;
    MOT.sy = sy;
    MOT.fade = TC.since < TDUR + MAXDEL ? 0.2 : lerp(0.36, 0.13, clamp(Math.abs(MOT.vel) / 1600));
    fieldDim = lerp(fieldDim, lerp(1, isMobile ? 0.3 : 0.4, k), 0.06);
    renderField(F[tf.cur], tf.prev ? F[tf.prev] : null, TC.since, tclock, 1, 0);
    MOT.on = false;
  }

  // how fast the page is moving (smoothed), for streaks, trails and drag
  let lastSy = 0;
  function trackVel(dt) {
    const sy = window.scrollY;
    const raw = dt > 0 ? (sy - lastSy) / dt : 0;
    lastSy = sy;
    MOT.vel = lerp(MOT.vel, clamp(raw, -6000, 6000), 0.22);
    if (Math.abs(MOT.vel) < 1) MOT.vel = 0;
  }

  // While the autopilot runs, the block being read is lit and the rest of the page steps back;
  // the reading bar beside it fills up for as long as the page waits there.
  let focusStep = null;
  let focusKey = null;
  function updateFocus() {
    const auto = (playing || capturing) && !readMode && t >= FILM; // a recording shows the page as playing
    doc.classList.toggle('tour-auto', auto);
    const tau = t - FILM;
    const st = auto ? stepAt(tau) : null;
    if (st !== focusStep) {
      if (focusStep) focusStep.els.forEach((el) => el.classList.remove('is-focus'));
      if (st) st.els.forEach((el) => el.classList.add('is-focus'));
      focusStep = st;
    }
    // the bar stands beside the piece being read and fills while it is read
    let it = null;
    if (st) for (const x of st.items) if (x.beatT <= tau) it = x;
    const key = it || st;
    if (key !== focusKey) {
      focusKey = key;
      if (it) {
        readbar.style.transform = `translate3d(${Math.round(it.l - (isMobile ? 9 : 30))}px, ${Math.round(it.t)}px, 0)`;
        readbar.style.height = Math.max(24, Math.round(it.h)) + 'px';
      } else if (st) {
        readbar.style.transform = `translate3d(${Math.round(st.bl - (isMobile ? 9 : 30))}px, ${Math.round(st.bt)}px, 0)`;
        readbar.style.height = Math.max(24, Math.round(st.bb - st.bt)) + 'px';
      }
    }
    readbar.classList.toggle('on', !!st);
    if (it) readbar.style.setProperty('--rp', clamp((tau - it.beatT) / it.time).toFixed(4));
    else if (st) readbar.style.setProperty('--rp', clamp((tau - st.start - st.move) / st.dwell).toFixed(4));
  }

  // the particle swarm's current delivery (see swarmPos)
  const SWc = {}, SWp = {};
  function onScreen(it, sy, o) {
    o.l = it.l;
    o.t = it.t - sy;
    o.w = it.w;
    o.h = it.h;
    o.x = it.l + it.w / 2;
    o.y = it.t - sy + it.h / 2;
    o.s = clamp(Math.min(it.h, it.w) * 0.6, 44, isMobile ? 70 : 110) * (it.icon === 'storm' ? 1.5 : 1);
    return o;
  }
  function swarmUpdate(sy) {
    SWARM.on = false;
    if (!((playing || capturing) && !readMode) || t < FILM) return;
    const tau = t - FILM;
    let k = -1;
    for (let j = 0; j < deliveries.length; j++) {
      if (deliveries[j].beatT - 0.8 <= tau) k = j;
      else break;
    }
    if (k < 0) return;
    const cur = deliveries[k];
    const st = stepAt(tau);
    if (!st || st.sec !== cur.sec || st.card) return; // title cards belong to the hero
    const prev = k > 0 && deliveries[k - 1].sec === cur.sec ? deliveries[k - 1] : null;
    SWARM.on = true;
    SWARM.d = tau - cur.beatT;
    SWARM.icon = cur.icon;
    SWARM.c = onScreen(cur, sy, SWc);
    SWARM.p = prev ? onScreen(prev, sy, SWp) : null;
  }

  // the chapter numbers drift slower than the page (parallax)
  function parallaxNumbers(sy) {
    for (const sec of tsecs) {
      if (!sec.big) continue;
      const d = sec.thTop - L.hdr - sy;
      if (d > H * 1.5 || d < -sec.thH - H) continue;
      sec.big.style.setProperty('--par', (d * -0.32).toFixed(1) + 'px');
    }
  }

  function paint() {
    const sy = window.scrollY;
    const filmVisible = sy < H * 1.02;
    const ft = Math.min(t, FILM);
    if (filmVisible && dirty) renderDom(ft);
    if (tourEl) renderTour(tclock, sy);

    if (sy < H * 0.5) {
      // the film (its particles scroll away with it)
      if (fieldMode !== 'film') {
        fieldMode = 'film';
        filmBlend = { from: tf.cur, t0: tclock };
      }
      const target = isMobile ? frontScene.dimM : 1;
      fieldDim = lerp(fieldDim, target, 0.06);
      drawField(ft, null, L.scroll0 - sy, filmBlend ? { from: filmBlend.from, since: tclock - filmBlend.t0 } : null);
    } else {
      const sec = sectionAt(sy);
      const want = sec ? sec.form : 'dust';
      if (fieldMode !== 'tour') {
        fieldMode = 'tour';
        filmBlend = null;
        tf = { cur: want, prev: forms[formIndex(ft)].name, t0: tclock };
      } else if (want !== tf.cur) {
        tf = { cur: want, prev: tf.cur, t0: tclock };
      }
      swarmUpdate(sy);
      heroField(sec, sy);
    }
    if (tourEl) {
      updateFocus();
      parallaxNumbers(sy);
    }
    updateUI();
    dirty = false;
  }

  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (capturing) {
      requestAnimationFrame(frame);
      return;
    }
    if (readMode) {
      tclock += dt;
      const sy = window.scrollY;
      trackVel(dt);
      if (tourEl) {
        renderTour(tclock, sy);
        updateFocus();
        parallaxNumbers(sy);
      }
      // a calm ring beside the film's content, then each section's hero, stepped aside
      const sec = tsecs.length && sy + H * 0.45 >= tsecs[0].top ? sectionAt(sy) : null;
      const want = sec ? sec.form : 'calm';
      if (fieldMode !== 'read') {
        fieldMode = 'read';
        tf = { cur: want, prev: null, t0: tclock };
      } else if (want !== tf.cur) tf = { cur: want, prev: tf.cur, t0: tclock };
      SWARM.on = false;
      heroField(sec ? { cardY: -Infinity } : null, sy);
    } else {
      advance(dt);
      trackVel(dt);
      paint();
    }
    requestAnimationFrame(frame);
  }

  function start() {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
    measure();
    const qt = parseFloat(params.get('t'));
    if (!isNaN(qt)) seek(qt, true);
    if (params.has('paused')) playing = false;
    if (params.has('read') || reduceMotion) setRead(true);
    syncButtons();
    renderDom(Math.min(t, FILM));
    requestAnimationFrame((n) => {
      last = n;
      frame(n);
    });
  }

  function remeasure() {
    const wasTour = t >= FILM;
    measure();
    // keep the page where the timeline says it is
    if (!readMode && (playing || wasTour)) setScroll(targetY(t));
  }
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(remeasure, 120);
  });
  mqMobile.addEventListener('change', remeasure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(remeasure);
  window.__naxa = {
    seek,
    get t() {
      return t;
    },
    get TOTAL() {
      return TOTAL;
    },
    FILM,
    get tour() {
      return tour;
    },
    scenes,
    setPlaying,
    setRead,
    jumpTo,
    // Frame-by-frame rendering for recording a video of the whole page.
    capture(on) {
      capturing = on;
      playing = false;
      syncButtons();
      if (on) ctl.classList.remove('paused'); // the video should show the film as playing
    },
    step(dt) {
      t = clamp(t + dt, 0, TOTAL);
      tclock += dt;
      dirty = true;
      setScroll(targetY(t));
      trackVel(dt);
      paint();
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
