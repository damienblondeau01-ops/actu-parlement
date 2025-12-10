// ingestion/scrape_scrutin_page.js
// Usage CLI : node ingestion/scrape_scrutin_page.js 17 4664
// Usage module : import { scrapeScrutin } from "./scrape_scrutin_page.js";

import * as cheerio from "cheerio";

function cleanText(str = "") {
  return str.replace(/\s+/g, " ").trim();
}

async function fetchScrutinPage(legislature, numero) {
  const url = `https://www.assemblee-nationale.fr/dyn/${legislature}/scrutins/${numero}`;
  console.log(`📥 Récupération de ${url} ...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} pour ${url}`);
  const html = await res.text();
  return { url, html };
}

/* ---------------- HEADER ---------------- */

function parseHeader($) {
  const h1El = $("h1").first();
  const h1 = cleanText(h1El.text());

  const legEl = h1El
    .nextAll()
    .filter((_, el) => /législature/i.test(cleanText($(el).text())))
    .first();

  const legislatureText = legEl.length ? cleanText(legEl.text()) : null;

  const seanceText = $("h2").length ? cleanText($("h2").first().text()) : null;

  const libelleEl = $("body *")
    .filter((_, el) =>
      cleanText($(el).text()).startsWith("Scrutin public n°")
    )
    .first();

  const libelleScrutin = libelleEl.length ? cleanText(libelleEl.text()) : null;

  let numeroScrutin = null;
  let articleRef = null;
  let texteBrut = null;

  if (libelleScrutin) {
    const mNum = libelleScrutin.match(/Scrutin public n°\s*([0-9]+)/i);
    if (mNum) numeroScrutin = mNum[1];

    const mTexte = libelleScrutin.match(/sur\s+(.*)$/i);
    if (mTexte) {
      texteBrut = mTexte[1];
      const mArticle = texteBrut.match(/article\s+([0-9A-Za-z\-]+)/i);
      if (mArticle) articleRef = mArticle[1];
    }
  }

  return {
    h1,
    legislatureText,
    seanceText,
    libelleScrutin,
    numeroScrutin,
    articleRef,
    texteBrut,
  };
}

/* ---------------- SYNTHÈSE ---------------- */

