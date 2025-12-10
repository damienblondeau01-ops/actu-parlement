// lib/parlement-common.tsx
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { theme } from "./theme";

type ScreenContainerProps = {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
};

export const ScreenContainer: React.FC<ScreenContainerProps> = ({
  children,
  title,
  subtitle,
  style,
  contentStyle,
}) => (
  <SafeAreaView
    style={[styles.safeArea, style]}
    // 👇 très important : on ne protège QUE le haut, pour ne pas créer d'espace au-dessus de la barre de navigation
    edges={["top"]}
  >
    <View style={styles.appHeader}>
      <Text style={styles.appTitle}>ActuDeslois</Text>
      <Text style={styles.appSubtitle}>Parlement & activité législative</Text>
    </View>

    <View style={[styles.contentWrapper, contentStyle]}>
      {title && <Text style={styles.sectionTitle}>{title}</Text>}
      {subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
      {children}
    </View>
  </SafeAreaView>
);

export const SectionTitle: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => <Text style={styles.sectionTitle}>{children}</Text>;

export const SectionSubtitle: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => <Text style={styles.sectionSubtitle}>{children}</Text>;

export const LoadingView: React.FC<{ message?: string }> = ({ message }) => (
  <View style={styles.center}>
    <ActivityIndicator size="large" />
    {message ? <Text style={styles.subtext}>{message}</Text> : null}
  </View>
);

export const ErrorView: React.FC<{ message: string }> = ({ message }) => (
  <View style={styles.center}>
    <Text style={styles.errorText}>{message}</Text>
  </View>
);

type DeputyCardProps = {
  deputy: any;
  onPress?: () => void;
};

export const DeputyCard: React.FC<DeputyCardProps> = ({ deputy, onPress }) => {
  const circo = deputy.circonscription ?? "";
  const group =
    deputy.groupe_sigle ?? deputy.groupe ?? deputy.groupe_politique ?? "";
  const dept = deputy.departement ?? "";

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        styles.cardRow,
        pressed && styles.cardPressed,
      ]}
    >
      <View style={styles.avatarCircle}>
        <Text style={styles.avatarInitials}>
          {initialsFromName(deputy.nomcomplet)}
        </Text>
      </View>

      <View style={styles.cardTextWrapper}>
        <Text numberOfLines={1} style={styles.cardTitle}>
          {deputy.nomcomplet}
        </Text>
        <Text numberOfLines={1} style={styles.cardSubtitle}>
          {circo || "Circonscription inconnue"}
        </Text>

        <View style={styles.cardTagsRow}>
          {group ? <Text style={styles.cardTag}>{group}</Text> : null}
          {dept ? <Text style={styles.cardTagSecondary}>{dept}</Text> : null}
        </View>
      </View>
    </Pressable>
  );
};

type LawCardProps = {
  law: any;
  onPress?: () => void;
};

export const LawCard: React.FC<LawCardProps> = ({ law, onPress }) => {
  const title = law.titre ?? law.titre_loi ?? "Loi / scrutin";
  const date =
    law.date_scrutin ?? law.date ?? law.date_vote ?? law.date_publication;
  const objet = law.objet ?? law.resume ?? "";

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <Text numberOfLines={2} style={styles.cardTitle}>
        {title}
      </Text>

      {objet ? (
        <Text numberOfLines={2} style={styles.cardSubtitle}>
          {objet}
        </Text>
      ) : null}

      {date ? <Text style={styles.cardMeta}>{`Scrutin du ${date}`}</Text> : null}
    </Pressable>
  );
};

// 🔹 Export de la fonction pour pouvoir l'utiliser dans d'autres fichiers
export function initialsFromName(raw: any): string {
  if (!raw) return "?";
  const name = String(raw).trim();

  if (!name) return "?";

  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  appHeader: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xs,
  },
  appTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: "700",
    color: theme.colors.text,
  },
  appSubtitle: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.subtext,
    marginTop: theme.spacing.xxs,
  },
  contentWrapper: {
    flex: 1,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    // ⚠️ pas de paddingBottom ici, pour laisser la liste coller à la nav
  },
  sectionTitle: {
    fontSize: theme.fontSize.xl,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  sectionSubtitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.subtext,
    marginBottom: theme.spacing.lg,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  subtext: {
    marginTop: theme.spacing.sm,
    fontSize: theme.fontSize.sm,
    color: theme.colors.subtext,
  },
  errorText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.danger,
    textAlign: "center",
    paddingHorizontal: theme.spacing.lg,
  },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadow.soft,
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: theme.spacing.md,
  },
  avatarInitials: {
    fontSize: theme.fontSize.sm,
    fontWeight: "700",
    color: theme.colors.primary,
  },
  cardTextWrapper: {
    flex: 1,
  },
  cardTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: "600",
    color: theme.colors.text,
  },
  cardSubtitle: {
    marginTop: theme.spacing.xxs,
    fontSize: theme.fontSize.sm,
    color: theme.colors.subtext,
  },
  cardMeta: {
    marginTop: theme.spacing.sm,
    fontSize: theme.fontSize.xs,
    color: theme.colors.subtext,
  },
  cardTagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: theme.spacing.xs,
  },
  cardTag: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.chipBackground,
    borderWidth: 1,
    borderColor: theme.colors.chipBorder,
    color: theme.colors.primary,
    fontSize: theme.fontSize.xs,
    fontWeight: "500",
    marginRight: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
  cardTagSecondary: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    color: theme.colors.subtext,
    fontSize: theme.fontSize.xs,
    marginRight: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
});
