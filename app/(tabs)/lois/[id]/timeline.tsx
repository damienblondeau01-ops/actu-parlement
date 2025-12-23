import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../../../lib/supabaseClient";
import { theme } from "../../../../lib/theme";
import { Card } from "../../../../components/ui/Card";
import { parseScrutinOutcome, outcomeToLabel } from "@/lib/parliament/scrutinResult";

function toneFromOutcome(outcome: string | null | undefined): "success" | "danger" | "warn" | "soft" {
  const o = (outcome ?? "").toLowerCase();

  if (o === "adopte" || o === "adopté") return "success";
  if (o === "rejete" || o === "rejeté") return "danger";

  return "soft";
}


const colors = theme.colors;

type RouteParams = { id?: string };

type ScrutinRow = {
  numero_scrutin: string;
  numero?: string;
  date_scrutin: string | null;
  titre: string | null;
  objet: string | null;
  resultat: string | null;
  kind: string | null;
  article_ref: string | null;
  legislature?: number | null;
};

type VoteSynthRow = {
  numero_scrutin: string;
  nb_pour?: number | null;
  nb_contre?: number | null;
  nb_abstention?: number | null;
  nb_non_votant?: number | null;
  nb_exprimes?: number | null;
  nb_total_votes?: number | null;
};

function fmtDateFR(d?: string | null) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("fr-FR");
  } catch {
    return "—";
  }
}

function normalizeResult(resultat?: string | null) {
  const outcome = parseScrutinOutcome(resultat);
const label = outcomeToLabel(outcome); // "Adoptée" | "Rejetée" | null
  if (!label) return null;
  return { label, outcome };
}

function toneStyles(tone: "success" | "danger" | "warn" | "soft") {
  switch (tone) {
    case "success":
      return {
        bg: "rgba(34,197,94,0.14)",
        bd: "rgba(34,197,94,0.35)",
        tx: "#86efac",
      };
    case "danger":
      return {
        bg: "rgba(239,68,68,0.14)",
        bd: "rgba(239,68,68,0.35)",
        tx: "#fca5a5",
      };
    case "warn":
      return {
        bg: "rgba(250,204,21,0.12)",
        bd: "rgba(250,204,21,0.35)",
        tx: "#fde68a",
      };
    default:
      return {
        bg: "rgba(255,255,255,0.06)",
        bd: "rgba(255,255,255,0.10)",
        tx: theme.colors.subtext,
      };
  }
}

function normalizeTxt(v?: string | null) {
  return (v ?? "").toLowerCase();
}

// ✅ Amendement-like: kind quand fiable + fallback texte (titre/objet/article_ref)
// But: capter les cas "autre" qui décrivent des amendements
function isAmendementLike(s: ScrutinRow) {
  const k = normalizeTxt(s.kind);
  if (k.includes("amend")) return true; // amendement / sous-amendement

  const t = normalizeTxt(s.titre);
  const o = normalizeTxt(s.objet);
  const a = normalizeTxt(s.article_ref);

  const hay = `${t} ${o} ${a}`;

  // ✅ mots-clés tolérants
  if (hay.includes("sous-amend")) return true;
  if (hay.includes("amend")) return true;

  return false;
}

function pickHumanTitle(s: ScrutinRow) {
  const ref = s.article_ref ? ` ${s.article_ref}` : "";
  if (s.kind === "article") return `Vote sur un article${ref}`;
  if (isAmendementLike(s)) return `Vote sur un amendement${ref}`;
  return (s.objet || s.titre || "Scrutin") as string;
}

function makeNarrativeLine(index: number, total: number, s: ScrutinRow) {
  const isFirst = index === 0;
  const isLast = index === total - 1;

  const res = s.resultat ? `Résultat : ${s.resultat}. ` : "";
  const nature =
    s.kind === "article"
      ? "Le Parlement se prononce sur un point précis du texte."
      : isAmendementLike(s)
      ? "Modification proposée : acceptée ou rejetée."
      : "Vote important dans la progression de la loi.";

  if (isFirst) return `Début de l’examen. ${res}${nature}`;
  if (isLast) return `Dernier vote connu. ${res}${nature}`;
  return `Étape intermédiaire. ${res}${nature}`;
}

