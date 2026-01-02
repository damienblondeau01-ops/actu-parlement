import React from "react";
import { StyleSheet, View, ViewStyle } from "react-native";
import { theme } from "@/lib/theme";

type Props = {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
};

export default function ImportantCard({ children, style }: Props) {
  const p = (theme as any)?.paper ?? {};

  return (
    <View style={[styles.card, style]}>
      {/* voile léger (contraste premium) */}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          { backgroundColor: p.accentWash ?? "rgba(79,70,229,0.10)" },
        ]}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.paper.card,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.paper.line,
    overflow: "hidden",

    // iOS
    shadowColor: (theme as any)?.paper?.shadow ?? "rgba(18,20,23,0.10)",
    shadowOpacity: 1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },

    // Android
    elevation: 3,
  },
});
