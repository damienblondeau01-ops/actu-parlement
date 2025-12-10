// ingestion/match_lois_with_dossiers_smart.js
// Matching avancé loi_id <-> id_dossier
// Score multi-critères : titres (fort), dates (léger), type (léger)

require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");
const stringSimilarity = require("string-similarity");

// ---- CONFIG SUPABASE ----
const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// DRY-RUN par défaut. Mettre COMMIT=1 pour écrire dans lois_mapping.
const DO_COMMIT = process.env.COMMIT === "1";

/**
 * Nettoie un titre pour comparaison :
 * - minuscule
 * - supprime ponctuation de base
 */
function normalizeTitle(str) {
  if (!str) return "";
  let s = str.toLowerCase();

  // ponctuation basique
  s = s.replace(/[«»"(),.:;!?]/g, " ");

  // certains mots super fréquents mais pas trop dangereux
  const stopPhrases = [
    "l'ensemble de ",
    "l’ensemble de ",
    "la motion de rejet préalable, ",
    "la motion de rejet préalable ",
    "motion de rejet préalable ",
    "l'article unique de ",
    "l’article unique de ",
  ];
  for (const p of stopPhrases) {
    s = s.replace(p, "");
  }

  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/**
 * Similarité de titres en [0,1]
 */
function titleSimilarity(a, b) {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return 0;
  return stringSimilarity.compareTwoStrings(na, nb); // 0..1
}

/**
 * Score de proximité de dates entre [0,1]
 * - 1 si très proche (< 7 jours)
 * - ~0.8 si < 30 jours
 * - ~0.5 si < 180 jours
 * - ~0.2 sinon
 */
function dateProximityScore(dateDepotStr, datePremierScrutinStr) {
  if (!dateDepotStr || !datePremierScrutinStr) {
    return 0.5; // neutre si une des deux dates manque
  }
  const d1 = new Date(dateDepotStr);
  const d2 = new Date(datePremierScrutinStr);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0.5;

  const diffDays = Math.abs(d2 - d1) / (1000 * 60 * 60 * 24);

  if (diffDays <= 7) return 1;
  if (diffDays <= 30) return 0.8;
  if (diffDays <= 180) return 0.5;
  return 0.2;
}

/**
 * Score de compatibilité de type (projet / proposition / résolution, etc.)
 */
function typeCompatibilityScore(titreLoiApp, typeTexteDossier) {
  const tApp = (titreLoiApp || "").toLowerCase();
  const tDoss = (typeTexteDossier || "").toLowerCase();

  const isPropApp = tApp.includes("proposition de loi");
  const isProjApp = tApp.includes("projet de loi");
  const isResApp =
    tApp.includes("proposition de résolution") || tApp.includes("résolution");

  const isPropDoss = tDoss.includes("proposition de loi");
  const isProjDoss = tDoss.includes("projet de loi");
  const isResDoss = tDoss.includes("résolution");

  if (!tApp && !tDoss) return 0.5;

  if (isPropApp && isPropDoss) return 1;
  if (isProjApp && isProjDoss) return 1;
  if (isResApp && isResDoss) return 1;

  // mismatch fort
  if (isPropApp && isProjDoss) return 0.3;
  if (isProjApp && isPropDoss) return 0.3;

  return 0.5; // neutre sinon
}

/**
 * Score global [0,1] avec pondération
 * → Titre très dominant (0.8), dates et type en bonus léger
 */
function computeGlobalScore({
  titreLoiApp,
  titreDossier,
  dateDepot,
  datePremierScrutin,
  typeTexte,
}) {
  const sTitle = titleSimilarity(titreLoiApp, titreDossier); // 0..1
  const sDate = dateProximityScore(dateDepot, datePremierScrutin); // 0..1
  const sType = typeCompatibilityScore(titreLoiApp, typeTexte); // 0..1

  const wTitle = 0.8;
  const wDate = 0.15;
  const wType = 0.05;

  return wTitle * sTitle + wDate * sDate + wType * sType;
}

async function main() {
  console.log("🚀 match_lois_with_dossiers_smart démarré…");
  console.log(DO_COMMIT ? "⚠️ MODE COMMIT (écrit dans lois_mapping)" : "🧪 MODE DRY-RUN");

  // 1) lois_app
  const { data: loisApp, error: errLoisApp } = await supabase
    .from("lois_app")
    .select(
      "loi_id, titre_loi, date_premier_scrutin, date_dernier_scrutin"
    );

  if (errLoisApp) {
    console.error("❌ Erreur chargement lois_app :", errLoisApp);
    process.exit(1);
  }
  console.log(`📘 lois_app chargées : ${loisApp.length}`);

  // 2) dossiers législatifs
  const { data: dossiers, error: errDossiers } = await supabase
    .from("lois")
    .select("id_dossier, titre, legislature, type_texte, date_depot");

  if (errDossiers) {
    console.error("❌ Erreur chargement lois (dossiers) :", errDossiers);
    process.exit(1);
  }
  console.log(`📗 dossiers législatifs chargés : ${dossiers.length}`);

  const bestCandidates = []; // meilleur dossier pour chaque loi_app
  const seuil = 0.6;         // seuil de confiance minimum (plus bas qu'avant)

  for (const loi of loisApp) {
    const { loi_id, titre_loi, date_premier_scrutin } = loi;

    let best = null;

    for (const d of dossiers) {
      const score = computeGlobalScore({
        titreLoiApp: titre_loi,
        titreDossier: d.titre,
        dateDepot: d.date_depot,
        datePremierScrutin: date_premier_scrutin,
        typeTexte: d.type_texte,
      });

      if (!best || score > best.score) {
        best = {
          loi_id,
          id_dossier: d.id_dossier,
          score,
          titre_loi_app: titre_loi,
          titre_dossier: d.titre,
        };
      }
    }

    if (best) {
      bestCandidates.push(best);
    }
  }

  // Trier par score décroissant pour analyse
  bestCandidates.sort((a, b) => b.score - a.score);

  console.log(
    `📊 Meilleurs scores (toutes lois_app confondues) :`
  );
  bestCandidates.slice(0, 10).forEach((m) => {
    console.log(
      `- [${m.loi_id}] -> ${m.id_dossier} score=${m.score.toFixed(3)}\n` +
        `  Loi_app : ${m.titre_loi_app}\n` +
        `  Dossier : ${m.titre_dossier}\n`
    );
  });

  // Filtrer ceux qui dépassent le seuil
  const mappings = bestCandidates.filter((m) => m.score >= seuil);

  console.log(
    `📊 Résultat : ${mappings.length}/${loisApp.length} lois_app avec match score >= ${seuil}`
  );

  if (!DO_COMMIT) {
    console.log("🧪 MODE DRY-RUN → aucune écriture dans lois_mapping.");
    return;
  }

  if (mappings.length === 0) {
    console.log("⚠️ Aucun match au-dessus du seuil, rien à écrire.");
    return;
  }

  // 3) Écriture dans lois_mapping
  console.log("💾 COMMIT → écriture dans lois_mapping…");

  const batchSize = 300;
  for (let i = 0; i < mappings.length; i += batchSize) {
    const batch = mappings.slice(i, i + batchSize);

    const { error: errUpsert } = await supabase
      .from("lois_mapping")
      .upsert(
        batch.map((m) => ({
          loi_id: m.loi_id,
          id_dossier: m.id_dossier,
          confiance: m.score,
          source: "smart_match_v2",
        })),
        { onConflict: "loi_id" }
      );

    if (errUpsert) {
      console.error("❌ Erreur upsert batch :", errUpsert);
      process.exit(1);
    }

    console.log(`  ✔ batch ${i} → ${i + batch.length - 1}`);
  }

  console.log("🎉 lois_mapping mis à jour (smart_match_v2).");
}

main().catch((e) => {
  console.error("❌ Erreur inattendue :", e);
  process.exit(1);
});
