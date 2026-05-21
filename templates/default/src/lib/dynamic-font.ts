import { useCallback } from "react";
import { useWindowDimensions } from "react-native";
import { font } from "@expo/ui/swift-ui/modifiers";

type FontParams = Parameters<typeof font>[0];
type Weight = NonNullable<FontParams["weight"]>;
type Design = NonNullable<FontParams["design"]>;

const GEIST_BY_WEIGHT: Record<Weight, string> = {
  ultraLight: "Geist-Thin",
  thin: "Geist-Thin",
  light: "Geist-Light",
  regular: "Geist-Regular",
  medium: "Geist-Medium",
  semibold: "Geist-SemiBold",
  bold: "Geist-Bold",
  heavy: "Geist-ExtraBold",
  black: "Geist-Black",
};

const GEIST_MONO_BY_WEIGHT: Record<Weight, string> = {
  ultraLight: "GeistMono-Regular",
  thin: "GeistMono-Regular",
  light: "GeistMono-Regular",
  regular: "GeistMono-Regular",
  medium: "GeistMono-Medium",
  semibold: "GeistMono-Medium",
  bold: "GeistMono-Bold",
  heavy: "GeistMono-Bold",
  black: "GeistMono-Bold",
};

function resolveFamily(weight: Weight | undefined, design: Design | undefined): string {
  const w = weight ?? "regular";
  if (design === "monospaced") return GEIST_MONO_BY_WEIGHT[w];
  return GEIST_BY_WEIGHT[w];
}

export function useDynamicFont() {
  const { fontScale } = useWindowDimensions();
  return useCallback(
    (params: FontParams) => {
      const family = params.family ?? resolveFamily(params.weight, params.design);
      const size = params.size != null ? params.size * fontScale : params.size;
      return font({ ...params, family, size });
    },
    [fontScale],
  );
}
