/**
 * ingestion/lois/fetch_dossiers_legislatifs.cjs
 *
 * Lit ingestion/data/dossiers_legislatifs.json.zip
 * et upsert dans la table "lois" (onConflict: id_dossier).
 *
 * Objectifs :
 * - Import idempotent (upsert)
 * - ZIP mixte: contient aussi des "document" -> on les ignore proprement
 * - Détection legislature robuste
 * - Résumé clair (insérés/mis à jour vs ignorés + raisons)
 *
 * ENV (ingestion/.env) :
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY (ou SUPABASE_SERVICE_ROLE)
 *
 * Optionnels :
 * - DOSSIERS_ONLY_LEG=17          (filtre legislature, ex: "17")
 *   (alias accepté : ONLY_LEG=17)
 * - CLEAN_PARCOURS=1
 * - UPSERT_BATCH_SIZE=500
 * - DEBUG_SAMPLES=3               (nb d'exemples loggés pour certains ignores)
 */

const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");
const { createClient } = require("@supabase/supabase-js");

require("dotenv").config({
  path: path.join(__dirname, "..", ".env"),
});

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "❌ SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant dans ingestion/.env (fetch_dossiers_legislatifs)"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const ZIP_REL_PATH = path.join("..", "data", "dossiers_legislatifs.json.zip");

function asString(x) {
  if (x === null || x === undefined) return null;
  if (typeof x === "string") return x;
  if (typeof x === "number") return String(x);
  return null;
}

function keysOrType(x) {
  if (!x) return null;
  if (Array.isArray(x)) return `Array(len=${x.length})`;
  if (typeof x === "object") return Object.keys(x);
  return typeof x;
}

function pickDossierRoot(json) {
  // On ne veut garder que des "dossiers"
  // Variantes possibles :
  return (
    json?.dossierParlementaire ||
    json?.dossierLegislatif ||
    json?.dossierLegislatifAN ||
    json?.dossier ||
    null
  );
}

function resolveLegislature(d) {
  const leg =
    d?.legislature ??
    d?.legislatureInitiale ??
    d?.titreDossier?.legislature ??
    d?.procedureParlementaire?.legislature ??
    d?.raw?.legislature ??
    null;

  return leg !== null && leg !== undefined ? String(leg) : null;
}

