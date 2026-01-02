// components/loi/LoiBlocks.tsx
import React, { useMemo, useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  LayoutAnimation,
  Platform,
  UIManager,
  Animated,
  Easing,
} from "react-native";
import { theme } from "../../lib/theme";
import { Card } from "../ui/Card";
import { SectionTitle } from "../ui/SectionTitle";
import { Chip } from "../ui/Chip";
import { Ionicons } from "@expo/vector-icons";
import ImportantCard from "@/components/ui/ImportantCard";


export type LoiScreenModel = {
  title: string;
  subtitle: string;
  statusLabel: string;

  aiIntro?: {
    title?: string;
    summary: string;
    confidence?: number;
  };

  tldr: string[];
  impact: { label: string; value: string }[];

  vote: { pour: number; contre: number; abstention: number };

  groups: { label: string; stance: "POUR" | "CONTRE" | "DIVISÉ" }[];

  timeline: {
    date: string;
    title: string;
    description: string;
    scrutinId?: string | null;

    // ✅ pour le meta premium timeline (article / amendement / autre)
    kind?: string | null;

    badgeLabel?: string;
    badgeTone?: "success" | "danger" | "warn" | "soft";
  }[];

  myDeputy?: {
    name: string;
    groupLabel: string;
    voteLabel?: "POUR" | "CONTRE" | "ABSTENTION" | "NV" | string;
  };

  jo?: {
  datePromulgation?: string | null;
  urlPromulgation?: string | null;
  sourceLabel?: string | null;
};

};

const muted = theme.colors.subtext;

if (Platform.OS === "android") {
  // ✅ safe Android
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

function clampPct(n: number) {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

function stanceStyle(stance: "POUR" | "CONTRE" | "DIVISÉ") {
  switch (stance) {
    case "POUR":
      return { bg: "rgba(34,197,94,0.12)", bd: "rgba(34,197,94,0.35)", tx: "#86efac" };
    case "CONTRE":
      return { bg: "rgba(239,68,68,0.12)", bd: "rgba(239,68,68,0.35)", tx: "#fca5a5" };
    default:
      return { bg: "rgba(250,204,21,0.12)", bd: "rgba(250,204,21,0.35)", tx: "#fde68a" };
  }
}

function computeGroupMajority(groups: { stance: "POUR" | "CONTRE" | "DIVISÉ" }[]) {
  const pour = groups.filter((g) => g.stance === "POUR").length;
  const contre = groups.filter((g) => g.stance === "CONTRE").length;
  const div = groups.filter((g) => g.stance === "DIVISÉ").length;

  if (pour === 0 && contre === 0 && div === 0)
    return { majority: "DIVISÉ" as const, pour, contre, div };
  if (pour > contre) return { majority: "POUR" as const, pour, contre, div };
  if (contre > pour) return { majority: "CONTRE" as const, pour, contre, div };
  return { majority: "DIVISÉ" as const, pour, contre, div };
}

/* ---------------- AI INTRO (premium) ---------------- */

export function LoiAIIntroBlock({ m }: { m: LoiScreenModel }) {
  if (!m.aiIntro?.summary) return null;

  const [expanded, setExpanded] = useState(false);

  const lines = useMemo(() => {
    const raw = (m.aiIntro?.summary ?? "").trim();
    if (!raw) return [];
    return raw
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);
  }, [m.aiIntro?.summary]);

  const canExpand = lines.length > 3;
  const visibleLines = expanded ? lines : lines.slice(0, 3);

  return (
  <ImportantCard style={styles.aiCard}>
      <View style={styles.aiHalo} />

      <View style={styles.aiInner}>
        <View style={styles.aiHeader}>
          <View style={styles.aiBadge}>
            <Text style={styles.aiBadgeText}>EN CLAIR</Text>
          </View>
          <Text style={styles.aiTitle} numberOfLines={2}>
            {m.aiIntro?.title?.trim() ? m.aiIntro.title : "L’essentiel à comprendre"}
          </Text>
        </View>

        <View style={styles.aiBody}>
          {visibleLines.map((line, i) => (
            <Text key={`${i}-${line.slice(0, 12)}`} style={styles.aiText}>
              {line}
            </Text>
          ))}
        </View>

        {canExpand && (
          <Pressable
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setExpanded((v) => !v);
            }}
            android_ripple={{ color: "rgba(255,255,255,0.06)" }}
            style={({ pressed }) => [styles.aiCta, pressed && { opacity: 0.9 }]}
            hitSlop={10}
          >
            <Text style={styles.aiCtaText}>{expanded ? "Réduire" : "Lire plus"}</Text>
          </Pressable>
        )}
      </View>
    </ImportantCard>
  );
}

