// lib/supabaseClient.ts
import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";

type ExtraConfig = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as ExtraConfig;

if (!extra.supabaseUrl || !extra.supabaseAnonKey) {
  throw new Error(
    "Supabase : supabaseUrl ou supabaseAnonKey manquants dans expo.extra (app.config/app.json)."
  );
}

export const supabase = createClient(
  extra.supabaseUrl,
  extra.supabaseAnonKey
);
