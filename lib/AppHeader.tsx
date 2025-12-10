// lib/AppHeader.tsx
import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { theme } from "./theme";

const colors = theme.colors;

type AppHeaderProps = {
  title: string;
  subtitle?: string;
  showBackButton?: boolean;
  rightContent?: React.ReactNode;
};

export const AppHeader: React.FC<AppHeaderProps> = ({
  title,
  subtitle,
  showBackButton = false,
  rightContent,
}) => {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.left}>
        {showBackButton && (
          <Pressable
            onPress={() => router.back()}
            style={styles.backButton}
            hitSlop={10}
          >
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
        )}

        <View>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>

      {rightContent ? <View style={styles.right}>{rightContent}</View> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.background,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
    backgroundColor: colors.card,
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    color: colors.text,
  },
  subtitle: {
    fontSize: 13,
    color: colors.subtext,
    marginTop: 2,
  },
  right: {
    marginLeft: 8,
  },
});
