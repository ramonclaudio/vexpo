import { type ComponentProps } from "react";
import { HStack, Image, Text } from "@expo/ui/swift-ui";
import { accessibilityHidden, foregroundStyle } from "@expo/ui/swift-ui/modifiers";

import { useDynamicFont } from "@/lib/dynamic-font";
import { Colors } from "@/constants/theme";

type Props = { children: string };
type Tone = {
  icon: ComponentProps<typeof Image>["systemName"];
  color: "destructive" | "success";
};

const ERROR: Tone = { icon: "exclamationmark.triangle.fill", color: "destructive" };
const SUCCESS: Tone = { icon: "checkmark.circle.fill", color: "success" };

function StatusText({ children, tone }: Props & { tone: Tone }) {
  const dfont = useDynamicFont();

  return (
    <HStack spacing={6} alignment="center">
      <Image
        systemName={tone.icon}
        color={Colors[tone.color]}
        modifiers={[dfont({ size: 14 }), accessibilityHidden(true)]}
      />
      <Text modifiers={[dfont({ size: 14 }), foregroundStyle(Colors[tone.color])]}>{children}</Text>
    </HStack>
  );
}

export function ErrorText(props: Props) {
  return <StatusText {...props} tone={ERROR} />;
}

export function SuccessText(props: Props) {
  return <StatusText {...props} tone={SUCCESS} />;
}
