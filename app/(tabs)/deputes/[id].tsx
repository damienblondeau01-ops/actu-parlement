// app/(tabs)/deputes/[id].tsx

import { useLocalSearchParams, useRouter } from "expo-router";
import React, {
  useEffect,
  useState,
  useMemo,
  useCallback,
} from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../../lib/supabaseClient";
import { theme } from "../../../lib/theme";
import { Image as ExpoImage } from "expo-image";

type DeputeRow = {
  id_an: string | null;
  nomComplet: string | null;
  nomcomplet: string | null;
  prenom: string | null;
  nom: string | null;
  groupeAbrev: string | null;
  groupe: string | null;
  circonscription: string | null;
  departementNom: string | null;
  departementCode: string | null;
  age: number | string | null;
  job: string | null;
  profession: string | null;
  scoreParticipation: number | string | null;
  scoreLoyaute: number | string | null;
  scoreMajorite: number | string | null;
  scoreparticipation: number | string | null;
  scoreloyaute: number | string | null;
  scoremajorite: number | string | null;
  photoUrl: string | null;
  photourl: string | null;
  emoji: string | null;
  resume: string | null;
  bio: string | null;
  datePriseFonction: string | null;
  experienceDepute: number | string | null;
  legislature: number | string | null;
};

type SafeScores = {
  participation: number | null;
  loyaute: number | null;
  majorite: number | null;
};

type RecentVote = {
  numero_scrutin: string;
  vote: string | null;
  titre: string | null;
  resultat: string | null;
};

type VoteBreakdown = {
  pour: number;
  contre: number;
  abstention: number;
  nv: number;
  total: number;
};

type TabKey = "ABOUT" | "VOTES" | "ACTIVITY";