function resolveTitre(d) {
  return (
    d?.titre ||
    d?.intitule ||
    d?.titreDossier ||
    d?.titreDossier?.titre ||
    d?.titreDossier?.intitule ||
    "Titre inconnu"
  );
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  console.log("🚀 Import dossiers législatifs démarré...");

  const zipPath = path.join(__dirname, ZIP_REL_PATH);
  if (!fs.existsSync(zipPath)) {
    console.log("❌ ZIP introuvable :", zipPath);
    console.log("➡ Mets le fichier ZIP dans ingestion\\data avec ce nom.");
    process.exit(1);
  }

  const onlyLegRaw = process.env.DOSSIERS_ONLY_LEG ?? process.env.ONLY_LEG ?? null;
  const onlyLeg = onlyLegRaw ? String(onlyLegRaw) : null;

  const cleanParcours = process.env.CLEAN_PARCOURS === "1";
  const batchSize = Number(process.env.UPSERT_BATCH_SIZE || "500");
  const debugSamplesMax = Number(process.env.DEBUG_SAMPLES || "3");

  const ignoredBreakdown = {
    bad_json: 0,
    document_file: 0,        // ✅ nouveau: fichiers "document"
    not_a_dossier: 0,         // ✅ nouveau: racine inconnue
    missing_uid: 0,
    missing_leg: 0,
    leg_not_target: 0,
  };

  let debugDocumentLeft = debugSamplesMax;
  let debugNotDossierLeft = debugSamplesMax;
  let debugMissingUidLeft = debugSamplesMax;

  const zipData = fs.readFileSync(zipPath);
  const zip = await JSZip.loadAsync(zipData);

  const jsonFiles = Object.keys(zip.files).filter((f) => f.endsWith(".json"));
  console.log(`📁 Fichiers JSON trouvés dans le ZIP : ${jsonFiles.length}`);

  let loggedExample = false;

  let scanned = 0;
  let ignoredTotal = 0;
  let prepared = 0;
  let upserted = 0;
  let parcoursDeleted = 0;

  const rowsToUpsert = [];

  for (const jsonFile of jsonFiles) {
    scanned++;

    const content = await zip.files[jsonFile].async("string");

    let json;
    try {
      json = JSON.parse(content);
    } catch {
      ignoredBreakdown.bad_json++;
      ignoredTotal++;
      continue;
    }

    // ✅ 1) Filtre explicite : si c'est un "document", on ignore proprement
    if (json && typeof json === "object" && json.document) {
      ignoredBreakdown.document_file++;
      ignoredTotal++;

      if (debugDocumentLeft > 0) {
        debugDocumentLeft--;
        console.log("🧪 ignored: document_file sample");
        console.log(
          JSON.stringify(
            {
              jsonFile,
              jsonRootKeys: keysOrType(json),
              documentKeys: keysOrType(json.document),
            },
            null,
            2
          )
        );
      }
      continue;
    }

    // ✅ 2) On ne prend que les dossiers (sinon: not_a_dossier)
    const d = pickDossierRoot(json);
    if (!d || typeof d !== "object") {
      ignoredBreakdown.not_a_dossier++;
      ignoredTotal++;

      if (debugNotDossierLeft > 0) {
        debugNotDossierLeft--;
        console.log("🧪 ignored: not_a_dossier sample");
        console.log(
          JSON.stringify(
            {
              jsonFile,
              jsonRootKeys: keysOrType(json),
            },
            null,
            2
          )
        );
      }
      continue;
    }

    if (!loggedExample) {
      console.log("🔎 Exemple dossier (clés) :", Object.keys(d));
      loggedExample = true;
    }

    const idCandidateUid = asString(d?.uid);
    const idCandidateIdDossier = asString(d?.idDossier);
    const idCandidateId = asString(d?.id);

    const id_dossier = idCandidateUid || idCandidateIdDossier || idCandidateId;

    if (!id_dossier) {
      ignoredBreakdown.missing_uid++;
      ignoredTotal++;

      if (debugMissingUidLeft > 0) {
        debugMissingUidLeft--;
        console.log("🧪 ignored: missing_uid sample");
        console.log(
          JSON.stringify(
            {
              jsonFile,
              jsonRootKeys: keysOrType(json),
              pickedRootKeys: keysOrType(d),
              uid_idDossier_id: {
                uid: idCandidateUid,
                idDossier: idCandidateIdDossier,
                id: idCandidateId,
              },
            },
            null,
            2
          )
        );
      }
      continue;
    }

    const legislature = resolveLegislature(d);
    if (!legislature) {
      ignoredBreakdown.missing_leg++;
      ignoredTotal++;
      continue;
    }

    if (onlyLeg && legislature !== onlyLeg) {
      ignoredBreakdown.leg_not_target++;
      ignoredTotal++;
      continue;
    }

    const titre = resolveTitre(d);

    const loiRow = {
      id_dossier,
      legislature,
      numero_depot: asString(d?.numeroDepot || d?.numero) || null,
      type_texte:
        asString(d?.typeTexte || d?.nature || d?.procedureParlementaire?.libelle) ||
        null,
      titre,
      origine:
        asString(d?.origine || d?.initiateur || d?.procedureParlementaire?.code) ||
        null,
      auteur_principal:
        asString(
          d?.auteur ||
            d?.auteurs ||
            d?.initiateur?.acteurs?.acteur?.acteurRef ||
            d?.initiateur?.acteurs?.acteurRef
        ) || null,
      commission_saisie:
        asString(d?.commission || d?.commissionSaisie || d?.organeRef) || null,
      url_dossier_an: asString(d?.urlDossier || d?.url) || null,
      url_texte_principal: asString(d?.urlTexte) || null,
      url_legifrance: asString(d?.urlLegifrance) || null,
      etat_courant: asString(d?.etat || d?.etatDossier) || null,
      date_depot: asString(d?.dateDepot) || null,
      date_premiere_lecture_an:
        asString(d?.datePremiere_lecture_an || d?.datePremiereLectureAN) || null,
      date_premiere_lecture_senat:
        asString(d?.datePremiere_lecture_senat || d?.datePremiereLectureSenat) ||
        null,
      date_adoption_definitive: asString(d?.dateAdoption) || null,
      date_promulgation: asString(d?.datePromulgation) || null,
      raw: d,
    };

    rowsToUpsert.push(loiRow);
    prepared++;
  }

  const batches = chunk(rowsToUpsert, batchSize);
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];

    const { error } = await supabase.from("lois").upsert(batch, {
      onConflict: "id_dossier",
    });

    if (error) {
      console.error("❌ Erreur upsert batch", i + 1, "/", batches.length, error);
      process.exit(1);
    }

    upserted += batch.length;

    if (cleanParcours) {
      const ids = batch.map((x) => x.id_dossier);
      const { error: delErr } = await supabase
        .from("lois_parcours")
        .delete()
        .in("id_dossier", ids);

      if (delErr) {
        console.warn("⚠️ Erreur delete lois_parcours batch:", delErr);
      } else {
        parcoursDeleted += ids.length;
      }
    }
  }

  console.log("📊 Résumé import dossiers");
  console.log(
    JSON.stringify(
      {
        zipPath,
        onlyLeg,
        scannedJsonFiles: scanned,
        preparedRows: prepared,
        insertedOrUpdated: upserted,
        ignoredJsonFiles: ignoredTotal,
        ignoredBreakdown,
        cleanParcours,
        parcoursDeleted,
        debug: {
          documentSamplesLogged: debugSamplesMax - debugDocumentLeft,
          notDossierSamplesLogged: debugSamplesMax - debugNotDossierLeft,
          missingUidSamplesLogged: debugSamplesMax - debugMissingUidLeft,
        },
      },
      null,
      2
    )
  );

  console.log(
    `🎉 Import terminé, ${upserted} dossiers insérés/mis à jour. (${ignoredTotal} ignorés)`
  );
}

main().catch((e) => {
  console.error("💥 Erreur fetch_dossiers_legislatifs:", e);
  process.exit(1);
});
