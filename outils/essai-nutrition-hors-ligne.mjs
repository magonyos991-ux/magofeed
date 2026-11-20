/* ══ LE SUCRE NE DEPEND NI DE FIREBASE NI D'INTERNET ════════════════════════
   Ce que le controle avant mise en ligne a fini par montrer, apres l'avoir
   accuse a tort d'etre instable : ouvrir une fiche boisson n'affichait ni le
   sucre, ni les calories, ni la cafeine avant que Firebase ait repondu.

   Deux chemins, le meme oubli :

     1. pick() — quand Firebase est encore en cours de chargement, la fiche
        part sur un squelette et ATTEND l'evenement fbStoresLoaded. Le nom,
        l'icone, la marque, la note, le coeur : tout etait pose. Le bloc
        nutrition, non. Mesure dans ce conteneur : pick a 3 126 ms, premier
        rendu du bloc a 6 015 ms. Et si Firebase ne repond JAMAIS — hors
        ligne, quota epuise, reseau d'entreprise qui bloque Google — cet
        evenement n'arrive pas, et le bloc reste vide POUR TOUJOURS ;
     2. renderStoreList() — quand aucun magasin connu ne porte la boisson, la
        fonction sort tot pour elargir la recherche Firestore. Le bloc
        nutrition est rempli PLUS BAS dans cette meme fonction : il etait donc
        saute exactement sur les boissons rares, c'est-a-dire le coeur meme de
        Magofeed.

   Or cette donnee ne vient de nulle part : la table NUTRI est chargee avec
   l'application (3 801 entrees), et nutriHTML ne demande rien a personne — il
   rend meme un bloc « on ne sait pas » quand il ne sait pas. Rien ne
   justifiait de faire attendre ce qu'on sait deja.

   CE CONTROLE COUPE TOUT LE RESEAU SORTANT et exige le bloc quand meme. Sans
   le correctif il echoue : le bloc reste vide. Verifie dans les deux sens.

   node outils/essai-nutrition-hors-ligne.mjs
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

/* HORS LIGNE POUR DE VRAI : tout ce qui n'est pas la page locale est coupe.
   C'est le seul moyen de prouver que le bloc ne depend de personne. */
let bloquees = 0;
await pg.route("**/*", (route) => {
  const u = route.request().url();
  if (u.startsWith(`http://127.0.0.1:${port}/`)) return route.continue();
  bloquees++;
  return route.abort();
});

await pg.addInitScript(() => { try { ["magoOnboard", "magoob", "magotuto", "magoCoach"].forEach((k) => localStorage.setItem(k, "1")); } catch (e) {} });
await pg.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
await pg.waitForFunction(() => window.DRINKS && DRINKS.length > 100 && typeof window.pick === "function", { timeout: 40000 });
await pg.evaluate(() => { try { document.getElementById("onboarding")?.remove(); document.getElementById("splash")?.remove(); } catch (e) {} });

const etapes = [];
const ok = (n, c, d) => etapes.push([n, !!c, d || ""]);

const attendre = async (fn, limite) => {
  const t0 = Date.now();
  for (;;) {
    let v = null; try { v = await pg.evaluate(fn); } catch (e) { v = null; }
    if (v) return { ok: true, ms: Date.now() - t0, v };
    if (Date.now() - t0 > (limite || 6000)) return { ok: false, ms: Date.now() - t0 };
    await new Promise((r) => setTimeout(r, 80));
  }
};

ok("la table nutrition est locale", await pg.evaluate(() => Object.keys(window.NUTRI || {}).length) >= 3700,
  (await pg.evaluate(() => Object.keys(window.NUTRI || {}).length)) + " entrees, sans reseau");
ok("Firebase n'est PAS pret", (await pg.evaluate(() => !window._fbReady)) === true,
  "c'est la condition meme du defaut : _fbReady=" + (await pg.evaluate(() => !!window._fbReady)));

/* ── 1. LA BRANCHE QUI ATTEND FIREBASE ───────────────────────────────────
   C'est ICI qu'etait le defaut, et couper le reseau ne suffit PAS a l'y
   amener : sans reseau le module Firebase ne demarre meme pas, _fbLoading
   reste faux, et pick() passe par le chemin normal qui remplissait bien le
   bloc. La branche fautive demande Firebase EN COURS de chargement — le cas
   reel d'un reseau lent, d'un quota epuise ou d'un reseau d'entreprise qui
   bloque Google. On pose donc cet etat exactement, comme pour la carte
   demontee : on eprouve la decision, qui est la partie qui etait fausse. */