/* ---------------- HERO ---------------- */

function isTechKpiLabel(label?: string | null) {
  const x = (label ?? "").toLowerCase().trim();
  if (!x) return false;

  // ✅ on évite de mettre ces chiffres en hero (ils restent dans Impact/Détails)
  const banned = ["article", "articles", "amendement", "amendements", "sous-amendement", "sous-amendements"];
  return banned.some((b) => x.includes(b));
}

export function LoiHero({ m }: { m: LoiScreenModel }) {
  // ✅ ne pas mettre "Articles/Amendements/Sous-amendements" en KPI hero
  const rawKpis = m.impact ?? [];
  const heroKpis = rawKpis.filter((x) => !isTechKpiLabel(x.label)).slice(0, 2);

  const kpiA = heroKpis[0];
  const kpiB = heroKpis[1];

  const maj = computeGroupMajority(m.groups ?? []);

  const majorityLabel =
    maj.majority === "POUR"
      ? "Majorité : POUR"
      : maj.majority === "CONTRE"
      ? "Majorité : CONTRE"
      : "Majorité : PARTAGÉE";

  const majorityIcon = maj.majority === "POUR" ? "▲" : maj.majority === "CONTRE" ? "▼" : "≈";

  const majorityTone =
    maj.majority === "POUR"
      ? styles.majorityPour
      : maj.majority === "CONTRE"
      ? styles.majorityContre
      : styles.majorityDiv;

  const pillAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    pillAnim.stopAnimation();
    pillAnim.setValue(0);
    Animated.timing(pillAnim, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [maj.majority, pillAnim]);

  const pillStyle = {
    opacity: pillAnim,
    transform: [
      { translateY: pillAnim.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) },
      { scale: pillAnim.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) },
    ],
  };

  return (
    <Card style={styles.heroCard}>
      <View style={styles.heroHalo} />

      <View style={styles.heroInner}>
        <View style={styles.heroTopRow}>
          <Chip label={m.statusLabel} />

          <View style={styles.heroRightCol}>
            <Animated.View style={pillStyle}>
              <View style={[styles.majorityPill, majorityTone]}>
                <Text style={styles.majorityIcon}>{majorityIcon}</Text>
                <Text style={styles.majorityText} numberOfLines={1}>
                  {majorityLabel}
                </Text>
              </View>
            </Animated.View>

            <View style={styles.heroRightHint}>
              <Text style={styles.heroRightHintText}>Fiche citoyen</Text>
            </View>
          </View>
        </View>

        <Text style={styles.h1} numberOfLines={3}>
          {m.title}
        </Text>

        <Text style={styles.heroContext}>Aperçu basé sur les derniers scrutins</Text>

        {(kpiA || kpiB) && (
          <View style={styles.heroKpisRow}>
            {kpiA && (
              <View style={styles.heroKpi}>
                <Text style={styles.heroKpiValue}>{kpiA.value}</Text>
                <Text style={styles.heroKpiLabel}>{kpiA.label}</Text>
              </View>
            )}
            {kpiB && (
              <View style={styles.heroKpi}>
                <Text style={styles.heroKpiValue}>{kpiB.value}</Text>
                <Text style={styles.heroKpiLabel}>{kpiB.label}</Text>
              </View>
            )}
          </View>
        )}
      </View>
    </Card>
  );
}

/* ---------------- TLDR ---------------- */

export function LoiTLDR({ m }: { m: LoiScreenModel }) {
  return (
    <Card>
      <SectionTitle>Ce qu’il faut retenir</SectionTitle>

      {m.tldr.slice(0, 3).map((x, i) => (
        <View key={i} style={styles.tldrRow}>
          <View style={styles.tldrDot} />
          <Text style={styles.p}>{x}</Text>
        </View>
      ))}
    </Card>
  );
}

/* ---------------- IMPACT (aperçu + détail technique repliable) ---------------- */

