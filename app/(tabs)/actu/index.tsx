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

import { theme } from "../../../lib/theme";
import { fetchActuItems, type ActuItem as ActuItemDB } from "@/lib/queries/actu";
import { groupActuItems, type GroupedActuRow } from "@/lib/actu/grouping";

import { ActuCard, HeroActuCard } from "@/components/actu";
import type { ActuItemUI, Tone } from "@/components/actu/types";

const colors = theme.colors;

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
  if (d <= 1) return "AUJOURD’HUI";
  if (d <= 7) return "CETTE SEMAINE";
  return "PLUS TÔT";
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

function ctaLabel(_it: ActuItemUI) {
  return "Voir le récit";
}

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionLine} />
    </View>
  );
}

/** ===== Hero editorial (anti-bruit) ===== */
function isNoLoi(loi_id?: string | null) {
  return !loi_id || loi_id === "no-loi";
}
function cleanSpaces(s: string) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
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

  const bestClearLoi = candidates.find((g) => !isNoLoi((g as any).loi_id ?? null));
  if (bestClearLoi) {
    const age = daysAgo(toISO((bestClearLoi as any).dateMax ?? null));
    if (age <= 14) return bestClearLoi;
  }

  const bestNonGeneric = candidates.find((g) => {
    const t = (g as any).display?.title ?? null;
    return !isGenericTitle(t);
  });
  if (bestNonGeneric) return bestNonGeneric;

  return candidates[0] ?? sorted[0] ?? null;
}

/** ✅ Agrégation par loiKey (row.loi_id) pour afficher les "vrais" volumes */
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
    if (kicker) return kicker;

    return phase ? `Vote — ${phase}` : "Vote à l’Assemblée";
  }

  if (e === "amendement") return phase ? `Amendements — ${phase}` : "Modifications du texte";
  if (e === "motion") return "Événement parlementaire";
  if (e === "declaration") return "Déclaration politique";

  return phase ? `Avancée — ${phase}` : "Dernières avancées";
}

