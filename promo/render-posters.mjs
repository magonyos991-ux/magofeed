// Exporte les visuels fixes (PNG) depuis posters.html.
// Usage : node promo/render-posters.mjs
import { chromium } from 'playwright';
import { pathToFileURL } from 'url';
import path from 'path';
import fs from 'fs';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.join(DIR, 'out');
fs.mkdirSync(OUT, { recursive: true });

const shots = [
  { id: 'story',  out: 'story-1080x1920.png' },
  { id: 'square', out: 'square-1080x1080.png' },
  { id: 'banner', out: 'banner-1200x630.png' },
];

const browser = await chromium.launch({ executablePath: process.env.PW_CHROME });
const page = await browser.newPage({ deviceScaleFactor: 2 }); // x2 = PNG net
await page.goto(pathToFileURL(path.join(DIR, 'posters.html')).href, { waitUntil: 'load' });
await page.waitForTimeout(300);
for (const s of shots) {
  const el = await page.$('#' + s.id);
  await el.screenshot({ path: path.join(OUT, s.out) });
  console.log('✓ ' + s.out);
}
await browser.close();
console.log('\nTerminé. PNG dans : ' + OUT);
