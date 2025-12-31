// lib/loi/timelineCanon.ts

import type { LoiTimelineRow } from "@/lib/queries/lois";

export type TimelineYearSection = {
  yearLabel: string; // "2025" | "2024" | "Date inconnue"
  items: LoiTimelineRow[];
};

function getYearLabel(date?: string | null) {
  if (!date) return "Date inconnue";
  const d = new Date(String(date));
  if (!Number.isFinite(d.getTime())) return "Date inconnue";
  return String(d.getFullYear());
}

/**
 * ✅ Regroupe des rows (déjà triées DESC) par année.
 * - Années triées desc
 * - "Date inconnue" toujours à la fin
 * - Conserve l'ordre interne des items
 */
export function groupTimelineByYear(rows: LoiTimelineRow[]): TimelineYearSection[] {
  const safe = Array.isArray(rows) ? rows : [];
  if (!safe.length) return [];

  const map = new Map<string, LoiTimelineRow[]>();

  for (const r of safe) {
    const y = getYearLabel(r?.date_scrutin ?? null);
    const arr = map.get(y) ?? [];
    arr.push(r);
    map.set(y, arr);
  }

  const years = Array.from(map.keys()).sort((a, b) => {
    if (a === "Date inconnue") return 1;
    if (b === "Date inconnue") return -1;
    return Number(b) - Number(a);
  });

  return years.map((y) => ({
    yearLabel: y,
    items: map.get(y) ?? [],
  }));
}
