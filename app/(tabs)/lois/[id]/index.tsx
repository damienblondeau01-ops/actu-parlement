// app/(tabs)/lois/[id]/index.tsx
// ✅ SQUELETTE CANON v0.1 — “Bulletin (papier)”
// Objectif: structure + règles d’affichage (pas de logique métier complexe)
// ✅ Ici: on branche le MINIMUM fiable : Header + Timeline depuis DB (fetchLoiDetail / fetchLoiTimeline)
// Le reste (TLDR IA / Votes / Measures / Sources riches) viendra ensuite.

import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
  LayoutChangeEvent,
  Linking, // ✅ FIX: ouvrir les liens externes (https://...)
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";

import {
  fetchLoiDetail,
  fetchLoiTimeline,
  fetchLoiTimelineCanon,
  fetchLoiSources,
  fetchLoiTexte,
} from "../../../../lib/queries/lois";
import type {
  LoiTimelineRow,
  LoiSourceItem,
  LoiTexteRow,
} from "../../../../lib/queries/lois";

import { buildCanonHeader, fmtDateFR } from "@/lib/lois/canonAdapter";
import { titleFromCanonKey } from "@/lib/lois/title";
import { buildTLDRv0 } from "@/lib/lois/tldr";

import LoiSourcesBlock from "@/components/loi/LoiSourcesBlock";

import { generateEnClairV1 } from "@/lib/ai/enClair";
import type { EnClairItem } from "@/lib/ai/types";

// ✅ Votes (V0) — par scrutin / par groupes
import {
  fetchVotesGroupesForScrutins,
  type VoteGroupeRow,
} from "@/lib/queries/votes";

// ✅ regroupement canon (UI-only)
import { groupTimelineByYear } from "@/lib/loi/timelineCanon";

/** =========================
 *  ✅ THÈME “PAPIER” (comme Actu)
 *  ========================= */
const PAPER = "#F6F1E8";
const PAPER_CARD = "#FBF7F0";
const INK = "#121417";
const INK_SOFT = "rgba(18,20,23,0.72)";
const LINE = "rgba(18,20,23,0.14)";

type RouteParams = {
  id?: string;
  canonKey?: string;

  // provenance
  fromKey?: string;
  fromLabel?: string;

  // ✅ titre éditorial (citoyen) propagé depuis Actu
  heroTitle?: string;

  // ✅ fallback si DB vide
  seedScrutin?: string;

  // ✅ restore Actu
  restoreId?: string;
  restoreOffset?: string;

  anchor?:
    | "resume" // ✅ A1
    | "tldr"
    | "context"
    | "impact"
    | "timeline"
    | "votes"
    | "measures"
    | "sources";
};

/** =========================
 *  ✅ RÉSUMÉ V0 (MANUEL) — A1
 *  =========================
 *  Règle: bloc statique, écrit à la main, uniquement pour la loi spéciale.
 *  Objectif: tester la lisibilité citoyenne, avant automatisation IA.
 */
type ResumeV0 = {
  title?: string;
  sentences: string[];
  note?: string;
};
function isLoiSpecialeKey(canonKey: string, id: string) {
  const ck = String(canonKey ?? "").toLowerCase();
  const _id = String(id ?? "").toLowerCase();

  // ✅ déclencheurs robustes (canonKey "loi:..." ou slug "scrutin-public-...loi-speciale...")
  if (ck.includes("loi-speciale")) return true;
  if (_id.includes("loi-speciale")) return true;

  // ✅ si jamais le canonKey est "loi:...article-45..." (loi spéciale art. 45)
  if (ck.includes("article-45") && ck.includes("loi:")) return true;
  if (_id.includes("article-45") && _id.includes("scrutin-public-")) return true;

  return false;
}

/** =========================
 *  CANON MODEL (UI-only)
 *  ========================= */
type CanonProof = {
  label: string;
  href: string;
};

type CanonTLDRBullet = {
  text: string;
  proof: CanonProof; // ✅ obligatoire
};

type CanonHeader = {
  title: string;
  status:
    | "Adoptée"
    | "En cours"
    | "Rejetée"
    | "Retirée"
    | "Promulguée"
    | "—";
  lastStepLabel: string;
  lastStepDate: string;
  oneLiner: string;
};

type CanonContext = {
  problem: string;
  sponsor: string;
  audience: string;
};

type CanonImpactCard = {
  title: string;
  body: string;
  proof?: CanonProof;
};

type CanonTimelineStep = {
  label: string;
  date?: string;
  result?: string;
  proofs?: CanonProof[];
};

type CanonVotes = {
  global: {
    pour: number;
    contre: number;
    abstention: number;
    participation?: number;
  };
  byGroups: Array<{
    groupLabel: string;
    pour: number;
    contre: number;
    abstention: number;
    positionMajoritaire: "POUR" | "CONTRE" | "ABSTENTION" | "DIVISÉ";
  }>;
};

type CanonMeasures = {
  articles?: Array<{ label: string; changes: string[]; proofs?: CanonProof[] }>;
  amendmentsTop?: Array<{ label: string; why: string; proof: CanonProof }>;
};

type CanonSources = {
  updatedAt: string;
  sources: Array<{ label: string; href: string }>;
};

type CanonModel = {
  header: CanonHeader;
  tldr: CanonTLDRBullet[];
  context?: CanonContext;
  impact?: CanonImpactCard[];
  timeline: CanonTimelineStep[];
  votes?: CanonVotes;
  measures?: CanonMeasures;
  sources: CanonSources;
};

/** =========================
 *  UI helpers
 *  ========================= */
