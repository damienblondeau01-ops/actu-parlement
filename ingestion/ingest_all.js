// ingestion/ingest_all.js

require("dotenv").config({ path: __dirname + "/.env" });

function safeRequire(label, candidates) {
  console.log(`   🧩 Tentative ${label} via ${candidates.join(" ou ")} `);
  let lastError = null;

  for (const mod of candidates) {
    try {
      require(mod);
      console.log(`   ✅ ${label} exécuté via ${mod}`);
      return;
    } catch (e) {
      lastError = e;
    }
  }

  const err = new Error(
    `${label} : aucun des modules suivants n'a été trouvé : ${candidates.join(", ")}`
  );
  err.cause = lastError;
  throw err;
}

console.log("🚀 Lancement de l'ingestion complète…");

// 1️⃣ Députés
try {
  console.log("👥 1/4 — Ingestion des députés (deputes_officiels)...");
  safeRequire("Ingestion des députés", ["./deputes/ingest_deputes.js"]);
  console.log("✅ 1/4 — Députés : ingestion terminée.");
} catch (e) {
  console.error("❌ Erreur lors de l'ingestion des députés :", e);
}

// 2️⃣ Lois / dossiers législatifs
try {
  console.log("📚 2/4 — Ingestion des lois (dossiers législatifs) depuis le ZIP local...");
  safeRequire("Ingestion des lois", ["./lois/fetch_dossiers_legislatifs.js"]);
  console.log("✅ 2/4 — Lois : ingestion lancée.");
} catch (e) {
  console.error("❌ Erreur lors de l'ingestion des lois :", e);
}

// 3️⃣ Scrutins 17ᵉ (ZIP → scrutins_import → scrutins_data → scrutins_enrichis)
try {
  console.log(
    "🗳️ 3/4 — Ingestion complète des scrutins (import ZIP + update scrutins_data + push Supabase)..."
  );

  // 3.1 Téléchargement du ZIP Scrutins.json.zip (législature 17)
  safeRequire("Téléchargement ZIP scrutins", ["./scrutins/download_scrutins_zip.js"]);

  // 3.2 Mise à jour scrutins_data depuis scrutins_import
  safeRequire("Mise à jour scrutins_data depuis scrutins_import", [
    "./scrutins/update_scrutins_data_from_import.js",
  ]);

  // 3.3 Upsert scrutins_enrichis à partir de scrutins_data
  safeRequire("Push scrutins vers Supabase", ["./scrutins/push_scrutins_to_supabase.js"]);

  console.log("✅ 3/4 — Scrutins : ingestion terminée.");
} catch (e) {
  console.error("❌ Erreur lors de l'ingestion des scrutins :", e);
}

// 4️⃣ Votes nominatifs (16ᵉ / 17ᵉ)
try {
  console.log(
    "🧾 4/4 — Ingestion des votes nominatifs (votes_deputes_scrutin) depuis l'OpenData AN..."
  );

  // Par défaut on ingère la 16ᵉ ; pour la 17ᵉ, tu peux lancer le script à part.
  // node ingestion/votes/fetch_votes_from_opendata.js 16
  require("./votes/fetch_votes_from_opendata.js");

  console.log("✅ 4/4 — Votes : ingestion terminée.");
} catch (e) {
  console.error("❌ Erreur lors de l'ingestion des votes :", e);
}

console.log("🎉 Script ingest_all terminé.");