await pg.evaluate(() => {
  window._fbReady = false; window._fbLoading = true;
  const n = document.getElementById("drink-nutri"); if (n) n.innerHTML = "";
  const d = DRINKS.find((x) => x.name === "Coca-Cola Original") || DRINKS[0];
  window.pick(d);
});
const squelette = await pg.evaluate(() => {
  const l = document.getElementById("store-list");
  return !!(l && /skel/i.test(l.innerHTML));
});
ok("on est bien dans la branche d'attente", squelette, squelette ? "la liste des magasins est un squelette" : "ATTENTION : pas de squelette, la branche n'est pas eprouvee");
const a = await attendre(() => {
  const n = document.getElementById("drink-nutri");
  return n && n.querySelector("div") ? n.textContent.replace(/\s+/g, " ").trim().slice(0, 90) : null;
}, 4000);
ok("Firebase en cours de chargement : le bloc arrive quand meme", a.ok,
  a.ok ? "en " + a.ms + " ms : " + a.v : "toujours vide apres " + a.ms + " ms (c'est le defaut)");
ok("et il arrive TOUT DE SUITE", a.ok && a.ms < 1200, a.ok ? a.ms + " ms" : "jamais");

/* ── 2. LA SORTIE ANTICIPEE DE renderStoreList ───────────────────────────
   Second chemin : Firebase est pret, mais aucun magasin connu ne porte la
   boisson. renderStoreList sort tot pour elargir la recherche Firestore, et
   le bloc nutrition est rempli PLUS BAS dans la meme fonction. On rend donc
   cet elargissement eternel — ce qu'un reseau coupe fait pour de vrai — et on
   exige le bloc malgre tout. */
const rare = await pg.evaluate(() => {
  window._fbReady = true; window._fbLoading = false;
  window._fbExpandedFor = {};
  /* Un elargissement qui ne repond JAMAIS : la promesse reste en suspens. */
  window.fbEnsureStoresForDrink = function () { return new Promise(function () {}); };
  try { window.STORES.length = 0; } catch (e) {}
  const n = document.getElementById("drink-nutri"); if (n) n.innerHTML = "";
  const d = DRINKS.find((x) => !/Coca/i.test(x.name)) || DRINKS[1];
  window.pick(d);
  return d.name;
});
const b = await attendre(() => {
  const n = document.getElementById("drink-nutri");
  return n && n.querySelector("div") ? n.textContent.replace(/\s+/g, " ").trim().slice(0, 90) : null;
}, 4000);
ok("recherche elargie sans fin : le bloc arrive quand meme", b.ok,
  (b.ok ? "en " + b.ms + " ms" : "toujours vide apres " + b.ms + " ms (c'est le defaut)") + " (" + rare + ")");

/* ── 3. ET IL DIT LA VERITE, Y COMPRIS QU'IL NE SAIT PAS ─────────────────── */
const honnete = await pg.evaluate(() => {
  const inconnue = { id: 999999, name: "Boisson Inconnue Pour Essai", brand: "Essai", cat: "Autre", color: "#888888" };
  let h = ""; try { h = window.nutriHTML(inconnue) || ""; } catch (e) { h = "EXCEPTION " + e.message; }
  return { longueur: h.length, parleDInconnu: /inconnu|on ne sait pas|pas de donn/i.test(h),
    aucunChiffreInvente: !/\b\d+\s*(g|kcal|mg)\b/i.test(h), extrait: h.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 110) };
});
ok("une boisson sans donnee nutritionnelle rend quand meme un bloc", honnete.longueur > 0, honnete.longueur + " caracteres");
ok("et ce bloc DIT qu'on ne sait pas", honnete.parleDInconnu, honnete.extrait);
ok("il n'invente aucun chiffre", honnete.aucunChiffreInvente, honnete.aucunChiffreInvente ? "aucun gramme ni kcal affiche" : "ATTENTION : " + honnete.extrait);

/* ── 4. ZERO EMOJI, REGLE ABSOLUE DU PROJET ──────────────────────────────── */
const emoji = await pg.evaluate(() => {
  const n = document.getElementById("drink-nutri");
  const t = n ? n.textContent : "";
  const re = /[‼-㊙\u{1F000}-\u{1FAFF}\u{1F900}-\u{1F9FF}]/u;
  return { trouve: re.test(t), texte: t.replace(/\s+/g, " ").trim().slice(0, 80) };
});
ok("aucun emoji dans le bloc nutrition", emoji.trouve === false, emoji.trouve ? "TROUVE dans : " + emoji.texte : "propre");

console.log("\n  LE SUCRE NE DEPEND NI DE FIREBASE NI D'INTERNET\n");
let ko = 0;
for (const [n, o, d] of etapes) { if (!o) ko++; console.log("   " + (o ? "ok  " : "ECHEC") + "  " + n.padEnd(54) + " " + d); }
console.log("\n  requetes sortantes coupees : " + bloquees);
console.log("  erreurs JavaScript non rattrapees : " + errs.length);
errs.slice(0, 3).forEach((e) => console.log("    " + e));
console.log("\n  " + (ko === 0 ? "TOUT EST VERT" : ko + " CONTROLE(S) EN ECHEC"));
await nav.close(); srv.close();
process.exit(ko === 0 ? 0 : 1);