function buildHighlights(row: GroupedActuRow): string[] {
  const e = row.entity;
  if (e === "scrutin") return ["En clair → preuves → étapes", "Positions des groupes + détail du vote"];
  if (e === "amendement") return ["En clair → preuves → étapes", "Ce que ça change dans le texte"];
  if (e === "motion") return ["En clair → preuves → étapes", "Pourquoi c’est arrivé"];
  if (e === "declaration") return ["En clair → preuves → étapes", "Le message & ses conséquences"];
  return ["En clair → preuves → étapes", "Suivi du dossier"];
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
  if (entity === "scrutin") return "Vote à l’Assemblée";
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

/** =========================
 *  DEBUG HELPERS (TOP loi_id)
 * ========================= */
function short(s: any, max = 90) {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length <= max ? t : t.slice(0, max) + "…";
}

function pickExampleTitle(it: any): string {
  const raw = String(it?.title ?? it?.objet ?? it?.titre ?? it?.subtitle ?? "").trim();
  return raw ? short(raw, 90) : "";
}

function normalizeLoiIdForLogs(v: any): string {
  const s = String(v ?? "").trim();
  return s ? s : "no-loi";
}

function isNoLoiId(loiId: string) {
  const s = String(loiId ?? "").trim();
  return !s || s === "no-loi";
}

/** ✅ IMPORTANT: "suspicious" = ID événement (numérique), PAS "scrutin-public-..." */
function isEventIdLike(loiId: string) {
  const s = String(loiId ?? "").trim();
  if (!s) return false;
  if (/^scrutin-\d+$/i.test(s)) return true;
  if (/^motion-\d+$/i.test(s)) return true;
  if (/^declaration-\d+$/i.test(s)) return true;
  return false;
}

/** ✅ Mini-log ratio loi_id (rawDB) : eventIdLike vs no-loi vs ok */
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
    if (!prev) {
      map.set(loiId, { count: 1, exTitle: pickExampleTitle(it) });
    } else {
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

/** ✅ NEW: log brut des "no-loi" pour identifier la source */
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
   * - stabilise group/coarse/agg pour motions/déclarations aussi
   */
  const rawDBFixed = useMemo(() => {
    return (rawDB ?? []).map((it: any) => {
      const loiId = (it?.loi_id ?? "").toString().trim();
      if (loiId) return it;

      if (it?.id) {
        return { ...it, loi_id: String(it.id) };
      }

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

  /** ✅ Actu = COARSE */
  const groupedRows = groupedRowsCoarse;

  /** ✅ build agg map by loi_id (loiKey) depuis COARSE */
  const loiAggMap = useMemo(() => {
    const m = new Map<string, LoiAgg>();

    for (const g of groupedRows) {
      const loiKey = normalizeLoiIdForLogs((g as any).loi_id);
      if (!loiKey || loiKey === "no-loi") continue;

      const prev =
        m.get(loiKey) ??
        ({
          scrutins: 0,
          amendements: 0,
          articles: 0,
          total: 0,
          lastDateMax: "",
        } as LoiAgg);

      prev.scrutins += Number(g.summary?.scrutins ?? 0);
      prev.amendements += Number(g.summary?.amendements ?? 0);
      prev.articles += Number(g.summary?.articles ?? 0);
      prev.total += Number(g.summary?.total ?? 0);

      const d = String((g as any).dateMax ?? "");
      if (d && d > prev.lastDateMax) prev.lastDateMax = d;

      m.set(loiKey, prev);
    }

    return m;
  }, [groupedRows]);

  /** Logs (STRICT + COARSE + TOP loi_id + ratio + no-loi sample) */
  useEffect(() => {
    if (!DEBUG_ACTU) return;

    logSuspiciousRatioInRawDB(rawDBFixed);
    logTopLoiIdInRawDB(rawDBFixed, 12);
    logNoLoiSample(rawDBFixed, 12);

    dlog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    dlog("[ACTU] TOP RECITS (STRICT)");
    [...groupedRowsStrict]
      .map((g: any) => ({
        key: g.groupKey,
        title: g?.display?.title ?? "",
        total: g?.summary?.total ?? g?.items?.length ?? 0,
        scr: g?.summary?.scrutins ?? 0,
        amd: g?.summary?.amendements ?? 0,
        art: g?.summary?.articles ?? 0,
        entity: g?.entity ?? "",
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8)
      .forEach((x, i) => {
        dlog(
          `#${i + 1} total=${x.total} scr=${x.scr} amd=${x.amd} art=${x.art} entity=${x.entity} | ${x.title} | key=${x.key}`
        );
      });
    dlog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    dlog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    dlog("[ACTU] TOP RECITS (COARSE)");
    groupedRowsCoarse.slice(0, 8).forEach((g: any, i: number) => {
      dlog(
        `#${i + 1} total=${g.summary?.total ?? 0} preview=${g.items?.length ?? 0} scr=${
          g.summary?.scrutins ?? 0
        } amd=${g.summary?.amendements ?? 0} art=${g.summary?.articles ?? 0} | ${
          g.display?.title ?? ""
        } | key=${g.groupKey}`
      );
    });
    dlog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    dlog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    dlog("[ACTU] TOP RECITS (COARSE by total)");
    [...groupedRowsCoarse]
      .map((g: any) => ({
        key: g.groupKey,
        title: g?.display?.title ?? "",
        total: g?.summary?.total ?? 0,
        preview: g?.items?.length ?? 0,
        scr: g?.summary?.scrutins ?? 0,
        amd: g?.summary?.amendements ?? 0,
        art: g?.summary?.articles ?? 0,
      }))
      .sort((a, b) => (b.total ?? 0) - (a.total ?? 0))
      .slice(0, 8)
      .forEach((x, i) => {
        dlog(
          `#${i + 1} total=${x.total} preview=${x.preview} scr=${x.scr} amd=${x.amd} art=${x.art} | ${x.title} | key=${x.key}`
        );
      });
    dlog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    logTopLoiIdInGroups(groupedRowsCoarse as any[], 12);
  }, [rawDBFixed, groupedRowsStrict, groupedRowsCoarse]);

  const rawUI: ActuItemUI[] = useMemo(() => {
    return groupedRows.map((row) => {
      const items = row.items ?? [];
      const first = items[0];

      const baseDB: ActuItemDB =
        (first as any) ??
        ({
          id: row.groupKey,
          entity: row.entity,
          date: (row as any).dateMax,
        } as any);

      const { iconLib, iconName } = pickIcon(baseDB);

      const displayTitle = cleanSpaces((row as any)?.display?.title ?? "");
      let editorial = displayTitle;

      let usedFallback = false;
      if (isBadListTitle(editorial)) {
        editorial = fallbackTitleForEntity(String(row.entity));
        usedFallback = true;
      }

      const editorialTitle = maybePrefixLoi(String(row.entity), editorial);

      const officialRaw =
        (first as any)?.objet ??
        (first as any)?.titre ??
        (first as any)?.title ??
        (first as any)?.subtitle ??
        "";

      const longTitleFromGrouping = cleanSpaces((row as any)?.display?.longTitle ?? "");
      const longSeed = longTitleFromGrouping || officialRaw;

      const longTitleClean = cleanOfficialTitle(longSeed, editorialTitle);
      const longTitle = longTitleClean ? longTitleClean : undefined;

      const loiKey = normalizeLoiIdForLogs((row as any).loi_id);
      const agg = loiKey ? loiAggMap.get(loiKey) : undefined;

      const statsLine =
        formatAggLine(agg) ??
        formatAggLine({
          scrutins: Number(row.summary?.scrutins ?? 0),
          amendements: Number(row.summary?.amendements ?? 0),
          articles: Number(row.summary?.articles ?? 0),
          total: Number(row.summary?.total ?? 0),
          lastDateMax: String((row as any).dateMax ?? ""),
        });

      const tag = (row as any).display?.tag || pickTag(baseDB);

      const ui: ActuItemUI = {
        id: row.groupKey,
        dateISO: toISO((row as any).dateMax),
        title: editorialTitle,
        longTitle,
        subtitle: secondaryLine(row),
        tone: pickTone(baseDB),
        iconLib,
        iconName,
        tag,
        statsLine,
        highlights: buildHighlights(row),
        groupKey: row.groupKey,

        // ✅ truth
        groupCount: Number(row.summary?.total ?? 0) || items.length || 1,

        // ✅ preview réellement affichée dans le feed
        previewCount: items.length,
      };

      (ui as any).__debug = {
        entity: row.entity,
        usedFallback,
        displayTitle,
        editorialTitle,
        loiKey,
        dateMax: (row as any)?.dateMax ?? null,
        officialRaw,
        groupKey: row.groupKey,
        counts: row.summary,
        firstId: (first as any)?.id ?? null,
        previewCount: items.length,
        totalReal: row.summary?.total,
      };

      return ui;
    });
  }, [groupedRows, loiAggMap]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rawUI;
    return rawUI.filter((x) =>
      (`${x.title} ${x.subtitle} ${x.statsLine ?? ""} ${x.longTitle ?? ""}`)
        .toLowerCase()
        .includes(s)
    );
  }, [q, rawUI]);

  const rows: Row[] = useMemo(() => {
    const heroGroup = pickHeroGroup(groupedRows);
    const heroUI = heroGroup ? rawUI.find((x) => x.id === heroGroup.groupKey) ?? null : null;

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
  }, [filtered, groupedRows, rawUI]);

  /** Actu -> group (récit) */
  const openGroup = useCallback(
    (ui: ActuItemUI) => {
      const key = ui.groupKey || ui.id;
      if (!key) return;

      const href = `/actu/group/${encodeURIComponent(String(key))}`;

      // eslint-disable-next-line no-console
      console.log("[ACTU CLICK]", {
        title: ui.title,
        groupKey: ui.groupKey,
        id: ui.id,
        tag: ui.tag,
        dateISO: ui.dateISO,
        href,
      });

      router.push(href as any);
    },
    [router]
  );

  const renderRow = ({ item }: { item: Row }) => {
    if (item.kind === "hero") {
      return (
        <HeroActuCard
          item={item.item as any}
          cta={ctaLabel(item.item)}
          onPress={() => openGroup(item.item)}
        />
      );
    }
    if (item.kind === "header") return <SectionHeader title={item.title} />;

    const it = item.item;
    return <ActuCard item={it as any} cta={ctaLabel(it)} onPress={() => openGroup(it)} />;
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View style={styles.hTitleRow}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text style={styles.h1}>Actu</Text>

            {DEBUG_ACTU && (
              <View style={styles.debugPill}>
                <Ionicons name="bug-outline" size={14} color={colors.text} />
                <Text style={styles.debugPillText}>DEBUG</Text>
              </View>
            )}
          </View>

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

  header: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12, gap: 8 },

  hTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  h1: { color: colors.text, fontSize: 24, fontWeight: "900", letterSpacing: 0.2 },

  debugPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  debugPillText: { color: colors.text, fontSize: 12, fontWeight: "900", letterSpacing: 0.6 },

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
});
