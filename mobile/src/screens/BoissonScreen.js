/* Fiche boisson : la carte des magasins qui l'ont, triés par distance.
   Pin vert = rayon confirmé par la communauté. Jamais supposé. */
import React, { useEffect, useState } from "react";
import { View, Text, FlatList, Pressable, ActivityIndicator, StyleSheet, Platform } from "react-native";
import MapView, { Marker } from "react-native-maps";
import * as Location from "expo-location";
import { magasinsAutour, vendLaBoisson, confirmee, texteDistance, CENTRE_DEFAUT } from "../data/stores";
import { ouvrirItineraire } from "../ouvrirItineraire";
import { C, F } from "../theme";

export default function BoissonScreen({ route }) {
  const drink = route.params.drink;
  const drinkId = Number(drink.id != null ? drink.id : drink.docId);
  const [position, setPosition] = useState(null);
  const [magasins, setMagasins] = useState(null);
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    let annule = false;
    (async () => {
      let pos = CENTRE_DEFAUT;
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status === "granted") {
          const ici = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          pos = { lat: ici.coords.latitude, lng: ici.coords.longitude };
        }
      } catch (e) { /* géoloc refusée ou indisponible : Bruxelles par défaut */ }
      if (annule) return;
      setPosition(pos);
      try {
        const tous = await magasinsAutour(pos.lat, pos.lng, 10);
        if (annule) return;
        setMagasins(tous.filter((s) => vendLaBoisson(s, drinkId)));
      } catch (e) {
        if (!annule) setErreur(true);
      }
    })();
    return () => { annule = true; };
  }, [drinkId]);

  if (erreur) {
    return (
      <View style={s.page}>
        <Text style={s.info}>Les magasins ne répondent pas. Vérifie ta connexion et réessaie.</Text>
      </View>
    );
  }
  if (!position || !magasins) {
    return (
      <View style={s.page}>
        <ActivityIndicator color={C.or} size="large" style={{ marginTop: 60 }} />
        <Text style={s.info}>Recherche des magasins autour de toi…</Text>
      </View>
    );
  }

  const nbConfirmes = magasins.filter((m) => confirmee(m, drinkId)).length;

  return (
    <View style={s.page}>
      <View style={s.carteBloc}>
        <MapView
          style={{ flex: 1 }}
          mapType={Platform.OS === "ios" ? "mutedStandard" : "standard"}
          initialRegion={{
            latitude: position.lat,
            longitude: position.lng,
            latitudeDelta: 0.08,
            longitudeDelta: 0.08,
          }}
          showsUserLocation
        >
          {magasins.map((m) => (
            <Marker
              key={m.id}
              coordinate={{ latitude: m.lat, longitude: m.lng }}
              title={m.name}
              description={confirmee(m, drinkId) ? "Rayon confirmé par la communauté" : "Rayon probable, à confirmer"}
              pinColor={confirmee(m, drinkId) ? C.vert : C.gris}
            />
          ))}
        </MapView>
      </View>
      <View style={s.bandeau}>
        <Text style={s.bandeauTxt}>
          {magasins.length
            ? magasins.length + " magasin" + (magasins.length > 1 ? "s" : "") + " · " + nbConfirmes + " confirmé" + (nbConfirmes > 1 ? "s" : "")
            : "Aucun magasin connu ici pour cette boisson — sois le premier à la signaler"}
        </Text>
      </View>
      <FlatList
        data={magasins}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => (
          <View style={s.ligne}>
            <View style={[s.point, { backgroundColor: confirmee(item, drinkId) ? C.vert : C.gris }]} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.nom} numberOfLines={1}>{item.name}</Text>
              <Text style={s.detail}>
                {texteDistance(item.distKm)}
                {confirmee(item, drinkId) ? " · confirmé" : " · à confirmer"}
              </Text>
            </View>
            <Pressable style={s.bouton} onPress={() => ouvrirItineraire(item.lat, item.lng, item.name)}>
              <Text style={s.boutonTxt}>Y ALLER</Text>
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.fond },
  info: { fontFamily: F.corps, fontSize: 14, color: C.encre2, textAlign: "center", marginTop: 16, paddingHorizontal: 30, lineHeight: 21 },
  carteBloc: { height: "42%", borderBottomWidth: 1.5, borderColor: C.bord },
  bandeau: { paddingVertical: 10, paddingHorizontal: 18, backgroundColor: C.fond2, borderBottomWidth: 1, borderColor: C.bord },
  bandeauTxt: { fontFamily: F.moyen, fontSize: 13, color: C.encre },
  ligne: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: C.blanc, borderColor: C.bord, borderWidth: 1, borderRadius: 14,
    paddingVertical: 12, paddingHorizontal: 14, marginHorizontal: 18, marginTop: 8,
  },
  point: { width: 12, height: 12, borderRadius: 6 },
  nom: { fontFamily: F.moyen, fontSize: 15, color: C.encre },
  detail: { fontFamily: F.corps, fontSize: 12.5, color: C.encre2, marginTop: 1 },
  bouton: { backgroundColor: C.encre, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 16 },
  boutonTxt: { color: C.fond, fontFamily: F.titre, fontSize: 12, letterSpacing: 1.5 },
});
