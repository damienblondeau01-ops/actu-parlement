// app/(tabs)/lois/[id].tsx
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  ErrorView,
  LoadingView,
  ScreenContainer,
} from "../../../lib/parlement-common";
import { supabase } from "../../../lib/supabaseClient";
import { theme } from "../../../lib/theme";
import { Depute, Scrutin, VoteDepute } from "../../../lib/types";

/* ---------- Types locaux ---------- */

type VoteRow = VoteDepute & {
  deputy?: Depute;
};

type GroupAgg = {
  groupLabel: string;
  pour: number;
  contre: number;
  abstention: number;
  total: number;
};

type TabKey = "texte" | "points" | "votes";

/* ---------- Helpers ---------- */

const getLawTitle = (law: Scrutin | null): string => {
  if (!law) return "Loi / scrutin";
  const anyLaw = law as any;
  return anyLaw.titre || anyLaw.titre_loi || anyLaw.objet || "Loi / scrutin";
};

const getLawDate = (law: Scrutin | null): string => {
  if (!law) return "Date non renseignée";
  const anyLaw = law as any;
  return (
    anyLaw.date_scrutin ||
    anyLaw.date_vote ||
    anyLaw.date ||
    "Date non renseignée"
  );
};

const getDeputyName = (d?: Depute): string => {
  if (!d) return "Député inconnu";
  return (
    (d.nomcomplet as any) ||
    (d.nomComplet as any) ||
    `${d.prenom ?? ""} ${d.nom ?? ""}`.trim() ||
    "Député sans nom"
  );
};

const getDeputyGroupLabel = (d?: Depute): string => {
  if (!d) return "Sans groupe";
  const abrev = d.groupeAbrev?.trim() || "";
  const full = d.groupe?.trim() || "";
  if (!abrev && !full) return "Sans groupe";
  if (abrev && full && abrev !== full) return `${abrev} • ${full}`;
  return abrev || full;
};

/* ---------- Écran ---------- */

