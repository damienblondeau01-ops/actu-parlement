// app/(tabs)/deputes/[id].tsx

import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../../lib/supabaseClient";
import { theme } from "../../../lib/theme";
import { Image as ExpoImage } from "expo-image";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import DeputeHero from "../../../components/depute/DeputeHero";
import DeputeActivityTab from "@components/depute/DeputeActivityTab";
import DeputeAboutTab from "../../../components/depute/DeputeAboutTab";
import DataScopeBadge from "@components/ui/DataScopeBadge";
import DeputeVotesTab from "@/components/depute/tabs/DeputeVotesTab";

import {
  summarizeRecentSignals,
  computeDeltaHints,
  phraseScore,
  normalizeVoteKey,
  voteLabel,
  computeDTriplePlusNarrative,
} from "../../../lib/political";

type DataScope = "ANALYTICS_L16" | "RECENT_L17" | "MIXED";

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

  // ✅ Liens officiels / contact (colonnes réelles)
  mail: string | null;
  twitter: string | null;
  facebook: string | null;
  website: string | null;

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
  date_scrutin?: string | null;
};

type VoteBreakdown = {
  pour: number;
  contre: number;
  abstention: number;
  nv: number;
  total: number;
};

type TabKey = "ABOUT" | "VOTES" | "ACTIVITY";
type VoteKey = "pour" | "contre" | "abstention" | "nv";
type TimeBucket = "TODAY" | "WEEK" | "OLDER";

/* ---------------- Helpers robustes ---------------- */

function computeSafeNumber(value: number | string | null): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function formatPct(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return `${value.toFixed(1)} %`;
}

function qualifierScore(v: number | null): "high" | "mid" | "low" | "na" {
  if (v === null || v === undefined || !Number.isFinite(v)) return "na";
  if (v >= 75) return "high";
  if (v >= 50) return "mid";
  return "low";
}

type SignalLevel = "ok" | "warn" | "info";

function getSectionLabel(bucket: TimeBucket) {
  if (bucket === "TODAY") return "Aujourd’hui";
  if (bucket === "WEEK") return "Ces 7 derniers jours";
  return "Plus ancien";
}

