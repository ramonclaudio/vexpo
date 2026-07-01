import { useEffect } from "react";
import { AccessibilityInfo } from "react-native";
import { HStack, Image, Text } from "@expo/ui/swift-ui";
import { accessibilityHidden, foregroundStyle } from "@expo/ui/swift-ui/modifiers";

import { useDynamicFont } from "@/lib/dynamic-font";
import { Colors } from "@/constants/theme";

type Props = { children: string; size?: number; testID?: string };

function announce(prefix: string, message: string) {
  AccessibilityInfo.announceForAccessibility(`${prefix}: ${message}`);
}

export function ErrorText({ children, size = 14, testID }: Props) {
  const dfont = useDynamicFont();
  useEffect(() => {
    announce("Error", children);
  }, [children]);

  return (
    <HStack spacing={6} alignment="center">
      <Image
        systemName="exclamationmark.triangle.fill"
        color={Colors.destructive as string}
        modifiers={[dfont({ size }), accessibilityHidden(true)]}
      />
      <Text
        testID={testID}
        modifiers={[dfont({ size }), foregroundStyle(Colors.destructive as string)]}
      >
        {children}
      </Text>
    </HStack>
  );
}

export function SuccessText({ children, size = 14, testID }: Props) {
  const dfont = useDynamicFont();
  useEffect(() => {
    announce("Success", children);
  }, [children]);

  return (
    <HStack spacing={6} alignment="center">
      <Image
        systemName="checkmark.circle.fill"
        color={Colors.success as string}
        modifiers={[dfont({ size }), accessibilityHidden(true)]}
      />
      <Text
        testID={testID}
        modifiers={[dfont({ size }), foregroundStyle(Colors.success as string)]}
      >
        {children}
      </Text>
    </HStack>
  );
}
