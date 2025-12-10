// ingestion/match_lois_with_dossiers.js
// Script : matcher lois_app.loi_id <-> lois.id_dossier via fuzzy matching

require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");
const stringSimilarity = require("string-similarity");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ⚠️ On force COMMIT à true pour éviter les galères d'env
const COMMIT = true;

function normalizeTitle(str) {
  if (!str) return "";
  let s = str;

  // enlever les préfixes classiques
  s = s.replace(/^(projet de loi|proposition de loi)\s*/i, "");

  s = s.toLowerCase();
  s = s.replace(/[^a-z0-9]+/g, " ");
  s = s.replace(/\s+/g, " ").trim();

  return s;
}

function computeScore(a, b) {
  if (!a || !b) return 0;
  const base = stringSimilarity.compareTwoStrings(a, b);
  const lenRatio = Math.min(a.length, b.length) / Math.max(a.length, b.length);
  const bonus = (lenRatio - 0.7) * 0.2; // petit bonus si longueurs proches
  return Math.max(0, Math.min(1, base + bonus));
}

async function main() {
  console.log("🚀 match_lois_with_dossiers lancé…");
  console.log("⚠️ MODE COMMIT (écrit dans lois_mapping)");

  // 1) lois_app
  const { data: loisApp, error: errLoisApp } = await supabase
    .from("lois_app")
    .select("loi_id, titre_loi");

  if (errLoisApp) {
    console.error("❌ Erreur chargement lois_app :", errLoisApp);
    process.exit(1);
  }

  console.log(`📘 lois_app chargées : ${loisApp.length}`);

  // 2) dossiers législatifs
  const { data: dossiers, error: errDossiers } = await supabase
    .from("lois")
    .select("id_dossier, titre");

  if (errDossiers) {
    console.error("❌ Erreur chargement lois (dossiers) :", errDossiers);
    process.exit(1);
  }

  console.log(`📗 dossiers législatifs chargés : ${dossiers.length}`);

  // 2bis) normaliser les titres des dossiers (titre est un JSON {titre, titreChemin, ...})
  const normDossiers = dossiers.map((d) => {
    let rawTitre = "";

    if (typeof d.titre === "string") {
      rawTitre = d.titre;
    } else if (d.titre && typeof d.titre === "object") {
      rawTitre =
        d.titre.titre ||
        d.titre.titreChemin ||
        d.titre.titreLong ||
        d.titre.titreCourt ||
        "";
    }

    return {
      ...d,
      titre_plain: rawTitre,
      titre_norm: normalizeTitle(rawTitre),
    };
  });

  // 3) matching
  const mappings = [];
  const THRESHOLD = 0.6;

  for (const row of loisApp) {
    const loiId = row.loi_id;
    const titreLoi = row.titre_loi || "";
    const titreNorm = normalizeTitle(titreLoi);

    if (!loiId) continue;

    let best = null;
    let bestScore = 0;

    for (const d of normDossiers) {
      const score = computeScore(titreNorm, d.titre_norm);
      if (score > bestScore) {
        bestScore = score;
        best = d;
      }
    }

    if (best && bestScore >= THRESHOLD) {
      mappings.push({
        loi_id: loiId,
        id_dossier: best.id_dossier,
        titre_loi: titreLoi,
        titre_dossier: best.titre_plain,
        confiance: bestScore,
      });
    } else {
      mappings.push({
        loi_id: loiId,
        id_dossier: null,
        titre_loi: titreLoi,
        titre_dossier: null,
        confiance: bestScore,
      });
    }
  }

  const nbMatch = mappings.filter((m) => m.id_dossier).length;
  console.log(`\n📊 Résultat : ${nbMatch}/${mappings.length} matches (score >= ${THRESHOLD})`);

  console.log("\n🔍 Exemples de bons matchs :");
  mappings
    .filter((m) => m.id_dossier)
    .sort((a, b) => b.confiance - a.confiance)
    .slice(0, 8)
    .forEach((m) => {
      console.log(
        `- [${m.loi_id}] score=${m.confiance.toFixed(3)}\n  Loi_app : ${m.titre_loi}\n  Dossier : ${m.titre_dossier}\n`
      );
    });

  console.log("\n🔍 Exemples non matchés :");
  mappings
    .filter((m) => !m.id_dossier)
    .sort((a, b) => b.confiance - a.confiance)
    .slice(0, 8)
    .forEach((m) => {
      console.log(
        `- [${m.loi_id}] score=${m.confiance.toFixed(3)} → ${m.titre_loi}`
      );
    });

  // 4) écriture dans lois_mapping
  console.log("\n💾 COMMIT → écriture dans lois_mapping…");

  const batchSize = 300;
  for (let i = 0; i < mappings.length; i += batchSize) {
    const batch = mappings.slice(i, i + batchSize);

    const { error: errUpsert } = await supabase
      .from("lois_mapping")
      .upsert(
        batch.map((m) => ({
          loi_id: m.loi_id,
          id_dossier: m.id_dossier,
          titre_loi: m.titre_loi,
          titre_dossier: m.titre_dossier,
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

  console.log("\n🎉 lois_mapping mis à jour.");
}

main().catch((e) => {
  console.error("❌ Erreur inattendue :", e);
  process.exit(1);
});
