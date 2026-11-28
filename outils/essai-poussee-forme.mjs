/* ══ UNE POUSSEE PARTIE N'EST PAS UNE POUSSEE VUE ══════════════════════════
   Le 28/11/2026, le journal des alertes affichait « notification envoyee »
   pour deux vrais arrivants, le test de bout en bout affichait « La poussee
   est partie (1) » en vert, et le telephone du fondateur ne sonnait pas.
   Tout etait vrai : FCM avait bien accepte le message. Personne ne l'affichait.

   DEUX DEFAUTS, ET IL FALLAIT LES DEUX POUR PRODUIRE CE SILENCE :

   1. sendToAdmins envoyait { token, webpush: { notification: {...} } } et RIEN
      d'autre — pas de « notification » de premier niveau, contrairement a
      prevenir() et pushToUser() qui, elles, arrivent. C'etait la seule famille
      d'alertes construite ainsi, et la seule jamais recue.

   2. sw.js lisait « data.notification || data.data », puis sortait sans rien
      afficher quand les deux manquaient, sur un commentaire faux : « payload
      notification natif : deja affiche par le navigateur ». Aucun navigateur
      n'affiche un message pousse tout seul. Et une poussee qui n'affiche rien
      est une poussee silencieuse : Safari et Chrome finissent par retirer
      l'abonnement, donc plus rien n'arrive et rien ne le dit.

   Ce fichier eprouve le VRAI gestionnaire push de sw.js, extrait du fichier
   livre, contre les formes de message reellement envoyees par le serveur.

   node outils/essai-poussee-forme.mjs
   ────────────────────────────────────────────────────────────────────────── */
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const R = "/home/user/magofeed";
const F = join(R, "functions-a-deployer");
const v = [];
const ok = (n, c, d) => v.push([n, !!c, d || ""]);

const sw = await readFile(join(R, "sw.js"), "utf8");

/* On extrait le code LIVRE, on ne le reecrit pas : les essais tautologiques de
   cette session passaient tous sur du code casse. */
function bloc(depart) {
  const d = sw.indexOf(depart);
  if (d === -1) throw new Error("introuvable dans sw.js : " + depart);
  let prof = 0;
  for (let i = sw.indexOf("{", d); i < sw.length; i++) {
    if (sw[i] === "{") prof++;
    else if (sw[i] === "}") {
      prof--;
      if (prof) continue;
      /* Une DECLARATION de fonction s arrete a son accolade ; un
         addEventListener continue par « ) » puis « ; ». Chercher betement le
         prochain « ; » faisait avaler le gestionnaire suivant en entier, et le
         code extrait ne compilait plus. */
      let j = i + 1;
      while (j < sw.length && /\s/.test(sw[j])) j++;
      if (sw[j] === ")") { j++; while (j < sw.length && /\s/.test(sw[j])) j++; if (sw[j] === ";") j++; return sw.slice(d, j); }
      return sw.slice(d, i + 1);
    }
  }
  throw new Error("fin introuvable : " + depart);
}

const codeTap = bloc("function destinationDuTap");
const codePush = bloc('self.addEventListener("push"');

/* Un « self » de laboratoire : il retient ce que le gestionnaire a affiche. */
function lancer(charge, { jsonCasse = false } = {}) {
  const vues = [];
  const attentes = [];
  const self_ = {
    _h: {},
    addEventListener(t, fn) { this._h[t] = fn; },
    registration: {
      showNotification(titre, opts) { vues.push({ titre, ...opts }); return Promise.resolve(); },
    },
  };
  const fabrique = new Function("self", codeTap + "\n" + codePush + "\nreturn self;");
  fabrique(self_);
  const evt = {
    data: charge === undefined ? null : { json() { if (jsonCasse) throw new Error("pas du json"); return charge; } },
    waitUntil(p) { attentes.push(p); },
  };
  self_._h.push(evt);
  return vues;
}

/* ── 1. LA FORME QUI ARRIVE DEJA (prevenir, pushToUser) ──────────────────── */
{
  /* CE QUE FCM LIVRE, PAS CE QUE LE SERVEUR ENVOIE. Les deux ne se ressemblent
     pas : FCM aplatit le bloc webpush. Le commentaire de notifications-push.js
     le dit noir sur blanc — « FCM le livre sous fcmOptions.link ». Ma premiere
     version de cet essai passait l objet d envoi tel quel et faisait echouer un
     controle sur une forme qui n arrive jamais. */
  const vues = lancer({
    notification: { title: "Merci", body: "Quelqu un a confirme", icon: "i" },
    data: { type: "merci" },
    fcmOptions: { link: "https://exemple.test/x" },
  });
  ok("forme deja fonctionnelle : une notification est affichee", vues.length === 1, `${vues.length} affichee(s)`);
  ok("forme deja fonctionnelle : le titre est le bon", vues[0] && vues[0].titre === "Merci", vues[0] && vues[0].titre);
  ok("forme deja fonctionnelle : le tap suit fcmOptions.link",
     vues[0] && vues[0].data && vues[0].data.url === "https://exemple.test/x", vues[0] && vues[0].data && vues[0].data.url);
}

/* ── 2. LA FORME DES ALERTES ADMIN D'AVANT : webpush SEUL ────────────────── */
{
  const vues = lancer({ webpush: { notification: { title: "Nouvel utilisateur Magofeed", body: "Explorateur vient d ouvrir l app" } } });
  ok("webpush seul : une notification est quand meme affichee", vues.length === 1,
     vues.length ? "" : "SILENCE — c est exactement ce que vivait le fondateur");
  ok("webpush seul : le titre vient de webpush.notification",
     vues[0] && vues[0].titre === "Nouvel utilisateur Magofeed", vues[0] && vues[0].titre);
  ok("webpush seul : le corps aussi",
     vues[0] && /Explorateur/.test(vues[0].body || ""), vues[0] && vues[0].body);
}

