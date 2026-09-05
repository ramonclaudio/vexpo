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

import { Button as ButtonTokens } from "@/constants/layout";
import { useColors } from "@/hooks/use-theme";
import { useDynamicFont } from "@/lib/dynamic-font";

type CapsuleButtonProps = {
  label: string;
  onPress: () => void;
  testID?: string;
  disabled?: boolean;
  destructive?: boolean;
  filled?: boolean;
  inputLabels?: string[];
};

function CapsuleButton({
  variant,
  label,
  onPress,
  testID,
  disabled,
  destructive,
  filled = true,
  inputLabels,
}: CapsuleButtonProps & { variant: "prominent" | "secondary" }) {
  const dfont = useDynamicFont();
  const colors = useColors();
  const prominent = variant === "prominent";
  const fill = prominent ? colors.primary : colors.muted;
  return (
    <Button
      testID={testID}
      modifiers={[
        buttonStyle("plain"),
        frame({ maxWidth: Infinity }),
        ...(filled ? [background(fill)] : []),
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
          dfont({
            size: ButtonTokens.fontSize,
            weight: prominent ? ButtonTokens.fontWeight : ButtonTokens.secondaryFontWeight,
          }),
          foregroundStyle(
            prominent
              ? colors.primaryForeground
              : destructive
                ? colors.destructive
                : colors.foreground,
          ),
        ]}
      >
        {label}
      </Text>
    </Button>
  );
}

export const ProminentButton = (props: CapsuleButtonProps) => (
  <CapsuleButton variant="prominent" {...props} />
);

export const SecondaryButton = (props: CapsuleButtonProps) => (
  <CapsuleButton variant="secondary" {...props} />
);
