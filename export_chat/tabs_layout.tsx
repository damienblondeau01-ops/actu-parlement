// app/(tabs)/_layout.tsx
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "../../lib/theme";

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.tabBarActive,
        tabBarInactiveTintColor: theme.colors.tabBarInactive,
        tabBarStyle: {
          backgroundColor: theme.colors.tabBarBackground,
          borderTopColor: theme.colors.border,
          borderTopWidth: 1,
          height: 56 + insets.bottom,
          paddingTop: 4,
          paddingBottom: Math.max(insets.bottom, 6),
        },
        tabBarLabelStyle: {
          fontSize: theme.fontSize.xs ?? 10,
        },
        tabBarIconStyle: {
          marginTop: 2,
        },
        sceneStyle: {
          backgroundColor: theme.colors.background,
        },
      }}
    >
      {/* Onglet LOIS -> app/(tabs)/lois/index.tsx */}
      <Tabs.Screen
        name="lois"
        options={{
          title: "Lois",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons
              name="file-document-outline"
              color={color}
              size={size}
            />
          ),
        }}
      />

      {/* Onglet DÉPUTÉS -> app/(tabs)/deputes/index.tsx */}
      <Tabs.Screen
        name="deputes"
        options={{
          title: "Députés",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons
              name="account-group-outline"
              color={color}
              size={size}
            />
          ),
        }}
      />

      {/* Onglet STATISTIQUES -> app/(tabs)/stats.tsx */}
      <Tabs.Screen
        name="stats"
        options={{
          title: "Statistiques",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons
              name="chart-bar"
              color={color}
              size={size}
            />
          ),
        }}
      />

      {/* Onglet PARAMÈTRES -> app/(tabs)/index.tsx */}
      <Tabs.Screen
        name="index"
        options={{
          title: "Paramètres",
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons
              name="cog-outline"
              color={color}
              size={size}
            />
          ),
        }}
      />
    </Tabs>
  );
}
