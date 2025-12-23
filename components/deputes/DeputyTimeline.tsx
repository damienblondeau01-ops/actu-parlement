import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "../../lib/theme";

const colors = theme.colors;

export type TimelineItem = {
  id: string; // ex: numero_scrutin
  date?: string | null;
  title: string;
  subtitle?: string | null; // ex: resultat
  badge?: string | null; // ex: "Scrutin"
  tone?: "good" | "bad" | "neutral";
};

function fmtDateFR(d?: string | null) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
}

function toneStyle(t?: TimelineItem["tone"]) {
  if (t === "good") return { bg: "rgba(34,197,94,0.12)", bd: "rgba(34,197,94,0.30)", tx: "#86efac" };
  if (t === "bad") return { bg: "rgba(239,68,68,0.12)", bd: "rgba(239,68,68,0.30)", tx: "#fca5a5" };
  return { bg: "rgba(148,163,184,0.10)", bd: "rgba(148,163,184,0.22)", tx: "rgba(226,232,240,0.9)" };
}

export function DeputyTimeline({
  items,
  onPressItem,
  title = "Timeline",
  hint = "Les étapes clés, dans l’ordre.",
}: {
  items: TimelineItem[];
  onPressItem?: (item: TimelineItem) => void;
  title?: string;
  hint?: string;
}) {
  const safeItems = useMemo(() => (Array.isArray(items) ? items : []), [items]);
  
  return (
    <View style={styles.card}>
      <View style={styles.headRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.hTitle}>{title}</Text>
          <Text style={styles.hHint} numberOfLines={1}>{hint}</Text>
        </View>

        <View style={styles.countPill}>
          <Text style={styles.countText}>{safeItems.length}</Text>
        </View>
      </View>

      <View style={styles.timeline}>
        {/* rail */}
        <View style={styles.rail} />

        <View style={styles.list}>
          {safeItems.map((it, idx) => {
            const isFirst = idx === 0;
            const isLast = idx === safeItems.length - 1;
            const ts = toneStyle(it.tone);

            return (
              <Pressable
                key={it.id}
                onPress={() => onPressItem?.(it)}
                style={({ pressed }) => [
                  styles.row,
                  pressed && styles.rowPressed,
                ]}
              >
                {/* node */}
                <View style={styles.nodeCol}>
                  <View style={[styles.nodeOuter, { borderColor: ts.bd, backgroundColor: ts.bg }]}>
                    <View style={[styles.nodeInner, { backgroundColor: ts.tx }]} />
                  </View>
                  {!isLast && <View style={styles.nodeStem} />}
                </View>

                {/* content */}
                <View style={styles.content}>
                  <View style={styles.topLine}>
                    <View style={[styles.badge, { backgroundColor: ts.bg, borderColor: ts.bd }]}>
                      <Text style={[styles.badgeText, { color: ts.tx }]}>
                        {it.badge ?? "Étape"}
                      </Text>
                    </View>

                    <Text style={styles.dateText}>{fmtDateFR(it.date)}</Text>
                  </View>

                  <Text style={styles.title} numberOfLines={2}>
                    {it.title}
                  </Text>

                  {!!it.subtitle && (
                    <Text style={styles.sub} numberOfLines={2}>
                      {it.subtitle}
                    </Text>
                  )}

                  <View style={styles.metaRow}>
                    <Text style={styles.metaLeft}>
                      {isFirst ? "• Dernier évènement" : isLast ? "• Début" : "•"}
                    </Text>
                    <Text style={styles.metaRight}>Tap pour ouvrir →</Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 8,
    borderRadius: 20,
    padding: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },

  headRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  hTitle: { color: colors.text, fontSize: 15, fontWeight: "900" },
  hHint: { marginTop: 3, color: colors.subtext, fontSize: 12, fontWeight: "700" },

  countPill: {
    minWidth: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  countText: { color: colors.text, fontWeight: "900" },

  timeline: { marginTop: 10, position: "relative" },
  rail: {
    position: "absolute",
    left: 18,
    top: 6,
    bottom: 6,
    width: 2,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  list: { gap: 10 },

  row: {
    flexDirection: "row",
    gap: 12,
    padding: 10,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  rowPressed: { opacity: 0.92 },

  nodeCol: { width: 36, alignItems: "center" },
  nodeOuter: {
    width: 18,
    height: 18,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  nodeInner: { width: 7, height: 7, borderRadius: 999, opacity: 0.9 },
  nodeStem: { flex: 1, width: 2, marginTop: 6, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.10)" },

  content: { flex: 1 },
  topLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeText: { fontSize: 11, fontWeight: "900" },
  dateText: { color: colors.subtext, fontSize: 12, fontWeight: "800" },

  title: { marginTop: 8, color: colors.text, fontSize: 14, fontWeight: "900", lineHeight: 19 },
  sub: { marginTop: 6, color: colors.subtext, fontSize: 12, fontWeight: "700", lineHeight: 17 },

  metaRow: { marginTop: 8, flexDirection: "row", justifyContent: "space-between", gap: 10 },
  metaLeft: { color: colors.subtext, fontSize: 11, fontWeight: "800" },
  metaRight: { color: colors.subtext, fontSize: 11, fontWeight: "800" },
});
