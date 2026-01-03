// ingestion/fetch_jo_legifrance.cjs
// But: retrouver la date de publication au JO sur Légifrance à partir d'un titre ou d'un NOR/ID si dispo
// Usage (MVP): node ingestion/fetch_jo_legifrance.cjs "<query>" --dry

const process = require("node:process");

function cleanSpaces(s) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

// dd/mm/yyyy -> yyyy-mm-dd
function toISODateMaybe(x) {
  const s = cleanSpaces(x);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const dd = String(m[1]).padStart(2, "0");
  const mm = String(m[2]).padStart(2, "0");
  const yyyy = m[3];
  return `${yyyy}-${mm}-${dd}`;
}

async function fetchText(url) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": "ActuDesLoisBot/1.0",
      accept: "text/html",
    },
  });
  if (!res.ok) throw new Error("HTTP " + String(res.status));
  return await res.text();
}

// MVP : utilise la recherche interne Legifrance (HTML) et extrait "JORF du dd/mm/yyyy"
async function findJoDateFromLegifranceSearch(query) {
  const q = encodeURIComponent(cleanSpaces(query));
  const url = `https://www.legifrance.gouv.fr/search/all?tab_selection=all&searchField=ALL&query=${q}`;

  const html = await fetchText(url);

  // 1) Cherche motif JORF du 31/12/2025 (varie)
  const m = html.match(/JORF\s+du\s+(\d{1,2}\/\d{1,2}\/\d{4})/i);
  if (m) return toISODateMaybe(m[1]);

  // 2) fallback: "du 31/12/2025" proche de JORF
  const m2 = html.match(/JORF[\s\S]{0,120}?(\d{1,2}\/\d{1,2}\/\d{4})/i);
  if (m2) return toISODateMaybe(m2[1]);

  return null;
}

(async function main() {
  const query = String(process.argv[2] ?? "").trim();
  const isDryRun = process.argv.includes("--dry");

  if (!query) {
    console.error('Usage: node ingestion/fetch_jo_legifrance.cjs "<query>" [--dry]');
    process.exit(1);
  }

  const jo = await findJoDateFromLegifranceSearch(query);
  console.log("[fetch_jo_legifrance] query =", query);
  console.log("[fetch_jo_legifrance] jo_date =", jo);

  if (isDryRun) return;
})().catch((e) => {
  console.error("[fetch_jo_legifrance] ERROR", e?.message || e);
  process.exit(1);
});
