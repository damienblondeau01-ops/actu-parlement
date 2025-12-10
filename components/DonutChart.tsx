import React from "react";
import { View, Text } from "react-native";
import Svg, { Circle } from "react-native-svg";

export default function DonutChart({
  pour, contre, abstention,
  size = 160,
  strokeWidth = 18,
}:{
  pour: number; contre:number; abstention:number;
  size?:number; strokeWidth?:number;
}) {

  const total = pour + contre + abstention;
  if (!total) return null;

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const pct = (v:number) => Math.round((v / total) * circumference);
  const p1 = pct(pour);
  const p2 = pct(contre);
  const p3 = pct(abstention);

  return (
    <View style={{ alignItems:"center", marginVertical:20 }}>
      <Svg width={size} height={size}>
        <Circle cx={size/2} cy={size/2} r={radius} stroke="#1e293b" strokeWidth={strokeWidth} fill="none" />
        <Circle cx={size/2} cy={size/2} r={radius} stroke="#16a34a" strokeWidth={strokeWidth} strokeDasharray={`${p1} ${circumference-p1}`} strokeLinecap="round" fill="none" />
        <Circle cx={size/2} cy={size/2} r={radius} stroke="#dc2626" strokeWidth={strokeWidth} strokeDasharray={`${p2} ${circumference-p2}`} strokeDashoffset={-p1} strokeLinecap="round" fill="none" />
        <Circle cx={size/2} cy={size/2} r={radius} stroke="#eab308" strokeWidth={strokeWidth} strokeDasharray={`${p3} ${circumference-p3}`} strokeDashoffset={-(p1+p2)} strokeLinecap="round" fill="none" />
      </Svg>
      <Text style={{ color:"#fff", marginTop:10 }}>
        Pour {Math.round((pour*100)/total)}% ·
        Contre {Math.round((contre*100)/total)}% ·
        Abs {Math.round((abstention*100)/total)}%
      </Text>
    </View>
  );
}
