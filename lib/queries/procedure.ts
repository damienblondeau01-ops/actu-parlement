// lib/queries/procedure.ts
import { fromSafe, DB_VIEWS } from "@/lib/dbContract";

export type LoiProcedureStep = {
  loi_id: string | null;
  dossier_id: string | null;

  step_index: number | null;
  step_kind: string | null;
  chambre: string | null;
  lecture: string | null;

  label: string | null;
  date_start: string | null; // date
  date_end: string | null; // date

  source_label: string | null;
  source_url: string | null;

  raw: any | null;
};

const PROCEDURE_SELECT = `
  loi_id,
  dossier_id,
  step_index,
  step_kind,
  chambre,
  lecture,
  label,
  date_start,
  date_end,
  source_label,
  source_url,
  raw
`;

/**
 * Fetch procédure (timeline) depuis loi_procedure_app
 * Règle: dossier_id prioritaire (plus stable), fallback sur loi_id
 */
export async function fetchLoiProcedure(params: {
  dossierId?: string | null;
  loiId?: string | null;
}): Promise<{ steps: LoiProcedureStep[]; error: string | null }> {
  const dossierId = String(params.dossierId ?? "").trim() || null;
  const loiId = String(params.loiId ?? "").trim() || null;

  try {
    // 1) dossier_id d'abord
    if (dossierId) {
      const { data, error } = await fromSafe(DB_VIEWS.LOI_PROCEDURE_APP)
        .select(PROCEDURE_SELECT)
        .eq("dossier_id", dossierId)
        .order("step_index", { ascending: true });

      if (error) return { steps: [], error: error.message };
      if (Array.isArray(data) && data.length > 0) {
        return { steps: data as any, error: null };
      }
    }

    // 2) fallback loi_id
    if (loiId) {
      const { data, error } = await fromSafe(DB_VIEWS.LOI_PROCEDURE_APP)
        .select(PROCEDURE_SELECT)
        .eq("loi_id", loiId)
        .order("step_index", { ascending: true });

      if (error) return { steps: [], error: error.message };
      return { steps: (data as any[]) ?? [], error: null };
    }

    return { steps: [], error: null };
  } catch (e: any) {
    return { steps: [], error: String(e?.message ?? e) };
  }
}
