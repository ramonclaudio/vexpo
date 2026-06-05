import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Host, Text } from "@expo/ui/swift-ui";
import { foregroundStyle } from "@expo/ui/swift-ui/modifiers";

import { Material } from "@/components/ui/material";
import { useNetwork } from "@/hooks/use-network";
import { Spacing, FontSize } from "@/constants/layout";
import { Radius } from "@/constants/theme";
import { ZIndex } from "@/constants/ui";
import { useColors } from "@/hooks/use-theme";
import { useDynamicFont } from "@/lib/dynamic-font";

// HIG: notification banners overlay the navigation layer with a translucent
// material so context behind the alert remains visible. `Material` carries
// positioning, the live-region announcement, and the chrome surface in one
// shot. The visible label renders through `Host` so it uses SwiftUI's text
// system and respects Dynamic Type.
export function OfflineBanner({ testID }: { testID?: string } = {}) {
  const { isOffline } = useNetwork();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const dfont = useDynamicFont();

  if (!isOffline) return null;

  return (
    <Material
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
          testID={testID}
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
