// ingestion/fetch_dossier_an.cjs
// But: alimenter public.loi_procedure_steps à partir d'un dossier AN (dyn)
// Usage:
//   node ingestion/fetch_dossier_an.cjs https://www.assemblee-nationale.fr/dyn/17/dossiers/loi_speciale_2026

const process = require("node:process");
require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");
const cheerio = require("cheerio");

// ✅ NEW (JO injection)
const { spawnSync } = require("node:child_process");
const path = require("node:path");

// ======================
// ENV helpers
// ======================
function pickEnv(...keys) {
  for (const k of keys) {
    const v = String(process.env[k] ?? "").trim();
    if (v) return v;
  }
  return "";
}

const SUPABASE_URL = pickEnv("SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE =
  pickEnv("SUPABASE_SERVICE_ROLE", "SUPABASE_SERVICE_KEY") || "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.error(
    "[fetch_dossier_an] Missing env: SUPABASE_URL / EXPO_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});

// ======================
// Helpers
// ======================
function cleanSpaces(s) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

// normalize: lower + strip diacritics (accents)
function normLower(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function toISODateMaybe(x) {
  const s = cleanSpaces(x);
  if (!s) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const dd = String(m[1]).padStart(2, "0");
    const mm = String(m[2]).padStart(2, "0");
    const yyyy = m[3];
    return yyyy + "-" + mm + "-" + dd;
  }
  return null;
}

function frLongDateToISO(x) {
  const raw = cleanSpaces(x);
  if (!raw) return null;

  const s = normLower(raw);

  const months = {
    janvier: 1,
    fevrier: 2,
    mars: 3,
    avril: 4,
    mai: 5,
    juin: 6,
    juillet: 7,
    aout: 8,
    septembre: 9,
    octobre: 10,
    novembre: 11,
    decembre: 12,
  };

  // ex: "Lundi 22 décembre 2025" (ou sans accents après normLower)
  const m = s.match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/i);
  if (!m) return null;

  const day = Number(m[1]);
  const monName = m[2];
  const year = Number(m[3]);
  const mon = months[monName];
  if (!mon || !day || !year) return null;

  const mm = String(mon).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return String(year) + "-" + mm + "-" + dd;
}

function extractDossierTitleFromHtml(html) {
  try {
    const $ = cheerio.load(html);

    // H1 du dossier (souvent le meilleur signal)
    const h1 = cleanSpaces($("h1").first().text());
    if (h1 && h1.length >= 8) return h1;

    // fallback: <title>
    const t = cleanSpaces($("title").first().text());
    if (t && t.length >= 8) return t;

    return null;
  } catch {
    return null;
  }
}


