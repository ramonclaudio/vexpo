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
import { Button as ButtonTokens } from "@/constants/layout";
import { useColors } from "@/hooks/use-theme";

type SFSymbol = NonNullable<ComponentProps<typeof Image>["systemName"]>;

export function CapsuleRowButton({
  testID,
  label,
  systemImage,
  onPress,
  hint,
  inputLabels,
  role,
}: {
  testID: string;
  label: string;
  systemImage: SFSymbol;
  onPress: () => void;
  // What the row does when the label alone doesn't say, which is every row
  // that leaves the app.
  hint?: string;
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
          // After the frame and the padding, so the shape is the row you see
          // rather than what the label alone measures. It sits on the content
          // and not the Button, because a confirmation dialog anchors to the
          // Button's own frame.
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
            color={colors.mutedForeground}
            modifiers={[dfont({ size: 16 }), imageScale("small"), accessibilityHidden(true)]}
          />
        ) : null}
      </HStack>
    </Button>
  );
}
