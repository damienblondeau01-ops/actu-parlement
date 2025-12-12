// ingestion/scrutins/update_scrutins_data_from_import.js

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

// Charger .env depuis ingestion/
require("dotenv").config({
  path: path.join(__dirname, "..", ".env"),
});

// 🔐 Config Supabase
const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.SUPABASE_PROJECT_URL ||
  process.env.EXPO_PUBLIC_SUPABASE_URL;

const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "❌ SUPABASE_URL ou SERVICE_ROLE_KEY manquant dans ingestion/.env (update_scrutins_data_from_import)"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

async function main() {
  console.log("📖 Lecture de scrutins_import…");

  // On ne prend que les colonnes nécessaires à scrutins_data
  const { data, error } = await supabase
    .from("scrutins_import")
    .select(
      `
      id_an,
      loi_id,
      numero,
      date_scrutin,
      titre,
      objet,
      resultat,
      type_texte,
      kind,
      article_ref,
      group_key
    `
    )
    .order("numero", { ascending: true });

  if (error) {
    console.error("❌ Erreur lecture scrutins_import :", error);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log("ℹ️ Aucun scrutin dans scrutins_import.");
    return;
  }

  console.log(`📊 ${data.length} lignes trouvées dans scrutins_import.`);

  // Mapping vers scrutins_data
  const mapped = data
    .filter((row) => row.id_an) // sécurité : on ne garde que ceux qui ont un id_an
    .map((row) => ({
      // ⚠️ id_an = clé logique UNIQUE (cf. contrainte scrutins_data_id_an_key)
      id_an: row.id_an,
      loi_id: row.loi_id || null,
      numero: row.numero || null,
      date_scrutin: row.date_scrutin || null,
      titre: row.titre || null,
      objet: row.objet || null,
      resultat: row.resultat || null,
      type_texte: row.type_texte || null,
      kind: row.kind || null,
      article_ref: row.article_ref || null,
      group_key: row.group_key || null,
      // id_dossier est rempli plus tard via lois_mapping / match_lois_with_dossiers_smart
      // id reste un UUID généré côté DB (default)
    }));

  console.log(
    `🧮 Lignes mappées pour scrutins_data (avec id_an non nul) : ${mapped.length}`
  );

  const chunks = chunkArray(mapped, 500);
  let ok = 0;
  let ko = 0;

  console.log("🔄 Upsert vers scrutins_data (ON CONFLICT id_an)…");

  for (let i = 0; i < chunks.length; i++) {
    const batch = chunks[i];
    console.log(`   📦 Batch ${i + 1} (${batch.length} lignes)…`);

    const { error: upsertError } = await supabase
      .from("scrutins_data")
      .upsert(batch, {
        onConflict: "id_an", // 🔑 correspond à UNIQUE (id_an)
      });

    if (upsertError) {
      console.error("   ❌ Erreur upsert batch scrutins_data :", upsertError);
      ko += batch.length;
    } else {
      ok += batch.length;
    }
  }

  console.log("✅ Copie terminée :", ok, "lignes ok,", ko, "en erreur");
}

main().catch((err) => {
  console.error("❌ Erreur inattendue dans update_scrutins_data_from_import :", err);
  process.exit(1);
});
