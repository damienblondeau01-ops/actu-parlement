// ingestion/ingest_all.js

console.log("🚀 Lancement de l'ingestion complète…");

// 1) Députés
try {
  require("./ingest_deputes.js");
} catch (e) {
  console.error("❌ Erreur lors de l'ingestion des députés :", e);
}

// 2) Lois (dossiers législatifs) à partir du ZIP local
try {
  console.log("📥 Ingestion des lois (dossiers législatifs) depuis le ZIP local…");
  require("./fetch_dossiers_legislatifs.js");
  console.log("✅ Ingestion des lois lancée. Vérifie les logs ci-dessus pour le détail.");
} catch (e) {
  console.error("❌ Erreur lors de l'ingestion des lois :", e);
}

console.log("✅ Script ingest_all terminé.");