function parseSynthese($) {
  const synthese = {
    nbVotants: null,
    nbExprimes: null,
    majAbsolue: null,
    nbPour: null,
    nbContre: null,
    nbAbstention: null,
    resultat: null,
  };

  let label = $("body *")
    .filter((_, el) => cleanText($(el).text()) === "Synthèse du vote")
    .first();

  if (!label.length) {
    label = $("body *")
      .filter((_, el) =>
        cleanText($(el).text()).includes("Synthèse du vote")
      )
      .first();
  }

  if (!label.length) return synthese;

  const parts = [];
  let el = label.next();
  let safety = 0;

  while (el.length && safety < 40) {
    const txt = cleanText(el.text());
    if (txt) {
      if (
        txt.startsWith("Voir le compte rendu") ||
        txt.startsWith("Visualiser les votes des députés") ||
        txt.startsWith("Répartition des votes par groupe")
      )
        break;
      parts.push(txt);
    }
    el = el.next();
    safety++;
  }

  const text = cleanText(parts.join(" "));

  const mVotants = text.match(/Nombre de votants\s*:\s*([0-9]+)/i);
  if (mVotants) synthese.nbVotants = parseInt(mVotants[1], 10);

  const mExpr = text.match(/Nombre de suffrages exprimés\s*:\s*([0-9]+)/i);
  if (mExpr) synthese.nbExprimes = parseInt(mExpr[1], 10);

  const mMaj = text.match(
    /Majorité absolue des suffrages exprimés\s*:\s*([0-9]+)/i
  );
  if (mMaj) synthese.majAbsolue = parseInt(mMaj[1], 10);

  const mPour = text.match(/Pour l'adoption\s*:\s*([0-9]+)/i);
  if (mPour) synthese.nbPour = parseInt(mPour[1], 10);

  const mContre = text.match(/Contre\s*:\s*([0-9]+)/i);
  if (mContre) synthese.nbContre = parseInt(mContre[1], 10);

  const mAbs = text.match(/Abstention\s*:\s*([0-9]+)/i);
  if (mAbs) synthese.nbAbstention = parseInt(mAbs[1], 10);

  const mRes = text.match(/L'Assemblée nationale[^.]+/i);
  if (mRes) synthese.resultat = cleanText(mRes[0]);

  return synthese;
}

/* ---------------- VOTES PAR GROUPE ---------------- */

/**
 * Stratégie :
 * - on récupère le texte complet à partir de "Répartition des votes par groupe"
 * - on découpe des blocs par nom de groupe (les <h3>)
 * - dans chaque bloc :
 *    - "(123 membres)"
 *    - "Pour|Contre|Abstention|Non votant : N"
 * - on déduplique par nom de groupe (on garde celui avec membresAnnonce si doublon)
 */
function parseVotesParGroupe($) {
  const fullText = cleanText($("body").text());

  const marker = "Répartition des votes par groupe";
  const idxMarker = fullText.indexOf(marker);

  const sectionText =
    idxMarker !== -1 ? fullText.slice(idxMarker) : fullText;

  const groupNames = $("h3")
    .toArray()
    .map((el) => cleanText($(el).text()))
    .filter((name) => !!name);

  const tempResults = [];

  for (let i = 0; i < groupNames.length; i++) {
    const name = groupNames[i];

    const start = sectionText.indexOf(name);
    if (start === -1) continue;

    let end = sectionText.length;
    for (let j = i + 1; j < groupNames.length; j++) {
      const nextName = groupNames[j];
      const idxNext = sectionText.indexOf(nextName);
      if (idxNext !== -1 && idxNext > start && idxNext < end) {
        end = idxNext;
      }
    }

    const block = sectionText.slice(start, end);

    // "(123 membres)"
    let membresAnnonce = null;
    const mM = block.match(/\((\d+)\s+membres?\)/i);
    if (mM) membresAnnonce = parseInt(mM[1], 10);

    const positions = [];
    const posRegex = /(Pour|Contre|Abstention|Non votant)\s*:\s*([0-9]+)/gi;
    let m;
    while ((m = posRegex.exec(block)) !== null) {
      positions.push({
        position: m[1],
        count: parseInt(m[2], 10),
        deputes: [],
      });
    }

    if (!membresAnnonce && !positions.length) continue;

    tempResults.push({
      groupe: name,
      membresAnnonce,
      positions,
    });
  }

  // Déduplication par nom de groupe
  const byName = new Map();
  for (const g of tempResults) {
    const key = g.groupe;
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, g);
    } else {
      if (!existing.membresAnnonce && g.membresAnnonce) {
        byName.set(key, g);
      }
    }
  }

  return Array.from(byName.values());
}

/* ---------------- VOTES PAR DÉPUTÉ (par texte brut) ---------------- */

/**
 * On travaille sur le texte complet, comme pour parseVotesParGroupe :
 * - on prend la section à partir de "Répartition des votes par groupe"
 * - on découpe des blocs par nom de groupe (mêmes h3 que plus haut)
 * - dans chaque bloc :
 *    - on trouve les segments "Pour|Contre|Abstention|Non votant : N"
 *    - pour chaque segment, on récupère les noms qui suivent ("M. ...", "Mme ...")
 */
