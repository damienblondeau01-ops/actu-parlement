import { supabase } from "@/lib/supabaseClient";
import type { LoiSearchRow } from "@/lib/dbContract";

export async function searchLoisFeed(q: string, lim = 30) {
  const query = (q ?? "").trim();

  // Option UX: si vide, tu peux soit renvoyer [], soit charger un feed "latest"
  if (!query) return { data: [] as LoiSearchRow[], error: null as any };

  const { data, error } = await supabase.rpc("search_lois_feed", { q: query, lim });

  return { data: (data ?? []) as LoiSearchRow[], error };
}
