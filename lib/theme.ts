// lib/theme.ts

// =======================================
// 🎛️ 1) PANNEAU DE CONTRÔLE (1 endroit)
// =======================================
// ➜ Change ces 2 valeurs pour modifier l'app entière
const PAPER_PROFILE = "soft" as const; // "flat" | "soft" | "strong"
const ACCENT_PROFILE = "indigo" as const; // "indigo" | "blue" | "teal" | "orange" | "rose"

// Helpers
function pick<T extends Record<string, any>, K extends keyof T>(obj: T, key: K) {
  return obj[key];
}

// =======================================
// 🎨 2) PROFILES (relief / contraste)
// =======================================

type PaperProfile = "flat" | "soft" | "strong";
type AccentProfile = "indigo" | "blue" | "teal" | "orange" | "rose";

const ACCENTS: Record<
  AccentProfile,
  { primary: string; primarySoft: string; danger: string }
> = {
  indigo: { primary: "#4F46E5", primarySoft: "rgba(79, 70, 229, 0.16)", danger: "#EF4444" },
  blue: { primary: "#2563EB", primarySoft: "rgba(37, 99, 235, 0.16)", danger: "#EF4444" },
  teal: { primary: "#0F766E", primarySoft: "rgba(15, 118, 110, 0.16)", danger: "#EF4444" },
  orange: { primary: "#EA580C", primarySoft: "rgba(234, 88, 12, 0.16)", danger: "#EF4444" },
  rose: { primary: "#E11D48", primarySoft: "rgba(225, 29, 72, 0.14)", danger: "#EF4444" },
};

const PAPER_PROFILES: Record<
  PaperProfile,
  {
    // fonds
    bg: string;
    card: string;
    surface: string;

    // textes
    ink: string;
    inkSoft: string;
    inkSoft2: string;

    // lignes / highlights
    line: string;
    lineSoft: string;
    highlight: string;

    // ✅ relief générique (RN)
    // (tu l’appliques sur les Cards via ...theme.paper.elevation.card)
    elevation: {
      card: {
        shadowColor: string;
        shadowOpacity: number;
        shadowRadius: number;
        shadowOffset: { width: number; height: number };
        elevation: number; // Android
      };
      pill: {
        shadowColor: string;
        shadowOpacity: number;
        shadowRadius: number;
        shadowOffset: { width: number; height: number };
        elevation: number;
      };
    };
  }
> = {
  flat: {
    bg: "#F6F1E8",
    card: "#FBF7F0",
    surface: "#F3EEE4",

    ink: "#121417",
    inkSoft: "rgba(18,20,23,0.62)",
    inkSoft2: "rgba(18,20,23,0.72)",

    line: "rgba(18,20,23,0.14)",
    lineSoft: "rgba(18,20,23,0.08)",
    highlight: "rgba(255,255,255,0.18)",

    elevation: {
      card: {
        shadowColor: "#000",
        shadowOpacity: 0.0,
        shadowRadius: 0,
        shadowOffset: { width: 0, height: 0 },
        elevation: 0,
      },
      pill: {
        shadowColor: "#000",
        shadowOpacity: 0.0,
        shadowRadius: 0,
        shadowOffset: { width: 0, height: 0 },
        elevation: 0,
      },
    },
  },

  soft: {
    bg: "#F6F1E8",
    card: "#FBF7F0",
    surface: "#F3EEE4",

    ink: "#121417",
    inkSoft: "rgba(18,20,23,0.62)",
    inkSoft2: "rgba(18,20,23,0.72)",

    // ✅ un poil plus lisible
    line: "rgba(18,20,23,0.16)",
    lineSoft: "rgba(18,20,23,0.10)",
    // ✅ highlight un peu plus présent pour donner “papier”
    highlight: "rgba(255,255,255,0.28)",

    // ✅ relief léger (effet “carte posée”)
    elevation: {
      card: {
        shadowColor: "#000",
        shadowOpacity: 0.08,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 8 },
        elevation: 3,
      },
      pill: {
        shadowColor: "#000",
        shadowOpacity: 0.06,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 6 },
        elevation: 2,
      },
    },
  },

  strong: {
    bg: "#F6F1E8",
    // ✅ card plus “blanc cassé” pour le contraste
    card: "#FCFAF6",
    surface: "#F1EBDD",

    ink: "#0E1114",
    inkSoft: "rgba(14,17,20,0.66)",
    inkSoft2: "rgba(14,17,20,0.78)",

    // ✅ lignes un peu plus nettes
    line: "rgba(14,17,20,0.20)",
    lineSoft: "rgba(14,17,20,0.12)",
    highlight: "rgba(255,255,255,0.34)",

    // ✅ relief plus marqué (effet “pile de bulletins”)
    elevation: {
      card: {
        shadowColor: "#000",
        shadowOpacity: 0.12,
        shadowRadius: 22,
        shadowOffset: { width: 0, height: 12 },
        elevation: 5,
      },
      pill: {
        shadowColor: "#000",
        shadowOpacity: 0.10,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 10 },
        elevation: 4,
      },
    },
  },
};

