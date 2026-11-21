/* ══ LE VERT NE S'ALLUME QUE SUR UN CONSTAT HUMAIN ═════════════════════════
   Trois endroits traitaient une SUPPOSITION comme une preuve. Tous les trois
   lisaient magasinALaBoisson, qui est vrai des que le rayon PROBABLE d'une
   enseigne ou d'un type de commerce contient la boisson — c'est-a-dire une
   devinette que personne n'est jamais alle verifier. La fonction qui repond a
   « quelqu'un l'y a-t-il VU ? » est magasinConfirmePour, et elle seule.

     1. alternativesHTML (index.html, carte des alternatives) allumait une
        pastille #16a34a portant les mots « Pres de toi ». Son propre
        commentaire dit ce qu'elle promet : « c'est l'information qui decide
        d'un detour ». Quelqu'un traversait la ville sur une devinette peinte
        du vert qui, partout ailleurs dans l'application, veut dire qu'un
        humain l'a vue ;
     2. fbEnsureStoresForDrink.hasMatch decidait s'il faut elargir la requete
        a 25 puis 50 km. Une devinette suffisait a repondre « on a deja ce
        qu'il faut » : l'application cessait d'aller chercher les magasins ou
        la boisson a VRAIMENT ete vue. Le commentaire du cache negatif, juste
        en dessous, enonce pourtant l'intention d'origine — « les nouvelles
        boissons sans magasin CONFIRME declenchaient l'elargissement » ;
     3. logDemand enregistrait « trouvee » des qu'un rayon probable traînait
        dans le quartier, ce qui eteignait « X personnes l'ont cherchee ce
        mois-ci » sur les boissons que l'application devine au lieu de les
        constater — precisement celles dont la demande compte le plus.

   CE CONTROLE EPROUVE LES TROIS DECISIONS, PAS LEUR AFFICHAGE : on fabrique un
   magasin qui n'a QUE le rayon probable, et on exige que chacune des trois
   reponde non. Puis on pose une confirmation humaine et on exige que les trois
   repondent oui — un garde-fou qui dit toujours non ne prouve rien.

   node outils/essai-vert-merite.mjs
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
  geolocation: { latitude: 50.8793, longitude: 4.3511 }, permissions: ["geolocation"] });
const pg = await ctx.newPage();
const errs = [];
pg.on("pageerror", (e) => errs.push(String(e && e.message).slice(0, 180)));
/* Aucun reseau sortant : les magasins doivent venir de ce que l'essai pose. */
await pg.route("**/*", (r) => r.request().url().startsWith(`http://127.0.0.1:${port}/`) ? r.continue() : r.abort());
await pg.addInitScript(() => { try { ["magoOnboard", "magoob", "magotuto", "magoCoach"].forEach((k) => localStorage.setItem(k, "1")); } catch (e) {} });
await pg.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
await pg.waitForFunction(() => window.DRINKS && DRINKS.length > 100 && typeof window.magasinALaBoisson === "function", { timeout: 40000 });

