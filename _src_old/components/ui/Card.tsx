// src/components/ui/Card.tsx
import React from "react";
import { Pressable, StyleSheet, View, ViewStyle } from "react-native";
import { theme } from "../../theme";

type CardProps = {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle | ViewStyle[];
};

/**
 * ✅ PROFIL RELIEF (modifiable en une fois)
 * - "flat"   : quasi plat
 * - "soft"   : relief léger (recommandé)
 * - "strong" : plus marqué
 */
const RELIEF: "flat" | "soft" | "contrast" = "contrast";

function cardElevation() {
  if (RELIEF === "flat") {
    return {};
  }

  if (RELIEF === "soft") {
    return {
      elevation: 3,
      shadowColor: "#000",
      shadowOpacity: 0.10,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
    } as ViewStyle;
  }

  // ✅ contrast (nouveau)
  return {
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  } as ViewStyle;
}

export function Card({ children, onPress, style }: CardProps) {
  const content = <View style={[styles.card, style]}>{children}</View>;

  if (onPress) {
    return (
      <Pressable
        style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
        onPress={onPress}
      >
        {content}
      </Pressable>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  pressable: {
    borderRadius: theme.radius.lg,
  },
  pressed: {
    opacity: 0.92,
    transform: [{ scale: 0.995 }],
  },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,

    // ✅ plus de contraste sur bordure
    borderWidth: 1,
    borderColor: theme.paper.line,

    // ✅ petit "highlight" haut-gauche (effet papier)
    // (on simule un reflet via un borderTop un poil plus clair)
    borderTopColor: "rgba(255,255,255,0.55)",

    // ✅ relief (iOS + Android)
    ...(theme.elevation?.cardShadow as any),
  },
});
