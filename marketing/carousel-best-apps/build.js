// Renders the remixed carousel to slides/slide-0N.jpg (1080x1380).
//   Slides 2-5 are the original slides, copied unchanged.
//   Slides 1, 6, 7, 8 are rendered from src/*.html.
// Run from anywhere:  NODE_PATH="$(npm root -g)" node marketing/carousel-best-apps/build.js
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const SRC = path.join(__dirname, 'src');
const OUT = path.join(__dirname, 'slides');
const RENDERED = ['01', '06', '07', '08'];
const COPIED = ['02', '03', '04', '05'];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const n of COPIED) {
    fs.copyFileSync(path.join(SRC, 'originals', `slide-${n}.jpg`), path.join(OUT, `slide-${n}.jpg`));
  }
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1380 } });
  for (const n of RENDERED) {
    await page.goto('file://' + path.join(SRC, `slide-${n}.html`));
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(OUT, `slide-${n}.jpg`), type: 'jpeg', quality: 95 });
    console.log(`slide-${n}.jpg`);
  }
  await browser.close();
})();
