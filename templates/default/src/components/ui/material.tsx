import { useEffect, useState } from "react";
import { AccessibilityInfo, StyleSheet, View, type ViewProps } from "react-native";
import { BlurView } from "expo-blur";
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";

const TINT_OVERLAY_OPACITY = 0.35;

function useReduceTransparency(): boolean {
  const [on, setOn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceTransparencyEnabled().then((value) => {
      if (!cancelled) setOn(value);
    });
    const sub = AccessibilityInfo.addEventListener("reduceTransparencyChanged", setOn);
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  return on;
}

type MaterialProps = ViewProps & {
  tintColor: string;
  isInteractive?: boolean;
};

export function Material({
  children,
  tintColor,
  isInteractive = false,
  ...viewProps
}: MaterialProps) {
  const reduceTransparency = useReduceTransparency();

  if (reduceTransparency) {
    return (
      <View {...viewProps} style={[viewProps.style, { backgroundColor: tintColor }]}>
        {children}
      </View>
    );
  }

  if (isLiquidGlassAvailable() && isGlassEffectAPIAvailable()) {
    return (
      <GlassView
        {...viewProps}
        glassEffectStyle="regular"
        tintColor={tintColor}
        isInteractive={isInteractive}
      >
        {children}
      </GlassView>
    );
  }

  return (
    <BlurView {...viewProps} intensity={100} tint="systemChromeMaterial">
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: tintColor, opacity: TINT_OVERLAY_OPACITY },
        ]}
        pointerEvents="none"
        accessible={false}
        importantForAccessibility="no"
      />
      {children}
    </BlurView>
  );
}
