// ingest_deputes.js - VERSION CSV LOCAL (députés actifs)

const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });
const { createClient } = require("@supabase/supabase-js");
const { parse } = require("csv-parse/sync");

// --- Vérification ENV ---
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.error("SUPABASE_URL ou SUPABASE_SERVICE_ROLE manquant dans .env");
  process.exit(1);
}

console.log("URL =", SUPABASE_URL);
console.log("KEY (début) =", SUPABASE_SERVICE_ROLE.slice(0, 10));

// Client admin Supabase
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});

// --- Chemin vers le CSV local ---
const CSV_PATH = path.resolve(__dirname, "deputes-active.csv");

// --- Lecture + parsing du CSV ---
function loadDeputesFromCSV() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error("CSV introuvable :", CSV_PATH);
    process.exit(1);
  }

  console.log("Lecture du CSV :", CSV_PATH);
  const csvContent = fs.readFileSync(CSV_PATH, "utf8");

  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    delimiter: ",",
    trim: true,
  });

  console.log(records.length + " lignes CSV parsées.");
  return records;
}

// --- Helper: découper en paquets ---
function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// --- Mapping CSV -> schéma `deputes_officiels` ---
function mapRecordToDepute(row) {
  const id_an = row.id ? row.id.trim() : null; // ex : "PA795318"
  const legislature = row.legislature ? Number(row.legislature) : null;

  // Circonscription lisible
  let circonscription = null;
  if (row.departementNom && row.circo) {
    const numero = row.circo.toString().trim();
    circonscription = row.departementNom + " (" + numero + "ème circ.)";
  } else if (row.departementNom) {
    circonscription = row.departementNom;
  }

  const prenom = row.prenom || null;
  const nom = row.nom || null;

  // Construction de l'URL de la photo officielle AN
  let photoUrl = null;
  if (id_an && legislature) {
    // retire "PA" et garde le code numérique
    const numericId = id_an.replace(/^PA/, "");
    photoUrl =
      "https://www2.assemblee-nationale.fr/static/tribun/" +
      legislature +
      "/photos/" +
      numericId +
      ".jpg";
  }

  return {
    // Clé logique pour upsert
    id_an: id_an,

    // Identité
    prenom: prenom,
    nom: nom,
    nomcomplet:
      prenom && nom ? prenom + " " + nom : nom || prenom || null,

    // Infos parlementaires
    legislature: legislature,
    groupe: row.groupe || null,
    groupeAbrev: row.groupeAbrev || null,
    circonscription: circonscription,
    departementNom: row.departementNom || null,

    // Infos diverses
    job: row.job || null,
    mail: row.mail || null,
    twitter: row.twitter || null,
    facebook: row.facebook || null,
    website: row.website || null,

 // Scores Datan (si présents dans le CSV)
    scoreParticipation: row.scoreParticipation
      ? Number(row.scoreParticipation)
      : null,
    scoreLoyaute: row.scoreLoyaute ? Number(row.scoreLoyaute) : null,
    scoreMajorite: row.scoreMajorite ? Number(row.scoreMajorite) : null,
    // attention à la faute de frappe dans le CSV :
    scoreParticipationSpecialite:
      row.scoreParticipationSpecialite ??
      row.scoreParticipationSpectialite ??
      null,

    // Contenu additionnel à remplir plus tard
    emoji: null,
    resume: null,
    bio: null,

    // Photo officielle Assemblée Nationale
    photoUrl: photoUrl,
  };
}

// --- Ingestion principale ---
async function run() {
  try {
    const records = loadDeputesFromCSV();

    const deputes = records
      .map(function (row, index) {
        const mapped = mapRecordToDepute(row);

        if (!mapped.id_an) {
          console.warn(
            "Ligne " +
              (index + 1) +
              ' ignorée : pas de "id_an" (id dans le CSV).'
          );
          return null;
        }

        return mapped;
      })
      .filter(function (x) {
        return x !== null;
      });

    console.log(
      deputes.length +
        " députés à ingérer vers Supabase (deputes_officiels)…"
    );

    const BATCH_SIZE = 200;
    const chunks = chunkArray(deputes, BATCH_SIZE);
    let totalUpserted = 0;

    for (let i = 0; i < chunks.length; i++) {
      const batch = chunks[i];
      console.log(
        "Batch " + (i + 1) + "/" + chunks.length + " – " + batch.length + " lignes"
      );

      const { error } = await supabaseAdmin
        .from("deputes_officiels")
        .upsert(batch, {
          onConflict: "id_an",
        });

      if (error) {
        console.error("Erreur Supabase sur ce batch :", error);
      } else {
        totalUpserted += batch.length;
      }
    }

    console.log(
      "Ingestion terminée : " +
        totalUpserted +
        " députés insérés / mis à jour."
    );
    console.log("Script terminé proprement.");
  } catch (err) {
    console.error("Erreur générale :", err);
  }
}

// Lancer le script
run();