// ✅ Robustesse: erreurs → message citoyen
function userMessageFromError(err: any) {
  const msg = String(err?.message ?? err ?? "").toLowerCase();
  const code = String(err?.code ?? "");

  if (
    code === "57014" ||
    msg.includes("statement timeout") ||
    msg.includes("canceling statement")
  ) {
    return "Le chargement prend trop de temps pour l’instant. Réessayez dans un moment.";
  }
  if (
    msg.includes("network") ||
    msg.includes("failed to fetch") ||
    msg.includes("fetch")
  ) {
    return "Impossible de charger le parcours (problème de connexion).";
  }
  return "Impossible de charger le parcours actuellement.";
}

export default function LoiTimelineScreen() {
  const { id } = useLocalSearchParams<RouteParams>();
  const router = useRouter();

  const [title, setTitle] = useState<string>("Parcours complet");
  const [scrutins, setScrutins] = useState<ScrutinRow[]>([]);
  const [voteSynth, setVoteSynth] = useState<Record<string, VoteSynthRow>>({});
  const [loading, setLoading] = useState(true);

  // ✅ UI: erreur neutre + notFound
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  // ✅ Toggle : afficher 30 ou tout
  const [showAll, setShowAll] = useState(false);

  // ✅ Filtre: tout le parcours vs uniquement amendements
  type FilterKey = "all" | "amend";
  const [filterKey, setFilterKey] = useState<FilterKey>("all");

  const loiId = useMemo(() => (id ? String(id) : null), [id]);

  const runLoad = React.useCallback(async () => {
    if (!loiId) {
      setNotFound(true);
      setError("Cette loi n’est pas disponible.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setNotFound(false);

    try {
      // 1) Titre de la loi (best-effort)
      const { data: loiRow, error: loiErr } = await supabase
        .from("lois_app")
        .select("titre_loi")
        .eq("loi_id", loiId)
        .maybeSingle();

      if (loiErr) {
        console.warn("[TIMELINE] lois_app titre_loi error", loiErr);
      } else if ((loiRow as any)?.titre_loi) {
        setTitle((loiRow as any).titre_loi);
      } else {
        // keep default title
        setTitle("Parcours complet");
      }

      // 2) Tous les scrutins liés à la loi (vue app)
      const { data: scrRows, error: scrErr } = await supabase
        .from("scrutins_par_loi_app")
        .select(
          `
            numero_scrutin,
            date_scrutin,
            titre,
            objet,
            resultat,
            kind,
            article_ref,
            legislature
          `
        )
        .eq("loi_id", loiId)
        .order("date_scrutin", { ascending: true });

      if (scrErr) throw scrErr;

      const clean = (scrRows ?? []).map((s: any) => ({
        numero_scrutin: String(s.numero_scrutin ?? ""),
        date_scrutin: s.date_scrutin ?? null,
        titre: s.titre ?? null,
        objet: s.objet ?? null,
        resultat: s.resultat ?? null,
        kind: s.kind ?? null,
        article_ref: s.article_ref ?? null,
        legislature: s.legislature ?? null,
      })) as ScrutinRow[];

      setScrutins(clean);

      // reset synth to avoid stale values when switching loi
      setVoteSynth({});

      // 3) Chiffres par scrutin (optionnel)
      const ids = clean.map((x) => x.numero_scrutin).filter(Boolean);

      if (ids.length) {
        const { data: vsRows, error: vsErr } = await supabase
          .from("votes_par_scrutin_synthese")
          .select(
            "numero_scrutin, nb_pour, nb_contre, nb_abstention, nb_non_votant, nb_exprimes, nb_total_votes"
          )
          .in("numero_scrutin", ids);

        if (vsErr) {
          console.warn(
            "[TIMELINE] votes_par_scrutin_synthese not available (ok)",
            vsErr
          );
        } else {
          const map: Record<string, VoteSynthRow> = {};
          (vsRows ?? []).forEach((r: any) => {
            if (!r?.numero_scrutin) return;
            map[String(r.numero_scrutin)] = {
              numero_scrutin: String(r.numero_scrutin),
              nb_pour: r.nb_pour ?? null,
              nb_contre: r.nb_contre ?? null,
              nb_abstention: r.nb_abstention ?? null,
              nb_non_votant: r.nb_non_votant ?? null,
              nb_exprimes: r.nb_exprimes ?? null,
              nb_total_votes: r.nb_total_votes ?? null,
            };
          });
          setVoteSynth(map);
        }
      }
    } catch (e: any) {
      console.warn("[TIMELINE] load error:", e);
      setScrutins([]);
      setVoteSynth({});
      setError(userMessageFromError(e));
    } finally {
      setLoading(false);
    }
  }, [loiId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await runLoad();
    })();
    return () => {
      cancelled = true;
    };
  }, [runLoad]);

  const steps = useMemo(() => {
    const total = scrutins.length;

    return scrutins.map((s, idx) => {
      const badge = normalizeResult(s.resultat);
      const isLast = idx === total - 1;

      const scrutinId = s.numero_scrutin;
      const vs = scrutinId ? voteSynth[scrutinId] : undefined;

      const voteLine =
        vs && (vs.nb_pour ?? null) !== null
          ? `Pour ${vs.nb_pour ?? 0} · Contre ${vs.nb_contre ?? 0} · Abst. ${
              vs.nb_abstention ?? 0
            }`
          : null;

      return {
        idx,
        total,
        isLast,
        scrutinId,
        date: fmtDateFR(s.date_scrutin),
        title: pickHumanTitle(s),
        narrative: makeNarrativeLine(idx, total, s),
        badge,
        voteLine,
        legislature: s.legislature ?? null,
      };
    });
  }, [scrutins, voteSynth]);

  // ✅ Steps amendement-like (via scrutins + heuristique robuste)
  const amendSteps = useMemo(() => {
    return steps.filter((st) => {
      const raw = scrutins[st.idx];
      return raw ? isAmendementLike(raw) : false;
    });
  }, [steps, scrutins]);

  const stepsByFilter = useMemo(() => {
    return filterKey === "amend" ? amendSteps : steps;
  }, [filterKey, amendSteps, steps]);

  // ⭐ Scrutin décisif = dernier avec un badge; sinon dernier
  // (on le calcule sur "steps" (tout), pour éviter que le filtre amendement cache l'issue du texte)
  const decisiveStep = useMemo(() => {
    if (!steps.length) return null;

    for (let i = steps.length - 1; i >= 0; i--) {
      const s = steps[i];
      if (s.badge?.label) return s;
    }
    return steps[steps.length - 1];
  }, [steps]);

  // ✅ 30 étapes max par défaut (appliqué au filtre)
  const visibleSteps = useMemo(() => {
    const base = stepsByFilter;
    if (showAll) return base;
    return base.slice(0, 30);
  }, [stepsByFilter, showAll]);

  const totalSteps = stepsByFilter.length;
  const hiddenCount = Math.max(0, totalSteps - visibleSteps.length);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Retour</Text>
        </Pressable>

        <Text style={styles.headerTitle} numberOfLines={2}>
          Parcours complet
        </Text>
        <Text style={styles.headerSub} numberOfLines={2}>
          {title}
        </Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Chargement du parcours…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>
            {error ??
              (notFound
                ? "Cette loi n’est pas disponible."
                : "Impossible de charger le parcours.")}
          </Text>

          <Pressable style={styles.retryBtn} onPress={runLoad}>
            <Text style={styles.retryText}>Réessayer</Text>
          </Pressable>

          <Pressable style={styles.linkBtn} onPress={() => router.back()}>
            <Text style={styles.linkText}>← Retour</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {steps.length === 0 ? (
            <Card>
              <Text style={styles.emptyTitle}>Aucune étape</Text>
              <Text style={styles.emptyText}>
                Cette loi n’a pas encore de scrutins liés.
              </Text>
              <Pressable
                style={[styles.retryBtn, { alignSelf: "flex-start" }]}
                onPress={runLoad}
              >
                <Text style={styles.retryText}>Rafraîchir</Text>
              </Pressable>
            </Card>
          ) : (
            <>
              {/* Résumé rapide haut */}
              <Card style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>En bref</Text>
                <Text style={styles.summaryText}>
                  {steps.length} votes ont marqué l’examen de ce texte. Le plus
                  récent reflète la situation actuelle.
                </Text>
              </Card>

              {/* Filtre Tout / Amendements */}
              <View style={styles.filterRow}>
                <Pressable
                  onPress={() => {
                    setFilterKey("all");
                    setShowAll(false);
                  }}
                  style={[
                    styles.filterPill,
                    filterKey === "all" ? styles.filterPillActive : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterText,
                      filterKey === "all" ? styles.filterTextActive : null,
                    ]}
                  >
                    Tout ({steps.length})
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    setFilterKey("amend");
                    setShowAll(false);
                  }}
                  style={[
                    styles.filterPill,
                    filterKey === "amend" ? styles.filterPillActive : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.filterText,
                      filterKey === "amend" ? styles.filterTextActive : null,
                    ]}
                  >
                    Amendements ({amendSteps.length})
                  </Text>
                </Pressable>
              </View>

              {/* ✅ MODIF : suppression du DOUBLON */}
{filterKey === "amend" && (
  <>
    <Text style={styles.filterHint}>
      Étapes repérées comme liées à des amendements (heuristique titre/objet, car “kind” peut être “autre”).
    </Text>

    {amendSteps.length === 0 ? (
      <Card>
        <Text style={styles.emptyTitle}>Aucun amendement repéré</Text>
        <Text style={styles.emptyText}>
          Les scrutins de cette loi ne sont pas toujours étiquetés de façon fiable
          (par exemple “kind = autre”). Nous analysons aussi les libellés, mais
          aucun vote amendement ne ressort ici.
        </Text>
      </Card>
    ) : null}
  </>
)}

              {/* ⭐ Scrutin décisif */}
              {decisiveStep ? (
                (() => {
                  const canPress = !!decisiveStep.scrutinId;
                  const badgeTone =
                  decisiveStep.badge ? toneFromOutcome(decisiveStep.badge.outcome) : "soft";
                  const badgeLabel = decisiveStep.badge?.label ?? null;
                  const st = toneStyles(badgeTone);

                  return (
                    <Pressable
                      disabled={!canPress}
                      onPress={() =>
                        canPress &&
                        router.push(
                          `/scrutins/${encodeURIComponent(
                            decisiveStep.scrutinId
                          )}`
                        )
                      }
                      android_ripple={
                        canPress ? { color: "rgba(255,255,255,0.06)" } : undefined
                      }
                      style={({ pressed }) => [
                        pressed && canPress ? { opacity: 0.95 } : null,
                      ]}
                    >
                      <Card style={styles.decisiveCard}>
                        <View style={styles.decisiveTopRow}>
                          <Text style={styles.decisiveKicker}>
                            Scrutin décisif
                          </Text>

                          {!!badgeLabel && (
                            <View
                              style={[
                                styles.decisiveBadge,
                                { backgroundColor: st.bg, borderColor: st.bd },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.decisiveBadgeText,
                                  { color: st.tx },
                                ]}
                              >
                                {badgeLabel}
                              </Text>
                            </View>
                          )}
                        </View>

                        <Text style={styles.decisiveTitle} numberOfLines={2}>
                          {decisiveStep.title}
                        </Text>

                        <Text style={styles.decisiveMeta}>
                          {decisiveStep.date}
                          {decisiveStep.legislature
                            ? ` · L${decisiveStep.legislature}`
                            : ""}
                        </Text>

                        {!!decisiveStep.voteLine && (
                          <Text style={styles.decisiveVoteLine}>
                            {decisiveStep.voteLine}
                          </Text>
                        )}

                        <Text style={styles.decisiveCta}>
                          {canPress
                            ? "Ouvrir le scrutin décisif →"
                            : "Scrutin indisponible"}
                        </Text>
                      </Card>
                    </Pressable>
                  );
                })()
              ) : null}

              {/* Toggle 30 / tout */}
              {totalSteps > 30 && (
                <Pressable
                  onPress={() => setShowAll((v) => !v)}
                  android_ripple={{ color: "rgba(255,255,255,0.06)" }}
                  style={({ pressed }) => [
                    styles.toggleBtn,
                    pressed ? { opacity: 0.95 } : null,
                  ]}
                >
                  <Text style={styles.toggleBtnText}>
                    {showAll
                      ? "Afficher moins (30)"
                      : `Afficher tout (${totalSteps})`}
                  </Text>
                  {!showAll && hiddenCount > 0 ? (
                    <Text style={styles.toggleHint}>+{hiddenCount} étapes</Text>
                  ) : null}
                </Pressable>
              )}

              {/* Liste des étapes */}
              {visibleSteps.map((t) => {
                const canPress = !!t.scrutinId;
                const badgeTone = t.badge ? toneFromOutcome(t.badge.outcome) : "soft";
                const badgeLabel = t.badge?.label ?? null;
                const st = toneStyles(badgeTone);

                const raw = scrutins[t.idx];
                const isAmend = raw ? isAmendementLike(raw) : false;

                return (
                  <Pressable
                    key={`${t.scrutinId}-${t.idx}`}
                    disabled={!canPress}
                    onPress={() =>
                      canPress &&
                      router.push(`/scrutins/${encodeURIComponent(t.scrutinId)}`)
                    }
                    android_ripple={
                      canPress ? { color: "rgba(255,255,255,0.06)" } : undefined
                    }
                    style={({ pressed }) => [
                      pressed && canPress ? { opacity: 0.95 } : null,
                    ]}
                  >
                    <Card style={[styles.stepCard, t.isLast && styles.stepCardLast]}>
                      <View style={styles.stepTopRow}>
                        <Text style={styles.stepDate}>
                          {t.date}{" "}
                          {t.legislature ? `· L${t.legislature}` : ""}
                        </Text>

                        <View style={styles.badgesRow}>
                          <View style={styles.stepIndexBadge}>
                            <Text style={styles.stepIndexText}>
                              Vote {t.idx + 1}/{t.total}
                            </Text>
                          </View>

                          {isAmend && (
                            <View style={styles.amendBadge}>
                              <Text style={styles.amendBadgeText}>
                                Amendement
                              </Text>
                            </View>
                          )}

                          {!!badgeLabel && (
                            <View
                              style={[
                                styles.resultBadge,
                                { backgroundColor: st.bg, borderColor: st.bd },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.resultBadgeText,
                                  { color: st.tx },
                                ]}
                              >
                                {badgeLabel}
                              </Text>
                            </View>
                          )}

                          {canPress ? <Text style={styles.chev}>›</Text> : null}
                        </View>
                      </View>

                      <Text style={styles.stepTitle}>{t.title}</Text>
                      <Text style={styles.stepNarrative}>{t.narrative}</Text>

                      {t.voteLine ? (
                        <Text style={styles.voteMini}>{t.voteLine}</Text>
                      ) : null}

                      <Text
                        style={[
                          styles.cta,
                          canPress ? styles.ctaActive : styles.ctaMuted,
                        ]}
                      >
                        {canPress ? "Ouvrir le scrutin →" : "Scrutin indisponible"}
                      </Text>
                    </Card>
                  </Pressable>
                );
              })}
            </>
          )}

          <View style={{ height: 18 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },

  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: colors.background,
  },
  backBtn: { paddingVertical: 6, alignSelf: "flex-start" },
  backText: { color: colors.subtext, fontSize: 14, fontWeight: "700" },
  headerTitle: {
    marginTop: 4,
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
  },
  headerSub: {
    marginTop: 6,
    color: colors.subtext,
    fontSize: 13,
    lineHeight: 18,
  },

  content: { padding: 16, gap: 12, paddingBottom: 28 },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  loadingText: { marginTop: 10, color: colors.subtext, fontSize: 12 },

  errorText: {
    color: colors.danger,
    textAlign: "center",
    fontWeight: "800",
    lineHeight: 18,
  },
  retryBtn: {
    marginTop: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: colors.border,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  retryText: { color: colors.text, fontWeight: "900", fontSize: 12 },

  linkBtn: { marginTop: 10, paddingHorizontal: 10, paddingVertical: 8 },
  linkText: { color: colors.subtext, fontSize: 12, fontWeight: "800" },

  summaryCard: { borderRadius: 18 },
  summaryTitle: { color: colors.text, fontSize: 14, fontWeight: "900" },
  summaryText: { marginTop: 6, color: colors.subtext, fontSize: 13, lineHeight: 18 },

  // ✅ Filtre Tout / Amendements
  filterRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
    marginBottom: 8,
  },
  filterPill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  filterPillActive: {
    borderColor: "rgba(99,102,241,0.40)",
    backgroundColor: "rgba(99,102,241,0.14)",
  },
  filterText: {
    color: colors.subtext,
    fontSize: 12,
    fontWeight: "900",
  },
  filterTextActive: {
    color: colors.text,
  },
  filterHint: {
    marginTop: 2,
    marginBottom: 10,
    color: colors.subtext,
    fontSize: 12,
    lineHeight: 16,
  },

  // ✅ Badge Amendement
  amendBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.35)",
    backgroundColor: "rgba(245,158,11,0.14)",
  },
  amendBadgeText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: "900",
  },

  // ✅ Toggle 30 / tout
  toggleBtn: {
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  toggleBtnText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "900",
  },
  toggleHint: {
    marginTop: 4,
    color: colors.subtext,
    fontSize: 12,
    fontWeight: "800",
  },

  // ⭐ Scrutin décisif
  decisiveCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.28)",
    backgroundColor: "rgba(99,102,241,0.10)",
  },
  decisiveTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  decisiveKicker: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.2,
    opacity: 0.95,
  },
  decisiveBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  decisiveBadgeText: { fontSize: 11, fontWeight: "900" },
  decisiveTitle: {
    marginTop: 10,
    color: colors.text,
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 20,
  },
  decisiveMeta: {
    marginTop: 6,
    color: colors.subtext,
    fontSize: 12,
    fontWeight: "800",
  },
  decisiveVoteLine: {
    marginTop: 10,
    color: colors.text,
    fontSize: 12,
    fontWeight: "900",
    opacity: 0.95,
  },
  decisiveCta: {
    marginTop: 12,
    color: colors.primary,
    fontSize: 12,
    fontWeight: "900",
  },

  stepCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  stepCardLast: {
    borderColor: "rgba(79,70,229,0.20)",
    backgroundColor: "rgba(79,70,229,0.06)",
  },

  stepTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  stepDate: { color: colors.subtext, fontSize: 12, fontWeight: "800" },

  badgesRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  stepIndexBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  stepIndexText: { color: colors.subtext, fontSize: 11, fontWeight: "900" },

  resultBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  resultBadgeText: { fontSize: 11, fontWeight: "900" },

  chev: {
    color: colors.subtext,
    fontSize: 18,
    fontWeight: "900",
    marginLeft: 2,
    marginTop: -1,
  },

  stepTitle: {
    marginTop: 10,
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 20,
  },
  stepNarrative: {
    marginTop: 6,
    color: colors.subtext,
    fontSize: 13,
    lineHeight: 18,
  },

  voteMini: {
    marginTop: 8,
    color: colors.text,
    fontSize: 12,
    fontWeight: "800",
    opacity: 0.95,
  },

  cta: { marginTop: 10, fontSize: 12, fontWeight: "900" },
  ctaActive: { color: colors.primary },
  ctaMuted: { color: colors.subtext },

  emptyTitle: { color: colors.text, fontSize: 14, fontWeight: "900" },
  emptyText: {
    marginTop: 6,
    color: colors.subtext,
    fontSize: 13,
    lineHeight: 18,
  },
});
