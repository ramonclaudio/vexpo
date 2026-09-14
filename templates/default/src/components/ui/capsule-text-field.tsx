import { type ComponentProps } from "react";
import { TextField } from "@expo/ui/swift-ui";
import { background, clipShape, frame, padding, textFieldStyle } from "@expo/ui/swift-ui/modifiers";

import { useDynamicFont } from "@/lib/dynamic-font";
import { ButtonTokens } from "@/constants/layout";
import { Colors } from "@/constants/theme";

export type TextFieldState = NonNullable<ComponentProps<typeof TextField>["text"]>;

export function CapsuleTextField({ modifiers, ...props }: ComponentProps<typeof TextField>) {
  const dfont = useDynamicFont();
  return (
    <TextField
      {...props}
      modifiers={[
        textFieldStyle("plain"),
        padding({ horizontal: 16 }),
        frame({ maxWidth: Infinity, minHeight: ButtonTokens.height }),
        background(Colors.muted),
        clipShape("capsule"),
        dfont({ size: 16 }),
        ...(modifiers ?? []),
      ]}
    />
  );
}