// =======================================
// ✅ 3) THÈME FINAL (source de vérité)
// =======================================

const paper = pick(PAPER_PROFILES, PAPER_PROFILE);
const accent = pick(ACCENTS, ACCENT_PROFILE);

export const theme = {
  // ✅ App 100% en "papier"
  mode: "paper" as const,

  // ✅ Palette active (utilisée par les écrans)
  colors: {
    background: paper.bg,
    card: paper.card,
    surface: paper.surface,
    border: paper.line,

    text: paper.ink,
    subtext: paper.inkSoft,

    primary: accent.primary,
    primarySoft: accent.primarySoft,
    danger: accent.danger,

      colors: {
    background: "#F6F1E8",
    card: "#FBF7F0",
    surface: "#F3EEE4",
    border: "rgba(18,20,23,0.14)",

    text: "#121417",
    subtext: "rgba(18,20,23,0.62)",

    primary: "#4F46E5",
    primarySoft: "rgba(79, 70, 229, 0.16)",
    danger: "#EF4444",

    // ✅ AJOUTS “RELIEF” (génériques)
    borderSoft: "rgba(18,20,23,0.08)",
    shadowColor: "rgba(18,20,23,0.22)",
    cardHighlight: "rgba(255,255,255,0.55)",
    cardShadow: "rgba(18,20,23,0.10)",
  },


  },

  // ✅ Tokens papier “riches” (tout est piloté par PAPER_PROFILE)
  paper: {
    ...paper,

    paper: {
    bg: "#F6F1E8",
    card: "#FBF7F0",
    surface: "#F3EEE4",
    ink: "#121417",
    inkSoft: "rgba(18,20,23,0.62)",
    inkSoft2: "rgba(18,20,23,0.72)",
    line: "rgba(18,20,23,0.18)",
    lineSoft: "rgba(18,20,23,0.10)",
    highlight: "rgba(255,255,255,0.22)",
    shadow: "rgba(18,20,23,0.10)",
accentWash: "rgba(79,70,229,0.10)",

    // ✅ AJOUTS “RELIEF”
    
    highlightStrong: "rgba(255,255,255,0.55)",
    accent: {
      width: 4,
      color: "rgba(79,70,229,0.85)", // primary éditorial
      soft: "rgba(79,70,229,0.18)",
    },
  },

    // ✅ accent disponible ici aussi
    accent: accent.primary,
    accentSoft: accent.primarySoft,
  },

  // ✅ Relief global : modifiable en un seul endroit
  elevation: {
    // "papier" : ombre très douce + double bordure (effet relief)
    cardShadow: {
      shadowColor: "rgba(18,20,23,0.20)",
      shadowOpacity: 1,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 6 },
      // Android
      elevation: 3,
    },

    // ombre encore plus légère (rows / mini-cards)
    softShadow: {
      shadowColor: "rgba(18,20,23,0.14)",
      shadowOpacity: 1,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 3 },
      elevation: 1,
    },
  },


  radius: {
    pill: 999,
    lg: 16,
    xl: 22,
  },

  // ✅ alias compat pour l'ancien code (src/components/ui/*)
  radii: {
    card: 16, // même valeur que radius.lg
    full: 999,
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 20,
    xl: 28,
    xxl: 40,
    xxxl: 60,
  },

  fontSize: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 20,
    xl: 24,
  },
} as const;

// ✅ Helpers (sans dépendre de context React)
export type AppThemeMode = typeof theme.mode;

export function ui() {
  // L'app est 100% papier : on renvoie la palette papier
  return {
    bg: theme.paper.bg,
    card: theme.paper.card,
    surface: theme.paper.surface,
    text: theme.paper.ink,
    subtext: theme.paper.inkSoft,
    border: theme.paper.line,
    primary: theme.colors.primary,
    primarySoft: theme.colors.primarySoft,
    danger: theme.colors.danger,
    paper: theme.paper,
  };

  
}
