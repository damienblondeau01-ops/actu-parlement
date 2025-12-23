import { SafeScores, DTriplePlus } from "./types";

function confidenceLabel(totalVotesCount: number | null) {
  if (!totalVotesCount || totalVotesCount <= 0)
    return { label: "Confiance faible", level: "low" as const };
  if (totalVotesCount < 80)
    return { label: "Confiance faible", level: "low" as const };
  if (totalVotesCount < 250)
    return { label: "Confiance moyenne", level: "mid" as const };
  return { label: "Confiance forte", level: "high" as const };
}

function computePoliticalProfile(scores: SafeScores) {
  const p = scores.participation;
  const l = scores.loyaute;
  const m = scores.majorite;

  if (p === null || l === null || m === null) {
    return {
      title: "Profil en cours",
      subtitle: "Données insuffisantes pour qualifier finement.",
    };
  }

  if (l >= 80 && m >= 60)
    return {
      title: "Discipliné (pro-majorité)",
      subtitle: "Très aligné avec son groupe et souvent avec la majorité.",
    };
  if (l >= 80 && m < 45)
    return {
      title: "Discipliné (opposition)",
      subtitle:
        "Très aligné avec son groupe et souvent à contre-courant de la majorité.",
    };
  if (l < 45 && p >= 50)
    return {
      title: "Franc-tireur",
      subtitle:
        "Vote souvent différemment de son groupe (sur les scrutins observés).",
    };
  if (m >= 60 && l < 70)
    return {
      title: "Pivot",
      subtitle:
        "Tendance à voter comme la majorité, pas toujours comme son groupe.",
    };
  if (m >= 45 && m < 60 && l >= 55)
    return {
      title: "Profil équilibré",
      subtitle:
        "Souvent aligné groupe, parfois majorité, sans tendance extrême.",
    };

  return {
    title: "Profil nuancé",
    subtitle: "Tendance mixte selon les scrutins disponibles.",
  };
}

export function computeDTriplePlusNarrative(
  scores: SafeScores,
  totalVotesCount: number | null
): DTriplePlus {
  const p = scores.participation;
  const l = scores.loyaute;
  const m = scores.majorite;

  const conf = confidenceLabel(totalVotesCount);
  const profile = computePoliticalProfile(scores);

  const analyse = (() => {
    if (p === null || l === null || m === null) {
      return "Données insuffisantes pour qualifier finement le comportement politique sur la base des scrutins disponibles.";
    }

    const presence =
      p >= 75 ? "présence élevée" : p >= 50 ? "présence correcte" : "présence faible";

    const discipline =
      l >= 80
        ? "très aligné avec son groupe"
        : l >= 55
        ? "souvent aligné avec son groupe"
        : "pas systématiquement aligné avec son groupe";

    const maj =
      m >= 60
        ? "plutôt proche de la majorité"
        : m >= 45
        ? "en position intermédiaire vis-à-vis de la majorité"
        : "plutôt à contre-courant de la majorité";

    return `Sur la base des scrutins disponibles, ce député présente un comportement globalement lisible : ${presence}, ${discipline}, et ${maj}.`;
  })();

  const implication = (() => {
    if (p === null || l === null || m === null) {
      return "Quand l’historique de votes sera plus fourni, l’app pourra dégager une tendance plus fiable sur les scrutins importants.";
    }

    if (l >= 80 && p >= 60) {
      return "Dans les votes importants, il/elle a tendance à suivre la ligne de son groupe. Son positionnement est donc plutôt prévisible, avec peu d’écarts.";
    }

    if (l < 50 && p >= 50) {
      return "Son vote peut être moins prévisible que celui de son groupe : il/elle s’écarte régulièrement de la ligne majoritaire du groupe. À lire scrutin par scrutin.";
    }

    if (m >= 60 && l < 75) {
      return "Il/elle a souvent une tendance pro-majorité, sans être systématiquement aligné(e) avec son groupe. Peut compter sur certains scrutins serrés.";
    }

    return "Tendance nuancée : le comportement varie selon les textes et les scrutins. Il faut regarder les derniers votes pour comprendre la logique dominante.";
  })();

  const confiance = (() => {
    const n = totalVotesCount ?? 0;
    if (n <= 0) return "Analyse basée sur un volume très faible : prudence.";
    return `Analyse basée sur ${n} votes nominatifs disponibles : ${conf.label.toLowerCase()}.`;
  })();

  return {
    title: profile.title,
    analyse,
    implication,
    confiance,
    confLevel: conf.level,
  };
}