const etapes = await pg.evaluate(() => {
  const v = []; const ok = (n, c, d) => v.push([n, !!c, d || ""]);

  /* UN MAGASIN QUI N'A QUE LE RAYON PROBABLE. On prend une enseigne reconnue
     (Carrefour) et une boisson de son rayon probable : rien dans drinks, rien
     dans drinksVerified, aucune confirmation. Personne n'y est jamais alle. */
  const devine = { id: "T1", fbId: "T1", name: "Carrefour Market Essai", brand: "Carrefour",
    lat: 50.8798, lng: 4.3515, dist: 400, drinks: [], drinksVerified: [], confirmations: {} };
  const ids = (window.rayonProbableIds ? window.rayonProbableIds(devine) : []) || [];
  ok("le magasin a bien un rayon probable", ids.length > 0, ids.length + " boissons supposees");
  const did = ids[0];
  const boisson = (window.DRINKS || []).filter((x) => Number(x.id) === Number(did))[0];
  ok("et la boisson supposee existe au catalogue", !!boisson, boisson ? boisson.name : "introuvable");
  if (!boisson) return v;

  /* ── LES DEUX PORTES, SUR CE MAGASIN ─────────────────────────────────── */
  ok("la porte « possible » dit oui", window.magasinALaBoisson(devine, did) === true, "magasinALaBoisson = true");
  ok("la porte « quelqu'un l'a vue » dit NON", window.magasinConfirmePour(devine, did) === false, "magasinConfirmePour = false");

  /* ── 1. LA PASTILLE VERTE DES ALTERNATIVES ───────────────────────────── */
  const poser = (liste) => { window.STORES.length = 0; liste.forEach((s) => window.STORES.push(s)); };
  const vertAllume = (cible) => {
    /* On demande la carte des alternatives d'une boisson dont « cible » est
       une alternative, et on regarde si la pastille verte s'allume pour elle. */
    const h = window.alternativesHTML ? (window.alternativesHTML(cible) || "") : "";
    return /#16a34a/.test(h);
  };
  /* alternativesDe rend des boissons de MEME GOUT : on part donc de la boisson
     supposee et on verifie la pastille sur ses propres alternatives, en
     posant le magasin devine sur CHACUNE d'elles. */
  const alts = (window.alternativesDe ? window.alternativesDe(boisson, 6) : []) || [];
  ok("la boisson a des alternatives a afficher", alts.length > 0, alts.length + " propositions");
  if (alts.length) {
    const a0 = alts[0];
    const devineAlt = Object.assign({}, devine, { id: "T2", fbId: "T2", drinks: [], confirmations: {} });
    /* Le rayon probable de Carrefour contient-il l'alternative ? Si oui, le
       seul chemin possible vers le vert est la supposition. */
    const supposee = window.magasinALaBoisson(devineAlt, a0.id);
    poser([devineAlt]);
    const vert1 = vertAllume(boisson);
    ok("une supposition n'allume PAS le vert « Pres de toi »",
      !(supposee && vert1), supposee ? "alternative supposee presente, vert=" + vert1 : "alternative hors rayon probable : non eprouve ici");
    /* Et maintenant un humain l'a vue : le vert DOIT s'allumer. */
    const vu = Object.assign({}, devineAlt, { id: "T3", fbId: "T3", drinks: [Number(a0.id)], confirmations: {} });
    vu.confirmations[a0.id] = 2;
    poser([vu]);
    ok("un constat humain allume bien le vert", vertAllume(boisson) === true, "sinon le garde-fou aurait tout eteint");
  }

  const vu2 = Object.assign({}, devine, { id: "T4", fbId: "T4", drinks: [Number(did)], confirmations: {} });
  vu2.confirmations[did] = 2;

  /* ── 2. LE SIGNAL DE DEMANDE, PAR LE VRAI CHEMIN ─────────────────────── */
  /* On n'imite pas l'expression du code — ce serait un controle qui se juge
     lui-meme, et il passerait meme si l'application etait fausse. On espionne
     logDemand et on laisse renderStoreList l'appeler pour de vrai. */
  const capte = [];
  const vraiLog = window.logDemand;
  window.logDemand = function (d, trouve) { capte.push(!!trouve); };
  try {
    window.curSel = boisson; window._storeListExpanded = false;
    window.curBudget = null; window.curBrandFilter = null;
    window._fbExpandedFor = {}; window.fbEnsureStoresForDrink = null;
    poser([devine]);
    capte.length = 0;
    window.renderStoreList();
    const surDevinette = capte.slice();
    poser([vu2]);
    capte.length = 0;
    window.renderStoreList();
    const surConstat = capte.slice();
    ok("« introuvable » veut dire introuvable",
      surDevinette.length > 0 && surDevinette.every((x) => x === false),
      "logDemand a reçu " + JSON.stringify(surDevinette) + " sur un rayon seulement probable");
    ok("et « trouvee » veut dire vue par quelqu'un",
      surConstat.length > 0 && surConstat.some((x) => x === true),
      "logDemand a reçu " + JSON.stringify(surConstat) + " sur une confirmation humaine");
  } finally { window.logDemand = vraiLog; }
  window.STORES.length = 0;
  return v;
});

/* ── 3. LA SOURCE SERVIE : les deux portes sont-elles lues au bon endroit ?
   hasMatch vit dans le module Firebase, qui ne se charge pas sans reseau. On
   ne peut donc pas l'appeler ici — on lit le fichier REELLEMENT servi, ce qui
   est verifiable et ne se juge pas soi-meme. */
const source = (await readFile(join(R, "index.html"), "utf8")).replace(/[ \t]+/g, "");
const srcOk = (n, c, d) => etapes.push([n, !!c, d || ""]);
srcOk("l'elargissement a 25 km ne se fie plus a une supposition",
  /varf=window\.magasinConfirmePour\|\|window\.magasinALaBoisson;/.test(source) &&
  !/returnmagasinALaBoisson\(s,drinkId\)/.test(source.replace(/window\./g, "")),
  "hasMatch consulte magasinConfirmePour");
srcOk("la pastille verte des alternatives ne lit plus la porte large",
  !/st\.dist<=5000&&typeofmagasinALaBoisson/.test(source) &&
  /st\.dist<=5000&&typeofmagasinConfirmePour/.test(source),
  "alternativesHTML consulte magasinConfirmePour");
srcOk("le signal de demande ne compte plus une longueur de liste",
  !/logDemand\(curSel,allStores\.length>0\)/.test(source) &&
  /logDemand\(curSel,allStores\.some\(/.test(source),
  "logDemand reçoit un constat, pas un comptage");

console.log("\n  LE VERT NE S'ALLUME QUE SUR UN CONSTAT HUMAIN\n");
let ko = 0;
for (const [n, o, d] of etapes) { if (!o) ko++; console.log("   " + (o ? "ok  " : "ECHEC") + "  " + n.padEnd(56) + " " + d); }
console.log("\n  erreurs JavaScript non rattrapees : " + errs.length);
errs.slice(0, 3).forEach((e) => console.log("    " + e));
console.log("\n  " + (ko === 0 && errs.length === 0 ? "TOUT EST VERT" : ko + " CONTROLE(S) EN ECHEC"));
await nav.close(); srv.close();
process.exit(ko === 0 && errs.length === 0 ? 0 : 1);
