/* « Y aller » : ouvre l'app de cartes native avec l'itinéraire. */
import { Linking, Platform } from "react-native";

export function ouvrirItineraire(lat, lng, nom) {
  const q = lat + "," + lng;
  const url =
    Platform.OS === "ios"
      ? "http://maps.apple.com/?daddr=" + q
      : "geo:" + q + "?q=" + q + "(" + encodeURIComponent(nom || "Magasin") + ")";
  Linking.openURL(url).catch(() => {});
}