export default function LawDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [law, setLaw] = useState<Scrutin | null>(null);
  const [votes, setVotes] = useState<VoteRow[]>([]);
  const [deputiesByRowId, setDeputiesByRowId] = useState<Record<number, Depute>>(
    {}
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("texte");

  /* ----- Chargement données ----- */

  useEffect(() => {
    if (!id) return;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        // 1️⃣ Scrutin
        const { data: lawData, error: lawError } = await supabase
          .from("scrutins")
          .select("*")
          .eq("id", id)
          .maybeSingle();

        if (lawError) {
          console.error("Erreur chargement scrutin :", lawError);
          setError("Impossible de charger cette loi / ce scrutin.");
          setLoading(false);
          return;
        }
        if (!lawData) {
          setError("Scrutin introuvable.");
          setLoading(false);
          return;
        }
        setLaw(lawData as Scrutin);

        // 2️⃣ Votes
        const { data: votesData, error: votesError } = await supabase
          .from("votes_deputes")
          .select("*")
          .eq("scrutin_id", id);

        if (votesError) {
          console.error("Erreur chargement votes :", votesError);
          setError("Impossible de charger les votes pour ce scrutin.");
          setLoading(false);
          return;
        }

        const votesRows = (votesData || []) as VoteRow[];
        setVotes(votesRows);

        // 3️⃣ Députés concernés
        const rowIds = Array.from(
          new Set(
            votesRows
              .map((v) => v.depute_row_id)
              .filter((x): x is number => typeof x === "number")
          )
        );

        if (rowIds.length === 0) {
          setDeputiesByRowId({});
          setLoading(false);
          return;
        }

        const { data: depsData, error: depsError } = await supabase
          .from("deputes_officiels")
          .select(
            `
            row_id,
            id_an,
            id,
            nomcomplet,
            nomComplet,
            prenom,
            nom,
            groupe,
            groupeAbrev,
            departementNom,
            departementCode,
            circo
          `
          )
          .in("row_id", rowIds);

        if (depsError) {
          console.error(
            "Erreur chargement députés liés au scrutin :",
            depsError
          );
          setDeputiesByRowId({});
          setLoading(false);
          return;
        }

        const map: Record<number, Depute> = {};
        (depsData || []).forEach((d: any) => {
          if (typeof d.row_id === "number") {
            map[d.row_id] = d as Depute;
          }
        });

        setDeputiesByRowId(map);
      } catch (e) {
        console.error("Erreur inattendue LawDetailScreen :", e);
        setError("Une erreur inattendue est survenue.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id]);

  /* ----- Enrichissement + stats ----- */

  const enrichedVotes: VoteRow[] = useMemo(
    () =>
      votes.map((v) => ({
        ...v,
        deputy:
          typeof v.depute_row_id === "number"
            ? deputiesByRowId[v.depute_row_id]
            : undefined,
      })),
    [votes, deputiesByRowId]
  );

  const globalStats = useMemo(() => {
    let pour = 0;
    let contre = 0;
    let abstention = 0;

    enrichedVotes.forEach((v) => {
      const vote = (v.vote || "").toLowerCase();
      if (vote === "pour") pour += 1;
      else if (vote === "contre") contre += 1;
      else if (vote === "abstention") abstention += 1;
    });

    const total = pour + contre + abstention;
    const pct = (count: number) =>
      total > 0 ? Math.round((count / total) * 100) : 0;

    return {
      pour,
      contre,
      abstention,
      total,
      pctPour: pct(pour),
      pctContre: pct(contre),
      pctAbst: pct(abstention),
    };
  }, [enrichedVotes]);

  const groupsAgg: GroupAgg[] = useMemo(() => {
    const map = new Map<string, GroupAgg>();

    enrichedVotes.forEach((v) => {
      const label = getDeputyGroupLabel(v.deputy);
      let agg = map.get(label);
      if (!agg) {
        agg = {
          groupLabel: label,
          pour: 0,
          contre: 0,
          abstention: 0,
          total: 0,
        };
        map.set(label, agg);
      }
      const vote = (v.vote || "").toLowerCase();
      if (vote === "pour") agg.pour += 1;
      else if (vote === "contre") agg.contre += 1;
      else if (vote === "abstention") agg.abstention += 1;
      agg.total += 1;
    });

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [enrichedVotes]);

  /* ----- États de chargement / erreur ----- */

  if (loading) {
    return <LoadingView message="Chargement du scrutin et des votes..." />;
  }
  if (error || !law) {
    return <ErrorView message={error ?? "Scrutin introuvable."} />;
  }

  /* ----- Données d’affichage ----- */

  const title = getLawTitle(law);
  const dateLabel = getLawDate(law);
  const resultat = (law as any).resultat || "Résultat non renseigné";

  /* ----- Rendu ----- */

  return (
    <ScreenContainer>
      {/* Header compact : retour + infos scrutin */}
      <View style={styles.compactHeader}>
        <View style={styles.compactTopRow}>
          <Pressable style={styles.backRow} onPress={() => router.back()}>
            <Ionicons
              name="chevron-back"
              size={18}
              color={theme.colors.primary}
            />
            <Text style={styles.backText}>Retour</Text>
          </Pressable>

          <Text style={styles.compactTitle} numberOfLines={3}>
            {title}
          </Text>
        </View>

        <View style={styles.compactMetaRow}>
          {(law as any).numero != null && (
            <>
              <Text style={styles.compactMetaText}>
                Scrutin n°{(law as any).numero}
              </Text>
              <Text style={styles.compactMetaDot}>•</Text>
            </>
          )}

          <Text style={styles.compactMetaText}>{dateLabel}</Text>
          <Text style={styles.compactMetaDot}>•</Text>

          <View
            style={[
              styles.statusChip,
              resultat.toLowerCase().includes("adopt")
                ? styles.statusChipPositive
                : resultat.toLowerCase().includes("rejet")
                ? styles.statusChipNegative
                : null,
            ]}
          >
            <Text style={styles.statusChipText}>{resultat}</Text>
          </View>
        </View>
      </View>

      {/* Onglets – version "compromis" */}
      <View style={styles.tabRow}>
        <TabButton
          label="Texte original"
          active={activeTab === "texte"}
          onPress={() => setActiveTab("texte")}
        />
        <TabButton
          label="Points clés"
          active={activeTab === "points"}
          onPress={() => setActiveTab("points")}
        />
        <TabButton
          label="Résultats des votes"
          active={activeTab === "votes"}
          onPress={() => setActiveTab("votes")}
        />
      </View>

      {/* Zone de contenu (scroll) */}
      <View style={styles.tabContentContainer}>
        {activeTab === "texte" && (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* 🟦 Bloc extrait texte */}
            <View style={styles.block}>
              <View style={styles.blockHeaderRow}>
                <View style={styles.blockHeaderLeft}>
                  <View style={styles.blockIconCircleSmall}>
                    <Ionicons
                      name="document-text-outline"
                      size={16}
                      color={theme.colors.primary}
                    />
                  </View>
                  <Text style={styles.blockTitle}>Texte du scrutin</Text>
                </View>
              </View>

              <Text style={styles.blockSubtitle}>
                Objet tel qu’il est fourni dans les données officielles.
              </Text>

              <View style={styles.lawTextBox}>
                <Text style={styles.lawTextLabel}>Objet du vote</Text>
                <Text style={styles.bodyText}>
                  {(law as any).objet ??
                    "Le texte détaillé de cette loi n’est pas encore disponible dans l’application."}
                </Text>
              </View>
            </View>

            {/* 🟩 Bloc infos officielles */}
            <View style={styles.block}>
              <View style={styles.blockHeaderRow}>
                <View style={styles.blockHeaderLeft}>
                  <View style={styles.blockIconCircleSmall}>
                    <Ionicons
                      name="information-circle-outline"
                      size={16}
                      color={theme.colors.primary}
                    />
                  </View>
                  <Text style={styles.blockTitle}>Informations officielles</Text>
                </View>
              </View>

              <Text style={styles.blockSubtitle}>
                Métadonnées disponibles sur ce scrutin.
              </Text>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Type de texte</Text>
                <Text style={styles.infoValue}>
                  {(law as any).type_texte ?? "Non précisé"}
                </Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Date du vote</Text>
                <Text style={styles.infoValue}>{getLawDate(law)}</Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Résultat</Text>
                <Text style={styles.infoValue}>
                  {(law as any).resultat ?? "Résultat non renseigné"}
                </Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Identifiant</Text>
                <Text style={styles.infoValue}>
                  {((law as any).numero != null &&
                    `Scrutin n°${(law as any).numero}`) ||
                    (law as any).id ||
                    "Non disponible"}
                </Text>
              </View>
            </View>

            {/* 🟨 Bloc Comprendre le texte */}
            <View style={styles.block}>
              <View style={styles.blockHeaderRow}>
                <View style={styles.blockHeaderLeft}>
                  <View style={styles.blockIconCircleSmall}>
                    <MaterialCommunityIcons
                      name="lightbulb-on-outline"
                      size={16}
                      color={theme.colors.primary}
                    />
                  </View>
                  <Text style={styles.blockTitle}>Comprendre le texte</Text>
                </View>
              </View>

              <Text style={styles.blockSubtitle}>
                Une lecture guidée pour mieux situer le texte (placeholder).
              </Text>

              <View style={styles.keyPointItem}>
                <Ionicons
                  name="ellipse"
                  size={6}
                  color={theme.colors.primary}
                  style={{ marginTop: 6 }}
                />
                <Text style={styles.keyPointText}>
                  La loi s’inscrit dans un ensemble plus large de réformes.
                </Text>
              </View>

              <View style={styles.keyPointItem}>
                <Ionicons
                  name="ellipse"
                  size={6}
                  color={theme.colors.primary}
                  style={{ marginTop: 6 }}
                />
                <Text style={styles.keyPointText}>
                  Elle impacte potentiellement citoyens, entreprises ou
                  administrations.
                </Text>
              </View>

              <View style={styles.keyPointItem}>
                <Ionicons
                  name="ellipse"
                  size={6}
                  color={theme.colors.primary}
                  style={{ marginTop: 6 }}
                />
                <Text style={styles.keyPointText}>
                  Une future version pourra afficher un résumé automatique ou
                  une fiche pédagogique.
                </Text>
              </View>
            </View>
          </ScrollView>
        )}

        {activeTab === "points" && (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Résumé essentiel */}
            <View style={styles.block}>
              <View style={styles.blockHeaderRow}>
                <View style={styles.blockHeaderLeft}>
                  <View style={styles.blockIconCircleSmall}>
                    <Ionicons
                      name="document-text-outline"
                      size={16}
                      color={theme.colors.primary}
                    />
                  </View>
                  <Text style={styles.blockTitle}>Résumé essentiel</Text>
                </View>
              </View>

              <Text style={styles.blockSubtitle}>
                Synthèse rapide du contenu ou de l’objectif du texte.
              </Text>

              <Text style={styles.bodyText}>
                {(law as any).objet ??
                  "Le descriptif complet de cette loi n’est pas encore disponible."}
              </Text>
            </View>

            {/* Ce qu’il faut retenir */}
            <View style={styles.block}>
              <View style={styles.blockHeaderRow}>
                <View style={styles.blockHeaderLeft}>
                  <View style={styles.blockIconCircleSmall}>
                    <Ionicons
                      name="list-circle-outline"
                      size={16}
                      color={theme.colors.primary}
                    />
                  </View>
                  <Text style={styles.blockTitle}>Ce qu’il faut retenir</Text>
                </View>
              </View>

              <View style={{ marginTop: theme.spacing.sm }}>
                <View style={styles.keyPointItem}>
                  <Ionicons
                    name="ellipse"
                    size={6}
                    color={theme.colors.primary}
                    style={{ marginTop: 6 }}
                  />
                  <Text style={styles.keyPointText}>
                    Mesure principale : synthèse de la finalité du texte.
                  </Text>
                </View>

                <View style={styles.keyPointItem}>
                  <Ionicons
                    name="ellipse"
                    size={6}
                    color={theme.colors.primary}
                    style={{ marginTop: 6 }}
                  />
                  <Text style={styles.keyPointText}>
                    Second point important ou impact notable sur les citoyens.
                  </Text>
                </View>

                <View style={styles.keyPointItem}>
                  <Ionicons
                    name="ellipse"
                    size={6}
                    color={theme.colors.primary}
                    style={{ marginTop: 6 }}
                  />
                  <Text style={styles.keyPointText}>
                    Éventuels changements administratifs ou économiques.
                  </Text>
                </View>

                <View style={styles.keyPointItem}>
                  <Ionicons
                    name="ellipse"
                    size={6}
                    color={theme.colors.primary}
                    style={{ marginTop: 6 }}
                  />
                  <Text style={styles.keyPointText}>
                    Contexte ou justification du texte.
                  </Text>
                </View>
              </View>
            </View>

            {/* Parcours législatif */}
            <View style={styles.block}>
              <View style={styles.blockHeaderRow}>
                <View style={styles.blockHeaderLeft}>
                  <View style={styles.blockIconCircleSmall}>
                    <Ionicons
                      name="time-outline"
                      size={16}
                      color={theme.colors.primary}
                    />
                  </View>
                  <Text style={styles.blockTitle}>Parcours législatif</Text>
                </View>
              </View>

              <Text style={styles.blockSubtitle}>
                Étapes clés depuis l’introduction du texte.
              </Text>

              <View style={styles.timelineItem}>
                <View style={styles.timelineDot} />
                <View style={styles.timelineContent}>
                  <Text style={styles.timelineTitle}>
                    Présentation du texte
                  </Text>
                  <Text style={styles.timelineMeta}>
                    {(law as any).date_scrutin ?? "Date non renseignée"}
                  </Text>
                </View>
              </View>

              <View style={styles.timelineItem}>
                <View style={styles.timelineDot} />
                <View style={styles.timelineContent}>
                  <Text style={styles.timelineTitle}>Débat parlementaire</Text>
                  <Text style={styles.timelineMeta}>Assemblée nationale</Text>
                </View>
              </View>

              <View style={styles.timelineItem}>
                <View style={styles.timelineDot} />
                <View style={styles.timelineContent}>
                  <Text style={styles.timelineTitle}>Vote final</Text>
                  <Text style={styles.timelineMeta}>
                    {(law as any).resultat ?? "Résultat non renseigné"}
                  </Text>
                </View>
              </View>
            </View>
          </ScrollView>
        )}

        {activeTab === "votes" && (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Résumé du vote */}
            <View style={styles.block}>
              <View style={styles.blockHeaderRow}>
                <View style={styles.blockHeaderLeft}>
                  <View style={styles.blockIconCircleSmall}>
                    <Ionicons
                      name="stats-chart-outline"
                      size={16}
                      color={theme.colors.primary}
                    />
                  </View>
                  <Text style={styles.blockTitle}>Résumé du vote</Text>
                </View>
              </View>

              <Text style={styles.blockSubtitle}>
                Répartition globale des votes exprimés.
              </Text>

              <View style={styles.statRow}>
                <View style={styles.statLabelCol}>
                  <Text style={styles.statLabel}>Pour</Text>
                  <Text style={styles.statBadgePour}>
                    {globalStats.pour} voix
                  </Text>
                </View>
                <Text style={styles.statPercent}>
                  {globalStats.pctPour}%{/* espace */}
                </Text>
              </View>
              <View style={styles.barBackground}>
                <View
                  style={[
                    styles.barFill,
                    styles.barFillPour,
                    { width: `${globalStats.pctPour}%` },
                  ]}
                />
              </View>

              <View style={styles.statRow}>
                <View style={styles.statLabelCol}>
                  <Text style={styles.statLabel}>Contre</Text>
                  <Text style={styles.statBadgeContre}>
                    {globalStats.contre} voix
                  </Text>
                </View>
                <Text style={styles.statPercent}>
                  {globalStats.pctContre}%{/* espace */}
                </Text>
              </View>
              <View style={styles.barBackground}>
                <View
                  style={[
                    styles.barFill,
                    styles.barFillContre,
                    { width: `${globalStats.pctContre}%` },
                  ]}
                />
              </View>

              <View style={styles.statRow}>
                <View style={styles.statLabelCol}>
                  <Text style={styles.statLabel}>Abstention</Text>
                  <Text style={styles.statBadgeAbst}>
                    {globalStats.abstention} voix
                  </Text>
                </View>
                <Text style={styles.statPercent}>
                  {globalStats.pctAbst}%{/* espace */}
                </Text>
              </View>
              <View style={styles.barBackground}>
                <View
                  style={[
                    styles.barFill,
                    styles.barFillAbst,
                    { width: `${globalStats.pctAbst}%` },
                  ]}
                />
              </View>
            </View>

            {/* Répartition par groupe */}
            <View style={styles.block}>
              <View style={styles.blockHeaderRow}>
                <View style={styles.blockHeaderLeft}>
                  <View style={styles.blockIconCircleSmall}>
                    <Ionicons
                      name="people-outline"
                      size={16}
                      color={theme.colors.primary}
                    />
                  </View>
                  <Text style={styles.blockTitle}>
                    Répartition par groupe politique
                  </Text>
                </View>
              </View>

              {groupsAgg.length === 0 ? (
                <Text style={styles.emptyText}>
                  Aucune donnée de groupe disponible.
                </Text>
              ) : (
                groupsAgg.map((g) => {
                  const pctPour =
                    g.total > 0 ? Math.round((g.pour / g.total) * 100) : 0;
                  const pctContre =
                    g.total > 0 ? Math.round((g.contre / g.total) * 100) : 0;
                  const pctAbst =
                    g.total > 0
                      ? Math.round((g.abstention / g.total) * 100)
                      : 0;

                  return (
                    <View key={g.groupLabel} style={styles.groupRow}>
                      <View style={styles.groupMain}>
                        <Text style={styles.groupLabel}>{g.groupLabel}</Text>
                        <Text style={styles.groupSub}>
                          {g.total} vote{g.total > 1 ? "s" : ""} · {pctPour}% pour
                        </Text>
                      </View>

                      <View style={styles.groupBarRow}>
                        {pctPour > 0 && (
                          <View
                            style={[
                              styles.groupSegmentPour,
                              { flex: pctPour },
                            ]}
                          />
                        )}
                        {pctContre > 0 && (
                          <View
                            style={[
                              styles.groupSegmentContre,
                              { flex: pctContre },
                            ]}
                          />
                        )}
                        {pctAbst > 0 && (
                          <View
                            style={[
                              styles.groupSegmentAbst,
                              { flex: pctAbst },
                            ]}
                          />
                        )}
                      </View>

                      <View style={styles.groupLegendRow}>
                        <Text style={styles.groupLegendText}>
                          ✅ Pour : {pctPour}%
                        </Text>
                        <Text style={styles.groupLegendText}>
                          ❌ Contre : {pctContre}%
                        </Text>
                        <Text style={styles.groupLegendText}>
                          ⏸ Abstention : {pctAbst}%
                        </Text>
                      </View>
                    </View>
                  );
                })
              )}
            </View>

            {/* Liste des votes par député */}
            <View style={styles.block}>
              <View style={styles.blockHeaderRow}>
                <View style={styles.blockHeaderLeft}>
                  <View style={styles.blockIconCircleSmall}>
                    <Ionicons
                      name="person-circle-outline"
                      size={16}
                      color={theme.colors.primary}
                    />
                  </View>
                  <Text style={styles.blockTitle}>Votes par député</Text>
                </View>
              </View>

              {enrichedVotes.length === 0 ? (
                <Text style={styles.emptyText}>
                  Aucune donnée de vote disponible pour ce scrutin.
                </Text>
              ) : (
                <FlatList
                  data={enrichedVotes}
                  keyExtractor={(_, index) => String(index)}
                  renderItem={({ item }) => <VoteRowItem vote={item} />}
                  ItemSeparatorComponent={() => (
                    <View style={styles.voteSeparator} />
                  )}
                  scrollEnabled={false}
                />
              )}
            </View>
          </ScrollView>
        )}
      </View>
    </ScreenContainer>
  );
}

/* ---------- Composants auxiliaires ---------- */

const VoteRowItem: React.FC<{ vote: VoteRow }> = ({ vote }) => {
  const deputy = vote.deputy;
  const name = getDeputyName(deputy);
  const group = getDeputyGroupLabel(deputy);

  const labelVote = (vote.vote || "").toLowerCase();
  let iconName: keyof typeof Ionicons.glyphMap = "help-circle-outline";
  let iconColor = theme.colors.subtext;
  let chipLabel = "Non renseigné";

  if (labelVote === "pour") {
    iconName = "checkmark-circle";
    iconColor = "#16a34a";
    chipLabel = "Pour";
  } else if (labelVote === "contre") {
    iconName = "close-circle";
    iconColor = "#dc2626";
    chipLabel = "Contre";
  } else if (labelVote === "abstention") {
    iconName = "pause-circle";
    chipLabel = "Abstention";
    iconColor = "#f97316";
  }

  return (
    <View style={styles.voteRow}>
      <View style={styles.voteMain}>
        <Text style={styles.voteTitle} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.voteGroup} numberOfLines={1}>
          {group}
        </Text>
      </View>

      <View style={styles.voteRight}>
        <Ionicons name={iconName} size={18} color={iconColor} />
        <Text style={[styles.voteChip, { color: iconColor }]}>{chipLabel}</Text>
      </View>
    </View>
  );
};

