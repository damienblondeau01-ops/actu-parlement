// lib/theme.ts

export const theme = {
  colors: {
    // Fond global de l’app
    background: "#020617", // bleu nuit très sombre

    // Surfaces
    card: "#0B1120",
    surface: "#020617",
    border: "#1E293B",

    // Texte
    text: "#F9FAFB",
    subtext: "#9CA3AF",

    // Couleur principale (accent)
    primary: "#4F46E5", // violet Finary/Spotify-like
    primarySoft: "rgba(79, 70, 229, 0.16)",

    // États
    danger: "#EF4444",
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
