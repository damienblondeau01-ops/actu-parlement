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

  // Stats de vote (remplies à partir de votes_par_scrutin_synthese)
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
  id: number;
  numero_scrutin: string;
  id_depute: string | null;
  nom_depute: string;
  groupe: string | null;
  groupe_abrev: string | null;
  position: "Pour" | "Contre" | "Abstention" | "Non votant" | string;
  legislature: string | null;
};

/**
 * Récupère un scrutin (scrutins_data) + les votes (votes_deputes_scrutin)
 * + les stats agrégées (votes_par_scrutin_synthese).
 *
 * ✅ Pas de paramètre legislature côté appel.
 * ✅ On ESSAIE d'abord les votes en 17, puis 16, puis sans filtre.
 */
export async function fetchScrutinAvecVotes(
  numero: string
): Promise<{
  scrutin: ScrutinEnrichi | null;
  votes: VoteDeputeScrutin[];
  error: string | null;
}> {
  try {
    const numeroStr = String(numero);
    console.log("[fetchScrutinAvecVotes] numero =", numeroStr);

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

    /* 2️⃣ Stats agrégées depuis votes_par_scrutin_synthese */
    let nb_pour: number | null = null;
    let nb_contre: number | null = null;
    let nb_abstention: number | null = null;
    let nb_votes_total: number | null = null;

    try {
      const { data: synth, error: synthError } = await supabase
        .from("votes_par_scrutin_synthese")
        .select(
          `
          numero_scrutin,
          nb_pour,
          nb_contre,
          nb_abstention,
          nb_votes_total
        `
        )
        .eq("numero_scrutin", numeroStr)
        .maybeSingle();

      if (synthError) {
        console.warn("[fetchScrutinAvecVotes] err synthese", synthError);
      } else if (synth) {
        nb_pour = synth.nb_pour ?? null;
        nb_contre = synth.nb_contre ?? null;
        nb_abstention = synth.nb_abstention ?? null;
        nb_votes_total = synth.nb_votes_total ?? null;
      }
    } catch (e) {
      console.warn("[fetchScrutinAvecVotes] exception synthese", e);
    }

    const nbVotesTotal = nb_votes_total;

    const scrutin: ScrutinEnrichi = {
      ...sd,
      nb_pour,
      nb_contre,
      nb_abstention,
      nb_votants: nbVotesTotal,
      nb_exprimes: nbVotesTotal,
      maj_absolue:
        nbVotesTotal != null ? Math.floor(nbVotesTotal / 2) + 1 : null,
    };

    /* 3️⃣ Votes individuels depuis votes_deputes_scrutin */
    const legislaturesToTry = ["17", "16"];
    let votes: VoteDeputeScrutin[] = [];
    let lastVotesError: any = null;

    // 3.a → on essaie d'abord 17 puis 16
    for (const leg of legislaturesToTry) {
      console.log("🔎 Recherche scrutin", numeroStr, "en législature", leg);

      const { data: votesRows, error: votesError } = await supabase
        .from("votes_deputes_scrutin")
        .select(
          `
          id,
          numero_scrutin,
          id_depute,
          nom_depute,
          groupe,
          groupe_abrev,
          position,
          legislature
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

    // 3.b → Si toujours rien, on tente SANS filtre de législature
    if (votes.length === 0) {
      console.log(
        `[fetchScrutinAvecVotes] aucun vote trouvé en 17/16, tentative sans filtre de législature`
      );
      const { data: votesRows, error: votesError } = await supabase
        .from("votes_deputes_scrutin")
        .select(
          `
          id,
          numero_scrutin,
          id_depute,
          nom_depute,
          groupe,
          groupe_abrev,
          position,
          legislature
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
      votes,
      // ⚠️ On met error à null même si les votes sont vides ou en erreur,
      // pour que l'écran puisse quand même afficher les infos du scrutin.
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
