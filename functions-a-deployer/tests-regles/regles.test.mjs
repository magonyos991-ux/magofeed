/* Magofeed — banc d'essai des regles Firestore.
 *
 * A QUOI CA SERT : une regle Firestore ne previent jamais quand elle laisse
 * passer quelque chose. Ce fichier pose la question a l'envers — il ESSAIE
 * d'attaquer la base, et echoue si l'attaque reussit. Il verifie aussi que les
 * usages normaux passent toujours : une regle trop serree casse l'app aussi
 * surement qu'une regle trop lache la met en danger.
 *
 * C'est ce banc d'essai qui a trouve que « match /{doc=**} » sous users/{uid}
 * couvrait le document lui-meme et annulait en silence toutes les protections
 * du profil, sanction anti-triche comprise.
 *
 * COMMENT LE LANCER (une seule fois : npm install) :
 *     cd functions-a-deployer/tests-regles
 *     npm install
 *     npm test
 * Il faut Java installe (l'emulateur Firestore tourne dessus). Rien n'est
 * envoye en ligne : tout se passe sur ta machine, sur une base jetable.
 *
 * A FAIRE A CHAQUE FOIS QUE TU MODIFIES firestore.rules : relance « npm test »
 * AVANT « firebase deploy --only firestore:rules ». Si une ligne passe de
 * « ok » a « ECHEC », ne deploie pas.
 */
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, getDoc, getDocs, deleteDoc, collection, addDoc,
         writeBatch, increment, arrayUnion, serverTimestamp, Timestamp } from 'firebase/firestore';
import fs from 'fs';

const env = await initializeTestEnvironment({
  projectId: 'magofeed-test',
  firestore: { rules: fs.readFileSync('firestore.rules','utf8'), host:'127.0.0.1', port:8391 },
});
const R=[]; let ko=0;
async function doit(nom, fn){ try{ await fn(); R.push(['ok  ',nom]); }
                              catch(e){ ko++; R.push(['ECHEC',nom+' — '+String(e.message).slice(0,110)]); } }

const ALICE='alice', MALLORY='mallory', ADMIN='admin1', NOUVEAU='nouveau1';
const a = env.authenticatedContext(ALICE).firestore();
const m = env.authenticatedContext(MALLORY).firestore();
const ad = env.authenticatedContext(ADMIN).firestore();
const anon = env.unauthenticatedContext().firestore();
// Identite SANS document : sert a tester la CREATION de profil, pas sa mise a jour.
const nv = env.authenticatedContext(NOUVEAU).firestore();

await env.withSecurityRulesDisabled(async (c)=>{
  const db=c.firestore();
  await setDoc(doc(db,'admins',ADMIN),{ok:true});
  await setDoc(doc(db,'users',ALICE),{pseudo:'Alice',points:10,streak:2,avatar:null,favs:[]});
  await setDoc(doc(db,'stores','s1'),{name:'Night Ixelles',brand:'',lat:50.82,lng:4.37,
      addedBy:ALICE,drinks:[1,2],drinksVerified:[1],confirmations:{1:3},seenAt:{1:1}});
  await setDoc(doc(db,'discoveries','d1'),{by:ALICE,name:'Ramune',votes:1,foundIn:[]});
  await setDoc(doc(db,'stats','drinkRatings'),{'1':{n:5,s:20}});
  await setDoc(doc(db,'hunts','7'),{drinkId:7,seekers:{[ALICE]:{lat:50.8,lng:4.3,at:1}}});
});

/* ── ce qui doit rester POSSIBLE (usages legitimes) ────────────────────── */
/* 'points' n'est plus ecrit par le client : le score officiel est calcule par
   les Cloud Functions a partir des contributions reellement verifiables. Le
   profil ne porte plus que ce que son proprietaire a le droit de decider. */
await doit('legitime : Alice met a jour son profil',
  ()=>assertSucceeds(setDoc(doc(a,'users',ALICE),{pseudo:'Alice',streak:3},{merge:true})));
await doit('bloque : s ecrire 999999 points',
  ()=>assertFails(setDoc(doc(a,'users',ALICE),{points:999999},{merge:true})));
await doit('bloque : se donner des points de parrainage',
  ()=>assertFails(setDoc(doc(a,'users',ALICE),{refPoints:5000,refCount:99},{merge:true})));
/* LA FAILLE QUE CES TROIS TESTS FERMENT. La protection ci-dessus ne portait
   que sur la MODIFICATION. La CREATION, elle, n'interdisait que les compteurs
   d'e-mails et la sanction : « points » n'y figurait pas. Or chacun a le droit
   d'effacer son propre profil. Il suffisait donc de le supprimer, puis de le
   recreer avec points: 999999 — et toute la protection du classement tombait.
   Les deux regles partagent desormais une seule liste, champsServeur(). */
await doit('bloque : CREER son profil avec 999999 points',
  ()=>assertFails(setDoc(doc(m,'users',MALLORY),{pseudo:'M',points:999999})));
await doit('bloque : effacer son profil puis le recreer avec des points',
  async ()=>{ await assertSucceeds(deleteDoc(doc(a,'users',ALICE)));
              await assertFails(setDoc(doc(a,'users',ALICE),{pseudo:'Alice',points:999999}));
              await assertSucceeds(setDoc(doc(a,'users',ALICE),{pseudo:'Alice',streak:0})); });
await doit('legitime : creer un profil normal a l inscription',
  ()=>assertSucceeds(setDoc(doc(m,'users',MALLORY),
      {pseudo:'Mallory',avatar:null,favs:[],streak:0,bestStreak:0,confirms:0,signals:0,discAccepted:0})));
/* Le document que l'app ecrit VRAIMENT a la premiere connexion (index.html,
   onAuthStateChanged). Il portait « points: 0 » : inoffensif en apparence, mais
   la regle refuse le champ, donc le document ENTIER etait rejete — pas de
   pseudo, et surtout pas de createdAt, dont depend le garde-fou anti-sybil du
   parrainage. Ce test fige la forme reelle du document d'inscription. */
await doit('legitime : le document exact ecrit a la premiere connexion',
  ()=>assertSucceeds(setDoc(doc(m,'users',MALLORY),
      {pseudo:'Explorateur',signals:0,confirms:0,createdAt:serverTimestamp()},{merge:true})));
await doit('bloque : le meme document avec points:0 (le champ appartient au serveur)',
  ()=>assertFails(setDoc(doc(nv,'users',NOUVEAU),
      {pseudo:'Explorateur',points:0,signals:0,confirms:0,createdAt:serverTimestamp()})));
await doit('legitime : et sans points, la creation passe',
  ()=>assertSucceeds(setDoc(doc(nv,'users',NOUVEAU),
      {pseudo:'Explorateur',signals:0,confirms:0,createdAt:serverTimestamp()})));
await doit('legitime : avatar photo normal',
  ()=>assertSucceeds(setDoc(doc(a,'users',ALICE),{avatar:{type:'photo',v:'data:image/png;base64,AAAA'}},{merge:true})));
await doit('legitime : quelqu un confirme une boisson en rayon',
  ()=>assertSucceeds(updateDoc(doc(m,'stores','s1'),
      {drinks:arrayUnion(9),'confirmations.9':increment(1),'seenAt.9':Date.now()})));
await doit('legitime : le createur renomme SON magasin',
  ()=>assertSucceeds(updateDoc(doc(a,'stores','s1'),{name:'Night Ixelles bis'})));
