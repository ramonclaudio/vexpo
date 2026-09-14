import { openSettings } from "expo-linking";
import { Host, ScrollView, VStack } from "@expo/ui/swift-ui";
import { padding, tint } from "@expo/ui/swift-ui/modifiers";

import { CapsuleRowButton } from "@/components/ui/capsule-row-button";
import { HelperText } from "@/components/ui/helper-text";
import { Colors } from "@/constants/theme";

export default function PrivacyScreen() {
  return (
    <Host style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView modifiers={[tint(Colors.primary)]}>
        <VStack
          spacing={12}
          alignment="leading"
          modifiers={[padding({ horizontal: 24, top: 24, bottom: 40 })]}
        >
          <CapsuleRowButton
            label="Camera & Photos"
            hint="Opens this app's page in the Settings app"
            inputLabels={["camera and photos", "camera"]}
            systemImage="camera.fill"
            onPress={openSettings}
          />

          <HelperText modifiers={[padding({ horizontal: 8, top: 4 })]}>
            You can delete your account at any time from Settings.
          </HelperText>
        </VStack>
      </ScrollView>
    </Host>
  );
}
