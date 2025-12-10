// app/modal.tsx

import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ModalScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Modal</Text>
        <Text style={styles.text}>
          Ceci est un écran modal d’exemple. Tu peux le personnaliser ou
          le supprimer si tu ne l’utilises pas.
        </Text>
        <Text style={styles.textSecondary}>
          Plateforme : {Platform.OS.toUpperCase()}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#020617",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  card: {
    backgroundColor: "#0f172a",
    borderRadius: 12,
    padding: 20,
    width: "90%",
    maxWidth: 420,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#e5e7eb",
    marginBottom: 8,
  },
  text: {
    fontSize: 14,
    color: "#cbd5e1",
  },
  textSecondary: {
    fontSize: 12,
    color: "#94a3b8",
    marginTop: 10,
  },
});
