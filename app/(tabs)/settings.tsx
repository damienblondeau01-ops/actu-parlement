// app/(tabs)/settings.tsx
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { ScreenContainer, SectionTitle } from "../../lib/parlement-common";
import { theme } from "../../lib/theme";

export default function SettingsScreen() {
  return (
    <ScreenContainer>
      <SectionTitle>Paramètres</SectionTitle>

      <View style={styles.card}>
        <Text style={styles.title}>Préférences générales</Text>
        <Text style={styles.text}>
          Cet écran accueillera les options d’affichage, thèmes, filtres et
          notifications d’Actudeslois.
        </Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    marginTop: theme.spacing.lg,
  },
  title: {
    fontSize: theme.fontSize.md,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  text: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.subtext,
  },
});