export function LoiImpact({ m }: { m: LoiScreenModel }) {
  const [expanded, setExpanded] = useState(false);

  const all = m.impact ?? [];
  const techLabels = new Set(["articles", "amendements", "sous-amendements"]);

  const tech = all.filter((x) => techLabels.has((x.label ?? "").toLowerCase().trim()));
  const nonTech = all.filter((x) => !techLabels.has((x.label ?? "").toLowerCase().trim()));

  const preview = nonTech.slice(0, 3);
  const hasTech = tech.length > 0;

  return (
    <Card>
      <SectionTitle>Pourquoi c’est important</SectionTitle>

      {preview.length > 0 ? (
        <View style={styles.grid}>
          {preview.map((it, i) => (
            <View key={`${it.label}-${i}`} style={styles.kpi}>
              <Text style={styles.kpiValue}>{it.value}</Text>
              <Text style={styles.kpiLabel}>{it.label}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={[styles.small, { marginTop: 6 }]}>Indicateurs indisponibles.</Text>
      )}

      {/* ✅ détail technique repliable (articles/amendements/sous-amendements) */}
      {hasTech && (
        <>
          <Pressable
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setExpanded((v) => !v);
            }}
            hitSlop={10}
            android_ripple={{ color: "rgba(255,255,255,0.06)" }}
            style={({ pressed }) => [styles.techCta, pressed && { opacity: 0.92 }]}
          >
            <Text style={styles.techCtaText}>
              {expanded ? "Masquer les détails techniques" : "Afficher les détails techniques"}
            </Text>
            <Text style={styles.techCtaChev}>{expanded ? "˄" : "˅"}</Text>
          </Pressable>

          {expanded && (
            <View style={styles.techBox}>
              {tech.map((it, i) => (
                <View key={`${it.label}-tech-${i}`} style={styles.techRow}>
                  <Text style={styles.techLabel}>{it.label}</Text>
                  <Text style={styles.techValue}>{it.value}</Text>
                </View>
              ))}
              <Text style={[styles.small, { marginTop: 8 }]}>
                Détails “techniques” : utiles pour experts, pas indispensables pour comprendre
                l’essentiel.
              </Text>
            </View>
          )}
        </>
      )}
    </Card>
  );
}

/* ---------------- VOTE ---------------- */

export function LoiVoteResult({ m }: { m: LoiScreenModel }) {
  const total = (m.vote?.pour ?? 0) + (m.vote?.contre ?? 0) + (m.vote?.abstention ?? 0);
  const hasTotals = total > 0;

  const safeTotal = hasTotals ? total : 1;

  const pourPct = hasTotals ? clampPct(Math.round(((m.vote?.pour ?? 0) * 100) / safeTotal)) : 0;
  const contrePct = hasTotals ? clampPct(Math.round(((m.vote?.contre ?? 0) * 100) / safeTotal)) : 0;
  const abstPct = hasTotals ? clampPct(100 - pourPct - contrePct) : 0;

  // ✅ Badge = vérité produit (déjà calculée avec resultat ou votes)
  const badgeLabel = (m.statusLabel ?? "").trim() || (hasTotals ? "Résultat" : "Vote indisponible");

  return (
    <Card>
      <View style={styles.titleRow}>
        <SectionTitle>Résultat du scrutin de référence</SectionTitle>

        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badgeLabel}</Text>
        </View>
      </View>

      <View style={styles.voteBar}>
        {hasTotals ? (
          <>
            <View style={{ flex: Math.max(1, pourPct), backgroundColor: "rgba(34,197,94,0.35)" }} />
            <View style={{ flex: Math.max(1, contrePct), backgroundColor: "rgba(239,68,68,0.35)" }} />
            <View style={{ flex: Math.max(1, abstPct), backgroundColor: "rgba(250,204,21,0.33)" }} />
          </>
        ) : (
          <View style={{ flex: 1, backgroundColor: "rgba(148,163,184,0.22)" }} />
        )}
      </View>

      <View style={styles.voteLegendRow}>
        <Text style={styles.legendText}>Pour {hasTotals ? `${m.vote.pour} (${pourPct}%)` : "—"}</Text>
        <Text style={styles.legendText}>
          Contre {hasTotals ? `${m.vote.contre} (${contrePct}%)` : "—"}
        </Text>
        <Text style={styles.legendText}>
          Abst. {hasTotals ? `${m.vote.abstention} (${abstPct}%)` : "—"}
        </Text>
      </View>

      {hasTotals ? (
        <>
          <View style={styles.voteRow}>
            <View style={styles.voteBox}>
              <Text style={styles.voteNum}>{m.vote.pour}</Text>
              <Text style={styles.voteLbl}>Pour</Text>
            </View>
            <View style={styles.voteBox}>
              <Text style={styles.voteNum}>{m.vote.contre}</Text>
              <Text style={styles.voteLbl}>Contre</Text>
            </View>
            <View style={styles.voteBox}>
              <Text style={styles.voteNum}>{m.vote.abstention}</Text>
              <Text style={styles.voteLbl}>Abst.</Text>
            </View>
          </View>

          <Text style={styles.small}>{`${total} votes (hors non-votants)`}</Text>
        </>
      ) : (
        <Text style={styles.small}>
          Détail chiffré indisponible pour l’instant (mais le statut peut être connu via le résultat
          du scrutin).
        </Text>
      )}
    </Card>
  );
}

