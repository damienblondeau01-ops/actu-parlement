// app/(tabs)/stats.tsx

import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabaseClient";
import { theme } from "../../lib/theme";
import { Image as ExpoImage } from "expo-image";

const colors = theme.colors;

type DeputeRow = {
  id_an: string | null;
  nomComplet: string | null;
  nomcomplet: string | null;
  prenom: string | null;
  nom: string | null;
  groupe: string | null;
  groupeAbrev: string | null;
  scoreParticipation: number | string | null;
  scoreparticipation: number | string | null;
  scoreLoyaute: number | string | null;
  scoreloyaute: number | string | null;
  photoUrl: string | null;
  photourl: string | null;
};

type DeputeWithScores = {
  row: DeputeRow;
  participation: number | null;
  loyaute: number | null;
};

function computeSafeNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function formatPct(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return `${value.toFixed(1)} %`;
}

function getDisplayName(row: DeputeRow): string {
  return (
    row.nomComplet ||
    row.nomcomplet ||
    `${row.prenom ?? ""} ${row.nom ?? ""}`.trim() ||
    "Nom non renseigné"
  );
}

function getPhotoUrl(row: DeputeRow): string | null {
  return row.photoUrl || row.photourl || null;
}

function getGroupLabel(row: DeputeRow): string {
  if (row.groupe && row.groupeAbrev) {
    return `${row.groupe} (${row.groupeAbrev})`;
  }
  if (row.groupe) return row.groupe;
  if (row.groupeAbrev) return row.groupeAbrev;
  return "Groupe non renseigné";
}

/* 🔹 Ligne d’un député dans un classement */
function DeputeRankRow(props: {
  rank: number;
  depute: DeputeWithScores;
  mode: "participation" | "loyaute" | "fronde";
}) {
  const { rank, depute, mode } = props;
  const row = depute.row;
  const name = getDisplayName(row);
  const photoUrl = getPhotoUrl(row);
  const groupLabel = getGroupLabel(row);

  let scoreValue: number | null = null;
  let scoreLabel = "";

  if (mode === "participation") {
    scoreValue = depute.participation;
    scoreLabel = "Participation";
  } else if (mode === "loyaute") {
    scoreValue = depute.loyaute;
    scoreLabel = "Loyauté";
  } else {
    // frondeur → on affiche la loyauté (basse) mais le label “Loyauté”
    scoreValue = depute.loyaute;
    scoreLabel = "Loyauté";
  }

  const initials = useMemo(() => {
    const parts = name.split(" ").filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }, [name]);

  return (
    <View style={styles.rankRow}>
      <View style={styles.rankLeft}>
        <Text style={styles.rankNumber}>{rank}</Text>
        {photoUrl ? (
          <ExpoImage
            source={{ uri: photoUrl }}
            style={styles.rankAvatar}
            contentFit="cover"
          />
        ) : (
          <View style={styles.rankAvatarFallback}>
            <Text style={styles.rankAvatarInitials}>{initials}</Text>
          </View>
        )}
        <View style={styles.rankTextCol}>
          <Text style={styles.rankName} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.rankGroup} numberOfLines={1}>
            {groupLabel}
          </Text>
        </View>
      </View>
      <View style={styles.rankRight}>
        <Text style={styles.rankScoreValue}>{formatPct(scoreValue)}</Text>
        <Text style={styles.rankScoreLabel}>{scoreLabel}</Text>
      </View>
    </View>
  );
}

