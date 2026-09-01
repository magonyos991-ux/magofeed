/* ============================================================================
 * ⚠ AVERTISSEMENT AJOUTÉ APRÈS RELECTURE — LIS CECI AVANT DE LANCER QUOI QUE CE SOIT
 *
 * fbCompactAssortments() SUPPRIME des champs en production :
 *     drinksVerified: deleteField()   -> 5 213 magasins concernés
 *     verifiedSource: deleteField()   -> trace de ta campagne "missions 1-5 (07/2026)"
 *
 * Ces suppressions sont IRRÉVERSIBLES (Firestore n'a pas de corbeille) et
 * storeIsPartner() lit verifiedSource : ton badge « Partenaire vérifié »
 * disparaîtrait définitivement.
 *
 * Avant de l'exécuter autrement qu'en dryRun :
 *   1. exporte la collection (gcloud firestore export, ou relis les 30 930 docs
 *      via l'API REST et garde le JSON de côté) ;
 *   2. lance d'abord fbCompactAssortments(true) et lis le rapport ;
 *   3. n'exécute la vraie passe que si tu comprends chaque champ supprimé.
 *
 * Ce fichier a été écrit par une analyse automatique et n'a JAMAIS été exécuté
 * contre ta base. Rien n'y est vérifié en conditions réelles.
 * ==========================================================================*/

/* ============================================================================
 * Magofeed — ASSORTIMENT PAR PROFIL, PAS PAR MAGASIN
 * A coller dans index.html. Rien ici n'a ete teste contre Firebase (injoignable
 * depuis Claude) : lance-le d'abord sur ta base avec le mode BLANC (dryRun).
 *
 * Constat mesure : il n'existe que 20 assortiments distincts dans tout le code
 * (13 enseignes dans buildChainSets() + 6 categories dans M4_CATS + le pack).
 * Ils sont recopies dans 15 144 fiches. buildChainSets() les recalcule deja a
 * la volee cote client : les stocker est un pur doublon.
 * ==========================================================================*/

/* --- 1) A AJOUTER a l'import Firestore de la ligne ~1624 d'index.html :
       ..., documentId, getCountFromServer, Timestamp, deleteField } from ... */

/* --- 2) EXPANSION COTE CLIENT — a placer juste apres buildChainSets() ------- */
function assortmentIds(key){
  if(!key) return [];
  if(key === "pack") return packDrinkIds();
  if(key.indexOf("cat:") === 0) return brandIds(M4_CATS[key.slice(4)] || []);
  var sets = buildChainSets();
  return sets[key] || [];
}
/* Cle de profil d'un magasin, depuis son enseigne/nom. Meme logique que
   chainIdsFor()/guessStoreCat(), mais elle rend la CLE au lieu des 163 ids. */
function assortmentKeyFor(name, brand){
  var b = normTxt((brand||"") + " " + (name||""));
  if(b.indexOf("carrefour")!==-1)   return "carrefour";
  if(b.indexOf("delhaize")!==-1)    return "delhaize";
  if(b.indexOf("colruyt")!==-1)     return "colruyt";
  if(b.indexOf("auchan")!==-1)      return "auchan";
  if(b.indexOf("leclerc")!==-1)     return "leclerc";
  if(b.indexOf("intermarch")!==-1)  return "intermarche";
  if(b.indexOf("monoprix")!==-1||b.indexOf("monop")!==-1) return "monoprix";
  if(b.indexOf("super u")!==-1||b.indexOf("hyper u")!==-1||b.indexOf("u express")!==-1) return "coursesu";
  if(b.indexOf("cora")!==-1||b.indexOf("houra")!==-1) return "cora";
  if(b.indexOf("franprix")!==-1)    return "franprix";
  if(b.indexOf("albert heijn")!==-1||b.indexOf("ah ")!==-1||b==="ah") return "albertheijn";
  if(b.indexOf("okay")!==-1)        return "okay";
  if(b.indexOf("jumbo")!==-1)       return "jumbo";
  var cat = guessStoreCat((name||"") + " " + (brand||""));
  if(cat) return "cat:" + cat;
  return "pack";
}

