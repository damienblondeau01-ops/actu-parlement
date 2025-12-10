// ingestion/update_scrutins_data_from_import.js
// -----------------------------------------------------
// Recopie scrutins_import -> scrutins_data
// en incluant kind + article_ref
// -----------------------------------------------------

require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

// -----------------------------------------------------
// Config Supabase
// -----------------------------------------------------
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

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// -----------------------------------------------------
// Main
// -----------------------------------------------------
async function main() {
  console.log("📥 Lecture de scrutins_import…");

  const { data, error } = await supabase
    .from("scrutins_import")
    .select(
      `
      loi_id,
      numero,
      date_scrutin,
      titre,
      objet,
      resultat,
      type_texte,
      kind,
      article_ref
    `
    );

  if (error) {
    console.error("❌ Erreur SELECT scrutins_import :", error.message);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.warn("⚠️ Aucun scrutin dans scrutins_import, arrêt.");
    return;
  }

  console.log(`📊 ${data.length} lignes trouvées dans scrutins_import.`);

  // On prépare les rows pour scrutins_data
  const rows = data.map((s) => ({
    loi_id: s.loi_id,
    numero: s.numero,
    date_scrutin: s.date_scrutin,
    titre: s.titre,
    objet: s.objet,
    resultat: s.resultat,
    type_texte: s.type_texte,
    kind: s.kind,
    article_ref: s.article_ref,
  }));

  console.log("📤 Upsert vers scrutins_data…");

  const chunkSize = 500;
  let ok = 0;
  let ko = 0;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    console.log(`   ➜ Batch ${i / chunkSize + 1} (${chunk.length} lignes)…`);

    const { error: upsertError } = await supabase
      .from("scrutins_data")
      .upsert(chunk, { onConflict: "loi_id" });

    if (upsertError) {
      ko += chunk.length;
      console.error("❌ Erreur upsert batch scrutins_data :", upsertError.message);
    } else {
      ok += chunk.length;
    }
  }

  console.log(`✅ Copie terminée : ${ok} lignes ok, ${ko} en erreur`);
}

main().catch((e) => {
  console.error("❌ Erreur inattendue dans update_scrutins_data_from_import :", e);
  process.exit(1);
});
