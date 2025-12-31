// components/actu/ActuCard.tsx
import React, { memo, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { theme } from "@/lib/theme";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import type { ActuItemUI, Tone } from "./types";

const colors = theme.colors;

type StatusKey = "adopted" | "rejected" | "pending";

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
  if (lib === "mci") {
    return <MaterialCommunityIcons name={name as any} size={size} color={color} />;
  }
  return <Ionicons name={name as any} size={size} color={color} />;
}

function gradientForTone(tone: Tone) {
  switch (tone) {
    case "pink":
      return ["rgba(244,114,182,0.28)", "rgba(251,113,133,0.12)", "rgba(2,6,23,0.00)"] as const;
    case "mint":
      return ["rgba(52,211,153,0.24)", "rgba(34,197,94,0.10)", "rgba(2,6,23,0.00)"] as const;
    case "amber":
      return ["rgba(251,191,36,0.26)", "rgba(250,204,21,0.10)", "rgba(2,6,23,0.00)"] as const;
    case "violet":
      return ["rgba(167,139,250,0.28)", "rgba(99,102,241,0.14)", "rgba(2,6,23,0.00)"] as const;
    case "blue":
    default:
      return ["rgba(59,130,246,0.26)", "rgba(14,165,233,0.10)", "rgba(2,6,23,0.00)"] as const;
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
    return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
  } catch {
    return d;
  }
}

function StatusBadge({ status, disabled }: { status: StatusKey; disabled?: boolean }) {
  const s = String(status ?? "pending") as StatusKey;

  const cfg =
    s === "adopted"
      ? {
          label: "Adopté",
          fg: "rgba(22,163,74,0.98)",
          bg: "rgba(22,163,74,0.14)",
          border: "rgba(22,163,74,0.22)",
          icon: "checkmark-circle-outline" as const,
        }
      : s === "rejected"
      ? {
          label: "Rejeté",
          fg: "rgba(220,38,38,0.98)",
          bg: "rgba(220,38,38,0.14)",
          border: "rgba(220,38,38,0.22)",
          icon: "close-circle-outline" as const,
        }
      : {
          label: "En cours",
          fg: "rgba(217,119,6,0.98)",
          bg: "rgba(217,119,6,0.14)",
          border: "rgba(217,119,6,0.22)",
          icon: "time-outline" as const,
        };

  return (
    <View
      style={[
        styles.statusPill,
        {
          backgroundColor: cfg.bg,
          borderColor: cfg.border,
          opacity: disabled ? 0.65 : 1,
        },
      ]}
    >
      <Ionicons name={cfg.icon} size={13} color={cfg.fg} />
      <Text style={[styles.statusText, { color: cfg.fg }]} numberOfLines={1}>
        {cfg.label}
      </Text>
    </View>
  );
}

