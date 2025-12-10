// ingestion/test_votes_par_groupe.js
// Usage : node ingestion/test_votes_par_groupe.js 17 4664

import { scrapeScrutin } from "./scrape_scrutin_page.js";

async function main() {
  const [leg, num] = process.argv.slice(2);
  if (!leg || !num) {
    console.error("Usage : node ingestion/test_votes_par_groupe.js <legislature> <numero>");
    process.exit(1);
  }

  const data = await scrapeScrutin(leg, num);

  console.log("✅ header.numeroScrutin =", data.header.numeroScrutin);
  console.log("✅ synthese =", data.synthese);
  console.log("✅ Nombre de groupes =", (data.votesParGroupe || []).length);

  if (data.votesParGroupe && data.votesParGroupe.length) {
    console.log(
      "👉 Premier groupe :",
      JSON.stringify(data.votesParGroupe[0], null, 2)
    );
  } else {
    console.log("⚠ votesParGroupe est vide !");
  }
}

main();
