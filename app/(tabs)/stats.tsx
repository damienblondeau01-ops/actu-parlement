// app/(tabs)/stats.tsx
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabaseClient";
import { theme } from "../../lib/theme";

const colors = theme.colors;

type LoiAppRow = {
  loi_id: string;
  titre_loi: string | null;
  nb_scrutins_total: number | null;
  nb_articles: number | null;
  nb_amendements: number | null;
  date_dernier_scrutin: string | null;
};

type LoiStatsItem = {
  loi_id: string;
  titre_loi: string;
  nb_scrutins_total: number;
  nb_articles: number;
  nb_amendements: number;
  date_dernier_scrutin: string | null;
};

type DeputeRow = {
  id_an: string;
  nomComplet: string | null;
  nomcomplet: string | null; // fallback
  groupeAbrev: string | null;
  scoreParticipation: number | null;
  scoreLoyaute: number | null;
  scoreMajorite: number | null;
  photoUrl: string | null;
  photourl: string | null; // fallback
};

type DeputeStatsItem = {
  id_an: string;
  nom: string;
  groupe: string | null;
  participation: number | null;
  loyaute: number | null;
  majorite: number | null;
  photo: string | null;
};

export default function StatsScreen() {
  const router = useRouter();

  const [lois, setLois] = useState<LoiStatsItem[]>([]);
  const [deputes, setDeputes] = useState<DeputeStatsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const [loisRes, deputesRes] = await Promise.all([
          supabase
            .from("lois_app")
            .select(
              `
              loi_id,
              titre_loi,
              nb_scrutins_total,
              nb_articles,
              nb_amendements,
              date_dernier_scrutin
            `
            ),
          supabase
            .from("deputes_officiels")
            .select(
              `
              id_an,
              nomComplet,
              nomcomplet,
              groupeAbrev,
              scoreParticipation,
              scoreLoyaute,
              scoreMajorite,
              photoUrl,
              photourl
            `
            ),
        ]);

        if (loisRes.error) {
          console.warn("[STATS LOIS] Erreur chargement lois_app :", loisRes.error);
          setError("Impossible de charger les statistiques sur les lois.");
        }

        if (deputesRes.error) {
          console.warn(
            "[STATS DEPUTES] Erreur chargement deputes_officiels :",
            deputesRes.error
          );
          setError((prev) =>
            prev
              ? prev + " Certaines statistiques sur les députés sont indisponibles."
              : "Impossible de charger les statistiques sur les députés."
          );
        }

        const loisRows = (loisRes.data || []) as LoiAppRow[];
        const mappedLois: LoiStatsItem[] = loisRows.map((row) => ({
          loi_id: row.loi_id,
          titre_loi: row.titre_loi || `Loi ${row.loi_id}`,
          nb_scrutins_total: Number(row.nb_scrutins_total || 0),
          nb_articles: Number(row.nb_articles || 0),
          nb_amendements: Number(row.nb_amendements || 0),
          date_dernier_scrutin: row.date_dernier_scrutin,
        }));

        const deputesRows = (deputesRes.data || []) as DeputeRow[];
        const mappedDeputes: DeputeStatsItem[] = deputesRows.map((row) => ({
          id_an: row.id_an,
          nom: row.nomComplet || row.nomcomplet || "Député inconnu",
          groupe: row.groupeAbrev || null,
          participation: row.scoreParticipation,
          loyaute: row.scoreLoyaute,
          majorite: row.scoreMajorite,
          photo: row.photoUrl || row.photourl || null,
        }));

        setLois(mappedLois);
        setDeputes(mappedDeputes);
      } catch (e: any) {
        console.warn("[STATS] Erreur inattendue :", e);
        setError("Erreur inattendue lors du chargement des statistiques.");
        setLois([]);
        setDeputes([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  // --- Stats LOIS ---
  const {
    totalLois,
    totalScrutins,
    totalArticles,
    totalAmendements,
    avgScrutinsParLoi,
    avgAmendementsParLoi,
    topLoisScrutins,
    topLoisAmendements,
    topLoisRecentes,
  } = useMemo(() => {
    if (lois.length === 0) {
      return {
        totalLois: 0,
        totalScrutins: 0,
        totalArticles: 0,
        totalAmendements: 0,
        avgScrutinsParLoi: 0,
        avgAmendementsParLoi: 0,
        topLoisScrutins: [] as LoiStatsItem[],
        topLoisAmendements: [] as LoiStatsItem[],
        topLoisRecentes: [] as LoiStatsItem[],
      };
    }

    const totalLois = lois.length;
    const totalScrutins = lois.reduce(
      (sum, loi) => sum + (loi.nb_scrutins_total || 0),
      0
    );
    const totalArticles = lois.reduce(
      (sum, loi) => sum + (loi.nb_articles || 0),
      0
    );
    const totalAmendements = lois.reduce(
      (sum, loi) => sum + (loi.nb_amendements || 0),
      0
    );

    const avgScrutinsParLoi =
      totalLois > 0 ? Math.round((totalScrutins / totalLois) * 10) / 10 : 0;
    const avgAmendementsParLoi =
      totalLois > 0 ? Math.round((totalAmendements / totalLois) * 10) / 10 : 0;

    const topLoisScrutins = [...lois]
      .sort((a, b) => b.nb_scrutins_total - a.nb_scrutins_total)
      .slice(0, 5);

    const topLoisAmendements = [...lois]
      .sort((a, b) => b.nb_amendements - a.nb_amendements)
      .slice(0, 5);

    const topLoisRecentes = [...lois]
      .sort((a, b) => {
        const da = a.date_dernier_scrutin
          ? new Date(a.date_dernier_scrutin).getTime()
          : 0;
        const db = b.date_dernier_scrutin
          ? new Date(b.date_dernier_scrutin).getTime()
          : 0;
        return db - da;
      })
      .slice(0, 5);

    return {
      totalLois,
      totalScrutins,
      totalArticles,
      totalAmendements,
      avgScrutinsParLoi,
      avgAmendementsParLoi,
      topLoisScrutins,
      topLoisAmendements,
      topLoisRecentes,
    };
  }, [lois]);

  // --- Stats DEPUTES ---
  const {
    topParticipation,
    topLoyaute,
    topProMajorite,
    countParticipation,
    countLoyaute,
    countMajorite,
  } = useMemo(() => {
    if (deputes.length === 0) {
      return {
        topParticipation: [] as DeputeStatsItem[],
        topLoyaute: [] as DeputeStatsItem[],
        topProMajorite: [] as DeputeStatsItem[],
        countParticipation: 0,
        countLoyaute: 0,
        countMajorite: 0,
      };
    }

    const withParticipation = deputes.filter(
      (d) => d.participation != null
    );
    const withLoyaute = deputes.filter((d) => d.loyaute != null);
    const withMajorite = deputes.filter((d) => d.majorite != null);

    const topParticipation = [...withParticipation]
      .sort((a, b) => (b.participation ?? 0) - (a.participation ?? 0))
      .slice(0, 5);

    const topLoyaute = [...withLoyaute]
      .sort((a, b) => (b.loyaute ?? 0) - (a.loyaute ?? 0))
      .slice(0, 5);

    const topProMajorite = [...withMajorite]
      .sort((a, b) => (b.majorite ?? 0) - (a.majorite ?? 0))
      .slice(0, 5);

    return {
      topParticipation,
      topLoyaute,
      topProMajorite,
      countParticipation: withParticipation.length,
      countLoyaute: withLoyaute.length,
      countMajorite: withMajorite.length,
    };
  }, [deputes]);

  const renderLoiRow = (loi: LoiStatsItem) => {
    const dateLabel = loi.date_dernier_scrutin
      ? new Date(loi.date_dernier_scrutin).toLocaleDateString("fr-FR")
      : "—";

    return (
      <Pressable
        key={loi.loi_id}
        style={styles.loiRow}
        onPress={() => router.push(`/lois/${loi.loi_id}`)}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.loiTitre} numberOfLines={2}>
            {loi.titre_loi}
          </Text>
          <Text style={styles.loiMeta}>Dernier scrutin : {dateLabel}</Text>
        </View>
        <View style={styles.loiChipsCol}>
          <View style={styles.loiChip}>
            <Text style={styles.loiChipText}>
              {loi.nb_scrutins_total} scrutin(s)
            </Text>
          </View>
          <View style={styles.loiChip}>
            <Text style={styles.loiChipText}>
              {loi.nb_amendements} amendement(s)
            </Text>
          </View>
        </View>
      </Pressable>
    );
  };

  const renderDeputeRow = (
    d: DeputeStatsItem,
    mode: "participation" | "loyaute" | "majorite"
  ) => {
    const mainScore =
      mode === "participation"
        ? d.participation
        : mode === "loyaute"
        ? d.loyaute
        : d.majorite;

    const suffix =
      mode === "participation"
        ? "participation"
        : mode === "loyaute"
        ? "loyauté"
        : "votes avec la majorité";

    const scoreNumber = mainScore ?? 0;
    const clampedScore =
      scoreNumber < 0 ? 0 : scoreNumber > 100 ? 100 : scoreNumber;

    return (
      <Pressable
        key={d.id_an}
        style={styles.deputeRow}
        onPress={() => router.push(`/deputes/${d.id_an}`)}
      >
        {/* Avatar + texte */}
        <View style={styles.deputeLeft}>
          <View style={styles.deputeAvatar}>
            {d.photo ? (
              <Image
                source={{ uri: d.photo }}
                style={styles.deputeAvatarImg}
              />
            ) : (
              <View
                style={[
                  styles.deputeAvatarFallback,
                  {
                    backgroundColor: d.groupe
                      ? getGroupColor(d.groupe)
                      : colors.primarySoft,
                  },
                ]}
              >
                <Text style={styles.deputeAvatarInitials}>
                  {getInitials(d.nom)}
                </Text>
              </View>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.deputeHeaderRow}>
              {d.groupe && (
                <View
                  style={[
                    styles.groupDot,
                    { backgroundColor: getGroupColor(d.groupe) },
                  ]}
                />
              )}
              <Text style={styles.deputeNom} numberOfLines={1}>
                {d.nom}
              </Text>
            </View>
            <Text style={styles.deputeMeta}>
              {d.groupe ? d.groupe : "Groupe non renseigné"}
            </Text>
          </View>
        </View>

        {/* Score + barre */}
        <View style={styles.deputeScoreCol}>
          <Text style={styles.deputeChipText}>
            {mainScore != null ? `${mainScore}%` : "—"} {suffix}
          </Text>
          <View style={styles.deputeBarTrack}>
            <View
              style={[
                styles.deputeBarFill,
                { width: `${clampedScore}%` },
              ]}
            />
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Stats</Text>
        <Text style={styles.headerSubtitle}>
          Vue d&apos;ensemble des lois et des députés.
        </Text>
      </View>

      {loading && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Analyse des données…</Text>
        </View>
      )}

      {!loading && error && (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {!loading && !error && (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
        >
          {/* --- Bloc LOIS --- */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Lois — Vue d&apos;ensemble</Text>
            <View style={styles.grid2}>
              <View style={styles.kpiBlock}>
                <Text style={styles.kpiLabel}>Lois suivies</Text>
                <Text style={styles.kpiValue}>{totalLois}</Text>
              </View>
              <View style={styles.kpiBlock}>
                <Text style={styles.kpiLabel}>Scrutins cumulés</Text>
                <Text style={styles.kpiValue}>{totalScrutins}</Text>
              </View>
            </View>
            <View style={[styles.grid2, { marginTop: 12 }]}>
              <View style={styles.kpiBlock}>
                <Text style={styles.kpiLabel}>Scrutins / loi</Text>
                <Text style={styles.kpiValue}>{avgScrutinsParLoi}</Text>
              </View>
              <View style={styles.kpiBlock}>
                <Text style={styles.kpiLabel}>Amendements / loi</Text>
                <Text style={styles.kpiValue}>{avgAmendementsParLoi}</Text>
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Lois les plus débattues</Text>
            <Text style={styles.sectionSubtitleSmall}>
              Top 5 sur {totalLois} lois
            </Text>
            {topLoisScrutins.length === 0 && (
              <Text style={styles.emptyText}>
                Pas encore assez de données pour calculer ce classement.
              </Text>
            )}
            {topLoisScrutins.map((loi) => renderLoiRow(loi))}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Lois les plus amendées</Text>
            <Text style={styles.sectionSubtitleSmall}>
              Top 5 sur {totalLois} lois
            </Text>
            {topLoisAmendements.length === 0 && (
              <Text style={styles.emptyText}>
                Pas encore assez de données pour calculer ce classement.
              </Text>
            )}
            {topLoisAmendements.map((loi) => renderLoiRow(loi))}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Lois les plus récentes</Text>
            <Text style={styles.sectionSubtitleSmall}>
              Top 5 sur {totalLois} lois
            </Text>
            {topLoisRecentes.length === 0 && (
              <Text style={styles.emptyText}>
                Pas encore assez de données pour calculer ce classement.
              </Text>
            )}
            {topLoisRecentes.map((loi) => renderLoiRow(loi))}
          </View>

          {/* --- Bloc DEPUTES --- */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Députés les plus actifs</Text>
            <Text style={styles.sectionSubtitleSmall}>
              Top 5 sur {countParticipation} députés
            </Text>
            {topParticipation.length === 0 && (
              <Text style={styles.emptyText}>
                Pas encore assez de données pour calculer ce classement.
              </Text>
            )}
            {topParticipation.map((d) =>
              renderDeputeRow(d, "participation")
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Députés les plus loyaux</Text>
            <Text style={styles.sectionSubtitleSmall}>
              Top 5 sur {countLoyaute} députés
            </Text>
            {topLoyaute.length === 0 && (
              <Text style={styles.emptyText}>
                Pas encore assez de données pour calculer ce classement.
              </Text>
            )}
            {topLoyaute.map((d) => renderDeputeRow(d, "loyaute"))}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Députés les plus pro-majorité</Text>
            <Text style={styles.sectionSubtitleSmall}>
              Top 5 sur {countMajorite} députés
            </Text>
            {topProMajorite.length === 0 && (
              <Text style={styles.emptyText}>
                Pas encore assez de données pour calculer ce classement.
              </Text>
            )}
            {topProMajorite.map((d) => renderDeputeRow(d, "majorite"))}
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/* ---------- Helpers ---------- */

function getGroupColor(groupe: string): string {
  const g = groupe.toLowerCase();

  if (g.includes("rassemblement national")) return "#22c55e";
  if (g.includes("la france insoumise")) return "#ef4444";
  if (g.includes("socialistes")) return "#ec4899";
  if (g.includes("gauche démocrate")) return "#f97316";
  if (g.includes("écologiste") || g.includes("ecologiste")) return "#10b981";
  if (g.includes("horizons")) return "#0ea5e9";
  if (g.includes("renaissance")) return "#4f46e5";
  if (g.includes("démocrate") || g.includes("democrate")) return "#22d3ee";
  if (g.includes("les républicains")) return "#0f766e";

  return colors.primary;
}

function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (
    parts[0].charAt(0).toUpperCase() +
    parts[parts.length - 1].charAt(0).toUpperCase()
  );
}

/* ---------- Styles ---------- */

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "700",
  },
  headerSubtitle: {
    color: colors.subtext,
    fontSize: 13,
    marginTop: 4,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  loadingText: {
    marginTop: 12,
    color: colors.subtext,
  },
  errorText: {
    color: colors.danger,
    textAlign: "center",
    fontSize: 14,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: theme.radius.lg,
    padding: 16,
    marginBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  sectionSubtitleSmall: {
    color: colors.subtext,
    fontSize: 12,
    marginBottom: 4,
  },

  /* KPIs lois */
  grid2: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  kpiBlock: {
    flex: 1,
    paddingVertical: 8,
  },
  kpiLabel: {
    color: colors.subtext,
    fontSize: 12,
  },
  kpiValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
    marginTop: 4,
  },

  emptyText: {
    color: colors.subtext,
    fontSize: 13,
    marginTop: 4,
  },

  /* Lois rows */
  loiRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    marginTop: 6,
  },
  loiTitre: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "500",
  },
  loiMeta: {
    color: colors.subtext,
    fontSize: 11,
    marginTop: 2,
  },
  loiChipsCol: {
    marginLeft: 8,
    alignItems: "flex-end",
  },
  loiChip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: colors.primarySoft,
    marginBottom: 4,
  },
  loiChipText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "500",
  },

  /* Députés rows */
  deputeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    marginTop: 6,
  },
  deputeLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 8,
  },
  deputeAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: "hidden",
    marginRight: 10,
  },
  deputeAvatarImg: {
    width: "100%",
    height: "100%",
    borderRadius: 18,
  },
  deputeAvatarFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  deputeAvatarInitials: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  deputeHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  groupDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  deputeNom: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "500",
  },
  deputeMeta: {
    color: colors.subtext,
    fontSize: 11,
    marginTop: 2,
  },

  deputeScoreCol: {
    width: 140,
  },
  deputeChipText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: "500",
    textAlign: "right",
    marginBottom: 4,
  },
  deputeBarTrack: {
    width: "100%",
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  deputeBarFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
});
