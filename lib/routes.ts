// lib/routes.ts

export type RouteLike = string;

function enc(x: string) {
  return encodeURIComponent(String(x ?? "").trim());
}

function norm(id?: string | null) {
  return String(id ?? "").trim();
}

export function isScrutinId(id?: string | null) {
  const s = norm(id);
  return s.length > 0 && s.startsWith("scrutin-");
}

export function isDossierId(id?: string | null) {
  const s = norm(id);
  return s.length > 0 && /^DLR/i.test(s);
}

export function isLoiId(id?: string | null) {
  const s = norm(id);
  return s.length > 0 && (s.startsWith("loi-") || isDossierId(s));
}

export function routeFromItemId(id: string | null | undefined): RouteLike | null {
  const s = norm(id);
  if (!s) return null;

  if (isScrutinId(s)) return `/scrutins/${enc(s)}`;
  if (isLoiId(s)) return `/lois/${enc(s)}`;

  return null;
}

export function routeFromActuItem(it: {
  id: string;
  entity?: string | null;
  loi_id?: string | null;
}): RouteLike | null {
  const itemId = norm(it.id);
  const entity = norm(it.entity).toLowerCase();
  const loiId = it.loi_id ? norm(it.loi_id) : null;

  if (!itemId) return null;

  if (entity === "scrutin" || isScrutinId(itemId)) {
    return `/scrutins/${enc(itemId)}`;
  }

  if (entity === "loi") {
    const k = loiId || itemId;
    if (isLoiId(k)) return `/lois/${enc(k)}`;
  }

  return null;
}

export function routeFromActuItemOrActuItemScreen(it: {
  id: string;
  entity?: string | null;
  loi_id?: string | null;
}): RouteLike {
  const itemId = norm(it.id);
  const best = routeFromActuItem(it) ?? routeFromItemId(itemId);
  return best ?? `/actu/item/${enc(itemId)}`;
}