/* --- 3) FUSION A LA LECTURE — dans normalizeStore(), remplacer
         data.drinks = data.drinks || [];
   par : */
function _mergeAssortment(data){
  data.commDrinks = (data.drinks || []).slice();   // ce que la COMMUNAUTE a mis
  var auto = assortmentIds(data.asrt);             // calcule, jamais stocke
  if(!auto.length){ data.drinks = data.commDrinks; return data; }
  var seen = {}, out = [];
  data.commDrinks.concat(auto).forEach(function(id){
    var n = Number(id); if(seen[n]) return; seen[n] = 1; out.push(n);
  });
  data.drinks = out;
  if(data.asrt && data.asrt.indexOf("cat:") !== 0 && data.asrt !== "pack"){
    data.drinksVerified = auto.slice();            // rayon d'enseigne = verifie
    data.verifiedSource = data.verifiedSource || "catalogue enseigne (auto)";
  }
  return data;
}
/* Les 65 endroits qui lisent s.drinks ne bougent pas : ils voient la meme
   liste qu'avant. Seul l'ECRITURE change (fbAddDrinkToStore utilise deja
   arrayUnion : il n'ajoute que la boisson confirmee, jamais le profil). */

/* --- 4) CACHE localStorage — dans compactStore(), remplacer
         drinks: s.drinks || [], drinksVerified: s.drinksVerified || [],
   par : */
//   asrt: s.asrt || "", drinks: s.commDrinks || [],
/* Gain mesure : une fiche Carrefour passe de ~1 816 o a ~30 o dans le cache.
   Sur les 1 400 magasins gardes en memoire : 1,4 Mo -> 0,27 Mo. Le repli en
   cascade [len,1500,800,400,200] de saveStoresCache ne se declenchera plus. */

/* --- 5) MIGRATION DE LA BASE — a placer a cote de fbCleanUnverifiedBrands.
   Cout mesure : 30 930 lectures + ~15 144 ecritures = tient dans UNE journee
   de quota gratuit (50 000 lectures / 20 000 ecritures). A lancer UNE fois.
   Appelle d'abord fbCompactAssortments(true) : ne touche a rien, compte. */
window.fbCompactAssortments = async function(dryRun){
  var lastDoc = null, lus = 0, aEcrire = 0, octetsLibres = 0, elementsIndex = 0;
  while(true){
    var q1 = lastDoc
      ? query(collection(db,"stores"), orderBy(documentId()), startAfter(lastDoc), limit(400))
      : query(collection(db,"stores"), orderBy(documentId()), limit(400));
    var snap = await getDocs(q1);
    if(snap.empty) break;
    var batch = writeBatch(db), n = 0;
    for(var i = 0; i < snap.docs.length; i++){
      var d = snap.docs[i], data = d.data();
      var drinks = data.drinks || [], dv = data.drinksVerified || [];
      if(!drinks.length && !dv.length) continue;
      var confs = data.confirmations || {};
      // On ne garde QUE ce qu'un humain a confirme. Le reste est reconstituable.
      var garde = drinks.filter(function(id){ return (Number(confs[id]) || 0) > 0; });
      var key = assortmentKeyFor(data.name, data.brand);
      octetsLibres  += (drinks.length + dv.length - garde.length) * 6;
      elementsIndex += (drinks.length + dv.length - garde.length);
      aEcrire++;
      if(!dryRun){
        batch.update(d.ref, {
          asrt: key,
          drinks: garde,
          drinksVerified: deleteField(),
          verifiedSource: deleteField()
        });
        if(++n >= 200){ await batch.commit(); batch = writeBatch(db); n = 0; }
      }
    }
    if(!dryRun && n) await batch.commit();
    lastDoc = snap.docs[snap.docs.length - 1];
    lus += snap.size;
    console.log("parcourus " + lus + " · a compacter " + aEcrire);
    if(snap.size < 400) break;
  }
  return { lus: lus, compactes: aEcrire,
           donnees_liberees_Mo: +(octetsLibres / 1048576).toFixed(1),
           index_libere_Mo: +(elementsIndex * 75 / 1048576).toFixed(1) };
};
