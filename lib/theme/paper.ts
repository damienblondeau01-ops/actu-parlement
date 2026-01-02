// lib/theme/paper.ts
// ==================
// Thème éditorial "papier"
// Toute modification ici impacte l'app entière

export type PaperReliefLevel = "flat" | "soft" | "strong";

export type PaperTheme = {
  relief: PaperReliefLevel;

  bg: {
    base: string;
    raised: string;
    subtle: string;
  };

  text: {
    title: string;
    body: string;
    muted: string;
    meta: string;
  };

  ink: {
    primary: string;
    positive: string;
    negative: string;
    neutral: string;
  };

  border: {
    soft: string;
  };
};

/**
 * 🎯 Valeurs par défaut
 * (ne pas tuner ici pour l'instant)
 */
export const paperTheme: PaperTheme = {
  relief: "soft",

  bg: {
    base: "#F6F1E8",
    raised: "#FBF8F2",
    subtle: "#EFE9DE",
  },

  text: {
    title: "#1A1A1A",
    body: "#2A2A2A",
    muted: "#6B6B6B",
    meta: "#8A8A8A",
  },

  ink: {
    primary: "#2F6FED",
    positive: "#2E7D32",
    negative: "#C62828",
    neutral: "#6B6B6B",
  },

  border: {
    soft: "rgba(0,0,0,0.06)",
  },
};
