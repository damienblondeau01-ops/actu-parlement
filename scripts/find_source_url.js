import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import fetch from "node-fetch";

// ---- CONFIG -------------------------------------------------

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant.");
  process.exit(1);
}

console.log("🚀 Script fill_source_url démarré...");

// ---- UTIL : vérifier si une URL existe ----------------------

async function urlExists(url) {
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

// ---- UTIL : déduire automatiquement l’URL -------------------

function inferSourceUrl(loi) {
  const loiId = loi.loi_id?.trim();
  const titre = (loi.titre || loi.objet || "").toLowerCase();

  // 1️⃣ Si loi_id correspond au format VTANR... → scrutins
  if (loiId && loiId.startsWith("VTANR")) {
    const num = loiId.replace(/\D+/g, "");
    return `https://www.assemblee-nationale.fr/dyn/16/scrutins/${num}`;
  }

  // 2️⃣ Projet de loi : chercher /projet-loi dans le titre
  if (titre.includes("projet de loi")) {
    const guess = titre
      .replace("projet de loi", "")
      .trim()
      .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
      .replace(/-+/g, "-");

    return `https://www.assemblee-nationale.fr/dyn/16/textes/${guess}`;
  }

  // 3️⃣ Proposition de loi
  if (titre.includes("proposition de loi")) {
    const guess = titre
      .replace("proposition de loi", "")
      .trim()
      .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
      .replace(/-+/g, "-");

    return `https://www.assemblee-nationale.fr/dyn/16/textes/${guess}`;
  }

  // 4️⃣ Amendements
  if (titre.includes("amendement")) {
    const num = loi.loi_id?.replace(/\D+/g, "");
    if (num) {
      return `https://www.assemblee-nationale.fr/dyn/16/amendements/${num}`;
    }
  }

  // 5️⃣ Fallback : rien trouvé
  return null;
}

// ---- MAIN ---------------------------------------------------

async function main() {
  console.log("📥 Lecture des lois sans source_url...");
  const { data: lois, error } = await supabase
    .from("textes_lois")
    .select("*")
    .is("source_url", null);

  if (error) {
    console.error("❌ Erreur lecture textes_lois:", error);
    process.exit(1);
  }

  if (!lois || lois.length === 0) {
    console.log("ℹ️ Aucune loi sans source_url. Rien à faire.");
    return;
  }

  console.log(`📚 ${lois.length} loi(s) à traiter.\n`);

  for (const loi of lois) {
    console.log(`➡️ Loi ${loi.id} (${loi.loi_id}) : ${loi.titre}`);

    const guess = inferSourceUrl(loi);

    if (!guess) {
      console.log("   ❌ Impossible de deviner une URL. Skip.\n");
      continue;
    }

    console.log(`   🔍 Tentative URL : ${guess}`);

    const valid = await urlExists(guess);

    if (!valid) {
      console.log("   ❌ URL invalide (404). Skip.\n");
      continue;
    }

    console.log("   ✅ URL valide ! Sauvegarde en base...");

    const { error: upError } = await supabase
      .from("textes_lois")
      .update({ source_url: guess })
      .eq("id", loi.id);

    if (upError) {
      console.log("   ❌ Erreur mise à jour:", upError);
    } else {
      console.log("   💾 URL enregistrée.\n");
    }
  }

  console.log("\n🏁 Script fill_source_url terminé.");
}

main();
