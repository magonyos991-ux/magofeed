/* Carte générale : tous les magasins autour de soi.
   Vert = au moins un rayon confirmé ; gris = magasin connu, rien de confirmé. */
import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, StyleSheet, Platform } from "react-native";
import MapView, { Marker } from "react-native-maps";
import * as Location from "expo-location";
import { magasinsAutour, CENTRE_DEFAUT } from "../data/stores";
import { C, F } from "../theme";

export default function CarteScreen() {
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
      } catch (e) { /* Bruxelles par défaut */ }
      if (annule) return;
      setPosition(pos);
      try {
        const tous = await magasinsAutour(pos.lat, pos.lng, 10);
        if (!annule) setMagasins(tous);
      } catch (e) {
        if (!annule) setErreur(true);
      }
    })();
    return () => { annule = true; };
  }, []);

  if (erreur) return <View style={s.page}><Text style={s.info}>Les magasins ne répondent pas. Vérifie ta connexion.</Text></View>;
  if (!position || !magasins) {
    return (
      <View style={s.page}>
        <ActivityIndicator color={C.or} size="large" style={{ marginTop: 60 }} />
        <Text style={s.info}>Chargement de la carte…</Text>
      </View>
    );
  }

  const aDuConfirme = (m) => Object.values(m.confirmations || {}).some((n) => Number(n) > 0);

  return (
    <View style={s.page}>
      <MapView
        style={{ flex: 1 }}
        mapType={Platform.OS === "ios" ? "mutedStandard" : "standard"}
        initialRegion={{
          latitude: position.lat,
          longitude: position.lng,
          latitudeDelta: 0.09,
          longitudeDelta: 0.09,
        }}
        showsUserLocation
      >
        {magasins.map((m) => (
          <Marker
            key={m.id}
            coordinate={{ latitude: m.lat, longitude: m.lng }}
            title={m.name}
            pinColor={aDuConfirme(m) ? C.vert : C.gris}
          />
        ))}
      </MapView>
      <View style={s.bandeau}>
        <Text style={s.bandeauTxt}>{magasins.length} magasins dans les 10 km · vert = rayon confirmé récemment</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.fond },
  info: { fontFamily: F.corps, fontSize: 14, color: C.encre2, textAlign: "center", marginTop: 16, paddingHorizontal: 30 },
  bandeau: { paddingVertical: 10, paddingHorizontal: 18, backgroundColor: C.fond2, borderTopWidth: 1, borderColor: C.bord },
  bandeauTxt: { fontFamily: F.moyen, fontSize: 12.5, color: C.encre },
});
