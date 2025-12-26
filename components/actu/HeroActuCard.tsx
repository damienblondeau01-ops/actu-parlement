// components/actu/HeroActuCard.tsx
import React, { memo, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { theme } from "@/lib/theme";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import type { ActuItemUI, Tone } from "./types";

const colors = theme.colors;

function Icon({
  lib,
  name,
  size = 18,
  color = colors.text,
}: {
  lib: "ion" | "mci";
  name: string;
  size?: number;
  color?: string;
}) {
  if (lib === "mci") return <MaterialCommunityIcons name={name as any} size={size} color={color} />;
  return <Ionicons name={name as any} size={size} color={color} />;
}

function gradientForTone(tone: Tone) {
  switch (tone) {
    case "pink":
      return ["rgba(244,114,182,0.32)", "rgba(251,113,133,0.16)", "rgba(2,6,23,0.00)"] as const;
    case "mint":
      return ["rgba(52,211,153,0.28)", "rgba(34,197,94,0.12)", "rgba(2,6,23,0.00)"] as const;
    case "amber":
      return ["rgba(251,191,36,0.30)", "rgba(250,204,21,0.14)", "rgba(2,6,23,0.00)"] as const;
    case "violet":
      return ["rgba(167,139,250,0.32)", "rgba(99,102,241,0.18)", "rgba(2,6,23,0.00)"] as const;
    case "blue":
    default:
      return ["rgba(59,130,246,0.30)", "rgba(14,165,233,0.14)", "rgba(2,6,23,0.00)"] as const;
  }
}

function accentForTone(tone: Tone) {
  switch (tone) {
    case "pink":
      return "rgba(244,114,182,0.95)";
    case "mint":
      return "rgba(52,211,153,0.95)";
    case "amber":
      return "rgba(251,191,36,0.98)";
    case "violet":
      return "rgba(167,139,250,0.95)";
    case "blue":
    default:
      return "rgba(59,130,246,0.95)";
  }
}

function fmtDateFR(d: string) {
  try {
    return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return d;
  }
}

export const HeroActuCard = memo(function HeroActuCard({
  item,
  onPress,
  cta,
  label = "À LA UNE",
  disabled = false,
}: {
  item: ActuItemUI;
  onPress: () => void;
  cta: string;
  label?: string;
  disabled?: boolean;
}) {
  const grad = gradientForTone(item.tone);
  const accent = accentForTone(item.tone);

  const [expanded, setExpanded] = useState(false);

  // ✅ 2 bullets max : lisible
  const highlights = useMemo(() => (item.highlights ?? []).slice(0, 2), [item.highlights]);

  const long = String(item.longTitle ?? "").trim();
  const canExpand = long.length >= 80;

  return (
    <View style={{ gap: 8 }}>
      <Text style={[styles.heroLabel, disabled && { opacity: 0.65 }]}>{label}</Text>

      <Pressable
        disabled={disabled}
        onPress={() => {
          if (disabled) return;
          onPress();
        }}
        style={({ pressed }) => [styles.heroWrap, pressed && !disabled && { opacity: 0.95 }, disabled && styles.heroDisabled]}
        android_ripple={disabled ? undefined : { color: "rgba(255,255,255,0.06)" }}
      >
        <LinearGradient colors={grad as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
        <View style={[styles.heroGlow, { shadowColor: accent, opacity: disabled ? 0.35 : 1 }]} />

        <View style={styles.heroTopRow}>
          <View style={[styles.heroIconChip, { borderColor: accent, opacity: disabled ? 0.65 : 1 }]}>
            <Icon lib={item.iconLib} name={item.iconName} size={18} color={accent} />
          </View>

          <View style={styles.heroMetaRow}>
            {!!item.tag && (
              <View style={styles.heroTagPill}>
                <Text style={styles.heroTagText} numberOfLines={1} ellipsizeMode="clip">
                  {item.tag}
                </Text>
              </View>
            )}

            <View style={styles.heroDatePill}>
              <Text style={styles.heroDateText} numberOfLines={1} ellipsizeMode="clip">
                {fmtDateFR(item.dateISO)}
              </Text>
            </View>
          </View>
        </View>

        <Text style={[styles.heroTitle, disabled && { opacity: 0.75 }]} numberOfLines={2} ellipsizeMode="tail">
          {item.title}
        </Text>

        {!!item.statsLine && (
          <Text style={[styles.statsLine, disabled && { opacity: 0.7 }]} numberOfLines={1} ellipsizeMode="tail">
            {item.statsLine}
          </Text>
        )}

        {!!item.subtitle && (
          <Text style={[styles.heroSubtitle, disabled && { opacity: 0.7 }]} numberOfLines={1} ellipsizeMode="tail">
            {item.subtitle}
          </Text>
        )}

        {!!highlights.length && (
          <View style={styles.hlWrap}>
            {highlights.map((t, idx) => (
              <View key={`${idx}-${t}`} style={styles.hlRow}>
                <View style={[styles.hlDot, { backgroundColor: accent }]} />
                <Text style={[styles.hlText, disabled && { opacity: 0.75 }]} numberOfLines={1} ellipsizeMode="tail">
                  {t}
                </Text>
              </View>
            ))}
          </View>
        )}

        {canExpand && (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              if (disabled) return;
              setExpanded((v) => !v);
            }}
            style={({ pressed }) => [styles.longWrap, pressed && !disabled && { opacity: 0.95 }]}
          >
            <View style={styles.longHeader}>
              <Text style={styles.longLabel}>{expanded ? "Titre officiel" : "Titre officiel (voir)"}</Text>
              <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={16} color={colors.subtext} />
            </View>

            <Text style={styles.longText} numberOfLines={expanded ? 20 : 2} ellipsizeMode="tail">
              {long}
            </Text>
          </Pressable>
        )}

        <View style={styles.heroBottomRow}>
          <View style={[styles.accentDot, { backgroundColor: accent, opacity: disabled ? 0.55 : 1 }]} />
          <Text style={[styles.heroCta, disabled && { opacity: 0.6 }]} numberOfLines={1} ellipsizeMode="tail">
            {cta}
          </Text>
          <Text style={[styles.heroArrow, disabled && { opacity: 0.6 }]}>→</Text>
        </View>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  heroLabel: { color: colors.subtext, fontSize: 12, fontWeight: "900", letterSpacing: 1.2 },

  heroWrap: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
    backgroundColor: colors.card,
    padding: 14,
  },
  heroDisabled: {
    borderColor: "rgba(255,255,255,0.08)",
  },

  heroGlow: {
    position: "absolute",
    top: -10,
    right: -20,
    width: 140,
    height: 140,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    shadowOpacity: 0.55,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },

  heroTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },

  heroIconChip: {
    width: 38,
    height: 38,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },

  heroMetaRow: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 },

  heroTagPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    maxWidth: 160,
  },
  heroTagText: { color: colors.text, fontSize: 12, fontWeight: "900" },

  heroDatePill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    flexShrink: 0,
  },
  heroDateText: { color: colors.subtext, fontSize: 12, fontWeight: "800" },

  heroTitle: { marginTop: 12, color: colors.text, fontSize: 17, fontWeight: "900", lineHeight: 22 },

  statsLine: { marginTop: 8, color: "rgba(255,255,255,0.90)", fontSize: 12, fontWeight: "900" },

  heroSubtitle: { marginTop: 6, color: colors.subtext, fontSize: 12, fontWeight: "800" },

  hlWrap: { marginTop: 10, gap: 6 },
  hlRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  hlDot: { width: 7, height: 7, borderRadius: 99, opacity: 0.9 },
  hlText: { color: colors.subtext, fontSize: 12, fontWeight: "800", flex: 1, minWidth: 0 },

  longWrap: {
    marginTop: 12,
    padding: 10,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    gap: 6,
  },
  longHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  longLabel: { color: colors.subtext, fontSize: 11, fontWeight: "900", letterSpacing: 0.6 },
  longText: { color: "rgba(255,255,255,0.86)", fontSize: 12, lineHeight: 16, fontWeight: "800" },

  heroBottomRow: { marginTop: 14, flexDirection: "row", alignItems: "center", gap: 8 },
  accentDot: { width: 8, height: 8, borderRadius: 99 },

  heroCta: { color: colors.text, fontSize: 13, fontWeight: "900", flex: 1, minWidth: 0 },
  heroArrow: { color: colors.text, fontSize: 16, fontWeight: "900" },
});
