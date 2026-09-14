import { useEffect } from "react";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Host, Text } from "@expo/ui/swift-ui";
import {
  accessibilityAddTraits,
  accessibilityHint,
  accessibilityLabel,
  buttonStyle,
  contentShape,
  disabled as disabledModifier,
  foregroundStyle,
  frame,
  padding,
  shapes,
} from "@expo/ui/swift-ui/modifiers";

import { Material } from "@/components/ui/material";
import { useAppUpdates } from "@/hooks/use-updates";
import { useBannerMotion } from "@/hooks/use-banner-motion";
import { TouchTarget } from "@/constants/layout";
import { ZIndex } from "@/constants/ui";
import { Colors } from "@/constants/theme";
import { announce } from "@/lib/a11y";
import { useDynamicFont } from "@/lib/dynamic-font";

export function UpdateBanner() {
  const updates = useAppUpdates();
  const insets = useSafeAreaInsets();
  const dfont = useDynamicFont();
  const motion = useBannerMotion("bottom");

  const showProgress = updates.isDownloading;
  const showError = !!updates.downloadError;

  useEffect(() => {
    if (showError) announce("Update failed. Tap to retry.");
  }, [showError]);

  if (!showProgress && !showError) return null;

  const tint = showError ? Colors.destructive : Colors.primary;
  const fg = showError ? Colors.destructiveForeground : Colors.primaryForeground;
  const pct =
    showProgress && updates.downloadProgress != null
      ? ` ${Math.round(updates.downloadProgress * 100)}%`
      : "";
  const label = showError ? "Update failed. Tap to retry." : `Updating${pct}`;

  return (
    <Animated.View
      entering={motion.entering}
      exiting={motion.exiting}
      style={{
        position: "absolute",
        bottom: insets.bottom + 4,
        left: 12,
        right: 12,
        zIndex: ZIndex.updateBanner,
      }}
    >
      <Material
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        tintColor={tint}
        isInteractive={showError}
        style={{
          borderRadius: 9999,
          overflow: "hidden",
          alignItems: "center",
        }}
      >
        <Host matchContents>
          <Button
            modifiers={[
              buttonStyle("plain"),
              padding({ vertical: 8, horizontal: 16 }),
              frame({ minHeight: TouchTarget.min }),
              contentShape(shapes.rectangle()),
              disabledModifier(!showError),
              accessibilityLabel(label),
              ...(showProgress ? [accessibilityAddTraits(["updatesFrequently"])] : []),
              ...(showError ? [accessibilityHint("Re-attempts the update download")] : []),
            ]}
            onPress={showError ? () => updates.downloadAndApply() : () => {}}
          >
            <Text modifiers={[dfont({ size: 18, weight: "bold" }), foregroundStyle(fg)]}>
              {label}
            </Text>
          </Button>
        </Host>
      </Material>
    </Animated.View>
  );
}
