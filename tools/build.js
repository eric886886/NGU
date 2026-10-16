// Builds the self-contained pages: inlines src/motion.css, src/motion.js, the logo icon, the favicon and
// the sampled logo points into ./index.html and ./zh.html (no other files are needed to open them; the
// share images and touch icon in assets/brand/ are only fetched by link previews and home screens).
// Usage: node tools/build.js
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const css = read('src/motion.css');
const js = read('src/motion.js');
const demoJs = read('src/demo-center.js'); // unchanged copy of naxastudio.com/js/demo-center.js
const icon = read('assets/logo-icon.txt').trim();
const points = read('assets/logo-points.json').trim();
const favicon = 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'assets/brand/favicon-32.png')).toString('base64');

for (const [src, out] of [
  ['src/index.html', 'index.html'],
  ['src/zh.html', 'zh.html'],
]) {
  let html = read(src);
  const swap = (from, to) => {
    if (!html.includes(from)) throw new Error(`build: ${src} is missing ${from}`);
    html = html.split(from).join(to);
  };
  swap('<link rel="stylesheet" href="motion.css" />', `<style>\n${css}</style>`);
  swap('<script src="motion.js"></script>', `<script>\n${js}</script>`);
  if (html.includes('<script src="demo-center.js"></script>')) swap('<script src="demo-center.js"></script>', `<script>\n${demoJs}</script>`);
  swap('{{LOGO_ICON}}', icon);
  swap('{{LOGO_POINTS}}', points);
  swap('{{FAVICON}}', favicon);
  fs.writeFileSync(path.join(root, out), html);
  console.log(`${out} written (${(html.length / 1024).toFixed(1)} KB)`);
}
