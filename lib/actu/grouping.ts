// lib/actu/grouping.ts

export type Entity = "scrutin" | "loi" | "amendement" | "motion" | "declaration";

export type ActuItem = {
  id: string;
  entity: Entity;
  type?: string;

  // ✅ IMPORTANT: doit être un "loi_id canon DB" quand dispo (ex: scrutin-public-...)
  loi_id?: string | null;

  article_ref?: string | null;
  date: string;
  phase_label?: string | null;

  titre?: string | null;
  objet?: string | null;

  title?: string | null;
  subtitle?: string | null;
  tldr?: string | null;

  route?: { href?: string } | null;
};

/** ✅ Cible de navigation canonique (UI “bête” = suit ce champ) */
export type ActuTarget =
  | { kind: "loi"; id: string }
  | { kind: "scrutin"; id: string }
  | { kind: "amendement"; id: string }
  | { kind: "motion"; id: string }
  | { kind: "declaration"; id: string };

export type GroupedActuRow = {
  kind: "group";
  groupKey: string;
  entity: Entity;

  /**
   * ⚠️ Historique : ce champ contenait parfois "loiKey" (loi:slug / title:slug).
   * ✅ Maintenant : on vise l’ID canon DB si dispo (it.loi_id).
   */
  loi_id?: string | null;

  phase_label?: string | null;
  day: string;
  dateMax: string;
  items: ActuItem[];
  summary: {
    total: number;
    amendements: number;
    scrutins: number;
    articles: number;
  };

  /** ✅ Navigation stable */
  primaryTarget?: ActuTarget;
  secondaryTargets?: ActuTarget[];

  display: {
    title: string;
    subtitle: string;
    tag: string;
    longTitle?: string;
    highlights?: string[];
  };
};

function dayOf(iso: string): string {
  return (iso || "").slice(0, 10) || "";
}

function normSlug(s: string) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

type InferredSujet = { key: string; label: string } | null;

function cleanSpaces(s: string) {
  return (s || "").replace(/\s+/g, " ").trim();
}

