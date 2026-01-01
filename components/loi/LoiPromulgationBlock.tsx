// components/loi/LoiPromulgationBlock.tsx
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/lib/theme";

type Props = {
  /** ISO YYYY-MM-DD ou ISO complet */
  datePromulgation: string;
  /** Optionnel: texte source affiché */
  sourceLabel?: string;
};

function fmtDateFR(iso: string) {
  if (!iso) return "";
  // accepte "YYYY-MM-DD" ou "YYYY-MM-DDTHH:mm:ssZ"
  const d = new Date(iso.includes("T") ? iso : `${iso}T12:00:00.000Z`);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

export default function LoiPromulgationBlock({
  datePromulgation,
  sourceLabel = "Journal officiel — Légifrance",
}: Props) {
  const colors = theme.colors as any;

  return (
    <View style={[styles.wrap, { borderColor: colors.border ?? "rgba(255,255,255,0.10)" }]}>
      <View style={styles.headRow}>
        <View style={[styles.icon, { backgroundColor: "rgba(34,197,94,0.12)" }]}>
          <Ionicons name="ribbon-outline" size={16} color={colors.text} />
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.title, { color: colors.text }]}>Promulguée</Text>
          <Text style={[styles.sub, { color: colors.muted ?? "rgba(255,255,255,0.65)" }]}>
            Source : {sourceLabel}
          </Text>
        </View>
      </View>

      <View style={styles.valueRow}>
        <Text style={[styles.value, { color: colors.text }]}>
          {fmtDateFR(datePromulgation)}
        </Text>
        <View
          style={[
            styles.pill,
            {
              backgroundColor: "rgba(34,197,94,0.10)",
              borderColor: "rgba(34,197,94,0.22)",
            },
          ]}
        >
          <Text style={[styles.pillText, { color: colors.text }]}>JO</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  headRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 14,
    fontWeight: "900",
  },
  sub: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "700",
  },
  valueRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  value: {
    fontSize: 16,
    fontWeight: "900",
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
});
