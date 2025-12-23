import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { theme } from "@/lib/theme";

type VoteKey = "pour" | "contre" | "abstention" | "nv";

export default function VoteBadge({
  value,
}: {
  value: VoteKey;
}) {
  const cfg = getVoteStyle(value);

  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.text, { color: cfg.text }]}>
        {cfg.label}
      </Text>
    </View>
  );
}

function getVoteStyle(v: VoteKey) {
  switch (v) {
    case "pour":
      return { label: "Pour", bg: "#16a34a", text: "#ffffff" };
    case "contre":
      return { label: "Contre", bg: "#dc2626", text: "#ffffff" };
    case "abstention":
      return { label: "Abstention", bg: "#eab308", text: "#0f172a" };
    default:
      return { label: "Non votant", bg: "#64748b", text: "#0f172a" };
  }
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  text: {
    fontSize: 11,
    fontWeight: "700",
  },
});
