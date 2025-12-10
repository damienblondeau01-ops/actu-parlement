// app/(tabs)/deputes/_layout.tsx
import { Stack } from "expo-router";
import React from "react";

export default function DeputesLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    />
  );
}
