// app/(tabs)/lois/[id]/group/[g].tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useEffect, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { theme } from "../../../../../lib/theme";
import { Card } from "../../../../../components/ui/Card";
import { SectionTitle } from "../../../../../components/ui/SectionTitle";

import {
  fetchLoiTimeline,
  fetchVotesGroupesByScrutin,
  type VoteGroupePositionRow,
} from "../../../../../lib/queries/lois";

const colors = theme.colors;

type RouteParams = {
  id?: string; // loi_id
  g?: string; // groupe label (ex: "RN", "EPR"...)
  s?: string; // numero_scrutin (query param legacy)
  vs?: string; // numero_scrutin (new param)
};

type GroupStance = "POUR" | "CONTRE" | "DIVISÉ";
type GroupCounts = { pour: number; contre: number; abstention: number; nv: number };

type GroupDetailModel = {
  groupLabel: string;          // label court affiché (souvent RN)
  groupName?: string | null;   // nom long
  stance: GroupStance;
  counts: GroupCounts;
  context: string;
};

type TimelineRow = {
  numero_scrutin: string;
  date_scrutin: string | null;
  titre: string | null;
  objet: string | null;
  resultat: string | null;
  kind: string | null;
  article_ref: string | null;
};

function fmtDateFR(d?: string | null) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("fr-FR");
  } catch {
    return "—";
  }
}

/* ---------------- Micro-animations ---------------- */