await doit('legitime : import OSM cree un magasin (rayon probable, sans « verifie »)',
  ()=>assertSucceeds(setDoc(doc(m,'stores','sNouveau'),
      {name:'Carrefour Flagey',lat:50.8,lng:4.3,drinks:[1,2],osmImport:true})));
await doit('bloque : creer un magasin deja marque verifie',
  ()=>assertFails(setDoc(doc(m,'stores','sTriche'),
      {name:'Faux',lat:50.8,lng:4.3,drinks:[1],drinksVerified:[1]})));
await doit('legitime : un vote de decouverte (lot atomique comme dans l app)',
  ()=>{ const b=writeBatch(m);
        b.update(doc(m,'discoveries','d1'),{votes:increment(1)});
        b.set(doc(m,'discoveries','d1','votedBy',MALLORY),{votedAt:serverTimestamp()});
        return assertSucceeds(b.commit()); });
await doit('legitime : increment d une note communautaire',
  ()=>assertSucceeds(setDoc(doc(m,'stats','drinkRatings'),{'2':{n:1,s:4}},{merge:true})));
await doit('legitime : l admin efface une statistique',
  ()=>assertSucceeds(deleteDoc(doc(ad,'stats','drinkRatings'))));

/* ── ce qui doit etre BLOQUE (attaques) ────────────────────────────────── */
await doit('bloque : Mallory pose la pastille verte sur un magasin',
  ()=>assertFails(updateDoc(doc(m,'stores','s1'),{drinksVerified:arrayUnion(42)})));
await doit('bloque : Mallory se certifie elle-meme',
  ()=>assertFails(updateDoc(doc(m,'stores','s1'),{certified:true})));
await doit('bloque : Mallory s attribue un magasin',
  ()=>assertFails(updateDoc(doc(m,'stores','s1'),{owner:MALLORY})));
await doit('bloque : Mallory deplace le magasin d Alice',
  ()=>assertFails(updateDoc(doc(m,'stores','s1'),{lat:25.2,lng:55.3})));
await doit('bloque : un pseudo de 4000 caracteres',
  ()=>assertFails(setDoc(doc(a,'users',ALICE),{pseudo:'x'.repeat(4000)},{merge:true})));
await doit('bloque : des points en texte piege (XSS stocke)',
  ()=>assertFails(setDoc(doc(a,'users',ALICE),{points:'<img src=x onerror=alert(1)>'},{merge:true})));
await doit('bloque : un avatar avec un champ inconnu',
  ()=>assertFails(setDoc(doc(a,'users',ALICE),{avatar:{type:'photo',v:'x',onload:'alert(1)'}},{merge:true})));
await doit('bloque : 400 favoris publies',
  ()=>assertFails(setDoc(doc(a,'users',ALICE),{favs:Array(400).fill(1)},{merge:true})));
await doit('bloque : Mallory ecrit dans le profil d Alice',
  ()=>assertFails(setDoc(doc(m,'users',ALICE),{points:9999},{merge:true})));
await doit('bloque : Mallory efface ses penalites anti-triche',
  ()=>assertFails(setDoc(doc(m,'users',MALLORY),{penalty:0},{merge:true})));
await doit('bloque : votes:999 en une seule ecriture',
  ()=>assertFails(updateDoc(doc(m,'discoveries','d1'),{votes:999})));
await doit('bloque : deuxieme vote de la meme personne',
  ()=>{ const b=writeBatch(m);
        b.update(doc(m,'discoveries','d1'),{votes:increment(1)});
        b.set(doc(m,'discoveries','d1','votedBy',MALLORY),{votedAt:serverTimestamp()});
        return assertFails(b.commit()); });
await doit('bloque : vote sans passer par votedBy',
  ()=>assertFails(updateDoc(doc(m,'discoveries','d1'),{votes:increment(1)})));
await doit('bloque : foundIn de 500 magasins',
  ()=>assertFails(updateDoc(doc(m,'discoveries','d1'),{foundIn:Array(500).fill('s1')})));
await doit('bloque : un compte anonyme efface toutes les notes',
  ()=>assertFails(deleteDoc(doc(m,'stats','scanCounts'))));
await doit('bloque : lecture des signalements par un tiers',
  ()=>assertFails(getDoc(doc(m,'reports','r1'))));
await doit('bloque : signalement signe du nom d un autre',
  ()=>assertFails(addDoc(collection(m,'reports'),{by:ALICE,type:'rupture',storeId:'s1',drinkId:1})));
await doit('bloque : lecture de la presence par un tiers',
  ()=>assertFails(getDoc(doc(m,'presence',ALICE))));
await doit('bloque : ecriture dans le journal admin par un tiers',
  ()=>assertFails(addDoc(collection(m,'adminLog'),{par:MALLORY,action:'test'})));
await doit('bloque : lecture du journal admin',
  ()=>assertFails(getDoc(doc(m,'adminLog','x'))));
await doit('bloque : un anonyme sans compte ecrit un magasin',
  ()=>assertFails(updateDoc(doc(anon,'stores','s1'),{drinks:arrayUnion(5)})));
await doit('bloque : lecture des sauvegardes (_meta)',
  ()=>assertFails(getDoc(doc(m,'_meta','sauvegardes'))));
await doit('legitime : sous-collection privee d Alice',
  ()=>assertSucceeds(setDoc(doc(a,'users',ALICE,'prive','notes'),{x:1})));
await doit('bloque : Mallory lit la sous-collection privee d Alice',
  ()=>assertFails(getDoc(doc(m,'users',ALICE,'prive','notes'))));
await doit('bloque : profil recree sans penalite apres effacement',
  ()=>assertFails(setDoc(doc(m,'users',MALLORY),{pseudo:'M',penalty:0})));
/* ── chasses de zone et veilles (audit des Cloud Functions) ───────────── */
/* Reproduit fbJoinHunt / fbLeaveHunt A L'IDENTIQUE : updateDoc, pas setDoc.
   Avec setDoc, « seekers.uid » serait un nom de champ litteral et n'entrerait
   jamais dans la carte seekers — c'est le bug que ce banc d'essai a trouve. */
await doit('legitime : rejoindre une chasse',
  ()=>assertSucceeds(updateDoc(doc(m,'hunts','7'),
      {drinkName:'Ramune',emoji:'',['seekers.'+MALLORY]:{lat:50.8,lng:4.3,at:2}})));
await doit('verifie : le chercheur entre bien dans la carte seekers',
  async()=>{ const d=await getDoc(doc(a,'hunts','7'));
             const s=(d.data()||{}).seekers||{};
             if(!s[MALLORY]) throw new Error('seekers ne contient pas le chercheur');
             if(Object.prototype.hasOwnProperty.call(d.data(),'seekers.'+MALLORY))
               throw new Error('champ litteral pointe cree'); });
await doit('legitime : quitter une chasse',
  ()=>assertSucceeds(updateDoc(doc(m,'hunts','7'),{['seekers.'+MALLORY]:null})));
await doit('legitime : creer une chasse neuve sur une autre boisson',
  ()=>assertSucceeds(setDoc(doc(m,'hunts','99'),
      {drinkId:99,drinkName:'Milkis',seekers:{[MALLORY]:{lat:50.8,lng:4.3,at:1}}})));
