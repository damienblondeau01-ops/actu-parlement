// app/actu/group/[key].tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

import { theme } from "../../../lib/theme";
import { fetchActuFeed, type ActuItem as ActuItemDB } from "@/lib/queries/actu";
import { groupActuItems, type GroupedActuRow } from "@/lib/actu/grouping";

const colors = theme.colors;

type Tone = "blue" | "pink" | "mint" | "amber" | "violet";

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

function toISO(input?: string | null): string {
  if (!input) return new Date().toISOString();
  const t = new Date(input).getTime();
  return Number.isFinite(t)
    ? new Date(t).toISOString()
    : new Date().toISOString();
}

/** 🎨 couleurs “vraies” (plus visibles) */
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

function pickToneFromEntity(entity: string): Tone {
  if (entity === "scrutin") return "violet";
  if (entity === "loi") return "blue";
  if (entity === "amendement") return "mint";
  if (entity === "motion") return "pink";
  if (entity === "declaration") return "amber";
  return "blue";
}

function pickIconFromEntity(entity: string): {
  iconLib: "ion" | "mci";
  iconName: string;
} {
  if (entity === "scrutin") return { iconLib: "mci", iconName: "gavel" };
  if (entity === "loi")
    return { iconLib: "ion", iconName: "document-text-outline" };
  if (entity === "amendement")
    return { iconLib: "mci", iconName: "file-document-edit-outline" };
  if (entity === "motion")
    return { iconLib: "mci", iconName: "alert-decagram-outline" };
  if (entity === "declaration")
    return { iconLib: "mci", iconName: "bullhorn-outline" };
  return { iconLib: "ion", iconName: "sparkles" };
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
  if (lib === "mci")
    return (
      <MaterialCommunityIcons name={name as any} size={size} color={color} />
    );
  return <Ionicons name={name as any} size={size} color={color} />;
}

