// app/(tabs)/stats.tsx
import {
  Feather,
  Ionicons,
  MaterialCommunityIcons,
} from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  ErrorView,
  LoadingView,
  ScreenContainer,
  SectionTitle,
} from "../../lib/parlement-common";
import { supabase } from "../../lib/supabaseClient";
import { theme } from "../../lib/theme";

type DeputyStats = {
  id_an: string | null;
  nomcomplet: string;
  groupe_sigle?: string | null;
  groupe?: string | null;
  groupe_politique?: string | null;
  total_votes?: number | null;
  nb_votes_total?: number | null;
  votes_pour?: number | null;
  nb_votes_pour?: number | null;
  votes_contre?: number | null;
  nb_votes_contre?: number | null;
  abstentions?: number | null;
  nb_abstentions?: number | null;
  [key: string]: any;
};

type GroupAgg = {
  label: string;
  count: number;
  totalVotes: number;
  totalPour: number;
  totalContre: number;
  totalAbst: number;
};

type TabKey = "activity" | "comparator" | "budget";

const BUDGET_DATA = {
  budgetTotal: "570 M€",
  budgetVariation: "+1,8% vs année précédente",
  indemnites: "7 493€ / mois",
  fraisMandat: "5 950€ / mois",
  creditCollaborateur: "11 118€",
  creditTauxUtilisation: "85%", // utilisé pour la barre
  fonctionnement: "125 M€",
  fonctionnementVariation: "+3,2% vs année précédente",
};