export const ActuCard = memo(function ActuCard({
  item,
  onPress,
  cta,
  disabled = false,
}: {
  item: ActuItemUI;
  onPress: () => void;
  cta: string;
  disabled?: boolean;
}) {
  const grad = gradientForTone(item.tone);
  const accent = accentForTone(item.tone);

  // ✅ badge "+N" = total réel - preview (et fallback sur logique simple si preview absent)
  const extraCount = useMemo(() => {
    const total = Number((item as any).groupCount ?? 0);
    const preview = Number((item as any).previewCount ?? 0);

    if (total > 0 && preview > 0) {
      return Math.max(0, total - preview);
    }

    // fallback: ancien comportement (+N = groupCount-1)
    const n = Number((item as any).groupCount ?? 0);
    return n > 1 ? n - 1 : 0;
  }, [(item as any).groupCount, (item as any).previewCount]);

  const many = extraCount > 0;

  const statusKey = String((item as any).statusKey ?? "") as StatusKey;
  const showStatus = statusKey === "adopted" || statusKey === "rejected" || statusKey === "pending";

  return (
    <Pressable
      disabled={disabled}
      style={({ pressed }) => [
        styles.card,
        pressed && !disabled && { opacity: 0.96 },
        disabled && styles.cardDisabled,
      ]}
      onPress={() => {
        if (disabled) return;
        onPress();
      }}
      android_ripple={disabled ? undefined : { color: "rgba(255,255,255,0.06)" }}
    >
      <LinearGradient
        colors={grad as any}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <View style={[styles.accentBar, { backgroundColor: accent, opacity: disabled ? 0.35 : 0.75 }]} />

      <View style={styles.headerRow}>
        <View style={styles.leftRow}>
          <View style={[styles.iconChip, { borderColor: accent, opacity: disabled ? 0.6 : 1 }]}>
            <Icon lib={(item as any).iconLib} name={(item as any).iconName} size={18} color={accent} />
          </View>

          <View style={styles.pillsRow}>
            {!!(item as any).tag && (
              <View style={styles.pill}>
                <Text style={styles.pillText} numberOfLines={1}>
                  {(item as any).tag}
                </Text>
              </View>
            )}

            {many && (
              <View style={styles.pillMuted}>
                <Text style={styles.pillText} numberOfLines={1}>
                  +{extraCount}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.datePill}>
          <Text style={styles.dateText}>{fmtDateFR((item as any).dateISO)}</Text>
        </View>
      </View>

      <Text style={[styles.title, disabled && { opacity: 0.7 }]} numberOfLines={2}>
        {(item as any).title}
      </Text>

      {/* ✅ "Type d'événement" */}
      <Text style={[styles.subtitle, disabled && { opacity: 0.7 }]} numberOfLines={2}>
        {(item as any).subtitle}
      </Text>

      {/* ✅ Nouveau: statut de l'événement (après le type) */}
      {showStatus && <StatusBadge status={statusKey || "pending"} disabled={disabled} />}

      {!!(item as any).why && (
        <Text style={[styles.why, disabled && { opacity: 0.65 }]} numberOfLines={2}>
          {(item as any).why}
        </Text>
      )}

      <View style={styles.bottomRow}>
        <Text style={[styles.cta, disabled && { opacity: 0.55 }]} numberOfLines={1}>
          {cta}
        </Text>
        <View style={[styles.ctaBtn, disabled && { opacity: 0.55 }]}>
          <Text style={styles.ctaArrow}>→</Text>
        </View>
      </View>
    </Pressable>
  );
});

// ✅ export default pour éviter les emmerdes d’import
export default ActuCard;

const styles = StyleSheet.create({
  card: {
    position: "relative",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    overflow: "hidden",
    backgroundColor: colors.card,
    padding: 12,
    gap: 8,
  },
  cardDisabled: {
    borderColor: "rgba(255,255,255,0.08)",
  },

  accentBar: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4 },

  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  leftRow: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 },

  iconChip: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },

  pillsRow: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1, minWidth: 0 },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    maxWidth: "100%",
  },
  pillMuted: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  pillText: { color: colors.text, fontSize: 12, fontWeight: "900" },

  datePill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  dateText: { color: colors.subtext, fontSize: 12, fontWeight: "800" },

  title: { color: colors.text, fontSize: 15, fontWeight: "900", lineHeight: 20 },
  subtitle: { color: colors.subtext, fontSize: 12, lineHeight: 17, fontWeight: "700" },
  why: { marginTop: -2, color: "rgba(255,255,255,0.78)", fontSize: 12, lineHeight: 16, fontWeight: "800" },

  // ✅ NEW: status badge
  statusPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    marginTop: -2,
  },
  statusText: { fontSize: 12, fontWeight: "900" },

  bottomRow: { marginTop: 2, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  cta: { color: colors.text, fontSize: 12, fontWeight: "900", flex: 1, minWidth: 0 },

  ctaBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  ctaArrow: { color: colors.text, fontSize: 16, fontWeight: "900" },
});
