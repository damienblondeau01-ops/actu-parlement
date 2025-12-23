// app/scrutins/[id].tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { theme } from "../../lib/theme";
import {
  fetchScrutinAvecVotes,
  type ScrutinEnrichi,
  type VoteDeputeScrutin,
} from "../../lib/queries/scrutins";
import { supabase } from "../../lib/supabaseClient";
import DonutChart from "../../components/DonutChart";
import VoteBadge from "@/components/ui/VoteBadge";
import { routeFromItemId } from "@/lib/navigation";

function resolveRouteId(id?: string | string[] | null) {
  const raw = Array.isArray(id) ? id[0] : id;
  return raw ? String(raw).trim() : "";
}

const colors = theme.colors;
const CURRENT_LEGISLATURE = 17;

// ✅ Fallback couleurs
const TEXT = (colors as any).text || "#E5E7EB";
const SUBTEXT = (colors as any).subtext || "rgba(229,231,235,0.72)";

// 🎨 Palette douce (votes)
const SOFT_GREEN = "rgba(34,197,94,0.35)";
const SOFT_RED = "rgba(239,68,68,0.30)";
const SOFT_YELLOW = "rgba(234,179,8,0.32)";
const SOFT_TRACK = "rgba(255,255,255,0.06)";

// 🎨 Accent “wahou”
const ACCENT = "rgba(99,102,241,0.22)"; // indigo
const ACCENT_STRONG = "rgba(99,102,241,0.36)";
const GLASS = "rgba(255,255,255,0.045)";
const GLASS_BORDER = "rgba(255,255,255,0.10)";

/* ===========================================================
   📌 Types locaux
=========================================================== */

type SyntheseVotes = {
  numero_scrutin: string;
  nb_pour: number;
  nb_contre: number;
  nb_abstention: number;
  nb_votes_total?: number | null;
};

type LoiResume = {
  loi_id: string;
  titre_loi: string | null;
  nb_scrutins_total: number | null;
  nb_articles: number | null;
  nb_amendements: number | null;
};

type TimelineItem = {
  numero_scrutin: string;
  date_scrutin: string | null;
  titre: string | null;
  objet: string | null;
  resultat: string | null;
  kind: string | null;
  article_ref: string | null;
};

type GroupedVotes = {
  groupe: string;
  pour: VoteDeputeScrutin[];
  contre: VoteDeputeScrutin[];
  abst: VoteDeputeScrutin[];
  nv: VoteDeputeScrutin[];
};

/* ===========================================================
   🧩 Helpers
=========================================================== */

function looksLikeIdAn(value: string | null | undefined): boolean {
  if (!value) return false;
  const s = String(value);
  return /^VTANR?\d*L\d+V\d+/.test(s);
}

function looksLikeScrutinSlug(value: string | null | undefined): boolean {
  const s = String(value ?? "").toLowerCase().trim();
  return s.startsWith("scrutin-");
}

function looksLikeDossierId(value: string | null | undefined): boolean {
  const s = String(value ?? "").trim();
  return /^DLR/i.test(s);
}

// "VTANR...V4240" -> "4240" ; "4240" -> "4240"
function normalizeDigitsOnly(input: string): string {
  const m = String(input ?? "").match(/(\d+)/g);
  if (!m || m.length === 0) return "";
  return m[m.length - 1];
}

function getDeputeId(v: any): string | null {
  const id =
    v?.id_depute ??
    v?.id_an ??
    v?.id ??
    v?.idAn ??
    v?.id_an_depute ??
    null;
  return id ? String(id) : null;
}

// ⚠️ VoteBadge attend: "pour" | "contre" | "abstention" | "nv"
function getVoteKeyFromPosition(
  raw?: string | null
): "pour" | "contre" | "abstention" | "nv" {
  const p = String(raw ?? "").toLowerCase();
  if (p.includes("pour")) return "pour";
  if (p.includes("contre")) return "contre";
  if (p.includes("abst")) return "abstention";
  return "nv";
}

