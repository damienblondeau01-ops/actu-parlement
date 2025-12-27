/* eslint-disable */
// Analyse du type de scrutin (article / amendement / autre)
const { kind, article_ref } = inferScrutinKind({
  titre,
  objet,
  type_texte,
});

// Clé logique regroupant tous les scrutins d’une même loi
const group_key = computeLoiGroupKey(
  titre ?? "",
  objet ?? "",
  type_texte ?? ""
);

// Ligne à insérer dans scrutins_import
const row = {
  id_an,
  loi_id,
  numero,
  date_scrutin,
  titre,
  objet,
  resultat,
  type_texte,
  kind,
  article_ref,
  group_key, // ✅ nouveau champ
};
