import React, { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "@/lib/theme";
import { Card } from "@/components/ui/Card";

const colors = theme.colors;
const TEXT = colors.text || "#E5E7EB";
const SUBTEXT = colors.subtext || "rgba(229,231,235,0.72)";
const BORDER = (colors as any)?.border || "rgba(255,255,255,0.10)";

export type AmendementOutcome =
  | "adopte"
  | "rejete"
  | "retire"
  | "tombe"
  | "irrecevable"
  | "nonRenseigne";

export type AmendementBadgeTone = "success" | "warn" | "soft" | "mute";

export type AmendementHighlight = {
  id: string;
  title: string;
  subtitle?: string;

  outcome: AmendementOutcome;
  outcomeLabel: string;
  tone: AmendementBadgeTone;

  date?: string; // ISO
  articleRef?: string;
  authorLabel?: string;
  authorGroup?: string;
  contextLabel?: string;

  preview?: string;

  link?: {
    type: "amendement" | "scrutin";
    href: string;
  };

  score?: number;
  reasons?: string[];
};

type Props = {
  items: AmendementHighlight[];
  totalCount?: number | null;
  onPressItem?: (item: AmendementHighlight) => void;

  // optionnel : si tu veux un bouton "Voir plus"
  onPressMore?: () => void;
  limitLabel?: string; // ex "Voir tous les amendements"
};

function toneColors(tone: AmendementBadgeTone) {
  // couleurs “douces” (pas flashy)
  switch (tone) {
    case "success":
      return { bg: "rgba(34,197,94,0.18)", fg: "rgba(167,243,208,0.95)", bd: "rgba(34,197,94,0.35)" };
    case "warn":
      return { bg: "rgba(239,68,68,0.16)", fg: "rgba(254,202,202,0.95)", bd: "rgba(239,68,68,0.34)" };
    case "mute":
      return { bg: "rgba(148,163,184,0.12)", fg: "rgba(226,232,240,0.88)", bd: "rgba(148,163,184,0.22)" };
    default:
      return { bg: "rgba(255,255,255,0.08)", fg: "rgba(229,231,235,0.92)", bd: "rgba(255,255,255,0.14)" };
  }
}

function formatShortDate(iso?: string) {
  if (!iso) return undefined;
  // ISO date/time -> YYYY-MM-DD
  const d = iso.slice(0, 10);
  // rendu FR simple : JJ/MM
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return d;
  return `${day}/${m}`;
}

function MetaLine({
  left,
  right,
}: {
  left?: string;
  right?: string;
}) {
  if (!left && !right) return null;
  return (
    <View style={styles.metaRow}>
      {left ? <Text style={styles.metaText}>{left}</Text> : <View />}
      {right ? <Text style={styles.metaText}>{right}</Text> : null}
    </View>
  );
}

export const AmendementsHighlights = memo(function AmendementsHighlights({
  items,
  totalCount,
  onPressItem,
  onPressMore,
  limitLabel = "Voir tous les amendements",
}: Props) {
  if (!items || items.length === 0) return null;

  const headerRight =
    typeof totalCount === "number" && totalCount > items.length
      ? `${items.length}/${totalCount}`
      : undefined;

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.hTitle}>Amendements marquants</Text>
        {headerRight ? <Text style={styles.hCount}>{headerRight}</Text> : null}
      </View>

      <View style={styles.list}>
        {items.map((it) => {
          const tc = toneColors(it.tone);
          const date = formatShortDate(it.date);

          const leftMeta = [it.articleRef, it.contextLabel].filter(Boolean).join(" • ") || undefined;

          const rightMetaParts = [
            it.authorLabel,
            it.authorGroup ? `(${it.authorGroup})` : undefined,
          ].filter(Boolean);
          const rightMeta = rightMetaParts.length ? rightMetaParts.join(" ") : undefined;

          const pressable = !!onPressItem;

          return (
            <Pressable
              key={it.id}
              onPress={pressable ? () => onPressItem?.(it) : undefined}
              style={({ pressed }) => [styles.itemPress, pressed && pressable ? styles.pressed : null]}
            >
              <Card style={styles.card}>
                <View style={styles.topRow}>
                  <View style={styles.titles}>
                    <Text style={styles.title} numberOfLines={1}>
                      {it.title}
                    </Text>
                    {it.subtitle ? (
                      <Text style={styles.subtitle} numberOfLines={1}>
                        {it.subtitle}
                      </Text>
                    ) : null}
                  </View>

                  <View style={[styles.badge, { backgroundColor: tc.bg, borderColor: tc.bd }]}>
                    <Text style={[styles.badgeText, { color: tc.fg }]} numberOfLines={1}>
                      {it.outcomeLabel}
                    </Text>
                  </View>
                </View>

                <MetaLine left={leftMeta} right={date ? `${date}${rightMeta ? " • " : ""}${rightMeta ?? ""}` : rightMeta} />

                {it.preview ? (
                  <Text style={styles.preview} numberOfLines={3}>
                    {it.preview}
                  </Text>
                ) : null}

                {it.link?.href ? (
                  <View style={styles.ctaRow}>
                    <Text style={styles.ctaText}>
                      {it.link.type === "scrutin" ? "Voir le scrutin →" : "Voir le détail →"}
                    </Text>
                  </View>
                ) : null}
              </Card>
            </Pressable>
          );
        })}
      </View>

      {onPressMore ? (
        <Pressable onPress={onPressMore} style={({ pressed }) => [styles.moreBtn, pressed && styles.pressed]}>
          <Text style={styles.moreText}>{limitLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { marginTop: 14 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  hTitle: { color: TEXT, fontSize: 16, fontWeight: "800" },
  hCount: { color: SUBTEXT, fontSize: 12, fontWeight: "700" },

  list: { gap: 10 },

  itemPress: {},
  pressed: { opacity: 0.86 },

  card: {
    borderWidth: 1,
    borderColor: BORDER,
    padding: 12,
  },

  topRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  titles: { flex: 1, minWidth: 0 },
  title: { color: TEXT, fontSize: 14, fontWeight: "800" },
  subtitle: { color: SUBTEXT, fontSize: 12, marginTop: 3 },

  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: 120,
  },
  badgeText: { fontSize: 12, fontWeight: "800" },

  metaRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  metaText: { color: SUBTEXT, fontSize: 11, fontWeight: "600" },

  preview: { color: TEXT, fontSize: 12, lineHeight: 17, marginTop: 10, opacity: 0.92 },

  ctaRow: { marginTop: 10 },
  ctaText: { color: "rgba(229,231,235,0.85)", fontSize: 12, fontWeight: "800" },

  moreBtn: {
    marginTop: 10,
    alignSelf: "flex-start",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  moreText: { color: TEXT, fontSize: 12, fontWeight: "800" },
});
