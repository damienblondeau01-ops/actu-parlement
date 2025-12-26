// app/actu/item/[id].tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { theme } from "../../../lib/theme";
import { fetchActuFeed, type ActuItem as ActuItemDB } from "@/lib/queries/actu";
import { routeFromActuItemOrActuItemScreen, routeFromItemId } from "@/lib/routes";

const colors = theme.colors;

type Tone = "blue" | "pink" | "mint" | "amber" | "violet";

function cleanSpaces(s: any) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

function firstParam(v: string | string[] | undefined) {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

function safeDecode(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function toISO(input?: string | null): string {
  if (!input) return new Date().toISOString();
  const t = new Date(input).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : new Date().toISOString();
}

function fmtDateFR(d: string) {
  try {
    return new Date(d).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return d;
  }
}

function clamp(s: string, max = 220) {
  const t = cleanSpaces(s);
  if (!t) return "";
  if (t.length <= max) return t;
  return t.slice(0, max - 1).trimEnd() + "…";
}

function pickTone(entity: string): Tone {
  if (entity === "scrutin") return "violet";
  if (entity === "loi") return "blue";
  if (entity === "amendement") return "mint";
  if (entity === "motion") return "pink";
  if (entity === "declaration") return "amber";
  return "blue";
}

function gradientForTone(tone: Tone) {
  switch (tone) {
    case "pink":
      return ["rgba(244,114,182,0.32)", "rgba(251,113,133,0.16)", "rgba(2,6,23,0.00)"] as const;
    case "mint":
      return ["rgba(52,211,153,0.28)", "rgba(34,197,94,0.12)", "rgba(2,6,23,0.00)"] as const;
    case "amber":
      return ["rgba(251,191,36,0.30)", "rgba(250,204,21,0.14)", "rgba(2,6,23,0.00)"] as const;
    case "violet":
      return ["rgba(167,139,250,0.32)", "rgba(99,102,241,0.18)", "rgba(2,6,23,0.00)"] as const;
    case "blue":
    default:
      return ["rgba(59,130,246,0.30)", "rgba(14,165,233,0.14)", "rgba(2,6,23,0.00)"] as const;
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

function pickIcon(entity: string): { lib: "ion" | "mci"; name: string } {
  if (entity === "scrutin") return { lib: "mci", name: "gavel" };
  if (entity === "loi") return { lib: "ion", name: "document-text-outline" };
  if (entity === "amendement") return { lib: "mci", name: "file-document-edit-outline" };
  if (entity === "motion") return { lib: "mci", name: "alert-decagram-outline" };
  if (entity === "declaration") return { lib: "mci", name: "bullhorn-outline" };
  return { lib: "ion", name: "sparkles" };
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
  if (lib === "mci") return <MaterialCommunityIcons name={name as any} size={size} color={color} />;
  return <Ionicons name={name as any} size={size} color={color} />;
}

function Field({ label, value }: { label: string; value?: string | null }) {
  const v = cleanSpaces(value);
  if (!v) return null;
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{v}</Text>
    </View>
  );
}

function kindLabel(entity: string) {
  if (entity === "scrutin") return "Vote";
  if (entity === "amendement") return "Amendement";
  if (entity === "loi") return "Loi";
  if (entity === "motion") return "Événement";
  if (entity === "declaration") return "Déclaration";
  return "Élément";
}

/** ✅ breadcrumb visuel */
function Journey({
  accent,
  onGoActu,
  onGoGroup,
  canGoGroup,
  debugFromKey,
}: {
  accent: string;
  onGoActu: () => void;
  onGoGroup: () => void;
  canGoGroup: boolean;
  debugFromKey: string;
}) {
  return (
    <View style={styles.journeyWrap}>
      <View style={[styles.journeyDot, { backgroundColor: accent }]} />
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={styles.journeyTitle}>PARCOURS</Text>
        <Text style={styles.journeyDebug}>fromKey: {debugFromKey || "(none)"}</Text>
      </View>

      <View style={{ height: 10 }} />

      <View style={styles.journeyRow}>
        <Pressable onPress={onGoActu} style={styles.journeyChip}>
          <Ionicons name="newspaper-outline" size={14} color={colors.text} />
          <Text style={styles.journeyChipText}>Actu</Text>
        </Pressable>

        <Text style={styles.journeySep}>›</Text>

        <Pressable
          onPress={onGoGroup}
          style={[styles.journeyChip, !canGoGroup && { opacity: 0.5 }]}
          disabled={!canGoGroup}
        >
          <Ionicons name="sparkles-outline" size={14} color={colors.text} />
          <Text style={styles.journeyChipText}>Récit</Text>
        </Pressable>

        <Text style={styles.journeySep}>›</Text>

        <View style={[styles.journeyChip, { borderColor: "rgba(255,255,255,0.18)" }]}>
          <Ionicons name="information-circle-outline" size={14} color={colors.text} />
          <Text style={styles.journeyChipText}>Détail</Text>
        </View>
      </View>

      <Text style={styles.journeyHint}>
        Tu es sur un <Text style={{ fontWeight: "900" }}>détail d’info</Text> : résumé + texte officiel + métadonnées.
      </Text>
    </View>
  );
}

export default function ActuItemScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const id = useMemo(() => cleanSpaces(firstParam((params as any)?.id)), [params]);
  const fromKeyRaw = useMemo(() => cleanSpaces(firstParam((params as any)?.fromKey)), [params]);
  const fromKey = useMemo(() => (fromKeyRaw ? safeDecode(fromKeyRaw) : ""), [fromKeyRaw]);

  const canGoGroup = !!fromKey;

  const [loading, setLoading] = useState(true);
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

  const item = useMemo(() => {
    if (!id) return null;
    return rawDB.find((x) => String(x.id) === String(id)) ?? null;
  }, [id, rawDB]);

  const entity = cleanSpaces((item as any)?.entity) || "unknown";
  const tone = pickTone(entity);
  const accent = accentForTone(tone);
  const grad = gradientForTone(tone);
  const icon = pickIcon(entity);

  const dateISO = toISO((item as any)?.date ?? null);

  const phase = cleanSpaces((item as any)?.phase_label);
  const articleRef = cleanSpaces((item as any)?.article_ref);

  const title = useMemo(() => {
    const t = cleanSpaces((item as any)?.title ?? (item as any)?.titre ?? (item as any)?.objet);
    return t || "Détail de l’élément";
  }, [item]);

  const subtitle = cleanSpaces((item as any)?.subtitle);
  const tldr = cleanSpaces((item as any)?.tldr);

  const official =
    cleanSpaces((item as any)?.objet) ||
    cleanSpaces((item as any)?.titre) ||
    cleanSpaces((item as any)?.subtitle) ||
    "";

  const hrefRichFromId = useMemo(() => {
    if (!item) return null;
    return routeFromItemId(String(item.id));
  }, [item]);

  const hrefLoi = useMemo(() => {
    if (!item) return null;
    const loiId = cleanSpaces((item as any)?.loi_id);
    if (!loiId) return null;
    return routeFromItemId(loiId);
  }, [item]);

  const hrefBest = useMemo(() => {
    if (!item) return null;
    return routeFromActuItemOrActuItemScreen({
      id: String(item.id),
      entity: String((item as any)?.entity ?? ""),
      loi_id: (item as any)?.loi_id ?? null,
    });
  }, [item]);

  const openHref = useCallback(
    (href?: string | null) => {
      const h = cleanSpaces(href);
      if (!h) return;
      router.push(h as any);
    },
    [router]
  );

  const openGroup = useCallback(() => {
    if (!fromKey) return;
    // ✅ replace pour éviter les piles infinies
    router.replace(`/actu/group/${encodeURIComponent(fromKey)}` as any);
  }, [router, fromKey]);

  const openActu = useCallback(() => {
    router.push("/(tabs)/actu" as any);
  }, [router]);

  const whatWeKnow = useMemo(() => {
    if (tldr) return tldr;
    if (subtitle) return clamp(subtitle, 240);
    if (official) return clamp(official, 240);
    return "";
  }, [tldr, subtitle, official]);

  const showPrimary = !!hrefBest && !cleanSpaces(hrefBest).startsWith("/actu/item/");

  const canOpenScrutin = entity === "scrutin" && !!hrefRichFromId;
  const canOpenLoi = !!hrefLoi;

  const goBackSmart = useCallback(() => {
    if (canGoGroup) return openGroup();
    return router.back();
  }, [canGoGroup, openGroup, router]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.topBar}>
        <Pressable onPress={goBackSmart} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={18} color={colors.text} />
          <Text style={styles.backText}>{canGoGroup ? "Revenir au récit" : "Retour"}</Text>
        </Pressable>

        <View style={styles.topRight}>
          <Pressable onPress={load} style={styles.refreshBtn}>
            <Ionicons name="refresh" size={16} color={colors.text} />
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={{ padding: 16, gap: 10 }}>
          <ActivityIndicator />
          <Text style={{ color: colors.subtext }}>Chargement…</Text>
        </View>
      ) : error ? (
        <View style={{ padding: 16, gap: 8 }}>
          <Text style={{ color: colors.text, fontWeight: "900" }}>Impossible de charger</Text>
          <Text style={{ color: colors.subtext }}>{error}</Text>
          <Pressable onPress={load} style={{ marginTop: 8 }}>
            <Text style={{ color: colors.text, fontWeight: "900" }}>Réessayer →</Text>
          </Pressable>
        </View>
      ) : !item ? (
        <View style={{ padding: 16, gap: 8 }}>
          <Text style={{ color: colors.text, fontWeight: "900" }}>Élément introuvable</Text>
          <Text style={{ color: colors.subtext }}>Le feed a changé ou l’identifiant est invalide.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {canGoGroup ? (
            <Journey
              accent={accent}
              onGoActu={openActu}
              canGoGroup={canGoGroup}
              onGoGroup={openGroup}
              debugFromKey={fromKey}
            />
          ) : null}

          <View style={styles.heroWrap}>
            <LinearGradient colors={grad as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroBg} />
            <View style={[styles.heroGlow, { shadowColor: accent }]} />

            <View style={styles.heroTopRow}>
              <View style={[styles.heroIconChip, { borderColor: accent }]}>
                <Icon lib={icon.lib} name={icon.name} size={18} color={accent} />
              </View>

              <View style={styles.heroMetaRow}>
                <View style={styles.pill}>
                  <Text style={styles.pillText}>{fmtDateFR(dateISO)}</Text>
                </View>
                <View style={styles.pill}>
                  <Text style={styles.pillText}>{kindLabel(entity)}</Text>
                </View>
                {phase ? (
                  <View style={styles.pill}>
                    <Text style={styles.pillText} numberOfLines={1}>
                      {phase}
                    </Text>
                  </View>
                ) : null}
                {articleRef ? (
                  <View style={styles.pill}>
                    <Text style={styles.pillText} numberOfLines={1}>
                      Article {articleRef}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            <Text style={styles.heroTitle}>{title}</Text>
            {subtitle ? <Text style={styles.heroSubtitle}>{subtitle}</Text> : null}

            {showPrimary ? (
              <Pressable onPress={() => openHref(hrefBest)} style={styles.primaryBtn}>
                <Text style={styles.primaryBtnText}>Ouvrir l’écran complet</Text>
                <Text style={styles.primaryBtnText}> →</Text>
              </Pressable>
            ) : null}
          </View>

          {whatWeKnow ? (
            <View style={styles.block}>
              <Text style={styles.blockTitle}>En clair</Text>
              <Text style={styles.blockText}>{whatWeKnow}</Text>
            </View>
          ) : null}

          <View style={styles.block}>
            <Text style={styles.blockTitle}>Aller plus loin</Text>

            <View style={{ gap: 10, marginTop: 8 }}>
              {canOpenLoi ? (
                <Pressable onPress={() => openHref(hrefLoi)} style={styles.rowBtn}>
                  <Ionicons name="document-text-outline" size={16} color={colors.text} />
                  <Text style={styles.rowBtnText}>Voir la loi</Text>
                  <View style={{ flex: 1 }} />
                  <Text style={styles.rowBtnArrow}>→</Text>
                </Pressable>
              ) : null}

              {canOpenScrutin ? (
                <Pressable onPress={() => openHref(hrefRichFromId)} style={styles.rowBtn}>
                  <MaterialCommunityIcons name="gavel" size={16} color={colors.text} />
                  <Text style={styles.rowBtnText}>Voir le scrutin</Text>
                  <View style={{ flex: 1 }} />
                  <Text style={styles.rowBtnArrow}>→</Text>
                </Pressable>
              ) : null}

              {!canOpenLoi && !canOpenScrutin ? (
                <Text style={styles.muted}>
                  Cet élément n’a pas encore d’écran dédié.
                  {"\n"}Mais tu as ici tout ce qui est disponible : résumé, texte officiel, métadonnées.
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.block}>
            <Text style={styles.blockTitle}>Texte officiel</Text>
            {official ? (
              <Text style={styles.blockText}>{official}</Text>
            ) : (
              <Text style={styles.muted}>Aucun champ officiel disponible.</Text>
            )}
          </View>

          <View style={styles.block}>
            <Text style={styles.blockTitle}>Informations</Text>
            <Field label="ID" value={String((item as any).id)} />
            <Field label="Type" value={entity} />
            <Field label="Date" value={dateISO} />
            <Field label="Phase" value={(item as any).phase_label} />
            <Field label="Loi (loi_id)" value={(item as any).loi_id} />
            <Field label="Article" value={(item as any).article_ref} />
          </View>
        </ScrollView>
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

  scroll: { paddingHorizontal: 16, paddingBottom: 28, paddingTop: 6, gap: 12 },

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
  heroTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  heroIconChip: {
    width: 38,
    height: 38,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroMetaRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", flex: 1, justifyContent: "flex-end" },

  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    maxWidth: 190,
  },
  pillText: { color: colors.subtext, fontSize: 12, fontWeight: "900" },

  heroTitle: { marginTop: 10, color: colors.text, fontSize: 18, fontWeight: "900", lineHeight: 24 },
  heroSubtitle: { marginTop: 6, color: colors.subtext, fontSize: 13, lineHeight: 18, fontWeight: "700" },

  primaryBtn: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  primaryBtnText: { color: colors.text, fontSize: 13, fontWeight: "900" },

  block: {
    padding: 12,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    gap: 8,
  },
  blockTitle: { color: colors.text, fontSize: 12, fontWeight: "900", letterSpacing: 0.3 },
  blockText: { color: colors.text, fontSize: 12, fontWeight: "700", lineHeight: 18 },
  muted: { color: colors.subtext, fontSize: 12, fontWeight: "800", lineHeight: 18 },

  rowBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  rowBtnText: { color: colors.text, fontSize: 13, fontWeight: "900" },
  rowBtnArrow: { color: colors.text, fontSize: 14, fontWeight: "900" },

  fieldRow: { gap: 2, paddingVertical: 6, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" },
  fieldLabel: { color: colors.subtext, fontSize: 11, fontWeight: "900", letterSpacing: 0.6 },
  fieldValue: { color: colors.text, fontSize: 12, fontWeight: "800", lineHeight: 18 },

  journeyWrap: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.06)",
    padding: 12,
  },
  journeyDot: { width: 10, height: 10, borderRadius: 99, marginBottom: 8 },
  journeyTitle: { color: colors.text, fontSize: 12, fontWeight: "900", letterSpacing: 0.8 },
  journeyDebug: { color: colors.subtext, fontSize: 11, fontWeight: "800" },
  journeyRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  journeyChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  journeyChipText: { color: colors.text, fontSize: 12, fontWeight: "900" },
  journeySep: { color: colors.subtext, fontSize: 14, fontWeight: "900" },
  journeyHint: { marginTop: 10, color: colors.subtext, fontSize: 12, lineHeight: 17, fontWeight: "700" },
});
