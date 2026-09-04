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
import { Spacing, FontSize, TouchTarget } from "@/constants/layout";
import { Radius } from "@/constants/theme";
import { ZIndex } from "@/constants/ui";
import { useColors } from "@/hooks/use-theme";
import { announce } from "@/lib/a11y";
import { useDynamicFont } from "@/lib/dynamic-font";

export function UpdateBanner({ testID }: { testID?: string } = {}) {
  const updates = useAppUpdates();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const dfont = useDynamicFont();
  const motion = useBannerMotion("bottom");

  const showProgress = updates.isDownloading;
  const showError = !!updates.downloadError;

  useEffect(() => {
    if (showError) announce("Update failed. Tap to retry.");
  }, [showError]);

  if (!showProgress && !showError) return null;

  const tint = showError ? (colors.destructive as string) : (colors.primary as string);
  const fg = showError
    ? (colors.destructiveForeground as string)
    : (colors.primaryForeground as string);
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
        bottom: insets.bottom + Spacing.xs,
        left: Spacing.md,
        right: Spacing.md,
        zIndex: ZIndex.updateBanner,
      }}
    >
      <Material
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        variant="chrome"
        tintColor={tint}
        isInteractive={showError}
        style={{
          borderRadius: Radius.full,
          overflow: "hidden",
          alignItems: "center",
        }}
      >
        <Host matchContents>
          <Button
            testID="update-banner-retry"
            modifiers={[
              buttonStyle("plain"),
              padding({ vertical: Spacing.sm, horizontal: Spacing.lg }),
              frame({ minHeight: TouchTarget.min }),
              contentShape(shapes.rectangle()),
              disabledModifier(!showError),
              accessibilityLabel(label),
              ...(showProgress ? [accessibilityAddTraits(["updatesFrequently"])] : []),
              ...(showError ? [accessibilityHint("Re-attempts the update download")] : []),
            ]}
            onPress={showError ? () => updates.downloadAndApply() : () => {}}
          >
            <Text
              testID={testID}
              modifiers={[dfont({ size: FontSize["3xl"], weight: "bold" }), foregroundStyle(fg)]}
            >
              {label}
            </Text>
          </Button>
        </Host>
      </Material>
    </Animated.View>
  );
}
