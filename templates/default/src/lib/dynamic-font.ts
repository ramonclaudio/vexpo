import { useCallback } from "react";
import { font } from "@expo/ui/swift-ui/modifiers";

import { FontFamily } from "@/constants/layout";

type FontParams = Parameters<typeof font>[0];
type Weight = NonNullable<FontParams["weight"]>;
type TextStyle = NonNullable<FontParams["textStyle"]>;

const GEIST_BY_WEIGHT: Record<Weight, string> = {
  ultraLight: FontFamily.regular,
  thin: FontFamily.regular,
  light: FontFamily.regular,
  regular: FontFamily.regular,
  medium: FontFamily.medium,
  semibold: FontFamily.semiBold,
  bold: FontFamily.bold,
  heavy: FontFamily.bold,
  black: FontFamily.bold,
};

// Point sizes map onto SwiftUI text styles so they scale with Larger Text.
const TEXT_STYLE_STEPS: [number, TextStyle][] = [
  [31, "largeTitle"],
  [26, "title"],
  [21, "title2"],
  [18, "title3"],
  [17, "body"],
  [16, "callout"],
  [15, "subheadline"],
  [13, "footnote"],
  [12, "caption"],
];

function textStyleForSize(size: number): TextStyle {
  return TEXT_STYLE_STEPS.find(([min]) => size >= min)?.[1] ?? "caption2";
}

export function useDynamicFont() {
  return useCallback((params: FontParams) => {
    const family =
      params.family ??
      (params.design === "monospaced"
        ? FontFamily.mono
        : GEIST_BY_WEIGHT[params.weight ?? "regular"]);
    const textStyle =
      params.textStyle ?? (params.size != null ? textStyleForSize(params.size) : undefined);
    return font({ ...params, family, textStyle });
  }, []);
}
