/* Garde-fou de feuille de style.
   Une accolade orpheline dans app.css a fait sauter silencieusement la regle
   qui suivait : les pins de la carte sont devenus des carres, et une regle de
   « reduire les animations » s'est appliquee a tout le monde, tuant les
   animations pour tout le monde. Rien ne l'a signale — ni ESLint, qui ne lit
   pas le CSS, ni les tests, qui verifiaient le comportement et pas le style.
   Ce controle tourne avant chaque deploiement. */
import { readFileSync } from "node:fs";

const fichiers = ["app.css"];
let fautes = 0;

for (const f of fichiers) {
  const brut = readFileSync(f, "utf8");
  // on ignore commentaires, chaines et contenus d'url() : leurs accolades ne comptent pas
  const src = brut
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''");
  let profondeur = 0, ligne = 1, faute = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "\n") ligne++;
    else if (c === "{") profondeur++;
    else if (c === "}") {
      profondeur--;
      if (profondeur < 0 && !faute) { faute = ligne; break; }
    }
  }
  if (faute) { console.error(`✗ ${f}:${faute} — accolade fermante orpheline : la regle SUIVANTE sera ignoree en silence`); fautes++; }
  else if (profondeur !== 0) { console.error(`✗ ${f} — ${profondeur} bloc(s) jamais referme(s)`); fautes++; }
  else console.log(`✓ ${f} — accolades equilibrees`);

  // Une regle qui coupe les animations doit rester enfermee dans son @media.
  const sansMedia = src.replace(/@media[^{]*\{(?:[^{}]|\{[^{}]*\})*\}/g, "");
  if (/transition-duration\s*:\s*\.?0*1?ms\s*!important/.test(sansMedia)) {
    console.error(`✗ ${f} — une coupure d'animation s'applique HORS de @media prefers-reduced-motion : elle frappera tout le monde`);
    fautes++;
  }
}
process.exit(fautes ? 1 : 0);