function safeDecode(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * 🔧 Fallback de navigation si route.href est absent
 * IMPORTANT: on ne "devine" pas les routes amendement/motion/declaration ici.
 * - scrutin => /scrutins/:id
 * - loi => /lois/:id (à adapter si ton routing diffère)
 * - sinon => null
 */
function fallbackHrefFromDb(it: ActuItemDB): string | null {
  const id = String((it as any)?.id ?? "");
  if (!id) return null;

  if (id.startsWith("scrutin-") || it.entity === "scrutin") {
    return `/scrutins/${encodeURIComponent(id)}`;
  }

  if (it.entity === "loi") {
    return `/lois/${encodeURIComponent(id)}`;
  }

  return null;
}

/**
 * ✅ Normalisation HARD des routes : empêche "scrutin -> /lois/..."
 * Règle: si id commence par scrutin- (ou entity scrutin), on force /scrutins/:id
 * Puis loi => /lois/:id
 * Sinon, on accepte route.href si présent, sinon fallback.
 */
function normalizeHref(it: ActuItemDB): string | null {
  const id = String((it as any)?.id ?? "");
  const rawHref = String((it as any)?.route?.href ?? "");

  if (!id) return null;

  // ✅ règle absolue
  if (id.startsWith("scrutin-") || it.entity === "scrutin") {
    return `/scrutins/${encodeURIComponent(id)}`;
  }

  if (it.entity === "loi") {
    return `/lois/${encodeURIComponent(id)}`;
  }

  if (rawHref) return rawHref;

  return fallbackHrefFromDb(it);
}

type ItemRow = {
  id: string;
  dateISO: string;
  title: string;
  subtitle: string;
  entity: string;
  href?: string | null;
  raw: ActuItemDB;
};

export default function ActuGroupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ key?: string }>();

  const encodedKey = typeof params.key === "string" ? params.key : "";
  const groupKey = useMemo(() => safeDecode(encodedKey), [encodedKey]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rawDB, setRawDB] = useState<ActuItemDB[]>([]);

  const load = useCallback(async () => {
    setError(null);
    const feed = await fetchActuFeed();
    setRawDB(feed ?? []);
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

  const grouped = useMemo(() => groupActuItems(rawDB as any), [rawDB]);

  const group: GroupedActuRow | null = useMemo(() => {
    if (!groupKey) return null;
    return grouped.find((g) => g.groupKey === groupKey) ?? null;
  }, [groupKey, grouped]);

  const tone: Tone = useMemo(
    () => pickToneFromEntity(group?.entity ?? "loi"),
    [group?.entity]
  );
  const grad = useMemo(() => gradientForTone(tone), [tone]);
  const accent = useMemo(() => accentForTone(tone), [tone]);
  const icon = useMemo(() => pickIconFromEntity(group?.entity ?? "loi"), [
    group?.entity,
  ]);

  const header = useMemo(() => {
    if (!group) return null;

    const date = group.dateMax ?? (group.items?.[0]?.date ?? "");
    const title = group.display?.title ?? "Détail";
    const tag = group.display?.tag ?? group.phase_label ?? undefined;

    const total = group.summary?.total ?? group.items?.length ?? 0;
    const amend = group.summary?.amendements ?? 0;
    const scr = group.summary?.scrutins ?? 0;
    const art = group.summary?.articles ?? 0;

    return {
      title,
      date,
      tag,
      total,
      amend,
      scr,
      art,
      subtitle:
        group.display?.subtitle ??
        (() => {
          const parts: string[] = [];
          if (scr) parts.push(`${scr} scrutin${scr > 1 ? "s" : ""}`);
          if (amend)
            parts.push(`${amend} amendement${amend > 1 ? "s" : ""}`);
          if (parts.length) return parts.join(" • ");
          return `${total} élément${total > 1 ? "s" : ""}`;
        })(),
    };
  }, [group]);

  const items: ItemRow[] = useMemo(() => {
    if (!group?.items?.length) return [];

    const mapped: ItemRow[] = group.items.map((it: any) => {
      const title = it.title ?? it.titre ?? "Élément parlementaire";
      const subtitle =
        it.subtitle ??
        it.tldr ??
        it.objet ??
        (it.entity === "amendement"
          ? "Amendement"
          : it.entity === "scrutin"
          ? "Scrutin"
          : it.entity === "loi"
          ? "Loi"
          : "Événement");

      // ✅ IMPORTANT: normalise pour éviter scrutin -> loi
      const href = normalizeHref(it as ActuItemDB);

      return {
        id: String(it.id),
        dateISO: toISO(String(it.date ?? "")),
        title: String(title),
        subtitle: String(subtitle),
        entity: String(it.entity ?? ""),
        href,
        raw: it as ActuItemDB,
      };
    });

    mapped.sort((a, b) => b.dateISO.localeCompare(a.dateISO));
    return mapped;
  }, [group]);

  // ✅ UX: si le groupe n'a qu'un item, on ouvre directement (sinon liste)
  useEffect(() => {
    if (!group) return;
    if ((group.items?.length ?? 0) !== 1) return;

    const only = group.items?.[0] as any as ActuItemDB | undefined;
    if (!only) return;

    // ✅ IMPORTANT: normalise aussi ici
    const href = normalizeHref(only);
    if (href) router.replace(href as any);
  }, [group, router]);

  const openHref = useCallback(
    (href?: string | null) => {
      if (!href) return;
      router.push(href as any);
    },
    [router]
  );

  const renderItem = ({ item }: { item: ItemRow }) => {
    const t = pickToneFromEntity(item.entity);
    const g = gradientForTone(t);
    const a = accentForTone(t);
    const ic = pickIconFromEntity(item.entity);

    const canOpen = !!item.href;

    return (
      <Pressable
        style={({ pressed }) => [
          styles.card,
          pressed && { opacity: 0.96 },
          !canOpen && { opacity: 0.72 },
        ]}
        onPress={() => openHref(item.href)}
        disabled={!canOpen}
        android_ripple={{ color: "rgba(255,255,255,0.06)" }}
      >
        <LinearGradient
          colors={g as any}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.cardBg}
        />
        <View style={[styles.accentBar, { backgroundColor: a }]} />

        <View style={styles.itemTopRow}>
          <View style={[styles.iconChip, { borderColor: a }]}>
            <Icon lib={ic.iconLib} name={ic.iconName} size={16} color={a} />
          </View>

          <View style={styles.metaRow}>
            <View style={styles.datePill}>
              <Text style={styles.dateText}>{fmtDateFR(item.dateISO)}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={2}>
          {item.subtitle}
        </Text>

        <View style={styles.bottomRow}>
          <Text style={styles.bottomHint} numberOfLines={1}>
            {canOpen ? "Ouvrir" : "Détail indisponible"}
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
      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={18} color={colors.text} />
          <Text style={styles.backText}>Retour</Text>
        </Pressable>

        <View style={styles.topRight}>
          <Pressable onPress={onRefresh} style={styles.refreshBtn}>
            <Ionicons name="refresh" size={16} color={colors.text} />
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={{ padding: 16, gap: 10 }}>
          <ActivityIndicator />
          <Text style={{ color: colors.subtext }}>Chargement du détail…</Text>
        </View>
      ) : error ? (
        <View style={{ padding: 16, gap: 8 }}>
          <Text style={{ color: colors.text, fontWeight: "900" }}>
            Impossible de charger
          </Text>
          <Text style={{ color: colors.subtext }}>{error}</Text>
          <Pressable onPress={onRefresh} style={{ marginTop: 8 }}>
            <Text style={{ color: colors.text, fontWeight: "900" }}>
              Réessayer →
            </Text>
          </Pressable>
        </View>
      ) : !group || !header ? (
        <View style={{ padding: 16, gap: 8 }}>
          <Text style={{ color: colors.text, fontWeight: "900" }}>
            Groupe introuvable
          </Text>
          <Text style={{ color: colors.subtext }}>
            Ce groupe n’existe plus (feed mis à jour) ou l’identifiant est
            invalide.
          </Text>
          <Pressable onPress={() => router.back()} style={{ marginTop: 8 }}>
            <Text style={{ color: colors.text, fontWeight: "900" }}>
              Retour →
            </Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => `it-${it.id}`}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.text}
            />
          }
          ListHeaderComponent={
            <View style={{ marginBottom: 10 }}>
              {/* Header card */}
              <View style={styles.heroWrap}>
                <LinearGradient
                  colors={grad as any}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.heroBg}
                />
                <View style={[styles.heroGlow, { shadowColor: accent }]} />

                <View style={styles.heroTopRow}>
                  <View style={[styles.heroIconChip, { borderColor: accent }]}>
                    <Icon
                      lib={icon.iconLib}
                      name={icon.iconName}
                      size={18}
                      color={accent}
                    />
                  </View>

                  <View style={styles.heroMetaRow}>
                    {header.tag ? (
                      <View style={styles.heroTagPill}>
                        <Text style={styles.heroTagText} numberOfLines={1}>
                          {header.tag}
                        </Text>
                      </View>
                    ) : null}

                    <View style={styles.heroDatePill}>
                      <Text style={styles.heroDateText}>
                        {fmtDateFR(header.date)}
                      </Text>
                    </View>
                  </View>
                </View>

                <Text style={styles.heroTitle} numberOfLines={3}>
                  {header.title}
                </Text>
                <Text style={styles.heroSubtitle} numberOfLines={3}>
                  {header.subtitle}
                </Text>

                <View style={styles.kpiRow}>
                  <View style={styles.kpiPill}>
                    <Text style={styles.kpiLabel}>Total</Text>
                    <Text style={styles.kpiValue}>{header.total}</Text>
                  </View>

                  {header.amend ? (
                    <View style={styles.kpiPill}>
                      <Text style={styles.kpiLabel}>Amend.</Text>
                      <Text style={styles.kpiValue}>{header.amend}</Text>
                    </View>
                  ) : null}

                  {header.scr ? (
                    <View style={styles.kpiPill}>
                      <Text style={styles.kpiLabel}>Scrut.</Text>
                      <Text style={styles.kpiValue}>{header.scr}</Text>
                    </View>
                  ) : null}

                  {header.art ? (
                    <View style={styles.kpiPill}>
                      <Text style={styles.kpiLabel}>Articles</Text>
                      <Text style={styles.kpiValue}>{header.art}</Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.heroBottomRow}>
                  <View
                    style={[styles.accentDot, { backgroundColor: accent }]}
                  />
                  <Text style={styles.heroCta}>Détail des éléments du groupe</Text>
                  <Text style={styles.heroArrow}>↓</Text>
                </View>
              </View>

              <View style={{ paddingHorizontal: 2, marginTop: 10 }}>
                <Text style={styles.sectionTitle}>ÉLÉMENTS DU GROUPE</Text>
                <View style={styles.sectionLine} />
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={{ padding: 16 }}>
              <Text style={{ color: colors.subtext }}>
                Aucun élément dans ce groupe.
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

  topBar: {
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  backText: { color: colors.text, fontSize: 12, fontWeight: "900" },

  topRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },

  list: { paddingHorizontal: 16, paddingBottom: 24, paddingTop: 6 },

  sectionTitle: {
    color: colors.subtext,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  sectionLine: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginTop: 8,
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
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
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
    maxWidth: 190,
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

  heroTitle: {
    marginTop: 12,
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 24,
  },
  heroSubtitle: {
    marginTop: 8,
    color: colors.subtext,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },

  kpiRow: { marginTop: 12, flexDirection: "row", gap: 8, flexWrap: "wrap" },
  kpiPill: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  kpiLabel: { color: colors.subtext, fontSize: 12, fontWeight: "900" },
  kpiValue: { color: colors.text, fontSize: 12, fontWeight: "900" },

  heroBottomRow: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
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

  accentBar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    opacity: 0.75,
  },

  itemTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
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

  bottomRow: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  bottomHint: { color: colors.text, fontSize: 12, fontWeight: "900" },

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
