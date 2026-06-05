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
// The value is `Infinity` (SwiftUI's `.frame(maxWidth: .infinity)` fill idiom);
// it survives the @expo/ui modifier bridge intact and is what Expo ships in its
// own ScrollView/BottomSheet and documents in tabview.mdx.
export function ProminentButton({
  label,
  onPress,
  disabled,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  const dfont = useDynamicFont();
  const colors = useColors();
  return (
    <Button
      testID={testID}
      modifiers={[
        buttonStyle("plain"),
        frame({ maxWidth: Infinity }),
        background(colors.primary as string),
        clipShape("capsule"),
        disabledModifier(disabled ?? false),
      ]}
      onPress={onPress}
    >
      <Text
        modifiers={[
          frame({ maxWidth: Infinity, minHeight: ButtonTokens.height }),
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
