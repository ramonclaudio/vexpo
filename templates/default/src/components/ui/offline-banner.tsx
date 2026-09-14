import { useEffect, useRef, useState } from "react";
import { useNetworkState } from "expo-network";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Host, Text } from "@expo/ui/swift-ui";
import { foregroundStyle } from "@expo/ui/swift-ui/modifiers";

import { Material } from "@/components/ui/material";
import { useBannerMotion } from "@/hooks/use-banner-motion";
import { ZIndex } from "@/constants/ui";
import { Colors } from "@/constants/theme";
import { announce } from "@/lib/a11y";
import { useDynamicFont } from "@/lib/dynamic-font";

const OFFLINE_SETTLE_MS = 3000;

function useIsOffline(): boolean {
  const { isConnected, isInternetReachable } = useNetworkState();
  const probablyOffline = isConnected === false || isInternetReachable === false;
  const [settledOffline, setSettledOffline] = useState(false);

  useEffect(() => {
    if (!probablyOffline) return;
    const id = setTimeout(() => setSettledOffline(true), OFFLINE_SETTLE_MS);
    return () => {
      clearTimeout(id);
      setSettledOffline(false);
    };
  }, [probablyOffline]);

  return settledOffline;
}

export function OfflineBanner() {
  const isOffline = useIsOffline();
  const insets = useSafeAreaInsets();
  const dfont = useDynamicFont();
  const motion = useBannerMotion("top");

  const wasOffline = useRef(false);
  useEffect(() => {
    if (isOffline) announce("You're offline");
    else if (wasOffline.current) announce("Back online");
    wasOffline.current = isOffline;
  }, [isOffline]);

  if (!isOffline) return null;

  return (
    <Animated.View
      entering={motion.entering}
      exiting={motion.exiting}
      style={{
        position: "absolute",
        top: insets.top + 4,
        left: 12,
        right: 12,
        zIndex: ZIndex.offlineBanner,
      }}
    >
      <Material
        accessible
        accessibilityLiveRegion="assertive"
        accessibilityRole="alert"
        accessibilityLabel="You're offline"
        tintColor={Colors.destructive}
        style={{
          borderRadius: 9999,
          overflow: "hidden",
          paddingVertical: 8,
          paddingHorizontal: 16,
          alignItems: "center",
        }}
      >
        <Host matchContents>
          <Text
            modifiers={[
              dfont({ size: 18, weight: "bold" }),
              foregroundStyle(Colors.destructiveForeground),
            ]}
          >
            You&apos;re offline
          </Text>
        </Host>
      </Material>
    </Animated.View>
  );
}
