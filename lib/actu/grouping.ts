// lib/actu/grouping.ts

export type Entity = "scrutin" | "loi" | "amendement" | "motion" | "declaration";

export type ActuItem = {
  id: string;
  entity: Entity;
  type?: string;

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

export type GroupedActuRow = {
  kind: "group";
  groupKey: string;
  entity: Entity;

  /**
   * ⚠️ Ici, on stocke une "loiKey" stable (loi_id réel si dispo, sinon fallback intelligent)
   * Exemple: "jo-2030", "finances-2026", "loi:reforme-assurance-chomage", "title:..."
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
  display: {
    title: string; // sujet éditorial (ex: "Loi Finances 2026")
    subtitle: string; // détail (ex: "73 scrutins", etc.)
    tag: string; // ex: phase_label
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

/* =========================
   Sujet / Loi
========================= */

type InferredSujet = { key: string; label: string } | null;

function cleanSpaces(s: string) {
  return (s || "").replace(/\s+/g, " ").trim();
}

function capitalizeSentence(s: string) {
  const t = cleanSpaces(s);
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Nettoie les prefixes trop "granulaires" qu'on voit souvent dans les titres:
 * - "l'article 2 de la proposition de loi ..."
 * - "l'amendement n° 1 de ..."
 * - "amendement identique ..."
 *
 * Objectif: remonter au "sujet loi" au lieu de l’article/amendement.
 */
function stripGranularPrefix(text: string): string {
  let s = cleanSpaces(text);

  // article X de/du ...
  s = s.replace(/^l['’]article\s+\d+\s+de\s+la\s+/i, "");
  s = s.replace(/^l['’]article\s+\d+\s+du\s+/i, "");
  s = s.replace(/^article\s+\d+\s+de\s+la\s+/i, "");
  s = s.replace(/^article\s+\d+\s+du\s+/i, "");

  // amendement n° X de/à ...
  s = s.replace(/^l['’]amendement\s+n[°º]?\s*\d+\s+de\s+/i, "");
  s = s.replace(/^l['’]amendement\s+n[°º]?\s*\d+\s+à\s+/i, "");
  s = s.replace(/^amendement\s+n[°º]?\s*\d+\s+de\s+/i, "");
  s = s.replace(/^amendement\s+n[°º]?\s*\d+\s+à\s+/i, "");

  // "amendement identique ..."
  s = s.replace(/^l['’]amendement\s+identique\s+/i, "");
  s = s.replace(/^amendement\s+identique\s+/i, "");

  return s;
}

/**
 * Essaie de sortir un "sujet loi" lisible depuis du texte brut.
 * Objectif: produire "Loi Finances 2026", "Loi Jeux Olympiques 2030", "Loi Réforme …"
 */
function inferSujetFromText(text: string): InferredSujet {
  // ✅ nettoyage éditorial en amont (évite "article 2 de ..." comme sujet)
  const raw0 = cleanSpaces(text);
  const raw = stripGranularPrefix(raw0);
  const t = raw.toLowerCase();

  // 1) JO / Olympiques (générique + année si trouvée)
{
  if (t.includes("jeux olymp") || t.includes("olympique") || /\bjo\b/.test(t)) {
    const y = raw.match(/(20\d{2})/);
    const year = y?.[1];
    if (year) return { key: `jo-${year}`, label: `Loi Jeux Olympiques ${year}` };
    return { key: "jo", label: "Jeux Olympiques" };
  }
}

  // 2) Loi de finances (PLF) - ex: "projet de loi de finances pour 2026"
  {
    const m =
      t.match(/(projet|proposition)\s+de\s+loi\s+de\s+finances\s+pour\s+(20\d{2})/) ||
      t.match(/loi\s+de\s+finances\s+pour\s+(20\d{2})/);
    if (m) {
      const year = m[m.length - 1];
      return { key: `finances-${year}`, label: `Loi Finances ${year}` };
    }
  }

  // 3) "projet de loi relatif à ..." => capture le sujet après "relatif à"
  {
    const m = raw.match(/projet de loi\s+(?:relatif|relative)\s+à\s+([^.;\n]+)/i);
    if (m?.[1]) {
      const sujet = cleanSpaces(m[1]).slice(0, 90);
      const key = `loi:${normSlug(sujet)}`;
      return { key, label: `Loi ${capitalizeSentence(sujet)}` };
    }
  }

  // 4) "proposition de loi visant à ..." / "portant ..." / "relative à ..."
  {
    const m = raw.match(
      /proposition de loi\s+(visant à|portant|relative à|relatif à)\s+([^.;\n]+)/i
    );
    if (m?.[2]) {
      const sujet = cleanSpaces(m[2]).slice(0, 90);
      const key = `loi:${normSlug(sujet)}`;
      return { key, label: `Loi ${capitalizeSentence(sujet)}` };
    }
  }

  // 5) si on voit "proposition de loi ..." sans motif clair, on tente de prendre la suite
  {
    const m = raw.match(/proposition de loi\s+([^.;\n]+)/i);
    if (m?.[1]) {
      const sujet = cleanSpaces(m[1]).slice(0, 90);
      const key = `loi:${normSlug(sujet)}`;
      return { key, label: `Loi ${capitalizeSentence(sujet)}` };
    }
  }

  return null;
}

function getLoiKey(it: ActuItem): string {
  // 1) vrai loi_id si dispo (id dossier / loi_id normalisé côté DB)
  if (it.loi_id) return String(it.loi_id);

  // 2) inférence via texte (avec nettoyage granularité)
  const text = `${it.title ?? ""} ${it.titre ?? ""} ${it.objet ?? ""} ${it.subtitle ?? ""} ${it.tldr ?? ""}`;
  const inferred = inferSujetFromText(text);
  if (inferred) return inferred.key;

  // 3) fallback slug sur texte "long" mais stable
  const baseTitle = stripGranularPrefix(String(it.objet ?? it.title ?? it.titre ?? "")).slice(0, 140);
  const slug = normSlug(baseTitle);
  if (slug) return `title:${slug}`;

  return "no-loi";
}

function formatLoiLabel(loiKey?: string | null, items?: ActuItem[]): string | null {
  if (!loiKey) return null;

  // clés connues
  if (loiKey === "jo-2030") return "Loi Jeux Olympiques 2030";

  // finances-2026
  if (/^finances-\d{4}$/.test(loiKey)) {
    const year = loiKey.split("-")[1];
    return `Loi Finances ${year}`;
  }

  // loi:...
  if (loiKey.startsWith("loi:")) {
    const base = loiKey.replace("loi:", "").replace(/-/g, " ");
    return `Loi ${capitalizeSentence(base)}`;
  }

  // retenter une inférence label depuis le texte (utile pour "title:...")
  if (items?.length) {
    const text = `${items[0]?.title ?? ""} ${items[0]?.titre ?? ""} ${items[0]?.objet ?? ""} ${items[0]?.subtitle ?? ""} ${items[0]?.tldr ?? ""}`;
    const inferred = inferSujetFromText(text);
    if (inferred) return inferred.label;
  }

  // title:xxxx -> propre
  if (loiKey.startsWith("title:")) {
    const base = loiKey.replace("title:", "").replace(/-/g, " ");
    return capitalizeSentence(base);
  }

  return null;
}

/* =========================
   Group key
========================= */

export function buildGroupKey(it: ActuItem): string {
  const day = dayOf(it.date);
  const loiKey = getLoiKey(it);

  // ✅ éviter mega-groupe des scrutins non rattachés
  if (it.entity === "scrutin" && loiKey === "no-loi") {
    return `scrutin|${it.id}`;
  }

  const phasePart = it.entity === "amendement" ? "any-phase" : it.phase_label ?? "no-phase";
  return [it.entity, loiKey, day, phasePart].join("|");
}

/* =========================
   Display
========================= */

function computeSubtitle(row: GroupedActuRow): string {
  const { scrutins, amendements, total } = row.summary;

  const parts: string[] = [];
  if (scrutins) parts.push(`${scrutins} scrutin${scrutins > 1 ? "s" : ""}`);
  if (amendements) parts.push(`${amendements} amendement${amendements > 1 ? "s" : ""}`);

  const stats = parts.length ? parts.join(" • ") : `${total} élément${total > 1 ? "s" : ""}`;

  // ✅ si groupe = 1 item, on peut ajouter un micro-détail après les stats
  if (total === 1 && row.items[0]) {
    const it = row.items[0];
    const hint = cleanSpaces(it.subtitle ?? it.tldr ?? it.objet ?? it.titre ?? "");
    if (hint) return `${stats} — ${hint.slice(0, 90)}`;
  }

  return stats;
}

function computeDisplayTitle(row: GroupedActuRow): string {
  // 1️⃣ priorité absolue : sujet loi explicite
  const loiLabel = formatLoiLabel(row.loi_id, row.items);
  if (loiLabel) return loiLabel;

  // 2️⃣ tentative éditoriale depuis les items (avec nettoyage granularité)
  const text = row.items
    .map((x) =>
      stripGranularPrefix(`${x.title ?? ""} ${x.titre ?? ""} ${x.objet ?? ""} ${x.subtitle ?? ""}`)
    )
    .join(" ");

  const inferred = inferSujetFromText(text);
  if (inferred?.label) return inferred.label;

  // 3️⃣ fallback par nature (plus citoyen que "Sujet parlementaire en cours")
  if (row.entity === "scrutin") return "Votes récents à l’Assemblée";
  if (row.entity === "amendement") return "Amendements récents";
  if (row.entity === "motion") return "Événements parlementaires";
  if (row.entity === "declaration") return "Déclarations récentes";

  return "Activité parlementaire";
}

/* =========================
   Main
========================= */

export function groupActuItems(items: ActuItem[]): GroupedActuRow[] {
  const map = new Map<string, GroupedActuRow>();

  for (const it of items) {
    const key = buildGroupKey(it);
    const loiKey = getLoiKey(it);

    if (!map.has(key)) {
      map.set(key, {
        kind: "group",
        groupKey: key,
        entity: it.entity,
        loi_id: loiKey,
        phase_label: it.phase_label ?? null,
        day: dayOf(it.date),
        dateMax: it.date,
        items: [],
        summary: { total: 0, amendements: 0, scrutins: 0, articles: 0 },
        display: { title: "", subtitle: "", tag: it.phase_label ?? "" },
      });
    }

    const g = map.get(key)!;
    g.items.push(it);
    g.summary.total += 1;

    if (it.entity === "amendement") g.summary.amendements += 1;
    if (it.entity === "scrutin") g.summary.scrutins += 1;
    if (it.article_ref) g.summary.articles += 1;

    if ((it.date ?? "") > (g.dateMax ?? "")) g.dateMax = it.date;
  }

  const rows = Array.from(map.values());

  for (const row of rows) {
    // ✅ IMPORTANT : ne pas écraser row.entity (sinon tags/icônes deviennent incohérents)
    row.display.title = computeDisplayTitle(row);
    row.display.subtitle = computeSubtitle(row);
    row.display.tag = row.phase_label ?? "";
  }

  rows.sort((a, b) => (b.dateMax ?? "").localeCompare(a.dateMax ?? ""));
  return rows;
}
