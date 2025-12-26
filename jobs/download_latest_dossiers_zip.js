/**
 * jobs/download_latest_dossiers_zip.js
 *
 * Télécharge le ZIP des dossiers législatifs vers :
 *   ingestion/data/dossiers_legislatifs.json.zip
 *
 * ENV:
 * - DOSSIERS_ZIP_URL (obligatoire)
 * - FORCE_DOWNLOAD=1 (optionnel)
 */

const fs = require("fs");
const path = require("path");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");

function mustEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`❌ Variable manquante: ${name}`);
    process.exit(1);
  }
  return v;
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function readJsonIfExists(p) {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8");
}

async function head(url) {
  const res = await fetch(url, { method: "HEAD" });
  if (!res.ok) throw new Error(`HEAD ${url} -> ${res.status} ${res.statusText}`);
  return {
    etag: res.headers.get("etag"),
    lastModified: res.headers.get("last-modified"),
    contentLength: res.headers.get("content-length"),
  };
}

async function download(url, outPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);

  const tmpPath = outPath + ".tmp";

  // ✅ Méthode simple et 100% compatible (Web stream -> ArrayBuffer)
  const ab = await res.arrayBuffer();
  fs.writeFileSync(tmpPath, Buffer.from(ab));

  fs.renameSync(tmpPath, outPath);
}

async function main() {
  const url = mustEnv("DOSSIERS_ZIP_URL");
  const force = process.env.FORCE_DOWNLOAD === "1";

  const outDir = path.join(process.cwd(), "ingestion", "data");
  ensureDir(outDir);

  const outZip = path.join(outDir, "dossiers_legislatifs.json.zip");
  const metaPath = outZip + ".meta.json";

  console.log("⬇️  Dossiers ZIP URL =", url);
  console.log("📦 Output ZIP =", outZip);

  let remoteMeta = null;
  try {
    remoteMeta = await head(url);
    console.log("🌐 Remote meta:", remoteMeta);
  } catch (e) {
    console.warn("⚠️ HEAD impossible (on tente quand même GET). Détail:", e.message);
  }

  const localMeta = readJsonIfExists(metaPath);

  if (!force && remoteMeta && localMeta && fs.existsSync(outZip)) {
    const sameEtag =
      remoteMeta.etag && localMeta.etag && remoteMeta.etag === localMeta.etag;
    const sameLastModified =
      remoteMeta.lastModified &&
      localMeta.lastModified &&
      remoteMeta.lastModified === localMeta.lastModified;

    if (sameEtag || sameLastModified) {
      console.log("✅ ZIP déjà à jour (ETag/Last-Modified identiques). Skip download.");
      return;
    }
  }

  console.log("⬇️  Download en cours...");
  await download(url, outZip);
  console.log("✅ Download OK.");

  const metaToSave = {
    downloadedAt: new Date().toISOString(),
    url,
    ...(remoteMeta || {}),
  };
  writeJson(metaPath, metaToSave);
  console.log("📝 Meta saved:", metaPath);
}

main().catch((e) => {
  console.error("💥 Erreur download_latest_dossiers_zip:", e);
  process.exit(1);
});
