// ingestion/sync_scrutins.js
require("dotenv").config();
const { supabaseAdmin } = require("./supabaseAdminClient");

/**
 * À ADAPTER :
 * Ici tu branches ta source réelle : API, CSV, JSON, etc.
 *
 * Le format attendu pour chaque scrutin :
 * {
 *   id: string,
 *   loi_id: string | null,
 *   titre: string | null,
 *   objet: string | null,
 *   type_texte: string | null,
 *   date_scrutin: string | null,
 *   annee: number | null,
 *   numero: number | null,
 *   resultat: string | null,
 *   stats_pour: number | null,
 *   stats_contre: number | null,
 *   stats_abstention: number | null,
 *   total_votes: number | null,
 *   votes?: [
 *     { depute_row_id: number | null, vote: string | null }
 *   ]
 * }
 */
async function fetchScrutinsFromSource() {
  // TODO: branche ici ta vraie ingestion
  // Pour l'instant, on ne renvoie rien → script no-op propre.
  console.log(
    "⚠️ fetchScrutinsFromSource() n'est pas encore implémenté. Aucune donnée importée."
  );
  return [];
}

/**
 * Upsert scrutins_app par chunks
 */
async function upsertScrutins(scrutins) {
  const chunkSize = 500;

  for (let i = 0; i < scrutins.length; i += chunkSize) {
    const chunk = scrutins.slice(i, i + chunkSize);

    const { error } = await supabaseAdmin
      .from("scrutins_app")
      .upsert(
        chunk.map((s) => ({
          id: s.id,
          loi_id: s.loi_id ?? null,
          titre: s.titre ?? null,
          objet: s.objet ?? null,
          type_texte: s.type_texte ?? null,
          date_scrutin: s.date_scrutin ?? null,
          annee: s.annee ?? null,
          numero: s.numero ?? null,
          resultat: s.resultat ?? null,
          stats_pour: s.stats_pour ?? null,
          stats_contre: s.stats_contre ?? null,
          stats_abstention: s.stats_abstention ?? null,
          total_votes: s.total_votes ?? null,
        })),
        {
          onConflict: "id",
        }
      );

    if (error) {
      console.error("❌ Erreur upsert scrutins_app :", error);
      throw error;
    }

    console.log(`✅ scrutins_app : ${chunk.length} lignes upsertées`);
  }
}

/**
 * Upsert votes_deputes à partir de la propriété .votes des scrutins
 */
async function upsertVotes(scrutins) {
  const votes = [];

  for (const s of scrutins) {
    if (!s.votes || !Array.isArray(s.votes)) continue;

    for (const v of s.votes) {
      votes.push({
        scrutin_id: s.id,
        depute_row_id:
          typeof v.depute_row_id === "number" ? v.depute_row_id : null,
        vote: v.vote ?? null,
      });
    }
  }

  if (votes.length === 0) {
    console.log("ℹ️ Aucun vote à upsert.");
    return;
  }

  const chunkSize = 1000;

  for (let i = 0; i < votes.length; i += chunkSize) {
    const chunk = votes.slice(i, i + chunkSize);

    const { error } = await supabaseAdmin
      .from("votes_deputes")
      .upsert(chunk, {
        // à adapter si ta contrainte unique est différente
        onConflict: "scrutin_id,depute_row_id",
      });

    if (error) {
      console.error("❌ Erreur upsert votes_deputes :", error);
      throw error;
    }

    console.log(`✅ votes_deputes : ${chunk.length} lignes upsertées`);
  }
}

async function main() {
  console.log("🚀 sync_scrutins démarré...");

  try {
    const scrutins = await fetchScrutinsFromSource();

    if (!scrutins || scrutins.length === 0) {
      console.log("ℹ️ Aucun scrutin à synchroniser (liste vide).");
      return;
    }

    console.log(`ℹ️ ${scrutins.length} scrutins récupérés depuis la source.`);
    await upsertScrutins(scrutins);
    await upsertVotes(scrutins);

    console.log("✅ sync_scrutins terminé avec succès.");
  } catch (e) {
    console.error("❌ sync_scrutins a échoué :", e);
    process.exitCode = 1;
  }
}

main();
