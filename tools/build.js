// Builds the self-contained home pages ./index.html (English) and ./zh.html (Chinese) from src/: bundles
// src/world.js with three.js (esbuild) and inlines it, src/world.css, the favicon, the logo tile and the logo mark
// the particles are sampled from. No other files are needed to open them (the share images and the touch icon in
// assets/brand/ are only fetched by link previews and home screens).
// Usage: npm install, then npm run build
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const dataUrl = (p, type) => `data:${type};base64,` + fs.readFileSync(path.join(root, p)).toString('base64');

const bundle = esbuild.buildSync({
  entryPoints: [path.join(root, 'src/world.js')],
  bundle: true,
  format: 'iife',
  minify: true,
  target: ['es2020'],
  legalComments: 'none',
  write: false,
});
// (a closing script tag inside the code would end the inline script early)
const js = bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = read('src/world.css');
const icon = read('assets/logo-icon.txt').trim();
const mark = dataUrl('assets/brand/mark.jpg', 'image/jpeg');
const favicon = dataUrl('assets/brand/favicon-32.png', 'image/png');

for (const [src, out] of [
  ['src/index.html', 'index.html'],
  ['src/zh.html', 'zh.html'],
]) {
  let html = read(src);
  const swap = (from, to) => {
    if (!html.includes(from)) throw new Error(`build: ${src} is missing ${from}`);
    html = html.split(from).join(to);
  };
  swap('<link rel="stylesheet" href="world.css" />', `<style>\n${css}</style>`);
  swap('{{WORLD_JS}}', js);
  swap('{{LOGO_ICON}}', icon);
  swap('{{MARK}}', mark);
  swap('{{FAVICON}}', favicon);
  fs.writeFileSync(path.join(root, out), html);
  console.log(`${out} written (${(html.length / 1024).toFixed(1)} KB)`);
}
