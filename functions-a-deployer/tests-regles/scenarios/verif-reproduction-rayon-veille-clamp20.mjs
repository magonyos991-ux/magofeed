/* VERIFICATION INDEPENDANTE — « le rayon de veille au-dela de 20 km retombe a 10 km »
   ---------------------------------------------------------------------------------
   Ce scenario ne recopie RIEN a la main. Il EXTRAIT du depot, a l'execution :
     - la ligne de clamp du serveur   functions-a-deployer/notifications-push.js:346
     - la ligne de clamp des e-mails  functions-a-deployer/emails-brevo.js:313
     - la fonction de distance        notifications-push.js:148-152
     - les bornes du curseur          index.html (HR_MIN / HR_MAX)
     - la ligne de rayon de fbSyncWatch  index.html:5014
   puis il les evalue telles quelles. Si le depot change, ce scenario change avec lui.
   Les ECRITURES, elles, passent par les VRAIES regles de l'emulateur. */
import { banc, doit, doitEchouer, note, bilan } from "../banc.mjs";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import fs from "node:fs";

const RACINE = "/home/user/magofeed";
const SRC_PUSH  = fs.readFileSync(RACINE + "/functions-a-deployer/notifications-push.js", "utf8");
const SRC_MAIL  = fs.readFileSync(RACINE + "/functions-a-deployer/emails-brevo.js", "utf8");
const SRC_APP   = fs.readFileSync(RACINE + "/index.html", "utf8");
const L_PUSH = SRC_PUSH.split("\n"), L_MAIL = SRC_MAIL.split("\n"), L_APP = SRC_APP.split("\n");

/* -- 1. Ce que le SERVEUR applique : la ligne 346, extraite, pas recopiee. -- */
const LIGNE_CLAMP_PUSH = L_PUSH[345];               // index 345 = ligne 346
const LIGNE_CLAMP_MAIL = L_MAIL[312];               // index 312 = ligne 313
if (!/wd\.radius/.test(LIGNE_CLAMP_PUSH)) throw new Error("notifications-push.js:346 n'est plus la ligne de clamp : " + LIGNE_CLAMP_PUSH);
if (!/wd\.radius/.test(LIGNE_CLAMP_MAIL)) throw new Error("emails-brevo.js:313 n'est plus la ligne de clamp : " + LIGNE_CLAMP_MAIL);
const rayonServeurPush = new Function("wd", LIGNE_CLAMP_PUSH.replace(/^\s*const\s+/, "const ") + "\n return radius;");
const rayonServeurMail = new Function("wd", LIGNE_CLAMP_MAIL.replace(/^\s*const\s+/, "const ") + "\n return radius;");

