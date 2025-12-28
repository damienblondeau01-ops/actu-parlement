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

/** =========================
 *  ACTU CAP (Option A)
 *  - Cap la preview d'items dans le FEED uniquement
 *  - Conserve le total réel dans summary.total
 *  ========================= */
const ACTU_FEED_MAX_ITEMS_PER_STORY = 12;

/** =========================
 *  MINI MODE DEBUG (ACTU)
 *  - Active via env: EXPO_PUBLIC_ACTU_DEBUG=1
 * ========================= */
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
  return Number.isFinite(t) ? new Date(t).toISOString() : new Date().toISOString();
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
  | { kind: "item"; item: ActuItemUI & { why?: string; deltaLine?: string; badge?: string } };

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
  if (it.entity === "loi") return { iconLib: "ion", iconName: "document-text-outline" };
  if (it.entity === "amendement")
    return { iconLib: "mci", iconName: "file-document-edit-outline" };
  if (it.entity === "motion") return { iconLib: "mci", iconName: "alert-decagram-outline" };
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
  const m = s.match(/\b(?:a|à)\s+l'article\s+([^()]+?)(?:\s+du|\s+de\s+la|\s+\(|\.|$)/i);
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

/** ✅ Clé "coarse" : type + loiKey (sans date/phase) */
function baseGroupKey(k: string) {
  const parts = String(k ?? "").split("|");
  return parts.length >= 2 ? `${parts[0]}|${parts[1]}` : k;
}

function secondaryLine(row: GroupedActuRow) {
  const e = row.entity;
  const phase = cleanSpaces((row as any)?.phase_label ?? "");

  if (e === "scrutin") {
    const first: any = (row as any)?.items?.[0] ?? {};
    const officialRaw = first?.objet ?? first?.titre ?? first?.title ?? first?.subtitle ?? "";

    const kicker = buildAmendementKicker(officialRaw);
    if (kicker) return `Vote sur ${kicker}`;

    return phase ? `Scrutin — ${phase}` : "Scrutin en séance";
  }

  if (e === "amendement") return phase ? `Amendements — ${phase}` : "Modification du texte";
  if (e === "motion") return "Événement parlementaire";
  if (e === "declaration") return "Déclaration politique";

  return phase ? `Avancée — ${phase}` : "Dernières avancées";
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
function maybePrefixLoi(entity: string, t: string) {
  if (entity !== "loi") return t;
  const clean = String(t ?? "").trim();
  if (!clean) return clean;
  if (/^loi\s*:?/i.test(clean)) return clean.replace(/^loi\s*:?/i, "Loi :").trim();
  return `Loi : ${clean}`;
}

/** ✅ Agrégation par loiKey (canon) */
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
  if (agg.scrutins) parts.push(`${agg.scrutins} vote${agg.scrutins > 1 ? "s" : ""}`);
  if (agg.amendements)
    parts.push(`${agg.amendements} amendement${agg.amendements > 1 ? "s" : ""}`);
  if (agg.articles) parts.push(`${agg.articles} article${agg.articles > 1 ? "s" : ""}`);
  return parts.join(" • ");
}

function cleanOfficialTitle(raw: string, editorialTitle: string) {
  const t = cleanSpaces(raw);
  if (!t) return "";
  if (cleanSpaces(editorialTitle).toLowerCase() === t.toLowerCase()) return "";
  return t;
}

function normalizeLoiIdForLogs(v: any): string {
  const s = String(v ?? "").trim();
  return s ? s : "no-loi";
}

/* ─────────────────────────────
   ✅ Canonicalisation loi_id (PROD)
   Objectif: fusionner ordinaire/solennel/variantes scrutin-* sur la même loi.
   Priorité:
   1) loi_id_canon si présent (row ou item)
   2) noyau à partir de "projet-de-loi" / "proposition-de-loi"
   3) fallback = loi_id brut
   ───────────────────────────── */
function normKey(s: any): string {
  return String(s ?? "").trim().toLowerCase();
}

function canonFromSlug(loiIdRaw: string): string | null {
  let s = normKey(loiIdRaw);
  if (!s) return null;

  // ✅ Fix troncatures fréquentes observées : "...-de-la-lo" => "...-de-la-loi"
  // (tu peux en ajouter d'autres si tu repères des patterns)
  s = s
    .replace(/-de-la-lo$/i, "-de-la-loi")
    .replace(/-de-la-l$/i, "-de-la-loi") // ultra défensif
    .replace(/-de-la-$/i, "-de-la-loi"); // ultra défensif

  // Si on trouve le noyau "projet-de-loi..." ou "proposition-de-loi..."
  const idxPjl = s.indexOf("projet-de-loi");
  const idxPpl = s.indexOf("proposition-de-loi");
  const idx = idxPjl >= 0 ? idxPjl : idxPpl;

  if (idx >= 0) {
    let core = s.slice(idx);

    // ✅ applique aussi le fix sur le core (au cas où)
    core = core
      .replace(/-de-la-lo$/i, "-de-la-loi")
      .replace(/-de-la-l$/i, "-de-la-loi")
      .replace(/-de-la-$/i, "-de-la-loi");

    return core ? `loi:${core}` : null;
  }

  // sinon, on retire quelques variantes fréquentes "scrutin-public-(ordinaire|solennel)-"
  const simplified = s
    .replace("scrutin-public-ordinaire-", "scrutin-public-")
    .replace("scrutin-public-solennel-", "scrutin-public-");

  return simplified ? `loi:${simplified}` : null;
}


function getCanonLoiKeyFromRowOrItems(row: any): string {
  const direct =
    row?.loi_id_canon ||
    row?.loi_id_canonical ||
    row?.loi_id_canonique ||
    row?.loi_id_canonized ||
    null;

  if (direct) return String(direct);

  // dans les items
  const first = (row?.items ?? [])[0] ?? null;
  const itemCanon =
    first?.loi_id_canon ||
    first?.loi_id_canonical ||
    first?.loi_id_canonique ||
    first?.loi_id_canonized ||
    null;

  if (itemCanon) return String(itemCanon);

  const raw = row?.loi_id || first?.loi_id || row?.groupKey || "";
  return canonFromSlug(String(raw)) ?? String(raw ?? "no-loi");
}

/* ─────────────────────────────
   Regroupement intelligent par loi (anti doublons)
   ───────────────────────────── */
type StoryAgg = {
  canonKey: string;
  loiKeyRaw: string;
  entity: string;
  groupKey: string; // route
  dateMax: string;
  items: any[];
  summary: { total: number; scrutins: number; amendements: number; articles: number };
  display?: any;
  phase_label?: string;
};

function nint(x: any) {
  const n = Number(x ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function pickBadgeForStory(
  title: string,
  agg: LoiAgg
): "CLÉ" | "STRUCTURANT" | "SYMBOLIQUE" | undefined {
  const t = cleanSpaces(title).toLowerCase();

  if (
    t.includes("49-3") ||
    t.includes("cmp") ||
    t.includes("adoption définitive") ||
    t.includes("motion de censure") ||
    t.includes("constitution")
  ) {
    return "CLÉ";
  }

  if (
    agg.total >= 80 ||
    agg.scrutins >= 5 ||
    t.includes("plf") ||
    t.includes("loi de finances") ||
    t.includes("retrait") ||
    t.includes("immigration") ||
    t.includes("budget")
  ) {
    return "STRUCTURANT";
  }

  if (
    agg.total <= 15 &&
    (t.includes("reparation") ||
      t.includes("mémoire") ||
      t.includes("memoire") ||
      t.includes("egalite") ||
      t.includes("droits") ||
      t.includes("hommage"))
  ) {
    return "SYMBOLIQUE";
  }

  return undefined;
}

/** -------------------------
 * DEBUG helpers (inchangés)
 * ------------------------- */
function short(s: any, max = 90) {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length <= max ? t : t.slice(0, max) + "…";
}
function pickExampleTitle(it: any): string {
  const raw = String(it?.title ?? it?.objet ?? it?.titre ?? it?.subtitle ?? "").trim();
  return raw ? short(raw, 90) : "";
}
function isNoLoiId(loiId: string) {
  const s = String(loiId ?? "").trim();
  return !s || s === "no-loi";
}
function isEventIdLike(loiId: string) {
  const s = String(loiId ?? "").trim();
  if (!s) return false;
  if (/^scrutin-\d+$/i.test(s)) return true;
  if (/^motion-\d+$/i.test(s)) return true;
  if (/^declaration-\d+$/i.test(s)) return true;
  return false;
}
function logSuspiciousRatioInRawDB(rawDB: ActuItemDB[]) {
  const total = rawDB?.length ?? 0;
  if (!total) return;

  let eventLike = 0;
  let noLoi = 0;
  let ok = 0;

  const byPrefix = { scrutin: 0, motion: 0, declaration: 0 };

  const eventExamples: { loiId: string; ex: string }[] = [];
  const okExamples: { loiId: string; ex: string }[] = [];
  const noLoiExamples: { loiId: string; ex: string }[] = [];

  for (const it of rawDB as any[]) {
    const loiId = normalizeLoiIdForLogs((it as any)?.loi_id);
    const ex = pickExampleTitle(it);

    if (isNoLoiId(loiId)) {
      noLoi += 1;
      if (noLoiExamples.length < 2) noLoiExamples.push({ loiId, ex });
      continue;
    }

    if (isEventIdLike(loiId)) {
      eventLike += 1;
      if (loiId.startsWith("scrutin-")) byPrefix.scrutin += 1;
      else if (loiId.startsWith("motion-")) byPrefix.motion += 1;
      else if (loiId.startsWith("declaration-")) byPrefix.declaration += 1;

      if (eventExamples.length < 2) eventExamples.push({ loiId, ex });
      continue;
    }

    ok += 1;
    if (okExamples.length < 2) okExamples.push({ loiId, ex });
  }

  const pct = (n: number) => (total ? Math.round((n / total) * 1000) / 10 : 0);

  dlog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  dlog(
    `[ACTU] ratio loi_id (rawDB): eventIdLike=${pct(eventLike)}% (${eventLike}/${total}) | no-loi=${pct(
      noLoi
    )}% (${noLoi}/${total}) | ok=${pct(ok)}% (${ok}/${total})`
  );
  dlog(
    `[ACTU] eventIdLike breakdown: scrutin=${byPrefix.scrutin}, motion=${byPrefix.motion}, declaration=${byPrefix.declaration}`
  );

  if (eventExamples.length) {
    dlog(
      `[ACTU] exemples eventIdLike: ${eventExamples
        .map((x) => `${short(x.loiId, 70)} | ex="${x.ex}"`)
        .join("  ||  ")}`
    );
  }
  if (noLoiExamples.length) {
    dlog(
      `[ACTU] exemples no-loi: ${noLoiExamples
        .map((x) => `${short(x.loiId, 70)} | ex="${x.ex}"`)
        .join("  ||  ")}`
    );
  }
  if (okExamples.length) {
    dlog(
      `[ACTU] exemples ok: ${okExamples
        .map((x) => `${short(x.loiId, 70)} | ex="${x.ex}"`)
        .join("  ||  ")}`
    );
  }
  dlog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}
function logTopLoiIdInRawDB(rawDB: ActuItemDB[], topN = 12) {
  const total = rawDB?.length ?? 0;
  if (!total) return;

  const map = new Map<string, { count: number; exTitle: string }>();

  for (const it of rawDB as any[]) {
    const loiId = normalizeLoiIdForLogs((it as any)?.loi_id);
    const prev = map.get(loiId);
    if (!prev) map.set(loiId, { count: 1, exTitle: pickExampleTitle(it) });
    else {
      prev.count += 1;
      if (!prev.exTitle) prev.exTitle = pickExampleTitle(it);
      map.set(loiId, prev);
    }
  }

  const top = [...map.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, topN);

  dlog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  dlog(`[ACTU] TOP loi_id dans rawDB (nb items + ex "titre")`);
  top.forEach(([loiId, meta], i) => {
    const flag = isEventIdLike(loiId) ? "⚠️ " : "";
    const ex = meta.exTitle ? ` | ex="${meta.exTitle}"` : "";
    dlog(`#${i + 1} ${flag}${meta.count} | ${short(loiId, 110)}${ex}`);
  });
  dlog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}
function logTopLoiIdInGroups(groups: any[], topN = 12) {
  const total = groups?.length ?? 0;
  if (!total) return;

  const counts = new Map<string, number>();
  for (const g of groups as any[]) {
    const loiId = normalizeLoiIdForLogs(g?.loi_id);
    const n = Number(g?.summary?.total ?? g?.items?.length ?? 0);
    if (!n) continue;
    counts.set(loiId, (counts.get(loiId) ?? 0) + n);
  }

  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN);

  dlog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  dlog("[ACTU] TOP loi_id dans groupedRows (COARSE) (somme totals)");
  top.forEach(([k, n], i) => dlog(`#${i + 1} ${n} | ${short(k, 110)}`));
  dlog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}
function logNoLoiSample(rawDB: ActuItemDB[], maxRows = 12) {
  const total = rawDB?.length ?? 0;
  if (!total) return;

  const no = (rawDB ?? []).filter((x: any) => !x?.loi_id || x.loi_id === "no-loi");
  dlog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  dlog(`[ACTU] no-loi sample (${no.length})`);
  no.slice(0, maxRows).forEach((it: any, i: number) => {
    dlog(
      `#${i + 1} entity=${it.entity} id=${short(it.id, 80)} | titre="${short(
        it.title ?? it.objet ?? it.titre ?? "",
        110
      )}"`
    );
  });
  dlog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
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

  /**
   * ✅ FIX: fallback loi_id -> id (slug stable)
   * - évite "no-loi"
   */
  const rawDBFixed = useMemo(() => {
    return (rawDB ?? []).map((it: any) => {
      const loiId = (it?.loi_id ?? "").toString().trim();
      if (loiId) return it;
      if (it?.id) return { ...it, loi_id: String(it.id) };
      return it;
    });
  }, [rawDB]);

  /** STRICT (tel que groupActuItems) */
  const groupedRowsStrict = useMemo(() => groupActuItems(rawDBFixed as any), [rawDBFixed]);

  /** ✅ COARSE (stable, pour l’UX Actu) */
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
        amendements: (prev.summary?.amendements ?? 0) + (g.summary?.amendements ?? 0),
        articles: (prev.summary?.articles ?? 0) + (g.summary?.articles ?? 0),
      };

      prev.dateMax = [prev.dateMax, g.dateMax].filter(Boolean).sort().pop();
    }

    const out = Array.from(map.values());

    out.forEach((gg) => {
      gg.items.sort((a: any, b: any) => String(b?.date ?? "").localeCompare(String(a?.date ?? "")));

      // 1) truth
      const realTotal = gg.items.length;
      gg.summary = gg.summary ?? {};
      gg.summary.total = Number(gg.summary.total ?? realTotal) || realTotal;

      // 2) cap preview
      if (ACTU_FEED_MAX_ITEMS_PER_STORY > 0 && gg.items.length > ACTU_FEED_MAX_ITEMS_PER_STORY) {
        gg.items = gg.items.slice(0, ACTU_FEED_MAX_ITEMS_PER_STORY);
      }
    });

    out.sort((a, b) => String(b?.dateMax ?? "").localeCompare(String(a?.dateMax ?? "")));
    return out;
  }, [groupedRowsStrict]);

  /** ✅ loiAggMap basé sur la clé CANON (anti ordinaire/solennel) */
  const loiAggMap = useMemo(() => {
    const m = new Map<string, LoiAgg>();

    for (const g of groupedRowsCoarse as any[]) {
      const canonKey = getCanonLoiKeyFromRowOrItems(g);
      if (!canonKey || canonKey === "no-loi") continue;

      const prev =
        m.get(canonKey) ??
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

      m.set(canonKey, prev);
    }

    return m;
  }, [groupedRowsCoarse]);

  /**
   * ✅ Regroupement intelligent anti-doublons
   * - 1 story par CANON key (même loi, même si 2 loi_id différents)
   */
  const groupedStories = useMemo(() => {
    const map = new Map<string, StoryAgg>();

    for (const g of groupedRowsCoarse as any[]) {
      const canonKey = getCanonLoiKeyFromRowOrItems(g);
      if (!canonKey || canonKey === "no-loi") continue;

      const prev = map.get(canonKey);
      const gDateMax = String(g?.dateMax ?? "");
      const gSummary = {
        total: nint(g.summary?.total ?? (g.items?.length ?? 0)),
        scrutins: nint(g.summary?.scrutins),
        amendements: nint(g.summary?.amendements),
        articles: nint(g.summary?.articles),
      };

      if (!prev) {
        map.set(canonKey, {
          canonKey,
          loiKeyRaw: String(g?.loi_id ?? ""),
          entity: String(g.entity ?? ""),
          groupKey: String(g.groupKey ?? canonKey),
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

      // garde le groupe dominant = le plus récent (pour le routage)
      if (gDateMax && (!prev.dateMax || gDateMax > prev.dateMax)) {
        prev.dateMax = gDateMax;
        prev.groupKey = String(g.groupKey ?? prev.groupKey);
        prev.entity = String(g.entity ?? prev.entity);
        prev.display = (g as any)?.display ?? prev.display;
        prev.phase_label = (g as any)?.phase_label ?? prev.phase_label;
        prev.loiKeyRaw = String(g?.loi_id ?? prev.loiKeyRaw);
      }

      // cap preview
      if (ACTU_FEED_MAX_ITEMS_PER_STORY > 0 && prev.items.length > ACTU_FEED_MAX_ITEMS_PER_STORY) {
        prev.items.sort((a: any, b: any) => String(b?.date ?? "").localeCompare(String(a?.date ?? "")));
        prev.items = prev.items.slice(0, ACTU_FEED_MAX_ITEMS_PER_STORY);
      }

      map.set(canonKey, prev);
    }

    const out = Array.from(map.values());
    out.sort((a, b) => String(b?.dateMax ?? "").localeCompare(String(a?.dateMax ?? "")));
    return out;
  }, [groupedRowsCoarse]);

  useEffect(() => {
    if (!DEBUG_ACTU) return;
    logSuspiciousRatioInRawDB(rawDBFixed);
    logTopLoiIdInRawDB(rawDBFixed, 12);
    logNoLoiSample(rawDBFixed, 12);
    logTopLoiIdInGroups(groupedRowsCoarse as any[], 12);
  }, [rawDBFixed, groupedRowsCoarse]);

  const rawUI: (ActuItemUI & { why?: string; deltaLine?: string; badge?: string })[] = useMemo(() => {
    return groupedStories.map((story) => {
      const items = story.items ?? [];
      const first = items[0];

      const baseDB: ActuItemDB =
        (first as any) ??
        ({
          id: story.groupKey,
          entity: story.entity,
          date: story.dateMax,
        } as any);

      const { iconLib, iconName } = pickIcon(baseDB);

      const displayTitle = cleanSpaces((story as any)?.display?.title ?? "");
      let editorial = displayTitle;

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

      const longTitleFromGrouping = cleanSpaces((story as any)?.display?.longTitle ?? "");
      const longSeed = longTitleFromGrouping || officialRaw;

      const longTitleClean = cleanOfficialTitle(longSeed, editorialTitle);
      const longTitle = longTitleClean ? longTitleClean : undefined;

      const agg = loiAggMap.get(story.canonKey);

      const statsLine =
        formatAggLine(agg) ??
        formatAggLine({
          scrutins: nint(story.summary?.scrutins),
          amendements: nint(story.summary?.amendements),
          articles: nint(story.summary?.articles),
          total: nint(story.summary?.total),
          lastDateMax: String(story.dateMax ?? ""),
        });

      const tag = (story as any).display?.tag || pickTag(baseDB);
      const badge = agg ? pickBadgeForStory(editorialTitle, agg) : undefined;

      const ui: any = {
        // ✅ IMPORTANT: id unique par loi (canon)
        id: `story:${story.canonKey}`,
        groupKey: story.groupKey,
        canonKey: story.canonKey,
        loiKeyRaw: story.loiKeyRaw,

        dateISO: toISO(story.dateMax),

        title: editorialTitle,
        longTitle,
        subtitle: secondaryLine(story as any),

        tone: pickTone(baseDB),
        iconLib,
        iconName,
        tag,
        statsLine,

        groupCount: nint(story.summary?.total) || items.length || 1,
        previewCount: items.length,

        why: (story as any)?.display?.why ? cleanSpaces((story as any).display.why) : undefined,
        deltaLine: (story as any)?.display?.deltaLine
          ? cleanSpaces((story as any).display.deltaLine)
          : undefined,
        badge,
      };

      return ui as ActuItemUI & { why?: string; deltaLine?: string; badge?: string };
    });
  }, [groupedStories, loiAggMap]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rawUI;
    return rawUI.filter((x) =>
      (`${x.title} ${x.subtitle} ${(x as any).why ?? ""} ${(x as any).deltaLine ?? ""} ${x.longTitle ?? ""}`)
        .toLowerCase()
        .includes(s)
    );
  }, [q, rawUI]);

  /**
   * ✅ UNE DU JOUR
   * - top 1 sur AUJOURD’HUI par volume (groupCount)
   * - retiré du reste pour éviter doublon
   */
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

  const openGroup = useCallback(
    (ui: ActuItemUI) => {
      const key = (ui as any).groupKey || ui.id;
      if (!key) return;
      router.push(`/actu/group/${encodeURIComponent(String(key))}` as any);
    },
    [router]
  );

  const renderRow = ({ item }: { item: Row }) => {
    if (item.kind === "header") return <SectionHeader title={item.title} />;
    return <ActuBulletinRow item={item.item as any} onPress={() => openGroup(item.item)} />;
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
          <Text style={{ color: INK, fontWeight: "900" }}>Impossible de charger</Text>
          <Text style={{ color: INK_SOFT }}>{error}</Text>
          <Pressable onPress={onRefresh} style={{ marginTop: 8 }}>
            <Text style={{ color: INK, fontWeight: "900" }}>Réessayer →</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r, idx) => (r.kind === "header" ? `h-${r.title}-${idx}` : `i-${r.item.id}`)}
          renderItem={renderRow}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ paddingBottom: 24 }}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListEmptyComponent={
            <View style={{ padding: 16 }}>
              <Text style={{ color: INK_SOFT }}>Aucun élément ne correspond à ta recherche.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PAPER },

  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, gap: 8 },
  hTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },

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
  debugPillText: { color: INK, fontSize: 12, fontWeight: "900", letterSpacing: 0.6 },

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

  sectionHeader: { paddingTop: 10, paddingBottom: 6, paddingHorizontal: 16, gap: 8 },
  sectionTitle: { color: INK_SOFT, fontSize: 12, fontWeight: "900", letterSpacing: 1.4 },
  sectionLine: { height: 1, backgroundColor: LINE },

  sep: { height: 10 },
});
