import { supabase } from "@/lib/supabaseClient";

export type LoiProcedureStep = {
  dossier_id: string;
  step_order: number;
  step_kind: string;
  chambre: string | null;
  lecture: string | null;
  label: string;
  date_start: string | null;
  date_end: string | null;
  source_label: string | null;
  source_url: string | null;
};

export async function fetchLoiProcedure(loiId: string, limit = 200) {
  const { data, error } = await supabase
    .from("loi_procedure_app")
    .select(
      "dossier_id,step_order,step_kind,chambre,lecture,label,date_start,date_end,source_label,source_url"
    )
    .eq("loi_id", loiId)
    .order("step_order", { ascending: true })
    .order("date_start", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as LoiProcedureStep[];
}
