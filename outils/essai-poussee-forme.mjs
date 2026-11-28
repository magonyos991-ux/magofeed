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

/* ── 2. L ANCIEN ENVOI ADMIN, TEL QUE FCM LE LIVRAIT VRAIMENT ────────────── */
/* CE CONTROLE A ETE REECRIT, ET C EST LE PLUS IMPORTANT DU FICHIER.
   Sa premiere version nourrissait le gestionnaire d un objet portant une cle
   « webpush » au premier niveau, puis constatait qu il fallait la lire. Or FCM
   NE LIVRE JAMAIS cette cle : il aplatit le bloc webpush dans la notification
   commune. Le controle mesurait donc la reaction du code a une charge
   imaginaire, et il « prouvait » un diagnostic faux.
   Trois sources relues, aucune ambigue :
     - gstatic.com/firebasejs/10.12.2/firebase-messaging-sw.js, le service
       worker officiel de Google : il teste payload.notification au premier
       niveau, et le mot « webpush » n y figure pas une seule fois ;
     - MessagePayloadInternal, l interface du SDK : notification, data,
       fcmOptions, from, collapse_key, fcmMessageId. Pas de webpush ;
     - la reference REST de FCM : webpush.notification « override » les champs
       de la notification commune — il les remplace, il ne vit pas a cote.
   Conclusion a garder en tete : la forme de la charge n a jamais ete la cause
   du silence du fondateur. La cause etait un seul jeton push par compte, pris
   par le dernier appareil ouvert (voir outils-admin.js et essai-alerte-admin). */
{
  const vues = lancer({
    notification: { title: "Nouvel utilisateur Magofeed", body: "Explorateur vient d ouvrir l app", icon: "icons/icon-192.png" },
    from: "1", collapse_key: "do_not_collapse", fcmMessageId: "x",
  });
  ok("ancien envoi admin, aplati par FCM : affiche", vues.length === 1,
     vues.length ? "" : "SILENCE");
  ok("ancien envoi admin, aplati par FCM : le vrai titre",
     vues[0] && vues[0].titre === "Nouvel utilisateur Magofeed", vues[0] && vues[0].titre);
  ok("ancien envoi admin, aplati par FCM : le corps",
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

/* ── 6. LE CODE MORT NE DOIT PAS REVENIR ─────────────────────────────────── */
ok("sw.js ne lit plus data.webpush : FCM ne le livre jamais",
   !/data\s*\.\s*webpush/.test(swNu),
   "cette lecture a fait croire a une panne de forme alors que la panne etait le jeton unique");

/* ── 7. UNE SEULE PORTE DE SORTIE POUR LES POUSSEES ──────────────────────── */
/* L INVARIANT A CHANGE, ET EN MIEUX. Avant, onze endroits construisaient
   chacun leur message et leur propre gestion du jeton mort : c est ainsi qu un
   seul d entre eux a pu partir des mois dans une forme differente, et qu une
   suppression de jeton a pu emporter la position et le rayon de zone de la
   personne. Tout passe maintenant par message() et envoyerPush(), dans
   outils-admin.js. Le controle verifie donc ce point de passage unique, puis
   qu aucun fichier ne le contourne. */
{
  const oa = await readFile(join(F, "outils-admin.js"), "utf8");

  const dm = oa.indexOf("function message(");
  const bm = oa.slice(dm, oa.indexOf("async function sendToAdmins"));
  ok("message() met titre et corps au PREMIER niveau",
     /notification:\s*\{\s*title:\s*titre,\s*body:\s*corps\s*\}/.test(bm), "");
  ok("message() garde l icone et le badge dans webpush",
     /icon:\s*"icons\/icon-192\.png"/.test(bm) && /badge:/.test(bm), "");
  ok("message() fournit toujours un lien pour le tap",
     /fcmOptions:\s*\{\s*link:/.test(bm), "");

  const de = oa.indexOf("async function envoyerPush(");
  const be = oa.slice(de, oa.indexOf("function message("));
  ok("envoyerPush envoie a TOUS les appareils, pas au dernier ouvert",
     /for\s*\(const j of liste\)/.test(be), "");
  ok("envoyerPush n efface que le jeton mort, pas le document",
     /jetonMort\(e\)\s*\)\s*await oublierJeton/.test(be) && !/\.delete\(\)/.test(be), "");

  /* AUCUN FICHIER NE DOIT PLUS SUPPRIMER LE DOCUMENT ENTIER. Il porte aussi la
     position, le rayon de zone et le choix du secours : un seul appareil
     remplace rendait les notifications « pres de toi » muettes pour une raison
     sans aucun rapport. */
  const fichiers = (await readdir(F)).filter((f) => f.endsWith(".js"));
  let coupables = [];
  let passants = 0;
  for (const f of fichiers) {
    const src = await readFile(join(F, f), "utf8");
    const nu = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    if (/collection\("pushTokens"\)\s*\.doc\([^)]*\)\s*\.delete\(\)/.test(nu)) coupables.push(f);
    if (/envoyerPush|jetonsDe|jetonsDuDoc/.test(nu)) passants++;
  }
  ok("aucun fichier ne supprime le document pushTokens entier", !coupables.length, coupables.join(", "));
  ok("les envois passent par le module partage", passants >= 5, `${passants} fichier(s)`);

  /* LA LECTURE D UN JETON UNIQUE NE DOIT PLUS EXISTER : c est elle qui ne
     servait que le dernier appareil ouvert. */
  let lecteursUniques = [];
  for (const f of fichiers) {
    const src = await readFile(join(F, f), "utf8");
    const nu = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    if (/\.data\(\)\s*\.token|\.data\(\)\s*\|\|\s*\{\}\)\.token/.test(nu)) lecteursUniques.push(f);
  }
  ok("plus personne ne lit un jeton unique par compte", !lecteursUniques.length, lecteursUniques.join(", "));
}

