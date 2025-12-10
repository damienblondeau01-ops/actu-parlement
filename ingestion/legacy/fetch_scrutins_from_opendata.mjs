// ingestion/fetch_scrutins_from_opendata.mjs

import "dotenv/config";
import fetch from "node-fetch";
import AdmZip from "adm-zip";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

// ----- CONFIG SUPABASE -----
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

console.log("DEBUG SUPABASE_URL =", SUPABASE_URL);
console.log("DEBUG SUPABASE_KEY présent ?", SUPABASE_KEY ? "✅ oui" : "❌ non");

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Manque EXPO_PUBLIC_SUPABASE_URL ou SUPABASE KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// URL OpenData
const ZIP_URL =
  "http://data.assemblee-nationale.fr/static/openData/repository/17/loi/scrutins/Scrutins.json.zip";

/** Convertit un stream Node → Buffer (sans arrayBuffer) */
function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

async function main() {
  console.log("📥 Téléchargement de Scrutins.json.zip…");

  const res = await fetch(ZIP_URL);

  console.log("   HTTP status =", res.status);

  if (!res.ok) {
    console.error("❌ Erreur HTTP :", res.status);
    return;
  }

  console.log("   ➜ Conversion stream → buffer…");

  // 🔥 Remplace arrayBuffer() par streamToBuffer()
  const buffer = await streamToBuffer(res.body);

  console.log("   ✅ Buffer reçu, taille =", buffer.length);

  // On écrit un zip de debug
  try {
    fs.writeFileSync("Scrutins_debug.zip", buffer);
    console.log("   💾 Scrutins_debug.zip écrit");
  } catch (e) {
    console.error("❌ Erreur écriture fichier :", e);
  }

  console.log("   ➜ Lecture du ZIP…");
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();

  console.log("📂 Nombre de fichiers dans le ZIP :", entries.length);

  if (!entries.length) {
    console.error("❌ ZIP vide");
    return;
  }

  const entry = entries[0];
  console.log("📄 JSON trouvé :", entry.entryName);

  const jsonText = entry.getData().toString("utf8");

  console.log("🔍 Aperçu JSON (500 chars) :");
  console.log(jsonText.slice(0, 500));

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    console.error("❌ JSON.parse error :", e);
    return;
  }

  console.log("🔑 Clés racine :", Object.keys(parsed));

  const allScrutins = Array.isArray(parsed)
    ? parsed
    : parsed.scrutins || parsed.Scrutins || parsed.scrutin || [];

  console.log("📊 Nombre total de scrutins :", allScrutins.length);

  // On affiche les 3 premiers pour vérifier
  console.log("👀 Exemple des 3 premiers scrutins :");
  allScrutins.slice(0, 3).forEach((s, i) => {
    console.log(`--- Scrutin #${i + 1} ---`);
    console.log(JSON.stringify(s, null, 2).slice(0, 600));
  });

  console.log("🎉 Debug terminé. Import désactivé pour le moment.");
}

main().catch((e) => console.error("❌ Fatal error :", e));
