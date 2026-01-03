import React, { useMemo } from "react";
import { View, Text, StyleSheet, Pressable, Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/lib/theme";
import { Card } from "@/components/ui/Card";
import type { LoiProcedureStepRow } from "@/lib/queries/lois";

type Props = {
  steps: LoiProcedureStepRow[];
};

type Block = {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  items: LoiProcedureStepRow[];
};

function fmtDate(d?: string | null) {
  if (!d) return "";
  // d est ISO date YYYY-MM-DD
  return d;
}

function isJO(s: LoiProcedureStepRow) {
  return String(s.step_kind || "").toUpperCase() === "JO";
}
function isPROM(s: LoiProcedureStepRow) {
  return String(s.step_kind || "").toUpperCase() === "PROMULGATION";
}
function isCMP(s: LoiProcedureStepRow) {
  return String(s.step_kind || "").toUpperCase() === "CMP";
}

function inferChamber(s: LoiProcedureStepRow) {
  const ch = String((s as any)?.chamber ?? "").toUpperCase().trim();
  if (ch === "AN" || ch === "SENAT") return ch;

  const label = String(s.label ?? "").toLowerCase();
  if (label.includes("sénat")) return "SENAT";
  if (label.includes("assembl")) return "AN";

  return null;
}

function groupIntoBlocks(steps: LoiProcedureStepRow[]): Block[] {
  const an: LoiProcedureStepRow[] = [];
  const senat: LoiProcedureStepRow[] = [];
  const cmp: LoiProcedureStepRow[] = [];
  const prom: LoiProcedureStepRow[] = [];
  const jo: LoiProcedureStepRow[] = [];
  const other: LoiProcedureStepRow[] = [];

  for (const s of steps) {
    if (isJO(s)) jo.push(s);
    else if (isPROM(s)) prom.push(s);
    else if (isCMP(s)) cmp.push(s);
    else {
      const ch = inferChamber(s);
      if (ch === "AN") an.push(s);
      else if (ch === "SENAT") senat.push(s);
      else other.push(s);
    }
  }

  const blocks: Block[] = [];
  if (an.length) blocks.push({ title: "Assemblée nationale", icon: "business", items: an });
  if (senat.length) blocks.push({ title: "Sénat", icon: "business-outline", items: senat });
  if (cmp.length) blocks.push({ title: "Commission mixte paritaire", icon: "people", items: cmp });
  if (prom.length) blocks.push({ title: "Promulgation", icon: "ribbon", items: prom });
  if (jo.length) blocks.push({ title: "Journal officiel", icon: "newspaper", items: jo });
  if (other.length) blocks.push({ title: "Autres étapes", icon: "list", items: other });

  return blocks;
}

export default function ProcedureTimeline({ steps }: Props) {
  const colors = theme.colors as any;

  const blocks = useMemo(() => groupIntoBlocks(steps ?? []), [steps]);

  if (!steps || steps.length === 0) {
    return (
      <Card style={styles.card}>
        <Text style={[styles.title, { color: colors.text }]}>Procédure</Text>
        <Text style={[styles.muted, { color: colors.muted }]}>
          Aucune étape disponible pour ce dossier.
        </Text>
      </Card>
    );
  }

  return (
    <Card style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: colors.text }]}>Procédure</Text>
        <View style={styles.badge}>
          <Ionicons name="git-branch" size={14} color={colors.text} />
          <Text style={[styles.badgeText, { color: colors.text }]}>
            {steps.length} étapes
          </Text>
        </View>
      </View>

      <View style={styles.blocksWrap}>
        {blocks.map((b, idx) => (
          <View key={`block-${idx}`} style={styles.block}>
            <View style={styles.blockTitleRow}>
              <Ionicons name={b.icon} size={16} color={colors.text} />
              <Text style={[styles.blockTitle, { color: colors.text }]}>
                {b.title}
              </Text>
            </View>

            <View style={styles.itemsWrap}>
              {b.items.map((s, j) => {
                const date = fmtDate(s.date_start);
                const label = (s.label || s.step_kind || "Étape").trim();
                const url = s.source_url || null;

                return (
                  <View key={`it-${idx}-${j}`} style={styles.itemRow}>
                    <View style={styles.leftRail}>
                      <View style={[styles.dot, { borderColor: colors.text }]} />
                      {j < b.items.length - 1 ? (
                        <View style={[styles.line, { backgroundColor: colors.border ?? "rgba(255,255,255,0.12)" }]} />
                      ) : null}
                    </View>

                    <View style={styles.itemContent}>
                      <Text style={[styles.itemTop, { color: colors.muted }]}>
                        {date ? date : "Date inconnue"}
                      </Text>

                      <View style={styles.itemMainRow}>
                        <Text style={[styles.itemLabel, { color: colors.text }]}>
                          {label}
                        </Text>

                        {url ? (
                          <Pressable
                            onPress={() => Linking.openURL(url)}
                            style={styles.linkBtn}
                            hitSlop={8}
                          >
                            <Ionicons name="open-outline" size={16} color={colors.text} />
                          </Pressable>
                        ) : null}
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 12, padding: 14 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 16, fontWeight: "800" },

  muted: {
  fontSize: 12,
  opacity: 0.7,
},

  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  badgeText: { fontSize: 12, fontWeight: "700" },

  blocksWrap: { marginTop: 12, gap: 14 },

  block: {
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  blockTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  blockTitle: { fontSize: 14, fontWeight: "800" },

  itemsWrap: { gap: 10 },

  itemRow: { flexDirection: "row", gap: 10 },
  leftRail: { width: 14, alignItems: "center" },
  dot: { width: 10, height: 10, borderRadius: 99, borderWidth: 2, marginTop: 2 },
  line: { width: 2, flex: 1, marginTop: 2, borderRadius: 2 },

  itemContent: { flex: 1 },
  itemTop: { fontSize: 12, fontWeight: "700", marginBottom: 2 },
  itemMainRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  itemLabel: { fontSize: 13, fontWeight: "700", flex: 1 },

  linkBtn: {
    padding: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
});
