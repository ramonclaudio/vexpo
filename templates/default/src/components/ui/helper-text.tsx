import { type ComponentProps } from "react";
import { Text } from "@expo/ui/swift-ui";
import { foregroundStyle } from "@expo/ui/swift-ui/modifiers";

import { useDynamicFont } from "@/lib/dynamic-font";
import { useColors } from "@/hooks/use-theme";

export function HelperText({
  children,
  modifiers,
  testID,
}: {
  children: string;
  modifiers?: ComponentProps<typeof Text>["modifiers"];
  testID?: string;
}) {
  const dfont = useDynamicFont();
  const colors = useColors();
  return (
    <Text
      testID={testID}
      modifiers={[
        dfont({ size: 13 }),
        foregroundStyle(colors.mutedForeground),
        ...(modifiers ?? []),
      ]}
    >
      {children}
    </Text>
  );
}
