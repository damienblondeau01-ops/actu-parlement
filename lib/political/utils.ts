import { VoteKey } from "./types";

export function computeSafeNumber(
  value: number | string | null
): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function normalizeVoteKey(v?: string | null): VoteKey {
  const x = String(v ?? "").toLowerCase();
  if (!x) return "nv";
  if (x.includes("pour")) return "pour";
  if (x.includes("contre")) return "contre";
  if (x.includes("abst")) return "abstention";
  if (
    (x.includes("non") && x.includes("vot")) ||
    x.includes("nv") ||
    x.includes("non-vot")
  )
    return "nv";
  return "nv";
}

export function voteLabel(key: VoteKey): string {
  if (key === "pour") return "Pour";
  if (key === "contre") return "Contre";
  if (key === "abstention") return "Abstention";
  return "Non votant";
}
