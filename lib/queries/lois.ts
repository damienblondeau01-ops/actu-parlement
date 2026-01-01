// lib/queries/lois.ts
import { fromSafe, DB_VIEWS } from "@/lib/dbContract";

/**
 * =========================
 *  LISTE + FOCUS (lois_app)
 * =========================
 */
export type LoiListRow = {
  loi_id: string;
  titre_loi: string | null;
  legislature: number | null;
  nb_scrutins_total: number | null;
  nb_articles: number | null;
  nb_amendements: number | null;
  date_premier_scrutin: string | null; // date
  date_dernier_scrutin: string | null; // date

  // ✅ optionnel si ta view le fournit
  resume_citoyen?: string | null;
};

function isMissingColumnError(err: any) {
  const code = String(err?.code ?? "");
  const msg = String(err?.message ?? "").toLowerCase();
  return (
    code === "42703" ||
    msg.includes("does not exist") ||
    msg.includes("undefined column")
  );
}

// helper pour retourner data proprement
function pick<T>(data: any): T {
  return (data ?? null) as T;
}

const LOI_SELECT_WITH_RESUME = `
  loi_id,
  titre_loi,
  legislature,
  nb_scrutins_total,
  nb_articles,
  nb_amendements,
  date_premier_scrutin,
  date_dernier_scrutin,
  resume_citoyen
`;

const LOI_SELECT_NO_RESUME = `
  loi_id,
  titre_loi,
  legislature,
  nb_scrutins_total,
  nb_articles,
  nb_amendements,
  date_premier_scrutin,
  date_dernier_scrutin
`;

export type LoiJOStatusRow = {
  loi_id: string;
  date_promulgation: string | null; // date
  date_publication_jo: string | null; // date
  date_entree_vigueur: string | null; // date
  url_promulgation: string | null;
  url_publication_jo: string | null;
  url_entree_vigueur: string | null;
  source_label_promulgation: string | null;
};

