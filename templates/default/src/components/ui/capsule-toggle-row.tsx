import { type ComponentProps } from "react";
import { HStack, Image, Spacer, Text, Toggle } from "@expo/ui/swift-ui";
import {
  accessibilityHidden,
  accessibilityLabel,
  background,
  clipShape,
  foregroundStyle,
  frame,
  padding,
  tint,
} from "@expo/ui/swift-ui/modifiers";

import { useDynamicFont } from "@/lib/dynamic-font";
import { Button as ButtonTokens } from "@/constants/layout";
import { useColors } from "@/hooks/use-theme";

type SFSymbol = NonNullable<ComponentProps<typeof Image>["systemName"]>;

// A capsule row with a leading SF Symbol, a medium label, and a trailing native
// Toggle. The visual label is hidden from VoiceOver since the labeled Toggle
// already announces it. `a11yLabel` defaults to `label`.
export function CapsuleToggleRow({
  testID,
  icon,
  label,
  value,
  onChange,
  a11yLabel,
}: {
  testID: string;
  icon: SFSymbol;
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  a11yLabel?: string;
}) {
  const dfont = useDynamicFont();
  const colors = useColors();
  return (
    <HStack
      spacing={12}
      alignment="center"
      modifiers={[
        frame({ maxWidth: Infinity, minHeight: ButtonTokens.height }),
        padding({ horizontal: 16 }),
        background(colors.muted as string),
        clipShape("capsule"),
      ]}
    >
      <Image
        systemName={icon}
        color={colors.foreground as string}
        modifiers={[dfont({ size: 18 }), accessibilityHidden(true)]}
      />
      <Text
        modifiers={[
          dfont({ size: 16, weight: "medium" }),
          foregroundStyle(colors.foreground as string),
          accessibilityHidden(true),
        ]}
      >
        {label}
      </Text>
      <Spacer />
      <Toggle
        testID={testID}
        isOn={value}
        onIsOnChange={onChange}
        modifiers={[tint(colors.primary as string), accessibilityLabel(a11yLabel ?? label)]}
      />
    </HStack>
  );
}
