import React from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/lib/theme";
import type { EnClairItem } from "@/lib/ai/types";

type Props = {
  items: EnClairItem[];
};

export default function LoiEnClairBlock({ items }: Props) {
  const colors = theme.colors as any;

  if (!items || items.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={[styles.emptyText, { color: colors.muted ?? "rgba(18,20,23,0.72)" }]}>
          Aucun résumé vérifiable disponible.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {items.map((it, i) => (
        <View key={`enclair-${i}`} style={styles.row}>
          <Text style={[styles.text, { color: colors.text ?? "#121417" }]}>
            • {it.text}
          </Text>

          <Pressable
            onPress={() => Linking.openURL(it.source_url)}
            style={styles.source}
          >
            <Ionicons
              name="link-outline"
              size={14}
              color={colors.muted ?? "rgba(18,20,23,0.72)"}
            />
            <Text style={[styles.sourceText, { color: colors.muted ?? "rgba(18,20,23,0.72)" }]}>
              {it.source_label}
            </Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  row: { gap: 6 },
  text: { fontSize: 13, lineHeight: 18, fontWeight: "800" },
  source: { flexDirection: "row", alignItems: "center", gap: 6 },
  sourceText: { fontSize: 12, fontWeight: "700" },
  empty: { paddingVertical: 8 },
  emptyText: { fontSize: 12, lineHeight: 16, opacity: 0.9 },
});
