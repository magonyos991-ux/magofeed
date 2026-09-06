/* Assemble le dossier www/ embarqué dans l'app native (Capacitor).
   Même principe de LISTE BLANCHE que le déploiement Pages (.github/workflows/
   pages.yml) : on embarque ce que l'app utilise, et rien d'autre — pas de
   notes internes, pas de code serveur, pas de dossier promo. */
import { cpSync, mkdirSync, rmSync, existsSync } from "fs";

rmSync("www", { recursive: true, force: true });
mkdirSync("www", { recursive: true });

const fichiers = ["index.html", "app.css", "sw.js", "manifest.json", "privacy.html", "terms.html"];
const dossiers = ["data", "icons"];

for (const f of fichiers) cpSync(f, "www/" + f);
for (const d of dossiers) if (existsSync(d)) cpSync(d, "www/" + d, { recursive: true });

console.log("www/ assemblé : " + fichiers.length + " fichiers + " + dossiers.join(", "));