await doit('bloque : inscrire un chercheur factice',
  ()=>assertFails(setDoc(doc(m,'hunts','123'),
      {drinkId:123,drinkName:'x',seekers:{faux:{lat:null,lng:null,at:1}}})));
await doit('bloque : document de chasse a identifiant libre',
  ()=>assertFails(setDoc(doc(m,'hunts','simtest_9'),
      {drinkId:5,drinkName:'x',seekers:{[MALLORY]:{lat:50.8,lng:4.3,at:1}}})));
await doit('bloque : eteindre les alertes d une boisson (_lastPush)',
  ()=>assertFails(updateDoc(doc(m,'hunts','7'),{_lastPush:Date.now()+1e12})));
await doit('bloque : retirer le chercheur d un autre',
  ()=>assertFails(updateDoc(doc(m,'hunts','7'),{['seekers.'+ALICE]:null})));
/* La date d'inscription (at) est figee : elle prouve qu'on chassait AVANT
   qu'un aidant reponde. Se repositionner ne touche que lat/lng. */
await doit('legitime : se repositionner sans toucher a sa date d inscription',
  ()=>assertSucceeds(updateDoc(doc(a,'hunts','7'),
      {['seekers.'+ALICE+'.lat']:50.9,['seekers.'+ALICE+'.lng']:4.4})));
await doit('bloque : reecrire sa date d inscription (antidatage / rajeunissement)',
  ()=>assertFails(updateDoc(doc(a,'hunts','7'),{['seekers.'+ALICE]:{lat:50.8,lng:4.3,at:999}})));
await doit('bloque : apparaitre comme chercheur sans date d inscription',
  ()=>assertFails(updateDoc(doc(m,'hunts','99'),{['seekers.'+ALICE+'.lat']:50.8})));
await doit('bloque : creer une chasse en s inscrivant sans date',
  ()=>assertFails(setDoc(doc(m,'hunts','101'),
      {drinkId:101,drinkName:'x',seekers:{[MALLORY]:{lat:50.8,lng:4.3}}})));
/* La provenance d'un rapport voyage dans note ("source|distance") : le
   serveur ne credite rien a un rapport fait de loin. */
await doit('legitime : rapport stock avec provenance dans note',
  ()=>assertSucceeds(addDoc(collection(a,'reports'),
      {by:ALICE,byPseudo:'Alice',type:'stock',storeId:'s1',drinkId:1,note:'chasse-vue|42',createdAt:serverTimestamp()})));

await doit('legitime : Alice cree sa veille',
  ()=>assertSucceeds(setDoc(doc(a,'watches',ALICE+'_424'),
      {uid:ALICE,drinkId:424,drinkName:'Ramune',lat:50.8,lng:4.3,radius:10})));
await doit('legitime : Alice regle le rayon de sa veille',
  ()=>assertSucceeds(setDoc(doc(a,'watches',ALICE+'_424'),{uid:ALICE,radius:20},{merge:true})));
await doit('bloque : veille a identifiant fantaisiste',
  ()=>assertFails(setDoc(doc(m,'watches','piege1'),{uid:MALLORY,drinkId:424242})));
await doit('bloque : repointer sa veille sur une victime',
  ()=>{ return setDoc(doc(m,'watches',MALLORY+'_777'),{uid:MALLORY,drinkId:777,drinkName:'x',lat:null,radius:20})
          .then(()=>assertFails(setDoc(doc(m,'watches',MALLORY+'_777'),{uid:ALICE},{merge:true}))); });
await doit('bloque : lire la veille d un autre',
  ()=>assertFails(getDoc(doc(m,'watches',ALICE+'_424'))));
await doit('bloque : lire le compteur global d IA',
  ()=>assertFails(getDoc(doc(m,'_meta','aiQuotaGlobal'))));

/* ── audit adverse complet : decouvertes, identite des magasins ───────── */
await doit('legitime : creer une decouverte par code-barre',
  ()=>assertSucceeds(setDoc(doc(m,'discoveries','4901234567894'),
      {name:'Ramune Original',brand:'Sangaria',votes:1,barcode:'4901234567894',
       by:MALLORY,byPseudo:'Pirate',cat:'soda'})));
await doit('legitime : proposition par photo (identifiant m+horodatage)',
  ()=>assertSucceeds(setDoc(doc(m,'discoveries','m1787946607178'),
      {name:'Milkis',brand:'',votes:1,barcode:'m1787946607178',by:MALLORY,
       hasPhoto:true,manualProposal:true})));
await doit('bloque : decouverte a identifiant piege (guillemet)',
  ()=>assertFails(setDoc(doc(m,'discoveries','x" onmouseover=alert(1) y="'),
      {name:'x',votes:1,barcode:'x',by:MALLORY})));
await doit('bloque : decouverte creee avec 999 votes',
  ()=>assertFails(setDoc(doc(m,'discoveries','4901234567895'),
      {name:'x',votes:999,barcode:'4901234567895',by:MALLORY})));
await doit('bloque : decouverte signee du nom d un autre',
  ()=>assertFails(setDoc(doc(m,'discoveries','4901234567896'),
      {name:'x',votes:1,barcode:'4901234567896',by:ALICE})));
await doit('bloque : decouverte avec un champ invente',
  ()=>assertFails(setDoc(doc(m,'discoveries','4901234567897'),
      {name:'x',votes:1,barcode:'4901234567897',by:MALLORY,adminNote:'coucou'})));
await doit('bloque : nom de decouverte de 500 caracteres',
  ()=>assertFails(setDoc(doc(m,'discoveries','4901234567898'),
      {name:'x'.repeat(500),votes:1,barcode:'4901234567898',by:MALLORY})));

await doit('bloque : s attribuer le magasin d un autre (addedBy)',
  ()=>assertFails(updateDoc(doc(m,'stores','s1'),{addedBy:MALLORY})));
await doit('bloque : deplacer un magasin par son geohash',
  ()=>assertFails(updateDoc(doc(m,'stores','s1'),{geohash:'u0000000000'})));
await doit('bloque : se placer dans la file de certification',
  ()=>assertFails(updateDoc(doc(m,'stores','s1'),{verifiedSource:'photos rayon (08/2026)'})));
await doit('legitime : import OSM ecrit sa source d origine',
  ()=>assertSucceeds(updateDoc(doc(m,'stores','s1'),{verifiedSource:'catalogue enseigne (auto)'})));

await doit('bloque : injecter des magasins dans foundIn (non-auteur)',
  ()=>assertFails(updateDoc(doc(m,'discoveries','d1'),{foundIn:['s1','s2']})));
await doit('legitime : l auteur dit ou il a vu sa decouverte',
  ()=>assertSucceeds(updateDoc(doc(a,'discoveries','d1'),{foundIn:['s1']})));
await doit('bloque : aspirer toutes les photos de decouvertes',
  ()=>assertFails(getDocs(collection(m,'discoveryPhotos'))));
await doit('legitime : lire UNE photo de decouverte',
  ()=>assertSucceeds(getDoc(doc(m,'discoveryPhotos','d1'))));
await doit('bloque : photo de decouverte signee d un autre',
  ()=>assertFails(setDoc(doc(m,'discoveryPhotos','d9'),{data:'x',by:ALICE})));
await doit('bloque : magasin invente au nom de 10000 caracteres',
  ()=>assertFails(setDoc(doc(m,'stores','sLong'),
      {name:'x'.repeat(10000),lat:50.8,lng:4.3})));
