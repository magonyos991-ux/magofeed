/**
 * Magofeed — POINT D'ENTREE UNIQUE des Cloud Functions.
 *
 * ============================================================================
 * POURQUOI CE FICHIER EXISTE
 * ============================================================================
 * Les fonctions de Magofeed ont ete deployees au fil des mois depuis PLUSIEURS
 * dossiers differents sur le PC d'Ilias. Consequence : le jour ou on deployait
 * depuis l'un, Firebase constatait que les fonctions de l'autre n'etaient plus
 * dans le code source et proposait de les SUPPRIMER. Un « oui » de trop et huit
 * fonctions qui marchent disparaissaient : reconnaissance de boisson, scan de
 * frigo, remplissage d'enseignes, import d'horaires, notifications.
 *
 * Ce fichier met fin a ca. Il branche TOUT ce qui doit tourner, en un seul
 * endroit. Un seul dossier, une seule verite.
 *
 * ============================================================================
 * REGLE A NE JAMAIS OUBLIER
 * ============================================================================
 * Si Firebase demande « Would you like to proceed with deletion? », la reponse
 * est NON, sauf si tu sais precisement quelle fonction disparait et pourquoi.
 * Repondre non ne bloque rien : le reste du deploiement continue.
 *
 * ============================================================================
 * CE QUI EST BRANCHE, ET CE QUI NE L'EST PAS
 * ============================================================================
 * Chaque ligne active ci-dessous correspond a des fonctions qui tournent
 * aujourd'hui en production, verifiees une par une. Les lignes en commentaire
 * attendent quelque chose que tu n'as pas encore ; les activer maintenant
 * ferait ECHOUER le deploiement du lot entier, points compris.
 */

/* ── Les points. Sans elles, personne ne gagne rien. ─────────────────────── */
Object.assign(exports, require("./points-et-parrainage"));

/* ── La sanction anti-triche : un faux stock contredit sur place coute des
      points, et la sanction ne peut pas s'effacer. ─────────────────────────*/
Object.assign(exports, require("./anti-farm"));

/* ── Les notifications push : decouverte promue, photo a refaire, chasse pres
      de toi, stock guette. ─────────────────────────────────────────────────*/
Object.assign(exports, require("./notifications-push"));

/* ── Les e-mails de chasse (Brevo). Secret BREVO_API_KEY : deja en place. ──*/
Object.assign(exports, require("./emails-brevo"));

/* ── La reconnaissance de boisson par photo. Secret ANTHROPIC_API_KEY : deja
      en place. ─────────────────────────────────────────────────────────────*/
Object.assign(exports, require("./reconnaissance-ia"));

/* ── Le scan de frigo : une photo, tout un rayon. Meme secret. ────────────*/
Object.assign(exports, require("./scan-frigo"));

/* ── Les commerces du monde entier (Overture Maps), quand OpenStreetMap ne
      connait presque rien dans la zone. ────────────────────────────────────*/
Object.assign(exports, require("./commerces-monde"));

/* ── Le rayon PROBABLE des enseignes connues. N'ecrit jamais « verifie » :
      un catalogue d'enseigne dit ce qu'on trouve d'habitude, il ne constate
      rien. ─────────────────────────────────────────────────────────────────*/
Object.assign(exports, require("./remplir-enseignes"));

/* ── L'import des horaires d'ouverture depuis OpenStreetMap. ──────────────*/
Object.assign(exports, require("./importer-horaires"));

/* ── L'apercu des liens partages pour ce qui n'a pas de page pre-generee. ─*/
Object.assign(exports, require("./partage"));

/* ── La sauvegarde de toute la base, chaque nuit, plus un bouton dans
      l'administration. ─────────────────────────────────────────────────────*/
Object.assign(exports, require("./sauvegarde"));

/* ── La notification a chaque don Ko-fi. Secret KOFI_JETON : deja en place. */
Object.assign(exports, require("./don-notification"));

/* ── RECUPEREES LE 4 SEPTEMBRE 2026 ───────────────────────────────────────
   Ces deux fonctions tournaient en production depuis le 26 juillet sans
   qu'aucune copie n'existe dans le depot : elles avaient ete deployees a la
   main, avant l'existence de ce dossier. C'est pour elles que Firebase
   proposait une suppression, et un « oui » les aurait effacees pour de bon.
   Elles ont maintenant un foyer et repartent avec toutes les autres. ──────*/
Object.assign(exports, require("./notif-admin"));
Object.assign(exports, require("./catalogue-ia"));

/* ══════════════════════════════════════════════════════════════════════════
   PAS ENCORE BRANCHE — et pourquoi
   ══════════════════════════════════════════════════════════════════════════

   Le paiement commercant et le don par carte. Les deux reclament des secrets
   Stripe qui n'existent pas encore dans le projet, et le paquet npm stripe.
   Les activer avant d'avoir fait les deux ferait echouer TOUT le deploiement,
   y compris les points.

     Object.assign(exports, require("./verification-commercant"));
     Object.assign(exports, require("./dons"));

   Le jour ou tu as un compte Stripe, dans le dossier functions :
     npm install stripe
     firebase functions:secrets:set STRIPE_CLE
     firebase functions:secrets:set STRIPE_WEBHOOK
     firebase functions:secrets:set STRIPE_WEBHOOK_DON
   puis enleve les deux slashs devant les lignes ci-dessus.

   ──────────────────────────────────────────────────────────────────────────

   Le recap quotidien du fondateur : chaque soir, une push sur ton telephone
   avec les chiffres reels de la journee. Aucun secret, aucune dependance —
   il ne manque que ta decision, parce qu'il t'envoie une notification par
   jour, tous les jours.

     Object.assign(exports, require("./recap-fondateur"));

   ══════════════════════════════════════════════════════════════════════════
   CE QUI N'EST PAS ICI, ET NE DOIT PAS Y ETRE
   ══════════════════════════════════════════════════════════════════════════

   migration-geohash.js n'est pas une Cloud Function : c'est un script qu'on
   lance une fois a la main, depuis un terminal. Le brancher ici le ferait
   tourner comme une fonction, ce qui n'a aucun sens.

   outils-admin.js n'exporte qu'une fonction utilitaire, sendToAdmins, dont
   se servent notif-admin.js et catalogue-ia.js. Le brancher ferait croire a
   Firebase qu'il y a une fonction a deployer dedans.

   ══════════════════════════════════════════════════════════════════════════
   ET UNE QUI A ETE SUPPRIMEE POUR DE BON
   ══════════════════════════════════════════════════════════════════════════

   notifyWatchers ecoutait stores/{storeId} en « written », exactement comme
   notifyStockToWatchers en « updated ». Les deux partaient a chaque mise a
   jour d'un magasin : les gens recevaient DEUX notifications au lieu d'une,
   depuis le 26 juillet. Celle qu'on garde porte en plus le garde-fou contre
   la tempete (silence au-dela de trois boissons ajoutees d'un coup) et le
   recoupement d'identite du destinataire. L'ancienne n'avait ni l'un ni
   l'autre. Son code a ete lu, compris, et volontairement pas conserve.
*/
