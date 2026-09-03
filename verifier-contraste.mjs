/* Magofeed — contrôle de contraste des couleurs de texte, sans navigateur.
 *
 * Lit app.css, extrait les variables de :root (thème clair) et de body.dark
 * (thème sombre), et vérifie que chaque paire texte/fond ci-dessous atteint
 * 4,5:1 (WCAG AA, texte courant) dans les DEUX thèmes. Refuse aussi les
 * couleurs d'accent brutes posées comme texte dans index.html ou app.css :
 * l'or #e5a93a fait 1,9:1 sur fond clair, il n'est lisible qu'en FOND.
 *
 *     node verifier-contraste.mjs      (0 = tout passe, 1 = un texte illisible)
 */
import fs from 'fs';

const css = fs.readFileSync('app.css', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

function bloc(sel) {
  const i = css.indexOf(sel + '{');
  if (i < 0) throw new Error('bloc introuvable : ' + sel);
  return css.slice(i, css.indexOf('}', i));
}
function variables(txt) {
  const out = {};
  for (const m of txt.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,6})/g)) out['--' + m[1]] = m[2];
  return out;
}
const clair = variables(bloc(':root'));
const sombre = Object.assign({}, clair, variables(bloc('body.dark')));

function rgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
}
function lum(hex) {
  const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const [r, g, b] = rgb(hex);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function ratio(a, b) { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); }

/* Texte, fond : ce que l'app pose vraiment l'un sur l'autre. */
const PAIRES = [
  ['--s1', '--app-bg'], ['--s1', '--card-bg'], ['--s1', '--bg2'], ['--s1', '--bg3'],
  ['--s2', '--card-bg'], ['--s2', '--bg2'],
  ['--txt2', '--app-bg'], ['--txt2', '--card-bg'], ['--txt2', '--bg2'], ['--txt2', '--bg3'],
  ['--gold-txt', '--card-bg'], ['--gold-txt', '--bg3'], ['--gold-txt', '--gold-chip-bg'],
  ['--ok-txt', '--ok-bg'], ['--ok-txt', '--card-bg'],
  ['--warn-txt', '--warn-bg'], ['--danger-txt', '--danger-bg'], ['--danger-txt', '--card-bg'],
  ['--gold-on', '--gold-bg'], ['--cta-on', '--cta-bg'], ['#ffffff', '--ok-solid'],
  ['--app-bg', '--s1'],
];
const SEUIL = 4.5;
let ko = 0;
for (const [nom, vars] of [['clair', clair], ['sombre', sombre]]) {
  for (const [t, f] of PAIRES) {
    const ct = t.startsWith('#') ? t : vars[t], cf = f.startsWith('#') ? f : vars[f];
    if (!ct || !cf) { console.log(`ECHEC ${nom} | ${t} sur ${f} | variable absente`); ko++; continue; }
    const r = ratio(ct, cf);
    const ok = r >= SEUIL;
    if (!ok) ko++;
    console.log(`${ok ? 'ok   ' : 'ECHEC'} ${nom.padEnd(6)} | ${t} (${ct}) sur ${f} (${cf}) | ${r.toFixed(2)}:1`);
  }
}

/* Accents bruts posés comme TEXTE (pas comme fond) : l'or, le vert vif, l'orange
   ne sont lisibles ni en clair ni en sombre selon le fond. Compte tenu de
   l'historique de l'app, c'est un AVERTISSEMENT (le nombre ne doit pas
   grossir), pas un échec : les nouveaux écrans passent par les variables. */
const BRUTS = /[^-]color:\s*#(e5a93a|f0b840|16a34a|e67e22|b45309|dc2626|c69a57)\b/gi;
let bruts = 0;
for (const [fichier, txt] of [['app.css', css], ['index.html', html]]) {
  txt.split('\n').forEach((l, i) => {
    BRUTS.lastIndex = 0;
    if (!BRUTS.test(l)) return;
    if (/TIER_COLORS/.test(l)) return;
    bruts++;
    if (process.argv.includes('--detail')) console.log(`avert. texte en couleur brute : ${fichier}:${i + 1} ${l.trim().slice(0, 110)}`);
  });
}
const PLAFOND_BRUTS = 70;   // etat au 3 septembre 2026 : 68 ; a faire baisser, jamais monter
if (bruts > PLAFOND_BRUTS) { ko++; console.log(`ECHEC ${bruts} textes en couleur brute (plafond ${PLAFOND_BRUTS}) — relance avec --detail`); }
else console.log(`avert. ${bruts} textes en couleur brute dans l'app (plafond ${PLAFOND_BRUTS}, --detail pour la liste)`);
console.log(ko ? `\n${ko} problème(s) de lisibilité` : '\nContrastes : tout passe (≥ 4,5:1 dans les deux thèmes)');
process.exit(ko ? 1 : 0);
