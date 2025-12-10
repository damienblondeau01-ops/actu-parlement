// app/scrutins/[id].tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState, useMemo } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { theme } from "../../lib/theme";
import {
  fetchScrutinAvecVotes,
  type ScrutinEnrichi,
  type VoteDeputeScrutin,
} from "../../lib/queries/scrutins";
import { supabase } from "../../lib/supabaseClient";
import DonutChart from "../../components/DonutChart";

const colors = theme.colors;

/* ===========================================================
   📌 Types locaux
=========================================================== */

type RouteParams = { id?: string };

type SyntheseVotes = {
  numero_scrutin: string;
  nb_pour: number;
  nb_contre: number;
  nb_abstention: number;
  nb_votes_total?: number | null;
};

type LoiResume = {
  loi_id: string;
  titre_loi: string | null;
  nb_scrutins_total: number | null;
  nb_articles: number | null;
  nb_amendements: number | null;
};

type TimelineItem = {
  numero_scrutin: string;
  date_scrutin: string | null;
  titre: string | null;
  objet: string | null;
  resultat: string | null;
  kind: string | null;
  article_ref: string | null;
};

type GroupedVotes = {
  groupe: string;
  pour: VoteDeputeScrutin[];
  contre: VoteDeputeScrutin[];
  abst: VoteDeputeScrutin[];
  nv: VoteDeputeScrutin[];
};

/* ===========================================================
   🟦 Mini Card Groupe (UI premium)
=========================================================== */

function GroupMiniCard(props: {
  groupe: string;
  pour: number;
  contre: number;
  abst: number;
  nv: number;
}) {
  const { groupe, pour, contre, abst, nv } = props;
  const total = pour + contre + abst + nv;
  const pPour = total ? Math.round((pour * 100) / total) : 0;
  const pContre = total ? Math.round((contre * 100) / total) : 0;
  const pAbst = total ? Math.round((abst * 100) / total) : 0;

  return (
    <View style={styles.miniCard}>
      <Text style={styles.miniGroupTitle} numberOfLines={1}>
        {groupe}
      </Text>
      <Text style={styles.miniStats}>
        🟩 {pour} · 🟥 {contre} · 🟨 {abst}
      </Text>
      <Text style={styles.miniTrend}>
        {pPour}% Pour · {pContre}% Contre · {pAbst}% Abst.
      </Text>
    </View>
  );
}

/* ===========================================================
   🟦 Composants UI simples
=========================================================== */

const Chip = ({ label }: { label: string }) => (
  <View style={styles.chip}>
    <Text style={styles.chipText}>{label}</Text>
  </View>
);

