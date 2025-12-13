// ingestion/refresh_heavy_mvs_pg.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import pg from "pg";
import dns from "dns/promises";

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ charge ingestion/.env si présent (local)
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log("✅ .env chargé :", envPath);
} else {
  console.log("ℹ️ Pas de ingestion/.env (normal en CI).");
}

function mustGetEnv(name) {
  const v = process.env[name];
  return v && String(v).trim().length > 0 ? String(v).trim() : null;
}

function ensureSslModeRequire(conn) {
  if (/sslmode=/.test(conn)) return conn;
  return conn.includes("?") ? `${conn}&sslmode=require` : `${conn}?sslmode=require`;
}

async function main() {
  console.log("🔌 Connexion Postgres directe (no HTTP timeout)");

  let conn =
    mustGetEnv("SUPABASE_DB_URL") ||
    mustGetEnv("DATABASE_URL") ||
    mustGetEnv("SUPABASE_DATABASE_URL");

  if (!conn) {
    console.error("❌ Aucune URL Postgres trouvée. Ajoute SUPABASE_DB_URL (ou DATABASE_URL).");
    process.exitCode = 1;
    return;
  }

  conn = ensureSslModeRequire(conn);

  // ✅ Parse URL
  const u = new URL(conn);
  const host = u.hostname;
  const port = Number(u.port || 5432);
  const database = u.pathname.replace("/", "") || "postgres";
  const user = decodeURIComponent(u.username || "postgres");
  const password = decodeURIComponent(u.password || "");

  // ✅ Forcer IPv4 (évite ENETUNREACH IPv6 sur GitHub Actions)
  let ipv4 = host;
  try {
    const res = await dns.lookup(host, { family: 4 });
    ipv4 = res.address;
  } catch (e) {
    console.warn("⚠️ Impossible de résoudre en IPv4, tentative DNS normal:", e?.message ?? e);
  }

  console.log(`   DB host = ${host} → IPv4 = ${ipv4}:${port}/${database}`);
  console.log("   SSL rejectUnauthorized = false (lenient)");

  const client = new Client({
    host: ipv4,            // ✅ IPv4 direct
    port,
    database,
    user,
    password,
    ssl: { rejectUnauthorized: false }, // ✅ OK pour Supabase (cert chain)
  });

  try {
    await client.connect();

    await client.query("SET statement_timeout = 0;");
    await client.query("SET lock_timeout = 0;");

    const mvs = [
      "stats_groupes_votes_legislature_mv",
      "stats_groupes_par_loi_mv",
      "mv_stats_groupes_par_loi",
    ];

    for (const mv of mvs) {
      console.log(`\n🔄 REFRESH MATERIALIZED VIEW ${mv}`);
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
