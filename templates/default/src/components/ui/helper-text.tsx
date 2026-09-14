import { type ComponentProps } from "react";
import { Text } from "@expo/ui/swift-ui";
import { foregroundStyle } from "@expo/ui/swift-ui/modifiers";

import { useDynamicFont } from "@/lib/dynamic-font";
import { Colors } from "@/constants/theme";

export function HelperText({
  children,
  modifiers,
}: {
  children: string;
  modifiers?: ComponentProps<typeof Text>["modifiers"];
}) {
  const dfont = useDynamicFont();
  return (
    <Text
      modifiers={[
        dfont({ size: 13 }),
        foregroundStyle(Colors.mutedForeground),
        ...(modifiers ?? []),
      ]}
    >
      {children}
    </Text>
  );
}
