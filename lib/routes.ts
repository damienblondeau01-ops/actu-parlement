// lib/routes.ts

export type RouteLike = string;

function enc(x: string) {
  return encodeURIComponent(String(x ?? "").trim());
}

function norm(id?: string | null) {
  return String(id ?? "").trim();
}

/**
 * ✅ Scrutin "événement" : uniquement la forme numérique "scrutin-4947"
 * (On NE veut plus matcher "scrutin-public-..." ici)
 */
export function isScrutinId(id?: string | null) {
  const s = norm(id);
  return !!s && /^scrutin-\d+$/i.test(s);
}

export function isDossierId(id?: string | null) {
  const s = norm(id);
  return !!s && /^DLR/i.test(s);
}

/**
 * ✅ Loi "canon DB"
 * Dans ton schéma actuel, beaucoup de lois ont un id du type "scrutin-public-..."
 * (c’est contre-intuitif, mais c’est ton identifiant canon pour /lois/[id])
 */
export function isLoiId(id?: string | null) {
  const s = norm(id);
  return (
    !!s &&
    (s.startsWith("loi-") ||
      isDossierId(s) ||
      s.startsWith("scrutin-public-")) // ✅ clé
  );
} 

/**
 * ✅ Route stable depuis un id "canon"
 * Priorité loi avant scrutin, sinon "scrutin-public-..." partirait au mauvais endroit.
 */
export function routeFromItemId(id: string | null | undefined): RouteLike | null {
  const s = norm(id);
  if (!s) return null;

  if (isLoiId(s)) return `/lois/${enc(s)}`;
  if (isScrutinId(s)) return `/scrutins/${enc(s)}`;

  return null;
}
