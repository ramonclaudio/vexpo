import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Host, Text } from "@expo/ui/swift-ui";
import {
  accessibilityHint,
  accessibilityLabel,
  buttonStyle,
  contentShape,
  disabled as disabledModifier,
  foregroundStyle,
  padding,
  shapes,
} from "@expo/ui/swift-ui/modifiers";

import { Material } from "@/components/ui/material";
import { useAppUpdates } from "@/hooks/use-updates";
import { Spacing, FontSize } from "@/constants/layout";
import { Radius } from "@/constants/theme";
import { ZIndex } from "@/constants/ui";
import { useColors } from "@/hooks/use-theme";
import { useDynamicFont } from "@/lib/dynamic-font";

// In-app surface for the EAS Update lifecycle. Mirrors `OfflineBanner`
// (translucent material overlaying the nav layer per HIG) and is only
// visible while the update state machine is doing something the user
// would want to see:
//
//   - downloading      progress %, no tap target. auto-applies on finish
//   - download failed  tap to retry
//   - check failed     silent unless the user previously asked for an update
//
// `isUpdatePending` (downloaded, awaiting reload) is handled by the
// `useAppUpdates` hook (auto-reload with reload screen), so we don't
// surface it here. The splash-screen overlay does the visual work.
export function UpdateBanner() {
  const updates = useAppUpdates();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const dfont = useDynamicFont();

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
    <Material
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      variant="chrome"
      tintColor={tint}
      style={{
        position: "absolute",
        bottom: insets.bottom + Spacing.xs,
        left: Spacing.md,
        right: Spacing.md,
        zIndex: ZIndex.updateBanner,
        borderRadius: Radius.full,
        overflow: "hidden",
        alignItems: "center",
      }}
    >
      <Host matchContents>
        <Button
          modifiers={[
            buttonStyle("plain"),
            padding({ vertical: Spacing.sm, horizontal: Spacing.lg }),
            contentShape(shapes.rectangle()),
            disabledModifier(!showError),
            accessibilityLabel(label),
            ...(showError ? [accessibilityHint("Re-attempts the update download")] : []),
          ]}
          onPress={showError ? () => updates.downloadAndApply() : () => {}}
        >
          <Text modifiers={[dfont({ size: FontSize.md, weight: "semibold" }), foregroundStyle(fg)]}>
            {label}
          </Text>
        </Button>
      </Host>
    </Material>
  );
}
