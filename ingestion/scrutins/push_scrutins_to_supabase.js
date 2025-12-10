// ingestion/push_scrutins_to_supabase.js
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

// 🔐 Config Supabase
const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.SUPABASE_PROJECT_URL ||
  process.env.EXPO_PUBLIC_SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "❌ Variables d’environnement Supabase manquantes.\n" +
      "   Attendu : SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (ou équivalentes)."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// 🔎 Lecture du fichier scrutins_details.json
function loadScrutinsDetails() {
  const filePath = path.join(process.cwd(), "scrutins_details.json");
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Fichier scrutins_details.json introuvable à la racine du projet (${filePath}).`
    );
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const data = JSON.parse(raw);

  // Format normal : { legislature, generatedAt, scrutins: [...] }
  if (Array.isArray(data.scrutins)) {
    return {
      legislature: data.legislature || null,
      scrutins: data.scrutins,
    };
  }

  // Compat : tableau direct
  if (Array.isArray(data)) {
    return {
      legislature: null,
      scrutins: data,
    };
  }

  // Très vieux format : un seul scrutin
  return {
    legislature: data.legislature || null,
    scrutins: [data],
  };
}

// 🆔 Extraction du numéro de scrutin
function extractNumeroScrutin(scrutin) {
  return (
    scrutin.numero_scrutin ||
    scrutin.numeroScrutin ||
    (scrutin.header &&
      (scrutin.header.numeroScrutin || scrutin.header.numero_scrutin)) ||
    scrutin.numero ||
    scrutin.id ||
    null
  );
}

// 📊 Récupération du tableau de votes
function extractVotesArray(scrutin) {
  // Ton scraper actuel : votesParDepute
  if (Array.isArray(scrutin.votesParDepute)) return scrutin.votesParDepute;

  // Compat éventuelle
  if (Array.isArray(scrutin.votes)) return scrutin.votes;
  if (Array.isArray(scrutin.votes_deputes)) return scrutin.votes_deputes;
  if (Array.isArray(scrutin.votesDeputes)) return scrutin.votesDeputes;

  return [];
}

// 🧱 Construction d’une ligne pour votes_deputes_scrutin
function buildVoteRow(base) {
  const { legislature, numero_scrutin, vote } = base;

  const nom_depute =
    vote.nom_depute ||
    vote.nomDepute ||
    vote.nomComplet ||
    vote.nom_complet ||
    vote.nom ||
    null;

  const groupe =
    vote.groupe ||
    vote.groupeAbrev ||
    vote.groupe_abrev ||
    null;

  const position =
    vote.position ||
    vote.vote ||
    vote.sens ||
    null;

  // ⚠️ On ne met pas id_an_depute tant qu’on n’est pas sûr de la colonne côté DB
  return {
    numero_scrutin,
    legislature,
    nom_depute,
    groupe,
    position,
  };
}

// 🔄 Upsert d’un scrutin + ses votes
async function upsertScrutin(scrutin, defaultLegislature) {
  const numero_scrutin = extractNumeroScrutin(scrutin);
  if (!numero_scrutin) {
    console.warn("⚠️ Scrutin sans numero_scrutin, ignoré :", scrutin);
    return { skipped: true };
  }

  const legislature =
    scrutin.legislature ||
    (scrutin.header && scrutin.header.legislature) ||
    defaultLegislature ||
    null;

  console.log(`\n📥 Upsert scrutins_enrichis n°${numero_scrutin}…`);

  // 1️⃣ On supprime d’abord les anciennes lignes (si le script a déjà tourné)
  const { error: deleteScrutinError } = await supabase
    .from("scrutins_enrichis")
    .delete()
    .eq("numero_scrutin", numero_scrutin);

  if (deleteScrutinError) {
    console.error(
      `❌ Erreur suppression ancien scrutin (${numero_scrutin}) :`,
      deleteScrutinError.message || deleteScrutinError
    );
    throw deleteScrutinError;
  }

  // 2️⃣ On insère une nouvelle ligne propre
  const { error: insertScrutinError } = await supabase
    .from("scrutins_enrichis")
    .insert({
      numero_scrutin,
      legislature,
    });

  if (insertScrutinError) {
    console.error(
      `❌ Erreur insertion scrutins_enrichis (${numero_scrutin}) :`,
      insertScrutinError.message || insertScrutinError
    );
    throw insertScrutinError;
  }

  console.log(`✅ Scrutin n°${numero_scrutin} enregistré dans scrutins_enrichis.`);

  // 🔁 Gestion des votes
  const votes = extractVotesArray(scrutin);
  console.log(
    `🗳️  Votes trouvés pour le scrutin ${numero_scrutin} : ${votes.length}`
  );

  // On supprime les anciens votes pour ce scrutin
  const { error: deleteVotesError } = await supabase
    .from("votes_deputes_scrutin")
    .delete()
    .eq("numero_scrutin", numero_scrutin);

  if (deleteVotesError) {
    console.error(
      `❌ Erreur suppression anciens votes (${numero_scrutin}) :`,
      deleteVotesError.message || deleteVotesError
    );
    throw deleteVotesError;
  }

  if (votes.length === 0) {
    console.log("ℹ️ Aucun vote à insérer pour ce scrutin.");
    return { insertedVotes: 0 };
  }

  const rows = votes.map((vote) =>
    buildVoteRow({ legislature, numero_scrutin, vote })
  );

  const { error: insertVotesError } = await supabase
    .from("votes_deputes_scrutin")
    .insert(rows);

  if (insertVotesError) {
    console.error(
      `❌ Erreur insertion votes_deputes_scrutin (${numero_scrutin}) :`,
      insertVotesError.message || insertVotesError
    );
    throw insertVotesError;
  }

  console.log(
    `✅ ${rows.length} votes insérés pour le scrutin n°${numero_scrutin}.`
  );

  return { insertedVotes: rows.length };
}

// 🚀 Main
async function main() {
  console.log("🚀 Script push_scrutins_to_supabase démarré…");

  const { legislature, scrutins } = loadScrutinsDetails();

  console.log(
    `📘 Législature par défaut : ${
      legislature !== null ? legislature : "(non spécifiée dans le fichier)"
    }`
  );
  console.log(`🧮 Nombre de scrutins à traiter : ${scrutins.length}`);

  let okCount = 0;
  let voteCountTotal = 0;
  let skipped = 0;

  for (const scrutin of scrutins) {
    try {
      const res = await upsertScrutin(scrutin, legislature);
      if (res && res.skipped) {
        skipped++;
      } else {
        okCount++;
        voteCountTotal += res?.insertedVotes || 0;
      }
    } catch (err) {
      console.error("❌ Erreur pendant le traitement d’un scrutin :", err);
    }
  }

  console.log("\n🎯 Bilan :");
  console.log(`   ✅ Scrutins enregistrés : ${okCount}`);
  console.log(`   🗳️ Votes insérés       : ${voteCountTotal}`);
  console.log(`   ⚠️ Scrutins ignorés     : ${skipped}`);
  console.log("🎉 Terminé.");
}

main().catch((err) => {
  console.error("❌ Erreur inattendue :", err);
  process.exit(1);
});
