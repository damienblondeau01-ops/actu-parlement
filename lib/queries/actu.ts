// lib/queries/actu.ts
import { supabase } from "@/lib/supabaseClient";
import { routeFromItemId } from "@/lib/routes";
import { fromSafe, DB_VIEWS } from "@/lib/dbContract";


export type Entity = "scrutin" | "loi" | "amendement" | "motion" | "declaration";

export type ActuItem = {
  id: string;
  entity: Entity;
  type?: string;

  /** ✅ IMPORTANT: doit être un "loi_id canon" quand possible (pas un scrutin-1234) */
  loi_id?: string | null;

  /** ✅ B2.2: enrichissement JO (Légifrance) */
  jo_date_promulgation?: string | null;

  /** champs utiles pour tes heuristiques UI (kicker amendement, etc.) */
  article_ref?: string | null;
  date: string; // ISO
  phase_label?: string | null;

  /** texte (UI) */
  title?: string | null;
  subtitle?: string | null;
  tldr?: string | null;

  /** ✅ alias “raw” (car ton code lit parfois .titre/.objet) */
  titre?: string | null;
  objet?: string | null;
  resultat?: string | null;
  numero_scrutin?: string | null;

  /** navigation (optionnelle) */
  route?: { href?: string | null } | null;
};

const DEBUG_ACTU =
  (typeof process !== "undefined" &&
    (process as any)?.env?.EXPO_PUBLIC_ACTU_DEBUG === "1") ||
  false;

function dlog(...args: any[]) {
  if (!DEBUG_ACTU) return;
  // eslint-disable-next-line no-console
  console.log(...args);
}

function asISO(d: any): string {
  if (!d) return new Date().toISOString();
  if (typeof d === "string" && d.includes("T")) return d;
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d))
    return `${d}T12:00:00.000Z`;
  return new Date(d).toISOString();
}

function safeStr(x: any): string | null {
  if (x === null || x === undefined) return null;
  const s = String(x).trim();
  return s ? s : null;
}

function short(s: any, max = 90) {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length <= max ? t : t.slice(0, max) + "…";
}

/**
 * ✅ IMPORTANT:
 * On veut filtrer les ids "événement" (scrutin-4944 / motion-123 / declaration-456)
 * MAIS on ne doit PAS filtrer les slugs "scrutin-public-..." (qui commencent aussi par "scrutin-").
 */
function isEventIdLike(v: string): boolean {
  const s = String(v ?? "").trim();
  if (!s) return false;

  // scrutin-4944 (digits only)
  if (/^scrutin-\d+$/i.test(s)) return true;

  // motion-123, declaration-123 (si jamais tu en as)
  if (/^motion-\d+$/i.test(s)) return true;
  if (/^declaration-\d+$/i.test(s)) return true;

  return false;
}

/** ✅ évite de prendre un "loi_id" qui est en réalité un id d'événement numérique */
function safeCanonLoiId(x: any): string | null {
  const v = safeStr(x);
  if (!v) return null;

  // 🔒 on filtre seulement les vrais ids "événement" numériques
  if (isEventIdLike(v)) return null;

  return v;
}

function detectEntityFromIdFallback(id: string, defaultEntity: Entity): Entity {
  if (!id) return defaultEntity;

  // ✅ ici on garde la logique large : si un rawId commence par scrutin-/motion-/declaration-/amendement-
  // c'est une heuristique d'entity (et ça inclut "scrutin-public-...")
  if (id.startsWith("scrutin-")) return "scrutin";
  if (id.startsWith("motion-")) return "motion";
  if (id.startsWith("declaration-")) return "declaration";
  if (id.startsWith("amendement-")) return "amendement";
  return defaultEntity;
}

function humanScrutinSubtitle(r: any) {
  const res = safeStr(r.resultat);
  if (res) return res;
  const obj = safeStr(r.objet);
  if (obj) return obj;
  const num = safeStr(r.numero_scrutin) ?? safeStr(r.numero);
  return num ? `Vote n°${num}` : "Vote";
}

/**
 * ✅ Règle produit blindée (NAV UNIQUE)
 * - on ne fabrique PLUS jamais "/scrutins/..." ou "/lois/..." ici
 * - on délègue à routeFromItemId(id)
 * - amendement/motion/declaration: pas d'écran dédié => null
 */
function buildHref(
  entity: Entity,
  rawId: string | null | undefined
): string | null {
  const id = String(rawId ?? "").trim();
  if (!id) return null;

  if (entity === "amendement" || entity === "motion" || entity === "declaration")
    return null;
  return routeFromItemId(id);
}

