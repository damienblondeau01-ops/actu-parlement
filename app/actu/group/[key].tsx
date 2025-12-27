// app/actu/group/[key].tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  FlatList,
  LayoutAnimation,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  UIManager,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

import { theme } from "../../../lib/theme";
import { fetchActuItems, type ActuItem as ActuItemDB } from "@/lib/queries/actu";
import { groupActuItems, type GroupedActuRow } from "@/lib/actu/grouping";
import { routeFromActuItem } from "../../../lib/routes";

const colors = theme.colors;

type Tone = "blue" | "pink" | "mint" | "amber" | "violet";

const STEP_LIMIT = 12;

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ✅ une seule source de vérité
const DEV = typeof __DEV__ !== "undefined" ? __DEV__ : true;

function cleanSpaces(s: any) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

function clampText(s: string, max = 260) {
  const t = cleanSpaces(s);
  if (!t) return "";
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  const lastSpace = Math.max(cut.lastIndexOf(" "), cut.lastIndexOf("—"), cut.lastIndexOf(","));
  const safe = (lastSpace > 60 ? cut.slice(0, lastSpace) : t.slice(0, max)).trimEnd();
  return safe + "…";
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

function toISO(input?: string | null): string {
  if (!input) return new Date().toISOString();
  const t = new Date(input).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : new Date().toISOString();
}

/** =========================
 *  Time buckets (Aujourd’hui / Cette semaine / Avant)
 *  ========================= */
type TimeBucket = "today" | "week" | "older";

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function bucketForISO(iso: string): TimeBucket {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "older";

  const now = new Date();
  const today0 = startOfDay(now);
  const item0 = startOfDay(new Date(t));

  if (item0 === today0) return "today";

  const diffDays = Math.floor((today0 - item0) / (24 * 3600 * 1000));
  return diffDays >= 0 && diffDays <= 7 ? "week" : "older";
}

function labelForBucket(b: TimeBucket) {
  if (b === "today") return "AUJOURD’HUI";
  if (b === "week") return "CETTE SEMAINE";
  return "AVANT";
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

function pickToneFromEntity(entity: string): Tone {
  if (entity === "scrutin") return "violet";
  if (entity === "loi") return "blue";
  if (entity === "amendement") return "mint";
  if (entity === "motion") return "pink";
  if (entity === "declaration") return "amber";
  return "blue";
}

function pickIconFromEntity(entity: string): { iconLib: "ion" | "mci"; iconName: string } {
  if (entity === "scrutin") return { iconLib: "mci", iconName: "gavel" };
  if (entity === "loi") return { iconLib: "ion", iconName: "document-text-outline" };
  if (entity === "amendement") return { iconLib: "mci", iconName: "file-document-edit-outline" };
  if (entity === "motion") return { iconLib: "mci", iconName: "alert-decagram-outline" };
  if (entity === "declaration") return { iconLib: "mci", iconName: "bullhorn-outline" };
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
  if (lib === "mci") return <MaterialCommunityIcons name={name as any} size={size} color={color} />;
  return <Ionicons name={name as any} size={size} color={color} />;
}

function safeDecode(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function withFromKey(path: string, fromKey?: string) {
  if (!path) return path;
  const fk = cleanSpaces(fromKey);
  if (!fk) return path;
  if (path.includes("fromKey=")) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}fromKey=${encodeURIComponent(fk)}`;
}

/** IMPORTANT: "eventIdLike" = ID événement (numérique), PAS "scrutin-public-..." */
function isEventIdLike(loiId: string) {
  const s = cleanSpaces(loiId);
  if (!s) return false;
  if (/^scrutin-\d+$/i.test(s)) return true;
  if (/^motion-\d+$/i.test(s)) return true;
  if (/^declaration-\d+$/i.test(s)) return true;
  return false;
}

function isDigits(s: string) {
  return /^\d+$/.test(cleanSpaces(s));
}

function extractScrutinNumero(it: any): string | null {
  const n1 = cleanSpaces(it?.numero_scrutin);
  const n2 = cleanSpaces(it?.numero);
  const n3 = cleanSpaces(it?.scrutin_numero);
  const n = n1 || n2 || n3;
  return n || null;
}

function extractAmendNumero(it: any): string | null {
  const n1 = cleanSpaces(it?.numero_amendement);
  const n2 = cleanSpaces(it?.amendement_numero);
  const n3 = cleanSpaces(it?.num_amendement);
  const n = n1 || n2 || n3;
  return n || null;
}

function detectAmendFromText(s: string) {
  const t = cleanSpaces(s).toLowerCase();
  if (!t) return null;
  const m = t.match(/amendement\s+n[°º]?\s*([0-9]+)\b/);
  return m?.[1] ? m[1] : null;
}

function dayKey(iso: string) {
  return String(iso ?? "").slice(0, 10);
}

function entityPriority(entity: string) {
  if (entity === "scrutin") return 40;
  if (entity === "article") return 30;
  if (entity === "amendement") return 20;
  if (entity === "loi") return 10;
  if (entity === "declaration") return 5;
  if (entity === "motion") return 5;
  return 0;
}

function extractComparableNumber(entity: string, raw: any) {
  if (entity === "scrutin") {
    const n = Number(extractScrutinNumero(raw));
    return Number.isFinite(n) ? n : null;
  }
  if (entity === "amendement") {
    const n = Number(extractAmendNumero(raw));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function buildStepTitle(it: any, entity: string) {
  if (entity === "scrutin") {
    const official =
      cleanSpaces(it?.objet) ||
      cleanSpaces(it?.titre) ||
      cleanSpaces(it?.title) ||
      cleanSpaces(it?.subtitle) ||
      "";
    const amendNum = detectAmendFromText(official);
    if (amendNum) return `Amendement n° ${amendNum} (vote)`;

    const n = extractScrutinNumero(it);
    if (n) return `Vote n° ${n}`;
    return "Vote";
  }
  if (entity === "amendement") {
    const n = extractAmendNumero(it);
    if (n) return `Amendement n° ${n}`;
    return "Amendement";
  }
  if (entity === "declaration") return "Déclaration";
  if (entity === "motion") return "Événement";
  if (entity === "loi") return "Loi";
  return "Élément";
}

function labelForEntity(entity: string) {
  if (entity === "scrutin") return "Vote";
  if (entity === "amendement") return "Amendement";
  if (entity === "loi") return "Loi";
  if (entity === "motion") return "Événement";
  if (entity === "declaration") return "Déclaration";
  return "Élément";
}

/**
 * Routing canon (anti-bug scrutin->loi + anti-guess)
 * - scrutin => /scrutins/{numero_scrutin} si possible
 * - loi     => /lois/{loi_id}
 * - sinon   => routeFromActuItem() puis fallback route.href
 */
function normalizeHref(it: ActuItemDB): string | null {
  const id = cleanSpaces((it as any)?.id);
  const entity = cleanSpaces((it as any)?.entity);
  const loi_id = cleanSpaces((it as any)?.loi_id);

  if (entity === "scrutin" || id.startsWith("scrutin-") || isDigits(id)) {
    const n = extractScrutinNumero(it as any);
    const scrId = n && isDigits(n) ? n : id;
    if (scrId) return `/scrutins/${encodeURIComponent(scrId)}`;
  }

  if (entity === "loi") {
    const k = loi_id || id;
    return k ? `/lois/${encodeURIComponent(k)}` : null;
  }

  try {
    const href = routeFromActuItem({ id, entity, loi_id } as any);
    if (href) return href;
  } catch {
    // ignore
  }

  const rawHref = cleanSpaces((it as any)?.route?.href);
  return rawHref || null;
}

function findRoutableLoiId(group?: GroupedActuRow | null): string | null {
  if (!group?.items?.length) return null;

  for (const it of group.items as any[]) {
    const loiId = cleanSpaces(it?.loi_id);
    if (!loiId) continue;
    if (loiId === "no-loi") continue;
    if (isEventIdLike(loiId)) continue;

    if (/^DLR/i.test(loiId)) return loiId;
    if (loiId.startsWith("loi-")) return loiId;
    if (loiId.startsWith("scrutin-public-")) return loiId;
    if (loiId.length >= 18) return loiId;
  }

  return null;
}

function buildGroupTLDR(group?: GroupedActuRow | null): string | null {
  if (!group) return null;

  const tldrs = (group.items as any[])?.map((x) => cleanSpaces(x?.tldr)).filter(Boolean);
  if (tldrs?.length) {
    const uniq: string[] = [];
    for (const t of tldrs) {
      const low = t.toLowerCase();
      if (!uniq.some((u) => u.toLowerCase() === low)) uniq.push(t);
      if (uniq.length >= 2) break;
    }
    return clampText(uniq.join(" ").trim(), 320);
  }

  const hi = (group.display?.highlights ?? []).map(cleanSpaces).filter(Boolean);
  if (hi.length) return clampText(hi.join(" • "), 260);

  const longTitle = cleanSpaces((group as any)?.display?.longTitle ?? "");
  if (longTitle) return clampText(longTitle, 280);

  const sub = cleanSpaces(group.display?.subtitle ?? "");
  if (sub) return clampText(sub, 220);

  return null;
}

function shortOutcomeLabel(resultatRaw: string) {
  const r = cleanSpaces(resultatRaw).toLowerCase();
  if (!r) return "";
  if (r.includes("n'a pas adopté") || r.includes("non adopté") || r.includes("non-adopté")) return "non adopté";
  if (r.includes("adopt")) return "adopté";
  if (r.includes("rejet")) return "rejeté";
  if (r.includes("approuv")) return "approuvé";
  return cleanSpaces(resultatRaw);
}

function buildCitizenSummary({
  headerTitle,
  headerSubtitle,
  groupTLDR,
  hasVote,
  hasAmend,
  hasArticles,
}: {
  headerTitle: string;
  headerSubtitle: string;
  groupTLDR: string | null;
  hasVote: boolean;
  hasAmend: boolean;
  hasArticles: boolean;
}) {
  if (groupTLDR) return clampText(groupTLDR, 220);

  const base = headerTitle || "Événement parlementaire";
  const action = hasVote
    ? `Les députés ont voté : ${base}.`
    : hasAmend
    ? `Des amendements ont été examinés : ${base}.`
    : hasArticles
    ? `Un article a été discuté : ${base}.`
    : `${base}.`;

  const ctx = cleanSpaces(headerSubtitle);
  if (ctx && ctx.length <= 80) return clampText(`${action} (${ctx})`, 220);
  return clampText(action, 220);
}

function buildEnClairBlocks({
  headerTitle,
  headerSubtitle,
  groupTLDR,
  scrCount,
  amendCount,
  artCount,
  primaryVoteRaw,
}: {
  headerTitle: string;
  headerSubtitle: string;
  groupTLDR: string | null;
  scrCount: number;
  amendCount: number;
  artCount: number;
  primaryVoteRaw: any | null;
}) {
  const happened = buildCitizenSummary({
    headerTitle,
    headerSubtitle,
    groupTLDR,
    hasVote: scrCount > 0,
    hasAmend: amendCount > 0,
    hasArticles: artCount > 0,
  });

  const rawRes = cleanSpaces(primaryVoteRaw?.resultat || primaryVoteRaw?.vote_resultat || "");
  const outcome = shortOutcomeLabel(rawRes);
  const resultLine =
    outcome && scrCount > 0 ? `Résultat : ${outcome} (${scrCount} vote${scrCount > 1 ? "s" : ""}).` : "";

  const why =
    scrCount > 0
      ? "Pourquoi ça compte : ce vote change l’état du texte (adopté, rejeté…)."
      : amendCount > 0
      ? "Pourquoi ça compte : des amendements peuvent modifier le texte."
      : artCount > 0
      ? "Pourquoi ça compte : la discussion article par article précise le contenu."
      : "Pourquoi ça compte : c’est une étape du travail parlementaire.";

  return { happened, resultLine, why };
}

/** COARSE key: type + loiKey (sans date/phase) */
function baseGroupKey(k: string) {
  const parts = String(k ?? "").split("|");
  return parts.length >= 2 ? `${parts[0]}|${parts[1]}` : k;
}

function buildCoarseGroups(strictGroups: GroupedActuRow[]) {
  const map = new Map<string, any>();

  for (const g of strictGroups as any[]) {
    const k0 = baseGroupKey(g.groupKey);
    const prev = map.get(k0);

    if (!prev) {
      map.set(k0, {
        ...g,
        groupKey: k0,
        items: [...(g.items ?? [])],
        summary: { ...(g.summary ?? {}) },
        dateMax: g.dateMax,
      });
      continue;
    }

    prev.items.push(...(g.items ?? []));
    prev.summary = {
      total: prev.items.length,
      scrutins: (prev.summary?.scrutins ?? 0) + (g.summary?.scrutins ?? 0),
      amendements: (prev.summary?.amendements ?? 0) + (g.summary?.amendements ?? 0),
      articles: (prev.summary?.articles ?? 0) + (g.summary?.articles ?? 0),
    };

    prev.dateMax = [prev.dateMax, g.dateMax].filter(Boolean).sort().pop();
  }

  const out = Array.from(map.values());
  out.forEach((gg) => {
    gg.items.sort((a: any, b: any) => String(b?.date ?? "").localeCompare(String(a?.date ?? "")));
    gg.summary.total = gg.items.length;
  });

  out.sort((a, b) => String(b?.dateMax ?? "").localeCompare(String(a?.dateMax ?? "")));
  return out as GroupedActuRow[];
}

type ItemRow = {
  id: string;
  dateISO: string;
  title: string;
  subtitle: string;
  entity: string;
  href?: string | null;
  raw: ActuItemDB;
  bucket: TimeBucket;
  isPinned?: boolean;
};

function InfoBlock({
  title,
  children,
  icon,
}: {
  title: string;
  children: React.ReactNode;
  icon?: { lib: "ion" | "mci"; name: string; color?: string };
}) {
  return (
    <View style={styles.infoBlock}>
      <View style={styles.infoTitleRow}>
        {icon ? (
          <View style={styles.infoIcon}>
            <Icon lib={icon.lib} name={icon.name} size={16} color={icon.color ?? colors.text} />
          </View>
        ) : null}
        <Text style={styles.infoTitle}>{title}</Text>
      </View>
      <View style={{ marginTop: 8 }}>{children}</View>
    </View>
  );
}

function CTAButton({
  label,
  onPress,
  iconLeft,
}: {
  label: string;
  onPress: () => void;
  iconLeft?: React.ReactNode;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.ctaBtn, pressed && { opacity: 0.96 }]}>
      {iconLeft ? <View style={{ width: 18, alignItems: "center" }}>{iconLeft}</View> : null}
      <Text style={styles.ctaBtnText}>{label}</Text>
      <View style={{ flex: 1 }} />
      <Text style={styles.ctaBtnArrow}>→</Text>
    </Pressable>
  );
}

function JourneyCompact({ accent }: { accent: string }) {
  return (
    <View style={styles.journeyWrap}>
      <View style={[styles.journeyDot, { backgroundColor: accent }]} />
      <Text style={styles.journeyTitle}>PARCOURS</Text>

      <View style={{ height: 10 }} />

      <View style={styles.journeyRow}>
        <View style={[styles.journeyChip, { borderColor: "rgba(255,255,255,0.18)" }]}>
          <Ionicons name="newspaper-outline" size={14} color={colors.text} />
          <Text style={styles.journeyChipText}>Actu</Text>
        </View>

        <Text style={styles.journeySep}>›</Text>

        <View style={[styles.journeyChip, { borderColor: "rgba(255,255,255,0.18)" }]}>
          <Ionicons name="sparkles-outline" size={14} color={colors.text} />
          <Text style={styles.journeyChipText}>Récit</Text>
        </View>

        <Text style={styles.journeySep}>›</Text>

        <View style={[styles.journeyChip, { borderColor: "rgba(255,255,255,0.18)" }]}>
          <Ionicons name="list-outline" size={14} color={colors.text} />
          <Text style={styles.journeyChipText}>Étapes</Text>
        </View>
      </View>

      <Text style={styles.journeyHint}>
        Lecture citoyenne d’abord. Les <Text style={{ fontWeight: "900" }}>preuves</Text> (numéros, ids) sont repliées.
      </Text>
    </View>
  );
}

function ProofsAccordion({
  open,
  onToggle,
  groupKey,
  loiId,
  primaryScrutinNumero,
}: {
  open: boolean;
  onToggle: () => void;
  groupKey: string;
  loiId: string | null;
  primaryScrutinNumero: string | null;
}) {
  return (
    <View style={styles.proofsWrap}>
      <Pressable
        onPress={() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          onToggle();
        }}
        style={({ pressed }) => [styles.proofsHeader, pressed && { opacity: 0.96 }]}
      >
        <View style={[styles.infoIcon, { borderColor: "rgba(255,255,255,0.14)" }]}>
          <Ionicons name="shield-checkmark-outline" size={16} color={colors.text} />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.infoTitle}>PREUVES</Text>
          <Text style={styles.proofsHint} numberOfLines={2}>
            Sources & identifiants (pour vérifier).
          </Text>
        </View>

        <View style={[styles.proofsChevron, { borderColor: "rgba(255,255,255,0.12)" }]}>
          <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.text} />
        </View>
      </Pressable>

      {open ? (
        <View style={{ marginTop: 10, gap: 10 }}>
          <View style={styles.proofCard}>
            <Text style={styles.proofK}>Source</Text>
            <Text style={styles.proofV}>Assemblée nationale (OpenData)</Text>
          </View>

          {primaryScrutinNumero ? (
            <View style={styles.proofCard}>
              <Text style={styles.proofK}>Scrutin</Text>
              <Text style={styles.proofV}>n° {primaryScrutinNumero}</Text>
            </View>
          ) : null}

          {loiId ? (
            <View style={styles.proofCard}>
              <Text style={styles.proofK}>Identifiant loi</Text>
              <Text style={styles.proofV} numberOfLines={2}>
                {loiId}
              </Text>
            </View>
          ) : null}

          <View style={styles.proofCard}>
            <Text style={styles.proofK}>Identifiant récit</Text>
            <Text style={styles.proofV} numberOfLines={2}>
              {groupKey}
            </Text>
          </View>

          <View style={styles.proofFoot}>
            <Text style={styles.proofFootText}>
              Les identifiants techniques sont ici pour audit. Ils ne sont pas nécessaires pour comprendre le récit.
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** =========================
 *  ✅ Mini Skeleton (simple + propre)
 *  ========================= */
function SkeletonBox({ w, h, r = 12, style }: { w?: number | string; h: number; r?: number; style?: any }) {
  return (
    <View
      style={[
        { width: w ?? "100%", height: h, borderRadius: r, backgroundColor: "rgba(255,255,255,0.07)" },
        style,
      ]}
    />
  );
}

function usePulse() {
  const v = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 0.75, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.35, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return v;
}

function GroupSkeleton() {
  const opacity = usePulse();
  return (
    <Animated.View style={{ opacity }}>
      <View style={styles.list}>
        {/* Hero skeleton */}
        <View style={[styles.heroWrap, { padding: 12 }]}>
          <SkeletonBox h={14} w={110} r={999} />
          <SkeletonBox h={22} w={"88%"} r={10} style={{ marginTop: 10 }} />
          <SkeletonBox h={14} w={"70%"} r={10} style={{ marginTop: 10 }} />
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <SkeletonBox h={34} w={90} r={14} />
            <SkeletonBox h={34} w={90} r={14} />
            <SkeletonBox h={34} w={90} r={14} />
          </View>
        </View>

        {/* Info blocks skeleton */}
        <View style={{ marginTop: 10, gap: 10 }}>
          <View style={styles.infoBlock}>
            <SkeletonBox h={12} w={90} r={8} />
            <SkeletonBox h={12} w={"92%"} r={8} style={{ marginTop: 10 }} />
            <SkeletonBox h={12} w={"80%"} r={8} style={{ marginTop: 8 }} />
            <SkeletonBox h={12} w={"86%"} r={8} style={{ marginTop: 8 }} />
          </View>

          <View style={styles.infoBlock}>
            <SkeletonBox h={12} w={110} r={8} />
            <SkeletonBox h={12} w={"88%"} r={8} style={{ marginTop: 10 }} />
            <SkeletonBox h={12} w={"75%"} r={8} style={{ marginTop: 8 }} />
          </View>
        </View>

        {/* Steps title skeleton */}
        <View style={{ paddingHorizontal: 2, marginTop: 12 }}>
          <SkeletonBox h={12} w={90} r={8} />
          <SkeletonBox h={12} w={"70%"} r={8} style={{ marginTop: 10 }} />
          <View style={styles.sectionLine} />
        </View>

        {/* Cards skeleton */}
        <View style={{ marginTop: 10, gap: 10 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <View key={`sk-${i}`} style={styles.card}>
              <SkeletonBox h={16} w={160} r={10} />
              <SkeletonBox h={12} w={"92%"} r={10} />
              <SkeletonBox h={12} w={"78%"} r={10} />
              <View style={{ height: 4 }} />
            </View>
          ))}
        </View>
      </View>
    </Animated.View>
  );
}

export default function ActuGroupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ key?: string }>();

  const encodedKey = typeof params.key === "string" ? params.key : "";
  const groupKey = useMemo(() => safeDecode(encodedKey), [encodedKey]);

  useEffect(() => {
    if (!DEV) return;
    console.log("[ROUTE HIT] app/actu/group/[key].tsx | groupKey =", groupKey);
  }, [groupKey]);

  const mountRef = useRef(0);
  useEffect(() => {
    if (!DEV) return;
    mountRef.current += 1;
    console.log("[GROUP SCREEN MOUNT]", mountRef.current, "| groupKey =", groupKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawDB, setRawDB] = useState<ActuItemDB[]>([]);
  const [proofsOpen, setProofsOpen] = useState(false);
  const [showAllSteps, setShowAllSteps] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const feed = await fetchActuItems();
    setRawDB((feed ?? []) as ActuItemDB[]);
  }, []);

  const lastLoadKeyRef = useRef<string>("");
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (!groupKey) return;

        if (lastLoadKeyRef.current === groupKey) {
          if (DEV) console.log("[LOAD SKIP] same groupKey =", groupKey);
          return;
        }
        lastLoadKeyRef.current = groupKey;

        setLoading(true);
        await load();
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Erreur inconnue");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [groupKey, load]);

  const onRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      lastLoadKeyRef.current = "";
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Erreur inconnue");
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const groupedStrict = useMemo(() => groupActuItems(rawDB as any), [rawDB]);
  const groupedCoarse = useMemo(() => buildCoarseGroups(groupedStrict), [groupedStrict]);

  const group: GroupedActuRow | null = useMemo(() => {
    if (!groupKey) return null;

    const g1 = groupedCoarse.find((g) => g.groupKey === groupKey) ?? null;
    if (g1) return g1;

    const base = baseGroupKey(groupKey);
    const g2 = groupedCoarse.find((g) => g.groupKey === base) ?? null;
    if (g2) return g2;

    return groupedStrict.find((g) => g.groupKey === groupKey) ?? null;
  }, [groupKey, groupedCoarse, groupedStrict]);

  // ✅ log seulement quand on a fini de charger (sinon "found=false" pollue)
  useEffect(() => {
    if (!DEV) return;
    if (loading) return;

    const foundKey = cleanSpaces((group as any)?.groupKey);
    const base = baseGroupKey(groupKey);

    console.log("[GROUP RESOLVED]", {
      groupKey,
      baseKey: base,
      found: !!group,
      foundKey,
      entity: cleanSpaces((group as any)?.entity),
      items: ((group as any)?.items?.length ?? 0) as number,
      dateMax: cleanSpaces((group as any)?.dateMax),
      loiIdTop: cleanSpaces(((group as any)?.items?.[0] as any)?.loi_id),
    });
  }, [groupKey, group, loading]);

  // ✅ Helpers dérivés
  const groupTLDR = useMemo(() => buildGroupTLDR(group), [group]);
  const loiIdRoutable = useMemo(() => findRoutableLoiId(group), [group]);

  useEffect(() => {
    if (!DEV) return;
    if (loading) return;
    const items = ((group as any)?.items ?? []) as any[];
    if (!items.length) return;

    const loiIds = items.map((x) => cleanSpaces(x?.loi_id)).filter(Boolean);
    const uniq = Array.from(new Set(loiIds)).slice(0, 5);
    console.log("[GROUP loi_id uniq (top5)]", uniq);
  }, [group, loading]);

  const tone: Tone = useMemo(() => pickToneFromEntity(group?.entity ?? "loi"), [group?.entity]);
  const grad = useMemo(() => gradientForTone(tone), [tone]);
  const accent = useMemo(() => accentForTone(tone), [tone]);
  const icon = useMemo(() => pickIconFromEntity(group?.entity ?? "loi"), [group?.entity]);

  const header = useMemo(() => {
    if (!group) return null;

    const date = (group as any).dateMax ?? ((group.items as any[])?.[0]?.date ?? "");
    const title = cleanSpaces(group.display?.title ?? "Récit");

    const total = group.summary?.total ?? (group.items?.length ?? 0);
    const amend = group.summary?.amendements ?? 0;
    const scr = group.summary?.scrutins ?? 0;
    const art = group.summary?.articles ?? 0;

    const subtitle =
      cleanSpaces(group.display?.subtitle) ||
      (() => {
        const parts: string[] = [];
        if (scr) parts.push(`${scr} vote${scr > 1 ? "s" : ""}`);
        if (amend) parts.push(`${amend} amendement${amend > 1 ? "s" : ""}`);
        if (art) parts.push(`${art} article${art > 1 ? "s" : ""}`);
        if (parts.length) return parts.join(" • ");
        return `${total} élément${total > 1 ? "s" : ""}`;
      })();

    return { title, date, total, amend, scr, art, subtitle };
  }, [group]);

  const loiHref = useMemo(() => {
    if (!loiIdRoutable) return null;
    return withFromKey(`/lois/${encodeURIComponent(loiIdRoutable)}`, groupKey);
  }, [loiIdRoutable, groupKey]);

  const mappedItems: ItemRow[] = useMemo(() => {
    if (!group?.items?.length) return [];

    const mapped: ItemRow[] = (group.items as any[]).map((it: any, idx: number) => {
      const entity = cleanSpaces(it?.entity) || "autre";
      const dateISO = toISO(String(it?.date ?? (group as any).dateMax ?? ""));
      const bucket = bucketForISO(dateISO);

      const title = buildStepTitle(it, entity);

      const official =
        cleanSpaces(it?.objet) ||
        cleanSpaces(it?.titre) ||
        cleanSpaces(it?.title) ||
        cleanSpaces(it?.subtitle) ||
        "";

      const tldr = cleanSpaces(it?.tldr) || "";
      const subtitle = clampText(tldr || official || labelForEntity(entity), 180);

      const href = normalizeHref(it as ActuItemDB);
      const id = cleanSpaces(it?.id) || `${entity}-${dateISO}-${idx}`;

      return { id, dateISO, title, subtitle, entity, href, raw: it as ActuItemDB, bucket };
    });

    mapped.sort((a, b) => {
      const d = String(b.dateISO).localeCompare(String(a.dateISO));
      if (d !== 0) return d;

      const dayA = dayKey(a.dateISO);
      const dayB = dayKey(b.dateISO);
      if (dayA === dayB) {
        const p = entityPriority(b.entity) - entityPriority(a.entity);
        if (p !== 0) return p;

        const nbA = extractComparableNumber(a.entity, a.raw);
        const nbB = extractComparableNumber(b.entity, b.raw);
        if (nbA != null && nbB != null && nbA !== nbB) return nbB - nbA;
      }

      return String(b.id).localeCompare(String(a.id));
    });

    return mapped;
  }, [group]);

  const primaryVote = useMemo(() => {
    const scrutins = mappedItems.filter((x) => x.entity === "scrutin");
    if (!scrutins.length) return null;
    scrutins.sort((a, b) => String(b.dateISO).localeCompare(String(a.dateISO)));
    return scrutins[0] ?? null;
  }, [mappedItems]);

  const allItems: ItemRow[] = useMemo(() => {
    if (!mappedItems.length) return [];

    const pvId = primaryVote?.id ? String(primaryVote.id) : null;

    const base = mappedItems.map((x) => ({
      ...x,
      isPinned: pvId ? x.id === pvId : false,
    }));

    if (!pvId) return base;

    const pv = base.find((x) => x.id === pvId) ?? null;
    if (!pv) return base;
    if (pv.bucket !== "today") return base;

    const rest = base.filter((x) => x.id !== pvId);
    return [pv, ...rest];
  }, [mappedItems, primaryVote]);

  useEffect(() => {
    if (!allItems?.length) return;
    if (allItems.length > STEP_LIMIT) setShowAllSteps(false);
  }, [groupKey, allItems.length]);

  const visibleItems = useMemo(() => {
    if (showAllSteps) return allItems;
    return allItems.slice(0, STEP_LIMIT);
  }, [allItems, showAllSteps]);

  const hasMore = allItems.length > STEP_LIMIT;

  const primaryVoteHref = useMemo(() => {
    if (!primaryVote?.href) return null;
    return withFromKey(primaryVote.href, groupKey);
  }, [primaryVote, groupKey]);

  const primaryScrutinNumero = useMemo(() => {
    if (!primaryVote?.raw) return null;
    return extractScrutinNumero(primaryVote.raw as any);
  }, [primaryVote]);

  const openHref = useCallback(
    (href?: string | null) => {
      if (!href) return;
      const finalHref = withFromKey(href, groupKey);
      router.push(finalHref as any);
    },
    [router, groupKey]
  );

  const enClair = useMemo(() => {
    if (!header) return { happened: "", resultLine: "", why: "" };
    return buildEnClairBlocks({
      headerTitle: header.title,
      headerSubtitle: header.subtitle,
      groupTLDR,
      scrCount: header.scr ?? 0,
      amendCount: header.amend ?? 0,
      artCount: header.art ?? 0,
      primaryVoteRaw: primaryVote?.raw ?? null,
    });
  }, [header, groupTLDR, primaryVote]);

  const renderItem = ({ item, index }: { item: ItemRow; index: number }) => {
    const t = pickToneFromEntity(item.entity);
    const g = gradientForTone(t);
    const a = accentForTone(t);
    const ic = pickIconFromEntity(item.entity);

    const canOpen = !!item.href;
    const badge = labelForEntity(item.entity);

    const prev = index > 0 ? visibleItems[index - 1] : null;
    const showBucketHeader = !prev || prev.bucket !== item.bucket;
    const bucketLabel = labelForBucket(item.bucket);

    return (
      <View>
        {showBucketHeader ? (
          <View style={styles.bucketRow}>
            <View style={styles.bucketPill}>
              <Text style={styles.bucketText}>{bucketLabel}</Text>
            </View>
            <View style={styles.bucketLine} />
          </View>
        ) : null}

        <Pressable
          style={({ pressed }) => [
            styles.card,
            pressed && canOpen && { opacity: 0.96 },
            !canOpen && { opacity: 0.6 }, // ✅ FIX #2
            item.isPinned && styles.pinnedCard,
          ]}
          onPress={canOpen ? () => openHref(item.href) : undefined} // ✅ FIX #2
          android_ripple={canOpen ? { color: "rgba(255,255,255,0.06)" } : undefined} // ✅ FIX #2
        >
          <LinearGradient colors={g as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cardBg} />
          <View style={[styles.accentBar, { backgroundColor: a }]} />

          <View style={styles.itemTopRow}>
            <View style={[styles.iconChip, { borderColor: a }]}>
              <Icon lib={ic.iconLib} name={ic.iconName} size={16} color={a} />
            </View>

            <View style={styles.metaRow}>
              {item.isPinned ? (
                <View style={styles.pinPill}>
                  <Ionicons name="star" size={12} color={colors.text} />
                  <Text style={styles.pinText}>Vote principal</Text>
                </View>
              ) : null}

              <View style={styles.badgePill}>
                <Text style={styles.badgeText} numberOfLines={1}>
                  {badge}
                </Text>
              </View>

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
              {canOpen ? "Voir la preuve →" : "Information"} {/* ✅ FIX #1 */}
            </Text>
            <View style={styles.ctaRight}>
              <Text style={styles.ctaText}>→</Text>
            </View>
          </View>
        </Pressable>
      </View>
    );
  };

  const renderStepsFooter = () => {
    if (!hasMore) return null;

    const remaining = allItems.length - STEP_LIMIT;
    const label = showAllSteps ? "Réduire la liste" : `Voir toutes les étapes (+${remaining})`;

    return (
      <View style={{ marginTop: 12 }}>
        <Pressable
          onPress={() => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setShowAllSteps((v) => !v);
          }}
          style={({ pressed }) => [styles.moreBtn, pressed && { opacity: 0.96 }]}
        >
          <Ionicons name={showAllSteps ? "chevron-up" : "chevron-down"} size={16} color={colors.text} />
          <Text style={styles.moreBtnText}>{label}</Text>
          <View style={{ flex: 1 }} />
          <Text style={styles.moreBtnArrow}>→</Text>
        </Pressable>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
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

      {/* ✅ Skeleton state */}
      {loading ? (
        <GroupSkeleton />
      ) : error ? (
        <View style={{ padding: 16, gap: 8 }}>
          <Text style={{ color: colors.text, fontWeight: "900" }}>Impossible de charger</Text>
          <Text style={{ color: colors.subtext }}>{error}</Text>
          <Pressable onPress={onRefresh} style={{ marginTop: 8 }}>
            <Text style={{ color: colors.text, fontWeight: "900" }}>Réessayer →</Text>
          </Pressable>
        </View>
      ) : !group || !header ? (
        <View style={{ padding: 16, gap: 8 }}>
          <Text style={{ color: colors.text, fontWeight: "900" }}>Récit introuvable</Text>
          <Text style={{ color: colors.subtext }}>
            Ce récit n’existe plus (feed mis à jour) ou l’identifiant est invalide.
          </Text>
          <Pressable onPress={() => router.back()} style={{ marginTop: 8 }}>
            <Text style={{ color: colors.text, fontWeight: "900" }}>Retour →</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={visibleItems}
          keyExtractor={(it, idx) => `it-${it.id}-${idx}`}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListFooterComponent={renderStepsFooter}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}
          ListHeaderComponent={
            <View style={{ marginBottom: 10 }}>
              <View style={styles.heroWrap}>
                <LinearGradient colors={grad as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroBg} />
                <View style={[styles.heroGlow, { shadowColor: accent }]} />

                <View style={styles.heroTopRow}>
                  <View style={[styles.heroIconChip, { borderColor: accent }]}>
                    <Icon lib={icon.iconLib} name={icon.iconName} size={18} color={accent} />
                  </View>

                  <View style={styles.heroMetaRow}>
                    <View style={styles.heroDatePill}>
                      <Text style={styles.heroDateText}>{fmtDateFR(header.date)}</Text>
                    </View>
                  </View>
                </View>

                <Text style={styles.heroTitle} numberOfLines={3}>
                  {header.title}
                </Text>

                <Text style={styles.heroSubtitle} numberOfLines={2}>
                  {header.subtitle}
                </Text>

                <View style={styles.kpiRow}>
                  {header.scr ? (
                    <View style={styles.kpiPill}>
                      <Text style={styles.kpiLabel}>Votes</Text>
                      <Text style={styles.kpiValue}>{header.scr}</Text>
                    </View>
                  ) : null}

                  {header.art ? (
                    <View style={styles.kpiPill}>
                      <Text style={styles.kpiLabel}>Articles</Text>
                      <Text style={styles.kpiValue}>{header.art}</Text>
                    </View>
                  ) : null}

                  {header.amend ? (
                    <View style={styles.kpiPill}>
                      <Text style={styles.kpiLabel}>Amend.</Text>
                      <Text style={styles.kpiValue}>{header.amend}</Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.heroBottomRow}>
                  <View style={[styles.accentDot, { backgroundColor: accent }]} />
                  <Text style={styles.heroCta}>En clair → preuves → étapes</Text>
                  <Text style={styles.heroArrow}>↓</Text>
                </View>
              </View>

              <View style={{ marginTop: 10, gap: 10 }}>
                <JourneyCompact accent={accent} />

                <InfoBlock title="EN CLAIR" icon={{ lib: "ion", name: "sparkles-outline", color: colors.text }}>
                  <Text style={styles.enClairHeadline}>Ce qui s’est passé</Text>
                  <Text style={[styles.infoText, { marginTop: 6 }]}>{enClair.happened}</Text>

                  {!!enClair.resultLine && (
                    <Text style={[styles.infoText, { marginTop: 8, opacity: 0.9 }]}>{enClair.resultLine}</Text>
                  )}

                  <Text style={[styles.infoText, { marginTop: 8, opacity: 0.85 }]}>{enClair.why}</Text>

                  {primaryVoteHref ? (
                    <View style={{ marginTop: 10 }}>
                      <CTAButton
                        label="Voir le vote principal"
                        onPress={() => router.push(primaryVoteHref as any)}
                        iconLeft={<MaterialCommunityIcons name="gavel" size={16} color={colors.text} />}
                      />
                    </View>
                  ) : null}
                </InfoBlock>

                <ProofsAccordion
                  open={proofsOpen}
                  onToggle={() => setProofsOpen((v) => !v)}
                  groupKey={groupKey}
                  loiId={cleanSpaces((group as any)?.loi_id) || cleanSpaces((group.items as any[])?.[0]?.loi_id) || null}
                  primaryScrutinNumero={primaryScrutinNumero}
                />

                <InfoBlock title="CONTEXTE" icon={{ lib: "ion", name: "information-circle-outline", color: colors.text }}>
                  <Text style={styles.infoText}>
                    {loiHref
                      ? "Ce récit fait partie d’un texte de loi. Ouvre la fiche loi pour voir le parcours complet."
                      : "Ce récit n’est pas encore rattaché à une loi unique (données incomplètes). Tu peux quand même vérifier chaque étape ci-dessous."}
                  </Text>

                  {loiHref ? (
                    <Pressable onPress={() => router.push(loiHref as any)} style={{ marginTop: 10 }}>
                      <Text style={{ color: colors.text, fontWeight: "900" }}>Ouvrir la fiche loi →</Text>
                    </Pressable>
                  ) : null}
                </InfoBlock>
              </View>

              <View style={{ paddingHorizontal: 2, marginTop: 12 }}>
                <Text style={styles.sectionTitle}>ÉTAPES</Text>
                <Text style={styles.stepsHint}>
                  {hasMore
                    ? `Les ${STEP_LIMIT} étapes les plus récentes.`
                    : "Chaque étape correspond à un fait parlementaire vérifiable."}{" "}
                  {/* ✅ FIX #3 */}
                </Text>
                <View style={styles.sectionLine} />
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={{ padding: 16 }}>
              <Text style={{ color: colors.subtext }}>Aucun élément dans ce récit.</Text>
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

  sectionTitle: { color: colors.subtext, fontSize: 12, fontWeight: "900", letterSpacing: 1.2 },
  stepsHint: { marginTop: 6, color: colors.text, opacity: 0.78, fontSize: 12, fontWeight: "800", lineHeight: 17 },
  sectionLine: { height: 1, backgroundColor: "rgba(255,255,255,0.08)", marginTop: 8 },

  heroWrap: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
    backgroundColor: colors.card,
    padding: 12,
  },
  heroBg: { ...StyleSheet.absoluteFillObject },
  heroGlow: {
    position: "absolute",
    top: -14,
    right: -24,
    width: 130,
    height: 130,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    shadowOpacity: 0.48,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 0 },
    elevation: 7,
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
  heroDatePill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  heroDateText: { color: colors.subtext, fontSize: 12, fontWeight: "800" },

  heroTitle: { marginTop: 10, color: colors.text, fontSize: 17, fontWeight: "900", lineHeight: 23 },
  heroSubtitle: { marginTop: 6, color: colors.subtext, fontSize: 12, fontWeight: "800", lineHeight: 17 },

  kpiRow: { marginTop: 10, flexDirection: "row", gap: 8, flexWrap: "wrap" },
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

  heroBottomRow: { marginTop: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  heroCta: { color: colors.text, fontSize: 13, fontWeight: "900", flex: 1 },
  heroArrow: { color: colors.text, fontSize: 16, fontWeight: "900" },
  accentDot: { width: 8, height: 8, borderRadius: 99 },

  infoBlock: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.06)",
    padding: 12,
  },
  infoTitleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  infoIcon: {
    width: 28,
    height: 28,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  infoTitle: { color: colors.text, fontSize: 12, fontWeight: "900", letterSpacing: 0.8 },
  infoText: { color: colors.text, fontSize: 12, fontWeight: "700", lineHeight: 18 },
  enClairHeadline: { color: colors.text, fontSize: 14, fontWeight: "900" },

  ctaBtn: {
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
  ctaBtnText: { color: colors.text, fontSize: 13, fontWeight: "900" },
  ctaBtnArrow: { color: colors.text, fontSize: 14, fontWeight: "900" },

  journeyWrap: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.06)",
    padding: 12,
  },
  journeyDot: { width: 10, height: 10, borderRadius: 99, marginBottom: 8 },
  journeyTitle: { color: colors.text, fontSize: 12, fontWeight: "900", letterSpacing: 0.8 },
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

  proofsWrap: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.06)",
    padding: 12,
  },
  proofsHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  proofsHint: { marginTop: 2, color: colors.subtext, fontSize: 12, fontWeight: "700" },
  proofsChevron: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
  },
  proofCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: 12,
  },
  proofK: { color: colors.subtext, fontSize: 12, fontWeight: "900", marginBottom: 6 },
  proofV: { color: colors.text, fontSize: 12, fontWeight: "800", lineHeight: 18 },
  proofFoot: {
    paddingLeft: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  proofFootText: { color: colors.subtext, fontSize: 12, fontWeight: "700", lineHeight: 17 },

  bucketRow: {
    marginTop: 8,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  bucketPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  bucketText: {
    color: colors.subtext,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  bucketLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
  },

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
  pinnedCard: {
    borderColor: "rgba(255,255,255,0.18)",
  },
  cardBg: { ...StyleSheet.absoluteFillObject },
  accentBar: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4, opacity: 0.75 },

  itemTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  iconChip: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" },

  pinPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    maxWidth: 170,
  },
  pinText: { color: colors.text, fontSize: 12, fontWeight: "900" },

  badgePill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    maxWidth: 130,
  },
  badgeText: { color: colors.text, fontSize: 12, fontWeight: "900" },
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
  bottomHint: { color: colors.text, fontSize: 12, fontWeight: "900" },
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

  moreBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  moreBtnText: { color: colors.text, fontSize: 13, fontWeight: "900" },
  moreBtnArrow: { color: colors.text, fontSize: 14, fontWeight: "900" },
});
