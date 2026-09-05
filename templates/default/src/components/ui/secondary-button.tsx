import { Button, Text } from "@expo/ui/swift-ui";
import {
  accessibilityInputLabels,
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

export function SecondaryButton({
  label,
  onPress,
  testID,
  disabled,
  destructive,
  filled = true,
  inputLabels,
}: {
  label: string;
  onPress: () => void;
  testID?: string;
  disabled?: boolean;
  destructive?: boolean;
  filled?: boolean;
  inputLabels?: string[];
}) {
  const dfont = useDynamicFont();
  const colors = useColors();
  return (
    <Button
      testID={testID}
      modifiers={[
        buttonStyle("plain"),
        frame({ maxWidth: Infinity }),
        ...(filled ? [background(colors.muted)] : []),
        clipShape("capsule"),
        ...(disabled === undefined ? [] : [disabledModifier(disabled)]),
        ...(inputLabels ? [accessibilityInputLabels(inputLabels)] : []),
      ]}
      onPress={onPress}
    >
      <Text
        modifiers={[
          frame({ maxWidth: Infinity, minHeight: ButtonTokens.height }),
          multilineTextAlignment("center"),
          dfont({ size: ButtonTokens.fontSize, weight: ButtonTokens.secondaryFontWeight }),
          foregroundStyle(destructive ? colors.destructive : colors.foreground),
        ]}
      >
        {label}
      </Text>
    </Button>
  );
}
