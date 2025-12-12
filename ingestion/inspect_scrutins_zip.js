const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");

// même emplacement que fetch_votes_from_opendata.js
const ZIP_PATH = path.join(__dirname, "data", "Scrutins.json.zip");

const toArray = (x) => {
  if (!x) return [];
  return Array.isArray(x) ? x : [x];
};

function parseAllScrutinsFromZip() {
  if (!fs.existsSync(ZIP_PATH)) {
    console.error("❌ ZIP introuvable :", ZIP_PATH);
    process.exit(1);
  }

  const stats = fs.statSync(ZIP_PATH);
  console.log("💾 ZIP trouvé :", ZIP_PATH, "taille =", stats.size, "octets");

  const zip = new AdmZip(ZIP_PATH);
  const entries = zip.getEntries();
  console.log("📦 Fichiers dans le ZIP :", entries.length);

  const all = [];

  for (const entry of entries) {
    if (!entry.entryName.toLowerCase().endsWith(".json")) continue;

    const text = entry.getData().toString("utf8");

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      console.warn("⚠️ JSON invalide :", entry.entryName);
      continue;
    }

    let scrutinsInFile = [];

    if (parsed.scrutins && parsed.scrutins.scrutin) {
      scrutinsInFile = toArray(parsed.scrutins.scrutin);
    } else if (parsed.scrutin) {
      scrutinsInFile = toArray(parsed.scrutin);
    } else if (Array.isArray(parsed)) {
      scrutinsInFile = parsed;
    }

    for (const s of scrutinsInFile) {
      if (s) all.push(s);
    }
  }

  return all;
}

function main() {
  const scrutins = parseAllScrutinsFromZip();
  console.log("🧮 Nombre total de scrutins dans le ZIP :", scrutins.length);

  if (scrutins.length === 0) {
    console.log("⚠️ Aucun scrutin trouvé, format inattendu.");
    return;
  }

  // max numero
  const numeros = scrutins
    .map((s) => parseInt(s.numero || s.numeroScrutin || "0", 10))
    .filter((n) => !Number.isNaN(n));

  const dates = scrutins
    .map((s) => s.dateScrutin || s.date || null)
    .filter(Boolean);

  const maxNumero = Math.max(...numeros);
  const maxDate =
    dates.length > 0 ? dates.sort((a, b) => (a < b ? 1 : -1))[0] : null;

  console.log("🔢 Numero max trouvé dans le ZIP :", maxNumero);
  console.log("📅 Date max trouvée dans le ZIP   :", maxDate);

  // petit test ciblé : est-ce qu'on a le scrutin 4696 ?
  const has4696 = scrutins.some(
    (s) => String(s.numero || s.numeroScrutin) === "4696"
  );
  console.log("🔍 Scrutin n°4696 présent dans le ZIP ? ", has4696 ? "✅ OUI" : "❌ NON");
}

main();
