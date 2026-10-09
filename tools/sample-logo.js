// Samples the NaxaStudio logo mark into particle target points for the motion page.
// Usage: node tools/sample-logo.js [count]  (needs Playwright; writes assets/logo-points.json)
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PW || 'playwright');

const COUNT = +(process.argv[2] || 2600);
const root = path.join(__dirname, '..');
const src = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(root, 'assets/naxastudio-logo.jpg')).toString('base64');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const out = await page.evaluate(async ({ src, COUNT }) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const S = 420;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, S, S);
    const { data } = g.getImageData(0, 0, S, S);
    // Only the mark: the wordmark starts at ~71% of the height.
    const yMax = Math.floor(S * 0.69);
    const cand = [];
    let minX = S, minY = S, maxX = 0, maxY = 0;
    for (let y = 0; y < yMax; y++) {
      for (let x = 0; x < S; x++) {
        const k = (y * S + x) * 4;
        const r = data[k] / 255, gg = data[k + 1] / 255, b = data[k + 2] / 255;
        const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
        const l = (mx + mn) / 2;
        const sat = mx - mn;
        if (l > 0.9 && sat < 0.12) continue; // background
        if (l > 0.86 && sat < 0.2) continue; // faint halo
        let h = 0;
        if (sat > 0) {
          if (mx === r) h = ((gg - b) / sat) % 6;
          else if (mx === gg) h = (b - r) / sat + 2;
          else h = (r - gg) / sat + 4;
          h *= 60;
          if (h < 0) h += 360;
        }
        // Glow palette index: 0 white-blue core, 1 light azure, 2 brand blue, 3 indigo, 4 teal arrow
        let ci;
        if (h > 165 && h < 200 && sat > 0.35) ci = 4;
        else if (l < 0.3) ci = 0;
        else if (l < 0.5) ci = 2;
        else if (l < 0.7) ci = 3;
        else ci = 1;
        cand.push([x, y, ci]);
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    // Deterministic shuffle so the same build gives the same page.
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = cand.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [cand[i], cand[j]] = [cand[j], cand[i]];
    }
    const span = Math.max(maxX - minX, maxY - minY);
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const pts = cand.slice(0, COUNT).map(([x, y, ci]) => [
      Math.round(((x - cx) / span) * 1000),
      Math.round(((y - cy) / span) * 1000),
      ci,
    ]);
    // Small mark-only icon for the header (blank out the wordmark first).
    g.fillStyle = '#fff';
    g.fillRect(0, yMax, S, S - yMax);
    const pad = 10;
    const ic = document.createElement('canvas');
    ic.width = ic.height = 96;
    const ig = ic.getContext('2d');
    ig.fillStyle = '#fff';
    ig.fillRect(0, 0, 96, 96);
    const side = span + pad * 2;
    ig.drawImage(c, cx - side / 2, cy - side / 2, side, side, 0, 0, 96, 96);
    return { candidates: cand.length, aspect: (maxX - minX) / (maxY - minY), pts, icon: ic.toDataURL('image/jpeg', 0.86) };
  }, { src, COUNT });
  await browser.close();
  fs.writeFileSync(path.join(root, 'assets/logo-points.json'), JSON.stringify({ aspect: out.aspect, pts: out.pts }));
  fs.writeFileSync(path.join(root, 'assets/logo-icon.txt'), out.icon);
  console.log(`candidates=${out.candidates} sampled=${out.pts.length} aspect=${out.aspect.toFixed(3)} icon=${out.icon.length}B`);
})();
