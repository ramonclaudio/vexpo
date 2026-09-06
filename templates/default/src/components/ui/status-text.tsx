import { type ComponentProps } from "react";
import { HStack, Image, Text } from "@expo/ui/swift-ui";
import { accessibilityHidden, foregroundStyle } from "@expo/ui/swift-ui/modifiers";

import { useDynamicFont } from "@/lib/dynamic-font";
import { useColors } from "@/hooks/use-theme";

type Props = { children: string; size?: number; testID?: string };
type Tone = {
  icon: ComponentProps<typeof Image>["systemName"];
  color: "destructive" | "success";
};

const ERROR: Tone = { icon: "exclamationmark.triangle.fill", color: "destructive" };
const SUCCESS: Tone = { icon: "checkmark.circle.fill", color: "success" };

function StatusText({ children, size = 14, testID, tone }: Props & { tone: Tone }) {
  const dfont = useDynamicFont();
  const colors = useColors();

  return (
    <HStack spacing={6} alignment="center">
      <Image
        systemName={tone.icon}
        color={colors[tone.color]}
        modifiers={[dfont({ size }), accessibilityHidden(true)]}
      />
      <Text testID={testID} modifiers={[dfont({ size }), foregroundStyle(colors[tone.color])]}>
        {children}
      </Text>
    </HStack>
  );
}

export function ErrorText(props: Props) {
  return <StatusText {...props} tone={ERROR} />;
}

export function SuccessText(props: Props) {
  return <StatusText {...props} tone={SUCCESS} />;
}
