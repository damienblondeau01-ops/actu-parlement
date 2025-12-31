// lib/theme.ts
export const theme = {
  // ✅ Mode principal de l'app (référence)
  mode: "paper" as const, // "paper" | "dark"

  colors: {
    // Dark (gardé, utile plus tard)
    background: "#020617",
    card: "#0B1120",
    surface: "#020617",
    border: "#1E293B",
    text: "#F9FAFB",
    subtext: "#9CA3AF",
    primary: "#4F46E5",
    primarySoft: "rgba(79, 70, 229, 0.16)",
    danger: "#EF4444",
  },

  // ✅ Papier = référence UI (à utiliser partout)
  paper: {
    bg: "#F6F1E8",
    card: "#FBF7F0",
    ink: "#121417",
    inkSoft: "rgba(18,20,23,0.62)",
    inkSoft2: "rgba(18,20,23,0.72)",
    line: "rgba(18,20,23,0.14)",
    lineSoft: "rgba(18,20,23,0.08)",
    highlight: "rgba(255,255,255,0.22)",
  },

  radius: {
    pill: 999,
    lg: 16,
    xl: 22,
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
  // Si plus tard tu ajoutes un switch, tu remplaceras theme.mode par un state
  if (theme.mode === "paper") {
    return {
      bg: theme.paper.bg,
      card: theme.paper.card,
      text: theme.paper.ink,
      subtext: theme.paper.inkSoft,
      border: theme.paper.line,
      // "accent" générique (utile pour boutons/CTA)
      primary: theme.colors.primary,
      primarySoft: theme.colors.primarySoft,
      danger: theme.colors.danger,
      // extra papier
      paper: theme.paper,
    };
  }

  // Dark
  return {
    bg: theme.colors.background,
    card: theme.colors.card,
    text: theme.colors.text,
    subtext: theme.colors.subtext,
    border: theme.colors.border,
    primary: theme.colors.primary,
    primarySoft: theme.colors.primarySoft,
    danger: theme.colors.danger,
    paper: theme.paper,
  };
}
