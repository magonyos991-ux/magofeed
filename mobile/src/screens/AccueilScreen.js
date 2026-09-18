/* Accueil : « Que boit-on ? » — recherche dans le catalogue, comme le web. */
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, FlatList, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { chargerCatalogue, filtrerCatalogue } from "../data/catalog";
import { C, F } from "../theme";

export default function AccueilScreen({ navigation }) {
  const [catalogue, setCatalogue] = useState(null);
  const [erreur, setErreur] = useState(false);
  const [texte, setTexte] = useState("");

  useEffect(() => {
    chargerCatalogue()
      .then(setCatalogue)
      .catch(() => setErreur(true));
  }, []);

  const resultats = useMemo(
    () => (catalogue ? filtrerCatalogue(catalogue, texte) : []),
    [catalogue, texte]
  );

  return (
    <View style={s.page}>
      <View style={s.entete}>
        <View style={s.pastille}>
          <Text style={s.pastilleTxt}>MAGOFEED</Text>
        </View>
        <Text style={s.titre}>QUE BOIT-ON ?</Text>
        <Text style={s.sous}>Cherche ta boisson, la carte te dit qui l'a vraiment.</Text>
      </View>
      <TextInput
        style={s.champ}
        placeholder="Ramune, Mogu Mogu, Ciao Energy…"
        placeholderTextColor={C.encre2}
        value={texte}
        onChangeText={setTexte}
        autoCorrect={false}
      />
      <Pressable style={s.lienCarte} onPress={() => navigation.navigate("Carte")}>
        <Text style={s.lienCarteTxt}>Voir la carte des magasins autour de moi</Text>
      </Pressable>
      {erreur ? (
        <Text style={s.info}>Le catalogue ne répond pas. Vérifie ta connexion et rouvre l'app.</Text>
      ) : !catalogue ? (
        <ActivityIndicator color={C.or} size="large" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={resultats}
          keyExtractor={(d) => String(d.docId)}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Text style={s.info}>Aucune boisson ne correspond. Elle manque au catalogue ? Propose-la depuis l'app web pour l'instant.</Text>}
          renderItem={({ item }) => (
            <Pressable style={s.ligne} onPress={() => navigation.navigate("Boisson", { drink: item })}>
              <View style={s.puce} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.nom} numberOfLines={1}>{item.name}</Text>
                {item.brand || item.cat ? (
                  <Text style={s.marque} numberOfLines={1}>{item.brand || item.cat}</Text>
                ) : null}
              </View>
              <Text style={s.fleche}>›</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.fond, paddingHorizontal: 18 },
  entete: { alignItems: "center", paddingTop: 14, paddingBottom: 16 },
  pastille: { backgroundColor: C.encre, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 18 },
  pastilleTxt: { color: C.fond, fontFamily: F.titre, fontSize: 12, letterSpacing: 4 },
  titre: { fontFamily: F.titre, fontSize: 30, color: C.encre, marginTop: 14, letterSpacing: -0.5 },
  sous: { fontFamily: F.moyen, fontSize: 13.5, color: C.encre2, marginTop: 4, textAlign: "center" },
  champ: {
    backgroundColor: C.blanc, borderColor: C.bord, borderWidth: 1.5, borderRadius: 16,
    paddingHorizontal: 16, paddingVertical: 13, fontSize: 16, fontFamily: F.moyen, color: C.encre,
  },
  lienCarte: { alignSelf: "center", marginVertical: 12, paddingVertical: 6, paddingHorizontal: 10 },
  lienCarteTxt: { fontFamily: F.moyen, fontSize: 13.5, color: C.orTexte, textDecorationLine: "underline" },
  info: { fontFamily: F.corps, fontSize: 14, color: C.encre2, textAlign: "center", marginTop: 30, lineHeight: 21 },
  ligne: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: C.blanc, borderColor: C.bord, borderWidth: 1, borderRadius: 14,
    paddingVertical: 12, paddingHorizontal: 14, marginBottom: 8,
  },
  puce: { width: 10, height: 10, backgroundColor: C.or },
  nom: { fontFamily: F.moyen, fontSize: 15.5, color: C.encre },
  marque: { fontFamily: F.corps, fontSize: 12.5, color: C.encre2, marginTop: 1 },
  fleche: { fontFamily: F.titre, fontSize: 20, color: C.encre2 },
});
