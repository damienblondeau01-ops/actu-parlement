// components/DonutChart.tsx
import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { G, Circle } from "react-native-svg";

type Props = {
  pour: number;
  contre: number;
  abstention: number;
  /** Taille du donut (diamètre) */
  size?: number;
  /** Epaisseur de l’anneau */
  strokeWidth?: number;
  /** Couleurs plus douces (alpha) comme /groupes */
  soft?: boolean;
  /** Afficher le texte sous le donut */
  showLegend?: boolean;
};

export default function DonutChart({
  pour,
  contre,
  abstention,
  size = 150,
  strokeWidth = 16,
  soft = true,
  showLegend = true,
}: Props) {
  const total = Math.max(0, pour) + Math.max(0, contre) + Math.max(0, abstention);

  const pct = useMemo(() => {
    if (!total) return { p: 0, c: 0, a: 0 };
    const p = Math.round((pour * 100) / total);
    const c = Math.round((contre * 100) / total);
    const a = Math.max(0, 100 - p - c); // garde 100% même avec arrondis
    return { p, c, a };
  }, [pour, contre, abstention, total]);

  // couleurs alignées “soft” avec ton écran /groupes
  const COLORS = soft
    ? {
        pour: "rgba(34,197,94,0.55)",
        contre: "rgba(239,68,68,0.50)",
        abst: "rgba(234,179,8,0.55)",
        track: "rgba(255,255,255,0.08)",
        text: "rgba(229,231,235,0.92)",
        sub: "rgba(229,231,235,0.72)",
      }
    : {
        pour: "rgba(34,197,94,0.95)",
        contre: "rgba(239,68,68,0.95)",
        abst: "rgba(234,179,8,0.95)",
        track: "rgba(255,255,255,0.10)",
        text: "rgba(229,231,235,0.95)",
        sub: "rgba(229,231,235,0.75)",
      };

  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;

  // fractions
  const fPour = total ? pour / total : 0;
  const fContre = total ? contre / total : 0;
  const fAbst = total ? abstention / total : 0;

  // dash offsets (on dessine dans l’ordre: pour -> contre -> abst)
  const dashPour = c * (1 - fPour);
  const dashContre = c * (1 - fContre);
  const dashAbst = c * (1 - fAbst);

  const rot = -90; // start en haut

  if (!total) {
    return (
      <View style={[styles.wrap, { width: size, height: size }]}>
        <Svg width={size} height={size}>
          <G rotation={rot} originX={size / 2} originY={size / 2}>
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={COLORS.track}
              strokeWidth={strokeWidth}
              fill="transparent"
            />
          </G>
        </Svg>
        <Text style={[styles.legend, { color: COLORS.sub }]}>Aucune donnée</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.wrap, { width: size, height: size }]}>
        <Svg width={size} height={size}>
          <G rotation={rot} originX={size / 2} originY={size / 2}>
            {/* track */}
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={COLORS.track}
              strokeWidth={strokeWidth}
              fill="transparent"
            />

            {/* pour */}
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={COLORS.pour}
              strokeWidth={strokeWidth}
              fill="transparent"
              strokeLinecap="round"
              strokeDasharray={`${c} ${c}`}
              strokeDashoffset={dashPour}
            />

            {/* contre */}
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={COLORS.contre}
              strokeWidth={strokeWidth}
              fill="transparent"
              strokeLinecap="round"
              strokeDasharray={`${c} ${c}`}
              strokeDashoffset={dashContre}
              // décale le départ après “pour”
              rotation={360 * fPour}
              originX={size / 2}
              originY={size / 2}
            />

            {/* abst */}
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={COLORS.abst}
              strokeWidth={strokeWidth}
              fill="transparent"
              strokeLinecap="round"
              strokeDasharray={`${c} ${c}`}
              strokeDashoffset={dashAbst}
              // décale après “pour + contre”
              rotation={360 * (fPour + fContre)}
              originX={size / 2}
              originY={size / 2}
            />
          </G>
        </Svg>
      </View>

      {showLegend && (
        <Text style={[styles.legend, { color: COLORS.text }]}>
          Pour {pct.p}% · Contre {pct.c}% · Abst {pct.a}%
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", justifyContent: "center" },
  wrap: { alignItems: "center", justifyContent: "center" },
  legend: { marginTop: 10, fontWeight: "800", fontSize: 13 },
});