function formatDateFR(d?: any): string | null {
  if (!d) return null;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toLocaleDateString("fr-FR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function toCleanString(v: any): string {
  return String(v ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function groupLabelFromAnyVote(anyV: any): string {
  // ✅ Aligné sur /groupes : groupe_norm en priorité
  const candidates = [
    anyV?.groupe_norm,
    anyV?.groupe_actuel,
    anyV?.groupe_abrev_actuel,
    anyV?.groupe_abrev_opendata,
    anyV?.groupe_id_opendata,
    anyV?.groupe,
    anyV?.groupeAbrev,
    anyV?.groupe_abrev,
    anyV?.groupe_libelle,
  ];

  for (const c of candidates) {
    const s = toCleanString(c);
    if (s) return s;
  }
  return "Non renseigné";
}

function computeResultLabel(scrutin: any, nbPour: number, nbContre: number) {
  const raw = toCleanString(scrutin?.resultat || scrutin?.resultat_scrutin);
  if (raw) return raw;

  if (nbPour > nbContre) return "Adopté";
  if (nbContre > nbPour) return "Rejeté";
  return "Résultat indéterminé";
}

// ✅ Robustesse: erreur “citoyenne”
function userMessageFromError(err: any) {
  const msg = String(err?.message ?? err ?? "").toLowerCase();
  const code = String(err?.code ?? "");

  if (
    code === "57014" ||
    msg.includes("statement timeout") ||
    msg.includes("canceling statement")
  ) {
    return "Le chargement prend trop de temps pour l’instant. Réessayez dans un moment.";
  }

  if (
    msg.includes("network") ||
    msg.includes("failed to fetch") ||
    msg.includes("fetch")
  ) {
    return "Impossible de charger le scrutin (problème de connexion).";
  }

  return "Impossible de charger ce scrutin pour le moment.";
}

function majorityLabel(nbPour: number, nbContre: number, nbAbst: number) {
  const total = nbPour + nbContre + nbAbst;
  if (!total) return "";
  const pPour = Math.round((nbPour * 100) / total);
  const pContre = Math.round((nbContre * 100) / total);
  if (pPour === 100 && pContre === 0) return "Unanimité";
  if (pPour >= 60 && pContre <= 35) return "Majorité nette";
  if (pPour > pContre) return "Majorité";
  return "";
}

/* ===========================================================
   🟦 Mini Card Groupe (aperçu)
=========================================================== */

function GroupRow({
  groupe,
  pour,
  contre,
  abst,
  nv,
}: {
  groupe: string;
  pour: number;
  contre: number;
  abst: number;
  nv: number;
}) {
  const total = pour + contre + abst + nv;
  const fp = total ? pour : 1;
  const fc = total ? contre : 1;
  const fa = total ? abst : 1;
  const fnv = total ? nv : 1;

  return (
    <View style={styles.groupRow}>
      <View style={styles.groupRowTop}>
        <Text style={styles.groupRowTitle} numberOfLines={1} ellipsizeMode="tail">
          {groupe}
        </Text>
        <Text style={styles.groupRowNums}>
          {pour} · {contre} · {abst} · {nv}
        </Text>
      </View>

      <View style={styles.groupRowBar}>
        <View style={[styles.groupRowSeg, { flex: fp, backgroundColor: SOFT_GREEN }]} />
        <View style={[styles.groupRowSeg, { flex: fc, backgroundColor: SOFT_RED }]} />
        <View style={[styles.groupRowSeg, { flex: fa, backgroundColor: SOFT_YELLOW }]} />
        <View
          style={[
            styles.groupRowSeg,
            { flex: fnv, backgroundColor: "rgba(148,163,184,0.30)" },
          ]}
        />
      </View>
    </View>
  );
}

/* ===========================================================
   🟦 VoteRow
=========================================================== */

function VoteRow({
  vote,
  onPress,
}: {
  vote: VoteDeputeScrutin;
  onPress?: () => void;
}) {
  const anyV = vote as any;

  const fullName =
    vote.nom_depute ||
    `${anyV.prenom ?? ""} ${anyV.nom ?? ""}`.trim() ||
    "Député inconnu";

  const groupLabel = groupLabelFromAnyVote(anyV);
  const voteKey = getVoteKeyFromPosition(vote.position ?? anyV.vote ?? null);

  const initial =
    fullName && fullName.trim().length > 0
      ? fullName.trim().charAt(0).toUpperCase()
      : "?";

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.voteRow,
        pressed && onPress && { opacity: 0.92 },
      ]}
    >
      <View style={styles.voteLeft}>
        {anyV.photo_url ? (
          <Image source={{ uri: anyV.photo_url }} style={styles.voteAvatar} />
        ) : (
          <View style={styles.voteAvatarFallback}>
            <Text style={styles.voteAvatarInitial}>{initial}</Text>
          </View>
        )}

        <View style={styles.voteTextCol}>
          <Text style={styles.voteName} numberOfLines={1}>
            {fullName}
          </Text>
          <Text style={styles.voteGroup} numberOfLines={1}>
            {groupLabel}
          </Text>
        </View>
      </View>

      <View style={styles.voteRight}>
        <VoteBadge value={voteKey} />
      </View>
    </Pressable>
  );
}

/* ===========================================================
   🟦 UI simples
=========================================================== */

const Chip = ({ label, tone }: { label: string; tone?: "accent" | "neutral" }) => (
  <View style={[styles.chip, tone === "accent" && styles.chipAccent]}>
    <Text style={[styles.chipText, tone === "accent" && styles.chipTextAccent]}>
      {label}
    </Text>
  </View>
);

