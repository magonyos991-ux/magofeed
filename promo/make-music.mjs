// Génère la bande-son Magofeed en WAV (pur Node, sans dépendance).
// Même progression que audio-engine.js : F#m – D – A – E – D – A.
// Usage : node promo/make-music.mjs   ->  out/magofeed-theme.wav
import fs from 'fs';
import path from 'path';

const SR = 44100;
const DIR = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.join(DIR, 'out'); fs.mkdirSync(OUT, { recursive: true });

const SCENES = [3400, 3200, 4800, 4000, 4400, 4600];           // ms
const CHORDS = [
  { bass: 92.50,  notes: [185.00, 220.00, 277.18], top: 369.99 }, // F#m
  { bass: 73.42,  notes: [146.83, 185.00, 220.00], top: 293.66 }, // D
  { bass: 110.00, notes: [220.00, 277.18, 329.63], top: 440.00 }, // A
  { bass: 82.41,  notes: [164.81, 207.65, 246.94], top: 329.63 }, // E
  { bass: 73.42,  notes: [146.83, 185.00, 220.00], top: 293.66 }, // D
  { bass: 110.00, notes: [220.00, 277.18, 329.63], top: 440.00 }, // A
];

const total = SCENES.reduce((a, c) => a + c, 0) / 1000;
const N = Math.ceil((total + 1.8) * SR);      // + queue pour release/cloche
const L = new Float32Array(N), R = new Float32Array(N);

const pan2 = p => { const th = (p + 1) / 2 * Math.PI / 2; return [Math.cos(th), Math.sin(th)]; };
const wave = (type, ph) => type === 'sine' ? Math.sin(ph)
  : type === 'tri' ? (2 / Math.PI) * Math.asin(Math.sin(ph))
  : (2 * (((ph / (2 * Math.PI)) % 1)) - 1); // saw

// voix générique : sus==null -> AD (pluck) ; sinon ADSR (pad)
function voice(start, dur, freq, type, peak, pan, att, dec, sus = null, rel = 0.3) {
  const [lg, rg] = pan2(pan);
  const s0 = Math.floor(start * SR), s1 = Math.floor((start + dur + rel) * SR);
  for (let i = Math.max(0, s0); i < s1 && i < N; i++) {
    const t = (i - s0) / SR;
    let env;
    if (sus == null) {
      env = t < att ? (t / att) * peak : peak * Math.exp(-(t - att) / (dec / 3));
    } else {
      if (t < att) env = (t / att) * peak;
      else if (t < att + dec) env = peak - (peak - peak * sus) * ((t - att) / dec);
      else if (t < dur) env = peak * sus;
      else env = peak * sus * Math.max(0, 1 - (t - dur) / rel);
    }
    const v = wave(type, 2 * Math.PI * freq * t) * env;
    L[i] += v * lg; R[i] += v * rg;
  }
}

// ---- composition ----
let cum = [], acc = 0;
for (const d of SCENES) { cum.push(acc); acc += d / 1000; }

for (let s = 0; s < SCENES.length; s++) {
  const ch = CHORDS[s % CHORDS.length], st = cum[s], du = SCENES[s] / 1000;
  // pad (nappe) : accords doux, deux triangles légèrement désaccordés
  [...ch.notes, ch.top].forEach((f, k) => {
    voice(st, du, f,          'tri', 0.045, (k % 2 ? 0.2 : -0.2), 0.5, 0.3, 0.55, 0.5);
    voice(st, du, f * 1.004,  'tri', 0.032, (k % 2 ? -0.2 : 0.2), 0.5, 0.3, 0.55, 0.5);
  });
  // basse : pulsations à la blanche
  for (let tt = st; tt < st + du - 0.05; tt += 0.6) voice(tt, 0.5, ch.bass, 'sine', 0.17, 0, 0.01, 0.5);
  // ping radar au changement de scène
  voice(st, 0.5, ch.notes[2] * 2, 'sine', 0.11, 0, 0.005, 0.45);
  // cloche finale (CTA)
  if (s === SCENES.length - 1) [ch.notes[0] * 2, ch.notes[1] * 2, ch.notes[2] * 2]
    .forEach((f, i) => voice(st + 0.15 + i * 0.13, 1.5, f, 'sine', 0.16, 0, 0.006, 1.5));
}

// arpège 8th-notes
let k = 0;
for (let tt = 0; tt < total - 0.05; tt += 0.3) {
  let sc = 0; for (let j = 0; j < cum.length; j++) if (tt >= cum[j]) sc = j;
  const ch = CHORDS[sc % CHORDS.length], pool = [...ch.notes, ch.top];
  let f = pool[k % pool.length]; if (k % 4 === 3) f *= 2;
  if (k % 8 !== 6) voice(tt, 0.5, f, 'tri', 0.05, (k % 2 ? 0.28 : -0.28), 0.006, 0.3);
  k++;
}

// délai stéréo léger (impression d'espace)
const d1 = Math.floor(0.19 * SR), d2 = Math.floor(0.27 * SR), fb = 0.18;
for (let i = d2; i < N; i++) { L[i] += fb * R[i - d1]; R[i] += fb * L[i - d2]; }

// normalisation
let peak = 0; for (let i = 0; i < N; i++) { peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }
const g = peak > 0 ? 0.9 / peak : 1;

// écriture WAV 16-bit stéréo
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8);
buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);
let o = 44;
for (let i = 0; i < N; i++) {
  const l = Math.max(-1, Math.min(1, L[i] * g)) * 32767;
  const r = Math.max(-1, Math.min(1, R[i] * g)) * 32767;
  buf.writeInt16LE(l | 0, o); buf.writeInt16LE(r | 0, o + 2); o += 4;
}
const outPath = path.join(OUT, 'magofeed-theme.wav');
fs.writeFileSync(outPath, buf);
console.log('✓ ' + path.basename(outPath) + '  (' + total.toFixed(1) + 's, ' + (buf.length / 1048576).toFixed(1) + ' Mo)');
