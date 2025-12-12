// app/(tabs)/stats-groupes.tsx

import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { supabase } from "../../lib/supabaseClient";
import { theme } from "../../lib/theme";

type GroupeStatsRow = {
  groupe: string | null;
  nb_deputes: number | null;
  nb_votes: number | null;
  nb_pour: number | null;
  nb_contre: number | null;
  nb_abstention: number | null;
  nb_nv: number | null;
  pct_pour: number | null;
  pct_contre: number | null;
  pct_abstention: number | null;
};

export default function StatsGroupesScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<GroupeStatsRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data, error } = await supabase
          .from("stats_groupes_votes")
          .select("*")
          .order("nb_votes", { ascending: false });

        if (error) {
          console.warn("[STATS GROUPES] Erreur Supabase =", error);
          setError("Impossible de charger les statistiques par groupe.");
          setRows([]);
          return;
        }

        setRows((data as GroupeStatsRow[]) ?? []);
      } catch (e: any) {
        console.warn("[STATS GROUPES] Erreur inattendue =", e);
        setError(
          e?.message ??
            "Erreur inattendue lors du chargement des stats groupes."
        );
        setRows([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>
          Chargement des statistiques par groupe…
        </Text>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Retour</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* HEADER SIMPLE */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
        <View>
          <Text style={styles.headerTitle}>Stats par groupe</Text>
          <Text style={styles.headerSubtitle}>
            Vue d’ensemble des positions des groupes politiques.
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {rows.map((g, index) => {
          const nomGroupe = g.groupe ?? "Non renseigné";
          const nbDep = g.nb_deputes ?? 0;
          const nbVotes = g.nb_votes ?? 0;
          const pour = g.nb_pour ?? 0;
          const contre = g.nb_contre ?? 0;
          const abst = g.nb_abstention ?? 0;
          const nv = g.nb_nv ?? 0;

          const totalExpr = pour + contre + abst;

          const pourPct =
            totalExpr > 0
              ? Math.round((pour * 100) / totalExpr)
              : g.pct_pour ?? 0;
          const contrePct =
            totalExpr > 0
              ? Math.round((contre * 100) / totalExpr)
              : g.pct_contre ?? 0;
          const abstPct =
            totalExpr > 0
              ? Math.round((abst * 100) / totalExpr)
              : g.pct_abstention ?? 0;

          // Pour éviter une barre totalement vide si tout est à 0
          const hasVotesBar = pour + contre + abst > 0;

          return (
            <View key={`${nomGroupe}-${index}`} style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.groupName} numberOfLines={1}>
                  {nomGroupe}
                </Text>
                <Text style={styles.groupMeta}>
                  {nbDep} député{nbDep > 1 ? "s" : ""} · {nbVotes} votes
                </Text>
              </View>

              {/* Barres Pour / Contre / Abstention */}
              <View style={styles.barLabelRow}>
                <Text style={styles.barLabel}>
                  Pour {pour} ({pourPct}%)
                </Text>
                <Text style={styles.barLabel}>
                  Contre {contre} ({contrePct}%)
                </Text>
                <Text style={styles.barLabel}>
                  Abst. {abst} ({abstPct}%)
                </Text>
              </View>

              <View style={styles.voteBar}>
                {hasVotesBar ? (
                  <>
                    <View
                      style={{
                        flex: pour,
                        backgroundColor: "#16a34a",
                      }}
                    />
                    <View
                      style={{
                        flex: contre,
                        backgroundColor: "#dc2626",
                      }}
                    />
                    <View
                      style={{
                        flex: abst,
                        backgroundColor: "#eab308",
                      }}
                    />
                  </>
                ) : (
                  <View
                    style={{
                      flex: 1,
                      backgroundColor: theme.colors.surface,
                    }}
                  />
                )}
              </View>

              {/* Ligne de résumé */}
              <Text style={styles.cardFooterText}>
                • {pourPct}% des votes exprimés « pour »{"\n"}
                • {contrePct}% « contre » · {abstPct}% abstention{"\n"}
                • {nv} vote{nv > 1 ? "s" : ""} non exprimé(s)
              </Text>
            </View>
          );
        })}

        <View style={styles.footerNoteContainer}>
          <Text style={styles.footerNote}>
            Données agrégées à partir des votes nominatifs (OpenData AN).
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    backgroundColor: theme.colors.background,
  },
  loadingText: {
    marginTop: 8,
    color: theme.colors.subtext,
    fontSize: 13,
  },
  errorText: {
    color: theme.colors.danger || "red",
    textAlign: "center",
    marginBottom: 12,
  },
  backButton: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: theme.colors.card,
  },
  backButtonText: {
    color: theme.colors.text,
    fontWeight: "600",
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  backBtn: {
    marginRight: 12,
  },
  backIcon: {
    color: theme.colors.subtext,
    fontSize: 20,
  },
  headerTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: "700",
  },
  headerSubtitle: {
    color: theme.colors.subtext,
    fontSize: 12,
    marginTop: 2,
  },

  card: {
    marginTop: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: theme.colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  cardHeaderRow: {
    marginBottom: 6,
  },
  groupName: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.text,
  },
  groupMeta: {
    fontSize: 12,
    color: theme.colors.subtext,
    marginTop: 2,
  },

  barLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  barLabel: {
    fontSize: 11,
    color: theme.colors.subtext,
  },
  voteBar: {
    flexDirection: "row",
    height: 8,
    borderRadius: 999,
    overflow: "hidden",
    marginTop: 6,
  },

  cardFooterText: {
    marginTop: 8,
    fontSize: 12,
    color: theme.colors.subtext,
    lineHeight: 17,
  },

  footerNoteContainer: {
    marginTop: 16,
    alignItems: "center",
  },
  footerNote: {
    fontSize: 11,
    color: theme.colors.subtext,
    textAlign: "center",
  },
});
