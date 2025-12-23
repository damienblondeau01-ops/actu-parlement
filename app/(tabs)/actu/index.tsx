// app/(tabs)/actu/index.tsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

import { theme } from "../../../lib/theme";
import { fetchActuItems, type ActuItem as ActuItemDB } from "@/lib/queries/actu";
import { groupActuItems, type GroupedActuRow } from "@/lib/actu/grouping";

const colors = theme.colors;

type Tone = "blue" | "pink" | "mint" | "amber" | "violet";

type ActuItemUI = {
  id: string;
  dateISO: string; // ISO (garanti)
  title: string;
  subtitle: string;
  tone: Tone;
  iconLib: "ion" | "mci";
  iconName: string;
  tag?: string;

  groupKey?: string;
  groupCount?: number;
};

function toISO(input?: string | null): string {
  if (!input) return new Date().toISOString();
  const t = new Date(input).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : new Date().toISOString();
}

function fmtDateFR(d: string) {
  try {
    return new Date(d).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return d;
  }
}

function daysAgo(dateISO: string) {
  const t = new Date(dateISO).getTime();
  if (!Number.isFinite(t)) return 9999;
  const now = Date.now();
  return Math.floor((now - t) / (1000 * 60 * 60 * 24));
}

function bucketLabel(dateISO: string) {
  const d = daysAgo(dateISO);
  if (d <= 1) return "AUJOURD’HUI";
  if (d <= 7) return "CETTE SEMAINE";
  return "PLUS TÔT";
}

function gradientForTone(tone: Tone) {
  switch (tone) {
    case "pink":
      return [
        "rgba(244,114,182,0.32)",
        "rgba(251,113,133,0.16)",
        "rgba(2,6,23,0.00)",
      ] as const;
    case "mint":
      return [
        "rgba(52,211,153,0.28)",
        "rgba(34,197,94,0.12)",
        "rgba(2,6,23,0.00)",
      ] as const;
    case "amber":
      return [
        "rgba(251,191,36,0.30)",
        "rgba(250,204,21,0.14)",
        "rgba(2,6,23,0.00)",
      ] as const;
    case "violet":
      return [
        "rgba(167,139,250,0.32)",
        "rgba(99,102,241,0.18)",
        "rgba(2,6,23,0.00)",
      ] as const;
    case "blue":
    default:
      return [
        "rgba(59,130,246,0.30)",
        "rgba(14,165,233,0.14)",
        "rgba(2,6,23,0.00)",
      ] as const;
  }
}

function accentForTone(tone: Tone) {
  switch (tone) {
    case "pink":
      return "rgba(244,114,182,0.95)";
    case "mint":
      return "rgba(52,211,153,0.95)";
    case "amber":
      return "rgba(251,191,36,0.98)";
    case "violet":
      return "rgba(167,139,250,0.95)";
    case "blue":
    default:
      return "rgba(59,130,246,0.95)";
  }
}

function Icon({
  lib,
  name,
  size = 18,
  color = colors.text,
}: {
  lib: "ion" | "mci";
  name: string;
  size?: number;
  color?: string;
}) {
  if (lib === "mci") {
    return <MaterialCommunityIcons name={name as any} size={size} color={color} />;
  }
  return <Ionicons name={name as any} size={size} color={color} />;
}

type Row =
  | { kind: "hero"; item: ActuItemUI }
  | { kind: "header"; title: string }
  | { kind: "item"; item: ActuItemUI };

function pickTone(it: ActuItemDB): Tone {
  if (it.entity === "scrutin") return "violet";
  if (it.entity === "loi") return "blue";
  if (it.entity === "amendement") return "mint";
  if (it.entity === "motion") return "pink";
  if (it.entity === "declaration") return "amber";
  return "blue";
}

