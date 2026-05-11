import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Material } from "@/components/ui/material";
import { useAppUpdates } from "@/hooks/use-updates";
import { Spacing, FontSize, FontFamily } from "@/constants/layout";
import { Radius } from "@/constants/theme";
import { ZIndex } from "@/constants/ui";
import { useColors } from "@/hooks/use-theme";

// In-app surface for the EAS Update lifecycle. Mirrors the OfflineBanner
// pattern (translucent material overlaying the nav layer per HIG) and is
// only visible while the update state machine is doing something the user
// would want to see:
//
//   - downloading      progress %, no tap target. auto-applies on finish
//   - download failed  tap to retry
//   - check failed     silent unless the user previously asked for an update
//
// `isUpdatePending` (downloaded, awaiting reload) is handled by the
// `useAppUpdates` hook (auto-reload with reload screen), so we don't
// surface it here. the splash-screen overlay does the visual work.
export function UpdateBanner() {
  const updates = useAppUpdates();
  const insets = useSafeAreaInsets();
  const colors = useColors();

  const showProgress = updates.isDownloading;
  const showError = !!updates.downloadError;
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
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: ZIndex.updateBanner,
        paddingBottom: insets.bottom,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={showError ? "Re-attempts the update download" : undefined}
        disabled={!showError}
        onPress={showError ? () => updates.downloadAndApply() : undefined}
      >
        <Material
          variant="chrome"
          tintColor={tint}
          style={{
            marginHorizontal: Spacing.md,
            marginBottom: Spacing.xs,
            borderRadius: Radius.full,
            overflow: "hidden",
            paddingVertical: Spacing.sm,
            paddingHorizontal: Spacing.lg,
            alignItems: "center",
          }}
        >
          <Text style={{ fontSize: FontSize.md, fontFamily: FontFamily.semiBold, color: fg }}>
            {label}
          </Text>
        </Material>
      </Pressable>
    </View>
  );
}