await doit('bloque : magasin sans coordonnees valides',
  ()=>assertFails(setDoc(doc(m,'stores','sHorsMonde'),
      {name:'Nulle part',lat:'50.8',lng:4.3})));
await doit('legitime : la communaute cree un night shop',
  ()=>assertSucceeds(setDoc(doc(m,'stores','sNight'),
      {name:'ARARAT Night Shop',lat:50.83,lng:4.36,drinks:[],
       confirmations:{},community:true,addedBy:MALLORY})));

await doit('bloque : s offrir une mise en avant payante',
  ()=>assertFails(updateDoc(doc(m,'stores','s1'),{partner:true})));
await doit('bloque : creer un magasin deja mis en avant',
  ()=>assertFails(setDoc(doc(m,'stores','sPub'),
      {name:'Pub',lat:50.8,lng:4.3,partner:true})));

/* ── fiche commercant privee ─────────────────────────────────────────── */
await env.withSecurityRulesDisabled(async (c)=>{
  const db=c.firestore();
  await setDoc(doc(db,'merchants',ALICE),{stores:['s1'],updatedAt:1});
  await setDoc(doc(db,'stores','s1','stats','2026-08-28'),{vues:12,itineraires:3});
});
await doit('legitime : Alice lit sa fiche commercant',
  ()=>assertSucceeds(getDoc(doc(a,'merchants',ALICE))));
await doit('bloque : Mallory lit la fiche commercant d Alice',
  ()=>assertFails(getDoc(doc(m,'merchants',ALICE))));
await doit('bloque : s ajouter une boutique dans sa fiche',
  ()=>assertFails(setDoc(doc(m,'merchants',MALLORY),{stores:['s1']})));
await doit('legitime : la gerante lit l audience de SA boutique',
  ()=>assertSucceeds(getDoc(doc(a,'stores','s1','stats','2026-08-28'))));
await doit('bloque : lire l audience de la boutique d en face',
  ()=>assertFails(getDoc(doc(m,'stores','s1','stats','2026-08-28'))));
await doit('bloque : un anonyme lit une audience',
  ()=>assertFails(getDoc(doc(anon,'stores','s1','stats','2026-08-28'))));

await doit('bloque : se declarer paye (traces de verification)',
  ()=>assertFails(setDoc(doc(m,'verifications','cs_test_1'),
      {uid:MALLORY,storeId:'s1',etat:'payee'})));
await doit('bloque : lire les traces de paiement',
  ()=>assertFails(getDoc(doc(m,'verifications','cs_test_1'))));

await doit('bloque : marquer une zone Overture comme faite (client)',
  ()=>assertFails(setDoc(doc(m,'zonesOverture','z_792_406'),{etat:'faite',quand:1})));
await doit('bloque : lire les zones Overture (client)',
  ()=>assertFails(getDoc(doc(m,'zonesOverture','z_792_406'))));
/* LE DON. Personne ne doit pouvoir se declarer donateur ni lire les traces :
   ce serait le moyen le plus simple de faire taire la demande de soutien, et
   surtout de se fabriquer une qualite qu'on n'a pas payee. Seule la Cloud
   Function ecrit ici (Admin SDK, qui contourne ces regles). */
await doit('bloque : se declarer donateur (traces de dons)',
  ()=>assertFails(setDoc(doc(m,'dons','cs_don_1'),
      {uid:MALLORY,etat:'payee',montant:50})));
await doit('bloque : lire les traces de dons',
  ()=>assertFails(getDoc(doc(m,'dons','cs_don_1'))));
await doit('bloque : s inscrire soi-meme comme soutien',
  ()=>assertFails(setDoc(doc(m,'soutiens',MALLORY),{total:50,fois:1})));
await doit('bloque : lire le soutien de quelqu un d autre',
  ()=>assertFails(getDoc(doc(m,'soutiens',ALICE))));
await doit('legitime : Alice lit son propre soutien',
  ()=>assertSucceeds(getDoc(doc(a,'soutiens',ALICE))));

/* LA CHASSE AUX CODES-BARRES. Ces regles laissent la communaute ECRIRE : ce
   sont donc celles qu'il faut le plus attaquer. Ce qu'on verifie ici, c'est
   qu'on ne peut ni se compter deux fois, ni ajouter quelqu'un d'autre, ni
   detourner un lien vers une autre boisson une fois les confirmations reunies. */
await doit('legitime : Alice propose un code pour une boisson orpheline',
  ()=>assertSucceeds(setDoc(doc(a,'chasseCodes','5000112637939'),
      {drinkId:1783615414484,drinkName:'Golden Power',barcode:'5000112637939',
       par:[ALICE],etat:'attente',createdAt:serverTimestamp()})));
await doit('bloque : proposer en se declarant deja confirme par un autre',
  ()=>assertFails(setDoc(doc(m,'chasseCodes','5449000000996'),
      {drinkId:1,drinkName:'X',barcode:'5449000000996',
       par:[ALICE,MALLORY],etat:'attente',createdAt:serverTimestamp()})));
await doit('bloque : proposer un lien deja marque comme pose',
  ()=>assertFails(setDoc(doc(m,'chasseCodes','5449000011527'),
      {drinkId:1,drinkName:'X',barcode:'5449000011527',
       par:[MALLORY],etat:'pose',createdAt:serverTimestamp()})));
await doit('legitime : Mallory confirme la proposition d Alice',
  ()=>assertSucceeds(updateDoc(doc(m,'chasseCodes','5000112637939'),
      {par:[ALICE,MALLORY]})));
await doit('bloque : se compter une deuxieme fois',
  ()=>assertFails(updateDoc(doc(m,'chasseCodes','5000112637939'),
      {par:[ALICE,MALLORY,MALLORY]})));
await doit('bloque : detourner le lien vers une autre boisson en confirmant',
  ()=>assertFails(updateDoc(doc(a,'chasseCodes','5000112637939'),
      {par:[ALICE,MALLORY,ALICE],drinkId:99999})));
await doit('bloque : se declarer soi-meme valide (etat pose)',
  ()=>assertFails(updateDoc(doc(a,'chasseCodes','5000112637939'),{etat:'pose'})));
await doit('bloque : un anonyme confirme un code',
  ()=>assertFails(updateDoc(doc(anon,'chasseCodes','5000112637939'),
      {par:[ALICE,MALLORY,'anon']})));
await doit('legitime : tout le monde peut LIRE la chasse (sans compte)',
  ()=>assertSucceeds(getDoc(doc(anon,'chasseCodes','5000112637939'))));

await doit('bloque : se declarer administrateur',
  ()=>assertFails(setDoc(doc(m,'admins',MALLORY),{ok:true})));

/* Les deux coups de main d'Alice sont poses par le serveur (Admin SDK), donc
   regles desactivees — exactement comme en production. */
await env.withSecurityRulesDisabled(async (c)=>{
  const db=c.firestore();
  await setDoc(doc(db,'coupsDeMain',ALICE,'recus','r1'),
    {aidantUid:'aide1',aidantPseudo:'Lina',drinkId:1,storeId:'s1',at:1756000000000,merci:false});
  await setDoc(doc(db,'coupsDeMain',ALICE,'recus','r2'),
    {aidantUid:'aide2',aidantPseudo:'Sam',drinkId:2,storeId:'s2',at:1756000000000,merci:true});
});

