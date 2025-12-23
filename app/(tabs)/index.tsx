// app/(tabs)/index.tsx
import React from "react";
import { Tabs } from "expo-router";
import { theme } from "../../lib/theme";

const colors = theme.colors;

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
        },
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.subtext,
      }}
    >
      <Tabs.Screen
        name="lois"
        options={{
          title: "Lois",
        }}
      />
      <Tabs.Screen
        name="deputes"
        options={{
          title: "Députés",
        }}
      />
      {/* ajoute/retire des tabs selon ton arborescence */}
    </Tabs>
  );
}

