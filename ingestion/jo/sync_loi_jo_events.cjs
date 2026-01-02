/* ingestion/jo/sync_loi_jo_events.js
 *
 * Upsert d'événements JO (Légifrance) dans public.loi_jo_events
 * PK: (loi_id, event_type)
 *
 * Usage:
 *   node ingestion/jo/sync_loi_jo_events.js
 *
 * Env requis:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE   (fortement recommandé pour écrire)
 *
 * Optionnel:
 *   JO_EVENTS_FILE          (chemin JSON)
 *   JO_BATCH_SIZE           (défaut: 200)
 */

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  console.error("❌ Missing env SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL).");
  process.exit(1);
}
if (!SUPABASE_KEY) {
  console.error("❌ Missing env SUPABASE_SERVICE_ROLE (recommended for writes).");
  process.exit(1);
}

const FILE =
  process.env.JO_EVENTS_FILE ||
  path.join(process.cwd(), "ingestion", "jo", "loi_jo_events.json");

const BATCH_SIZE = Math.max(
  1,
  Number.parseInt(process.env.JO_BATCH_SIZE || "200", 10) || 200
);

const VALID_TYPES = new Set(["promulgation", "publication_jo", "entree_vigueur"]);

function normStr(x) {
  return String(x ?? "").trim();
}

function isISODate(s) {
  // YYYY-MM-DD strict + date valide
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return false;
  // vérifie que JS n’a pas “corrigé” la date
  const [y, m, dd] = s.split("-").map((n) => parseInt(n, 10));
  return d.getUTCFullYear() === y && d.getUTCMonth() + 1 === m && d.getUTCDate() === dd;
}

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`❌ JSON file not found: ${filePath}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(filePath, "utf8");
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error("❌ Invalid JSON:", e.message);
    process.exit(1);
  }
  if (!Array.isArray(data)) {
    console.error("❌ JSON must be an array of events.");
    process.exit(1);
  }
  return data;
}

function validateAndNormalize(rows) {
  const ok = [];
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || {};
    const loi_id = normStr(r.loi_id);
    const event_type = normStr(r.event_type);
    const event_date = normStr(r.event_date);
    const source_label = normStr(r.source_label) || "Journal officiel (Légifrance)";
    const source_url = normStr(r.source_url) || null;
    const source_id = normStr(r.source_id) || null;

    const rowErrors = [];
    if (!loi_id) rowErrors.push("loi_id missing");
    if (!VALID_TYPES.has(event_type)) rowErrors.push(`event_type invalid (${event_type})`);
    if (!event_date || !isISODate(event_date)) rowErrors.push(`event_date invalid (${event_date})`);

    if (rowErrors.length) {
      errors.push({ index: i, row: r, errors: rowErrors });
      continue;
    }

    ok.push({
      loi_id,
      event_type,
      event_date, // supabase date column accepte 'YYYY-MM-DD'
      source_label,
      source_url,
      source_id,
    });
  }

  return { ok, errors };
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  console.log("🔎 Loading:", FILE);
  const input = loadJson(FILE);
  const { ok, errors } = validateAndNormalize(input);

  if (errors.length) {
    console.log(`⚠️ ${errors.length} invalid rows (skipped). Showing first 10:`);
    console.log(errors.slice(0, 10));
  }

  if (ok.length === 0) {
    console.log("✅ Nothing to upsert (0 valid rows).");
    return;
  }

  console.log(`✅ Valid rows: ${ok.length} (batch size ${BATCH_SIZE})`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
  });

  let totalUpserted = 0;
  const batches = chunk(ok, BATCH_SIZE);

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    console.log(`➡️ Upserting batch ${b + 1}/${batches.length} (${batch.length} rows)`);

    const { error } = await supabase
      .from("loi_jo_events")
      .upsert(batch, { onConflict: "loi_id,event_type" });

    if (error) {
      console.error("❌ Upsert error:", error);
      process.exit(1);
    }

    totalUpserted += batch.length;
  }

  console.log(`🎉 Done. Upserted rows: ${totalUpserted}`);
}

main().catch((e) => {
  console.error("❌ Fatal:", e);
  process.exit(1);
});
