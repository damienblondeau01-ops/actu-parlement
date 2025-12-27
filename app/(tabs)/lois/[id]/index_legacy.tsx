// app/(tabs)/lois/[id]/index.tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
  LayoutChangeEvent,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { theme } from "../../../../lib/theme";

import {
  LoiAIIntroBlock,
  LoiHero,
  LoiTLDR,
  LoiImpact,
  LoiVoteResult,
  LoiGroupVotes,
  LoiTimeline,
} from "../../../../components/loi/LoiBlocks";
import type { LoiScreenModel } from "../../../../components/loi/LoiBlocks";

import {
  fetchLoiDetail,
  fetchLoiTimeline,
  fetchVotesGroupesByScrutin,
  type VoteGroupePositionRow,
  type LoiTimelineRow,
  resolveGroupKeyFromAnyId,
} from "../../../../lib/queries/lois";

import { parseScrutinOutcome, outcomeToLabel } from "@/lib/parliament/scrutinResult";
import {
  pickReferenceScrutin as pickReferenceScrutinCanon,
  referenceKindLabel,
} from "@/lib/parliament/referenceScrutin";

import {
  AmendementsHighlights,
  type AmendementHighlight,
} from "@/components/loi/AmendementsHighlights";
import { fetchAmendementsByLoi, pickAmendementsHighlights } from "@/lib/queries/amendements";

// ✅ Route unique (anti erreurs de navigation)
import { routeFromItemId } from "@/lib/routes";

// ✅ (optionnel) un seul log, après tous les imports
console.log("[LOI FILE LOADED] app/(tabs)/lois/[id]/index.tsx");

const colors = theme.colors;
const BORDER = (colors as any)?.border ?? "rgba(255,255,255,0.10)";

type RouteParams = {
  id?: string;

  // ✅ contexte (optionnel) : pour une navigation “récit → preuve → retour”
  fromKey?: string;
  fromLabel?: string;
  anchor?: "timeline" | "vote" | "groups" | "amendements" | "impact";
};

type LoiRow = {
  loi_id: string;
  titre_loi: string | null;
  nb_scrutins_total: number | null;
  nb_articles: number | null;
  nb_amendements: number | null;
  date_premier_scrutin: string | null;
  date_dernier_scrutin: string | null;
  legislature: number | null;
};

type TimelineRow = LoiTimelineRow;

type VotesGroupeRow = {
  // ✅ clé canon de navigation / filtrage
  groupe_norm: string;

  // UI (optionnel)
  groupe_abrev: string | null;
  groupe_nom: string | null;
  groupe_label?: string | null;

  // agrégats
  nb_pour: number;
  nb_contre: number;
  nb_abstention: number;
  nb_nv: number;
};

type VoteGroupePositionRowExt = VoteGroupePositionRow;

// ----------------- Helpers -----------------

function fmtDateFR(d?: string | null) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("fr-FR");
  } catch {
    return "—";
  }
}

function norm(s?: string | null) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(hay: string, needles: string[]) {
  return needles.some((n) => hay.includes(n));
}

// ✅ Détection robuste : kind + objet/titre (car kind peut être "autre")
function isAmendementLikeRow(s: { kind?: string | null; objet?: string | null; titre?: string | null }) {
  const k = (s.kind ?? "").toLowerCase().trim();
  const text = `${s.objet ?? ""} ${s.titre ?? ""}`.toLowerCase();

  // 1) via kind
  if (k.includes("amend")) return true;
  if (k.includes("sous") && k.includes("amend")) return true;

  // 2) via texte (fallback ultra utile quand kind = "autre")
  if (text.includes("amendement")) return true;
  if (text.includes("sous-amendement") || text.includes("sous amendement")) return true;

  return false;
}

function isSousAmendementLikeRow(s: { objet?: string | null; titre?: string | null; kind?: string | null }) {
  const k = (s.kind ?? "").toLowerCase();
  const text = `${s.objet ?? ""} ${s.titre ?? ""}`.toLowerCase();
  return (
    (k.includes("sous") && k.includes("amend")) ||
    text.includes("sous-amendement") ||
    text.includes("sous amendement")
  );
}

function pickTimelineTitleUX(s: TimelineRow, index: number) {
  if (index === 0) return "Vote le plus récent";
  if (index === 1) return "Vote clé";
  if (isAmendementLikeRow(s)) return "Vote sur un amendement";
  if ((s.kind ?? "").toLowerCase().trim() === "article") return "Vote sur une partie du texte";
  return (s.titre ?? "").trim() || "Vote au Parlement";
}

function shortContextFromScrutin(s: TimelineRow) {
  const base =
    (s.article_ref ? `Article ${s.article_ref}` : null) ??
    (isAmendementLikeRow(s) ? "Amendement" : null) ??
    null;

  const objet = (s.objet ?? "").trim();
  if (base && objet) return `${base} — ${objet}`;
  if (base) return base;
  if (objet) return objet;
  return "Vote au Parlement";
}

function extractParentLawLabel(text: string) {
  const t = (text ?? "").toLowerCase();

  // PLF / PLFSS (les plus fréquents)
  const mPlf = t.match(/projet de loi de finances pour\s+\d{4}/i);
  if (mPlf?.[0]) return mPlf[0];

  const mPlfss = t.match(/projet de loi de financement de la s[ée]curit[ée] sociale/i);
  if (mPlfss?.[0]) return mPlfss[0];

  // Générique : "projet/proposition de loi ..."
  const mGen = t.match(/(projet|proposition) de loi[^.()]{10,120}/i);
  if (mGen?.[0]) return mGen[0];

  return null;
}