/* ── LES COUPS DE MAIN ───────────────────────────────────────────────────
   Ce n'est pas un canal, et ces epreuves sont ce qui l'en empeche. Le
   chercheur lit une projection choisie par le serveur ; il ne peut ecrire
   qu'un booleen, et dans un seul sens. Sans le dernier test, une bascule en
   boucle ferait sonner le telephone de l'aidant a volonte. ── */
await doit('legitime : Alice lit ses coups de main',
  ()=>assertSucceeds(getDoc(doc(a,'coupsDeMain',ALICE,'recus','r1'))));
await doit('bloque : lire les coups de main de quelqu un d autre',
  ()=>assertFails(getDoc(doc(m,'coupsDeMain',ALICE,'recus','r1'))));
await doit('bloque : s ecrire un coup de main',
  ()=>assertFails(setDoc(doc(m,'coupsDeMain',MALLORY,'recus','r9'),
      {aidantUid:MALLORY,aidantPseudo:'Moi',drinkId:1,storeId:'s1',at:1,merci:false})));
await doit('legitime : dire merci une fois',
  ()=>assertSucceeds(updateDoc(doc(a,'coupsDeMain',ALICE,'recus','r1'),{merci:true})));
await doit('bloque : retirer son merci (relance de notification)',
  ()=>assertFails(updateDoc(doc(a,'coupsDeMain',ALICE,'recus','r2'),{merci:false})));
await doit('bloque : changer autre chose que le merci',
  ()=>assertFails(updateDoc(doc(a,'coupsDeMain',ALICE,'recus','r1'),
      {merci:true,aidantPseudo:'AutreNom'})));
await doit('legitime : cocher aider en discret sur son profil',
  ()=>assertSucceeds(setDoc(doc(a,'users',ALICE),{aideDiscrete:true},{merge:true})));
await doit('bloque : aideDiscrete qui n est pas un booleen',
  ()=>assertFails(setDoc(doc(a,'users',ALICE),{aideDiscrete:'oui'},{merge:true})));

/* ── LES SIGNALEMENTS ────────────────────────────────────────────────────
   Le motif vient d'une liste FERMEE : c'est ce qui empeche un formulaire de
   signalement de devenir un canal pour insulter la personne visee. Et
   personne ne relit ses propres signalements, meme leur auteur : les ouvrir
   en lecture ferait de la collection un canal (« je vois que tu m'as
   signale »). ── */
await doit('legitime : signaler une decouverte avec un motif de la liste',
  ()=>assertSucceeds(addDoc(collection(m,'abus'),
      {par:MALLORY,cibleType:'decouverte',cibleId:'d1',motif:'sexuel',
       apercu:'Nom du produit',at:new Date(),etat:'nouveau'})));
await doit('bloque : signaler au nom de quelqu un d autre',
  ()=>assertFails(addDoc(collection(m,'abus'),
      {par:ALICE,cibleType:'decouverte',cibleId:'d1',motif:'spam',at:new Date(),etat:'nouveau'})));
await doit('bloque : un motif invente (texte libre deguise)',
  ()=>assertFails(addDoc(collection(m,'abus'),
      {par:MALLORY,cibleType:'profil',cibleId:'u1',motif:'tu es un imbecile',at:new Date(),etat:'nouveau'})));
await doit('bloque : un champ en plus pour glisser du texte',
  ()=>assertFails(addDoc(collection(m,'abus'),
      {par:MALLORY,cibleType:'profil',cibleId:'u1',motif:'spam',
       message:'insulte',at:new Date(),etat:'nouveau'})));
await doit('bloque : se declarer deja traite',
  ()=>assertFails(addDoc(collection(m,'abus'),
      {par:MALLORY,cibleType:'profil',cibleId:'u1',motif:'spam',at:new Date(),etat:'traite'})));
await doit('bloque : un apercu de plus de 400 caracteres',
  ()=>assertFails(addDoc(collection(m,'abus'),
      {par:MALLORY,cibleType:'profil',cibleId:'u1',motif:'spam',
       apercu:'x'.repeat(401),at:new Date(),etat:'nouveau'})));
await doit('bloque : lire les signalements, meme les siens',
  ()=>assertFails(getDocs(collection(m,'abus'))));
await doit('bloque : un type de cible invente',
  ()=>assertFails(addDoc(collection(m,'abus'),
      {par:MALLORY,cibleType:'magasin',cibleId:'s1',motif:'spam',at:new Date(),etat:'nouveau'})));

/* LE CODE DE PARRAINAGE. Il vivait dans users/{uid}, qui est en lecture
   publique pour faire marcher le classement : lister les profils suffisait a
   reconstituer les codes de tout le monde. La table refCodes (code vers uid)
   etait bien protegee, la table INVERSE ne l'etait pas. */
await doit('legitime : Alice lit son propre code de parrainage',
  ()=>assertSucceeds(getDoc(doc(a,'refMine',ALICE))));
await doit('bloque : lire le code de parrainage de quelqu un d autre',
  ()=>assertFails(getDoc(doc(m,'refMine',ALICE))));
await doit('bloque : s ecrire un code de parrainage',
  ()=>assertFails(setDoc(doc(m,'refMine',MALLORY),{code:'ABCDE'})));

/* « Stores » AVEC UNE MAJUSCULE. Vestige d'une ancienne version : un seul
   document y dormait et aucun code ne la lisait, mais elle avait un jeu de
   regles complet qui laissait tout compte connecte y ecrire. Un entrepot
   invisible et inscriptible. Le bloc a ete retire ; ces deux epreuves
   verifient qu'elle est bien tombee dans le refus par defaut, et qu'elle n'y
   revient pas si quelqu'un recopie un jour l'ancien bloc par megarde. */
await doit('bloque : ecrire dans Stores (majuscule, collection morte)',
  ()=>assertFails(setDoc(doc(m,'Stores','faux1'),
      {name:'Faux magasin',lat:50.8,lng:4.3})));
await doit('bloque : lire Stores (majuscule, collection morte)',
  ()=>assertFails(getDoc(doc(m,'Stores','ss7GMAGpBfvLmkgwMw9B'))));

/* LE PASS COMMERCANT. Trois niveaux, ecrits par l'administrateur seul. Si le
   client pouvait ecrire dans merchants/{uid}, il lui suffirait de se declarer
   « pass complet » pour s'offrir les fonctions payantes — et de s'attribuer la
   boutique du voisin, ce qui lui ouvrirait le scan de frigo de ce magasin.
   La pastille bleue, elle, ne depend pas du pass : elle vit dans
   stores/{id}.certified et atteste d'une identite, pas d'un paiement. */
await doit('legitime : l admin accorde le pass frigo',
  ()=>assertSucceeds(setDoc(doc(ad,'merchants',ALICE),
      {stores:['s1'],pass:'frigo',passOrigine:'lancement'})));
await doit('legitime : Alice lit son propre compte commercant',
  ()=>assertSucceeds(getDoc(doc(a,'merchants',ALICE))));
await doit('bloque : lire le compte commercant de quelqu un d autre',
  ()=>assertFails(getDoc(doc(m,'merchants',ALICE))));
await doit('bloque : s accorder le pass complet soi-meme',
  ()=>assertFails(setDoc(doc(m,'merchants',MALLORY),
      {stores:[],pass:'complet',passOrigine:'paiement'})));
await doit('bloque : s ajouter la boutique d un autre',
  ()=>assertFails(setDoc(doc(m,'merchants',MALLORY),{stores:['s1']},{merge:true})));
