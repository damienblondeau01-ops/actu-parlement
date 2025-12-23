// app/(tabs)/_layout.tsx
import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { View, StyleSheet } from "react-native";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { theme } from "../../lib/theme";

function TabsInner() {
  const insets = useSafeAreaInsets();
  const bottomOffset = Math.max(insets.bottom, 8); // distance par rapport au bord bas

  return (
    <View style={styles.wrapper}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.subtext,
          tabBarShowLabel: true,
          tabBarLabelPosition: "below-icon",
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: "500",
          },
          tabBarStyle: {
            position: "absolute",
            left: 12,
            right: 12,
            bottom: bottomOffset,
            height: 56,
            borderRadius: 999,
            backgroundColor: "rgba(15,23,42,0.96)",
            borderWidth: 1,
            borderColor: "rgba(148,163,184,0.45)",
            paddingTop: 4,
            paddingBottom: 4,
            elevation: 10,
            shadowColor: "#000",
            shadowOpacity: 0.25,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 6 },
          },
          tabBarItemStyle: {
            borderRadius: 999,
            marginHorizontal: 2,
            paddingTop: 2,
          },
          tabBarActiveBackgroundColor: "rgba(59,130,246,0.16)",
          tabBarHideOnKeyboard: true,
        }}
      >

        {/* Lois = app/(tabs)/lois/index.tsx */}
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

        {/* Députés = app/(tabs)/deputes/index.tsx */}
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

        {/* Activité = app/(tabs)/activite/index.tsx */}
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

        {/* Onglet settings → label affiché = Paramètres */}
        <Tabs.Screen
          name="settings" // garde le même nom que ton fichier /settings.tsx
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
      </Tabs>
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
  wrapper: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
});