function smartDisplayTitleAndSubtitle(params: {
  isScrutinBacked: boolean;
  loiTitle: string;
  timeline: TimelineRow[];
}) {
  const { isScrutinBacked, loiTitle, timeline } = params;
  const baseTitle = (loiTitle ?? "").trim();

  if (!isScrutinBacked) {
    return { title: baseTitle, subtitle: "Comprendre l’essentiel en quelques secondes" };
  }

  const textAll =
    `${baseTitle} ` + (timeline ?? []).map((x) => `${x.titre ?? ""} ${x.objet ?? ""}`).join(" ");

  const parent = extractParentLawLabel(textAll);
  const top = timeline?.[0] ?? null;

  const looksAmend =
    baseTitle.toLowerCase().includes("amendement") || (top ? isAmendementLikeRow(top) : false);

  if (parent) {
    const parentNice = parent.charAt(0).toUpperCase() + parent.slice(1);
    if (looksAmend) {
      const amendLabel = (top?.objet ?? "").trim() || (top?.titre ?? "").trim() || baseTitle;
      return {
        title: parentNice,
        subtitle: `Vote sur amendement — ${amendLabel}`.slice(0, 110),
      };
    }
    return {
      title: parentNice,
      subtitle: "Aperçu basé sur les scrutins visibles",
    };
  }

  return {
    title: looksAmend ? "Vote sur un amendement" : "Vote au Parlement",
    subtitle: baseTitle ? baseTitle.slice(0, 110) : "Aperçu basé sur les scrutins visibles",
  };
}

function statusFromResultOrVotes(resultat?: string | null, votes?: { pour: number; contre: number }) {
  // ✅ 1) Texte résultat (source de vérité)
  const labelFromText = outcomeToLabel(parseScrutinOutcome(resultat));
  if (labelFromText) return labelFromText as "Adoptée" | "Rejetée";

  // ✅ 2) Fallback par les chiffres (quand texte absent/flou)
  if (votes) {
    if (votes.pour === 0 && votes.contre === 0) return "En cours" as const;
    return votes.pour >= votes.contre ? ("Adoptée" as const) : ("Rejetée" as const);
  }

  return "En cours" as const;
}

function stanceFromGroupRow(g: VotesGroupeRow): "POUR" | "CONTRE" | "DIVISÉ" {
  const p = g.nb_pour ?? 0;
  const c = g.nb_contre ?? 0;
  const a = g.nb_abstention ?? 0;
  const nv = g.nb_nv ?? 0;
  const max = Math.max(p, c, a, nv);

  if (max === 0) return "DIVISÉ";
  if (p === max) return "POUR";
  if (c === max) return "CONTRE";
  return "DIVISÉ";
}

function normalizePosition(pos?: string | null): "pour" | "contre" | "abstention" | "nv" {
  const x = (pos ?? "").toLowerCase().trim();
  if (!x) return "nv";

  if (x.includes("pour")) return "pour";
  if (x.includes("contre")) return "contre";
  if (x.includes("abst")) return "abstention";

  if (x.includes("non") && x.includes("vot")) return "nv";
  if (x.includes("non-vot")) return "nv";
  if (x === "nv") return "nv";

  return "nv";
}

function groupLabelForUI(g: {
  groupe_abrev: string | null;
  groupe_nom: string | null;
  groupe_label?: string | null;
}) {
  const gl = (g.groupe_label ?? "").trim();
  if (gl) return gl;

  const abrev = (g.groupe_abrev ?? "").trim();
  const nom = (g.groupe_nom ?? "").trim();
  if (abrev && nom) return `${abrev} · ${nom}`;
  return abrev || nom || "—";
}

function aggregateVotesGroupes(rows: VoteGroupePositionRowExt[]): VotesGroupeRow[] {
  const map: Record<string, VotesGroupeRow> = {};

  for (const r of rows ?? []) {
    const gn = (r as any)?.groupe_norm ? String((r as any).groupe_norm).trim() : "";
    if (!gn) continue;

    const abrev = ((r as any)?.groupe_abrev ?? null) as string | null;
    const nom = ((r as any)?.groupe_nom ?? null) as string | null;
    const gl =
      (((r as any)?.groupe_label ?? "") as string).trim() ||
      (abrev ?? "").trim() ||
      (nom ?? "").trim() ||
      gn;

    if (!map[gn]) {
      map[gn] = {
        groupe_norm: gn,
        groupe_abrev: abrev,
        groupe_nom: nom,
        groupe_label: gl,
        nb_pour: 0,
        nb_contre: 0,
        nb_abstention: 0,
        nb_nv: 0,
      };
    }

    const bucket = normalizePosition((r as any)?.position ?? null);
    const n = Number((r as any)?.nb_voix ?? 0) || 0;

    if (bucket === "pour") map[gn].nb_pour += n;
    else if (bucket === "contre") map[gn].nb_contre += n;
    else if (bucket === "abstention") map[gn].nb_abstention += n;
    else map[gn].nb_nv += n;
  }

  return Object.values(map).sort((a, b) =>
    groupLabelForUI(a).localeCompare(groupLabelForUI(b), "fr")
  );
}

function buildEnClair(title: string, timeline: TimelineRow[], statusLabel: string) {
  const objets = (timeline ?? [])
    .map((s) => (s.objet ?? "").trim())
    .filter(Boolean);

  const line1 = `Cette loi porte sur : ${title.trim()}.`;
  const line2 =
    objets.length > 0
      ? `Elle traite notamment de : ${objets[0]}${objets[1] ? `, ${objets[1]}` : ""}.`
      : `Elle progresse par votes successifs au Parlement.`;
  const line3 =
    statusLabel === "Adoptée"
      ? "Le scrutin de référence affiché montre qu’une majorité l’a soutenue."
      : statusLabel === "Rejetée"
      ? "Le scrutin de référence affiché montre qu’une majorité s’y est opposée."
      : "Elle est encore en cours d’examen : les prochains votes peuvent faire basculer l’issue.";

  return [line1, line2, line3].join("\n");
}

function buildPoliticalSummary(groups: { stance: "POUR" | "CONTRE" | "DIVISÉ" }[]) {
  const pour = groups.filter((g) => g.stance === "POUR").length;
  const contre = groups.filter((g) => g.stance === "CONTRE").length;
  const div = groups.filter((g) => g.stance === "DIVISÉ").length;

  if (pour === 0 && contre === 0 && div === 0) return "Positions des groupes indisponibles pour l’instant.";
  if (pour > contre)
    return "Une majorité de groupes politiques soutient le texte, mais cela ne préjuge pas du résultat final du vote.";
  if (contre > pour)
    return "Une majorité de groupes politiques s’oppose au texte, mais cela ne préjuge pas du résultat final du vote.";
  return div > 0
    ? "L’Assemblée est partagée : plusieurs groupes ont une position divisée."
    : "Les positions des groupes sont très partagées.";
}

