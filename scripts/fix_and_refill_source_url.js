import 'dotenv/config';
import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Variables Supabase manquantes.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

console.log("🚀 Script correcteur de URLs démarré...");

// Détection des faux URLs
function isFakeUrl(url) {
  if (!url) return true;
  const lower = url.toLowerCase();
  return (
    lower.includes("fake") ||
    lower.includes("temporaire") ||
    lower.includes("placeholder") ||
    lower.includes("example") ||
    lower.trim().length < 10
  );
}

// Extraction du numéro de texte depuis "l16b1234"
function extractTextNumberFromTitle(titre) {
  if (!titre) return null;
  const match = titre.toLowerCase().match(/l16b(\d{3,5})/);
  return match ? match[1] : null;
}

// Détection du type
function detectType(titre) {
  const t = titre.toLowerCase();
  if (t.includes("projet de loi")) return "projet";
  if (t.includes("proposition de loi")) return "proposition";
  if (t.includes("amendement")) return "amendement";
  return "autre";
}

async function urlExists(url) {
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.status === 200;
  } catch {
    return false;
  }
}

async function main() {
  console.log("📥 Lecture des lois dans « textes_lois »…");

  const { data: lois, error } = await supabase
    .from("textes_lois")
    .select("id, loi_id, titre, source_url")
    .order("id");

  if (error) {
    console.error("❌ Erreur SQL :", error);
    return;
  }

  console.log(`📚 ${lois.length} lois chargées.`);

  for (const loi of lois) {
    const { id, titre, source_url } = loi;

    console.log(`\n➡️ Loi ID=${id}`);
    console.log(`   Titre : ${titre}`);

    if (!isFakeUrl(source_url)) {
      console.log("   ✔️ URL existante conservée.");
      continue;
    }

    console.log("   ⚠️ URL FAUSSE → reconstruction…");

    const num = extractTextNumberFromTitle(titre);
    const type = detectType(titre);

    if (!num) {
      console.log("   ❌ Impossible d'extraire le numéro du texte.");
      continue;
    }

    let newUrl = null;

    if (type === "projet") {
      newUrl = `https://www.assemblee-nationale.fr/dyn/16/textes/l16b${num}_projet-loi`;
    } else if (type === "proposition") {
      newUrl = `https://www.assemblee-nationale.fr/dyn/16/textes/l16b${num}_proposition-loi`;
    } else if (type === "amendement") {
      newUrl = `https://www.assemblee-nationale.fr/dyn/16/amendements/l16b${num}`;
    } else {
      console.log("   ❌ Type non reconnu → Skip.");
      continue;
    }

    console.log(`   🔎 Test URL : ${newUrl}`);

    if (!(await urlExists(newUrl))) {
      console.log("   ❌ URL invalide (404) → skip.");
      continue;
    }

    console.log("   ✅ URL valide → mise à jour.");

    const { error: upErr } = await supabase
      .from("textes_lois")
      .update({ source_url: newUrl })
      .eq("id", id);

    if (upErr) console.error("   ❌ Erreur UPDATE :", upErr);
    else console.log("   ✔️ Mis à jour !");
  }

  console.log("\n🏁 Script terminé.");
}

main();