const Stat = (props: { label: string; value: number; color: string }) => {
  const { label, value, color } = props;
  return (
    <View style={styles.statBlock}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
};

/* ===========================================================
   🟦 Screen principal
=========================================================== */

export default function ScrutinDetailScreen() {
  const { id } = useLocalSearchParams<RouteParams>();
  const router = useRouter();

  const [scrutin, setScrutin] = useState<ScrutinEnrichi | null>(null);
  const [votes, setVotes] = useState<VoteDeputeScrutin[]>([]);
  const [syntheseVotes, setSyntheseVotes] = useState<SyntheseVotes | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const [loi, setLoi] = useState<LoiResume | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [loiLoading, setLoiLoading] = useState<boolean>(false);

  /* ===========================================================
     1️⃣ Load Scrutin + Votes + Synthèse
  ============================================================ */

  useEffect(() => {
    if (!id) {
      setError("Aucun numéro de scrutin fourni.");
      setLoading(false);
      return;
    }

    const numero = String(id);

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const {
          scrutin: scrutinData,
          votes: votesData,
          error: queryError,
        } = await fetchScrutinAvecVotes(numero);

        if (queryError || !scrutinData) {
          setError("Scrutin introuvable dans la base actuelle.");
          setScrutin(null);
          setVotes([]);
          setSyntheseVotes(null);
          setLoading(false);
          return;
        }

        setScrutin(scrutinData);
        setVotes(votesData ?? []);

        // Synthèse SQL (votes_par_scrutin_synthese)
        const { data: synthRows, error: synthError } = await supabase
          .from("votes_par_scrutin_synthese")
          .select("*")
          .eq("numero_scrutin", numero);

        if (synthError) {
          console.warn(
            "[SCRUTIN DETAIL] Erreur chargement synthèse (liste):",
            synthError
          );
        } else if (synthRows && synthRows.length > 0) {
          const row = synthRows[0] as SyntheseVotes;
          setSyntheseVotes(row);
        } else {
          setSyntheseVotes(null);
        }

        await loadLoiEtTimeline(numero);
        setLoading(false);
      } catch (e: any) {
        console.warn("[SCRUTIN DETAIL] Erreur inattendue:", e);
        setError(e?.message ?? "Erreur inconnue lors du chargement du scrutin.");
        setLoading(false);
      }
    };

    load();
  }, [id]);

  async function loadLoiEtTimeline(numero: string) {
    try {
      setLoiLoading(true);

      // Récupérer loi_id à partir du scrutin
      const { data: sd, error: sdError } = await supabase
        .from("scrutins_data")
        .select("loi_id")
        .eq("numero", numero)
        .maybeSingle();

      if (sdError) {
        console.warn("[SCRUTIN DETAIL] Erreur scrutins_data:", sdError);
        setLoi(null);
        setTimeline([]);
        setLoiLoading(false);
        return;
      }

      if (!sd?.loi_id) {
        setLoi(null);
        setTimeline([]);
        setLoiLoading(false);
        return;
      }

      const loiId = sd.loi_id as string;

      // Loi associée
      const { data: loiData, error: loiError } = await supabase
        .from("lois_app")
        .select(
          `
          loi_id,
          titre_loi,
          nb_scrutins_total,
          nb_articles,
          nb_amendements
        `
        )
        .eq("loi_id", loiId)
        .maybeSingle();

      if (loiError) {
        console.warn("[SCRUTIN DETAIL] Erreur lois_app:", loiError);
        setLoi(null);
      } else {
        setLoi((loiData || null) as LoiResume | null);
      }

      // Timeline de la loi
      const { data: scrs, error: scrError } = await supabase
        .from("scrutins_loi_enrichis")
        .select(
          `
          numero_scrutin,
          loi_id,
          date_scrutin,
          titre,
          objet,
          resultat,
          kind,
          article_ref
        `
        )
        .eq("loi_id", loiId)
        .order("date_scrutin", { ascending: true });

      if (scrError) {
        console.warn(
          "[SCRUTIN DETAIL] Erreur scrutins_loi_enrichis:",
          scrError
        );
        setTimeline([]);
      } else {
        const mapped: TimelineItem[] =
          scrs?.map((s: any) => ({
            numero_scrutin: s.numero_scrutin?.toString(),
            date_scrutin: s.date_scrutin,
            titre: s.titre,
            objet: s.objet,
            resultat: s.resultat,
            kind: s.kind,
            article_ref: s.article_ref,
          })) ?? [];
        setTimeline(mapped);
      }
    } catch (e) {
      console.warn("[SCRUTIN DETAIL] Erreur loi/timeline:", e);
      setLoi(null);
      setTimeline([]);
    } finally {
      setLoiLoading(false);
    }
  }

  /* ===========================================================
     2️⃣ Groupement des votes par groupe
  ============================================================ */

  const groupedVotes: GroupedVotes[] = useMemo(() => {
    if (!votes || votes.length === 0) return [];

    const groups: Record<string, GroupedVotes> = {};

    for (const v of votes) {
      const anyV = v as any;

      // Nom du groupe : on essaie plusieurs champs possibles
      const rawGroup =
        anyV.groupe ??
        anyV.groupeAbrev ??
        anyV.groupe_abrev ??
        anyV.groupe_libelle ??
        "Non renseigné";

      const gName =
        typeof rawGroup === "string" && rawGroup.trim() !== ""
          ? rawGroup
          : "Non renseigné";

      if (!groups[gName]) {
        groups[gName] = {
          groupe: gName,
          pour: [],
          contre: [],
          abst: [],
          nv: [],
        };
      }

      // Position du vote : on essaie plusieurs champs possibles
      const rawPosition =
        anyV.position ?? anyV.vote ?? anyV.sens_vote ?? anyV.voix ?? "";
      const p = String(rawPosition).toLowerCase();

      if (p.includes("pour")) {
        groups[gName].pour.push(v);
      } else if (p.includes("contre")) {
        groups[gName].contre.push(v);
      } else if (p.includes("abst")) {
        groups[gName].abst.push(v);
      } else {
        groups[gName].nv.push(v);
      }
    }

    return Object.values(groups);
  }, [votes]);

  /* ===========================================================
     3️⃣ Stats Calculées (pour/contre/abstention)
  ============================================================ */

  const nbPour: number =
    syntheseVotes?.nb_pour ?? scrutin?.nb_pour ?? 0;
  const nbContre: number =
    syntheseVotes?.nb_contre ?? scrutin?.nb_contre ?? 0;
  const nbAbst: number =
    syntheseVotes?.nb_abstention ?? scrutin?.nb_abstention ?? 0;

  const totalExpr: number = nbPour + nbContre + nbAbst;

  const pourPct = totalExpr > 0 ? Math.round((nbPour * 100) / totalExpr) : 0;
  const contrePct =
    totalExpr > 0 ? Math.round((nbContre * 100) / totalExpr) : 0;
  const abstPct =
    totalExpr > 0 ? Math.round((nbAbst * 100) / totalExpr) : 0;

  const titre: string =
    scrutin?.titre_scrutin ?? (id ? `Scrutin n°${id}` : "Détail du scrutin");

  /* ===========================================================
     4️⃣ Render loading / erreur
  ============================================================ */

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Chargement du scrutin…</Text>
      </SafeAreaView>
    );
  }

  if (error || !scrutin) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.errorText}>{error ?? "Scrutin introuvable."}</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backText}>← Retour</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  /* ===========================================================
     5️⃣ Render principal
  ============================================================ */

  return (
    <SafeAreaView style={styles.safe}>
      {/* HEADER */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={2}>
          {titre}
        </Text>
        <Text style={styles.headerSubtitle}>
          {scrutin.article_ref
            ? `Article ${scrutin.article_ref}`
            : "Scrutin parlementaire"}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* LOI ASSOCIÉE */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Loi associée</Text>

          {loiLoading && (
            <View style={styles.centerSmall}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.loadingText}>
                Chargement des informations de la loi…
              </Text>
            </View>
          )}

          {!loiLoading && !loi && (
            <Text style={styles.grey}>
              Ce scrutin n&apos;est pas encore relié à une loi.
            </Text>
          )}

          {!loiLoading && loi && (
            <>
              <Text style={styles.bigText}>
                {loi.titre_loi ?? "Titre non disponible"}
              </Text>
              <Text style={styles.grey}>Loi {loi.loi_id}</Text>

              <View style={styles.row}>
                <Chip
                  label={`Scrutins ${
                    loi.nb_scrutins_total ?? "—"
                  }`}
                />
                <Chip
                  label={`Articles ${loi.nb_articles ?? "—"}`}
                />
                <Chip
                  label={`Amendements ${
                    loi.nb_amendements ?? "—"
                  }`}
                />
              </View>

              <Pressable
                style={styles.loiButton}
                onPress={() => router.push(`/lois/${loi.loi_id}`)}
              >
                <Text style={styles.loiButtonText}>
                  Ouvrir la fiche loi →
                </Text>
              </Pressable>
            </>
          )}
        </View>

        {/* SYNTHÈSE DU VOTE */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Synthèse du vote</Text>

          <View style={styles.row}>
            <Stat label="Pour" value={nbPour} color="#16a34a" />
            <Stat label="Contre" value={nbContre} color="#dc2626" />
            <Stat label="Abstention" value={nbAbst} color="#eab308" />
          </View>

          <Text style={[styles.grey, { marginTop: 6 }]}>
            Pour {pourPct}% · Contre {contrePct}% · Abstention {abstPct}%
          </Text>

          <View style={styles.voteBar}>
            <View
              style={{
                flex: nbPour,
                backgroundColor: "#16a34a",
              }}
            />
            <View
              style={{
                flex: nbContre,
                backgroundColor: "#dc2626",
              }}
            />
            <View
              style={{
                flex: nbAbst,
                backgroundColor: "#eab308",
              }}
            />
          </View>
        </View>

        {/* DONUT CHART */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Répartition visuelle</Text>
          <DonutChart
            pour={nbPour}
            contre={nbContre}
            abstention={nbAbst}
          />
        </View>

        {/* TIMELINE DE LA LOI */}
        {loi && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Parcours de la loi</Text>
            {timeline.length === 0 && (
              <Text style={styles.grey}>
                Aucun autre scrutin enrichi pour cette loi.
              </Text>
            )}
            {timeline.map((item: TimelineItem) => {
              const isCurrent =
                id && String(item.numero_scrutin) === String(id);
              return (
                <Pressable
                  key={item.numero_scrutin}
                  disabled={!!isCurrent}
                  onPress={() =>
                    router.push(`/scrutins/${item.numero_scrutin}`)
                  }
                  style={[
                    styles.timelineItem,
                    isCurrent ? styles.timelineItemActive : null,
                  ]}
                >
                  <View style={styles.timelineBulletColumn}>
                    <View
                      style={[
                        styles.timelineBullet,
                        isCurrent && styles.timelineBulletActive,
                      ]}
                    />
                    <View style={styles.timelineLine} />
                  </View>
                  <View style={styles.timelineContent}>
                    <View style={styles.timelineHeaderRow}>
                      <Text
                        style={[
                          styles.timelineNumero,
                          isCurrent && styles.timelineNumeroActive,
                        ]}
                      >
                        Scrutin n°{item.numero_scrutin}
                      </Text>
                      {item.date_scrutin && (
                        <Text style={styles.timelineDate}>
                          {new Date(
                            item.date_scrutin
                          ).toLocaleDateString("fr-FR")}
                        </Text>
                      )}
                    </View>
                    <Text
                      style={[
                        styles.timelineTitre,
                        isCurrent && styles.timelineTitreActive,
                      ]}
                      numberOfLines={2}
                    >
                      {item.titre ||
                        item.objet ||
                        "Scrutin parlementaire"}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* 🟦 Synthèse par groupe premium */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Synthèse par groupe</Text>

          {groupedVotes.length === 0 && (
            <Text style={styles.grey}>
              Aucun vote disponible pour ce scrutin.
            </Text>
          )}

          <View style={styles.miniGrid}>
            {groupedVotes.map((g: GroupedVotes) => (
              <GroupMiniCard
                key={g.groupe}
                groupe={g.groupe}
                pour={g.pour.length}
                contre={g.contre.length}
                abst={g.abst.length}
                nv={g.nv.length}
              />
            ))}
          </View>

          <Text style={[styles.sectionSubtitle, { marginTop: 12 }]}>
            Détails complets par groupe
          </Text>

          {groupedVotes.map((g: GroupedVotes) => {
            const total =
              g.pour.length +
              g.contre.length +
              g.abst.length +
              g.nv.length;
            return (
              <View key={g.groupe} style={styles.groupBlock}>
                <Text style={styles.groupTitle}>{g.groupe}</Text>
                <Text style={styles.grey}>
                  {total} député
                  {total > 1 ? "s" : ""} — Pour {g.pour.length}, Contre{" "}
                  {g.contre.length}, Abstention {g.abst.length}, Non
                  votant {g.nv.length}
                </Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ===========================================================
   🎨 Styles
=========================================================== */

const styles = StyleSheet.create({
  /* LAYOUT */
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: colors.background,
  },
  loadingText: {
    marginTop: 10,
    color: colors.subtext,
    fontSize: 13,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    textAlign: "center",
    marginBottom: 12,
  },
  backText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "600",
  },

  /* HEADER */
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  backBtn: {
    marginBottom: 6,
  },
  backIcon: {
    color: colors.subtext,
    fontSize: 20,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "600",
  },
  headerSubtitle: {
    color: colors.subtext,
    fontSize: 13,
    marginTop: 2,
  },

  /* CONTENT */
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  centerSmall: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 4,
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
    marginBottom: 8,
  },
  sectionSubtitle: {
    color: colors.subtext,
    fontSize: 13,
    fontWeight: "400",
  },
  grey: {
    color: colors.subtext,
    fontSize: 12,
  },
  bigText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
  },

  /* CHIPS / BOUTONS LOI */
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.surface,
  },
  chipText: {
    color: colors.subtext,
    fontSize: 11,
  },
  loiButton: {
    marginTop: 10,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.primarySoft,
  },
  loiButtonText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "600",
  },

  /* STATS */
  statBlock: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    fontSize: 16,
    fontWeight: "700",
  },
  statLabel: {
    fontSize: 12,
    color: colors.subtext,
  },
  voteBar: {
    flexDirection: "row",
    height: 8,
    borderRadius: 999,
    overflow: "hidden",
    marginTop: 10,
  },

  /* TIMELINE */
  timelineItem: {
    flexDirection: "row",
    marginBottom: 10,
  },
  timelineItemActive: {
    backgroundColor: "rgba(79,70,229,0.12)",
    borderRadius: 12,
    padding: 8,
  },
  timelineBulletColumn: {
    alignItems: "center",
    marginRight: 8,
  },
  timelineBullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.subtext,
    marginTop: 4,
  },
  timelineBulletActive: {
    backgroundColor: colors.primary,
  },
  timelineLine: {
    flex: 1,
    width: 2,
    backgroundColor: colors.border,
    marginTop: 2,
  },
  timelineContent: {
    flex: 1,
  },
  timelineHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  timelineNumero: {
    color: colors.subtext,
    fontSize: 12,
    fontWeight: "500",
  },
  timelineNumeroActive: {
    color: colors.primary,
  },
  timelineDate: {
    color: colors.subtext,
    fontSize: 11,
  },
  timelineTitre: {
    color: colors.text,
    fontSize: 13,
    marginTop: 2,
    marginBottom: 4,
  },
  timelineTitreActive: {
    fontWeight: "600",
  },

  /* GROUPES */
  groupBlock: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  groupTitle: {
    color: colors.text,
    fontWeight: "600",
    marginBottom: 2,
  },

  /* MINI CARDS PREMIUM UI */
  miniGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12,
  },
  miniCard: {
    width: "47%",
    backgroundColor: colors.surface,
    padding: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: 10,
  },
  miniGroupTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 4,
  },
  miniStats: {
    fontSize: 12,
    color: colors.subtext,
  },
  miniTrend: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "600",
    color: colors.primary,
  },
});
