import { Host, ProgressView, Spacer, VStack } from "@expo/ui/swift-ui";
import { accessibilityLabel, progressViewStyle, tint } from "@expo/ui/swift-ui/modifiers";

import BrandIcon from "@/components/ui/brand-icon";
import { Colors } from "@/constants/theme";

export function LoadingScreen() {
  return (
    <Host style={{ flex: 1, backgroundColor: Colors.background }} useViewportSizeMeasurement>
      <VStack alignment="center" spacing={20} modifiers={[tint(Colors.primary)]}>
        <Spacer />
        <BrandIcon size={80} />
        <ProgressView modifiers={[progressViewStyle("circular"), accessibilityLabel("Loading")]} />
        <Spacer />
      </VStack>
    </Host>
  );
}
