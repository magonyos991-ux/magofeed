/* ══ LA CHAINE D'ALERTE ADMIN DOIT ETRE VERIFIABLE, ET SURTOUT HONNETE ═════
   « Quand quelqu'un ouvre l'app via le lien, je ne recois toujours pas de
   notification. » Trois defauts distincts se cachaient derriere cette phrase,
   et ce controle eprouve les trois :

     1. SEPT ALERTES SANS SECOURS. catalogue-ia.js previent l'administrateur
        sept fois — dont « Alcool ecarte », la seule qui touche a la regle
        fondatrice de l'app. Il ne declarait pas BREVO_API_KEY. Or un secret
        n'arrive dans process.env que si la fonction qui s'en sert le DECLARE :
        le secours par courriel y etait donc muet depuis toujours, et muet
        exactement le jour ou la poussee echoue.

     2. UN REFUS DE GOOGLE NE DECLENCHAIT AUCUN SECOURS. Dans sendToAdmins,
        seul le jeton mort entrait dans la liste du secours. Une cle VAPID
        fausse, un compte de service sans droit, une panne passagere : ni
        poussee, ni courriel, et une trace que personne ne lit.

     3. LE TEST EVIDENT EST UN TEST FAUX. Ouvrir l'app soi-meme sur son PC ne
        peut PAS declencher l'alerte « nouvel utilisateur » : elle ne part qu'a
        la CREATION du document de profil, et une session deja connectee n'en
        cree aucun. Il faut donc un vrai test, et le panneau qui l'offre doit
        survivre au rafraichissement du journal — la premiere version effacait
        son propre verdict a l'instant ou elle l'ecrivait.

   node outils/essai-alerte-admin.mjs
   ────────────────────────────────────────────────────────────────────────── */
import { createServer } from "node:http";
import { readFile, mkdir, writeFile, copyFile, rm } from "node:fs/promises";
import { extname, join } from "node:path";
import { createRequire } from "node:module";

const R = "/home/user/magofeed";
const F = join(R, "functions-a-deployer");
const v = [];
const ok = (n, c, d) => v.push([n, !!c, d || ""]);

/* ── 1. TOUT APPELANT DE sendToAdmins DECLARE LE SECRET ─────────────────────
   Controle statique, et c'est le bon outil ici : le defaut n'est visible qu'en
   production, le jour ou la poussee echoue. Personne ne l'aurait trouve a
   l'execution. */
const src = {};
for (const f of ["outils-admin.js", "notif-admin.js", "catalogue-ia.js", "don-notification.js"]) {
  src[f] = await readFile(join(F, f), "utf8");
}
for (const [f, t] of Object.entries(src)) {
  if (f === "outils-admin.js") continue;          // c'est lui qui FOURNIT sendToAdmins
  const appelle = /sendToAdmins\s*\(/.test(t);
  if (!appelle) continue;
  const declare = /secrets:\s*\[[^\]]*BREVO_API_KEY/.test(t);
  ok(`${f} declare BREVO_API_KEY dans secrets`, declare,
     appelle ? `${(t.match(/sendToAdmins\s*\(/g) || []).length} alerte(s)` : "");
}
ok("catalogue-ia garde sa propre cle IA en plus du secours",
   /secrets:\s*\[[^\]]*ANTHROPIC_API_KEY[^\]]*BREVO_API_KEY|secrets:\s*\[[^\]]*BREVO_API_KEY[^\]]*ANTHROPIC_API_KEY/.test(src["catalogue-ia.js"]),
   "ajouter le secours ne doit pas retirer l'existant");

/* ── 2. LE COMPORTEMENT REEL DE sendToAdmins ────────────────────────────────
   On charge le VRAI fichier, pas une copie de sa logique : les deux tests
   tautologiques de cette session ont ete ecrits en re-ecrivant l'expression
   testee, et ils passaient sur du code casse. Ici les modules Firebase sont
   remplaces par des doublures pilotables, et c'est le code livre qui tourne. */
const LAB = join(process.env.TMPDIR || "/tmp", "mago-lab-alerte");
await rm(LAB, { recursive: true, force: true });
await mkdir(join(LAB, "node_modules", "firebase-admin"), { recursive: true });
await copyFile(join(F, "outils-admin.js"), join(LAB, "outils-admin.js"));

