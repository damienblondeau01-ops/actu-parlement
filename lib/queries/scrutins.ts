// lib/queries/scrutins.ts
import { supabase } from "../supabaseClient";

/**
 * Scrutin enrichi pour la fiche détail
 *
 * ⚠️ IMPORTANT (alignement DB) :
 * - Dans scrutins_data, la colonne s'appelle **numero** (pas numero_scrutin)
 * - Dans les vues votes_*, on utilise souvent **numero_scrutin**
 */
export type ScrutinEnrichi = {
  numero_scrutin: string; // ✅ id utilisable côté app (id route) quand possible (ex: "4240")
  date_scrutin: string | null;
  titre_scrutin: string | null;
  objet: string | null;
  resultat: string | null;

  // Stats de vote (optionnelles)
  nb_pour: number | null;
  nb_contre: number | null;
  nb_abstention: number | null;
  nb_votants: number | null;
  nb_exprimes: number | null;
  maj_absolue: number | null;

  // Enrichissements loi
  article_ref: string | null;
  kind: string | null;
  loi_id: string | null;
};

export type VoteDeputeScrutin = {
  numero_scrutin: string;
  legislature: string | null;
  id_depute: string | null;

  nom_depute: string | null;
  prenom: string | null;
  nom: string | null;

  groupe_actuel: string | null;
  groupe_abrev_actuel: string | null;
  photo_url: string | null;

  position:
    | "Pour"
    | "Contre"
    | "Abstention"
    | "Non votant"
    | "pour"
    | "contre"
    | "abstention"
    | "nv"
    | string
    | null;
  vote: string | null;

  groupe_id_opendata: string | null;
  groupe_abrev_opendata: string | null;
};

/**
 * Normalise un "numero" vers un identifiant votes :
 * - "VTANR5L17V4587" -> "4587"
 * - "4587" -> "4587"
 * - "scrutin-public-..." -> ""  (un slug n'est pas un numéro)
 */
function normalizeNumeroScrutin(numero: string | number): string {
  const raw = String(numero ?? "").trim();
  if (!raw) return "";

  // slug = pas un numéro
  if (raw.toLowerCase().startsWith("scrutin-")) return "";

  // garde le dernier paquet de chiffres
  const match = raw.match(/(\d+)/g);
  if (match && match.length > 0) return match[match.length - 1];

  return "";
}

function isDigits(s: string) {
  return /^\d+$/.test(s);
}

type ScrutinKey =
  | { kind: "numero"; numero: string } // string car supabase .eq sur text/numeric tolère string
  | { kind: "loi_id"; loi_id: string };

function normalizeScrutinKey(input: string | number): ScrutinKey | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;

  const lower = raw.toLowerCase();
  if (lower.startsWith("scrutin-")) return { kind: "loi_id", loi_id: raw };

  const normalized = normalizeNumeroScrutin(raw);
  const probe = normalized || raw;

  if (!probe) return null;
  if (isDigits(probe)) return { kind: "numero", numero: probe };

  // ex: VTANR... => normalizeNumeroScrutin aurait déjà extrait les digits,
  // donc ici on retombe rarement. On garde quand même une tentative "numero".
  return { kind: "numero", numero: probe };
}

type ScrutinsDataRow = {
  numero: string | number | null;
  date_scrutin: string | null;
  titre: string | null;
  objet: string | null;
  resultat: string | null;
  article_ref: string | null;
  kind: string | null;
  loi_id: string | null;
  id_an?: string | null;
};

const SCRUTINS_DATA_SELECT = `
  numero,
  date_scrutin,
  titre,
  objet,
  resultat,
  article_ref,
  kind,
  loi_id,
  id_an
`;

/**
 * Récupération robuste d’une ligne scrutins_data :
 * - si input est "scrutin-..." : on cherche sur scrutins_data.loi_id (eq puis ilike)
 * - sinon : on cherche sur scrutins_data.numero (eq) puis fallback ilike
 *
 * ✅ Retourne aussi un "numeroResolved" (numéro utilisé pour votes_deputes_detail)
 * ✅ Logs plus clairs : plus de "(none)" anxiogène
 */
