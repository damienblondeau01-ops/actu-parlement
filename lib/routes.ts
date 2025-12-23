// lib/routes.ts
import { isScrutinId } from "./navigation";

function enc(x: string) {
  return encodeURIComponent(String(x ?? ""));
}

/**
 * Même règle que navigation.ts, en double sécurité.
 * (Certains écrans importent routes.ts au lieu de navigation.ts)
 */
export function routeFromItemId(id: string) {
  const s = String(id ?? "");
  if (!s) return "/";
  if (isScrutinId(s)) return `/scrutins/${enc(s)}`;
  return `/lois/${enc(s)}`;
}
