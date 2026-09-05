import { useEffect } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, type ErrorBoundaryProps } from "expo-router";
import { Host, ScrollView, VStack, Text, Button, Image } from "@expo/ui/swift-ui";
import {
  accessibilityAddTraits,
  accessibilityHidden,
  foregroundStyle,
  buttonStyle,
  contentShape,
  frame,
  padding,
  shapes,
  multilineTextAlignment,
  dynamicTypeSize,
  defaultScrollAnchor,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { announce } from "@/lib/a11y";
import { useDynamicFont } from "@/lib/dynamic-font";
import { ProminentButton } from "@/components/ui/capsule-button";
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

  useEffect(() => {
    if (__DEV__) console.error("[ErrorBoundary]", error);
    announce("Error: something went wrong");
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
            tint(colors.primary),
          ]}
        >
          <Image
            systemName="exclamationmark.triangle"
            color={colors.destructive}
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
              foregroundStyle(colors.mutedForeground),
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
                foregroundStyle(colors.mutedForeground),
                frame({ minHeight: TouchTarget.min }),
                contentShape(shapes.rectangle()),
              ]}
              onPress={() => router.replace("/")}
            />
          </VStack>
        </VStack>
      </ScrollView>
    </Host>
  );
}