const faux = {
  "app.js": `module.exports={getApps:()=>[1],initializeApp:()=>{}};`,
  "firestore.js": `module.exports={
    getFirestore:()=>globalThis.__LAB.db,
    FieldValue:{serverTimestamp:()=>"T",delete:()=>"__EFFACE__"}};`,
  "messaging.js": `module.exports={getMessaging:()=>({send:(m)=>globalThis.__LAB.envoyer(m)})};`,
  "auth.js": `module.exports={getAuth:()=>({getUser:(u)=>globalThis.__LAB.user(u)})};`
};
for (const [n, c] of Object.entries(faux)) await writeFile(join(LAB, "node_modules", "firebase-admin", n), c);

/* `jetons` : le champ « token » historique, un par compte (forme d'avant).
   `appareils` : la carte « jetons » — une entree par appareil (forme neuve).
   Les deux peuvent coexister, et c'est meme le cas NORMAL pour l'appareil qui
   vient d'ecrire : il est a la fois dans « token » et dans sa propre entree.
   `maj` retient les mises a jour : c'est la preuve qu'on retire l'appareil mort
   SANS supprimer le document (qui porte aussi la position et le rayon de zone). */
function monterLab({ admins, jetons, appareils = {}, envoyer, adresses, brevoOk = true }) {
  const efface = [], courriels = [], traces = [], maj = [];
  let trace = null;
  const db = {
    collection(nom) {
      return {
        async get() {
          if (nom === "admins") return { empty: !admins.length, size: admins.length,
            docs: admins.map((id) => ({ id })) };
          return { empty: true, size: 0, docs: [] };
        },
        async add(d) { trace = { ...d }; traces.push(trace);
          return { async update(u) { Object.assign(trace, u); } }; },
        doc(id) {
          return {
            async get() {
              if (nom !== "pushTokens") return { exists: false, data: () => ({}) };
              const carte = {};
              for (const a of (appareils[id] || [])) carte[a.id] = { token: a.token, appareil: a.nom || "" };
              const existe = (id in jetons) || !!(appareils[id] || []).length;
              return { exists: existe, data: () => ({ token: jetons[id], jetons: carte }) };
            },
            async update(u) { maj.push({ id, u }); },
            async delete() { efface.push(id); }
          };
        }
      };
    },
    doc: () => ({ async get() { return { exists: false }; } })
  };
  globalThis.__LAB = {
    db, envoyer,
    user: async (u) => ({ email: adresses[u] || "" })
  };
  globalThis.fetch = async (u, o) => { courriels.push(JSON.parse(o.body)); return { ok: brevoOk, status: brevoOk ? 201 : 401 }; };
  process.env.BREVO_API_KEY = "cle-de-labo";
  return { efface, courriels, maj, get trace() { return trace; } };
}

const req = createRequire(join(LAB, "x.js"));
function neuf() { delete req.cache[req.resolve(join(LAB, "outils-admin.js"))]; return req(join(LAB, "outils-admin.js")); }

/* A. Un refus AUTRE que le jeton mort. C'est le cas qui ne declenchait rien. */
{
  const lab = monterLab({
    admins: ["ilias"], jetons: { ilias: "jeton-vivant" },
    adresses: { ilias: "admin@exemple.test" },
    envoyer: async () => { const e = new Error("SenderId mismatch"); e.code = "messaging/mismatched-credential"; throw e; }
  });
  const r = await neuf().sendToAdmins("Nouvel utilisateur", "corps");
  ok("refus Google (hors jeton mort) : le secours par courriel part", lab.courriels.length === 1 && r.courriel === true,
     `courriels=${lab.courriels.length} courriel=${r.courriel}`);
  ok("refus Google (hors jeton mort) : le jeton n'est PAS efface", lab.efface.length === 0,
     "une panne passagere ne doit pas obliger a tout reactiver a la main");
  ok("le code d'erreur exact est rendu et trace",
     /mismatched-credential/.test((r.echecs || []).join("|")) && /mismatched-credential/.test((lab.trace.echecs || []).join("|")),
     (r.echecs || []).join("|"));
  ok("la trace dit zero poussee et un courriel",
     lab.trace.pousseesEnvoyees === 0 && lab.trace.jetonsTrouves === 1 && lab.trace.courrielEnvoye === true,
     JSON.stringify({ p: lab.trace.pousseesEnvoyees, j: lab.trace.jetonsTrouves, c: lab.trace.courrielEnvoye }));
}

