import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { theme } from "@lib/theme";

export type DataScope = "ANALYTICS_L16" | "RECENT_L17" | "MIXED";

type Props = {
  scope: DataScope;
  size?: "sm" | "md";
  style?: any;
};

function getBadge(scope: DataScope) {
  switch (scope) {
    case "ANALYTICS_L16":
      return {
        label: "Analyse — 16ᵉ législature",
        sub: "Scores & tendances",
        tone: "info" as const,
      };
    case "RECENT_L17":
      return {
        label: "Actualité — 17ᵉ législature",
        sub: "Votes récents",
        tone: "ok" as const,
      };
    case "MIXED":
    default:
      return {
        label: "Mixte — 16ᵉ + 17ᵉ",
        sub: "Analyse + actualité",
        tone: "warn" as const,
      };
  }
}

export default function DataScopeBadge({ scope, size = "md", style }: Props) {
  const b = getBadge(scope);

  const sizeStyles = size === "sm" ? stylesSm : stylesMd;

  return (
    <View style={[styles.wrap, styles[`tone_${b.tone}`], sizeStyles.wrap, style]}>
      <View style={[styles.dot, styles[`dot_${b.tone}`], sizeStyles.dot]} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.label, sizeStyles.label]} numberOfLines={1}>
          {b.label}
        </Text>
        <Text style={[styles.sub, sizeStyles.sub]} numberOfLines={1}>
          {b.sub}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
  },
  label: {
    color: theme.colors.text,
    fontWeight: "900",
    letterSpacing: 0.1,
  },
  sub: {
    marginTop: 1,
    color: theme.colors.subtext,
    fontWeight: "700",
    opacity: 0.9,
  },
  dot: {
    borderRadius: 999,
  },

  // tones
  tone_ok: {
    backgroundColor: "rgba(34,197,94,0.10)",
    borderColor: "rgba(34,197,94,0.22)",
  },
  tone_warn: {
    backgroundColor: "rgba(234,179,8,0.10)",
    borderColor: "rgba(234,179,8,0.24)",
  },
  tone_info: {
    backgroundColor: "rgba(148,163,184,0.10)",
    borderColor: "rgba(148,163,184,0.20)",
  },

  dot_ok: { backgroundColor: "rgba(34,197,94,0.85)" },
  dot_warn: { backgroundColor: "rgba(234,179,8,0.85)" },
  dot_info: { backgroundColor: "rgba(148,163,184,0.85)" },
});

const stylesMd = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingVertical: 8 },
  dot: { width: 10, height: 10 },
  label: { fontSize: 12 },
  sub: { fontSize: 11 },
});

const stylesSm = StyleSheet.create({
  wrap: { paddingHorizontal: 10, paddingVertical: 7 },
  dot: { width: 9, height: 9 },
  label: { fontSize: 11 },
  sub: { fontSize: 10 },
});
