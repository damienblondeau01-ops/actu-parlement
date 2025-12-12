// ingestion/sync_daily_17.js
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ charge ingestion/.env
dotenv.config({ path: path.join(__dirname, ".env") });

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;

const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "❌ SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant dans ingestion/.env"
  );
  process.exitCode = 1;
  throw new Error("ENV manquante");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Exécute une commande Node et remonte une erreur lisible
function run(cmd) {
  console.log("\n▶", cmd);
  try {
    execSync(cmd, {
      stdio: "inherit",
      env: {
        ...process.env,
        DOTENV_CONFIG_PATH: path.join(__dirname, ".env"),
      },
    });
  } catch (e) {
    console.error("❌ Commande échouée :", cmd);
    console.error(e?.message ?? e);
    throw e;
  }
}

async function main() {
  const startedAt = Date.now();
  console.log("🕒 SYNC DAILY — 17e législature");
  console.log("   SUPABASE_URL =", SUPABASE_URL);

  // 1) Téléchargement ZIP + import votes (L17)
  run("node ingestion/votes/fetch_votes_from_opendata.js 17");

  // 2) Import scrutins depuis le ZIP local (ingestion/data/Scrutins.json.zip)
  run("node ingestion/scrutins/fetch_scrutins_from_local_zip.js");

  // 3) Refresh MV (découpé pour éviter timeout API)
  console.log("\n🔄 refresh_mv_scrutins_recents()");
  let r = await supabase.rpc("refresh_mv_scrutins_recents");
  if (r.error) {
    console.error("❌ Erreur refresh_mv_scrutins_recents :", r.error.message);
    process.exitCode = 1;
    return;
  }

  console.log("\n🔄 refresh_mv_stats_groupes()");
  r = await supabase.rpc("refresh_mv_stats_groupes");
  if (r.error) {
    console.error("❌ Erreur refresh_mv_stats_groupes :", r.error.message);
    process.exitCode = 1;
    return;
  }

  console.log("\n✅ Refresh daily OK (sans votes_par_loi_mv)");
}

// ✅ Sortie propre (évite UV_HANDLE_CLOSING)
main()
  .catch((e) => {
    console.error("❌ Erreur fatale:", e?.message ?? e);
    process.exitCode = 1;
  })
  .finally(() => {
    setTimeout(() => {}, 0);
  });
