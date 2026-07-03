import { useEffect } from "react";
import { HStack, Image, Text } from "@expo/ui/swift-ui";
import { accessibilityHidden, foregroundStyle } from "@expo/ui/swift-ui/modifiers";

import { useDynamicFont } from "@/lib/dynamic-font";
import { useColors } from "@/hooks/use-theme";
import { announce } from "@/lib/a11y";

// `attempt` re-fires the announcement when consecutive submits produce the
// identical message: the string dependency alone would stay unchanged and
// VoiceOver would hear nothing on the second failure.
type Props = { children: string; size?: number; testID?: string; attempt?: number };

export function ErrorText({ children, size = 14, testID, attempt }: Props) {
  const dfont = useDynamicFont();
  const colors = useColors();
  useEffect(() => {
    announce(`Error: ${children}`);
  }, [children, attempt]);

  return (
    <HStack spacing={6} alignment="center">
      <Image
        systemName="exclamationmark.triangle.fill"
        color={colors.destructive as string}
        modifiers={[dfont({ size }), accessibilityHidden(true)]}
      />
      <Text
        testID={testID}
        modifiers={[dfont({ size }), foregroundStyle(colors.destructive as string)]}
      >
        {children}
      </Text>
    </HStack>
  );
}

export function SuccessText({ children, size = 14, testID, attempt }: Props) {
  const dfont = useDynamicFont();
  const colors = useColors();
  useEffect(() => {
    announce(`Success: ${children}`);
  }, [children, attempt]);

  return (
    <HStack spacing={6} alignment="center">
      <Image
        systemName="checkmark.circle.fill"
        color={colors.success as string}
        modifiers={[dfont({ size }), accessibilityHidden(true)]}
      />
      <Text
        testID={testID}
        modifiers={[dfont({ size }), foregroundStyle(colors.success as string)]}
      >
        {children}
      </Text>
    </HStack>
  );
}
