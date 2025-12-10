// ingestion/scrape_scrutins_list.js
// Usage : node ingestion/scrape_scrutins_list.js 17

import * as cheerio from "cheerio";
import fs from "fs";

async function fetchPage(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status);
  return await res.text();
}

function clean(s) { return s.replace(/\s+/g, " ").trim(); }

async function scrapeList(legislature) {
  const base = `https://www.assemblee-nationale.fr/dyn/${legislature}/scrutins`;
  const results = [];

  console.log(`📥 Scraping liste des scrutins législature ${legislature}...`);
  console.log(`⚠ 4686 scrutins sur ~469 pages — ça peut prendre du temps !`);

  for (let page = 1; page <= 469; page++) {
    const url = `${base}?page=${page}`;
    console.log(`➡ Page ${page}/469`);

    const html = await fetchPage(url);
    const $ = cheerio.load(html);

    // Chaque scrutin est dans <article>
    $("article").each((_, el) => {
      const titre = clean($(el).find("h3").text());
      const link = $(el).find("a").attr("href");
      const url = link ? `https://www.assemblee-nationale.fr${link}` : null;

      const numeroMatch = titre.match(/n°\s*([0-9]+)/i);
      const numeroScrutin = numeroMatch ? numeroMatch[1] : null;

      const bloc = clean($(el).text());

      const mPour    = bloc.match(/Pour(?: l'adoption)?\s*:\s*([0-9]+)/i);
      const mContre  = bloc.match(/Contre\s*:\s*([0-9]+)/i);
      const mAbs     = bloc.match(/Abstention\s*:\s*([0-9]+)/i);
      const mRes     = bloc.match(/(adopté|n'a pas adopté|rejeté|adoptée?)/i);

      results.push({
        legislature,
        numeroScrutin,
        titre,
        urlDetail: url,
        miniSynthese: {
          pour:    mPour   ? parseInt(mPour[1])   : null,
          contre:  mContre ? parseInt(mContre[1]) : null,
          abst:    mAbs    ? parseInt(mAbs[1])    : null,
          resultat: mRes   ? mRes[1] : null
        }
      });
    });

    // anti-ban 🇫🇷 (gentle scraping)
    await new Promise(r => setTimeout(r, 900)); // 0.9s entre pages
  }

  fs.writeFileSync("./scrutins_list.json", JSON.stringify(results, null, 2));
  console.log(`\n✅ Fini ! ${results.length} scrutins sauvegardés dans scrutins_list.json`);
}

const legislature = process.argv[2];
if (!legislature) {
  console.log("Usage : node ingestion/scrape_scrutins_list.js 17");
  process.exit(1);
}

scrapeList(legislature);
