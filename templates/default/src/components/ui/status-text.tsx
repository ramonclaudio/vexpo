import { useEffect } from "react";
import { AccessibilityInfo } from "react-native";
import { HStack, Image, Text } from "@expo/ui/swift-ui";
import { accessibilityLabel, foregroundStyle } from "@expo/ui/swift-ui/modifiers";

import { useDynamicFont } from "@/lib/dynamic-font";
import { useSymbolSize } from "@/lib/dynamic-symbol-size";
import { Colors } from "@/constants/theme";

type Props = { children: string; size?: number };

function announce(prefix: string, message: string) {
  AccessibilityInfo.announceForAccessibility(`${prefix}: ${message}`);
}

export function ErrorText({ children, size = 14 }: Props) {
  const dfont = useDynamicFont();
  const symbolSize = useSymbolSize();
  useEffect(() => {
    announce("Error", children);
  }, [children]);

  return (
    <HStack spacing={6} alignment="center">
      <Image
        systemName="exclamationmark.triangle.fill"
        size={symbolSize(size)}
        color={Colors.destructive as string}
        modifiers={[accessibilityLabel("")]}
      />
      <Text modifiers={[dfont({ size }), foregroundStyle(Colors.destructive as string)]}>
        {children}
      </Text>
    </HStack>
  );
}

export function SuccessText({ children, size = 14 }: Props) {
  const dfont = useDynamicFont();
  const symbolSize = useSymbolSize();
  useEffect(() => {
    announce("Success", children);
  }, [children]);

  return (
    <HStack spacing={6} alignment="center">
      <Image
        systemName="checkmark.circle.fill"
        size={symbolSize(size)}
        color={Colors.success as string}
        modifiers={[accessibilityLabel("")]}
      />
      <Text modifiers={[dfont({ size }), foregroundStyle(Colors.success as string)]}>
        {children}
      </Text>
    </HStack>
  );
}
