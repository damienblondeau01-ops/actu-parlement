// ingestion/fetch_scrutins_details_from_an.js

require("dotenv").config();
const fetch = require("node-fetch");
const cheerio = require("cheerio");
const { createClient } = require("@supabase/supabase-js");

// ------------------ CONFIG SUPABASE ------------------

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Manque EXPO_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY dans .env (ingestion)");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ------------------ HELPERS URL SCRUTIN ------------------
// Exemple d’ID : VTANR5L17V790

function parseUid(uid) {
  const match = uid.match(/VTANR\d+L(\d+)V(\d+)/);

  if (!match) return null;

  return {
    legislature: match[1], // "17"
    scrutin: match[2],     // "790"
  };
}

function buildUrl(uid) {
  const parsed = parseUid(uid);
  if (!parsed) return null;

  return `https://www2.assemblee-nationale.fr/scrutins/detail/${parsed.legislature}/scrutin/${parsed.scrutin}`;
}

// ------------------ PARSE HTML ------------------

function parseScrutinHtml(html) {
  const $ = cheerio.load(html);
  const titre = $("h1").first().text().trim() || null;
  const objet = $(".contenu-principal p").first().text().trim() || null;
  return { titre, objet };
}

// ------------------ MAIN ------------------

async function main() {
  console.log("📥 Chargement liste scrutins…");

  const { data: rows, error } = await supabase
    .from("scrutins")
    .select("id, titre, objet");

  if (error) {
    console.error("❌ Erreur chargement scrutins :", error);
    process.exit(1);
  }

  console.log(`📊 ${rows.length} scrutins trouvés`);

  for (const s of rows) {
    console.log(`\n🔎 ${s.id}…`);

    const url = buildUrl(s.id);
    if (!url) {
      console.log("   ❌ UID non compatible :", s.id);
      continue;
    }

    console.log("   URL :", url);

    let html;
    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        console.log(`   ⚠️ HTTP ${resp.status} — ignoré`);
        continue;
      }
      html = await resp.text();
    } catch (e) {
      console.log("   ⚠️ Erreur réseau :", e);
      continue;
    }

    const { titre, objet } = parseScrutinHtml(html);
    const payload = {};

    if (titre && (!s.titre || s.titre.startsWith("Texte sans titre"))) {
      payload.titre = titre;
    }
    if (objet && (!s.objet || s.objet.length < 10)) {
      payload.objet = objet;
    }

    if (Object.keys(payload).length > 0) {
      const { error: upErr } = await supabase
        .from("scrutins") // ou "scrutins_import" si tu préfères
        .update(payload)
        .eq("id", s.id);

      if (upErr) {
        console.error("   ❌ Erreur mise à jour :", upErr);
      } else {
        console.log("   ✅ Mis à jour");
      }
    } else {
      console.log("   ↪ Rien à mettre à jour");
    }
  }

  console.log("\n🎉 Terminé !");
}

main().catch((e) => {
  console.error("❌ Erreur inattendue :", e);
  process.exit(1);
});
