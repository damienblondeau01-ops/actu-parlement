// src/components/ui/StatCard.tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../../theme';
import { Card } from './Card';

type StatCardProps = {
  label: string;               // "Lois votées"
  value: string | number;      // "128"
  subtitle?: string;           // "Sur la période choisie"
};

export function StatCard({ label, value, subtitle }: StatCardProps) {
  return (
    <Card style={styles.card}>
      {/* Petit rond décoratif */}
      <View style={styles.iconCircle}>
        <View style={styles.innerDot} />
      </View>

      {/* Titre */}
      <Text style={styles.label}>{label}</Text>

      {/* Valeur principale */}
      <Text style={styles.value}>{value}</Text>

      {/* Sous-texte */}
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.lg,
  },

  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.sm,
  },

  innerDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: theme.colors.accent,
  },

  label: {
    color: theme.colors.subtext,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
    marginBottom: theme.spacing.xs,
  },

  value: {
    color: theme.colors.text,
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: theme.spacing.xs,
  },

  subtitle: {
    color: theme.colors.subtext,
    fontSize: theme.fontSize.xs,
    textAlign: 'center',
  },
});
