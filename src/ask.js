// Ask: a visitor types a question (or picks one) and gets an answer in the site's own words, with a way to see
// it: a stage of the home page ("go") or the page that says more ("open"). The answers are in the page, in
// <script type="application/json" id="ask-data">: items of { k: [words to look for], a: answer, go?: stage,
// href?, label? }, and a fallback.
export function initAsk(jump) {
  const btn = document.getElementById('askBtn'), box = document.getElementById('ask');
  const src = document.getElementById('ask-data');
  if (!btn || !box || !src) return;
  const data = JSON.parse(src.textContent);
  const input = box.querySelector('.ask-input'), log = box.querySelector('.ask-log');
  const open = (on) => {
    box.classList.toggle('open', on);
    btn.setAttribute('aria-expanded', on ? 'true' : 'false');
    if (on) setTimeout(() => input.focus(), 80);
    else if (box.contains(document.activeElement)) document.activeElement.blur();
  };
  btn.addEventListener('click', () => open(!box.classList.contains('open')));
  box.querySelector('.ask-close').addEventListener('click', () => open(false));
  addEventListener('keydown', (e) => e.key === 'Escape' && box.classList.contains('open') && open(false));

  const find = (q) => {
    const n = q.toLowerCase();
    let best = null, score = 0;
    for (const it of data.items) {
      let s = 0;
      for (const k of it.k) if (n.includes(k.toLowerCase())) s += k.length;
      if (s > score) (score = s), (best = it);
    }
    return best || data.fallback;
  };
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const ask = (q) => {
    q = q.trim();
    if (!q) return;
    const it = find(q);
    log.appendChild(el('p', 'ask-you', q));
    const a = el('div', 'ask-ans');
    a.appendChild(el('p', null, it.a));
    const acts = el('div', 'ask-acts');
    if (it.go != null) {
      const b = el('button', 'ask-go', data.go);
      b.type = 'button';
      b.addEventListener('click', () => {
        open(false);
        jump(it.go);
      });
      acts.appendChild(b);
    }
    if (it.href) {
      const l = el('a', 'ask-open', it.label || data.open);
      l.href = it.href;
      acts.appendChild(l);
    }
    a.appendChild(acts);
    log.appendChild(a);
    box.classList.add('asked');
    log.scrollTop = log.scrollHeight;
  };
  box.querySelector('.ask-form').addEventListener('submit', (e) => {
    e.preventDefault();
    ask(input.value);
    input.value = '';
  });
  box.querySelectorAll('.ask-q').forEach((b) => b.addEventListener('click', () => ask(b.textContent)));
}
