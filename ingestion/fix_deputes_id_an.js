// ingestion/fix_deputes_id_an.js
//
// Corrige automatiquement les id_an dans la table deputes_app
// en se basant sur un CSV (deputes-active.csv) déjà utilisé
// pour l’ingestion.
//
// Prérequis :
//  - .env à la racine du projet avec SUPABASE_URL et SUPABASE_SERVICE_ROLE
//  - ingestion/deputes-active.csv

const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });
const { createClient } = require("@supabase/supabase-js");
const { parse } = require("csv-parse/sync");

// ------------------ CONFIG ------------------

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.error("❌ SUPABASE_URL ou SUPABASE_SERVICE_ROLE manquant dans .env");
  process.exit(1);
}

// 👉 ON UTILISE BIEN deputes-active.csv DANS /ingestion
const CSV_PATH = path.resolve(__dirname, "deputes-active.csv");

// ------------------ CLIENT SUPABASE ADMIN ------------------

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});

// ------------------ HELPERS ------------------

function normalize(str) {
  return (str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // accents
    .replace(/['’\-]/g, " ") // apostrophes, tirets → espace
    .replace(/\s+/g, " ") // espaces multiples → simple
    .trim()
    .toLowerCase();
}

function loadOfficialCsv() {
  console.log("📁 Chemin CSV utilisé :", CSV_PATH);

  if (!fs.existsSync(CSV_PATH)) {
    console.error("❌ CSV introuvable :", CSV_PATH);
    process.exit(1);
  }

  console.log("📄 Lecture du CSV :", CSV_PATH);
  const content = fs.readFileSync(CSV_PATH, "utf8");

  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    delimiter: ",",
    trim: true,
  });

  console.log("✅", records.length, "lignes CSV parsées.");

  const byName = new Map();

  records.forEach((row, index) => {
    const id_an = (row.id_an || row.id || "").toString().trim();
    if (!id_an) {
      console.warn("⚠️ Ligne", index + 1, ": pas d'id_an, ignorée.");
      return;
    }

    const prenom = row.prenom || "";
    const nom = row.nom || "";
    const nomcompletCSV =
      row.nomcomplet || row.nomComplet || `${prenom} ${nom}`.trim();

    const key = normalize(nomcompletCSV);
    if (!key) return;

    if (!byName.has(key)) {
      byName.set(key, { id_an, nomcompletCSV });
    }
  });

  console.log("✅ Index noms officiels construit :", byName.size);
  return byName;
}

// ------------------ MAIN ------------------

async function run() {
  try {
    const officialByName = loadOfficialCsv();

    console.log("📥 Chargement deputes_app depuis Supabase…");
    const { data: depRows, error } = await supabaseAdmin
      .from("deputes_app")
      .select("row_id, id_an, nomcomplet");

    if (error) {
      console.error("❌ Erreur Supabase :", error);
      process.exit(1);
    }

    console.log("✅", depRows.length, "députés trouvés.");

    const updates = [];
    let alreadyOk = 0;
    let noMatch = 0;

    for (const row of depRows) {
      const current = (row.id_an || "").trim();
      const key = normalize(row.nomcomplet || "");

      const official = officialByName.get(key);
      if (!official) {
        noMatch++;
        console.warn(`⚠️ Pas de match CSV pour : ${row.nomcomplet}`);
        continue;
      }

      if (current === official.id_an) {
        alreadyOk++;
        continue;
      }

      updates.push({
        row_id: row.row_id,
        id_an: official.id_an,
      });
    }

    console.log("📊 Déjà corrects :", alreadyOk);
    console.log("⚠️ Sans correspondance CSV :", noMatch);
    console.log("✏️ À corriger :", updates.length);

    if (updates.length === 0) {
      console.log("✨ Tout est déjà cohérent !");
      process.exit(0);
    }

    const BATCH_SIZE = 100;
    let total = 0;

    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const batch = updates.slice(i, i + BATCH_SIZE);
      console.log(
        `✏️ Batch ${i / BATCH_SIZE + 1} (${batch.length} lignes)`
      );

      const { error: upErr } = await supabaseAdmin
        .from("deputes_app")
        .upsert(batch, { onConflict: "row_id" });

      if (upErr) {
        console.error("❌ Erreur batch :", upErr);
      } else {
        total += batch.length;
      }
    }

    console.log("✅ Correction terminée !");
    console.log("   →", total, "députés mis à jour.");
  } catch (err) {
    console.error("❌ Erreur générale :", err);
  }
}

run();
