// app/(tabs)/lois/index.tsx
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { supabase } from "../../../lib/supabaseClient";
import { theme } from "../../../lib/theme";
import { routeFromItemId } from "@/lib/routes";

const colors = theme.colors;

type TabKey = "lois" | "evenements";

type LoiFeedSearchRow = {
  loi_id: string;
  titre_loi_canon: string;
  derniere_activite_date: string | null;
  score: number;
};

type LoiAppRow = {
  loi_id: string;
  titre_loi: string | null;
  nb_scrutins_total: number | null;
  nb_articles: number | null;
  nb_amendements: number | null;
  date_premier_scrutin: string | null;
  date_dernier_scrutin: string | null;
  legislature: number | null;
  resume_citoyen: string | null;
};

type MappingRow = {
  loi_id: string;
  id_dossier: string | null;
  confiance: number | null;
  source: string | null;
};

// ✅ MV réelle confirmée : nb_amendement_like
type ScrutinCountsRow = {
  loi_id: string;
  nb_scrutins_total: number | null;
  nb_amendement_like: number | null;
  date_premier_scrutin: string | null;
  date_dernier_scrutin: string | null;
};

type CountsSource = "raw" | "agg";

type LoiListItem = {
  loi_id: string; // id de navigation (loi_canon_id pour canon, sinon loi_id)
  titre_loi: string;

  // feed canon v2
  leader_item_id?: string | null;
  leader_titre?: string | null;
  leader_date?: string | null;
  leader_scrutin_macro_score?: number | null;

  nb_scrutins_total: number;
  nb_articles: number;

  // ✅ IMPORTANT: nb_amendements sert de fallback si nb_amendement_like manque
  nb_amendements: number;

  date_premier_scrutin: string | null;
  date_dernier_scrutin: string | null;
  legislature: number | null;

  resume_citoyen: string | null;

  nb_amendement_like?: number | null;

  mapping?: {
    id_dossier: string | null;
    confiance: number | null;
    source: string | null;
  } | null;

  micro_badges?: string[] | null;
  group_size?: number | null;

  // ✅ IMPORTANT: pour ne pas “re-sommer” des counts déjà agrégés
  counts_source?: CountsSource;
};

// ✅ view public.lois_canon_feed_v2_canon
type LoiCanonFeedV2Row = {
  loi_canon_id: string;
  leader_item_id: string | null;
  leader_date: string | null;
  leader_titre: string | null;
  macro_score: number | null;
};

// -----------------------------
// Helpers
// -----------------------------
function isScrutinBackedId(loi_id: string) {
  const id = (loi_id ?? "").toLowerCase().trim();
  return id.startsWith("scrutin-") || id.startsWith("scrutin-public-");
}

function isAmendementIdLike(loi_id: string) {
  const id = (loi_id ?? "").toLowerCase();
  return id.includes("amendement") || id.includes("sous-amendement");
}

function looksLikeAmendementTitle(title: string) {
  const t = (title ?? "").toLowerCase();
  return t.includes("amendement") || t.includes("sous-amendement");
}

/**
 * ✅ Règle critique :
 * - on exclut les amendements via id + titre (robuste)
 */
function isAmendementLikeForList(loi_id: string, title: string) {
  const id = (loi_id ?? "").toLowerCase();
  const t = (title ?? "").toLowerCase();
  return isAmendementIdLike(id) || t.includes("amendement") || t.includes("sous-amendement");
}

function isEvenementLike(loi_id: string, title: string) {
  const id = (loi_id ?? "").toLowerCase();
  const t = (title ?? "").toLowerCase();

  const isCensure =
    id.includes("censure") || t.includes("censure") || id.startsWith("motion-de-censure");

  const isDeclaration =
    id.includes("declaration") ||
    id.includes("déclaration") ||
    t.includes("déclaration") ||
    t.includes("declaration") ||
    t.includes("politique générale") ||
    t.includes("déclaration du gouvernement") ||
    t.includes("declaration du gouvernement");

  const isResolution =
    id.includes("resolution") ||
    id.includes("résolution") ||
    t.includes("résolution") ||
    t.includes("resolution");

  return isCensure || isDeclaration || isResolution;
}

function classifyItem(loi_id: string, title: string): TabKey {
  if (isEvenementLike(loi_id, title)) return "evenements";
  return "lois";
}

function fmtDateFR(d?: string | null) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("fr-FR");
  } catch {
    return "—";
  }
}

