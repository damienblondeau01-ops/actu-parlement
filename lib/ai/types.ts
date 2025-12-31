// lib/ai/types.ts

/**
 * Contrat IMMUTABLE de sortie IA
 * Règle : 1 phrase = 1 source vérifiable
 */
export type EnClairItem = {
  text: string;          // Phrase lisible pour l’utilisateur
  source_kind: string;   // "texte_integral" | "expose_motifs" | "an_dossier"
  source_label: string;  // Label humain affiché
  source_url: string;    // URL officielle cliquable
};
