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

async function transcode(webm, mp4) {
  const wav = path.join(OUT, 'magofeed-theme.wav');   // bande-son (make-music.mjs)
  const hasAudio = fs.existsSync(wav);
  const args = ['-y', '-i', webm];
  if (hasAudio) args.push('-stream_loop', '-1', '-i', wav);   // boucle la musique sur la durée
  args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18');
  if (hasAudio) args.push('-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '192k', '-shortest');
  args.push('-movflags', '+faststart', mp4);
  return new Promise((res, rej) => {
    const ff = spawn('ffmpeg', args, { stdio: 'ignore' });
    ff.on('close', c => c === 0 ? res() : rej(new Error('ffmpeg exit ' + c)));
  });
}

const browser = await chromium.launch({ executablePath: process.env.PW_CHROME });
for (const t of targets) {
  const ctx = await browser.newContext({
    viewport: { width: t.w, height: t.h },
    deviceScaleFactor: 1,
    recordVideo: { dir: OUT, size: { width: t.w, height: t.h } },
  });
  const page = await ctx.newPage();
  await page.goto(pathToFileURL(path.join(DIR, t.file)).href, { waitUntil: 'load' });
  await page.addStyleTag({ content: OVERRIDE });
  await page.waitForTimeout(400);            // laisse la 1re scène s'installer
  await page.waitForTimeout(t.dur);          // durée d'un cycle complet
  const video = page.video();
  await ctx.close();                         // finalise le webm
  const webmPath = path.join(OUT, t.out + '.webm');
  await video.saveAs(webmPath);
  console.log('✓ ' + path.basename(webmPath));

  if (wantMp4) {
    if (hasFfmpeg()) {
      const mp4Path = path.join(OUT, t.out + '.mp4');
      await transcode(webmPath, mp4Path);
      console.log('✓ ' + path.basename(mp4Path));
    } else {
      console.log('⚠  ffmpeg introuvable dans le PATH — MP4 ignoré (webm conservé).');
    }
  }
}
await browser.close();
console.log('\nTerminé. Fichiers dans : ' + OUT);
