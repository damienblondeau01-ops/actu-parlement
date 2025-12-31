// lib/lois/canonAdapter.ts
import { parseScrutinOutcome, outcomeToLabel } from "@/lib/parliament/scrutinResult";

export type CanonHeader = {
  title: string;
  status: "Adoptée" | "En cours" | "Rejetée" | "Retirée" | "Promulguée" | "—";
  lastStepLabel: string;
  lastStepDate: string;
  oneLiner: string;
};

export type CanonTimelineStep = {
  label: string;
  date?: string;
  result?: string;
  proofs?: Array<{ label: string; href: string }>;
};

export function fmtDateFR(d?: string | null) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("fr-FR");
  } catch {
    return "—";
  }
}

export function statusFromResultText(resultat?: string | null): CanonHeader["status"] {
  const label = outcomeToLabel(parseScrutinOutcome(resultat));
  if (label === "Adoptée") return "Adoptée";
  if (label === "Rejetée") return "Rejetée";
  return "En cours";
}

/**
 * Adapter minimal:
 * - title: loi.titre_loi
 * - status: depuis le scrutin de référence si dispo, sinon "En cours"
 * - lastStep: depuis le vote le plus récent (timeline[0])
 * - oneLiner: très factuel (à améliorer ensuite)
 */
export function buildCanonHeader(params: {
  loiTitle?: string | null;
  referenceResultText?: string | null;
  lastTimelineLabel?: string | null;
  lastTimelineDate?: string | null;
}) : CanonHeader {
  const title = (params.loiTitle ?? "").trim() || "Loi";
  const status = statusFromResultText(params.referenceResultText ?? null);

  const lastStepLabel = (params.lastTimelineLabel ?? "").trim() || "Dernière étape connue";
  const lastStepDate = fmtDateFR(params.lastTimelineDate ?? null);

  const oneLiner =
    status === "Adoptée"
      ? "Texte adopté (selon le scrutin de référence affiché)."
      : status === "Rejetée"
      ? "Texte rejeté (selon le scrutin de référence affiché)."
      : "Texte en cours d’examen (les prochains votes peuvent faire évoluer la situation).";

  return { title, status, lastStepLabel, lastStepDate, oneLiner };
}
