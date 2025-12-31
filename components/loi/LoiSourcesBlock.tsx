import React from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/lib/theme";

import type { LoiSourceItem } from "@/lib/queries/lois";

type Props = {
  sources: LoiSourceItem[];
};

export default function LoiSourcesBlock({ sources }: Props) {
  const colors = theme.colors as any;

  if (!sources || sources.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={[styles.emptyTitle, { color: colors.text }]}>
          Aucune source disponible
        </Text>
        <Text
          style={[
            styles.emptySub,
            { color: colors.muted ?? "rgba(255,255,255,0.65)" },
          ]}
        >
          Les liens officiels apparaîtront ici dès qu’ils sont disponibles en
          base.
        </Text>
      </View>
    );
  }

  const openSource = async (rawUrl: string) => {
    const u = String(rawUrl ?? "").trim();
    if (!u) return;

    // ✅ 1) Autoriser uniquement les URLs web (évite que "/lois/.." ouvre en interne)
    let url = u;

    // tolérance : "www.xxx" -> https://www.xxx
    if (/^www\./i.test(url)) url = `https://${url}`;

    const isWeb = /^https?:\/\//i.test(url);
    if (!isWeb) {
      console.log("[LoiSourcesBlock] URL non-web ignorée:", u);
      return;
    }

    try {
      const can = await Linking.canOpenURL(url);
      if (!can) {
        console.log("[LoiSourcesBlock] cannot open:", url);
        return;
      }
      await Linking.openURL(url);
    } catch (e) {
      console.log("[LoiSourcesBlock] openURL error:", (e as any)?.message ?? e);
    }
  };

  return (
    <View style={styles.wrap}>
      {sources.map((s, idx) => (
        <Pressable
          key={`${s.kind}-${idx}-${s.url}`}
          onPress={() => openSource(s.url)}
          style={({ pressed }) => [
            styles.row,
            {
              borderColor: colors.border ?? "rgba(255,255,255,0.10)",
              backgroundColor: pressed
                ? (colors.cardAlt ?? "rgba(255,255,255,0.06)")
                : (colors.card ?? "rgba(255,255,255,0.03)"),
            },
          ]}
        >
          <View style={styles.rowLeft}>
            <View
              style={[
                styles.badge,
                { backgroundColor: colors.cardAlt ?? "rgba(255,255,255,0.06)" },
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  { color: colors.muted ?? "rgba(255,255,255,0.7)" },
                ]}
              >
                {prettyKind(s.kind)}
              </Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text
                style={[styles.label, { color: colors.text }]}
                numberOfLines={2}
              >
                {s.label}
              </Text>
              <Text
                style={[
                  styles.url,
                  { color: colors.muted ?? "rgba(255,255,255,0.65)" },
                ]}
                numberOfLines={1}
              >
                {stripUrl(s.url)}
              </Text>
            </View>
          </View>

          <Ionicons
            name="open-outline"
            size={18}
            color={colors.muted ?? "rgba(255,255,255,0.65)"}
          />
        </Pressable>
      ))}
    </View>
  );
}

function prettyKind(kind: string) {
  const k = String(kind || "").toLowerCase();
  if (k.includes("dossier")) return "Dossier";
  if (k.includes("texte")) return "Texte";
  if (k.includes("senat")) return "Sénat";
  if (k.includes("jo")) return "JO";
  if (k.includes("an")) return "AN";
  return "Source";
}

function stripUrl(url: string) {
  const u = String(url ?? "").trim();
  if (!u) return "";

  // si ce n'est pas une URL web, on l'affiche telle quelle (mais on ne l'ouvre pas)
  if (!/^https?:\/\//i.test(u) && !/^www\./i.test(u)) return u;

  try {
    const normalized = /^www\./i.test(u) ? `https://${u}` : u;
    const parsed = new URL(normalized);
    return `${parsed.hostname}${parsed.pathname}`.replace(/\/$/, "");
  } catch {
    return u;
  }
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  row: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  badgeText: { fontSize: 12, fontWeight: "600" },
  label: { fontSize: 15, fontWeight: "700" },
  url: { marginTop: 2, fontSize: 12 },
  emptyWrap: {
    paddingVertical: 18,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  emptyTitle: { fontSize: 15, fontWeight: "800" },
  emptySub: { marginTop: 6, fontSize: 13, lineHeight: 18 },
});