/* ---------------- GROUPES (aperçu + voir plus) ---------------- */

export function LoiGroupVotes({
  m,
  onGroupPress,
}: {
  m: LoiScreenModel;
  onGroupPress?: (groupLabel: string) => void;
}) {
  const hasGroups = (m.groups?.length ?? 0) > 0;

  const [expanded, setExpanded] = useState(false);
  const maxPreview = 6;
  const visibleGroups = expanded ? m.groups : (m.groups ?? []).slice(0, maxPreview);
  const canExpand = (m.groups?.length ?? 0) > maxPreview;

  const maj = useMemo(() => computeGroupMajority(m.groups ?? []), [m.groups]);

  const barAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    barAnim.stopAnimation();
    barAnim.setValue(0);
    Animated.timing(barAnim, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [barAnim, maj.pour, maj.contre, maj.div]);

  return (
    <Card>
      <SectionTitle>Position des groupes</SectionTitle>

      {m.myDeputy ? (
        <View style={styles.myDeputyCard}>
          <View style={styles.myDeputyTop}>
            <Text style={styles.myDeputyTitle}>Mon député</Text>
            <View style={styles.myDeputyPill}>
              <Text style={styles.myDeputyPillText}>{m.myDeputy.groupLabel}</Text>
            </View>
          </View>

          <Text style={styles.myDeputyName} numberOfLines={1}>
            {m.myDeputy.name}
          </Text>
          <Text style={styles.myDeputyMeta} numberOfLines={1}>
            {m.myDeputy.voteLabel ? `Vote : ${m.myDeputy.voteLabel}` : "Vote : —"}
          </Text>
        </View>
      ) : (
        <Text style={[styles.small, { marginTop: 6 }]}>
          Astuce : bientôt, tu pourras épingler “Mon député” ici.
        </Text>
      )}

      {!hasGroups ? (
        <Text style={[styles.small, { marginTop: 10 }]}>
          Les groupes n’ont pas encore voté sur cette loi.
        </Text>
      ) : (
        (() => {
          const total = m.groups.length;

          const summary =
            maj.majority === "POUR"
              ? "La majorité des groupes soutient le texte"
              : maj.majority === "CONTRE"
              ? "La majorité des groupes s’oppose au texte"
              : "Les groupes sont partagés";

          return (
            <>
              <View style={styles.groupSummary}>
                <View
                  style={[
                    styles.groupSummaryBadge,
                    maj.majority === "POUR"
                      ? styles.groupMajorityPour
                      : maj.majority === "CONTRE"
                      ? styles.groupMajorityContre
                      : styles.groupMajorityDiv,
                  ]}
                >
                  <Text style={styles.groupSummaryText}>{summary}</Text>
                  <Text style={styles.groupSummarySub}>
                    {maj.pour} pour • {maj.contre} contre • {maj.div} divisés • {total} groupes
                  </Text>
                </View>
              </View>

              <View style={styles.groupBar}>
                <Animated.View
                  style={[
                    styles.groupBarPour,
                    {
                      flex: barAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, Math.max(1, maj.pour)],
                      }),
                    },
                  ]}
                />
                <Animated.View
                  style={[
                    styles.groupBarContre,
                    {
                      flex: barAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, Math.max(1, maj.contre)],
                      }),
                    },
                  ]}
                />
                <Animated.View
                  style={[
                    styles.groupBarDiv,
                    {
                      flex: barAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, Math.max(1, maj.div)],
                      }),
                    },
                  ]}
                />
              </View>

              <View style={styles.groupLegend}>
                <Text style={styles.legendText}>Pour {maj.pour}</Text>
                <Text style={styles.legendText}>Contre {maj.contre}</Text>
                <Text style={styles.legendText}>Divisé {maj.div}</Text>
              </View>

              <View style={{ marginTop: 6 }}>
                {visibleGroups.map((g, i) => {
                  const st = stanceStyle(g.stance);
                  const pressable = !!onGroupPress;
                  const isMyGroup =
                    !!m.myDeputy?.groupLabel &&
                    m.myDeputy.groupLabel.trim().toUpperCase() === g.label.trim().toUpperCase();

                  return (
                    <Pressable
                      key={`${g.label}-${i}`}
                      disabled={!pressable}
                      onPress={() => pressable && onGroupPress!(g.label)}
                      hitSlop={10}
                      android_ripple={pressable ? { color: "rgba(255,255,255,0.06)" } : undefined}
                      style={({ pressed }) => [
                        styles.groupRowPremium,
                        isMyGroup && styles.groupRowMyGroup,
                        pressed && pressable ? { opacity: 0.92 } : null,
                      ]}
                    >
                      <Text style={styles.groupNamePremium} numberOfLines={1}>
                        {g.label}
                      </Text>

                      <View style={styles.groupRight}>
                        <View style={[styles.groupMiniBar, { backgroundColor: st.bg, borderColor: st.bd }]} />
                        <Text style={[styles.groupStanceText, { color: st.tx }]}>{g.stance}</Text>
                        {pressable ? <Text style={styles.groupChev}>›</Text> : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>

              {canExpand && (
                <Pressable
                  onPress={() => {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setExpanded((v) => !v);
                  }}
                  hitSlop={10}
                  android_ripple={{ color: "rgba(255,255,255,0.06)" }}
                  style={({ pressed }) => [styles.seeAllBtn, pressed && { opacity: 0.9 }]}
                >
                  <Text style={styles.seeAllText}>{expanded ? "Voir moins →" : `Voir plus (${total}) →`}</Text>
                </Pressable>
              )}

              <Text style={styles.small}>Astuce : touche un groupe pour voir le détail des votes.</Text>
            </>
          );
        })()
      )}
    </Card>
  );
}

