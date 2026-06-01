import type { font } from "@expo/ui/swift-ui/modifiers";

type TextStyle = NonNullable<Parameters<typeof font>[0]["textStyle"]>;

// upstream expo/expo#46007: map the template's point-size scale onto a SwiftUI
// `Font.TextStyle` so text rides Apple's Dynamic Type curves (the Larger Text
// path). The declared size stays the base, the style only sets the scaling
// curve, so default-size rendering is unchanged.
export function textStyleForSize(size: number): TextStyle {
  if (size >= 31) return "largeTitle";
  if (size >= 26) return "title";
  if (size >= 21) return "title2";
  if (size >= 18) return "title3";
  if (size >= 17) return "body";
  if (size >= 16) return "callout";
  if (size >= 15) return "subheadline";
  if (size >= 13) return "footnote";
  if (size >= 12) return "caption";
  return "caption2";
}
