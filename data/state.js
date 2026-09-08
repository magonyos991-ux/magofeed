/* © 2026 Magofeed — Tous droits réservés / All rights reserved.
   Titulaire des droits (mention légale) : Ilias Benabdellah.
   Marqueur de propriété intellectuelle — ne pas retirer. */
/* ============================================================================
   ÉTAT GLOBAL DE L'APPLICATION
   ----------------------------------------------------------------------------
   Ces variables vivaient dans data/i18n.js, à côté des traductions. Elles n'ont
   rien d'un dictionnaire : c'est l'état que tout index.html lit et écrit. Les
   chercher dans un fichier nommé "i18n" fait perdre du temps — et fait conclure
   à tort qu'elles ne sont déclarées nulle part.
   Chargé APRÈS data/drinks.js (recents pointe dans DRINKS) et AVANT index.html.
   ============================================================================ */
var curCat="Tous",curSel=null,recents=[DRINKS[14],DRINKS[22]];
var accentColor="#1a1714",accentLight="#f0eee9";
var userLat=null,userLng=null;
var scanActive=false,quaggaRunning=false;
/* penalty : points RETIRES par le serveur (anti-farm). Le client ne l'ecrit
   jamais — il le lit seulement. C'est ce qui rend la sanction impossible a
   effacer en vidant le cache. Voir functions-a-deployer/anti-farm.js. */
var userStats={signals:0,confirms:0,pts:0,discAccepted:0,penalty:0,activity:[]};
var PROMO_REWARD=50; // points gagnes quand TA decouverte est acceptee au catalogue
var reportTarget=null,curMode="light",curLang="fr";
var searchDebounce=null;
var mapRenderedFor=null;
var storePrices=JSON.parse(localStorage.getItem("magoPrices")||"{}");
var curBudget=null;
var favorites=JSON.parse(localStorage.getItem("magofavs")||"[]");
var searchHistory=JSON.parse(localStorage.getItem("magosearchhist")||"[]");
var userRatings=JSON.parse(localStorage.getItem("mago_ratings")||"{}");
var userRecs=JSON.parse(localStorage.getItem("mago_recs")||"{}");
/* DEUX COMPTEURS, ET ILS NE DOIVENT JAMAIS SE MELANGER.

   scanCounts       MES scans a moi. Sert au chiffre « Scans » du profil, au
                    badge Scanneur, et a savoir si quelqu'un est nouveau.
   scanCountsGlobal ceux de TOUT LE MONDE, lus dans stats/scanCounts. Sert aux
                    tendances : le rail d'accueil, les boissons qui montent.

   Ils n'en faisaient qu'un. Le compteur communautaire etait deverse dans le
   compteur personnel a chaque chargement, et le profil d'une personne qui
   venait d'installer l'app affichait 84 scans — le nombre de boissons scannees
   par l'ensemble des utilisateurs. Pire : le premier scan de cette personne
   reecrivait le tout dans son stockage local, gravant la confusion chez elle
   pour de bon. Le document stats/scanCounts est lisible sans compte, donc le
   faux chiffre s'affichait meme avant toute connexion. */
var scanCounts=JSON.parse(localStorage.getItem("magoscans")||"{}");
var scanCountsGlobal={};
var curSort="distance";
var soundEnabled=localStorage.getItem("magosound")!=="0";
var deferredInstallPrompt=null;
var searchMode="drinks";
var curStoreDetail=null;
var storeDetailReturn="search";
var contributedStores={};
var votedDiscoveries=JSON.parse(localStorage.getItem("magoVotedDisc")||"[]");
var drinkRatingsAgg={};
var drinkRecsAgg={};
var curFormat=null;
var curStoreBrandFilter=null;
var curStoreSearchSort="distance";
var curStoreDetailQuery="";
var curStoreDetailCat="Tous";
var lastBrandsAvailable=[];
var geocodeCache=JSON.parse(localStorage.getItem("magoGeocodeCache")||"{}");
var priceHist=JSON.parse(localStorage.getItem("magoPriceHist")||"{}");
var leaderboardRows=null;
var leaderboardLoadedAt=0;
var userStreak=JSON.parse(localStorage.getItem("magoStreak")||'{"streak":0,"last":"","best":0}');
var scanHist=JSON.parse(localStorage.getItem("magoScanHist")||"[]");
/* REPARATION, UNE SEULE FOIS PAR APPAREIL. Les installations qui ont vecu avec
   le melange gardent les identifiants communautaires dans leur stockage local :
   les effacer ne suffit pas, il faut RECONSTRUIRE le vrai compteur personnel.
   La seule source fiable est magoScanHist, le journal des scans reellement
   faits sur cet appareil.
   La valeur est remise a 1 et non au compte d'origine : ce compte etait
   melange, donc faux, et aucun affichage ne lit la valeur — les trois usages
   personnels comptent des CLES (combien de boissons differentes), jamais des
   occurrences. Mieux vaut un 1 honnete qu'un nombre invente.
   Limite assumee : le journal ne garde que 50 entrees. Quelqu'un qui aurait
   scanne plus de 50 boissons differentes verrait son compteur plafonne — c'est
   toujours plus vrai que le chiffre de la communaute affiche comme le sien. */
(function reparerCompteurPersonnel(){
  try{
    if(localStorage.getItem("magoscansRepare")==="1")return;
    var perso={};
    (scanHist||[]).forEach(function(e){
      var id=(e&&e.drinkId!=null)?String(e.drinkId):"";
      if(id!=="")perso[id]=1;
    });
    scanCounts=perso;
    localStorage.setItem("magoscans",JSON.stringify(perso));
    localStorage.setItem("magoscansRepare","1");
  }catch(e){}
})();
var curBrandFilter=null;
var isAdmin=false;
// v3 : purge des resolutions automatiques de l'ancienne verification (incident
// chips Stax sur le Pepsi) en CONSERVANT les corrections manuelles de l'admin
var imgCache=(function(){
  var v3={};
  try{v3=JSON.parse(localStorage.getItem("magoImgCache3")||"{}");}catch(e){}
  try{
    var v2=JSON.parse(localStorage.getItem("magoImgCache2")||"null");
    if(v2){
      Object.keys(v2).forEach(function(k){
        if(v2[k]&&v2[k].manual&&!v3[k])v3[k]=v2[k];
      });
      localStorage.removeItem("magoImgCache2");
      localStorage.setItem("magoImgCache3",JSON.stringify(v3));
    }
    localStorage.removeItem("magoImgCache");
  }catch(e){}
  return v3;
})();
var imgFetchInFlight={};
var communityCatalogLoaded=false;
var offlineDataApplied=false;