await doit('bloque : hausser son propre pass par une mise a jour',
  ()=>assertFails(updateDoc(doc(a,'merchants',ALICE),{pass:'complet'})));
await doit('bloque : un pass invente, meme par l admin',
  ()=>assertFails(setDoc(doc(ad,'merchants',ALICE),
      {stores:['s1'],pass:'illimite'},{merge:true})));
await doit('bloque : une origine de pass inventee, meme par l admin',
  ()=>assertFails(setDoc(doc(ad,'merchants',ALICE),
      {stores:['s1'],pass:'frigo',passOrigine:'cadeau'},{merge:true})));
await doit('legitime : l admin retire le pass',
  ()=>assertSucceeds(setDoc(doc(ad,'merchants',ALICE),{pass:'aucun'},{merge:true})));

/* L'ANNONCE DU COMMERCANT — le contenu du pass complet. Elle doit etre
   ecrivable par le gerant au pass complet de CE magasin, et par personne
   d'autre : ni un visiteur, ni un gerant au pass frigo, ni le gerant d'un
   AUTRE magasin. Elle est publique en lecture, comme le magasin qu'elle
   accompagne, et l'administrateur doit pouvoir l'effacer sans son auteur. */
await env.withSecurityRulesDisabled(async (c)=>{
  const db=c.firestore();
  await setDoc(doc(db,'merchants',ALICE),{stores:['s1'],pass:'complet',passOrigine:'paiement'});
  await setDoc(doc(db,'merchants',MALLORY),{stores:['s2'],pass:'frigo',passOrigine:'lancement'});
  await setDoc(doc(db,'stores','s2'),{name:'Autre',brand:'',lat:50.8,lng:4.3,addedBy:MALLORY,
      drinks:[],drinksVerified:[],confirmations:{},seenAt:{}});
});
const ANN={texte:'Livraison offerte des 20 euros',par:ALICE,actif:true};
await doit('legitime : Alice au pass complet publie son annonce',
  ()=>assertSucceeds(setDoc(doc(a,'annonces','s1'),ANN)));
await doit('legitime : n importe qui lit une annonce',
  ()=>assertSucceeds(getDoc(doc(anon,'annonces','s1'))));
await doit('bloque : un visiteur publie une annonce',
  ()=>assertFails(setDoc(doc(m,'annonces','s1'),{texte:'Faux',par:MALLORY,actif:true})));
await doit('bloque : Mallory au pass frigo publie une annonce',
  ()=>assertFails(setDoc(doc(m,'annonces','s2'),{texte:'Promo',par:MALLORY,actif:true})));
await doit('bloque : signer une annonce du nom d un autre',
  ()=>assertFails(setDoc(doc(a,'annonces','s1'),{texte:'Coucou',par:MALLORY,actif:true})));
await doit('bloque : une annonce de plus de 90 caracteres',
  ()=>assertFails(setDoc(doc(a,'annonces','s1'),{texte:'x'.repeat(91),par:ALICE,actif:true})));
await doit('bloque : une annonce vide',
  ()=>assertFails(setDoc(doc(a,'annonces','s1'),{texte:'',par:ALICE,actif:true})));
await doit('bloque : glisser un champ en plus dans l annonce',
  ()=>assertFails(setDoc(doc(a,'annonces','s1'),{texte:'Promo',par:ALICE,actif:true,certified:true})));
await doit('bloque : Alice publie sur un magasin qui n est pas le sien',
  ()=>assertFails(setDoc(doc(a,'annonces','s2'),{texte:'Promo',par:ALICE,actif:true})));
await doit('legitime : l admin efface une annonce',
  ()=>assertSucceeds(deleteDoc(doc(ad,'annonces','s1'))));

await doit('legitime : signaler une annonce de commercant',
  ()=>assertSucceeds(addDoc(collection(m,'abus'),
      {par:MALLORY,cibleType:'annonce',cibleId:'s1',motif:'alcool',
       apercu:'texte de l annonce',at:new Date(),etat:'nouveau'})));

/* ══ LA MESSAGERIE ═══════════════════════════════════════════════════════
   Aucune Cloud Function derriere (plan Spark) : ces regles sont TOUT ce qui
   separe un fil prive d'un canal de harcelement. On attaque donc dans
   l'ordre ou un malveillant le ferait : lire un fil qui n'est pas le sien,
   ecrire a qui l'a bloque, insister aupres de qui n'a pas repondu, s'accepter
   soi-meme, gonfler la pastille de l'autre, deposer un message d'un mega-octet,
   reecrire un message deja lu.

   LE LOT ATOMIQUE. L'app envoie un message et la mise a jour de la
   conversation dans UN SEUL lot (fbEnvoyerMessage). Les regles du message
   lisent la conversation d'AVANT le lot par get() — c'est la qu'est le
   dernier lastAt et le reqCount a verifier — et celle d'APRES par getAfter(),
   pour exiger que la conversation soit bien mise a jour. L'epreuve « lot
   atomique » qui passe ci-dessous PROUVE que get() renvoie l'etat d'avant :
   si get() lisait l'etat d'apres, lastAt vaudrait l'heure de l'envoi et le
   rythme de 700 ms refuserait tout message, toujours. ── */
const CONV='alice_mallory', CONV2='mallory_nouveau1';
/* Remet lastAt dans le passe, regles desactivees : chaque epreuve d'envoi
   repart d'un fil « calme », sans attendre 700 ms d'horloge reelle. */
async function filCalme(cid, quand){
  await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),'conversations',cid),
    {lastAt:Timestamp.fromMillis(quand ?? Date.now()-10000)}));
}
/* Reproduit fbEnvoyerMessage A L'IDENTIQUE : message + conversation, un lot. */
function envoi(db, cid, moi, autre, msg={}, conv={}, mid){
  const b=writeBatch(db);
  const ref=mid ? doc(db,'conversations',cid,'messages',mid)
                : doc(collection(db,'conversations',cid,'messages'));
  b.set(ref,{by:moi,at:serverTimestamp(),type:'text',text:'Salut',...msg});
  b.update(doc(db,'conversations',cid),{lastAt:serverTimestamp(),
    lastMsg:{by:moi,type:msg.type||'text',text:String(msg.text??'Salut').slice(0,80),at:serverTimestamp()},
    ['unread.'+autre]:increment(1),...conv});
  return b.commit();
}
/* Le document exact que fbOuvrirConversation ecrit. */
const nouvelle=(moi,autre,extra={})=>({members:[moi,autre].sort(),createdBy:moi,
  createdAt:serverTimestamp(),state:'request',requestBy:moi,reqCount:0,
  lastAt:serverTimestamp(),unread:{[moi]:0,[autre]:0},...extra});

/* La liste de blocage : a soi, et a personne d'autre. */
await doit('legitime : Alice bloque Mallory',
  ()=>assertSucceeds(setDoc(doc(a,'blocks',ALICE),{list:[MALLORY],at:serverTimestamp()})));
await doit('bloque : Mallory lit la liste de bloques d Alice',
  ()=>assertFails(getDoc(doc(m,'blocks',ALICE))));
await doit('bloque : Mallory se retire de la liste de bloques d Alice',
  ()=>assertFails(setDoc(doc(m,'blocks',ALICE),{list:[],at:serverTimestamp()})));
await doit('bloque : une liste de 201 bloques',
  ()=>assertFails(setDoc(doc(m,'blocks',MALLORY),{list:Array(201).fill('x'),at:serverTimestamp()})));
