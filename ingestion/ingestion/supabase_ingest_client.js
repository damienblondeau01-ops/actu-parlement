import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

// ⚠️ Assure-toi d'avoir un .env avec SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY, // besoin privilèges insert/upsert
  { auth: { persistSession: false } }
);
