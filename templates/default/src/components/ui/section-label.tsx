import { Text } from "@expo/ui/swift-ui";
import { accessibilityAddTraits, foregroundStyle, padding } from "@expo/ui/swift-ui/modifiers";

import { useDynamicFont } from "@/lib/dynamic-font";
import { Colors } from "@/constants/theme";

export function SectionLabel({ children }: { children: string }) {
  const dfont = useDynamicFont();
  return (
    <Text
      modifiers={[
        dfont({ size: 13, weight: "semibold" }),
        foregroundStyle(Colors.mutedForeground),
        padding({ horizontal: 8, top: 4 }),
        accessibilityAddTraits(["isHeader"]),
      ]}
    >
      {children}
    </Text>
  );
}
