import { type ComponentProps } from "react";
import { TextField } from "@expo/ui/swift-ui";
import { background, clipShape, frame, padding, textFieldStyle } from "@expo/ui/swift-ui/modifiers";

import { useDynamicFont } from "@/lib/dynamic-font";
import { Button as ButtonTokens } from "@/constants/layout";
import { useColors } from "@/hooks/use-theme";

// The capsule field look shared by every auth and profile form. Base modifiers
// come first so callers can append field-specific ones (keyboardType, a11y,
// a larger monospaced font for OTP) that override where they overlap.
export function CapsuleTextField({ modifiers, ...props }: ComponentProps<typeof TextField>) {
  const dfont = useDynamicFont();
  const colors = useColors();
  return (
    <TextField
      {...props}
      modifiers={[
        textFieldStyle("plain"),
        padding({ horizontal: 16 }),
        frame({ maxWidth: Infinity, minHeight: ButtonTokens.height }),
        background(colors.muted as string),
        clipShape("capsule"),
        dfont({ size: 16 }),
        ...(modifiers ?? []),
      ]}
    />
  );
}
