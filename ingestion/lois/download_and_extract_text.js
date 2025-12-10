// ingestion/download_and_extract_text.js
require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");
const fetch = require("node-fetch");
const { JSDOM } = require("jsdom"); // npm install jsdom

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function extractMainText(html) {
  const dom = new JSDOM(html);
  const document = dom.window.document;

  // sélection naïve, V1 (souvent dans <article> ou <main>)
  const candidate =
    document.querySelector("main") ||
    document.querySelector("article") ||
    document.body;

  return candidate.textContent.replace(/\s+/g, " ").trim();
}

async function run() {
  console.log("📄 Extraction HTML → texte…");

  const { data: rows } = await supabase
    .from("lois_textes")
    .select("loi_id, url_texte_integral")
    .not("url_texte_integral", "is", null)
    .limit(10);

  if (!rows || rows.length === 0) {
    console.log("⚠ Aucune loi avec url_texte_integral");
    return;
  }

  for (const row of rows) {
    try {
      console.log(`➡ Téléchargement texte pour ${row.loi_id}`);

      const res = await fetch(row.url_texte_integral);
      const html = await res.text();
      const text = await extractMainText(html);

      await supabase.from("lois_textes")
        .update({ texte_integral_brut: text })
        .eq("loi_id", row.loi_id);

      console.log("   ✅ texte sauvegardé");
    } catch (e) {
      console.error("   ❌ erreur extraction", e);
    }
  }

  console.log("🏁 Terminé");
}

run();
