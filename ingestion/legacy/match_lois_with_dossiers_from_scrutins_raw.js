// ingestion/match_lois_with_dossiers_from_scrutins_raw.js
// V2 : matching loi_id <-> id_dossier via codes de texte (PIONANR5L16Bxxxx, etc.)

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

// Regex très large pour capturer les codes type PIONANR5L16B1418, PJL..., etc.
const TEXTE_CODE_REGEX = /[A-Z]{3,10}R5L\d{2}B\d{1,5}/g;

// Parcours récursif d'un objet JSON pour extraire toutes les chaînes qui matchent la regex
function extractCodesFromJson(obj) {
  const codes = new Set();

  function walk(node) {
    if (node == null) return;

    if (typeof node === "string") {
      const matches = node.match(TEXTE_CODE_REGEX);
      if (matches) {
        for (const m of matches) codes.add(m);
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
  return codes;
}

async function main() {
  console.log("🚀 match_lois_with_dossiers_from_scrutins_raw V2 démarré…");

  // 1) Charger les dossiers législatifs (lois) avec le JSON complet
  const { data: lois, error: errLois } = await supabase
    .from("lois")
    .select("id_dossier, raw");

  if (errLois) {
    console.error("❌ Erreur chargement lois :", errLois);
    process.exit(1);
  }

  console.log(`📘 Dossiers législatifs chargés : ${lois.length}`);

  // Index : codeTexte -> liste d'id_dossier
  const dossiersByTexteCode = new Map();

  for (const d of lois) {
    if (!d || !d.id_dossier || !d.raw) continue;

    const codes = extractCodesFromJson(d.raw);

    for (const code of codes) {
      if (!dossiersByTexteCode.has(code)) {
        dossiersByTexteCode.set(code, new Set());
      }
      dossiersByTexteCode.get(code).add(d.id_dossier);
    }
  }

  console.log(
    `📑 Codes de texte distincts trouvés dans les lois : ${dossiersByTexteCode.size}`
  );

  // 2) Charger les scrutins avec JSON brut
  // On prend une plage large pour éviter la limite 1000 par défaut
  const { data: scrutins, error: errScrutins } = await supabase
    .from("scrutins_raw")
    .select("id_an, loi_id, raw")
    .range(0, 4999);

  if (errScrutins) {
    console.error("❌ Erreur chargement scrutins_raw :", errScrutins);
    process.exit(1);
  }

  console.log(`📗 scrutins_raw chargés : ${scrutins.length}`);

  if (!scrutins.length) {
    console.log("⚠️ Aucun scrutin dans scrutins_raw, rien à faire.");
    return;
  }

  // 3) Comptage loi_id -> id_dossier -> nb_hits (via codes communs)
  const countsByLoi = {}; // { loi_id: { id_dossier: count } }

  for (const s of scrutins) {
    const loiId = s.loi_id;
    if (!loiId || !s.raw) continue;

    const codes = extractCodesFromJson(s.raw);
    if (!codes.size) continue;

    for (const code of codes) {
      const dossiersSet = dossiersByTexteCode.get(code);
      if (!dossiersSet) continue;

      for (const id_dossier of dossiersSet) {
        if (!countsByLoi[loiId]) countsByLoi[loiId] = {};
        countsByLoi[loiId][id_dossier] =
          (countsByLoi[loiId][id_dossier] || 0) + 1;
      }
    }
  }

  // 4) Construire le mapping avec un score de confiance
  const mappings = [];

  for (const [loiId, counts] of Object.entries(countsByLoi)) {
    let bestId = null;
    let bestCount = 0;
    let totalMatches = 0;

    for (const [id_dossier, c] of Object.entries(counts)) {
      totalMatches += c;
      if (c > bestCount) {
        bestCount = c;
        bestId = id_dossier;
      }
    }

    if (!bestId || totalMatches === 0) continue;

    const confiance = bestCount / totalMatches;

    // On peut filtrer un peu : par ex. ne garder que confiance >= 0.6
    if (confiance < 0.6) continue;

    mappings.push({
      loi_id: loiId,
      id_dossier: bestId,
      confiance,
    });
  }

  console.log(
    `📊 Mapping trouvé pour ${mappings.length} lois (confiance >= 0.6 via codes de texte)`
  );

  if (mappings.length) {
    console.log("🔍 Exemples :");
    mappings.slice(0, 10).forEach((m) => {
      console.log(
        `  - loi_id=${m.loi_id} -> id_dossier=${m.id_dossier} (confiance=${m.confiance.toFixed(
          2
        )})`
      );
    });
  } else {
    console.log("⚠️ Aucun mapping avec confiance suffisante (>=0.6).");
    console.log(
      "   → Tu peux baisser le seuil dans le script si tu veux être plus agressif."
    );
  }

  if (!mappings.length) {
    console.log("⏹ Rien à écrire dans lois_mapping.");
    return;
  }

  // 5) Upsert dans lois_mapping
  console.log("💾 Écriture dans lois_mapping…");

  const batchSize = 300;
  for (let i = 0; i < mappings.length; i += batchSize) {
    const batch = mappings.slice(i, i + batchSize);

    const { error: errUpsert } = await supabase
      .from("lois_mapping")
      .upsert(
        batch.map((m) => ({
          loi_id: m.loi_id,
          id_dossier: m.id_dossier,
          confiance: m.confiance,
        })),
        { onConflict: "loi_id" }
      );

    if (errUpsert) {
      console.error("❌ Erreur upsert batch :", errUpsert);
      process.exit(1);
    }

    console.log(`  ✔ batch ${i} → ${i + batch.length - 1}`);
  }

  console.log("🎉 lois_mapping mis à jour via scrutins_raw (codes de texte)");
}

main().catch((e) => {
  console.error("❌ Erreur inattendue :", e);
  process.exit(1);
});
