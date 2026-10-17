// Builds the sample of the home page as one journey (./sample-zh.html) from src/sample-zh.html and src/flow.js,
// the same way tools/build.js builds the home pages.
// Usage: node tools/build-sample.js
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const dataUrl = (p, type) => `data:${type};base64,` + fs.readFileSync(path.join(root, p)).toString('base64');

const bundle = esbuild.buildSync({
  entryPoints: [path.join(root, 'src/flow.js')],
  bundle: true,
  format: 'iife',
  minify: true,
  target: ['es2020'],
  legalComments: 'none',
  write: false,
});
const js = bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
let html = read('src/sample-zh.html');
const swap = (from, to) => {
  if (!html.includes(from)) throw new Error(`build: src/sample-zh.html is missing ${from}`);
  html = html.split(from).join(to);
};
swap('<link rel="stylesheet" href="world.css" />', `<style>\n${read('src/world.css')}</style>`);
swap('{{WORLD_JS}}', js);
swap('{{LOGO_ICON}}', read('assets/logo-icon.txt').trim());
swap('{{MARK}}', dataUrl('assets/brand/mark.jpg', 'image/jpeg'));
swap('{{FAVICON}}', dataUrl('assets/brand/favicon-32.png', 'image/png'));
fs.writeFileSync(path.join(root, 'sample-zh.html'), html);
console.log(`sample-zh.html written (${(html.length / 1024).toFixed(1)} KB)`);