/* ---------------- TIMELINE (aperçu + 1 CTA clair) ---------------- */

function extractResultFromDescription(desc?: string | null) {
  if (!desc) return null;
  const m = desc.match(/Résultat\s*:\s*([^\.\n]+)\./i);
  return m?.[1]?.trim() ? m[1].trim() : null;
}

function stripResultFromDescription(desc?: string | null) {
  if (!desc) return "";
  return desc.replace(/Résultat\s*:\s*[^\.\n]+\.\s*/i, "").trim();
}

type TimelineMeta = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint: string;
};

function getTimelineMeta(index: number, kind?: string | null): TimelineMeta {
  const k = (kind ?? "").toLowerCase().trim();

  if (index === 0) {
    return { icon: "time-outline", label: "Vote le plus récent", hint: "Dernière décision prise sur ce texte." };
  }

  if (index === 1) {
    return { icon: "sparkles-outline", label: "Vote clé", hint: "Moment susceptible d’avoir influencé l’issue du débat." };
  }

  if (k.includes("amend")) {
    return { icon: "create-outline", label: "Amendement", hint: "Modification proposée au texte initial." };
  }

  if (k === "article") {
    return { icon: "document-text-outline", label: "Article / section", hint: "Décision portant sur une partie précise du texte." };
  }

  return { icon: "checkbox-outline", label: "Vote", hint: "Étape du parcours parlementaire." };
}

