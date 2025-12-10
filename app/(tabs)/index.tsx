// app/(tabs)/index.tsx
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../../lib/supabaseClient";
import { theme } from "../../lib/theme";
import { AppHeader } from "../../lib/AppHeader";

/* ---------------- Types ---------------- */
type Loi = {
  loi_id: string;
  titre_loi: string | null;
  nb_scrutins_total: number | null;
  derniere_date_scrutin?: string | null;
};

type Scrutin = {
  id_an: string;
  titre: string | null;
  date_scrutin: string | null;
  numero: number | null;
  resultat: string | null;
  loi_id: string | null;
};

type Depute = {
  id_depute: string;
  nomcomplet: string | null;
  groupe: string | null;
  photo: string | null;
  nb_total: number;
  nb_exprimes: number;
  taux_participation_pct: number | null;
};

export default function HomeScreen() {
  const router = useRouter();

  const [loisRecent, setLoisRecent] = useState<Loi[]>([]);
  const [scrutinsRecent, setScrutinsRecent] = useState<Scrutin[]>([]);
  const [deputesTop, setDeputesTop] = useState<Depute[]>([]);

  useEffect(() => {
    const load = async () => {
      const { data: loisData } = await supabase
        .from("lois_recent")
        .select("*")
        .limit(6);

      const { data: scrData } = await supabase
        .from("scrutins_recents")
        .select("*")
        .limit(6);

      const { data: depData } = await supabase
        .from("deputes_top_activite")
        .select("*")
        .limit(6);

      setLoisRecent(loisData ?? []);
      setScrutinsRecent(scrData ?? []);
      setDeputesTop(depData ?? []);
    };

    load();
  }, []);

  const nbLois = loisRecent.length;
  const nbScrutins = scrutinsRecent.length;
  const nbDeputes = deputesTop.length;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 40 }}
    >
      {/* Header unifié */}
      <AppHeader
        title="ActuDesLois"
        subtitle="Votre tableau de bord de l'activité parlementaire."
      />

      {/* Barre pseudo-recherche (prépare la vraie recherche globale) */}
      <Pressable
        style={styles.searchBar}
        onPress={() => {
          // plus tard : router.push("/recherche");
        }}
      >
        <Text style={styles.searchPlaceholder}>
          🔍 Rechercher une loi, un scrutin ou un député
        </Text>
      </Pressable>

      {/* Bloc résumé / stats rapides */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Lois mises en avant</Text>
          <Text style={styles.statValue}>{nbLois}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Scrutins récents</Text>
          <Text style={styles.statValue}>{nbScrutins}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Députés analysés</Text>
          <Text style={styles.statValue}>{nbDeputes}</Text>
        </View>
      </View>

      {/* Placeholder Résumé IA (pour plus tard) */}
      <View style={styles.aiCard}>
        <Text style={styles.aiTitle}>⏳ Résumé automatique</Text>
        <Text style={styles.aiText}>
          Bientôt ici : une synthèse IA des lois et scrutins les plus
          importants de la semaine.
        </Text>
      </View>

      {/* ================= Lois récentes ================= */}
      <View style={styles.sectionHeader}>
        <Text style={styles.blockTitle}>📜 Lois récemment actives</Text>
        <Pressable onPress={() => router.push("/lois")}>
          <Text style={styles.seeAll}>Tout voir</Text>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 4 }}
      >
        {loisRecent.map((l) => (
          <Pressable
            key={l.loi_id}
            style={styles.card}
            onPress={() => router.push(`/lois/${l.loi_id}`)}
          >
            <Text style={styles.cardTitle} numberOfLines={3}>
              {l.titre_loi || `Loi ${l.loi_id}`}
            </Text>
            <Text style={styles.cardMeta}>
              {l.nb_scrutins_total ?? 0} scrutins liés
            </Text>
            {l.derniere_date_scrutin && (
              <Text style={styles.cardMetaSmall}>
                Dernier vote : {l.derniere_date_scrutin.slice(0, 10)}
              </Text>
            )}
          </Pressable>
        ))}
      </ScrollView>

      {/* ================= Scrutins récents ================= */}
      <View style={styles.sectionHeader}>
        <Text style={styles.blockTitle}>🗳️ Scrutins récents</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 4 }}
      >
        {scrutinsRecent.map((s) => (
          <Pressable
            key={s.id_an}
            style={styles.card}
            onPress={() => router.push(`/scrutins/${s.id_an}`)}
          >
            <Text style={styles.cardTitle} numberOfLines={3}>
              {s.titre || "(Sans titre)"}
            </Text>
            <Text style={styles.cardMeta}>
              {s.date_scrutin?.slice(0, 10) || "Date inconnue"}
            </Text>
            {s.resultat && (
              <Text style={styles.resultBadge}>{s.resultat}</Text>
            )}
          </Pressable>
        ))}
      </ScrollView>

      {/* ================= Députés les plus actifs ================= */}
      <View style={styles.sectionHeader}>
        <Text style={styles.blockTitle}>👥 Députés les plus actifs</Text>
        <Pressable onPress={() => router.push("/deputes")}>
          <Text style={styles.seeAll}>Liste complète</Text>
        </Pressable>
      </View>

      {deputesTop.map((d) => (
        <Pressable
          key={d.id_depute}
          style={styles.deputeRow}
          onPress={() => router.push(`/deputes/${d.id_depute}`)}
        >
          {d.photo ? (
            <Image source={{ uri: d.photo }} style={styles.deputeAvatar} />
          ) : (
            <View style={styles.deputeAvatarFallback}>
              <Text style={styles.deputeAvatarText}>
                {d.nomcomplet?.charAt(0).toUpperCase() ??
                  d.id_depute.charAt(2)}
              </Text>
            </View>
          )}

          <View style={{ flex: 1 }}>
            <Text style={styles.deputeName} numberOfLines={1}>
              {d.nomcomplet || d.id_depute}
            </Text>
            <Text style={styles.deputeMeta} numberOfLines={1}>
              {d.groupe || "Groupe inconnu"}
            </Text>
          </View>

          <View style={styles.deputeStatsBadge}>
            <Text style={styles.deputeStatsText}>
              {d.taux_participation_pct?.toFixed(0) ?? 0}% participation
            </Text>
            <Text style={styles.deputeStatsSub}>
              {d.nb_total} votes suivis
            </Text>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

/* ---------------- STYLES ---------------- */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },

  /* Barre de pseudo recherche */
  searchBar: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 999,
    backgroundColor: theme.colors.card,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  searchPlaceholder: {
    fontSize: 13,
    color: theme.colors.subtext,
  },

  /* Stats rapides */
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    marginRight: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  statLabel: {
    fontSize: 11,
    color: theme.colors.subtext,
  },
  statValue: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.text,
    marginTop: 4,
  },

  /* Carte IA */
  aiCard: {
    marginHorizontal: 16,
    marginBottom: 20,
    padding: 14,
    borderRadius: 14,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: "rgba(168, 85, 247, 0.4)", // petite touche violet
  },
  aiTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.text,
  },
  aiText: {
    marginTop: 4,
    fontSize: 12,
    color: theme.colors.subtext,
  },

  sectionHeader: {
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  blockTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  seeAll: {
    fontSize: 12,
    color: theme.colors.primary,
  },

  card: {
    width: 220,
    backgroundColor: theme.colors.card,
    padding: 14,
    borderRadius: 14,
    marginHorizontal: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  cardTitle: {
    color: theme.colors.text,
    fontWeight: "600",
    fontSize: 14,
  },
  cardMeta: {
    color: theme.colors.subtext,
    fontSize: 12,
    marginTop: 6,
  },
  cardMetaSmall: {
    color: theme.colors.subtext,
    fontSize: 11,
    marginTop: 2,
  },
  resultBadge: {
    marginTop: 8,
    alignSelf: "flex-start",
    fontSize: 11,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(34,197,94,0.1)",
    color: "#4ade80",
  },

  /* Députés top liste */
  deputeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 8,
    padding: 10,
    borderRadius: 12,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  deputeAvatar: {
    width: 40,
    height: 40,
    borderRadius: 999,
    marginRight: 10,
  },
  deputeAvatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: theme.colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  deputeAvatarText: {
    color: theme.colors.primary,
    fontWeight: "700",
    fontSize: 18,
  },
  deputeName: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.text,
  },
  deputeMeta: {
    fontSize: 12,
    color: theme.colors.subtext,
    marginTop: 2,
  },
  deputeStatsBadge: {
    alignItems: "flex-end",
    marginLeft: 8,
  },
  deputeStatsText: {
    fontSize: 11,
    color: theme.colors.primary,
    fontWeight: "600",
  },
  deputeStatsSub: {
    fontSize: 11,
    color: theme.colors.subtext,
  },
});