function parseVotesParDepute($) {
  const fullText = cleanText($("body").text());

  const marker = "Répartition des votes par groupe";
  const idxMarker = fullText.indexOf(marker);
  const sectionText =
    idxMarker !== -1 ? fullText.slice(idxMarker) : fullText;

  const groupNames = $("h3")
    .toArray()
    .map((el) => cleanText($(el).text()))
    .filter((name) => !!name);

  const rows = [];

  for (let i = 0; i < groupNames.length; i++) {
    const name = groupNames[i];

    const start = sectionText.indexOf(name);
    if (start === -1) continue;

    let end = sectionText.length;
    for (let j = i + 1; j < groupNames.length; j++) {
      const nextName = groupNames[j];
      const idxNext = sectionText.indexOf(nextName);
      if (idxNext !== -1 && idxNext > start && idxNext < end) {
        end = idxNext;
      }
    }

    const block = sectionText.slice(start, end);

    const deputes = parseDeputesInGroupBlock(name, block);
    rows.push(...deputes);
  }

  // 🔁 DÉDUPLICATION : on garde un seul enregistrement par
  // (groupe, position, nomDepute)
  const uniq = new Map();
  for (const row of rows) {
    const key = `${row.groupe}|||${row.position}|||${row.nomDepute}`;
    if (!uniq.has(key)) {
      uniq.set(key, row);
    }
  }

  return Array.from(uniq.values());
}

/**
 * Dans le bloc d’un groupe, on isole les segments :
 *   "Pour : 34 <noms...> [Prochaine position ou fin]"
 * On extrait les noms à partir de "M." / "Mme".
 */
function parseDeputesInGroupBlock(groupName, block) {
  const rows = [];

  const regex =
    /\b(Pour|Contre|Abstention|Non votant)\s*:\s*([0-9]+)([\s\S]*?)(?=(Pour|Contre|Abstention|Non votant)\s*:\s*[0-9]+|$)/gi;

  let m;
  while ((m = regex.exec(block)) !== null) {
    const position = m[1]; // Pour / Contre / Abstention / Non votant
    const namesText = m[3] || "";

    const names = extractNamesFromText(namesText);
    for (const nom of names) {
      rows.push({
        groupe: groupName,
        position,
        nomDepute: nom,
        urlDepute: null, // pas de lien direct sur cette page
      });
    }
  }

  return rows;
}

/**
 * On transforme le texte brut en liste de noms :
 *  - on découpe sur "M. " et "Mme "
 *  - on garde les morceaux qui commencent par "M. " ou "Mme "
 */
function extractNamesFromText(text) {
  let work = text
    .replace(/MM\.\s+/g, "|M. ") // au cas où "MM." apparaisse
    .replace(/M\.\s+/g, "|M. ")
    .replace(/Mme\s+/g, "|Mme ");

  const parts = work.split("|");
  const names = [];

  for (const raw of parts) {
    const s = raw.trim();
    if (!s) continue;

    if (s.startsWith("M. ") || s.startsWith("Mme ")) {
      const cleaned = s.replace(/\s*[,;.]?$/, "");
      names.push(cleaned);
    }
  }

  return names;
}

/* ---------------- FONCTION PRINCIPALE ---------------- */

export async function scrapeScrutin(legislature, numero) {
  const { html, url } = await fetchScrutinPage(legislature, numero);
  const $ = cheerio.load(html);

  const header = parseHeader($);
  const synthese = parseSynthese($);
  const votesParGroupe = parseVotesParGroupe($);
  const votesParDepute = parseVotesParDepute($);

  return {
    sourceUrl: url,
    legislature,
    numeroScrutin: header.numeroScrutin || numero,
    header,
    synthese,
    votesParGroupe,
    votesParDepute,
  };
}

async function mainCli() {
  const [leg, num] = process.argv.slice(2);
  if (!leg || !num) {
    console.error(
      "Usage : node ingestion/scrape_scrutin_page.js <legislature> <numero>"
    );
    process.exit(1);
  }

  try {
    const data = await scrapeScrutin(leg, num);
    console.log(JSON.stringify(data, null, 2));
  } catch (e) {
    console.error("❌ Erreur :", e.message);
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith("scrape_scrutin_page.js")) {
  mainCli();
}
