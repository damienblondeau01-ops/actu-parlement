// app/(tabs)/deputes/[id].tsx
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  ErrorView,
  LoadingView,
  ScreenContainer,
  SectionTitle,
} from "../../../lib/parlement-common";
import { supabase } from "../../../lib/supabaseClient";
import { theme } from "../../../lib/theme";
import { Depute, Scrutin, VoteDepute } from "../../../lib/types";

type VoteWithScrutin = VoteDepute & {
  scrutin?: Scrutin | null;
};

function getGroupLabel(d?: Depute | null): string {
  if (!d) return "Sans groupe";
  const abrev = d.groupeAbrev?.trim() || "";
  const full = d.groupe?.trim() || "";
  if (!abrev && !full) return "Sans groupe";
  if (abrev && full && abrev !== full) return `${abrev} • ${full}`;
  return abrev || full;
}

export default function DeputeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [depute, setDepute] = useState<Depute | null>(null);
  const [votes, setVotes] = useState<VoteDepute[]>([]);
  const [scrutinsById, setScrutinsById] = useState<Record<string, Scrutin>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        // 1️⃣ Trouver le député (id_an, sinon id, sinon row_id)
        let found: Depute | null = null;

        const tryQuery = async (column: string, value: string | number) => {
          const { data, error } = await supabase
            .from("deputes_officiels")
            .select("*")
            .eq(column, value)
            .maybeSingle();

          if (error) {
            console.error("Erreur chargement député :", error);
            return null;
          }
          return data as Depute | null;
        };

        found = await tryQuery("id_an", id);
        if (!found) {
          found = await tryQuery("id", id);
        }
        if (!found) {
          const asNumber = Number(id);
          if (!Number.isNaN(asNumber)) {
            found = await tryQuery("row_id", asNumber);
          }
        }

        if (!found) {
          setError("Député introuvable.");
          setLoading(false);
          return;
        }

        setDepute(found);

        // 2️⃣ Votes de ce député
        const { data: votesData, error: votesError } = await supabase
          .from("votes_deputes")
          .select("*")
          .eq("depute_row_id", found.row_id);

        if (votesError) {
          console.error("Erreur chargement votes député :", votesError);
          setVotes([]);
        } else {
          setVotes((votesData || []) as VoteDepute[]);
        }

        // 3️⃣ Scrutins liés
        const scrutinIds = Array.from(
          new Set((votesData || []).map((v: any) => v.scrutin_id))
        ).filter(Boolean) as string[];

        if (scrutinIds.length > 0) {
          const { data: scrData, error: scrError } = await supabase
            .from("scrutins")
            .select("*")
            .in("id", scrutinIds);

          if (scrError) {
            console.error("Erreur scrutins liés au député :", scrError);
          } else {
            const map: Record<string, Scrutin> = {};
            (scrData || []).forEach((s: any) => {
              if (s.id) map[s.id] = s as Scrutin;
            });
            setScrutinsById(map);
          }
        }
      } catch (e) {
        console.error("Erreur inattendue DeputeDetailScreen :", e);
        setError("Une erreur inattendue est survenue.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id]);

  const enrichedVotes: VoteWithScrutin[] = useMemo(
    () =>
      votes.map((v) => ({
        ...v,
        scrutin: scrutinsById[v.scrutin_id],
      })),
    [votes, scrutinsById]
  );

  const stats = useMemo(() => {
    let pour = 0;
    let contre = 0;
    let abst = 0;

    votes.forEach((v) => {
      const value = (v.vote || "").toLowerCase();
      if (value === "pour") pour += 1;
      else if (value === "contre") contre += 1;
      else if (value === "abstention") abst += 1;
    });

    const total = pour + contre + abst;
    const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

    return {
      total,
      pour,
      contre,
      abst,
      pctPour: pct(pour),
      pctContre: pct(contre),
      pctAbst: pct(abst),
    };
  }, [votes]);

  if (loading) {
    return <LoadingView message="Chargement de la fiche député..." />;
  }

  if (error || !depute) {
    return <ErrorView message={error ?? "Député introuvable."} />;
  }

  const photo = (depute as any).photoUrl || depute.photourl || null;
  const fullName =
    depute.nomcomplet || depute.nomComplet || `${depute.prenom} ${depute.nom}`;
  const groupLabel = getGroupLabel(depute);
  const subtitleParts: string[] = [];
  if (depute.departementNom && depute.departementCode) {
    subtitleParts.push(
      `${depute.departementNom} (${depute.departementCode})`
    );
  }
  if (depute.circo != null) {
    subtitleParts.push(`Circo ${depute.circo}`);
  }
  const headerSubtitle = subtitleParts.join(" • ") || groupLabel;

  return (
    <ScreenContainer title={fullName} subtitle={headerSubtitle}>
      {/* 🔙 Bouton retour, même style que page loi */}
      <Pressable style={styles.backRow} onPress={() => router.back()}>
        <Ionicons
          name="chevron-back"
          size={18}
          color={theme.colors.primary}
        />
        <Text style={styles.backText}>Retour</Text>
      </Pressable>

      {/* Bloc identité */}
      <View style={styles.identityBlock}>
        {photo ? (
          <Image source={{ uri: photo }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarFallbackText}>
              {depute.prenom?.[0]}
              {depute.nom?.[0]}
            </Text>
          </View>
        )}

        <View style={styles.identityMain}>
          <Text style={styles.identityName}>{fullName}</Text>
          <View style={styles.groupChipRow}>
            <View style={styles.groupChip}>
              <Text style={styles.groupChipText}>{groupLabel}</Text>
            </View>
          </View>

          <Text style={styles.identityDetails}>
            {depute.departementNom} ({depute.departementCode}) • Circo{" "}
            {depute.circo ?? "?"}
          </Text>
        </View>
      </View>

      {/* Stats synthétiques */}
      <SectionTitle>Activité de vote</SectionTitle>
      <View style={styles.metricsRow}>
        <View style={styles.metricCard}>
          <View style={styles.metricIconCircle}>
            <MaterialCommunityIcons
              name="gavel"
              size={18}
              color={theme.colors.primary}
            />
          </View>
          <Text style={styles.metricValue}>{stats.total}</Text>
          <Text style={styles.metricLabel}>Votes recensés</Text>
        </View>
        <View style={styles.metricCard}>
          <View style={styles.metricIconCircle}>
            <Ionicons
              name="checkmark-circle"
              size={18}
              color={theme.colors.primary}
            />
          </View>
          <Text style={styles.metricValue}>{stats.pctPour}%</Text>
          <Text style={styles.metricLabel}>Pour</Text>
        </View>
        <View style={styles.metricCard}>
          <View style={styles.metricIconCircle}>
            <Ionicons
              name="close-circle"
              size={18}
              color={theme.colors.primary}
            />
          </View>
          <Text style={styles.metricValue}>{stats.pctContre}%</Text>
          <Text style={styles.metricLabel}>Contre</Text>
        </View>
      </View>

      {/* Liste des derniers votes */}
      <SectionTitle>Derniers votes</SectionTitle>
      {enrichedVotes.length === 0 ? (
        <Text style={styles.emptyText}>
          Aucun vote détaillé n’est disponible pour ce député.
        </Text>
      ) : (
        <FlatList
          data={enrichedVotes.slice(0, 20)}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          renderItem={({ item }) => <VoteItemRow vote={item} />}
          ItemSeparatorComponent={() => <View style={styles.voteSeparator} />}
        />
      )}
    </ScreenContainer>
  );
}

const VoteItemRow: React.FC<{ vote: VoteWithScrutin }> = ({ vote }) => {
  const scrutin = vote.scrutin;

  // on cast en any pour accéder aux champs non typés dans Scrutin
  const s: any = scrutin;

  const title =
    s?.titre ||
    s?.titre_loi ||
    s?.objet ||
    (s?.numero != null ? `Scrutin n°${s.numero}` : "Scrutin");

  const label = (vote.vote || "").toLowerCase();
  let icon: keyof typeof Ionicons.glyphMap = "help-circle-outline";
  let color = theme.colors.subtext;
  let text = "Non renseigné";

  if (label === "pour") {
    icon = "checkmark-circle";
    color = "#16a34a";
    text = "Pour";
  } else if (label === "contre") {
    icon = "close-circle";
    color = "#dc2626";
    text = "Contre";
  } else if (label === "abstention") {
    icon = "pause-circle";
    color = "#f97316";
    text = "Abstention";
  }

  return (
    <View style={styles.voteRow}>
      <View style={styles.voteMain}>
        <Text style={styles.voteTitle} numberOfLines={2}>
          {title}
        </Text>
        {s?.date_scrutin && (
          <Text style={styles.voteMeta}>{s.date_scrutin}</Text>
        )}
      </View>
      <View style={styles.voteRight}>
        <Ionicons name={icon} size={18} color={color} />
        <Text style={[styles.voteChip, { color }]}>{text}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  // 🔙 bouton retour aligné (même style que sur les lois)
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: theme.spacing.sm,
  },
  backText: {
    marginLeft: 4,
    fontSize: theme.fontSize.sm,
    color: theme.colors.primary,
    fontWeight: "500",
  },

  identityBlock: {
    flexDirection: "row",
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.md,
  },
  avatar: {
    width: 72,
    height: 96,
    borderRadius: 10,
    marginRight: theme.spacing.md,
    backgroundColor: "#ddd",
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  avatarFallbackText: {
    fontWeight: "700",
    fontSize: 22,
    color: "#555",
  },
  identityMain: {
    flex: 1,
    justifyContent: "center",
  },
  identityName: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: 4,
  },
  identityDetails: {
    fontSize: 13,
    color: theme.colors.subtext,
    marginTop: 4,
  },
  groupChipRow: {
    flexDirection: "row",
    marginTop: 2,
  },
  groupChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: theme.colors.chipBackground,
  },
  groupChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.text,
  },

  metricsRow: {
    flexDirection: "row",
    marginBottom: theme.spacing.md,
    marginTop: theme.spacing.xs,
  },
  metricCard: {
    flex: 1,
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginRight: theme.spacing.sm,
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

  emptyText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.subtext,
  },

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
  voteMeta: {
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
});
