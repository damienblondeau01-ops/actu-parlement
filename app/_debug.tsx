// app/_debug.tsx
import React from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { usePathname, useLocalSearchParams, useRouter } from "expo-router";

export default function DebugScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useLocalSearchParams();

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 18, fontWeight: "900" }}>DEBUG</Text>

      <View style={{ padding: 12, borderWidth: 1, borderRadius: 12 }}>
        <Text style={{ fontWeight: "900" }}>pathname</Text>
        <Text>{pathname}</Text>
      </View>

      <View style={{ padding: 12, borderWidth: 1, borderRadius: 12 }}>
        <Text style={{ fontWeight: "900" }}>params</Text>
        <Text>{JSON.stringify(params, null, 2)}</Text>
      </View>

      <Pressable
        onPress={() => router.push("/(tabs)/actu")}
        style={{ padding: 14, borderRadius: 12, borderWidth: 1 }}
      >
        <Text style={{ fontWeight: "900" }}>Aller à Actu</Text>
      </Pressable>

      <Pressable
        onPress={() => router.push("/(tabs)/lois")}
        style={{ padding: 14, borderRadius: 12, borderWidth: 1 }}
      >
        <Text style={{ fontWeight: "900" }}>Aller à Lois</Text>
      </Pressable>

      <Pressable
        onPress={() => router.push("/(tabs)/deputes")}
        style={{ padding: 14, borderRadius: 12, borderWidth: 1 }}
      >
        <Text style={{ fontWeight: "900" }}>Aller à Députés</Text>
      </Pressable>
    </ScrollView>
  );
}
