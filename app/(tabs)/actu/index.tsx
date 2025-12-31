// app/(tabs)/actu/index.tsx

// ⚠️ RÈGLE PRODUIT : le titre éditorial (heroTitle)
// doit TOUJOURS être propagé depuis Actu vers la fiche loi

import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
  InteractionManager,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { fetchActuItems, type ActuItem as ActuItemDB } from "@/lib/queries/actu";
import { groupActuItems, type GroupedActuRow } from "@/lib/actu/grouping";

import ActuBulletinRow from "@/components/actu/ActuBulletinRow";
import type { ActuItemUI, Tone } from "@/components/actu/types";

const PAPER = "#F6F1E8";
const PAPER_CARD = "#FBF7F0";
const INK = "#121417";
const INK_SOFT = "rgba(18,20,23,0.72)";
const LINE = "rgba(18,20,23,0.14)";

const ACTU_FEED_MAX_ITEMS_PER_STORY = 12;

const DEBUG_ACTU =
  (typeof process !== "undefined" &&
    (process as any)?.env?.EXPO_PUBLIC_ACTU_DEBUG === "1") ||
  false;

function dlog(...args: any[]) {
  if (!DEBUG_ACTU) return;
  // eslint-disable-next-line no-console
  console.log(...args);
}

/* ─────────────────────────────
   Temps / buckets (stable)
   ───────────────────────────── */
function toISO(input?: string | null): string {
  if (!input) return new Date().toISOString();
  const t = new Date(input).getTime();
  return Number.isFinite(t)
    ? new Date(t).toISOString()
    : new Date().toISOString();
}

function daysAgo(dateISO: string) {
  const t = new Date(dateISO).getTime();
  if (!Number.isFinite(t)) return 9999;
  const now = Date.now();
  return Math.floor((now - t) / (1000 * 60 * 60 * 24));
}

function bucketLabel(dateISO: string) {
  const d = daysAgo(dateISO);
  if (d <= 0) return "AUJOURD’HUI";
  if (d <= 6) return "CETTE SEMAINE";
  if (d <= 13) return "SEMAINE DERNIÈRE";
  return "PLUS TÔT";
}

type Row =
  | { kind: "header"; title: string }
  | {
      kind: "item";
      item: ActuItemUI & { why?: string; deltaLine?: string; badge?: string };
    };

/* ─────────────────────────────
   UI picks
   ───────────────────────────── */
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
  if (it.entity === "loi")
    return { iconLib: "ion", iconName: "document-text-outline" };
  if (it.entity === "amendement")
    return { iconLib: "mci", iconName: "file-document-edit-outline" };
  if (it.entity === "motion")
    return { iconLib: "mci", iconName: "alert-decagram-outline" };
  if (it.entity === "declaration")
    return { iconLib: "mci", iconName: "bullhorn-outline" };
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

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionLine} />
    </View>
  );
}

/* ─────────────────────────────
   String helpers
   ───────────────────────────── */
function cleanSpaces(s: string) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}
function normApos(s: string) {
  return cleanSpaces(String(s ?? "")).replace(/[’]/g, "'");
}
function isVoteOnAmendement(officialRaw: string): boolean {
  const s = normApos(officialRaw).toLowerCase();
  return (
    s.startsWith("l'amendement") ||
    s.startsWith("amendement") ||
    s.startsWith("sous-amendement") ||
    s.includes("amendement identique")
  );
}
function extractAmendementNumber(officialRaw: string): string {
  const s = normApos(officialRaw);
  const m = s.match(/\b(?:sous-)?amendement\b.*?\bn[°º]\s*(\d+)/i);
  return m?.[1] ? String(m[1]).trim() : "";
}
function extractArticleRef(officialRaw: string): string {
  const s = normApos(officialRaw);
  const m = s.match(
    /\b(?:a|à)\s+l'article\s+([^()]+?)(?:\s+du|\s+de\s+la|\s+\(|\.|$)/i
  );
  if (!m?.[1]) return "";
  return cleanSpaces(m[1]).replace(/\s+et\s+annexe.*$/i, "").trim();
}
function buildAmendementKicker(officialRaw: string): string | null {
  if (!officialRaw) return null;
  if (!isVoteOnAmendement(officialRaw)) return null;

  const num = extractAmendementNumber(officialRaw);
  const art = extractArticleRef(officialRaw);

  const parts: string[] = [];
  parts.push(num ? `Amendement n°${num}` : "Amendement");
  if (art) parts.push(`article ${art}`);

  const out = cleanSpaces(parts.join(" • "));
  return out || null;
}

function baseGroupKey(k: string) {
  const parts = String(k ?? "").split("|");
  return parts.length >= 2 ? `${parts[0]}|${parts[1]}` : k;
}

function secondaryLine(row: GroupedActuRow) {
  const e = row.entity;
  const phase = cleanSpaces((row as any)?.phase_label ?? "");

  if (e === "scrutin") {
    const first: any = (row as any)?.items?.[0] ?? {};
    const officialRaw =
      first?.objet ?? first?.titre ?? first?.title ?? first?.subtitle ?? "";

    const kicker = buildAmendementKicker(officialRaw);
    if (kicker) return `Vote sur ${kicker}`;

    return phase ? `Scrutin — ${phase}` : "Scrutin en séance";
  }

  if (e === "amendement")
    return phase ? `Amendements — ${phase}` : "Modification du texte";
  if (e === "motion") return "Événement parlementaire";
  if (e === "declaration") return "Déclaration politique";

  return phase ? `Avancée — ${phase}` : "Dernières avancées";
}

