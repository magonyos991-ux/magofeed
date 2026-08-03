// Rend les vidéos promo Magofeed en fichiers.
// Usage :
//   node promo/render.mjs            -> WebM (fonctionne partout, ffmpeg non requis)
//   node promo/render.mjs --mp4      -> WebM puis transcode en MP4 H.264 (nécessite un ffmpeg dans le PATH)
//
// Prérequis : npm i playwright  (les navigateurs sont déjà présents dans l'env. Claude ;
//             en local : npx playwright install chromium)

import { chromium } from 'playwright';
import { pathToFileURL } from 'url';
import { spawnSync, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.join(DIR, 'out');
fs.mkdirSync(OUT, { recursive: true });

const wantMp4 = process.argv.includes('--mp4');

const targets = [
  { file: 'video-pub.html',       out: 'magofeed-9x16',        w: 1080, h: 1920, dur: 22800 },
  { file: 'video-pub-16x9.html',  out: 'magofeed-16x9',        w: 1920, h: 1080, dur: 22800 },
  { file: 'bumper.html',          out: 'magofeed-bumper-9x16', w: 1080, h: 1920, dur: 7000  },
  { file: 'video-tiktok-edm.html', out: 'magofeed-tiktok-edm',  w: 1080, h: 1920, dur: 18750 },
  { file: 'video-hook-8s.html',    out: 'magofeed-hook-8s',     w: 1080, h: 1920, dur: 8000  },
];

// force le "stage" à remplir toute la frame (pas de letterbox), et masque les contrôles
const OVERRIDE = `
  html,body{margin:0!important;padding:0!important;background:#100e0c!important;overflow:hidden!important}
  .stage-wrap{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;max-width:none!important;aspect-ratio:auto!important;height:100dvh!important}
  .stage{position:fixed!important;inset:0!important;border-radius:0!important}
  .ctrl,.soundtag{display:none!important}
  button[aria-label^="Activer"],button[aria-label^="Couper"]{display:none!important}
`;

function hasFfmpeg() {
  const r = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  return r.status === 0;
}

// `trim` = secondes à couper au début (pré-roll : chargement de la page).
async function transcode(webm, mp4, trim, dur) {
  const wav = path.join(OUT, 'magofeed-theme.wav');   // bande-son (make-music.mjs)
  const hasAudio = fs.existsSync(wav);
  const args = ['-y'];
  if (trim > 0) args.push('-ss', trim.toFixed(3));
  args.push('-i', webm);
  if (hasAudio) args.push('-stream_loop', '-1', '-i', wav);   // boucle la musique sur la durée
  args.push('-t', dur.toFixed(3));
  args.push('-c:v', 'libx264', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-crf', '18',
            '-profile:v', 'high', '-level', '4.0');
  if (hasAudio) {
    args.push('-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '192k',
              '-af', `afade=t=out:st=${Math.max(0, dur - 0.8).toFixed(2)}:d=0.8`, '-shortest');
  }
  args.push('-movflags', '+faststart', mp4);
  return new Promise((res, rej) => {
    const ff = spawn('ffmpeg', args, { stdio: 'ignore' });
    ff.on('close', c => c === 0 ? res() : rej(new Error('ffmpeg exit ' + c)));
  });
}

// Page d'attente (même fond que les vidéos) : l'enregistreur démarre dessus,
// on ne navigue vers la vidéo qu'une fois la capture stabilisée.
const HOLD = 'data:text/html,<body style="margin:0;background:%23100e0c"></body>';

// PW_CHROME permet de pointer un Chromium déjà installé (utile si la version de
// Playwright ne correspond pas aux navigateurs présents sur la machine).
function findChrome() {
  if (process.env.PW_CHROME) return process.env.PW_CHROME;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !fs.existsSync(root)) return undefined;
  const dir = fs.readdirSync(root).filter(d => /^chromium-\d+$/.test(d)).sort().pop();
  if (!dir) return undefined;
  const bin = path.join(root, dir, 'chrome-linux', 'chrome');
  return fs.existsSync(bin) ? bin : undefined;
}

const browser = await chromium.launch({ executablePath: findChrome() });
for (const t of targets) {
  const ctx = await browser.newContext({
    viewport: { width: t.w, height: t.h },
    deviceScaleFactor: 1,
    recordVideo: { dir: OUT, size: { width: t.w, height: t.h } },
    reducedMotion: 'no-preference',
  });
  // injecté AVANT le 1er script de la page : l'overlay « Activer le son »
  // n'apparaît jamais, même une frame.
  await ctx.addInitScript(css => {
    const add = () => {
      const s = document.createElement('style');
      s.textContent = css;
      (document.head || document.documentElement).appendChild(s);
    };
    if (document.documentElement) add();
    else document.addEventListener('readystatechange', add, { once: true });
  }, OVERRIDE);

  const page = await ctx.newPage();
  const recStart = Date.now();               // ≈ début de l'enregistrement
  await page.goto(HOLD);
  await page.waitForTimeout(900);            // laisse la capture s'amorcer

  await page.goto(pathToFileURL(path.join(DIR, t.file)).href, { waitUntil: 'load' });
  // resynchronise les scènes sur l'instant présent quand la vidéo l'expose
  await page.evaluate(() => {
    if (window.MagoFeedVideo && window.MagoFeedVideo.restart) window.MagoFeedVideo.restart();
  });
  const t0 = Date.now();                     // image 1 de la vidéo finale
  await page.waitForTimeout(t.dur);          // durée d'un cycle complet
  const video = page.video();
  await ctx.close();                         // finalise le webm
  const webmPath = path.join(OUT, t.out + '.webm');
  await video.saveAs(webmPath);
  console.log('✓ ' + path.basename(webmPath));

  if (wantMp4) {
    if (hasFfmpeg()) {
      const mp4Path = path.join(OUT, t.out + '.mp4');
      // 0,15 s de marge : mieux vaut garder une image de fond que rogner la scène 1
      const trim = Math.max(0, (t0 - recStart) / 1000 - 0.15);
      await transcode(webmPath, mp4Path, trim, t.dur / 1000);
      console.log('✓ ' + path.basename(mp4Path));
    } else {
      console.log('⚠  ffmpeg introuvable dans le PATH — MP4 ignoré (webm conservé).');
    }
  }
}
await browser.close();
console.log('\nTerminé. Fichiers dans : ' + OUT);
