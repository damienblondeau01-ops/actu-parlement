// lib/queries/actu.ts
import { supabase } from "@/lib/supabaseClient";

export type Entity = "scrutin" | "loi" | "amendement" | "motion" | "declaration";

export type ActuItem = {
  id: string;
  entity: Entity;
  type?: string;

  loi_id?: string | null;
  article_ref?: string | null;
  date: string; // ISO
  phase_label?: string | null;

  // texte
  title?: string | null;
  subtitle?: string | null;
  tldr?: string | null;

  // navigation
  route?: { href?: string | null } | null;
};

function asISO(d: any): string {
  if (!d) return new Date().toISOString();
  if (typeof d === "string" && d.includes("T")) return d;
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) return `${d}T12:00:00.000Z`;
  return new Date(d).toISOString();
}

function safeStr(x: any): string | null {
  if (x === null || x === undefined) return null;
  const s = String(x).trim();
  return s ? s : null;
}

/**
 * ✅ Règle produit blindée:
 * - si l'id ressemble à un "scrutin-*" => TOUJOURS fiche scrutin
 * - sinon: entity décide (loi => fiche loi)
 * - amendement/motion/declaration: pas d'écran dédié => pas de navigation (null)
 */
function buildHref(entity: Entity, rawId: string | null | undefined): string | null {
  const id = String(rawId ?? "").trim();
  if (!id) return null;

  // 🟣 PRIORITÉ ABSOLUE: scrutin
  if (id.startsWith("scrutin-") || entity === "scrutin") {
    return `/scrutins/${encodeURIComponent(id)}`;
  }

  // 🔵 Loi
  if (entity === "loi") {
    // sécurité: si une "loi" polluée a un id scrutin-* => on force scrutin
    if (id.startsWith("scrutin-")) return `/scrutins/${encodeURIComponent(id)}`;
    return `/lois/${encodeURIComponent(id)}`;
  }

  // 🟡 Pas d'écran dédié (pour l’instant)
  return null;
}

function detectEntityFromIdFallback(id: string, defaultEntity: Entity): Entity {
  if (!id) return defaultEntity;
  if (id.startsWith("scrutin-")) return "scrutin";
  if (id.startsWith("motion-")) return "motion";
  if (id.startsWith("declaration-")) return "declaration";
  // amendement-* (si jamais tu en as)
  if (id.startsWith("amendement-")) return "amendement";
  return defaultEntity;
}

function humanScrutinSubtitle(r: any) {
  const res = safeStr(r.resultat);
  if (res) return res; // "adopté / rejeté / n'a pas adopté"
  const obj = safeStr(r.objet);
  if (obj) return obj;
  const num = r.numero != null ? `n°${r.numero}` : "—";
  return `Vote ${num}`;
}

/**
 * Feed Actu V1
 * - scrutins_app (view existante)
 * - lois_recent (view existante)
 */
export async function fetchActuItems(opts?: { limScrutins?: number; limLois?: number }): Promise<ActuItem[]> {
  const limScrutins = opts?.limScrutins ?? 90;
  const limLois = opts?.limLois ?? 40;

  // 1) SCRUTINS (colonnes réelles de scrutins_app)
  const { data: scrutins, error: e1 } = await supabase
    .from("scrutins_app")
    .select("id_an, loi_id, group_key, titre, objet, type_texte, date_scrutin, numero, resultat, kind, article_ref")
    .order("date_scrutin", { ascending: false })
    .limit(limScrutins);

  if (e1) throw new Error(`scrutins_app: ${e1.message}`);

  const scrutinsItems: ActuItem[] = (scrutins ?? []).map((r: any) => {
    const loiId = safeStr(r.loi_id); // peut être pollué chez toi -> OK, mais on n'en déduit pas la route
    const dateISO = asISO(r.date_scrutin);

    const titre = safeStr(r.titre);
    const objet = safeStr(r.objet);

    const title = titre ?? objet ?? (r.numero != null ? `Scrutin n°${r.numero}` : "Scrutin");
    const subtitle = humanScrutinSubtitle(r);

    // ✅ ID du scrutin: on privilégie id_an (souvent "scrutin-*")
    const idScrutin = safeStr(r.id_an) ?? (r.numero != null ? `scrutin-${r.numero}` : "scrutin");

    return {
      id: String(idScrutin),
      entity: "scrutin",
      loi_id: loiId,
      article_ref: safeStr(r.article_ref),
      date: dateISO,
      phase_label: null,
      title,
      subtitle,
      tldr: null,
      route: { href: buildHref("scrutin", idScrutin) }, // ✅ jamais /lois ici
    };
  });

  // 2) LOIS (dernière activité)
  const { data: lois, error: e2 } = await supabase
    .from("lois_recent")
    .select("*")
    .order("date_dernier_scrutin", { ascending: false })
    .limit(limLois);

  if (e2) throw new Error(`lois_recent: ${e2.message}`);

  const loisItems: ActuItem[] = (lois ?? []).map((r: any) => {
    // ⚠️ IMPORTANT: cette view peut contenir des "événements" pollués (ex: loi_id = "scrutin-*")
    const rawId =
      safeStr(r.loi_id) ??
      safeStr(r.id_dossier) ??
      safeStr(r.id) ??
      "loi";

    const dateISO = asISO(r.date_dernier_scrutin ?? r.derniere_activite_date ?? r.date);

    // ✅ Si l'id ressemble à scrutin-/motion-/declaration- => on corrige l'entity ici
    const entity: Entity = detectEntityFromIdFallback(String(rawId), "loi");

    const title =
      safeStr(r.titre_loi_canon) ??
      safeStr(r.titre_loi) ??
      safeStr(r.titre) ??
      // fallback propre selon entity
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

    return {
      id: String(rawId),
      entity,
      loi_id: entity === "loi" ? String(rawId) : safeStr(r.loi_id) ?? null,
      date: dateISO,
      phase_label: phase,
      title,
      subtitle,
      tldr: safeStr(r.tldr ?? r.resume),
      route: { href: buildHref(entity, String(rawId)) }, // ✅ scrutin-* => /scrutins/...
    };
  });

  // merge + tri global
  const merged = [...scrutinsItems, ...loisItems].filter(Boolean);
  merged.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  return merged;
}

/** Aliases (compat imports) */
export async function fetchActu() {
  return fetchActuItems();
}
export async function fetchActuFeed() {
  return fetchActuItems();
}
export async function fetchActuRecent() {
  return fetchActuItems({ limScrutins: 60, limLois: 30 });
}