await doit('bloque : un champ en plus dans la liste de bloques',
  ()=>assertFails(setDoc(doc(m,'blocks',MALLORY),{list:[],at:serverTimestamp(),note:'x'})));
await doit('legitime : Mallory pose une liste de bloques vide',
  ()=>assertSucceeds(setDoc(doc(m,'blocks',MALLORY),{list:[],at:serverTimestamp()})));

/* La conversation : un fil par paire, membres tries et figes, nee en demande. */
await doit('legitime : Mallory ouvre une conversation avec Alice (demande)',
  ()=>assertSucceeds(setDoc(doc(m,'conversations',CONV),nouvelle(MALLORY,ALICE))));
await doit('bloque : un tiers ouvre une conversation entre deux autres',
  ()=>assertFails(setDoc(doc(nv,'conversations','admin1_alice'),nouvelle(ALICE,ADMIN))));
await doit('bloque : membres non tries',
  ()=>assertFails(setDoc(doc(nv,'conversations',CONV2),
      nouvelle(NOUVEAU,MALLORY,{members:[NOUVEAU,MALLORY]}))));
await doit('bloque : identifiant qui ne correspond pas aux membres',
  ()=>assertFails(setDoc(doc(nv,'conversations','nouveau1_zoe'),nouvelle(NOUVEAU,MALLORY))));
await doit('bloque : conversation nee deja ouverte (sans demande)',
  ()=>assertFails(setDoc(doc(nv,'conversations',CONV2),nouvelle(NOUVEAU,MALLORY,{state:'open'}))));
await doit('bloque : demande signee du nom de l autre',
  ()=>assertFails(setDoc(doc(nv,'conversations',CONV2),nouvelle(NOUVEAU,MALLORY,{requestBy:MALLORY}))));
await doit('bloque : non-lus deja gonfles chez l autre a la creation',
  ()=>assertFails(setDoc(doc(nv,'conversations',CONV2),
      nouvelle(NOUVEAU,MALLORY,{unread:{[NOUVEAU]:0,[MALLORY]:5}}))));
await doit('bloque : conversation avec un champ en plus',
  ()=>assertFails(setDoc(doc(nv,'conversations',CONV2),nouvelle(NOUVEAU,MALLORY,{admin:true}))));
await doit('legitime : Alice lit la conversation dont elle est membre',
  ()=>assertSucceeds(getDoc(doc(a,'conversations',CONV))));
await doit('bloque : un tiers lit la conversation d Alice et Mallory',
  ()=>assertFails(getDoc(doc(nv,'conversations',CONV))));

/* La demande : un seul message pour qui ecrit le premier, rien pour l'autre
   tant qu'elle n'a pas accepte, et seule elle peut accepter. */
await filCalme(CONV);
await doit('bloque : Mallory, bloquee par Alice, envoie sa demande',
  ()=>assertFails(envoi(m,CONV,MALLORY,ALICE,{},{reqCount:1})));
await doit('legitime : Alice debloque Mallory',
  ()=>assertSucceeds(setDoc(doc(a,'blocks',ALICE),{list:[],at:serverTimestamp()})));
await doit('bloque : message hors lot, sans mise a jour de la conversation',
  ()=>assertFails(addDoc(collection(m,'conversations',CONV,'messages'),
      {by:MALLORY,at:serverTimestamp(),type:'text',text:'Salut'})));
await doit('bloque : Alice (destinataire) repond avant d avoir accepte',
  ()=>assertFails(envoi(a,CONV,ALICE,MALLORY)));
await doit('bloque : Mallory envoie sa demande sans compter reqCount',
  ()=>assertFails(envoi(m,CONV,MALLORY,ALICE)));
await doit('legitime : Mallory envoie son unique message de demande (lot atomique)',
  ()=>assertSucceeds(envoi(m,CONV,MALLORY,ALICE,{},{reqCount:1},'demande1')));
await doit('verifie : le lot a bien compte la demande et le non-lu d Alice',
  async()=>{ const d=(await getDoc(doc(a,'conversations',CONV))).data();
             if(d.reqCount!==1) throw new Error('reqCount = '+d.reqCount);
             if(d.unread[ALICE]!==1) throw new Error('unread[alice] = '+d.unread[ALICE]); });
await filCalme(CONV);
await doit('bloque : deuxieme message de demande (reqCount 1 vers 2)',
  ()=>assertFails(envoi(m,CONV,MALLORY,ALICE,{},{reqCount:increment(1)})));
await doit('bloque : deuxieme message de demande en laissant reqCount a 1',
  ()=>assertFails(envoi(m,CONV,MALLORY,ALICE)));
await doit('bloque : Mallory (demandeuse) accepte elle-meme sa demande',
  ()=>assertFails(updateDoc(doc(m,'conversations',CONV),{state:'open'})));
await doit('bloque : Mallory remet reqCount a zero pour reecrire',
  ()=>assertFails(updateDoc(doc(m,'conversations',CONV),{reqCount:0})));
await doit('bloque : changer les membres d une conversation',
  ()=>assertFails(updateDoc(doc(m,'conversations',CONV),{members:[MALLORY,NOUVEAU]})));
await doit('bloque : changer l auteur de la demande',
  ()=>assertFails(updateDoc(doc(m,'conversations',CONV),{requestBy:ALICE})));
await doit('bloque : un etat de conversation invente',
  ()=>assertFails(updateDoc(doc(a,'conversations',CONV),{state:'archived'})));
await doit('legitime : Alice accepte la demande (request vers open)',
  ()=>assertSucceeds(updateDoc(doc(a,'conversations',CONV),{state:'open'})));
await doit('bloque : revenir a l etat request une fois ouverte',
  ()=>assertFails(updateDoc(doc(a,'conversations',CONV),{state:'request'})));
await filCalme(CONV);
await doit('legitime : Alice repond dans le fil ouvert (lot atomique)',
  ()=>assertSucceeds(envoi(a,CONV,ALICE,MALLORY,{text:'Bonjour !'},{},'reponse1')));

/* Le rythme. lastAt est pose UN PEU DANS LE FUTUR (regles desactivees) : ainsi
   l'ecart avec l'heure de l'emulateur est surement inferieur a 700 ms, quelle
   que soit la lenteur de la machine qui fait tourner ce banc. */
await filCalme(CONV, Date.now()+5000);
await doit('bloque : deux messages a moins de 700 ms d intervalle',
  ()=>assertFails(envoi(m,CONV,MALLORY,ALICE)));
await filCalme(CONV);

/* Les non-lus : les miens ne descendent qu'a zero, ceux de l'autre ne montent
   que de un, et seulement avec un message. */
await doit('legitime : Alice marque ses non-lus comme lus (unread[moi] a 0)',
  ()=>assertSucceeds(updateDoc(doc(a,'conversations',CONV),{['unread.'+ALICE]:0})));
await doit('bloque : Alice remet a zero les non-lus de Mallory',
  ()=>assertFails(updateDoc(doc(a,'conversations',CONV),{['unread.'+MALLORY]:0})));
await doit('bloque : gonfler les non-lus de l autre sans envoyer de message',
  ()=>assertFails(updateDoc(doc(a,'conversations',CONV),{['unread.'+MALLORY]:increment(1)})));
await doit('bloque : se gonfler ses propres non-lus',
  ()=>assertFails(updateDoc(doc(a,'conversations',CONV),{['unread.'+ALICE]:9})));
