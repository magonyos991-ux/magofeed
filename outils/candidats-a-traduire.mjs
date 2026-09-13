/* © 2026 Magofeed — Tous droits réservés / All rights reserved.
   Titulaire des droits (mention légale) : Ilias Benabdellah. */

/* Transforme la liste brute de francais-restant.mjs en une liste de PHRASES
   a traduire.

   Une chaine du code n'est pas toujours une phrase. Souvent c'est un fragment
   de HTML : '<div class="t-section">Tes avantages</div>'. Ce que l'utilisateur
   lit, c'est "Tes avantages" — et c'est ce texte-la, seul, que la passe DOM
   comparera a la table. Mettre le fragment entier dans la table ne servirait
   a rien : il ne correspondrait jamais a un noeud de texte.

   On decoupe donc sur les balises et on garde chaque morceau lisible. */

import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

/* francais-restant.mjs sort en code 1 quand il trouve quelque chose : c'est
   voulu, pour qu'une verification automatique echoue. Ici ce n'est pas une
   panne, c'est le cas normal. */
const brut = execFileSync("node", ["outils/francais-restant.mjs", "--json"], { encoding: "utf8", maxBuffer: 1 << 24 });
const lignes = JSON.parse(brut);

const t = readFileSync("data/textes.js", "utf8");
const d = t.indexOf("var TEXTES = {"), f = t.indexOf("\n};", d);
const TEXTES = new Function(t.slice(d, f + 3) + "\nreturn TEXTES;")();
const CLES = Object.keys(TEXTES);

const RE_ACCENTS = /[àâäçéèêëîïôöùûüÿœÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸŒ]/;
const MOTS = /(^|[^\p{L}])(le|la|les|un|une|des|du|de|et|ou|tu|ton|ta|tes|toi|je|il|elle|on|nous|vous|est|sont|sera|pour|avec|dans|sur|sous|pas|ne|que|qui|quoi|ce|cette|ces|cet|sans|plus|moins|deja|aussi|encore|jamais|toujours|chaque|tout|tous|toute|toutes|autre|autres|meme|peut|faut|fait|voir|aller|mais|donc|alors|puis|ici|quand|comme|trop|bien|rien|vers|chez|entre|par)([^\p{L}]|$)/iu;

function francais(s) {
  if (RE_ACCENTS.test(s)) return true;
  return MOTS.test(s.normalize("NFD").replace(/[̀-ͯ]/g, ""));
}

const morceaux = new Map();
for (const l of lignes) {
  const ligne = l.ligne;
  const texte = l.texte;
  for (const p0 of texte.split(/<[^>]*>/)) {
    /* Le decoupage sur les balises laisse des restes quand la chaine du code
       s'arrete au milieu d'une balise : ",this)\" role=\"button\" …" ou
       "')\">Trouvee ici !". Ce qu'un utilisateur lit se trouve apres le
       dernier ">" et avant le premier "<" restant. Ce qui contient encore un
       attribut est de la mecanique, pas une phrase. */
    let p = p0;
    if (p.indexOf(">") !== -1) p = p.slice(p.lastIndexOf(">") + 1);
    if (p.indexOf("<") !== -1) p = p.slice(0, p.indexOf("<"));
    const s = p.replace(/\s+/g, " ").trim();
    if (!s || s.length < 3) continue;
    if (/=["']|event\.|function\s*\(|\bthis\b/.test(s)) continue;
    if (TEXTES[s]) continue;
    if (!francais(s)) continue;
    if (CLES.some((c) => c.length >= 8 && s.length >= 8 && c.indexOf(s) !== -1)) continue;
    if (!morceaux.has(s)) morceaux.set(s, ligne);
  }
}

const liste = [...morceaux.entries()].sort((a, b) => a[1] - b[1]);
writeFileSync(process.argv[2] + "/candidats.json", JSON.stringify(liste.map(([s]) => s), null, 1), "utf8");
writeFileSync(process.argv[2] + "/candidats-lignes.json", JSON.stringify(Object.fromEntries(liste.map(([s, l], i) => [i, l])), null, 1), "utf8");
console.log("phrases candidates : " + liste.length);
