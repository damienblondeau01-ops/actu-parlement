// ingestion/fetch_scrutins_from_opendata_http.js

require("dotenv").config();
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");

const ZIP_URL =
  "https://data.assemblee-nationale.fr/static/openData/repository/17/loi/scrutins/Scrutins.json.zip";

const DATA_DIR = path.join(__dirname, "data");
const ZIP_PATH = path.join(DATA_DIR, "Scrutins.json.zip");

async function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log("📂 Dossier créé :", DATA_DIR);
  }
}

function downloadViaCurl() {
  return new Promise((resolve, reject) => {
    console.log("📥 Téléchargement via curl.exe…");

    // -L : suivre les redirections
    // -o : chemin de sortie
    const args = ["-L", "-o", ZIP_PATH, ZIP_URL];

    const child = execFile("curl.exe", args, (error, stdout, stderr) => {
      if (error) {
        console.error("❌ Erreur curl.exe :", error.message);
        if (stderr && stderr.trim().length > 0) {
          console.error("STDERR:", stderr);
        }
        return reject(error);
      }
      if (stderr && stderr.trim().length > 0) {
        console.warn("⚠️ STDERR curl.exe:", stderr);
      }
      console.log("✅ Téléchargement terminé (curl.exe).");
      resolve();
    });
  });
}

async function main() {
  console.log("🚀 fetch_scrutins_from_opendata_http.js (mode curl) démarré");

  await ensureDataDir();

  try {
    await downloadViaCurl();
  } catch (e) {
    console.error("❌ Échec du téléchargement :", e);
    return;
  }

  if (!fs.existsSync(ZIP_PATH)) {
    console.error("❌ Fichier ZIP introuvable après téléchargement :", ZIP_PATH);
    return;
  }

  const stats = fs.statSync(ZIP_PATH);
  console.log("💾 Fichier téléchargé, taille =", stats.size, "octets");

  // Tentative d'ouverture avec AdmZip
  try {
    const zip = new AdmZip(ZIP_PATH);
    const entries = zip.getEntries();
    console.log("📦 Nombre de fichiers dans le ZIP :", entries.length);
    if (entries.length > 0) {
      console.log("📄 Exemple de fichier dans le ZIP :", entries[0].entryName);
    }
    console.log("✅ ZIP valide (AdmZip).");
  } catch (e) {
    console.error("❌ Erreur ouverture ZIP (AdmZip) :", e.message);

    try {
      const raw = fs.readFileSync(ZIP_PATH);
      const asText = raw.toString("utf8");
      console.log("🔎 Aperçu du fichier (300 premiers caractères) :");
      console.log("--------------------------------------------------");
      console.log(asText.slice(0, 300));
      console.log("--------------------------------------------------");
    } catch (e2) {
      console.error("❌ Impossible de lire le fichier en texte :", e2.message);
    }
  }

  console.log("🏁 Fin du script fetch_scrutins_from_opendata_http.js (mode curl).");
}

main();
