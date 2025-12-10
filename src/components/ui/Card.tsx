// src/components/ui/Card.tsx
import React from 'react';
import { Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import { theme } from '../../theme';

type CardProps = {
  children: React.ReactNode;          // Ce que tu mets à l'intérieur de la carte
  onPress?: () => void;               // Optionnel : si tu veux que la carte soit cliquable
  style?: ViewStyle | ViewStyle[];    // Optionnel : ajouter des styles en plus
};

export function Card({ children, onPress, style }: CardProps) {
  const content = <View style={[styles.card, style]}>{children}</View>;

  // Si onPress est fourni → on rend la carte cliquable
  if (onPress) {
    return (
      <Pressable
        style={({ pressed }) => [
          styles.pressable,
          pressed && styles.pressed,
        ]}
        onPress={onPress}
      >
        {content}
      </Pressable>
    );
  }

  // Sinon → juste une carte simple non cliquable
  return content;
}

const styles = StyleSheet.create({
  pressable: {
    borderRadius: theme.radii.card,
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.99 }],
  },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radii.card,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
});
