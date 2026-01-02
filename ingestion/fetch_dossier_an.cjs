// ingestion/fetch_dossier_an.cjs
// But: alimenter public.loi_procedure_steps à partir d'un dossier AN (dyn)
// Usage:
//   node ingestion/fetch_dossier_an.cjs https://www.assemblee-nationale.fr/dyn/17/dossiers/loi_speciale_2026

const process = require("node:process");
const { createClient } = require("@supabase/supabase-js");

// ======================
// Types (doc only)
// ======================
/**
 * @typedef {Object} Etape
 * @property {number} step_order
 * @property {string} step_kind
 * @property {"AN"|"SENAT"} [chambre]
 * @property {string} [lecture]
 * @property {string} label
 * @property {string} [date_start]
 * @property {string} [date_end]
 * @property {string} [source_label]
 * @property {string} [source_url]
 * @property {any} [raw]
 */

// ======================
// ENV helpers
// ======================
function pickEnv(...keys) {
  for (const k of keys) {
    const v = String(process.env[k] ?? "").trim();
    if (v) return v;
  }
  return "";
}

const SUPABASE_URL =
  pickEnv("SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE =
  pickEnv("SUPABASE_SERVICE_ROLE", "SUPABASE_SERVICE_KEY") || "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.error(
    "[fetch_dossier_an] Missing env: SUPABASE_URL / EXPO_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});

// ======================
// Helpers
// ======================
function cleanSpaces(s) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

function toISODateMaybe(x) {
  const s = cleanSpaces(x);
  if (!s) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const dd = String(m[1]).padStart(2, "0");
    const mm = String(m[2]).padStart(2, "0");
    const yyyy = m[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

function dossierIdFromUrl(url) {
  const m = String(url ?? "").match(/\/dossiers\/([^/?#]+)/i);
  return m ? m[1] : "";
}

async function fetchText(url) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": "ActuDesLoisBot/1.0",
      accept: "text/html",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

function htmlToText(html) {
  return cleanSpaces(
    String(html ?? "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
  );
}

// ======================
// PARSING (Option 2 propre)
// ======================
function parseStepsFromHtml(html, dossierUrl) {
  const text = htmlToText(html);
  const steps = [];

  const rules = [
    { kind: "DEPOT", re: /déposé.*?(\d{1,2}\/\d{1,2}\/\d{4})/i, label: "Dépôt" },
    {
      kind: "PROMULGATION",
      re: /promulgu.*?(\d{1,2}\/\d{1,2}\/\d{4})/i,
      label: "Promulgation",
    },
    {
      kind: "JO",
      re: /journal officiel.*?(\d{1,2}\/\d{1,2}\/\d{4})/i,
      label: "Publication au Journal officiel",
    },
  ];

  for (const r of rules) {
    const m = text.match(r.re);
    if (m) {
      const d = toISODateMaybe(m[1]);
      if (d) {
        steps.push({
          step_order: steps.length,
          step_kind: r.kind,
          label: r.label,
          date_start: d,
          source_label: "Dossier législatif (Assemblée nationale)",
          source_url: dossierUrl,
          raw: { match: m[0] },
        });
      }
    }
  }

  if (steps.length === 0) {
    steps.push({
      step_order: 0,
      step_kind: "DOSSIER_AN",
      label: "Dossier législatif (Assemblée nationale)",
      source_label: "Dossier législatif (Assemblée nationale)",
      source_url: dossierUrl,
      raw: { note: "fallback_minimal" },
    });
  }

  return steps;
}

// ======================
// DB UPSERT
// ======================
async function upsertProcedureSteps(dossier_id, steps) {
  const payload = steps.map((s, i) => ({
    dossier_id,
    step_index: Number.isFinite(s.step_order) ? s.step_order : i,
    step_kind: s.step_kind,
    chambre: s.chambre ?? null,
    lecture: s.lecture ?? null,
    label: cleanSpaces(s.label),
    date_start: s.date_start ?? null,
    date_end: s.date_end ?? null,
    source_label: s.source_label ?? null,
    source_url: s.source_url ?? null,
    raw: s.raw ?? null,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("loi_procedure_steps")
    .upsert(payload, { onConflict: "dossier_id,step_index" });

  if (error) throw error;
  return payload.length;
}

// ======================
// MAIN
// ======================
(async function main() {
  const dossierUrl = String(process.argv[2] ?? "").trim();
  if (!dossierUrl) {
    console.error("Usage: node fetch_dossier_an.cjs <dossier_url>");
    process.exit(1);
  }

  const dossier_id = dossierIdFromUrl(dossierUrl);
  if (!dossier_id) {
    console.error("Cannot extract dossier_id from URL");
    process.exit(1);
  }

  console.log("[fetch_dossier_an] dossier_id =", dossier_id);

  const html = await fetchText(dossierUrl);
  const steps = parseStepsFromHtml(html, dossierUrl);

  console.log("[fetch_dossier_an] steps =", steps.length);
  console.log("[fetch_dossier_an] first =", steps[0]);

  const n = await upsertProcedureSteps(dossier_id, steps);
  console.log("[fetch_dossier_an] upsert OK =", n);
})().catch((e) => {
  console.error("[fetch_dossier_an] ERROR", e);
  process.exit(1);
});
