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
var scanCounts=JSON.parse(localStorage.getItem("magoscans")||"{}");
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
