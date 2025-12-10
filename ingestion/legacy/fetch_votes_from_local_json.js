// ingestion/fetch_votes_from_local_json.js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { supabase } from "./supabase_ingest_client.js";

// Petit helper pour __dirname en ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const jsonPath = path.join(__dirname, "..", "data", "votes_deputes.json");

  console.log("🚀 Import des votes depuis votes_deputes.json");

  if (!fs.existsSync(jsonPath)) {
    console.error("❌ Fichier introuvable :", jsonPath);
    process.exit(1);
  }

  // 1️⃣ Lecture / parse du JSON
  const raw = fs.readFileSync(jsonPath, "utf8");
  let votes;
  try {
    votes = JSON.parse(raw);
  } catch (e) {
    console.error("❌ Impossible de parser le JSON :", e.message);
    process.exit(1);
  }

  if (!Array.isArray(votes) || votes.length === 0) {
    console.log("ℹ️ Aucun vote à importer (tableau vide).");
    process.exit(0);
  }

  console.log(`📊 ${votes.length} votes bruts trouvés dans le fichier`);

  let ok = 0;
  let ko = 0;

  // 2️⃣ Normalisation/validation rapide
  const cleaned = votes
    .map((v, idx) => {
      const numero = v.numero_scrutin ?? v.numero ?? null;
      const nom = v.nom_depute ?? v.nom ?? null;
      const position = v.position ?? v.vote ?? null;

      if (!numero || !nom || !position) {
        console.warn(
          `⚠️ Ligne ${idx} ignorée : champ obligatoire manquant (numero / nom / position)`
        );
        ko++;
        return null;
      }

      return {
        numero_scrutin: String(numero),
        legislature: v.legislature ? String(v.legislature) : null,
        id_depute: v.id_depute ?? null,
        nom_depute: String(nom),
        groupe: v.groupe ?? null,
        groupe_abrev: v.groupe_abrev ?? null,
        position: String(position),
      };
    })
    .filter(Boolean);

  if (cleaned.length === 0) {
    console.log("ℹ️ Tous les votes ont été filtrés, rien à insérer.");
    process.exit(0);
  }

  // 3️⃣ Insertion en batch (chunk de 1000)
  const chunkSize = 1000;
  for (let i = 0; i < cleaned.length; i += chunkSize) {
    const chunk = cleaned.slice(i, i + chunkSize);

    const { error } = await supabase
      .from("votes_deputes_scrutin")
      .upsert(chunk, {
        onConflict: "numero_scrutin, id_depute, nom_depute",
        ignoreDuplicates: false,
      });

    if (error) {
      console.error("❌ Erreur insertion chunk", i / chunkSize, ":", error.message);
      ko += chunk.length;
    } else {
      ok += chunk.length;
    }
  }

  console.log("✅ Import terminé");
  console.log("   ✔ Votes insérés / mis à jour :", ok);
  console.log("   ✖ Votes en erreur / ignorés :", ko);
}

main().catch((e) => {
  console.error("❌ Erreur fatale script import votes :", e);
  process.exit(1);
});