function SectionTitle({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.sectionHead}>
      <View style={{ flex: 1 }}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {!!subtitle && <Text style={styles.sectionSub}>{subtitle}</Text>}
      </View>
      {right}
    </View>
  );
}

function ProofLink({
  p,
  onPress,
}: {
  p: CanonProof;
  onPress: (href: string) => void;
}) {
  return (
    <Pressable onPress={() => onPress(p.href)} style={styles.proofPill}>
      <Text style={styles.proofText}>↳ {p.label}</Text>
    </Pressable>
  );
}

function Fold({
  title,
  subtitle,
  children,
  defaultOpen = false,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={styles.card}>
      <Pressable onPress={() => setOpen((v) => !v)} style={styles.foldRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.foldTitle}>{title}</Text>
          {!!subtitle && <Text style={styles.foldSub}>{subtitle}</Text>}
        </View>
        <Text style={styles.foldIcon}>{open ? "—" : "+"}</Text>
      </Pressable>
      {open ? <View style={{ paddingTop: 10 }}>{children}</View> : null}
    </View>
  );
}

function toLoiSourcesUI(rows: any[]): LoiSourceItem[] {
  return (Array.isArray(rows) ? rows : [])
    .map((r) => {
      // cas où c'est déjà au bon format UI
      if (r && typeof r === "object" && "url" in r && "label" in r) {
        return r as LoiSourceItem;
      }

      // cas format DB (source_url/source_label/source_kind)
      return {
        kind: String((r as any)?.source_kind ?? (r as any)?.kind ?? "SOURCE"),
        label: String((r as any)?.source_label ?? (r as any)?.label ?? "Source"),
        url: String((r as any)?.source_url ?? (r as any)?.url ?? ""),
        date: (r as any)?.source_date ?? null,
      } as LoiSourceItem;
    })
    .filter((x) => !!x.url);
}

/** =========================
 *  ✅ Canon helper (copie légère depuis Actu)
 *  - but: si l'écran reçoit un slug "scrutin-public-..." on reconstruit "loi:..."
 *  ========================= */
function cleanSpaces(s: string) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
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

/** =========================
 *  Screen
 *  ========================= */
