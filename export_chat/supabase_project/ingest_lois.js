require('dotenv').config();
const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

async function run() {
  console.log("📥 Téléchargement des lois…");

  const url =
    "https://static.data.gouv.fr/resources/lois-en-cours/20240924-123456/lois.json";

  const response = await fetch(url);
  if (!response.ok) {
    console.error("❌ Erreur téléchargement JSON");
    return;
  }

  const lois = await response.json();

  console.log(`➡️ ${lois.length} lois récupérées`);

  for (const loi of lois) {
    const row = {
      id: loi.id,
      titre: loi.titre,
      resume: loi.resume,
      statutLabel: loi.statutLabel,
      statutType: loi.statutType,
      texte: loi.texte
    };

    const { error } = await supabase
      .from('lois')
      .upsert(row);

    if (error) console.error("⚠️ Erreur insertion :", error);
  }

  console.log("✅ Import des lois terminé !");
}

run();
