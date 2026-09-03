#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# mesurer-osm.sh — combien de magasins Magofeed peut-il VRAIMENT importer ?
#
# A LANCER DEPUIS TON PC (Overpass est injoignable depuis l'environnement
# d'audit). Aucune dependance : bash + curl.
#
#   chmod +x growth/mesurer-osm.sh
#   ./growth/mesurer-osm.sh BE FR NL KR TR
#   ./growth/mesurer-osm.sh            # = BE FR NL DE IT ES GB KR TR MA
#
# Pour chaque pays, 3 comptages (aucune donnee telechargee, juste des nombres) :
#   A. filtre ACTUEL de l'app (OSM_SHOP_TYPES, index.html ligne 9158)
#   B. filtre actuel MAIS uniquement les commerces qui portent un tag "name"
#      -> l'ecart A-B, c'est exactement ce que l'import jette a la poubelle
#         a cause du test  if(...||!name) return null;
#   C. filtre ELARGI propose (alcohol, wine, bakery, department_store,
#      variety_store, chemist, butcher, general, trade + amenity=fuel)
#
# Compte ~1 min par pays (Overpass est lent sur les requetes "pays entier").
# ---------------------------------------------------------------------------
set -u

API="https://overpass-api.de/api/interpreter"

# Filtre exactement identique a celui de l'app aujourd'hui :
ACTUEL="convenience|supermarket|kiosk|beverages|greengrocer|deli|newsagent|frozen_food|health_food|farm|general|food|pastry|confectionery"

# Filtre elargi propose (surensemble strict de l'actuel) :
ELARGI="$ACTUEL|alcohol|wine|bakery|butcher|department_store|variety_store|chemist|dairy|seafood|tea|coffee|water|grocery|discount|trade|wholesale|mall"

PAYS=("$@")
if [ ${#PAYS[@]} -eq 0 ]; then PAYS=(BE FR NL DE IT ES GB KR TR MA); fi

# $1 = code ISO pays, $2 = regex shop, $3 = "" ou "name" pour n'exiger que les nommes
compte() {
  local iso="$1" re="$2" exige_nom="$3" filtre_nom=""
  [ -n "$exige_nom" ] && filtre_nom='["name"]'
  local q
  q=$(cat <<QUERY
[out:json][timeout:900];
area["ISO3166-1"="${iso}"][admin_level=2]->.pays;
(
  node["shop"~"^(${re})\$"]${filtre_nom}(area.pays);
  way["shop"~"^(${re})\$"]${filtre_nom}(area.pays);
  relation["shop"~"^(${re})\$"]${filtre_nom}(area.pays);
);
out count;
QUERY
)
  curl -s --max-time 900 -X POST -d "data=${q}" "$API" \
    | tr -d ' \n' | grep -o '"total":"[0-9]*"' | head -1 | grep -o '[0-9]*'
}

# meme chose pour les boutiques de stations-service (tag amenity, pas shop)
compte_stations() {
  local iso="$1"
  local q
  q=$(cat <<QUERY
[out:json][timeout:900];
area["ISO3166-1"="${iso}"][admin_level=2]->.pays;
(
  node["amenity"="fuel"]["shop"](area.pays);
  way["amenity"="fuel"]["shop"](area.pays);
);
out count;
QUERY
)
  curl -s --max-time 900 -X POST -d "data=${q}" "$API" \
    | tr -d ' \n' | grep -o '"total":"[0-9]*"' | head -1 | grep -o '[0-9]*'
}

printf '%-4s %10s %10s %10s %10s %8s\n' PAYS ACTUEL NOMMES PERDUS ELARGI STATIONS
printf '%s\n' "----------------------------------------------------------------"
for iso in "${PAYS[@]}"; do
  a=$(compte "$iso" "$ACTUEL" "");      sleep 20
  b=$(compte "$iso" "$ACTUEL" "name");  sleep 20
  c=$(compte "$iso" "$ELARGI" "");      sleep 20
  s=$(compte_stations "$iso");          sleep 20
  # Une requete Overpass qui echoue (429, 504, timeout) renvoie une chaine vide.
  # L'afficher comme "0" serait indiscernable d'une vraie mesure a zero : on
  # affiche ECHEC, et la ligne est a relancer.
  ecart="?"
  if [ -n "${a:-}" ] && [ -n "${b:-}" ]; then ecart=$((a-b)); fi
  printf '%-4s %10s %10s %10s %10s %8s\n' "$iso" "${a:-ECHEC}" "${b:-ECHEC}" "$ecart" "${c:-ECHEC}" "${s:-ECHEC}"
done
echo
echo "ACTUEL = ce que l'app POURRAIT importer avec le filtre d'aujourd'hui."
echo "NOMMES = ce qu'elle importe REELLEMENT (le reste est jete : pas de tag name)."
echo "ELARGI = ce que le filtre elargi rendrait accessible."
echo
echo "Compare la colonne NOMMES au contenu reel de ta base :"
echo "  Belgique 11 424 · France 6 667 · Pays-Bas 996 · Coree 1 261 · Turquie 910"
