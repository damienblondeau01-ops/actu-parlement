// ingestion/scrape_all_scrutins.js
// Usage : node ingestion/scrape_all_scrutins.js 17

import fs from "fs";
import { scrapeScrutin } from "./scrape_scrutin_page.js";

const INPUT = "./scrutins_list.json";
const OUTPUT = "./scrutins_details.json";

async function main() {
  const legislature = process.argv[2];
  if (!legislature) {
    console.error("Usage : node ingestion/scrape_all_scrutins.js 17");
    process.exit(1);
  }

  if (!fs.existsSync(INPUT)) {
    console.error(
      `❌ Fichier ${INPUT} introuvable. Lance d'abord scrape_scrutins_list.js`
    );
    process.exit(1);
  }

  const raw = fs.readFileSync(INPUT, "utf8");
  const list = JSON.parse(raw).filter(
    (s) => String(s.legislature) === String(legislature)
  );

  console.log(`📊 ${list.length} scrutins trouvés pour la législature ${legislature}`);

  // Pour tester : on limite au début, puis tu pourras mettre Infinity
  const MAX_TO_PROCESS = list.length; // ou 100 pour test
  const out = [];

  let i = 0;
  for (const s of list.slice(0, MAX_TO_PROCESS)) {
    i++;
    const num = s.numeroScrutin;
    if (!num) {
      console.warn(`⚠ Pas de numeroScrutin pour une ligne, on saute.`);
      continue;
    }

    console.log(`\n➡ [${i}/${MAX_TO_PROCESS}] Scrutin n°${num}...`);

    try {
      const detail = await scrapeScrutin(legislature, num);
      out.push(detail);

      // petite pause pour être gentil avec le site
      await new Promise((r) => setTimeout(r, 700));
    } catch (e) {
      console.error(`❌ Erreur sur scrutin ${num} :`, e.message);
    }
  }

  fs.writeFileSync(OUTPUT, JSON.stringify(out, null, 2));
  console.log(`\n✅ Fini ! ${out.length} scrutins détaillés dans ${OUTPUT}`);
}

main();