function FadeInUp({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const y = React.useRef(new Animated.Value(10)).current;
  const o = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(o, {
        toValue: 1,
        duration: 260,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(y, {
        toValue: 0,
        duration: 260,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [delay, o, y]);

  return <Animated.View style={{ opacity: o, transform: [{ translateY: y }] }}>{children}</Animated.View>;
}

function CountUp({ value, duration = 450, suffix = "" }: { value: number; duration?: number; suffix?: string }) {
  const anim = React.useRef(new Animated.Value(0)).current;
  const [shown, setShown] = React.useState(0);

  React.useEffect(() => {
    const id = anim.addListener(({ value: v }) => setShown(Math.round(v)));

    anim.setValue(0);
    Animated.timing(anim, {
      toValue: value,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

    return () => anim.removeListener(id);
  }, [value, duration, anim]);

  return (
    <Text>
      {shown}
      {suffix}
    </Text>
  );
}

/* ---------------- Helpers ---------------- */

function safeStr(x?: string | null) {
  return (x ?? "").trim();
}

function norm(x?: string | null) {
  return safeStr(x)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function stanceStyle(stance: GroupStance) {
  switch (stance) {
    case "POUR":
      return {
        bg: "rgba(34,197,94,0.12)",
        bd: "rgba(34,197,94,0.35)",
        tx: "#86efac",
        icon: "▲",
        label: "Soutient majoritairement",
      };
    case "CONTRE":
      return {
        bg: "rgba(239,68,68,0.12)",
        bd: "rgba(239,68,68,0.35)",
        tx: "#fca5a5",
        icon: "▼",
        label: "S’oppose majoritairement",
      };
    default:
      return {
        bg: "rgba(250,204,21,0.12)",
        bd: "rgba(250,204,21,0.35)",
        tx: "#fde68a",
        icon: "≈",
        label: "Position partagée",
      };
  }
}

function totalVotes(c: GroupCounts) {
  return c.pour + c.contre + c.abstention + c.nv;
}

function pct(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part * 100) / total);
}

function normalizePosition(pos?: string | null): keyof GroupCounts {
  const x = (pos ?? "").toLowerCase().trim();
  if (!x) return "nv";
  if (x.includes("pour")) return "pour";
  if (x.includes("contre")) return "contre";
  if (x.includes("abst")) return "abstention";
  if ((x.includes("non") && x.includes("vot")) || x.includes("non-vot") || x === "nv") return "nv";
  return "nv";
}

function stanceFromCounts(c: GroupCounts): GroupStance {
  const max = Math.max(c.pour, c.contre, c.abstention, c.nv);
  if (max === 0) return "DIVISÉ";
  if (c.pour === max) return "POUR";
  if (c.contre === max) return "CONTRE";
  return "DIVISÉ";
}

function contextFromCounts(groupLabel: string, c: GroupCounts) {
  const t = totalVotes(c);
  if (!t) return `Aucune donnée de vote disponible pour ${groupLabel} sur ce scrutin.`;
  const s = stanceFromCounts(c);
  if (s === "POUR") return `Sur ce vote, ${groupLabel} soutient majoritairement le texte.`;
  if (s === "CONTRE") return `Sur ce vote, ${groupLabel} s’oppose majoritairement au texte.`;
  return `Sur ce vote, ${groupLabel} est partagé (positions réparties).`;
}

/* ---------------- Screen ---------------- */

export default function LoiGroupDetailScreen() {
  const { id, g, s, vs } = useLocalSearchParams<RouteParams>();
  const router = useRouter();

  const loiId = useMemo(() => String(id ?? ""), [id]);
  const groupLabelRaw = useMemo(() => decodeURIComponent(String(g ?? "—")), [g]);

  // Support legacy ?s= + new ?vs=
  const scrutinFromQuery = useMemo(() => {
    const raw = vs ?? s;
    return raw ? decodeURIComponent(String(raw)) : null;
  }, [s, vs]);

  const [scrutinId, setScrutinId] = useState<string | null>(scrutinFromQuery);

  // ✅ Toujours synchroniser si la query change
  useEffect(() => {
    setScrutinId(scrutinFromQuery);
  }, [scrutinFromQuery]);

  // ✅ POxxxx à envoyer à /deputes
  const [groupKeyFound, setGroupKeyFound] = useState<string | null>(null);

  const [loadingMeta, setLoadingMeta] = useState(false);
  const [loadingGroup, setLoadingGroup] = useState(false);
  const loading = loadingMeta || loadingGroup;

  const [err, setErr] = useState<string | null>(null);

  const [meta, setMeta] = useState<{
    date?: string | null;
    titre?: string | null;
    objet?: string | null;
    resultat?: string | null;
  } | null>(null);

  const [data, setData] = useState<GroupDetailModel>(() => ({
    groupLabel: groupLabelRaw,
    groupName: null,
    stance: "DIVISÉ",
    counts: { pour: 0, contre: 0, abstention: 0, nv: 0 },
    context: "Chargement…",
  }));

  const barAnim = React.useRef(new Animated.Value(0)).current;
  const stanceScale = React.useRef(new Animated.Value(0.92)).current;
  const stanceOpacity = React.useRef(new Animated.Value(0)).current;
  const haloAnim = React.useRef(new Animated.Value(0)).current;

  const goDeputes = React.useCallback(() => {
    if (!scrutinId) return;
    if (!groupKeyFound) return;

    const qs =
      `vs=${encodeURIComponent(String(scrutinId))}` +
      `&groupKey=${encodeURIComponent(groupKeyFound)}`;

    router.push(`/lois/${loiId}/group/${encodeURIComponent(groupLabelRaw)}/deputes?${qs}`);
  }, [router, loiId, groupLabelRaw, scrutinId, groupKeyFound]);

  // 1) Meta: si pas de scrutin dans la query -> prendre le dernier. Sinon: charger meta du scrutin demandé.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!loiId) {
        setErr("Aucun identifiant de loi fourni.");
        return;
      }

      try {
        setLoadingMeta(true);
        setErr(null);

        // On récupère un petit bout de timeline pour trouver le meta du scrutin ciblé
        const tl = (await fetchLoiTimeline(loiId, 12)) as unknown as TimelineRow[];
        const tlSafe = Array.isArray(tl) ? tl : [];

        // Si pas de scrutinId => on prend le dernier
        let target = scrutinFromQuery ? String(scrutinFromQuery) : (tlSafe?.[0]?.numero_scrutin ? String(tlSafe[0].numero_scrutin) : null);

        if (!target) {
          if (!cancelled) setMeta(null);
          return;
        }

        // Sync state scrutinId si on a dû le calculer
        if (!scrutinFromQuery && !cancelled) setScrutinId(target);

        // Trouver le meta correspondant
        const found = tlSafe.find((x) => String(x.numero_scrutin) === String(target)) ?? tlSafe?.[0] ?? null;

        if (!cancelled) {
          setMeta(
            found
              ? {
                  date: found.date_scrutin ?? null,
                  titre: found.titre ?? null,
                  objet: found.objet ?? null,
                  resultat: found.resultat ?? null,
                }
              : null
          );
        }
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? "Erreur inconnue");
      } finally {
        if (!cancelled) setLoadingMeta(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loiId, scrutinFromQuery]);

  // 2) votes groupe + capture POxxxx via row.groupe
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!scrutinId) return;

      try {
        setLoadingGroup(true);
        setErr(null);

        setGroupKeyFound(null);

        const rows = (await fetchVotesGroupesByScrutin(scrutinId)) as VoteGroupePositionRow[];
        const safe = Array.isArray(rows) ? rows : [];

        const wantN = norm(groupLabelRaw);

        let counts: GroupCounts = { pour: 0, contre: 0, abstention: 0, nv: 0 };
        let groupName: string | null = null;
        let localKey: string | null = null;

        // Match robuste: abrev OU nom contient
        for (const r of safe) {
          const abrevN = norm(r.groupe_abrev);
          const nomN = norm(r.groupe_nom);

          const match = abrevN === wantN || (wantN.length >= 3 && nomN.includes(wantN));
          if (!match) continue;

          const po = safeStr(r.groupe);
          if (!localKey && po.startsWith("PO")) localKey = po;

          groupName = groupName ?? (safeStr(r.groupe_nom) || null);

          const bucket = normalizePosition(r.position);
          const n = Number(r.nb_voix ?? 0) || 0;
          counts[bucket] += n;
        }

        if (!cancelled) {
          setGroupKeyFound(localKey);

          const stance = stanceFromCounts(counts);
          const context = contextFromCounts(groupLabelRaw, counts);

          setData({
            groupLabel: groupLabelRaw,
            groupName,
            stance,
            counts,
            context,
          });

          barAnim.setValue(0);
          Animated.timing(barAnim, {
            toValue: 1,
            duration: 420,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
          }).start();

          stanceScale.setValue(0.92);
          stanceOpacity.setValue(0);
          Animated.parallel([
            Animated.spring(stanceScale, {
              toValue: 1,
              damping: 14,
              stiffness: 180,
              mass: 0.8,
              useNativeDriver: true,
            }),
            Animated.timing(stanceOpacity, {
              toValue: 1,
              duration: 220,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
          ]).start();
        }
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? "Erreur inconnue");
      } finally {
        if (!cancelled) setLoadingGroup(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [scrutinId, groupLabelRaw, barAnim, stanceOpacity, stanceScale]);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(haloAnim, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(haloAnim, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [haloAnim]);

  const st = stanceStyle(data.stance);
  const t = totalVotes(data.counts);
  const pPour = pct(data.counts.pour, t);
  const pContre = pct(data.counts.contre, t);
  const pAbst = pct(data.counts.abstention, t);
  const pNv = pct(data.counts.nv, t);

  if (loading && !scrutinId) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.small}>Chargement du dernier scrutin…</Text>
      </View>
    );
  }

  if (err) {
    return (
      <View style={styles.center}>
        <Text style={{ color: colors.danger, textAlign: "center", paddingHorizontal: 16 }}>{err}</Text>
        <Text style={{ color: colors.subtext, marginTop: 10, fontSize: 12 }} onPress={() => router.back()}>
          ← Retour
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <FadeInUp delay={0}>
          <View style={styles.topRow}>
            <Pressable
              onPress={() => router.back()}
              hitSlop={10}
              style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.92 }]}
            >
              <Text style={styles.backText}>← Retour</Text>
            </Pressable>

            <View style={styles.topRight}>
              <Text style={styles.topHint}>Comprendre la position du groupe</Text>
            </View>
          </View>
        </FadeInUp>

        <FadeInUp delay={80}>
          <Card style={styles.hero}>
            <Animated.View
              style={[
                styles.heroHalo,
                {
                  transform: [
                    {
                      scale: haloAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 1.08],
                      }),
                    },
                  ],
                  opacity: haloAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.65, 0.95],
                  }),
                },
              ]}
            />

            <View style={styles.heroHeader}>
              <Animated.View
                style={[
                  styles.stancePill,
                  { backgroundColor: st.bg, borderColor: st.bd },
                  { opacity: stanceOpacity, transform: [{ scale: stanceScale }] },
                ]}
              >
                <Text style={[styles.stanceIcon, { color: st.tx }]}>{st.icon}</Text>
                <Text style={[styles.stanceText, { color: st.tx }]}>{data.stance}</Text>
              </Animated.View>

              <View style={styles.metaRight}>
                <Text style={styles.metaSmall}>Loi</Text>
                <Text style={styles.metaValue} numberOfLines={1}>
                  {loiId || "—"}
                </Text>
              </View>
            </View>

            <Text style={styles.heroTitle}>
              {data.groupLabel}
              {data.groupName ? ` · ${data.groupName}` : ""}
            </Text>

            <Text style={styles.heroSub}>{st.label}</Text>

            {!!scrutinId && (
              <Text style={styles.heroMeta}>
                Vote · scrutin {scrutinId}
                {meta?.date ? ` · ${fmtDateFR(meta.date)}` : ""}
              </Text>
            )}

            {!!meta?.objet && <Text style={styles.heroContext}>{meta.objet}</Text>}
            <Text style={styles.heroContext}>{data.context}</Text>

            <View style={styles.kpiRow}>
              <View style={styles.kpiItem}>
                <Text style={styles.kpiLabel}>Pour</Text>
                <Text style={styles.kpiValue}>
                  {data.counts.pour} <Text style={styles.kpiPct}>({pPour}%)</Text>
                </Text>
              </View>

              <View style={styles.kpiItem}>
                <Text style={styles.kpiLabel}>Contre</Text>
                <Text style={styles.kpiValue}>
                  {data.counts.contre} <Text style={styles.kpiPct}>({pContre}%)</Text>
                </Text>
              </View>

              <View style={styles.kpiItem}>
                <Text style={styles.kpiLabel}>Abst.</Text>
                <Text style={styles.kpiValue}>
                  {data.counts.abstention} <Text style={styles.kpiPct}>({pAbst}%)</Text>
                </Text>
              </View>

              <View style={styles.kpiItem}>
                <Text style={styles.kpiLabel}>N.V.</Text>
                <Text style={styles.kpiValue}>
                  {data.counts.nv} <Text style={styles.kpiPct}>({pNv}%)</Text>
                </Text>
              </View>
            </View>

            <View style={styles.heroDivider} />

            {!!scrutinId && (
              <>
                <Pressable
                  onPress={() => router.push(`/scrutins/${scrutinId}`)}
                  android_ripple={{ color: "rgba(255,255,255,0.06)" }}
                  style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.92 }]}
                >
                  <Text style={styles.primaryBtnText}>Ouvrir le scrutin</Text>
                </Pressable>

                <Pressable
                  disabled={t === 0 || !groupKeyFound}
                  onPress={goDeputes}
                  android_ripple={t === 0 || !groupKeyFound ? undefined : { color: "rgba(255,255,255,0.06)" }}
                  style={({ pressed }) => [
                    styles.secondaryBtn,
                    (t === 0 || !groupKeyFound) && styles.secondaryBtnDisabled,
                    pressed && t !== 0 && groupKeyFound && { opacity: 0.92 },
                  ]}
                >
                  <View style={styles.deputesBtnInner}>
                    <Text
                      style={[
                        styles.secondaryBtnText,
                        (t === 0 || !groupKeyFound) && styles.secondaryBtnTextDisabled,
                      ]}
                    >
                      👥 Voir les députés du groupe
                    </Text>
                    <Text
                      style={[
                        styles.deputesBtnHint,
                        (t === 0 || !groupKeyFound) && styles.secondaryBtnTextDisabled,
                      ]}
                    >
                      {!groupKeyFound
                        ? "Mapping groupe manquant (POxxxx)"
                        : t === 0
                        ? "Aucun vote exploitable"
                        : "Liste nominative du groupe"}
                    </Text>
                  </View>
                </Pressable>
              </>
            )}
          </Card>
        </FadeInUp>

        <FadeInUp delay={160}>
          <Card>
            <View style={styles.sectionHeaderRow}>
              <SectionTitle>Répartition des votes</SectionTitle>
              <Text style={styles.smallStrong}>
                <CountUp value={t} /> députés
              </Text>
            </View>

            <View style={styles.bar}>
              <Animated.View
                style={[
                  styles.barPour,
                  {
                    flex: barAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, Math.max(1, data.counts.pour)],
                    }),
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.barContre,
                  {
                    flex: barAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, Math.max(1, data.counts.contre)],
                    }),
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.barAbst,
                  {
                    flex: barAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, Math.max(1, data.counts.abstention)],
                    }),
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.barNv,
                  {
                    flex: barAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, Math.max(1, data.counts.nv)],
                    }),
                  },
                ]}
              />
            </View>

            <Text style={styles.small}>
              ✅ On utilise <Text style={{ fontWeight: "900", color: colors.text }}>votes_groupes_scrutin_full</Text> :
              abréviation (RN/EPR/…) + clé <Text style={{ fontWeight: "900", color: colors.text }}>POxxxx</Text>.
            </Text>
          </Card>
        </FadeInUp>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ---------------- Styles ---------------- */

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 12, paddingBottom: 24 },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  backBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  backText: { color: colors.text, fontWeight: "900" },
  topRight: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  topHint: { color: colors.subtext, fontSize: 12, fontWeight: "800" },

  hero: {
    overflow: "hidden",
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  heroHalo: {
    position: "absolute",
    top: -120,
    right: -120,
    width: 240,
    height: 240,
    borderRadius: 999,
    backgroundColor: "rgba(99,102,241,0.16)",
  },
  heroHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  stancePill: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  stanceIcon: { fontSize: 12, fontWeight: "900" },
  stanceText: { fontSize: 12, fontWeight: "900", letterSpacing: 0.3 },
  metaRight: { alignItems: "flex-end" },
  metaSmall: { color: colors.subtext, fontSize: 11, fontWeight: "900" },
  metaValue: { color: colors.text, fontSize: 12, fontWeight: "900" },

  heroTitle: { marginTop: 12, color: colors.text, fontSize: 20, fontWeight: "900" },
  heroSub: { marginTop: 6, color: colors.subtext, fontSize: 13, fontWeight: "800" },
  heroMeta: { marginTop: 8, color: colors.subtext, fontSize: 12, fontWeight: "800" },
  heroContext: { marginTop: 10, color: colors.text, fontSize: 14, lineHeight: 20, opacity: 0.95 },

  kpiRow: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  kpiItem: { flex: 1 },
  kpiLabel: { color: colors.subtext, fontSize: 11, fontWeight: "900" },
  kpiValue: { marginTop: 4, color: colors.text, fontSize: 14, fontWeight: "900" },
  kpiPct: { color: colors.subtext, fontSize: 12, fontWeight: "900" },

  heroDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.07)",
    marginTop: 12,
  },

  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  smallStrong: { color: colors.subtext, fontSize: 12, fontWeight: "900" },

  bar: {
    flexDirection: "row",
    height: 10,
    borderRadius: 999,
    overflow: "hidden",
    marginTop: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  barPour: { backgroundColor: "rgba(34,197,94,0.9)" },
  barContre: { backgroundColor: "rgba(239,68,68,0.9)" },
  barAbst: { backgroundColor: "rgba(250,204,21,0.9)" },
  barNv: { backgroundColor: "rgba(148,163,184,0.55)" },

  primaryBtn: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "rgba(99,102,241,0.16)",
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.28)",
    alignItems: "center",
  },
  primaryBtnText: { color: colors.text, fontSize: 13, fontWeight: "900" },

  secondaryBtn: {
    marginTop: 8,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
  },
  secondaryBtnText: { color: colors.text, fontSize: 13, fontWeight: "800" },

  secondaryBtnDisabled: { opacity: 0.45 },
  secondaryBtnTextDisabled: { color: colors.subtext },

  deputesBtnInner: { alignItems: "center" },
  deputesBtnHint: { marginTop: 4, color: colors.subtext, fontSize: 11, fontWeight: "800" },

  small: { marginTop: 10, color: colors.subtext, fontSize: 12, lineHeight: 16 },
});
