// app/(tabs)/deputes/index.tsx

import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  TextInput,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { supabase } from "../../../lib/supabaseClient";
import { theme } from "../../../lib/theme";

type DeputeRow = {
  id_an?: string | null;

  id_depute?: string | null;
  depute_id?: string | null;
  id?: string | null;

  nomComplet: string | null;
  nomcomplet: string | null;
  prenom: string | null;
  nom: string | null;

  groupeAbrev: string | null;
  groupe: string | null;

  circonscription: string | null;
  departementNom: string | null;
  departementCode: string | null;

  photoUrl?: string | null;
  photourl?: string | null;
};

type GroupChip = {
  code: string | null; // null => Tous
  label: string; // label court
  count: number;
};

function clean(v: any) {
  return String(v ?? "").trim();
}

function getDepId(d: DeputeRow): string | null {
  const a = clean(d.id_depute);
  if (a && a.toLowerCase() !== "null") return a;

  const b = clean(d.depute_id);
  if (b && b.toLowerCase() !== "null") return b;

  const c = clean(d.id);
  if (c && c.toLowerCase() !== "null") return c;

  const z = clean(d.id_an);
  if (z && z.toLowerCase() !== "null") return z;

  return null;
}

function normalizeText(value: string) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[-'’_.]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function findMatchRange(text: string, query: string) {
  const t = normalizeText(text);
  const q = normalizeText(query.trim());
  if (!q) return null;

  const idx = t.indexOf(q);
  if (idx === -1) return null;

  return { start: idx, end: idx + q.length };
}

function renderHighlightedText(text: string, query: string) {
  const match = findMatchRange(text, query);
  if (!match) return text;

  const before = text.slice(0, match.start);
  const middle = text.slice(match.start, match.end);
  const after = text.slice(match.end);

  return (
    <>
      {before}
      <Text style={styles.highlight}>{middle}</Text>
      {after}
    </>
  );
}

function useDebouncedValue<T>(value: T, delay = 150) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function shortGroupLabel(raw: string) {
  const s = String(raw ?? "").trim();
  const base = s.split("(")[0].split("—")[0].split(" - ")[0].trim();
  if (!base) return s || "Groupe";
  return base.length > 26 ? base.slice(0, 26).trimEnd() + "…" : base;
}

