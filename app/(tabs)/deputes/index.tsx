// app/(tabs)/deputes/index.tsx

import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  ActivityIndicator,
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
  // ✅ ancien champ (peut exister)
  id_an?: string | null;

  // ✅ nouveaux ids (peuvent NE PAS exister dans la table)
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

type GroupFilter = {
  code: string;
  label: string;
};

function clean(v: any) {
  return String(v ?? "").trim();
}

function isMissingColumnError(err: any) {
  const code = String(err?.code ?? "");
  const msg = String(err?.message ?? "").toLowerCase();
  return code === "42703" || msg.includes("does not exist") || msg.includes("undefined column");
}

function getDepId(d: DeputeRow): string | null {
  // priorité aux ids “stables”
  const a = clean(d.id_depute);
  if (a && a.toLowerCase() !== "null") return a;

  const b = clean(d.depute_id);
  if (b && b.toLowerCase() !== "null") return b;

  const c = clean(d.id);
  if (c && c.toLowerCase() !== "null") return c;

  // fallback legacy
  const z = clean(d.id_an);
  if (z && z.toLowerCase() !== "null") return z;

  return null;
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")                         // accents → séparés
    .replace(/[\u0300-\u036f]/g, "")          // supprime accents
    .replace(/[-'’_.]/g, " ")                 // 🔥 tirets & séparateurs → espace
    .replace(/\s+/g, " ")                     // espaces multiples → un seul
    .trim()
    .toLowerCase();
}

export default function DeputesListScreen() {
  const router = useRouter();

  const [deputes, setDeputes] = useState<DeputeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [groupDropdownOpen, setGroupDropdownOpen] = useState(false);

  const loadDeputes = useCallback(async () => {
  try {
    setLoading(true);
    setError(null);

    // 1) requête MINIMALE (celle qui a le plus de chances de marcher)
    //    -> pas de .order() (souvent la source du crash)
    const r1 = await supabase
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
        photoUrl,
        photourl
      `
      );

    if (r1.error) {
      console.warn("[DEPUTES LIST] deputes_officiels r1 error:", r1.error);
      setError("Impossible de charger la liste des députés.");
      setDeputes([]);
      return;
    }

    const rows = (r1.data || []) as DeputeRow[];

    // 2) filtre id_an valide (comme AVANT, pour revenir au stable)
    const filtered = rows.filter((d) => {
      const raw = String(d.id_an ?? "").trim();
      if (!raw) return false;
      if (raw.toLowerCase() === "null") return false;
      return true;
    });

    // 3) tri côté JS (évite les erreurs de colonne DB)
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

  const groups: GroupFilter[] = useMemo(() => {
    const map = new Map<string, string>();
    deputes.forEach((d) => {
      if (d.groupeAbrev) {
        const label = d.groupe || d.groupeAbrev;
        if (!map.has(d.groupeAbrev)) map.set(d.groupeAbrev, label);
      }
    });

    return Array.from(map.entries())
      .map(([code, label]) => ({ code, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "fr"));
  }, [deputes]);

  const filteredDeputes = useMemo(() => {
    const q = normalizeText(search.trim());

    return deputes.filter((d) => {
      if (selectedGroup && d.groupeAbrev !== selectedGroup) return false;

      if (q) {
  const nameRaw =
    d.nomComplet ||
    d.nomcomplet ||
    `${d.prenom ?? ""} ${d.nom ?? ""}`;

  const circoRaw =
    d.circonscription ||
    d.departementNom ||
    d.departementCode ||
    "";

  const name = normalizeText(nameRaw);
  const circo = normalizeText(circoRaw);

  if (!name.includes(q) && !circo.includes(q)) return false;
}

      return true;
    });
  }, [deputes, search, selectedGroup]);

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
          <Image source={{ uri: photoUrl }} style={styles.avatarImage} contentFit="cover" />
        ) : (
          <Text style={styles.avatarText}>{initials || "??"}</Text>
        )}
      </View>
    );
  };

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
        ? `${item.departementNom ?? ""}${item.departementCode ? ` (${item.departementCode})` : ""}`
        : null);

    return (
      <Pressable
        style={styles.row}
        onPress={() => {
          if (!item.id_an) return;
          router.push(`/deputes/${encodeURIComponent(String(depId))}`);
        }}
        disabled={!depId}
      >
        {renderAvatar(item)}
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>
  {renderHighlightedText(displayName, search)}
</Text>
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

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Chargement des députés…</Text>
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

  const currentGroupLabel =
    selectedGroup
      ? groups.find((g) => g.code === selectedGroup)?.label || selectedGroup
      : "Tous les groupes";

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Députés</Text>
        <Text style={styles.headerSubtitle}>
  {filteredDeputes.length} député{filteredDeputes.length > 1 ? "s" : ""} affiché
  {filteredDeputes.length > 1 ? "s" : ""} sur {deputes.length}
</Text>
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

  {search.trim().length > 0 ? (
    <Text style={styles.searchHint}>
      {filteredDeputes.length} résultat(s) — recherche sur le nom et la circonscription
    </Text>
  ) : null}
</View>

      {groups.length > 0 && (
        <View style={styles.dropdownContainer}>
          <Text style={styles.dropdownLabel}>Filtrer par groupe</Text>
          <Pressable
            style={styles.dropdownSelector}
            onPress={() => setGroupDropdownOpen((open) => !open)}
          >
            <Text style={styles.dropdownSelectorText}>{currentGroupLabel}</Text>
            <Text style={styles.dropdownSelectorChevron}>
              {groupDropdownOpen ? "▴" : "▾"}
            </Text>
          </Pressable>

          {groupDropdownOpen && (
            <View style={styles.dropdownList}>
              <ScrollView nestedScrollEnabled style={{ maxHeight: 240 }}>
                <Pressable
                  style={styles.dropdownItem}
                  onPress={() => {
                    setSelectedGroup(null);
                    setGroupDropdownOpen(false);
                  }}
                >
                  <Text
                    style={[
                      styles.dropdownItemText,
                      !selectedGroup && styles.dropdownItemTextActive,
                    ]}
                  >
                    Tous les groupes
                  </Text>
                </Pressable>

                {groups.map((g) => (
                  <Pressable
                    key={g.code}
                    style={styles.dropdownItem}
                    onPress={() => {
                      setSelectedGroup(g.code);
                      setGroupDropdownOpen(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.dropdownItemText,
                        selectedGroup === g.code && styles.dropdownItemTextActive,
                      ]}
                    >
                      {g.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      )}

      <FlatList
        data={filteredDeputes}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
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
  loadingText: { marginTop: 8, color: theme.colors.subtext },
  errorText: {
    color: theme.colors.danger || "red",
    textAlign: "center",
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
    paddingBottom: 4,
  },
  searchInput: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: theme.colors.card,
    color: theme.colors.text,
    fontSize: 13,
  },

  dropdownContainer: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 4,
  },
  dropdownLabel: {
    fontSize: 12,
    color: theme.colors.subtext,
    marginBottom: 4,
  },
  dropdownSelector: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    backgroundColor: theme.colors.card,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  dropdownSelectorText: {
    flex: 1,
    fontSize: 13,
    color: theme.colors.text,
  },
  dropdownSelectorChevron: {
    fontSize: 14,
    color: theme.colors.subtext,
    marginLeft: 8,
  },
  dropdownList: {
    marginTop: 4,
    borderRadius: 12,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border || "rgba(148,163,184,0.4)",
    overflow: "hidden",
  },
  dropdownItem: {
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  dropdownItemText: {
    fontSize: 13,
    color: theme.colors.subtext,
  },
  dropdownItemTextActive: {
    color: theme.colors.primary,
    fontWeight: "600",
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
  avatarImage: {
    width: "100%",
    height: "100%",
  },
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
highlight: {
  backgroundColor: "rgba(250,204,21,0.35)", // jaune doux
  color: theme.colors.text,
  borderRadius: 4,
},
});
