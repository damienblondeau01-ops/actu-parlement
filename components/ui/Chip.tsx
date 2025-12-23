import React from "react";
import { Text, View, StyleSheet } from "react-native";
import { theme } from "../../lib/theme";

type ChipProps = {
  label: string;
};

export function Chip({ label }: ChipProps) {
  return (
    <View style={styles.chip}>
      <Text style={styles.text} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  text: {
    color: theme.colors.subtext, // ✅ couleur muted officielle
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
});
