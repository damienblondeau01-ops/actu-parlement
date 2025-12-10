// ingestion/ingest_deputes.js - VERSION CSV LOCAL (députés actifs + bio)

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

// --- Helper: calcul de l'âge à partir d'une date YYYY-MM-DD ---
function computeAgeFromDateString(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;

  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) {
    age--;
  }
  return age >= 0 ? age : null;
}

// --- Helper: validation du format id_an ---
// Format officiel AN : "PA" + chiffres, ex : "PA795318"
function isValidIdAn(id) {
  if (!id || typeof id !== "string") return false;
  return /^PA[0-9]+$/.test(id);
}

// IDs à exclure explicitement (mauvais format / tests / etc.)
const BLOCKED_IDS = new Set(["900001", "900002", "900003"]);

// --- Mapping CSV -> schéma `deputes_officiels` ---
function mapRecordToDepute(row) {
  const id_an = row.id ? row.id.trim() : null; // ex : "PA795318"
  const legislature = row.legislature ? Number(row.legislature) : null;

  // Circonscription lisible (utile si tu veux l'exposer plus tard)
  let circonscription = null;
  if (row.departementNom && row.circo) {
    const numero = row.circo.toString().trim();
    circonscription = row.departementNom + " (" + numero + "ème circ.)";
  } else if (row.departementNom) {
    circonscription = row.departementNom;
  }

  const prenom = row.prenom || null;
  const nom = row.nom || null;

  // ------------------ BIOGRAPHIE ------------------
  const naissance =
    row.naissance ||
    row.date_naissance ||
    row.dateNaissance ||
    null; // string, ex "1975-06-01"

  const villeNaissance =
    row.villeNaissance ||
    row.ville_naissance ||
    null;

  const profession = row.profession || row.job || null;

  const age = naissance ? computeAgeFromDateString(naissance) : null;

  // ------------------ PHOTO OFFICIELLE AN ------------------
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

  // ------------------ MAPPING FINAL ------------------
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
    departementNom: row.departementNom || null,
    departementCode: row.departementCode || null,
    circo: row.circo ? Number(row.circo) : null,
    circonscription: circonscription,

    // BIO : naissance + ville + âge + profession
    naissance: naissance || null, // Postgres sait caster "YYYY-MM-DD" en date
    villeNaissance: villeNaissance,
    age: age,
    profession: profession,

    // Infos diverses
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

    // 1) Mapping brut CSV -> objets députés
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
        " députés mappés depuis le CSV avant filtrage d'id_an…"
    );

    // 2) Filtrage des id_an invalides / bloqués
    const cleanedDeputes = [];
    const rejectedDeputes = [];

    for (const d of deputes) {
      const rawId = d.id_an;

      // Blocage explicite des 900001 / 900002 / 900003
      if (BLOCKED_IDS.has(String(rawId))) {
        rejectedDeputes.push({
          id_raw: rawId,
          nom: d.nomcomplet || `${d.prenom ?? ""} ${d.nom ?? ""}`.trim(),
          reason: "ID dans la liste des IDs bloqués",
        });
        continue;
      }

      // Blocage de tout ce qui ne correspond pas au format PAxxxxx
      if (!isValidIdAn(rawId)) {
        rejectedDeputes.push({
          id_raw: rawId,
          nom: d.nomcomplet || `${d.prenom ?? ""} ${d.nom ?? ""}`.trim(),
          reason: "Format id_an invalide (attendu : PA + chiffres)",
        });
        continue;
      }

      cleanedDeputes.push(d);
    }

    console.log(
      `✅ Députés valides après filtre : ${cleanedDeputes.length} | ❌ rejetés : ${rejectedDeputes.length}`
    );
    if (rejectedDeputes.length > 0) {
      console.log("❌ Détails des députés rejetés (id_an invalide ou bloqué) :");
      for (const r of rejectedDeputes) {
        console.log(
          `  - id_an="${r.id_raw}" | nom="${r.nom}" | raison="${r.reason}"`
        );
      }
    }

    if (cleanedDeputes.length === 0) {
      console.warn(
        "⚠️ Aucun député valide à ingérer après filtrage des id_an. Arrêt."
      );
      return;
    }

    console.log(
      cleanedDeputes.length +
        " députés à ingérer vers Supabase (deputes_officiels)…"
    );

    const BATCH_SIZE = 200;
    const chunks = chunkArray(cleanedDeputes, BATCH_SIZE);
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
