import { type ComponentProps } from "react";
import { Text } from "@expo/ui/swift-ui";
import { foregroundStyle } from "@expo/ui/swift-ui/modifiers";

import { useDynamicFont } from "@/lib/dynamic-font";
import { useColors } from "@/hooks/use-theme";

// The muted 13pt caption under a form field. Base modifiers come first so
// callers can append their own (e.g. padding to align under a section).
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
        foregroundStyle(colors.mutedForeground as string),
        ...(modifiers ?? []),
      ]}
    >
      {children}
    </Text>
  );
}
