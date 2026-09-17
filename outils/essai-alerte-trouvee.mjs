#!/usr/bin/env node
/* QUAND EST-ON PREVENU QU'UNE BOISSON GUETTEE A ETE REPEREE ?
   ----------------------------------------------------------------------------
   notifyStockToWatchers ne peut pas tourner ici (elle a besoin de Firebase
   Admin). Mais la question qui decide de tout tient dans quelques lignes : quels
   identifiants de boisson cette mise a jour de magasin considere-t-elle comme
   « quelqu'un vient de la voir » ? On extrait ce calcul DU FICHIER LIVRE et on
   lui pose des cas concrets.

   Le cas qui comptait, et qui ne marchait pas : la boisson est DEJA rattachee
   au magasin (c'est le cas de 8 217 magasins pour Mountain Dew Original), et
   quelqu'un la confirme en rayon. Le tableau drinks ne bouge pas. Avant, plus
   personne n'etait prevenu.

   node outils/essai-alerte-trouvee.mjs
*/
import { readFileSync } from "node:fs";

const src = readFileSync("functions-a-deployer/notifications-push.js", "utf8");
const d = src.indexOf("const bd = new Set((before.drinks || []).map(String));");
const f = src.indexOf("if (added.length > 3) return;", d);
if (d === -1 || f === -1) { console.error("le calcul des boissons a annoncer est introuvable"); process.exit(2); }
const calcul = src.slice(d, f + "if (added.length > 3) return;".length)
  .replace("if (added.length > 3) return;", "return added.length > 3 ? [] : added;");
const quoiAnnoncer = new Function("before", "after", calcul);

const etapes = [];
const dit = (nom, ok, note) => etapes.push([!!ok, nom, note || ""]);

/* 1. LE CAS QUI COMPTE : la boisson est deja la, quelqu'un la confirme. */
dit("une confirmation sur une boisson DEJA rattachee declenche l'alerte",
  quoiAnnoncer({ drinks: [200, 8], confirmations: {} },
               { drinks: [200, 8], confirmations: { 200: 1 } }).indexOf("200") !== -1);

/* 2. Le cas qui marchait deja : la boisson entre dans le magasin. */
dit("une boisson qui entre dans le rayon declenche l'alerte",
  quoiAnnoncer({ drinks: [8], confirmations: {} },
               { drinks: [8, 200], confirmations: {} }).indexOf("200") !== -1);

/* 3. Une seule alerte quand les deux arrivent ensemble. */
{
  const r = quoiAnnoncer({ drinks: [8], confirmations: {} },
                         { drinks: [8, 200], confirmations: { 200: 1 } });
  dit("ajout + confirmation du meme coup : une seule alerte",
    r.filter((x) => String(x) === "200").length === 1, "alertes : " + JSON.stringify(r));
}

/* 4. Ce qui ne doit RIEN declencher. */
dit("un simple passage de 1 a 2 confirmations ne realerte pas",
  quoiAnnoncer({ drinks: [200], confirmations: { 200: 1 } },
               { drinks: [200], confirmations: { 200: 2 } }).length === 0);
dit("un signalement d'absence ne declenche rien",
  quoiAnnoncer({ drinks: [200], confirmations: {} },
               { drinks: [200], confirmations: { 200: -1 } }).length === 0);
dit("une correction d'horaires ne declenche rien",
  quoiAnnoncer({ drinks: [200], confirmations: { 200: 1 }, hours: "8-20" },
               { drinks: [200], confirmations: { 200: 1 }, hours: "9-21" }).length === 0);

/* 5. LE GARDE-FOU CONTRE LA TEMPETE doit tenir, sinon un remplissage
      d'enseigne reveille toute la base. */
{
  const mille = Array.from({ length: 1200 }, (_, i) => i + 1);
  dit("un remplissage d'enseigne (1 200 boissons) n'envoie rien",
    quoiAnnoncer({ drinks: [], confirmations: {} }, { drinks: mille, confirmations: {} }).length === 0);
  const confs = {};
  for (let i = 1; i <= 50; i++) confs[i] = 1;
  dit("cinquante confirmations d'un coup n'envoient rien non plus",
    quoiAnnoncer({ drinks: mille, confirmations: {} }, { drinks: mille, confirmations: confs }).length === 0);
  dit("trois vraies observations passent",
    quoiAnnoncer({ drinks: [1], confirmations: {} },
                 { drinks: [1, 2, 3], confirmations: { 4: 1 } }).length === 3);
}

let ko = 0;
for (const [ok, nom, note] of etapes) { if (!ok) ko++; console.log((ok ? "ok   " : "ECHEC") + " | " + nom + (!ok && note ? " — " + note : "")); }
console.log("\n" + (etapes.length - ko) + "/" + etapes.length + " conformes");
process.exit(ko ? 1 : 0);