function clamp01(x: number) {
  if (Number.isNaN(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function badgeFromMapping(m?: LoiListItem["mapping"] | null) {
  if (!m) return null;

  const conf = m.confiance ?? null;
  const confPct = conf == null ? null : Math.round(clamp01(conf) * 100);

  let label = "Dossier";
  if (confPct != null) label = `Dossier · ${confPct}%`;

  return {
    label,
    confPct,
    source: m.source ?? null,
    id_dossier: m.id_dossier ?? null,
  };
}

function computeStatusLabel(item: LoiListItem) {
  if (!item.date_dernier_scrutin) return "En cours";

  const t = new Date(item.date_dernier_scrutin).getTime();
  if (!Number.isFinite(t)) return "En cours";

  const days = Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24));
  if (days <= 30) return "Vote récent";
  if (days <= 120) return "Vote en cours";
  return "Vote ancien";
}

function toneForStatus(status: string) {
  const s = status.toLowerCase();
  if (s.includes("récent")) return "success";
  if (s.includes("ancien")) return "soft";
  return "warn";
}

/**
 * ✅ Titre canon côté app (fallback simple/robuste) pour ids scrutin-*
 */
function canonTitleFromLoiId(loi_id: string) {
  let s = String(loi_id || "");

  s = s.replace(/^scrutin-public-(ordinaire|solennel)-/i, "");
  s = s.replace(/^scrutin-public-/i, "");
  s = s.replace(/^scrutin-/i, "");
  s = s.replace(/-/g, " ");

  s = s.replace(/\bpremiere lecture\b/gi, "(première lecture)");
  s = s.replace(/\bseconde deliberation\b/gi, "(seconde délibération)");
  s = s.replace(/\bseconde déliberation\b/gi, "(seconde délibération)");

  s = s.replace(/\s+/g, " ").trim();

  return s
    .split(" ")
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/**
 * ✅ Bottom meta :
 * - si nb_amendement_like présent: "803 scrutins · 766 amend."
 * - sinon si nb_amendements > 0 : "3 scrutins · 3 amend."
 * - sinon fallback "1er vote ..."
 */
function buildBottomMeta(item: LoiListItem) {
  const nb = item.nb_scrutins_total ?? 0;

  if (nb > 0) {
    const amendLike = typeof item.nb_amendement_like === "number" ? item.nb_amendement_like : null;
    if (amendLike != null && amendLike > 0) {
      return `${nb} scrutins · ${amendLike} amend.`;
    }

    const amendFallback = typeof item.nb_amendements === "number" ? item.nb_amendements : 0;
    if (amendFallback > 0) {
      return `${nb} scrutins · ${amendFallback} amend.`;
    }

    const firstVote = fmtDateFR(item.date_premier_scrutin);
    return `${nb} scrutin${nb > 1 ? "s" : ""} · 1er vote ${firstVote}`;
  }

  if (isScrutinBackedId(String(item.loi_id ?? ""))) return "Votes en cours · détails dans le parcours";
  return "—";
}

/**
 * ✅ BaseKey stable pour agréger ordinaire/solennel + étapes
 */
function stableLawBaseKeyFromScrutinId(loi_id: string) {
  let s = String(loi_id || "").toLowerCase().trim();

  // neutralise ordinaire/solennel
  s = s.replace(/^scrutin-public-(ordinaire|solennel)-/i, "scrutin-public-");
  s = s.replace(/^scrutin-public-/, "");
  s = s.replace(/^scrutin-/, "");

  const idxProj = s.indexOf("projet-de-loi");
  const idxProp = s.indexOf("proposition-de-loi");
  const idx =
    idxProj >= 0 && idxProp >= 0 ? Math.min(idxProj, idxProp) : Math.max(idxProj, idxProp);

  if (idx >= 0) s = s.slice(idx);

  const cutTokens = [
    "-premiere-lecture",
    "-seconde-lecture",
    "-nouvelle-lecture",
    "-lecture-definitive",
    "-lecture-définitive",
    "-lecture",
    "-seconde-deliberation",
    "-seconde-délibération",
    "-seconde-deliberatio",
    "-seconde-déliberatio",
    "-premiere-deliberation",
    "-premiere-délibération",
    "-deliberation",
    "-délibération",
    "-commission-mixte-paritaire",
    "-cmp",
  ];

  let cutAt = -1;
  for (const tok of cutTokens) {
    const p = s.indexOf(tok);
    if (p > 0) cutAt = cutAt === -1 ? p : Math.min(cutAt, p);
  }
  if (cutAt > 0) s = s.slice(0, cutAt);

  return s;
}

function scrutinDedupeKey(loi_id: string) {
  return stableLawBaseKeyFromScrutinId(loi_id);
}

function microBadgesFromVariant(loi_id: string, title: string) {
  const id = String(loi_id || "").toLowerCase();
  const t = String(title || "").toLowerCase();

  const out: string[] = [];

  const hasArticleLiminaire = id.includes("article-liminaire") || t.includes("article liminaire");
  if (hasArticleLiminaire) out.push("Inclut l’article liminaire");

  const hasPremierePartie =
    id.includes("premiere-partie") ||
    id.includes("première-partie") ||
    t.includes("première partie") ||
    t.includes("premiere partie");
  if (hasPremierePartie) out.push("Inclut la 1ère partie");

  const hasSecondePartie =
    id.includes("seconde-partie") ||
    id.includes("deuxieme-partie") ||
    id.includes("deuxième-partie") ||
    t.includes("seconde partie") ||
    t.includes("2e partie") ||
    t.includes("deuxième partie");
  if (hasSecondePartie) out.push("Inclut la 2e partie");

  const hasSecondeDelib =
    id.includes("seconde-deliber") ||
    id.includes("seconde-délib") ||
    t.includes("seconde délibération") ||
    t.includes("seconde deliberation");
  if (hasSecondeDelib) out.push("Inclut 2e délibération");

  return out;
}

function pickBestScrutin(a: LoiListItem, b: LoiListItem) {
  const aScr = a.nb_scrutins_total ?? 0;
  const bScr = b.nb_scrutins_total ?? 0;
  if (aScr !== bScr) return aScr > bScr ? a : b;

  const aAm = a.nb_amendement_like ?? a.nb_amendements ?? 0;
  const bAm = b.nb_amendement_like ?? b.nb_amendements ?? 0;
  if (aAm !== bAm) return aAm > bAm ? a : b;

  const aT = a.date_dernier_scrutin ? new Date(a.date_dernier_scrutin).getTime() : 0;
  const bT = b.date_dernier_scrutin ? new Date(b.date_dernier_scrutin).getTime() : 0;
  if (aT !== bT) return aT > bT ? a : b;

  return a;
}

/**
 * ✅ Dédup + agrégation :
 * - 1 carte par loi “scrutin-backed”
 * - si counts_source="raw" => somme des variantes
 * - si counts_source="agg" => on ne somme PAS (sinon × group_size)
 */
function dedupeScrutinBacked(items: LoiListItem[]) {
  const nonScrutin: LoiListItem[] = [];
  const groups = new Map<string, LoiListItem[]>();

  for (const it of items) {
    if (!isScrutinBackedId(it.loi_id)) {
      nonScrutin.push(it);
      continue;
    }
    const k = scrutinDedupeKey(it.loi_id);
    const arr = groups.get(k) ?? [];
    arr.push(it);
    groups.set(k, arr);
  }

  const dedupedScrutin: LoiListItem[] = [];

  for (const [, arr] of groups) {
    let best = arr[0];
    for (let i = 1; i < arr.length; i++) best = pickBestScrutin(best, arr[i]);

    const hasAgg = arr.some((x) => x.counts_source === "agg");

    const sumScrutins = hasAgg
      ? best.nb_scrutins_total ?? 0
      : arr.reduce((acc, it) => acc + (it.nb_scrutins_total ?? 0), 0);

    const sumAmend = hasAgg
      ? (best.nb_amendement_like ?? best.nb_amendements ?? 0)
      : arr.reduce((acc, it) => acc + (it.nb_amendement_like ?? it.nb_amendements ?? 0), 0);

    const first =
      arr
        .map((it) => it.date_premier_scrutin)
        .filter(Boolean)
        .sort()[0] ?? null;

    const last =
      arr
        .map((it) => it.date_dernier_scrutin)
        .filter(Boolean)
        .sort()
        .slice(-1)[0] ?? null;

    const badgesSet = new Set<string>();
    for (const v of arr) {
      for (const b of microBadgesFromVariant(v.loi_id, v.titre_loi)) badgesSet.add(b);
    }

    dedupedScrutin.push({
      ...best,
      nb_scrutins_total: sumScrutins,
      nb_amendement_like: best.nb_amendement_like ?? null,
      nb_amendements: sumAmend,
      date_premier_scrutin: first,
      date_dernier_scrutin: last,
      micro_badges: badgesSet.size ? Array.from(badgesSet.values()) : null,
      group_size: arr.length,
    });
  }

  const all = [...nonScrutin, ...dedupedScrutin];
  all.sort((a, b) => (b.date_dernier_scrutin ?? "").localeCompare(a.date_dernier_scrutin ?? ""));
  return all;
}

function buildAggByBaseKeyFromItems(items: LoiListItem[]) {
  const agg: Record<string, ScrutinCountsRow> = {};

  for (const it of items) {
    if (!isScrutinBackedId(it.loi_id)) continue;

    const baseKey = stableLawBaseKeyFromScrutinId(it.loi_id);
    const prev = agg[baseKey];

    const nbScr = (prev?.nb_scrutins_total ?? 0) + (it.nb_scrutins_total ?? 0);
    const nbAm =
      (prev?.nb_amendement_like ?? 0) +
      ((typeof it.nb_amendement_like === "number" ? it.nb_amendement_like : it.nb_amendements) ??
        0);

    const first =
      [prev?.date_premier_scrutin, it.date_premier_scrutin].filter(Boolean).sort()[0] ?? null;

    const last =
      [prev?.date_dernier_scrutin, it.date_dernier_scrutin]
        .filter(Boolean)
        .sort()
        .slice(-1)[0] ?? null;

    agg[baseKey] = {
      loi_id: baseKey,
      nb_scrutins_total: nbScr,
      nb_amendement_like: nbAm,
      date_premier_scrutin: first,
      date_dernier_scrutin: last,
    };
  }

  return agg;
}

// -----------------------------
// UI helpers
// -----------------------------
function Pill({
  label,
  tone = "soft",
  micro = false,
}: {
  label: string;
  tone?: "success" | "warn" | "soft";
  micro?: boolean;
}) {
  const style =
    tone === "success" ? styles.pillSuccess : tone === "warn" ? styles.pillWarn : styles.pillSoft;

  const textStyle =
    tone === "success"
      ? styles.pillSuccessText
      : tone === "warn"
      ? styles.pillWarnText
      : styles.pillSoftText;

  return (
    <View style={[styles.pill, style, micro ? styles.microPill : null]}>
      <Text
        style={[styles.pillText, textStyle, micro ? styles.microPillText : null]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

function TabPill({
  label,
  active,
  onPress,
  count,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  count?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.tabPill, active ? styles.tabPillOn : styles.tabPillOff]}
    >
      <Text
        style={[styles.tabPillText, active ? styles.tabPillTextOn : styles.tabPillTextOff]}
        numberOfLines={1}
      >
        {label}
      </Text>

      {typeof count === "number" ? (
        <View style={[styles.tabCount, active ? styles.tabCountOn : styles.tabCountOff]}>
          <Text
            style={[styles.tabCountText, active ? styles.tabCountTextOn : styles.tabCountTextOff]}
          >
            {count}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function cleanResume(s?: string | null) {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (t.length < 12) return null;
  return t;
}

type MicroBadge = {
  label: string;
  tone?: "success" | "warn" | "soft";
};

function includesAny(hay: string, needles: string[]) {
  return needles.some((n) => hay.includes(n));
}

function computeMicroBadges(loi_id: string, title: string): MicroBadge[] {
  const id = (loi_id ?? "").toLowerCase();
  const t = (title ?? "").toLowerCase();

  const out: MicroBadge[] = [];

  // --- Type de texte
  if (id.includes("finances-pour") || t.includes("projet de loi de finances")) {
    out.push({ label: "PLF", tone: "soft" });
  } else if (
    id.includes("financement-de-la-securite-sociale") ||
    t.includes("financement de la sécurité sociale") ||
    t.includes("financement de la securite sociale")
  ) {
    out.push({ label: "PLFSS", tone: "soft" });
  } else if (id.includes("proposition-de-loi") || t.includes("proposition de loi")) {
    out.push({ label: "PPL", tone: "soft" });
  } else if (id.includes("projet-de-loi") || t.includes("projet de loi")) {
    out.push({ label: "Projet", tone: "soft" });
  }

  // --- Lectures / étapes
  if (
    id.includes("lecture-definitive") ||
    t.includes("lecture définitive") ||
    t.includes("lecture definitive")
  ) {
    out.push({ label: "Lecture définitive", tone: "warn" });
  } else if (id.includes("nouvelle-lecture") || t.includes("nouvelle lecture")) {
    out.push({ label: "Nouvelle lecture", tone: "warn" });
  } else if (
    id.includes("premiere-lecture") ||
    t.includes("première lecture") ||
    t.includes("premiere lecture")
  ) {
    out.push({ label: "1ère lecture", tone: "soft" });
  }

  if (
    includesAny(id, ["commission-mixte-paritaire", "-cmp-", "cmp"]) ||
    t.includes("commission mixte paritaire")
  ) {
    out.push({ label: "CMP", tone: "warn" });
  }

  // --- Nature du vote
  const hasEnsemble = t.includes("l'ensemble") || t.includes("l’ensemble");
  const hasArticleUnique = t.includes("article unique");
  const hasLimin = id.includes("article-liminaire") || t.includes("article liminaire");
  const hasPremPart =
    id.includes("premiere-partie") ||
    id.includes("première partie") ||
    t.includes("première partie") ||
    t.includes("premiere partie");
  const hasSecPart =
    id.includes("seconde-partie") ||
    t.includes("seconde partie") ||
    t.includes("deuxième partie") ||
    t.includes("deuxieme partie");
  const hasSecondeDelib =
    id.includes("seconde-deliberatio") ||
    t.includes("seconde délibération") ||
    t.includes("seconde deliberation");

  if (hasLimin) out.push({ label: "Article liminaire", tone: "warn" });
  if (hasPremPart) out.push({ label: "1ère partie", tone: "warn" });
  if (hasSecPart) out.push({ label: "2e partie", tone: "warn" });
  if (hasSecondeDelib) out.push({ label: "2e délibération", tone: "warn" });

  if (hasEnsemble) out.push({ label: "Texte complet", tone: "success" });
  else if (hasArticleUnique) out.push({ label: "Article unique", tone: "warn" });
  else if (t.includes("l'article") || t.includes("l’article")) {
    out.push({ label: "Article isolé", tone: "warn" });
  }

  const seen = new Set<string>();
  return out.filter((b) => (b.label && !seen.has(b.label) ? (seen.add(b.label), true) : false));
}

function mergeBadges(base: MicroBadge[], extraLabels?: string[] | null): MicroBadge[] {
  const out: MicroBadge[] = [];
  const seen = new Set<string>();

  const push = (b: MicroBadge) => {
    const key = (b.label || "").trim();
    if (!key) return;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(b);
  };

  for (const b of base) push(b);

  for (const lab of extraLabels ?? []) {
    const label = String(lab || "").trim();
    if (!label) continue;
    push({ label, tone: "warn" });
  }

  return out;
}

function compactBadges(badges: MicroBadge[], max = 3) {
  const list = badges.filter((b) => b?.label?.trim());
  const shown = list.slice(0, max);
  const rest = Math.max(0, list.length - shown.length);
  return { shown, rest };
}

// ---- “Dernière activité” non redondante (premium)
function normText(s: string) {
  return (s ?? "")
    .toLowerCase()
    .replace(/[\u2019’]/g, "'")
    .replace(/[^a-z0-9àâçéèêëîïôùûüÿñæœ\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isRedundantActivity(title: string, activity: string) {
  const a = normText(title);
  const b = normText(activity);
  if (!a || !b) return false;
  if (b.includes(a) || a.includes(b)) return true;
  const A = new Set(a.split(" ").filter((w) => w.length >= 4));
  const common = b.split(" ").filter((w) => w.length >= 4 && A.has(w));
  return common.length >= 6;
}

function compactActionLabel(s: string) {
  const t = normText(s);
  if (!t) return "Vote (détail)";
  if (t.includes("l'ensemble")) return "Vote sur l’ensemble";
  if (t.includes("article liminaire")) return "Article liminaire";
  const m = t.match(/article\s+(\d+)/);
  if (m?.[1]) return `Article ${m[1]}`;
  if (t.includes("premiere partie") || t.includes("1ere partie")) return "1ère partie";
  if (t.includes("seconde partie") || t.includes("2e partie") || t.includes("deuxieme partie"))
    return "2e partie";
  if (t.includes("seconde deliberation") || t.includes("seconde délibération"))
    return "2e délibération";
  if (t.includes("commission mixte paritaire") || t.includes("cmp")) return "Commission mixte (CMP)";
  return "Vote (détail)";
}

// ---- Thème -> pastel + icône
type ThemeKey =
  | "finances"
  | "justice"
  | "sante"
  | "ecologie"
  | "education"
  | "transport"
  | "numerique"
  | "social"
  | "securite"
  | "general";

function inferThemeKey(loi_id: string, title: string): ThemeKey {
  const id = (loi_id ?? "").toLowerCase();
  const t = (title ?? "").toLowerCase();

  if (id.includes("finances") || t.includes("finances") || t.includes("budget") || t.includes("fisc"))
    return "finances";
  if (
    t.includes("justice") ||
    t.includes("pénal") ||
    t.includes("penal") ||
    t.includes("procédure") ||
    t.includes("tribunal")
  )
    return "justice";
  if (
    t.includes("santé") ||
    t.includes("sante") ||
    t.includes("hôpital") ||
    t.includes("hopital") ||
    t.includes("médic")
  )
    return "sante";
  if (
    t.includes("écologie") ||
    t.includes("ecologie") ||
    t.includes("climat") ||
    t.includes("environnement")
  )
    return "ecologie";
  if (
    t.includes("éducation") ||
    t.includes("education") ||
    t.includes("école") ||
    t.includes("ecole") ||
    t.includes("universit")
  )
    return "education";
  if (t.includes("transport") || t.includes("train") || t.includes("route") || t.includes("mobilit"))
    return "transport";
  if (
    t.includes("numérique") ||
    t.includes("numerique") ||
    t.includes("données") ||
    t.includes("donnees") ||
    t.includes("ia") ||
    t.includes("cyber")
  )
    return "numerique";
  if (
    t.includes("travail") ||
    t.includes("emploi") ||
    t.includes("retraite") ||
    t.includes("logement") ||
    t.includes("pouvoir d'achat")
  )
    return "social";
  if (t.includes("sécurité") || t.includes("securite") || t.includes("terror") || t.includes("police"))
    return "securite";

  return "general";
}

function themeToVisual(themeKey: ThemeKey) {
  // pastel (lisible sur dark)
  switch (themeKey) {
    case "finances":
      return { bar: "rgba(147, 197, 253, 0.70)", glow: "rgba(147, 197, 253, 0.10)", icon: "bank" as const };
    case "justice":
      return { bar: "rgba(196, 181, 253, 0.70)", glow: "rgba(196, 181, 253, 0.10)", icon: "scale-balance" as const };
    case "sante":
      return { bar: "rgba(134, 239, 172, 0.65)", glow: "rgba(134, 239, 172, 0.10)", icon: "hospital-box" as const };
    case "ecologie":
      return { bar: "rgba(110, 231, 183, 0.65)", glow: "rgba(110, 231, 183, 0.10)", icon: "leaf" as const };
    case "education":
      return { bar: "rgba(253, 224, 71, 0.55)", glow: "rgba(253, 224, 71, 0.08)", icon: "school" as const };
    case "transport":
      return { bar: "rgba(251, 146, 60, 0.60)", glow: "rgba(251, 146, 60, 0.08)", icon: "train" as const };
    case "numerique":
      return { bar: "rgba(165, 180, 252, 0.65)", glow: "rgba(165, 180, 252, 0.10)", icon: "chip" as const };
    case "social":
      return { bar: "rgba(249, 168, 212, 0.60)", glow: "rgba(249, 168, 212, 0.08)", icon: "account-group" as const };
    case "securite":
      return { bar: "rgba(148, 163, 184, 0.60)", glow: "rgba(148, 163, 184, 0.08)", icon: "shield" as const };
    default:
      return { bar: "rgba(226, 232, 240, 0.35)", glow: "rgba(226, 232, 240, 0.06)", icon: "file-document-outline" as const };
  }
}

/**
 * ✅ NAV UNIQUE (canon)
 * routeFromItemId() renvoie:
 * - /scrutins/... si scrutin-*
 * - /lois/... si loi-*
 * - null sinon (pas de guess)
 */
function pushItem(router: ReturnType<typeof useRouter>, itemId: string) {
  const id = String(itemId || "").trim();
  if (!id) return;

  const href = routeFromItemId(id);
  if (href) {
    router.push(href as any);
  }
}

export default function LoisIndexScreen() {
  const router = useRouter();

  const [tab, setTab] = useState<TabKey>("lois");
  const [raw, setRaw] = useState<LoiListItem[]>([]);
  const [canonRaw, setCanonRaw] = useState<LoiListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const [searchRows, setSearchRows] = useState<LoiFeedSearchRow[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // ✅ cache MV par scrutin-id
  const mvCacheRef = useRef<Record<string, ScrutinCountsRow>>({});
  // ✅ cache agrégé global par baseKey
  const mvAggByBaseKeyRef = useRef<Record<string, ScrutinCountsRow>>({});

  const rebuildAggFromMvCache = useCallback(() => {
    const byId = mvCacheRef.current || {};
    const agg: Record<string, ScrutinCountsRow> = {};

    for (const id of Object.keys(byId)) {
      const r = byId[id];
      if (!r?.loi_id) continue;
      if (!isScrutinBackedId(r.loi_id)) continue;

      const baseKey = stableLawBaseKeyFromScrutinId(r.loi_id);
      const prev = agg[baseKey];

      const nbScr = (prev?.nb_scrutins_total ?? 0) + (r.nb_scrutins_total ?? 0);
      const nbAm = (prev?.nb_amendement_like ?? 0) + (r.nb_amendement_like ?? 0);

      const first =
        [prev?.date_premier_scrutin, r.date_premier_scrutin].filter(Boolean).sort()[0] ?? null;

      const last =
        [prev?.date_dernier_scrutin, r.date_dernier_scrutin]
          .filter(Boolean)
          .sort()
          .slice(-1)[0] ?? null;

      agg[baseKey] = {
        loi_id: baseKey,
        nb_scrutins_total: nbScr,
        nb_amendement_like: nbAm,
        date_premier_scrutin: first,
        date_dernier_scrutin: last,
      };
    }

    mvAggByBaseKeyRef.current = agg;
  }, []);

  const ensureMvLoaded = useCallback(
    async (force = false) => {
      const hasCache = Object.keys(mvCacheRef.current || {}).length > 0;
      if (hasCache && !force) return;

      const { data: cdata, error: ce } = await supabase
        .from("lois_scrutin_counts_mv")
        .select("loi_id,nb_scrutins_total,nb_amendement_like,date_premier_scrutin,date_dernier_scrutin")
        .limit(5000);

      if (ce) {
        console.warn("[LOIS LIST] MV error:", ce);
        return;
      }

      const arr = (cdata ?? []) as any[];
      const nextCache: Record<string, ScrutinCountsRow> = {};
      for (const r of arr) {
        if (!r?.loi_id) continue;
        nextCache[String(r.loi_id)] = {
          loi_id: String(r.loi_id),
          nb_scrutins_total: r.nb_scrutins_total ?? null,
          nb_amendement_like: r.nb_amendement_like ?? null,
          date_premier_scrutin: r.date_premier_scrutin ?? null,
          date_dernier_scrutin: r.date_dernier_scrutin ?? null,
        };
      }
      mvCacheRef.current = nextCache;
      rebuildAggFromMvCache();
    },
    [rebuildAggFromMvCache]
  );

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      setError(null);
      if (mode === "initial") setLoading(true);

      try {
        await ensureMvLoaded(mode === "refresh");
        const countsById = mvCacheRef.current || {};

        // ✅ (B) Charger le feed existant
        const { data, error: e } = await supabase
          .from("lois_app_v3")
          .select(
            "loi_id,titre_loi,nb_scrutins_total,nb_articles,nb_amendements,date_premier_scrutin,date_dernier_scrutin,legislature,resume_citoyen"
          )
          .order("date_dernier_scrutin", { ascending: false })
          .limit(250);

        if (e) throw e;

        const rows = (data ?? []) as LoiAppRow[];

        const base: LoiListItem[] = rows.map((r) => ({
          loi_id: String(r.loi_id),
          titre_loi: (r.titre_loi ?? "").trim() || `Loi ${String(r.loi_id)}`,
          nb_scrutins_total: r.nb_scrutins_total ?? 0,
          nb_articles: r.nb_articles ?? 0,
          nb_amendements: r.nb_amendements ?? 0,
          date_premier_scrutin: r.date_premier_scrutin ?? null,
          date_dernier_scrutin: r.date_dernier_scrutin ?? null,
          legislature: r.legislature ?? null,
          resume_citoyen: r.resume_citoyen ?? null,
          nb_amendement_like: null,
          mapping: null,
          micro_badges: null,
          group_size: null,
          counts_source: "raw",
        }));

        const loiIds = base.map((x) => x.loi_id);

        // Mapping dossier (optionnel)
        let mappings: MappingRow[] = [];
        if (loiIds.length > 0) {
          try {
            const { data: md, error: me } = await supabase
              .from("lois_mapping_best")
              .select("loi_id,id_dossier,confiance,source")
              .in("loi_id", loiIds);

            if (!me && md) mappings = md as MappingRow[];
            if (me) console.warn("[LOIS LIST] mapping error:", me);
          } catch (err) {
            console.warn("[LOIS LIST] mapping exception:", err);
          }
        }

        const mapById = new Map<string, MappingRow>();
        for (const m of mappings) {
          if (m?.loi_id) mapById.set(String(m.loi_id), m);
        }

        // Merge MV → base (pour ids scrutin-*)
        const merged: LoiListItem[] = base.map((x) => {
          const m = mapById.get(x.loi_id);
          const c = countsById[x.loi_id];
          const isScrutinBacked = isScrutinBackedId(x.loi_id);

          const nbScr =
            isScrutinBacked && c?.nb_scrutins_total != null ? c.nb_scrutins_total : x.nb_scrutins_total;

          const amendLike =
            isScrutinBacked && c?.nb_amendement_like != null ? c.nb_amendement_like : x.nb_amendement_like;

          const dFirst =
            isScrutinBacked && c?.date_premier_scrutin ? c.date_premier_scrutin : x.date_premier_scrutin;

          const dLast =
            isScrutinBacked && c?.date_dernier_scrutin ? c.date_dernier_scrutin : x.date_dernier_scrutin;

          // ✅ pour scrutin-backed, on met aussi nb_amendements (fallback UI) si MV présente
          const nbAmendementsFallback =
            isScrutinBacked && typeof amendLike === "number" ? amendLike : x.nb_amendements;

          return {
            ...x,
            nb_scrutins_total: typeof nbScr === "number" ? nbScr : x.nb_scrutins_total,
            nb_amendement_like: amendLike ?? null,
            nb_amendements: nbAmendementsFallback ?? 0,
            date_premier_scrutin: dFirst ?? x.date_premier_scrutin,
            date_dernier_scrutin: dLast ?? x.date_dernier_scrutin,
            mapping: m
              ? {
                  id_dossier: m.id_dossier ?? null,
                  confiance: m.confiance ?? null,
                  source: m.source ?? null,
                }
              : null,
            counts_source: "raw",
          };
        });

        // ✅ fallback agg depuis merged (secours si MV agg incomplet)
        const aggFromMerged = buildAggByBaseKeyFromItems(merged);
        const aggByBaseKeyFinal = {
          ...aggFromMerged,
          ...(mvAggByBaseKeyRef.current || {}),
        };
        mvAggByBaseKeyRef.current = aggByBaseKeyFinal;

        setRaw(merged);

        // ✅ (A) Charger feed canonique
        try {
          const { data: canonData, error: canonErr } = await supabase
            .from("lois_canon_feed_v2_canon")
            .select("loi_canon_id,leader_item_id,leader_date,leader_titre,macro_score")
            .order("leader_date", { ascending: false })
            .limit(250);

          if (canonErr) {
            console.warn("[LOIS LIST] canon feed v2 error:", canonErr);
            setCanonRaw([]);
          } else {
            const canonRows = (canonData ?? []) as LoiCanonFeedV2Row[];

            const canonAsItems: LoiListItem[] = canonRows
              .filter((r) => !!r.leader_item_id)
              .map((r) => {
                const loiCanonId = String(r.loi_canon_id);
                const leaderId = r.leader_item_id ? String(r.leader_item_id) : null;

                const baseKey = leaderId ? stableLawBaseKeyFromScrutinId(leaderId) : null;
                const agg = baseKey ? aggByBaseKeyFinal[baseKey] : undefined;

                const title =
                  (r.leader_titre ?? "").trim() ||
                  (leaderId ?? "") ||
                  canonTitleFromLoiId(loiCanonId);

                const nbScr = typeof agg?.nb_scrutins_total === "number" ? agg.nb_scrutins_total : 0;
                const amendLike =
                  typeof agg?.nb_amendement_like === "number" ? agg.nb_amendement_like : 0;

                return {
                  loi_id: loiCanonId,
                  titre_loi: (title ?? "").trim() || canonTitleFromLoiId(loiCanonId),

                  leader_item_id: leaderId,
                  leader_titre: r.leader_titre ?? null,
                  leader_date: r.leader_date ?? null,
                  leader_scrutin_macro_score: r.macro_score ?? null,

                  nb_scrutins_total: nbScr,
                  nb_articles: 0,
                  nb_amendements: amendLike,
                  date_premier_scrutin: agg?.date_premier_scrutin ?? null,
                  date_dernier_scrutin: agg?.date_dernier_scrutin ?? r.leader_date ?? null,
                  legislature: null,
                  resume_citoyen: null,

                  nb_amendement_like:
                    typeof agg?.nb_amendement_like === "number" ? agg.nb_amendement_like : null,
                  mapping: null,
                  micro_badges: null,
                  group_size: null,
                  counts_source: "agg",
                };
              });

            setCanonRaw(canonAsItems);
          }
        } catch (err) {
          console.warn("[LOIS LIST] canon feed v2 exception:", err);
          setCanonRaw([]);
        }
      } catch (err: any) {
        console.warn("[LOIS LIST] load error:", err);
        setRaw([]);
        setCanonRaw([]);
        setError("Impossible de charger les lois actuellement.");
      } finally {
        if (mode === "initial") setLoading(false);
      }
    },
    [ensureMvLoaded]
  );

  useEffect(() => {
    load("initial");
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load("refresh");
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const runSearch = useCallback(
    async (text: string) => {
      const query = text.trim();
      setSearchError(null);

      if (!query) {
        setSearchRows([]);
        return;
      }

      setSearchLoading(true);
      try {
        await ensureMvLoaded(false);

        const { data, error: e } = await supabase.rpc("search_lois_feed", {
          q: query,
          lim: 80,
        });

        if (e) throw e;
        setSearchRows((data ?? []) as LoiFeedSearchRow[]);
      } catch (err: any) {
        console.warn("[LOIS SEARCH] rpc error:", err);
        setSearchRows([]);
        setSearchError("Recherche indisponible pour le moment.");
      } finally {
        setSearchLoading(false);
      }
    },
    [ensureMvLoaded]
  );

  useEffect(() => {
    const query = q.trim();
    if (!query) {
      setSearchRows([]);
      setSearchError(null);
      setSearchLoading(false);
      return;
    }
    const t = setTimeout(() => runSearch(q), 250);
    return () => clearTimeout(t);
  }, [q, runSearch]);

  const hasQuery = q.trim().length > 0;

  const { loisCount, evenementsCount } = useMemo(() => {
    const acceptTab = (tabWanted: TabKey) => (loi_id: string, title: string) => {
      if (isAmendementLikeForList(loi_id, title)) return false;
      const type = classifyItem(loi_id, title);
      return tabWanted === "evenements" ? type === "evenements" : type === "lois";
    };

    const buildListForTab = (tabWanted: TabKey): LoiListItem[] => {
      const accept = acceptTab(tabWanted);

      if (!hasQuery) {
        if (tabWanted === "lois") {
          const list = canonRaw.filter((x) => accept(x.loi_id, x.titre_loi));
          return dedupeScrutinBacked(list);
        }
        const list = raw.filter((x) => accept(x.loi_id, x.titre_loi));
        return dedupeScrutinBacked(list);
      }

      const countsById = mvCacheRef.current || {};
      const aggByBaseKey = mvAggByBaseKeyRef.current || {};

      const list = searchRows
        .filter((r) => accept(r.loi_id, r.titre_loi_canon))
        .map((r) => {
          const loi_id = String(r.loi_id);
          const isScrutinBacked = isScrutinBackedId(loi_id);

          const baseKey = isScrutinBacked ? stableLawBaseKeyFromScrutinId(loi_id) : null;
          const agg = baseKey ? aggByBaseKey[baseKey] : undefined;
          const c = isScrutinBacked ? countsById[loi_id] : undefined;

          const nbScr = isScrutinBacked
            ? typeof agg?.nb_scrutins_total === "number"
              ? agg.nb_scrutins_total
              : c?.nb_scrutins_total ?? 0
            : 0;

          const amend = isScrutinBacked
            ? typeof agg?.nb_amendement_like === "number"
              ? agg.nb_amendement_like
              : c?.nb_amendement_like ?? 0
            : 0;

          const item: LoiListItem = {
            loi_id,
            titre_loi: (r.titre_loi_canon ?? "").trim() || `Item ${loi_id}`,
            nb_scrutins_total: nbScr,
            nb_articles: 0,
            nb_amendements: amend,
            date_premier_scrutin: isScrutinBacked
              ? agg?.date_premier_scrutin ?? c?.date_premier_scrutin ?? null
              : null,
            date_dernier_scrutin: isScrutinBacked
              ? agg?.date_dernier_scrutin ??
                c?.date_dernier_scrutin ??
                (r.derniere_activite_date ?? null)
              : r.derniere_activite_date ?? null,
            legislature: null,
            resume_citoyen: null,
            nb_amendement_like: isScrutinBacked ? amend : null,
            mapping: null,
            micro_badges: null,
            group_size: null,
            counts_source: isScrutinBacked ? "agg" : "raw",
          };

          return item;
        });

      return dedupeScrutinBacked(list);
    };

    const loisList = buildListForTab("lois");
    const evtsList = buildListForTab("evenements");
    return { loisCount: loisList.length, evenementsCount: evtsList.length };
  }, [hasQuery, raw, searchRows, canonRaw]);

  const screenTitle = tab === "evenements" ? "Événements" : "Lois";
  const searchPlaceholder = tab === "evenements" ? "Chercher un événement…" : "Chercher une loi…";

  const dataToRender: LoiListItem[] = useMemo(() => {
    const accept = (loi_id: string, title: string) => {
      if (isAmendementLikeForList(loi_id, title)) return false;
      const type = classifyItem(loi_id, title);
      return tab === "evenements" ? type === "evenements" : type === "lois";
    };

    if (!hasQuery) {
      if (tab === "lois") {
        const filteredCanon = canonRaw.filter((x) => accept(x.loi_id, x.titre_loi));
        return dedupeScrutinBacked(filteredCanon);
      }
      const filtered = raw.filter((x) => accept(x.loi_id, x.titre_loi));
      return dedupeScrutinBacked(filtered);
    }

    const countsById = mvCacheRef.current || {};
    const aggByBaseKey = mvAggByBaseKeyRef.current || {};

    const mapped = searchRows
      .filter((r) => accept(r.loi_id, r.titre_loi_canon))
      .map((r) => {
        const loi_id = String(r.loi_id);
        const isScrutinBacked = isScrutinBackedId(loi_id);

        const baseKey = isScrutinBacked ? stableLawBaseKeyFromScrutinId(loi_id) : null;
        const agg = baseKey ? aggByBaseKey[baseKey] : undefined;
        const c = isScrutinBacked ? countsById[loi_id] : undefined;

        const nbScr = isScrutinBacked
          ? typeof agg?.nb_scrutins_total === "number"
            ? agg.nb_scrutins_total
            : c?.nb_scrutins_total ?? 0
          : 0;

        const amend = isScrutinBacked
          ? typeof agg?.nb_amendement_like === "number"
            ? agg.nb_amendement_like
            : c?.nb_amendement_like ?? 0
          : 0;

        const item: LoiListItem = {
          loi_id,
          titre_loi: (r.titre_loi_canon ?? "").trim() || `Item ${loi_id}`,
          nb_scrutins_total: nbScr,
          nb_articles: 0,
          nb_amendements: amend,
          date_premier_scrutin: isScrutinBacked
            ? agg?.date_premier_scrutin ?? c?.date_premier_scrutin ?? null
            : null,
          date_dernier_scrutin: isScrutinBacked
            ? agg?.date_dernier_scrutin ??
              c?.date_dernier_scrutin ??
              (r.derniere_activite_date ?? null)
            : r.derniere_activite_date ?? null,
          legislature: null,
          resume_citoyen: null,
          nb_amendement_like: isScrutinBacked ? amend : null,
          mapping: null,
          micro_badges: null,
          group_size: null,
          counts_source: isScrutinBacked ? "agg" : "raw",
        };

        return item;
      });

    return dedupeScrutinBacked(mapped);
  }, [hasQuery, raw, searchRows, tab, canonRaw]);

  const renderItem = useCallback(
    ({ item }: { item: LoiListItem }) => {
      const badge = badgeFromMapping(item.mapping);

      const status = computeStatusLabel(item);
      const tone = toneForStatus(status);

      const lastVote = fmtDateFR(item.date_dernier_scrutin);

      const macroScore = item.leader_scrutin_macro_score ?? null;
      const isMacro = macroScore != null && macroScore >= 80;

      // --- Titre affiché
      let displayTitle = item.titre_loi;
      if (isScrutinBackedId(item.loi_id) && looksLikeAmendementTitle(item.titre_loi)) {
        displayTitle = canonTitleFromLoiId(item.loi_id);
      }

      // --- “Dernière action” non redondante
      const rawActivity = item.leader_titre ? String(item.leader_titre) : "";
      const hasActivity = !!rawActivity.trim();

      const lastActionLabel = hasActivity
        ? isRedundantActivity(displayTitle, rawActivity)
          ? compactActionLabel(rawActivity)
          : isMacro
          ? rawActivity
          : "Vote (détail)"
        : null;

      const bottomMeta = buildBottomMeta(item);

      const baseBadges = computeMicroBadges(item.loi_id, displayTitle);
      const allBadges = mergeBadges(baseBadges, item.micro_badges ?? null);
      const compact = compactBadges(allBadges, 3);
      const shownBadges = compact.shown;
      const restCount = compact.rest;

      const resume = cleanResume(item.resume_citoyen);

      // --- thème visuel (pastel bar + icon)
      const themeKey = inferThemeKey(item.loi_id, displayTitle);
      const visual = themeToVisual(themeKey);

      // ✅ NAV : leader_item_id si présent sinon loi_id, via pushItem() (canon)
      const onOpen = () => {
        const leader = (item.leader_item_id ?? "").trim();
        const target = leader || item.loi_id;
        pushItem(router, target);
      };

      return (
        <Pressable
          style={[styles.card, { shadowColor: "#000" }]}
          onPress={onOpen}
          android_ripple={{ color: "rgba(255,255,255,0.06)" }}
        >
          {/* glow subtil + barre gauche */}
          <View style={[styles.cardGlow, { backgroundColor: visual.glow }]} />
          <View style={[styles.leftBar, { backgroundColor: visual.bar }]} />

          <View style={styles.cardInner}>
            <View style={styles.rowTop}>
              <Text style={styles.title} numberOfLines={3}>
                {displayTitle}
              </Text>

              <View style={styles.rightStack}>
                <View style={styles.iconMedal}>
                  <MaterialCommunityIcons name={visual.icon} size={18} color={colors.text} />
                </View>

                <View style={styles.metaPill}>
                  <Text style={styles.metaPillText}>L{item.legislature ?? "—"}</Text>
                </View>
              </View>
            </View>

            <View style={styles.pillsRow}>
              <Pill label={status} tone={tone} />
              {!!badge && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText} numberOfLines={1}>
                    {badge.label}
                  </Text>
                </View>
              )}
            </View>

            {shownBadges.length > 0 ? (
              <View style={styles.microAllRow}>
                {shownBadges.map((b) => (
                  <Pill key={b.label} label={b.label} tone={b.tone ?? "soft"} micro />
                ))}
                {restCount > 0 ? <Pill label={`+${restCount}`} tone="soft" micro /> : null}
              </View>
            ) : null}

            {resume ? (
              <View style={styles.resumeWrapCompact}>
                <View style={[styles.resumeBarOnCompact, { backgroundColor: visual.bar }]} />
                <Text style={styles.resumeTextCompact} numberOfLines={2}>
                  {resume}
                </Text>
              </View>
            ) : null}

            <View style={styles.lines}>
              <Text style={styles.lineText}>
                Dernier vote : <Text style={styles.lineStrong}>{lastVote}</Text>
              </Text>

              {lastActionLabel ? (
                <Text style={styles.lineText} numberOfLines={1}>
                  Dernière action : <Text style={styles.lineStrong}>{lastActionLabel}</Text>
                </Text>
              ) : null}

              <View style={styles.bottomRow}>
                <Text style={styles.subline} numberOfLines={1}>
                  {bottomMeta}
                </Text>

                <View style={styles.cta}>
                  <Text style={styles.ctaText}>Comprendre →</Text>
                </View>
              </View>
            </View>
          </View>
        </Pressable>
      );
    },
    [router]
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.centerText}>Chargement…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.center}>
          <Text style={[styles.centerText, { color: colors.danger, textAlign: "center" }]}>
            {error}
          </Text>
          <Pressable style={[styles.badge, { marginTop: 12 }]} onPress={() => load("initial")}>
            <Text style={styles.badgeText}>Réessayer</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const showEmpty = dataToRender.length === 0;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.h1}>{screenTitle}</Text>

        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder={searchPlaceholder}
          placeholderTextColor={colors.subtext}
          style={styles.search}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />

        <View style={styles.tabsRow}>
          <TabPill label="Lois" active={tab === "lois"} onPress={() => setTab("lois")} count={loisCount} />
          <TabPill
            label="Événements"
            active={tab === "evenements"}
            onPress={() => setTab("evenements")}
            count={evenementsCount}
          />
        </View>

        {q.trim() && searchLoading ? <Text style={styles.hint}>Recherche…</Text> : null}
        {q.trim() && searchError ? (
          <Text style={[styles.hint, { color: colors.danger }]}>{searchError}</Text>
        ) : null}
      </View>

      <FlatList
        data={dataToRender}
        keyExtractor={(it) => it.loi_id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        refreshing={!q.trim() ? refreshing : false}
        onRefresh={!q.trim() ? onRefresh : undefined}
        ListEmptyComponent={
          showEmpty ? (
            <View style={{ padding: 16 }}>
              <Text style={{ color: colors.subtext }}>
                {q.trim()
                  ? "Aucun résultat dans cet onglet."
                  : tab === "evenements"
                  ? "Aucun événement à afficher pour le moment."
                  : "Aucune loi à afficher pour le moment."}
              </Text>

              {q.trim() ? (
                <Pressable style={[styles.badge, { marginTop: 12 }]} onPress={() => setQ("")}>
                  <Text style={styles.badgeText}>Effacer la recherche</Text>
                </Pressable>
              ) : (
                <Pressable style={[styles.badge, { marginTop: 12 }]} onPress={() => onRefresh()}>
                  <Text style={styles.badgeText}>Rafraîchir</Text>
                </Pressable>
              )}
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },

  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 10,
  },
  h1: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
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
  hint: { color: colors.subtext, fontSize: 12 },

  tabsRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  tabPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  tabPillOn: {
    backgroundColor: "rgba(59,130,246,0.16)",
    borderColor: "rgba(59,130,246,0.30)",
  },
  tabPillOff: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.10)",
  },
  tabPillText: { fontSize: 12, fontWeight: "900" },
  tabPillTextOn: { color: colors.text },
  tabPillTextOff: { color: colors.subtext },

  tabCount: {
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  tabCountOn: { backgroundColor: "rgba(59,130,246,0.22)" },
  tabCountOff: { backgroundColor: "rgba(255,255,255,0.10)" },
  tabCountText: { fontSize: 12, fontWeight: "900" },
  tabCountTextOn: { color: colors.text },
  tabCountTextOff: { color: colors.subtext },

  list: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    paddingTop: 2,
  },

  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 18,
    overflow: "hidden",
  },

  cardGlow: {
    ...StyleSheet.absoluteFillObject,
    opacity: 1,
  },

  leftBar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 6,
  },

  cardInner: {
    padding: 12,
    paddingLeft: 14, // laisse respirer après la barre
    gap: 10,
  },

  rowTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  title: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 19,
  },

  rightStack: { alignItems: "flex-end", gap: 8 },

  iconMedal: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },

  metaPill: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: colors.border,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  metaPillText: {
    color: colors.subtext,
    fontSize: 12,
    fontWeight: "800",
  },

  pillsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },

  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillText: { fontSize: 12, fontWeight: "900" },

  pillSuccess: {
    backgroundColor: "rgba(34,197,94,0.12)",
    borderColor: "rgba(34,197,94,0.28)",
  },
  pillSuccessText: { color: "#86efac" },

  pillWarn: {
    backgroundColor: "rgba(250,204,21,0.10)",
    borderColor: "rgba(250,204,21,0.22)",
  },
  pillWarnText: { color: "#fde68a" },

  pillSoft: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.10)",
  },
  pillSoftText: { color: colors.subtext },

  microPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  microPillText: {
    fontSize: 11,
    fontWeight: "800",
  },

  badge: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: colors.border,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    maxWidth: "60%",
  },
  badgeText: { color: colors.text, fontSize: 12, fontWeight: "800" },

  microAllRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: -2,
  },

  resumeWrapCompact: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    paddingTop: 2,
  },
  resumeBarOnCompact: {
    width: 3,
    borderRadius: 999,
    height: 28,
  },
  resumeTextCompact: {
    flex: 1,
    color: colors.text,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
    opacity: 0.95,
  },

  lines: { gap: 6 },
  lineText: { color: colors.subtext, fontSize: 12 },
  lineStrong: { color: colors.text, fontWeight: "900" },

  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  subline: { flex: 1, color: colors.subtext, fontSize: 12 },

  cta: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "rgba(99,102,241,0.10)",
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.22)",
  },
  ctaText: { color: colors.text, fontSize: 12, fontWeight: "900" },

  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 16 },
  centerText: { color: colors.subtext, marginTop: 10, fontSize: 12 },
});
