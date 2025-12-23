// app/(tabs)/lois/[id]/group/[g]/deputes.tsx
import { useLocalSearchParams, useRouter } from "expo-router";
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
import { theme } from "../../../../../../lib/theme";
import { Card } from "../../../../../../components/ui/Card";
import { Chip } from "../../../../../../components/ui/Chip";
import { SectionTitle } from "../../../../../../components/ui/SectionTitle";
import { supabase } from "../../../../../../lib/supabaseClient";
import { Image as ExpoImage } from "expo-image";
import * as Haptics from "expo-haptics";

const colors = theme.colors;

type RouteParams = {
  id?: string; // loi_id
  g?: string; // label groupe (ex: ECOS)
  s?: string; // ancien param scrutin
  vs?: string; // nouveau param scrutin
  groupKey?: string; // POxxxx
};

type VoteRowDB = {
  numero_scrutin: string | null;
  id_depute: string | null;

  nom_affichage: string | null;
  photo_url: string | null;

  vote: string | null;
  position: string | null;

  groupe: string | null;
  fonction: string | null;
  url_depute: string | null;
};

type FilterKey = "ALL" | "POUR" | "CONTRE" | "ABSTENTION" | "NV";

type VoteRowUI = VoteRowDB & {
  _voteKey: Exclude<FilterKey, "ALL">;
  _fullName: string;
};

function safeStr(s?: string | null) {
  return (s ?? "").trim();
}

function safeDecode(s?: string | null) {
  if (!s) return "";
  try {
    return decodeURIComponent(String(s));
  } catch {
    return String(s);
  }
}

function normalizeVote(v?: string | null): Exclude<FilterKey, "ALL"> {
  const x = (v ?? "").toLowerCase().trim();
  if (x.includes("pour")) return "POUR";
  if (x.includes("contre")) return "CONTRE";
  if (x.includes("abst")) return "ABSTENTION";
  if ((x.includes("non") && x.includes("vot")) || x.includes("non-vot") || x.includes("nv"))
    return "NV";
  return "NV";
}

function labelVote(k: FilterKey) {
  switch (k) {
    case "POUR":
      return "Pour";
    case "CONTRE":
      return "Contre";
    case "ABSTENTION":
      return "Abstention";
    case "NV":
      return "Non-votant";
    default:
      return "Tous";
  }
}

function voteTone(k: FilterKey) {
  switch (k) {
    case "POUR":
      return { bg: "rgba(34,197,94,0.12)", bd: "rgba(34,197,94,0.30)", tx: "#86efac" };
    case "CONTRE":
      return { bg: "rgba(239,68,68,0.12)", bd: "rgba(239,68,68,0.30)", tx: "#fca5a5" };
    case "ABSTENTION":
      return { bg: "rgba(250,204,21,0.12)", bd: "rgba(250,204,21,0.30)", tx: "#fde68a" };
    case "NV":
      return {
        bg: "rgba(148,163,184,0.10)",
        bd: "rgba(148,163,184,0.22)",
        tx: "rgba(226,232,240,0.9)",
      };
    default:
      return { bg: "rgba(255,255,255,0.06)", bd: "rgba(255,255,255,0.10)", tx: colors.text };
  }
}

