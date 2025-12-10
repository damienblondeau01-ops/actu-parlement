// ingestion/fetch_votes_from_zip.js
import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

// 1️⃣ Récupération des variables d'environnement
const supabaseUrl =
  process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;

const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Variables d'environnement manquantes.");
  console.error("  SUPABASE_URL / EXPO_PUBLIC_SUPABASE_URL =", supabaseUrl);
  console.error(
    "  SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SERVICE_KEY / EXPO_PUBLIC_SUPABASE_ANON_KEY =",
    supabaseKey
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

function asArray(x) {
  if (!x) return [];
  return Array.isArray(x) ? x : [x];
}

async function main() {
  const zipPath = path.resolve("ingestion", "Scrutins.json.zip");
  console.log("📁 ZIP utilisé :", zipPath);

  if (!fs.existsSync(zipPath)) {
    console.error("❌ ZIP votes introuvable :", zipPath);
    return;
  }

  console.log("🚀 Import votes → Supabase");
  console.log("   URL =", supabaseUrl);

  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();
  console.log("📦 Fichiers trouvés dans le ZIP :", entries.length);

  // 2️⃣ Nettoyage complet de la table
  const { error: delError } = await supabase
    .from("votes_deputes_scrutin")
    .delete()
    .gt("id", 0);

  if (delError) {
    console.error("❌ Erreur lors du vidage de votes_deputes_scrutin :", delError);
    process.exit(1);
  }

  console.log("🧹 Table votes_deputes_scrutin vidée");

  let total = 0;
  let firstDebugDone = false;

  for (const entry of entries) {
    if (!entry.entryName.endsWith(".json")) continue;

    const raw = entry.getData().toString("utf8");
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      console.error("❌ JSON invalide pour", entry.entryName, e);
      continue;
    }

    // ⚠️ Dans Scrutins.json.zip, tout est dans data.scrutin
    const scrutin = data.scrutin || data;
    if (!scrutin) {
      if (!firstDebugDone) {
        console.log("⚠️ Pas de propriété 'scrutin' dans", entry.entryName);
      }
      continue;
    }

    // Petit debug une seule fois
    if (!firstDebugDone) {
      console.log("🔍 Exemple de clés dans scrutin pour", entry.entryName, ":", Object.keys(scrutin));
      firstDebugDone = true;
    }

    // 💡 Numero de scrutin (doit matcher scrutins_data.numero)
    const numero_scrutin = parseInt(
      scrutin.numero ||
      scrutin.numeroScrutin ||
      scrutin.numScrutin
    );

    if (!numero_scrutin || Number.isNaN(numero_scrutin)) {
      // On ignore ce scrutin si on ne trouve pas le numéro
      continue;
    }

    // 🔎 Ventilation nominative : scrutin.ventilationVotes.organe[].groupe[].vote.decompteNominatif.nominatif[]
    const ventilation = scrutin.ventilationVotes || {};
    const organes = asArray(ventilation.organe);
    let rows = [];

    for (const organe of organes) {
      // parfois l'organe est directement un groupe, parfois il contient groupe[]
      const groupes = asArray(organe.groupe || organe);

      for (const groupe of groupes) {
        const groupeCode =
          groupe.organeRef || groupe.codeTypeOrgane || groupe.libelleAbrev || null;

        const voteBloc = groupe.vote || {};
        const decompteNom = voteBloc.decompteNominatif || voteBloc.decomptesNominatifs || {};
        const nominatif = asArray(decompteNom.nominatif);

        for (const nv of nominatif) {
          const deputeRef = nv.acteurRef || nv.deputeRef || nv.deputeId || null;
          const voteValue =
            (nv.vote ||
              nv.sensVote ||
              nv.position ||
              nv.codePosition ||
              "").toString().toLowerCase();

          if (!deputeRef || !voteValue) continue;

          rows.push({
            numero_scrutin,
            id_an_scrutin: scrutin.uid || scrutin.id || null,
            depute_id_an: deputeRef, // ex: "PA1234"
            vote: voteValue, // "pour" | "contre" | "abstention" | ...
            groupe: groupeCode,
          });
        }
      }
    }

    if (rows.length === 0) continue;

    const { error } = await supabase
      .from("votes_deputes_scrutin")
      .insert(rows, { returning: "minimal" });

    if (error) {
      console.error("❌ Erreur insert pour le scrutin", numero_scrutin, error);
    } else {
      total += rows.length;
    }
  }

  console.log("✅ Import terminé. Votes insérés :", total);
}

main().catch((e) => {
  console.error("❌ Erreur inattendue :", e);
  process.exit(1);
});
