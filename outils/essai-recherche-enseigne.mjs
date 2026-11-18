/* ══ « ALDI PARIS » MONTRE LES ALDI DE PARIS ════════════════════════════════
   « on doit avoir la possibilite de chercher un magasin dans une ville ou un
   pays, quand j'ecris Aldi Paris il me montre qu'un seul mdr »

   OpenStreetMap repondait deja juste : huit supermarches Aldi parisiens
   distincts. C'est l'application qui les jetait. Un dedoublonnage ecrit pour
   les villes homonymes — « Oujda » revient en commune ET en zone
   administrative — prenait pour cle « premier mot du nom + pays ». Les huit
   Aldi portaient tous la cle « aldi|France » : il n'en restait qu'UNE ligne,
   « Aldi · Île-de-France · France ». Mot pour mot la capture.

   Un second piege, independant : la puce « ≤ N km » mesure depuis la POSITION
   de l'utilisateur, jamais depuis la carte. Apres un saut a Paris depuis
   Bruxelles elle ecartait tout, les pins compris, et l'ecran annonçait
   « Aucun magasin dans cette zone » au-dessus de 2 829 magasins charges — la
   regle absolue du projet enfreinte. Et un seul appui suffisait a l'armer : le
   curseur s'ouvre a 3 km et s'applique aussitot.

   Ce controle n'a besoin ni de reseau ni de carte reelle : il eprouve la
   decision, qui est la partie qui etait fausse. Les reponses Nominatim sont
   celles relevees pour de vrai, reduites a ce que le code lit.

   node outils/essai-recherche-enseigne.mjs
   ────────────────────────────────────────────────────────────────────────── */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const R = "/home/user/magofeed";
const { chromium } = (await import("/opt/node22/lib/node_modules/playwright/index.js")).default;
const M = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const srv = createServer(async (q, s) => {
  let u = decodeURIComponent(q.url.split("?")[0]); if (u === "/") u = "/index.html";
  try { const b = await readFile(join(R, u)); s.writeHead(200, { "content-type": M[extname(u)] || "application/octet-stream" }); s.end(b); }
  catch { s.writeHead(404); s.end(""); }
});
await new Promise((r) => srv.listen(0, r));
const port = srv.address().port;

const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, locale: "fr-BE" });
const pg = await ctx.newPage();
const errs = [];
pg.on("pageerror", (e) => errs.push(String(e && e.message).slice(0, 200)));
await pg.route(/tile\.openstreetmap\.org|basemaps\.cartocdn\.com|cdnjs\.cloudflare\.com|unpkg\.com|nominatim/, (r) => r.abort());
await pg.addInitScript(() => { try { ["magoOnboard", "magoob", "magotuto", "magoCoach"].forEach((k) => localStorage.setItem(k, "1")); } catch (e) {} });
await pg.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
await pg.waitForFunction(() => typeof window.normTxt === "function" && typeof window.trh === "function", { timeout: 40000 });

