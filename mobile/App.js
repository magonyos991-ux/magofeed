/* Magofeed — application mobile React Native (Expo).
   Même Firebase, même catalogue, mêmes magasins que l'app web ; seule
   l'interface est native. v1 : recherche, fiche boisson, carte, itinéraire. */
import React, { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import {
  useFonts,
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_700Bold,
} from "@expo-google-fonts/space-grotesk";
import { View, ActivityIndicator } from "react-native";
import { connecterAnonyme } from "./src/firebase";
import AccueilScreen from "./src/screens/AccueilScreen";
import BoissonScreen from "./src/screens/BoissonScreen";
import CarteScreen from "./src/screens/CarteScreen";
import { C, F } from "./src/theme";

const Stack = createNativeStackNavigator();

const themeNav = {
  colors: {
    background: C.fond,
    card: C.fond,
    text: C.encre,
    border: C.bord,
    primary: C.encre,
    notification: C.or,
  },
  dark: false,
  fonts: {
    regular: { fontFamily: F.corps, fontWeight: "400" },
    medium: { fontFamily: F.moyen, fontWeight: "500" },
    bold: { fontFamily: F.titre, fontWeight: "700" },
    heavy: { fontFamily: F.titre, fontWeight: "700" },
  },
};

export default function App() {
  const [fontsOk] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
  });

  useEffect(() => {
    connecterAnonyme();
  }, []);

  if (!fontsOk) {
    return (
      <View style={{ flex: 1, backgroundColor: C.fond, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={C.or} size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer theme={themeNav}>
      <StatusBar style="dark" backgroundColor={C.fond} />
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: C.fond },
          headerTitleStyle: { fontFamily: F.titre, color: C.encre },
          headerTintColor: C.encre,
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="Accueil" component={AccueilScreen} options={{ headerShown: false }} />
        <Stack.Screen
          name="Boisson"
          component={BoissonScreen}
          options={({ route }) => ({ title: route.params.drink.name })}
        />
        <Stack.Screen name="Carte" component={CarteScreen} options={{ title: "Autour de toi" }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