/* B. Le jeton mort : secours ET effacement. */
{
  const lab = monterLab({
    admins: ["ilias"], jetons: { ilias: "jeton-mort" },
    adresses: { ilias: "admin@exemple.test" },
    envoyer: async () => { const e = new Error("not registered"); e.code = "messaging/registration-token-not-registered"; throw e; }
  });
  const r = await neuf().sendToAdmins("Nouvel utilisateur", "corps");
  ok("jeton mort : le secours part", r.courriel === true && lab.courriels.length === 1, "");
  /* LE DOCUMENT NE DOIT PLUS ETRE SUPPRIME. Il porte aussi la position, le
     rayon de zone et le choix du secours : un seul appareil remplace rendait
     les notifications « pres de toi » muettes pour une raison sans rapport. */
  ok("jeton mort : le document pushTokens SURVIT", lab.efface.length === 0,
     lab.efface.length ? "position et rayon de zone perdus avec lui" : "");
  ok("jeton mort : seul le champ du jeton est retire",
     lab.maj.length === 1 && lab.maj[0].id === "ilias" && lab.maj[0].u.token === "__EFFACE__",
     JSON.stringify(lab.maj));
}

/* F. DEUX APPAREILS, DEUX ENVOIS. LE COEUR DE LA PANNE DU 28 NOVEMBRE.
      pushTokens/{uid} ne portait qu'un champ « token », reecrit a chaque
      ouverture de l'app : ouvrir Magofeed sur le PC effacait le jeton de
      l'iPhone, et toutes les alertes suivantes partaient vers le PC. Google
      acceptait, « poussees » valait 1, le journal ecrivait « notification
      envoyee », et l'iPhone ne sonnait plus jamais. */
{
  const recus = [];
  const lab = monterLab({
    admins: ["ilias"],
    jetons: { ilias: "jeton-du-pc" },
    appareils: { ilias: [{ id: "pc1", token: "jeton-du-pc", nom: "Windows \u00B7 Chrome" },
                         { id: "tel1", token: "jeton-de-l-iphone", nom: "iPhone \u00B7 Safari" }] },
    adresses: { ilias: "admin@exemple.test" },
    envoyer: async (m) => { recus.push(m.token); return { name: "ok" }; }
  });
  const r = await neuf().sendToAdmins("Nouvel utilisateur", "corps", "ilias");
  ok("deux appareils : DEUX envois partent", r.parties === 2 && recus.length === 2, `parties=${r.parties}`);
  ok("deux appareils : l'iPhone est servi lui aussi",
     recus.indexOf("jeton-de-l-iphone") !== -1, recus.join(","));
  ok("un meme jeton present deux fois n'est envoye qu'une fois",
     new Set(recus).size === recus.length, recus.join(","));
  ok("le compte de l'appelant est rendu a part du total",
     r.moi && r.moi.appareils === 2 && r.moi.parties === 2, JSON.stringify(r.moi));
  ok("deux appareils servis : aucun courriel de doublon", lab.courriels.length === 0, "");
}

