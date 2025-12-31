// app/(tabs)/lois/_layout.tsx
import { Stack } from "expo-router";
import React from "react";

const OPAQUE_BG = "#0B0B0D"; // 🔥 fond plein, pas rgba

export default function LoisLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "none", // 🔥 zéro transition => zéro "vue de l’écran précédent"
        contentStyle: { backgroundColor: OPAQUE_BG },
      }}
    />
  );
}
