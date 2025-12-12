// ingestion/refresh_mvs.js
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;

const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌ SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const mvs = [
  "scrutins_recents",
  "votes_par_loi_mv",
  "stats_groupes_votes_legislature_mv",
  "stats_groupes_par_loi_mv",
  "mv_stats_groupes_par_loi",
  "deputes_top_activite",
];

async function main() {
  console.log("🔄 Refresh materialized views…");
  for (const mv of mvs) {
    console.log("  →", mv);
    const { error } = await supabase.rpc("exec_sql", {
      sql: `refresh materialized view ${mv};`,
    });

    // Si tu n'as pas exec_sql RPC, on fera autrement (voir note ci-dessous)
    if (error) {
      console.error("❌ Erreur refresh", mv, ":", error.message);
      process.exit(1);
    }
  }
  console.log("✅ Refresh terminé");
}

main().catch((e) => {
  console.error("❌ Erreur fatale:", e);
  process.exit(1);
});