function pickIcon(it: ActuItemDB): { iconLib: "ion" | "mci"; iconName: string } {
  if (it.entity === "scrutin") return { iconLib: "mci", iconName: "gavel" };
  if (it.entity === "loi") return { iconLib: "ion", iconName: "document-text-outline" };
  if (it.entity === "amendement")
    return { iconLib: "mci", iconName: "file-document-edit-outline" };
  if (it.entity === "motion")
    return { iconLib: "mci", iconName: "alert-decagram-outline" };
  if (it.entity === "declaration") return { iconLib: "mci", iconName: "bullhorn-outline" };
  return { iconLib: "ion", iconName: "sparkles" };
}

function pickTag(it: ActuItemDB): string | undefined {
  if ((it as any).tag) return String((it as any).tag);

  if (it.entity === "scrutin") return "Vote";
  if (it.entity === "loi") return "Loi";
  if (it.entity === "amendement") return "Amendement";
  if (it.entity === "motion") return "Événement";
  if (it.entity === "declaration") return "Déclaration";
  return undefined;
}

function mapDBToUI(it: ActuItemDB): ActuItemUI {
  const { iconLib, iconName } = pickIcon(it);
  return {
    id: it.id,
    dateISO: toISO(it.date),
    title: (it as any).title ?? (it as any).titre ?? "Activité parlementaire",
    subtitle:
      (it as any).subtitle ||
      (it as any).tldr ||
      "À lire en clair : ce qui change, et pourquoi ça compte.",
    tone: pickTone(it),
    iconLib,
    iconName,
    tag: pickTag(it),
  };
}

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionLine} />
    </View>
  );
}

function HeroCard({ item, onPress }: { item: ActuItemUI; onPress: () => void }) {
  const grad = gradientForTone(item.tone);
  const accent = accentForTone(item.tone);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.heroWrap, pressed && { opacity: 0.95 }]}
    >
      <LinearGradient
        colors={grad as any}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroBg}
      />
      <View style={[styles.heroGlow, { shadowColor: accent }]} />

      <View style={styles.heroTopRow}>
        <View style={[styles.heroIconChip, { borderColor: accent }]}>
          <Icon lib={item.iconLib} name={item.iconName} size={18} color={accent} />
        </View>

        <View style={styles.heroMetaRow}>
          {item.tag ? (
            <View style={styles.heroTagPill}>
              <Text style={styles.heroTagText}>{item.tag}</Text>
            </View>
          ) : null}

          <View style={styles.heroDatePill}>
            <Text style={styles.heroDateText}>{fmtDateFR(item.dateISO)}</Text>
          </View>
        </View>
      </View>

      <Text style={styles.heroTitle} numberOfLines={3}>
        {item.title}
      </Text>
      <Text style={styles.heroSubtitle} numberOfLines={3}>
        {item.subtitle}
      </Text>

      <View style={styles.heroBottomRow}>
        <View style={[styles.accentDot, { backgroundColor: accent }]} />
        <Text style={styles.heroCta}>Comprendre maintenant</Text>
        <Text style={styles.heroArrow}>→</Text>
      </View>
    </Pressable>
  );
}

/**
 * ✅ Mapping group -> UI
 * - toujours préférer row.display.* (éditorial)
 * - id stable = groupKey
 */
function mapGroupToUI(row: GroupedActuRow): ActuItemUI {
  const items = row.items ?? [];
  const first = items[0];

  const base = first
    ? mapDBToUI(first as any)
    : mapDBToUI({
        id: row.groupKey,
        entity: row.entity,
        date: row.dateMax,
        title: row.display?.title ?? "Activité parlementaire",
        subtitle: row.display?.subtitle ?? "",
      } as any);

  const title = row.display?.title || base.title;
  const subtitle = row.display?.subtitle || base.subtitle;
  const tag = row.display?.tag || base.tag;

  return {
    ...base,
    id: row.groupKey,
    dateISO: toISO(row.dateMax),
    title,
    subtitle,
    tag,
    groupKey: row.groupKey,
    groupCount: items.length || row.summary?.total || 1,
  };
}

/** ===== Hero editorial (anti-bruit) ===== */

function isNoLoi(loi_id?: string | null) {
  return !loi_id || loi_id === "no-loi";
}

