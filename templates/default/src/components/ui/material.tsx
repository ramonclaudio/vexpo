import type { ReactNode } from "react";
import { StyleSheet, View, type ViewProps } from "react-native";
import { BlurView, type BlurTint } from "expo-blur";
import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
  type GlassStyle,
} from "expo-glass-effect";

import { useReduceTransparency } from "@/hooks/use-reduce-transparency";
import { useColors } from "@/hooks/use-theme";

type MaterialVariant = "ultraThin" | "thin" | "regular" | "thick" | "chrome";

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

type MaterialProps = ViewProps & {
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
  const reduceTransparency = useReduceTransparency();
  const colors = useColors();

  if (reduceTransparency) {
    return (
      <View {...viewProps} style={[viewProps.style, { backgroundColor: tintColor ?? colors.card }]}>
        {children}
      </View>
    );
  }

  if (isLiquidGlassAvailable() && isGlassEffectAPIAvailable()) {
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