type StatusKey = "adopted" | "rejected" | "pending";

function pickEventStatusFromItems(items: any[]): StatusKey {
  const first = (items ?? [])[0] ?? null;

  const raw =
    first?.resultat ??
    first?.result ??
    first?.outcome ??
    first?.decision ??
    first?.status ??
    first?.adoption ??
    "";

  const s = String(raw ?? "").toLowerCase();

  if (
    s.includes("rejet") ||
    s.includes("n'a pas adopté") ||
    s.includes("n’a pas adopté") ||
    s.includes("non adopté") ||
    s.includes("repouss") ||
    s.includes("refus")
  ) {
    return "rejected";
  }

  if (s.includes("adopt") || s.includes("approuv") || s.includes("favorable")) {
    return "adopted";
  }

  return "pending";
}

function isBadListTitle(t?: string | null) {
  const s = String(t ?? "").trim();
  if (!s) return true;
  const low = s.toLowerCase();
  if (low === "m" || low === "mme" || low === "m.") return true;
  if (low === "décider" || low === "decider") return true;
  if (low === "décision" || low === "decision") return true;
  if (low === "vote à l’assemblée" || low === "vote a l’assemblee") return true;
  if (low.includes("activité parlementaire")) return true;
  return false;
}
function fallbackTitleForEntity(entity: string) {
  if (entity === "amendement") return "Modifier le texte de loi";
  if (entity === "scrutin") return "Vote au Parlement";
  if (entity === "declaration") return "Déclaration politique";
  if (entity === "motion") return "Événement parlementaire";
  return "Avancée législative";
}

// ✅ NEW: choisir le meilleur titre éditorial quand on fusionne des stories
function isTooGenericEditorialTitle(t?: string | null) {
  const s = cleanSpaces(String(t ?? "")).toLowerCase();
  if (!s) return true;

  // ✅ titres “techniques/génériques” qu’on veut éviter si on a mieux
  if (s.startsWith("loi spéciale")) return true;

  // ✅ IMPORTANT: loi spéciale souvent libellée "projet de loi spéciale..."
  // (avec ou sans accents)
  if (s.startsWith("projet de loi speciale")) return true;
  if (s.startsWith("projet de loi spéciale")) return true;

  if (s.startsWith("vote :")) return true;
  if (s.startsWith("scrutin :")) return true;
  if (s === "loi") return true;

  return false;
}

function pickBestEditorialTitle(a?: string | null, b?: string | null) {
  const A = cleanSpaces(String(a ?? ""));
  const B = cleanSpaces(String(b ?? ""));

  if (!A && !B) return "";
  if (!A) return B;
  if (!B) return A;

  const aBad = isTooGenericEditorialTitle(A);
  const bBad = isTooGenericEditorialTitle(B);

  // ✅ si un seul est “générique”, on prend l’autre
  if (aBad && !bBad) return B;
  if (bBad && !aBad) return A;

  // ✅ sinon, on préfère le plus descriptif (souvent le plus long)
  if (B.length > A.length) return B;
  return A;
}

function pickFirstNonEmpty(...vals: any[]) {
  for (const v of vals) {
    const s = cleanSpaces(String(v ?? ""));
    if (s) return s;
  }
  return "";
}

// ✅ va chercher un “titre éditorial” côté items (pas l’officiel/objet long)
function editorialTitleFromItem(it: any): string {
  if (!it) return "";

  const cand = pickFirstNonEmpty(
    it?.heroTitle,
    it?.hero_title,
    it?.editorialTitle,
    it?.editorial_title,
    it?.display?.title,
    it?.display_title,
    it?.title, // souvent “Permettre à l’État…”
    it?.titre
  );

  // évite de remonter une phrase officielle ultra longue ici
  const low = cand.toLowerCase();
  if (
    cand.length > 90 &&
    (low.startsWith("l'ensemble") ||
      low.startsWith("l'article") ||
      low.startsWith("l’amendement") ||
      low.startsWith("l'amendement"))
  ) {
    return "";
  }

  return cand;
}

function bestEditorialTitleFromItems(items: any[]): string {
  const arr = items ?? [];
  let best = "";

  for (let i = 0; i < Math.min(arr.length, 24); i++) {
    const t = editorialTitleFromItem(arr[i]);
    if (!t) continue;
    best = pickBestEditorialTitle(best, t);
  }

  return cleanSpaces(best);
}

function maybePrefixLoi(entity: string, t: string) {
  if (entity !== "loi") return t;
  const clean = String(t ?? "").trim();
  if (!clean) return clean;
  if (/^loi\s*:?/i.test(clean))
    return clean.replace(/^loi\s*:?/i, "Loi :").trim();
  return `Loi : ${clean}`;
}

type LoiAgg = {
  scrutins: number;
  amendements: number;
  articles: number;
  total: number;
  lastDateMax: string;
};

