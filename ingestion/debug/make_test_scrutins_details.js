// ingestion/make_test_scrutins_details.js
require("dotenv").config();
const fs = require("fs");
const path = require("path");

// On va charger le module ES `scrape_scrutin_page.js` dynamiquement
async function getScraperFn() {
  // import() est relatif à ce fichier
  const mod = await import("./scrape_scrutin_page.js");

  // Ton fichier fait : export async function scrapeScrutin(...)
  const fn = mod.scrapeScrutin || mod.default;

  if (typeof fn !== "function") {
    throw new Error(
      "Impossible de trouver une fonction scrapeScrutin dans ./scrape_scrutin_page.js"
    );
  }

  return fn;
}

function parseScrutinSpec(spec) {
  // spec = "4664" ou "4660-4664"
  if (spec.includes("-")) {
    const [startStr, endStr] = spec.split("-").map((s) => s.trim());
    const start = parseInt(startStr, 10);
    const end = parseInt(endStr, 10);
    if (Number.isNaN(start) || Number.isNaN(end) || start > end) {
      throw new Error(`Intervalle de scrutins invalide : "${spec}"`);
    }
    const nums = [];
    for (let n = start; n <= end; n++) {
      nums.push(n.toString());
    }
    return nums;
  }

  const num = parseInt(spec.trim(), 10);
  if (Number.isNaN(num)) {
    throw new Error(`Numéro de scrutin invalide : "${spec}"`);
  }
  return [num.toString()];
}

function expandScrutinArgs(arg) {
  // arg = "4664" ou "4660-4664,4700,4720"
  const parts = arg.split(",").map((p) => p.trim()).filter(Boolean);
  let result = [];
  for (const part of parts) {
    result = result.concat(parseScrutinSpec(part));
  }

  // On déduplique au cas où
  return Array.from(new Set(result));
}

async function main() {
  const [, , legislatureArg, scrutinsArg] = process.argv;

  if (!legislatureArg || !scrutinsArg) {
    console.error(
      "❌ Utilisation : node ingestion/make_test_scrutins_details.js <legislature> <scrutins>\n" +
        "   Exemple : node ingestion/make_test_scrutins_details.js 17 4664\n" +
        "   Exemple : node ingestion/make_test_scrutins_details.js 17 4660-4664,4700,4720"
    );
    process.exit(1);
  }

  const legislature = parseInt(legislatureArg, 10);
  if (Number.isNaN(legislature)) {
    console.error(`❌ Legislature invalide : "${legislatureArg}"`);
    process.exit(1);
  }

  const numerosScrutins = expandScrutinArgs(scrutinsArg);

  console.log("🚀 Script make_test_scrutins_details démarré…");
  console.log(`📘 Législature : ${legislature}`);
  console.log(`🧮 Scrutins demandés : ${numerosScrutins.join(", ")}`);

  // 🔧 On récupère la fonction de scraping exportée par scrape_scrutin_page.js
  const scrapeScrutin = await getScraperFn();

  const results = [];
  for (const numero of numerosScrutins) {
    console.log(`\n🔎 Scraping du scrutin n°${numero}…`);
    try {
      const scrutin = await scrapeScrutin(legislature, numero);

      if (!scrutin) {
        console.warn(`⚠️ Aucun résultat pour le scrutin n°${numero}`);
        continue;
      }

      const numeroScrutin =
        scrutin.numero_scrutin ||
        scrutin.numeroScrutin ||
        (scrutin.header && (scrutin.header.numeroScrutin || scrutin.header.numero_scrutin)) ||
        numero.toString();

      results.push({
        legislature,
        numero_scrutin: numeroScrutin,
        ...scrutin,
      });

      console.log(`✅ Scrutin n°${numeroScrutin} récupéré.`);
    } catch (err) {
      console.error(
        `❌ Erreur pendant le scraping du scrutin ${numero} :`,
        err.message || err
      );
    }
  }

  if (results.length === 0) {
    console.error("❌ Aucun scrutin n’a pu être récupéré, rien à sauvegarder.");
    process.exit(1);
  }

  const output = {
    legislature,
    generatedAt: new Date().toISOString(),
    scrutins: results,
  };

  const outPath = path.join(process.cwd(), "scrutins_details.json");
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), "utf8");

  console.log(
    `\n📦 Fichier généré : ${outPath} (scrutins = ${results.length})`
  );
  console.log("🎉 Terminé.");
}

main().catch((err) => {
  console.error("❌ Erreur inattendue :", err);
  process.exit(1);
});
