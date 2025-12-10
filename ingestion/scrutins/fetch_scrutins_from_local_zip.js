require("dotenv").config();
const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");
const { createClient } = require("@supabase/supabase-js");
const { inferScrutinKind } = require("./inferScrutinKind");
const { computeLoiGroupKey } = require("./computeLoiGroupKey");

// ---- CONFIG SUPABASE ----
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Variables supabase manquantes");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ---- FICHIER ZIP LOCAL ----
const ZIP_PATH = path.join(__dirname, "data", "Scrutins.json.zip");

async function main() {
  console.log("🚀 fetch_scrutins_from_local_zip démarré");

  if (!fs.existsSync(ZIP_PATH)) {
    console.error("❌ Fichier ZIP introuvable :", ZIP_PATH);
    process.exit(1);
  }

  const stats = fs.statSync(ZIP_PATH);
  console.log("💾 ZIP local trouvé, taille =", stats.size, "octets");

  // Nettoyage des tables cibles
  console.log("🧹 Nettoyage de la table scrutins_import…");
  let { error: delError } = await supabase
    .from("scrutins_import")
    .delete()
    .neq("id_an", "");
  if (delError) {
    console.error("❌ Erreur purge scrutins_import :", delError.message);
  }

  console.log("🧹 Nettoyage de la table scrutins_raw…");
  const { error: delRawError } = await supabase
    .from("scrutins_raw")
    .delete()
    .neq("id_an", "");
  if (delRawError) {
    console.error("⚠️ Erreur purge scrutins_raw (ignorable si la table n'existe pas) :", delRawError.message);
  }

  const zip = new AdmZip(ZIP_PATH);
  const entries = zip.getEntries();
  console.log("📦 Nombre de fichiers dans le ZIP :", entries.length);

  const allScrutins = [];

  for (const entry of entries) {
    if (!entry.entryName.endsWith(".json")) continue;

    const jsonText = entry.getData().toString("utf8");
    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      console.warn("⚠️ JSON invalide dans", entry.entryName);
      continue;
    }

    if (parsed.scrutin) {
      allScrutins.push(parsed.scrutin);
    }
  }

  console.log("📊 Nombre total de scrutins extraits :", allScrutins.length);

  if (allScrutins.length === 0) {
    console.log("⚠️ Aucun scrutin trouvé dans le ZIP.");
    return;
  }

  let ok = 0;
  let ko = 0;

  for (const s of allScrutins) {
    try {
      const id_an =
        s.uid || s.code || s.idScrutin || s.scrutinId || s.id || null;

      if (!id_an) {
        ko++;
        console.warn("⚠️ Scrutin sans ID : ignoré");
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

      // ---------- INSERT DANS scrutins_import (comme avant) ----------
      const payload = {
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
      };

      const { error } = await supabase.from("scrutins_import").insert(payload);

      if (error) {
        ko++;
        console.error("❌ Insert erreur pour", id_an);
        console.error("   message :", error.message);
        if (error.details) {
          console.error("   details :", error.details);
        }
        if (error.hint) {
          console.error("   hint    :", error.hint);
        }
        continue; // on ne tente pas scrutins_raw si scrutins_import échoue
      } else {
        ok++;
      }

      // ---------- INSERT/UPSERT DANS scrutins_raw ENRICHIE ----------
      const rawRow = {
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
        raw: s, // JSON brut complet
      };

      const { error: rawError } = await supabase
        .from("scrutins_raw")
        .upsert(rawRow, { onConflict: "id_an" });

      if (rawError) {
        console.error("❌ Erreur insertion scrutins_raw pour", id_an, rawError);
      }
    } catch (e) {
      ko++;
      console.error("❌ Exception scrutin :", e);
    }
  }

  console.log(`\n✅ Import terminé : ${ok} OK, ${ko} erreurs`);
}

main();
