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
import { Colors } from "@/constants/theme";
import { TouchTarget } from "@/constants/layout";
import { DynamicType } from "@/constants/ui";

export function AppErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const dfont = useDynamicFont();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (__DEV__) console.error("[ErrorBoundary]", error);
    announce("Error: something went wrong");
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
            tint(Colors.primary),
          ]}
        >
          <Image
            systemName="exclamationmark.triangle"
            color={Colors.destructive}
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
            modifiers={[
              dfont({ size: 16 }),
              foregroundStyle(Colors.mutedForeground),
              multilineTextAlignment("center"),
            ]}
          >
            Try again, or go back home.
          </Text>
          <VStack spacing={12} modifiers={[frame({ maxWidth: Infinity })]}>
            <ProminentButton label="Try Again" onPress={retry} />
            <Button
              label="Go Home"
              modifiers={[
                buttonStyle("plain"),
                dfont({ size: 16, weight: "medium" }),
                foregroundStyle(Colors.mutedForeground),
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