function formatAggLine(agg?: LoiAgg) {
  if (!agg) return undefined;
  const parts: string[] = [];
  if (agg.scrutins)
    parts.push(`${agg.scrutins} vote${agg.scrutins > 1 ? "s" : ""}`);
  if (agg.amendements)
    parts.push(
      `${agg.amendements} amendement${agg.amendements > 1 ? "s" : ""}`
    );
  if (agg.articles)
    parts.push(`${agg.articles} article${agg.articles > 1 ? "s" : ""}`);
  return parts.join(" • ");
}

function cleanOfficialTitle(raw: string, editorialTitle: string) {
  const t = cleanSpaces(raw);
  if (!t) return "";
  if (cleanSpaces(editorialTitle).toLowerCase() === t.toLowerCase()) return "";
  return t;
}

function normKey(s: any): string {
  return String(s ?? "").trim().toLowerCase();
}

/* ─────────────────────────────
   Canon / regroupement général
   ───────────────────────────── */
function stripPrefixLoiTitle(t: string) {
  return cleanSpaces(String(t ?? "")).replace(/^loi\s*:\s*/i, "");
}

function stripEditorialPrefixes(t: string) {
  let s = cleanSpaces(String(t ?? ""));
  s = s.replace(/^(vote|loi|scrutin)\s*:\s*/i, "");
  return s;
}

function normTitleKey(t: string) {
  const s = stripPrefixLoiTitle(normApos(t)).toLowerCase();
  return cleanSpaces(s);
}