export default function StatsScreen() {
  const [deputies, setDeputies] = useState<DeputyStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("activity");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from("deputes_officiels")
        .select("*");

      if (error) {
        console.error("Erreur chargement stats députés :", error);
        setError("Impossible de charger les statistiques globales.");
      } else {
        setDeputies((data as DeputyStats[]) ?? []);
      }

      setLoading(false);
    };

    load();
  }, []);

  const {
    totalDeputies,
    totalVotes,
    avgVotesPerDeputy,
    pctPour,
    pctContre,
    pctAbst,
    topActive,
    topGroups,
  } = useMemo(() => {
    if (!deputies || deputies.length === 0) {
      return {
        totalDeputies: 0,
        totalVotes: 0,
        avgVotesPerDeputy: 0,
        pctPour: 0,
        pctContre: 0,
        pctAbst: 0,
        topActive: [] as DeputyStats[],
        topGroups: [] as GroupAgg[],
      };
    }

    const totalDeputies = deputies.length;

    let sumTotal = 0;
    let sumPour = 0;
    let sumContre = 0;
    let sumAbst = 0;

    const groupMap = new Map<string, GroupAgg>();

    deputies.forEach((d) => {
      const total =
        d.total_votes ??
        d.nb_votes_total ??
        0;
      const pour =
        d.votes_pour ??
        d.nb_votes_pour ??
        0;
      const contre =
        d.votes_contre ??
        d.nb_votes_contre ??
        0;
      const abst =
        d.abstentions ??
        d.nb_abstentions ??
        0;

      sumTotal += total;
      sumPour += pour;
      sumContre += contre;
      sumAbst += abst;

      const groupLabel =
        (d.groupe_sigle ??
          d.groupe ??
          d.groupe_politique ??
          "Non renseigné") || "Non renseigné";

      const existing = groupMap.get(groupLabel);
      if (existing) {
        existing.count += 1;
        existing.totalVotes += total;
        existing.totalPour += pour;
        existing.totalContre += contre;
        existing.totalAbst += abst;
      } else {
        groupMap.set(groupLabel, {
          label: groupLabel,
          count: 1,
          totalVotes: total,
          totalPour: pour,
          totalContre: contre,
          totalAbst: abst,
        });
      }
    });

    const avgVotesPerDeputy =
      totalDeputies > 0 ? Math.round(sumTotal / totalDeputies) : 0;

    const denom = sumTotal > 0 ? sumTotal : sumPour + sumContre + sumAbst || 1;

    const pctPour = Math.round((sumPour / denom) * 100);
    const pctContre = Math.round((sumContre / denom) * 100);
    const pctAbst = Math.round((sumAbst / denom) * 100);

    const topActive = [...deputies]
      .sort((a, b) => {
        const ta =
          a.total_votes ??
          a.nb_votes_total ??
          0;
        const tb =
          b.total_votes ??
          b.nb_votes_total ??
          0;
        return tb - ta;
      })
      .slice(0, 3);

    const topGroups = Array.from(groupMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    return {
      totalDeputies,
      totalVotes: sumTotal,
      avgVotesPerDeputy,
      pctPour,
      pctContre,
      pctAbst,
      topActive,
      topGroups,
    };
  }, [deputies]);

  if (loading) {
    return <LoadingView message="Calcul des statistiques parlementaires..." />;
  }

  if (error) {
    return <ErrorView message={error} />;
  }

  if (deputies.length === 0) {
    return (
      <ScreenContainer
        title="Statistiques"
        subtitle="Vue d’ensemble de l’activité parlementaire"
      >
        <Text style={styles.emptyText}>
          Aucune donnée de députés n’est disponible pour le moment.
        </Text>
      </ScreenContainer>
    );
  }

  const subtitleByTab: Record<TabKey, string> = {
    activity: "Vue d’ensemble de l’activité parlementaire",
    comparator: "Comparer l’activité de deux groupes politiques",
    budget: "Indicateurs budgétaires de l’Assemblée (ordre de grandeur)",
  };

  return (
    <ScreenContainer
      title="Statistiques"
      subtitle={subtitleByTab[activeTab]}
    >
      {/* Segmented control */}
      <View style={styles.tabRow}>
        <TabButton
          label="Activité"
          active={activeTab === "activity"}
          onPress={() => setActiveTab("activity")}
        />
        <TabButton
          label="Comparateur"
          active={activeTab === "comparator"}
          onPress={() => setActiveTab("comparator")}
        />
        <TabButton
          label="Budget"
          active={activeTab === "budget"}
          onPress={() => setActiveTab("budget")}
        />
      </View>

      {activeTab === "activity" && (
        <ActivityTab
          totalDeputies={totalDeputies}
          totalVotes={totalVotes}
          avgVotesPerDeputy={avgVotesPerDeputy}
          pctPour={pctPour}
          pctContre={pctContre}
          pctAbst={pctAbst}
          topActive={topActive}
          topGroups={topGroups}
        />
      )}

      {activeTab === "comparator" && (
        <ComparatorTab topGroups={topGroups} />
      )}

      {activeTab === "budget" && <BudgetTab />}
    </ScreenContainer>
  );
}

/* ------------------------ Onglet Activité ------------------------ */

type ActivityProps = {
  totalDeputies: number;
  totalVotes: number;
  avgVotesPerDeputy: number;
  pctPour: number;
  pctContre: number;
  pctAbst: number;
  topActive: DeputyStats[];
  topGroups: GroupAgg[];
};

