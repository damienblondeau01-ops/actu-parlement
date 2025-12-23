// app/(tabs)/lois/[id]/groupes/[groupe]/deputes.tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { theme } from "@/lib/theme";
import { fromSafe, DB_VIEWS } from "@/lib/dbContract";

const colors = theme.colors;
const TEXT = colors.text || "#E5E7EB";
const SUBTEXT = colors.subtext || "rgba(229,231,235,0.72)";

/* =========================
   Types
========================= */

type RouteParams = {
  id?: string; // loi_id
  groupe?: string; // segment [groupe] encodé dans l’URL
  vs?: string; // querystring: numero_scrutin
  numero_scrutin?: string; // fallback
  groupe_label?: string; // optionnel (UI)
};

type VoteKey = "pour" | "contre" | "abstention" | "nv";

type Row = {
  // ✅ colonnes "probables" (on ne dépend pas de id_an)
  id_depute?: string | null;
  depute_id?: string | null;
  id?: string | null;

  nom_depute?: string | null;
  prenom?: string | null;
  nom?: string | null;

  photo_url?: string | null;

  // normalisé
  groupe_norm?: string | null;

  // vote / position
  position?: string | null;
  vote?: string | null;

  numero_scrutin?: number | string | null;
};

type RowVM = Row & {
  depId: string | null;
  display: string;
  voteKey: VoteKey;
};

/* =========================
   Utils
========================= */

