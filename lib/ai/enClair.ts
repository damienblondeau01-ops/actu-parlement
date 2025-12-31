// lib/ai/enClair.ts
import type { LoiSourceItem } from "@/lib/queries/lois";
import type { EnClairItem } from "@/lib/ai/types";

/**
 * V1 ultra-safe : 3–5 bullets max, chaque bullet DOIT avoir une source.
 * Pas de source => pas de bullet.
 * Pas de "déduction" à partir de la timeline ici (on reste isolé).
 */
export async function generateEnClairV1(params: {
  loiId: string;
  // ✅ On passe du texte si on l’a, sinon null
  texteIntegralClean?: string | null;
  // ⚠️ Si tu n'as pas encore l'exposé des motifs en texte, laisse null
  exposeMotifsText?: string | null;
  sources: LoiSourceItem[];
}): Promise<EnClairItem[]> {
  const { texteIntegralClean, exposeMotifsText, sources } = params;

  if (!sources || sources.length === 0) return [];

  // Index des sources par kind
  const byKind: Record<string, LoiSourceItem> = {};
  for (const s of sources) {
    if (s?.kind && s?.url) byKind[s.kind] = s;
  }

  const out: EnClairItem[] = [];

  // 1) Exposé des motifs (si dispo)
  if (exposeMotifsText && byKind["expose_motifs"]) {
    out.push({
      text: "Le texte expose les objectifs poursuivis et la logique générale de la réforme.",
      source_kind: "expose_motifs",
      source_label: byKind["expose_motifs"].label,
      source_url: byKind["expose_motifs"].url,
    });
  }

  // 2) Texte intégral (si dispo)
  if (texteIntegralClean && byKind["texte_integral"]) {
    out.push({
      text: "Le dispositif prévoit les règles et mesures applicables telles qu’elles figurent dans le texte intégral.",
      source_kind: "texte_integral",
      source_label: byKind["texte_integral"].label,
      source_url: byKind["texte_integral"].url,
    });
  }

  // 3) Dossier AN (si dispo)
  if (byKind["an_dossier"]) {
    out.push({
      text: "Le parcours législatif complet est consultable dans le dossier officiel de l’Assemblée nationale.",
      source_kind: "an_dossier",
      source_label: byKind["an_dossier"].label,
      source_url: byKind["an_dossier"].url,
    });
  }

  // Limite stricte V1
  return out.slice(0, 5);
}
