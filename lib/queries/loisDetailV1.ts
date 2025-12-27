// lib/queries/loisDetailV1.ts

import {
  fetchLoiDetail,
  fetchLoiTimeline,
  fetchVotesGroupesByScrutin,
  type LoiTimelineRow,
  type VoteGroupePositionRow,
} from "@/lib/queries/lois";

import { pickReferenceScrutin as pickReferenceScrutinCanon } from "@/lib/parliament/referenceScrutin";

/**
 * ✅ IMPORTANT
 * On supprime l'import cassé "@/lib/contracts/loiDetail" (TS2307)
 * et on redéfinit ici les DTO utilisés par V1.
 *
 * Ça te permet de garder v1.tsx et cette query sans dépendre d'un "contracts" disparu.
 */

// ---------------- DTOs (V1 minimal, alignés sur l'usage ci-dessous) ----------------

type StatusDTO = "READY" | "MISSING" | "ERROR";

export type VoteTotalsDTO = { pour: number; contre: number; abstention: number };

export type VoteGroupRowDTO = {
  groupe_id: string;
  groupe_abrev: string;
  groupe_label: string;
  pour: number;
  contre: number;
  abstention: number;
};

export type TimelineEventDTO = {
  type: "VOTE_AN";
  chamber: "AN";
  date: string | null;
  title: string;
  description: string;
  icon: "gavel";
  proof: { kind: "scrutin"; scrutin_numero: string };
};

export type LoiDetailDTO = {
  hero: {
    id_dossier: string;
    titre: string;
    type_texte: string | null;
    etat: "PROMULGUEE" | "ADOPTEE" | "REJETEE" | "EN_COURS" | "INCONNU";
    legislature_context: number | null;
    cross_legislature: boolean;
    period_label: string | null;
  };

  tldr: {
    status: StatusDTO;
    text: string | null;
    updated_at: string | null;
    model_version: string | null;
    sources_used: string[] | null;
  };

  why_it_matters: {
    status: StatusDTO;
    bullets: string[];
  };

  timeline: {
    status: StatusDTO;
    events: TimelineEventDTO[];
    key_scrutin: { numero: string; reason: string } | null;
  };

  votes_by_group: {
    status: StatusDTO;
    scrutin_numero: string | null;
    totals: VoteTotalsDTO | null;
    top_groups: VoteGroupRowDTO[];
    all_groups_count: number;
  };

  scrutins: {
    status: StatusDTO;
    items: Array<{
      numero: string;
      date: string | null;
      title_officiel: string;
      objet: string | null;
      resultat: string | null;
      chamber: "AN";
    }>;
  };

  sources: {
    dossier_an_url: string | null;
    updated_at: string | null;
  };
};

// ---------------- helpers (V1, simple & safe) ----------------

function toLoiState(etatLabel?: string | null): LoiDetailDTO["hero"]["etat"] {
  const x = String(etatLabel ?? "").toLowerCase();
  if (x.includes("promul")) return "PROMULGUEE";
  if (x.includes("adopt")) return "ADOPTEE";
  if (x.includes("rejet")) return "REJETEE";
  if (x.includes("cours")) return "EN_COURS";
  return "INCONNU";
}

function sumTotalsFromGroupRows(rows: VoteGroupePositionRow[]): VoteTotalsDTO {
  // rows = positions par groupe ; on re-somme par bucket
  let pour = 0,
    contre = 0,
    abstention = 0;

  for (const r of rows ?? []) {
    const pos = String(r.position ?? "").toLowerCase();
    const n = Number(r.nb_voix ?? 0) || 0;
    if (pos.includes("pour")) pour += n;
    else if (pos.includes("contre")) contre += n;
    else if (pos.includes("abst")) abstention += n;
  }

  return { pour, contre, abstention };
}

function topGroups(
  rows: VoteGroupePositionRow[],
  top = 6
): { topRows: VoteGroupRowDTO[]; allCount: number } {
  // Agrège par groupe_norm puis calcule pour/contre/abstention
  const map = new Map<string, VoteGroupRowDTO>();

  for (const r of rows ?? []) {
    const gid = String((r as any).groupe_norm ?? r.groupe ?? "").trim() || "UNKNOWN";
    const abrev = String(r.groupe_abrev ?? "").trim();
    const label =
      String((r as any).groupe_label ?? r.groupe_nom ?? abrev ?? gid).trim() || gid;

    if (!map.has(gid)) {
      map.set(gid, {
        groupe_id: gid,
        groupe_abrev: abrev || gid,
        groupe_label: label,
        pour: 0,
        contre: 0,
        abstention: 0,
      });
    }

    const g = map.get(gid)!;
    const pos = String(r.position ?? "").toLowerCase();
    const n = Number(r.nb_voix ?? 0) || 0;

    if (pos.includes("pour")) g.pour += n;
    else if (pos.includes("contre")) g.contre += n;
    else if (pos.includes("abst")) g.abstention += n;
  }

  const all = Array.from(map.values());
  // tri : groupes les plus “engagés” (pour+contre+abst)
  all.sort(
    (a, b) =>
      b.pour + b.contre + b.abstention - (a.pour + a.contre + a.abstention)
  );

  return { topRows: all.slice(0, top), allCount: all.length };
}

