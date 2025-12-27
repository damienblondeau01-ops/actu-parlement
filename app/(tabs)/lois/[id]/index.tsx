// app/(tabs)/lois/[id]/v1.tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { theme } from "../../../../lib/theme";

import {
  LoiAIIntroBlock,
  LoiHero,
  LoiTLDR,
  LoiImpact,
  LoiVoteResult,
  LoiGroupVotes,
  LoiTimeline,
  type LoiScreenModel,
} from "../../../../components/loi/LoiBlocks";

import { routeFromItemId } from "@/lib/routes";
import { fetchLoiDetailV1 } from "@/lib/queries/loisDetailV1";

// âœ… FIX TS2307 : on importe le type depuis le mÃªme fichier V1 (plus de contracts fantÃ´me)
import type { LoiDetailDTO } from "@/lib/queries/loisDetailV1";

const colors = theme.colors;
const BORDER = (colors as any)?.border ?? "rgba(255,255,255,0.10)";

type RouteParams = {
  id?: string;
  fromKey?: string;
  fromLabel?: string;
  anchor?: "timeline" | "vote" | "groups";
};

// ----------------- UI helpers -----------------

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

function fmtDateFR(d?: string | null) {
  if (!d) return "â€”";
  try {
    return new Date(d).toLocaleDateString("fr-FR");
  } catch {
    return "â€”";
  }
}

function userMessageFromError(err: unknown) {
  const e = err as any;
  const msg = String(e?.message ?? e ?? "").toLowerCase();
  const code = String(e?.code ?? "");

  if (code === "57014" || msg.includes("statement timeout") || msg.includes("canceling statement")) {
    return "Le chargement prend trop de temps pour lâ€™instant. RÃ©essayez dans un moment.";
  }
  if (msg.includes("network") || msg.includes("failed to fetch") || msg.includes("fetch")) {
    return "Impossible de charger cette loi (problÃ¨me de connexion).";
  }
  return "Impossible de charger cette loi actuellement.";
}

function safeId(params: unknown): string {
  const p = params as any;
  const raw = p?.id;
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return String(raw[0] ?? "");
  return "";
}

// ----------------- DTO -> UI model mapping -----------------

function statusLabelFromDto(dto: LoiDetailDTO): string {
  const state = dto.hero?.etat;
  if (state === "PROMULGUEE") return "PromulguÃ©e";
  if (state === "ADOPTEE") return "AdoptÃ©e";
  if (state === "REJETEE") return "RejetÃ©e";
  if (state === "EN_COURS") return "En cours";
  return "Dossier";
}

function majorityStanceFromVotes(pour: number, contre: number, abst: number): "POUR" | "CONTRE" | "DIVISÃ‰" {
  const max = Math.max(pour ?? 0, contre ?? 0, abst ?? 0);
  if (max === 0) return "DIVISÃ‰";
  if ((pour ?? 0) === max) return "POUR";
  if ((contre ?? 0) === max) return "CONTRE";
  return "DIVISÃ‰";
}

function mapDtoToLoiScreenModel(dto: LoiDetailDTO): LoiScreenModel {
  const title = (dto.hero?.titre ?? "").trim() || "Loi";
  const subtitleParts: string[] = [];

  if (dto.hero?.legislature_context) subtitleParts.push(`L${dto.hero.legislature_context}`);
  if (dto.timeline?.key_scrutin?.numero) subtitleParts.push(`Scrutin clÃ© : ${dto.timeline.key_scrutin.numero}`);

  const subtitle = subtitleParts.length ? subtitleParts.join(" â€¢ ") : "Comprendre lâ€™essentiel en quelques secondes";
  const statusLabel = statusLabelFromDto(dto);

  const aiIntro =
    dto.tldr?.text && dto.tldr.text.trim()
      ? {
          title: "TL;DR",
          summary: dto.tldr.text.trim(),
        }
      : dto.why_it_matters?.bullets?.length
      ? {
          title: "Pourquoi Ã§a compte",
          summary: dto.why_it_matters.bullets.slice(0, 3).map((b: string) => `â€¢ ${b}`).join("\n"),
        }
      : undefined;

  const tldr: string[] = [];
  if (dto.timeline?.key_scrutin?.numero) tldr.push(`Scrutin de rÃ©fÃ©rence : ${dto.timeline.key_scrutin.numero}`);

  const events = dto.timeline?.events ?? [];
  const firstEvent = events[events.length - 1];
  const lastEvent = events[0];

  if (lastEvent?.date) tldr.push(`DerniÃ¨re Ã©tape : ${fmtDateFR(lastEvent.date)}`);
  if (firstEvent?.date) tldr.push(`DÃ©but de lâ€™aperÃ§u : ${fmtDateFR(firstEvent.date)}`);
  if (dto.sources?.dossier_an_url) tldr.push("Source : dossier AssemblÃ©e nationale");

  const impact: { label: string; value: string }[] = [];
  if (events.length) impact.push({ label: "Ã‰tapes visibles", value: String(events.length) });
  if (dto.scrutins?.items?.length) impact.push({ label: "Scrutins listÃ©s", value: String(dto.scrutins.items.length) });

  const totals = dto.votes_by_group?.totals;
  const vote = {
    pour: totals?.pour ?? 0,
    contre: totals?.contre ?? 0,
    abstention: totals?.abstention ?? 0,
  };

  const groups =
    (dto.votes_by_group?.top_groups ?? []).map((g) => ({
      label: String(g.groupe_abrev ?? g.groupe_label ?? g.groupe_id).trim(),
      stance: majorityStanceFromVotes(g.pour ?? 0, g.contre ?? 0, g.abstention ?? 0),
    })) ?? [];

  const timeline =
    events.slice(0, 9).map((e, idx: number) => ({
      date: fmtDateFR(e.date),
      title:
        idx === 0
          ? "Ã‰tape la plus rÃ©cente"
          : e.title?.trim()
          ? e.title.trim()
          : e.type === "VOTE_AN"
          ? "Vote Ã  lâ€™AssemblÃ©e nationale"
          : "Ã‰tape",
      description: (e.description ?? "").trim() || "DÃ©tail indisponible",
      scrutinId: e.proof?.kind === "scrutin" ? String(e.proof.scrutin_numero ?? "") : null,
      kind: e.type ?? null,
    }));

  return {
    title,
    subtitle,
    statusLabel,
    aiIntro,
    tldr: tldr.length ? tldr : ["Aucun rÃ©sumÃ© disponible pour lâ€™instant."],
    impact: impact.length ? impact : [{ label: "Ã‰tapes visibles", value: "â€”" }],
    vote,
    groups,
    timeline,
  };
}

