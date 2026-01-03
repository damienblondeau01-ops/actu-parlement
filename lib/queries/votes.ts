// lib/queries/votes.ts
import { supabase } from "@/lib/supabase"; // ✅ garde si utilisé ailleurs, sinon tu peux le supprimer
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
 * PATCH 2 : accepte groupe_nom / groupe_actuel / groupe
 */
function mapRow(r: any): VoteGroupeRow | null {
  const numero_scrutin =
    s(r?.numero_scrutin) || s(r?.scrutin_id) || s(r?.scrutin) || "";
  if (!numero_scrutin) return null;

  // 1) label (nom long) : on accepte groupe_actuel
  const groupe_label =
    s(r?.groupe_label) ||
    s(r?.libelle_groupe) ||
    s(r?.groupe_nom) ||
    s(r?.groupe_actuel) ||
    "";

  // 2) code / abrév : si absent, on retombe sur groupe_actuel
  const groupe =
    s(r?.groupe) ||
    s(r?.groupe_abrev) ||
    s(r?.groupe_abbreviation) ||
    s(r?.groupe_code) ||
    s(r?.groupe_uid) ||
    s(r?.groupe_sigle) ||
    s(r?.groupe_actuel) ||
    "";

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
 * ✅ Lit votes par groupes (table/view: votes_deputes_detail)
 * - Retourne un tableau de VoteGroupeRow normalisé (PIVOT)
 */
export async function fetchVotesGroupesForScrutins(
  scrutinIds: string[],
  limitPerScrutin = 40
): Promise<VoteGroupeRow[]> {
  const ids = (scrutinIds ?? []).map(s).filter(Boolean);
  if (ids.length === 0) return [];

  /* ===============================
     ✅ PATCH 1 : SELECT SAFE + FALLBACK AUTO
     =============================== */

  let data: any[] | null = null;
  let error: any | null = null;

  // Essai 1 : colonnes “probables”
  ({ data, error } = await fromSafe(DB_VIEWS.VOTES_DEPUTES_DETAIL)
    .select("numero_scrutin,position,groupe_actuel,groupe_nom")
    .in("numero_scrutin", ids)
    .limit(Math.max(1, ids.length) * limitPerScrutin));

  const isMissingCol = (e: any) =>
    String(e?.message ?? "").toLowerCase().includes("does not exist") ||
    String(e?.code ?? "") === "42703";

  // Essai 2 : set minimal (sans groupe_nom)
  if (error && isMissingCol(error)) {
    ({ data, error } = await fromSafe(DB_VIEWS.VOTES_DEPUTES_DETAIL)
      .select("numero_scrutin,position,groupe_actuel")
      .in("numero_scrutin", ids)
      .limit(Math.max(1, ids.length) * limitPerScrutin));
  }

  // Essai 3 : fallback (groupe au lieu de groupe_actuel)
  if (error && isMissingCol(error)) {
    ({ data, error } = await fromSafe(DB_VIEWS.VOTES_DEPUTES_DETAIL)
      .select("numero_scrutin,position,groupe")
      .in("numero_scrutin", ids)
      .limit(Math.max(1, ids.length) * limitPerScrutin));
  }

  // Essai 4 : ultra-minimal (au cas où)
  if (error && isMissingCol(error)) {
    ({ data, error } = await fromSafe(DB_VIEWS.VOTES_DEPUTES_DETAIL)
      .select("numero_scrutin,position")
      .in("numero_scrutin", ids)
      .limit(Math.max(1, ids.length) * limitPerScrutin));
  }

  if (error) {
  console.log(
    "[VOTES][fetchVotesGroupesForScrutins] error =",
    error?.message ?? error
  );
  return [];
}

console.log(
  "[VOTES][fetchVotesGroupesForScrutins] ok rows =",
  (data ?? []).length,
  "| scrutins =",
  ids.join(", ")
);

if ((data ?? []).length > 0) {
  const r0: any = (data ?? [])[0];
  console.log("[VOTES][sample row keys] =", Object.keys(r0));
  console.log("[VOTES][sample row] =", r0);
}

  /* ===============================
     ✅ PIVOT LONG → UI
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
const posNorm =
  pos === "POUR" ? "POUR" :
  pos === "CONTRE" ? "CONTRE" :
  pos.startsWith("ABST") ? "ABSTENTION" :
  pos; // fallback

    // ⚠️ votes_deputes_detail = 1 ligne = 1 député
    // => on compte 1 voix par ligne (si tu as nb_voix dans une autre view, tu peux remettre n(r?.nb_voix))
    // ✅ si la vue est "par député", nb_voix n'existe pas => 1 ligne = 1 voix
const nb = Number.isFinite(Number(r?.nb_voix)) ? n(r?.nb_voix) : 1;

    if (posNorm === "POUR") row.pour += nb;
else if (posNorm === "CONTRE") row.contre += nb;
else if (posNorm === "ABSTENTION") row.abstention += nb;


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
