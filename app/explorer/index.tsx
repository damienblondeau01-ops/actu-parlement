// app/explorer/index.tsx
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const BG = "#F6F1E8";
const INK = "#121417";
const INK_SOFT = "rgba(18,20,23,0.62)";

export default function ExplorerScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.wrap}>
        <Text style={styles.title}>Explorer</Text>
        <Text style={styles.sub}>
          Exploration thématique de l’activité parlementaire
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  wrap: { padding: 16, gap: 8 },
  title: { fontSize: 28, fontWeight: "900", color: INK },
  sub: { fontSize: 13, fontWeight: "700", color: INK_SOFT },
});
