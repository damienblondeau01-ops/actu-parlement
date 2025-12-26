// components/actu/types.ts
export type Tone = "blue" | "pink" | "mint" | "amber" | "violet";

export type ActuItemUI = {
  id: string;
  dateISO: string;

  title: string;
  subtitle: string;

  // Hero only (optionnel)
  statsLine?: string;
  longTitle?: string;
  highlights?: string[];

  // ActuCard only (optionnel)
  why?: string;

  tone: Tone;
  iconLib: "ion" | "mci";
  iconName: string;

  tag?: string;
  groupKey?: string;

  /** total réel (truth) */
  groupCount?: number;

  /** nb réellement affiché dans le feed (après cap) */
  previewCount?: number;
};