/* ── 3. FCM A PLAT : le titre sous « notification » de premier niveau ────── */
{
  const vues = lancer({ notification: { title: "Nouvel utilisateur Magofeed", body: "Loup Ultra 438" } });
  ok("notification de premier niveau : affichee avec le bon titre",
     vues.length === 1 && vues[0].titre === "Nouvel utilisateur Magofeed", vues[0] && vues[0].titre);
  ok("sans lien fourni, le tap ouvre quand meme l app",
     vues[0] && vues[0].data && vues[0].data.url === "./", vues[0] && vues[0].data && vues[0].data.url);
}

/* ── 4. CHARGE VIDE OU ILLISIBLE : JAMAIS DE SILENCE ─────────────────────── */
{
  const vide = lancer({});
  ok("charge vide : une notification de repli est affichee", vide.length === 1,
     vide.length ? "" : "poussee silencieuse — Safari et Chrome retirent l abonnement");
  ok("charge vide : le repli s appelle Magofeed", vide[0] && vide[0].titre === "Magofeed", vide[0] && vide[0].titre);

  const casse = lancer({}, { jsonCasse: true });
  ok("json illisible : une notification de repli est affichee quand meme", casse.length === 1,
     casse.length ? "" : "poussee silencieuse");

  const sansData = lancer(undefined);
  ok("aucune donnee du tout : une notification de repli est affichee", sansData.length === 1,
     sansData.length ? "" : "poussee silencieuse");
}

/* ── 5. LE COMMENTAIRE FAUX NE DOIT PAS REVENIR ──────────────────────────── */
/* ON RETIRE LES COMMENTAIRES AVANT DE CHERCHER. Troisieme fois dans cette
   session qu un controle attrape le commentaire qui EXPLIQUE le defaut au lieu
   du defaut : ici, le commentaire cite volontairement l ancienne ligne. */
const swNu = sw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
ok("la sortie anticipee sans rien afficher a disparu du code",
   !/if\s*\(!n\.title\s*&&\s*!n\.body\)\s*return;/.test(swNu),
   "aucun navigateur n affiche une poussee tout seul : cette ligne cassait le canal");

/* ── 6. TOUT ENVOI SERVEUR PORTE UN TITRE DE PREMIER NIVEAU ──────────────── */
{
  const fichiers = (await readdir(F)).filter((f) => f.endsWith(".js"));
  let examines = 0;
  for (const f of fichiers) {
    const t = await readFile(join(F, f), "utf8");
    let i = 0;
    while ((i = t.indexOf("getMessaging().send(", i)) !== -1) {
      /* LA PARENTHESE DE send, PAS CELLE DE getMessaging. En cherchant la
         premiere « ( » apres la position, on tombait sur « getMessaging() »,
         qui se referme aussitot : l appel extrait etait vide et les neuf
         controles echouaient sur du code parfaitement correct. */
      let prof = 0, j = i + "getMessaging().send".length, fin = j;
      for (; j < t.length; j++) {
        if (t[j] === "(") prof++;
        else if (t[j] === ")") { prof--; if (!prof) { fin = j; break; } }
      }
      const appel = t.slice(i, fin + 1);
      const ligne = t.slice(0, i).split("\n").length;
      examines++;
      /* « notification » hors du bloc webpush : on retire le bloc webpush puis
         on cherche. Sans ce retrait, webpush.notification ferait passer le
         controle et on n aurait rien verifie du tout. */
      /* RETIRER webpush PAR COMPTAGE D ACCOLADES. Une expression reguliere
         s arretait a la premiere accolade fermante et laissait
         webpush.notification dans le texte : les neuf envois passaient alors
         le controle sans que rien ne soit verifie. */
      const sansWebpush = (function () {
        const k = appel.indexOf("webpush");
        if (k === -1) return appel;
        let o = appel.indexOf("{", k), p2 = 0, m = o;
        for (; m < appel.length; m++) {
          if (appel[m] === "{") p2++;
          else if (appel[m] === "}") { p2--; if (!p2) break; }
        }
        return appel.slice(0, k) + appel.slice(m + 1);
      })();
      ok(`${f}:${ligne} envoie un titre de premier niveau`,
         /\bnotification\s*:/.test(sansWebpush) || /\bdata\s*:\s*\{[^}]*title/.test(sansWebpush),
         "sinon sw.js ne trouve ni data.notification ni data.data : rien ne s affiche");
      i = fin;
    }
  }
  ok("au moins trois envois ont ete examines", examines >= 3, `${examines} envois`);
}

/* ── 7. L ALERTE ADMIN, PRECISEMENT ──────────────────────────────────────── */
{
  const t = await readFile(join(F, "outils-admin.js"), "utf8");
  const d = t.indexOf("async function sendToAdmins");
  const b = t.slice(d, t.indexOf("async function pushToUser"));
  ok("sendToAdmins envoie titre et corps en premier niveau",
     /notification:\s*\{\s*title:\s*title,\s*body:\s*body\s*\}/.test(b), "");
  ok("sendToAdmins fournit un lien pour le tap", /fcmOptions:\s*\{\s*link:/.test(b), "");
  ok("sendToAdmins garde l icone", /icon:\s*"icons\/icon-192\.png"/.test(b), "");
}

let ko = 0;
for (const [n, c, d] of v) { if (!c) ko++; console.log(`${c ? "  ok  " : "  KO  "} ${n}${d ? "   [" + d + "]" : ""}`); }
console.log(`\n${v.length - ko}/${v.length} controles passes`);
process.exit(ko ? 1 : 0);
