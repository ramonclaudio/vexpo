import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Material } from "@/components/ui/material";
import { useNetwork } from "@/hooks/use-network";
import { Spacing, FontSize, FontFamily } from "@/constants/layout";
import { Radius } from "@/constants/theme";
import { ZIndex } from "@/constants/ui";
import { useColors } from "@/hooks/use-theme";

// HIG: notification banners overlay the navigation layer with a translucent
// material so context behind the alert remains visible.
export function OfflineBanner() {
  const { isOffline } = useNetwork();
  const insets = useSafeAreaInsets();
  const colors = useColors();

  if (!isOffline) return null;

  return (
    <View
      accessibilityLiveRegion="assertive"
      accessibilityRole="alert"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        zIndex: ZIndex.offlineBanner,
        paddingTop: insets.top,
      }}
    >
      <Material
        variant="chrome"
        tintColor={colors.destructive as string}
        style={{
          marginHorizontal: Spacing.md,
          marginTop: Spacing.xs,
          borderRadius: Radius.full,
          overflow: "hidden",
          paddingVertical: Spacing.sm,
          paddingHorizontal: Spacing.lg,
          alignItems: "center",
        }}
      >
        <Text
          style={{
            fontSize: FontSize.md,
            fontFamily: FontFamily.semiBold,
            color: colors.destructiveForeground as string,
          }}
        >
          You&apos;re offline
        </Text>
      </Material>
    </View>
  );
}
