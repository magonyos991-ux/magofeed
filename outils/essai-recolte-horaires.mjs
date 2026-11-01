/* ══ LA RECOLTE D'HORAIRES NE SE REFORMATE PAS TOUTE SEULE ══════════════════
   Le premier passage reel de outils/recolter-horaires.mjs a ete refuse pour
   « 37,41 % de derive ». Onze valeurs sur douze etaient pourtant identiques au
   caractere pres : Overpass entoure de guillemets toute valeur contenant une
   virgule ou un point-virgule — c'est-a-dire les trois quarts des horaires,
   puisque « ; » est le separateur de blocs d'OpenStreetMap — et le lecteur ne
   les retirait pas.

   Le garde-fou a sauve la mise : il a refuse d'ecrire. Ce banc d'essai fige
   la lecon, et les cinq autres scenarios qui comptent. Il ne touche jamais au
   reseau ni au fichier du depot : les jeux sont fabriques a partir des vraies
   donnees et la recolte ecrit dans un dossier jetable.

   node outils/essai-recolte-horaires.mjs
   ────────────────────────────────────────────────────────────────────────── */
import { readFileSync, writeFileSync, mkdtempSync, existsSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RACINE = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const SOURCE = RACINE + "/data/horaires-osm-be.json";
const SCRIPT = RACINE + "/outils/recolter-horaires.mjs";
const reel = JSON.parse(readFileSync(SOURCE, "utf8"));
const cles = Object.keys(reel);

const bac = mkdtempSync(join(tmpdir(), "magofeed-recolte-"));
const etapes = [];
const v = (nom, ok, det) => etapes.push([nom, !!ok, det || ""]);

function tsv(obj, citer) {
  return Object.keys(obj).map((k) => {
    let val = obj[k];
    if (citer && /[,;"]/.test(val)) val = '"' + val.replace(/"/g, '""') + '"';
    return k + "\t" + val;
  }).join("\n") + "\n";
}

/* Chaque scenario repart d'un dossier NEUF contenant une copie du fichier
   reel : sinon le second scenario jugerait le resultat du premier. */
function recolter(nomJeu, contenu, gabarit) {
  const dossier = join(bac, nomJeu);
  execFileSync("mkdir", ["-p", dossier]);
  writeFileSync(join(dossier, "horaires-osm-be.json"), readFileSync(SOURCE));
  const csv = join(bac, nomJeu + ".tsv");
  writeFileSync(csv, contenu);
  try {
    const sortie = execFileSync("node", [SCRIPT, "--csv", csv, "--sortie", dossier], {
      encoding: "utf8",
      // Les refus sont ATTENDUS dans trois scenarios : leur texte d'echec ne
      // doit pas se melanger au compte rendu de ce banc d'essai.
      stdio: ["ignore", "pipe", "pipe"],
      env: Object.assign({}, process.env, { GABARIT: gabarit ? "true" : "" }),
    });
    return { code: 0, sortie, dossier };
  } catch (e) {
    return { code: e.status === undefined ? -1 : e.status, sortie: String(e.stdout || "") + String(e.stderr || ""), dossier };
  }
}
const relire = (r) => JSON.parse(readFileSync(join(r.dossier, "horaires-osm-be.json"), "utf8"));
const meta = (r) => JSON.parse(readFileSync(join(r.dossier, "horaires-osm-be.meta.json"), "utf8"));

/* ── 1. LE DEFAUT QUI A COUTE TROIS PASSAGES ──────────────────────────────
   Une recolte citee a la mode d'Overpass doit donner une derive de ZERO. */
const cite = recolter("cite", tsv(reel, true), false);
const apresCite = cite.code === 0 ? relire(cite) : null;
v("CSV cite par Overpass : accepte", cite.code === 0, "code " + cite.code);
v("CSV cite : derive nulle", /derive : 0 valeurs changees/.test(cite.sortie), (cite.sortie.match(/derive : [^\n]*/) || ["?"])[0]);
v("CSV cite : rien n'a change", apresCite && cles.every((k) => apresCite[k] === reel[k]), apresCite ? "34 786 valeurs comparees" : "pas de fichier");
const nbCites = (cite.sortie.match(/(\d+) valeurs entre guillemets decodees/) || [0, 0])[1];
v("CSV cite : le decodage a bien servi", Number(nbCites) > 20000, nbCites + " valeurs decodees");

/* Le cas dangereux du decodage : une valeur qui EST deja une phrase entre
   guillemets ne doit pas se faire amputer de ses propres guillemets. */
const phrases = cles.filter((k) => /^".*"$/.test(reel[k]));
v("les phrases deja entre guillemets survivent",
  phrases.length > 50 && apresCite && phrases.every((k) => apresCite[k] === reel[k]),
  phrases.length + " valeurs de ce genre, toutes intactes");

/* ── 2. UNE RECOLTE QUI MAIGRIT EST UNE PANNE ─────────────────────────────
   Le vrai cas rencontre : une requete plus etroite que la precedente. */
const maigre = {};
cles.slice(0, Math.floor(cles.length * 0.8)).forEach((k) => { maigre[k] = reel[k]; });
const rMaigre = recolter("maigre", tsv(maigre, true), false);
v("recolte a 80 % : refusee", rMaigre.code === 1, "code " + rMaigre.code);
v("recolte a 80 % : fichier intact", JSON.stringify(relire(rMaigre)) === JSON.stringify(reel), "aucune ecriture");

/* ── 3. UNE DERIVE MASSIVE EST UN REFORMATAGE, PAS UN CHANGEMENT ──────────*/
const derive = {};
cles.forEach((k, i) => { derive[k] = i % 10 < 3 ? "Mo-Su 10:00-11:00" : reel[k]; });
const rDerive = recolter("derive", tsv(derive, true), false);
v("derive de 30 % : refusee", rDerive.code === 1, "code " + rDerive.code);
v("derive : des exemples sont montres", /exemples de ce qui change/.test(rDerive.sortie), "sans eux, passer outre serait aveugle");
v("derive de 30 % : fichier intact", JSON.stringify(relire(rDerive)) === JSON.stringify(reel), "aucune ecriture");
v("GABARIT force le passage", recolter("gabarit", tsv(derive, true), true).code === 0, "premier passage assume");

/* ── 4. UNE CLE ABSENTE N'EST PAS UNE CLE MORTE ───────────────────────────*/
const sansDix = {};
cles.slice(10).forEach((k) => { sansDix[k] = reel[k]; });
const rAbsents = recolter("absents", tsv(sansDix, true), false);
const apresAbsents = relire(rAbsents);
const dix = cles.slice(0, 10);
v("10 cles disparues : gardees", dix.every((k) => apresAbsents[k] === reel[k]), "aucune suppression");
v("10 cles disparues : comptees", dix.every((k) => meta(rAbsents).absents[k] === 1), "une semaine d'absence notee");

/* La huitieme semaine, et seulement elle, les laisse partir. */
const m7 = meta(rAbsents);
dix.forEach((k) => { m7.absents[k] = 7; });
writeFileSync(join(rAbsents.dossier, "horaires-osm-be.meta.json"), JSON.stringify(m7, null, 1));
const csv8 = join(bac, "huitieme.tsv");
writeFileSync(csv8, tsv(sansDix, true));
execFileSync("node", [SCRIPT, "--csv", csv8, "--sortie", rAbsents.dossier], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const apresHuit = JSON.parse(readFileSync(join(rAbsents.dossier, "horaires-osm-be.json"), "utf8"));
v("a la huitieme semaine, elles partent", dix.every((k) => apresHuit[k] === undefined), "8 semaines consecutives");

/* ── 5. LES LIGNES ILLISIBLES SONT COMPTEES, JAMAIS DEVINEES ──────────────*/
const casse = "@id\topening_hours\npas_un_id\t24/7\n456\n789\t\t24/7\n456789\t\n" + tsv(reel, true);
const rCasse = recolter("casse", casse, false);
v("lignes cassees : comptees et jetees", /4 lignes rejetees/.test(rCasse.sortie), (rCasse.sortie.match(/recolte : [^\n]*/) || ["?"])[0].slice(0, 90));

/* ── 6. LE FICHIER ECRIT RESTE DU JSON, ET LISIBLE LIGNE A LIGNE ──────────*/
const texte = readFileSync(join(cite.dossier, "horaires-osm-be.json"), "utf8");
v("le fichier reste du JSON strict", (() => { try { JSON.parse(texte); return true; } catch (e) { return false; } })(), "fetch().json() continue de marcher");
v("une cle par ligne", texte.split("\n").length === cles.length + 3, texte.split("\n").length + " lignes pour " + cles.length + " cles");
const ordre = texte.split("\n").slice(1, -2).map((l) => BigInt(l.slice(1, l.indexOf('"', 1))));
v("trie par identifiant numerique", ordre.every((x, i) => i === 0 || ordre[i - 1] < x), "le diff hebdomadaire reste lisible");
v("la provenance est ecrite a cote", existsSync(join(cite.dossier, "horaires-osm-be.meta.json")) && meta(cite).licence === "ODbL 1.0", "licence " + meta(cite).licence);

rmSync(bac, { recursive: true, force: true });

console.log("\n  LA RECOLTE D'HORAIRES NE SE REFORMATE PAS TOUTE SEULE\n");
let ko = 0;
for (const [nom, ok, det] of etapes) { if (!ok) ko++; console.log("   " + (ok ? "ok  " : "ECHEC") + "  " + nom.padEnd(44) + " " + det); }
console.log("\n  " + (ko === 0 ? "TOUT EST VERT" : ko + " CONTROLE(S) EN ECHEC"));
process.exit(ko === 0 ? 0 : 1);
