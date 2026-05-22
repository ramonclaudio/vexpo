import { useEffect } from "react";
import { AccessibilityInfo } from "react-native";
import { router, type ErrorBoundaryProps } from "expo-router";
import { Host, VStack, Text, Button, Image, Spacer } from "@expo/ui/swift-ui";
import {
  foregroundStyle,
  buttonStyle,
  frame,
  padding,
  multilineTextAlignment,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { useDynamicFont } from "@/lib/dynamic-font";
import { useSymbolSize } from "@/lib/dynamic-symbol-size";
import { ProminentButton } from "@/components/ui/prominent-button";
import { useColors } from "@/hooks/use-theme";

export function AppErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const dfont = useDynamicFont();
  const symbolSize = useSymbolSize();
  const colors = useColors();
  console.error("[ErrorBoundary]", error);

  // VoiceOver users won't notice the visual change to a destructive surface
  // unless we explicitly announce. Fires once on mount per crash.
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility("Error: something went wrong");
  }, []);

  return (
    <Host style={{ flex: 1 }}>
      <VStack
        spacing={20}
        alignment="center"
        modifiers={[padding({ horizontal: 24, vertical: 32 }), tint(colors.primary as string)]}
      >
        <Spacer />
        <Image
          systemName="exclamationmark.triangle"
          size={symbolSize(72)}
          color={colors.destructive as string}
        />
        <Text modifiers={[dfont({ size: 28, weight: "bold" }), multilineTextAlignment("center")]}>
          Something went wrong
        </Text>
        <Text
          modifiers={[
            dfont({ size: 16 }),
            foregroundStyle(colors.mutedForeground as string),
            multilineTextAlignment("center"),
          ]}
        >
          Don&apos;t worry. Let&apos;s get you back on track.
        </Text>
        <VStack spacing={12} modifiers={[frame({ maxWidth: Infinity })]}>
          <ProminentButton label="Try Again" onPress={retry} />
          <Button
            label="Go Home"
            modifiers={[buttonStyle("plain"), foregroundStyle(colors.mutedForeground as string)]}
            onPress={() => router.replace("/")}
          />
        </VStack>
        <Spacer />
      </VStack>
    </Host>
  );
}