export default function DeputeDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();

  const [depute, setDepute] = useState<DeputeRow | null>(null);
  const [scores, setScores] = useState<SafeScores>({
    participation: null,
    loyaute: null,
    majorite: null,
  });
  const [activeTab, setActiveTab] = useState<TabKey>("ABOUT");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [totalVotesCount, setTotalVotesCount] = useState<number | null>(
    null
  );
  const [recentVotes, setRecentVotes] = useState<RecentVote[]>([]);
  const [recentVotesLoading, setRecentVotesLoading] =
    useState<boolean>(false);
  const [voteBreakdown, setVoteBreakdown] =
    useState<VoteBreakdown | null>(null);

  const deputeName = useMemo(() => {
    if (!depute) return "";
    return (
      depute.nomComplet ||
      depute.nomcomplet ||
      `${depute.prenom ?? ""} ${depute.nom ?? ""}`.trim()
    );
  }, [depute]);

  const deputeInitials = useMemo(() => {
    if (!deputeName) return "";
    const parts = deputeName.split(" ").filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0] ?? ""}${
        parts[parts.length - 1][0] ?? ""
      }`.toUpperCase();
    }
    return deputeName.slice(0, 2).toUpperCase();
  }, [deputeName]);

  const photoUrl = useMemo(() => {
    if (!depute) return null;
    return depute.photoUrl || depute.photourl || null;
  }, [depute]);

  const circoLabel = useMemo(() => {
    if (!depute) return null;
    if (depute.circonscription) return depute.circonscription;
    if (depute.departementNom || depute.departementCode) {
      return `${depute.departementNom ?? ""}${
        depute.departementCode ? ` (${depute.departementCode})` : ""
      }`.trim();
    }
    return null;
  }, [depute]);

  const computeSafeNumber = (value: number | string | null): number | null => {
    if (value === null || value === undefined) return null;
    if (typeof value === "number") return value;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  };

  const formatPct = (value: number | null): string => {
    if (value === null || value === undefined) return "—";
    return `${value.toFixed(1)} %`;
  };

  const yearsExperience = useMemo(() => {
    if (!depute) return null;
    if (
      depute.experienceDepute !== null &&
      depute.experienceDepute !== undefined
    ) {
      const num = computeSafeNumber(depute.experienceDepute);
      if (num !== null) return num;
    }
    if (depute.datePriseFonction) {
      const start = new Date(depute.datePriseFonction);
      if (!Number.isNaN(start.getTime())) {
        const now = new Date();
        const diff = now.getTime() - start.getTime();
        const years = diff / (1000 * 60 * 60 * 24 * 365.25);
        return Math.max(0, Math.floor(years));
      }
    }
    return null;
  }, [depute]);

  const mandatText = useMemo(() => {
    if (!depute) {
      return "Mandat en cours à l'Assemblée nationale.";
    }

    const legNum = computeSafeNumber(depute.legislature);
    const legSuffix = legNum
      ? `${legNum}ᵉ législature`
      : "législature en cours";

    if (!depute.datePriseFonction) {
      return `Mandat en cours durant la ${legSuffix}.`;
    }
    const d = new Date(depute.datePriseFonction);
    if (Number.isNaN(d.getTime())) {
      return `Mandat en cours durant la ${legSuffix}.`;
    }
    return `Mandat en cours depuis le ${d.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    })} (${legSuffix}).`;
  }, [depute]);

  const loadDepute = useCallback(async () => {
    if (!id) {
      console.log("[DEPUTE SCREEN] param id manquant");
      setError("Aucun ID de député fourni.");
      setDepute(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from("deputes_officiels")
        .select(
          `
          id_an,
          nomComplet,
          nomcomplet,
          prenom,
          nom,
          groupeAbrev,
          groupe,
          circonscription,
          departementNom,
          departementCode,
          age,
          job,
          profession,
          scoreParticipation,
          scoreLoyaute,
          scoreMajorite,
          scoreparticipation,
          scoreloyaute,
          scoremajorite,
          photoUrl,
          photourl,
          emoji,
          resume,
          bio,
          datePriseFonction,
          experienceDepute,
          legislature
        `
        )
        .eq("id_an", id)
        .maybeSingle();

      if (error) {
        console.warn("[DEPUTE SCREEN] Erreur Supabase =", error);
        setError("Impossible de charger ce député.");
        setDepute(null);
        return;
      }

      if (!data) {
        setError(`Aucun député trouvé pour l'ID ${id}`);
        setDepute(null);
        return;
      }

      const row = data as DeputeRow;
      setDepute(row);

      const participationRaw =
        row.scoreParticipation ?? row.scoreparticipation ?? null;
      const loyauteRaw = row.scoreLoyaute ?? row.scoreloyaute ?? null;
      const majoriteRaw = row.scoreMajorite ?? row.scoremajorite ?? null;

      const safeScores: SafeScores = {
        participation: computeSafeNumber(participationRaw),
        loyaute: computeSafeNumber(loyauteRaw),
        majorite: computeSafeNumber(majoriteRaw),
      };

      setScores(safeScores);
    } catch (e) {
      console.warn("[DEPUTE SCREEN] Erreur inattendue =", e);
      setError("Erreur inattendue lors du chargement du député.");
      setDepute(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadQuickStats = useCallback(async (deputeId: string) => {
    try {
      const { count, error } = await supabase
        .from("votes_deputes_detail")
        .select("numero_scrutin", { count: "exact", head: true })
        .eq("id_depute", deputeId);

      if (error) {
        console.warn(
          "[DEPUTE SCREEN] Erreur chargement stats rapides =",
          error
        );
        return;
      }

      setTotalVotesCount(count ?? null);
    } catch (e) {
      console.warn("[DEPUTE SCREEN] Erreur inattendue stats rapides =", e);
    }
  }, []);

  const loadRecentVotes = useCallback(async (deputeId: string) => {
    try {
      setRecentVotesLoading(true);
      setRecentVotes([]);

      // 1️⃣ On récupère les 5 derniers votes du député via la vue votes_deputes_detail
      const { data: votes, error: votesError } = await supabase
        .from("votes_deputes_detail")
        .select("numero_scrutin, vote")
        .eq("id_depute", deputeId)
        .order("numero_scrutin", { ascending: false })
        .limit(5);

      if (votesError) {
        console.warn(
          "[DEPUTE SCREEN] Erreur chargement votes récents =",
          votesError
        );
        return;
      }

      if (!votes || votes.length === 0) {
        return;
      }

      // 2️⃣ On regarde les scrutins correspondants dans scrutins_data
      const numeros = votes
        .map((v: any) => v.numero_scrutin as string | null)
        .filter((v): v is string => !!v);

      if (numeros.length === 0) {
        return;
      }

      const { data: scrutins, error: scrutinsError } = await supabase
        .from("scrutins_data")
        .select("numero, titre, resultat")
        .in("numero", numeros);

      if (scrutinsError) {
        console.warn(
          "[DEPUTE SCREEN] Erreur chargement scrutins récents =",
          scrutinsError
        );
        return;
      }

      const scrutinsByNumero =
        scrutins?.reduce<
          Record<string, { titre: string | null; resultat: string | null }>
        >((acc: any, s: any) => {
          if (s.numero !== null && s.numero !== undefined) {
            const key = String(s.numero);
            acc[key] = {
              titre: s.titre ?? null,
              resultat: s.resultat ?? null,
            };
          }
          return acc;
        }, {}) ?? {};

      // 3️⃣ Merge votes + infos scrutins
      const merged: RecentVote[] = (votes as any[]).map((v) => {
        const key = String(v.numero_scrutin);
        const info = scrutinsByNumero[key] ?? {
          titre: null,
          resultat: null,
        };
        return {
          numero_scrutin: key,
          vote: v.vote ?? null,
          titre: info.titre,
          resultat: info.resultat,
        };
      });

      setRecentVotes(merged);
    } catch (e) {
      console.warn("[DEPUTE SCREEN] Erreur inattendue votes récents =", e);
    } finally {
      setRecentVotesLoading(false);
    }
  }, []);

  const loadVoteBreakdown = useCallback(async (deputeId: string) => {
    try {
      const { data, error } = await supabase
        .from("votes_deputes_detail")
        .select("position, vote")
        .eq("id_depute", deputeId);

      if (error) {
        console.warn(
          "[DEPUTE SCREEN] Erreur chargement répartition votes =",
          error
        );
        return;
      }

      let pour = 0;
      let contre = 0;
      let abstention = 0;
      let nv = 0;

      (data ?? []).forEach((row: any) => {
        const raw = (
          row.position ?? row.vote ?? ""
        ).toString().toLowerCase();

        if (raw.includes("pour")) {
          pour += 1;
        } else if (raw.includes("contre")) {
          contre += 1;
        } else if (raw.includes("abst")) {
          abstention += 1;
        } else {
          nv += 1;
        }
      });

      const total = pour + contre + abstention + nv;
      setVoteBreakdown({ pour, contre, abstention, nv, total });
    } catch (e) {
      console.warn(
        "[DEPUTE SCREEN] Erreur inattendue répartition votes =",
        e
      );
    }
  }, []);

  useEffect(() => {
    loadDepute();
  }, [loadDepute]);

  useEffect(() => {
    if (id) {
      // id = id_an du député (ex: PA123456)
      loadQuickStats(id);
      loadRecentVotes(id);
      loadVoteBreakdown(id);
    }
  }, [id, loadQuickStats, loadRecentVotes, loadVoteBreakdown]);

  const renderTabButton = (key: TabKey, label: string) => {
    const active = activeTab === key;
    return (
      <Pressable
        onPress={() => setActiveTab(key)}
        style={[styles.tabItem, active && styles.tabItemActive]}
      >
        <Text
          style={[styles.tabLabel, active && styles.tabLabelActive]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </Pressable>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Chargement du député…</Text>
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

  if (!depute) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.errorText}>Aucun député à afficher.</Text>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Retour</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* 🔹 HEADER FIXE : image, avatar, nom/parti, onglets */}
      <View style={styles.headerFixed}>
        <View style={styles.headerContainer}>
          <View style={styles.bannerWrapper}>
            <ExpoImage
              source={require("../../../assets/header/assemblee.jpg")}
              style={styles.bannerImage}
              contentFit="cover"
            />
            <View style={styles.bannerOverlay} />

            {/* Bouton retour flottant */}
            <View style={styles.headerTopBar}>
              <Pressable
                onPress={() => router.back()}
                style={styles.backCircle}
              >
                <Text style={styles.backCircleIcon}>←</Text>
              </Pressable>
            </View>
          </View>

          {/* Avatar centré */}
          <View style={styles.avatarOuter}>
            <View style={styles.avatarInner}>
              {photoUrl ? (
                <ExpoImage
                  source={{ uri: photoUrl }}
                  style={styles.avatarImage}
                  contentFit="cover"
                />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarInitials}>{deputeInitials}</Text>
                </View>
              )}
            </View>
          </View>

          {/* Carte identité compacte */}
          <View style={styles.headerCard}>
            <Text style={styles.nameText} numberOfLines={2}>
              {depute.emoji ? `${depute.emoji} ${deputeName}` : deputeName}
            </Text>

            {depute.groupe && (
              <View style={styles.chipRow}>
                <View style={styles.chip}>
                  <Text style={styles.chipText}>
                    {depute.groupeAbrev
                      ? `${depute.groupe} (${depute.groupeAbrev})`
                      : depute.groupe}
                  </Text>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Onglets fixés sous l'encart */}
        <View style={styles.tabsHeaderCard}>
          <View style={styles.tabsWrapper}>
            {renderTabButton("ABOUT", "À propos")}
            {renderTabButton("VOTES", "Votes clés")}
            {renderTabButton("ACTIVITY", "Activité")}
          </View>
        </View>
      </View>

      {/* 🔹 CONTENU SCROLLABLE : uniquement le contenu des onglets */}
      <ScrollView
        style={styles.contentScroll}
        contentContainerStyle={styles.contentScrollContent}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === "ABOUT" && (
          <View style={styles.tabCard}>
            <Text style={styles.sectionTitle}>À propos du député</Text>
            {depute.resume ? (
              <Text style={styles.paragraph}>{depute.resume}</Text>
            ) : depute.bio ? (
              <Text style={styles.paragraph}>{depute.bio}</Text>
            ) : (
              <Text style={styles.paragraphSecondary}>
                Ce député exerce son mandat à l&apos;Assemblée nationale et
                siège au sein de son groupe politique. Les informations
                détaillées sur son parcours et ses centres d&apos;intérêt
                seront prochainement disponibles.
              </Text>
            )}

            <View style={styles.aboutInfoCard}>
              {depute.age && (
                <View style={styles.aboutInfoRow}>
                  <Text style={styles.aboutInfoLabel}>Âge</Text>
                  <Text style={styles.aboutInfoValue}>{depute.age} ans</Text>
                </View>
              )}
              {depute.profession && (
                <View style={styles.aboutInfoRow}>
                  <Text style={styles.aboutInfoLabel}>Profession</Text>
                  <Text style={styles.aboutInfoValue}>
                    {depute.profession}
                  </Text>
                </View>
              )}
              {(circoLabel ||
                depute.departementNom ||
                depute.departementCode) && (
                <View style={styles.aboutInfoRow}>
                  <Text style={styles.aboutInfoLabel}>Circonscription</Text>
                  <Text style={styles.aboutInfoValue}>
                    {circoLabel ??
                      `${depute.departementNom ?? ""}${
                        depute.departementCode
                          ? ` (${depute.departementCode})`
                          : ""
                      }`.trim()}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {activeTab === "VOTES" && (
          <View style={styles.tabCard}>
            <Text style={styles.sectionTitle}>Votes clés du député</Text>
            <View style={styles.statCard}>
              <Text style={styles.paragraph}>
                Retrouvez ici une sélection de scrutins marquants montrant les
                prises de position du député :
              </Text>
              <Text style={styles.paragraphSecondary}>
                • Votes sur les projets de loi majeurs{"\n"}
                • Amendements importants{"\n"}
                • Scrutins publics engageant la responsabilité du
                gouvernement{"\n"}
                • Votes où le député se distingue de son groupe politique
              </Text>
              <Text style={[styles.paragraphSecondary, { marginTop: 6 }]}>
                Les votes clés sont générés automatiquement à partir des
                données officielles OpenData.
              </Text>
            </View>

            <View style={styles.recentVotesSection}>
              <Text style={styles.subSectionTitle}>Derniers votes</Text>
              {recentVotesLoading && (
                <Text style={styles.paragraphSecondary}>
                  Chargement des derniers votes…
                </Text>
              )}
              {!recentVotesLoading && recentVotes.length === 0 && (
                <Text style={styles.paragraphSecondary}>
                  Les derniers votes de ce député seront bientôt disponibles.
                </Text>
              )}
              {!recentVotesLoading &&
                recentVotes.map((vote) => {
                  const voteLabel =
                    vote.vote === "pour"
                      ? "Pour"
                      : vote.vote === "contre"
                      ? "Contre"
                      : vote.vote === "abstention"
                      ? "Abstention"
                      : vote.vote === "nv"
                      ? "Non votant"
                      : vote.vote ?? "—";

                  let pillBackground: string =
                    theme.colors.surface || "#020617";
                  if (vote.vote === "pour") {
                    pillBackground = "rgba(34,197,94,0.16)";
                  } else if (vote.vote === "contre") {
                    pillBackground = "rgba(239,68,68,0.16)";
                  } else if (vote.vote === "abstention") {
                    pillBackground = "rgba(234,179,8,0.16)";
                  }

                  return (
                    <Pressable
                      key={vote.numero_scrutin}
                      style={styles.recentVoteCard}
                      onPress={() =>
                        router.push(`/scrutins/${vote.numero_scrutin}`)
                      }
                    >
                      <Text
                        style={styles.recentVoteTitle}
                        numberOfLines={2}
                      >
                        {vote.titre ||
                          `Scrutin n°${vote.numero_scrutin}`}
                      </Text>
                      <View style={styles.recentVoteMetaRow}>
                        <View
                          style={[
                            styles.votePill,
                            { backgroundColor: pillBackground },
                          ]}
                        >
                          <Text style={styles.votePillText}>{voteLabel}</Text>
                        </View>
                        {vote.resultat && (
                          <Text style={styles.recentVoteResultText}>
                            Résultat : {vote.resultat}
                          </Text>
                        )}
                      </View>
                    </Pressable>
                  );
                })}
            </View>
          </View>
        )}

        {activeTab === "ACTIVITY" && (
          <View style={styles.tabCard}>
            <Text style={styles.sectionTitle}>Activité parlementaire</Text>
            <View style={styles.statsRow}>
              <View style={styles.statCardLarge}>
                <Text style={styles.statLabel}>Participation</Text>
                <Text style={styles.statValue}>
                  {formatPct(scores.participation)}
                </Text>
              </View>
              <View style={styles.statCardLarge}>
                <Text style={styles.statLabel}>Loyauté envers son groupe</Text>
                <Text style={styles.statValue}>
                  {formatPct(scores.loyaute)}
                </Text>
              </View>
              <View style={styles.statCardLarge}>
                <Text style={styles.statLabel}>
                  Alignement avec la majorité
                </Text>
                <Text style={styles.statValue}>
                  {formatPct(scores.majorite)}
                </Text>
              </View>
            </View>

            <View style={styles.quickContextCard}>
              <View style={styles.quickContextRow}>
                <View style={styles.quickContextItem}>
                  <Text style={styles.quickContextLabel}>
                    Scrutins votés
                  </Text>
                  <Text style={styles.quickContextValue}>
                    {totalVotesCount !== null ? totalVotesCount : "—"}
                  </Text>
                </View>
                <View style={styles.quickContextItem}>
                  <Text style={styles.quickContextLabel}>Lois suivies</Text>
                  <Text style={styles.quickContextValue}>—</Text>
                </View>
                <View style={styles.quickContextItem}>
                  <Text style={styles.quickContextLabel}>Expérience</Text>
                  <Text style={styles.quickContextValue}>
                    {yearsExperience !== null
                      ? `${yearsExperience} ans`
                      : "—"}
                  </Text>
                </View>
              </View>
            </View>

            {voteBreakdown && (
              <View style={[styles.quickContextCard, { marginTop: 8 }]}>
                <Text style={styles.timelineTitle}>
                  Répartition des votes
                </Text>
                <View style={styles.voteDistRow}>
                  <View style={styles.voteDistItem}>
                    <Text style={styles.voteDistLabel}>Pour</Text>
                    <Text style={styles.voteDistValue}>
                      {voteBreakdown.pour}
                    </Text>
                  </View>
                  <View style={styles.voteDistItem}>
                    <Text style={styles.voteDistLabel}>Contre</Text>
                    <Text style={styles.voteDistValue}>
                      {voteBreakdown.contre}
                    </Text>
                  </View>
                  <View style={styles.voteDistItem}>
                    <Text style={styles.voteDistLabel}>Abstention</Text>
                    <Text style={styles.voteDistValue}>
                      {voteBreakdown.abstention}
                    </Text>
                  </View>
                  <View style={styles.voteDistItem}>
                    <Text style={styles.voteDistLabel}>Non votant</Text>
                    <Text style={styles.voteDistValue}>
                      {voteBreakdown.nv}
                    </Text>
                  </View>
                </View>
                {voteBreakdown.total > 0 && (
                  <Text style={styles.paragraphSecondary}>
                    Total : {voteBreakdown.total} votes nominatifs
                    recensés pour ce député.
                  </Text>
                )}
              </View>
            )}

            <View style={styles.timelineContainer}>
              <Text style={styles.timelineTitle}>Timeline du mandat</Text>
              <Text style={styles.timelineText}>{mandatText}</Text>
            </View>

            <View style={{ marginTop: 8 }}>
              <Text style={styles.paragraphSecondary}>
                Participation : pourcentage de scrutins auxquels le député a
                pris part. Basé sur les votes nominatifs de la 16ᵉ législature.
              </Text>
              <Text style={styles.paragraphSecondary}>
                Loyauté : part des votes où le député a voté en accord avec son
                groupe politique.
              </Text>
              <Text style={styles.paragraphSecondary}>
                Alignement avec la majorité : part des votes où sa position
                correspond à celle de la majorité gouvernementale.
              </Text>
              <Text style={[styles.paragraphSecondary, { marginTop: 6 }]}>
                🗳️ Données issues des votes nominatifs de la 16ᵉ législature
                (OpenData AN).
              </Text>
            </View>
          </View>
        )}

        {/* Footer dans la zone scrollable */}
        <View style={styles.footerNoteContainer}>
          <Text style={styles.footerNote}>
            Données officielles — Assemblée nationale OpenData.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },

  // Partie scrollable (contenu sous les onglets)
  contentScroll: {
    flex: 1,
  },
  contentScrollContent: {
    paddingTop: 8,
    paddingBottom: 100,
  },

  // Centre / états
  center: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  loadingText: {
    marginTop: 8,
    color: theme.colors.subtext,
  },
  errorText: {
    color: theme.colors.danger || "red",
    textAlign: "center",
    marginHorizontal: 16,
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

  // 🔹 HEADER FIXE
  headerFixed: {},
  headerContainer: {
    marginBottom: 0,
  },
  bannerWrapper: {
    height: 110,
    backgroundColor: "#111827",
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: "hidden",
  },
  bannerImage: {
    width: "100%",
    height: "100%",
  },
  bannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15,23,42,0.30)",
  },
  headerTopBar: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backCircle: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: "rgba(15,23,42,0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
  backCircleIcon: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },

  // Avatar centré, un peu d'air avant le nom
  avatarOuter: {
    position: "absolute",
    top: 110 - 42,
    left: "50%",
    marginLeft: -42,
  },
  avatarInner: {
    width: 84,
    height: 84,
    borderRadius: 999,
    borderWidth: 3,
    borderColor: theme.colors.background,
    overflow: "hidden",
    backgroundColor: theme.colors.card,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primarySoft || "rgba(79,70,229,0.16)",
  },
  avatarInitials: {
    color: theme.colors.primary,
    fontWeight: "700",
    fontSize: 24,
  },

  headerCard: {
    marginTop: 54,
    marginHorizontal: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: theme.colors.card,
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  nameText: {
    fontSize: 19,
    fontWeight: "700",
    color: theme.colors.text,
  },
  chipRow: {
    flexDirection: "row",
    marginTop: 6,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: theme.colors.primarySoft || "rgba(79,70,229,0.16)",
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.primary,
  },

  // Onglets fixés
  tabsHeaderCard: {
    marginTop: 8,
    marginHorizontal: 16,
    marginBottom: 4,
    borderRadius: 20,
    backgroundColor: theme.colors.card,
    padding: 6,
  },
  tabsWrapper: {
    flexDirection: "row",
    borderRadius: 999,
    backgroundColor: theme.colors.surface || "#020617",
    padding: 3,
  },
  tabItem: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  tabItemActive: {
    backgroundColor: theme.colors.primarySoft || "rgba(79,70,229,0.16)",
  },
  tabLabel: {
    fontSize: 13,
    color: theme.colors.subtext,
    fontWeight: "500",
  },
  tabLabelActive: {
    color: theme.colors.primary,
    fontWeight: "700",
  },

  // 🔹 Cartes de contenu (dans la zone scrollable)
  tabCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 20,
    backgroundColor: theme.colors.card,
    padding: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: 6,
  },
  subSectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: 4,
  },

  statsRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 6,
  },
  statCard: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: theme.colors.card,
  },
  statCardLarge: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: theme.colors.surface || "#020617",
  },
  statLabel: {
    fontSize: 11,
    color: theme.colors.subtext,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.text,
  },

  paragraph: {
    fontSize: 14,
    color: theme.colors.text,
    lineHeight: 20,
  },
  paragraphSecondary: {
    marginTop: 4,
    fontSize: 13,
    color: theme.colors.subtext,
    lineHeight: 19,
  },

  // Bloc infos "À propos"
  aboutInfoCard: {
    marginTop: 10,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: theme.colors.surface || "#020617",
  },
  aboutInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  aboutInfoLabel: {
    fontSize: 12,
    color: theme.colors.subtext,
  },
  aboutInfoValue: {
    fontSize: 13,
    color: theme.colors.text,
    marginLeft: 8,
    textAlign: "right",
    flexShrink: 1,
  },

  // Timeline
  timelineContainer: {
    marginTop: 8,
    padding: 8,
    borderRadius: 12,
    backgroundColor: theme.colors.surface || "#020617",
  },
  timelineTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.text,
    marginBottom: 4,
  },
  timelineText: {
    fontSize: 13,
    color: theme.colors.subtext,
  },

  // Contexte rapide dans Activité
  quickContextCard: {
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: theme.colors.card,
  },
  quickContextRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  quickContextItem: {
    flex: 1,
  },
  quickContextLabel: {
    fontSize: 11,
    color: theme.colors.subtext,
    marginBottom: 2,
  },
  quickContextValue: {
    fontSize: 15,
    fontWeight: "700",
    color: theme.colors.text,
  },

  // Répartition des votes
  voteDistRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    marginBottom: 4,
    gap: 8,
  },
  voteDistItem: {
    flex: 1,
    paddingVertical: 4,
  },
  voteDistLabel: {
    fontSize: 11,
    color: theme.colors.subtext,
    marginBottom: 2,
  },
  voteDistValue: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.text,
  },

  // Derniers votes
  recentVotesSection: {
    marginTop: 10,
  },
  recentVoteCard: {
    marginTop: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: theme.colors.surface || "#020617",
  },
  recentVoteTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.text,
    marginBottom: 4,
  },
  recentVoteMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  recentVoteResultText: {
    fontSize: 12,
    color: theme.colors.subtext,
  },
  votePill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  votePillText: {
    fontSize: 11,
    fontWeight: "600",
    color: theme.colors.text,
  },

  // Footer
  footerNoteContainer: {
    marginTop: 8,
    marginBottom: 20,
    alignItems: "center",
    paddingHorizontal: 16,
  },
  footerNote: {
    fontSize: 11,
    color: theme.colors.subtext,
    textAlign: "center",
  },
});
