// app/(tabs)/lois/[id].tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../../lib/supabaseClient";
import { theme } from "../../../lib/theme";

const colors = theme.colors;

type RouteParams = {
  id?: string; // loi_id
};

type Loi = {
  loi_id: string;
  titre_loi: string | null;
  nb_scrutins_total: number | null;
  nb_articles: number | null;
  nb_amendements: number | null;
  resume_court?: string | null;
};

type GroupeStatsLoi = {
  loi_id: string | null;
  legislature: number | null;
  groupe: string | null;
  nb_votes: number | null;
  nb_pour: number | null;
  nb_contre: number | null;
  nb_abstention: number | null;
  nb_nv: number | null;
  nb_scrutins: number | null;
  pct_pour: number | null;
  pct_contre: number | null;
  pct_abstention: number | null;
  color_hex: string | null;
};

type ScrutinTimelineItem = {
  numero_scrutin: string;
  loi_id: string | null;
  date_scrutin: string | null;
  titre: string | null;
  objet: string | null;
  resultat: string | null;
  kind: string | null;
  article_ref: string | null;
  legislature?: number | null;
};

type VotesParLoi = {
  nb_pour: number | null;
  nb_contre: number | null;
  nb_abstention: number | null;
  nb_non_votant: number | null;
  nb_total_votes: number | null;
  nb_exprimes: number | null;
};

type LoiTexte = {
  loi_id: string;
  source: string | null;
  url_dossier: string | null;
  url_texte_integral: string | null;
  texte_integral_clean: string | null;
  texte_integral_brut?: string | null;
};

