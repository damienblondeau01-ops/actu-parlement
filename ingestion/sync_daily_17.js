// ingestion/sync_daily_17.js
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Robuste peu importe d'où on lance le script
const ingestionDir = __dirname;

// ✅ charge ingestion/.env si présent (local). En CI il n'existe pas -> pas grave.
const envPath = path.join(ingestionDir, ".env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log("✅ .env chargé :", envPath);
} else {
  console.log("ℹ️ Pas de ingestion/.env (normal en CI/GitHub Actions).");
}

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;

const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌ ENV manquante : SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exitCode = 1;
  throw new Error("ENV manquante");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Exécute une commande Node et remonte une erreur lisible
function run(cmd, { cwd = ingestionDir } = {}) {
  console.log("\n▶", cmd);
  try {
    execSync(cmd, {
      stdio: "inherit",
      cwd, // ✅ garantit les chemins relatifs
      env: process.env, // ✅ env courante (local ou CI)
    });
  } catch (e) {
    console.error("❌ Commande échouée :", cmd);
    console.error(e?.message ?? e);
    throw e;
  }
}

async function rpcOrThrow(fnName) {
  console.log(`\n🔄 ${fnName}()`);
  const { error } = await supabase.rpc(fnName);
  if (error) throw new Error(`${fnName} → ${error.message}`);
  console.log(`✅ ${fnName} → OK`);
}

async function main() {
  const startedAt = Date.now();
  console.log("🕒 SYNC DAILY — 17e législature");
  console.log("   SUPABASE_URL =", SUPABASE_URL);
  console.log("   cwd =", process.cwd());

  // 1) Téléchargement ZIP + import votes (L17)
  run("node votes/fetch_votes_from_opendata.js 17");

  // 2) Import scrutins depuis le ZIP local
  run("node scrutins/fetch_scrutins_from_local_zip.cjs");

  // 3) MV légère via RPC (utile pour l’accueil)
  await rpcOrThrow("refresh_mv_scrutins_recents");

  // 4) MV lourdes via Postgres direct (local ok, CI souvent bloqué réseau)
  const skipPg =
    process.env.SKIP_PG_REFRESH === "1" ||
    process.env.CI === "true" ||
    process.env.GITHUB_ACTIONS === "true";

  if (skipPg) {
    console.log("ℹ️ CI: refresh_heavy_mvs_pg.js ignoré (SKIP_PG_REFRESH/CI).");
  } else {
    run("node refresh_heavy_mvs_pg.js");
  }

  const seconds = Math.round((Date.now() - startedAt) / 1000);
  console.log(`\n✅ Sync daily 17 terminé (${seconds}s)`);
}

main().catch((e) => {
  console.error("❌ Erreur fatale:", e?.message ?? e);
  process.exitCode = 1;
});
  