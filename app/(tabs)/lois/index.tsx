// app/(tabs)/lois/index.tsx
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../../lib/supabaseClient";
import { theme } from "../../../lib/theme";

type LoiAppRow = {
  loi_id: string;
  titre_loi: string | null;
  nb_scrutins_total: number | null;
  nb_articles: number | null;
  nb_amendements: number | null;
  date_premier_scrutin: string | null;
  date_dernier_scrutin: string | null;
};

type MappingRow = {
  loi_id: string;
  id_dossier: string | null;
  confiance: number | null;
  source: string | null;
};

type LoiListItem = {
  loi_id: string;
  titre_loi: string;
  nb_scrutins_total: number;
  nb_articles: number;
  nb_amendements: number;
  date_dernier_scrutin: string | null;
  has_dossier: boolean;
  id_dossier: string | null;
  confiance: number | null;
  source: string | null;
};

type FilterMode = "all" | "withDossier" | "withoutDossier";
type SortMode =
  | "recent"
  | "scrutins"
  | "articles"
  | "amendements"
  | "alpha";

function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export default function LoisListScreen() {
  const router = useRouter();

  const [lois, setLois] = useState<LoiListItem[]>([]);
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const [loisRes, mappingRes] = await Promise.all([
          supabase
            .from("lois_app")
            .select(
              `
              loi_id,
              titre_loi,
              nb_scrutins_total,
              nb_articles,
              nb_amendements,
              date_premier_scrutin,
              date_dernier_scrutin
            `
            )
            .order("date_dernier_scrutin", { ascending: false }),
          supabase
            .from("lois_mapping")
            .select("loi_id, id_dossier, confiance, source"),
        ]);

        if (loisRes.error) {
          console.warn("Erreur chargement lois_app :", loisRes.error);
          setError("Impossible de charger la liste des lois.");
          setLois([]);
          return;
        }

        if (mappingRes.error) {
          console.warn("Erreur chargement lois_mapping :", mappingRes.error);
        }

        const mappingRows = (mappingRes.data || []) as MappingRow[];
        const mappingByLoi = new Map<
          string,
          { id_dossier: string | null; confiance: number | null; source: string | null }
        >();

        mappingRows.forEach((m) => {
          mappingByLoi.set(m.loi_id, {
            id_dossier: m.id_dossier,
            confiance: m.confiance,
            source: m.source,
          });
        });

        const loisRows = (loisRes.data || []) as LoiAppRow[];
        const merged: LoiListItem[] = loisRows.map((row) => {
          const mapping = mappingByLoi.get(row.loi_id);
          const has_dossier = !!(mapping && mapping.id_dossier);

          return {
            loi_id: row.loi_id,
            titre_loi:
              row.titre_loi || `Loi ${row.loi_id}` || "Loi sans titre",
            nb_scrutins_total: Number(row.nb_scrutins_total || 0),
            nb_articles: Number(row.nb_articles || 0),
            nb_amendements: Number(row.nb_amendements || 0),
            date_dernier_scrutin: row.date_dernier_scrutin,
            has_dossier,
            id_dossier: mapping?.id_dossier ?? null,
            confiance: mapping?.confiance ?? null,
            source: mapping?.source ?? null,
          };
        });

        setLois(merged);
      } catch (e) {
        console.warn("Erreur inattendue lois_app :", e);
        setError("Erreur inattendue lors du chargement des lois.");
        setLois([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const filteredAndSortedLois = useMemo(() => {
    const q = normalize(search.trim());

    // 1️⃣ Filtrage
    let list = lois.filter((loi) => {
      if (filterMode === "withDossier" && !loi.has_dossier) return false;
      if (filterMode === "withoutDossier" && loi.has_dossier) return false;

      if (!q) return true;

      const txt = normalize(
        `${loi.titre_loi} ${loi.loi_id} ${loi.id_dossier || ""}`
      );
      return txt.includes(q);
    });

    // 2️⃣ Tri
    const sorted = [...list].sort((a, b) => {
      switch (sortMode) {
        case "recent": {
          const da = a.date_dernier_scrutin
            ? new Date(a.date_dernier_scrutin).getTime()
            : 0;
          const db = b.date_dernier_scrutin
            ? new Date(b.date_dernier_scrutin).getTime()
            : 0;
          return db - da; // les plus récents d'abord
        }
        case "scrutins":
          return b.nb_scrutins_total - a.nb_scrutins_total;
        case "articles":
          return b.nb_articles - a.nb_articles;
        case "amendements":
          return b.nb_amendements - a.nb_amendements;
        case "alpha":
          return a.titre_loi.localeCompare(b.titre_loi, "fr");
        default:
          return 0;
      }
    });

    return sorted;
  }, [lois, search, filterMode, sortMode]);

  const renderMappingBadge = (item: LoiListItem) => {
    if (!item.has_dossier) {
      return (
        <View style={[styles.badge, styles.badgeSoft]}>
          <Text style={styles.badgeSoftText}>Parcours non relié</Text>
        </View>
      );
    }

    const isSmart =
      item.source === "smart_match_v2" && (item.confiance || 0) >= 0.6;

    if (isSmart) {
      return (
        <View style={[styles.badge, styles.badgeSuccess]}>
          <Text style={styles.badgeSuccessText}>Parcours disponible</Text>
        </View>
      );
    }

    return (
      <View style={[styles.badge, styles.badgeWarning]}>
        <Text style={styles.badgeWarningText}>Parcours estimé</Text>
      </View>
    );
  };

  const renderItem = ({ item }: { item: LoiListItem }) => {
    const dateLabel = item.date_dernier_scrutin
      ? item.date_dernier_scrutin.slice(0, 10)
      : null;

    return (
      <Pressable
        style={styles.card}
        onPress={() => router.push(`/lois/${item.loi_id}`)}
      >
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {item.titre_loi}
          </Text>
        </View>

        {dateLabel && (
          <Text style={styles.meta}>
            Dernier scrutin : {dateLabel}
          </Text>
        )}

        <View style={styles.chipsRow}>
          <View style={styles.chip}>
            <Text style={styles.chipText}>
              {item.nb_scrutins_total} scrutin(s)
            </Text>
          </View>
          <View style={styles.chip}>
            <Text style={styles.chipText}>
              {item.nb_articles} article(s)
            </Text>
          </View>
          <View style={styles.chip}>
            <Text style={styles.chipText}>
              {item.nb_amendements} amendement(s)
            </Text>
          </View>
        </View>

        <View style={styles.footerRow}>
          {renderMappingBadge(item)}
          <Text style={styles.loiIdText}>ID : {item.loi_id}</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header simple */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Lois</Text>
        <Text style={styles.headerSubtitle}>
          Explore les lois et leur parcours législatif.
        </Text>
      </View>

      {/* Barre de recherche */}
      <View style={styles.searchContainer}>
        <TextInput
          placeholder="Rechercher une loi (mots, ID, dossier)…"
          placeholderTextColor={theme.colors.subtext}
          value={search}
          onChangeText={setSearch}
          style={styles.searchInput}
        />
      </View>

      {/* Filtres mapping */}
      <View style={styles.filtersRow}>
        {(
          [
            { key: "all", label: "Toutes" },
            { key: "withDossier", label: "Parcours disponible" },
            { key: "withoutDossier", label: "Sans parcours" },
          ] as { key: FilterMode; label: string }[]
        ).map((f) => {
          const active = filterMode === f.key;
          return (
            <Pressable
              key={f.key}
              style={[styles.filterPill, active && styles.filterPillActive]}
              onPress={() => setFilterMode(f.key)}
            >
              <Text
                style={[
                  styles.filterPillText,
                  active && styles.filterPillTextActive,
                ]}
              >
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Filtres tri */}
      <View style={styles.sortRow}>
        {(
          [
            { key: "recent", label: "Récents" },
            { key: "scrutins", label: "Scrutins" },
            { key: "articles", label: "Articles" },
            { key: "amendements", label: "Amend." },
            { key: "alpha", label: "A → Z" },
          ] as { key: SortMode; label: string }[]
        ).map((s) => {
          const active = sortMode === s.key;
          return (
            <Pressable
              key={s.key}
              style={[styles.sortPill, active && styles.sortPillActive]}
              onPress={() => setSortMode(s.key)}
            >
              <Text
                style={[
                  styles.sortPillText,
                  active && styles.sortPillTextActive,
                ]}
              >
                {s.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Loader & erreurs inline */}
      {loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Text style={styles.loadingInline}>
            Mise à jour des lois…
          </Text>
        </View>
      )}

      {error && !loading && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 4 }}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Liste */}
      <FlatList
        data={filteredAndSortedLois}
        keyExtractor={(item) => item.loi_id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          !loading ? (
            <View style={{ padding: 16 }}>
              <Text style={styles.meta}>
                Aucune loi ne correspond à ta recherche.
              </Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },

  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: theme.colors.text,
  },
  headerSubtitle: {
    fontSize: 13,
    color: theme.colors.subtext,
    marginTop: 4,
  },

  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  searchInput: {
    backgroundColor: theme.colors.card,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14,
    color: theme.colors.text,
  },

  filtersRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  filterPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: theme.colors.surface,
    marginRight: 8,
  },
  filterPillActive: {
    backgroundColor: theme.colors.card,
  },
  filterPillText: {
    fontSize: 12,
    color: theme.colors.subtext,
  },
  filterPillTextActive: {
    color: theme.colors.text,
    fontWeight: "600",
  },

  sortRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  sortPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: theme.colors.surface,
    marginRight: 6,
  },
  sortPillActive: {
    backgroundColor: theme.colors.primarySoft,
  },
  sortPillText: {
    fontSize: 11,
    color: theme.colors.subtext,
  },
  sortPillTextActive: {
    color: theme.colors.primary,
    fontWeight: "600",
  },

  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 4,
  },
  loadingInline: {
    marginLeft: 8,
    fontSize: 12,
    color: theme.colors.subtext,
  },

  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 24,
  },

  errorText: {
    color: theme.colors.danger || "red",
    textAlign: "left",
    fontSize: 12,
  },

  card: {
    backgroundColor: theme.colors.card,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.text,
    flex: 1,
  },
  meta: {
    fontSize: 12,
    color: theme.colors.subtext,
    marginTop: 4,
  },

  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 8,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: theme.colors.primarySoft,
    marginRight: 6,
    marginTop: 4,
  },
  chipText: {
    fontSize: 11,
    color: theme.colors.primary,
    fontWeight: "500",
  },

  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    justifyContent: "space-between",
  },
  loiIdText: {
    fontSize: 11,
    color: theme.colors.subtext,
    marginLeft: 8,
  },

  badge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeSoft: {
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  badgeSoftText: {
    fontSize: 11,
    color: theme.colors.subtext,
  },
  badgeSuccess: {
    backgroundColor: theme.colors.primarySoft,
  },
  badgeSuccessText: {
    fontSize: 11,
    color: theme.colors.primary,
    fontWeight: "600",
  },
  badgeWarning: {
    borderWidth: 1,
    borderColor: theme.colors.danger,
  },
  badgeWarningText: {
    fontSize: 11,
    color: theme.colors.danger,
    fontWeight: "600",
  },
});
