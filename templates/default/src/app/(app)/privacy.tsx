import { useState, type ComponentProps } from "react";
import { openSettings } from "expo-linking";
import {
  Host,
  ScrollView,
  Button,
  HStack,
  VStack,
  Spacer,
  Image,
  Text,
  Toggle,
} from "@expo/ui/swift-ui";
import {
  accessibilityHidden,
  accessibilityLabel,
  background,
  buttonStyle,
  clipShape,
  foregroundStyle,
  frame,
  padding,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { useDynamicFont } from "@/lib/dynamic-font";
import { useSymbolSize } from "@/lib/dynamic-symbol-size";
import { Button as ButtonTokens } from "@/constants/layout";

import { haptics } from "@/lib/haptics";
import { useColors } from "@/hooks/use-theme";

export default function PrivacyScreen() {
  const dfont = useDynamicFont();
  const symbolSize = useSymbolSize();
  const colors = useColors();
  const [analyticsEnabled, setAnalyticsEnabled] = useState(true);

  const handleOpenSettings = () => {
    haptics.light();
    openSettings();
  };

  type SFSymbol = NonNullable<ComponentProps<typeof Image>["systemName"]>;

  const rowButton = ({
    testID,
    label,
    systemImage,
    onPress,
    chevron = true,
    trailing,
  }: {
    testID: string;
    label: string;
    systemImage: SFSymbol;
    onPress: () => void;
    chevron?: boolean;
    trailing?: React.ReactNode;
  }) => (
    <Button
      testID={testID}
      modifiers={[
        buttonStyle("plain"),
        frame({ maxWidth: Infinity }),
        background(colors.muted as string),
        clipShape("capsule"),
      ]}
      onPress={onPress}
    >
      <HStack
        spacing={12}
        alignment="center"
        modifiers={[
          frame({ maxWidth: Infinity, minHeight: ButtonTokens.height }),
          padding({ horizontal: 16 }),
        ]}
      >
        <Image
          systemName={systemImage}
          size={symbolSize(18)}
          color={colors.foreground as string}
          modifiers={[accessibilityHidden(true)]}
        />
        <Text
          modifiers={[
            dfont({ size: 16, weight: "medium" }),
            foregroundStyle(colors.foreground as string),
          ]}
        >
          {label}
        </Text>
        <Spacer />
        {trailing ??
          (chevron ? (
            <Image
              systemName="chevron.right"
              size={symbolSize(13)}
              color={colors.mutedForeground as string}
              modifiers={[accessibilityHidden(true)]}
            />
          ) : null)}
      </HStack>
    </Button>
  );

  return (
    <Host testID="privacy-screen" style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView modifiers={[tint(colors.primary as string)]}>
        <VStack
          spacing={12}
          alignment="leading"
          modifiers={[padding({ horizontal: 24, top: 24, bottom: 40 })]}
        >
          <VStack spacing={8} modifiers={[frame({ maxWidth: Infinity })]}>
            {rowButton({
              testID: "privacy-camera-photos",
              label: "Camera & Photos",
              systemImage: "camera.fill",
              onPress: handleOpenSettings,
            })}
            {rowButton({
              testID: "privacy-notifications",
              label: "Notifications",
              systemImage: "bell.fill",
              onPress: handleOpenSettings,
            })}
            {rowButton({
              testID: "privacy-system-settings",
              label: "System Settings",
              systemImage: "gear",
              onPress: handleOpenSettings,
            })}
          </VStack>

          {/* Analytics toggle as a capsule row using native iOS Toggle. */}
          <HStack
            spacing={12}
            alignment="center"
            modifiers={[
              frame({ maxWidth: Infinity, minHeight: ButtonTokens.height }),
              padding({ horizontal: 16 }),
              background(colors.muted as string),
              clipShape("capsule"),
            ]}
          >
            <Image
              systemName="chart.bar.fill"
              size={symbolSize(18)}
              color={colors.foreground as string}
              modifiers={[accessibilityHidden(true)]}
            />
            <Text
              modifiers={[
                dfont({ size: 16, weight: "medium" }),
                foregroundStyle(colors.foreground as string),
              ]}
            >
              Share Analytics
            </Text>
            <Spacer />
            <Toggle
              testID="privacy-share-analytics"
              isOn={analyticsEnabled}
              onIsOnChange={(v) => {
                haptics.selection();
                setAnalyticsEnabled(v);
              }}
              modifiers={[tint(colors.primary as string), accessibilityLabel("Share analytics")]}
            />
          </HStack>

          <Text
            testID="privacy-data-disclaimer"
            modifiers={[
              dfont({ size: 13 }),
              foregroundStyle(colors.mutedForeground as string),
              padding({ horizontal: 8, top: 4 }),
            ]}
          >
            You can request a copy of your data or delete your account at any time from Settings.
          </Text>
        </VStack>
      </ScrollView>
    </Host>
  );
}