/* -- 2. La distance du serveur : le corps de _dist, extrait du fichier. -- */
const iDist = L_PUSH.findIndex((l) => /^function _dist\(/.test(l));
const CORPS_DIST = L_PUSH.slice(iDist, iDist + 5).join("\n");
const _dist = new Function(CORPS_DIST + "\n return _dist;")();

/* -- 3. Les bornes du curseur, extraites de index.html. -- */
const mBornes = SRC_APP.match(/var HR_MIN\s*=\s*(\d+)\s*,\s*HR_MAX\s*=\s*(\d+)/);
const HR_MIN = Number(mBornes[1]), HR_MAX = Number(mBornes[2]);
const mInput = SRC_APP.match(/id="hr-range"[^>]*min="(\d+)"[^>]*max="(\d+)"/);

/* -- 4. Le rayon que fbSyncWatch ecrit (index.html:5014), extrait aussi. -- */
const iSync = L_APP.findIndex((l) => /window\.fbSyncWatch = async function/.test(l));
const LIGNE_RAYON_SYNC = L_APP.slice(iSync, iSync + 12).find((l) => /var radius = /.test(l));
const rayonEcritParLApp = new Function("magoHuntRadius",
  "const window={magoHuntRadius:magoHuntRadius};" + LIGNE_RAYON_SYNC + "\n return radius;");

note("Extrait du depot — curseur « Ta zone » : HR_MIN=" + HR_MIN + ", HR_MAX=" + HR_MAX
  + " (index.html) ; balise <input> : min=" + mInput[1] + ", max=" + mInput[2] + " (index.html:757).");
note("Extrait du depot — notifications-push.js:346 :" + LIGNE_CLAMP_PUSH.trim());
note("Extrait du depot — emails-brevo.js:313   :" + LIGNE_CLAMP_MAIL.trim());

/* ── L'emulateur : Alice ecrit sa veille comme l'application le fait ─────── */
const env = await banc("verif-rayon-veille-clamp20");
const alice = env.authenticatedContext("alice").firestore();
const ALICE = "alice";
const ALICE_LAT = 50.8466, ALICE_LNG = 4.3528;
const BOISSON = 4242;

/* fbSyncWatch (index.html:5007-5027), recopie champ par champ, avec le rayon
   que la ligne 5014 extraite du fichier calcule pour un curseur regle sur 50. */
const RAYON_CHOISI = 50;
const rayonEcrit = rayonEcritParLApp(RAYON_CHOISI);

await doit("le curseur monte jusqu'a 50 km et fbSyncWatch ecrit bien ce chiffre", async () => {
  if (HR_MAX !== 50 || Number(mInput[2]) !== 50) throw new Error("le curseur ne va plus a 50 km");
  if (rayonEcrit !== 50) throw new Error("fbSyncWatch ecrirait " + rayonEcrit + " et non 50");
  await setDoc(doc(alice, "watches", ALICE + "_" + BOISSON), {
    uid: ALICE, drinkId: Number(BOISSON), drinkName: "Fritz-Kola sans sucre",
    lat: ALICE_LAT, lng: ALICE_LNG, radius: rayonEcrit, createdAt: serverTimestamp(),
  });
  const s = await getDoc(doc(alice, "watches", ALICE + "_" + BOISSON));
  if (s.data().radius !== 50) throw new Error("les regles ont laisse passer radius = " + s.data().radius);
});

/* La boisson est reperee a ~15 km au nord (0.135 deg de latitude x 111 km). */
const MAG_LAT = ALICE_LAT + 0.135;
const distance = _dist(MAG_LAT, ALICE_LNG, ALICE_LAT, ALICE_LNG);

await doit("Alice, zone reglee sur 50 km, est prevenue d'une boisson reperee a "
  + distance.toFixed(1) + " km (push)", async () => {
  const s = await getDoc(doc(alice, "watches", ALICE + "_" + BOISSON));
  const wd = s.data();
  const applique = rayonServeurPush(wd);
  if (distance > applique)
    throw new Error("le serveur se tait — rayon choisi " + wd.radius
      + " km, rayon applique " + applique + " km, distance " + distance.toFixed(1) + " km");
});

await doit("le meme parcours par e-mail (emails-brevo.js:313) la previent", async () => {
  const s = await getDoc(doc(alice, "watches", ALICE + "_" + BOISSON));
  const applique = rayonServeurMail(s.data());
  if (distance > applique)
    throw new Error("l'e-mail se tait aussi — rayon applique " + applique + " km");
});

/* Contre-epreuve : le meme compte, curseur baisse a 20 km, est-il prevenu ? */
await doit("CONTRE-EPREUVE : avec 20 km (moins que 50), Alice est prevenue de la meme boisson", async () => {
  const applique = rayonServeurPush({ radius: rayonEcritParLApp(20) });
  if (distance > applique)
    throw new Error("meme a 20 km elle n'est pas prevenue (rayon applique " + applique + ")");
});

/* Table complete, calculee avec la ligne extraite du depot. */
const table = [1, 5, 10, 19, 20, 21, 25, 30, 50]
  .map((k) => k + "->" + rayonServeurPush({ radius: rayonEcritParLApp(k) }));
note("Rayon reellement applique par notifications-push.js:346 (ligne extraite du depot) : "
  + table.join(", ") + " km.");
const zone20 = Math.PI * Math.pow(rayonServeurPush({ radius: 20 }), 2);
const zone50 = Math.PI * Math.pow(rayonServeurPush({ radius: 50 }), 2);
note("Surface reellement surveillee : curseur a 20 km -> " + Math.round(zone20)
  + " km2 ; curseur a 50 km -> " + Math.round(zone50)
  + " km2. Monter le curseur de 20 a 50 divise la zone par " + (zone20 / zone50).toFixed(1) + ".");
note("Les regles Firestore (firestore.rules:1018-1027) ne bornent pas `radius` : "
  + "le 50 est bien stocke, c'est le serveur qui le jette.");

await bilan(env);