export function LoiTimeline({
  m,
  onStepPress,
  onSeeAll,
}: {
  m: LoiScreenModel;
  onStepPress?: (scrutinId: string) => void;
  onSeeAll?: () => void;
}) {
  const all = m.timeline ?? [];
  const total = all.length;

  const previewCount = 3;
  const steps = all.slice(0, previewCount);

  return (
    <Card>
      <View style={styles.timelineHeaderRow}>
        <SectionTitle>Dernières étapes</SectionTitle>
        <Text style={styles.timelineCount}>
          {steps.length} / {total} étape(s)
        </Text>
      </View>

      {steps.length === 0 ? (
        <Text style={[styles.small, { marginTop: 6 }]}>
          Cette loi n’a pas encore fait l’objet de scrutins parlementaires.
        </Text>
      ) : (
        <>
          {steps.map((t, i) => {
            const isLast = i === steps.length - 1;
            const canPress = !!t.scrutinId && !!onStepPress;

            const autoResult = extractResultFromDescription(t.description);
            const cleanDesc = stripResultFromDescription(t.description);

            const showTone = t.badgeTone ?? "soft";
            const showLabel = t.badgeLabel ?? (autoResult ? autoResult : null);

            const meta = getTimelineMeta(i, t.kind ?? null);

            return (
              <View key={`${t.date}-${i}`} style={styles.timeItem}>
                <View style={styles.timeLeft}>
                  <View style={[styles.timeDotOuter, isLast && styles.timeDotOuterLast]}>
                    <View style={[styles.timeDotInner, isLast && styles.timeDotInnerLast]} />
                  </View>
                  {!isLast && <View style={styles.timeLine} />}
                </View>

                <Pressable
                  disabled={!canPress}
                  onPress={() => canPress && onStepPress!(String(t.scrutinId))}
                  hitSlop={10}
                  android_ripple={canPress ? { color: "rgba(255,255,255,0.06)" } : undefined}
                  style={({ pressed }) => [
                    styles.timeRightPressable,
                    isLast && styles.timeRightPressableLast,
                    pressed && canPress && styles.timePressed,
                    !canPress && styles.timeDisabled,
                  ]}
                >
                  <View style={styles.timeTopRow}>
                    <Text style={styles.timeDate}>{t.date}</Text>

                    <View style={styles.badgesRow}>
                      <View style={styles.stepBadge}>
                        <Ionicons name={meta.icon} size={14} color={muted} />
                        <Text style={styles.stepBadgeText}>{meta.label}</Text>
                      </View>

                      {!!showLabel && (
                        <View
                          style={[
                            styles.badgeMini,
                            showTone === "success"
                              ? styles.badgeSuccess
                              : showTone === "danger"
                              ? styles.badgeDanger
                              : showTone === "warn"
                              ? styles.badgeWarn
                              : styles.badgeSoft,
                          ]}
                        >
                          <Text
                            style={[
                              styles.badgeMiniText,
                              showTone === "success"
                                ? styles.badgeSuccessText
                                : showTone === "danger"
                                ? styles.badgeDangerText
                                : showTone === "warn"
                                ? styles.badgeWarnText
                                : styles.badgeSoftText,
                            ]}
                          >
                            {showLabel}
                          </Text>
                        </View>
                      )}

                      {canPress ? <Text style={styles.chev}>›</Text> : null}
                    </View>
                  </View>

                  <Text style={styles.timeTitle}>{t.title}</Text>

                  {!!autoResult && !t.badgeLabel ? <Text style={styles.timeResult}>Résultat : {autoResult}</Text> : null}

                  {!!cleanDesc ? <Text style={styles.timeDescription}>{cleanDesc}</Text> : null}

                  <Text style={styles.timeHint}>{meta.hint}</Text>

                  <View style={styles.timeCtaRow}>
                    <Text style={[styles.timeCta, canPress ? styles.timeCtaActive : styles.timeCtaMuted]}>
                      {canPress ? "Voir le détail du vote →" : "Scrutin indisponible"}
                    </Text>
                  </View>
                </Pressable>
              </View>
            );
          })}

          {total > steps.length && !!onSeeAll && (
            <Pressable
              onPress={onSeeAll}
              hitSlop={10}
              android_ripple={{ color: "rgba(255,255,255,0.06)" }}
              style={({ pressed }) => [styles.seeAllBtn, pressed && { opacity: 0.9 }]}
            >
              <Text style={styles.seeAllText}>Voir tout le parcours ({total}) →</Text>
            </Pressable>
          )}
        </>
      )}
    </Card>
  );
}

/* ---------------- STYLES ---------------- */

