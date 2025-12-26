/**
 * jobs/run_dossiers_pipeline.js
 *
 * Pipeline minimal:
 * 1) download_latest_dossiers_zip.js  -> ingestion/data/dossiers_legislatifs.json.zip
 * 2) ingestion/lois/fetch_dossiers_legislatifs.js -> upsert table "lois"
 *
 * Options:
 * - RUN_MATCH=1   -> lance ingestion/mapping/match_lois_with_dossiers_smart.js si existe
 * - RUN_TEXTES=1  -> lance ingestion/lois/fetch_lois_textes_from_dossiers.js si existe
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function run(cmd, args, opts = {}) {
  console.log(`\n▶ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: false,
    ...opts,
  });
  if (r.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(" ")} (exit ${r.status})`);
  }
}

function exists(p) {
  return fs.existsSync(path.join(process.cwd(), p));
}

async function main() {
  // 1) Download ZIP
  run("node", ["jobs/download_latest_dossiers_zip.js"]);

  // 2) Import dossiers -> table lois
  if (!exists("ingestion/lois/fetch_dossiers_legislatifs.js")) {
    throw new Error("Missing script: ingestion/lois/fetch_dossiers_legislatifs.js");
  }
  run("node", ["ingestion/lois/fetch_dossiers_legislatifs.js"]);

  // 3) Optionnels
  const runMatch = process.env.RUN_MATCH === "1";
  const runTextes = process.env.RUN_TEXTES === "1";

  if (runMatch) {
    const matchScript = "ingestion/mapping/match_lois_with_dossiers_smart.js";
    if (exists(matchScript)) {
      run("node", [matchScript]);
    } else {
      console.warn(`⚠️ RUN_MATCH=1 mais script absent: ${matchScript}`);
    }
  }

  if (runTextes) {
    const textesScript = "ingestion/lois/fetch_lois_textes_from_dossiers.js";
    if (exists(textesScript)) {
      run("node", [textesScript]);
    } else {
      console.warn(`⚠️ RUN_TEXTES=1 mais script absent: ${textesScript}`);
    }
  }

  console.log("\n✅ dossiers:sync terminé.");
}

main().catch((e) => {
  console.error("💥 Erreur run_dossiers_pipeline:", e);
  process.exit(1);
});
