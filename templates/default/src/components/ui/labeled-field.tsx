import { type ComponentProps, type ReactNode } from "react";
import { Text, VStack } from "@expo/ui/swift-ui";
import { frame } from "@expo/ui/swift-ui/modifiers";

import { useDynamicFont } from "@/lib/dynamic-font";

export function LabeledField({
  label,
  children,
  modifiers,
}: {
  label: string;
  children: ReactNode;
  modifiers?: ComponentProps<typeof VStack>["modifiers"];
}) {
  const dfont = useDynamicFont();
  return (
    <VStack
      spacing={6}
      alignment="leading"
      modifiers={[frame({ maxWidth: Infinity }), ...(modifiers ?? [])]}
    >
      <Text modifiers={[dfont({ size: 17, weight: "semibold" })]}>{label}</Text>
      {children}
    </VStack>
  );
}
