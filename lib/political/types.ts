export type VoteKey = "pour" | "contre" | "abstention" | "nv";
export type DataScope = "ANALYTICS_L16" | "RECENT_L17" | "MIXED";


export type SafeScores = {
  participation: number | null;
  loyaute: number | null;
  majorite: number | null;
};

export type SignalLevel = "ok" | "warn" | "info";

export type RecentVote = {
  numero_scrutin: string;
  vote: string | null;
  titre: string | null;
  resultat: string | null;
  date_scrutin?: string | null;
};

export type DTriplePlus = {
  title: string;
  analyse: string;
  implication: string;
  confiance: string;
  confLevel: "high" | "mid" | "low";

};
