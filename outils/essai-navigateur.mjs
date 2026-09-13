/* © 2026 Magofeed — Tous droits réservés / All rights reserved.
   Titulaire des droits (mention légale) : Ilias Benabdellah. */

/* ============================================================================
   ESSAI DANS UN VRAI NAVIGATEUR
   ----------------------------------------------------------------------------
   POURQUOI. Les autres outils lisent la source ou la table. Ils ne peuvent pas
   dire si un bouton s'ouvre, si une carte s'affiche, si changer de langue
   change vraiment l'ecran. Un assemblage de chaines peut etre juste a la
   lecture et casser au rendu — c'est arrive : un tr() appele au moment du
   rendu figeait la langue, et l'ecran gardait le francais apres le changement.
   Ici on ouvre l'application, on clique, et on regarde ce qui est ecrit.

   AUCUN RESEAU. On ne touche ni Firebase ni OpenFoodFacts : les fonctions
   d'envoi sont remplacees par des doublures qui retiennent ce qu'on leur
   donne. On teste notre code, pas la connexion.

   Lancer :  node outils/essai-navigateur.mjs
   ============================================================================ */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";

let chromium;
try { ({ chromium } = await import("playwright")); }
catch { console.log("playwright n'est pas installe — essai saute (npm i -D playwright)"); process.exit(0); }

const NAVIGATEUR = process.env.CHROMIUM || "/opt/pw-browsers/chromium";
const TYPES = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".json":"application/json",
  ".png":"image/png", ".svg":"image/svg+xml", ".webmanifest":"application/manifest+json", ".ico":"image/x-icon" };

const srv = createServer(async (q, r) => {
  try {
    const u = decodeURIComponent(q.url.split("?")[0]);
    const f = join(process.cwd(), u === "/" ? "/index.html" : u);
    const b = await readFile(f);
    r.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream" });
    r.end(b);
  } catch { r.writeHead(404); r.end("non"); }
});
await new Promise((ok) => srv.listen(8099, ok));

let nav;
try { nav = await chromium.launch({ executablePath: NAVIGATEUR }); }
catch (e) { console.log("aucun navigateur utilisable (" + String(e.message).slice(0, 90) + ") — essai saute"); srv.close(); process.exit(0); }

const page = await nav.newPage();
/* Le catalogue va chercher des images de produits : sans reseau ici, on coupe
   court plutot que d'attendre des delais d'expiration. */
await page.route("**://*.openfoodfacts.org/**", (r) => r.abort());
await page.goto("http://localhost:8099/index.html", { waitUntil: "load" });
await page.waitForTimeout(2500);

const r = await page.evaluate(async () => {
  const etapes = [];
  const dit = (nom, ok) => etapes.push([nom, !!ok]);
  const pause = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const out = { etapes };

  /* ── 1. Envoyer un magasin a quelqu'un, depuis la carte ────────────── */
  window._fbUser = { uid: "moi" };
  MSG.rows = [{ cid: "ami_moi", members: ["moi", "ami"], state: "open", unread: {}, lastAt: Date.now() }];
  MSG.users["ami"] = { pseudo: "Zdoudex" };
  MSG.blocs = [];
  let envoye = null;
  window.fbOuvrirConversation = async () => ({ ok: true, cid: "ami_moi", conv: { cid: "ami_moi", state: "open" } });
  window.fbEnvoyerMessage = async (cid, msg) => { envoye = { cid, msg }; return { ok: true }; };
  window.fbConvId = (a, b) => [a, b].sort().join("_");

  const magasin = { id: "s1", fbId: "s1", name: "WHSmith", brand: "WHSmith", lat: 50.9010, lng: 4.4844, drinks: [] };
  partagerMagasin(magasin);
  const ov = document.getElementById("share-store");
  dit("la feuille d'envoi s'ouvre", ov);
  if (ov) {
    const opts = [...ov.querySelectorAll(".msg-opt")];
    dit("l'ami est propose", opts.some((o) => o.textContent.indexOf("Zdoudex") !== -1));
    dit("le partage par lien reste propose", opts.some((o) => o.getAttribute("data-k") === "lien"));
    const ligne = opts.find((o) => o.getAttribute("data-uid") === "ami");
    if (ligne) ligne.click();
    await pause(400);
  }
  dit("un message est parti", envoye);
  if (envoye) {
    dit("le magasin y est", envoye.msg.storeId === "s1" && envoye.msg.storeName === "WHSmith");
    dit("aucune boisson inventee", !("drinkName" in envoye.msg) && !("drinkId" in envoye.msg));
    dit("les coordonnees suivent", envoye.msg.lat === 50.9010 && envoye.msg.lng === 4.4844);
  }

  /* ── 2. La carte, telle que la voit celui qui recoit ────────────────── */
  window.userLat = 50.85; window.userLng = 4.35;
  const html = msgBulleHTML({ type: "spot", storeId: "s1", storeName: "WHSmith", lat: 50.9010, lng: 4.4844, by: "ami" }, false, Date.now(), "Zdoudex");
  out.carte = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  dit("la carte nomme le magasin", html.indexOf("WHSmith") !== -1);
  dit("bouton pour y aller", html.indexOf('data-act="go"') !== -1);
  dit("bouton d'itineraire", html.indexOf('data-act="nav"') !== -1);
  dit("pas de bouton Fiche, il n'y a pas de boisson", html.indexOf('data-act="fiche"') === -1);

  /* ── 3. La feuille suit la langue ───────────────────────────────────── */
  const titreEn = (() => {
    setLang("en");
    const v = document.getElementById("share-store"); if (v) v.remove();
    partagerMagasin(magasin);
    const o = document.getElementById("share-store");
    const t = o ? (o.querySelector(".claim-title") || {}).textContent : "";
    if (o) o.remove();
    return t;
  })();
  out.titreEn = titreEn;
  dit("la feuille se traduit", titreEn === "Send this shop");

  /* ── 4. Le chinois : atteignable, et il change vraiment l'ecran ─────── */
  dit("le chinois est propose", Object.keys(LANGS).indexOf("zh") !== -1);
  setLang("fr"); await pause(700);
  const fr1 = document.body.innerText.slice(0, 4000);
  setLang("zh"); await pause(900);
  out.han = (document.body.innerText.slice(0, 4000).match(/[一-鿿]/g) || []).length;
  dit("l'accueil passe en chinois", out.han > 150);
  setLang("fr"); await pause(900);
  dit("le retour au francais ne perd rien", fr1 === document.body.innerText.slice(0, 4000));
  return out;
});

console.log("carte rendue : " + JSON.stringify(r.carte));
console.log("titre en anglais : " + JSON.stringify(r.titreEn));
console.log("caracteres chinois a l'ecran : " + r.han + "\n");
let ko = 0;
for (const [nom, ok] of r.etapes) { if (!ok) ko++; console.log((ok ? "ok   " : "ECHEC") + " | " + nom); }
console.log("\n" + (r.etapes.length - ko) + "/" + r.etapes.length + " conformes");
await nav.close(); srv.close();
process.exit(ko ? 1 : 0);
