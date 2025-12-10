// lib/parlement-common.tsx

import React from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { View, Text, StyleSheet } from "react-native";
import { theme } from "./theme";

type ScreenContainerProps = {
  children: React.ReactNode;
};

export function ScreenContainer({ children }: ScreenContainerProps) {
  return (
    <SafeAreaView
      // 👇 IMPORTANT : pas de "bottom" ici
      edges={["top", "left", "right"]}
      style={styles.safeArea}
    >
      <View style={styles.inner}>{children}</View>
    </SafeAreaView>
  );
}

type SectionTitleProps = {
  children: React.ReactNode;
};

export function SectionTitle({ children }: SectionTitleProps) {
  return (
    <Text style={styles.sectionTitle} numberOfLines={2}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  inner: {
    flex: 1,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    backgroundColor: theme.colors.background,
  },
  sectionTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: "800",
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
});
