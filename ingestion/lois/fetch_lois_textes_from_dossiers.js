// ingestion/fetch_lois_textes_from_dossiers.js
require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");
const fetch = require("node-fetch"); // npm install node-fetch@2

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error(
    "❌ EXPO_PUBLIC_SUPABASE_URL ou EXPO_PUBLIC_SUPABASE_ANON_KEY manquant dans .env"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Petite pause pour éviter de spammer le site de l'AN
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Essaye de trouver une URL de texte de loi dans la page du dossier.
 * V1 : on cherche juste un href contenant "/dyn/16/textes/".
 */
function extractTexteUrlFromHtml(html, dossierUrl) {
  const regexHref = /href="([^"]+)"/g;
  let match;
  let found = null;

  while ((match = regexHref.exec(html)) !== null) {
    const href = match[1];

    if (href.includes("/dyn/16/textes/")) {
      if (href.startsWith("http")) {
        found = href;
      } else {
        // lien relatif -> on reconstruit l'URL absolue
        if (href.startsWith("/")) {
          found = "https://www.assemblee-nationale.fr" + href;
        } else {
          found = new URL(href, dossierUrl).toString();
        }
      }
      break;
    }
  }

  return found;
}

async function main() {
  try {
    console.log("🚀 fetch_lois_textes_from_dossiers démarré…");

    // 1️⃣ Mode LARGE direct : toutes les lois avec un id_dossier non null
    const { data: mappingRows, error: mapError } = await supabase
      .from("lois_mapping")
      .select("loi_id, id_dossier, confiance, source")
      .not("id_dossier", "is", null)
      .limit(50); // on traite un batch de 50 pour commencer

    if (mapError) {
      console.error("❌ Erreur chargement lois_mapping :", mapError);
      process.exit(1);
    }

    if (!mappingRows || mappingRows.length === 0) {
      console.log(
        "ℹ️ Aucune loi avec id_dossier non null dans lois_mapping."
      );
      return;
    }

    console.log(
      `🧾 ${mappingRows.length} loi(s) à enrichir depuis les dossiers AN…`
    );

    let successCount = 0;
    let errorCount = 0;

    for (const row of mappingRows) {
      const { loi_id, id_dossier, confiance, source } = row;

      if (!loi_id || !id_dossier) {
        console.warn("⚠ Ligne ignorée (loi_id ou id_dossier manquant) :", row);
        continue;
      }

      const dossierUrl = `https://www.assemblee-nationale.fr/dyn/16/dossiers/${id_dossier}`;
      console.log(`\n➡ Loi ${loi_id}`);
      console.log(`   Source mapping : ${source} (confiance=${confiance})`);
      console.log(`   Dossier AN : ${dossierUrl}`);

      try {
        // 2️⃣ Récupération HTML du dossier
        const resp = await fetch(dossierUrl, {
          headers: {
            "User-Agent":
              "ActuDesLoisBot/0.1 (+application personnelle, respectueuse)",
          },
        });

        if (!resp.ok) {
          console.warn(
            `⚠ Impossible de charger le dossier (${resp.status} ${resp.statusText})`
          );
        }

        const html = await resp.text();

        // 3️⃣ Extraire éventuellement un lien vers le texte intégral
        const texteUrl = extractTexteUrlFromHtml(html, dossierUrl);

        // 4️⃣ Préparer la ligne lois_textes
        const payload = {
          loi_id,
          source: "AN_dossier_auto", // on marque bien que ça vient du pipeline auto
          url_dossier: dossierUrl,
          url_texte_integral: texteUrl ?? null,
          // on laisse date_promulgation, url_expose_motifs, resume_etendu à null pour l'instant
        };

        console.log("   ↳ URL texte intégral :", texteUrl || "(non trouvé)");

        const { error: upsertError } = await supabase
          .from("lois_textes")
          .upsert(payload, { onConflict: "loi_id" });

        if (upsertError) {
          console.error("   ❌ Erreur upsert lois_textes :", upsertError);
          errorCount++;
        } else {
          console.log("   ✅ lois_textes mis à jour");
          successCount++;
        }

        // 5️⃣ Petite pause
        await sleep(500);
      } catch (e) {
        console.error("   💥 Erreur sur cette loi :", e);
        errorCount++;
      }
    }

    console.log("\n🎉 Terminé.");
    console.log(`   ✅ Succès : ${successCount}`);
    console.log(`   ❌ Erreurs : ${errorCount}`);
  } catch (e) {
    console.error("💥 Erreur générale dans fetch_lois_textes_from_dossiers :", e);
    process.exit(1);
  }
}

main();
