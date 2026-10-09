// Builds the self-contained pages: inlines src/motion.css, src/motion.js, the logo icon and the
// sampled logo points into ./index.html and ./zh.html (no other files are needed to open them).
// Usage: node tools/build.js
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const css = read('src/motion.css');
const js = read('src/motion.js');
const icon = read('assets/logo-icon.txt').trim();
const points = read('assets/logo-points.json').trim();

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
  swap('{{LOGO_ICON}}', icon);
  swap('{{LOGO_POINTS}}', points);
  fs.writeFileSync(path.join(root, out), html);
  console.log(`${out} written (${(html.length / 1024).toFixed(1)} KB)`);
}
