// lib/lois/title.ts

/**
 * Génère un titre "lisible humain" à partir d'un canonKey de loi
 * ex:
 *  - scrutin-public-ordinaire-projet-de-loi-speciale-prevue-par-l-article-45-de-la-lo
 * → "Projet de loi spéciale prévue par l’article 45 de la loi"
 */
export function titleFromCanonKey(canon: string | null | undefined) {
  const s = String(canon ?? "").trim();
  if (!s) return null;

  // 1. retirer les préfixes techniques
  let x = s
    .replace(/^scrutin-(public-)?(ordinaire|solennel)-/i, "")
    .replace(/^scrutin-(public-)?/i, "");

  // 2. slug → phrase
  x = x.replace(/-/g, " ");

  // 3. normalisations FR minimales
  x = x
    .replace(/\barticle\b/gi, "article")
    .replace(/\blo\b/gi, "loi")
    .replace(/\bl\b/gi, "l’");

  // 4. capitalisation
  x = x.charAt(0).toUpperCase() + x.slice(1);

  return x;
}
