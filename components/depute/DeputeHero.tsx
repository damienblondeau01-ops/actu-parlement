// components/depute/DeputeHero.tsx
import React, { useMemo } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Image as ExpoImage } from "expo-image";
import * as Haptics from "expo-haptics";
import { theme } from "../../lib/theme";

type DeputeLike = {
  prenom?: string | null;
  nom?: string | null;
  nomComplet?: string | null;
  nomcomplet?: string | null;
  groupeAbrev?: string | null;
  groupe?: string | null;
  circonscription?: string | null;
  departementNom?: string | null;
  departementCode?: string | null;
  photoUrl?: string | null;
  photourl?: string | null;

  // ✅ manquait dans ton type alors que tu l’utilises plus bas
  legislature?: number | string | null;

  // scores (selon ta table, parfois camelCase / lowercase)
  scoreParticipation?: number | string | null;
  scoreparticipation?: number | string | null;

  scoreLoyaute?: number | string | null;
  scoreloyaute?: number | string | null;

  scoreMajorite?: number | string | null;
  scoremajorite?: number | string | null;
};

type Props = {
  depute: DeputeLike;
  voteCount?: number | null; // optionnel : si tu as le count exact
  ctaLabel?: string; // ✅ libellé custom (contextuel)
  onPressPrimary?: () => void; // CTA principal (ex: aller à VOTES / ACTIVITY)
  showRecentHint?: boolean; // ✅ AJOUT
};

const colors = theme.colors;

/* ---------------- Helpers ---------------- */

function convertirEnNombreOuNull(valeur: number | string | null | undefined): number | null {
  if (valeur === null || valeur === undefined) return null;

  if (typeof valeur === "number") {
    return Number.isFinite(valeur) ? valeur : null;
  }

  // accepte "87.2" ou "87,2"
  const n = Number(String(valeur).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function toPct(val: number) {
  // si déjà en 0-100 on le ramène en 0-1
  const v = val > 1 ? val / 100 : val;
  return Math.round(clamp01(v) * 100);
}

function formatCirco(depute: DeputeLike) {
  const parts: string[] = [];
  if (depute.departementNom) parts.push(depute.departementNom);
  if (depute.circonscription) parts.push(depute.circonscription);
  return parts.join(" — ");
}

export default function DeputeHero({
  depute,
  voteCount,
  ctaLabel,
  onPressPrimary,
  showRecentHint = false, // ✅ AJOUT
}: Props) {
  const fullName = useMemo(() => {
    const v =
      (depute.nomComplet ?? "").trim() ||
      (depute.nomcomplet ?? "").trim() ||
      `${(depute.prenom ?? "").trim()} ${(depute.nom ?? "").trim()}`.trim();
    return v || "Député";
  }, [depute]);

  const groupLabel = useMemo(() => {
    const ab = (depute.groupeAbrev ?? "").trim();
    if (ab) return ab;
    const g = (depute.groupe ?? "").trim();
    return g || "Groupe";
  }, [depute]);

  const photo =
    (depute.photoUrl ?? "").trim() ||
    (depute.photourl ?? "").trim() ||
    undefined;

  const participationBrute = depute.scoreParticipation ?? depute.scoreparticipation ?? null;

  const kpiPct = useMemo(() => {
    const n = convertirEnNombreOuNull(participationBrute);
    if (n === null) return null;
    return toPct(n);
  }, [participationBrute]);

  const kpiTitle = kpiPct !== null ? `${kpiPct}%` : voteCount ? `${voteCount}` : "—";
  const kpiSubtitle =
    kpiPct !== null
      ? "Participation"
      : voteCount
      ? "Votes au total"
      : "Données en cours";

  const circo = formatCirco(depute);

  const leg = convertirEnNombreOuNull(depute.legislature);
  const metaLine = [circo || null, leg !== null ? `Législature ${leg}` : null]
    .filter(Boolean)
    .join(" • ");

  return (
    <View style={styles.wrap}>
      {/* background glow */}
      <View pointerEvents="none" style={styles.heroGlow} />

      <View style={styles.rowTop}>
        <View style={styles.avatarWrap}>
          {photo ? (
            <ExpoImage
              source={{ uri: photo }}
              style={styles.avatar}
              contentFit="cover"
              transition={150}
            />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarFallbackText}>
                {(fullName?.[0] ?? "D").toUpperCase()}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.topRight}>
          <View style={styles.nameRow}>
            <Text numberOfLines={2} style={styles.name}>
              {fullName}
            </Text>
          </View>

          <View style={styles.pillsRow}>
            <View style={styles.pill}>
              <Text numberOfLines={1} style={styles.pillText}>
                {groupLabel}
              </Text>
            </View>

            {metaLine ? (
              <Text numberOfLines={1} style={styles.meta}>
                {metaLine}
              </Text>
            ) : null}
          </View>
        </View>
      </View>

      {/* KPI Card */}
      <View style={styles.kpiCard}>
        <View style={styles.kpiLeft}>
          <Text style={styles.kpiValue}>{kpiTitle}</Text>
          <Text style={styles.kpiLabel}>{kpiSubtitle}</Text>
        </View>

        {onPressPrimary ? (
          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onPressPrimary();
            }}
            style={styles.primaryCta}
          >
            <Text style={styles.primaryCtaText}>{ctaLabel ?? "Voir les votes"}</Text>
          </Pressable>
        ) : (
          <View style={styles.primaryCtaGhost}>
            <Text style={styles.primaryCtaTextGhost}>—</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 14,
  },
  heroGlow: {
  position: "absolute",
  left: 16,
  right: 16,
  top: 8,
  height: 130,
  borderRadius: 26,
  backgroundColor: "rgba(255,255,255,0.05)",
  },

  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  avatarWrap: {
    width: 74,
    height: 74,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  avatar: {
    width: "100%",
    height: "100%",
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  avatarFallbackText: {
    color: colors.text,
    fontSize: 26,
    fontWeight: "800",
  },

  topRight: {
  flex: 1,
  paddingTop: 10, // ✅ descend le bloc nom/meta (évite la découpe)
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  name: {
  color: colors.text,
  fontSize: 20,
  fontWeight: "800",
  letterSpacing: 0.2,
  lineHeight: 26, // ⬅️ évite le clipping
  paddingTop: 1,  // ⬅️ micro safety
  },

  pillsRow: {
    marginTop: 8,
    gap: 8,
  },
  pill: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  pillText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  meta: {
    color: colors.subtext,
    fontSize: 12,
    fontWeight: "600",
  },

  kpiCard: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  kpiLeft: {
    gap: 2,
  },
  kpiValue: {
  color: colors.text,
  fontSize: 22,
  fontWeight: "800",
  letterSpacing: 0.2,
  },
  kpiLabel: {
    color: colors.subtext,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.25,
  },

  primaryCta: {
  paddingHorizontal: 12,
  paddingVertical: 10,
  borderRadius: 14,
  backgroundColor: "rgba(255,255,255,0.08)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.10)",
  },
  primaryCtaText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800",
  },

  primaryCtaGhost: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  primaryCtaTextGhost: {
    color: colors.subtext,
    fontSize: 13,
    fontWeight: "800",
  },
});