function capitalizeSentence(s: string) {
  const t = cleanSpaces(s);
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Coupe proprement et ajoute "…" seulement si besoin. */
function clampText(s: string, max = 180) {
  const t = cleanSpaces(s);
  if (!t) return t;
  if (t.length <= max) return t;

  const cut = t.slice(0, max + 1);
  const lastSpace = Math.max(cut.lastIndexOf(" "), cut.lastIndexOf("—"), cut.lastIndexOf(","));
  const safe = (lastSpace > 40 ? cut.slice(0, lastSpace) : t.slice(0, max)).trimEnd();
  return safe + "…";
}

function smartClampFR(s: string, max = 90) {
  let t = cleanSpaces(s);
  if (!t) return t;
  if (t.length <= max) return t;

  let cut = t.slice(0, max);
  let lastSpace = cut.lastIndexOf(" ");
  if (lastSpace < 40) lastSpace = max;

  cut = cut.slice(0, lastSpace).trimEnd();
  cut = cut.replace(/\b(d’|de|du|des|à|au|aux|la|le|les|l’|l')$/i, "").trimEnd();
  cut = cut.replace(/[’']$/g, "").trimEnd();

  return cut + "…";
}

/** ✅ Micro-polish final (ponctuation / dash / n°), appliqué en toute fin */
function normalizeEditorialTitle(s: string) {
  let t = cleanSpaces(s);

  // Dash premium unique
  t = t.replace(/\s*[-–—]\s*/g, " — ");

  // “amendement n°”
  t = t.replace(/\bamendement\s+n\s*[°º]?\s*/gi, "amendement n°");
  t = t.replace(/\bn°\s+/gi, "n°");

  // espaces avant ponctuation
  t = t.replace(/\s+:/g, " :");
  t = t.replace(/\s+\./g, ".");
  t = cleanSpaces(t);

  return t;
}

/* =========================
   Nettoyage (moins destructeur)
========================= */

function extractAmendementSujet(text: string): string | null {
  const raw = cleanSpaces(text);
  if (!raw) return null;

  const lower = raw.toLowerCase();

  const m =
    raw.match(
      /\b(visant à|portant|tendant à|ayant pour objet de|afin de|relative à|relatif à)\s+([^.;\n]+)/i
    ) ?? null;
  if (m?.[2]) {
    const sujet = cleanSpaces(m[2]);
    if (sujet && sujet.length >= 12) return sujet;
  }

  const m2 = raw.match(/\bà\s+l['’]?article\s+\d+\s+([^.;\n]+)/i);
  if (m2?.[1]) {
    const tail = cleanSpaces(m2[1]);
    const m2b =
      tail.match(
        /^(visant à|portant|tendant à|ayant pour objet de|afin de|relative à|relatif à)\s+(.+)$/i
      ) ?? null;
    const sujet = cleanSpaces(m2b?.[2] ?? tail);
    if (sujet && sujet.length >= 12) return sujet;
  }

  const m3 = raw.match(/\b(après|avant)\s+l['’]?article\s+\d+\s+([^.;\n]+)/i);
  if (m3?.[2]) {
    const sujet = cleanSpaces(m3[2]);
    if (sujet && sujet.length >= 12) return sujet;
  }

  if (
    lower.includes("visant à") ||
    lower.includes("portant") ||
    lower.includes("relative à") ||
    lower.includes("relatif à")
  ) {
    return raw;
  }

  return null;
}

function stripGranularPrefix(text: string): string {
  const original = cleanSpaces(text);
  if (!original) return "";

  let s = original;

  s = s.replace(/^l['’]article\s+\d+\s+de\s+la\s+/i, "");
  s = s.replace(/^l['’]article\s+\d+\s+du\s+/i, "");
  s = s.replace(/^article\s+\d+\s+de\s+la\s+/i, "");
  s = s.replace(/^article\s+\d+\s+du\s+/i, "");

  if (
    /^l['’]?amendement\b/i.test(s) ||
    /^amendement\b/i.test(s) ||
    /^sous-amendement\b/i.test(s)
  ) {
    const sujet = extractAmendementSujet(s);
    if (sujet) return cleanSpaces(sujet);

    s = s
      .replace(/^l['’]amendement\s+n[°º]?\s*\d+\s+de\s+/i, "")
      .replace(/^l['’]amendement\s+n[°º]?\s*\d+\s+à\s+/i, "")
      .replace(/^amendement\s+n[°º]?\s*\d+\s+de\s+/i, "")
      .replace(/^amendement\s+n[°º]?\s*\d+\s+à\s+/i, "")
      .replace(/^sous-amendement\s+n[°º]?\s*\d+\s+de\s+/i, "")
      .replace(/^sous-amendement\s+n[°º]?\s*\d+\s+à\s+/i, "")
      .replace(/^l['’]amendement\s+identique\s+/i, "")
      .replace(/^amendement\s+identique\s+/i, "");

    const t = cleanSpaces(s);
    if (
      !t ||
      t.length < 8 ||
      /^(m\.?|mme|monsieur|madame)\b/i.test(t) ||
      t.toLowerCase() === "m"
    ) {
      return original;
    }
    return t;
  }

  return cleanSpaces(s);
}

/* =========================
   Scrutin sur amendement (fix majeur + titres courts)
========================= */

function normApos(s: string) {
  return cleanSpaces(String(s ?? "")).replace(/[’]/g, "'");
}

function isVoteOnAmendementFromOfficial(officialRaw: string) {
  const s = normApos(officialRaw).toLowerCase();
  return (
    s.startsWith("l'amendement") ||
    s.startsWith("amendement") ||
    s.startsWith("sous-amendement")
  );
}

function extractLawNameFromOfficial(officialRaw: string) {
  const s = normApos(officialRaw);

  const m =
    s.match(/\bdu\s+(projet|proposition)\s+de\s+loi\s+(.+?)(?:\.|\(|$)/i) ||
    s.match(/\bde\s+la\s+(proposition)\s+de\s+loi\s+(.+?)(?:\.|\(|$)/i);

  if (!m) return "";
  const full = `${m[1]} de loi ${m[2]}`;
  return cleanSpaces(full);
}

function humanizeLawLabelFromOfficial(officialRaw: string): string {
  const s = cleanSpaces(officialRaw);
  if (!s) return "Texte en débat";

  const inferred = inferSujetFromText(s);
  if (inferred?.label) return inferred.label;

  let x = s
    .replace(/\bdu\s+projet\s+de\s+loi\s+/i, "")
    .replace(/\bdu\s+proposition\s+de\s+loi\s+/i, "")
    .replace(/\bde\s+la\s+proposition\s+de\s+loi\s+/i, "")
    .replace(/^(projet|proposition)\s+de\s+loi\s+/i, "")
    .trim();

  x = stripGranularPrefix(x);
  x = clampText(x, 80);

  return x || "Texte en débat";
}

function stripLoiPrefix(s: string) {
  return cleanSpaces(String(s ?? "")).replace(/^loi\s*:\s*/i, "");
}

function stripLawProceduralPrefix(s: string) {
  return cleanSpaces(s)
    .replace(/^(du|de la)\s+/i, "")
    .replace(/^(projet|proposition)\s+de\s+loi\s+/i, "")
    .replace(/^loi\s+spéciale\s+/i, "Loi spéciale ")
    .trim();
}

/**
 * ✅ GARDE-FOU (HERO) :
 * scrutin + officialRaw=amendement => HERO = loi, pas amendement
 */
function buildHeroTitleForScrutinWhenOfficialIsAmendement(officialRaw: string): string {
  const law = extractLawNameFromOfficial(officialRaw);

  const inferred = law ? inferSujetFromText(law) : null;
  let label =
    cleanSpaces(inferred?.label ?? "") ||
    stripLawProceduralPrefix(law || "") ||
    humanizeLawLabelFromOfficial(officialRaw);

  label = stripLoiPrefix(label);
  label = normalizeEditorialTitle(label);

  const low = label.toLowerCase();
  if (low.includes("amendement") || low.includes("sous-amendement")) {
    label = stripGranularPrefix(label);
    label = stripLoiPrefix(label);
    label = cleanSpaces(label);
  }

  if (!label) return "Vote à l’Assemblée";
  return smartClampFR(label, 90);
}

/* =========================
   Sujet loi lisible depuis du texte brut
========================= */

function inferSujetFromText(text: string): InferredSujet {
  const raw0 = cleanSpaces(text);
  const raw = stripGranularPrefix(raw0);
  const t = raw.toLowerCase();

  if (
    t.includes("loi spéciale") &&
    (t.includes("article 45") ||
      t.includes("loi organique du 1er août 2001") ||
      t.includes("loi organique du 1 août 2001"))
  ) {
    return { key: "loi-speciale-45-lolf", label: "Loi spéciale (article 45 LOLF)" };
  }

  {
    const m =
      t.match(
        /(projet|proposition)\s+de\s+loi\s+de\s+financement\s+de\s+la\s+s[ée]curit[ée]\s+sociale\s+pour\s+(20\d{2})/
      ) || t.match(/financement\s+de\s+la\s+s[ée]curit[ée]\s+sociale\s+pour\s+(20\d{2})/);
    if (m) {
      const year = m[m.length - 1];
      return { key: `plfss-${year}`, label: `PLFSS ${year}` };
    }
  }

  if (t.includes("jeux olymp") || t.includes("olympique") || /\bjo\b/.test(t)) {
    const y = raw.match(/(20\d{2})/);
    const year = y?.[1];
    if (year) return { key: `jo-${year}`, label: `Jeux Olympiques ${year}` };
    return { key: "jo", label: "Jeux Olympiques" };
  }

  {
    const m =
      t.match(/(projet|proposition)\s+de\s+loi\s+de\s+finances\s+pour\s+(20\d{2})/) ||
      t.match(/loi\s+de\s+finances\s+pour\s+(20\d{2})/);
    if (m) {
      const year = m[m.length - 1];
      return { key: `finances-${year}`, label: `Finances ${year}` };
    }
  }

  {
    const m = raw.match(/projet de loi\s+(?:relatif|relative)\s+à\s+([^.;\n]+)/i);
    if (m?.[1]) {
      const sujet = clampText(m[1], 180);
      const key = `loi:${normSlug(sujet)}`;
      return { key, label: `${capitalizeSentence(sujet)}` };
    }
  }

  {
    const m = raw.match(
      /proposition de loi\s+(visant à|portant|relative à|relatif à)\s+([^.;\n]+)/i
    );
    if (m?.[2]) {
      const sujet = clampText(m[2], 180);
      const key = `loi:${normSlug(sujet)}`;
      return { key, label: `${capitalizeSentence(sujet)}` };
    }
  }

  {
    const m = raw.match(/proposition de loi\s+([^.;\n]+)/i);
    if (m?.[1]) {
      const sujet = clampText(m[1], 180);
      const key = `loi:${normSlug(sujet)}`;
      return { key, label: `${capitalizeSentence(sujet)}` };
    }
  }

  return null;
}

function getLoiKey(it: ActuItem): string {
  // ✅ si on a un id canon DB, on le garde tel quel
  if (it.loi_id) return String(it.loi_id);

  const text = `${it.title ?? ""} ${it.titre ?? ""} ${it.objet ?? ""} ${it.subtitle ?? ""} ${
    it.tldr ?? ""
  }`;
  const inferred = inferSujetFromText(text);
  if (inferred) return inferred.key;

  const baseTitle = stripGranularPrefix(String(it.objet ?? it.title ?? it.titre ?? "")).slice(0, 140);
  const slug = normSlug(baseTitle);
  if (slug) return `title:${slug}`;

  return "no-loi";
}

export function buildGroupKey(it: ActuItem): string {
  const day = dayOf(it.date);
  const loiKey = getLoiKey(it);

  if (it.entity === "scrutin" && loiKey === "no-loi") {
    return `scrutin|${it.id}`;
  }

  const phasePart = it.entity === "amendement" ? "any-phase" : it.phase_label ?? "no-phase";
  return [it.entity, loiKey, day, phasePart].join("|");
}

/* =========================
   Display helpers (WOW)
========================= */

function computeSubtitle(row: GroupedActuRow): string {
  const { scrutins, amendements, total } = row.summary;

  const parts: string[] = [];
  if (scrutins) parts.push(`${scrutins} scrutin${scrutins > 1 ? "s" : ""}`);
  if (amendements) parts.push(`${amendements} amendement${amendements > 1 ? "s" : ""}`);

  return parts.length ? parts.join(" • ") : `${total} élément${total > 1 ? "s" : ""}`;
}

function computeLongTitle(row: GroupedActuRow): string | undefined {
  const first = row.items?.[0];
  const raw = first?.objet ?? first?.titre ?? first?.title ?? first?.subtitle ?? "";
  const cleaned = stripGranularPrefix(raw);
  const t = cleanSpaces(cleaned);

  if (!t || t.length < 45) return undefined;
  return clampText(t, 220);
}

function computeHighlights(row: GroupedActuRow): string[] | undefined {
  const items = [...(row.items ?? [])].sort((a, b) =>
    String(b.date ?? "").localeCompare(String(a.date ?? ""))
  );

  const pickVoteOutcome = (txt: string) => {
    const s = txt.toLowerCase();
    if (s.includes("adopt")) return "Vote adopté";
    if (s.includes("rejet") || s.includes("n'a pas adopté") || s.includes("n’a pas adopté"))
      return "Vote rejeté";
    return "Vote à retenir";
  };

  const out: string[] = [];

  const phase = cleanSpaces(row.phase_label ?? "");
  if (phase) out.push(phase);

  if (row.entity === "scrutin") {
    const t = cleanSpaces(`${items[0]?.subtitle ?? ""} ${items[0]?.tldr ?? ""} ${items[0]?.objet ?? ""}`);
    out.push(pickVoteOutcome(t));
  } else if (row.entity === "amendement") {
    out.push(row.summary.amendements > 1 ? "Amendements examinés" : "Amendement examiné");
  } else if (row.entity === "motion") {
    out.push("Événement parlementaire");
  } else if (row.entity === "declaration") {
    out.push("Déclaration publique");
  } else if (row.entity === "loi") {
    out.push("Avancée du texte");
  }

  const { scrutins, amendements } = row.summary;
  if (scrutins || amendements) {
    const parts: string[] = [];
    if (scrutins) parts.push(`${scrutins} vote${scrutins > 1 ? "s" : ""}`);
    if (amendements) parts.push(`${amendements} amendement${amendements > 1 ? "s" : ""}`);
    out.push(parts.join(" • "));
  }

  const uniq = Array.from(new Set(out.map((x) => cleanSpaces(x)).filter(Boolean)));
  return uniq.slice(0, 3);
}

/* =========================
   HERO EDITORIAL (≤ 90 chars)
========================= */

export function buildHeroEditorialTitle(input: string): string {
  let s = cleanSpaces(input);

  s = s.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "");
  const lower = s.toLowerCase();

  if (/^(l['’]?\s*)?(sous-)?amendement\b/i.test(s)) {
    const sujet = extractAmendementSujet(s);
    if (sujet) s = sujet;
    else return "Modification du texte";
  }

  const isLoiSpeciale =
    lower.includes("loi spéciale") &&
    (lower.includes("article 45") ||
      lower.includes("loi organique du 1er août 2001") ||
      lower.includes("loi organique du 1 août 2001"));
  if (isLoiSpeciale) {
    return smartClampFR("Permettre à l’État de fonctionner sans budget voté", 90);
  }

  s = s
    .replace(/^l['’]article\s+unique\s+(du|de la|de l['’])\s+/i, "")
    .replace(/^article\s+unique\s+(du|de la|de l['’])\s+/i, "")
    .replace(/\bdu\s+projet\s+de\s+loi\s+/i, "")
    .replace(/\bde\s+la\s+proposition\s+de\s+loi\s+/i, "")
    .replace(/^pour\s+/i, "");

  s = s
    .replace(/^l['’]ensemble\s+du\s+/i, "")
    .replace(/^(projet|proposition)\s+de\s+loi\s+/i, "")
    .replace(/^projet\s+de\s+loi\s+spéciale\s+/i, "")
    .replace(/^visant\s+à\s+/i, "")
    .replace(/^tendant\s+à\s+/i, "")
    .replace(/^portant\s+/i, "")
    .replace(/^relative?\s+à\s+/i, "")
    .replace(/^relatif\s+à\s+/i, "")
    .replace(/^sur\s+/i, "");

  s = s
    .replace(/\b(sur le fondement de|au regard de|en application de)\b.*$/i, "")
    .replace(/\b(article|articles)\s+\d+.*$/i, "")
    .replace(/\bloi\s+n[°º]?\s*[0-9-]+.*$/i, "")
    .replace(/\b(du|de la|des)\s+code\b.*$/i, "");

  s = s.split(/[.;:\n]+/)[0];

  s = cleanSpaces(s);
  if (!s) return "Vote à l’Assemblée";

  const low = s.toLowerCase();
  if (low === "décider" || low === "decider" || low === "voter" || low === "vote") {
    return "Vote à l’Assemblée";
  }

  s = s.charAt(0).toUpperCase() + s.slice(1);
  return smartClampFR(s, 90);
}

function isWeakEditorialTitle(s: string): boolean {
  const t = cleanSpaces(s);
  if (!t) return true;
  if (t.length < 12) return true;

  const low = t.toLowerCase();
  if (low === "vote à l’assemblée" || low === "vote a l’assemblee") return false;

  if (low === "m" || low === "mme" || low === "m." || low === "décision" || low === "decision")
    return true;
  if (low === "actualité parlementaire") return true;

  if (/^(m\.?|mme|monsieur|madame)\b/i.test(t)) return true;

  if (
    low.startsWith("amendement") ||
    low.startsWith("sous-amendement") ||
    low.startsWith("l'amendement") ||
    low.startsWith("l’ensemble") ||
    low.startsWith("ensemble du") ||
    low === "modification du texte"
  )
    return true;

  return false;
}

function buildEditorialTitleForRow(row: GroupedActuRow): string {
  const items = row.items ?? [];
  const first = items[0];

  const officialRaw = first?.objet ?? first?.titre ?? first?.title ?? first?.subtitle ?? "";

  if (row.entity === "scrutin" && officialRaw && isVoteOnAmendementFromOfficial(officialRaw)) {
    return buildHeroTitleForScrutinWhenOfficialIsAmendement(officialRaw);
  }

  const corpus = items
    .slice(0, 8)
    .map((x) =>
      stripGranularPrefix(
        `${x.objet ?? ""} ${x.titre ?? ""} ${x.title ?? ""} ${x.subtitle ?? ""} ${x.tldr ?? ""}`
      )
    )
    .join(" ");

  const inferred = inferSujetFromText(corpus);
  const sujet = inferred?.label ? cleanSpaces(inferred.label) : "";

  let title = buildHeroEditorialTitle(stripGranularPrefix(officialRaw));

  if (isWeakEditorialTitle(title)) {
    const retry = buildHeroEditorialTitle(corpus);
    if (retry && !isWeakEditorialTitle(retry)) title = retry;
  }

  if (isWeakEditorialTitle(title)) {
    if (row.entity === "amendement") {
      const amendSujet = extractAmendementSujet(officialRaw) ?? extractAmendementSujet(corpus);
      if (amendSujet) title = smartClampFR(`Modifier : ${amendSujet}`, 90);
      else if (sujet) title = smartClampFR(`Modifier : ${sujet}`, 90);
      else title = "Modification du texte";
    } else {
      if (sujet) title = smartClampFR(`Vote : ${sujet}`, 90);
      else title = "Vote à l’Assemblée";
    }
  }

  const low = cleanSpaces(title).toLowerCase();
  if (low === "décision" || low === "decision" || low === "décision importante à l’assemblée") {
    title = "Vote important à l’Assemblée";
  }

  return smartClampFR(title, 90);
}

/**
 * ✅ Choix de navigation par défaut pour un group
 * Règle produit : si on a un ID canon DB de loi, on ouvre la loi (par défaut).
 * Le scrutin reste accessible via secondaryTargets.
 */
function defaultTargetForRow(row: GroupedActuRow): ActuTarget {
  const canon = cleanSpaces(String((row as any)?.loi_id ?? ""));

  // ✅ Si on a un vrai id canon DB (pas "loi:slug" / pas "title:slug"), on ouvre la loi
  if (canon && canon !== "no-loi" && !canon.startsWith("loi:") && !canon.startsWith("title:")) {
    return { kind: "loi", id: canon };
  }

  const newest = [...(row.items ?? [])].sort((a, b) =>
    String(b.date ?? "").localeCompare(String(a.date ?? ""))
  )[0];

  if (row.entity === "scrutin" && newest?.id) return { kind: "scrutin", id: newest.id };
  if (row.entity === "amendement" && newest?.id) return { kind: "amendement", id: newest.id };
  if (row.entity === "motion" && newest?.id) return { kind: "motion", id: newest.id };
  if (row.entity === "declaration" && newest?.id) return { kind: "declaration", id: newest.id };

  return { kind: "loi", id: row.loi_id ?? "no-loi" };
}

export function groupActuItems(items: ActuItem[]): GroupedActuRow[] {
  const map = new Map<string, GroupedActuRow>();

  for (const it of items) {
    const key = buildGroupKey(it);

    // ✅ canon DB si dispo (sinon null)
    const loiCanonId = cleanSpaces(String((it as any)?.loi_id ?? "")) || null;

    if (!map.has(key)) {
      map.set(key, {
        kind: "group",
        groupKey: key,
        entity: it.entity,

        // ✅ on stocke l’ID canon DB si dispo (sinon on pourra rester sur une clé éditoriale plus tard)
        loi_id: loiCanonId,

        phase_label: it.phase_label ?? null,
        day: dayOf(it.date),
        dateMax: it.date,
        items: [],
        summary: { total: 0, amendements: 0, scrutins: 0, articles: 0 },
        primaryTarget: undefined,
        secondaryTargets: undefined,
        display: { title: "", subtitle: "", tag: it.phase_label ?? "" },
      });
    }

    const g = map.get(key)!;

    // ✅ si on récupère un canon id plus tard, on l’attache au group
    const cur = cleanSpaces(String((g as any).loi_id ?? ""));
    if (loiCanonId && (!cur || cur === "no-loi" || cur.startsWith("loi:") || cur.startsWith("title:"))) {
      (g as any).loi_id = loiCanonId;
    }

    g.items.push(it);
    g.summary.total += 1;

    if (it.entity === "amendement") g.summary.amendements += 1;
    if (it.entity === "scrutin") g.summary.scrutins += 1;
    if (it.article_ref) g.summary.articles += 1;

    if ((it.date ?? "") > (g.dateMax ?? "")) g.dateMax = it.date;
  }

  const rows = Array.from(map.values());

  for (const row of rows) {
    row.display.longTitle = computeLongTitle(row);

    // ✅ titre éditorial + micro-polish final
    row.display.title = normalizeEditorialTitle(buildEditorialTitleForRow(row));

    row.display.subtitle = computeSubtitle(row);
    row.display.tag = row.phase_label ?? "";
    row.display.highlights = computeHighlights(row);

    // ✅ navigation stable
    row.primaryTarget = defaultTargetForRow(row);
    row.secondaryTargets = row.items.slice(0, 8).map((it) => ({ kind: it.entity, id: it.id }));
  }

  rows.sort((a, b) => (b.dateMax ?? "").localeCompare(a.dateMax ?? ""));
  return rows;
}
