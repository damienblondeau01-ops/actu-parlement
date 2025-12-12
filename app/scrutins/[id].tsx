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
  Image,
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

// Législature courante que tu cibles pour les derniers scrutins
const CURRENT_LEGISLATURE = 17;

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
   🧩 Helper : normaliser le numéro de scrutin
   - "VTANR5L17V4587" -> "4587"
   - "4587" -> "4587"
=========================================================== */

function normalizeNumeroScrutin(numero: string | number): string {
  const raw = String(numero);
  const match = raw.match(/(\d+)/g);
  if (match && match.length > 0) {
    // On prend le dernier bloc de chiffres (souvent le numéro de scrutin)
    return match[match.length - 1];
  }
  return raw;
}

/**
 * Détection simple d'un id_an de l'Assemblée (VTANR5L17Vxxxx, etc.)
 */
function looksLikeIdAn(value: string | null | undefined): boolean {
  if (!value) return false;
  const s = String(value);
  // Pattern assez large mais suffisant : contient "LxxV" et commence par VTAN
  return /^VTANR?\d*L\d+V\d+/.test(s);
}

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
   🟦 Row de vote détaillé (député)
=========================================================== */

function VoteRow({
  vote,
  onPress,
}: {
  vote: VoteDeputeScrutin;
  onPress?: () => void;
}) {
  const fullName =
    vote.nom_depute ||
    `${(vote as any).prenom ?? ""} ${(vote as any).nom ?? ""}`.trim() ||
    "Député inconnu";

  const groupLabel =
    (vote as any).groupe_actuel ||
    (vote as any).groupe_abrev_actuel ||
    (vote as any).groupe_abrev_opendata ||
    (vote as any).groupe_id_opendata ||
    (vote as any).groupe ||
    (vote as any).groupeAbrev ||
    (vote as any).groupe_abrev ||
    "Groupe inconnu";

  const rawPosition = (vote.position ?? (vote as any).vote ?? "")
    .toString()
    .toLowerCase();

  let pillLabel = "Non votant";
  let pillBg = "#64748b"; // gris
  let pillText = "#0f172a";

  if (rawPosition.includes("pour")) {
    pillLabel = "Pour";
    pillBg = "#16a34a";
    pillText = "#f9fafb";
  } else if (rawPosition.includes("contre")) {
    pillLabel = "Contre";
    pillBg = "#dc2626";
    pillText = "#f9fafb";
  } else if (rawPosition.includes("abst")) {
    pillLabel = "Abstention";
    pillBg = "#eab308";
    pillText = "#0f172a";
  }

  const initial =
    fullName && fullName.trim().length > 0
      ? fullName.trim().charAt(0).toUpperCase()
      : "?";

  return (
    <Pressable onPress={onPress} disabled={!onPress} style={styles.voteRow}>
      <View style={styles.voteLeft}>
        {(vote as any).photo_url ? (
          <Image
            source={{ uri: (vote as any).photo_url }}
            style={styles.voteAvatar}
          />
        ) : (
          <View style={styles.voteAvatarFallback}>
            <Text style={styles.voteAvatarInitial}>{initial}</Text>
          </View>
        )}
        <View style={styles.voteTextCol}>
          <Text style={styles.voteName} numberOfLines={1}>
            {fullName}
          </Text>
          <Text style={styles.voteGroup} numberOfLines={1}>
            {groupLabel}
          </Text>
        </View>
      </View>
      <View style={styles.voteRight}>
        <View style={[styles.votePill, { backgroundColor: pillBg }]}>
          <Text style={[styles.votePillText, { color: pillText }]}>
            {pillLabel}
          </Text>
        </View>
      </View>
    </Pressable>
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

  // Pour comparer la timeline au scrutin courant de manière robuste
  const currentNumero = useMemo(
    () => (id ? normalizeNumeroScrutin(String(id)) : null),
    [id]
  );

  /* ===========================================================
     1️⃣ Load Scrutin + Votes + Synthèse
  ============================================================ */

  useEffect(() => {
    if (!id) {
      setError("Aucun numéro de scrutin fourni.");
      setLoading(false);
      return;
    }

    const rawId = String(id); // ex. "VTANR5L17V4587" ou "4587"
    const numeroNormalise = normalizeNumeroScrutin(rawId); // ex. "4587"

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        // On garde le comportement existant : fetchScrutinAvecVotes gère le rawId
        const {
          scrutin: scrutinData,
          votes: votesData,
          error: queryError,
        } = await fetchScrutinAvecVotes(rawId);

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

        // Synthèse via votes_par_scrutin_synthese avec le NUMÉRO NORMALISÉ
        const { data: synthRows, error: synthError } = await supabase
          .from("votes_par_scrutin_synthese")
          .select("*")
          .eq("numero_scrutin", numeroNormalise);

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

        // Loi + timeline : on durcit la logique d'association
        await loadLoiEtTimeline(numeroNormalise, rawId);
        setLoading(false);
      } catch (e: any) {
        console.warn("[SCRUTIN DETAIL] Erreur inattendue:", e);
        setError(e?.message ?? "Erreur inconnue lors du chargement du scrutin.");
        setLoading(false);
      }
    };

    load();
  }, [id]);

  /**
   * 🔐 Durci :
   * 1. On tente d'abord de trouver la loi via id_an (si l'ID ressemble à un id_an AN).
   * 2. Si échec, fallback via numero + legislature.
   */
  async function loadLoiEtTimeline(numero: string, scrutinKey?: string) {
    try {
      setLoiLoading(true);

      let loiId: string | null = null;

      // 1️⃣ Tentative par id_an (clé unique AN)
      if (looksLikeIdAn(scrutinKey)) {
        const { data: byId, error: byIdError } = await supabase
          .from("scrutins_data")
          .select("loi_id")
          .eq("id_an", scrutinKey)
          .maybeSingle();

        if (byIdError) {
          console.warn(
            "[SCRUTIN DETAIL] Erreur scrutins_data (lookup par id_an):",
            byIdError
          );
        } else if (byId && byId.loi_id) {
          loiId = byId.loi_id as string;
        }
      }

      // 2️⃣ Fallback par numero + legislature
      if (!loiId) {
        const { data: byNumero, error: byNumeroError } = await supabase
          .from("scrutins_data")
          .select("loi_id")
          .eq("numero", numero)
          .eq("legislature", CURRENT_LEGISLATURE)
          .maybeSingle();

        if (byNumeroError) {
          console.warn(
            "[SCRUTIN DETAIL] Erreur scrutins_data (lookup par numero):",
            byNumeroError
          );
        } else if (byNumero && byNumero.loi_id) {
          loiId = byNumero.loi_id as string;
        }
      }

      if (!loiId) {
        // On n'a pas réussi à associer ce scrutin à une loi
        setLoi(null);
        setTimeline([]);
        setLoiLoading(false);
        return;
      }

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
        console.warn("[SCRUTIN DETAIL] Erreur scrutins_loi_enrichis:", scrError);
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

      // Nom du groupe : on cible d'abord les colonnes de la vue votes_deputes_detail
      const rawGroup =
        anyV.groupe_actuel ??
        anyV.groupe_abrev_actuel ??
        anyV.groupe_id_opendata ??
        anyV.groupe_abrev_opendata ??
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

  const nbPour: number = syntheseVotes?.nb_pour ?? scrutin?.nb_pour ?? 0;
  const nbContre: number = syntheseVotes?.nb_contre ?? scrutin?.nb_contre ?? 0;
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
                <Chip label={`Scrutins ${loi.nb_scrutins_total ?? "—"}`} />
                <Chip label={`Articles ${loi.nb_articles ?? "—"}`} />
                <Chip label={`Amendements ${loi.nb_amendements ?? "—"}`} />
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
          <DonutChart pour={nbPour} contre={nbContre} abstention={nbAbst} />
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
                currentNumero &&
                String(item.numero_scrutin) === String(currentNumero);
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
                  {g.contre.length}, Abstention {g.abst.length}, Non votant{" "}
                  {g.nv.length}
                </Text>
              </View>
            );
          })}
        </View>

        {/* 🟦 Votes détaillés par député */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Votes détaillés</Text>

          {groupedVotes.length === 0 && (
            <Text style={styles.grey}>
              Aucun vote disponible pour ce scrutin.
            </Text>
          )}

          {groupedVotes.map((g: GroupedVotes) => {
            const allVotes = [
              ...g.pour,
              ...g.contre,
              ...g.abst,
              ...g.nv,
            ];
            if (allVotes.length === 0) return null;

            return (
              <View key={g.groupe} style={styles.groupBlock}>
                <Text style={styles.groupTitle}>{g.groupe}</Text>
                {allVotes.map((v) => (
                  <VoteRow
                    key={`${g.groupe}-${v.id_depute}-${v.position}`}
                    vote={v}
                    onPress={
                      v.id_depute
                        ? () => router.push(`/deputes/${v.id_depute}`)
                        : undefined
                    }
                  />
                ))}
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

  /* VOTE ROW */
  voteRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  voteLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 8,
  },
  voteAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
  },
  voteAvatarFallback: {
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
  voteAvatarInitial: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  voteTextCol: {
    flex: 1,
  },
  voteName: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600",
  },
  voteGroup: {
    color: colors.subtext,
    fontSize: 11,
    marginTop: 1,
  },
  voteRight: {
    marginLeft: 8,
  },
  votePill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  votePillText: {
    fontSize: 11,
    fontWeight: "600",
  },
});
