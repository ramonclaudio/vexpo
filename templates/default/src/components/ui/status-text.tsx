import { type ComponentProps, useEffect } from "react";
import { HStack, Image, Text } from "@expo/ui/swift-ui";
import { accessibilityHidden, foregroundStyle } from "@expo/ui/swift-ui/modifiers";

import { useDynamicFont } from "@/lib/dynamic-font";
import { useColors } from "@/hooks/use-theme";
import { announce } from "@/lib/a11y";

type Props = { children: string; size?: number; testID?: string; attempt?: number };
type Tone = {
  icon: ComponentProps<typeof Image>["systemName"];
  color: "destructive" | "success";
  prefix: string;
};

const ERROR: Tone = {
  icon: "exclamationmark.triangle.fill",
  color: "destructive",
  prefix: "Error",
};
const SUCCESS: Tone = { icon: "checkmark.circle.fill", color: "success", prefix: "Success" };

function StatusText({ children, size = 14, testID, attempt, tone }: Props & { tone: Tone }) {
  const dfont = useDynamicFont();
  const colors = useColors();
  useEffect(() => {
    announce(`${tone.prefix}: ${children}`);
  }, [children, attempt, tone.prefix]);

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
