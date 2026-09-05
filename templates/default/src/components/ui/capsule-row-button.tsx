import { type ComponentProps } from "react";
import { Button, HStack, Image, Spacer, Text } from "@expo/ui/swift-ui";
import {
  accessibilityHidden,
  accessibilityInputLabels,
  background,
  buttonStyle,
  clipShape,
  foregroundStyle,
  frame,
  imageScale,
  padding,
} from "@expo/ui/swift-ui/modifiers";

import { useDynamicFont } from "@/lib/dynamic-font";
import { Button as ButtonTokens } from "@/constants/layout";
import { useColors } from "@/hooks/use-theme";

type SFSymbol = NonNullable<ComponentProps<typeof Image>["systemName"]>;

export function CapsuleRowButton({
  testID,
  label,
  systemImage,
  onPress,
  inputLabels,
  role,
}: {
  testID: string;
  label: string;
  systemImage: SFSymbol;
  onPress: () => void;
  inputLabels?: string[];
  role?: "destructive";
}) {
  const dfont = useDynamicFont();
  const colors = useColors();
  const labelColor = role === "destructive" ? colors.destructive : colors.foreground;
  const showChevron = role !== "destructive";
  return (
    <Button
      testID={testID}
      modifiers={[
        buttonStyle("plain"),
        frame({ maxWidth: Infinity }),
        background(colors.muted),
        clipShape("capsule"),
        ...(inputLabels ? [accessibilityInputLabels(inputLabels)] : []),
      ]}
      onPress={onPress}
    >
      <HStack
        spacing={12}
        alignment="center"
        modifiers={[
          frame({ maxWidth: Infinity, minHeight: ButtonTokens.height }),
          padding({ horizontal: 16 }),
        ]}
      >
        <Image
          systemName={systemImage}
          color={labelColor}
          modifiers={[dfont({ size: 18 }), accessibilityHidden(true)]}
        />
        <Text modifiers={[dfont({ size: 16, weight: "medium" }), foregroundStyle(labelColor)]}>
          {label}
        </Text>
        <Spacer />
        {showChevron ? (
          <Image
            systemName="chevron.right"
            color={colors.mutedForeground}
            modifiers={[dfont({ size: 16 }), imageScale("small"), accessibilityHidden(true)]}
          />
        ) : null}
      </HStack>
    </Button>
  );
}
