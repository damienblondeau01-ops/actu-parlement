// app/_layout.tsx
import React from "react";
import { Stack } from "expo-router";

const ROOT_BG = "#0B1020";

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: ROOT_BG },
      }}
    />
  );
}