const ActivityTab: React.FC<ActivityProps> = ({
  totalDeputies,
  totalVotes,
  avgVotesPerDeputy,
  pctPour,
  pctContre,
  pctAbst,
  topActive,
  topGroups,
}) => {
  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      {/* Chiffres clés */}
      <SectionTitle>Vue générale</SectionTitle>
      <View style={styles.metricsGrid}>
        <View style={styles.metricCard}>
          <View style={styles.metricIconCircle}>
            <Ionicons name="people" size={18} color={theme.colors.primary} />
          </View>
          <Text style={styles.metricValue}>{totalDeputies}</Text>
          <Text style={styles.metricLabel}>Députés</Text>
        </View>

        <View style={styles.metricCard}>
          <View style={styles.metricIconCircle}>
            <MaterialCommunityIcons
              name="gavel"
              size={18}
              color={theme.colors.primary}
            />
          </View>
          <Text style={styles.metricValue}>{totalVotes}</Text>
          <Text style={styles.metricLabel}>Votes enregistrés</Text>
        </View>

        <View style={styles.metricCard}>
          <View style={styles.metricIconCircle}>
            <Feather name="activity" size={18} color={theme.colors.primary} />
          </View>
          <Text style={styles.metricValue}>{avgVotesPerDeputy}</Text>
          <Text style={styles.metricLabel}>Votes / député (moyenne)</Text>
        </View>
      </View>

      {/* Répartition des votes */}
      <View style={styles.block}>
        <View style={styles.blockHeaderRow}>
          <View style={styles.blockHeaderLeft}>
            <View style={styles.blockIconCircle}>
              <MaterialCommunityIcons
                name="chart-areaspline"
                size={18}
                color={theme.colors.primary}
              />
            </View>
            <Text style={styles.blockTitle}>Répartition globale des votes</Text>
          </View>
          <Text style={styles.blockHeaderTag}>Vue d’ensemble</Text>
        </View>
        <Text style={styles.blockSubtitle}>
          Calculée sur l’ensemble des votes disponibles.
        </Text>

        {/* Pour */}
        <View style={styles.statRow}>
          <View style={styles.statLabelCol}>
            <Text style={styles.statLabel}>Pour</Text>
            <Text style={styles.statBadgePour}>✔ Favorable</Text>
          </View>
          <Text style={styles.statPercent}>{pctPour}%</Text>
        </View>
        <View style={styles.barBackground}>
          <View
            style={[
              styles.barFill,
              styles.barFillPour,
              { width: `${pctPour}%` },
            ]}
          />
        </View>

        {/* Contre */}
        <View style={styles.statRow}>
          <View style={styles.statLabelCol}>
            <Text style={styles.statLabel}>Contre</Text>
            <Text style={styles.statBadgeContre}>✗ Opposé</Text>
          </View>
          <Text style={styles.statPercent}>{pctContre}%</Text>
        </View>
        <View style={styles.barBackground}>
          <View
            style={[
              styles.barFill,
              styles.barFillContre,
              { width: `${pctContre}%` },
            ]}
          />
        </View>

        {/* Abstention */}
        <View style={styles.statRow}>
          <View style={styles.statLabelCol}>
            <Text style={styles.statLabel}>Abstention</Text>
            <Text style={styles.statBadgeAbst}>• Abstention</Text>
          </View>
          <Text style={styles.statPercent}>{pctAbst}%</Text>
        </View>
        <View style={styles.barBackground}>
          <View
            style={[
              styles.barFill,
              styles.barFillAbst,
              { width: `${pctAbst}%` },
            ]}
          />
        </View>
      </View>

      {/* Députés les plus actifs */}
      <View style={styles.block}>
        <View style={styles.blockHeaderRow}>
          <View style={styles.blockHeaderLeft}>
            <View style={styles.blockIconCircle}>
              <Ionicons name="ribbon" size={18} color={theme.colors.primary} />
            </View>
            <Text style={styles.blockTitle}>Députés les plus actifs</Text>
          </View>
        </View>
        <Text style={styles.blockSubtitle}>
          Classés par nombre de votes enregistrés.
        </Text>

        {topActive.map((d) => {
          const total =
            d.total_votes ??
            d.nb_votes_total ??
            0;
          const groupLabel =
            d.groupe_sigle ??
            d.groupe ??
            d.groupe_politique ??
            "Non renseigné";
          return (
            <View key={d.id_an ?? d.nomcomplet} style={styles.activeRow}>
              <View style={styles.activeMain}>
                <Text style={styles.activeName}>{d.nomcomplet}</Text>
                <Text style={styles.activeGroup}>{groupLabel}</Text>
              </View>
              <Text style={styles.activeValue}>{total}</Text>
            </View>
          );
        })}
      </View>

      {/* Groupes politiques */}
      <View style={styles.block}>
        <View style={styles.blockHeaderRow}>
          <View style={styles.blockHeaderLeft}>
            <View style={styles.blockIconCircle}>
              <Ionicons
                name="git-branch"
                size={18}
                color={theme.colors.primary}
              />
            </View>
            <Text style={styles.blockTitle}>Groupes politiques</Text>
          </View>
        </View>
        <Text style={styles.blockSubtitle}>
          Nombre de députés par groupe et volume de votes.
        </Text>

        {topGroups.map((g) => (
          <View key={g.label} style={styles.groupRow}>
            <View style={styles.groupMain}>
              <Text style={styles.groupLabel}>{g.label}</Text>
              <Text style={styles.groupSub}>
                {g.count} député{g.count > 1 ? "s" : ""}
              </Text>
            </View>
            <Text style={styles.groupVotes}>{g.totalVotes} votes</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
};

/* ------------------------ Onglet Comparateur ------------------------ */

type ComparatorProps = {
  topGroups: GroupAgg[];
};

const ComparatorTab: React.FC<ComparatorProps> = ({ topGroups }) => {
  if (topGroups.length < 2) {
    return (
      <View style={styles.comparatorEmpty}>
        <Text style={styles.emptyText}>
          Pas encore assez de groupes pour proposer une comparaison.
        </Text>
      </View>
    );
  }

  const groupA = topGroups[0];
  const groupB = topGroups[1];

  const pct = (num: number, den: number) =>
    den > 0 ? `${Math.round((num / den) * 100)}%` : "—";

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <SectionTitle>Comparateur de groupes</SectionTitle>

      <View style={styles.block}>
        <View style={styles.blockHeaderRow}>
          <View style={styles.blockHeaderLeft}>
            <View style={styles.blockIconCircle}>
              {/* icône changée ici */}
              <Feather name="git-merge" size={18} color={theme.colors.primary} />
            </View>
            <Text style={styles.blockTitle}>Groupes comparés</Text>
          </View>
        </View>
        <Text style={styles.blockSubtitle}>
          Basé sur les deux groupes comptant le plus de députés.
        </Text>

        <View style={styles.compareHeaderRow}>
          <View style={styles.compareHeaderCell}>
            <Text style={styles.compareHeaderLabel}>Groupe 1</Text>
            <Text style={styles.compareHeaderValue}>{groupA.label}</Text>
          </View>
          <View style={styles.compareHeaderCell}>
            <Text style={styles.compareHeaderLabel}>Groupe 2</Text>
            <Text style={styles.compareHeaderValue}>{groupB.label}</Text>
          </View>
        </View>
      </View>

      <View style={styles.block}>
        <View style={styles.blockHeaderRow}>
          <View style={styles.blockHeaderLeft}>
            <View style={styles.blockIconCircle}>
              <Ionicons name="scale" size={18} color={theme.colors.primary} />
            </View>
            <Text style={styles.blockTitle}>Poids à l’Assemblée</Text>
          </View>
        </View>

        <View style={styles.compareRow}>
          <Text style={styles.compareLabel}>Nombre de députés</Text>
          <Text style={styles.compareValue}>{groupA.count}</Text>
          <Text style={styles.compareValue}>{groupB.count}</Text>
        </View>

        <View style={styles.compareRow}>
          <Text style={styles.compareLabel}>Votes totaux</Text>
          <Text style={styles.compareValue}>{groupA.totalVotes}</Text>
          <Text style={styles.compareValue}>{groupB.totalVotes}</Text>
        </View>

        <View style={styles.compareRow}>
          <Text style={styles.compareLabel}>Votes / député (moy.)</Text>
          <Text style={styles.compareValue}>
            {groupA.count > 0
              ? Math.round(groupA.totalVotes / groupA.count)
              : "—"}
          </Text>
          <Text style={styles.compareValue}>
            {groupB.count > 0
              ? Math.round(groupB.totalVotes / groupB.count)
              : "—"}
          </Text>
        </View>
      </View>

      <View style={styles.block}>
        <View style={styles.blockHeaderRow}>
          <View style={styles.blockHeaderLeft}>
            <View style={styles.blockIconCircle}>
              <MaterialCommunityIcons
                name="vote-outline"
                size={18}
                color={theme.colors.primary}
              />
            </View>
            <Text style={styles.blockTitle}>Profil de vote</Text>
          </View>
        </View>

        <View style={styles.compareRow}>
          <Text style={styles.compareLabel}>Pour</Text>
          <Text style={styles.compareValue}>
            {pct(groupA.totalPour, groupA.totalVotes)}
          </Text>
          <Text style={styles.compareValue}>
            {pct(groupB.totalPour, groupB.totalVotes)}
          </Text>
        </View>

        <View style={styles.compareRow}>
          <Text style={styles.compareLabel}>Contre</Text>
          <Text style={styles.compareValue}>
            {pct(groupA.totalContre, groupA.totalVotes)}
          </Text>
          <Text style={styles.compareValue}>
            {pct(groupB.totalContre, groupB.totalVotes)}
          </Text>
        </View>

        <View style={styles.compareRow}>
          <Text style={styles.compareLabel}>Abstention</Text>
          <Text style={styles.compareValue}>
            {pct(groupA.totalAbst, groupA.totalVotes)}
          </Text>
          <Text style={styles.compareValue}>
            {pct(groupB.totalAbst, groupB.totalVotes)}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
};

/* ------------------------ Onglet Budget ------------------------ */

const BudgetTab: React.FC = () => {
  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <SectionTitle>Budget de l’Assemblée</SectionTitle>

      <View style={styles.block}>
        <View style={styles.blockHeaderRow}>
          <View style={styles.blockHeaderLeft}>
            <View style={styles.blockIconCircle}>
              <Ionicons
                name="business"
                size={18}
                color={theme.colors.primary}
              />
            </View>
            <Text style={styles.blockTitle}>Budget global</Text>
          </View>
        </View>
        <Text style={styles.budgetMain}>{BUDGET_DATA.budgetTotal}</Text>
        <Text style={styles.budgetPositive}>{BUDGET_DATA.budgetVariation}</Text>
      </View>

      <View style={styles.budgetGrid}>
        <View style={styles.blockHalf}>
          <View style={styles.blockHeaderRow}>
            <View style={styles.blockHeaderLeft}>
              <View style={styles.blockIconCircleSmall}>
                <Ionicons
                  name="card"
                  size={14}
                  color={theme.colors.primary}
                />
              </View>
              <Text style={styles.blockTitle}>Indemnités</Text>
            </View>
          </View>
          <Text style={styles.budgetMain}>{BUDGET_DATA.indemnites}</Text>
          <Text style={styles.budgetSub}>Montant brut indicatif / mois</Text>
        </View>
        <View style={styles.blockHalf}>
          <View style={styles.blockHeaderRow}>
            <View style={styles.blockHeaderLeft}>
              <View style={styles.blockIconCircleSmall}>
                <Feather
                  name="briefcase"
                  size={14}
                  color={theme.colors.primary}
                />
              </View>
              <Text style={styles.blockTitle}>Frais de mandat</Text>
            </View>
          </View>
          <Text style={styles.budgetMain}>{BUDGET_DATA.fraisMandat}</Text>
          <Text style={styles.budgetSub}>Frais de fonctionnement / mois</Text>
        </View>
      </View>

      <View style={styles.block}>
        <View style={styles.blockHeaderRow}>
          <View style={styles.blockHeaderLeft}>
            <View style={styles.blockIconCircle}>
              <Ionicons
                name="people-circle"
                size={18}
                color={theme.colors.primary}
              />
            </View>
            <Text style={styles.blockTitle}>Crédit collaborateur</Text>
          </View>
        </View>
        <Text style={styles.budgetMain}>
          {BUDGET_DATA.creditCollaborateur}
        </Text>
        <View style={styles.barBackground}>
          <View
            style={[
              styles.barFill,
              // on garde la largeur en %, mais on cast pour satisfaire TS
              { width: BUDGET_DATA.creditTauxUtilisation as unknown as number },
            ]}
          />
        </View>
        <Text style={styles.budgetSub}>
          Utilisation estimée : {BUDGET_DATA.creditTauxUtilisation}
        </Text>
      </View>

      <View style={styles.block}>
        <View style={styles.blockHeaderRow}>
          <View style={styles.blockHeaderLeft}>
            <View style={styles.blockIconCircle}>
              <MaterialCommunityIcons
                name="office-building"
                size={18}
                color={theme.colors.primary}
              />
            </View>
            <Text style={styles.blockTitle}>Dépenses de fonctionnement</Text>
          </View>
        </View>
        <Text style={styles.budgetMain}>{BUDGET_DATA.fonctionnement}</Text>
        <Text style={styles.budgetNegative}>
          {BUDGET_DATA.fonctionnementVariation}
        </Text>
      </View>
    </ScrollView>
  );
};

/* ------------------------ Composants utilitaires ------------------------ */

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
    <Text style={active ? styles.tabLabelActive : styles.tabLabel}>
      {label}
    </Text>
  </Pressable>
);

/* ------------------------ Styles ------------------------ */

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: theme.spacing.xxxl,
  },

  emptyText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.subtext,
  },

  /* Tabs */
  tabRow: {
    flexDirection: "row",
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.pill,
    padding: 2,
    marginBottom: theme.spacing.md,
  },
  tabButton: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  tabButtonActive: {
    backgroundColor: theme.colors.primarySoft,
  },
  tabButtonPressed: {
    opacity: 0.7,
  },
  tabLabel: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.subtext,
    fontWeight: "500",
  },
  tabLabelActive: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.primary,
    fontWeight: "600",
  },

  /* Chiffres clés */
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: theme.spacing.md,
  },
  metricCard: {
    width: "33%",
    paddingVertical: theme.spacing.sm,
    alignItems: "flex-start",
  },
  metricIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.spacing.xs,
  },
  metricValue: {
    fontSize: theme.fontSize.lg,
    fontWeight: "700",
    color: theme.colors.text,
  },
  metricLabel: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.subtext,
    marginTop: theme.spacing.xxs,
  },

  /* Bloc générique */
  block: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
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
  blockHeaderTag: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.subtext,
  },
  blockIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  blockIconCircleSmall: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: theme.spacing.xs,
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

  /* Répartition votes */
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

  /* Top députés actifs */
  activeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: theme.spacing.xs,
  },
  activeMain: {
    flexDirection: "column",
    flex: 1,
    marginRight: theme.spacing.sm,
  },
  activeName: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.text,
    fontWeight: "600",
  },
  activeGroup: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.subtext,
  },
  activeValue: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.text,
    fontWeight: "600",
  },

  /* Groupes */
  groupRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: theme.spacing.xs,
    alignItems: "center",
  },
  groupMain: {
    flexDirection: "column",
    flex: 1,
    marginRight: theme.spacing.sm,
  },
  groupLabel: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.text,
    fontWeight: "600",
  },
  groupSub: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.subtext,
  },
  groupVotes: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.text,
    fontWeight: "600",
  },

  /* Comparateur */
  comparatorEmpty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing.lg,
  },
  compareHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  compareHeaderCell: {
    flex: 1,
  },
  compareHeaderLabel: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.subtext,
  },
  compareHeaderValue: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.text,
    fontWeight: "600",
    marginTop: theme.spacing.xs,
  },
  compareRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: theme.spacing.xs,
  },
  compareLabel: {
    flex: 1.2,
    fontSize: theme.fontSize.xs,
    color: theme.colors.subtext,
  },
  compareValue: {
    flex: 0.9,
    fontSize: theme.fontSize.sm,
    color: theme.colors.text,
    fontWeight: "600",
    textAlign: "right",
  },

  /* Budget */
  budgetGrid: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  blockHalf: {
    flex: 1,
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  budgetMain: {
    fontSize: theme.fontSize.lg,
    fontWeight: "700",
    color: theme.colors.text,
    marginTop: theme.spacing.xs,
  },
  budgetSub: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.subtext,
    marginTop: theme.spacing.xs,
  },
  budgetPositive: {
    fontSize: theme.fontSize.sm,
    color: "#16a34a",
    marginTop: theme.spacing.xs,
  },
  budgetNegative: {
    fontSize: theme.fontSize.sm,
    color: "#dc2626",
    marginTop: theme.spacing.xs,
  },
});
