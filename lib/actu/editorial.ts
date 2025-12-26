// lib/actu/editorial.ts
import type { GroupedActuRow } from "@/lib/actu/grouping";

/**
 * Coupe proprement sans casser un mot ("législat").
 * Ajoute "…" uniquement si dépassement.
 */
export function clampTextWord(s: string, max = 140): string {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (t.length <= max) return t;

  const cut = t.slice(0, max + 1); // +1 pour chercher un espace proche
  const lastSpace = cut.lastIndexOf(" ");
  const safe = (lastSpace > Math.max(20, max - 40) ? cut.slice(0, lastSpace) : t.slice(0, max)).trimEnd();
  return safe + "…";
}

/**
 * Affiche : "3 scrutins • 3 amendements"
 * (et rien si tout est à 0 / inconnu)
 */
export function buildStatsLine(row: GroupedActuRow): string {
  const scr = Number((row as any)?.summary?.scrutins ?? 0);
  const amd = Number((row as any)?.summary?.amendements ?? 0);

  const parts: string[] = [];
  if (scr > 0) parts.push(`${scr} scrutin${scr > 1 ? "s" : ""}`);
  if (amd > 0) parts.push(`${amd} amendement${amd > 1 ? "s" : ""}`);

  return parts.join(" • ");
}

/* =========================
   ✅ Helpers “scrutin sur amendement” (premium, non intrusif)
========================= */

function cleanSpaces(s: string) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

function normApos(s: string) {
  return cleanSpaces(s).replace(/[’]/g, "'");
}

function getOfficialRaw(row: GroupedActuRow): string {
  const it0: any = (row as any)?.items?.[0] ?? {};
  return cleanSpaces(it0.objet ?? it0.titre ?? it0.title ?? it0.subtitle ?? it0.tldr ?? "");
}

function isVoteOnAmendement(officialRaw: string): boolean {
  const s = normApos(officialRaw).toLowerCase();
  return (
    s.startsWith("l'amendement") ||
    s.startsWith("amendement") ||
    s.startsWith("sous-amendement") ||
    s.includes("amendement identique")
  );
}

function extractAmendementNumber(officialRaw: string): string {
  const s = normApos(officialRaw);
  // couvre : "amendement n° 126", "amendement n°126", "sous-amendement n° 42"
  const m = s.match(/\b(?:sous-)?amendement\b.*?\bn[°º]\s*(\d+)/i);
  return m?.[1] ? String(m[1]).trim() : "";
}

function extractArticleRef(officialRaw: string): string {
  const s = normApos(officialRaw);
  // couvre : "à l'article 10 bis", "a l'article 38", etc.
  const m = s.match(/\b(?:a|à)\s+l'article\s+([^()]+?)(?:\s+du|\s+de\s+la|\s+\(|\.|$)/i);
  if (!m?.[1]) return "";
  return cleanSpaces(m[1])
    .replace(/\s+et\s+annexe.*$/i, "")
    .trim();
}

function buildAmendementKicker(officialRaw: string): string | null {
  if (!officialRaw) return null;
  if (!isVoteOnAmendement(officialRaw)) return null;

  const num = extractAmendementNumber(officialRaw);
  const art = extractArticleRef(officialRaw);

  const parts: string[] = [];
  if (num) parts.push(`Amendement n°${num}`);
  else parts.push("Amendement");

  if (art) parts.push(`article ${art}`);

  const out = cleanSpaces(parts.join(" • "));
  return out || null;
}

/**
 * Label "factuel" sous les stats.
 * ✅ Premium : si scrutin sur amendement → "Amendement n°… • article …"
 * Sinon fallback stable.
 */
export function buildSecondaryLine(row: GroupedActuRow): string {
  const entity = row.entity;

  // uniquement pour scrutin (cas qui t’embête)
  if (entity === "scrutin") {
    const officialRaw = getOfficialRaw(row);
    const kicker = buildAmendementKicker(officialRaw);
    if (kicker) return kicker;
  }

  // fallback simple et stable (évite les variations qui fatiguent)
  return "Dernières avancées à l’Assemblée";
}

/**
 * Titre citoyen court (JAMAIS le titre officiel tronqué).
 * Objectif : 1–2 lignes MAX dans l’UI, sans "…"
 */
export function buildCitizenTitle(row: GroupedActuRow): string {
  const entity = row.entity;

  // Si c’est une loi identifiée et propre : on fait simple et lisible
  const displayTitle = String((row as any)?.display?.title ?? "").trim();
  const looksLikeLaw = /^loi\b/i.test(displayTitle);

  // 🔥 Ligne éditoriale volontairement "générique mais vraie"
  if (entity === "scrutin") {
    const scr = Number((row as any)?.summary?.scrutins ?? 0);
    if (scr <= 1) return "Un vote clé à retenir";
    return "Des votes décisifs à l’Assemblée";
  }

  if (entity === "amendement") {
    const amd = Number((row as any)?.summary?.amendements ?? 0);
    if (amd <= 1) return "Une modification importante du texte";
    return "Des modifications importantes du texte";
  }

  if (entity === "loi" || looksLikeLaw) {
    // On garde "Loi : ..." MAIS court. Surtout pas le titre officiel brut.
    // Si displayTitle est déjà court, on le garde, sinon on génère une promesse.
    const base = displayTitle.replace(/^loi\s*:?\s*/i, "").trim();
    if (base && base.length <= 70) return `Loi : ${base}`;
    return "Loi : une avancée à comprendre";
  }

  if (entity === "motion") return "Un événement politique à retenir";
  if (entity === "declaration") return "Une prise de parole à retenir";

  return "Un moment parlementaire important";
}

/**
 * Titre officiel (long) destiné au bloc repliable.
 * On prend la meilleure source possible :
 * - item[0].titre / title / objet / subtitle / tldr
 */
export function buildOfficialTitle(row: GroupedActuRow): string {
  const it0: any = (row as any)?.items?.[0] ?? {};
  const raw = it0.titre ?? it0.title ?? it0.objet ?? it0.subtitle ?? it0.tldr ?? "";
  return String(raw ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Modèle “Hero génialissime”:
 * - title = citoyen (pas de …)
 * - statsLine = "3 scrutins • 3 amendements"
 * - secondaryLine = ✅ premium contextuel (amendement/article si dispo)
 * - officialTitleShort = coupé proprement avec …
 * - officialTitleFull = brut
 */
export function buildHeroEditorialModel(row: GroupedActuRow) {
  const title = buildCitizenTitle(row);
  const statsLine = buildStatsLine(row);
  const secondaryLine = buildSecondaryLine(row);

  const officialTitleFull = buildOfficialTitle(row);
  const officialTitleShort = clampTextWord(officialTitleFull, 160);

  return {
    title,
    statsLine,
    secondaryLine,
    officialTitleShort,
    officialTitleFull,
  };
}
