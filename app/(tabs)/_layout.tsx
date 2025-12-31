// app/(tabs)/_layout.tsx
import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { View, StyleSheet } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";

const OPAQUE_BG = "#F6F1E8";
const INK = "#121417";

const ACTIVE = "#0F766E"; // teal
const INACTIVE = "rgba(18,20,23,0.70)";

const TABBAR_H = 56;
const TABBAR_SIDE_GAP = 12;

function TabsInner() {
  const insets = useSafeAreaInsets();

  // position de la tabbar (on ne touche pas à la logique)
  const bottomOffset = Math.max(insets.bottom ?? 0, 8);

  // ✅ MASQUE OPAQUE : couvre toute la zone "sous la tabbar"
  // (offset bas + hauteur tabbar + petit rab pour les arrondis/ombres)
  const bottomMaskH = bottomOffset + TABBAR_H + 16;

  return (
    <View style={styles.wrapper}>
      <Tabs
        initialRouteName="actu/index"
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: OPAQUE_BG },

          tabBarActiveTintColor: ACTIVE,
          tabBarInactiveTintColor: INACTIVE,

          tabBarShowLabel: true,
          tabBarLabelPosition: "below-icon",
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: "700",
          },

          tabBarStyle: {
            position: "absolute",
            left: TABBAR_SIDE_GAP,
            right: TABBAR_SIDE_GAP,
            bottom: bottomOffset,
            height: TABBAR_H,
            borderRadius: 999,

            backgroundColor: OPAQUE_BG,
            borderWidth: 1,
            borderColor: INK,

            paddingTop: 4,
            paddingBottom: 4,

            // IMPORTANT: tabbar au-dessus du masque
            zIndex: 20,
            elevation: 20,

            shadowColor: "#000",
            shadowOpacity: 0.12,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 6 },
          },

          tabBarItemStyle: {
            borderRadius: 999,
            marginHorizontal: 2,
            paddingTop: 2,
            backgroundColor: "transparent",
          },

          tabBarHideOnKeyboard: true,
        }}
      >
        <Tabs.Screen
          name="actu/index"
          options={{
            title: "Actu",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? "newspaper" : "newspaper-outline"}
                size={22}
                color={color}
              />
            ),
          }}
        />

        <Tabs.Screen
          name="lois"
          options={{
            title: "Lois",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? "document-text" : "document-text-outline"}
                size={22}
                color={color}
              />
            ),
          }}
        />

        <Tabs.Screen
          name="deputes"
          options={{
            title: "Députés",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? "people" : "people-outline"}
                size={22}
                color={color}
              />
            ),
          }}
        />

        <Tabs.Screen
          name="activite"
          options={{
            title: "Activité",
            lazy: false,
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? "flash" : "flash-outline"}
                size={22}
                color={color}
              />
            ),
          }}
        />

        <Tabs.Screen
          name="settings"
          options={{
            title: "Paramètres",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? "settings" : "settings-outline"}
                size={22}
                color={color}
              />
            ),
          }}
        />

        {/* routes cachées */}
        <Tabs.Screen name="index" options={{ href: null }} />
        <Tabs.Screen name="stats" options={{ href: null }} />
        <Tabs.Screen name="stats-groupes" options={{ href: null }} />

        {/* cache tabbar sur détails */}
        <Tabs.Screen name="lois/[id]" options={{ href: null, tabBarStyle: { display: "none" } }} />
        <Tabs.Screen
          name="deputes/[id]"
          options={{ href: null, tabBarStyle: { display: "none" } }}
        />
        <Tabs.Screen
          name="scrutins/[id]"
          options={{ href: null, tabBarStyle: { display: "none" } }}
        />
      </Tabs>

      {/* ✅ ICI le MASQUE : au-dessus des écrans (donc cache la liste dessous),
          mais en dessous de la tabbar (zIndex 10 vs tabbar zIndex 20) */}
      <View
        pointerEvents="none"
        style={[
          styles.bottomMask,
          {
            height: bottomMaskH,
            backgroundColor: OPAQUE_BG,
          },
        ]}
      />
    </View>
  );
}

export default function TabsLayout() {
  return (
    <SafeAreaProvider>
      <TabsInner />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: OPAQUE_BG },

  bottomMask: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    elevation: 10,
  },
});
