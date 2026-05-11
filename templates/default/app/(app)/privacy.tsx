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
  background,
  buttonStyle,
  clipShape,
  foregroundStyle,
  frame,
  padding,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { useDynamicFont } from "@/lib/dynamic-font";
import { Button as ButtonTokens } from "@/constants/layout";

import { haptics } from "@/lib/haptics";
import { useColors } from "@/hooks/use-theme";

export default function PrivacyScreen() {
  const dfont = useDynamicFont();
  const colors = useColors();
  const [analyticsEnabled, setAnalyticsEnabled] = useState(true);

  const handleOpenSettings = () => {
    haptics.light();
    openSettings();
  };

  type SFSymbol = NonNullable<ComponentProps<typeof Image>["systemName"]>;

  const rowButton = ({
    label,
    systemImage,
    onPress,
    chevron = true,
    trailing,
  }: {
    label: string;
    systemImage: SFSymbol;
    onPress: () => void;
    chevron?: boolean;
    trailing?: React.ReactNode;
  }) => (
    <Button
      modifiers={[
        buttonStyle("plain"),
        frame({ maxWidth: 10000 }),
        background(colors.muted as string),
        clipShape("capsule"),
      ]}
      onPress={onPress}
    >
      <HStack
        spacing={12}
        alignment="center"
        modifiers={[
          frame({ maxWidth: 10000, height: ButtonTokens.height }),
          padding({ horizontal: 16 }),
        ]}
      >
        <Image systemName={systemImage} size={18} color={colors.foreground as string} />
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
            <Image systemName="chevron.right" size={13} color={colors.mutedForeground as string} />
          ) : null)}
      </HStack>
    </Button>
  );

  return (
    <Host style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView modifiers={[tint(colors.primary as string)]}>
        <VStack
          spacing={12}
          alignment="leading"
          modifiers={[padding({ horizontal: 24, top: 24, bottom: 40 })]}
        >
          <VStack spacing={8} modifiers={[frame({ maxWidth: Infinity })]}>
            {rowButton({
              label: "Camera & Photos",
              systemImage: "camera.fill",
              onPress: handleOpenSettings,
            })}
            {rowButton({
              label: "Notifications",
              systemImage: "bell.fill",
              onPress: handleOpenSettings,
            })}
            {rowButton({
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
              frame({ maxWidth: 10000, height: ButtonTokens.height }),
              padding({ horizontal: 16 }),
              background(colors.muted as string),
              clipShape("capsule"),
            ]}
          >
            <Image systemName="chart.bar.fill" size={18} color={colors.foreground as string} />
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
              isOn={analyticsEnabled}
              onIsOnChange={(v) => {
                haptics.selection();
                setAnalyticsEnabled(v);
              }}
              modifiers={[tint(colors.primary as string)]}
            />
          </HStack>

          <Text
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
