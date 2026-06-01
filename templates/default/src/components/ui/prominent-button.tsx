import { Button, Text } from "@expo/ui/swift-ui";
import {
  background,
  buttonStyle,
  clipShape,
  disabled as disabledModifier,
  foregroundStyle,
  frame,
  multilineTextAlignment,
} from "@expo/ui/swift-ui/modifiers";

import { useDynamicFont } from "@/lib/dynamic-font";
import { Button as ButtonTokens } from "@/constants/layout";
import { useColors } from "@/hooks/use-theme";

// Why this isn't `buttonStyle("borderedProminent")`:
// SwiftUI's borderedProminent paints the bg with the tint color but hardcodes
// the label foreground to `.white`. Our shadcn `primary` is near-white in dark
// mode (n200) and near-black in light mode (n900). Pairing borderedProminent
// with that tint gives white-on-white in dark mode. To honor the shadcn
// neutral palette in both schemes we paint the bg ourselves and set the label
// to `primaryForeground` (the true contrast color).
//
// Why frame is on the Text, not the Button:
// SwiftUI's Button label is content-sized. `frame(maxWidth:.infinity)` on the
// Button itself wraps the styled button in an invisible flex frame without
// expanding it. Putting the frame on the LABEL inside the button is the fix.
//
// Why 10000 instead of Infinity:
// `Infinity` serialized through the @expo/ui modifier bridge gets ignored by
// the SwiftUI button's content-sizing logic, leaving the button content-sized.
// A large finite number behaves as effectively infinite (capped by the parent
// VStack's available width) and is honored by the bridge.
export function ProminentButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const dfont = useDynamicFont();
  const colors = useColors();
  return (
    <Button
      modifiers={[
        buttonStyle("plain"),
        frame({ maxWidth: 10000 }),
        background(colors.primary as string),
        clipShape("capsule"),
        disabledModifier(disabled ?? false),
      ]}
      onPress={onPress}
    >
      <Text
        modifiers={[
          frame({ maxWidth: 10000, height: ButtonTokens.height }),
          multilineTextAlignment("center"),
          dfont({ size: ButtonTokens.fontSize, weight: ButtonTokens.fontWeight }),
          foregroundStyle(colors.primaryForeground as string),
        ]}
      >
        {label}
      </Text>
    </Button>
  );
}
