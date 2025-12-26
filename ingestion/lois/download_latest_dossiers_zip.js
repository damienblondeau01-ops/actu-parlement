// jobs/download_latest_dossiers_zip.js
// Télécharge Dossiers_Legislatifs.json.zip (leg 18/17/16) -> ingestion/data/dossiers_legislatifs.json.zip
// Skip si ETag/Last-Modified identique (cache local + optionnel Supabase table plus tard)

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const OUT_PATH = path.join(__dirname, "..", "ingestion", "data", "dossiers_legislatifs.json.zip");
const CACHE_PATH = path.join(__dirname, "..", "ingestion", "data", "dossiers_legislatifs.cache.json");

const BASE = "https://data.assemblee-nationale.fr/static/openData/repository";

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function readCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
  } catch {
    return {};
  }
}

function writeCache(obj) {
  fs.writeFileSync(CACHE_PATH, JSON.stringify(obj, null, 2), "utf8");
}

async function head(url) {
  const res = await fetch(url, { method: "HEAD" });
  return res;
}

async function download(url, outPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);

  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, buf);

  const md5 = crypto.createHash("md5").update(buf).digest("hex");
  return { bytes: buf.length, md5 };
}

function buildUrl(leg) {
  return `${BASE}/${leg}/loi/dossiers_legislatifs/Dossiers_Legislatifs.json.zip`;
}

async function pickLatestLegislature(legs = [18, 17, 16]) {
  for (const leg of legs) {
    const url = buildUrl(leg);
    const res = await head(url);
    if (res.ok) {
      return { leg, url, headers: res.headers };
    }
  }
  throw new Error("Aucun ZIP Dossiers_Legislatifs trouvable pour 18/17/16");
}

async function main() {
  ensureDir(path.dirname(OUT_PATH));

  const cache = readCache();
  const { leg, url, headers } = await pickLatestLegislature();

  const etag = headers.get("etag") || null;
  const lastModified = headers.get("last-modified") || null;

  const cacheKey = `dossiers_legislatifs_leg_${leg}`;
  const prev = cache[cacheKey] || {};

  const same =
    (etag && prev.etag && etag === prev.etag) ||
    (lastModified && prev.lastModified && lastModified === prev.lastModified);

  console.log("[DOSSIERS] latestLeg =", leg);
  console.log("[DOSSIERS] url       =", url);
  console.log("[DOSSIERS] etag      =", etag);
  console.log("[DOSSIERS] lastMod   =", lastModified);
  console.log("[DOSSIERS] cacheHit? =", !!same);

  if (same && fs.existsSync(OUT_PATH)) {
    console.log("[DOSSIERS] ✅ inchangé -> skip download");
    process.exit(0);
  }

  console.log("[DOSSIERS] ⬇️ download...");
  const { bytes, md5 } = await download(url, OUT_PATH);
  console.log("[DOSSIERS] ✅ saved", OUT_PATH, `(${bytes} bytes) md5=${md5}`);

  cache[cacheKey] = {
    etag,
    lastModified,
    md5,
    savedAt: new Date().toISOString(),
    url,
    leg,
  };
  // on garde aussi un pointeur "current"
  cache.current = cache[cacheKey];

  writeCache(cache);
  console.log("[DOSSIERS] ✅ cache updated:", CACHE_PATH);
}

main().catch((e) => {
  console.error("[DOSSIERS] ❌", e?.message || e);
  process.exit(1);
});
