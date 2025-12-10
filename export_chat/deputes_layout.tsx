// app/(tabs)/deputes/_layout.tsx
import { Stack } from "expo-router";
import React from "react";

export default function DeputesStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    />
  );
}
