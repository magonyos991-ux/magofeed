/* Assemble le dossier www/ embarqué dans l'app native (Capacitor).
   Même principe de LISTE BLANCHE que le déploiement Pages (.github/workflows/
   pages.yml) : on embarque ce que l'app utilise, et rien d'autre — pas de
   notes internes, pas de code serveur, pas de dossier promo. */
import { cpSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";

rmSync("www", { recursive: true, force: true });
mkdirSync("www", { recursive: true });

const fichiers = ["index.html", "app.css", "sw.js", "manifest.json", "privacy.html", "terms.html"];
const dossiers = ["data", "icons"];
/* Les bouteilles vectorielles servent d'illustrations DANS l'app
   (data/drinkart.js les charge à l'exécution) : sans elles, des fiches
   boissons perdraient leur visuel — différence interdite. */
const bouteilles = "promo/cards-src/bottles";

for (const f of fichiers) cpSync(f, "www/" + f);
for (const d of dossiers) if (existsSync(d)) cpSync(d, "www/" + d, { recursive: true });
if (existsSync(bouteilles)) cpSync(bouteilles, "www/" + bouteilles, { recursive: true });

/* LE NUMERO DE VERSION. Le deploiement Pages remplace « __BUILD_ID__ » par le
   debut du commit (.github/workflows/pages.yml) ; ce script-ci, lui, copiait
   index.html tel quel. L'app installee depuis les magasins affichait donc, dans
   son ecran Parametres, « 1.6.0 · build __BUILD_ID__ » — et son cache de
   service worker s'appelait « magofeed-__BUILD_ID__ », le meme nom a chaque
   version, donc jamais renouvele. On fait ici la meme substitution. */
var build = "local";
try { build = execSync("git rev-parse --short=7 HEAD", { encoding: "utf8" }).trim() || "local"; } catch (e) {}
/* L'EMPREINTE DANS L'URL DES FICHIERS DE LA COQUILLE (?v=<commit>), comme
   pages.yml : les balises <script src="data/…"> et <link app.css> d'index.html,
   et les memes entrees dans APP_SHELL de sw.js — les deux doivent parler de la
   MEME URL. En natif c'est sans effet (pas de service worker sur capacitor://,
   et le serveur local de Capacitor ignore la chaine de requete : url.path cote
   iOS, uri.getPath() cote Android) ; on le fait pour que www/ soit, a l'octet
   pres, ce que le web recoit — une difference entre les deux est une source de
   « ca marche sur le site mais pas dans l'app » qu'on ne veut pas chercher. */
function estampillerURL(f, src) {
  if (f.endsWith("sw.js"))
    return src.replace(/^(  "\.\/(?:data\/[A-Za-z0-9_.-]+\.js|app\.css))",/gm, '$1?v=' + build + '",');
  return src
    .replace(/(<script src="data\/[A-Za-z0-9_.-]+\.js)"/g, '$1?v=' + build + '"')
    .replace(/(<link rel="stylesheet" href="app\.css)"/, '$1?v=' + build + '"');
}
for (const f of ["www/index.html", "www/sw.js"]) {
  if (!existsSync(f)) continue;
  const avant = readFileSync(f, "utf8");
  const apres = estampillerURL(f, avant.split("__BUILD_ID__").join(build));
  if (apres !== avant) writeFileSync(f, apres);
}

console.log("www/ assemblé : " + fichiers.length + " fichiers + " + dossiers.join(", ") + " · build " + build);
