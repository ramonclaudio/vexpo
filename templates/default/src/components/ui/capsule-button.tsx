import { Button, Text } from "@expo/ui/swift-ui";
import {
  accessibilityInputLabels,
  background,
  buttonStyle,
  clipShape,
  contentShape,
  disabled as disabledModifier,
  foregroundStyle,
  frame,
  multilineTextAlignment,
  shapes,
} from "@expo/ui/swift-ui/modifiers";

import { ButtonTokens, TouchTarget } from "@/constants/layout";
import { Colors } from "@/constants/theme";
import { useDynamicFont } from "@/lib/dynamic-font";

type CapsuleButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
  filled?: boolean;
  inputLabels?: string[];
};

function CapsuleButton({
  variant,
  label,
  onPress,
  disabled,
  destructive,
  filled = true,
  inputLabels,
}: CapsuleButtonProps & { variant: "prominent" | "secondary" }) {
  const dfont = useDynamicFont();
  const prominent = variant === "prominent";
  const fill = prominent ? Colors.primary : Colors.muted;
  return (
    <Button
      modifiers={[
        buttonStyle("plain"),
        frame({ maxWidth: Infinity }),
        ...(filled ? [background(fill)] : []),
        clipShape("capsule"),
        // Prominent always emits .disabled() so it never inherits an ancestor's.
        ...(prominent
          ? [disabledModifier(disabled ?? false)]
          : disabled === undefined
            ? []
            : [disabledModifier(disabled)]),
        ...(inputLabels ? [accessibilityInputLabels(inputLabels)] : []),
      ]}
      onPress={onPress}
    >
      <Text
        modifiers={[
          frame({ maxWidth: Infinity, minHeight: ButtonTokens.height }),
          contentShape(shapes.capsule()),
          multilineTextAlignment("center"),
          dfont({
            size: ButtonTokens.fontSize,
            weight: prominent ? ButtonTokens.fontWeight : ButtonTokens.secondaryFontWeight,
          }),
          foregroundStyle(
            prominent
              ? Colors.primaryForeground
              : destructive
                ? Colors.destructive
                : Colors.foreground,
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

export function PlainButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const dfont = useDynamicFont();
  return (
    <Button
      label={label}
      modifiers={[
        buttonStyle("plain"),
        foregroundStyle(Colors.mutedForeground),
        dfont({ size: 14, weight: "semibold" }),
        frame({ minHeight: TouchTarget.min }),
        contentShape(shapes.rectangle()),
        ...(disabled === undefined ? [] : [disabledModifier(disabled)]),
      ]}
      onPress={onPress}
    />
  );
}
