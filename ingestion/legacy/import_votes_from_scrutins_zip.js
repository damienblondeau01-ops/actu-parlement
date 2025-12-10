// ingestion/import_votes_from_scrutins_zip.js

// Charge les variables du fichier .env (DATABASE_URL)
require("dotenv").config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const fs = require("fs");
const path = require("path");
const StreamZip = require("node-stream-zip");
const { Client } = require("pg");

console.log("🚀 Script import_votes_from_scrutins_zip démarré...");

// Chemin du ZIP : Scrutins.json.zip à la racine du projet
const DEFAULT_ZIP = path.join(process.cwd(), "Scrutins.json.zip");
const SCRUTINS_ZIP_PATH = process.env.SCRUTINS_ZIP_PATH || DEFAULT_ZIP;

// Requête d'upsert dans votes_scrutins
const UPSERT_VOTE_QUERY = `
INSERT INTO votes_scrutins (
  scrutin_id,
  depute_an_id,
  depute_id,
  groupe_abrev,
  groupe_nom,
  fonction,
  vote,
  raw
)
VALUES (
  $1, $2, NULL, $3, $4, $5, $6, $7
)
ON CONFLICT (scrutin_id, depute_an_id) DO UPDATE
SET
  groupe_abrev = EXCLUDED.groupe_abrev,
  groupe_nom   = EXCLUDED.groupe_nom,
  fonction     = EXCLUDED.fonction,
  vote         = EXCLUDED.vote,
  raw          = EXCLUDED.raw;
`;

// Extraction des votes depuis un JSON de scrutin
function extractVotesFromScrutin(scrutinJson) {
  const res = [];
  if (!scrutinJson) return res;

  const s = scrutinJson.scrutin || scrutinJson;

  const scrutinId =
    s.uid ||
    s.idScrutin ||
    s.id ||
    s.numero ||
    null;

  if (!scrutinId) return res;

  const ventilation = s.ventilationVotes || s.ventilationVote || s.ventilation;
  if (!ventilation) return res;

  const organesRaw =
    ventilation.organe || ventilation.organes || ventilation.organ;

  const organes = organesRaw
    ? Array.isArray(organesRaw)
      ? organesRaw
      : [organesRaw]
    : [];

  if (organes.length === 0) return res;

  for (const organe of organes) {
    if (!organe) continue;

    const groupesContainer = organe.groupes || organe.groupe || null;
    let groupes = [];

    if (!groupesContainer) {
      continue;
    } else if (Array.isArray(groupesContainer)) {
      groupes = groupesContainer;
    } else if (Array.isArray(groupesContainer.groupe)) {
      groupes = groupesContainer.groupe;
    } else if (groupesContainer.groupe) {
      groupes = [groupesContainer.groupe];
    } else {
      groupes = [groupesContainer];
    }

    for (const groupe of groupes) {
      if (!groupe) continue;

      const groupeAbrev =
        groupe.abreviation ||
        groupe.abrev ||
        groupe.libelleAbrev ||
        null;

      const groupeNom =
        groupe.libelle ||
        groupe.nom ||
        null;

      const voteBloc = groupe.vote;
      if (!voteBloc) continue;

      const decompteNom = voteBloc.decompteNominatif;
      if (!decompteNom) continue;

      const categories = [
        ["pours", "pour"],
        ["contres", "contre"],
        ["abstentions", "abstention"],
        ["nonVotants", "non-votant"],
        ["nonVotantsVolontaires", "non-votant-volontaire"],
      ];

      for (const [fieldName, voteLabel] of categories) {
        const bloc = decompteNom[fieldName];
        if (!bloc) continue;

        let votants = bloc.votant;
        if (!votants) continue;

        if (!Array.isArray(votants)) {
          votants = [votants];
        }

        for (const entry of votants) {
          if (!entry) continue;

          const acteurRef = entry.acteurRef || entry.acteurId || null;
          const fonction = entry.fonction || null;

          if (!acteurRef) continue;

          res.push({
            scrutin_id: scrutinId,
            depute_an_id: acteurRef,
            groupe_abrev: groupeAbrev,
            groupe_nom: groupeNom,
            fonction,
            vote: voteLabel,
            raw: entry,
          });
        }
      }
    }
  }

  return res;
}

async function main() {
  try {
    // 1) Vérifier le ZIP
    if (!fs.existsSync(SCRUTINS_ZIP_PATH)) {
      console.error("❌ ZIP introuvable :", SCRUTINS_ZIP_PATH);
      console.error("Place Scrutins.json.zip à la racine du projet ou définis SCRUTINS_ZIP_PATH dans .env");
      process.exit(1);
    }

    console.log("📦 ZIP trouvé :", SCRUTINS_ZIP_PATH);

    // 2) Connexion DB
    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });

    await client.connect();
    console.log("🔌 Connecté à la base PostgreSQL");

    const zip = new StreamZip.async({ file: SCRUTINS_ZIP_PATH });

    try {
      const entries = await zip.entries();
      const files = Object.values(entries).filter(
        (e) => !e.isDirectory && e.name.toLowerCase().endsWith(".json")
      );

      console.log(`📂 ${files.length} fichiers JSON trouvés dans le ZIP.`);

      let totalVotes = 0;
      let totalScrutinsAvecVotes = 0;

      for (const entry of files) {
        const content = await zip.entryData(entry.name);
        let json;

        try {
          json = JSON.parse(content.toString("utf8"));
        } catch (e) {
          continue;
        }

        const votes = extractVotesFromScrutin(json);
        if (votes.length === 0) continue;

        totalScrutinsAvecVotes += 1;

        for (const v of votes) {
          try {
            await client.query(UPSERT_VOTE_QUERY, [
              v.scrutin_id,
              v.depute_an_id,
              v.groupe_abrev,
              v.groupe_nom,
              v.fonction,
              v.vote,
              v.raw,
            ]);
            totalVotes += 1;
          } catch (e) {
            console.error(
              `❌ Erreur upsert vote (scrutin=${v.scrutin_id}, depute_an_id=${v.depute_an_id}) :`,
              e.message
            );
          }
        }
      }

      console.log(
        `✅ Import des votes terminé : ${totalVotes} vote(s) enregistrés, ${totalScrutinsAvecVotes} scrutin(s) avec votes.`
      );
    } finally {
      await zip.close();
      console.log("📪 ZIP fermé.");
      await client.end();
      console.log("👋 Connexion PostgreSQL fermée.");
    }
  } catch (err) {
    console.error("❌ Erreur globale :", err);
    process.exit(1);
  }
}

main();
