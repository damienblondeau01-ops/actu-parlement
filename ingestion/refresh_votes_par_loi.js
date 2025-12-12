import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env") });

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;

const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function main() {
  console.log("🔄 refresh_mv_votes_par_loi()");
  const { error } = await supabase.rpc("refresh_mv_votes_par_loi");
  if (error) {
    console.error("❌ Erreur refresh_mv_votes_par_loi :", error.message);
    process.exitCode = 1;
    return;
  }
  console.log("✅ votes_par_loi_mv OK");
}

main().catch((e) => {
  console.error("❌ Erreur fatale:", e?.message ?? e);
  process.exitCode = 1;
});
