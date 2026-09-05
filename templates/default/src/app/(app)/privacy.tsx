import { openSettings } from "expo-linking";
import { Host, ScrollView, VStack } from "@expo/ui/swift-ui";
import { frame, padding, tint } from "@expo/ui/swift-ui/modifiers";

import { CapsuleRowButton } from "@/components/ui/capsule-row-button";
import { HelperText } from "@/components/ui/helper-text";
import { useColors } from "@/hooks/use-theme";

export default function PrivacyScreen() {
  const colors = useColors();

  const handleOpenSettings = () => {
    openSettings();
  };

  return (
    <Host testID="privacy-screen" style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView modifiers={[tint(colors.primary)]}>
        <VStack
          spacing={12}
          alignment="leading"
          modifiers={[padding({ horizontal: 24, top: 24, bottom: 40 })]}
        >
          <VStack spacing={8} modifiers={[frame({ maxWidth: Infinity })]}>
            <CapsuleRowButton
              testID="privacy-camera-photos"
              label="Camera & Photos"
              inputLabels={["camera and photos", "camera"]}
              systemImage="camera.fill"
              onPress={handleOpenSettings}
            />
            <CapsuleRowButton
              testID="privacy-notifications"
              label="Notifications"
              systemImage="bell.fill"
              onPress={handleOpenSettings}
            />
            <CapsuleRowButton
              testID="privacy-system-settings"
              label="System Settings"
              systemImage="gear"
              onPress={handleOpenSettings}
            />
          </VStack>

          <HelperText
            testID="privacy-data-disclaimer"
            modifiers={[padding({ horizontal: 8, top: 4 })]}
          >
            You can request a copy of your data or delete your account at any time from Settings.
          </HelperText>
        </VStack>
      </ScrollView>
    </Host>
  );
}
