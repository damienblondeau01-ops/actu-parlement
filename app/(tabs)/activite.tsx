// app/(tabs)/activite.tsx
import { useRouter } from "expo-router";
import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabaseClient";
import { theme } from "../../lib/theme";
import { routeFromItemId } from "@/lib/routes";

const colors = theme.colors;

type LoiFeedSearchRow = {
  loi_id: string;
  titre_loi_canon: string;
  derniere_activite_date: string | null;
  score: number;
};

type TabKey = "lois" | "evenements";

function fmtDateFR(d?: string | null) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("fr-FR");
  } catch {
    return "—";
  }
}

// Heuristique V1 (simple & robuste) : on classifie à partir du loi_id + titre
function classifyItem(row: LoiFeedSearchRow): TabKey {
  const id = (row.loi_id ?? "").toLowerCase();
  const t = (row.titre_loi_canon ?? "").toLowerCase();

  if (id.startsWith("motion-de-censure")) return "evenements";
  if (id.includes("censure")) return "evenements";
  if (t.includes("motion de censure")) return "evenements";

  // Déclarations (on pourra affiner après)
  if (id.includes("declaration") || id.includes("déclaration")) return "evenements";
  if (t.includes("déclaration") || t.includes("declaration")) return "evenements";
  if (t.includes("politique générale")) return "evenements";
  if (t.includes("declaration du gouvernement") || t.includes("déclaration du gouvernement"))
    return "evenements";

  return "lois";
}