export async function fetchLoisList(limit = 200) {
  const r1 = await fromSafe(DB_VIEWS.LOIS_APP)
    .select(LOI_SELECT_WITH_RESUME)
    .order("date_dernier_scrutin", { ascending: false })
    .limit(limit);

  if (!r1.error) return (r1.data ?? []) as LoiListRow[];

  if (!isMissingColumnError(r1.error)) throw r1.error;

  const { data, error } = await fromSafe(DB_VIEWS.LOIS_APP)
    .select(LOI_SELECT_NO_RESUME)
    .order("date_dernier_scrutin", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as LoiListRow[];
}

export async function fetchLoisFocus() {
  const r1 = await fromSafe(DB_VIEWS.LOIS_APP)
    .select(
      `
      loi_id,
      titre_loi,
      legislature,
      nb_scrutins_total,
      nb_articles,
      nb_amendements,
      date_dernier_scrutin,
      resume_citoyen
    `
    )
    .not("date_dernier_scrutin", "is", null)
    .order("date_dernier_scrutin", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!r1.error)
    return pick<
      | Pick<
          LoiListRow,
          | "loi_id"
          | "titre_loi"
          | "legislature"
          | "nb_scrutins_total"
          | "nb_articles"
          | "nb_amendements"
          | "date_dernier_scrutin"
          | "resume_citoyen"
        >
      | null
    >(r1.data);

  if (!isMissingColumnError(r1.error)) throw r1.error;

  const { data, error } = await fromSafe(DB_VIEWS.LOIS_APP)
    .select(
      `
      loi_id,
      titre_loi,
      legislature,
      nb_scrutins_total,
      nb_articles,
      nb_amendements,
      date_dernier_scrutin
    `
    )
    .not("date_dernier_scrutin", "is", null)
    .order("date_dernier_scrutin", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  return pick<
    | Pick<
        LoiListRow,
        | "loi_id"
        | "titre_loi"
        | "legislature"
        | "nb_scrutins_total"
        | "nb_articles"
        | "nb_amendements"
        | "date_dernier_scrutin"
      >
    | null
  >(data);
}

/**
 * ======================
 *  FICHE LOI (lois_app)
 * ======================
 */
export type LoiDetailRow = LoiListRow;

// ✅ vue fallback Actu
const VIEW_SCRUTINS_LOI_ENRICHIS_UNIFIED = "scrutins_loi_enrichis_unified";

export async function fetchLoiDetail(loiId: string) {
  const id = String(loiId ?? "").trim();
  if (!id) return null;

  const r1 = await fromSafe(DB_VIEWS.LOIS_APP)
    .select(LOI_SELECT_WITH_RESUME)
    .eq("loi_id", id)
    .maybeSingle();

  if (!r1.error) {
    const base = pick<LoiDetailRow | null>(r1.data);

    // ✅ Fallback si l’objet est vide ET qu’on est sur un id "loi:..."
    if (
      id.startsWith("loi:") &&
      base &&
      typeof base === "object" &&
      Object.keys(base as any).length === 0
    ) {
      // on continue vers le resolver ci-dessous
    } else {
      return base;
    }
  } else {
    if (!isMissingColumnError(r1.error)) throw r1.error;

    const { data, error } = await fromSafe(DB_VIEWS.LOIS_APP)
      .select(LOI_SELECT_NO_RESUME)
      .eq("loi_id", id)
      .maybeSingle();

    if (error) throw error;

    const base = pick<LoiDetailRow | null>(data);

    // ✅ Fallback si objet vide ET id "loi:..."
    if (
      id.startsWith("loi:") &&
      base &&
      typeof base === "object" &&
      Object.keys(base as any).length === 0
    ) {
      // on continue vers le resolver ci-dessous
    } else {
      return base;
    }
  }

const { data: jo, error: joErr } = await fromSafe(DB_VIEWS.LOI_JO_STATUS)
  .select("*")
  .eq("loi_id", loiId)
  .maybeSingle();

const joStatus = (joErr ? null : (jo as any)) as LoiJOStatusRow | null;

  
  /**
   * ✅ RESOLVER :
   * si on reçoit un canonKey "loi:..." et que LOIS_APP ne renvoie rien,
   * on tente de retrouver un "pseudo detail" via scrutins_loi_enrichis_unified
   */
  if (id.startsWith("loi:")) {
    const canonKey = id;

    const { data: hit, error: eHit } = await fromSafe(
      VIEW_SCRUTINS_LOI_ENRICHIS_UNIFIED as any
    )
      .select(
        "loi_id_canon, loi_id_scrutin, dossier_id, numero_scrutin, titre, date_scrutin"
      )
      .or(`loi_id_canon.eq.${canonKey},loi_id_scrutin.eq.${canonKey}`)
      .order("date_scrutin", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!eHit && hit) {
      return {
        loi_id: canonKey,
        titre_loi: (hit as any)?.titre ?? null,
        legislature: null,
        nb_scrutins_total: null,
        nb_articles: null,
        nb_amendements: null,
        date_premier_scrutin: null,
        date_dernier_scrutin: (hit as any)?.date_scrutin ?? null,
        resume_citoyen: null,

        // bonus debug (facultatif)
        ...(hit as any),
        _resolved_from: "scrutins_loi_enrichis_unified",
      } as any;
    }
  }

  return null;
}

/**
 * ==========================
 *  TIMELINE (scrutins liés)
 * ==========================
 */
export type LoiTimelineRow = {
  loi_id: string;
  numero_scrutin: string; // ✅ attendu côté app
  date_scrutin: string | null;
  titre: string | null;
  objet: string | null;
  resultat: string | null;
  kind: string | null;
  article_ref: string | null;
  legislature?: number | null;
  kind_label?: string | null;
  result_short?: string | null;
  is_final?: boolean | null;
  article_num?: number | null;
  scrutin_label_short?: string | null;
};

// ✅ vue canon (si DB_VIEWS n'a pas la clé, on force le nom)
const VIEW_SCRUTINS_PAR_LOI_APP = "scrutins_par_loi_app";

/**
 * ✅ Timeline CANON par canonKey "loi:..."
 * Source: scrutins_par_loi_app
 * -> renvoie [] si pas applicable / pas de data
 */
export async function fetchLoiTimelineCanon(canonKey: string, limit = 500) {
  const ck = String(canonKey ?? "").trim();
  if (!ck || !ck.startsWith("loi:")) return [] as LoiTimelineRow[];

  const { data, error } = await fromSafe(VIEW_SCRUTINS_PAR_LOI_APP as any)
    .select(
      `
      loi_id,
      numero_scrutin,
      date_scrutin,
      titre,
      objet,
      resultat,
      kind,
      article_ref,
      legislature
    `
    )
    .eq("loi_id", ck)
    .order("date_scrutin", { ascending: false })
    .order("numero_scrutin", { ascending: false })
    .limit(limit);

  // ✅ si la vue n'existe pas / colonne manque -> on retourne [] (fallback écran)
  if (error) {
    const msg = String((error as any)?.message ?? "");
    console.log("[fetchLoiTimelineCanon] error =", msg);
    return [] as LoiTimelineRow[];
  }

  return (data ?? []) as LoiTimelineRow[];
}

const TIMELINE_SELECT = `
   loi_id,
  numero_scrutin,
  date_scrutin,
  titre,
  objet,
  resultat,
  kind,
  article_ref,
  legislature,
  kind_label,
  result_short,
  is_final,
  article_num,
  scrutin_label_short
`;

// ✅ select fallback unified SANS legislature (car tu as l’erreur “legislature does not exist”)
const UNIFIED_TIMELINE_SELECT_NO_LEGISLATURE = `
  numero_scrutin,
  date_scrutin,
  titre,
  objet,
  resultat,
  kind,
  article_ref,
  loi_id_canon,
  loi_id_scrutin
`;

// ✅ si la colonne existe dans ta DB, on pourra la prendre, sinon fallback safe
const UNIFIED_TIMELINE_SELECT_WITH_DOSSIER = `
  numero_scrutin,
  date_scrutin,
  titre,
  objet,
  resultat,
  kind,
  article_ref,
  loi_id_canon,
  loi_id_scrutin,
  dossier_id
`;

async function resolveDossierIdFromCanonKey(
  canonKey: string
): Promise<string | null> {
  const ck = String(canonKey ?? "").trim();
  if (!ck || !ck.startsWith("loi:")) return null;

  // 1) tentative avec dossier_id (si la colonne existe)
  const r1 = await fromSafe(VIEW_SCRUTINS_LOI_ENRICHIS_UNIFIED as any)
    .select("dossier_id, loi_id_scrutin, loi_id_canon, date_scrutin")
    .or(`loi_id_canon.eq.${ck},loi_id_scrutin.eq.${ck}`)
    .order("date_scrutin", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!r1.error) {
    const dossierId = String((r1.data as any)?.dossier_id ?? "").trim();
    if (dossierId) return dossierId;

    const alt = String((r1.data as any)?.loi_id_scrutin ?? "").trim();
    return alt || null;
  }

  // 2) fallback sans dossier_id (si colonne absente)
  if (isMissingColumnError(r1.error)) {
    const r2 = await fromSafe(VIEW_SCRUTINS_LOI_ENRICHIS_UNIFIED as any)
      .select("loi_id_scrutin, loi_id_canon, date_scrutin")
      .or(`loi_id_canon.eq.${ck},loi_id_scrutin.eq.${ck}`)
      .order("date_scrutin", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (r2.error) return null;

    const alt = String((r2.data as any)?.loi_id_scrutin ?? "").trim();
    return alt || null;
  }

  return null;
}

// ta view listée existe : public.scrutins_data
const VIEW_SCRUTINS_DATA = "scrutins_data";

/**
 * ✅ Timeline (CANON)
 * - Source de vérité: DB_VIEWS.SCRUTINS_PAR_LOI_APP (scrutins_par_loi_app)
 * - Input: canonKey ("loi:...") de préférence
 *
 * Fallback conservé:
 * - si id est un slug "scrutin-..." ou si la vue renvoie 0,
 *   on tente scrutins_data / unified (comme avant) pour ne pas casser.
 */
export async function fetchLoiTimeline(loiId: string, limit = 500) {
  const id = String(loiId ?? "").trim();
  if (!id) return [];

  // 0) ✅ Source canon: scrutins_par_loi_app (si on a un canonKey "loi:...")
  if (id.startsWith("loi:")) {
    const { data, error } = await fromSafe(DB_VIEWS.SCRUTINS_PAR_LOI_APP as any)
      .select(TIMELINE_SELECT)
      .eq("loi_id", id)
      .order("date_scrutin", { ascending: false })
      .order("numero_scrutin", { ascending: false })
      .limit(limit);

    console.log(
      "[fetchLoiTimeline][scrutins_par_loi_app] loi_id =",
      id,
      "| got =",
      (data ?? []).length,
      "| error =",
      error?.message ?? null
    );

    /**
     * ✅ IMPORTANT (anti-régression) :
     * si la vue existe mais que certaines colonnes manquent (kind_label, etc.),
     * on ne throw pas : on refait un select minimal.
     */
    if (error) {
      if (!isMissingColumnError(error)) throw error;

      console.log(
        "[fetchLoiTimeline] missing column in scrutins_par_loi_app -> fallback minimal:",
        error?.message ?? error
      );

      const { data: dataMin, error: errMin } = await fromSafe(
        DB_VIEWS.SCRUTINS_PAR_LOI_APP as any
      )
        .select(
          `
          loi_id,
          numero_scrutin,
          date_scrutin,
          titre,
          objet,
          resultat,
          kind,
          article_ref,
          legislature
        `
        )
        .eq("loi_id", id)
        .order("date_scrutin", { ascending: false })
        .order("numero_scrutin", { ascending: false })
        .limit(limit);

      console.log(
        "[fetchLoiTimeline][scrutins_par_loi_app|min] loi_id =",
        id,
        "| got =",
        (dataMin ?? []).length,
        "| error =",
        errMin?.message ?? null
      );

      if (errMin) throw errMin;

      const rowsMin = (dataMin ?? []) as LoiTimelineRow[];
      if (rowsMin.length > 0) return rowsMin;
    } else {
      const rows = (data ?? []) as LoiTimelineRow[];
      if (rows.length > 0) return rows;
      // si 0, on continue vers les fallbacks ci-dessous
    }
  }

  /**
   * ✅ Fallbacks (anti-régression) — on garde ta logique existante
   * pour ne pas casser les autres écrans / navigations.
   */

  const VIEW_SCRUTINS_DATA_LOCAL = "scrutins_data";

  async function fetchFromScrutinsData(slug: string): Promise<LoiTimelineRow[]> {
    const { data, error } = await fromSafe(VIEW_SCRUTINS_DATA_LOCAL as any)
      .select(
        `
        numero,
        date_scrutin,
        titre,
        objet,
        resultat,
        kind,
        article_ref,
        legislature
      `
      )
      .eq("loi_id", slug)
      .order("date_scrutin", { ascending: false })
      .order("numero", { ascending: false })
      .limit(limit);

    console.log(
      "[fetchLoiTimeline][scrutins_data] loi_id =",
      slug,
      "| got =",
      (data ?? []).length,
      "| error =",
      error?.message ?? null
    );

    if (error) throw error;

    return (data ?? []).map((r: any) => ({
      loi_id: slug,
      numero_scrutin: String(r.numero ?? ""),
      date_scrutin: r.date_scrutin ?? null,
      titre: r.titre ?? null,
      objet: r.objet ?? null,
      resultat: r.resultat ?? null,
      kind: r.kind ?? null,
      article_ref: r.article_ref ?? null,
      legislature: r.legislature ?? null,
    })) as LoiTimelineRow[];
  }

  /**
   * ✅ NEW (B) : fetch scrutins_data via group_key IN (ordinaire + solennel)
   * -> permet de récupérer les votes solennels (4947 / 525) en plus des ordinaires.
   */
  function buildGroupKeyVariants(gk: string): string[] {
    const s = String(gk ?? "").trim();
    if (!s) return [];
    const out = new Set<string>();
    out.add(s);

    // si l’un est présent, on génère l’autre
    if (s.includes("scrutin-public-ordinaire-")) {
      out.add(s.replace("scrutin-public-ordinaire-", "scrutin-public-solennel-"));
    }
    if (s.includes("scrutin-public-solennel-")) {
      out.add(s.replace("scrutin-public-solennel-", "scrutin-public-ordinaire-"));
    }

    return Array.from(out).filter(Boolean);
  }

  async function fetchFromScrutinsDataByGroupKeys(
    groupKeys: string[],
    attachLoiId: string
  ): Promise<LoiTimelineRow[]> {
    const keys = (groupKeys ?? []).map((x) => String(x ?? "").trim()).filter(Boolean);
    if (keys.length === 0) return [];

    const { data, error } = await fromSafe(VIEW_SCRUTINS_DATA_LOCAL as any)
      .select(
        `
        numero,
        date_scrutin,
        titre,
        objet,
        resultat,
        kind,
        article_ref,
        legislature,
        group_key
      `
      )
      .in("group_key", keys)
      .order("date_scrutin", { ascending: false })
      .order("numero", { ascending: false })
      .limit(limit);

    console.log(
      "[fetchLoiTimeline][scrutins_data|group_key IN] keys =",
      keys.join(" | "),
      "| got =",
      (data ?? []).length,
      "| error =",
      error?.message ?? null
    );

    if (error) throw error;

    return (data ?? []).map((r: any) => ({
      loi_id: attachLoiId, // ✅ on rattache au canon id (loi:...)
      numero_scrutin: String(r.numero ?? ""),
      date_scrutin: r.date_scrutin ?? null,
      titre: r.titre ?? null,
      objet: r.objet ?? null,
      resultat: r.resultat ?? null,
      kind: r.kind ?? null,
      article_ref: r.article_ref ?? null,
      legislature: r.legislature ?? null,
    })) as LoiTimelineRow[];
  }

  async function fetchGroupKeyFromScrutinsData(slug: string): Promise<string | null> {
    const s = String(slug ?? "").trim();
    if (!s) return null;

    const { data, error } = await fromSafe(VIEW_SCRUTINS_DATA_LOCAL as any)
      .select("group_key")
      .eq("loi_id", s)
      .limit(1)
      .maybeSingle();

    if (error) return null;

    const gk = String((data as any)?.group_key ?? "").trim();
    return gk || null;
  }

  // 1) slug direct -> scrutins_data
  if (id.startsWith("scrutin-")) {
    return await fetchFromScrutinsData(id);
  }

  // 2) canonKey "loi:..." -> resolve slug -> scrutins_data
  if (id.startsWith("loi:")) {
    const dossierId = await resolveDossierIdFromCanonKey(id);

    // ✅ Si on a un slug scrutin-... : on tente d’abord group_key IN (ordinaire+solennel)
    if (dossierId && dossierId.startsWith("scrutin-")) {
      const gk = await fetchGroupKeyFromScrutinsData(dossierId);
      const variants = buildGroupKeyVariants(gk || "");

      if (variants.length > 0) {
        const merged = await fetchFromScrutinsDataByGroupKeys(variants, id);
        if (merged.length > 0) return merged;
      }

      // 🔒 fallback strict (ancien comportement) si group_key absent
      const rows = await fetchFromScrutinsData(dossierId);
      return rows.map((r) => ({ ...r, loi_id: id })) as LoiTimelineRow[];
    }

    // 3) fallback ultimate : unified
    let alt: any[] | null = null;
    let eAlt: any = null;

    // 1) tentative avec dossier_id (si colonne existe)
    {
      const r1 = await fromSafe(VIEW_SCRUTINS_LOI_ENRICHIS_UNIFIED as any)
        .select(UNIFIED_TIMELINE_SELECT_WITH_DOSSIER)
        .or(`loi_id_canon.eq.${id},loi_id_scrutin.eq.${id}`)
        .order("date_scrutin", { ascending: false })
        .limit(limit);

      if (!r1.error) {
        alt = (r1.data ?? []) as any[];
      } else if (isMissingColumnError(r1.error)) {
        // 2) fallback sans dossier_id
        const r2 = await fromSafe(VIEW_SCRUTINS_LOI_ENRICHIS_UNIFIED as any)
          .select(UNIFIED_TIMELINE_SELECT_NO_LEGISLATURE)
          .or(`loi_id_canon.eq.${id},loi_id_scrutin.eq.${id}`)
          .order("date_scrutin", { ascending: false })
          .limit(limit);

        alt = (r2.data ?? []) as any[];
        eAlt = r2.error;
      } else {
        eAlt = r1.error;
      }
    }

    console.log(
      "[fetchLoiTimeline][fallback-unified] got =",
      (alt ?? []).length,
      "| error =",
      eAlt?.message ?? null
    );

    if (!eAlt && Array.isArray(alt) && alt.length > 0) {
      return alt.map((r: any) => ({
        loi_id: id,
        numero_scrutin: String(r.numero_scrutin ?? ""),
        date_scrutin: r.date_scrutin ?? null,
        titre: r.titre ?? null,
        objet: r.objet ?? null,
        resultat: r.resultat ?? null,
        kind: r.kind ?? null,
        article_ref: r.article_ref ?? null,
        legislature: undefined,
      })) as LoiTimelineRow[];
    }
  }

  return [];
}

/**
 * ==========================
 *  SOURCES (DB-first)
 * ==========================
 * Vue: public.loi_sources_app
 * Champs: loi_id, kind, label, url, date
 */
export type LoiSourceItem = {
  kind: string;
  label: string;
  url: string;
  date?: string | null;
};

const VIEW_LOI_SOURCES_APP = "loi_sources_app";

/**
 * ✅ Récupère les sources officielles liées à une loi.
 * Fallback strict: si vue absente / erreur -> []
 */
export async function fetchLoiSources(loiId: string): Promise<LoiSourceItem[]> {
  const id = String(loiId ?? "").trim();
  if (!id) return [];

  const { data, error } = await fromSafe(VIEW_LOI_SOURCES_APP as any)
    .select("kind,label,url,date")
    .eq("loi_id", id)
    .order("kind", { ascending: true });

  if (error) {
    console.log("[fetchLoiSources] error =", error?.message ?? error);
    return [];
  }

  return (data ?? []).filter((x: any) => x?.url && x?.label) as LoiSourceItem[];
}

/**
 * ==========================
 *  TEXTE (DB-first)
 * ==========================
 * Table: public.lois_textes
 * Champs confirmés:
 * - loi_id
 * - source
 * - texte_integral_clean
 * - url_dossier
 * - url_expose_motifs
 * - url_texte_integral
 */
export type LoiTexteRow = {
  loi_id: string;
  source: string | null;
  texte_integral_clean: string | null;
  url_dossier: string | null;
  url_expose_motifs: string | null;
  url_texte_integral: string | null;
};

export async function fetchLoiTexte(loiId: string): Promise<LoiTexteRow | null> {
  const id = String(loiId ?? "").trim();
  if (!id) return null;

  const { data, error } = await fromSafe("lois_textes" as any)
    .select(
      "loi_id, source, texte_integral_clean, url_dossier, url_expose_motifs, url_texte_integral"
    )
    .eq("loi_id", id)
    .maybeSingle();

  if (error) {
    console.log("[fetchLoiTexte] error =", error?.message ?? error);
    return null; // ✅ fallback strict
  }

  return (data ?? null) as LoiTexteRow | null;
}

/**
 * ==========================
 *  TOTAUX SCRUTIN (global)
 * =========================
 */
export type ScrutinTotauxRow = {
  scrutin_id: string;
  nb_pour: number | null;
  nb_contre: number | null;
  nb_abstention: number | null;
  nb_non_votants: number | null;
  nb_total_votes: number | null;
  nb_votes_exprimes: number | null;
};

export async function fetchScrutinTotaux(scrutinId: string) {
  const sid = String(scrutinId ?? "").trim();
  if (!sid) return null;

  const { data, error } = await fromSafe(DB_VIEWS.VOTES_PAR_SCRUTIN_SYNTHESE)
    .select(
      `
      scrutin_id,
      nb_pour,
      nb_contre,
      nb_abstention,
      nb_non_votants,
      nb_total_votes,
      nb_votes_exprimes
    `
    )
    .eq("scrutin_id", sid)
    .maybeSingle();

  if (error) {
    if (isMissingColumnError(error)) return null;
    throw error;
  }

  return pick<ScrutinTotauxRow | null>(data);
}

export async function fetchScrutinTotauxForScrutins(ids: string[]) {
  const clean = (ids ?? [])
    .map((x) => String(x ?? "").trim())
    .filter(Boolean);

  if (clean.length === 0) return [];

  const nums = clean
    .map((s) => Number(String(s).replace(/\D+/g, "")))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (nums.length === 0) return [];

  const idsScrutin = nums.map((n) => `scrutin-${n}`);

  // ⚠️ IMPORTANT: garde ta source réelle si ce n'est pas "scrutins_totaux"
  const FROM = "scrutins_totaux" as any;

  // 1) numero_scrutin
  try {
    const { data, error } = await fromSafe(FROM)
      .select("*")
      .in("numero_scrutin", nums);

    if (!error && (data?.length ?? 0) > 0) return data ?? [];
  } catch {}

  // 2) numero
  try {
    const { data, error } = await fromSafe(FROM).select("*").in("numero", nums);
    if (!error && (data?.length ?? 0) > 0) return data ?? [];
  } catch {}

  // 3) scrutin_id
  try {
    const { data, error } = await fromSafe(FROM)
      .select("*")
      .in("scrutin_id", idsScrutin);

    if (!error && (data?.length ?? 0) > 0) return data ?? [];
  } catch {}

  return [];
}


/**
 * ============================================
 *  VOTES PAR GROUPE (fiable, par scrutin)
 * ============================================
 */
export type VoteGroupePositionRow = {
  numero_scrutin: string;
  legislature: number | null;
  groupe_abrev: string | null;
  groupe: string | null; // POxxxx
  groupe_nom: string | null;
  position: string | null;
  nb_voix: number | null;

  // ✅ ajout V3.7
  groupe_norm: string; // clé canon
  groupe_label: string; // UI only
};

function buildGroupeLabel(
  abrev?: string | null,
  nom?: string | null,
  gn?: string
) {
  const a = String(abrev ?? "").trim();
  const n = String(nom ?? "").trim();
  if (a && n) return `${a} · ${n}`;
  return a || n || gn || "—";
}

type VotesGroupesScrutinFullRow = {
  numero_scrutin: string;
  legislature: number | null;
  groupe_abrev: string | null;
  groupe: string | null;
  groupe_nom: string | null;
  position: string | null;
  nb_voix: number | null;
};

export async function fetchVotesGroupesByScrutin(numeroScrutin: string) {
  const ns = String(numeroScrutin ?? "").trim();
  if (!ns) return [] as VoteGroupePositionRow[];

  const VIEW_VOTES_GROUPES_SCRUTIN_FULL = "votes_groupes_scrutin_full";

  const { data, error } = await fromSafe(VIEW_VOTES_GROUPES_SCRUTIN_FULL as any)
    .select(
      "numero_scrutin, legislature, groupe_abrev, groupe, groupe_nom, position, nb_voix"
    )
    .eq("numero_scrutin", ns)
    .order("groupe_abrev", { ascending: true })
    .order("groupe_nom", { ascending: true })
    .order("position", { ascending: true });

  if (error) throw error;

  const rows = (data ?? []) as VotesGroupesScrutinFullRow[];

  return rows.map((r) => {
    const gn = String(r.groupe ?? "").trim();
    return {
      ...r,
      groupe_norm: gn || "UNKNOWN",
      groupe_label: buildGroupeLabel(r.groupe_abrev, r.groupe_nom, gn),
    };
  }) as VoteGroupePositionRow[];
}

/**
 * =========================================================
 *  ✅ RESOLVERS pour scrutins_data (numero INTEGER, group_key)
 * =========================================================
 */

export type ScrutinRow = {
  numero_scrutin: string; // ✅ on expose en string pour l’app
  date_scrutin: string | null;
  titre: string | null;
  objet: string | null;
  resultat: string | null;
  kind: string | null;
  legislature: number | null;

  // champs utiles de scrutins_data
  loi_id?: string | null; // slug "scrutin-public-..."
  group_key?: string | null; // clé canon projet/proposition...
  type_texte?: string | null;
  article_ref?: string | null;
  source_url?: string | null;
};

const SCRUTIN_SELECT = `
  numero:numero,
  date_scrutin,
  titre,
  objet,
  resultat,
  kind,
  legislature,
  loi_id,
  group_key,
  type_texte,
  article_ref,
  source_url
`;

/**
 * ✅ Résout un numéro de scrutin (string/int) -> slug scrutins_data.loi_id ("scrutin-public-...")
 * (C’est ce dont on a besoin côté Actu pour envoyer le bon params.id à la fiche loi.)
 */
export async function resolveScrutinSlugFromNumero(
  numeroScrutin: string
): Promise<string | null> {
  const raw = String(numeroScrutin ?? "").trim();
  if (!raw) return null;
  if (!/^\d+$/.test(raw)) return null;

  const n = Number(raw);

  const { data, error } = await fromSafe(VIEW_SCRUTINS_DATA as any)
    .select("numero, loi_id")
    .eq("numero", n)
    .limit(1)
    .maybeSingle();

  if (error) return null;

  const slug = String((data as any)?.loi_id ?? "").trim();
  return slug || null;
}

/**
 * ✅ Résout un id flexible en numero_scrutin (string).
 * - si id = "1234" => "1234"
 * - si id = "scrutin-public-ordinaire-..." => cherche scrutins_data.loi_id == id
 */
export async function resolveNumeroScrutin(
  idOrSlug: string
): Promise<string | null> {
  const raw = String(idOrSlug ?? "").trim();
  if (!raw) return null;

  if (/^\d+$/.test(raw)) return raw;

  const { data, error } = await fromSafe(VIEW_SCRUTINS_DATA as any)
    .select("numero, loi_id")
    .eq("loi_id", raw)
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  const n = (data as any)?.numero;
  return n != null ? String(n) : null;
}

/**
 * ✅ Résout un id flexible en group_key (clé canon)
 * - si id = "projet-de-loi-..." (déjà canon) => retourne id
 * - si id = "scrutin-public-ordinaire-..." => scrutins_data.group_key
 */
export async function resolveGroupKeyFromAnyId(
  idOrKey: string
): Promise<string | null> {
  const raw = String(idOrKey ?? "").trim();
  if (!raw) return null;

  if (
    raw.startsWith("projet-de-loi") ||
    raw.startsWith("proposition-de-loi")
  )
    return raw;

  if (raw.startsWith("scrutin-")) {
    const { data, error } = await fromSafe(VIEW_SCRUTINS_DATA as any)
      .select("group_key")
      .eq("loi_id", raw)
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    const gk = String((data as any)?.group_key ?? "").trim();
    return gk || null;
  }

  return null;
}

/**
 * ✅ Récupère un scrutin depuis scrutins_data à partir d’un id flexible.
 */
export async function fetchScrutinDetailByAnyId(
  idOrSlug: string
): Promise<ScrutinRow | null> {
  const raw = String(idOrSlug ?? "").trim();
  if (!raw) return null;

  // cas 1: numéro
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    const { data, error } = await fromSafe(VIEW_SCRUTINS_DATA as any)
      .select(SCRUTIN_SELECT)
      .eq("numero", n)
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    const numero = (data as any)?.numero;

    return data
      ? ({
          ...data,
          numero_scrutin: numero != null ? String(numero) : "",
        } as any)
      : null;
  }

  // cas 2: slug
  const { data, error } = await fromSafe(VIEW_SCRUTINS_DATA as any)
    .select(SCRUTIN_SELECT)
    .eq("loi_id", raw)
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  const numero = (data as any)?.numero;
  return data
    ? ({
        ...data,
        numero_scrutin: numero != null ? String(numero) : "",
      } as any)
    : null;
}

/**
 * ✅ Point d’entrée pratique si tu veux tout faire "byAnyId".
 */
export async function fetchScrutinAvecVotesByAnyId(idOrSlug: string) {
  const scrutin = await fetchScrutinDetailByAnyId(idOrSlug);
  if (!scrutin) return null;

  const numero_scrutin = String(scrutin.numero_scrutin ?? "").trim();
  if (!numero_scrutin) return null;

  const totaux = await fetchScrutinTotaux(numero_scrutin);

  return { scrutin, totaux };
}

