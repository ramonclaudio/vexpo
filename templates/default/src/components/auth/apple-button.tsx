import { useWindowDimensions } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { VStack, RNHostView } from "@expo/ui/swift-ui";
import { frame } from "@expo/ui/swift-ui/modifiers";

import { Button as ButtonTokens } from "@/constants/layout";
import { useColorScheme } from "@/hooks/use-theme";

// Apple sizes `ASAuthorizationAppleIDButton`'s label to the button's frame
// height, not to Dynamic Type, so unlike the rest of the form it won't grow on
// its own. Scale the frame with the user's text size so the label keeps up,
// clamped to [1, MAX_SCALE]: never below the 50pt baseline (HIG minimum size +
// the 44pt touch target hold at small text, matching the other buttons'
// `minHeight` floor), and capped on top because the single-line label is
// width-bound past this point, so a taller button just becomes a slab.
// `cornerRadius` tracks the height to stay an HIG-allowed pill at any size.
const MAX_SCALE = 1.6;

export function AppleButton({
  type,
  onPress,
  disabled,
  testID,
}: {
  type: AppleAuthentication.AppleAuthenticationButtonType;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  const colorScheme = useColorScheme();
  const { fontScale } = useWindowDimensions();
  const height = ButtonTokens.height * Math.min(Math.max(fontScale, 1), MAX_SCALE);
  return (
    <VStack alignment="center" modifiers={[frame({ maxWidth: Infinity, height })]}>
      <RNHostView>
        <AppleAuthentication.AppleAuthenticationButton
          testID={testID}
          buttonType={type}
          buttonStyle={
            colorScheme === "dark"
              ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
              : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
          }
          cornerRadius={height / 2}
          style={{ width: "100%", height: "100%", opacity: disabled ? 0.5 : 1 }}
          onPress={disabled ? () => {} : onPress}
        />
      </RNHostView>
    </VStack>
  );
}