function parseDateSafe(s?: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function signalPillStyle(level: SignalLevel) {
  if (level === "ok") return "ok";
  if (level === "warn") return "warn";
  return "info";
}

function openUrl(url?: string | null) {
  const u = String(url ?? "").trim();
  if (!u) return;
  Linking.openURL(u).catch(() => {});
}

/** Mini barre de progression “premium” (sans lib) */
function ProgressBar({ value }: { value: number | null }) {
  const p = value === null ? null : Math.max(0, Math.min(100, value));
  return (
    <View style={styles.progressWrap}>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${p ?? 0}%` }]} />
      </View>
      <Text style={styles.progressText}>{formatPct(p)}</Text>
    </View>
  );
}

export default function DeputeDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();

  // ✅ Fix TS: on “retype” DeputeHero ici (sans toucher au composant)
  const DeputeHeroX = DeputeHero as unknown as React.ComponentType<{
    depute: DeputeRow;
    voteCount: number | null;
    ctaLabel: string;
    onPressPrimary: () => void;
    showRecentHint?: boolean;
  }>;

  const [depute, setDepute] = useState<DeputeRow | null>(null);
  const [scores, setScores] = useState<SafeScores>({
    participation: null,
    loyaute: null,
    majorite: null,
  });

  const [activeTab, setActiveTab] = useState<TabKey>("ABOUT");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [totalVotesCount, setTotalVotesCount] = useState<number | null>(null);
  const [recentVotes, setRecentVotes] = useState<RecentVote[]>([]);
  const [recentVotesLoading, setRecentVotesLoading] = useState<boolean>(false);
  const [voteBreakdown, setVoteBreakdown] = useState<VoteBreakdown | null>(null);

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

  const yearsExperience = useMemo(() => {
    if (!depute) return null;

    const exp = computeSafeNumber(depute.experienceDepute);
    if (exp !== null) return exp;

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
    if (!depute) return "Mandat en cours à l'Assemblée nationale.";

    const legNum = computeSafeNumber(depute.legislature);
    const legSuffix = legNum ? `${legNum}ᵉ législature` : "législature en cours";

    if (!depute.datePriseFonction) return `Mandat en cours durant la ${legSuffix}.`;

    const d = new Date(depute.datePriseFonction);
    if (Number.isNaN(d.getTime())) return `Mandat en cours durant la ${legSuffix}.`;

    return `Mandat en cours depuis le ${d.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    })} (${legSuffix}).`;
  }, [depute]);

  const lectureRapide = useMemo(() => {
    const lignes: string[] = [];
    lignes.push(phraseScore("participation", scores.participation));
    lignes.push(phraseScore("loyaute", scores.loyaute));
    lignes.push(phraseScore("majorite", scores.majorite));
    if (totalVotesCount !== null) {
      lignes.push(`Base : ${totalVotesCount} votes nominatifs disponibles pour ce député.`);
    }
    return lignes;
  }, [scores.participation, scores.loyaute, scores.majorite, totalVotesCount]);

  const dTriplePlus = useMemo(() => {
    return computeDTriplePlusNarrative(scores, totalVotesCount);
  }, [scores, totalVotesCount]);

  const recentSignals = useMemo(() => summarizeRecentSignals(recentVotes), [recentVotes]);
  const deltaHints = useMemo(() => computeDeltaHints(scores), [scores]);

  // 🧭 Portée des données affichées sur cet écran
  const DATA_SCOPE = useMemo<DataScope>(() => {
    const hasAnalytics =
      scores.participation !== null || scores.loyaute !== null || scores.majorite !== null;

    const hasRecent = recentVotes.length > 0;

    if (hasAnalytics && hasRecent) return "MIXED";
    if (hasAnalytics) return "ANALYTICS_L16";
    if (hasRecent) return "RECENT_L17";
    return "MIXED";
  }, [scores.participation, scores.loyaute, scores.majorite, recentVotes.length]);

  const lectureDPlusPlus = useMemo(() => {
    const markers = (recentVotes ?? []).slice(0, 3);

    const last = recentVotes ?? [];
    const counts: Record<VoteKey, number> = { pour: 0, contre: 0, abstention: 0, nv: 0 };
    last.forEach((v) => {
      const k = normalizeVoteKey(v.vote);
      counts[k] += 1;
    });

    const n = last.length || 0;

    const mainTendency: VoteKey =
      counts.pour >= counts.contre && counts.pour >= counts.abstention && counts.pour >= counts.nv
        ? "pour"
        : counts.contre >= counts.abstention && counts.contre >= counts.nv
        ? "contre"
        : counts.abstention >= counts.nv
        ? "abstention"
        : "nv";

    const dominant = Math.max(counts.pour, counts.contre, counts.abstention, counts.nv);
    const consistency =
      n >= 4 && dominant / n >= 0.67
        ? "très stable"
        : n >= 4 && dominant / n >= 0.5
        ? "plutôt stable"
        : "variable";

    const participationHint =
      counts.nv >= 3
        ? "Présence irrégulière sur cette courte période."
        : "Présence correcte sur cette courte période.";

    const summary = [
      n > 0
        ? `Sur les ${n} derniers votes observés, tendance dominante : ${voteLabel(mainTendency).toLowerCase()} (${dominant}/${n}).`
        : "Historique récent insuffisant pour produire une synthèse.",
      `Comportement : ${consistency}.`,
      participationHint,
    ];

    return { markers, counts, summary };
  }, [recentVotes]);

  // ✅ CTA qui change selon l’onglet
  const heroCta = useMemo(() => {
    if (activeTab === "ABOUT") {
      return { label: "Voir ses votes", onPress: () => setActiveTab("VOTES") };
    }
    if (activeTab === "VOTES") {
      return { label: "Analyser son activité", onPress: () => setActiveTab("ACTIVITY") };
    }
    return { label: "Voir son profil", onPress: () => setActiveTab("ABOUT") };
  }, [activeTab]);

  const loadDepute = useCallback(async () => {
    if (!id) {
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
          mail,
          twitter,
          facebook,
          website,
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

      const participationRaw = row.scoreParticipation ?? row.scoreparticipation ?? null;
      const loyauteRaw = row.scoreLoyaute ?? row.scoreloyaute ?? null;
      const majoriteRaw = row.scoreMajorite ?? row.scoremajorite ?? null;

      setScores({
        participation: computeSafeNumber(participationRaw),
        loyaute: computeSafeNumber(loyauteRaw),
        majorite: computeSafeNumber(majoriteRaw),
      });
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
        console.warn("[DEPUTE SCREEN] Erreur stats rapides =", error);
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

      const { data: votes, error: votesError } = await supabase
        .from("votes_deputes_detail")
        .select("numero_scrutin, vote, position")
        .eq("id_depute", deputeId)
        .order("numero_scrutin", { ascending: false })
        .limit(6);

      if (votesError) {
        console.warn("[DEPUTE SCREEN] Erreur votes récents =", votesError);
        return;
      }

      if (!votes || votes.length === 0) return;

      const numeros = votes
        .map((v: any) => (v.numero_scrutin ? String(v.numero_scrutin) : null))
        .filter((v): v is string => !!v);

      if (numeros.length === 0) return;

      const { data: scrutins, error: scrutinsError } = await supabase
        .from("scrutins_data")
        .select("numero, titre, resultat, date_scrutin")
        .in("numero", numeros);

      if (scrutinsError) {
        console.warn("[DEPUTE SCREEN] Erreur scrutins récents =", scrutinsError);
        return;
      }

      const scrutinsByNumero =
        scrutins?.reduce<Record<string, { titre: string | null; resultat: string | null; date_scrutin: string | null }>>(
          (acc: any, s: any) => {
            if (s.numero !== null && s.numero !== undefined) {
              const key = String(s.numero);
              acc[key] = {
                titre: s.titre ?? null,
                resultat: s.resultat ?? null,
                date_scrutin: (s as any).date_scrutin ?? null,
              };
            }
            return acc;
          },
          {}
        ) ?? {};

      const merged: RecentVote[] = (votes as any[]).map((v) => {
        const key = String(v.numero_scrutin);
        const info = scrutinsByNumero[key] ?? { titre: null, resultat: null, date_scrutin: null };
        const rawVote = (v.vote ?? v.position ?? null) as string | null;

        return {
          numero_scrutin: key,
          vote: rawVote,
          titre: info.titre,
          resultat: info.resultat,
          date_scrutin: info.date_scrutin,
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
        console.warn("[DEPUTE SCREEN] Erreur breakdown votes =", error);
        return;
      }

      let pour = 0;
      let contre = 0;
      let abstention = 0;
      let nv = 0;

      (data ?? []).forEach((row: any) => {
        const k = normalizeVoteKey(row.position ?? row.vote ?? null);
        if (k === "pour") pour += 1;
        else if (k === "contre") contre += 1;
        else if (k === "abstention") abstention += 1;
        else nv += 1;
      });

      const total = pour + contre + abstention + nv;
      setVoteBreakdown({ pour, contre, abstention, nv, total });
    } catch (e) {
      console.warn("[DEPUTE SCREEN] Erreur inattendue breakdown =", e);
    }
  }, []);

  useEffect(() => {
    loadDepute();
  }, [loadDepute]);

  useEffect(() => {
    if (id) {
      loadQuickStats(id);
      loadRecentVotes(id);
      loadVoteBreakdown(id);
    }
  }, [id, loadQuickStats, loadRecentVotes, loadVoteBreakdown]);

  const onTabPress = (key: TabKey) => {
    try {
      Haptics.selectionAsync();
    } catch {}
    setActiveTab(key);
  };

  const renderTabButton = (key: TabKey, label: string) => {
    const active = activeTab === key;
    return (
      <Pressable
        onPress={() => onTabPress(key)}
        style={({ pressed }) => [
          styles.tabItem,
          active && styles.tabItemActive,
          pressed && { opacity: 0.92 },
        ]}
      >
        <Text style={[styles.tabLabel, active && styles.tabLabelActive]} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
    );
  };

  const timelineSections = useMemo<Record<TimeBucket, RecentVote[]>>(() => {
    const base: Record<TimeBucket, RecentVote[]> = { TODAY: [], WEEK: [], OLDER: [] };
    if (!recentVotes || recentVotes.length === 0) return base;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(startOfToday);
    weekAgo.setDate(weekAgo.getDate() - 7);

    recentVotes.forEach((v, idx) => {
      const d = parseDateSafe(v.date_scrutin);

      if (d) {
        if (d >= startOfToday) base.TODAY.push(v);
        else if (d >= weekAgo) base.WEEK.push(v);
        else base.OLDER.push(v);
        return;
      }

      if (idx <= 1) base.TODAY.push(v);
      else if (idx <= 4) base.WEEK.push(v);
      else base.OLDER.push(v);
    });

    return base;
  }, [recentVotes]);

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

  const hasLinks =
    !!(depute.mail && String(depute.mail).trim()) ||
    !!(depute.twitter && String(depute.twitter).trim()) ||
    !!(depute.facebook && String(depute.facebook).trim()) ||
    !!(depute.website && String(depute.website).trim()) ||
    !!(depute.photoUrl && String(depute.photoUrl).trim());

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER FIXE */}
      <View style={styles.headerFixed}>
        <View style={styles.bannerWrapper}>
          <ExpoImage
            source={require("../../../assets/header/assemblee.jpg")}
            style={styles.bannerImage}
            contentFit="cover"
          />
          <View style={styles.bannerOverlay} />

          <View style={styles.headerTopBar}>
            <Pressable onPress={() => router.back()} style={styles.backCircle}>
              <Text style={styles.backCircleIcon}>←</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.tabsHeaderCard}>
          <View style={styles.tabsWrapper}>
            {renderTabButton("ABOUT", "À propos")}
            {renderTabButton("VOTES", "Votes")}
            {renderTabButton("ACTIVITY", "Activité")}
          </View>
        </View>
      </View>

      {/* CONTENU SCROLLABLE */}
      <ScrollView
        style={styles.contentScroll}
        contentContainerStyle={styles.contentScrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroOverlap}>
          <DeputeHeroX
            depute={depute}
            voteCount={totalVotesCount}
            ctaLabel={heroCta.label}
            onPressPrimary={heroCta.onPress}
            showRecentHint={activeTab === "ACTIVITY"} // ✅ seulement Activity
          />
        </View>

        {/* ABOUT */}
        {activeTab === "ABOUT" && (
          <View style={styles.tabCard}>
            <DeputeAboutTab depute={depute} circoLabel={circoLabel} styles={styles} />

            {hasLinks && (
              <View style={styles.linksCard}>
                <Text style={styles.linksTitle}>Liens officiels</Text>

                {!!depute.mail && (
                  <Pressable
                    onPress={() => openUrl(`mailto:${String(depute.mail).trim()}`)}
                    style={({ pressed }) => [
                      styles.linkRow,
                      pressed && { opacity: 0.9 },
                    ]}
                  >
                    <Ionicons name="mail-outline" size={18} color={theme.colors.text as any} />
                    <Text style={styles.linkText} numberOfLines={1}>
                      {String(depute.mail).trim()}
                    </Text>
                  </Pressable>
                )}

                {!!depute.twitter && (
                  <Pressable
                    onPress={() => {
                      const t = String(depute.twitter).trim();
                      const handle = t.startsWith("@") ? t.slice(1) : t;
                      openUrl(`https://x.com/${handle}`);
                    }}
                    style={({ pressed }) => [
                      styles.linkRow,
                      pressed && { opacity: 0.9 },
                    ]}
                  >
                    <Ionicons name="logo-twitter" size={18} color={theme.colors.text as any} />
                    <Text style={styles.linkText} numberOfLines={1}>
                      {String(depute.twitter).trim()}
                    </Text>
                  </Pressable>
                )}

                {!!depute.facebook && (
                  <Pressable
                    onPress={() => {
                      const f = String(depute.facebook).trim();
                      openUrl(f.startsWith("http") ? f : `https://www.facebook.com/${f}`);
                    }}
                    style={({ pressed }) => [
                      styles.linkRow,
                      pressed && { opacity: 0.9 },
                    ]}
                  >
                    <Ionicons name="logo-facebook" size={18} color={theme.colors.text as any} />
                    <Text style={styles.linkText} numberOfLines={1}>
                      {String(depute.facebook).trim()}
                    </Text>
                  </Pressable>
                )}

                {!!depute.website && (
                  <Pressable
                    onPress={() => openUrl(String(depute.website).trim())}
                    style={({ pressed }) => [
                      styles.linkRow,
                      pressed && { opacity: 0.9 },
                    ]}
                  >
                    <Ionicons name="link-outline" size={18} color={theme.colors.text as any} />
                    <Text style={styles.linkText} numberOfLines={1}>
                      {String(depute.website).trim()}
                    </Text>
                  </Pressable>
                )}

                {!!depute.photoUrl && (
                  <Pressable
                    onPress={() => openUrl(String(depute.photoUrl).trim())}
                    style={({ pressed }) => [
                      styles.linkRow,
                      pressed && { opacity: 0.9 },
                    ]}
                  >
                    <Ionicons name="image-outline" size={18} color={theme.colors.text as any} />
                    <Text style={styles.linkText} numberOfLines={1}>
                      Photo officielle (AN)
                    </Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        )}

        {activeTab === "VOTES" && (
          <View style={styles.tabCard}>
            <Text style={styles.sectionTitle}>Votes</Text>

            <DataScopeBadge scope={DATA_SCOPE} style={{ marginBottom: 10 }} />

            <DeputeVotesTab
              recentVotesLoading={recentVotesLoading}
              timelineSections={timelineSections}
              voteLabel={voteLabel}
              normalizeVoteKey={normalizeVoteKey}
              sectionLabel={getSectionLabel}
              router={router}
              styles={styles}
            />
          </View>
        )}

        {/* ACTIVITY */}
        {activeTab === "ACTIVITY" && (
          <View style={styles.tabCard}>
            <Text style={styles.sectionTitle}>Activité</Text>

            <DataScopeBadge scope={DATA_SCOPE} style={{ marginBottom: 10 }} />

            <DeputeActivityTab
              scores={scores}
              totalVotesCount={totalVotesCount}
              yearsExperience={yearsExperience}
              mandatText={mandatText}
              lectureRapide={lectureRapide}
              dTriplePlus={dTriplePlus}
              recentSignals={recentSignals}
              deltaHints={deltaHints}
              lectureDPlusPlus={lectureDPlusPlus}
              voteLabel={voteLabel}
              normalizeVoteKey={normalizeVoteKey}
              signalPillStyle={signalPillStyle}
              ProgressBar={ProgressBar}
              router={router}
              styles={styles}
            />
          </View>
        )}

        <View style={styles.footerNoteContainer}>
          <Text style={styles.footerNote}>
            {DATA_SCOPE === "ANALYTICS_L16" &&
              "Analyse basée sur les votes de la 16ᵉ législature — données officielles AN."}

            {DATA_SCOPE === "RECENT_L17" &&
              "Votes récents issus de la 17ᵉ législature — données officielles AN."}

            {DATA_SCOPE === "MIXED" &&
              "Analyse basée sur la 16ᵉ législature, complétée par des votes récents de la 17ᵉ — données officielles AN."}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },

  contentScroll: { flex: 1 },
  contentScrollContent: { paddingTop: 6, paddingBottom: 100 },

  heroOverlap: { marginTop: -18 },

  center: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  loadingText: { marginTop: 8, color: theme.colors.subtext },
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
  backButtonText: { color: theme.colors.text, fontWeight: "600" },

  headerFixed: {},
  bannerWrapper: {
    height: 110,
    backgroundColor: "#111827",
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: "hidden",
  },
  bannerImage: { width: "100%", height: "100%" },
  bannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15,23,42,0.42)",
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
  backCircleIcon: { color: "#fff", fontSize: 18, fontWeight: "600" },

  tabsHeaderCard: {
    marginTop: 8,
    marginHorizontal: 16,
    marginBottom: 6,
    borderRadius: 22,
    backgroundColor: theme.colors.card,
    padding: 7,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  tabsWrapper: {
    flexDirection: "row",
    borderRadius: 999,
    backgroundColor: theme.colors.surface || "#020617",
    padding: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
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
  tabLabel: { fontSize: 13, color: theme.colors.subtext, fontWeight: "500" },
  tabLabelActive: { color: theme.colors.primary, fontWeight: "700" },

  tabCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 22,
    backgroundColor: theme.colors.card,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: theme.colors.text,
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  subSectionTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: theme.colors.text,
    marginBottom: 6,
    letterSpacing: 0.15,
  },

  paragraph: { fontSize: 14, color: theme.colors.text, lineHeight: 20 },
  paragraphSecondary: {
    marginTop: 4,
    fontSize: 13,
    color: theme.colors.subtext,
    lineHeight: 19,
  },

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
  aboutInfoLabel: { fontSize: 12, color: theme.colors.subtext },
  aboutInfoValue: {
    fontSize: 13,
    color: theme.colors.text,
    marginLeft: 8,
    textAlign: "right",
    flexShrink: 1,
  },

  statCard: {
    marginTop: 6,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: theme.colors.surface || "#020617",
  },

  voteDistCard: {
    marginTop: 6,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: theme.colors.surface || "#020617",
  },
  voteDistRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    marginBottom: 4,
    gap: 8,
  },
  voteDistItem: { flex: 1, paddingVertical: 4 },
  voteDistLabel: { fontSize: 11, color: theme.colors.subtext, marginBottom: 2 },
  voteDistValue: { fontSize: 14, fontWeight: "700", color: theme.colors.text },
  voteDistPct: { fontSize: 12, fontWeight: "700", color: theme.colors.subtext },

  timelineVotesSection: { marginTop: 10 },
  timelineHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 10,
  },
  timelineHint: { color: theme.colors.subtext, fontSize: 11, fontWeight: "600" },
  timelineList: { marginTop: 8, gap: 10 },
  timelineItem: { flexDirection: "row", gap: 12 },
  timelineRail: { width: 18, alignItems: "center" },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.25)",
    backgroundColor: "rgba(148,163,184,0.65)",
  },
  timelineLine: {
    flex: 1,
    width: 2,
    marginTop: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  timelineCard: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: theme.colors.surface || "#020617",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  timelineTitleVote: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  timelineMetaRow: {
    marginTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  timelineMetaLeft: { color: theme.colors.subtext, fontSize: 11, fontWeight: "600" },
  timelineMetaRight: { color: theme.colors.subtext, fontSize: 11, fontWeight: "800", opacity: 0.95 },

  scoreCard: {
    marginTop: 6,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: theme.colors.surface || "#020617",
  },
  scoreRow: { marginTop: 8 },
  scoreLabel: { fontSize: 12, color: theme.colors.subtext, marginBottom: 6, fontWeight: "600" },

  progressWrap: { flexDirection: "row", alignItems: "center", gap: 10 },
  progressTrack: {
    flex: 1,
    height: 8,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  progressFill: { height: "100%", backgroundColor: "rgba(99,102,241,0.55)" },
  progressText: { width: 70, textAlign: "right", fontSize: 12, color: theme.colors.text, fontWeight: "700" },

  readingCard: {
    marginTop: 10,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: theme.colors.surface || "#020617",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  readingTitle: { fontSize: 13, fontWeight: "800", color: theme.colors.text, marginBottom: 6 },
  readingLine: { fontSize: 13, color: theme.colors.subtext, lineHeight: 18, marginTop: 4 },

  // ✅ D+ Lecture politique assistée
  dplusCard: {
    marginTop: 10,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: theme.colors.surface || "#020617",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  dplusHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 6,
  },
  dplusTitle: { fontSize: 13, fontWeight: "900", color: theme.colors.text },

  dplusConfidencePill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  dplusConfidenceText: { fontSize: 11, fontWeight: "800", color: theme.colors.text },

  dplusPillHigh: {
    backgroundColor: "rgba(34,197,94,0.12)",
    borderColor: "rgba(34,197,94,0.25)",
  },
  dplusPillMid: {
    backgroundColor: "rgba(234,179,8,0.12)",
    borderColor: "rgba(234,179,8,0.25)",
  },
  dplusPillLow: {
    backgroundColor: "rgba(239,68,68,0.10)",
    borderColor: "rgba(239,68,68,0.20)",
  },

  dplusProfile: {
    marginTop: 2,
    fontSize: 15,
    fontWeight: "900",
    color: theme.colors.text,
  },
  dplusLine: {
    marginTop: 6,
    fontSize: 13,
    color: theme.colors.subtext,
    lineHeight: 18,
  },
  dplusFootnote: {
    marginTop: 8,
    fontSize: 11,
    color: theme.colors.subtext,
    opacity: 0.85,
  },

  quickContextCard: {
    marginTop: 10,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  quickContextRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  quickContextItem: { flex: 1 },
  quickContextLabel: { fontSize: 11, color: theme.colors.subtext, marginBottom: 2 },
  quickContextValue: { fontSize: 15, fontWeight: "700", color: theme.colors.text },

  timelineContainer: {
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: theme.colors.surface || "#020617",
  },
  timelineTitle: { fontSize: 13, fontWeight: "700", color: theme.colors.text, marginBottom: 4 },
  timelineText: { fontSize: 13, color: theme.colors.subtext, lineHeight: 18 },

  footerNoteContainer: { marginTop: 10, marginBottom: 8, alignItems: "center", paddingHorizontal: 16 },
  footerNote: { fontSize: 11, color: theme.colors.subtext, textAlign: "center", opacity: 0.75 },

  timelineChapter: {
    marginBottom: 6,
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "800",
    opacity: 0.85,
  },

  // ✅ Bloc “Liens officiels” (minimal)
  linksCard: {
    marginTop: 10,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: theme.colors.surface || "#020617",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  linksTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: theme.colors.text,
    marginBottom: 8,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    marginBottom: 8,
  },
  linkText: {
    flex: 1,
    fontSize: 13,
    color: theme.colors.text,
    fontWeight: "700",
  },

  // ✅ D+++ — Lecture politique assistée
  d3Card: {
    marginTop: 10,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: theme.colors.surface || "#020617",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  d3HeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  d3Title: {
    fontSize: 13,
    fontWeight: "900",
    color: theme.colors.text,
    letterSpacing: 0.2,
  },
  d3Badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  d3BadgeHigh: {
    backgroundColor: "rgba(34,197,94,0.12)",
    borderColor: "rgba(34,197,94,0.25)",
  },
  d3BadgeMid: {
    backgroundColor: "rgba(234,179,8,0.12)",
    borderColor: "rgba(234,179,8,0.25)",
  },
  d3BadgeLow: {
    backgroundColor: "rgba(239,68,68,0.10)",
    borderColor: "rgba(239,68,68,0.22)",
  },
  d3BadgeText: {
    color: theme.colors.text,
    fontSize: 11,
    fontWeight: "900",
    opacity: 0.9,
  },
  d3Profile: {
    marginTop: 8,
    fontSize: 15,
    fontWeight: "900",
    color: theme.colors.text,
  },
  d3Label: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: "800",
    color: theme.colors.subtext,
    letterSpacing: 0.15,
  },
  d3Text: {
    marginTop: 4,
    fontSize: 13,
    color: theme.colors.text,
    lineHeight: 18,
  },
  d3Footnote: {
    marginTop: 10,
    fontSize: 12,
    color: theme.colors.subtext,
    lineHeight: 17,
    opacity: 0.9,
  },

  glowPour: {
    backgroundColor: "rgba(34,197,94,0.95)",
    shadowColor: "rgba(34,197,94,0.9)",
    shadowOpacity: 0.6,
    shadowRadius: 6,
  },
  glowContre: {
    backgroundColor: "rgba(239,68,68,0.95)",
    shadowColor: "rgba(239,68,68,0.9)",
    shadowOpacity: 0.6,
    shadowRadius: 6,
  },
  glowAbst: {
    backgroundColor: "rgba(234,179,8,0.95)",
    shadowColor: "rgba(234,179,8,0.9)",
    shadowOpacity: 0.6,
    shadowRadius: 6,
  },
  glowNv: {
    backgroundColor: "rgba(148,163,184,0.75)",
    shadowColor: "rgba(148,163,184,0.6)",
    shadowOpacity: 0.5,
    shadowRadius: 4,
  },
  dppCard: {
    marginTop: 10,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: theme.colors.surface || "#020617",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  dppHeader: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 4,
  },
  dppTitle: { fontSize: 13, fontWeight: "900", color: theme.colors.text },
  dppHint: { fontSize: 11, fontWeight: "700", color: theme.colors.subtext, opacity: 0.9 },

  dppSectionTitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "900",
    color: theme.colors.text,
    opacity: 0.9,
  },
  dppMuted: { marginTop: 6, fontSize: 13, color: theme.colors.subtext, lineHeight: 18 },

  dppItem: {
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  dppItemTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  dppItemTitle: { flex: 1, fontSize: 13, fontWeight: "800", color: theme.colors.text, lineHeight: 18 },
  dppItemGo: { fontSize: 16, fontWeight: "900", color: theme.colors.subtext, opacity: 0.9 },
  dppItemMeta: { marginTop: 6, fontSize: 11, fontWeight: "700", color: theme.colors.subtext, opacity: 0.95 },

  dppLine: { marginTop: 6, fontSize: 13, color: theme.colors.subtext, lineHeight: 18 },
  dppFootnote: { marginTop: 10, fontSize: 11, color: theme.colors.subtext, opacity: 0.75 },

  // ✅ D++++ — Signaux récents
  d4Card: {
    marginTop: 10,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: theme.colors.surface || "#020617",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  d4HeaderRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  d4Title: {
    fontSize: 13,
    fontWeight: "900",
    color: theme.colors.text,
  },
  d4Subtitle: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.subtext,
  },
  d4PillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  d4Pill: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  d4Pill_ok: {
    backgroundColor: "rgba(34,197,94,0.10)",
    borderColor: "rgba(34,197,94,0.20)",
  },
  d4Pill_warn: {
    backgroundColor: "rgba(239,68,68,0.10)",
    borderColor: "rgba(239,68,68,0.22)",
  },
  d4Pill_info: {
    backgroundColor: "rgba(148,163,184,0.10)",
    borderColor: "rgba(148,163,184,0.18)",
  },
  d4PillText: {
    fontSize: 12,
    fontWeight: "800",
    color: theme.colors.text,
    opacity: 0.92,
  },
  d4MiniGrid: {
    marginTop: 12,
    flexDirection: "row",
    gap: 8,
  },
  d4MiniItem: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  d4MiniLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: theme.colors.subtext,
  },
  d4MiniValue: {
    marginTop: 6,
    fontSize: 16,
    fontWeight: "900",
    color: theme.colors.text,
  },
  d4Label: {
    fontSize: 12,
    fontWeight: "900",
    color: theme.colors.subtext,
    letterSpacing: 0.15,
  },
  d4HintRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
    alignItems: "flex-start",
  },
  d4Dot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    marginTop: 3,
  },
  d4Dot_ok: { backgroundColor: "rgba(34,197,94,0.85)" },
  d4Dot_warn: { backgroundColor: "rgba(239,68,68,0.85)" },
  d4Dot_info: { backgroundColor: "rgba(148,163,184,0.85)" },
  d4HintTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: theme.colors.text,
  },
  d4HintText: {
    marginTop: 2,
    fontSize: 13,
    color: theme.colors.subtext,
    lineHeight: 18,
  },
  d4Footnote: {
    marginTop: 12,
    fontSize: 11,
    color: theme.colors.subtext,
    opacity: 0.8,
    lineHeight: 16,
  },

  // ✅ D+++++ — Lecture intelligente
  d5Card: {
    marginTop: 10,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: theme.colors.surface || "#020617",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  d5Header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  d5Title: {
    fontSize: 13,
    fontWeight: "900",
    color: theme.colors.text,
  },
  d5Chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  d5Chip_ok: { backgroundColor: "rgba(34,197,94,0.10)", borderColor: "rgba(34,197,94,0.22)" },
  d5Chip_warn: { backgroundColor: "rgba(239,68,68,0.10)", borderColor: "rgba(239,68,68,0.22)" },
  d5Chip_info: { backgroundColor: "rgba(148,163,184,0.10)", borderColor: "rgba(148,163,184,0.18)" },
  d5ChipText: {
    fontSize: 11,
    fontWeight: "900",
    color: theme.colors.text,
    opacity: 0.92,
  },

  d5SectionLabel: {
    fontSize: 12,
    fontWeight: "900",
    color: theme.colors.subtext,
    letterSpacing: 0.15,
  },
  d5Muted: {
    marginTop: 6,
    fontSize: 13,
    color: theme.colors.subtext,
    lineHeight: 18,
    opacity: 0.9,
  },

  d5Row: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  d5RowLeft: { flex: 1 },
  d5RowTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: theme.colors.text,
    lineHeight: 18,
  },
  d5RowSub: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.subtext,
  },
  d5RowCta: {
    fontSize: 12,
    fontWeight: "900",
    color: theme.colors.subtext,
    opacity: 0.95,
  },
  d5Foot: {
    marginTop: 12,
    fontSize: 11,
    color: theme.colors.subtext,
    opacity: 0.75,
    lineHeight: 16,
  },
});
