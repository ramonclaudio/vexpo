import { router, Stack } from "expo-router";
import { Host, VStack, Text, Spacer, Image } from "@expo/ui/swift-ui";
import {
  foregroundStyle,
  multilineTextAlignment,
  padding,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { useDynamicFont } from "@/lib/dynamic-font";
import { useSymbolSize } from "@/lib/dynamic-symbol-size";
import { ProminentButton } from "@/components/ui/prominent-button";
import { useColors } from "@/hooks/use-theme";

export default function NotFoundScreen() {
  const dfont = useDynamicFont();
  const symbolSize = useSymbolSize();
  const colors = useColors();
  return (
    <>
      <Stack.Header>
        <Stack.Screen.Title>Lost?</Stack.Screen.Title>
      </Stack.Header>
      <Host style={{ flex: 1 }}>
        <VStack
          spacing={20}
          alignment="center"
          modifiers={[padding({ horizontal: 24, vertical: 32 }), tint(colors.primary as string)]}
        >
          <Spacer />
          <Image
            systemName="questionmark.circle"
            size={symbolSize(56)}
            color={colors.mutedForeground as string}
          />
          <Text modifiers={[dfont({ size: 24, weight: "bold" }), multilineTextAlignment("center")]}>
            This page doesn&apos;t exist
          </Text>
          <Text
            modifiers={[
              dfont({ size: 15 }),
              foregroundStyle(colors.mutedForeground as string),
              multilineTextAlignment("center"),
            ]}
          >
            The page you were looking for moved or was never here.
          </Text>
          <ProminentButton label="Take me home" onPress={() => router.replace("/")} />
          <Spacer />
        </VStack>
      </Host>
    </>
  );
}
