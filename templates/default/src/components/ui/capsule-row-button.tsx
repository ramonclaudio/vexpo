import { type ComponentProps } from "react";
import { Button, HStack, Image, Spacer, Text } from "@expo/ui/swift-ui";
import {
  accessibilityHidden,
  accessibilityHint,
  accessibilityInputLabels,
  background,
  buttonStyle,
  clipShape,
  contentShape,
  foregroundStyle,
  frame,
  imageScale,
  padding,
  shapes,
} from "@expo/ui/swift-ui/modifiers";

import { useDynamicFont } from "@/lib/dynamic-font";
import { ButtonTokens } from "@/constants/layout";
import { Colors } from "@/constants/theme";

type SFSymbol = NonNullable<ComponentProps<typeof Image>["systemName"]>;

export function CapsuleRowButton({
  label,
  systemImage,
  onPress,
  hint,
  inputLabels,
  role,
}: {
  label: string;
  systemImage: SFSymbol;
  onPress: () => void;
  hint?: string;
  inputLabels?: string[];
  role?: "destructive";
}) {
  const dfont = useDynamicFont();
  const labelColor = role === "destructive" ? Colors.destructive : Colors.foreground;
  const showChevron = role !== "destructive";
  return (
    <Button
      modifiers={[
        buttonStyle("plain"),
        frame({ maxWidth: Infinity }),
        background(Colors.muted),
        clipShape("capsule"),
        ...(hint ? [accessibilityHint(hint)] : []),
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
          // Must sit on the content, not the Button, or the dialog anchor breaks.
          contentShape(shapes.capsule()),
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
            color={Colors.mutedForeground}
            modifiers={[dfont({ size: 16 }), imageScale("small"), accessibilityHidden(true)]}
          />
        ) : null}
      </HStack>
    </Button>
  );
}
