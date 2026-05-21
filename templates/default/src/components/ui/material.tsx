import type { ReactNode } from "react";
import { StyleSheet, View, type ViewProps } from "react-native";
import { BlurView, type BlurTint } from "expo-blur";
import { GlassView, isLiquidGlassAvailable, type GlassStyle } from "expo-glass-effect";

/**
 * HIG-aware translucent surface. Picks the right backing per OS:
 *
 *   iOS 26+        -> `GlassView` (true Liquid Glass via UIVisualEffectView)
 *   iOS 16.4-25    -> `BlurView` (UIVisualEffectView blur + tint overlay)
 *   anything else  -> solid `tintColor` fallback
 *
 * Apple's HIG reserves materials for the navigation layer that floats above
 * content: tab bars, navigation bars, toolbars, sheets, popovers, alerts,
 * notification banners. Most of those are already handled by `@expo/ui`'s
 * SwiftUI primitives and `expo-router`'s NativeTabs. Reach for `<Material>`
 * only when you're hand-building floating UI: a custom HUD, a toast, a
 * pill that overlays scrollable content, a custom sheet backdrop.
 *
 * Children render inside the surface unchanged. `tintColor` paints over the
 * blur (semi-transparent so the blur still reads); on iOS 26+ it goes to
 * `GlassView`'s native `tintColor` instead.
 */
export type MaterialVariant = "ultraThin" | "thin" | "regular" | "thick" | "chrome";

const BLUR_INTENSITY: Record<MaterialVariant, number> = {
  ultraThin: 30,
  thin: 50,
  regular: 70,
  thick: 90,
  chrome: 100,
};

const BLUR_TINT: Record<MaterialVariant, BlurTint> = {
  ultraThin: "systemUltraThinMaterial",
  thin: "systemThinMaterial",
  regular: "systemMaterial",
  thick: "systemThickMaterial",
  chrome: "systemChromeMaterial",
};

const GLASS_STYLE: Record<MaterialVariant, GlassStyle> = {
  ultraThin: "clear",
  thin: "clear",
  regular: "regular",
  thick: "regular",
  chrome: "regular",
};

const TINT_OVERLAY_OPACITY = 0.35;

// Inherits `ViewProps` so callers can pass `style`, `accessibilityRole`,
// `accessibilityLiveRegion`, etc. directly on the material surface without
// needing an outer wrapper View just for positioning or accessibility.
export type MaterialProps = ViewProps & {
  children?: ReactNode;
  variant?: MaterialVariant;
  tintColor?: string;
  isInteractive?: boolean;
};

export function Material({
  children,
  variant = "regular",
  tintColor,
  isInteractive = false,
  ...viewProps
}: MaterialProps) {
  if (isLiquidGlassAvailable()) {
    return (
      <GlassView
        {...viewProps}
        glassEffectStyle={GLASS_STYLE[variant]}
        tintColor={tintColor}
        isInteractive={isInteractive}
      >
        {children}
      </GlassView>
    );
  }

  return (
    <BlurView {...viewProps} intensity={BLUR_INTENSITY[variant]} tint={BLUR_TINT[variant]}>
      {tintColor ? (
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: tintColor, opacity: TINT_OVERLAY_OPACITY },
          ]}
          pointerEvents="none"
          accessible={false}
          importantForAccessibility="no"
        />
      ) : null}
      {children}
    </BlurView>
  );
}