/* G. UN APPAREIL MORT PARMI DEUX : l'autre recoit, et seule l'entree morte
      disparait. C'est la difference entre « un telephone remplace » et « plus
      aucune notification ». */
{
  const lab = monterLab({
    admins: ["ilias"],
    jetons: {},
    appareils: { ilias: [{ id: "pc1", token: "mort", nom: "Windows \u00B7 Chrome" },
                         { id: "tel1", token: "vivant", nom: "iPhone \u00B7 Safari" }] },
    adresses: { ilias: "admin@exemple.test" },
    envoyer: async (m) => {
      if (m.token === "mort") { const e = new Error("gone"); e.code = "messaging/registration-token-not-registered"; throw e; }
      return { name: "ok" };
    }
  });
  const r = await neuf().sendToAdmins("Nouvel utilisateur", "corps", "ilias");
  ok("un appareil mort sur deux : l'autre recoit quand meme", r.parties === 1, `parties=${r.parties}`);
  ok("un appareil mort sur deux : seule SON entree est retiree",
     lab.maj.length === 1 && lab.maj[0].u["jetons.pc1"] === "__EFFACE__", JSON.stringify(lab.maj));
  ok("un appareil mort sur deux : le document survit", lab.efface.length === 0, "");
  ok("un appareil mort sur deux : pas de courriel, la personne a bien recu",
     r.courriel === false && lab.courriels.length === 0, "");
}

/* H. DEUX ADMINISTRATEURS, UN SEUL SERVI. L'ancien code faisait
      « if (!parties) » : des qu'UN administrateur recevait la poussee, tous
      les autres perdaient leur alerte en silence. */
{
  const lab = monterLab({
    admins: ["ilias", "autre"],
    jetons: { autre: "jeton-de-l-autre" },
    appareils: {},
    adresses: { ilias: "ilias@exemple.test", autre: "autre@exemple.test" },
    envoyer: async () => ({ name: "ok" })
  });
  const r = await neuf().sendToAdmins("Nouvel utilisateur", "corps", "ilias");
  ok("un admin servi, l'autre non : le courriel part pour celui qui n'a rien",
     r.courriel === true && lab.courriels.length === 1, `courriels=${lab.courriels.length}`);
  ok("le courriel part a la bonne adresse",
     lab.courriels.length === 1 && JSON.stringify(lab.courriels[0]).indexOf("ilias@exemple.test") !== -1,
     "l'ecran annoncait l'adresse de celui qui cliquait, meme quand le courriel partait ailleurs");
  ok("l'appelant sait que SON courriel est parti", r.moi && r.moi.courriel === true, JSON.stringify(r.moi));
  ok("l'appelant sait qu'aucun de ses appareils n'a recu",
     r.moi && r.moi.parties === 0 && r.moi.appareils === 0, JSON.stringify(r.moi));
}

/* I. LA TRACE DIT QU'ELLE EST TERMINEE. Sans ce drapeau, une fonction tuee en
      cours de route laissait une trace a 0/0/false, que le journal lisait
      comme « aucun appareil enregistre » — une conclusion qu'il n'avait aucun
      moyen de tirer. */
{
  const lab = monterLab({
    admins: ["ilias"], jetons: { ilias: "bon" }, adresses: { ilias: "a@b.test" },
    envoyer: async () => ({ name: "ok" })
  });
  await neuf().sendToAdmins("Nouvel utilisateur", "corps", "ilias");
  ok("la trace porte le drapeau « fini »", lab.trace.fini === true, JSON.stringify(lab.trace.fini));
}

/* C. La poussee part : on ne sonne jamais deux fois. */
{
  const lab = monterLab({
    admins: ["ilias"], jetons: { ilias: "bon" },
    adresses: { ilias: "admin@exemple.test" },
    envoyer: async () => ({ name: "ok" })
  });
  const r = await neuf().sendToAdmins("Nouvel utilisateur", "corps");
  ok("poussee reussie : aucun courriel de doublon", r.parties === 1 && r.courriel === false && lab.courriels.length === 0,
     `parties=${r.parties}`);
  ok("poussee reussie : aucun code d'erreur", (r.echecs || []).length === 0, "");
}

/* D. Aucun administrateur enregistre : rien ne peut partir, et la trace existe
      quand meme. C'est la seule facon de distinguer « 0 jeton » de
      « 0 administrateur », deux reparations differentes. */
{
  const lab = monterLab({ admins: [], jetons: {}, adresses: {}, envoyer: async () => ({}) });
  const r = await neuf().sendToAdmins("Nouvel utilisateur", "corps");
  ok("aucun administrateur : trace ecrite malgre tout",
     !!lab.trace && lab.trace.titre === "Nouvel utilisateur" && r.parties === 0, "");
}