export default function GroupDeputesScreen() {
  const { id, g, s, vs, groupKey } = useLocalSearchParams<RouteParams>();
  const router = useRouter();

  const loiId = useMemo(() => String(id ?? ""), [id]);
  const groupLabelRaw = useMemo(() => safeDecode(String(g ?? "—")) || "—", [g]);

  const scrutinId = useMemo(() => {
    const raw = vs ?? s;
    return raw ? safeDecode(String(raw)) : "";
  }, [s, vs]);

  const groupKeyDecoded = useMemo(() => (groupKey ? safeDecode(String(groupKey)) : ""), [groupKey]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [rows, setRows] = useState<VoteRowDB[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<FilterKey>("ALL");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!scrutinId) {
        setErr("Scrutin manquant. (Paramètre ?vs=numero_scrutin)");
        setLoading(false);
        return;
      }

      if (!groupKeyDecoded) {
        setErr("Groupe manquant. (Paramètre ?groupKey=POxxxx)");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setErr(null);

        const { data, error } = await supabase
          .from("votes_deputes_scrutin_full")
          .select(
            `
            numero_scrutin,
            id_depute,
            nom_affichage,
            photo_url,
            vote,
            position,
            groupe,
            fonction,
            url_depute
          `
          )
          .eq("numero_scrutin", scrutinId)
          .eq("groupe", groupKeyDecoded)
          .order("nom_affichage", { ascending: true });

        if (error) throw error;

        const safe = (data ?? []) as VoteRowDB[];
        if (!cancelled) setRows(safe);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? "Erreur chargement votes députés");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [scrutinId, groupKeyDecoded]);

  const counts = useMemo(() => {
    const c = { ALL: 0, POUR: 0, CONTRE: 0, ABSTENTION: 0, NV: 0 } as Record<FilterKey, number>;
    for (const r of rows) {
      c.ALL += 1;
      const k = normalizeVote(r.vote ?? r.position);
      c[k] += 1;
    }
    return c;
  }, [rows]);

  const filtered = useMemo((): VoteRowUI[] => {
    const qq = q.trim().toLowerCase();

    return rows
      .map((r) => {
        const voteKey = normalizeVote(r.vote ?? r.position);
        const fullName = safeStr(r.nom_affichage) || safeStr(r.id_depute) || "Député inconnu";
        return { ...r, _voteKey: voteKey, _fullName: fullName };
      })
      .filter((r) => {
        if (filter !== "ALL" && r._voteKey !== filter) return false;
        if (!qq) return true;
        return r._fullName.toLowerCase().includes(qq) || safeStr(r.id_depute).toLowerCase().includes(qq);
      })
      .sort((a, b) => a._fullName.localeCompare(b._fullName, "fr"));
  }, [rows, q, filter]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.small}>Chargement des députés…</Text>
      </View>
    );
  }

  if (err) {
    return (
      <View style={styles.center}>
        <Text style={{ color: colors.danger, textAlign: "center", paddingHorizontal: 16 }}>{err}</Text>
        <Text style={styles.backLink} onPress={() => router.back()}>
          ← Retour
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </Pressable>

        <View style={{ flex: 1 }}>
          <Text style={styles.h1} numberOfLines={1}>
            {groupLabelRaw}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            Scrutin {scrutinId || "—"} · Loi {loiId || "—"}
          </Text>
          <Text style={styles.contextLine} numberOfLines={1}>
            Votes des députés du groupe {groupLabelRaw}
          </Text>
        </View>

        <Chip label={`${counts.ALL} députés`} />
      </View>

      <Card style={{ marginHorizontal: 16 }}>
        <SectionTitle>Filtrer</SectionTitle>

        <View style={styles.searchRow}>
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Rechercher un député…"
            placeholderTextColor={colors.subtext}
            style={styles.search}
          />
        </View>

        <View style={styles.filters}>
          {(["ALL", "POUR", "CONTRE", "ABSTENTION", "NV"] as FilterKey[]).map((k) => {
            const active = filter === k;
            const tone = voteTone(k);
            return (
              <Pressable
                key={k}
                onPress={() => setFilter(k)}
                style={[
                  styles.filterPill,
                  { borderColor: active ? tone.bd : "rgba(255,255,255,0.08)" },
                  active && { backgroundColor: tone.bg },
                ]}
              >
                <Text style={[styles.filterText, active && { color: tone.tx }]}>
                  {labelVote(k)} {k === "ALL" ? "" : `(${counts[k]})`}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <FlatList
        data={filtered}
        keyExtractor={(item, idx) => `${item.id_depute ?? "X"}-${idx}`}
        contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
        renderItem={({ item }) => {
          const tone = voteTone(item._voteKey);
          const uri = safeStr(item.photo_url);

          return (
            <Pressable
              disabled={!item.id_depute}
              onPress={async () => {
                if (!item.id_depute) return;
                try {
                  await Haptics.selectionAsync();
                } catch {}
                router.push(`/deputes/${item.id_depute}`);
              }}
              style={({ pressed }) => [{ opacity: pressed ? 0.92 : 1 }]}
            >
              <Card style={styles.rowCard}>
                <View style={styles.rowTop}>
                  <View style={styles.left}>
                    <View style={styles.avatarWrap}>
                      {uri ? (
                        <ExpoImage source={{ uri }} style={styles.avatar} contentFit="cover" transition={120} />
                      ) : (
                        <View style={styles.avatarFallback}>
                          <Text style={styles.avatarFallbackText}>
                            {(item._fullName?.[0] ?? "?").toUpperCase()}
                          </Text>
                        </View>
                      )}
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={styles.name} numberOfLines={1}>
                        {item._fullName}
                      </Text>
                      {!!item.fonction && <Text style={styles.meta}>{item.fonction}</Text>}
                    </View>
                  </View>

                  <Text style={styles.chevron}>›</Text>

                  <View style={[styles.votePill, { backgroundColor: tone.bg, borderColor: tone.bd }]}>
                    <Text style={[styles.voteText, { color: tone.tx }]}>{labelVote(item._voteKey)}</Text>
                  </View>
                </View>
              </Card>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <Text style={[styles.small, { textAlign: "center", marginTop: 16 }]}>
            Aucun député ne correspond à ce filtre.
          </Text>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  small: { marginTop: 10, color: colors.subtext, fontSize: 12, lineHeight: 16 },
  backLink: { color: colors.subtext, marginTop: 10, fontSize: 12 },

  header: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  backText: { color: colors.text, fontSize: 18, fontWeight: "900" },
  h1: { color: colors.text, fontSize: 16, fontWeight: "900" },
  sub: { color: colors.subtext, fontSize: 12, fontWeight: "800", marginTop: 2 },
  contextLine: { marginTop: 4, color: colors.subtext, fontSize: 12, fontWeight: "700" },

  searchRow: { marginTop: 10 },
  search: {
    height: 42,
    borderRadius: 14,
    paddingHorizontal: 12,
    color: colors.text,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  filters: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  filterPill: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
  },
  filterText: { color: colors.subtext, fontSize: 12, fontWeight: "900" },

  rowCard: { marginTop: 10 },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },

  left: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },

  avatarWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  avatar: { width: "100%", height: "100%" },
  avatarFallback: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  avatarFallbackText: { color: colors.text, fontWeight: "900" },

  name: { color: colors.text, fontSize: 14, fontWeight: "900" },
  meta: { marginTop: 4, color: colors.subtext, fontSize: 12, fontWeight: "800" },

  chevron: {
    color: "rgba(226,232,240,0.5)",
    fontSize: 18,
    fontWeight: "900",
    marginRight: 6,
  },

  votePill: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1 },
  voteText: { fontSize: 12, fontWeight: "900" },
});
