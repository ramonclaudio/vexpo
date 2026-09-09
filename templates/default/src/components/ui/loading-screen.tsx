import { Host, ProgressView, Spacer, VStack } from "@expo/ui/swift-ui";
import { accessibilityLabel, progressViewStyle, tint } from "@expo/ui/swift-ui/modifiers";

import BrandIcon from "@/components/ui/brand-icon";
import { useColors } from "@/hooks/use-theme";

export function LoadingScreen({ testID }: { testID?: string } = {}) {
  const colors = useColors();
  return (
    <Host
      testID={testID}
      style={{ flex: 1, backgroundColor: colors.background }}
      useViewportSizeMeasurement
    >
      <VStack alignment="center" spacing={20} modifiers={[tint(colors.primary)]}>
        <Spacer />
        <BrandIcon size={80} />
        <ProgressView modifiers={[progressViewStyle("circular"), accessibilityLabel("Loading")]} />
        <Spacer />
      </VStack>
    </Host>
  );
}
