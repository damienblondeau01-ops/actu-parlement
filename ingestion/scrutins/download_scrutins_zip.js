// ingestion/download_scrutins_zip.js
// Télécharge automatiquement Scrutins.json.zip depuis l'Assemblée nationale
// et le place dans ingestion/data/Scrutins.json.zip

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

// URL actuelle des scrutins JSON (16e législature / lois / scrutins)
const SCRUTINS_ZIP_URL =
  "http://data.assemblee-nationale.fr/static/openData/repository/17/loi/scrutins/Scrutins.json.zip";

// Dossier et chemin de destination (là où ton script fetch_scrutins_from_local_zip.js lit le fichier)
const DEST_DIR = path.join(__dirname, "data");
const DEST_FILE = path.join(DEST_DIR, "Scrutins.json.zip");

function getHttpModule(url) {
  return url.startsWith("https") ? https : http;
}

async function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const httpModule = getHttpModule(url);

    // S'assurer que le dossier existe
    if (!fs.existsSync(DEST_DIR)) {
      fs.mkdirSync(DEST_DIR, { recursive: true });
    }

    const file = fs.createWriteStream(destPath);

    const request = httpModule.get(url, (res) => {
      // Gestion des redirections éventuelles
      if (
        res.statusCode >= 300 &&
        res.statusCode < 400 &&
        res.headers.location
      ) {
        console.log("↪️ Redirection vers :", res.headers.location);
        const redirectedModule = getHttpModule(res.headers.location);
        redirectedModule
          .get(res.headers.location, (res2) => {
            if (res2.statusCode !== 200) {
              reject(
                new Error(
                  `HTTP ${res2.statusCode} après redirection : ${res2.statusMessage}`
                )
              );
              return;
            }
            res2.pipe(file);
            res2.on("end", () => {
              file.close(() => resolve());
            });
          })
          .on("error", (err) => {
            reject(err);
          });
        return;
      }

      if (res.statusCode !== 200) {
        reject(
          new Error(
            `HTTP ${res.statusCode} : ${res.statusMessage} pour l'URL ${url}`
          )
        );
        return;
      }

      res.pipe(file);

      res.on("end", () => {
        file.close(() => resolve());
      });
    });

    request.on("error", (err) => {
      reject(err);
    });
  });
}

async function main() {
  console.log("🚀 Téléchargement de Scrutins.json.zip…");
  console.log("URL :", SCRUTINS_ZIP_URL);
  console.log("Destination :", DEST_FILE);

  try {
    await downloadFile(SCRUTINS_ZIP_URL, DEST_FILE);

    const stats = fs.statSync(DEST_FILE);
    console.log("✅ ZIP téléchargé avec succès.");
    console.log("📦 Taille :", stats.size, "octets");

    if (stats.size < 5_000_000) {
      console.warn(
        "⚠️ Attention : le fichier fait moins de 5 Mo, ce qui semble faible pour tous les scrutins."
      );
    }
  } catch (err) {
    console.error("❌ Erreur pendant le téléchargement :", err.message);
  }
}

main();
