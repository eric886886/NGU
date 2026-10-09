// Builds the self-contained page: inlines src/motion.css, src/motion.js, the logo icon and the
// sampled logo points into ./index.html (no other files are needed to open it).
// Usage: node tools/build.js
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let html = read('src/index.html');
const css = read('src/motion.css');
const js = read('src/motion.js');
const icon = read('assets/logo-icon.txt').trim();
const points = read('assets/logo-points.json').trim();

const swap = (from, to) => {
  if (!html.includes(from)) throw new Error('build: missing ' + from);
  html = html.split(from).join(to);
};
swap('<link rel="stylesheet" href="motion.css" />', `<style>\n${css}</style>`);
swap('<script src="motion.js"></script>', `<script>\n${js}</script>`);
swap('{{LOGO_ICON}}', icon);
swap('{{LOGO_POINTS}}', points);

fs.writeFileSync(path.join(root, 'index.html'), html);
console.log(`index.html written (${(html.length / 1024).toFixed(1)} KB)`);
