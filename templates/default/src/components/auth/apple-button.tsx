import { useWindowDimensions } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { VStack, RNHostView } from "@expo/ui/swift-ui";
import { frame } from "@expo/ui/swift-ui/modifiers";

import { Button as ButtonTokens } from "@/constants/layout";
import { useColorScheme } from "@/hooks/use-theme";

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
