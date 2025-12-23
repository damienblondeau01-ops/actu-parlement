// lib/parliament/referenceScrutin.ts
import type { LoiTimelineRow } from "@/lib/queries/lois";

/**
 * Normalisation forte :
 * - minuscules
 * - accents supprimés
 * - apostrophes unifiées (', ’) -> '
 * - espaces compressés
 */
function norm(s: string | null | undefined): string {
  const raw = String(s ?? "");

  // 1) unify apostrophes early
  const apostropheUnified = raw
    .replace(/[’`´]/g, "'")
    .replace(/“|”/g, '"');

  // 2) remove accents via unicode decomposition
  const noDiacritics = apostropheUnified
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  // 3) lower + whitespace normalize
  return noDiacritics
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export type ReferenceKind =
  | "ENSEMBLE"
  | "PARTIE"
  | "CMP"
  | "STRUCTURANT"
  | "AMENDEMENT"
  | "UNKNOWN";

export type ReferencePick = {
  numero_scrutin: string;
  kind: ReferenceKind;
  reason: string;
};

function textAll(r: LoiTimelineRow): string {
  return norm(`${r.titre ?? ""} ${r.objet ?? ""} ${r.article_ref ?? ""} ${r.kind ?? ""}`);
}

function isAmendement(r: LoiTimelineRow): boolean {
  const t = textAll(r);
  // couvre "amendement", "sous-amendement", "sous amendement"
  return (
    t.includes("sous-amendement") ||
    t.includes("sous amendement") ||
    t.includes("amendement")
  );
}

function isCMP(r: LoiTimelineRow): boolean {
  const t = textAll(r);
  return (
    t.includes("cmp") ||
    t.includes("commission mixte paritaire")
  );
}

function isVoteEnsemble(r: LoiTimelineRow): boolean {
  const t = textAll(r);
  // couvre : "sur l'ensemble", "sur l ensemble", "ensemble du texte"
  return (
    t.includes("ensemble du texte") ||
    t.includes("sur l'ensemble") ||
    t.includes("sur l ensemble")
  );
}

function isPartiePLF(r: LoiTimelineRow): boolean {
  const t = textAll(r);

  return (
    // parties + article liminaire
    t.includes("premiere partie") ||
    t.includes("1ere partie") ||
    t.includes("1ere") && t.includes("partie") ||
    t.includes("seconde partie") ||
    t.includes("2e partie") ||
    t.includes("deuxieme partie") ||
    t.includes("article liminaire") ||

    // variantes fréquentes (sans accent grâce à norm)
    t.includes("article liminaire")
  );
}

function isStructurantNonAmendement(r: LoiTimelineRow): boolean {
  if (isAmendement(r)) return false;

  // Si c'est déjà identifié comme structurant fort
  if (isVoteEnsemble(r) || isPartiePLF(r) || isCMP(r)) return true;

  // fallback doux : vote clairement sur le texte (évite procédure si possible)
  const t = textAll(r);

  const looksTextual =
    t.includes("projet de loi") ||
    t.includes("proposition de loi") ||
    t.includes("texte") ||
    t.includes("lecture definitive") ||
    t.includes("nouvelle lecture");

  const looksVote =
    t.includes("scrutin") ||
    t.includes("vote") ||
    t.includes("public") ||
    t.includes("solennel");

  return looksTextual || looksVote;
}

/**
 * Choix canonique du scrutin de référence pour une loi.
 * IMPORTANT : on suppose timeline triée date DESC (plus récent en premier).
 */
export function pickReferenceScrutin(timeline: LoiTimelineRow[]): ReferencePick | null {
  if (!timeline?.length) return null;

  const rows = (timeline ?? []).filter((r) => !!r?.numero_scrutin);
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const ensemble = rows.find(isVoteEnsemble);
  if (ensemble) {
    return {
      numero_scrutin: ensemble.numero_scrutin,
      kind: "ENSEMBLE",
      reason: "vote sur l'ensemble du texte",
    };
  }

  const partie = rows.find(isPartiePLF);
  if (partie) {
    return {
      numero_scrutin: partie.numero_scrutin,
      kind: "PARTIE",
      reason: "vote sur une partie (PLF / article liminaire)",
    };
  }

  const cmp = rows.find(isCMP);
  if (cmp) {
    return {
      numero_scrutin: cmp.numero_scrutin,
      kind: "CMP",
      reason: "commission mixte paritaire",
    };
  }

  const structurant = rows.find(isStructurantNonAmendement);
  if (structurant) {
    return {
      numero_scrutin: structurant.numero_scrutin,
      kind: "STRUCTURANT",
      reason: "scrutin structurant non-amendement (fallback)",
    };
  }

  const amend = rows.find(isAmendement);
  if (amend) {
    return {
      numero_scrutin: amend.numero_scrutin,
      kind: "AMENDEMENT",
      reason: "fallback amendement (aucun vote structurant trouvé)",
    };
  }

  return {
    numero_scrutin: rows[0].numero_scrutin,
    kind: "UNKNOWN",
    reason: "fallback premier scrutin disponible",
  };
}

export function referenceKindLabel(kind: ReferenceKind): string | null {
  if (kind === "ENSEMBLE") return "Vote sur l’ensemble";
  if (kind === "PARTIE") return "Vote sur une partie";
  if (kind === "CMP") return "CMP";
  if (kind === "STRUCTURANT") return "Vote structurant";
  if (kind === "AMENDEMENT") return "Amendement";
  return null;
}
