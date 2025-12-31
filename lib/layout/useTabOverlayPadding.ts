// lib/layout/useTabOverlayPadding.ts
import { useMemo } from "react";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Padding bottom à réserver quand la tabbar est en overlay (position:absolute).
 *
 * On ne dépend PAS de useBottomTabBarHeight car dès qu’on customise la tabbar
 * (height, bottom offset, borderRadius, etc.) la valeur devient imprécise.
 */
export function useTabOverlayPadding(extra: number = 16) {
  const insets = useSafeAreaInsets();

  // ⚠️ Doit matcher app/(tabs)/_layout.tsx
  const TAB_HEIGHT = 56;
  const MIN_BOTTOM_OFFSET = 8;

  // Sur Android (gesture nav) insets.bottom peut être 0 selon devices/config
  const bottomInset = Number(insets.bottom ?? 0);

  // bottomOffset identique à celui de la tabbar
  const bottomOffset = Math.max(bottomInset, MIN_BOTTOM_OFFSET);

  // Réserve : hauteur tab + son offset + petit confort
  const reserved = TAB_HEIGHT + bottomOffset + extra;

  return useMemo(() => {
    // iOS a souvent un inset bottom fiable, Android parfois non => on garde min offset
    if (Platform.OS === "android") return reserved;
    return reserved;
  }, [reserved]);
}
