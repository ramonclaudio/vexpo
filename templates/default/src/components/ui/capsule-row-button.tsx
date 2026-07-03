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

// The capsule settings row: leading SF Symbol, medium label, and a trailing
// chevron. `role="destructive"` paints the label red and drops the chevron.
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
  const labelColor =
    role === "destructive" ? (colors.destructive as string) : (colors.foreground as string);
  const showChevron = role !== "destructive";
  return (
    <Button
      testID={testID}
      modifiers={[
        buttonStyle("plain"),
        frame({ maxWidth: Infinity }),
        background(colors.muted as string),
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
          // upstream expo/expo#46774: imageScale ties the chevron to the row label's Dynamic Type curve
          <Image
            systemName="chevron.right"
            color={colors.mutedForeground as string}
            modifiers={[dfont({ size: 16 }), imageScale("small"), accessibilityHidden(true)]}
          />
        ) : null}
      </HStack>
    </Button>
  );
}
