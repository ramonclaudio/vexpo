import { useEffect } from "react";
import { AccessibilityInfo } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, type ErrorBoundaryProps } from "expo-router";
import { Host, ScrollView, VStack, Text, Button, Image } from "@expo/ui/swift-ui";
import {
  accessibilityHidden,
  foregroundStyle,
  buttonStyle,
  frame,
  padding,
  multilineTextAlignment,
  dynamicTypeSize,
  defaultScrollAnchor,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { useDynamicFont } from "@/lib/dynamic-font";
import { accessibilityAddTraits } from "@/lib/ui-traits";
import { ProminentButton } from "@/components/ui/prominent-button";
import { useColors } from "@/hooks/use-theme";
import { TouchTarget } from "@/constants/layout";
import { DynamicType } from "@/constants/ui";

export function AppErrorBoundary({
  error,
  retry,
  testID,
}: ErrorBoundaryProps & { testID?: string }) {
  const dfont = useDynamicFont();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  // VoiceOver users won't notice the visual change to a destructive surface
  // unless we explicitly announce. Fires once on mount per crash. Logging the
  // error here too keeps it off the render path: a mounted boundary re-renders
  // on theme/fontScale changes, and a render-body log would re-fire each time.
  useEffect(() => {
    if (__DEV__) console.error("[ErrorBoundary]", error);
    AccessibilityInfo.announceForAccessibility("Error: something went wrong");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Host style={{ flex: 1 }}>
      <ScrollView modifiers={[defaultScrollAnchor("center")]}>
        <VStack
          spacing={20}
          alignment="center"
          modifiers={[
            frame({ maxWidth: Infinity }),
            padding({ horizontal: 24, top: insets.top + 32, bottom: insets.bottom + 32 }),
            tint(colors.primary as string),
          ]}
        >
          <Image
            systemName="exclamationmark.triangle"
            color={colors.destructive as string}
            modifiers={[
              dfont({ size: 72 }),
              dynamicTypeSize({ max: DynamicType.control }),
              accessibilityHidden(true),
            ]}
          />
          <Text
            modifiers={[
              dfont({ size: 28, weight: "bold" }),
              multilineTextAlignment("center"),
              accessibilityAddTraits(["isHeader"]),
            ]}
          >
            Something went wrong
          </Text>
          <Text
            testID={testID}
            modifiers={[
              dfont({ size: 16 }),
              foregroundStyle(colors.mutedForeground as string),
              multilineTextAlignment("center"),
            ]}
          >
            Don&apos;t worry. Let&apos;s get you back on track.
          </Text>
          <VStack spacing={12} modifiers={[frame({ maxWidth: Infinity })]}>
            <ProminentButton testID="error-boundary-retry" label="Try Again" onPress={retry} />
            <Button
              testID="error-boundary-home"
              label="Go Home"
              modifiers={[
                buttonStyle("plain"),
                dfont({ size: 16, weight: "medium" }),
                foregroundStyle(colors.mutedForeground as string),
                frame({ minHeight: TouchTarget.min }),
              ]}
              onPress={() => router.replace("/")}
            />
          </VStack>
        </VStack>
      </ScrollView>
    </Host>
  );
}
