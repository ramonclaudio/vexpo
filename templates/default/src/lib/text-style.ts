import type { font } from "@expo/ui/swift-ui/modifiers";

type TextStyle = NonNullable<Parameters<typeof font>[0]["textStyle"]>;

const STEPS: [number, TextStyle][] = [
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

export function textStyleForSize(size: number): TextStyle {
  return STEPS.find(([min]) => size >= min)?.[1] ?? "caption2";
}