export default function StatsScreen() {
  const [loading, setLoading] = useState(true);
  const [loadingRanks, setLoadingRanks] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [totalScrutins, setTotalScrutins] = useState<number | null>(null);
  const [totalVotes, setTotalVotes] = useState<number | null>(null);
  const [totalDeputes, setTotalDeputes] = useState<number | null>(null);

  const [topParticipation, setTopParticipation] = useState<DeputeWithScores[]>(
    []
  );
  const [topLoyaute, setTopLoyaute] = useState<DeputeWithScores[]>([]);
  const [topFrondeurs, setTopFrondeurs] = useState<DeputeWithScores[]>([]);

  useEffect(() => {
    const loadCounts = async () => {
      try {
        setLoading(true);
        setError(null);

        // Scrutins (scrutins_data)
        const { count: scrCount, error: scrError } = await supabase
          .from("scrutins_data")
          .select("*", { count: "exact", head: true });

        if (scrError) {
          console.warn("[STATS] Erreur count scrutins_data", scrError);
        } else {
          setTotalScrutins(scrCount ?? null);
        }

        // Votes nominatifs (vue votes_deputes_detail)
        const { count: votesCount, error: votesError } = await supabase
          .from("votes_deputes_detail")
          .select("*", { count: "exact", head: true });

        if (votesError) {
          console.warn("[STATS] Erreur count votes_deputes_detail", votesError);
        } else {
          setTotalVotes(votesCount ?? null);
        }

        // Députés (deputes_officiels)
        const { count: depCount, error: depError } = await supabase
          .from("deputes_officiels")
          .select("*", { count: "exact", head: true });

        if (depError) {
          console.warn("[STATS] Erreur count deputes_officiels", depError);
        } else {
          setTotalDeputes(depCount ?? null);
        }
      } catch (e) {
        console.warn("[STATS] Erreur globale counts", e);
        setError("Impossible de charger les statistiques globales.");
      } finally {
        setLoading(false);
      }
    };

    const loadRanks = async () => {
      try {
        setLoadingRanks(true);

        const { data, error } = await supabase
          .from("deputes_officiels")
          .select(
            `
            id_an,
            nomComplet,
            nomcomplet,
            prenom,
            nom,
            groupe,
            groupeAbrev,
            scoreParticipation,
            scoreparticipation,
            scoreLoyaute,
            scoreloyaute,
            photoUrl,
            photourl
          `
          );

        if (error) {
          console.warn("[STATS] Erreur chargement deputes_officiels", error);
          return;
        }

        const rows = (data ?? []) as DeputeRow[];

        const withScores: DeputeWithScores[] = rows
          .map((row) => {
            const participationRaw =
              row.scoreParticipation ?? row.scoreparticipation ?? null;
            const loyauteRaw =
              row.scoreLoyaute ?? row.scoreloyaute ?? null;

            return {
              row,
              participation: computeSafeNumber(participationRaw),
              loyaute: computeSafeNumber(loyauteRaw),
            };
          })
          .filter((d) => d.row.id_an); // on garde que les lignes avec un id_an

        // Top participation (desc)
        const topPart = [...withScores]
          .filter((d) => d.participation !== null)
          .sort((a, b) => (b.participation! - a.participation!))
          .slice(0, 5);

        // Top loyauté (desc)
        const topLoy = [...withScores]
          .filter((d) => d.loyaute !== null)
          .sort((a, b) => (b.loyaute! - a.loyaute!))
          .slice(0, 5);

        // Top frondeurs : loyauté la plus basse, avec un minimum de participation
        const topFr = [...withScores]
          .filter(
            (d) =>
              d.loyaute !== null &&
              d.participation !== null &&
              d.participation >= 40 // un minimum d'activité
          )
          .sort((a, b) => (a.loyaute! - b.loyaute!))
          .slice(0, 5);

        setTopParticipation(topPart);
        setTopLoyaute(topLoy);
        setTopFrondeurs(topFr);
      } catch (e) {
        console.warn("[STATS] Erreur globale ranks", e);
      } finally {
        setLoadingRanks(false);
      }
    };

    loadCounts();
    loadRanks();
  }, []);

  if (loading && !error) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>
          Chargement des statistiques globales…
        </Text>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* HEADER */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Statistiques globales</Text>
          <Text style={styles.headerSubtitle}>
            Vue d&apos;ensemble de l&apos;activité parlementaire.
          </Text>
        </View>

        {/* CARTES COMPTEURS */}
        <View style={styles.countersRow}>
          <View style={styles.counterCard}>
            <Text style={styles.counterLabel}>Scrutins analysés</Text>
            <Text style={styles.counterValue}>
              {totalScrutins !== null ? totalScrutins : "—"}
            </Text>
          </View>
          <View style={styles.counterCard}>
            <Text style={styles.counterLabel}>Votes nominatifs</Text>
            <Text style={styles.counterValue}>
              {totalVotes !== null ? totalVotes.toLocaleString("fr-FR") : "—"}
            </Text>
          </View>
        </View>

        <View style={styles.countersRow}>
          <View style={[styles.counterCard, { flex: 1 }]}>
            <Text style={styles.counterLabel}>Députés suivis</Text>
            <Text style={styles.counterValue}>
              {totalDeputes !== null ? totalDeputes : "—"}
            </Text>
          </View>
        </View>

        {/* TOP PARTICIPATION */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Top participation</Text>
          <Text style={styles.sectionSubtitle}>
            Députés ayant pris part au plus grand nombre de scrutins.
          </Text>

          {loadingRanks && topParticipation.length === 0 && (
            <View style={styles.sectionLoadingRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.smallGrey}>Chargement des classements…</Text>
            </View>
          )}

          {topParticipation.length === 0 && !loadingRanks && (
            <Text style={styles.smallGrey}>
              Les données de participation ne sont pas encore disponibles.
            </Text>
          )}

          {topParticipation.map((d, idx) => (
            <DeputeRankRow
              key={d.row.id_an ?? `part-${idx}`}
              rank={idx + 1}
              depute={d}
              mode="participation"
            />
          ))}
        </View>

        {/* TOP LOYAUTÉ */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Top loyauté</Text>
          <Text style={styles.sectionSubtitle}>
            Députés votant le plus souvent en accord avec leur groupe.
          </Text>

          {topLoyaute.length === 0 && !loadingRanks && (
            <Text style={styles.smallGrey}>
              Les données de loyauté ne sont pas encore disponibles.
            </Text>
          )}

          {topLoyaute.map((d, idx) => (
            <DeputeRankRow
              key={d.row.id_an ?? `loy-${idx}`}
              rank={idx + 1}
              depute={d}
              mode="loyaute"
            />
          ))}
        </View>

        {/* TOP FRONDEURS */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Top frondeurs</Text>
          <Text style={styles.sectionSubtitle}>
            Députés les plus souvent en désaccord avec leur groupe, parmi les
            plus actifs.
          </Text>

          {topFrondeurs.length === 0 && !loadingRanks && (
            <Text style={styles.smallGrey}>
              Aucun profil de frondeur clairement identifié pour l&apos;instant.
            </Text>
          )}

          {topFrondeurs.map((d, idx) => (
            <DeputeRankRow
              key={d.row.id_an ?? `fronde-${idx}`}
              rank={idx + 1}
              depute={d}
              mode="fronde"
            />
          ))}
        </View>

        <View style={styles.footerNoteContainer}>
          <Text style={styles.footerNote}>
            Statistiques calculées à partir des données officielles OpenData de
            l&apos;Assemblée nationale (scrutins & votes nominatifs).
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    paddingTop: 8,
  },

  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  loadingText: {
    marginTop: 8,
    color: colors.subtext,
    fontSize: 13,
  },
  errorText: {
    color: colors.danger || "red",
    textAlign: "center",
    marginHorizontal: 16,
  },

  header: {
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
  },
  headerSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: colors.subtext,
  },

  countersRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },
  counterCard: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  counterLabel: {
    fontSize: 12,
    color: colors.subtext,
    marginBottom: 4,
  },
  counterValue: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
  },

  sectionCard: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: colors.subtext,
    marginTop: 2,
    marginBottom: 8,
  },

  sectionLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    gap: 6,
  },
  smallGrey: {
    fontSize: 12,
    color: colors.subtext,
  },

  rankRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  rankLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 8,
  },
  rankNumber: {
    width: 20,
    fontSize: 14,
    fontWeight: "700",
    color: colors.subtext,
  },
  rankAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
  },
  rankAvatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  rankAvatarInitials: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
  },
  rankTextCol: {
    flex: 1,
  },
  rankName: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
  },
  rankGroup: {
    fontSize: 11,
    color: colors.subtext,
    marginTop: 1,
  },
  rankRight: {
    alignItems: "flex-end",
  },
  rankScoreValue: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  rankScoreLabel: {
    fontSize: 11,
    color: colors.subtext,
  },

  footerNoteContainer: {
    marginTop: 14,
    alignItems: "center",
    paddingHorizontal: 12,
  },
  footerNote: {
    fontSize: 11,
    color: colors.subtext,
    textAlign: "center",
  },
});
