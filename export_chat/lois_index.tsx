import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
} from "react-native";
import {
  ErrorView,
  LoadingView,
  ScreenContainer,
} from "../../../lib/parlement-common";
import { supabase } from "../../../lib/supabaseClient";
import { theme } from "../../../lib/theme";
import { Scrutin } from "../../../lib/types";

function getLawTitle(s: Scrutin): string {
  // @ts-ignore – au cas où titre_loi / objet existent aussi
  return s.titre || s.titre_loi || s.objet || `Scrutin n°${s.numero ?? ""}`;
}

function getLawDate(s: Scrutin): string {
  return s.date_scrutin || "Date non renseignée";
}

export default function LoisListScreen() {
  const router = useRouter();
  const [scrutins, setScrutins] = useState<Scrutin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data, error } = await supabase
          .from("scrutins")
          .select("*")
          .order("date_scrutin", { ascending: false });

        if (error) {
          console.error("Erreur chargement scrutins :", error);
          setError("Impossible de charger les lois / scrutins.");
          setLoading(false);
          return;
        }

        setScrutins((data || []) as Scrutin[]);
      } catch (e) {
        console.error("Erreur inattendue LoisListScreen :", e);
        setError("Une erreur inattendue est survenue.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const handlePressItem = (item: Scrutin) => {
    router.push({
      pathname: "/lois/[id]",
      params: { id: item.id },
    });
  };

  if (loading) {
    return (
      <LoadingView message="Chargement des lois et scrutins…" />
    );
  }

  if (error) {
    return <ErrorView message={error} />;
  }

  return (
    <ScreenContainer
      title="Lois & scrutins"
      subtitle="Derniers scrutins de l’Assemblée nationale."
    >
      <FlatList
        data={scrutins}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => handlePressItem(item)}
          >
            <Text style={styles.cardTitle} numberOfLines={2}>
              {getLawTitle(item)}
            </Text>
            <Text style={styles.cardMeta}>
              {getLawDate(item)}
              {item.numero != null ? ` • Scrutin n°${item.numero}` : ""}
            </Text>
          </Pressable>
        )}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingVertical: 8,
  },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: "600",
    color: theme.colors.text,
  },
  cardMeta: {
    marginTop: 4,
    fontSize: theme.fontSize.xs,
    color: theme.colors.subtext,
  },
});
