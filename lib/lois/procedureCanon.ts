// lib/lois/procedureCanon.ts
// But: convertir les étapes "dossier" (loi_procedure_app) en timeline canon UI.
// Zéro supabase ici -> fonction pure, testable.

export type CanonProof = { label: string; href: string };

export type CanonTimelineStep = {
  label: string;
  date?: string;
  result?: string;
  proofs?: CanonProof[];
};

export type LoiProcedureRow = {
  loi_id?: string | null;
  dossier_id: string | null;
  step_index: number | null;
  step_kind: string | null;
  chambre: string | null;
  lecture: string | null;
  label: string | null;
  date_start: string | null; // YYYY-MM-DD
  date_end: string | null;
  source_label: string | null;
  source_url: string | null;
};

function clean(s: any) {
  return String(s ?? "").trim();
}

function fmtISODate(d: string | null | undefined) {
  const s = clean(d);
  if (!s) return undefined;
  // On laisse en ISO, l'écran fait déjà fmtDateFR au besoin.
  return s;
}

function kindLabel(kind: string) {
  const k = clean(kind).toUpperCase();
  if (!k) return "Étape";
  if (k === "DOSSIER_AN") return "Dossier législatif (AN)";
  if (k === "DEPOT") return "Dépôt";
  if (k === "PROMULGATION") return "Promulgation";
  if (k === "JO") return "Publication au JO";
  if (k === "AN") return "Assemblée nationale";
  if (k === "SENAT") return "Sénat";
  return k.replace(/_/g, " ");
}

export function buildProcedureTimeline(
  rows: LoiProcedureRow[] | null | undefined,
  joDate?: string | null
): CanonTimelineStep[] {
  const src = Array.isArray(rows) ? rows : [];

  // tri stable: step_index ASC puis date_start ASC
  const sorted = [...src].sort((a, b) => {
    const ia = Number(a?.step_index ?? 0);
    const ib = Number(b?.step_index ?? 0);
    if (ia !== ib) return ia - ib;

    const da = a?.date_start ? Date.parse(String(a.date_start)) : 0;
    const db = b?.date_start ? Date.parse(String(b.date_start)) : 0;
    return (Number.isFinite(da) ? da : 0) - (Number.isFinite(db) ? db : 0);
  });

  const steps: CanonTimelineStep[] = sorted.map((r) => {
    const label =
      clean(r?.label) ||
      kindLabel(r?.step_kind ?? "") ||
      (r?.chambre ? `Étape ${r.chambre}` : "Étape");

    const date = fmtISODate(r?.date_start);

    const proofs: CanonProof[] = [];
    const href = clean(r?.source_url);
    if (href) {
      proofs.push({
        label: clean(r?.source_label) || "Source",
        href,
      });
    }

    // petit “result” optionnel, lisible
    const chambre = clean(r?.chambre);
    const lecture = clean(r?.lecture);
    const meta = [chambre, lecture].filter(Boolean).join(" · ");

    return {
      label: meta ? `${label} — ${meta}` : label,
      date,
      result: undefined,
      proofs: proofs.length ? proofs : [],
    };
  });

  // ✅ Ajoute le JO si on l’a (provenant de Actu ou d’un autre module)
  const jo = clean(joDate);
  if (jo) {
    steps.push({
      label: "Promulgation (JO)",
      date: jo,
      result: "Loi promulguée",
      proofs: [],
    });
  }

  // ✅ fallback minimal si rien
  if (steps.length === 0) {
    return [
      {
        label: "Dossier (non disponible)",
        date: undefined,
        result: undefined,
        proofs: [],
      },
    ];
  }

  return steps;
}