function isGenericTitle(t?: string | null) {
  if (!t) return true;
  const s = t.toLowerCase();
  return (
    s.includes("activité parlementaire") ||
    s.includes("sujet parlementaire") ||
    /\b\d+\s+scrutin/.test(s)
  );
}

function isNoiseGroup(g: GroupedActuRow) {
  const gg = g as any;
  const scr = gg.summary?.scrutins ?? 0;
  const loi_id: string | null | undefined = gg.loi_id ?? null;
  return isNoLoi(loi_id) && scr >= 12;
}

function pickHeroGroup(groups: GroupedActuRow[]) {
  if (!groups?.length) return null;

  const sorted = [...groups].sort((a, b) =>
    String((b as any).dateMax ?? "").localeCompare(String((a as any).dateMax ?? ""))
  );

  const candidates = sorted.filter((g) => !isNoiseGroup(g));

  // priorité: groupe lié à une loi (loi_id clair) récent (<=14j)
  const bestClearLoi = candidates.find((g) => !isNoLoi((g as any).loi_id ?? null));
  if (bestClearLoi) {
    const age = daysAgo(toISO((bestClearLoi as any).dateMax ?? null));
    if (age <= 14) return bestClearLoi;
  }

  // sinon: groupe non générique
  const bestNonGeneric = candidates.find((g) => {
    const t = (g as any).display?.title ?? null;
    return !isGenericTitle(t);
  });
  if (bestNonGeneric) return bestNonGeneric;

  return candidates[0] ?? sorted[0] ?? null;
}

/** ===== Navigation fallback (anti écran rouge) =====
 * Route deterministe si route.href manquant / faux
 */
function fallbackHrefFromItem(it: ActuItemDB): string | null {
  const id = String(it?.id ?? "");

  // ✅ scrutin -> fiche scrutin
  if (id.startsWith("scrutin-") || it?.entity === "scrutin") {
    return `/scrutins/${encodeURIComponent(id)}`;
  }

  // ✅ loi -> fiche loi (adapte si ta route loi n'est pas /lois/[id])
  if (it?.entity === "loi") {
    return `/lois/${encodeURIComponent(id)}`;
  }

  return null;
}

