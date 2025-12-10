import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Variables Supabase manquantes.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

console.log("🚀 Script propagation des source_url par loi_id démarré...");

// Même logique que dans le premier script
function isFakeUrl(url) {
  if (!url) return true;
  const lower = url.toLowerCase();
  return (
    lower.includes("fake") ||
    lower.includes("temporaire") ||
    lower.includes("placeholder") ||
    lower.includes("example") ||
    lower.trim().length < 10
  );
}

async function main() {
  console.log("📥 Lecture de textes_lois (id, loi_id, source_url)…");

  const { data: rows, error } = await supabase
    .from("textes_lois")
    .select("id, loi_id, source_url")
    .order("id");

  if (error) {
    console.error("❌ Erreur SQL :", error);
    process.exit(1);
  }

  console.log(`📚 ${rows.length} lignes récupérées.`);

  // 1) Construire une map loi_id -> source_url valide
  const mapUrlByLoiId = new Map();

  for (const row of rows) {
    const { loi_id, source_url } = row;
    if (!loi_id) continue;
    if (!isFakeUrl(source_url)) {
      if (!mapUrlByLoiId.has(loi_id)) {
        mapUrlByLoiId.set(loi_id, source_url);
      }
    }
  }

  console.log(`🔗 ${mapUrlByLoiId.size} loi_id avec une URL de référence trouvée.`);

  let updatedCount = 0;

  // 2) Propager sur les lignes vides / fausses
  for (const row of rows) {
    const { id, loi_id, source_url } = row;

    if (!loi_id) continue;
    if (!isFakeUrl(source_url)) continue; // déjà une URL correcte

    const refUrl = mapUrlByLoiId.get(loi_id);
    if (!refUrl) continue; // aucune URL de référence trouvée pour ce loi_id

    console.log(
      `➡️ ID=${id} (loi_id=${loi_id}) → propagation de l'URL : ${refUrl}`
    );

    const { error: upErr } = await supabase
      .from("textes_lois")
      .update({ source_url: refUrl })
      .eq("id", id);

    if (upErr) {
      console.error("   ❌ Erreur UPDATE :", upErr);
    } else {
      console.log("   ✔️ Mis à jour !");
      updatedCount++;
    }
  }

  console.log(`\n🏁 Propagation terminée. ${updatedCount} ligne(s) mise(s) à jour.`);
}

main();
