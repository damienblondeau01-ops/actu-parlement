import { RecentVote, VoteKey, SignalLevel, SafeScores } from "./types";
import { normalizeVoteKey, voteLabel } from "./utils";

export function summarizeRecentSignals(recentVotes: RecentVote[]) {
  const items = (recentVotes ?? []).slice(0, 6);

  const counts: Record<VoteKey, number> = { pour: 0, contre: 0, abstention: 0, nv: 0 };
  const seq: VoteKey[] = [];

  items.forEach((v) => {
    const k = normalizeVoteKey(v.vote);
    counts[k] += 1;
    seq.push(k);
  });

  const nonNv = items.length - counts.nv;

  const engagement = (() => {
    if (items.length === 0) return { label: "Aucun vote récent", level: "info" as SignalLevel };
    if (counts.nv >= Math.ceil(items.length / 2))
      return { label: "Beaucoup de non-votes récents", level: "warn" as SignalLevel };
    if (nonNv >= 4) return { label: "Plutôt actif récemment", level: "ok" as SignalLevel };
    return { label: "Activité récente limitée", level: "info" as SignalLevel };
  })();

  const dominant = (Object.keys(counts) as VoteKey[]).sort((a, b) => counts[b] - counts[a])[0];

  const dominantLabel =
    items.length === 0
      ? { label: "—", level: "info" as SignalLevel }
      : dominant === "nv"
      ? { label: "Tendance : non-vote", level: "warn" as SignalLevel }
      : { label: `Tendance : ${voteLabel(dominant)}`, level: "ok" as SignalLevel };

  const streak = (() => {
    if (seq.length < 3) return null;
    const last = seq[0];
    if (!last) return null;
    let run = 1;
    for (let i = 1; i < seq.length; i++) {
      if (seq[i] === last) run += 1;
      else break;
    }
    if (run >= 3) {
      return {
        label: `Série : ${voteLabel(last)} ×${run}`,
        level: last === "nv" ? ("warn" as const) : ("info" as const),
      };
    }
    return null;
  })();

  return {
    itemsCount: items.length,
    counts,
    engagement,
    dominantLabel,
    streak,
  };
}

export function computeDeltaHints(scores: SafeScores) {
  const p = scores.participation;
  const l = scores.loyaute;
  const m = scores.majorite;

  const hints: { title: string; text: string; level: SignalLevel }[] = [];

  if (p !== null && p < 45) {
    hints.push({
      title: "Fiabilité",
      text: "Participation faible : les tendances peuvent être moins représentatives.",
      level: "warn",
    });
  }

  if (l !== null && l < 50) {
    hints.push({
      title: "Écarts au groupe",
      text: "Loyauté faible : il/elle s’écarte régulièrement de la ligne majoritaire du groupe.",
      level: "info",
    });
  } else if (l !== null && l >= 80) {
    hints.push({
      title: "Discipline de groupe",
      text: "Loyauté élevée : il/elle suit très souvent la position majoritaire du groupe.",
      level: "ok",
    });
  }

  if (m !== null && m >= 60 && (l === null || l < 75)) {
    hints.push({
      title: "Transversal",
      text: "Alignement majorité élevé sans discipline totale : possible rôle de “pivot” sur certains textes.",
      level: "info",
    });
  }

  if (hints.length === 0) {
    hints.push({
      title: "Lecture",
      text: "Tendance mixte : à lire scrutin par scrutin (derniers votes ci-dessous).",
      level: "info",
    });
  }

  return hints.slice(0, 3);
}

export function signalPillStyle(level: SignalLevel) {
  if (level === "ok") return "ok";
  if (level === "warn") return "warn";
  return "info";
}
