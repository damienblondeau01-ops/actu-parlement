import { SafeScores } from "./types";

function qualifierScore(v: number | null): "high" | "mid" | "low" | "na" {
  if (v === null || !Number.isFinite(v)) return "na";
  if (v >= 75) return "high";
  if (v >= 50) return "mid";
  return "low";
}

export function phraseScore(
  label: "participation" | "loyaute" | "majorite",
  v: number | null
): string {
  const q = qualifierScore(v);

  if (q === "na") {
    if (label === "participation")
      return "Participation : données insuffisantes pour estimer le niveau de présence.";
    if (label === "loyaute")
      return "Loyauté : données insuffisantes pour estimer l’alignement avec le groupe.";
    return "Majorité : données insuffisantes pour estimer l’alignement avec la majorité.";
  }

  const pct = `${v!.toFixed(0)}%`;

  if (label === "participation") {
    if (q === "high") return `Il/elle participe très régulièrement (${pct}).`;
    if (q === "mid") return `Il/elle participe assez souvent (${pct}).`;
    return `Il/elle participe peu (${pct}).`;
  }

  if (label === "loyaute") {
    if (q === "high") return `Votes très alignés avec son groupe (${pct}).`;
    if (q === "mid") return `Votes parfois alignés avec son groupe (${pct}).`;
    return `Votes souvent en écart avec son groupe (${pct}).`;
  }

  if (q === "high") return `Souvent aligné(e) avec la majorité (${pct}).`;
  if (q === "mid") return `Position intermédiaire vis-à-vis de la majorité (${pct}).`;
  return `Souvent à contre-courant de la majorité (${pct}).`;
}
