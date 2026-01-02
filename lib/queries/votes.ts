// lib/queries/votes.ts
import { supabase } from "@/lib/supabase"; // ✅ adapte si ton client supabase est ailleurs
import { fromSafe, DB_VIEWS } from "@/lib/dbContract";


export type VoteGroupeRow = {
  numero_scrutin: string;

  groupe: string; // code (POxxx) ou abrév (RN, LFI...)
  groupe_label?: string;

  position_majoritaire?: string; // POUR / CONTRE / ABSTENTION
  pour: number;
  contre: number;
  abstention: number;
};

function n(x: any) {
  const v = Number(x ?? 0);
  return Number.isFinite(v) ? v : 0;
}

function s(x: any) {
  return String(x ?? "").trim();
}

/**
 * ✅ Mapping ultra-robuste selon les colonnes réelles
 */
function mapRow(r: any): VoteGroupeRow | null {
  const numero_scrutin =
    s(r?.numero_scrutin) || s(r?.scrutin_id) || s(r?.scrutin) || "";
  if (!numero_scrutin) return null;

  const groupe =
    s(r?.groupe) ||
    s(r?.groupe_abrev) ||
    s(r?.groupe_abbreviation) ||
    s(r?.groupe_code) ||
    s(r?.groupe_uid) ||
    s(r?.groupe_sigle) ||
    "";

  const groupe_label =
    s(r?.groupe_label) || s(r?.libelle_groupe) || s(r?.groupe_nom) || "";

  return {
    numero_scrutin,
    groupe: groupe || groupe_label || "Groupe",
    groupe_label: groupe_label || undefined,
    position_majoritaire: undefined,
    pour: 0,
    contre: 0,
    abstention: 0,
  };
}

/**
 * ✅ Lit votes par groupes (table/view: votes_groupes_scrutin_full)
 * - Retourne un tableau de VoteGroupeRow normalisé (PIVOT)
 */
export async function fetchVotesGroupesForScrutins(
  scrutinIds: string[],
  limitPerScrutin = 40
): Promise<VoteGroupeRow[]> {
  const ids = (scrutinIds ?? []).map(s).filter(Boolean);
  if (ids.length === 0) return [];

  const { data, error } = await fromSafe(DB_VIEWS.VOTES_DEPUTES_DETAIL)
    .select("numero_scrutin,groupe,groupe_abrev,groupe_nom,position,nb_voix")
    .in("numero_scrutin", ids)
    .limit(ids.length * limitPerScrutin);

  if (error) {
    console.log(
      "[VOTES][fetchVotesGroupesForScrutins] error =",
      error?.message ?? error
    );
    return [];
  }

  /* ===============================
     ✅ CORRECTION : PIVOT LONG → UI
     =============================== */

  const byKey = new Map<string, VoteGroupeRow>();

  for (const r of data ?? []) {
    const base = mapRow(r);
    if (!base) continue;

    const key = `${base.numero_scrutin}__${base.groupe}`;
    const row =
      byKey.get(key) ??
      {
        ...base,
        pour: 0,
        contre: 0,
        abstention: 0,
      };

    const pos = s(r?.position).toUpperCase();
    const nb = n(r?.nb_voix);

    if (pos.includes("POUR")) row.pour += nb;
    else if (pos.includes("CONTRE")) row.contre += nb;
    else if (pos.includes("ABST")) row.abstention += nb;

    byKey.set(key, row);
  }

  // calcul position majoritaire
  for (const row of byKey.values()) {
    const max = Math.max(row.pour, row.contre, row.abstention);
    if (max === 0) row.position_majoritaire = undefined;
    else if (row.pour === max) row.position_majoritaire = "POUR";
    else if (row.contre === max) row.position_majoritaire = "CONTRE";
    else row.position_majoritaire = "ABSTENTION";
  }

  return Array.from(byKey.values());
}
