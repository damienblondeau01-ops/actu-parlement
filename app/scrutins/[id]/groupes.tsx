// app/scrutins/[id]/groupes.tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Pressable,
  Image,
  Animated,
  Easing,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { theme } from "../../../lib/theme";
import { fromSafe, DB_VIEWS } from "../../../lib/dbContract";

const colors = theme.colors;

// ✅ Fallback couleurs (anti texte invisible)
const TEXT = colors.text || "#E5E7EB";
const SUBTEXT = colors.subtext || "rgba(229,231,235,0.72)";

type RouteParams = { id?: string };

type VoteKey = "pour" | "contre" | "abst" | "nv";
type FilterKey = "all" | VoteKey;

type VoteRow = {
  id_depute?: string | null;
  id_an?: string | null;
  id?: string | null;

  nom_depute?: string | null;
  prenom?: string | null;
  nom?: string | null;

  position?: string | null;
  vote?: string | null;

  // champs potentiels (selon vue)
  groupe_norm?: any;
  groupe_actuel?: any;
  groupe?: any;
  groupeAbrev?: any;
  groupe_abrev?: any;
  groupe_abrev_actuel?: any;
  groupe_abrev_opendata?: any;

  photo_url?: string | null;

  numero_scrutin?: string | number | null;
};

type GroupBucket = {
  groupe: string;
  pour: VoteRow[];
  contre: VoteRow[];
  abst: VoteRow[];
  nv: VoteRow[];
};

// ---------------- Helpers ----------------
function normalizeNumeroScrutin(numero: string | number): string {
  const raw = String(numero);
  const match = raw.match(/(\d+)/g);
  if (match && match.length > 0) return match[match.length - 1];
  return raw;
}