/* E. L'adresse du secours manque : on ne doit pas pretendre avoir ecrit. */
{
  const lab = monterLab({
    admins: ["ilias"], jetons: {}, adresses: { ilias: "" },
    envoyer: async () => ({})
  });
  const r = await neuf().sendToAdmins("Nouvel utilisateur", "corps");
  ok("sans adresse dans Auth : courrielEnvoye reste faux",
     r.courriel === false && lab.courriels.length === 0, "aucune promesse non tenue");
}

/* ── 3. LA FONCTION DE TEST EXISTE, EST GARDEE, ET DECLARE LE SECRET ────── */
{
  const t = src["notif-admin.js"];
  ok("testerAlerteAdmin est exportee", /exports\.testerAlerteAdmin\s*=\s*onCall/.test(t), "");
  const bloc = t.slice(t.indexOf("exports.testerAlerteAdmin"));
  ok("testerAlerteAdmin refuse qui n'est pas administrateur",
     /admins\/\$\{uid\}/.test(bloc) && /permission-denied/.test(bloc), "");
  ok("testerAlerteAdmin declare BREVO_API_KEY", /secrets:\s*\[\s*BREVO_API_KEY\s*\]/.test(bloc), "");
  ok("testerAlerteAdmin passe par le VRAI sendToAdmins", /await sendToAdmins\(/.test(bloc),
     "un test qui emprunte un autre chemin ne prouve rien");
  ok("testerAlerteAdmin distingue admins et jetons",
     /nbAdmins/.test(bloc) && /nbJetons/.test(bloc), "");
  ok("notif-admin.js reste branche dans index.js",
     /require\("\.\/notif-admin"\)/.test(await readFile(join(F, "index.js"), "utf8")), "");
}

/* ── 3bis. L'ENVELOPPE CLIENT, CONTROLEE POUR CE QU'ELLE EST ───────────────
   AVEU UTILE : la partie navigateur ci-dessous REMPLACE fbTesterAlerteAdmin
   par une doublure — il n'y a pas de Firebase dans un essai. Elle ne prouve
   donc RIEN sur la vraie enveloppe, et elle est passee a 37/37 alors que
   celle-ci appelait un « fns » inexistant. C'est ESLint qui l'a attrape, pas
   ce fichier. On controle donc ici ce qu'un essai peut encore controler :
   que l'enveloppe se procure bien son acces aux fonctions, dans la region du
   deploiement, comme les quinze autres appels du fichier. */
{
  const h = await readFile(join(R, "index.html"), "utf8");
  const d = h.indexOf("window.fbTesterAlerteAdmin");
  const bloc = d === -1 ? "" : h.slice(d, d + 700);
  ok("fbTesterAlerteAdmin existe cote client", d !== -1, "");
  ok("elle se procure getFunctions au lieu d'un « fns » suppose",
     /var fns = getFunctions\(app, "europe-west1"\)/.test(bloc),
     "l'essai navigateur la remplace : il ne peut pas voir cet oubli");
  ok("elle appelle bien testerAlerteAdmin", /httpsCallable\(fns, "testerAlerteAdmin"/.test(bloc), "");
}

/* ── 4. LE PANNEAU, DANS UNE VRAIE PAGE ─────────────────────────────────────
   On appelle le VRAI renderAlertes, avec le VRAI enchainement test puis
   rafraichissement du journal. C'est ce qui attrape le defaut que la premiere
   version de ce panneau avait : effacer son propre verdict. */
const M = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const srv = createServer(async (q, s) => {
  let u = decodeURIComponent(q.url.split("?")[0]); if (u === "/") u = "/index.html";
  try { const b = await readFile(join(R, u)); s.writeHead(200, { "content-type": M[extname(u)] || "application/octet-stream" }); s.end(b); }
  catch { s.writeHead(404); s.end(""); }
});
await new Promise((r) => srv.listen(0, r));
const port = srv.address().port;
const { chromium } = (await import("/opt/node22/lib/node_modules/playwright/index.js")).default;
const nav = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, locale: "fr-BE" });
const pg = await ctx.newPage();
const errs = [];
pg.on("pageerror", (e) => errs.push(String(e && e.message).slice(0, 180)));
await pg.route("**/*", (r) => r.request().url().startsWith(`http://127.0.0.1:${port}/`) ? r.continue() : r.abort());
await pg.addInitScript(() => { try { ["magoOnboard", "magoob", "magotuto", "magoCoach"].forEach((k) => localStorage.setItem(k, "1")); } catch (e) {} });
await pg.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
await pg.waitForFunction(() => typeof window.renderAlertes === "function", { timeout: 40000 });

