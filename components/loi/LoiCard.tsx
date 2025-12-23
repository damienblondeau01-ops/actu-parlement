import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Card } from "../ui/Card";
import { theme } from "../../lib/theme";

type Props = {
  title: string;
  status: "ADOPTEE" | "EN_COURS" | "REJETEE";
  dateLabel?: string | null;
  stats: {
    articles?: number;
    amendements?: number;
    scrutins?: number;
  };
  onPress: () => void;
};

const STATUS = {
  ADOPTEE: { label: "Loi adoptée", color: "#22c55e" },
  EN_COURS: { label: "En cours d’examen", color: "#facc15" },
  REJETEE: { label: "Loi rejetée", color: "#ef4444" },
};

export function LoiCard({ title, status, dateLabel, stats, onPress }: Props) {
  const s = STATUS[status];

  return (
    <Pressable onPress={onPress}>
      <Card style={styles.card}>
        {/* Statut */}
        <View style={[styles.badge, { borderColor: s.color }]}>
          <Text style={[styles.badgeText, { color: s.color }]}>
            {s.label}
          </Text>
        </View>

        {/* Titre */}
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>

        {/* Date */}
        <Text style={styles.meta}>
          {dateLabel ?? "Date non disponible"}
        </Text>

        {/* Stats */}
        <View style={styles.statsRow}>
          <Text style={styles.stat}>🧾 {stats.articles ?? "—"} articles</Text>
          <Text style={styles.stat}>✍️ {stats.amendements ?? "—"} amend.</Text>
          <Text style={styles.stat}>🗳️ {stats.scrutins ?? "—"} scrutins</Text>
        </View>

        {/* CTA */}
        <Text style={styles.cta}>→ Comprendre la loi</Text>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    gap: 10,
  },
  badge: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "900",
  },
  title: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 22,
  },
  meta: {
    color: theme.colors.subtext,
    fontSize: 12,
    fontWeight: "700",
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 6,
  },
  stat: {
    color: theme.colors.subtext,
    fontSize: 12,
    fontWeight: "800",
  },
  cta: {
    marginTop: 8,
    color: theme.colors.primary,
    fontSize: 13,
    fontWeight: "900",
  },
});