const styles = StyleSheet.create({
  aiCard: {
    overflow: "hidden",
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  aiInner: { padding: 14 },
  aiHalo: {
    position: "absolute",
    top: -120,
    left: -120,
    width: 240,
    height: 240,
    borderRadius: 999,
    backgroundColor: "rgba(34,197,94,0.14)",
  },
  aiHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  aiBadge: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(34,197,94,0.18)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.28)",
  },
  aiBadgeText: {
    color: theme.colors.text,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  aiTitle: { color: theme.colors.text, fontSize: 16, fontWeight: "900", flex: 1 },
  aiBody: { marginTop: 12, gap: 10 },
  aiText: { color: theme.colors.text, fontSize: 15, lineHeight: 22, fontWeight: "600" },
  aiCta: { marginTop: 12, alignSelf: "flex-start", paddingVertical: 6, paddingHorizontal: 8, borderRadius: 10 },
  aiCtaText: { color: theme.colors.primary, fontSize: 13, fontWeight: "900" },

  heroCard: {
    overflow: "hidden",
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  heroInner: { paddingTop: 14, paddingHorizontal: 14, paddingBottom: 14 },
  heroHalo: {
    position: "absolute",
    top: -120,
    right: -120,
    width: 240,
    height: 240,
    borderRadius: 999,
    backgroundColor: "rgba(79,70,229,0.18)",
  },
  heroTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  heroRightCol: { alignItems: "flex-end", gap: 8 },

  majorityPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  majorityIcon: { color: theme.colors.text, fontSize: 12, fontWeight: "900" },
  majorityText: { color: theme.colors.text, fontSize: 12, fontWeight: "900" },
  majorityPour: { backgroundColor: "rgba(34,197,94,0.12)", borderColor: "rgba(34,197,94,0.25)" },
  majorityContre: { backgroundColor: "rgba(239,68,68,0.12)", borderColor: "rgba(239,68,68,0.25)" },
  majorityDiv: { backgroundColor: "rgba(250,204,21,0.10)", borderColor: "rgba(250,204,21,0.20)" },

  heroRightHint: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  heroRightHintText: { color: muted, fontSize: 12, fontWeight: "700" },

  h1: { marginTop: 12, color: theme.colors.text, fontSize: 26, fontWeight: "900", lineHeight: 30, letterSpacing: -0.2 },

  heroKpisRow: { flexDirection: "row", gap: 12, marginTop: 14 },
  heroKpi: {
    flex: 1,
    padding: 12,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  heroKpiValue: { color: theme.colors.text, fontSize: 18, fontWeight: "900" },
  heroKpiLabel: { marginTop: 4, color: muted, fontSize: 12, fontWeight: "700" },

  tldrRow: { flexDirection: "row", gap: 10, marginTop: 10, alignItems: "flex-start" },
  tldrDot: { width: 8, height: 8, borderRadius: 999, backgroundColor: theme.colors.primary, marginTop: 6 },
  p: { flex: 1, color: theme.colors.text, fontSize: 14, lineHeight: 20 },

  grid: { flexDirection: "row", gap: 12, marginTop: 10 },
  kpi: {
    flex: 1,
    padding: 12,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  kpiValue: { color: theme.colors.text, fontSize: 18, fontWeight: "900" },
  kpiLabel: { marginTop: 6, color: muted, fontSize: 12, fontWeight: "700" },

  techCta: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  techCtaText: { color: theme.colors.text, fontSize: 13, fontWeight: "900" },
  techCtaChev: { color: muted, fontSize: 14, fontWeight: "900", marginLeft: 10 },

  techBox: {
    marginTop: 10,
    padding: 12,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  techRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  techLabel: { color: muted, fontSize: 12, fontWeight: "800" },
  techValue: { color: theme.colors.text, fontSize: 13, fontWeight: "900" },

  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 2 },
  badge: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(79,70,229,0.14)",
    borderWidth: 1,
    borderColor: "rgba(79,70,229,0.30)",
  },
  badgeText: { color: theme.colors.text, fontSize: 12, fontWeight: "900" },
  voteBar: {
    flexDirection: "row",
    height: 10,
    borderRadius: 999,
    overflow: "hidden",
    marginTop: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  voteLegendRow: { flexDirection: "row", justifyContent: "space-between", gap: 10, marginTop: 8, flexWrap: "wrap" },
  legendText: { color: muted, fontSize: 12, fontWeight: "700" },
  voteRow: { flexDirection: "row", gap: 12, marginTop: 10 },
  voteBox: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  voteNum: { color: theme.colors.text, fontSize: 18, fontWeight: "900" },
  voteLbl: { marginTop: 4, color: muted, fontSize: 12, fontWeight: "800" },

  myDeputyCard: {
    marginTop: 8,
    padding: 12,
    borderRadius: 16,
    backgroundColor: "rgba(99,102,241,0.06)",
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.18)",
  },
  myDeputyTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  myDeputyTitle: { color: muted, fontSize: 12, fontWeight: "900" },
  myDeputyPill: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  myDeputyPillText: { color: theme.colors.text, fontSize: 12, fontWeight: "900" },
  myDeputyName: { marginTop: 6, color: theme.colors.text, fontSize: 14, fontWeight: "900" },
  myDeputyMeta: { marginTop: 4, color: muted, fontSize: 12, fontWeight: "700" },

  groupSummary: { marginTop: 10, marginBottom: 10 },
  groupSummaryBadge: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1 },
  groupMajorityPour: { backgroundColor: "rgba(34,197,94,0.10)", borderColor: "rgba(34,197,94,0.25)" },
  groupMajorityContre: { backgroundColor: "rgba(239,68,68,0.10)", borderColor: "rgba(239,68,68,0.25)" },
  groupMajorityDiv: { backgroundColor: "rgba(250,204,21,0.08)", borderColor: "rgba(250,204,21,0.20)" },
  groupSummaryText: { color: theme.colors.text, fontSize: 13, fontWeight: "900" },
  groupSummarySub: { marginTop: 6, color: muted, fontSize: 12, fontWeight: "700" },

  groupBar: {
    flexDirection: "row",
    height: 10,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  groupBarPour: { backgroundColor: "rgba(34,197,94,0.35)" },
  groupBarContre: { backgroundColor: "rgba(239,68,68,0.35)" },
  groupBarDiv: { backgroundColor: "rgba(250,204,21,0.33)" },

  groupLegend: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },

  groupRowPremium: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  groupRowMyGroup: {
    backgroundColor: "rgba(99,102,241,0.06)",
    borderRadius: 12,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.18)",
  },
  groupNamePremium: { color: theme.colors.text, fontSize: 14, fontWeight: "800", flex: 1, paddingRight: 10 },
  groupRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  groupMiniBar: { width: 18, height: 10, borderRadius: 999, borderWidth: 1 },
  groupStanceText: { fontSize: 12, fontWeight: "900", letterSpacing: 0.3 },
  groupChev: { color: muted, fontSize: 18, fontWeight: "900", marginLeft: 2, marginTop: -1 },

  timelineHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  timelineCount: { color: muted, fontSize: 12, fontWeight: "800" },

  timeItem: { flexDirection: "row", marginTop: 12 },
  timeLeft: { width: 18, alignItems: "center" },
  timeDotOuter: {
    width: 14,
    height: 14,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "rgba(79,70,229,0.55)",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  timeDotOuterLast: { borderColor: "rgba(79,70,229,0.85)" },
  timeDotInner: { width: 8, height: 8, borderRadius: 999, backgroundColor: theme.colors.primary },
  timeDotInnerLast: { backgroundColor: "rgba(99,102,241,1)" },
  timeLine: { width: 2, flexGrow: 1, backgroundColor: "rgba(255,255,255,0.10)", marginTop: 2, borderRadius: 999 },

  timeRightPressable: {
    flex: 1,
    paddingLeft: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  timeRightPressableLast: { backgroundColor: "rgba(79,70,229,0.07)", borderColor: "rgba(79,70,229,0.14)" },
  timePressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
  timeDisabled: { opacity: 0.75 },

  timeTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  timeDate: { color: muted, fontSize: 12, fontWeight: "800" },

  badgesRow: { flexDirection: "row", gap: 6, alignItems: "center" },
  stepBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  stepBadgeText: { color: muted, fontSize: 11, fontWeight: "900" },

  chev: { color: muted, fontSize: 18, fontWeight: "900", marginLeft: 2, marginTop: -1 },

  timeTitle: { marginTop: 8, color: theme.colors.text, fontSize: 14, fontWeight: "900", lineHeight: 20 },
  timeResult: { marginTop: 6, color: theme.colors.text, fontSize: 12, fontWeight: "900", opacity: 0.9 },
  timeDescription: { marginTop: 4, color: muted, fontSize: 13, lineHeight: 18 },

  timeHint: { marginTop: 6, color: muted, fontSize: 12, lineHeight: 16, opacity: 0.9 },

  timeCtaRow: { marginTop: 10 },
  timeCta: { fontSize: 12, fontWeight: "900" },
  timeCtaActive: { color: theme.colors.primary },
  timeCtaMuted: { color: muted },

  badgeMini: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 999, borderWidth: 1 },
  badgeMiniText: { fontSize: 11, fontWeight: "900" },
  badgeSuccess: { backgroundColor: "rgba(34,197,94,0.14)", borderColor: "rgba(34,197,94,0.35)" },
  badgeSuccessText: { color: "#86efac" },
  badgeDanger: { backgroundColor: "rgba(239,68,68,0.14)", borderColor: "rgba(239,68,68,0.35)" },
  badgeDangerText: { color: "#fca5a5" },
  badgeWarn: { backgroundColor: "rgba(250,204,21,0.12)", borderColor: "rgba(250,204,21,0.35)" },
  badgeWarnText: { color: "#fde68a" },
  badgeSoft: { backgroundColor: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.10)" },
  badgeSoftText: { color: muted },

  seeAllBtn: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
  },
  seeAllText: { color: theme.colors.text, fontSize: 13, fontWeight: "900" },

  small: { marginTop: 10, color: muted, fontSize: 12, lineHeight: 16 },

  heroContext: {
    marginTop: 6,
    color: theme.colors.subtext,
    fontSize: 12,
    fontWeight: "600",
  },
});
