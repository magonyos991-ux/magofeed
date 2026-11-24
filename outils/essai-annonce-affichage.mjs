/* ══ L'ANNONCE NE PEUT PAS S'AFFICHER SANS SA SOURCE ═══════════════════════
   Le moteur (essai-annonce-marque.mjs) prouve qu'une annonce de marque rend un
   magasin « possible » et jamais « vu par quelqu'un ». Ce controle-ci eprouve
   les QUATRE endroits ou elle se voit, et il verifie les deux choses qui
   peuvent encore mal tourner a l'affichage :

     1. l'attribution ne se detache pas de l'affirmation. Le nom de la marque
        est DANS la pastille, pas renvoye a une ligne plus bas qui pourrait
        disparaitre un jour ;
     2. rien ne verdit, et rien n'entre dans le magasin. La liste des boissons
        de la fiche est remplie par une variable LOCALE : si les identifiants
        annonces atterrissaient dans s.drinks, le magasin partirait dans le
        cache localStorage et une collab terminee y survivrait 24 a 48 h,
        affichee sans marque et sans date.

   node outils/essai-annonce-affichage.mjs
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
const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, locale: "fr-BE",
  geolocation: { latitude: 50.8466, longitude: 4.3528 }, permissions: ["geolocation"] });
const pg = await ctx.newPage();
const errs = [];
pg.on("pageerror", (e) => errs.push(String(e && e.message).slice(0, 180)));
await pg.route("**/*", (r) => r.request().url().startsWith(`http://127.0.0.1:${port}/`) ? r.continue() : r.abort());
await pg.addInitScript(() => { try { ["magoOnboard", "magoob", "magotuto", "magoCoach"].forEach((k) => localStorage.setItem(k, "1")); } catch (e) {} });
await pg.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
await pg.waitForFunction(() => window.DRINKS && DRINKS.length > 100 && typeof window.declarationPour === "function", { timeout: 40000 });
await pg.evaluate(() => { try { document.getElementById("onboarding")?.remove(); document.getElementById("splash")?.remove(); } catch (e) {} });

