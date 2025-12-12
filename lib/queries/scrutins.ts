// lib/queries/scrutins.ts
import { supabase } from "../supabaseClient";

/**
 * Scrutin enrichi pour la fiche détail
 */
export type ScrutinEnrichi = {
  numero_scrutin: string;
  date_scrutin: string | null;
  titre_scrutin: string | null;
  objet: string | null;
  resultat: string | null;

  // Stats de vote (optionnelles, peuvent être remplies ailleurs)
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

/**
 * Ligne de la vue votes_deputes_detail
 */
export type VoteDeputeScrutin = {
  numero_scrutin: string;
  legislature: string | null;
  id_depute: string | null;

  // Identité du député
  nom_depute: string | null;
  prenom: string | null;
  nom: string | null;

  // Groupe / photo officiels
  groupe_actuel: string | null;
  groupe_abrev_actuel: string | null;
  photo_url: string | null;

  // Infos de vote
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

  // Métadonnées OpenData brutes
  groupe_id_opendata: string | null;
  groupe_abrev_opendata: string | null;
};

/**
 * Normalise le paramètre "numero" :
 * - si on reçoit "VTANR5L17V4587" → on extrait "4587"
 * - sinon on renvoie simplement numero.toString()
 */
function normalizeNumeroScrutin(numero: string | number): string {
  const raw = String(numero);
  const match = raw.match(/(\d+)/g);
  if (match && match.length > 0) {
    // On prend le dernier bloc de chiffres (souvent le numéro de scrutin)
    return match[match.length - 1];
  }
  return raw;
}

/**
 * Récupère un scrutin (scrutins_data) + les votes (votes_deputes_detail).
 *
 * ✅ On normalise toujours le numéro de scrutin (VTANR… → 4587)
 * ✅ On ESSAIE d'abord les votes en 17, puis 16, puis sans filtre.
 * ✅ La synthèse (votes_par_scrutin_synthese) est gérée dans l'écran,
 *    pour éviter les doublons et les conflits de noms de colonnes.
 */
export async function fetchScrutinAvecVotes(
  numero: string | number
): Promise<{
  scrutin: ScrutinEnrichi | null;
  votes: VoteDeputeScrutin[];
  error: string | null;
}> {
  try {
    const numeroStr = normalizeNumeroScrutin(numero);
    console.log("[fetchScrutinAvecVotes] numero (normalisé) =", numeroStr);

    /* 1️⃣ Scrutin de base depuis scrutins_data */
    const { data: sd, error: sdError } = await supabase
      .from("scrutins_data")
      .select(
        `
        numero_scrutin:numero,
        date_scrutin,
        titre_scrutin:titre,
        objet,
        resultat,
        article_ref,
        kind,
        loi_id
      `
      )
      .eq("numero", numeroStr)
      .maybeSingle();

    if (sdError) {
      console.warn("[fetchScrutinAvecVotes] err scrutins_data", sdError);
      return { scrutin: null, votes: [], error: "SCRUTIN_QUERY_ERROR" };
    }

    if (!sd) {
      console.warn(
        "[fetchScrutinAvecVotes] aucun scrutin trouvé dans scrutins_data pour",
        numeroStr
      );
      return { scrutin: null, votes: [], error: "SCRUTIN_NOT_FOUND" };
    }

    // ⚠️ On ne va plus chercher les stats agrégées ici.
    // Elles sont chargées dans l'écran via votes_par_scrutin_synthese.
    const nb_pour: number | null = null;
    const nb_contre: number | null = null;
    const nb_abstention: number | null = null;
    const nb_total_votes: number | null = null;
    const nb_exprimes: number | null = null;
    const maj_absolue: number | null = null;

    const nbVotesTotal = nb_total_votes ?? nb_exprimes ?? null;

    const scrutin: ScrutinEnrichi = {
      ...sd,
      nb_pour,
      nb_contre,
      nb_abstention,
      nb_votants: nbVotesTotal,
      nb_exprimes: nb_exprimes ?? nbVotesTotal,
      maj_absolue:
        maj_absolue ??
        (nbVotesTotal != null ? Math.floor(nbVotesTotal / 2) + 1 : null),
    };

    /* 2️⃣ Votes individuels depuis la vue votes_deputes_detail */
    const legislaturesToTry = ["17", "16"];
    let votes: VoteDeputeScrutin[] = [];
    let lastVotesError: any = null;

    // 2.a → on essaie d'abord 17 puis 16
    for (const leg of legislaturesToTry) {
      console.log("🔎 Recherche scrutin", numeroStr, "en législature", leg);

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
        .eq("numero_scrutin", numeroStr)
        .eq("legislature", leg)
        .order("nom_depute", { ascending: true });

      if (votesError) {
        lastVotesError = votesError;
        console.warn(
          `[fetchScrutinAvecVotes] err votes (leg ${leg})`,
          votesError
        );
        continue;
      }

      if (votesRows && votesRows.length > 0) {
        votes = votesRows as VoteDeputeScrutin[];
        console.log(
          `[fetchScrutinAvecVotes] nb votes trouvés pour le scrutin ${numeroStr} en législature ${leg} =`,
          votes.length
        );
        break;
      }
    }

    // 2.b → Si toujours rien, on tente SANS filtre de législature
    if (votes.length === 0) {
      console.log(
        `[fetchScrutinAvecVotes] aucun vote trouvé en 17/16, tentative sans filtre de législature`
      );
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
        .eq("numero_scrutin", numeroStr)
        .order("nom_depute", { ascending: true });

      if (votesError) {
        lastVotesError = votesError;
        console.warn(
          "[fetchScrutinAvecVotes] err votes (fallback sans législature)",
          votesError
        );
      } else if (votesRows && votesRows.length > 0) {
        votes = votesRows as VoteDeputeScrutin[];
        console.log(
          `[fetchScrutinAvecVotes] nb votes trouvés pour le scrutin ${numeroStr} (sans filtre législature) =`,
          votes.length
        );
      }
    }

    if (votes.length === 0 && lastVotesError) {
      console.warn(
        "[fetchScrutinAvecVotes] aucun vote trouvé, dernière erreur =",
        lastVotesError
      );
    }

    return {
      scrutin,
      // même si pas de votes, on renvoie la fiche scrutin
      votes,
      error: null,
    };
  } catch (e: any) {
    console.warn("[fetchScrutinAvecVotes] exception globale", e);
    return {
      scrutin: null,
      votes: [],
      error: "UNKNOWN_ERROR",
    };
  }
}
