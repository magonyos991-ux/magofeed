# Patch « magasins OSM automatiques » — à TESTER avant prod

> ⚠️ **Je n'ai pas pu le tester** : Overpass (OpenStreetMap) et Firebase sont **injoignables depuis l'environnement Claude**. Ce patch est prêt à tester **sur ton téléphone / en local** avant de le pousser en ligne. Ne le mets pas en prod sans l'avoir vu marcher.

## Le principe
Aujourd'hui `openOsmImport()` + `osmAnalyze()` marchent, mais c'est **manuel**. On veut que les magasins apparaissent **tout seuls**.

Deux niveaux, du plus sûr au plus engageant :

### Niveau 1 (recommandé, sûr) — remplir TA ville toi-même, aujourd'hui, sans code
Ouvre l'app → écran carte → bouton **« Importer les magasins d'une zone »** → tape **Bruxelles**, rayon **10 km** → Analyser → Importer. Refais pour **Charleroi**. 
✅ Ta carte est pleine **maintenant**, zéro risque, zéro code.

### Niveau 2 — auto-import à l'ouverture de la carte (nécessite test)
Idée : quand l'utilisateur ouvre la carte Explorer dans une zone **peu couverte**, lancer `osmAnalyze()` automatiquement **une seule fois par zone**, puis afficher les résultats.

**Décision importante (à toi) :** l'import **écrit dans ton Firebase** → coût + modération si tu l'actives pour *tous* les users partout. Deux options :
- **2A – lecture seule** : afficher les commerces OSM en *pins temporaires* sans écrire en base (pas de coût, pas de pollution ; l'écriture reste un geste volontaire). **← le plus sain.**
- **2B – auto-écriture** : créer les magasins en base automatiquement (carte qui se remplit pour tout le monde, mais coût/modération à surveiller).

## Squelette de code (option 2, à adapter + tester)
À placer là où tu ouvres la carte Explorer (`openExplore()` / init de la carte), après avoir la position :

```js
// --- Auto-OSM (garde-fous) ---
var OSM_AUTO = true;                 // interrupteur : mets false pour désactiver vite
var _osmSeen = JSON.parse(localStorage.getItem('osmAutoSeen')||'{}');

function autoOsmForArea(lat, lng){
  if(!OSM_AUTO || lat==null) return;
  var key = lat.toFixed(2)+','+lng.toFixed(2);   // ~1 km : 1 seule fois par zone
  if(_osmSeen[key]) return;
  _osmSeen[key] = Date.now();
  localStorage.setItem('osmAutoSeen', JSON.stringify(_osmSeen));
  try {
    osmCenter = null;                // = position courante
    // Réutilise la logique existante d'osmAnalyze SANS ouvrir la modale.
    // -> extrais le coeur d'osmAnalyze() dans une fonction osmFetch(lat,lng,km)
    //    qui renvoie une Promise de "candidats", puis :
    osmFetch(lat, lng, 3).then(function(cands){
      if(!cands || !cands.length) return;
      // 2A (recommandé) : afficher en pins temporaires (lecture seule)
      cands.forEach(showTempOsmPin);        // <-- à écrire : addLayer Leaflet, pin léger "?"
      // 2B (si tu choisis l'auto-écriture) : décommente
      // osmCandidates = cands; osmRunImport();   // écrit en Firebase
    }).catch(function(e){ console.warn('autoOsm', e); });  // fail-safe : rien ne casse
  } catch(e){ console.warn('autoOsm', e); }
}
```

### Ce qu'il reste à faire (par un dev, avec test réseau)
1. **Extraire** le cœur de `osmAnalyze()` (le `fetch` Overpass + le mapping des éléments, lignes ~7832–7853 de `index.html`) dans une fonction pure `osmFetch(lat,lng,km) → Promise([candidats])`.
2. Écrire `showTempOsmPin(store)` : un marqueur Leaflet léger (pin « ? ») sur `explore-map`, cliquable → propose « ajouter ce magasin ».
3. Appeler `autoOsmForArea(userLat,userLng)` à l'ouverture de la carte (et au `moveend` de la carte pour couvrir la zone regardée, avec le garde-fou `_osmSeen`).
4. **Tester** : Overpass répond ? pins affichés ? pas de doublon avec les magasins existants ? Rate-limit OK ?

## Garde-fous obligatoires
- **1 requête par zone** (clé arrondie) — jamais en boucle.
- **fail-safe** : toute erreur réseau = on ignore, la carte reste normale.
- **dédoublonnage** : réutilise le filtre anti-doublon déjà présent dans `osmAnalyze` (distance < 60 m + nom proche).
- **respecte Overpass** : pas de spam (l'API est gratuite mais partagée).

## Recommandation
Commence par le **Niveau 1** (remplir Bruxelles/Charleroi à la main) → ça débloque ton lancement **aujourd'hui**. Le **Niveau 2 (2A lecture seule)** se fait ensuite, tranquillement, avec un vrai test sur appareil.