export default function DeputesListScreen() {
  const router = useRouter();
  const listRef = useRef<FlatList<DeputeRow>>(null);

  const [deputes, setDeputes] = useState<DeputeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 150);

  const [selectedGroup, setSelectedGroup] = useState<string | null>(null); // null => Tous

  const loadDeputes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const r1 = await supabase.from("deputes_officiels").select(`
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
        photoUrl,
        photourl
      `);

      if (r1.error) {
        console.warn("[DEPUTES LIST] deputes_officiels r1 error:", r1.error);
        setError("Impossible de charger la liste des députés.");
        setDeputes([]);
        return;
      }

      const rows = (r1.data || []) as DeputeRow[];

      const filtered = rows.filter((d) => {
        const raw = String(d.id_an ?? "").trim();
        if (!raw) return false;
        if (raw.toLowerCase() === "null") return false;
        return true;
      });

      const normName = (d: DeputeRow) =>
        (
          d.nomcomplet ||
          d.nomComplet ||
          `${d.prenom ?? ""} ${d.nom ?? ""}`.trim() ||
          ""
        )
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");

      filtered.sort((a, b) => normName(a).localeCompare(normName(b), "fr"));

      console.log(
        "[DEPUTES LIST] nb brut =",
        rows.length,
        "| nb filtrés (id_an valide) =",
        filtered.length
      );

      setDeputes(filtered);
    } catch (e) {
      console.warn("[DEPUTES LIST] erreur inattendue:", e);
      setError("Erreur inattendue lors du chargement des députés.");
      setDeputes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDeputes();
  }, [loadDeputes]);

  const filteredDeputes = useMemo(() => {
    const q = normalizeText(debouncedSearch.trim());

    return deputes.filter((d) => {
      if (selectedGroup && d.groupeAbrev !== selectedGroup) return false;

      if (q) {
        const nameRaw =
          d.nomComplet || d.nomcomplet || `${d.prenom ?? ""} ${d.nom ?? ""}`;
        const circoRaw =
          d.circonscription || d.departementNom || d.departementCode || "";

        const name = normalizeText(nameRaw);
        const circo = normalizeText(circoRaw);

        if (!name.includes(q) && !circo.includes(q)) return false;
      }

      return true;
    });
  }, [deputes, debouncedSearch, selectedGroup]);

  const groupChips: GroupChip[] = useMemo(() => {
    const map = new Map<string, { label: string; count: number }>();

    for (const d of deputes) {
      const code = d.groupeAbrev ? String(d.groupeAbrev) : "";
      if (!code) continue;

      const labelRaw = d.groupe || d.groupeAbrev || code;
      const label = shortGroupLabel(labelRaw);

      const prev = map.get(code);
      if (!prev) map.set(code, { label, count: 1 });
      else map.set(code, { label: prev.label, count: prev.count + 1 });
    }

    const items = Array.from(map.entries()).map(([code, v]) => ({
      code,
      label: v.label,
      count: v.count,
    }));

    items.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.label.localeCompare(b.label, "fr");
    });

    return [{ code: null, label: "Tous", count: deputes.length }, ...items];
  }, [deputes]);

  const setGroup = useCallback((code: string | null) => {
    setSelectedGroup(code);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const renderAvatar = (item: DeputeRow) => {
    const name =
      item.nomComplet ||
      item.nomcomplet ||
      `${item.prenom ?? ""} ${item.nom ?? ""}`.trim();

    const parts = String(name ?? "").split(" ").filter(Boolean);
    const initials =
      parts.length >= 2
        ? `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase()
        : String(name ?? "").slice(0, 2).toUpperCase();

    const photoUrl = item.photoUrl || item.photourl || null;

    return (
      <View style={styles.avatar}>
        {photoUrl ? (
          <Image
            source={{ uri: photoUrl }}
            style={styles.avatarImage}
            contentFit="cover"
          />
        ) : (
          <Text style={styles.avatarText}>{initials || "??"}</Text>
        )}
      </View>
    );
  };

  const renderItem = ({ item }: { item: DeputeRow }) => {
    const depId = getDepId(item);

    const displayName =
      item.nomComplet ||
      item.nomcomplet ||
      `${item.prenom ?? ""} ${item.nom ?? ""}`.trim() ||
      (depId ? `Député ${depId}` : "Député");

    const circoLabel =
      item.circonscription ||
      (item.departementNom || item.departementCode
        ? `${item.departementNom ?? ""}${
            item.departementCode ? ` (${item.departementCode})` : ""
          }`
        : null);

    return (
      <Pressable
        style={styles.row}
        onPress={() => {
          if (!depId) return;
          router.push(`/deputes/${encodeURIComponent(String(depId))}`);
        }}
        disabled={!depId}
      >
        {renderAvatar(item)}
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>
            {renderHighlightedText(displayName, search)}
          </Text>

          {/* ✅ Groupe = info (pas un lien). Le filtre chips suffit. */}
          <Text style={styles.meta} numberOfLines={1}>
            {item.groupeAbrev ? `[${item.groupeAbrev}] ` : ""}
            {item.groupe ?? ""}
          </Text>

          {circoLabel && (
            <Text style={styles.metaSmall} numberOfLines={1}>
              {circoLabel}
            </Text>
          )}
        </View>

        <Text style={styles.chevron}>›</Text>
      </Pressable>
    );
  };

  const keyExtractor = (item: DeputeRow, index: number) => {
    const depId = getDepId(item);
    return depId ? `depute-${depId}` : `depute-${index}`;
  };

  const renderEmptyState = () => (
    <View style={styles.emptyWrap}>
      <Text style={styles.emptyIcon}>🔍</Text>
      <Text style={styles.emptyTitle}>Aucun député trouvé</Text>
      <Text style={styles.emptyText}>
        Essayez avec un autre nom, un département, ou modifiez les filtres.
      </Text>

      <Pressable
        style={styles.emptyBtn}
        onPress={() => {
          setSearch("");
          setSelectedGroup(null);
          listRef.current?.scrollToOffset({ offset: 0, animated: true });
        }}
      >
        <Text style={styles.emptyBtnText}>Effacer les filtres</Text>
      </Pressable>
    </View>
  );

  const headerSubtitle = selectedGroup
    ? (() => {
        const chip = groupChips.find((c) => c.code === selectedGroup);
        const label = chip?.label || selectedGroup;
        const cnt = chip?.count ?? filteredDeputes.length;
        return `${label} · ${cnt} député${cnt > 1 ? "s" : ""}`;
      })()
    : `Tous · ${deputes.length} députés`;

  const showSearchHint =
    search.trim().length > 0
      ? `${filteredDeputes.length} résultat(s) — recherche sur le nom et la circonscription`
      : null;

  const renderHeader = () => (
    <View style={styles.stickyHeaderWrap}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Députés</Text>
        <Text style={styles.headerSubtitle}>{headerSubtitle}</Text>
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="Nom, circonscription ou département…"
            placeholderTextColor={theme.colors.subtext}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />

          {search.trim().length > 0 && (
            <Pressable
              onPress={() => setSearch("")}
              style={styles.clearBtn}
              hitSlop={10}
            >
              <Text style={styles.clearBtnText}>Effacer</Text>
            </Pressable>
          )}
        </View>

        {showSearchHint ? (
          <Text style={styles.searchHint}>{showSearchHint}</Text>
        ) : null}
      </View>

      {/* ✅ Chips groupes : filtre uniquement */}
      {groupChips.length > 1 && (
        <View style={styles.chipsWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsContent}
          >
            {groupChips.map((g) => {
              const active =
                (selectedGroup === null && g.code === null) ||
                selectedGroup === g.code;

              return (
                <Pressable
                  key={String(g.code ?? "all")}
                  onPress={() => setGroup(g.code)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text
                    style={[styles.chipText, active && styles.chipTextActive]}
                    numberOfLines={1}
                  >
                    {`${g.label} · ${g.count}`}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      <View style={styles.headerDivider} />
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <View key={i} style={styles.skeletonRow}>
              <View style={styles.skeletonAvatar} />
              <View style={{ flex: 1 }}>
                <View style={styles.skeletonLine} />
                <View style={[styles.skeletonLine, { width: "60%" }]} />
              </View>
            </View>
          ))}
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
      </SafeAreaView>
    );
  }

  if (deputes.length === 0) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.searchHint}>
          Essayez avec un nom plus court ou un département.
        </Text>
      </SafeAreaView>
    );
  }

  const isEmpty = deputes.length > 0 && filteredDeputes.length === 0;

  if (isEmpty) {
    return (
      <SafeAreaView style={styles.container}>
        {renderHeader()}
        {renderEmptyState()}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        ref={listRef}
        data={filteredDeputes}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={renderHeader}
        stickyHeaderIndices={[0]}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        keyboardShouldPersistTaps="handled"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  center: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  errorText: {
    color: theme.colors.danger || "red",
    textAlign: "center",
    marginHorizontal: 16,
  },

  stickyHeaderWrap: {
    backgroundColor: theme.colors.background,
    paddingBottom: 8,
  },
  headerDivider: {
    height: 1,
    backgroundColor: theme.colors.border || "rgba(148,163,184,0.22)",
    marginTop: 10,
    marginHorizontal: 16,
  },

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
    fontSize: 12,
    color: theme.colors.subtext,
    marginTop: 2,
  },

  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 6,
  },
  searchInput: {
    flex: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: theme.colors.card,
    color: theme.colors.text,
    fontSize: 13,
  },
  searchHint: {
    fontSize: 11,
    color: theme.colors.subtext,
    marginTop: 6,
    marginLeft: 4,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  clearBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: theme.colors.border || "rgba(148,163,184,0.25)",
  },
  clearBtnText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "700",
  },

  chipsWrap: {
    paddingTop: 2,
    paddingBottom: 6,
  },
  chipsContent: {
    paddingHorizontal: 16,
    gap: 10,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border || "rgba(148,163,184,0.22)",
    maxWidth: 260,
  },
  chipActive: {
    backgroundColor: theme.colors.primarySoft || "rgba(79,70,229,0.16)",
    borderColor: theme.colors.primary || theme.colors.text,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.subtext,
  },
  chipTextActive: {
    color: theme.colors.primary || theme.colors.text,
  },

  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
  },

  avatar: {
    width: 40,
    height: 40,
    borderRadius: 999,
    marginRight: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primarySoft || "rgba(79,70,229,0.16)",
    overflow: "hidden",
  },
  avatarImage: { width: "100%", height: "100%" },
  avatarText: {
    color: theme.colors.primary,
    fontWeight: "700",
    fontSize: 14,
  },

  name: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.text,
  },
  meta: {
    fontSize: 12,
    color: theme.colors.subtext,
    marginTop: 2,
  },
  metaSmall: {
    fontSize: 11,
    color: theme.colors.subtext,
    marginTop: 2,
  },
  chevron: {
    fontSize: 22,
    color: theme.colors.subtext,
    marginLeft: 8,
  },
  separator: {
    height: 1,
    backgroundColor: theme.colors.border || "rgba(148,163,184,0.3)",
    marginVertical: 6,
  },

  highlight: {
    backgroundColor: "rgba(250,204,21,0.35)",
    color: theme.colors.text,
    borderRadius: 4,
  },

  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  emptyIcon: { fontSize: 36, marginBottom: 12 },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 13,
    color: theme.colors.subtext,
    textAlign: "center",
    marginBottom: 16,
  },
  emptyBtn: {
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: theme.colors.primarySoft || "rgba(79,70,229,0.16)",
  },
  emptyBtnText: {
    color: theme.colors.primary,
    fontWeight: "700",
    fontSize: 13,
  },

  skeletonRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },
  skeletonAvatar: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: theme.colors.card,
    marginRight: 10,
  },
  skeletonLine: {
    height: 10,
    borderRadius: 6,
    backgroundColor: theme.colors.card,
    marginBottom: 6,
    width: "80%",
  },
});
