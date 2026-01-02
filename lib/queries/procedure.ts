// lib/queries/procedure.ts
import { fromSafe, DB_VIEWS } from "@/lib/dbContract";

export type LoiProcedureStep = {
  loi_id: string;
  dossier_id: string | null;

  // ✅ la view expose step_index (pas step_order)
  step_index: number | null;

  step_kind: string | null;
  chambre: string | null;
  lecture: string | null;

  label: string | null;
  date_start: string | null; // YYYY-MM-DD
  date_end: string | null;

  source_label: string | null;
  source_url: string | null;
};

const VIEW_LOI_PROCEDURE_APP = "loi_procedure_app";

/**
 * ✅ Récupère les étapes du dossier parlementaire (view)
 * Fallback strict: si vue absente / erreur -> []
 */
export async function fetchLoiProcedure(
  loiId: string,
  limit = 200
): Promise<LoiProcedureStep[]> {
  const id = String(loiId ?? "").trim();
  if (!id) return [];

  const { data, error } = await fromSafe(DB_VIEWS.LOI_PROCEDURE_APP )
    .select(
      "loi_id,dossier_id,step_index,step_kind,chambre,lecture,label,date_start,date_end,source_label,source_url"
    )
    .eq("loi_id", id)
    .order("step_index", { ascending: true })
    .order("date_start", { ascending: true })
    .limit(limit);

  if (error) {
    console.log("[fetchLoiProcedure] error =", error?.message ?? error);
    return [];
  }

  // ✅ évite le warning TS "GenericStringError[]" : on cast via unknown
  return ((data ?? []) as unknown) as LoiProcedureStep[];
}
