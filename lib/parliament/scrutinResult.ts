// lib/parliament/scrutinResult.ts

export type ScrutinOutcome = "ADOPTE" | "REJETE" | "NEUTRE";

/**
 * Source de vérité ActuDesLois
 * - 1 scrutin = 1 vérité
 * - Ne déduit pas un "résultat global de loi"
 * - Corrige le faux positif "n’a pas adopté" (contient "adopté")
 */
export function parseScrutinOutcome(resultat: string | null | undefined): ScrutinOutcome {
  if (!resultat) return "NEUTRE";

  const r = String(resultat)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  // ✅ Négations avant tout (évite faux positif)
  const negAdopt =
    r.includes("n'a pas adopté") ||
    r.includes("n’a pas adopté") ||
    r.includes("n'est pas adopté") ||
    r.includes("n’est pas adopté") ||
    r.includes("pas adopté") ||
    r.includes("n'a été adopté") ||
    r.includes("n’a été adopté");

  if (negAdopt) return "REJETE";

  // ✅ Rejet (certains libellés utilisent "rejeté")
  if (r.includes("rejet") || r.includes("rejeté") || r.includes("rejetée")) return "REJETE";

  // ✅ Adopté (après négations)
  if (r.includes("adopté") || r.includes("adoptée") || r.includes("adoption") || r.includes("adopt")) return "ADOPTE";

  return "NEUTRE";
}

export function outcomeToLabel(outcome: ScrutinOutcome): string | null {
  if (outcome === "ADOPTE") return "Adoptée";
  if (outcome === "REJETE") return "Rejetée";
  return null;
}
