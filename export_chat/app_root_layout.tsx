// app/_layout.tsx
import { Slot } from "expo-router";
import React from "react";

export default function RootLayout() {
  // On laisse Expo Router rendre le bon groupe de routes (ici : (tabs))
  return <Slot />;
}
