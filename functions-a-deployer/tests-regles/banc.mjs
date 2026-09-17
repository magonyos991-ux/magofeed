/* Banc d'essai partage : un emulateur Firestore jetable, sur un port propre a
   chaque scenario, avec les VRAIES regles du depot.

   Pourquoi un fichier commun : plusieurs scenarios tournent en parallele. S'ils
   partagent le port 8391, le deuxieme echoue en disant « adresse deja
   utilisee » — et on croit avoir trouve un bug de l'application alors qu'on a
   trouve une collision de ports.

   Un scenario s'ecrit ainsi :

     import { banc, doit, bilan } from "../banc.mjs";
     const env = await banc("mon-scenario");
     const alice = env.authenticatedContext("alice").firestore();
     await doit("alice peut lancer une chasse", async () => { ... });
     await bilan(env);
*/
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import fs from "node:fs";
import path from "node:path";

export async function banc(projet) {
  const port = Number(process.env.MAGO_PORT || 8391);
  const regles = process.env.MAGO_RULES || path.join(process.cwd(), "firestore.rules");
  return initializeTestEnvironment({
    projectId: String(projet || "magofeed-scenario"),
    firestore: { rules: fs.readFileSync(regles, "utf8"), host: "127.0.0.1", port: port },
  });
}

const RESULTATS = [];
/* Une etape qui doit REUSSIR. Elle echoue si la fonction leve. */
export async function doit(nom, fn) {
  try { await fn(); RESULTATS.push([true, nom, ""]); }
  catch (e) { RESULTATS.push([false, nom, String((e && e.message) || e).slice(0, 220)]); }
}
/* Une etape qui doit ECHOUER (attaque, abus, regle trop lache). */
export async function doitEchouer(nom, fn) {
  try { await fn(); RESULTATS.push([false, nom, "l'operation a REUSSI alors qu'elle devait etre refusee"]); }
  catch (e) { RESULTATS.push([true, nom, ""]); }
}
/* Une observation chiffree, sans jugement : elle s'affiche mais ne compte pas. */
export function note(texte) { RESULTATS.push([null, texte, ""]); }

export async function bilan(env) {
  let ko = 0;
  for (const [ok, nom, pourquoi] of RESULTATS) {
    if (ok === null) { console.log("  .  | " + nom); continue; }
    if (!ok) ko++;
    console.log((ok ? "ok   " : "ECHEC") + " | " + nom + (pourquoi ? " — " + pourquoi : ""));
  }
  const total = RESULTATS.filter((r) => r[0] !== null).length;
  console.log("\n" + (total - ko) + "/" + total + " conformes");
  try { if (env) await env.cleanup(); } catch (e) {}
  process.exit(ko ? 1 : 0);
}
