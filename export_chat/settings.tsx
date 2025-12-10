// app/(tabs)/index.tsx
import React, { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { ScreenContainer } from "../../lib/parlement-common";
import { theme } from "../../lib/theme";

export default function SettingsScreen() {
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [darkModeEnabled, setDarkModeEnabled] = useState(false);

  const handleAccountPress = () => {
    Alert.alert("Compte", "Ici tu pourras gérer ton compte plus tard 🙂");
  };

  const handleAboutPress = () => {
    Alert.alert(
      "À propos",
      "ActuDesLois\nVersion 1.0.0\nSuivi de l’activité parlementaire."
    );
  };

  return (
    <ScreenContainer
      title="Paramètres"
      subtitle="Réglages de l’application"
    >
      <ScrollView contentContainerStyle={styles.content}>
        {/* Section préférences */}
        <Text style={styles.sectionTitle}>Préférences</Text>

        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowTextContainer}>
              <Text style={styles.rowTitle}>Notifications</Text>
              <Text style={styles.rowSubtitle}>
                Être prévenu des nouvelles lois et grandes actualités.
              </Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
            />
          </View>

          <View style={styles.separator} />

          <View style={styles.row}>
            <View style={styles.rowTextContainer}>
              <Text style={styles.rowTitle}>Mode sombre</Text>
              <Text style={styles.rowSubtitle}>
                Bascule entre mode clair et sombre (placeholder pour l’instant).
              </Text>
            </View>
            <Switch
              value={darkModeEnabled}
              onValueChange={setDarkModeEnabled}
            />
          </View>
        </View>

        {/* Section compte */}
        <Text style={styles.sectionTitle}>Compte</Text>

        <Pressable style={styles.card} onPress={handleAccountPress}>
          <Text style={styles.rowTitle}>Mon compte</Text>
          <Text style={styles.rowSubtitle}>
            Connexion, synchronisation, préférences personnalisées (à venir).
          </Text>
        </Pressable>

        {/* Section à propos */}
        <Text style={styles.sectionTitle}>Application</Text>

        <Pressable style={styles.card} onPress={handleAboutPress}>
          <Text style={styles.rowTitle}>À propos de ActuDesLois</Text>
          <Text style={styles.rowSubtitle}>
            Version, crédits et informations sur le projet.
          </Text>
        </Pressable>

        <Text style={styles.footerText}>ActuDesLois • Prototype V1</Text>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 24,
  },
  sectionTitle: {
    fontSize: theme.fontSize.sm,
    fontWeight: "600",
    color: theme.colors.subtext,
    marginBottom: 8,
    marginTop: 12,
    textTransform: "uppercase",
  },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowTextContainer: {
    flex: 1,
    paddingRight: 12,
  },
  rowTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: "600",
    color: theme.colors.text,
  },
  rowSubtitle: {
    marginTop: 4,
    fontSize: theme.fontSize.sm,
    color: theme.colors.subtext,
  },
  separator: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: 10,
  },
  footerText: {
    marginTop: 16,
    textAlign: "center",
    fontSize: theme.fontSize.sm,
    color: theme.colors.subtext,
  },
});