function TabPill({
  label,
  active,
  onPress,
  count,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  count?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.tabPill, active ? styles.tabPillOn : styles.tabPillOff]}
    >
      <Text style={[styles.tabPillText, active ? styles.tabPillTextOn : styles.tabPillTextOff]}>
        {label}
      </Text>

      {typeof count === "number" ? (
        <View style={[styles.tabCount, active ? styles.tabCountOn : styles.tabCountOff]}>
          <Text
            style={[
              styles.tabCountText,
              active ? styles.tabCountTextOn : styles.tabCountTextOff,
            ]}
          >
            {count}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export default function ActiviteIndexScreen() {
  const router = useRouter();

  const [tab, setTab] = useState<TabKey>("lois");
  const [q, setQ] = useState("");

  const [rows, setRows] = useState<LoiFeedSearchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // RPC search (lois + événements mélangés, on filtre côté app via classifyItem)
  const runSearch = useCallback(async (text: string) => {
    const query = text.trim();
    setError(null);

    // UX: si vide => on ne met rien (tu peux évoluer plus tard vers un feed "latest")
    if (!query) {
      setRows([]);
      return;
    }

    setLoading(true);
    try {
      const { data, error: e } = await supabase.rpc("search_lois_feed", {
        q: query,
        lim: 80,
      });
      if (e) throw e;
      setRows((data ?? []) as LoiFeedSearchRow[]);
    } catch (err: any) {
      console.warn("[ACTIVITE] rpc error:", err);
      setRows([]);
      setError("Recherche indisponible pour le moment.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounce
  useEffect(() => {
    const t = setTimeout(() => runSearch(q), 250);
    return () => clearTimeout(t);
  }, [q, runSearch]);

  const { loisCount, eventsCount, filtered } = useMemo(() => {
    const withType = rows.map((r) => ({ r, type: classifyItem(r) }));
    const loisCount = withType.filter((x) => x.type === "lois").length;
    const eventsCount = withType.filter((x) => x.type === "evenements").length;
    const filtered = withType.filter((x) => x.type === tab).map((x) => x.r);
    return { loisCount, eventsCount, filtered };
  }, [rows, tab]);

  const renderItem = useCallback(
    ({ item }: { item: LoiFeedSearchRow }) => {
      const date = fmtDateFR(item.derniere_activite_date);
      const isEvent = classifyItem(item) === "evenements";

      return (
        <Pressable
          style={styles.card}
          onPress={() => {
            // ✅ navigation robuste (anti "scrutin-* -> fiche loi")
            const target = String(item.loi_id ?? "");
            if (!target) return;
            const href = routeFromItemId(target);
if (!href) return;
router.push(href as any);
          }}
          android_ripple={{ color: "rgba(255,255,255,0.06)" }}
        >
          <View style={styles.rowTop}>
            <Text style={styles.title} numberOfLines={2}>
              {item.titre_loi_canon || `Item ${item.loi_id}`}
            </Text>

            {isEvent ? (
              <View style={styles.tagEvent}>
                <Text style={styles.tagEventText}>ÉVÉNEMENT</Text>
              </View>
            ) : (
              <View style={styles.tagLaw}>
                <Text style={styles.tagLawText}>LOI</Text>
              </View>
            )}
          </View>

          <Text style={styles.meta}>
            Dernière activité : <Text style={styles.metaStrong}>{date}</Text>
          </Text>

          <View style={styles.ctaRow}>
            <Text style={styles.ctaText}>{isEvent ? "Voir le vote →" : "Comprendre →"}</Text>
          </View>

          {loading ? (
            <Text style={[styles.meta, { marginTop: 6 }]}>Chargement…</Text>
          ) : null}
        </Pressable>
      );
    },
    [router, loading]
  );

  const hasQuery = q.trim().length > 0;
  const showEmpty = filtered.length === 0;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.h1}>Activité</Text>

        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Rechercher (lois & événements)…"
          placeholderTextColor={colors.subtext}
          style={styles.search}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />

        <View style={styles.tabsRow}>
          <TabPill
            label="Lois"
            active={tab === "lois"}
            onPress={() => setTab("lois")}
            count={hasQuery ? loisCount : undefined}
          />
          <TabPill
            label="Événements"
            active={tab === "evenements"}
            onPress={() => setTab("evenements")}
            count={hasQuery ? eventsCount : undefined}
          />
        </View>

        {hasQuery && loading ? <Text style={styles.hint}>Recherche…</Text> : null}
        {hasQuery && error ? <Text style={[styles.hint, { color: colors.danger }]}>{error}</Text> : null}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(it) => String(it.loi_id)}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          showEmpty ? (
            <View style={{ padding: 16 }}>
              <Text style={{ color: colors.subtext }}>
                {hasQuery ? "Aucun résultat dans cet onglet." : "Tape une recherche pour afficher l’activité."}
              </Text>

              {hasQuery ? (
                <Pressable style={[styles.badge, { marginTop: 12 }]} onPress={() => setQ("")}>
                  <Text style={styles.badgeText}>Effacer la recherche</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },

  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 10,
  },
  h1: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  search: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 14,
  },

  tabsRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  tabPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  tabPillOn: {
    backgroundColor: "rgba(59,130,246,0.16)",
    borderColor: "rgba(59,130,246,0.30)",
  },
  tabPillOff: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.10)",
  },
  tabPillText: { fontSize: 12, fontWeight: "900" },
  tabPillTextOn: { color: colors.text },
  tabPillTextOff: { color: colors.subtext },

  tabCount: {
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  tabCountOn: { backgroundColor: "rgba(59,130,246,0.22)" },
  tabCountOff: { backgroundColor: "rgba(255,255,255,0.10)" },
  tabCountText: { fontSize: 12, fontWeight: "900" },
  tabCountTextOn: { color: colors.text },
  tabCountTextOff: { color: colors.subtext },

  hint: { color: colors.subtext, fontSize: 12 },

  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },

  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 10,
  },
  rowTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  title: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 20,
  },

  tagEvent: {
    backgroundColor: "rgba(250,204,21,0.10)",
    borderColor: "rgba(250,204,21,0.22)",
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  tagEventText: { color: "#fde68a", fontSize: 11, fontWeight: "900" },

  tagLaw: {
    backgroundColor: "rgba(99,102,241,0.10)",
    borderColor: "rgba(99,102,241,0.22)",
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  tagLawText: { color: colors.text, fontSize: 11, fontWeight: "900" },

  meta: { color: colors.subtext, fontSize: 13 },
  metaStrong: { color: colors.text, fontWeight: "900" },

  ctaRow: { flexDirection: "row", justifyContent: "flex-end" },
  ctaText: { color: colors.text, fontSize: 12, fontWeight: "900" },

  badge: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: colors.border,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  badgeText: { color: colors.text, fontSize: 12, fontWeight: "800" },
});
