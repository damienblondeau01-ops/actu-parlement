// app/(tabs)/deputes/index.tsx

import React, {
  useEffect,
  useState,
  useMemo,
  useCallback,
} from "react";
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
  photoUrl?: string | null;
  photourl?: string | null;
};

type GroupFilter = {
  code: string;
  label: string;
};

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
          photoUrl,
          photourl
        `
        )
        .order("nomcomplet", { ascending: true });

      if (error) {
        console.warn("Erreur chargement deputes_officiels :", error);
        setError("Impossible de charger la liste des députés.");
        setDeputes([]);
        return;
      }

      const rows = (data || []) as DeputeRow[];

      const filtered = rows.filter((d) => {
        const raw = (d.id_an || "").trim();
        if (!raw) return false;
        if (raw.toLowerCase() === "null") return false;
        return true;
      });

      console.log(
        "[DEPUTES LIST] nb brut =",
        rows.length,
        "| nb filtrés (id_an valide) =",
        filtered.length
      );

      setDeputes(filtered);
    } catch (e) {
      console.warn("Erreur inattendue liste députés :", e);
      setError("Erreur inattendue lors du chargement des députés.");
      setDeputes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDeputes();
  }, [loadDeputes]);

  // 🔹 Liste des groupes uniques (code + label complet)
  const groups: GroupFilter[] = useMemo(() => {
    const map = new Map<string, string>(); // code -> label
    deputes.forEach((d) => {
      if (d.groupeAbrev) {
        const label = d.groupe || d.groupeAbrev;
        if (!map.has(d.groupeAbrev)) {
          map.set(d.groupeAbrev, label);
        }
      }
    });

    return Array.from(map.entries())
      .map(([code, label]) => ({ code, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "fr"));
  }, [deputes]);

  // 🔹 Filtrage (recherche + groupe)
  const filteredDeputes = useMemo(() => {
    const q = search.trim().toLowerCase();

    return deputes.filter((d) => {
      if (selectedGroup && d.groupeAbrev !== selectedGroup) return false;

      if (q) {
        const name =
          (d.nomComplet ||
            d.nomcomplet ||
            `${d.prenom ?? ""} ${d.nom ?? ""}`) // fallback
            .toLowerCase();

        const circo = (
          d.circonscription ||
          d.departementNom ||
          d.departementCode ||
          ""
        ).toLowerCase();

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

    const parts = name.split(" ").filter(Boolean);
    const initials =
      parts.length >= 2
        ? `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase()
        : name.slice(0, 2).toUpperCase();

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
          <Text style={styles.avatarText}>{initials}</Text>
        )}
      </View>
    );
  };

  const renderItem = ({ item }: { item: DeputeRow }) => {
    const displayName =
      item.nomComplet ||
      item.nomcomplet ||
      `${item.prenom ?? ""} ${item.nom ?? ""}`.trim() ||
      `Député ${item.id_an ?? ""}`;

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
          if (!item.id_an) return;
          router.push(`/deputes/${item.id_an}`);
        }}
      >
        {renderAvatar(item)}
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>
            {displayName}
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

  // Clés stables
  const keyExtractor = (item: DeputeRow, index: number) =>
    item.id_an ? `depute-${item.id_an}` : `depute-${index}`;

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
        <Text style={styles.errorText}>
          Aucun député trouvé dans la table `deputes_officiels`.
        </Text>
      </SafeAreaView>
    );
  }

  const currentGroupLabel =
    selectedGroup
      ? groups.find((g) => g.code === selectedGroup)?.label ||
        selectedGroup
      : "Tous les groupes";

  return (
    <SafeAreaView style={styles.container}>
      {/* 🔹 Header + chiffres */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Députés</Text>
        <Text style={styles.headerSubtitle}>
          {filteredDeputes.length} sur {deputes.length} député(s)
        </Text>
      </View>

      {/* 🔹 Barre de recherche */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher un député ou une circonscription…"
          placeholderTextColor={theme.colors.subtext}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* 🔹 Filtre groupe — liste déroulante (nom complet) */}
      {groups.length > 0 && (
        <View style={styles.dropdownContainer}>
          <Text style={styles.dropdownLabel}>Filtrer par groupe</Text>
          <Pressable
            style={styles.dropdownSelector}
            onPress={() =>
              setGroupDropdownOpen((open) => !open)
            }
          >
            <Text style={styles.dropdownSelectorText}>
              {currentGroupLabel}
            </Text>
            <Text style={styles.dropdownSelectorChevron}>
              {groupDropdownOpen ? "▴" : "▾"}
            </Text>
          </Pressable>

          {groupDropdownOpen && (
            <View style={styles.dropdownList}>
              <ScrollView
                nestedScrollEnabled
                style={{ maxHeight: 240 }}
              >
                {/* Option "Tous" */}
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
                      !selectedGroup &&
                        styles.dropdownItemTextActive,
                    ]}
                  >
                    Tous les groupes
                  </Text>
                </Pressable>

                {/* Groupes réels */}
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
                        selectedGroup === g.code &&
                          styles.dropdownItemTextActive,
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

      {/* 🔹 Liste */}
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

  // 🔍 Search
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

  // 🎯 Dropdown groupes
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

  // 🟣 Avatar rond (photo ou initiales)
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 999,
    marginRight: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primarySoft || "rgba(79,70,229,0.16)",
    overflow: "hidden", // important pour que la photo soit bien ronde
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
});