/* ── 8. LE CLIENT ECRIT UNE ENTREE PAR APPAREIL ──────────────────────────── */
{
  const html = await readFile("/home/user/magofeed/index.html", "utf8");
  ok("le client nomme l appareil", /window\.magoNomAppareil\s*=/.test(html), "");
  ok("le client donne un identifiant stable a l appareil", /window\.magoIdAppareil\s*=/.test(html), "");
  /* LES DEUX CHEMINS. Le natif (Capacitor) et le web ecrivent chacun leur
     charge : en corriger un seul laissait l autre voler le jeton. */
  ok("les DEUX chemins d ecriture posent l entree d appareil",
     (html.match(/jetons:\s*_chargeAppareil\(/g) || []).length >= 3,
     `${(html.match(/jetons:\s*_chargeAppareil\(/g) || []).length} ecriture(s) (web, natif, extinction)`);
  ok("l extinction ne coupe QUE cet appareil",
     /fbDisablePush[\s\S]{0,600}jetons:\s*_chargeAppareil\(null\)/.test(html), "");
}

/* ── 9. L ECRAN N AFFIRME PLUS CE QU IL NE SAIT PAS ──────────────────────── */
{
  const html = await readFile("/home/user/magofeed/index.html", "utf8");
  /* ON RETIRE LES COMMENTAIRES : ils citent volontairement les phrases
     fautives pour expliquer pourquoi elles ont disparu. Quatrieme fois dans
     cette session qu un controle attrape l explication au lieu du defaut. */
  const nu = html.replace(/\/\*[\s\S]*?\*\//g, "");
  ok("l app ne dit plus « le blocage est dans les reglages de l appareil, pas dans l app »",
     !/blocage est dans les reglages de notification de l\\?.appareil, pas dans l/.test(nu),
     "elle l a dit le 28 novembre a 08h23, et c etait faux");
  ok("le journal ne dit plus « notification envoyee »",
     !/etat="notification envoy/.test(nu),
     "le serveur ne sait pas si une notification a ete affichee");
  ok("le verdict distingue MES appareils de ceux des autres",
     /r\.mesPoussees/.test(nu) && /r\.mesJetons/.test(nu), "");
  ok("le verdict dit explicitement que l acceptation n est pas une preuve d affichage",
     /PAS UNE PREUVE QUE TON TELEPHONE/.test(nu), "");
}

let ko = 0;
for (const [n, c, d] of v) { if (!c) ko++; console.log(`${c ? "  ok  " : "  KO  "} ${n}${d ? "   [" + d + "]" : ""}`); }
console.log(`\n${v.length - ko}/${v.length} controles passes`);
process.exit(ko ? 1 : 0);
