// lib/navigation.ts
// Centralise la navigation "id -> route" pour éviter les régressions.

export type RouteLike = string;

/** Normalise et encode un segment d'URL */
function enc(x: string) {
  return encodeURIComponent(String(x ?? ""));
}

/** True si l'id ressemble à un scrutin */
export function isScrutinId(id?: string | null) {
  const s = String(id ?? "");
  return s.startsWith("scrutin-");
}

/**
 * ✅ ROUTE UNIQUE (anti-régression)
 * Règle absolue :
 * - scrutin-* => /scrutins/:id
 * - sinon => /lois/:id
 *
 * (On ne "devine" pas amendement/motion/declaration ici : mieux vaut ne pas router
 * plutôt que d'ouvrir une mauvaise fiche.)
 */
export function routeFromItemId(id: string): RouteLike {
  const s = String(id ?? "");
  if (!s) return "/";

  if (isScrutinId(s)) return `/scrutins/${enc(s)}`;

  // ⚠️ par défaut : loi
  return `/lois/${enc(s)}`;
}

/**
 * Variante utile quand tu as un objet ActuItem (entity + loi_id + id)
 * - si entity= scrutins => /scrutins/:id (id)
 * - si entity= loi => /lois/:loi_id (ou id)
 * - sinon => null (pas de routage automatique)
 */
export function routeFromActuItem(it: {
  id: string;
  entity?: string | null;
  loi_id?: string | null;
}): string | null {
  const id = String(it?.id ?? "");
  const entity = String(it?.entity ?? "");
  const loiId = it?.loi_id ? String(it.loi_id) : null;

  if (!id) return null;

  if (entity === "scrutin" || isScrutinId(id)) {
    return `/scrutins/${enc(id)}`;
  }

  if (entity === "loi") {
    const k = loiId ?? id;
    return `/lois/${enc(k)}`;
  }

  // pas de guess pour le reste
  return null;
}