const Stat = (props: {
  label: string;
  value: number;
  tone: "good" | "bad" | "warn";
}) => {
  const { label, value, tone } = props;
  const color =
    tone === "good"
      ? "rgba(34,197,94,1)"
      : tone === "bad"
      ? "rgba(239,68,68,1)"
      : "rgba(234,179,8,1)";
  return (
    <View style={styles.statBlock}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
};

/* ===========================================================
   🟦 Screen
=========================================================== */

export default function ScrutinDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const routeId = resolveRouteId(id);

  const [scrutin, setScrutin] = useState<ScrutinEnrichi | null>(null);
  const [votes, setVotes] = useState<VoteDeputeScrutin[]>([]);
  const [syntheseVotes, setSyntheseVotes] = useState<SyntheseVotes | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const [loi, setLoi] = useState<LoiResume | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [loiLoading, setLoiLoading] = useState<boolean>(false);

  // ✅ numéro votes (source de vérité)
  const [resolvedNumero, setResolvedNumero] = useState<string | null>(null);

  // repli “listes longues”
  const [showVotes, setShowVotes] = useState(false);

  // ✅ Parcours de la loi
  const [showAllTimeline, setShowAllTimeline] = useState(false);

  // ✅ Synthèse par groupe
  const [showGroupSummary, setShowGroupSummary] = useState(true);
  const [showAllGroups, setShowAllGroups] = useState(false);

  // ✅ Title expand (pour éviter l’effet “pas classe”)
  const [expandTitle, setExpandTitle] = useState(false);

  // ✅ Sticky header animation
  const scrollY = useRef(new Animated.Value(0)).current;

  const stickyOpacity = scrollY.interpolate({
    inputRange: [30, 120],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  const stickyTranslate = scrollY.interpolate({
    inputRange: [30, 120],
    outputRange: [-10, 0],
    extrapolate: "clamp",
  });

  /**
   * Résout la loi associée + timeline.
   * ✅ stable (ta logique actuelle), on ne la change pas.
   */
  const loadLoiEtTimeline = useCallback(
    async (
      numeroVotes: string,
      scrutinKey?: string,
      preferredLoiId?: string
    ) => {
      try {
        setLoiLoading(true);

        const key = String(scrutinKey ?? "").trim();

        // ✅ 0) priorité à la loi_id issue du scrutin
        let loiIdScrutin: string | null = preferredLoiId
          ? String(preferredLoiId).trim()
          : null;

        const scrutinsDataSelectOne = async (q: {
          by: "id_an" | "numero" | "loi_id_eq" | "loi_id_ilike" | "numero_ilike";
          value: string;
        }) => {
          const base: any = supabase
            .from("scrutins_data")
            .select("loi_id, date_scrutin");

          const applyWhere = (b: any) => {
            if (q.by === "id_an") return b.eq("id_an", q.value);
            if (q.by === "numero") return b.eq("numero", q.value);
            if (q.by === "loi_id_eq") return b.eq("loi_id", q.value);
            if (q.by === "loi_id_ilike") return b.ilike("loi_id", `${q.value}%`);
            if (q.by === "numero_ilike") return b.ilike("numero", `${q.value}%`);
            return b;
          };

          const r1 = await applyWhere(base.eq("legislature", CURRENT_LEGISLATURE))
            .order("date_scrutin", { ascending: false })
            .limit(1);

          if (!r1.error) return r1;

          const msg = String((r1.error as any)?.message ?? "").toLowerCase();
          const hint = String((r1.error as any)?.hint ?? "").toLowerCase();
          const details = String((r1.error as any)?.details ?? "").toLowerCase();
          const looksLikeMissingCol =
            msg.includes("does not exist") &&
            (msg.includes("legislature") ||
              hint.includes("legislature") ||
              details.includes("legislature"));

          if (!looksLikeMissingCol) return r1;

          const r2 = await applyWhere(base)
            .order("date_scrutin", { ascending: false })
            .limit(1);

          return r2;
        };

        if (!loiIdScrutin && looksLikeIdAn(key)) {
          const { data, error: e } = await scrutinsDataSelectOne({
            by: "id_an",
            value: key,
          });
          if (e) console.warn("[SCRUTIN DETAIL] Erreur lookup id_an:", e);
          else if (Array.isArray(data) && data.length > 0 && (data[0] as any)?.loi_id) {
            loiIdScrutin = String((data[0] as any).loi_id);
          }
        }

        if (!loiIdScrutin) {
          const digits = normalizeDigitsOnly(key) || normalizeDigitsOnly(numeroVotes);
          if (digits) {
            const { data, error: e } = await scrutinsDataSelectOne({
              by: "numero",
              value: String(digits).trim(),
            });
            if (e) console.warn("[SCRUTIN DETAIL] Erreur lookup numero:", e);
            else if (Array.isArray(data) && data.length > 0 && (data[0] as any)?.loi_id) {
              loiIdScrutin = String((data[0] as any).loi_id);
            }
          }
        }

        if (!loiIdScrutin && looksLikeScrutinSlug(key)) {
          const { data, error: e } = await scrutinsDataSelectOne({
            by: "loi_id_eq",
            value: key,
          });
          if (e) console.warn("[SCRUTIN DETAIL] Erreur lookup loi_id(eq):", e);
          else if (Array.isArray(data) && data.length > 0 && (data[0] as any)?.loi_id) {
            loiIdScrutin = String((data[0] as any).loi_id);
          }

          if (!loiIdScrutin) {
            const { data: d2, error: e2 } = await scrutinsDataSelectOne({
              by: "loi_id_ilike",
              value: key,
            });
            if (e2) console.warn("[SCRUTIN DETAIL] Erreur lookup loi_id(ilike):", e2);
            else if (Array.isArray(d2) && d2.length > 0 && (d2[0] as any)?.loi_id) {
              loiIdScrutin = String((d2[0] as any).loi_id);
            }
          }
        }

        if (!loiIdScrutin) {
          const probe = normalizeDigitsOnly(numeroVotes) || String(numeroVotes).trim();

          const { data, error: e } = await scrutinsDataSelectOne({
            by: "numero",
            value: probe,
          });
          if (e) console.warn("[SCRUTIN DETAIL] Erreur lookup numero(fallback):", e);
          else if (Array.isArray(data) && data.length > 0 && (data[0] as any)?.loi_id) {
            loiIdScrutin = String((data[0] as any).loi_id);
          }

          if (!loiIdScrutin) {
            const { data: d2, error: e2 } = await scrutinsDataSelectOne({
              by: "numero_ilike",
              value: probe,
            });
            if (e2) console.warn("[SCRUTIN DETAIL] Erreur lookup numero(ilike):", e2);
            else if (Array.isArray(d2) && d2.length > 0 && (d2[0] as any)?.loi_id) {
              loiIdScrutin = String((d2[0] as any).loi_id);
            }
          }
        }

        if (!loiIdScrutin) {
          setLoi(null);
          setTimeline([]);
          return;
        }

        let loiKeyCanon: string | null = null;

        const numeroProbe =
          normalizeDigitsOnly(numeroVotes) || String(numeroVotes).trim();

        if (numeroProbe) {
          const { data: rel, error: relErr } = await supabase
            .from("scrutins_loi_enrichis_unified")
            .select("loi_id_canon, loi_id_scrutin")
            .eq("numero_scrutin", numeroProbe)
            .limit(1);

          if (relErr) {
            console.warn("[SCRUTIN DETAIL] Erreur lien canon (unified by numero):", relErr);
          } else if (Array.isArray(rel) && rel.length > 0 && (rel[0] as any)?.loi_id_canon) {
            loiKeyCanon = String((rel[0] as any).loi_id_canon);
          }
        }

        if (!loiKeyCanon && looksLikeDossierId(loiIdScrutin)) {
          loiKeyCanon = loiIdScrutin;
        }

        if (!loiKeyCanon && looksLikeScrutinSlug(loiIdScrutin)) {
          const { data: mapRow, error: mapErr } = await supabase
            .from("lois_mapping")
            .select("id_dossier, confiance")
            .eq("loi_id", loiIdScrutin)
            .order("confiance", { ascending: false })
            .limit(1);

          if (mapErr) {
            console.warn("[SCRUTIN DETAIL] Erreur lois_mapping:", mapErr);
          } else if (Array.isArray(mapRow) && mapRow.length > 0 && (mapRow[0] as any)?.id_dossier) {
            loiKeyCanon = String((mapRow[0] as any).id_dossier);
          } else {
            console.warn("[SCRUTIN DETAIL] Mapping loi introuvable:", loiIdScrutin);
          }
        }

        // ✅ 6) Résumé loi
        let loiData: LoiResume | null = null;

        if (loiKeyCanon) {
          const { data, error: e } = await supabase
            .from("lois_app_unified")
            .select("loi_id, titre_loi, nb_scrutins_total, nb_articles, nb_amendements")
            .eq("loi_id", loiKeyCanon)
            .maybeSingle();

          if (e) console.warn("[SCRUTIN DETAIL] Erreur lois_app_unified(canon):", e);
          else if (data) loiData = data as LoiResume;
        }

        if (!loiData) {
          const { data, error: e } = await supabase
            .from("lois_app_unified")
            .select("loi_id, titre_loi, nb_scrutins_total, nb_articles, nb_amendements")
            .eq("loi_id", loiIdScrutin)
            .maybeSingle();

          if (e) console.warn("[SCRUTIN DETAIL] Erreur lois_app_unified(slug):", e);
          else if (data) loiData = data as LoiResume;
        }

        setLoi(loiData);

        // ✅ 7) Timeline
        if (loiKeyCanon) {
          const { data: scrs, error: scrError } = await supabase
            .from("scrutins_loi_enrichis_unified")
            .select("numero_scrutin, date_scrutin, titre, objet, resultat, kind, article_ref")
            .eq("loi_id_canon", loiKeyCanon)
            .order("date_scrutin", { ascending: true });

          if (scrError) {
            console.warn("[SCRUTIN DETAIL] Erreur timeline(unified canon):", scrError);
            setTimeline([]);
          } else {
            const mapped: TimelineItem[] =
              (scrs as any[])?.map((s: any) => ({
                numero_scrutin: String(s.numero_scrutin ?? ""),
                date_scrutin: s.date_scrutin,
                titre: s.titre,
                objet: s.objet,
                resultat: s.resultat,
                kind: s.kind,
                article_ref: s.article_ref,
              })) ?? [];
            setTimeline(mapped.filter((x) => !!x.numero_scrutin));
          }
        } else {
          const { data: scrs, error: scrError } = await supabase
            .from("scrutins_loi_enrichis_unified")
            .select("numero_scrutin, date_scrutin, titre, objet, resultat, kind, article_ref")
            .eq("loi_id_scrutin", loiIdScrutin)
            .order("date_scrutin", { ascending: true });

          if (scrError) {
            console.warn("[SCRUTIN DETAIL] Erreur timeline(unified slug):", scrError);
            setTimeline([]);
          } else {
            const mapped: TimelineItem[] =
              (scrs as any[])?.map((s: any) => ({
                numero_scrutin: String(s.numero_scrutin ?? ""),
                date_scrutin: s.date_scrutin,
                titre: s.titre,
                objet: s.objet,
                resultat: s.resultat,
                kind: s.kind,
                article_ref: s.article_ref,
              })) ?? [];
            setTimeline(mapped.filter((x) => !!x.numero_scrutin));
          }
        }
      } catch (e) {
        console.warn("[SCRUTIN DETAIL] Erreur loi/timeline:", e);
        setLoi(null);
        setTimeline([]);
      } finally {
        setLoiLoading(false);
      }
    },
    []
  );

  const loadScrutin = useCallback(async () => {
    if (!routeId) {
      setError("Ce scrutin n’est pas disponible.");
      setScrutin(null);
      setVotes([]);
      setSyntheseVotes(null);
      setResolvedNumero(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const input = routeId;
      if (!input) {
        setError("Ce scrutin n’existe pas (identifiant non résolu).");
        setScrutin(null);
        setVotes([]);
        setSyntheseVotes(null);
        setResolvedNumero(null);
        return;
      }

      const { scrutin: scrutinData, votes: votesData, error: queryError } =
        await fetchScrutinAvecVotes(input);

      if (queryError || !scrutinData) {
        setError("Ce scrutin n’existe pas ou n’est plus accessible.");
        setScrutin(null);
        setVotes([]);
        setSyntheseVotes(null);
        setResolvedNumero(null);
        return;
      }

      setScrutin(scrutinData);

      // ✅ priorité à la loi_id déjà calculée côté fetchScrutinAvecVotes
      const preferredLoiId = String(
        (scrutinData as any)?.loi_id ?? (scrutinData as any)?.loiId ?? ""
      ).trim();

      setVotes(votesData ?? []);

      const numeroVotes = String((scrutinData as any)?.numero_scrutin ?? "").trim();
      setResolvedNumero(numeroVotes || null);

      if (numeroVotes) {
        const { data: synthRows, error: synthError } = await supabase
          .from("votes_par_scrutin_synthese")
          .select("*")
          .eq("numero_scrutin", numeroVotes);

        if (synthError) {
          console.warn("[SCRUTIN DETAIL] Erreur chargement synthèse:", synthError);
          setSyntheseVotes(null);
        } else if (synthRows && synthRows.length > 0) {
          setSyntheseVotes(synthRows[0] as SyntheseVotes);
        } else {
          setSyntheseVotes(null);
        }
      } else {
        setSyntheseVotes(null);
      }

      await loadLoiEtTimeline(numeroVotes || input, input, preferredLoiId);

      setShowVotes(false);
      setShowAllTimeline(false);
      setShowGroupSummary(true);
      setShowAllGroups(false);
      setExpandTitle(false);
    } catch (e: any) {
      console.warn("[SCRUTIN DETAIL] Erreur inattendue:", e);
      setError(userMessageFromError(e));
      setScrutin(null);
      setVotes([]);
      setSyntheseVotes(null);
      setResolvedNumero(null);
    } finally {
      setLoading(false);
    }
  }, [routeId, loadLoiEtTimeline]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await loadScrutin();
    })();
    return () => {
      cancelled = true;
    };
  }, [loadScrutin]);

  const groupedVotes: GroupedVotes[] = useMemo(() => {
    if (!votes || votes.length === 0) return [];

    const groups: Record<string, GroupedVotes> = {};

    for (const v of votes) {
      const anyV = v as any;
      const gName = groupLabelFromAnyVote(anyV);

      if (!groups[gName]) {
        groups[gName] = { groupe: gName, pour: [], contre: [], abst: [], nv: [] };
      }

      const rawPosition =
        anyV.position ?? anyV.vote ?? anyV.sens_vote ?? anyV.voix ?? "";
      const p = String(rawPosition).toLowerCase();

      if (p.includes("pour")) groups[gName].pour.push(v);
      else if (p.includes("contre")) groups[gName].contre.push(v);
      else if (p.includes("abst")) groups[gName].abst.push(v);
      else groups[gName].nv.push(v);
    }

    return Object.values(groups).sort((a, b) => {
      const ta = a.pour.length + a.contre.length + a.abst.length + a.nv.length;
      const tb = b.pour.length + b.contre.length + b.abst.length + b.nv.length;
      return tb - ta;
    });
  }, [votes]);

  const nbPour: number = syntheseVotes?.nb_pour ?? (scrutin as any)?.nb_pour ?? 0;
  const nbContre: number =
    syntheseVotes?.nb_contre ?? (scrutin as any)?.nb_contre ?? 0;
  const nbAbst: number =
    syntheseVotes?.nb_abstention ?? (scrutin as any)?.nb_abstention ?? 0;

  const totalExpr: number = nbPour + nbContre + nbAbst;
  const pourPct = totalExpr > 0 ? Math.round((nbPour * 100) / totalExpr) : 0;
  const contrePct = totalExpr > 0 ? Math.round((nbContre * 100) / totalExpr) : 0;
  const abstPct = totalExpr > 0 ? Math.round((nbAbst * 100) / totalExpr) : 0;

  const titre: string =
    (scrutin as any)?.titre_scrutin ??
    (scrutin as any)?.titre ??
    (resolvedNumero ? `Scrutin n°${resolvedNumero}` : "Détail du scrutin");

  const objetShort: string =
    (scrutin as any)?.objet ??
    (scrutin as any)?.objet_scrutin ??
    "Scrutin parlementaire";

  const dateLabel =
    formatDateFR((scrutin as any)?.date_scrutin || (scrutin as any)?.date) ?? null;

  const resultLabel = computeResultLabel(scrutin as any, nbPour, nbContre);
  const major = majorityLabel(nbPour, nbContre, nbAbst);

  const numeroForRoutes = resolvedNumero ?? "";
  const timelineToShow = showAllTimeline ? timeline : timeline.slice(0, 3);
  const groupsToShow = showAllGroups ? groupedVotes : groupedVotes.slice(0, 6);

  const groupsCount = groupedVotes.length;

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={(colors as any).primary} />
        <Text style={styles.loadingText}>Chargement du scrutin…</Text>
      </SafeAreaView>
    );
  }

  if (error || !scrutin) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.errorText}>{error ?? "Scrutin introuvable."}</Text>

        <Pressable onPress={loadScrutin} style={styles.retryPill}>
          <Text style={styles.retryPillText}>Réessayer</Text>
        </Pressable>

        <Pressable onPress={() => router.back()} style={styles.backPill}>
          <Text style={styles.backPillText}>← Retour</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* ✅ Sticky header “premium” */}
      <Animated.View
        pointerEvents="box-none"
        style={[
          styles.sticky,
          {
            opacity: stickyOpacity,
            transform: [{ translateY: stickyTranslate }],
          },
        ]}
      >
        <View style={styles.stickyInner}>
          <Pressable onPress={() => router.back()} style={styles.stickyBack}>
            <Text style={styles.stickyBackIcon}>←</Text>
          </Pressable>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.stickyTitle} numberOfLines={1}>
              {numeroForRoutes ? `Scrutin ${numeroForRoutes}` : "Scrutin"}
              {dateLabel ? ` · ${dateLabel}` : ""}
            </Text>
            <Text style={styles.stickySub} numberOfLines={1}>
              {resultLabel}
              {major ? ` · ${major}` : ""}
            </Text>
          </View>

          <View style={styles.stickyPill}>
            <Text style={styles.stickyPillValue}>{pourPct}%</Text>
            <Text style={styles.stickyPillLabel}>Pour</Text>
          </View>
        </View>
      </Animated.View>

      <Animated.ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
      >
        {/* ✅ HERO “Wahou” */}
        <View style={styles.heroWrap}>
          {/* Pastel blobs */}
          <View style={styles.blobA} />
          <View style={styles.blobB} />
          <View style={styles.blobC} />

          <View style={styles.heroGlass}>
            <View style={styles.heroTopRow}>
              <Pressable onPress={() => router.back()} style={styles.backCircle}>
                <Text style={styles.backCircleIcon}>←</Text>
              </Pressable>

              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.heroKicker} numberOfLines={1}>
                  {numeroForRoutes ? `Scrutin ${numeroForRoutes}` : "Scrutin"}
                  {dateLabel ? ` · ${dateLabel}` : ""}
                </Text>

                <Text style={styles.heroSubKicker} numberOfLines={1}>
                  {resultLabel}
                  {major ? ` · ${major}` : ""}
                </Text>
              </View>

              <View style={styles.heroPctPill}>
                <Text style={styles.heroPctValue}>{pourPct}%</Text>
                <Text style={styles.heroPctLabel}>Pour</Text>
              </View>
            </View>

            <Pressable
              onPress={() => setExpandTitle((s) => !s)}
              style={({ pressed }) => [
                styles.heroTitleWrap,
                pressed && { opacity: 0.96 },
              ]}
            >
              <Text style={styles.heroTitle} numberOfLines={expandTitle ? 8 : 3}>
                {titre}
              </Text>
              <Text style={styles.heroSubtitle} numberOfLines={expandTitle ? 5 : 2}>
                {objetShort}
              </Text>
              <Text style={styles.heroHint}>
                {expandTitle ? "Tap pour réduire" : "Tap pour lire la suite"}
              </Text>
            </Pressable>

            <View style={styles.heroMetaRow}>
              {numeroForRoutes ? <Chip tone="accent" label={`Scrutin ${numeroForRoutes}`} /> : null}
              <Chip label={`Législature ${CURRENT_LEGISLATURE}`} />
              {(scrutin as any).article_ref ? (
                <Chip label={`Art. ${(scrutin as any).article_ref}`} />
              ) : null}
              {major ? <Chip label={major} /> : null}
            </View>

            <View style={styles.heroNarrative}>
              <Text style={styles.narrativeText}>
                <Text style={styles.narrativeStrong}>{resultLabel}</Text>{" "}
                · Pour <Text style={styles.narrativeStrong}>{pourPct}%</Text> · Contre{" "}
                <Text style={styles.narrativeStrong}>{contrePct}%</Text>
                {abstPct ? (
                  <>
                    {" "}
                    · Abst. <Text style={styles.narrativeStrong}>{abstPct}%</Text>
                  </>
                ) : null}
              </Text>
              <Text style={styles.narrativeHint}>
                Appuie pour voir qui a voté quoi, groupe par groupe.
              </Text>
            </View>

            <Pressable
              style={({ pressed }) => [styles.primaryCta, pressed && { opacity: 0.92 }]}
              onPress={() => {
                if (!numeroForRoutes) return;
                router.push(`/scrutins/${numeroForRoutes}/groupes`);
              }}
            >
              <Text style={styles.primaryCtaText}>
                Voir le détail par groupe {groupsCount ? `(${groupsCount}) ` : ""}→
              </Text>
            </Pressable>
          </View>
        </View>

        {/* LOI ASSOCIÉE */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Loi associée</Text>

          {loiLoading && (
            <View style={styles.centerSmall}>
              <ActivityIndicator size="small" color={(colors as any).primary} />
              <Text style={styles.loadingText}>Chargement des informations de la loi…</Text>
            </View>
          )}

          {!loiLoading && !loi && (
            <Text style={styles.grey}>Ce scrutin n&apos;est pas encore relié à une loi.</Text>
          )}

          {!loiLoading && loi && (
            <>
              <Text style={styles.bigText} numberOfLines={3}>
                {loi.titre_loi ?? "Titre non disponible"}
              </Text>
              <Text style={styles.grey}>Loi {loi.loi_id}</Text>

              <View style={styles.row}>
                <Chip label={`Scrutins ${loi.nb_scrutins_total ?? "—"}`} />
                <Chip label={`Articles ${loi.nb_articles ?? "—"}`} />
                <Chip label={`Amendements ${loi.nb_amendements ?? "—"}`} />
              </View>

              <Pressable
                style={({ pressed }) => [styles.loiButton, pressed && { opacity: 0.92 }]}
                onPress={() => router.push(routeFromItemId(loi.loi_id))}
              >
                <Text style={styles.loiButtonText}>Ouvrir la fiche loi →</Text>
              </Pressable>
            </>
          )}
        </View>

        {/* RÉSULTAT & RÉPARTITION */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Résultat & répartition</Text>

          <View style={styles.row}>
            <Stat label="Pour" value={nbPour} tone="good" />
            <Stat label="Contre" value={nbContre} tone="bad" />
            <Stat label="Abst." value={nbAbst} tone="warn" />
          </View>

          <Text style={[styles.grey, { marginTop: 6 }]}>
            Pour {pourPct}% · Contre {contrePct}% · Abstention {abstPct}%
          </Text>

          <View style={styles.voteBar}>
            <View
              style={[
                styles.barSeg,
                { flex: Math.max(nbPour, 1), backgroundColor: SOFT_GREEN },
              ]}
            />
            <View
              style={[
                styles.barSeg,
                { flex: Math.max(nbContre, 1), backgroundColor: SOFT_RED },
              ]}
            />
            <View
              style={[
                styles.barSeg,
                { flex: Math.max(nbAbst, 1), backgroundColor: SOFT_YELLOW },
              ]}
            />
          </View>

          <View style={{ marginTop: 12, alignItems: "center" }}>
            <DonutChart
              pour={nbPour}
              contre={nbContre}
              abstention={nbAbst}
              size={150}
              strokeWidth={16}
              soft
            />
          </View>
        </View>

        {/* PARCOURS DE LA LOI */}
        {loi && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Parcours de la loi</Text>

            {timeline.length === 0 && (
              <Text style={styles.grey}>Aucun autre scrutin enrichi pour cette loi.</Text>
            )}

            {timelineToShow.map((item: TimelineItem) => {
              const isCurrent =
                numeroForRoutes &&
                String(item.numero_scrutin) === String(numeroForRoutes);

              return (
                <Pressable
                  key={item.numero_scrutin}
                  disabled={!!isCurrent}
                  onPress={() => router.push(`/scrutins/${item.numero_scrutin}`)}
                  style={({ pressed }) => [
                    styles.timelineItem,
                    isCurrent ? styles.timelineItemActive : null,
                    pressed && !isCurrent && { opacity: 0.92 },
                  ]}
                >
                  <View style={styles.timelineBulletColumn}>
                    <View
                      style={[
                        styles.timelineBullet,
                        isCurrent && styles.timelineBulletActive,
                      ]}
                    />
                    <View style={styles.timelineLine} />
                  </View>

                  <View style={styles.timelineContent}>
                    <View style={styles.timelineHeaderRow}>
                      <Text
                        style={[
                          styles.timelineNumero,
                          isCurrent && styles.timelineNumeroActive,
                        ]}
                      >
                        Scrutin n°{item.numero_scrutin}
                      </Text>
                      {item.date_scrutin && (
                        <Text style={styles.timelineDate}>
                          {new Date(item.date_scrutin).toLocaleDateString("fr-FR")}
                        </Text>
                      )}
                    </View>

                    <Text
                      style={[
                        styles.timelineTitre,
                        isCurrent && styles.timelineTitreActive,
                      ]}
                      numberOfLines={2}
                    >
                      {item.titre || item.objet || "Scrutin parlementaire"}
                    </Text>
                  </View>
                </Pressable>
              );
            })}

            {timeline.length > 3 && (
              <Pressable
                onPress={() => setShowAllTimeline((s) => !s)}
                style={({ pressed }) => [styles.secondaryCta, pressed && { opacity: 0.92 }]}
              >
                <Text style={styles.secondaryCtaText}>
                  {showAllTimeline ? "Voir moins" : `Voir plus (${timeline.length - 3})`}
                </Text>
              </Pressable>
            )}
          </View>
        )}

        {/* SYNTHÈSE PAR GROUPE */}
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionTitle}>Synthèse par groupe</Text>

            <Pressable
              onPress={() => setShowGroupSummary((s) => !s)}
              style={({ pressed }) => [styles.togglePill, pressed && { opacity: 0.92 }]}
            >
              <Text style={styles.togglePillText}>{showGroupSummary ? "Masquer" : "Afficher"}</Text>
            </Pressable>
          </View>

          {!showGroupSummary && (
            <Text style={styles.grey}>
              Aperçu optionnel (tu as déjà le “détail par groupe” au-dessus).
            </Text>
          )}

          {showGroupSummary && groupedVotes.length === 0 && (
            <Text style={styles.grey}>Aucun vote disponible pour ce scrutin.</Text>
          )}

          {showGroupSummary && groupedVotes.length > 0 && (
            <>
              <View style={{ marginTop: 6 }}>
  {groupsToShow.map((g) => (
    <GroupRow
      key={g.groupe}
      groupe={g.groupe}
      pour={g.pour.length}
      contre={g.contre.length}
      abst={g.abst.length}
      nv={g.nv.length}
    />
  ))}
</View>

              {groupedVotes.length > 6 && (
                <Pressable
                  onPress={() => setShowAllGroups((s) => !s)}
                  style={({ pressed }) => [styles.secondaryCta, pressed && { opacity: 0.92 }]}
                >
                  <Text style={styles.secondaryCtaText}>
                    {showAllGroups ? "Voir moins" : `Voir plus (${groupedVotes.length - 6})`}
                  </Text>
                </Pressable>
              )}

            </>
          )}
        </View>

        {/* VOTES DÉTAILLÉS */}
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionTitle}>Votes détaillés</Text>
            <Pressable
              onPress={() => setShowVotes((s) => !s)}
              style={({ pressed }) => [styles.togglePill, pressed && { opacity: 0.92 }]}
            >
              <Text style={styles.togglePillText}>{showVotes ? "Masquer" : "Afficher"}</Text>
            </Pressable>
          </View>

          {!showVotes && (
            <Text style={styles.grey}>
              Replié pour éviter une liste trop longue. Appuie sur “Afficher”.
            </Text>
          )}

          {showVotes && groupedVotes.length === 0 && (
            <Text style={styles.grey}>Aucun vote disponible pour ce scrutin.</Text>
          )}

          {showVotes &&
            groupedVotes.map((g: GroupedVotes) => {
              const allVotes = [...g.pour, ...g.contre, ...g.abst, ...g.nv];
              if (allVotes.length === 0) return null;

              return (
                <View key={g.groupe} style={styles.groupBlock}>
                  <Text style={styles.groupTitle}>{g.groupe}</Text>

                  {allVotes.map((v: any, idx: number) => {
                    const depId = getDeputeId(v);
                    const key2 = `${g.groupe}-${depId ?? "unknown"}-${v.position ?? v.vote ?? "?"}-${idx}`;

                    return (
                      <VoteRow
                        key={key2}
                        vote={v}
                        onPress={depId ? () => router.push(`/deputes/${depId}`) : undefined}
                      />
                    );
                  })}
                </View>
              );
            })}
        </View>

        <View style={{ height: 40 }} />
      </Animated.ScrollView>
    </SafeAreaView>
  );
}