export default function LoiDetailScreen() {
  const { id } = useLocalSearchParams<RouteParams>();
  const router = useRouter();

  const [loi, setLoi] = useState<Loi | null>(null);
  const [scrutins, setScrutins] = useState<ScrutinTimelineItem[]>([]);
  const [loiTexte, setLoiTexte] = useState<LoiTexte | null>(null);
  const [votes, setVotes] = useState<VotesParLoi | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingVotes, setLoadingVotes] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [groupStats, setGroupStats] = useState<GroupeStatsLoi[]>([]);
  const [groupStatsLoading, setGroupStatsLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!id) {
      setError("Aucun identifiant de loi fourni.");
      setLoading(false);
      setLoadingVotes(false);
      setGroupStatsLoading(false);
      return;
    }

    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setLoadingVotes(true);
      setGroupStatsLoading(true);
      setError(null);

      try {
        const loiId = String(id);

        // 1️⃣ Charger la loi depuis lois_app (vue agrégée)
        const { data: loiRow, error: loiError } = await supabase
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
          throw loiError;
        }

        if (!loiRow) {
          throw new Error(
            `Aucune loi trouvée pour l'identifiant ${loiId} dans lois_app.`
          );
        }

        // 2️⃣ Timeline des scrutins via la vue scrutins_par_loi
        const { data: scrutinsRows, error: scrError } = await supabase
          .from("scrutins_par_loi")
          .select(
            `
            numero_scrutin:numero,
            loi_id,
            date_scrutin,
            titre,
            objet,
            resultat,
            kind,
            article_ref,
            legislature
          `
          )
          .eq("loi_id", loiId)
          .order("date_scrutin", { ascending: true });

        if (scrError) {
          throw scrError;
        }

        // 3️⃣ Synthèse des votes (vue votes_par_loi)
        const { data: votesRows, error: votesError } = await supabase
          .from("votes_par_loi")
          .select(
            `
            nb_pour,
            nb_contre,
            nb_abstention,
            nb_non_votant,
            nb_total_votes,
            nb_exprimes
          `
          )
          .eq("loi_id", loiId);

        if (votesError) {
          console.warn(
            "[LOI DETAIL] Erreur chargement votes_par_loi",
            votesError
          );
        }

        // 4️⃣ Texte de la loi (lois_textes)
        const { data: texteRow, error: texteError } = await supabase
          .from("lois_textes")
          .select(
            `
            loi_id,
            source,
            url_dossier,
            url_texte_integral,
            texte_integral_clean,
            texte_integral_brut
          `
          )
          .eq("loi_id", loiId)
          .maybeSingle();

        if (texteError) {
          console.warn("[LOI DETAIL] Erreur chargement lois_textes", texteError);
        }

        // 5️⃣ Stats par groupe pour cette loi (stats_groupes_par_loi)
        const { data: statsRows, error: statsError } = await supabase
          .from("stats_groupes_par_loi")
          .select(
            `
            loi_id,
            legislature,
            groupe,
            nb_votes,
            nb_pour,
            nb_contre,
            nb_abstention,
            nb_nv,
            nb_scrutins,
            pct_pour,
            pct_contre,
            pct_abstention,
            color_hex
          `
          )
          .eq("loi_id", loiId)
          .order("nb_votes", { ascending: false });

        if (statsError) {
          console.warn(
            "[LOI DETAIL] Erreur stats_groupes_par_loi =",
            statsError
          );
        }

        if (cancelled) return;

        setLoi(loiRow as Loi);

        setScrutins(
          (scrutinsRows || []).map((s: any) => ({
            numero_scrutin: s.numero_scrutin?.toString(),
            loi_id: s.loi_id,
            date_scrutin: s.date_scrutin,
            titre: s.titre,
            objet: s.objet,
            resultat: s.resultat,
            kind: s.kind,
            article_ref: s.article_ref,
            legislature: s.legislature ?? null,
          }))
        );

        setVotes(
          votesRows && votesRows.length > 0
            ? (votesRows[0] as VotesParLoi)
            : null
        );

        setLoiTexte((texteRow || null) as LoiTexte | null);
        setGroupStats((statsRows as GroupeStatsLoi[]) ?? []);
        setLoading(false);
        setLoadingVotes(false);
        setGroupStatsLoading(false);
      } catch (e: any) {
        console.warn("[LOI DETAIL] Erreur chargement", e);
        if (!cancelled) {
          setError(e?.message ?? "Erreur inconnue");
          setLoi(null);
          setScrutins([]);
          setVotes(null);
          setLoiTexte(null);
          setGroupStats([]);
          setLoading(false);
          setLoadingVotes(false);
          setGroupStatsLoading(false);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [id]);

  // --- Stats rapides sur les scrutins de la loi (à partir de scrutins_par_loi) ---
  const { nbScrutinsArticle, nbScrutinsAmendement, nbScrutinsAutres } =
    useMemo(() => {
      const nbArticle = scrutins.filter((s) => s.kind === "article").length;
      const nbAmendement = scrutins.filter(
        (s) => s.kind === "amendement"
      ).length;
      const nbAutres = scrutins.filter(
        (s) => s.kind !== "article" && s.kind !== "amendement"
      ).length;

      return {
        nbScrutinsArticle: nbArticle,
        nbScrutinsAmendement: nbAmendement,
        nbScrutinsAutres: nbAutres,
      };
    }, [scrutins]);

  const dateDebutParcours =
    scrutins.length > 0 ? scrutins[0].date_scrutin : null;
  const dateFinParcours =
    scrutins.length > 0 ? scrutins[scrutins.length - 1].date_scrutin : null;

  const titre = loi?.titre_loi ?? (id ? `Loi ${id}` : "Détail de la loi");

  // Texte à afficher (on privilégie la version nettoyée)
  const texteExtrait = useMemo(() => {
    const raw =
      loiTexte?.texte_integral_clean || loiTexte?.texte_integral_brut || null;
    if (!raw) return null;
    if (raw.length <= 400) return raw;
    return raw.slice(0, 400) + "…";
  }, [loiTexte]);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Retour</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={2}>
          {titre}
        </Text>
        {id && <Text style={styles.headerSubtitle}>Loi {id}</Text>}
      </View>

      {loading && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Chargement de la loi…</Text>
        </View>
      )}

      {!loading && error && (
        <View style={styles.center}>
          <Text style={styles.errorText}>
            ⚠ Erreur lors du chargement de la loi {"\n"}
            {error}
          </Text>
        </View>
      )}

      {!loading && !error && !loi && (
        <View style={styles.center}>
          <Text style={styles.errorText}>
            Aucune information disponible pour cette loi.
          </Text>
        </View>
      )}

      {!loading && !error && loi && (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
        >
          {/* 🧾 Résumé loi */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Résumé de la loi</Text>
            <Text style={styles.loiIdLabel}>Loi {loi.loi_id}</Text>

            {loi.titre_loi && (
              <Text style={styles.loiTitre}>{loi.titre_loi}</Text>
            )}

            {loi.resume_court && (
              <Text style={styles.loiResume}>{loi.resume_court}</Text>
            )}

            {/* Stats principales */}
            <View style={styles.loiStatsRow}>
              <View style={styles.loiStat}>
                <Text style={styles.loiStatLabel}>Scrutins</Text>
                <Text style={styles.loiStatValue}>
                  {loi.nb_scrutins_total ?? scrutins.length}
                </Text>
              </View>
              <View style={styles.loiStat}>
                <Text style={styles.loiStatLabel}>Articles</Text>
                <Text style={styles.loiStatValue}>
                  {loi.nb_articles ?? nbScrutinsArticle}
                </Text>
              </View>
              <View style={styles.loiStat}>
                <Text style={styles.loiStatLabel}>Amendements</Text>
                <Text style={styles.loiStatValue}>
                  {loi.nb_amendements ?? nbScrutinsAmendement}
                </Text>
              </View>
            </View>

            {/* 🟩🟥 Synthèse des votes (votes_par_loi) */}
            {loadingVotes ? (
              <View style={{ marginTop: 16 }}>
                <Text style={styles.sectionTitle}>Synthèse des votes</Text>
                <Text style={styles.loiResume}>
                  Chargement des données de vote…
                </Text>
              </View>
            ) : votes && votes.nb_total_votes ? (
              <View style={{ marginTop: 16 }}>
                <Text style={styles.sectionTitle}>Synthèse des votes</Text>
                <Text style={styles.loiResume}>
                  {votes.nb_exprimes} votes exprimés sur{" "}
                  {votes.nb_total_votes} au total.
                </Text>

                <View style={styles.voteRow}>
                  <Text style={[styles.voteLabel, styles.votePour]}>Pour</Text>
                  <Text style={styles.voteValue}>{votes.nb_pour}</Text>
                </View>

                <View style={styles.voteRow}>
                  <Text style={[styles.voteLabel, styles.voteContre]}>
                    Contre
                  </Text>
                  <Text style={styles.voteValue}>{votes.nb_contre}</Text>
                </View>

                <View style={styles.voteRow}>
                  <Text style={[styles.voteLabel, styles.voteAbstention]}>
                    Abstention
                  </Text>
                  <Text style={styles.voteValue}>
                    {votes.nb_abstention}
                  </Text>
                </View>

                <View style={styles.voteRow}>
                  <Text style={[styles.voteLabel, styles.voteNonVotant]}>
                    Non votant
                  </Text>
                  <Text style={styles.voteValue}>
                    {votes.nb_non_votant}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={{ marginTop: 16 }}>
                <Text style={styles.sectionTitle}>Synthèse des votes</Text>
                <Text style={styles.loiResume}>
                  Aucun vote trouvé pour cette loi dans les données OpenData.
                </Text>
              </View>
            )}

            {/* Stats dérivées à partir des scrutins */}
            {scrutins.length > 0 && (
              <View style={[styles.loiStatsRow, { marginTop: 12 }]}>
                <View style={styles.loiStat}>
                  <Text style={styles.loiStatLabel}>Scrutins article</Text>
                  <Text style={styles.loiStatValue}>
                    {nbScrutinsArticle}
                  </Text>
                </View>
                <View style={styles.loiStat}>
                  <Text style={styles.loiStatLabel}>Scrutins amendement</Text>
                  <Text style={styles.loiStatValue}>
                    {nbScrutinsAmendement}
                  </Text>
                </View>
                <View style={styles.loiStat}>
                  <Text style={styles.loiStatLabel}>Autres scrutins</Text>
                  <Text style={styles.loiStatValue}>
                    {nbScrutinsAutres}
                  </Text>
                </View>
              </View>
            )}

            {scrutins.length > 0 && (
              <Text style={[styles.loiResume, { marginTop: 10 }]}>
                Parcours suivi du{" "}
                {dateDebutParcours
                  ? new Date(dateDebutParcours).toLocaleDateString("fr-FR")
                  : "?"}{" "}
                au{" "}
                {dateFinParcours
                  ? new Date(dateFinParcours).toLocaleDateString("fr-FR")
                  : "?"}
                .
              </Text>
            )}
          </View>

          {/* 🧮 Stats par groupe pour cette loi */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.sectionTitle}>Comportement des groupes</Text>
              <Pressable onPress={() => router.push("/stats-groupes")}>
                <Text style={styles.linkText}>Voir toutes les stats →</Text>
              </Pressable>
            </View>

            {groupStatsLoading && (
              <View style={styles.centerSmall}>
                <ActivityIndicator
                  size="small"
                  color={theme.colors.primary}
                />
                <Text style={styles.grey}>
                  Chargement des statistiques par groupe…
                </Text>
              </View>
            )}

            {!groupStatsLoading && groupStats.length === 0 && (
              <Text style={styles.grey}>
                Pas encore de statistiques agrégées pour cette loi.
              </Text>
            )}

            {!groupStatsLoading &&
              groupStats.map((g) => {
                const nomGroupe = g.groupe ?? "Non renseigné";
                const nbVotes = g.nb_votes ?? 0;
                const pour = g.nb_pour ?? 0;
                const contre = g.nb_contre ?? 0;
                const abst = g.nb_abstention ?? 0;

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

                return (
                  <View
                    key={`${nomGroupe}-${g.legislature ?? 0}`}
                    style={styles.groupCard}
                  >
                    <View style={styles.groupCardHeader}>
                      <View style={styles.groupColorDotWrapper}>
                        <View
                          style={[
                            styles.groupColorDot,
                            g.color_hex
                              ? { backgroundColor: g.color_hex }
                              : { backgroundColor: "#64748b" },
                          ]}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.groupName} numberOfLines={1}>
                          {nomGroupe}
                        </Text>
                        <Text style={styles.groupMeta}>
                          {nbVotes} vote
                          {nbVotes > 1 ? "s" : ""} sur cette loi
                        </Text>
                      </View>
                    </View>

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
                      <View
                        style={{ flex: pour, backgroundColor: "#16a34a" }}
                      />
                      <View
                        style={{ flex: contre, backgroundColor: "#dc2626" }}
                      />
                      <View
                        style={{ flex: abst, backgroundColor: "#eab308" }}
                      />
                    </View>
                  </View>
                );
              })}
          </View>

          {/* 📘 Texte de la loi */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Texte de la loi</Text>

            {!loiTexte && (
              <Text style={styles.loiResume}>
                Le texte intégral de cette loi n&apos;est pas encore disponible
                dans l&apos;application.
              </Text>
            )}

            {loiTexte && (
              <>
                {loiTexte.source && (
                  <Text style={styles.sourceLabel}>
                    Source : {loiTexte.source}
                  </Text>
                )}

                <View style={styles.buttonsRow}>
                  {loiTexte.url_dossier && (
                    <Pressable
                      style={styles.outlineButton}
                      onPress={() => Linking.openURL(loiTexte.url_dossier!)}
                    >
                      <Text style={styles.outlineButtonText}>
                        Ouvrir le dossier AN
                      </Text>
                    </Pressable>
                  )}
                  {loiTexte.url_texte_integral && (
                    <Pressable
                      style={styles.filledButton}
                      onPress={() =>
                        Linking.openURL(loiTexte.url_texte_integral!)
                      }
                    >
                      <Text style={styles.filledButtonText}>
                        Voir le texte intégral
                      </Text>
                    </Pressable>
                  )}
                </View>

                {texteExtrait && (
                  <>
                    <Text style={styles.texteExtrait} numberOfLines={6}>
                      {texteExtrait}
                    </Text>
                    <Text style={styles.moreHint}>
                      (Extrait automatique du texte — ouverture complète via
                      les liens ci-dessus.)
                    </Text>
                  </>
                )}
              </>
            )}
          </View>

          {/* ⏱ Timeline des scrutins */}
          <View style={styles.card}>
            <View style={styles.timelineHeader}>
              <Text style={styles.sectionTitle}>Parcours de la loi</Text>
              <Text style={styles.timelineCount}>
                {scrutins.length} scrutin
                {scrutins.length > 1 ? "s" : ""}
              </Text>
            </View>

            {scrutins.length === 0 && (
              <Text style={styles.noScrutinsText}>
                Aucun scrutin n&apos;est encore associé à cette loi.
              </Text>
            )}

            {scrutins.map((item, index) => {
              const isLast = index === scrutins.length - 1;
              const label =
                item.titre && item.objet
                  ? `${item.titre} — ${item.objet}`
                  : item.titre || item.objet || "Scrutin parlementaire";

              return (
                <Pressable
                  key={item.numero_scrutin}
                  onPress={() =>
                    router.push(`/scrutins/${item.numero_scrutin}`)
                  }
                  style={styles.timelineItem}
                >
                  {/* Colonne gauche : dot + ligne */}
                  <View style={styles.timelineBulletColumn}>
                    <View style={styles.timelineBulletOuter}>
                      <View style={styles.timelineBulletInner} />
                    </View>
                    {!isLast && <View style={styles.timelineLine} />}
                  </View>

                  {/* Contenu */}
                  <View style={styles.timelineContent}>
                    <View style={styles.timelineHeaderRow}>
                      <Text style={styles.timelineNumero}>
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

                    <Text style={styles.timelineTitre} numberOfLines={2}>
                      {label}
                    </Text>

                    <View style={styles.timelineChipsRow}>
                      {/* Type de scrutin */}
                      {item.kind === "article" && (
                        <View style={styles.chip}>
                          <Text style={styles.chipText}>
                            Article {item.article_ref ?? ""}
                          </Text>
                        </View>
                      )}
                      {item.kind === "amendement" && (
                        <View style={styles.chip}>
                          <Text style={styles.chipText}>
                            Amendement {item.article_ref ?? ""}
                          </Text>
                        </View>
                      )}
                      {item.kind !== "article" &&
                        item.kind !== "amendement" &&
                        item.kind && (
                          <View style={styles.chipMuted}>
                            <Text style={styles.chipMutedText}>
                              {item.kind}
                            </Text>
                          </View>
                        )}

                      {/* Résultat */}
                      {item.resultat && (
                        <View style={styles.chipResult}>
                          <Text style={styles.chipResultText}>
                            {item.resultat}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
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
  backBtn: {
    marginBottom: 6,
  },
  backText: {
    color: colors.subtext,
    fontSize: 14,
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
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

  /* Résumé loi */
  loiIdLabel: {
    color: colors.subtext,
    fontSize: 12,
    marginBottom: 4,
  },
  loiTitre: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 8,
  },
  loiResume: {
    color: colors.subtext,
    fontSize: 13,
    marginTop: 4,
    marginBottom: 8,
  },
  loiStatsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  loiStat: {
    alignItems: "center",
    flex: 1,
  },
  loiStatLabel: {
    color: colors.subtext,
    fontSize: 12,
  },
  loiStatValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
    marginTop: 4,
  },

  /* Synthèse des votes (votes_par_loi) */
  voteRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
  },
  voteLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.subtext,
  },
  voteValue: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  votePour: {
    color: "#4ade80", // vert
  },
  voteContre: {
    color: "#f97373", // rouge
  },
  voteAbstention: {
    color: "#facc15", // jaune
  },
  voteNonVotant: {
    color: "#9ca3af", // gris
  },

  /* Stats par groupe */
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  linkText: {
    fontSize: 12,
    color: theme.colors.primary,
    fontWeight: "600",
  },
  centerSmall: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 4,
  },
  grey: {
    fontSize: 12,
    color: theme.colors.subtext,
  },
  groupCard: {
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  groupCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  groupColorDotWrapper: {
    marginRight: 8,
  },
  groupColorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  groupName: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.text,
  },
  groupMeta: {
    fontSize: 11,
    color: theme.colors.subtext,
    marginTop: 2,
  },
  barLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
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

  /* Texte de la loi */
  sourceLabel: {
    color: colors.subtext,
    fontSize: 12,
    marginBottom: 8,
  },
  buttonsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  outlineButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  outlineButtonText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "600",
  },
  filledButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.primarySoft ?? colors.primary,
  },
  filledButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  texteExtrait: {
    marginTop: 8,
    fontSize: 13,
    color: colors.text,
  },
  moreHint: {
    marginTop: 4,
    fontSize: 11,
    color: colors.subtext,
  },

  /* Timeline */
  timelineHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  timelineCount: {
    color: colors.subtext,
    fontSize: 12,
  },
  noScrutinsText: {
    color: colors.subtext,
    fontSize: 13,
    marginTop: 4,
  },
  timelineItem: {
    flexDirection: "row",
    paddingVertical: 10,
  },
  timelineBulletColumn: {
    alignItems: "center",
    marginRight: 10,
  },
  timelineBulletOuter: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.primarySoft ?? "#4f46e5",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  timelineBulletInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
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
  timelineChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 4,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.surface,
    marginRight: 6,
    marginTop: 4,
  },
  chipText: {
    color: colors.subtext,
    fontSize: 11,
  },
  chipMuted: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(148,163,184,0.16)",
    marginRight: 6,
    marginTop: 4,
  },
  chipMutedText: {
    color: colors.subtext,
    fontSize: 11,
  },
  chipResult: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.primarySoft ?? "#1f2937",
    marginRight: 6,
    marginTop: 4,
  },
  chipResultText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "600",
  },
});