// ----------------- Screen -----------------

export default function LoiDetailV1Screen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  console.log("[LOI ROUTE PARAMS]", JSON.stringify(params));

  const id = useMemo(() => safeId(params), [params]);
  const fromKey = useMemo(() => String((params as any)?.fromKey ?? "").trim() || null, [params]);
  const fromLabel = useMemo(() => String((params as any)?.fromLabel ?? "").trim() || null, [params]);
  const anchor = useMemo(() => String((params as any)?.anchor ?? "").trim() || null, [params]);

  const isScrutinId = useMemo(() => id.startsWith("scrutin-"), [id]);

  const [dto, setDto] = useState<LoiDetailDTO | null>(null);
  const [model, setModel] = useState<LoiScreenModel | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const runLoad = useCallback(async () => {
    if (!id) {
      setError("Identifiant de loi invalide.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const d = await fetchLoiDetailV1(id);
      if (!d) {
        setDto(null);
        setModel(null);
        setError("Cette loi nâ€™est pas disponible.");
        return;
      }
      setDto(d);
      setModel(mapDtoToLoiScreenModel(d));
    } catch (e: unknown) {
      setDto(null);
      setModel(null);
      setError(userMessageFromError(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    if (isScrutinId) return;
    runLoad();
  }, [id, isScrutinId, runLoad]);

  <View style={{ padding: 10, borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,0,0,0.6)", backgroundColor: "rgba(255,0,0,0.12)", marginBottom: 10 }}>
  <Text style={{ color: "#fff", fontWeight: "900" }}>âœ… Ã‰CRAN V1 (v1.tsx)</Text>
  <Text style={{ color: "rgba(255,255,255,0.8)", marginTop: 4 }}>id = {id}</Text>
</View>

  const scrollRef = React.useRef<ScrollView>(null);
  useEffect(() => {
    if (!anchor) return;
    if (anchor === "timeline") scrollRef.current?.scrollTo({ y: 520, animated: true });
    if (anchor === "vote") scrollRef.current?.scrollTo({ y: 980, animated: true });
    if (anchor === "groups") scrollRef.current?.scrollTo({ y: 1320, animated: true });
  }, [anchor]);

  if (isScrutinId) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
<View style={{ backgroundColor: "red", padding: 10, borderRadius: 12, marginBottom: 12 }}>
  <Text style={{ color: "white", fontWeight: "900" }}>DEBUG — LOI [id]/index.tsx (LOADING)</Text>
</View>
          <Text style={styles.errorText}>Cet identifiant correspond Ã  un scrutin, pas Ã  une loi.</Text>

          <View style={{ height: 12 }} />

          <Pressable style={styles.actionBtn} onPress={() => router.replace(routeFromItemId(id) as any)}>
            <Text style={styles.actionBtnText}>Ouvrir le scrutin â†’</Text>
          </Pressable>

          <Pressable style={styles.linkBtn} onPress={() => router.back()}>
            <Text style={styles.linkText}>â† Retour</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
<View style={{ backgroundColor: "red", padding: 10, borderRadius: 12, marginBottom: 12 }}>
  <Text style={{ color: "white", fontWeight: "900" }}>DEBUG — LOI [id]/index.tsx (LOADING)</Text>
</View>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.centerHint}>Chargement de la fiche loiâ€¦</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !model) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
<View style={{ backgroundColor: "red", padding: 10, borderRadius: 12, marginBottom: 12 }}>
  <Text style={{ color: "white", fontWeight: "900" }}>DEBUG — LOI [id]/index.tsx (LOADING)</Text>
</View>
          <Text style={styles.errorText}>{error ?? "Aucune donnÃ©e disponible."}</Text>

          <View style={{ height: 12 }} />

          <Pressable style={styles.actionBtn} onPress={runLoad}>
            <Text style={styles.actionBtnText}>RÃ©essayer</Text>
          </Pressable>

          <Pressable style={styles.linkBtn} onPress={() => router.back()}>
            <Text style={styles.linkText}>â† Retour</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const hasScrutinKey = !!dto?.timeline?.key_scrutin?.numero;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
        
        {/* 🔴 DEBUG BANNER (temp) */}
        <View style={{ backgroundColor: "red", padding: 10, borderRadius: 12, marginBottom: 12 }}>
          <Text style={{ color: "white", fontWeight: "900" }}>DEBUG — index.tsx chargé</Text>
        </View>
{fromKey ? (
          <View style={styles.contextBar}>
            <View style={{ flex: 1 }}>
              <Text style={styles.contextKicker}>Tu viens de</Text>
              <Text style={styles.contextTitle} numberOfLines={1}>
                {fromLabel ?? "un rÃ©cit"}
              </Text>
            </View>

            <Pressable onPress={() => router.back()} style={styles.contextBtn}>
              <Text style={styles.contextBtnText}>â† Retour</Text>
            </Pressable>
          </View>
        ) : null}

        <FadeInUp delay={0}>
          <LoiHero m={model} />
        </FadeInUp>

        <FadeInUp delay={60}>
          <LoiAIIntroBlock m={model} />
        </FadeInUp>

        <FadeInUp delay={120}>
          <LoiTLDR m={model} />
        </FadeInUp>

        <FadeInUp delay={180}>
          <LoiTimeline
            m={model}
            onStepPress={(scrutinId: string) => {
              const sid = String(scrutinId ?? "").trim();
              if (!sid) return;
              router.push(routeFromItemId(sid) as any);
            }}
          />
        </FadeInUp>

        <FadeInUp delay={240}>
          <LoiVoteResult m={model} />
        </FadeInUp>

        <FadeInUp delay={300}>
          <LoiGroupVotes m={model} />
        </FadeInUp>

        <FadeInUp delay={360}>
          <LoiImpact m={model} />
        </FadeInUp>

        {hasScrutinKey ? (
          <FadeInUp delay={420}>
            <Pressable
              style={styles.proofCta}
              onPress={() => router.push(routeFromItemId(String(dto!.timeline!.key_scrutin!.numero)) as any)}
            >
              <Text style={styles.proofCtaTitle}>Voir la preuve (scrutin clÃ©)</Text>
              <Text style={styles.proofCtaSub}>Ouvre le dÃ©tail du vote {String(dto!.timeline!.key_scrutin!.numero)}</Text>
            </Pressable>
          </FadeInUp>
        ) : null}

        <FadeInUp delay={480}>
          <Text style={styles.disclaimer}>
            Cette fiche est une lecture citoyenne. Les scrutins servent de preuves consultables.
          </Text>
        </FadeInUp>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 12, paddingBottom: 24 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 16 },

  centerHint: { color: colors.subtext, marginTop: 10, fontSize: 12 },

  errorText: {
    color: colors.danger,
    textAlign: "center",
    paddingHorizontal: 16,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
  },

  actionBtn: {
    marginTop: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: BORDER,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  actionBtnText: { color: colors.text, fontWeight: "900", fontSize: 12 },

  linkBtn: { marginTop: 10, paddingHorizontal: 10, paddingVertical: 8 },
  linkText: { color: colors.subtext, fontSize: 12, fontWeight: "800" },

  contextBar: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  contextKicker: { color: colors.subtext, fontSize: 11, fontWeight: "900" },
  contextTitle: { color: colors.text, fontSize: 13, fontWeight: "900", marginTop: 2 },
  contextBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: BORDER,
  },
  contextBtnText: { color: colors.text, fontSize: 12, fontWeight: "900" },

  proofCta: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 16,
    padding: 14,
  },
  proofCtaTitle: { color: colors.text, fontSize: 14, fontWeight: "900" },
  proofCtaSub: { marginTop: 6, color: colors.subtext, fontSize: 12, lineHeight: 16 },

  disclaimer: {
    marginTop: 8,
    color: colors.subtext,
    fontSize: 12,
    lineHeight: 16,
    opacity: 0.85,
  },
});