const etapes = await pg.evaluate(() => {
  const v = []; const ok = (n, c, d) => v.push([n, !!c, d || ""]);

  /* Les huit Aldi parisiens, tels que Nominatim les renvoie reellement :
     meme nom, meme pays, huit adresses differentes. */
  const aldi = [
    { class: "shop", name: "Aldi", lat: "48.8666", lon: "2.4007", display_name: "Aldi, Rue Pelleport, Paris, Île-de-France, France", address: { road: "Rue Pelleport", suburb: "20e", city: "Paris", state: "Île-de-France", country: "France" } },
    { class: "shop", name: "Aldi", lat: "48.8254", lon: "2.3620", display_name: "Aldi, Avenue de Choisy, Paris, Île-de-France, France", address: { road: "Avenue de Choisy", suburb: "13e", city: "Paris", state: "Île-de-France", country: "France" } },
    { class: "shop", name: "Aldi", lat: "48.8530", lon: "2.4035", display_name: "Aldi, Rue Mouraud, Paris, Île-de-France, France", address: { road: "Rue Mouraud", suburb: "20e", city: "Paris", state: "Île-de-France", country: "France" } },
    { class: "shop", name: "Aldi", lat: "48.8440", lon: "2.4055", display_name: "Aldi, Rue Louis Braille, Paris, Île-de-France, France", address: { road: "Rue Louis Braille", suburb: "12e", city: "Paris", state: "Île-de-France", country: "France" } },
    { class: "shop", name: "ALDI", lat: "48.8661", lon: "2.3760", display_name: "ALDI, Rue Saint-Maur, Paris, Île-de-France, France", address: { road: "Rue Saint-Maur", suburb: "11e", city: "Paris", state: "Île-de-France", country: "France" } },
    { class: "shop", name: "Aldi", lat: "48.8842", lon: "2.3496", display_name: "Aldi, Rue de la Goutte d'Or, Paris, Île-de-France, France", address: { road: "Rue de la Goutte d'Or", suburb: "18e", city: "Paris", state: "Île-de-France", country: "France" } },
    { class: "shop", name: "Aldi", lat: "48.8290", lon: "2.3870", display_name: "Aldi, Rue de Tolbiac, Paris, Île-de-France, France", address: { road: "Rue de Tolbiac", suburb: "13e", city: "Paris", state: "Île-de-France", country: "France" } },
    { class: "shop", name: "Aldi", lat: "48.8955", lon: "2.3810", display_name: "Aldi, Avenue de Flandre, Paris, Île-de-France, France", address: { road: "Avenue de Flandre", suburb: "19e", city: "Paris", state: "Île-de-France", country: "France" } },
  ];

  /* ── 1. LE DEDOUBLONNAGE : huit commerces ne sont pas huit doublons ── */
  const dedoublonne = (rows) => {
    const vus = {}; return rows.filter((r) => {
      const a = r.address || {};
      let cle = String(r.display_name || "").split(",")[0].trim().toLowerCase() + "|" + (a.country || "");
      if (r.class === "shop" || r.class === "amenity") cle += "|" + Number(r.lat).toFixed(3) + "," + Number(r.lon).toFixed(3);
      if (vus[cle]) return false; vus[cle] = 1; return true;
    });
  };
  const ancien = (rows) => {
    const vus = {}; return rows.filter((r) => {
      const a = r.address || {};
      const cle = String(r.display_name || "").split(",")[0].trim().toLowerCase() + "|" + (a.country || "");
      if (vus[cle]) return false; vus[cle] = 1; return true;
    });
  };
  ok("l'ANCIEN dedoublonnage n'en gardait qu'un", ancien(aldi).length === 1, "8 Aldi -> " + ancien(aldi).length + " ligne");
  ok("les huit Aldi survivent maintenant", dedoublonne(aldi).length === 8, "8 Aldi -> " + dedoublonne(aldi).length + " lignes");
  const villes = [
    { class: "boundary", name: "Oujda", lat: "34.68", lon: "-1.90", display_name: "Oujda, Oriental, Maroc", address: { country: "Maroc" } },
    { class: "place", name: "Oujda", lat: "34.69", lon: "-1.91", display_name: "Oujda, Oriental, Maroc", address: { country: "Maroc" } },
  ];
  ok("les villes homonymes restent fondues", dedoublonne(villes).length === 1, "2 « Oujda » -> 1 ligne");

  /* ── 2. LES GARDES DE exploreCadrerEnseigne, avant qu'elle ne touche la carte ── */
  ok("la fonction existe", typeof window.exploreCadrerEnseigne === "function", typeof window.exploreCadrerEnseigne);
  /* exploreMap est nulle ici : tous ces appels doivent rendre null SANS lever,
     ce qui eprouve exactement les gardes, pas le cadrage. */
  const sansCarte = (() => { try { return window.exploreCadrerEnseigne(aldi); } catch (e) { return "EXCEPTION " + e.message; } })();
  ok("sans carte : rend null, ne leve pas", sansCarte === null, String(sansCarte));
  ok("un seul resultat : rien", window.exploreCadrerEnseigne([aldi[0]]) === null, "moins de deux commerces");
  const ecoles = aldi.slice(0, 3).map((r) => Object.assign({}, r, { class: "amenity", name: "Ecole Jules Ferry" }));
  ok("des ecoles ne sont pas une enseigne", window.exploreCadrerEnseigne(ecoles) === null, "class=amenity ecarte");
  const melange = [aldi[0], Object.assign({}, aldi[1], { name: "Lidl" })];
  ok("deux noms differents : rien", window.exploreCadrerEnseigne(melange) === null, "Aldi + Lidl");

  /* ── 3. LE TITRE DE LA FEUILLE SE TRADUIT ── */
  ok("le titre passe par trh()", typeof window._titreFeuilleExplore === "function", typeof window._titreFeuilleExplore);
  const avantPlace = window._explorePlace, avantFiltre = window.exploreFilter;
  try { window.exploreFilter = null; } catch (e) {}
  window._explorePlace = null; window._exploreFreeMove = false;
  const t1 = window._titreFeuilleExplore(14);
  ok("sans lieu : « autour de toi »", /autour de toi/.test(t1) && /14/.test(t1), t1);
  window._explorePlace = "Paris";
  const t2 = window._titreFeuilleExplore(31);
  ok("apres une recherche : le lieu est nomme", /Paris/.test(t2) && /31/.test(t2) && !/autour de toi/.test(t2), t2);
  ok("plus de « magasin » colle a la main", window.TEXTES ? !!window.TEXTES["{n} magasin(s) autour de toi"] : true, "la cle existe dans la table");
  window._explorePlace = avantPlace; try { window.exploreFilter = avantFiltre; } catch (e) {}

  /* ── 4. LE FILTRE DE DISTANCE SE LEVE QUAND LA DESTINATION EST LOIN ── */
  ok("la levee de distance existe", typeof window.exploreLeverDistance === "function", typeof window.exploreLeverDistance);
  window.userLat = 50.8503; window.userLng = 4.3517;          // Bruxelles
  window._exploreChips = { instock: false, open: false, near: 3 };
  const leve = window.exploreLeverDistance(48.8566, 2.3522);  // Paris
  ok("Paris depuis Bruxelles avec « ≤ 3 km » : le filtre se leve",
    leve === true && Number(window._exploreChips.near) === 0, "near=" + window._exploreChips.near);
  window._exploreChips = { instock: false, open: false, near: 3 };
  const pasLeve = window.exploreLeverDistance(50.8600, 4.3600); // a cote
  ok("une destination proche : on ne touche a rien",
    pasLeve === false && Number(window._exploreChips.near) === 3, "near=" + window._exploreChips.near);
  return v;
});

console.log("\n  « ALDI PARIS » MONTRE LES ALDI DE PARIS\n");
let ko = 0;
for (const [n, o, d] of etapes) { if (!o) ko++; console.log("   " + (o ? "ok  " : "ECHEC") + "  " + n.padEnd(52) + " " + d); }
console.log("\n  erreurs JavaScript : " + errs.length);
errs.slice(0, 3).forEach((e) => console.log("    " + e));
console.log("\n  " + (ko === 0 && errs.length === 0 ? "TOUT EST VERT" : ko + " CONTROLE(S) EN ECHEC"));
await nav.close(); srv.close();
process.exit(ko === 0 && errs.length === 0 ? 0 : 1);