async function fetchScrutinRowFromScrutinsData(
  input: string | number
): Promise<{
  row: ScrutinsDataRow | null;
  numeroResolved: string; // "525" etc (vide si introuvable)
  error: any | null;
  key: ScrutinKey | null;
}> {
  const key = normalizeScrutinKey(input);
  if (!key) return { row: null, numeroResolved: "", error: null, key: null };

  // (A) Cas slug => lookup loi_id
  if (key.kind === "loi_id") {
    // 1) eq strict
    {
      const { data, error } = await supabase
        .from("scrutins_data")
        .select(SCRUTINS_DATA_SELECT)
        .eq("loi_id", key.loi_id)
        .limit(1);

      if (error) return { row: null, numeroResolved: "", error, key };
      if (data && data.length > 0) {
        const row = data[0] as any as ScrutinsDataRow;
        const numeroResolved = normalizeNumeroScrutin(String(row.numero ?? "")) || "";
        return { row, numeroResolved, error: null, key };
      }
    }

    // 2) fallback ilike prefix (au cas où)
    {
      const { data, error } = await supabase
        .from("scrutins_data")
        .select(SCRUTINS_DATA_SELECT)
        .ilike("loi_id", `${key.loi_id}%`)
        .limit(1);

      if (error) return { row: null, numeroResolved: "", error, key };
      if (data && data.length > 0) {
        const row = data[0] as any as ScrutinsDataRow;
        const numeroResolved = normalizeNumeroScrutin(String(row.numero ?? "")) || "";
        return { row, numeroResolved, error: null, key };
      }
    }

    return { row: null, numeroResolved: "", error: null, key };
  }

  // (B) Cas numero
  const probe = key.numero;
  if (!probe) return { row: null, numeroResolved: "", error: null, key };

  // 1) eq strict
  {
    const { data, error } = await supabase
      .from("scrutins_data")
      .select(SCRUTINS_DATA_SELECT)
      .eq("numero", probe)
      .limit(1);

    if (error) return { row: null, numeroResolved: "", error, key };
    if (data && data.length > 0) {
      const row = data[0] as any as ScrutinsDataRow;
      const numeroResolved = normalizeNumeroScrutin(String(row.numero ?? "")) || probe;
      return { row, numeroResolved, error: null, key };
    }
  }

  // 2) fallback ilike prefix
  {
    const { data, error } = await supabase
      .from("scrutins_data")
      .select(SCRUTINS_DATA_SELECT)
      .ilike("numero", `${probe}%`)
      .limit(1);

    if (error) return { row: null, numeroResolved: "", error, key };
    if (data && data.length > 0) {
      const row = data[0] as any as ScrutinsDataRow;
      const numeroResolved = normalizeNumeroScrutin(String(row.numero ?? "")) || probe;
      return { row, numeroResolved, error: null, key };
    }
  }

  return { row: null, numeroResolved: "", error: null, key };
}

/**
 * Récupère un scrutin (scrutins_data) + votes (votes_deputes_detail).
 */
