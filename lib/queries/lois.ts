// lib/queries/lois.ts
import { supabase } from "../supabaseClient";

export type LoiApp = {
  loi_id: string;
  titre_loi: string | null;
  nb_scrutins_total: number | null;
  nb_articles: number | null;
  nb_amendements: number | null;
  // ajoute ici les colonnes réelles de ta vue lois_app si besoin
};

export type ScrutinParLoi = {
  id_an: string;
  numero: string | null;
  legislature: number | null;
  loi_id: string | null;
  kind: string | null;
  article_ref: string | null;
  titre: string | null;
  objet: string | null;
  date_scrutin: string | null;
  mode_publication: string | null;
  sort: string | null;
  id_dossier: string | null;
};

export async function fetchLoiAvecScrutins(
  loiId: string,
  options?: { legislature?: number }
): Promise<{ loi: LoiApp | null; scrutins: ScrutinParLoi[] }> {
  // 1) Loi dans lois_app (cohérent avec la liste)
  const { data: loi, error: loiError } = await supabase
    .from("lois_app")
    .select("*")
    .eq("loi_id", loiId)
    .maybeSingle();

  if (loiError) {
    console.error("[fetchLoiAvecScrutins] Erreur lois_app :", loiError);
  }

  // 2) Scrutins liés à cette loi dans la vue scrutins_par_loi
  let query = supabase
    .from("scrutins_par_loi")
    .select("*")
    .eq("loi_id", loiId)
    .order("date_scrutin", { ascending: true });

  if (options?.legislature !== undefined) {
    query = query.eq("legislature", options.legislature);
  }

  const { data: scrutins, error: scrutinsError } = await query;

  if (scrutinsError) {
    console.error("[fetchLoiAvecScrutins] Erreur scrutins_par_loi :", scrutinsError);
  }

  return {
    loi: (loi as LoiApp | null) ?? null,
    scrutins: (scrutins as ScrutinParLoi[]) ?? [],
  };
}
