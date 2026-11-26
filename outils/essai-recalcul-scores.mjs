/* ══ RECALCULER TOUS LES SCORES N'INVENTE AUCUN POINT ══════════════════════
   Les cinq points par confirmation de code-barres tombaient dans une colonne
   que personne ne lisait. Elle entre desormais dans la somme du serveur, mais
   un score ne se recalcule que quand il arrive quelque chose a la personne :
   qui ne contribue plus garde un score injustement bas. D'ou cet outil.

   IL TOUCHE POTENTIELLEMENT LES 169 COMPTES. Ce controle eprouve donc les
   deux choses qui peuvent mal tourner :

     1. il ne doit RIEN verser de neuf. Il appelle recalculerScore — la
        formule officielle, celle que le reste du serveur emploie — et ne
        recopie pas la somme. Deux formules divergent toujours, et c'est
        exactement la faute qu'on repare ;
     2. il ne doit pas partir sur un doigt qui glisse, ni ecrire avant d'etre
        confirme.

   node outils/essai-recalcul-scores.mjs
   ────────────────────────────────────────────────────────────────────────── */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const R = "/home/user/magofeed";
const etapes = [];
const ok = (n, c, d) => etapes.push([n, !!c, d || ""]);

/* ── LA FONCTION SERVEUR, LUE DANS LA SOURCE ─────────────────────────────
   Elle tourne chez Firebase : on ne peut pas l'executer ici. On lit donc ce
   qu'elle fait, et ce qu'elle ne fait pas. */
const srv0 = (await readFile(join(R, "functions-a-deployer/points-et-parrainage.js"), "utf8"));
const bloc = srv0.slice(srv0.indexOf("exports.recalculerTousLesScores"),
                        srv0.indexOf("exports.figerPointsExistants"));
ok("la fonction serveur existe", bloc.length > 200, bloc.length + " caracteres");
ok("elle est reservee a l'administrateur",
  /admins\/\$\{uid\}/.test(bloc) && /permission-denied/.test(bloc),
  "lecture de admins/{uid} puis refus");
ok("elle refuse aussi les non-connectes", /unauthenticated/.test(bloc), "auth exigee avant tout");
/* On lit le CODE, pas les commentaires : la premiere version de ce controle
   cherchait la formule dans le bloc entier et se faisait piéger par le
   commentaire qui EXPLIQUE pourquoi on ne la recopie pas. Un controle qui
   accuse une explication ne verifie rien. */
