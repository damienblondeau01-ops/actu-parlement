// jobs/run_dossiers_pipeline.js
// 1) download_latest_dossiers_zip.js (skip si inchangé)
// 2) ingestion/lois/fetch_dossiers_legislatifs.js (ton import Supabase)

const path = require("path");
const { spawnSync } = require("child_process");

function run(nodeScriptPath) {
  const abs = path.join(__dirname, "..", nodeScriptPath);
  console.log("\n[RUN]", abs);

  const r = spawnSync(process.execPath, [abs], {
    stdio: "inherit",
    env: process.env,
  });

  if (r.status !== 0) {
    throw new Error(`Script failed: ${nodeScriptPath} (code ${r.status})`);
  }
}

async function main() {
  run("jobs/download_latest_dossiers_zip.js");
  run("ingestion/lois/fetch_dossiers_legislatifs.js");
  console.log("\n✅ Dossiers pipeline terminé.");
}

main().catch((e) => {
  console.error("❌", e?.message || e);
  process.exit(1);
});
