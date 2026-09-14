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
import { ButtonTokens } from "@/constants/layout";
import { Colors } from "@/constants/theme";

type SFSymbol = NonNullable<ComponentProps<typeof Image>["systemName"]>;

export function CapsuleToggleRow({
  systemImage,
  label,
  value,
  onChange,
}: {
  systemImage: SFSymbol;
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const dfont = useDynamicFont();
  return (
    <HStack
      spacing={12}
      alignment="center"
      modifiers={[
        frame({ maxWidth: Infinity, minHeight: ButtonTokens.height }),
        padding({ horizontal: 16 }),
        background(Colors.muted),
        clipShape("capsule"),
      ]}
    >
      <Image
        systemName={systemImage}
        color={Colors.foreground}
        modifiers={[dfont({ size: 18 }), accessibilityHidden(true)]}
      />
      <Text
        modifiers={[
          dfont({ size: 16, weight: "medium" }),
          foregroundStyle(Colors.foreground),
          accessibilityHidden(true),
        ]}
      >
        {label}
      </Text>
      <Spacer />
      <Toggle
        isOn={value}
        onIsOnChange={onChange}
        modifiers={[tint(Colors.primary), accessibilityLabel(label)]}
      />
    </HStack>
  );
}
