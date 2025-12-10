// ingestion/compute_scrutins_stats_from_file.js
// Calcule des stats simples (pour / contre / abstention) par scrutin
// à partir de Scrutins.json.zip, puis upsert dans scrutins_stats.

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "❌ Manque EXPO_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY / EXPO_PUBLIC_SUPABASE_ANON_KEY"
  );
  process.exit(1);
}

console.log("DEBUG SUPABASE_URL =", SUPABASE_URL);
console.log("DEBUG SUPABASE_KEY présent ? ", SUPABASE_KEY ? "✅ oui" : "❌ non");

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Fichier ZIP local (le même que pour process_scrutins_from_file)
const ZIP_PATH = path.join(__dirname, "Scrutins.json.zip");

// -----------------------------------------------------
// Helper: extraction des stats depuis le JSON d’un scrutin
// -----------------------------------------------------
function extractStatsFromJson(parsed) {
  if (!parsed || !parsed.scrutin) return null;
  const s = parsed.scrutin;

  const uid = s.uid || s.idScrutin || s.code || null;
  if (!uid) return null;

  let pour = 0;
  let contre = 0;
  let abstention = 0;
  let autres = 0;
  let total = 0;

  const synth = s.syntheseVote;
  if (synth) {
    const dec =
      synth.decompteVoix ||
      synth.decompteVotes ||
      synth.decompte ||
      null;

    if (dec) {
      const toInt = (x) =>
        x !== undefined && x !== null && x !== "" ? Number(x) : 0;

      pour = toInt(dec.pour ?? dec.voixPour);
      contre = toInt(dec.contre ?? dec.voixContre);
      abstention = toInt(dec.abstention ?? dec.voixAbstention);

      const exprimes = toInt(dec.exprimes ?? dec.voixExprimes);
      total = exprimes || pour + contre + abstention;
      autres = total - (pour + contre + abstention);
      if (autres < 0) autres = 0;
    }
  }

  if (!total) {
    total = pour + contre + abstention + autres;
  }

  // Si on n’a vraiment aucune info, on renvoie quand même une ligne à 0
  return {
    loi_id: uid,
    stats_pour: pour,
    stats_contre: contre,
    stats_abstention: abstention,
    stats_autres: autres,
    total_votes: total,
  };
}

// -----------------------------------------------------
// MAIN
// -----------------------------------------------------
async function main() {
  try {
    console.log("📂 Lecture du fichier ZIP local :", ZIP_PATH);

    if (!fs.existsSync(ZIP_PATH)) {
      console.error("❌ Fichier ZIP introuvable :", ZIP_PATH);
      process.exit(1);
    }

    const stat = fs.statSync(ZIP_PATH);
    console.log("💾 Taille du ZIP (octets) :", stat.size);

    const zip = new AdmZip(ZIP_PATH);
    const entries = zip.getEntries();
    console.log("📦 Nombre d’entrées dans le ZIP :", entries.length);

    const jsonEntries = entries.filter(
      (e) => !e.isDirectory && e.entryName.toLowerCase().endsWith(".json")
    );
    console.log("📄 Nombre de fichiers JSON :", jsonEntries.length);

    if (jsonEntries.length === 0) {
      console.error("⚠️ Aucun fichier JSON trouvé dans le ZIP, arrêt.");
      return;
    }

    const rows = [];
    let withStats = 0;
    let withoutStats = 0;

    for (const entry of jsonEntries) {
      try {
        const text = entry.getData().toString("utf8");
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch (e) {
          console.warn("⚠️ JSON.parse échoué pour", entry.entryName);
          continue;
        }

        const row = extractStatsFromJson(parsed);
        if (!row) {
          withoutStats++;
          continue;
        }

        rows.push(row);
        if (row.total_votes > 0) {
          withStats++;
        } else {
          withoutStats++;
        }

        if (withStats <= 3) {
          console.log("🔍 Exemple stats pour", entry.entryName, ":", row);
        }
      } catch (e) {
        console.error("⚠️ Exception sur l’entrée", entry.entryName, ":", e.message);
      }
    }

    console.log("📊 Lignes de stats préparées :", rows.length);
    console.log("   ➕ Avec votes > 0 :", withStats);
    console.log("   ➖ Sans stats (total_votes = 0) :", withoutStats);

    if (rows.length === 0) {
      console.warn("⚠️ 0 lignes à importer, arrêt.");
      return;
    }

    console.log("📤 Upsert dans scrutins_stats…");
    const chunkSize = 500;
    let ok = 0;
    let ko = 0;

    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      console.log(`   ➜ Batch ${i / chunkSize + 1} (${chunk.length} lignes)…`);

      const { error } = await supabase
        .from("scrutins_stats")
        .upsert(chunk, { onConflict: "loi_id" });

      if (error) {
        ko += chunk.length;
        console.error("❌ Erreur upsert batch :", error.message);
      } else {
        ok += chunk.length;
      }
    }

    console.log(`✅ Import terminé : ${ok} lignes ok, ${ko} en erreur`);
  } catch (e) {
    console.error("❌ Erreur inattendue dans main() :", e);
  }
}

main();
