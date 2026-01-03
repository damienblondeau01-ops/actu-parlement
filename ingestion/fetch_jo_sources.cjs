// ingestion/fetch_jo_sources.cjs
// But: retrouver une date de publication JO sans dépendre du scraping Légifrance (403 possible).
// Strategy: try Legifrance (best effort) -> fallback Vie-publique (souvent dispo et non bloqué).
// Usage:
//   node ingestion/fetch_jo_sources.cjs "<query>" --dry [--debug]

const process = require("node:process");

function cleanSpaces(s) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

function normLower(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function toISODateFromDDMMYYYY(ddmmyyyy) {
  const m = String(ddmmyyyy ?? "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
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
      "accept-language": "fr-FR,fr;q=0.9,en;q=0.8",
    },
  });

  // ✅ on ne plante pas tout si 403
  if (res.status === 403) return { status: 403, text: null };
  if (!res.ok) throw new Error("HTTP " + String(res.status));
  return { status: res.status, text: await res.text() };
}

// Best effort Legifrance HTML (souvent 403 => ignore)
async function tryLegifranceSearch(query) {
  const q = encodeURIComponent(cleanSpaces(query));
  const url = `https://www.legifrance.gouv.fr/search/all?tab_selection=all&searchField=ALL&query=${q}`;
  const { status, text } = await fetchText(url);
  if (status === 403 || !text) return null;

  const m = text.match(/JORF\s+du\s+(\d{1,2}\/\d{1,2}\/\d{4})/i);
  if (m) return toISODateFromDDMMYYYY(m[1]);

  const m2 = text.match(/JORF[\s\S]{0,140}?(\d{1,2}\/\d{1,2}\/\d{4})/i);
  if (m2) return toISODateFromDDMMYYYY(m2[1]);

  return null;
}

