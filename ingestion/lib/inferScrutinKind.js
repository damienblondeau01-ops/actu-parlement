// ingestion/inferScrutinKind.js
// -------------------------------------------------------------
// Helpers pour classifier les scrutins en :
// - "article"
// - "amendement"
// - "autre"
// et extraire une référence d'article ("Article 3", "Article 3 bis", etc.)
// -------------------------------------------------------------

function normalize(str = "") {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function extractArticleRef(titre = "", objet = "") {
  const txt = `${titre} ${objet}`;
  const regex =
    /article\s+([0-9]+(?:er)?(?:\s*bis|\s*ter|\s*quater|\s*quinquies)?)/i;
  const match = txt.match(regex);
  if (!match) return null;
  const num = match[1].replace(/\s+/g, " ").trim();
  return `Article ${num}`;
}

function looksLikeAmendement({ titre = "", objet = "", type_texte = "" }) {
  const nTitre = normalize(titre);
  const nObjet = normalize(objet);
  const nType = normalize(type_texte);

  if (nTitre.includes("amendement") || nObjet.includes("amendement")) {
    return true;
  }
  if (/amend(?:ement|\.)?\s*n[°º]?\s*\d{1,4}/i.test(titre)) return true;
  if (/n[°º]\s*\d{1,4}/i.test(titre)) return true;
  if (nType.includes("amendement")) return true;

  return false;
}

function looksLikeArticle({ titre = "", objet = "", type_texte = "", articleRef }) {
  const nTitre = normalize(titre);
  const nObjet = normalize(objet);
  const nType = normalize(type_texte);

  if (articleRef) return true;
  if (
    nTitre.includes("article") ||
    nObjet.includes("article") ||
    nType.includes("article")
  ) {
    return true;
  }
  return false;
}

function inferScrutinKind({ titre = "", objet = "", type_texte = "" }) {
  const articleRef = extractArticleRef(titre, objet);

  if (looksLikeAmendement({ titre, objet, type_texte })) {
    return {
      kind: "amendement",
      article_ref: articleRef,
    };
  }

  if (looksLikeArticle({ titre, objet, type_texte, articleRef })) {
    return {
      kind: "article",
      article_ref: articleRef,
    };
  }

  return {
    kind: "autre",
    article_ref: null,
  };
}

module.exports = {
  inferScrutinKind,
  extractArticleRef,
};

if (require.main === module) {
  const samples = [
    {
      titre: "Article 3",
      objet: "Vote sur l'article 3 du projet de loi",
      type_texte: "",
    },
    {
      titre: "Amendement n° 1234",
      objet: "Amendement présenté par M. Dupont",
      type_texte: "",
    },
    {
      titre: "Scrutin public sur l'ensemble du projet de loi",
      objet: "",
      type_texte: "",
    },
    {
      titre: "Article 5 bis",
      objet: "Scrutin sur l'article 5 bis",
      type_texte: "",
    },
  ];

  for (const sample of samples) {
    const res = inferScrutinKind(sample);
    console.log("=== Exemple ===");
    console.log(sample);
    console.log("=>", res);
    console.log();
  }
}