/** ✅ 1-run validation: est-ce que la view renvoie bien loi_id_canon ? */
function debugScrutinsViewSnapshot(scrutins: any[] | null | undefined) {
  if (!DEBUG_ACTU) return;

  const r0: any = (scrutins ?? [])[0];
  dlog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  dlog("[ACTU][FETCH] scrutins_loi_enrichis_unified snapshot");
  dlog("[ACTU][FETCH] sample keys =", Object.keys(r0 ?? {}));
  dlog("[ACTU][FETCH] sample row =", {
    numero_scrutin: r0?.numero_scrutin,
    loi_id_canon: r0?.loi_id_canon,
    loi_id_scrutin: r0?.loi_id_scrutin,
    titre: short(r0?.titre ?? r0?.objet ?? "", 90),
  });
  dlog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

/** ✅ 1-run validation: combien de canon null / combien de canon ok ? */
function debugScrutinsCanonStats(scrutinsItems: ActuItem[]) {
  if (!DEBUG_ACTU) return;

  const total = scrutinsItems.length;
  let canonOk = 0;
  let canonNull = 0;

  // bonus: combien de "event id" filtrés (scrutin-4944 etc.)
  let filteredEventIds = 0;

  for (const it of scrutinsItems) {
    if (it.loi_id) canonOk += 1;
    else canonNull += 1;
  }

  for (const it of scrutinsItems) {
    if (isEventIdLike(it.id)) filteredEventIds += 1;
  }

  const pct = total > 0 ? Math.round((canonOk / total) * 1000) / 10 : 0;

  dlog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  dlog(
    `[ACTU][FETCH] canon stats (scrutinsItems): ok=${canonOk}/${total} (${pct}%) | canon_null=${canonNull} | idEventLike=${filteredEventIds}`
  );
  dlog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

/**
 * Feed Actu (stabilisé)
 * ✅ SCRUTINS: on lit une view enrichie qui expose loi_id_canon + loi_id_scrutin
 *    -> BUT: rawDB.loi_id doit devenir un vrai “loi_id canon” quand dispo
 *
 * ✅ LOIS: lois_recent (si dispo chez toi)
 */
export async function fetchActuItems(opts?: {
  limScrutins?: number;
  limLois?: number;
}): Promise<ActuItem[]> {
  const limScrutins = opts?.limScrutins ?? 120;
  const limLois = opts?.limLois ?? 40;

  // 1) SCRUTINS (view enrichie)
  const { data: scrutins, error: e1 } = await fromSafe(
  DB_VIEWS.SCRUTINS_LOI_ENRICHIS_UNIFIED
)
    .select(
      [
        "numero_scrutin",
        "loi_id_canon",
        "loi_id_scrutin",
        "date_scrutin",
        "titre",
        "objet",
        "resultat",
        "kind",
        "article_ref",
      ].join(",")
    )
    .order("date_scrutin", { ascending: false })
    .limit(limScrutins);

  if (e1) throw new Error(`scrutins_loi_enrichis_unified: ${e1.message}`);

  debugScrutinsViewSnapshot(scrutins as any[]);

  const scrutinsItems: ActuItem[] = ((scrutins ?? []) as any[]).map((r: any) => {
    const rawCanon = safeStr(r.loi_id_canon);
    const loiIdCanon = safeCanonLoiId(rawCanon);

    const num = safeStr(r.numero_scrutin);
    const loiIdScrutin = safeStr(r.loi_id_scrutin);
    const idScrutin = loiIdScrutin || (num ? `scrutin-${num}` : "scrutin");

    // ✅ B2.2 — priorité à un ID DB pour la jointure JO
    const isEditorialKey =
      !!loiIdCanon &&
      (loiIdCanon.startsWith("loi:") || loiIdCanon.startsWith("title:"));

    const loiIdForJoin =
      !loiIdCanon || isEditorialKey ? safeCanonLoiId(loiIdScrutin) : loiIdCanon;

    const dateISO = asISO(r.date_scrutin);

    const titre = safeStr(r.titre);
    const objet = safeStr(r.objet);

    const title = titre ?? objet ?? (num ? `Scrutin n°${num}` : "Scrutin");
    const subtitle = humanScrutinSubtitle({ ...r, numero_scrutin: num });

    return {
      id: String(idScrutin),
      entity: "scrutin",

      // ✅ ICI la seule vraie correction
      loi_id: loiIdForJoin,

      article_ref: safeStr(r.article_ref),
      date: dateISO,
      phase_label: null,

      title,
      subtitle,
      tldr: null,

      titre,
      objet,
      resultat: safeStr(r.resultat),
      numero_scrutin: num,

      route: { href: buildHref("scrutin", idScrutin) },
    };
  });

  // ✅ DEBUG: retrouver la row DB qui contient "Permettre"
  if (DEBUG_ACTU) {
    const scrAny = (scrutins ?? []) as any[];
    const hit = scrAny.find((r: any) =>
      String(r?.titre ?? r?.objet ?? "").toLowerCase().includes("permettre")
    ) as any | undefined;

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("[ACTU][DB HIT] found =", !!hit);
    if (hit) {
      console.log("[ACTU][DB HIT] keys =", Object.keys(hit ?? {}));
      console.log("[ACTU][DB HIT] loi_id_canon =", hit?.loi_id_canon);
      console.log("[ACTU][DB HIT] loi_id_scrutin =", hit?.loi_id_scrutin);
      console.log("[ACTU][DB HIT] numero_scrutin =", hit?.numero_scrutin);
      console.log("[ACTU][DB HIT] titre =", hit?.titre ?? hit?.objet);
    }
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  }

  debugScrutinsCanonStats(scrutinsItems);

  // 2) LOIS (dernière activité)
  const { data: lois, error: e2 } = await fromSafe(DB_VIEWS.LOIS_RECENT)
    .select("*")
    .order("date_dernier_scrutin", { ascending: false })
    .limit(limLois);

  if (e2) throw new Error(`lois_recent: ${e2.message}`);

  const loisItems: ActuItem[] = ((lois ?? []) as any[]).map((r: any) => {
    const rawId =
      safeStr(r.loi_id) ??
      safeStr(r.loi_id_canon) ??
      safeStr(r.id_dossier) ??
      safeStr(r.id) ??
      "loi";

    const dateISO = asISO(
      r.date_dernier_scrutin ?? r.derniere_activite_date ?? r.date
    );

    const entity: Entity = detectEntityFromIdFallback(String(rawId), "loi");

    const title =
      safeStr(r.titre_loi_canon) ??
      safeStr(r.titre_loi) ??
      safeStr(r.titre) ??
      (entity === "scrutin"
        ? "Scrutin"
        : entity === "motion"
        ? "Motion"
        : entity === "declaration"
        ? "Déclaration"
        : `Loi ${rawId}`);

    const subtitle =
      safeStr(r.resume_citoyen) ??
      safeStr(r.objet) ??
      "Dernières avancées à l’Assemblée";
    const phase = safeStr(r.phase_label ?? r.phase);

    // ✅ B2.2 — si rawId est éditorial (loi:/title:), on utilise l'id_dossier pour joindre le JO
    const canon = safeCanonLoiId(rawId);
    const dossierId =
      safeStr((r as any)?.id_dossier) ?? safeStr((r as any)?.dossier_id) ?? null;

    const isEditorialKey =
      !!canon && (canon.startsWith("loi:") || canon.startsWith("title:"));

    const loiIdForJoin =
      entity === "loi" ? (isEditorialKey ? safeCanonLoiId(dossierId) : canon) : null;

    return {
      id: String(rawId),
      entity,

      // ✅ ICI la correction (uniquement)
      loi_id: loiIdForJoin,

      date: dateISO,
      phase_label: phase,

      title,
      subtitle,
      tldr: safeStr(r.tldr ?? r.resume),

      titre:
        safeStr(r.titre_loi_canon) ?? safeStr(r.titre_loi) ?? safeStr(r.titre),
      objet: safeStr(r.objet) ?? null,

      route: { href: buildHref(entity, String(rawId)) },
    };
  });

  // ✅ B2.2 — enrichissement JO: date_promulgation depuis loi_jo_status
  const merged = [...scrutinsItems, ...loisItems].filter(Boolean);

  // ✅ On collecte toutes les clés possibles (loi_id + dossier_id + loi_id_scrutin + alias)
  const loiIds = Array.from(
    new Set(
      merged
        .flatMap((x) => joJoinKeysForActuItem(x as any))
        .map((s) => String(s ?? "").trim())
        .filter(Boolean)
    )
  );

  if (loiIds.length > 0) {
    const { data: joRows, error: joErr } = await fromSafe(DB_VIEWS.LOI_JO_STATUS)
      .select("loi_id,date_promulgation")
      .in("loi_id", loiIds);

    if (!joErr && Array.isArray(joRows)) {
      const joMap = new Map<string, string | null>();
      for (const r of joRows as any[]) {
        const id = String(r?.loi_id ?? "").trim();
        if (id) joMap.set(id, (r as any)?.date_promulgation ?? null);
      }

      // ✅ On remplit jo_date_promulgation sur chaque item (première clé qui matche)
      for (const it of merged) {
        const keys = joJoinKeysForActuItem(it as any);
        let v: string | null = null;

        for (const k of keys) {
          const kk = String(k ?? "").trim();
          if (!kk) continue;
          if (joMap.has(kk)) {
            v = joMap.get(kk) ?? null;
            break;
          }
        }

        (it as any).jo_date_promulgation = v;
      }
    } else if (DEBUG_ACTU && joErr) {
      dlog("[ACTU][JO] loi_jo_status error =", joErr.message);
    }
  }

  merged.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  return merged;
}

function joJoinKeysForActuItem(it: ActuItem): string[] {
  const out: string[] = [];
  const k1 = safeStr((it as any)?.loi_id);
  const k2 = safeStr((it as any)?.dossier_id);
  const k3 = safeStr((it as any)?.loi_id_scrutin);

  if (k1) out.push(k1);
  if (k2) out.push(k2);
  if (k3) out.push(k3);

  // ✅ Alias connu: Loi spéciale (article 45 LOLF) => clé de loi_jo_status
  const canon = String(k1 ?? "").toLowerCase();
  if (
    canon.includes("loi-speciale") &&
    (canon.includes("article-45") || canon.includes("lolf"))
  ) {
    out.push("loi-speciale-article-45-lolf-2026");
  }

  return out;
}


/** Aliases (compat imports) */
export async function fetchActu() {
  return fetchActuItems();
}
export async function fetchActuFeed() {
  return fetchActuItems();
}
export async function fetchActuRecent() {
  return fetchActuItems({ limScrutins: 80, limLois: 30 });
}
