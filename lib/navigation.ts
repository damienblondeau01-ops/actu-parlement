// lib/navigation.ts
// ✅ Façade rétro-compat : on centralise les exports de navigation ici,
// mais la SOURCE DE VÉRITÉ est lib/routes.ts.
// Objectif : éviter toute régression (ne jamais "deviner" une loi).

export type RouteLike = string;

/** Re-export complet du canon (routeFromItemId, routeFromActuItem, helpers, etc.) */
export * from "./routes";

// -------
// Aliases utiles (compat anciens imports / anciens usages)
// -------

import {
  routeFromItemId as routeFromItemIdCanon,
  routeFromActuItem as routeFromActuItemCanon,
  isScrutinId as isScrutinIdCanon,
  isLoiId as isLoiIdCanon,
} from "./routes";

/**
 * Alias compat : mêmes règles que routes.ts
 * (retourne string | null)
 */
export function routeFromItemId(id: string) {
  return routeFromItemIdCanon(id);
}

/**
 * Alias compat ActuItem
 */
export function routeFromActuItem(it: {
  id: string;
  entity?: string | null;
  loi_id?: string | null;
}) {
  return routeFromActuItemCanon(it);
}

/** Helpers compat */
export function isScrutinId(id?: string | null) {
  return isScrutinIdCanon(id);
}
export function isLoiId(id?: string | null) {
  return isLoiIdCanon(id);
}
