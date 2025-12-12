// ingestion/scrutins/fetch_scrutins_from_local_zip.js
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");
const { createClient } = require("@supabase/supabase-js");

// Helpers dans ingestion/lib
const { inferScrutinKind } = require("../lib/inferScrutinKind");
const { computeLoiGroupKey } = require("../lib/computeLoiGroupKey");

// Petit helper comme dans fetch_votes_from_opendata
const toArray = (x) => {
  if (!x) return [];
  return Array.isArray(x) ? x : [x];
};

// ---- CONFIG ----
// ✅ Automatisation uniquement 17e législature
const LEGISLATURE = "17";

// ✅ ZIP local standardisé (même dossier que tes scripts qui download)
const ZIP_PATH = path.join(__dirname, "..", "data", "Scrutins.json.zip");

// ✅ Optionnel : PURGE=1 pour purger (à éviter en daily)
const DO_PURGE = process.env.PURGE === "1";

// ---- CONFIG SUPABASE ----
// ⚠️ IMPORTANT : en ingestion, utilise le service role en priorité
const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;

const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Variables supabase manquantes (SUPABASE_URL / SERVICE_ROLE)");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

async function main() {
  console.log("🚀 fetch_scrutins_from_local_zip démarré");
  console.log("   Législature ciblée :", LEGISLATURE);
  console.log("   ZIP :", ZIP_PATH);

  if (!fs.existsSync(ZIP_PATH)) {
    console.error("❌ Fichier ZIP introuvable :", ZIP_PATH);
    process.exit(1);
  }

  const stats = fs.statSync(ZIP_PATH);
  console.log("💾 ZIP local trouvé, taille =", stats.size, "octets");

  // ⚠️ En daily, ne purge pas (risque de trou si crash)
  if (DO_PURGE) {
    console.log("🧹 PURGE activée (Purge scrutins_import + scrutins_raw)");

    const { error: delError } = await supabase
      .from("scrutins_import")
      .delete()
      .neq("id_an", "");
    if (delError) console.error("❌ Erreur purge scrutins_import :", delError.message);

    const { error: delRawError } = await supabase
      .from("scrutins_raw")
      .delete()
      .neq("id_an", "");
    if (delRawError)
      console.error(
        "⚠️ Erreur purge scrutins_raw (ignorable si table absente) :",
        delRawError.message
      );
  } else {
    console.log("✅ Mode daily : pas de purge, import idempotent (upsert)");
  }

  const zip = new AdmZip(ZIP_PATH);
  const entries = zip.getEntries();
  console.log("📦 Nombre de fichiers dans le ZIP :", entries.length);

  const allScrutins = [];

  for (const entry of entries) {
    if (!entry.entryName.toLowerCase().endsWith(".json")) continue;

    let parsed;
    try {
      parsed = JSON.parse(entry.getData().toString("utf8"));
    } catch (e) {
      console.warn("⚠️ JSON invalide dans", entry.entryName, ":", e.message);
      continue;
    }

    // 3 formats possibles
    let scrutinsInFile = [];
    if (parsed.scrutins && parsed.scrutins.scrutin) {
      scrutinsInFile = toArray(parsed.scrutins.scrutin);
    } else if (parsed.scrutin) {
      scrutinsInFile = toArray(parsed.scrutin);
    } else if (Array.isArray(parsed)) {
      scrutinsInFile = parsed;
    }

    for (const s of scrutinsInFile) {
      if (s) allScrutins.push(s);
    }
  }

  console.log("📊 Nombre total de scrutins extraits (brut) :", allScrutins.length);

  // ✅ Filtrage L17 (pragmatique, basé sur l'id AN)
  const scrutins17 = allScrutins.filter((s) => {
    const id_an = s?.uid || s?.code || s?.idScrutin || s?.scrutinId || s?.id || "";
    return typeof id_an === "string" && id_an.includes(`L${LEGISLATURE}`);
  });

  console.log("🎯 Scrutins gardés après filtre L17 :", scrutins17.length);

  if (scrutins17.length === 0) {
    console.log("⚠️ Aucun scrutin L17 trouvé (ZIP inattendu ?).");
    return;
  }

  let ok = 0;
  let ko = 0;

  // Batch upsert (beaucoup plus rapide que 1 par 1)
  const BATCH_SIZE = 500;

  const rowsImport = [];
  const rowsRaw = [];

  for (const s of scrutins17) {
    try {
      const id_an =
        s.uid || s.code || s.idScrutin || s.scrutinId || s.id || null;

      if (!id_an) {
        ko++;
        continue;
      }

      const titre = s.titre ?? s.libelle ?? s.intitule ?? null;

      let objet = s.objet ?? s.objetVote ?? null;
      if (objet && typeof objet === "object" && objet.libelle) {
        objet = objet.libelle;
      }

      const type_texte =
        (s.typeVote &&
          (s.typeVote.libelleTypeVote || s.typeVote.codeTypeVote)) ||
        s.typeVote ||
        s.typeScrutin ||
        null;

      const { kind, article_ref } = inferScrutinKind({
        titre: titre || "",
        objet: objet || "",
        type_texte: type_texte || "",
      });

      const group_key = computeLoiGroupKey(
        titre ?? "",
        objet ?? "",
        type_texte ?? ""
      );

      const loi_id_value = group_key ?? id_an;

      const date_scrutin = s.dateScrutin ?? s.date ?? null;
      const numero = s.numeroScrutin ?? s.numero ?? null;

      const resultat =
        (s.sort && (s.sort.libelle || s.sort.libelleSort)) ||
        s.sort ||
        s.resultat ||
        null;

      rowsImport.push({
        id_an,
        loi_id: loi_id_value,
        numero,
        date_scrutin,
        titre,
        objet,
        resultat,
        type_texte,
        kind,
        article_ref,
        group_key,
      });

      rowsRaw.push({
        id_an,
        date_scrutin,
        numero,
        titre,
        objet,
        resultat,
        type_texte,
        loi_id: loi_id_value,
        kind,
        article_ref,
        group_key,
        raw: s,
      });
    } catch (e) {
      ko++;
      console.error("❌ Exception mapping scrutin :", e);
    }
  }

  console.log("💾 Upsert scrutins_import + scrutins_raw (batch)…");

  // Upsert scrutins_import
  for (let i = 0; i < rowsImport.length; i += BATCH_SIZE) {
    const batch = rowsImport.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from("scrutins_import")
      .upsert(batch, { onConflict: "id_an" });

    if (error) {
      console.error("❌ Erreur upsert scrutins_import :", error.message);
      ko += batch.length;
    } else {
      ok += batch.length;
    }
  }

  // Upsert scrutins_raw
  for (let i = 0; i < rowsRaw.length; i += BATCH_SIZE) {
    const batch = rowsRaw.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from("scrutins_raw")
      .upsert(batch, { onConflict: "id_an" });

    if (error) {
      console.error("❌ Erreur upsert scrutins_raw :", error.message);
      ko += batch.length;
    }
  }

  console.log(`\n✅ Import terminé : ${ok} lignes OK, ${ko} en erreur`);
  console.log("ℹ️ Prochaine étape : sync scrutins_data / vues (si ton pipeline le fait déjà).");
}

main().catch((e) => {
  console.error("❌ Erreur fatale :", e);
  process.exit(1);
});
