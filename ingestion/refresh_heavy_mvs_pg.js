// ingestion/refresh_heavy_mvs_pg.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import pg from "pg";

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ charge ingestion/.env si présent (local). En CI, pas obligatoire.
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log("✅ .env chargé :", envPath);
} else {
  console.log("ℹ️ Pas de ingestion/.env (normal en CI).");
}

function getEnv(name) {
  const v = process.env[name];
  return v && String(v).trim().length > 0 ? String(v).trim() : null;
}

function redactConn(conn) {
  // masque le password pour éviter de le logguer par accident
  // ex: postgresql://user:pass@host/db -> postgresql://user:***@host/db
  return conn.replace(/\/\/([^:/?#]+):([^@]+)@/g, "//$1:***@");
}

async function main() {
  console.log("🔌 Connexion Postgres directe (no HTTP timeout)");

  const conn =
    getEnv("SUPABASE_DB_URL") ||
    getEnv("DATABASE_URL") ||
    getEnv("SUPABASE_DATABASE_URL");

  if (!conn) {
    console.error(
      "❌ Aucune URL Postgres trouvée. Ajoute SUPABASE_DB_URL (ou DATABASE_URL) dans ingestion/.env"
    );
    process.exitCode = 1;
    return;
  }

  // ✅ TLS “propre” : on gère SSL uniquement sur CETTE connexion
  // Par défaut on met rejectUnauthorized=false (Souvent nécessaire sur Supabase depuis Node/Windows)
  // Tu peux forcer le mode strict avec: PG_SSL_REJECT_UNAUTHORIZED=1
  const strictSsl = getEnv("PG_SSL_REJECT_UNAUTHORIZED") === "1";

  const client = new Client({
    connectionString: conn,
    ssl: strictSsl ? { rejectUnauthorized: true } : { rejectUnauthorized: false },
    application_name: "actu-parlement-refresh-mvs",
  });

  // Matviews lourdes
  const mvs = [
    "stats_groupes_votes_legislature_mv",
    "stats_groupes_par_loi_mv",
    "mv_stats_groupes_par_loi",
    // si tu veux plus tard :
    // "votes_par_loi_mv",
    // "deputes_top_activite",
  ];

  try {
    console.log("   DB =", redactConn(conn));
    console.log(
      `   SSL rejectUnauthorized = ${strictSsl ? "true (strict)" : "false (lenient)"}`
    );

    await client.connect();

    // côté Postgres : supprime les timeouts pour cette session
    await client.query("SET statement_timeout = 0;");
    await client.query("SET lock_timeout = 0;");

    for (const mv of mvs) {
      console.log(`\n🔄 REFRESH MATERIALIZED VIEW ${mv}`);
      // Comme la liste est hardcodée, pas besoin d’échappement dynamique ici.
      await client.query(`REFRESH MATERIALIZED VIEW ${mv};`);
      console.log(`✅ ${mv} → OK`);
    }

    console.log("\n✅ refresh_heavy_mvs_pg terminé");
  } catch (e) {
    console.error("❌ Erreur refresh_heavy_mvs_pg:", e?.message ?? e);
    process.exitCode = 1;
  } finally {
    try {
      await client.end();
    } catch {}
  }
}

main();