const etapes = await pg.evaluate(async () => {
  const v = []; const ok = (n, c, d) => v.push([n, !!c, d || ""]);
  const JOUR = 86400000, t = Date.now();
  const boisson = DRINKS[0], did = Number(boisson.id);

  /* Un magasin sans enseigne et sans type : l'annonce est la SEULE raison. */
  const mag = { id: "A1", fbId: "A1", name: "Commerce Essai Sans Type", brand: "", type: "",
    address: "rue d'Essai 1", lat: 50.8470, lng: 4.3700, dist: 900,
    drinks: [], drinksVerified: [], confirmations: {}, hours: "24/7" };

  window.DECLARATIONS = { "essai-aff": {
    marque: "Pales", boissons: [did], lat: 50.8466, lng: 4.3528, rayonKm: 8,
    sansEnseignes: true, types: null, du: t - JOUR, au: t + 10 * JOUR,
    contrat: "Essai affichage", actif: true } };
  window.declIndexer();
  ok("l'annonce couvre le magasin d'essai", !!window.declarationPour(mag, did), "marque = Pales");
  ok("et ce magasin n'a aucun rayon probable",
    (window.rayonProbableIds(mag) || []).length === 0, "l'annonce est la seule raison possible");

  /* ── SITE 1 : LA PASTILLE DE LA CARTE DE MAGASIN ────────────────────── */
  window.STORES.length = 0; window.STORES.push(mag);
  window.curSel = boisson; window._storeListExpanded = false;
  window.curBudget = null; window.curBrandFilter = null;
  window._fbExpandedFor = {}; window.fbEnsureStoresForDrink = null;
  window._mapInStockOnly = false;
  window.renderStoreList();
  await new Promise((r) => setTimeout(r, 120));
  const carte = document.querySelector("#store-list .store-card");
  const txtCarte = carte ? carte.textContent.replace(/\s+/g, " ") : "";
  ok("la carte du magasin est rendue", !!carte, txtCarte.slice(0, 70));
  ok("sa pastille dit « Annoncé par Pales »", /Annoncé par Pales/.test(txtCarte),
    /À vérifier/.test(txtCarte) ? "elle dit encore « À vérifier »" : txtCarte.slice(0, 90));
  ok("elle ne dit NI « En stock » NI « Au catalogue »",
    !/En stock|Au catalogue/.test(txtCarte), "aucun mot de constat");
  const bordure = carte ? (carte.style.borderLeft || "") : "";
  ok("la barre d'accent n'est pas verte", !/#16a34a|rgb\(22, *163, *74\)/i.test(bordure), bordure || "-");
  const vertDansCarte = carte ? /#16a34a|rgb\(22, *163, *74\)/i.test(carte.innerHTML) : false;
  ok("et aucun vert ne s'est glisse dans la carte", vertDansCarte === false, vertDansCarte ? "VERT TROUVE" : "propre");

  /* L'en-tete ne doit compter aucun « en rayon ». */
  const badges = (document.getElementById("res-badges") || {}).textContent || "";
  ok("l'en-tete n'annonce aucun « en rayon »", !/en rayon/.test(badges), badges.replace(/\s+/g, " ").trim() || "(vide)");
  ok("mais il compte bien un possible", /possible/.test(badges), badges.replace(/\s+/g, " ").trim());

  /* ── SITE 2 : LE SUR-TITRE DE LA CARTE REPONSE ──────────────────────── */
  const rep = window.drinkReponseHTML([mag]) || "";
  ok("le sur-titre nomme la marque", /Annoncé par Pales/.test(rep),
    /qui la référence/.test(rep) ? "il dit encore « qui la référence »" : "-");
  ok("le cadre de la carte reponse reste gris", !/#16a34a/.test(rep), "aucun #16a34a");
  ok("et la ligne d'etat dit toujours « Pas encore confirmé ici »",
    /Pas encore confirmé ici/.test(rep), "le constat n'a pas bouge");

  /* ── SITE 3 : LA FICHE MAGASIN ──────────────────────────────────────── */
  window.curStoreDetail = mag;
  window.curStoreDetailQuery = ""; window.curStoreDetailCat = "Tous";
  try { window.renderStoreDetail(); } catch (e) { ok("renderStoreDetail ne leve pas", false, e.message); }
  await new Promise((r) => setTimeout(r, 150));
  const liste = document.getElementById("sd-drink-list");
  const txtListe = liste ? liste.textContent.replace(/\s+/g, " ") : "";
  ok("la boisson annoncee figure dans la fiche", txtListe.indexOf(boisson.name) !== -1,
    txtListe.slice(0, 80) || "(liste vide)");
  ok("et sa pastille dit « Annoncé par Pales »", /Annoncé par Pales/.test(txtListe),
    /À confirmer/.test(txtListe) ? "elle dit encore « À confirmer »" : "-");

  /* LE CONTROLE QUI PROTEGE LE CACHE. */
  ok("RIEN n'est entre dans s.drinks", (mag.drinks || []).indexOf(did) === -1,
    "drinks = " + JSON.stringify(mag.drinks));
  ok("ni dans s.drinksVerified", (mag.drinksVerified || []).indexOf(did) === -1,
    "drinksVerified = " + JSON.stringify(mag.drinksVerified));
  ok("ni dans le magasin de window.STORES",
    ((window.STORES[0] || {}).drinks || []).indexOf(did) === -1,
    "c'est le meme objet, et il est propre");

  /* ── SITE 4 : LE CADRE POINTILLE, AVEC SON ETIQUETTE ────────────────── */
  const bloc = document.getElementById("sd-annonce-marque");
  const txtBloc = bloc ? bloc.textContent.replace(/\s+/g, " ").trim() : "";
  ok("le cadre d'annonce existe", !!bloc && txtBloc.length > 0, txtBloc.slice(0, 100) || "(absent)");
  ok("il porte l'etiquette obligatoire", /ANNONCE DE MARQUE/i.test(txtBloc), "l'etiquette n'est jamais optionnelle");
  ok("il nomme la marque et dit que personne ne l'a vue",
    /Pales/.test(txtBloc) && /Personne ne l’a encore vue ici/.test(txtBloc), txtBloc.slice(0, 120));
  ok("et il est en pointille, pas en vert",
    !!bloc && /dashed/.test(bloc.innerHTML) && !/#16a34a/.test(bloc.innerHTML), "cadre pointille");

  /* ── ZERO ANNONCE : ZERO PIXEL ──────────────────────────────────────── */
  window.DECLARATIONS = {}; window.declIndexer();
  try { window.renderStoreDetail(); } catch (e) {}
  await new Promise((r) => setTimeout(r, 120));
  const bloc2 = document.getElementById("sd-annonce-marque");
  ok("sans annonce, le cadre est vide", !bloc2 || bloc2.textContent.trim() === "",
    bloc2 ? "contenu = " + JSON.stringify(bloc2.textContent.trim()) : "aucun element");
  window.renderStoreList();
  await new Promise((r) => setTimeout(r, 120));
  /* Sans annonce, ce magasin n'a plus AUCUNE raison d'etre dans la liste : il
     n'a ni boisson, ni rayon probable. Il doit donc disparaitre — c'est la
     consequence juste. */
  const carte2 = document.querySelector("#store-list .store-card");
  ok("sans annonce, le magasin quitte la liste",
    !carte2 || carte2.textContent.indexOf("Commerce Essai") === -1,
    carte2 ? carte2.textContent.replace(/\s+/g, " ").slice(0, 60) : "aucune carte");

  /* ── ZERO EMOJI, REGLE ABSOLUE ──────────────────────────────────────── */
  window.DECLARATIONS = { "essai-aff": {
    marque: "Pales", boissons: [did], lat: 50.8466, lng: 4.3528, rayonKm: 8,
    sansEnseignes: true, du: t - JOUR, au: t + 10 * JOUR, actif: true } };
  window.declIndexer();
  window.renderStoreList(); try { window.renderStoreDetail(); } catch (e) {}
  await new Promise((r) => setTimeout(r, 150));
  const tout = (document.querySelector("#store-list") || {}).textContent + " " +
    ((document.getElementById("sd-annonce-marque") || {}).textContent || "") + " " +
    ((document.getElementById("sd-drink-list") || {}).textContent || "");
  const re = /[\u{1F000}-\u{1FAFF}\u{1F300}-\u{1F9FF}‼⁉™ℹ]/u;
  ok("aucun emoji dans ce que l'annonce ajoute", re.test(tout) === false,
    re.test(tout) ? "EMOJI TROUVE" : "propre");

  window.DECLARATIONS = {}; window.declIndexer(); window.STORES.length = 0;
  return v;
});

console.log("\n  L'ANNONCE NE PEUT PAS S'AFFICHER SANS SA SOURCE\n");
let ko = 0;
for (const [n, o, d] of etapes) { if (!o) ko++; console.log("   " + (o ? "ok  " : "ECHEC") + "  " + n.padEnd(54) + " " + d); }
console.log("\n  erreurs JavaScript non rattrapees : " + errs.length);
errs.slice(0, 3).forEach((e) => console.log("    " + e));
console.log("\n  " + (ko === 0 && errs.length === 0 ? "TOUT EST VERT" : ko + " CONTROLE(S) EN ECHEC"));
await nav.close(); srv.close();
process.exit(ko === 0 && errs.length === 0 ? 0 : 1);
