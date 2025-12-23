// components/depute/DeputeActivityTab.tsx
import React, { useMemo } from "react";
import { View, Text } from "react-native";
import ActivityDpp from "./activity/ActivityDpp";

type VoteKey = "pour" | "contre" | "abstention" | "nv";

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

type DTriplePlus = {
  title: string;
  analyse: string;
  implication: string;
  confiance: string;
  confLevel: "high" | "mid" | "low";
};

type RecentSignals = {
  itemsCount: number;
  counts: Record<VoteKey, number>;
  engagement: { label: string; level: "ok" | "warn" | "info" };
  dominantLabel: { label: string; level: "ok" | "warn" | "info" };
  streak?: { label: string; level: "ok" | "warn" | "info" } | null;
};

type DeltaHint = {
  title: string;
  text: string;
  level: "ok" | "warn" | "info";
};

type Props = {
  scores: SafeScores;
  totalVotesCount: number | null;

  // ✅ parfois passées par le parent
  recentVotes?: RecentVote[];
  recentVotesLoading?: boolean;
  timelineSections?: Record<string, RecentVote[]>;
  sectionLabel?: (bucket: any) => string;

  yearsExperience: number | null;
  mandatText: string;

  lectureRapide: string[];
  dTriplePlus: DTriplePlus;
  recentSignals: RecentSignals;
  deltaHints: DeltaHint[];
  lectureDPlusPlus: {
    markers: RecentVote[];
    summary: string[];
  };

  voteLabel: (k: VoteKey) => string;
  normalizeVoteKey: (v?: string | null) => VoteKey;
  signalPillStyle: (level: "ok" | "warn" | "info") => string;

  // ✅ optionnel (on sécurise son usage)
  ProgressBar?: React.FC<{ value: number | null }>;

  router: any;
  styles: any;
};

function pct(v: number | null) {
  if (v === null || Number.isNaN(v)) return "—";
  const n = Math.round(v);
  return `${n}%`;
}

function shortVoteLabel(k: VoteKey) {
  if (k === "pour") return "Pour";
  if (k === "contre") return "Contre";
  if (k === "abstention") return "Abst.";
  return "NV";
}

// fallback si ProgressBar non fourni
const EmptyBar: React.FC<{ value: number | null }> = () => <View />;

