import { Text } from "@expo/ui/swift-ui";
import { accessibilityAddTraits, foregroundStyle, padding } from "@expo/ui/swift-ui/modifiers";

import { useDynamicFont } from "@/lib/dynamic-font";
import { useColors } from "@/hooks/use-theme";

// The uppercase muted caption above a settings or search section.
export function SectionLabel({ children }: { children: string }) {
  const dfont = useDynamicFont();
  const colors = useColors();
  return (
    <Text
      modifiers={[
        dfont({ size: 13, weight: "semibold" }),
        foregroundStyle(colors.mutedForeground as string),
        padding({ horizontal: 8, top: 4 }),
        // upstream expo/expo#47387: a plain Text carries no header semantics,
        // so without the trait the VoiceOver Headings rotor skips the section.
        accessibilityAddTraits(["isHeader"]),
      ]}
    >
      {children}
    </Text>
  );
}