function timelineFromScrutinsV1(scrutinsDesc: LoiTimelineRow[]): TimelineEventDTO[] {
  // V1 : timeline compacte basée uniquement sur les scrutins AN
  // Contrat actuel : type = "VOTE_AN" et icon = "gavel" (littéraux stricts)
  const sorted = [...(scrutinsDesc ?? [])].sort((a, b) => {
    const da = a.date_scrutin ? new Date(a.date_scrutin).getTime() : 0;
    const db = b.date_scrutin ? new Date(b.date_scrutin).getTime() : 0;
    return db - da;
  });

  const seen = new Set<string>();
  const out: TimelineEventDTO[] = [];

  const isAmendementLike = (s: LoiTimelineRow) => {
    const k = String((s as any)?.kind ?? "").toLowerCase();
    const text = `${s.objet ?? ""} ${s.titre ?? ""}`.toLowerCase();
    return k.includes("amend") || text.includes("amendement") || text.includes("sous-amendement") || text.includes("sous amendement");
  };

  const isArticleLike = (s: LoiTimelineRow) => {
    const k = String((s as any)?.kind ?? "").toLowerCase().trim();
    const text = `${s.objet ?? ""} ${s.titre ?? ""} ${s.article_ref ?? ""}`.toLowerCase();
    return k === "article" || text.includes("article ");
  };

  const pickTitle = (s: LoiTimelineRow, idx: number) => {
    if (idx === 0) return "Vote le plus récent";
    if (idx === 1) return "Vote clé";
    if (isAmendementLike(s)) return "Vote sur un amendement";
    if (isArticleLike(s)) return "Vote sur une partie du texte";
    return "Vote à l’Assemblée nationale";
  };

  for (const s of sorted) {
    const numero = s.numero_scrutin != null ? String(s.numero_scrutin).trim() : "";
    if (!numero) continue;
    if (seen.has(numero)) continue;
    seen.add(numero);

    const rawDesc = (s.objet ?? s.titre ?? "Vote").trim();
    const desc = rawDesc.length > 140 ? `${rawDesc.slice(0, 137)}…` : rawDesc;

    out.push({
      type: "VOTE_AN",
      chamber: "AN",
      date: s.date_scrutin ?? null,
      title: pickTitle(s, out.length),
      description: desc,
      icon: "gavel",
      proof: { kind: "scrutin", scrutin_numero: numero },
    });

    if (out.length >= 9) break;
  }

  return out;
}



// ---------------- main ----------------

export async function fetchLoiDetailV1(id: string): Promise<LoiDetailDTO | null> {
  const key = String(id ?? "").trim();
  if (!key) return null;

  const loi = await fetchLoiDetail(key);
  if (!loi) return null;

  // ⚠️ pour ton écran "loi" (non scrutin-backed), la timeline est indexée par loi_id (canon)
  // si tu passes des group_key ici, fais-le côté écran (tu le fais déjà dans index.tsx)
  const tl = await fetchLoiTimeline(key, 250);

  const timelineDesc = [...(tl ?? [])].sort((a, b) => {
    const da = a.date_scrutin ? new Date(a.date_scrutin).getTime() : 0;
    const db = b.date_scrutin ? new Date(b.date_scrutin).getTime() : 0;
    return db - da;
  });

  const pick = pickReferenceScrutinCanon(timelineDesc as any);
  const refNumero = pick?.numero_scrutin ? String(pick.numero_scrutin) : null;

  // Votes par groupe (preuve) sur scrutin clé
  let votesRows: VoteGroupePositionRow[] = [];
  if (refNumero) {
    votesRows = (await fetchVotesGroupesByScrutin(refNumero)) as any;
  }

  const totals = votesRows.length ? sumTotalsFromGroupRows(votesRows) : null;
  const tg = votesRows.length ? topGroups(votesRows, 6) : { topRows: [], allCount: 0 };

  const dto: LoiDetailDTO = {
    hero: {
      // ⚠️ V1: on n’a pas encore id_dossier => on met l’id courant (migration phase 2)
      id_dossier: key,
      titre: (loi.titre_loi ?? `Loi ${key}`).trim(),
      type_texte: null,
      etat: toLoiState(null),
      legislature_context: loi.legislature ?? null,
      cross_legislature: false,
      period_label: null,
    },

    tldr: {
      status: "MISSING",
      text: null,
      updated_at: null,
      model_version: null,
      sources_used: null,
    },

    why_it_matters: { status: "MISSING", bullets: [] },

    timeline: {
      status: timelineDesc.length ? "READY" : "MISSING",
      events: timelineDesc.length ? timelineFromScrutinsV1(timelineDesc) : [],
      key_scrutin: refNumero
        ? { numero: refNumero, reason: String(pick?.reason ?? "reference_pick") }
        : null,
    },

    votes_by_group: {
      status: refNumero && votesRows.length ? "READY" : "MISSING",
      scrutin_numero: refNumero,
      totals,
      top_groups: tg.topRows,
      all_groups_count: tg.allCount,
    },

    scrutins: {
      status: timelineDesc.length ? "READY" : "MISSING",
      items: timelineDesc.map((s) => ({
        numero: String(s.numero_scrutin),
        date: s.date_scrutin,
        title_officiel: String(s.titre ?? "").trim() || "Scrutin",
        objet: s.objet,
        resultat: s.resultat,
        chamber: "AN",
      })),
    },

    sources: {
      dossier_an_url: null, // phase 2
      updated_at: null,
    },
  };

  return dto;
}