function FadeInUp({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const y = React.useRef(new Animated.Value(10)).current;
  const o = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(o, {
        toValue: 1,
        duration: 260,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(y, {
        toValue: 0,
        duration: 260,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [delay, o, y]);

  return <Animated.View style={{ opacity: o, transform: [{ translateY: y }] }}>{children}</Animated.View>;
}

function SectionToggle({
  title,
  subtitle,
  open,
  onToggle,
}: {
  title: string;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable onPress={onToggle} style={styles.toggleRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleTitle}>{title}</Text>
        {!!subtitle && <Text style={styles.toggleSub}>{subtitle}</Text>}
      </View>
      <Text style={styles.toggleChevron}>{open ? "—" : "+"}</Text>
    </Pressable>
  );
}

// ✅ Robustesse: mapping d’erreurs vers messages citoyens
function userMessageFromError(err: any) {
  const msg = String(err?.message ?? err ?? "").toLowerCase();
  const code = String(err?.code ?? "");

  if (code === "57014" || msg.includes("statement timeout") || msg.includes("canceling statement")) {
    return "Le chargement prend trop de temps pour l’instant. Réessayez dans un moment.";
  }

  if (msg.includes("network") || msg.includes("failed to fetch") || msg.includes("fetch")) {
    return "Impossible de charger cette loi (problème de connexion).";
  }

  return "Impossible de charger cette loi actuellement.";
}

function isNotFound(loiRow: any) {
  if (!loiRow) return true;
  if (typeof loiRow === "object" && Object.keys(loiRow).length === 0) return true;
  return false;
}

// ----------------- Timeline “narrative” (featured) -----------------
function normalizeResult(resultat?: string | null) {
  const outcome = parseScrutinOutcome(resultat);
  const label = outcomeToLabel(outcome);
  if (!label) return null;
  return { label, outcome };
}

function isStructuralLikeRow(s: {
  kind?: string | null;
  objet?: string | null;
  titre?: string | null;
  article_ref?: string | null;
}) {
  const k = (s.kind ?? "").toLowerCase();
  const text = `${s.titre ?? ""} ${s.objet ?? ""} ${s.article_ref ?? ""}`.toLowerCase();
  if (isAmendementLikeRow(s)) return false;
  if (k.includes("article")) return true;

  const needles = [
    "l'ensemble",
    "l’ensemble",
    "texte",
    "projet de loi",
    "proposition de loi",
    "article liminaire",
    "première partie",
    "premiere partie",
    "1re partie",
    "1ère partie",
    "seconde partie",
    "2e partie",
    "deuxième partie",
    "deuxieme partie",
    "lecture définitive",
    "lecture definitive",
    "nouvelle lecture",
    "commission mixte paritaire",
    "cmp",
    "seconde délibération",
    "seconde deliberation",
    "article unique",
  ];

  return needles.some((n) => text.includes(n));
}

function findDecisiveRow(timelineSortedDesc: TimelineRow[]) {
  for (const s of timelineSortedDesc) {
    const badge = normalizeResult(s.resultat);
    if (badge?.label && isStructuralLikeRow(s)) return s;
  }
  for (const s of timelineSortedDesc) {
    const badge = normalizeResult(s.resultat);
    if (badge?.label) return s;
  }
  return null;
}

function pickFeaturedTimeline(timelineSortedDesc: TimelineRow[], max = 5) {
  const out: TimelineRow[] = [];
  const seen = new Set<string>();

  const push = (s: TimelineRow | null | undefined) => {
    if (!s?.numero_scrutin) return;
    const key = String(s.numero_scrutin);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(s);
  };

  push(timelineSortedDesc.find((s) => isStructuralLikeRow(s)) ?? null);
  push(findDecisiveRow(timelineSortedDesc));

  for (const s of timelineSortedDesc) {
    if (out.length >= max) break;
    if (!isStructuralLikeRow(s)) continue;
    push(s);
  }

  for (const s of timelineSortedDesc) {
    if (out.length >= max) break;
    push(s);
  }

  return out;
}

function sumVotesFromGroups(groups: VotesGroupeRow[]) {
  return (groups ?? []).reduce(
    (acc, g) => {
      acc.pour += g.nb_pour ?? 0;
      acc.contre += g.nb_contre ?? 0;
      acc.abstention += g.nb_abstention ?? 0;
      acc.nv += g.nb_nv ?? 0;
      return acc;
    },
    { pour: 0, contre: 0, abstention: 0, nv: 0 }
  );
}

// ----------------- Périmètre du texte (micro-badges PRO) -----------------
type ScopeBadge = { label: string; tone?: "success" | "warn" | "soft" };

function scopeBadgesFromContext(loiId: string, title: string, timeline: TimelineRow[]) {
  const id = norm(loiId);
  const t = norm(title);
  const textAll = norm((timeline ?? []).map((x) => `${x.titre ?? ""} ${x.objet ?? ""}`).join(" "));

  const badges: ScopeBadge[] = [];
  const push = (b: ScopeBadge) => {
    const key = (b.label || "").trim();
    if (!key) return;
    if (badges.some((x) => x.label === key)) return;
    badges.push(b);
  };

  if (
    id.includes("finances-pour") ||
    t.includes("projet de loi de finances") ||
    textAll.includes("projet de loi de finances")
  ) {
    push({ label: "PLF", tone: "soft" });
  } else if (
    id.includes("financement-de-la-securite-sociale") ||
    t.includes("financement de la sécurité sociale") ||
    t.includes("financement de la securite sociale") ||
    textAll.includes("financement de la securite sociale") ||
    textAll.includes("financement de la sécurité sociale")
  ) {
    push({ label: "PLFSS", tone: "soft" });
  } else if (
    id.includes("proposition-de-loi") ||
    t.includes("proposition de loi") ||
    textAll.includes("proposition de loi")
  ) {
    push({ label: "PPL", tone: "soft" });
  } else if (
    id.includes("projet-de-loi") ||
    t.includes("projet de loi") ||
    textAll.includes("projet de loi")
  ) {
    push({ label: "Projet", tone: "soft" });
  }

  if (
    includesAny(id, ["lecture-definitive", "lecture-définitive"]) ||
    t.includes("lecture définitive") ||
    t.includes("lecture definitive") ||
    textAll.includes("lecture definitive") ||
    textAll.includes("lecture définitive")
  ) {
    push({ label: "Lecture définitive", tone: "warn" });
  } else if (id.includes("nouvelle-lecture") || t.includes("nouvelle lecture") || textAll.includes("nouvelle lecture")) {
    push({ label: "Nouvelle lecture", tone: "warn" });
  } else if (
    id.includes("premiere-lecture") ||
    t.includes("première lecture") ||
    t.includes("premiere lecture") ||
    textAll.includes("première lecture") ||
    textAll.includes("premiere lecture")
  ) {
    push({ label: "1ère lecture", tone: "soft" });
  }

  if (
    includesAny(id, ["commission-mixte-paritaire", "-cmp-", " cmp"]) ||
    t.includes("commission mixte paritaire") ||
    textAll.includes("commission mixte paritaire")
  ) {
    push({ label: "CMP", tone: "warn" });
  }

  const hasEnsemble = textAll.includes("l'ensemble") || textAll.includes("l’ensemble");
  const hasArticleUnique = textAll.includes("article unique");

  const hasArticleLimin = id.includes("article-liminaire") || textAll.includes("article liminaire");
  const hasPremPart =
    id.includes("premiere-partie") || textAll.includes("première partie") || textAll.includes("premiere partie");
  const hasSecPart =
    id.includes("seconde-partie") ||
    textAll.includes("seconde partie") ||
    textAll.includes("deuxième partie") ||
    textAll.includes("deuxieme partie");
  const hasSecondeDelib =
    includesAny(id, ["seconde-deliber", "seconde-délib"]) ||
    textAll.includes("seconde délibération") ||
    textAll.includes("seconde deliberation");

  if (hasArticleLimin) push({ label: "Article liminaire", tone: "warn" });
  if (hasPremPart) push({ label: "1ère partie", tone: "warn" });
  if (hasSecPart) push({ label: "2e partie", tone: "warn" });
  if (hasSecondeDelib) push({ label: "2e délibération", tone: "warn" });

  if (hasEnsemble) push({ label: "Texte complet", tone: "success" });
  else if (hasArticleUnique) push({ label: "Article unique", tone: "warn" });
  else if (textAll.includes("l'article") || textAll.includes("l’article")) push({ label: "Article isolé", tone: "warn" });

  const order = (lab: string) => {
    const l = lab.toLowerCase();
    if (l === "plf" || l === "plfss" || l === "ppl" || l === "projet") return 10;
    if (l.includes("lecture")) return 20;
    if (l === "cmp") return 25;
    if (l.includes("texte complet")) return 30;
    if (l.includes("article")) return 40;
    if (l.includes("partie") || l.includes("délib")) return 50;
    return 80;
  };
  badges.sort((a, b) => order(a.label) - order(b.label));
  return badges;
}

function toneStyles(tone?: "success" | "warn" | "soft") {
  if (tone === "success") return [styles.scopePill, styles.scopePillSuccess];
  if (tone === "warn") return [styles.scopePill, styles.scopePillWarn];
  return [styles.scopePill, styles.scopePillSoft];
}

function toneTextStyles(tone?: "success" | "warn" | "soft") {
  if (tone === "success") return [styles.scopePillText, styles.scopePillTextSuccess];
  if (tone === "warn") return [styles.scopePillText, styles.scopePillTextWarn];
  return [styles.scopePillText, styles.scopePillTextSoft];
}

// ----------------- Screen -----------------
export default function LoiDetailScreen() {
  const router = useRouter();
  const scrollRef = React.useRef<ScrollView>(null);

  // ✅ Normalisation robuste du param id (string | string[] | undefined)
  const params = useLocalSearchParams<RouteParams>();
  const rawId = (params as any)?.id;
  const idStr = useMemo(() => {
    if (typeof rawId === "string") return rawId;
    if (Array.isArray(rawId)) return String(rawId[0] ?? "");
    return "";
  }, [rawId]);

  const fromKey = useMemo(() => String((params as any)?.fromKey ?? "").trim() || null, [params]);
  const fromLabel = useMemo(() => String((params as any)?.fromLabel ?? "").trim() || null, [params]);
  const anchor = useMemo(() => String((params as any)?.anchor ?? "").trim() || null, [params]);

  console.log("[LOI SCREEN] id param =", idStr);

  // ✅ AIRBAG NAV: si on arrive ici avec un "scrutin-*", on redirige direct vers fiche Scrutin
  const isScrutinId = useMemo(() => idStr.startsWith("scrutin-"), [idStr]);

  useEffect(() => {
    if (!isScrutinId) return;
    router.replace(routeFromItemId(idStr) as any);
  }, [idStr, isScrutinId, router]);

  const [loi, setLoi] = useState<LoiRow | null>(null);
  const [timeline, setTimeline] = useState<TimelineRow[]>([]);
  const [groupVotes, setGroupVotes] = useState<VotesGroupeRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [amendHighlights, setAmendHighlights] = useState<AmendementHighlight[]>([]);
  const [amendTotal, setAmendTotal] = useState<number>(0);

  const [showTLDR, setShowTLDR] = useState(false);
  const [showPolitical, setShowPolitical] = useState(false);
  const [showAmendements, setShowAmendements] = useState(false);
  const [showImpact, setShowImpact] = useState(false);

  const [referenceScrutinId, setReferenceScrutinId] = useState<string | null>(null);
  const [referenceKind, setReferenceKind] = useState<string | null>(null);

  const loiId = useMemo(() => (idStr ? String(idStr) : null), [idStr]);

  const isScrutinBacked = useMemo(() => {
    const x = (loiId ?? "").toLowerCase();
    return x.startsWith("scrutin-") || x.includes("scrutin");
  }, [loiId]);

  // ✅ Anchors (scroll to section)
  const [anchorY, setAnchorY] = useState<Record<string, number>>({});
  const [pendingAnchor, setPendingAnchor] = useState<string | null>(null);

  const setAnchor = (key: string) => (e: LayoutChangeEvent) => {
    const y = e?.nativeEvent?.layout?.y ?? 0;
    setAnchorY((m) => ({ ...m, [key]: y }));
  };

  const scrollToAnchor = (key: string) => {
    const y = anchorY[key];
    if (typeof y !== "number") return;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
  };

  useEffect(() => {
    if (!anchor) return;
    if (typeof anchorY[anchor] !== "number") {
      setPendingAnchor(anchor);
      return;
    }
    scrollToAnchor(anchor);
    setPendingAnchor(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor, anchorY]);

  useEffect(() => {
    if (!pendingAnchor) return;
    if (typeof anchorY[pendingAnchor] === "number") {
      scrollToAnchor(pendingAnchor);
      setPendingAnchor(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAnchor, anchorY]);

  const runLoad = React.useCallback(async () => {
    if (!loiId) {
      setNotFound(true);
      setError("Cette loi n’est pas disponible.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setNotFound(false);

    try {
      console.log("[LOI LOAD] start", { loiId });

      const loiRow = (await fetchLoiDetail(loiId)) as unknown as LoiRow;
      console.log("[LOI LOAD] detail ok", { loi_id: (loiRow as any)?.loi_id });

      if (isNotFound(loiRow)) {
        setLoi(null);
        setTimeline([]);
        setGroupVotes([]);
        setReferenceScrutinId(null);
        setReferenceKind(null);
        setNotFound(true);
        setError("Cette loi n’est pas disponible.");
        return;
      }

      setLoi(loiRow ?? null);

      // ✅ TIMELINE : clé robuste (loi_id canon OU group_key résolu)
      const rawKey = String((loiRow as any)?.loi_id ?? loiId).trim();
      let timelineKey = rawKey;

      // si on est sur un agrégateur "scrutin-*", la timeline est indexée par group_key
      if (timelineKey.startsWith("scrutin-")) {
        try {
          const gk = await resolveGroupKeyFromAnyId(timelineKey);
          if (gk) timelineKey = gk;
        } catch (e) {
          console.warn("[LOI LOAD] timelineKey resolveGroupKey error", e);
        }
      }

      const tl = (await fetchLoiTimeline(timelineKey, 250)) as unknown as TimelineRow[];
      const tlSafe = Array.isArray(tl) ? tl : [];
      const tlSorted = [...tlSafe].sort((a, b) => {
        const da = a.date_scrutin ? new Date(a.date_scrutin).getTime() : 0;
        const db = b.date_scrutin ? new Date(b.date_scrutin).getTime() : 0;
        return db - da;
      });

      setTimeline(tlSorted);

      // ✅ Scrutin de référence canonique (sur tlSorted)
      const pick = pickReferenceScrutinCanon(tlSorted as any);
      const numero = pick?.numero_scrutin ? String(pick.numero_scrutin) : null;

      setReferenceScrutinId(numero);
      setReferenceKind(pick?.kind ?? null);

      console.log("[LOI LOAD] reference pick", { numero, kind: pick?.kind, reason: pick?.reason });
    } catch (e: any) {
      console.warn("[LOI DETAIL] load error:", e);
      setLoi(null);
      setTimeline([]);
      setGroupVotes([]);
      setReferenceScrutinId(null);
      setReferenceKind(null);
      setError(userMessageFromError(e));
    } finally {
      setLoading(false);
    }
  }, [loiId]);

  useEffect(() => {
    // ✅ si c’est un scrutin-* on redirige, donc on ne charge pas cette page
    if (!loiId) return;
    if (isScrutinId) return;
    runLoad();
  }, [loiId, runLoad, isScrutinId]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        if (!loiId) return;
        const rows = (await fetchAmendementsByLoi(String(loiId))) ?? [];
        if (!alive) return;

        setAmendTotal(rows.length);
        setAmendHighlights(pickAmendementsHighlights(rows, 6));
      } catch (e) {
        console.warn("[LOI AMENDEMENTS] error:", e);
        if (!alive) return;
        setAmendTotal(0);
        setAmendHighlights([]);
      }
    })();

    return () => {
      alive = false;
    };
  }, [loiId]);

  // ✅ Charge les votes groupes UNIQUEMENT quand referenceScrutinId est prêt
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!referenceScrutinId) {
        setGroupVotes([]);
        return;
      }

      try {
        const rows = (await fetchVotesGroupesByScrutin(referenceScrutinId)) as VoteGroupePositionRowExt[];
        if (cancelled) return;
        setGroupVotes(aggregateVotesGroupes(rows));
      } catch (e) {
        console.warn("[LOI GROUP VOTES] error:", e);
        if (cancelled) return;
        setGroupVotes([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [referenceScrutinId]);

  const referenceScrutin = useMemo(() => {
    if (!referenceScrutinId) return null;
    return timeline.find((r) => String(r.numero_scrutin) === String(referenceScrutinId)) ?? null;
  }, [timeline, referenceScrutinId]);

  const refKindUX = useMemo(() => {
    if (!referenceKind) return null;
    try {
      return referenceKindLabel(referenceKind as any);
    } catch {
      return null;
    }
  }, [referenceKind]);

  const groupRoutingIndex = useMemo(() => {
    const map: Record<string, { groupe_norm: string; groupe_label: string }> = {};

    for (const g of groupVotes ?? []) {
      const gn = (g.groupe_norm ?? "").trim();
      if (!gn) continue;

      const gl = groupLabelForUI(g).trim() || gn;
      const abrev = (g.groupe_abrev ?? "").trim();
      const nom = (g.groupe_nom ?? "").trim();

      map[gn] = { groupe_norm: gn, groupe_label: gl };
      map[gl] = { groupe_norm: gn, groupe_label: gl };
      if (abrev) map[abrev] = { groupe_norm: gn, groupe_label: gl };
      if (nom) map[nom] = { groupe_norm: gn, groupe_label: gl };
    }

    return map;
  }, [groupVotes]);

  const amendementsDetectedCount = useMemo(() => {
    return (timeline ?? []).filter((s) => isAmendementLikeRow(s)).length;
  }, [timeline]);

  const amendementsTotalFromDB = useMemo(() => {
    return loi?.nb_amendements != null ? Number(loi.nb_amendements) : null;
  }, [loi?.nb_amendements]);

  const amendementsCount = useMemo(() => {
    if (amendementsTotalFromDB != null && amendementsTotalFromDB > 0) return amendementsTotalFromDB;
    return amendementsDetectedCount;
  }, [amendementsTotalFromDB, amendementsDetectedCount]);

  const amendementsUI = useMemo(() => {
    return (timeline ?? [])
      .filter((s) => isAmendementLikeRow(s))
      .slice(0, 8)
      .map((s) => ({
        date: fmtDateFR(s.date_scrutin),
        title: (s.objet ?? "").trim() || (s.titre ?? "").trim() || "Amendement",
        description: s.article_ref ? `Article ${s.article_ref}` : "Détail",
        scrutinId: s.numero_scrutin ? String(s.numero_scrutin) : null,
      }));
  }, [timeline]);

  const model: LoiScreenModel | null = useMemo(() => {
    if (!loiId || !loi) return null;

    const baseTitle = (loi.titre_loi ?? "").trim() || `Loi ${String(loiId)}`;

    const voteTotals = sumVotesFromGroups(groupVotes);

    const hasTotals =
      (voteTotals.pour ?? 0) + (voteTotals.contre ?? 0) + (voteTotals.abstention ?? 0) > 0;

    const hasResultText = !!(referenceScrutin?.resultat ?? "").trim();

    const statusLabel = hasResultText
      ? statusFromResultOrVotes(referenceScrutin?.resultat ?? null)
      : hasTotals
      ? statusFromResultOrVotes(null, { pour: voteTotals.pour, contre: voteTotals.contre })
      : ("En cours" as const);

    const { title, subtitle } = smartDisplayTitleAndSubtitle({
      isScrutinBacked,
      loiTitle: baseTitle,
      timeline: timeline ?? [],
    });

    const timelineCitizen = (timeline ?? []).filter((s) => !isAmendementLikeRow(s));

    const aiIntro = {
      title: "En clair",
      summary: buildEnClair(title, timelineCitizen, statusLabel),
    };

    const nbArticleApercu = (timeline ?? []).filter(
      (s) => String(s.kind ?? "").toLowerCase().trim() === "article"
    ).length;

    const nbSousAmendementApercu = (timeline ?? []).filter((s) => isSousAmendementLikeRow(s)).length;

    const nbAmendementApercu = amendementsDetectedCount;

    const nbAutresApercu = Math.max(
      0,
      (timeline?.length ?? 0) - (nbArticleApercu + nbAmendementApercu + nbSousAmendementApercu)
    );

    const nbArticleTotal = isScrutinBacked
      ? nbArticleApercu
      : loi.nb_articles != null
      ? Number(loi.nb_articles)
      : nbArticleApercu;

    const nbAmendementTotal = isScrutinBacked
      ? nbAmendementApercu
      : loi.nb_amendements != null
      ? Number(loi.nb_amendements)
      : nbAmendementApercu;

    const nbSousAmendementTotal = nbSousAmendementApercu;

    const nbAutresTotal = isScrutinBacked
      ? nbAutresApercu
      : Math.max(
          0,
          Number(loi.nb_scrutins_total ?? 0) -
            (nbArticleTotal + nbAmendementTotal + nbSousAmendementTotal)
        ) || nbAutresApercu;

    const tldr: string[] = [];
    if (referenceScrutin?.date_scrutin) tldr.push(`Scrutin de référence : ${fmtDateFR(referenceScrutin.date_scrutin)}`);
    if (loi.date_dernier_scrutin) tldr.push(`Dernier vote (dans la liste) : ${fmtDateFR(loi.date_dernier_scrutin)}`);

    const groups = groupVotes.map((g) => ({
      label: (g.groupe_abrev ?? "").trim() || groupLabelForUI(g),
      stance: stanceFromGroupRow(g),
    }));

    const featured = pickFeaturedTimeline(timeline ?? [], 5);

    const timelineUI = featured.map((s, idx) => ({
      date: fmtDateFR(s.date_scrutin),
      title: idx === 0 ? "Vote le plus récent" : idx === 1 ? "Vote clé" : pickTimelineTitleUX(s, idx),
      description: shortContextFromScrutin(s),
      scrutinId: s.numero_scrutin,
      kind: s.kind,
    }));

    return {
      title,
      subtitle,
      statusLabel,
      aiIntro,
      tldr,
      impact: [
        { label: isScrutinBacked ? "Articles (aperçu)" : "Articles", value: String(nbArticleTotal) },
        { label: isScrutinBacked ? "Amendements (aperçu)" : "Amendements", value: String(nbAmendementTotal) },
        { label: isScrutinBacked ? "Sous-amendements (aperçu)" : "Sous-amendements", value: String(nbSousAmendementTotal) },
        { label: isScrutinBacked ? "Autres (aperçu)" : "Autres", value: String(nbAutresTotal) },
      ],
      vote: { pour: voteTotals.pour, contre: voteTotals.contre, abstention: voteTotals.abstention },
      groups,
      timeline: timelineUI,
    };
  }, [loiId, loi, timeline, groupVotes, isScrutinBacked, amendementsDetectedCount, referenceScrutin]);

  const politicalSummary = useMemo(() => {
    if (!model) return undefined;
    return buildPoliticalSummary(model.groups);
  }, [model]);

  const scopeBadges = useMemo(() => {
    if (!loiId || !model) return [];
    return scopeBadgesFromContext(loiId, model.title, timeline);
  }, [loiId, model, timeline]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.centerHint}>Chargement des informations sur la loi…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !model) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.errorText}>
            {error ?? (notFound ? "Cette loi n’est pas disponible." : "Aucune donnée disponible pour cette loi.")}
          </Text>

          <View style={{ height: 12 }} />

          <Pressable style={styles.actionBtn} onPress={runLoad}>
            <Text style={styles.actionBtnText}>Réessayer</Text>
          </Pressable>

          <Pressable style={styles.linkBtn} onPress={() => router.back()}>
            <Text style={styles.linkText}>← Retour</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const isEmptyTimeline = isScrutinBacked && (timeline?.length ?? 0) === 0;

  if (isEmptyTimeline) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.errorText}>
            Cet élément ressemble à un scrutin / événement, mais aucune timeline n’est associée dans la base.
          </Text>

          <View style={{ height: 10 }} />

          <Text style={styles.centerHint}>
            👉 Corrige la navigation : un item “scrutin-*” doit ouvrir la fiche Scrutin, pas la fiche Loi.
          </Text>

          <View style={{ height: 14 }} />

          <Pressable style={styles.actionBtn} onPress={() => router.back()}>
            <Text style={styles.actionBtnText}>← Retour</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const amendementsSubtitle = isScrutinBacked
    ? `Aperçu (vote affiché) · ${amendementsCount} repéré(s) dans cette page`
    : `Aperçu des derniers amendements · ${amendementsCount} au total`;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
        {/* ✅ context bar (optionnel) */}
        {fromKey ? (
          <View style={styles.contextBar}>
            <View style={{ flex: 1 }}>
              <Text style={styles.contextKicker}>Tu viens de</Text>
              <Text style={styles.contextTitle} numberOfLines={1}>
                {fromLabel ?? "un récit"}
              </Text>
            </View>

            <Pressable
              onPress={() => router.back()}
              style={styles.contextBtn}
              android_ripple={{ color: "rgba(255,255,255,0.06)" }}
            >
              <Text style={styles.contextBtnText}>← Retour</Text>
            </Pressable>
          </View>
        ) : null}

        <FadeInUp delay={0}>
          <LoiHero m={model} />
        </FadeInUp>

        {/* ✅ CTA vers la nouvelle fiche V1 */}
        <FadeInUp delay={20}>
          <Pressable
            onPress={() => {
              if (!loiId) return;
              router.push(
                {
                  pathname: "/(tabs)/lois/[id]/v1",
                  params: {
                    id: String(loiId),
                    ...(fromKey ? { fromKey } : {}),
                    ...(fromLabel ? { fromLabel } : {}),
                  },
                } as any
              );
            }}
            style={({ pressed }) => [styles.v1CtaCard, pressed && { opacity: 0.92 }]}
            android_ripple={{ color: "rgba(255,255,255,0.06)" }}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.v1CtaTitle}>Nouvelle fiche (V1)</Text>
              <Text style={styles.v1CtaSub} numberOfLines={2}>
                Plus claire, centrée sur la loi (avec preuves).
              </Text>
            </View>

            <Text style={styles.v1CtaArrow}>Ouvrir →</Text>
          </Pressable>
        </FadeInUp>

        <FadeInUp delay={40}>
          <View style={styles.scopeCard}>
            <View style={styles.scopeHeader}>
              <Text style={styles.scopeTitle}>Périmètre du texte</Text>
              {isScrutinBacked ? <Text style={styles.scopeHint}>Basé sur les scrutins visibles</Text> : null}
            </View>

            {scopeBadges.length ? (
              <View style={styles.scopeRow}>
                {scopeBadges.slice(0, 8).map((b) => (
                  <View key={b.label} style={toneStyles(b.tone)}>
                    <Text style={toneTextStyles(b.tone)} numberOfLines={1}>
                      {b.label}
                    </Text>
                  </View>
                ))}
                {scopeBadges.length > 8 ? (
                  <View style={toneStyles("soft")}>
                    <Text style={toneTextStyles("soft")}>+{scopeBadges.length - 8}</Text>
                  </View>
                ) : null}
              </View>
            ) : (
              <Text style={styles.scopeEmpty}>Périmètre non précisé dans les scrutins disponibles.</Text>
            )}

            {isScrutinBacked ? (
              <Text style={styles.scopeFoot}>
                Une loi peut être examinée par étapes (article liminaire, première partie, CMP…). Ici, nous rendons
                explicite le périmètre réel du vote affiché.
              </Text>
            ) : null}
          </View>
        </FadeInUp>

        <FadeInUp delay={60}>
          <LoiAIIntroBlock m={model} />
        </FadeInUp>

        {isScrutinBacked && (
          <FadeInUp delay={90}>
            <View style={styles.noteCard}>
              <Text style={styles.noteTitle}>Contexte</Text>
              <Text style={styles.noteText}>
                Cette page agrège plusieurs scrutins liés à un même sujet. Les chiffres “Résultat du scrutin de
                référence” et “Position des groupes” sont calculés à partir d’un scrutin choisi comme référence.
                {refKindUX ? ` Scrutin de référence : ${refKindUX}.` : ""}
              </Text>
            </View>
          </FadeInUp>
        )}

        {/* ✅ ANCHOR: timeline */}
        <View onLayout={setAnchor("timeline")}>
          <FadeInUp delay={120}>
            <LoiTimeline
              m={model}
              onStepPress={(scrutinId) => {
                const sid = (scrutinId ?? "").trim();
                if (!sid) return;
                router.push(routeFromItemId(sid) as any);
              }}
              onSeeAll={() => {
                if (!loiId) return;
                router.push({
                  pathname: "/(tabs)/lois/[id]/timeline",
                  params: { id: String(loiId) },
                } as any);
              }}
            />
          </FadeInUp>
        </View>

        {/* ✅ ANCHOR: vote */}
        <View onLayout={setAnchor("vote")}>
          <FadeInUp delay={180}>
            <LoiVoteResult m={model} />
          </FadeInUp>
        </View>

        {/* ✅ ANCHOR: groups */}
        <View onLayout={setAnchor("groups")}>
          <FadeInUp delay={240}>
            <LoiGroupVotes
  m={model}
  onGroupPress={(groupLabel) => {
    const key = (groupLabel ?? "").trim();
    if (!key || !loiId) return;

    const hit = groupRoutingIndex[key];
    if (!hit?.groupe_norm) return;

    router.push({
      pathname: "/(tabs)/lois/[id]/groupes/[groupe]/deputes",
      params: {
        id: String(loiId),
        groupe: String(hit.groupe_norm),
        ...(referenceScrutinId ? { vs: String(referenceScrutinId) } : {}),
        ...(hit.groupe_label ? { groupe_label: hit.groupe_label } : {}),
      },
    } as any);
  }}
/>
          </FadeInUp>
        </View>

        <FadeInUp delay={300}>
          <View style={styles.foldCard}>
            <SectionToggle
              title="À retenir"
              subtitle="Résumé factuel"
              open={showTLDR}
              onToggle={() => setShowTLDR((v) => !v)}
            />
            {showTLDR ? <LoiTLDR m={model} /> : null}
          </View>
        </FadeInUp>

        {!!politicalSummary && (
          <FadeInUp delay={360}>
            <View style={styles.foldCard}>
              <SectionToggle
                title="Lecture politique"
                subtitle="Interprétation (optionnelle)"
                open={showPolitical}
                onToggle={() => setShowPolitical((v) => !v)}
              />
              {showPolitical ? (
                <View style={styles.politicalInner}>
                  <Text style={styles.politicalText}>{politicalSummary}</Text>
                </View>
              ) : null}
            </View>
          </FadeInUp>
        )}

        <AmendementsHighlights
          items={amendHighlights}
          totalCount={amendTotal}
          onPressItem={(it) => {
            const href = (it as any)?.link?.href ? String((it as any).link.href) : "";
            if (!href) return;

            // ✅ Si c'est un id item (scrutin-* / loi-*), on passe par la route canon
            if (href.startsWith("scrutin-") || href.startsWith("loi-")) {
              router.push(routeFromItemId(href) as any);
              return;
            }

            // ✅ Sinon on accepte une URL interne déjà prête
            router.push(href as any);
          }}
        />

        {/* ✅ ANCHOR: amendements */}
        <View onLayout={setAnchor("amendements")}>
          <FadeInUp delay={420}>
            <View style={styles.foldCard}>
              <SectionToggle
                title="Amendements & sous-amendements"
                subtitle={amendementsSubtitle}
                open={showAmendements}
                onToggle={() => setShowAmendements((v) => !v)}
              />

              {showAmendements ? (
                <View style={{ paddingTop: 8 }}>
                  {(amendementsUI?.length ?? 0) === 0 ? (
                    <Text style={styles.politicalText}>Aucun amendement n’apparaît dans l’aperçu actuel.</Text>
                  ) : (
                    amendementsUI.map((a, idx) => (
                      <Pressable
                        key={`${a.scrutinId ?? "x"}-${idx}`}
                        onPress={() => {
                          const sid = (a.scrutinId ?? "").trim();
                          if (!sid) return;
                          router.push(routeFromItemId(sid) as any);
                        }}
                        style={{
                          paddingVertical: 10,
                          borderTopWidth: idx === 0 ? 0 : 1,
                          borderTopColor: BORDER,
                        }}
                      >
                        <Text style={{ color: colors.text, fontWeight: "800", fontSize: 13 }}>{a.title}</Text>
                        <Text style={{ color: colors.subtext, marginTop: 3, fontSize: 12 }}>
                          {a.date} • {a.description}
                        </Text>
                      </Pressable>
                    ))
                  )}
                </View>
              ) : null}
            </View>
          </FadeInUp>
        </View>

        {/* ✅ ANCHOR: impact */}
        <View onLayout={setAnchor("impact")}>
          <FadeInUp delay={480}>
            <View style={styles.foldCard}>
              <SectionToggle
                title="Détails"
                subtitle="Informations techniques"
                open={showImpact}
                onToggle={() => setShowImpact((v) => !v)}
              />
              {showImpact ? <LoiImpact m={model} /> : null}
            </View>
          </FadeInUp>
        </View>

        {isScrutinBacked && (
          <FadeInUp delay={540}>
            <Text style={styles.disclaimer}>
              Les chiffres affichés correspondent aux scrutins visibles et au scrutin sélectionné comme référence.
            </Text>
          </FadeInUp>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 12, paddingBottom: 24 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 16 },

  centerHint: { color: colors.subtext, marginTop: 10, fontSize: 12 },

  errorText: {
    color: colors.danger,
    textAlign: "center",
    paddingHorizontal: 16,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
  },

  actionBtn: {
    marginTop: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: BORDER,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  actionBtnText: { color: colors.text, fontWeight: "900", fontSize: 12 },

  linkBtn: { marginTop: 10, paddingHorizontal: 10, paddingVertical: 8 },
  linkText: { color: colors.subtext, fontSize: 12, fontWeight: "800" },

  // ✅ Context bar (récit → preuve)
  contextBar: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  contextKicker: { color: colors.subtext, fontSize: 11, fontWeight: "900" },
  contextTitle: { color: colors.text, fontSize: 13, fontWeight: "900", marginTop: 2 },
  contextBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: BORDER,
  },
  contextBtnText: { color: colors.text, fontSize: 12, fontWeight: "900" },

  foldCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },

  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 2,
    paddingVertical: 6,
  },
  toggleTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  toggleSub: {
    color: colors.subtext,
    fontSize: 12,
    marginTop: 2,
  },
  toggleChevron: {
    color: colors.subtext,
    fontSize: 18,
    fontWeight: "900",
    width: 22,
    textAlign: "right",
  },

  politicalInner: {
    paddingTop: 8,
    paddingHorizontal: 2,
  },
  politicalText: {
    color: colors.subtext,
    fontSize: 13,
    lineHeight: 18,
  },
  disclaimer: {
    marginTop: 8,
    color: colors.subtext,
    fontSize: 12,
    lineHeight: 16,
    opacity: 0.85,
  },

  noteCard: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    padding: 12,
  },
  noteTitle: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 6,
  },
  noteText: {
    color: colors.subtext,
    fontSize: 12,
    lineHeight: 16,
  },

  scopeCard: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    padding: 12,
  },
  scopeHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 8,
  },
  scopeTitle: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "900",
  },
  scopeHint: {
    color: colors.subtext,
    fontSize: 11,
    fontWeight: "800",
  },
  scopeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  scopeEmpty: {
    color: colors.subtext,
    fontSize: 12,
    lineHeight: 16,
    opacity: 0.9,
  },
  scopeFoot: {
    marginTop: 8,
    color: colors.subtext,
    fontSize: 11,
    lineHeight: 15,
    opacity: 0.85,
  },

  scopePill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: "100%",
  },
  scopePillText: {
    fontSize: 11,
    fontWeight: "900",
  },
  scopePillSuccess: {
    backgroundColor: "rgba(34,197,94,0.12)",
    borderColor: "rgba(34,197,94,0.28)",
  },
  scopePillTextSuccess: { color: "#86efac" },

  scopePillWarn: {
    backgroundColor: "rgba(250,204,21,0.10)",
    borderColor: "rgba(250,204,21,0.22)",
  },
  scopePillTextWarn: { color: "#fde68a" },

  scopePillSoft: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.10)",
  },
  scopePillTextSoft: { color: colors.subtext },

  // ✅ CTA V1
  v1CtaCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "rgba(99,102,241,0.08)",
  },
  v1CtaTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900",
  },
  v1CtaSub: {
    marginTop: 4,
    color: colors.subtext,
    fontSize: 12,
    lineHeight: 16,
  },
  v1CtaArrow: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "900",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
});
