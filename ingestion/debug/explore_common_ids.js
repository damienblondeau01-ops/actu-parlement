// ingestion/explore_common_ids.js
// Objectif : explorer les identifiants communs entre lois.raw et scrutins_raw.raw

require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

// ---- CONFIG SUPABASE ----
const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Familles de patterns qu’on veut tester
 *
 * 1) UID de dossier législatif : DLR5L16N48202
 * 2) UID d’acte législatif : L16-AN1-48202, L16-VD214256DI…
 * 3) Codes de textes type PIONANR5L16B1418 (déjà tentés)
 * 4) Slugs (titreChemin, cheminSenat) : pacs_reversion, etc.
 */

const PATTERNS = {
  dossierUid: /DLR\d+L\d{2}N\d{3,}/g, // ex: DLR5L16N48202
  acteUid: /L\d{2}-[A-Z0-9-]{5,}/g,   // ex: L16-AN1-48202, L16-VD214256DI
  texteCode: /[A-Z]{3,10}R5L\d{2}B\d{1,5}/g, // ex: PIONANR5L16B1418

  // Slugs type pacs_reversion, exigences_import_animal_ue (doivent contenir un "_")
  // Slugs type "pacs_reversion", "exigences_import_animal_ue"
  slug: /[a-z0-9]+_[a-z0-9_]{3,}/g,
};

// Parcours récursif du JSON pour extraire les chaînes
function extractStringsFromJson(obj, maxLen = 200) {
  const results = [];

  function walk(node) {
    if (node == null) return;

    if (typeof node === "string") {
      const s = node.trim();
      if (s && s.length <= maxLen) {
        results.push(s);
      }
      return;
    }

    if (Array.isArray(node)) {
      for (const el of node) walk(el);
      return;
    }

    if (typeof node === "object") {
      for (const v of Object.values(node)) {
        walk(v);
      }
    }
  }

  walk(obj);
  return results;
}

function extractPatternSet(strings, regex) {
  const set = new Set();
  for (const s of strings) {
    const matches = s.match(regex);
    if (matches) {
      for (const m of matches) set.add(m);
    }
  }
  return set;
}

function intersectSets(a, b) {
  const res = new Set();
  for (const x of a) {
    if (b.has(x)) res.add(x);
  }
  return res;
}

async function main() {
  console.log("🚀 explore_common_ids démarré…");

  // 1) Charger un échantillon de lois.raw
  const { data: lois, error: errLois } = await supabase
    .from("lois")
    .select("id_dossier, raw")
    .limit(500);

  if (errLois) {
    console.error("❌ Erreur chargement lois :", errLois);
    process.exit(1);
  }
  console.log(`📘 Lois chargées : ${lois.length}`);

  // 2) Charger un échantillon de scrutins_raw.raw
  const { data: scrutins, error: errScrutins } = await supabase
    .from("scrutins_raw")
    .select("id_an, loi_id, raw")
    .limit(2000);

  if (errScrutins) {
    console.error("❌ Erreur chargement scrutins_raw :", errScrutins);
    process.exit(1);
  }
  console.log(`📗 scrutins_raw chargés : ${scrutins.length}`);

  // 3) Extraire toutes les strings des JSON lois et scrutins
  console.log("🔎 Extraction des chaînes dans lois.raw…");
  const allLoisStrings = [];
  for (const d of lois) {
    if (!d.raw) continue;
    const strs = extractStringsFromJson(d.raw);
    allLoisStrings.push(...strs);
  }
  console.log(`   → ${allLoisStrings.length} chaînes collectées côté lois.`);

  console.log("🔎 Extraction des chaînes dans scrutins_raw.raw…");
  const allScrutinsStrings = [];
  for (const s of scrutins) {
    if (!s.raw) continue;
    const strs = extractStringsFromJson(s.raw);
    allScrutinsStrings.push(...strs);
  }
  console.log(
    `   → ${allScrutinsStrings.length} chaînes collectées côté scrutins.`
  );

  // 4) Pour chaque pattern, extraire les valeurs dans lois et scrutins
  const loisByPattern = {};
  const scrutinsByPattern = {};
  const intersections = {};

  for (const [name, regex] of Object.entries(PATTERNS)) {
    console.log(`\n🧩 Pattern ${name} (${regex})`);

    const loisSet = extractPatternSet(allLoisStrings, regex);
    const scrutinsSet = extractPatternSet(allScrutinsStrings, regex);

    loisByPattern[name] = loisSet;
    scrutinsByPattern[name] = scrutinsSet;

    console.log(
      `   Lois : ${loisSet.size} valeurs distinctes · Scrutins : ${scrutinsSet.size} valeurs distinctes`
    );

    const inter = intersectSets(loisSet, scrutinsSet);
    intersections[name] = inter;

    console.log(
      `   ➕ Intersection : ${inter.size} valeurs communes`
    );

    const sample = Array.from(inter).slice(0, 10);
    if (sample.length) {
      console.log("   Exemples communs :");
      for (const v of sample) {
        console.log("     -", v);
      }
    } else {
      console.log("   (aucune valeur commune trouvée dans cet échantillon)");
    }
  }

  console.log("\n✅ Exploration terminée.");
}

main().catch((e) => {
  console.error("❌ Erreur inattendue :", e);
  process.exit(1);
});
