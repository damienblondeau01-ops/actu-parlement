// lib/lois/tldr.ts
// TLDR v0 (SAFE) : uniquement des faits + preuve cliquable
// Objectif: afficher 1 point minimum basé sur le dernier scrutin de la timeline.
// (IA viendra après, sans changer l’UI)

export type CanonProof = { label: string; href: string };

export type CanonTLDRBullet = {
  text: string;
  proof: CanonProof; // obligatoire
};

export function buildTLDRv0(params: {
  loiId: string;
  loiTitle: string;
  timeline: Array<{
    titre?: string | null;
    date_scrutin?: string | null;
    resultat?: string | null;
    numero_scrutin?: string | number | null;
  }>;
}): CanonTLDRBullet[] {
  const rows = Array.isArray(params.timeline) ? params.timeline : [];
  const last = rows[0];

  const sid = last?.numero_scrutin != null ? String(last.numero_scrutin) : "";
  if (!sid) return [];

  return [
    {
      text: "Dernier vote enregistré sur ce texte à l’Assemblée nationale.",
      proof: {
        label: `Voir le scrutin ${sid}`,
        href: `/scrutins/${encodeURIComponent(sid)}`,
      },
    },
  ];
}
