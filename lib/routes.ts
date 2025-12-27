// lib/routes.ts

export type RouteLike = string;

function enc(x: string) {
  return encodeURIComponent(String(x ?? "").trim());
}

function norm(id?: string | null) {
  return String(id ?? "").trim();
}

// ✅ Scrutin "détail" = soit "scrutin-...." soit un numero ("4240")
export function isScrutinNumero(id?: string | null) {
  const s = norm(id);
  return !!s && /^\d+$/.test(s);
}

export function isScrutinId(id?: string | null) {
  const s = norm(id);
  return s.length > 0 && s.startsWith("scrutin-");
}

export function isDossierId(id?: string | null) {
  const s = norm(id);
  return s.length > 0 && /^DLR/i.test(s);
}

// ✅ Loi "canon" actuelle = loi-* OU DLR*
// ✅ + Loi "agrégée" (scrutin-public-...) = doit aller sur /lois/[id]
export function isLoiAggregateId(id?: string | null) {
  const s = norm(id);
  // tes ids "loi via scrutins" ressemblent à : scrutin-public-ordinaire-..., scrutin-public-solennel-...
  return s.length > 0 && s.startsWith("scrutin-public-");
}

export function isLoiId(id?: string | null) {
  const s = norm(id);
  return s.length > 0 && (s.startsWith("loi-") || isDossierId(s) || isLoiAggregateId(s));
}

export function routeFromItemId(id: string | null | undefined): RouteLike | null {
  const s = norm(id);
  if (!s) return null;

  // ✅ Scrutin écran
  if (isScrutinNumero(s) || isScrutinId(s)) return `/scrutins/${enc(s)}`;

  // ✅ Loi écran (inclut scrutin-public-... => loi agrégée)
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

  // ✅ Cas critique : certains items "scrutin" portent un id "scrutin-public-..." (= loi agrégée)
  if (entity === "scrutin") {
    if (isScrutinNumero(itemId) || isScrutinId(itemId)) return `/scrutins/${enc(itemId)}`;
    if (isLoiAggregateId(itemId)) return `/lois/${enc(itemId)}`; // 🔥 FIX
    return `/scrutins/${enc(itemId)}`; // fallback
  }

  if (entity === "loi") {
    const k = loiId || itemId;
    if (isLoiId(k)) return `/lois/${enc(k)}`;
    // si l'entity est "loi" mais que l'id est un agrégat type scrutin-public-...
    if (isLoiAggregateId(k)) return `/lois/${enc(k)}`;
  }

  // ✅ fallback générique si jamais id direct
  const direct = routeFromItemId(itemId);
  if (direct) return direct;

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
console.log("TEST route scrutin num", routeFromItemId("4240"));
console.log("TEST route scrutin-id", routeFromItemId("scrutin-xxx"));
console.log("TEST route loi agg", routeFromItemId("scrutin-public-ordinaire-projet-de-loi-..."));
