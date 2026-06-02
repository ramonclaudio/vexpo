import { useCallback } from "react";
import { font } from "@expo/ui/swift-ui/modifiers";

import { textStyleForSize } from "@/lib/text-style";

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

// upstream expo/expo#46007: passing the `font` modifier a `textStyle` scales the
// Geist family with iOS Dynamic Type natively (Apple's Larger Text path) instead
// of a JS-side `fontScale` multiply. `textStyleForSize` picks the style from the
// declared size, which stays the base, so default-size rendering is unchanged
// and SwiftUI rescales without a JS re-render.
export function useDynamicFont() {
  return useCallback((params: FontParams) => {
    const family = params.family ?? resolveFamily(params.weight, params.design);
    const textStyle =
      params.textStyle ?? (params.size != null ? textStyleForSize(params.size) : undefined);
    return font({ ...params, family, textStyle });
  }, []);
}
