import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { theme } from "../../lib/theme";

type Props = {
  title?: string;
  summary: string;
};

export function LoiAIIntro({ title = "En clair", summary }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.kicker}>{title}</Text>
      <Text style={styles.text}>{summary}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    marginBottom: 8,
  },
  kicker: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  text: {
    color: theme.colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
});
