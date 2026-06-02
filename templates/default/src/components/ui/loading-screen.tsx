import { Image as ExpoImage } from "expo-image";
import { Host, ProgressView, Spacer, VStack, RNHostView } from "@expo/ui/swift-ui";
import { accessibilityLabel, progressViewStyle, tint } from "@expo/ui/swift-ui/modifiers";

import { assets } from "@/lib/assets";
import { useColors, useThemedAsset } from "@/hooks/use-theme";

export function LoadingScreen() {
  const colors = useColors();
  const brandIcon = useThemedAsset(assets.brandIconLight, assets.brandIconDark);
  return (
    <Host
      style={{ flex: 1, backgroundColor: colors.background as string }}
      useViewportSizeMeasurement
    >
      <VStack alignment="center" spacing={20} modifiers={[tint(colors.primary as string)]}>
        <Spacer />
        <RNHostView matchContents>
          <ExpoImage
            source={brandIcon}
            style={{ width: 80, height: 80 }}
            contentFit="contain"
            accessibilityLabel=""
          />
        </RNHostView>
        <ProgressView modifiers={[progressViewStyle("circular"), accessibilityLabel("Loading")]} />
        <Spacer />
      </VStack>
    </Host>
  );
}