await doit('bloque : gonfler de 5 les non-lus de l autre en envoyant',
  ()=>assertFails(envoi(m,CONV,MALLORY,ALICE,{},{['unread.'+ALICE]:increment(5)})));

/* Les bornes et la forme d'un message. */
await doit('bloque : un texte de 2001 caracteres',
  ()=>assertFails(envoi(m,CONV,MALLORY,ALICE,{text:'x'.repeat(2001)})));
await doit('bloque : une image de 220 001 caracteres',
  ()=>assertFails(envoi(m,CONV,MALLORY,ALICE,{type:'image',img:'x'.repeat(220001)})));
await doit('legitime : une image compressee par l app',
  ()=>assertSucceeds(envoi(m,CONV,MALLORY,ALICE,
      {type:'image',img:'data:image/jpeg;base64,'+'A'.repeat(1000)},{},'photo1')));
await filCalme(CONV);
await doit('bloque : un type de message invente',
  ()=>assertFails(envoi(m,CONV,MALLORY,ALICE,{type:'html'})));
await doit('bloque : message signe du nom de l autre',
  ()=>assertFails(envoi(m,CONV,MALLORY,ALICE,{by:ALICE})));
await doit('bloque : message antidate',
  ()=>assertFails(envoi(m,CONV,MALLORY,ALICE,{at:Timestamp.fromMillis(Date.now()-86400000)})));
await doit('bloque : un champ en plus dans un message',
  ()=>assertFails(envoi(m,CONV,MALLORY,ALICE,{html:'<b>x</b>'})));
await doit('bloque : une position en texte',
  ()=>assertFails(envoi(m,CONV,MALLORY,ALICE,{type:'pos',lat:'50.8',lng:4.3})));
await doit('legitime : partager sa position',
  ()=>assertSucceeds(envoi(m,CONV,MALLORY,ALICE,{type:'pos',lat:50.823,lng:4.371},{},'pos1')));
await filCalme(CONV);
await doit('legitime : partager l emplacement d une boisson',
  ()=>assertSucceeds(envoi(m,CONV,MALLORY,ALICE,
      {type:'spot',storeId:'s1',storeName:'Night Ixelles',drinkId:1,drinkName:'Ramune'},{},'spot1')));
await filCalme(CONV);
await doit('bloque : un nom de magasin de 61 caracteres dans un emplacement',
  ()=>assertFails(envoi(m,CONV,MALLORY,ALICE,{type:'spot',storeId:'s1',storeName:'x'.repeat(61)})));

/* Immuable, effacable par son auteur, lisible par les membres seuls. */
await doit('bloque : modifier un message envoye',
  ()=>assertFails(updateDoc(doc(m,'conversations',CONV,'messages','demande1'),{text:'modifie'})));
await doit('bloque : effacer le message d un autre',
  ()=>assertFails(deleteDoc(doc(a,'conversations',CONV,'messages','demande1'))));
await doit('legitime : Mallory efface son propre message',
  ()=>assertSucceeds(deleteDoc(doc(m,'conversations',CONV,'messages','demande1'))));
await doit('legitime : l admin efface un message',
  ()=>assertSucceeds(deleteDoc(doc(ad,'conversations',CONV,'messages','pos1'))));
await doit('legitime : Alice lit le fil',
  ()=>assertSucceeds(getDocs(collection(a,'conversations',CONV,'messages'))));
await doit('bloque : un tiers lit le fil',
  ()=>assertFails(getDocs(collection(nv,'conversations',CONV,'messages'))));
await doit('bloque : un tiers lit un message par son identifiant',
  ()=>assertFails(getDoc(doc(nv,'conversations',CONV,'messages','reponse1'))));
await doit('bloque : effacer une conversation',
  ()=>assertFails(deleteDoc(doc(a,'conversations',CONV))));

/* Le blocage prend effet au milieu d'un fil ouvert, immediatement. */
await doit('legitime : Alice bloque Mallory en pleine conversation',
  ()=>assertSucceeds(setDoc(doc(a,'blocks',ALICE),{list:[MALLORY],at:serverTimestamp()})));
await filCalme(CONV);
await doit('bloque : Mallory ecrit a Alice qui vient de la bloquer',
  ()=>assertFails(envoi(m,CONV,MALLORY,ALICE)));
await doit('legitime : Alice debloque Mallory a nouveau',
  ()=>assertSucceeds(setDoc(doc(a,'blocks',ALICE),{list:[],at:serverTimestamp()})));

/* Le refus : plus personne n'ecrit, et on ne rouvre pas. */
await doit('legitime : Nouveau fait une demande a Mallory',
  ()=>assertSucceeds(setDoc(doc(nv,'conversations',CONV2),nouvelle(NOUVEAU,MALLORY))));
await doit('legitime : Mallory refuse la demande',
  ()=>assertSucceeds(updateDoc(doc(m,'conversations',CONV2),{state:'declined'})));
await filCalme(CONV2);
await doit('bloque : ecrire dans une conversation refusee',
  ()=>assertFails(envoi(nv,CONV2,NOUVEAU,MALLORY,{},{reqCount:1})));
await doit('bloque : rouvrir une conversation refusee',
  ()=>assertFails(updateDoc(doc(m,'conversations',CONV2),{state:'open'})));

/* « Ses derniers gestes » sur le profil public : cinq au plus, type ferme,
   libelles courts, et jamais de coordonnees. */
const geste=(i)=>({t:'confirm',d:'Ramune '+i,s:'Night Ixelles',j:'2026-09-0'+(i%9+1)});
await doit('legitime : cinq derniers gestes sur le profil',
  ()=>assertSucceeds(setDoc(doc(a,'users',ALICE),{recent:[0,1,2,3,4].map(geste)},{merge:true})));
await doit('bloque : six derniers gestes',
  ()=>assertFails(setDoc(doc(a,'users',ALICE),{recent:[0,1,2,3,4,5].map(geste)},{merge:true})));
await doit('bloque : un geste d un type invente',
  ()=>assertFails(setDoc(doc(a,'users',ALICE),
      {recent:[{t:'insulte',d:'x',s:'y',j:'2026-09-01'}]},{merge:true})));
await doit('bloque : un geste avec des coordonnees',
  ()=>assertFails(setDoc(doc(a,'users',ALICE),
      {recent:[{t:'scan',d:'x',s:'y',j:'2026-09-01',lat:50.8}]},{merge:true})));
await doit('bloque : un nom de boisson de 41 caracteres dans un geste',
  ()=>assertFails(setDoc(doc(a,'users',ALICE),
      {recent:[{t:'scan',d:'x'.repeat(41),s:'y',j:'2026-09-01'}]},{merge:true})));
await doit('bloque : un geste piege cache en cinquieme position',
  ()=>assertFails(setDoc(doc(a,'users',ALICE),
      {recent:[geste(0),geste(1),geste(2),geste(3),{t:'scan',d:'x',s:'y',j:'2026-09-01',lat:1}]},{merge:true})));
await doit('bloque : recent qui n est pas une liste',
  ()=>assertFails(setDoc(doc(a,'users',ALICE),{recent:'x'},{merge:true})));

R.forEach(r=>console.log(r[0],'|',r[1]));
console.log('\n'+(R.length-ko)+'/'+R.length+' conformes');
await env.cleanup();
process.exit(ko?1:0);