function toCleanString(v: any) {
  return String(v ?? "").replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeNumeroScrutin(raw?: string | null): number | null {
  if (!raw) return null;
  const s = String(raw);
  const m = s.match(/(\d+)/g);
  if (!m || !m.length) return null;
  const n = Number(m[m.length - 1]);
  return Number.isFinite(n) ? n : null;
}

// ✅ id robuste : on évite id_an qui n'existe pas dans la view
function getDeputeId(r: Row) {
  const a = toCleanString(r.id_depute);
  if (a) return a;

  const b = toCleanString(r.depute_id);
  if (b) return b;

  const c = toCleanString(r.id);
  if (c) return c;

  // dernier recours (pas idéal, mais évite de casser)
  const d = toCleanString(r.nom_depute);
  if (d) return null; // on préfère "pas de fiche" plutôt qu'un id faux

  return null;
}

function fullName(r: Row) {
  const n = toCleanString(r.nom_depute);
  if (n) return n;

  const p = toCleanString(r.prenom);
  const nn = toCleanString(r.nom);
  const combo = `${p} ${nn}`.trim();
  return combo || "Député inconnu";
}

function normalizeVote(raw?: any): VoteKey {
  const p = String(raw ?? "").toLowerCase();
  if (p.includes("pour")) return "pour";
  if (p.includes("contre")) return "contre";
  if (p.includes("abst")) return "abstention";
  if (p.includes("non") && (p.includes("vot") || p.includes("vote"))) return "nv";
  if (p === "nv") return "nv";
  return "nv";
}

function voteLabel(v: VoteKey) {
  if (v === "pour") return "Pour";
  if (v === "contre") return "Contre";
  if (v === "abstention") return "Abstention";
  return "N’a pas voté";
}

function pillTone(v: VoteKey) {
  if (v === "pour") return styles.pillPour;
  if (v === "contre") return styles.pillContre;
  if (v === "abstention") return styles.pillAbst;
  return styles.pillNv;
}

function Pill({ v }: { v: VoteKey }) {
  return (
    <View style={[styles.pill, pillTone(v)]}>
      <Text style={styles.pillText}>{voteLabel(v)}</Text>
    </View>
  );
}

/* =========================
   Screen
========================= */

export default function GroupeDeputesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<RouteParams>();

  const loiId = params.id ? String(params.id) : null;

  // segment [groupe] => decode
  const groupeParam = params.groupe ? decodeURIComponent(String(params.groupe)) : null;

  // scrutin id : vs (querystring) OU numero_scrutin
  const scrutinParam =
    params.vs ?? params.numero_scrutin ? String(params.vs ?? params.numero_scrutin) : null;

  const scrutinNumero = useMemo(() => normalizeNumeroScrutin(scrutinParam), [scrutinParam]);

  // ⚠️ UI label : si fourni, on l’affiche, sinon on affiche le segment
  const groupeLabelUI = useMemo(() => {
    const gl = toCleanString(params.groupe_label);
    if (gl) return gl;
    return groupeParam ?? "Groupe";
  }, [params.groupe_label, groupeParam]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [rows, setRows] = useState<RowVM[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"ALL" | "VOTED" | "NOT_VOTED">("ALL");

  useEffect(() => {
    // garde-fous
    if (!scrutinNumero || !groupeParam) {
      setLoading(false);
      setError("Paramètres manquants (scrutin ou groupe).");
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        // ✅ IMPORTANT: on ne sélectionne PAS id_an (colonne absente de la view)
        const q = fromSafe(DB_VIEWS.VOTES_DEPUTES)
          .select(
            "id_depute,depute_id,id,nom_depute,prenom,nom,photo_url,groupe_norm,position,vote,numero_scrutin"
          )
          .eq("numero_scrutin", scrutinNumero)
          .eq("groupe_norm", groupeParam);

        const { data, error: e } = await q;
        if (e) throw e;

        const mapped: RowVM[] = (data ?? []).map((r: any) => {
          const depId = getDeputeId(r as Row);
          const display = fullName(r as Row);
          const voteKey = normalizeVote((r as Row).vote ?? (r as Row).position);
          return { ...(r as Row), depId, display, voteKey };
        });

        if (!cancelled) setRows(mapped);
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? "Erreur inconnue");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [scrutinNumero, groupeParam]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rows;

    if (filter === "VOTED") list = list.filter((r) => r.voteKey !== "nv");
    if (filter === "NOT_VOTED") list = list.filter((r) => r.voteKey === "nv");

    if (q) list = list.filter((r) => r.display.toLowerCase().includes(q));

    const order: VoteKey[] = ["pour", "contre", "abstention", "nv"];
    return [...list].sort((a, b) => {
      const oa = order.indexOf(a.voteKey);
      const ob = order.indexOf(b.voteKey);
      if (oa !== ob) return oa - ob;
      return a.display.localeCompare(b.display, "fr");
    });
  }, [rows, search, filter]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </Pressable>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={1}>
            {groupeLabelUI}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {loiId ? `Loi ${loiId} · ` : ""}
            Scrutin n°{scrutinNumero ?? "—"}
          </Text>
        </View>
      </View>

      <View style={styles.tools}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Rechercher un député…"
          placeholderTextColor={SUBTEXT}
          style={styles.search}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />

        <View style={styles.filtersRow}>
          {[
            { key: "ALL" as const, label: "Tous" },
            { key: "VOTED" as const, label: "A voté" },
            { key: "NOT_VOTED" as const, label: "N’a pas voté" },
          ].map((f) => (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
            >
              <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>
                {f.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.centerText}>Chargement…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={[styles.centerText, { color: colors.danger, textAlign: "center" }]}>
            {error}
          </Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.centerText}>Aucun député ne correspond.</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(it, idx) =>
            String(it.depId ?? it.nom_depute ?? it.display ?? `row-${idx}`) + `-${it.voteKey}-${idx}`
          }
          contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 10 }}
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => {
                if (!item.depId) return;
                router.push(`/deputes/${encodeURIComponent(String(item.depId))}`);
              }}
              disabled={!item.depId}
            >
              {item.photo_url ? (
                <Image source={{ uri: item.photo_url }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarInitial}>
                    {item.display?.trim()?.charAt(0)?.toUpperCase() || "?"}
                  </Text>
                </View>
              )}

              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.display}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {item.depId ? "Ouvrir la fiche →" : "Fiche indisponible"}
                </Text>
              </View>

              <Pill v={item.voteKey} />
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

/* =========================
   Styles
========================= */

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },

  header: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.06)",
    backgroundColor: colors.surface,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: "rgba(15,23,42,0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
  backText: { color: "#fff", fontSize: 18, fontWeight: "900" },
  title: { color: TEXT, fontSize: 16, fontWeight: "900" },
  sub: { marginTop: 2, color: SUBTEXT, fontSize: 12, fontWeight: "700" },

  tools: { paddingHorizontal: 16, paddingTop: 12, gap: 10 },
  search: {
    height: 44,
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    color: TEXT,
    fontSize: 14,
    fontWeight: "700",
  },
  filtersRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },

  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  filterChipActive: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: "rgba(255,255,255,0.14)",
  },
  filterText: { color: SUBTEXT, fontSize: 12, fontWeight: "900" },
  filterTextActive: { color: TEXT },

  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 16 },
  centerText: { color: SUBTEXT, marginTop: 10, fontSize: 12, fontWeight: "700" },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },

  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { color: TEXT, fontSize: 14, fontWeight: "900" },

  name: { color: TEXT, fontSize: 14, fontWeight: "900" },
  meta: { marginTop: 2, color: SUBTEXT, fontSize: 11, fontWeight: "700" },

  pill: {
    minWidth: 72,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
  },
  pillText: { fontSize: 11, fontWeight: "900", letterSpacing: 0.2, color: TEXT, opacity: 0.95 },
  pillPour: { backgroundColor: "rgba(34,197,94,0.12)", borderColor: "rgba(34,197,94,0.25)" },
  pillContre: { backgroundColor: "rgba(239,68,68,0.10)", borderColor: "rgba(239,68,68,0.22)" },
  pillAbst: { backgroundColor: "rgba(234,179,8,0.12)", borderColor: "rgba(234,179,8,0.24)" },
  pillNv: { backgroundColor: "rgba(148,163,184,0.10)", borderColor: "rgba(148,163,184,0.18)" },
});