export async function fetchScrutinAvecVotes(
  input: string | number
): Promise<{
  scrutin: ScrutinEnrichi | null;
  votes: VoteDeputeScrutin[];
  error: string | null;
}> {
  try {
    const raw = String(input ?? "").trim();
    const inputNormalizedNumero = normalizeNumeroScrutin(input);
    const inputKey = normalizeScrutinKey(input);

    console.log("[fetchScrutinAvecVotes] input =", raw);
    console.log(
      "[fetchScrutinAvecVotes] inputKey =",
      inputKey ? `${inputKey.kind}:${inputKey.kind === "numero" ? inputKey.numero : inputKey.loi_id}` : "(empty)"
    );
    if (inputNormalizedNumero) {
      console.log("[fetchScrutinAvecVotes] inputNormalizedNumero =", inputNormalizedNumero);
    }

    /* 1️⃣ Scrutin de base depuis scrutins_data */
    const { row: sd, numeroResolved, error: sdError, key } =
      await fetchScrutinRowFromScrutinsData(input);

    if (sdError) {
      console.warn("[fetchScrutinAvecVotes] err scrutins_data", sdError);
      return { scrutin: null, votes: [], error: "SCRUTIN_QUERY_ERROR" };
    }

    if (!sd) {
      console.warn("[fetchScrutinAvecVotes] aucun scrutin trouvé dans scrutins_data pour", raw);
      return { scrutin: null, votes: [], error: "SCRUTIN_NOT_FOUND" };
    }

    // ✅ numeroVotes = numéro utilisé par votes_deputes_detail.numero_scrutin
    // Priorité : numeroResolved (venant de scrutins_data.numero) > inputNormalizedNumero
    const numeroVotes = numeroResolved || inputNormalizedNumero;

    console.log("[fetchScrutinAvecVotes] resolvedFrom =", key?.kind ?? "unknown");
    console.log("[fetchScrutinAvecVotes] scrutins_data.loi_id =", sd.loi_id);
    console.log("[fetchScrutinAvecVotes] scrutins_data.numero =", sd.numero);
    console.log("[fetchScrutinAvecVotes] numeroVotes (votes_deputes_detail) =", numeroVotes || "(empty)");

    // ⚠️ Ici tu n’alimentes pas les scores (ils viennent d’ailleurs)
    const nb_pour: number | null = null;
    const nb_contre: number | null = null;
    const nb_abstention: number | null = null;
    const nb_total_votes: number | null = null;
    const nb_exprimes: number | null = null;
    const maj_absolue: number | null = null;

    const nbVotesTotal = nb_total_votes ?? nb_exprimes ?? null;

    const scrutin: ScrutinEnrichi = {
      // ✅ pour l’app on préfère un identifiant lisible (numéro) si dispo
      numero_scrutin: String(numeroVotes || sd.numero || raw || ""),

      date_scrutin: (sd as any).date_scrutin ?? null,
      titre_scrutin: (sd as any).titre ?? null,
      objet: (sd as any).objet ?? null,
      resultat: (sd as any).resultat ?? null,

      article_ref: (sd as any).article_ref ?? null,
      kind: (sd as any).kind ?? null,
      loi_id: (sd as any).loi_id ?? null,

      nb_pour,
      nb_contre,
      nb_abstention,
      nb_votants: nbVotesTotal,
      nb_exprimes: nb_exprimes ?? nbVotesTotal,
      maj_absolue:
        maj_absolue ??
        (nbVotesTotal != null ? Math.floor(nbVotesTotal / 2) + 1 : null),
    };

    /* 2️⃣ Votes individuels depuis votes_deputes_detail */
    if (!numeroVotes) {
      console.warn("[fetchScrutinAvecVotes] numeroVotes vide -> skip votes (fiche scrutin OK)");
      return { scrutin, votes: [], error: null };
    }

    const legislaturesToTry = ["17", "16"] as const;
    let votes: VoteDeputeScrutin[] = [];
    let lastVotesError: any = null;

    for (const leg of legislaturesToTry) {
      console.log("🔎 Recherche votes scrutin", numeroVotes, "en législature", leg);

      const { data: votesRows, error: votesError } = await supabase
        .from("votes_deputes_detail")
        .select(
          `
          numero_scrutin,
          legislature,
          id_depute,
          nom_depute,
          prenom,
          nom,
          groupe_actuel,
          groupe_abrev_actuel,
          photo_url,
          position,
          vote,
          groupe_id_opendata,
          groupe_abrev_opendata
        `
        )
        .eq("numero_scrutin", numeroVotes)
        .eq("legislature", leg)
        .order("nom_depute", { ascending: true });

      if (votesError) {
        lastVotesError = votesError;
        console.warn(`[fetchScrutinAvecVotes] err votes (leg ${leg})`, votesError);
        continue;
      }

      if (votesRows && votesRows.length > 0) {
        votes = votesRows as VoteDeputeScrutin[];
        console.log(
          `[fetchScrutinAvecVotes] nb votes trouvés pour ${numeroVotes} (leg ${leg}) =`,
          votes.length
        );
        break;
      }
    }

    if (votes.length === 0) {
      console.log("[fetchScrutinAvecVotes] aucun vote en 17/16, fallback sans filtre législature");

      const { data: votesRows, error: votesError } = await supabase
        .from("votes_deputes_detail")
        .select(
          `
          numero_scrutin,
          legislature,
          id_depute,
          nom_depute,
          prenom,
          nom,
          groupe_actuel,
          groupe_abrev_actuel,
          photo_url,
          position,
          vote,
          groupe_id_opendata,
          groupe_abrev_opendata
        `
        )
        .eq("numero_scrutin", numeroVotes)
        .order("nom_depute", { ascending: true });

      if (votesError) {
        lastVotesError = votesError;
        console.warn("[fetchScrutinAvecVotes] err votes (fallback sans législature)", votesError);
      } else if (votesRows && votesRows.length > 0) {
        votes = votesRows as VoteDeputeScrutin[];
        console.log(
          `[fetchScrutinAvecVotes] nb votes trouvés pour ${numeroVotes} (sans filtre) =`,
          votes.length
        );
      }
    }

    if (votes.length === 0 && lastVotesError) {
      console.warn("[fetchScrutinAvecVotes] aucun vote trouvé, dernière erreur =", lastVotesError);
    }

    return { scrutin, votes, error: null };
  } catch (e: any) {
    console.warn("[fetchScrutinAvecVotes] exception globale", e);
    return { scrutin: null, votes: [], error: "UNKNOWN_ERROR" };
  }
}
