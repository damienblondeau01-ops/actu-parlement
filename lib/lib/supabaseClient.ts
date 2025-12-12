// lib/supabaseClient.ts
import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";

// ✅ On câble DIRECTEMENT le bon projet ici
const SUPABASE_URL = "https://mvoepocedfwjqdhcjyjt.supabase.co";

// ⛔ À REMPLACER par ta vraie clé ANON (Project API → anon public)
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12b2Vwb2NlZGZ3anFkaGNqeWp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMwODUxOTQsImV4cCI6MjA3ODY2MTE5NH0.Gjpr715Jw7C_wgrMFYDm5FtF6LPvGyN1CZ0yYzECBQw";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "Supabase : URL ou anon key manquants dans supabaseClient.ts (hardcodé)."
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