function toCleanString(v: any): string {
  return String(v ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalize vote strings (Pour / Contre / Abstention / Non-votant...) */
function getVoteKey(raw?: any): VoteKey {
  const p = String(raw ?? "").toLowerCase();
  if (p.includes("pour")) return "pour";
  if (p.includes("contre")) return "contre";
  if (p.includes("abst")) return "abst";
  if (p.includes("non") && (p.includes("vot") || p.includes("vote"))) return "nv";
  if (p === "nv") return "nv";
  return "nv";
}

function getDeputeId(v: any): string | null {
  const id =
    v?.id_depute ??
    v?.id_an ??
    v?.id ??
    v?.idAn ??
    v?.id_an_depute ??
    null;
  return id ? String(id) : null;
}

function voteLabel(k: VoteKey) {
  if (k === "pour") return "Pour";
  if (k === "contre") return "Contre";
  if (k === "abst") return "Abst.";
  return "NV";
}

/**
 * ✅ Confirmé : la vue renvoie "groupe_norm" (rempli).
 * Priorité absolue, puis fallback.
 */
function groupLabelFromRow(r: any) {
  const candidates = [
    r?.groupe_norm,
    r?.groupe_actuel,
    r?.groupe,
    r?.groupeAbrev,
    r?.groupe_abrev,
    r?.groupe_abrev_actuel,
    r?.groupe_abrev_opendata,
  ];
  for (const c of candidates) {
    const s = toCleanString(c);
    if (s) return s;
  }
  return "Non renseigné";
}

function fullNameFromRow(v: any): string {
  const nomDepute = toCleanString(v?.nom_depute);
  if (nomDepute) return nomDepute;

  const prenom = toCleanString(v?.prenom);
  const nom = toCleanString(v?.nom);
  const combo = `${prenom} ${nom}`.trim();
  return combo || "Député inconnu";
}

function VotePill({ k }: { k: VoteKey }) {
  return (
    <View
      style={[
        styles.votePill,
        k === "pour" && styles.votePillPour,
        k === "contre" && styles.votePillContre,
        k === "abst" && styles.votePillAbst,
        k === "nv" && styles.votePillNv,
      ]}
    >
      <Text style={styles.votePillText}>{voteLabel(k)}</Text>
    </View>
  );
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.filterChip,
        active && styles.filterChipActive,
        pressed && { opacity: 0.92 },
      ]}
    >
      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function getGroupTrend(g: GroupBucket): { key: VoteKey; count: number; total: number } {
  const counts: Record<VoteKey, number> = {
    pour: g.pour.length,
    contre: g.contre.length,
    abst: g.abst.length,
    nv: g.nv.length,
  };
  const total = counts.pour + counts.contre + counts.abst + counts.nv;

  const order: VoteKey[] = ["pour", "contre", "abst", "nv"];
  let best: VoteKey = "nv";
  for (const k of order) {
    if (counts[k] > counts[best]) best = k;
  }
  return { key: best, count: counts[best], total };
}

function Chevron({ open }: { open: boolean }) {
  const a = useRef(new Animated.Value(open ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(a, {
      toValue: open ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [open, a]);

  const rotate = a.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });

  return (
    <Animated.View style={{ transform: [{ rotate }], marginLeft: 6 }}>
      <Text style={styles.chev}>▾</Text>
    </Animated.View>
  );
}

/** 🎨 Mini barre répartition (stacked) — version premium */
function GroupStackBar({
  pour,
  contre,
  abst,
  nv,
}: {
  pour: number;
  contre: number;
  abst: number;
  nv: number;
}) {
  const total = pour + contre + abst + nv;
  if (!total) return null;

  const segments: { key: string; value: number; style: any }[] = [
    { key: "pour", value: pour, style: styles.stackPour },
    { key: "contre", value: contre, style: styles.stackContre },
    { key: "abst", value: abst, style: styles.stackAbst },
    { key: "nv", value: nv, style: styles.stackNv },
  ].filter((s) => s.value > 0);

  return (
    <View style={styles.stackWrap}>
      {segments.map((seg, idx) => {
        const isFirst = idx === 0;
        const isLast = idx === segments.length - 1;

        return (
          <View
            key={seg.key}
            style={[
              styles.stackSeg,
              seg.style,
              {
                flex: seg.value,
                borderTopLeftRadius: isFirst ? 999 : 0,
                borderBottomLeftRadius: isFirst ? 999 : 0,
                borderTopRightRadius: isLast ? 999 : 0,
                borderBottomRightRadius: isLast ? 999 : 0,
              },
            ]}
          >
            {!isLast && <View style={styles.stackDivider} />}
          </View>
        );
      })}
    </View>
  );
}

function getNarrativeBadge(g: GroupBucket): { label: string; tone: "success" | "warning" | "neutral" } {
  const total = g.pour.length + g.contre.length + g.abst.length + g.nv.length;
  if (!total) return { label: "Aucune donnée", tone: "neutral" };

  const nvPct = g.nv.length / total;
  if (nvPct >= 0.3) return { label: "Participation faible", tone: "warning" };

  const counts = [
    { k: "Pour", v: g.pour.length },
    { k: "Contre", v: g.contre.length },
    { k: "Abstention", v: g.abst.length },
  ];
  counts.sort((a, b) => b.v - a.v);

  const top = counts[0];
  const pct = top.v / total;

  if (pct >= 0.85) return { label: `Consensus ${top.k}`, tone: "success" };
  if (pct >= 0.65) return { label: `Majorité nette ${top.k}`, tone: "success" };
  if (pct >= 0.5) return { label: `Majorité ${top.k}`, tone: "neutral" };

  return { label: "Très partagé", tone: "warning" };
}

function StaggerItem({
  index,
  children,
}: {
  index: number;
  children: React.ReactNode;
}) {
  const a = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(a, {
      toValue: 1,
      duration: 220,
      delay: index * 18,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [a, index]);

  return (
    <Animated.View
      style={{
        opacity: a,
        transform: [
          {
            translateY: a.interpolate({
              inputRange: [0, 1],
              outputRange: [6, 0],
            }),
          },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

// ---------------- Screen ----------------
export default function ScrutinGroupesScreen() {
  const { id } = useLocalSearchParams<RouteParams>();
  const router = useRouter();

  const scrutinNumero = useMemo(
    () => (id ? normalizeNumeroScrutin(String(id)) : null),
    [id]
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<VoteRow[]>([]);

  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");

  // animation open (utilisée seulement quand le groupe est ouvert)
  const openAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(openAnim, {
      toValue: openGroup ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [openGroup, openAnim]);

  useEffect(() => {
    if (!scrutinNumero) {
      setError("Aucun numéro de scrutin fourni.");
      setLoading(false);
      return;
    }

    const num = Number(scrutinNumero);
    if (!Number.isFinite(num)) {
      setError(`Numéro de scrutin invalide : "${scrutinNumero}"`);
      setLoading(false);
      return;
    }

    let cancelled = false;

function isMissingColumnError(err: any) {
  const code = String(err?.code ?? "");
  const msg = String(err?.message ?? "").toLowerCase();
  return code === "42703" || msg.includes("does not exist") || msg.includes("undefined column");
}

const SELECT_FULL =
  "id_depute,depute_id,id,nom_depute,prenom,nom,photo_url,groupe_norm,position,vote,numero_scrutin";

// fallback minimal si jamais une de ces colonnes n’existe pas dans la view
const SELECT_MIN =
  "groupe_norm,position,vote,numero_scrutin";

const load = async () => {
  try {
    setLoading(true);
    setError(null);

    // 1) tentative avec le select complet
    const r1 = await fromSafe(DB_VIEWS.VOTES_DEPUTES)
      .select(SELECT_FULL)
      .eq("numero_scrutin", scrutinNumero);

    if (!r1.error) {
      if (!cancelled) setRows((r1.data ?? []) as VoteRow[]);
      return;
    }

    // 2) fallback si colonne absente
    if (isMissingColumnError(r1.error)) {
      const r2 = await fromSafe(DB_VIEWS.VOTES_DEPUTES)
        .select(SELECT_MIN)
        .eq("numero_scrutin", scrutinNumero);

      if (r2.error) {
        console.warn("[SCRUTIN GROUPES] erreur votes_deputes_detail_norm (fallback):", r2.error);
        if (!cancelled) {
          setError("Impossible de charger les votes par groupe.");
          setRows([]);
        }
        return;
      }

      if (!cancelled) setRows((r2.data ?? []) as VoteRow[]);
      return;
    }

    // autre erreur (réseau, droits, etc.)
    console.warn("[SCRUTIN GROUPES] erreur votes_deputes_detail_norm:", r1.error);
    if (!cancelled) {
      setError("Impossible de charger les votes par groupe.");
      setRows([]);
    }
  } catch (err) {
    console.warn("[SCRUTIN GROUPES] erreur inattendue:", err);
    if (!cancelled) {
      setError("Erreur inattendue.");
      setRows([]);
    }
  } finally {
    if (!cancelled) setLoading(false);
  }
};

load();
return () => {
  cancelled = true;
    };
  }, [scrutinNumero]);

  const grouped = useMemo<GroupBucket[]>(() => {
    if (!rows?.length) return [];
    const map: Record<string, GroupBucket> = {};

    for (const r of rows) {
      const g = groupLabelFromRow(r);
      if (!map[g]) map[g] = { groupe: g, pour: [], contre: [], abst: [], nv: [] };

      const k = getVoteKey((r as any).vote ?? (r as any).position ?? null);
      if (k === "pour") map[g].pour.push(r);
      else if (k === "contre") map[g].contre.push(r);
      else if (k === "abst") map[g].abst.push(r);
      else map[g].nv.push(r);
    }

    return Object.values(map).sort((a, b) => {
      const ta = a.pour.length + a.contre.length + a.abst.length + a.nv.length;
      const tb = b.pour.length + b.contre.length + b.abst.length + b.nv.length;
      if (tb !== ta) return tb - ta;
      return a.groupe.localeCompare(b.groupe, "fr");
    });
  }, [rows]);

  const totals = useMemo(() => {
    let pour = 0, contre = 0, abst = 0, nv = 0;
    grouped.forEach((g) => {
      pour += g.pour.length;
      contre += g.contre.length;
      abst += g.abst.length;
      nv += g.nv.length;
    });
    return { pour, contre, abst, nv, total: pour + contre + abst + nv };
  }, [grouped]);

  const opened = useMemo(
    () => grouped.find((g) => g.groupe === openGroup) ?? null,
    [grouped, openGroup]
  );

  const filteredLists = useMemo(() => {
    if (!opened) return null;

    let all = [
      ...opened.pour.map((v) => ({ k: "pour" as VoteKey, v })),
      ...opened.contre.map((v) => ({ k: "contre" as VoteKey, v })),
      ...opened.abst.map((v) => ({ k: "abst" as VoteKey, v })),
      ...opened.nv.map((v) => ({ k: "nv" as VoteKey, v })),
    ];

    if (filter !== "all") all = all.filter((x) => x.k === filter);

    const q = query.trim().toLowerCase();
    if (q) {
      all = all.filter(({ v }) => fullNameFromRow(v).toLowerCase().includes(q));
    }

    return all;
  }, [opened, filter, query]);

  const toggleGroup = async (name: string) => {
    const willOpen = openGroup !== name;

    // ✅ reset seulement quand on ouvre via tap normal
    if (willOpen) {
      setFilter("all");
      setQuery("");
    }

    setOpenGroup(willOpen ? name : null);

    try {
      await Haptics.selectionAsync();
    } catch {}
  };

  // ✅ tap pill => ouvre groupe + filtre direct (re-tap => all)
  const openGroupWithFilter = async (groupName: string, k: VoteKey) => {
    const isSameGroup = openGroup === groupName;
    const isSameFilter = filter === k;

    if (!isSameGroup) {
      setOpenGroup(groupName);
      setFilter(k);
      setQuery("");
    } else {
      setFilter(isSameFilter ? "all" : k);
    }

    try {
      await Haptics.selectionAsync();
    } catch {}
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Chargement des groupes…</Text>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Retour</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backCircle}>
          <Text style={styles.backCircleIcon}>←</Text>
        </Pressable>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            Détail par groupe
          </Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            Scrutin n°{scrutinNumero}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Synthèse</Text>

          <View style={styles.recapRow}>
            <View style={styles.recapItem}>
              <Text style={styles.recapLabel}>Pour</Text>
              <Text style={styles.recapValue}>{totals.pour}</Text>
            </View>
            <View style={styles.recapItem}>
              <Text style={styles.recapLabel}>Contre</Text>
              <Text style={styles.recapValue}>{totals.contre}</Text>
            </View>
            <View style={styles.recapItem}>
              <Text style={styles.recapLabel}>Abst.</Text>
              <Text style={styles.recapValue}>{totals.abst}</Text>
            </View>
            <View style={styles.recapItem}>
              <Text style={styles.recapLabel}>NV</Text>
              <Text style={styles.recapValue}>{totals.nv}</Text>
            </View>
          </View>

          <Text style={styles.muted}>
            {grouped.length} groupe(s) — {totals.total} député(s) listé(s)
          </Text>
        </View>

        {grouped.map((g) => {
          const total = g.pour.length + g.contre.length + g.abst.length + g.nv.length;
          const isOpen = openGroup === g.groupe;
          const trend = getGroupTrend(g);
          const badge = getNarrativeBadge(g);
          const pct = trend.total > 0 ? Math.round((trend.count / trend.total) * 100) : 0;

          return (
            <View key={g.groupe} style={styles.card}>
              <Pressable
                onPress={() => toggleGroup(g.groupe)}
                style={({ pressed }) => [styles.groupHeader, pressed && { opacity: 0.92 }]}
              >
                <View style={styles.groupTopRow}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.groupTitle} numberOfLines={1}>
                      {g.groupe}
                    </Text>

                    <View style={styles.groupMetaRow}>
                      <Text style={styles.groupSub} numberOfLines={1}>
                        {total} député(s)
                      </Text>

                      <View style={styles.dot} />

                      <Pressable
                        onPress={() => openGroupWithFilter(g.groupe, trend.key)}
                        style={({ pressed }) => pressed && { opacity: 0.9 }}
                        hitSlop={8}
                      >
                        <Text style={styles.groupSub} numberOfLines={1}>
                          Tendance :{" "}
                          <Text style={styles.trendStrong}>
                            {voteLabel(trend.key)} ({pct}%)
                          </Text>
                        </Text>
                      </Pressable>

                      <View
                        style={[
                          styles.badge,
                          badge.tone === "success" && styles.badgeSuccess,
                          badge.tone === "warning" && styles.badgeWarning,
                        ]}
                      >
                        <Text style={styles.badgeText}>{badge.label}</Text>
                      </View>
                    </View>
                  </View>

                  <Chevron open={isOpen} />
                </View>

                {/* pills cliquables */}
                <View style={styles.groupCountsRow}>
                  <Pressable
                    onPress={() => openGroupWithFilter(g.groupe, "pour")}
                    style={({ pressed }) => [styles.countPair, pressed && { opacity: 0.9 }]}
                    hitSlop={8}
                  >
                    <VotePill k="pour" />
                    <Text style={styles.countText}>{g.pour.length}</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => openGroupWithFilter(g.groupe, "contre")}
                    style={({ pressed }) => [styles.countPair, pressed && { opacity: 0.9 }]}
                    hitSlop={8}
                  >
                    <VotePill k="contre" />
                    <Text style={styles.countText}>{g.contre.length}</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => openGroupWithFilter(g.groupe, "abst")}
                    style={({ pressed }) => [styles.countPair, pressed && { opacity: 0.9 }]}
                    hitSlop={8}
                  >
                    <VotePill k="abst" />
                    <Text style={styles.countText}>{g.abst.length}</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => openGroupWithFilter(g.groupe, "nv")}
                    style={({ pressed }) => [styles.countPair, pressed && { opacity: 0.9 }]}
                    hitSlop={8}
                  >
                    <VotePill k="nv" />
                    <Text style={styles.countText}>{g.nv.length}</Text>
                  </Pressable>
                </View>

                <GroupStackBar
                  pour={g.pour.length}
                  contre={g.contre.length}
                  abst={g.abst.length}
                  nv={g.nv.length}
                />
              </Pressable>

              {/* ✅ search uniquement si groupe ouvert */}
              {isOpen && (
                <>
                  <View style={styles.searchWrap}>
                    <TextInput
                      value={query}
                      onChangeText={setQuery}
                      placeholder="Rechercher un député…"
                      placeholderTextColor={SUBTEXT}
                      style={styles.searchInput}
                      autoCorrect={false}
                      autoCapitalize="none"
                      clearButtonMode="while-editing"
                    />
                  </View>

                  <Animated.View
                    style={{
                      marginTop: 6,
                      gap: 10,
                      opacity: openAnim,
                      transform: [
                        {
                          translateY: openAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [-6, 0],
                          }),
                        },
                      ],
                    }}
                  >
                    <View style={styles.filtersRow}>
                      <FilterChip label="Tout" active={filter === "all"} onPress={() => setFilter("all")} />
                      <FilterChip label="Pour" active={filter === "pour"} onPress={() => setFilter("pour")} />
                      <FilterChip label="Contre" active={filter === "contre"} onPress={() => setFilter("contre")} />
                      <FilterChip label="Abst." active={filter === "abst"} onPress={() => setFilter("abst")} />
                      <FilterChip label="NV" active={filter === "nv"} onPress={() => setFilter("nv")} />
                    </View>

                    <View style={styles.bucketBlock}>
                      <Text style={styles.bucketTitle}>
                        {filter === "all" ? "Députés" : `Députés · ${voteLabel(filter as VoteKey)}`} ·{" "}
                        {filteredLists?.length ?? 0}
                      </Text>

                      <View style={{ marginTop: 10, gap: 8 }}>
                        {(filteredLists ?? []).map(({ k, v }, idx) => {
                          const depId = getDeputeId(v);
                          const name = fullNameFromRow(v);
                          const initial = name?.trim()?.length ? name.trim().charAt(0).toUpperCase() : "?";
                          const isKey = idx < 5;

                          return (
                            <StaggerItem key={`${k}-${depId ?? "unknown"}-${idx}`} index={idx}>
                              <Pressable
                                disabled={!depId}
                                onPress={async () => {
                                  if (!depId) return;
                                  try {
                                    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                  } catch {}
                                  router.push(`/deputes/${encodeURIComponent(String(depId))}`);
                                }}
                                style={({ pressed }) => [
                                  styles.voteRow,
                                  isKey && styles.keyRow,
                                  pressed && depId && { opacity: 0.92 },
                                ]}
                              >
                                <View style={styles.voteLeft}>
                                  {(v as any).photo_url ? (
                                    <Image source={{ uri: (v as any).photo_url }} style={styles.avatar} />
                                  ) : (
                                    <View style={styles.avatarFallback}>
                                      <Text style={styles.avatarInitial}>{initial}</Text>
                                    </View>
                                  )}

                                  <View style={{ flex: 1, minWidth: 0 }}>
                                    <Text style={styles.voteName} numberOfLines={1}>
                                      {name}
                                    </Text>

                                    {isKey && (
                                      <View style={styles.keyTag}>
                                        <Text style={styles.keyTagText}>Député clé</Text>
                                      </View>
                                    )}

                                    <Text style={styles.voteSub} numberOfLines={1}>
                                      {depId ? "Voir la fiche →" : "Fiche indisponible"}
                                    </Text>
                                  </View>
                                </View>

                                <VotePill k={k} />
                              </Pressable>
                            </StaggerItem>
                          );
                        })}
                      </View>
                    </View>
                  </Animated.View>
                </>
              )}
            </View>
          );
        })}

        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------- Styles ----------------
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },

  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  loadingText: { marginTop: 8, color: SUBTEXT },
  errorText: { color: colors.danger || "red", textAlign: "center", marginBottom: 12 },

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
  backCircle: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: "rgba(15,23,42,0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
  backCircleIcon: { color: "#fff", fontSize: 18, fontWeight: "700" },

  headerTitle: { color: TEXT, fontSize: 16, fontWeight: "900" },
  headerSubtitle: { marginTop: 2, color: SUBTEXT, fontSize: 12, fontWeight: "700" },

  content: { padding: 16, paddingBottom: 30 },

  card: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    marginBottom: 12,
  },

  sectionTitle: { color: TEXT, fontSize: 14, fontWeight: "900" },
  muted: { marginTop: 8, color: SUBTEXT, fontSize: 12, fontWeight: "600" },

  recapRow: { marginTop: 12, flexDirection: "row", gap: 10 },
  recapItem: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: colors.surface || "#020617",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  recapLabel: { color: SUBTEXT, fontSize: 11, fontWeight: "800" },
  recapValue: { marginTop: 6, color: TEXT, fontSize: 18, fontWeight: "900" },

  groupHeader: { gap: 10 },
  groupTopRow: { flexDirection: "row", alignItems: "center", gap: 10 },

  groupTitle: { color: TEXT, fontSize: 14, fontWeight: "900" },

  groupMetaRow: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  groupSub: { color: SUBTEXT, fontSize: 12, fontWeight: "700" },
  trendStrong: { color: TEXT, fontWeight: "900" },

  chev: { color: SUBTEXT, fontSize: 14, fontWeight: "900" },

  groupCountsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },

  countPair: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 999,
  },

  countText: { color: TEXT, fontSize: 12, fontWeight: "900", opacity: 0.95 },

  // stacked bar
  stackWrap: {
    marginTop: 10,
    height: 8,
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 999,
    overflow: "hidden",
  },
  stackSeg: { height: "100%", justifyContent: "center" },
  stackDivider: {
    position: "absolute",
    right: 0,
    top: 1,
    bottom: 1,
    width: 1,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  stackPour: { backgroundColor: "rgba(34,197,94,0.85)" },
  stackContre: { backgroundColor: "rgba(239,68,68,0.85)" },
  stackAbst: { backgroundColor: "rgba(234,179,8,0.85)" },
  stackNv: { backgroundColor: "rgba(148,163,184,0.75)" },

  // search + filters
  searchWrap: { marginTop: 12, marginBottom: 6 },
  searchInput: {
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
  filterChipText: { color: SUBTEXT, fontSize: 12, fontWeight: "900" },
  filterChipTextActive: { color: TEXT },

  bucketBlock: {
    borderRadius: 16,
    padding: 12,
    backgroundColor: colors.surface || "#020617",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  bucketTitle: { color: TEXT, fontSize: 12, fontWeight: "900", opacity: 0.95 },

  voteRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  voteLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, marginRight: 10 },
  voteName: { color: TEXT, fontSize: 13, fontWeight: "900" },
  voteSub: { marginTop: 3, color: SUBTEXT, fontSize: 11, fontWeight: "700" },

  avatar: { width: 32, height: 32, borderRadius: 16 },
  avatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { color: TEXT, fontSize: 13, fontWeight: "900" },

  votePill: {
    minWidth: 56,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
  },
  votePillText: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.2,
    color: TEXT,
    opacity: 0.95,
  },
  votePillPour: { backgroundColor: "rgba(34,197,94,0.12)", borderColor: "rgba(34,197,94,0.25)" },
  votePillContre: { backgroundColor: "rgba(239,68,68,0.10)", borderColor: "rgba(239,68,68,0.22)" },
  votePillAbst: { backgroundColor: "rgba(234,179,8,0.12)", borderColor: "rgba(234,179,8,0.24)" },
  votePillNv: { backgroundColor: "rgba(148,163,184,0.10)", borderColor: "rgba(148,163,184,0.18)" },

  backBtn: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.card,
  },
  backText: { color: TEXT, fontWeight: "700" },

  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  badgeSuccess: {
    backgroundColor: "rgba(34,197,94,0.15)",
    borderColor: "rgba(34,197,94,0.35)",
  },
  badgeWarning: {
    backgroundColor: "rgba(234,179,8,0.15)",
    borderColor: "rgba(234,179,8,0.35)",
  },
  badgeText: { color: TEXT, fontSize: 11, fontWeight: "900" },

  keyRow: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.18)",
  },
  keyTag: {
    marginTop: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(34,197,94,0.14)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.25)",
  },
  keyTagText: { color: TEXT, fontSize: 10, fontWeight: "900", letterSpacing: 0.2 },
});
