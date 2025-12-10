// ingestion/fetch_scrutins_from_opendata.js

require("dotenv").config();
const fetch = require("node-fetch");                    // npm install node-fetch@2
const AdmZip = require("adm-zip");                     // npm install adm-zip
const { createClient } = require("@supabase/supabase-js");

// ------------------ CONFIG SUPABASE ------------------

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("❌ Manque EXPO_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY dans .env (ingestion)");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ------------------ URL OPEN DATA (17e législature) ------------------

const ZIP_URL =
  "http://data.assemblee-nationale.fr/static/openData/repository/17/loi/scrutins/Scrutins.json.zip";

// ------------------ MAIN ------------------

async function main() {
  console.log("📥 Téléchargement de Scrutins.json.zip…");

  const res = await fetch(ZIP_URL);
  if (!res.ok) {
    console.error("❌ Erreur HTTP :", res.status, await res.text());
    process.exit(1);
  }

  const buffer = await res.buffer();
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();

  if (!entries.length) {
    console.error("❌ ZIP vide : aucune entrée trouvée");
    process.exit(1);
  }

  const jsonText = entries[0].getData().toString("utf8");
  const parsed = JSON.parse(jsonText);

  // ⚠️ À ADAPTER selon la structure réelle
  // Ouvre le JSON dans VS Code pour voir s’il y a parsed.scrutins.scrutin, parsed.scrutins, etc.
  let allScrutins;
  if (Array.isArray(parsed)) {
    allScrutins = parsed;
  } else if (Array.isArray(parsed.scrutins)) {
    allScrutins = parsed.scrutins;
  } else if (parsed.scrutins && Array.isArray(parsed.scrutins.scrutin)) {
    allScrutins = parsed.scrutins.scrutin;
  } else {
    console.error("❌ Impossible de trouver la liste des scrutins dans le JSON");
    console.error("Clés trouvées :", Object.keys(parsed));
    process.exit(1);
  }

  console.log("📊 Nombre de scrutins trouvés dans le JSON :", allScrutins.length);

  // Pour les tests, tu peux limiter :
  // const scrutinsToImport = allScrutins.slice(0, 50);
  const scrutinsToImport = allScrutins;

  let ok = 0;
  let ko = 0;

  for (const s of scrutinsToImport) {
    try {
      // ⚠️ ICI : adapter aux vrais noms de champs du JSON
      // Ouvre le JSON et repère :
      //  - l’ID AN du scrutin (VTANR5L17V790)
      //  - le numéro
      //  - la date
      //  - le titre / libellé
      //  - le sort (Adopté / Rejeté)
      //  - etc.

      const id_an =
        s.uid ||
        s.code ||
        s.idScrutin ||
        s.scrutinId;

      if (!id_an) {
        console.warn("⚠️ Scrutin sans identifiant AN, ignoré");
        continue;
      }

      const numero =
        s.numeroScrutin ||
        s.numero ||
        null;

      const date_scrutin =
        s.dateScrutin ||
        s.date ||
        null;

      const titre =
        s.titre ||
        s.libelle ||
        s.intitule ||
        null;

      const objet =
        s.objet ||
        s.objetVote ||
        null;

      const resultat =
        s.sort ||
        s.resultat ||
        null;

      const type_texte =
        s.typeVote ||
        s.typeScrutin ||
        null;

      const row = {
        id_an,          // identifiant AN (VTANR5L17V790)
        loi_id: id_an,  // si tu veux le dupliquer pour les liens
        numero,
        date_scrutin,
        titre,
        objet,
        resultat,
        type_texte,
      };

      const { error } = await supabase
        .from("scrutins_import") // 🔁 adapte si ta table s’appelle autrement
        .upsert(row, { onConflict: "id_an" });

      if (error) {
        ko++;
        console.error("❌ Erreur upsert scrutin", id_an, error.message);
      } else {
        ok++;
      }
    } catch (e) {
      ko++;
      console.error("❌ Exception sur un scrutin :", e);
    }
  }

  console.log(`✅ Import terminé : ${ok} scrutins ok, ${ko} en erreur`);
}

main().catch((e) => {
  console.error("❌ Erreur inattendue :", e);
  process.exit(1);
});