function slugifyFR(input: string) {
  return cleanSpaces(String(input ?? ""))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function extractLawCoreFromSentence(sentence: string): string {
  const s = cleanSpaces(String(sentence ?? ""));
  if (!s) return "";

  const noParen = s.replace(/\s*\([^)]*\)\s*$/g, "").trim();

  let x = noParen.replace(/^l['’]?\s*/i, "l'");
  x = x.replace(/^l['’]ensemble\s+du\s+/i, "");
  x = x.replace(/^l['’]ensemble\s+de\s+la\s+/i, "");
  x = x.replace(/^l['’]article\s+unique\s+du\s+/i, "");
  x = x.replace(/^l['’]article\s+premier\s+du\s+/i, "");
  x = x.replace(/^l['’]article\s+\w+\s+du\s+/i, "");
  x = x.replace(/^l['’]amendement[^,]*\s+à\s+/i, "");
  x = cleanSpaces(x);

  const low = x.toLowerCase();

  const idxPjl = low.indexOf("projet de loi");
  const idxPpl = low.indexOf("proposition de loi");
  const idx = idxPjl >= 0 ? idxPjl : idxPpl;

  if (idx < 0) return "";

  const core = x.slice(idx);
  return cleanSpaces(core);
}

function canonFromSlug(loiIdRaw: string): string | null {
  let s = String(loiIdRaw ?? "").trim();
  if (!s) return null;

  const low = s.toLowerCase();

  if (low.includes("|")) return null;

  if (low.startsWith("loi:")) {
    const inner = s.slice(4).trim();

    if (/\s/.test(inner) || /[()]/.test(inner)) {
      const core = extractLawCoreFromSentence(inner);
      const slug = core ? slugifyFR(core) : "";
      if (
        slug &&
        (slug.includes("projet-de-loi") || slug.includes("proposition-de-loi"))
      ) {
        let out = slug
          .replace(/-de-la-lo$/i, "-de-la-loi")
          .replace(/-de-la-l$/i, "-de-la-loi")
          .replace(/-de-la-$/i, "-de-la-loi");

        out = out.replace(
          /-de-la-loi-organique-du-1er-aout-2001-relative-aux-lois-de-finances.*$/i,
          "-de-la-loi"
        );

        return `loi:${out}`;
      }
      return null;
    }

    return `loi:${inner}`;
  }

  if (low.startsWith("scrutin-public-")) {
    let ss = low
      .replace("scrutin-public-ordinaire-", "scrutin-public-")
      .replace("scrutin-public-solennel-", "scrutin-public-")
      .replace(/-de-la-lo$/i, "-de-la-loi")
      .replace(/-de-la-l$/i, "-de-la-loi")
      .replace(/-de-la-$/i, "-de-la-loi");

    const idxPjl = ss.indexOf("projet-de-loi");
    const idxPpl = ss.indexOf("proposition-de-loi");
    const idx = idxPjl >= 0 ? idxPjl : idxPpl;

    if (idx >= 0) {
      const core = ss.slice(idx);
      return core ? `loi:${core}` : null;
    }

    return null;
  }

  const isSlugLike = !/\s/.test(s) && /^[a-z0-9][a-z0-9\-_:]+$/i.test(s);
  if (isSlugLike) {
    const ss = low
      .replace(/^loi:/i, "")
      .replace("scrutin-public-ordinaire-", "scrutin-public-")
      .replace("scrutin-public-solennel-", "scrutin-public-")
      .replace(/-de-la-lo$/i, "-de-la-loi")
      .replace(/-de-la-l$/i, "-de-la-loi")
      .replace(/-de-la-$/i, "-de-la-loi");

    const idxPjl = ss.indexOf("projet-de-loi");
    const idxPpl = ss.indexOf("proposition-de-loi");
    const idx = idxPjl >= 0 ? idxPjl : idxPpl;

    if (idx >= 0) {
      const core = ss.slice(idx);
      return core ? `loi:${core}` : null;
    }

    return null;
  }

  const core = extractLawCoreFromSentence(s);
  if (core) {
    const slug = slugifyFR(core);

    let out = slug
      .replace(/-de-la-lo$/i, "-de-la-loi")
      .replace(/-de-la-l$/i, "-de-la-loi")
      .replace(/-de-la-$/i, "-de-la-loi");

    out = out.replace(
      /-de-la-loi-organique-du-1er-aout-2001-relative-aux-lois-de-finances.*$/i,
      "-de-la-loi"
    );

    if (out.includes("projet-de-loi") || out.includes("proposition-de-loi")) {
      return `loi:${out}`;
    }
  }

  return null;
}

function isWeakCanon(canonKey: string) {
  const s = String(canonKey ?? "").trim().toLowerCase();
  if (!s) return true;
  return (
    s.startsWith("loi:scrutin-public-") &&
    !s.includes("projet-de-loi") &&
    !s.includes("proposition-de-loi")
  );
}

function getCanonLoiKeyFromRowOrItems(row: any): string {
  const normalizeCanon = (x: any) => {
    const raw = String(x ?? "").trim();
    if (!raw) return "";
    return canonFromSlug(raw) ?? "";
  };

  const direct =
    row?.loi_id_canon || row?.loi_id_canonical || row?.loi_id_canonique || null;
  const directNorm = normalizeCanon(direct);
  if (directNorm) return directNorm;

  const first = (row?.items ?? [])[0] ?? null;
  const itemCanon =
    first?.loi_id_canon ||
    first?.loi_id_canonical ||
    first?.loi_id_canonique ||
    null;
  const itemNorm = normalizeCanon(itemCanon);
  if (itemNorm) return itemNorm;

  const raw = row?.loi_id || first?.loi_id || "";
  const canon = canonFromSlug(String(raw));
  if (canon) return canon;

  const titleTry =
    first?.objet ??
    first?.titre ??
    first?.title ??
    first?.subtitle ??
    row?.display?.longTitle ??
    "";
  const canonFromTitle = canonFromSlug(String(titleTry));
  if (canonFromTitle) return canonFromTitle;

  return "no-loi";
}

function computeStoryKeyFromGroupedRow(g: any): string {
  const canon = cleanSpaces(getCanonLoiKeyFromRowOrItems(g));
  if (canon && canon !== "no-loi" && !isWeakCanon(canon)) return canon;

  const dossier = cleanSpaces(
    String(
      g?.dossier_id ??
        g?.loi_id ??
        g?.items?.[0]?.dossier_id ??
        g?.items?.[0]?.loi_id ??
        ""
    )
  );
  if (dossier) return `dossier:${dossier}`;

  const editorial =
    cleanSpaces(String(g?.display?.title ?? "")) ||
    cleanSpaces(String(g?.items?.[0]?.titre ?? g?.items?.[0]?.objet ?? ""));
  const titleKey = normTitleKey(stripEditorialPrefixes(editorial));
  if (titleKey) return `title:${titleKey}`;

  const k = cleanSpaces(String(g?.groupKey ?? ""));
  return k ? `group:${k}` : "no-story";
}

function canonKeyForRouting(g: any): string {
  const canon = cleanSpaces(getCanonLoiKeyFromRowOrItems(g));
  return canon && canon !== "no-loi" ? canon : "";
}

type StoryAgg = {
  storyKey: string;
  canonKey: string;
  loiKeyRaw: string;
  entity: string;
  groupKey: string;
  dateMax: string;
  items: any[];
  summary: {
    total: number;
    scrutins: number;
    amendements: number;
    articles: number;
  };
  display?: any;
  phase_label?: string;
};

function nint(x: any) {
  const n = Number(x ?? 0);
  return Number.isFinite(n) ? n : 0;
}

type ActuParams = {
  restoreId?: string;
  restoreOffset?: string;
  restoreTs?: string;
};

export default function ActuIndexScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<ActuParams>();

  const listRef = useRef<FlatList<Row> | null>(null);
  const scrollOffsetRef = useRef(0);
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
    dlog("✅ ACTU CREAM (Bulletin parlementaire) MOUNTED");
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

  const rawDBFixed = useMemo(() => {
    return (rawDB ?? []).map((it: any) => {
      const loiId = String(it?.loi_id ?? "").trim();
      return { ...it, loi_id: loiId || null };
    });
  }, [rawDB]);

  const groupedRowsStrict = useMemo(
    () => groupActuItems(rawDBFixed as any),
    [rawDBFixed]
  );

  const groupedRowsCoarse = useMemo(() => {
    const map = new Map<string, any>();

    for (const g of groupedRowsStrict as any[]) {
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
        amendements:
          (prev.summary?.amendements ?? 0) + (g.summary?.amendements ?? 0),
        articles: (prev.summary?.articles ?? 0) + (g.summary?.articles ?? 0),
      };
      prev.dateMax = [prev.dateMax, g.dateMax].filter(Boolean).sort().pop();
    }

    const out = Array.from(map.values());

    out.forEach((gg) => {
      gg.items.sort((a: any, b: any) =>
        String(b?.date ?? "").localeCompare(String(a?.date ?? ""))
      );

      const realTotal = gg.items.length;
      gg.summary = gg.summary ?? {};
      gg.summary.total = Number(gg.summary.total ?? realTotal) || realTotal;

      if (
        ACTU_FEED_MAX_ITEMS_PER_STORY > 0 &&
        gg.items.length > ACTU_FEED_MAX_ITEMS_PER_STORY
      ) {
        gg.items = gg.items.slice(0, ACTU_FEED_MAX_ITEMS_PER_STORY);
      }
    });

    out.sort((a, b) =>
      String(b?.dateMax ?? "").localeCompare(String(a?.dateMax ?? ""))
    );
    return out;
  }, [groupedRowsStrict]);

  // (gardé pour debug éventuel)
  const loiAggMap = useMemo(() => {
    const m = new Map<string, LoiAgg>();

    for (const g of groupedRowsCoarse as any[]) {
      const storyKey = computeStoryKeyFromGroupedRow(g);
      if (!storyKey || storyKey === "no-story") continue;

      const prev =
        m.get(storyKey) ??
        ({
          scrutins: 0,
          amendements: 0,
          articles: 0,
          total: 0,
          lastDateMax: "",
        } as LoiAgg);

      prev.scrutins += nint(g.summary?.scrutins);
      prev.amendements += nint(g.summary?.amendements);
      prev.articles += nint(g.summary?.articles);
      prev.total += nint(g.summary?.total);

      const d = String((g as any).dateMax ?? "");
      if (d && d > prev.lastDateMax) prev.lastDateMax = d;

      m.set(storyKey, prev);
    }

    return m;
  }, [groupedRowsCoarse]);

  const groupedStories = useMemo(() => {
    const map = new Map<string, StoryAgg>();

    for (const g of groupedRowsCoarse as any[]) {
      const storyKey = computeStoryKeyFromGroupedRow(g);
      if (!storyKey || storyKey === "no-story") continue;

      const prev = map.get(storyKey);
      const gDateMax = String(g?.dateMax ?? "");
      const gSummary = {
        total: nint(g.summary?.total ?? (g.items?.length ?? 0)),
        scrutins: nint(g.summary?.scrutins),
        amendements: nint(g.summary?.amendements),
        articles: nint(g.summary?.articles),
      };

      const routeCanon = canonKeyForRouting(g);
      const canonKey = routeCanon || "";

      if (!prev) {
        map.set(storyKey, {
          storyKey,
          canonKey,
          loiKeyRaw: String(g?.loi_id ?? ""),
          entity: String(g.entity ?? ""),
          groupKey: String(g.groupKey ?? canonKey ?? storyKey),
          dateMax: gDateMax,
          items: [...(g.items ?? [])],
          summary: { ...gSummary },
          display: (g as any)?.display,
          phase_label: (g as any)?.phase_label,
        });
        continue;
      }

      prev.items.push(...(g.items ?? []));
      prev.summary.total += gSummary.total;
      prev.summary.scrutins += gSummary.scrutins;
      prev.summary.amendements += gSummary.amendements;
      prev.summary.articles += gSummary.articles;

      if (gDateMax && (!prev.dateMax || gDateMax > prev.dateMax)) {
        prev.dateMax = gDateMax;
        prev.groupKey = String(g.groupKey ?? prev.groupKey);
        prev.entity = String(g.entity ?? prev.entity);
        prev.display = (g as any)?.display ?? prev.display;
        prev.phase_label = (g as any)?.phase_label ?? prev.phase_label;
        prev.loiKeyRaw = String(g?.loi_id ?? prev.loiKeyRaw);

        const maybeCanon = canonKeyForRouting(g);
        if (maybeCanon) prev.canonKey = maybeCanon;
      }

      if (
        ACTU_FEED_MAX_ITEMS_PER_STORY > 0 &&
        prev.items.length > ACTU_FEED_MAX_ITEMS_PER_STORY
      ) {
        prev.items.sort((a: any, b: any) =>
          String(b?.date ?? "").localeCompare(String(a?.date ?? ""))
        );
        prev.items = prev.items.slice(0, ACTU_FEED_MAX_ITEMS_PER_STORY);
      }

      map.set(storyKey, prev);
    }

    let out = Array.from(map.values());
    out.sort((a, b) =>
      String(b?.dateMax ?? "").localeCompare(String(a?.dateMax ?? ""))
    );

    // ✅ DEDUPE FINAL (générique): même titre éditorial => 1 seule story
    const bestByTitle = new Map<string, StoryAgg>();

    const scoreCanon = (ck: string) => {
      const s = String(ck ?? "");
      if (!s) return 0;
      if (s.startsWith("loi:projet-de-loi")) return 3;
      if (s.startsWith("loi:proposition-de-loi")) return 3;
      if (s.startsWith("loi:")) return 2;
      return 0;
    };

    const titleKeyOf = (s: StoryAgg) => {
      const display = cleanSpaces(String((s as any)?.display?.title ?? ""));
      const first = (s.items?.[0] as any) ?? {};
      const fallback = cleanSpaces(String(first?.titre ?? first?.objet ?? ""));
      const seed = display || fallback;
      return normTitleKey(stripEditorialPrefixes(seed));
    };

    for (const s of out) {
      const tk = titleKeyOf(s);
      if (!tk) {
        bestByTitle.set(`${s.storyKey}::${Math.random()}`, s);
        continue;
      }

      const currentPrev = bestByTitle.get(tk);
      if (!currentPrev) {
        bestByTitle.set(tk, s);
        continue;
      }

      const a = scoreCanon(currentPrev.canonKey);
      const b = scoreCanon(s.canonKey);

      // 🧯 anti-faux-positifs: si les deux sont "très forts", on évite de fusionner
      if (a >= 3 && b >= 3) {
        bestByTitle.set(`${tk}::${s.storyKey}`, s);
        continue;
      }

      let keep = currentPrev;
      let drop = s;

      if (b > a) {
        keep = s;
        drop = currentPrev;
      } else if (b === a) {
        const dk = String(keep?.dateMax ?? "");
        const dd = String(drop?.dateMax ?? "");
        if (dd > dk) {
          keep = s;
          drop = currentPrev;
        }
      }

      keep.items = [...(keep.items ?? []), ...(drop.items ?? [])];
      keep.items.sort((x: any, y: any) =>
        String(y?.date ?? "").localeCompare(String(x?.date ?? ""))
      );
      if (
        ACTU_FEED_MAX_ITEMS_PER_STORY > 0 &&
        keep.items.length > ACTU_FEED_MAX_ITEMS_PER_STORY
      ) {
        keep.items = keep.items.slice(0, ACTU_FEED_MAX_ITEMS_PER_STORY);
      }

      keep.summary.total = nint(keep.summary.total) + nint(drop.summary.total);
      keep.summary.scrutins =
        nint(keep.summary.scrutins) + nint(drop.summary.scrutins);
      keep.summary.amendements =
        nint(keep.summary.amendements) + nint(drop.summary.amendements);
      keep.summary.articles =
        nint(keep.summary.articles) + nint(drop.summary.articles);

      if (drop.dateMax && (!keep.dateMax || drop.dateMax > keep.dateMax)) {
        keep.dateMax = drop.dateMax;
      }

      if (
        (!keep.canonKey || scoreCanon(keep.canonKey) === 0) &&
        drop.canonKey
      ) {
        keep.canonKey = drop.canonKey;
      }

      // ✅ NEW: meilleur titre (display + items)
      const keepTitle = cleanSpaces(String((keep as any)?.display?.title ?? ""));
      const dropTitle = cleanSpaces(String((drop as any)?.display?.title ?? ""));

      const keepItemsTitle = bestEditorialTitleFromItems(keep.items ?? []);
      const dropItemsTitle = bestEditorialTitleFromItems(drop.items ?? []);

      const bestTitle = pickBestEditorialTitle(
        pickBestEditorialTitle(keepTitle, dropTitle),
        pickBestEditorialTitle(keepItemsTitle, dropItemsTitle)
      );

      if (bestTitle) {
        keep.display = keep.display ?? {};
        keep.display.title = bestTitle;
      }

      // ✅ IMPORTANT: on re-set dans la map
      bestByTitle.set(tk, keep);
    }

    out = Array.from(bestByTitle.values());
    out.sort((a, b) =>
      String(b?.dateMax ?? "").localeCompare(String(a?.dateMax ?? ""))
    );
    return out;
  }, [groupedRowsCoarse]);

  useEffect(() => {
    dlog(
      "[ACTU][STORIES]",
      groupedStories.slice(0, 15).map((s) => ({
        storyKey: s.storyKey,
        canonKey: s.canonKey,
        title: (s as any)?.display?.title,
        dateMax: s.dateMax,
        count: s.items?.length,
      }))
    );
  }, [groupedStories]);

  const rawUI: (ActuItemUI & {
    why?: string;
    deltaLine?: string;
    badge?: string;
  })[] = useMemo(() => {
    return groupedStories.map((story) => {
      const items = story.items ?? [];
      const first = items[0];

      const firstAny: any = first ?? {};
      const firstLoiIdSlug = String(firstAny?.loi_id ?? "").trim();
      const firstDossierId = String(firstAny?.dossier_id ?? "").trim();

      const baseDB: ActuItemDB =
        (first as any) ??
        ({
          id: story.groupKey,
          entity: story.entity,
          date: story.dateMax,
        } as any);

      const { iconLib, iconName } = pickIcon(baseDB);

      const displayTitle = cleanSpaces((story as any)?.display?.title ?? "");

      // ✅ NEW: on tente de récupérer un meilleur titre depuis les items
      const itemsBestTitle = bestEditorialTitleFromItems(items);

      // ✅ on choisit le meilleur entre display.title et un titre trouvé côté items
      let editorial = pickBestEditorialTitle(displayTitle, itemsBestTitle);

      if (isBadListTitle(editorial)) {
        editorial = fallbackTitleForEntity(String(story.entity));
      }

      const editorialTitle = maybePrefixLoi(String(story.entity), editorial);

      const officialRaw =
        (first as any)?.objet ??
        (first as any)?.titre ??
        (first as any)?.title ??
        (first as any)?.subtitle ??
        "";

      const longTitleFromGrouping = cleanSpaces(
        (story as any)?.display?.longTitle ?? ""
      );
      const longSeed = longTitleFromGrouping || officialRaw;

      const longTitleClean = cleanOfficialTitle(longSeed, editorialTitle);
      const longTitle = longTitleClean ? longTitleClean : undefined;

      const statsLine = formatAggLine({
        scrutins: nint(story.summary?.scrutins),
        amendements: nint(story.summary?.amendements),
        articles: nint(story.summary?.articles),
        total: nint(story.summary?.total),
        lastDateMax: String(story.dateMax ?? ""),
      });

      const tag = (story as any).display?.tag || pickTag(baseDB);

      const toneFromDisplay = (story as any)?.display?.tone;
      const tone: Tone = (toneFromDisplay as Tone) || pickTone(baseDB);

      const statusKey = pickEventStatusFromItems(items);

      return {
        id: `story:${String(story.storyKey)}`,

        groupKey: story.groupKey,
        canonKey: story.canonKey,
        loiKeyRaw: story.loiKeyRaw,

        loi_id_canon: story.canonKey || null,

        // NOTE: clé DB timeline: on préfère le slug DB, sinon canon
        loi_id_scrutin: firstLoiIdSlug || story.canonKey || null,

        dossier_id: firstDossierId || story.loiKeyRaw || null,

        numero_scrutin: (firstAny as any)?.numero_scrutin ?? null,

        dateISO: toISO(story.dateMax),

        title: editorialTitle,
        longTitle,
        subtitle: secondaryLine(story as any),

        tone,
        iconLib,
        iconName,
        tag,

        statsLine,
        statusKey,

        groupCount: nint(story.summary?.total) || items.length || 1,
        previewCount: items.length,
      } as any;
    });
  }, [groupedStories]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rawUI;
    return rawUI.filter((x) =>
      (`${x.title} ${x.subtitle} ${(x as any).longTitle ?? ""}`)
        .toLowerCase()
        .includes(s)
    );
  }, [q, rawUI]);

  const rows: Row[] = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => b.dateISO.localeCompare(a.dateISO));

    const today = sorted.filter((x) => daysAgo(x.dateISO) <= 0);
    const une = [...today].sort((a, b) => {
      const va = Number((a as any).groupCount ?? 0);
      const vb = Number((b as any).groupCount ?? 0);
      if (vb !== va) return vb - va;
      return b.dateISO.localeCompare(a.dateISO);
    });

    const unePick = une.slice(0, 1);
    const uneIds = new Set(unePick.map((x) => x.id));
    const rest = sorted.filter((x) => !uneIds.has(x.id));

    const out: Row[] = [];

    if (unePick.length) {
      out.push({ kind: "header", title: "UNE DU JOUR" });
      unePick.forEach((it) => out.push({ kind: "item", item: it }));
    }

    let lastBucket = "";
    for (const it of rest) {
      const b = bucketLabel(it.dateISO);
      if (b !== lastBucket) {
        out.push({ kind: "header", title: b });
        lastBucket = b;
      }
      out.push({ kind: "item", item: it });
    }

    return out;
  }, [filtered]);

  useFocusEffect(
    useCallback(() => {
      const restoreId = String(params?.restoreId ?? "").trim();
      const restoreOffset = Number(params?.restoreOffset ?? "");
      const hasOffset = Number.isFinite(restoreOffset) && restoreOffset >= 0;

      if (!restoreId && !hasOffset) return;

      const task = InteractionManager.runAfterInteractions(() => {
        requestAnimationFrame(() => {
          if (restoreId) {
            const idx = rows.findIndex(
              (r) =>
                r.kind === "item" &&
                String((r as any).item?.id ?? "") === restoreId
            );

            if (idx >= 0) {
              try {
                listRef.current?.scrollToIndex({
                  index: idx,
                  animated: false,
                  viewPosition: 0.25,
                });
                router.replace("/actu" as any);
                return;
              } catch (e) {
                dlog("[ACTU][RESTORE] scrollToIndex failed", e);
              }
            }
          }

          if (hasOffset) {
            listRef.current?.scrollToOffset({
              offset: restoreOffset,
              animated: false,
            });
            router.replace("/actu" as any);
          } else {
            router.replace("/actu" as any);
          }
        });
      });

      return () => task.cancel();
    }, [params?.restoreId, params?.restoreOffset, rows, router])
  );

  /**
   * ✅ ROUTING SAFE (loi-first)
   */
  const openGroup = useCallback(
    (ui: ActuItemUI) => {
      const canonKey = String((ui as any)?.canonKey ?? "").trim();
      const groupKey = String((ui as any)?.groupKey ?? ui.id ?? "").trim();

      const restoreId = String((ui as any)?.id ?? "").trim();
      const restoreOffset = String(scrollOffsetRef.current ?? 0);

      if (canonKey && canonKey.startsWith("loi:")) {
        const seedScrutin = String((ui as any)?.numero_scrutin ?? "").trim();

        const dbLoiId =
          String((ui as any)?.loi_id_scrutin ?? "").trim() ||
          String((ui as any)?.dossier_id ?? "").trim() ||
          canonKey;

        const heroTitle = String((ui as any)?.title ?? "")
  .replace(/^loi\s*:\s*/i, "")
  .trim();

        dlog("[ACTU][OPEN] loi-first", {
          canonKey,
          dbLoiId,
          heroTitle,
          seedScrutin,
          restoreId,
          restoreOffset,
        });

// ✅ RÈGLE PRODUIT (cas spécial) : Loi spéciale (article 45 LOLF)
// On force le titre citoyen pour éviter le titre technique.
const canonKeyLower = String(canonKey ?? "").toLowerCase();
const isLoiSpeciale =
  canonKeyLower.includes("loi-speciale") ||
  canonKeyLower.includes("article-45") ||
  canonKeyLower.includes("lolf");

const heroTitleLocked = isLoiSpeciale
  ? "Permettre à l’État de fonctionner"
  : heroTitle;


        router.push({
          pathname: "/lois/[id]",
          params: {
            id: dbLoiId,
            canonKey,
            fromKey: "actu",
            fromLabel: heroTitleLocked || undefined,
            heroTitle: heroTitleLocked || undefined,
            restoreId,
            restoreOffset,
            seedScrutin: seedScrutin || undefined,
          },
        } as any);

        return;
      }

      if (!groupKey) return;

      const target = `/actu/group/${encodeURIComponent(groupKey)}`;
      dlog("[ACTU][OPEN] group fallback", { groupKey, target });


      router.push({
        pathname: target,
        params: {
          fromKey: "actu",
          fromLabel: String((ui as any)?.title ?? ""),
          restoreId,
          restoreOffset,
        },
      } as any);
    },
    [router]
  );

  const renderRow = ({ item }: { item: Row }) => {
    if (item.kind === "header") return <SectionHeader title={item.title} />;
    return (
      <ActuBulletinRow
        item={item.item as any}
        onPress={() => openGroup(item.item as any)}
      />
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View style={styles.hTitleRow}>
          <Text style={styles.h1}>Bulletin parlementaire</Text>

          {DEBUG_ACTU ? (
            <View style={styles.debugPill}>
              <Ionicons name="bug-outline" size={14} color={INK} />
              <Text style={styles.debugPillText}>DEBUG</Text>
            </View>
          ) : (
            <View style={styles.hBadge}>
              <Ionicons name="checkmark-circle-outline" size={14} color={INK} />
              <Text style={styles.hBadgeText}>Vérifiable</Text>
            </View>
          )}
        </View>

        <Text style={styles.h2}>Décisions, votes et étapes — avec preuves.</Text>

        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Rechercher…"
          placeholderTextColor={INK_SOFT}
          style={styles.search}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      {loading ? (
        <View style={{ padding: 16, gap: 10 }}>
          <ActivityIndicator />
          <Text style={{ color: INK_SOFT }}>Chargement…</Text>
        </View>
      ) : error ? (
        <View style={{ padding: 16, gap: 8 }}>
          <Text style={{ color: INK, fontWeight: "900" }}>
            Impossible de charger
          </Text>
          <Text style={{ color: INK_SOFT }}>{error}</Text>
          <Pressable onPress={onRefresh} style={{ marginTop: 8 }}>
            <Text style={{ color: INK, fontWeight: "900" }}>Réessayer →</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          ref={(r) => {
            listRef.current = r as any;
          }}
          data={rows}
          keyExtractor={(r, idx) =>
            r.kind === "header" ? `h-${r.title}-${idx}` : `i-${r.item.id}`
          }
          renderItem={renderRow}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          contentContainerStyle={[styles.listContent, { paddingBottom: 0 }]}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListEmptyComponent={
            <View style={{ padding: 16 }}>
              <Text style={{ color: INK_SOFT }}>
                Aucun élément ne correspond à ta recherche.
              </Text>
            </View>
          }
          onScroll={(e) => {
            scrollOffsetRef.current = e?.nativeEvent?.contentOffset?.y ?? 0;
          }}
          scrollEventThrottle={16}
          onScrollToIndexFailed={(info) => {
            dlog("[ACTU][RESTORE] onScrollToIndexFailed", info);
            const approx = Math.max(
              0,
              (info?.averageItemLength ?? 80) * (info?.index ?? 0)
            );
            listRef.current?.scrollToOffset({ offset: approx, animated: false });
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PAPER },

  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, gap: 8 },
  hTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  h1: { color: INK, fontSize: 20, fontWeight: "900", letterSpacing: 0.2 },
  h2: { color: INK_SOFT, fontSize: 12, lineHeight: 16, fontWeight: "800" },

  search: {
    backgroundColor: PAPER_CARD,
    borderColor: LINE,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: INK,
    fontSize: 14,
    fontWeight: "800",
  },

  debugPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: PAPER_CARD,
    borderWidth: 1,
    borderColor: LINE,
  },
  debugPillText: {
    color: INK,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.6,
  },

  hBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: PAPER_CARD,
    borderWidth: 1,
    borderColor: LINE,
  },
  hBadgeText: { color: INK, fontSize: 12, fontWeight: "900" },

  sectionHeader: { paddingTop: 12, paddingBottom: 6, gap: 8 },
  sectionTitle: {
    color: INK_SOFT,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  sectionLine: { height: 1, backgroundColor: LINE },

  listContent: {
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 0,
  },

  sep: { height: 6 },
});
