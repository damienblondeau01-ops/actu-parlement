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
  return code === "42703" || msg.includes("does not exist") || msg.includes("undefined column");
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

export async function fetchLoiDetail(loiId: string) {
  const id = String(loiId ?? "").trim();
  if (!id) return null;

  const r1 = await fromSafe(DB_VIEWS.LOIS_APP).select(LOI_SELECT_WITH_RESUME).eq("loi_id", id).maybeSingle();
  if (!r1.error) return pick<LoiDetailRow | null>(r1.data);

  if (!isMissingColumnError(r1.error)) throw r1.error;

  const { data, error } = await fromSafe(DB_VIEWS.LOIS_APP).select(LOI_SELECT_NO_RESUME).eq("loi_id", id).maybeSingle();
  if (error) throw error;
  return pick<LoiDetailRow | null>(data);
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
};

const TIMELINE_SELECT = `
  loi_id,
  numero_scrutin,
  date_scrutin,
  titre,
  objet,
  resultat,
  kind,
  article_ref,
  legislature
`;

export async function fetchLoiTimeline(loiId: string, limit = 10) {
  const id = String(loiId ?? "").trim();
  if (!id) return [];

  const { data, error } = await fromSafe(DB_VIEWS.SCRUTINS_PAR_LOI_APP)
    .select(TIMELINE_SELECT)
    .eq("loi_id", id)
    .order("date_scrutin", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as LoiTimelineRow[];
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

function buildGroupeLabel(abrev?: string | null, nom?: string | null, gn?: string) {
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
    .select("numero_scrutin, legislature, groupe_abrev, groupe, groupe_nom, position, nb_voix")
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

// ta view listée existe : public.scrutins_data
const VIEW_SCRUTINS_DATA = "scrutins_data";

export type ScrutinRow = {
  numero_scrutin: string; // ✅ on expose en string pour l’app
  date_scrutin: string | null;
  titre: string | null;
  objet: string | null;
  resultat: string | null;
  kind: string | null;
  legislature: number | null;

  // champs utiles de scrutins_data
  loi_id?: string | null;     // slug "scrutin-public-..."
  group_key?: string | null;  // clé canon projet/proposition...
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
 * ✅ Résout un id flexible en numero_scrutin (string).
 * - si id = "1234" => "1234"
 * - si id = "scrutin-public-ordinaire-..." => cherche scrutins_data.loi_id == id
 */
export async function resolveNumeroScrutin(idOrSlug: string): Promise<string | null> {
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
export async function resolveGroupKeyFromAnyId(idOrKey: string): Promise<string | null> {
  const raw = String(idOrKey ?? "").trim();
  if (!raw) return null;

  // si on reçoit déjà une clé canon (projet/proposition...), on la laisse passer
  if (raw.startsWith("projet-de-loi") || raw.startsWith("proposition-de-loi")) return raw;

  // si c’est un scrutin slug
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

  // sinon: inconnu
  return null;
}

/**
 * ✅ Récupère un scrutin depuis scrutins_data à partir d’un id flexible.
 */
export async function fetchScrutinDetailByAnyId(idOrSlug: string): Promise<ScrutinRow | null> {
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