export default function DeputeActivityTab(props: Props) {
  const {
    scores,
    totalVotesCount,
    yearsExperience,
    mandatText,
    lectureRapide,
    dTriplePlus,
    recentSignals,
    deltaHints,
    lectureDPlusPlus,
    voteLabel,
    normalizeVoteKey,
    signalPillStyle,
    ProgressBar,
    router,
    styles,
  } = props;

  const PB = ProgressBar ?? EmptyBar;

  const topLecture = useMemo(() => (lectureRapide ?? []).slice(0, 3), [lectureRapide]);
  const topHints = useMemo(() => (deltaHints ?? []).slice(0, 3), [deltaHints]);

  return (
    <View style={styles.tabCard}>
      <Text style={styles.sectionTitle}>Activité</Text>

      {/* 1) LECTURE RAPIDE */}
      <View style={styles.readingCard}>
        <Text style={styles.readingTitle}>Lecture rapide</Text>
        {topLecture.length ? (
          topLecture.map((t, idx) => (
            <Text key={idx} style={styles.readingLine}>
              {`• ${t}`}
            </Text>
          ))
        ) : (
          <Text style={styles.readingLine}>• Indicateurs en cours de calcul.</Text>
        )}
      </View>

      {/* 2) SCORES */}
      <View style={styles.scoreCard}>
        <View style={styles.quickContextRow}>
          <View style={styles.quickContextItem}>
            <Text style={styles.quickContextLabel}>Participation</Text>
            <Text style={styles.quickContextValue}>{pct(scores.participation)}</Text>
          </View>
          <View style={styles.quickContextItem}>
            <Text style={styles.quickContextLabel}>Loyauté</Text>
            <Text style={styles.quickContextValue}>{pct(scores.loyaute)}</Text>
          </View>
          <View style={styles.quickContextItem}>
            <Text style={styles.quickContextLabel}>Majorité</Text>
            <Text style={styles.quickContextValue}>{pct(scores.majorite)}</Text>
          </View>
        </View>

        <View style={{ marginTop: 10 }}>
          <View style={styles.scoreRow}>
            <Text style={styles.scoreLabel}>Participation</Text>
            <PB value={scores.participation} />
          </View>
          <View style={styles.scoreRow}>
            <Text style={styles.scoreLabel}>Loyauté envers son groupe</Text>
            <PB value={scores.loyaute} />
          </View>
          <View style={styles.scoreRow}>
            <Text style={styles.scoreLabel}>Alignement majorité</Text>
            <PB value={scores.majorite} />
          </View>
        </View>

        <Text style={[styles.paragraphSecondary, { marginTop: 8 }]}>
          Scores calculés à partir des votes nominatifs disponibles (OpenData AN).
        </Text>
      </View>

      {/* 3) D++ */}
      <ActivityDpp
        markers={lectureDPlusPlus.markers}
        summary={lectureDPlusPlus.summary}
        voteLabel={voteLabel}
        normalizeVoteKey={normalizeVoteKey}
        router={router}
        styles={styles}
      />

      {/* 4) D+++ */}
      <View style={styles.d3Card}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.d3Title}>Lecture politique</Text>
            <Text style={[styles.paragraphSecondary, { marginTop: 2 }]}>
              Basé sur les 6 derniers votes
            </Text>
          </View>

          <View
            style={[
              styles.d3Badge,
              dTriplePlus.confLevel === "high"
                ? styles.d3BadgeHigh
                : dTriplePlus.confLevel === "mid"
                ? styles.d3BadgeMid
                : styles.d3BadgeLow,
            ]}
          >
            <Text style={styles.d3BadgeText}>{dTriplePlus.confLevel.toUpperCase()}</Text>
          </View>
        </View>

        <Text style={styles.d3Profile}>{dTriplePlus.title}</Text>

        <Text style={styles.d3Label}>Analyse</Text>
        <Text style={styles.d3Text}>{dTriplePlus.analyse}</Text>

        <Text style={styles.d3Label}>Ce que ça implique</Text>
        <Text style={styles.d3Text}>{dTriplePlus.implication}</Text>

        <Text style={styles.d3Footnote}>{dTriplePlus.confiance}</Text>
      </View>

      {/* 5) D++++ */}
      <View style={styles.d4Card}>
        <View style={styles.d4HeaderRow}>
          <Text style={styles.d4Title}>Signaux récents</Text>
          <Text style={styles.d4Subtitle}>
            {recentSignals.itemsCount ? `${recentSignals.itemsCount} derniers votes` : "—"}
          </Text>
        </View>

        <View style={styles.d4PillsRow}>
          <View
            style={[
              styles.d4Pill,
              styles[`d4Pill_${signalPillStyle(recentSignals.engagement.level)}`],
            ]}
          >
            <Text style={styles.d4PillText}>{recentSignals.engagement.label}</Text>
          </View>

          <View
            style={[
              styles.d4Pill,
              styles[`d4Pill_${signalPillStyle(recentSignals.dominantLabel.level)}`],
            ]}
          >
            <Text style={styles.d4PillText}>{recentSignals.dominantLabel.label}</Text>
          </View>

          {recentSignals.streak ? (
            <View
              style={[
                styles.d4Pill,
                styles[`d4Pill_${signalPillStyle(recentSignals.streak.level)}`],
              ]}
            >
              <Text style={styles.d4PillText}>{recentSignals.streak.label}</Text>
            </View>
          ) : null}
        </View>

        <View
          style={[
            styles.d4MiniGrid,
            { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 },
          ]}
        >
          {(["pour", "contre", "abstention", "nv"] as VoteKey[]).map((k) => (
            <View
              key={k}
              style={[
                styles.d4MiniItem,
                {
                  flexBasis: "47%",
                  borderRadius: 16,
                  paddingVertical: 14,
                  paddingHorizontal: 14,
                  justifyContent: "space-between",
                },
              ]}
            >
              <Text style={[styles.d4MiniLabel, { opacity: 0.85 }]} numberOfLines={1} ellipsizeMode="tail">
                {shortVoteLabel(k)}
              </Text>

              <Text style={[styles.d4MiniValue, { fontSize: 22, fontWeight: "900" }]}>
                {recentSignals.counts[k] ?? 0}
              </Text>
            </View>
          ))}
        </View>

        <View style={{ marginTop: 10 }}>
          <Text style={styles.d4Label}>Ce qu’on peut en déduire</Text>

          {topHints.length ? (
            topHints.map((h, idx) => (
              <View key={idx} style={styles.d4HintRow}>
                <View style={[styles.d4Dot, styles[`d4Dot_${h.level}`]]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.d4HintTitle}>{h.title}</Text>
                  <Text style={styles.d4HintText}>{h.text}</Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.paragraphSecondary}>
              Pas assez de signal récent pour en déduire une tendance.
            </Text>
          )}
        </View>

        <Text style={styles.d4Footnote}>
          Indices calculés à partir des derniers votes disponibles + des scores.
        </Text>
      </View>

      {/* 6) CONTEXTE */}
      <View style={styles.quickContextCard}>
        <View style={styles.quickContextRow}>
          <View style={styles.quickContextItem}>
            <Text style={styles.quickContextLabel}>Scrutins votés</Text>
            <Text style={styles.quickContextValue}>{totalVotesCount ?? "—"}</Text>
          </View>

          <View style={styles.quickContextItem}>
            <Text style={styles.quickContextLabel}>Expérience</Text>
            <Text style={styles.quickContextValue}>
              {yearsExperience !== null ? `${yearsExperience} ans` : "—"}
            </Text>
          </View>

          <View style={styles.quickContextItem}>
            <Text style={styles.quickContextLabel}>Mandat</Text>
            <Text style={styles.quickContextValue}>En cours</Text>
          </View>
        </View>
      </View>

      <View style={styles.timelineContainer}>
        <Text style={styles.timelineTitle}>Timeline du mandat</Text>
        <Text style={styles.timelineText}>{mandatText}</Text>
      </View>

      <View style={{ marginTop: 8 }}>
        <Text style={styles.paragraphSecondary}>Participation : présence lors des scrutins.</Text>
        <Text style={styles.paragraphSecondary}>Loyauté : votes alignés avec son groupe.</Text>
        <Text style={styles.paragraphSecondary}>Majorité : votes alignés avec la majorité.</Text>
      </View>
    </View>
  );
}