/* ===========================================================
   🎨 Styles
=========================================================== */

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: (colors as any).background },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: (colors as any).background,
  },

  loadingText: { marginTop: 10, color: SUBTEXT, fontSize: 13 },
  errorText: {
    color: (colors as any).danger || "red",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 12,
    fontWeight: "800",
    lineHeight: 18,
  },

  retryPill: {
    marginTop: 2,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  retryPillText: { color: TEXT, fontWeight: "900" },

  backPill: {
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: (colors as any).card,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  backPillText: { color: TEXT, fontWeight: "800" },

  /* Sticky header */
  sticky: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    paddingTop: 6,
    paddingHorizontal: 12,
  },
  stickyInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 18,
    backgroundColor: "rgba(2,6,23,0.78)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  stickyBack: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: "rgba(15,23,42,0.75)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  stickyBackIcon: { color: "#fff", fontSize: 18, fontWeight: "900" },
  stickyTitle: { color: TEXT, fontSize: 13, fontWeight: "900" },
  stickySub: { color: SUBTEXT, fontSize: 12, fontWeight: "700", marginTop: 2 },
  stickyPill: {
    width: 72,
    paddingVertical: 10,
    borderRadius: 999,
    alignItems: "center",
    backgroundColor: ACCENT,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
  },
  stickyPillValue: { color: TEXT, fontSize: 15, fontWeight: "900" },
  stickyPillLabel: { color: SUBTEXT, fontSize: 11, fontWeight: "800", marginTop: 2 },

  content: { padding: 16, paddingBottom: 40, paddingTop: 14 },
  centerSmall: { alignItems: "center", justifyContent: "center", paddingTop: 4 },

  /* Hero “wahou” */
  heroWrap: {
    borderRadius: 26,
    overflow: "hidden",
    marginBottom: 14,
  },
  heroGlass: {
    padding: 16,
    backgroundColor: "rgba(2,6,23,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  blobA: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 260,
    backgroundColor: "rgba(99,102,241,0.28)",
    top: -140,
    left: -120,
  },
  blobB: {
    position: "absolute",
    width: 300,
    height: 300,
    borderRadius: 300,
    backgroundColor: "rgba(16,185,129,0.18)",
    top: -80,
    right: -170,
  },
  blobC: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 260,
    backgroundColor: "rgba(244,114,182,0.12)",
    bottom: -180,
    left: 40,
  },

  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  backCircle: {
    width: 42,
    height: 42,
    borderRadius: 999,
    backgroundColor: "rgba(15,23,42,0.72)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  backCircleIcon: { color: "#fff", fontSize: 18, fontWeight: "900" },

  heroKicker: { color: TEXT, fontSize: 14, fontWeight: "900" },
  heroSubKicker: { color: SUBTEXT, fontSize: 12, fontWeight: "800", marginTop: 2 },

  heroPctPill: {
    width: 78,
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: "center",
    backgroundColor: ACCENT_STRONG,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
  },
  heroPctValue: { color: TEXT, fontSize: 16, fontWeight: "900" },
  heroPctLabel: { color: SUBTEXT, fontSize: 11, fontWeight: "800", marginTop: 2 },

  heroTitleWrap: {
    marginTop: 14,
    padding: 14,
    borderRadius: 18,
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  heroTitle: { color: TEXT, fontSize: 22, fontWeight: "900", lineHeight: 26 },
  heroSubtitle: {
    marginTop: 8,
    color: SUBTEXT,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  heroHint: {
    marginTop: 8,
    color: "rgba(229,231,235,0.55)",
    fontSize: 11,
    fontWeight: "800",
  },

  heroMetaRow: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  heroNarrative: {
    marginTop: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.035)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  narrativeText: { color: SUBTEXT, fontSize: 13, fontWeight: "800" },
  narrativeStrong: { color: TEXT, fontWeight: "900" },
  narrativeHint: { marginTop: 8, color: "rgba(229,231,235,0.60)", fontSize: 12, fontWeight: "700" },

  primaryCta: {
    marginTop: 12,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: "rgba(99,102,241,0.22)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  primaryCtaText: { color: TEXT, fontSize: 15, fontWeight: "900" },

  /* Cards */
  card: {
    backgroundColor: (colors as any).card,
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },

  sectionTitle: {
    color: TEXT,
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 10,
  },

  grey: { color: SUBTEXT, fontSize: 12, fontWeight: "600" },
  bigText: { color: TEXT, fontSize: 16, fontWeight: "900", marginBottom: 6 },

  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  chipAccent: {
    backgroundColor: "rgba(99,102,241,0.18)",
    borderColor: "rgba(255,255,255,0.12)",
  },
  chipText: { color: SUBTEXT, fontSize: 11, fontWeight: "800" },
  chipTextAccent: { color: TEXT },

  loiButton: {
    marginTop: 10,
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(56,189,248,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  loiButtonText: { color: TEXT, fontSize: 13, fontWeight: "900" },

  statBlock: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 19, fontWeight: "900" },
  statLabel: { fontSize: 12, color: SUBTEXT, fontWeight: "800" },

  voteBar: {
    flexDirection: "row",
    height: 9,
    borderRadius: 999,
    overflow: "hidden",
    marginTop: 12,
    backgroundColor: SOFT_TRACK,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  barSeg: { height: "100%" },

  secondaryCta: {
    marginTop: 12,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  secondaryCtaText: { color: TEXT, fontSize: 14, fontWeight: "900" },

  /* Timeline */
  timelineItem: { flexDirection: "row", marginBottom: 10 },
  timelineItemActive: {
    backgroundColor: "rgba(99,102,241,0.12)",
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  timelineBulletColumn: { alignItems: "center", marginRight: 10 },
  timelineBullet: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "rgba(255,255,255,0.35)",
    marginTop: 4,
  },
  timelineBulletActive: { backgroundColor: "rgba(99,102,241,1)" },
  timelineLine: {
    flex: 1,
    width: 2,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginTop: 2,
  },
  timelineContent: { flex: 1 },
  timelineHeaderRow: { flexDirection: "row", justifyContent: "space-between" },
  timelineNumero: { color: SUBTEXT, fontSize: 12, fontWeight: "900" },
  timelineNumeroActive: { color: TEXT, fontWeight: "900" },
  timelineDate: { color: SUBTEXT, fontSize: 11, fontWeight: "800" },
  timelineTitre: {
    color: TEXT,
    fontSize: 13,
    marginTop: 3,
    marginBottom: 4,
    fontWeight: "800",
    lineHeight: 18,
  },
  timelineTitreActive: { fontWeight: "900" },

  /* Groupes */
  groupBlock: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  groupTitle: { color: TEXT, fontWeight: "900", marginBottom: 6 },

  /* Mini cards */
  miniGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 12,
  },
  miniCard: {
    width: "47%",
    backgroundColor: "rgba(255,255,255,0.045)",
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    marginBottom: 10,
  },
  miniGroupTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: TEXT,
    marginBottom: 8,
  },
  miniCountsRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  miniDot: {
    width: 10,
    height: 10,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  miniCountsText: {
    color: SUBTEXT,
    fontWeight: "900",
    fontSize: 12,
    marginRight: 6,
  },
  miniTrend: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "900",
    color: TEXT,
    opacity: 0.92,
  },

  /* Vote row */
  voteRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  voteLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 8,
  },
  voteAvatar: { width: 34, height: 34, borderRadius: 17, marginRight: 10 },
  voteAvatarFallback: {
    width: 34,
    height: 34,
    borderRadius: 17,
    marginRight: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  voteAvatarInitial: { color: TEXT, fontSize: 14, fontWeight: "900" },
  voteTextCol: { flex: 1 },
  voteName: { color: TEXT, fontSize: 13, fontWeight: "900" },
  voteGroup: {
    color: SUBTEXT,
    fontSize: 11,
    marginTop: 2,
    fontWeight: "800",
  },
  voteRight: { marginLeft: 8 },

  togglePill: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  togglePillText: { color: TEXT, fontWeight: "900", fontSize: 12 },
  groupRow: {
  paddingVertical: 10,
  paddingHorizontal: 12,
  borderRadius: 14,
  backgroundColor: "rgba(255,255,255,0.04)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
  marginTop: 10,
},

groupRowTop: {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
},

groupRowTitle: {
  flex: 1,
  minWidth: 0,
  color: TEXT,
  fontSize: 13,
  fontWeight: "900",
},

groupRowNums: {
  color: SUBTEXT,
  fontSize: 12,
  fontWeight: "800",
},

groupRowBar: {
  flexDirection: "row",
  height: 8,
  borderRadius: 999,
  overflow: "hidden",
  marginTop: 8,
  backgroundColor: SOFT_TRACK,
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.06)",
},

groupRowSeg: { height: "100%" },

});
