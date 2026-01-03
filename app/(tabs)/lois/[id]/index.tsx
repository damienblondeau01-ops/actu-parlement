// app/(tabs)/lois/[id]/index.tsx
// âœ… SQUELETTE CANON v0.1 â€” â€œBulletin (papier)â€
// Objectif: structure + rÃ¨gles dâ€™affichage (pas de logique mÃ©tier complexe)
// âœ… Ici: on branche le MINIMUM fiable : Header + Timeline depuis DB (fetchLoiDetail / fetchLoiTimeline)
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
  Linking, // âœ… FIX: ouvrir les liens externes (https://...)
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";

import {
  fetchLoiDetail,
  fetchLoiTimeline,
  fetchLoiTimelineCanon,
  fetchLoiSources,
  fetchLoiTexte,
  fetchScrutinTotauxForScrutins as _fetchScrutinTotauxForScrutins, // âœ… NEW (pas utilisÃ© ici mais on ne touche pas)
  fetchLoiProcedureCanon,
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
import { supabase } from "@/lib/supabaseClient";
import LoiPromulgationBlock from "@/components/loi/LoiPromulgationBlock";

// âœ… Votes (V0) â€” par scrutin / par groupes
import {
  fetchVotesGroupesForScrutins,
  type VoteGroupeRow,
} from "@/lib/queries/votes";

// âœ… regroupement canon (UI-only)
import { groupTimelineByYear } from "@/lib/loi/timelineCanon";

/** =========================
 *  âœ… THÃˆME â€œPAPIERâ€ (comme Actu)
 *  ========================= */
const PAPER = "#F6F1E8";
const PAPER_CARD = "#FBF7F0";
const INK = "#121417";
const INK_SOFT = "rgba(18,20,23,0.72)";
const LINE = "rgba(18,20,23,0.14)";

type RouteParams = {
  id?: string;
  canonKey?: string;

  joParam?: string;

  // âœ… JO (source externe propagÃ©e depuis Actu)
  jo?: string;

  timelineQueryKey?: string;

  // provenance
  fromKey?: string;
  fromLabel?: string;

  // âœ… titre Ã©ditorial (citoyen) propagÃ© depuis Actu
  heroTitle?: string;

  // âœ… fallback si DB vide
  seedScrutin?: string;

  // âœ… restore Actu
  restoreId?: string;
  restoreOffset?: string;

  anchor?:
    | "resume" // âœ… A1
    | "tldr"
    | "procedure"
    | "context"
    | "impact"
    | "timeline"
    | "votes"
    | "measures"
    | "sources";
};

/** =========================
 *  âœ… RÃ‰SUMÃ‰ V0 (MANUEL) â€” A1
 *  =========================
 *  RÃ¨gle: bloc statique, Ã©crit Ã  la main, uniquement pour la loi spÃ©ciale.
 *  Objectif: tester la lisibilitÃ© citoyenne, avant automatisation IA.
 */
type ResumeV0 = {
  title?: string;
  sentences: string[];
  note?: string;
};
function isLoiSpecialeKey(canonKey: string, id: string) {
  const ck = String(canonKey ?? "").toLowerCase();
  const _id = String(id ?? "").toLowerCase();

  // âœ… dÃ©clencheurs robustes (canonKey "loi:..." ou slug "scrutin-public-...loi-speciale...")
  if (ck.includes("loi-speciale")) return true;
  if (_id.includes("loi-speciale")) return true;

  // âœ… si jamais le canonKey est "loi:...article-45..." (loi spÃ©ciale art. 45)
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
  proof: CanonProof; // âœ… obligatoire
};

type CanonHeader = {
  title: string;
  status:
    | "AdoptÃ©e"
    | "En cours"
    | "RejetÃ©e"
    | "RetirÃ©e"
    | "PromulguÃ©e"
    | "â€”";
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

type CanonTimelineStepUI = {
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
    positionMajoritaire: "POUR" | "CONTRE" | "ABSTENTION" | "DIVISÃ‰";
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
  timeline: CanonTimelineStepUI[];
  votes?: CanonVotes;
  measures?: CanonMeasures;
  jo_date_promulgation?: string | null;
  sources: CanonSources;
};

/** =========================
 *  âœ… TYPE PROCÃ‰DURE (Dossier AN/SÃ©nat)
 *  âœ… Fix TS: on nâ€™utilise PAS CanonTimelineStep importÃ© (mauvais shape)
 *  -> on type local = exactement ce que le rendu utilise
 *  ========================= */
type ProcedureTimelineStep = {
  label: string;
  chambre?: string | null;
  lecture?: string | number | null;
  date_start?: string | null;

  source_url?: string | null;
  source_label?: string | null;

  step_index?: number | null;
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
      <Text style={styles.proofText}>â†³ {p.label}</Text>
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
        <Text style={styles.foldIcon}>{open ? "â€”" : "+"}</Text>
      </Pressable>
      {open ? <View style={{ paddingTop: 10 }}>{children}</View> : null}
    </View>
  );
}

function toLoiSourcesUI(rows: any[]): LoiSourceItem[] {
  return (Array.isArray(rows) ? rows : [])
    .map((r) => {
      // cas oÃ¹ c'est dÃ©jÃ  au bon format UI
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
 *  âœ… Canon helper (copie lÃ©gÃ¨re depuis Actu)
 *  - but: si l'Ã©cran reÃ§oit un slug "scrutin-public-..." on reconstruit "loi:..."
 *  ========================= */
function cleanSpaces(s: string) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}
function slugifyFR(input: string) {
  return cleanSpaces(String(input ?? ""))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['â€™]/g, "-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
function extractLawCoreFromSentence(sentence: string): string {
  const s = cleanSpaces(String(sentence ?? ""));
  if (!s) return "";

  const noParen = s.replace(/\s*\([^)]*\)\s*$/g, "").trim();

  let x = noParen.replace(/^l['â€™]?\s*/i, "l'");
  x = x.replace(/^l['â€™]ensemble\s+du\s+/i, "");
  x = x.replace(/^l['â€™]ensemble\s+de\s+la\s+/i, "");
  x = x.replace(/^l['â€™]article\s+unique\s+du\s+/i, "");
  x = x.replace(/^l['â€™]article\s+premier\s+du\s+/i, "");
  x = x.replace(/^l['â€™]article\s+\w+\s+du\s+/i, "");
  x = x.replace(/^l['â€™]amendement[^,]*\s+Ã \s+/i, "");
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

  // âœ… helper local (seed) : corrige le suffixe tronquÃ© "-de-la-lo" -> "-de-la-loi"
  const fixTail = (k: string) =>
    String(k ?? "")
      .trim()
      .replace(/-de-la-lo$/i, "-de-la-loi")
      .replace(/-de-la-l$/i, "-de-la-loi")
      .replace(/-de-la-$/i, "-de-la-loi");

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

  // âœ… LOCK heroTitle au mount (ne doit jamais Ãªtre Ã©crasÃ©)
  const pHeroTitle = String((params as any)?.heroTitle ?? "").trim();
  const pFromLabel = String((params as any)?.fromLabel ?? "").trim();
  const lockedHeroTitleRef = useRef<string>("");
  if (!lockedHeroTitleRef.current) {
    lockedHeroTitleRef.current = pHeroTitle || pFromLabel || "";
  }
  const lockedHeroTitle = lockedHeroTitleRef.current;

  /**
   * âœ… LOI KEY (ultra robuste)
   * - prioritÃ© canonKey si "loi:..."
   * - sinon si id ressemble Ã  un slug "scrutin-public-..." -> canonFromSlug -> "loi:..."
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
   * âœ… RESTORE TIMELINE QUERY KEY (anti-casse)
   * - si on a un slug "scrutin-..." -> on l'utilise (source "scrutins_data", nickel)
   * - sinon fallback canonKey "loi:..." (fetchLoiTimeline rÃ©sout / ou canon tente dâ€™abord)
   */
  const timelineQueryKey = useMemo(() => {
    const v = (params as any)?.timelineQueryKey;
    const tq =
      typeof v === "string"
        ? v.trim()
        : Array.isArray(v)
        ? String(v[0] ?? "").trim()
        : "";

    // ✅ priorité: timelineQueryKey fourni par Actu (scrutin-public-...)
    if (tq) return tq;

    // ✅ sinon ton comportement actuel
    if (id?.startsWith("scrutin-")) return id;

    const ck = String((params as any)?.canonKey ?? "").trim();
    if (ck) return ck;

    return "";
  }, [id, params]);

useEffect(() => {
    console.log("[TEST3][TIMELINE KEY RESOLUTION]", {
      id,
      param_timelineQueryKey: (params as any)?.timelineQueryKey,
      resolved: timelineQueryKey,
    });
  }, [id, params, timelineQueryKey]);
  
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

  const joParam = useMemo(() => {
    // âœ… Actu envoie "joParam"
    const v = (params as any)?.joParam ?? (params as any)?.jo; // fallback ancien
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

  // âœ… Titre humain depuis canonKey/slug â€” fallback si DB nâ€™a pas de titre
  const titleFromId = useMemo(
    () => titleFromCanonKey(canonKey || id),
    [canonKey, id]
  );

  // âœ… Retour intelligent : si on vient d'Actu => on revient sur Actu en restaurant lâ€™item, sinon back normal
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

  // âœ… DB-first: sources + texte + IA â€œEn clairâ€
  const [sources, setSources] = useState<LoiSourceItem[]>([]);
  const [loiTexte, setLoiTexte] = useState<LoiTexteRow | null>(null);
  const [enClair, setEnClair] = useState<EnClairItem[]>([]);

  // âœ… ProcÃ©dure (canon) â€” Ã©tat cohÃ©rent avec le rendu
  const [procedureTimeline, setProcedureTimeline] = useState<
    ProcedureTimelineStep[]
  >([]);
  const [procedureLoading, setProcedureLoading] = useState(false);

  // âœ… Votes (V0): par scrutin -> par groupes
  const [votesByScrutin, setVotesByScrutin] = useState<
    Record<string, VoteGroupeRow[]>
  >({});

  const [totauxByScrutin, setTotauxByScrutin] = useState<Record<string, any>>(
    {}
  );

  // âœ… Totaux fallback depuis scrutins_data (mÃªme source que la fiche Scrutin)
  const [scrutinsDataByNumero, setScrutinsDataByNumero] = useState<
    Record<string, any>
  >({});

  // âœ… anchors (canonical)
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

  // âœ… navigation â€œpreuveâ€
  const openHref = useCallback(
    async (href: string) => {
      const h = String(href ?? "").trim();
      if (!h) return;

      // âœ… EXTERNE: http(s), mailto, tel
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

      // âœ… INTERNE: routes app
      if (h.startsWith("/")) {
        router.push(h as any);
        return;
      }

      // âœ… fallback interne (ancien comportement) : on force un path
      router.push(("/" + h.replace(/^\/+/, "")) as any);
    },
    [router]
  );

  /**
   * âœ… RESET propre sur changement d'ID (Ã©vite â€œflashâ€)
   */
  useLayoutEffect(() => {
    setError(null);
    setLoiTitle(null);
    setTimelineRows([]);
    setLoading(!!id);

    // âœ… reset DB-first
    setSources([]);
    setLoiTexte(null);
    setEnClair([]);

    // âœ… reset votes
    setVotesByScrutin({});
    setTotauxByScrutin({});

    // âœ… reset procÃ©dure canon
    setProcedureTimeline([]);
    setProcedureLoading(false);

    // âœ… reset fallback scrutins_data (sinon valeurs â€œfantÃ´mesâ€ entre 2 lois)
    setScrutinsDataByNumero({});
  }, [id]);

  // âœ… Load minimal: title + timeline
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
         * âœ… TIMELINE (ANTI-CASSE)
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

        // âœ… fallback si canon vide OU pas de canonKey
        if ((!Array.isArray(tl) || tl.length === 0) && timelineQueryKey) {
          tl = await fetchLoiTimeline(timelineQueryKey, 500);
          console.log(
            "[LOI TIMELINE] fallback =",
            timelineQueryKey,
            "| got =",
            Array.isArray(tl) ? tl.length : 0
          );
        }

        // âœ… Fallback ultime: si on vient d'Actu avec un seedScrutin,
        // objectif: rÃ©cupÃ©rer aussi les scrutins solennels (vote final) via group_key,
        // sans jamais casser lâ€™Ã©cran.
        if ((!Array.isArray(tl) || tl.length === 0) && seedScrutin) {
          const seedNum = Number(seedScrutin);
          if (!Number.isNaN(seedNum)) {
            // 1) rÃ©cupÃ©rer le group_key via scrutins_data (source fiable)
            const { data: sd, error: sdErr } = await supabase
              .from("scrutins_data")
              .select("group_key")
              .eq("numero", seedNum)
              .limit(1)
              .maybeSingle();

            const gkRaw = String((sd as any)?.group_key ?? "").trim();
            const gk = fixTail(gkRaw);

            if (sdErr || !gk) {
              console.log("[LOI TIMELINE] seed group_key resolve failed", {
                seedScrutin,
                sdErr,
                gkRaw,
              });
            } else {
              // 2) construire les variantes ordinaire/solennel (sur la version rÃ©parÃ©e)
              const gkOrd = gk.includes("scrutin-public-solennel-")
                ? gk.replace(
                    "scrutin-public-solennel-",
                    "scrutin-public-ordinaire-"
                  )
                : gk;

              const gkSol = gk.includes("scrutin-public-ordinaire-")
                ? gk.replace(
                    "scrutin-public-ordinaire-",
                    "scrutin-public-solennel-"
                  )
                : gk;

              // 3) keys uniques (inclut aussi les versions rÃ©parÃ©es au cas oÃ¹)
              const keys = Array.from(
                new Set(
                  [
                    gkRaw,
                    gk,
                    gkOrd,
                    gkSol,
                    fixTail(gkOrd),
                    fixTail(gkSol),
                  ].filter(Boolean)
                )
              );

              // 4) fetch timeline via scrutins_data group_key IN (fusion)
              const { data: rows, error: rowsErr } = await supabase
                .from("scrutins_data")
                .select(
                  "numero,date_scrutin,titre,objet,resultat,kind,article_ref,legislature"
                )
                .in("group_key", keys)
                .order("date_scrutin", { ascending: false })
                .order("numero", { ascending: false })
                .limit(500);

              console.log(
                "[LOI TIMELINE] seed group_key IN =",
                keys.join(" | "),
                "| got =",
                (rows ?? []).length,
                "| error =",
                rowsErr?.message ?? null
              );

              if (!rowsErr) {
                tl = (rows ?? []).map((r: any) => ({
                  loi_id: loiKey, // âœ… rattache au canon "loi:..." cÃ´tÃ© UI
                  numero_scrutin: String(r.numero ?? ""),
                  date_scrutin: r.date_scrutin ?? null,
                  titre: r.titre ?? null,
                  objet: r.objet ?? null,
                  resultat: r.resultat ?? null,
                  kind: r.kind ?? null,
                  article_ref: r.article_ref ?? null,
                  legislature: r.legislature ?? null,
                }));
              }
            }
          }
        }

        const rows = Array.isArray(tl) ? ((tl as any) as LoiTimelineRow[]) : [];

        // âœ… Tri robuste : date DESC puis numero DESC
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
  }, [id, loiKey, timelineQueryKey, titleFromId, canonKey, seedScrutin]);

  // âœ… Load votes (V0) depuis les scrutins du parcours
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
          setTotauxByScrutin({});
          setScrutinsDataByNumero({});
          return;
        }

        // âœ… V0 perf: on limite (les plus rÃ©cents -> timelineRows dÃ©jÃ  triÃ©e DESC)
        const idsTop = ids;

        let rows: any[] = [];
        try {
          rows = await fetchVotesGroupesForScrutins(idsTop);
        } catch (e) {
          console.log(
            "[LOI VOTES] fetchVotesGroupesForScrutins failed =",
            (e as any)?.message ?? e
          );
          rows = [];
        }

        // âœ… Totaux globaux : source fiable = scrutins_data (comme l'Ã©cran Scrutin)
        const numsTop = idsTop
          .map((s) => Number(String(s).replace(/\D+/g, "")))
          .filter((n) => Number.isFinite(n) && n > 0);

        const totMap: Record<string, any> = {};

        if (numsTop.length > 0) {
          // 1) tentative avec colonnes "nb_*" (le plus probable)
          let tdata: any[] | null = null;

          try {
            const { data, error } = await supabase
              .from("scrutins_data")
              .select(
                "numero, nb_pour, nb_contre, nb_abstention, nb_non_votants, nb_total_votes, nb_votants"
              )
              .in("numero", numsTop);

            if (!error) tdata = (data ?? []) as any[];
          } catch {}

          // 2) fallback si les noms de colonnes sont diffÃ©rents
          if (!tdata) {
            try {
              const { data, error } = await supabase
                .from("scrutins_data")
                .select(
                  "numero, pour, contre, abstention, non_votants, total_votes, votants"
                )
                .in("numero", numsTop);

              if (!error) tdata = (data ?? []) as any[];
            } catch {}
          }

          for (const t of tdata ?? []) {
            const sid = String((t as any)?.numero ?? "").trim();
            if (!sid) continue;

            // normalisation vers les clÃ©s attendues par ton UI (nb_pour / nb_contre / nb_abstention)
            totMap[sid] = {
              nb_pour: (t as any)?.nb_pour ?? (t as any)?.pour ?? 0,
              nb_contre: (t as any)?.nb_contre ?? (t as any)?.contre ?? 0,
              nb_abstention:
                (t as any)?.nb_abstention ?? (t as any)?.abstention ?? 0,
              nb_non_votants:
                (t as any)?.nb_non_votants ?? (t as any)?.non_votants ?? null,
              nb_total_votes:
                (t as any)?.nb_total_votes ?? (t as any)?.total_votes ?? null,
              nb_votants: (t as any)?.nb_votants ?? (t as any)?.votants ?? null,
            };
          }
        }

        if (!alive) return;

        const grouped: Record<string, VoteGroupeRow[]> = {};
        for (const r of rows ?? []) {
          const k = String((r as any)?.numero_scrutin ?? "").trim();
          if (!k) continue;
          if (!grouped[k]) grouped[k] = [];
          grouped[k].push(r);
        }

        // tri interne: groupes â€œplus grosâ€ dâ€™abord (proxy: total)
        Object.keys(grouped).forEach((k) => {
          grouped[k].sort((a, b) => {
            const ta = (a.pour ?? 0) + (a.contre ?? 0) + (a.abstention ?? 0);
            const tb = (b.pour ?? 0) + (b.contre ?? 0) + (b.abstention ?? 0);
            return tb - ta;
          });
        });

        setVotesByScrutin(grouped);

        // âœ… 1) totauxByScrutin = source â€œglobaleâ€ prioritaire
        setTotauxByScrutin(totMap);

        // âœ… 2) scrutinsDataByNumero = filet de sÃ©curitÃ© utilisÃ© dans le render si besoin
        setScrutinsDataByNumero(totMap);
      } catch (e) {
        if (!alive) return;
        console.log("[LOI VOTES] error =", (e as any)?.message ?? e);
        setVotesByScrutin({});
        setTotauxByScrutin({});
        setScrutinsDataByNumero({});
      }
    })();

    return () => {
      alive = false;
    };
  }, [timelineRows]);

  // âœ… Load ProcÃ©dure (dossier) â€” canon
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        if (!loiKey) {
          if (!alive) return;
          setProcedureTimeline([]);
          return;
        }

        setProcedureLoading(true);

        const steps = await fetchLoiProcedureCanon(
          String(loiKey).trim(),
          joParam ?? null,
          200
        );

        console.log(
          "[PROC] steps",
          Array.isArray(steps)
            ? steps.map((s: any) => ({
                idx: s?.step_index,
                label: s?.label,
                chambre: s?.chambre,
                lecture: s?.lecture,
                date: s?.date_start,
              }))
            : steps
        );

        if (!alive) return;
        setProcedureTimeline((steps ?? []) as ProcedureTimelineStep[]);
      } catch (e) {
        if (!alive) return;
        console.log("[LOI PROCEDURE CANON] error =", (e as any)?.message ?? e);
        setProcedureTimeline([]);
      } finally {
        if (!alive) return;
        setProcedureLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [loiKey, joParam]);

  // âœ… Load DB-first: sources + texte (isolÃ©, zÃ©ro impact timeline)
  useEffect(() => {
    let alive = true;

    (async () => {
      if (!id) {
        if (!alive) return;
        setSources([]);
        setLoiTexte(null);
        return;
      }

      // âœ… on essaie dâ€™abord avec loiKey (canonKey si dispo), sinon id
      const keyPrimary =
        String(loiKey ?? "").trim() ||
        (canonKey?.startsWith("loi:") ? canonKey.trim() : "") ||
        canonFromSlug(String(id ?? "")) ||
        String(id).trim();

      // âœ… fallback explicite (anti-TS)
      const keyFallback = String(id).trim();

      console.log("[LOI SOURCES] keys =", { id, loiKey, keyPrimary, keyFallback });

      try {
        const s1 = await fetchLoiSources(keyPrimary);
        const s = (s1?.length ? s1 : await fetchLoiSources(keyFallback)) as any[];
        console.log("[LOI SOURCES] fetched =", {
          n1: s1?.length ?? 0,
          n: s?.length ?? 0,
          first: (s ?? [])[0] ?? null,
        });
        if (!alive) return;

        const ui = toLoiSourcesUI(s) ?? [];
        console.log("[LOI SOURCES] ui =", { n: ui.length, first: ui[0] ?? null });
        setSources(ui);
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
  }, [id, loiKey, canonKey]);

  // âœ… IA â€œEn clairâ€ V1 (preuves obligatoires : sources)
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
          exposeMotifsText: null, // âš ï¸ on ne lâ€™a pas encore en texte, donc null (safe)
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
   *  âœ… A1 â€” RÃ©sumÃ© V0 MANUEL (uniquement loi spÃ©ciale)
   *  ========================= */
  const resumeV0: ResumeV0 | null = useMemo(() => {
    if (!id) return null;

    const match = isLoiSpecialeKey(canonKey, id);
    if (!match) return null;

    return {
      title: "RÃ©sumÃ© (V0 â€” rÃ©digÃ© Ã  la main)",
      sentences: [
        "Cette loi spÃ©ciale autorise lâ€™Ã‰tat Ã  continuer Ã  fonctionner quand le budget annuel nâ€™est pas encore votÃ©.",
        "Elle permet de maintenir les dÃ©penses indispensables, comme le paiement des salaires publics et le fonctionnement des services de lâ€™Ã‰tat.",
        "Elle assure la continuitÃ© des services essentiels (impÃ´ts, sÃ©curitÃ© sociale, hÃ´pitaux, services publics).",
        "Elle ne remplace pas le budget annuel et ne fixe pas les prioritÃ©s budgÃ©taires de lâ€™annÃ©e.",
      ],
      note:
        "V0 manuel: ce texte est un prototype Ã©ditorial (pas encore gÃ©nÃ©rÃ© automatiquement).",
    };
  }, [id, canonKey]);

  /** =========================
   *  âœ… TIMELINE UI (canon: groupTimelineByYear)
   *  ========================= */
  const timelineSections = useMemo(() => {
    return groupTimelineByYear(timelineRows);
  }, [timelineRows]);

  /**
   * âœ… Timeline â€œhumaineâ€ (sans refactor global)
   * - regroupe par annÃ©e : Vote final â†’ Articles â†’ Amendements
   * - affiche un libellÃ© court + une meta (kind/result/date)
   */
  const timelineSectionsNice = useMemo(() => {
    const out: Record<
      string,
      {
        final: LoiTimelineRow[];
        articles: LoiTimelineRow[];
        amendements: LoiTimelineRow[];
      }
    > = {};

    (timelineSections ?? []).forEach((sec: any) => {
      const year = String(sec?.yearLabel ?? "").trim();
      const rows = (sec?.items ?? []) as LoiTimelineRow[];

      const final: LoiTimelineRow[] = [];
      const articles: LoiTimelineRow[] = [];
      const amendements: LoiTimelineRow[] = [];

      (rows ?? []).forEach((r: any) => {
        const titre = String((r as any)?.titre ?? "").toLowerCase();
        const objet = String((r as any)?.objet ?? "").toLowerCase();

        // âœ… Vote final = "l'ensemble du projet/proposition de loi"
        const looksFinal =
          !!(r as any)?.is_final ||
          titre.includes("l'ensemble du projet de loi") ||
          objet.includes("l'ensemble du projet de loi") ||
          titre.includes("l'ensemble de la proposition de loi") ||
          objet.includes("l'ensemble de la proposition de loi");

        const looksAmendement =
          String((r as any)?.kind ?? "").toLowerCase().includes("amend") ||
          titre.includes("amendement") ||
          objet.includes("amendement");

        const looksArticle =
          String((r as any)?.kind ?? "").toLowerCase() === "article" ||
          titre.startsWith("l'article") ||
          objet.startsWith("l'article") ||
          /\barticle\s+\d+/i.test(String((r as any)?.article_ref ?? ""));

        if (looksFinal) final.push(r);
        else if (looksAmendement) amendements.push(r);
        else if (looksArticle) articles.push(r);
        else amendements.push(r); // fallback
      });

      // tri articles 1/2/3
      articles.sort(
        (a: any, b: any) => (a?.article_num ?? 99) - (b?.article_num ?? 99)
      );

      out[year] = { final, articles, amendements };
    });

    return out;
  }, [timelineSections]);

  const renderTimelineRow = useCallback(
    (r: LoiTimelineRow, idx: number, keyPrefix: string) => {
      const sid = r.numero_scrutin ? String(r.numero_scrutin) : "";
      const title =
        ((r as any)?.scrutin_label_short ?? (r.titre ?? "").trim()) || "Scrutin";

      const meta = [
        (r as any)?.kind_label ?? null,
        (r as any)?.result_short ?? null,
        r.date_scrutin ? fmtDateFR(r.date_scrutin) : null,
      ]
        .filter(Boolean)
        .join(" Â· ");

      return (
        <View key={`${keyPrefix}-${sid || idx}`} style={styles.timelineRow}>
          <View style={styles.timelineLeft}>
            <View style={styles.timelineDot} />
          </View>

          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.timelineLabel}>{title}</Text>
            {!!meta && <Text style={styles.timelineMeta}>{meta}</Text>}

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
    },
    [openHref]
  );

  /** =========================
   *  âœ… VOTES UI helpers (V0)
   *  ========================= */
  const voteScrutinIds = useMemo(() => {
    // âœ… source de vÃ©ritÃ© = timelineRows (sinon la liste disparaÃ®t si votesByScrutin est vide)
    const order = (timelineRows ?? [])
      .map((r) => String((r as any)?.numero_scrutin ?? "").trim())
      .filter(Boolean);

    // âœ… unique + conserve lâ€™ordre timeline
    return Array.from(new Set(order));
  }, [timelineRows]);

  function countsFromAnyVoteRow(r: any) {
    // 1) âœ… format pivot: pour/contre/abstention
    const hasPivot =
      r && (r.pour != null || r.contre != null || r.abstention != null);

    if (hasPivot) {
      const pour = Number(r.pour ?? 0);
      const contre = Number(r.contre ?? 0);
      const abstention = Number(r.abstention ?? 0);

      // si c'est dÃ©jÃ  bon â†’ on garde
      if (pour + contre + abstention > 0) {
        return { pour, contre, abstention };
      }
      // sinon on continue: certains exports mettent 0 mais ont aussi des champs "nb_voix_*"
    }

    // 2) âœ… variantes courantes: nb_pour/nb_contre/nb_abstention
    const np = Number((r as any)?.nb_pour ?? (r as any)?.voix_pour ?? 0);
    const nc = Number((r as any)?.nb_contre ?? (r as any)?.voix_contre ?? 0);
    const na = Number(
      (r as any)?.nb_abstention ?? (r as any)?.voix_abstention ?? 0
    );

    if (np + nc + na > 0) {
      return { pour: np, contre: nc, abstention: na };
    }

    // 3) âœ… long format: une ligne = une position + nb_voix
    const nb = Number(
      (r as any)?.nb_voix ?? (r as any)?.nb ?? (r as any)?.count ?? 0
    );

    const posRaw = String(
      (r as any)?.position ??
        (r as any)?.vote ??
        (r as any)?.choix ??
        (r as any)?.position_majoritaire ??
        ""
    )
      .trim()
      .toUpperCase();

    // normalisation basique (POUR/CONTRE/ABSTENTION)
    const pos =
      posRaw === "POUR" || posRaw === "Pour".toUpperCase()
        ? "POUR"
        : posRaw === "CONTRE"
        ? "CONTRE"
        : posRaw === "ABSTENTION"
        ? "ABSTENTION"
        : posRaw;

    if (pos === "POUR") return { pour: nb, contre: 0, abstention: 0 };
    if (pos === "CONTRE") return { pour: 0, contre: nb, abstention: 0 };
    if (pos === "ABSTENTION") return { pour: 0, contre: 0, abstention: nb };

    return { pour: 0, contre: 0, abstention: 0 };
  }

  const globalFromGroups = (rows: VoteGroupeRow[]) => {
    const g = { pour: 0, contre: 0, abstention: 0 };

    for (const r of rows ?? []) {
      const c = countsFromAnyVoteRow(r);
      g.pour += c.pour;
      g.contre += c.contre;
      g.abstention += c.abstention;
    }

    return g;
  };

  const fmtPct = (x: number, total: number) => {
    if (!total) return "0%";
    return `${Math.round((x / total) * 100)}%`;
  };

  /** =========================
   *  âœ… MODEL (memo)
   *  ========================= */
  const model: CanonModel = useMemo(() => {
    const editorialFromActu =
      fromKey === "actu" ? String(fromLabel ?? "").trim() : "";

    // âœ… rÃ¨gle universelle: H1 = heroTitle (lock) sinon fromLabel (si Actu) sinon DB sinon canon
    const h1 =
      lockedHeroTitle?.trim() ||
      editorialFromActu ||
      loiTitle?.trim() ||
      titleFromId?.trim() ||
      "Loi";

    const fallbackHeader: CanonHeader = {
      title: h1,
      status: "â€”",
      lastStepLabel: "â€”",
      lastStepDate: "â€”",
      oneLiner: "â€”",
    };

    if (!id) {
      return {
        header: fallbackHeader,
        tldr: [],
        context: undefined,
        impact: undefined,
        timeline: [{ label: "Parcours", date: "â€”", result: "â€”", proofs: [] }],
        votes: undefined,
        measures: undefined,
        jo_date_promulgation: joParam ? joParam : null,
        sources: { updatedAt: "Mis Ã  jour: â€”", sources: [] },
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

    // âœ… RÃ¨gle simple & sÃ»re : si JO connu -> loi promulguÃ©e (tu avais "â€”" : je ne change pas ton intention ici)
    if (joParam) {
      header = { ...header, status: "â€”" };
    }

    // âœ… Timeline depuis DB
    let timeline: CanonTimelineStepUI[] = (timelineRows ?? []).map((r) => {
      const sid = r.numero_scrutin ? String(r.numero_scrutin) : "";
      return {
        label: (r.titre ?? "").trim() || "Ã‰tape",
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

    // âœ… Fallback Parcours si DB vide : utiliser seedScrutin
    if (timeline.length === 0 && seedScrutin) {
      const sid = String(seedScrutin).trim();
      if (sid) {
        timeline = [
          {
            label: "Vote (dÃ©tectÃ© via le rÃ©cit Actu)",
            date: "â€”",
            result: "â€”",
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

    // âœ… TLDR v0 : d'abord DB, sinon fallback via seedScrutin
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
            text: "Dernier vote dÃ©tectÃ© via le rÃ©cit Actu (donnÃ©es dÃ©taillÃ©es en cours de branchement).",
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
        : [{ label: "Parcours", date: "â€”", result: "â€”", proofs: [] }],
      votes: undefined,
      measures: undefined,
      jo_date_promulgation: joParam ? joParam : null,
      sources: {
        updatedAt: "Mis Ã  jour: â€”",
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
    joParam,
  ]);

  const showTLDR = model.tldr.length > 0;

  const displaySources: LoiSourceItem[] = useMemo(() => {
    // 1) DB -> dÃ©jÃ  au format UI (kind/label/url)
    if (sources && sources.length > 0) return sources;

    // 2) Fallback minimal officiel si la DB est vide
    return toLoiSourcesUI([
      {
        kind: "AN_LISTE",
        label: "AssemblÃ©e nationale â€” projets de loi",
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

  // âœ… auto-scroll anchor si demandÃ© (aprÃ¨s layout + chargement)
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
          <Text style={styles.muted}>Chargementâ€¦</Text>
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
            <Text style={styles.contextBtnText}>â† Retour</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
        {/* âœ… Barre haut */}
        <View style={styles.contextBar}>
          <View style={{ flex: 1 }}>
            {fromKey ? (
              <>
                <Text style={styles.contextKicker}>Tu viens de</Text>
                <Text style={styles.contextTitle} numberOfLines={1}>
                  {fromLabel || "un rÃ©cit"}
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
            <Text style={styles.contextBtnText}>â† Retour</Text>
          </Pressable>
        </View>

        {/* 0) HEADER */}
        <View style={styles.heroCard}>
          <Text style={styles.heroTitle} numberOfLines={2}>
            {model.header.title}
          </Text>

          {model?.jo_date_promulgation ? (
            <View style={{ marginTop: 8 }}>
              <LoiPromulgationBlock
                datePromulgation={model.jo_date_promulgation}
              />
            </View>
          ) : null}

          <View style={styles.heroMetaRow}>
            <View style={styles.statusPill}>
              <Text style={styles.statusText}>
                Statut : {model.header.status}
              </Text>
            </View>

            {/* âœ… Facts lisibles : Vote vs JO */}
            <View style={styles.factsCol}>
              <Text style={styles.factLine}>
                <Text style={styles.factK}>Vote final Ã  lâ€™AssemblÃ©e :</Text>{" "}
                {model.header.lastStepDate !== "â€”" ? model.header.lastStepDate : "â€”"}
              </Text>

              {model?.jo_date_promulgation ? (
                <Text style={styles.factLine}>
                  <Text style={styles.factK}>Promulgation (JO) :</Text>{" "}
                  {fmtDateFR(model.jo_date_promulgation)}
                </Text>
              ) : null}
            </View>
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
                <Text style={styles.anchorText}>RÃ©sumÃ©</Text>
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

            {(procedureLoading || procedureTimeline.length > 0) ? (
              <Pressable
                onPress={() => scrollToAnchor("procedure")}
                style={styles.anchorBtn}
              >
                <Text style={styles.anchorText}>ProcÃ©dure</Text>
              </Pressable>
            ) : null}

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

        {/* âœ… A1) RÃ‰SUMÃ‰ V0 (MANUEL) */}
        {!!resumeV0 && (
          <View onLayout={setAnchor("resume")}>
            <View style={styles.card}>
              <SectionTitle
                title={resumeV0.title ?? "RÃ©sumÃ© (V0)"}
                subtitle="Prototype Ã©ditorial â€” lisible en 20 secondes"
                right={
                  <View style={styles.v0Pill}>
                    <Text style={styles.v0PillText}>V0</Text>
                  </View>
                }
              />

              <View style={{ gap: 10 }}>
                {resumeV0.sentences.map((s, idx) => (
                  <Text key={`v0-${idx}`} style={styles.bullet}>
                    â€¢ {s}
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
              subtitle="IA assistante â€” chaque point est vÃ©rifiable"
            />
            {showEnClairV1 ? (
              <View style={{ gap: 10 }}>
                {enClair.map((item, idx) => (
                  <View key={`enclair-${idx}`} style={{ gap: 6 }}>
                    <Text style={styles.bullet}>â€¢ {item.text}</Text>

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
                Pas assez de preuves pour gÃ©nÃ©rer un TL;DR fiable (pas encore
                branchÃ©).
              </Text>
            ) : (
              <View style={{ gap: 10 }}>
                {model.tldr.slice(0, 6).map((b, idx) => (
                  <View key={`tldr-${idx}`} style={{ gap: 6 }}>
                    <Text style={styles.bullet}>â€¢ {b.text}</Text>
                    <ProofLink p={b.proof} onPress={openHref} />
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* 3) ProcÃ©dure (AN/SÃ©nat) â€” dossier */}
        {procedureTimeline?.length ? (
          <View onLayout={setAnchor("procedure")}>
            <View style={styles.card}>
              <SectionTitle
                title="ProcÃ©dure"
                subtitle="Ã‰tapes officielles (dossier AN/SÃ©nat)"
                right={
                  <Text style={styles.muted}>
                    {procedureTimeline.length} Ã©tape(s)
                  </Text>
                }
              />

              <View style={{ gap: 8 }}>
                {procedureTimeline.slice(0, 12).map((s, i) => {
                  const meta = [
                    s.chambre ? String(s.chambre).toUpperCase() : null,
                    s.lecture != null ? String(s.lecture) : null,
                    s.date_start ? fmtDateFR(s.date_start) : null,
                  ]
                    .filter(Boolean)
                    .join(" Â· ");

                  return (
                    <View key={`proc-${s.step_index}-${i}`} style={styles.procRow}>
                      <Text style={styles.procLabel}>{s.label || "Ã‰tape"}</Text>
                      {!!meta && <Text style={styles.procMeta}>{meta}</Text>}

                      {typeof s.source_url === "string" &&
                      s.source_url.trim().length > 0 ? (
                        <View style={styles.proofRow}>
                          <ProofLink
                            p={{
                              label: s.source_label || "Source",
                              href: s.source_url.trim(),
                            }}
                            onPress={openHref}
                          />
                        </View>
                      ) : null}
                    </View>
                  );
                })}

                {procedureTimeline.length > 12 ? (
                  <Text style={styles.muted}>
                    +{procedureTimeline.length - 12} Ã©tapes
                  </Text>
                ) : null}
              </View>
            </View>
          </View>
        ) : null}

        {/* 4) Timeline */}
        <View onLayout={setAnchor("timeline")}>
          <View style={styles.card}>
            <SectionTitle
              title="Parcours lÃ©gislatif"
              subtitle="Lecture simple â€” classÃ©e par annÃ©e"
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
                        {(s.date ?? "â€”") + (s.result ? ` â€¢ ${s.result}` : "")}
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
                timelineSections.map((sec) => {
                  const year = String(sec.yearLabel ?? "").trim();
                  const g = (timelineSectionsNice as any)[year] ?? {
                    final: [],
                    articles: [],
                    amendements: [],
                  };

                  return (
                    <View key={`sec-${sec.yearLabel}`} style={{ gap: 10 }}>
                      <View style={styles.yearHeader}>
                        <Text style={styles.yearTitle}>{sec.yearLabel}</Text>
                        <Text style={styles.yearCount}>{sec.items.length}</Text>
                      </View>

                      {!!g.final.length && (
                        <>
                          <Text style={styles.timelineSubhead}>Vote final</Text>
                          {g.final.map((r: LoiTimelineRow, idx: number) =>
                            renderTimelineRow(r, idx, `final-${year}`)
                          )}
                        </>
                      )}

                      {!!g.articles.length && (
                        <>
                          <Text style={styles.timelineSubhead}>Articles</Text>
                          {g.articles.map((r: LoiTimelineRow, idx: number) =>
                            renderTimelineRow(r, idx, `articles-${year}`)
                          )}
                        </>
                      )}

                      {!!g.amendements.length && (
                        <>
                          <Text style={styles.timelineSubhead}>Autres votes</Text>
                          {g.amendements.map((r: LoiTimelineRow, idx: number) =>
                            renderTimelineRow(r, idx, `amend-${year}`)
                          )}
                        </>
                      )}
                    </View>
                  );
                })
              )}
            </View>
          </View>
        </View>

        {/* 5) Votes (V0) */}
        <View onLayout={setAnchor("votes")}>
          <View style={styles.card}>
            <SectionTitle
              title="Votes"
              subtitle="RÃ©sultats par scrutin â€” puis dÃ©tail par groupes"
              right={
                voteScrutinIds.length ? (
                  <Text style={styles.muted}>
                    {voteScrutinIds.length} scrutin(s)
                  </Text>
                ) : null
              }
            />

            {voteScrutinIds.length === 0 ? (
              <Text style={styles.muted}>
                Pas de votes disponibles (pas de scrutin dÃ©tectÃ© ou table non
                branchÃ©e).
              </Text>
            ) : (
              <View style={{ gap: 10 }}>
                {voteScrutinIds.map((sid: string, idx: number) => {
                  const rows = (votesByScrutin as any)?.[sid] ?? [];
                  const tot = (totauxByScrutin as any)?.[sid] ?? null;

                  // âœ… fallback ultime = scrutins_data (source fiable, dÃ©jÃ  validÃ©e par la fiche Scrutin)
                  let g =
                    tot &&
                    ((tot as any).nb_pour ?? 0) + ((tot as any).nb_contre ?? 0) >
                      0
                      ? {
                          pour: Number((tot as any).nb_pour ?? 0),
                          contre: Number((tot as any).nb_contre ?? 0),
                          abstention: Number((tot as any).nb_abstention ?? 0),
                        }
                      : globalFromGroups(rows);

                  // âœ… dernier filet de sÃ©curitÃ© : si encore 0, lire scrutins_data dÃ©jÃ  chargÃ©e ailleurs
                  if (g.pour + g.contre + g.abstention === 0) {
                    const sd = (scrutinsDataByNumero as any)?.[sid];
                    if (sd) {
                      g = {
                        pour: Number(sd.nb_pour ?? sd.pour ?? 0),
                        contre: Number(sd.nb_contre ?? sd.contre ?? 0),
                        abstention: Number(sd.nb_abstention ?? sd.abstention ?? 0),
                      };
                    }
                  }

                  const totalExprimes = g.pour + g.contre + g.abstention;

                  // (optionnel) participation si DB fournit nb_total_votes & nb_non_votants
                  const participation =
                    tot && tot.nb_total_votes != null && tot.nb_non_votants != null
                      ? Number(tot.nb_total_votes) - Number(tot.nb_non_votants)
                      : null;

                  return (
                    <Fold
                      key={`vote-${sid}`}
                      title={`Scrutin ${sid}`}
                      subtitle={`Global: ${g.pour} pour â€¢ ${g.contre} contre â€¢ ${g.abstention} abst. (${totalExprimes} exprimÃ©s)`}
                      defaultOpen={idx === 0}
                    >
                      <View style={{ gap: 6, marginBottom: 8 }}>
                        <Text style={styles.muted}>
                          Pour: {g.pour} ({fmtPct(g.pour, totalExprimes)}) â€¢ Contre:{" "}
                          {g.contre} ({fmtPct(g.contre, totalExprimes)}) â€¢ Abst.:{" "}
                          {g.abstention} ({fmtPct(g.abstention, totalExprimes)})
                        </Text>

                        <Pressable
                          onPress={() =>
                            openHref(`/scrutins/${encodeURIComponent(sid)}`)
                          }
                          style={styles.sourceRow}
                        >
                          <Text style={styles.sourceLabel}>
                            Voir le dÃ©tail du scrutin â†’
                          </Text>
                          <Text style={styles.chev}>â†’</Text>
                        </Pressable>
                      </View>

                      <View style={{ gap: 8 }}>
                        {rows.slice(0, 12).map((r: VoteGroupeRow, j: number) => {
                          const label = (r.groupe_label || r.groupe || "Groupe").trim();
                          const c = countsFromAnyVoteRow(r);
                          const t = c.pour + c.contre + c.abstention;

                          const pos = String(
                            (r as any)?.position_majoritaire ??
                              (r as any)?.position ??
                              ""
                          )
                            .trim()
                            .toUpperCase();

                          return (
                            <View
                              key={`g-${sid}-${label}-${j}`}
                              style={styles.voteGroupRow}
                            >
                              <Text style={styles.voteGroupTitle}>
                                {label}
                                {pos ? ` â€” ${pos}` : ""}
                              </Text>
                              <Text style={styles.muted}>
                                {c.pour} pour â€¢ {c.contre} contre â€¢ {c.abstention} abst.
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
                  <Text style={styles.chev}>â†’</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.muted, { marginTop: 10 }]}>
              RÃ¨gle: la page se termine toujours par la traÃ§abilitÃ©.
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
  statusText: { color: INK, fontSize: 11, fontWeight: "800" },
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

  // âœ… A1 pill V0
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

  // âœ… NEW: sous-ligne meta (kind/result/date)
  timelineMeta: {
    color: INK_SOFT,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    opacity: 0.9,
  },

  // âœ… NEW: sous-titres de section (Vote final / Articles / Amendements)
  timelineSubhead: {
    color: INK,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.6,
    marginTop: 2,
  },

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

  // âœ… Votes rows
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

  factsCol: {
    flex: 1,
    gap: 4,
    paddingLeft: 2,
  },
  factLine: {
    color: INK_SOFT,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
  },
  factK: {
    color: INK,
    fontWeight: "900",
  },

  procRow: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "rgba(18,20,23,0.02)",
    gap: 4,
  },
  procLabel: { color: INK, fontSize: 12, fontWeight: "900" },
  procMeta: {
    color: INK_SOFT,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    opacity: 0.9,
  },

  procLeft: { width: 16, alignItems: "center" },
  procDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: "rgba(18,20,23,0.35)",
    marginTop: 4,
  },
  procLine: {
    width: 2,
    flex: 1,
    backgroundColor: BORDER,
    marginTop: 6,
    borderRadius: 999,
  },
});



