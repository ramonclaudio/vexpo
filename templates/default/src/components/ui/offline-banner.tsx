import { useEffect } from "react";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Host, Text } from "@expo/ui/swift-ui";
import { foregroundStyle } from "@expo/ui/swift-ui/modifiers";

import { Material } from "@/components/ui/material";
import { useBannerMotion } from "@/hooks/use-banner-motion";
import { useNetwork } from "@/hooks/use-network";
import { Spacing, FontSize } from "@/constants/layout";
import { Radius } from "@/constants/theme";
import { ZIndex } from "@/constants/ui";
import { useColors } from "@/hooks/use-theme";
import { announce } from "@/lib/a11y";
import { useDynamicFont } from "@/lib/dynamic-font";

export function OfflineBanner({ testID }: { testID?: string } = {}) {
  const { isOffline } = useNetwork();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const dfont = useDynamicFont();
  const motion = useBannerMotion("top");

  useEffect(() => {
    if (isOffline) announce("You're offline");
  }, [isOffline]);

  if (!isOffline) return null;

  return (
    <Animated.View
      entering={motion.entering}
      exiting={motion.exiting}
      style={{
        position: "absolute",
        top: insets.top + Spacing.xs,
        left: Spacing.md,
        right: Spacing.md,
        zIndex: ZIndex.offlineBanner,
      }}
    >
      <Material
        testID={testID}
        accessible
        accessibilityLiveRegion="assertive"
        accessibilityRole="alert"
        accessibilityLabel="You're offline"
        variant="chrome"
        tintColor={colors.destructive as string}
        style={{
          borderRadius: Radius.full,
          overflow: "hidden",
          paddingVertical: Spacing.sm,
          paddingHorizontal: Spacing.lg,
          alignItems: "center",
        }}
      >
        <Host matchContents>
          <Text
            modifiers={[
              dfont({ size: FontSize["3xl"], weight: "bold" }),
              foregroundStyle(colors.destructiveForeground as string),
            ]}
          >
            You&apos;re offline
          </Text>
        </Host>
      </Material>
    </Animated.View>
  );
}
