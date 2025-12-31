import "dotenv/config";

export default {
  expo: {
    name: "Actu Parlement",
    slug: "actu-parlement",
    version: "1.0.0",
    orientation: "portrait",
    userInterfaceStyle: "light",

    scheme: "actudeslois",

    android: {
      package: "com.anonymous.actuparlement", // 🔑 OBLIGATOIRE
      backgroundColor: "#F6F1E8",              // 🔑 SUPPRIME LE FLASH NOIR
    },

    ios: {
      backgroundColor: "#F6F1E8",
    },

    splash: {
      image: "./assets/splash.png",
      resizeMode: "contain",
      backgroundColor: "#F6F1E8",
    },

    extra: {
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    },

    assetBundlePatterns: ["**/*"],
  },
};
