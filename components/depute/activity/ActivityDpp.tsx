// components/depute/activity/ActivityDpp.tsx
import React, { useMemo } from "react";
import { View, Text, Pressable } from "react-native";
import * as Haptics from "expo-haptics";

type VoteKey = "pour" | "contre" | "abstention" | "nv";

type RecentVote = {
  numero_scrutin: string;
  vote: string | null;
  titre: string | null;
  resultat: string | null;
  date_scrutin?: string | null;
};

type Props = {
  markers: RecentVote[];
  summary: string[];

  voteLabel: (k: VoteKey) => string;
  normalizeVoteKey: (v?: string | null) => VoteKey;

  router: any;
  styles: any;
};

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

export default function ActivityDpp({
  markers,
  summary,
  voteLabel,
  normalizeVoteKey,
  router,
  styles,
}: Props) {
  const safeSummary = useMemo(
    () => (summary ?? []).filter(Boolean).slice(0, 6),
    [summary]
  );

  return (
    <View style={styles.dppCard}>
      {/* ✅ HEADER VERTICAL (zéro troncature) */}
      <View
  style={[
    styles.dppHeader,
    { flexDirection: "column", alignItems: "flex-start", gap: 4 },
  ]}
>
  <Text style={styles.dppTitle}>Lecture politique (D++)</Text>
  <Text style={styles.dppHint}>Basé sur les 6 derniers votes</Text>
</View>

      <Text style={styles.dppSectionTitle}>Votes marqueurs</Text>

      {markers.length === 0 ? (
        <Text style={styles.dppMuted}>Pas encore assez de votes récents.</Text>
      ) : (
        <View style={{ marginTop: 8, gap: 10 }}>
          {markers.map((v) => {
            const k = normalizeVoteKey(v.vote);
            const date = fmtDateFR(v.date_scrutin);

            return (
              <Pressable
                key={`marker-${v.numero_scrutin}`}
                style={({ pressed }) => [
                  styles.dppItem,
                  pressed && { opacity: 0.92 },
                ]}
                onPress={() => {
                  try {
                    Haptics.selectionAsync();
                  } catch {}
                  router.push(`/scrutins/${v.numero_scrutin}`);
                }}
              >
                <View style={styles.dppItemTop}>
                  <Text
                    style={styles.dppItemTitle}
                    numberOfLines={2}
                    ellipsizeMode="tail"
                  >
                    {v.titre || `Scrutin n°${v.numero_scrutin}`}
                  </Text>
                  <Text style={styles.dppItemGo}>→</Text>
                </View>

                <Text
                  style={styles.dppItemMeta}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  Vote : {voteLabel(k)}
                  {date ? ` • ${date}` : ""}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <View style={{ marginTop: 12 }}>
        <Text style={styles.dppSectionTitle}>Synthèse automatique</Text>

        {safeSummary.length ? (
          safeSummary.map((line, idx) => (
            <Text key={idx} style={styles.dppLine}>
              • {line}
            </Text>
          ))
        ) : (
          <Text style={styles.dppMuted}>
            Pas encore assez d’éléments pour une synthèse.
          </Text>
        )}
      </View>

      <Text style={styles.dppFootnote}>
        Note : synthèse heuristique (pas d’IA), dépend de la quantité de votes
        disponibles.
      </Text>
    </View>
  );
}