export default function ActuIndexScreen() {
  const router = useRouter();
  const [q, setQ] = useState("");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rawDB, setRawDB] = useState<ActuItemDB[]>([]);

  const load = useCallback(async () => {
    setError(null);
    const feed = await fetchActuItems();
    setRawDB((feed ?? []) as ActuItemDB[]);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        await load();
      } catch (e: any) {
        setError(e?.message ?? "Erreur inconnue");
      } finally {
        setLoading(false);
      }
    })();
  }, [load]);

  const onRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Erreur inconnue");
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const groupedRows = useMemo(() => groupActuItems(rawDB as any), [rawDB]);

  const itemById = useMemo(() => {
    const m = new Map<string, ActuItemDB>();
    for (const it of rawDB) m.set(it.id, it);
    return m;
  }, [rawDB]);

  const rawUI = useMemo(() => groupedRows.map(mapGroupToUI), [groupedRows]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rawUI;
    return rawUI.filter((x) =>
      (`${x.title} ${x.subtitle} ${x.tag ?? ""}`).toLowerCase().includes(s)
    );
  }, [q, rawUI]);

  const rows: Row[] = useMemo(() => {
    const heroGroup = pickHeroGroup(groupedRows);
    const heroUI = heroGroup ? mapGroupToUI(heroGroup) : null;

    const heroId = heroUI?.id;
    const baseList = heroId ? filtered.filter((x) => x.id !== heroId) : filtered;

    const sortedUI = [...baseList].sort((a, b) => b.dateISO.localeCompare(a.dateISO));

    const out: Row[] = [];
    if (heroUI) out.push({ kind: "hero", item: heroUI });

    let lastBucket = "";
    for (const it of sortedUI) {
      const b = bucketLabel(it.dateISO);
      if (b !== lastBucket) {
        out.push({ kind: "header", title: b });
        lastBucket = b;
      }
      out.push({ kind: "item", item: it });
    }
    return out;
  }, [filtered, groupedRows]);

  const openById = useCallback(
    (id: string) => {
      const db = rawDB.find((x) => x.id === id);
      if (!db) return;

      const href = (db as any)?.route?.href ?? fallbackHrefFromItem(db);
      if (href) router.push(href as any);
    },
    [rawDB, router]
  );

  const openGroup = useCallback(
    (ui: ActuItemUI) => {
      const key = ui.groupKey;

      if (!key) {
        openById(ui.id);
        return;
      }

      // si groupe 1 item -> ouvrir l'item
      if ((ui.groupCount ?? 0) <= 1) {
        const g = (groupedRows as any[]).find((x) => String(x.groupKey) === String(key));
        const only = g?.items?.[0];
        if (only?.id) {
          const db = itemById.get(only.id);
          const href = (db as any)?.route?.href ?? (db ? fallbackHrefFromItem(db) : null);
          if (href) {
            router.push(href as any);
            return;
          }
        }
      }

      // sinon -> écran groupe
      router.push(`/actu/group/${encodeURIComponent(key)}` as any);
    },
    [groupedRows, itemById, openById, router]
  );

  const renderRow = ({ item }: { item: Row }) => {
    if (item.kind === "hero") {
      return (
        <View style={{ marginBottom: 6 }}>
          <Text style={styles.heroLabel}>À LA UNE</Text>
          <HeroCard item={item.item} onPress={() => openGroup(item.item)} />
        </View>
      );
    }

    if (item.kind === "header") return <SectionHeader title={item.title} />;

    const it = item.item;
    const grad = gradientForTone(it.tone);
    const accent = accentForTone(it.tone);

    return (
      <Pressable
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.96 }]}
        onPress={() => openGroup(it)}
        android_ripple={{ color: "rgba(255,255,255,0.06)" }}
      >
        <LinearGradient
          colors={grad as any}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.cardBg}
        />
        <View style={[styles.accentBar, { backgroundColor: accent }]} />

        <View style={styles.topRow}>
          <View style={[styles.iconChip, { borderColor: accent }]}>
            <Icon lib={it.iconLib} name={it.iconName} size={18} color={accent} />
          </View>

          <View style={styles.metaRow}>
            {it.tag ? (
              <View style={styles.tagPill}>
                <Text style={styles.tagText} numberOfLines={1} ellipsizeMode="tail">
                  {it.tag}
                </Text>
              </View>
            ) : null}

            {(it.groupCount ?? 0) > 1 ? (
              <View style={styles.countPill}>
                <Text style={styles.countText}>+{it.groupCount}</Text>
              </View>
            ) : null}

            <View style={styles.datePill}>
              <Text style={styles.dateText}>{fmtDateFR(it.dateISO)}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.title} numberOfLines={2}>
          {it.title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={2}>
          {it.subtitle}
        </Text>

        <View style={styles.bottomRow}>
          <Text style={styles.bottomHint} numberOfLines={1} ellipsizeMode="tail">
            {(it.groupCount ?? 0) > 1 ? "Voir le détail" : "Comprendre"}
          </Text>
          <View style={styles.ctaRight}>
            <Text style={styles.ctaText}>→</Text>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View style={styles.hTitleRow}>
          <Text style={styles.h1}>Actu</Text>
          <View style={styles.hBadge}>
            <Ionicons name="pulse-outline" size={14} color={colors.text} />
            <Text style={styles.hBadgeText}>Temps réel</Text>
          </View>
        </View>

        <Text style={styles.h2}>Les moments qui comptent — en clair, en 10 secondes.</Text>

        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Rechercher dans l’actu…"
          placeholderTextColor={colors.subtext}
          style={styles.search}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      {loading ? (
        <View style={{ padding: 16, gap: 10 }}>
          <ActivityIndicator />
          <Text style={{ color: colors.subtext }}>Chargement de l’actu…</Text>
        </View>
      ) : error ? (
        <View style={{ padding: 16, gap: 8 }}>
          <Text style={{ color: colors.text, fontWeight: "900" }}>Impossible de charger l’actu</Text>
          <Text style={{ color: colors.subtext }}>{error}</Text>
          <Pressable onPress={onRefresh} style={{ marginTop: 8 }}>
            <Text style={{ color: colors.text, fontWeight: "900" }}>Réessayer →</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r, idx) =>
            r.kind === "header"
              ? `h-${r.title}-${idx}`
              : r.kind === "hero"
              ? `hero-${r.item.id}`
              : `i-${r.item.id}`
          }
          renderItem={renderRow}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />
          }
          ListEmptyComponent={
            <View style={{ padding: 16 }}>
              <Text style={{ color: colors.subtext }}>
                Aucun élément d’actu ne correspond à ta recherche.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },

  header: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 8,
  },

  hTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  h1: { color: colors.text, fontSize: 24, fontWeight: "900", letterSpacing: 0.2 },
  hBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  hBadgeText: { color: colors.text, fontSize: 12, fontWeight: "800" },
  h2: { color: colors.subtext, fontSize: 12, lineHeight: 16 },

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

  list: { paddingHorizontal: 16, paddingBottom: 24, paddingTop: 4 },

  sectionHeader: { paddingTop: 8, paddingBottom: 2, gap: 8 },
  sectionTitle: { color: colors.subtext, fontSize: 12, fontWeight: "900", letterSpacing: 1.2 },
  sectionLine: { height: 1, backgroundColor: "rgba(255,255,255,0.08)" },

  heroLabel: {
    color: colors.subtext,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.2,
    marginBottom: 8,
  },

  heroWrap: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
    backgroundColor: colors.card,
    padding: 14,
  },
  heroBg: { ...StyleSheet.absoluteFillObject },
  heroGlow: {
    position: "absolute",
    top: -10,
    right: -20,
    width: 140,
    height: 140,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    shadowOpacity: 0.55,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  heroTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroIconChip: {
    width: 38,
    height: 38,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroMetaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  heroTagPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  heroTagText: { color: colors.text, fontSize: 12, fontWeight: "900" },
  heroDatePill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  heroDateText: { color: colors.subtext, fontSize: 12, fontWeight: "800" },

  heroTitle: { marginTop: 12, color: colors.text, fontSize: 18, fontWeight: "900", lineHeight: 24 },
  heroSubtitle: { marginTop: 8, color: colors.subtext, fontSize: 13, lineHeight: 18, fontWeight: "700" },

  heroBottomRow: { marginTop: 14, flexDirection: "row", alignItems: "center", gap: 8 },
  heroCta: { color: colors.text, fontSize: 13, fontWeight: "900", flex: 1 },
  heroArrow: { color: colors.text, fontSize: 16, fontWeight: "900" },

  card: {
    position: "relative",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    overflow: "hidden",
    backgroundColor: colors.card,
    padding: 12,
    gap: 8,
  },
  cardBg: { ...StyleSheet.absoluteFillObject },

  accentBar: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4, opacity: 0.75 },

  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },

  iconChip: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },

  metaRow: { flexDirection: "row", alignItems: "center", gap: 8 },

  tagPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    maxWidth: 160,
  },
  tagText: { color: colors.text, fontSize: 12, fontWeight: "900" },

  countPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  countText: { color: colors.text, fontSize: 12, fontWeight: "900" },

  datePill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  dateText: { color: colors.subtext, fontSize: 12, fontWeight: "800" },

  title: { color: colors.text, fontSize: 15, fontWeight: "900", lineHeight: 20 },
  subtitle: { color: colors.subtext, fontSize: 12, lineHeight: 17, fontWeight: "700" },

  bottomRow: { marginTop: 2, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  bottomHint: { color: colors.text, fontSize: 12, fontWeight: "900", maxWidth: "75%" },

  accentDot: { width: 8, height: 8, borderRadius: 99 },

  ctaRight: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  ctaText: { color: colors.text, fontSize: 16, fontWeight: "900" },
});
