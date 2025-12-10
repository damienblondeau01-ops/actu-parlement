// scripts/scrape_assemblee.js

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

/**
 * Petit helper pour vérifier la config
 */
function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error("❌ SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant dans les variables d'environnement.");
    process.exit(1);
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
    },
  });
}

/**
 * Nettoie une page HTML -> texte brut lisible
 */
function htmlToText(html) {
  if (!html) return "";

  let text = html;

  // Retirer les scripts / styles
  text = text.replace(/<script[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "");

  // Remplacer les <br> et <p> par des retours à la ligne
  text = text.replace(/<(br|BR)\s*\/?>/g, "\n");
  text = text.replace(/<\/p>/gi, "\n\n");

  // Retirer toutes les autres balises
  text = text.replace(/<[^>]+>/g, " ");

  // Décoder quelques entités HTML de base
  const entities = {
    "&nbsp;": " ",
    "&amp;": "&",
    "&quot;": '"',
    "&#39;": "'",
    "&lt;": "<",
    "&gt;": ">",
  };
  for (const [entity, value] of Object.entries(entities)) {
    text = text.replace(new RegExp(entity, "g"), value);
  }

  // Normaliser les espaces
  text = text.replace(/\r\n/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.replace(/[ \t]{2,}/g, " ");

  return text.trim();
}

/**
 * Essaye d'extraire la partie "texte officiel" de la page AN
 * (on commence simple : on prend le gros bloc principal)
 */
function extractMainContent(html) {
  // On pourrait être plus fin (sélecteur de <main>, <article>, etc.)
  // mais dans un premier temps, on se contente de tout le body.
  const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  const inner = bodyMatch ? bodyMatch[1] : html;
  return htmlToText(inner);
}

async function fetchLoisToScrape(supabase, limit = 20) {
  const { data, error } = await supabase
    .from("textes_lois")
    .select("id, loi_id, titre, source_url, texte_integral")
    .is("texte_integral", null)
    .not("source_url", "is", null)
    .limit(limit);

  if (error) {
    console.error("❌ Erreur lecture textes_lois:", error);
    throw error;
  }

  return data ?? [];
}

async function updateTexteIntegral(supabase, id, texte_integral) {
  const { error } = await supabase
    .from("textes_lois")
    .update({ texte_integral })
    .eq("id", id);

  if (error) {
    console.error(`❌ Erreur update texte_integral pour id=${id}:`, error);
    throw error;
  }
}

async function scrapeOneLoi(supabase, row) {
  const { id, loi_id, titre, source_url } = row;

  if (!source_url) {
    console.warn(
      `⚠️ Ligne id=${id}, loi_id=${loi_id} sans source_url, ignorée.`
    );
    return;
  }

  console.log(
    `\n➡️ Loi id=${id}, loi_id=${loi_id ?? "?"}, titre="${titre ?? "Sans titre"}"`
  );
  console.log(`   🌐 Récupération depuis ${source_url} ...`);

  let resp;
  try {
    resp = await fetch(source_url);
  } catch (e) {
    console.error("   ❌ Erreur réseau lors du fetch:", e);
    return;
  }

  if (!resp.ok) {
    console.error(
      `   ❌ HTTP ${resp.status} en récupérant ${source_url}`
    );
    return;
  }

  const html = await resp.text();
  const texte = extractMainContent(html);

  if (!texte || texte.length < 100) {
    console.warn(
      "   ⚠️ Texte extrait très court (moins de 100 caractères). On évite de l'enregistrer."
    );
    return;
  }

  console.log(
    `   ✨ Texte extrait (~${texte.length} caractères), enregistrement en base...`
  );

  await updateTexteIntegral(supabase, id, texte);

  console.log("   ✅ texte_integral mis à jour dans textes_lois.");
}

async function main() {
  console.log("🚀 Script scrape_assemblee démarré...");

  const supabase = getSupabaseClient();

  const lois = await fetchLoisToScrape(supabase, 50);

  if (lois.length === 0) {
    console.log(
      "ℹ️ Aucune loi à scraper (texte_integral déjà rempli ou source_url manquant)."
    );
    console.log("✅ Rien à faire pour le moment.");
    return;
  }

  console.log(
    `📚 ${lois.length} loi(s) à enrichir avec le texte officiel.`
  );

  for (const row of lois) {
    try {
      await scrapeOneLoi(supabase, row);
    } catch (e) {
      console.error(
        `   💥 Erreur inattendue sur loi id=${row.id}:`,
        e
      );
    }
  }

  console.log("\n🏁 Script scrape_assemblee terminé.");
}

// Lancement
main().catch((e) => {
  console.error("💥 Erreur fatale dans le script:", e);
  process.exit(1);
});