const dom = await pg.evaluate(async () => {
  const out = [];
  const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
  /* TOLERANT PAR CONSTRUCTION. Un controle doit nommer ce qui manque, pas
     mourir dessus : la premiere version de ce fichier plantait sur l'ancien
     code et n'affichait donc AUCUN defaut — exactement le contraire du but. */
  const el = (id) => document.getElementById(id);
  const txtDe = (id) => { const n = el(id); return n ? n.textContent : ""; };
  const cliquer = async (ms) => { const b = el("alertes-test-go"); if (!b) return false;
    b.click(); await attendre(ms); return true; };
  const sortie = () => el("alertes-test-out") || { style: {}, textContent: "" };
  window.isAdmin = true;
  if (!document.getElementById("admin-list")) {
    const d = document.createElement("div"); d.id = "admin-list"; document.body.appendChild(d);
  }
  let lectures = 0;
  window.fbLireAlertesAdmin = async () => { lectures++; await attendre(30);
    return [{ titre: "Test d'alerte Magofeed", corps: "c", at: Date.now(),
              poussees: 0, jetons: 1, courriel: true, echecs: ["messaging/mismatched-credential"] }]; };

  /* Cas 1 : aucun appareil enregistre. */
  /* LES REPONSES DOIVENT AVOIR LA FORME NEUVE. L'ancienne ne distinguait pas
     mes appareils de ceux des autres administrateurs : c'est precisement ce
     que le panneau a maintenant le devoir de separer. Une reponse a l'ancienne
     forme doit, elle, faire dire a l'ecran que le serveur n'est pas deploye —
     c'est le dernier cas de ce bloc. */
  window.fbTesterAlerteAdmin = async () => ({ admins: 1, lectureAdmins: true, jetons: 0, jaiUnJeton: false,
    mesAppareils: [], mesPoussees: 0, mesJetons: 0, monCourriel: false, courriels: 0,
    adresseSecours: "a@b.test", poussees: 0, courriel: true, echecs: [] });
  window.renderAlertes();
  await attendre(200);
  out.push(["le panneau de test est dessine", !!document.getElementById("alertes-test-go"), ""]);
  out.push(["le journal est dans son propre conteneur", !!document.getElementById("alertes-liste"), ""]);
  out.push(["le bouton de test n'est PAS dans le conteneur du journal",
    !!el("alertes-liste") && !!el("alertes-test-go") && !el("alertes-liste").contains(el("alertes-test-go")),
    "sinon il disparait a chaque lecture"]);
  out.push(["le code d'erreur exact apparait dans le journal",
    /mismatched-credential/.test(txtDe("alertes-liste")), ""]);
  out.push(["le panneau previent que le test depuis son PC est faux",
    /navigation priv/i.test(txtDe("alertes-test")), ""]);

  await cliquer(400);
  let o = sortie();
  out.push(["LE VERDICT SURVIT au rafraichissement du journal", o.style.display === "block" && o.textContent.length > 20,
    `display=${o.style.display || "absent"} len=${o.textContent.length}`]);
  out.push(["0 appareil : le verdict dit que c'est MON compte qui n'en a pas",
    /Aucun appareil enregistre pour TON compte/.test(o.textContent), o.textContent.slice(0, 70)]);
  out.push(["0 appareil : il dit d'autoriser sur CET appareil-ci",
    /SUR CET APPAREIL-CI/.test(o.textContent), ""]);
  out.push(["le journal a bien ete relu apres le test", lectures >= 2, `lectures=${lectures}`]);

  /* Cas 2 : la poussee part. Verdict vert, et pas de promesse de courriel. */
  window.fbTesterAlerteAdmin = async () => ({ admins: 1, lectureAdmins: true, jetons: 3, jaiUnJeton: true,
    mesAppareils: ["iPhone \u00B7 Safari", "Windows \u00B7 Chrome"], mesPoussees: 2, mesJetons: 2,
    monCourriel: false, courriels: 0,
    adresseSecours: "a@b.test", poussees: 3, courriel: false, echecs: [] });
  window.renderAlertes(); await attendre(150);
  await cliquer(400); o = sortie();
  out.push(["envoi accepte : verdict vert", o.style.color === "rgb(21, 128, 61)", o.style.color]);
  out.push(["envoi accepte : ne promet aucun e-mail", !/secours envoye/.test(o.textContent), o.textContent.slice(0, 70)]);
  /* LA LIGNE QUI A COUTE DES SEMAINES. Elle disait « le blocage est dans les
     reglages de notification de l'appareil, pas dans l'app » — une affirmation
     que ces chiffres ne contiennent pas, et qui etait fausse le jour ou elle
     s'est affichee. */
  out.push(["envoi accepte : l'ecran n'accuse PLUS les reglages de l'appareil",
    !/pas dans l'app/.test(o.textContent) && !/pas dans l.app/.test(o.textContent), o.textContent.slice(0, 90)]);
  out.push(["envoi accepte : l'ecran dit que ce n'est pas une preuve d'affichage",
    /PAS UNE PREUVE QUE TON TELEPHONE/.test(o.textContent), ""]);
  out.push(["envoi accepte : MES appareils sont nommes",
    /iPhone/.test(o.textContent) && /Windows/.test(o.textContent), ""]);
  out.push(["envoi accepte : les appareils des autres ne sont pas comptes comme miens",
    /2 de tes 2 appareil/.test(o.textContent), o.textContent.slice(0, 70)]);

  /* Cas 3 : la LECTURE de la collection admins a echoue.
     L'ancien ecran affichait « ton compte n'est pas dans la liste des
     administrateurs » — faux par construction, puisque la fonction serveur
     refuse de repondre a qui n'est pas administrateur. Le zero ne voulait
     jamais dire « tu n'en es pas », mais « je n'ai pas pu lire ». */
  window.fbTesterAlerteAdmin = async () => ({ admins: 0, lectureAdmins: false, jetons: 0, jaiUnJeton: false,
    mesAppareils: [], mesPoussees: 0, mesJetons: 0, monCourriel: false, courriels: 0,
    adresseSecours: "", poussees: 0, courriel: false, echecs: [] });
  window.renderAlertes(); await attendre(150);
  await cliquer(400); o = sortie();
  out.push(["lecture impossible : l'ecran ne pretend PAS que je ne suis pas administrateur",
    /pas pu LIRE/.test(o.textContent) && /tu es bien administrateur/.test(o.textContent), o.textContent.slice(0, 80)]);

  /* Cas 4 : refus de Google. Le code exact doit etre montre. */
  window.fbTesterAlerteAdmin = async () => ({ admins: 1, lectureAdmins: true, jetons: 1, jaiUnJeton: true,
    mesAppareils: ["iPhone \u00B7 Safari"], mesPoussees: 0, mesJetons: 1, monCourriel: true, courriels: 1,
    adresseSecours: "a@b.test", poussees: 0, courriel: true, echecs: ["messaging/mismatched-credential"] });
  window.renderAlertes(); await attendre(150);
  await cliquer(400); o = sortie();
  out.push(["refus Google : le code exact est affiche", /mismatched-credential/.test(o.textContent), o.textContent.slice(0, 80)]);
  out.push(["refus Google : le secours est annonce avec l'adresse", /a@b\.test/.test(o.textContent), ""]);

  /* Cas 4bis : le courriel est parti, mais A UN AUTRE administrateur.
     L'ecran annoncait quand meme l'adresse de celui qui cliquait : il
     fouillait ses indesirables pour un message qui n'y etait pas. */
  window.fbTesterAlerteAdmin = async () => ({ admins: 2, lectureAdmins: true, jetons: 1, jaiUnJeton: false,
    mesAppareils: [], mesPoussees: 0, mesJetons: 0, monCourriel: false, courriels: 1,
    adresseSecours: "a@b.test", poussees: 0, courriel: true, echecs: [] });
  window.renderAlertes(); await attendre(150);
  await cliquer(400); o = sortie();
  out.push(["courriel parti ailleurs : l'ecran ne donne PAS mon adresse",
    !/a@b\.test/.test(o.textContent) && /AUTRE administrateur/.test(o.textContent), o.textContent.slice(0, 90)]);

  /* Cas 4ter : l'ANCIENNE fonction repond encore. L'ecran doit dire qu'il
     manque le deploiement, et non interpreter ses chiffres comme s'ils
     parlaient de moi. */
  window.fbTesterAlerteAdmin = async () => ({ admins: 1, jetons: 1, jaiUnJeton: true,
    adresseSecours: "a@b.test", poussees: 1, courriel: false, echecs: [] });
  window.renderAlertes(); await attendre(150);
  await cliquer(400); o = sortie();
  out.push(["ancienne fonction : l'ecran dit que le serveur n'est pas deploye",
    /pas encore deployee/.test(o.textContent), o.textContent.slice(0, 70)]);

  /* Cas 4quater : LE JOURNAL. Trois lignes, trois etats, et aucun qui promette
     un affichage que personne n'a constate. */
  window.fbLireAlertesAdmin = async () => { lectures++; await attendre(10);
    return [{ titre: "acceptee", corps: "", at: Date.now(), poussees: 2, jetons: 2, courriel: false, fini: true, echecs: [] },
            { titre: "refusee", corps: "", at: Date.now(), poussees: 0, jetons: 1, courriel: false, fini: true, echecs: ["x"] },
            { titre: "sans appareil", corps: "", at: Date.now(), poussees: 0, jetons: 0, courriel: false, fini: true, echecs: [] },
            { titre: "interrompue", corps: "", at: Date.now(), poussees: 0, jetons: 0, courriel: false, fini: false, echecs: [] }]; };
  window.renderAlertes(); await attendre(200);
  const jrn = txtDe("alertes-liste");
  out.push(["le journal ne dit plus « notification envoyee »", !/notification envoy/.test(jrn), jrn.slice(0, 80)]);
  out.push(["le journal dit « envoi accepte par Google »", /envoi accept\u00E9 par Google \(2\)/.test(jrn), ""]);
  out.push(["le journal distingue une trace jamais terminee",
    /envoi interrompu avant la fin/.test(jrn), ""]);
  out.push(["le journal ne dit PAS « interrompu » pour une ligne terminee",
    (jrn.match(/envoi interrompu avant la fin/g) || []).length === 1,
    `${(jrn.match(/envoi interrompu avant la fin/g) || []).length} fois`]);

  /* Cas 5 : fonction pas deployee. Il doit lire quoi deployer, pas un code. */
  window.fbTesterAlerteAdmin = async () => { const e = new Error("not found"); e.code = "functions/not-found"; throw e; };
  window.renderAlertes(); await attendre(150);
  await cliquer(400); o = sortie();
  out.push(["pas deployee : on nomme le fichier a deployer", /notif-admin\.js/.test(o.textContent), o.textContent.slice(0, 80)]);
  out.push(["le bouton redevient cliquable apres un echec",
    !!el("alertes-test-go") && el("alertes-test-go").disabled === false, ""]);

  /* Zero emoji dans tout ce qui a ete dessine. */
  const txt = txtDe("admin-alertes");
  out.push(["aucun emoji dans le panneau",
    !/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u.test(txt), ""]);
  return out;
});
dom.forEach((x) => v.push(x));
ok("aucune erreur JavaScript dans la page", errs.length === 0, errs.join(" | "));

await nav.close(); await new Promise((r) => srv.close(r));
await rm(LAB, { recursive: true, force: true });

let ko = 0;
for (const [n, c, d] of v) { if (!c) ko++; console.log(`${c ? "  ok  " : "  KO  "} ${n}${d ? "   [" + d + "]" : ""}`); }
console.log(`\n${v.length - ko}/${v.length} controles passes`);
process.exit(ko ? 1 : 0);
