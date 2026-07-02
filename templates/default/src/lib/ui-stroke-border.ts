import { requireOptionalNativeModule } from "expo-modules-core";
import { type Color, createModifier, type ModifierConfig } from "@expo/ui/swift-ui/modifiers";

// upstream expo/expo#47426: merged 2026-07-02 but in no published @expo/ui.
// The Swift half lives in modules/vexpo-ui-stroke-border, registered through
// the public ViewModifierRegistry.register API. Importing this file creates
// that native module, which registers the modifier before any view renders
// (the optional require keeps a stale dev client from crashing; the modifier
// then no-ops). Delete this file and modules/vexpo-ui-stroke-border once a
// release ships it, then import both from @expo/ui/swift-ui/modifiers.
requireOptionalNativeModule("VexpoUIStrokeBorder");

export type StrokeStyle = {
  /** The width of the stroked line. @default 1 */
  lineWidth?: number;
  /** The endpoint style of a line segment. @default 'butt' */
  lineCap?: "butt" | "round" | "square";
  /** The join type where line segments meet. @default 'miter' */
  lineJoin?: "miter" | "round" | "bevel";
  /** The limit past which a miter join is replaced by a bevel. @default 10 */
  miterLimit?: number;
  /** The lengths of alternating painted and unpainted segments. An empty array draws a solid line. @default [] */
  dash?: number[];
  /** How far into the dash pattern the line starts. @default 0 */
  dashPhase?: number;
};

export const strokeBorder = (params: {
  color?: Color;
  style?: StrokeStyle;
  antialiased?: boolean;
  shape?:
    | "rectangle"
    | "circle"
    | "capsule"
    | "ellipse"
    | "roundedRectangle"
    | "containerRelativeShape";
  cornerRadius?: number;
}): ModifierConfig => createModifier("strokeBorder", params);
