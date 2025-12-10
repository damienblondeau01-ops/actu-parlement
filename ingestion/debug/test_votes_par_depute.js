// ingestion/test_votes_par_depute.js
// Usage : node ingestion/test_votes_par_depute.js 17 4664

import { scrapeScrutin } from "./scrape_scrutin_page.js";

async function main() {
  const [leg, num] = process.argv.slice(2);

  if (!leg || !num) {
    console.error(
      "Usage : node ingestion/test_votes_par_depute.js <legislature> <numero>"
    );
    process.exit(1);
  }

  try {
    const data = await scrapeScrutin(leg, num);

    console.log("✅ header.numeroScrutin =", data.header.numeroScrutin);
    console.log("✅ synthese =", data.synthese);

    if (!data.votesParDepute || data.votesParDepute.length === 0) {
      console.log("⚠ Aucun vote par député détecté");
      return;
    }

    console.log("✅ Nombre de votes par député =", data.votesParDepute.length);
    console.log(
      "👉 5 premiers :",
      JSON.stringify(data.votesParDepute.slice(0, 5), null, 2)
    );

    // Petit résumé par position
    const resume = data.votesParDepute.reduce(
      (acc, v) => {
        acc[v.position] = (acc[v.position] || 0) + 1;
        return acc;
      },
      {}
    );

    console.log("📊 Répartition (d'après parsing noms) :", resume);
  } catch (e) {
    console.error("❌ Erreur :", e);
    process.exit(1);
  }
}

main();
