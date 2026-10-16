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
    ? {
        play: '播放',
        pause: '暂停',
        replay: '重新播放',
        read: '按页面阅读',
        film: '按短片播放',
        pickHint: '你也有这些问题吗？点一下你有的。',
        pickGo: '好了，继续 →',
        fit: '适合你',
        wish: '我最想先解决：',
        sound: '声音',
      }
    : {
        play: 'Play',
        pause: 'Pause',
        replay: 'Replay',
        read: 'Read as page',
        film: 'Play as film',
        pickHint: 'Sound familiar? Tap the ones you have.',
        pickGo: 'Done, carry on →',
        fit: 'For you',
        wish: 'What I would like to solve first: ',
        sound: 'Sound',
      };

  // Pick your pains (film chapter 03): the problems can be tapped; the agents that answer them are marked
  // for the visitor later on, and the contact form starts with them. The hint and button are added here,
  // so a page without JavaScript never shows controls that do nothing. (New text, not from the original.)
  const PICK = { set: new Set(), msg: '' };
  const painCol = $('.s-pain .col-l');
  if (painCol) {
    const hint = document.createElement('div');
    hint.className = 'pick-hint m m-rise';
    hint.dataset.at = '16.8';
    hint.innerHTML = `<p>${UI.pickHint}</p><button type="button" class="pick-go" hidden>${UI.pickGo}</button>`;
    painCol.appendChild(hint);
  }
  const pains = $$('.s-pain .pain');

  // Sound, off until the visitor switches it on: a soft pad that follows each chapter's mood, small ticks as
  // text is written, a breath of air between chapters, a chime when an idea lands. All of it is generated
  // in the browser; nothing is downloaded and no audio starts by itself.
  const Sound = (() => {
    let ac = null, master = null, on = false, pad = null, noiseBuf = null, lastTick = 0, lvl = 0;
    const CHORDS = {
      night: [110, 164.81, 246.94, 329.63],
      aqua: [130.81, 196, 293.66, 392],
      ember: [98, 146.83, 233.08, 293.66],
      growth: [146.83, 220, 329.63, 369.99],
      gold: [164.81, 246.94, 369.99, 415.3],
      dawn: [174.61, 261.63, 349.23, 440],
    };
    let mood = 'night';
    function init() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = 0;
      const comp = ac.createDynamicsCompressor();
      master.connect(comp);
      comp.connect(ac.destination);
      // the pad: four voices, each two slightly detuned saws, through a slowly breathing low-pass filter
      const filter = ac.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 650;
      filter.Q.value = 0.6;
      const lfo = ac.createOscillator();
      const lfoG = ac.createGain();
      lfo.frequency.value = 0.06;
      lfoG.gain.value = 240;
      lfo.connect(lfoG);
      lfoG.connect(filter.frequency);
      lfo.start();
      const padG = ac.createGain();
      padG.gain.value = 0.045;
      filter.connect(padG);
      padG.connect(master);
      pad = CHORDS[mood].map((f) => {
        const g = ac.createGain();
        g.gain.value = 0.25;
        g.connect(filter);
        return [-7, 7].map((dt) => {
          const o = ac.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = f;
          o.detune.value = dt;
          o.connect(g);
          o.start();
          return o;
        });
      });
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      return true;
    }
    function noise(dur, f0, f1, gain, q) {
      const now = ac.currentTime;
      const src = ac.createBufferSource();
      src.buffer = noiseBuf;
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = q;
      bp.frequency.setValueAtTime(f0, now);
      bp.frequency.exponentialRampToValueAtTime(f1, now + dur);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(gain, now + dur * 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      src.connect(bp);
      bp.connect(g);
      g.connect(master);
      src.start(now, Math.random() * 0.5);
      src.stop(now + dur + 0.05);
    }
    const live = () => on && ac && lvl > 0.01;
    return {
      get on() {
        return on;
      },
      toggle() {
        if (!ac && !init()) return false;
        on = !on;
        if (on && ac.state === 'suspended') ac.resume();
        return on;
      },
      // how loud overall: full while playing, quiet while paused, silent when off or hidden
      level(v) {
        v = on ? v : 0;
        if (!ac || Math.abs(v - lvl) < 0.005) return;
        lvl = v;
        master.gain.setTargetAtTime(v, ac.currentTime, 0.5);
      },
      mood(m) {
        mood = CHORDS[m] ? m : 'night';
        if (!pad) return;
        const fs = CHORDS[mood];
        pad.forEach((pair, k) => pair.forEach((o) => o.frequency.setTargetAtTime(fs[k], ac.currentTime, 0.8)));
      },
      tick() {
        if (!live()) return;
        if (ac.currentTime - lastTick < 0.075) return;
        lastTick = ac.currentTime;
        noise(0.05, 3000 + Math.random() * 1800, 2200, 0.035, 5);
      },
      whoosh() {
        if (live()) noise(1.2, 260, 2000, 0.07, 0.8);
      },
      ping(v = 1) {
        if (!live()) return;
        const now = ac.currentTime;
        const o = ac.createOscillator();
        o.type = 'sine';
        const f = v < 1 ? 660 : 880;
        o.frequency.setValueAtTime(f, now);
        o.frequency.exponentialRampToValueAtTime(f * 1.5, now + 0.16);
        const g = ac.createGain();
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.07, now + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
        o.connect(g);
        g.connect(master);
        o.start(now);
        o.stop(now + 1);
      },
    };
  })();
  pains.forEach((el, k) => {
    el.dataset.pick = k;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-pressed', 'false');
    el.tabIndex = 0;
  });

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
    fit: [0, 0, 0, 0, 0, 0], // agents that answer the visitor's picked problems
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
    if (front && front !== frontScene && front.idx > 0) Sound.whoosh(); // a breath of air between chapters
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
  const R1 = mk(), R2 = mk(), R3 = mk(), R4 = mk(), R5 = mk(), R6 = mk(), R7 = mk();
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
  const sprite = (rgb) => {
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
  };
  const SPR = PAL.map(sprite);
  // Each chapter has a mood: the particles, the glow behind them and the accent colour of the headlines
  // shift with it (a pressured amber for problems, clear aqua for solutions, green for growth, gold for
  // returns, a dawn pink for beginnings). The particles change colour one by one, so it washes through.
  const MOODS = {
    night: { pal: PAL, bg: ['47,110,255', '140,124,255', '54,200,224'], acc: '169,200,255' },
    aqua: { pal: ['230,252,255', '150,232,255', '64,196,240', '82,150,255', '40,222,214', '255,181,71'], bg: ['30,160,235', '60,110,255', '60,230,220'], acc: '143,230,255' },
    ember: { pal: ['255,240,226', '255,204,150', '255,150,96', '240,98,90', '255,176,110', '255,92,70'], bg: ['225,105,55', '160,60,95', '255,165,80'], acc: '255,195,154' },
    growth: { pal: ['238,255,244', '170,240,205', '86,214,160', '64,170,232', '128,232,178', '255,196,92'], bg: ['35,185,135', '55,125,230', '140,230,170'], acc: '157,240,198' },
    gold: { pal: ['255,249,230', '255,228,160', '255,196,96', '236,160,84', '255,214,128', '255,150,70'], bg: ['225,165,55', '195,115,60', '255,220,140'], acc: '255,217,140' },
    dawn: { pal: ['255,244,240', '255,206,196', '250,160,178', '186,140,255', '255,192,150', '255,181,71'], bg: ['235,115,150', '145,105,255', '255,185,140'], acc: '255,188,208' },
  };
  for (const k in MOODS) MOODS[k].spr = k === 'night' ? SPR : MOODS[k].pal.map(sprite);
  const MOOD_OF = {
    intro: 'night',
    hero: 'night',
    flow: 'aqua',
    pain: 'ember',
    solutions: 'aqua',
    outcomes: 'growth',
    roi: 'gold',
    founders: 'dawn',
    start: 'aqua',
    finale: 'night',
    about: 'night',
    'ai-solutions': 'aqua',
    startup: 'dawn',
    demo: 'night',
    cases: 'growth',
    'business-review': 'gold',
    contact: 'dawn',
  };
  const MOOD = { cur: 'night', prev: 'night', t0: -99, m: 1, sc: SPR, sp: SPR, css: '' };

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
    ill: { x: 0, y: 0, s: 100 },
    cine: { x: 0, y: 0, s: 100 },
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
      const fit = fx.fit[k - 1];
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
        o.x = lerp(rx, sat.x + Math.cos(sa) * sr * (1 + fit * 0.8), act);
        o.y = lerp(ry, sat.y + Math.sin(sa) * sr * (1 + fit * 0.8), act);
        o.a = lerp(0.3, 0.42, act) * (1 + fit * 0.9);
        o.s = 0.8 * (1 + fit * 0.3);
        o.h = fit && R4[i] < 0.3 ? 1 : 0;
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
  // which part of the hero the text being revealed is about (an agent, a layer, an area…), or -1
  const HERO = { k: -1 };
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
  const blipA = (k) => k * 1.047 + 0.5 + (k % 2) * 0.3;
  const blipR = (k) => 0.36 + ((k * 3) % 5) * 0.13;
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
      // the agents launch from the core one after another
      const dep = smooth(0.5 + k * 0.4, 1.4 + k * 0.4, TC.since);
      const R = (0.62 + k * 0.15) * lerp(0.18, 1, dep);
      const inc = (k - 2) * 0.34, node = k * 1.26;
      const sat = t * (0.62 - k * 0.07) + k * 1.9;
      const lit = HERO.k < 0 ? 1 : HERO.k === k ? 1.6 : 0.55;
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
      o.a = a * near(P3.z) * lerp(0.4, 1, dep) * lit;
      o.s = s * P3.k * (HERO.k === k ? 1.25 : 1);
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
      const lit = HERO.k < 0 ? 1 : HERO.k === j ? 1.7 : 0.6;
      o.a = ((line < 4 ? 0.42 : 0.2) + 0.6 * scan) * build * near(P3.z) * lit;
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
      const part = g < 0.1 ? 1 : g < 0.18 ? 2 : x < -0.38 ? 0 : x < 0.02 ? 1 : 2;
      o.x = TC.x + x * TC.s;
      o.y = TC.y + y * TC.s;
      o.a = a * (HERO.k < 0 ? 1 : HERO.k === part ? 1.5 : 0.5);
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
        const ba = blipA(k), br = blipR(k);
        ang = ba + (R3[i] - 0.5) * 0.09;
        r = br + (R4[i] - 0.5) * 0.06;
        const hit = Math.max(Math.exp(-behind(sweep, ba) * 0.8), HERO.k === k ? 1 : smooth(3, 4, TC.since) * 0.45);
        a = 0.18 + 0.82 * hit;
        s = 0.9 + hit * 0.6 + (HERO.k === k ? 0.6 : 0);
      } else {
        // the map: once found, the opportunities are joined up in order
        const m = i % 5;
        const drawn = smooth(3 + m * 0.45, 3.5 + m * 0.45, TC.since);
        const u = R1[i] * drawn;
        const a0 = blipA(m), r0 = blipR(m), a1 = blipA(m + 1), r1 = blipR(m + 1);
        const px = lerp(Math.cos(a0) * r0, Math.cos(a1) * r1, u), pz = lerp(Math.sin(a0) * r0, Math.sin(a1) * r1, u);
        proj(o, px, 0, pz, t * 0.05, -1.0);
        o.a = (drawn > 0.01 ? 0.55 : 0) * near(P3.z);
        o.s = 0.75 * P3.k;
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
  // Strokes passed through hot() are drawn amber: the part of a picture that is the problem.
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
      segs.push({ s, a: total, len, hot: !!s.hot });
      total += len;
    }
    ICONS[name] = { segs, total, spin };
  }
  const pulseAt = (t, ph) => 0.35 + 0.65 * Math.pow(Math.max(0, Math.sin(t * 2.2 - ph)), 2);
  const poly = (pts, ph) => pts.slice(1).map((p, k) => ['l', pts[k][0], pts[k][1], p[0], p[1], ph]);
  const hot = (strokes) => strokes.map((s) => Object.assign(s, { hot: 1 }));
  const box = (x0, y0, x1, y1, ph) => poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]], ph);
  const cross = (x, y, r, ph) => hot([['l', x - r, y - r, x + r, y + r, ph], ['l', x + r, y - r, x - r, y + r, ph]]);
  const tick = (x, y, r, ph) => poly([[x - r, y], [x - r * 0.3, y + r * 0.7], [x + r, y - r * 0.8]], ph);

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

  defIcon('question', [
    ['a', 0, -0.4, 0.4, 0.4, Math.PI, TAU + 0.6],
    ['l', 0.33, -0.17, 0, 0.14],
    ['l', 0, 0.14, 0, 0.4],
    ['p', 0, 0.72, 0],
  ]);
  // three people: the one in the middle is the AI layer, the others are roles not hired yet
  const person = (cx, s, ph, cy = 0) => [
    ['a', cx, cy - 0.38 * s, 0.22 * s, 0.22 * s, 0, TAU, ph],
    ['a', cx, cy + 0.5 * s, 0.44 * s, 0.36 * s, Math.PI, TAU, ph],
  ];
  defIcon('team', [...person(-0.62, 0.72, 0.5), ...person(0.62, 0.72, 1.6), ...person(0, 1, undefined)]);
  defIcon('pen', [
    ...poly([[-0.62, 0.42], [0.42, -0.62], [0.62, -0.42], [-0.42, 0.62], [-0.62, 0.42]]),
    ['l', -0.62, 0.42, -0.74, 0.74],
    ['l', -0.74, 0.74, -0.42, 0.62],
    ['l', 0.28, -0.48, 0.48, -0.28],
    ['f', -0.9, 0.9, 0.5, 0.9, 0.55],
  ]);
  defIcon('wheel', [
    ['a', 0, 0, 0.86, 0.86, 0, TAU],
    ['a', 0, 0, 0.22, 0.22, 0, TAU, 0],
    ...[Math.PI / 2, (Math.PI * 7) / 6, (Math.PI * 11) / 6].map((a) => ['l', Math.cos(a) * 0.22, Math.sin(a) * 0.22, Math.cos(a) * 0.86, Math.sin(a) * 0.86]),
  ]);
  defIcon('phone', [
    ...poly([[-0.4, -0.82], [0.4, -0.82], [0.4, 0.82], [-0.4, 0.82], [-0.4, -0.82]]),
    ['l', -0.14, -0.66, 0.14, -0.66],
    ['a', 0, 0.62, 0.07, 0.07, 0, TAU],
    ['a', 0.4, -0.5, 0.3, 0.3, -1.1, 0.4, 0],
    ['a', 0.4, -0.5, 0.52, 0.52, -1.1, 0.4, 0.8],
    ['a', 0.4, -0.5, 0.74, 0.74, -1.1, 0.4, 1.6],
  ]);
  defIcon('hourglass', [
    ...poly([[-0.56, -0.86], [0.56, -0.86], [0.08, 0], [0.56, 0.86], [-0.56, 0.86], [-0.08, 0], [-0.56, -0.86]]),
    ['f', 0, -0.05, 0, 0.72, 0.9],
    ['l', -0.36, 0.72, 0.36, 0.72, 0],
    ['l', -0.24, -0.62, 0.24, -0.62],
  ]);
  defIcon('stairs', [
    ...poly([[-0.92, 0.82], [-0.46, 0.82], [-0.46, 0.4], [0, 0.4], [0, -0.02], [0.46, -0.02], [0.46, -0.44], [0.92, -0.44]]),
    ['f', -0.7, 0.6, 0.7, -0.66, 0.32],
    ...poly([[0.92, -0.44], [0.92, -0.98], [1.2, -0.86], [0.92, -0.74]], 1.2),
  ]);
  defIcon('flow3', [
    ['a', -0.66, 0, 0.22, 0.22, 0, TAU, 0],
    ['a', 0, 0, 0.22, 0.22, 0, TAU, 1],
    ['a', 0.66, 0, 0.22, 0.22, 0, TAU, 2],
    ['f', -0.42, 0, -0.24, 0, 0.9],
    ['f', 0.24, 0, 0.42, 0, 0.9],
    ['l', -0.32, -0.08, -0.24, 0],
    ['l', -0.32, 0.08, -0.24, 0],
    ['l', 0.34, -0.08, 0.42, 0],
    ['l', 0.34, 0.08, 0.42, 0],
  ]);
  defIcon('shop', [
    ...poly([[-0.92, -0.42], [-0.8, -0.82], [0.8, -0.82], [0.92, -0.42]]),
    ...[-0.92, -0.46, 0, 0.46].map((x) => ['a', x + 0.23, -0.42, 0.23, 0.16, 0, Math.PI]),
    ...poly([[-0.8, -0.26], [-0.8, 0.86], [0.8, 0.86], [0.8, -0.26]]),
    ...poly([[-0.22, 0.86], [-0.22, 0.24], [0.22, 0.24], [0.22, 0.86]], 0),
  ]);
  defIcon('bank', [
    ...poly([[-0.92, -0.42], [0, -0.9], [0.92, -0.42], [-0.92, -0.42]]),
    ...[-0.6, -0.2, 0.2, 0.6].map((x, k) => ['l', x, -0.3, x, 0.66, k * 0.5]),
    ['l', -0.86, 0.74, 0.86, 0.74],
    ['l', -0.94, 0.88, 0.94, 0.88],
  ]);
  defIcon('rocket', [
    ...poly([[0, -0.96], [0.3, -0.46], [0.3, 0.34], [-0.3, 0.34], [-0.3, -0.46], [0, -0.96]]),
    ['a', 0, -0.28, 0.13, 0.13, 0, TAU, 0],
    ...poly([[0.3, 0.02], [0.56, 0.5], [0.3, 0.34]]),
    ...poly([[-0.3, 0.02], [-0.56, 0.5], [-0.3, 0.34]]),
    ['f', -0.12, 0.4, -0.18, 0.98, 1.2],
    ['f', 0, 0.4, 0, 1.08, 1.4],
    ['f', 0.12, 0.4, 0.18, 0.98, 1.1],
  ]);
  defIcon('book', [
    ...poly([[0, -0.52], [-0.88, -0.7], [-0.88, 0.62], [0, 0.78]]),
    ...poly([[0, -0.52], [0.88, -0.7], [0.88, 0.62], [0, 0.78]]),
    ['l', 0, -0.52, 0, 0.78],
    ...[-0.3, -0.04, 0.22].flatMap((y, k) => [
      ['l', -0.72, y - 0.08, -0.16, y + 0.02, k * 0.6],
      ['l', 0.16, y + 0.02, 0.72, y - 0.08, k * 0.6 + 0.3],
    ]),
  ]);
  defIcon('map', [
    ...poly([[-0.92, -0.56], [-0.3, -0.76], [0.3, -0.56], [0.92, -0.76], [0.92, 0.6], [0.3, 0.8], [-0.3, 0.6], [-0.92, 0.8], [-0.92, -0.56]]),
    ['l', -0.3, -0.76, -0.3, 0.6],
    ['l', 0.3, -0.56, 0.3, 0.8],
    ['f', -0.7, 0.5, -0.1, 0.1, 0.4],
    ['f', -0.1, 0.1, 0.42, -0.2, 0.4],
    ['a', 0.5, -0.36, 0.16, 0.16, 0, TAU, 0],
    ['l', 0.5, -0.2, 0.5, 0.02],
  ]);
  defIcon('agent', [
    ...poly([[-0.62, -0.42], [0.62, -0.42], [0.62, 0.58], [-0.62, 0.58], [-0.62, -0.42]]),
    ['p', -0.26, 0.02, 0],
    ['p', 0.26, 0.02, 0],
    ['l', -0.22, 0.32, 0.22, 0.32],
    ['l', 0, -0.42, 0, -0.74],
    ['a', 0, -0.82, 0.08, 0.08, 0, TAU, 0.6],
    ['l', -0.62, 0.04, -0.82, 0.04],
    ['l', 0.62, 0.04, 0.82, 0.04],
  ]);
  defIcon('flag', [
    ['l', -0.6, 0.92, -0.6, -0.88],
    ...poly([[-0.6, -0.88], [0.04, -0.98], [0.72, -0.8], [0.72, -0.18], [0.04, -0.36], [-0.6, -0.26]], 0),
    ['l', -0.92, 0.92, 0.4, 0.92],
  ]);
  defIcon('calendar', [
    ...poly([[-0.82, -0.62], [0.82, -0.62], [0.82, 0.82], [-0.82, 0.82], [-0.82, -0.62]]),
    ['l', -0.82, -0.3, 0.82, -0.3],
    ['l', -0.42, -0.82, -0.42, -0.5],
    ['l', 0.42, -0.82, 0.42, -0.5],
    ...[0, 1, 2, 3, 4, 5].map((k) => ['p', -0.5 + (k % 3) * 0.5, 0.06 + Math.floor(k / 3) * 0.4, k * 0.5]),
  ]);
  defIcon('papers', [
    ...[0, 1, 2].flatMap((k) => {
      const o = (2 - k) * 0.16;
      return poly([[-0.62 + o, -0.84 + o], [0.42 + o, -0.84 + o], [0.42 + o, 0.62 + o], [-0.62 + o, 0.62 + o], [-0.62 + o, -0.84 + o]], k * 0.6);
    }),
    ...[-0.44, -0.18, 0.08].map((y) => ['l', -0.3, y + 0.32, 0.4, y + 0.32]),
  ]);

  // the pictures for single sentences: a chip (technology), a bolt (faster), a missed call, an unclear
  // message, a lead that drops away, a blank page, a hand-off, scattered notes, a sprout (just starting)…
  defIcon('chip', [
    ...box(-0.5, -0.5, 0.5, 0.5),
    ...box(-0.22, -0.22, 0.22, 0.22, 0),
    ...[-0.3, 0, 0.3].flatMap((v, k) => [
      ['l', v, -0.5, v, -0.8, k * 0.5],
      ['l', v, 0.5, v, 0.8, k * 0.5 + 0.3],
      ['l', -0.5, v, -0.8, v, k * 0.5 + 0.6],
      ['l', 0.5, v, 0.8, v, k * 0.5 + 0.9],
    ]),
  ]);
  defIcon('bolt', [...poly([[0.18, -0.95], [-0.48, 0.1], [-0.04, 0.1], [-0.2, 0.95], [0.5, -0.16], [0.06, -0.16], [0.18, -0.95]], 0)]);
  defIcon('missed', [
    ...box(-0.72, -0.78, -0.06, 0.82),
    ['l', -0.5, -0.62, -0.28, -0.62],
    ['a', -0.39, 0.62, 0.07, 0.07, 0, TAU],
    ...hot([['a', 0.44, -0.4, 0.34, 0.34, 0, TAU, 0]]),
    ...cross(0.44, -0.4, 0.15, 0),
    // the call still ringing out, unanswered
    ['a', -0.06, 0.3, 0.24, 0.24, -0.9, 0.9, 0.6],
    ['a', -0.06, 0.3, 0.44, 0.44, -0.8, 0.8, 1.2],
  ]);
  const bubble = [
    ['a', 0, -0.12, 0.92, 0.64, 2.2, 1.78 + TAU],
    ['l', -0.54, 0.4, -0.62, 0.86],
    ['l', -0.62, 0.86, -0.19, 0.51],
  ];
  defIcon('chatq', [
    ...bubble,
    ...hot([
      ['a', 0, -0.32, 0.2, 0.2, Math.PI, TAU + 0.6, 0],
      ['l', 0.16, -0.2, 0, -0.02, 0],
      ['l', 0, -0.02, 0, 0.12, 0],
      ['p', 0, 0.3, 0],
    ]),
  ]);
  defIcon('chatok', [...bubble, ...tick(0, -0.12, 0.32, 0)]);
  defIcon('dropoff', [
    ...person(-0.6, 0.7),
    ...hot([
      ['p', -0.08, 0.1, 0.4],
      ['p', 0.14, 0.12, 0.8],
      ['p', 0.34, 0.16, 1.2],
    ]),
    ...cross(0.7, 0.2, 0.17, 1.6),
  ]);
  defIcon('blank', [
    ...poly([[-0.62, -0.88], [0.3, -0.88], [0.62, -0.56], [0.62, 0.88], [-0.62, 0.88], [-0.62, -0.88]]),
    ...poly([[0.3, -0.88], [0.3, -0.56], [0.62, -0.56]]),
    // a cursor blinking on an empty page
    ...hot([
      ['l', -0.36, -0.56, -0.36, -0.12, 0],
      ['l', -0.3, -0.56, -0.3, -0.12, 0],
    ]),
  ]);
  defIcon('calcheck', [
    ...box(-0.82, -0.62, 0.82, 0.82),
    ['l', -0.82, -0.3, 0.82, -0.3],
    ['l', -0.42, -0.82, -0.42, -0.5],
    ['l', 0.42, -0.82, 0.42, -0.5],
    ...[0, 1, 2, 3, 4, 5].flatMap((k) => tick(-0.5 + (k % 3) * 0.5, 0.06 + Math.floor(k / 3) * 0.4, 0.12, k * 0.5)),
  ]);
  defIcon('handoff', [
    ...person(-0.6, 0.66, 0),
    ...person(0.6, 0.66, 1.2),
    ...box(-0.14, -0.62, 0.14, -0.26, 0.6),
    ['f', -0.28, 0.2, 0.28, 0.2, 0.6],
    ['l', 0.16, 0.1, 0.28, 0.2],
    ['l', 0.16, 0.3, 0.28, 0.2],
  ]);
  const note = (cx, cy, a, ph) => {
    const c = Math.cos(a), s = Math.sin(a);
    const pt = (x, y) => [cx + x * c - y * s, cy + x * s + y * c];
    return [
      ...poly([pt(-0.27, -0.34), pt(0.27, -0.34), pt(0.27, 0.34), pt(-0.27, 0.34), pt(-0.27, -0.34)], ph),
      ...[-0.14, 0.02, 0.18].map((y) => ['l', ...pt(-0.15, y), ...pt(0.15, y)]),
    ];
  };
  defIcon('scatter', [
    ...note(-0.62, -0.5, -0.35, 0),
    ...hot(note(0.5, -0.6, 0.4, 0.8)),
    ...note(0.66, 0.5, -0.2, 1.6),
    ...hot(note(-0.4, 0.58, 0.55, 2.4)),
    ['p', 0, 0, 1.2],
  ]);
  defIcon('sprout', [
    ['l', -0.86, 0.78, 0.86, 0.78],
    ['a', 0, 1.06, 0.46, 0.3, Math.PI * 1.15, Math.PI * 1.85],
    ['l', 0, 0.78, 0, -0.3],
    ['f', 0, 0.78, 0, -0.3, 0.3],
    ...poly([[0, 0.02], [-0.22, -0.3], [-0.66, -0.4], [-0.44, -0.08], [0, 0.02]], 0),
    ['l', 0, 0.02, -0.5, -0.3],
    ...poly([[0, -0.24], [0.2, -0.6], [0.64, -0.74], [0.46, -0.38], [0, -0.24]], 0.8),
    ['l', 0, -0.24, 0.5, -0.6],
  ]);
  defIcon('untangle', [
    ...hot([
      ['a', -0.62, -0.1, 0.3, 0.42, 0, TAU, 0],
      ['a', -0.5, 0.1, 0.36, 0.26, 0.4, TAU + 0.4, 0.6],
      ['a', -0.7, 0.06, 0.2, 0.3, 1, TAU + 1, 1.2],
    ]),
    ['f', -0.16, 0, 0.88, 0, 0.5],
    ['l', 0.68, -0.18, 0.88, 0],
    ['l', 0.68, 0.18, 0.88, 0],
  ]);
  const starPts = [];
  for (let k = 0; k <= 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5, r = k % 2 ? 0.38 : 0.92;
    starPts.push([Math.cos(a) * r, Math.sin(a) * r + 0.08]);
  }
  defIcon('star', [...poly(starPts), ['p', 0, 0.08, 0]]);
  defIcon('heart', [
    ['a', -0.38, -0.28, 0.4, 0.4, Math.PI * 0.82, TAU],
    ['a', 0.38, -0.28, 0.4, 0.4, Math.PI, TAU + Math.PI * 0.18],
    ['l', -0.74, -0.1, 0, 0.84],
    ['l', 0.74, -0.1, 0, 0.84],
    ['p', 0, -0.1, 0],
  ]);
  defIcon('barrier', [
    ...box(-0.9, -0.42, 0.9, 0.06),
    ...hot([-0.62, -0.22, 0.18, 0.58].map((x, k) => ['l', x, 0.06, x + 0.3, -0.42, k * 0.5])),
    ['l', -0.66, 0.06, -0.66, 0.86],
    ['l', 0.66, 0.06, 0.66, 0.86],
    ['l', -0.86, 0.86, -0.46, 0.86],
    ['l', 0.46, 0.86, 0.86, 0.86],
  ]);
  defIcon('human', [...person(-0.2, 1, undefined, 0.06), ...tick(0.6, -0.42, 0.24, 0)]);
  defIcon('ranked', [
    ...[0, 1, 2].flatMap((k) => {
      const y = -0.56 + k * 0.56, len = 1.3 - k * 0.38;
      return [['a', -0.76, y, 0.1, 0.1, 0, TAU, k * 0.7], ...box(-0.52, y - 0.14, -0.52 + len, y + 0.14, k * 0.7)];
    }),
  ]);
  defIcon('muted', [
    ...poly([[-0.75, -0.26], [0.2, -0.68], [0.2, 0.68], [-0.75, 0.26], [-0.75, -0.26]]),
    ['l', -0.55, 0.32, -0.42, 0.78],
    ...hot([['l', -0.85, -0.85, 0.75, 0.75, 0]]),
    ['a', 0.2, 0, 0.42, 0.42, -0.75, 0.75],
  ]);

  // more things a subtitle names: a person, cold, far away, a knot, things running smoothly, cash, an order,
  // a form, a contact card, a place, urgency, a keyboard, a template, a comparison, attention, a signature,
  // a price, many ideas, ups and downs, things repeating, a reminder, a decision, a post, a note, a spreadsheet
  defIcon('person', [...person(0, 1.15, undefined, 0.06)]);
  defIcon('snow', [
    ...[0, 1, 2].map((k) => {
      const a = (k * Math.PI) / 3;
      return ['l', -Math.cos(a) * 0.9, -Math.sin(a) * 0.9, Math.cos(a) * 0.9, Math.sin(a) * 0.9, k * 0.6];
    }),
    ...[0, 1, 2, 3, 4, 5].flatMap((k) => {
      const a = (k * Math.PI) / 3, px = Math.cos(a) * 0.52, py = Math.sin(a) * 0.52;
      return [-0.75, 0.75].map((d) => ['l', px, py, px + Math.cos(a + d) * 0.26, py + Math.sin(a + d) * 0.26]);
    }),
  ]);
  defIcon('far', [
    // a road running off to the horizon, something small and faint at its end
    ['l', -0.98, -0.18, -0.12, -0.18],
    ['l', 0.12, -0.18, 0.98, -0.18],
    ['l', -0.92, 0.9, -0.07, -0.16],
    ['l', 0.92, 0.9, 0.07, -0.16],
    ...[[0.82, 0.56], [0.4, 0.2], [0.1, -0.04]].map(([y0, y1], k) => ['l', 0, y0, 0, y1, k * 0.5]),
    ['a', 0, -0.32, 0.06, 0.06, 0, TAU, 0],
    ['a', 0, -0.18, 0.5, 0.36, Math.PI * 1.08, Math.PI * 1.92],
  ]);
  defIcon('tangle', [
    ['a', -0.12, -0.05, 0.52, 0.36, 0, TAU, 0],
    ['a', 0.14, 0.08, 0.36, 0.54, 0.5, TAU + 0.5, 0.7],
    ['a', 0, 0, 0.66, 0.26, 1, TAU + 1, 1.4],
    ['a', 0.06, -0.12, 0.24, 0.44, 2, TAU + 2, 2.1],
  ]);
  defIcon('straight', [
    ...[-0.42, 0, 0.42].flatMap((y, k) => [['l', -0.86, y, 0.7, y], ['f', -0.86, y, 0.7, y, 0.5 + k * 0.08]]),
    ['l', 0.56, -0.14, 0.82, 0],
    ['l', 0.56, 0.14, 0.82, 0],
  ]);
  defIcon('cash', [
    ...box(-0.88, -0.48, 0.88, 0.48),
    ['a', 0, 0, 0.22, 0.22, 0, TAU, 0],
    ['p', -0.64, -0.26, 0.8],
    ['p', 0.64, 0.26, 1.6],
    ['f', -0.8, 0.74, 0.8, 0.74, 0.55],
  ]);
  defIcon('order', [
    ...poly([[-0.56, 0.72], [-0.56, -0.86], [0.56, -0.86], [0.56, 0.72], [0.38, 0.88], [0.19, 0.72], [0, 0.88], [-0.19, 0.72], [-0.38, 0.88], [-0.56, 0.72]]),
    ...[-0.56, -0.3, -0.04].map((y, k) => ['l', -0.36, y, k === 2 ? 0.1 : 0.36, y, k * 0.5]),
    ['l', -0.36, 0.32, 0.36, 0.32, 1.5],
  ]);
  defIcon('form', [
    ...box(-0.7, -0.88, 0.7, 0.88),
    ...[-0.56, -0.16, 0.24].flatMap((y, k) => box(-0.48, y, 0.48, y + 0.2, k * 0.6)),
    ...box(0.06, 0.58, 0.48, 0.72, 1.8),
  ]);
  defIcon('contact', [
    ...box(-0.9, -0.6, 0.9, 0.6),
    ...person(-0.46, 0.5, 0, 0.02),
    ...[-0.2, 0.06, 0.32].map((y, k) => ['l', 0.04, y, k === 2 ? 0.44 : 0.68, y, k * 0.5]),
  ]);
  defIcon('pin', [
    ['a', 0, -0.32, 0.46, 0.46, Math.PI * 0.8, Math.PI * 2.2],
    ['l', -0.372, -0.05, 0, 0.86],
    ['l', 0.372, -0.05, 0, 0.86],
    ['a', 0, -0.32, 0.16, 0.16, 0, TAU, 0],
  ]);
  defIcon('alarm', [
    ...poly([[0, -0.86], [0.88, 0.72], [-0.88, 0.72], [0, -0.86]]),
    ['l', 0, -0.32, 0, 0.22, 0],
    ['p', 0, 0.46, 0],
  ]);
  defIcon('keyboard', [
    ...box(-0.95, -0.46, 0.95, 0.46),
    ...[-0.24, 0].flatMap((y, r) => [-0.66, -0.44, -0.22, 0, 0.22, 0.44, 0.66].map((x, k) => ['p', x, y, (k + r * 3) * 0.4])),
    ['l', -0.4, 0.24, 0.4, 0.24, 2],
  ]);
  defIcon('template', [
    ...poly([[-0.62, -0.88], [0.3, -0.88], [0.62, -0.56], [0.62, 0.88], [-0.62, 0.88], [-0.62, -0.88]]),
    ...[-0.4, -0.1, 0.2, 0.5].flatMap((y, k) => [-0.4, -0.1, 0.2].map((x) => ['l', x, y, x + 0.18, y, k * 0.6])),
  ]);
  defIcon('compare', [
    ...box(-0.88, -0.78, -0.1, 0.78),
    ...box(0.1, -0.78, 0.88, 0.78),
    ...[-0.44, -0.12, 0.2].flatMap((y, k) => [['l', -0.7, y, -0.28, y, k * 0.5], ['l', 0.28, y, 0.7, y, k * 0.5 + 0.25]]),
    ...tick(-0.49, 0.5, 0.14, 1.6),
    ...tick(0.49, 0.5, 0.14, 1.9),
  ]);
  defIcon('eye', [
    ['a', 0, 0.45, 0.95, 0.75, Math.PI * 1.18, Math.PI * 1.82],
    ['a', 0, -0.45, 0.95, 0.75, Math.PI * 0.18, Math.PI * 0.82],
    ['a', 0, 0, 0.24, 0.24, 0, TAU, 0],
    ['p', 0, 0, 0.6],
  ]);
  defIcon('signed', [
    ...box(-0.62, -0.88, 0.62, 0.88),
    ...[-0.56, -0.3, -0.04].map((y, k) => ['l', -0.4, y, 0.4, y, k * 0.5]),
    ...poly([[-0.42, 0.5], [-0.28, 0.3], [-0.16, 0.56], [-0.02, 0.32], [0.1, 0.52], [0.4, 0.44]], 1.5),
    ['l', -0.44, 0.66, 0.44, 0.66],
  ]);
  defIcon('tag', [
    ...poly([[-0.92, 0], [-0.42, -0.56], [0.88, -0.56], [0.88, 0.56], [-0.42, 0.56], [-0.92, 0]]),
    ['a', -0.42, 0, 0.11, 0.11, 0, TAU, 0],
    ['l', -0.06, -0.18, 0.62, -0.18, 0.6],
    ['l', -0.06, 0.16, 0.42, 0.16, 1.2],
  ]);
  defIcon('ideas', [
    ...[[-0.62, 0.1], [0, -0.32], [0.62, 0.1]].flatMap(([x, y], k) => [
      ['a', x, y, 0.24, 0.24, 2.35, 0.79 + TAU, k * 0.7],
      ['l', x - 0.12, y + 0.3, x + 0.12, y + 0.3],
      ['l', x - 0.08, y + 0.4, x + 0.08, y + 0.4],
      ['l', x, y - 0.34, x, y - 0.46, k * 0.7],
    ]),
  ]);
  defIcon('zigzag', [
    ['l', -0.92, 0.8, 0.92, 0.8],
    ...poly([[-0.9, 0.2], [-0.62, -0.5], [-0.36, 0.46], [-0.1, -0.24], [0.16, 0.58], [0.42, -0.62], [0.66, 0.3], [0.9, -0.12]], 0),
  ]);
  const cyc = (a0, a1, ph) => {
    const x = Math.cos(a1) * 0.7, y = Math.sin(a1) * 0.7, tx = -Math.sin(a1), ty = Math.cos(a1);
    return [
      ['a', 0, 0, 0.7, 0.7, a0, a1, ph],
      ['l', x, y, x - tx * 0.22 + x * 0.22, y - ty * 0.22 + y * 0.22],
      ['l', x, y, x - tx * 0.22 - x * 0.22, y - ty * 0.22 - y * 0.22],
    ];
  };
  defIcon('cycle', [...cyc(-0.4, Math.PI - 0.7, 0), ...cyc(Math.PI - 0.4, TAU - 0.7, 1.2)], 0.5);
  defIcon('bell', [
    ['a', 0, -0.12, 0.48, 0.56, Math.PI, TAU],
    ['l', -0.48, -0.12, -0.62, 0.5],
    ['l', 0.48, -0.12, 0.62, 0.5],
    ['l', -0.78, 0.5, 0.78, 0.5],
    ['a', 0, 0.66, 0.11, 0.11, 0, TAU, 0],
    ['l', 0, -0.68, 0, -0.84],
    ['a', 0, -0.1, 0.78, 0.78, -2.6, -2.1, 0.6],
    ['a', 0, -0.1, 0.78, 0.78, -1.04, -0.54, 0.6],
  ]);
  defIcon('scale', [
    ['l', 0, -0.78, 0, 0.74],
    ['l', -0.42, 0.78, 0.42, 0.78],
    ['l', -0.82, -0.56, 0.82, -0.56, 0],
    ...[-0.82, 0.82].flatMap((x, k) => [
      ['l', x, -0.56, x - 0.24, 0.02],
      ['l', x, -0.56, x + 0.24, 0.02],
      ['a', x, 0.02, 0.26, 0.14, 0, Math.PI, k * 0.9],
    ]),
  ]);
  defIcon('post', [
    ...box(-0.72, -0.88, 0.72, 0.88),
    ...box(-0.54, -0.7, 0.54, 0.08),
    ...poly([[-0.54, 0.02], [-0.18, -0.36], [0.06, -0.12], [0.24, -0.3], [0.54, 0.02]], 0),
    ['l', -0.54, 0.34, 0.54, 0.34],
    ['l', -0.54, 0.56, 0.2, 0.56],
    ['p', 0.42, 0.66, 1.2],
  ]);
  defIcon('note', [
    ...poly([[-0.76, -0.76], [0.76, -0.76], [0.76, 0.38], [0.38, 0.76], [-0.76, 0.76], [-0.76, -0.76]]),
    ...poly([[0.38, 0.76], [0.38, 0.38], [0.76, 0.38]]),
    ...[-0.42, -0.12, 0.18].map((y, k) => ['a', -0.08, y + 0.16, 0.44, 0.12, Math.PI * 1.2, Math.PI * 1.8, k * 0.6]),
  ]);
  defIcon('sheet', [
    ...box(-0.88, -0.72, 0.88, 0.72),
    ...[-0.36, 0, 0.36].map((y, k) => ['l', -0.88, y, 0.88, y, k * 0.5]),
    ['l', -0.36, -0.72, -0.36, 0.72],
    ['l', 0.2, -0.72, 0.2, 0.72],
  ]);
  // what ~x and ~ok draw over a picture
  defIcon('xmark', cross(0, 0, 0.72));
  defIcon('okmark', tick(0, 0.08, 0.72));

  // ---- Scenes: what the particles draw while one subtitle sentence is written (data-icons on a passage,
  // one scene per sentence, separated by |).
  //   'phone~ring@漏接电话>!order~fade@漏掉订单'   one picture that turns into another (>) as the sentence goes on
  //   'row:a@…,b@…'   a sequence joined by arrows       'set:a@…,b@…,c@…'   several things at once (up to 6)
  //   'over:a@…,b@…'   the second drawn over the first (a magnifier over a shop)
  // Each picture: '!' makes it amber (a problem); then the icon; then actions; then '@word': the picture
  // springs out of that word of the subtitle the moment the word is written. Actions: ~ring ~shake ~fade
  // (falls apart and is gone) ~grow ~spin ~run (things flowing along it) ~pulse ~x (crossed out) ~ok (ticked)
  // ~dim. A picture without a word comes in at its turn, spread over the sentence.
  const SCENES = {};
  function sceneOf(str) {
    let sc = SCENES[str];
    if (sc) return sc;
    let body = String(str || 'target').trim(), kind = 'set';
    const m = /^(row|set|combo|over):/.exec(body);
    if (m) {
      kind = m[1] === 'combo' ? 'set' : m[1];
      body = body.slice(m[0].length);
    }
    const flat = [];
    const slots = body.split(',').map((part, j) => ({
      states: part.split('>').map((raw) => {
        const st = { slot: j, amber: false, act: {}, kw: null, icon: 'target', q: flat.length };
        let x = raw.trim();
        const at = x.indexOf('@');
        if (at >= 0) {
          st.kw = x.slice(at + 1).trim();
          x = x.slice(0, at);
        }
        if (x[0] === '!') {
          st.amber = true;
          x = x.slice(1);
        }
        const bits = x.split('~').map((b) => b.trim());
        st.icon = ICONS[bits[0]] || bits[0] === 'logo' || bits[0] === 'storm' ? bits[0] : 'target';
        bits.slice(1).forEach((b) => (st.act[b] = 1));
        flat.push(st);
        return st;
      }),
    }));
    const n = slots.length;
    let pos;
    if (kind === 'over') pos = [[-0.14, 0.04, 0.94], [0.44, 0.34, 0.56]];
    else if (kind === 'row' || n === 1) {
      const gap = [0, 1.56, 1.16, 0.92][n - 1] || 0.92, sz = [1, 0.44, 0.36, 0.3][n - 1] || 0.3;
      pos = slots.map((_, k) => [(k - (n - 1) / 2) * gap, 0, sz]);
    } else if (n === 2) pos = [[-0.62, 0, 0.5], [0.62, 0, 0.5]];
    else if (n === 3) pos = [[-0.6, -0.46, 0.42], [0.6, -0.46, 0.42], [0, 0.52, 0.42]];
    else if (n === 4) pos = [[-0.6, -0.55, 0.42], [0.6, -0.55, 0.42], [-0.6, 0.55, 0.42], [0.6, 0.55, 0.42]];
    else
      pos = slots.map((_, k) => {
        const r = k < 3 ? 0 : 1, m = r ? n - 3 : 3, c = r ? k - 3 : k;
        return [(c - (m - 1) / 2) * 1.04, r ? 0.56 : -0.5, 0.36];
      });
    slots.forEach((sl, k) => (sl.pos = pos[k] || [0, 0, 0.4]));
    // how far it reaches sideways (in picture sizes), so a wide row can be fitted to a narrow screen
    const ext = Math.max(1, ...slots.map((sl) => Math.abs(sl.pos[0]) + sl.pos[2]));
    sc = { kind, row: kind === 'row' && n > 1, slots, n, flat, ext };
    return (SCENES[str] = sc);
  }
  // which part of a scene particle i draws: its picture (a slot), or in a row the arrow into picture k + 1
  // (returned as -2 - k)
  function roleOf(sc, i) {
    if (sc.row && Math.floor(i / sc.n) % 9 === 0) return -2 - Math.floor(R1[i] * (sc.n - 1) * 0.9999);
    return i % sc.n;
  }
  // the latest picture of that part that has come in by now (-1: none yet)
  function stateOf(sc, role, now, trig) {
    if (role < 0) {
      const st = sc.slots[-role - 1].states[0];
      return trig[st.q] <= now ? st.q : -1;
    }
    let q = -1;
    for (const st of sc.slots[role].states) if (trig[st.q] <= now) q = st.q;
    return q;
  }
  function finalState(sc, role) {
    if (role < 0) return sc.slots[-role - 1].states[0].q;
    const sts = sc.slots[role].states;
    return sts[sts.length - 1].q;
  }
  let FLOW = 1; // how fast particles run along a picture's strokes (~run speeds it up)
  const MK = { x: 0, y: 0, a: 1, h: 0 };
  // where particle i sits in picture q of a scene (unit coordinates), tl seconds after the picture landed
  function statePoint(sc, q, role, i, t, tl, out) {
    if (role < 0) {
      // the arrow from picture k to picture k + 1
      const k = -role - 2, a = sc.slots[k].pos, b = sc.slots[k + 1].pos;
      const x0 = a[0] + a[2] * 1.05 + 0.04, x1 = b[0] - b[2] * 1.05 - 0.04;
      if (R3[i] < 0.34) {
        const u = R2[i], side = R3[i] < 0.17 ? -1 : 1, hl = Math.min(0.12, (x1 - x0) * 0.4);
        out.x = x1 - hl * u;
        out.y = side * hl * 0.8 * u;
        out.a = 0.85;
      } else {
        const u = (R2[i] + t * 0.45) % 1;
        out.x = x0 + (x1 - x0) * u;
        out.y = (R4[i] - 0.5) * 0.02;
        out.a = Math.sin(Math.PI * u);
      }
      out.h = 0;
      return out;
    }
    const st = sc.flat[q], A = st.act, sl = sc.slots[st.slot].pos;
    FLOW = A.run ? 7 : 1;
    iconPoint(st.icon, i, t, out);
    FLOW = 1;
    let x = out.x, y = out.y, a = out.a, h = out.h;
    if (A.grow) {
      const g = 0.16 + 0.84 * easeOut(clamp(tl / 1.4));
      x *= g;
      y = 0.9 - (0.9 - y) * g;
    }
    if (A.spin) {
      const r = t * 0.9, c = Math.cos(r), sn = Math.sin(r);
      const x1 = x * c - y * sn;
      y = x * sn + y * c;
      x = x1;
    }
    if (A.ring && Math.sin(t * 3.4) > 0.1) x += Math.sin(t * 46 + R1[i] * 5) * 0.05;
    if (A.shake) {
      x += Math.sin(t * 29 + R2[i] * 20) * 0.035;
      y += Math.cos(t * 23 + R3[i] * 20) * 0.035;
    }
    if (A.pulse) {
      const p = Math.sin(t * 3.4);
      x *= 1 + 0.07 * p;
      y *= 1 + 0.07 * p;
      a *= 0.82 + 0.18 * p;
    }
    if (A.dim) a *= 0.4;
    if (st.amber) h = 1;
    if ((A.x || A.ok) && R6[i] < 0.27) {
      // a share of the picture's particles crosses it out, or ticks it
      const e = easeInOut(clamp((tl - 0.25) / 0.45));
      if (e > 0) {
        iconPoint(A.x ? 'xmark' : 'okmark', i, t, MK);
        x = lerp(x, MK.x * 0.9, e);
        y = lerp(y, MK.y * 0.9, e);
        a = lerp(a, 1, e);
        if (e > 0.5) h = A.x ? 1 : 0;
      }
    }
    if (A.fade) {
      // falls apart, turning amber on its way out: lost
      const e = clamp((tl - 0.5) / 1.3);
      if (e > 0) {
        // (a little amber dust stays where it fell)
        y += e * e * (0.35 + R3[i] * 0.7);
        x += (R1[i] - 0.5) * 0.6 * e;
        a *= 1 - e * (R2[i] < 0.3 ? 0.7 : 0.97);
        h = 1;
      }
    }
    // a picture flares up as it lands
    if (tl > 0 && tl < 0.8) a *= 1 + 0.5 * (1 - tl / 0.8);
    out.x = sl[0] + x * sl[2];
    out.y = sl[1] + y * sl[2];
    out.a = a;
    out.h = h;
    return out;
  }
  // a scene as it ends up, all its pictures drawn (how it stays until the next one takes over)
  function sceneFinal(str, i, t, out) {
    const sc = sceneOf(str), role = roleOf(sc, i);
    return statePoint(sc, finalState(sc, role), role, i, t, 9, out);
  }

  // where particle i sits on an icon at time t (unit coordinates); also how bright, and whether amber
  function iconPoint(name, i, t, out) {
    out.a = 1;
    out.h = 0;
    if (!ICONS[name] && name !== 'storm' && name !== 'logo') return sceneFinal(name, i, t, out);
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
    const u = (R1[i] + t * 0.018 * FLOW) % 1;
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
    if (g.hot) out.h = 1;
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

  // The swarm: while the autopilot reads a section, about 40% of the particles leave the hero. Most of them
  // draw a large picture of what is being read beside the text (morphing from one passage's picture to the
  // next: a problem's storm turns into the agent that solves it, then into growth); the rest become the pen
  // that writes the text out and settles as a glowing underline beneath it.
  const SWARM = { on: false, d: 0, icon: 'target', pIcon: null, c: null, p: null, last: null, rel: null, relC: null, scene: null, from: null, now: 99, trig: [], word: [] };
  // the share of particles that leaves the hero (more of them in film mode), and of those the share
  // that draws the picture (the rest is the pen)
  let SWARM_FRAC = 0.42;
  let ILL_FRAC = 0.62;
  const IP = { x: 0, y: 0, a: 1, h: 0 };
  const SP = { x: 0, y: 0, a: 0, s: 1, h: 0 };
  const QP = { x: 0, y: 0, a: 0, h: 0 };
  // where particle i of the picture sits for an icon (or back in the hero if the passage has no picture)
  function illPoint(i, t, icon, fx, fy, fa) {
    const c = CINE.on ? L.cine : L.ill;
    if (!icon || icon === 'none') {
      if (CINE.on) {
        // no picture: a single point of light waits in the middle, like the opening's idea
        const a = R1[i] * TAU + t * (0.6 + R2[i]);
        const r = 2 + R3[i] * R3[i] * 16 * (1 + 0.2 * Math.sin(t * 2.4 + R4[i] * 6));
        QP.x = c.x + Math.cos(a) * r;
        QP.y = c.y + Math.sin(a) * r;
        QP.a = 0.5;
        QP.h = 0;
        return QP;
      }
      QP.x = fx;
      QP.y = fy;
      QP.a = fa;
      QP.h = 0;
      return QP;
    }
    iconPoint(icon, i, t, IP);
    const k = icon === 'storm' ? 1.12 : 1;
    QP.x = c.x + IP.x * c.s * k;
    QP.y = c.y + IP.y * c.s * k;
    QP.a = 0.92 * IP.a * clamp((c.s - 18) / 26);
    QP.h = IP.h;
    return QP;
  }
  // the pen: half the swarm is a small bright point at the letter being written, half a fading trail
  // along what was just written
  const PEN = { x: 0, y: 0, h: 16, hist: [], head: 0 };
  const PEN_N = 28;
  for (let k = 0; k < PEN_N; k++) PEN.hist.push({ x: 0, y: 0 });
  const PP = { x: 0, y: 0, a: 0 };
  function penPoint(i, t) {
    if (R2[i] < 0.5) {
      const r = 1.5 + R3[i] * R3[i] * 11;
      const a = ANG[i] + t * (4 + R4[i] * 5);
      PP.x = PEN.x + Math.cos(a) * r;
      PP.y = PEN.y + Math.sin(a) * r * 0.75;
      PP.a = 0.5;
    } else {
      const k = Math.floor(R1[i] * PEN_N);
      const p = PEN.hist[(PEN.head - k + PEN_N * 2) % PEN_N];
      PP.x = p.x + (R3[i] - 0.5) * 4;
      PP.y = p.y + PEN.h * 0.62 + (R4[i] - 0.5) * 3; // just under the line, not over the letters
      PP.a = 0.34 * (1 - k / PEN_N);
    }
    return PP;
  }

  // where the swarm rests once a piece is written: an underline, or for a demo a live frame around it
  const RP = { x: 0, y: 0, a: 0 };
  function restPos(i, t, c) {
    if (c.frame) {
      const u = (R1[i] + t * 0.03) % 1;
      onRect(u, c.l - 16, c.t - 14, c.l + c.w + 16, c.t + c.h + 14);
      RP.x = PT.x + (R3[i] - 0.5) * 2;
      RP.y = PT.y + (R4[i] - 0.5) * 2;
      // a light runs around the frame
      RP.a = 0.24 + 0.5 * Math.pow(Math.max(0, Math.cos((u - t * 0.18) * TAU)), 6);
    } else {
      RP.x = c.l + R1[i] * c.w;
      RP.y = c.t + c.h + 7 + (R3[i] - 0.5) * 4;
      RP.a = 0.3;
    }
    return RP;
  }

  // where a swarm particle rests once a passage is done: in its picture, or on its underline
  function swarmRest(i, t, c, icon, fx, fy, fa) {
    if (R7[i] < ILL_FRAC) return illPoint(i, t, icon, fx, fy, fa);
    restPos(i, t, c);
    QP.x = RP.x;
    QP.y = RP.y;
    QP.a = RP.a;
    QP.h = 0;
    return QP;
  }

  // Film mode: particle i of the picture. It belongs to one picture of the sentence's scene; until that
  // picture's word is written it is still part of the last scene (which steps back as the new words come),
  // then it streams down into the word and out of it into the new picture.
  const CU = { x: 0, y: 0, a: 0, h: 0 }, CF = { x: 0, y: 0, a: 0, h: 0 }, CT = { x: 0, y: 0, a: 0, h: 0 };
  function toScreen(u, o, sc) {
    const c = L.cine, k = Math.min(1, (W * 0.5 - 16) / (c.s * sc.ext));
    o.x = c.x + u.x * c.s * k;
    o.y = c.y + u.y * c.s * k;
    o.a = 0.92 * u.a * clamp((c.s - 18) / 26);
    o.h = u.h;
    return o;
  }
  // where the particle was before the scene: in the last scene as it ended, or in the hero
  function fromPoint(i, t, fx, fy, fa) {
    if (SWARM.from) return toScreen(sceneFinal(SWARM.from, i, t, CU), CF, sceneOf(SWARM.from));
    CF.x = fx;
    CF.y = fy;
    CF.a = fa;
    CF.h = 0;
    return CF;
  }
  function cinePos(i, t, fx, fy, fa) {
    SP.s = 0.95;
    if (!SWARM.scene) {
      SP.x = fx;
      SP.y = fy;
      SP.a = fa;
      SP.h = 0;
      return SP;
    }
    const sc = sceneOf(SWARM.scene), now = SWARM.now, role = roleOf(sc, i);
    const done = now >= 99;
    const q = done ? finalState(sc, role) : stateOf(sc, role, now, SWARM.trig);
    if (q < 0) {
      fromPoint(i, t, fx, fy, fa);
      SP.x = CF.x;
      SP.y = CF.y;
      SP.a = CF.a * (1 - 0.45 * clamp(now / 0.6));
      SP.h = CF.h;
      return SP;
    }
    const tq = done ? -99 : SWARM.trig[q];
    const fl = (now - tq - DEL[i] * 0.4) / 0.75;
    toScreen(statePoint(sc, q, role, i, t, now - tq - FLY_T, CU), CT, sc);
    if (fl >= 1) {
      SP.x = CT.x;
      SP.y = CT.y;
      SP.a = CT.a;
      SP.h = CT.h;
      return SP;
    }
    // where it comes from: this picture's previous form (a picture that turns into another), or the last scene
    const st = sc.flat[q];
    const sts = role >= 0 ? sc.slots[role].states : null;
    const k = sts ? sts.indexOf(st) : 0;
    if (k > 0) toScreen(statePoint(sc, sts[k - 1].q, role, i, t, now - SWARM.trig[sts[k - 1].q] - FLY_T, CU), CF, sc);
    else fromPoint(i, t, fx, fy, fa);
    if (fl <= 0) {
      SP.x = CF.x;
      SP.y = CF.y;
      SP.a = CF.a * (k > 0 ? 1 : 1 - 0.45 * clamp(now / 0.6));
      SP.h = CF.h;
      return SP;
    }
    if (k > 0 && sts[k - 1].icon === st.icon) {
      // the same picture changing (turning amber, being crossed out) stays where it is
      const e = easeInOut(fl);
      SP.x = lerp(CF.x, CT.x, e);
      SP.y = lerp(CF.y, CT.y, e);
      SP.a = lerp(CF.a, CT.a, e);
      SP.h = e < 0.5 ? CF.h : CT.h;
      return SP;
    }
    const w = SWARM.word[q] || SWc;
    const jx = Math.cos(ANG[i]) * (3 + R3[i] * 10), jy = Math.sin(ANG[i]) * (2 + R3[i] * 5);
    if (fl < 0.4) {
      // into the word…
      const e = Math.pow(fl / 0.4, 2);
      SP.x = lerp(CF.x, w.x + jx, e);
      SP.y = lerp(CF.y, w.y + jy, e);
      SP.a = lerp(CF.a, 1, e);
      SP.h = CF.h;
      SP.s = 0.85;
    } else {
      // …and out of it, into the picture
      const u = (fl - 0.4) / 0.6, e = easeOut(u);
      const sw = Math.sin(Math.PI * u) * SW[i] * 0.3;
      SP.x = lerp(w.x + jx, CT.x, e) + Math.cos(ANG[i]) * sw;
      SP.y = lerp(w.y + jy, CT.y, e) + Math.sin(ANG[i]) * sw;
      SP.a = lerp(1, CT.a, u);
      SP.h = u > 0.5 ? CT.h : 0;
    }
    return SP;
  }

  // The swarm, for each passage: the picture morphs from the last passage's into this one's; the pen flies
  // to the first letter, writes the text out alongside the typing, then settles as an underline beneath it.
  function swarmPos(i, t, fx, fy, fa) {
    const c = SWARM.c, pv = SWARM.p;
    const d = SWARM.d - DEL[i] * 0.25;
    SP.s = 0.85;
    SP.h = 0;
    if (R7[i] < ILL_FRAC) {
      if (CINE.on) return cinePos(i, t, fx, fy, fa);
      illPoint(i, t, SWARM.icon, fx, fy, fa);
      const tx = QP.x, ty = QP.y, ta = QP.a, th = QP.h;
      if (d >= 0) {
        SP.x = tx;
        SP.y = ty;
        SP.a = ta;
        SP.h = th;
        SP.s = 0.95;
        return SP;
      }
      illPoint(i, t, pv ? SWARM.pIcon : null, fx, fy, fa);
      if (d < -0.9) {
        SP.x = QP.x;
        SP.y = QP.y;
        SP.a = QP.a;
        SP.h = QP.h;
        return SP;
      }
      const e = easeInOut((d + 0.9) / 0.9);
      const sw = Math.sin(Math.PI * e) * SW[i] * 0.7;
      SP.x = lerp(QP.x, tx, e) + Math.cos(ANG[i]) * sw;
      SP.y = lerp(QP.y, ty, e) + Math.sin(ANG[i]) * sw;
      SP.a = lerp(QP.a, ta, e);
      SP.h = e < 0.5 ? QP.h : th;
      return SP;
    }
    // the pen sets off from the underline of the previous passage, or from its place in the hero
    let ox, oy, oa;
    if (pv) {
      restPos(i, t, pv);
      (ox = RP.x), (oy = RP.y), (oa = RP.a);
    } else {
      ox = fx;
      oy = fy;
      oa = fa;
    }
    const tS = SWARM.tS, tE = SWARM.tE;
    restPos(i, t, c);
    const ux = RP.x, uy = RP.y, ua = RP.a;
    if (d < -0.8) {
      SP.x = ox;
      SP.y = oy;
      SP.a = oa;
    } else if (d < tS) {
      // gathering at the first letter
      const e = easeInOut(clamp((d + 0.8) / Math.max(0.5, tS + 0.8)));
      const sw = Math.sin(Math.PI * e) * SW[i] * 0.6;
      penPoint(i, t);
      SP.x = lerp(ox, SWARM.p0x + (PP.x - PEN.x), e) + Math.cos(ANG[i]) * sw;
      SP.y = lerp(oy, SWARM.p0y + (PP.y - PEN.y), e) + Math.sin(ANG[i]) * sw;
      SP.a = lerp(oa, PP.a, e);
    } else if (d < tE && c.frame && R2[i] >= 0.5) {
      // a demo: while half the pen writes, the other half switches on a frame around it
      const e = easeInOut(clamp((d - tS) / 0.8));
      penPoint(i, t);
      SP.x = lerp(PP.x, ux, e);
      SP.y = lerp(PP.y, uy, e);
      SP.a = lerp(PP.a, ua, e);
    } else if (d < tE) {
      penPoint(i, t);
      SP.x = PP.x;
      SP.y = PP.y;
      SP.a = PP.a;
      SP.s = 0.8;
    } else if (d < tE + 0.6) {
      const e = easeInOut((d - tE) / 0.6);
      penPoint(i, t);
      SP.x = lerp(PP.x, ux, e);
      SP.y = lerp(PP.y, uy, e);
      SP.a = lerp(PP.a, ua, e);
    } else {
      SP.x = ux + (c.frame ? 0 : Math.sin(t * 0.8 + R2[i] * 9) * 1.5);
      SP.y = uy;
      SP.a = c.frame ? ua : 0.2 + 0.14 * Math.sin(t * 2 + R4[i] * 20);
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
  const MOT = { on: false, sy: 0, vel: 0, fade: 0.4, spark: null };
  const SPARK_END = 2.5 + 0.75 * 0.35;
  // a point along the spark's arc (quadratic Bézier)
  const BZ = { x: 0, y: 0 };
  function bez(sp, u) {
    const v = 1 - u;
    BZ.x = v * v * sp.x0 + 2 * v * u * sp.cx + u * u * sp.x1;
    BZ.y = v * v * sp.y0 + 2 * v * u * sp.cy + u * u * sp.y1;
    return BZ;
  }

  // ---- the visitor's pointer: a short trail of recent positions, each pushing particles aside while it fades
  const PTR = { pts: [], live: [], n: 0, r: 110, r2: 110 * 110, px: 0, py: 0, tx: 0, ty: 0, last: null };
  const PTR_N = 8;
  for (let k = 0; k < PTR_N; k++) PTR.pts.push({ x: -9999, y: -9999, t: -99, w: 0 });
  let ptrHead = 0;
  function pointerAt(x, y) {
    const l = PTR.last;
    if (l && Math.hypot(x - l.x, y - l.y) < 9) return;
    ptrHead = (ptrHead + 1) % PTR_N;
    const q = PTR.pts[ptrHead];
    q.x = x;
    q.y = y;
    q.t = tclock;
    PTR.last = q;
  }
  function pointerFrame() {
    PTR.r = isMobile ? 80 : 110;
    PTR.r2 = PTR.r * PTR.r;
    PTR.n = 0;
    // a ring buffer of recent points; the live ones (still pushing) are listed in PTR.live
    for (const q of PTR.pts) {
      const age = tclock - q.t;
      q.w = age < 1.4 ? (isMobile ? 26 : 34) * Math.exp(-age * 2.4) : 0;
      if (q.w > 0.5) PTR.live[PTR.n++] = q;
    }
    // the stars' parallax eases towards where the pointer (or the tilt) says
    PTR.px = lerp(PTR.px, PTR.tx, 0.05);
    PTR.py = lerp(PTR.py, PTR.ty, 0.05);
  }
  // where the particles are, on average (the target of a tapped idea)
  const FC = { x: 0, y: 0, sx: 0, sy: 0, w: 0 };
  const PULSE = { x: 0, y: 0, R: 0, k: 0, t0: -99 };
  // Tapping or clicking an empty part of the page releases an "idea": a spark that arcs into the particles
  // and lights them up where it lands.
  const SPARKS = [];
  function addSpark(x, y) {
    if (SPARKS.length > 5) SPARKS.shift();
    const tx = FC.x || W / 2, ty = FC.y || H / 2;
    SPARKS.push({ x0: x, y0: y, x1: tx, y1: ty, cx: (x + tx) / 2 + (ty - y) * 0.3, cy: (y + ty) / 2 - (tx - x) * 0.3 - 40, t0: tclock, hit: false });
  }
  function drawSparks() {
    if (!SPARKS.length) {
      pulseFrame();
      return;
    }
    const spr = MOOD.sc;
    for (let j = SPARKS.length - 1; j >= 0; j--) {
      const sp = SPARKS[j];
      const age = tclock - sp.t0;
      if (age > 1.6) {
        SPARKS.splice(j, 1);
        continue;
      }
      if (age < 0.9) {
        // the idea and its tail
        for (let k = 0; k < 16; k++) {
          const u = clamp(easeInOut(clamp(age / 0.9)) - k * 0.018);
          const v = 1 - u;
          const x = v * v * sp.x0 + 2 * v * u * sp.cx + u * u * sp.x1;
          const y = v * v * sp.y0 + 2 * v * u * sp.cy + u * u * sp.y1;
          const r = (k ? 4.2 : 9) * (1 - k / 18);
          ctx.globalAlpha = (k ? 0.75 : 1) * (1 - k / 16);
          ctx.drawImage(spr[k ? 1 : 0], x - r, y - r, r * 2, r * 2);
        }
      } else {
        if (!sp.hit) {
          sp.hit = true;
          PULSE.x = sp.x1;
          PULSE.y = sp.y1;
          PULSE.t0 = tclock;
          Sound.ping();
        }
        // a flash where it landed, then a ring of light opening out
        const e = clamp((age - 0.9) / 0.7);
        const R = 12 + easeOut(e) * (isMobile ? 120 : 170);
        const fl = Math.max(0, 1 - e * 3) * 40;
        if (fl > 1) {
          ctx.globalAlpha = 0.9;
          ctx.drawImage(spr[0], sp.x1 - fl, sp.y1 - fl, fl * 2, fl * 2);
        }
        for (let k = 0; k < 40; k++) {
          const a = (k / 40) * TAU + age * 0.6;
          const r = 4.5;
          ctx.globalAlpha = 0.85 * (1 - e);
          ctx.drawImage(spr[k % 2 ? 1 : 4], sp.x1 + Math.cos(a) * R - r, sp.y1 + Math.sin(a) * R * 0.9 - r, r * 2, r * 2);
        }
      }
    }
    pulseFrame();
  }
  function pulseFrame() {
    const e = clamp((tclock - PULSE.t0) / 1.1);
    PULSE.k = e < 1 ? 1 - e : 0;
    PULSE.R = 16 + easeOut(e) * (isMobile ? 150 : 230);
  }

  // the mood of whatever is on screen: the film's chapter, or the section of the page
  function setMood(id) {
    const want = MOOD_OF[id] || 'night';
    if (want !== MOOD.cur) {
      MOOD.prev = MOOD.m < 0.5 ? MOOD.prev : MOOD.cur;
      MOOD.cur = want;
      MOOD.t0 = tclock;
      Sound.mood(want);
    }
    MOOD.m = smooth(0, 2.2, tclock - MOOD.t0);
    MOOD.sc = MOODS[MOOD.cur].spr;
    MOOD.sp = MOODS[MOOD.prev].spr;
    // the backdrop's glow and the headlines' accent follow, blended
    const mix = (a, b) => a.split(',').map((v, k) => Math.round(lerp(+v, +b.split(',')[k], MOOD.m))).join(',');
    const A = MOODS[MOOD.prev], B = MOODS[MOOD.cur];
    const css = [mix(A.bg[0], B.bg[0]), mix(A.bg[1], B.bg[1]), mix(A.bg[2], B.bg[2]), mix(A.acc, B.acc)];
    const key = css.join('|');
    if (key !== MOOD.css) {
      MOOD.css = key;
      doc.style.setProperty('--g1', css[0]);
      doc.style.setProperty('--g2', css[1]);
      doc.style.setProperty('--g3', css[2]);
      doc.style.setProperty('--accent', `rgb(${css[3]})`);
    }
  }

  function renderField(fc, fp, since, t, starIn, oy) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = 1;
    ctx.fillStyle = `rgba(0,0,0,${MOT.on ? MOT.fade : 0.4})`;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';

    const trans = fp && since < TDUR + MAXDEL;
    prepare();
    FC.sx = FC.sy = FC.w = 0;
    const base = isMobile ? 2.6 : 3.1;

    const vel = MOT.on ? MOT.vel : 0;
    const swarm = MOT.on && SWARM.on;
    // a bridge between two sections: everything gathers into one spark of light, which travels to the
    // next title card and blooms into its hero
    const spark = MOT.on && MOT.spark && fp && since < SPARK_END ? MOT.spark : null;
    // the swarm going home when the autopilot stops mid-section
    const rel = MOT.on && !swarm && !spark && SWARM.relC && tclock - SWARM.rel.t0 < 0.9 ? SWARM.relC : null;
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
            ctx.drawImage((R4[i] < MOOD.m ? MOOD.sc : MOOD.sp)[1], x - r, y - r - (vel > 0 ? 0 : len), r * 2, r * 2 + len);
            continue;
          }
        }
        // stars sit at different depths: they drift against the pointer (or the tilt of the phone)
        const dp = 0.3 + R3[i] * 0.7;
        x += PTR.px * dp;
        y += PTR.py * dp;
      } else if (spark) {
        fc(i, t, A);
        const tt = since - DEL[i] * 0.35;
        const sp = spark;
        if (tt >= 2.5) {
          x = A.x; y = A.y; a = A.a; s = A.s; h = A.h;
        } else if (tt >= 1.5) {
          const e = easeOut((tt - 1.5) / 1);
          bez(sp, 1);
          const sw = Math.sin(Math.PI * e) * SW[i] * 0.55;
          x = lerp(BZ.x + Math.cos(ANG[i]) * R3[i] * 9, A.x, e) + Math.cos(ANG[i]) * sw;
          y = lerp(BZ.y + Math.sin(ANG[i]) * R3[i] * 9, A.y, e) + Math.sin(ANG[i]) * sw;
          a = lerp(0.9, A.a, e);
          s = lerp(0.8, A.s, e);
          h = 0;
          dim = lerp(1, fieldDim, e);
        } else if (tt >= 0.7) {
          // travelling, with a comet's tail
          const u = clamp(easeInOut((tt - 0.7) / 0.8) - R3[i] * 0.22);
          bez(sp, u);
          x = BZ.x + Math.cos(ANG[i]) * (2 + R4[i] * 5);
          y = BZ.y + Math.sin(ANG[i]) * (2 + R4[i] * 5);
          a = 0.95 * (1 - R3[i] * 0.6);
          s = 0.8;
          h = 0;
          dim = 1;
        } else {
          // gathering where the last piece of the section was read
          let bx, by, ba;
          if (sp.c && R5[i] < SWARM_FRAC) {
            fp(i, t, B);
            swarmRest(i, t, sp.c, sp.icon, B.x, B.y, B.a * fieldDim);
            (bx = QP.x), (by = QP.y), (ba = QP.a);
          } else {
            fp(i, t, B);
            (bx = B.x), (by = B.y), (ba = B.a * fieldDim);
          }
          const e = clamp(tt / 0.7);
          const k = e * e;
          const rr = 4 + 16 * (1 - e) + R3[i] * 6;
          x = lerp(bx, sp.x0 + Math.cos(ANG[i]) * rr, k);
          y = lerp(by, sp.y0 + Math.sin(ANG[i]) * rr, k);
          a = lerp(ba, 0.9, k);
          s = 0.8;
          h = 0;
          dim = 1;
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
        } else if (rel && R5[i] < SWARM_FRAC) {
          const e = easeInOut((tclock - SWARM.rel.t0) / 0.9);
          swarmRest(i, t, rel, SWARM.rel.icon, x, y, a);
          x = lerp(QP.x, x, e);
          y = lerp(QP.y, y, e);
          a = lerp(QP.a / Math.max(0.05, fieldDim), a, e);
        } else if (vel) {
          // dragged along by the page, then springing back
          y -= Math.max(-120, Math.min(120, vel * (0.025 + R4[i] * 0.06)));
        }
      }
      if (a < 0.01 || x < -30 || y < -30 || x > W + 30 || y > H + 30) continue;
      if (!STAR[i]) {
        // the pointer parts the particles as it moves through them; they close up behind it
        for (let k = 0; k < PTR.n; k++) {
          const q = PTR.live[k];
          const dx = x - q.x, dy = y - q.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < PTR.r2 && d2 > 0.01) {
            const d = Math.sqrt(d2);
            const f = (1 - d / PTR.r) * (1 - d / PTR.r) * q.w;
            x += (dx / d) * f;
            y += (dy / d) * f;
          }
        }
        if (a > 0.25) {
          FC.sx += x * a;
          FC.sy += y * a;
          FC.w += a;
        }
        // an idea that has just landed sends a ripple of light out through the particles
        if (PULSE.k > 0) {
          const dx = x - PULSE.x, dy = y - PULSE.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          const off = Math.abs(d - PULSE.R);
          if (off < 36) {
            const f = (1 - off / 36) * PULSE.k;
            x += (dx / d) * f * 16;
            y += (dy / d) * f * 16;
            a *= 1 + 1.8 * f;
          } else if (d < PULSE.R) a *= 1 + 0.35 * PULSE.k;
        }
      }
      const r = base * s * SZ[i];
      ctx.globalAlpha = a * dim > 1 ? 1 : a * dim;
      ctx.drawImage((R4[i] < MOOD.m ? MOOD.sc : MOOD.sp)[h ? 5 : STAR[i] ? 1 : COL[i]], x - r, y - r, r * 2, r * 2);
    }
    if (FC.w > 0) {
      FC.x = FC.sx / FC.w;
      FC.y = FC.sy / FC.w;
    }
    FC.sx = FC.sy = FC.w = 0;
    drawSparks(t);
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
    // while text is read the hero becomes the section's small emblem in the top right corner, and the
    // particles draw what is being read: beside the text column, or on phones in the space below the passage
    // (motion.js moves it there passage by passage)
    if (isMobile) {
      L.asideAt = { x: W - 40, y: L.hdr + 40, s: L.heroAt.s * 0.26 };
      L.ill = { x: W * 0.5, y: H * 0.7, s: W * 0.18 };
    } else {
      const col = tourEl && $('.manifesto', tourEl);
      const right = col ? col.getBoundingClientRect().right : W * 0.6;
      const room = Math.max(160, W - right);
      L.asideAt = { x: W - Math.min(110, room * 0.2) - 24, y: L.hdr + 104, s: L.heroAt.s * 0.32 };
      L.ill = { x: right + room * 0.5, y: L.hdr + (H - L.hdr - L.ctl) * 0.54, s: clamp(Math.min(room * 0.27, (H - L.hdr - L.ctl) * 0.24), 60, 190) };
    }
    // film mode: the picture takes the middle of the screen, above the subtitles
    const band = H - L.hdr - L.ctl;
    L.cine = isMobile
      ? { x: W / 2, y: L.hdr + band * 0.36, s: Math.min(W * 0.36, band * 0.23) }
      : { x: W / 2, y: L.hdr + band * 0.4, s: Math.min(W * 0.17, band * 0.29) };
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

  // Long text is typed out in reading order: letter by letter, or character by character in Chinese,
  // each one fading in with a little light, at an unhurried reading pace.
  const NO_TYPE =
    '.eyebrow, .btn, .btns, button, label, input, select, textarea, .tag, .tag-row, .spec-n, .layer-n, .pr-n, .ls-n, .sheet-n, .demo-bar, .demo-lock, .demo-preview, .t-bignum, [data-rs], dt, svg, form';
  const CPS = ZH ? 10 : 28; // characters per second
  const FADE = ZH ? 2.5 : 6; // characters fading in at once
  // film mode: a picture streams out of its word for this long; then it is given a moment to be seen
  const FLY_T = 1.05;
  const viewOf = (st) => (st.act.fade ? 2 : st.act.x || st.act.ok ? 1.15 : st.act.grow ? 1.4 : 0.75);
  const typed = [];
  function typeRun(el) {
    const chars = [];
    const walk = (node) => {
      for (const n of Array.from(node.childNodes)) {
        if (n.nodeType === 1) {
          if (!n.matches(NO_TYPE)) walk(n);
          continue;
        }
        if (n.nodeType !== 3 || !n.textContent.trim()) continue;
        const frag = document.createDocumentFragment();
        for (const c of Array.from(n.textContent)) {
          if (/\s/.test(c)) {
            frag.appendChild(document.createTextNode(c));
            continue;
          }
          const sp = document.createElement('span');
          sp.className = 'rc';
          sp.textContent = c;
          frag.appendChild(sp);
          chars.push(sp);
        }
        node.replaceChild(frag, n);
      }
    };
    walk(el);
    return chars;
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
      const nth = (sel) => (it.sec ? $$(sel, it.sec.el).indexOf(e) : -1);
      it.heroK = e.matches('.spec-row')
        ? nth('.spec-row')
        : e.matches('.layer')
          ? nth('.layer')
          : e.matches('.area')
            ? nth('.area')
            : e.matches('.cf-p, .case-h')
              ? 0
              : e.matches('.cf-s')
                ? 1
                : e.matches('.cf-o')
                  ? 2
                  : -1;
    });
    // each demo name waits as an outline (its own text, drawn by CSS) until it is written in
    $$('.demo-head h3', tourEl).forEach((h) => (h.dataset.ghost = h.textContent.trim()));
    items.forEach((it) => {
      if (it.kind === 'text') {
        it.ch = typeRun(it.el);
        it.lo = 0;
        it.hi = 0;
        typed.push(it);
      }
    });
    // what each passage says as film subtitles: a small label (its name or number) and its sentences
    items.forEach((it) => {
      if (it.card || it.kind === 'small' || it.kind === 'form' || it.el.closest('.contact-grid, .site-end')) return;
      it.cine = cineText(it);
    });
  }

  // ---- The tour as a film. While the autopilot plays, each passage is a shot: its picture forms in the
  // middle of the screen out of a single point of light (the opening's "idea" that grows into the logo),
  // and its text runs underneath as subtitles, one sentence at a time, between letterbox bars. The page
  // itself steps back meanwhile; it is all there again the moment the visitor scrolls or pauses.
  function norm(str) {
    return str.replace(/\s+/g, ' ').trim();
  }
  // (the mark '\u0001' is the end of a list item or paragraph inside a passage: a subtitle ends there too)
  function splitSents(str) {
    const out = [];
    let cur = '';
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (ch !== '\u0001') cur += ch;
      const end = ch === '\u0001' || (ZH ? '。！？；'.includes(ch) : '.!?;'.includes(ch) && (i + 1 >= str.length || str[i + 1] === ' '));
      if (end) {
        if (cur.trim()) out.push(cur.trim());
        cur = '';
      }
    }
    if (cur.trim()) out.push(cur.trim());
    // a long sentence is split at the comma nearest its middle, so a subtitle stays one or two lines
    const MAX = ZH ? 42 : 118;
    const res = [];
    for (let p of out) {
      while (p.length > MAX) {
        const re = ZH ? /[，、：]/g : /, |: | — /g;
        let best = -1, m;
        while ((m = re.exec(p))) {
          const i = m.index;
          if (i > p.length * 0.25 && i < p.length * 0.75 && (best < 0 || Math.abs(i - p.length / 2) < Math.abs(best - p.length / 2))) best = i;
        }
        if (best < 0) break;
        const cut = best + (ZH ? 1 : m && p[best] === ',' ? 1 : 1);
        res.push(p.slice(0, cut).trim());
        p = p.slice(cut).trim();
      }
      if (p) res.push(p);
    }
    return res;
  }
  function cineText(it) {
    const el = it.el;
    if (it.kind === 'head') return { kick: '', title: true, sents: [norm(el.textContent)], icons: iconsFor(it, 1) };
    const bridge = !!el.closest('.bridge');
    const num = el.querySelector('.spec-n, .layer-n, .pr-n, .ls-n, .sheet-n');
    const k = el.querySelector('.demo-head h3, h3, h4, strong, dt');
    const kick = k && k !== el ? (num ? num.textContent.trim() + '  ·  ' : '') + norm(k.textContent) : '';
    const c = el.cloneNode(true);
    c.querySelectorAll('h3, h4, strong, dt, .spec-n, .layer-n, .pr-n, .ls-n, .sheet-n, .demo-preview, .demo-lock, .tag-row, button, .btn, .btns, .fit-tag, .eyebrow').forEach((x) => x.remove());
    c.querySelectorAll('li, p, dd').forEach((x) => x.append('\u0001'));
    const body = norm(c.textContent).replace(/\s*\u0001\s*$/, '');
    const sents = body ? splitSents(body) : kick ? [] : [norm(el.textContent)];
    return { kick, title: false, bridge, sents, icons: iconsFor(it, sents.length) };
  }
  // the picture for each sentence: data-icons="a|b|c" on the passage (one per sentence, the last one
  // carrying on), or else the one picture of the passage
  function iconsFor(it, n) {
    const list = (it.el.dataset.icons || '').split('|').map((x) => x.trim()).filter(Boolean);
    if (!list.length) list.push(it.icon);
    return Array.from({ length: Math.max(1, n) }, (_, k) => list[Math.min(k, list.length - 1)]);
  }
  // When each picture of a sentence's scene comes in: as its word is written (counted in the subtitle's
  // letters, which leave out spaces). Also which letters are those words, to light them up.
  function sceneTimes(c) {
    const cps = c.title ? CPS * 1.8 : CPS;
    const ns = (str) => str.replace(/ /g, '').length;
    c.trig = [];
    c.span = [];
    c.kws = [];
    c.sents.forEach((sent, k) => {
      const sc = sceneOf(c.icons[k]), len = ns(sent);
      const trig = [], span = [], kws = [];
      sc.flat.forEach((st, q) => {
        let c0 = -1, c1 = -1;
        if (st.kw) {
          const p = sent.indexOf(st.kw);
          if (p >= 0) {
            c0 = ns(sent.slice(0, p));
            c1 = c0 + ns(st.kw) - 1;
            kws.push([c0, c1, st.amber]);
          } else if (window.console) console.warn('naxa: "' + st.kw + '" is not in: ' + sent);
        }
        if (c0 < 0) c0 = c1 = Math.round(((len - 1) * q) / sc.flat.length);
        trig.push((c1 + 1) / cps);
        span.push([c0, c1]);
      });
      c.trig.push(trig);
      c.span.push(span);
      c.kws.push(kws);
    });
  }
  // the picture a passage ends on
  function lastIcon(it) {
    return it.cine ? it.cine.icons[it.cine.icons.length - 1] : it.icon;
  }
  const cineEl = document.createElement('div');
  cineEl.className = 'cine';
  cineEl.setAttribute('aria-hidden', 'true'); // the page's own text is what assistive technology reads
  cineEl.innerHTML = '<p class="cine-kicker"></p><p class="cine-sub"></p>';
  document.body.appendChild(cineEl);
  ['top', 'bot'].forEach((k) => {
    const bar = document.createElement('div');
    bar.className = 'lbox ' + k;
    bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bar);
  });
  const cineKick = $('.cine-kicker', cineEl);
  const cineSub = $('.cine-sub', cineEl);
  const CINE = { on: false, item: null, k: -1, spans: [], n: 0, lo: 0, hi: 0 };

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

  // where an element sits in the page layout, ignoring entrance transforms that have not settled yet
  const docTop = (el) => {
    let y = 0;
    for (let e = el; e; e = e.offsetParent) y += e.offsetTop;
    return y;
  };

  function measureTour() {
    if (!tourEl) return;
    const sy = window.scrollY;
    tcues.forEach((c) => (c.top = c.trig.getBoundingClientRect().top + sy));
    const pad = isMobile ? 14 : Math.round(H * 0.08);
    // the reading area, below the header; on phones passages sit higher, leaving room below for the picture
    const top0 = L.hdr;
    const line = isMobile ? 0.24 : 0.44;
    const avail = Math.max(200, H - top0 - L.ctl - 16);
    const maxY = Math.max(0, doc.scrollHeight - H);
    items.forEach((it) => {
      const r = it.el.getBoundingClientRect();
      it.l = r.left;
      it.t = r.top + sy;
      it.w = r.width;
      it.h = r.height;
      const txt = (it.el.innerText || '').trim();
      const n = ZH ? txt.replace(/\s/g, '').length : txt.split(/\s+/).filter(Boolean).length;
      const rate = ZH ? 10 : 5;
      // typed text starts once the particles have begun their drawing, then lingers a moment to be finished
      it.typeOff = it.card ? 0.3 : it.cine ? 0.4 : it.icon === 'none' ? 0.45 : 0.75;
      it.time =
        it.kind === 'small'
          ? 0.6
          : it.kind === 'form'
            ? 3.2
            : it.kind === 'head'
              ? 0.8 + n * (ZH ? 0.04 : 0.06) + n / (rate * 1.6)
              : it.ch
                ? Math.max(1.2, it.typeOff + it.ch.length / CPS + 0.9)
                : 1 + n / rate;
      // as film subtitles: each sentence is written out, then held a moment
      if (it.cine) {
        if (!it.cine.trig) sceneTimes(it.cine);
        let off = 0;
        const ic = it.cine.icons;
        it.cineOff = it.cine.sents.map((x, k) => {
          const o = off;
          // a sentence stays up until it is written and read, and until its last picture has come in
          let need = x.length / (it.cine.title ? CPS * 1.8 : CPS) + (ZH ? 0.85 : 0.6);
          if (!k || ic[k] !== ic[k - 1]) sceneOf(ic[k]).flat.forEach((st) => (need = Math.max(need, it.cine.trig[k][st.q] + FLY_T + viewOf(st))));
          off += need;
          return o;
        });
        it.cineEnd = off;
        it.time = Math.max(it.time, it.typeOff + off + 0.3, it.cine.kick ? 1.6 : 1.2);
      }
      it.beatT = null;
    });
    // Units: a title card, a narrator line or a form is one unit; any other block is read one passage
    // at a time (its headings, paragraphs, list items, the parts of a case…), like subtitles.
    const units = [];
    $$('[data-stop]', tourEl).forEach((block) => {
      const sec = tsecs.find((x) => x.el.contains(block)) || tsecs[tsecs.length - 1];
      const own = items.filter((it) => block.contains(it.el));
      const parts = own.filter((it) => it.kind !== 'small' && !own.some((o) => o !== it && o.kind !== 'small' && o.el.contains(it.el)));
      if (block.matches('.thead, .bridge, .site-end, .contact-grid') || parts.length < 2) {
        units.push({ sec, els: [block], items: own, card: block.matches('.thead') });
        return;
      }
      let pend = [];
      own.forEach((it) => {
        if (!parts.includes(it)) {
          if (!parts.some((p) => p.el.contains(it.el))) pend.push(it); // a label waits for the next passage
          return;
        }
        units.push({ sec, els: [it.el], items: [...pend, it, ...own.filter((o) => o !== it && it.el.contains(o.el))] });
        pend = [];
      });
      if (pend.length) units[units.length - 1].items.push(...pend);
    });
    const raw = [];
    units.forEach((u) => {
      let top = Infinity, bot = -Infinity;
      u.els.forEach((el) => {
        const r = el.getBoundingClientRect();
        top = Math.min(top, r.top + sy);
        bot = Math.max(bot, r.bottom + sy);
      });
      const h = bot - top;
      const text = u.els.map((el) => el.textContent).join(' ').replace(/\s+/g, ' ').trim();
      const read = ZH ? text.replace(/\s/g, '').length / 11 : text.split(' ').length / 5.6;
      let dwell = u.els[0].dataset.dwell ? parseFloat(u.els[0].dataset.dwell) : clamp(read + 0.7, 2.2, 10);
      if (u.card) dwell = Math.max(dwell, 4.6); // time to watch the title card
      // a title card fills the screen from the top; a passage sits just above the middle of the reading area
      const y0 = u.card ? top - L.hdr - pad : top - (top0 + Math.max(pad * 0.4, (avail - h) * line));
      // a block taller than the screen is panned through in pieces
      const pieces = h > avail ? Math.ceil((h - avail) / (avail * 0.7)) + 1 : 1;
      for (let k = 0; k < pieces; k++) {
        const y = pieces === 1 ? y0 : top - top0 - pad * 0.4 + ((h - avail) * k) / (pieces - 1);
        raw.push({ y: clamp(Math.round(y), 0, maxY), dwell: dwell / pieces, sec: u.sec, els: u.els, items: k === 0 ? u.items : [], card: !!u.card });
      }
    });
    // passages side by side (the same row) are read together
    const steps = [];
    raw.forEach((st) => {
      const prev = steps[steps.length - 1];
      if (prev && prev.sec === st.sec && Math.abs(st.y - prev.y) < 40) {
        prev.dwell += st.dwell;
        prev.els = prev.els.concat(st.els.filter((el) => !prev.els.includes(el)));
        prev.items = prev.items.concat(st.items);
        prev.card = prev.card || st.card;
      } else steps.push({ ...st, els: st.els.slice(), items: st.items.slice() });
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
    // a stop lasts as long as its passages take to appear and be read, one after another
    steps.forEach((st) => {
      if (!st.items.length) return;
      const sum = st.items.reduce((a, it) => a + it.time, 0) + 0.6;
      st.card = st.card || st.items.some((it) => it.card);
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
    steps.forEach((st, i) => {
      st.idx = i;
      st.blocks = [...new Set(st.els.map((el) => el.closest('[data-stop]') || el))];
      st.items.forEach((it) => (it.step = i));
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
    if (beats) typeTour(t - FILM);
  }

  // letters [0, lo) are shown; [lo, hi) are fading in; the rest are hidden (only while on autopilot)
  function typeTour(tau) {
    let wrote = false;
    for (const it of typed) {
      const ch = it.ch;
      const len = ch.length;
      const n = it.beatT == null ? len + FADE : (tau - it.beatT - it.typeOff) * CPS;
      if ((n <= 0 && it.hi === 0 && it.lo === 0) || (n >= len + FADE && it.lo === len && it.hi === len)) continue;
      const lo = clamp(Math.floor(n - FADE), 0, len), hi = clamp(Math.ceil(n), 0, len);
      for (let j = it.lo; j < lo; j++) ch[j].classList.add('on');
      for (let j = lo; j < it.lo; j++) ch[j].classList.remove('on');
      for (let j = it.lo; j < it.hi; j++) {
        ch[j].style.opacity = '';
        ch[j].style.textShadow = '';
      }
      for (let j = lo; j < hi; j++) {
        const o = clamp((n - j) / FADE);
        ch[j].style.opacity = o.toFixed(3);
        ch[j].style.textShadow = `0 0 ${(4 + (1 - o) * 14).toFixed(1)}px rgba(150, 200, 255, ${(0.9 * (1 - o * 0.7)).toFixed(2)})`;
      }
      if (hi > it.hi) wrote = true;
      it.lo = lo;
      it.hi = hi;
    }
    if (wrote) Sound.tick();
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

  const soundBtn = $('#sound');
  if (soundBtn)
    soundBtn.addEventListener('click', () => {
      const on = Sound.toggle();
      soundBtn.setAttribute('aria-pressed', String(on));
      Sound.mood(MOOD.cur);
    });

  const SPEEDS = [1, 1.5, 2];
  speedBtn.addEventListener('click', () => {
    speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    speedBtn.textContent = speed + '×';
  });

  // Switching between the film and the plain page keeps your place: the page opens at the chapter or
  // block that is playing, and the film carries on from whatever you were reading.
  let readY = 0;
  function sceneNow() {
    let cur = scenes[0];
    for (const sc of scenes) if (t >= sc.start - 0.001) cur = sc;
    return cur;
  }
  function readingNow() {
    // on the plain page: the last chapter or block whose top has passed the reading line
    const line = L.hdr + H * 0.2;
    let el = scenes[0].el;
    for (const sc of scenes) if (sc.el.getBoundingClientRect().top <= line) el = sc.el;
    if (tourEl) for (const x of $$('[data-stop]', tourEl)) if (x.getBoundingClientRect().top <= line) el = x;
    return el;
  }
  function setRead(v) {
    let anchor = null, off = 0, scene = null, el = null;
    if (v) {
      if (t < FILM) scene = sceneNow();
      else if (tourEl) {
        const st = stepAt(t - FILM);
        anchor = st ? st.els[0] : $('[data-stop]', tourEl);
        off = anchor.getBoundingClientRect().top;
      }
    } else if (Math.abs(window.scrollY - readY) > 30) el = readingNow(); // moved since opening the page
    readMode = v;
    doc.classList.toggle('read', v);
    updateCine(); // film mode is for playing only
    readBtn.textContent = v ? UI.film : UI.read;
    glide = null;
    if (v) {
      showAllFinal();
      scenes.forEach((s) => {
        s.vis = false;
        s.el.classList.remove('on', 'front');
      });
      measure();
      let y = 0;
      if (anchor) y = anchor.getBoundingClientRect().top + window.scrollY - clamp(off, L.hdr + 12, H * 0.45);
      else if (scene && scene !== scenes[0]) y = $('.wrap', scene.el).getBoundingClientRect().top + window.scrollY - L.hdr - 24;
      window.scrollTo(0, Math.max(0, Math.round(y)));
      readY = window.scrollY;
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
      let nt = t >= TOTAL ? 0 : t;
      if (el) {
        const sc = scenes.find((x) => x.el === el);
        nt = sc ? sc.start + (sc === scenes[0] ? 0 : 0.01) : FILM + tauAt(docTop(el) - L.hdr - (isMobile ? 14 : Math.round(H * 0.08)));
      }
      seek(nt, true);
      setPlaying(true);
      measure();
    }
  }
  readBtn.addEventListener('click', () => setRead(!readMode));

  // picking a problem: marks it, holds the film here for a while ("carry on" lets it go on), and passes
  // the choice on to the agents and the contact form
  const pickGo = $('.pick-go');
  const fitTag = (el, on) => {
    el.classList.toggle('for-you', on);
    const h = $('h3', el);
    let tag = h && $('.fit-tag', h);
    if (on && h && !tag) {
      tag = document.createElement('span');
      tag.className = 'fit-tag';
      tag.textContent = UI.fit;
      h.appendChild(tag);
    } else if (!on && tag) tag.remove();
  };
  function applyPicks() {
    const fit = new Set([...PICK.set].map((k) => [0, 0, 1, 4, 5, 2][k]));
    for (let k = 0; k < 6; k++) fx.fit[k] = fit.has(k) ? 1 : 0;
    $$('.s-sol .node').forEach((el, k) => fitTag(el, fit.has(k)));
    $$('#ai-solutions .spec-row').forEach((el, k) => fitTag(el, fit.has(k)));
    $$('#demo .demo').forEach((el, k) => fitTag(el, fit.has(k)));
    const titles = [...PICK.set].sort().map((k) => $('h3', pains[k]).textContent.trim());
    const msg = titles.length ? UI.wish + titles.join(ZH ? '、' : ', ') + (ZH ? '。' : '.') : '';
    const ta = $('#contact textarea');
    if (ta && (ta.value === '' || ta.value === PICK.msg)) ta.value = msg; // never over what the visitor wrote
    PICK.msg = msg;
  }
  function togglePick(el) {
    const k = +el.dataset.pick;
    if (PICK.set.has(k)) PICK.set.delete(k);
    else PICK.set.add(k);
    el.classList.toggle('picked', PICK.set.has(k));
    el.setAttribute('aria-pressed', String(PICK.set.has(k)));
    applyPicks();
    if (pickGo) pickGo.hidden = PICK.set.size === 0;
    if (playing || resumeAt != null) {
      playing = false;
      resumeAt = tclock + IDLE + 3;
      syncButtons();
    }
    Sound.ping(PICK.set.has(k) ? 1 : 0.6);
  }
  pains.forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      togglePick(el);
    });
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      togglePick(el);
    });
  });
  if (pickGo) pickGo.addEventListener('click', () => setPlaying(true));

  // A click or tap on an empty part of the page releases an idea into the particles (pausing is the
  // play button's job, or the space bar's). The pointer itself parts the particles as it moves.
  const INTERACTIVE = 'a, button, summary, input, textarea, select, label, [role="button"], [data-pick], .ctl, .hdr, #nav, .ask, .demo-modal, .contact-form';
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || !e.target.closest || e.target.closest(INTERACTIVE)) return;
    if (!e.target.closest('#stage, #tour, body')) return;
    const sel = window.getSelection && String(window.getSelection());
    if (sel && sel.length > 1) return; // selecting text, not tapping
    addSpark(e.clientX, e.clientY);
  });
  addEventListener(
    'pointermove',
    (e) => {
      pointerAt(e.clientX, e.clientY);
      if (e.pointerType === 'mouse') {
        PTR.tx = (e.clientX / W - 0.5) * -18;
        PTR.ty = (e.clientY / H - 0.5) * -12;
      }
    },
    { passive: true }
  );
  addEventListener('pointerdown', (e) => pointerAt(e.clientX, e.clientY), { passive: true });
  // on phones that allow it without asking, tilting the phone moves the stars
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission !== 'function') {
    addEventListener(
      'deviceorientation',
      (e) => {
        if (e.gamma == null || e.beta == null) return;
        PTR.tx = clamp(e.gamma / 30, -1, 1) * -14;
        PTR.ty = clamp((e.beta - 45) / 30, -1, 1) * -10;
      },
      { passive: true }
    );
  }

  const typing = (el) => el && el.closest && el.closest('input, textarea, select, [contenteditable="true"]');
  const modalOpen = () => !!$('.demo-modal.is-open');

  // keyboard
  addEventListener('keydown', (e) => {
    if (e.defaultPrevented) return;
    if (menuOpen && e.key === 'Escape') {
      closeAsk();
      return;
    }
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
    } else if ((e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === 'ArrowUp' || e.key === 'PageUp') && onFilm()) {
      e.preventDefault();
      turn(e.key === 'ArrowDown' || e.key === 'PageDown' ? 1 : -1);
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

  // On the film a swipe, a wheel turn or ↓ moves one chapter, like turning a page, instead of scrolling
  // past the whole film at once; from its last chapter the next one carries on into the page below.
  // Whether a gesture turns pages is decided when it starts, so scrolling back up out of the page
  // lands on the film and stops there.
  const onFilm = () => t < FILM && !readMode && !menuOpen && !modalOpen() && !capturing && window.scrollY < 4;
  const ownScroll = (e) => e.target.closest && e.target.closest('#nav, .demo-modal, .ctl, input, textarea, select');
  let lastTurn = 0;
  function turn(dir) {
    const now = performance.now();
    if (now - lastTurn < 450) return;
    lastTurn = now;
    const target = clamp(currentIndex() + dir, 0, chapters.length - 1);
    seek(chapters[target].start + (target === 0 ? 0 : 0.01));
    if (!playing && !ended) setPlaying(true);
  }
  let wheelAt = 0, wheelSum = 0, wheelFilm = false, wheelDone = false;
  addEventListener(
    'wheel',
    (e) => {
      const now = e.timeStamp; // when the event happened, not when a busy frame got round to it
      if (now - wheelAt > 220) {
        // a new gesture (a trackpad keeps sending events while it coasts, so one swipe is one gesture)
        wheelSum = 0;
        wheelDone = false;
        wheelFilm = onFilm() && !ownScroll(e) && !e.ctrlKey;
      }
      wheelAt = now;
      if (!wheelFilm) return grab(e);
      e.preventDefault();
      if (wheelDone) return;
      wheelSum += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      if (Math.abs(wheelSum) >= 40) {
        wheelDone = true;
        turn(Math.sign(wheelSum));
      }
    },
    { passive: false }
  );
  let touch0 = null;
  addEventListener(
    'touchstart',
    (e) => {
      touch0 = e.touches.length === 1 && onFilm() && !ownScroll(e) ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
    },
    { passive: true }
  );
  addEventListener(
    'touchmove',
    (e) => {
      if (touch0 && e.touches.length > 1) touch0 = null; // a pinch is a zoom, not a swipe
      if (!touch0) return grab(e);
      e.preventDefault(); // the film stays put; the swipe is read when the finger lifts
    },
    { passive: false }
  );
  addEventListener(
    'touchend',
    (e) => {
      if (!touch0) return;
      const p = e.changedTouches[0];
      const dx = p.clientX - touch0.x;
      const dy = touch0.y - p.clientY;
      touch0 = null;
      if (Math.abs(dy) > 40 && Math.abs(dy) > Math.abs(dx)) turn(Math.sign(dy));
    },
    { passive: true }
  );
  addEventListener('touchcancel', () => (touch0 = null), { passive: true });

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
    if (readMode) {
      target.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    jumpTo(target, auto);
  });

  // demo buttons open the unlock form: the autopilot waits
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-demo-agent]') && (playing || resumeAt != null)) setPlaying(false);
  });

  // Ask: the visitor types a question and the answer is looked up in this page's own text. A familiar kind
  // of question points at the part of the page about it; anything else is matched word by word against
  // every piece of text; a question the page cannot answer goes into the contact form, ready to send.
  // (The lines around the answers are new; the answers themselves are quoted from the page.)
  const nav = $('#nav');
  const navToggle = $('#navToggle');
  const askForm = $('.ask-form', nav);
  const askInput = $('.ask-input', nav);
  const askLog = $('.ask-log', nav);
  const SAY = ZH
    ? {
        hello: '你好！想了解什么都可以问，比如下面这些。',
        price: '具体价格要看你的业务情况。我们会先从一个小而实用的第一步开始，而不是一上来就做大项目：',
        services: '我们帮小企业做这几类 AI 助手，点名字可以直接看：',
        agent: (n) => `这正是「${n}」做的事：`,
        start: '团队还小也没关系，可以从这里开始：',
        demo: '可以，先看看 Demo：',
        cases: '这里有几个真实场景的例子：',
        about: '先说说我们为什么做这件事：',
        team: '关于我们的团队：',
        review: '第一步通常是 AI 业务诊断：',
        contact: '可以直接在页面最后留下你的问题：',
        human: 'AI 先帮你整理、准备，决定还是由老板来做：',
        found: '页面里最相关的是这一段：',
        handoff: '这个问题当面聊会更清楚。我已经把它填进了联系表单，你只要留个联系方式就行。',
        go: '带我去看 →',
        fill: '去填写 →',
      }
    : {
        hello: 'Hi! Ask anything you would like to know, for example:',
        price: 'Pricing depends on your business. We start with one small, practical first step rather than a large project:',
        services: 'We build these kinds of AI agents for small businesses. Tap a name to see it:',
        agent: (n) => `That is what the ${n} is for:`,
        start: 'A small team is fine. This is where to start:',
        demo: 'Yes, you can preview the demos first:',
        cases: 'Here are a few examples from real situations:',
        about: 'First, why we do this:',
        team: 'About our team:',
        review: 'The first step is usually an AI Business Review:',
        contact: 'You can leave your question at the end of the page:',
        human: 'AI supports the work; people stay in charge:',
        found: 'This is the closest part of the page:',
        handoff: 'That is easier to answer in a conversation. I have put your question into the contact form, so you only need to add your details.',
        go: 'Show me →',
        fill: 'Fill it in →',
      };
  // the kinds of questions people ask, the words that give them away, and where the page answers them
  const INTENTS = [
    { id: 'hello', zh: ['你好', '您好', '嗨', '哈喽', '在吗'], en: ['hello', 'hi ', 'hey', 'good morning'] },
    { id: 'price', zh: ['多少钱', '价格', '收费', '费用', '报价', '预算', '贵', '便宜', '价钱', '成本'], en: ['price', 'pricing', 'cost', 'how much', 'fee', 'budget', 'expensive', 'cheap', 'quote', 'afford'], x: { zh: '#about .practice li:nth-child(3)', en: '#about .practice li:nth-child(2)' }, fill: true },
    { id: 'services', zh: ['能做什么', '可以做什么', '帮我做什么', '能帮我什么', '服务', '做什么的', '提供什么', '有哪些', '产品', '功能', '你们是做'], en: ['what can you', 'what do you do', 'services', 'offer', 'solutions', 'products', 'help me with', 'what do you'], list: true, t: '#ai-solutions' },
    { id: 'agent', zh: ['回复', '回客户', '回消息', '咨询', '客服', '接待助手', '接待', '前台', '漏接', '电话', '私信', '留言', '询价', '慢回'], en: ['reply', 'respond', 'inquir', 'receptionist', 'missed call', 'calls', 'phone', 'front desk', 'customer service', 'messages', 'quote request', 'requests'], t: '#ai-receptionist' },
    { id: 'agent', zh: ['销售跟进助手', '销售', '跟进', '潜在客户', '线索', '成交', '转化', '丢单'], en: ['sales', 'lead', 'follow', 'prospect', 'closing', 'conversion', 'deal'], t: '#ai-sales' },
    { id: 'agent', zh: ['营销助手', '营销', '内容', '文案', '文章', '帖子', '广告', '推广', '社交媒体', '宣传', '小红书', '朋友圈', '公众号', '抖音'], en: ['marketing', 'content', 'post', 'campaign', 'social', 'advert', 'promot', 'copy', 'newsletter', 'blog', 'article'], t: '#ai-marketing' },
    { id: 'agent', zh: ['研究助手', '研究', '调研', '比较', '竞争对手', '对手', '市场分析', '找资料'], en: ['research', 'compare', 'competitor', 'market', 'vendor', 'analysis'], t: '#ai-research' },
    { id: 'agent', zh: ['流程助手', '行政', '流程', '清单', '重复', '交接', '杂事', '表格', '文书'], en: ['admin', 'workflow', 'checklist', 'repetitive', 'handoff', 'paperwork', 'spreadsheet'], t: '#ai-workflow' },
    { id: 'start', zh: ['从哪', '怎么开始', '开始', '第一步', '起步', '刚创业', '创业', '小团队', '团队很小', '人手', '请人', '招人', '雇'], en: ['start', 'begin', 'first step', 'where do i', 'small team', 'startup', 'hire', 'hiring', 'one person'], t: '#startup .thead' },
    { id: 'demo', zh: ['demo', '演示', '试用', '效果', '体验'], en: ['demo', 'try it', 'preview', 'see it', 'trial', 'see how'], t: '#demo .thead' },
    { id: 'cases', zh: ['案例', '例子', '真实', '成功', '别人怎么用'], en: ['case', 'example', 'results', 'success', 'real business', 'stories'], t: '#cases .thead' },
    { id: 'about', zh: ['你们是谁', '关于', '公司', '为什么', '理念', '纳想是'], en: ['who are you', 'about you', 'about naxa', 'your company', 'why', 'mission', 'naxastudio', 'behind'], t: '#about', x: '#about .manifesto' },
    { id: 'team', zh: ['团队', '背景', '经验', '银行', '创始人'], en: ['team', 'background', 'experience', 'bank', 'founder', 'advisor'], t: '#about .reality', x: '#about .reality-cols p:nth-child(2)' },
    { id: 'review', zh: ['诊断', '评估', '怎么合作', '合作', '咨询流程'], en: ['review', 'assessment', 'audit', 'how do you work', 'work together', 'engagement'], t: '#business-review .thead' },
    { id: 'contact', zh: ['联系', '邮箱', '微信', '预约', '聊聊', '见面', '约个'], en: ['contact', 'email', 'call you', 'book', 'meet', 'talk to', 'reach'], t: '#contact .thead', form: true },
    { id: 'human', zh: ['人工', '取代', '替代', '靠谱', '出错', '控制', '失业'], en: ['human', 'replace', 'trust', 'mistake', 'control', 'autopilot', 'jobs'], t: { zh: '#startup .thead', en: '#about .practice li:nth-child(3)' } },
  ];
  const pick = (v) => (v && typeof v === 'object' ? v[ZH ? 'zh' : 'en'] : v);
  const clean = (str) => str.replace(/\s+/g, ' ').trim();
  // a heading and its first real sentence, quoted from the page
  function excerpt(el) {
    const head = el.querySelector('h2, h3, h4, strong');
    const body = $$('p, .t, .spec-d, dd', el).find((x) => !x.matches('.eyebrow') && !x.closest('.demo-preview, .ask') && clean(x.textContent).length > 12);
    let text = body ? clean(body.textContent) : clean(el.textContent);
    const max = ZH ? 150 : 260;
    if (text.length > max) text = text.slice(0, max).replace(/\s+\S*$/, '') + '…';
    return { title: head ? clean(head.textContent) : '', text };
  }
  // anything else: compare the question with every piece of text on the page. Words that appear almost
  // everywhere say nothing; a word the page never uses means the page cannot answer it.
  const STOP = new Set('what when where which with your that this have does about could would should there their from into they them will just like also very more some much than then make need want help know tell show support'.split(' '));
  const ZSTOP = new Set('你们 我们 可以 帮我 什么 怎么 是不 不是 有没 没有 能不 不能 一下 一个 这个 那个 如果 需要 吗'.split(' '));
  const terms = (str) => {
    str = str.toLowerCase();
    if (ZH) {
      const t = str.replace(/[^一-鿿a-z0-9]/g, '');
      const g = [];
      for (let i = 0; i < t.length - 1; i++) g.push(t.slice(i, i + 2));
      return g.filter((w) => !ZSTOP.has(w));
    }
    return (str.match(/[a-z]{4,}/g) || []).filter((w) => !STOP.has(w)).map((w) => w.replace(/(ing|ed|es|s)$/, ''));
  };
  function search(q) {
    const pool = items.filter((it) => it.kind !== 'small' && !it.el.closest('.bridge')).map((it) => ({ el: it.el, txt: it.el.textContent.toLowerCase() }));
    const qt = [...new Set(terms(q))]
      .map((w) => ({ w, df: pool.filter((p) => p.txt.includes(w)).length }))
      .filter((x) => x.df < pool.length * 0.25);
    if (!qt.length) return null;
    let best = null, bs = 0, bn = 0;
    for (const p of pool) {
      let sc = 0, n = 0;
      for (const x of qt) if (x.df && p.txt.includes(x.w)) (sc += Math.log(pool.length / x.df)), n++;
      if (sc > bs) (bs = sc), (bn = n), (best = p.el);
    }
    const need = ZH ? Math.max(2, Math.ceil(qt.length * 0.3)) : Math.max(1, Math.ceil(qt.length * 0.6));
    return bn >= need ? best : null;
  }
  function match(q) {
    const s = ' ' + q.toLowerCase() + ' ';
    let best = null, bs = 0;
    for (const it of INTENTS) {
      let sc = 0;
      for (const k of (ZH ? it.zh.concat(it.en) : it.en)) if (s.includes(k)) sc += k.length;
      if (sc > bs) (bs = sc), (best = it);
    }
    return best;
  }

  let askJumped = false;
  function show(el) {
    if (!el) return;
    jumpTo(el, false);
    askJumped = true;
    el.classList.remove('is-answer');
    void el.offsetWidth;
    el.classList.add('is-answer');
    setTimeout(() => el.classList.remove('is-answer'), 6200);
  }
  function typeInto(el, text, cps) {
    const t0 = performance.now();
    const tick = (now) => {
      const n = Math.min(text.length, Math.floor(((now - t0) / 1000) * cps));
      el.textContent = text.slice(0, n);
      if (n < text.length) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  function button(cls, label, fn) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.textContent = label;
    b.addEventListener('click', fn);
    return b;
  }
  function answer(q) {
    q = q.trim();
    if (!q) return;
    const turn = document.createElement('div');
    turn.className = 'ask-turn';
    const you = document.createElement('p');
    you.className = 'ask-you';
    you.textContent = q;
    const lead = document.createElement('p');
    lead.className = 'ask-lead';
    const acts = document.createElement('div');
    acts.className = 'ask-acts';
    turn.append(you, lead);

    const it = match(q);
    let target = null, quote = null, fill = false;
    if (it && it.id === 'hello') {
      lead.textContent = SAY.hello;
    } else if (it && it.list) {
      lead.textContent = SAY.services;
      const names = document.createElement('div');
      names.className = 'ask-names';
      $$('.spec-row', $(it.t)).forEach((row) => names.append(button('', clean($('h3', row).textContent), () => leave(row))));
      turn.append(names);
      target = $(it.t + ' .thead');
    } else if (it) {
      target = $(pick(it.t) || pick(it.x));
      const ex = excerpt($(pick(it.x) || pick(it.t)));
      lead.textContent = it.id === 'agent' ? SAY.agent(ex.title) : SAY[it.id];
      quote = ex;
      fill = !!it.fill;
      if (it.form) target = $('#contact .contact-panel');
    } else {
      const el = search(q);
      if (el) {
        target = el;
        quote = excerpt(el);
        lead.textContent = SAY.found;
      } else {
        lead.textContent = SAY.handoff;
        fill = true;
      }
    }
    if (quote) {
      const bq = document.createElement('blockquote');
      bq.className = 'ask-quote';
      if (quote.title && !(it && it.id === 'agent')) {
        const st = document.createElement('strong');
        st.textContent = quote.title;
        bq.append(st);
      }
      const tx = document.createElement('span');
      bq.append(tx);
      turn.append(bq);
      typeInto(tx, quote.text, ZH ? 26 : 70);
    }
    if (fill) {
      const ta = $('#contact textarea');
      if (ta) ta.value = PICK.msg && ta.value === PICK.msg ? PICK.msg + '\n' + q : q;
      acts.append(button('ask-go', SAY.fill, () => leave($('#contact .contact-panel'))));
    }
    if (target && !fill) acts.append(button('ask-go', SAY.go, () => leave(target)));
    if (acts.children.length) turn.append(acts);
    // the newest answer sits right under the question box; earlier ones fade below it
    askLog.prepend(turn);
    while (askLog.children.length > 3) askLog.lastChild.remove();
    nav.classList.add('asked');
    nav.scrollTo({ top: 0, behavior: 'smooth' });
    // on a wide screen the page moves to the answer behind the panel straight away
    if (target && !fill && !isMobile && !readMode) show(target);
  }
  askForm.addEventListener('submit', (e) => {
    e.preventDefault();
    answer(askInput.value);
    askInput.value = '';
  });
  $$('.ask-q', nav).forEach((b) => b.addEventListener('click', () => answer(b.textContent)));

  function closeMenu() {
    if (!nav.classList.contains('open')) return;
    menuOpen = false;
    nav.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');
    if (nav.contains(document.activeElement)) document.activeElement.blur(); // Space and the arrows work on the page again
  }
  // closing the panel: carry on playing, or (after an answer) stay on it a while first
  function closeAsk() {
    closeMenu();
    if (!wasPlayingBeforeMenu || readMode) return;
    if (askJumped) {
      playing = false;
      resumeAt = tclock + 1.1 + IDLE;
      syncButtons();
    } else setPlaying(true);
  }
  // an answer's link: close the panel and go to that part of the page
  function leave(el) {
    show(el);
    closeAsk();
  }
  navToggle.addEventListener('click', () => {
    if (nav.classList.contains('open')) return closeAsk();
    menuOpen = true;
    askJumped = false;
    nav.classList.add('open');
    navToggle.setAttribute('aria-expanded', 'true');
    wasPlayingBeforeMenu = playing || resumeAt != null;
    if (playing) setPlaying(false);
    setTimeout(() => askInput.focus({ preventScroll: true }), 60);
  });
  $('.ask-close', nav).addEventListener('click', closeAsk);
  // a click elsewhere on the page closes the panel
  document.addEventListener('click', (e) => {
    if (menuOpen && !nav.contains(e.target) && !navToggle.contains(e.target) && !e.target.closest('.ctl')) closeAsk();
  });

  // While the film plays and nobody touches anything, the header steps back to just the logo.
  let lastAct = 0;
  const wake = () => (lastAct = tclock);
  ['pointermove', 'pointerdown', 'keydown', 'touchstart', 'wheel'].forEach((ev) => addEventListener(ev, wake, { passive: true }));

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
    MOT.fade = TC.since < (tf.spark ? SPARK_END : TDUR + MAXDEL) ? 0.2 : lerp(0.36, 0.13, clamp(Math.abs(MOT.vel) / 1600));
    MOT.spark = null;
    const sp = tf.spark;
    if (sp && TC.since < SPARK_END) {
      // from where the section ended to the new hero, along an arc
      // (kept on screen: the light gathers at the top edge if the text has already scrolled away)
      const y0 = clamp(sp.doc ? sp.y0 - sy : sp.y0, L.hdr + 40, H - L.ctl - 30);
      const x1 = TC.x, y1 = TC.y;
      sp.x0s = sp.x0;
      MOT.spark = sp.scr || (sp.scr = {});
      Object.assign(MOT.spark, {
        x0: sp.x0,
        y0,
        x1,
        y1,
        cx: (sp.x0 + x1) / 2 + (y1 - y0) * 0.22,
        cy: (y0 + y1) / 2 - (x1 - sp.x0) * 0.22,
        c: sp.item ? onScreen(sp.item, sy, SWs) : null,
        icon: sp.item ? lastIcon(sp.item) : null,
      });
    }
    SWARM.relC = SWARM.rel && SWARM.rel.item && tclock - SWARM.rel.t0 < 0.9 ? onScreen(SWARM.rel.item, sy, SWr) : null;
    fieldDim = lerp(fieldDim, lerp(1, isMobile ? 0.14 : 0.4, k), 0.06);
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
      if (focusStep) focusStep.blocks.forEach((el) => el.classList.remove('is-focus'));
      if (st) st.blocks.forEach((el) => el.classList.add('is-focus'));
      // passages already read in the block being read step back a little
      for (const x of items) {
        const past = !!st && x.step != null && x.step < st.idx && st.blocks.some((b) => b.contains(x.el)) && !st.els.some((el) => el.contains(x.el));
        if (x.el.classList.contains('is-past') !== past) x.el.classList.toggle('is-past', past);
      }
      focusStep = st;
    }
    // the bar stands beside the piece being read and fills while it is read
    let it = null;
    if (st) for (const x of st.items) if (x.beatT <= tau) it = x;
    const key = it || st;
    if (key !== focusKey) {
      if (focusKey && focusKey.el) focusKey.el.classList.remove('is-cur');
      if (it) it.el.classList.add('is-cur');
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
  const SWc = {}, SWp = {}, SWs = {}, SWr = {};
  // where the spark between two sections sets off: under the last piece read, or from the hero
  function makeSpark(item) {
    if (item) return { item, doc: true, x0: item.l + item.w / 2, y0: item.t + item.h + 7 };
    return { item: null, doc: false, x0: TC.x, y0: TC.y };
  }
  function onScreen(it, sy, o) {
    o.l = it.l;
    o.t = it.t - sy;
    o.w = it.w;
    o.h = it.h;
    o.x = it.l + it.w / 2;
    o.y = it.t - sy + it.h / 2;
    o.s = clamp(Math.min(it.h, it.w) * 0.6, 44, isMobile ? 70 : 110) * (it.icon === 'storm' ? 1.5 : 1);
    o.frame = it.el.classList.contains('demo');
    return o;
  }
  function swarmUpdate(sy) {
    SWARM.on = false;
    HERO.k = -1;
    if (!((playing || capturing) && !readMode) || t < FILM) return;
    const tau = t - FILM;
    let k = -1;
    const lead = CINE.on ? 1.25 : 0.8;
    for (let j = 0; j < deliveries.length; j++) {
      if (deliveries[j].beatT - lead <= tau) k = j;
      else break;
    }
    if (k < 0) return;
    const cur = deliveries[k];
    // it stays (as an underline) until the page moves on to the next section; a spark takes it there
    if (cur.sec !== sectionAt(sy)) return;
    const prev = k > 0 && deliveries[k - 1].sec === cur.sec ? deliveries[k - 1] : null;
    SWARM.on = true;
    SWARM.last = cur;
    HERO.k = cur.heroK;
    SWARM.d = tau - cur.beatT;
    SWARM.icon = cur.icon;
    SWARM.pIcon = prev ? lastIcon(prev) : null;
    SWARM.c = onScreen(cur, sy, SWc);
    SWARM.p = prev ? onScreen(prev, sy, SWp) : null;
    if (CINE.on && cur.cine) {
      // film mode: the pen writes along the subtitle and rests as a line of light beneath it
      // (also in the moments the swarm is already on its way to a passage whose subtitle is not up yet)
      const r = cineSub.getBoundingClientRect();
      Object.assign(SWc, { l: r.left, t: r.top, w: r.width, h: r.height, x: r.left + r.width / 2, y: r.top + r.height / 2, frame: false });
      SWARM.p = prev ? SWc : null;
      // one scene per sentence: the scene of the sentence being written, its pictures streaming out of
      // their words as they are written; until then the last sentence's scene stays
      const ic = cur.cine.icons;
      const rel = tau - cur.beatT - cur.typeOff;
      let kp = -1;
      for (let j = 0; j < ic.length; j++) if (rel >= cur.cineOff[j]) kp = j;
      const before = kp > 0 ? ic[kp - 1] : prev ? lastIcon(prev) : null;
      if (kp < 0) {
        SWARM.scene = before;
        SWARM.from = null;
        SWARM.now = 99;
      } else {
        SWARM.scene = ic[kp];
        SWARM.from = before;
        SWARM.trig = cur.cine.trig[kp];
        // the same scene as the last sentence's simply stays
        SWARM.now = before === ic[kp] ? 99 : rel - cur.cineOff[kp];
        // where each picture's word is on screen
        const sps = CINE.item === cur && CINE.k === kp ? CINE.spans : null;
        cur.cine.span[kp].forEach((r, q) => {
          const w = SWARM.word[q] || (SWARM.word[q] = { x: 0, y: 0 });
          if (sps && sps.length) {
            const a = sps[clamp(r[0], 0, sps.length - 1)].getBoundingClientRect();
            const b = sps[clamp(r[1], 0, sps.length - 1)].getBoundingClientRect();
            w.x = (a.left + b.right) / 2;
            w.y = (a.top + b.bottom) / 2;
          } else {
            w.x = SWc.x;
            w.y = SWc.y;
          }
        });
      }
      SWARM.icon = SWARM.scene || 'none';
      const sp = CINE.item === cur ? CINE.spans : [];
      SWARM.tS = cur.typeOff;
      SWARM.tE = cur.typeOff + (cur.cineEnd || 0.4);
      if (sp.length) {
        const first = sp[0].getBoundingClientRect();
        SWARM.p0x = first.left;
        SWARM.p0y = first.top + first.height / 2;
        const idx = clamp(Math.floor(CINE.n), 0, sp.length - 1);
        const rr = sp[idx].getBoundingClientRect();
        const fresh = PEN.item !== cur || PEN.k !== CINE.k;
        PEN.item = cur;
        PEN.k = CINE.k;
        PEN.h = rr.height;
        PEN.x = fresh ? first.left : lerp(PEN.x, rr.right, 0.45);
        PEN.y = fresh ? first.top + first.height / 2 : lerp(PEN.y, rr.top + rr.height / 2, 0.45);
        if (fresh) PEN.hist.forEach((h) => ((h.x = PEN.x), (h.y = PEN.y)));
        PEN.head = (PEN.head + 1) % PEN_N;
        PEN.hist[PEN.head].x = PEN.x;
        PEN.hist[PEN.head].y = PEN.y;
      } else {
        SWARM.p0x = SWc.x;
        SWARM.p0y = SWc.y;
      }
      SWARM.lastT = tclock;
      return;
    }
    if (isMobile) {
      // phones: the picture goes in the space between the passage and the controls
      const bottom = SWc.t + SWc.h;
      const room = H - L.ctl - 14 - bottom;
      const k = SWARM.lastT == null || tclock - SWARM.lastT > 0.5 ? 1 : 0.12;
      L.ill.x = lerp(L.ill.x, W * 0.5, k);
      L.ill.y = lerp(L.ill.y, bottom + room * 0.52, k);
      L.ill.s = lerp(L.ill.s, clamp(room * 0.3, 0, W * 0.22), k);
    }
    SWARM.lastT = tclock;
    // the pen follows the letter being typed
    const ch = cur.ch || [];
    SWARM.tS = ch.length ? cur.typeOff : 0.4;
    SWARM.tE = SWARM.tS + ch.length / CPS;
    if (ch.length) {
      const first = ch[0].getBoundingClientRect();
      SWARM.p0x = first.left;
      SWARM.p0y = first.top + first.height / 2;
      const n = (SWARM.d - SWARM.tS) * CPS;
      if (n > 0 && n < ch.length + 1) {
        const r = ch[clamp(Math.floor(n), 0, ch.length - 1)].getBoundingClientRect();
        const fresh = PEN.item !== cur;
        PEN.item = cur;
        const tx = r.right, ty = r.top + r.height / 2;
        PEN.h = r.height;
        PEN.x = fresh ? tx : lerp(PEN.x, tx, 0.45);
        PEN.y = fresh ? ty : lerp(PEN.y, ty, 0.45);
      } else if (n <= 0) {
        PEN.x = SWARM.p0x;
        PEN.y = SWARM.p0y;
        PEN.item = cur;
        PEN.hist.forEach((h) => ((h.x = PEN.x), (h.y = PEN.y)));
      }
      PEN.head = (PEN.head + 1) % PEN_N;
      PEN.hist[PEN.head].x = PEN.x;
      PEN.hist[PEN.head].y = PEN.y;
    } else {
      SWARM.p0x = SWc.x;
      SWARM.p0y = SWc.y;
    }
  }

  // Film mode, every frame: is the autopilot on a passage (not a title card or the form)? Which passage,
  // which of its sentences, and how much of it is written?
  function setCineSentence(it, k) {
    CINE.k = k;
    const txt = k >= 0 && it.cine.sents[k] ? it.cine.sents[k] : '';
    const frag = document.createDocumentFragment();
    CINE.spans = [];
    for (const c of Array.from(txt)) {
      if (c === ' ') {
        frag.appendChild(document.createTextNode(' '));
        continue;
      }
      const sp = document.createElement('span');
      sp.className = 'cc';
      sp.textContent = c;
      frag.appendChild(sp);
      CINE.spans.push(sp);
    }
    // the words the pictures come out of are lit
    const kws = k >= 0 && it.cine.kws ? it.cine.kws[k] : null;
    if (kws)
      kws.forEach(([c0, c1, hot]) => {
        for (let j = c0; j <= c1 && j < CINE.spans.length; j++) CINE.spans[j].classList.add('kw', ...(hot ? ['hot'] : []));
      });
    cineSub.textContent = '';
    cineSub.appendChild(frag);
    CINE.lo = CINE.hi = 0;
  }
  function updateCine() {
    const tau = t - FILM;
    const st = (playing || capturing) && !readMode && t >= FILM ? stepAt(tau) : null;
    const on = !!st && !st.card && st.items.some((x) => x.cine);
    if (on !== CINE.on) {
      CINE.on = on;
      doc.classList.toggle('is-cine', on);
      SWARM_FRAC = on ? 0.7 : 0.42;
      ILL_FRAC = on ? 0.88 : 0.62;
    }
    let it = null;
    if (on) for (const x of st.items) if (x.cine && x.beatT - 1.25 <= tau) it = x;
    if (it !== CINE.item) {
      CINE.item = it;
      cineKick.classList.remove('in');
      cineSub.className = 'cine-sub' + (it && it.cine.title ? ' is-title' : '') + (it && it.cine.bridge ? ' is-bridge' : '');
      setCineSentence(it || { cine: { sents: [] } }, -1);
      if (it) {
        const fit = it.el.classList.contains('for-you') ? '  ·  ' + UI.fit : '';
        cineKick.textContent = it.cine.kick + fit;
      }
    }
    cineEl.classList.toggle('on', !!it);
    if (!it) return;
    const rel = tau - it.beatT - it.typeOff;
    cineKick.classList.toggle('in', tau - it.beatT > -0.2 && !!cineKick.textContent);
    // which sentence: the last one whose turn has come
    let k = -1;
    it.cineOff.forEach((o, j) => {
      if (rel >= o) k = j;
    });
    if (k !== CINE.k) setCineSentence(it, k);
    if (k < 0) return;
    const cps = it.cine.title ? CPS * 1.8 : CPS;
    const n = (rel - it.cineOff[k]) * cps;
    CINE.n = n;
    const sp = CINE.spans, len = sp.length;
    const lo = clamp(Math.floor(n - FADE), 0, len), hi = clamp(Math.ceil(n), 0, len);
    for (let j = CINE.lo; j < lo; j++) {
      sp[j].classList.add('on');
      sp[j].style.opacity = '';
      sp[j].style.textShadow = '';
    }
    for (let j = lo; j < hi; j++) {
      const o = clamp((n - j) / FADE);
      sp[j].style.opacity = o.toFixed(3);
      sp[j].style.textShadow = `0 0 ${(4 + (1 - o) * 16).toFixed(1)}px rgba(150, 200, 255, ${(0.9 * (1 - o * 0.7)).toFixed(2)})`;
    }
    if (hi > CINE.hi) Sound.tick();
    CINE.lo = lo;
    CINE.hi = hi;
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

    pointerFrame();
    if (sy < H * 0.5) {
      if (CINE.on) updateCine();
      setMood(frontScene.id);
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
      setMood(sec ? sec.id : 'about');
      const want = sec ? sec.form : 'dust';
      if (fieldMode !== 'tour') {
        fieldMode = 'tour';
        filmBlend = null;
        tf = { cur: want, prev: forms[formIndex(ft)].name, t0: tclock };
      }
      const wasOn = SWARM.on;
      updateCine();
      swarmUpdate(sy);
      if (want !== tf.cur) {
        tf = { cur: want, prev: tf.cur, t0: tclock, spark: makeSpark(wasOn && !SWARM.on ? SWARM.last : null) };
        Sound.whoosh();
      } else if (wasOn && !SWARM.on) {
        SWARM.rel = { t0: tclock, item: SWARM.last, icon: SWARM.icon };
      }
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
    Sound.level(document.hidden ? 0 : playing && !readMode ? 0.55 : 0.18);
    doc.classList.toggle('chrome-rest', playing && !readMode && !menuOpen && !modalOpen() && tclock - lastAct > 2.6);
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
      pointerFrame();
      setMood(sec ? sec.id : 'night');
      const want = sec ? sec.form : 'calm';
      if (fieldMode !== 'read') {
        fieldMode = 'read';
        tf = { cur: want, prev: null, t0: tclock };
      } else if (want !== tf.cur) tf = { cur: want, prev: tf.cur, t0: tclock, spark: sec && tsecs.some((x) => x.form === tf.cur) ? makeSpark(null) : null };
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
    get swarm() {
      return { on: SWARM.on, scene: SWARM.scene, from: SWARM.from, now: SWARM.now, cine: CINE.on, item: CINE.item && CINE.item.cine.sents[0] };
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
