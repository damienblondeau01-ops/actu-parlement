// components/actu/ActuBulletinRow.tsx
import React, { useMemo, useState, useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import type { ActuItemUI } from "./types";
import { routeFromItemId } from "@/lib/routes";

const PAPER = "#F6F1E8";
const PAPER_CARD = "#FBF7F0";
const INK = "#121417";
const INK_SOFT = "rgba(18,20,23,0.62)";
const LINE = "rgba(18,20,23,0.14)";

type StatusKey = "adopted" | "rejected" | "pending";

type BulletinItem = ActuItemUI & {
  why?: string;
  dateISO?: string;
  statusKey?: StatusKey;

  // (optionnel) champs utiles au routing / debug
  loi_id_canon?: string | null;
  loi_id?: string | null;
  loi_id_scrutin?: string | null;
  dossier_id?: string | null;
  numero_scrutin?: string | null;

  // ✅ optionnel (peut être défini depuis index.tsx)
  statusScope?: "Texte" | "Scrutin" | "Amendement" | "Vote" | "Événement";
};

/* ─────────────────────────────
   Helpers string (prod)
   ───────────────────────────── */
function norm(s?: string | null) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function pad2(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}
function safeDate(dateISO?: string) {
  if (!dateISO) return null;
  const d = new Date(dateISO);
  return Number.isFinite(d.getTime()) ? d : null;
}
function formatHour(dateISO?: string) {
  const d = safeDate(dateISO);
  if (!d) return "";
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function formatDayMonth(dateISO?: string) {
  const d = safeDate(dateISO);
  if (!d) return "";
  const day = d.getDate();
  const month = d.toLocaleString("fr-FR", { month: "short" }).replace(".", "");
  return `${day} ${month}.`;
}

function statusScopeFromSubtitle(
  sub?: string | null
): "Texte" | "Scrutin" | "Amendement" | "Vote" | "Événement" {
  const s = norm(sub);
  if (!s) return "Événement";
  if (s.includes("amendement")) return "Amendement";
  if (s.includes("scrutin")) return "Scrutin";
  if (s.includes("vote")) return "Vote";
  return "Événement";
}

function StatusBadge({
  status,
  scope,
}: {
  status?: StatusKey;
  scope: "Texte" | "Scrutin" | "Amendement" | "Vote" | "Événement";
}) {
  const s: StatusKey = status || "pending";

  const cfg =
    s === "adopted"
      ? {
          label: `${scope} : adopté`,
          fg: "rgba(18,20,23,0.86)",
          bg: "rgba(22,163,74,0.06)",
          bd: "rgba(18,20,23,0.10)",
          dot: "rgba(22,163,74,0.85)",
        }
      : s === "rejected"
      ? {
          label: `${scope} : rejeté`,
          fg: "rgba(18,20,23,0.86)",
          bg: "rgba(220,38,38,0.06)",
          bd: "rgba(18,20,23,0.10)",
          dot: "rgba(220,38,38,0.85)",
        }
      : {
          label: "En cours d’examen",
          fg: "rgba(18,20,23,0.86)",
          bg: "rgba(217,119,6,0.06)",
          bd: "rgba(18,20,23,0.10)",
          dot: "rgba(217,119,6,0.85)",
        };

  return (
    <View
      style={[
        styles.statusPill,
        { backgroundColor: cfg.bg, borderColor: cfg.bd },
      ]}
    >
      <View style={[styles.statusDot, { backgroundColor: cfg.dot }]} />
      <Text style={[styles.statusText, { color: cfg.fg }]} numberOfLines={1}>
        {cfg.label}
      </Text>
    </View>
  );
}

function eventTypeIconName(
  tag?: string | null,
  subtitle?: string | null
): keyof typeof MaterialCommunityIcons.glyphMap {
  const sub = norm(subtitle);
  const t = norm(tag);

  if (sub.includes("amendement")) return "file-document-edit-outline";
  if (sub.includes("scrutin")) return "checkbox-marked-circle-outline";

  if (t.includes("amend")) return "file-document-edit-outline";
  if (t.includes("vote")) return "checkbox-marked-circle-outline";
  if (t.includes("loi")) return "book-open-page-variant-outline";
  if (t.includes("question")) return "help-circle-outline";
  if (t.includes("commission")) return "account-group-outline";
  if (t.includes("decret")) return "file-certificate-outline";
  if (t.includes("rapport")) return "file-chart-outline";

  return "information-outline";
}

export default function ActuBulletinRow({
  item,
  onPress,
}: {
  item: BulletinItem;
  onPress?: () => void;
}) {
  const router = useRouter();
  const [titleExpanded, setTitleExpanded] = useState(false);

  const hour = useMemo(() => formatHour(item?.dateISO), [item?.dateISO]);
  const dayMonth = useMemo(() => formatDayMonth(item?.dateISO), [item?.dateISO]);

  // ✅ ACTU NEUTRE : aucune couleur par thème (ni type).
  // La seule couleur restante doit être dans les badges de statut.
  const signal = "rgba(18,20,23,0.28)";
  const wash = "transparent";

  // ✅ B2.2: override statut si JO/promptulgation présent
  const isPromulguee = !!(item as any)?.jo_date_promulgation;

  // ✅ MIN FIX: si le parent fournit statusScope, on le respecte.
  const scope = useMemo(() => {
    const explicit = (item as any)?.statusScope;
    if (explicit) return explicit as any;

    const canon = String((item as any)?.loi_id_canon ?? "").trim().toLowerCase();
    const isLoi = canon.startsWith("loi:");
    return isLoi ? "Texte" : statusScopeFromSubtitle(item?.subtitle);
  }, [item]);

  const typeIcon = useMemo(
    () => eventTypeIconName(item?.tag, item?.subtitle),
    [item?.tag, item?.subtitle]
  );

  const canExpandTitle = (item?.title?.length ?? 0) > 62;

  // ✅ CLICK: on force le routing "loi-first" si possible (loi_id_canon > loi_id > dossier_id > numero_scrutin)
  const handlePress = useCallback(() => {
    try {
      console.log("[ACTU CARD] title =", item?.title ?? "");
      console.log("[ACTU CARD] loi_id_canon =", (item as any)?.loi_id_canon);
      console.log("[ACTU CARD] loi_id =", (item as any)?.loi_id);
      console.log("[ACTU CARD] loi_id_scrutin =", (item as any)?.loi_id_scrutin);
      console.log("[ACTU CARD] dossier_id =", (item as any)?.dossier_id);
      console.log("[ACTU CARD] numero_scrutin =", (item as any)?.numero_scrutin);
    } catch {}

    const itemId =
      (item as any)?.loi_id_canon ??
      (item as any)?.loi_id ??
      (item as any)?.dossier_id ??
      (item as any)?.numero_scrutin ??
      (item as any)?.loi_id_scrutin ??
      null;

    const href = itemId ? routeFromItemId(String(itemId)) : null;

    console.log("[ACTU CARD] href =", href);

    // ✅ Si on peut router proprement, on le fait ici (évite le mauvais mapping du parent)
    if (href) {
      router.push(href as any);
      return;
    }

    console.log("[ACTU CARD] fallback => onPress()");

    // Fallback: comportement historique
    onPress?.();
  }, [item, onPress, router]);

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
    >
      <View style={styles.timeline}>
        {!!hour && <Text style={styles.time}>{hour}</Text>}
        <View style={styles.dotCol}>
          <View style={[styles.dot, { backgroundColor: signal }]} />
          <View style={styles.vline} />
        </View>
        {!!dayMonth && <Text style={styles.day}>{dayMonth}</Text>}
      </View>

      <View style={styles.row}>
        <View pointerEvents="none" style={styles.paperWashLayer}>
          <View style={[styles.washBand, { backgroundColor: wash }]} />
          <View style={styles.paperHighlight} />
        </View>

        <View
          pointerEvents="none"
          style={[styles.accentEdge, { backgroundColor: signal }]}
        />

        <View style={styles.content}>
          <View style={styles.metaRow}>
            <View style={styles.signalRow}>
              <View style={[styles.colorDot, { backgroundColor: signal }]} />
              <View style={styles.typeIconChip}>
                <MaterialCommunityIcons
                  name={typeIcon as any}
                  size={13}
                  color={INK}
                />
              </View>
              <Text style={styles.tagText}>
                {(item?.tag ?? "ACTU").toUpperCase()}
              </Text>
            </View>

            {!!item?.statsLine && (
              <Text style={styles.stats} numberOfLines={1}>
                {item.statsLine}
              </Text>
            )}
          </View>

          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={titleExpanded ? 6 : 2}>
              {item?.title}
            </Text>

            {canExpandTitle && (
              <Pressable
                onPress={(e: any) => {
                  e?.stopPropagation?.();
                  setTitleExpanded((v) => !v);
                }}
                hitSlop={10}
                style={styles.expandBtn}
              >
                <MaterialCommunityIcons
                  name={titleExpanded ? "chevron-up" : "chevron-down"}
                  size={18}
                  color={INK}
                />
              </Pressable>
            )}
          </View>

          {!!item?.subtitle && (
            <Text style={styles.subtitle} numberOfLines={1}>
              {item.subtitle}
            </Text>
          )}

          {/* ✅ B2.2: si promulguée (JO) => override du badge de statut */}
          {isPromulguee ? (
            <View
              style={[
                styles.statusPill,
                {
                  backgroundColor: "rgba(29,78,216,0.06)",
                  borderColor: "rgba(18,20,23,0.10)",
                },
              ]}
            >
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: "rgba(29,78,216,0.85)" },
                ]}
              />
              <Text
                style={[styles.statusText, { color: "rgba(18,20,23,0.86)" }]}
                numberOfLines={1}
              >
                🔵 Promulguée
              </Text>
            </View>
          ) : (
            <StatusBadge status={item?.statusKey} scope={scope} />
          )}
        </View>

        <View style={styles.chevron}>
          <Text style={styles.chevronText}>→</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 2, // ✅ aéré léger
    backgroundColor: PAPER,
  },
  pressed: { opacity: 0.9 },

  timeline: {
    width: 40, // ✅ respire
    alignItems: "flex-end",
    paddingRight: 8,
  },
  time: {
    color: INK_SOFT,
    fontSize: 10,
    fontWeight: "900",
    marginBottom: 1,
  },
  day: {
    color: INK_SOFT,
    fontSize: 10,
    fontWeight: "900",
    marginTop: 1,
  },
  dotCol: { alignItems: "center", width: 14 },
  dot: { width: 7, height: 7, borderRadius: 999 },
  vline: {
    width: 2,
    height: 22, // ✅ aéré
    backgroundColor: LINE,
    marginTop: 4,
    borderRadius: 999,
  },

  row: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: PAPER_CARD,
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 14,
    paddingVertical: 8, // ✅ aéré
    paddingHorizontal: 10, // ✅ aéré
    gap: 10, // ✅ aéré
    overflow: "hidden",
  },

  paperWashLayer: { ...StyleSheet.absoluteFillObject },
  washBand: {
    position: "absolute",
    left: -20,
    top: 0,
    bottom: 0,
    width: "55%",
    opacity: 0.78,
    borderTopRightRadius: 999,
    borderBottomRightRadius: 999,
    transform: [{ skewX: "-12deg" }],
  },
  paperHighlight: {
    position: "absolute",
    left: 0,
    top: 0,
    right: 0,
    height: 14, // ✅ aéré
    backgroundColor: "rgba(255,255,255,0.22)",
  },

  accentEdge: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    opacity: 0.35,
  },

  content: { flex: 1, minWidth: 0 },

  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2, // ✅ aéré
  },
  signalRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  colorDot: { width: 8, height: 8, borderRadius: 999 },

  typeIconChip: {
    width: 20,
    height: 20,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(18,20,23,0.04)",
    borderWidth: 1,
    borderColor: "rgba(18,20,23,0.10)",
  },

  tagText: {
    color: INK,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  stats: { color: INK_SOFT, fontSize: 10, fontWeight: "800" },

  titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  title: {
    flex: 1,
    color: INK,
    fontSize: 14, // ✅ lisible
    fontWeight: "900",
    lineHeight: 18, // ✅ respire
  },
  expandBtn: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: "rgba(18,20,23,0.04)",
    borderWidth: 1,
    borderColor: "rgba(18,20,23,0.08)",
    marginTop: 1,
  },

  subtitle: {
    marginTop: 2, // ✅ aéré
    color: INK_SOFT,
    fontSize: 11,
    fontWeight: "700",
  },

  statusPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4, // ✅ aéré
    paddingHorizontal: 8,
    paddingVertical: 4, // ✅ aéré
    borderRadius: 999,
    borderWidth: 1,
  },
  statusDot: { width: 6, height: 6, borderRadius: 999 },
  statusText: { fontSize: 10, fontWeight: "900" },

  chevron: {
    width: 26,
    alignItems: "center",
    justifyContent: "center",
    borderLeftWidth: 1,
    borderLeftColor: "rgba(18,20,23,0.08)",
  },
  chevronText: { color: INK, fontSize: 18, fontWeight: "900" },
});
