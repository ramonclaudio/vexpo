import { Button, Text } from "@expo/ui/swift-ui";
import {
  background,
  buttonStyle,
  clipShape,
  disabled as disabledModifier,
  foregroundStyle,
  frame,
  multilineTextAlignment,
} from "@expo/ui/swift-ui/modifiers";

import { useDynamicFont } from "@/lib/dynamic-font";
import { Button as ButtonTokens } from "@/constants/layout";
import { useColors } from "@/hooks/use-theme";

export function ProminentButton({
  label,
  onPress,
  disabled,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  const dfont = useDynamicFont();
  const colors = useColors();
  return (
    <Button
      testID={testID}
      modifiers={[
        buttonStyle("plain"),
        frame({ maxWidth: Infinity }),
        background(colors.primary),
        clipShape("capsule"),
        disabledModifier(disabled ?? false),
      ]}
      onPress={onPress}
    >
      <Text
        modifiers={[
          frame({ maxWidth: Infinity, minHeight: ButtonTokens.height }),
          multilineTextAlignment("center"),
          dfont({ size: ButtonTokens.fontSize, weight: ButtonTokens.fontWeight }),
          foregroundStyle(colors.primaryForeground),
        ]}
      >
        {label}
      </Text>
    </Button>
  );
}
