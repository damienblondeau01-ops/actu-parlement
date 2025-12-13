// ingestion/scrutins/fetch_scrutins_from_local_zip.js
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");
const { createClient } = require("@supabase/supabase-js");

// Helpers dans ingestion/lib
const { inferScrutinKind } = require("../lib/inferScrutinKind");
const { computeLoiGroupKey } = require("../lib/computeLoiGroupKey");

// ✅ charge ingestion/.env (et pas un .env au hasard du cwd)
dotenv.config({ path: path.join(__dirname, "..", ".env") });

// Petit helper comme dans fetch_votes_from_opendata
const toArray = (x) => {
  if (!x) return [];
  return Array.isArray(x) ? x : [x];
};

// ---- CONFIG ----
const LEGISLATURE = "17";
const ZIP_PATH = path.join(__dirname, "..", "data", "Scrutins.json.zip");
const DO_PURGE = process.env.PURGE === "1";

// ---- CONFIG SUPABASE ----
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

// ✅ raw ultra-allégé (sinon timeout PostgREST)
function makeRawLight(s) {
  // On garde le minimum utile pour debug, sans les énormes blocs ventilationVotes etc.
  return {
    uid: s?.uid ?? null,
    numero: s?.numero ?? null,
    legislature: s?.legislature ?? null,
    dateScrutin: s?.dateScrutin ?? null,
    organeRef: s?.organeRef ?? null,
    sessionRef: s?.sessionRef ?? null,
    seanceRef: s?.seanceRef ?? null,
    typeVote: s?.typeVote ?? null,
    sort: s?.sort ?? null,
    demandeur: s?.demandeur ?? null,
    objet: s?.objet ?? null,
    titre: s?.titre ?? null,
  };
}

async function purgeIfAsked() {
  if (!DO_PURGE) {
    console.log("✅ Mode daily : pas de purge, import idempotent (upsert)");
    return;
  }

  console.log("🧹 PURGE activée (scrutins_import + scrutins_raw)");

  const { error: del1 } = await supabase
    .from("scrutins_import")
    .delete()
    .neq("id_an", "");
  if (del1) console.error("❌ Erreur purge scrutins_import :", del1.message);

  const { error: del2 } = await supabase
    .from("scrutins_raw")
    .delete()
    .neq("id_an", "");
  if (del2) console.error("❌ Erreur purge scrutins_raw :", del2.message);
}

async function upsertBatched(table, rows, { batchSize, label }) {
  let ok = 0;
  let ko = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);

    const { error } = await supabase.from(table).upsert(batch, {
      onConflict: "id_an",
    });

    if (error) {
      ko += batch.length;
      console.error(`❌ Erreur upsert ${label} (batch ${i}-${i + batch.length - 1}) :`, error.message);
      continue;
    }

    ok += batch.length;

    // petit log de progression
    if ((i / batchSize) % 10 === 0) {
      console.log(`   ↳ ${label} progress: ${Math.min(i + batch.length, rows.length)}/${rows.length}`);
    }
  }

  return { ok, ko };
}

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

  await purgeIfAsked();

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

    let scrutinsInFile = [];
    if (parsed?.scrutins?.scrutin) {
      scrutinsInFile = toArray(parsed.scrutins.scrutin);
    } else if (parsed?.scrutin) {
      scrutinsInFile = toArray(parsed.scrutin);
    } else if (Array.isArray(parsed)) {
      scrutinsInFile = parsed;
    }

    for (const s of scrutinsInFile) {
      if (s) allScrutins.push(s);
    }
  }

  console.log("📊 Nombre total de scrutins extraits (brut) :", allScrutins.length);

  // ✅ Filtrage L17
  const scrutins17 = allScrutins.filter((s) => {
    const id_an = s?.uid || s?.code || s?.idScrutin || s?.scrutinId || s?.id || "";
    return typeof id_an === "string" && id_an.includes(`L${LEGISLATURE}`);
  });

  console.log("🎯 Scrutins gardés après filtre L17 :", scrutins17.length);

  if (scrutins17.length === 0) {
    console.log("⚠️ Aucun scrutin L17 trouvé (ZIP inattendu ?).");
    return;
  }

  const rowsImport = [];
  const rowsRaw = [];
  let koMap = 0;

  for (const s of scrutins17) {
    try {
      const id_an = s?.uid || s?.code || s?.idScrutin || s?.scrutinId || s?.id || null;
      if (!id_an) {
        koMap++;
        continue;
      }

      const titre = s.titre ?? s.libelle ?? s.intitule ?? null;

      let objet = s.objet ?? s.objetVote ?? null;
      if (objet && typeof objet === "object" && objet.libelle) objet = objet.libelle;

      const type_texte =
        (s.typeVote && (s.typeVote.libelleTypeVote || s.typeVote.codeTypeVote)) ||
        s.typeVote ||
        s.typeScrutin ||
        null;

      const { kind, article_ref } = inferScrutinKind({
        titre: titre || "",
        objet: objet || "",
        type_texte: type_texte || "",
      });

      const group_key = computeLoiGroupKey(titre ?? "", objet ?? "", type_texte ?? "");
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

      // ✅ raw allégé (sinon timeout)
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
        raw: makeRawLight(s),
      });
    } catch (e) {
      koMap++;
      console.error("❌ Exception mapping scrutin :", e?.message ?? e);
    }
  }

  console.log("💾 Upsert scrutins_import + scrutins_raw (batch)…");
  console.log(`   rowsImport=${rowsImport.length} | rowsRaw=${rowsRaw.length} | mapErrors=${koMap}`);

  // ✅ scrutins_import peut être gros
  const IMPORT_BATCH = 500;
  // ✅ scrutins_raw DOIT être plus petit (sinon timeout)
  const RAW_BATCH = 50;

  const imp = await upsertBatched("scrutins_import", rowsImport, {
    batchSize: IMPORT_BATCH,
    label: "scrutins_import",
  });

  const raw = await upsertBatched("scrutins_raw", rowsRaw, {
    batchSize: RAW_BATCH,
    label: "scrutins_raw",
  });

  console.log("\n📌 Résumé upserts :");
  console.log(`   scrutins_import : ${imp.ok} OK, ${imp.ko} KO`);
  console.log(`   scrutins_raw    : ${raw.ok} OK, ${raw.ko} KO`);
  console.log(`   mapping errors  : ${koMap}`);

  const totalKo = imp.ko + raw.ko + koMap;
  console.log(`\n✅ Import terminé : ${imp.ok} lignes OK (scrutins_import), ${totalKo} problèmes (voir logs).`);
  console.log("ℹ️ Prochaine étape : sync scrutins_data / vues (si ton pipeline le fait déjà).");
}

main().catch((e) => {
  console.error("❌ Erreur fatale :", e);
  process.exit(1);
});
