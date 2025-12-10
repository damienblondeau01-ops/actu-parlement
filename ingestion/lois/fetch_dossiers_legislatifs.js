const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");
const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  console.log("🚀 Import dossiers législatifs démarré...");

  const zipPath = path.join(__dirname, "data", "dossiers_legislatifs.json.zip");

  if (!fs.existsSync(zipPath)) {
    console.log("❌ ZIP introuvable :", zipPath);
    console.log("➡ Mets le fichier ZIP dans ingestion\\data avec ce nom.");
    return;
  }

  const zipData = fs.readFileSync(zipPath);
  const zip = await JSZip.loadAsync(zipData);

  // 🔁 On récupère TOUS les fichiers .json du zip
  const jsonFiles = Object.keys(zip.files).filter((f) => f.endsWith(".json"));
  console.log(`📁 Fichiers JSON trouvés dans le ZIP : ${jsonFiles.length}`);

  let count = 0;

  for (const jsonFile of jsonFiles) {
    const content = await zip.files[jsonFile].async("string");
    let json;

    try {
      json = JSON.parse(content);
    } catch (e) {
      console.error("⚠ Erreur JSON sur le fichier :", jsonFile, e.message);
      continue;
    }

    // Pour ton zip, on a vu que la racine est { dossierParlementaire: { ... } }
    const dossier = json.dossierParlementaire || json;

    if (!dossier || typeof dossier !== "object") {
      console.log("⚠ Pas de dossierParlementaire valide dans", jsonFile);
      continue;
    }

    await saveDossier(dossier);
    count++;
  }

  console.log(`🎉 Import terminé, ${count} dossiers insérés/mis à jour.`);
}

async function saveDossier(d) {
  // On log une fois au début pour vérifier la structure
  if (d._debug_logged !== true) {
    console.log("🔎 Exemple de dossierParlementaire (clés) :", Object.keys(d));
    // On ajoute un flag pour ne pas log à chaque fois
    d._debug_logged = true;
  }

  const loi = {
    // Ces champs devront peut-être être ajustés selon la structure exacte,
    // mais on stocke toujours tout dans "raw" au cas où.
    id_dossier: d.uid || d.idDossier || d.id,
    legislature: d.legislature || d.legislatureInitiale || "16",
    numero_depot: d.numeroDepot || d.numero || null,
    type_texte: d.typeTexte || d.nature || null,
    titre: d.titre || d.intitule || d.titreDossier || "Titre inconnu",
    origine: d.origine || d.initiateur || null,
    auteur_principal: d.auteur || d.auteurs || null,
    commission_saisie: d.commission || d.commissionSaisie || null,
    url_dossier_an: d.urlDossier || d.url || null,
    url_texte_principal: d.urlTexte || null,
    url_legifrance: d.urlLegifrance || null,
    etat_courant: d.etat || d.etatDossier || null,
    date_depot: d.dateDepot || null,
    date_premiere_lecture_an: d.datePremiereLectureAN || null,
    date_premiere_lecture_senat: d.datePremiereLectureSenat || null,
    date_adoption_definitive: d.dateAdoption || null,
    date_promulgation: d.datePromulgation || null,
    raw: d,
  };

  if (!loi.id_dossier) {
    console.warn("⚠ Dossier sans id_dossier, ignoré.");
    return;
  }

  const { error: loiError } = await supabase
    .from("lois")
    .upsert(loi, { onConflict: "id_dossier" });

  if (loiError) {
    console.error("❌ Erreur insert lois:", loiError);
    return;
  }

  // Pour l’instant, on ne remplit pas encore lois_parcours
  // (il faudra voir la structure précise de d.etapes / d.procedure)
  // On nettoie juste pour éviter de garder de vieilles données incohérentes.
  await supabase.from("lois_parcours").delete().eq("id_dossier", loi.id_dossier);
}

main();
