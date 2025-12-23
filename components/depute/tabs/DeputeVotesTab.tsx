// components/depute/tabs/DeputeVotesTab.tsx
import React, { useMemo } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { parseScrutinOutcome, outcomeToLabel } from "@/lib/parliament/scrutinResult";


type VoteKey = "pour" | "contre" | "abstention" | "nv";
type TimeBucket = "TODAY" | "WEEK" | "OLDER";

type RecentVote = {
  numero_scrutin: string;
  vote: string | null;
  titre: string | null;
  resultat: string | null;
  date_scrutin?: string | null;
};

type Props = {
  recentVotesLoading: boolean;
  timelineSections: Record<TimeBucket, RecentVote[]>;

  voteLabel: (key: VoteKey) => string;
  normalizeVoteKey: (v?: string | null) => VoteKey;
  sectionLabel: (bucket: TimeBucket) => string;

  router: any;
  styles: any;
};

const ORDER: TimeBucket[] = ["TODAY", "WEEK", "OLDER"];

function fmtDateFR(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function shortResult(r?: string | null) {
  const raw = String(r ?? "").trim();
  if (!raw) return "";

  const outcome = parseScrutinOutcome(raw);
  const label = outcomeToLabel(outcome); // "Adoptée" | "Rejetée" | null

  // si on sait parser : on renvoie le label officiel
  if (label) return label;

  // sinon fallback : texte brut (court)
  return raw.length > 28 ? raw.slice(0, 28) + "…" : raw;
}

function votePillLabel(k: VoteKey) {
  if (k === "pour") return "POUR";
  if (k === "contre") return "CONTRE";
  if (k === "abstention") return "ABST.";
  return "NV";
}

function votePillStyle(k: VoteKey) {
  // pas de "theme" ici => couleurs RGBA soft premium
  if (k === "pour") return { backgroundColor: "rgba(34,197,94,0.12)", borderColor: "rgba(34,197,94,0.25)" };
  if (k === "contre") return { backgroundColor: "rgba(239,68,68,0.10)", borderColor: "rgba(239,68,68,0.22)" };
  if (k === "abstention") return { backgroundColor: "rgba(234,179,8,0.12)", borderColor: "rgba(234,179,8,0.25)" };
  return { backgroundColor: "rgba(148,163,184,0.10)", borderColor: "rgba(148,163,184,0.18)" };
}


export default function DeputeVotesTab({
  recentVotesLoading,
  timelineSections,
  voteLabel,
  normalizeVoteKey,
  sectionLabel,
  router,
  styles,
}: Props) {
  const flat = useMemo(() => {
    const all: RecentVote[] = [];
    ORDER.forEach((k) => all.push(...(timelineSections?.[k] ?? [])));
    return all;
  }, [timelineSections]);

  const recap = useMemo(() => {
    const last = flat.slice(0, 6);
    const counts: Record<VoteKey, number> = {
      pour: 0,
      contre: 0,
      abstention: 0,
      nv: 0,
    };

    last.forEach((v) => {
      const k = normalizeVoteKey(v.vote);
      counts[k] += 1;
    });

    const n = last.length;

    // on prend la 1ère date dite "valide" (liste déjà triée côté parent)
    const latestDate = last.find((v) => !!v.date_scrutin)?.date_scrutin ?? null;

    return { n, counts, latestDate };
  }, [flat, normalizeVoteKey]);

  if (recentVotesLoading) {
    return (
      <View style={{ marginTop: 6 }}>
        <ActivityIndicator />
        <Text style={[styles.paragraphSecondary, { textAlign: "center", marginTop: 8 }]}>
          Chargement des votes récents…
        </Text>
      </View>
    );
  }

  if (!flat.length) {
    return (
      <View style={{ marginTop: 6 }}>
        <Text style={styles.paragraphSecondary}>
          Pas encore assez de votes récents pour afficher une timeline.
        </Text>
      </View>
    );
  }

  const accentColor = styles?.tabLabelActive?.color ?? styles?.tabLabel?.color ?? undefined;

  return (
    <View style={{ marginTop: 6 }}>
      {/* mini résumé premium */}
      <View style={[styles.statCard, { marginTop: 0 }]}>
        <View style={styles.timelineHeaderRow}>
          <Text style={styles.subSectionTitle}>Derniers votes</Text>
          <Text style={styles.timelineHint}>
            {recap.latestDate
              ? `Dernier vote : ${fmtDateFR(recap.latestDate)}`
              : `Sur ${recap.n} votes`}
          </Text>
        </View>

        <View style={[styles.voteDistRow, { marginTop: 10 }]}>
          <View style={styles.voteDistItem}>
            <Text style={styles.voteDistLabel}>Pour</Text>
            <Text style={styles.voteDistValue}>{recap.counts.pour}</Text>
          </View>
          <View style={styles.voteDistItem}>
            <Text style={styles.voteDistLabel}>Contre</Text>
            <Text style={styles.voteDistValue}>{recap.counts.contre}</Text>
          </View>
          <View style={styles.voteDistItem}>
            <Text style={styles.voteDistLabel}>Abst.</Text>
            <Text style={styles.voteDistValue}>{recap.counts.abstention}</Text>
          </View>
          <View style={styles.voteDistItem}>
            <Text style={styles.voteDistLabel}>NV</Text>
            <Text style={styles.voteDistValue}>{recap.counts.nv}</Text>
          </View>
        </View>

        <Text style={[styles.paragraphSecondary, { marginTop: 8 }]}>
          Sur les {recap.n} derniers scrutins :{" "}
          <Text style={{ color: accentColor, fontWeight: "800" }}>
            {recap.counts.pour} pour
          </Text>
          , {recap.counts.contre} contre, {recap.counts.abstention} abst., {recap.counts.nv} non-votant.
        </Text>
      </View>

      {/* timeline par sections */}
      <View style={styles.timelineVotesSection}>
        {ORDER.map((bucket) => {
          const items = timelineSections?.[bucket] ?? [];
          if (!items.length) return null;

          return (
            <View key={bucket} style={{ marginTop: 12 }}>
              <View style={styles.timelineHeaderRow}>
                <Text style={styles.subSectionTitle}>{sectionLabel(bucket)}</Text>
                <Text style={styles.timelineHint}>{items.length} scrutin(s)</Text>
              </View>

              <View style={styles.timelineList}>
                {items.map((v, idx) => {
                  const k = normalizeVoteKey(v.vote);
                  const date = fmtDateFR(v.date_scrutin);

                  return (
                    <View key={`${bucket}-${v.numero_scrutin}-${idx}`} style={styles.timelineItem}>
                      <View style={styles.timelineRail}>
                        <View style={styles.timelineDot} />
                        <View style={styles.timelineLine} />
                      </View>

                      <Pressable
                        style={({ pressed }) => [styles.timelineCard, pressed && { opacity: 0.92 }]}
                        onPress={() => router.push(`/scrutins/${v.numero_scrutin}`)}
                      >
                        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
  <Text
    style={[styles.timelineTitleVote, { flex: 1 }]}
    numberOfLines={2}
    ellipsizeMode="tail"
  >
    {v.titre || `Scrutin n°${v.numero_scrutin}`}
  </Text>

  {/* ✅ Badge vote */}
  <View
    style={[
      {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        borderWidth: 1,
        alignSelf: "flex-start",
      },
      votePillStyle(k),
    ]}
  >
    <Text
      style={{
        fontSize: 11,
        fontWeight: "900",
        color: styles?.text?.color ?? styles?.tabLabelActive?.color ?? undefined,
        opacity: 0.92,
        letterSpacing: 0.4,
      }}
      numberOfLines={1}
    >
      {votePillLabel(k)}
    </Text>
  </View>
</View>


                        <View style={styles.timelineMetaRow}>
                          <Text style={styles.timelineMetaLeft} numberOfLines={1} ellipsizeMode="tail">
                            {voteLabel(k)}
                            {date ? ` • ${date}` : ""}
                          </Text>
                          <Text style={styles.timelineMetaRight} numberOfLines={1} ellipsizeMode="tail">
                            {shortResult(v.resultat) ? `Scrutin : ${shortResult(v.resultat)}` : "Scrutin : —"}
                          </Text>
                        </View>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}