async function findViePubliqueLoiUrlViaDDG(query, isDebug) {
  const q = encodeURIComponent(
    cleanSpaces(query) + " site:vie-publique.fr/loi/"
  );
  const url = `https://duckduckgo.com/html/?q=${q}`;

  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ActuDesLoisBot/1.0",
      accept: "text/html",
      "accept-language": "fr-FR,fr;q=0.9,en;q=0.8",
    },
  });

  const status = res.status;
  const text = res.ok ? await res.text() : null;

  if (isDebug) {
    console.log("[ddg] status =", status);
    console.log("[ddg] bytes =", text ? text.length : 0);
  }

  // ✅ DDG renvoie souvent 202 (challenge) => HTML sans résultats
  if (status === 202) return null;
  if (status === 403 || !text) return null;

  // direct URL (rare)
  const direct = text.match(
    /https?:\/\/www\.vie-publique\.fr\/loi\/\d+[-/][^"'<>\s)]+/i
  );
  if (direct) return direct[0];

  // redirect DDG (uddg=), si jamais
  const hrefRe = /href=(["'])(.*?)\1/gi;
  let h;
  while ((h = hrefRe.exec(text)) !== null) {
    const href = String(h[2] || "").replace(/&amp;/g, "&");
    if (href.includes("uddg=")) {
      const mU = href.match(/uddg=([^&]+)/i);
      if (!mU) continue;
      try {
        const decoded = decodeURIComponent(mU[1]);
        if (/^https?:\/\/www\.vie-publique\.fr\/loi\/\d+/i.test(decoded)) {
          return decoded;
        }
      } catch {}
    }
  }

  return null;
}

async function findViePubliqueLoiUrlViaMojeek(query, isDebug) {
  // Mojeek HTML (souvent plus “scrapable”)
  const q = encodeURIComponent(
    cleanSpaces(query) + " site:vie-publique.fr/loi/"
  );
  const url = `https://www.mojeek.com/search?q=${q}`;

  const { status, text } = await fetchText(url);
  if (isDebug) {
    console.log("[mojeek] status =", status);
    console.log("[mojeek] bytes =", text ? text.length : 0);
  }
  if (!text) return null;

    if (isDebug) {
    const hrefs = [];
    const hrefReDbg = /href=(["'])(.*?)\1/gi;
    let hh;
    while ((hh = hrefReDbg.exec(text)) !== null) {
      const href = String(hh[2] || "").replace(/&amp;/g, "&");
      if (
        href.includes("mojeek.com") ||
        href.includes("r=") ||
        href.includes("url=") ||
        href.includes("u=") ||
        href.includes("vie-publique") ||
        href.includes("/loi/")
      ) {
        hrefs.push(href);
        if (hrefs.length >= 60) break;
      }
    }
    console.log("[mojeek] hrefs.sample =", hrefs);
  }


  // 1) URL directe (parfois présente)
  const direct = text.match(
    /https?:\/\/www\.vie-publique\.fr\/loi\/\d+[-/][^"'<>\s)]+/i
  );
  if (direct) return direct[0];

  // 2) Certains moteurs mettent les urls dans un param u= (ou similaire) sur un redirect
  const hrefRe = /href=(["'])(.*?)\1/gi;
  let h;
  while ((h = hrefRe.exec(text)) !== null) {
    const href = String(h[2] || "").replace(/&amp;/g, "&");

    // lien direct
    if (/^https?:\/\/www\.vie-publique\.fr\/loi\/\d+/i.test(href)) return href;

    // decode param u= (si présent)
    const mu = href.match(/[?&]u=([^&]+)/i);
    if (mu) {
      try {
        const decoded = decodeURIComponent(mu[1]);
        if (/^https?:\/\/www\.vie-publique\.fr\/loi\/\d+/i.test(decoded)) {
          return decoded;
        }
      } catch {}
    }
  }

  return null;
}

async function findJoViaWikipedia(query, isDebug) {
  // On simplifie la requête: garde "2025-1403" et "sécurité sociale" si présent
  const q0 = cleanSpaces(query);
  const mNum = q0.match(/\b20\d{2}-\d+\b/); // ex: 2025-1403
  const hint = mNum ? `loi ${mNum[0]}` : q0;
  const q = encodeURIComponent(hint);

  // opensearch -> titre page
  const url = `https://fr.wikipedia.org/w/api.php?action=opensearch&search=${q}&limit=5&namespace=0&format=json&origin=*`;
  const r = await fetch(url, {
    headers: {
      "user-agent": "ActuDesLoisBot/1.0",
      accept: "application/json",
    },
  });
  if (!r.ok) return null;

  const data = await r.json();
  const titles = Array.isArray(data) ? data[1] : [];
  if (isDebug) console.log("[wikipedia] titles =", titles);

  if (!Array.isArray(titles) || titles.length === 0) return null;

  // On prend le 1er titre
  const title = String(titles[0] || "").trim();
  if (!title) return null;

  // Récupère l'extrait texte (plain) de l'article
  const url2 = `https://fr.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&exsectionformat=plain&titles=${encodeURIComponent(
    title
  )}&format=json&origin=*`;

  const r2 = await fetch(url2, {
    headers: {
      "user-agent": "ActuDesLoisBot/1.0",
      accept: "application/json",
    },
  });
  if (!r2.ok) return null;

  const data2 = await r2.json();
  const pages = data2?.query?.pages || {};
  const page = Object.values(pages)[0];
  const extract = String(page?.extract || "");

  if (isDebug) console.log("[wikipedia] picked =", title, "extract.bytes=", extract.length);

  if (!extract) return null;

  // Cherche "Journal officiel du 31 décembre 2025" ou "JORF du 31 décembre 2025"
  const low = normLower(extract);

  // format "31 décembre 2025"
  const months = {
    janvier: "01",
    fevrier: "02",
    mars: "03",
    avril: "04",
    mai: "05",
    juin: "06",
    juillet: "07",
    aout: "08",
    septembre: "09",
    octobre: "10",
    novembre: "11",
    decembre: "12",
  };

  const m1 = low.match(/journal officiel\s+du\s+(\d{1,2})\s+([a-z]+)\s+(20\d{2})/i);
  if (m1) {
    const dd = String(m1[1]).padStart(2, "0");
    const mm = months[m1[2]];
    const yyyy = m1[3];
    if (mm) return { jo_date: `${yyyy}-${mm}-${dd}`, source_url: `https://fr.wikipedia.org/wiki/${encodeURIComponent(title)}` };
  }

  // format "dd/mm/yyyy"
  const m2 = low.match(/journal officiel\s+du\s+(\d{1,2}\/\d{1,2}\/20\d{2})/i);
  if (m2) {
    const iso = toISODateFromDDMMYYYY(m2[1]);
    if (iso) return { jo_date: iso, source_url: `https://fr.wikipedia.org/wiki/${encodeURIComponent(title)}` };
  }

  return null;
}

function extractKeywordsForVp(query) {
  const s = normLower(cleanSpaces(query));

  // stopwords ultra simples (suffisant)
  const stop = new Set([
    "loi",
    "n",
    "no",
    "numero",
    "du",
    "de",
    "des",
    "la",
    "le",
    "les",
    "d",
    "l",
    "pour",
    "et",
    "a",
    "au",
    "aux",
    "en",
    "relative",
    "portant",
    "modifiant",
    "article",
    "articles",
    "journal",
    "officiel",
  ]);

  // split mots
  const words = s
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/g)
    .map((w) => w.trim())
    .filter(Boolean);

  // garde mots "significatifs"
  const kept = [];
  for (const w of words) {
    if (w.length < 5) continue;
    if (/^\d+$/.test(w)) continue;
    if (stop.has(w)) continue;
    kept.push(w);
  }

  // dédup + limite
  return Array.from(new Set(kept)).slice(0, 8);
}

async function findViePubliqueLoiUrlViaPanorama(query, isDebug) {
  const url = "https://www.vie-publique.fr/panorama-des-lois";
  const { status, text } = await fetchText(url);
  if (!text) return null;

  const low = normLower(text);
  const keywords = extractKeywordsForVp(query);

  if (isDebug) {
    console.log("[vp-panorama] keywords =", keywords);
    console.log("[vp-panorama] bytes =", text.length);
  }

  // récupère tous les liens /loi/...
  const linkRe = /href="(\/loi\/[^"]+)"/gi;
  const candidates = [];
  let m;
  while ((m = linkRe.exec(text)) !== null) {
    const href = String(m[1] || "");
    if (!href.startsWith("/loi/")) continue;

    // essaie d'attraper un petit contexte autour pour scorer
    const start = Math.max(0, m.index - 180);
    const end = Math.min(text.length, m.index + 260);
    const ctx = normLower(text.slice(start, end));

    let score = 0;
    for (const k of keywords) {
      if (ctx.includes(k)) score += 1;
    }

    candidates.push({ href, score, ctx });
  }

  if (candidates.length === 0) return null;

  // meilleur score
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];

  if (isDebug) {
    console.log("[vp-panorama] best.score =", best.score);
    console.log("[vp-panorama] best.href =", best.href);
  }

  // seuil mini : évite lien random
  if (best.score < 2) return null;

  return "https://www.vie-publique.fr" + best.href;
}


// Fallback Vie-publique: extrait "publiée au Journal officiel du dd/mm/yyyy"
async function findViaViePublique(query, isDebug) {
  // 1) ✅ Panorama des lois (pas de moteur, HTML simple)
  let pageUrl = await findViePubliqueLoiUrlViaPanorama(query, isDebug);

  // 2) (optionnel) si tu veux garder DDG/Mojeek, laisse ton code ici.
  // Perso je conseille : on enlève, mais tu peux garder si tu veux.
  // if (!pageUrl) pageUrl = await findViePubliqueLoiUrlViaDDG(query, isDebug);

  // 3) recherche interne VP (best effort)
  if (!pageUrl) {
    const q = encodeURIComponent(cleanSpaces(query));
    const searchUrl = `https://www.vie-publique.fr/recherche?query=${q}`;
    const { text: searchHtml } = await fetchText(searchUrl);
    if (searchHtml) {
      const m =
        searchHtml.match(/\/loi\/\d+[-/][^"'<>\s)]+/i) ||
        searchHtml.match(/\/loi\/\d+/i);
      if (m) pageUrl = "https://www.vie-publique.fr" + m[0];
    }
  }

  if (isDebug) console.log("[vie-publique] pageUrl =", pageUrl || null);
  if (!pageUrl) return null;

  const { text: pageHtml } = await fetchText(pageUrl);
  if (!pageHtml) return null;

  const low = normLower(pageHtml);

  // 1) dd/mm/yyyy
  let m1 = low.match(/journal officiel\s+du\s+(\d{1,2}\/\d{1,2}\/\d{4})/i);
  if (m1) return { jo_date: toISODateFromDDMMYYYY(m1[1]), source_url: pageUrl };

  // 2) "31 decembre 2025"
  const months = {
    janvier: "01",
    fevrier: "02",
    mars: "03",
    avril: "04",
    mai: "05",
    juin: "06",
    juillet: "07",
    aout: "08",
    septembre: "09",
    octobre: "10",
    novembre: "11",
    decembre: "12",
  };
  const m2 = low.match(
    /journal officiel\s+du\s+(\d{1,2})\s+([a-z]+)\s+(\d{4})/i
  );
  if (m2) {
    const dd = String(m2[1]).padStart(2, "0");
    const mm = months[m2[2]];
    const yyyy = m2[3];
    if (mm) return { jo_date: `${yyyy}-${mm}-${dd}`, source_url: pageUrl };
  }

  return null;
}

(async function main() {
  const query = String(process.argv[2] ?? "").trim();
  const isDryRun = process.argv.includes("--dry");
  const isDebug = process.argv.includes("--debug");

  if (!query) {
    console.error(
      'Usage: node ingestion/fetch_jo_sources.cjs "<query>" [--dry] [--debug]'
    );
    process.exit(1);
  }

  const legi = await tryLegifranceSearch(query);
  if (legi) {
    console.log("[fetch_jo_sources] source = legifrance_html");
    console.log("[fetch_jo_sources] jo_date =", legi);
    if (isDryRun) return;
    return;
  }

const wiki = await findJoViaWikipedia(query, isDebug);
  if (wiki?.jo_date) {
    console.log("[fetch_jo_sources] source = wikipedia");
    console.log("[fetch_jo_sources] jo_date =", wiki.jo_date);
    console.log("[fetch_jo_sources] source_url =", wiki.source_url);
    if (isDryRun) return;
    return;
  }

  const vp = await findViaViePublique(query, isDebug);
  if (vp?.jo_date) {
    console.log("[fetch_jo_sources] source = vie-publique");
    console.log("[fetch_jo_sources] jo_date =", vp.jo_date);
    console.log("[fetch_jo_sources] source_url =", vp.source_url);
    if (isDryRun) return;
    return;
  }

  console.log("[fetch_jo_sources] jo_date = null");
  if (isDryRun) return;
})().catch((e) => {
  console.error("[fetch_jo_sources] ERROR", e?.message || e);
  process.exit(1);
});