function dossierIdFromUrl(url) {
  const m = String(url ?? "").match(/\/dossiers\/([^/?#]+)/i);
  return m ? m[1] : "";
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

function htmlToText(html) {
  return cleanSpaces(
    String(html ?? "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
  );
}

// ======================
// ✅ JO helpers (post-process)
// ======================
function findFirstStep(steps, kind) {
  return (steps || []).find((s) => String(s.step_kind) === kind) || null;
}

function hasStepKind(steps, kind) {
  return (steps || []).some((s) => String(s.step_kind) === kind);
}

function buildJoQueryFromSteps(steps, dossier_id) {
  const arr = Array.isArray(steps) ? steps : [];

  function isGenericLabel(label) {
    const t = normLower(cleanSpaces(label));

    if (!t) return true;

    // hyper-génériques / bruit
    if (t === "promulgation de la loi") return true;
    if (t === "texte adopte" || t.startsWith("texte adopte")) return true;
    if (t.startsWith("voir ")) return true;
    if (t.includes("dossier legislatif")) return true;

    // souvent trop pauvres
    if (t === "promulgation" || t === "jo") return true;

    return false;
  }

  // 1) Priorité aux labels riches qui contiennent "projet de loi" / "financement" / "sécurité sociale" etc.
  const preferred = arr
    .map((s) => String(s?.label ?? ""))
    .map((s) => cleanSpaces(s))
    .filter((s) => s.length >= 25 && !isGenericLabel(s))
    .sort((a, b) => {
      const na = normLower(a);
      const nb = normLower(b);

      const score = (x) => {
        let sc = 0;
        if (x.includes("projet de loi")) sc += 5;
        if (x.includes("loi n")) sc += 5;
        if (x.includes("financement")) sc += 4;
        if (x.includes("securite sociale")) sc += 4;
        if (x.includes("budget")) sc += 3;
        if (x.includes("recettes")) sc += 2;
        if (x.includes("retraites")) sc += 2;
        // bonus longueur (sans exploser)
        sc += Math.min(3, Math.floor(a.length / 60));
        return sc;
      };

      const sa = score(na);
      const sb = score(nb);

      if (sa !== sb) return sb - sa;
      return b.length - a.length;
    })[0];

  // 2) fallback : le plus long non générique
  const fallbackLongest = arr
    .map((s) => cleanSpaces(String(s?.label ?? "")))
    .filter((s) => s.length >= 20 && !isGenericLabel(s))
    .sort((a, b) => b.length - a.length)[0];

  const base = preferred || fallbackLongest || "";

  // 3) injecte un identifiant stable si dispo, ça aide le ranking VP-panorama
  // (ne casse rien si non trouvé)
  const extra = dossier_id ? ` ${String(dossier_id)}` : "";

  return cleanSpaces(base + extra);
}

function tryGetJoViaScript(query, isDebug) {
  const q = cleanSpaces(query);
  if (!q) return null;

  const scriptPath = path.join(__dirname, "fetch_jo_sources.cjs");
  const args = [scriptPath, q, "--dry"];
  if (isDebug) args.push("--debug");

  const r = spawnSync("node", args, { encoding: "utf-8" });

  const out = String(r.stdout || "");
  const err = String(r.stderr || "");

  if (isDebug) {
    if (err.trim()) console.log("[fetch_dossier_an][JO] stderr =", err.trim());
    console.log(
      "[fetch_dossier_an][JO] stdout.tail =",
      out.trim().split("\n").slice(-8).join(" | ")
    );
  }

  const mDate = out.match(
    /\[fetch_jo_sources\]\s+jo_date\s+=\s+(\d{4}-\d{2}-\d{2})/i
  );
  if (!mDate) return null;

  const mUrl = out.match(
    /\[fetch_jo_sources\]\s+source_url\s+=\s+(https?:\/\/\S+)/i
  );

  return {
    jo_date: mDate[1],
    source_url: mUrl ? mUrl[1] : null,
  };
}

// ======================
// PARSING V2 (progressif, robuste)
// ======================
function parseFrenchDate(x) {
  const s0 = cleanSpaces(x);
  if (!s0) return null;

  // dd/mm/yyyy
  const m1 = s0.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (m1) {
    const dd = String(m1[1]).padStart(2, "0");
    const mm = String(m1[2]).padStart(2, "0");
    const yyyy = m1[3];
    return yyyy + "-" + mm + "-" + dd;
  }

  // long date FR (insensible accents)
  const iso = frLongDateToISO(s0);
  if (iso) return iso;

  return null;
}

function extractUrlFromNode($, node) {
  const href = $(node).attr("href");
  if (!href) return null;
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith("/")) return "https://www.assemblee-nationale.fr" + href;
  return href;
}

function guessChambreFromLabel(label) {
  const t = normLower(label);
  if (t.includes("senat")) return "SENAT";
  if (t.includes("assemblee")) return "AN";
  return null;
}

function guessStepKindFromLabel(label) {
  const t = normLower(label);

  const isJO =
    t === "jo" ||
    t.includes("journal officiel") ||
    t.includes("j.o") ||
    t.includes(" au jo") ||
    t.includes(" au journal officiel");

  if (isJO) return "JO";
  if (t.includes("promulg")) return "PROMULGATION";
  if (t.includes("cmp") || t.includes("commission mixte paritaire")) return "CMP";
  if (t.includes("depot") || t.includes("depose")) return "DEPOT";
  if (t.includes("adopt") || t.includes("vote") || t.includes("lecture definitive"))
    return "ADOPTION";

  if (
    t.includes("examen") ||
    t.includes("discussion") ||
    t.includes("seance") ||
    t.includes("commission")
  )
    return "EXAMEN";

  return "ETAPE";
}

function guessLecture(label) {
  const t = normLower(label);
  if (
    t.includes("1re lecture") ||
    t.includes("premiere lecture") ||
    t.includes("1ere lecture")
  )
    return "1";
  if (
    t.includes("2e lecture") ||
    t.includes("deuxieme lecture") ||
    t.includes("2eme lecture")
  )
    return "2";
  if (t.includes("nouvelle lecture")) return "NL";
  if (t.includes("lecture definitive")) return "LD";
  return null;
}

function collectCandidatesFromLinks($, dossierUrl) {
  const out = [];

  $("a").each((_, a) => {
    const text = cleanSpaces($(a).text());
    if (!text) return;

    // ✅ anti-UI : ignore "Voir ..."
    const low = normLower(text);
    if (low.startsWith("voir ")) return;

    const url = extractUrlFromNode($, a);
    if (!url) return;

    const looksProcedural =
      low.includes("dossier") ||
      low.includes("travaux") ||
      low.includes("texte") ||
      low.includes("seance") ||
      low.includes("commission") ||
      low.includes("cmp") ||
      low.includes("promulg") ||
      low.includes("journal officiel") ||
      low.includes("jo") ||
      low.includes("senat") ||
      low.includes("assemblee") ||
      low.includes("lecture") ||
      low.includes("adoption") ||
      low.includes("depot") ||
      low.includes("depose");

    if (!looksProcedural) return;
    if (dossierUrl && url === dossierUrl) return;

    out.push({
      label: text,
      source_label: "Assemblee nationale",
      source_url: url,
      date_start: parseFrenchDate(text),
      date_end: null,
      raw: { from: "link", text, url },
    });
  });

  return out;
}

function collectCandidatesFromTextSignals($) {
  const out = [];
  const blocks = [];

  $("main, #main, .main, .contenu-principal, article, body").each((_, el) => {
    const t = cleanSpaces($(el).text());
    if (t && t.length > 200) blocks.push(t);
  });

  const joined = blocks.join("\n").slice(0, 20000);
  if (!joined) return out;

  // dd/mm/yyyy OR long date (loose)
  const dateRegex =
    /(\b\d{1,2}\/\d{1,2}\/\d{4}\b)|(\b\d{1,2}\s+[^\d]+\s+\d{4}\b)/g;

  const matches = joined.match(dateRegex) || [];
  const uniqDates = Array.from(new Set(matches.map((x) => cleanSpaces(x)))).slice(
    0,
    30
  );

  for (const d of uniqDates) {
    const iso = parseFrenchDate(d);
    if (!iso) continue;

    const idx = joined.toLowerCase().indexOf(d.toLowerCase());
    const context =
      idx >= 0 ? joined.slice(Math.max(0, idx - 80), idx + 120) : d;
    const ctx = cleanSpaces(context);
    const low = normLower(ctx);

    const strong =
      low.includes("lecture") ||
      low.includes("adopt") ||
      low.includes("cmp") ||
      low.includes("commission") ||
      low.includes("seance") ||
      low.includes("promulg") ||
      low.includes("journal officiel") ||
      low.includes("senat") ||
      low.includes("assemblee") ||
      low.includes("depot") ||
      low.includes("depose");

    if (!strong) continue;

    out.push({
      label: ctx,
      source_label: "Assemblee nationale",
      source_url: null,
      date_start: iso,
      date_end: null,
      raw: { from: "text", date: d, context: ctx },
    });
  }

  return out;
}

function normalizeAndBuildStepsFromCandidates(cands, dossierUrl) {
  const items = (cands || []).map((c) => {
    const label = cleanSpaces(c.label);
    const step_kind = guessStepKindFromLabel(label);

    // ===== PATCH B (chambre/lecture safe) =====
    let chambre = guessChambreFromLabel(label) || c.chambre || null;
    let lecture = guessLecture(label) || c.lecture || null;

    if (step_kind === "DEPOT" || step_kind === "PROMULGATION" || step_kind === "JO") {
      lecture = null;
    }
    if (step_kind === "PROMULGATION" || step_kind === "JO") {
      chambre = null;
    }
    // =========================================

    return {
      step_kind,
      chambre,
      lecture,
      label: label || "Etape",
      date_start: c.date_start || null,
      date_end: c.date_end || null,
      source_label: c.source_label || "Assemblee nationale",
      source_url: c.source_url || null,
      raw: c.raw ?? null,
    };
  });

  // dedup conservateur
  const seen = new Set();
  const dedup = [];
  for (const s of items) {
    const key = [s.step_kind, s.label, s.date_start ?? "", s.source_url ?? ""].join(
      "|"
    );
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push(s);
  }

  // tri stable
  dedup.sort((a, b) => {
    const da = a.date_start ? a.date_start : "9999-12-31";
    const db = b.date_start ? b.date_start : "9999-12-31";
    if (da < db) return -1;
    if (da > db) return 1;
    if (a.step_kind < b.step_kind) return -1;
    if (a.step_kind > b.step_kind) return 1;
    return a.label.localeCompare(b.label);
  });

  const steps = [
    {
      step_order: 0,
      step_kind: "DOSSIER_AN",
      label: "Dossier legislatif (Assemblee nationale)",
      source_label: "Dossier legislatif (Assemblee nationale)",
      source_url: dossierUrl,
      raw: { note: "pointer_v2" },
    },
    ...dedup.map((s, i) => ({
      step_order: i + 1,
      step_kind: s.step_kind,
      chambre: s.chambre ?? null,
      lecture: s.lecture ?? null,
      label: s.label,
      date_start: s.date_start ?? null,
      date_end: s.date_end ?? null,
      source_label: s.source_label ?? "Dossier legislatif (Assemblee nationale)",
      source_url: s.source_url ?? dossierUrl,
      raw: s.raw ?? { source: "AN_v2" },
    })),
  ];

  return steps;
}

function dedupAndReindexSteps(steps) {
  const arr = Array.isArray(steps) ? steps : [];
  const seen = new Set();
  const out = [];

  for (const s of arr) {
    const key = [
      String(s.step_kind ?? ""),
      String(s.label ?? ""),
      String(s.date_start ?? ""),
      String(s.source_url ?? ""),
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }

  const pointer = out.find((x) => Number(x.step_order) === 0) || null;
  const rest = out.filter((x) => Number(x.step_order) !== 0);

  rest.sort((a, b) => {
    const da = a.date_start ? String(a.date_start) : "9999-12-31";
    const db = b.date_start ? String(b.date_start) : "9999-12-31";
    if (da < db) return -1;
    if (da > db) return 1;
    return String(a.label ?? "").localeCompare(String(b.label ?? ""));
  });

  const finalSteps = [];
  if (pointer) finalSteps.push({ ...pointer, step_order: 0 });
  rest.forEach((s, i) => finalSteps.push({ ...s, step_order: i + 1 }));

  return finalSteps;
}

function parseStepsFromHtmlV2(html, dossierUrl) {
  const $ = cheerio.load(html);

  const c1 = collectCandidatesFromLinks($, dossierUrl);
  const c2 = collectCandidatesFromTextSignals($);

  const merged = [...c1, ...c2].slice(0, 120);
  const built = normalizeAndBuildStepsFromCandidates(merged, dossierUrl);

  if (Array.isArray(built) && built.length >= 2) return built;
  return [];
}

// ======================
// PARSING "Etapes de lecture" (bloc AN)
// ======================
function parseEtapesDeLecture(html, dossierUrl) {
  const $ = cheerio.load(html);
  const steps = [];

  // 1) trouver un noeud dont le texte NORMALISÉ contient "etapes de lecture"
  const h = $("body")
    .find("*")
    .filter((_, el) => {
      const t = normLower(cleanSpaces($(el).text()));
      return t === "etapes de lecture" || t.includes("etapes de lecture");
    })
    .first();

  if (!h || h.length === 0) return steps;

  // 2) Essayer plusieurs "zones" autour du titre (AN dyn varie beaucoup)
  const zones = [];
  zones.push(h.parent());
  zones.push(h.parent().parent());
  zones.push(h.closest("section, article, main, div"));
  zones.push(h.next());
  zones.push(h.nextAll().slice(0, 8));

  // helper: texte direct d'un noeud (sans enfants)
  function directText(el) {
    const t = $(el).clone().children().remove().end().text();
    return cleanSpaces(t);
  }

  // helper: test label/date
  function isDateText(t) {
    return /\d{1,2}\s+[^\d]+\s+\d{4}/i.test(t);
  }
  function isLabelText(tn) {
    // volontairement plus large que "strict", mais filtré anti-bruit
    return (
      tn.includes("depot") ||
      tn.includes("lecture") ||
      tn.includes("promulgation") ||
      tn.includes("journal officiel") ||
      tn.includes("cmp") ||
      tn.includes("commission mixte paritaire") ||
      tn.includes("adopte") ||
      tn.includes("adopt")
    );
  }
  function isNoise(tn) {
    return (
      tn === "etapes de lecture" ||
      tn.includes("basculer vers l'affichage vertical") ||
      tn.includes("vers l'affichage vertical") ||
      tn.includes("affichage vertical") ||
      tn === "image" ||
      tn.startsWith("voir ")
    );
  }

  // 3) Parsing séquentiel : on lit les tokens dans l'ordre DOM
  //    label -> prochaine date => une étape
  for (const z of zones) {
    if (!z || z.length === 0) continue;

    const tokens = [];

    z.find("*").each((_, el) => {
      // on prend directText (sinon on récupère des blocs entiers)
      const t = directText(el);
      if (!t) return;

      const tn = normLower(t);
      if (isNoise(tn)) return;

      // anti-paragraphe : on refuse les gros blocs (source des labels pollués)
      if (t.length > 140 && !isDateText(t)) return;

      if (isDateText(t)) {
        const iso = parseFrenchDate(t);
        if (iso) tokens.push({ type: "date", text: t, iso });
        return;
      }

      if (isLabelText(tn)) {
        tokens.push({ type: "label", text: t });
      }
    });

    if (tokens.length < 2) continue;

    // construit steps en pairant label -> date suivante
    let pendingLabel = null;

    // ✅ PATCH 1 (support) : on mémorise la dernière chambre de lecture
    let lastLectureChambre = null;

    for (const tok of tokens) {
      if (tok.type === "label") {
        pendingLabel = tok.text;
        continue;
      }

      if (tok.type === "date" && pendingLabel) {
        const label = cleanSpaces(pendingLabel).slice(0, 120);
        const low = normLower(label);

        let step_kind = "ETAPE";
        let chambre = null;
        let lecture = null;

        // ✅ JO distinct de PROMULGATION (nettoyé, pas de doublon)
        const isJO =
          low === "jo" ||
          low.includes("journal officiel") ||
          low.includes("j.o") ||
          low.includes(" au jo") ||
          low.includes(" au journal officiel");

        if (isJO) {
          step_kind = "JO";
          chambre = null;
          lecture = null;
        } else if (low.includes("promulgation")) {
          step_kind = "PROMULGATION";
          chambre = null;
          lecture = null;
        } else if (low.includes("depot") || low.includes("depose")) {
          step_kind = "DEPOT";
          chambre = "AN";
          lecture = null;
        } else if (low.includes("senat")) {
          step_kind = "LECTURE";
          chambre = "SENAT";
          lecture = guessLecture(label);
        } else if (low.includes("assemblee")) {
          step_kind = "LECTURE";
          chambre = "AN";
          lecture = guessLecture(label);
        } else if (low.includes("cmp") || low.includes("commission mixte paritaire")) {
          step_kind = "CMP";
          chambre = null;
          lecture = null;
        } else if (low.includes("adopt")) {
          step_kind = "ADOPTION";
          // ✅ PATCH 2 (direct) : si "Texte adopté ✅" n'indique pas la chambre,
          // on prend la dernière chambre de LECTURE rencontrée
          chambre = guessChambreFromLabel(label) || lastLectureChambre || null;
          lecture = null;
        }

        // ✅ PATCH 1 : mémorise la dernière chambre de lecture
        if (step_kind === "LECTURE" && chambre) {
          lastLectureChambre = chambre;
        }

        steps.push({
          step_order: steps.length + 1,
          step_kind,
          chambre,
          lecture,
          label,
          date_start: tok.iso,
          date_end: null,
          source_label: "Dossier legislatif (Assemblee nationale)",
          source_url: dossierUrl,
          raw: {
            source: "AN_etapes_de_lecture_v3",
            label_raw: pendingLabel,
            date_raw: tok.text,
          },
        });

        pendingLabel = null;
      }
    }

    // si on a trouvé au moins 2 steps propres : on sort
    if (steps.length >= 2) break;
  }

  // dédup de sécurité (même label+date+kind)
  const seen = new Set();
  const out = [];
  for (const s of steps) {
    const k = [s.step_kind, s.label, s.date_start ?? ""].join("|");
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }

  // reindex step_order (1..n)
  out.forEach((s, i) => (s.step_order = i + 1));

  // ✅ 5.3 — mini-dedup CMP (évite "Rapport..." / "Texte..." en doublon)
  const cmpByDate = new Map();
  const filtered = [];

  for (const s of out) {
    if (!s || s.step_kind !== "CMP" || !s.date_start) {
      filtered.push(s);
      continue;
    }

    const date = String(s.date_start);

    const existing = cmpByDate.get(date);
    if (!existing) {
      cmpByDate.set(date, s);
      filtered.push(s);
      continue;
    }

    // On garde le libellé le plus "générique"
    const a = normLower(String(existing.label ?? ""));
    const b = normLower(String(s.label ?? ""));

    const aGeneric = !(a.includes("rapport") || a.includes("texte"));
    const bGeneric = !(b.includes("rapport") || b.includes("texte"));

    if (!aGeneric && bGeneric) {
      // remplace dans filtered
      const idx = filtered.indexOf(existing);
      if (idx >= 0) filtered[idx] = s;
      cmpByDate.set(date, s);
    }
  }

  // remplace out par filtered
  filtered.forEach((s, i) => (s.step_order = i + 1));
  out.length = 0;
  out.push(...filtered);

  // ✅ PATCH 2 (FIX): héritage chambre des ADOPTION par DATE (pas par "prev")
  const lectureChambreByDate = new Map();
  for (const s of out) {
    if (s && s.step_kind === "LECTURE" && s.chambre && s.date_start) {
      lectureChambreByDate.set(String(s.date_start), String(s.chambre));
    }
  }
  for (const s of out) {
    if (!s || s.step_kind !== "ADOPTION" || !s.date_start) continue;
    const inherited = lectureChambreByDate.get(String(s.date_start));
    if (!inherited) continue;
    // corrige si null OU différent
    if (!s.chambre || String(s.chambre) !== inherited) {
      s.chambre = inherited;
    }
  }

  return out;
}

// ======================
// PARSING (Option 2 propre + V2 progressive)
// ======================
function parseStepsFromHtml(html, dossierUrl) {
  // 0) try "Etapes de lecture" (bloc AN)
  const parsed = parseEtapesDeLecture(html, dossierUrl);
  if (parsed.length > 0) {
    return dedupAndReindexSteps([
      {
        step_order: 0,
        step_kind: "DOSSIER_AN",
        label: "Dossier legislatif (Assemblee nationale)",
        source_label: "Dossier legislatif (Assemblee nationale)",
        source_url: dossierUrl,
        raw: { note: "pointer" },
      },
      ...parsed,
    ]);
  }

  // 0.5) V2 progressive (liens + signaux) — avant regex
  try {
    const v2 = parseStepsFromHtmlV2(html, dossierUrl);
    if (v2.length >= 2) return v2;
  } catch (e) {
    console.log("[fetch_dossier_an][V2 parse] ERROR", e?.message || e);
  }

  // 1) fallback ancien (regex dd/mm/yyyy)
  const text = htmlToText(html);
  const steps = [];

  const rules = [
    { kind: "DEPOT", re: /depose.*?(\d{1,2}\/\d{1,2}\/\d{4})/i, label: "Depot" },
    {
      kind: "PROMULGATION",
      re: /promulgu.*?(\d{1,2}\/\d{1,2}\/\d{4})/i,
      label: "Promulgation",
    },
    {
      kind: "JO",
      re: /journal officiel.*?(\d{1,2}\/\d{1,2}\/\d{4})/i,
      label: "Publication au Journal officiel",
    },
  ];

  for (const r of rules) {
    const m = text.match(r.re);
    if (m) {
      const d = toISODateMaybe(m[1]);
      if (d) {
        steps.push({
          step_order: steps.length,
          step_kind: r.kind,
          chambre: null,
          lecture: null,
          label: r.label,
          date_start: d,
          date_end: null,
          source_label: "Dossier legislatif (Assemblee nationale)",
          source_url: dossierUrl,
          raw: { match: m[0] },
        });
      }
    }
  }

  if (steps.length === 0) {
    steps.push({
      step_order: 0,
      step_kind: "DOSSIER_AN",
      label: "Dossier legislatif (Assemblee nationale)",
      source_label: "Dossier legislatif (Assemblee nationale)",
      source_url: dossierUrl,
      raw: { note: "fallback_minimal" },
    });
  }

  return steps;
}

// ======================
// DB UPSERT
// ======================
async function upsertProcedureSteps(dossier_id, steps) {
  const payload = steps.map((s, i) => ({
    dossier_id,
    step_index: Number.isFinite(s.step_order) ? s.step_order : i,
    step_kind: s.step_kind,
    chambre: s.chambre ?? null,
    lecture: s.lecture ?? null,
    label: cleanSpaces(s.label),
    date_start: s.date_start ?? null,
    date_end: s.date_end ?? null,
    source_label: s.source_label ?? null,
    source_url: s.source_url ?? null,
    raw: s.raw ?? null,
    updated_at: new Date().toISOString(),
  }));

  // ✅ IMPORTANT : on supprime les anciens steps, sinon les "tails" restent
  const { error: delErr } = await supabase
    .from("loi_procedure_steps")
    .delete()
    .eq("dossier_id", dossier_id);

  if (delErr) throw delErr;

  const { error: insErr } = await supabase
    .from("loi_procedure_steps")
    .insert(payload);

  if (insErr) throw insErr;

  return payload.length;
}

// ======================
// MAIN
// ======================
(async function main() {
  const dossierUrl = String(process.argv[2] ?? "").trim();
  const isDryRun = process.argv.includes("--dry");
  const isDebug = process.argv.includes("--debug"); // ✅ NEW

  const isSelfTest = process.argv.includes("--selftest");

  if (!dossierUrl) {
    console.error("Usage: node fetch_dossier_an.cjs <dossier_url> [--dry] [--debug] [--selftest]");
    process.exit(1);
  }

  if (isSelfTest) {
    const tests = [
      {
        url: "https://www.assemblee-nationale.fr/dyn/17/dossiers/loi_speciale_2026",
        expectCount: 7,
        mustHave: ["DOSSIER_AN", "DEPOT", "LECTURE", "ADOPTION", "PROMULGATION"],
      },
      {
        url: "https://www.assemblee-nationale.fr/dyn/17/dossiers/DLR5L17N52922",
        expectCount: 16,
        mustHave: ["DOSSIER_AN", "DEPOT", "LECTURE", "ADOPTION", "CMP", "PROMULGATION"],
      },
    ];

    let ok = 0;
    for (const t of tests) {
      const htmlT = await fetchText(t.url);
      const stepsT = parseStepsFromHtml(htmlT, t.url);

      const kinds = new Set(stepsT.map((s) => String(s.step_kind)));
      const hasAll = t.mustHave.every((k) => kinds.has(k));
      const countOk = stepsT.length === t.expectCount;

      if (hasAll && countOk) {
        console.log("[selftest] OK", t.url, "count=", stepsT.length);
        ok++;
      } else {
        console.log("[selftest] FAIL", t.url, {
          count: stepsT.length,
          expectCount: t.expectCount,
          missingKinds: t.mustHave.filter((k) => !kinds.has(k)),
        });
      }
    }

    if (ok === tests.length) {
      console.log("[selftest] ALL OK");
      return;
    }
    console.error("[selftest] SOME TESTS FAILED");
    process.exit(2);
  }

  const dossier_id = dossierIdFromUrl(dossierUrl);
  if (!dossier_id) {
    console.error("Cannot extract dossier_id from URL");
    process.exit(1);
  }

  console.log("[fetch_dossier_an] dossier_id =", dossier_id);
  if (isDryRun) console.log("[fetch_dossier_an] DRY RUN (no DB write)");

  const html = await fetchText(dossierUrl);

  const dossierTitle = extractDossierTitleFromHtml(html);
  if (isDebug) console.log("[fetch_dossier_an] dossier_title =", dossierTitle || null);

  const steps = parseStepsFromHtml(html, dossierUrl);
  


  // ======================
  // ✅ POST-PROCESS: ajouter JO si possible (sans toucher parsing AN)
  // ======================
  if (!hasStepKind(steps, "JO")) {
  const prom = findFirstStep(steps, "PROMULGATION");
  if (prom?.date_start) {
    const joQuery = cleanSpaces([dossierTitle, dossier_id].filter(Boolean).join(" "));
    const jo = await tryGetJoViaScript(joQuery, isDebug);
    if (isDebug) {
  console.log("[fetch_dossier_an][JO] joQuery =", joQuery);
  console.log("[fetch_dossier_an][JO] jo_date =", jo?.jo_date ?? null);
  console.log("[fetch_dossier_an][JO] source_url =", jo?.source_url ?? null);
}


    const safeJo =
      jo?.jo_date &&
      jo?.source_url &&
      (String(joQuery || "").includes(dossier_id) ||
        String(jo.source_url).toLowerCase().includes("vie-publique.fr/loi/"));

    if (safeJo) {
      const insertAt = steps.findIndex((s) => s === prom);

      const joStep = {
        step_order: 9999, // sera recalculé
        step_kind: "JO",
        chambre: null,
        lecture: null,
        label: "Publication au Journal officiel",
        date_start: jo.jo_date,
        date_end: null,
        source_label: "Vie-publique (Panorama des lois)",
        source_url: jo.source_url ?? null,
        raw: { source: "jo_sources_vp_panorama", query: joQuery },
      };

      if (insertAt >= 0) steps.splice(insertAt + 1, 0, joStep);
      else steps.push(joStep);

      // reindex step_order 0..n
      steps.forEach((s, i) => {
        s.step_order = i;
      });
    } else if (isDebug && jo?.jo_date) {
      console.log(
        "[fetch_dossier_an][JO] refused (unsafe match)",
        jo?.source_url || null
      );
    }
  }
}

  console.log("[fetch_dossier_an] steps.count =", steps.length);
  console.log(
    "[fetch_dossier_an] steps.sample =",
    steps.slice(-12).map((s) => ({
      i: s.step_order,
      kind: s.step_kind,
      ch: s.chambre ?? null,
      lec: s.lecture ?? null,
      date: s.date_start ?? null,
      label: String(s.label).slice(0, 90),
    }))
  );

  if (isDryRun) {
    console.log("[fetch_dossier_an] DRY RESULT OK");
    return;
  }

  const n = await upsertProcedureSteps(dossier_id, steps);
  console.log("[fetch_dossier_an] upsert OK =", n);
})().catch((e) => {
  console.error("[fetch_dossier_an] ERROR", e);
  process.exit(1);
});
