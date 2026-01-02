// lib/dbContract.ts
import { supabase } from "./supabaseClient";

/**
 * ✅ Contrat officiel “Front ↔ DB”
 * Objectif : figer les noms des tables/vues appelées par le front,
 * éviter les typos (ex: lois_dossiers_mapping), et centraliser les changements.
 *
 * Règle : le front n’appelle JAMAIS une string "magic" -> il passe par DB_VIEWS.
 */
export const DB_VIEWS = {
  // Lois (list + détail)
  LOIS_APP: "lois_app",
  LOIS_RECENT: "lois_recent",
  LOI_JO_STATUS: "loi_jo_status",
  LOIS_MAPPING: "lois_mapping",
  SCRUTINS_LOI_ENRICHIS_UNIFIED: "scrutins_loi_enrichis_unified",
  LOI_PROCEDURE_APP: "loi_procedure_app",


  // ✅ Feed canon (v2)
  LOIS_CANON_FEED: "lois_canon_feed_v2_canon",

  // Scrutins
  SCRUTINS_PAR_LOI_APP: "scrutins_par_loi_app",
  SCRUTINS_PAR_LOI_CANON_APP: "scrutins_par_loi_canon_app", // ✅ NEW
  SCRUTINS_DATA: "scrutins_data",
  SCRUTINS_LOI_ENRICHIS: "scrutins_loi_enrichis",
  VOTES_DEPUTES_DETAIL: "votes_deputes_detail",

  // ✅ Amendements
  AMENDEMENTS_LOI_CONTRACT_V1: "amendements_loi_contract_v1",

  // Votes
  VOTES_PAR_SCRUTIN_SYNTHESE: "votes_par_scrutin_synthese",
  VOTES_DEPUTES: "votes_deputes_detail_norm",
  VOTES_GROUPES_SCRUTIN_FULL: "votes_groupes_scrutin_full",
} as const;

export type DbViewName = (typeof DB_VIEWS)[keyof typeof DB_VIEWS];

/**
 * ✅ Wrapper “safe”
 * - centralise l’accès Supabase
 * - te permet de changer un nom de vue à un seul endroit
 * - utile pour tracer les appels côté console si besoin
 */
export function fromSafe(view: DbViewName) {
  return supabase.from(view);
}

/**
 * Optionnel: petit helper de debug pour tracer les erreurs PostgREST
 * (tu peux l’utiliser dans tes fetchs si tu veux)
 */
export function logDbError(scope: string, err: any) {
  if (!err) return;
  console.warn(`[DB] ${scope}`, {
    code: err?.code,
    message: err?.message,
    hint: err?.hint,
    details: err?.details,
  });
}

export type LoiSearchRow = {
  loi_id: string;
  titre_loi_canon: string;
  derniere_activite_date: string | null; // date -> string côté supabase
  score: number;
};