type TabButtonProps = {
  label: string;
  active: boolean;
  onPress: () => void;
};

const TabButton: React.FC<TabButtonProps> = ({ label, active, onPress }) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [
      styles.tabButton,
      active && styles.tabButtonActive,
      pressed && !active && styles.tabButtonPressed,
    ]}
  >
    <Text style={active ? styles.tabLabelActive : styles.tabLabel}>{label}</Text>
  </Pressable>
);

/* ---------- Styles ---------- */

const styles = StyleSheet.create({
  /* Header / retour */

  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.spacing.xs,
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  backText: {
    marginLeft: 4,
    fontSize: theme.fontSize.sm,
    color: theme.colors.primary,
    fontWeight: "500",
  },
  compactHeader: {
    marginBottom: theme.spacing.xs, // plus compact qu'avant
  },
  compactTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing.xs, // un peu moins d’espace
  },
  compactTitle: {
    flex: 1,
    fontSize: theme.fontSize.md,
    fontWeight: "700",
    color: theme.colors.text,
  },
  compactMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 4,
    marginTop: theme.spacing.xs,
  },
  compactMetaText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.subtext,
  },
  compactMetaDot: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.subtext,
  },

  headerMetaRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  headerMetaText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.subtext,
  },
  headerMetaDot: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.subtext,
  },

  /* Encart loi */

  lawCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.sm,
  },
  lawTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  lawChipsRow: {
    flexDirection: "row",
    marginTop: theme.spacing.xs,
    gap: theme.spacing.xs,
  },
  statusChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: theme.colors.chipBackground,
  },
  statusChipPositive: {
    backgroundColor: "#dcfce7",
  },
  statusChipNegative: {
    backgroundColor: "#fee2e2",
  },
  statusChipText: {
    fontSize: theme.fontSize.xs,
    fontWeight: "600",
    color: theme.colors.text,
  },

  lawTextBox: {
    marginTop: theme.spacing.sm,
    padding: theme.spacing.sm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  lawTextLabel: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.subtext,
    fontWeight: "600",
    marginBottom: theme.spacing.xs,
    textTransform: "uppercase",
  },

  /* Infos */

  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  infoLabel: {
    flex: 1,
    fontSize: theme.fontSize.xs,
    color: theme.colors.subtext,
  },
  infoValue: {
    flex: 1.2,
    fontSize: theme.fontSize.sm,
    color: theme.colors.text,
    fontWeight: "500",
    textAlign: "right",
    marginLeft: theme.spacing.sm,
  },

  /* Onglets – version hybride */

  tabRow: {
    flexDirection: "row",
    backgroundColor: theme.colors.surface,
    borderRadius: 10,
    padding: 1,
    marginBottom: theme.spacing.xs, // moins d’espace dessous
    marginTop: 0,                  // collé au header compact
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  tabButton: {
    flex: 1,
    paddingVertical: theme.spacing.xs * 1.1, // légèrement plus fin
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  tabButtonActive: {
    backgroundColor: theme.colors.primarySoft,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  tabButtonPressed: {
    opacity: 0.8,
  },
  tabLabel: {
  fontSize: theme.fontSize.sm,
  color: theme.colors.subtext,
  fontWeight: "500",
  letterSpacing: 0.2,
  textAlign: "center",
  },
  tabLabelActive: {
  fontSize: theme.fontSize.sm,
  color: theme.colors.primary,
  fontWeight: "600",
  letterSpacing: 0.3,
  textAlign: "center",
  },

  /* Zone de contenu des onglets */

  tabContentContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: theme.spacing.xl, // avant xxxl => plus de hauteur utile
  },

  bodyText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.text,
    lineHeight: 20,
  },

  /* Bloc générique */

  block: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing.sm * 1.1, // un peu plus compact
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,          // moins d’espace entre les blocs
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  blockHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  blockHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  blockIconCircleSmall: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: theme.colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  blockTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: "600",
    color: theme.colors.text,
  },
  blockSubtitle: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.subtext,
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },

  /* Stats votes */

  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: theme.spacing.sm,
  },
  statLabelCol: {
    flexDirection: "column",
  },
  statLabel: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.text,
    fontWeight: "500",
  },
  statPercent: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.text,
    fontWeight: "600",
  },
  barBackground: {
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.border,
    overflow: "hidden",
    marginTop: theme.spacing.xs,
  },
  barFill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: theme.colors.primary,
  },
  barFillPour: {
    backgroundColor: "#16a34a",
  },
  barFillContre: {
    backgroundColor: "#dc2626",
  },
  barFillAbst: {
    backgroundColor: "#f97316",
  },
  statBadgePour: {
    fontSize: theme.fontSize.xs,
    color: "#16a34a",
  },
  statBadgeContre: {
    fontSize: theme.fontSize.xs,
    color: "#dc2626",
  },
  statBadgeAbst: {
    fontSize: theme.fontSize.xs,
    color: "#f97316",
  },

  /* Groupes */

  groupRow: {
    paddingVertical: theme.spacing.xs,
  },
  groupMain: {
    flexDirection: "column",
  },
  groupLabel: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.text,
    fontWeight: "600",
  },
  groupSub: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.subtext,
    marginTop: theme.spacing.xxs,
  },
  groupBarRow: {
    flexDirection: "row",
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    marginTop: theme.spacing.xs,
    backgroundColor: theme.colors.border,
  },
  groupSegmentPour: {
    backgroundColor: "#16a34a",
  },
  groupSegmentContre: {
    backgroundColor: "#dc2626",
  },
  groupSegmentAbst: {
    backgroundColor: "#f97316",
  },
  groupLegendRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: theme.spacing.xs,
  },
  groupLegendText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.subtext,
  },

  /* Votes par député */

  voteRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: theme.spacing.xs,
  },
  voteMain: {
    flex: 1,
    marginRight: theme.spacing.sm,
  },
  voteTitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.text,
    fontWeight: "600",
  },
  voteGroup: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.subtext,
    marginTop: 2,
  },
  voteRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  voteChip: {
    fontSize: theme.fontSize.xs,
    fontWeight: "600",
  },
  voteSeparator: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: theme.spacing.xxs,
  },

  emptyText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.subtext,
  },

  /* Timeline */

  timelineItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: theme.spacing.sm,
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.primary,
    marginTop: 4,
    marginRight: theme.spacing.sm,
  },
  timelineContent: {
    flex: 1,
  },
  timelineTitle: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.text,
    fontWeight: "600",
  },
  timelineMeta: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.subtext,
    marginTop: 2,
  },

  /* Points clés */

  keyPointItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  keyPointText: {
    flex: 1,
    marginLeft: 8,
    fontSize: theme.fontSize.sm,
    color: theme.colors.text,
    lineHeight: 20,
  },
});
