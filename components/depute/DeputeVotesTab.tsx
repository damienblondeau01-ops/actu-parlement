import React from "react";
import { View, Text, Pressable } from "react-native";
import * as Haptics from "expo-haptics";

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
  recentVotes: RecentVote[];
  recentVotesLoading: boolean;
  timelineSections: Record<TimeBucket, RecentVote[]>;

  voteLabel: (k: VoteKey) => string;
  normalizeVoteKey: (v?: string | null) => VoteKey;
  sectionLabel: (b: TimeBucket) => string;

  router: any;
  styles: any;
};

export default function DeputeVotesTab(props: Props) {
  const {
    recentVotes,
    recentVotesLoading,
    timelineSections,
    voteLabel,
    normalizeVoteKey,
    sectionLabel,
    router,
    styles,
  } = props;

  return (
    <View style={styles.tabCard}>
      <Text style={styles.sectionTitle}>Votes</Text>

      <View style={styles.timelineVotesSection}>
        <View style={styles.timelineHeaderRow}>
          <Text style={styles.subSectionTitle}>Timeline des votes</Text>
          <Text style={styles.timelineHint}>Lecture chronologique</Text>
        </View>

        {recentVotesLoading && (
          <Text style={styles.paragraphSecondary}>Chargement des votes…</Text>
        )}

        {!recentVotesLoading && recentVotes.length === 0 && (
          <Text style={styles.paragraphSecondary}>
            Les derniers votes de ce député seront bientôt disponibles.
          </Text>
        )}

        {!recentVotesLoading &&
          (["TODAY", "WEEK", "OLDER"] as TimeBucket[]).map((bucket) => {
            const items = timelineSections[bucket];
            if (!items || items.length === 0) return null;

            return (
              <View key={bucket} style={{ marginTop: 12 }}>
                <Text style={styles.timelineChapter}>
                  {sectionLabel(bucket)}
                </Text>

                <View style={styles.timelineList}>
                  {items.map((vote, idx) => {
                    const k = normalizeVoteKey(vote.vote);
                    const isLast = idx === items.length - 1;

                    const glow =
                      k === "pour"
                        ? styles.glowPour
                        : k === "contre"
                        ? styles.glowContre
                        : k === "abstention"
                        ? styles.glowAbst
                        : styles.glowNv;

                    return (
                      <Pressable
                        key={`${bucket}-${vote.numero_scrutin}`}
                        style={({ pressed }) => [
                          styles.timelineItem,
                          pressed && { opacity: 0.92 },
                        ]}
                        onPress={() => {
                          try {
                            Haptics.selectionAsync();
                          } catch {}
                          router.push(`/scrutins/${vote.numero_scrutin}`);
                        }}
                      >
                        <View style={styles.timelineRail}>
                          <View style={[styles.timelineDot, glow]} />
                          {!isLast && <View style={styles.timelineLine} />}
                        </View>

                        <View style={styles.timelineCard}>
                          <Text
                            style={styles.timelineTitleVote}
                            numberOfLines={2}
                          >
                            {vote.titre ||
                              `Scrutin n°${vote.numero_scrutin}`}
                          </Text>

                          <View style={styles.timelineMetaRow}>
                            <Text style={styles.timelineMetaLeft}>
                              Vote : {voteLabel(k)}
                              {vote.date_scrutin
                                ? ` • ${new Date(
                                    vote.date_scrutin
                                  ).toLocaleDateString("fr-FR")}`
                                : ""}
                            </Text>
                            <Text style={styles.timelineMetaRight}>
                              Voir →
                            </Text>
                          </View>
                        </View>
                      </Pressable>
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
