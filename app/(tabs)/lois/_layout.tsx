// app/(tabs)/lois/_layout.tsx
import { Stack } from "expo-router";
import React from "react";

export default function LoisLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    />
  );
}