export default function LoiDetailCanonScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<RouteParams>();
  const scrollRef = useRef<ScrollView>(null);

  const id = useMemo(() => {
    const raw = (params as any)?.id;
    if (typeof raw === "string") return raw;
    if (Array.isArray(raw)) return String(raw[0] ?? "");
    return "";
  }, [params]);

  const canonKey = useMemo(() => {
    const v = (params as any)?.canonKey;
    if (typeof v === "string") return v.trim();
    if (Array.isArray(v)) return String(v[0] ?? "").trim();
    return "";
  }, [params]);

  // ✅ LOCK heroTitle au mount (ne doit jamais être écrasé)
  const pHeroTitle = String((params as any)?.heroTitle ?? "").trim();
  const pFromLabel = String((params as any)?.fromLabel ?? "").trim();
  const lockedHeroTitleRef = useRef<string>("");
  if (!lockedHeroTitleRef.current) {
    lockedHeroTitleRef.current = pHeroTitle || pFromLabel || "";
  }
  const lockedHeroTitle = lockedHeroTitleRef.current;

  /**
   * ✅ LOI KEY (ultra robuste)
   * - priorité canonKey si "loi:..."
   * - sinon si id ressemble à un slug "scrutin-public-..." -> canonFromSlug -> "loi:..."
   * - sinon id
   */
  const loiKey = useMemo(() => {
    const ck = String((params as any)?.canonKey ?? "").trim();
    if (ck && ck.startsWith("loi:")) return ck;

    const rawId = String(id ?? "").trim();
    const maybeCanon = canonFromSlug(rawId);
    if (maybeCanon && maybeCanon.startsWith("loi:")) return maybeCanon;

    return rawId;
  }, [params, id]);

  /**
   * ✅ RESTORE TIMELINE QUERY KEY (anti-casse)
   * - si on a un slug "scrutin-..." -> on l'utilise (source "scrutins_data", nickel)
   * - sinon fallback canonKey "loi:..." (fetchLoiTimeline résout / ou canon tente d’abord)
   */
  const timelineQueryKey = useMemo(() => {
    if (id?.startsWith("scrutin-")) return id;
    const ck = String((params as any)?.canonKey ?? "").trim();
    if (ck) return ck;
    return "";
  }, [id, params]);

  const fromKey = useMemo(() => {
    const v = (params as any)?.fromKey;
    if (typeof v === "string") return v.trim();
    if (Array.isArray(v)) return String(v[0] ?? "").trim();
    return "";
  }, [params]);

  const fromLabel = useMemo(() => {
    const v = (params as any)?.fromLabel;
    if (typeof v === "string") return v.trim();
    if (Array.isArray(v)) return String(v[0] ?? "").trim();
    return "";
  }, [params]);

  const seedScrutin = useMemo(() => {
    const v = (params as any)?.seedScrutin;
    if (typeof v === "string") return v.trim();
    if (Array.isArray(v)) return String(v[0] ?? "").trim();
    return "";
  }, [params]);

  const restoreId = useMemo(() => {
    const v = (params as any)?.restoreId;
    if (typeof v === "string") return v.trim();
    if (Array.isArray(v)) return String(v[0] ?? "").trim();
    return "";
  }, [params]);

  const restoreOffset = useMemo(() => {
    const v = (params as any)?.restoreOffset;
    if (typeof v === "string") return v.trim();
    if (Array.isArray(v)) return String(v[0] ?? "").trim();
    return "";
  }, [params]);

  const initialAnchor = useMemo(() => {
    const v = (params as any)?.anchor;
    if (typeof v === "string") return v.trim();
    if (Array.isArray(v)) return String(v[0] ?? "").trim();
    return "";
  }, [params]);

  // ✅ Titre humain depuis canonKey/slug — fallback si DB n’a pas de titre
  const titleFromId = useMemo(
    () => titleFromCanonKey(canonKey || id),
    [canonKey, id]
  );

  // ✅ Retour intelligent : si on vient d'Actu => on revient sur Actu en restaurant l’item, sinon back normal
  const goBackSmart = () => {
    if (fromKey === "actu") {
      router.replace({
        pathname: "/actu",
        params: {
          restoreId: restoreId || undefined,
          restoreOffset: restoreOffset || undefined,
          restoreTs: String(Date.now()),
        },
      } as any);
      return;
    }
    router.back();
  };

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [loiTitle, setLoiTitle] = useState<string | null>(null);
  const [timelineRows, setTimelineRows] = useState<LoiTimelineRow[]>([]);

  // ✅ DB-first: sources + texte + IA “En clair”
  const [sources, setSources] = useState<LoiSourceItem[]>([]);
  const [loiTexte, setLoiTexte] = useState<LoiTexteRow | null>(null);
  const [enClair, setEnClair] = useState<EnClairItem[]>([]);

  // ✅ Votes (V0): par scrutin -> par groupes
  const [votesByScrutin, setVotesByScrutin] = useState<
    Record<string, VoteGroupeRow[]>
  >({});

  // ✅ anchors (canonical)
  const [anchorY, setAnchorY] = useState<Record<string, number>>({});
  const setAnchor = (key: string) => (e: LayoutChangeEvent) => {
    const y = e?.nativeEvent?.layout?.y ?? 0;
    setAnchorY((m) => ({ ...m, [key]: y }));
  };

  const scrollToAnchor = useCallback(
    (key: string) => {
      const y = anchorY[key];
      if (typeof y !== "number") return;
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 10), animated: true });
    },
    [anchorY]
  );

  // ✅ navigation “preuve”
  const openHref = useCallback(
    async (href: string) => {
      const h = String(href ?? "").trim();
      if (!h) return;

      // ✅ EXTERNE: http(s), mailto, tel
      if (/^(https?:\/\/|mailto:|tel:)/i.test(h)) {
        try {
          const ok = await Linking.canOpenURL(h);
          if (ok) await Linking.openURL(h);
          else console.log("[OPENHREF] cannot open url:", h);
        } catch (e) {
          console.log(
            "[OPENHREF] open external error =",
            (e as any)?.message ?? e
          );
        }
        return;
      }

      // ✅ INTERNE: routes app
      if (h.startsWith("/")) {
        router.push(h as any);
        return;
      }

      // ✅ fallback interne (ancien comportement) : on force un path
      router.push(("/" + h.replace(/^\/+/, "")) as any);
    },
    [router]
  );

  useEffect(() => {
    console.log("[LOI PARAMS]", {
      id,
      canonKey,
      heroTitle: lockedHeroTitle, // ✅ lock visible en debug
      seedScrutin,
      fromKey,
      fromLabel,
      loiKey,
      timelineQueryKey,
    });
  }, [
    id,
    canonKey,
    lockedHeroTitle,
    seedScrutin,
    fromKey,
    fromLabel,
    loiKey,
    timelineQueryKey,
  ]);

  /**
   * ✅ RESET propre sur changement d'ID (évite “flash”)
   */
  useLayoutEffect(() => {
    setError(null);
    setLoiTitle(null);
    setTimelineRows([]);
    setLoading(!!id);
    // ✅ reset DB-first
    setSources([]);
    setLoiTexte(null);
    setEnClair([]);
    setVotesByScrutin({});
  }, [id]);

  // ✅ Load minimal: title + timeline
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setError(null);

        if (!id) {
          setLoiTitle(null);
          setTimelineRows([]);
          setError("Identifiant loi manquant.");
          setLoading(false);
          return;
        }

        const loi = await fetchLoiDetail(loiKey);

        const dbTitle = ((loi as any)?.titre_loi ?? null) as string | null;
        const computedTitle =
          (dbTitle && String(dbTitle).trim()) ||
          titleFromCanonKey((loi as any)?.loi_id_canon ?? canonKey ?? id) ||
          titleFromId ||
          null;

        /**
         * ✅ TIMELINE (ANTI-CASSE)
         * 1) Tente CANON si canonKey "loi:..."
         * 2) Si vide -> fallback legacy (celle qui marchait) avec timelineQueryKey
         */
        let tl: any[] = [];

        if (canonKey && canonKey.startsWith("loi:")) {
          try {
            tl = await fetchLoiTimelineCanon(canonKey, 500);
            console.log(
              "[LOI TIMELINE] canon =",
              canonKey,
              "| got =",
              Array.isArray(tl) ? tl.length : 0
            );
          } catch (e) {
            console.log(
              "[LOI TIMELINE] canon error =",
              (e as any)?.message ?? e
            );
            tl = [];
          }
        }

        // ✅ fallback si canon vide OU pas de canonKey
        if ((!Array.isArray(tl) || tl.length === 0) && timelineQueryKey) {
          tl = await fetchLoiTimeline(timelineQueryKey, 500);
          console.log(
            "[LOI TIMELINE] fallback =",
            timelineQueryKey,
            "| got =",
            Array.isArray(tl) ? tl.length : 0
          );
        }

        const rows = Array.isArray(tl) ? ((tl as any) as LoiTimelineRow[]) : [];

        // ✅ Tri robuste : date DESC puis numero DESC
        rows.sort((a, b) => {
          const da = a?.date_scrutin ? Date.parse(String(a.date_scrutin)) : 0;
          const db = b?.date_scrutin ? Date.parse(String(b.date_scrutin)) : 0;

          const A = Number.isFinite(da) ? da : 0;
          const B = Number.isFinite(db) ? db : 0;

          if (B !== A) return B - A;

          const na =
            Number(String(a?.numero_scrutin ?? "").replace(/\D+/g, "")) || 0;
          const nb =
            Number(String(b?.numero_scrutin ?? "").replace(/\D+/g, "")) || 0;
          return nb - na;
        });

        if (!alive) return;
        setLoiTitle(computedTitle);
        setTimelineRows(rows);

        console.log("[LOI SCREEN] id =", id);
        console.log("[LOI SCREEN] loiKey =", loiKey);
        console.log("[LOI SCREEN] timelineQueryKey =", timelineQueryKey);
        console.log("[LOI SCREEN] timeline count =", rows.length);
        console.log("[LOI SCREEN] sample row =", rows[0]);
      } catch (e) {
        if (!alive) return;
        setLoiTitle(null);
        setTimelineRows([]);
        setError("Impossible de charger cette loi.");
        console.log("[LOI ERROR]", (e as any)?.message ?? e);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [id, loiKey, timelineQueryKey, titleFromId, canonKey]);

  // ✅ Load votes (V0) depuis les scrutins du parcours
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const ids = Array.from(
          new Set(
            (timelineRows ?? [])
              .map((r) => String((r as any)?.numero_scrutin ?? "").trim())
              .filter(Boolean)
          )
        );

        if (ids.length === 0) {
          if (!alive) return;
          setVotesByScrutin({});
          return;
        }

        // ✅ V0 perf: on limite (les plus récents -> timelineRows déjà triée DESC)
        const idsTop = ids.slice(0, 8);

        const rows = await fetchVotesGroupesForScrutins(idsTop);

        if (!alive) return;

        const grouped: Record<string, VoteGroupeRow[]> = {};
        for (const r of rows ?? []) {
          const k = String((r as any)?.numero_scrutin ?? "").trim();
          if (!k) continue;
          if (!grouped[k]) grouped[k] = [];
          grouped[k].push(r);
        }

        // tri interne: groupes “plus gros” d’abord (proxy: total)
        Object.keys(grouped).forEach((k) => {
          grouped[k].sort((a, b) => {
            const ta = (a.pour ?? 0) + (a.contre ?? 0) + (a.abstention ?? 0);
            const tb = (b.pour ?? 0) + (b.contre ?? 0) + (b.abstention ?? 0);
            return tb - ta;
          });
        });

        setVotesByScrutin(grouped);
      } catch (e) {
        if (!alive) return;
        console.log("[LOI VOTES] error =", (e as any)?.message ?? e);
        setVotesByScrutin({});
      }
    })();

    return () => {
      alive = false;
    };
  }, [timelineRows]);

  // ✅ Load DB-first: sources + texte (isolé, zéro impact timeline)
  useEffect(() => {
    let alive = true;

    (async () => {
      if (!id) {
        if (!alive) return;
        setSources([]);
        setLoiTexte(null);
        return;
      }

      // ✅ on essaie d’abord avec loiKey (canonKey si dispo), sinon id
      const keyPrimary = String(loiKey ?? "").trim() || String(id).trim();
      const keyFallback = String(id).trim();

      try {
        const s1 = await fetchLoiSources(keyPrimary);
        const s = (s1?.length ? s1 : await fetchLoiSources(keyFallback)) as any[];
        if (!alive) return;
        // ✅ important: on garde en state le format LoiSourceItem (UI)
        setSources(toLoiSourcesUI(s) ?? []);
      } catch (e) {
        if (!alive) return;
        console.log("[LOI SOURCES] error =", (e as any)?.message ?? e);
        setSources([]);
      }

      try {
        const t1 = await fetchLoiTexte(keyPrimary);
        const t = (t1 ? t1 : await fetchLoiTexte(keyFallback)) as
          | LoiTexteRow
          | null;
        if (!alive) return;
        setLoiTexte(t ?? null);
      } catch (e) {
        if (!alive) return;
        console.log("[LOI TEXTE] error =", (e as any)?.message ?? e);
        setLoiTexte(null);
      }
    })();

    return () => {
      alive = false;
    };
  }, [id, loiKey]);

  // ✅ IA “En clair” V1 (preuves obligatoires : sources)
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        if (!id) {
          if (!alive) return;
          setEnClair([]);
          return;
        }

        const items = await generateEnClairV1({
          loiId: String(id),
          texteIntegralClean: loiTexte?.texte_integral_clean ?? null,
          exposeMotifsText: null, // ⚠️ on ne l’a pas encore en texte, donc null (safe)
          sources: sources ?? [],
        });

        if (!alive) return;
        setEnClair(items ?? []);
      } catch (e) {
        if (!alive) return;
        console.log("[EN CLAIR] error =", (e as any)?.message ?? e);
        setEnClair([]);
      }
    })();

    return () => {
      alive = false;
    };
  }, [id, loiTexte, sources]);

  /** =========================
   *  ✅ A1 — Résumé V0 MANUEL (uniquement loi spéciale)
   *  ========================= */
  const resumeV0: ResumeV0 | null = useMemo(() => {
    if (!id) return null;

    const match = isLoiSpecialeKey(canonKey, id);
    if (!match) return null;

    return {
      title: "Résumé (V0 — rédigé à la main)",
      sentences: [
        "Cette loi spéciale autorise l’État à continuer à fonctionner quand le budget annuel n’est pas encore voté.",
        "Elle permet de maintenir les dépenses indispensables, comme le paiement des salaires publics et le fonctionnement des services de l’État.",
        "Elle assure la continuité des services essentiels (impôts, sécurité sociale, hôpitaux, services publics).",
        "Elle ne remplace pas le budget annuel et ne fixe pas les priorités budgétaires de l’année.",
      ],
      note:
        "V0 manuel: ce texte est un prototype éditorial (pas encore généré automatiquement).",
    };
  }, [id, canonKey]);

  /** =========================
   *  ✅ TIMELINE UI (canon: groupTimelineByYear)
   *  ========================= */
  const timelineSections = useMemo(() => {
    return groupTimelineByYear(timelineRows);
  }, [timelineRows]);

  /** =========================
   *  ✅ VOTES UI helpers (V0)
   *  ========================= */
  const voteScrutinIds = useMemo(() => {
    const ids = Object.keys(votesByScrutin ?? {});
    const order = (timelineRows ?? [])
      .map((r) => String((r as any)?.numero_scrutin ?? "").trim())
      .filter(Boolean);

    // garde l'ordre timeline (si présent), sinon stable
    ids.sort((a, b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      if (ia === -1 && ib === -1) return String(b).localeCompare(String(a));
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });

    return ids;
  }, [votesByScrutin, timelineRows]);

  const globalFromGroups = (rows: VoteGroupeRow[]) => {
    const g = { pour: 0, contre: 0, abstention: 0 };
    for (const r of rows ?? []) {
      g.pour += Number((r as any)?.pour ?? 0);
      g.contre += Number((r as any)?.contre ?? 0);
      g.abstention += Number((r as any)?.abstention ?? 0);
    }
    return g;
  };

  const fmtPct = (x: number, total: number) => {
    if (!total) return "0%";
    return `${Math.round((x / total) * 100)}%`;
  };

  /** =========================
   *  ✅ MODEL (memo)
   *  ========================= */
  const model: CanonModel = useMemo(() => {
    const editorialFromActu =
      fromKey === "actu" ? String(fromLabel ?? "").trim() : "";

    // ✅ règle universelle: H1 = heroTitle (lock) sinon fromLabel (si Actu) sinon DB sinon canon
    const h1 =
      lockedHeroTitle?.trim() ||
      editorialFromActu ||
      loiTitle?.trim() ||
      titleFromId?.trim() ||
      "Loi";

    const fallbackHeader: CanonHeader = {
      title: h1,
      status: "—",
      lastStepLabel: "—",
      lastStepDate: "—",
      oneLiner: "—",
    };

    if (!id) {
      return {
        header: fallbackHeader,
        tldr: [],
        context: undefined,
        impact: undefined,
        timeline: [{ label: "Parcours", date: "—", result: "—", proofs: [] }],
        votes: undefined,
        measures: undefined,
        sources: { updatedAt: "Mis à jour: —", sources: [] },
      };
    }

    const last = timelineRows?.[0] ?? null;

    let header: CanonHeader = fallbackHeader;
    try {
      header = buildCanonHeader({
        loiTitle: h1,
        referenceResultText: last?.resultat ?? null,
        lastTimelineLabel: (last?.titre ?? "").trim() || "Dernier vote",
        lastTimelineDate: last?.date_scrutin ?? null,
      }) as any;
    } catch {
      header = fallbackHeader;
    }

    // ✅ Timeline depuis DB
    let timeline: CanonTimelineStep[] = (timelineRows ?? []).map((r) => {
      const sid = r.numero_scrutin ? String(r.numero_scrutin) : "";
      return {
        label: (r.titre ?? "").trim() || "Étape",
        date: fmtDateFR(r.date_scrutin),
        result: (r.resultat ?? "").trim() || undefined,
        proofs: sid
          ? [
              {
                label: `Voir scrutin ${sid}`,
                href: `/scrutins/${encodeURIComponent(sid)}`,
              },
            ]
          : [],
      };
    });

    // ✅ Fallback Parcours si DB vide : utiliser seedScrutin
    if (timeline.length === 0 && seedScrutin) {
      const sid = String(seedScrutin).trim();
      if (sid) {
        timeline = [
          {
            label: "Vote (détecté via le récit Actu)",
            date: "—",
            result: "—",
            proofs: [
              {
                label: `Voir scrutin ${sid}`,
                href: `/scrutins/${encodeURIComponent(sid)}`,
              },
            ],
          },
        ];
      }
    }

    // ✅ TLDR v0 : d'abord DB, sinon fallback via seedScrutin
    let tldr: CanonTLDRBullet[] = buildTLDRv0({
      loiId: id,
      loiTitle: h1,
      timeline: timelineRows as any,
    });

    if (tldr.length === 0 && seedScrutin) {
      const sid = String(seedScrutin).trim();
      if (sid) {
        tldr = [
          {
            text: "Dernier vote détecté via le récit Actu (données détaillées en cours de branchement).",
            proof: {
              label: `Voir le scrutin ${sid}`,
              href: `/scrutins/${encodeURIComponent(sid)}`,
            },
          },
        ];
      }
    }

    return {
      header,
      tldr,
      context: undefined,
      impact: undefined,
      timeline: timeline.length
        ? timeline
        : [{ label: "Parcours", date: "—", result: "—", proofs: [] }],
      votes: undefined,
      measures: undefined,
      sources: {
        updatedAt: "Mis à jour: —",
        sources: [
          { label: "Fiche loi (app)", href: `/lois/${encodeURIComponent(id)}` },
        ],
      },
    };
  }, [
    id,
    lockedHeroTitle,
    fromKey,
    fromLabel,
    loiTitle,
    timelineRows,
    titleFromId,
    seedScrutin,
  ]);

  const showTLDR = model.tldr.length > 0;

  const displaySources: LoiSourceItem[] = useMemo(() => {
    // 1) DB -> déjà au format UI (kind/label/url)
    if (sources && sources.length > 0) return sources;

    // 2) Fallback minimal officiel si la DB est vide
    return toLoiSourcesUI([
      {
        kind: "AN_LISTE",
        label: "Assemblée nationale — projets de loi",
        url: "https://www2.assemblee-nationale.fr/documents/liste?type=projets-loi",
        date: null,
      },
      {
        kind: "DATA_AN",
        label: "data.assemblee-nationale.fr",
        url: "https://data.assemblee-nationale.fr/",
        date: null,
      },
    ]);
  }, [sources]);

  const showEnClairV1 = enClair.length > 0;
  const showEnClairAny = showEnClairV1 || showTLDR;

  // ✅ auto-scroll anchor si demandé (après layout + chargement)
  const didAutoScroll2 = useRef(false);
  useEffect(() => {
    if (didAutoScroll2.current) return;
    if (loading) return;
    if (!initialAnchor) return;

    const key = String(initialAnchor);
    const y = (anchorY as any)[key];
    if (typeof y !== "number") return;

    didAutoScroll2.current = true;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 10), animated: true });
  }, [loading, initialAnchor, anchorY]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <Text style={styles.muted}>Chargement…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.safe}>
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <Text style={styles.muted}>{error}</Text>
          <View style={{ height: 12 }} />
          <Pressable onPress={goBackSmart} style={styles.contextBtn}>
            <Text style={styles.contextBtnText}>← Retour</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
        {/* ✅ Barre haut */}
        <View style={styles.contextBar}>
          <View style={{ flex: 1 }}>
            {fromKey ? (
              <>
                <Text style={styles.contextKicker}>Tu viens de</Text>
                <Text style={styles.contextTitle} numberOfLines={1}>
                  {fromLabel || "un récit"}
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.contextKicker}>Navigation</Text>
                <Text style={styles.contextTitle} numberOfLines={1}>
                  Retour
                </Text>
              </>
            )}
          </View>

          <Pressable onPress={goBackSmart} style={styles.contextBtn}>
            <Text style={styles.contextBtnText}>← Retour</Text>
          </Pressable>
        </View>

        {/* 0) HEADER */}
        <View style={styles.heroCard}>
          <Text style={styles.heroTitle} numberOfLines={2}>
            {model.header.title}
          </Text>

          <View style={styles.heroMetaRow}>
            <View style={styles.statusPill}>
              <Text style={styles.statusText}>{model.header.status}</Text>
            </View>

            <Text style={styles.heroMeta}>
              {model.header.lastStepLabel} • {model.header.lastStepDate}
            </Text>
          </View>

          <Text style={styles.heroOneLiner} numberOfLines={2}>
            {model.header.oneLiner}
          </Text>

          <View style={styles.anchorRow}>
            {!!resumeV0 && (
              <Pressable
                onPress={() => scrollToAnchor("resume")}
                style={styles.anchorBtn}
              >
                <Text style={styles.anchorText}>Résumé</Text>
              </Pressable>
            )}

            {showEnClairAny && (
              <Pressable
                onPress={() => scrollToAnchor("tldr")}
                style={styles.anchorBtn}
              >
                <Text style={styles.anchorText}>En clair</Text>
              </Pressable>
            )}

            <Pressable
              onPress={() => scrollToAnchor("timeline")}
              style={styles.anchorBtn}
            >
              <Text style={styles.anchorText}>Parcours</Text>
            </Pressable>

            <Pressable
              onPress={() => scrollToAnchor("votes")}
              style={styles.anchorBtn}
            >
              <Text style={styles.anchorText}>Votes</Text>
            </Pressable>

            <Pressable
              onPress={() => scrollToAnchor("sources")}
              style={styles.anchorBtn}
            >
              <Text style={styles.anchorText}>Sources</Text>
            </Pressable>
          </View>
        </View>

        {/* ✅ A1) RÉSUMÉ V0 (MANUEL) */}
        {!!resumeV0 && (
          <View onLayout={setAnchor("resume")}>
            <View style={styles.card}>
              <SectionTitle
                title={resumeV0.title ?? "Résumé (V0)"}
                subtitle="Prototype éditorial — lisible en 20 secondes"
                right={
                  <View style={styles.v0Pill}>
                    <Text style={styles.v0PillText}>V0</Text>
                  </View>
                }
              />

              <View style={{ gap: 10 }}>
                {resumeV0.sentences.map((s, idx) => (
                  <Text key={`v0-${idx}`} style={styles.bullet}>
                    • {s}
                  </Text>
                ))}
              </View>

              {!!resumeV0.note && (
                <Text style={[styles.muted, { marginTop: 10 }]}>
                  {resumeV0.note}
                </Text>
              )}
            </View>
          </View>
        )}

        {/* 1) TL;DR */}
        <View onLayout={setAnchor("tldr")}>
          <View style={styles.card}>
            <SectionTitle
              title="En clair"
              subtitle="IA assistante — chaque point est vérifiable"
            />
            {showEnClairV1 ? (
              <View style={{ gap: 10 }}>
                {enClair.map((item, idx) => (
                  <View key={`enclair-${idx}`} style={{ gap: 6 }}>
                    <Text style={styles.bullet}>• {item.text}</Text>

                    {(item as any)?.source_url ? (
                      <ProofLink
                        p={{
                          label: String((item as any)?.source_label ?? "Source"),
                          href: String((item as any)?.source_url),
                        }}
                        onPress={openHref}
                      />
                    ) : null}
                  </View>
                ))}
              </View>
            ) : !showTLDR ? (
              <Text style={styles.muted}>
                Pas assez de preuves pour générer un TL;DR fiable (pas encore
                branché).
              </Text>
            ) : (
              <View style={{ gap: 10 }}>
                {model.tldr.slice(0, 6).map((b, idx) => (
                  <View key={`tldr-${idx}`} style={{ gap: 6 }}>
                    <Text style={styles.bullet}>• {b.text}</Text>
                    <ProofLink p={b.proof} onPress={openHref} />
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* 4) Timeline */}
        <View onLayout={setAnchor("timeline")}>
          <View style={styles.card}>
            <SectionTitle
              title="Parcours législatif"
              subtitle="Lecture simple — classée par année"
              right={
                timelineRows.length > 12 ? (
                  <Text style={styles.muted}>+{timelineRows.length - 12}</Text>
                ) : null
              }
            />

            <View style={{ gap: 10 }}>
              {timelineSections.length === 0 ? (
                model.timeline.map((s, idx) => (
                  <View key={`step-${idx}`} style={styles.timelineRow}>
                    <View style={styles.timelineLeft}>
                      <View style={styles.timelineDot} />
                      {idx < model.timeline.length - 1 ? (
                        <View style={styles.timelineLine} />
                      ) : null}
                    </View>

                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={styles.timelineLabel}>{s.label}</Text>
                      <Text style={styles.muted}>
                        {(s.date ?? "—") + (s.result ? ` • ${s.result}` : "")}
                      </Text>

                      {(s.proofs?.length ?? 0) > 0 ? (
                        <View style={styles.proofRow}>
                          {s.proofs?.slice(0, 3).map((p) => (
                            <ProofLink key={p.label} p={p} onPress={openHref} />
                          ))}
                        </View>
                      ) : null}
                    </View>
                  </View>
                ))
              ) : (
                timelineSections.map((sec) => (
                  <View key={`sec-${sec.yearLabel}`} style={{ gap: 10 }}>
                    <View style={styles.yearHeader}>
                      <Text style={styles.yearTitle}>{sec.yearLabel}</Text>
                      <Text style={styles.yearCount}>{sec.items.length}</Text>
                    </View>

                    {sec.items.map((r, idx) => {
                      const sid = r.numero_scrutin ? String(r.numero_scrutin) : "";
                      const label = (r.titre ?? "").trim() || "Étape";
                      const date = fmtDateFR(r.date_scrutin);
                      const result = (r.resultat ?? "").trim() || "";

                      return (
                        <View
                          key={`${sec.yearLabel}-${sid || idx}`}
                          style={styles.timelineRow}
                        >
                          <View style={styles.timelineLeft}>
                            <View style={styles.timelineDot} />
                          </View>

                          <View style={{ flex: 1, gap: 4 }}>
                            <Text style={styles.timelineLabel}>{label}</Text>
                            <Text style={styles.muted}>
                              {(date ?? "—") + (result ? ` • ${result}` : "")}
                            </Text>

                            {sid ? (
                              <View style={styles.proofRow}>
                                <ProofLink
                                  p={{
                                    label: `Voir scrutin ${sid}`,
                                    href: `/scrutins/${encodeURIComponent(sid)}`,
                                  }}
                                  onPress={openHref}
                                />
                              </View>
                            ) : null}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ))
              )}
            </View>
          </View>
        </View>

        {/* 5) Votes (V0) */}
        <View onLayout={setAnchor("votes")}>
          <View style={styles.card}>
            <SectionTitle
              title="Votes"
              subtitle="Résultats par scrutin — puis détail par groupes"
              right={
                voteScrutinIds.length ? (
                  <Text style={styles.muted}>{voteScrutinIds.length} scrutin(s)</Text>
                ) : null
              }
            />

            {voteScrutinIds.length === 0 ? (
              <Text style={styles.muted}>
                Pas de votes disponibles (pas de scrutin détecté ou table non branchée).
              </Text>
            ) : (
              <View style={{ gap: 10 }}>
                {voteScrutinIds.map((sid, idx) => {
                  const rows = (votesByScrutin as any)?.[sid] ?? [];
                  const g = globalFromGroups(rows);
                  const total = g.pour + g.contre + g.abstention;

                  return (
                    <Fold
                      key={`vote-${sid}`}
                      title={`Scrutin ${sid}`}
                      subtitle={`Global: ${g.pour} pour • ${g.contre} contre • ${g.abstention} abst. (${total} exprimés)`}
                      defaultOpen={idx === 0}
                    >
                      <View style={{ gap: 6, marginBottom: 8 }}>
                        <Text style={styles.muted}>
                          Pour: {g.pour} ({fmtPct(g.pour, total)}) • Contre: {g.contre} (
                          {fmtPct(g.contre, total)}) • Abst.: {g.abstention} (
                          {fmtPct(g.abstention, total)})
                        </Text>

                        <Pressable
                          onPress={() =>
                            openHref(`/scrutins/${encodeURIComponent(sid)}`)
                          }
                          style={styles.sourceRow}
                        >
                          <Text style={styles.sourceLabel}>
                            Voir le détail du scrutin →
                          </Text>
                          <Text style={styles.chev}>→</Text>
                        </Pressable>
                      </View>

                      <View style={{ gap: 8 }}>
                        {rows.slice(0, 12).map((r: VoteGroupeRow, j: number) => {
                          const label = (r.groupe_label || r.groupe || "Groupe").trim();
                          const t =
                            (r.pour ?? 0) + (r.contre ?? 0) + (r.abstention ?? 0);
                          const pos = String((r as any)?.position_majoritaire ?? "")
                            .trim()
                            .toUpperCase();

                          return (
                            <View
                              key={`g-${sid}-${label}-${j}`}
                              style={styles.voteGroupRow}
                            >
                              <Text style={styles.voteGroupTitle}>
                                {label}
                                {pos ? ` — ${pos}` : ""}
                              </Text>
                              <Text style={styles.muted}>
                                {r.pour} pour • {r.contre} contre • {r.abstention} abst.
                                (total {t})
                              </Text>
                            </View>
                          );
                        })}

                        {rows.length > 12 ? (
                          <Text style={styles.muted}>+{rows.length - 12} groupes</Text>
                        ) : null}
                      </View>
                    </Fold>
                  );
                })}
              </View>
            )}
          </View>
        </View>

        {/* 7) Sources */}
        <View onLayout={setAnchor("sources")}>
          <View style={styles.card}>
            <SectionTitle title="Sources" subtitle={model.sources.updatedAt} />

            <View style={{ gap: 10 }}>
              <LoiSourcesBlock sources={displaySources} />

              {model.sources.sources.slice(0, 6).map((s) => (
                <Pressable
                  key={s.label}
                  onPress={() => openHref(s.href)}
                  style={styles.sourceRow}
                >
                  <Text style={styles.sourceLabel}>{s.label}</Text>
                  <Text style={styles.chev}>→</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.muted, { marginTop: 10 }]}>
              Règle: la page se termine toujours par la traçabilité.
            </Text>
          </View>
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

/** =========================
 *  Styles (papier)
 *  ========================= */
const BORDER = LINE;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PAPER },
  content: { padding: 16, gap: 12, paddingBottom: 28 },

  contextBar: {
    backgroundColor: PAPER_CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  contextKicker: { color: INK_SOFT, fontSize: 11, fontWeight: "900" },
  contextTitle: {
    color: INK,
    fontSize: 13,
    fontWeight: "900",
    marginTop: 2,
  },
  contextBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(18,20,23,0.04)",
    borderWidth: 1,
    borderColor: BORDER,
  },
  contextBtnText: { color: INK, fontSize: 12, fontWeight: "900" },

  heroCard: {
    backgroundColor: PAPER_CARD,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 10,
  },
  heroTitle: {
    color: INK,
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 22,
  },
  heroMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(18,20,23,0.04)",
    borderWidth: 1,
    borderColor: BORDER,
  },
  statusText: { color: INK, fontSize: 11, fontWeight: "900" },
  heroMeta: { color: INK_SOFT, fontSize: 12, fontWeight: "800" },
  heroOneLiner: {
    color: INK_SOFT,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },

  anchorRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  anchorBtn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "rgba(18,20,23,0.03)",
  },
  anchorText: { color: INK, fontSize: 12, fontWeight: "900" },

  card: {
    backgroundColor: PAPER_CARD,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 10,
  },
  sectionTitle: { color: INK, fontSize: 13, fontWeight: "900" },
  sectionSub: {
    color: INK_SOFT,
    fontSize: 12,
    marginTop: 2,
    fontWeight: "700",
  },

  // ✅ A1 pill V0
  v0Pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(18,20,23,0.04)",
    borderWidth: 1,
    borderColor: BORDER,
  },
  v0PillText: {
    color: INK,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.6,
  },

  body: { color: INK_SOFT, fontSize: 13, lineHeight: 18 },
  muted: { color: INK_SOFT, fontSize: 12, lineHeight: 16, opacity: 0.9 },
  bold: { color: INK, fontWeight: "900" },

  bullet: {
    color: INK,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
  },
  proofPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "rgba(18,20,23,0.03)",
  },
  proofText: { color: INK_SOFT, fontSize: 12, fontWeight: "800" },

  yearHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "rgba(18,20,23,0.03)",
  },
  yearTitle: { color: INK, fontSize: 13, fontWeight: "900" },
  yearCount: { color: INK_SOFT, fontSize: 12, fontWeight: "900" },

  timelineRow: { flexDirection: "row", gap: 10 },
  timelineLeft: { width: 16, alignItems: "center" },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: "rgba(18,20,23,0.35)",
    marginTop: 4,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: BORDER,
    marginTop: 6,
    borderRadius: 999,
  },
  timelineLabel: { color: INK, fontSize: 13, fontWeight: "900" },

  proofRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
  },

  foldRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  foldTitle: { color: INK, fontSize: 13, fontWeight: "900" },
  foldSub: {
    color: INK_SOFT,
    fontSize: 12,
    marginTop: 2,
    fontWeight: "700",
  },
  foldIcon: {
    color: INK_SOFT,
    fontSize: 18,
    fontWeight: "900",
    width: 22,
    textAlign: "right",
  },

  // ✅ Votes rows
  voteGroupRow: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "rgba(18,20,23,0.02)",
    gap: 4,
  },
  voteGroupTitle: { color: INK, fontSize: 12, fontWeight: "900" },

  impactCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "rgba(18,20,23,0.02)",
    padding: 12,
    gap: 6,
  },
  impactTitle: { color: INK, fontSize: 12, fontWeight: "900" },

  sourceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "rgba(18,20,23,0.02)",
  },
  sourceLabel: { color: INK, fontSize: 12, fontWeight: "900" },
  chev: { color: INK, fontSize: 18, fontWeight: "900" },
});