const sansCom = bloc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
ok("elle appelle la formule officielle, elle ne la recopie pas",
  /await recalculerScore\(/.test(sansCom) &&
  !/pointsPreuves.*refPoints|herite \+/.test(sansCom),
  "aucune somme recopiee dans le code de la fonction de masse");
ok("elle n'ecrit JAMAIS directement dans users",
  !/\.set\(|\.update\(|batch\(/.test(sansCom),
  "seule recalculerScore ecrit, et seulement si le total change");
ok("elle pagine au lieu de tout charger",
  /orderBy\("__name__"\)\.limit\(/.test(bloc) && /startAfter\(/.test(bloc),
  "par lots, avec un point de reprise");
ok("elle rend un curseur quand le delai la coupe",
  /curseur/.test(bloc) && /LIMITE_MS/.test(bloc) && /fini:/.test(bloc),
  "reprise possible sans repartir de zero");
/* LE CONTROLE QUI EVITE LE MENSONGE INVERSE. recalculerScore fige le solde
   actuel comme base quand pointsHerites est absent, PUIS y ajoute
   pointsPreuves — alors que figerPointsExistants, l'outil prevu pour ca, met
   pointsPreuves a zero en figeant, parce que ces points sont deja dans le
   solde. Passer la fonction de masse sur un compte jamais fige lui ajouterait
   donc ses preuves une deuxieme fois. Un score gonfle est un mensonge au meme
   titre qu'un score rabote. */
ok("un compte jamais fige est laisse de cote, pas gonfle",
  /pointsHerites === undefined\) \{[\s\S]{0,400}jamaisFiges\+\+/.test(bloc) && /continue;/.test(bloc),
  "ni touche, ni oublie : compte, liste, et laisse");
ok("et on rend son SOLDE, pas seulement son nombre",
  /jamaisFigesDetail\.push\(\{ uid: s\.id, points:/.test(bloc),
  "figer est definitif : il faut voir avant de figer");
ok("et le rapport le remonte", /jamaisFiges,/.test(bloc), "dans la reponse de la fonction");
ok("un compte en erreur n'arrete pas les autres",
  /catch \(e\) \{[\s\S]{0,200}erreurs\+\+/.test(bloc), "compte, journalise, continue");

/* recalculerScore doit rendre son bilan, sinon la fonction de masse devrait
   recopier la formule pour savoir ce qu'elle a change. */
ok("recalculerScore rend ce qu'il a fait",
  /const bilan = \{ avant: 0, apres: 0, change: false \}/.test(srv0) &&
  /return bilan;/.test(srv0), "{ avant, apres, change }");
ok("et les onze appels existants n'en sont pas derange(s)",
  (srv0.match(/await recalculerScore\(/g) || []).length >= 11,
  (srv0.match(/await recalculerScore\(/g) || []).length + " appels, tous en await sans lire la valeur");

/* La colonne morte doit etre fermee AVANT d'etre relue : sinon on vient
   d'ouvrir une porte sur le classement en voulant reparer une injustice. */
const regles = await readFile(join(R, "functions-a-deployer/firestore.rules"), "utf8");
ok("la colonne pts est fermee aux clients", /'pts',/.test(regles), "declaree dans champsServeur()");
ok("la colonne pointsChasse aussi", /'pointsChasse',/.test(regles), "declaree dans champsServeur()");
/* ══ CE QUI A CHANGE APRES UNE RELECTURE ADVERSE ═════════════════════════
   J'avais ajoute « pts » dans la somme du serveur pour rendre les points
   deja gagnes sans toucher aux documents. C'etait une faute : cette colonne
   n'a JAMAIS ete protegee par les regles pendant toute la periode ou elle se
   remplissait. La fermer aujourd'hui empeche les ecritures futures ;
   l'additionner encaisserait tout ce qui y a ete ecrit quand elle etait
   ouverte, sans plafond, sans moyen de distinguer cinq points gagnes d'un
   nombre tape dans une console. On la compte et on la rapporte ; une
   personne decide. */
ok("la somme compte pointsChasse", /\(Number\(d\.pointsChasse\) \|\| 0\)/.test(srv0),
  "colonne protegee des sa creation");
ok("et elle ne paie PAS l'ancienne colonne forgeable",
  !/Number\(d\.pts\)/.test(srv0.slice(srv0.indexOf("const total = Math.max"), srv0.indexOf("const total = Math.max") + 400)),
  "pts n'entre pas dans le total");
ok("chaque terme de la somme passe par Number()",
  /herite \+ \(Number\(d\.pointsPreuves\) \|\| 0\) \+ \(Number\(d\.refPoints\) \|\| 0\)/.test(srv0),
  "une chaine rendrait toute la somme en texte");
ok("crediter pointsChasse declenche bien un recalcul",
  /\(a\.pointsChasse \|\| 0\) === \(b\.pointsChasse \|\| 0\)\) return;/.test(srv0),
  "sans ca, les cinq points existaient en base et n'apparaissaient nulle part");
ok("figer retire pointsPreuves de la base au lieu de le jeter",
  /pointsHerites: Math\.max\(0,\s*\n?\s*\(Number\(d\.points\) \|\| 0\) - \(Number\(d\.pointsPreuves\) \|\| 0\)\)/.test(srv0) &&
  !/pointsHerites: Math\.max\(0, d\.points \|\| 0\), pointsPreuves: 0/.test(srv0),
  "sur un document reste bloque, l'ancienne version effaçait la contribution");

/* La chasse ne doit plus ecrire dans le vide. */
const chasse = await readFile(join(R, "functions-a-deployer/chasse-codes.js"), "utf8");
ok("la chasse credite pointsChasse, plus pts",
  /pointsChasse: FieldValue\.increment/.test(chasse) && !/\{ pts: FieldValue/.test(chasse),
  "la colonne lue par la somme");

/* ── LE BOUTON, DANS UN VRAI NAVIGATEUR ──────────────────────────────────── */
const { chromium } = (await import("/opt/node22/lib/node_modules/playwright/index.js")).default;
const M = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const serveur = createServer(async (q, s) => {
  let u = decodeURIComponent(q.url.split("?")[0]); if (u === "/") u = "/index.html";
  try { const b = await readFile(join(R, u)); s.writeHead(200, { "content-type": M[extname(u)] || "application/octet-stream" }); s.end(b); }
  catch { s.writeHead(404); s.end(""); }
});
await new Promise((r) => serveur.listen(0, r));
const port = serveur.address().port;
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, locale: "fr-BE" });
const pg = await ctx.newPage();
const errs = [];
pg.on("pageerror", (e) => errs.push(String(e && e.message).slice(0, 180)));
await pg.route("**/*", (r) => r.request().url().startsWith(`http://127.0.0.1:${port}/`) ? r.continue() : r.abort());
await pg.addInitScript(() => { try { ["magoOnboard", "magoob", "magotuto", "magoCoach"].forEach((k) => localStorage.setItem(k, "1")); } catch (e) {} });
await pg.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
await pg.waitForFunction(() => typeof window.renderPointsRendus === "function" && typeof window.actionSensible === "function", { timeout: 40000 });

const dans = await pg.evaluate(async () => {
  const v = []; const ok2 = (n, c, d) => v.push([n, !!c, d || ""]);
  let appels = [];
  window.fbRecalculerTousLesScores = function (curseur) {
    appels.push(curseur || null);
    /* Premier passage : interrompu par le delai. Deuxieme : termine. */
    return Promise.resolve(appels.length === 1
      ? { lus: 50, repasses: 50, changes: 7, rendus: 35, baisses: 0, erreurs: 0,
          jamaisFiges: 0, jamaisFigesDetail: [], ptsComptes: 0, ptsEnAttente: 0, curseur: "uid50", fini: false }
      : { lus: 19, repasses: 16, changes: 2, rendus: 10, baisses: 5, erreurs: 1,
          jamaisFiges: 3, jamaisFigesDetail: [{ uid: "zdoudex", points: 999999 }, { uid: "mehdi", points: 0 }],
          ptsComptes: 2, ptsEnAttente: 15, curseur: null, fini: true });
  };
  window.renderPointsRendus();
  const btn = document.getElementById("rc-btn"), res = document.getElementById("rc-res");
  ok2("le bouton existe dans l'administration", !!btn, btn ? btn.textContent : "absent");

  btn.onclick();
  await new Promise((r) => setTimeout(r, 150));
  const gf = document.getElementById("garde-fou");
  ok2("il passe par le garde-fou", !!gf, "action de grande ampleur");
  ok2("et il exige un mot tape", !!gf && !!gf.querySelector("#gf-mot"), "RECALCULER");
  ok2("le garde-fou dit qu'aucun point n'est invente",
    !!gf && /Aucun point n'est invent/.test(gf.textContent), "la promesse est ecrite");
  ok2("rien n'est appele tant que ce n'est pas confirme", appels.length === 0, "appels = " + appels.length);
  gf.querySelector("#gf-non").click();
  await new Promise((r) => setTimeout(r, 100));
  ok2("annuler n'appelle rien", appels.length === 0, "appels = " + appels.length);

  /* On confirme pour de vrai : on court-circuite le garde-fou, ce n'est pas
     lui qu'on teste ici mais ce qui vient apres. */
  const vraiGarde = window.actionSensible;
  window.actionSensible = function () { return Promise.resolve(true); };
  btn.onclick();
  await new Promise((r) => setTimeout(r, 200));
  ok2("premier passage : il appelle sans curseur", appels.length === 1 && appels[0] === null, JSON.stringify(appels));
  ok2("il dit ce qu'il a fait", /50 comptes repass\u00e9s \u00e0 la formule/.test(res.textContent), res.textContent.slice(0, 80));
  ok2("il dit les points rendus", /35 points rendus/.test(res.textContent), res.textContent.slice(0, 110));
  ok2("il annonce qu'il a ete interrompu", /Interrompu par le d/.test(res.textContent), "le delai l'a coupe");
  ok2("et le bouton propose de reprendre", /Reprendre/.test(btn.textContent), btn.textContent);

  btn.onclick();
  await new Promise((r) => setTimeout(r, 200));
  ok2("deuxieme passage : il reprend AU CURSEUR", appels.length === 2 && appels[1] === "uid50", JSON.stringify(appels));
  ok2("les comptes s'additionnent entre les passages",
    /66 comptes repass\u00e9s \u00e0 la formule sur 69 lus/.test(res.textContent), res.textContent.slice(0, 90));
  ok2("les points rendus aussi", /45 points rendus/.test(res.textContent), res.textContent.slice(0, 120));
  ok2("une baisse est dite, sans cause inventee",
    /5 points retir\u00e9s par la formule/.test(res.textContent) && !/sanction/.test(res.textContent),
    "le serveur ne rend qu'un nombre : l'ecran ne doit pas lui inventer une cause");
  ok2("un compte en erreur est signale, avec quoi faire",
    /1 compte en erreur, relance/.test(res.textContent), res.textContent.slice(-90));
  ok2("les comptes jamais figes sont LISTES, pas seulement comptes",
    /3 comptes jamais fig/.test(res.textContent) && /zdoudex \(999999 pts\)/.test(res.textContent),
    "un solde aberrant doit sauter aux yeux avant un gel definitif");
  ok2("et le bouton de gel est nomme comme a l'ecran",
    /Figer les soldes de points/.test(res.textContent) && !/Figer les points existants/.test(res.textContent),
    "« Figer les soldes de points », pas le nom de la fonction serveur");
  ok2("l'ancienne colonne est comptee, jamais payee",
    /15 points dans l\u2019ancienne colonne/.test(res.textContent) && /PAS vers/.test(res.textContent),
    "elle a ete ecrivable depuis un navigateur");
  ok2("et la fin est annoncee", /Termin/.test(res.textContent) && /Recalculer tous les scores/.test(btn.textContent), "bouton remis a zero");
  window.actionSensible = vraiGarde;
  return v;
});
for (const e of dans) etapes.push(e);

console.log("\n  RECALCULER TOUS LES SCORES N'INVENTE AUCUN POINT\n");
let ko = 0;
for (const [n, o, d] of etapes) { if (!o) ko++; console.log("   " + (o ? "ok  " : "ECHEC") + "  " + n.padEnd(56) + " " + d); }
console.log("\n  erreurs JavaScript non rattrapees : " + errs.length);
errs.slice(0, 3).forEach((e) => console.log("    " + e));
console.log("\n  " + (ko === 0 && errs.length === 0 ? "TOUT EST VERT" : ko + " CONTROLE(S) EN ECHEC"));
await nav.close(); serveur.close();
process.exit(ko === 0 && errs.length === 0 ? 0 : 1);
