import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type TabKey = "lois" | "deputes" | "stats";

interface Props {
  activeTab: TabKey;
  onChange: (tab: TabKey) => void;
}

export default function TabSwitcher({ activeTab, onChange }: Props) {
  return (
    <View style={styles.wrapper}>
      {[
        { key: "lois", label: "Loi" },
        { key: "deputes", label: "Député" },
        { key: "stats", label: "Statistiques" },
      ].map((tab) => (
        <Pressable
          key={tab.key}
          onPress={() => onChange(tab.key as TabKey)}
          style={({ pressed }) => [
            styles.tab,
            activeTab === tab.key && styles.tabActive,
            pressed && styles.tabPressed,
          ]}
        >
          <Text
            style={[
              styles.label,
              activeTab === tab.key && styles.labelActive,
            ]}
          >
            {tab.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: "row",
    backgroundColor: "#f2f2f7",
    padding: 4,
    borderRadius: 999,
    marginBottom: 12,
    marginTop: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 999,
    alignItems: "center",
  },
  tabActive: {
    backgroundColor: "#dce7ff",
  },
  tabPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.95 }],
  },
  label: {
    fontSize: 14,
    color: "#444",
  },
  labelActive: {
    color: "#0057FF",
    fontWeight: "700",
  },
});
