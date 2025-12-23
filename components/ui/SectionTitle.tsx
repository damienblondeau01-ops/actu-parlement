import React from "react";
import { Text, StyleSheet, TextProps } from "react-native";
import { theme } from "../../lib/theme";

export function SectionTitle({ style, ...props }: TextProps) {
  return <Text {...props} style={[styles.title, style]} />;
}

const styles = StyleSheet.create({
  title: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.2,
    marginBottom: 10,
  },
});
