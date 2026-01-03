// lib/queries/explorer.ts
import { supabase } from "@/lib/supabase";

export type ExplorerPeriod = {
  minDate: string | null; // "YYYY-MM-DD"
  maxDate: string | null; // "YYYY-MM-DD"
};

export type ExplorerSummary = {
  period: ExplorerPeriod;
  totalCount: number | null;
};

function safeDateFromISO(dateISO?: string | null): Date | null {
  if (!dateISO) return null;
  // date est stockée en TEXT "YYYY-MM-DD" => Date(dateISO) OK
  const d = new Date(dateISO);
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * Format court FR :
 * - "oct. 2024 – déc. 2025"
 * - si pas de dates => "—"
 */
export function formatPeriodFR(period: ExplorerPeriod): string {
  const dMin = safeDateFromISO(period.minDate);
  const dMax = safeDateFromISO(period.maxDate);
  if (!dMin || !dMax) return "—";

  const fmt = (d: Date) =>
    d
      .toLocaleString("fr-FR", { month: "short", year: "numeric" })
      .replace(".", ""); // "oct. 2024" -> "oct 2024" (si tu préfères sans point)

  return `${fmt(dMin)} – ${fmt(dMax)}`;
}

/**
 * Explorer — période globale
 * Source : public.actu_feed_v1
 * Règle produit :
 * - période = min(date) / max(date) sur TOUTES les données
 */
export async function fetchExplorerPeriod(): Promise<ExplorerPeriod> {
  // MIN
  const { data, error } = await supabase
    .from("actu_feed_v1")
    .select("date")
    .order("date", { ascending: true })
    .limit(1);

  if (error) {
    console.error("[Explorer][Period][min] error", error);
    return { minDate: null, maxDate: null };
  }

  const minDate = data?.[0]?.date ?? null;

  // MAX
  const { data: dataMax, error: errorMax } = await supabase
    .from("actu_feed_v1")
    .select("date")
    .order("date", { ascending: false })
    .limit(1);

  if (errorMax) {
    console.error("[Explorer][Period][max] error", errorMax);
    return { minDate, maxDate: null };
  }

  const maxDate = dataMax?.[0]?.date ?? null;

  return { minDate, maxDate };
}

/**
 * Explorer — count global (toutes les lignes)
 * NOTE: "head: true" évite de rapatrier des lignes, on récupère juste le count.
 */
export async function fetchExplorerTotalCount(): Promise<number | null> {
  const { error, count } = await supabase
    .from("actu_feed_v1")
    .select("*", { count: "exact", head: true });

  if (error) {
    console.error("[Explorer][Count] error", error);
    return null;
  }

  return typeof count === "number" ? count : null;
}

/**
 * Explorer — Summary global (période + volume)
 */
export async function fetchExplorerSummary(): Promise<ExplorerSummary> {
  const [period, totalCount] = await Promise.all([
    fetchExplorerPeriod(),
    fetchExplorerTotalCount(),
  ]);

  return { period, totalCount };
}
