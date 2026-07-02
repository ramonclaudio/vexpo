import { useEffect } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Host, Text } from "@expo/ui/swift-ui";
import { foregroundStyle } from "@expo/ui/swift-ui/modifiers";

import { Material } from "@/components/ui/material";
import { useNetwork } from "@/hooks/use-network";
import { Spacing, FontSize } from "@/constants/layout";
import { Radius } from "@/constants/theme";
import { ZIndex } from "@/constants/ui";
import { useColors } from "@/hooks/use-theme";
import { announce } from "@/lib/a11y";
import { useDynamicFont } from "@/lib/dynamic-font";

// HIG: notification banners overlay the navigation layer with a translucent
// material so context behind the alert remains visible. `Material` carries
// positioning and the chrome surface. VoiceOver on iOS gets the appearance
// announcement from `announce()`. The Android live region is the fallback.
// The visible label renders through `Host` so it uses SwiftUI's text system
// and respects Dynamic Type.
export function OfflineBanner({ testID }: { testID?: string } = {}) {
  const { isOffline } = useNetwork();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const dfont = useDynamicFont();

  // Above the early return so the hook runs unconditionally (rules of hooks).
  useEffect(() => {
    if (isOffline) announce("You're offline");
  }, [isOffline]);

  if (!isOffline) return null;

  return (
    <Material
      testID={testID}
      accessible
      accessibilityLiveRegion="assertive"
      accessibilityRole="alert"
      accessibilityLabel="You're offline"
      variant="chrome"
      tintColor={colors.destructive as string}
      style={{
        position: "absolute",
        top: insets.top + Spacing.xs,
        left: Spacing.md,
        right: Spacing.md,
        zIndex: ZIndex.offlineBanner,
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
  );
}
