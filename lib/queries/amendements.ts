import { supabase } from "@/lib/supabaseClient";
import type { AmendementHighlight } from "@/components/loi/AmendementsHighlights";

export type AmendementContractRow = {
  loi_id: string;
  numero_scrutin: string | null;
  date_amendement: string | null;
  amendement_uid: string;
  titre: string | null;
  article_ref: string | null;
  context_label: string | null;
  author_label: string | null;
  author_group: string | null;
  preview: string | null;
  outcome_norm: "adopte" | "rejete" | "retire" | "tombe" | "irrecevable" | "nonRenseigne";
  outcome_label: string | null;
};

export async function fetchAmendementsByLoi(loiId: string) {
  const safe = String(loiId || "").trim();
  if (!safe) return [];

  const { data, error } = await supabase
    .from("amendements_loi_contract_v1")
    .select(
      "loi_id,numero_scrutin,date_amendement,amendement_uid,titre,article_ref,context_label,author_label,author_group,preview,outcome_norm,outcome_label"
    )
    .eq("loi_id", safe)
    .order("date_amendement", { ascending: false, nullsFirst: false })
    .limit(500);

  if (error) {
    console.warn("[AMENDEMENTS] fetchAmendementsByLoi error", error);
    return [];
  }
  return (data ?? []) as AmendementContractRow[];
}

function toneFromOutcome(outcome: AmendementContractRow["outcome_norm"]): "success" | "warn" | "mute" | "soft" {
  if (outcome === "adopte") return "success";
  if (outcome === "rejete" || outcome === "irrecevable") return "warn";
  if (outcome === "retire" || outcome === "tombe") return "mute";
  return "soft";
}

export function pickAmendementsHighlights(rows: AmendementContractRow[], limit = 6): AmendementHighlight[] {
  const rank = (o: AmendementContractRow["outcome_norm"]) => {
    switch (o) {
      case "adopte":
        return 1;
      case "rejete":
        return 2;
      case "irrecevable":
        return 3;
      case "retire":
        return 4;
      case "tombe":
        return 5;
      default:
        return 9;
    }
  };

  const sorted = [...rows].sort((a, b) => {
    const ra = rank(a.outcome_norm);
    const rb = rank(b.outcome_norm);
    if (ra !== rb) return ra - rb;
    const da = a.date_amendement ?? "";
    const db = b.date_amendement ?? "";
    return db.localeCompare(da);
  });

  const out: AmendementHighlight[] = [];
  const seenAuthor = new Set<string>();
  const seenArticle = new Set<string>();

  for (const r of sorted) {
    if (out.length >= limit) break;

    const authorKey = `${(r.author_label ?? "").trim()}|${(r.author_group ?? "").trim()}`.trim();
    const articleKey = (r.article_ref ?? "").trim();

    const penalty =
      (authorKey && seenAuthor.has(authorKey) ? 1 : 0) + (articleKey && seenArticle.has(articleKey) ? 1 : 0);

    if (penalty >= 2 && sorted.length > limit + 2) continue;

    out.push({
      id: r.amendement_uid,
      title: (r.titre ?? r.amendement_uid).trim(),
      subtitle: [r.article_ref, r.context_label].filter(Boolean).join(" — ") || "Amendement",
      outcome: r.outcome_norm,
      outcomeLabel: r.outcome_label ?? "Non renseigné",
      tone: toneFromOutcome(r.outcome_norm),
      date: r.date_amendement ?? undefined,
      articleRef: r.article_ref ?? undefined,
      authorLabel: r.author_label ?? undefined,
      authorGroup: r.author_group ?? undefined,
      preview: r.preview ?? undefined,
      link: r.numero_scrutin
        ? { type: "scrutin", href: `/scrutins/${encodeURIComponent(String(r.numero_scrutin))}` }
        : { type: "amendement", href: `/amendements/${encodeURIComponent(r.amendement_uid)}` },
    });

    if (authorKey) seenAuthor.add(authorKey);
    if (articleKey) seenArticle.add(articleKey);
  }

  // fallback si on a filtré trop fort
  if (out.length < Math.min(limit, sorted.length)) {
    for (const r of sorted) {
      if (out.length >= limit) break;
      if (out.some((x) => x.id === r.amendement_uid)) continue;

      out.push({
        id: r.amendement_uid,
        title: (r.titre ?? r.amendement_uid).trim(),
        subtitle: [r.article_ref, r.context_label].filter(Boolean).join(" — ") || "Amendement",
        outcome: r.outcome_norm,
        outcomeLabel: r.outcome_label ?? "Non renseigné",
        tone: toneFromOutcome(r.outcome_norm),
        date: r.date_amendement ?? undefined,
        articleRef: r.article_ref ?? undefined,
        authorLabel: r.author_label ?? undefined,
        authorGroup: r.author_group ?? undefined,
        preview: r.preview ?? undefined,
        link: r.numero_scrutin
          ? { type: "scrutin", href: `/scrutins/${encodeURIComponent(String(r.numero_scrutin))}` }
          : { type: "amendement", href: `/amendements/${encodeURIComponent(r.amendement_uid)}` },
      });
    }
  }

  return out;
}
