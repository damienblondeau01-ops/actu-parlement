// scripts/detect_main_texts.js
import dotenv from "dotenv";
dotenv.config();

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Regex pour trouver un numéro de texte AN : l16bXXXX
const TEXT_ID_REGEX = /(l16b\d{3,4})/i;

// Keywords indiquant un “vrai texte législatif”
const MAIN_TEXT_KEYWORDS = [
  "projet de loi",
  "proposition de loi",
  "projet-loi",
  "proposition-loi",
  "pjl",
  "ppl",
  "texte n°",
  "première lecture",
  "deuxième lecture"
];

function looksLikeMainText(title) {
  if (!title) return false;
  const t = title.toLowerCase();

  return MAIN_TEXT_KEYWORDS.some(k => t.includes(k));
}

async function run() {
  console.log("🚀 Script detect_main_texts démarré...");

  const { data: rows, error } = await supabase
    .from("textes_lois")
    .select("id, titre, loi_id, source_url");

  if (error) {
    console.error("❌ Erreur lecture supabase:", error);
    return;
  }

  console.log(`📚 ${rows.length} lignes analysées.`);

  let updated = 0;

  for (const row of rows) {
    if (row.source_url) continue; // déjà rempli

    const titre = row.titre || "";
    const loi_id = row.loi_id || "";

    // 1️⃣ Tenter d'extraire un numéro l16bXXXX depuis le titre
    let textId = null;
    const match = titre.match(TEXT_ID_REGEX);
    if (match) {
      textId = match[1].toLowerCase();
    }

    // 2️⃣ Sinon essayer depuis loi_id si possible
    if (!textId && loi_id.startsWith("L16B")) {
      textId = "l16b" + loi_id.replace(/\D/g, "").slice(-4);
    }

    // 3️⃣ Vérifier si c’est vraiment un texte principal
    if (!textId || !looksLikeMainText(titre)) {
      console.log(`➡️ Ignoré (pas un texte principal) : ${row.id}`);
      continue;
    }

    // Construire l'URL officielle AN
    const url = `https://www.assemblee-nationale.fr/dyn/16/textes/${textId}_projet-loi`;

    console.log(`🏷️ Mise à jour ID=${row.id}`);
    console.log(`   URL = ${url}`);

    const { error: updateErr } = await supabase
      .from("textes_lois")
      .update({ source_url: url })
      .eq("id", row.id);

    if (updateErr) {
      console.error("❌ Erreur update:", updateErr);
    } else {
      updated++;
    }
  }

  console.log(`\n🏁 Script terminé. ${updated} URL générées.`);
}

run();
